// 律動挑戰：選歌、選難度 → 站到全身入鏡 → 跟著動作卡跳 → 自動錄影 → 分數卡、排行榜
//   全身定位用 MediaPipe（放在自己的網站上），影像只在手機上分析
import { FilesetResolver, PoseLandmarker } from '../lib/vision_bundle.mjs';
import { MOVES, POOLS, DIFF, figure, blend, frameOf, match, makeChart, grade, windowOf, scoreOf, STAR_AT, starsOf, fakeLandmarks } from './core.js';
import { THEME } from './theme.js';

const $ = (id) => document.getElementById(id);
const M = THEME.music, T = THEME;
const qs = new URLSearchParams(location.search);
const BOT = qs.has('bot') ? Math.min(1, +qs.get('bot') || .9) : 0;          // 測試用：假人自動跳
const nameOf = (id) => ({ ...MOVES[id], ...(T.names[id] || {}) });
const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
const DEVICE = store.get('beatId', '') || (() => { const id = Math.random().toString(36).slice(2, 12); store.set('beatId', id); return id; })();

// ── 畫面切換 ──
function show(id) { for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id; }
const pick = { song: store.get('beatSong', Object.keys(T.songs)[0]), diff: store.get('beatDiff', 'normal') };
if (!T.songs[pick.song]) pick.song = Object.keys(T.songs)[0];
function chips(el, items, key, onPick) {
  el.innerHTML = '';
  for (const [id, label, sub] of items) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.id = id;
    b.innerHTML = `<b>${label}</b>${sub ? `<small>${sub}</small>` : ''}`;
    b.setAttribute('aria-pressed', String(pick[key] === id));
    b.onclick = () => { pick[key] = id; store.set(key === 'song' ? 'beatSong' : 'beatDiff', id); for (const x of el.children) x.setAttribute('aria-pressed', String(x === b)); onPick?.(); };
    el.append(b);
  }
}
const SONG_ITEMS = Object.entries(T.songs).map(([id, s]) => [id, s.zh, `${s.vibe}・${Math.round(s.bars * 4 * 60 / s.bpm)} 秒`]);
const DIFF_SUB = { easy: '只動手・慢', normal: '加上蹲下', hard: '全身・快' };
const DIFF_ITEMS = Object.entries(DIFF).map(([id, d]) => [id, d.zh, DIFF_SUB[id]]);
chips($('songs'), SONG_ITEMS, 'song');
chips($('diffs'), DIFF_ITEMS, 'diff');

// ── 模型與相機 ──
const video = $('video'), view = $('view'), ctx = view.getContext('2d');
const S = { pose: null, stream: null, crop: null, lm: null, f: null, phase: 'off', raf: 0 };
let modelP = null;
function loadModel() {
  if (modelP) return modelP;
  modelP = (async () => {
    const fs = await FilesetResolver.forVisionTasks(new URL((T.assets || '') + 'lib/wasm', location.href).href);
    const opts = (delegate) => ({ baseOptions: { modelAssetPath: new URL((T.assets || '') + 'models/pose_landmarker_lite.task', location.href).href, delegate }, runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: .5, minTrackingConfidence: .5 });
    try { S.pose = await PoseLandmarker.createFromOptions(fs, opts('GPU')); }
    catch { S.pose = await PoseLandmarker.createFromOptions(fs, opts('CPU')); }
  })();
  modelP.catch(() => { modelP = null; });
  return modelP;
}
async function startCamera() {
  if (BOT) { S.vw = 720; S.vh = 1280; return true; }
  if (!navigator.mediaDevices?.getUserMedia) { msg('這個瀏覽器不能開相機，請改用 Safari 或 Chrome 打開。'); return false; }
  try {
    S.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } });
  } catch (e) {
    msg(e.name === 'NotAllowedError' ? '相機權限被拒絕了。請到瀏覽器設定允許這個網站使用相機，再重新整理。' : '打不開相機（' + e.name + '）。');
    return false;
  }
  video.srcObject = S.stream; await video.play();
  S.vw = video.videoWidth; S.vh = video.videoHeight;
  return true;
}
function stopCamera() { S.stream?.getTracks().forEach((t) => t.stop()); S.stream = null; }
function layout() {
  const r = view.parentElement.getBoundingClientRect(), aspect = r.width > 50 ? r.height / r.width : 16 / 9;
  const W = 720, H = Math.round(Math.min(2.2, Math.max(1.3, aspect)) * W);
  view.width = W; view.height = H;
  let cw = S.vw, ch = S.vw * H / W; if (ch > S.vh) { ch = S.vh; cw = S.vh * W / H; }
  S.crop = { sx: (S.vw - cw) / 2, sy: (S.vh - ch) / 2, sw: cw, sh: ch, k: W / cw };
}
function msg(t) { $('msg').textContent = t || ''; $('msg').hidden = !t; }

// ── 遊戲 ──
const G = {};
async function enterPlay() {
  M.unlock();
  show('sPlay'); msg(''); $('ready').hidden = false; $('readyText').textContent = '載入中…';
  try { if (!BOT) await loadModel(); } catch (e) { console.warn(e); msg('動作辨識載入失敗，請重新整理再試一次。'); return; }
  if (!(await startCamera())) return;
  layout();
  S.phase = 'ready'; S.readySince = 0;
  $('readyText').textContent = DIFF[pick.diff] && pick.diff === 'easy' ? '退後幾步，讓上半身到膝蓋都進畫面' : '手機直立放好，退後幾步，讓頭到腳都進畫面';
  cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(loop);
}
function begin() {
  if (S.phase !== 'ready') return;
  $('ready').hidden = true;
  const song = T.songs[pick.song], beat = 60 / song.bpm, d = DIFF[pick.diff];
  const notes = makeChart(song.bars, pick.diff, POOLS[pick.diff], beat, Math.random, song.step || 1);
  Object.assign(G, { song, songId: pick.song, diffId: pick.diff, d, beat, notes, sumV: 0, combo: 0, best: 0, n: { perfect: 0, great: 0, good: 0, miss: 0 },
    pops: [], flash: 0, end: song.bars * 4 * beat, goSaid: false, done: false, finishAt: 0, rec: null });
  G.t0 = M.play(pick.song);
  S.phase = 'play';
  startRec();
}
function quit() {
  S.phase = 'off'; cancelAnimationFrame(S.raf); M.stop(.2); stopRec(true); stopCamera(); show('sHome');
}
const now = () => M.clock() - G.t0;

function loop() {
  S.raf = requestAnimationFrame(loop);
  const W = view.width, H = view.height, u = W / 720;
  // 1. 偵測
  let lms = null;
  if (BOT) {
    const t = S.phase === 'play' ? now() : -9;
    const n = G.notes?.find((x) => Math.abs(x.t - t) < .5);
    const target = n && Math.random() < BOT + .1 ? MOVES[n.id] : (S.phase === 'ready' ? MOVES.up : { arms: null });
    lms = fakeLandmarks(target, S.vw, S.vh, (1 - BOT) * 140 + 4);
  } else if (S.pose && video.readyState >= 2) {
    try { const r = S.pose.detectForVideo(video, performance.now()); lms = r.landmarks?.[0] || null; } catch {}
  }
  const f = frameOf(lms, S.vw, S.vh); S.f = f;
  // 2. 底圖
  ctx.save(); ctx.fillStyle = T.ink; ctx.fillRect(0, 0, W, H);
  if (BOT) { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a1450'); g.addColorStop(1, '#09040f'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  else if (video.readyState >= 2) {
    const c = S.crop; ctx.translate(W, 0); ctx.scale(-1, 1);
    ctx.filter = 'contrast(1.08) saturate(1.15) brightness(1.04)'; ctx.drawImage(video, c.sx, c.sy, c.sw, c.sh, 0, 0, W, H); ctx.filter = 'none';
  }
  ctx.restore();
  const vg = ctx.createRadialGradient(W / 2, H * .45, H * .3, W / 2, H * .45, H * .8); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, T.vignette || 'rgba(10,0,25,.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  const toScr = (p) => [(p[0] - S.crop.sx) * S.crop.k, (p[1] - S.crop.sy) * S.crop.k];
  if (S.phase === 'ready') return readyStep(f, W, H, u, toScr);
  if (S.phase !== 'play') return;
  // 3. 判定
  const t = now();
  for (const n of G.notes) {
    if (n.res) continue;
    const w = windowOf(n, G.d);
    if (t >= n.t - w && t <= n.t + w && f) { const q = match(f, MOVES[n.id], G.d.tol); if (q > n.best) { n.best = q; n.bestT = t; } }
    if (t > n.t + w) judge(n, t);
  }
  if (!G.goSaid && t >= 7 * G.beat - .05) { G.goSaid = true; M.go(); }
  // 4. 畫面
  skeleton(f, toScr, u);
  if (G.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${G.flash * .25})`; ctx.fillRect(0, 0, W, H); G.flash *= .85; }
  coach(t, W, H, u);
  lane(t, W, H, u);
  hud(t, W, H, u);
  countdown(t, W, H, u);
  pops(W, H, u);
  if (t > G.end - G.beat * 2 && !G.done) { G.done = true; G.finishAt = performance.now(); M.cheer(); }
  if (G.done) finishCard(W, H, u, (performance.now() - G.finishAt) / 1000);
}
function readyStep(f, W, H, u, toScr) {
  skeleton(f, toScr, u, true);
  const legs = pick.diff !== 'easy';
  const need = ['ls', 'rs', 'lh', 'rh', ...(legs ? ['lk', 'rk', 'la', 'ra'] : ['lk', 'rk'])];
  const ok = f && need.every((k) => f.V[k] > .55) && (() => { const ys = need.map((k) => toScr(f.P[k])[1]); return Math.min(...ys) > H * .05 && Math.max(...ys) < H * .97; })();
  const t = performance.now();
  if (ok) { S.readySince ||= t; } else S.readySince = 0;
  const k = S.readySince ? Math.min(1, (t - S.readySince) / 1200) : 0;
  // 人形框
  ctx.save(); ctx.translate(W / 2, H * .22); const sc = H * .2;
  ctx.globalAlpha = .22 + .3 * k; drawFigure(ctx, figure(MOVES.up), 0, 0, sc, ok ? '#5dffb0' : '#ffffff', 6 * u, false);
  ctx.restore();
  $('readyText').textContent = ok ? (k < 1 ? '很好，保持不動…' : '開始！') : (legs ? '手機直立放好，退後幾步，讓頭到腳都進畫面，雙手舉高' : '退後幾步，讓上半身到膝蓋都進畫面，雙手舉高');
  $('readyBar').style.width = (k * 100) + '%';
  if (k >= 1) begin();
}
function judge(n) {
  const g = grade(n, G.d); n.res = g.id;
  G.n[g.id]++; G.sumV += g.v;
  if (g.id === 'miss') G.combo = 0; else { G.combo++; G.best = Math.max(G.best, G.combo); }
  if (g.id === 'perfect') G.flash = 1;
  M.hit(g.id);
  G.pops.push({ g, born: performance.now(), combo: G.combo });
}

// ── 畫圖 ──
const FL = T.font.latin, FC = T.font.cjk;
const isCJK = (s) => /[㐀-鿿]/.test(s);
function text(c, s, x, y, px, fill, opt = {}) {
  c.save(); c.globalAlpha = Math.max(0, Math.min(1, opt.a ?? 1));
  c.translate(x, y); if (opt.skew) c.transform(1, 0, -.15, 1, 0, 0); if (opt.scale) c.scale(opt.scale, opt.scale);
  c.font = isCJK(s) ? `900 ${px}px ${FC}` : `400 ${px * 1.12}px ${FL}`;
  c.textAlign = opt.align || 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  if (opt.stroke !== false) { c.lineWidth = px * .2; c.strokeStyle = opt.strokeColor || 'rgba(10,0,25,.9)'; c.strokeText(s, 0, 0); }
  if (Array.isArray(fill)) { const g = c.createLinearGradient(0, -px * .5, 0, px * .5); fill.forEach((col, i) => g.addColorStop(i / (fill.length - 1), col)); c.fillStyle = g; } else c.fillStyle = fill;
  c.fillText(s, 0, 0); c.restore();
}
function drawFigure(c, F, x, y, sc, color, lw, glow) {
  const p = (q) => [x + q[0] * sc, y + q[1] * sc];
  const bones = [['ls', 'rs'], ['ls', 'lh'], ['rs', 'rh'], ['lh', 'rh'], ['ls', 'le'], ['le', 'lw'], ['rs', 're'], ['re', 'rw'], ['lh', 'lk'], ['lk', 'la'], ['rh', 'rk'], ['rk', 'ra']];
  c.save(); c.lineCap = c.lineJoin = 'round'; c.strokeStyle = c.fillStyle = color; c.lineWidth = lw;
  if (glow) { c.shadowColor = color; c.shadowBlur = lw * 2; }
  // 身體：梯形填滿；手腳：粗線
  c.beginPath(); for (const k of ['ls', 'rs', 'rh', 'lh']) c.lineTo(...p(F[k])); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); for (const [a, b] of bones.slice(4)) { c.moveTo(...p(F[a])); c.lineTo(...p(F[b])); } c.lineWidth = lw * 1.6; c.stroke();
  c.beginPath(); c.arc(...p(F.head), F.hr * sc, 0, Math.PI * 2); c.fill();
  c.restore();
}
function skeleton(f, toScr, u, strong) {
  if (!f) return;
  const bones = [['ls', 'rs'], ['ls', 'le'], ['le', 'lw'], ['rs', 're'], ['re', 'rw'], ['ls', 'lh'], ['rs', 'rh'], ['lh', 'rh'], ['lh', 'lk'], ['lk', 'la'], ['rh', 'rk'], ['rk', 'ra']];
  ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = (strong ? 7 : 5) * u;
  ctx.strokeStyle = strong ? 'rgba(93,255,176,.85)' : (T.skel || 'rgba(47,243,255,.55)'); ctx.shadowColor = T.skelGlow || '#2ff3ff'; ctx.shadowBlur = 12 * u;
  ctx.beginPath();
  for (const [a, b] of bones) if (f.V[a] > .5 && f.V[b] > .5) { ctx.moveTo(...toScr(f.P[a])); ctx.lineTo(...toScr(f.P[b])); }
  ctx.stroke(); ctx.restore();
}
// 教練：右上角的小人，跟著拍子跳到下一個動作
function coach(t, W, H, u) {
  const ns = G.notes, i = ns.findIndex((n) => n.t > t - .05), next = ns[i], prev = ns[i - 1];
  if (!next) return;
  const from = prev ? MOVES[prev.id] : { arms: null }, to = MOVES[next.id];
  const t0 = prev ? prev.t + .08 : next.t - 1, t1 = next.t - Math.min(.25, (next.t - t0) * .35);
  const k = Math.max(0, Math.min(1, (t - t0) / Math.max(.05, t1 - t0))), e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
  const pose = blend(from, to, e);
  const bob = Math.abs(Math.sin(Math.PI * t / G.beat)) * 6 * u;
  const bw = 210 * u, bh = 300 * u, bx = W - bw - 16 * u, by = 120 * u;
  ctx.save();
  ctx.fillStyle = 'rgba(12,4,30,.55)'; roundRect(ctx, bx, by, bw, bh, 22 * u); ctx.fill();
  ctx.strokeStyle = G.song.color; ctx.lineWidth = 2 * u; ctx.stroke();
  drawFigure(ctx, figure(pose), bx + bw / 2, by + 88 * u + bob, 62 * u, T.figure, 7 * u, true);
  const nm = nameOf(next.id);
  text(ctx, nm.zh, bx + bw / 2, by + bh - 34 * u, 30 * u, '#fff', { stroke: false });
  text(ctx, 'NEXT', bx + 20 * u, by + 22 * u, 18 * u, G.song.color, { align: 'left', stroke: false });
  ctx.restore();
}
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
// 動作卡跑道：從右邊跑到左邊的判定圈
function lane(t, W, H, u) {
  const cy = H - 190 * u, hx = 110 * u, size = 150 * u, span = W - hx + size;
  ctx.save();
  const g = ctx.createLinearGradient(0, cy - 100 * u, 0, cy + 100 * u); g.addColorStop(0, 'rgba(12,4,30,0)'); g.addColorStop(.5, 'rgba(12,4,30,.6)'); g.addColorStop(1, 'rgba(12,4,30,0)');
  ctx.fillStyle = g; ctx.fillRect(0, cy - 100 * u, W, 200 * u);
  // 拍子線
  const b0 = Math.ceil(t / G.beat);
  for (let b = b0; b < b0 + 12; b++) {
    const x = hx + (b * G.beat - t) / G.d.ahead * span; if (x > W) break;
    ctx.fillStyle = b % 4 === 0 ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.14)'; ctx.fillRect(x - 1.5 * u, cy - 60 * u, 3 * u, 120 * u);
  }
  // 判定圈（隨拍子呼吸）
  const pulse = 1 - ((t / G.beat) % 1);
  ctx.lineWidth = 6 * u; ctx.strokeStyle = G.song.color; ctx.shadowColor = G.song.color; ctx.shadowBlur = 20 * u * pulse;
  ctx.beginPath(); ctx.arc(hx, cy, size * .58 + pulse * 6 * u, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
  for (let i = G.notes.length - 1; i >= 0; i--) {
    const n = G.notes[i], dt = n.t - t;
    if (dt > G.d.ahead + .3 || dt < -1.2) continue;
    let x = hx + dt / G.d.ahead * span, y = cy, a = 1, s = 1;
    if (n.res) {
      const k = Math.min(1, (t - n.t) / .6);
      if (n.res === 'miss') { x = hx; y = cy + k * 120 * u; a = 1 - k; } else { x = hx; s = 1 + k * .5; a = 1 - k; }
    } else if (dt < 0) x = hx;
    card(n, x, y, size * s, a, u, !n.res && Math.abs(dt) < windowOf(n, G.d));
  }
  ctx.restore();
}
function card(n, x, y, size, a, u, live) {
  const [c1, c2] = T.card(n.id), h = size * 1.08;
  ctx.save(); ctx.globalAlpha = a;
  const g = ctx.createLinearGradient(x, y - h / 2, x, y + h / 2); g.addColorStop(0, c1); g.addColorStop(1, c2);
  roundRect(ctx, x - size / 2, y - h / 2, size, h, 20 * u); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = (live ? 6 : 3) * u; ctx.strokeStyle = live ? '#fff' : 'rgba(255,255,255,.6)'; ctx.stroke();
  if (n.res && n.res !== 'miss') { ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fill(); }
  const sc = size * .2;
  drawFigure(ctx, figure(MOVES[n.id]), x, y - h * .14, sc, '#fff', 4.5 * u * size / (150 * u), false);
  text(ctx, nameOf(n.id).zh, x, y + h * .36, size * .15, '#fff', { stroke: false });
  ctx.restore();
}
function hud(t, W, H, u) {
  const score = scoreOf(G.sumV, G.best, G.notes.length);
  // 星星進度條
  const bx = 24 * u, by = 40 * u, bw = W - 48 * u, bh = 14 * u, k = Math.min(1, score / 10000);
  ctx.save();
  roundRect(ctx, bx, by, bw, bh, bh / 2); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fill();
  const g = ctx.createLinearGradient(bx, 0, bx + bw, 0); (T.bar || ['#7b2ff7', '#f107a3', '#ffcf2e']).forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
  if (k > 0) { roundRect(ctx, bx, by, Math.max(bh, bw * k), bh, bh / 2); ctx.fillStyle = g; ctx.fill(); }
  STAR_AT.forEach((s, i) => star(bx + bw * s / 10000, by + bh / 2, 16 * u, score >= s));
  ctx.restore();
  text(ctx, String(score).padStart(5, '0'), W - 24 * u, 92 * u, 46 * u, ['#ffffff', '#ffe36b'], { align: 'right' });
  text(ctx, `${G.song.zh}・${G.d.zh}`, 24 * u, 90 * u, 26 * u, '#fff', { align: 'left' });
  if (G.combo >= 3) text(ctx, `${G.combo} COMBO`, 24 * u, 132 * u, 34 * u, ['#ffffff', G.song.color], { align: 'left', skew: true });
  const p = Math.max(0, Math.min(1, t / G.end));
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(0, H - 6 * u, W * p, 6 * u);
}
function star(x, y, r, on) {
  ctx.save(); ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fillStyle = on ? '#ffd23a' : 'rgba(30,20,50,.9)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = on ? '#fff6c2' : 'rgba(255,255,255,.5)'; ctx.stroke(); ctx.restore();
}
function countdown(t, W, H, u) {
  const b = t / G.beat;
  if (b < 0 || b >= 9) return;
  const lab = b < 4 ? (b < 1 ? T.title : '') : ['3', '2', '1', 'GO!'][Math.floor(b - 4)] || '';
  if (b >= 8) { const k = b - 8; text(ctx, 'GO!', W / 2, H * .42, 170 * u, ['#ffffff', '#ffe36b', '#ff7a00'], { scale: 1 + k * .6, a: 1 - k, skew: true }); return; }
  if (!lab) { text(ctx, '準備好了嗎？', W / 2, H * .42, 64 * u, '#fff', { a: 1 }); return; }
  const k = b % 1;
  text(ctx, lab, W / 2, H * .42, (lab.length > 2 ? 72 : 190) * u, ['#ffffff', G.song.color], { scale: 1.4 - Math.min(.4, k * 1.6), a: 1 - Math.max(0, k - .7) / .3, skew: true });
}
function pops(W, H, u) {
  const nowMs = performance.now();
  G.pops = G.pops.filter((p) => nowMs - p.born < 700);
  const p = G.pops[G.pops.length - 1]; if (!p) return;
  const k = (nowMs - p.born) / 700, sc = k < .15 ? .6 + k / .15 * .6 : 1.2 - Math.min(.2, (k - .15));
  text(ctx, p.g.en, W / 2, H * .3, 96 * u, T.grade[p.g.id], { scale: sc, a: 1 - Math.max(0, k - .6) / .4, skew: true });
}
// 結束：分數卡（也會錄進影片裡）
function finishCard(W, H, u, s) {
  const score = scoreOf(G.sumV, G.best, G.notes.length), st = starsOf(score);
  const a = Math.min(1, s / .5);
  ctx.save(); ctx.fillStyle = `rgba(8,2,22,${.78 * a})`; ctx.fillRect(0, 0, W, H); ctx.restore();
  text(ctx, 'FINISH!', W / 2, H * .2, 120 * u, ['#ffffff', '#ffe36b', '#ff7a00'], { a, skew: true, scale: 1.3 - .3 * Math.min(1, s / .4) });
  if (s > .6) {
    const sc = Math.min(1, (s - .6) / .8), shown = Math.round(score * sc);
    text(ctx, String(shown), W / 2, H * .38, 150 * u, ['#ffffff', G.song.color], { skew: true });
    for (let i = 0; i < 5; i++) { ctx.save(); const on = i < st && s > 1 + i * .15; star(W / 2 + (i - 2) * 86 * u, H * .5, (on ? 36 : 30) * u, on); ctx.restore(); }
    if (s > 1.9) text(ctx, T.ranks[st], W / 2, H * .59, 64 * u, ['#ffffff', '#ffe36b'], { scale: 1 + .2 * Math.max(0, 1 - (s - 1.9) * 4) });
    if (s > 2.2) {
      const rows = [['PERFECT', G.n.perfect], ['GREAT', G.n.great], ['GOOD', G.n.good], ['MISS', G.n.miss]];
      rows.forEach(([k, v], i) => text(ctx, `${k}  ${v}`, W / 2 + (i % 2 ? 150 : -150) * u, H * .67 + Math.floor(i / 2) * 54 * u, 36 * u, T.grade[k.toLowerCase()], {}));
      text(ctx, `MAX COMBO  ${G.best}`, W / 2, H * .67 + 116 * u, 36 * u, '#fff');
      text(ctx, `${G.song.zh}・${G.d.zh}`, W / 2, H * .82, 32 * u, 'rgba(255,255,255,.85)', { stroke: false });
      text(ctx, T.site.replace('https://', ''), W / 2, H * .87, 26 * u, 'rgba(255,255,255,.65)', { stroke: false });
    }
  }
  if (s > 4.2 && S.phase === 'play') { S.phase = 'end'; M.stop(1); stopRec(); }
}

// ── 錄影 ──
let lastBlob = null, lastUrl = null, lastName = 'dance.mp4', lastType = 'video/mp4';
function pickMime() { for (const m of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']) if (window.MediaRecorder?.isTypeSupported?.(m)) return m; return ''; }
function startRec() {
  if (!view.captureStream || !window.MediaRecorder || store.get('beatRec', '1') === '0') return;
  const mime = pickMime(), stream = view.captureStream(30), chunks = [];
  try { const at = M.audioTrack(); if (at) stream.addTrack(at); } catch {}
  let mr; try { mr = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4e6 } : undefined); } catch { return; }
  const rec = { mr };
  mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  mr.onstop = () => {
    stream.getVideoTracks().forEach((t) => t.stop());
    if (rec.discard) return;
    const type = (mr.mimeType || mime || 'video/webm').split(';')[0];
    lastBlob = new Blob(chunks, { type }); lastType = type; lastName = (T.game) + (type.includes('mp4') ? '.mp4' : '.webm');
    if (lastUrl) URL.revokeObjectURL(lastUrl); lastUrl = URL.createObjectURL(lastBlob);
    showResult();
  };
  mr.start(500); G.rec = rec;
}
function stopRec(discard) {
  const r = G.rec; if (!r) { if (!discard && S.phase === 'end') showResult(); return; }
  r.discard = !!discard; try { r.mr.stop(); } catch {} if (discard) G.rec = null;
}

// ── 結果、排行榜 ──
function result() {
  const score = scoreOf(G.sumV, G.best, G.notes.length), st = starsOf(score);
  return { score, stars: st, rank: T.ranks[st], song: G.song.zh, diff: G.d.zh, songId: G.songId, diffId: G.diffId };
}
function showResult() {
  stopCamera(); cancelAnimationFrame(S.raf);
  const r = result();
  $('rScore').textContent = r.score; $('rRank').textContent = r.rank; $('rStars').textContent = '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars);
  $('rMeta').textContent = `${r.song}・${r.diff}難度　PERFECT ${G.n.perfect}／GREAT ${G.n.great}／GOOD ${G.n.good}／MISS ${G.n.miss}　最高連擊 ${G.best}`;
  const v = $('clip');
  if (lastBlob && G.rec) { v.hidden = false; v.src = lastUrl; v.play().catch(() => {}); $('saveVid').hidden = false; $('shareVid').hidden = false; }
  else { v.hidden = true; $('saveVid').hidden = true; $('shareVid').hidden = true; }
  G.rec = null;
  $('nick').value = store.get('beatNick', '');
  $('submit').disabled = false; $('submit').textContent = '上傳成績到排行榜'; $('submitMsg').textContent = '';
  boardFor($('rBoard'), r.songId, r.diffId, 'day');
  show('sResult');
}
const boardKey = (song, diff) => `${T.game}:${song}:${diff}`;
async function boardFor(el, song, diff, period, mine) {
  el.innerHTML = '<p class="fine">讀取排行榜中…</p>';
  try {
    const res = await fetch(`${T.board}/api/scores?board=${encodeURIComponent(boardKey(song, diff))}&period=${period}`);
    if (!res.ok) throw new Error(res.status);
    const { list } = await res.json();
    if (!list.length) { el.innerHTML = '<p class="fine">還沒有人上榜，第一名就是你！</p>'; return; }
    el.innerHTML = '<ol class="rank">' + list.slice(0, 50).map((x, i) => `<li${x.id === DEVICE ? ' class="me"' : ''}><span>${i + 1}</span><b>${esc(x.n)}</b><em>${x.s}</em></li>`).join('') + '</ol>';
  } catch { el.innerHTML = '<p class="fine">排行榜暫時連不上，等一下再試試。</p>'; }
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
$('submit').onclick = async () => {
  const name = $('nick').value.trim().slice(0, 12);
  if (!name) { $('submitMsg').textContent = '先取個暱稱吧！'; $('nick').focus(); return; }
  store.set('beatNick', name);
  const r = result(); $('submit').disabled = true; $('submitMsg').textContent = '上傳中…';
  try {
    const res = await fetch(`${T.board}/api/scores`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ board: boardKey(r.songId, r.diffId), name, score: r.score, id: DEVICE, notes: G.notes.length }) });
    const j = await res.json(); if (!res.ok) throw new Error(j.error || res.status);
    $('submit').textContent = '已上傳 ✓';
    $('submitMsg').textContent = j.rank?.day ? `今日第 ${j.rank.day} 名、本週第 ${j.rank.week} 名！` : '已上傳（這次沒有打破你自己的紀錄）';
    boardFor($('rBoard'), r.songId, r.diffId, 'day');
    for (const b of document.querySelectorAll('#rTabs button')) b.setAttribute('aria-pressed', String(b.dataset.p === 'day'));
  } catch (e) { $('submit').disabled = false; $('submitMsg').textContent = '上傳沒有成功，等一下再試一次。'; }
};
function tabs(el, onPick) {
  for (const b of el.querySelectorAll('button')) b.onclick = () => { for (const x of el.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b)); onPick(b.dataset.p); };
}
tabs($('rTabs'), (p) => boardFor($('rBoard'), G.songId, G.diffId, p));
// 首頁的排行榜
const BP = { song: pick.song, diff: pick.diff, period: 'day' };
function boardScreen() {
  chipsSimple($('bSongs'), SONG_ITEMS, 'song'); chipsSimple($('bDiffs'), DIFF_ITEMS, 'diff');
  boardFor($('bList'), BP.song, BP.diff, BP.period); show('sBoard');
}
function chipsSimple(el, items, key) {
  el.innerHTML = '';
  for (const [id, label] of items) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip small'; b.textContent = label; b.setAttribute('aria-pressed', String(BP[key] === id));
    b.onclick = () => { BP[key] = id; for (const x of el.children) x.setAttribute('aria-pressed', String(x === b)); boardFor($('bList'), BP.song, BP.diff, BP.period); };
    el.append(b);
  }
}
tabs($('bTabs'), (p) => { BP.period = p; boardFor($('bList'), BP.song, BP.diff, p); });

// ── 分享 ──
function shareText() { const r = result(); return `${T.share(r)} ${T.site}`; }
async function shareFile(e) {
  if (!lastBlob) return;
  const file = new File([lastBlob], lastName, { type: lastType });
  if (navigator.canShare?.({ files: [file] })) {
    e?.preventDefault();
    try { await navigator.share({ files: [file], text: shareText() }); }
    catch (err) { if (err.name !== 'AbortError') $('submitMsg').textContent = '沒有成功，可以長按影片另存。'; }
    return true;
  }
}
$('saveVid').onclick = async (e) => { if (await shareFile(e)) return; const a = document.createElement('a'); a.href = lastUrl; a.download = lastName; a.click(); };
$('shareVid').onclick = async (e) => { if (await shareFile(e)) return; location.href = 'https://line.me/R/msg/text/?' + encodeURIComponent(shareText()); };
$('shareText').onclick = async () => { try { await navigator.clipboard.writeText(shareText()); $('shareText').textContent = '已複製 ✓'; } catch { prompt('複製這段文字：', shareText()); } };

// ── 按鈕 ──
$('go').onclick = () => enterPlay();
$('again').onclick = () => enterPlay();
$('home').onclick = () => show('sHome');
$('boardBtn').onclick = () => { BP.song = pick.song; BP.diff = pick.diff; boardScreen(); };
$('boardBack').onclick = () => show('sHome');
$('quit').onclick = () => quit();
$('skipReady').onclick = () => begin();
const muteBtn = $('mute');
const syncMute = () => { muteBtn.textContent = M.isMuted() ? '🔇' : '🔊'; };
muteBtn.onclick = () => { M.setMuted(!M.isMuted()); syncMute(); }; syncMute();
document.addEventListener('visibilitychange', () => { if (document.hidden && (S.phase === 'play' || S.phase === 'ready')) quit(); });
if ('serviceWorker' in navigator && !BOT) navigator.serviceWorker.register('../sw.js').catch(() => {});
// 先在背景載入模型（按下開始時就不用等）
setTimeout(() => { if (!BOT) loadModel().catch(() => {}); }, 800);
window.__beat = { G, S, MOVES };
