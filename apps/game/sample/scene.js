/* 樣本場景：一張戰鬥畫面，三塊（角色／場景／介面）都照新風格畫一次 */
(function () {
  const W = 960, H = 620;

  /* 特洛伊那一章的配色，但整個往「有空氣、有光」的方向重配。
     天空是暖的，地面在陰影裡偏冷，這樣冷暖才有對比。 */
  const SKY_TOP = '#1B2A4A';
  const SKY_MID = '#4A4668';
  const SKY_LOW = '#C87A4E';
  const FAR     = '#3E4468';
  const MID     = '#3A4257';
  const NEAR    = '#2A3040';
  const ROAD    = '#8A7A5E';

  function sky(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.62);
    g.addColorStop(0, SKY_TOP);
    g.addColorStop(0.55, SKY_MID);
    g.addColorStop(1, SKY_LOW);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 太陽附近的光暈：光源在右上，整張圖的亮暗都照這個
    const sx = W * 0.78, sy = H * 0.20;
    const gl = ctx.createRadialGradient(sx, sy, 0, sx, sy, H * 0.72);
    gl.addColorStop(0, 'rgba(255,214,150,0.55)');
    gl.addColorStop(0.35, 'rgba(255,180,110,0.16)');
    gl.addColorStop(1, 'rgba(255,170,100,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(0, 0, W, H);

    // 雲：用低透明度的軟團，不畫輪廓
    const r = P.seed(7);
    for (let i = 0; i < 14; i++) {
      const cx = r() * W, cy = H * (0.06 + r() * 0.34);
      const rx = 60 + r() * 150, ry = 12 + r() * 26;
      const warm = cy > H * 0.22;
      ctx.globalAlpha = 0.10 + r() * 0.16;
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
      cg.addColorStop(0, warm ? 'rgba(255,206,164,0.9)' : 'rgba(190,200,230,0.8)');
      cg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = cg;
      ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ry / rx);
      ctx.beginPath(); ctx.arc(0, 0, rx, 0, 6.3); ctx.fill(); ctx.restore();
    }
    ctx.globalAlpha = 1;
    P.strokes(ctx, 0, 0, W, H * 0.5, 'rgba(255,220,180,0.5)', { n: 70, len: 90, angle: -0.06, alpha: 0.03 });
  }

  /* 遠山：越遠越淡、越偏天空色、輪廓越糊。這是空氣感的來源。 */
  function ridge(ctx, baseY, amp, color, air, sd, blurA) {
    const r = P.seed(sd);
    const c = P.haze(color, air, SKY_MID);
    ctx.beginPath();
    ctx.moveTo(-10, H);
    ctx.lineTo(-10, baseY);
    let y = baseY;
    for (let x = -10; x <= W + 10; x += 26) {
      y += (r() - 0.5) * amp;
      y = Math.max(baseY - amp * 2.4, Math.min(baseY + amp * 1.6, y));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W + 10, H);
    ctx.closePath();
    ctx.fillStyle = P.rgb(c);
    ctx.fill();
    // 山脊被光照到的那一面
    ctx.save(); ctx.clip();
    const g = ctx.createLinearGradient(W, baseY - amp * 2, W * 0.2, baseY + amp * 3);
    g.addColorStop(0, P.rgba(P.lift(c, 0.20), 0.75));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 越遠越糊：疊一層天空色的霧
    ctx.fillStyle = P.rgba(P.hex(SKY_MID), blurA);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function ground(ctx) {
    const horizon = H * 0.52;
    const g = ctx.createLinearGradient(0, horizon, 0, H);
    g.addColorStop(0, P.rgb(P.haze(MID, 0.35, SKY_LOW)));
    g.addColorStop(0.35, MID);
    g.addColorStop(1, NEAR);
    ctx.fillStyle = g;
    ctx.fillRect(0, horizon, W, H - horizon);

    // 地面的筆觸：往消失點聚，做出平面的方向感
    P.strokes(ctx, 0, horizon, W, H - horizon, P.rgb(P.lift(MID, 0.18)),
              { n: 220, len: 60, angle: 0.10, alpha: 0.05 });
    P.strokes(ctx, 0, horizon + 60, W, H - horizon - 60, P.rgb(P.deep(NEAR, 0.4)),
              { n: 160, len: 80, angle: -0.06, alpha: 0.06 });

    // 草叢：幾撮深色的剪影，近的大、遠的小
    const r = P.seed(21);
    for (let i = 0; i < 90; i++) {
      const t = r();
      const y = horizon + 8 + Math.pow(t, 1.7) * (H - horizon - 10);
      const x = r() * W;
      const s = 3 + (y - horizon) / (H - horizon) * 16;
      ctx.globalAlpha = 0.28 + r() * 0.4;
      ctx.strokeStyle = P.rgb(P.deep(NEAR, 0.45));
      ctx.lineWidth = 1.4 + r() * 1.6;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(x + k * s * 0.28, y);
        ctx.quadraticCurveTo(x + k * s * 0.5, y - s * 0.7, x + k * s * 0.9 + (r() - 0.5) * 4, y - s);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* 石板路
     第一版畫壞了：石板一排一排橫著鋪、明度又平均，看起來像一面磚牆而不是一條路。
     問題在「沒有跟著透視收」——每一排的石板要剛好佔滿那個深度的路寬，
     而且近的排要厚、遠的排要薄，明度也要拉開。 */
  function road(ctx) {
    const top = H * 0.585, bot = H + 40;
    // 路在某個深度的左右邊界（跟下面填色用的梯形同一組數字）
    const edgeL = t => W * 0.335 + (W * 0.02 - W * 0.335) * t;
    const edgeR = t => W * 0.665 + (W * 1.02 - W * 0.665) * t;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(edgeL(0), top); ctx.lineTo(edgeR(0), top);
    ctx.lineTo(edgeR(1), bot); ctx.lineTo(edgeL(1), bot);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, P.rgb(P.haze(ROAD, 0.50, SKY_LOW)));
    g.addColorStop(0.35, P.rgb(P.deep(ROAD, 0.30)));
    g.addColorStop(1, P.rgb(P.deep(ROAD, 0.46)));
    ctx.fillStyle = g; ctx.fill();
    ctx.clip();

    const r = P.seed(33);
    let y = top, row = 0;
    while (y < bot) {
      const t = (y - top) / (bot - top);
      const hgt = 5 + Math.pow(t, 1.55) * 92;        // 近的排厚、遠的排薄
      const L = edgeL(t), R = edgeR(t);
      const t2 = Math.min(1, (y + hgt - top) / (bot - top));
      const L2 = edgeL(t2), R2 = edgeR(t2);
      const cols = 5;
      for (let i = 0; i < cols; i++) {
        const a0 = (i + (row % 2) * 0.5) / cols, a1 = (i + 1 + (row % 2) * 0.5) / cols;
        const x0 = L + (R - L) * a0, x1 = L + (R - L) * a1;
        const x2 = L2 + (R2 - L2) * a1, x3 = L2 + (R2 - L2) * a0;
        const tone = r();
        // 中間亮、兩邊暗，路面才有弧度
        const mid = Math.abs((a0 + a1) / 2 - 0.5) * 2;
        const c = P.lift(P.deep(ROAD, 0.22 + mid * 0.26 + tone * 0.20), (1 - mid) * 0.10);
        ctx.beginPath();
        ctx.moveTo(x0 + (r() - 0.5) * 4, y);
        ctx.lineTo(x1 + (r() - 0.5) * 4, y);
        ctx.lineTo(x2 + (r() - 0.5) * 5, y + hgt);
        ctx.lineTo(x3 + (r() - 0.5) * 5, y + hgt);
        ctx.closePath();
        ctx.fillStyle = P.rgb(c);
        ctx.fill();
        // 迎光的上緣
        if (hgt > 10) {
          ctx.strokeStyle = P.rgba(P.lift(c, 0.34), 0.45);
          ctx.lineWidth = Math.max(1, hgt * 0.055);
          ctx.beginPath(); ctx.moveTo(x0, y + 1); ctx.lineTo(x1, y + 1); ctx.stroke();
        }
        // 裂縫
        if (hgt > 26 && r() < 0.30) {
          ctx.strokeStyle = P.rgba(P.deep(c, 0.6), 0.55);
          ctx.lineWidth = 1.2;
          const cx = x0 + (x1 - x0) * (0.2 + r() * 0.6);
          ctx.beginPath();
          ctx.moveTo(cx, y + hgt * 0.15);
          ctx.lineTo(cx + (r() - 0.5) * 18, y + hgt * 0.55);
          ctx.lineTo(cx + (r() - 0.5) * 24, y + hgt * 0.9);
          ctx.stroke();
        }
      }
      y += hgt;
      row++;
    }
    // 磨損與青苔
    P.strokes(ctx, 0, top, W, bot - top, 'rgba(118,146,88,0.9)', { n: 110, len: 30, angle: 0.22, alpha: 0.055 });
    P.strokes(ctx, 0, top, W, bot - top, 'rgba(18,22,34,0.9)', { n: 150, len: 54, angle: 0.10, alpha: 0.05 });
    // 路兩側壓暗，中間留亮，視線才會被帶到路上
    const vg = ctx.createLinearGradient(0, 0, W, 0);
    vg.addColorStop(0, 'rgba(12,16,30,0.55)');
    vg.addColorStop(0.5, 'rgba(12,16,30,0)');
    vg.addColorStop(1, 'rgba(12,16,30,0.55)');
    ctx.fillStyle = vg; ctx.fillRect(0, top, W, bot - top);
    ctx.restore();

    // 邊緣的草蓋過石板，不要留一條死板的直線
    ctx.save();
    const rr = P.seed(44);
    for (let i = 0; i < 200; i++) {
      const t = Math.pow(rr(), 0.8);
      const yy = top + t * (bot - top);
      const s = 4 + t * 26;
      [edgeL(t), edgeR(t)].forEach(x => {
        ctx.globalAlpha = 0.45 + rr() * 0.45;
        ctx.strokeStyle = P.rgb(P.deep(NEAR, 0.30 + rr() * 0.2));
        ctx.lineWidth = 1.4 + rr() * 2.2;
        ctx.beginPath();
        ctx.moveTo(x + (rr() - 0.5) * 16, yy);
        ctx.quadraticCurveTo(x, yy - s * 0.7, x + (rr() - 0.5) * 14, yy - s);
        ctx.stroke();
      });
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* 地面上的東西：碎石、殘垣。空蕩蕩的平面看起來很廉價。 */
  function debris(ctx) {
    const horizon = H * 0.52;
    const r = P.seed(66);
    for (let i = 0; i < 34; i++) {
      const t = Math.pow(r(), 1.5);
      const y = horizon + 14 + t * (H - horizon - 20);
      const side = r() < 0.5 ? -1 : 1;
      const x = W * 0.5 + side * (W * 0.20 + r() * W * 0.34) * (0.5 + t);
      if (x < -40 || x > W + 40) continue;
      const s = 4 + t * 26;
      /* 石頭要壓暗、要貼地。第一版亮度給太高，散在地上像一顆顆白蘑菇。 */
      P.shadow(ctx, x, y + s * 0.16, s * 1.3, s * 0.30, 0.55);
      P.litBlob(ctx, x, y - s * 0.22, s * (0.7 + r() * 0.5), s * (0.34 + r() * 0.3),
                '#3C4150', 400 + i, { rimA: 0.12, wob: 0.2 });
    }
    /* 遠處的斷柱。第一版是幾個浮在半空的米色方塊——
       沒有影子、沒有底座、也沒有吃到遠方的霧，所以看起來不在地上。 */
    for (let i = 0; i < 6; i++) {
      const x = W * (0.04 + r() * 0.92), y = horizon + 16 + r() * 36;
      const hh = 22 + r() * 40, ww = 8 + r() * 8;
      const air = 0.52 + r() * 0.2;
      const c = P.haze('#5E5A54', air, SKY_LOW);
      P.shadow(ctx, x + ww * 0.5, y, ww * 2.4, ww * 0.6, 0.42);
      // 柱身
      const g2 = ctx.createLinearGradient(x + ww / 2, y - hh, x - ww / 2, y);
      g2.addColorStop(0, P.rgb(P.lift(c, 0.18)));
      g2.addColorStop(1, P.rgb(P.deep(c, 0.32)));
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.moveTo(x - ww / 2, y);
      ctx.lineTo(x - ww / 2 + 1, y - hh + (r() - 0.5) * 6);
      ctx.lineTo(x + ww / 2 - 1, y - hh + (r() - 0.5) * 6);
      ctx.lineTo(x + ww / 2, y);
      ctx.closePath(); ctx.fill();
      // 底座
      ctx.fillStyle = P.rgb(P.deep(c, 0.42));
      ctx.fillRect(x - ww * 0.8, y - 3, ww * 1.6, 4);
    }
  }

  /* ══ 角色：主角 ══
     手繪人物 = 剪影對 ＋ 明確的光 ＋ 邊緣光 ＋ 幾筆細節。
     不是「圓形加兩顆眼睛」。 */
  function hero(ctx, x, y, s) {
    const skin = '#E8874A';
    P.shadow(ctx, x + 6, y + 4, s * 1.05, s * 0.34, 0.55);

    // 披風（在身體後面）
    P.cloth(ctx, [
      [x - s * 0.28, y - s * 1.42],
      [x - s * 0.95, y - s * 0.55],
      [x - s * 0.80, y + s * 0.10],
      [x - s * 0.20, y - s * 0.35]
    ], '#8E3B32', 5);

    // 腿
    P.litBlob(ctx, x - s * 0.28, y - s * 0.22, s * 0.20, s * 0.34, '#6B4A33', 11, { rimA: 0.22 });
    P.litBlob(ctx, x + s * 0.20, y - s * 0.20, s * 0.20, s * 0.34, '#5C3E2B', 12, { rimA: 0.22 });
    // 靴
    P.litBlob(ctx, x - s * 0.30, y + s * 0.02, s * 0.24, s * 0.16, '#3A2A1E', 13, { rimA: 0.2 });
    P.litBlob(ctx, x + s * 0.22, y + s * 0.04, s * 0.24, s * 0.16, '#33241A', 14, { rimA: 0.2 });

    // 身體
    P.litBlob(ctx, x, y - s * 0.72, s * 0.56, s * 0.60, skin, 2, { wob: 0.05 });
    // 皮甲：在身體上疊一層，只蓋下半，留出脖子
    P.cloth(ctx, [
      [x - s * 0.52, y - s * 0.74],
      [x + s * 0.52, y - s * 0.74],
      [x + s * 0.44, y - s * 0.18],
      [x - s * 0.44, y - s * 0.18]
    ], '#6E5230', 6);
    // 肩甲
    P.litBlob(ctx, x - s * 0.52, y - s * 0.92, s * 0.26, s * 0.20, '#9A7A44', 7, { rimA: 0.55 });
    P.litBlob(ctx, x + s * 0.52, y - s * 0.94, s * 0.26, s * 0.20, '#A8874C', 8, { rimA: 0.6 });
    // 腰帶
    ctx.fillStyle = 'rgba(52,36,22,0.85)';
    ctx.fillRect(x - s * 0.48, y - s * 0.30, s * 0.96, s * 0.10);
    ctx.fillStyle = 'rgba(200,160,86,0.9)';
    ctx.fillRect(x - s * 0.10, y - s * 0.32, s * 0.20, s * 0.14);

    // 頭
    P.litBlob(ctx, x + s * 0.04, y - s * 1.42, s * 0.40, s * 0.40, skin, 3, { wob: 0.04 });
    // 頭盔
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x + s * 0.04, y - s * 1.48, s * 0.44, s * 0.40, 0, Math.PI, 0);
    ctx.closePath();
    const hg = ctx.createLinearGradient(x + s * 0.4, y - s * 1.9, x - s * 0.4, y - s * 1.2);
    hg.addColorStop(0, '#D8B978'); hg.addColorStop(0.5, '#9C7C42'); hg.addColorStop(1, '#4E3C1E');
    ctx.fillStyle = hg; ctx.fill();
    ctx.restore();
    // 盔緣
    ctx.fillStyle = '#6E5528';
    ctx.fillRect(x - s * 0.42, y - s * 1.50, s * 0.92, s * 0.09);
    ctx.fillStyle = 'rgba(240,214,150,0.7)';
    ctx.fillRect(x - s * 0.42, y - s * 1.50, s * 0.92, s * 0.03);
    // 紅纓
    P.cloth(ctx, [
      [x - s * 0.04, y - s * 1.92],
      [x + s * 0.10, y - s * 1.92],
      [x + s * 0.30, y - s * 1.40],
      [x + s * 0.14, y - s * 1.46]
    ], '#B43A2E', 9);

    // 眼睛：手繪只要一點點暗示就夠
    ctx.fillStyle = 'rgba(28,20,16,0.92)';
    ctx.beginPath(); ctx.ellipse(x - s * 0.10, y - s * 1.36, s * 0.055, s * 0.075, 0, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + s * 0.19, y - s * 1.36, s * 0.055, s * 0.075, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = 'rgba(255,245,225,0.85)';
    ctx.beginPath(); ctx.arc(x - s * 0.085, y - s * 1.385, s * 0.02, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.arc(x + s * 0.205, y - s * 1.385, s * 0.02, 0, 6.3); ctx.fill();

    // 盾（背光側）
    ctx.save();
    ctx.translate(x - s * 0.86, y - s * 0.78);
    ctx.rotate(-0.12);
    P.litBlob(ctx, 0, 0, s * 0.34, s * 0.50, '#7E8490', 15, { rimColor: '#BFD4FF', rimA: 0.55 });
    ctx.strokeStyle = 'rgba(198,166,96,0.8)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.26, s * 0.40, 0, 0, 6.3); ctx.stroke();
    P.litBlob(ctx, 0, 0, s * 0.11, s * 0.13, '#C8A05E', 16, { rim: false });
    ctx.restore();

    // 劍：金屬要有一條銳利的高光
    ctx.save();
    ctx.translate(x + s * 0.72, y - s * 0.92);
    ctx.rotate(-0.62);
    const bl = ctx.createLinearGradient(-s * 0.08, 0, s * 0.08, 0);
    bl.addColorStop(0, '#6B7280'); bl.addColorStop(0.42, '#E8EEF8');
    bl.addColorStop(0.55, '#FFFFFF'); bl.addColorStop(1, '#8A94A4');
    ctx.fillStyle = bl;
    ctx.beginPath();
    ctx.moveTo(-s * 0.07, s * 0.2); ctx.lineTo(s * 0.07, s * 0.2);
    ctx.lineTo(s * 0.045, -s * 1.15); ctx.lineTo(0, -s * 1.34);
    ctx.lineTo(-s * 0.045, -s * 1.15);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8A6A3A';
    ctx.fillRect(-s * 0.22, s * 0.16, s * 0.44, s * 0.09);
    ctx.fillStyle = '#4A3520';
    ctx.fillRect(-s * 0.06, s * 0.24, s * 0.12, s * 0.30);
    ctx.restore();
  }

  /* ══ 角色：敵方小兵 ══ 造型要跟主角明顯不同 */
  function grunt(ctx, x, y, s, sd) {
    P.shadow(ctx, x + 4, y + 3, s * 0.9, s * 0.28, 0.5);
    // 腿
    P.litBlob(ctx, x - s * 0.22, y - s * 0.18, s * 0.17, s * 0.28, '#3E4A52', sd + 1, { rimA: 0.2 });
    P.litBlob(ctx, x + s * 0.18, y - s * 0.16, s * 0.17, s * 0.28, '#36424A', sd + 2, { rimA: 0.2 });
    // 駝背的身體
    P.litBlob(ctx, x, y - s * 0.62, s * 0.48, s * 0.50, '#55707A', sd, { wob: 0.09 });
    // 破布
    P.cloth(ctx, [
      [x - s * 0.44, y - s * 0.66],
      [x + s * 0.44, y - s * 0.70],
      [x + s * 0.30, y - s * 0.12],
      [x - s * 0.34, y - s * 0.16]
    ], '#46353C', sd + 3);
    // 頭：小、前傾
    P.litBlob(ctx, x + s * 0.10, y - s * 1.12, s * 0.30, s * 0.28, '#5E7A84', sd + 4, { wob: 0.1 });
    ctx.fillStyle = 'rgba(255,190,90,0.95)';
    ctx.beginPath(); ctx.ellipse(x + s * 0.04, y - s * 1.12, s * 0.05, s * 0.035, 0, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + s * 0.22, y - s * 1.13, s * 0.05, s * 0.035, 0, 0, 6.3); ctx.fill();
    // 粗矛
    ctx.save();
    ctx.translate(x - s * 0.56, y - s * 0.72); ctx.rotate(0.34);
    ctx.fillStyle = '#5A4630';
    ctx.fillRect(-s * 0.045, -s * 0.9, s * 0.09, s * 1.7);
    ctx.fillStyle = '#C3CBD6';
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.26); ctx.lineTo(s * 0.11, -s * 0.86);
    ctx.lineTo(-s * 0.11, -s * 0.86); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* ══ 場景：哨塔 ══ */
  function tower(ctx, x, y, s) {
    P.shadow(ctx, x + s * 0.2, y + s * 0.06, s * 1.1, s * 0.3, 0.55);
    const stone = '#6E6A62';
    // 塔身：上窄下寬
    ctx.beginPath();
    ctx.moveTo(x - s * 0.62, y);
    ctx.lineTo(x - s * 0.48, y - s * 2.4);
    ctx.lineTo(x + s * 0.48, y - s * 2.4);
    ctx.lineTo(x + s * 0.62, y);
    ctx.closePath();
    const g = ctx.createLinearGradient(x + s * 0.6, y - s * 2.4, x - s * 0.6, y);
    g.addColorStop(0, P.rgb(P.lift(stone, 0.26)));
    g.addColorStop(0.45, stone);
    g.addColorStop(1, P.rgb(P.deep(stone, 0.48)));
    ctx.fillStyle = g; ctx.fill();

    // 石塊紋理
    ctx.save(); ctx.clip();
    const r = P.seed(91);
    for (let yy = y - s * 2.36; yy < y; yy += s * 0.21) {
      for (let i = -3; i <= 3; i++) {
        const bw = s * 0.30, bx = x + i * bw + (r() - 0.5) * 6;
        ctx.globalAlpha = 0.10 + r() * 0.22;
        ctx.fillStyle = r() < 0.5 ? P.rgb(P.lift(stone, 0.2)) : P.rgb(P.deep(stone, 0.35));
        ctx.fillRect(bx, yy, bw - 2, s * 0.19);
      }
    }
    ctx.globalAlpha = 1;
    P.strokes(ctx, x - s, y - s * 2.5, s * 2, s * 2.5, 'rgba(110,140,86,0.9)', { n: 40, len: 20, angle: 1.4, alpha: 0.06 });
    ctx.restore();

    // 雉堞
    ctx.fillStyle = P.rgb(P.deep(stone, 0.2));
    ctx.fillRect(x - s * 0.66, y - s * 2.62, s * 1.32, s * 0.24);
    ctx.fillStyle = P.rgb(P.lift(stone, 0.18));
    ctx.fillRect(x - s * 0.66, y - s * 2.62, s * 1.32, s * 0.06);
    for (let i = -2; i <= 2; i++) {
      ctx.fillStyle = P.rgb(P.deep(stone, 0.1));
      ctx.fillRect(x + i * s * 0.27 - s * 0.09, y - s * 2.80, s * 0.18, s * 0.20);
    }
    // 窗：裡面有火光
    const wy = y - s * 1.5;
    ctx.fillStyle = '#140F0A';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.13, wy + s * 0.2); ctx.lineTo(x - s * 0.13, wy - s * 0.06);
    ctx.quadraticCurveTo(x, wy - s * 0.3, x + s * 0.13, wy - s * 0.06);
    ctx.lineTo(x + s * 0.13, wy + s * 0.2); ctx.closePath(); ctx.fill();
    const fg = ctx.createRadialGradient(x, wy + s * 0.08, 0, x, wy + s * 0.08, s * 0.5);
    fg.addColorStop(0, 'rgba(255,190,110,0.85)');
    fg.addColorStop(1, 'rgba(255,160,80,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(x - s * 0.6, wy - s * 0.5, s * 1.2, s * 1.1);
    // 旗
    P.cloth(ctx, [
      [x + s * 0.48, y - s * 2.56],
      [x + s * 1.08, y - s * 2.40],
      [x + s * 1.02, y - s * 2.02],
      [x + s * 0.48, y - s * 2.10]
    ], '#9C3A34', 77);
  }

  /* ══ 前景：壓暗的剪影，做出景深 ══ */
  function foreground(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(12,16,28,0.92)';
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, H - 60);
    const r = P.seed(55);
    for (let x = 0; x <= 260; x += 20) {
      ctx.lineTo(x, H - 60 + Math.sin(x * 0.05) * 14 + r() * 10);
    }
    ctx.lineTo(260, H); ctx.closePath(); ctx.fill();
    // 前景的草
    for (let i = 0; i < 40; i++) {
      const x = r() * 250, y = H - 40 + r() * 40;
      ctx.strokeStyle = 'rgba(10,14,24,0.95)';
      ctx.lineWidth = 2 + r() * 3;
      ctx.beginPath();
      ctx.moveTo(x, H);
      ctx.quadraticCurveTo(x + (r() - 0.5) * 24, y, x + (r() - 0.5) * 46, y - 40 - r() * 40);
      ctx.stroke();
    }
    ctx.restore();
  }

  function grade(ctx) {
    // 統一的冷暖分離：暗部壓藍、亮部加暖
    const g = ctx.createLinearGradient(W, 0, 0, H);
    g.addColorStop(0, 'rgba(255,186,120,0.14)');
    g.addColorStop(0.55, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(30,40,86,0.30)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 暗角
    const v = ctx.createRadialGradient(W * 0.5, H * 0.46, H * 0.34, W * 0.5, H * 0.5, H * 1.02);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(6,8,18,0.62)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    P.grain(ctx, 0, 0, W, H, 0.055);
  }

  window.SCENE = function (ctx) {
    sky(ctx);
    ridge(ctx, H * 0.46, 16, FAR, 0.62, 3, 0.34);
    ridge(ctx, H * 0.50, 22, FAR, 0.38, 9, 0.18);
    ground(ctx);
    debris(ctx);
    road(ctx);
    tower(ctx, W * 0.235, H * 0.70, 66);
    grunt(ctx, W * 0.58, H * 0.80, 40, 200);
    grunt(ctx, W * 0.70, H * 0.72, 32, 300);
    hero(ctx, W * 0.40, H * 0.93, 54);
    foreground(ctx);
    grade(ctx);
  };
  /* 對照圖要用同一套角色畫法，所以掛出去 */
  window.SCENE.hero = hero;
  window.SCENE.grunt = grunt;
  window.SCENE.tower = tower;
  window.SCENE_W = W;
  window.SCENE_H = H;
})();
