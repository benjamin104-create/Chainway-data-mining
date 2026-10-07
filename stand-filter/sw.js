// 第一次開啟後把程式與模型存在手機裡，之後打開更快、沒網路也能用
const CACHE = 'stand-cam-v15';
const SHELL = ['./', 'index.html', 'app.js', 'quiz.js', 'manifest.webmanifest', 'icon-192.png', 'apple-touch-icon.png',
  'lib/vision_bundle.mjs',
  ...['courage', 'nike', 'wisdom', 'apollo', 'guard', 'zeus', 'freedom', 'iris', 'create', 'hephaestus', 'bond', 'hera'].map((id) => `stands/${id}.jpg`), 'models/selfie_segmenter.tflite'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok && (new URL(e.request.url).origin === location.origin || e.request.url.includes('fonts.g'))) {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy));
    }
    return res;
  })));
});
