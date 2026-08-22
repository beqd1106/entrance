/**
 * explain.js - 設定されたルールから初来店ユーザー向けの説明文を自動生成
 *
 * ・full  … ルール全体を平易な日本語で説明
 * ・diff  … 一般ルール（同人数の標準設定）との差分だけを説明
 */
import { baselineRules } from './defaults.js';
import { typeName, codeToType } from '../core/tiles.js';
import { LOCAL_YAKU_DEFS } from '../core/yaku.js';

const LENGTH_LABEL = { east: '東風戦', east_south: '半荘戦（東南戦）', ikkyoku: '一局清算' };
const REPEAT_LABEL = { agari: '和了連荘', tenpai: 'テンパイ連荘', always: '親流れなし', none: '連荘なし' };
const FLOWER_JP = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

const num = (n) => n.toLocaleString('ja-JP');

function tileLabel(code) {
  try { return typeName(codeToType(code)); } catch { return code; }
}

/** カテゴリ別の説明ブロックを生成 */
/**
 * ローカル役の強さの表示（「役満」か「N翻」か）。
 * 設定で翻数を省いたときは、役の定義が持つ既定値を使う。
 * これを見ていなかったため「背一色（undefined翻）」のように出ていた。
 */
function localYakuStrength(y) {
  const def = LOCAL_YAKU_DEFS[y.id] || {};
  const yakuman = y.yakuman ?? (y.han ? 0 : def.defaultYakuman ?? 0);
  if (yakuman) return `役満${yakuman > 1 ? `×${yakuman}` : ''}`;
  return `${y.han ?? def.defaultHan ?? 1}翻`;
}

/** ローカル役の表示名 */
function localYakuName(y) {
  return y.name || (LOCAL_YAKU_DEFS[y.id] || {}).name || y.id;
}

export function explainRules(r) {
  const sections = [];
  const isSanma = r.game.players === 3;

  // --- 基本
  const basic = [];
  basic.push(`${isSanma ? '三人麻雀' : '四人麻雀'}の${LENGTH_LABEL[r.game.length] || r.game.length}です。`);
  basic.push(`${num(r.scoring.startingPoints)}点持ち${num(r.scoring.returnPoints)}点返し、ウマは ${r.scoring.uma.map((u) => (u > 0 ? `+${u}` : `${u}`)).join(' / ')} です。`);
  if (r.scoring.rankOnly) basic.push('順位点のみの完全順位制です（素点は成績に反映されません）。');
  if (r.scoring.shizumiUma) basic.push(`返し点（${num(r.scoring.returnPoints)}点）を下回った場合は沈みウマ ${r.scoring.shizumiUmaValue} が付きます。`);
  basic.push(r.game.tobiEnd
    ? `トビ終了あり（${r.game.tobiZeroIsEnd ? '0点ちょうどもトビ' : '0点未満でトビ'}）。`
    : 'トビ終了なし（箱下も続行）。');
  basic.push(`親は${REPEAT_LABEL[r.renchan.dealerRepeat]}。オーラス親のアガリやめは${r.game.agariYame ? 'あり' : 'なし'}です。`);
  if (r.game.westEntry) basic.push('規定局終了時に返し点を超えた人がいない場合は西入します。');
  sections.push({ title: '基本ルール', lines: basic });

  // --- 鳴き・和了
  const win = [];
  win.push(`喰いタンは${r.win.kuitan ? 'あり' : 'なし'}、後付けは${r.win.atozuke ? 'あり' : 'なし（完全先付け）'}です。`);
  if (isSanma) win.push('三人麻雀のためチーはできません。');
  win.push(`食い替えは${r.win.kuikae ? '可' : '不可'}、形式テンパイは${r.win.formalTenpai ? '認めます' : '認めません'}。`);
  if (r.win.doubleRon) win.push('ダブロンあり。'); else win.push('頭ハネ（ダブロンなし）。');
  if (!r.win.ankanAfterRiichi) win.push('リーチ後の暗槓はできません。');
  if (r.win.riichiWithoutTsumoban) win.push('ツモ番のないリーチが可能です。');
  sections.push({ title: '鳴き・和了条件', lines: win });

  // --- 点数
  const sc = [];
  if (r.scoring.mode === 'flat') {
    const F = r.scoring.flat;
    sc.push(`点数の単位が通常と異なります（東天紅系）。${F.fuFixed}符固定で計算し、点数を${F.scale}倍した値が得点です。`);
    sc.push('ロンは1人分、ツモは各支払者から1人分ずつ（＝2人分）受け取ります。');
    sc.push(`役満は${F.yakumanPoints}点固定、1本場は${F.honbaPoints}点です。`);
    if (F.promoteMinHan > 0) sc.push(`${F.promoteMinHan}翻以下の手は${{ mangan: '満貫', haneman: '跳満', baiman: '倍満', sanbaiman: '三倍満' }[F.promoteTo] || F.promoteTo}に昇格します。`);
  }
  sc.push(r.scoring.useFu ? '符計算あり。' : '符計算なし（30符固定）。');
  if (r.scoring.roundUpMangan) sc.push('切り上げ満貫あり（4翻30符・3翻60符は満貫）。');
  sc.push(r.scoring.countedYakuman ? `数え役満あり（${r.scoring.countedYakumanHan}翻以上）。` : '数え役満なし（三倍満止め）。');
  if (isSanma) sc.push(r.sanma.tsumoLoss ? 'ツモ損あり（ツモ和了時の受け取りが2人分）。' : 'ツモ損なし（丸取り／4人麻雀と同額を受け取ります）。');
  sc.push(`1本場は${r.scoring.honbaPoints}点、ノーテン罰符は場${num(r.ryuukyoku.notenPenalty)}点です。`);
  sections.push({ title: '点数計算', lines: sc });

  // --- ドラ・特殊牌
  const dora = [];
  dora.push(`表ドラ表示牌は${r.dora.indicators}枚${r.dora.indicators >= 2 ? '（常時ドラ2枚以上）' : ''}、裏ドラは${r.dora.ura ? 'あり' : 'なし'}、槓ドラは${r.dora.kanDora ? 'あり' : 'なし'}です。`);
  const reds = Object.entries(r.dora.red || {}).filter(([, n]) => n > 0);
  if (reds.length) dora.push(`赤牌：${reds.map(([c, n]) => `赤${tileLabel(c)}${n}枚`).join('・')}。`);
  else dora.push('赤牌なし。');
  const golds = Object.entries(r.dora.gold || {}).filter(([, n]) => n > 0);
  if (golds.length) dora.push(`金牌：${golds.map(([c, n]) => `金${tileLabel(c)}${n}枚`).join('・')}（${r.dora.goldIsDora ? 'ドラとして数えます' : 'ドラには数えません'}）。`);
  for (const [key, label] of [['blue', '青牌'], ['star', '星牌'], ['rainbow', '虹牌']]) {
    const list = Object.entries(r.dora[key] || {}).filter(([, n]) => n > 0);
    if (list.length) {
      const w = (r.dora.attributeDora || {})[key] ?? 1;
      dora.push(`${label}：${list.map(([c, n]) => `${tileLabel(c)}${n}枚`).join('・')}（1枚でドラ${w}枚分）。`);
    }
  }
  if (r.dora.bakuDora > 0) dora.push(`爆ドラあり：表ドラ表示牌を追加で${r.dora.bakuDora}枚めくります（合計${r.dora.indicators + r.dora.bakuDora}枚）。`);
  const attrRed = (r.dora.attributeDora || {}).red ?? 1;
  if (attrRed !== 1) dora.push(`赤牌は1枚でドラ${attrRed}枚分として数えます。`);
  if (r.local.shiroPocchi.enabled) {
    const p = r.local.shiroPocchi;
    const cond = p.almightyCondition === 'always' ? '常時'
      : p.almightyCondition === 'any_tsumo' ? 'ツモ時' : 'リーチ後のツモ時';
    dora.push(`白ポッチが${p.count}枚入っています。${p.mode === 'bonus' ? 'ボーナス専用です。' : `${cond}にオールマイティ牌として使えます。`}`);
  }
  if (isSanma && r.sanma.northMode === 'nuki') {
    dora.push(`北は抜きドラです（${r.sanma.kitaIsDora ? '抜いた北はドラ1枚として数えます' : 'ドラには数えません'}）。他家が抜いた北で${r.sanma.northRonOk ? 'ロンできます' : 'ロンはできません'}。`);
  }
  if (isSanma && r.sanma.northIsYakuhai) dora.push('手牌の北は役牌として扱います。');
  if (isSanma && (r.sanma.extraNukiTiles || []).length) {
    dora.push(`北以外に ${r.sanma.extraNukiTiles.map(tileLabel).join('・')} も抜き牌（ガリ）として抜けます。`);
  }
  if (isSanma && r.sanma.kitaBreaksIppatsu) dora.push('抜きを行うと一発が消えます。');
  if (isSanma && r.sanma.kitaIsRinshan) dora.push('抜いた後のツモで和了すると嶺上開花が付きます。');
  for (const def of r.specialTiles || []) {
    dora.push(`特殊牌「${def.name}」（${tileLabel(def.tile)}／${def.count ?? 1}枚）：${describeEffects(def.effects)}${describeConditions(def.conditions)}`);
  }
  sections.push({ title: 'ドラ・特殊牌', lines: dora });

  // --- 華牌
  if (r.flowers.enabled) {
    const fl = [];
    fl.push(`華牌（${(r.flowers.tiles || []).map((k) => FLOWER_JP[k]).join('・')}）を使用します。引いたら抜いて即補充です。`);
    for (const key of r.flowers.tiles || []) {
      const list = r.flowers.effects[key] || [];
      if (!list.length) continue;
      fl.push(`${FLOWER_JP[key]}：${list.map(flowerEffectText).join(' / ')}`);
    }
    if (r.flowers.isDora) fl.push('抜いた華牌はドラとして数えます。');
    sections.push({ title: '華牌（春夏秋冬）', lines: fl });
  }

  // --- ローカルルール
  const local = [];
  if (r.local.alice.enabled) local.push(aliceText(r.local.alice, 'アリス'));
  if (r.local.tulip.enabled) local.push(aliceText(r.local.tulip, 'チューリップ'));
  if (r.local.openRiichi.enabled) local.push(`オープンリーチあり（+${r.local.openRiichi.han}翻${r.local.openRiichi.bonus ? `・${r.local.openRiichi.bonus}BP` : ''}）。`);
  // 標準役の翻数を変えている店は、それを最初に伝える
  const ov = Object.entries(r.yakuOverrides || {});
  if (ov.length) {
    const parts = ov.map(([name, o]) => {
      if (o.enabled === false) return `${name}は採用なし`;
      if (o.yakuman) return `${name}は役満${o.yakuman > 1 ? `×${o.yakuman}` : ''}`;
      return `${name}は${o.han}翻`;
    });
    local.push(`役の翻数が一般と違います：${parts.join('／')}。`);
  }
  if (r.local.shouhaiMighty && r.local.shouhaiMighty.enabled) {
    const n = r.local.shouhaiMighty.count || 1;
    local.push(`少牌マイティ。手牌が常に${n}枚少なく、足りない${n}枚は「何にでもなる牌」として持っている扱いになります。`);
    local.push('テンパイの形になった時点で和了なので、通常よりずっと速く決着します。');
  }
  if (r.local.wareme.enabled) {
    const W = r.local.wareme;
    if (W.allPlayers) local.push(`全員割れ目。すべての支払いが${W.multiplier}倍になります。`);
    else local.push(`割れ目あり。${W.decideBy === 'dealer' ? '親' : 'サイコロで決まった1人'}は、支払いも受け取りも${W.multiplier}倍になります。`);
    if (W.honbaExempt) local.push('本場点は割れ目の倍付け対象外です。');
  }
  if (r.local.dice.enabled) {
    const d = r.local.dice;
    local.push(`サイコロチャンスあり（サイコロ${d.count}個）。発動条件は ${d.triggers.map(triggerLabel).join('・')}。ゾロ目で×${d.doublesMultiplier}${d.rerollOnDoubles ? '＆振り直し' : ''}、ピンゾロで×${d.pinzoroMultiplier}（上限${d.cap}BP）。`);
  }
  if (r.local.yakitori.enabled) local.push(`焼き鳥あり。一度も和了できずに終わると ${r.local.yakitori.penalty}BP のマイナスです。`);
  if (r.local.tobiBonus.enabled) local.push(`トビ賞あり（${r.local.tobiBonus.value}BP）。`);
  if (r.local.binta.enabled) local.push(`順位ビンタあり（${r.local.binta.perRank.join(' / ')}BP）。`);
  for (const rule of r.customRules || []) {
    local.push(`ハウスルール「${rule.name}」：${customRuleText(rule)}`);
  }
  const ly = (r.localYaku || []).filter((y) => y.enabled !== false);
  if (ly.length) {
    local.push(`ローカル役を採用しています：${ly.map((y) => `${localYakuName(y)}（${localYakuStrength(y)}）`).join('・')}`);
  }
  for (const ev of (r.events || []).filter((e) => e.enabled !== false)) {
    local.push(`イベント卓「${ev.name}」：${ev.note || '特別ルールが適用されます'}`);
  }
  if (!local.length) local.push('特別なローカルルールはありません。');
  sections.push({ title: 'ローカルルール', lines: local });

  // --- ボーナス（非換金）
  if (r.bonus.enabled) {
    const b = r.bonus;
    sections.push({
      title: 'ゲーム内ポイント（非換金）',
      lines: [
        `本アプリのボーナスはすべて ${b.label} です。現金・景品との交換はありません。`,
        `一発${b.ippatsu} / 裏ドラ${b.ura} / 赤${b.aka} / 金${b.gold} / 白ポッチ${b.pocchi} / 北${b.kita}（各1枚あたり）`,
        `三倍満${b.sanbaiman} / 数え役満${b.countedYakuman} / 役満${b.yakuman}（ロンは×${b.yakumanRonMultiplier}）`,
      ],
    });
  }
  return sections;
}

function describeEffects(effects = []) {
  return effects.map((e) => {
    switch (e.type) {
      case 'dora': return `ドラ+${e.value ?? 1}`;
      case 'han': return `${e.value ?? 1}翻追加`;
      case 'bonus': return `ボーナス+${e.value ?? 1}BP`;
      case 'rankUp': return `打点${e.value ?? 1}ランクアップ`;
      case 'almighty': return 'オールマイティ牌として使用可';
      case 'doubleDora': return '対象牌をダブルドラ化';
      case 'bonusMultiply': return `ボーナス×${e.value ?? 2}`;
      case 'yakuman': return '役満扱い';
      default: return e.type;
    }
  }).join('、');
}

/**
 * 特殊牌の効果を、麻雀は分かるが この店は初めて という人向けの1文にする。
 * 「特別な牌です」だけでは何も伝わらないので、条件と結果を言い切る。
 */
function specialTileSentence(d) {
  const c = d.conditions || {};
  const when = [];
  if (c.riichiOnly) when.push('リーチしているとき');
  if (c.menzenOnly) when.push('門前のとき');
  if (c.tsumoOnly) when.push('ツモ和了のとき');
  if (c.ronOnly) when.push('ロン和了のとき');
  if (c.ippatsuOnly) when.push('一発のとき');
  const head = when.length ? `${when.join('で')}、この牌を持っていると` : 'この牌を持っていると';
  const results = (d.effects || []).map((e) => {
    switch (e.type) {
      case 'dora': return `ドラ${e.value ?? 1}枚分になります`;
      case 'han': return `${e.value ?? 1}翻ぶん打点が上がります`;
      case 'bonus': return `ボーナスポイントが${e.value ?? 1}もらえます`;
      case 'rankUp': return `満貫・跳満といった打点が${e.value ?? 1}段階上がります`;
      case 'almighty': return '好きな牌の代わりとして使えます';
      case 'doubleDora': return '対象の牌がドラ2枚分になります';
      case 'bonusMultiply': return `もらえるボーナスが${e.value ?? 2}倍になります`;
      case 'scoreMultiply': return `和了点が${e.value ?? 2}倍になります`;
      case 'yakuman': return '役満あつかいになります';
      case 'alice': return '和了したあとに山をめくるチャンスが発生します';
      case 'dice': return 'サイコロを振れます';
      case 'ura': return '裏ドラが増えます';
      default: return null;
    }
  }).filter(Boolean);
  if (!results.length) return 'この店だけの特別な牌です。普通の牌としても使えます。';
  return `${head}${results.join('。さらに')}。`;
}

function describeConditions(c = {}) {
  const list = [];
  if (c.menzenOnly) list.push('門前限定');
  if (c.riichiOnly) list.push('リーチ時限定');
  if (c.tsumoOnly) list.push('ツモ限定');
  if (c.ronOnly) list.push('ロン限定');
  if (c.ippatsuOnly) list.push('一発時限定');
  if (c.openInvalid) list.push('副露時無効');
  if (c.combo?.length) list.push(`${c.combo.join('＋')}との組み合わせ時のみ`);
  return list.length ? `（${list.join('・')}）` : '';
}

function flowerEffectText(e) {
  switch (e.type) {
    case 'bonusPerTile': return `抜いた枚数×${e.value ?? 1}BP を即時獲得${e.all ? '（オール）' : ''}`;
    case 'rankUp': return `和了時に打点が${e.value ?? 1}ランクアップ`;
    case 'doubleDoraFives': return '5の牌がダブルドラになる';
    case 'alice': return `和了時にアリス発動（一致1枚あたり${e.value ?? 1}BP）`;
    case 'dora': return `ドラ+${e.value ?? 1}`;
    case 'han': return `${e.value ?? 1}翻追加`;
    default: return e.type;
  }
}

function aliceText(a, label) {
  const cond = [];
  if (a.requireMenzen) cond.push('門前');
  if (a.requireRiichi) cond.push('リーチ');
  if (a.tsumoOnly) cond.push('ツモ');
  const startLabel = a.start === 'nextDora' ? 'ドラ表示牌の隣' : '王牌の端';
  const matchLabel = a.matchMode === 'tulip' ? '同じ牌＋その両隣' : '同じ牌';
  const targetLabel = a.matchTarget === 'winTile' ? '和了牌' : '手牌';
  return `${label}あり。${cond.length ? `${cond.join('・')}での和了時に、` : '和了時に、'}${startLabel}から牌をめくり、${targetLabel}に${matchLabel}があれば一致1枚あたり${a.bonusPerMatch}BP。`
    + `${a.continueOnMatch ? '一致する限り続けてめくります' : '1回のみ'}（最大${a.maxFlips}枚・上限${a.max}BP）。`;
}

function triggerLabel(t) {
  return ({
    yakuman: '本役満', countedYakuman: '数え役満', fourKita: '四北', fourFlower: '四華',
    pocchiTsumo: '白ポッチツモ', custom: 'ハウスルール',
  }[t] || t);
}

function customRuleText(rule) {
  const whenLabel = { win: '和了時', draw: '流局時', kyokuStart: '局開始時', kan: 'カン時', kita: '北抜き時', flower: '華牌抜き時' }[rule.when] || rule.when;
  const ifText = (rule.if || []).map((f) => {
    switch (f.fact) {
      case 'hasTile': return `${tileLabel(f.tile)}を${f.count ?? 1}枚以上含む`;
      case 'hasSpecial': return `特殊牌「${f.id}」を含む`;
      case 'menzen': return '門前';
      case 'tsumo': return 'ツモ';
      case 'ron': return 'ロン';
      case 'riichi': return 'リーチ';
      case 'ippatsu': return '一発';
      case 'han': return `${f.value}翻以上`;
      case 'flower': return `華牌${f.value}枚以上`;
      case 'kita': return `北${f.value}枚以上`;
      case 'dealer': return '親';
      default: return f.fact;
    }
  }).join(' かつ ');
  const thenText = (rule.then || []).map((a) => {
    switch (a.action) {
      case 'bonus': return `${a.value}BP獲得`;
      case 'han': return `${a.value}翻追加`;
      case 'dora': return `ドラ+${a.value}`;
      case 'rankUp': return `打点${a.value ?? 1}ランクアップ`;
      case 'points': return `${a.value}点移動`;
      case 'dice': return 'サイコロチャンス発動';
      default: return a.action;
    }
  }).join('＋');
  return `${whenLabel}に「${ifText}」なら ${thenText}。`;
}

// ---------------------------------------------------------------------------
// 一般ルールとの差分
// ---------------------------------------------------------------------------
const DIFF_TARGETS = [
  ['game.length', '対局の長さ', (v) => LENGTH_LABEL[v] || v],
  ['game.tobiEnd', 'トビ終了', (v) => (v ? 'あり' : 'なし')],
  ['game.agariYame', 'アガリやめ', (v) => (v ? 'あり' : 'なし')],
  ['game.westEntry', '西入', (v) => (v ? 'あり' : 'なし')],
  ['scoring.startingPoints', '持ち点', (v) => `${num(v)}点`],
  ['scoring.returnPoints', '返し点', (v) => `${num(v)}点`],
  ['scoring.uma', 'ウマ', (v) => v.join(' / ')],
  ['scoring.useFu', '符計算', (v) => (v ? 'あり' : 'なし（30符固定）')],
  ['scoring.roundUpMangan', '切り上げ満貫', (v) => (v ? 'あり' : 'なし')],
  ['scoring.countedYakumanHan', '数え役満', (v) => `${v}翻以上`],
  ['scoring.rankOnly', '完全順位制', (v) => (v ? 'あり' : 'なし')],
  ['scoring.shizumiUma', '沈みウマ', (v) => (v ? 'あり' : 'なし')],
  ['win.kuitan', '喰いタン', (v) => (v ? 'あり' : 'なし')],
  ['win.atozuke', '後付け', (v) => (v ? 'あり' : 'なし（完全先付け）')],
  ['win.kuikae', '食い替え', (v) => (v ? '可' : '不可')],
  ['win.doubleRon', 'ダブロン', (v) => (v ? 'あり' : 'なし（頭ハネ）')],
  ['win.formalTenpai', '形式テンパイ', (v) => (v ? '認める' : '認めない')],
  ['renchan.dealerRepeat', '連荘', (v) => REPEAT_LABEL[v] || v],
  ['ryuukyoku.notenPenalty', 'ノーテン罰符', (v) => `場${num(v)}点`],
  ['dora.indicators', '表ドラ表示牌', (v) => `${v}枚`],
  ['dora.ura', '裏ドラ', (v) => (v ? 'あり' : 'なし')],
  ['dora.kanDora', '槓ドラ', (v) => (v ? 'あり' : 'なし')],
  ['dora.red', '赤牌', (v) => (Object.keys(v).length ? Object.entries(v).map(([c, n]) => `赤${tileLabel(c)}${n}`).join('・') : 'なし')],
  ['dora.gold', '金牌', (v) => (Object.keys(v).length ? Object.entries(v).map(([c, n]) => `金${tileLabel(c)}${n}`).join('・') : 'なし')],
  ['sanma.tsumoLoss', 'ツモ損', (v) => (v ? 'あり' : 'なし（丸取り）')],
  ['sanma.northMode', '北の扱い', (v) => ({ nuki: '抜きドラ', yakuhai: '役牌', normal: '通常牌' }[v] || v)],
  ['sanma.removeManzu', '萬子', (v) => (v ? '一部を抜く' : 'すべて使う')],
  ['sanma.manzuKeep', '残す萬子', (v) => v.map(tileLabel).join('・')],
  ['local.shiroPocchi.enabled', '白ポッチ', (v) => (v ? 'あり' : 'なし')],
  ['local.alice.enabled', 'アリス', (v) => (v ? 'あり' : 'なし')],
  ['local.tulip.enabled', 'チューリップ', (v) => (v ? 'あり' : 'なし')],
  ['local.openRiichi.enabled', 'オープンリーチ', (v) => (v ? 'あり' : 'なし')],
  ['local.wareme.enabled', '割れ目', (v) => (v ? 'あり' : 'なし')],
  ['local.dice.enabled', 'サイコロチャンス', (v) => (v ? 'あり' : 'なし')],
  ['local.yakitori.enabled', '焼き鳥', (v) => (v ? 'あり' : 'なし')],
  ['local.shouhaiMighty.enabled', '少牌マイティ', (v) => (v ? 'あり' : 'なし')],
  ['game.pointCapEnd.enabled', '点数で打ち切り', (v) => (v ? 'あり' : 'なし')],
  ['flowers.enabled', '華牌（春夏秋冬）', (v) => (v ? 'あり' : 'なし')],
  ['scoring.mode', '点数体系', (v) => (v === 'flat' ? '東天紅系（点計算）' : '通常')],
  ['dora.bakuDora', '爆ドラ', (v) => (v ? `追加${v}枚` : 'なし')],
  ['dora.blue', '青牌', (v) => (Object.keys(v).length ? Object.entries(v).map(([c, n]) => `青${tileLabel(c)}${n}`).join('・') : 'なし')],
  ['dora.star', '星牌', (v) => (Object.keys(v).length ? Object.entries(v).map(([c, n]) => `星${tileLabel(c)}${n}`).join('・') : 'なし')],
  ['dora.rainbow', '虹牌', (v) => (Object.keys(v).length ? Object.entries(v).map(([c, n]) => `虹${tileLabel(c)}${n}`).join('・') : 'なし')],
  ['game.alwaysEast', '場風', (v) => (v ? '常に東場' : '東→南と進む')],
  ['game.dealerRule', '次局の親', (v) => (v === 'winner' ? '前局の和了者' : '順番に交代')],
  ['sanma.extraNukiTiles', '北以外の抜き牌', (v) => (v.length ? v.map(tileLabel).join('・') : 'なし')],
  ['local.wareme.allPlayers', '全員割れ目', (v) => (v ? 'あり' : 'なし')],
];

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** 一般ルールとの差分のみを返す */
export function diffFromBaseline(r) {
  const base = baselineRules(r.game.players);
  const out = [];
  for (const [path, label, fmt] of DIFF_TARGETS) {
    const a = get(base, path);
    const b = get(r, path);
    if (a === undefined || b === undefined) continue;
    if (same(a, b)) continue;
    out.push({ label, from: fmt(a), to: fmt(b), path });
  }
  if ((r.specialTiles || []).length) {
    out.push({
      label: '特殊牌',
      from: 'なし',
      to: r.specialTiles.map((d) => `${d.name}（${describeEffects(d.effects)}）`).join(' / '),
      path: 'specialTiles',
    });
  }
  const activeLocalYaku = (r.localYaku || []).filter((y) => y.enabled !== false);
  if (activeLocalYaku.length) {
    out.push({
      label: 'ローカル役',
      from: 'なし',
      to: activeLocalYaku.map((y) => `${localYakuName(y)}（${localYakuStrength(y)}）`).join(' / '),
      path: 'localYaku',
    });
  }
  if ((r.customRules || []).length) {
    out.push({
      label: 'ハウスルール',
      from: 'なし',
      to: r.customRules.map((c) => c.name).join(' / '),
      path: 'customRules',
    });
  }
  return out;
}

/** 1行サマリ（店舗カード用） */
export function shortSummary(r) {
  const parts = [];
  parts.push(r.game.players === 3 ? '三麻' : '四麻');
  parts.push(LENGTH_LABEL[r.game.length] || r.game.length);
  parts.push(`${num(r.scoring.startingPoints)}/${num(r.scoring.returnPoints)}`);
  const reds = Object.values(r.dora.red || {}).reduce((a, b) => a + b, 0);
  parts.push(reds ? `赤${reds}` : '赤なし');
  if (r.dora.indicators >= 2) parts.push(`常時ドラ${r.dora.indicators}`);
  if (r.local.shiroPocchi.enabled) parts.push('白ポッチ');
  if (r.local.alice.enabled) parts.push('アリス');
  if (r.local.tulip.enabled) parts.push('チューリップ');
  if (r.local.shouhaiMighty && r.local.shouhaiMighty.enabled) parts.push('少牌マイティ');
  if (r.game.pointCapEnd && r.game.pointCapEnd.enabled) parts.push(`${num(r.game.pointCapEnd.points)}点で終了`);
  if (r.local.wareme.enabled) parts.push('割れ目');
  if (r.local.openRiichi.enabled) parts.push('オープンリーチ');
  if (r.flowers.enabled) parts.push('華牌');
  if (r.local.dice.enabled) parts.push('サイコロチャンス');
  if ((r.specialTiles || []).length) parts.push(`特殊牌${r.specialTiles.length}種`);
  if (r.dora.bakuDora) parts.push('爆ドラ');
  if (r.scoring.mode === 'flat') parts.push('東天紅系');
  const lyc = (r.localYaku || []).filter((y) => y.enabled !== false).length;
  if (lyc) parts.push(`ローカル役${lyc}種`);
  return parts.join(' / ');
}

// ---------------------------------------------------------------------------
// 初心者向けの説明
//   専門用語をかみ砕き、「何が起きるのか」だけを伝える。
//   経験者向け（explainRules）とは別に持ち、店舗ページで切り替えられるようにする。
// ---------------------------------------------------------------------------

/**
 * 初心者向けの説明を生成する。
 * @returns {{title:string, tone:string, body:string, more?:string}[]}
 */
export function explainForBeginners(r) {
  const out = [];
  const add = (title, tone, body, more) => out.push({ title, tone, body, more });
  const isSanma = r.game.players === 3;

  add(
    isSanma ? '3人で打ちます' : '4人で打ちます',
    'slate',
    isSanma
      ? '三人麻雀です。チーはできません。使う牌も4人麻雀とは少し違います。'
      : '一般的な4人麻雀です。',
    isSanma && r.sanma.removeManzu
      ? `萬子は${(r.sanma.manzuKeep || ['1m', '9m']).map(tileLabel).join('・')}だけを使い、それ以外の萬子は入っていません。`
      : null,
  );

  if (r.scoring.mode === 'flat') {
    add('点数の数え方が独特です', 'teal',
      '「翻」ではなく「点」で数えます。ロンした場合は放銃した人からだけ、ツモの場合は2人からもらいます。',
      `${r.scoring.flat.fuFixed}符固定で計算し、役満は${r.scoring.flat.yakumanPoints}点です。`);
  } else {
    add('持ち点と返し点', 'slate',
      `${num(r.scoring.startingPoints)}点から始めて、${num(r.scoring.returnPoints)}点を基準に順位点が付きます。`,
      r.scoring.rankOnly ? '素点は成績に反映されず、順位だけで決まります。' : null);
  }

  if (r.local.shiroPocchi.enabled) {
    const cond = { always: 'いつでも', any_tsumo: 'ツモのときに', riichi_tsumo: 'リーチしたあとのツモで' }[r.local.shiroPocchi.almightyCondition];
    add('白ポッチ', 'sky',
      `白の牌のうち1枚に赤い点が付いています。${cond}引くと、好きな牌の代わりに使えます。`,
      `この店には${r.local.shiroPocchi.count}枚入っています。もちろん普通の「白」としても使えます。`);
  }

  if (r.local.alice.enabled) {
    add('アリス', 'coral',
      '和了したあとに、山から牌をめくります。自分の手にあった牌と同じものが出るとボーナス。当たるかぎり、めくり続けられます。',
      `一致1枚につき${r.local.alice.bonusPerMatch}BP、最大${r.local.alice.maxFlips}枚までめくれます。`);
  }
  if (r.local.tulip.enabled) {
    add('チューリップ', 'coral',
      'アリスと似ていますが、めくった牌の「1つ隣」までが当たり扱いになります。そのぶん当たりやすくなります。', null);
  }

  if (r.flowers.enabled) {
    const eff = (r.flowers.tiles || []).map((k) => `${FLOWER_JP[k]}＝${flowerShort(r.flowers.effects[k])}`).join('／');
    add('華牌（春夏秋冬）', 'amber',
      '春夏秋冬という特別な牌が入っています。引いたら自動で手牌から抜けて、すぐ次の牌を引きます。',
      `それぞれ効果が違います。${eff}`);
  }

  if (isSanma && r.sanma.northMode === 'nuki') {
    const extra = (r.sanma.extraNukiTiles || []).map(tileLabel);
    add('抜きドラ', 'teal',
      `北${extra.length ? `と${extra.join('・')}` : ''}は、手牌から抜いて自分の前に置きます。抜くとドラが増えて、打点が上がります。`,
      '抜いたあとは、すぐ次の牌を引けます。');
  }

  for (const d of r.specialTiles || []) {
    out.push({
      title: d.name,
      tone: 'violet',
      body: d.description || specialTileSentence(d),
      more: `効果：${describeEffects(d.effects)}${describeConditions(d.conditions)}`,
      tile: { code: d.tile, sp: d.id, color: d.color, name: d.name },
    });
  }

  if (r.local.wareme.enabled) {
    add('割れ目', 'rose',
      r.local.wareme.allPlayers
        ? `全員が「割れ目」です。やり取りする点数がすべて${r.local.wareme.multiplier}倍になります。`
        : `サイコロで1人が「割れ目」になります。その人は、払うときも受け取るときも${r.local.wareme.multiplier}倍です。`,
      null);
  }

  if (r.local.openRiichi.enabled) {
    add('オープンリーチ', 'rose',
      '手牌を見せてリーチする代わりに、和了したときの点数が上がります。',
      `+${r.local.openRiichi.han}翻。${r.local.openRiichi.revealMode === 'waits' ? '見せるのは待ち牌だけです。' : '手牌をすべて見せます。'}`);
  }

  if (r.local.dice.enabled) {
    add('サイコロチャンス', 'amber',
      '特定の条件を満たすと、サイコロを振れます。出た目に応じてボーナスがもらえます。',
      `サイコロ${r.local.dice.count}個。ゾロ目が出るとさらに増えます。`);
  }

  const reds = Object.values(r.dora.red || {}).reduce((a, b) => a + b, 0);
  if (reds || Object.keys(r.dora.gold || {}).length) {
    add('赤牌・金牌', 'rose',
      '色の付いた「5」の牌が入っています。持っているだけで打点が上がります。',
      `赤${reds}枚${Object.keys(r.dora.gold || {}).length ? '／金牌あり' : ''}`);
  }

  if (r.dora.bakuDora > 0) {
    add('爆ドラ', 'violet',
      `ドラを示す牌が多めにめくられます（合計${r.dora.indicators + r.dora.bakuDora}枚）。全体的に点数が高くなります。`, null);
  }

  if (r.bonus.enabled) {
    add('BP（ボーナスポイント）', 'mint',
      'このアプリの中だけで使う点数です。現金や景品と交換することはできません。',
      '一発・裏ドラ・赤牌などで増えます。');
  }
  return out;
}

function flowerShort(list) {
  if (!list || !list.length) return '効果なし';
  const e = list[0];
  return {
    bonusPerTile: 'すぐにボーナス',
    rankUp: '打点が上がる',
    doubleDoraFives: '5の牌のドラが倍',
    alice: '和了時にアリス',
    dora: 'ドラが増える',
    han: '翻が増える',
  }[e.type] || e.type;
}
