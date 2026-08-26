/**
 * ui.js - DOM構築と牌描画の共通部品
 */
import { typeName, isFlower } from '../../src/core/tiles.js';
import { tileFaceSVG, tileFaceSrc, tileBackSVG } from './tileart.js';

/** 軽量な要素ビルダー h('div.card', {text:'x'}, child...) */
export function h(spec, attrs, ...children) {
  const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(spec);
  const tag = (m && m[1]) || 'div';
  const el = document.createElement(tag);
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g) || []) {
      if (part[0] === '.') el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  if (attrs && (attrs.nodeType || typeof attrs === 'string' || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style') {
        // CSSカスタムプロパティ（--hue など）は setProperty でないと反映されない
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, sv);
          else el.style[sk] = sv;
        }
      }
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'data') for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
      else if (k in el && k !== 'list') el[k] = v;
      else el.setAttribute(k, v);
    }
  }
  const add = (c) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(add); return; }
    el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return el;
}

export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const fmt = (n) => Number(n).toLocaleString('ja-JP');
export const signed = (n) => (n > 0 ? `+${fmt(n)}` : fmt(n));

const SUIT_JP = ['萬', '筒', '索'];

/** 牌1枚のDOM。tileInfo は engine.tileInfo() の戻り値 */
export function tileEl(info, opts = {}) {
  const cls = ['tile'];
  if (opts.size) cls.push(`tile-${opts.size}`);
  if (!info || info.hidden) {
    cls.push('back');
    return h(`div.${cls.join('.')}`, opts.attrs || null, h('div.tile-face', { html: tileBackSVG() }));
  }
  if (info.red) cls.push('red');
  if (info.gold) cls.push('gold');
  if (info.blue) cls.push('blue-tile');
  if (info.star) cls.push('star-tile');
  if (info.rainbow) cls.push('rainbow-tile');
  if (info.dot) cls.push('dot');
  if (info.flower || isFlower(info.t)) cls.push('flower');
  // 2セット混ぜのルールでは、牌の裏の色を下辺の帯で示す（背一色を狙えるように）
  if (info.back) cls.push(`back-${info.back}`);
  if (info.sp) { cls.push('sp'); if (opts.spColor) cls.push(`sp-${opts.spColor}`); }
  if (opts.dim) cls.push('dim');
  if (opts.clickable) cls.push('tile-clickable');
  if (opts.selected) cls.push('sel');
  if (opts.gap) cls.push('tsumo-gap');
  if (opts.side) cls.push('side');
  if (opts.anim) cls.push(opts.anim);
  if (opts.dora) cls.push('is-dora');
  if (opts.cls) cls.push(opts.cls);

  // 数牌と字牌は素材の画像、花牌だけ自前のSVG
  const src = tileFaceSrc(info.t, !!info.red);
  const inner = src
    ? h('div.tile-face', h('img.tile-img', { src, alt: '', draggable: 'false', loading: 'eager' }))
    : h('div.tile-face', { html: tileFaceSVG(info.t) });
  const el = h(`div.${cls.join('.')}`, Object.assign({ title: info.name || '' }, opts.attrs), inner);
  if (opts.onClick) el.addEventListener('click', opts.onClick);
  return el;
}

/**
 * 店舗写真の img。
 * 画像URLには期限があるので、切れていたら黙って消す。
 * 消えても下の色とマークが残るので、画面は崩れない。
 */
export function photoImg(url, opts = {}) {
  const el = h('img.store-photo-img', { src: url, alt: '', ...(opts.attrs || {}) });
  el.addEventListener('error', () => el.remove());
  return el;
}

export function tileRow(list, opts = {}) {
  return h('div.hand-row', (list || []).map((t) => tileEl(t, opts)));
}

/** 星（初心者歓迎度） */
export function stars(n, max = 5) {
  const star = (on) => h(`span${on ? '' : '.off'}`, {
    html: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5 6.1 20.6l1.2-6.5L2.5 9.5l6.6-.9z"/></svg>',
  });
  return h('div.stars', Array.from({ length: max }, (_, i) => star(i < n)));
}

const ICONS = {
  table: '<path d="M3 6h18v3H3zM5 9v10M19 9v10M9 12h6M3 6l3-3h12l3 3"/>',
  gem: '<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18M9 3L6 9l6 12M15 3l3 6-6 12"/>',
  flower: '<path d="M12 4.2c2 0 3.2 1.4 3.2 3S14 10 12 10 8.8 8.8 8.8 7.2 10 4.2 12 4.2ZM12 14c2 0 3.2 1.4 3.2 3S14 19.8 12 19.8 8.8 18.6 8.8 17 10 14 12 14ZM7 9.2c1.4 1.4 1.4 3.2.3 4.3s-2.9 1.1-4.3-.3S1.6 9.9 2.7 8.8 5.6 7.8 7 9.2ZM21.3 8.8c1.1 1.1 1.1 2.9-.3 4.3s-3.2 1.4-4.3.3-1.1-2.9.3-4.3 3.2-1.4 4.3-.3Z"/><circle cx="12" cy="12" r="1.8"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/>',
  play: '<path d="M7 4l13 8-13 8z" fill="currentColor" stroke="none"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  pin: '<path d="M12 22s7-7.6 7-12.4A7 7 0 005 9.6C5 14.4 12 22 12 22z"/><circle cx="12" cy="9.5" r="2.4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  smoke: '<path d="M3 18h14v3H3zM19 18h2v3h-2zM17 12c2 0 3-1.2 3-3s-1-3-3-3"/>',
  qr: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3z"/><path d="M14 14h3v3h-3zM18 18h3v3h-3z"/>',
  scale: '<path d="M12 3v18M4 7h16M7 7l-3 6h6zM17 7l-3 6h6z"/>',
  book: '<path d="M4 4h7a2 2 0 012 2v14a2 2 0 00-2-2H4zM20 4h-7a2 2 0 00-2 2v14a2 2 0 012-2h7z"/>',
  bug: '<circle cx="12" cy="13" r="5"/><path d="M12 8V5M7 10L4 8M17 10l3-2M7 16l-3 2M17 16l3 2M12 18v3"/>',
};

export function icon(name, size = 18) {
  const p = ICONS[name] || ICONS.check;
  return h('span', {
    style: { display: 'inline-flex', width: `${size}px`, height: `${size}px` },
    html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`,
  });
}

export function sectionHead(no, title, sub) {
  return h('div.sec-head',
    h('span.sec-no', { text: no }),
    h('div',
      h('h2.sec-title', { text: title }),
      sub ? h('p.sec-sub', { text: sub, style: { margin: '0' } }) : null));
}

export function chip(text, kind = '') {
  return h(`span.chip${kind ? `.chip-${kind}` : ''}`, { text });
}

/** トグルボタン群 */
export function toggleRow(items, current, onPick) {
  const row = h('div.toggle-row');
  items.forEach((it) => {
    const b = h('button', { text: it.label, class: it.value === current ? 'on' : '' });
    b.addEventListener('click', () => onPick(it.value));
    row.appendChild(b);
  });
  return row;
}

export function switchRow(label, desc, value, onChange) {
  const sw = h('button.sw', { class: value ? 'on' : '', 'aria-pressed': String(!!value) });
  sw.addEventListener('click', () => onChange(!value));
  return h('div.switch',
    h('div.grow', h('div.sw-label', { text: label }), desc ? h('div.sw-desc', { text: desc }) : null),
    sw);
}

export function stepper(value, onChange, min = 0, max = 4) {
  const val = h('span.val', { text: String(value) });
  const dec = h('button', { text: '−' });
  const inc = h('button', { text: '＋' });
  dec.addEventListener('click', () => onChange(Math.max(min, value - 1)));
  inc.addEventListener('click', () => onChange(Math.min(max, value + 1)));
  return h('div.stepper', dec, val, inc);
}

export function field(label, control, desc) {
  return h('div.field',
    h('label', { text: label }),
    control,
    desc ? h('div.desc', { text: desc }) : null);
}

export function notice(text) {
  return h('div.notice', { text });
}

// ---------------------------------------------------------------------------
// ルールタグの色分け
//   店ごとの違いが「一目で楽しく」見えるように、意味でトーンを割り当てる。
//   色だけに頼らないよう、文言はそのまま残す（アクセシビリティ）。
// ---------------------------------------------------------------------------
const TAG_TONE = [
  [/白ポッチ|オールマイティ|青(牌|5)|ブルー/, 'sky'],
  [/アリス|チューリップ|めくり/, 'coral'],
  [/華牌|花牌|春|夏|秋|冬|金(牌|5)|ゴールド/, 'amber'],
  [/五等|三麻|東天紅|ロケット|北抜き|抜きドラ|ガリ/, 'teal'],
  [/特殊牌|ジュエル|宝石|アメジスト|爆ドラ|ローカル役/, 'violet'],
  [/初心者|歓迎|禁煙|ノーレート|学生|女性/, 'mint'],
  [/割れ目|赤あり|赤\d|全赤|オープンリーチ|インフレ/, 'rose'],
  [/四麻|半荘|東風|喰いタン/, 'slate'],
];

/** タグ文字列から色調を決める */
export function toneOf(label) {
  for (const [re, tone] of TAG_TONE) if (re.test(label)) return tone;
  return 'slate';
}

/** ルールタグ（色付きチップ）。アイコンは付けず、文言と色で識別する */
export function ruleChip(label, opts = {}) {
  const el = h(`span.chip.tag-${toneOf(label)}`, { text: label });
  if (opts.strong) el.classList.add('tag-strong');
  return el;
}
