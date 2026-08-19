/**
 * app.js - ルーター＋ホーム／店舗検索／店舗ページ／ルール比較
 */
import { STORES, FILTERS, getStore } from '../../src/data/stores.js';
import { ALL_PRESETS, PRESETS } from '../../src/rules/presets.js';
import { lookupPreset, allPresetsWithCustom } from './custom.js';
import { resolveRules } from '../../src/rules/defaults.js';
import { explainRules, diffFromBaseline, shortSummary } from '../../src/rules/explain.js';
import { validateRules } from '../../src/rules/validator.js';
import { h, clear, fmt, icon, stars, chip, sectionHead, toggleRow, notice, tileEl } from './ui.js';
import { renderGame } from './game.js';
import { renderEditor } from './editor.js';

const app = document.getElementById('app');
let cleanup = null;
const rulesOf = (presetId) => resolveRules(lookupPreset(presetId).rules);

// ---------------------------------------------------------------------------
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = {};
  for (const kv of (qs || '').split('&')) {
    if (!kv) continue;
    const [k, v] = kv.split('=');
    params[decodeURIComponent(k)] = decodeURIComponent(v || '');
  }
  return { route: parts[0] || 'home', arg: parts[1] || null, params };
}

function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  const { route: r, arg, params } = parseHash();
  document.querySelectorAll('#navLinks a').forEach((a) => a.classList.toggle('on', a.dataset.route === r));
  window.scrollTo(0, 0);
  clear(app);
  switch (r) {
    case 'stores': viewStores(params); break;
    case 'store': viewStore(arg); break;
    case 'compare': viewCompare(params); break;
    case 'play': cleanup = renderGame(app, params); break;
    case 'editor': cleanup = renderEditor(app, params); break;
    default: viewHome();
  }
}
window.addEventListener('hashchange', route);
route();

// ---------------------------------------------------------------------------
// ホーム
// ---------------------------------------------------------------------------
function viewHome() {
  app.appendChild(h('section.hero',
    h('div.wrap',
      h('div.eyebrow.reveal', { text: 'ONLINE BRANCH FOR MAHJONG PARLORS' }),
      h('h1.reveal', { style: { marginTop: '10px' } }, '打ってから、行く。'),
      h('p.reveal-2', { style: { marginTop: '16px', fontSize: '16px' } },
        'Houseruleは、全国の雀荘がそれぞれの「オンライン支店」を持つためのプラットフォームです。'
        + '店のハウスルールをそのまま読み込んだCPU対戦で、ルールと空気を体験してから来店できます。'),
      h('div.row.gap-12.wrapflex.reveal-3', { style: { marginTop: '26px' } },
        h('a.btn.btn-primary.btn-lg', { href: '#/stores' }, 'ハウスルールを体験する', icon('arrow', 16)),
        h('a.btn.btn-ghost.btn-lg', { href: '#/play?preset=standard4', text: '一般四麻ですぐ打つ' })))));

  const sec = h('section.section', h('div.wrap'));
  const wrap = sec.firstChild;
  wrap.appendChild(sectionHead('01', 'デモ店舗', '架空の3店舗。それぞれ実際に打てるハウスルールが設定されています。'));
  wrap.appendChild(storeGrid(STORES));

  wrap.appendChild(h('div.rule-line'));
  wrap.appendChild(sectionHead('02', 'ルールプリセット', '店舗以外の系統ルールもそのまま試せます。設定を変えるとCPUの挙動・点数・祝儀まで変わります。'));
  const grid = h('div.store-grid');
  for (const p of PRESETS) {
    const r = resolveRules(p.rules);
    grid.appendChild(h('div.card.card-pad',
      h('div.row.gap-8', { style: { marginBottom: '8px' } }, chip(p.category, 'felt'), h('div.grow'), chip(`${r.game.players === 3 ? '三麻' : '四麻'}`)),
      h('h3', { style: { fontSize: '16px' }, text: p.name }),
      h('p.tiny.muted', { style: { margin: '6px 0 12px' }, text: p.description }),
      h('div.row.gap-8.wrapflex', { style: { marginBottom: '14px' } }, p.tags.slice(0, 4).map((t) => chip(t))),
      h('div.row.gap-8',
        h('a.btn.btn-sm.btn-primary', { href: `#/play?preset=${p.id}`, text: 'このルールで遊ぶ' }),
        h('a.btn.btn-sm.btn-ghost', { href: `#/editor?preset=${p.id}`, text: '設定を見る' }))));
  }
  wrap.appendChild(grid);

  wrap.appendChild(h('div.rule-line'));
  wrap.appendChild(h('div.cta-band',
    h('div',
      h('h3', { text: '「検索できる」で終わらせない。' }),
      h('p', { text: 'ルールを読むだけでは不安は消えません。Houseruleは、その店のルールで実際に1半荘打てるところまでを入口にします。' })),
    h('a.btn.btn-brass.btn-lg', { href: '#/store/goto_kan', text: '五等サンマ館を体験する' })));
  app.appendChild(sec);
  app.appendChild(footer());
}

function footer() {
  return h('footer.footer', h('div.wrap',
    h('div', { text: 'Houserule デモ版 ／ 実在店舗のハウスルールを転載していない架空データです。' }),
    h('div', { text: 'ゲーム内ポイント（BP）はすべて非換金・ゲーム内専用です。賭博性のある設計は含みません（法務判断は要専門家確認）。' })));
}

// ---------------------------------------------------------------------------
// 店舗一覧・検索
// ---------------------------------------------------------------------------
function storeGrid(list) {
  const grid = h('div.store-grid');
  for (const s of list) {
    const r = rulesOf(s.presetId);
    grid.appendChild(h('a.card', { href: `#/store/${s.id}`, style: { display: 'block' } },
      h('div.store-photo', { style: { '--hue': String(s.photo.hue) } }, icon(s.photo.icon, 52)),
      h('div.card-pad',
        h('div.row.gap-8', { style: { marginBottom: '6px' } },
          chip(r.game.players === 3 ? '三麻' : '四麻', 'felt'), chip(s.style), h('div.grow'),
          h('div.tiny.muted', { text: s.area })),
        h('h3.store-name', { text: s.name }),
        h('p.tiny.muted', { style: { margin: '4px 0 10px' }, text: s.catch }),
        h('div.row.gap-8', { style: { marginBottom: '10px' } },
          h('div.tiny.muted', { text: '初心者歓迎度' }), stars(s.beginner)),
        h('div.row.gap-4.wrapflex', s.ruleHighlights.slice(0, 5).map((t) => chip(t, 'brass'))),
        h('div.tiny.muted', { style: { marginTop: '10px' }, text: shortSummary(r) }))));
  }
  return grid;
}

function viewStores(params) {
  const state = { active: new Set((params.f || '').split(',').filter(Boolean)) };
  const sec = h('section.section', h('div.wrap'));
  const wrap = sec.firstChild;
  wrap.appendChild(sectionHead('01', '店舗をさがす', 'ルール条件で絞り込めます。ヒットした店舗はそのルールでそのまま打てます。'));
  const filterBox = h('div.card.card-pad', { style: { marginBottom: '22px' } });
  const result = h('div');

  const render = () => {
    clear(filterBox);
    for (const f of FILTERS) {
      const row = h('div.row.gap-8.wrapflex', { style: { marginBottom: '10px' } },
        h('div.tiny.muted', { style: { width: '84px', flex: '0 0 auto' }, text: f.label }));
      for (const o of f.options) {
        const on = state.active.has(o.value);
        const c = h('span.chip.chip-btn', { class: on ? 'on' : '', text: o.value });
        c.addEventListener('click', () => {
          if (on) state.active.delete(o.value); else state.active.add(o.value);
          render();
        });
        row.appendChild(c);
      }
      filterBox.appendChild(row);
    }
    if (state.active.size) {
      const clearBtn = h('button.btn.btn-sm.btn-ghost', { text: '条件をクリア' });
      clearBtn.addEventListener('click', () => { state.active.clear(); render(); });
      filterBox.appendChild(clearBtn);
    }
    const hits = STORES.filter((s) => {
      const r = rulesOf(s.presetId);
      for (const f of FILTERS) {
        const picked = f.options.filter((o) => state.active.has(o.value));
        if (!picked.length) continue;
        if (!picked.some((o) => o.test(s, r))) return false;
      }
      return true;
    });
    clear(result);
    result.appendChild(h('div.row.gap-8', { style: { marginBottom: '12px' } },
      h('div.label', { text: `${hits.length}件` }),
      h('div.grow'),
      h('a.btn.btn-sm.btn-ghost', { href: '#/compare', text: '2店舗を比較する' })));
    result.appendChild(hits.length ? storeGrid(hits) : h('div.card.card-pad', { text: '条件に合う店舗がありません。条件を減らしてください。' }));
  };
  render();
  wrap.appendChild(filterBox);
  wrap.appendChild(result);
  app.appendChild(sec);
  app.appendChild(footer());
}

// ---------------------------------------------------------------------------
// 店舗ページ
// ---------------------------------------------------------------------------
function viewStore(id) {
  const s = getStore(id);
  const r = rulesOf(s.presetId);
  const v = validateRules(r);

  app.appendChild(h('section', { style: { background: 'var(--paper-2)', borderBottom: '1px solid var(--line)' } },
    h('div.store-photo', { style: { '--hue': String(s.photo.hue), height: '190px' } }, icon(s.photo.icon, 74)),
    h('div.wrap', { style: { padding: '24px 0 28px' } },
      h('div.row.gap-8.wrapflex', { style: { marginBottom: '8px' } },
        chip(r.game.players === 3 ? '三麻' : '四麻', 'felt'), chip(s.style), chip(s.smoking),
        h('div.grow'), h('a.btn.btn-sm.btn-ghost', { href: '#/stores', text: '← 一覧' })),
      h('h1', { style: { fontSize: 'clamp(24px,4vw,38px)' }, text: s.name }),
      h('p.muted', { style: { marginTop: '8px' }, text: s.catch }),
      h('div.row.gap-24.wrapflex', { style: { marginTop: '16px' } },
        h('div.row.gap-8', icon('pin', 15), h('span.tiny', { text: `${s.area}／${s.access}` })),
        h('div.row.gap-8', icon('clock', 15), h('span.tiny', { text: s.hours })),
        h('div.row.gap-8', icon('smoke', 15), h('span.tiny', { text: s.smoking })),
        h('div.row.gap-8', h('span.tiny.muted', { text: '初心者歓迎度' }), stars(s.beginner))))));

  const sec = h('section.section', h('div.wrap'));
  const wrap = sec.firstChild;

  // 主役CTA
  wrap.appendChild(h('div.cta-band', { style: { marginBottom: '34px' } },
    h('div',
      h('h3', { text: 'このルールで遊んでみる' }),
      h('p', { text: `${s.name}のハウスルールをそのまま読み込み、CPU3人と対戦できます。来店前に感触を確かめてください。` })),
    h('div.row.gap-12.wrapflex',
      h('a.btn.btn-brass.btn-lg', { href: `#/play?preset=${s.presetId}` }, icon('play', 15), 'このルールで遊んでみる'),
      h('a.btn.btn-ghost.btn-lg', { href: `#/editor?preset=${s.presetId}`, style: { color: '#f1ebde', borderColor: 'rgba(240,227,200,.4)' }, text: 'ルール設定を見る' }))));

  // ルール説明（全文／差分）
  wrap.appendChild(sectionHead('01', 'ハウスルール', '設定データから自動生成しています。編集すれば説明文も対局挙動も同時に変わります。'));
  const mode = { v: 'diff' };
  const holder = h('div');
  const renderExplain = () => {
    clear(holder);
    holder.appendChild(h('div.row.gap-12', { style: { marginBottom: '18px' } },
      toggleRow([{ label: '一般ルールとの差分', value: 'diff' }, { label: 'ルール全文', value: 'full' }], mode.v, (val) => { mode.v = val; renderExplain(); }),
      h('div.grow'),
      h('div.tiny.muted', { text: shortSummary(r) })));
    if (mode.v === 'diff') {
      const diff = diffFromBaseline(r);
      const table = h('table.diff-table', h('tbody',
        diff.map((d) => h('tr',
          h('th', { text: d.label }),
          h('td', h('span.diff-from', { text: d.from }), h('span', { text: ' → ' }), h('span.diff-to', { text: d.to }))))));
      holder.appendChild(h('div.card.card-pad',
        h('p.tiny.muted', { style: { marginTop: 0 } }, `一般${r.game.players === 3 ? '三麻' : '四麻'}と違うのは次の${diff.length}項目だけです。`),
        table));
    } else {
      const box = h('div.card.card-pad');
      for (const sec2 of explainRules(r)) {
        box.appendChild(h('div.explain-sec',
          h('h4', { text: sec2.title }),
          h('ul', sec2.lines.map((l) => h('li', { text: l })))));
      }
      holder.appendChild(box);
    }
  };
  renderExplain();
  wrap.appendChild(holder);
  if (v.issues.some((i) => i.severity !== 'info')) {
    wrap.appendChild(h('div', { style: { marginTop: '14px' } },
      v.issues.filter((i) => i.severity !== 'info').map((i) => h(`div.issue.issue-${i.severity}`,
        h('div', h('b', { text: i.severity === 'error' ? '設定エラー' : '注意' }), h('span', { text: i.message }))))));
  }

  // 特殊牌のビジュアル
  const sp = r.specialTiles || [];
  if (sp.length || r.local.shiroPocchi.enabled || r.flowers.enabled) {
    wrap.appendChild(h('div.rule-line'));
    wrap.appendChild(sectionHead('02', 'この店の特別な牌', '実際の対局でも同じ見た目で登場します。'));
    const row = h('div.row.gap-24.wrapflex');
    const cell = (info, name, desc, color) => h('div', { style: { width: '150px' } },
      h('div.row.center', { style: { marginBottom: '8px' } }, tileEl(info, { size: 'lg', spColor: color })),
      h('div.tiny', { style: { textAlign: 'center', fontWeight: '600' }, text: name }),
      h('div.tiny.muted', { style: { textAlign: 'center' }, text: desc }));
    if (r.local.shiroPocchi.enabled) {
      row.appendChild(cell({ t: 31, dot: true, name: '白ポッチ' }, `白ポッチ ×${r.local.shiroPocchi.count}`,
        r.local.shiroPocchi.mode === 'bonus' ? 'ボーナス専用' : 'オールマイティ＋BP'));
    }
    for (const d of sp) {
      let t = 0;
      try { t = (codeToTypeLite(d.tile)); } catch { t = 0; }
      row.appendChild(cell({ t, sp: d.id, red: d.color === 'red', gold: d.color === 'gold', name: d.name }, d.name,
        (d.effects || []).map((e) => ({ dora: `ドラ+${e.value || 1}`, han: `${e.value || 1}翻追加`, bonus: `+${e.value || 1}BP`, almighty: 'オールマイティ', rankUp: '打点UP' }[e.type] || e.type)).join('・'), d.color));
    }
    if (r.flowers.enabled) {
      for (const [i, key] of (r.flowers.tiles || []).entries()) {
        const label = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' }[key];
        const effs = (r.flowers.effects[key] || []).map((e) => ({
          bonusPerTile: `1枚あたり+${e.value || 1}BP`, rankUp: `打点${e.value || 1}ランクUP`,
          doubleDoraFives: '5牌がダブドラ', alice: `アリス（×${e.value || 1}）`,
        }[e.type] || e.type)).join('・');
        row.appendChild(cell({ t: 34 + i, flower: key, name: label }, `華牌「${label}」`, effs));
      }
    }
    wrap.appendChild(row);
  }

  // 店舗情報
  wrap.appendChild(h('div.rule-line'));
  wrap.appendChild(sectionHead('03', '店舗情報', ''));
  wrap.appendChild(h('div.store-grid',
    h('div.card.card-pad',
      h('h4', { style: { marginBottom: '10px' } }, '基本情報'),
      h('dl.kv',
        h('dt', { text: '住所' }), h('dd', { text: s.address }),
        h('dt', { text: 'アクセス' }), h('dd', { text: s.access }),
        h('dt', { text: '営業時間' }), h('dd', { text: s.hours }),
        h('dt', { text: '卓' }), h('dd', { text: s.tables }),
        h('dt', { text: '喫煙' }), h('dd', { text: s.smoking }),
        h('dt', { text: 'レート' }), h('dd', { text: `${s.style}（金銭のやり取りなし）` }),
        h('dt', { text: 'SNS' }), h('dd', { text: s.sns.x }))),
    h('div.card.card-pad',
      h('h4', { style: { marginBottom: '10px' } }, '料金'),
      h('dl.kv', s.priceLines.flatMap((p) => [h('dt', { text: p.label }), h('dd.num', { text: p.value })])),
      h('div.tiny.muted', { style: { marginTop: '10px' }, text: s.beginnerNote })),
    h('div.card.card-pad',
      h('h4', { style: { marginBottom: '10px' } }, '雰囲気'),
      h('div.row.gap-4.wrapflex', s.mood.map((m) => chip(m))),
      h('h4', { style: { margin: '16px 0 8px' } }, 'スタッフ'),
      h('div.mini-list', s.staff.map((st) => h('div.mini-item',
        h('div.seat-wind', { text: st.name[0] }),
        h('div.grow', h('div.tiny', { style: { fontWeight: '600' }, text: `${st.name}（${st.role}）` }),
          h('div.tiny.muted', { text: st.word }))))))));

  // イベント・来店
  wrap.appendChild(h('div.rule-line'));
  wrap.appendChild(sectionHead('04', 'イベントと来店', 'QRチェックインは非換金の記録のみ。景品・金銭とは結び付けません。'));
  wrap.appendChild(h('div.store-grid',
    h('div.card.card-pad',
      h('h4', { style: { marginBottom: '10px' } }, 'イベント'),
      h('div.mini-list', s.events.map((e) => h('div.mini-item',
        h('div.grow', h('div.tiny', { style: { fontWeight: '600' }, text: `${e.date}　${e.title}` }),
          h('div.tiny.muted', { text: e.body }))))),
      (r.events || []).filter((e) => e.enabled !== false).length ? h('div',
        h('h4', { style: { margin: '16px 0 8px' } }, 'イベント卓を体験する'),
        h('p.tiny.muted', { style: { marginTop: '0' }, text: '通常ルールを部分的に上書きした特別卓です。そのまま打てます。' }),
        h('div.mini-list', (r.events || []).filter((e) => e.enabled !== false).map((e) => h('div.mini-item',
          h('div.grow',
            h('div.tiny', { style: { fontWeight: '600' }, text: e.name }),
            h('div.tiny.muted', { text: e.note || '' })),
          h('a.btn.btn-sm.btn-brass', {
            href: `#/play?preset=${s.presetId}&event=${e.id}`, text: 'この卓で遊ぶ',
          }))))) : null),
    h('div.card.card-pad',
      h('h4', { style: { marginBottom: '10px' } }, '来店（構想）'),
      h('div.row.gap-12', icon('qr', 34), h('div.tiny.muted', { text: '店頭QRで来店スタンプ・称号・来店回数を記録します（MVPでは記録のみ・報酬なし）。' })),
      h('button.btn.btn-ghost.btn-sm', { style: { marginTop: '12px' }, text: 'チェックイン（デモ）', on: { click: (ev) => { ev.target.textContent = 'チェックイン済み（デモ表示）'; ev.target.disabled = true; } } }))));

  wrap.appendChild(h('div', { style: { marginTop: '30px' } },
    h('a.btn.btn-primary.btn-lg.btn-block', { href: `#/play?preset=${s.presetId}` }, icon('play', 15), 'このルールで遊んでみる')));
  app.appendChild(sec);
  app.appendChild(footer());
}

// 牌コード→タイプ（店舗ページの特殊牌表示用）
function codeToTypeLite(code) {
  const m = /^([0-9])([mpszf])$/.exec(code);
  if (!m) return 0;
  let n = Number(m[1]);
  const s = m[2];
  if (s === 'f') return 33 + n;
  if (s === 'z') return 26 + n;
  if (n === 0) n = 5;
  return { m: 0, p: 9, s: 18 }[s] + n - 1;
}

// ---------------------------------------------------------------------------
// ルール比較
// ---------------------------------------------------------------------------
function viewCompare(params) {
  const list = allPresetsWithCustom();
  const state = { a: params.a || 'store_yonma_kan', b: params.b || 'store_goto_kan' };
  const sec = h('section.section', h('div.wrap'));
  const wrap = sec.firstChild;
  wrap.appendChild(sectionHead('01', 'ルール比較', '2つのルールを並べて、違う項目だけを見つけられます。'));
  const holder = h('div');

  const sel = (key) => {
    const s = h('select');
    for (const p of list) s.appendChild(h('option', { value: p.id, text: p.name, selected: state[key] === p.id }));
    s.addEventListener('change', () => { state[key] = s.value; render(); });
    return s;
  };
  const render = () => {
    clear(holder);
    const ra = rulesOf(state.a);
    const rb = rulesOf(state.b);
    const da = diffFromBaseline(ra);
    const db = diffFromBaseline(rb);
    const labels = [...new Set([...da.map((d) => d.label), ...db.map((d) => d.label)])];
    const find = (list, label) => (list.find((d) => d.label === label) || null);
    holder.appendChild(h('div.card.card-pad',
      h('table.diff-table', h('tbody',
        h('tr', h('th', { text: '項目' }),
          h('td', { style: { fontWeight: '700' }, text: lookupPreset(state.a).name }),
          h('td', { style: { fontWeight: '700' }, text: lookupPreset(state.b).name })),
        labels.map((label) => {
          const x = find(da, label); const y = find(db, label);
          const same = (x ? x.to : '一般ルール') === (y ? y.to : '一般ルール');
          return h('tr', { style: same ? {} : { background: 'rgba(165,129,60,.06)' } },
            h('th', { text: label }),
            h('td', { text: x ? x.to : '一般ルールどおり' }),
            h('td', { text: y ? y.to : '一般ルールどおり' }));
        })))));
    holder.appendChild(h('div.row.gap-12.wrapflex', { style: { marginTop: '18px' } },
      h('a.btn.btn-primary', { href: `#/play?preset=${state.a}`, text: `${lookupPreset(state.a).name}で遊ぶ` }),
      h('a.btn.btn-ghost', { href: `#/play?preset=${state.b}`, text: `${lookupPreset(state.b).name}で遊ぶ` })));
  };
  wrap.appendChild(h('div.row.gap-12.wrapflex', { style: { marginBottom: '18px' } },
    h('div', { style: { minWidth: '240px' } }, h('div.label', { text: '左' }), sel('a')),
    h('div', { style: { minWidth: '240px' } }, h('div.label', { text: '右' }), sel('b'))));
  render();
  wrap.appendChild(holder);
  app.appendChild(sec);
  app.appendChild(footer());
}
