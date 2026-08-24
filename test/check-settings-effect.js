/**
 * check-settings-effect.js - 設定を変えたら結果が変わるかを確かめる
 *
 * 「読まれていない項目」の検査（check-rule-coverage）は、
 * どこか1か所でも名前が出てくれば通ってしまう。本場の点数（honbaPoints）は
 * 説明文の生成では読まれていたので、支払い計算が人数×100点で
 * 決め打ちになっていることに気づけなかった。
 *
 * ここでは値を実際に振って、計算結果が動くかどうかを見る。
 * 動かなければ、その設定は支払いに効いていない。
 *
 *   node test/check-settings-effect.js
 */
import { resolveRules, deepMerge } from '../src/rules/defaults.js';
import { getPreset } from '../src/rules/presets.js';
import { settleWin, settleNoten, finalScores, basePoints } from '../src/core/score.js';

const problems = [];
const note = (msg) => problems.push(msg);

/** 土台のルールに patch を重ねて解決する */
const withRule = (baseId, patch) => resolveRules(deepMerge(getPreset(baseId).rules, patch));

/** 和了の精算を1回まわして、和了者の増減を返す */
function winGain(rules, { tsumo = false, honba = 0, kyotaku = 0, wareme = null, dealerSeat = 2 } = {}) {
  const n = rules.game.players;
  const r = settleWin({
    base: 2000, winner: 0, loser: tsumo ? null : 1, tsumo,
    dealerSeat, playerCount: n, rules, honba, kyotaku, wareme,
  });
  return r.deltas[0];
}

/**
 * 設定を2通りにして、結果が変わることを確かめる。
 * @param {string} label 何を見ているか
 * @param {Function} run  ルールを受け取って数値を返す
 */
function mustDiffer(label, baseId, patchA, patchB, run) {
  const a = run(withRule(baseId, patchA));
  const b = run(withRule(baseId, patchB));
  if (a === b) note(`${label}：設定を変えても結果が ${a} のまま。支払いに効いていない`);
}

// --- 本場（かつて人数×100点の決め打ちだった） -------------------------
mustDiffer('本場（ロン）', 'standard4',
  { scoring: { honbaPoints: 300 } }, { scoring: { honbaPoints: 1500 } },
  (r) => winGain(r, { honba: 1 }));
mustDiffer('本場（ツモ）', 'standard4',
  { scoring: { honbaPoints: 300 } }, { scoring: { honbaPoints: 1500 } },
  (r) => winGain(r, { tsumo: true, honba: 1 }));

// --- 供託（リーチ棒1本の点数） ------------------------------------------
mustDiffer('供託1本の点数', 'standard4',
  { scoring: { riichiStick: 1000 } }, { scoring: { riichiStick: 2000 } },
  (r) => winGain(r, { kyotaku: 1 }));

// --- 割れ目の倍率 --------------------------------------------------------
mustDiffer('割れ目の倍率', 'wareme_demo',
  { local: { wareme: { enabled: true, multiplier: 2 } } },
  { local: { wareme: { enabled: true, multiplier: 3 } } },
  (r) => winGain(r, { wareme: 1 }));

// --- ツモ損（三麻） ------------------------------------------------------
mustDiffer('ツモ損', 'standard3',
  { sanma: { tsumoLoss: false } }, { sanma: { tsumoLoss: true } },
  (r) => winGain(r, { tsumo: true }));

// --- ノーテン罰符 --------------------------------------------------------
mustDiffer('ノーテン罰符', 'standard4',
  { ryuukyoku: { notenPenalty: 3000 } }, { ryuukyoku: { notenPenalty: 6000 } },
  (r) => settleNoten([0], 4, r)[0]);

// --- ウマ・オカ・沈みウマ・クビ・素点の丸め -----------------------------
const pts4 = [40000, 26000, 20000, 14000];
mustDiffer('ウマ', 'standard4',
  { scoring: { uma: [10, 5, -5, -10] } }, { scoring: { uma: [30, 10, -10, -30] } },
  (r) => finalScores(pts4, r)[0].total);
mustDiffer('オカ（返し点）', 'standard4',
  { scoring: { returnPoints: 30000 } }, { scoring: { returnPoints: 35000 } },
  (r) => finalScores(pts4, r)[0].total);
mustDiffer('沈みウマ', 'standard4',
  { scoring: { shizumiUma: false } },
  { scoring: { shizumiUma: true, shizumiUmaValue: -10 } },
  (r) => finalScores(pts4, r)[3].total);
mustDiffer('クビ（規定点に届かないと減点）', 'standard4',
  { scoring: { kubi: { enabled: false } } },
  { scoring: { kubi: { enabled: true, threshold: 40000, penalty: -10 } } },
  (r) => finalScores(pts4, r)[3].total);
mustDiffer('素点の丸め方', 'standard4',
  { scoring: { rawRounding: 'none' } }, { scoring: { rawRounding: 'go' } },
  (r) => finalScores([40600, 25400, 20000, 14000], r)[0].total);

// --- 切り上げ満貫・数え役満 ---------------------------------------------
mustDiffer('切り上げ満貫', 'standard4',
  { scoring: { roundUpMangan: false } }, { scoring: { roundUpMangan: true } },
  // 30符4翻（1920点）は、切り上げると満貫になる
  (r) => basePoints({ han: 4, fu: 30, yakuman: 0 }, r).base);

if (problems.length) {
  console.log('=== 設定を変えても結果が動かない項目 ===');
  for (const p of problems) console.log(' - ' + p);
  console.log(`\n${problems.length} 件`);
  process.exit(1);
}
console.log('=== 支払い・精算：設定はすべて結果に効いている ===');
