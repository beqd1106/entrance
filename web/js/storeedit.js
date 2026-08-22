/**
 * storeedit.js - 店舗情報の編集
 *
 * 対象は「麻雀には詳しいが、ITは得意ではない」店舗スタッフ。
 * 入力欄を並べるだけにせず、右側に「お客様の見え方」を常に出す。
 *
 * 保存先はデモとして端末内（localStorage）。本番では店舗アカウントに紐づくレコード。
 */
import { STORES, getStore } from '../../src/data/stores.js';
import { h, clear, icon, chip, ruleChip, stars, field, sectionHead, photoImg } from './ui.js';
import {
  hasServer, uploadPhoto, saveStore as apiSaveStore, editToken, saveEditToken, fetchStore,
} from './api.js';

const KEY = 'houserule.storeEdits.v1';

/** 端末に保存された編集内容を読み込む */
function loadEdits() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function saveEdits(all) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* 保存できなくても続行 */ }
}

/** サーバから取れた店舗情報。取れるまでは空で、取れたら重ねる。 */
const serverStores = new Map();

/**
 * 元データに、サーバの内容と端末の編集を重ねた店舗を返す（他の画面からも使う）。
 *
 * 重ねる順番は 元データ → サーバ → 端末。
 * 端末をいちばん上にするのは、保存前の入力を消さないため。
 */
export function resolveStore(id) {
  const base = getStore(id);
  const server = serverStores.get(id);
  const edit = loadEdits()[id];
  const merged = { ...base, ...(server || {}), ...(edit || {}) };
  // 画像URLには期限があるので、サーバが作りたてを返しているならそちらを使う
  if (server && server.photoUrl) merged.photoUrl = server.photoUrl;
  return merged;
}

/**
 * サーバの店舗情報を読み込んでおく。
 * 起動時に1回だけ呼ぶ。取れたら画面を描き直させる（取れなくても何も起きない）。
 */
export async function primeServerStores() {
  if (!hasServer()) return;
  const results = await Promise.all(STORES.map((s) => fetchStore(s.id)));
  let got = 0;
  results.forEach((r, i) => {
    if (!r.ok || !r.data || !r.data.store) return;
    const { storeId, published, updatedAt, ...fields } = r.data.store;
    // 値が入っている項目だけを重ねる（サーバ側が空でも元データを消さない）
    const clean = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== null && v !== undefined && v !== '') clean[k] = v;
    }
    serverStores.set(STORES[i].id, clean);
    got++;
  });
  if (got) window.dispatchEvent(new CustomEvent('houserule:stores-updated'));
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
  look.appendChild(photoField(d, onChange));

  const sx = h('input', { type: 'text', value: (d.sns && d.sns.x) || '', placeholder: '@your_shop' });
  sx.addEventListener('input', () => { d.sns = { ...(d.sns || {}), x: sx.value }; onChange(); });
  look.appendChild(field('SNS', sx, '来店の導線として使われます'));
  const sw2 = h('input', { type: 'text', value: (d.sns && d.sns.web) || '', placeholder: 'https://…' });
  sw2.addEventListener('input', () => { d.sns = { ...(d.sns || {}), web: sw2.value }; onChange(); });
  look.appendChild(field('ウェブサイト', sw2));
  left.appendChild(look);

  // --- お知らせ・イベント（店舗ページの「イベント・来店」に並ぶ）
  const nt = h('div.card.card-pad', { style: { marginBottom: '18px' } },
    h('h3', { style: { fontSize: '16px', marginBottom: '6px' }, text: 'お知らせ・イベント' }),
    h('p.tiny.muted', { style: { marginTop: '0' },
      text: '店舗ページの「イベント・来店」に出ます。掲載する期間を決められます（空欄なら常時掲載）。対局のルールには影響しません。' }));
  d.notices = d.notices || [];
  d.notices.forEach((n, i) => {
    const title = h('input', { type: 'text', value: n.title || '', placeholder: '例：毎週水曜は初心者卓の日' });
    title.addEventListener('input', () => { n.title = title.value; onChange(); });
    const body = h('textarea', { rows: '2', value: n.body || '', placeholder: '内容（任意）' });
    body.addEventListener('input', () => { n.body = body.value; onChange(); });
    const kind = h('select');
    for (const [v, label] of [['notice', 'お知らせ'], ['event', 'イベント']]) {
      kind.appendChild(h('option', { value: v, text: label, selected: (n.kind || 'notice') === v }));
    }
    kind.addEventListener('change', () => { n.kind = kind.value; onChange(); });
    const from = h('input', { type: 'date', value: n.startAt || '' });
    from.addEventListener('change', () => { n.startAt = from.value; onChange(); });
    const to = h('input', { type: 'date', value: n.endAt || '' });
    to.addEventListener('change', () => { n.endAt = to.value; onChange(); });
    const del = h('button.btn.btn-sm.btn-ghost', { text: '削除' });
    del.addEventListener('click', () => { d.notices.splice(i, 1); onChange(); });
    nt.appendChild(h('div.coupon-edit',
      h('div.row.gap-8', { style: { marginBottom: '8px' } },
        h('span.tiny.muted', { text: `${i + 1}件目` }), h('div.grow'), del),
      field('種類', kind, 'イベントにすると朱色で目立ちます'),
      field('見出し', title),
      field('内容', body),
      h('div.row.gap-12.wrapflex',
        field('掲載開始', from, '空欄なら今すぐから'),
        field('掲載終了', to, '空欄なら期限なし'))));
  });
  const addNt = h('button.btn.btn-sm.btn-ghost', { text: '＋お知らせを追加' });
  addNt.addEventListener('click', () => {
    d.notices.push({ id: `n_${Date.now().toString(36)}`, kind: 'notice', title: '新しいお知らせ', body: '', startAt: '', endAt: '' });
    onChange();
  });
  nt.appendChild(addNt);
  left.appendChild(nt);

  // --- クーポン（会員カードに並ぶ）
  const cp = h('div.card.card-pad', { style: { marginBottom: '18px' } },
    h('h3', { style: { fontSize: '16px', marginBottom: '6px' }, text: 'クーポン' }),
    h('p.tiny.muted', { style: { marginTop: '0' },
      text: '会員カードに並びます。条件に届いたお客様から順に使えるようになります。店頭で提示していただく案内なので、アプリの中で支払いは発生しません。' }));
  d.coupons = d.coupons || [];
  d.coupons.forEach((c, i) => {
    const title = h('input', { type: 'text', value: c.title || '', placeholder: '例：フリー1半荘 100円引き' });
    title.addEventListener('input', () => { c.title = title.value; onChange(); });
    const body = h('input', { type: 'text', value: c.body || '', placeholder: '使い方や条件の説明（任意）' });
    body.addEventListener('input', () => { c.body = body.value; onChange(); });
    c.requires = c.requires || {};
    const plays = h('input', { type: 'number', step: '1', value: String(c.requires.plays || 0), style: { width: '80px' } });
    plays.addEventListener('change', () => { c.requires.plays = Number(plays.value); onChange(); });
    const visits = h('input', { type: 'number', step: '1', value: String(c.requires.checkins || 0), style: { width: '80px' } });
    visits.addEventListener('change', () => { c.requires.checkins = Number(visits.value); onChange(); });
    const until = h('input', { type: 'date', value: c.until || '' });
    until.addEventListener('change', () => { c.until = until.value; onChange(); });
    const del = h('button.btn.btn-sm.btn-ghost', { text: '削除' });
    del.addEventListener('click', () => { d.coupons.splice(i, 1); onChange(); });
    cp.appendChild(h('div.coupon-edit',
      h('div.row.gap-8', { style: { marginBottom: '8px' } },
        h('span.tiny.muted', { text: `クーポン${i + 1}` }), h('div.grow'), del),
      field('タイトル', title),
      field('説明', body),
      h('div.row.gap-12.wrapflex',
        field('体験プレイ', plays, '何回でこのクーポンが開くか（0で最初から）'),
        field('来店', visits, '来店の回数（0で条件にしない）'),
        field('期限', until, '空欄なら期限なし'))));
  });
  const addCp = h('button.btn.btn-sm.btn-ghost', { text: '＋クーポンを追加' });
  addCp.addEventListener('click', () => {
    d.coupons.push({
      id: `cp_${Date.now().toString(36)}`,
      title: '新しいクーポン', body: '', requires: {},
    });
    onChange();
  });
  cp.appendChild(addCp);
  left.appendChild(cp);
}

/**
 * 店舗写真の差し替え。
 * 画像はサーバを通さず署名付きURLでS3へ直接送るので、大きな画像でも詰まらない。
 * サーバに繋がっていないときは、色とマークで代用していることを説明する。
 */
function photoField(d, onChange) {
  if (!hasServer()) {
    return field('店舗写真', h('p.tiny.muted', { style: { margin: 0 },
      text: 'いまはサーバに接続していないため、上の色とマークがカードの絵になります。' }));
  }
  const box = h('div');
  const status = h('div.tiny.muted', { style: { marginTop: '6px' } });

  const preview = h('div.photo-preview');
  const drawPreview = () => {
    clear(preview);
    if (d.photoUrl) {
      preview.appendChild(h('img', { src: d.photoUrl, alt: '店舗写真' }));
      const del = h('button.btn.btn-ghost.btn-sm', { text: '写真を外す' });
      del.addEventListener('click', () => { d.photoUrl = ''; d.photoKey = ''; onChange(); });
      preview.appendChild(del);
    } else {
      preview.appendChild(h('p.tiny.muted', { style: { margin: 0 }, text: '未設定（色とマークが表示されます）' }));
    }
  };
  drawPreview();

  const input = h('input', {
    type: 'file', name: 'storePhoto', id: `storePhoto-${d.id}`,
    accept: 'image/jpeg,image/png,image/webp',
  });
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    status.textContent = 'アップロード中…';
    status.className = 'tiny muted';
    const r = await uploadPhoto(d.id, file);
    input.value = '';
    if (!r.ok) {
      status.textContent = r.error === 'offline' ? 'サーバに接続していません' : r.error;
      status.className = 'tiny err';
      return;
    }
    d.photoKey = r.data.key;   // 保存するのは置き場所だけ
    d.photoUrl = r.data.url;   // 画面にすぐ出すための期限付きURL
    status.textContent = 'アップロードしました';
    status.className = 'tiny ok';
    onChange();
  });

  box.appendChild(preview);
  box.appendChild(input);
  box.appendChild(status);
  return field('店舗写真', box, 'JPEG・PNG・WebP／4MBまで。横長の写真がきれいに収まります');
}

/** ボタンの文言を一時的に変える（0を渡すと戻さない） */
function flash(btn, text, backAfter = 1600) {
  btn.textContent = text;
  if (backAfter) setTimeout(() => { btn.textContent = 'この内容で保存'; }, backAfter);
}

/**
 * 編集キーの入力。
 * サーバ上の店舗は、キーを持っている人だけが直せる。
 * 店舗には運営からこのキーを渡し、最初に1回だけ貼ってもらう。
 */
function editKeyCard(storeId) {
  if (!hasServer()) return null;
  const has = !!editToken(storeId);
  const box = h('div.card.card-pad', { style: { marginBottom: '16px' } },
    h('div.label', { style: { marginBottom: '6px' }, text: '編集キー' }),
    h('p.tiny.muted', { style: { margin: '0 0 10px' },
      text: has
        ? 'この端末は、この店舗を編集できます。'
        : '運営から受け取ったキーを貼ると、この店舗を編集・公開できるようになります。' }));
  // ブラウザにパスワード管理として扱わせないため、form で囲んで自動補完も切る
  const inp = h('input', {
    type: 'password',
    placeholder: has ? '••••••••（設定済み）' : 'キーを貼り付け',
    autocomplete: 'off',
    name: `edit-key-${storeId}`,
  });
  const form = h('form', { style: { margin: '0' } });
  form.addEventListener('submit', (e) => e.preventDefault());
  const btn = h('button.btn.btn-ghost.btn-sm', { style: { marginTop: '8px' }, text: has ? 'キーを入れ直す' : 'キーを保存' });
  const note = h('div.tiny.muted', { style: { marginTop: '6px' } });
  btn.addEventListener('click', () => {
    const v = inp.value.trim();
    if (!v) { note.textContent = 'キーを入力してください'; note.className = 'tiny err'; return; }
    saveEditToken(storeId, v);
    inp.value = '';
    note.textContent = 'この端末に保存しました。もう一度保存を押してください。';
    note.className = 'tiny ok';
  });
  form.appendChild(inp);
  form.appendChild(btn);
  form.appendChild(note);
  box.appendChild(form);
  return box;
}

// ---------------------------------------------------------------------------
function renderPreview(right, state) {
  const d = state.data;
  clear(right);

  const save = h('button.btn.btn-primary.btn-block', { text: 'この内容で保存' });
  const saveNote = h('div.tiny.muted', { style: { marginTop: '8px', textAlign: 'center' } });
  save.addEventListener('click', async () => {
    // まず端末内に保存する。サーバが落ちていても入力が消えないようにする。
    saveStore(state.id, d);
    if (!hasServer()) {
      flash(save, '保存しました');
      saveNote.textContent = 'この端末に保存しました';
      return;
    }
    save.disabled = true;
    flash(save, '保存しています…', 0);
    const r = await apiSaveStore(state.id, { published: true, store: d, rules: undefined });
    save.disabled = false;
    if (r.ok) {
      flash(save, '保存しました');
      saveNote.textContent = 'お客様に公開されました';
      saveNote.className = 'tiny ok';
    } else {
      flash(save, 'この内容で保存', 0);
      saveNote.textContent = `${r.error}（この端末には保存済みです）`;
      saveNote.className = 'tiny err';
    }
  });
  const view = h('a.btn.btn-ghost.btn-block', {
    href: `#/store/${state.id}`, style: { marginTop: '8px' }, text: '店舗ページを開く',
  });
  right.appendChild(h('div.card.card-pad', { style: { marginBottom: '16px' } }, save, saveNote, view));
  const key = editKeyCard(state.id);
  if (key) right.appendChild(key);

  // お客様に見える形（店舗カード）
  right.appendChild(h('div.card.card-pad',
    h('div.label', { style: { marginBottom: '10px' }, text: 'お客様の見え方' }),
    h('div.card', { style: { overflow: 'hidden' } },
      h('div.store-photo', { style: { '--hue': String((d.photo && d.photo.hue) || 168), height: '96px' } },
        d.photoUrl ? photoImg(d.photoUrl) : null,
        d.photoUrl ? null : icon((d.photo && d.photo.icon) || 'table', 40)),
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
