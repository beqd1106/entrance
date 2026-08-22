/**
 * ws.mjs - オンライン対局の中継（API Gateway WebSocket）
 *
 * サーバは「順番を決めて配る係」に徹する。
 * 対局そのものは各端末の engine が進める。全員が同じ種と同じ行動列を
 * 同じ順で受け取るので、どの端末でも局面は必ず一致する。
 *
 * 費用を壊さないための決まり
 *   - 同時に開ける部屋は MAX_ROOMS まで。超えたら新規作成を断る
 *   - 部屋も接続の記録も TTL で自動的に消える（掃除を人手に頼らない）
 *   - 1日のメッセージ数に硬い天井を置き、超えたらその日は新規対局を断る
 *
 * 詳しくは docs/11_オンライン対戦.md を参照。
 */
import {
  getItem, putItem, putIfAbsent, updateFields, queryPk, bump, underGlobalDailyLimit,
} from './lib/db.mjs';
import { signedFetch } from './lib/sign.mjs';

const REGION = process.env.AWS_REGION || 'ap-northeast-1';
const MAX_ROOMS = Number(process.env.MAX_ROOMS || 20);
const DAILY_WS = Number(process.env.DAILY_WS || 200000);
const ROOM_TTL_SEC = 60 * 60 * 2;      // 部屋は2時間で消える
const MAX_SEATS = 4;
const MAX_NAME = 12;
const MAX_PATCH = 20000;               // 自作ルールを持ち込むときの上限（文字数）

const ttl = () => Math.floor(Date.now() / 1000) + ROOM_TTL_SEC;

export const handler = async (event) => {
  const ctx = event?.requestContext || {};
  const route = ctx.routeKey;
  const connId = ctx.connectionId;
  try {
    if (route === '$connect') return { statusCode: 200 };
    if (route === '$disconnect') return await onDisconnect(connId);
    return await onMessage(ctx, connId, event.body);
  } catch (e) {
    console.error('ws error', route, e);
    return { statusCode: 200 };   // 接続は切らない。切ると再接続で余計に呼ばれる
  }
};

// ---------------------------------------------------------------------------
// 送信
// ---------------------------------------------------------------------------
const endpointOf = (ctx) => `https://${ctx.domainName}/${ctx.stage}`;

/** 1人へ送る。相手が居なくなっていたら黙って捨てる（消えた接続は珍しくない） */
async function post(ctx, connId, obj) {
  const url = `${endpointOf(ctx)}/@connections/${encodeURIComponent(connId)}`;
  const r = await signedFetch({
    service: 'execute-api', region: REGION, method: 'POST', url,
    body: JSON.stringify(obj), headers: { 'content-type': 'application/json' },
  });
  // 410 は相手が既に切れているだけなので放っておく。それ以外は原因を残す。
  if (!r.ok && r.status !== 410) console.error('post failed', r.status, r.text.slice(0, 300));
  return r.ok;
}

/** 部屋の全員へ送る */
async function broadcast(ctx, room, obj) {
  const conns = (room.seats || []).map((s) => s && s.connId).filter(Boolean);
  await Promise.all(conns.map((c) => post(ctx, c, obj).catch(() => false)));
}

const fail = (ctx, connId, message) => post(ctx, connId, { type: 'error', message });

// ---------------------------------------------------------------------------
// 受信
// ---------------------------------------------------------------------------
async function onMessage(ctx, connId, body) {
  let msg = null;
  try { msg = JSON.parse(body || '{}'); } catch { msg = null; }
  if (!msg || typeof msg.type !== 'string') return { statusCode: 200 };

  // 全体の天井。ここを超えたら、その日は新しい動きを受け付けない。
  if (!(await underGlobalDailyLimit('ws', DAILY_WS))) {
    await fail(ctx, connId, '本日のオンライン対戦の上限に達しました。時間をおいてお試しください。');
    return { statusCode: 200 };
  }

  switch (msg.type) {
    case 'create': return createRoom(ctx, connId, msg);
    case 'join': return joinRoom(ctx, connId, msg);
    case 'start': return startRoom(ctx, connId, msg);
    case 'act': return pushAct(ctx, connId, msg);
    case 'resync': return resync(ctx, connId, msg);
    case 'leave': return onDisconnect(connId, ctx);
    case 'ping': await post(ctx, connId, { type: 'pong' }); return { statusCode: 200 };
    default: return { statusCode: 200 };
  }
}

const roomKey = (no) => `ROOM#${no}`;
const clean = (v, max) => String(v == null ? '' : v).slice(0, max);

/** 部屋番号。読み上げやすいよう4桁 */
const roomNumber = () => String(Math.floor(Math.random() * 10000)).padStart(4, '0');

/** 席と名前だけを取り出す（接続idは配らない） */
const publicRoom = (room) => ({
  no: room.no, n: room.n, state: room.state, host: room.hostSeat,
  presetId: room.presetId, rulesPatch: room.rulesPatch || null,
  seats: Array.from({ length: room.n }, (_, i) => {
    const s = (room.seats || [])[i];
    return s
      ? { seat: i, name: s.name, connected: !!s.connId, cpu: !!s.cpu }
      : { seat: i, name: null, connected: false, cpu: false };
  }),
  seed: room.seed || null,
  actionCount: room.actionCount || 0,
});

async function activeRooms() {
  const now = Math.floor(Date.now() / 1000);
  const list = await queryPk('ROOMS');
  return list.filter((r) => (r.expiresAt || 0) > now);
}

async function createRoom(ctx, connId, msg) {
  const rooms = await activeRooms();
  if (rooms.length >= MAX_ROOMS) {
    await fail(ctx, connId, 'いま開いている部屋がいっぱいです。少し時間をおいてお試しください。');
    return { statusCode: 200 };
  }
  const n = msg.n === 3 ? 3 : 4;
  const patch = msg.rulesPatch ? clean(JSON.stringify(msg.rulesPatch), MAX_PATCH) : null;
  const name = clean(msg.name, MAX_NAME) || 'ホスト';

  for (let i = 0; i < 8; i++) {
    const no = roomNumber();
    const room = {
      pk: roomKey(no), sk: 'META',
      no, n, state: 'lobby', presetId: clean(msg.presetId, 40),
      rulesPatch: patch, hostSeat: 0,
      seats: [{ connId, name, cpu: false }],
      actionCount: 0, expiresAt: ttl(), createdAt: new Date().toISOString(),
    };
    if (!(await putIfAbsent(room))) continue;
    await putItem({ pk: 'ROOMS', sk: roomKey(no), no, expiresAt: ttl() });
    await putItem({ pk: `CONN#${connId}`, sk: 'META', roomNo: no, seat: 0, expiresAt: ttl() });
    await post(ctx, connId, { type: 'room', you: 0, room: publicRoom(room) });
    return { statusCode: 200 };
  }
  await fail(ctx, connId, '部屋を作れませんでした。もう一度お試しください。');
  return { statusCode: 200 };
}

async function joinRoom(ctx, connId, msg) {
  const no = clean(msg.no, 8);
  const room = await getItem(roomKey(no), 'META');
  if (!room) { await fail(ctx, connId, 'その部屋番号は見つかりませんでした。'); return { statusCode: 200 }; }
  if (room.state !== 'lobby') { await fail(ctx, connId, 'その部屋はもう始まっています。'); return { statusCode: 200 }; }

  const seats = room.seats || [];
  if (seats.length >= Math.min(room.n, MAX_SEATS)) {
    await fail(ctx, connId, 'その部屋は満席です。');
    return { statusCode: 200 };
  }
  const seat = seats.length;
  seats.push({ connId, name: clean(msg.name, MAX_NAME) || `プレイヤー${seat + 1}`, cpu: false });
  await updateFields(roomKey(no), 'META', { seats, expiresAt: ttl() });
  await putItem({ pk: `CONN#${connId}`, sk: 'META', roomNo: no, seat, expiresAt: ttl() });

  const next = { ...room, seats };
  await post(ctx, connId, { type: 'room', you: seat, room: publicRoom(next) });
  await broadcast(ctx, next, { type: 'room', room: publicRoom(next) });
  return { statusCode: 200 };
}

/** 席を締め切って開始する。空いている席はAIが埋める。 */
async function startRoom(ctx, connId, msg) {
  const no = clean(msg.no, 8);
  const room = await getItem(roomKey(no), 'META');
  if (!room) return { statusCode: 200 };
  const seats = room.seats || [];
  if (!seats[room.hostSeat] || seats[room.hostSeat].connId !== connId) {
    await fail(ctx, connId, '開始できるのは部屋を作った人だけです。');
    return { statusCode: 200 };
  }
  if (room.state !== 'lobby') return { statusCode: 200 };

  while (seats.length < room.n) seats.push({ connId: null, name: `CPU${seats.length}`, cpu: true });
  const seed = Math.floor(Math.random() * 100000);
  await updateFields(roomKey(no), 'META', { seats, state: 'playing', seed, expiresAt: ttl() });

  const next = { ...room, seats, state: 'playing', seed };
  await broadcast(ctx, next, { type: 'begin', room: publicRoom(next) });
  return { statusCode: 200 };
}

/**
 * 行動を1件受け取り、順番をつけて全員へ配る。
 * 順番はサーバが決める。ここが唯一の正なので、どの端末でも同じ順で並ぶ。
 */
async function pushAct(ctx, connId, msg) {
  const no = clean(msg.no, 8);
  const room = await getItem(roomKey(no), 'META');
  if (!room || room.state !== 'playing') return { statusCode: 200 };

  const seats = room.seats || [];
  const mine = seats.findIndex((s) => s && s.connId === connId);
  if (mine < 0) return { statusCode: 200 };

  // 自分の席か、AIの席（AIは部屋を作った人がまとめて決める）だけ通す
  const seat = Number(msg.seat);
  const target = seats[seat];
  if (!target) return { statusCode: 200 };
  const allowed = seat === mine || (target.cpu && mine === room.hostSeat);
  if (!allowed) { await fail(ctx, connId, 'その席の操作はできません。'); return { statusCode: 200 }; }

  const counted = await bump(roomKey(no), 'META', 'actionCount', 1);
  const seq = (counted?.actionCount || 1) - 1;
  await putItem({
    pk: roomKey(no), sk: `ACT#${String(seq).padStart(6, '0')}`,
    seq, seat, action: msg.action, expiresAt: ttl(),
  });
  await broadcast(ctx, room, { type: 'acts', from: seq, acts: [{ seq, seat, action: msg.action }] });
  return { statusCode: 200 };
}

/** 途中から入り直した端末へ、n番目から先を配り直す */
async function resync(ctx, connId, msg) {
  const no = clean(msg.no, 8);
  const from = Math.max(0, Number(msg.from) || 0);
  const room = await getItem(roomKey(no), 'META');
  if (!room) return { statusCode: 200 };
  const items = await queryPk(roomKey(no));
  const acts = items
    .filter((i) => typeof i.seq === 'number' && i.seq >= from)
    .sort((a, b) => a.seq - b.seq)
    .map((i) => ({ seq: i.seq, seat: i.seat, action: i.action }));
  await post(ctx, connId, { type: 'room', room: publicRoom(room) });
  if (acts.length) await post(ctx, connId, { type: 'acts', from, acts });
  return { statusCode: 200 };
}

/** 切れた席を「不在」にして、残っている人に知らせる */
async function onDisconnect(connId, ctx = null) {
  const link = await getItem(`CONN#${connId}`, 'META');
  if (!link) return { statusCode: 200 };
  const room = await getItem(roomKey(link.roomNo), 'META');
  if (!room) return { statusCode: 200 };

  const seats = (room.seats || []).map((s) => (s && s.connId === connId ? { ...s, connId: null } : s));
  await updateFields(roomKey(link.roomNo), 'META', { seats, expiresAt: ttl() });
  if (ctx) await broadcast(ctx, { ...room, seats }, { type: 'room', room: publicRoom({ ...room, seats }) });
  return { statusCode: 200 };
}
