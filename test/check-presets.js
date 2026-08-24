/**
 * check-presets.js - プリセットの説明文と中身が食い違っていないか調べる
 *
 * 説明に「赤なし」と書いてあるのに赤が入っている、といった食い違いは
 * 目で追うと必ず見落とす。書いてあることと設定を機械的に突き合わせる。
 *
 *   node test/check-presets.js
 */
import { ALL_PRESETS, getPreset } from '../src/rules/presets.js';
import { resolveRules, DEFAULT_RULES } from '../src/rules/defaults.js';

const problems = [];
const note = (id, msg) => problems.push(`${id}: ${msg}`);

/**
 * 既定に無いキーを書いても、合成されるだけで誰も読まない。
 * 「設定したつもりで効いていない」がいちばん見つけにくいので機械で探す。
 */
const SKIP_KEYS = new Set(['meta', 'events', 'specialTiles', 'localYaku', 'customRules']);
// 牌コードを鍵にする表は、中身まで見ない
const CODE_MAPS = /\.(red|gold|blue|star|rainbow|tileCounts|permanentDora|attributeDora|effects)\./;

function findDeadKeys(base, patch, path, out) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return;
  for (const k of Object.keys(patch)) {
    if (SKIP_KEYS.has(k)) continue;
    const here = path ? `${path}.${k}` : k;
    if (!base || typeof base !== 'object' || Array.isArray(base) || !(k in base)) {
      if (!CODE_MAPS.test(`${here}.`)) out.push(here);
      continue;
    }
    findDeadKeys(base[k], patch[k], here, out);
  }
}

/** 説明文とタグをまとめた文字列 */
const textOf = (p) => `${p.name} ${p.description || ''} ${(p.tags || []).join(' ')}`;

for (const p of ALL_PRESETS) {
  const R = resolveRules(p.rules);
  const t = textOf(p);
  const has = (re) => re.test(t);
  const redCount = Object.values(R.dora.red || {}).reduce((a, b) => a + b, 0);

  // --- 赤ドラ
  if (has(/赤なし|赤牌なし/) && redCount > 0) note(p.id, `「赤なし」と書いてあるが赤が${redCount}枚ある`);
  const redClaim = /赤(\d+)枚?/.exec(t);
  if (redClaim && Number(redClaim[1]) !== redCount) {
    note(p.id, `「赤${redClaim[1]}」と書いてあるが実際は${redCount}枚`);
  }

  // --- 一発・裏
  if (has(/一発裏なし|一発・裏ドラなし|一発裏ドラなし|一発なし/)) {
    if (R.dora.ura) note(p.id, '「一発なし」と書いてあるが裏ドラが有効');
    // 裏ドラを切るだけでは足りない。一発は役としても採らない設定が要る
    if (R.win.ippatsu !== false) note(p.id, '「一発なし」と書いてあるが一発が役として付く');
    if (R.bonus.enabled && R.bonus.ippatsu) note(p.id, '「一発なし」と書いてあるが一発の祝儀が付く');
  }

  // --- 局数
  if (has(/東風戦|東風/) && R.game.length !== 'east' && !R.game.alwaysEast) {
    note(p.id, `「東風」と書いてあるが length=${R.game.length}`);
  }
  if (has(/半荘戦|東南戦/) && R.game.length !== 'east_south') {
    note(p.id, `「半荘・東南戦」と書いてあるが length=${R.game.length}`);
  }

  // --- 持ち点・返し点
  const pts = /(\d{4,5})\s*(?:点)?持ち\s*(\d{4,5})\s*(?:点)?返し/.exec(t);
  if (pts) {
    if (Number(pts[1]) !== R.scoring.startingPoints) note(p.id, `「${pts[1]}持ち」と書いてあるが実際は${R.scoring.startingPoints}`);
    if (Number(pts[2]) !== R.scoring.returnPoints) note(p.id, `「${pts[2]}返し」と書いてあるが実際は${R.scoring.returnPoints}`);
  }

  // --- ツモ損
  if (R.game.players === 3) {
    if (has(/ツモ損なし/) && R.sanma.tsumoLoss) note(p.id, '「ツモ損なし」と書いてあるがツモ損が有効');
    if (has(/ツモ損あり/) && !R.sanma.tsumoLoss) note(p.id, '「ツモ損あり」と書いてあるがツモ損が無効');
    // --- 北の扱い
    if (has(/北役牌|北は役牌/) && R.sanma.northMode !== 'yakuhai') note(p.id, '「北役牌」と書いてあるが northMode が違う');
    if (has(/北抜き|北は抜きドラ/) && R.sanma.northMode !== 'nuki') note(p.id, '「北抜き」と書いてあるが northMode が違う');
    // --- 萬子
    if (has(/萬子あり|萬子を抜かず/) && R.sanma.removeManzu) note(p.id, '「萬子あり」と書いてあるが萬子を抜いている');
  }

  // --- トビ
  if (has(/トビなし|飛びなし/) && R.game.tobiEnd) note(p.id, '「トビなし」と書いてあるがトビ終了が有効');
  if (has(/トビあり/) && !R.game.tobiEnd) note(p.id, '「トビあり」と書いてあるがトビ終了が無効');

  // --- 途中流局
  if (has(/途中流局なし/)) {
    const on = ['kyuushuKyuuhai', 'suufonRenda', 'suukaikan', 'suuchaRiichi'].filter((k) => R.renchan[k]);
    if (on.length) note(p.id, `「途中流局なし」と書いてあるが ${on.join('・')} が残っている`);
  }

  // --- 頭ハネ / ダブロン
  if (has(/頭ハネ/) && R.win.doubleRon) note(p.id, '「頭ハネ」と書いてあるがダブロンが有効');

  // --- 流し満貫
  if (has(/流し満貫なし/) && R.ryuukyoku.nagashiMangan) note(p.id, '「流し満貫なし」と書いてあるが有効');

  // --- ドラ表示牌の枚数
  const indShown = R.dora.indicators + (R.dora.bakuDora || 0);
  const indClaim = /(?:表)?ドラ表示牌を?(\d+)枚/.exec(t);
  if (indClaim && Number(indClaim[1]) !== indShown) {
    note(p.id, `「ドラ表示牌${indClaim[1]}枚」と書いてあるが実際は${indShown}枚`);
  }
  if (/常時2枚|常時ドラ2枚|ドラ表示牌は?常に?2枚/.test(t) && indShown !== 2) {
    note(p.id, `「常時2枚」と書いてあるが実際は${indShown}枚`);
  }

  // --- 本場・ノーテン罰符
  const honba = /本場(?:は)?(?:場に)?([\d,]+)\s*点/.exec(t);
  if (honba) {
    const want = Number(honba[1].replace(/,/g, ''));
    if (want !== R.scoring.honbaPoints) note(p.id, `「本場${honba[1]}点」と書いてあるが実際は${R.scoring.honbaPoints}`);
  }
  const noten = /ノーテン罰符(?:は)?(?:場に)?([\d,]+)\s*点/.exec(t);
  if (noten) {
    const want = Number(noten[1].replace(/,/g, ''));
    if (want !== R.ryuukyoku.notenPenalty) note(p.id, `「ノーテン罰符${noten[1]}点」と書いてあるが実際は${R.ryuukyoku.notenPenalty}`);
  }

  // --- ウマ（5-10 / 10-20 / 30-10 のような書き方）
  const uma = /ウマ\s*(\d+)\s*[-−ー]\s*(\d+)/.exec(t);
  if (uma) {
    const [a, b] = [Number(uma[1]), Number(uma[2])].sort((x, y) => x - y);
    const u = R.scoring.uma;
    if (R.game.players === 4) {
      const want = [b, a, -a, -b];
      if (JSON.stringify(u) !== JSON.stringify(want)) {
        note(p.id, `「ウマ${uma[1]}-${uma[2]}」と書いてあるが実際は${JSON.stringify(u)}`);
      }
    }
  }

  // --- 有無をそのまま書いてある特徴
  const onoff = [
    [/オープンリーチあり/, () => R.local.openRiichi.enabled, 'オープンリーチ'],
    [/花牌/, () => R.flowers.enabled, '花牌'],
    [/白ポッチ/, () => R.local.shiroPocchi.enabled, '白ポッチ'],
    // アリスは3つの入口がある。どれかで成立していればよい
    //   ・local.alice     … そのままのアリス
    //   ・local.tulip     … 現物＋両隣まで見るチューリップ
    //   ・華牌「冬」の効果 … 五等サンマ系はこちら
    [/アリス/, () => R.local.alice.enabled || R.local.tulip.enabled
      || Object.values(R.flowers.effects || {})
        .some((list) => (list || []).some((e) => e && e.type === 'alice')),
      'アリス'],
    [/割れ目/, () => R.local.wareme.enabled, '割れ目'],
    [/完全順位戦/, () => R.scoring.rankOnly, '完全順位制'],
    [/切り上げ満貫あり/, () => R.scoring.roundUpMangan, '切り上げ満貫'],
  ];
  for (const [re, get, label] of onoff) {
    if (re.test(t) && !get()) note(p.id, `「${label}」と書いてあるが設定が入っていない`);
  }
  if (/数え役満なし/.test(t) && R.scoring.countedYakuman) note(p.id, '「数え役満なし」と書いてあるが有効');

  // --- 書いても効かない指定
  const dead = [];
  findDeadKeys(DEFAULT_RULES, p.rules, '', dead);
  for (const k of dead) note(p.id, `${k} は設定の項目に無いので、書いても効かない`);

  // --- 実際に使う牌があるか（属性の付け先が無い指定）
  if ((R.meta.autoFixed || []).length) {
    note(p.id, `使えない指定が自動で外された：${R.meta.autoFixed.join(' / ')}`);
  }
}

/**
 * 説明文が言い切っている数字を、設定と1つずつ突き合わせる。
 *
 * 「オープンリーチあり（供託2000）」と書いてあるのに、その設定が
 * そもそも無く、通常と同じ1000点しか払っていなかったことがある。
 * 説明文から自動で読み取るのは難しいので、言い切っているものは
 * ここに書き出して固定する。プリセットを直したらここも直すこと。
 */
const CLAIMS = [
  ['jewel4', 'オープンリーチの供託2000', (R) => R.local.openRiichi.sticks * R.scoring.riichiStick, 2000],
  ['jewel4', '持ち点25,500', (R) => R.scoring.startingPoints, 25500],
  ['jewel4', '流し満貫あり', (R) => R.ryuukyoku.nagashiMangan, true],
  ['toutenkou3', 'ガリ1枚1点', (R) => R.scoring.flat.nukiPoints, 1],
  ['toutenkou3', '役満50点', (R) => R.scoring.flat.yakumanPoints, 50],
  ['toutenkou3', 'ノーテン罰符10点', (R) => R.ryuukyoku.notenPenalty, 10],
  ['mighty3', '本場200点', (R) => R.scoring.honbaPoints, 200],
  ['goto_dice', 'サイコロ3個', (R) => R.local.dice.count, 3],
  ['goto_dice', 'ピンゾロ20倍', (R) => R.local.dice.pinzoroMultiplier, 20],
  ['goto_pocchi', '白ポッチ2枚', (R) => R.local.shiroPocchi.count, 2],
  ['bakudora4', '表ドラ表示牌を3枚', (R) => R.dora.indicators + R.dora.bakuDora, 3],
  ['rocket3', '40符固定', (R) => R.scoring.flat.fuFixed, 40],
  ['mleague4', '数え役満なし', (R) => R.scoring.countedYakuman, false],
  ['standard4', 'ウマ5-10', (R) => R.scoring.uma, [10, 5, -5, -10]],
  ['competition4', '順位点30-10', (R) => R.scoring.uma, [30, 10, -10, -30]],
  ['kansai3', 'ウマ30/-10/-20', (R) => R.scoring.uma, [30, -10, -20]],
  ['standard3', '本場1000点', (R) => R.scoring.honbaPoints, 1000],
  ['standard3', 'ノーテン罰符2000', (R) => R.ryuukyoku.notenPenalty, 2000],
  ['chinitsu3', '14翻で数え役満', (R) => R.scoring.countedYakumanHan, 14],
  ['chinitsu3', '1種8枚', (R) => R.wall.tileCounts.p, 8],
  ['chinitsu3', '筒子と索子が交互', (R) => R.wall.suitRotation, ['p', 's']],
  ['chinitsu3', '裏は青と黄の2色', (R) => R.wall.backColors.colors, ['blue', 'yellow']],
  ['chinitsu3', '5枚目以降もカンに足せる', (R) => R.win.kanBeyondFour, true],
  ['chinitsu3', '七対子の8枚使い', (R) => R.local.chiitoiMultiPair, true],
  ['chinitsu3', '大車輪あり', (R) => R.localYaku.some((y) => y.id === 'daisharin' && y.enabled), true],
  ['chinitsu3', '背一色あり', (R) => R.localYaku.some((y) => y.id === 'seiiisou' && y.enabled), true],
  ['mighty3', '4枚使い七対子あり', (R) => R.local.chiitoiMultiPair, true],
  ['mighty3', '手牌が1枚少ない', (R) => R.local.shouhaiMighty.count, 1],
  ['jewel4', '宝石牌5種類', (R) => R.specialTiles.length, 5],
  ['jewel4', 'ジュエルは1翻', (R) => (R.localYaku.find((y) => y.id === 'jewel') || {}).han, 1],
  ['jewel4', '宝石箱は役満', (R) => (R.localYaku.find((y) => y.id === 'jewelbox') || {}).yakuman, 1],
  ['goto_standard', '常時ドラ2枚', (R) => R.dora.indicators, 2],
  ['goto_standard', '北抜きあり', (R) => R.sanma.northMode, 'nuki'],
  ['goto_standard', '華牌は春夏秋冬', (R) => R.flowers.tiles.length, 4],
];
for (const [id, label, get, want] of CLAIMS) {
  const R = resolveRules(getPreset(id).rules);
  let got;
  try { got = get(R); } catch (e) { got = `読めない（${e.message}）`; }
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    note(id, `説明の「${label}」と中身が違う：${JSON.stringify(got)}（説明では ${JSON.stringify(want)}）`);
  }
}

if (problems.length) {
  console.log('=== 説明と中身の食い違い ===');
  for (const p of problems) console.log(' - ' + p);
  console.log(`\n${problems.length} 件`);
  process.exit(1);
}
console.log(`=== ${ALL_PRESETS.length} プリセット：説明と中身の食い違いなし ===`);
