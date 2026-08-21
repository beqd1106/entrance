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
/**
 * 竹1本。
 * ただの角丸の棒だと、小さく表示したときに何本あるのか読み取りにくい。
 * 実物の牌と同じく「中央がくびれ、上下に節がある」形にして、
 * 本と本のあいだに隙間が見えるようにする。
 */
function bamboo(x, y, h, cls = 'green') {
  const f = (v) => Number(v).toFixed(1);
  const w = h * 0.56;           // 節の幅（いちばん太いところ）
  const waist = w * 0.62;       // 中央のくびれ
  const nodeH = h * 0.155;      // 節の高さ
  const top = y - h / 2;
  const bot = y + h / 2;
  const innerTop = top + nodeH * 0.9;
  const innerBot = bot - nodeH * 0.9;
  // くびれた胴（左右対称のベジェ）
  const body = `<path d="M${f(x - waist / 2)} ${f(innerTop)}`
    + ` C${f(x - w * 0.30)} ${f(y - h * 0.16)} ${f(x - w * 0.30)} ${f(y + h * 0.16)} ${f(x - waist / 2)} ${f(innerBot)}`
    + ` L${f(x + waist / 2)} ${f(innerBot)}`
    + ` C${f(x + w * 0.30)} ${f(y + h * 0.16)} ${f(x + w * 0.30)} ${f(y - h * 0.16)} ${f(x + waist / 2)} ${f(innerTop)} Z"/>`;
  // 上下の節
  const node = (cy) => `<rect x="${f(x - w / 2)}" y="${f(cy - nodeH / 2)}" width="${f(w)}"`
    + ` height="${f(nodeH)}" rx="${f(nodeH * 0.42)}"/>`;
  // 胴の中央に細い抜きを入れて、竹らしい溝を作る
  const groove = h >= 30
    ? `<rect x="${f(x - waist * 0.12)}" y="${f(y - h * 0.13)}" width="${f(waist * 0.24)}"`
      + ` height="${f(h * 0.26)}" rx="${f(waist * 0.12)}" class="face"/>`
    : '';
  return `<g class="${cls}">${body}${node(top + nodeH / 2)}${node(bot - nodeH / 2)}</g>${groove}`;
}

/**
 * 一索は鳥（孔雀）。
 * 小さく表示しても鳥だと分かるよう、頭・くちばし・胴・尾を大きめの塊で描く。
 */
function bird() {
  return `<svg ${VB}>`
    // 尾（下へ流れる羽。緑と赤を重ねて牌らしい色に）
    + `<path d="M46 96 C40 116 34 128 24 136 C40 132 50 120 56 104Z" class="green"/>`
    + `<path d="M54 98 C54 118 50 130 42 138 C56 134 64 120 66 104Z" class="red"/>`
    // 胴
    + `<path d="M50 46 C68 50 76 68 72 88 C68 106 56 112 46 104 C36 96 34 62 50 46Z" class="green"/>`
    // 胸の抜き
    + `<path d="M50 58 C42 68 42 88 50 98 C56 90 56 68 50 58Z" class="face"/>`
    // 頭
    + `<circle cx="46" cy="36" r="14" class="green"/>`
    + `<circle cx="43" cy="33" r="3.6" class="face"/>`
    // くちばし
    + `<path d="M33 38 L18 43 L34 47Z" class="red"/>`
    // 冠羽
    + `<path d="M50 22 C46 14 50 8 57 8 C58 15 55 20 50 24Z" class="red"/>`
    + `<path d="M58 26 C58 18 63 14 69 15 C68 22 64 26 58 29Z" class="green"/>`
    // 脚
    + `<path d="M62 108 L66 122 M62 108 L56 120" stroke-width="3.5" class="red-stroke"/>`
    + `</svg>`;
}

const SOU_LAYOUT = {
  2: [[50, 44, 50, 'green'], [50, 100, 50, 'green']],
  3: [[50, 36, 46, 'green'], [30, 100, 46, 'green'], [70, 100, 46, 'green']],
  4: [[31, 42, 46, 'green'], [69, 42, 46, 'green'], [31, 100, 46, 'green'], [69, 100, 46, 'green']],
  5: [[28, 36, 40, 'green'], [72, 36, 40, 'green'], [50, 70, 40, 'red'], [28, 104, 40, 'green'], [72, 104, 40, 'green']],
  6: [[30, 34, 38, 'green'], [70, 34, 38, 'green'], [30, 72, 38, 'green'], [70, 72, 38, 'green'], [30, 110, 38, 'green'], [70, 110, 38, 'green']],
  7: [[50, 28, 34, 'red'], [30, 74, 34, 'green'], [70, 74, 34, 'green'], [50, 74, 34, 'green'],
    [30, 116, 34, 'green'], [70, 116, 34, 'green'], [50, 116, 34, 'green']],
  8: [[32, 30, 34, 'green'], [68, 30, 34, 'green'], [32, 66, 34, 'green'], [68, 66, 34, 'green'],
    [32, 102, 34, 'green'], [68, 102, 34, 'green'], [32, 132, 30, 'green'], [68, 132, 30, 'green']],
  9: [[26, 32, 34, 'red'], [50, 32, 34, 'red'], [74, 32, 34, 'red'],
    [26, 72, 34, 'green'], [50, 72, 34, 'green'], [74, 72, 34, 'green'],
    [26, 112, 34, 'green'], [50, 112, 34, 'green'], [74, 112, 34, 'green']],
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
