/**
 * hub.js - 起動直後の「何をするか」を選ぶ画面（OP画面）
 *
 * 方針
 *  - 1画面で完結させる。スクロールさせない（縦・横どちらの持ち方でも）。
 *  - カタログではなく操作の入口。打つ導線を最上段に置く。
 *  - 文字は短く。狭い画面では補足文を落として、押す対象だけを残す。
 */
import { h, icon } from './ui.js';
import { lastTable } from './recent.js';
import { lookupPreset } from './custom.js';
import { resolveRules } from '../../src/rules/defaults.js';
import { shortSummary } from '../../src/rules/explain.js';
import { showOnboarding } from './onboarding.js';
import { markIcon } from './marks.js';

/** OPのタイル。mark はアプリ専用の和風マーク（marks.js） */
function tile(opts) {
  const { href, mark, title, sub, tone, onClick, span } = opts;
  const el = h(`${onClick ? 'button' : 'a'}.op-tile${tone ? `.tone-${tone}` : ''}${span ? '.span-2' : ''}`,
    onClick ? { type: 'button' } : { href },
    h('span.op-tile-mark', markIcon(mark)),
    h('span.op-tile-text',
      h('span.op-tile-title', { text: title }),
      sub ? h('span.op-tile-sub', { text: sub }) : null),
    h('span.op-tile-go', icon('arrow', 14)));
  if (onClick) el.addEventListener('click', onClick);
  return el;
}

/** 前回打った卓。無ければ「すぐ打つ」に変わる */
function resumeTile() {
  const last = lastTable();
  if (!last || !last.presetId) {
    return tile({
      href: '#/play?preset=standard4',
      mark: 'play',
      title: 'すぐ打つ',
      sub: '一般四麻ではじめる',
      tone: 'play',
    });
  }
  let sub = last.name || 'さっきの卓';
  try {
    const p = lookupPreset(last.presetId);
    sub = `${p.name}／${shortSummary(resolveRules(p.rules)).split(' / ').slice(0, 2).join('・')}`;
  } catch { /* 消えたルールでも、記録した名前で出す */ }
  return tile({
    href: `#/play?preset=${encodeURIComponent(last.presetId)}${last.event ? `&event=${encodeURIComponent(last.event)}` : ''}`,
    mark: 'play',
    title: '前回の続き',
    sub,
    tone: 'play',
  });
}

export function renderHub(root) {
  document.body.classList.add('op-mode');

  const search = h('input.op-search-input', {
    type: 'search',
    id: 'opSearch',
    name: 'opSearch',
    placeholder: '店名・エリア・ルールで探す（例：白ポッチ／三麻／新宿）',
    autocomplete: 'off',
    enterkeyhint: 'search',
    'aria-label': '店舗とルールを検索',
  });
  const go = () => {
    const q = search.value.trim();
    location.hash = q ? `#/search?q=${encodeURIComponent(q)}` : '#/search';
  };
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  const goBtn = h('button.op-search-go', { type: 'button', 'aria-label': '検索する' }, icon('search', 16));
  goBtn.addEventListener('click', go);

  const helpBtn = h('button.op-foot-link', { type: 'button' }, h('span', { text: 'はじめての方へ' }));
  helpBtn.addEventListener('click', () => showOnboarding());

  const sec = h('section.op',
    h('div.op-bg', { 'aria-hidden': 'true' }),
    h('div.op-inner',
      h('header.op-head',
        h('div.op-brand',
          h('span.op-brand-mark', markIcon('logo')),
          h('span.op-brand-name', { text: 'Houserule' })),
        h('p.op-lead', '打ってから、', h('span.hl', '行く。')),
        h('p.op-sub', { text: 'その店のハウスルールで、行く前に打てる。' })),

      h('div.op-search',
        h('span.op-search-icon', { 'aria-hidden': 'true' }, icon('search', 15)),
        search, goBtn),

      h('nav.op-tiles', { 'aria-label': 'メニュー' },
        tile({
          href: '#/table',
          mark: 'table',
          title: '卓を立てる',
          sub: '人数とルールを選んで対局',
          tone: 'primary',
        }),
        resumeTile(),
        tile({ href: '#/editor', mark: 'rule', title: 'ルール設定', sub: '自分のルールを作って保存' }),
        tile({ href: '#/stores', mark: 'store', title: '店舗をさがす', sub: 'ハウスルールから雀荘を探す' }),
        tile({ href: '#/compare', mark: 'compare', title: 'ルール比較', sub: '2つ並べて違いを見る' }),
        tile({ href: '#/dashboard', mark: 'shop', title: '店舗の方へ', sub: '自店のルールを登録・公開' })),

      h('footer.op-foot',
        h('a.op-foot-link', { href: '#/manual' }, h('span', { text: '使い方' })),
        helpBtn,
        h('a.op-foot-link', { href: '#/cards' }, h('span', { text: '会員カード' })),
        h('a.op-foot-link', { href: '#/about' }, h('span', { text: 'このアプリについて' })),
        h('span.op-note', { text: 'デモ版／ポイントは非換金' }))));

  // タイルが順に立ち上がるよう、並び順をCSSへ渡す
  sec.querySelectorAll('.op-tiles > *').forEach((el, i) => el.style.setProperty('--i', String(i)));
  root.appendChild(sec);
}

/** ハブから離れるときに、背景モードを戻す */
export function leaveHub() {
  document.body.classList.remove('op-mode');
}
