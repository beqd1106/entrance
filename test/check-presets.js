/**
 * check-presets.js - プリセットの説明文と中身が食い違っていないか調べる
 *
 * 説明に「赤なし」と書いてあるのに赤が入っている、といった食い違いは
 * 目で追うと必ず見落とす。書いてあることと設定を機械的に突き合わせる。
 *
 *   node test/check-presets.js
 */
import { ALL_PRESETS } from '../src/rules/presets.js';
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
  if (has(/一発裏なし|一発・裏ドラなし|一発裏ドラなし/)) {
    if (R.dora.ura) note(p.id, '「一発裏なし」と書いてあるが裏ドラが有効');
    if (R.bonus.enabled && R.bonus.ippatsu) note(p.id, '「一発裏なし」と書いてあるが一発ボーナスが有効');
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

  // --- 書いても効かない指定
  const dead = [];
  findDeadKeys(DEFAULT_RULES, p.rules, '', dead);
  for (const k of dead) note(p.id, `${k} は設定の項目に無いので、書いても効かない`);

  // --- 実際に使う牌があるか（属性の付け先が無い指定）
  if ((R.meta.autoFixed || []).length) {
    note(p.id, `使えない指定が自動で外された：${R.meta.autoFixed.join(' / ')}`);
  }
}

if (problems.length) {
  console.log('=== 説明と中身の食い違い ===');
  for (const p of problems) console.log(' - ' + p);
  console.log(`\n${problems.length} 件`);
  process.exit(1);
}
console.log(`=== ${ALL_PRESETS.length} プリセット：説明と中身の食い違いなし ===`);
