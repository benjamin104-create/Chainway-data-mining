// 程式（網頁、JS）每次都先上網拿最新版，沒網路才用手機裡存的；
// 模型、神明圖這種大檔案才優先用手機裡存的（打開快、省流量）
const CACHE = 'tabi-kami-v6';
const SHELL = ['./', 'index.html', 'app.js', 'beauty-gl.js', 'quiz.js', 'poses.js', 'ar.js', 'manifest.webmanifest'];
self.addEventListener('install', (e) => {
  // 只先存小檔案，而且一個失敗不影響安裝（以前一次下載十幾 MB 的模型，手機網路一斷，新版就永遠裝不上）
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => {
    const updated = ks.some((k) => k !== CACHE);              // 手機裡有舊版 = 這次是更新（第一次來的人不用重新整理）
    return Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      .then(() => self.clients.claim())
      // 新版裝好後，把還開著的舊頁面重新整理一次（舊頁面不會自己更新）
      .then(() => updated && self.clients.matchAll({ type: 'window' }).then((cs) => cs.forEach((c) => { try { c.navigate(c.url); } catch (_) {} })));
  }));
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
