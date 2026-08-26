/**
 * editor.js - 店舗側ルールエディタ
 * JSONを直接編集させない。設定は宣言的スキーマからUIを生成する。
 */
import { resolveRules, clone } from '../../src/rules/defaults.js';
import { ALL_PRESETS } from '../../src/rules/presets.js';
import { validateRules } from '../../src/rules/validator.js';
import { LOCAL_YAKU_DEFS } from '../../src/core/yaku.js';
import { codeToType, typeName } from '../../src/core/tiles.js';
import { explainRules, diffFromBaseline, shortSummary } from '../../src/rules/explain.js';
import { lookupPreset, saveCustomPreset, loadCustomPresets, deleteCustomPreset } from './custom.js';
import { h, clear, icon, chip, field, switchRow, stepper, sectionHead, toggleRow, tileEl } from './ui.js';
import { hasServer, draftRules } from './api.js';

const get = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
const deepMergePatch = (a, b) => {
  if (b === undefined || b === null) return a;
  if (typeof a !== 'object' || a === null || Array.isArray(a) || Array.isArray(b)) return b;
  const o = { ...a };
  for (const k of Object.keys(b)) o[k] = deepMergePatch(a[k], b[k]);
  return o;
};
const set = (o, p, v) => {
  const ks = p.split('.');
  let t = o;
  for (let i = 0; i < ks.length - 1; i++) t = t[ks[i]];
  t[ks[ks.length - 1]] = v;
};

const LENGTHS = [
  { value: 'east', label: '東風戦' },
  { value: 'east_south', label: '半荘戦' },
  { value: 'ikkyoku', label: '一局清算' },
];
const REPEATS = [
  { value: 'agari', label: '和了連荘' },
  { value: 'tenpai', label: 'テンパイ連荘' },
  { value: 'always', label: '親流れなし' },
  { value: 'none', label: '連荘なし' },
];
const NORTH = [
  { value: 'nuki', label: '抜きドラ' },
  { value: 'yakuhai', label: '役牌' },
  { value: 'normal', label: '通常牌' },
];
const EFFECT_TYPES = [
  { value: 'dora', label: 'ドラ+n' },
  { value: 'han', label: '翻数+n' },
  { value: 'bonus', label: 'ボーナスBP+n' },
  { value: 'rankUp', label: '打点ランクアップ' },
  { value: 'almighty', label: 'オールマイティ' },
  { value: 'bonusMultiply', label: 'ボーナス×n' },
  { value: 'scoreMultiply', label: '点数×n' },
  { value: 'alice', label: 'アリス発動' },
  { value: 'tulip', label: 'チューリップ発動' },
  { value: 'dice', label: 'サイコロチャンス発動' },
  { value: 'yakuman', label: '役満扱い' },
  { value: 'bonusByNumber', label: 'BP＝牌の数字×n（8索なら8×n）' },
  { value: 'bonusByKind', label: 'BP＋n（字牌なら2倍）' },
];
/** 効果の値に付ける単位。数字だけだと何を設定しているか分からないため */
const EFFECT_UNIT = {
  dora: '枚ぶん', han: '翻', bonus: 'BP', rankUp: '段階', bonusMultiply: '倍', scoreMultiply: '倍',
  alice: '回', tulip: '回', bonusByNumber: '倍', bonusByKind: 'BP',
};
const NO_VALUE_EFFECTS = new Set(['almighty', 'dice', 'yakuman']);
const TIMINGS = [
  { value: 'win', label: '和了時' },
  { value: 'draw', label: 'ツモった瞬間' },
  { value: 'always', label: '手牌にあるだけで' },
];
const DESIGNS = ['none', 'blue', 'silver', 'green', 'gold', 'red', 'star', 'rainbow'];
/** ウマの定番。雀荘でよく見る組み合わせを、選ぶだけで入るようにする */
const UMA_PRESETS = [
  { key: '5-10', label: 'ゴットー（5-10）', four: [10, 5, -5, -10], three: [10, 0, -10] },
  { key: '10-20', label: 'ワンツー（10-20）', four: [20, 10, -10, -20], three: [20, 0, -20] },
  { key: '10-30', label: 'ワンスリー（10-30）', four: [30, 10, -10, -30], three: [30, 0, -30] },
  { key: '20-30', label: 'ツースリー（20-30）', four: [30, 20, -20, -30], three: [30, 0, -30] },
  { key: '15-5', label: '5-15（Mリーグ型）', four: [15, 5, -5, -15], three: [15, -5, -10] },
];
/** 特殊牌にできる牌。数牌は1〜9すべて、字牌も全種。金8索・虹3筒のような指定に対応する */
const TILE_SUITS = [
  { key: 'm', label: '萬子', codes: ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m'] },
  { key: 'p', label: '筒子', codes: ['1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p'] },
  { key: 's', label: '索子', codes: ['1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s'] },
  { key: 'z', label: '字牌', codes: ['1z', '2z', '3z', '4z', '5z', '6z', '7z'] },
];
const TILE_CHOICES = TILE_SUITS.flatMap((g) => g.codes);
/** 見た目の名前。牌の名前を自動で作るときにも使う */
const DESIGN_LABELS = {
  none: 'ふつう', blue: '青', silver: '銀', green: '翠', gold: '金', red: '赤', star: '星', rainbow: '虹',
};
const FLOWER_EFFECTS = [
  { value: 'bonusPerTile', label: '即時ボーナスBP' },
  { value: 'rankUp', label: '打点ランクアップ' },
  { value: 'doubleDoraFives', label: '5牌がダブルドラ' },
  { value: 'alice', label: '和了時アリス' },
  { value: 'dora', label: 'ドラ+n' },
  { value: 'han', label: '翻数+n' },
];
const FLOWER_KEYS = [['spring', '春'], ['summer', '夏'], ['autumn', '秋'], ['winter', '冬']];

/**
 * 翻数を変えることがある標準役。
 * 雀荘で実際に取り決めを見かけるものだけを並べる（全役を出しても選べない）。
 */
const MAJOR_YAKU = [
  { name: '清一色', base: '門前6翻／鳴き5翻' },
  { name: '混一色', base: '門前3翻／鳴き2翻' },
  { name: '七対子', base: '2翻' },
  { name: '一気通貫', base: '門前2翻／鳴き1翻' },
  { name: '三色同順', base: '門前2翻／鳴き1翻' },
  { name: '対々和', base: '2翻' },
  { name: '混老頭', base: '2翻' },
  { name: '三暗刻', base: '2翻' },
  { name: '純全帯幺九', base: '門前3翻／鳴き2翻' },
  { name: '一発', base: '1翻' },
  { name: '裏ドラ', base: 'ドラ扱い' },
  { name: '国士無双', base: '役満' },
  { name: '四暗刻', base: '役満' },
  { name: '大三元', base: '役満' },
  { name: '九蓮宝燈', base: '役満' },
];

/** 基本パネルのスキーマ（advanced:true は「詳細設定」に隠す） */
/**
 * 足していける特殊ルール。
 *
 * 一般ルールに無いものを、必要なぶんだけ足していく形にする。
 * 200項目を最初から全部並べると、店の人は「どれを触ればいいのか」で
 * 止まってしまう。実際のハウスルールは「一般ルール＋いくつかの特殊」
 * という形なので、画面もその形に合わせる。
 *
 * すでに使っているルール（プリセットを読み込んだときなど）は
 * 追加済みとして最初から出る。
 */
const ADDABLE = [
  {
    id: 'wall', title: '牌山の構成', desc: '牌の枚数・2セット混ぜ・王牌の枚数',
    isOn: (R) => Object.keys(R.wall.tileCounts || {}).length > 0
      || (R.wall.backColors && R.wall.backColors.enabled)
      || (R.wall.deadWallSize ?? 14) !== 14 || R.local.chiitoiMultiPair || R.flowers.manualDraw,
    turnOn: (R) => { R.wall.deadWallSize = R.wall.deadWallSize ?? 14; R.wall.tileCounts = R.wall.tileCounts || {}; },
    turnOff: (R) => {
      R.wall.tileCounts = {};
      if (R.wall.backColors) R.wall.backColors.enabled = false;
      R.wall.deadWallSize = 14; R.local.chiitoiMultiPair = false; R.flowers.manualDraw = false;
    },
  },
  {
    id: 'localRules', title: 'ローカルルール', desc: '白ポッチ・アリス・割れ目・オープンリーチなど',
    isOn: (R) => R.local.shiroPocchi.enabled || R.local.alice.enabled || R.local.tulip.enabled
      || R.local.wareme.enabled || R.local.openRiichi.enabled || R.local.dice.enabled
      || R.local.yakitori.enabled || R.local.binta.enabled || R.local.tobiBonus.enabled
      || R.local.shouhaiMighty.enabled,
    turnOn: () => {},
    turnOff: (R) => {
      for (const k of ['shiroPocchi', 'alice', 'tulip', 'wareme', 'openRiichi', 'dice', 'yakitori', 'binta', 'tobiBonus', 'shouhaiMighty']) {
        if (R.local[k]) R.local[k].enabled = false;
      }
    },
  },
  {
    id: 'flowers', title: '華牌（春夏秋冬）', desc: '抜くと効果が出る4枚の牌',
    isOn: (R) => R.flowers.enabled,
    turnOn: (R) => { R.flowers.enabled = true; },
    turnOff: (R) => { R.flowers.enabled = false; },
  },
  {
    id: 'specialTiles', title: '特殊牌', desc: '金8索・虹3筒のような、店ならではの牌',
    isOn: (R) => (R.specialTiles || []).length > 0,
    turnOn: (R) => { R.specialTiles = R.specialTiles || []; },
    turnOff: (R) => { R.specialTiles = []; },
  },
  {
    id: 'localYaku', title: 'ローカル役', desc: '大車輪・三連刻・背一色など24種',
    isOn: (R) => (R.localYaku || []).length > 0,
    turnOn: (R) => { R.localYaku = R.localYaku || []; },
    turnOff: (R) => { R.localYaku = []; },
  },
  {
    id: 'yakuOverrides', title: '標準役の翻数', desc: '「清一色は役満」のような取り決め',
    isOn: (R) => Object.keys(R.yakuOverrides || {}).length > 0,
    turnOn: (R) => { R.yakuOverrides = R.yakuOverrides || {}; },
    turnOff: (R) => { R.yakuOverrides = {}; },
  },
  {
    id: 'events', title: 'イベント卓', desc: '日替わりで一部のルールを上書きする卓',
    isOn: (R) => (R.events || []).length > 0,
    turnOn: (R) => { R.events = R.events || []; },
    turnOff: (R) => { R.events = []; },
  },
];

/**
 * 最初に触るところ。
 *
 * 設定は全部で200項目近くあり、分野に分けても「どこから手を付けるか」が
 * 分からない。店の人がまず決めるのは人数・長さ・点数・赤・喰いタンの5つ
 * なので、それだけを先頭にまとめて出す。ここを触れば形にはなる。
 */
const QUICK = {
  title: 'まずここだけ',
  items: [
    { type: 'players' },
    { type: 'select', path: 'game.length', label: '対局の長さ', options: LENGTHS },
    { type: 'number', path: 'scoring.startingPoints', label: '持ち点', step: 1000 },
    { type: 'number', path: 'scoring.returnPoints', label: '返し点', step: 1000 },
    { type: 'switch', path: 'win.kuitan', label: '喰いタン', desc: '鳴いたタンヤオを認める' },
    { type: 'switch', path: 'game.tobiEnd', label: 'トビ終了', desc: '誰かが0点未満になったら終了' },
  ],
};

const GROUPS = [
  {
    title: '基本',
    items: [
      { type: 'players' },
      { type: 'select', path: 'game.length', label: '対局の長さ', options: LENGTHS },
      { type: 'select', path: 'renchan.dealerRepeat', label: '連荘', options: REPEATS },
      { type: 'switch', path: 'game.tobiEnd', label: 'トビ終了', desc: '誰かが0点未満になったら終了' },
      { type: 'switch', path: 'game.agariYame', label: 'アガリやめ', desc: 'オーラス親がトップなら終局できる' },
      { type: 'switch', path: 'game.westEntry', label: '西入', desc: '返し点に届かない場合は延長', advanced: true },
      { type: 'switch', path: 'game.alwaysEast', label: '常に東場', desc: '場風が変わらない（東天紅系）', advanced: true },
      {
        type: 'select', path: 'game.dealerRule', label: '次局の親', advanced: true,
        options: [{ value: 'rotate', label: '順番に交代' }, { value: 'winner', label: '前局の和了者' }],
      },
      { type: 'switch', path: 'game.tobiZeroIsEnd', label: '0点ちょうどもトビ', advanced: true },
      { type: 'switch', path: 'game.hakoshita', label: '箱下計算あり', advanced: true },
    ],
  },
  {
    title: '点数',
    items: [
      {
        type: 'select', path: 'scoring.mode', label: '点数体系',
        options: [{ value: 'standard', label: '通常（翻・符）' }, { value: 'flat', label: '東天紅系（点計算）' }],
        desc: '東天紅系はロン1人分・ツモ2人分の独自体系です',
      },
      { type: 'number', path: 'scoring.startingPoints', label: '持ち点', step: 1000 },
      { type: 'number', path: 'scoring.returnPoints', label: '返し点', step: 1000 },
      { type: 'uma' },
      { type: 'switch', path: 'scoring.useFu', label: '符計算あり', desc: 'オフにすると30符固定' },
      { type: 'switch', path: 'scoring.roundUpMangan', label: '切り上げ満貫' },
      { type: 'switch', path: 'scoring.rankOnly', label: '完全順位制', desc: '素点を使わず順位点のみ' },
      { type: 'switch', path: 'scoring.shizumiUma', label: '沈みウマ', desc: '返し点未満に追加のマイナス' },
      { type: 'number', path: 'scoring.shizumiUmaValue', label: '沈みウマの値', step: 5, advanced: true },
      { type: 'number', path: 'scoring.countedYakumanHan', label: '数え役満の開始翻数', step: 1, advanced: true },
      { type: 'number', path: 'ryuukyoku.notenPenalty', label: 'ノーテン罰符（場）', step: 1000, advanced: true },
      { type: 'number', path: 'scoring.honbaPoints', label: '1本場の点数', step: 100, advanced: true },
      { type: 'switch', path: 'scoring.umaZeroSum', label: 'トップのウマを自動計算', advanced: true },
      { type: 'umaPreset' },
      {
        type: 'select', path: 'scoring.rawRounding', label: '素点の丸め方',
        options: [
          { value: 'none', label: '丸めない（競技寄り）' },
          { value: 'go', label: '五捨六入（フリー雀荘の定番）' },
          { value: 'ceil', label: '切り上げ' },
          { value: 'floor', label: '切り捨て' },
        ],
        desc: '最終スコアを出すときに、1000点未満をどう扱うか',
      },
      {
        type: 'switch', path: 'scoring.kubi.enabled', label: 'クビ（規定点に届かないとマイナス）',
        desc: '終局時に規定の持ち点へ届かなかった人のスコアを引きます（四万点クビなど）',
      },
      { type: 'number', path: 'scoring.kubi.threshold', label: 'クビの規定点', step: 1000 },
      { type: 'number', path: 'scoring.kubi.penalty', label: 'クビのスコア', step: 1 },
      { type: 'switch', path: 'scoring.kubi.exceptTop', label: 'トップは免除', advanced: true },
      { type: 'switch', path: 'scoring.okaToTop', label: 'オカをトップへ', advanced: true },
      {
        type: 'switch', path: 'game.pointCapEnd.enabled', label: '点数で打ち切り',
        desc: '誰かが指定の点数に達したら、その局で終わります（四万点クビなど）',
      },
      { type: 'number', path: 'game.pointCapEnd.points', label: '打ち切り点', step: 1000 },
    ],
  },
  {
    title: '料金の案内',
    items: [
      {
        type: 'switch', path: 'fees.show', label: '料金を表示する',
        desc: '対局には影響しません。店舗ページと対局前の確認に出ます',
      },
      { type: 'number', path: 'fees.perGame', label: '1半荘（円）', step: 50 },
      { type: 'number', path: 'fees.seat', label: '席料・時間料（円／時間）', step: 100 },
      { type: 'text', path: 'fees.note', label: '補足', placeholder: '学生割あり／初回1時間無料 など' },
    ],
  },
  {
    title: '鳴き・和了',
    items: [
      { type: 'switch', path: 'win.kuitan', label: '喰いタン' },
      { type: 'switch', path: 'win.atozuke', label: '後付け', desc: 'オフで完全先付け' },
      { type: 'switch', path: 'win.kuikae', label: '食い替え', advanced: true },
      { type: 'switch', path: 'win.doubleRon', label: 'ダブロン', advanced: true },
      { type: 'switch', path: 'win.formalTenpai', label: '形式テンパイを認める', advanced: true },
      { type: 'switch', path: 'win.ankanAfterRiichi', label: 'リーチ後の暗槓', advanced: true },
      { type: 'switch', path: 'win.riichiWithoutTsumoban', label: 'ツモ番なしリーチ', advanced: true },
      { type: 'switch', path: 'renchan.kyuushuKyuuhai', label: '九種九牌', advanced: true },
      { type: 'switch', path: 'renchan.suufonRenda', label: '四風連打', advanced: true },
      { type: 'switch', path: 'ryuukyoku.nagashiMangan', label: '流し満貫', advanced: true },
      { type: 'switch', path: 'ryuukyoku.nagashiYakuman', label: '流し満貫を役満にする', desc: '流し満貫を役満として払う店があります', advanced: true },
    ],
  },
];

/**
 * 特殊牌テンプレート
 *   「どんな効果を作れるのか」が分からない人向けに、代表的な形を用意する。
 *   選ぶと中身が入った状態で追加され、あとから自由に編集できる。
 */
const SPECIAL_TEMPLATES = [
  {
    key: 'bonus', label: '持っているとボーナス',
    desc: '手牌に入れて和了すると、ゲーム内ポイントがもらえます。いちばん簡単な形です。',
    make: () => ({
      name: '青5索', tile: '5s', count: 1, color: 'blue', activationTiming: 'win',
      description: '和了に含めるとボーナスがもらえます。',
      effects: [{ type: 'bonus', value: 2 }], conditions: {},
    }),
  },
  {
    key: 'dora', label: 'ドラが増える',
    desc: '持っているだけでドラが増え、打点が上がります。',
    make: () => ({
      name: '銀5筒', tile: '5p', count: 1, color: 'silver', activationTiming: 'win',
      description: 'ドラ2枚分として数えます。',
      effects: [{ type: 'dora', value: 2 }], conditions: {},
    }),
  },
  {
    key: 'almighty', label: 'リーチ後はオールマイティ',
    desc: 'リーチしたあとにツモると、好きな牌の代わりに使えます。逆転の起点になります。',
    make: () => ({
      name: '琥珀白', tile: '5z', count: 1, color: 'gold', activationTiming: 'win',
      description: 'リーチ後のツモで、好きな牌として使えます。',
      effects: [{ type: 'almighty' }, { type: 'bonus', value: 3 }],
      conditions: { riichiOnly: true, tsumoOnly: true },
    }),
  },
  {
    key: 'han', label: '打点が上がる',
    desc: '和了したときに翻が増えます。門前のときだけ有効にもできます。',
    make: () => ({
      name: '翠5萬', tile: '5m', count: 1, color: 'green', activationTiming: 'win',
      description: '門前で和了すると1翻増えます。',
      effects: [{ type: 'han', value: 1 }], conditions: { menzenOnly: true },
    }),
  },
  {
    key: 'draw', label: 'ツモった瞬間にボーナス',
    desc: '和了しなくても、引いた瞬間にポイントが入ります。盛り上がりやすい形です。',
    make: () => ({
      name: '星1筒', tile: '1p', count: 1, color: 'star', activationTiming: 'draw',
      description: '引いた瞬間にボーナスがもらえます。',
      effects: [{ type: 'bonus', value: 5 }], conditions: {},
    }),
  },
  {
    key: 'alice', label: '和了するとアリス発動',
    desc: '和了したあとに牌をめくるチャンスが生まれます。',
    make: () => ({
      name: '紫5索', tile: '5s', count: 1, color: 'blue', activationTiming: 'win',
      description: '和了するとアリスが発動します。',
      effects: [{ type: 'alice', value: 2 }], conditions: {},
    }),
  },
];

export function renderEditor(root, params) {
  const baseId = params.preset || 'standard4';
  const base = lookupPreset(baseId);
  const state = {
    id: String(base.id).startsWith('custom_') ? base.id : `custom_${Date.now().toString(36)}`,
    name: base.name.startsWith('カスタム') ? base.name : `カスタム：${base.name}`,
    rules: resolveRules(base.rules),
    baseId,
    view: 'diff',
  };

  clear(root);
  const sec = h('section.section', h('div.wrap'));
  const wrap = sec.firstChild;
  const left = h('div');
  const right = h('div.sticky-side');
  wrap.appendChild(sectionHead('01', '店舗ルールエディタ',
    'プログラミングは不要です。設定を変えると、お客様向けの説明文もCPU対局の挙動も同時に変わります。'));
  wrap.appendChild(h('div.editor-grid', left, right));
  root.appendChild(sec);

  const rerender = () => {
    renderLeft(left, state, rerender);
    renderRight(right, state, rerender);
  };
  rerender();
  return () => {};
}

// ---------------------------------------------------------------------------
/**
 * 1項目ぶんの操作。
 * あとから「検索で絞る」「変えたところだけ見る」ができるよう、
 * 探すための言葉と、どの設定かを要素に持たせておく。
 */
function control(item, R, onChange) {
  const el = buildControl(item, R, onChange);
  if (el && el.dataset) {
    el.dataset.search = [item.label, item.desc, item.path].filter(Boolean).join(' ');
    if (item.path) el.dataset.path = item.path;
  }
  return el;
}

function buildControl(item, R, onChange) {
  const v = item.path ? get(R, item.path) : null;
  switch (item.type) {
    case 'switch':
      return switchRow(item.label, item.desc, !!v, (nv) => { set(R, item.path, nv); onChange(); });
    case 'number': {
      const inp = h('input', { type: 'number', value: String(v), step: String(item.step || 1) });
      inp.addEventListener('change', () => { set(R, item.path, Number(inp.value)); onChange(); });
      return field(item.label, inp, item.desc);
    }
    case 'text': {
      const inp = h('input', { type: 'text', value: v == null ? '' : String(v), placeholder: item.placeholder || '' });
      inp.addEventListener('change', () => { set(R, item.path, inp.value); onChange(); });
      return field(item.label, inp, item.desc);
    }
    case 'select': {
      const s = h('select');
      for (const o of item.options) s.appendChild(h('option', { value: o.value, text: o.label, selected: v === o.value }));
      s.addEventListener('change', () => { set(R, item.path, s.value); onChange(); });
      return field(item.label, s, item.desc);
    }
    case 'players': {
      const row = toggleRow(
        [{ label: '四人麻雀', value: 4 }, { label: '三人麻雀', value: 3 }],
        R.game.players,
        (nv) => {
          R.game.players = nv;
          if (nv === 3) {
            R.scoring.uma = [15, -5, -10];
            if (R.scoring.startingPoints === 25000) { R.scoring.startingPoints = 35000; R.scoring.returnPoints = 40000; }
          } else {
            R.scoring.uma = [15, 5, -5, -15];
            if (R.scoring.startingPoints === 35000) { R.scoring.startingPoints = 25000; R.scoring.returnPoints = 30000; }
          }
          onChange();
        });
      return field('人数', row);
    }
    case 'umaPreset': {
      const three = R.game.players === 3;
      const cur = UMA_PRESETS.find((u) => {
        const arr = three ? u.three : u.four;
        return arr.length === R.scoring.uma.length && arr.every((v, i) => v === R.scoring.uma[i]);
      });
      const box = h('div.row.gap-8.wrapflex');
      for (const u of UMA_PRESETS) {
        const on = cur && cur.key === u.key;
        const b = h(`button.chip.chip-btn${on ? '.on' : ''}`, { type: 'button', text: u.label });
        b.addEventListener('click', () => {
          R.scoring.uma = [...(three ? u.three : u.four)];
          onChange();
        });
        box.appendChild(b);
      }
      return field('ウマ（よくある組み合わせ）', box, '押すとその値が入ります。下の欄で細かく直せます');
    }
    case 'uma': {
      const row = h('div.row.gap-8.wrapflex');
      R.scoring.uma.forEach((u, i) => {
        const inp = h('input', { type: 'number', value: String(u), step: '5', style: { width: '76px' } });
        inp.addEventListener('change', () => { R.scoring.uma[i] = Number(inp.value); onChange(); });
        row.appendChild(h('div', h('div.tiny.muted', { text: `${i + 1}着` }), inp));
      });
      return field('ウマ（順位点）', row);
    }
    default: return h('div');
  }
}

function group(title, items, R, onChange) {
  const basic = items.filter((i) => !i.advanced);
  const adv = items.filter((i) => i.advanced);
  const box = h('div.card.card-pad', { style: { marginBottom: '18px' } },
    h('h3', { style: { fontSize: '16px', marginBottom: '12px' }, text: title }),
    basic.map((i) => control(i, R, onChange)));
  if (adv.length) {
    box.appendChild(h('details.adv', { style: { marginTop: '12px', marginBottom: '0' } },
      h('summary', { text: '詳細設定' }),
      h('div', adv.map((i) => control(i, R, onChange)))));
  }
  return box;
}

const typeOfCode = (code) => {
  const n = Number(code[0]);
  const s = code[1];
  if (s === 'z') return 26 + n;
  return { m: 0, p: 9, s: 18 }[s] + n - 1;
};

function renderLeft(left, state, onChange) {
  const R = state.rules;
  clear(left);

  const nameInp = h('input', { type: 'text', value: state.name });
  nameInp.addEventListener('input', () => { state.name = nameInp.value; });
  const baseSel = h('select');
  for (const p of [...ALL_PRESETS, ...loadCustomPresets()]) {
    baseSel.appendChild(h('option', { value: p.id, text: p.name, selected: p.id === state.baseId }));
  }
  baseSel.addEventListener('change', () => { location.hash = `#/editor?preset=${baseSel.value}`; });
  left.appendChild(h('div.card.card-pad', { style: { marginBottom: '18px' } },
    field('ルール名（お客様に表示されます）', nameInp),
    field('ベースにするルール', baseSel, '選び直すとその設定を読み込みます')));

  // 最初に触るところ。分野で絞り込んでも残るよう、見出しを持たせない。
  // 探す欄より前に置く（まずここを見てほしいので）
  const quick = h('div.card.card-pad.quick-card', { style: { marginBottom: '18px' } },
    h('div.quick-head',
      h('b', { text: QUICK.title }),
      h('span.tiny.muted', { text: '店の性格はだいたいこの5つで決まります' })));
  for (const item of QUICK.items) {
    const row = control(item, R, onChange);
    if (row) quick.appendChild(row);
  }
  left.appendChild(quick);

  // 足していける特殊ルール。使っていないものは画面に出さない
  left.appendChild(addPanel(R, onChange));
  const using = (id) => {
    const a = ADDABLE.find((x) => x.id === id);
    return a ? a.isOn(R) : true;
  };

  // 設定は項目が多い。探せること・変えたところが分かることを優先する
  left.appendChild(filterBar(left, state));

  const draft = draftCard(state, onChange);
  if (draft) left.appendChild(draft);

  for (const g of GROUPS) left.appendChild(group(g.title, g.items, R, onChange));

  // --- ドラ
  const doraBox = h('div.card.card-pad', { style: { marginBottom: '18px' } },
    h('h3', { style: { fontSize: '16px', marginBottom: '12px' }, text: 'ドラ' }));
  doraBox.appendChild(field('表ドラ表示牌',
    stepper(R.dora.indicators, (v) => { R.dora.indicators = v; onChange(); }, 0, 5),
    '2枚以上にすると「常時ドラ2枚」のような設定になります'));
  const counter = (label, mapKey, code, info) => {
    const map = R.dora[mapKey];
    const cur = map[code] || 0;
    return h('div.row.gap-12', { style: { padding: '6px 0', borderBottom: '1px solid var(--line)' } },
      tileEl(info, { size: 'sm' }),
      h('div.grow', { style: { fontSize: '13.5px' }, text: label }),
      stepper(cur, (v) => { if (v) map[code] = v; else delete map[code]; onChange(); }, 0, 4));
  };
  if (!(R.game.players === 3 && R.sanma.removeManzu)) {
    doraBox.appendChild(counter('赤5萬', 'red', '5m', { t: typeOfCode('5m'), red: true }));
  }
  doraBox.appendChild(counter('赤5筒', 'red', '5p', { t: typeOfCode('5p'), red: true }));
  doraBox.appendChild(counter('赤5索', 'red', '5s', { t: typeOfCode('5s'), red: true }));
  doraBox.appendChild(counter('金5筒', 'gold', '5p', { t: typeOfCode('5p'), gold: true }));
  doraBox.appendChild(counter('金5索', 'gold', '5s', { t: typeOfCode('5s'), gold: true }));
  doraBox.appendChild(counter('青5索', 'blue', '5s', { t: typeOfCode('5s'), blue: true }));
  doraBox.appendChild(counter('星1筒', 'star', '1p', { t: typeOfCode('1p'), star: true }));
  doraBox.appendChild(field('爆ドラ（追加でめくる表示牌）',
    stepper(R.dora.bakuDora || 0, (v) => { R.dora.bakuDora = v; onChange(); }, 0, 4),
    '表ドラ表示牌をさらに増やすインフレ設定'));
  doraBox.appendChild(h('details.adv', { style: { marginTop: '12px', marginBottom: '0' } },
    h('summary', { text: '詳細設定' }),
    h('div',
      switchRow('裏ドラ', '', R.dora.ura, (v) => { R.dora.ura = v; onChange(); }),
      switchRow('槓ドラ', '', R.dora.kanDora, (v) => { R.dora.kanDora = v; onChange(); }),
      switchRow('槓裏', '', R.dora.kanUra, (v) => { R.dora.kanUra = v; onChange(); }),
      switchRow('金牌をドラとして数える', '', R.dora.goldIsDora, (v) => { R.dora.goldIsDora = v; onChange(); }),
      h('div.tiny.muted', { style: { marginTop: '8px' }, text: '1枚あたり何枚分のドラとして数えるか' }),
      h('div.row.gap-8.wrapflex', [['red', '赤'], ['gold', '金'], ['blue', '青'], ['star', '星'], ['rainbow', '虹']].map(([k, label]) => {
        const inp = h('input', { type: 'number', value: String((R.dora.attributeDora || {})[k] ?? 1), step: '1', style: { width: '64px' } });
        inp.addEventListener('change', () => {
          R.dora.attributeDora = { ...(R.dora.attributeDora || {}), [k]: Number(inp.value) };
          onChange();
        });
        return h('div', h('div.tiny.muted', { text: label }), inp);
      })))));
  left.appendChild(doraBox);

  // --- 牌山の構成
  // 清一色ゲームのように、牌の枚数そのものが変わるルールがある。
  // 設定は効いているのに画面に無いと「壊れている」ように見えるので、
  // ここで見て触れるようにしておく。
  const wallBox = h('div.card.card-pad', { style: { marginBottom: '18px' } },
    h('h3', { style: { fontSize: '16px', marginBottom: '12px' }, text: '牌山の構成' }));
  wallBox.appendChild(h('p.tiny.muted', { style: { margin: '0 0 12px' },
    text: '同じ牌を何枚入れるか、全自動卓の2セットを混ぜるか。清一色ゲームのように、牌の構成そのものが変わるルールで使います。' }));
  const wallCount = (label, code, desc) => {
    const cur = (R.wall.tileCounts || {})[code] ?? 4;
    return h('div.row.gap-12', { style: { padding: '6px 0', borderBottom: '1px solid var(--line)' } },
      tileEl({ t: typeOfCode(code) }, { size: 'sm' }),
      h('div.grow',
        h('div', { style: { fontSize: '13.5px' }, text: label }),
        desc ? h('div.tiny.muted', { text: desc }) : null),
      stepper(cur, (v) => {
        R.wall.tileCounts = R.wall.tileCounts || {};
        if (v === 4) delete R.wall.tileCounts[code];
        else R.wall.tileCounts[code] = v;
        onChange();
      }, 0, 8));
  };
  wallBox.appendChild(wallCount('五萬の枚数', '5m', '清一色ゲームは8枚（2セット分）'));
  wallBox.appendChild(wallCount('五筒の枚数', '5p', ''));
  wallBox.appendChild(wallCount('五索の枚数', '5s', ''));
  wallBox.appendChild(switchRow('2セットの牌を混ぜる',
    '牌の裏が青と黄の2色になります。「背一色」を採用するときはこれが要ります',
    !!(R.wall.backColors && R.wall.backColors.enabled),
    (v) => {
      R.wall.backColors = R.wall.backColors || { colors: ['blue', 'yellow'] };
      R.wall.backColors.enabled = v;
      onChange();
    }));
  wallBox.appendChild(field('王牌の枚数',
    stepper(R.wall.deadWallSize ?? 14, (v) => { R.wall.deadWallSize = v; onChange(); }, 6, 20),
    '一般的なのは14枚。少なくすると「ドラ表示牌の隣まで引ききる」形に、多くすると17枚残しのような形になります'));
  wallBox.appendChild(switchRow('華牌は自分で抜く',
    '引いた瞬間に自動で抜かず、タップして抜きます（華牌を使うルールのとき）',
    !!R.flowers.manualDraw,
    (v) => { R.flowers.manualDraw = v; onChange(); }));
  wallBox.appendChild(switchRow('七対子の8枚使い',
    '同じ牌4枚を2つの対子として七対子に数えます（同じ牌が5枚以上あるルール向け）',
    !!R.local.chiitoiMultiPair,
    (v) => { R.local.chiitoiMultiPair = v; onChange(); }));
  if (using('wall')) left.appendChild(wallBox);

  // --- 三麻
  if (R.game.players === 3) {
    left.appendChild(h('div.card.card-pad', { style: { marginBottom: '18px' } },
      h('h3', { style: { fontSize: '16px', marginBottom: '12px' }, text: '三人麻雀' }),
      control({ type: 'switch', path: 'sanma.removeManzu', label: '萬子2〜8を抜く' }, R, onChange),
      control({ type: 'select', path: 'sanma.northMode', label: '北の扱い', options: NORTH }, R, onChange),
      control({ type: 'switch', path: 'sanma.kitaIsDora', label: '抜いた北をドラにする' }, R, onChange),
      control({ type: 'switch', path: 'sanma.tsumoLoss', label: 'ツモ損あり', desc: 'オフで丸取り（4人麻雀と同額）' }, R, onChange),
      field('残す萬子', h('div.row.gap-4.wrapflex', ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m'].map((code) => {
        const on = (R.sanma.manzuKeep || []).includes(code);
        const c = h('button.chip.chip-btn', { type: 'button', class: on ? 'on' : '', text: code });
        c.addEventListener('click', () => {
          const cur = new Set(R.sanma.manzuKeep || []);
          if (on) cur.delete(code); else cur.add(code);
          R.sanma.manzuKeep = [...cur].sort();
          onChange();
        });
        return c;
      })), '「萬子を抜く」がオンのとき、ここで選んだ萬子だけが残ります（東天紅は1m・5m・9m）'),
      field('北以外の抜き牌（ガリ）', h('div.row.gap-4.wrapflex', ['1m', '5m', '9m', '1p', '9p', '1s', '9s'].map((code) => {
        const on = (R.sanma.extraNukiTiles || []).includes(code);
        const c = h('button.chip.chip-btn', { type: 'button', class: on ? 'on' : '', text: code });
        c.addEventListener('click', () => {
          const cur = new Set(R.sanma.extraNukiTiles || []);
          if (on) cur.delete(code); else cur.add(code);
          R.sanma.extraNukiTiles = [...cur];
          onChange();
        });
        return c;
      }))),
      h('details.adv', { style: { marginTop: '12px', marginBottom: '0' } },
        h('summary', { text: '詳細設定' }),
        h('div',
          control({ type: 'switch', path: 'sanma.northIsYakuhai', label: '手牌の北を役牌にする' }, R, onChange),
          control({ type: 'switch', path: 'sanma.northRonOk', label: '抜いた北でロン可' }, R, onChange),
          control({ type: 'number', path: 'sanma.kitaBonus', label: '北1枚あたりのBP', step: 1 }, R, onChange)))));
  }

  // --- ローカルルール
  const local = h('div.card.card-pad', { style: { marginBottom: '18px' } },
    h('h3', { style: { fontSize: '16px', marginBottom: '12px' }, text: 'ローカルルール' }));
  const toggleWithDetail = (label, path, desc, detail) => {
    const on = get(R, `${path}.enabled`);
    local.appendChild(switchRow(label, desc, on, (v) => { set(R, `${path}.enabled`, v); onChange(); }));
    if (on && detail) {
      local.appendChild(h('div', {
        style: { paddingLeft: '12px', borderLeft: '2px solid var(--brass-3)', margin: '4px 0 12px' },
      }, detail()));
    }
  };
  toggleWithDetail('白ポッチ', 'local.shiroPocchi', '白の1枚に赤い点。オールマイティにもできます', () => h('div',
    field('枚数', stepper(R.local.shiroPocchi.count, (v) => { R.local.shiroPocchi.count = Math.max(1, v); onChange(); }, 1, 4)),
    control({
      type: 'select', path: 'local.shiroPocchi.mode', label: '扱い',
      options: [{ value: 'bonus', label: 'ボーナスのみ' }, { value: 'almighty', label: 'オールマイティのみ' }, { value: 'both', label: '両方' }],
    }, R, onChange),
    control({
      type: 'select', path: 'local.shiroPocchi.almightyCondition', label: 'オールマイティになる条件',
      options: [{ value: 'riichi_tsumo', label: 'リーチ後のツモ時' }, { value: 'any_tsumo', label: 'ツモ時' }, { value: 'always', label: '常時' }],
    }, R, onChange),
    control({ type: 'number', path: 'local.shiroPocchi.bonus', label: '使用時のBP', step: 1 }, R, onChange)));

  toggleWithDetail('オープンリーチ', 'local.openRiichi', '手牌を公開する代わりに翻が増えます', () => h('div',
    control({ type: 'number', path: 'local.openRiichi.han', label: '追加翻数', step: 1 }, R, onChange),
    control({ type: 'number', path: 'local.openRiichi.bonus', label: '成立時のBP', step: 1 }, R, onChange),
    control({
      type: 'select', path: 'local.openRiichi.revealMode', label: '公開範囲',
      options: [{ value: 'all', label: '手牌をすべて公開' }, { value: 'waits', label: '待ち牌のみ公開' }],
    }, R, onChange)));

  toggleWithDetail('割れ目', 'local.wareme', 'サイコロで決まった1人の収支が倍になります', () => h('div',
    control({ type: 'number', path: 'local.wareme.multiplier', label: '倍率', step: 1 }, R, onChange),
    control({
      type: 'select', path: 'local.wareme.decideBy', label: '決め方',
      options: [{ value: 'dice', label: 'サイコロ' }, { value: 'dealer', label: '親固定' }, { value: 'random', label: 'ランダム' }],
    }, R, onChange),
    switchRow('全員割れ目', 'すべての支払いが倍になります', R.local.wareme.allPlayers, (v) => { R.local.wareme.allPlayers = v; onChange(); }),
    switchRow('本場点は対象外', '', R.local.wareme.honbaExempt, (v) => { R.local.wareme.honbaExempt = v; onChange(); })));

  toggleWithDetail('アリス', 'local.alice', '和了時に牌をめくり、手牌と一致すればBP', () => aliceDetail(R, 'local.alice', onChange));
  toggleWithDetail('チューリップ', 'local.tulip', 'アリスの拡張。現物＋両隣まで一致扱い', () => aliceDetail(R, 'local.tulip', onChange));

  toggleWithDetail('サイコロチャンス', 'local.dice', '条件成立でサイコロを振り、出目でBP', () => h('div',
    field('サイコロの数', stepper(R.local.dice.count, (v) => { R.local.dice.count = Math.max(1, v); onChange(); }, 1, 5)),
    field('発動条件', h('div.row.gap-4.wrapflex', [
      ['yakuman', '本役満'], ['countedYakuman', '数え役満'], ['fourKita', '四北'],
      ['fourFlower', '四華'], ['pocchiTsumo', '白ポッチツモ'],
    ].map(([v, label]) => {
      const on = R.local.dice.triggers.includes(v);
      const c = h('button.chip.chip-btn', { type: 'button', class: on ? 'on' : '', text: label });
      c.addEventListener('click', () => {
        R.local.dice.triggers = on ? R.local.dice.triggers.filter((x) => x !== v) : [...R.local.dice.triggers, v];
        onChange();
      });
      return c;
    }))),
    control({ type: 'number', path: 'local.dice.doublesMultiplier', label: 'ゾロ目の倍率', step: 1 }, R, onChange),
    control({ type: 'number', path: 'local.dice.pinzoroMultiplier', label: 'ピンゾロの倍率', step: 1 }, R, onChange),
    switchRow('ゾロ目で振り直し', '', R.local.dice.rerollOnDoubles, (v) => { R.local.dice.rerollOnDoubles = v; onChange(); }),
    control({ type: 'number', path: 'local.dice.cap', label: 'BPの上限', step: 10 }, R, onChange)));

  toggleWithDetail('少牌マイティ', 'local.shouhaiMighty',
    '手牌を1枚少なく配り、足りない1枚を「何にでもなる牌」として常に持っている扱いにします。テンパイ形がそのまま和了になります',
    () => h('div', control({ type: 'number', path: 'local.shouhaiMighty.count', label: '少なく配る枚数', step: 1 }, R, onChange)));
  toggleWithDetail('焼き鳥', 'local.yakitori', '一度も和了できずに終わるとBPマイナス', () => h('div',
    control({ type: 'number', path: 'local.yakitori.penalty', label: 'マイナスBP', step: 1 }, R, onChange)));
  toggleWithDetail('トビ賞', 'local.tobiBonus', 'トバした人にBP', () => h('div',
    control({ type: 'number', path: 'local.tobiBonus.value', label: 'BP', step: 1 }, R, onChange)));
  toggleWithDetail('順位ビンタ', 'local.binta', '順位に応じてBPが動きます', null);
  if (using('localRules')) left.appendChild(local);

  // --- 華牌
  const fl = h('div.card.card-pad', { style: { marginBottom: '18px' } },
    h('h3', { style: { fontSize: '16px', marginBottom: '12px' }, text: '華牌（春夏秋冬）' }),
    switchRow('華牌を使う', '引いたら抜いて即補充します', R.flowers.enabled, (v) => { R.flowers.enabled = v; onChange(); }));
  if (R.flowers.enabled) {
    FLOWER_KEYS.forEach(([key, label], idx) => {
      const list = R.flowers.effects[key] || (R.flowers.effects[key] = []);
      const eff = list[0] || { type: 'bonusPerTile', value: 1 };
      const sel = h('select', { style: { width: '190px' } });
      for (const o of FLOWER_EFFECTS) sel.appendChild(h('option', { value: o.value, text: o.label, selected: eff.type === o.value }));
      sel.addEventListener('change', () => {
        R.flowers.effects[key] = [{ type: sel.value, value: eff.value ?? 1, all: sel.value === 'bonusPerTile' }];
        onChange();
      });
      const val = h('input', { type: 'number', value: String(eff.value ?? 1), step: '1', style: { width: '70px' } });
      val.addEventListener('change', () => {
        R.flowers.effects[key] = [{ ...eff, value: Number(val.value) }];
        onChange();
      });
      fl.appendChild(h('div.row.gap-8.wrapflex', { style: { padding: '8px 0', borderBottom: '1px solid var(--line)' } },
        tileEl({ t: 34 + idx, flower: key }, { size: 'sm' }),
        h('div', { style: { width: '28px', fontWeight: '600' }, text: label }),
        sel, val));
    });
    fl.appendChild(switchRow('抜いた華牌をドラとして数える', '', R.flowers.isDora, (v) => { R.flowers.isDora = v; onChange(); }));
  }
  if (using('flowers')) left.appendChild(fl);

  // --- ローカル役
  const ly = h('div.card.card-pad', { style: { marginBottom: '18px' } },
    h('h3', { style: { fontSize: '16px', marginBottom: '6px' }, text: 'ローカル役' }),
    h('p.tiny.muted', { style: { marginTop: '0' }, text: '採用する役を選び、翻数または役満を設定します。' }));
  R.localYaku = R.localYaku || [];
  for (const [id, def] of Object.entries(LOCAL_YAKU_DEFS)) {
    const cur = R.localYaku.find((y) => y.id === id);
    const on = !!cur && cur.enabled !== false;
    const toggle = h('button.sw', { class: on ? 'on' : '' });
    toggle.addEventListener('click', () => {
      if (on) R.localYaku = R.localYaku.filter((y) => y.id !== id);
      else {
        R.localYaku.push(def.defaultYakuman
          ? { id, enabled: true, yakuman: def.defaultYakuman }
          : { id, enabled: true, han: def.defaultHan ?? 2 });
      }
      onChange();
    });
    const right = h('div.row.gap-8');
    if (on) {
      const isYakuman = !!cur.yakuman;
      const sel = h('select', { style: { width: '92px' } });
      sel.appendChild(h('option', { value: 'han', text: '翻数', selected: !isYakuman }));
      sel.appendChild(h('option', { value: 'yakuman', text: '役満', selected: isYakuman }));
      sel.addEventListener('change', () => {
        if (sel.value === 'yakuman') { cur.yakuman = def.defaultYakuman || 1; delete cur.han; }
        else { cur.han = def.defaultHan || 2; delete cur.yakuman; }
        onChange();
      });
      const val = h('input', {
        type: 'number', step: '1', style: { width: '62px' },
        value: String(isYakuman ? cur.yakuman : cur.han),
      });
      val.addEventListener('change', () => {
        if (isYakuman) cur.yakuman = Number(val.value); else cur.han = Number(val.value);
        onChange();
      });
      right.appendChild(sel);
      right.appendChild(val);
      // 形の広さが店ごとに変わる役（大車輪など）は、その選び分けも出す
      for (const opt of def.options || []) {
        const os = h('select', { style: { width: '150px' } });
        const now = cur[opt.key] ?? opt.default;
        for (const c of opt.choices) {
          os.appendChild(h('option', { value: c.v, text: c.label, selected: c.v === now }));
        }
        os.addEventListener('change', () => { cur[opt.key] = os.value; onChange(); });
        right.appendChild(os);
      }
    }
    ly.appendChild(h('div.switch',
      h('div.grow', h('div.sw-label', { text: def.name }), h('div.sw-desc', { text: def.desc })),
      right, toggle));
  }
  if (using('localYaku')) left.appendChild(ly);

  // --- イベント卓
  const evBox = h('div.card.card-pad', { style: { marginBottom: '18px' } },
    h('h3', { style: { fontSize: '16px', marginBottom: '6px' }, text: 'イベント卓' }),
    h('p.tiny.muted', { style: { marginTop: '0' }, text: '通常ルールを部分的に上書きする特別卓を作れます。店舗ページから直接遊べます。' }));
  R.events = R.events || [];
  const OVERRIDES = [
    { key: 'wareme', label: '全員割れ目', patch: { local: { wareme: { enabled: true, allPlayers: true, multiplier: 2 } } } },
    { key: 'aka2', label: '赤牌を2枚ずつに', patch: { dora: { red: { '5m': 2, '5p': 2, '5s': 2 } } } },
    { key: 'baku', label: '爆ドラ+1', patch: { dora: { bakuDora: 1 } } },
    { key: 'alice', label: 'アリスON（副露可）', patch: { local: { alice: { enabled: true, requireMenzen: false } } } },
    { key: 'dice', label: 'サイコロチャンスON', patch: { local: { dice: { enabled: true } } } },
    { key: 'nobonus', label: '祝儀なし（初心者卓）', patch: { bonus: { enabled: false } } },
    { key: 'almighty', label: '白ポッチ常時オールマイティ', patch: { local: { shiroPocchi: { enabled: true, almightyCondition: 'any_tsumo' } } } },
  ];
  R.events.forEach((ev, i) => {
    const nameI = h('input', { type: 'text', value: ev.name || '', style: { width: '170px' } });
    nameI.addEventListener('change', () => { ev.name = nameI.value; onChange(); });
    const noteI = h('input', { type: 'text', value: ev.note || '', placeholder: 'お客様向けの説明', style: { marginTop: '8px' } });
    noteI.addEventListener('change', () => { ev.note = noteI.value; onChange(); });
    const del = h('button.btn.btn-sm.btn-ghost', { text: '削除' });
    del.addEventListener('click', () => { R.events.splice(i, 1); onChange(); });
    const sw = h('button.sw', { class: ev.enabled !== false ? 'on' : '' });
    sw.addEventListener('click', () => { ev.enabled = ev.enabled === false; onChange(); });
    ev.ruleOverrides = ev.ruleOverrides || {};
    const chips = h('div.row.gap-4.wrapflex', { style: { marginTop: '8px' } }, OVERRIDES.map((o) => {
      const on = (ev.appliedKeys || []).includes(o.key);
      const c = h('button.chip.chip-btn', { type: 'button', class: on ? 'on' : '', text: o.label });
      c.addEventListener('click', () => {
        const keys = new Set(ev.appliedKeys || []);
        if (on) keys.delete(o.key); else keys.add(o.key);
        ev.appliedKeys = [...keys];
        // 選んだ上書きだけを合成し直す
        ev.ruleOverrides = ev.appliedKeys.reduce(
          (acc, k) => deepMergePatch(acc, (OVERRIDES.find((x) => x.key === k) || {}).patch || {}), {},
        );
        onChange();
      });
      return c;
    }));
    evBox.appendChild(h('div', { style: { border: '1px solid var(--line)', borderRadius: '10px', padding: '12px', marginBottom: '10px' } },
      h('div.row.gap-8.wrapflex', nameI, h('div.grow'), sw, del),
      noteI, chips));
  });
  const addEv = h('button.btn.btn-sm.btn-ghost', { text: '＋イベント卓を追加' });
  addEv.addEventListener('click', () => {
    R.events.push({
      id: `ev_${Date.now().toString(36)}`, name: '新しいイベント卓', enabled: true,
      note: '', appliedKeys: [], ruleOverrides: {},
    });
    onChange();
  });
  evBox.appendChild(addEv);
  if (using('events')) left.appendChild(evBox);

  // --- 標準役の翻数（店ごとの取り決め）
  const yo = h('div.card.card-pad', { style: { marginBottom: '18px' } },
    h('h3', { style: { fontSize: '16px', marginBottom: '6px' }, text: '標準役の翻数' }),
    h('p.tiny.muted', { style: { marginTop: '0' }, text: '「清一色は役満」「七対子は3翻」のような取り決めがある場合だけ変えてください。触らなければ一般的な翻数のままです。' }));
  R.yakuOverrides = R.yakuOverrides || {};
  for (const y of MAJOR_YAKU) {
    const cur = R.yakuOverrides[y.name];
    const on = !!cur;
    const toggle = h('button.sw', { class: on ? 'on' : '' });
    toggle.addEventListener('click', () => {
      if (on) delete R.yakuOverrides[y.name];
      else R.yakuOverrides[y.name] = { han: 2 };
      onChange();
    });
    const right = h('div.row.gap-8');
    if (on) {
      const isYakuman = !!cur.yakuman;
      const sel = h('select', { style: { width: '92px' } });
      sel.appendChild(h('option', { value: 'han', text: '翻数', selected: !isYakuman }));
      sel.appendChild(h('option', { value: 'yakuman', text: '役満', selected: isYakuman }));
      sel.appendChild(h('option', { value: 'off', text: '採用しない', selected: cur.enabled === false }));
      if (cur.enabled === false) sel.value = 'off';
      sel.addEventListener('change', () => {
        if (sel.value === 'yakuman') R.yakuOverrides[y.name] = { yakuman: 1 };
        else if (sel.value === 'off') R.yakuOverrides[y.name] = { enabled: false };
        else R.yakuOverrides[y.name] = { han: 2 };
        onChange();
      });
      right.appendChild(sel);
      if (cur.enabled !== false) {
        const val = h('input', {
          type: 'number', step: '1', style: { width: '62px' },
          value: String(isYakuman ? cur.yakuman : (cur.han ?? 2)),
        });
        val.addEventListener('change', () => {
          if (isYakuman) R.yakuOverrides[y.name] = { yakuman: Number(val.value) };
          else R.yakuOverrides[y.name] = { han: Number(val.value) };
          onChange();
        });
        right.appendChild(val);
      }
    }
    yo.appendChild(h('div.switch',
      h('div.grow', h('div.sw-label', { text: y.name }), h('div.sw-desc', { text: `既定：${y.base}` })),
      right, toggle));
  }
  if (using('yakuOverrides')) left.appendChild(yo);

  // --- 特殊牌
  const sp = h('div.card.card-pad', { style: { marginBottom: '18px' } },
    h('h3', { style: { fontSize: '16px', marginBottom: '6px' }, text: '特殊牌' }),
    h('p.tiny.muted', { style: { marginTop: '0' }, text: '牌ごとに違う効果を持たせられます（宝石牌のような特殊牌システムに相当）。' }));
  R.specialTiles = R.specialTiles || [];
  R.specialTiles.forEach((def, i) => {
    sp.appendChild(specialTileCard(def, i, R, onChange));
  });
  // テンプレートから追加（ゼロから作らせない）
  sp.appendChild(h('div.tpl-head', { text: 'よくある形から追加' }));
  const tplRow = h('div.tpl-grid');
  for (const t of SPECIAL_TEMPLATES) {
    const card = h('button.tpl-card',
      h('b', { text: t.label }),
      h('span', { text: t.desc }));
    card.addEventListener('click', () => {
      R.specialTiles.push({ id: `sp_${Date.now().toString(36)}`, ...t.make() });
      onChange();
    });
    tplRow.appendChild(card);
  }
  sp.appendChild(tplRow);
  const addSp = h('button.btn.btn-sm.btn-ghost', { style: { marginTop: '10px' }, text: '空の特殊牌を追加（自分で設定する）' });
  addSp.addEventListener('click', () => {
    R.specialTiles.push({
      id: `sp_${Date.now().toString(36)}`, name: autoSpecialName('5s', 'blue'), tile: '5s', count: 1, color: 'blue',
      activationTiming: 'win', effects: [{ type: 'bonus', value: 2 }], conditions: {},
    });
    onChange();
  });
  sp.appendChild(addSp);
  if (using('specialTiles')) left.appendChild(sp);

  // 設定項目が多いので、見出しへ飛べる目次を先頭に置く
  left.insertBefore(sectionJump(left), left.firstChild);
}

/**
 * 文章からルール設定の下書きを作る。
 *
 * 設定項目を一つずつ触るのは、店舗にとってかなりの負担になる。
 * 貼り紙やSNSの文面をそのまま貼れば、当てはまる項目だけが埋まるようにする。
 * 反映は必ず人が確認してから。読み取った内容を先に見せ、押して初めて適用する。
 */
function draftCard(state, onChange) {
  if (!hasServer()) return null;
  const box = h('div.card.card-pad.draft-card', { style: { marginBottom: '18px' } },
    h('h3', { style: { fontSize: '16px', marginBottom: '4px' }, text: '文章からまとめて設定する' }),
    h('p.tiny.muted', { style: { margin: '0 0 12px' },
      text: '「うちのルール」を普通の文章で書いてください。当てはまる項目だけを下書きします。設定が変わるのは、内容を確認して反映を押したときだけです。' }));

  const ta = h('textarea', {
    rows: '4',
    placeholder: '例：四麻の東南戦、25000持ちの30000返し。赤は5筒2枚と5索1枚。喰いタンあり。白ポッチ1枚、オープンリーチは2翻です。',
  });
  const out = h('div.draft-out');
  const btn = h('button.btn.btn-brass', { text: '下書きを作る' });

  btn.addEventListener('click', async () => {
    const text = ta.value.trim();
    clear(out);
    if (text.length < 4) { out.appendChild(h('p.tiny.err', { text: 'ルールの説明を書いてください' })); return; }
    btn.disabled = true;
    btn.textContent = '読み取っています…';
    const r = await draftRules(text);
    btn.disabled = false;
    btn.textContent = '下書きを作る';
    if (!r.ok) { out.appendChild(h('p.tiny.err', { text: r.error })); return; }
    showDraft(out, r.data, state, onChange);
  });

  box.appendChild(ta);
  box.appendChild(h('div.row.gap-12', { style: { marginTop: '10px' } }, btn));
  box.appendChild(out);
  return box;
}

/** 読み取った内容を、反映する前に見せる */
function showDraft(out, data, state, onChange) {
  const rows = flatten(data.patch || {});
  if (!rows.length) {
    out.appendChild(h('p.tiny.muted', { text: '設定に落とせる内容が見つかりませんでした。書き方を変えてもう一度お試しください。' }));
  } else {
    out.appendChild(h('div.label', { style: { margin: '14px 0 6px' }, text: `読み取った設定（${rows.length}項目）` }));
    const list = h('div.draft-list');
    for (const [path, value] of rows) {
      list.appendChild(h('div.draft-row',
        h('code', { text: path }),
        h('span', { text: String(value) })));
    }
    out.appendChild(list);
  }
  for (const note of data.notes || []) {
    out.appendChild(h('p.tiny.muted', { style: { margin: '6px 0 0' }, text: `※ ${note}` }));
  }
  if (!rows.length) return;

  const apply = h('button.btn.btn-primary', { style: { marginTop: '12px' }, text: 'この内容を設定に反映する' });
  apply.addEventListener('click', () => {
    deepMerge(state.rules, data.patch);
    onChange();
  });
  out.appendChild(apply);
}

/** 入れ子のオブジェクトを「a.b.c → 値」の一覧にする（確認用） */
function flatten(obj, prefix = '') {
  const rows = [];
  for (const [k, v] of Object.entries(obj || {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) rows.push(...flatten(v, path));
    else rows.push([path, v]);
  }
  return rows;
}

/** 下書きを既存の設定へ重ねる（書かれていない項目はそのまま） */
function deepMerge(target, patch) {
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (typeof target[k] !== 'object' || target[k] === null) target[k] = {};
      deepMerge(target[k], v);
    } else {
      target[k] = v;
    }
  }
}

/**
 * 編集フォームの絞り込み。カード内の h3 を拾って、分野ごとに切り替える。
 *
 * 以前はここへスクロールするだけの目次だったが、設定が縦に9,000px近く
 * 続くため、目当ての項目にたどり着くまでが遠かった。
 * 選んだ分野だけを出すようにして、一度に見る量を減らす。
 * ルール名・ベースにするルール・設定の検索は、どの分野でも要るので
 * 見出しを持たせておらず、絞り込んでも残る。
 */
function sectionJump(left) {
  const nav = h('div.editor-jump');
  const heads = [...left.querySelectorAll('.card-pad > h3')];
  const cards = heads.map((head, i) => {
    const card = head.parentElement;
    if (!card.id) card.id = `edsec-${i}`;
    return card;
  });
  const chips = [];
  /** idx が -1 のときは全部見せる */
  const select = (idx) => {
    cards.forEach((c, i) => c.classList.toggle('sec-off', idx >= 0 && i !== idx));
    chips.forEach((c, i) => c.classList.toggle('on', i === idx + 1));
    // 分野を選んだら、その場所まで運ぶ。選んだのに画面が変わらないと
    // 「効いていない」と見える
    if (idx >= 0) cards[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const all = h('button.jump-chip.on', { text: 'すべて' });
  all.addEventListener('click', () => select(-1));
  chips.push(all);
  nav.appendChild(all);
  heads.forEach((head, i) => {
    const b = h('button.jump-chip', { text: head.textContent });
    b.addEventListener('click', () => select(i));
    chips.push(b);
    nav.appendChild(b);
  });
  return nav;
}

function aliceDetail(R, path, onChange) {
  const c = get(R, path);
  return h('div',
    control({
      type: 'select', path: `${path}.start`, label: 'めくり始める位置',
      options: [{ value: 'nextDora', label: 'ドラ表示牌の隣' }, { value: 'deadWallEnd', label: '王牌の端' }],
    }, R, onChange),
    control({
      type: 'select', path: `${path}.matchTarget`, label: '一致の対象',
      options: [{ value: 'hand', label: '手牌のどれか' }, { value: 'winTile', label: '和了牌' }],
    }, R, onChange),
    control({
      type: 'select', path: `${path}.matchMode`, label: '一致条件',
      options: [{ value: 'exact', label: '同じ牌のみ' }, { value: 'tulip', label: '同じ牌＋その両隣' }],
    }, R, onChange),
    control({
      type: 'select', path: `${path}.kotsuMode`, label: '刻子のときの扱い',
      options: [{ value: 'each', label: '枚数分カウント' }, { value: 'one', label: '1回だけ' }],
    }, R, onChange),
    switchRow('門前限定', '', c.requireMenzen, (v) => { c.requireMenzen = v; onChange(); }),
    switchRow('リーチ必須', '', c.requireRiichi, (v) => { c.requireRiichi = v; onChange(); }),
    switchRow('ツモ限定', '', c.tsumoOnly, (v) => { c.tsumoOnly = v; onChange(); }),
    switchRow('一致する限り続ける', '', c.continueOnMatch, (v) => { c.continueOnMatch = v; onChange(); }),
    control({ type: 'number', path: `${path}.bonusPerMatch`, label: '一致1枚あたりのBP', step: 1 }, R, onChange),
    control({ type: 'number', path: `${path}.maxFlips`, label: '最大めくり枚数', step: 1 }, R, onChange),
    control({ type: 'number', path: `${path}.max`, label: 'BPの上限', step: 1 }, R, onChange));
}

// ---------------------------------------------------------------------------
function renderRight(right, state, onChange) {
  clear(right);
  const R = resolveRules(state.rules);
  const v = validateRules(R);

  const actions = h('div.card.card-pad', { style: { marginBottom: '16px' } });
  const payload = () => ({
    id: state.id, name: state.name, category: '店舗', tags: [],
    description: shortSummary(R), rules: clone(state.rules),
  });
  const save = h('button.btn.btn-primary.btn-block', { text: 'このルールを保存' });
  const savedNote = h('div.tiny.muted.ed-saved.hide', { style: { marginTop: '8px' } },
    h('span', { text: '保存しました。' }),
    h('a', { href: '#/table', style: { color: 'var(--brass)' }, text: '卓を立てる' }),
    h('span', { text: 'の「自作」から、いつでもこの設定で打てます。' }));
  save.addEventListener('click', () => {
    saveCustomPreset(payload());
    save.textContent = '保存しました';
    savedNote.classList.remove('hide');
    setTimeout(() => { save.textContent = 'このルールを保存'; }, 1600);
  });
  const play = h('a.btn.btn-brass.btn-block', { href: '#', style: { marginTop: '8px' } }, icon('play', 14), 'このルールで遊ぶ');
  play.addEventListener('click', (ev) => {
    ev.preventDefault();
    saveCustomPreset(payload());
    location.hash = `#/play?preset=${state.id}`;
  });
  actions.appendChild(save);
  actions.appendChild(play);
  actions.appendChild(savedNote);

  // 保存した自作ルールを消す手段が無く、増える一方だった。
  // 消せるのは自分で保存したものだけ（お店のルールは消さない）。
  // 取り返しがつかないので、1度目は確かめ、5秒たてば元に戻す。
  if (loadCustomPresets().some((p) => p.id === state.id)) {
    const del = h('button.btn.btn-sm.btn-ghost.btn-block.ed-delete',
      { type: 'button', style: { marginTop: '10px' }, text: 'このルールを削除' });
    let armed = false;
    let timer = null;
    del.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        del.textContent = 'もう一度押すと削除します';
        del.classList.add('is-armed');
        timer = setTimeout(() => {
          armed = false;
          del.textContent = 'このルールを削除';
          del.classList.remove('is-armed');
        }, 5000);
        return;
      }
      clearTimeout(timer);
      deleteCustomPreset(state.id);
      location.hash = '#/table';
    });
    actions.appendChild(del);
  }
  actions.appendChild(h('div.tiny.muted', { style: { marginTop: '10px' }, text: shortSummary(R) }));
  right.appendChild(actions);

  const vb = h('div.card.card-pad', { style: { marginBottom: '16px' } },
    h('div.row.gap-8', { style: { marginBottom: '10px' } },
      h('h3', { style: { fontSize: '15px' }, text: '設定チェック' }),
      h('div.grow'),
      v.summary.errors ? chip(`エラー${v.summary.errors}`, 'red') : chip('エラーなし', 'felt')));
  if (!v.issues.length) vb.appendChild(h('div.tiny.muted', { text: '矛盾は見つかりませんでした。' }));
  for (const i of v.issues) {
    vb.appendChild(h(`div.issue.issue-${i.severity}`,
      h('div',
        h('b', { text: { error: '成立しない設定', warn: '注意', info: 'メモ' }[i.severity] }),
        h('span', { text: i.message }),
        i.fix ? h('div.tiny', { style: { marginTop: '4px' }, text: `→ ${i.fix}` }) : null)));
  }
  right.appendChild(vb);

  const pv = h('div.card.card-pad');
  pv.appendChild(h('div.row.gap-8', { style: { marginBottom: '10px' } },
    h('h3', { style: { fontSize: '15px' }, text: 'お客様向け説明' }),
    h('div.grow'),
    toggleRow([{ label: '差分', value: 'diff' }, { label: '全文', value: 'full' }], state.view,
      (val) => { state.view = val; onChange(); })));
  if (state.view === 'diff') {
    const diff = diffFromBaseline(R);
    if (!diff.length) pv.appendChild(h('div.tiny.muted', { text: '一般ルールと同じ設定です。' }));
    pv.appendChild(h('table.diff-table', h('tbody', diff.map((d) => h('tr',
      h('th', { text: d.label }),
      h('td', h('span.diff-from', { text: d.from }), ' → ', h('span.diff-to', { text: d.to })))))));
  } else {
    for (const s of explainRules(R)) {
      pv.appendChild(h('div.explain-sec', h('h4', { text: s.title }), h('ul', s.lines.map((l) => h('li', { text: l })))));
    }
  }
  right.appendChild(pv);
}

// ---------------------------------------------------------------------------
// 特殊牌カード
//   選択肢を文字で並べるより、牌そのものを押せたほうが早い。
//   名前・見た目・枚数・効果を、上から順に決めれば1枚できあがる形にする。
// ---------------------------------------------------------------------------
const spSuitTab = new Map();

/** 「金8索」「虹3筒」のような名前を自動で作る */
function autoSpecialName(code, color) {
  const label = DESIGN_LABELS[color || 'none'] || '';
  const name = typeName(codeToType(code));
  return color && color !== 'none' ? `${label}${name}` : name;
}

/** 牌1枚の見本（押せる） */
function tileSample(code, color, opts = {}) {
  const info = { t: codeToType(code), sp: color && color !== 'none' ? true : undefined };
  return tileEl(info, {
    size: opts.size || 'sm',
    spColor: color && color !== 'none' ? color : undefined,
    clickable: !!opts.onClick,
    onClick: opts.onClick,
    selected: !!opts.selected,
  });
}

function specialTileCard(def, index, R, onChange) {
  const suitOf = (code) => (code || '5s').slice(-1);
  const tab = spSuitTab.get(def.id) || suitOf(def.tile);
  spSuitTab.set(def.id, tab);

  // --- 見出し（見本・名前・枚数・削除）
  const nameI = h('input', { type: 'text', value: def.name || '', placeholder: '牌の名前' });
  nameI.addEventListener('change', () => { def.name = nameI.value; onChange(); });
  const del = h('button.btn.btn-sm.btn-ghost', { text: '削除' });
  del.addEventListener('click', () => { R.specialTiles.splice(index, 1); spSuitTab.delete(def.id); onChange(); });

  const head = h('div.sp-head',
    h('div.sp-preview', tileSample(def.tile, def.color, { size: 'lg' })),
    h('div.grow',
      h('label.sp-label', { text: '名前（お客様に表示されます）' }),
      nameI,
      h('div.row.gap-8', { style: { marginTop: '8px' } },
        h('span.sp-label', { text: '枚数' }),
        stepper(def.count ?? 1, (v) => { def.count = Math.min(4, Math.max(1, v)); onChange(); }, 1, 4),
        h('span.tiny.muted', { text: '同じ牌を何枚この効果にするか' }))),
    del);

  // --- どの牌にするか（スートを選んでから牌を押す）
  const tabs = h('div.sp-tabs', TILE_SUITS.map((g) => {
    const b = h(`button.seg-btn${g.key === tab ? '.on' : ''}`, { type: 'button', text: g.label });
    b.addEventListener('click', () => { spSuitTab.set(def.id, g.key); onChange(); });
    return b;
  }));
  const group = TILE_SUITS.find((g) => g.key === tab) || TILE_SUITS[0];
  const grid = h('div.sp-tile-grid', group.codes.map((code) => {
    const wrap = h('div.sp-tile-pick', { class: code === def.tile ? 'on' : '' });
    wrap.appendChild(tileSample(code, def.color, {
      size: 'md',
      selected: code === def.tile,
      onClick: () => {
        const before = autoSpecialName(def.tile, def.color);
        def.tile = code;
        // 名前を触っていなければ、牌に合わせて付け替える
        if (!def.name || def.name === before) def.name = autoSpecialName(code, def.color);
        onChange();
      },
    }));
    return wrap;
  }));

  // --- 見た目
  const designs = h('div.sp-designs', DESIGNS.map((c) => {
    const on = (def.color || 'none') === c;
    const b = h(`button.sp-design${on ? '.on' : ''}`, { type: 'button', title: DESIGN_LABELS[c] || c });
    b.appendChild(tileSample(def.tile, c, { size: 'sm' }));
    b.appendChild(h('span', { text: DESIGN_LABELS[c] || c }));
    b.addEventListener('click', () => {
      const before = autoSpecialName(def.tile, def.color);
      def.color = c === 'none' ? null : c;
      if (!def.name || def.name === before) def.name = autoSpecialName(def.tile, def.color);
      onChange();
    });
    return b;
  }));

  // --- 効果
  const effBox = h('div.sp-effects');
  (def.effects || []).forEach((e, ei) => {
    const es = h('select');
    for (const o of EFFECT_TYPES) es.appendChild(h('option', { value: o.value, text: o.label, selected: e.type === o.value }));
    es.addEventListener('change', () => { e.type = es.value; onChange(); });
    const needsValue = !NO_VALUE_EFFECTS.has(e.type);
    const ev = h('input.sp-eff-value', { type: 'number', value: String(e.value ?? 1), step: '1' });
    ev.addEventListener('change', () => { e.value = Number(ev.value); onChange(); });
    const ed = h('button.btn.btn-sm.btn-ghost', { text: '×', 'aria-label': 'この効果を消す' });
    ed.addEventListener('click', () => { def.effects.splice(ei, 1); onChange(); });
    effBox.appendChild(h('div.sp-eff-row', es,
      needsValue ? ev : null,
      needsValue ? h('span.tiny.muted', { text: EFFECT_UNIT[e.type] || '' }) : h('span.tiny.muted', { text: '数値なし' }),
      h('div.grow'), ed));
  });
  const addEff = h('button.btn.btn-sm.btn-ghost', { text: '＋効果を追加' });
  addEff.addEventListener('click', () => { def.effects = [...(def.effects || []), { type: 'bonus', value: 1 }]; onChange(); });
  effBox.appendChild(addEff);

  // --- いつ効くか・条件
  const timing = h('select');
  for (const o of TIMINGS) {
    timing.appendChild(h('option', { value: o.value, text: o.label, selected: (def.activationTiming || 'win') === o.value }));
  }
  timing.addEventListener('change', () => { def.activationTiming = timing.value; onChange(); });

  def.conditions = def.conditions || {};
  const condBox = h('div.row.gap-4.wrapflex',
    [['menzenOnly', '門前限定'], ['riichiOnly', 'リーチ時限定'], ['tsumoOnly', 'ツモ限定'], ['ronOnly', 'ロン限定'], ['ippatsuOnly', '一発時限定']]
      .map(([k, label]) => {
        const on = !!def.conditions[k];
        const c = h(`button.chip.chip-btn${on ? '.on' : ''}`, { type: 'button', text: label });
        c.addEventListener('click', () => { def.conditions[k] = !on; onChange(); });
        return c;
      }));

  const descI = h('input', { type: 'text', value: def.description || '', placeholder: 'お客様向けの一言説明（任意）' });
  descI.addEventListener('change', () => { def.description = descI.value; onChange(); });

  return h('div.sp-card',
    head,
    h('div.sp-row', h('div.sp-label', { text: 'どの牌にするか' }), h('div.grow', tabs, grid)),
    h('div.sp-row', h('div.sp-label', { text: '見た目' }), h('div.grow', designs)),
    h('div.sp-row', h('div.sp-label', { text: '効果' }), h('div.grow', effBox)),
    h('div.sp-row', h('div.sp-label', { text: 'いつ効くか' }), h('div.grow.row.gap-8.wrapflex', timing, condBox)),
    h('div.sp-row', h('div.sp-label', { text: '説明' }), h('div.grow', descI)));
}

// ---------------------------------------------------------------------------
// 設定の絞り込み
//   項目数が多いので、言葉で探せることと、既定から変えた場所が
//   ひと目で分かることを用意する。表示だけの操作で、設定値には触らない。
// ---------------------------------------------------------------------------
/**
 * 特殊ルールの追加パネル。
 *
 * いま使っているものを並べ、使っていないものは「＋」から足す。
 * 一般ルールのままで良い店は、ここが空のまま何も触らなくていい。
 */
function addPanel(R, onChange) {
  const box = h('div.card.card-pad.add-panel', { style: { marginBottom: '18px' } });
  const on = ADDABLE.filter((a) => a.isOn(R));
  const off = ADDABLE.filter((a) => !a.isOn(R));

  box.appendChild(h('div.quick-head',
    h('b', { text: '使っている特殊ルール' }),
    h('span.tiny.muted', {
      text: on.length ? `${on.length}件。下に設定が出ています` : 'まだありません。一般ルールのままです',
    })));

  if (on.length) {
    const list = h('div.add-on-list');
    for (const a of on) {
      const item = h('div.add-on',
        h('div.grow',
          h('b', { text: a.title }),
          h('div.tiny.muted', { text: a.desc })));
      const off1 = h('button.btn.btn-ghost.btn-sm', { text: '使わない' });
      off1.addEventListener('click', () => {
        if (!confirm(`「${a.title}」の設定を消して、一般ルールに戻します。よろしいですか。`)) return;
        a.turnOff(R);
        onChange();
      });
      item.appendChild(off1);
      list.appendChild(item);
    }
    box.appendChild(list);
  }

  if (off.length) {
    box.appendChild(h('div.tiny.muted', { style: { margin: '12px 0 6px' }, text: '足せるもの' }));
    const chips = h('div.add-chips');
    for (const a of off) {
      const b = h('button.chip.chip-btn.add-chip', { title: a.desc }, h('span', { text: `＋ ${a.title}` }));
      b.addEventListener('click', () => { a.turnOn(R); onChange(); });
      chips.appendChild(b);
    }
    box.appendChild(chips);
  }
  return box;
}

function filterBar(left, state) {
  const bar = h('div.card.card-pad.ed-filter');
  const input = h('input.ed-filter-input', {
    type: 'search', id: 'edFilter', name: 'edFilter',
    placeholder: '設定をさがす（例：赤、喰いタン、ウマ、割れ目）',
    autocomplete: 'off', 'aria-label': '設定をさがす',
  });
  const count = h('span.tiny.muted.ed-filter-count');
  const onlyChanged = h('button.chip.chip-btn', { type: 'button', text: '変えたところだけ' });

  const apply = () => {
    const q = normalize(input.value);
    const only = onlyChanged.classList.contains('on');
    let shown = 0;
    // 個別の項目
    for (const el of left.querySelectorAll('[data-search]')) {
      const hitWord = !q || normalize(el.dataset.search).includes(q);
      const hitChanged = !only || el.dataset.changed === '1';
      const show = hitWord && hitChanged;
      el.classList.toggle('hide', !show);
      if (show) shown += 1;
    }
    // 項目が1つも残らなかったカードは畳む
    for (const card of left.querySelectorAll('.card.card-pad')) {
      if (card.classList.contains('ed-filter')) continue;
      const items = card.querySelectorAll('[data-search]');
      if (items.length) {
        const alive = [...items].some((e) => !e.classList.contains('hide'));
        card.classList.toggle('hide', !alive);
        continue;
      }
      // 自前で組んだカード（ドラ・特殊牌など）は、カードの文言で判定する
      const text = normalize(card.textContent || '');
      const hit = (!q || text.includes(q)) && !only;
      card.classList.toggle('hide', !hit);
      if (hit) shown += 1;
    }
    count.textContent = q || only ? `${shown}件` : '';
  };

  input.addEventListener('input', apply);
  onlyChanged.addEventListener('click', () => {
    onlyChanged.classList.toggle('on');
    apply();
  });
  const clearBtn = h('button.btn.btn-sm.btn-ghost', { type: 'button', text: 'すべて表示' });
  clearBtn.addEventListener('click', () => {
    input.value = '';
    onlyChanged.classList.remove('on');
    apply();
  });

  bar.appendChild(h('div.ed-filter-row',
    h('span.ed-filter-icon', icon('search', 15)), input, count));
  bar.appendChild(h('div.row.gap-8.wrapflex', { style: { marginTop: '10px' } },
    onlyChanged, h('div.grow'), clearBtn));
  // 描き終わってから判定する（このバー自身より後ろの項目を見るため）
  setTimeout(() => { markChanged(left, state); apply(); }, 0);
  return bar;
}

/** ベースのルールと比べて、値が変わっている項目に印を付ける */
function markChanged(left, state) {
  let base;
  try { base = resolveRules(lookupPreset(state.baseId).rules); } catch { return; }
  const R = state.rules;
  for (const el of left.querySelectorAll('[data-path]')) {
    const path = el.dataset.path;
    const a = JSON.stringify(get(base, path) ?? null);
    const b = JSON.stringify(get(R, path) ?? null);
    const changed = a !== b;
    el.dataset.changed = changed ? '1' : '0';
    el.classList.toggle('is-changed', changed);
  }
}

/** 検索用の正規化（search.js と同じ考え方で、表記ゆれを吸収する） */
function normalize(v) {
  return String(v || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[\s・･、,.／/]/g, '');
}

