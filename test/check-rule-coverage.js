/**
 * check-rule-coverage.js - 「設定できるのに、どこも読んでいない」項目を探す
 *
 * ルール設定の項目は編集画面に並ぶ。並んでいるのに誰も読んでいなければ、
 * お客様は設定したつもりで何も変わらない。少牌マイティのオープンリーチが
 * まさにこれで、置き場所を間違えたまま誰も気づかなかった。
 *
 *   node test/check-rule-coverage.js
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_RULES } from '../src/rules/defaults.js';

/** 走査対象。defaults.js 自身は「宣言」なので数えない */
function sourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!/node_modules|\.git|^ios$/.test(name)) sourceFiles(p, out);
    } else if (/\.(js|mjs)$/.test(name) && !/defaults\.js$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const files = [
  ...sourceFiles('src'),
  ...sourceFiles(join('web', 'js')),
  ...sourceFiles('test').filter((f) => !/check-rule-coverage/.test(f)),
];
const src = files.map((f) => readFileSync(f, 'utf8')).join('\n');

/** 葉の項目（それ以上たどれない設定）をすべて集める */
function leaves(obj, path = [], out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) leaves(v, [...path, k], out);
    else out.push([...path, k]);
  }
  return out;
}

// 牌コードを鍵にする表（{'5m':1} など）は設定項目ではないので数えない
const isTileCode = (k) => /^\d[mpszf]$/.test(k) || /^(spring|summer|autumn|winter)$/.test(k);

/**
 * まだ実装していない項目。
 * 設定としては置いてあるが、いまはどこも読んでいない。
 * 編集画面には出していないので、お客様が触って混乱することはない。
 * ここに載っているものを実装したら、この一覧から消すこと。
 * 逆に、ここに無いのに読まれていない項目が出たら、それは事故。
 */
const NOT_IMPLEMENTED_YET = new Set([
  'meta.basedOn',                    // どのルールを土台にしたかの覚え書き
  'game.westEntrySuddenDeath',       // 西入のサドンデス
  'game.returnEast',                 // 東場に戻る
  'game.sameScoreRank',              // 同点のときの順位の決め方
  'game.dealerDecide',               // 親の決め方
  'game.timeLimitMinutes',           // 時間制限
  'scoring.pao',                     // パオ（責任払い）
  'win.furitenRiichi',               // フリテンリーチの許容
  'dora.indicatorSpecialEffect',     // ドラ表示牌が特殊牌だったとき
  'local.openRiichi.allowDouble',    // ダブルオープンリーチ
  'local.openRiichi.doubleHan',
  'local.wareme.notenExempt',        // 割れ目のノーテン罰符の扱い
  'local.wareme.bonusToo',           // 割れ目を祝儀にも効かせる
  'local.kokushiAnkanRon',           // 国士の暗槓ロン
  'sanma.kitaUsableInHand',          // 北を手牌でも使えるか（いまは制限していない＝'always'相当。
                                     //   プリセット側も実際の動きに合う値を持たせてある）
  'bonus.openRiichiBonus',           // オープンリーチの祝儀
  'bonus.lastAvoid',                 // ラス回避の祝儀
]);

const missing = [];
for (const path of leaves(DEFAULT_RULES)) {
  const key = path[path.length - 1];
  if (isTileCode(key)) continue;
  // `.key` / `['key']` / `{ key }` のいずれかで触れられていれば読まれているとみなす
  const re = new RegExp(`[.'"\`\\[]\\s*${key}\\b|\\b${key}\\s*[:,}]`);
  const full = path.join('.');
  if (!re.test(src) && !NOT_IMPLEMENTED_YET.has(full)) missing.push(full);
}

if (missing.length) {
  console.log('=== 設定できるのに、どこからも読まれていない項目 ===');
  for (const m of missing) console.log(' - ' + m);
  console.log(`\n${missing.length} 件`);
  console.log('実装するか、設定から外すか、まだ手を付けないなら'
    + ' NOT_IMPLEMENTED_YET に理由つきで足してください。');
  process.exit(1);
}
console.log('=== ルール設定：読まれていない項目なし'
  + `（未実装として承知しているものが ${NOT_IMPLEMENTED_YET.size} 件）===`);
