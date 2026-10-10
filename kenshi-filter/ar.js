// 把劍士服裝、武器畫在人身上，並計算「招式」姿勢吻合度。
// 服裝與武器的 3D 渲染在 render3d.js；這裡是骨架、比對、刀光與招式特效（Canvas 2D）。
//
// 關鍵點格式：{ n, ls, rs, le, re, lw, rw, lh, rh, lk, rk, la, ra } 每個是 { x, y, v }（畫面像素，v = 可見度 0～1）
// l／r 指畫面左右（前鏡頭已鏡像，所以像照鏡子）
import { buildHaoriRig, drawTextureMesh } from './garment-rig.js';

// MediaPipe Pose 33 點的索引 → 我們用的名字（mirror=true 時左右對調，讓 l 永遠在畫面左邊）
const MP = { n: 0, ley:2, rey:5, lear:7, rear:8, lmouth:9, rmouth:10, ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16, lp: 17, rp: 18, li: 19, ri: 20, lt: 21, rt: 22, lh: 23, rh: 24, lk: 25, rk: 26, la: 27, ra: 28 };
export function fromLandmarks(lms, map, mirror, world = null) {
  const kp = {};
  for (const k in MP) {
    // MediaPipe 的 left 是「本人的左邊」，未鏡像影像裡在畫面右側
    let idx = MP[k];
    if (k !== 'n' && !mirror) idx = MP[(k[0] === 'l' ? 'r' : 'l') + k.slice(1)];
    const p = lms[idx];
    const [x, y, z] = map(p.x, p.y, p.z);
    const w = world?.[idx];
    const inFrame = p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
    kp[k] = { x, y, z, v: inFrame ? Math.min(p.visibility ?? 1, p.presence ?? 1) : 0, wx: w ? (mirror ? -w.x : w.x) : undefined, wy: w?.y, wz: w?.z };
  }
  return kp;
}

// 人體追蹤穩定器：以肩膀＋髖部建立每幀的「身體座標」，再讓各關節相對跟隨。
// 這樣真人左右移動、靠近／遠離、側身時，AR 會一起平移、縮放與旋轉；
// 某個關節瞬間誤判時也不會把衣服或武器拉飛。
export function smooth(prev, next, base = .38) {
  if (!prev) return next;
  const pf = frame(prev), nf = frame(next);
  const pc = { x: (pf.sh.x + pf.hip.x) / 2, y: (pf.sh.y + pf.hip.y) / 2 };
  const ncRaw = { x: (nf.sh.x + nf.hip.x) / 2, y: (nf.sh.y + nf.hip.y) / 2 };
  const maxShift = Math.max(18, pf.T * .42);
  const shiftX = ncRaw.x - pc.x, shiftY = ncRaw.y - pc.y;
  const shiftLen = Math.hypot(shiftX, shiftY) || 1;
  const moveK = Math.min(1, maxShift / shiftLen);
  const nc = { x: pc.x + shiftX * moveK, y: pc.y + shiftY * moveK };
  const scale = Math.max(.78, Math.min(1.28, nf.T / pf.T));
  const pa = Math.atan2(pf.up.y, pf.up.x), na = Math.atan2(nf.up.y, nf.up.x);
  let da = na - pa;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  da = Math.max(-.18, Math.min(.18, da));
  const cs = Math.cos(da), sn = Math.sin(da);
  const out = {};
  for (const k in next) {
    const a = prev[k], b = next[k];
    if (!a) { out[k] = b; continue; }
    const rx = (a.x - pc.x) * scale, ry = (a.y - pc.y) * scale;
    const predicted = { x: nc.x + rx * cs - ry * sn, y: nc.y + rx * sn + ry * cs };
    const confidence = Math.max(0, Math.min(1, b.v ?? 1));
    const residual = Math.hypot(b.x - predicted.x, b.y - predicted.y);
    const dynamic = Math.min(.3, residual / Math.max(80, pf.T * 3));
    const torso = k === 'ls' || k === 'rs' || k === 'lh' || k === 'rh';
    const t = confidence < .42 ? 0 : Math.min(.90, base + dynamic + (torso ? -.08 : .08));
    const worldDelta=Number.isFinite(b.wx)&&Number.isFinite(a.wx)?Math.hypot(b.wx-a.wx,b.wy-a.wy,b.wz-a.wz):0;
    const worldT=confidence<.42?0:Math.min(.92,.65+worldDelta*3);
    out[k] = {
      ...b,
      x: predicted.x + (b.x - predicted.x) * t,
      y: predicted.y + (b.y - predicted.y) * t,
      z: b.z == null ? b.z : (a.z ?? b.z) + (b.z - (a.z ?? b.z)) * Math.min(.7, Math.max(.18, t * .65)),
      wx: Number.isFinite(b.wx) ? (a.wx ?? b.wx) + (b.wx - (a.wx ?? b.wx)) * worldT : b.wx,
      wy: Number.isFinite(b.wy) ? (a.wy ?? b.wy) + (b.wy - (a.wy ?? b.wy)) * worldT : b.wy,
      wz: Number.isFinite(b.wz) ? (a.wz ?? b.wz) + (b.wz - (a.wz ?? b.wz)) * worldT : b.wz,
      v: confidence,
    };
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
  const sh = mid(kp.ls, kp.rs), shoulder = sub(kp.rs, kp.ls), shoulderW = Math.max(20, len(shoulder));
  const rig = buildHaoriRig(kp);
  const referenceWidth = rig?.frontWidth || shoulderW;
  const measuredHip = mid(kp.lh, kp.rh), measuredT = dist(measuredHip, sh);
  const hipsReady = (kp.lh?.v ?? 0) > .32 && (kp.rh?.v ?? 0) > .32
    && measuredT > referenceWidth * .38 && measuredT < referenceWidth * 2.5;
  let hip, T, up, side;
  if (hipsReady) {
    hip = measuredHip; T = Math.max(20, measuredT); up = norm(sub(sh, hip));
    side = V(-up.y, up.x);
    if (side.x * shoulder.x + side.y * shoulder.y < 0) side = mul(side, -1);
  } else {
    // 手持自拍常看不到髖部：以肩線的垂直方向建立穩定的虛擬胸腔。
    side = norm(shoulder); up = perp(side);
    const toHead = kp.n ? sub(kp.n, sh) : V(0, -1);
    if (up.x * toHead.x + up.y * toHead.y < 0) up = mul(up, -1);
    T = rig?.T || shoulderW * 1.18; hip = add(sh, mul(up, -T));
  }
  return { hip, sh, T, up, side, shoulderW, upperOnly: !hipsReady };
}

// ── 和風紋樣：每種紋樣畫成一小塊磁磚，再用 pattern 平鋪 ──────────
const tileCache = new Map();
export function tile(kind, c1, c2, S = 64) {
  const key = kind + c1 + c2 + S;
  if (tileCache.has(key)) return tileCache.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.scale(S / 64, S / 64); S = 64;
  g.fillStyle = c1; g.fillRect(0, 0, S, S);
  g.strokeStyle = c2; g.fillStyle = c2; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
  if (kind === 'ichimatsu') {            // 市松：方格交錯（傳統紋樣）
    g.fillRect(0, 0, S / 2, S / 2); g.fillRect(S / 2, S / 2, S / 2, S / 2);
  } else if (kind === 'shippo') {        // 七寶：圓圈交疊
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
  } else if (kind === 'uroko') {         // 鱗：規整白色三角
    g.fillStyle = c2;
    for (let row = 0, y = 12; y < S; row++, y += 22) for (let x = row % 2 ? 12 : 0; x < S; x += 24) {
      g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 7, y + 6); g.lineTo(x - 7, y + 6); g.closePath(); g.fill();
    }
  } else if (kind === 'hishi') {         // 菱：斜向的菱形格子
    g.lineWidth = 3.5;
    g.beginPath(); g.moveTo(0, S / 2); g.lineTo(S / 2, 0); g.lineTo(S, S / 2); g.lineTo(S / 2, S); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(S / 2, S * .3); g.lineTo(S * .7, S / 2); g.lineTo(S / 2, S * .7); g.lineTo(S * .3, S / 2); g.closePath(); g.fill();
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

// ── 寫實布料羽織 ─────────────────────────────────────
// 使用透明產品攝影素材作為布料明暗與縫線基底，再依角色套色與紋樣。
// 衣身由肩／髖控制網格；兩袖依肩／肘／腕分別彎曲，不再方形縮放整張圖。
const rigPhotos = {};
const rigTextureCache = new Map();
export const haoriAssetsReady = () => ['body','sleeve'].every(part=>rigPhotos[part]?.complete && rigPhotos[part].naturalWidth > 0);
function rigTexture(ch, part) {
  if(!rigPhotos[part]){const image=new Image();image.decoding='async';image.src=new URL(`assets/haori-rig-${part}-v2.png`,import.meta.url).href;rigPhotos[part]=image;}
  const image = rigPhotos[part];
  if (!image.complete || !image.naturalWidth) return null;
  const key = [part, ch.pattern, ch.haori, ch.haori2].join('|');
  if (rigTextureCache.has(key)) return rigTextureCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = 640; cv.height = Math.round(640 * image.naturalHeight / image.naturalWidth);
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, 0, 0, cv.width, cv.height);
  const original = g.getImageData(0, 0, cv.width, cv.height);
  const pattern = document.createElement('canvas'); pattern.width = cv.width; pattern.height = cv.height;
  const pg = pattern.getContext('2d', { willReadFrequently: true });
  const tileSize = part === 'body' ? 140 : 190;
  pg.fillStyle = pg.createPattern(tile(ch.pattern, ch.haori, ch.haori2, tileSize), 'repeat'); pg.fillRect(0, 0, cv.width, cv.height);
  const colors = pg.getImageData(0, 0, cv.width, cv.height).data;
  const pixels = original.data;
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3]) {
    const luminance = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    // Dark seam/collar pixels stay dark. Every pattern pixel retains the
    // original cloth fold luminance instead of a flat color overlay.
    const seam = luminance < 90;
    const shade = Math.max(.28, Math.min(1.18, luminance / 182));
    for (let c = 0; c < 3; c++) pixels[i + c] = seam ? pixels[i + c] : Math.min(255, colors[i + c] * shade);
  }
  g.putImageData(original, 0, 0); rigTextureCache.set(key, cv); return cv;
}

export function drawRealHaori(ctx, kp, ch, light = 1, fit = {}) {
  if (!kp?.ls || !kp?.rs || !kp?.n) return false;
  const body = rigTexture(ch, 'body'), arm = rigTexture(ch, 'sleeve');
  if (!body || !arm) return false;
  const rig = buildHaoriRig(kp, fit);
  if (!rig || rig.unsupported) return false;
  ctx.save();
  ctx.filter = `brightness(${Math.max(.75, Math.min(1.15, light))}) saturate(.97)`;
  for (const sleeve of rig.sleeves.filter((s) => s.z < rig.bodyZ)) drawTextureMesh(ctx, arm, sleeve.point, 5, 10);
  drawTextureMesh(ctx, body, rig.bodyPoint, 8, 14);
  for (const sleeve of rig.sleeves.filter((s) => s.z >= rig.bodyZ)) drawTextureMesh(ctx, arm, sleeve.point, 5, 10);
  ctx.restore();
  return true;
}

// ── 真人相機用的 2D 動畫羽織 ─────────────────────────
// 3D 寬袖在手肘／手腕離開畫面時容易被錯誤骨架拉成球狀。真人模式改用平面剪影：
// 輪廓仍跟著骨架，但尺寸只由肩寬與穩定軀幹比例決定；看不到手臂時就不畫袖子。
export function drawAnimeOutfit(ctx, kp, ch, mode = 'haori', light = 1) {
  if (!kp?.ls || !kp?.rs || !kp?.n) return;
  const { sh, up, side, shoulderW } = frame(kp);
  const S = shoulderW;
  if (!Number.isFinite(S) || S < 24) return;
  const down = mul(up, -1), neck = add(sh, mul(up, S * .08));
  const pt = (base, sx, dy) => add(add(base, mul(side, sx * S)), mul(down, dy * S));
  // 鱗紋縮小，比例更接近原作服裝，也避免手機近拍時看起來像大面積幾何貼紙。
  const tileSize = ch.pattern === 'uroko' ? 58 : 76;
  const pattern = ctx.createPattern(tile(ch.pattern, ch.haori, ch.haori2, tileSize), 'repeat');
  const line = Math.max(3, S * .035);
  const makePath = (pts) => {
    const p = new Path2D(); p.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y);
    p.closePath(); return p;
  };
  const paint = (p, fill, alpha = .9) => {
    ctx.save(); ctx.globalAlpha = alpha; ctx.lineJoin = 'round';
    ctx.filter = `brightness(${Math.max(.78, Math.min(1.14, light))}) saturate(1.08)`;
    ctx.shadowColor = 'rgba(0,0,0,.52)'; ctx.shadowBlur = S * .11; ctx.shadowOffsetY = S * .035;
    ctx.fillStyle = fill; ctx.fill(p); ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#130d0c'; ctx.lineWidth = line; ctx.stroke(p);
    // 同一件衣服內加一層柔和明暗，讓它吃得到現場光而不是平貼紙。
    ctx.filter = 'none'; ctx.clip(p); ctx.globalAlpha = .2;
    const shade = ctx.createLinearGradient(pt(neck, -.65, 0).x, pt(neck, -.65, 0).y, pt(neck, .65, 0).x, pt(neck, .65, 0).y);
    shade.addColorStop(0, 'rgba(0,0,0,.65)'); shade.addColorStop(.42, 'rgba(255,255,255,.28)'); shade.addColorStop(1, 'rgba(0,0,0,.42)');
    ctx.fillStyle = shade; ctx.fillRect(neck.x - S, neck.y - S, S * 2, S * 3); ctx.restore();
  };

  // 僅做上半身的領口與肩披；保留真人原本的衣服、臉和雙手。
  if (mode === 'full') {
    const inner = makePath([pt(neck, -.18, .02), pt(neck, .18, .02), pt(neck, .24, .7), pt(neck, -.24, .7)]);
    paint(inner, ch.inner, .72);
  }

  // 兩片短版肩披以雙肩為錨點；長度只到上腹，自拍不需要全身也能看到完整造型。
  const flare = Math.min(1.2, ch.silhouette?.flare || 1);
  const left = makePath([
    pt(neck, -.035, .02), pt(kp.ls, -.1, .04), pt(neck, -.58 * flare, 1.08), pt(neck, -.1, .98),
  ]);
  const right = makePath([
    pt(neck, .035, .02), pt(kp.rs, .1, .04), pt(neck, .58 * flare, 1.08), pt(neck, .1, .98),
  ]);
  paint(left, pattern); paint(right, pattern);

  // 只畫肩到上臂的短袖片，不覆蓋手掌；手肘不可靠時連袖片也不畫。
  for (const s of ['l', 'r']) {
    const e = kp[s + 'e'], shoulder = kp[s + 's'];
    if (!e || e.v < .58 || shoulder.v < .65) continue;
    const end = lerp(shoulder, e, .62);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = .86; ctx.strokeStyle = '#130d0c'; ctx.lineWidth = S * .25;
    ctx.beginPath(); ctx.moveTo(shoulder.x, shoulder.y); ctx.lineTo(end.x, end.y); ctx.stroke();
    ctx.strokeStyle = pattern; ctx.lineWidth = S * .2; ctx.stroke(); ctx.restore();
  }

  // 動畫式雙層領襟，中心刻意留空，讓真人衣服透出來。
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#140d0b'; ctx.lineWidth = S * .07;
  for (const x of [-.035, .035]) {
    ctx.beginPath(); ctx.moveTo(pt(neck, x, .02).x, pt(neck, x, .02).y); ctx.lineTo(pt(neck, x * 2.2, .92).x, pt(neck, x * 2.2, .92).y); ctx.stroke();
  }
  ctx.strokeStyle = ch.trim; ctx.lineWidth = S * .026;
  for (const x of [-.035, .035]) {
    ctx.beginPath(); ctx.moveTo(pt(neck, x, .02).x, pt(neck, x, .02).y); ctx.lineTo(pt(neck, x * 2.2, .92).x, pt(neck, x * 2.2, .92).y); ctx.stroke();
  }
  ctx.restore();
}
// ── 武器的位置與方向（3D 模型在 render3d.js）──────────
// 依手的位置估刀的方向；招式吻合度越高，越貼近招式預先算好的方向
export function weaponPose(kp, ch, target, matchT, freeHand = null) {
  const { T, up } = frame(kp);
  const handOf = (s) => {
    const w = kp[s + 'w'], i = kp[s + 'i'], p = kp[s + 'p'];
    return i && p && i.v > .3 ? lerp(w, mid(i, p), .55) : w;
  };
  const fore = (s) => norm(sub(kp[s + 'w'], kp[s + 'e']));
  if (freeHand) {
    const out = [{ grip: handOf(freeHand), dir: fore(freeHand), z: kp[freeHand + 'w']?.z ?? 0 }];
    const other = freeHand === 'l' ? 'r' : 'l';
    if ((ch.weapon.kind === 'twin' || ch.offhand) && kp[other + 'w']?.v > .55 && kp[other + 'e']?.v > .55) {
      out.push({ grip: handOf(other), dir: fore(other), z: kp[other + 'w'].z ?? 0 });
    }
    return { T, blades: out };
  }
  const hand = ch.move.hand;
  const both = dist(kp.lw, kp.rw) < T * .45;
  let grip, dir;
  if (!ch.offhand && (both || hand === 'both' && ch.weapon.kind !== 'twin')) {
    grip = mid(handOf('l'), handOf('r'));
    // 雙手握刀：兩手靠很近 → 刀朝上；兩手分開（橫架）→ 刀沿著兩手的連線
    dir = both ? up : norm(sub(kp.rw, kp.lw));
  } else {
    grip = handOf('r');
    dir = fore('r');
  }
  if (target && matchT > 0) {
    const t = norm(V(target[0], target[1]));
    const k = Math.min(1, matchT * matchT * 1.4);
    dir = norm(lerp(dir, t, k));
  }
  const z = (k) => kp[k]?.z ?? 0;
  const out = [{ grip, dir, z: both || hand === 'both' ? (z('lw') + z('rw')) / 2 : z('rw') }];
  if (ch.weapon.kind === 'twin' || ch.offhand) {
    out.push({ grip: handOf('l'), dir: fore('l'), z: z('lw') });
  }
  return { T, blades: out };
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
function pt(kp, k) { return k === 'hip' ? frame(kp).hip : k === 'sh' ? frame(kp).sh : kp[k]; }

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

// 招式框：目標姿勢放到使用者身上的位置（3D 淡影用）＋刀的位置
export function guidePose(kp, ch, res) {
  const { hip, T } = frame(kp);
  const tg = placePose(ch.move.pose, hip, T, res?.flip);
  const blade = ch.move.blade, dir = norm(V(res?.flip ? -blade[0] : blade[0], blade[1]));
  const grip = ch.move.hand === 'both' ? mid(tg.lw, tg.rw) : (res?.flip ? tg.lw : tg.rw);
  return { tg, blades: [{ grip, dir }] };
}
// 招式框的骨架虛線：到位的段落變亮
export function drawGuide(ctx, tg, ch, res, pulse) {
  const { T } = frame(tg);
  ctx.save();
  ctx.setLineDash([T * .08, T * .06]); ctx.lineCap = 'round';
  for (const [a, b] of SEGS) {
    if (a[1] === 'h' || a[1] === 'k') continue; // 手持模式只顯示上半身招式框
    const ok = res?.parts?.[a + b];
    ctx.strokeStyle = ok ? ch.glow : 'rgba(255,255,255,.85)';
    ctx.lineWidth = ok ? T * .05 : T * .03;
    ctx.globalAlpha = ok ? .95 : .55 + .25 * pulse;
    const p = pt(tg, a), q = pt(tg, b);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = .6; ctx.strokeStyle = '#fff'; ctx.lineWidth = T * .025;
  ctx.beginPath(); ctx.arc(tg.n.x, tg.n.y, T * .22, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// ── 鏡頭氛圍：常駐的屬性微粒、色調與動畫式取景暗角 ──────────
export function drawAtmosphere(ctx, W, H, ch, kp, now) {
  const t = now / 1000, T = kp ? frame(kp).T : Math.min(W, H) * .2;
  const center = kp ? mid(frame(kp).hip, frame(kp).sh) : V(W * .5, H * .52);
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.lineCap = 'round';
  for (let i = 0; i < 24; i++) {
    const seed = (i * 73 % 101) / 101, phase = t * (.12 + (i % 5) * .025) + seed * 9;
    const x = (seed * W * 1.4 + Math.sin(phase * 1.7) * T * .45) % (W * 1.15) - W * .06;
    const y = H - ((phase * H * .14 + i * H * .19) % (H * 1.1));
    const a = .08 + (i % 4) * .025;
    if (ch.fx === 'thunder') {
      ctx.strokeStyle = ch.glow; ctx.globalAlpha = a * 1.4; ctx.lineWidth = Math.max(1, T * .012);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + T * .06, y - T * .08); ctx.lineTo(x + T * .01, y - T * .14); ctx.stroke();
    } else if (ch.fx === 'flame' || ch.fx === 'sun') {
      ctx.fillStyle = i % 3 ? ch.tint : ch.glow; ctx.globalAlpha = a * 1.5;
      ctx.beginPath(); ctx.arc(x, y, T * (.012 + (i % 3) * .006), 0, Math.PI * 2); ctx.fill();
    } else if (ch.fx === 'wave') {
      ctx.strokeStyle = ch.glow; ctx.globalAlpha = a; ctx.lineWidth = T * .009;
      ctx.beginPath(); ctx.arc(center.x, center.y, T * (.7 + (i % 8) * .16 + Math.sin(phase) * .05), Math.PI * 1.05, Math.PI * 1.8); ctx.stroke();
    } else {
      ctx.fillStyle = ch.glow; ctx.globalAlpha = a;
      ctx.fillRect(x, y, Math.max(1, T * .012), Math.max(1, T * .012));
    }
  }
  // 人物背後的淡色輪廓光，讓服裝從真實背景裡浮出來。
  const aura = ctx.createRadialGradient(center.x, center.y, T * .25, center.x, center.y, T * 1.75);
  aura.addColorStop(0, ch.tint + '24'); aura.addColorStop(.45, ch.tint + '12'); aura.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = .8; ctx.fillStyle = aura; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

export function drawCinematicFrame(ctx, W, H, ch, finisherT = -1) {
  ctx.save();
  const vignette = ctx.createRadialGradient(W * .5, H * .44, Math.min(W, H) * .22, W * .5, H * .5, Math.max(W, H) * .72);
  vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(.7, 'rgba(0,0,0,.08)'); vignette.addColorStop(1, 'rgba(0,0,0,.58)');
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
  const bars = ctx.createLinearGradient(0, 0, 0, H);
  bars.addColorStop(0, 'rgba(0,0,0,.48)'); bars.addColorStop(.14, 'rgba(0,0,0,0)'); bars.addColorStop(.78, 'rgba(0,0,0,0)'); bars.addColorStop(1, 'rgba(0,0,0,.6)');
  ctx.fillStyle = bars; ctx.fillRect(0, 0, W, H);
  if (finisherT >= 0 && finisherT < .24) {
    ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = (1 - finisherT / .24) * .42;
    ctx.fillStyle = ch.glow; ctx.fillRect(0, 0, W, H);
  }
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
  // 沿刀勢掠過的雙層斬擊弧：外層屬性色、內層白熱高光。
  const ba = Math.atan2(ch.move.blade[1], ch.move.blade[0]);
  ctx.lineCap = 'round'; ctx.lineWidth = T * (.24 - Math.min(.14, t * .08));
  ctx.globalAlpha = Math.min(1, a * 1.6);
  ctx.beginPath(); ctx.arc(c.x, c.y, R * .86, ba - Math.PI * .9, ba + Math.PI * .42); ctx.stroke();
  ctx.strokeStyle = '#fffdf0'; ctx.lineWidth = T * .055; ctx.shadowBlur = 34;
  ctx.beginPath(); ctx.arc(c.x, c.y, R * .82, ba - Math.PI * .86, ba + Math.PI * .38); ctx.stroke();
  ctx.strokeStyle = ch.tint; ctx.fillStyle = ch.glow;
  if (ch.fx === 'flame') {
    for (let i = 0; i < 34; i++) {
      const ang = i / 34 * Math.PI * 2 + t * .35, rr = R * (.72 + (i * 7 % 5) / 11);
      const x = c.x + Math.cos(ang) * rr, y = c.y + Math.sin(ang) * rr - t * T * .8;
      ctx.fillStyle = i % 3 ? ch.tint : ch.glow;
      ctx.beginPath(); ctx.moveTo(x, y - T * .32); ctx.quadraticCurveTo(x + T * .16, y - T * .02, x, y + T * .12); ctx.quadraticCurveTo(x - T * .16, y - T * .02, x, y - T * .32); ctx.fill();
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
    ctx.lineWidth = T * .055; ctx.lineJoin = 'miter';
    for (let j = 0; j < 11; j++) {
      const ang = j / 11 * Math.PI * 2 + 0.3; let x = c.x, y = c.y; ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 1; k <= 7; k++) { const rr = R * k / 7 * 1.45; x = c.x + Math.cos(ang) * rr + ((k * j * 31) % 7 - 3) * T * .07; y = c.y + Math.sin(ang) * rr + ((k * j * 17) % 7 - 3) * T * .07; ctx.lineTo(x, y); }
      ctx.stroke();
      ctx.save(); ctx.strokeStyle = '#fff'; ctx.globalAlpha *= .72; ctx.lineWidth = T * .014; ctx.stroke(); ctx.restore();
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
