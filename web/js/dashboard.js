/**
 * dashboard.js - 店舗管理ダッシュボード＋公開前チェック
 *
 * 対象は「麻雀には詳しいが、ITは得意ではない」店舗スタッフ。
 * 技術用語（JSON / Validator / Schema など）は画面に出さない。
 *
 * 体験プレイ数などの数値は、本番ではサーバから取得する。
 * ここではデモとして端末内の記録（localStorage）を使う。
 */
import { resolveRules } from '../../src/rules/defaults.js';
import { validateRules } from '../../src/rules/validator.js';
import { diffFromBaseline, shortSummary } from '../../src/rules/explain.js';
import { STORES, getStore } from '../../src/data/stores.js';
import { lookupPreset, loadCustomPresets } from './custom.js';
import { resolveStore } from './storeedit.js';
import { h, clear, icon, chip, ruleChip, sectionHead, stars } from './ui.js';
import {
  hasServer, fetchStats, recordPlay as apiPlay, recordCheckin as apiCheckin, lookupMember,
} from './api.js';
import { memberAuth } from './member.js';

const KEY = 'houserule.storeStats.v1';

/** デモ用の計測値（本番はサーバ集計） */
function loadStats(storeId) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}');
    return all[storeId] || { plays: 0, visits: 0, checkins: 0 };
  } catch {
    return { plays: 0, visits: 0, checkins: 0 };
  }
}

export function recordPlay(presetId) {
  const store = STORES.find((s) => s.presetId === presetId);
  if (!store) return;
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}');
    const cur = all[store.id] || { plays: 0, visits: 0, checkins: 0 };
    cur.plays += 1;
    all[store.id] = cur;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* 記録できなくても対局は続行する */ }
  // サーバにも送る。届かなくても対局には影響させない。
  // 会員カードを持っていれば一緒に名乗り、その人の回数にも積んでもらう。
  if (hasServer()) apiPlay(store.id, memberAuth(store.id));
}

export function recordCheckin(storeId) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}');
    const cur = all[storeId] || { plays: 0, visits: 0, checkins: 0 };
    cur.checkins += 1;
    all[storeId] = cur;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* 同上 */ }
  if (hasServer()) apiCheckin(storeId, memberAuth(storeId));
}

// ---------------------------------------------------------------------------
// 公開前チェック（何が足りないかを、専門用語なしで示す）
// ---------------------------------------------------------------------------
function buildChecklist(store, rules) {
  const v = validateRules(rules);
  const filled = (x) => !!x && String(x).trim().length > 0;
  const items = [];

  items.push({
    ok: filled(store.name) && filled(store.address) && filled(store.hours),
    label: '店舗の基本情報',
    detail: '店名・住所・営業時間',
    fix: '店舗情報の編集から入力してください',
    go: { href: `#/store-edit?store=${store.id}`, text: '店舗情報を編集する' },
  });
  items.push({
    ok: (store.priceLines || []).length > 0,
    label: '料金',
    detail: `${(store.priceLines || []).length}件`,
    fix: 'セット・フリーの料金を1件以上入れてください',
    go: { href: `#/store-edit?store=${store.id}`, text: '料金を入れる' },
  });
  items.push({
    ok: (store.staff || []).length > 0,
    label: 'スタッフ紹介',
    detail: `${(store.staff || []).length}名`,
    fix: '1名でも載せると来店のハードルが下がります',
    go: { href: `#/store-edit?store=${store.id}`, text: 'スタッフを載せる' },
  });
  items.push({
    ok: (store.mood || []).length >= 2,
    label: '店の雰囲気',
    detail: (store.mood || []).join('・') || '未設定',
    fix: '雰囲気を2つ以上選んでください',
    go: { href: `#/store-edit?store=${store.id}`, text: '雰囲気を選ぶ' },
  });
  const diff = diffFromBaseline(rules);
  items.push({
    ok: diff.length > 0,
    label: 'ハウスルール',
    detail: `一般ルールとの違いが${diff.length}項目`,
    fix: '一般ルールと同じ設定です。この店らしさを足しましょう',
    go: { href: `#/editor?preset=${store.presetId}`, text: 'ルールを編集する' },
  });
  items.push({
    ok: v.summary.errors === 0,
    label: 'ルールの設定チェック',
    detail: v.summary.errors ? `${v.summary.errors}件の成立しない設定` : '問題なし',
    fix: 'ルール編集の「設定チェック」を確認してください',
    go: { href: `#/editor?preset=${store.presetId}`, text: '設定チェックを見る' },
    warn: v.summary.warns,
  });
  items.push({
    ok: !rules.bonus.enabled || /非換金/.test(rules.bonus.label || ''),
    label: 'ポイントは非換金',
    detail: rules.bonus.enabled ? rules.bonus.label : 'ポイントを使わない設定',
    fix: '現金や景品と交換できる表記になっていないか確認してください',
    go: { href: `#/editor?preset=${store.presetId}`, text: 'ルールを編集する' },
  });
  items.push({
    ok: loadStats(store.id).plays > 0,
    label: '試し打ち',
    detail: `${loadStats(store.id).plays}回`,
    fix: '公開前に一度、自分のルールで打ってみてください',
    go: { href: `#/play?preset=${store.presetId}`, text: '試し打ちする' },
  });
  items.push({
    ok: filled(store.sns && store.sns.x) || filled(store.sns && store.sns.web),
    label: '来店の導線',
    detail: (store.sns && (store.sns.x || store.sns.web)) || '未設定',
    fix: 'SNSかウェブサイトのリンクを入れてください',
    go: { href: `#/store-edit?store=${store.id}`, text: 'リンクを入れる' },
  });
  return { items, validator: v };
}

// ---------------------------------------------------------------------------
export function renderDashboard(root, params) {
  const storeId = params.store || STORES[0].id;
  const store = resolveStore(storeId);
  const rules = resolveRules(lookupPreset(store.presetId).rules);
  const stats = loadStats(store.id);
  const { items, validator } = buildChecklist(store, rules);
  const done = items.filter((i) => i.ok).length;
  const ready = done === items.length;

  clear(root);
  const sec = h('section.section', h('div.wrap'));
  const wrap = sec.firstChild;

  // 店舗の切替（デモ用）
  const sel = h('select', { style: { maxWidth: '260px' } });
  for (const s of STORES) sel.appendChild(h('option', { value: s.id, text: s.name, selected: s.id === store.id }));
  sel.addEventListener('change', () => { location.hash = `#/dashboard?store=${sel.value}`; });

  wrap.appendChild(h('div.row.gap-16.wrapflex', { style: { marginBottom: '22px' } },
    h('div',
      h('div.eyebrow', { text: 'STORE DASHBOARD' }),
      h('h1', { style: { fontSize: 'clamp(22px,3vw,30px)', marginTop: '6px' }, text: '店舗の管理' })),
    h('div.grow'),
    sel));

  // --- 公開状態
  wrap.appendChild(h(`div.publish-band${ready ? '.ready' : ''}`,
    progressRing(done, items.length),
    h('div.grow',
      h('div.publish-state', { text: ready ? '公開できます' : `公開まであと ${items.length - done} 項目` }),
      h('p.tiny', { style: { margin: '4px 0 0' },
        text: ready
          ? 'すべての項目が揃いました。お客様がこの店のルールで打てるようになります。'
          : '下のチェックで足りない項目を埋めてください。' })),
    h('div.row.gap-8.wrapflex',
      h('a.btn.btn-ghost', {
        href: `#/store/${store.id}`,
        style: { color: '#fff', borderColor: 'rgba(255,255,255,.45)' },
        text: 'お客様の見え方を確認',
      }),
      h('button.btn.btn-publish', { text: ready ? '店舗ページを公開' : '公開する（未完了）', disabled: !ready }))));

  // --- 数値
  const playCard = statCard('体験プレイ', stats.plays, '回', 'この店のルールで打たれた回数');
  const checkinCard = statCard('来店チェックイン', stats.checkins, '件', '店頭QRから記録された来店');
  wrap.appendChild(h('div.stat-row', { style: { marginTop: '20px' } },
    playCard, checkinCard,
    statCard('ハウスルールの違い', diffFromBaseline(rules).length, '項目', '一般ルールと違うところ'),
    statCard('初心者歓迎度', store.beginner, '／5', 'お客様に表示される目安')));

  // サーバの集計が取れたら、端末内の数から差し替える。
  // 取れなくても端末内の数がそのまま残るので、画面は必ず何かを表示する。
  if (hasServer()) {
    fetchStats(store.id).then((r) => {
      if (!r.ok || !r.data) return;
      setStat(playCard, r.data.plays);
      setStat(checkinCard, r.data.checkins);
      for (const c of [playCard, checkinCard]) {
        const note = c.querySelector('.stat-note');
        if (note) note.textContent = `${note.textContent}（全端末の合計）`;
      }
    });
  }

  // --- 公開前チェック
  wrap.appendChild(h('div.rule-line'));
  wrap.appendChild(sectionHead('01', '公開前チェック', '足りないところだけ直せば公開できます。'));
  // 手を動かす必要がある項目を先に、済んだ項目は後ろにまとめる
  const todo = items.filter((i) => !i.ok);
  const doneItems = items.filter((i) => i.ok);
  if (todo.length) {
    const list = h('div.check-list');
    for (const it of todo) list.appendChild(checkRow(it));
    wrap.appendChild(list);
  }
  if (doneItems.length) {
    if (todo.length) {
      wrap.appendChild(h('div.check-done-head', { text: `済んでいる項目（${doneItems.length}）` }));
    }
    const grid = h('div.check-grid');
    for (const it of doneItems) grid.appendChild(checkRow(it));
    wrap.appendChild(grid);
  }

  // --- ルールの要点
  wrap.appendChild(h('div.rule-line'));
  wrap.appendChild(sectionHead('02', '登録済みのルール', shortSummary(rules)));
  wrap.appendChild(h('div.row.gap-4.wrapflex', { style: { marginBottom: '16px' } },
    store.ruleHighlights.map((t) => ruleChip(t))));
  wrap.appendChild(h('div.row.gap-12.wrapflex',
    h('a.btn.btn-primary', { href: `#/editor?preset=${store.presetId}`, text: 'ルールを編集する' }),
    h('a.btn.btn-brass', { href: `#/play?preset=${store.presetId}` }, icon('play', 14), 'このルールで試し打ちする'),
    h('a.btn.btn-ghost', { href: `#/store-edit?store=${store.id}`, text: '店舗情報を編集する' }),
    h('a.btn.btn-ghost', { href: `#/store/${store.id}`, text: '店舗ページを見る' })));

  // --- 設定チェックの詳細（注意・メモ）
  const notes = validator.issues.filter((i) => i.severity !== 'info');
  if (notes.length) {
    wrap.appendChild(h('div.rule-line'));
    wrap.appendChild(sectionHead('03', '確認しておきたい点', '公開はできますが、お客様に伝わりにくい可能性があります。'));
    for (const i of notes) {
      wrap.appendChild(h(`div.issue.issue-${i.severity}`,
        h('div',
          h('b', { text: i.severity === 'error' ? 'このままでは成立しません' : '確認してください' }),
          h('span', { text: i.message }),
          i.fix ? h('div.tiny', { style: { marginTop: '4px' }, text: `→ ${i.fix}` }) : null)));
    }
  }

  // --- 店頭での会員照会
  wrap.appendChild(h('div.rule-line'));
  wrap.appendChild(memberLookup(store));

  wrap.appendChild(h('div.notice', { style: { marginTop: '26px' },
    text: hasServer()
      ? '体験プレイ数と来店数はサーバで集計しています。通信できないときは、この端末の記録を表示します。'
      : 'この画面の数値はこの端末に記録したものです。サーバに接続すると全端末の合計になります。' }));

  root.appendChild(sec);
  return () => {};
}

/**
 * 店頭でお客様の会員番号を確かめる。
 *
 * カウンターで「このクーポン使えますか」と聞かれたときに、
 * スタッフが番号を打ち込んで、回数と使用済みのクーポンを見る。
 * ここが無いと、会員番号があっても店側は確かめようがない。
 */
function memberLookup(store) {
  const box = h('div');
  box.appendChild(sectionHead('04', '会員番号の照会', 'お客様の番号を入れると、来店回数と使用済みのクーポンが分かります。'));
  if (!hasServer()) {
    box.appendChild(h('div.notice', { text: 'サーバに接続していないため、いまは照会できません。' }));
    return box;
  }
  const input = h('input', {
    type: 'text', inputmode: 'numeric', placeholder: '0000-0000',
    style: { maxWidth: '200px', letterSpacing: '.1em' },
  });
  const btn = h('button.btn.btn-primary', { text: '照会する' });
  const out = h('div', { style: { marginTop: '12px' } });
  const run = async () => {
    const no = input.value.trim();
    if (!no) return;
    clear(out);
    btn.disabled = true;
    out.appendChild(h('p.tiny.muted', { text: '照会しています…' }));
    const r = await lookupMember(store.id, no);
    btn.disabled = false;
    clear(out);
    if (!r.ok) {
      out.appendChild(h('div.issue.issue-warn', h('div',
        h('b', { text: '見つかりませんでした' }),
        h('span', { text: r.error === 'offline' ? '通信できませんでした' : r.error }))));
      return;
    }
    const c = r.data.card;
    const used = new Set((c.used || []).map((u) => u.id));
    const rows = (store.coupons || []).map((cp) => h('div.check-item' + (used.has(cp.id) ? '' : '.ok'),
      h('span.check-mark', { html: used.has(cp.id) ? MARK_TODO : MARK_OK }),
      h('div.grow',
        h('div.check-label', { text: cp.title }),
        h('div.check-detail', { text: used.has(cp.id) ? '使用済み' : 'まだ使われていません' }))));
    out.appendChild(h('div.card.card-pad',
      h('div.row.gap-12.wrapflex', { style: { marginBottom: '10px' } },
        h('div', h('div.tiny.muted', { text: '会員番号' }), h('b', { style: { fontSize: '18px', letterSpacing: '.08em' }, text: c.no })),
        h('div', h('div.tiny.muted', { text: '体験プレイ' }), h('b', { text: `${c.plays || 0}回` })),
        h('div', h('div.tiny.muted', { text: '来店' }), h('b', { text: `${c.checkins || 0}回` })),
        // 発行したばかりのカードで来店回数を主張されたときに気づけるよう、日付も出す
        h('div', h('div.tiny.muted', { text: '発行' }),
          h('b', { text: c.since ? new Date(c.since).toLocaleDateString('ja-JP') : '—' }))),
      rows.length ? h('div.check-grid', rows) : h('p.tiny.muted', { style: { margin: 0 }, text: 'この店のクーポンはまだありません。' })));
  };
  btn.addEventListener('click', run);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  box.appendChild(h('div.row.gap-8.wrapflex', input, btn));
  box.appendChild(out);
  return box;
}

const MARK_OK = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>';
const MARK_TODO = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 7v7M12 17.5v.5"/></svg>';

function checkRow(it) {
  // 足りない項目には、そこから直しに行けるボタンを付ける。
  // 「何が足りないか」だけ示して行き先が無いと、画面を探すことになる。
  return h(`div.check-item${it.ok ? '.ok' : ''}`,
    h('span.check-mark', { html: it.ok ? MARK_OK : MARK_TODO }),
    h('div.grow',
      h('div.check-label', { text: it.label }),
      h('div.check-detail', { text: it.ok ? it.detail : it.fix })),
    it.warn ? chip(`注意${it.warn}`, 'brass') : null,
    !it.ok && it.go
      ? h('a.btn.btn-sm.btn-ghost.check-go', { href: it.go.href, text: it.go.text })
      : null);
}

/** 公開までの進み具合。数字だけより「あと少し」が伝わる。 */
function progressRing(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const R = 26;
  const c = 2 * Math.PI * R;
  const svg = `<svg viewBox="0 0 64 64" width="64" height="64">
    <circle cx="32" cy="32" r="${R}" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="6"/>
    <circle cx="32" cy="32" r="${R}" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}" transform="rotate(-90 32 32)"/>
  </svg>`;
  return h('div.publish-ring', { html: svg }, h('span', { text: `${done}/${total}` }));
}

function setStat(card, value) {
  const n = card.querySelector('.stat-value span');
  if (n) n.textContent = String(value);
}

function statCard(label, value, unit, note) {
  return h('div.stat-card',
    h('div.stat-label', { text: label }),
    h('div.stat-value', h('span', { text: String(value) }), h('small', { text: unit })),
    h('div.stat-note', { text: note }));
}
