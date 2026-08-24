/**
 * tiles.js - 牌の型定義と基本ユーティリティ
 *
 * 牌タイプ（type index）
 *   0- 8 : 1m-9m
 *   9-17 : 1p-9p
 *  18-26 : 1s-9s
 *  27-33 : 東 南 西 北 白 發 中
 *  34-37 : 春 夏 秋 冬（花牌 / 華牌。手牌構成には参加せず、抜いて即嶺上ツモ）
 *
 * 牌インスタンス（Tile）
 *   { id, t, red, gold, dot, sp }
 *     id   : 山の中で一意なID
 *     t    : 牌タイプ
 *     red  : 赤牌
 *     gold : 金牌
 *     dot  : 白ポッチ（白のみ）
 *     sp   : 特殊牌定義ID（rules.specialTiles[].id）| null
 */

export const T = {
  M1: 0, M5: 4, M9: 8,
  P1: 9, P5: 13, P9: 17,
  S1: 18, S5: 22, S9: 26,
  EAST: 27, SOUTH: 28, WEST: 29, NORTH: 30,
  HAKU: 31, HATSU: 32, CHUN: 33,
  SPRING: 34, SUMMER: 35, AUTUMN: 36, WINTER: 37,
};

export const NUM_TYPES = 34;          // 手牌に入りうる牌タイプ数
export const FLOWER_TYPES = [34, 35, 36, 37];

const SUIT_CHAR = ['m', 'p', 's', 'z'];
const HONOR_NAME = ['東', '南', '西', '北', '白', '發', '中'];
const FLOWER_NAME = ['春', '夏', '秋', '冬'];

/** 牌タイプ -> "5m" / "1z" 形式 */
export function typeToCode(t) {
  if (t >= 34) return `${t - 33}f`;
  if (t >= 27) return `${t - 26}z`;
  return `${(t % 9) + 1}${SUIT_CHAR[Math.floor(t / 9)]}`;
}

/** "5m" / "1z" / "3f" / "0m"(赤5m) -> 牌タイプ（0mは5m扱い） */
export function codeToType(code) {
  const m = /^([0-9])([mpszf])$/.exec(String(code).trim());
  if (!m) throw new Error(`不正な牌コード: ${code}`);
  let n = Number(m[1]);
  const s = m[2];
  if (s === 'f') return 33 + n;
  if (s === 'z') return 26 + n;
  if (n === 0) n = 5; // 赤牌表記
  const base = { m: 0, p: 9, s: 18 }[s];
  return base + n - 1;
}

/** 表示名（"五萬" ではなく "5m" 系の簡潔表記 + 属性） */
export function typeName(t) {
  if (t >= 34) return FLOWER_NAME[t - 34];
  if (t >= 27) return HONOR_NAME[t - 27];
  const n = (t % 9) + 1;
  return `${n}${['萬', '筒', '索'][Math.floor(t / 9)]}`;
}

/**
 * 見た目が同じ牌をひとまとめにするための鍵。
 *
 * 打牌の選択肢は「見た目が同じ牌は1枚だけ」にまとめている。
 * このとき、画面で見分けがつく違いを鍵に入れ忘れると、
 * 別の牌が切れてしまい「その牌だけいつまでも切れない」ことになる。
 * 清一色ゲームの裏の色（青/黄）がまさにそれで、背一色を狙うのに
 * どちらを残すか選べなかった。
 *
 * 画面に出ている違いはすべてここに入れること。
 */
export function tileFaceKey(t) {
  return [
    t.t, t.red, t.gold, t.blue, t.star, t.rainbow, t.dot, t.sp, t.back || '',
  ].join('|');
}

export function tileName(tile) {
  if (!tile) return '-';
  let n = typeName(tile.t);
  if (tile.dot) n = '白ポッチ';
  else if (tile.gold) n = `金${n}`;
  else if (tile.rainbow) n = `虹${n}`;
  else if (tile.blue) n = `青${n}`;
  else if (tile.star) n = `星${n}`;
  else if (tile.red) n = `赤${n}`;
  if (tile.sp) n = `${n}(特)`;
  return n;
}

export const isHonor = (t) => t >= 27 && t < 34;
export const isFlower = (t) => t >= 34;
export const isSuit = (t) => t < 27;
export const isTerminal = (t) => t < 27 && (t % 9 === 0 || t % 9 === 8);
export const isYaochu = (t) => isHonor(t) || isTerminal(t);
export const isGreen = (t) => [19, 20, 21, 23, 25, 32].includes(t); // 2,3,4,6,8索 + 發
export const suitOf = (t) => (t < 27 ? Math.floor(t / 9) : 3);
export const numOf = (t) => (t < 27 ? (t % 9) + 1 : 0);

/** ドラ表示牌 -> ドラ本体の牌タイプ */
export function doraNext(t) {
  if (t >= 34) return t; // 花牌は循環しない
  if (t < 27) {
    const s = Math.floor(t / 9);
    const n = t % 9;
    return s * 9 + ((n + 1) % 9);
  }
  if (t <= 30) return 27 + ((t - 27 + 1) % 4); // 東南西北
  return 31 + ((t - 31 + 1) % 3);              // 白發中
}

/** チューリップ判定用：牌タイプの「隣」（数牌は±1、風牌/三元牌は輪の隣） */
export function neighborTypes(t) {
  const out = [];
  if (t < 27) {
    const n = t % 9;
    if (n > 0) out.push(t - 1);
    if (n < 8) out.push(t + 1);
  } else if (t <= 30) {
    out.push(27 + ((t - 27 + 3) % 4), 27 + ((t - 27 + 1) % 4));
  } else if (t < 34) {
    out.push(31 + ((t - 31 + 2) % 3), 31 + ((t - 31 + 1) % 3));
  }
  return out;
}

/** 34要素のカウント配列を作る */
export function emptyCounts() {
  return new Array(NUM_TYPES).fill(0);
}

export function countsOf(tiles) {
  const c = emptyCounts();
  for (const t of tiles) {
    const ty = typeof t === 'number' ? t : t.t;
    if (ty < NUM_TYPES) c[ty]++;
  }
  return c;
}

/** ソート（表示用） */
export function sortTiles(tiles) {
  return [...tiles].sort((a, b) => (a.t - b.t) || (a.id - b.id));
}
