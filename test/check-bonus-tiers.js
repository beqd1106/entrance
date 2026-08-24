/**
 * check-bonus-tiers.js - 祝儀（BP）の設定が、実際にBPを動かすか確かめる
 *
 * bonus.baiman（倍満のBP）は設定として置いてあり、編集画面にも並ぶのに、
 * 判定がどこにも無く、いくつ入れても0のままだった。
 * 「読まれていない項目」の検査は、名前がどこかに出ていれば通ってしまう
 * （既定値の宣言とプリセットに書いてあるので通っていた）。
 *
 * ここでは値を実際に振って、BPが動くかどうかを見る。
 *
 *   node test/check-bonus-tiers.js
 */
import { resolveRules, deepMerge } from '../src/rules/defaults.js';
import { getPreset } from '../src/rules/presets.js';
import { collectWinBonus } from '../src/core/effects.js';

const problems = [];

const rulesWith = (patch) => resolveRules(deepMerge(getPreset('goto_standard').rules, patch));

/** 和了1回ぶんのBPを出す */
function bp(rules, winInfo) {
  return collectWinBonus(rules, {
    flags: {}, uraCount: 0, akaCount: 0, goldCount: 0, pocchiCount: 0,
    kitaCount: 0, yakuman: 0, tsumo: true, ...winInfo,
  }).bonus;
}

/**
 * その項目を0にしたときと大きくしたときで、BPが変わることを確かめる。
 * @param {string} key      bonus の項目名
 * @param {object} winInfo  その項目が効くはずの和了
 */
function mustMove(key, winInfo, label) {
  const a = bp(rulesWith({ bonus: { [key]: 0 } }), winInfo);
  const b = bp(rulesWith({ bonus: { [key]: 7 } }), winInfo);
  if (a === b) problems.push(`bonus.${key}（${label}）：0にしても7にしてもBPが ${a} のまま`);
}

mustMove('ippatsu', { flags: { ippatsu: true } }, '一発');
mustMove('ura', { uraCount: 2 }, '裏ドラ');
mustMove('aka', { akaCount: 1 }, '赤');
mustMove('gold', { goldCount: 1 }, '金');
mustMove('pocchi', { pocchiCount: 1 }, '白ポッチ');
mustMove('kita', { kitaCount: 3 }, '抜きドラ');
mustMove('yakuman', { yakuman: 1 }, '役満');
mustMove('countedYakuman', { limitName: '数え役満' }, '数え役満');
mustMove('sanbaiman', { limitName: '三倍満' }, '三倍満');
mustMove('baiman', { limitName: '倍満' }, '倍満');

// 役満をロンで和了ったときの倍率
{
  const w = { yakuman: 1, tsumo: false };
  const a = bp(rulesWith({ bonus: { yakuman: 10, yakumanRonMultiplier: 1 } }), w);
  const b = bp(rulesWith({ bonus: { yakuman: 10, yakumanRonMultiplier: 2 } }), w);
  if (a === b) problems.push(`bonus.yakumanRonMultiplier（役満をロンしたときの倍率）：変えてもBPが ${a} のまま`);
}

// 段は重ならない。倍満の和了で三倍満のBPまで乗ってはいけない
{
  const r = rulesWith({ bonus: { baiman: 3, sanbaiman: 9, countedYakuman: 20 } });
  const got = bp(r, { limitName: '倍満' });
  if (got !== 3) problems.push(`倍満の和了でBPが ${got}。倍満のぶん（3）だけであるべき`);
}

if (problems.length) {
  console.log('=== 祝儀（BP）の設定で効いていないもの ===');
  for (const p of problems) console.log(' - ' + p);
  console.log(`\n${problems.length} 件`);
  process.exit(1);
}
console.log('=== 祝儀（BP）：全11項目とも設定がBPに効いている ===');
