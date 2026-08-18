/**
 * hand.js - 向聴数計算 / 和了判定 / 待ち計算 / 面子分解
 * 依存なし。ブラウザ・Node 双方から利用。
 */
import { NUM_TYPES, emptyCounts, isYaochu } from './tiles.js';

const KOKUSHI_TYPES = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

// ---------------------------------------------------------------------------
// 向聴数
// ---------------------------------------------------------------------------

const shantenCache = new Map();
const CACHE_LIMIT = 300000;

// --- スーツ単位のプロファイル（面子数・部分形数・対子有無）をメモ化して合成する ---
const suitProfileCache = new Map();

/**
 * 1グループ（萬子/筒子/索子/字牌）から取り出せる (面子数, 部分形数, 対子数) の
 * パレート最適な組み合わせ一覧を返す。
 */
function groupProfiles(counts, offset, len, honorGroup) {
  let key = honorGroup ? 'z' : String(offset);
  for (let i = 0; i < len; i++) key += counts[offset + i];
  const hit = suitProfileCache.get(key);
  if (hit) return hit;

  const c = new Array(len);
  for (let i = 0; i < len; i++) c[i] = counts[offset + i];
  const raw = [];
  const rec = (i, sets, partials, pairs) => {
    if (sets + partials > 5) return;
    while (i < len && c[i] === 0) i++;
    if (i >= len) { raw.push([sets, partials, pairs]); return; }
    if (c[i] >= 3) { c[i] -= 3; rec(i, sets + 1, partials, pairs); c[i] += 3; }
    if (!honorGroup && i + 2 < len && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      rec(i, sets + 1, partials, pairs);
      c[i]++; c[i + 1]++; c[i + 2]++;
    }
    if (c[i] >= 2) { c[i] -= 2; rec(i, sets, partials + 1, pairs + 1); c[i] += 2; }
    if (!honorGroup && i + 1 < len && c[i + 1] > 0) {
      c[i]--; c[i + 1]--; rec(i, sets, partials + 1, pairs); c[i]++; c[i + 1]++;
    }
    if (!honorGroup && i + 2 < len && c[i + 2] > 0) {
      c[i]--; c[i + 2]--; rec(i, sets, partials + 1, pairs); c[i]++; c[i + 2]++;
    }
    const keep = c[i];
    c[i] = 0;
    rec(i + 1, sets, partials, pairs);
    c[i] = keep;
  };
  rec(0, 0, 0, 0);

  // パレート削減（面子数・部分形数・対子数がすべて劣るものを捨てる）
  const out = [];
  for (const a of raw) {
    if (raw.some((b) => b !== a && b[0] >= a[0] && b[1] >= a[1] && b[2] >= a[2]
      && (b[0] > a[0] || b[1] > a[1] || b[2] > a[2]))) continue;
    if (!out.some((b) => b[0] === a[0] && b[1] === a[1] && b[2] === a[2])) out.push(a);
  }
  if (suitProfileCache.size > 200000) suitProfileCache.clear();
  suitProfileCache.set(key, out);
  return out;
}

/**
 * 一般形の向聴数。和了は -1。
 * @param {number[]} counts 34要素
 * @param {number} meldCount 副露数（暗槓含む）
 */
export function shantenStandard(counts, meldCount = 0) {
  const groups = [
    groupProfiles(counts, 0, 9, false),
    groupProfiles(counts, 9, 9, false),
    groupProfiles(counts, 18, 9, false),
    groupProfiles(counts, 27, 7, true),
  ];
  // DP: 状態 = 面子数(0..4) × 部分形数(0..5) × 対子有無
  let states = new Map([[0, true]]); // key = sets*100 + partials*2 + pairFlag
  const enc = (s, p, f) => s * 100 + p * 2 + (f ? 1 : 0);
  for (const profiles of groups) {
    const next = new Map();
    for (const key of states.keys()) {
      const s0 = Math.floor(key / 100);
      const p0 = Math.floor((key % 100) / 2);
      const f0 = key % 2 === 1;
      for (const [gs, gp, gpair] of profiles) {
        const s = Math.min(4, s0 + gs);
        const p = Math.min(5, p0 + gp);
        next.set(enc(s, p, f0 || gpair > 0), true);
      }
    }
    states = next;
  }
  let best = 8;
  for (const key of states.keys()) {
    const sets = Math.min(4 - meldCount, Math.floor(key / 100)) + meldCount;
    const rawPartials = Math.floor((key % 100) / 2);
    const hasPair = key % 2 === 1;
    const partials = Math.min(rawPartials, 5 - sets);
    let s = 8 - 2 * sets - partials;
    if (sets + partials === 5 && !hasPair) s += 1;
    if (s < best) best = s;
  }
  return best;
}

export function shantenChiitoi(counts, meldCount = 0) {
  if (meldCount > 0) return 99;
  let pairs = 0, kinds = 0;
  for (let i = 0; i < NUM_TYPES; i++) {
    if (counts[i] >= 2) pairs++;
    if (counts[i] >= 1) kinds++;
  }
  let s = 6 - pairs;
  if (kinds < 7) s += 7 - kinds;
  return s;
}

export function shantenKokushi(counts, meldCount = 0) {
  if (meldCount > 0) return 99;
  let kinds = 0, hasPair = false;
  for (const t of KOKUSHI_TYPES) {
    if (counts[t] >= 1) kinds++;
    if (counts[t] >= 2) hasPair = true;
  }
  return 13 - kinds - (hasPair ? 1 : 0);
}

const fromCharCode = String.fromCharCode;
function cacheKey(counts, meldCount) {
  // 34要素（各0〜4）+ 副露数 を35文字の文字列に圧縮（join より高速）
  return fromCharCode(
    counts[0], counts[1], counts[2], counts[3], counts[4], counts[5], counts[6], counts[7], counts[8],
    counts[9], counts[10], counts[11], counts[12], counts[13], counts[14], counts[15], counts[16], counts[17],
    counts[18], counts[19], counts[20], counts[21], counts[22], counts[23], counts[24], counts[25], counts[26],
    counts[27], counts[28], counts[29], counts[30], counts[31], counts[32], counts[33], meldCount,
  );
}

/** 総合向聴数（-1 = 和了形） */
export function shanten(counts, meldCount = 0) {
  const key = cacheKey(counts, meldCount);
  const hit = shantenCache.get(key);
  if (hit !== undefined) return hit;
  let v = shantenStandard(counts, meldCount);
  const a = shantenChiitoi(counts, meldCount);
  if (a < v) v = a;
  const b = shantenKokushi(counts, meldCount);
  if (b < v) v = b;
  if (shantenCache.size > CACHE_LIMIT) shantenCache.clear();
  shantenCache.set(key, v);
  return v;
}

/** 和了形か（14枚 or 副露込みで枚数が揃っている状態） */
export function isAgariCounts(counts, meldCount = 0) {
  return shanten(counts, meldCount) === -1;
}

const waitsCache = new Map();

/** 待ち牌（13枚形に何を足せば和了か）。counts は 13枚相当。 */
export function waits(counts, meldCount = 0) {
  const key = cacheKey(counts, meldCount);
  const hit = waitsCache.get(key);
  if (hit !== undefined) return hit;
  const v = waitsUncached(counts, meldCount);
  if (waitsCache.size > CACHE_LIMIT) waitsCache.clear();
  waitsCache.set(key, v);
  return v;
}

function waitsUncached(counts, meldCount) {
  const out = [];
  const c = counts.slice();
  for (let t = 0; t < NUM_TYPES; t++) {
    if (c[t] >= 4) continue;
    c[t]++;
    if (shanten(c, meldCount) === -1) out.push(t);
    c[t]--;
  }
  return out;
}

/**
 * 有効牌（向聴数が進む牌）とその枚数。
 * CPU の打牌選択専用のため、手牌から完全に孤立した牌（幺九牌以外）は
 * 候補から外して高速化している（実戦上の受け入れ評価としては十分な近似）。
 */
export function ukeire(counts, meldCount = 0, visibleCounts = null) {
  const base = shanten(counts, meldCount);
  const c = counts.slice();
  const tiles = [];
  let total = 0;
  const relevant = (t) => {
    if (counts[t] > 0 || isYaochu(t)) return true;
    if (t >= 27) return true;
    const n = t % 9;
    for (let d = 1; d <= 2; d++) {
      if (n - d >= 0 && counts[t - d] > 0) return true;
      if (n + d <= 8 && counts[t + d] > 0) return true;
    }
    return false;
  };
  for (let t = 0; t < NUM_TYPES; t++) {
    if (c[t] >= 4) continue;
    if (!relevant(t)) continue;
    c[t]++;
    const s = shanten(c, meldCount);
    c[t]--;
    if (s < base) {
      const seen = visibleCounts ? visibleCounts[t] : counts[t];
      const left = Math.max(0, 4 - seen);
      tiles.push(t);
      total += left;
    }
  }
  return { shanten: base, tiles, count: total };
}

// ---------------------------------------------------------------------------
// 面子分解（点数計算・役判定用）
// ---------------------------------------------------------------------------

/**
 * 門前部分の面子分解を全列挙。
 * @returns {Array<{sets:Array<{kind:'run'|'triplet',t:number}>, pair:number}>}
 */
export function decomposeStandard(counts, needSets) {
  const results = [];
  const c = counts.slice();
  const sets = [];

  const rec = (i, pair) => {
    while (i < NUM_TYPES && c[i] === 0) i++;
    if (i >= NUM_TYPES) {
      if (sets.length === needSets && pair >= 0) {
        results.push({ sets: sets.map((s) => ({ ...s })), pair });
      }
      return;
    }
    if (sets.length < needSets) {
      if (c[i] >= 3) {
        c[i] -= 3; sets.push({ kind: 'triplet', t: i });
        rec(i, pair);
        sets.pop(); c[i] += 3;
      }
      if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
        c[i]--; c[i + 1]--; c[i + 2]--; sets.push({ kind: 'run', t: i });
        rec(i, pair);
        sets.pop(); c[i]++; c[i + 1]++; c[i + 2]++;
      }
    }
    if (pair < 0 && c[i] === 2) {
      c[i] -= 2;
      rec(i, i);
      c[i] += 2;
      return;
    }
    if (pair < 0 && c[i] >= 2) {
      c[i] -= 2;
      rec(i, i);
      c[i] += 2;
    }
  };

  rec(0, -1);
  // 重複除去
  const seen = new Set();
  return results.filter((r) => {
    const k = r.pair + '|' + r.sets.map((s) => s.kind + s.t).sort().join(',');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function isChiitoi(counts) {
  let pairs = 0, total = 0;
  for (let i = 0; i < NUM_TYPES; i++) {
    total += counts[i];
    if (counts[i] === 2) pairs++;
    else if (counts[i] !== 0) return false;
  }
  return pairs === 7 && total === 14;
}

export function isKokushi(counts) {
  let total = 0, kinds = 0, pair = -1;
  for (let i = 0; i < NUM_TYPES; i++) {
    if (counts[i] === 0) continue;
    if (!isYaochu(i)) return false;
    total += counts[i];
    kinds++;
    if (counts[i] === 2) pair = i;
    else if (counts[i] !== 1) return false;
  }
  return total === 14 && kinds === 13 && pair >= 0;
}

export function countsFromTiles(tiles) {
  const c = emptyCounts();
  for (const t of tiles) if (t.t < NUM_TYPES) c[t.t]++;
  return c;
}
