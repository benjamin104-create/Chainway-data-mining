import { FilesetResolver, ImageSegmenter } from './lib/vision_bundle.mjs';
import { QUESTIONS, STANDS, STAT_KEYS, computeStand } from './quiz.js';

const SFX = [
  { id: 'auto', name: '擬聲字' },
  { id: 'none', name: '無字' },
];
const GRADE_V = { A: 5, B: 4, C: 3, D: 2, E: 1 };

const $ = (id) => document.getElementById(id);
const view = $('view'), ctx = view.getContext('2d');
const video = $('video');
const state = {
  sfx: true, card: true, side: 1, facing: 'user',
  src: null, mirror: false, stream: null,
  segmenter: null, mask: null, box: null, lastTs: 0,
  stand: null, summonAt: 0,
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
  useStand({ id, owner: '', ...STANDS[id] }); show('cam');
};

// ── 結果 ─────────────────────────────────────────────
function hexPoints(cx, cy, r, vals) {
  return vals.map((v, i) => {
    const a = -Math.PI / 2 + i * Math.PI / 3;
    return [cx + Math.cos(a) * r * v, cy + Math.sin(a) * r * v];
  });
}
function drawHexSvg(svg, grade) {
  const ns = 'http://www.w3.org/2000/svg', el = (n, a) => { const e = document.createElementNS(ns, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
  svg.innerHTML = '';
  for (const k of [1, .6]) svg.append(el('polygon', { points: hexPoints(110, 110, 78, Array(6).fill(k)).join(' '), fill: 'none', style: 'stroke:var(--line)' }));
  const vals = STAT_KEYS.map(([k]) => GRADE_V[grade[k]] / 5);
  svg.append(el('polygon', { points: hexPoints(110, 110, 78, vals).join(' '), style: 'fill:color-mix(in srgb,var(--accent) 40%,transparent);stroke:var(--accent);stroke-width:2' }));
  hexPoints(110, 110, 96, Array(6).fill(1)).forEach(([x, y], i) => {
    const t = el('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'middle', style: 'fill:var(--fg);font:400 15px var(--display)' });
    t.textContent = grade[STAT_KEYS[i][0]]; svg.append(t);
  });
}
function useStand(s) {
  state.stand = s;
  document.documentElement.style.setProperty('--accent', s.text);
  $('camTitle').textContent = `《${s.name}》`;
  loadArt(s.id).catch(() => {});
}
async function showResult(s) {
  useStand(s);
  $('rOwner').textContent = `本體：${s.owner}　的替身是`;
  $('rTag').textContent = `人格標籤｜${s.tag}`;
  $('rName').textContent = `《${s.name}》`;
  $('rZh').textContent = s.zh;
  $('rImg').alt = `${s.zh}的替身立繪`;
  drawHexSvg($('rHex'), s.grade);
  const dl = $('rStats'); dl.innerHTML = '';
  for (const [k, label] of STAT_KEYS) {
    const d = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = label; dd.textContent = s.grade[k]; d.append(dt, dd); dl.append(d);
  }
  $('rAbility').textContent = s.ability;
  $('rNote').textContent = s.note;
  $('rTry').textContent = `這週試試：${s.try}`;
  $('copy').textContent = '複製我的替身文字';
  show('result');
  try { $('rImg').src = (await loadArt(s.id)).toDataURL(); } catch {}
}
$('summon').onclick = () => show('cam');
$('toResult').onclick = () => show(state.stand?.owner ? 'result' : 'intro');
$('copy').onclick = async () => {
  const s = state.stand; if (!s) return;
  const text = [
    `本體：${s.owner}`, `人格標籤：${s.tag}`, `替身：《${s.name}》${s.zh}`,
    STAT_KEYS.map(([k, l]) => `${l} ${s.grade[k]}`).join('／'),
    `能力：${s.ability}`, `來測你的替身 → ${location.origin + location.pathname}`,
  ].join('\n');
  try { await navigator.clipboard.writeText(text); $('copy').textContent = '已複製，可以貼到 LINE'; }
  catch { $('copy').textContent = '這個瀏覽器不能自動複製'; }
};
const saved = store.get('stand-answers');
if (saved?.q5) {
  const b = document.createElement('button'); b.className = 'secondary'; b.textContent = '查看上次的替身';
  b.onclick = () => { answers = saved; showResult(computeStand(saved)); };
  $('skip').before(b);
}

// ── 相機介面 ───────────────────────────────────────────
for (const [id, name] of [['sfx', '擬聲字'], ['card', '資訊卡']]) {
  const b = document.createElement('button');
  b.className = 'chip'; b.type = 'button'; b.textContent = name;
  b.setAttribute('aria-pressed', String(state[id]));
  b.onclick = () => { state[id] = !state[id]; b.setAttribute('aria-pressed', String(state[id])); };
  $('sfx').append(b);
}
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
  state.summonAt = performance.now();
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
      for (let i = 0; i < f.length; i++) {
        const a = f[i];
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255; d[i * 4 + 3] = a * 255;
        if (a > .5) { const x = i % mw, y = (i / mw) | 0; n++;
          if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
      maskCtx.putImageData(img, 0, 0);
      state.mask = maskC;
      if (n > f.length * .01) smoothBox({ x0: minX / mw, y0: minY / mh, x1: (maxX + 1) / mw, y1: (maxY + 1) / mh });
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
  state.mask = maskC; state.box = { x0: .19, y0: .14, x1: .81, y1: 1 };
}

let halftone = null;
function halftonePattern() {
  const c = mk(10, 10), g = c.getContext('2d');
  g.fillStyle = '#000'; g.beginPath(); g.arc(5, 5, 2.1, 0, 7); g.fill();
  return ctx.createPattern(c, 'repeat');
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
  const box = state.box || { x0: .25, y0: .15, x1: .75, y1: 1 };

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
  if (FILTER_OK) ctx.filter = 'contrast(1.15) saturate(1.1) brightness(.72)';
  ctx.drawImage(srcC, 0, 0); ctx.filter = 'none';
  if (!FILTER_OK) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(0, 0, W, H); }
  ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = s.tint; ctx.globalAlpha = .45; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  halftone ||= halftonePattern();
  ctx.globalAlpha = .15; ctx.fillStyle = halftone; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;

  // 4. 替身：站在本人斜後方，頭比本人高，緩慢浮動；剛召喚時從下方升起
  const bw = (box.x1 - box.x0) * W, bh = (box.y1 - box.y0) * H;
  const cx = (box.x0 + box.x1) / 2 * W, headY = box.y0 * H;
  const a = art[s.id];
  const enter = Math.min(1, (now - state.summonAt) / 900), ease = 1 - Math.pow(1 - enter, 3);
  let sx = cx, sy = headY;
  if (a) {
    const sh = Math.min(H * .82, Math.max(bh * .9, H * .5)), sw = sh * a.width / a.height;
    // 站在斜後方，但至少留六成身體在畫面內
    sx = Math.min(W - sw * .3, Math.max(sw * .3, cx + state.side * bw * .45));
    sy = headY - sh * .16 + Math.sin(t * 1.6) * u * .8 + (1 - ease) * sh * .25;
    speedLines(sx, sy + sh * .25, W, H, t, s);
    ctx.save();
    // 殘影
    ctx.globalAlpha = .22 * ease;
    ctx.drawImage(a, sx - sw * .52 - state.side * u * 2, sy - u, sw * 1.04, sh * 1.04);
    // 本體＋光暈
    ctx.globalAlpha = .95 * ease;
    ctx.shadowColor = s.glow; ctx.shadowBlur = 6 * u;
    ctx.drawImage(a, sx - sw / 2, sy, sw, sh);
    ctx.restore();
  } else {
    speedLines(cx, headY, W, H, t, s);
  }

  // 5. 本人的氣場與本人（擋在替身前面）
  ctx.globalCompositeOperation = 'lighter';
  ctx.save(); ctx.globalAlpha = .35 + Math.sin(t * 7.3) * .06;
  const k = 1.05 + Math.sin(t * 5) * .01, cy = (box.y0 + box.y1) / 2 * H;
  ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy); ctx.drawImage(auraC, 0, 0);
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
  if (FILTER_OK) ctx.filter = 'contrast(1.08)';
  ctx.drawImage(personC, 0, 0); ctx.filter = 'none';

  if (state.sfx) sfx(W, H, t, s);
  vignette(W, H);
  if (state.card && s.owner) standCard(W, H, s);
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

// 擬聲字放在替身的另一側，跟著節奏抖動
const SFX_SLOTS = [[.1, .2, -12, 1], [.18, .34, -8, .82], [.09, .48, -14, .68]];
function sfx(W, H, t, s) {
  const base = Math.min(W, H) * .17;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  SFX_SLOTS.forEach(([x, y, rot, k], i) => {
    const px = state.side > 0 ? x : 1 - x;
    const j = Math.sin(t * 22 + i * 1.7) * base * .025;
    const size = base * k * (1 + Math.sin(t * 3 + i) * .04);
    ctx.save();
    ctx.translate(px * W + j, y * H - j); ctx.rotate((state.side > 0 ? rot : -rot) * Math.PI / 180);
    ctx.font = `${size}px "Dela Gothic One", "Hiragino Sans", sans-serif`;
    ctx.lineWidth = size * .2; ctx.strokeStyle = '#120a1c'; ctx.strokeText(s.sfx, 0, 0);
    ctx.lineWidth = size * .07; ctx.strokeStyle = '#fff'; ctx.strokeText(s.sfx, 0, 0);
    ctx.fillStyle = s.text; ctx.fillText(s.sfx, 0, 0);
    ctx.restore();
  });
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
  const cw = Math.min(W - pad * 2, 64 * u), ch = 21 * u, x = pad, y = H - ch - pad;
  ctx.save();
  ctx.fillStyle = 'rgba(12,8,20,.8)'; ctx.strokeStyle = s.text; ctx.lineWidth = .5 * u;
  ctx.beginPath(); ctx.moveTo(x + 2 * u, y); ctx.lineTo(x + cw, y); ctx.lineTo(x + cw - 2 * u, y + ch); ctx.lineTo(x, y + ch); ctx.closePath();
  ctx.fill(); ctx.stroke();
  const r = 7.5 * u, hx = x + cw - r - 4.5 * u, hy = y + ch / 2;
  const pts = (rr, vals) => hexPoints(hx, hy, rr, vals);
  const poly = (p) => { ctx.beginPath(); p.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); };
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = .25 * u; poly(pts(r, Array(6).fill(1))); ctx.stroke();
  ctx.fillStyle = s.tint + 'aa'; ctx.strokeStyle = s.text; ctx.lineWidth = .4 * u;
  poly(pts(r, STAT_KEYS.map(([k]) => GRADE_V[s.grade[k]] / 5))); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${2.4 * u}px "Dela Gothic One", sans-serif`;
  pts(r + 2.4 * u, Array(6).fill(1)).forEach(([px, py], i) => ctx.fillText(s.grade[STAT_KEYS[i][0]], px, py));
  const tx = x + 4 * u, maxW = hx - r - 3 * u - tx;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `600 ${2.3 * u}px system-ui, sans-serif`;
  ctx.fillText(`本體：${s.owner}｜人格標籤：${s.tag}`, tx, y + 5.5 * u, maxW);
  ctx.fillStyle = s.text; ctx.font = `${4.6 * u}px "Dela Gothic One", sans-serif`;
  ctx.fillText(`《${s.name}》`, tx - 1.2 * u, y + 12 * u, maxW + 1.2 * u);
  ctx.fillStyle = '#fff'; ctx.font = `600 ${2.4 * u}px system-ui, sans-serif`;
  ctx.fillText(s.zh, tx, y + 17 * u, maxW);
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
  try { await navigator.share({ files: [file], title: s ? `我的替身《${s.name}》` : '我的替身' }); }
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

document.fonts?.load('80px "Dela Gothic One"', 'ゴド').catch(() => {});
requestAnimationFrame(render);
