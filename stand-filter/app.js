import { FilesetResolver, ImageSegmenter } from './lib/vision_bundle.mjs';
import { QUESTIONS, STAT_KEYS, computeStand } from './quiz.js';

// ── 風格 ─────────────────────────────────────────────
const STYLES = [
  { id: 'violet', name: '紫電', tint: '#7a4dff', glow: '#cdb2ff', text: '#b15cff',
    bg: 'contrast(1.15) saturate(1.15) brightness(.78)', person: 'contrast(1.1)' },
  { id: 'gold', name: '黃金', tint: '#ffb300', glow: '#fff0a0', text: '#ffd23f',
    bg: 'contrast(1.2) saturate(1.1) brightness(.75) sepia(.25)', person: 'contrast(1.1) saturate(1.1)' },
  { id: 'jade', name: '翠綠', tint: '#12d688', glow: '#b8ffdc', text: '#2bd97c',
    bg: 'contrast(1.15) brightness(.75) hue-rotate(-20deg)', person: 'contrast(1.1)' },
  { id: 'crimson', name: '赤紅', tint: '#ff2e55', glow: '#ffb3c1', text: '#ff3d6e',
    bg: 'contrast(1.2) brightness(.72) saturate(1.2)', person: 'contrast(1.1)' },
  { id: 'dawn', name: '曙光', tint: '#ff7a2e', glow: '#ffd9b0', text: '#ff9a4d',
    bg: 'contrast(1.15) brightness(.76) saturate(1.1)', person: 'contrast(1.08) saturate(1.05)' },
  // 漫畫裡整頁換色的效果：背景與人都轉色相
  { id: 'swap', name: '異色', tint: '#00e1ff', glow: '#d0fbff', text: '#ff4fd8',
    bg: 'hue-rotate(160deg) saturate(1.7) contrast(1.25) brightness(.8)', person: 'hue-rotate(160deg) saturate(1.5) contrast(1.15)' },
];
const SFX = [
  { id: 'go', name: 'ゴゴゴ', ch: 'ゴ' },
  { id: 'do', name: 'ドドド', ch: 'ド' },
  { id: 'none', name: '無字', ch: '' },
];

const $ = (id) => document.getElementById(id);
const view = $('view'), ctx = view.getContext('2d');
const video = $('video');
const state = {
  style: STYLES[0], sfx: SFX[0], side: 1, facing: 'user', card: true,
  src: null, mirror: false, stream: null,
  segmenter: null, mask: null, box: null, lastTs: 0,
  stand: null,
};

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ── 畫面切換 ───────────────────────────────────────────
function show(id) {
  for (const s of ['intro', 'quiz', 'result', 'cam']) $(s).hidden = s !== id;
  if (id !== 'cam') stopCamera();
  else { $('start').hidden = false; $('shot').disabled = true; notice(''); }
  $(id).scrollTop = 0;
}
function setStyle(st) {
  state.style = st;
  document.documentElement.style.setProperty('--accent', st.text);
  for (const b of $('styles').children) b.setAttribute('aria-pressed', String(b.dataset.id === st.id));
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
    const f = document.createElement(Q.id === 'memory' ? 'textarea' : 'input');
    f.className = 'field'; f.id = 'q_' + Q.id; f.maxLength = Q.max; f.placeholder = Q.placeholder;
    if (f.tagName === 'TEXTAREA') f.rows = 3;
    f.value = answers[Q.id] || '';
    const row = document.createElement('div'); row.className = 'row';
    const next = document.createElement('button'); next.className = 'primary'; next.textContent = '下一步';
    const skip = document.createElement('button'); skip.className = 'secondary'; skip.textContent = '先略過';
    next.onclick = () => { answers[Q.id] = f.value.trim(); advance(); };
    skip.onclick = () => { answers[Q.id] = ''; advance(); };
    f.onkeydown = (e) => { if (e.key === 'Enter' && f.tagName === 'INPUT') next.click(); };
    row.append(next, skip); body.append(f, row);
  } else {
    for (const [val, label, sub] of Q.options) {
      const b = document.createElement('button'); b.className = 'opt'; b.type = 'button';
      b.setAttribute('aria-pressed', String(answers[Q.id] === val));
      const t = document.createElement('span'); t.textContent = label; b.append(t);
      if (sub) { const s = document.createElement('small'); s.textContent = sub; b.append(s); }
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
$('skip').onclick = () => { state.stand = null; $('camTitle').textContent = '替身相機'; show('cam'); };

// ── 結果 ─────────────────────────────────────────────
const GRADE_V = { A: 5, B: 4, C: 3, D: 2, E: 1 };
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
function showResult(s) {
  state.stand = s;
  const st = STYLES.find((x) => x.id === s.domain.style) || STYLES[0];
  setStyle(st);
  $('rOwner').textContent = `本體：${s.owner}　的替身是`;
  $('rName').textContent = `《${s.domain.name}》`;
  $('rZh').textContent = s.domain.zh;
  $('rForm').textContent = s.form.zh;
  drawHexSvg($('rHex'), s.grade);
  const dl = $('rStats'); dl.innerHTML = '';
  for (const [k, label] of STAT_KEYS) {
    const d = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = label; dd.textContent = s.grade[k]; d.append(dt, dd); dl.append(d);
  }
  $('rAbility').textContent = s.domain.ability;
  $('rFormDesc').textContent = s.form.desc;
  $('rMemory').textContent = s.memory ? `「${s.memory}」` : '你還沒寫下那個瞬間。下次做某件事做到忘了時間，記得把它記下來，那就是替身現身的時刻。';
  $('rKey').textContent = s.key.text;
  $('rStrength').textContent = `優勢：${s.priority.strength}`;
  $('rWeak').textContent = `弱點：${s.priority.weak}`;
  $('rWhy').textContent = s.priority.why;
  $('rTry').textContent = `練習：${s.priority.try}`;
  $('rNeedTitle').textContent = `你現在最需要的是「${s.need.zh}」：${s.need.title}`;
  $('rNeed').textContent = s.need.text;
  $('rNeedTry').textContent = `這週試試：${s.need.try}`;
  $('copy').textContent = '複製我的替身文字';
  $('camTitle').textContent = `《${s.domain.name}》`;
  show('result');
}
$('summon').onclick = () => show('cam');
$('toResult').onclick = () => show(state.stand ? 'result' : 'intro');
$('copy').onclick = async () => {
  const s = state.stand; if (!s) return;
  const text = [
    `本體：${s.owner}`, `替身：《${s.domain.name}》${s.domain.zh}（${s.form.zh}）`,
    STAT_KEYS.map(([k, l]) => `${l} ${s.grade[k]}`).join('／'),
    `能力：${s.domain.ability}`, s.memory ? `誕生的瞬間：「${s.memory}」` : '',
    `覺醒條件：${s.need.title}`, location.origin + location.pathname,
  ].filter(Boolean).join('\n');
  try { await navigator.clipboard.writeText(text); $('copy').textContent = '已複製，可以貼到 LINE'; }
  catch { $('copy').textContent = '這個瀏覽器不能自動複製'; }
};
const saved = store.get('stand-answers');
if (saved?.domain) {
  const b = document.createElement('button'); b.className = 'secondary'; b.textContent = '查看上次的替身';
  b.onclick = () => { answers = saved; showResult(computeStand(saved)); };
  $('skip').before(b);
}

// ── 相機介面 ───────────────────────────────────────────
function chips(el, list, onPick, label, isOn) {
  el.innerHTML = '';
  for (const it of list) {
    const b = document.createElement('button');
    b.className = 'chip'; b.type = 'button'; b.dataset.id = it.id;
    b.setAttribute('aria-pressed', String(isOn(it)));
    if (it.tint) { const d = document.createElement('span'); d.className = 'dot'; d.style.background = it.tint; b.append(d); }
    b.append(label(it));
    b.onclick = () => onPick(it, b);
    el.append(b);
  }
}
chips($('styles'), STYLES, (s) => setStyle(s), (s) => s.name, (s) => s === state.style);
chips($('sfx'), [...SFX, { id: 'card', name: '資訊卡' }], (it, b) => {
  if (it.id === 'card') { state.card = !state.card; b.setAttribute('aria-pressed', String(state.card)); return; }
  state.sfx = it;
  for (const x of $('sfx').children) if (x.dataset.id !== 'card') x.setAttribute('aria-pressed', String(x === b));
}, (s) => s.name, (s) => s.id === 'card' ? state.card : s === state.sfx);

function notice(msg) { const n = $('notice'); n.textContent = msg; n.hidden = !msg; }

// ── 人像分割模型（全部放在自己的網站上，不連外部服務） ──────
const FILTER_OK = (() => { const c = document.createElement('canvas').getContext('2d'); c.filter = 'blur(1px)'; return c.filter === 'blur(1px)'; })();
const mk = (w = 1, h = 1) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const srcC = mk(), personC = mk(), ghostC = mk(), auraC = mk(), maskC = mk(256, 256), tinyC = mk(48, 48);
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
  const w = src.videoWidth || src.naturalWidth, h = src.videoHeight || src.naturalHeight;
  const k = Math.min(1, 1080 / Math.max(w, h));
  const W = Math.round(w * k), H = Math.round(h * k);
  for (const c of [view, srcC, personC, ghostC, auraC]) { c.width = W; c.height = H; }
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
  // 沒有模型時：畫面中央的柔邊橢圓
  const g = maskCtx; maskC.width = maskC.height = 128;
  const r = g.createRadialGradient(64, 70, 10, 64, 70, 60);
  r.addColorStop(0, '#fff'); r.addColorStop(.75, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.beginPath(); g.ellipse(64, 74, 40, 56, 0, 0, 7); g.fill();
  state.mask = maskC; state.box = { x0: .19, y0: .14, x1: .81, y1: 1 };
}

// 替身的型態決定它站在哪裡、多大、有幾個
function placements(form, cx, cy, bw, bh, W, t, side) {
  const bob = Math.sin(t * 1.7) * bh * .012;
  switch (form) {
    case 'guard': return [{ x: cx + side * bw * .08, y: cy - bh * .13 + bob, s: 1.28 + Math.sin(t * 1.3) * .012, a: .8 }];
    case 'remote': return [{ x: Math.min(W * .9, Math.max(W * .1, cx + side * bw * .6)), y: cy - bh * .3 + bob, s: .6, a: .85 }];
    case 'swarm': return [0, 1, 2].map((i) => {
      const a = t * .8 + i * 2.094;
      return { x: cx + Math.cos(a) * bw * .55, y: cy - bh * .3 + Math.sin(a) * bh * .08 + bob, s: .5, a: .9 };
    });
    default: return [{ x: cx + side * bw * .3, y: cy - bh * .07 + bob, s: 1.12 + Math.sin(t * 1.3) * .012, a: .9 }];
  }
}

let halftone = null;
function halftonePattern() {
  const c = mk(10, 10), g = c.getContext('2d');
  g.fillStyle = '#000'; g.beginPath(); g.arc(5, 5, 2.1, 0, 7); g.fill();
  return ctx.createPattern(c, 'repeat');
}

function render(now) {
  requestAnimationFrame(render);
  const src = state.src; if (!src) return;
  if (src === video && video.readyState < 2) return;
  const W = view.width, H = view.height, t = now / 1000, st = state.style;

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

  // 2. 替身：灰階高反差 + 染色
  const gc = ghostC.getContext('2d');
  gc.clearRect(0, 0, W, H);
  if (FILTER_OK) gc.filter = 'grayscale(1) contrast(1.7) brightness(1.2)';
  gc.drawImage(personC, 0, 0); gc.filter = 'none';
  gc.globalCompositeOperation = 'source-atop';
  gc.globalAlpha = .62; gc.fillStyle = st.tint; gc.fillRect(0, 0, W, H);
  gc.globalAlpha = 1; gc.globalCompositeOperation = 'source-over';

  // 3. 氣場：把遮罩縮到很小再放大＝便宜的大範圍模糊
  const tc = tinyC.getContext('2d');
  tc.clearRect(0, 0, 48, 48); tc.drawImage(state.mask, 0, 0, 48, 48);
  const ac = auraC.getContext('2d');
  ac.clearRect(0, 0, W, H); ac.imageSmoothingQuality = 'high';
  ac.drawImage(tinyC, 0, 0, W, H);
  ac.globalCompositeOperation = 'source-in';
  ac.fillStyle = st.glow; ac.fillRect(0, 0, W, H);
  ac.globalCompositeOperation = 'source-over';

  // 4. 組合
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  if (FILTER_OK) ctx.filter = st.bg;
  ctx.drawImage(srcC, 0, 0);
  ctx.filter = 'none';
  if (!FILTER_OK) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, 0, W, H); }

  halftone ||= halftonePattern();
  ctx.globalAlpha = .16; ctx.fillStyle = halftone; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;

  const bw = (box.x1 - box.x0) * W, bh = (box.y1 - box.y0) * H;
  const cx = (box.x0 + box.x1) / 2 * W, cy = (box.y0 + box.y1) / 2 * H;
  const ghosts = placements(state.stand?.formId || 'power', cx, cy, bw, bh, W, t, state.side);

  // 集中線（從第一個替身放射）
  speedLines(ghosts[0].x, ghosts[0].y - bh * .2, W, H, t);

  const drawAt = (c, scale, x, y, alpha) => {
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.translate(x, y); ctx.scale(scale, scale); ctx.translate(-cx, -cy);
    ctx.drawImage(c, 0, 0); ctx.restore();
  };
  for (const g of ghosts) {
    ctx.globalCompositeOperation = 'lighter';
    drawAt(auraC, g.s * 1.06, g.x, g.y, .55 + Math.sin(t * 6) * .08);
    ctx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.shadowColor = st.glow; ctx.shadowBlur = 24;
    drawAt(ghostC, g.s, g.x, g.y, g.a);
    ctx.restore();
  }

  // 本人身上的氣場與本人
  ctx.globalCompositeOperation = 'lighter';
  drawAt(auraC, 1.05 + Math.sin(t * 5) * .01, cx, cy, .35 + Math.sin(t * 7.3) * .06);
  ctx.globalCompositeOperation = 'source-over';
  if (FILTER_OK) ctx.filter = st.person;
  ctx.drawImage(personC, 0, 0);
  ctx.filter = 'none';

  if (state.sfx.ch) sfx(W, H, t, st);
  vignette(W, H);
  if (state.card && state.stand) standCard(W, H, st, state.stand);
}

function speedLines(x, y, W, H, t) {
  const R = Math.hypot(W, H);
  ctx.save(); ctx.translate(x, y); ctx.rotate(t * .05);
  ctx.fillStyle = 'rgba(255,255,255,.07)';
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * Math.PI * 2 + (i % 3) * .02, w = .012 + (i % 5) * .004;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * .12, Math.sin(a) * R * .12);
    ctx.lineTo(Math.cos(a - w) * R, Math.sin(a - w) * R); ctx.lineTo(Math.cos(a + w) * R, Math.sin(a + w) * R);
    ctx.fill();
  }
  ctx.restore();
}

// 擬聲字固定排在兩側，跟著節奏抖動
const SFX_SLOTS = [[.08, .16, -12, 1], [.17, .3, -8, .82], [.07, .45, -14, .68], [.9, .5, 10, .95], [.82, .63, 6, .78], [.92, .75, 12, .62]];
function sfx(W, H, t, st) {
  const base = Math.min(W, H) * .17;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  SFX_SLOTS.forEach(([x, y, rot, k], i) => {
    const j = Math.sin(t * 22 + i * 1.7) * base * .025;
    const size = base * k * (1 + Math.sin(t * 3 + i) * .04);
    ctx.save();
    ctx.translate(x * W + j, y * H - j); ctx.rotate(rot * Math.PI / 180);
    ctx.font = `${size}px "Dela Gothic One", "Hiragino Sans", sans-serif`;
    ctx.lineWidth = size * .2; ctx.strokeStyle = '#120a1c'; ctx.strokeText(state.sfx.ch, 0, 0);
    ctx.lineWidth = size * .07; ctx.strokeStyle = '#fff'; ctx.strokeText(state.sfx.ch, 0, 0);
    ctx.fillStyle = st.text; ctx.fillText(state.sfx.ch, 0, 0);
    ctx.restore();
  });
  ctx.restore();
}
function vignette(W, H) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.hypot(W, H) * .6);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,0,20,.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// 照片左下角的替身資訊卡：名字、本體、六項能力值
function standCard(W, H, st, s) {
  const u = Math.min(W, H) / 100, pad = 3 * u;
  const cw = Math.min(W - pad * 2, 62 * u), ch = 21 * u, x = pad, y = H - ch - pad;
  ctx.save();
  ctx.fillStyle = 'rgba(12,8,20,.78)'; ctx.strokeStyle = st.text; ctx.lineWidth = .5 * u;
  ctx.beginPath(); ctx.moveTo(x + 2 * u, y); ctx.lineTo(x + cw, y); ctx.lineTo(x + cw - 2 * u, y + ch); ctx.lineTo(x, y + ch); ctx.closePath();
  ctx.fill(); ctx.stroke();
  // 六角能力圖
  const r = 7.5 * u, hx = x + cw - r - 4.5 * u, hy = y + ch / 2;
  const pts = (rr, vals) => hexPoints(hx, hy, rr, vals);
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = .25 * u;
  ctx.beginPath(); pts(r, Array(6).fill(1)).forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.stroke();
  ctx.fillStyle = st.tint + 'aa'; ctx.strokeStyle = st.text; ctx.lineWidth = .4 * u;
  ctx.beginPath(); pts(r, STAT_KEYS.map(([k]) => GRADE_V[s.grade[k]] / 5)).forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${2.4 * u}px "Dela Gothic One", sans-serif`;
  pts(r + 2.4 * u, Array(6).fill(1)).forEach(([px, py], i) => ctx.fillText(s.grade[STAT_KEYS[i][0]], px, py));
  // 文字
  const tx = x + 4 * u, maxW = hx - r - 3 * u - tx;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = `600 ${2.3 * u}px system-ui, sans-serif`;
  ctx.fillText(`本體：${s.owner}`, tx, y + 5.5 * u, maxW);
  ctx.fillStyle = st.text; ctx.font = `${4.6 * u}px "Dela Gothic One", sans-serif`;
  ctx.fillText(`《${s.domain.name}》`, tx - 1.2 * u, y + 12 * u, maxW + 1.2 * u);
  ctx.fillStyle = '#fff'; ctx.font = `600 ${2.4 * u}px system-ui, sans-serif`;
  ctx.fillText(`${s.domain.zh}・${s.form.zh}`, tx, y + 17 * u, maxW);
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
  try { await navigator.share({ files: [file], title: s ? `我的替身《${s.domain.name}》` : '我的替身' }); }
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
