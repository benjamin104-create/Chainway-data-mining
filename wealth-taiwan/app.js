import { FilesetResolver, ImageSegmenter, FaceDetector, FaceLandmarker } from './lib/vision_bundle.mjs';
import { createBeautyGL } from './beauty-gl.js';
import { QUESTIONS, STANDS, STAT_KEYS, STAT_INFO, LANGS, MEDIA, ANSWER_MEDIA, TAGS, PACK, computeStand, standById } from './quiz.js';

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
  colTop: null, pose: null, layout: 'auto', capturing: false,
};
window.__state = state;
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
  try { img = await loadImage(`stands/${id}.jpg`); } catch { img = await loadImage(`stands/${id}.png`); }
  return (art[id] = cutout(img));
}
function cutout(img) {
  // 放大三倍再去背：原圖小，直接去背邊緣會一格一格；放大後邊緣比較平滑
  const K = 3, w = img.naturalWidth * K, h = img.naturalHeight * K, N = w * h;
  const c = mk(w, h), g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, w, h);
  const im = g.getImageData(0, 0, w, h), d = im.data;
  // 背景色：取四邊偏亮像素的平均（不一定是純白）
  let br = 0, bgc = 0, bb = 0, bn = 0;
  const edgePx = [];
  for (let x = 0; x < w; x++) edgePx.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) edgePx.push(y * w, y * w + w - 1);
  for (const p of edgePx) { const i = p * 4; if (d[i] + d[i + 1] + d[i + 2] > 600) { br += d[i]; bgc += d[i + 1]; bb += d[i + 2]; bn++; } }
  const B = bn ? [br / bn, bgc / bn, bb / bn] : [255, 255, 255];
  const dist = (i) => Math.max(Math.abs(d[i] - B[0]), Math.abs(d[i + 1] - B[1]), Math.abs(d[i + 2] - B[2]));
  const T0 = 12, T1 = 64, FLOOD = 34;          // 與背景差 <T0 全透明、>T1 全不透明，中間漸變
  // 1. 從四邊往內灌水：連到邊緣、接近背景色的才算背景，角色身上的白色不會被挖掉
  const bgm = new Uint8Array(N), stack = edgePx.slice();
  while (stack.length) {
    const p = stack.pop();
    if (bgm[p]) continue;
    const i = p * 4; if (d[i + 3] > 20 && dist(i) >= FLOOD) continue;
    bgm[p] = 1;
    const x = p % w;
    if (x > 0) stack.push(p - 1); if (x < w - 1) stack.push(p + 1);
    if (p >= w) stack.push(p - w); if (p < N - w) stack.push(p + w);
  }
  // 2. 被包住的白色空隙（手臂與身體之間）：很接近背景色、面積夠大的才挖掉
  const lab = new Uint8Array(N);
  for (let s0 = 0; s0 < N; s0++) {
    if (bgm[s0] || lab[s0] || dist(s0 * 4) >= 6) continue;
    const comp = [], st = [s0]; lab[s0] = 1;
    while (st.length) {
      const p = st.pop(); comp.push(p);
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= N || lab[q] || bgm[q] || dist(q * 4) >= 6) continue;
        lab[q] = 1; st.push(q);
      }
    }
    if (comp.length > N * .004) for (const p of comp) bgm[p] = 2;
  }
  // 3. 透明度：背景區依色差漸變；緊貼背景的角色邊緣也依色差柔化，並把混進去的白色扣掉
  const near = (p) => { const x = p % w; return (x > 0 && bgm[p - 1]) || (x < w - 1 && bgm[p + 1]) || (p >= w && bgm[p - w]) || (p < N - w && bgm[p + w]); };
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let p = 0; p < N; p++) {
    const i = p * 4; let a;
    if (bgm[p]) { const dd = dist(i); a = dd <= T0 ? 0 : Math.min(1, (dd - T0) / (T1 - T0)) * .6; }
    else if (near(p)) a = Math.min(1, Math.max(.35, (dist(i) - T0) / (T1 - T0)));
    else a = 1;
    if (a < 1 && a > 0) for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, (d[i + k] - (1 - a) * B[k]) / a));
    d[i + 3] = Math.round(d[i + 3] * a);
    if (d[i + 3] > 24) { const x = p % w, y = (p / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  g.putImageData(im, 0, 0);
  if (x1 < x0) return c;
  const out = mk(x1 - x0 + 1, y1 - y0 + 1);
  out.getContext('2d').drawImage(c, -x0, -y0);
  return out;
}

// ── 畫面切換 ───────────────────────────────────────────
function show(id) {
  for (const s of ['intro', 'quiz', 'bwa', 'result', 'cam']) $(s).hidden = s !== id;
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
  $('qscene').textContent = Q.scene ? `參拜之旅 ・ ${Q.scene}` : '參拜之旅 ・ 出發';
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
    f.enterKeyHint = 'next';
    row.append(next, skip); body.append(f, row);
    setTimeout(() => f.focus(), 50);
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
  if (qi < QUESTIONS.length - 1) {
    qi++; store.set('stand-progress', { qi, answers });   // 每答一題就存，中途離開也能接著做
    renderQuestion(); $('quiz').scrollTop = 0; return;
  }
  store.set('stand-answers', answers); store.set('stand-progress', null);
  startBwa(computeStand(answers));
}

// ── 擲筊：擲出聖筊（一平一凸），神明才現身。前兩次可能是笑筊或陰筊，第三次一定是聖筊 ──
let bwaResult = null, bwaTries = 0;
function startBwa(s) { bwaResult = s; bwaTries = 0; setBwa('ready'); show('bwa'); }
function setBwa(kind) {
  const L = $('bwaL'), R = $('bwaR'), msg = $('bwaMsg'), btn = $('bwaThrow'), go = $('bwaGo');
  const face = { holy: ['up', 'down'], laugh: ['up', 'up'], yin: ['down', 'down'], ready: ['down', 'up'] }[kind];
  L.dataset.face = face[0]; R.dataset.face = face[1];
  msg.textContent = {
    ready: '請雙手合十，在心裡說出你的名字，誠心擲筊。',
    holy: '聖筊！神明答應了，祂已經在等你。',
    laugh: '笑筊：神明笑了笑，再誠心擲一次。',
    yin: '陰筊：再靜下心想一想，再擲一次。',
  }[kind];
  btn.hidden = kind === 'holy'; go.hidden = kind !== 'holy';
}
$('bwaThrow').onclick = () => {
  const L = $('bwaL'), R = $('bwaR'); $('bwaThrow').disabled = true;
  L.classList.remove('toss'); R.classList.remove('toss'); void L.offsetWidth;
  L.classList.add('toss'); R.classList.add('toss');
  bwaTries++;
  const roll = Math.random();
  const kind = bwaTries >= 3 || roll < .5 ? 'holy' : roll < .75 ? 'laugh' : 'yin';
  setTimeout(() => { setBwa(kind); $('bwaThrow').disabled = false; }, 900);
};
$('bwaGo').onclick = () => showResult(bwaResult);
$('begin').onclick = () => {
  const p = store.get('stand-progress');
  if (p?.answers) { qi = p.qi; answers = p.answers; } else { qi = 0; answers = {}; }
  renderQuestion(); show('quiz');
};
$('back').onclick = () => { if (qi === 0) show('intro'); else { qi--; renderQuestion(); } };
$('redo').onclick = () => { qi = 0; answers = {}; store.set('stand-progress', null); renderQuestion(); show('quiz'); };
$('skip').onclick = () => {
  const ids = Object.keys(STANDS), id = ids[Math.floor(Math.random() * ids.length)];
  useStand(standById(id)); show('cam'); $('go').click();
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
  loadArt(s.id + '_front').catch(() => {});   // 正中央／片頭構圖用的正面立繪
  for (const k of ['_left', '_right']) loadArt(s.id + k).catch(() => {});   // 左側／右側構圖各有一個不同的 pose
}
// 自媒體建議：全部依本人的 10 個答案，不看守護神的六角圖
// 主標籤給定位，副標籤給混搭，每一題選的選項各給一句具體建議
function renderMedia(s) {
  const m = MEDIA[s.tagId], counts = s.counts || {}, a = s.answers || {};
  const title = $('mediaTitle'); title.textContent = '你是「';
  const em = document.createElement('em'); em.textContent = m.role; title.append(em, '」的財富性格');
  $('mPitch').textContent = m.pitch;
  const bars = $('mBars'); bars.innerHTML = '';
  const total = Object.values(counts).reduce((x, y) => x + y, 0) || 1;
  for (const t of Object.keys(TAGS).sort((x, y) => (counts[y] || 0) - (counts[x] || 0))) {
    const n = counts[t] || 0, row = document.createElement('div');
    row.className = 'bar-row' + (t === s.tagId || t === s.second ? ' top' : '');
    const name = document.createElement('span'); name.textContent = TAGS[t].tag;
    const track = document.createElement('i'), fill = document.createElement('span');
    fill.style.width = `${n / total * 100}%`; track.append(fill);
    const num = document.createElement('em'); num.textContent = `${n} 題`;
    row.append(name, track, num); bars.append(row);
  }
  const dl = $('mAnswers'); dl.innerHTML = '';
  for (const [q, label, by] of ANSWER_MEDIA) {
    if (!a[q]) continue;
    const d = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = label; dd.textContent = by[a[q]]; d.append(dt, dd); dl.append(d);
  }
  const tp = $('mTopics'); tp.innerHTML = '';
  for (const t of m.topics) { const sp = document.createElement('span'); sp.textContent = t; tp.append(sp); }
  $('mFormats').textContent = m.formats;
  $('mPlatforms').textContent = m.platforms;
  $('mMixCard').hidden = !s.second;
  if (s.second) $('mMix').textContent = `你的第二財富性格是「${TAGS[s.second].tag}」（${counts[s.second]} 題）：${MEDIA[s.second].mix}，讓「${m.role}」的財運更完整。`;
  $('mFirst').textContent = m.first;
  $('mWatch').textContent = `小心破財：${m.watch}`;
}

async function showResult(s) {
  useStand(s);
  $('rOwner').textContent = `眷顧 ${s.owner} 的財神是`;
  $('rTag').textContent = `財富性格｜${s.tag}`;
  $('rTagBig').textContent = s.tag;
  $('rTagSub').textContent = s.tagNames.en;
  $('rName').textContent = `《${s.name}》`;
  $('rZh').textContent = s.names ? `${s.zh}・${s.titles.ja}「${s.names.ja}」・${s.titles.en}` : s.zh;
  $('rLine').textContent = `「${s.line.zh}」`; $('rLineJa').textContent = `「${s.line.ja}」`; $('rLineEn').textContent = `“${s.line.en}”`;
  $('rImg').alt = `${s.zh}的神像`;
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
  $('copy').textContent = '複製我的財神結果';
  show('result');
  try { $('rImg').src = (await loadArt(s.id)).toDataURL(); } catch {}
}
const summon = () => { show('cam'); $('go').click(); };
$('summon').onclick = summon;
$('toResult').onclick = () => show(state.stand?.owner ? 'result' : 'intro');
$('copy').onclick = async () => {
  const s = state.stand; if (!s) return;
  const text = [
    `名字：${s.owner}`, `財富性格：${s.tag}`, `眷顧我的財神：${s.zh}`,
    STAT_KEYS.map(([k, l]) => `${l} ${s.grade[k]}`).join('／'),
    `祝福：「${s.line.zh}」`, `財富類型：${MEDIA[s.tagId].role}`, `誰是眷顧你的財神？來測 → ${location.origin + location.pathname}`,
  ].join('\n');
  try { await navigator.clipboard.writeText(text); $('copy').textContent = '已複製，可以貼到 LINE'; }
  catch { $('copy').textContent = '這個瀏覽器不能自動複製'; }
};
// 從 App 內建瀏覽器切換過來時，網址裡帶著原本的答案：存起來，直接回到結果
(() => {
  const c = new URLSearchParams(location.search).get('carry'); if (!c) return;
  try {
    const d = JSON.parse(decodeURIComponent(escape(atob(c))));
    if (d.a) store.set('stand-answers', d.a);
    if (d.p) store.set('stand-progress', d.p);
    history.replaceState(null, '', location.pathname);
    if (d.a && !d.p) setTimeout(() => { answers = d.a; showResult(computeStand(d.a)); }, 0);
  } catch {}
})();
const progress = store.get('stand-progress');
if (progress?.answers) $('begin').textContent = `繼續作答（第 ${progress.qi + 1} 步）`;
const saved = store.get('stand-answers');
if (saved?.q5) {
  const b = document.createElement('button'); b.className = 'secondary'; b.textContent = '查看上次的財神';
  b.onclick = () => { answers = saved; showResult(computeStand(saved)); };
  $('skip').before(b);
}

// ── 相機介面 ───────────────────────────────────────────
{
  const b = document.createElement('button'); b.className = 'chip'; b.type = 'button'; b.textContent = '✨ 美顏';
  b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-controls', 'beautyPanel');
  b.onclick = () => { const p = $('beautyPanel'); p.hidden = !p.hidden; b.setAttribute('aria-pressed', String(!p.hidden)); };
  $('sfx').append(b);
}
// 六角圖（能力值卡）：不放／左下／右下，拍照時由使用者決定
state.card = store.get('cardPos') ?? 'left';
const cardRow = document.createElement('div'); cardRow.className = 'chips'; cardRow.setAttribute('role', 'group'); cardRow.setAttribute('aria-label', '六角圖');
{ const lb = document.createElement('span'); lb.className = 'chip-label'; lb.textContent = '六角圖'; cardRow.append(lb); }
for (const [id, name] of [['off', '不放'], ['left', '左下'], ['right', '右下']]) {
  const b = document.createElement('button');
  b.className = 'chip'; b.type = 'button'; b.textContent = name;
  b.setAttribute('aria-pressed', String(state.card === id));
  b.onclick = () => { state.card = id; store.set('cardPos', id); for (const x of cardRow.querySelectorAll('.chip')) x.setAttribute('aria-pressed', String(x === b)); };
  cardRow.append(b);
}
$('sfx').after(cardRow);
// 心願：使用者自己寫的一句話，印在照片上自己頭上的對話框
state.wish = store.get('wish') || '';
$('wish').value = state.wish;
$('wish').oninput = () => { state.wish = $('wish').value.trim(); store.set('wish', state.wish); };
$('wish').onkeydown = (e) => { if (e.key === 'Enter') $('wish').blur(); };
const langRow = document.createElement('div'); langRow.className = 'chips'; langRow.setAttribute('role', 'group'); langRow.setAttribute('aria-label', '語言');
for (const [id, name] of Object.entries(LANGS)) {
  const b = document.createElement('button');
  b.className = 'chip'; b.type = 'button'; b.textContent = name; b.dataset.lang = id;
  b.setAttribute('aria-pressed', String(state.lang === id));
  b.onclick = () => { state.lang = id; for (const x of langRow.children) x.setAttribute('aria-pressed', String(x === b)); };
  langRow.append(b);
}
$('sfx').after(langRow);
const LAYOUTS = [['auto', '自動'], ['center', '正中央'], ['left', '左側'], ['right', '右側'], ['opening', '片頭']];
state.layout = store.get('layout') || 'auto';
const layoutRow = document.createElement('div'); layoutRow.className = 'chips'; layoutRow.setAttribute('role', 'group'); layoutRow.setAttribute('aria-label', '構圖');
for (const [id, name] of LAYOUTS) {
  const b = document.createElement('button'); b.className = 'chip'; b.type = 'button'; b.textContent = name;
  b.setAttribute('aria-pressed', String(state.layout === id));
  b.onclick = () => { state.layout = id; state.pose = null; state.summonAt = performance.now(); store.set('layout', id);
    for (const x of layoutRow.children) x.setAttribute('aria-pressed', String(x === b)); };
  layoutRow.append(b);
}
$('sfx').before(layoutRow);
function notice(msg) { const n = $('notice'); n.textContent = msg; n.hidden = !msg; }

// ── 人像分割模型（全部放在自己的網站上，不連外部服務） ──────
const FILTER_OK = (() => { const c = document.createElement('canvas').getContext('2d'); c.filter = 'blur(1px)'; return c.filter === 'blur(1px)'; })();
function mk(w = 1, h = 1) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const srcC = mk(), personC = mk(), auraC = mk(), maskC = mk(256, 256), tinyC = mk(48, 48), beautyC = mk(), eyeC = mk();
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
    // 臉部 478 個定位點（美顏用）：載入失敗就退回只找眼睛位置的臉部偵測，不影響其他功能
    const lopts = (delegate) => ({ baseOptions: { modelAssetPath: new URL('models/face_landmarker.task', location.href).href, delegate }, runningMode: 'VIDEO', numFaces: 1 });
    const fopts = (delegate) => ({ baseOptions: { modelAssetPath: new URL('models/blaze_face_short_range.tflite', location.href).href, delegate }, runningMode: 'VIDEO', minDetectionConfidence: .5 });
    FaceLandmarker.createFromOptions(fs, lopts('GPU')).catch(() => FaceLandmarker.createFromOptions(fs, lopts('CPU')))
      .then((d) => { state.landmarker = d; })
      .catch((e) => { console.warn('face landmarker failed', e);
        return FaceDetector.createFromOptions(fs, fopts('GPU')).catch(() => FaceDetector.createFromOptions(fs, fopts('CPU')))
          .then((d) => { state.faceDetector = d; }); })
      .catch((e) => console.warn('face detector failed', e));
    $('loadState').textContent = '人像辨識準備好了';
  } catch (e) {
    console.warn('segmenter failed', e);
    $('loadState').textContent = '人像辨識載入失敗，會改用中央區域當作人像';
  }
}
const modelReady = loadModel();

async function startCamera() {
  stopCamera();
  $('switchPanel').hidden = true;
  if (!navigator.mediaDevices?.getUserMedia) { cameraBlocked(); return; }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: state.facing, width: { ideal: 1280 }, height: { ideal: 1280 } },
    });
  } catch (e) {
    if (state.src && state.src !== video) return;      // 使用者已經改用相簿照片，就不再顯示相機錯誤
    if (window.IN_APP) { cameraBlocked(); return; }      // App 內建瀏覽器擋相機：給一鍵切換
    notice(e.name === 'NotAllowedError'
      ? '相機權限被拒絕了。請到瀏覽器設定允許這個網站使用相機，再重新整理。'
      : '打不開相機（' + e.name + '）。可以改用上方的相簿按鈕選一張照片。');
    return;
  }
  video.srcObject = state.stream;
  await video.play();
  useSource(video, state.facing === 'user');
}
function cameraBlocked() {
  if (window.IN_APP) { $('start').hidden = true; $('switchPanel').hidden = false; }
  else notice('這個瀏覽器不能開相機。請改用 Safari 或 Chrome 打開，或用上方的相簿按鈕選一張照片。');
}
$('switchPhoto').onclick = () => { $('switchPanel').hidden = true; $('file').click(); };
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
  for (const c of [view, srcC, personC, auraC, beautyC, eyeC]) { c.width = W; c.height = H; }
  state.face = null; state.lm = null; glBeauty?.reset();
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
const TITLE_H = 15;   // 上方標題列的高度（u），替身的頭不進這一區
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

// ── 美顏：只套在人身上（守護神和背景不變），全部在手機上算 ──────────
const BEAUTY_PRESETS = {
  natural: { smooth: 50, white: 25, light: 22, glow: 25, eyes: 60, slim: 10, chin: 10, big: 10 },
  standard: { smooth: 78, white: 45, light: 32, glow: 35, eyes: 85, slim: 25, chin: 25, big: 20 },
  goddess: { smooth: 96, white: 65, light: 40, glow: 45, eyes: 100, slim: 45, chin: 45, big: 38 },
};
const BEAUTY_DEFAULT = BEAUTY_PRESETS.standard;
state.beauty = { ...BEAUTY_DEFAULT, ...(store.get('beauty4') || {}) };
if (state.beauty.chin == null) state.beauty.chin = BEAUTY_DEFAULT.chin;
let glBeauty = null;
try { glBeauty = createBeautyGL(); } catch (e) { console.warn('beauty gl unavailable', e); }
window.__beautyGL = () => !!glBeauty;   // 測試用：GPU 美顏有沒有在跑
let faceFrame = 0;
let lmFrame = 0;
function detectFace(now) {
  const lmk = state.landmarker;
  if (lmk) {                                          // 臉部定位點：隔一格算一次
    if (lmFrame++ % 2) return;
    try {
      state.lmTs = Math.max(now, (state.lmTs || 0) + 1);
      const L = lmk.detectForVideo(srcC, state.lmTs).faceLandmarks?.[0];
      state.lm = L || null;
      if (L) {                                        // 也算出眼睛、臉框，給沒有 GPU 的備用美顏用
        const xs = L.map((p) => p.x), ys = L.map((p) => p.y);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        const e = (a, b) => [(L[a].x + L[b].x) / 2, (L[a].y + L[b].y) / 2];
        state.face = { eyes: [e(33, 133), e(263, 362)], w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, mouth: [L[13].x, L[13].y] };
      } else state.face = null;
    } catch (e) { console.warn(e); }
    return;
  }
  const d = state.faceDetector, b = state.beauty; if (!d || (b.eyes <= 0 && b.glow <= 0 && b.smooth <= 0 && b.white <= 0)) return;
  if (faceFrame++ % 3) return;                       // 每 3 格偵測一次就夠，省電
  try {
    const r = d.detectForVideo(srcC, Math.max(now, state.lastTs + 1));
    const f = r.detections?.[0]; if (!f) { state.face = null; return; }
    const W = srcC.width, H = srcC.height, k = f.keypoints;
    const bb = f.boundingBox;
    const nf = { eyes: [[k[0].x, k[0].y], [k[1].x, k[1].y]], w: bb.width / W, h: bb.height / H, cx: (bb.originX + bb.width / 2) / W, cy: (bb.originY + bb.height / 2) / H, mouth: [k[3].x, k[3].y] };
    if (!state.face) state.face = nf;
    else {                                            // 平滑，避免抖動
      const p = state.face, a = .5;
      p.w += (nf.w - p.w) * a; p.h += (nf.h - p.h) * a; p.cx += (nf.cx - p.cx) * a; p.cy += (nf.cy - p.cy) * a; p.mouth[0] += (nf.mouth[0] - p.mouth[0]) * a; p.mouth[1] += (nf.mouth[1] - p.mouth[1]) * a;
      p.eyes.forEach((e, i) => { e[0] += (nf.eyes[i][0] - e[0]) * a; e[1] += (nf.eyes[i][1] - e[1]) * a; });
    }
  } catch (e) { console.warn(e); }
}
// 皮膚範圍：用 1/4 解析度依膚色（YCbCr）找出皮膚，眼睛、眉毛、嘴唇、頭髮不算，磨皮時就不會糊掉
const skinC = mk(), skinTmp = mk(), workC = mk();
let skinFrame = 0;
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
// 五官保護區：眼睛（含眉毛）和嘴巴挖空，磨皮和遮瑕都不會蓋到
function faceAngle(f, W, H) { const [[x0, y0], [x1, y1]] = f.eyes; return Math.atan2((y1 - y0) * H, (x1 - x0) * W); }
function protectFeatures(c, f, W, H) {
  const th = faceAngle(f, W, H), dnx = -Math.sin(th), dny = Math.cos(th), fw = f.w * W, fh = f.h * H;
  const hole = (x, y, rx, ry) => {
    c.save(); c.translate(x, y); c.rotate(th); c.scale(1, ry / rx);
    const g = c.createRadialGradient(0, 0, rx * .68, 0, 0, rx);
    g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, 7); c.fill(); c.restore();
  };
  c.save(); c.globalCompositeOperation = 'destination-out';
  for (const [ex, ey] of f.eyes) hole(ex * W - dnx * fh * .04, ey * H - dny * fh * .04, fw * .17, fh * .11);
  if (f.mouth) hole(f.mouth[0] * W, f.mouth[1] * H, fw * .22, fh * .1);
  c.restore();
}
function skinMask(W, H) {
  if (skinC.width !== W || skinC.height !== H) { skinC.width = W; skinC.height = H; skinFrame = 0; }
  if (skinFrame++ % 2) return skinC;                  // 隔一格更新一次
  const w = Math.max(1, W >> 2), h = Math.max(1, H >> 2);
  if (skinTmp.width !== w || skinTmp.height !== h) { skinTmp.width = w; skinTmp.height = h; }
  const t = skinTmp.getContext('2d', { willReadFrequently: true });
  t.clearRect(0, 0, w, h); t.drawImage(personC, 0, 0, w, h);
  const im = t.getImageData(0, 0, w, h), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], bl = d[i + 2];
    const y = .299 * r + .587 * g + .114 * bl;
    const cb = 128 - .168736 * r - .331264 * g + .5 * bl, cr = 128 + .5 * r - .418688 * g - .081312 * bl;
    const s = clamp01(1 - (Math.abs(cr - 152) - 17) / 9) * clamp01(1 - (Math.abs(cb - 106) - 22) / 9) * clamp01((y - 38) / 30);
    d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = d[i + 3] * s;
  }
  t.putImageData(im, 0, 0);
  const sc = skinC.getContext('2d'); sc.clearRect(0, 0, W, H);
  if (FILTER_OK) sc.filter = `blur(${Math.max(1, W / 360)}px)`;
  sc.drawImage(skinTmp, 0, 0, W, H); sc.filter = 'none';
  const f = state.face;                              // 有找到臉：只處理臉和脖子，頭髮不會被抹糊
  if (f) {
    const x = f.cx * W, y = (f.cy + f.h * .12) * H, rx = f.w * W * .66, ry = f.h * H * .95;
    sc.save(); sc.globalCompositeOperation = 'destination-in'; sc.translate(x, y); sc.scale(1, ry / rx);
    const g = sc.createRadialGradient(0, 0, rx * .7, 0, 0, rx);
    g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
    sc.fillStyle = g; sc.fillRect(-rx, -rx, rx * 2, rx * 2); sc.restore();
    protectFeatures(sc, f, W, H);
  }
  return skinC;
}
// 把 beautyC 做某種處理後，只疊在皮膚上
function onSkin(bc, sk, filter, alpha) {
  const wc = workC.getContext('2d');
  wc.globalCompositeOperation = 'source-over'; wc.clearRect(0, 0, workC.width, workC.height);
  wc.filter = filter; wc.drawImage(beautyC, 0, 0); wc.filter = 'none';
  wc.globalCompositeOperation = 'destination-in'; wc.drawImage(sk, 0, 0); wc.globalCompositeOperation = 'source-over';
  bc.globalAlpha = alpha; bc.drawImage(workC, 0, 0); bc.globalAlpha = 1;
}
function beautify(W, H, u) {
  // 有 GPU 又找到臉：用臉部定位點做 B612 等級的美顏（磨皮、美白、遮瑕、腮紅、瘦臉、大眼）
  if (glBeauty && state.lm) {
    try { return glBeauty.render(personC, state.lm, state.beauty, W, H); }
    catch (e) { console.warn('beauty gl failed', e); glBeauty = null; }
  }
  const b = state.beauty, bc = beautyC.getContext('2d');
  if (workC.width !== W || workC.height !== H) { workC.width = W; workC.height = H; }
  bc.globalCompositeOperation = 'source-over'; bc.globalAlpha = 1; bc.clearRect(0, 0, W, H);
  if (FILTER_OK) bc.filter = 'contrast(1.03) brightness(1.04) saturate(1.04)';
  bc.drawImage(personC, 0, 0); bc.filter = 'none';
  const sk = FILTER_OK && (b.smooth > 0 || b.white > 0) ? skinMask(W, H) : null;
  // 磨皮：皮膚區域疊上大範圍模糊（兩層：先抹平斑點，再抹平細紋），五官不動
  if (sk && b.smooth > 0) {
    const k = b.smooth / 100;
    onSkin(bc, sk, `blur(${(.5 + k * 1.6) * u}px)`, Math.min(.9, k * 1.05));
    onSkin(bc, sk, `blur(${(.2 + k * .5) * u}px)`, k * .5);
  }
  // 美白：皮膚提亮、稍微降低暗沉的黃
  if (sk && b.white > 0) {
    const k = b.white / 100;
    onSkin(bc, sk, `brightness(${1 + k * .32}) saturate(${1 - k * .22}) contrast(${1 - k * .08})`, Math.min(1, k * 1.1));
  }
  // 補光：「濾色」疊加，暗部提亮得多、亮部幾乎不變，專治頂光造成的臉黑
  if (b.light > 0) {
    bc.globalCompositeOperation = 'screen'; bc.globalAlpha = b.light / 100 * .95;
    if (FILTER_OK) bc.filter = `brightness(${1 + b.light / 100 * .25})`;
    bc.drawImage(personC, 0, 0); bc.filter = 'none'; bc.globalAlpha = 1; bc.globalCompositeOperation = 'source-over';
  }
  const f = state.face;
  // 氣色：整體淡淡的蜜桃色柔光＋兩頰腮紅
  if (b.glow > 0) {
    const k = b.glow / 100;
    bc.globalCompositeOperation = 'soft-light'; bc.globalAlpha = k * .7;
    bc.fillStyle = '#ff9a84'; bc.fillRect(0, 0, W, H);
    bc.globalAlpha = 1; bc.globalCompositeOperation = 'source-over';
    if (f) {
      const mx = (f.eyes[0][0] + f.eyes[1][0]) / 2;
      bc.globalCompositeOperation = 'source-atop';
      for (const [ex, ey] of f.eyes) {
        const x = (ex + (ex - mx) * .35) * W, y = ey * H + f.h * H * .3, r = f.w * W * .2;
        const g = bc.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(255,110,120,${.32 * k})`); g.addColorStop(1, 'rgba(255,110,120,0)');
        bc.fillStyle = g; bc.beginPath(); bc.arc(x, y, r, 0, 7); bc.fill();
      }
      bc.globalCompositeOperation = 'source-over';
    }
  }
  // 淡化黑眼圈：把眼睛正下方換成「下面一點的臉頰膚色」（跟著臉的角度），再輕輕提亮
  if (b.eyes > 0 && f) {
    const k = b.eyes / 100, ec = eyeC.getContext('2d');
    const th = faceAngle(f, W, H);
    const dnx = -Math.sin(th), dny = Math.cos(th);     // 臉的「往下」方向
    const off = f.h * H * .16;
    ec.globalCompositeOperation = 'source-over'; ec.globalAlpha = 1; ec.clearRect(0, 0, W, H);
    for (const [ex, ey] of f.eyes) {
        const x = ex * W + dnx * f.h * H * .1, y = ey * H + dny * f.h * H * .1, rx = f.w * W * .15, ry = f.h * H * .055;
      ec.save(); ec.translate(x, y); ec.rotate(th); ec.scale(1, ry / rx);
      const g = ec.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.5, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ec.fillStyle = g; ec.beginPath(); ec.arc(0, 0, rx, 0, 7); ec.fill(); ec.restore();
    }
    ec.globalCompositeOperation = 'source-in';
    if (FILTER_OK) ec.filter = `brightness(${1.04 + k * .1}) blur(${.35 * u}px)`;
    ec.drawImage(beautyC, -dnx * off, -dny * off);      // 借下面臉頰的皮膚
    ec.filter = 'none'; ec.globalCompositeOperation = 'source-over';
    protectFeatures(ec, f, W, H);
    bc.globalAlpha = Math.min(.92, k * .95); bc.drawImage(eyeC, 0, 0); bc.globalAlpha = 1;
  }
  // 最後用人的輪廓裁一次，美顏效果不會溢到背景
  bc.globalCompositeOperation = 'destination-in'; bc.drawImage(personC, 0, 0);
  bc.globalCompositeOperation = 'source-over';
  return beautyC;
}
const BEAUTY_SLIDERS = [['smooth', '磨皮'], ['white', '美白'], ['eyes', '淡化黑眼圈'], ['glow', '氣色紅潤'], ['light', '補光'], ['slim', '瘦臉'], ['chin', '下巴拉提'], ['big', '大眼']];
(() => {
  const panel = $('beautyPanel');
  const pre = document.createElement('div'); pre.className = 'chips'; pre.setAttribute('role', 'group'); pre.setAttribute('aria-label', '一鍵美顏');
  const syncSliders = () => { for (const [k] of BEAUTY_SLIDERS) { const r = $('b_' + k); if (r) { r.value = state.beauty[k]; r.nextSibling.textContent = state.beauty[k]; } } };
  for (const [id, name] of [['natural', '自然'], ['standard', '標準'], ['goddess', '女神／男神']]) {
    const b = document.createElement('button'); b.className = 'chip'; b.type = 'button'; b.textContent = '✨ ' + name;
    b.onclick = () => { state.beauty = { ...BEAUTY_PRESETS[id] }; store.set('beauty4', state.beauty); syncSliders(); };
    pre.append(b);
  }
  panel.append(pre);
  for (const [k, label] of BEAUTY_SLIDERS) {
    const row = document.createElement('label'); row.className = 'slider';
    const name = document.createElement('span'); name.textContent = label;
    const r = document.createElement('input'); r.type = 'range'; r.min = 0; r.max = 100; r.value = state.beauty[k]; r.id = 'b_' + k;
    const val = document.createElement('em'); val.textContent = r.value;
    r.oninput = () => { state.beauty[k] = +r.value; val.textContent = r.value; store.set('beauty4', state.beauty); };
    row.append(name, r, val); panel.append(row);
  }
  const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'link'; reset.textContent = '恢復預設';
  reset.onclick = () => { state.beauty = { ...BEAUTY_DEFAULT }; store.set('beauty4', state.beauty);
    for (const [k] of BEAUTY_SLIDERS) { $('b_' + k).value = state.beauty[k]; $('b_' + k).nextSibling.textContent = state.beauty[k]; } };
  const off = document.createElement('button'); off.type = 'button'; off.className = 'link'; off.textContent = '全部關掉';
  off.onclick = () => { for (const [k] of BEAUTY_SLIDERS) { state.beauty[k] = 0; $('b_' + k).value = 0; $('b_' + k).nextSibling.textContent = 0; } store.set('beauty4', state.beauty); };
  const row = document.createElement('div'); row.className = 'slider-actions'; row.append(reset, off); panel.append(row);
})();

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
  detectFace(now);
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

  // 4. 替身：站在本人斜後方，頭比本人高，緩慢浮動；剛召喚時從下方升起
  const bw = (box.x1 - box.x0) * W, bh = (box.y1 - box.y0) * H;
  const cx = (box.x0 + box.x1) / 2 * W, headY = box.y0 * H;
  const L = state.layout, front = L === 'center' || L === 'opening';
  const sideArt = L === 'left' || L === 'right' ? art[s.id + '_' + L] : null;   // 左右構圖用各自的 pose
  const a = sideArt || (front && art[s.id + '_front']) || art[s.id];
  const enter = Math.min(1, (now - state.summonAt) / 900), ease = 1 - Math.pow(1 - enter, 3);
  state.personCx = cx;
  const drawGod = () => { if (!a) return;
    const p = L === 'auto' ? placeStand(W, H, bh, headY, a.width / a.height, u) : fixedLayout(L, W, H, u, a.width / a.height);
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
    const scale = (1 + Math.sin(t * 1.2) * .008 + pulse * .015) * (.85 + .15 * ease);
    const rot = P.lean * .5 + Math.sin(t * .9) * .01;
    const bob = Math.sin(t * 1.6) * u * .8 + (1 - ease) * sh * .3;
    const fx = P.x, fy = P.y + bob;                // 頭頂位置
    state.standHead = { x: fx, y: fy, sw, sh };
    holyLight(fx, fy, sw, sh, t, s, u);            // 神明身後的透明神光
    if (false) {                                   // 台灣篇不用衝擊光圈
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = s.glow; ctx.globalAlpha = pulse * .7; ctx.lineWidth = u * (1.5 - pulse);
      ctx.beginPath(); ctx.ellipse(fx, fy + sh * .35, sw * (.3 + ph), sh * (.25 + ph * .6), 0, 0, 7); ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    const flip = L === 'right' && !sideArt ? -1 : 1;   // 沒有右側專用 pose 時才把神左右翻轉
    ctx.translate(fx, fy + sh); ctx.rotate(rot); ctx.scale(scale * flip, scale);   // 以腳底為支點
    // 柔和：降低對比、微微柔焦、半透明；再疊一層模糊的光，讓神明像是從光裡現身
    ctx.globalAlpha = .82 * ease;
    if (FILTER_OK) ctx.filter = `saturate(.8) contrast(.86) brightness(1.08) blur(${.12 * u}px)`;
    ctx.shadowColor = s.glow; ctx.shadowBlur = 9 * u;
    ctx.drawImage(a, -sw / 2, -sh, sw, sh);
    ctx.shadowBlur = 0;
    if (FILTER_OK) {
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .32 * ease;
      ctx.filter = `blur(${1.6 * u}px) brightness(1.2)`;
      ctx.drawImage(a, -sw / 2, -sh, sw, sh);
    }
    ctx.restore();
  };
  state.speechRect = state.stampRect = state.cardRect = null;
  if (L === 'opening') sideBand(W, H, s);          // 片頭：人那一側鋪半透明深色帶
  else drawGod();                                  // 其他構圖：神在人後面

  // 5. 本人的氣場與本人（擋在替身前面）
  ctx.globalCompositeOperation = 'lighter';
  ctx.save(); ctx.globalAlpha = .16 + Math.sin(t * 7.3) * .03;
  const k = 1.05 + Math.sin(t * 5) * .01, cy = (box.y0 + box.y1) / 2 * H;
  ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy); ctx.drawImage(auraC, 0, 0);
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(beautify(W, H, u), 0, 0);
  if (L === 'opening') drawGod();                  // 片頭：神在最前面

  vignette(W, H);
  if (L === 'opening') { openingCaption(W, H, s, u, ease, t); }
  else {
    if (state.card !== 'off' && s.owner) standCard(W, H, s, state.card);
    tagStamp(W, H, s, u, now);
    titleBanner(W, H, s, u, ease);
    if (state.standHead) speech(W, H, s, u, t, ease);
  }
  wishBubble(W, H, s, u, box);
  credit(W, H, u);
  if (L !== 'auto' && !state.capturing) standGuide(W, H, u, t);   // 站位虛線（拍下來的照片不會有）
}

// ── 構圖：正中央／左側／右側／片頭 都是固定位置，使用者自己對著虛線站 ──
const GUIDE = { center: [.5, .52], left: [.68, .44], right: [.32, .44], opening: [.26, .46] };
function fixedLayout(L, W, H, u, ratio) {
  const top = TITLE_H * u;
  if (L === 'center') { const sh = Math.min(H * .95, W * 1.15 / ratio); return { x: W / 2, sy: top - u, sh, sw: sh * ratio, side: 1 }; }
  if (L === 'opening') { const sh = Math.min(H * .9, W * .78 / ratio); return { x: W * .66, sy: H * .06, sh, sw: sh * ratio, side: 1 }; }
  const sh = Math.min(H * .86, W * .85 / ratio), side = L === 'left' ? -1 : 1;
  return { x: L === 'left' ? W * .3 : W * .7, sy: top, sh, sw: sh * ratio, side };
}
function standGuide(W, H, u, t) {
  const [gx, gy] = GUIDE[state.layout], x = gx * W, y = gy * H, r = Math.min(W, H) * .1;
  ctx.save();
  ctx.globalAlpha = .55 + Math.sin(t * 3) * .2;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = .6 * u; ctx.setLineDash([2 * u, 1.6 * u]);
  ctx.beginPath(); ctx.ellipse(x, y, r * .8, r, 0, 0, 7); ctx.stroke();          // 頭
  ctx.beginPath(); ctx.moveTo(x - r * 2.6, H); ctx.quadraticCurveTo(x - r * 2.4, y + r * 1.6, x, y + r * 1.4);
  ctx.quadraticCurveTo(x + r * 2.4, y + r * 1.6, x + r * 2.6, H); ctx.stroke();    // 肩膀
  ctx.setLineDash([]); ctx.globalAlpha = .9; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  ctx.font = `700 ${3.4 * u}px "Noto Sans TC", system-ui, sans-serif`;
  ctx.fillText({ zh: '站進虛線，擺個 pose', ja: 'この枠に入って、ポーズ！', en: 'Step into the frame and strike a pose!' }[state.lang], x, y - r * 1.35);
  ctx.restore();
}
function sideBand(W, H, s) {
  const g = ctx.createLinearGradient(0, 0, W * .62, 0);
  g.addColorStop(0, 'rgba(8,5,16,.62)'); g.addColorStop(.7, 'rgba(8,5,16,.35)'); g.addColorStop(1, 'rgba(8,5,16,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = .5; ctx.fillStyle = s.tint; ctx.fillRect(0, 0, W * .5, H); ctx.restore();
}
// 片頭字幕：像動畫開場的標題卡
function openingCaption(W, H, s, u, ease, t) {
  const L = state.lang, k = Math.min(1, Math.max(0, ((performance.now() - state.summonAt) / 1000 - .4) / .6));
  const slide = (1 - Math.pow(1 - k, 3));
  ctx.save(); ctx.globalAlpha = slide;
  const g = ctx.createLinearGradient(0, H * .66, 0, H);
  g.addColorStop(0, 'rgba(8,5,16,0)'); g.addColorStop(.35, 'rgba(8,5,16,.7)'); g.addColorStop(1, 'rgba(8,5,16,.9)');
  ctx.fillStyle = g; ctx.fillRect(0, H * .66, W, H * .34);
  const x0 = 5 * u - (1 - slide) * 20 * u;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = s.glow; ctx.font = `700 ${3.2 * u}px system-ui, sans-serif`;
  const top = `${{ zh: '財神偵測器', ja: '金運の神さま診断', en: 'WHO BRINGS YOUR FORTUNE?' }[L]} ・ ${PACK.name[L]}`;
  ctx.fillText(L === 'en' ? top.toUpperCase() : top, x0, H * .8);
  const big = L === 'en' ? s.names.en : s.names[L];
  let px = 11 * u; ctx.font = FONT[L](900, px);
  while (ctx.measureText(big).width > W * .9 && px > 5 * u) { px *= .92; ctx.font = FONT[L](900, px); }
  ctx.save(); ctx.translate(x0, H * .8 + px * 1.02); ctx.transform(1, 0, -.12, 1, 0, 0);
  ctx.lineJoin = 'round'; ctx.lineWidth = px * .16; ctx.strokeStyle = '#0c0814'; ctx.strokeText(big, 0, 0);
  const gg = ctx.createLinearGradient(0, -px, 0, 0); gg.addColorStop(0, '#fff'); gg.addColorStop(1, s.text);
  ctx.fillStyle = gg; ctx.fillText(big, 0, 0); ctx.restore();
  ctx.font = `700 ${3.8 * u}px "Noto Sans TC", system-ui, sans-serif`; ctx.fillStyle = '#fff';
  ctx.fillText(`${s.titles[L]}　${L === 'en' ? '' : s.names.en}`, x0, H * .8 + px * 1.02 + 5.2 * u);
  ctx.font = `600 ${3.5 * u}px "Noto Sans TC", system-ui, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.fillText(L === 'en' ? `“${s.line.en}”` : `「${s.line[L]}」`, x0, H * .8 + px * 1.02 + 10.5 * u, W - x0 - 4 * u);
  // 右上角的人格標籤小章
  const tag = s.tagNames?.[L] || s.tag;
  ctx.textAlign = 'right'; ctx.font = `900 ${4.4 * u}px "Noto Sans TC", sans-serif`;
  ctx.lineWidth = u; ctx.strokeStyle = '#0c0814'; ctx.strokeText(tag, W - 4 * u, 8 * u);
  ctx.fillStyle = s.glow; ctx.fillText(tag, W - 4 * u, 8 * u);
  ctx.restore();
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
    state.stampRect = { x0: x - w / 2 - 3 * u, x1: x + w / 2 + 3 * u, y0: y - px * 1.2, y1: y + px * .5 };
    ctx.translate(x, y); ctx.rotate(-.12 * side); ctx.scale(slam, slam);
    stampBar(-w / 2 - 2 * u, -px * .95, w + 4 * u, px * 1.25, s);
    stampText(word, 0, 0, px, s, u);
  } else {
    // 直排：一個字一格
    const chars = [...word], px = Math.min(15 * u, (H * .42) / chars.length);
    ctx.font = FONT.zh(900, px);                                  // 漢字一律用思源黑體，日文字型缺字
    const x = side > 0 ? W - 4 * u - px / 2 : 4 * u + px / 2;
    const h = chars.length * px * 1.05;
    state.stampRect = { x0: x - px * 1.6, x1: x + px * 1.6, y0: top - px * .3, y1: top + h + px * .5 };
    ctx.translate(x, top + h / 2); ctx.rotate(.06 * side); ctx.scale(slam, slam);
    stampBar(-px * .62, -h / 2 - px * .2, px * 1.24, h + px * .4, s);
    chars.forEach((c, i) => stampText(c, 0, -h / 2 + px * (i * 1.05 + .88), px, s, u));
    // 旁邊的小字：人格標籤 / タイプ
    ctx.font = `700 ${2.2 * u}px system-ui, sans-serif`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    const sub = L === 'ja' ? 'タイプ' : '財富性格';
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
const LABEL = { zh: '眷顧你的財神', ja: 'あなたの金運の神さま', en: 'YOUR GOD OF FORTUNE' };
function titleBanner(W, H, s, u, ease) {
  const L = state.lang, h = TITLE_H * u;
  ctx.save();
  ctx.globalAlpha = ease;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(10,6,18,.88)'); g.addColorStop(1, 'rgba(10,6,18,.0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, h * 1.15);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = s.glow; ctx.font = `700 ${3.2 * u}px system-ui, sans-serif`;
  const label = `${LABEL[L]} ・ ${s.titles[L]}`;
  ctx.fillText(L === 'en' ? label.toUpperCase() : label, W / 2, 4.6 * u);
  const big = L === 'en' ? s.names.en : `${s.names[L]}  ${s.names.en}`;
  let px = 8 * u; ctx.font = FONT[L](900, px);
  while (ctx.measureText(big).width > W - 8 * u && px > 3 * u) { px *= .92; ctx.font = FONT[L](900, px); }
  ctx.lineJoin = 'round'; ctx.lineWidth = px * .22; ctx.strokeStyle = '#120a1c'; ctx.strokeText(big, W / 2, 5.2 * u + px);
  ctx.fillStyle = '#fff'; ctx.fillText(big, W / 2, 5.2 * u + px);
  ctx.globalCompositeOperation = 'source-atop';
  const gg = ctx.createLinearGradient(0, 5 * u, 0, 5.2 * u + px); gg.addColorStop(0, '#fff'); gg.addColorStop(1, s.text);
  ctx.fillStyle = gg; ctx.fillText(big, W / 2, 5.2 * u + px);
  ctx.restore();
}
function wrapLines(text, maxW, L) {
  const parts = L === 'en' ? text.split(' ') : [...text];
  const lines = []; let cur = '';
  for (const p of parts) {
    const next = cur ? cur + (L === 'en' ? ' ' : '') + p : p;
    // 標點不放在行首（避免「。」自己掉到下一行）
    const punct = L !== 'en' && /^[，。！？、；：」』）…,.!?]/.test(p);
    if (ctx.measureText(next).width > maxW && cur && !punct) { lines.push(cur); cur = p; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}
function speech(W, H, s, u, t, ease) {
  const L = state.lang, hd = state.standHead, text = s.line[L];
  // 開場 1 秒後浮現，之後一直留著；每次擺 pose 時跳一下
  const show = Math.min(1, Math.max(0, ((performance.now() - state.summonAt) / 1000 - 1) * 2));
  if (show <= 0) return;
  const px = 4.6 * u; ctx.save(); ctx.font = FONT[L](700, px);
  const maxW = Math.min(W * .66, 62 * u), lines = wrapLines(text, maxW, L);
  const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 6 * u, bh = lines.length * px * 1.3 + 4.4 * u;
  // 放在替身頭的外側（遠離本人那一側）；放不下就放在頭的上方
  const out = hd.x >= (state.personCx ?? W / 2) ? 1 : -1;
  let bx = hd.x + out * (hd.sw * .18 + bw / 2), by = hd.y + hd.sh * .04;
  if (bx - bw / 2 < 2 * u || bx + bw / 2 > W - 2 * u) { bx = hd.x; by = hd.y - bh - 2 * u; }
  bx = Math.max(bw / 2 + 2 * u, Math.min(W - bw / 2 - 2 * u, bx));
  by = Math.max(TITLE_H * u + u, Math.min(H - bh - 26 * u, by));
  state.speechRect = { x0: bx - bw / 2, y0: by, x1: bx + bw / 2, y1: by + bh };
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
  lines.forEach((l, i) => ctx.fillText(l, 0, y0 + 2.2 * u + px * 1.3 * (i + .5)));
  ctx.restore();
}

// ── 神光：大片柔和的透明光暈＋緩緩上升的光點（取代希臘篇的星座與集中線）──
const MOTES = Array.from({ length: 22 }, (_, i) => [((i * 53) % 100) / 100, ((i * 29) % 100) / 100, .5 + ((i * 7) % 5) / 6, i * 1.3]);
function holyLight(x, y, sw, sh, t, s, u) {
  const cx = x, cy = y + sh * .32, R = Math.max(sw, sh) * .62 * (1 + Math.sin(t * .8) * .03);
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  let g = ctx.createRadialGradient(cx, cy, R * .05, cx, cy, R);
  g.addColorStop(0, s.glow + 'cc'); g.addColorStop(.35, s.glow + '66'); g.addColorStop(.7, s.tint + '22'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
  // 頭頂的圓光
  const hy = y + sh * .14, hr = sw * .26;
  g = ctx.createRadialGradient(cx, hy, hr * .5, cx, hy, hr * 1.25);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.75, s.glow + '55'); g.addColorStop(.88, '#fff8e08a'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, hy, hr * 1.25, 0, 7); ctx.fill();
  // 緩緩上升的光點
  for (const [px, py, k, ph] of MOTES) {
    const yy = cy + R * .9 - ((t * 18 * k + py * R * 2) % (R * 1.8));
    const xx = cx + (px - .5) * R * 1.6 + Math.sin(t + ph) * u;
    const a = Math.min(1, (cy + R * .9 - yy) / (R * .4)) * .8;
    const r = k * u * .7;
    g = ctx.createRadialGradient(xx, yy, 0, xx, yy, r * 3);
    g.addColorStop(0, `rgba(255,250,225,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(xx, yy, r * 3, 0, 7); ctx.fill();
  }
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

// 照片角落的六角圖小卡：名字、人格標籤、六項能力值（左下或右下）
function standCard(W, H, s, pos) {
  // 雷達圖直接浮在照片上：沒有底色塊、沒有框，只用一層看不出邊的柔光和文字陰影維持清楚
  const u = Math.min(W, H) / 100, pad = 3 * u;
  const cw = 44 * u, ch = 46 * u, x = pos === 'right' ? W - cw - pad : pad, y = H - ch - pad - 3 * u;
  state.cardRect = { x0: x, y0: y, x1: x + cw, y1: y + ch };
  const L = state.lang, tg = s.tagNames?.[L] || s.tag;
  const r = 8.4 * u, hx = x + cw / 2, hy = y + 22.5 * u;
  ctx.save();
  // 柔光：中心淡淡壓暗，往外完全消失，不會有邊
  const g = ctx.createRadialGradient(hx, hy, r * .3, hx, hy, r * 2.6);
  g.addColorStop(0, 'rgba(10,6,18,.42)'); g.addColorStop(.55, 'rgba(10,6,18,.22)'); g.addColorStop(1, 'rgba(10,6,18,0)');
  ctx.fillStyle = g; ctx.fillRect(hx - r * 2.6, hy - r * 2.6, r * 5.2, r * 5.2);
  const pts = (rr, vals) => hexPoints(hx, hy, rr, vals);
  const poly = (p) => { ctx.beginPath(); p.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); };
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 1.2 * u;
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = .22 * u;
  for (const k of [1, .66, .33]) { poly(pts(r * k, Array(6).fill(1))); ctx.stroke(); }
  ctx.beginPath(); pts(r, Array(6).fill(1)).forEach(([px, py]) => { ctx.moveTo(hx, hy); ctx.lineTo(px, py); }); ctx.stroke();
  // 能力值：神明代表色的半透明發光
  const vals = pts(r, STAT_KEYS.map(([k]) => GRADE_V[s.grade[k]] / 5));
  ctx.shadowColor = s.glow; ctx.shadowBlur = 2.2 * u;
  ctx.fillStyle = s.tint + '99'; poly(vals); ctx.fill();
  ctx.shadowBlur = .8 * u; ctx.strokeStyle = '#fff'; ctx.lineWidth = .45 * u; poly(vals); ctx.stroke();
  ctx.fillStyle = '#fff'; for (const [px, py] of vals) { ctx.beginPath(); ctx.arc(px, py, .55 * u, 0, 7); ctx.fill(); }
  // 文字：白字＋深色柔陰影
  ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = 1.1 * u;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  pts(r + 4.6 * u, Array(6).fill(1)).forEach(([px, py], i) => {
    const k = STAT_KEYS[i][0];
    ctx.font = `700 ${1.9 * u}px "Noto Sans TC", system-ui, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fillText(STAT_INFO[k].short[L], px, py - 1.4 * u);
    ctx.font = `${2.7 * u}px "Dela Gothic One", sans-serif`; ctx.fillStyle = '#fff';
    ctx.fillText(s.grade[k], px, py + 1.3 * u);
  });
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 ${2.6 * u}px "Noto Sans TC", system-ui, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.fillText(`${s.owner}｜${tg}`, hx, y + 4.4 * u, cw);
  ctx.font = L === 'en' ? `${3.6 * u}px "Dela Gothic One", sans-serif` : `900 ${3.8 * u}px "Noto Sans TC", sans-serif`;
  ctx.lineJoin = 'round'; ctx.lineWidth = .7 * u; ctx.strokeStyle = 'rgba(12,8,20,.7)';
  const nm = L === 'en' ? s.names.en : (s.names?.[L] || s.zh);
  ctx.strokeText(nm, hx, y + ch - 2.6 * u, cw); ctx.fillStyle = s.text; ctx.fillText(nm, hx, y + ch - 2.6 * u, cw);
  ctx.restore();
}

// 使用者自己的心願／想說的話：從自己頭上冒出來的對話框
function wishBubble(W, H, s, u, box) {
  const text = state.wish; if (!text) return;
  const L = state.lang, mode = /^[\x00-\x7F]*$/.test(text) ? 'en' : 'zh';
  const px = 4.3 * u, lh = px * 1.32;
  ctx.save(); ctx.font = FONT.zh(700, px);
  const lines = wrapLines(text, Math.min(W * .56, 50 * u), mode).slice(0, 3);
  const label = { zh: '我的心願', ja: '願いごと', en: 'MY WISH' }[L];
  const bw = Math.max(26 * u, ...lines.map((l) => ctx.measureText(l).width)) + 7 * u;
  const bh = lines.length * lh + 8.4 * u;
  const hx = (box.hx0 + box.hx1) / 2 * W, hy = box.y0 * H, hw = (box.hx1 - box.hx0) * W;
  const minY = TITLE_H * u + 2 * u, maxY = H - bh - 4 * u;
  // 要避開的東西：臉（最重要）、標題、人格標籤大字、神的台詞框、六角圖
  const f = state.face;
  const face = f ? { x0: (f.cx - f.w * .6) * W, x1: (f.cx + f.w * .6) * W, y0: (f.cy - f.h * .75) * H, y1: (f.cy + f.h * .6) * H }
    : { x0: hx - hw * .6, x1: hx + hw * .6, y0: hy, y1: hy + hw * 1.35 };
  const avoid = [[face, 4], [{ x0: 0, y0: 0, x1: W, y1: TITLE_H * u }, 3], [state.stampRect, 2.5], [state.speechRect, 2.5], [state.cardRect, 2]];
  const cost = (x, y) => {
    let c = 0;
    for (const [r, w] of avoid) {
      if (!r) continue;
      const ox = Math.min(x + bw / 2, r.x1) - Math.max(x - bw / 2, r.x0), oy = Math.min(y + bh, r.y1) - Math.max(y, r.y0);
      if (ox > 0 && oy > 0) c += ox * oy * w;
    }
    return c;
  };
  const fcx = (face.x0 + face.x1) / 2, fcy = (face.y0 + face.y1) / 2;
  const cands = [
    [fcx, face.y0 - bh - 3 * u],                       // 頭上
    [face.x0 - bw / 2 - 2 * u, fcy - bh / 2],          // 臉的左邊
    [face.x1 + bw / 2 + 2 * u, fcy - bh / 2],          // 臉的右邊
    [fcx, face.y1 + 3 * u],                            // 下巴下面（胸前）
    [bw / 2 + 3 * u, face.y1 + 3 * u], [W - bw / 2 - 3 * u, face.y1 + 3 * u],
    [W / 2, maxY], [bw / 2 + 3 * u, maxY], [W - bw / 2 - 3 * u, maxY],
  ];
  let bx = W / 2, by = maxY, best = Infinity;
  cands.forEach(([x, y], i) => {
    x = Math.max(bw / 2 + 2 * u, Math.min(W - bw / 2 - 2 * u, x));
    y = Math.max(minY, Math.min(maxY, y));
    const c = cost(x, y) + i * u * u;                 // 一樣好時，越前面的位置越優先
    if (c < best) { best = c; bx = x; by = y; }
  });
  const R = state.speechRect;
  const show = Math.min(1, Math.max(0, ((performance.now() - state.summonAt) / 1000 - 1.4) * 2));
  ctx.globalAlpha = show;
  const x0 = bx - bw / 2, r = 3.4 * u;
  // 想法泡泡：從對話框往頭頂排兩顆小圓
  // 指向臉最靠近對話框的那一側（不是頭頂），小圓點才不會畫在臉上
  const tx = Math.max(face.x0, Math.min(face.x1, bx)), ty = Math.max(face.y0, Math.min(face.y1, by + bh / 2));
  const ex = Math.max(x0 + r, Math.min(x0 + bw - r, tx)), ey = Math.max(by, Math.min(by + bh, ty));
  const inFace = (x, y) => x > face.x0 && x < face.x1 && y > face.y0 && y < face.y1;
  const dx = tx - ex, dy = ty - ey, dl = inFace(bx, by + bh / 2) ? 0 : Math.hypot(dx, dy);
  ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = s.text; ctx.lineWidth = .7 * u;
  if (dl > 5 * u) for (const [k, rr] of [[.35, 1.6], [.7, 1]]) { const qx = ex + dx * k, qy = ey + dy * k; if ((R && qx > R.x0 && qx < R.x1 && qy > R.y0 && qy < R.y1) || inFace(qx, qy)) continue; ctx.beginPath(); ctx.arc(ex + dx * k, ey + dy * k, rr * u, 0, 7); ctx.fill(); ctx.stroke(); }
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 2 * u;
  ctx.beginPath(); ctx.roundRect(x0, by, bw, bh, r); ctx.fill(); ctx.shadowBlur = 0; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = s.text; ctx.font = `800 ${2.5 * u}px "Noto Sans TC", system-ui, sans-serif`;
  ctx.fillText(`✦ ${label} ✦`, bx, by + 4 * u);
  ctx.fillStyle = '#2a1a10'; ctx.font = FONT.zh(700, px);
  lines.forEach((l, i) => ctx.fillText(l, bx, by + 5.2 * u + lh * (i + .78)));
  ctx.restore();
}

// 署名：放在六角圖的另一個角落
function credit(W, H, u) {
  const right = state.card !== 'right' || state.layout === 'opening';
  ctx.save();
  ctx.font = `600 ${2.3 * u}px "Noto Sans TC", system-ui, sans-serif`;
  ctx.textAlign = right ? 'right' : 'left'; ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = .8 * u;
  ctx.fillStyle = 'rgba(255,255,255,.88)';
  ctx.fillText('Presented by 小潔米株式会社', right ? W - 3 * u : 3 * u, H - 2 * u);
  ctx.restore();
}

// ── 拍照與分享 ─────────────────────────────────────────
let lastBlob = null, lastUrl = null;
$('shot').onclick = () => {
  const f = $('flash'); f.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
  state.capturing = true;                        // 先畫一格沒有站位虛線的畫面再存
  requestAnimationFrame(() => requestAnimationFrame(() => view.toBlob((blob) => {
    state.capturing = false;
    if (!blob) return;
    lastBlob = blob;
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(blob);
    $('photo').src = lastUrl; $('save').href = lastUrl;
    $('copyShare').textContent = '複製邀請文字＋網址';
    $('sheet').hidden = false;
  }, 'image/jpeg', .92)));
};
function shareText() {
  const s = state.stand, url = location.origin + location.pathname;
  return s ? `眷顧我的財神是${s.zh}！誰是眷顧你的財神？來測 → ${url}` : url;
}
$('share').onclick = async () => {
  const s = state.stand, file = new File([lastBlob], 'photo.jpg', { type: 'image/jpeg' });
  const title = s ? `眷顧我的財神：${s.zh}` : '';
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title, text: shareText() });
    else if (navigator.share) await navigator.share({ title, text: shareText() });
    else location.href = 'https://line.me/R/msg/text/?' + encodeURIComponent(shareText());
  } catch (e) { if (e.name !== 'AbortError') notice('分享沒有成功，可以改用「儲存照片」再到 LINE 傳送。'); }
};
$('shareLine').onclick = () => { location.href = 'https://line.me/R/msg/text/?' + encodeURIComponent(shareText()); };
$('copyShare').onclick = async () => {
  try { await navigator.clipboard.writeText(shareText()); $('copyShare').textContent = '已複製，貼給朋友吧！'; }
  catch { prompt('複製這段文字：', shareText()); }
};
$('close').onclick = () => { $('sheet').hidden = true; };

$('go').onclick = async () => { $('go').disabled = true; await modelReady; await startCamera(); $('go').disabled = false; };
$('flip').onclick = () => { state.facing = state.facing === 'user' ? 'environment' : 'user'; startCamera(); };
$('side').onclick = () => { state.side *= -1; };
view.onclick = () => { state.side *= -1; };
$('pick').onclick = () => $('file').click();
$('pick2').onclick = () => $('file').click();
$('file').onchange = async () => {
  const f = $('file').files[0]; if (!f) return;
  const img = new Image(); img.src = URL.createObjectURL(f); await img.decode();
  stopCamera(); await modelReady; useSource(img, false); $('file').value = '';
};

document.fonts?.load('80px "Dela Gothic One"', 'ゼウス').catch(() => {});
requestAnimationFrame(render);
