/* 手繪風的畫法工具箱
 *
 * 純 canvas，不載任何圖。手繪感不是靠「畫得細」，是靠四件事：
 *
 * 1. 分層與空氣感    遠的東西要淡、要偏冷、要糊；近的才濃、才銳利
 * 2. 一個明確的光源  所有東西的亮面朝同一邊，暗面統一偏冷
 * 3. 邊緣光          物體背光那一側描一條亮邊，人物才會從背景裡跳出來
 * 4. 筆觸與顆粒      大面積不要是純色，疊上低透明度的短筆觸與雜點
 *
 * 扁平色塊少的就是這四件。
 */
window.P = (function () {

  /* 光源：右上方的暖光。整張圖所有的亮暗都照這個方向。 */
  const LIGHT = { x: 0.78, y: -0.62 };

  /* ── 顏色工具 ── */
  function hex(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }
  function rgb(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  /* 提亮／壓暗。手繪的亮面不是單純加白，會往暖色偏；
     暗面也不是加黑，會往冷色（藍紫）偏——這是最容易看出差別的一點。 */
  function lift(h, amt) {
    const c = typeof h === 'string' ? hex(h) : h;
    return [
      Math.min(255, c[0] + 255 * amt * 1.05),
      Math.min(255, c[1] + 255 * amt * 0.92),
      Math.min(255, c[2] + 255 * amt * 0.62)
    ].map(Math.round);
  }
  function deep(h, amt) {
    const c = typeof h === 'string' ? hex(h) : h;
    return [
      Math.max(0, c[0] * (1 - amt) - 6 * amt),
      Math.max(0, c[1] * (1 - amt) + 2 * amt),
      Math.max(0, c[2] * (1 - amt) + 26 * amt)
    ].map(Math.round);
  }
  /* 空氣感：越遠越往天空色靠、越淡 */
  function haze(h, air, skyC) {
    const c = typeof h === 'string' ? hex(h) : h;
    const s = typeof skyC === 'string' ? hex(skyC) : skyC;
    return [0,1,2].map(i => Math.round(c[i] + (s[i] - c[i]) * air));
  }

  /* ── 筆觸 ──
     一堆短的、半透明的、角度略有變化的線。
     疊在大面積上，純色就變成「刷出來的」。 */
  function strokes(ctx, x, y, w, h, color, opt) {
    opt = opt || {};
    const n = opt.n || 90;
    const len = opt.len || 42;
    const ang = opt.angle == null ? -0.35 : opt.angle;
    const a = opt.alpha || 0.05;
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const px = x + Math.random() * w;
      const py = y + Math.random() * h;
      const l = len * (0.4 + Math.random() * 0.9);
      const t = ang + (Math.random() - 0.5) * 0.55;
      ctx.globalAlpha = a * (0.4 + Math.random() * 0.9);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1 + Math.random() * 3.4;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(t) * l, py + Math.sin(t) * l);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* 顆粒：很細的雜點，讓畫面不要像向量圖那樣乾淨 */
  function grain(ctx, x, y, w, h, a) {
    ctx.save();
    for (let i = 0; i < w * h / 900; i++) {
      ctx.globalAlpha = (a || 0.05) * Math.random();
      ctx.fillStyle = Math.random() < 0.5 ? '#000' : '#fff';
      ctx.fillRect(x + Math.random() * w, y + Math.random() * h, 1.6, 1.6);
    }
    ctx.restore();
  }

  /* ── 有機的形狀 ──
     手繪的輪廓不會是完美的圓或矩形，邊緣會晃。
     用固定種子的擾動，這樣每一幀長得一樣、不會閃。 */
  function seed(n) { let a = n >>> 0; return () => {
    a += 0x6D2B79F5; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }; }

  function blob(ctx, cx, cy, rx, ry, sd, wob) {
    const r = seed(sd);
    const n = 16;
    wob = wob == null ? 0.06 : wob;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2;
      const k = 1 + (r() - 0.5) * wob * 2;
      const px = cx + Math.cos(a) * rx * k;
      const py = cy + Math.sin(a) * ry * k;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  /* ── 一個「被打光的形體」──
     手繪人物的核心就這三步：底色（暗面）→ 亮面 →背光的邊緣光。
     照同一個光源做，整張圖才會像同一個世界。 */
  function litBlob(ctx, cx, cy, rx, ry, base, sd, opt) {
    opt = opt || {};
    const c = typeof base === 'string' ? hex(base) : base;

    // 1. 底：暗面
    ctx.fillStyle = rgb(deep(c, 0.34));
    blob(ctx, cx, cy, rx, ry, sd, opt.wob);
    ctx.fill();

    // 2. 亮面：往光源方向縮一圈，用漸層讓交界是軟的
    const gx = cx + LIGHT.x * rx * 0.42, gy = cy + LIGHT.y * ry * 0.42;
    const g = ctx.createRadialGradient(gx, gy, Math.min(rx, ry) * 0.12,
                                       cx, cy, Math.max(rx, ry) * 1.12);
    g.addColorStop(0, rgb(lift(c, 0.26)));
    g.addColorStop(0.42, rgb(c));
    g.addColorStop(1, rgba(deep(c, 0.5), 0));
    ctx.fillStyle = g;
    blob(ctx, cx, cy, rx, ry, sd, opt.wob);
    ctx.fill();

    // 3. 邊緣光：背光那一側一道亮邊
    if (opt.rim !== false) {
      ctx.save();
      blob(ctx, cx, cy, rx, ry, sd, opt.wob);
      ctx.clip();
      const rg = ctx.createRadialGradient(
        cx - LIGHT.x * rx * 1.05, cy - LIGHT.y * ry * 1.05, Math.min(rx, ry) * 0.2,
        cx - LIGHT.x * rx * 1.05, cy - LIGHT.y * ry * 1.05, Math.max(rx, ry) * 0.95);
      rg.addColorStop(0, rgba(opt.rimColor ? hex(opt.rimColor) : [190, 214, 255], opt.rimA || 0.5));
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(cx - rx * 1.6, cy - ry * 1.6, rx * 3.2, ry * 3.2);
      ctx.restore();
    }
  }

  /* 落地的影子：軟、偏冷、離地越遠越淡越大 */
  function shadow(ctx, cx, cy, rx, ry, a) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
    g.addColorStop(0, 'rgba(16,22,44,' + (a || 0.5) + ')');
    g.addColorStop(0.55, 'rgba(16,22,44,' + (a || 0.5) * 0.45 + ')');
    g.addColorStop(1, 'rgba(16,22,44,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(1, ry / Math.max(rx, ry));
    ctx.beginPath(); ctx.arc(0, 0, Math.max(rx, ry), 0, 6.3); ctx.fill();
    ctx.restore();
  }

  /* 布料：幾道折痕就夠了，不用畫滿 */
  function cloth(ctx, pts, base, sd) {
    const c = typeof base === 'string' ? hex(base) : base;
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.closePath();
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    const y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    const g = ctx.createLinearGradient(x1, y0, x0, y1);
    g.addColorStop(0, rgb(lift(c, 0.22)));
    g.addColorStop(0.5, rgb(c));
    g.addColorStop(1, rgb(deep(c, 0.42)));
    ctx.fillStyle = g;
    ctx.fill();
    // 折痕
    ctx.save();
    ctx.clip();
    const r = seed(sd);
    for (let i = 0; i < 4; i++) {
      ctx.globalAlpha = 0.16 + r() * 0.16;
      ctx.strokeStyle = rgb(deep(c, 0.55));
      ctx.lineWidth = 1 + r() * 2;
      const yy = y0 + (y1 - y0) * (0.2 + r() * 0.7);
      ctx.beginPath();
      ctx.moveTo(x0, yy);
      ctx.quadraticCurveTo((x0 + x1) / 2, yy + (r() - 0.5) * 14, x1, yy + (r() - 0.5) * 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  return { LIGHT, hex, rgb, rgba, lift, deep, haze, strokes, grain, blob, litBlob, shadow, cloth, seed };
})();
