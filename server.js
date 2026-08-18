/**
 * server.js - 依存ゼロの静的サーバ（デモ用）
 * 使い方: node server.js [ポート]
 * ブラウザで http://localhost:5173/ を開く
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.dirname(url.fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || 5173);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') {
    res.writeHead(302, { location: '/web/' });
    res.end();
    return;
  }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, '.' + p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`404 not found: ${p}`);
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(data);
  });
});
server.listen(PORT, () => {
  console.log(`JANDOOR demo: http://localhost:${PORT}/`);
});
