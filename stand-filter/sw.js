// 程式（網頁、JS）每次都先上網拿最新版，沒網路才用手機裡存的；
// 模型、神明圖這種大檔案才優先用手機裡存的（打開快、省流量）
const CACHE = 'stand-cam-v37';
const SHELL = ['./', 'index.html', 'app.js', 'beauty-gl.js', 'quiz.js', 'manifest.webmanifest', 'icon-192.png', 'apple-touch-icon.png',
  'lib/vision_bundle.mjs',
  'models/selfie_segmenter.tflite', 'models/blaze_face_short_range.tflite', 'models/face_landmarker.task'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
const HEAVY = /\/(models|lib\/wasm|stands)\/|\.(png|jpg|jpeg|webp|tflite|task|wasm|woff2?)$/i;
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const mine = url.origin === location.origin || url.hostname.includes('fonts.g');
  const save = (res) => { if (res.ok && mine) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return res; };
  if (HEAVY.test(url.pathname) || url.hostname.includes('fonts.g')) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then(save)));
  } else {
    e.respondWith(fetch(e.request).then(save).catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});
