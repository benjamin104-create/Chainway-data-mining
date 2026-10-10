// AR 互動層：讓神明和畫面「回應」使用者，而不只是一張貼上去的圖
//   靈光：二十幾顆發光的小靈體繞著神明飄。手揮過去會被撥開，張開手掌會聚到掌心
//   神力：姿勢成功時，一道光流從神明的臉飛向你的手或臉，神明同時「發功」放大、發光
//   點神明：神明跳一下、換一句話
// 全部在手機上算，畫面不會上傳。

const N = 26;
const A = {
  orbs: [], lastT: 0, prevHands: [],
  power: null,          // { t0, from:[x,y], to:[x,y], col }
  tap: 0,               // 最後一次點神明的時間
  tapLine: null,
};
export const arState = A;

const lerp = (a, b, k) => a + (b - a) * k;
const rnd = (a, b) => a + Math.random() * (b - a);

function seed(W, H, god) {
  const cx = god ? god.x : W / 2, cy = god ? god.y + god.sh * .3 : H * .35, r = god ? god.sw * .5 : W * .3;
  A.orbs = Array.from({ length: N }, (_, i) => {
    const an = Math.random() * Math.PI * 2, d = r * rnd(.4, 1.1);
    return { x: cx + Math.cos(an) * d, y: cy + Math.sin(an) * d * 1.3, vx: 0, vy: 0, r: rnd(.5, 1.3), ph: Math.random() * 7, orbit: rnd(.5, 1.15), dir: i % 2 ? 1 : -1 };
  });
}

// 神力：姿勢成功時呼叫（poses.js 會通知）
export function powerUp(to, col, t) {
  const g = A.god; if (!g) return;
  A.power = { t0: t, from: [g.x, g.y + g.sh * .22], to, col };
}
// 點畫面：點到神明就回應，回傳 true
export function tapAt(x, y, t, lines) {
  const g = A.god; if (!g) return false;
  if (x < g.x - g.sw * .45 || x > g.x + g.sw * .45 || y < g.y || y > g.y + g.sh * .8) return false;
  A.tap = t; A.tapLine = lines[Math.floor(Math.random() * lines.length)];
  for (const o of A.orbs) { const an = Math.random() * 7; o.vx += Math.cos(an) * 600; o.vy += Math.sin(an) * 600 - 300; }
  return true;
}
// 神明的動作：被點時跳一下、發功時放大（app.js 畫神明時套用）
export function godMotion(t, u) {
  const k = Math.max(0, 1 - (t - A.tap) / .7), jump = -Math.sin(Math.min(1, (t - A.tap) / .7) * Math.PI) * 6 * u * (k > 0 ? 1 : 0);
  const p = A.power ? Math.max(0, 1 - (t - A.power.t0) / 1.4) : 0;
  return { dy: jump, scale: 1 + p * .06 + (k > 0 ? Math.sin(k * Math.PI) * .03 : 0), glow: p };
}

// 每一格：更新靈光、畫光流
export function drawAR(ctx, W, H, u, t, hands, god, glow, palmOf, isOpen) {
  A.god = god;
  const dt = Math.min(.05, Math.max(0, t - (A.lastT || t))); A.lastT = t;
  if (!A.orbs.length) seed(W, H, god);
  const cx = god ? god.x : W / 2, cy = god ? god.y + god.sh * .3 : H * .35, R = god ? god.sw * .48 : W * .3;

  // 手：每隻手的掌心、食指尖和移動速度
  const hs = hands.map((h, i) => {
    const c = palmOf(h), tip = [h[8].x * W, h[8].y * H], prev = A.prevHands[i];
    return { c, tip, open: isOpen(h), v: prev ? [(c[0] - prev[0]) / Math.max(dt, .016), (c[1] - prev[1]) / Math.max(dt, .016)] : [0, 0] };
  });
  A.prevHands = hs.map((h) => h.c);
  const openHand = hs.find((h) => h.open);

  for (const o of A.orbs) {
    let tx, ty;
    if (openHand) {                                      // 張開手掌：聚到掌心上方繞小圈
      const an = t * 2.4 * o.dir + o.ph;
      tx = openHand.c[0] + Math.cos(an) * u * 9 * o.orbit; ty = openHand.c[1] - u * 8 + Math.sin(an) * u * 5 * o.orbit;
    } else {                                             // 平常：繞著神明慢慢飄
      const an = t * .35 * o.dir + o.ph;
      tx = cx + Math.cos(an) * R * o.orbit; ty = cy + Math.sin(an * 1.3) * R * 1.2 * o.orbit;
    }
    o.vx += (tx - o.x) * (openHand ? 6 : 1.2) * dt; o.vy += (ty - o.y) * (openHand ? 6 : 1.2) * dt;
    for (const h of hs) {                                // 手揮過去：把靈光撥開
      for (const p of [h.c, h.tip]) {
        const dx = o.x - p[0], dy = o.y - p[1], d = Math.hypot(dx, dy), rr = u * 12;
        const sp = Math.hypot(h.v[0], h.v[1]);
        if (d < rr && sp > W * .3 && !h.open) { o.vx += dx / d * sp * .9 + h.v[0] * .4; o.vy += dy / d * sp * .9 + h.v[1] * .4; }
      }
    }
    o.vx *= Math.pow(.15, dt); o.vy *= Math.pow(.15, dt);
    o.x += o.vx * dt; o.y += o.vy * dt;
  }

  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const o of A.orbs) {
    const tw = .6 + .4 * Math.sin(t * 3 + o.ph), r = u * .7 * o.r * (openHand ? 1.2 : 1);
    const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r * 4);
    g.addColorStop(0, `rgba(255,255,255,${tw})`); g.addColorStop(.12, `rgba(255,255,255,${.8 * tw})`); g.addColorStop(.3, hexA(glow, .45 * tw)); g.addColorStop(1, hexA(glow, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, r * 4, 0, 7); ctx.fill();
    // 拖尾：移動越快拖得越長
    const sp = Math.hypot(o.vx, o.vy);
    if (sp > 40) { ctx.strokeStyle = hexA(glow, .5 * tw); ctx.lineWidth = r * .9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x - o.vx * .06, o.y - o.vy * .06); ctx.stroke(); }
  }
  // 神力光流：從神明飛向使用者
  const pw = A.power;
  if (pw) {
    const age = t - pw.t0;
    if (age > 1.4) A.power = null;
    else {
      const [x0, y0] = pw.from, [x1, y1] = pw.to, mx = (x0 + x1) / 2, my = Math.min(y0, y1) - H * .12;
      const head = Math.min(1, age / .55);
      for (let i = 0; i < 40; i++) {
        const k = head - i * .018; if (k < 0) break;
        const x = (1 - k) * (1 - k) * x0 + 2 * (1 - k) * k * mx + k * k * x1, y = (1 - k) * (1 - k) * y0 + 2 * (1 - k) * k * my + k * k * y1;
        const fade = (1 - i / 40) * Math.max(0, 1 - Math.max(0, age - .9) / .5);
        const r = u * (2.6 - i * .05) * (1 + .3 * Math.sin(t * 20 + i));
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
        g.addColorStop(0, `rgba(255,255,255,${.35 * fade})`); g.addColorStop(.4, hexA(pw.col || glow, .25 * fade)); g.addColorStop(1, hexA(pw.col || glow, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.5, 0, 7); ctx.fill();
      }
      if (age > .5 && age < 1.1) {                       // 打中的瞬間：衝擊光環
        const k = (age - .5) / .6;
        ctx.strokeStyle = hexA(pw.col || glow, (1 - k) * .9); ctx.lineWidth = u * 1.2 * (1 - k);
        ctx.beginPath(); ctx.arc(x1, y1, u * (4 + k * 22), 0, 7); ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function hexA(c, a) {
  if (c.startsWith('#') && c.length === 7) return `rgba(${parseInt(c.slice(1, 3), 16)},${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)},${a})`;
  return `rgba(200,230,255,${a})`;
}
