/**
 * tileart.js - 牌面の絵柄
 *
 * 数牌と字牌は、CC0（パブリックドメイン）で公開されている
 * riichi-mahjong-tiles の素材を使う。
 *   https://github.com/FluffyStuff/riichi-mahjong-tiles
 *   CC0 1.0 Universal … 商用可・クレジット不要・改変可
 * 自前でベクターを描いていたが、一索の鳥や筒子の輪のような
 * 細かい絵柄は、実物に忠実な素材のほうが読みやすく、本格的に見える。
 *
 * 花牌（春夏秋冬）は素材に無いので、これまでどおりここで描く。
 * 牌の面（象牙色の板と厚み）はCSS側が描く。ここは絵柄だけを扱う。
 */

const TILE_DIR = 'img/tiles/';
const SUITS = ['Man', 'Pin', 'Sou'];
const HONORS = ['Ton', 'Nan', 'Shaa', 'Pei', 'Haku', 'Hatsu', 'Chun'];

/**
 * 牌の絵柄ファイル。花牌のときは null（描画側が自前のSVGを使う）
 * @param {number} t 牌タイプ
 * @param {boolean} red 赤牌のとき、赤ドラ用の絵柄を使う
 */
export function tileFaceSrc(t, red = false) {
  if (t >= 34) return null;
  if (t >= 27) return `${TILE_DIR}${HONORS[t - 27]}.svg`;
  const n = (t % 9) + 1;
  const suit = SUITS[Math.floor(t / 9)];
  if (red && n === 5) return `${TILE_DIR}${suit}5-Dora.svg`;
  return `${TILE_DIR}${suit}${n}.svg`;
}

const VB = 'viewBox="0 0 100 140"';

function flower(t) {
  const ch = ['春', '夏', '秋', '冬'][t - 34];
  const cls = ['green', 'red', 'gold-ink', 'blue'][t - 34];
  return `<svg ${VB}><text x="50" y="99" class="glyph ${cls}" font-size="76">${ch}</text></svg>`;
}

/** 花牌だけは自前で描く（素材に無いため） */
export function tileFaceSVG(t) {
  if (t >= 34) return flower(t);
  return `<svg ${VB}></svg>`;
}

/** 牌の裏面 */
export function tileBackSVG() {
  return `<svg ${VB}>`
    + `<rect x="8" y="8" width="84" height="124" rx="8" class="back-inner"/>`
    + `<path d="M50 34 L66 70 L50 106 L34 70Z" class="back-mark"/>`
    + `</svg>`;
}
