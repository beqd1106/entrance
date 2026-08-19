/**
 * seed-api.mjs - デモ店舗をサーバへ登録する
 *
 *   HOUSERULE_API=https://... ADMIN_TOKEN=... node scripts/seed-api.mjs
 *
 * src/data/stores.js を正として、サーバ側の内容を上書きする。
 * 手で入れ直すと画面とデータがずれていくので、常にここから流し込む。
 */
import { STORES } from '../src/data/stores.js';
import { PRESETS } from '../src/rules/presets.js';

const BASE = (process.env.HOUSERULE_API || '').replace(/\/+$/, '');
const TOKEN = process.env.ADMIN_TOKEN || '';
if (!BASE || !TOKEN) {
  console.error('HOUSERULE_API と ADMIN_TOKEN を環境変数で渡してください');
  process.exit(1);
}

const presetOf = (id) => PRESETS.find((p) => p.id === id);

for (const s of STORES) {
  const preset = presetOf(s.presetId);
  const payload = {
    published: true,
    store: {
      name: s.name, catch: s.catch, area: s.area, address: s.address,
      access: s.access, hours: s.hours, tables: s.tables, smoking: s.smoking,
      style: s.style, beginner: s.beginner, beginnerNote: s.beginnerNote,
      mood: s.mood, ruleHighlights: s.ruleHighlights,
      sns: s.sns,
    },
    rules: preset ? preset.rules : {},
  };

  const res = await fetch(`${BASE}/stores/${encodeURIComponent(s.id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-edit-token': TOKEN },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  console.log(`${res.ok ? 'OK  ' : 'NG  '} ${s.id}  ${res.status}  ${text.slice(0, 120)}`);
}

const list = await fetch(`${BASE}/stores`).then((r) => r.json());
console.log(`\n登録済み: ${list.stores.map((x) => x.name).join(' / ')}`);
