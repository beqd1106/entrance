/**
 * table.js - 「卓を立てる」画面
 *
 * 方針
 *  - ページ全体はスクロールさせない。動くのはルール一覧の中だけ。
 *  - 左でルールを選び、右で「よく変える設定」だけ触って、すぐ始められる。
 *  - 細かい設定はここでは出さない。必要ならルール設定（エディタ）へ送る。
 */
import { h, clear, icon, chip, ruleChip } from './ui.js';
import { markIcon } from './marks.js';
import { matchText, presetHaystack } from './search.js';
import { allPresetsWithCustom, lookupPreset, saveCustomPreset } from './custom.js';
import { resolveRules, deepMerge } from '../../src/rules/defaults.js';
import { shortSummary, diffFromBaseline } from '../../src/rules/explain.js';
import { rememberTable } from './recent.js';

const CATS = ['すべて', '標準', '地域', '特殊', '五等サンマ', '店舗', '自作'];
const BUILTIN_CATS = ['標準', '地域', '特殊', '五等サンマ', '店舗'];
const TMP_ID = 'table_custom';

/** この画面で触れる「よく変える設定」だけを定義する */
const TWEAKS = [
  {
    key: 'length',
    label: '半荘 / 東風',
    kind: 'choice',
    options: [{ v: 'east_south', label: '半荘' }, { v: 'east', label: '東風' }],
    read: (r) => (r.game.length === 'east' ? 'east' : 'east_south'),
    patch: (v) => ({ game: { length: v } }),
  },
  {
    key: 'red',
    label: '赤ドラ',
    kind: 'switch',
    desc: '5萬・5筒・5索の赤牌を入れる',
    read: (r) => Object.values(r.dora.red || {}).some((n) => n > 0),
    patch: (v, base) => {
      const keep = base.dora.red && Object.keys(base.dora.red).length
        ? base.dora.red : { '5m': 1, '5p': 1, '5s': 1 };
      return { dora: { red: v ? keep : {} } };
    },
  },
  {
    key: 'kuitan',
    label: '喰いタン',
    kind: 'switch',
    desc: '鳴いたタンヤオを認める',
    read: (r) => !!r.win.kuitan,
    patch: (v) => ({ win: { kuitan: v } }),
  },
  {
    key: 'wareme',
    label: '割れ目',
    kind: 'switch',
    desc: '割れ目の人の収支が2倍になる',
    read: (r) => !!r.local.wareme.enabled,
    patch: (v) => ({ local: { wareme: { enabled: v } } }),
  },
  {
    key: 'openRiichi',
    label: 'オープンリーチ',
    kind: 'switch',
    desc: '手牌を見せる代わりに翻が増える',
    read: (r) => !!r.local.openRiichi.enabled,
    patch: (v) => ({ local: { openRiichi: { enabled: v } } }),
  },
];

export function renderTable(root, params) {
  const S = {
    players: params.players === '3' ? 3 : 4,
    cat: 'すべて',
    q: '',
    presetId: params.preset || null,
    tweak: {},
  };

  const list = h('div.tbl-list');
  const detail = h('div.tbl-detail');
  const countLabel = h('span.tbl-count');
  const seats = h('div.seg.seg-lg');
  const cats = h('div.tbl-cats');
  const input = h('input.tbl-search-input', {
    type: 'search',
    id: 'tableSearch',
    name: 'tableSearch',
    placeholder: 'ルールを探す（例：白ポッチ、東天紅、赤なし）',
    autocomplete: 'off',
    'aria-label': 'ルールを検索',
  });

  /** 人数・カテゴリ・語で絞ったルール候補 */
  const candidates = () => allPresetsWithCustom().filter((p) => {
    // その場かぎりの卓設定は一覧に出さない（同じものが二重に並んで見えるため）
    if (p.id === TMP_ID) return false;
    let r;
    try { r = resolveRules(p.rules); } catch { return false; }
    if (r.game.players !== S.players) return false;
    if (S.cat !== 'すべて') {
      const cat = p.category || '自作';
      const ok = S.cat === '自作' ? !BUILTIN_CATS.includes(cat) : cat === S.cat;
      if (!ok) return false;
    }
    return matchText(presetHaystack(p), S.q);
  });

  const currentPreset = () => {
    if (!S.presetId) return null;
    try { return lookupPreset(S.presetId); } catch { return null; }
  };

  /** いま選んでいるルール＋つまみを反映した結果 */
  const currentRules = () => {
    const p = currentPreset();
    if (!p) return null;
    const base = resolveRules(p.rules);
    let patch = {};
    for (const t of TWEAKS) {
      if (!(t.key in S.tweak)) continue;
      patch = deepMerge(patch, t.patch(S.tweak[t.key], base));
    }
    return { preset: p, base, patch, rules: resolveRules(deepMerge(p.rules, patch)) };
  };

  // -------------------------------------------------------------------------
  function renderList() {
    clear(list);
    const items = candidates();
    countLabel.textContent = `${items.length}件`;
    if (!items.length) {
      const btn = h('button.btn.btn-sm.btn-ghost', { type: 'button', text: '条件を外す' });
      btn.addEventListener('click', () => {
        S.q = '';
        S.cat = 'すべて';
        input.value = '';
        renderChrome();
        renderList();
        renderDetail();
      });
      list.appendChild(h('div.tbl-empty',
        h('p', { text: '見つかりませんでした。' }),
        h('p.tiny.muted', { text: '「三麻」「白ポッチ」など、別の言い方でも探せます。' }),
        btn));
      return;
    }
    if (S.presetId && !items.some((p) => p.id === S.presetId)) S.presetId = null;
    if (!S.presetId) S.presetId = items[0].id;
    for (const p of items) {
      const r = resolveRules(p.rules);
      const on = p.id === S.presetId;
      const row = h(`button.tbl-row${on ? '.on' : ''}`, { type: 'button', 'aria-pressed': String(on) },
        h('span.tbl-row-main',
          h('span.tbl-row-name', { text: p.name }),
          h('span.tbl-row-sum', { text: shortSummary(r) })),
        h('span.tbl-row-cat', { text: p.category || '自作' }));
      row.addEventListener('click', () => {
        S.presetId = p.id;
        S.tweak = {};
        renderList();
        renderDetail();
      });
      list.appendChild(row);
    }
  }

  // -------------------------------------------------------------------------
  function renderDetail() {
    clear(detail);
    const cur = currentRules();
    if (!cur) {
      detail.appendChild(h('div.tbl-empty', h('p', { text: '左からルールを選んでください。' })));
      return;
    }
    const { preset, rules } = cur;
    let diff = [];
    try { diff = diffFromBaseline(rules) || []; } catch { diff = []; }

    detail.appendChild(h('div.tbl-detail-head',
      h('div.row.gap-8',
        chip(rules.game.players === 3 ? '三麻' : '四麻', 'felt'),
        chip(preset.category || '自作'),
        h('div.grow'),
        h('a.tbl-tune', { href: `#/editor?preset=${encodeURIComponent(preset.id)}` },
          icon('settings', 14), h('span', { text: '細かく設定' }))),
      h('h2.tbl-detail-name', { text: preset.name }),
      h('p.tbl-detail-sum', { text: shortSummary(rules) })));

    const tags = (preset.tags || []).slice(0, 5);
    if (tags.length) {
      detail.appendChild(h('div.row.gap-8.wrapflex.tbl-tags', tags.map((t) => ruleChip(t))));
    }

    const box = h('div.tbl-tweaks');
    for (const t of TWEAKS) {
      const value = (t.key in S.tweak) ? S.tweak[t.key] : t.read(rules);
      if (t.kind === 'choice') {
        box.appendChild(h('div.tbl-tweak',
          h('div.tbl-tweak-label', { text: t.label }),
          h('div.seg', t.options.map((o) => {
            const b = h(`button.seg-btn${o.v === value ? '.on' : ''}`, { type: 'button', text: o.label });
            b.addEventListener('click', () => { S.tweak[t.key] = o.v; renderDetail(); });
            return b;
          }))));
      } else {
        const sw = h(`button.sw${value ? '.on' : ''}`, {
          type: 'button', 'aria-pressed': String(!!value), 'aria-label': t.label,
        });
        sw.addEventListener('click', () => { S.tweak[t.key] = !value; renderDetail(); });
        box.appendChild(h('div.tbl-tweak',
          h('div.grow',
            h('div.tbl-tweak-label', { text: t.label }),
            t.desc ? h('div.tbl-tweak-desc', { text: t.desc }) : null),
          sw));
      }
    }
    detail.appendChild(box);

    if (diff.length) {
      const items = diff.slice(0, 3).map((d) => h('li',
        h('span.tbl-diff-label', { text: d.label }),
        h('span.tbl-diff-to', { text: d.to })));
      detail.appendChild(h('div.tbl-diff',
        h('div.tbl-diff-head', markIcon('cloud', 15),
          h('span', { text: `一般的なルールとの違い ${diff.length}件` })),
        h('ul.tbl-diff-list', items,
          diff.length > 3 ? h('li.muted', { text: `ほか${diff.length - 3}件` }) : null)));
    }

    const start = h('button.btn.btn-primary.btn-lg.tbl-start', { type: 'button' },
      markIcon('play', 18), h('span', { text: 'この卓ではじめる' }));
    start.addEventListener('click', startTable);
    detail.appendChild(h('div.tbl-cta', start,
      h('p.tbl-cta-note', { text: 'CPU3人との対局です。いつでもやめられます。' })));
  }

  // -------------------------------------------------------------------------
  function startTable() {
    const cur = currentRules();
    if (!cur) return;
    const { preset, patch } = cur;
    let id = preset.id;
    if (Object.keys(patch).length) {
      // つまみを触った卓は、その場かぎりのルールとして保存してから開く
      saveCustomPreset({
        id: TMP_ID,
        name: `${preset.name}（この卓の設定）`,
        category: '自作',
        description: `${preset.name} をこの画面で少し変えた設定です。`,
        tags: preset.tags || [],
        rules: deepMerge(preset.rules, patch),
      });
      id = TMP_ID;
    }
    rememberTable({ presetId: id, name: preset.name });
    location.hash = `#/play?preset=${encodeURIComponent(id)}`;
  }

  // -------------------------------------------------------------------------
  /** 人数トグルとカテゴリの見た目を状態に合わせる */
  function renderChrome() {
    clear(seats);
    for (const n of [4, 3]) {
      const b = h(`button.seg-btn${n === S.players ? '.on' : ''}`, {
        type: 'button', text: n === 4 ? '四人打ち' : '三人打ち', 'aria-pressed': String(n === S.players),
      });
      b.addEventListener('click', () => {
        S.players = n;
        S.presetId = null;
        S.tweak = {};
        renderChrome();
        renderList();
        renderDetail();
      });
      seats.appendChild(b);
    }
    clear(cats);
    for (const c of CATS) {
      const b = h(`button.chip.chip-btn${c === S.cat ? '.on' : ''}`, { type: 'button', text: c });
      b.addEventListener('click', () => {
        S.cat = c;
        renderChrome();
        renderList();
        renderDetail();
      });
      cats.appendChild(b);
    }
  }

  input.addEventListener('input', () => { S.q = input.value; renderList(); renderDetail(); });

  clear(root);
  root.appendChild(h('section.tbl-screen',
    h('div.tbl-left',
      h('div.tbl-left-head',
        h('div.row.gap-12',
          h('a.tbl-back', { href: '#/' }, icon('arrow', 15), h('span', { text: 'もどる' })),
          h('div.grow'),
          countLabel),
        h('h1.tbl-title', { text: '卓を立てる' }),
        seats,
        h('div.tbl-search', h('span.tbl-search-icon', icon('search', 15)), input),
        cats),
      list),
    h('aside.tbl-right', detail)));

  document.body.classList.add('no-scroll');
  renderChrome();
  renderList();
  renderDetail();

  return () => { document.body.classList.remove('no-scroll'); };
}
