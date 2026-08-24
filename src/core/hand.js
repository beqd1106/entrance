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

/**
 * 手牌計算のオプション。
 *
 * 既定の麻雀は「同じ牌は4枚まで」「七対子に同じ牌の2組は使えない」だが、
 * 清一色ゲームのように2セットの牌を混ぜるルールでは、どちらも変わる。
 * ルールごとに1度だけ作って、計算の入口すべてに渡す。
 *
 * @param {number[]|null} limits 牌種ごとの最大枚数（null で一律4枚）
 * @param {boolean} chiitoiMultiPair 七対子の8枚使いを認めるか
 */
export function makeHandOpts(limits = null, chiitoiMultiPair = false, chiiseimukou = false) {
  const plain = !limits || limits.every((v) => v === 4);
  return {
    limits: plain ? null : limits,
    chiitoiMultiPair: !!chiitoiMultiPair,
    // 七星無靠は面子でも対子でもない特殊形なので、採用している店でだけ和了形に数える
    chiiseimukou: !!chiiseimukou,
    // キャッシュを混ぜないための識別子。既定のルールでは空文字＝従来と同じキー。
    sig: (plain ? '' : 'L' + limits.join('.'))
      + (chiitoiMultiPair ? 'M' : '') + (chiiseimukou ? 'Q' : ''),
  };
}

const PLAIN_OPTS = makeHandOpts();

/**
 * 牌種 t を最大何枚まで使えるか。
 * ふつうは4枚だが、2セット混ぜの清一色ゲームなどは8枚ある。
 * 「4枚」を決め打ちすると、残り枚数や純カラの判定がずれる。
 */
export function limitOf(opts, t) {
  const l = opts && opts.limits;
  return l ? l[t] : 4;
}

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

export function shantenChiitoi(counts, meldCount = 0, opts = PLAIN_OPTS) {
  if (meldCount > 0) return 99;
  const multi = opts && opts.chiitoiMultiPair;
  let pairs = 0, kinds = 0;
  for (let i = 0; i < NUM_TYPES; i++) {
    // 8枚使いを認める場合、同じ牌4枚は2つの対子として数える
    if (multi) pairs += Math.floor(counts[i] / 2);
    else if (counts[i] >= 2) pairs++;
    if (counts[i] >= 1) kinds++;
  }
  if (pairs > 7) pairs = 7;
  let s = 6 - pairs;
  // 8枚使いなら同じ牌を重ねられるので、7種類そろえる必要はない
  if (!multi && kinds < 7) s += 7 - kinds;
  return s;
}

// 七星無靠で使える筋（1-4-7 / 2-5-8 / 3-6-9）と、3色への割り当て6通り
const SUJI = [[0, 3, 6], [1, 4, 7], [2, 5, 8]];
const SUJI_PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

/**
 * 七星無靠の向聴数。
 * 字牌7種すべてと、色ごとに別々の筋から取った数牌7枚（合計14枚）で完成する。
 * どの色にどの筋を割り当てるかで枚数が変わるので、6通りすべて試して最良を返す。
 */
export function shantenChiiseimukou(counts, meldCount = 0) {
  if (meldCount > 0) return 99;
  let honors = 0;
  for (let t = 27; t < NUM_TYPES; t++) if (counts[t] >= 1) honors++;
  let best = 99;
  for (const perm of SUJI_PERMS) {
    let nums = 0;
    for (let suit = 0; suit < 3; suit++) {
      for (const i of SUJI[perm[suit]]) if (counts[suit * 9 + i] >= 1) nums++;
    }
    const usable = Math.min(honors, 7) + Math.min(nums, 7);
    const s = 13 - usable;
    if (s < best) best = s;
  }
  return best;
}

/** 七星無靠の和了形か（14枚すべてが1枚ずつで、字牌7種＋色ごとに別の筋の数牌7枚） */
export function isChiiseimukou(counts) {
  let total = 0;
  for (let t = 0; t < NUM_TYPES; t++) {
    if (counts[t] > 1) return false;   // 同じ牌が2枚あれば孤立形にならない
    total += counts[t];
  }
  if (total !== 14) return false;
  for (let t = 27; t < NUM_TYPES; t++) if (counts[t] !== 1) return false;
  const used = new Set();
  for (let suit = 0; suit < 3; suit++) {
    const idx = [];
    for (let i = 0; i < 9; i++) if (counts[suit * 9 + i]) idx.push(i);
    if (!idx.length) continue;
    const g = SUJI.findIndex((row) => idx.every((i) => row.includes(i)));
    if (g < 0 || used.has(g)) return false;
    used.add(g);
  }
  return true;
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
function cacheKey(counts, meldCount, opts) {
  // 34要素（各0〜4）+ 副露数 を35文字の文字列に圧縮（join より高速）
  return fromCharCode(
    counts[0], counts[1], counts[2], counts[3], counts[4], counts[5], counts[6], counts[7], counts[8],
    counts[9], counts[10], counts[11], counts[12], counts[13], counts[14], counts[15], counts[16], counts[17],
    counts[18], counts[19], counts[20], counts[21], counts[22], counts[23], counts[24], counts[25], counts[26],
    counts[27], counts[28], counts[29], counts[30], counts[31], counts[32], counts[33], meldCount,
  ) + (opts && opts.sig ? opts.sig : '');
}

/** 総合向聴数（-1 = 和了形） */
export function shanten(counts, meldCount = 0, opts = PLAIN_OPTS) {
  const key = cacheKey(counts, meldCount, opts);
  const hit = shantenCache.get(key);
  if (hit !== undefined) return hit;
  let v = shantenStandard(counts, meldCount);
  const a = shantenChiitoi(counts, meldCount, opts);
  if (a < v) v = a;
  const b = shantenKokushi(counts, meldCount);
  if (b < v) v = b;
  if (opts && opts.chiiseimukou) {
    const c = shantenChiiseimukou(counts, meldCount);
    if (c < v) v = c;
  }
  if (shantenCache.size > CACHE_LIMIT) shantenCache.clear();
  shantenCache.set(key, v);
  return v;
}

/**
 * オールマイティ牌を wild 枚持っている前提の向聴数。
 *
 * 少牌マイティのように「好きな牌を常に1枚持っている」形を扱うためのもの。
 * 34種すべてを当てはめて、いちばん良い数字を返す。
 * counts は実際に持っている牌だけを数えたもの（ワイルドは含めない）。
 */
export function shantenWithWild(counts, meldCount = 0, wild = 0, opts = PLAIN_OPTS) {
  if (wild <= 0) return shanten(counts, meldCount, opts);
  let best = 99;
  const c = counts.slice();
  for (let t = 0; t < NUM_TYPES; t++) {
    if (c[t] >= limitOf(opts, t)) continue;
    c[t]++;
    const v = shantenWithWild(c, meldCount, wild - 1, opts);
    c[t]--;
    if (v < best) best = v;
    if (best === -1) break;
  }
  return best === 99 ? shanten(counts, meldCount, opts) : best;
}

/**
 * ワイルドを wild 枚持っている前提の待ち牌。
 * 「これを引けば（またはロンできれば）和了」になる牌を返す。
 */
export function waitsWithWild(counts, meldCount = 0, wild = 0, opts = PLAIN_OPTS) {
  if (wild <= 0) return waits(counts, meldCount, opts);
  const out = [];
  const c = counts.slice();
  for (let t = 0; t < NUM_TYPES; t++) {
    if (c[t] >= limitOf(opts, t)) continue;
    c[t]++;
    if (shantenWithWild(c, meldCount, wild, opts) === -1) out.push(t);
    c[t]--;
  }
  return out;
}

/** 和了形か（14枚 or 副露込みで枚数が揃っている状態） */
export function isAgariCounts(counts, meldCount = 0, opts = PLAIN_OPTS) {
  return shanten(counts, meldCount, opts) === -1;
}

const waitsCache = new Map();

/** 待ち牌（13枚形に何を足せば和了か）。counts は 13枚相当。 */
export function waits(counts, meldCount = 0, opts = PLAIN_OPTS) {
  const key = cacheKey(counts, meldCount, opts);
  const hit = waitsCache.get(key);
  if (hit !== undefined) return hit;
  const v = waitsUncached(counts, meldCount, opts);
  if (waitsCache.size > CACHE_LIMIT) waitsCache.clear();
  waitsCache.set(key, v);
  return v;
}

function waitsUncached(counts, meldCount, opts = PLAIN_OPTS) {
  const out = [];
  const c = counts.slice();
  for (let t = 0; t < NUM_TYPES; t++) {
    if (c[t] >= limitOf(opts, t)) continue;
    c[t]++;
    if (shanten(c, meldCount, opts) === -1) out.push(t);
    c[t]--;
  }
  return out;
}

/**
 * 有効牌（向聴数が進む牌）とその枚数。
 * CPU の打牌選択専用のため、手牌から完全に孤立した牌（幺九牌以外）は
 * 候補から外して高速化している（実戦上の受け入れ評価としては十分な近似）。
 */
export function ukeire(counts, meldCount = 0, visibleCounts = null, wild = 0, opts = PLAIN_OPTS) {
  const base = shantenWithWild(counts, meldCount, wild, opts);
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
    if (c[t] >= limitOf(opts, t)) continue;
    if (!relevant(t)) continue;
    c[t]++;
    const s = shantenWithWild(c, meldCount, wild, opts);
    c[t]--;
    if (s < base) {
      const seen = visibleCounts ? visibleCounts[t] : counts[t];
      const left = Math.max(0, limitOf(opts, t) - seen);
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

export function isChiitoi(counts, opts = PLAIN_OPTS) {
  const multi = opts && opts.chiitoiMultiPair;
  let pairs = 0, total = 0;
  for (let i = 0; i < NUM_TYPES; i++) {
    const c = counts[i];
    total += c;
    if (c === 0) continue;
    if (c === 2) pairs++;
    // 8枚使い：同じ牌が偶数枚あれば、その半分の数だけ対子として数える
    else if (multi && c % 2 === 0) pairs += c / 2;
    else return false;
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
