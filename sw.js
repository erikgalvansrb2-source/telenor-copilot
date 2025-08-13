const CACHE_NAME = 'tm-lte-12km-v1';
const CDN_DATA = 'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_land.geojson';
const CORE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './api-key 1.txt'
];
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(CORE);
      try { await cache.add(CDN_DATA); } catch(e) { /* ignore offline */ }
    })
  );
});
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((resp) => resp || fetch(e.request))
  );
});
