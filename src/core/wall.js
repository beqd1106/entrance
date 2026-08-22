/**
 * wall.js - 牌山の生成と管理（ルール設定から使用牌を組み立てる）
 */
import { NUM_TYPES, T, codeToType, typeToCode } from './tiles.js';

/** 再現可能な乱数（デバッグ・シミュレーション用） */
export function makeRng(seed = Date.now()) {
  let a = seed >>> 0;
  return function rng() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FLOWER_KEY = { spring: T.SPRING, summer: T.SUMMER, autumn: T.AUTUMN, winter: T.WINTER };
export const FLOWER_LABEL = { [T.SPRING]: '春', [T.SUMMER]: '夏', [T.AUTUMN]: '秋', [T.WINTER]: '冬' };
export const FLOWER_ID = { [T.SPRING]: 'spring', [T.SUMMER]: 'summer', [T.AUTUMN]: 'autumn', [T.WINTER]: 'winter' };

/** ルールから使用牌の一覧（属性付き）を作る */
export function buildTileSet(rules) {
  const tiles = [];
  let id = 0;
  const usedTypes = [];
  const keepManzu = new Set((rules.sanma.manzuKeep || ['1m', '9m']).map((c) => {
    try { return codeToType(c); } catch { return -1; }
  }));
  for (let t = 0; t < NUM_TYPES; t++) {
    if (rules.game.players === 3 && rules.sanma.removeManzu && t < 9 && !keepManzu.has(t)) continue;
    if (rules.game.players === 3 && rules.sanma.northMode === 'nuki' && t === T.NORTH) {
      // 北は抜きドラだが牌自体は使用する
    }
    usedTypes.push(t);
  }
  // 牌種ごとの枚数。既定は4枚だが、清一色ゲームのように
  // 「5萬だけ8枚」といった構成を取るルールがあるため設定で上書きできる。
  const counts = (rules.wall && rules.wall.tileCounts) || {};
  const backCfg = (rules.wall && rules.wall.backColors) || { enabled: false, colors: [] };
  const backOf = (i, n) => {
    if (!backCfg.enabled || !backCfg.colors.length) return null;
    const per = n / backCfg.colors.length;
    return backCfg.colors[Math.min(backCfg.colors.length - 1, Math.floor(i / per))];
  };
  for (const t of usedTypes) {
    const code = typeToCode(t);
    const n = counts[code] != null ? Math.max(0, Math.floor(counts[code])) : 4;
    for (let i = 0; i < n; i++) {
      tiles.push({
        id: id++, t, back: backOf(i, n),
        red: false, gold: false, blue: false, star: false, rainbow: false, dot: false, sp: null,
      });
    }
  }

  const markN = (typeCode, n, fn) => {
    const t = codeToType(typeCode);
    let done = 0;
    for (const tile of tiles) {
      if (done >= n) break;
      if (tile.t !== t) continue;
      if (tile.red || tile.gold || tile.blue || tile.star || tile.rainbow || tile.dot || tile.sp) continue;
      fn(tile);
      done++;
    }
    return done;
  };

  // 特殊牌（最も具体的な指定なので先に確保する）
  for (const def of rules.specialTiles || []) {
    markN(def.tile, def.count ?? 1, (tile) => {
      tile.sp = def.id;
      if (def.color === 'red') tile.red = true;
      if (def.color === 'gold') tile.gold = true;
      if (def.color === 'blue') tile.blue = true;
      if (def.color === 'star') tile.star = true;
      if (def.color === 'rainbow') tile.rainbow = true;
    });
  }
  // 赤牌
  for (const [code, n] of Object.entries(rules.dora.red || {})) {
    if (n > 0) markN(code, n, (tile) => { tile.red = true; });
  }
  // 金牌
  for (const [code, n] of Object.entries(rules.dora.gold || {})) {
    if (n > 0) markN(code, n, (tile) => { tile.gold = true; });
  }
  // 青牌・星牌・虹牌（属性ドラとして数える）
  for (const [key, flag] of [['blue', 'blue'], ['star', 'star'], ['rainbow', 'rainbow']]) {
    for (const [code, n] of Object.entries(rules.dora[key] || {})) {
      if (n > 0) markN(code, n, (tile) => { tile[flag] = true; });
    }
  }
  // 白ポッチ
  if (rules.local.shiroPocchi.enabled) {
    markN('5z', rules.local.shiroPocchi.count, (tile) => { tile.dot = true; });
  }
  // 花牌（華牌）
  if (rules.flowers.enabled) {
    for (const key of rules.flowers.tiles || []) {
      const t = FLOWER_KEY[key];
      if (t === undefined) continue;
      tiles.push({ id: id++, t, red: false, gold: false, dot: false, sp: null, flower: key });
    }
  }
  return tiles;
}

/**
 * 牌山に実際に入っている牌種ごとの枚数。
 * 向聴数・待ちの計算で「同じ牌を何枚まで使えるか」の上限として使う。
 * （既定は4枚だが、清一色ゲームの5萬のように8枚入るルールがある）
 */
export function tileLimits(tiles) {
  const limits = new Array(NUM_TYPES).fill(0);
  for (const tile of tiles) if (tile.t < NUM_TYPES) limits[tile.t]++;
  return limits;
}

export class Wall {
  /**
   * @param {Object} rules
   * @param {Function} rng
   * @param {Object} [debug] {forcedWall:[codes], stack:[Tile]}
   */
  constructor(rules, rng, debug = null) {
    this.rules = rules;
    const tiles = buildTileSet(rules);
    // シャッフル
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    this.all = tiles;
    // 王牌の枚数。ドラ表示牌の隣まで引ききる設定にも、17枚残す設定にもできる。
    // 嶺上牌の4枚とドラ表示のぶんは要るので、下限は6枚とする
    const want = (rules.wall && rules.wall.deadWallSize) || 14;
    this.deadSize = Math.max(6, Math.min(Math.floor(want), tiles.length - 20));
    this.dead = tiles.slice(tiles.length - this.deadSize);
    this.live = tiles.slice(0, tiles.length - this.deadSize);
    this.drawIndex = 0;
    this.liveEnd = this.live.length;
    this.rinshanUsed = 0;
    this.revealed = 0;
    this.doraIndicators = [];
    this.uraIndicators = [];
    this.aliceFlips = [];
    this.debug = debug;
    if (debug && debug.forcedWall && debug.forcedWall.length) this.applyForcedWall(debug.forcedWall);
    const initialIndicators = rules.dora.indicators + (rules.dora.bakuDora || 0);
    for (let i = 0; i < initialIndicators; i++) this.revealDora();
  }

  /** デバッグ：山の先頭に指定牌を並べる（配牌・次ツモの固定） */
  applyForcedWall(codes) {
    const wanted = codes.map((c) => (typeof c === 'string' ? codeToType(c) : c));
    for (let pos = 0; pos < wanted.length && pos < this.live.length; pos++) {
      const want = wanted[pos];
      let found = -1;
      for (let i = pos; i < this.live.length; i++) if (this.live[i].t === want) { found = i; break; }
      if (found < 0) continue;
      [this.live[pos], this.live[found]] = [this.live[found], this.live[pos]];
    }
  }

  get remaining() { return this.liveEnd - this.drawIndex; }

  draw() {
    if (this.remaining <= 0) return null;
    return this.live[this.drawIndex++];
  }

  /** 嶺上牌（王牌の先頭から）。海底が1枚減る。 */
  drawRinshan() {
    if (this.rinshanUsed >= 4) return null;
    const tile = this.dead[this.rinshanUsed++];
    // 海底が1枚減り、その牌は王牌へ補充される（牌の総数は保存される）
    if (this.liveEnd > this.drawIndex) {
      this.dead.push(this.live[--this.liveEnd]);
      this.deadSize++;
    }
    return tile;
  }

  /** 嶺上牌が尽きた場合は生牌山の末尾から補充する（王牌の補充を簡略化） */
  drawReplacement() {
    const t = this.drawRinshan();
    if (t) return t;
    if (this.liveEnd > this.drawIndex) return this.live[--this.liveEnd];
    return null;
  }

  revealDora() {
    const idx = 4 + this.revealed * 2;
    if (idx >= this.deadSize) return null;
    const tile = this.dead[idx];
    const ura = this.dead[idx + 1];
    this.doraIndicators.push(tile);
    this.uraIndicators.push(ura);
    this.revealed++;
    return tile;
  }

  /** アリス・チューリップ用のめくり列 */
  flipSequence(cfg) {
    const seq = [];
    if (cfg.start === 'deadWallEnd') {
      for (let i = this.deadSize - 1; i >= 4; i--) seq.push(this.dead[i]);
    } else {
      let idx = 4 + this.revealed * 2;
      for (let i = idx; i < this.deadSize; i++) seq.push(this.dead[i]);
    }
    return cfg.order === 'backward' ? seq.reverse() : seq;
  }

  /** 表示用 */
  describe() {
    return {
      total: this.all.length,
      remaining: this.remaining,
      dora: this.doraIndicators.map((t) => typeToCode(t.t)),
    };
  }
}
