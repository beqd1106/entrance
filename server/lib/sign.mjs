/**
 * sign.mjs - AWS SigV4 署名（依存ゼロ）
 *
 * Lambda ランタイムに同梱されている SDK の顔ぶれは実行環境によって変わる。
 * S3 の署名付きURL生成と Bedrock の呼び出しだけのために SDK に依存したくないので、
 * node:crypto と fetch だけで署名を組み立てる。
 *
 * 認証情報は Lambda が環境変数で渡してくるものを使う（キーを持ち歩かない）。
 */
import { createHash, createHmac } from 'node:crypto';

const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const sha256hex = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

/** 環境変数から認証情報を取り出す */
export function credsFromEnv() {
  return {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN || null,
  };
}

/** 署名日時を AWS 形式の2つに分ける */
function stamps(now = new Date()) {
  const amz = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: amz, dateStamp: amz.slice(0, 8) };
}

function signingKey(secret, dateStamp, region, service) {
  let k = hmac(`AWS4${secret}`, dateStamp);
  k = hmac(k, region);
  k = hmac(k, service);
  return hmac(k, 'aws4_request');
}

/**
 * S3 への PUT 用の署名付きURL。
 * ブラウザからこのURLへ直接 PUT すれば、サーバを経由せず画像を置ける。
 */
export const presignS3Put = (opts) => presignS3({ ...opts, method: 'PUT' });

/**
 * S3 からの GET 用の署名付きURL。
 *
 * バケットは公開していない。匿名でいくらでもダウンロードできる状態にすると、
 * 転送量の費用に上限が無くなるため。画像はここで発行した期限付きURLでのみ取得できる。
 */
export const presignS3Get = (opts) => presignS3({ ...opts, method: 'GET' });

function presignS3({ bucket, key, region, method = 'PUT', expires = 600, creds = credsFromEnv() }) {
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const { amzDate, dateStamp } = stamps();
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const canonicalUri = `/${key.split('/').map(enc).join('/')}`;

  const q = new Map([
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${creds.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expires)],
    ['X-Amz-SignedHeaders', 'host'],
  ]);
  if (creds.sessionToken) q.set('X-Amz-Security-Token', creds.sessionToken);

  const canonicalQuery = [...q.entries()]
    .map(([k, v]) => [enc(k), enc(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const canonicalRequest = [
    method, canonicalUri, canonicalQuery,
    `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD',
  ].join('\n');

  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');
  const signature = createHmac('sha256', signingKey(creds.secretAccessKey, dateStamp, region, 's3'))
    .update(toSign).digest('hex');

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/**
 * 署名付きで API を叩く（Bedrock など、SDKを使わずに呼びたいもの向け）。
 * 失敗しても例外にせず、呼び出し側で扱えるように結果を返す。
 */
export async function signedFetch({ service, region, method = 'POST', url, body = '', headers = {}, creds = credsFromEnv() }) {
  const u = new URL(url);
  const { amzDate, dateStamp } = stamps();
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const payloadHash = sha256hex(body);

  const h = { host: u.host, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash, ...lower(headers) };
  if (creds.sessionToken) h['x-amz-security-token'] = creds.sessionToken;

  const names = Object.keys(h).sort();
  const canonicalHeaders = names.map((n) => `${n}:${String(h[n]).trim()}\n`).join('');
  const signedHeaders = names.join(';');

  const canonicalQuery = [...u.searchParams.entries()]
    .map(([k, v]) => [enc(k), enc(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  // S3 以外のサービスは、正規化したパスをもう一度URIエンコードする決まり。
  // 例：モデルIDの「:」は %3A ではなく %253A で署名しないと一致しない。
  const canonicalPath = u.pathname.split('/')
    .map((p) => enc(enc(decodeURIComponent(p))))
    .join('/') || '/';

  const canonicalRequest = [
    method, canonicalPath,
    canonicalQuery, canonicalHeaders, signedHeaders, payloadHash,
  ].join('\n');

  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');
  const signature = createHmac('sha256', signingKey(creds.secretAccessKey, dateStamp, region, service))
    .update(toSign).digest('hex');

  h.authorization = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, `
    + `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(u.toString(), { method, headers: h, body: body || undefined });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

function lower(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k.toLowerCase()] = v;
  return out;
}
