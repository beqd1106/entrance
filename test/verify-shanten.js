/**
 * verify-shanten.js - 高速化した向聴数計算を素朴な参照実装と突き合わせる
 * 使い方: node test/verify-shanten.js [試行回数]
 */
import { shantenStandard } from '../src/core/hand.js';

/** 参照実装（速度は無視した素直な全探索） */
function refShanten(counts, meldCount = 0) {
  const c = counts.slice();
  let best = 8;
  const rec = (i, sets, partials, pairs) => {
    if (sets + partials > 5) return;
    while (i < 34 && c[i] === 0) i++;
    if (i >= 34) {
      const s0 = Math.min(4 - meldCount, sets) + meldCount;
      const p = Math.min(partials, 5 - s0);
      let s = 8 - 2 * s0 - p;
      if (s0 + p === 5 && pairs === 0) s += 1;
      if (s < best) best = s;
      return;
    }
    if (c[i] >= 3) { c[i] -= 3; rec(i, sets + 1, partials, pairs); c[i] += 3; }
    if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--; rec(i, sets + 1, partials, pairs); c[i]++; c[i + 1]++; c[i + 2]++;
    }
    if (c[i] >= 2) { c[i] -= 2; rec(i, sets, partials + 1, pairs + 1); c[i] += 2; }
    if (i < 27 && i % 9 <= 7 && c[i + 1] > 0) { c[i]--; c[i + 1]--; rec(i, sets, partials + 1, pairs); c[i]++; c[i + 1]++; }
    if (i < 27 && i % 9 <= 6 && c[i + 2] > 0) { c[i]--; c[i + 2]--; rec(i, sets, partials + 1, pairs); c[i]++; c[i + 2]++; }
    const keep = c[i]; c[i] = 0; rec(i + 1, sets, partials, pairs); c[i] = keep;
  };
  rec(0, 0, 0, 0);
  return best;
}

const trials = Number(process.argv[2] || 5000);
let ng = 0;
let rng = 20260817;
const rand = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };

for (let k = 0; k < trials; k++) {
  const meld = Math.floor(rand() * 5);
  const need = 13 - meld * 3;
  const counts = new Array(34).fill(0);
  let placed = 0;
  let guard = 0;
  while (placed < need && guard++ < 500) {
    const t = Math.floor(rand() * 34);
    if (counts[t] >= 4) continue;
    counts[t]++; placed++;
  }
  const a = shantenStandard(counts, meld);
  const b = refShanten(counts, meld);
  if (a !== b) {
    ng++;
    if (ng <= 5) console.log(`NG meld=${meld} fast=${a} ref=${b} counts=[${counts.join(',')}]`);
  }
}
console.log(ng === 0
  ? `[OK] 向聴数計算 ${trials}件すべて参照実装と一致`
  : `[NG] ${ng}/${trials} 件不一致`);
process.exit(ng === 0 ? 0 : 1);
