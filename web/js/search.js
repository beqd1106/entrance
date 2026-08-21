/**
 * search.js - キーワード検索の共通部品
 *
 * 表記ゆれ（ひらがな／カタカナ、全角／半角、大文字小文字、スペース）を吸収して
 * 「入力したとおりでなくても引っかかる」ことを優先する。
 * 検索対象の文字列づくりも、店舗・ルールでここに集約する。
 */
import { resolveRules } from '../../src/rules/defaults.js';
import { shortSummary } from '../../src/rules/explain.js';

/** 比較用に正規化する。ひらがな→カタカナ、全角英数→半角、空白と記号を落とす */
export function normalize(s) {
  return String(s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[\s・･、,.／/]/g, '');
}

/** 空白区切りのAND検索。すべての語が含まれていればヒット */
export function matchText(haystack, query) {
  const q = normalize(query);
  if (!q) return true;
  const hay = normalize(haystack);
  return String(query).trim().split(/[\s　]+/).filter(Boolean)
    .every((w) => hay.includes(normalize(w)));
}

/** 店舗の検索対象テキスト（店名・エリア・雰囲気・ルールの特徴まで含める） */
export function storeHaystack(store, rules) {
  return [
    store.name, store.catch, store.area, store.address, store.access,
    store.style, store.smoking, store.hours, store.tables,
    (store.mood || []).join(' '),
    (store.tags || []).join(' '),
    (store.ruleHighlights || []).join(' '),
    rules ? shortSummary(rules) : '',
  ].filter(Boolean).join(' ');
}

/** ルールプリセットの検索対象テキスト */
export function presetHaystack(preset) {
  let sum = '';
  try { sum = shortSummary(resolveRules(preset.rules)); } catch { sum = ''; }
  return [
    preset.name, preset.description, preset.category,
    (preset.tags || []).join(' '), sum,
  ].filter(Boolean).join(' ');
}

/**
 * 検索入力欄。虫めがね・クリアボタン・件数表示を持つ。
 * onInput は打つたびに呼ばれる（件数の即時反映のため意図的にデバウンスしない）。
 */
export function searchField(opts) {
  const { value = '', placeholder = '検索', onInput, label, help } = opts;
  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'search-input';
  input.value = value;
  input.placeholder = placeholder;
  input.id = opts.id || `search-${Math.random().toString(36).slice(2, 8)}`;
  input.setAttribute('name', input.id);
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('enterkeyhint', 'search');

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'search-clear';
  clearBtn.setAttribute('aria-label', '検索条件を消す');
  clearBtn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  const box = document.createElement('div');
  box.className = 'search-box';
  box.innerHTML = '<span class="search-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg></span>';
  box.appendChild(input);
  box.appendChild(clearBtn);

  const sync = () => { box.classList.toggle('has-value', input.value.trim().length > 0); };
  sync();
  input.addEventListener('input', () => { sync(); onInput(input.value); });
  clearBtn.addEventListener('click', () => {
    input.value = '';
    sync();
    onInput('');
    input.focus();
  });

  const wrap = document.createElement('div');
  wrap.className = 'search-field';
  if (label) {
    const l = document.createElement('label');
    l.className = 'search-label';
    l.htmlFor = input.id;
    l.textContent = label;
    wrap.appendChild(l);
  }
  wrap.appendChild(box);
  if (help) {
    const p = document.createElement('p');
    p.className = 'search-help';
    p.textContent = help;
    wrap.appendChild(p);
  }
  wrap.input = input;
  return wrap;
}
