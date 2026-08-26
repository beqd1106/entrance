/**
 * sw.js - オフライン対応のサービスワーカー
 *
 * アプリシェルとエンジンを事前キャッシュし、機内モードでも対局できるようにする。
 *
 * 取り出し方は2種類に分ける。
 *   コード（HTML/JS/CSS）… まずネットワーク。取れたら保存し、取れなければ保存分を使う。
 *   それ以外（画像・アイコン等）… まず保存分。無ければネットワーク。
 * コードをキャッシュ優先にすると、更新してもキャッシュ名を変えるまで古い画面が出続ける。
 * 実際にそれで「直したはずの画面が変わらない」状態が起きたので、この形にしている。
 */
const CACHE = 'houserule-v71';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/hub.js',
  './js/table.js',
  './js/search.js',
  './js/marks.js',
  './js/recent.js',
  './js/member.js',
  './js/game.js',
  './js/sound.js',
  './img/ui/riichi-big.webp',
  './img/wall-h.webp',
  './img/wall-v.webp',
  './js/editor.js',
  './js/ui.js',
  './js/tileart.js',
  './js/barcode.js',
  './js/custom.js',
  './js/dashboard.js',
  './js/onboarding.js',
  './js/artwork.js',
  './js/storeedit.js',
  './img/ui/chip.png',
  './img/ui/win.png',
  './img/felt.webp',
  './img/felt-ai.webp',
  './img/felt-en.webp',
  './img/felt-sakura.webp',
  './img/ui/riichi.webp',
  './img/ui/kan.webp',
  './js/api.js',
  './js/net.js',
  './js/online.js',
  './js/manual.js',
  './config.js',
  './manifest.webmanifest',
  // 牌の絵柄（CC0 / FluffyStuff/riichi-mahjong-tiles）。
  // 対局はオフラインでも最後まで打てる必要があるので、まとめて先に取る
  './img/tiles/Back.svg',
  './img/tiles/Chun.svg',
  './img/tiles/Front.svg',
  './img/tiles/Haku.svg',
  './img/tiles/Hatsu.svg',
  './img/tiles/Man1.svg',
  './img/tiles/Man2.svg',
  './img/tiles/Man3.svg',
  './img/tiles/Man4.svg',
  './img/tiles/Man5.svg',
  './img/tiles/Man5-Dora.svg',
  './img/tiles/Man6.svg',
  './img/tiles/Man7.svg',
  './img/tiles/Man8.svg',
  './img/tiles/Man9.svg',
  './img/tiles/Nan.svg',
  './img/tiles/Pei.svg',
  './img/tiles/Pin1.svg',
  './img/tiles/Pin2.svg',
  './img/tiles/Pin3.svg',
  './img/tiles/Pin4.svg',
  './img/tiles/Pin5.svg',
  './img/tiles/Pin5-Dora.svg',
  './img/tiles/Pin6.svg',
  './img/tiles/Pin7.svg',
  './img/tiles/Pin8.svg',
  './img/tiles/Pin9.svg',
  './img/tiles/Shaa.svg',
  './img/tiles/Sou1.svg',
  './img/tiles/Sou2.svg',
  './img/tiles/Sou3.svg',
  './img/tiles/Sou4.svg',
  './img/tiles/Sou5.svg',
  './img/tiles/Sou5-Dora.svg',
  './img/tiles/Sou6.svg',
  './img/tiles/Sou7.svg',
  './img/tiles/Sou8.svg',
  './img/tiles/Sou9.svg',
  './img/tiles/Ton.svg',
  './img/op-bg.webp',
  './img/op-bg-portrait.webp',
  './img/store-yonma_kan.webp',
  './img/store-tokushu_kan.webp',
  './img/store-goto_kan.webp',
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
  // 1件でも欠けると全部入らないので、失敗は個別に見逃す
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(ASSETS.map((a) => c.add(a).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** コードかどうか（更新が届かないと困るもの） */
function isCode(request) {
  if (request.mode === 'navigate') return true;
  return /\.(?:js|mjs|css|html|webmanifest)(?:\?|$)/.test(new URL(request.url).pathname);
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // APIなどは素通し

  if (isCode(e.request)) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html'))),
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html'))),
  );
});
