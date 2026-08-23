/**
 * yaku.js - 役判定と符計算
 *
 * ルール依存部分（喰いタン・後付け・オープンリーチ・北役牌・数え役満開始翻など）は
 * すべて rules オブジェクト経由で受け取り、ハードコードしない。
 */
import {
  NUM_TYPES, isHonor, isTerminal, isYaochu, isGreen, suitOf, numOf, T,
} from './tiles.js';
import { decomposeStandard, isChiitoi, isKokushi, isChiiseimukou, countsFromTiles } from './hand.js';

/**
 * @typedef {Object} WinContext
 * @property {import('./tiles.js').Tile[]} hand   門前手牌（和了牌を含む）
 * @property {Array} melds                        副露 [{kind:'chi'|'pon'|'kan', tiles, concealed, from}]
 * @property {Object} winTile                     和了牌
 * @property {boolean} tsumo
 * @property {number} seatWind                    0=東 1=南 2=西 3=北
 * @property {number} roundWind
 * @property {Object} flags                       {riichi, doubleRiichi, openRiichi, ippatsu, rinshan, chankan, haitei, houtei, tenhou, chiihou}
 * @property {Object} rules
 * @property {number[]} doraTypes                 ドラ本体の牌タイプ配列（重複可 = 枚数分）
 * @property {number} kitaCount                   北抜き枚数
 * @property {number} flowerDoraCount             花牌による抜きドラ枚数
 */

const YAKUMAN = 'yakuman';

function setsFromContext(ctx, decomp) {
  const sets = [];
  for (const s of decomp.sets) sets.push({ kind: s.kind, t: s.t, open: false, kan: false });
  for (const m of ctx.melds) {
    if (m.kind === 'chi') sets.push({ kind: 'run', t: Math.min(...m.tiles.map((x) => x.t)), open: true, kan: false });
    else if (m.kind === 'pon') sets.push({ kind: 'triplet', t: m.tiles[0].t, open: true, kan: false });
    else sets.push({ kind: 'triplet', t: m.tiles[0].t, open: !m.concealed, kan: true });
  }
  return sets;
}

const isMenzen = (ctx) => ctx.melds.every((m) => m.kind === 'kan' && m.concealed);

/** ロンでシャンポン待ちを埋めた場合、その刻子は暗刻として数えない */
function ronDegradesTriplet(ctx, decomp) {
  if (ctx.tsumo || !decomp) return false;
  return decomp.sets.some((s) => s.kind === 'triplet' && s.t === ctx.winTile.t);
}

function yakuhaiCount(t, ctx) {
  let n = 0;
  if (t === T.HAKU || t === T.HATSU || t === T.CHUN) n++;
  if (t === 27 + ctx.roundWind) n++;
  if (t === 27 + ctx.seatWind) n++;
  if (t === T.NORTH && ctx.rules.sanma?.northIsYakuhai && ctx.seatWind !== 3 && ctx.roundWind !== 3) n++;
  return n;
}

// ---------------------------------------------------------------------------
// 役満
// ---------------------------------------------------------------------------
function checkYakuman(ctx, counts, sets, decomp) {
  const out = [];
  const menzen = isMenzen(ctx);
  const f = ctx.flags;

  if (f.tenhou) out.push({ name: '天和', yakuman: 1 });
  if (f.chiihou) out.push({ name: '地和', yakuman: 1 });

  if (isKokushi(counts) && menzen) {
    const pairT = counts.findIndex((c) => c === 2);
    const thirteen = pairT === ctx.winTile.t && !ctx.tsumo ? false : counts[ctx.winTile.t] === 2;
    out.push(thirteen
      ? { name: '国士無双十三面', yakuman: ctx.rules.scoring.doubleYakuman ? 2 : 1 }
      : { name: '国士無双', yakuman: 1 });
    return out;
  }
  if (!sets) return out;

  const triplets = sets.filter((s) => s.kind === 'triplet');
  const concealedTriplets = triplets.filter((s) => !s.open);
  const degraded = ronDegradesTriplet(ctx, decomp);

  // 四暗刻（ロンでシャンポンを埋めた場合は成立しない＝対々和＋三暗刻になる）
  if (concealedTriplets.length === 4 && menzen && !degraded) {
    const tanki = decomp && decomp.pair === ctx.winTile.t;
    out.push(tanki
      ? { name: '四暗刻単騎', yakuman: ctx.rules.scoring.doubleYakuman ? 2 : 1 }
      : { name: '四暗刻', yakuman: 1 });
  }
  // 大三元 / 小三元
  const dragons = [T.HAKU, T.HATSU, T.CHUN];
  const dragonTriplets = dragons.filter((d) => triplets.some((s) => s.t === d));
  if (dragonTriplets.length === 3) out.push({ name: '大三元', yakuman: 1 });
  // 四喜和
  const winds = [T.EAST, T.SOUTH, T.WEST, T.NORTH];
  const windTriplets = winds.filter((w) => triplets.some((s) => s.t === w));
  if (windTriplets.length === 4) {
    out.push({ name: '大四喜', yakuman: ctx.rules.scoring.doubleYakuman ? 2 : 1 });
  } else if (windTriplets.length === 3 && decomp && winds.includes(decomp.pair)) {
    out.push({ name: '小四喜', yakuman: 1 });
  }
  // 緑一色
  if (counts.every((c, i) => c === 0 || isGreen(i))) out.push({ name: '緑一色', yakuman: 1 });
  // 清老頭
  if (counts.every((c, i) => c === 0 || isTerminal(i))) out.push({ name: '清老頭', yakuman: 1 });
  // 四槓子
  if (sets.filter((s) => s.kan).length === 4) out.push({ name: '四槓子', yakuman: 1 });
  // 九蓮宝燈
  if (menzen) {
    for (let s = 0; s < 3; s++) {
      const base = s * 9;
      let ok = true, total = 0;
      for (let i = 0; i < NUM_TYPES; i++) {
        if (counts[i] === 0) continue;
        if (i < base || i >= base + 9) { ok = false; break; }
        total += counts[i];
      }
      if (!ok || total !== 14) continue;
      const need = [3, 1, 1, 1, 1, 1, 1, 1, 3];
      let extra = -1, valid = true;
      for (let i = 0; i < 9; i++) {
        const d = counts[base + i] - need[i];
        if (d === 1 && extra < 0) extra = i;
        else if (d !== 0) { valid = false; break; }
      }
      if (valid) {
        const pure = extra === numOf(ctx.winTile.t) - 1;
        out.push(pure
          ? { name: '純正九蓮宝燈', yakuman: ctx.rules.scoring.doubleYakuman ? 2 : 1 }
          : { name: '九蓮宝燈', yakuman: 1 });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 通常役
// ---------------------------------------------------------------------------
function checkYaku(ctx, counts, sets, decomp) {
  const out = [];
  const menzen = isMenzen(ctx);
  const open = !menzen;
  const f = ctx.flags;
  const R = ctx.rules;

  // --- 状況役
  if (f.riichi) {
    if (f.doubleRiichi) out.push({ name: 'ダブル立直', han: 2 });
    else out.push({ name: '立直', han: 1 });
    if (f.openRiichi) out.push({ name: 'オープン立直', han: R.local.openRiichi.han ?? 1 });
  }
  if (f.ippatsu) out.push({ name: '一発', han: 1 });
  if (ctx.tsumo && menzen) out.push({ name: '門前清自摸和', han: 1 });
  if (f.rinshan) out.push({ name: '嶺上開花', han: 1 });
  if (f.chankan) out.push({ name: '搶槓', han: 1 });
  if (f.haitei) out.push({ name: '海底摸月', han: 1 });
  if (f.houtei) out.push({ name: '河底撈魚', han: 1 });

  // --- 七対子
  if (decomp === null) {
    out.push({ name: '七対子', han: 2 });
    if (counts.every((c, i) => c === 0 || isYaochu(i))) out.push({ name: '混老頭', han: 2 });
    const suits = new Set();
    let honor = false;
    counts.forEach((c, i) => { if (c > 0) { if (isHonor(i)) honor = true; else suits.add(suitOf(i)); } });
    if (suits.size === 1 && honor) out.push({ name: '混一色', han: menzen ? 3 : 2 });
    if (suits.size === 1 && !honor) out.push({ name: '清一色', han: menzen ? 6 : 5 });
    if (counts.every((c, i) => c === 0 || (!isYaochu(i)))) {
      if (R.win.kuitan || menzen) out.push({ name: '断幺九', han: 1 });
    }
    return out;
  }

  const runs = sets.filter((s) => s.kind === 'run');
  const triplets = sets.filter((s) => s.kind === 'triplet');
  const concealedTriplets = triplets.filter((s) => !s.open);
  const pair = decomp.pair;

  // --- 役牌
  for (const s of triplets) {
    const n = yakuhaiCount(s.t, ctx);
    if (n > 0) {
      const label = s.t === T.HAKU ? '白' : s.t === T.HATSU ? '發' : s.t === T.CHUN ? '中'
        : s.t === 27 + ctx.roundWind ? '場風' : s.t === 27 + ctx.seatWind ? '自風'
          : '北';
      out.push({ name: `役牌 ${label}`, han: n });
    }
  }

  // --- 平和
  if (menzen && runs.length === 4 && yakuhaiCount(pair, ctx) === 0) {
    const wt = ctx.winTile.t;
    const ryanmen = runs.some((s) => {
      if (s.t === wt && numOf(wt) <= 7 && s.t % 9 !== 6) return true;   // 下端待ち（辺張除く）
      if (s.t + 2 === wt && numOf(wt) >= 3 && s.t % 9 !== 0) return true; // 上端待ち
      return false;
    });
    // 関西のサンマには「平和ツモなし」（ツモると平和が消える）店が多い
    const pinfuOk = ctx.rules.win.pinfuTsumo !== false || !ctx.tsumo;
    if (ryanmen && pinfuOk) out.push({ name: '平和', han: 1 });
  }

  // --- 断幺九
  if (counts.every((c, i) => c === 0 || !isYaochu(i))
    && ctx.melds.every((m) => m.tiles.every((t) => !isYaochu(t.t)))) {
    if (R.win.kuitan || menzen) out.push({ name: '断幺九', han: 1 });
  }

  // --- 一盃口 / 二盃口
  const runKey = {};
  for (const s of runs) runKey[s.t] = (runKey[s.t] || 0) + 1;
  const iipeiko = Object.values(runKey).filter((v) => v >= 2).length;
  if (menzen) {
    if (iipeiko >= 2) out.push({ name: '二盃口', han: 3 });
    else if (iipeiko === 1) out.push({ name: '一盃口', han: 1 });
  }

  // --- 三色同順
  for (let n = 0; n <= 6; n++) {
    if ([0, 9, 18].every((b) => runs.some((s) => s.t === b + n))) {
      out.push({ name: '三色同順', han: open ? 1 : 2 });
      break;
    }
  }
  // --- 一気通貫
  for (const b of [0, 9, 18]) {
    if ([0, 3, 6].every((n) => runs.some((s) => s.t === b + n))) {
      out.push({ name: '一気通貫', han: open ? 1 : 2 });
      break;
    }
  }
  // --- 三色同刻
  for (let n = 0; n <= 8; n++) {
    if ([0, 9, 18].every((b) => triplets.some((s) => s.t === b + n))) {
      out.push({ name: '三色同刻', han: 2 });
      break;
    }
  }
  // --- 対々和 / 三暗刻 / 三槓子
  if (triplets.length === 4) out.push({ name: '対々和', han: 2 });
  const effectiveAnko = concealedTriplets.length - (ronDegradesTriplet(ctx, decomp) ? 1 : 0);
  if (effectiveAnko === 3) out.push({ name: '三暗刻', han: 2 });
  const kans = sets.filter((s) => s.kan).length;
  if (kans === 3) out.push({ name: '三槓子', han: 2 });

  // --- 小三元
  const dragons = [T.HAKU, T.HATSU, T.CHUN];
  const dTri = dragons.filter((d) => triplets.some((s) => s.t === d)).length;
  if (dTri === 2 && dragons.includes(pair)) out.push({ name: '小三元', han: 2 });

  // --- チャンタ系
  const blocks = [...sets.map((s) => (s.kind === 'run' ? [s.t, s.t + 1, s.t + 2] : [s.t])), [pair]];
  const allHasYaochu = blocks.every((b) => b.some((t) => isYaochu(t)));
  const anyHonor = blocks.some((b) => b.some((t) => isHonor(t)));
  if (allHasYaochu) {
    if (blocks.every((b) => b.every((t) => isYaochu(t)))) out.push({ name: '混老頭', han: 2 });
    else if (anyHonor) out.push({ name: '混全帯幺九', han: open ? 1 : 2 });
    else out.push({ name: '純全帯幺九', han: open ? 2 : 3 });
  }

  // --- 一色系
  const suits = new Set();
  let honor = false;
  counts.forEach((c, i) => { if (c > 0) { if (isHonor(i)) honor = true; else suits.add(suitOf(i)); } });
  for (const m of ctx.melds) {
    for (const t of m.tiles) { if (isHonor(t.t)) honor = true; else suits.add(suitOf(t.t)); }
  }
  if (suits.size === 1 && honor) out.push({ name: '混一色', han: menzen ? 3 : 2 });
  if (suits.size === 1 && !honor) out.push({ name: '清一色', han: menzen ? 6 : 5 });
  if (suits.size === 0 && honor) out.push({ name: '混老頭', han: 0 }); // 字一色は役満側で扱う

  // 字一色（役満）
  if (counts.every((c, i) => c === 0 || isHonor(i))
    && ctx.melds.every((m) => m.tiles.every((t) => isHonor(t.t)))) {
    return [{ name: '字一色', yakuman: 1 }];
  }
  return out.filter((y) => y.han !== 0);
}

// ---------------------------------------------------------------------------
// 符計算
// ---------------------------------------------------------------------------
function calcFu(ctx, sets, decomp, yakuList) {
  const R = ctx.rules;
  if (!R.scoring.useFu) return 30;
  if (decomp === null) return 25; // 七対子
  const menzen = isMenzen(ctx);
  let fu = 20;
  if (menzen && !ctx.tsumo) fu += 10;
  const pinfu = yakuList.some((y) => y.name === '平和');
  if (ctx.tsumo && !pinfu) fu += 2;

  // 和了牌がどの面子に吸収されたか（暗刻→明刻の降格判定）
  const wt = ctx.winTile.t;
  let ronTripletAdjusted = false;

  for (const s of sets) {
    if (s.kind !== 'triplet') continue;
    const yao = isYaochu(s.t);
    let concealed = !s.open;
    if (concealed && !s.kan && !ctx.tsumo && s.t === wt && !ronTripletAdjusted) {
      // ロンでシャンポン待ち → 明刻扱い
      const isShanpon = decomp.sets.some((x) => x.kind === 'triplet' && x.t === wt);
      if (isShanpon) { concealed = false; ronTripletAdjusted = true; }
    }
    if (s.kan) fu += concealed ? (yao ? 32 : 16) : (yao ? 16 : 8);
    else fu += concealed ? (yao ? 8 : 4) : (yao ? 4 : 2);
  }

  // 雀頭
  const pv = yakuhaiCount(decomp.pair, ctx);
  if (pv > 0) fu += R.scoring.doubleWindPairFu && pv >= 2 ? 4 : 2;

  // 待ちの形
  if (!pinfu) {
    const inRunEdge = decomp.sets.some((s) => s.kind === 'run' && (
      (s.t + 1 === wt) ||                                  // 嵌張
      (s.t === wt && s.t % 9 === 6) ||                      // 789の7待ち=辺張
      (s.t + 2 === wt && s.t % 9 === 0)                     // 123の3待ち=辺張
    ));
    if (decomp.pair === wt && !decomp.sets.some((s) => s.kind === 'run' && s.t <= wt && wt <= s.t + 2)) fu += 2; // 単騎
    else if (inRunEdge) fu += 2;
  }

  if (!menzen && fu === 20) fu = 30; // 喰い平和形
  return Math.ceil(fu / 10) * 10;
}

// ---------------------------------------------------------------------------
// ドラ・特殊牌の翻数
// ---------------------------------------------------------------------------
export function countDora(ctx) {
  const all = [...ctx.hand, ...ctx.melds.flatMap((m) => m.tiles)];
  const R = ctx.rules;
  const w = R.dora.attributeDora || { red: 1, gold: 1, blue: 1, star: 1, rainbow: 2 };
  let dora = 0, aka = 0, gold = 0, other = 0;
  for (const tile of all) {
    for (const d of ctx.doraTypes) if (tile.t === d) dora++;
    if (tile.red) aka += w.red ?? 1;
    if (tile.gold && R.dora.goldIsDora) gold += w.gold ?? 1;
    if (tile.blue) other += w.blue ?? 1;
    if (tile.star) other += w.star ?? 1;
    if (tile.rainbow) other += w.rainbow ?? 2;
  }
  const kita = ctx.kitaCount * (R.sanma?.kitaIsDora ? 1 : 0);
  const flower = ctx.flowerDoraCount || 0;
  return { dora, aka, gold, other, kita, flower, total: dora + aka + gold + other + kita + flower };
}

// ---------------------------------------------------------------------------
// メイン評価
// ---------------------------------------------------------------------------
/**
 * 手牌を評価して最良の役構成を返す。
 * @returns {{yaku:Array, han:number, fu:number, yakuman:number, doraDetail:Object}|null}
 */
export function evaluate(ctx) {
  const counts = countsFromTiles(ctx.hand);
  const meldCount = ctx.melds.length;
  const needSets = 4 - meldCount;
  const candidates = [];

  // 特殊形
  if (meldCount === 0 && isChiitoi(counts, ctx.handOpts)) {
    const yaku = [...checkYaku(ctx, counts, null, null), ...checkLocalYaku(ctx, counts, null, null)];
    const ym = checkYakuman(ctx, counts, null, null);
    candidates.push(buildResult(ctx, yaku, ym, null, null, counts));
  }
  if (meldCount === 0 && isKokushi(counts)) {
    const ym = checkYakuman(ctx, counts, null, null);
    candidates.push(buildResult(ctx, [], ym, null, null, counts));
  }
  // 七星無靠は面子でも対子でもない特殊形。採用している店でだけ和了として数える
  if (meldCount === 0 && ctx.handOpts && ctx.handOpts.chiiseimukou && isChiiseimukou(counts)) {
    const local = checkLocalYaku(ctx, counts, null, null);
    const ym = [...checkYakuman(ctx, counts, null, null), ...local.filter((y) => y.yakuman)];
    candidates.push(buildResult(ctx, local.filter((y) => !y.yakuman), ym, null, null, counts));
  }
  const decomps = decomposeStandard(counts, needSets);
  for (const d of decomps) {
    const sets = setsFromContext(ctx, d);
    const ym = checkYakuman(ctx, counts, sets, d);
    const yaku = [...checkYaku(ctx, counts, sets, d), ...checkLocalYaku(ctx, counts, sets, d)];
    candidates.push(buildResult(ctx, yaku, ym, sets, d, counts));
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => (b.yakuman - a.yakuman) || (b.rank - a.rank));
  return candidates[0];
}

/**
 * 店ごとの取り決めで、標準役の翻数を差し替える。
 * 役満に格上げされたものは役満側へ移す。採用しない指定なら消す。
 */
function applyYakuOverrides(rules, yaku, yakumanList) {
  const ov = rules.yakuOverrides;
  if (!ov || !Object.keys(ov).length) return { yaku, yakumanList };
  const outYaku = [];
  let outYakuman = [...yakumanList];
  for (const y of yaku) {
    const o = ov[y.name];
    if (!o) { outYaku.push(y); continue; }
    if (o.enabled === false) continue;
    if (o.yakuman) { outYakuman.push({ name: y.name, yakuman: o.yakuman }); continue; }
    outYaku.push(typeof o.han === 'number' ? { ...y, han: o.han } : y);
  }
  // 役満側も、翻数へ引き下げたり採用外にできる
  const kept = [];
  for (const y of outYakuman) {
    const o = ov[y.name];
    if (!o) { kept.push(y); continue; }
    if (o.enabled === false) continue;
    if (o.yakuman) { kept.push({ ...y, yakuman: o.yakuman }); continue; }
    if (typeof o.han === 'number') { outYaku.push({ name: y.name, han: o.han }); continue; }
    kept.push(y);
  }
  outYakuman = kept;
  return { yaku: outYaku, yakumanList: outYakuman };
}

function buildResult(ctx, yaku, yakumanList, sets, decomp, counts) {
  const R = ctx.rules;
  ({ yaku, yakumanList } = applyYakuOverrides(R, yaku, yakumanList));
  const doraDetail = countDora(ctx);
  // 通常役リストに紛れ込んだ役満（字一色など）を役満側へ寄せる
  const embedded = yaku.filter((y) => y.yakuman);
  if (embedded.length) {
    yakumanList = [...yakumanList, ...embedded];
    yaku = yaku.filter((y) => !y.yakuman);
  }
  if (yakumanList.length) {
    const total = yakumanList.reduce((s, y) => s + y.yakuman, 0);
    const capped = R.scoring.multipleYakuman ? total : Math.min(1, total);
    return {
      yaku: yakumanList, han: 0, fu: 0, yakuman: capped, doraDetail,
      rank: 100000 + capped, isYakuman: true, sets, decomp,
    };
  }
  const han = yaku.reduce((s, y) => s + (y.han || 0), 0);
  const fu = calcFu(ctx, sets || [], decomp === undefined ? null : decomp, yaku);
  const withDora = han + doraDetail.total;
  return {
    yaku, han: withDora, baseHan: han, fu, yakuman: 0, doraDetail,
    rank: withDora * 1000 + fu, isYakuman: false, sets, decomp,
    hasYaku: han > 0,
  };
}

export { isMenzen, yakuhaiCount };

// ---------------------------------------------------------------------------
// ローカル役エンジン
//   店舗ごとに採用/不採用・翻数が分かれる役を、データで有効化できるようにする。
//   rules.localYaku = [{ id:'daisharin', enabled:true, han?:n, yakuman?:n }]
// ---------------------------------------------------------------------------

/** 組み込み述語。すべて (ctx, counts, sets, decomp, menzen) を受け取る */
export const LOCAL_YAKU_DEFS = {
  daisharin: {
    name: '大車輪', defaultYakuman: 1,
    desc: '同じ色の2〜8の対子7つ（筒子＝大車輪／索子＝大竹林／萬子＝大数隣）',
    test: (ctx, counts, sets, decomp, menzen) => {
      if (decomp !== null || !menzen) return false;
      for (let s = 0; s < 3; s++) {
        let ok = true;
        for (let i = 0; i < NUM_TYPES; i++) {
          if (counts[i] === 0) continue;
          const inRange = i >= s * 9 + 1 && i <= s * 9 + 7;
          if (!inRange || counts[i] !== 2) { ok = false; break; }
        }
        if (ok) return true;
      }
      return false;
    },
  },
  juuniraku: {
    name: '十二落抬', defaultHan: 2,
    desc: '4つ鳴いて単騎待ちで和了る',
    test: (ctx, counts, sets, decomp) => {
      if (!sets || !decomp) return false;
      const open = sets.filter((s) => s.open).length;
      if (open < 4) return false;
      return decomp.pair === ctx.winTile.t;
    },
  },
  wupinkaihua: {
    name: '五筒開花', defaultHan: 2,
    desc: '嶺上開花を5筒で和了る',
    test: (ctx) => !!ctx.flags.rinshan && ctx.winTile.t === 13,
  },
  ipinmoetsu: {
    name: '一筒摸月', defaultHan: 2,
    desc: '海底摸月を1筒で和了る',
    test: (ctx) => !!ctx.flags.haitei && ctx.tsumo && ctx.winTile.t === 9,
  },
  chuupinrouyui: {
    name: '九筒撈魚', defaultHan: 2,
    desc: '河底撈魚を9筒で和了る',
    test: (ctx) => !!ctx.flags.houtei && !ctx.tsumo && ctx.winTile.t === 17,
  },
  kinkeidokuritsu: {
    name: '金鶏独立', defaultHan: 1,
    desc: '1索の単騎待ちで和了る',
    test: (ctx, counts, sets, decomp) => !!decomp && decomp.pair === 18 && ctx.winTile.t === 18,
  },
  dokuchoukankou: {
    name: '独釣寒江雪', defaultHan: 1,
    desc: '1筒の単騎待ちで和了る',
    test: (ctx, counts, sets, decomp) => !!decomp && decomp.pair === 9 && ctx.winTile.t === 9,
  },
  kessenupin: {
    name: '血染五筒', defaultHan: 2,
    desc: '赤5筒で和了る',
    test: (ctx) => ctx.winTile.t === 13 && !!ctx.winTile.red,
  },
  sanshokushoudoukou: {
    name: '三色小同刻', defaultHan: 2,
    desc: '同じ数字を、3色そろえて刻子2つ＋対子1つ',
    test: (ctx, counts, sets, decomp) => {
      if (!sets || !decomp) return false;
      for (let n = 0; n < 9; n++) {
        const t = [n, n + 9, n + 18];
        const kou = t.filter((x) => sets.some((st) => st.kind === 'triplet' && st.t === x)).length;
        const pair = t.filter((x) => decomp.pair === x).length;
        if (kou === 2 && pair === 1) return true;
      }
      return false;
    },
  },
  seiiisou: {
    name: '背一色', defaultYakuman: 2,
    desc: '牌の裏の色がすべて同じ（2セットの牌を混ぜて打つ清一色ゲームの役）',
    test: (ctx) => {
      const tiles = [...ctx.hand];
      for (const m of ctx.melds || []) for (const t of m.tiles) tiles.push(t);
      if (!tiles.length) return false;
      const first = tiles[0].back;
      // 牌の裏に色が無いルール（1セットで打つ通常の麻雀）では成立しない
      if (!first) return false;
      return tiles.every((t) => t.back === first);
    },
  },
  tsubamegaeshi: {
    name: '燕返し', defaultYakuman: 1,
    desc: '相手のリーチ宣言牌をそのままロンする',
    test: (ctx) => !ctx.tsumo && !!ctx.flags.tsubame,
  },
  chiiseimukou: {
    name: '七星無靠', defaultYakuman: 1,
    desc: '字牌7種すべてと、色ごとに 1-4-7／2-5-8／3-6-9 の別々の筋で組んだ孤立形',
    test: (ctx, counts, sets, decomp, menzen) => {
      if (!menzen) return false;
      // 字牌は7種すべてを1枚ずつ
      for (let t = 27; t < NUM_TYPES; t++) if (counts[t] !== 1) return false;
      // 数牌は各色1枚ずつの孤立牌で、色ごとに違う筋を使う
      const suji = [[0, 3, 6], [1, 4, 7], [2, 5, 8]];
      const used = new Set();
      let numTiles = 0;
      for (let suit = 0; suit < 3; suit++) {
        const idx = [];
        for (let i = 0; i < 9; i++) {
          const c = counts[suit * 9 + i];
          if (c === 0) continue;
          if (c !== 1) return false;   // 同じ牌が2枚あれば孤立形にならない
          idx.push(i);
        }
        if (!idx.length) continue;
        numTiles += idx.length;
        const g = suji.findIndex((row) => idx.every((i) => row.includes(i)));
        if (g < 0 || used.has(g)) return false;
        used.add(g);
      }
      return numTiles === 7;
    },
  },
  jewel: {
    name: 'ジュエル', defaultHan: 1,
    desc: '宝石牌（特殊牌）を3種類以上そろえて和了る',
    test: (ctx) => {
      const kinds = new Set();
      for (const t of ctx.hand) if (t.sp) kinds.add(t.sp);
      for (const m of ctx.melds || []) for (const t of m.tiles) if (t.sp) kinds.add(t.sp);
      return kinds.size >= 3;
    },
  },
  jewelbox: {
    name: '宝石箱', defaultYakuman: 1,
    desc: 'その卓に入っている宝石牌を全種類そろえて和了る',
    test: (ctx) => {
      const all = new Set((ctx.rules.specialTiles || []).map((d) => d.id));
      if (all.size < 2) return false;
      const kinds = new Set();
      for (const t of ctx.hand) if (t.sp) kinds.add(t.sp);
      for (const m of ctx.melds || []) for (const t of m.tiles) if (t.sp) kinds.add(t.sp);
      for (const id of all) if (!kinds.has(id)) return false;
      return true;
    },
  },
  manzuhonitsu: {
    name: '萬子の混一色', defaultYakuman: 1,
    desc: '萬子と字牌だけで作る混一色（萬子をほとんど抜く三麻では極端に難しいため役満扱い）',
    test: (ctx, counts) => {
      const suits = new Set();
      let honor = false;
      counts.forEach((c, i) => { if (c > 0) { if (isHonor(i)) honor = true; else suits.add(suitOf(i)); } });
      for (const m of ctx.melds) {
        for (const t of m.tiles) { if (isHonor(t.t)) honor = true; else suits.add(suitOf(t.t)); }
      }
      return suits.size === 1 && suits.has(0) && honor;
    },
  },
  otafuku: {
    name: 'お多福', defaultHan: 5,
    desc: '5面待ち以上で和了る。待ちの種類ひとつにつき1翻',
    test: (ctx) => !ctx.flags.furiten && (ctx.flags.waitKinds || 0) >= 5,
    dynamicHan: (ctx) => ctx.flags.waitKinds || 5,
  },
  daichisei: {
    name: '大七星', defaultYakuman: 1,
    desc: '字牌のみの七対子',
    test: (ctx, counts, sets, decomp) =>
      decomp === null && counts.every((c, i) => c === 0 || isHonor(i)),
  },
  sanrenkou: {
    name: '三連刻', defaultHan: 2,
    desc: '同じ色で連続する3つの刻子',
    test: (ctx, counts, sets) => {
      if (!sets) return false;
      const tri = sets.filter((s) => s.kind === 'triplet' && s.t < 27).map((s) => s.t).sort((a, b) => a - b);
      for (let i = 0; i + 2 < tri.length; i++) {
        if (tri[i] + 1 === tri[i + 1] && tri[i] + 2 === tri[i + 2]
          && Math.floor(tri[i] / 9) === Math.floor(tri[i + 2] / 9)) return true;
      }
      return false;
    },
  },
  surenkou: {
    name: '四連刻', defaultYakuman: 1,
    desc: '同じ色で連続する4つの刻子',
    test: (ctx, counts, sets) => {
      if (!sets) return false;
      const tri = sets.filter((s) => s.kind === 'triplet' && s.t < 27).map((s) => s.t).sort((a, b) => a - b);
      for (let i = 0; i + 3 < tri.length; i++) {
        if (tri[i] + 1 === tri[i + 1] && tri[i] + 2 === tri[i + 2] && tri[i] + 3 === tri[i + 3]
          && Math.floor(tri[i] / 9) === Math.floor(tri[i + 3] / 9)) return true;
      }
      return false;
    },
  },
  isshoku_sanjun: {
    name: '一色三順', defaultHan: 2,
    desc: '同じ順子を3つ',
    test: (ctx, counts, sets) => {
      if (!sets) return false;
      const c = {};
      for (const s of sets) if (s.kind === 'run') c[s.t] = (c[s.t] || 0) + 1;
      return Object.values(c).some((v) => v >= 3);
    },
  },
  sanfuuko: {
    name: '三風刻', defaultHan: 2,
    desc: '風牌の刻子3つ（小四喜に満たない形）',
    test: (ctx, counts, sets) => {
      if (!sets) return false;
      const n = sets.filter((s) => s.kind === 'triplet' && s.t >= T.EAST && s.t <= T.NORTH).length;
      return n === 3;
    },
  },
  gomonsei: {
    name: '五門斉', defaultHan: 2,
    desc: '萬子・筒子・索子・風牌・三元牌をすべて含む',
    test: (ctx, counts) => {
      let m = false, p = false, s = false, w = false, d = false;
      counts.forEach((c, i) => {
        if (!c) return;
        if (i < 9) m = true; else if (i < 18) p = true; else if (i < 27) s = true;
        else if (i <= T.NORTH) w = true; else d = true;
      });
      return m && p && s && w && d;
    },
  },
  benikujaku: {
    name: '紅孔雀', defaultYakuman: 1,
    desc: '索子の1・5・7・9と中のみ',
    test: (ctx, counts) => {
      const allowed = [18, 22, 24, 26, T.CHUN];
      return counts.every((c, i) => c === 0 || allowed.includes(i));
    },
  },
  hyakumangoku: {
    name: '百万石', defaultYakuman: 1,
    desc: '萬子のみで数字の合計が100以上',
    test: (ctx, counts) => {
      let sum = 0;
      for (let i = 0; i < NUM_TYPES; i++) {
        if (!counts[i]) continue;
        if (i >= 9) return false;
        sum += (i + 1) * counts[i];
      }
      return sum >= 100;
    },
  },
  renho: {
    name: '人和', defaultHan: 5,
    desc: '子が第一ツモ前にロン和了',
    test: (ctx) => !!ctx.flags.renho,
  },
  shiisanputo: {
    name: '十三不塔', defaultYakuman: 1,
    desc: '配牌時にどの2牌も面子・対子・塔子を作らない',
    test: (ctx, counts, sets, decomp, menzen) => {
      if (!menzen || !(ctx.flags.tenhou || ctx.flags.chiihou)) return false;
      for (let i = 0; i < NUM_TYPES; i++) {
        if (counts[i] >= 2) return false;
        if (i < 27 && counts[i] === 1) {
          const n = i % 9;
          if (n <= 7 && counts[i + 1]) return false;
          if (n <= 6 && counts[i + 2]) return false;
        }
      }
      return true;
    },
  },
  paarenchan: {
    name: '八連荘', defaultYakuman: 1,
    desc: '同一プレイヤーが8回連続で和了',
    test: (ctx) => (ctx.consecutiveWins || 0) >= 8,
  },
  daisuurin: {
    name: '大数隣', defaultYakuman: 1,
    desc: '大車輪の萬子版のみを個別に採用する場合',
    test: (ctx, counts, sets, decomp, menzen) => {
      if (decomp !== null || !menzen) return false;
      return counts.every((c, i) => c === 0 || (i >= 1 && i <= 7 && c === 2));
    },
  },
};

/** rules.localYaku で有効化されたローカル役を判定する */
export function checkLocalYaku(ctx, counts, sets, decomp) {
  const list = ctx.rules.localYaku || [];
  if (!list.length) return [];
  const menzen = isMenzen(ctx);
  const out = [];
  for (const conf of list) {
    if (conf.enabled === false) continue;
    const def = LOCAL_YAKU_DEFS[conf.id];
    if (!def) continue;
    let ok = false;
    try { ok = def.test(ctx, counts, sets, decomp, menzen); } catch { ok = false; }
    if (!ok) continue;
    if (conf.menzenOnly && !menzen) continue;
    const name = conf.name || def.name;
    const yakuman = conf.yakuman ?? (conf.han ? 0 : def.defaultYakuman ?? 0);
    if (yakuman) out.push({ name, yakuman });
    else {
      // 待ちの広さのように、状況で翻が変わる役に対応する
      const dyn = def.dynamicHan ? def.dynamicHan(ctx, counts, sets, decomp) : null;
      out.push({ name, han: conf.han ?? dyn ?? def.defaultHan ?? 1 });
    }
  }
  return out;
}
