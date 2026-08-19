/**
 * artwork.js - 画面内の説明イラスト
 *
 * 方針：外部画像に依存しないインラインSVG。UIの配色トークンを継承し、
 * 情報の邪魔をしないフラットな図に留める。
 * イラストが無くても画面が成立することを前提に、補強としてだけ使う。
 */
import { h } from './ui.js';

const ART = {
  /** 検索結果が0件のとき */
  empty: `<svg viewBox="0 0 220 140" aria-hidden="true">
    <rect x="30" y="34" width="64" height="82" rx="12" class="aw-card"/>
    <rect x="102" y="34" width="64" height="82" rx="12" class="aw-card dim"/>
    <rect x="44" y="50" width="36" height="7" rx="3.5" class="aw-mute"/>
    <rect x="44" y="64" width="24" height="7" rx="3.5" class="aw-mute"/>
    <circle cx="168" cy="96" r="20" class="aw-lens"/>
    <circle cx="168" cy="96" r="12" class="aw-bg"/>
    <path d="M182 111 L198 127" class="aw-stroke"/>
  </svg>`,

  /** アリスの説明（和了 → めくる → 一致で続く） */
  alice: `<svg viewBox="0 0 300 110" aria-hidden="true">
    <rect x="10" y="34" width="46" height="60" rx="9" class="aw-tile"/>
    <text x="33" y="72" class="aw-label">和了</text>
    <path d="M64 64 L86 64" class="aw-arrow"/>
    <rect x="94" y="34" width="42" height="60" rx="9" class="aw-tile back"/>
    <text x="115" y="112" class="aw-cap">めくる</text>
    <path d="M144 64 L166 64" class="aw-arrow"/>
    <rect x="174" y="34" width="42" height="60" rx="9" class="aw-tile hit"/>
    <text x="195" y="112" class="aw-cap">一致</text>
    <path d="M224 64 L246 64" class="aw-arrow"/>
    <rect x="254" y="34" width="42" height="60" rx="9" class="aw-tile back"/>
    <text x="275" y="112" class="aw-cap">もう1枚</text>
  </svg>`,

  /** 華牌（抜いて即補充） */
  flower: `<svg viewBox="0 0 300 110" aria-hidden="true">
    <rect x="16" y="30" width="42" height="60" rx="9" class="aw-tile flower"/>
    <text x="37" y="66" class="aw-label">華</text>
    <path d="M66 60 L92 60" class="aw-arrow"/>
    <text x="122" y="52" class="aw-cap">手牌から抜く</text>
    <path d="M158 60 L184 60" class="aw-arrow"/>
    <rect x="192" y="30" width="42" height="60" rx="9" class="aw-tile"/>
    <text x="213" y="104" class="aw-cap">すぐ引く</text>
    <circle cx="264" cy="60" r="18" class="aw-lens"/>
    <text x="264" y="66" class="aw-label light">効果</text>
  </svg>`,

  /** 白ポッチ */
  pocchi: `<svg viewBox="0 0 300 110" aria-hidden="true">
    <rect x="20" y="26" width="46" height="66" rx="10" class="aw-tile"/>
    <circle cx="43" cy="59" r="9" class="aw-red"/>
    <text x="43" y="106" class="aw-cap">白ポッチ</text>
    <path d="M76 59 L102 59" class="aw-arrow"/>
    <text x="150" y="52" class="aw-cap">リーチ後にツモると</text>
    <path d="M198 59 L224 59" class="aw-arrow"/>
    <rect x="232" y="26" width="46" height="66" rx="10" class="aw-tile hit"/>
    <text x="255" y="106" class="aw-cap">好きな牌に</text>
  </svg>`,

  /** 五等サンマの構成 */
  goto: `<svg viewBox="0 0 300 120" aria-hidden="true">
    <rect x="12" y="16" width="80" height="34" rx="8" class="aw-chip teal"/>
    <text x="52" y="38" class="aw-cap dark">三人麻雀</text>
    <rect x="100" y="16" width="88" height="34" rx="8" class="aw-chip amber"/>
    <text x="144" y="38" class="aw-cap dark">華牌の効果</text>
    <rect x="196" y="16" width="92" height="34" rx="8" class="aw-chip sky"/>
    <text x="242" y="38" class="aw-cap dark">白ポッチ</text>
    <rect x="12" y="60" width="88" height="34" rx="8" class="aw-chip teal"/>
    <text x="56" y="82" class="aw-cap dark">北抜き</text>
    <rect x="108" y="60" width="96" height="34" rx="8" class="aw-chip violet"/>
    <text x="156" y="82" class="aw-cap dark">常時ドラ2枚</text>
    <rect x="212" y="60" width="76" height="34" rx="8" class="aw-chip amber"/>
    <text x="250" y="82" class="aw-cap dark">サイコロ</text>
  </svg>`,
};

/** 説明イラストを返す（未定義なら null） */
export function artwork(kind, opts = {}) {
  const svg = ART[kind];
  if (!svg) return null;
  return h('div.aw', { class: opts.small ? 'aw-small' : '', html: svg });
}

/** 空状態（結果0件など） */
export function emptyState(title, body, action) {
  return h('div.empty-state',
    artwork('empty'),
    h('h3', { text: title }),
    h('p', { text: body }),
    action || null);
}
