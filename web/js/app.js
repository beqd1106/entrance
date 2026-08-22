/**
 * app.js - ルーター＋ホーム／店舗検索／店舗ページ／ルール比較
 */
import { STORES, FILTERS, getStore } from '../../src/data/stores.js';
import { ALL_PRESETS, PRESETS } from '../../src/rules/presets.js';
import { lookupPreset, allPresetsWithCustom } from './custom.js';
import { resolveRules } from '../../src/rules/defaults.js';
import { explainRules, explainForBeginners, diffFromBaseline, shortSummary } from '../../src/rules/explain.js';
import { validateRules } from '../../src/rules/validator.js';
import {
  h, clear, fmt, icon, stars, chip, ruleChip, toneOf, sectionHead, toggleRow, notice, tileEl, photoImg,
} from './ui.js';
import { renderGame } from './game.js';
import { renderEditor } from './editor.js';
import { renderDashboard, recordCheckin } from './dashboard.js';
import { showOnboarding } from './onboarding.js';
import { artwork, emptyState } from './artwork.js';
import { renderStoreEdit, resolveStore, primeServerStores } from './storeedit.js';
import { renderManual } from './manual.js';
import { renderHub } from './hub.js';
import { renderTable } from './table.js';
import { matchText, presetHaystack, storeHaystack, searchField } from './search.js';
import {
  getCard, hasCard, allCards, couponState, couponProgress, useCoupon, statsOf,
} from './member.js';

const app = document.getElementById('app');
// iPhoneアプリの中（独自スキームで配信）だけに効かせたい調整のための目印
if (location.protocol === 'houserule:') document.body.classList.add('is-app');
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
  // 画面ごとの body 状態は、必ずここで一度まっさらに戻す
  document.body.classList.remove('op-mode', 'no-scroll');
  clear(app);
  switch (r) {
    case 'stores': viewStores(params); break;
    case 'store': viewStore(arg); break;
    case 'search': viewSearch(params); break;
    case 'card': viewCard(arg); break;
    case 'cards': viewCards(); break;
    case 'compare': viewCompare(params); break;
    case 'table': cleanup = renderTable(app, params); break;
    case 'play': cleanup = renderGame(app, params); break;
    case 'editor': cleanup = renderEditor(app, params); break;
    case 'dashboard': cleanup = renderDashboard(app, params); break;
    case 'store-edit': cleanup = renderStoreEdit(app, params); break;
    case 'manual': cleanup = renderManual(app); app.appendChild(footer()); break;
    case 'about': viewAbout(); break;
    default: renderHub(app);
  }
}
window.addEventListener('hashchange', route);
route();

// サーバに店舗情報があれば読み込んで描き直す。無ければ何も起きない。
primeServerStores();
window.addEventListener('houserule:stores-updated', () => {
  const r = parseHash().route;
  if (['home', 'stores', 'store', 'dashboard'].includes(r)) route();
});

// 案内は最初の画面をふさがない。OPの「はじめての方へ」から開く。
// （初回だけ自動で出す挙動は、操作の入口を隠してしまうのでやめた）

// ---------------------------------------------------------------------------
// ホーム
// ---------------------------------------------------------------------------
/** ヒーローに置く牌（この店らしさを一目で見せる） */
function heroTiles() {
  const set = [
    { t: 22, blue: true, name: '青5索' },
    { t: 31, dot: true, name: '白ポッチ' },
    { t: 34, flower: 'spring', name: '春' },
    { t: 13, red: true, name: '赤5筒' },
    { t: 30, name: '北' },
  ];
  return h('div.hero-tiles', { 'aria-hidden': 'true' },
    set.map((info, i) => h('div.hero-tile', { style: { '--i': String(i) } },
      tileEl(info, { size: 'lg' }))));
}

function viewAbout() {
  app.appendChild(h('section.hero',
    h('div.wrap.hero-inner',
      h('div.hero-copy',
        h('div.eyebrow.reveal', { text: 'ONLINE BRANCH FOR MAHJONG PARLORS' }),
        h('h1.reveal', { style: { marginTop: '10px' } }, '打ってから、', h('span.hl', '行く。')),
        h('p.reveal-2', { style: { marginTop: '16px', fontSize: '16px' } },
          '白ポッチ、アリス、華牌。お店ごとに違うハウスルールを、'
          + '行く前にそのまま体験できます。CPU3人との対局で、知らないルールを気兼ねなく試してから来店を。'),
        h('div.row.gap-12.wrapflex.reveal-3', { style: { marginTop: '26px' } },
        h('a.btn.btn-primary.btn-lg', { href: '#/stores' }, 'ハウスルールを体験する', icon('arrow', 16)),
        h('a.btn.btn-ghost.btn-lg', { href: '#/play?preset=standard4', text: '一般四麻ですぐ打つ' }),
        (() => {
          const b = h('button.btn.btn-ghost.btn-lg', { text: 'はじめての方へ' });
          b.addEventListener('click', () => showOnboarding());
          return b;
        })())),
      heroTiles())));

  const sec = h('section.section', h('div.wrap'));
  const wrap = sec.firstChild;
  // ルールから探す（このサービス独自の入口。地域より先に置く）
  wrap.appendChild(sectionHead('01', 'ルールから探す', '気になる特殊ルールを選ぶと、それがある店だけが並びます。'));
  const quick = ['白ポッチ', 'アリス', '華牌', '五等サンマ系', '特殊牌', '割れ目', 'オープンリーチ', 'サイコロチャンス', '初心者歓迎', '三麻', '四麻'];
  wrap.appendChild(h('div.row.gap-8.wrapflex', { style: { marginBottom: '34px' } },
    quick.map((t) => h(`a.chip.chip-btn.chip-lg.tag-${toneOf(t)}`, { href: `#/stores?f=${encodeURIComponent(t)}`, text: t }))));
  wrap.appendChild(h('div.rule-line'));
  wrap.appendChild(sectionHead('02', 'デモ店舗', '架空の3店舗。それぞれ実際に打てるハウスルールが設定されています。'));
  wrap.appendChild(storeGrid(STORES));

  wrap.appendChild(h('div.rule-line'));
  wrap.appendChild(sectionHead('03', 'ルールプリセット', '店舗以外の系統ルールもそのまま試せます。設定を変えるとCPUの挙動・点数・祝儀まで変わります。'));
  wrap.appendChild(h('div.store-grid', PRESETS.map(presetCard)));

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
    h('div.row.gap-16.wrapflex', { style: { marginBottom: '10px' } },
      h('a.footer-link', { href: '#/manual' }, icon('book', 13), '使い方'),
      h('a.footer-link', { href: '#/stores', text: '店舗をさがす' }),
      h('a.footer-link', { href: '#/dashboard', text: '店舗の方へ' })),
    h('div', { text: 'Houserule デモ版 ／ 実在店舗のハウスルールを転載していない架空データです。' }),
    h('div', { text: 'ゲーム内ポイント（BP）はすべて非換金・ゲーム内専用です。賭博性のある設計は含みません（法務判断は要専門家確認）。' })));
}

// ---------------------------------------------------------------------------
// 店舗一覧・検索
// ---------------------------------------------------------------------------
/**
 * 店舗写真の出しどころ。
 * 同梱の写真を優先する。サーバの写真は期限付きURLで、
 * 取れないときに絵が消えるため、用意がある店では使わない。
 */
function storePhoto(s) {
  return s.photoFile || s.photoUrl || '';
}

function storeGrid(list) {
  const grid = h('div.store-grid');
  for (const raw of list) {
    const s = resolveStore(raw.id);
    const r = rulesOf(s.presetId);
    grid.appendChild(h('a.card.store-card', { href: `#/store/${s.id}`, style: { '--hue': String(s.photo.hue) } },
      h('div.store-photo', { style: { '--hue': String(s.photo.hue) } },
        // 写真があれば写真を、無ければ色とマークを使う（どちらでも成立させる）
        storePhoto(s) ? photoImg(storePhoto(s), { attrs: { loading: 'lazy' } }) : icon(s.photo.icon, 52),
        h('div.store-photo-badges',
          chip(r.game.players === 3 ? '三麻' : '四麻'),
          chip(s.style)),
        // ルールから選んだ「顔になる牌」。店舗ページと同じ牌が並ぶ
        h('div.card-tiles', { 'aria-hidden': 'true' },
          signatureTiles(r).slice(0, 3).map((info, i) =>
            h('div.card-tile', { style: { '--i': String(i) } }, tileEl(info, { size: 'md' }))))),
      h('div.card-pad',
        h('div.row.gap-8', { style: { marginBottom: '4px' } },
          h('div.store-area', icon('pin', 12), h('span', { text: s.area })),
          h('div.grow'),
          h('div.row.gap-4', h('span.tiny.muted', { text: '初心者' }), stars(s.beginner))),
        h('h3.store-name', { text: s.name }),
        h('p.store-catch', { text: s.catch }),
        h('div.row.gap-4.wrapflex', { style: { marginTop: '12px' } },
          s.ruleHighlights.slice(0, 5).map((t) => ruleChip(t))),
        h('div.store-foot',
          h('span.tiny.muted', { text: shortSummary(r) }),
          h('span.store-cta', '遊んでみる', icon('arrow', 14))))));
  }
  return grid;
}

function viewStores(params) {
  const state = {
    active: new Set((params.f || '').split(',').filter(Boolean)),
    q: params.q || '',
  };
  const sec = h('section.section', h('div.wrap'));
  const wrap = sec.firstChild;
  wrap.appendChild(sectionHead('01', '店舗をさがす', '言葉でも、ルール条件でも探せます。見つけた店はそのルールでそのまま打てます。'));

  const filterBox = h('div.card.card-pad', { style: { marginBottom: '22px' } });
  const result = h('div');

  const syncHash = () => {
    const qs = [];
    if (state.active.size) qs.push(`f=${encodeURIComponent([...state.active].join(','))}`);
    if (state.q.trim()) qs.push(`q=${encodeURIComponent(state.q.trim())}`);
    const next = `#/stores${qs.length ? `?${qs.join('&')}` : ''}`;
    // ここでルーターを走らせると入力が途切れるので、履歴だけ差し替える
    try { history.replaceState(null, '', next); } catch { /* 置き換えられなくても検索は動く */ }
  };

  // 言葉で探す（店名・エリア・雰囲気・ルールの特徴まで対象）
  const field = searchField({
    id: 'storeSearch',
    value: state.q,
    placeholder: '店名・エリア・ルールで探す（例：新宿、白ポッチ、禁煙）',
    help: '入力するたびに絞り込みます。ひらがな・カタカナはどちらでも構いません。',
    onInput: (v) => { state.q = v; syncHash(); renderResult(); },
  });

  const renderFilters = () => {
    clear(filterBox);
    filterBox.appendChild(field);
    filterBox.appendChild(h('div.filter-sep'));
    for (const f of FILTERS) {
      const holder = h('div.row.gap-8.wrapflex.grow');
      for (const o of f.options) {
        const on = state.active.has(o.value);
        const c = h(`span.chip.chip-btn.tag-${toneOf(o.value)}${on ? '.on' : ''}`, { text: o.value });
        c.addEventListener('click', () => {
          if (on) state.active.delete(o.value); else state.active.add(o.value);
          syncHash();
          renderFilters();
          renderResult();
        });
        holder.appendChild(c);
      }
      filterBox.appendChild(h('div.filter-row', h('div.filter-label', { text: f.label }), holder));
    }
    if (state.active.size || state.q.trim()) {
      const clearBtn = h('button.btn.btn-sm.btn-ghost', { text: '条件をすべて外す' });
      clearBtn.addEventListener('click', resetAll);
      filterBox.appendChild(h('div.row', { style: { marginTop: '12px' } }, clearBtn));
    }
  };

  function resetAll() {
    state.active.clear();
    state.q = '';
    field.input.value = '';
    field.input.dispatchEvent(new Event('input'));
    syncHash();
    renderFilters();
    renderResult();
  }

  const renderResult = () => {
    const hits = STORES.map((raw) => resolveStore(raw.id)).filter((s) => {
      const r = rulesOf(s.presetId);
      for (const f of FILTERS) {
        const picked = f.options.filter((o) => state.active.has(o.value));
        if (!picked.length) continue;
        if (!picked.some((o) => o.test(s, r))) return false;
      }
      return matchText(storeHaystack(s, r), state.q);
    });

    clear(result);
    result.appendChild(h('div.row.gap-8', { style: { marginBottom: '12px' } },
      h('div.label', { text: `${hits.length}件` }),
      h('div.grow'),
      h('a.btn.btn-sm.btn-ghost', { href: '#/compare', text: '2店舗を比較する' })));
    if (hits.length) {
      result.appendChild(storeGrid(hits));
      return;
    }
    const reset = h('button.btn.btn-ghost', { text: '条件をすべて外す' });
    reset.addEventListener('click', resetAll);
    result.appendChild(emptyState(
      '条件に合う店舗がありません',
      'デモ店舗は3件だけです。ルールそのものを試したいときは、ルールを含めて探せます。',
      reset));
    result.appendChild(h('div.row.gap-8.wrapflex', { style: { marginTop: '14px' } },
      h('a.btn.btn-sm.btn-primary', { href: `#/search?q=${encodeURIComponent(state.q)}`, text: 'ルールも含めて探す' }),
      h('a.btn.btn-sm.btn-ghost', { href: '#/table', text: '卓を立てる' })));
  };

  renderFilters();
  renderResult();
  // 横に広くて縦が短い画面（スマホ横持ち）では、左に絞り込み・右に結果を並べる
  wrap.appendChild(h('div.stores-layout', filterBox, result));
  app.appendChild(sec);
  app.appendChild(footer());
}

/** ルールプリセット1件のカード（ホーム・検索で共用） */
function presetCard(p) {
  const r = resolveRules(p.rules);
  return h('div.card.card-pad',
    h('div.row.gap-8', { style: { marginBottom: '8px' } },
      chip(p.category || '自作', 'felt'),
      h('div.grow'),
      chip(r.game.players === 3 ? '三麻' : '四麻')),
    h('h3', { style: { fontSize: '16px' }, text: p.name }),
    h('p.tiny.muted', { style: { margin: '6px 0 10px' }, text: p.description || shortSummary(r) }),
    h('div.row.gap-8.wrapflex', { style: { marginBottom: '14px' } },
      (p.tags || []).slice(0, 4).map((t) => ruleChip(t))),
    h('div.row.gap-8',
      h('a.btn.btn-sm.btn-primary', { href: `#/play?preset=${encodeURIComponent(p.id)}`, text: 'このルールで遊ぶ' }),
      h('a.btn.btn-sm.btn-ghost', { href: `#/editor?preset=${encodeURIComponent(p.id)}`, text: '設定を見る' })));
}

// ---------------------------------------------------------------------------
// 横断検索（店舗とルールをまとめて探す）
// ---------------------------------------------------------------------------
function viewSearch(params) {
  const state = { q: params.q || '' };
  const sec = h('section.section', h('div.wrap'));
  const wrap = sec.firstChild;
  wrap.appendChild(sectionHead('検索', '店舗とルールをまとめて探す', '店名・エリア・ルール名・特徴、どれで打っても構いません。'));

  const result = h('div');

  const syncHash = () => {
    const next = `#/search${state.q.trim() ? `?q=${encodeURIComponent(state.q.trim())}` : ''}`;
    try { history.replaceState(null, '', next); } catch { /* 置き換えられなくても検索は動く */ }
  };

  const field = searchField({
    id: 'globalSearch',
    value: state.q,
    placeholder: '例：白ポッチ／三麻／新宿／赤なし／東天紅',
    onInput: (v) => { state.q = v; syncHash(); render(); },
  });

  const suggests = ['白ポッチ', 'アリス', '華牌', '割れ目', '東天紅', '五等サンマ', '三麻', '初心者歓迎'];

  const render = () => {
    clear(result);
    const q = state.q.trim();
    if (!q) {
      result.appendChild(h('p.muted', { text: 'よく探されるもの' }));
      result.appendChild(h('div.row.gap-8.wrapflex', { style: { marginBottom: '28px' } },
        suggests.map((t) => {
          const c = h(`span.chip.chip-btn.chip-lg.tag-${toneOf(t)}`, { text: t });
          c.addEventListener('click', () => {
            state.q = t;
            field.input.value = t;
            field.input.dispatchEvent(new Event('input'));
          });
          return c;
        })));
      result.appendChild(h('div.rule-line'));
      result.appendChild(sectionHead('01', 'すべてのルール', `${allPresetsWithCustom().length}件を掲載しています。`));
      result.appendChild(h('div.store-grid', allPresetsWithCustom().map(presetCard)));
      return;
    }

    const stores = STORES.map((raw) => resolveStore(raw.id))
      .filter((s) => matchText(storeHaystack(s, rulesOf(s.presetId)), q));
    const presets = allPresetsWithCustom().filter((p) => matchText(presetHaystack(p), q));

    result.appendChild(h('p.search-summary', { text: `「${q}」に一致：店舗${stores.length}件／ルール${presets.length}件` }));

    if (!stores.length && !presets.length) {
      result.appendChild(emptyState(
        '見つかりませんでした',
        '言い方を変えると見つかることがあります（例：「赤ドラ」→「赤あり」、「サンマ」→「三麻」）。',
        h('a.btn.btn-ghost', { href: '#/table', text: '卓を立てる' })));
      return;
    }
    if (stores.length) {
      result.appendChild(sectionHead('01', '店舗', 'この店のルールでそのまま打てます。'));
      result.appendChild(storeGrid(stores));
      result.appendChild(h('div.rule-line'));
    }
    if (presets.length) {
      result.appendChild(sectionHead(stores.length ? '02' : '01', 'ルール', '設定を見たうえで、そのまま卓を立てられます。'));
      result.appendChild(h('div.store-grid', presets.map(presetCard)));
    }
  };

  wrap.appendChild(h('div.card.card-pad', { style: { marginBottom: '24px' } }, field));
  wrap.appendChild(result);
  render();
  app.appendChild(sec);
  app.appendChild(footer());
  setTimeout(() => field.input.focus(), 0);
}

// ---------------------------------------------------------------------------
// 会員カードとクーポン
//   アプリで体験した人が、店頭で名乗れる形を持てるようにする。
//   クーポンは店頭提示の案内で、アプリの中で金銭のやり取りはしない。
// ---------------------------------------------------------------------------
function couponCard(store, c) {
  const state = couponState(store.id, c);
  const label = {
    ready: '使えます', locked: 'もう少し', used: '使用済み', expired: '期限切れ',
  }[state];
  const box = h(`div.coupon.is-${state}`,
    h('div.coupon-main',
      h('div.row.gap-8', { style: { marginBottom: '4px' } },
        h('span.coupon-state', { text: label }),
        c.until ? h('span.tiny.muted', { text: `${c.until} まで` }) : null),
      h('h4.coupon-title', { text: c.title }),
      h('p.coupon-body', { text: c.body }),
      state === 'locked' ? h('div.coupon-progress', { text: couponProgress(store.id, c) }) : null));
  if (state === 'ready') {
    const use = h('button.btn.btn-sm.btn-primary', { text: '店頭で使う' });
    use.addEventListener('click', () => {
      // 二度押しを避けるため、使う前に一度確認する
      if (!window.confirm(`「${c.title}」を使用済みにします。店員さんの前で押してください。`)) return;
      useCoupon(store.id, c.id);
      route();
    });
    box.appendChild(h('div.coupon-act', use));
  }
  return box;
}

function viewCard(storeId) {
  const s = resolveStore(storeId);
  const card = getCard(s.id, { create: true });
  const st = statsOf(s.id);
  const coupons = s.coupons || [];
  const ready = coupons.filter((c) => couponState(s.id, c) === 'ready').length;

  const sec = h('section.section', h('div.wrap-narrow'));
  const wrap = sec.firstChild;
  wrap.appendChild(h('div.row.gap-8', { style: { marginBottom: '14px' } },
    h('a.btn.btn-sm.btn-ghost', { href: `#/store/${s.id}`, text: '← 店舗ページ' }),
    h('div.grow'),
    h('a.btn.btn-sm.btn-ghost', { href: '#/cards', text: 'カード一覧' })));

  // 券面
  wrap.appendChild(h('div.memcard', { style: { '--hue': String(s.photo.hue) } },
    h('div.memcard-top',
      h('div',
        h('div.memcard-label', { text: 'MEMBER' }),
        h('div.memcard-store', { text: s.name })),
      h('div.memcard-mark', icon('qr', 28))),
    h('div.memcard-no', { text: card.no }),
    h('div.memcard-foot',
      h('div', h('span.memcard-k', { text: '発行' }), h('span', { text: new Date(card.since).toLocaleDateString('ja-JP') })),
      h('div', h('span.memcard-k', { text: '体験' }), h('span', { text: `${st.plays}回` })),
      h('div', h('span.memcard-k', { text: '来店' }), h('span', { text: `${st.checkins}回` })))));
  wrap.appendChild(h('p.tiny.muted', { style: { marginTop: '10px' },
    text: '店頭では、この会員番号をスタッフにお伝えください。番号は端末のなかにだけ保存され、どこにも送信されません。' }));

  wrap.appendChild(h('div.rule-line'));
  wrap.appendChild(sectionHead('01', 'クーポン', ready ? `いま使えるものが${ready}件あります。` : '通うほど使えるものが増えます。'));
  if (coupons.length) {
    wrap.appendChild(h('div.coupon-list', coupons.map((c) => couponCard(s, c))));
  } else {
    wrap.appendChild(emptyState('この店のクーポンはまだありません', '店舗側で作成すると、ここに並びます。', null));
  }
  wrap.appendChild(h('p.tiny.muted', { style: { marginTop: '16px' },
    text: 'クーポンは店頭で提示する案内です。アプリの中で金銭のやり取りはありません。ゲーム内ポイント（BP）とも交換しません。' }));
  app.appendChild(sec);
  app.appendChild(footer());
}

function viewCards() {
  const cards = allCards();
  const sec = h('section.section', h('div.wrap'));
  const wrap = sec.firstChild;
  wrap.appendChild(sectionHead('01', '会員カード', 'この端末で発行したカードです。店ごとに1枚持てます。'));
  if (!cards.length) {
    wrap.appendChild(emptyState(
      'まだカードがありません',
      '店舗ページの「会員カードを作る」から発行できます。',
      h('a.btn.btn-primary', { href: '#/stores', text: '店舗をさがす' })));
  } else {
    const grid = h('div.store-grid');
    for (const c of cards) {
      const s = resolveStore(c.storeId);
      const st = statsOf(c.storeId);
      const ready = (s.coupons || []).filter((x) => couponState(c.storeId, x) === 'ready').length;
      grid.appendChild(h('a.card.card-pad.memcard-mini', { href: `#/card/${c.storeId}` },
        h('div.row.gap-8', { style: { marginBottom: '6px' } },
          chip(s.area), h('div.grow'),
          ready ? h('span.chip.chip-brass', { text: `クーポン${ready}件` }) : null),
        h('h3', { style: { fontSize: '16px' }, text: s.name }),
        h('div.memcard-mini-no', { text: c.no }),
        h('div.tiny.muted', { text: `体験${st.plays}回 ／ 来店${st.checkins}回` })));
    }
    wrap.appendChild(grid);
  }
  app.appendChild(sec);
  app.appendChild(footer());
}

// ---------------------------------------------------------------------------
// 店舗ページ
// ---------------------------------------------------------------------------
/**
 * この店の「顔になる牌」を最大5枚選ぶ。
 * ルール設定から導くので、店を増やしても画像を用意する必要がない。
 */
function signatureTiles(r) {
  const out = [];
  if (r.local.shiroPocchi && r.local.shiroPocchi.enabled) out.push({ t: 31, dot: true, name: '白ポッチ' });
  for (const d of (r.specialTiles || [])) {
    let t = 0;
    try { t = codeToTypeLite(d.tile); } catch { t = 0; }
    out.push({ t, sp: d.id, red: d.color === 'red', gold: d.color === 'gold', name: d.name });
  }
  if (r.flowers && r.flowers.enabled) {
    for (const [i, key] of (r.flowers.tiles || []).entries()) {
      out.push({ t: 34 + i, flower: key, name: { spring: '春', summer: '夏', autumn: '秋', winter: '冬' }[key] });
    }
  }
  if (Object.values(r.dora.blue || {}).some((n) => n > 0)) out.push({ t: 22, blue: true, name: '青5索' });
  if (Object.values(r.dora.red || {}).some((n) => n > 0)) out.push({ t: 13, red: true, name: '赤5筒' });
  if (r.sanma && r.game.players === 3) out.push({ t: 30, name: '北' });
  if (!out.length) out.push({ t: 13, red: true, name: '赤5筒' }, { t: 4, name: '五萬' }, { t: 27, name: '東' });
  return out.slice(0, 5);
}

function viewStore(id) {
  const s = resolveStore(id);
  const r = rulesOf(s.presetId);
  const v = validateRules(r);

  // ヒーロー：写真帯の上に情報カードを重ねる。店の顔になる牌もここで見せる。
  app.appendChild(h('section.store-hero',
    h('div.store-hero-photo', { style: { '--hue': String(s.photo.hue) } },
      storePhoto(s) ? photoImg(storePhoto(s)) : icon(s.photo.icon, 78),
      h('div.store-hero-tiles', { 'aria-hidden': 'true' },
        signatureTiles(r).map((info, i) => h('div.sig-tile', { style: { '--i': String(i) } }, tileEl(info, { size: 'md' }))))),
    h('div.wrap',
      h('div.store-hero-card',
        h('div.row.gap-8.wrapflex', { style: { marginBottom: '10px' } },
          chip(r.game.players === 3 ? '三麻' : '四麻', 'felt'), chip(s.style), chip(s.smoking),
          h('div.grow'), h('a.btn.btn-sm.btn-ghost', { href: '#/stores', text: '← 一覧' })),
        h('h1.store-hero-name', { text: s.name }),
        h('p.store-hero-catch', { text: s.catch }),
        h('div.store-meta',
          h('div.store-meta-item', icon('pin', 15), h('span', { text: `${s.area}／${s.access}` })),
          h('div.store-meta-item', icon('clock', 15), h('span', { text: s.hours })),
          h('div.store-meta-item', icon('smoke', 15), h('span', { text: s.smoking })),
          h('div.store-meta-item', h('span.muted', { text: '初心者歓迎度' }), stars(s.beginner)))))));

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
  const mode = { v: 'easy' };
  const holder = h('div');
  const renderExplain = () => {
    clear(holder);
    holder.appendChild(h('div.row.gap-12', { style: { marginBottom: '18px' } },
      toggleRow([
        { label: '初心者向け', value: 'easy' },
        { label: '一般ルールとの差分', value: 'diff' },
        { label: 'ルール全文', value: 'full' },
      ], mode.v, (val) => { mode.v = val; renderExplain(); }),
      h('div.grow'),
      h('div.tiny.muted', { text: shortSummary(r) })));
    if (mode.v === 'easy') {
      const box = h('div.card.card-pad');
      box.appendChild(h('p.tiny.muted', { style: { marginTop: '0' },
        text: '麻雀のルールは分かるけれど、この店の特殊ルールは初めて、という方向けの説明です。' }));
      const ART_FOR = { 'アリス': 'alice', '華牌（春夏秋冬）': 'flower', '白ポッチ': 'pocchi' };
      for (const e of explainForBeginners(r)) {
        // 特殊牌の項目は、実物と同じ見た目の牌を横に置く（言葉より速い）
        const face = e.tile ? h('div.easy-face',
          tileEl({ t: safeType(e.tile.code), sp: e.tile.sp, red: e.tile.color === 'red', gold: e.tile.color === 'gold', name: e.tile.name },
            { size: 'lg', spColor: e.tile.color })) : null;
        box.appendChild(h('div.easy-item',
          face,
          h('div.easy-body',
            h('div.row.gap-8', { style: { marginBottom: '6px' } }, ruleChip(e.title, { strong: true })),
            h('p', { text: e.body }),
            ART_FOR[e.title] ? artwork(ART_FOR[e.title]) : null,
            e.more ? h('details.easy-more', h('summary', { text: 'もう少し詳しく' }), h('p', { text: e.more })) : null)));
      }
      holder.appendChild(box);
    } else if (mode.v === 'diff') {
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
      h('div.row.gap-4.wrapflex', s.mood.map((m) => ruleChip(m))),
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
      checkinButton(s.id))));

  wrap.appendChild(h('div', { style: { marginTop: '30px' } },
    h('a.btn.btn-primary.btn-lg.btn-block', { href: `#/play?preset=${s.presetId}` }, icon('play', 15), 'このルールで遊んでみる')));
  app.appendChild(sec);
  app.appendChild(footer());
  // スマホ横持ちでは、画面が長くなって「打つ」が遠くなるので、下に出しっぱなしにする
  wrap.appendChild(h('div.row.gap-8.wrapflex', { style: { marginTop: '12px' } },
    h('a.btn.btn-ghost', { href: `#/card/${s.id}` }, icon('qr', 15),
      hasCard(s.id) ? '会員カードを見る' : '会員カードを作る（無料）')));
  app.appendChild(h('div.store-cta-bar',
    h('div.store-cta-name', { text: s.name }),
    h('a.btn.btn-primary.store-cta-btn', { href: `#/play?preset=${s.presetId}` }, icon('play', 14), 'このルールで打つ')));
}

/** 牌コードをタイプ番号に。未知のコードでも画面を壊さない。 */
function safeType(code) {
  try { return codeToTypeLite(code); } catch { return 0; }
}

/**
 * 来店チェックイン。記録するだけで、景品や金銭とは結び付けない。
 * サーバに届かなくてもボタンの体験は変えない（店頭で止まらないことを優先する）。
 */
function checkinButton(storeId) {
  const btn = h('button.btn.btn-ghost.btn-sm', { style: { marginTop: '12px' }, text: 'チェックイン（デモ）' });
  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.textContent = 'チェックインしました';
    recordCheckin(storeId);
  });
  return btn;
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
  const state = { a: params.a || 'store_yonma_kan', b: params.b || 'store_goto_kan', view: 'diff' };
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
    const rows = labels.map((label) => {
      const x = find(da, label); const y = find(db, label);
      const va = x ? x.to : '一般ルールどおり';
      const vb = y ? y.to : '一般ルールどおり';
      return { label, va, vb, same: va === vb };
    });
    const diffCount = rows.filter((r2) => !r2.same).length;
    const sameCount = rows.length - diffCount;

    // 何項目ちがうのかを先に伝える。表を読む前に結論が分かるようにする。
    holder.appendChild(h('div.cmp-summary',
      h('div.cmp-summary-num', h('strong', { text: String(diffCount) }), h('span', { text: '項目' })),
      h('div.grow',
        h('div.cmp-summary-title', { text: diffCount ? 'この2つで設定が違うところ' : '設定はすべて同じです' }),
        h('p.tiny', { style: { margin: '3px 0 0' },
          text: `一般ルールから変えている項目のうち、${sameCount}項目は2店とも同じ設定です。` })),
      toggleRow([
        { label: '違うところだけ', value: 'diff' },
        { label: 'すべて', value: 'all' },
      ], state.view, (val) => { state.view = val; render(); })));

    const shown = state.view === 'all' ? rows : rows.filter((r2) => !r2.same);
    holder.appendChild(h('div.card.card-pad',
      h('table.diff-table.cmp-table', h('tbody',
        h('tr.cmp-head', h('th', { text: '項目' }),
          h('td', h('span.cmp-side.a', { text: lookupPreset(state.a).name })),
          h('td', h('span.cmp-side.b', { text: lookupPreset(state.b).name }))),
        shown.length ? shown.map((r2) => h(`tr${r2.same ? '.cmp-same' : '.cmp-diff'}`,
          h('th', { text: r2.label }),
          h('td', { text: r2.va }),
          h('td', { text: r2.vb }))) : h('tr', h('td', { colspan: '3' },
          h('p.tiny.muted', { style: { margin: '10px 0' }, text: '違うところはありません。' })))))));
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
