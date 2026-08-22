/**
 * member.js - 会員カードとクーポン
 *
 * 「打ってから、行く。」の締めくくりにあたる部分。
 * アプリで体験した人が、店頭で名乗れる形（会員番号）を持ち、
 * 通った回数に応じてクーポンが開く。
 *
 * 番号は店の持ちものとしてサーバに置く。
 *   - 端末のなかだけに持つと、機種変更で消える
 *   - 別の端末で作り直せば、同じクーポンを何度でも使えてしまう
 *   - 店頭で番号を聞いても、店側が照会できない
 * 端末は発行時に「合鍵」を受け取り、以後それで自分の番号を名乗る。
 * 受け渡すのは番号と回数だけで、氏名や連絡先はやり取りしない。
 *
 * サーバが無い設定のとき（デモ・機内など）は、これまでどおり
 * 端末のなかだけで番号を作って動く。
 *
 * 法務上の前提：
 *   クーポンは「店頭で提示する案内」であって、アプリ内で金銭のやり取りはしない。
 *   ゲーム内ポイント（BP）とも交換しない。デモでは記録だけを持つ。
 */
import {
  hasServer, issueMember, fetchMember, useCouponOnServer,
} from './api.js';

const KEY = 'houserule.member.v1';
const STATS_KEY = 'houserule.storeStats.v1';

let memory = null;

function readAll() {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    memory = raw ? JSON.parse(raw) : {};
  } catch {
    memory = {};
  }
  return memory;
}

function writeAll(all) {
  memory = all;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* 保存できなくても画面は動く */ }
}

/** サーバが無いときの会員番号。端末のなかだけで完結する */
function localNumber(storeId) {
  const seed = `${storeId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const body = String(hash % 100000000).padStart(8, '0');
  return `${body.slice(0, 4)}-${body.slice(4)}`;
}

/** 店ごとの成績（体験プレイ・チェックイン回数）。dashboard と同じ記録を読む */
function localStats(storeId) {
  try {
    const all = JSON.parse(localStorage.getItem(STATS_KEY) || '{}');
    return all[storeId] || { plays: 0, visits: 0, checkins: 0 };
  } catch {
    return { plays: 0, visits: 0, checkins: 0 };
  }
}

/**
 * クーポンの条件に使う回数。
 * サーバのカードに記録があればそちらを使う（機種を変えても続く）。
 * 端末の記録のほうが多いときは、そちらを採る。カードを作る前に
 * 打った体験プレイは、サーバのカードには載っていないため。
 */
export function statsOf(storeId) {
  const local = localStats(storeId);
  const card = readAll()[storeId];
  if (!card || card.local) return local;
  return {
    ...local,
    plays: Math.max(local.plays || 0, card.plays || 0),
    checkins: Math.max(local.checkins || 0, card.checkins || 0),
  };
}

/** 会員カードを取り出す。無ければ null（発行は ensureCard） */
export function getCard(storeId) {
  return readAll()[storeId] || null;
}

export function hasCard(storeId) {
  return !!readAll()[storeId];
}

/** この端末が名乗るための情報。api.js にそのまま渡す */
export function memberAuth(storeId) {
  const c = readAll()[storeId];
  return c && c.token ? { no: c.no, token: c.token } : null;
}

/**
 * 会員カードを用意する。すでに有ればそれを返す。
 * @returns {Promise<{card:object|null, error:string|null}>}
 */
export async function ensureCard(storeId) {
  const existing = readAll()[storeId];
  if (existing) return { card: existing, error: null };

  if (!hasServer()) {
    const card = { no: localNumber(storeId), since: Date.now(), used: [], local: true };
    const all = readAll();
    all[storeId] = card;
    writeAll(all);
    return { card, error: null };
  }

  const r = await issueMember(storeId);
  if (!r.ok) {
    return { card: null, error: r.error === 'offline' ? 'いまは発行できません' : r.error };
  }
  const card = {
    no: r.data.no, token: r.data.token, since: Date.now(),
    used: r.data.used || [], plays: r.data.plays || 0, checkins: r.data.checkins || 0,
  };
  const all = readAll();
  all[storeId] = card;
  writeAll(all);
  return { card, error: null };
}

/**
 * サーバのカードで手元を上書きする（回数・使用済みクーポン）。
 * 取れなくても手元の内容はそのまま使う。
 * @returns {Promise<boolean>} 内容が変わったか
 */
export async function refreshCard(storeId) {
  const card = readAll()[storeId];
  if (!card || card.local || !card.token || !hasServer()) return false;
  const r = await fetchMember(storeId, { no: card.no, token: card.token });
  if (!r.ok || !r.data || !r.data.card) return false;
  const s = r.data.card;
  const changed = (card.plays || 0) !== (s.plays || 0)
    || (card.checkins || 0) !== (s.checkins || 0)
    || (card.used || []).length !== (s.used || []).length;
  const all = readAll();
  all[storeId] = { ...card, plays: s.plays, checkins: s.checkins, used: s.used };
  writeAll(all);
  return changed;
}

/** 発行済みカードの一覧（新しい順） */
export function allCards() {
  const all = readAll();
  return Object.entries(all)
    .map(([storeId, c]) => ({ storeId, ...c }))
    .sort((a, b) => b.since - a.since);
}

export function removeCard(storeId) {
  const all = readAll();
  delete all[storeId];
  writeAll(all);
}

/**
 * クーポンの状態を判定する。
 *   locked   … 条件をまだ満たしていない
 *   ready    … 使える
 *   used     … 使用済み
 *   expired  … 期限切れ
 */
export function couponState(storeId, coupon) {
  const card = getCard(storeId);
  if (card && (card.used || []).some((u) => u.id === coupon.id)) return 'used';
  if (coupon.until && Date.now() > Date.parse(coupon.until)) return 'expired';
  const st = statsOf(storeId);
  const need = coupon.requires || {};
  if ((need.plays || 0) > st.plays) return 'locked';
  if ((need.checkins || 0) > st.checkins) return 'locked';
  return 'ready';
}

/** 条件までの残りを、そのまま文にする */
export function couponProgress(storeId, coupon) {
  const st = statsOf(storeId);
  const need = coupon.requires || {};
  const parts = [];
  if (need.plays) parts.push(`体験プレイ ${Math.min(st.plays, need.plays)}/${need.plays}`);
  if (need.checkins) parts.push(`来店 ${Math.min(st.checkins, need.checkins)}/${need.checkins}`);
  return parts.join('　');
}

/**
 * クーポンを使う（記録するだけ。金銭のやり取りはしない）。
 *
 * 画面はすぐ「使用済み」に変わってほしいので、先に手元へ書いてから
 * サーバへ送る。サーバに届かなかったときは手元の印を戻す。
 * ここを戻さないと、店頭で使えなかったクーポンが消えたままになる。
 * @returns {Promise<{ok:boolean, error:string|null}>}
 */
export async function useCoupon(storeId, couponId) {
  const all = readAll();
  const card = all[storeId];
  if (!card) return { ok: false, error: '会員カードがありません' };

  const before = card.used || [];
  card.used = [...before, { id: couponId, at: Date.now() }];
  writeAll(all);

  if (card.local || !card.token || !hasServer()) return { ok: true, error: null };

  const r = await useCouponOnServer(storeId, { no: card.no, token: card.token }, couponId);
  if (!r.ok) {
    const now = readAll();
    if (now[storeId]) {
      now[storeId].used = before;
      writeAll(now);
    }
    return { ok: false, error: r.error === 'offline' ? '通信できませんでした' : r.error };
  }
  const now = readAll();
  if (now[storeId] && r.data && r.data.card) {
    now[storeId].used = r.data.card.used || now[storeId].used;
    writeAll(now);
  }
  return { ok: true, error: null };
}
