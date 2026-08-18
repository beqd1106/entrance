/**
 * build-ios-www.js - iOSアプリに同梱するWeb資産を ios/www へまとめる
 *
 * 相対パス（web/js/*.js が ../../src/... を参照）をそのまま活かすため、
 * ディレクトリ構造を維持したままコピーする。
 *
 * 使い方: node scripts/build-ios-www.js
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'ios', 'www');

/** 同梱する対象（構造を保ったままコピー） */
const TARGETS = [
  { from: 'web', to: 'web' },
  { from: 'src', to: 'src' },
  { from: path.join('docs', 'proposal.html'), to: path.join('docs', 'proposal.html') },
];

/** アプリに含めないもの（サーバ前提のファイル） */
const EXCLUDE = new Set(['sw.js', 'tiles-preview.html']);

let files = 0;
let bytes = 0;

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      if (EXCLUDE.has(name)) continue;
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  files += 1;
  bytes += stat.size;
}

fs.rmSync(OUT, { recursive: true, force: true });
for (const t of TARGETS) {
  const from = path.join(ROOT, t.from);
  if (!fs.existsSync(from)) {
    console.warn(`  skip (not found): ${t.from}`);
    continue;
  }
  copyRecursive(from, path.join(OUT, t.to));
}

// アプリ内ではサービスワーカーを使わない（資産はバンドル同梱でオフライン動作するため）
const indexPath = path.join(OUT, 'web', 'index.html');
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8');
  html = html.replace(/<script>[\s\S]*?serviceWorker[\s\S]*?<\/script>/, '');
  html = html.replace('<link rel="manifest" href="manifest.webmanifest">', '');
  // アプリ内は完全オフライン動作にするため、外部フォント取得を外す
  // （iOSの標準日本語フォント Hiragino Sans にフォールバックする）
  html = html.replace(/<link rel="preconnect"[^>]*>\s*/g, '');
  html = html.replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>\s*/g, '');
  fs.writeFileSync(indexPath, html, 'utf8');
}

console.log(`ios/www に ${files} ファイル（${(bytes / 1024).toFixed(0)} KB）を配置しました`);
