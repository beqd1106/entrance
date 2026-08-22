/**
 * index.mjs - Houserule API（Lambda Function URL）
 *
 * 設計の方針
 *   - 読み取りは誰でも。書き込みは店舗ごとの編集トークンが要る。
 *   - フロントは API が無くても動く。ここは「あれば使う」置き場所。
 *   - 依存は Lambda ランタイム同梱の AWS SDK だけ。ビルド不要で置ける。
 *
 * 経路
 *   GET  /health
 *   GET  /stores                  公開中の店舗一覧
 *   GET  /stores/{id}             店舗1件（プロフィール＋ルール）
 *   PUT  /stores/{id}             保存（要トークン）
 *   POST /stores/{id}/photo-url   写真アップロード用の署名付きURL（要トークン）
 *   POST /stores/{id}/play        体験プレイを1件記録
 *   POST /stores/{id}/checkin     来店を1件記録
 *   GET  /stores/{id}/stats       集計値
 *   POST /stores/{id}/member      会員番号を発行（合鍵を返す。以後この番号で名乗る）
 *   GET  /stores/{id}/member      自分の会員カード（要 合鍵）
 *   POST /stores/{id}/coupon-use  クーポンを使ったことを記録（要 合鍵）
 *   GET  /stores/{id}/members/{番号} 店頭での照会（要 編集トークン）
 *   POST /rules/draft             文章からルール設定の下書きを作る
 */
import {
  getItem, putItem, putIfAbsent, updateFields, queryPk, bump,
  underDailyLimit, underGlobalDailyLimit,
} from './lib/db.mjs';
import { createHash } from 'node:crypto';
import { presignS3Put, presignS3Get } from './lib/sign.mjs';
import { draftRulesFromText } from './lib/ai.mjs';

const REGION = process.env.AWS_REGION || 'ap-northeast-1';
const BUCKET = process.env.ASSET_BUCKET || '';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

/**
 * サービス全体の1日あたりの上限。費用が伸び続けないことを保証するための天井。
 * 相手ごとの制限はIPを変えれば抜けられるので、こちらを最後の砦にする。
 * 上限に当たったら、その日はその操作を受け付けない（他の操作は動く）。
 */
const DAILY = {
  draft: Number(process.env.DAILY_DRAFT || 50),    // AIの下書き（1回あたりの単価がいちばん高い）
  write: Number(process.env.DAILY_WRITE || 500),   // 店舗の保存・写真URLの発行
  record: Number(process.env.DAILY_RECORD || 5000), // 体験プレイ・来店の記録
  photo: Number(process.env.DAILY_PHOTO || 20000),  // 画像URLの発行（転送量に直結する）
  member: Number(process.env.DAILY_MEMBER || 2000), // 会員番号の発行・クーポンの使用記録
};

/** 画像URLの有効期限（秒）。短いほど、1回の発行で持ち出せる量が減る。 */
const PHOTO_URL_TTL = 900;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type,x-edit-token,x-member-token,x-member-no',
  'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
  'access-control-max-age': '86400',
};

const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
  body: JSON.stringify(obj),
});
const bad = (code, message) => json(code, { error: message });

export const handler = async (event) => {
  const method = event?.requestContext?.http?.method || 'GET';
  const path = (event?.rawPath || '/').replace(/\/+$/, '') || '/';
  if (method === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  try {
    return await route(method, path, event);
  } catch (err) {
    // 詳細はログにだけ残す。呼び出し側には内部構造を出さない。
    console.error('unhandled', { path, method, message: err?.message, stack: err?.stack });
    return bad(500, 'サーバ側で問題が起きました');
  }
};

async function route(method, path, event) {
  const seg = path.split('/').filter(Boolean);

  if (path === '/health') return json(200, { ok: true, time: new Date().toISOString() });

  if (seg[0] === 'stores') {
    if (seg.length === 1 && method === 'GET') return listStores();
    const id = seg[1];
    if (!id) return bad(404, '見つかりません');

    if (seg.length === 2 && method === 'GET') return getStore(id);
    if (seg.length === 2 && method === 'PUT') return saveStore(id, event);
    if (seg[2] === 'stats' && method === 'GET') return getStats(id);
    if (seg[2] === 'play' && method === 'POST') return record(id, 'plays', event);
    if (seg[2] === 'checkin' && method === 'POST') return record(id, 'checkins', event);
    if (seg[2] === 'photo-url' && method === 'POST') return photoUrl(id, event);
    if (seg[2] === 'member' && seg.length === 3 && method === 'POST') return issueMember(id, event);
    if (seg[2] === 'member' && seg.length === 3 && method === 'GET') return myMember(id, event);
    if (seg[2] === 'coupon-use' && method === 'POST') return useCoupon(id, event);
    if (seg[2] === 'members' && seg.length === 4 && method === 'GET') return lookupMember(id, seg[3], event);
  }

  if (path === '/rules/draft' && method === 'POST') return rulesDraft(event);

  return bad(404, '見つかりません');
}

// ---------------------------------------------------------------------------
// 読み取り
// ---------------------------------------------------------------------------
async function listStores() {
  const rows = await queryPk('STORES');
  const stores = rows
    .filter((r) => r.published)
    .map((r) => ({ id: r.storeId, name: r.name, area: r.area, catch: r.catch, updatedAt: r.updatedAt }));
  return json(200, { stores });
}

async function getStore(id) {
  const [profile, rules] = await Promise.all([
    getItem(`STORE#${id}`, 'PROFILE'),
    getItem(`STORE#${id}`, 'RULES'),
  ]);
  if (!profile) return bad(404, 'その店舗は登録されていません');
  return json(200, {
    store: await withPhotoUrl(strip(profile)),
    rules: rules ? rules.patch : null,
  });
}

/**
 * 保存してあるのは画像の置き場所（キー）だけ。
 * 表示のたびに期限付きURLを作って返す。バケットは公開していないので、
 * ここを通らずに画像を取り出すことはできない。
 */
async function withPhotoUrl(store) {
  if (!BUCKET) return store;
  const notices = Array.isArray(store.notices) ? store.notices : null;
  const needsNoticeUrl = notices && notices.some((n) => n && n.imageKey);
  if (!store.photoKey && !needsNoticeUrl) return store;
  if (!(await underGlobalDailyLimit('photo', DAILY.photo))) return store;
  const sign = (key) => presignS3Get({ bucket: BUCKET, key, region: REGION, expires: PHOTO_URL_TTL });
  const out = { ...store };
  if (store.photoKey) out.photoUrl = sign(store.photoKey);
  if (needsNoticeUrl) {
    out.notices = notices.map((n) => (n && n.imageKey ? { ...n, imageUrl: sign(n.imageKey) } : n));
  }
  return out;
}

async function getStats(id) {
  const s = await getItem(`STORE#${id}`, 'STATS');
  return json(200, { plays: s?.plays || 0, checkins: s?.checkins || 0, updatedAt: s?.updatedAt || null });
}

// ---------------------------------------------------------------------------
// 書き込み
// ---------------------------------------------------------------------------
async function saveStore(id, event) {
  const body = parseBody(event);
  if (!body) return bad(400, '内容を読み取れませんでした');
  if (!(await underGlobalDailyLimit('write', DAILY.write))) {
    return bad(429, '本日の保存回数の上限に達しました。明日またお試しください');
  }
  const auth = await authorize(id, event);
  if (!auth.ok) return bad(auth.code, auth.message);

  const now = new Date().toISOString();
  const profile = {
    pk: `STORE#${id}`, sk: 'PROFILE', storeId: id,
    ...pickProfile(body.store || {}),
    editToken: auth.token,
    published: !!body.published,
    updatedAt: now,
  };
  await putItem(profile);
  if (body.rules) {
    await putItem({ pk: `STORE#${id}`, sk: 'RULES', storeId: id, patch: body.rules, updatedAt: now });
  }
  // 一覧用の索引も同時に更新する（一覧のたびに全件読むのを避ける）
  await putItem({
    pk: 'STORES', sk: `STORE#${id}`, storeId: id,
    name: profile.name, area: profile.area, catch: profile.catch,
    published: profile.published, updatedAt: now,
  });

  return json(200, { ok: true, store: strip(profile), createdToken: auth.created ? auth.token : undefined });
}

async function record(id, field, event) {
  const profile = await getItem(`STORE#${id}`, 'PROFILE');
  if (!profile) return bad(404, 'その店舗は登録されていません');

  if (!(await underGlobalDailyLimit('record', DAILY.record))) {
    return json(200, { ok: true, counted: false, reason: '本日の記録数の上限に達しました' });
  }
  const who = clientKey(event);
  if (!(await underDailyLimit(`${field}:${id}:${who}`, 50))) {
    // 弾いたことは伝えるが、失敗扱いにはしない（画面を止める理由がない）
    return json(200, { ok: true, counted: false, reason: '同じ端末からの記録が多すぎます' });
  }
  const s = await bump(`STORE#${id}`, 'STATS', field, 1);
  // 会員として名乗っていれば、その人の回数も一緒に増やす（クーポンの条件に使う）
  let card = null;
  const mine = await memberFrom(id, event, memberNoOf(event));
  if (mine) {
    const m = await bump(`STORE#${id}`, `MEMBER#${mine.no}`, field, 1);
    if (m) card = publicCard(m);
  }
  return json(200, { ok: true, counted: true, plays: s?.plays || 0, checkins: s?.checkins || 0, card });
}

/* ------------------------------------------------------------------ *
 * 会員カード
 *
 * 店頭で名乗るための番号を、店ごとに1つ持たせる。
 * 端末のなかだけに持たせると、機種変更で消え、別端末で作り直せば
 * クーポンを何度でも使えてしまう。番号は店の持ちものとしてここに置く。
 *
 * 持たせるのは番号と回数だけで、氏名や連絡先は受け取らない。
 * 端末は発行時に「合鍵」を受け取り、以後それで自分の番号を名乗る。
 * 合鍵はそのままではなく、照合できる形（ハッシュ）にして保管する。
 * ------------------------------------------------------------------ */

const hash = (v) => createHash('sha256').update(String(v)).digest('hex');

/** 0000-0000 の形。読み上げやすいよう数字だけにする */
function memberNumber() {
  const n = [...crypto.getRandomValues(new Uint32Array(2))]
    .map((x) => String(x % 10000).padStart(4, '0'));
  return `${n[0]}-${n[1]}`;
}

/** 会員番号を発行する。番号が既に有ったら、空くまで数回やり直す。 */
async function issueMember(id, event) {
  const profile = await getItem(`STORE#${id}`, 'PROFILE');
  if (!profile) return bad(404, 'その店舗は登録されていません');
  if (!(await underGlobalDailyLimit('member', DAILY.member))) {
    return bad(429, '本日の発行数の上限に達しました');
  }
  if (!(await underDailyLimit(`member:${id}:${clientKey(event)}`, 5))) {
    return bad(429, '同じ端末からの発行が多すぎます');
  }
  const secret = randomToken();
  for (let i = 0; i < 6; i++) {
    const no = memberNumber();
    const ok = await putIfAbsent({
      pk: `STORE#${id}`, sk: `MEMBER#${no}`,
      no, secretHash: hash(secret), plays: 0, checkins: 0, used: [],
      since: new Date().toISOString(),
    });
    if (ok) return json(200, { no, token: secret, plays: 0, checkins: 0, used: [] });
  }
  return bad(503, '会員番号を発行できませんでした。少し時間をおいて試してください');
}

/** 合鍵から会員カードを取り出す。名乗れなければ null。 */
async function memberFrom(id, event, no) {
  const token = header(event, 'x-member-token');
  if (!token || !no) return null;
  const card = await getItem(`STORE#${id}`, `MEMBER#${no}`);
  if (!card || card.secretHash !== hash(token)) return null;
  return card;
}

/** 番号は本文かヘッダで受け取る（GETでも名乗れるようにヘッダを見る） */
function memberNoOf(event) {
  const body = parseBody(event) || {};
  return String(body.no || header(event, 'x-member-no') || '').slice(0, 12);
}

const publicCard = (c) => ({
  no: c.no, plays: c.plays || 0, checkins: c.checkins || 0,
  used: Array.isArray(c.used) ? c.used : [], since: c.since,
});

async function myMember(id, event) {
  const card = await memberFrom(id, event, memberNoOf(event));
  if (!card) return bad(401, '会員カードを確認できませんでした');
  return json(200, { card: publicCard(card) });
}

/**
 * クーポンを使ったことを記録する。
 * 同じクーポンを二度使えないようにするのが目的なので、
 * すでに使っていたときも失敗にはせず、使用済みとして返す。
 */
async function useCoupon(id, event) {
  const body = parseBody(event) || {};
  const couponId = String(body.couponId || '').slice(0, 40);
  if (!couponId) return bad(400, 'クーポンが指定されていません');
  const card = await memberFrom(id, event, memberNoOf(event));
  if (!card) return bad(401, '会員カードを確認できませんでした');
  if (!(await underGlobalDailyLimit('member', DAILY.member))) {
    return bad(429, '本日の受付数の上限に達しました');
  }
  const used = Array.isArray(card.used) ? card.used : [];
  if (used.some((u) => u && u.id === couponId)) {
    return json(200, { ok: true, already: true, card: publicCard({ ...card, used }) });
  }
  const next = [...used, { id: couponId, at: new Date().toISOString() }].slice(-100);
  await updateFields(`STORE#${id}`, `MEMBER#${card.no}`, { used: next });
  return json(200, { ok: true, already: false, card: publicCard({ ...card, used: next }) });
}

/** 店頭での照会。番号を聞いて、使えるかどうかをスタッフが確かめる。 */
async function lookupMember(id, no, event) {
  const auth = await authorize(id, event);
  if (!auth.ok) return bad(auth.code, auth.message);
  const card = await getItem(`STORE#${id}`, `MEMBER#${decodeURIComponent(no)}`);
  if (!card) return bad(404, 'その番号の会員カードはありません');
  return json(200, { card: publicCard(card) });
}

async function photoUrl(id, event) {
  if (!BUCKET) return bad(503, '画像の保存先が設定されていません');
  const auth = await authorize(id, event);
  if (!auth.ok) return bad(auth.code, auth.message);

  const body = parseBody(event) || {};
  const type = String(body.contentType || 'image/jpeg');
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type];
  if (!ext) return bad(400, '対応しているのは JPEG・PNG・WebP です');

  if (!(await underGlobalDailyLimit('write', DAILY.write))) {
    return bad(429, '本日のアップロード回数の上限に達しました');
  }
  const key = `photos/${id}/${Date.now().toString(36)}.${ext}`;
  return json(200, {
    uploadUrl: presignS3Put({ bucket: BUCKET, key, region: REGION, expires: 600 }),
    contentType: type,
    key,
    viewUrl: presignS3Get({ bucket: BUCKET, key, region: REGION, expires: PHOTO_URL_TTL }),
    expiresInSec: 600,
  });
}

async function rulesDraft(event) {
  const body = parseBody(event) || {};
  const text = String(body.text || '').slice(0, 1200);
  if (text.trim().length < 4) return bad(400, 'ルールの説明を書いてください');
  if (!(await underDailyLimit(`draft:${clientKey(event)}`, 10))) {
    return bad(429, '本日の下書き回数の上限に達しました');
  }
  // IPを変えられても抜けられない、サービス全体の天井
  if (!(await underGlobalDailyLimit('draft', DAILY.draft))) {
    return bad(429, '本日の下書き回数が全体の上限に達しました。明日またお試しください');
  }
  const result = await draftRulesFromText(text);
  if (!result.ok) return bad(502, result.message);
  return json(200, { patch: result.patch, notes: result.notes });
}

// ---------------------------------------------------------------------------
// 補助
// ---------------------------------------------------------------------------
/**
 * 編集の権限を確かめる。
 * まだ誰のものでもない店舗IDは、最初に触った人がトークンを受け取る（＝以後その人だけが編集できる）。
 * 管理トークンがあれば、どの店舗でも編集できる。
 */
async function authorize(id, event) {
  const given = header(event, 'x-edit-token') || '';
  if (ADMIN_TOKEN && given === ADMIN_TOKEN) return { ok: true, token: given, created: false };

  const profile = await getItem(`STORE#${id}`, 'PROFILE');
  if (!profile) {
    const token = given || randomToken();
    return { ok: true, token, created: !given };
  }
  if (!given) return { ok: false, code: 401, message: '編集トークンが必要です' };
  if (given !== profile.editToken) return { ok: false, code: 403, message: 'この店舗を編集する権限がありません' };
  return { ok: true, token: profile.editToken, created: false };
}

/** 保存してよい項目だけを通す（余計なものを書き込ませない） */
function pickProfile(s) {
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : undefined);
  const arr = (v, max, each) => (Array.isArray(v) ? v.slice(0, max).map((x) => str(x, each)).filter(Boolean) : undefined);
  return {
    name: str(s.name, 60),
    catch: str(s.catch, 120),
    area: str(s.area, 40),
    address: str(s.address, 120),
    access: str(s.access, 120),
    hours: str(s.hours, 80),
    tables: str(s.tables, 60),
    smoking: str(s.smoking, 40),
    style: str(s.style, 40),
    beginner: Number.isFinite(+s.beginner) ? Math.max(0, Math.min(5, Math.round(+s.beginner))) : undefined,
    beginnerNote: str(s.beginnerNote, 240),
    photoKey: str(s.photoKey, 300),
    mood: arr(s.mood, 8, 24),
    ruleHighlights: arr(s.ruleHighlights, 8, 24),
    sns: s.sns && typeof s.sns === 'object'
      ? { x: str(s.sns.x, 80), web: str(s.sns.web, 200) } : undefined,
    notices: pickNotices(s.notices),
  };
}

/**
 * お知らせ・イベント情報。
 * 店舗が自由に書くところなので、件数・長さ・日付の形をここで抑える。
 * 掲載期間は「いつからいつまで出すか」で、対局のルールには影響しない。
 */
function pickNotices(list) {
  if (!Array.isArray(list)) return undefined;
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
  return list.slice(0, 20).map((n, i) => ({
    id: str(n && n.id, 40) || `n${i}`,
    kind: n && n.kind === 'event' ? 'event' : 'notice',
    title: str(n && n.title, 60),
    body: str(n && n.body, 400),
    startAt: day(n && n.startAt),
    endAt: day(n && n.endAt),
    // 画像1枚で配る告知もあるので、置き場所だけ持たせる（表示用URLは読み出し時に作る）
    imageKey: str(n && n.imageKey, 300),
  })).filter((n) => n.title);
}

/** トークンは外へ出さない */
function strip(profile) {
  const { editToken, pk, sk, ...rest } = profile;
  return rest;
}

function parseBody(event) {
  if (!event?.body) return null;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

function header(event, name) {
  const h = event?.headers || {};
  return h[name] || h[name.toLowerCase()] || null;
}

/** 連打よけの相手識別。個人を特定しないよう、IPはそのままでは持たない。 */
function clientKey(event) {
  const ip = event?.requestContext?.http?.sourceIp || 'unknown';
  return Buffer.from(ip).toString('base64url').slice(0, 22);
}

function randomToken() {
  return [...crypto.getRandomValues(new Uint8Array(18))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}
