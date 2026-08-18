/**
 * custom.js - 店舗が保存したカスタムルールの永続化（デモではブラウザのlocalStorage）
 * 本番では店舗アカウントに紐づくレコードとしてサーバへ保存する想定。
 */
import { ALL_PRESETS, getPreset } from '../../src/rules/presets.js';

const KEY = 'entrance.customPresets.v1';

// iOSアプリ（独自スキーム）などlocalStorageが使えない環境でも動くようにする
let memory = null;

function readAll() {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    memory = raw ? JSON.parse(raw) : [];
  } catch {
    memory = [];
  }
  return memory;
}

function writeAll(list) {
  memory = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // 保存できない環境ではセッション中のみ保持する
  }
}

export function loadCustomPresets() {
  return readAll();
}

export function saveCustomPreset(preset) {
  writeAll([...readAll().filter((p) => p.id !== preset.id), preset]);
  return preset;
}

export function deleteCustomPreset(id) {
  writeAll(readAll().filter((p) => p.id !== id));
}

/** 標準プリセット＋保存済みカスタムから検索 */
export function lookupPreset(id) {
  const custom = loadCustomPresets().find((p) => p.id === id);
  if (custom) return custom;
  return getPreset(id);
}

export function allPresetsWithCustom() {
  return [...ALL_PRESETS, ...loadCustomPresets()];
}
