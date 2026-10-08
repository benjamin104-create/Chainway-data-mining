// 第一次開啟後把程式與模型存在手機裡，之後打開更快、沒網路也能用
const CACHE = 'kata-v5';
const SHELL = ['./', 'index.html', 'app.js', 'ar.js', 'render3d.js', 'data.js', 'manifest.webmanifest', 'icon-192.png', 'apple-touch-icon.png',
  'lib/vision_bundle.mjs', 'lib/three.module.min.js', 'lib/RoomEnvironment.js', 'lib/GLTFLoader.js', 'lib/BufferGeometryUtils.js', 'models/pose_landmarker_lite.task'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // 網址帶參數（朋友連結）也用同一份頁面
  const key = url.origin === location.origin && url.pathname.endsWith('/') ? './' : e.request;
  e.respondWith(caches.match(key, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok && (url.origin === location.origin || e.request.url.includes('fonts.g'))) {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy));
    }
    return res;
  })));
});
