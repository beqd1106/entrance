/**
 * tileart.js - 牌面のインラインSVG
 *
 * 外部画像・フォントに依存せず、牌の絵柄をベクターで描く。
 * 色は semantic class（ink / red / green / blue）で塗り分け、
 * 赤牌・金牌などの属性は CSS 側で class を上書きして表現する。
 *
 * viewBox は 0 0 100 140（牌の面）に統一。
 */

const VB = 'viewBox="0 0 100 140"';

// ---------------------------------------------------------------------------
// 筒子（ドット）
// ---------------------------------------------------------------------------
/** 1つの円（外周＋内周＋芯） */
function pin(x, y, r, cls = 'blue') {
  return `<circle cx="${x}" cy="${y}" r="${r}" class="${cls}"/>`
    + `<circle cx="${x}" cy="${y}" r="${r * 0.62}" class="face"/>`
    + `<circle cx="${x}" cy="${y}" r="${r * 0.3}" class="${cls === 'blue' ? 'red' : cls}"/>`;
}

const PIN_LAYOUT = {
  1: [[50, 70, 26, 'red']],
  2: [[50, 40, 18, 'blue'], [50, 100, 18, 'green']],
  3: [[27, 33, 16, 'blue'], [50, 70, 16, 'green'], [73, 107, 16, 'red']],
  4: [[31, 43, 17, 'blue'], [69, 43, 17, 'green'], [31, 97, 17, 'green'], [69, 97, 17, 'blue']],
  5: [[28, 38, 15, 'blue'], [72, 38, 15, 'green'], [50, 70, 15, 'red'], [28, 102, 15, 'green'], [72, 102, 15, 'blue']],
  6: [[30, 33, 15, 'green'], [70, 33, 15, 'green'], [30, 70, 15, 'red'], [70, 70, 15, 'red'], [30, 107, 15, 'red'], [70, 107, 15, 'red']],
  7: [[26, 28, 11, 'green'], [50, 43, 11, 'green'], [74, 58, 11, 'green'],
    [31, 90, 12, 'red'], [69, 90, 12, 'red'], [31, 119, 12, 'red'], [69, 119, 12, 'red']],
  8: [[33, 25, 11, 'blue'], [67, 25, 11, 'blue'], [33, 57, 11, 'blue'], [67, 57, 11, 'blue'],
    [33, 89, 11, 'blue'], [67, 89, 11, 'blue'], [33, 121, 11, 'blue'], [67, 121, 11, 'blue']],
  9: [[26, 33, 12.5, 'red'], [50, 33, 12.5, 'red'], [74, 33, 12.5, 'red'],
    [26, 70, 12.5, 'green'], [50, 70, 12.5, 'green'], [74, 70, 12.5, 'green'],
    [26, 107, 12.5, 'blue'], [50, 107, 12.5, 'blue'], [74, 107, 12.5, 'blue']],
};

function pinzu(n) {
  return `<svg ${VB}>${PIN_LAYOUT[n].map(([x, y, r, c]) => pin(x, y, r, c)).join('')}</svg>`;
}

// ---------------------------------------------------------------------------
// 索子（竹）
// ---------------------------------------------------------------------------
/** 竹1本（節つき） */
function bamboo(x, y, h, cls = 'green') {
  const w = h * 0.62;
  const nodeW = w * 1.18;
  const nodeH = h * 0.11;
  return `<g class="${cls}">`
    + `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${w * 0.3}"/>`
    + `<rect x="${x - nodeW / 2}" y="${y - h * 0.30 - nodeH / 2}" width="${nodeW}" height="${nodeH}" rx="${nodeH / 2}"/>`
    + `<rect x="${x - nodeW / 2}" y="${y + h * 0.30 - nodeH / 2}" width="${nodeW}" height="${nodeH}" rx="${nodeH / 2}"/>`
    + `</g>`;
}

/** 一索は鳥 */
function bird() {
  return `<svg ${VB}>`
    + `<ellipse cx="50" cy="78" rx="20" ry="26" class="green"/>`
    + `<path d="M50 52 C36 60 32 78 40 94 C46 84 46 66 50 52Z" class="face"/>`
    + `<circle cx="50" cy="42" r="13" class="green"/>`
    + `<circle cx="50" cy="40" r="3.4" class="face"/>`
    + `<path d="M50 27 C44 20 46 12 52 10 C56 14 55 22 50 27Z" class="red"/>`
    + `<path d="M60 46 L74 42 L61 52Z" class="red"/>`
    + `<path d="M42 100 C46 116 54 122 62 126 C52 122 48 112 46 102Z" class="green"/>`
    + `<path d="M38 104 C40 118 46 126 54 130 C44 128 38 118 34 106Z" class="red"/>`
    + `</svg>`;
}

const SOU_LAYOUT = {
  2: [[50, 42, 40, 'green'], [50, 100, 40, 'green']],
  3: [[50, 34, 36, 'green'], [30, 102, 36, 'green'], [70, 102, 36, 'green']],
  4: [[30, 42, 38, 'green'], [70, 42, 38, 'green'], [30, 100, 38, 'green'], [70, 100, 38, 'green']],
  5: [[28, 36, 32, 'green'], [72, 36, 32, 'green'], [50, 70, 32, 'red'], [28, 104, 32, 'green'], [72, 104, 32, 'green']],
  6: [[30, 32, 30, 'green'], [70, 32, 30, 'green'], [30, 70, 30, 'green'], [70, 70, 30, 'green'], [30, 108, 30, 'green'], [70, 108, 30, 'green']],
  7: [[50, 26, 28, 'red'], [30, 72, 28, 'green'], [70, 72, 28, 'green'], [50, 72, 28, 'green'],
    [30, 114, 28, 'green'], [70, 114, 28, 'green'], [50, 114, 28, 'green']],
  8: [[32, 28, 28, 'green'], [68, 28, 28, 'green'], [32, 62, 28, 'green'], [68, 62, 28, 'green'],
    [32, 96, 28, 'green'], [68, 96, 28, 'green'], [32, 126, 24, 'green'], [68, 126, 24, 'green']],
  9: [[26, 30, 28, 'red'], [50, 30, 28, 'red'], [74, 30, 28, 'red'],
    [26, 70, 28, 'green'], [50, 70, 28, 'green'], [74, 70, 28, 'green'],
    [26, 110, 28, 'green'], [50, 110, 28, 'green'], [74, 110, 28, 'green']],
};

function souzu(n) {
  if (n === 1) return bird();
  return `<svg ${VB}>${SOU_LAYOUT[n].map(([x, y, h, c]) => bamboo(x, y, h, c)).join('')}</svg>`;
}

// ---------------------------------------------------------------------------
// 萬子・字牌・花牌（文字）
// ---------------------------------------------------------------------------
const KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

function manzu(n) {
  return `<svg ${VB}>`
    + `<text x="50" y="56" class="glyph ink" font-size="52">${KANJI[n - 1]}</text>`
    + `<text x="50" y="118" class="glyph red" font-size="54">萬</text>`
    + `</svg>`;
}

function honor(t) {
  // 27:東 28:南 29:西 30:北 31:白 32:發 33:中
  if (t === 31) {
    // 白は絵柄なし（真っ白）。白ポッチの赤い点だけがCSS側で乗る
    return `<svg ${VB}></svg>`;
  }
  const ch = ['東', '南', '西', '北', '白', '發', '中'][t - 27];
  const cls = t === 33 ? 'red' : t === 32 ? 'green' : 'ink';
  return `<svg ${VB}><text x="50" y="98" class="glyph ${cls}" font-size="76">${ch}</text></svg>`;
}

function flower(t) {
  const ch = ['春', '夏', '秋', '冬'][t - 34];
  const cls = ['green', 'red', 'gold-ink', 'blue'][t - 34];
  return `<svg ${VB}><text x="50" y="96" class="glyph ${cls}" font-size="68">${ch}</text></svg>`;
}

// ---------------------------------------------------------------------------
export function tileFaceSVG(t) {
  if (t >= 34) return flower(t);
  if (t >= 27) return honor(t);
  const n = (t % 9) + 1;
  if (t < 9) return manzu(n);
  if (t < 18) return pinzu(n);
  return souzu(n);
}

/** 牌の裏面 */
export function tileBackSVG() {
  return `<svg ${VB}>`
    + `<rect x="8" y="8" width="84" height="124" rx="8" class="back-inner"/>`
    + `<path d="M50 34 L66 70 L50 106 L34 70Z" class="back-mark"/>`
    + `</svg>`;
}
