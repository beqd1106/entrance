/**
 * marks.js - このアプリ専用の和風マーク（SVG）
 *
 * 画面の雰囲気（墨・金・和柄）に合わせた図案を自前で持つ。
 * 外部アイコンフォントも画像も使わないので、オフラインでも欠けない。
 * 線は 24x24 のグリッド、太さ1.5を基準にそろえている。
 */
const MARKS = {
  // 一筒を思わせる同心円＋雲。アプリの顔
  logo: `<circle cx="12" cy="12" r="9.2"/><circle cx="12" cy="12" r="5.4"/><circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"/>
    <path d="M3.2 15.6c1.6.9 3 .9 4.6 0M16.2 8.4c1.6-.9 3-.9 4.6 0" opacity=".55"/>`,
  // 卓を上から見た図。四方に牌、中央に賽
  table: `<rect x="3.2" y="3.2" width="17.6" height="17.6" rx="3.2"/>
    <rect x="9" y="4.9" width="6" height="2.6" rx="1"/><rect x="9" y="16.5" width="6" height="2.6" rx="1"/>
    <rect x="4.9" y="9" width="2.6" height="6" rx="1"/><rect x="16.5" y="9" width="2.6" height="6" rx="1"/>
    <circle cx="12" cy="12" r="2.1"/>`,
  // 牌が1枚立ち上がる＝打ちはじめる
  play: `<rect x="6.4" y="3.4" width="11.2" height="17.2" rx="2.6"/>
    <path d="M10.4 8.6h3.2M10.4 12h3.2M10.4 15.4h3.2" opacity=".75"/>
    <path d="M3.2 6.6c-.9 2-.9 8.8 0 10.8" opacity=".5"/>`,
  // 巻物＝ルールを決める
  rule: `<path d="M6.6 3.6h11a2 2 0 012 2v12.8a2 2 0 01-2 2h-11"/>
    <path d="M6.6 3.6a2 2 0 00-2 2v12.8a2 2 0 002 2"/>
    <path d="M9.4 8h6M9.4 11.4h6M9.4 14.8h3.4"/>`,
  // 暖簾＝店をさがす
  store: `<path d="M3 6.4h18"/><path d="M4.6 6.4v9.2a2 2 0 002 2h10.8a2 2 0 002-2V6.4"/>
    <path d="M9.6 6.4v11.2M14.4 6.4v11.2" opacity=".7"/>
    <path d="M3 6.4L5.6 3.2h12.8L21 6.4"/>`,
  // 牌2枚を並べる＝見くらべる
  compare: `<rect x="3.2" y="5" width="7.4" height="14" rx="2"/><rect x="13.4" y="5" width="7.4" height="14" rx="2"/>
    <path d="M6.1 9h1.6M6.1 12.4h1.6M16.3 9h1.6M16.3 12.4h1.6" opacity=".75"/>
    <path d="M12 3.4v17.2" opacity=".4" stroke-dasharray="2 2.4"/>`,
  // 提灯＝店舗の方へ
  shop: `<path d="M12 2.6v2.2"/><rect x="7.4" y="4.8" width="9.2" height="2" rx="1"/>
    <path d="M8.2 6.8c-1.5 1.5-1.5 8.4 0 9.9h7.6c1.5-1.5 1.5-8.4 0-9.9"/>
    <path d="M7.3 10h9.4M7.3 13.6h9.4" opacity=".6"/>
    <rect x="9.6" y="16.7" width="4.8" height="1.8" rx=".9"/><path d="M12 18.5v2.9"/>`,
  // 華牌＝特殊ルール
  flower: `<circle cx="12" cy="12" r="2"/>
    <path d="M12 3.6c1.9 0 3 1.3 3 2.9S13.9 9.6 12 9.6 9 8.1 9 6.5s1.1-2.9 3-2.9Z"/>
    <path d="M12 14.4c1.9 0 3 1.3 3 2.9s-1.1 2.9-3 2.9-3-1.3-3-2.9 1.1-2.9 3-2.9Z"/>
    <path d="M9.6 12c0 1.9-1.3 3-2.9 3S3.8 13.9 3.8 12s1.3-3 2.9-3 2.9 1.1 2.9 3Z"/>
    <path d="M14.4 12c0-1.9 1.3-3 2.9-3s2.9 1.1 2.9 3-1.3 3-2.9 3-2.9-1.1-2.9-3Z"/>`,
  // 賽＝おまかせ・ランダム
  dice: `<rect x="3.4" y="3.4" width="17.2" height="17.2" rx="4"/>
    <circle cx="8.4" cy="8.4" r="1.4" fill="currentColor" stroke="none"/>
    <circle cx="15.6" cy="15.6" r="1.4" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>`,
  // 雲＝装飾（見出しの区切りなど）
  cloud: `<path d="M2.6 15.4c1.4 1.2 3 1.2 4.4 0s3-1.2 4.4 0 3 1.2 4.4 0 3-1.2 4.4 0"/>
    <path d="M4.4 11.2c1.2 1 2.6 1 3.8 0s2.6-1 3.8 0 2.6 1 3.8 0" opacity=".6"/>`,
};

/** 和風マークを1つ返す。size は px */
export function markIcon(name, size = 22) {
  const body = MARKS[name] || MARKS.logo;
  const el = document.createElement('span');
  el.className = 'mark';
  el.style.display = 'inline-flex';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  return el;
}

export const MARK_NAMES = Object.keys(MARKS);
