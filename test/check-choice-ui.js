/**
 * check-choice-ui.js - エンジンが出す選択肢を、画面が全部描けるか確かめる
 *
 * 華牌を手動で抜く設定にしたとき、エンジンは「華牌を抜く」選択肢を
 * 出していたのに、画面にそれを描く分岐が無かった。ボタンも出ず、
 * 牌を押しても何も起きない。エンジンのテストは通るので気づけない。
 *
 * getChoices が出しうる選択肢の種類を読み取って、
 * 画面（drawActions）が持っている分岐と突き合わせる。
 *
 * CPUに打たせて集める方法も試したが、AIがその場で消費してしまう選択肢
 * （華牌を抜く等）を取りこぼした。静的に読むほうが確実。
 *
 *   node test/check-choice-ui.js
 */
import { readFileSync } from 'node:fs';

/** 打牌はボタンではなく手牌を押して行う。ここでは別扱い */
const NOT_A_BUTTON = new Set(['discard']);

/**
 * 関数の本体を切り出す。中かっこの対応を数えて、閉じるところまでを取る。
 * 「次の定義の手前まで」を正規表現で探す書き方だと中の行に引っかかり、
 * 途中で切れて選択肢を1つも拾えなかった。
 */
function bodyAfter(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`${marker} が見つかりません`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return src.slice(start);
}

/** 画面が描ける選択肢（drawActions の case を読み取る） */
function uiCases() {
  const src = readFileSync('web/js/game.js', 'utf8');
  const body = bodyAfter(src, 'function drawActions');
  return new Set([...body.matchAll(/case '([a-z]+)'/g)].map((m) => m[1]));
}

/**
 * エンジンが出しうる選択肢。
 * getChoices は振り分けるだけで、実体は turnChoices や鳴きの応答側にある。
 * 選択肢は必ず push({ type: '…' }) の形で作られるので、そこを拾う。
 */
function engineChoiceTypes() {
  const src = readFileSync('src/core/engine.js', 'utf8');
  const found = [...src.matchAll(/push\(\{\s*\n?\s*type: '([a-z]+)'/g)].map((m) => m[1]);
  // ロンは鳴きの応答として別の作られ方をするので足しておく
  found.push('ron');
  return new Set(found);
}

const engine = engineChoiceTypes();
const ui = uiCases();
const missing = [...engine].filter((t) => !NOT_A_BUTTON.has(t) && !ui.has(t)).sort();

if (!engine.size) {
  console.log('選択肢を1つも読み取れませんでした。切り出し方を見直してください。');
  process.exit(1);
}
if (missing.length) {
  console.log('=== エンジンは出すのに、画面が描けない選択肢 ===');
  for (const m of missing) console.log(' - ' + m);
  console.log('\nweb/js/game.js の drawActions に分岐を足してください。');
  process.exit(1);
}
console.log(`=== 選択肢：${engine.size}種類すべて画面に出せる ===`);
