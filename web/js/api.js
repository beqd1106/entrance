/**
 * api.js - サーバ（AWS）との通信
 *
 * 方針：**サーバが無くてもアプリは完全に動く**。
 * ここはあくまで「あれば使う」層で、通信に失敗しても画面は止めない。
 * デモを配るときも、ネットワークが無い場所で見せるときも、同じように動く。
 *
 * 保存先の使い分け
 *   サーバあり … 店舗情報・体験プレイ数・来店数はサーバへ（他の端末からも見える）
 *   サーバなし … これまでどおり端末内（localStorage）に置く
 */
const BASE = (window.HOUSERULE_API || '').replace(/\/+$/, '');
const TOKEN_KEY = 'houserule.editToken.v1';

/** サーバを使う設定になっているか */
export const hasServer = () => !!BASE;

/** 店舗ごとの編集トークン（この端末が「その店の人」であることの証明） */
export function editToken(storeId) {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY) || '{}')[storeId] || null;
  } catch {
    return null;
  }
}

export function saveEditToken(storeId, token) {
  if (!token) return;
  try {
    const all = JSON.parse(localStorage.getItem(TOKEN_KEY) || '{}');
    all[storeId] = token;
    localStorage.setItem(TOKEN_KEY, JSON.stringify(all));
  } catch { /* 保存できなくても操作は続けられる */ }
}

/**
 * 通信の共通部分。
 * 失敗は例外にせず { ok, data, error } で返す。呼び出し側が握りつぶしやすい形にする。
 */
async function call(path, { method = 'GET', body, storeId, timeoutMs = 12000 } = {}) {
  if (!BASE) return { ok: false, error: 'offline' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json; charset=utf-8';
    const t = storeId ? editToken(storeId) : null;
    if (t) headers['x-edit-token'] = t;

    const res = await fetch(`${BASE}${path}`, {
      method, headers, signal: ctrl.signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* JSON以外は無視 */ }
    if (!res.ok) return { ok: false, error: data?.error || `通信に失敗しました（${res.status}）`, status: res.status };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? '応答がありません' : '通信できませんでした' };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
export const listStores = () => call('/stores');
export const fetchStore = (id) => call(`/stores/${encodeURIComponent(id)}`);
export const fetchStats = (id) => call(`/stores/${encodeURIComponent(id)}/stats`);

/** 店舗情報とルールを保存する。初回はトークンが発行されるので受け取って残す。 */
export async function saveStore(id, payload) {
  const r = await call(`/stores/${encodeURIComponent(id)}`, { method: 'PUT', body: payload, storeId: id });
  if (r.ok && r.data?.createdToken) saveEditToken(id, r.data.createdToken);
  return r;
}

/** 体験プレイ・来店の記録。数えられなくても対局や画面は止めない。 */
export const recordPlay = (id) => call(`/stores/${encodeURIComponent(id)}/play`, { method: 'POST', body: {} });
export const recordCheckin = (id) => call(`/stores/${encodeURIComponent(id)}/checkin`, { method: 'POST', body: {} });

/** 文章からルール設定の下書きを作る */
export const draftRules = (text) => call('/rules/draft', { method: 'POST', body: { text }, timeoutMs: 30000 });

/**
 * 店舗写真をアップロードする。
 * 画像そのものはサーバを通さず、署名付きURLでS3へ直接送る（サーバ側の負荷と費用を増やさない）。
 */
export async function uploadPhoto(storeId, file) {
  if (!BASE) return { ok: false, error: 'offline' };
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    return { ok: false, error: 'JPEG・PNG・WebP のいずれかを選んでください' };
  }
  if (file.size > 4 * 1024 * 1024) {
    return { ok: false, error: '画像は4MBまでです' };
  }
  const signed = await call(`/stores/${encodeURIComponent(storeId)}/photo-url`, {
    method: 'POST', body: { contentType: file.type }, storeId,
  });
  if (!signed.ok) return signed;

  try {
    const put = await fetch(signed.data.uploadUrl, {
      method: 'PUT', headers: { 'content-type': file.type }, body: file,
    });
    if (!put.ok) return { ok: false, error: `画像の送信に失敗しました（${put.status}）` };
    return { ok: true, data: { url: signed.data.publicUrl } };
  } catch {
    return { ok: false, error: '画像を送信できませんでした' };
  }
}
