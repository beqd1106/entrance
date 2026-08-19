/**
 * sw.js - オフライン対応のサービスワーカー
 * アプリシェルとエンジンを事前キャッシュし、機内モードでも対局できるようにする。
 */
const CACHE = 'houserule-v1';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/game.js',
  './js/editor.js',
  './js/ui.js',
  './js/tileart.js',
  './js/custom.js',
  './manifest.webmanifest',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  '../src/core/tiles.js',
  '../src/core/wall.js',
  '../src/core/hand.js',
  '../src/core/yaku.js',
  '../src/core/score.js',
  '../src/core/effects.js',
  '../src/core/engine.js',
  '../src/core/ai.js',
  '../src/rules/defaults.js',
  '../src/rules/presets.js',
  '../src/rules/validator.js',
  '../src/rules/explain.js',
  '../src/data/stores.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html'))),
  );
});
