/**
 * check-offline-assets.js - オフラインで動くのに要るファイルが、全部先に取られているか
 *
 * このアプリは「機内モードでも最後まで打てる」ことを謳っている。
 * ファイルを1つ足してサービスワーカーの一覧に書き忘れると、
 * 電波の無いところで開いた人だけが白い画面になる。手元では気づけない。
 *
 * web/js と src の .js、それに index.html が読む css を突き合わせる。
 *
 *   node test/check-offline-assets.js
 */
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const sw = readFileSync(join('web', 'sw.js'), 'utf8');

/** 一覧に載っているか（./ と ../ の書き方の違いを吸収する） */
function listed(rel) {
  const tail = rel.split(String.fromCharCode(92)).join('/');
  return sw.includes(`'./${tail}'`) || sw.includes(`'../${tail}'`)
    || sw.includes(`"./${tail}"`) || sw.includes(`"../${tail}"`);
}

const missing = [];

/** web/js の中身は './js/xxx.js' として載る */
for (const name of readdirSync(join('web', 'js'))) {
  if (!/\.js$/.test(name)) continue;
  if (!listed(`js/${name}`)) missing.push(`web/js/${name}`);
}

/** src の中身は '../src/…' として載る */
function walkSrc(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkSrc(p, out);
    else if (/\.js$/.test(name)) out.push(p);
  }
  return out;
}
for (const p of walkSrc('src')) {
  if (!listed(p)) missing.push(p);
}

/** 画面の見た目に要るもの */
for (const p of ['web/css/style.css', 'web/index.html', 'web/config.js', 'web/manifest.webmanifest']) {
  if (!existsSync(p)) continue;
  if (!listed(p.replace(/^web\//, ''))) missing.push(p);
}

if (missing.length) {
  console.log('=== オフライン用の一覧に載っていないファイル ===');
  for (const m of missing) console.log(' - ' + m);
  console.log('\nweb/sw.js の ASSETS に足してください（足したらキャッシュ名も上げること）。');
  process.exit(1);
}
console.log('=== オフライン：読み込むファイルはすべて先に取ってある ===');
