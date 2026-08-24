/**
 * check-zero-sum.js - 精算の合計がゼロになるかを、全プリセットで確かめる
 *
 * 麻雀の清算は、誰かの得点が誰かの失点。合計は必ずゼロになる。
 * ここがずれるルールは、オカ（返し点との差）を誰にも渡していないか、
 * ウマの合計が合っていないかのどちらかで、点が消えるか湧く。
 * 気づきにくいうえ、順位表を見ても「なんとなく変」で終わってしまう。
 *
 * 東天紅系（mode: 'flat'）は素点そのものが成績なので、
 * 合計は「持ち点×人数」であることを確かめる。
 *
 *   node test/check-zero-sum.js
 */
import { resolveRules } from '../src/rules/defaults.js';
import { PRESETS } from '../src/rules/presets.js';
import { finalScores } from '../src/core/score.js';

const problems = [];

/** 合計が total ちょうどになる持ち点の分かれ方をいくつか作る */
function distributions(n, total) {
  const out = [];
  const base = total / n;
  // 大差・小差・同点を含める
  const shapes = n === 4
    ? [[1.6, 1.04, 0.8, 0.56], [1.2, 1.0, 1.0, 0.8], [2.08, 0.8, 0.56, 0.56], [1, 1, 1, 1]]
    : [[1.5, 1.0, 0.5], [1.2, 1.0, 0.8], [2.0, 0.6, 0.4], [1, 1, 1]];
  for (const sh of shapes) {
    const pts = sh.map((f) => Math.round(base * f));
    // 端数はトップで吸収して、合計をぴったりにする
    pts[0] += total - pts.reduce((a, b) => a + b, 0);
    out.push(pts);
  }
  return out;
}

for (const p of PRESETS) {
  const R = resolveRules(p.rules);
  const S = R.scoring;
  const n = R.game.players;
  const total = S.startingPoints * n;
  for (const pts of distributions(n, total)) {
    const f = finalScores(pts, R);
    const sum = f.reduce((a, x) => a + x.total, 0);
    // 素点の丸め（五捨六入など）は1人あたり最大0.5ずれる。人数ぶんは許す
    const slack = (S.rawRounding && S.rawRounding !== 'none') ? n * 0.5 : 0.001;
    const want = S.mode === 'flat' ? total : 0;
    if (Math.abs(sum - want) > slack) {
      problems.push(`${p.id}（${p.name}）素点${JSON.stringify(pts)} → 合計 ${sum}（${want} のはず）`
        + ` 持${S.startingPoints}/返${S.returnPoints} ウマ${JSON.stringify(S.uma)}`
        + ` okaToTop=${S.okaToTop} umaZeroSum=${S.umaZeroSum}`);
      break;  // 同じプリセットで何度も言わない
    }
  }
}

if (problems.length) {
  console.log('=== 清算の合計がゼロにならないルール ===');
  for (const p of problems) console.log(' - ' + p);
  console.log(`\n${problems.length} 件`);
  console.log('オカを誰にも渡していないか、ウマの合計が合っていない可能性があります。');
  process.exit(1);
}
console.log(`=== 清算：${PRESETS.length} プリセットとも合計がゼロ（東天紅系は持ち点合計）===`);
