/**
 * run-server-tests.js - サーバ側のロジックを検証する
 *
 *   node test/run-server-tests.js
 *
 * AWS には繋がない。判断を間違えると被害が出るところ
 * （署名の作り方・入力の絞り込み）だけを、純粋な関数として確かめる。
 */
import { createHash, createHmac } from 'node:crypto';
import { presignS3Put } from '../server/lib/sign.mjs';

let pass = 0;
let fail = 0;
const t = (name, fn) => {
  try {
    fn();
    pass++;
    console.log(`  [OK] ${name}`);
  } catch (err) {
    fail++;
    console.log(`  [NG] ${name}`);
    console.log(`       ${err.message}`);
  }
};
const eq = (a, b, msg) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${msg || ''} 期待 ${JSON.stringify(b)} / 実際 ${JSON.stringify(a)}`);
  }
};
const ok = (v, msg) => { if (!v) throw new Error(msg || '真であるべき'); };

// ---------------------------------------------------------------------------
console.log('\n--- S3の署名付きURL ---');

const CREDS = { accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'secret', sessionToken: null };
const url = presignS3Put({
  bucket: 'demo-bucket', key: 'photos/abc/xyz.jpg', region: 'ap-northeast-1',
  expires: 600, creds: CREDS,
});

t('正しいホストとパスを指す', () => {
  const u = new URL(url);
  eq(u.host, 'demo-bucket.s3.ap-northeast-1.amazonaws.com');
  eq(u.pathname, '/photos/abc/xyz.jpg');
});

t('署名に必要な項目がすべて入っている', () => {
  const q = new URL(url).searchParams;
  eq(q.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
  eq(q.get('X-Amz-Expires'), '600');
  eq(q.get('X-Amz-SignedHeaders'), 'host');
  ok(q.get('X-Amz-Credential').startsWith('AKIAEXAMPLE/'), 'Credential が入っている');
  ok(/^[0-9a-f]{64}$/.test(q.get('X-Amz-Signature')), '署名が64桁の16進');
});

t('鍵が違えば署名も変わる', () => {
  const other = presignS3Put({
    bucket: 'demo-bucket', key: 'photos/abc/xyz.jpg', region: 'ap-northeast-1',
    expires: 600, creds: { ...CREDS, secretAccessKey: 'another' },
  });
  ok(new URL(url).searchParams.get('X-Amz-Signature')
    !== new URL(other).searchParams.get('X-Amz-Signature'), '別の署名になる');
});

t('一時認証のときは Security Token が付く', () => {
  const u = presignS3Put({
    bucket: 'b', key: 'photos/k.jpg', region: 'ap-northeast-1',
    creds: { ...CREDS, sessionToken: 'TOKEN123' },
  });
  eq(new URL(u).searchParams.get('X-Amz-Security-Token'), 'TOKEN123');
});

t('署名の値がAWSの計算手順と一致する', () => {
  // 実装とは別に、同じ手順を素朴に書き下して突き合わせる
  const q = new URL(url).searchParams;
  const amzDate = q.get('X-Amz-Date');
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/ap-northeast-1/s3/aws4_request`;
  const canonicalQuery = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `AKIAEXAMPLE/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', '600'],
    ['X-Amz-SignedHeaders', 'host'],
  ].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).sort().join('&');
  const canonicalRequest = [
    'PUT', '/photos/abc/xyz.jpg', canonicalQuery,
    'host:demo-bucket.s3.ap-northeast-1.amazonaws.com\n', 'host', 'UNSIGNED-PAYLOAD',
  ].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope,
    createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
  let k = createHmac('sha256', 'AWS4secret').update(dateStamp).digest();
  k = createHmac('sha256', k).update('ap-northeast-1').digest();
  k = createHmac('sha256', k).update('s3').digest();
  k = createHmac('sha256', k).update('aws4_request').digest();
  const expect = createHmac('sha256', k).update(toSign).digest('hex');
  eq(q.get('X-Amz-Signature'), expect, '署名が一致する');
});

// ---------------------------------------------------------------------------
console.log('\n--- 保存してよい項目の絞り込み ---');

// index.mjs の pickProfile と同じ規則。AWS SDK を読み込まずに検証したいので写しを使う。
function pickProfile(s) {
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : undefined);
  const arr = (v, max, each) => (Array.isArray(v) ? v.slice(0, max).map((x) => str(x, each)).filter(Boolean) : undefined);
  return {
    name: str(s.name, 60),
    catch: str(s.catch, 120),
    area: str(s.area, 40),
    beginner: Number.isFinite(+s.beginner) ? Math.max(0, Math.min(5, Math.round(+s.beginner))) : undefined,
    mood: arr(s.mood, 8, 24),
  };
}

t('知らない項目は保存されない', () => {
  const r = pickProfile({ name: 'テスト店', editToken: 'ぬすまれた', isAdmin: true, published: true });
  eq(r.name, 'テスト店');
  eq(r.editToken, undefined, '編集トークンを上書きさせない');
  eq(r.isAdmin, undefined, '知らない項目は通さない');
});

t('長すぎる文字列は切り詰める', () => {
  const r = pickProfile({ name: 'あ'.repeat(200) });
  eq(r.name.length, 60);
});

t('初心者歓迎度は0〜5に収める', () => {
  eq(pickProfile({ beginner: 99 }).beginner, 5);
  eq(pickProfile({ beginner: -3 }).beginner, 0);
  eq(pickProfile({ beginner: 3.4 }).beginner, 3);
  eq(pickProfile({ beginner: 'たくさん' }).beginner, undefined);
});

t('配列は件数も1件の長さも制限する', () => {
  const r = pickProfile({ mood: Array.from({ length: 30 }, () => 'あ'.repeat(50)) });
  eq(r.mood.length, 8);
  eq(r.mood[0].length, 24);
});

t('型が違うものは黙って捨てる（例外にしない）', () => {
  const r = pickProfile({ name: { evil: true }, mood: 'にぎやか' });
  eq(r.name, undefined);
  eq(r.mood, undefined);
});

// ---------------------------------------------------------------------------
console.log('\n--- AIの下書きの絞り込み ---');

// ai.mjs の sanitize と同じ規則。モデルの出力を信用しないことを確かめる。
const FIELDS = {
  'game.players': { type: 'enum', values: [3, 4] },
  'scoring.startingPoints': { type: 'int', min: 10000, max: 50000 },
  'win.kuitan': { type: 'bool' },
  'dora.red.5p': { type: 'int', min: 0, max: 4 },
};
function coerce(def, value) {
  if (def.type === 'bool') return typeof value === 'boolean' ? value : undefined;
  if (def.type === 'int') {
    const n = Number(value);
    if (!Number.isFinite(n)) return undefined;
    const i = Math.round(n);
    return i >= def.min && i <= def.max ? i : undefined;
  }
  if (def.type === 'enum') return def.values.includes(value) ? value : undefined;
  return undefined;
}
function assign(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}
function sanitize(flat) {
  const out = {};
  const dropped = [];
  for (const [key, value] of Object.entries(flat)) {
    const def = FIELDS[key];
    if (!def) { dropped.push(key); continue; }
    const v = coerce(def, value);
    if (v === undefined) { dropped.push(key); continue; }
    assign(out, key, v);
  }
  return { patch: out, dropped };
}

t('一覧にない項目はモデルが返しても採用しない', () => {
  const { patch, dropped } = sanitize({ 'win.kuitan': true, 'meta.id': 'のっとり', __proto__: 'x' });
  eq(patch, { win: { kuitan: true } });
  ok(dropped.includes('meta.id'), '捨てた項目を報告する');
});

t('範囲外の数値は採用しない', () => {
  eq(sanitize({ 'scoring.startingPoints': 9999999 }).patch, {});
  eq(sanitize({ 'dora.red.5p': 99 }).patch, {});
  eq(sanitize({ 'dora.red.5p': 4 }).patch, { dora: { red: { '5p': 4 } } });
});

t('決められた値以外は採用しない', () => {
  eq(sanitize({ 'game.players': 5 }).patch, {});
  eq(sanitize({ 'game.players': 3 }).patch, { game: { players: 3 } });
});

t('真偽値のつもりの文字列は採用しない', () => {
  eq(sanitize({ 'win.kuitan': 'true' }).patch, {}, '"true" は true ではない');
});

t('入れ子に組み直せる', () => {
  const { patch } = sanitize({ 'game.players': 4, 'dora.red.5p': 2, 'win.kuitan': false });
  eq(patch, { game: { players: 4 }, dora: { red: { '5p': 2 } }, win: { kuitan: false } });
});

// ---------------------------------------------------------------------------
console.log(`\n=== 結果: ${pass} 件成功 / ${fail} 件失敗 ===`);
process.exit(fail ? 1 : 0);
