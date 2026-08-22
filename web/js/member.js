/**
 * member.js - 会員カードとクーポン
 *
 * 「打ってから、行く。」の締めくくりにあたる部分。
 * アプリで体験した人が、店頭で名乗れる形（会員番号）を持ち、
 * 通った回数に応じてクーポンが開く。
 *
 * 法務上の前提：
 *   クーポンは「店頭で提示する案内」であって、アプリ内で金銭のやり取りはしない。
 *   ゲーム内ポイント（BP）とも交換しない。デモでは記録だけを持つ。
 */
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

/** 会員番号。店ごとに一度だけ作って、以後は変えない */
function issueNumber(storeId) {
  const seed = `${storeId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const body = String(hash % 100000000).padStart(8, '0');
  return `${body.slice(0, 4)}-${body.slice(4)}`;
}

/** 店ごとの成績（体験プレイ・チェックイン回数）。dashboard と同じ記録を読む */
export function statsOf(storeId) {
  try {
    const all = JSON.parse(localStorage.getItem(STATS_KEY) || '{}');
    return all[storeId] || { plays: 0, visits: 0, checkins: 0 };
  } catch {
    return { plays: 0, visits: 0, checkins: 0 };
  }
}

/** 会員カードを取り出す。無ければ作る */
export function getCard(storeId, { create = false } = {}) {
  const all = readAll();
  if (!all[storeId] && create) {
    all[storeId] = { no: issueNumber(storeId), since: Date.now(), used: [] };
    writeAll(all);
  }
  return all[storeId] || null;
}

export function hasCard(storeId) {
  return !!readAll()[storeId];
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

/** クーポンを使う（記録するだけ。金銭のやり取りはしない） */
export function useCoupon(storeId, couponId) {
  const all = readAll();
  const card = all[storeId];
  if (!card) return false;
  card.used = [...(card.used || []), { id: couponId, at: Date.now() }];
  writeAll(all);
  return true;
}
