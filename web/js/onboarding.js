/**
 * onboarding.js - 初回訪問時のかんたんな案内
 *
 * 目的は「何ができるサービスか」を4枚で伝えること。
 * 読み飛ばせること・二度と出ないことを優先し、引き止めない。
 */
import { h, clear, icon } from './ui.js';

const KEY = 'houserule.onboarded.v1';

const SLIDES = [
  {
    art: 'search',
    title: 'ルールで店を探せます',
    body: '「白ポッチがある店」「五等サンマができる店」のように、'
      + 'ハウスルールから雀荘を探せます。地域や料金だけでは分からない、店の個性で選べます。',
  },
  {
    art: 'diff',
    title: '普通と違うところだけ分かります',
    body: 'ルール表を最初から読む必要はありません。'
      + '「一般的なルールと違うのはこの項目だけ」という形で表示されるので、覚えることは最小限です。',
  },
  {
    art: 'play',
    title: '行く前に、その店のルールで打てます',
    body: 'お店のハウスルールをそのまま読み込んで、CPU3人と対局できます。'
      + '知らないルールを、誰にも見られない場所で先に試せます。',
  },
  {
    art: 'visit',
    title: '気に入ったら、お店へ',
    body: '雰囲気・スタッフ・料金・営業時間も見られます。'
      + 'ポイントはアプリの中だけのもので、お金とは交換できません。安心して試してください。',
  },
];

/** 説明用のかんたんな図（外部画像に依存しない） */
function artwork(kind) {
  const svg = {
    search: `<svg viewBox="0 0 200 120" aria-hidden="true">
      <rect x="14" y="22" width="60" height="76" rx="10" class="ob-card"/>
      <rect x="80" y="22" width="60" height="76" rx="10" class="ob-card"/>
      <rect x="146" y="22" width="40" height="76" rx="10" class="ob-card dim"/>
      <rect x="24" y="34" width="40" height="8" rx="4" class="ob-tag a"/>
      <rect x="24" y="48" width="28" height="8" rx="4" class="ob-tag b"/>
      <rect x="90" y="34" width="34" height="8" rx="4" class="ob-tag c"/>
      <rect x="90" y="48" width="42" height="8" rx="4" class="ob-tag a"/>
      <circle cx="150" cy="96" r="18" class="ob-lens"/>
      <path d="M163 109 L178 124" class="ob-stroke"/>
    </svg>`,
    diff: `<svg viewBox="0 0 200 120" aria-hidden="true">
      <rect x="18" y="18" width="164" height="84" rx="12" class="ob-card"/>
      <rect x="32" y="34" width="60" height="7" rx="3.5" class="ob-mute"/>
      <rect x="110" y="34" width="58" height="7" rx="3.5" class="ob-mute"/>
      <rect x="32" y="54" width="60" height="7" rx="3.5" class="ob-mute"/>
      <rect x="110" y="54" width="58" height="7" rx="3.5" class="ob-tag a"/>
      <rect x="32" y="74" width="60" height="7" rx="3.5" class="ob-mute"/>
      <rect x="110" y="74" width="40" height="7" rx="3.5" class="ob-tag c"/>
      <path d="M96 57 L106 57" class="ob-stroke"/>
      <path d="M96 77 L106 77" class="ob-stroke"/>
    </svg>`,
    play: `<svg viewBox="0 0 200 120" aria-hidden="true">
      <rect x="20" y="20" width="160" height="80" rx="16" class="ob-felt"/>
      <rect x="46" y="66" width="20" height="28" rx="5" class="ob-tile"/>
      <rect x="70" y="66" width="20" height="28" rx="5" class="ob-tile"/>
      <rect x="94" y="66" width="20" height="28" rx="5" class="ob-tile hi"/>
      <rect x="118" y="66" width="20" height="28" rx="5" class="ob-tile"/>
      <circle cx="100" cy="44" r="13" class="ob-lens"/>
      <circle cx="100" cy="44" r="7" class="ob-felt"/>
      <circle cx="100" cy="44" r="3" class="ob-lens"/>
    </svg>`,
    visit: `<svg viewBox="0 0 200 120" aria-hidden="true">
      <path d="M46 56 L100 24 L154 56 L154 100 L46 100 Z" class="ob-card"/>
      <rect x="86" y="70" width="28" height="30" rx="4" class="ob-tag c"/>
      <path d="M38 56 L100 18 L162 56" class="ob-stroke"/>
      <circle cx="100" cy="48" r="9" class="ob-lens"/>
    </svg>`,
  }[kind];
  return h('div.ob-art', { html: svg });
}

export function shouldShowOnboarding() {
  try { return localStorage.getItem(KEY) !== '1'; } catch { return false; }
}

function markDone() {
  try { localStorage.setItem(KEY, '1'); } catch { /* 保存できなくても続行 */ }
}

/** 初回案内を表示する。閉じたら二度と出ない。 */
export function showOnboarding(onFinish) {
  let idx = 0;
  const overlay = h('div.overlay.ob-overlay');
  const sheet = h('div.sheet.ob-sheet');
  overlay.appendChild(sheet);

  const close = () => {
    markDone();
    overlay.remove();
    if (onFinish) onFinish();
  };

  const render = () => {
    const s = SLIDES[idx];
    clear(sheet);
    sheet.appendChild(h('div.ob-body',
      artwork(s.art),
      h('h3.ob-title', { text: s.title }),
      h('p.ob-text', { text: s.body })));

    const dots = h('div.ob-dots', SLIDES.map((_, i) => {
      const d = h('button.ob-dot', { class: i === idx ? 'on' : '', 'aria-label': `${i + 1}枚目` });
      d.addEventListener('click', () => { idx = i; render(); });
      return d;
    }));

    const skip = h('button.btn.btn-ghost.btn-sm', { text: idx === SLIDES.length - 1 ? '使い方を見る' : 'スキップ' });
    skip.addEventListener('click', () => {
      const last = idx === SLIDES.length - 1;
      close();
      if (last) location.hash = '#/manual';
    });

    const next = h('button.btn.btn-brass', { text: idx === SLIDES.length - 1 ? '店を探してみる' : '次へ' });
    next.addEventListener('click', () => {
      if (idx === SLIDES.length - 1) { close(); location.hash = '#/stores'; return; }
      idx += 1;
      render();
    });

    sheet.appendChild(h('div.ob-foot', skip, dots, next));
  };

  render();
  document.body.appendChild(overlay);
}
