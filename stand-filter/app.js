import { FilesetResolver, ImageSegmenter } from './lib/vision_bundle.mjs';
import { QUESTIONS, STANDS, STAT_KEYS, STAT_INFO, LANGS, MEDIA, STAT_MEDIA, TAGS, computeStand, standById } from './quiz.js';

const GRADE_V = { A: 5, B: 4, C: 3, D: 2, E: 1 };

const $ = (id) => document.getElementById(id);
const view = $('view'), ctx = view.getContext('2d');
const video = $('video');
const state = {
  card: true, side: 1, facing: 'user',
  src: null, mirror: false, stream: null,
  segmenter: null, mask: null, box: null, lastTs: 0,
  stand: null, summonAt: 0,
  lang: /^ja/i.test(navigator.language) ? 'ja' : /^zh/i.test(navigator.language) ? 'zh' : 'en',
  colTop: null, pose: null,
};
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ── 替身圖：白底自動去背、裁到角色本身 ───────────────────
const art = {};
function loadImage(src) {
  return new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
}
async function loadArt(id) {
  if (art[id]) return art[id];
  let img;
  try { img = await loadImage(`stands/${id}.png`); } catch { img = await loadImage(`stands/${id}.jpg`); }
  return (art[id] = cutout(img));
}
function cutout(img) {
  const w = img.naturalWidth, h = img.naturalHeight, c = mk(w, h), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const im = g.getImageData(0, 0, w, h), d = im.data;
  const isBg = (i) => d[i + 3] < 20 || (d[i] > 228 && d[i + 1] > 228 && d[i + 2] > 228);
  // 從四邊往內灌水：連到邊緣的白色才算背景，角色身上的白色不會被挖掉
  const seen = new Uint8Array(w * h), stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p] || !isBg(p * 4)) continue;
    seen[p] = 1; d[p * 4 + 3] = 0;
    const x = p % w;
    if (x > 0) stack.push(p - 1); if (x < w - 1) stack.push(p + 1);
    if (p >= w) stack.push(p - w); if (p < w * (h - 1)) stack.push(p + w);
  }
  // 邊緣柔化：緊貼背景的淺色像素變半透明
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let p = 0; p < w * h; p++) {
    if (seen[p]) continue;
    const x = p % w, y = (p / w) | 0, i = p * 4;
    const edge = (x > 0 && seen[p - 1]) || (x < w - 1 && seen[p + 1]) || (p >= w && seen[p - w]) || (p < w * (h - 1) && seen[p + w]);
    if (edge) { const lum = (d[i] + d[i + 1] + d[i + 2]) / 3; d[i + 3] = Math.min(d[i + 3], Math.max(60, 255 - (lum - 150) * 2.5)); }
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  g.putImageData(im, 0, 0);
  const out = mk(x1 - x0 + 1, y1 - y0 + 1);
  out.getContext('2d').drawImage(c, -x0, -y0);
  return out;
}

// ── 畫面切換 ───────────────────────────────────────────
function show(id) {
  for (const s of ['intro', 'quiz', 'result', 'cam']) $(s).hidden = s !== id;
  if (id !== 'cam') stopCamera();
  else { $('start').hidden = false; $('shot').disabled = true; notice(''); }
  $(id).scrollTop = 0;
}

// ── 測驗 ─────────────────────────────────────────────
let qi = 0, answers = {};
function renderQuestion() {
  const Q = QUESTIONS[qi];
  $('count').textContent = `${qi + 1} / ${QUESTIONS.length}`;
  $('progress').style.width = `${(qi + 1) / QUESTIONS.length * 100}%`;
  $('qtext').textContent = Q.q;
  $('qhint').textContent = Q.hint || '';
  $('qhint').hidden = !Q.hint;
  const body = $('qbody'); body.innerHTML = '';
  if (Q.kind === 'text') {
    const f = document.createElement('input');
    f.className = 'field'; f.id = 'q_' + Q.id; f.maxLength = Q.max; f.placeholder = Q.placeholder;
    f.value = answers[Q.id] || '';
    const row = document.createElement('div'); row.className = 'row';
    const next = document.createElement('button'); next.className = 'primary'; next.textContent = '下一步';
    const skip = document.createElement('button'); skip.className = 'secondary'; skip.textContent = '先略過';
    next.onclick = () => { answers[Q.id] = f.value.trim(); advance(); };
    skip.onclick = () => { answers[Q.id] = ''; advance(); };
    f.onkeydown = (e) => { if (e.key === 'Enter') next.click(); };
    row.append(next, skip); body.append(f, row);
  } else {
    for (const [val, label] of Q.options) {
      const b = document.createElement('button'); b.className = 'opt'; b.type = 'button';
      b.setAttribute('aria-pressed', String(answers[Q.id] === val));
      b.textContent = label;
      b.onclick = () => { answers[Q.id] = val; b.setAttribute('aria-pressed', 'true'); setTimeout(advance, 140); };
      body.append(b);
    }
  }
}
function advance() {
  if (qi < QUESTIONS.length - 1) { qi++; renderQuestion(); $('quiz').scrollTop = 0; return; }
  store.set('stand-answers', answers);
  showResult(computeStand(answers));
}
$('begin').onclick = () => { qi = 0; answers = store.get('stand-answers') || {}; renderQuestion(); show('quiz'); };
$('back').onclick = () => { if (qi === 0) show('intro'); else { qi--; renderQuestion(); } };
$('redo').onclick = () => { qi = 0; answers = {}; renderQuestion(); show('quiz'); };
$('skip').onclick = () => {
  const ids = Object.keys(STANDS), id = ids[Math.floor(Math.random() * ids.length)];
  useStand(standById(id)); show('cam');
};

// ── 結果 ─────────────────────────────────────────────
function hexPoints(cx, cy, r, vals) {
  return vals.map((v, i) => {
    const a = -Math.PI / 2 + i * Math.PI / 3;
    return [cx + Math.cos(a) * r * v, cy + Math.sin(a) * r * v];
  });
}
function drawHexSvg(svg, grade) {
  // 頂點旁邊寫「項目名稱＋等級」，一眼看得出哪一角是什麼
  const ns = 'http://www.w3.org/2000/svg', el = (n, a) => { const e = document.createElementNS(ns, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const C = [160, 142], R = 82;
  svg.innerHTML = '';
  for (const k of [1, .8, .6, .4, .2]) svg.append(el('polygon', { points: hexPoints(...C, R, Array(6).fill(k)).join(' '), fill: 'none', style: `stroke:var(--line);stroke-width:${k === 1 ? 1.5 : .8}` }));
  hexPoints(...C, R, Array(6).fill(1)).forEach(([x, y]) => svg.append(el('line', { x1: C[0], y1: C[1], x2: x, y2: y, style: 'stroke:var(--line);stroke-width:.8' })));
  const vals = STAT_KEYS.map(([k]) => GRADE_V[grade[k]] / 5);
  svg.append(el('polygon', { points: hexPoints(...C, R, vals).join(' '), style: 'fill:color-mix(in srgb,var(--accent) 40%,transparent);stroke:var(--accent);stroke-width:2.5;stroke-linejoin:round' }));
  hexPoints(...C, R, vals).forEach(([x, y]) => svg.append(el('circle', { cx: x, cy: y, r: 3.5, style: 'fill:var(--accent)' })));
  hexPoints(...C, R + 30, Array(6).fill(1)).forEach(([x, y], i) => {
    const [k, label] = STAT_KEYS[i];
    const name = el('text', { x, y: y - 9, 'text-anchor': 'middle', 'dominant-baseline': 'middle', style: 'fill:var(--muted);font:700 13px var(--heading)' });
    name.textContent = label; svg.append(name);
    const g = el('text', { x, y: y + 10, 'text-anchor': 'middle', 'dominant-baseline': 'middle', style: 'fill:var(--fg);font:400 19px var(--display)' });
    g.textContent = grade[k]; svg.append(g);
  });
}
function useStand(s) {
  state.stand = s;
  document.documentElement.style.setProperty('--accent', s.text);
  $('camTitle').textContent = `《${s.name}》`;
  loadArt(s.id).catch(() => {});
}
// 自媒體建議：主標籤的定位與方向、等級 A 的強項、副標籤的混搭點子
function renderMedia(s) {
  const m = MEDIA[s.tagId];
  const title = $('mediaTitle'); title.textContent = '你適合當自媒體的「';
  const em = document.createElement('em'); em.textContent = m.role; title.append(em, '」');
  $('mPitch').textContent = m.pitch;
  const ul = $('mStrengths'); ul.innerHTML = '';
  const strong = STAT_KEYS.filter(([k]) => s.grade[k] === 'A');
  const list = strong.length ? strong : STAT_KEYS.filter(([k]) => s.grade[k] === 'B').slice(0, 2);
  for (const [k, label] of list) {
    const li = document.createElement('li'), b = document.createElement('b');
    b.textContent = `${label} ${s.grade[k]}`; li.append(b, STAT_MEDIA[k]); ul.append(li);
  }
  const tp = $('mTopics'); tp.innerHTML = '';
  for (const t of m.topics) { const sp = document.createElement('span'); sp.textContent = t; tp.append(sp); }
  $('mFormats').textContent = m.formats;
  $('mPlatforms').textContent = m.platforms;
  $('mMixCard').hidden = !s.second;
  if (s.second) $('mMix').textContent = `你的副標籤是「${TAGS[s.second].tag}」：${MEDIA[s.second].mix}，讓「${m.role}」的內容更有你的味道。`;
  $('mFirst').textContent = m.first;
  $('mWatch').textContent = `提醒：${m.watch}`;
}

async function showResult(s) {
  useStand(s);
  $('rOwner').textContent = `${s.owner}　的守護神是`;
  $('rTag').textContent = `人格標籤｜${s.tag}`;
  $('rTagBig').textContent = s.tag;
  $('rTagSub').textContent = s.tagNames.en;
  $('rName').textContent = `《${s.name}》`;
  $('rZh').textContent = s.names ? `${s.zh}・${s.titles.ja}「${s.names.ja}」・${s.titles.en}` : s.zh;
  $('rLine').textContent = `「${s.line.zh}」`; $('rLineJa').textContent = `「${s.line.ja}」`; $('rLineEn').textContent = `“${s.line.en}”`;
  $('rImg').alt = `${s.zh}的守護神立繪`;
  drawHexSvg($('rHex'), s.grade);
  const dl = $('rStats'); dl.innerHTML = '';
  for (const [k, label] of STAT_KEYS) {
    const d = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
    const b = document.createElement('b'), sm = document.createElement('small');
    b.textContent = label; sm.textContent = STAT_INFO[k].desc; dt.append(b, sm);
    dd.textContent = s.grade[k]; d.append(dt, dd); dl.append(d);
  }
  $('rAbility').textContent = s.ability;
  renderMedia(s);
  $('rNote').textContent = s.note;
  $('rTry').textContent = `這週試試：${s.try}`;
  $('copy').textContent = '複製我的守護神文字';
  show('result');
  try { $('rImg').src = (await loadArt(s.id)).toDataURL(); } catch {}
}
$('summon').onclick = () => show('cam');
$('toResult').onclick = () => show(state.stand?.owner ? 'result' : 'intro');
$('copy').onclick = async () => {
  const s = state.stand; if (!s) return;
  const text = [
    `名字：${s.owner}`, `人格標籤：${s.tag}`, `守護神：《${s.name}》${s.zh}`,
    STAT_KEYS.map(([k, l]) => `${l} ${s.grade[k]}`).join('／'),
    `能力：${s.ability}`, `自媒體定位：${MEDIA[s.tagId].role}｜${MEDIA[s.tagId].formats}`, `哪位希臘神祇是你的守護神？來測 → ${location.origin + location.pathname}`,
  ].join('\n');
  try { await navigator.clipboard.writeText(text); $('copy').textContent = '已複製，可以貼到 LINE'; }
  catch { $('copy').textContent = '這個瀏覽器不能自動複製'; }
};
const saved = store.get('stand-answers');
if (saved?.q5) {
  const b = document.createElement('button'); b.className = 'secondary'; b.textContent = '查看上次的守護神';
  b.onclick = () => { answers = saved; showResult(computeStand(saved)); };
  $('skip').before(b);
}

// ── 相機介面 ───────────────────────────────────────────
for (const [id, name] of [['card', '資訊卡']]) {
  const b = document.createElement('button');
  b.className = 'chip'; b.type = 'button'; b.textContent = name;
  b.setAttribute('aria-pressed', String(state[id]));
  b.onclick = () => { state[id] = !state[id]; b.setAttribute('aria-pressed', String(state[id])); };
  $('sfx').append(b);
}
const langRow = document.createElement('div'); langRow.className = 'chips'; langRow.setAttribute('role', 'group'); langRow.setAttribute('aria-label', '語言');
for (const [id, name] of Object.entries(LANGS)) {
  const b = document.createElement('button');
  b.className = 'chip'; b.type = 'button'; b.textContent = name; b.dataset.lang = id;
  b.setAttribute('aria-pressed', String(state.lang === id));
  b.onclick = () => { state.lang = id; for (const x of langRow.children) x.setAttribute('aria-pressed', String(x === b)); };
  langRow.append(b);
}
$('sfx').after(langRow);
function notice(msg) { const n = $('notice'); n.textContent = msg; n.hidden = !msg; }

// ── 人像分割模型（全部放在自己的網站上，不連外部服務） ──────
const FILTER_OK = (() => { const c = document.createElement('canvas').getContext('2d'); c.filter = 'blur(1px)'; return c.filter === 'blur(1px)'; })();
function mk(w = 1, h = 1) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const srcC = mk(), personC = mk(), auraC = mk(), maskC = mk(256, 256), tinyC = mk(48, 48);
const maskCtx = maskC.getContext('2d');

async function loadModel() {
  try {
    const fs = await FilesetResolver.forVisionTasks(new URL('lib/wasm', location.href).href);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: new URL('models/selfie_segmenter.tflite', location.href).href, delegate },
      runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false,
    });
    try { state.segmenter = await ImageSegmenter.createFromOptions(fs, opts('GPU')); }
    catch { state.segmenter = await ImageSegmenter.createFromOptions(fs, opts('CPU')); }
    $('loadState').textContent = '人像辨識準備好了';
  } catch (e) {
    console.warn('segmenter failed', e);
    $('loadState').textContent = '人像辨識載入失敗，會改用中央區域當作人像';
  }
}
const modelReady = loadModel();

async function startCamera() {
  stopCamera();
  if (!navigator.mediaDevices?.getUserMedia) {
    notice('這個瀏覽器不能開相機。如果你是在 LINE 裡開的，請點右上角選「用預設瀏覽器開啟」，或改用上方的相簿按鈕。');
    return;
  }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: state.facing, width: { ideal: 1280 }, height: { ideal: 1280 } },
    });
  } catch (e) {
    notice(e.name === 'NotAllowedError'
      ? '相機權限被拒絕了。請到瀏覽器設定允許這個網站使用相機，再重新整理。'
      : '打不開相機（' + e.name + '）。可以改用上方的相簿按鈕選一張照片。');
    return;
  }
  video.srcObject = state.stream;
  await video.play();
  useSource(video, state.facing === 'user');
}
function stopCamera() {
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null; state.src = null;
}
function useSource(src, mirror) {
  state.src = src; state.mirror = mirror; state.box = null; state.mask = null;
  state.summonAt = performance.now(); state.pose = null; state.colTop = null;
  const w = src.videoWidth || src.naturalWidth, h = src.videoHeight || src.naturalHeight;
  const k = Math.min(1, 1080 / Math.max(w, h));
  const W = Math.round(w * k), H = Math.round(h * k);
  for (const c of [view, srcC, personC, auraC]) { c.width = W; c.height = H; }
  $('start').hidden = true; notice('');
  $('shot').disabled = false;
}

// ── 每一格的運算 ───────────────────────────────────────
function segment(now) {
  const s = state.segmenter;
  if (!s) return;
  const ts = Math.max(now, state.lastTs + 1); state.lastTs = ts;
  try {
    s.segmentForVideo(srcC, ts, (r) => {
      const masks = r.confidenceMasks; if (!masks?.length) return;
      const m = masks[masks.length - 1];           // 最後一個類別是「人」
      const f = m.getAsFloat32Array(), mw = m.width, mh = m.height;
      if (maskC.width !== mw || maskC.height !== mh) { maskC.width = mw; maskC.height = mh; }
      const img = maskCtx.createImageData(mw, mh), d = img.data;
      let minX = mw, minY = mh, maxX = -1, maxY = -1, n = 0;
      const top = new Float32Array(mw).fill(1);
      for (let i = 0; i < f.length; i++) {
        const a = f[i];
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255; d[i * 4 + 3] = a * 255;
        if (a > .5) { const x = i % mw, y = (i / mw) | 0; n++; if (top[x] === 1) top[x] = y / mh;
          if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
      maskCtx.putImageData(img, 0, 0);
      state.mask = maskC;
      if (!state.colTop || state.colTop.length !== mw) state.colTop = top;
      else for (let x = 0; x < mw; x++) state.colTop[x] += (top[x] - state.colTop[x]) * .4;
      if (n > f.length * .01) {
        // 頭部範圍：人像最上面那一段（約身高的兩成）的左右邊界
        const yEnd = Math.min(maxY, minY + Math.max(4, (maxY - minY) * .2));
        let hx0 = mw, hx1 = -1;
        for (let y = minY; y <= yEnd; y++) for (let x = minX; x <= maxX; x++) {
          if (f[y * mw + x] > .5) { if (x < hx0) hx0 = x; if (x > hx1) hx1 = x; }
        }
        smoothBox({ x0: minX / mw, y0: minY / mh, x1: (maxX + 1) / mw, y1: (maxY + 1) / mh, hx0: hx0 / mw, hx1: (hx1 + 1) / mw });
      }
    });
  } catch (e) { console.warn(e); }
}
function smoothBox(b) {
  if (!state.box) { state.box = b; return; }
  for (const k in b) state.box[k] += (b[k] - state.box[k]) * .35;
}
function fallbackMask() {
  const g = maskCtx; maskC.width = maskC.height = 128;
  const r = g.createRadialGradient(64, 70, 10, 64, 70, 60);
  r.addColorStop(0, '#fff'); r.addColorStop(.75, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.beginPath(); g.ellipse(64, 74, 40, 56, 0, 0, 7); g.fill();
  state.mask = maskC; state.box = { x0: .19, y0: .14, x1: .81, y1: 1, hx0: .38, hx1: .62 };
}

let halftone = null;
function halftonePattern() {
  const c = mk(10, 10), g = c.getContext('2d');
  g.fillStyle = '#000'; g.beginPath(); g.arc(5, 5, 2.1, 0, 7); g.fill();
  return ctx.createPattern(c, 'repeat');
}

// 替身找位置：把人像每一欄的最上緣當成「被擋住的高度」，
// 在畫面上試不同位置與大小，挑臉最不會被擋、身體也露最多的地方（越大越好，也偏好待在原地）
const TITLE_H = 13;   // 上方標題列的高度（u），替身的頭不進這一區
function placeStand(W, H, bh, headY, ratio, u) {
  const top = state.colTop, n = top ? top.length : 0;
  const base = Math.min(H * .98, Math.max(bh * 1.1, H * .68));   // 守護靈要夠大，比本人還高
  const prev = state.pose, cx = state.personCx ?? W / 2;
  let best = null;
  for (const k of [1, .9, .81, .72, .64, .56]) {
    const sh = base * k, sw = sh * ratio;
    const sy = Math.max(TITLE_H * u, Math.min(headY - sh * .06, H - sh * .75));
    for (let i = 0; i <= 24; i++) {
      const x = sw * .22 + (W - sw * .44) * i / 24;
      let face = 0, body = 0, cols = 0;
      if (n) {
        const c0 = Math.max(0, Math.floor((x - sw / 2) / W * n)), c1 = Math.min(n, Math.ceil((x + sw / 2) / W * n));
        for (let c = c0; c < c1; c++) {
          const rel = ((c + .5) / n * W - (x - sw / 2)) / sw, pt = top[c] * H;
          const fy1 = sy + sh * .32;
          if (Math.abs(rel - .5) < .24) face += Math.max(0, fy1 - Math.max(sy, pt)) / (fy1 - sy);
          body += Math.max(0, sy + sh - Math.max(fy1, pt)) / (sh * .68);
          cols++;
        }
        face /= Math.max(1, cols * .48); body /= Math.max(1, cols);
      }
      const off = (Math.max(0, sw / 2 - x) + Math.max(0, x + sw / 2 - W)) / sw;
      const side = Math.sign(x - cx) || 1;
      let score = face * 6 + body * .8 + off * .6 + (1 - k) * 2 + (side === state.side ? 0 : .25);
      if (prev) score += Math.abs(x - prev.tx) / W * .6 + Math.abs(sh - prev.tsh) / H * .4;
      if (!best || score < best.score) best = { score, x, sy, sh, sw, side };
    }
  }
  return best;
}

function render(now) {
  requestAnimationFrame(render);
  const src = state.src, s = state.stand; if (!src || !s) return;
  if (src === video && video.readyState < 2) return;
  const W = view.width, H = view.height, t = now / 1000, u = Math.min(W, H) / 100;

  // 0. 原始畫面（前鏡頭左右翻轉，像照鏡子）
  const sc = srcC.getContext('2d');
  sc.setTransform(state.mirror ? -1 : 1, 0, 0, 1, state.mirror ? W : 0, 0);
  sc.drawImage(src, 0, 0, W, H); sc.setTransform(1, 0, 0, 1, 0, 0);

  segment(now);
  if (!state.mask) { if (!state.segmenter) fallbackMask(); else { ctx.drawImage(srcC, 0, 0); return; } }
  const box = state.box || { x0: .25, y0: .15, x1: .75, y1: 1, hx0: .4, hx1: .6 };

  // 1. 把人切出來
  const pc = personC.getContext('2d');
  pc.globalCompositeOperation = 'source-over'; pc.clearRect(0, 0, W, H);
  pc.drawImage(srcC, 0, 0);
  pc.globalCompositeOperation = 'destination-in';
  if (FILTER_OK) pc.filter = 'blur(1.5px)';
  pc.drawImage(state.mask, 0, 0, W, H); pc.filter = 'none';
  pc.globalCompositeOperation = 'source-over';

  // 2. 本人的氣場：遮罩縮小再放大＝便宜的大範圍模糊
  const tc = tinyC.getContext('2d');
  tc.clearRect(0, 0, 48, 48); tc.drawImage(state.mask, 0, 0, 48, 48);
  const ac = auraC.getContext('2d');
  ac.clearRect(0, 0, W, H); ac.imageSmoothingQuality = 'high';
  ac.drawImage(tinyC, 0, 0, W, H);
  ac.globalCompositeOperation = 'source-in'; ac.fillStyle = s.glow; ac.fillRect(0, 0, W, H);
  ac.globalCompositeOperation = 'source-over';

  // 3. 背景：壓暗、拉對比、網點
  if (FILTER_OK) ctx.filter = 'contrast(1.05) saturate(.8) brightness(.62)';
  ctx.drawImage(srcC, 0, 0); ctx.filter = 'none';
  if (!FILTER_OK) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(0, 0, W, H); }
  ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = s.tint; ctx.globalAlpha = .2; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  halftone ||= halftonePattern();
  ctx.globalAlpha = .15; ctx.fillStyle = halftone; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;

  // 4. 替身：站在本人斜後方，頭比本人高，緩慢浮動；剛召喚時從下方升起
  const bw = (box.x1 - box.x0) * W, bh = (box.y1 - box.y0) * H;
  const cx = (box.x0 + box.x1) / 2 * W, headY = box.y0 * H;
  const a = art[s.id];
  const enter = Math.min(1, (now - state.summonAt) / 900), ease = 1 - Math.pow(1 - enter, 3);
  state.personCx = cx;
  if (a) {
    const p = placeStand(W, H, bh, headY, a.width / a.height, u);
    let P = state.pose;
    if (!P) P = state.pose = { x: p.x, y: p.sy, sh: p.sh, vx: 0, lean: 0, tx: p.x, tsh: p.sh, side: p.side };
    P.tx = p.x; P.tsh = p.sh; P.side = p.side;
    const nx = P.x + (p.x - P.x) * .12;          // 像 AR 角色一樣滑過去，不是瞬間跳
    P.vx = nx - P.x; P.x = nx;
    P.y += (p.sy - P.y) * .12; P.sh += (p.sh - P.sh) * .12;
    P.lean += (Math.max(-.18, Math.min(.18, P.vx / u * .06)) - P.lean) * .15;
    state.useSide = P.side;
    const sh = P.sh, sw = sh * a.width / a.height;
    // 擺 pose：每 4.5 秒用力一次（放大＋光圈），其餘時間呼吸、輕晃
    const ph = (t + 1) % 4.5, pulse = ph < .6 ? Math.sin(ph / .6 * Math.PI) : 0;
    const scale = (1 + Math.sin(t * 1.6) * .012 + pulse * .07) * (.75 + .25 * ease);
    const rot = P.lean + Math.sin(t * 1.1) * .025 - pulse * .04 * P.side;
    const bob = Math.sin(t * 1.6) * u * .8 + (1 - ease) * sh * .3;
    const fx = P.x, fy = P.y + bob;                // 頭頂位置
    state.standHead = { x: fx, y: fy, sw, sh };
    speedLines(fx, fy + sh * .25, W, H, t, s);
    stars(fx, fy + sh * .3, sh * .62 * (1 + pulse * .15), t, s, u);
    if (pulse > 0) {                               // 擺 pose 時的衝擊光圈
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = s.glow; ctx.globalAlpha = pulse * .7; ctx.lineWidth = u * (1.5 - pulse);
      ctx.beginPath(); ctx.ellipse(fx, fy + sh * .35, sw * (.3 + ph), sh * (.25 + ph * .6), 0, 0, 7); ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(fx, fy + sh); ctx.rotate(rot); ctx.scale(scale, scale);   // 以腳底為支點
    ctx.globalAlpha = .14 * ease;                  // 殘影
    ctx.drawImage(a, -sw * .52 - P.side * u * 2 - P.vx * 3, -sh * 1.02, sw * 1.04, sh * 1.04);
    ctx.globalAlpha = .88 * ease;
    if (FILTER_OK) ctx.filter = 'saturate(.7) brightness(.88) contrast(.95)';   // 顏色收斂，不搶本人
    ctx.shadowColor = s.glow; ctx.shadowBlur = (3 + pulse * 4) * u;
    ctx.drawImage(a, -sw / 2, -sh, sw, sh);
    ctx.restore();
  } else {
    speedLines(cx, headY, W, H, t, s);
  }

  // 5. 本人的氣場與本人（擋在替身前面）
  ctx.globalCompositeOperation = 'lighter';
  ctx.save(); ctx.globalAlpha = .16 + Math.sin(t * 7.3) * .03;
  const k = 1.05 + Math.sin(t * 5) * .01, cy = (box.y0 + box.y1) / 2 * H;
  ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy); ctx.drawImage(auraC, 0, 0);
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
  if (FILTER_OK) ctx.filter = 'contrast(1.06) brightness(1.06) saturate(1.05)';
  ctx.drawImage(personC, 0, 0); ctx.filter = 'none';

  vignette(W, H);
  if (state.card && s.owner) standCard(W, H, s);
  tagStamp(W, H, s, u, now);
  titleBanner(W, H, s, u, ease);
  if (state.standHead) speech(W, H, s, u, t, ease);
}

// ── 人格標籤大字：「守護」「創造」這種一眼就懂的直排大字，放在守護靈的另一側 ──
function tagStamp(W, H, s, u, now) {
  const L = state.lang, word = s.tagNames?.[L] || s.tag;
  const t0 = (now - state.summonAt) / 1000 - .5; if (t0 <= 0) return;
  const k = Math.min(1, t0 / .35), slam = 1 + (1 - k) * .8;     // 從大往下「砸」進畫面
  const side = -(state.useSide ?? state.side);                   // 守護靈的另一邊
  const top = TITLE_H * u + 2 * u;
  ctx.save(); ctx.globalAlpha = k;
  if (L === 'en') {
    let px = 9 * u; ctx.font = FONT.en(900, px);
    while (ctx.measureText(word).width > W * .5 && px > 4 * u) { px *= .92; ctx.font = FONT.en(900, px); }
    const w = ctx.measureText(word).width, x = side > 0 ? W - 3 * u - w / 2 : 3 * u + w / 2, y = top + px;
    ctx.translate(x, y); ctx.rotate(-.12 * side); ctx.scale(slam, slam);
    stampBar(-w / 2 - 2 * u, -px * .95, w + 4 * u, px * 1.25, s);
    stampText(word, 0, 0, px, s, u);
  } else {
    // 直排：一個字一格
    const chars = [...word], px = Math.min(15 * u, (H * .42) / chars.length);
    ctx.font = FONT.zh(900, px);                                  // 漢字一律用思源黑體，日文字型缺字
    const x = side > 0 ? W - 4 * u - px / 2 : 4 * u + px / 2;
    const h = chars.length * px * 1.05;
    ctx.translate(x, top + h / 2); ctx.rotate(.06 * side); ctx.scale(slam, slam);
    stampBar(-px * .62, -h / 2 - px * .2, px * 1.24, h + px * .4, s);
    chars.forEach((c, i) => stampText(c, 0, -h / 2 + px * (i * 1.05 + .88), px, s, u));
    // 旁邊的小字：人格標籤 / タイプ
    ctx.font = `700 ${2.2 * u}px system-ui, sans-serif`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    const sub = L === 'ja' ? 'タイプ' : '人格標籤';
    [...sub].forEach((c, i) => ctx.fillText(c, -side * px * .95, -h / 2 + 2.4 * u * (i + 1)));
  }
  ctx.restore();
}
function stampBar(x, y, w, h, s) {
  // 筆刷感的色塊：斜切的平行四邊形
  ctx.save(); ctx.globalAlpha *= .9;
  const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, s.tint); g.addColorStop(1, 'rgba(0,0,0,.2)');
  ctx.fillStyle = g; const sk = Math.min(w, h) * .18;
  ctx.beginPath(); ctx.moveTo(x + sk, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - sk, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function stampText(c, x, y, px, s, u) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  ctx.lineWidth = px * .2; ctx.strokeStyle = '#120a1c'; ctx.strokeText(c, x, y);
  ctx.lineWidth = px * .07; ctx.strokeStyle = s.glow; ctx.strokeText(c, x, y);
  ctx.fillStyle = '#fff'; ctx.fillText(c, x, y);
}

// ── 前景文字：守護靈名稱（最上方）與台詞對話框，永遠畫在人和替身的前面 ──
const FONT = {
  zh: (w, px) => `${w} ${px}px "Noto Sans TC", "PingFang TC", sans-serif`,
  ja: (w, px) => `${px}px "Dela Gothic One", "Hiragino Sans", sans-serif`,
  en: (w, px) => `${px}px "Dela Gothic One", sans-serif`,
};
const LABEL = { zh: '守護神', ja: '守護神', en: 'GUARDIAN DEITY' };
function titleBanner(W, H, s, u, ease) {
  const L = state.lang, h = TITLE_H * u;
  ctx.save();
  ctx.globalAlpha = ease;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(10,6,18,.88)'); g.addColorStop(1, 'rgba(10,6,18,.0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, h * 1.15);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = s.glow; ctx.font = `700 ${2.4 * u}px system-ui, sans-serif`;
  const label = `${LABEL[L]} ・ ${s.titles[L]}`;
  ctx.fillText(L === 'en' ? label.toUpperCase() : label, W / 2, 4 * u);
  const big = L === 'en' ? s.names.en : `${s.names[L]}  ${s.names.en}`;
  let px = 6.6 * u; ctx.font = FONT[L](900, px);
  while (ctx.measureText(big).width > W - 8 * u && px > 3 * u) { px *= .92; ctx.font = FONT[L](900, px); }
  ctx.lineJoin = 'round'; ctx.lineWidth = px * .22; ctx.strokeStyle = '#120a1c'; ctx.strokeText(big, W / 2, 4.2 * u + px);
  ctx.fillStyle = '#fff'; ctx.fillText(big, W / 2, 4.2 * u + px);
  ctx.globalCompositeOperation = 'source-atop';
  const gg = ctx.createLinearGradient(0, 4 * u, 0, 4.2 * u + px); gg.addColorStop(0, '#fff'); gg.addColorStop(1, s.text);
  ctx.fillStyle = gg; ctx.fillText(big, W / 2, 4.2 * u + px);
  ctx.restore();
}
function wrapLines(text, maxW, L) {
  const parts = L === 'en' ? text.split(' ') : [...text];
  const lines = []; let cur = '';
  for (const p of parts) {
    const next = cur ? cur + (L === 'en' ? ' ' : '') + p : p;
    if (ctx.measureText(next).width > maxW && cur) { lines.push(cur); cur = p; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}
function speech(W, H, s, u, t, ease) {
  const L = state.lang, hd = state.standHead, text = s.line[L];
  // 開場 1 秒後浮現，之後一直留著；每次擺 pose 時跳一下
  const show = Math.min(1, Math.max(0, ((performance.now() - state.summonAt) / 1000 - 1) * 2));
  if (show <= 0) return;
  const px = 3.4 * u; ctx.save(); ctx.font = FONT[L](700, px);
  const maxW = Math.min(W * .56, 52 * u), lines = wrapLines(text, maxW, L);
  const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 5 * u, bh = lines.length * px * 1.3 + 3.6 * u;
  // 放在替身頭的外側（遠離本人那一側）；放不下就放在頭的上方
  const out = hd.x >= (state.personCx ?? W / 2) ? 1 : -1;
  let bx = hd.x + out * (hd.sw * .18 + bw / 2), by = hd.y + hd.sh * .04;
  if (bx - bw / 2 < 2 * u || bx + bw / 2 > W - 2 * u) { bx = hd.x; by = hd.y - bh - 2 * u; }
  bx = Math.max(bw / 2 + 2 * u, Math.min(W - bw / 2 - 2 * u, bx));
  by = Math.max(TITLE_H * u + u, Math.min(H - bh - 26 * u, by));
  const pop = 1 + Math.max(0, Math.sin(((t + 1) % 4.5) / .6 * Math.PI)) * ((t + 1) % 4.5 < .6 ? .06 : 0);
  ctx.globalAlpha = show * ease;
  ctx.translate(bx, by + bh / 2); ctx.scale(pop * (.8 + .2 * show), pop * (.8 + .2 * show));
  const x0 = -bw / 2, y0 = -bh / 2, r = 2.2 * u;
  // 尾巴從最靠近替身臉的那一邊伸出去，指向臉
  const fxr = hd.x - bx, fyr = hd.y + hd.sh * .12 - (by + bh / 2);
  let b1, b2, tip;
  if (Math.abs(fxr) > bw / 2) {
    const ex = Math.sign(fxr) * (bw / 2 - 1), yb = Math.max(y0 + r + 2 * u, Math.min(-y0 - r - 2 * u, fyr * .3));
    const ang = Math.atan2(fyr - yb, fxr - ex);
    b1 = [ex, yb - 1.6 * u]; b2 = [ex, yb + 1.6 * u]; tip = [ex + Math.cos(ang) * 4.5 * u, yb + Math.sin(ang) * 4.5 * u];
  } else {
    const ey = Math.sign(fyr || 1) * (bh / 2 - 1), xb = Math.max(x0 + r + 2 * u, Math.min(-x0 - r - 2 * u, fxr * .5));
    b1 = [xb - 1.6 * u, ey]; b2 = [xb + 1.6 * u, ey]; tip = [xb + (fxr - xb) * .3, ey + Math.sign(fyr || 1) * 4.5 * u];
  }
  // 外框與尾巴畫成同一個形狀：先描粗黑邊，再填白，接縫就不會出現
  const shape = () => {
    ctx.beginPath(); ctx.roundRect(x0, y0, bw, bh, r);
    ctx.moveTo(...b1); ctx.lineTo(...tip); ctx.lineTo(...b2); ctx.closePath();
  };
  ctx.lineJoin = 'round';
  shape(); ctx.strokeStyle = '#120a1c'; ctx.lineWidth = 1.2 * u; ctx.stroke();
  shape(); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.fillStyle = '#120a1c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, 0, y0 + 1.8 * u + px * 1.3 * (i + .5)));
  ctx.restore();
}

// 星座光環：替身身後的一圈星星與連線，星星會閃爍、整圈緩慢旋轉
const STAR_PTS = Array.from({ length: 26 }, (_, i) => {
  const r = .55 + ((i * 37) % 11) / 22, a = i * 2.39996;      // 黃金角分布，看起來自然又固定
  return [Math.cos(a) * r, Math.sin(a) * r, 0.6 + ((i * 13) % 7) / 10, i * 1.7];
});
const STAR_LINKS = [[0, 5], [5, 13], [13, 21], [21, 8], [3, 11], [11, 19], [19, 6], [2, 10], [10, 18], [18, 23]];
function stars(x, y, R, t, s, u) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(t * .04);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = s.glow; ctx.globalAlpha = .28; ctx.lineWidth = .25 * u;
  ctx.beginPath();
  for (const [a, b] of STAR_LINKS) { ctx.moveTo(STAR_PTS[a][0] * R, STAR_PTS[a][1] * R); ctx.lineTo(STAR_PTS[b][0] * R, STAR_PTS[b][1] * R); }
  ctx.stroke();
  for (const [px, py, k, ph] of STAR_PTS) {
    const tw = .45 + .55 * Math.abs(Math.sin(t * 1.8 + ph));
    const r = k * u * .9 * tw;
    ctx.globalAlpha = .9 * tw;
    const g = ctx.createRadialGradient(px * R, py * R, 0, px * R, py * R, r * 3);
    g.addColorStop(0, '#fff'); g.addColorStop(.3, s.glow); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px * R, py * R, r * 3, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function speedLines(x, y, W, H, t, s) {
  const R = Math.hypot(W, H);
  ctx.save(); ctx.translate(x, y); ctx.rotate(t * .05);
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * Math.PI * 2 + (i % 3) * .02, w = .012 + (i % 5) * .004;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * .12, Math.sin(a) * R * .12);
    ctx.lineTo(Math.cos(a - w) * R, Math.sin(a - w) * R); ctx.lineTo(Math.cos(a + w) * R, Math.sin(a + w) * R);
    ctx.fill();
  }
  ctx.restore();
}

function vignette(W, H) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.hypot(W, H) * .6);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,0,20,.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// 照片左下角的替身資訊卡：名字、本體、人格標籤、六項能力值
function standCard(W, H, s) {
  const u = Math.min(W, H) / 100, pad = 3 * u;
  const cw = Math.min(W - pad * 2, 76 * u), ch = 30 * u, x = pad, y = H - ch - pad;
  ctx.save();
  ctx.fillStyle = 'rgba(12,8,20,.8)'; ctx.strokeStyle = s.text; ctx.lineWidth = .5 * u;
  ctx.beginPath(); ctx.moveTo(x + 2 * u, y); ctx.lineTo(x + cw, y); ctx.lineTo(x + cw - 2 * u, y + ch); ctx.lineTo(x, y + ch); ctx.closePath();
  ctx.fill(); ctx.stroke();
  const r = 6.5 * u, hx = x + cw - r - 9 * u, hy = y + ch / 2;
  const pts = (rr, vals) => hexPoints(hx, hy, rr, vals);
  const poly = (p) => { ctx.beginPath(); p.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); };
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = .25 * u; poly(pts(r, Array(6).fill(1))); ctx.stroke();
  ctx.fillStyle = s.tint + 'aa'; ctx.strokeStyle = s.text; ctx.lineWidth = .4 * u;
  poly(pts(r, STAT_KEYS.map(([k]) => GRADE_V[s.grade[k]] / 5))); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const Ls = state.lang;
  pts(r + 4.2 * u, Array(6).fill(1)).forEach(([px, py], i) => {
    const k = STAT_KEYS[i][0];
    ctx.font = `700 ${1.6 * u}px "Noto Sans TC", system-ui, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.fillText(STAT_INFO[k].short[Ls], px, py - 1.2 * u);
    ctx.font = `${2.3 * u}px "Dela Gothic One", sans-serif`; ctx.fillStyle = '#fff';
    ctx.fillText(s.grade[k], px, py + 1.2 * u);
  });
  const tx = x + 4 * u, maxW = hx - r - 9 * u - tx;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `600 ${2.3 * u}px system-ui, sans-serif`;
  const L = state.lang, tg = s.tagNames?.[L] || s.tag;
  ctx.fillText(L === 'en' ? `NAME: ${s.owner} | TYPE: ${tg}` : L === 'ja' ? `名前：${s.owner}｜タイプ：${tg}` : `名字：${s.owner}｜人格標籤：${tg}`, tx, y + 8.5 * u, maxW);
  ctx.fillStyle = s.text; ctx.font = `${4.6 * u}px "Dela Gothic One", sans-serif`;
  ctx.fillText(`《${s.name}》`, tx - 1.2 * u, y + 17 * u, maxW + 1.2 * u);
  ctx.fillStyle = '#fff'; ctx.font = `600 ${2.4 * u}px system-ui, sans-serif`;
  ctx.fillText(s.titles ? `${s.titles[L]}・${s.names[L]}` : s.zh, tx, y + 23.5 * u, maxW);
  ctx.restore();
}

// ── 拍照與分享 ─────────────────────────────────────────
let lastBlob = null, lastUrl = null;
$('shot').onclick = () => {
  const f = $('flash'); f.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
  view.toBlob((blob) => {
    if (!blob) return;
    lastBlob = blob;
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(blob);
    $('photo').src = lastUrl; $('save').href = lastUrl;
    const file = new File([blob], 'stand.jpg', { type: 'image/jpeg' });
    $('share').hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
    $('sheet').hidden = false;
  }, 'image/jpeg', .92);
};
$('share').onclick = async () => {
  const file = new File([lastBlob], 'stand.jpg', { type: 'image/jpeg' });
  const s = state.stand;
  try { await navigator.share({ files: [file], title: s ? `我的守護神《${s.name}》` : '我的守護神' }); }
  catch (e) { if (e.name !== 'AbortError') notice('分享沒有成功，可以改用「儲存照片」再到 LINE 傳送。'); }
};
$('close').onclick = () => { $('sheet').hidden = true; };

$('go').onclick = async () => { $('go').disabled = true; await modelReady; await startCamera(); $('go').disabled = false; };
$('flip').onclick = () => { state.facing = state.facing === 'user' ? 'environment' : 'user'; startCamera(); };
$('side').onclick = () => { state.side *= -1; };
view.onclick = () => { state.side *= -1; };
$('pick').onclick = () => $('file').click();
$('file').onchange = async () => {
  const f = $('file').files[0]; if (!f) return;
  const img = new Image(); img.src = URL.createObjectURL(f); await img.decode();
  stopCamera(); await modelReady; useSource(img, false); $('file').value = '';
};

document.fonts?.load('80px "Dela Gothic One"', 'ゼウス').catch(() => {});
requestAnimationFrame(render);
