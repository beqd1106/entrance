/**
 * recent.js - 直前に打った卓を覚えておく
 *
 * ホームから「前回の続き」をすぐ押せるようにするためだけの記録。
 * localStorage が使えない環境（iOSアプリの独自スキーム等）でも落ちない。
 */
const KEY = 'houserule.recentTable.v1';
let memory = null;

export function rememberTable(entry) {
  const rec = { ...entry, at: Date.now() };
  memory = rec;
  try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch { /* 覚えられなくても対局は続く */ }
  return rec;
}

export function lastTable() {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    memory = raw ? JSON.parse(raw) : null;
  } catch { memory = null; }
  return memory;
}

export function clearTable() {
  memory = null;
  try { localStorage.removeItem(KEY); } catch { /* 消せなくてもよい */ }
}
