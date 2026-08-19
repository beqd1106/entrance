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
 *   POST /rules/draft             文章からルール設定の下書きを作る
 */
import { getItem, putItem, queryPk, bump, underDailyLimit } from './lib/db.mjs';
import { presignS3Put } from './lib/sign.mjs';
import { draftRulesFromText } from './lib/ai.mjs';

const REGION = process.env.AWS_REGION || 'ap-northeast-1';
const BUCKET = process.env.ASSET_BUCKET || '';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type,x-edit-token',
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
    store: strip(profile),
    rules: rules ? rules.patch : null,
  });
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

  const who = clientKey(event);
  if (!(await underDailyLimit(`${field}:${id}:${who}`, 50))) {
    // 弾いたことは伝えるが、失敗扱いにはしない（画面を止める理由がない）
    return json(200, { ok: true, counted: false, reason: '同じ端末からの記録が多すぎます' });
  }
  const s = await bump(`STORE#${id}`, 'STATS', field, 1);
  return json(200, { ok: true, counted: true, plays: s?.plays || 0, checkins: s?.checkins || 0 });
}

async function photoUrl(id, event) {
  if (!BUCKET) return bad(503, '画像の保存先が設定されていません');
  const auth = await authorize(id, event);
  if (!auth.ok) return bad(auth.code, auth.message);

  const body = parseBody(event) || {};
  const type = String(body.contentType || 'image/jpeg');
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type];
  if (!ext) return bad(400, '対応しているのは JPEG・PNG・WebP です');

  const key = `photos/${id}/${Date.now().toString(36)}.${ext}`;
  const uploadUrl = presignS3Put({ bucket: BUCKET, key, region: REGION, expires: 600 });
  return json(200, {
    uploadUrl,
    contentType: type,
    publicUrl: `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`,
    expiresInSec: 600,
  });
}

async function rulesDraft(event) {
  const body = parseBody(event) || {};
  const text = String(body.text || '').slice(0, 1200);
  if (text.trim().length < 4) return bad(400, 'ルールの説明を書いてください');
  if (!(await underDailyLimit(`draft:${clientKey(event)}`, 30))) {
    return bad(429, '本日の下書き回数の上限に達しました');
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
    photoUrl: str(s.photoUrl, 400),
    mood: arr(s.mood, 8, 24),
    ruleHighlights: arr(s.ruleHighlights, 8, 24),
    sns: s.sns && typeof s.sns === 'object'
      ? { x: str(s.sns.x, 80), web: str(s.sns.web, 200) } : undefined,
  };
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
