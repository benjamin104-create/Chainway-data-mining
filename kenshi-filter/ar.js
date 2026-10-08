// 把劍士服裝、武器畫在人身上，並計算「招式」姿勢吻合度。
// 只用 Canvas 2D 畫向量圖形：頭和手露在外面，其他部位（軀幹、手臂、腿）換成羽織、袖子、袴。
//
// 關鍵點格式：{ n, ls, rs, le, re, lw, rw, lh, rh, lk, rk, la, ra } 每個是 { x, y, v }（畫面像素，v = 可見度 0～1）
// l／r 指畫面左右（前鏡頭已鏡像，所以像照鏡子）

// MediaPipe Pose 33 點的索引 → 我們用的名字（mirror=true 時左右對調，讓 l 永遠在畫面左邊）
const MP = { n: 0, ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16, lp: 17, rp: 18, li: 19, ri: 20, lh: 23, rh: 24, lk: 25, rk: 26, la: 27, ra: 28 };
export function fromLandmarks(lms, map, mirror) {
  const kp = {};
  for (const k in MP) {
    // MediaPipe 的 left 是「本人的左邊」，未鏡像影像裡在畫面右側
    let idx = MP[k];
    if (k !== 'n' && !mirror) idx = MP[(k[0] === 'l' ? 'r' : 'l') + k.slice(1)];
    const p = lms[idx];
    const [x, y] = map(p.x, p.y);
    kp[k] = { x, y, v: p.visibility ?? 1 };
  }
  return kp;
}

// 平滑：避免抖動（速度快時跟得比較緊）
export function smooth(prev, next, base = .45) {
  if (!prev) return next;
  const out = {};
  for (const k in next) {
    const a = prev[k], b = next[k];
    if (!a) { out[k] = b; continue; }
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const t = Math.min(1, base + d / 120);
    out[k] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, v: b.v };
  }
  return out;
}

// ── 向量小工具 ──────────────────────────────
const V = (x, y) => ({ x, y });
const add = (a, b) => V(a.x + b.x, a.y + b.y);
const sub = (a, b) => V(a.x - b.x, a.y - b.y);
const mul = (a, s) => V(a.x * s, a.y * s);
const mid = (a, b) => V((a.x + b.x) / 2, (a.y + b.y) / 2);
const len = (a) => Math.hypot(a.x, a.y);
const norm = (a) => { const l = len(a) || 1; return V(a.x / l, a.y / l); };
const perp = (a) => V(-a.y, a.x);
const lerp = (a, b, t) => V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
const dist = (a, b) => len(sub(a, b));

// 身體座標：髖中點、往上方向、側向、軀幹長
export function frame(kp) {
  const hip = mid(kp.lh, kp.rh), sh = mid(kp.ls, kp.rs);
  const T = Math.max(20, dist(hip, sh));
  const up = norm(sub(sh, hip));
  let side = V(-up.y, up.x);                        // 垂直於身體的方向
  if (side.x * (kp.rs.x - kp.ls.x) + side.y * (kp.rs.y - kp.ls.y) < 0) side = mul(side, -1);
  return { hip, sh, T, up, side };
}

// ── 和風紋樣：每種紋樣畫成一小塊磁磚，再用 pattern 平鋪 ──────────
const tileCache = new Map();
function tile(kind, c1, c2) {
  const key = kind + c1 + c2;
  if (tileCache.has(key)) return tileCache.get(key);
  const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = c1; g.fillRect(0, 0, S, S);
  g.strokeStyle = c2; g.fillStyle = c2; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
  if (kind === 'shippo') {               // 七寶：圓圈交疊
    for (const [x, y] of [[0, 0], [S, 0], [0, S], [S, S], [S / 2, S / 2]]) { g.beginPath(); g.arc(x, y, S / 2, 0, Math.PI * 2); g.stroke(); }
  } else if (kind === 'tatewaku') {      // 立涌：直向的波浪
    for (const x0 of [S / 4, S * 3 / 4]) {
      g.beginPath();
      for (let y = 0; y <= S; y += 2) { const x = x0 + Math.sin(y / S * Math.PI * 2) * S / 6 * (x0 < S / 2 ? 1 : -1); y ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
  } else if (kind === 'yagasuri') {      // 矢絣：一欄欄箭羽
    g.fillRect(S / 2, 0, S / 2, S);
    for (const [x, col] of [[0, c2], [S / 2, c1]]) {
      g.fillStyle = col;
      g.beginPath(); g.moveTo(x, S * .1); g.lineTo(x + S / 4, S * .35); g.lineTo(x + S / 2, S * .1); g.lineTo(x + S / 2, S * .45); g.lineTo(x + S / 4, S * .7); g.lineTo(x, S * .45); g.closePath(); g.fill();
    }
  } else if (kind === 'inazuma') {       // 稻妻：鋸齒閃電
    g.lineWidth = 5;
    for (const y0 of [S * .25, S * .75]) {
      g.beginPath(); g.moveTo(0, y0);
      for (let i = 1; i <= 4; i++) g.lineTo(i * S / 4, y0 + (i % 2 ? -S / 8 : S / 8));
      g.stroke();
    }
  } else if (kind === 'kikko') {         // 龜甲：六角形
    const r = S / 4;
    const hex = (cx, cy) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); } g.closePath(); g.stroke(); };
    const h = r * Math.sqrt(3);
    for (const [x, y] of [[0, 0], [0, h], [r * 1.5, h / 2], [r * 3, 0], [r * 3, h]]) hex(x, y);
  } else if (kind === 'seigaiha') {      // 青海波：一層層的扇形，由上往下疊
    g.lineWidth = 2.2;
    const arcs = (cx, cy) => {
      g.fillStyle = c1; g.beginPath(); g.arc(cx, cy, S / 2, 0, Math.PI * 2); g.fill();
      for (let rr = S / 2; rr > 4; rr -= S / 10) { g.beginPath(); g.arc(cx, cy, rr, Math.PI, 0); g.stroke(); }
    };
    for (const [x, y] of [[S / 2, 0], [0, S / 2], [S, S / 2], [S / 2, S]]) arcs(x, y);
  }
  tileCache.set(key, cv);
  return cv;
}
function patternFill(ctx, ch, angle, scale, origin) {
  const p = ctx.createPattern(tile(ch.pattern, ch.haori, ch.haori2), 'repeat');
  if (p && p.setTransform && typeof DOMMatrix !== 'undefined') {
    p.setTransform(new DOMMatrix().translate(origin.x, origin.y).rotate(angle * 180 / Math.PI).scale(scale));
  }
  return p || ch.haori;
}

function poly(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); }
function shape(ctx, pts, fill, line, lw) { poly(ctx, pts); ctx.fillStyle = fill; ctx.fill(); if (line) { ctx.strokeStyle = line; ctx.lineWidth = lw; ctx.stroke(); } }

// 一段「粗管子」：從 a 到 b，寬度從 wa 漸變到 wb
function tube(a, b, wa, wb) {
  const d = norm(sub(b, a)), n = perp(d);
  return [add(a, mul(n, wa / 2)), add(b, mul(n, wb / 2)), sub(b, mul(n, wb / 2)), sub(a, mul(n, wa / 2))];
}

// ── 服裝 ───────────────────────────────────
// opts.alpha：透明度（招式框用淡淡的）　opts.H：畫面高度（腿看不到時延伸到畫面外）
export function drawCostume(ctx, kp, ch, opts = {}) {
  const { hip, sh, T, up, side } = frame(kp);
  const down = mul(up, -1);
  const lw = Math.max(2, T * .028), ink = '#120d0b';
  const angle = Math.atan2(side.y, side.x);
  const pscale = T / 150;
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  // 腿（袴）：看不到腳的時候往下延伸
  for (const s of ['l', 'r']) {
    const h = kp[s + 'h'];
    const hOut = add(h, mul(side, (s === 'l' ? -1 : 1) * T * .06));
    let k = kp[s + 'k'], a = kp[s + 'a'];
    if (!k || k.v < .35) k = add(hOut, mul(down, T * 1.05));
    if (!a || a.v < .35) a = add(k, mul(norm(sub(k, hOut)), T * 1.0));
    const thigh = tube(hOut, k, T * .42, T * .44), shin = tube(k, a, T * .44, T * .54);
    shape(ctx, thigh, ch.hakama, ink, lw);
    shape(ctx, shin, ch.hakama, ink, lw);
    // 袴的褶線
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = lw * .7;
    ctx.beginPath(); ctx.moveTo(hOut.x, hOut.y); ctx.lineTo(a.x, a.y); ctx.stroke();
  }

  // 軀幹：羽織（肩比實際寬一點，側身時也蓋得住）
  const shW = Math.max(dist(kp.ls, kp.rs) / 2, T * .24) * 1.18;
  const hipW = Math.max(dist(kp.lh, kp.rh) / 2, T * .2) * 1.5;
  const hem = add(hip, mul(down, T * .72));
  const P = (base, sx, ux) => add(add(base, mul(side, sx)), mul(up, ux));
  const neckL = P(sh, -T * .1, T * .04), neckR = P(sh, T * .1, T * .04);
  const body = [P(sh, -shW, -T * .02), neckL, neckR, P(sh, shW, -T * .02), P(hem, hipW * 1.1, 0), P(hem, -hipW * 1.1, 0)];
  // 內襯（羽織敞開露出的上衣）
  const inner = [neckL, neckR, P(hip, T * .2, T * .05), P(hem, T * .16, 0), P(hem, -T * .16, 0), P(hip, -T * .2, T * .05)];
  shape(ctx, body, patternFill(ctx, ch, angle, pscale, sh), ink, lw);
  shape(ctx, inner, ch.inner, ink, lw * .8);
  // 衣襟
  ctx.strokeStyle = ch.trim; ctx.lineWidth = lw * 1.6;
  ctx.beginPath(); ctx.moveTo(neckL.x, neckL.y); ctx.lineTo(P(hip, -T * .2, T * .05).x, P(hip, -T * .2, T * .05).y); ctx.lineTo(P(hem, -T * .16, 0).x, P(hem, -T * .16, 0).y);
  ctx.moveTo(neckR.x, neckR.y); ctx.lineTo(P(hip, T * .2, T * .05).x, P(hip, T * .2, T * .05).y); ctx.lineTo(P(hem, T * .16, 0).x, P(hem, T * .16, 0).y); ctx.stroke();
  // 腰帶
  shape(ctx, [P(hip, -T * .22, T * .2), P(hip, T * .22, T * .2), P(hip, T * .22, T * .08), P(hip, -T * .22, T * .08)], ch.trim, ink, lw * .7);
  // 立體感：側邊加一點陰影
  ctx.save(); poly(ctx, body); ctx.clip();
  const g = ctx.createLinearGradient(P(sh, -shW, 0).x, P(sh, -shW, 0).y, P(sh, shW, 0).x, P(sh, shW, 0).y);
  g.addColorStop(0, 'rgba(0,0,0,.28)'); g.addColorStop(.45, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(255,255,255,.08)');
  ctx.fillStyle = g; ctx.fill(); ctx.restore();
  // 領口：蓋住原本衣服的領子，只露出脖子
  shape(ctx, [neckL, neckR, P(sh, 0, -T * .2)], ch.inner, ink, lw * .6);

  // 手臂（寬袖）：袖口停在手腕前，手露出來
  for (const s of ['l', 'r']) {
    const S = kp[s + 's'], E = kp[s + 'e'], W = kp[s + 'w'];
    if (!E || !W || E.v < .2 || W.v < .2) continue;
    const Sout = add(S, mul(norm(sub(S, sh)), T * .06));
    const f = norm(sub(W, E)), cuff = sub(W, mul(f, T * .1));
    // 垂下來的袖兜（往畫面下方垂）
    const drop = V(0, 1), fe = Math.abs(f.y);          // 前臂越水平，袖兜越明顯
    const sag = T * (.18 + .3 * (1 - fe));
    const n = mul(perp(f), perp(f).y >= 0 ? 1 : -1);   // 指向畫面下方的那一側
    const sleeve = [...tube(Sout, E, T * .4, T * .38)];
    shape(ctx, sleeve, patternFill(ctx, ch, Math.atan2(E.y - S.y, E.x - S.x), pscale, S), ink, lw);
    const fore = tube(E, cuff, T * .38, T * .46);
    const bag = [add(E, mul(n, T * .18)), add(cuff, mul(n, T * .23)), add(add(cuff, mul(n, T * .23)), mul(drop, sag)), add(add(E, mul(n, T * .18)), mul(drop, sag * .6))];
    shape(ctx, bag, patternFill(ctx, ch, Math.atan2(f.y, f.x), pscale, E), ink, lw);
    shape(ctx, fore, patternFill(ctx, ch, Math.atan2(f.y, f.x), pscale, E), ink, lw);
    // 袖口滾邊
    ctx.strokeStyle = ch.trim; ctx.lineWidth = lw * 1.4;
    const c1 = add(cuff, mul(perp(f), T * .23)), c2 = sub(cuff, mul(perp(f), T * .23));
    ctx.beginPath(); ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.stroke();
  }
  ctx.restore();
  return { T };
}

// ── 武器 ───────────────────────────────────
// 依手的位置估刀的方向；招式吻合度越高，越貼近招式預先算好的方向
export function weaponPose(kp, ch, target, matchT) {
  const { T, up } = frame(kp);
  const handOf = (s) => {
    const w = kp[s + 'w'], i = kp[s + 'i'], p = kp[s + 'p'];
    return i && p && i.v > .3 ? lerp(w, mid(i, p), .55) : w;
  };
  const fore = (s) => norm(sub(kp[s + 'w'], kp[s + 'e']));
  const hand = ch.move.hand;
  const both = dist(kp.lw, kp.rw) < T * .45;
  let grip, dir;
  if (both || hand === 'both' && ch.weapon.kind !== 'twin') {
    grip = mid(handOf('l'), handOf('r'));
    dir = both ? up : fore('r');
  } else {
    grip = handOf('r');
    dir = fore('r');
  }
  if (target && matchT > 0) {
    const t = norm(V(target[0], target[1]));
    const k = Math.min(1, matchT * matchT * 1.4);
    dir = norm(lerp(dir, t, k));
  }
  const out = [{ grip, dir }];
  if (ch.weapon.kind === 'twin') {
    out.push({ grip: handOf('l'), dir: fore('l') });
  }
  return { T, blades: out };
}

export function drawWeapon(ctx, ch, grip, dir, T, alpha = 1) {
  const w = ch.weapon, n = perp(dir);
  const L = T * w.len;
  ctx.save(); ctx.globalAlpha = alpha; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const ink = '#120d0b', lw = Math.max(1.5, T * .02);
  if (w.kind === 'naginata') {
    // 薙刀：長柄，手握在柄的中段，刀身在前端
    const butt = sub(grip, mul(dir, L * .35)), neck = add(grip, mul(dir, L * .45));
    shape(ctx, tube(butt, neck, T * .07, T * .07), w.grip, ink, lw);
    const tip = add(neck, mul(dir, L * .4)), bow = add(lerp(neck, tip, .5), mul(n, T * .12));
    ctx.beginPath(); ctx.moveTo(neck.x + n.x * T * .05, neck.y + n.y * T * .05);
    ctx.quadraticCurveTo(bow.x, bow.y, tip.x, tip.y);
    ctx.quadraticCurveTo(lerp(neck, tip, .5).x, lerp(neck, tip, .5).y, neck.x - n.x * T * .04, neck.y - n.y * T * .04); ctx.closePath();
    bladeFill(ctx, ch, neck, tip); ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.stroke();
    shape(ctx, tube(sub(neck, mul(dir, T * .04)), add(neck, mul(dir, T * .04)), T * .16, T * .16), w.tsuba, ink, lw);
    ctx.restore(); return tip;
  }
  const gripLen = w.kind === 'twin' ? T * .22 : w.kind === 'odachi' ? T * .55 : T * .38;
  const butt = sub(grip, mul(dir, gripLen * .45)), guard = add(grip, mul(dir, gripLen * .55));
  const tip = add(guard, mul(dir, L));
  const bw = T * (w.kind === 'odachi' ? .11 : w.kind === 'long' ? .06 : .075);
  // 刀身：微微彎曲
  const curve = mul(n, -L * .05);
  ctx.beginPath();
  ctx.moveTo(guard.x + n.x * bw / 2, guard.y + n.y * bw / 2);
  const m = add(lerp(guard, tip, .55), curve);
  ctx.quadraticCurveTo(m.x + n.x * bw / 2, m.y + n.y * bw / 2, tip.x, tip.y);
  ctx.quadraticCurveTo(m.x - n.x * bw / 2, m.y - n.y * bw / 2, guard.x - n.x * bw / 2, guard.y - n.y * bw / 2);
  ctx.closePath();
  bladeFill(ctx, ch, guard, tip); ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.stroke();
  // 刀柄（菱形纏繩）
  shape(ctx, tube(butt, guard, bw * 1.15, bw * 1.15), w.grip, ink, lw);
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = lw * .6;
  for (let i = 1; i < 5; i++) { const a = lerp(butt, guard, i / 5), b = lerp(butt, guard, (i + .5) / 5);
    ctx.beginPath(); ctx.moveTo(a.x + n.x * bw * .5, a.y + n.y * bw * .5); ctx.lineTo(b.x - n.x * bw * .5, b.y - n.y * bw * .5); ctx.stroke(); }
  // 刀鍔
  ctx.beginPath(); ctx.ellipse(guard.x, guard.y, bw * 1.5, bw * .45, Math.atan2(n.y, n.x), 0, Math.PI * 2);
  ctx.fillStyle = w.tsuba; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.stroke();
  ctx.restore();
  return tip;
}
function bladeFill(ctx, ch, a, b) {
  const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
  g.addColorStop(0, '#dfe6ee'); g.addColorStop(.6, '#ffffff'); g.addColorStop(1, ch.glow);
  ctx.shadowColor = ch.tint; ctx.shadowBlur = 14;
  ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0;
}

// ── 刀光殘影：刀尖移動夠快時畫一道弧 ────────────────
export function drawTrail(ctx, trail, ch, T) {
  if (trail.length < 3) return;
  const now = trail.at(-1).t;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1], b = trail[i];
    const age = (now - b.t) / 260; if (age > 1) continue;
    const w = T * .22 * (1 - age);
    ctx.strokeStyle = ch.tint; ctx.globalAlpha = .55 * (1 - age); ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.globalAlpha = .8 * (1 - age); ctx.lineWidth = w * .3; ctx.stroke();
  }
  ctx.restore();
}

// ── 招式：把目標姿勢放到使用者身上，計算吻合度 ──────────
const KEYS = ['n', 'ls', 'rs', 'le', 're', 'lw', 'rw', 'lh', 'rh', 'lk', 'rk', 'la', 'ra'];
// 目標姿勢（正規化座標）→ 畫面像素，錨定在使用者的髖中點，大小依使用者軀幹長
export function placePose(pose, anchor, T, flip = false) {
  const kp = {};
  for (const k of KEYS) {
    const src = flip ? pose[k === 'n' ? 'n' : (k[0] === 'l' ? 'r' : 'l') + k.slice(1)] : pose[k];
    const x = flip ? -src[0] : src[0];
    kp[k] = { x: anchor.x + x * T, y: anchor.y + src[1] * T, v: 1 };
  }
  return kp;
}

// 比對的身體段落：[起點, 終點, 權重]
const SEGS = [['ls', 'le', 1.2], ['le', 'lw', 1.2], ['rs', 're', 1.2], ['re', 'rw', 1.2], ['hip', 'sh', 1], ['lh', 'lk', .7], ['lk', 'la', .5], ['rh', 'rk', .7], ['rk', 'ra', .5]];
function pt(kp, k) { return k === 'hip' ? mid(kp.lh, kp.rh) : k === 'sh' ? mid(kp.ls, kp.rs) : kp[k]; }

// 回傳 { score: 0～1, parts: 每段是否到位, flip: 左右相反比較像 }
export function matchPose(kp, pose) {
  const { hip, T } = frame(kp);
  const best = [false, true].map((flip) => {
    const tg = placePose(pose, hip, T, flip);
    let sum = 0, wsum = 0; const parts = {};
    for (const [a, b, w] of SEGS) {
      const legs = a[1] === 'h' || a[1] === 'k';
      if (legs && (kp[b].v < .5 || kp[a].v < .4)) continue;   // 腿沒入鏡就只看上半身
      const u = norm(sub(pt(kp, b), pt(kp, a))), v = norm(sub(pt(tg, b), pt(tg, a)));
      const ang = Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y))) * 180 / Math.PI;
      const s = Math.max(0, 1 - ang / 55);
      parts[a + b] = s > .6;
      sum += s * w; wsum += w;
    }
    // 側身程度：肩寬／軀幹長
    const want = Math.abs(pose.rs[0] - pose.ls[0]), have = dist(kp.ls, kp.rs) / T;
    const sw = Math.max(0, 1 - Math.abs(want - have) / .45);
    sum += sw * .8; wsum += .8;
    return { score: sum / wsum, parts, flip };
  });
  return best[0].score >= best[1].score - .02 ? best[0] : best[1];
}

// 招式框：淡淡的服裝剪影＋虛線輪廓，到位的段落變亮
export function drawGuide(ctx, kp, ch, res, pulse) {
  const { hip, T } = frame(kp);
  const tg = placePose(ch.move.pose, hip, T, res?.flip);
  ctx.save();
  drawCostume(ctx, tg, ch, { alpha: .28 });
  const blade = ch.move.blade, dir = norm(V(res?.flip ? -blade[0] : blade[0], blade[1]));
  const grip = ch.move.hand === 'both' ? mid(tg.lw, tg.rw) : (res?.flip ? tg.lw : tg.rw);
  drawWeapon(ctx, ch, grip, dir, T, .3);
  // 骨架虛線
  ctx.setLineDash([T * .08, T * .06]); ctx.lineCap = 'round';
  for (const [a, b] of SEGS) {
    const ok = res?.parts?.[a + b];
    ctx.strokeStyle = ok ? ch.glow : 'rgba(255,255,255,.85)';
    ctx.lineWidth = ok ? T * .05 : T * .03;
    ctx.globalAlpha = ok ? .95 : .55 + .25 * pulse;
    const p = pt(tg, a), q = pt(tg, b);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
  }
  ctx.setLineDash([]);
  // 頭的位置圈
  ctx.globalAlpha = .6; ctx.strokeStyle = '#fff'; ctx.lineWidth = T * .025;
  ctx.beginPath(); ctx.arc(tg.n.x, tg.n.y, T * .22, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// ── 招式發動特效 ───────────────────────────
export function drawFinisher(ctx, W, H, ch, kp, t) {
  // t：發動後經過的秒數
  const { hip, sh, T } = frame(kp);
  const c = mid(hip, sh);
  ctx.save();
  // 放射狀速度線
  const a = Math.max(0, 1 - t / 1.4);
  ctx.globalAlpha = .55 * a; ctx.strokeStyle = '#fff';
  for (let i = 0; i < 64; i++) {
    const ang = i / 64 * Math.PI * 2 + (i % 3) * .03, r0 = Math.max(W, H) * (.35 + (i * 37 % 10) / 40);
    ctx.lineWidth = 1 + (i * 13 % 4);
    ctx.beginPath(); ctx.moveTo(c.x + Math.cos(ang) * r0, c.y + Math.sin(ang) * r0);
    ctx.lineTo(c.x + Math.cos(ang) * Math.max(W, H), c.y + Math.sin(ang) * Math.max(W, H)); ctx.stroke();
  }
  // 屬性特效
  ctx.globalAlpha = Math.min(1, a * 1.3);
  const R = T * (1.2 + t * 1.6);
  ctx.strokeStyle = ch.tint; ctx.fillStyle = ch.glow; ctx.shadowColor = ch.tint; ctx.shadowBlur = 24;
  if (ch.fx === 'flame') {
    for (let i = 0; i < 26; i++) {
      const ang = i / 26 * Math.PI * 2, rr = R * (.8 + (i * 7 % 5) / 10);
      const x = c.x + Math.cos(ang) * rr, y = c.y + Math.sin(ang) * rr - t * T * .8;
      ctx.beginPath(); ctx.moveTo(x, y - T * .25); ctx.quadraticCurveTo(x + T * .12, y, x, y + T * .1); ctx.quadraticCurveTo(x - T * .12, y, x, y - T * .25); ctx.fill();
    }
  } else if (ch.fx === 'moon') {
    ctx.lineWidth = T * .14; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(c.x, c.y, R, -Math.PI * .85, Math.PI * .1); ctx.stroke();
    ctx.lineWidth = T * .04; ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.arc(c.x, c.y, R * .92, -Math.PI * .8, Math.PI * .05); ctx.stroke();
  } else if (ch.fx === 'sun') {
    ctx.lineWidth = T * .05;
    for (let i = 0; i < 18; i++) { const ang = i / 18 * Math.PI * 2 + t; ctx.beginPath();
      ctx.moveTo(c.x + Math.cos(ang) * R * .6, c.y + Math.sin(ang) * R * .6); ctx.lineTo(c.x + Math.cos(ang) * R * 1.2, c.y + Math.sin(ang) * R * 1.2); ctx.stroke(); }
  } else if (ch.fx === 'thunder') {
    ctx.lineWidth = T * .05; ctx.lineJoin = 'miter';
    for (let j = 0; j < 7; j++) {
      const ang = j / 7 * Math.PI * 2 + 0.3; let x = c.x, y = c.y; ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 1; k <= 6; k++) { const rr = R * k / 6 * 1.3; x = c.x + Math.cos(ang) * rr + ((k * j * 31) % 7 - 3) * T * .05; y = c.y + Math.sin(ang) * rr + ((k * j * 17) % 7 - 3) * T * .05; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  } else if (ch.fx === 'rock') {
    for (let i = 0; i < 16; i++) {
      const ang = i / 16 * Math.PI * 2, rr = R * (.7 + (i * 5 % 4) / 8), s = T * (.12 + (i % 3) * .05);
      const x = c.x + Math.cos(ang) * rr, y = c.y + Math.sin(ang) * rr;
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang + t * 2); ctx.fillRect(-s / 2, -s / 2, s, s * .7); ctx.restore();
    }
  } else if (ch.fx === 'wave') {
    ctx.lineWidth = T * .07; ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) { ctx.beginPath();
      for (let i = 0; i <= 60; i++) { const ang = i / 60 * Math.PI * 2, rr = R * (.8 + k * .18) + Math.sin(ang * 6 + t * 6 + k) * T * .12;
        const x = c.x + Math.cos(ang) * rr, y = c.y + Math.sin(ang) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke(); }
  }
  ctx.restore();
}
