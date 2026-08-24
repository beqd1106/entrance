/**
 * check-reduced-motion.js - 動きを減らす設定で、止め忘れが無いかを確かめる
 *
 * 目が回りやすい人やめまいのある人のために、OSの「視差効果を減らす」を
 * 入れている人がいる。ずっと動き続けるもの（infinite）を止め忘れると、
 * その人にとっては画面が延々と揺れ続ける。
 *
 * 追加した演出ごとに手で足していく作りだと必ず漏れるので、
 * CSSから「無限に動くもの」を全部拾って、prefers-reduced-motion の
 * ブロックで止めているかを突き合わせる。
 *
 *   node test/check-reduced-motion.js
 */
import { readFileSync } from 'node:fs';

const css = readFileSync('web/css/style.css', 'utf8');

/** 無限に動く指定（セレクタとアニメ名） */
const infinite = [...css.matchAll(/([^{}]+)\{[^{}]*animation:[^;]*infinite[^;]*;/g)]
  .map((m) => {
    const sel = m[1].trim().split('\n').pop().trim();
    const name = (m[0].match(/animation:\s*([A-Za-z0-9_-]+)/) || [])[1] || '?';
    return { sel, name };
  });

/** prefers-reduced-motion の中で animation: none にしているセレクタ */
const stopped = [];
for (const m of css.matchAll(/@media[^{]*prefers-reduced-motion[^{]*\{([\s\S]*?)\n\}/g)) {
  for (const line of m[1].split('\n')) {
    if (!/animation:\s*none/.test(line)) continue;
    const sel = line.split('{')[0].trim();
    for (const one of sel.split(',')) stopped.push(one.trim());
  }
}

/** そのセレクタが止められているか。末尾の1語が一致すれば同じものとみなす */
const tail = (s) => s.split(/\s+/).pop();
const isStopped = (sel) => stopped.some((s) => s === sel || tail(s) === tail(sel));

const missing = infinite.filter((x) => !isStopped(x.sel));

if (!infinite.length) {
  console.log('無限に動く指定を1つも読み取れませんでした。読み方を見直してください。');
  process.exit(1);
}
if (missing.length) {
  console.log('=== 動きを減らす設定で止め忘れているもの ===');
  for (const m of missing) console.log(` - ${m.name}（${m.sel}）`);
  console.log('\n@media (prefers-reduced-motion: reduce) に animation: none を足してください。');
  process.exit(1);
}
console.log(`=== 動き：無限に動く${infinite.length}件とも、減らす設定で止まる ===`);
