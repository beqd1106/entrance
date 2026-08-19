/**
 * storeedit.js - 店舗情報の編集
 *
 * 対象は「麻雀には詳しいが、ITは得意ではない」店舗スタッフ。
 * 入力欄を並べるだけにせず、右側に「お客様の見え方」を常に出す。
 *
 * 保存先はデモとして端末内（localStorage）。本番では店舗アカウントに紐づくレコード。
 */
import { STORES, getStore } from '../../src/data/stores.js';
import { h, clear, icon, chip, ruleChip, stars, field, sectionHead } from './ui.js';

const KEY = 'houserule.storeEdits.v1';

/** 端末に保存された編集内容を読み込む */
function loadEdits() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function saveEdits(all) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* 保存できなくても続行 */ }
}

/** 元データに編集内容を重ねた店舗を返す（他の画面からも使う） */
export function resolveStore(id) {
  const base = getStore(id);
  const edit = loadEdits()[id];
  return edit ? { ...base, ...edit } : base;
}

export function saveStore(id, patch) {
  const all = loadEdits();
  all[id] = { ...(all[id] || {}), ...patch };
  saveEdits(all);
}

const MOOD_CHOICES = [
  '落ち着いた', 'にぎやか', '初心者歓迎', '静か', '本格派', 'ワイワイ',
  '常連が多い', '女性スタッフ在籍', '深夜営業', 'スピード感', '打点が高い', 'ゲーム性重視',
];
const SMOKING = ['禁煙', '禁煙（喫煙ブースあり）', '分煙（喫煙可卓あり）', '喫煙可（分煙設備あり）', '喫煙可'];

// ---------------------------------------------------------------------------
export function renderStoreEdit(root, params) {
  const id = params.store || STORES[0].id;
  const state = { id, data: { ...resolveStore(id) } };

  clear(root);
  const sec = h('section.section', h('div.wrap'));
  const wrap = sec.firstChild;
  const left = h('div');
  const right = h('div.sticky-side');

  const sel = h('select', { style: { maxWidth: '260px' } });
  for (const s of STORES) sel.appendChild(h('option', { value: s.id, text: s.name, selected: s.id === id }));
  sel.addEventListener('change', () => { location.hash = `#/store-edit?store=${sel.value}`; });

  wrap.appendChild(h('div.row.gap-16.wrapflex', { style: { marginBottom: '22px' } },
    h('div',
      h('div.eyebrow', { text: 'STORE PROFILE' }),
      h('h1', { style: { fontSize: 'clamp(22px,3vw,30px)', marginTop: '6px' }, text: '店舗情報の編集' }),
      h('p.tiny.muted', { style: { margin: '6px 0 0' }, text: 'お客様が最初に見る情報です。右側に見え方が出ます。' })),
    h('div.grow'),
    sel));
  wrap.appendChild(h('div.editor-grid', left, right));
  root.appendChild(sec);

  const rerender = () => { renderForm(left, state, rerender); renderPreview(right, state); };
  rerender();
  return () => {};
}

// ---------------------------------------------------------------------------
function renderForm(left, state, onChange) {
  const d = state.data;
  clear(left);
  const text = (label, key, placeholder, desc) => {
    const inp = h('input', { type: 'text', value: d[key] || '', placeholder: placeholder || '' });
    inp.addEventListener('input', () => { d[key] = inp.value; onChange(); });
    return field(label, inp, desc);
  };

  // --- 基本情報
  const basic = h('div.card.card-pad', { style: { marginBottom: '18px' } },
    h('h3', { style: { fontSize: '16px', marginBottom: '12px' }, text: '基本情報' }),
    text('店舗名', 'name', '例：DEMO雀荘 四麻館'),
    text('キャッチコピー', 'catch', '例：はじめての1半荘を、いちばん安心して打てる店。', 'カードと店舗ページの見出しに出ます'),
    text('地域', 'area', '例：東京都・新宿'),
    text('住所', 'address'),
    text('アクセス', 'access', '例：JR新宿駅 東口から徒歩5分'),
    text('営業時間', 'hours', '例：12:00〜翌5:00（年中無休）'),
    text('卓数', 'tables', '例：四人打ち 6卓'));

  const smoke = h('select');
  for (const s of SMOKING) smoke.appendChild(h('option', { value: s, text: s, selected: d.smoking === s }));
  smoke.addEventListener('change', () => { d.smoking = smoke.value; onChange(); });
  basic.appendChild(field('喫煙', smoke));

  const style = h('select');
  for (const s of ['ノーレート', '表記しない']) style.appendChild(h('option', { value: s, text: s, selected: d.style === s }));
  style.addEventListener('change', () => { d.style = style.value; onChange(); });
  basic.appendChild(field('レート', style, '金額の表記は掲載しません'));
  left.appendChild(basic);

  // --- 初心者歓迎度
  const beg = h('div.card.card-pad', { style: { marginBottom: '18px' } },
    h('h3', { style: { fontSize: '16px', marginBottom: '6px' }, text: '初心者歓迎度' }),
    h('p.tiny.muted', { style: { marginTop: '0' }, text: 'お客様が店を選ぶときに一番見る項目です。' }));
  const starRow = h('div.row.gap-6');
  for (let i = 1; i <= 5; i++) {
    const b = h('button.star-btn', { class: i <= d.beginner ? 'on' : '', 'aria-label': `${i}` });
    b.appendChild(h('span', { html: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5 6.1 20.6l1.2-6.5L2.5 9.5l6.6-.9z"/></svg>' }));
    b.addEventListener('click', () => { d.beginner = i; onChange(); });
    starRow.appendChild(b);
  }
  beg.appendChild(starRow);
  const note = h('textarea', { rows: '2', value: d.beginnerNote || '', placeholder: '例：講習卓あり。初回は必ずスタッフが同卓してルール説明します。' });
  note.addEventListener('input', () => { d.beginnerNote = note.value; onChange(); });
  beg.appendChild(field('初心者の方へのひとこと', note));
  left.appendChild(beg);

  // --- 雰囲気
  const mood = h('div.card.card-pad', { style: { marginBottom: '18px' } },
    h('h3', { style: { fontSize: '16px', marginBottom: '6px' }, text: '店の雰囲気' }),
    h('p.tiny.muted', { style: { marginTop: '0' }, text: '2つ以上えらぶと、お客様に伝わりやすくなります。' }));
  const moodRow = h('div.row.gap-6.wrapflex');
  for (const m of MOOD_CHOICES) {
    const on = (d.mood || []).includes(m);
    const c = h('span.chip.chip-btn', { class: on ? 'on' : '', text: m });
    c.addEventListener('click', () => {
      const cur = new Set(d.mood || []);
      if (on) cur.delete(m); else cur.add(m);
      d.mood = [...cur];
      onChange();
    });
    moodRow.appendChild(c);
  }
  mood.appendChild(moodRow);
  left.appendChild(mood);

  // --- 料金
  const price = h('div.card.card-pad', { style: { marginBottom: '18px' } },
    h('h3', { style: { fontSize: '16px', marginBottom: '6px' }, text: '料金' }),
    h('p.tiny.muted', { style: { marginTop: '0' }, text: 'セット・フリーの料金を入れてください。' }));
  d.priceLines = d.priceLines || [];
  d.priceLines.forEach((row, i) => {
    const l = h('input', { type: 'text', value: row.label, placeholder: '項目', style: { flex: '1 1 auto' } });
    const v = h('input', { type: 'text', value: row.value, placeholder: '金額', style: { width: '130px' } });
    l.addEventListener('input', () => { row.label = l.value; onChange(); });
    v.addEventListener('input', () => { row.value = v.value; onChange(); });
    const del = h('button.btn.btn-sm.btn-ghost', { text: '削除' });
    del.addEventListener('click', () => { d.priceLines.splice(i, 1); onChange(); });
    price.appendChild(h('div.row.gap-8', { style: { marginBottom: '8px' } }, l, v, del));
  });
  const addPrice = h('button.btn.btn-sm.btn-ghost', { text: '＋料金を追加' });
  addPrice.addEventListener('click', () => { d.priceLines.push({ label: '', value: '' }); onChange(); });
  price.appendChild(addPrice);
  left.appendChild(price);

  // --- スタッフ
  const staff = h('div.card.card-pad', { style: { marginBottom: '18px' } },
    h('h3', { style: { fontSize: '16px', marginBottom: '6px' }, text: 'スタッフ紹介' }),
    h('p.tiny.muted', { style: { marginTop: '0' }, text: '1名でも載せると、初めての方の不安が減ります。' }));
  d.staff = d.staff || [];
  d.staff.forEach((st, i) => {
    const n = h('input', { type: 'text', value: st.name, placeholder: '名前', style: { width: '130px' } });
    const r = h('input', { type: 'text', value: st.role, placeholder: '役割', style: { width: '110px' } });
    const w = h('input', { type: 'text', value: st.word, placeholder: 'ひとこと', style: { flex: '1 1 auto' } });
    n.addEventListener('input', () => { st.name = n.value; onChange(); });
    r.addEventListener('input', () => { st.role = r.value; onChange(); });
    w.addEventListener('input', () => { st.word = w.value; onChange(); });
    const del = h('button.btn.btn-sm.btn-ghost', { text: '削除' });
    del.addEventListener('click', () => { d.staff.splice(i, 1); onChange(); });
    staff.appendChild(h('div', { style: { marginBottom: '10px' } },
      h('div.row.gap-8', n, r, h('div.grow'), del),
      h('div', { style: { marginTop: '6px' } }, w)));
  });
  const addStaff = h('button.btn.btn-sm.btn-ghost', { text: '＋スタッフを追加' });
  addStaff.addEventListener('click', () => { d.staff.push({ name: '', role: 'スタッフ', word: '' }); onChange(); });
  staff.appendChild(addStaff);
  left.appendChild(staff);

  // --- 見た目・SNS
  const look = h('div.card.card-pad', { style: { marginBottom: '18px' } },
    h('h3', { style: { fontSize: '16px', marginBottom: '12px' }, text: '見た目とSNS' }));
  const hueRow = h('div.row.gap-6.wrapflex');
  for (const hue of [168, 200, 232, 268, 300, 340, 22, 48, 96]) {
    const on = (d.photo && d.photo.hue) === hue;
    const sw = h('button.hue-swatch', { class: on ? 'on' : '', style: { '--hue': String(hue) }, 'aria-label': `色 ${hue}` });
    sw.addEventListener('click', () => { d.photo = { ...(d.photo || {}), hue }; onChange(); });
    hueRow.appendChild(sw);
  }
  look.appendChild(field('店舗カードの色', hueRow, 'お店のイメージに近い色をえらんでください'));
  const iconSel = h('select');
  for (const [v, label] of [['table', '卓'], ['gem', '宝石'], ['flower', '華'], ['book', '教室'], ['pin', '地図']]) {
    iconSel.appendChild(h('option', { value: v, text: label, selected: (d.photo && d.photo.icon) === v }));
  }
  iconSel.addEventListener('change', () => { d.photo = { ...(d.photo || {}), icon: iconSel.value }; onChange(); });
  look.appendChild(field('カードのマーク', iconSel));

  const sx = h('input', { type: 'text', value: (d.sns && d.sns.x) || '', placeholder: '@your_shop' });
  sx.addEventListener('input', () => { d.sns = { ...(d.sns || {}), x: sx.value }; onChange(); });
  look.appendChild(field('SNS', sx, '来店の導線として使われます'));
  const sw2 = h('input', { type: 'text', value: (d.sns && d.sns.web) || '', placeholder: 'https://…' });
  sw2.addEventListener('input', () => { d.sns = { ...(d.sns || {}), web: sw2.value }; onChange(); });
  look.appendChild(field('ウェブサイト', sw2));
  left.appendChild(look);
}

// ---------------------------------------------------------------------------
function renderPreview(right, state) {
  const d = state.data;
  clear(right);

  const save = h('button.btn.btn-primary.btn-block', { text: 'この内容で保存' });
  save.addEventListener('click', () => {
    saveStore(state.id, d);
    save.textContent = '保存しました';
    setTimeout(() => { save.textContent = 'この内容で保存'; }, 1600);
  });
  const view = h('a.btn.btn-ghost.btn-block', {
    href: `#/store/${state.id}`, style: { marginTop: '8px' }, text: '店舗ページを開く',
  });
  right.appendChild(h('div.card.card-pad', { style: { marginBottom: '16px' } }, save, view));

  // お客様に見える形（店舗カード）
  right.appendChild(h('div.card.card-pad',
    h('div.label', { style: { marginBottom: '10px' }, text: 'お客様の見え方' }),
    h('div.card', { style: { overflow: 'hidden' } },
      h('div.store-photo', { style: { '--hue': String((d.photo && d.photo.hue) || 168), height: '96px' } },
        icon((d.photo && d.photo.icon) || 'table', 40)),
      h('div.card-pad', { style: { padding: '14px' } },
        h('div.row.gap-8', { style: { marginBottom: '6px' } },
          chip(d.style || 'ノーレート'), h('div.grow'),
          h('div.tiny.muted', { text: d.area || '地域未設定' })),
        h('h3', { style: { fontSize: '15px' }, text: d.name || '店舗名を入れてください' }),
        h('p.tiny.muted', { style: { margin: '4px 0 8px' }, text: d.catch || 'キャッチコピーが入ります' }),
        h('div.row.gap-8', { style: { marginBottom: '8px' } },
          h('div.tiny.muted', { text: '初心者歓迎度' }), stars(d.beginner || 0)),
        h('div.row.gap-4.wrapflex', (d.mood || []).slice(0, 4).map((m) => ruleChip(m)))))));

  right.appendChild(h('div.notice', { style: { marginTop: '14px' },
    text: 'この内容は端末内に保存されます。本番では店舗アカウントに保存されます。' }));
}
