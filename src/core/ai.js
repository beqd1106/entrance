/**
 * ai.js - CPU 打ち手
 *
 * 方針：単純なランダム打牌にはしない。
 *   1. 向聴数（shanten）を最小化
 *   2. 同値なら受け入れ枚数（ukeire）が広い方
 *   3. 他家リーチ時は簡易ベタオリ（現物 > 字牌 > 端牌）
 *   4. 鳴きは向聴が進み、かつ役の目処がある時のみ
 *   5. level で 初心者 / 標準 / 上級 を切り替え（拡張余地を確保）
 */
import { shanten, waits, ukeire, countsFromTiles, shantenWithWild } from './hand.js';
import { isHonor, isTerminal, isYaochu, numOf, suitOf, doraNext, T } from './tiles.js';

const LEVELS = {
  beginner: { riichiAlways: true, foldThreshold: 99, callLoose: true, ukeireWeight: 0.5 },
  normal: { riichiAlways: false, foldThreshold: 2, callLoose: false, ukeireWeight: 1 },
  expert: { riichiAlways: false, foldThreshold: 1, callLoose: false, ukeireWeight: 1.4 },
};

export function decide(engine, seat, choices) {
  const p = engine.players[seat];
  const cfg = LEVELS[p.level] || LEVELS.normal;

  // --- 応答フェーズ
  const ron = choices.find((c) => c.type === 'ron');
  if (ron) return { type: 'ron' };
  const claim = choices.find((c) => ['pon', 'chi', 'kan', 'pass'].includes(c.type));
  if (claim && engine.pending && engine.pending.kind === 'claim') {
    return decideCall(engine, seat, choices, cfg);
  }

  // --- 手番フェーズ
  if (choices.some((c) => c.type === 'tsumo')) return { type: 'tsumo' };
  const kyuushu = choices.find((c) => c.type === 'kyuushu');
  if (kyuushu && shantenWithWild(countsFromTiles(p.hand), 0, engine.wild) >= 4) return { type: 'kyuushu' };

  // 北抜き（三麻）：役満狙いでなければ即抜き
  const kita = choices.find((c) => c.type === 'kita');
  if (kita) {
    const c = countsFromTiles(p.hand);
    const kokushiish = c.filter((v, i) => v > 0 && isYaochu(i)).length >= 10;
    if (!kokushiish) return { type: 'kita' };
  }

  const danger = dangerLevel(engine, seat);

  // 暗槓：手が進むなら
  const kan = choices.find((c) => c.type === 'kan');
  if (kan && danger === 0) {
    const before = shantenWithWild(countsFromTiles(p.hand), p.melds.length, engine.wild);
    const rest = p.hand.filter((t) => t.t !== kan.t);
    const after = shantenWithWild(countsFromTiles(rest), p.melds.length + 1, engine.wild);
    if (after <= before) return { type: 'kan', kind: kan.kind, t: kan.t };
  }

  // リーチ判断
  const riichi = choices.filter((c) => c.type === 'riichi' && !c.open);
  if (riichi.length) {
    const best = bestRiichiTile(engine, p, riichi[0].tileIds);
    if (best && shouldRiichi(engine, p, best, cfg, danger)) {
      return { type: 'riichi', tileId: best.tileId };
    }
  }

  const discard = choices.find((c) => c.type === 'discard');
  if (!discard) return choices[0] && choices[0].type === 'pass' ? { type: 'pass' } : (choices[0] || { type: 'pass' });

  const ids = discard.tileIds;
  const sh = shantenWithWild(countsFromTiles(p.hand), p.melds.length, engine.wild);

  // ベタオリ判定
  if (danger > 0 && sh >= cfg.foldThreshold && !p.riichi) {
    const safe = pickSafest(engine, seat, ids);
    if (safe != null) return { type: 'discard', tileId: safe };
  }

  return { type: 'discard', tileId: pickEfficient(engine, p, ids, cfg, danger) };
}

function handTilesById(p, id) { return p.hand.find((t) => t.id === id); }

function pickEfficient(engine, p, ids, cfg, danger) {
  const doraTypes = engine.doraTypes();
  const vis = visibleCounts(engine, p);
  // 1st pass: 向聴数だけを見て候補を絞る（受け入れ計算は重いので最小向聴のみ）
  const first = [];
  let minSh = 99;
  for (const id of ids) {
    const tile = handTilesById(p, id);
    if (!tile) continue;
    const counts = countsFromTiles(p.hand.filter((t) => t.id !== id));
    const sh = shantenWithWild(counts, p.melds.length, engine.wild);
    first.push({ id, tile, counts, sh });
    if (sh < minSh) minSh = sh;
  }
  const narrowed = first.filter((f) => f.sh <= minSh);
  let best = null;
  for (const f of narrowed) {
    const { id, tile, counts, sh } = f;
    const uk = ukeire(counts, p.melds.length, vis, engine.wild);
    // 牌の価値（ドラ・赤は残す）
    let value = 0;
    if (doraTypes.includes(tile.t)) value += 2.5;
    if (tile.red || tile.gold || tile.dot || tile.sp) value += 3;
    if (isHonor(tile.t)) value += 0.3;
    const safety = danger > 0 ? safetyScore(engine, p.seat, tile) * 0.6 : 0;
    const score = -sh * 100 + uk.count * cfg.ukeireWeight - value + safety;
    if (!best || score > best.score) best = { id, score, sh, uk };
  }
  return best ? best.id : ids[0];
}

/** 受け入れ計算の可視枚数（他家の見えている牌を反映） */

function visibleCounts(engine, p) {
  const c = new Array(34).fill(0);
  for (const t of p.hand) if (t.t < 34) c[t.t]++;
  for (const q of engine.players) {
    for (const d of q.discards) if (d.t < 34) c[d.t]++;
    for (const m of q.melds) for (const t of m.tiles) if (t.t < 34) c[t.t]++;
  }
  for (const ind of engine.wall.doraIndicators) if (ind.t < 34) c[ind.t]++;
  return c;
}

function bestRiichiTile(engine, p, tileIds) {
  let best = null;
  const doraTypes = engine.doraTypes();
  for (const id of tileIds) {
    const rest = p.hand.filter((t) => t.id !== id);
    const counts = countsFromTiles(rest);
    const w = waits(counts, p.melds.length);
    let left = 0;
    const vis = visibleCounts(engine, p);
    for (const t of w) left += Math.max(0, 4 - vis[t]);
    const doraKeep = rest.filter((t) => doraTypes.includes(t.t) || t.red || t.gold).length;
    const score = left * 2 + doraKeep * 1.5;
    if (!best || score > best.score) best = { tileId: id, score, waitCount: left, waits: w };
  }
  return best;
}

function shouldRiichi(engine, p, best, cfg, danger) {
  if (cfg.riichiAlways) return true;
  if (best.waitCount === 0) return false;
  if (danger > 0 && best.waitCount <= 2) return false;
  const doraTypes = engine.doraTypes();
  const value = p.hand.filter((t) => doraTypes.includes(t.t) || t.red || t.gold).length;
  if (best.waitCount >= 4) return true;
  return value >= 1;
}

/** 他家のリーチ・明らかな仕掛けを危険度として返す */
function dangerLevel(engine, seat) {
  let d = 0;
  for (const q of engine.players) {
    if (q.seat === seat) continue;
    if (q.riichi) d += 2;
    else if (q.melds.filter((m) => !m.concealed).length >= 3) d += 1;
  }
  return d;
}

function safetyScore(engine, seat, tile) {
  let worst = 100;
  for (const q of engine.players) {
    if (q.seat === seat || !(q.riichi || q.melds.filter((m) => !m.concealed).length >= 3)) continue;
    let s;
    if (q.discards.some((d) => d.t === tile.t)) s = 100;                       // 現物
    else if (isHonor(tile.t)) s = 55 + engine.visibleCount([tile.t]) * 8;      // 字牌
    else if (isTerminal(tile.t)) s = 45;
    else if (hasSuji(q, tile)) s = 40;
    else s = 20 - Math.abs(5 - numOf(tile.t)) * -1;
    worst = Math.min(worst, s);
  }
  return worst === 100 ? 60 : worst;
}

function hasSuji(q, tile) {
  const n = numOf(tile.t);
  const s = suitOf(tile.t);
  if (s === 3) return false;
  const base = s * 9;
  const check = [];
  if (n - 3 >= 1) check.push(base + n - 3 - 1);
  if (n + 3 <= 9) check.push(base + n + 3 - 1);
  return check.some((t) => q.discards.some((d) => d.t === t));
}

function pickSafest(engine, seat, ids) {
  const p = engine.players[seat];
  let best = null;
  for (const id of ids) {
    const tile = handTilesById(p, id);
    if (!tile) continue;
    const s = safetyScore(engine, seat, tile);
    if (!best || s > best.s) best = { id, s };
  }
  return best ? best.id : null;
}

function decideCall(engine, seat, choices, cfg) {
  const p = engine.players[seat];
  const R = engine.rules;
  const tile = engine.pending.tile;
  const before = shantenWithWild(countsFromTiles(p.hand), p.melds.length, engine.wild);
  const danger = dangerLevel(engine, seat);
  const doraTypes = engine.doraTypes();

  const yakuhaiish = (t) => {
    if (t === T.HAKU || t === T.HATSU || t === T.CHUN) return true;
    if (t === 27 + engine.round.wind) return true;
    if (t === 27 + ((seat - engine.round.dealer + engine.n) % engine.n)) return true;
    return false;
  };

  const evalAfter = (removeIds, addTiles, meldDelta) => {
    const rest = p.hand.filter((t) => !removeIds.includes(t.id));
    return shantenWithWild(countsFromTiles(rest), p.melds.length + meldDelta, engine.wild);
  };

  // カン（大明槓）：テンパイ維持かつ役有り見込み
  const kan = choices.find((c) => c.type === 'kan');
  if (kan && danger === 0) {
    const after = evalAfter(p.hand.filter((t) => t.t === tile.t).slice(0, 3).map((t) => t.id), [], 1);
    if (after <= 0 && (yakuhaiish(tile.t) || doraTypes.includes(tile.t))) return { type: 'kan', kind: 'daiminkan', t: tile.t };
  }

  // ポン
  const pon = choices.find((c) => c.type === 'pon');
  if (pon) {
    const after = evalAfter(pon.tileIds, [tile], 1);
    const goodYaku = yakuhaiish(tile.t);
    const tanyaoOk = R.win.kuitan && p.hand.every((t) => !isYaochu(t.t));
    if (after < before && (goodYaku || (tanyaoOk && before <= 2) || (cfg.callLoose && before <= 2))) {
      if (!(danger > 0 && before >= 2)) return { type: 'pon', tileIds: pon.tileIds };
    }
  }

  // チー
  const chis = choices.filter((c) => c.type === 'chi');
  if (chis.length) {
    let bestChi = null;
    for (const c of chis) {
      const after = evalAfter(c.tileIds, [tile], 1);
      if (!bestChi || after < bestChi.after) bestChi = { c, after };
    }
    const tanyaoOk = R.win.kuitan && p.hand.every((t) => !isYaochu(t.t));
    if (bestChi && bestChi.after < before && bestChi.after <= 1 && tanyaoOk && danger === 0) {
      return { type: 'chi', tileIds: bestChi.c.tileIds };
    }
  }
  return { type: 'pass' };
}

export { LEVELS };
