// 動漫姿勢彩蛋：用手部 21 個定位點判斷姿勢，擺到位就出現特效（拍下來的照片也會有）
//   一隻手遮住半邊臉 → 那半邊臉浮現「骨白半面具」（原創設計：骨白底、黑紅紋、裂痕、獠牙）
//   張開手掌舉起來   → 手掌上燃起狐火
//   雙手合十（結印） → 集中線＋神光爆發＋「顕現」
// 全部在手機上算，畫面不會上傳。

const MID = [10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 164, 0, 11, 12, 13, 14, 15, 16, 17, 18, 200, 199, 175, 152];
// 臉的外輪廓：從額頭（10）往一邊繞到下巴（152），再從另一邊繞回來
const OVAL_A = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152];
const OVAL_B = [10, 109, 67, 103, 54, 21, 162, 127, 234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152];
const EYE_A = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const EYE_B = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];

const S = {
  hands: [], frame: 0, ts: 0,
  mask: null,           // { side: 'A'|'B', t0, until }
  maskHold: 0,          // 手停在臉旁邊多久了（秒）
  fire: 0,              // 狐火強度 0~1
  firePalm: null,
  seal: null,           // { t0 }
  sealHold: 0, lastT: 0,
  shards: [],
  hintAt: 0, hintIdx: 0, used: false,
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
// 姿勢引導：使用者在相機下方點「面具／神火／結印」，畫面上會出現手要放哪裡的虛線手形和集氣圈
export function setGuide(kind, onDone) { S.guide = kind; S.guideOk = null; S.onGuideDone = onDone; }
export function resetPoses() { S.hands = []; S.mask = null; S.seal = null; S.fire = 0; S.shards = []; }
export const poseState = S;

const P = (L, i, W, H) => [L[i].x * W, L[i].y * H];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lerp = (a, b, k) => a + (b - a) * k;

// 手指是不是伸直（指尖比第二關節離手腕遠）
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

// 每一格：判斷姿勢、更新特效狀態，再畫出來
export function drawPoseFX(ctx, W, H, u, t, lm, stand, capturing) {
  const dt = Math.min(.1, Math.max(0, t - (S.lastT || t))); S.lastT = t;
  const glow = stand?.glow || '#bfe4ff';
  let face = null;
  if (lm) {
    const xs = lm.map((p) => p.x * W), ys = lm.map((p) => p.y * H);
    face = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    face.cx = (face.x0 + face.x1) / 2; face.cy = (face.y0 + face.y1) / 2; face.w = face.x1 - face.x0; face.h = face.y1 - face.y0;
  }
  const hands = S.hands;

  // ── 1. 半面具：一隻手的掌心貼近臉的一側 ──
  let near = null;
  if (face) for (const h of hands) {
    const c = palmCenter(h, W, H);
    if (Math.abs(c[1] - face.cy) < face.h * .55 && Math.abs(c[0] - face.cx) < face.w * .75) {
      // 看手在鼻子的哪一邊，就是哪一邊的臉
      const nose = P(lm, 1, W, H), a = P(lm, 263, W, H);
      near = (c[0] - nose[0]) * (a[0] - nose[0]) > 0 ? 'A' : 'B';
    }
  }
  S.maskHold = near ? S.maskHold + dt : 0;
  if (near && S.maskHold > .5 && (!S.mask || S.mask.until < t + 6)) {
    if (!S.mask || S.mask.side !== near || t > S.mask.until) { S.mask = { side: near, t0: t }; burst(face, near, lm, W, H); }
    S.mask.until = t + 10; S.used = true; done('mask', t);
  }
  if (S.mask && t > S.mask.until + .6) S.mask = null;
  if (S.mask && lm) drawMask(ctx, lm, W, H, u, t, S.mask, glow);

  // ── 2. 神火（狐火）：張開手掌，舉到下巴以上，而且不是貼著臉 ──
  let fireHand = null;
  for (const h of hands) {
    const c = palmCenter(h, W, H);
    if (!openPalm(h, W, H)) continue;
    if (face && Math.abs(c[0] - face.cx) < face.w * .7 && Math.abs(c[1] - face.cy) < face.h * .6) continue;   // 貼著臉是面具，不是狐火
    if (face ? c[1] < face.y1 + face.h * .2 : c[1] < H * .55) fireHand = c;
  }
  S.fire = lerp(S.fire, fireHand ? 1 : 0, fireHand ? .25 : .08);
  if (fireHand) { S.firePalm = fireHand; S.used = true; if (S.fire > .8) done('fire', t); }
  if (S.fire > .02 && S.firePalm) drawFoxFire(ctx, S.firePalm, u, t, S.fire, face ? face.w : W * .25);

  // ── 3. 結印：兩隻手的手腕、指尖都靠在一起 ──
  let sealing = false;
  if (hands.length === 2) {
    const [a, b] = hands, ref = face ? face.w : W * .25;
    sealing = dist(P(a, 0, W, H), P(b, 0, W, H)) < ref * .9 && dist(P(a, 8, W, H), P(b, 8, W, H)) < ref * .5;
  }
  S.sealHold = sealing ? S.sealHold + dt : 0;
  if (S.sealHold > .4 && (!S.seal || t - S.seal.t0 > 3)) { S.seal = { t0: t }; S.used = true; done('seal', t); }
  if (S.seal && t - S.seal.t0 < 2.6) drawSeal(ctx, W, H, u, t - S.seal.t0, glow);

  drawShards(ctx, dt);

  if (S.guide && !capturing) drawGuide(ctx, W, H, u, t, face, lm);
  // 還沒玩過彩蛋的人，隔一陣子提示一下（只在預覽，拍下來不會有）
  if (!capturing && !S.used && !S.guide && hands.length === 0) {
    if (!S.hintAt) S.hintAt = t + 4;
    if (t > S.hintAt) {
      const k = (t - S.hintAt) / 3.2;
      if (k > 1) { S.hintAt = t + 5; S.hintIdx = (S.hintIdx + 1) % 3; }
      else {
        const msg = ['彩蛋：一隻手遮住半邊臉，停一下 →「面具」', '彩蛋：張開手掌舉高 →「神火」', '彩蛋：雙手合十 →「結印」'][S.hintIdx];
        ctx.save(); ctx.globalAlpha = Math.sin(k * Math.PI);
        ctx.font = `700 ${3 * u}px "Noto Sans TC", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(msg).width + 5 * u, ty = H * .7;
        ctx.fillStyle = 'rgba(10,6,20,.62)'; ctx.beginPath(); ctx.roundRect(W / 2 - tw / 2, ty - 2.8 * u, tw, 5.6 * u, 2.8 * u); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText(msg, W / 2, ty); ctx.restore();
      }
    }
  }
}

function done(kind, t) {
  if (S.guide === kind && !S.guideOk) S.guideOk = { t };
}

// ── 姿勢引導（只在預覽畫面，拍下來不會有）──
function handIcon(ctx, x, y, r, mirror) {
  // 手的剪影：手掌＋四根手指＋大拇指（圓角），半透明白底＋虛線外框，一看就懂「手放這裡」
  ctx.save(); ctx.translate(x, y); if (mirror) ctx.scale(-1, 1);
  const fw = r * .2, path = new Path2D();
  path.roundRect(-r * .5, -r * .15, r * 1.0, r * .95, r * .3);                       // 手掌
  for (const [dx, len] of [[-.47, .62], [-.22, .78], [.03, .82], [.28, .7]]) path.roundRect(dx * r, -r * .15 - len * r, fw, len * r + r * .2, fw / 2);
  const thumb = new Path2D(); thumb.roundRect(r * .42, r * .0, fw * 1.1, r * .6, fw / 2);   // 大拇指
  ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fill(path); ctx.fill(thumb);
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = r * .08;
  ctx.stroke(path); ctx.stroke(thumb);
  ctx.restore();
}
function ring(ctx, x, y, r, k, col) {
  ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, k));
  ctx.lineWidth = r * .12; ctx.strokeStyle = col; ctx.setLineDash([]); ctx.stroke();
}
function label(ctx, W, u, y, msg, col) {
  ctx.font = `800 ${3.2 * u}px "Noto Sans TC", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(msg).width + 5 * u;
  ctx.fillStyle = 'rgba(10,6,20,.66)'; ctx.beginPath(); ctx.roundRect(W / 2 - tw / 2, y - 3 * u, tw, 6 * u, 3 * u); ctx.fill();
  ctx.fillStyle = col; ctx.fillText(msg, W / 2, y);
}
function drawGuide(ctx, W, H, u, t, face, lm) {
  const g = S.guide, pulse = .6 + .4 * Math.sin(t * 5);
  ctx.save();
  if (S.guideOk) {
    const k = (t - S.guideOk.t) / 1.8;
    if (k > 1) { const cb = S.onGuideDone; S.guide = null; S.guideOk = null; cb?.(); ctx.restore(); return; }
    ctx.globalAlpha = Math.min(1, (1 - k) * 3);
    label(ctx, W, u, H * .72, { mask: '成功！把手放下，看鏡頭按快門', fire: '成功！保持手勢，按快門', seal: '成功！就是現在，按快門' }[g], '#ffe08a');
    ctx.restore(); return;
  }
  if (!face) { label(ctx, W, u, H * .72, '先讓臉完整入鏡', '#fff'); ctx.restore(); return; }
  ctx.strokeStyle = `rgba(255,255,255,${.75 + .25 * pulse})`; ctx.lineWidth = 1 * u; ctx.setLineDash([1.6 * u, 1.1 * u]); ctx.lineCap = 'round';
  const hr = face.w * .55;
  if (g === 'mask') {
    // 手掌貼住臉的一邊（畫面上比較靠中間的那一邊，比較好擺）
    const sx = face.cx < W / 2 ? 1 : -1, x = face.cx + sx * face.w * .28, y = face.cy;
    handIcon(ctx, x, y, hr, sx < 0);
    ring(ctx, x, y + hr * .25, hr * 1.25, S.maskHold / .5, '#ffe08a');
    label(ctx, W, u, H * .72, '手掌貼住半邊臉，停 1 秒 → 浮現面具', '#fff');
  } else if (g === 'fire') {
    // 張開手掌舉到肩膀上方（畫面比較空的那一邊）
    const sx = face.cx < W / 2 ? 1 : -1, x = Math.max(hr * 1.4, Math.min(W - hr * 1.4, face.cx + sx * face.w * 1.25)), y = face.y0 + face.h * .1;
    handIcon(ctx, x, y, hr, sx < 0);
    ring(ctx, x, y + hr * .25, hr * 1.25, S.fire, '#8fd0ff');
    label(ctx, W, u, H * .72, '張開手掌，舉到這裡 → 燃起神火', '#fff');
  } else if (g === 'seal') {
    // 雙手合十放在下巴下面
    const x = face.cx, y = face.y1 + face.h * .75;
    handIcon(ctx, x - hr * .32, y, hr * .9, true); handIcon(ctx, x + hr * .32, y, hr * .9, false);
    ring(ctx, x, y + hr * .2, hr * 1.4, S.sealHold / .4, '#ffe08a');
    label(ctx, W, u, H * .72, '雙手合十放在胸前，停一下 → 結印', '#fff');
  }
  ctx.restore();
}

// ── 骨白半面具（原創）：用臉部定位點建一個「臉的座標系」，面具跟著臉轉動、縮放 ──
function drawMask(ctx, lm, W, H, u, t, m, glow) {
  const side = m.side, oval = side === 'A' ? OVAL_A : OVAL_B, eye = side === 'A' ? EYE_A : EYE_B;
  const age = t - m.t0, show = Math.min(1, age / .45), fade = Math.min(1, Math.max(0, (m.until + .6 - t) / .6));
  const a = show * fade; if (a <= 0) return;
  const c = P(lm, 168, W, H), top = P(lm, 10, W, H), chin = P(lm, 152, W, H);
  const outer = P(lm, side === 'A' ? 454 : 234, W, H);
  // 臉的座標：U＝往這半邊的外側，V＝往下巴
  const U = [outer[0] - c[0], outer[1] - c[1]], V = [(chin[0] - top[0]) / 2, (chin[1] - top[1]) / 2];
  const F = (x, y) => [c[0] + U[0] * x + V[0] * y, c[1] + U[1] * x + V[1] * y];
  const pts = (idx) => idx.map((i) => P(lm, i, W, H));
  const grow = (p, k) => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k];

  ctx.save();
  ctx.globalAlpha = a;
  // 出現時從中線往外「長」出來
  ctx.beginPath();
  const reveal = 1 - Math.pow(1 - show, 3);
  const half = [...pts(oval).map((p) => grow(p, 1.06)), ...pts([...MID].reverse())];
  // 中線做成裂開的鋸齒
  const mid = pts(MID);
  ctx.moveTo(...grow(pts(oval)[0], 1.06));
  for (const p of pts(oval)) ctx.lineTo(...grow(p, lerp(.6, 1.06, reveal)));
  for (let i = mid.length - 1; i >= 0; i--) {
    const p = mid[i], j = (i % 2 ? 1 : -1) * U[0] * .045, k = (i % 2 ? 1 : -1) * U[1] * .045;
    ctx.lineTo(p[0] + j, p[1] + k);
  }
  ctx.closePath();
  ctx.save();
  ctx.clip();
  // 骨白底：中間亮、邊緣帶一點灰黃
  const bb = half.reduce((r, p) => [Math.min(r[0], p[0]), Math.min(r[1], p[1]), Math.max(r[2], p[0]), Math.max(r[3], p[1])], [1e9, 1e9, -1e9, -1e9]);
  const g = ctx.createRadialGradient(...F(.35, -.1), 0, ...F(.35, -.1), Math.hypot(bb[2] - bb[0], bb[3] - bb[1]) * .7);
  g.addColorStop(0, '#fbf8f1'); g.addColorStop(.6, '#ece6d8'); g.addColorStop(1, '#c9bfa8');
  ctx.fillStyle = g; ctx.fillRect(bb[0] - 10, bb[1] - 10, bb[2] - bb[0] + 20, bb[3] - bb[1] + 20);
  // 紋路：三道黑紅刀痕，從眼睛往額頭、往下巴
  const stripe = (pts2, w, col) => {
    ctx.beginPath();
    const L = pts2.map(([x, y]) => F(x, y));
    ctx.moveTo(...L[0]);
    for (let i = 1; i < L.length; i++) ctx.lineTo(...L[i]);
    ctx.lineWidth = w; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
  };
  const fw = Math.hypot(U[0], U[1]);
  stripe([[.42, -.1], [.5, -.55], [.62, -1.05]], fw * .1, '#141018');
  stripe([[.62, -.05], [.78, -.45], [.95, -.9]], fw * .07, '#b3121b');
  stripe([[.42, .2], [.52, .62], [.58, 1.0]], fw * .1, '#141018');
  stripe([[.62, .18], [.76, .55], [.86, .88]], fw * .06, '#b3121b');
  // 裂痕
  ctx.lineWidth = fw * .012; ctx.strokeStyle = 'rgba(60,50,40,.55)';
  for (const crack of [[[.08, -.6], [.2, -.5], [.17, -.38], [.3, -.3]], [[.1, .5], [.24, .46], [.3, .58]], [[.85, .1], [.95, .2]]]) {
    ctx.beginPath(); crack.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, ...F(x, y))); ctx.stroke();
  }
  // 獠牙：沿著嘴巴這半邊畫一排牙齒
  const m0 = P(lm, 13, W, H), m1 = P(lm, side === 'A' ? 291 : 61, W, H);
  const n = 6, th = fw * .16;
  ctx.fillStyle = '#141018';
  ctx.beginPath();
  ctx.moveTo(m0[0] - V[0] * .08, m0[1] - V[1] * .08); ctx.lineTo(m1[0] - V[0] * .08, m1[1] - V[1] * .08);
  ctx.lineTo(m1[0] + V[0] * .08, m1[1] + V[1] * .08); ctx.lineTo(m0[0] + V[0] * .08, m0[1] + V[1] * .08); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f6f2e8';
  for (let i = 0; i < n; i++) {
    const k0 = i / n, k1 = (i + .8) / n;
    const p0 = [lerp(m0[0], m1[0], k0), lerp(m0[1], m1[1], k0)], p1 = [lerp(m0[0], m1[0], k1), lerp(m0[1], m1[1], k1)];
    const vy = [V[0] / Math.hypot(V[0], V[1]) * th * .5, V[1] / Math.hypot(V[0], V[1]) * th * .5];
    ctx.fillRect(Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]) - vy[1] * .9, Math.abs(p1[0] - p0[0]) + 1, th * .45);
    ctx.fillRect(Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]) + vy[1] * .15, Math.abs(p1[0] - p0[0]) + 1, th * .45);
  }
  // 眼洞：黑色、往太陽穴拉出尖角，眼睛發出金光
  const e = pts(eye), ec = e.reduce((r, p) => [r[0] + p[0] / e.length, r[1] + p[1] / e.length], [0, 0]);
  ctx.beginPath();
  e.forEach((p, i) => { const q = [ec[0] + (p[0] - ec[0]) * 1.55, ec[1] + (p[1] - ec[1]) * 2.1]; i ? ctx.lineTo(...q) : ctx.moveTo(...q); });
  ctx.closePath(); ctx.fillStyle = '#0b0910'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(...F(.55, -.2)); ctx.lineTo(...F(1.0, -.42)); ctx.lineTo(...F(.62, .02)); ctx.closePath(); ctx.fill();
  ctx.restore();   // 解除裁切

  // 金色瞳孔光（面具下的眼睛在發光）
  const iris = lm.length > 473 ? P(lm, side === 'A' ? 473 : 468, W, H) : ec;
  ctx.globalCompositeOperation = 'lighter';
  const ig = ctx.createRadialGradient(iris[0], iris[1], 0, iris[0], iris[1], fw * .22);
  ig.addColorStop(0, 'rgba(255,240,160,.95)'); ig.addColorStop(.25, 'rgba(255,190,40,.6)'); ig.addColorStop(1, 'rgba(255,120,0,0)');
  ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(iris[0], iris[1], fw * .22, 0, 7); ctx.fill();
  // 剛出現時的白光
  if (age < .5) {
    ctx.globalAlpha = (1 - age / .5) * .8;
    const fg = ctx.createRadialGradient(...F(.4, 0), 0, ...F(.4, 0), fw * 1.4);
    fg.addColorStop(0, '#ffffff'); fg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(...F(.4, 0), fw * 1.4, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function burst(face, side, lm, W, H) {
  if (!face) return;
  const nose = P(lm, 1, W, H), o = P(lm, side === 'A' ? 454 : 234, W, H);
  for (let i = 0; i < 26; i++) {
    const an = Math.random() * Math.PI * 2, sp = face.w * (.8 + Math.random() * 1.6);
    S.shards.push({ x: lerp(nose[0], o[0], .5), y: lerp(nose[1], o[1], .5), vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - face.w * .3,
      r: face.w * (.015 + Math.random() * .03), life: .6 + Math.random() * .5, rot: Math.random() * 6, red: Math.random() < .35 });
  }
}
function drawShards(ctx, dt) {
  if (!S.shards.length) return;
  ctx.save();
  S.shards = S.shards.filter((p) => (p.life -= dt) > 0);
  for (const p of S.shards) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.rot += dt * 8;
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = p.red ? '#b3121b' : '#f1ece0';
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.beginPath(); ctx.moveTo(-p.r, -p.r * .6); ctx.lineTo(p.r, -p.r * .2); ctx.lineTo(-p.r * .2, p.r); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// ── 狐火：藍白色的火焰（水滴形、尖端往上飄），在手掌上方繞圈 ──
function flame(ctx, x, y, r, t, k, seed) {
  const sway = Math.sin(t * 7 + seed) * r * .35, h = r * (2.6 + Math.sin(t * 11 + seed * 2) * .25);
  const shape = (s) => {
    ctx.beginPath();
    ctx.moveTo(x + sway * s, y - h * s);                                         // 尖端
    ctx.bezierCurveTo(x + r * .35 * s, y - h * .55 * s, x + r * s, y - r * .2 * s, x + r * .9 * s, y + r * .25 * s);
    ctx.arc(x, y + r * .25 * s, r * .9 * s, 0, Math.PI);                         // 圓圓的底部
    ctx.bezierCurveTo(x - r * s, y - r * .2 * s, x - r * .35 * s, y - h * .55 * s, x + sway * s, y - h * s);
  };
  // 外焰：深藍→藍；內焰：淡藍；火心：白
  ctx.globalCompositeOperation = 'source-over';
  let g = ctx.createLinearGradient(x, y - h, x, y + r);
  g.addColorStop(0, `rgba(60,110,255,${.0 * k})`); g.addColorStop(.35, `rgba(50,110,255,${.8 * k})`); g.addColorStop(1, `rgba(30,70,230,${.9 * k})`);
  ctx.shadowColor = `rgba(80,150,255,${k})`; ctx.shadowBlur = r * 2.2;               // 火焰的光暈
  ctx.filter = `blur(${(r * .18).toFixed(1)}px)`;
  ctx.fillStyle = g; shape(1); ctx.fill();
  ctx.shadowBlur = 0; ctx.filter = 'none';
  ctx.globalCompositeOperation = 'lighter';
  g = ctx.createLinearGradient(x, y - h * .7, x, y + r);
  g.addColorStop(0, `rgba(120,200,255,0)`); g.addColorStop(.5, `rgba(130,210,255,${.8 * k})`); g.addColorStop(1, `rgba(170,230,255,${.9 * k})`);
  ctx.fillStyle = g; shape(.68); ctx.fill();
  ctx.fillStyle = `rgba(255,255,255,${.9 * k})`; shape(.36); ctx.fill();
  // 往上飄的火星
  for (let i = 0; i < 3; i++) {
    const ph = (t * .9 + i / 3 + seed * .13) % 1, sx = x + Math.sin(ph * 9 + seed + i) * r * .8, sy = y - h * (.6 + ph * 1.4);
    ctx.fillStyle = `rgba(170,220,255,${(1 - ph) * .8 * k})`; ctx.beginPath(); ctx.arc(sx, sy, r * .12 * (1 - ph * .5), 0, 7); ctx.fill();
  }
}
function drawFoxFire(ctx, c, u, t, k, ref) {
  ctx.save();
  const cx = c[0], cy = c[1] - ref * .35;
  // 淡淡的藍色光暈，亮的背景上也看得到
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, ref * .8);
  halo.addColorStop(0, `rgba(60,120,255,${.35 * k})`); halo.addColorStop(1, 'rgba(30,60,200,0)');
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, ref * .8, 0, 7); ctx.fill();
  const R = ref * .5, items = [];
  for (let i = 0; i < 5; i++) {
    const an = t * 1.8 + i * Math.PI * 2 / 5;
    items.push([Math.sin(an), cx + Math.cos(an) * R, cy + Math.sin(an) * R * .35, ref * .06, i]);
  }
  items.push([0, cx, cy, ref * .13, 9]);
  items.sort((a, b) => a[0] - b[0]);                       // 後面的先畫，看起來是繞著手掌轉
  for (const [, x, y, r, i] of items) flame(ctx, x, y, r, t + i, k, i * 1.7);
  ctx.restore();
}

// ── 結印：集中線、神光、大字「顕現」 ──
function drawSeal(ctx, W, H, u, age, glow) {
  const k = age < .2 ? age / .2 : Math.max(0, 1 - (age - 1.6) / 1);
  ctx.save();
  // 閃光
  if (age < .35) { ctx.globalAlpha = (1 - age / .35) * .85; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
  // 集中線（漫畫的速度線）：從畫面邊緣往中間
  ctx.globalAlpha = .55 * k; ctx.fillStyle = '#ffffff';
  const cx = W / 2, cy = H * .45, R = Math.hypot(W, H) * .6;
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 90; i++) {
    const an = rnd() * Math.PI * 2, w = .004 + rnd() * .012, r0 = R * (.55 + rnd() * .2);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(an - w) * R, cy + Math.sin(an - w) * R);
    ctx.lineTo(cx + Math.cos(an) * r0, cy + Math.sin(an) * r0);
    ctx.lineTo(cx + Math.cos(an + w) * R, cy + Math.sin(an + w) * R);
    ctx.fill();
  }
  // 神光
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .5 * k;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * .7);
  g.addColorStop(0, glow); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 大字
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = k;
  const s = 1 + Math.max(0, .3 - age) * 2.5, px = 16 * u * s;
  ctx.font = `900 ${px}px "Noto Sans TC", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = px * .14; ctx.strokeStyle = '#120a1c';
  ctx.save(); ctx.translate(cx, H * .58); ctx.rotate(-.08);
  ctx.strokeText('顕現', 0, 0); ctx.fillStyle = '#fff'; ctx.fillText('顕現', 0, 0);
  ctx.font = `800 ${3.4 * u}px "Noto Sans TC", sans-serif`; ctx.lineWidth = .8 * u;
  ctx.strokeText('結 印 ・ 守 護 神 顕 現', 0, px * .75); ctx.fillStyle = glow; ctx.fillText('結 印 ・ 守 護 神 顕 現', 0, px * .75);
  ctx.restore();
  ctx.restore();
}
