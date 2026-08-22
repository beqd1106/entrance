/**
 * net.js - オンライン対局の通信
 *
 * サーバは順番を決めて配るだけで、対局は各端末の engine が進める。
 * ここは「つなぐ・送る・届いたものを渡す」だけを持ち、
 * 対局の中身（どう進めるか）は game.js の側に置く。
 *
 * 通信が無い設定・つながらない環境でも、他の画面は今までどおり動く。
 * オンライン対局だけが使えなくなる。
 *
 * 詳しくは docs/11_オンライン対戦.md を参照。
 */
const URL_BASE = (window.HOUSERULE_WS || '').replace(/\/+$/, '');

export const hasOnline = () => !!URL_BASE;

/** 表示名。決めていなければ端末に覚えさせる */
const NAME_KEY = 'houserule.playerName.v1';
export function playerName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}
export function savePlayerName(v) {
  try { localStorage.setItem(NAME_KEY, String(v || '').slice(0, 12)); } catch { /* 保存できなくても続行 */ }
}

/**
 * 接続を1つ持つ。
 *
 * 画面のどこからでも同じ接続を使いたいので、モジュールに1本だけ持つ。
 * 切れたときは、待ち時間を伸ばしながら数回だけつなぎ直す。
 * 無限に試すと、こちらが原因で費用が伸び続けるので必ず打ち切る。
 */
let sock = null;
let state = 'idle';        // idle / connecting / open / closed
let listeners = new Set();
let retry = 0;
let queue = [];
let wantOpen = false;

const MAX_RETRY = 5;

function emit(ev) {
  for (const fn of [...listeners]) {
    try { fn(ev); } catch (e) { console.error('net listener', e); }
  }
}

export function onMessage(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function status() { return state; }

export function connect() {
  if (!URL_BASE) return false;
  if (state === 'open' || state === 'connecting') return true;
  wantOpen = true;
  state = 'connecting';
  emit({ type: '_state', state });

  sock = new WebSocket(URL_BASE);
  sock.onopen = () => {
    state = 'open';
    retry = 0;
    emit({ type: '_state', state });
    const pending = queue;
    queue = [];
    for (const m of pending) send(m);
  };
  sock.onmessage = (e) => {
    let msg = null;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg && typeof msg.type === 'string') emit(msg);
  };
  sock.onclose = () => {
    state = 'closed';
    emit({ type: '_state', state });
    if (!wantOpen || retry >= MAX_RETRY) return;
    retry += 1;
    // 1.2秒 → 2.4 → 4.8 …と伸ばす。打ち切ったら、画面から手で入り直してもらう。
    setTimeout(() => { if (wantOpen) connect(); }, 1200 * (2 ** (retry - 1)));
  };
  sock.onerror = () => { /* onclose で面倒を見る */ };
  return true;
}

export function disconnect() {
  wantOpen = false;
  queue = [];
  if (sock && (state === 'open' || state === 'connecting')) {
    try { sock.close(); } catch { /* 既に閉じている */ }
  }
  sock = null;
  state = 'idle';
}

/** つながっていなければ、つながってから送る */
export function send(msg) {
  if (state === 'open' && sock) {
    try { sock.send(JSON.stringify(msg)); return true; } catch { /* 下でためる */ }
  }
  queue.push(msg);
  if (state !== 'connecting') connect();
  return false;
}

export const createRoom = (opts) => send({ type: 'create', ...opts });
export const joinRoom = (no, name) => send({ type: 'join', no, name });
export const startRoom = (no) => send({ type: 'start', no });
export const sendAct = (no, seat, action) => send({ type: 'act', no, seat, action });
export const resync = (no, from) => send({ type: 'resync', no, from });
export const leaveRoom = (no) => send({ type: 'leave', no });
