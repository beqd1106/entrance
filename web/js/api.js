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
async function call(path, { method = 'GET', body, storeId, member, timeoutMs = 12000 } = {}) {
  if (!BASE) return { ok: false, error: 'offline' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json; charset=utf-8';
    const t = storeId ? editToken(storeId) : null;
    if (t) headers['x-edit-token'] = t;
    if (member && member.token && member.no) {
      headers['x-member-token'] = member.token;
      headers['x-member-no'] = member.no;
    }

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

/**
 * 体験プレイ・来店の記録。数えられなくても対局や画面は止めない。
 * 会員カードを持っていれば一緒に名乗り、その人の回数も増やしてもらう。
 */
export const recordPlay = (id, member) => call(`/stores/${encodeURIComponent(id)}/play`, { method: 'POST', body: {}, member });
export const recordCheckin = (id, member) => call(`/stores/${encodeURIComponent(id)}/checkin`, { method: 'POST', body: {}, member });

// --- 会員カード ---------------------------------------------------------
/** 会員番号を発行してもらう。返る token は、以後この番号を名乗るための合鍵。 */
export const issueMember = (id) => call(`/stores/${encodeURIComponent(id)}/member`, { method: 'POST', body: {} });

/** サーバ側の会員カード（回数・使用済みクーポン）を取り直す */
export const fetchMember = (id, member) => call(`/stores/${encodeURIComponent(id)}/member`, { member });

/** クーポンを使ったことを記録する。二度目は already:true で返る。 */
export const useCouponOnServer = (id, member, couponId) =>
  call(`/stores/${encodeURIComponent(id)}/coupon-use`, { method: 'POST', body: { couponId }, member });

/** 店頭での照会（店舗の編集トークンが要る） */
export const lookupMember = (id, no) =>
  call(`/stores/${encodeURIComponent(id)}/members/${encodeURIComponent(no)}`, { storeId: id });

/** 文章からルール設定の下書きを作る */
export const draftRules = (text) => call('/rules/draft', { method: 'POST', body: { text }, timeoutMs: 30000 });

/**
 * 店舗写真をアップロードする。
 *
 * 画像そのものはサーバを通さず、署名付きURLでS3へ直接送る。
 * 保管先は公開していないので、表示にも期限付きのURLを使う。
 * 保存するのは置き場所（key）だけで、URLは表示のたびにサーバが作り直す。
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
    return { ok: true, data: { key: signed.data.key, url: signed.data.viewUrl } };
  } catch {
    return { ok: false, error: '画像を送信できませんでした' };
  }
}
