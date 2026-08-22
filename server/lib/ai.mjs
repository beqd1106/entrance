/**
 * ai.mjs - 「うちのルール」を書いた文章から、設定の下書きを作る
 *
 * 店舗スタッフが設定画面を一つずつ触るのは負担が大きい。
 * 貼り紙やSNSに書いてある文章をそのまま渡せば、下書きが出るようにする。
 *
 * 大事なのは、出てきたものをそのまま信じないこと。
 *   - 触ってよい項目を allowlist で固定する
 *   - 型と範囲を必ず検査し、外れた項目は黙って捨てる
 *   - 結果は「下書き」として店舗が確認してから保存する（自動適用しない）
 */
import { signedFetch } from './sign.mjs';

const REGION = process.env.AWS_REGION || 'ap-northeast-1';
const MODEL = process.env.BEDROCK_MODEL || 'jp.anthropic.claude-haiku-4-5-20251001-v1:0';

/**
 * 呼び先は2通りある。
 *   ANTHROPIC_API_KEY があれば Claude API を直接叩く
 *   無ければ Bedrock（AWSの署名付きリクエスト）
 * Bedrock はモデルアクセスの利用用途フォームを出すまで使えないため、
 * 申請を待たずに動かしたいときは API キーを環境変数に入れれば切り替わる。
 * 鍵はサーバ（Lambda）の環境変数だけに置き、フロントには渡さない。
 */
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
// 文章から設定を起こすだけの軽い用途なので、必要なら安いモデルを環境変数で指定する
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';

/**
 * 書き換えを許す項目。
 * ここに無いものは、モデルが返してきても採用しない。
 */
const FIELDS = {
  'game.players': { type: 'enum', values: [3, 4], label: '人数' },
  'game.length': { type: 'enum', values: ['east', 'east_south'], label: '対局の長さ' },
  'game.agariYame': { type: 'bool', label: 'アガリやめ' },
  'game.tobiEnd': { type: 'bool', label: 'トビ終了' },
  'scoring.startingPoints': { type: 'int', min: 10000, max: 50000, label: '持ち点' },
  'scoring.returnPoints': { type: 'int', min: 10000, max: 60000, label: '返し点' },
  'scoring.roundUpMangan': { type: 'bool', label: '切り上げ満貫' },
  'scoring.useFu': { type: 'bool', label: '符計算' },
  'win.kuitan': { type: 'bool', label: '喰いタン' },
  'win.atozuke': { type: 'bool', label: '後付け' },
  'win.kuikae': { type: 'bool', label: '喰い替え' },
  'win.doubleRon': { type: 'bool', label: 'ダブロン' },
  'dora.indicators': { type: 'int', min: 0, max: 4, label: '表ドラの枚数' },
  'dora.ura': { type: 'bool', label: '裏ドラ' },
  'dora.kanDora': { type: 'bool', label: 'カンドラ' },
  'dora.red.5m': { type: 'int', min: 0, max: 4, label: '赤5萬の枚数' },
  'dora.red.5p': { type: 'int', min: 0, max: 4, label: '赤5筒の枚数' },
  'dora.red.5s': { type: 'int', min: 0, max: 4, label: '赤5索の枚数' },
  'local.shiroPocchi.enabled': { type: 'bool', label: '白ポッチ' },
  'local.shiroPocchi.count': { type: 'int', min: 0, max: 4, label: '白ポッチの枚数' },
  'local.alice.enabled': { type: 'bool', label: 'アリス' },
  'local.tulip.enabled': { type: 'bool', label: 'チューリップ' },
  'local.wareme.enabled': { type: 'bool', label: '割れ目' },
  'local.openRiichi.enabled': { type: 'bool', label: 'オープンリーチ' },
  'local.openRiichi.han': { type: 'int', min: 0, max: 4, label: 'オープンリーチの翻数' },
  'local.dice.enabled': { type: 'bool', label: 'サイコロチャンス' },
  'local.yakitori.enabled': { type: 'bool', label: 'やきとり' },
  'flowers.enabled': { type: 'bool', label: '華牌（春夏秋冬）' },
  'sanma.northMode': { type: 'enum', values: ['nuki', 'yakuhai', 'normal'], label: '三麻の北の扱い' },
  'sanma.tsumoLoss': { type: 'bool', label: 'ツモ損' },
};

const SYSTEM = `あなたは雀荘のハウスルールを設定データに直す担当です。
入力は店員が書いた日本語の文章です。そこから読み取れる項目だけをJSONで返してください。

規則:
- 出力はJSONオブジェクトのみ。前後に説明文を書かない。
- 形式: {"patch": {"項目名": 値, ...}, "notes": ["読み取れなかった点や確認したい点", ...]}
- 項目名は次の一覧にあるものだけを使う。一覧に無いことは patch に入れず notes に書く。
- 文章に書かれていないことは推測しない。書かれた項目だけを patch に入れる。
- 「赤3枚」のように内訳が不明なときは 5m/5p/5s に1枚ずつ入れ、notes に内訳の確認を書く。

使える項目:
${Object.entries(FIELDS).map(([k, v]) => {
  const t = v.type === 'enum' ? v.values.map((x) => JSON.stringify(x)).join(' | ')
    : v.type === 'bool' ? 'true | false'
      : `整数 ${v.min}〜${v.max}`;
  return `- ${k} (${v.label}): ${t}`;
}).join('\n')}`;

/** Claude API を直接叩く（ANTHROPIC_API_KEY があるとき） */
async function askClaudeApi(text) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: 'user', content: text }],
    }),
  });
  return { ok: res.ok, status: res.status, text: await res.text() };
}

/** Bedrock を叩く（AWSの署名付きリクエスト） */
async function askBedrock(text) {
  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 1200,
    temperature: 0,
    system: SYSTEM,
    messages: [{ role: 'user', content: [{ type: 'text', text }] }],
  });
  return signedFetch({
    service: 'bedrock', region: REGION, method: 'POST',
    url: `https://bedrock-runtime.${REGION}.amazonaws.com/model/${encodeURIComponent(MODEL)}/invoke`,
    body, headers: { 'content-type': 'application/json' },
  });
}

/** 文章から設定の下書きを作る */
export async function draftRulesFromText(text) {
  let res;
  try {
    res = ANTHROPIC_KEY ? await askClaudeApi(text) : await askBedrock(text);
  } catch (err) {
    console.error('AI request failed', err?.message);
    return { ok: false, message: '下書きの生成に失敗しました' };
  }
  if (!res.ok) {
    console.error('AI error', res.status, res.text.slice(0, 400));
    if (ANTHROPIC_KEY && (res.status === 401 || res.status === 403)) {
      return { ok: false, message: 'AIの鍵が正しくありません。サーバの設定を確認してください' };
    }
    // 何が足りないのかを伝える。「失敗しました」だけだと打つ手が分からない。
    if (/use case details/i.test(res.text)) {
      return {
        ok: false,
        message: 'AIの利用申請がまだ済んでいません。AWSコンソールの Bedrock →'
          + ' モデルアクセスで利用用途フォームを送信すると使えるようになります。',
      };
    }
    if (/AccessDenied|not authorized/i.test(res.text)) {
      return { ok: false, message: 'AIモデルへのアクセスが許可されていません' };
    }
    return { ok: false, message: '下書きの生成に失敗しました。時間をおいてお試しください' };
  }

  let raw;
  try {
    const payload = JSON.parse(res.text);
    raw = (payload.content || []).map((c) => c.text || '').join('');
  } catch {
    return { ok: false, message: '下書きの生成に失敗しました' };
  }

  const parsed = extractJson(raw);
  if (!parsed) return { ok: false, message: '下書きの内容を読み取れませんでした' };

  const { patch, dropped } = sanitize(parsed.patch || {});
  const notes = Array.isArray(parsed.notes)
    ? parsed.notes.filter((n) => typeof n === 'string').slice(0, 8).map((n) => n.slice(0, 200))
    : [];
  if (dropped.length) notes.push(`設定に反映できなかった項目：${dropped.join('、')}`);

  return { ok: true, patch, notes };
}

/** モデルが前後に文章を付けてきても拾えるようにする */
function extractJson(s) {
  const t = String(s).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try { return JSON.parse(t); } catch { /* 続けて括弧で探す */ }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

/**
 * allowlist と型・範囲で絞り込み、ネストしたオブジェクトに組み直す。
 * 想定外の値はエラーにせず捨てる（店舗の作業を止めない）。
 */
function sanitize(flat) {
  const out = {};
  const dropped = [];
  for (const [key, value] of Object.entries(flat)) {
    const def = FIELDS[key];
    if (!def) { dropped.push(key); continue; }
    const v = coerce(def, value);
    if (v === undefined) { dropped.push(def.label); continue; }
    assign(out, key, v);
  }
  return { patch: out, dropped };
}

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
