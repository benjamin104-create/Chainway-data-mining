// 武功招式 AR：用手部 21 個定位點判斷手勢，比對了就從手上發出那一招的氣芒（拍下來的照片、影片也會有）
//   張開手掌 → 降龍十八掌的金龍、黯然銷魂掌的氣浪、乾坤大挪移的太極、生死符的冰晶、左右互搏的一圓一方
//   劍指     → 獨孤九劍的九道劍光、玉女素心劍的白色劍芒
//   食指     → 六脈神劍的劍氣
//   蘭花指   → 蘭花拂穴手的花瓣、繡花針
//   比讚     → 神行百變的金幣
// 不是本命招式的手勢，也會冒出英雄代表色的「氣芒」。全部在手機上算，畫面不會上傳。

const S = {
  hands: [], frame: 0, ts: 0, lastT: 0,
  k: 0,                 // 本命招式的集氣 0~1
  qi: 0,                // 其他手勢的氣芒 0~1
  hold: 0, fired: false,
  hand: null, qiHand: null,
  banner: null,         // { t0, move }
  parts: [],            // 粒子（金幣、霧、花瓣…）
  hintAt: 0, used: false,
};

export async function initHands(fs, HandLandmarker) {
  const opts = (d) => ({ baseOptions: { modelAssetPath: new URL('models/hand_landmarker.task', location.href).href, delegate: d },
    runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .5, minHandPresenceConfidence: .5, minTrackingConfidence: .5 });
  try { S.det = await HandLandmarker.createFromOptions(fs, opts('GPU')); }
  catch { try { S.det = await HandLandmarker.createFromOptions(fs, opts('CPU')); } catch (e) { console.warn('hand landmarker failed', e); } }
}

export function detectHands(src, now) {
  if (window.__fakeHands) { S.hands = window.__fakeHands; return; }   // 測試用
  if (!S.det || S.frame++ % 2) return;                 // 隔一格算一次，省電
  try {
    S.ts = Math.max(now, S.ts + 1);
    const r = S.det.detectForVideo(src, S.ts);
    S.hands = (r.landmarks || []).map((lm) => lm);
  } catch (e) { console.warn(e); }
}
// 練一招：畫面上出現手勢的虛線剪影和集氣圈，教使用者怎麼比
export function setGuide(move, onDone) { S.guide = move; S.guideOk = null; S.onGuideDone = onDone; }
// 目前要練的招式（預設是本命英雄的招式；也可以換別位英雄的招式）
export function setMove(move) { S.move = move; S.k = 0; S.fired = false; }
export function resetPoses() { S.hands = []; S.k = 0; S.qi = 0; S.banner = null; S.parts = []; }
export const poseState = S;
// 招式成功時通知外面（英雄發功、自動拍照）：fn(kind, [x, y]) 打中的位置
export function setOnTrigger(fn) { S.onTrigger = fn; }
export { palmCenter, openPalm };
const fireTrig = (kind, at) => { try { S.onTrigger?.(kind, at); } catch (e) { console.warn(e); } };

export const HOWTO = {
  palm: '手掌用力張開、五指撐開，舉到臉旁',
  sword: '食指、中指併攏伸直（劍指），舉到臉旁',
  point: '只伸出食指，指向前方',
  pinch: '拇指和食指捏住，其他三指張開（蘭花指）',
  thumb: '握拳、大拇指朝上，比一個讚',
};

const P = (L, i, W, H) => [L[i].x * W, L[i].y * H];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lerp = (a, b, k) => a + (b - a) * k;
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const norm = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ── 手勢 ──
function openPalm(h, W, H) {
  const w = P(h, 0, W, H);
  let n = 0;
  for (const [tip, pip] of [[8, 6], [12, 10], [16, 14], [20, 18]]) if (dist(P(h, tip, W, H), w) > dist(P(h, pip, W, H), w) * 1.15) n++;
  return n >= 4;
}
function palmCenter(h, W, H) {
  let x = 0, y = 0;
  for (const i of [0, 5, 9, 13, 17]) { x += h[i].x; y += h[i].y; }
  return [x / 5 * W, y / 5 * H];
}
function gestureOf(h, W, H) {
  const w = P(h, 0, W, H), pw = dist(P(h, 5, W, H), P(h, 17, W, H)) || 1;
  const ext = (tip, pip) => dist(P(h, tip, W, H), w) > dist(P(h, pip, W, H), w) * 1.12;
  const i = ext(8, 6), m = ext(12, 10), r = ext(16, 14), p = ext(20, 18);
  if (dist(P(h, 4, W, H), P(h, 8, W, H)) < pw * .4 && m && r) return 'pinch';
  if (!i && !m && !r && !p) {
    const t4 = P(h, 4, W, H), t2 = P(h, 2, W, H);
    if (t2[1] - t4[1] > pw * .55) return 'thumb';
    return null;
  }
  if (i && !m && !r && !p) return 'point';
  if (i && m && !r && !p && dist(P(h, 8, W, H), P(h, 12, W, H)) < pw * .6) return 'sword';
  if (i && m && r && p) {
    const sp = (dist(P(h, 8, W, H), P(h, 20, W, H)) + dist(P(h, 4, W, H), P(h, 8, W, H)) * .6) / pw;
    if (sp > 1.25) return 'palm';
  }
  return null;
}

// ── 每位英雄的氣芒顏色：火心（白）→ 主色 → 外圍 ──
const PAL = {
  guojing: [[255, 252, 230], [255, 214, 90], [230, 140, 30]],
  xiaofeng: [[255, 245, 225], [255, 140, 60], [190, 40, 30]],
  yangguo: [[245, 248, 255], [170, 190, 240], [80, 90, 150]],
  xiaolongnu: [[255, 255, 255], [225, 238, 255], [150, 180, 230]],
  linghu: [[245, 252, 255], [140, 200, 255], [50, 110, 220]],
  wuji: [[255, 240, 230], [255, 90, 60], [150, 20, 30]],
  xuzhu: [[250, 255, 255], [170, 230, 255], [70, 150, 230]],
  duanyu: [[245, 255, 248], [140, 240, 180], [40, 170, 120]],
  botong: [[255, 255, 235], [255, 230, 110], [220, 160, 40]],
  huangrong: [[255, 255, 235], [210, 240, 120], [110, 180, 60]],
  dongfang: [[255, 240, 245], [255, 90, 120], [170, 10, 50]],
  xiaobao: [[255, 252, 220], [255, 210, 70], [210, 140, 20]],
};
const spriteCache = {};
function sprite(c) {
  const key = c.join(',');
  if (spriteCache[key]) return spriteCache[key];
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, rgba(c, 1)); g.addColorStop(.35, rgba(c, .5)); g.addColorStop(1, rgba(c, 0));
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return (spriteCache[key] = cv);
}
function dot(ctx, x, y, r, c, a) { if (a <= 0 || r <= 0) return; ctx.globalAlpha = Math.min(1, a); ctx.drawImage(sprite(c), x - r, y - r, r * 2, r * 2); }

// ── 每一格：判斷手勢、集氣、畫招式 ──
export function drawPoseFX(ctx, W, H, u, t, lm, stand, capturing) {
  const dt = Math.min(.1, Math.max(0, t - (S.lastT || t))); S.lastT = t;
  const move = S.move || stand?.move; if (!move) return;
  const id = move.hero || stand?.id;
  const pal = PAL[id] || [[255, 255, 255], hex(stand?.glow || '#ffe08a'), hex(stand?.text || '#ffb84d')];
  let face = null;
  if (lm) {
    const xs = lm.map((p) => p.x * W), ys = lm.map((p) => p.y * H);
    face = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    face.cx = (face.x0 + face.x1) / 2; face.cy = (face.y0 + face.y1) / 2; face.w = face.x1 - face.x0; face.h = face.y1 - face.y0;
  }

  // 找手：比對了本命手勢的手優先，其次是任何一個認得的手勢（只冒氣芒）
  let hit = null, other = null;
  for (const h of S.hands) {
    const g = gestureOf(h, W, H); if (!g) continue;
    if (g === move.gesture) { hit = h; break; }
    other = other || h;
  }
  S.gesture = hit ? move.gesture : other ? gestureOf(other, W, H) : null;
  if (hit) S.hand = hit;
  if (other) S.qiHand = other;
  S.k = lerp(S.k, hit ? 1 : 0, hit ? .12 : .07);
  S.qi = lerp(S.qi, other && !hit ? 1 : 0, other && !hit ? .15 : .08);
  S.hold = hit ? S.hold + dt : 0;
  if (hit || other) S.used = true;

  ctx.save();
  if (S.qi > .02 && S.qiHand) drawQi(ctx, S.qiHand, W, H, u, t, S.qi, pal, dt);
  if (S.k > .02 && S.hand) {
    const fn = FX[move.fx] || drawQi;
    fn(ctx, S.hand, W, H, u, t, S.k, pal, dt);
  }
  ctx.restore();
  drawParts(ctx, dt);

  // 集氣滿了：招式成功 → 大字＋集中線，通知外面（英雄發功、自動拍照）
  if (S.k > .8 && S.hold > .45 && !S.fired) {
    S.fired = true; S.banner = { t0: t, move, pal };
    if (S.guide && !S.guideOk) S.guideOk = { t };
    const h = S.hand; fireTrig(move.fx, h ? palmCenter(h, W, H) : [W / 2, H / 2]);
  }
  if (S.k < .2) S.fired = false;
  // 招式大字改成按下快門時才寫出來（拍攝畫面只有英雄＋自己）

  if (S.guide && !capturing) drawGuide(ctx, W, H, u, t, face);
  // 還沒試過招式的人，隔一陣子提示一下（只在預覽，拍下來不會有）
  if (!capturing && !S.used && !S.guide && S.hands.length === 0) {
    if (!S.hintAt) S.hintAt = t + 4;
    if (t > S.hintAt) {
      const k = (t - S.hintAt) / 3.4;
      if (k > 1) S.hintAt = t + 6;
      else {
        const msg = `試試看：${HOWTO[move.gesture]} →「${move.name}」`;
        ctx.save(); ctx.globalAlpha = Math.sin(k * Math.PI);
        pill(ctx, W, u, H * .7, msg, '#fff', 2.8);
        ctx.restore();
      }
    }
  }
}

function pill(ctx, W, u, y, msg, col, size = 3.2) {
  ctx.font = `800 ${size * u}px "Noto Sans TC", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let s = size;
  while (ctx.measureText(msg).width > W - 8 * u && s > 2) { s -= .2; ctx.font = `800 ${s * u}px "Noto Sans TC", system-ui, sans-serif`; }
  const tw = ctx.measureText(msg).width + 5 * u;
  ctx.fillStyle = 'rgba(10,8,6,.66)'; ctx.beginPath(); ctx.roundRect(W / 2 - tw / 2, y - 3 * u, tw, 6 * u, 3 * u); ctx.fill();
  ctx.fillStyle = col; ctx.fillText(msg, W / 2, y);
}

// ── 練一招：手勢剪影＋集氣圈（只在預覽畫面，拍下來不會有）──
function drawGuide(ctx, W, H, u, t, face) {
  const mv = S.guide, pulse = .6 + .4 * Math.sin(t * 5);
  ctx.save();
  if (S.guideOk) {
    const k = (t - S.guideOk.t) / 1.8;
    if (k > 1) { const cb = S.onGuideDone; S.guide = null; S.guideOk = null; cb?.(); ctx.restore(); return; }
    ctx.globalAlpha = Math.min(1, (1 - k) * 3);
    pill(ctx, W, u, H * .72, `「${mv.name}」練成了！保持手勢，按快門`, '#ffe08a');
    ctx.restore(); return;
  }
  if (!face) { pill(ctx, W, u, H * .72, '先讓臉完整入鏡', '#fff'); ctx.restore(); return; }
  ctx.strokeStyle = `rgba(255,255,255,${.75 + .25 * pulse})`; ctx.lineWidth = 1 * u; ctx.setLineDash([1.6 * u, 1.1 * u]); ctx.lineCap = 'round';
  const hr = face.w * .55, sx = face.cx < W / 2 ? 1 : -1;
  const x = Math.max(hr * 1.3, Math.min(W - hr * 1.3, face.cx + sx * face.w * 1.1)), y = face.cy;
  ICON[mv.gesture](ctx, x, y, hr, sx < 0);
  ctx.setLineDash([]);
  ring(ctx, x, y + hr * .1, hr * 1.3, S.k, '#ffe08a');
  pill(ctx, W, u, H * .7, `練一招：${mv.name}`, '#ffe08a', 3.4);
  pill(ctx, W, u, H * .76, HOWTO[mv.gesture], '#fff', 3);
  ctx.restore();
}
function ring(ctx, x, y, r, k, col) {
  ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, k));
  ctx.lineWidth = r * .1; ctx.strokeStyle = col; ctx.stroke();
}
function silhouette(ctx, x, y, r, mirror, build) {
  ctx.save(); ctx.translate(x, y); if (mirror) ctx.scale(-1, 1);
  const path = new Path2D(); build(path, r * .2);
  ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fill(path);
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = r * .08; ctx.stroke(path);
  ctx.restore();
}
const ICON = {
  palm: (ctx, x, y, r, m) => silhouette(ctx, x, y, r, m, (p, fw) => {
    p.roundRect(-r * .5, -r * .15, r, r * .95, r * .3);
    for (const [dx, len, a] of [[-.5, .62, -.18], [-.22, .8, -.06], [.04, .84, .05], [.3, .7, .16]]) {
      const cx = dx * r + fw / 2, cy = -r * .1;
      const ex = cx + Math.sin(a) * len * r, ey = cy - Math.cos(a) * len * r;
      p.moveTo(cx - fw / 2, cy); p.lineTo(ex - fw / 2, ey); p.arc(ex, ey, fw / 2, Math.PI, 0); p.lineTo(cx + fw / 2, cy); p.closePath();
    }
    p.roundRect(r * .46, -r * .05, fw * 1.1, r * .6, fw / 2);
  }),
  sword: (ctx, x, y, r, m) => silhouette(ctx, x, y, r, m, (p, fw) => {
    p.roundRect(-r * .45, -r * .05, r * .9, r * .75, r * .3);
    p.roundRect(-r * .22, -r * 1.0, fw, r * 1.05, fw / 2);
    p.roundRect(-r * .22 + fw * 1.05, -r * 1.08, fw, r * 1.13, fw / 2);
  }),
  point: (ctx, x, y, r, m) => silhouette(ctx, x, y, r, m, (p, fw) => {
    p.roundRect(-r * .45, -r * .05, r * .9, r * .75, r * .3);
    p.roundRect(-r * .22, -r * 1.05, fw, r * 1.1, fw / 2);
  }),
  pinch: (ctx, x, y, r, m) => silhouette(ctx, x, y, r, m, (p, fw) => {
    p.roundRect(-r * .45, -r * .1, r * .9, r * .85, r * .3);
    p.moveTo(-r * .2 + r * .32, -r * .5); p.arc(-r * .2, -r * .5, r * .32, 0, Math.PI * 2);   // 拇指和食指圈起來
    for (const [dx, len] of [[.0, .9], [.24, .82], [.46, .68]]) p.roundRect(dx * r, -r * .1 - len * r, fw, len * r + r * .15, fw / 2);
  }),
  thumb: (ctx, x, y, r, m) => silhouette(ctx, x, y, r, m, (p, fw) => {
    p.roundRect(-r * .45, -r * .2, r * .9, r * .85, r * .3);
    p.roundRect(-r * .38, -r * 1.0, fw * 1.25, r * .9, fw * .6);
  }),
};

// ── 招式成功：水墨刷痕上的大字（招式名）＋集中線 ──
function drawBanner(ctx, W, H, u, age, move, pal) {
  const k = Math.min(1, age < .2 ? age / .2 : Math.max(0, 1 - (age - 1.9) / .9));   // 超過 1 的 globalAlpha 會被瀏覽器忽略，一定要夾住
  ctx.save();
  if (age < .15) { ctx.globalAlpha = (1 - age / .15) * .22; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
  // 集中線
  ctx.globalAlpha = .2 * k; ctx.fillStyle = '#ffffff';
  const cx = W / 2, cy = H * .45, R = Math.hypot(W, H) * .6;
  let seed = 11; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 46; i++) {
    const an = rnd() * Math.PI * 2, w = .003 + rnd() * .006, r0 = R * (.72 + rnd() * .14);
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(an - w) * R, cy + Math.sin(an - w) * R);
    ctx.lineTo(cx + Math.cos(an) * r0, cy + Math.sin(an) * r0); ctx.lineTo(cx + Math.cos(an + w) * R, cy + Math.sin(an + w) * R); ctx.fill();
  }
  // 水墨刷痕（從左刷到右）
  const by = H * .8, bh = 12 * u, reveal = Math.min(1, age / .28);
  ctx.globalAlpha = .78 * k; ctx.fillStyle = '#0d0b0a';
  ctx.beginPath();
  const x0 = W * .06, x1 = lerp(x0, W * .94, reveal);
  ctx.moveTo(x0, by - bh * .42);
  for (let x = x0; x <= x1; x += W / 40) ctx.lineTo(x, by - bh * (.45 + .1 * Math.sin(x * .07) + .06 * rnd()));
  ctx.lineTo(x1 + u * 2, by);
  for (let x = x1; x >= x0; x -= W / 40) ctx.lineTo(x, by + bh * (.45 + .1 * Math.sin(x * .05 + 1) + .06 * rnd()));
  ctx.closePath(); ctx.fill();
  // 大字
  ctx.globalAlpha = k;
  const s = 1 + Math.max(0, .25 - age) * 1.4, px = Math.min(12 * u, W * .84 / Math.max(4, move.name.length)) * s;
  ctx.font = `${px}px "Kouzan Gyosho", "Kouzan Mouhitsu", "Yuji Boku", "LXGW WenKai TC", "Noto Serif TC", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = px * .1; ctx.strokeStyle = '#0d0b0a';
  ctx.save(); ctx.translate(cx, by - px * .05); ctx.rotate(-.03);
  ctx.shadowColor = rgba(pal[1], .9); ctx.shadowBlur = px * .35;
  ctx.strokeText(move.name, 0, 0);
  const g = ctx.createLinearGradient(0, -px / 2, 0, px / 2); g.addColorStop(0, '#ffffff'); g.addColorStop(1, rgba(pal[1], 1));
  ctx.fillStyle = g; ctx.fillText(move.name, 0, 0);
  ctx.shadowBlur = 0; ctx.lineWidth = px * .05; ctx.strokeStyle = g; ctx.strokeText(move.name, 0, 0);   // 毛筆字加粗
  if (move.sub) {
    ctx.font = `${4.8 * u}px "Kouzan Gyosho", "Kouzan Mouhitsu", "Yuji Boku", "LXGW WenKai TC", serif`; ctx.lineWidth = 1.1 * u;
    const sub = `・ ${move.sub} ・`;
    ctx.strokeText(sub, 0, px * .82); ctx.fillStyle = '#fff'; ctx.fillText(sub, 0, px * .82);
  }
  ctx.restore();
  ctx.restore();
}

// ── 粒子（花瓣、金幣、霧、冰屑）──
function drawParts(ctx, dt) {
  if (!S.parts.length) return;
  ctx.save();
  S.parts = S.parts.filter((p) => (p.life += dt) < p.max);
  for (const p of S.parts) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; p.vx *= 1 - (p.drag || 0) * dt; p.rot += (p.spin || 0) * dt;
    const a = 1 - p.life / p.max;
    if (p.kind === 'coin') {
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, a * 2);
      const w = Math.abs(Math.cos(p.rot)) * p.r;
      ctx.fillStyle = '#e8b623'; ctx.strokeStyle = '#8a5a0a'; ctx.lineWidth = p.r * .12;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(w, p.r * .12), p.r, 0, 0, 7); ctx.fill(); ctx.stroke();
      if (w > p.r * .4) { ctx.fillStyle = '#8a5a0a'; ctx.fillRect(p.x - w * .25, p.y - p.r * .25, w * .5, p.r * .5); ctx.fillStyle = '#ffe9a0'; ctx.fillRect(p.x - w * .12, p.y - p.r * .12, w * .24, p.r * .24); }
      ctx.globalCompositeOperation = 'lighter'; dot(ctx, p.x, p.y, p.r * 2.2, [255, 220, 120], a * .35);
    } else if (p.kind === 'die') {
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, a * 2);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = '#fbf6ea'; ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = p.r * .08;
      ctx.beginPath(); ctx.roundRect(-p.r, -p.r, p.r * 2, p.r * 2, p.r * .35); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c81e1e'; ctx.beginPath(); ctx.arc(0, 0, p.r * .3, 0, 7); ctx.fill();
      ctx.restore();
    } else if (p.kind === 'petal') {
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, a * 1.6) * .9;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.col; ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * .42 * (.6 + .4 * Math.abs(Math.sin(p.rot * 2))), 0, 0, 7); ctx.fill();
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter'; dot(ctx, p.x, p.y, p.r * 1.6, p.glow, a * .25);
    } else {
      ctx.globalCompositeOperation = p.ink ? 'source-over' : 'lighter';
      dot(ctx, p.x, p.y, p.r * (p.grow ? 1 + p.life / p.max * p.grow : 1), p.c, a * (p.a || .6));
    }
  }
  ctx.restore();
}

// ── 各招式的特效 ──
// 共用：手的大小（掌寬）與掌心
const handM = (h, W, H, u) => ({ pc: palmCenter(h, W, H), hw: dist(P(h, 5, W, H), P(h, 17, W, H)) || u * 8 });

// 氣芒：英雄代表色的光，從手上往上飄
function drawQi(ctx, h, W, H, u, t, k, pal, dt) {
  const { pc, hw } = handM(h, W, H, u);
  ctx.globalCompositeOperation = 'lighter';
  dot(ctx, pc[0], pc[1] - hw * .3, hw * 2.6, pal[2], .35 * k);
  dot(ctx, pc[0], pc[1] - hw * .3, hw * 1.3, pal[1], .45 * k);
  for (const i of [4, 8, 12, 16, 20]) { const [x, y] = P(h, i, W, H); dot(ctx, x, y, hw * .35, pal[0], .6 * k); }
  if (Math.random() < k * .8) S.parts.push({ x: pc[0] + (Math.random() - .5) * hw * 1.4, y: pc[1] - hw * .4, vx: (Math.random() - .5) * hw * .4, vy: -hw * (1.2 + Math.random()), life: 0, max: .9 + Math.random() * .5, r: hw * (.25 + Math.random() * .3), c: pal[1], a: .45, grow: .8 });
}

// 降龍十八掌：一條金龍從掌心盤繞一圈，再扭著身體往上竄出
function drawDragon(ctx, h, W, H, u, t, k, pal) {
  const { pc, hw } = handM(h, W, H, u);
  const N = 60, grow = Math.min(1, k * 1.2), pts = [];
  const rise = Math.min(hw * 6, pc[1] - H * .06);          // 不要竄出畫面上緣
  for (let i = 0; i <= N; i++) {
    const s = i / N * grow;
    let x, y;
    if (s < .22) {                                         // 尾巴：繞著手掌一圈
      const a = s / .22 * Math.PI * 2 + t * 2;
      x = pc[0] + Math.cos(a) * hw * 1.05; y = pc[1] + Math.sin(a) * hw * .45;
    } else {                                               // 身體：S 形往上扭
      const q = (s - .22) / .78;
      const a0 = Math.PI * 2 + t * 2;
      x = pc[0] + Math.cos(a0) * hw * 1.05 * (1 - q) + Math.sin(q * 6.5 - t * 3.2) * hw * (.6 + q * 1.1);
      y = pc[1] + Math.sin(a0) * hw * .45 * (1 - q) - q * rise;
    }
    pts.push([x, y, s]);
  }
  const width = (s) => hw * (.12 + .5 * Math.pow(Math.min(1, s / Math.max(.01, grow)), .7));   // 尾巴細、頭那端粗
  const path = (w0, col, a) => {
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0, s0] = pts[i - 1], [x1, y1] = pts[i];
      ctx.strokeStyle = rgba(col, a); ctx.lineWidth = width(s0) * w0; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
  };
  ctx.globalCompositeOperation = 'lighter';
  dot(ctx, pc[0], pc[1], hw * 3, pal[2], .35 * k);
  ctx.globalAlpha = 1;
  ctx.shadowColor = rgba(pal[1], 1); ctx.shadowBlur = hw * .5;
  path(2.2, pal[2], .2 * k);                              // 外圍光
  ctx.shadowBlur = 0;
  path(1.25, pal[1], .38 * k);                             // 身體
  path(.4, pal[0], .45 * k);                               // 發光的脊
  // 背鰭與鱗光
  for (let i = 3; i < pts.length - 4; i += 3) {
    const [x, y, s] = pts[i], [x2, y2] = pts[i + 1], d = norm([x2 - x, y2 - y]), n = [-d[1], d[0]], w = width(s);
    ctx.fillStyle = rgba(pal[0], .7 * k);
    ctx.beginPath(); ctx.moveTo(x + n[0] * w * .5, y + n[1] * w * .5); ctx.lineTo(x + n[0] * w * 1.5 - d[0] * w * .4, y + n[1] * w * 1.5 - d[1] * w * .4); ctx.lineTo(x + n[0] * w * .5 + d[0] * w * .7, y + n[1] * w * .5 + d[1] * w * .7); ctx.fill();
    dot(ctx, x - n[0] * w * .3, y - n[1] * w * .3, w * .45, pal[0], .6 * k);
  }
  // 爪：身體中段左右各一隻
  for (const j of [Math.floor(pts.length * .45), Math.floor(pts.length * .7)]) {
    const [x, y, s] = pts[j], [x2, y2] = pts[j + 1], d = norm([x2 - x, y2 - y]), n = [-d[1], d[0]], w = width(s);
    for (const sd of [-1, 1]) {
      const fx = x + n[0] * w * 1.6 * sd, fy = y + n[1] * w * 1.6 * sd;
      ctx.strokeStyle = rgba(pal[1], .8 * k); ctx.lineWidth = w * .35;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(fx, fy); ctx.stroke();
      for (const c of [-.5, 0, .5]) { const cd = rot([n[0] * sd, n[1] * sd], c); ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + cd[0] * w * .7, fy + cd[1] * w * .7); ctx.stroke(); }
    }
  }
  // 頭：吻部朝前進方向、張開的嘴、兩支鹿角、長鬍鬚、發光的眼
  const [hx, hy] = pts[pts.length - 1], [px2, py2] = pts[pts.length - 4];
  const d = norm([hx - px2, hy - py2]), n = [-d[1], d[0]], hr = hw * .75 * Math.max(.4, grow);
  const F = (a, b) => [hx + d[0] * hr * a + n[0] * hr * b, hy + d[1] * hr * a + n[1] * hr * b];
  dot(ctx, hx, hy, hr * 2.6, pal[1], .55 * k);
  ctx.fillStyle = rgba(pal[1], .85 * k);
  ctx.beginPath(); ctx.moveTo(...F(-.6, -.55)); ctx.quadraticCurveTo(...F(.3, -.75), ...F(1.15, -.25)); ctx.lineTo(...F(.55, -.02));
  ctx.lineTo(...F(1.05, .3)); ctx.quadraticCurveTo(...F(.2, .7), ...F(-.6, .5)); ctx.closePath(); ctx.fill();   // 上下顎（嘴張開）
  ctx.fillStyle = rgba(pal[0], .9 * k); ctx.beginPath(); ctx.arc(...F(-.05, 0), hr * .45, 0, 7); ctx.fill();
  ctx.strokeStyle = rgba(pal[0], .95 * k); ctx.lineWidth = hw * .08; ctx.lineCap = 'round';
  for (const sd of [-1, 1]) {                              // 鹿角
    const r0 = F(-.4, .45 * sd), r1 = F(-1.3, 1.0 * sd), r2 = F(-1.9, .7 * sd);
    ctx.beginPath(); ctx.moveTo(...r0); ctx.quadraticCurveTo(...r1, ...r2); ctx.stroke();
    const b0 = F(-1.0, .78 * sd), b1 = F(-1.15, 1.25 * sd); ctx.beginPath(); ctx.moveTo(...b0); ctx.lineTo(...b1); ctx.stroke();
  }
  ctx.lineWidth = hw * .04;
  for (const sd of [-1, 1]) {                              // 鬍鬚
    ctx.beginPath(); ctx.moveTo(...F(.8, .25 * sd));
    for (let j = 1; j <= 10; j++) { const q = j / 10, wob = Math.sin(t * 5 + j * .8 + sd) * .5 * q; ctx.lineTo(...F(.8 - q * 3, (.3 + q * 1.4 + wob) * sd)); }
    ctx.stroke();
  }
  for (const sd of [-1, 1]) dot(ctx, ...F(.25, .3 * sd), hr * .32, [255, 255, 255], k);   // 眼睛
  // 龍珠：龍頭前面一顆發光的珠子
  const pearl = F(2.1, Math.sin(t * 3) * .3);
  dot(ctx, pearl[0], pearl[1], hr * 1.2, pal[1], .7 * k); dot(ctx, pearl[0], pearl[1], hr * .45, [255, 255, 255], k);
}

// 黯然銷魂掌：一圈一圈淡銀藍的氣浪，帶著淡淡的霧
function drawWave(ctx, h, W, H, u, t, k, pal) {
  const { pc, hw } = handM(h, W, H, u);
  ctx.globalCompositeOperation = 'lighter';
  dot(ctx, pc[0], pc[1], hw * 2.4, pal[2], .4 * k);
  dot(ctx, pc[0], pc[1], hw * 1.1, pal[0], .55 * k);
  for (let i = 0; i < 5; i++) {
    const ph = (t * .7 + i / 5) % 1, r = hw * (.7 + ph * 4.2);
    ctx.globalAlpha = (1 - ph) * .75 * k; ctx.strokeStyle = rgba(pal[1], 1); ctx.lineWidth = hw * .2 * (1 - ph) + 1;
    ctx.beginPath();
    for (let a = 0; a <= 64; a++) {
      const an = a / 64 * Math.PI * 2, rr = r * (1 + .05 * Math.sin(an * 5 + t * 3 + i));
      const x = pc[0] + Math.cos(an) * rr, y = pc[1] + Math.sin(an) * rr * .85;
      a ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (Math.random() < k * .7) { const an = Math.random() * 7; S.parts.push({ x: pc[0] + Math.cos(an) * hw, y: pc[1] + Math.sin(an) * hw, vx: Math.cos(an) * hw * 1.2, vy: Math.sin(an) * hw * 1.2 - hw * .3, life: 0, max: 1.4, r: hw * .8, c: pal[2], a: .35, grow: 1.5 }); }
}

// 劍光：從劍指指尖射出的光刃
function blade(ctx, o, d, L, wid, pal, a) {
  const n = [-d[1], d[0]];
  const g = ctx.createLinearGradient(o[0], o[1], o[0] + d[0] * L, o[1] + d[1] * L);
  g.addColorStop(0, rgba(pal[0], a)); g.addColorStop(.6, rgba(pal[1], a * .85)); g.addColorStop(1, rgba(pal[2], 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(o[0] + n[0] * wid, o[1] + n[1] * wid);
  ctx.lineTo(o[0] + d[0] * L, o[1] + d[1] * L);
  ctx.lineTo(o[0] - n[0] * wid, o[1] - n[1] * wid);
  ctx.closePath(); ctx.fill();
}
function drawSwordLight(ctx, h, W, H, u, t, k, pal) {
  const { hw } = handM(h, W, H, u);
  const tip = mid(P(h, 8, W, H), P(h, 12, W, H)), d = norm([tip[0] - P(h, 5, W, H)[0], tip[1] - P(h, 5, W, H)[1]]);
  ctx.globalCompositeOperation = 'lighter';
  const L = hw * 6.5 * Math.min(1, k * 1.2);
  ctx.shadowColor = rgba(pal[1], 1); ctx.shadowBlur = hw * .6;
  blade(ctx, tip, d, L, hw * .22, pal, .55 * k);
  blade(ctx, tip, d, L * .92, hw * .08, [[255, 255, 255], pal[0], pal[1]], .95 * k);
  ctx.shadowBlur = 0;
  dot(ctx, tip[0], tip[1], hw * 1.4, pal[1], .7 * k);
  dot(ctx, tip[0], tip[1], hw * .5, [255, 255, 255], .9 * k);
  // 飄落的白色花瓣
  if (Math.random() < k * .5) { const q = Math.random(); S.parts.push({ kind: 'petal', x: tip[0] + d[0] * L * q + (Math.random() - .5) * hw, y: tip[1] + d[1] * L * q, vx: (Math.random() - .5) * hw * .6, vy: hw * (.3 + Math.random() * .5), life: 0, max: 1.6, r: hw * .16, rot: Math.random() * 6, spin: 3, col: 'rgba(255,255,255,.92)', glow: pal[1] }); }
}
// 獨孤九劍：九道劍光扇形輪流閃
function drawNineSword(ctx, h, W, H, u, t, k, pal) {
  const { hw } = handM(h, W, H, u);
  const tip = mid(P(h, 8, W, H), P(h, 12, W, H)), d = norm([tip[0] - P(h, 5, W, H)[0], tip[1] - P(h, 5, W, H)[1]]);
  ctx.globalCompositeOperation = 'lighter';
  ctx.shadowColor = rgba(pal[1], 1); ctx.shadowBlur = hw * .4;
  for (let i = 0; i < 9; i++) {
    const fl = .35 + .65 * Math.max(0, Math.sin(t * 9 - i * .7)), dd = rot(d, (i - 4) * .17);
    const L = hw * (3.2 + 1.6 * ((i * 7) % 3)) * Math.min(1, k * 1.3);
    blade(ctx, tip, dd, L, hw * .1, pal, fl * .8 * k);
  }
  ctx.shadowBlur = 0;
  dot(ctx, tip[0], tip[1], hw * 1.5, pal[1], .6 * k);
  dot(ctx, tip[0], tip[1], hw * .5, [255, 255, 255], .9 * k);
}
// 六脈神劍：食指尖射出六道細細的劍氣，光點沿著劍氣跑
function drawBeams(ctx, h, W, H, u, t, k, pal) {
  const { hw } = handM(h, W, H, u);
  const tip = P(h, 8, W, H), d = norm([tip[0] - P(h, 5, W, H)[0], tip[1] - P(h, 5, W, H)[1]]);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const dd = rot(d, (i - 2.5) * .1), L = hw * 7 * Math.min(1, k * 1.2);
    ctx.globalAlpha = .75 * k; ctx.strokeStyle = rgba(pal[1], 1); ctx.lineWidth = hw * .06; ctx.lineCap = 'round';
    ctx.shadowColor = rgba(pal[1], 1); ctx.shadowBlur = hw * .4;
    ctx.beginPath(); ctx.moveTo(tip[0], tip[1]); ctx.lineTo(tip[0] + dd[0] * L, tip[1] + dd[1] * L); ctx.stroke();
    ctx.shadowBlur = 0;
    for (let j = 0; j < 2; j++) {
      const q = (t * 2.2 + i / 6 + j / 2) % 1;
      dot(ctx, tip[0] + dd[0] * L * q, tip[1] + dd[1] * L * q, hw * .32, pal[0], .9 * k);
    }
  }
  ctx.globalAlpha = 1;
  dot(ctx, tip[0], tip[1], hw * 1.2, pal[1], .7 * k);
  dot(ctx, tip[0], tip[1], hw * .4, [255, 255, 255], k);
}
// 乾坤大挪移：掌前一個旋轉的紅黑太極，外圈八卦
function drawTaiji(ctx, h, W, H, u, t, k, pal) {
  const { pc, hw } = handM(h, W, H, u);
  const c = [pc[0], pc[1] - hw * .2], R = hw * (.9 + .6 * k), a0 = t * 2.2;
  ctx.globalCompositeOperation = 'lighter';
  dot(ctx, c[0], c[1], R * 2.6, pal[2], .45 * k);
  ctx.globalCompositeOperation = 'source-over';
  ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(a0); ctx.globalAlpha = .85 * k;
  ctx.fillStyle = rgba(pal[1], 1); ctx.beginPath(); ctx.arc(0, 0, R, -Math.PI / 2, Math.PI / 2); ctx.arc(0, R / 2, R / 2, Math.PI / 2, -Math.PI / 2, true); ctx.arc(0, -R / 2, R / 2, Math.PI / 2, -Math.PI / 2); ctx.fill();
  ctx.fillStyle = 'rgba(20,8,10,.85)'; ctx.beginPath(); ctx.arc(0, 0, R, Math.PI / 2, -Math.PI / 2); ctx.arc(0, -R / 2, R / 2, -Math.PI / 2, Math.PI / 2, true); ctx.arc(0, R / 2, R / 2, -Math.PI / 2, Math.PI / 2); ctx.fill();
  ctx.fillStyle = 'rgba(20,8,10,.9)'; ctx.beginPath(); ctx.arc(0, -R / 2, R * .13, 0, 7); ctx.fill();
  ctx.fillStyle = rgba(pal[1], 1); ctx.beginPath(); ctx.arc(0, R / 2, R * .13, 0, 7); ctx.fill();
  ctx.strokeStyle = rgba(pal[0], .9); ctx.lineWidth = hw * .06; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke();
  // 八卦：外圈八組短橫線，反方向轉
  ctx.rotate(-a0 * 1.6);
  for (let i = 0; i < 8; i++) {
    ctx.save(); ctx.rotate(i * Math.PI / 4);
    for (let j = 0; j < 3; j++) {
      const y = -R * (1.25 + j * .13), broken = (i >> j) & 1;
      ctx.fillStyle = rgba(pal[0], .85);
      if (broken) { ctx.fillRect(-R * .2, y, R * .16, R * .06); ctx.fillRect(R * .04, y, R * .16, R * .06); }
      else ctx.fillRect(-R * .2, y, R * .4, R * .06);
    }
    ctx.restore();
  }
  ctx.restore();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 10; i++) { const an = -t * 3 + i * .63; dot(ctx, c[0] + Math.cos(an) * R * 1.8, c[1] + Math.sin(an) * R * 1.8, hw * .3, pal[1], .6 * k); }
}
// 生死符：掌心周圍繞著轉的冰晶雪花
function flake(ctx, x, y, r, a, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.strokeStyle = col; ctx.lineWidth = r * .12; ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -r);
    ctx.moveTo(0, -r * .5); ctx.lineTo(r * .25, -r * .72); ctx.moveTo(0, -r * .5); ctx.lineTo(-r * .25, -r * .72); ctx.stroke();
  }
  ctx.restore();
}
function drawIce(ctx, h, W, H, u, t, k, pal) {
  const { pc, hw } = handM(h, W, H, u);
  ctx.globalCompositeOperation = 'lighter';
  dot(ctx, pc[0], pc[1], hw * 2.6, pal[2], .4 * k);
  dot(ctx, pc[0], pc[1], hw * 1.2, pal[0], .5 * k);
  ctx.globalAlpha = k; ctx.shadowColor = rgba(pal[1], 1); ctx.shadowBlur = hw * .3;
  for (let i = 0; i < 8; i++) {
    const an = t * 1.3 + i * Math.PI / 4, rr = hw * (1.3 + .25 * Math.sin(t * 2 + i));
    flake(ctx, pc[0] + Math.cos(an) * rr, pc[1] + Math.sin(an) * rr * .8, hw * (.22 + .08 * (i % 3)), t * 2 + i, rgba(pal[0], .95));
  }
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  if (Math.random() < k * .9) { const an = Math.random() * 7; S.parts.push({ x: pc[0] + Math.cos(an) * hw * 1.5, y: pc[1] + Math.sin(an) * hw * 1.2, vx: Math.cos(an) * hw * .3, vy: hw * .4, life: 0, max: 1.2, r: hw * .12, c: pal[0], a: .9 }); }
}
// 左右互搏：一手畫圓、一手畫方，繞著掌心反方向轉
function drawCircleSquare(ctx, h, W, H, u, t, k, pal) {
  const { pc, hw } = handM(h, W, H, u);
  ctx.globalCompositeOperation = 'lighter';
  dot(ctx, pc[0], pc[1], hw * 2.2, pal[2], .35 * k);
  ctx.globalAlpha = k; ctx.strokeStyle = rgba(pal[1], 1); ctx.lineWidth = hw * .12; ctx.shadowColor = rgba(pal[1], 1); ctx.shadowBlur = hw * .5;
  const R = hw * 1.5, a = t * 1.6;
  const c1 = [pc[0] + Math.cos(a) * R, pc[1] + Math.sin(a) * R * .7], c2 = [pc[0] - Math.cos(a) * R, pc[1] - Math.sin(a) * R * .7];
  ctx.beginPath(); ctx.arc(c1[0], c1[1], hw * .7, 0, 7); ctx.stroke();
  ctx.save(); ctx.translate(c2[0], c2[1]); ctx.rotate(-t * 2); ctx.strokeRect(-hw * .6, -hw * .6, hw * 1.2, hw * 1.2); ctx.restore();
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  dot(ctx, c1[0], c1[1], hw * .5, pal[0], .7 * k); dot(ctx, c2[0], c2[1], hw * .5, pal[0], .7 * k);
  if (Math.random() < k * .6) for (const c of [c1, c2]) S.parts.push({ x: c[0], y: c[1], vx: 0, vy: 0, life: 0, max: .6, r: hw * .35, c: pal[1], a: .5 });
}
// 蘭花拂穴手：指尖旁轉著的蘭花花瓣
function drawPetals(ctx, h, W, H, u, t, k, pal) {
  const { hw } = handM(h, W, H, u);
  const c = mid(P(h, 4, W, H), P(h, 8, W, H));
  ctx.globalCompositeOperation = 'lighter';
  dot(ctx, c[0], c[1], hw * 2, pal[2], .4 * k);
  dot(ctx, c[0], c[1], hw * .7, pal[0], .8 * k);
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 10; i++) {
    const an = t * 1.8 + i * Math.PI / 5, rr = hw * (1.3 + .35 * Math.sin(t * 3 + i)) * (.5 + .5 * k);
    const x = c[0] + Math.cos(an) * rr, y = c[1] + Math.sin(an) * rr * .75;
    ctx.save(); ctx.translate(x, y); ctx.rotate(an + Math.PI / 2); ctx.globalAlpha = .85 * k;
    ctx.fillStyle = i % 2 ? rgba(pal[1], 1) : 'rgba(255,250,235,1)';
    ctx.beginPath(); ctx.ellipse(0, 0, hw * .38, hw * .15, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  if (Math.random() < k * .4) S.parts.push({ kind: 'petal', x: c[0], y: c[1], vx: (Math.random() - .5) * hw * 2, vy: -hw * Math.random(), g: hw * 1.2, life: 0, max: 1.6, r: hw * .2, rot: Math.random() * 6, spin: 4, col: rgba(pal[1], .95), glow: pal[1] });
}
// 繡花針：從捏住的指尖射出一根根細針，拖著紅線
function drawNeedles(ctx, h, W, H, u, t, k, pal) {
  const { hw } = handM(h, W, H, u);
  const o = mid(P(h, 4, W, H), P(h, 8, W, H)), d = norm([o[0] - P(h, 0, W, H)[0], o[1] - P(h, 0, W, H)[1]]);
  ctx.globalCompositeOperation = 'lighter';
  dot(ctx, o[0], o[1], hw * 1.6, pal[2], .5 * k);
  dot(ctx, o[0], o[1], hw * .5, pal[0], .9 * k);
  for (let i = 0; i < 7; i++) {
    const p = (t * 1.1 + i / 7) % 1, dd = rot(d, (i - 3) * .32), n = [-dd[1], dd[0]];
    const pos = [o[0] + dd[0] * hw * (.6 + p * 6.5), o[1] + dd[1] * hw * (.6 + p * 6.5)], a = (1 - p) * k;
    // 紅線（彎彎的）
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a * .8;
    ctx.strokeStyle = rgba(pal[2], 1); ctx.lineWidth = hw * .035; ctx.beginPath(); ctx.moveTo(o[0], o[1]);
    for (let j = 1; j <= 10; j++) { const q = j / 10, w = Math.sin(q * Math.PI * 2 + t * 6 + i) * hw * .25 * q; ctx.lineTo(lerp(o[0], pos[0], q) + n[0] * w, lerp(o[1], pos[1], q) + n[1] * w); }
    ctx.stroke();
    // 針
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
    ctx.strokeStyle = 'rgba(255,255,255,1)'; ctx.lineWidth = hw * .07; ctx.lineCap = 'round';
    ctx.shadowColor = rgba(pal[1], 1); ctx.shadowBlur = hw * .3;
    ctx.beginPath(); ctx.moveTo(pos[0] - dd[0] * hw * 1.2, pos[1] - dd[1] * hw * 1.2); ctx.lineTo(pos[0], pos[1]); ctx.stroke();
    ctx.shadowBlur = 0; dot(ctx, pos[0], pos[1], hw * .45, pal[1], a * .8);
  }
  ctx.globalAlpha = 1;
}
// 神行百變：比讚的大拇指噴出金幣和骰子
function drawCoins(ctx, h, W, H, u, t, k, pal) {
  const { hw } = handM(h, W, H, u), tip = P(h, 4, W, H);
  ctx.globalCompositeOperation = 'lighter';
  dot(ctx, tip[0], tip[1], hw * 1.8, pal[2], .45 * k);
  dot(ctx, tip[0], tip[1], hw * .6, pal[0], .9 * k);
  // 殘影：手的位置往兩邊拉出幾道淡淡的光
  for (let i = 1; i <= 3; i++) for (const sd of [-1, 1]) dot(ctx, tip[0] + sd * i * hw * .7, tip[1] + i * hw * .1, hw * (.9 - i * .15), pal[1], .18 * k);
  if (Math.random() < k * .55) S.parts.push({ kind: Math.random() < .15 ? 'die' : 'coin', x: tip[0], y: tip[1] - hw * .3, vx: (Math.random() - .5) * hw * 4, vy: -hw * (3 + Math.random() * 2.5), g: hw * 7, life: 0, max: 1.5, r: hw * (.22 + Math.random() * .1), rot: Math.random() * 6, spin: 8 + Math.random() * 6 });
}

const FX = { dragon: drawDragon, wave: drawWave, swordlight: drawSwordLight, ninesword: drawNineSword, beams: drawBeams,
  taiji: drawTaiji, ice: drawIce, circlesquare: drawCircleSquare, petals: drawPetals, needles: drawNeedles, coins: drawCoins };
