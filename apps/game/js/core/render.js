/* 俯視戰場繪製
 * 實體的世界座標 (x = 沿路距離, z = 側向偏移) 由 G.buildMap 投影到蜿蜒路線上。
 */
window.G = window.G || {};

const R = {};
G.R = R;

const W = 960, H = 720;   // 魔王有主角九倍高，戰場得比一般俯視圖再高一截

R.setup = function (canvas) {
  R.canvas = canvas;
  canvas.width = W;
  canvas.height = H;
  R.ctx = canvas.getContext('2d');
};

/* 畫布的邏輯尺寸是固定的 960x720，但實際顯示出來多大會隨螢幕變。
   手機上量出來只有 300 多 px 寬，等於每個東西都被縮到三分之一。
   要判斷「玩家眼睛看到的有多大」就得看這個比例。 */
R.cssScale = function () {
  if (!R.canvas) return 1;
  const r = R.canvas.getBoundingClientRect();
  return r.width ? r.width / W : 1;
};

/* 迷宮的放大倍率。
   整間房（19x13 格）塞進手機的畫布時，一格只剩 17 個螢幕像素、
   主角直徑 11 px——看不出路，眼睛很吃力。
   所以照實際顯示尺寸回推：讓一格至少有 30 個螢幕像素。
   桌機本來就夠大（一格約 30），算出來是 1，畫面完全不變。 */
R.mazeZoom = function () {
  const T = (G.MAZE && G.MAZE.TILE) || 44;
  const px = T * R.cssScale();
  return Math.max(1, Math.min(2.8, 30 / Math.max(1, px)));
};

/* 線形戰場的放大倍率。
   原本的設計是「整張戰場一次看完、不捲動」——在桌機上成立，
   在手機上不成立：量出來主角直徑只有 11～14 個螢幕像素，
   小兵一樣大，根本分不出誰是誰。
   所以畫布小的時候放大並跟著主角走；桌機維持原本的全景，一格都不改。 */
R.battleZoom = function () {
  const cs = R.cssScale();
  // 主角畫出來是 45 個邏輯像素高，希望在螢幕上至少有 26 px
  return Math.max(1, Math.min(2.2, 26 / Math.max(1, 45 * cs)));
};

R.buildBackdrop = function (chapter, stage) {
  R.palette = chapter.palette;
  R.chapter = chapter;
  R.map = G.buildMap(stage);
};

/* ══════════ 主繪製 ══════════ */
R.draw = function () {
  const B = G.B, ctx = R.ctx, map = R.map, p = R.palette;
  if (!B.stage || !map) return;

  ctx.save();
  if (B.shake > 0) ctx.translate((Math.random() - 0.5) * B.shake, (Math.random() - 0.5) * B.shake * 0.6);

  /* 小畫布上放大並跟著主角。地面先鋪滿整個畫布再進鏡頭，
     不然放大之後地圖以外的地方會是空的。 */
  const bz = R.battleZoom();
  if (bz > 1.001) {
    ctx.fillStyle = p.near || p.ground || '#12100D';
    ctx.fillRect(0, 0, W, H);
    const hp = map.at(B.hero.x, B.hero.z || 0);
    const halfW = W / (2 * bz), halfH = H / (2 * bz);
    const camX = Math.max(halfW, Math.min(W - halfW, hp.x));
    const camY = Math.max(halfH, Math.min(H - halfH, hp.y));
    ctx.translate(W / 2, H / 2);
    ctx.scale(bz, bz);
    ctx.translate(-camX, -camY);
    R.cam = { z: bz, x: camX, y: camY };
  } else {
    R.cam = null;
  }

  drawGround(ctx, p, map, B);
  drawFlankLane(ctx, p, map, B);
  drawPath(ctx, p, map);
  drawHazards(ctx, p, map, B);

  /* 所有會互相遮擋的東西一起依畫面 y 排序，做出俯視的前後關係 */
  const draws = [];

  map.props.forEach(pr => draws.push({ y: pr.y, fn: () => drawProp(ctx, pr, p) }));

  B.posts.forEach(pp => {
    const side = pp.idx % 2 === 0 ? 1 : -1;
    const sp = map.beside(pp.x, 68, side);
    pp._sx = sp.x; pp._sy = sp.y;
    draws.push({ y: sp.y, fn: () => drawPost(ctx, pp, sp, B) });
  });

  (B.pickups || []).forEach(pk => {
    if (pk.taken) return;
    const sp = map.at(pk.x, pk.z || 0);
    draws.push({ y: sp.y, fn: () => drawHat(ctx, pk, sp) });
  });

  (B.corpses || []).forEach(c => {
    const sp = map.at(c.x, c.z || 0);
    draws.push({ y: sp.y - 0.5, fn: () => drawCorpse(ctx, c, sp) });
  });

  /* 魔王有主角九倍高，站在主角前面時會把玩家整個蓋掉。
     主角落進魔王的身體範圍時就把魔王畫淡，讓玩家看得到自己在哪。
     淡入淡出用逐幀內插，不要一格跳掉。 */
  const bossE = B.entities.find(e => e.isBoss && !e.dead);
  if (bossE) {
    const bs = map.at(bossE.x, bossE.z || 0), hs = map.at(B.hero.x, B.hero.z || 0);
    const s = bossE.size * BOSS_ART;
    /* 要「真的被擋住」才淡化。只差一兩個像素（兩人站同一排）不算，
       不然並排站著魔王就變半透明了。 */
    const covered = !B.hero.dead && bs.y > hs.y + 26 &&
      Math.abs(hs.x - bs.x) < s * 1.0 && hs.y > bs.y - s * 3.3;
    const want = covered ? 0.42 : 1;
    bossE._fade = bossE._fade == null ? want : bossE._fade + (want - bossE._fade) * 0.18;
  }

  B.entities.forEach(e => {
    if (e.dead) return;
    const sp = map.at(e.x, e.z || 0);
    e._sx = sp.x; e._sy = sp.y;
    if (e.isStructure) draws.push({ y: sp.y, fn: () => (e.isGear ? drawGear(ctx, e, sp) : drawTower(ctx, e, sp, p)) });
    else if (e === B.hero) draws.push({ y: sp.y, fn: () => drawHero(ctx, e, sp, B) });
    else draws.push({ y: sp.y, fn: () => drawUnit(ctx, e, sp) });
  });

  draws.sort((a, b) => a.y - b.y);
  draws.forEach(d => d.fn());

  drawFrontLine(ctx, B, map);
  B.effects.forEach(f => drawEffect(ctx, f, map));
  drawProjectiles(ctx, B, map);
  drawParticles(ctx, B, map);
  drawTexts(ctx, B, map);

  /* 主角受傷的紅屏：邊緣紅、中間透，傷得越重越紅 */
  if (B.hurtFlash > 0) {
    const hf = Math.min(1, B.hurtFlash);
    const rg = ctx.createRadialGradient(W / 2, H / 2, H * 0.10, W / 2, H / 2, H * 0.78);
    rg.addColorStop(0, 'rgba(216,70,54,0)');
    rg.addColorStop(0.55, 'rgba(216,70,54,' + (0.30 * hf).toFixed(3) + ')');
    rg.addColorStop(1, 'rgba(216,70,54,' + (0.92 * hf).toFixed(3) + ')');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }

  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  ctx.restore();

  if (B.phase === 'deploy') drawDeployHint(ctx, B);
  else if (B.hero.dead && !B.over) drawRespawn(ctx, B);
  drawFlankAlert(ctx, B, map);
};

/* ── 側翼突破的警示 ──
   後期真正會輸的是這個：側翼繞過路口，直接去拆城門。
   但原本只有開場一行「岔路有東西過來了」，
   玩家城門掉光了還不知道發生什麼事。
   所以只要有敵人在你後方，就一直掛著這條，並在每一隻頭上標紅。 */
function drawFlankAlert(ctx, B, map) {
  if (!B.flank || B.over || B.phase === 'deploy') return;
  const n = B.flankBreach | 0;
  if (n <= 0) return;

  // 每一隻繞到後方的，頭上標一個紅箭頭
  ctx.save();
  for (const o of B.entities) {
    if (o.dead || !o.isFlanker || o.onFlank) continue;
    if (o.x >= B.flank.x - 140) continue;
    const s = map.at(o.x, o.z || 0);
    const bob = Math.sin(B.time * 6 + o.x) * 3;
    ctx.fillStyle = '#C8503E';
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - 62 + bob);
    ctx.lineTo(s.x - 7, s.y - 74 + bob);
    ctx.lineTo(s.x + 7, s.y - 74 + bob);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 上方的警示條
  const pulse = 0.62 + Math.sin(B.time * 5) * 0.18;
  const text = '側翼突破　' + n + ' 隻已經在你後方';
  ctx.save();
  ctx.font = '600 15px "Noto Sans TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = Math.max(300, ctx.measureText(text).width + 52);
  const x = W / 2 - w / 2, y = 14, h = 34;
  ctx.fillStyle = 'rgba(24,10,8,0.88)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(200,80,62,' + pulse.toFixed(2) + ')';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = '#FF9A82';
  ctx.fillText(text, W / 2, y + h / 2 + 1);

  // 第一次突破的時候把解法講出來，不然玩家只知道慘，不知道怎麼辦
  if (B.flank.breachAt != null && B.time - B.flank.breachAt < 7) {
    ctx.font = '12px "Noto Sans TC", sans-serif';
    ctx.fillStyle = '#D9B896';
    ctx.fillText('去路口哨所派兵守住岔路', W / 2, y + h + 15);
  }
  ctx.restore();
}

/* ── 地面 ── */
function drawGround(ctx, p, map, B) {
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, p.field || p.ground);
  g.addColorStop(1, p.near);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  map.patches.forEach(q => {
    ctx.globalAlpha = q.a * 2.2;
    ctx.fillStyle = p.field2 || p.mid;
    ctx.beginPath(); ctx.ellipse(q.x, q.y, q.rx, q.ry, 0, 0, 6.3); ctx.fill();
  });
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#FFE9B0';
  for (let i = 0; i < 170; i++) {
    const x = (i * 137.5 + B.time * 2) % W;
    const y = (i * 79.3) % H;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.restore();
}

/* ── 路 ── */
function drawPath(ctx, p, map) {
  const pts = map.pts;
  const stroke = w => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineWidth = w;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  };
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.34)';        stroke(88);
  ctx.strokeStyle = p.roadEdge || p.far;       stroke(80);
  ctx.strokeStyle = p.road || p.fog;           stroke(66);
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = '#FFF2D2';                 stroke(42);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 2;
  for (let L = 34; L < map.total; L += 34) {
    const a = map.atLen(L);
    ctx.beginPath();
    ctx.moveTo(a.x - a.ny * 30, a.y + a.nx * 30);
    ctx.lineTo(a.x + a.ny * 30, a.y - a.nx * 30);
    ctx.stroke();
  }
  ctx.restore();
}

/* ── 岔路 ──
   從主線側邊岔出去的一條土路。敵人會從外側沿著它插進來，
   所以路口是要留人守的地方。有波次要來的時候整條會亮紅。 */
/* ── 路上的坑 ──
   畫在路面上，只佔一段寬度：另一半路還走得過去。
   蓋了拒馬就鋪上木板；地縫張開的時候會抖，開之前一秒轉紅預警。 */
function drawHazards(ctx, p, map, B) {
  if (!B.hazards || !B.hazards.length) return;

  for (const hz of B.hazards) {
    const sh = hz.shake ? (Math.random() - 0.5) * hz.shake * 3 : 0;
    const pts = [];
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const wx = hz.x - hz.r + (hz.r * 2) * (i / steps);
      pts.push(map.at(wx, hz.z0));
    }
    for (let i = steps; i >= 0; i--) {
      const wx = hz.x - hz.r + (hz.r * 2) * (i / steps);
      pts.push(map.at(wx, hz.z1));
    }

    ctx.save();
    ctx.translate(sh, sh * 0.5);
    ctx.beginPath();
    pts.forEach((q, i) => { if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); });
    ctx.closePath();

    if (hz.covered) {
      // 拒馬蓋住了：鋪木板
      ctx.fillStyle = '#6E5636';
      ctx.fill();
      ctx.strokeStyle = '#8A6A44'; ctx.lineWidth = 2; ctx.stroke();
      const a = map.at(hz.x - hz.r, (hz.z0 + hz.z1) / 2);
      const bq = map.at(hz.x + hz.r, (hz.z0 + hz.z1) / 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.30)'; ctx.lineWidth = 3;
      for (let k = 1; k < 6; k++) {
        const t = k / 6;
        const mx = a.x + (bq.x - a.x) * t, my = a.y + (bq.y - a.y) * t;
        ctx.beginPath(); ctx.moveTo(mx - 9, my - 7); ctx.lineTo(mx + 9, my + 7); ctx.stroke();
      }
    } else if (hz.kind === 'water') {
      ctx.fillStyle = '#1E4C5C'; ctx.fill();
      ctx.fillStyle = 'rgba(120,200,220,0.22)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,215,235,0.5)'; ctx.lineWidth = 2;
      const c = map.at(hz.x, (hz.z0 + hz.z1) / 2);
      for (let k = 0; k < 3; k++) {
        const rr = 7 + k * 9 + (Math.sin(B.time * 2 + k) + 1) * 4;
        ctx.beginPath(); ctx.ellipse(c.x, c.y, rr, rr * 0.42, 0, 0, 6.3); ctx.stroke();
      }
    } else if (hz.kind === 'quake' && !hz.open) {
      // 還沒張開：只是一條裂縫
      ctx.fillStyle = 'rgba(20,14,10,0.55)'; ctx.fill();
      ctx.strokeStyle = hz.warn > 0 ? 'rgba(200,80,62,' + (0.4 + hz.warn * 0.6).toFixed(2) + ')'
                                    : 'rgba(40,30,20,0.8)';
      ctx.lineWidth = hz.warn > 0 ? 3 : 2;
      ctx.stroke();
    } else {
      // 張開的坑：黑洞，邊緣有一圈鬆土
      ctx.fillStyle = '#120D08'; ctx.fill();
      ctx.strokeStyle = '#4A3722'; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.restore();

    // 標籤：部署階段一定要看得到，不然玩家不知道要買拒馬
    if (B.phase === 'deploy' || (!hz.covered && hz.open)) {
      const c = map.at(hz.x, (hz.z0 + hz.z1) / 2);
      const names = { pit: '塌洞', water: '積水', quake: '地縫' };
      ctx.save();
      ctx.font = '11px "Noto Sans TC", sans-serif';
      ctx.textAlign = 'center';
      const txt = hz.covered ? '已封住' : (names[hz.kind] || '坑') + (B.phase === 'deploy' ? '（架拒馬）' : '');
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText(txt, c.x + 1, c.y - 25);
      ctx.fillStyle = hz.covered ? '#7FBF6A' : '#FF9A82';
      ctx.fillText(txt, c.x, c.y - 26);
      ctx.restore();
    }
  }
}

function drawFlankLane(ctx, p, map, B) {
  const f = B.flank;
  if (!f) return;
  const a = map.at(f.x, 0);
  const b = map.at(f.x, f.side * f.len);
  const hot = f.warn > 0 ? Math.min(1, f.warn / 4) : 0;

  ctx.save();
  ctx.lineCap = 'round';
  const line = w => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineWidth = w; ctx.stroke(); };
  ctx.strokeStyle = 'rgba(0,0,0,0.30)';         line(62);
  ctx.strokeStyle = p.roadEdge || p.far;        line(54);
  ctx.strokeStyle = p.road || p.fog;            line(42);
  // 虛線：跟主線區分開，一看就知道這不是主路
  ctx.globalAlpha = 0.30;
  ctx.strokeStyle = '#FFF2D2';
  ctx.setLineDash([16, 12]);                    line(18);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  if (hot > 0) {
    ctx.globalAlpha = hot * (0.5 + Math.sin(B.time * 9) * 0.3);
    ctx.strokeStyle = '#C8503E';                line(50);
    ctx.globalAlpha = 1;
  }

  // 路口標記
  ctx.fillStyle = hot > 0 ? '#C8503E' : 'rgba(224,178,60,0.55)';
  ctx.beginPath(); ctx.arc(a.x, a.y, 9, 0, 6.3); ctx.fill();
  ctx.font = '11px "Noto Sans TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillText('岔路', b.x + 1, b.y - 17);
  ctx.fillStyle = hot > 0 ? '#FF9A82' : '#B39C74';
  ctx.fillText('岔路', b.x, b.y - 18);
  ctx.restore();
}

/* ── 裝飾物：依章節主題 ── */
function drawProp(ctx, pr, p) {
  const s = pr.s * (pr.kind === 2 ? 15 : 23);
  const motif = R.chapter.motif;
  ctx.save();
  ctx.translate(pr.x, pr.y);
  ctx.rotate((pr.r - 0.5) * 0.5);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(0, s * 0.32, s * 0.95, s * 0.4, 0, 0, 6.3); ctx.fill();

  const base = p.prop || p.mid, top = p.field2 || p.far;
  // kind 2 一律畫成碎石堆，讓畫面不會只有一種形狀
  if (pr.kind === 2) {
    for (let i = 0; i < 3; i++) {
      const a = pr.r * 6 + i * 2.1;
      ctx.fillStyle = i === 1 ? top : base;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * s * 0.45, Math.sin(a) * s * 0.3, s * 0.5, s * 0.36, 0, 0, 6.3);
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  ctx.fillStyle = base;
  if (motif === 'column') {
    // 神廟石柱：柱身 + 柱頭
    ctx.fillRect(-s * 0.3, -s * 1.1, s * 0.6, s * 1.4);
    ctx.fillStyle = top;
    ctx.fillRect(-s * 0.3, -s * 1.1, s * 0.24, s * 1.4);
    ctx.fillStyle = base;
    ctx.fillRect(-s * 0.48, -s * 1.28, s * 0.96, s * 0.2);
    ctx.fillRect(-s * 0.44, s * 0.22, s * 0.88, s * 0.18);
  } else if (motif === 'wall') {
    // 城牆殘段
    ctx.fillRect(-s, -s * 0.7, s * 2, s * 1.0);
    ctx.fillStyle = top;
    for (let i = 0; i < 4; i++) ctx.fillRect(-s + i * s * 0.5 + 2, -s * 0.7, s * 0.42, s * 0.3);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(-s, -s * 0.2, s * 2, 3);
  } else if (motif === 'maze') {
    // 迷宮牆塊：折來折去的短牆
    ctx.fillRect(-s * 0.9, -s * 0.5, s * 1.8, s * 0.26);
    ctx.fillRect(-s * 0.9, -s * 0.5, s * 0.26, s * 1.1);
    ctx.fillStyle = top;
    ctx.fillRect(s * 0.3, -s * 0.1, s * 0.26, s * 0.8);
    ctx.fillRect(-s * 0.3, s * 0.4, s * 1.0, s * 0.24);
  } else if (motif === 'crag') {
    // 火山岩尖
    ctx.beginPath();
    ctx.moveTo(-s * 0.8, s * 0.35); ctx.lineTo(-s * 0.2, -s * 1.1);
    ctx.lineTo(s * 0.25, -s * 0.5); ctx.lineTo(s * 0.85, s * 0.35);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.moveTo(-s * 0.8, s * 0.35); ctx.lineTo(-s * 0.2, -s * 1.1); ctx.lineTo(-s * 0.1, s * 0.35);
    ctx.closePath(); ctx.fill();
  } else if (motif === 'statue') {
    // 倒下的巨像殘件
    ctx.fillRect(-s * 0.95, -s * 0.28, s * 1.9, s * 0.55);
    ctx.fillStyle = top;
    ctx.beginPath(); ctx.arc(-s * 0.72, -s * 0.28, s * 0.42, Math.PI, 0); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(s * 0.1, -s * 0.28, 3, s * 0.55);
  } else if (motif === 'beacon') {
    // 小燈座
    ctx.fillRect(-s * 0.42, -s * 1.15, s * 0.84, s * 1.5);
    ctx.fillStyle = top;
    ctx.fillRect(-s * 0.42, -s * 1.15, s * 0.3, s * 1.5);
    const fl = 0.7 + Math.sin(G.B.time * 5 + pr.r * 6) * 0.3;
    ctx.fillStyle = '#FFB43C';
    ctx.beginPath(); ctx.arc(0, -s * 1.3, s * 0.3 * fl, 0, 6.3); ctx.fill();
  } else if (motif === 'ziggurat' || motif === 'pyramid') {
    ctx.beginPath();
    ctx.moveTo(-s, s * 0.3); ctx.lineTo(0, -s * 0.9); ctx.lineTo(s, s * 0.3);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = top;
    ctx.beginPath(); ctx.moveTo(-s, s * 0.3); ctx.lineTo(0, -s * 0.9); ctx.lineTo(0, s * 0.3); ctx.closePath(); ctx.fill();
  } else if (motif === 'moai' || motif === 'henge') {
    ctx.fillRect(-s * 0.42, -s * 1.0, s * 0.84, s * 1.3);
    ctx.fillStyle = top;
    ctx.fillRect(-s * 0.42, -s * 1.0, s * 0.34, s * 1.3);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-s * 0.42, -s * 1.0, s * 0.84, 4);
  } else if (motif === 'ruins_sea' || motif === 'storm_sea') {
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.85, s * 0.5, pr.r * 3, 0, 6.3); ctx.fill();
    ctx.fillStyle = top;
    ctx.beginPath(); ctx.ellipse(-s * 0.2, -s * 0.14, s * 0.45, s * 0.26, pr.r * 3, 0, 6.3); ctx.fill();
  } else {
    for (let i = 0; i < 3; i++) {
      const a = pr.r * 6 + i * 2.1;
      ctx.fillStyle = i === 1 ? top : base;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * s * 0.4, Math.sin(a) * s * 0.28, s * 0.44, s * 0.32, 0, 0, 6.3);
      ctx.fill();
    }
  }
  ctx.restore();
}

/* ── 塔與城門 ── */
function drawTower(ctx, e, sp, p) {
  const ally = e.faction === 'ally';
  const s = ally ? 30 : (e.isMain ? 34 : 26);
  const x = sp.x, y = sp.y;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.34, s * 1.05, s * 0.5, 0, 0, 6.3); ctx.fill();

  const body = e.hitFlash > 0 ? '#FFF3D0' : (ally ? '#6B5334' : '#3E3428');
  const trim = ally ? '#E0B23C' : (p.accent || '#8E3B2E');

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x - s, y - s * 0.5, s * 2, s * 1.1);
  ctx.fillStyle = body;
  ctx.fillRect(x - s * 0.92, y - s * 1.15, s * 1.84, s * 1.55);

  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i % 2 ? body : trim;
    ctx.fillRect(x - s * 0.92 + i * (s * 0.368), y - s * 1.34, s * 0.3, s * 0.26);
  }
  ctx.fillStyle = trim;
  ctx.fillRect(x - s * 0.92, y - s * 0.5, s * 1.84, s * 0.2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 6; i++) ctx.fillRect(x - s * 0.92 + i * (s * 0.31) + s * 0.12, y - s * 0.5, 2, s * 0.2);

  ctx.fillStyle = '#17130E';
  ctx.fillRect(x - s * 0.26, y - s * 0.12, s * 0.52, s * 0.52);

  if (e.invuln) {
    ctx.globalAlpha = 0.28 + Math.sin(G.B.time * 4) * 0.12;
    ctx.fillStyle = '#8FB8FF';
    ctx.fillRect(x - s * 1.05, y - s * 1.5, s * 2.1, s * 2.0);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  bar(ctx, x, y - s * 1.62, Math.max(56, s * 2), 6, e.hp / e.maxHp, ally ? '#7FBF6A' : '#C8503E');
  label(ctx, x, y - s * 1.74, e.name + (e.invuln ? '（無敵）' : ''));
}

/* ── 武具 ── */
function drawGear(ctx, e, sp) {
  const s = e.size, x = sp.x, y = sp.y;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath(); ctx.ellipse(x, y + 3, s * 0.9, s * 0.42, 0, 0, 6.3); ctx.fill();
  const col = e.hitFlash > 0 ? '#FFF3D0' : (e.color || '#C09A54');

  if (e.isBlocker) {
    ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(x - s, y + s * 0.4); ctx.lineTo(x + s, y - s * 0.9);
    ctx.moveTo(x + s, y + s * 0.4); ctx.lineTo(x - s, y - s * 0.9);
    ctx.stroke();
  } else if (e.gearKind === 'h_oil') {
    ctx.fillStyle = '#4A3A24';
    ctx.beginPath(); ctx.ellipse(x, y, s * 0.8, s * 0.6, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(x, y - s * 0.2, s * 0.62, s * 0.44, 0, 0, 6.3); ctx.fill();
    const f = 0.7 + Math.sin(G.B.time * 9) * 0.3;
    ctx.fillStyle = '#E0862A';
    ctx.beginPath(); ctx.ellipse(x, y - s * 0.4 - 6 * f, s * 0.34 * f, s * 0.4 * f, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#FFD469';
    ctx.beginPath(); ctx.ellipse(x, y - s * 0.4 - 5 * f, s * 0.16 * f, s * 0.22 * f, 0, 0, 6.3); ctx.fill();
  } else {
    ctx.fillStyle = '#5A4628';
    ctx.fillRect(x - 2, y - s * 2.2, 4, s * 2.4);
    const wav = Math.sin(G.B.time * 3) * 3;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x + 2, y - s * 2.1);
    ctx.lineTo(x + 2 + s * 1.4, y - s * 1.8 + wav);
    ctx.lineTo(x + 2, y - s * 1.1);
    ctx.closePath(); ctx.fill();
    if (e.aura) {
      ctx.globalAlpha = 0.14 + Math.sin(G.B.time * 2.2) * 0.05;
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, e.aura.radius * R.map.scale, 0, 6.3); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
  bar(ctx, x, y - s * 1.5, Math.max(32, s * 1.8), 4, e.hp / e.maxHp, '#7FBF6A');
}

/* ── 僱用所：路邊的木造據點 ── */
function drawPost(ctx, pp, sp, B) {
  const x = sp.x, y = sp.y;
  const active = B.activePost === pp;
  const empty = pp.stock.every(n => n <= 0);
  const t = B.time;
  const selectable = B.phase === 'deploy' && !empty &&
                     (B.frontLine == null || pp.x <= B.frontLine);

  ctx.save();
  if (active || selectable) {
    ctx.globalAlpha = active ? (0.30 + Math.sin(t * 4) * 0.10) : 0.15;
    ctx.fillStyle = '#E0B23C';
    ctx.beginPath(); ctx.arc(x, y, 46, 0, 6.3); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = empty ? 0.36 : 1;

  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath(); ctx.ellipse(x, y + 8, 28, 13, 0, 0, 6.3); ctx.fill();

  ctx.fillStyle = '#6E5636';
  ctx.fillRect(x - 25, y - 6, 50, 14);
  ctx.fillStyle = '#8A6A44';
  ctx.fillRect(x - 25, y - 10, 50, 5);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 1; i < 5; i++) ctx.fillRect(x - 25 + i * 10, y - 6, 1, 14);

  ctx.fillStyle = '#5A4628';
  ctx.fillRect(x - 21, y - 34, 4, 26);
  ctx.fillRect(x + 17, y - 34, 4, 26);
  ctx.fillStyle = '#8A6A1E';
  ctx.beginPath();
  ctx.moveTo(x - 30, y - 32); ctx.lineTo(x, y - 48); ctx.lineTo(x + 30, y - 32);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#C09A54';
  for (let i = 0; i < 4; i++) ctx.fillRect(x - 28 + i * 15, y - 33, 7, 4);

  const lit = 0.6 + Math.sin(t * 3) * 0.2;
  ctx.globalAlpha = (empty ? 0.36 : 1) * lit;
  ctx.fillStyle = '#FFD469';
  ctx.fillRect(x + 10, y - 26, 6, 8);
  ctx.globalAlpha = (empty ? 0.36 : 1) * lit * 0.28;
  ctx.beginPath(); ctx.arc(x + 13, y - 22, 16, 0, 6.3); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  label(ctx, x, y - 54, pp.name + (empty ? '（已調度完）' : ''));
  if ((active || selectable) && !empty) {
    ctx.font = '11px "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFD469';
    ctx.fillText(B.phase === 'deploy' ? '點一下部署' : '可僱用', x, y - 68);
  }
  /* 路口哨所是岔路唯一的解法，但它長得跟其他僱用所一模一樣。
     部署階段直接把用途寫在旁邊——等側翼突破才知道就來不及了。 */
  if (pp.junction && !empty && B.phase === 'deploy') {
    ctx.font = '11px "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillText('守這裡擋岔路', x + 1, y - 82);
    ctx.fillStyle = '#FF9A82';
    ctx.fillText('守這裡擋岔路', x, y - 83);
  }
}

/* ══════════ 動作 ══════════
 * 所有角色共用同一組狀態，全部由 battle.js 餵過來：
 *   bob      一直在跑的相位（走路時快、站著時慢）→ 腳步與呼吸
 *   moving   走 / 站
 *   swing    攻擊倒數（配 swingMax）→ 蓄力 → 揮出 → 收回
 *   hitFlash 受擊 → 後仰
 *   born     出生時間 → 從地上冒出來
 *   casting  魔王詠唱 → 舉手與地面光圈
 */

/* 揮擊曲線：負 = 往後蓄力，正 = 揮到底 */
function swingArc(e) {
  if (!e.swing || e.swing <= 0 || !e.swingMax) return 0;
  const p = 1 - e.swing / e.swingMax;
  if (p < 0.34) return -(p / 0.34) * 0.62;
  if (p < 0.56) return (p - 0.34) / 0.22;
  return 1 - (p - 0.56) / 0.44;
}

/* 出生：從地上竄出來的那 0.32 秒 */
function spawnScale(e) {
  const age = G.B.time - (e.born || 0);
  if (!(age < 0.32)) return 1;
  const t = Math.max(0, age) / 0.32;
  return 0.42 + 0.58 * (1 - Math.pow(1 - t, 3));
}

function hurtLean(e) {
  return e.hitFlash > 0 ? Math.min(1, e.hitFlash / 0.16) : 0;
}

/* 把顏色調亮或調暗，畫腳、畫陰影用 */
function shade(hex, amt) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  if (!m) return hex || '#8A8070';
  const n = parseInt(m[1], 16);
  const f = c => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return 'rgb(' + f((n >> 16) & 255) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')';
}

/* 揮擊時的殘影弧線 */
function swoosh(ctx, x, y, r, face, arc, color) {
  if (arc < 0.25) return;
  ctx.save();
  ctx.globalAlpha = Math.min(0.55, arc * 0.6);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, r * 0.16);
  ctx.lineCap = 'round';
  ctx.beginPath();
  const a0 = face > 0 ? -1.5 : Math.PI + 1.5;
  const a1 = a0 + face * 1.9 * arc;
  ctx.arc(x, y, r, Math.min(a0, a1), Math.max(a0, a1));
  ctx.stroke();
  ctx.restore();
}

/* ── 一般單位 ── */
/* ── 機械：攻城車、彈弩台、鑽地機 ──
   這三個原本跟傭兵共用同一個「圓身體＋頭＋一把劍」的畫法，
   只有顏色跟大小不一樣，玩家花了 165 金買攻城車，
   看到的還是一隻拿劍的小人。機械就該畫成機械：沒有頭、沒有腿，有輪子。 */
function drawMachine(ctx, e, sp, s, face, pop) {
  const mv = e.moving ? 1 : 0;
  const roll = (e.bob || 0) * (mv ? 1 : 0.15);
  const x = sp.x, y = sp.y;
  const col = e.hitFlash > 0 ? '#FFF3D0' : e.color;
  const dark = shade(e.color, -0.45);
  const lit = shade(e.color, 0.22);
  const metal = '#8E8477';

  ctx.save();
  ctx.globalAlpha = pop < 1 ? pop : 1;
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.3, s * 0.86, s * 0.3, 0, 0, 6.3); ctx.fill();

  const wheel = (wx, wr) => {
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(wx, y + s * 0.12, wr, 0, 6.3); ctx.fill();
    ctx.strokeStyle = shade(e.color, 0.35); ctx.lineWidth = Math.max(1, s * 0.06);
    for (let k = 0; k < 4; k++) {
      const a = roll + k * Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(wx - Math.cos(a) * wr * 0.7, y + s * 0.12 - Math.sin(a) * wr * 0.7);
      ctx.lineTo(wx + Math.cos(a) * wr * 0.7, y + s * 0.12 + Math.sin(a) * wr * 0.7);
      ctx.stroke();
    }
  };

  if (e.hireId === 'h_ram') {
    // 攻城車：兩個大輪子＋一根撞木，撞木前端包鐵
    wheel(x - s * 0.42, s * 0.3);
    wheel(x + s * 0.42, s * 0.3);
    ctx.fillStyle = col;
    ctx.fillRect(x - s * 0.62, y - s * 0.44, s * 1.24, s * 0.4);   // 車身
    ctx.fillStyle = dark;
    ctx.fillRect(x - s * 0.62, y - s * 0.1, s * 1.24, s * 0.1);
    // 撞木：懸在車身上，往前伸
    ctx.fillStyle = lit;
    ctx.fillRect(x - s * 0.5, y - s * 0.78, s * 1.1, s * 0.26);
    ctx.fillStyle = metal;
    ctx.fillRect(x + face * s * 0.6 - s * 0.16, y - s * 0.82, s * 0.32, s * 0.34);
    ctx.fillStyle = dark;                                           // 吊繩
    ctx.fillRect(x - s * 0.34, y - s * 0.52, s * 0.06, s * 0.1);
    ctx.fillRect(x + s * 0.28, y - s * 0.52, s * 0.06, s * 0.1);
  } else if (e.hireId === 'h_ballista') {
    // 彈弩台：三腳架＋一張橫著的大弓，箭指著前面
    ctx.strokeStyle = dark; ctx.lineWidth = Math.max(2, s * 0.12);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.4, y + s * 0.22); ctx.lineTo(x, y - s * 0.34);
    ctx.lineTo(x + s * 0.4, y + s * 0.22); ctx.stroke();
    ctx.fillStyle = col;
    ctx.fillRect(x - s * 0.5, y - s * 0.56, s * 1.0, s * 0.22);      // 台座
    // 弓臂
    ctx.strokeStyle = metal; ctx.lineWidth = Math.max(2, s * 0.11);
    ctx.beginPath();
    ctx.moveTo(x + face * s * 0.18, y - s * 0.92);
    ctx.quadraticCurveTo(x + face * s * 0.46, y - s * 0.62, x + face * s * 0.18, y - s * 0.32);
    ctx.stroke();
    ctx.strokeStyle = '#D9CDAE'; ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(x + face * s * 0.18, y - s * 0.92); ctx.lineTo(x + face * s * 0.18, y - s * 0.32); ctx.stroke();
    // 箭
    ctx.fillStyle = '#E6DCC0';
    ctx.fillRect(x - face * s * 0.3, y - s * 0.66, s * 0.9, s * 0.09);
  } else {
    // 鑽地機：履帶＋前面一支會轉的錐
    ctx.fillStyle = dark;
    ctx.fillRect(x - s * 0.62, y - s * 0.08, s * 1.24, s * 0.34);
    ctx.fillStyle = shade(e.color, 0.4);
    for (let k = 0; k < 6; k++) {
      const px = x - s * 0.58 + ((k * s * 0.22 + roll * s * 0.9) % (s * 1.16));
      ctx.fillRect(px, y - s * 0.04, s * 0.08, s * 0.26);
    }
    ctx.fillStyle = col;
    ctx.fillRect(x - s * 0.5, y - s * 0.62, s * 1.0, s * 0.56);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x - s * 0.5, y - s * 0.28, s * 1.0, s * 0.1);
    // 鑽頭
    ctx.save();
    ctx.translate(x + face * s * 0.62, y - s * 0.34);
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.moveTo(face * s * 0.5, 0);
    ctx.lineTo(0, -s * 0.26); ctx.lineTo(0, s * 0.26); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade('#8E8477', 0.3);
    for (let k = 0; k < 3; k++) {
      const t = ((roll * 2 + k * 0.9) % 1.5) / 1.5;
      ctx.fillRect(face * s * 0.5 * t, -s * 0.24 * (1 - t), s * 0.05 * face, s * 0.48 * (1 - t));
    }
    ctx.restore();
  }

  if (e.kind === 'hired') {
    ctx.fillStyle = '#E0B23C';
    ctx.fillRect(x - 4, y - s * 1.05, 8, 2);
    ctx.fillRect(x - 1, y - s * 1.05 - 4, 2, 5);
  }
  ctx.restore();

  if (e.hp < e.maxHp) {
    bar(ctx, x, y - s * 1.35, s * 1.8, 3, e.hp / e.maxHp, '#7FBF6A');
  }
}

function drawUnit(ctx, e, sp) {
  if (e.isBoss) { drawBoss(ctx, e, sp); return; }

  const pop = spawnScale(e);
  const s = e.size * 0.92 * UNIT_ART * pop;
  const face = (e.facing >= 0 ? 1 : -1) * (sp.nx >= 0 ? 1 : -1);
  const arc = swingArc(e);
  const hurt = hurtLean(e);
  const mv = e.moving ? 1 : 0;
  const ph = e.bob || 0;

  /* 機械不是人：走另一套畫法 */
  if (e.hireId === 'h_ram' || e.hireId === 'h_ballista' || e.hireId === 'h_drill') {
    drawMachine(ctx, e, sp, s, face, pop);
    return;
  }

  const step = Math.sin(ph);
  const bounce = mv ? Math.abs(step) * s * 0.14 : 0;
  const breath = mv ? 0 : Math.sin(ph) * s * 0.05;
  const x = sp.x + face * arc * s * 0.34 - face * hurt * s * 0.26;
  const y = sp.y;
  const ty = y - s * 0.55 - bounce;

  ctx.save();
  ctx.globalAlpha = pop < 1 ? pop : 1;

  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.beginPath(); ctx.ellipse(sp.x, y + s * 0.3, s * 0.72, s * 0.32, 0, 0, 6.3); ctx.fill();

  const col = e.hitFlash > 0 ? '#FFF3D0' : e.color;

  /* 腳：走路時前後交錯，站著時併攏 */
  ctx.fillStyle = shade(e.color, -0.42);
  const sw = mv ? step * s * 0.3 : 0;
  ctx.fillRect(x - s * 0.34 + sw, y - s * 0.06, s * 0.22, s * 0.34);
  ctx.fillRect(x + s * 0.12 - sw, y - s * 0.06, s * 0.22, s * 0.34);

  /* 身體：站著會呼吸 */
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.ellipse(x, ty + s * 0.2, s * 0.56, s * 0.62 + breath, 0, 0, 6.3); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(x, ty + s * 0.52, s * 0.56, s * 0.26, 0, 0, 6.3); ctx.fill();

  /* 頭：揮擊時往前甩，受擊時往後仰 */
  const hx = x + face * (arc * s * 0.16 - hurt * s * 0.14);
  const hy = ty - s * 0.42 + hurt * s * 0.08;
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(hx, hy, s * 0.36, 0, 6.3); ctx.fill();
  ctx.fillStyle = '#14110C';
  if (hurt > 0.4) {
    ctx.fillRect(hx + face * s * 0.08 - s * 0.1, hy - s * 0.06, s * 0.2, s * 0.06);
  } else {
    ctx.fillRect(hx + face * s * 0.08 - s * 0.09, hy - s * 0.08, s * 0.18, s * 0.14);
  }

  /* 武器 */
  const wc = (e.kind2 === 'ranged' || e.kind2 === 'caster') ? '#D8C08A'
           : e.kind2 === 'healer' ? '#8FE08A' : '#CFCFC4';
  ctx.save();
  ctx.translate(x + face * s * 0.5, ty - s * 0.1);
  ctx.rotate(face * (arc * 1.5 - 0.35));
  ctx.fillStyle = wc;
  if (e.kind2 === 'ranged') {
    ctx.strokeStyle = wc; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(0, 0, s * 0.5, -1.1, 1.1); ctx.stroke();
  } else if (e.kind2 === 'caster' || e.kind2 === 'healer') {
    ctx.fillRect(-1.5, -s * 0.62, 3, s * 1.1);
    ctx.beginPath(); ctx.arc(0, -s * 0.68, s * 0.16, 0, 6.3); ctx.fill();
  } else {
    ctx.fillRect(-2, -s * 0.78, 4, s * 1.1);
  }
  ctx.restore();
  swoosh(ctx, x + face * s * 0.42, ty - s * 0.12, s * 0.78, face, arc, wc);

  /* 人形僱兵的辨識特徵。原本四種人只有顏色不一樣，
     在一堆小兵裡根本認不出哪個是自己花 135 金請的白魔道士。 */
  if (e.hireId === 'h_shield') {
    // 盾牌兵：一面插在身前的大盾，加一頂盔
    const bx = x + face * s * 0.52;
    ctx.fillStyle = '#6E6558';
    ctx.beginPath(); ctx.ellipse(bx, ty + s * 0.06, s * 0.3, s * 0.72, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#9A8E7A';
    ctx.beginPath(); ctx.ellipse(bx, ty + s * 0.06, s * 0.19, s * 0.56, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#C8A05E';
    ctx.beginPath(); ctx.arc(bx, ty + s * 0.06, s * 0.1, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#B08A4A';
    ctx.beginPath(); ctx.arc(hx, hy - s * 0.04, s * 0.38, Math.PI, 0); ctx.fill();
    ctx.fillRect(hx - s * 0.38, hy - s * 0.06, s * 0.76, s * 0.12);
  } else if (e.hireId === 'h_mage' || e.hireId === 'h_white') {
    // 法師：尖頂帽，白魔再加一圈光環
    const white = e.hireId === 'h_white';
    ctx.fillStyle = white ? '#EFE7D4' : '#3E4E86';
    ctx.beginPath();
    ctx.moveTo(hx - s * 0.42, hy - s * 0.2);
    ctx.quadraticCurveTo(hx - face * s * 0.1, hy - s * 1.25, hx + face * s * 0.3, hy - s * 0.42);
    ctx.lineTo(hx + s * 0.42, hy - s * 0.2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = white ? '#C8503E' : '#8FA8D4';
    ctx.fillRect(hx - s * 0.46, hy - s * 0.24, s * 0.92, s * 0.12);
    if (white) {
      ctx.strokeStyle = 'rgba(190,240,180,0.75)'; ctx.lineWidth = Math.max(1, s * 0.07);
      ctx.beginPath(); ctx.ellipse(hx, hy - s * 0.68, s * 0.34, s * 0.12, 0, 0, 6.3); ctx.stroke();
    }
  }

  if (e.kind === 'hired') {
    ctx.fillStyle = '#E0B23C';
    ctx.fillRect(x - 4, ty - s * 0.95, 8, 2);
    ctx.fillRect(x - 1, ty - s * 0.95 - 4, 2, 5);
  }
  if (e.slowUntil > G.B.time) {
    ctx.fillStyle = 'rgba(140,190,255,0.55)';
    ctx.beginPath(); ctx.ellipse(sp.x, y + s * 0.3, s * 0.7, s * 0.3, 0, 0, 6.3); ctx.fill();
  }
  ctx.restore();

  if (e.hp < e.maxHp) {
    bar(ctx, sp.x, y - s * 1.5, s * 1.8, 3, e.hp / e.maxHp, e.faction === 'ally' ? '#7FBF6A' : '#C8503E');
  }
}

/* ── 魔王：畫出來剛好是主角的九倍高 ──
 *
 * 為什麼畫面尺寸要跟 e.size 拆開：
 * e.size 同時是判定用的碰撞半徑，攻擊距離算的是 dist − 目標 size × 0.6，
 * 把它一路拉到九倍會讓主角與範圍技能更容易搆到魔王，等於偷偷送玩家一大段射程。
 * 所以判定維持在已經驗過平衡的 58，只有畫的時候乘上 BOSS_ART。
 * 主角畫出來約 30 像素高，魔王 58 × 1.64 × 2.84 ≈ 270 像素高，正好九倍。
 */
/* 角色放大倍率。原本主角只有 45px 高，在 960x720 的戰場上小到看不清楚。
   魔王的絕對尺寸維持不變（它已經佔掉畫面上緣的全部預算），
   所以放大主角之後，魔王相對主角約 6.5 倍而不是 9 倍——
   這是「主角看得清楚」跟「魔王九倍」之間的取捨，兩個不能同時成立。 */
const UNIT_ART = 1.40;
const BOSS_ART = 1.79;

function drawBoss(ctx, e, sp) {
  const pop = spawnScale(e);
  const s = e.size * pop * BOSS_ART;            // 體型基準；主角的 r 是 16
  const face = (e.facing >= 0 ? 1 : -1) * (sp.nx >= 0 ? 1 : -1);
  const arc = swingArc(e);
  const hurt = hurtLean(e);
  const mv = e.moving ? 1 : 0;
  const cast = e.casting > 0 ? Math.min(1, e.casting / 0.9) : 0;
  const ph = e.bob || 0;
  const shape = (R.chapter && R.chapter.boss && R.chapter.boss.shape) || 'brute';

  const step = Math.sin(ph * 0.55);              // 大塊頭步伐慢
  const stomp = mv ? Math.abs(step) * s * 0.1 : 0;
  const breath = Math.sin(ph * 0.5) * s * 0.05;
  const x = sp.x + face * arc * s * 0.2 - face * hurt * s * 0.12;
  const y = sp.y;

  const base = e.color || '#8C3B3B';
  const dark = shade(base, -0.42);
  const lit = shade(base, 0.28);
  const col = e.hitFlash > 0 ? '#FFF3D0' : base;

  const alpha = (pop < 1 ? pop : 1) * (e._fade == null ? 1 : e._fade);

  ctx.save();
  ctx.globalAlpha = alpha;

  /* 落地的壓迫感：兩層影子 */
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath(); ctx.ellipse(sp.x, y + s * 0.26, s * 1.3, s * 0.48, 0, 0, 6.3); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(sp.x, y + s * 0.26, s * 1.75, s * 0.62, 0, 0, 6.3); ctx.fill();

  /* 詠唱：腳下的光圈 */
  if (cast > 0) {
    ctx.save();
    ctx.globalAlpha = alpha * cast * 0.7;
    ctx.strokeStyle = (R.palette && R.palette.accent) || '#E0B23C';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(sp.x, y + s * 0.26, s * (1.1 + (1 - cast) * 1.4), s * (0.4 + (1 - cast) * 0.5), 0, 0, 6.3);
    ctx.stroke();
    ctx.restore();
  }

  /* 腿 */
  const legSw = mv ? step * s * 0.34 : 0;
  ctx.fillStyle = dark;
  rr(ctx, x - s * 0.66 + legSw, y - s * 0.56, s * 0.48, s * 0.80, s * 0.15);
  rr(ctx, x + s * 0.18 - legSw, y - s * 0.56, s * 0.48, s * 0.80, s * 0.15);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x - s * 0.66 + legSw, y + s * 0.1, s * 0.48, s * 0.14);
  ctx.fillRect(x + s * 0.18 - legSw, y + s * 0.1, s * 0.48, s * 0.14);

  const ty = y - s * 1.16 - stomp;               // 軀幹中心：矮而寬，俯視看起來更壓迫

  /* 後手（拿盾或垂著） */
  ctx.fillStyle = dark;
  rr(ctx, x - face * s * 0.96 - s * 0.17, ty - s * 0.30, s * 0.34, s * 0.82, s * 0.15);

  /* 軀幹 */
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.ellipse(x, ty, s * 0.94, s * 0.70 + breath, 0, 0, 6.3); ctx.fill();
  ctx.fillStyle = lit;
  ctx.globalAlpha = alpha * 0.35;
  ctx.beginPath(); ctx.ellipse(x - face * s * 0.28, ty - s * 0.26, s * 0.36, s * 0.22, -0.4, 0, 6.3); ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.beginPath(); ctx.ellipse(x, ty + s * 0.50, s * 0.88, s * 0.26, 0, 0, 6.3); ctx.fill();

  /* 頭 */
  const hx = x + face * (arc * s * 0.12 - hurt * s * 0.1);
  const hy = ty - s * 0.82 + hurt * s * 0.1 - cast * s * 0.06;
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(hx, hy, s * 0.46, 0, 6.3); ctx.fill();
  bossHead(ctx, shape, hx, hy, s, face, col, dark, lit, cast, e);

  /* 前手與武器：蓄力 → 揮出 */
  ctx.save();
  ctx.translate(x + face * s * 0.84, ty - s * 0.20);
  ctx.rotate(face * (cast > 0 ? -1.5 : arc * 1.45 - 0.45));
  ctx.fillStyle = dark;
  rr(ctx, -s * 0.18, -s * 0.1, s * 0.36, s * 0.86, s * 0.15);
  bossWeapon(ctx, shape, s, col, lit);
  ctx.restore();
  swoosh(ctx, x + face * s * 0.74, ty - s * 0.16, s * 1.4, face, arc, lit);

  ctx.restore();

  /* 血條壓在畫面頂端以內，魔王再高也看得到 */
  const top = Math.max(y - s * 2.62, 42);
  bar(ctx, sp.x, top - 18, 260, 13, e.hp / e.maxHp, '#C8503E');
  label(ctx, sp.x, top - 25, e.name, 15);
}

/* 圓角矩形，畫粗手粗腳用 */
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.fill();
}

/* 各章魔王的頭部特徵 */
function bossHead(ctx, shape, hx, hy, s, face, col, dark, lit, cast, e) {
  const eye = e.hitFlash > 0 ? '#3A1010' : '#FFE9A8';
  const glow = 0.55 + Math.sin(G.B.time * 4) * 0.25 + cast * 0.4;
  const a = ctx.globalAlpha;                    // 魔王被畫淡時，發光處要跟著淡

  if (shape === 'tide') {
    ctx.fillStyle = lit;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(hx + i * s * 0.2 - s * 0.08, hy - s * 0.34);
      ctx.lineTo(hx + i * s * 0.2, hy - s * 0.60 + Math.abs(i) * s * 0.10);
      ctx.lineTo(hx + i * s * 0.2 + s * 0.08, hy - s * 0.34);
      ctx.fill();
    }
  } else if (shape === 'minotaur') {
    ctx.fillStyle = '#E8DCC0';
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(hx + d * s * 0.36, hy - s * 0.2);
      ctx.quadraticCurveTo(hx + d * s * 1.02, hy - s * 0.36, hx + d * s * 1.00, hy - s * 0.62);
      ctx.quadraticCurveTo(hx + d * s * 0.74, hy - s * 0.34, hx + d * s * 0.3, hy - s * 0.04);
      ctx.fill();
    }
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(hx + face * s * 0.34, hy + s * 0.14, s * 0.24, s * 0.18, 0, 0, 6.3); ctx.fill();
  } else if (shape === 'horse') {
    ctx.fillStyle = lit;
    ctx.fillRect(hx + face * s * 0.08, hy - s * 0.22, face * s * 0.74, s * 0.36);
    ctx.fillStyle = dark;
    ctx.fillRect(hx + face * s * 0.58, hy - s * 0.22, face * s * 0.24, s * 0.36);   // 鼻口
    ctx.fillRect(hx + face * s * 0.24, hy - s * 0.24, face * s * 0.06, s * 0.4);    // 轡頭
    for (let i = 0; i < 5; i++) ctx.fillRect(hx - s * 0.44 + i * s * 0.2, hy - s * 0.6, s * 0.09, s * 0.4);
  } else if (shape === 'cyclops') {
    ctx.fillStyle = '#1A1410';
    ctx.beginPath(); ctx.arc(hx + face * s * 0.1, hy - s * 0.02, s * 0.26, 0, 6.3); ctx.fill();
    ctx.fillStyle = eye;
    ctx.globalAlpha = a * Math.min(1, glow);
    ctx.beginPath(); ctx.arc(hx + face * s * 0.12, hy - s * 0.02, s * 0.17, 0, 6.3); ctx.fill();
    ctx.globalAlpha = a;
    return;
  } else if (shape === 'queen') {
    ctx.fillStyle = '#E0B23C';
    ctx.fillRect(hx - s * 0.44, hy - s * 0.44, s * 0.88, s * 0.14);
    for (let i = -2; i <= 2; i++) ctx.fillRect(hx + i * s * 0.18 - s * 0.04, hy - s * 0.62, s * 0.08, s * 0.2);
    ctx.fillStyle = lit;
    ctx.fillRect(hx - s * 0.05, hy - s * 0.80, s * 0.1, s * 0.24);
  } else if (shape === 'colossus') {
    ctx.fillStyle = '#E8C35A';
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI + i * (Math.PI / 8);
      ctx.save();
      ctx.translate(hx, hy - s * 0.06);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillRect(-s * 0.04, -s * 0.74, s * 0.08, s * 0.28);
      ctx.restore();
    }
  } else if (shape === 'flame') {
    ctx.fillStyle = '#5A2A10';
    ctx.beginPath();
    ctx.ellipse(hx, hy - s * 0.42, s * 0.42, s * 0.3, 0, 0, 6.3);
    ctx.fill();
    ctx.globalAlpha = a * Math.min(1, glow);
    ctx.fillStyle = '#FFF0C0';
    ctx.beginPath();
    ctx.moveTo(hx - s * 0.34, hy - s * 0.26);
    ctx.quadraticCurveTo(hx - s * 0.12, hy - s * 0.92, hx + s * 0.04, hy - s * 0.44);
    ctx.quadraticCurveTo(hx + s * 0.22, hy - s * 0.82, hx + s * 0.34, hy - s * 0.26);
    ctx.fill();
    ctx.globalAlpha = a;
  } else {
    ctx.fillStyle = dark;
    ctx.fillRect(hx - s * 0.46, hy - s * 0.48, s * 0.92, s * 0.2);
  }

  /* 共用：兩顆發亮的眼睛 */
  ctx.fillStyle = '#120E0A';
  ctx.fillRect(hx + face * s * 0.04 - s * 0.28, hy - s * 0.08, s * 0.5, s * 0.15);
  ctx.globalAlpha = a * Math.min(1, glow);
  ctx.fillStyle = eye;
  ctx.fillRect(hx + face * s * 0.04 - s * 0.24, hy - s * 0.05, s * 0.16, s * 0.09);
  ctx.fillRect(hx + face * s * 0.04 + s * 0.08, hy - s * 0.05, s * 0.16, s * 0.09);
  ctx.globalAlpha = a;
}

/* 各章魔王的武器，畫在已經旋轉好的手上 */
function bossWeapon(ctx, shape, s, col, lit) {
  const a = ctx.globalAlpha;
  if (shape === 'tide') {
    ctx.fillStyle = '#BCD8DE';
    ctx.fillRect(-s * 0.07, -s * 1.06, s * 0.14, s * 1.3);
    for (const d of [-1, 0, 1]) {
      ctx.beginPath();
      ctx.moveTo(d * s * 0.24, -s * 1.02);
      ctx.lineTo(d * s * 0.24 - s * 0.07, -s * 1.45);
      ctx.lineTo(d * s * 0.24 + s * 0.07, -s * 1.45);
      ctx.fill();
    }
  } else if (shape === 'minotaur') {
    ctx.fillStyle = '#7A5C34';
    ctx.fillRect(-s * 0.08, -s * 1.0, s * 0.16, s * 1.22);
    ctx.fillStyle = '#C9C2B2';
    ctx.beginPath();
    ctx.moveTo(-s * 0.6, -s * 1.02); ctx.lineTo(s * 0.6, -s * 1.02);
    ctx.lineTo(s * 0.32, -s * 1.45); ctx.lineTo(-s * 0.32, -s * 1.45);
    ctx.fill();
  } else if (shape === 'horse' || shape === 'colossus') {
    ctx.fillStyle = '#C9C2B2';
    ctx.fillRect(-s * 0.1, -s * 1.42, s * 0.2, s * 1.62);
    ctx.fillStyle = lit;
    ctx.fillRect(-s * 0.3, -s * 0.2, s * 0.6, s * 0.13);
  } else if (shape === 'queen') {
    ctx.fillStyle = '#8A6A44';
    ctx.fillRect(-s * 0.06, -s * 1.2, s * 0.12, s * 1.4);
    ctx.fillStyle = '#D8C08A';
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.45); ctx.lineTo(s * 0.14, -s * 1.14); ctx.lineTo(-s * 0.14, -s * 1.14);
    ctx.fill();
  } else if (shape === 'flame') {
    ctx.fillStyle = '#6E5A3A';
    ctx.fillRect(-s * 0.08, -s * 1.0, s * 0.16, s * 1.22);
    ctx.fillStyle = '#E0B23C';
    ctx.fillRect(-s * 0.28, -s * 1.42, s * 0.56, s * 0.46);
    ctx.globalAlpha = a * 0.4;
    ctx.fillStyle = '#FFE4A0';
    ctx.beginPath(); ctx.arc(0, -s * 1.18, s * 0.62, 0, 6.3); ctx.fill();
    ctx.globalAlpha = a;
  } else {
    ctx.fillStyle = '#C9C2B2';
    ctx.fillRect(-s * 0.11, -s * 1.2, s * 0.22, s * 1.42);
  }
}

/* ── 路上的帽子 ── */
/* ── 帽子的形狀 ──
   本來只畫在地上的掉落物上。裝在頭上也是同一頂帽子，
   所以把形狀抽出來，掉落物與主角頭上共用同一份，
   不要畫兩次、日後也不會改了一邊忘了另一邊。
   以原點為中心畫，呼叫的人自己 translate / scale。 */
/* 把帽子戴到某顆頭上。cx/cy 是帽子要落的位置，s 是相對於原尺寸的倍率。 */
function wearHat(ctx, id, cx, cy, s, face) {
  if (!id || id === 'h_none') return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s * (face < 0 ? -1 : 1), s);
  hatShape(ctx, id);
  ctx.restore();
}

function hatShape(ctx, id) {
  if (!id || id === 'h_none') return;
  if (id === 'h_white' || id === 'h_black') {
    // 尖頂法師帽
    const body = id === 'h_white' ? '#EFE7D4' : '#3B3550';
    const trim = id === 'h_white' ? '#C8503E' : '#8E6BE0';
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-13, 2); ctx.quadraticCurveTo(-3, -24, 9, -14);
    ctx.lineTo(13, 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = trim;
    ctx.fillRect(-14, 1, 28, 4);
  } else if (id === 'h_helm') {
    ctx.fillStyle = '#B08A4A';
    ctx.beginPath(); ctx.arc(0, -2, 12, Math.PI, 0); ctx.fill();
    ctx.fillRect(-12, -2, 24, 5);
    ctx.fillStyle = '#C8503E';           // 盔頂的紅纓
    ctx.fillRect(-2, -20, 4, 10);
  } else if (id === 'h_hood') {
    ctx.fillStyle = '#2E2840';
    ctx.beginPath();
    ctx.moveTo(-12, 4); ctx.quadraticCurveTo(0, -20, 12, 4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0E0C14';
    ctx.beginPath(); ctx.ellipse(0, -1, 7, 6, 0, 0, 6.3); ctx.fill();
  } else if (id === 'h_lamp') {
    ctx.fillStyle = '#A8894E';
    ctx.beginPath(); ctx.ellipse(0, 1, 17, 6, 0, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -1, 7, Math.PI, 0); ctx.fill();
  } else if (id === 'h_laurel') {
    ctx.strokeStyle = '#7FBF6A'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, -2, 11, 0.25, Math.PI - 0.25, true); ctx.stroke();
    ctx.fillStyle = '#9FD48A';
    for (let i = 0; i < 5; i++) {
      const a = 0.5 + i * 0.5;
      ctx.beginPath(); ctx.ellipse((-(Math.cos(a))) * 11, -2 - Math.sin(a) * 11, 3.5, 2, a, 0, 6.3); ctx.fill();
    }
  } else if (id === 'h_horn') {
    ctx.fillStyle = '#C9BFA6';
    ctx.fillRect(-11, -2, 22, 5);
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo((d) * 8, -2);
      ctx.quadraticCurveTo((d) * 17, -12, (d) * 11, -19);
      ctx.quadraticCurveTo((d) * 11, -9, (d) * 4, -2);
      ctx.fill();
    }
  } else if (id === 'h_circlet') {
    ctx.strokeStyle = '#E0B23C'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.ellipse(0, -1, 11, 5, 0, 0, 6.3); ctx.stroke();
    ctx.fillStyle = '#FFE9A8';
    ctx.beginPath(); ctx.arc(0, -6, 3, 0, 6.3); ctx.fill();
  } else if (id === 'h_mask') {
    ctx.fillStyle = '#E8C35A';
    ctx.beginPath(); ctx.ellipse(0, -3, 10, 13, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#8A6A1E';
    ctx.fillRect(-6, -6, 4, 3); ctx.fillRect(2, -6, 4, 3);
    ctx.fillRect(-3, 3, 6, 2);
  } else {
    // h_crown 與其他：王冠
    ctx.fillStyle = '#E8C35A';
    ctx.fillRect(-12, -2, 24, 6);
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo((i) * 5 - 2.5, -2);
      ctx.lineTo((i) * 5, -12);
      ctx.lineTo((i) * 5 + 2.5, -2);
      ctx.fill();
    }
    ctx.fillStyle = '#3FB8C8';
    ctx.beginPath(); ctx.arc(0, 1, 2.5, 0, 6.3); ctx.fill();
  }
}

function drawHat(ctx, pk, sp) {
  const it = G.getItem(pk.itemId) || {};
  const y = sp.y + Math.sin(pk.bob) * 4;
  const glow = 0.45 + Math.sin(pk.bob * 1.6) * 0.2;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath(); ctx.ellipse(sp.x, sp.y + 7, 15, 6, 0, 0, 6.3); ctx.fill();

  // 底下一圈光，讓人看得出這是可以撿的
  ctx.globalAlpha = glow;
  ctx.strokeStyle = '#E0B23C'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(sp.x, sp.y + 7, 19, 8, 0, 0, 6.3); ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate(sp.x, y);
  hatShape(ctx, pk.itemId);
  ctx.restore();
  ctx.restore();

  label(ctx, sp.x, y - 30, it.name || '帽子');
}

/* ── 倒下：純視覺，不參與戰鬥 ── */
function drawCorpse(ctx, c, sp) {
  const t = c.t / c.dur;
  const fall = 1 - Math.pow(1 - Math.min(1, t / 0.42), 2);
  const s = (c.size || 14) * (c.isBoss ? 1 : 0.92);
  const dir = c.facing >= 0 ? 1 : -1;
  const alpha = t < 0.62 ? 1 : Math.max(0, 1 - (t - 0.62) / 0.38);

  ctx.save();
  ctx.globalAlpha = alpha * 0.92;
  ctx.translate(sp.x, sp.y + s * 0.24);
  ctx.rotate(dir * fall * (Math.PI / 2) * 0.92);
  const col = shade(c.color, -0.3);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(0, s * 0.06, s * (c.isBoss ? 1.2 : 0.7), s * 0.3, 0, 0, 6.3); ctx.fill();
  ctx.fillStyle = col;
  if (c.isBoss) {
    ctx.beginPath(); ctx.ellipse(0, -s * 1.42, s * 0.86, s * 0.78, 0, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -s * 2.34, s * 0.48, 0, 6.3); ctx.fill();
    rr(ctx, -s * 0.6, -s * 0.68, s * 0.44, s * 0.9, s * 0.14);
    rr(ctx, s * 0.16, -s * 0.68, s * 0.44, s * 0.9, s * 0.14);
  } else {
    ctx.beginPath(); ctx.ellipse(0, -s * 0.35, s * 0.56, s * 0.62, 0, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -s * 0.97, s * 0.36, 0, 6.3); ctx.fill();
  }
  ctx.restore();
}

/* ── 英雄：橘色黏土球戰士 ── */
function drawHero(ctx, h, sp, B) {
  if (h.dead) return;
  const r = 16 * UNIT_ART;
  const face = (h.facing >= 0 ? 1 : -1) * (sp.nx >= 0 ? 1 : -1);
  const cls = B.cls;
  const arc = swingArc(h);
  const hurt = hurtLean(h);
  const mv = h.moving ? 1 : 0;
  const ph = h.bob || 0;

  const step = Math.sin(ph);
  const bounce = mv ? Math.abs(step) * r * 0.16 : 0;
  const breath = mv ? 0 : Math.sin(ph) * r * 0.05;
  /* 踉蹌：被打到的 0.18 秒內整個人往後退，再彈回來 */
  const knock = h.knockT > 0 ? Math.sin(h.knockT / 0.18 * Math.PI) : 0;
  const x = sp.x + face * arc * r * 0.4 - face * (hurt * r * 0.3 + knock * r * 0.55);
  const y = sp.y;

  ctx.save();
  if (h.invuln > 0 && Math.floor(B.time * 20) % 2 === 0) ctx.globalAlpha = 0.45;

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(sp.x, y + r * 0.32, r * 0.86, r * 0.38, 0, 0, 6.3); ctx.fill();

  const ty = y - r * 0.62 - bounce;

  /* 腿：走路時前後交錯 */
  const sw = mv ? step * r * 0.32 : 0;
  ctx.fillStyle = '#C4632E';
  ctx.fillRect(x - r * 0.55 + sw, y - r * 0.06, r * 0.45, r * 0.36);
  ctx.fillRect(x + r * 0.1 - sw, y - r * 0.06, r * 0.45, r * 0.36);

  ctx.fillStyle = h.hitFlash > 0 ? '#FFF0CF' : '#E07A3F';
  ctx.beginPath(); ctx.ellipse(x, ty, r, r * 0.95 + breath, 0, 0, 6.3); ctx.fill();
  ctx.fillStyle = 'rgba(255,214,170,0.5)';
  ctx.beginPath(); ctx.ellipse(x - r * 0.42, ty - r * 0.42, r * 0.26, r * 0.16, -0.5, 0, 6.3); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath(); ctx.ellipse(x, ty + r * 0.6, r * 0.88, r * 0.3, 0, 0, 6.3); ctx.fill();

  /* 眼睛：揮擊時瞪大往前，受擊時瞇起來 */
  const eox = face * (2 + arc * 3 - hurt * 3);
  const eh = hurt > 0.4 ? 0.18 : 0.46;
  ctx.fillStyle = '#F6EFE0';
  ctx.fillRect(x - r * 0.5 + eox, ty - r * 0.34, r * 0.32, r * eh);
  ctx.fillRect(x + r * 0.16 + eox, ty - r * 0.34, r * 0.32, r * eh);
  ctx.fillStyle = '#141110';
  ctx.fillRect(x - r * 0.42 + eox + (face > 0 ? 2 : 0), ty - r * 0.27, r * 0.19, r * Math.min(0.33, eh));
  ctx.fillRect(x + r * 0.25 + eox + (face > 0 ? 2 : 0), ty - r * 0.27, r * 0.19, r * Math.min(0.33, eh));

  /* 戴著的帽子：跟地上掉落物同一份形狀。
     裝備了卻看不出來的話，玩家會以為沒生效——實際上屬性早就加了。
     帽子的形狀是照半徑 13 畫的，這裡按主角的頭放大。 */
  wearHat(ctx, G.S.gear && G.S.gear.hat, x, ty - r * 0.72, r / 13, face);

  /* 盾：受擊時往前擋 */
  const shx = x - face * r * (0.98 - hurt * 1.2);
  ctx.fillStyle = '#8E8477';
  ctx.beginPath(); ctx.ellipse(shx, ty + r * 0.18, r * 0.34, r * 0.5, 0, 0, 6.3); ctx.fill();
  ctx.fillStyle = cls.color2;
  ctx.beginPath(); ctx.ellipse(shx, ty + r * 0.18, r * 0.17, r * 0.26, 0, 0, 6.3); ctx.fill();

  ctx.save();
  ctx.translate(x + face * r * 0.9, ty + r * 0.1);
  ctx.rotate(-face * (0.25 + arc * 1.35));
  if (cls.id === 'stonespeaker') {
    ctx.fillStyle = '#8A6A44'; ctx.fillRect(-2, -r * 1.1, 4, r * 1.7);
    ctx.fillStyle = cls.color; ctx.fillRect(-6, -r * 1.4, 12, 9);
  } else if (cls.id === 'lampwarden') {
    ctx.fillStyle = '#6E5A3A'; ctx.fillRect(-2, -r * 1.2, 4, r * 1.1);
    ctx.fillStyle = '#E0B23C'; ctx.fillRect(-7, -r * 1.2, 13, 11);
    ctx.fillStyle = 'rgba(255,230,150,0.45)'; ctx.beginPath(); ctx.arc(0, -r * 0.9, 13, 0, 6.3); ctx.fill();
  } else if (cls.id === 'shadowbinder') {
    ctx.fillStyle = '#C4AEF5'; ctx.fillRect(-2, -r * 0.9, 4, r * 1.3);
    ctx.fillStyle = '#4A3580'; ctx.fillRect(-5, r * 0.3, 10, 4);
  } else {
    ctx.fillStyle = '#DCD8CC'; ctx.fillRect(-3, -r * 1.25, 6, r * 1.6);
    ctx.fillStyle = '#B9B4A6'; ctx.fillRect(-3, -r * 1.25, 2, r * 1.6);
    ctx.fillStyle = '#7A5C34'; ctx.fillRect(-7, r * 0.32, 14, 5);
  }
  ctx.restore();
  swoosh(ctx, x + face * r * 0.8, ty + r * 0.05, r * 1.5, face, arc,
    cls.id === 'shadowbinder' ? '#C4AEF5' : cls.id === 'lampwarden' ? '#E0B23C' : '#F2EDE0');

  if (h.shield > 0) {
    ctx.strokeStyle = 'rgba(150,200,255,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, ty, r * 1.35, 0, 6.3); ctx.stroke();
  }
  if (B.buffs.length) {
    ctx.strokeStyle = B.buffs[0].color || '#E0B23C';
    ctx.globalAlpha = 0.5 + Math.sin(B.time * 6) * 0.2;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(sp.x, y + r * 0.3, r * 1.35, r * 0.5, 0, 0, 6.3); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  bar(ctx, sp.x, y - r * 2.0, 48, 5, h.hp / h.maxHp, '#E07A3F');
}

/* ── 封鎖線 ── */
function drawFrontLine(ctx, B, map) {
  if (B.frontLine == null || B.frontLine >= B.stage.length) return;
  const a = map.at(B.frontLine, 0);
  ctx.save();
  ctx.strokeStyle = 'rgba(200,80,62,0.7)';
  ctx.lineWidth = 4;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(a.x - a.ny * 30, a.y + a.nx * 30);
  ctx.lineTo(a.x + a.ny * 30, a.y - a.nx * 30);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = '10px "Noto Sans TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(235,185,165,0.85)';
  ctx.fillText('哨塔未破', a.x, a.y - 38);
  ctx.restore();
}

/* ── 特效 ── */
function drawEffect(ctx, f, map) {
  const k = f.t / f.dur;
  const sc = map.scale;
  ctx.save();
  if (f.type === 'pool') {
    /* 留在地上的火油：邊緣一直在抖，快燒完會變淡 */
    const k = f.t / f.dur;
    const a = k > 0.75 ? (1 - k) / 0.25 : 1;
    const c = map.at(f.x, f.z || 0);
    ctx.save();
    ctx.globalAlpha = a * 0.4;
    ctx.fillStyle = f.color;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, f.r, f.r * 0.42, 0, 0, 6.3); ctx.fill();
    ctx.globalAlpha = a * 0.85;
    ctx.strokeStyle = f.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 26; i++) {
      const th = i / 26 * 6.283;
      const wob = 1 + Math.sin(th * 4 + G.B.time * 5) * 0.06;
      const px = c.x + Math.cos(th) * f.r * wob;
      const py = c.y + Math.sin(th) * f.r * 0.42 * wob;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (f.type === 'ring' || f.type === 'telegraph' || f.type === 'arc') {
    const sp = map.at(f.x, f.z || 0);
    if (f.type === 'telegraph') {
      ctx.globalAlpha = 0.22 + Math.sin(f.t * 22) * 0.1;
      ctx.fillStyle = f.color;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, f.r * sc, 0, 6.3); ctx.fill();
      ctx.globalAlpha = 0.8; ctx.strokeStyle = f.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, f.r * sc, 0, 6.3); ctx.stroke();
    } else if (f.type === 'arc') {
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = f.color; ctx.lineWidth = 5;
      let ang = Math.atan2(sp.ny, sp.nx);
      if (f.facing < 0) ang += Math.PI;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, Math.max(6, f.r * sc * (0.55 + k * 0.45)), ang - 0.95, ang + 0.95);
      ctx.stroke();
    } else {
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = f.color; ctx.lineWidth = 4;
      const rr = Math.max(2, (f.r + (f.max - f.r) * k) * sc);
      ctx.beginPath(); ctx.arc(sp.x, sp.y, rr, 0, 6.3); ctx.stroke();
    }
  } else if (f.type === 'beam' || f.type === 'trail') {
    const pts = map.slice(f.x, f.x2);
    if (pts.length > 1) {
      ctx.globalAlpha = (1 - k) * (f.type === 'trail' ? 0.65 : 1);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = Math.max(4, (f.type === 'beam' ? (f.w || 20) : 20) * sc);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y));
      ctx.stroke();
      if (f.type === 'beam') {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = Math.max(2, (f.w || 20) * sc * 0.32);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawProjectiles(ctx, B, map) {
  B.projectiles.forEach(pr => {
    const sp = map.at(pr.x, pr.z || 0);
    const s = pr.size;
    ctx.fillStyle = pr.color;
    ctx.beginPath(); ctx.arc(sp.x, sp.y - 8, s * 0.85, 0, 6.3); ctx.fill();
    ctx.globalAlpha = 0.28;
    ctx.beginPath(); ctx.arc(sp.x, sp.y, s * 0.7, 0, 6.3); ctx.fill();
    ctx.globalAlpha = 1;
  });
}

function drawParticles(ctx, B, map) {
  B.particles.forEach(pt => {
    const sp = map.at(pt.x, pt.z || 0);
    ctx.globalAlpha = Math.max(0, 1 - pt.t / pt.dur);
    ctx.fillStyle = pt.color;
    ctx.fillRect(Math.round(sp.x), Math.round(sp.y + pt.y * 0.5), pt.size, pt.size);
  });
  ctx.globalAlpha = 1;
}

function drawTexts(ctx, B, map) {
  B.texts.forEach(t => {
    const sp = map.at(t.x, 0);
    ctx.globalAlpha = Math.max(0, 1 - t.t / t.dur);
    ctx.textAlign = 'center';

    /* 魔王技能名：Silkscreen 沒有中文字，而且畫在魔王身上會同色看不見。
       改成掛在主角頭上的牌子——玩家本來就在看自己，警告也該出現在那裡。 */
    if (t.banner) {
      ctx.font = 'bold 17px "Noto Sans TC", sans-serif';
      const w = ctx.measureText(t.text).width + 26;
      const by = Math.round(sp.y + t.dy);
      ctx.fillStyle = 'rgba(14,11,8,0.88)';
      ctx.fillRect(Math.round(sp.x) - w / 2, by - 17, w, 25);
      ctx.fillStyle = t.color;
      ctx.fillRect(Math.round(sp.x) - w / 2, by - 17, w, 3);
      ctx.fillRect(Math.round(sp.x) - w / 2, by + 5, w, 3);
      ctx.fillStyle = '#FFF0C8';
      ctx.fillText(t.text, Math.round(sp.x), by);
      return;
    }

    ctx.font = (t.big ? 'bold 16px ' : 'bold 12px ') + '"Silkscreen", monospace';
    const y = sp.y + t.dy * 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(t.text, Math.round(sp.x) + 1, Math.round(y) + 1);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, Math.round(sp.x), Math.round(y));
  });
  ctx.globalAlpha = 1;
}

/* ── 共用小元件 ── */
function bar(ctx, cx, y, w, h, pct, color) {
  pct = Math.max(0, Math.min(1, pct));
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(Math.round(cx - w / 2) - 1, Math.round(y) - 1, w + 2, h + 2);
  ctx.fillStyle = '#221C14';
  ctx.fillRect(Math.round(cx - w / 2), Math.round(y), w, h);
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(cx - w / 2), Math.round(y), Math.round(w * pct), h);
}

function label(ctx, cx, y, text, px) {
  ctx.font = (px || 11) + 'px "Noto Sans TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillText(text, cx + 1, y + 1);
  ctx.fillStyle = '#E6D7B4';
  ctx.fillText(text, cx, y);
}

function drawRespawn(ctx, B) {
  ctx.save();
  ctx.fillStyle = 'rgba(20,14,10,0.5)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#E6D7B4';
  ctx.font = '22px "Noto Serif TC", serif';
  ctx.fillText('你倒下了', W / 2, H / 2 - 10);
  ctx.font = '15px "Noto Sans TC", sans-serif';
  ctx.fillStyle = '#B39C74';
  ctx.fillText(Math.ceil(B.respawnTimer) + ' 秒後從城門重新出發　—　小兵還在推，線沒有斷', W / 2, H / 2 + 20);
  ctx.restore();
}

function drawDeployHint(ctx, B) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '13px "Noto Sans TC", sans-serif';
  const msg = B.activePost
    ? '在下方選要部署的單位，也可以點地圖上其他據點'
    : '點地圖上亮起的據點開始部署，或直接按「開戰」';
  const w = ctx.measureText(msg).width + 34;
  ctx.fillStyle = 'rgba(18,16,13,0.85)';
  ctx.fillRect(W / 2 - w / 2, 14, w, 30);
  ctx.strokeStyle = '#8A6A1E';
  ctx.lineWidth = 1;
  ctx.strokeRect(W / 2 - w / 2, 14, w, 30);
  ctx.fillStyle = '#E0B23C';
  ctx.fillText(msg, W / 2, 34);
  ctx.restore();
}

/* 給平衡／比例量測腳本用的繪製入口，遊戲本身不會走這裡 */
R._draw = { boss: drawBoss, hero: drawHero, unit: drawUnit, corpse: drawCorpse };

/* 點擊：找出離畫面座標最近的據點 */
R.postAt = function (sx, sy) {
  const B = G.B;
  if (!B.posts) return null;
  let best = null, bd = 58;
  B.posts.forEach(pp => {
    if (pp._sx == null) return;
    const d = Math.hypot(pp._sx - sx, pp._sy - sy);
    if (d < bd) { bd = d; best = pp; }
  });
  return best;
};

R.W = W; R.H = H;

/* ══════════════════════════════════════════
   魔王迷宮：九宮格探索層的繪製
   跟線形戰場共用同一張畫布與同一組章節配色。
   ══════════════════════════════════════════ */
R.drawMaze = function (m) {
  const ctx = R.ctx, p = R.palette || {};
  const T = G.MAZE.TILE, CWn = G.MAZE.CW, CHn = G.MAZE.CH;
  const cell = G.mazeCell(m);
  const roomW = CWn * T, roomH = CHn * T;
  const ox = Math.round((W - roomW) / 2);
  const oy = Math.round((H - roomH) / 2) + 14;

  ctx.save();
  if (m.hero.hurt > 0) ctx.translate((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 7);

  // 底（在鏡頭之外畫，放大之後room 以外的地方才不會是空的）
  ctx.fillStyle = p.near || '#0A1822';
  ctx.fillRect(0, 0, W, H);

  /* 鏡頭：放大並跟著主角走，但夾在房間範圍內，不要拍到房間外面。
     倍率是照畫布實際顯示多大算出來的（見 R.mazeZoom）。 */
  const zoom = R.mazeZoom();
  if (zoom > 1.001) {
    const halfW = W / (2 * zoom), halfH = H / (2 * zoom);
    let camX = ox + m.hero.x, camY = oy + m.hero.y;
    if (roomW > halfW * 2) camX = Math.max(ox + halfW, Math.min(ox + roomW - halfW, camX));
    else camX = ox + roomW / 2;
    if (roomH > halfH * 2) camY = Math.max(oy + halfH, Math.min(oy + roomH - halfH, camY));
    else camY = oy + roomH / 2;
    ctx.translate(W / 2, H / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);
  }

  /* 地板與牆。
     章節配色裡的 prop / road 明度太接近，直接拿來用會讓牆跟地板糊在一起
     （第一版就是這樣，整個房間像一張棋盤，看不出通道）。
     所以這裡從配色各拉一端：牆壓到很暗，地板提到很亮。 */
  const wallC = shade(p.prop || p.mid || '#1E4C5C', -0.55);
  const wallTop = shade(p.prop || p.mid || '#1E4C5C', -0.25);
  const floorA = shade(p.road || p.fog || '#4E8E9C', 0.30);
  const floorB = shade(p.road || p.fog || '#4E8E9C', 0.18);

  for (let ty = 0; ty < CHn; ty++) {
    for (let tx = 0; tx < CWn; tx++) {
      const x = ox + tx * T, y = oy + ty * T;
      if (cell.g[ty][tx] === 1) {
        ctx.fillStyle = wallC;
        ctx.fillRect(x, y, T, T);
        // 只有「上面是通路」的牆才畫亮邊，做出立體的牆面
        if (ty > 0 && cell.g[ty - 1][tx] === 0) {
          ctx.fillStyle = wallTop;
          ctx.fillRect(x, y, T, 7);
        }
      } else {
        ctx.fillStyle = ((tx + ty) & 1) ? floorA : floorB;
        ctx.fillRect(x, y, T, T);
        ctx.fillStyle = 'rgba(0,0,0,0.10)';
        ctx.fillRect(x, y, T, 1);
        ctx.fillRect(x, y, 1, T);
      }
    }
  }
  // 房間外框
  ctx.strokeStyle = shade(p.accent || '#E0B23C', -0.3);
  ctx.lineWidth = 2;
  ctx.strokeRect(ox - 1, oy - 1, roomW + 2, roomH + 2);

  // 門：畫成亮色的口，並標出通往哪一格
  ['n', 's', 'e', 'w'].forEach(d => {
    const dd = cell.doors[d];
    if (!dd) return;
    const x = ox + dd.x * T, y = oy + dd.y * T;
    ctx.fillStyle = '#E0B23C';
    ctx.globalAlpha = 0.55 + Math.sin(G.__mazeT * 4) * 0.20;
    ctx.fillRect(x + 3, y + 3, T - 6, T - 6);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#2A2116';
    ctx.font = '13px "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('門', x + T / 2, y + T / 2 + 5);
  });

  // 房間裡的東西
  cell.items.forEach(it => {
    const x = ox + it.x * T + T / 2, y = oy + it.y * T + T / 2;
    if (it.t === 'trap') {
      ctx.strokeStyle = '#C8503E'; ctx.lineWidth = 2;
      ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.arc(x, y, T * 0.3, 0, 6.3); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - T * 0.18, y - T * 0.18); ctx.lineTo(x + T * 0.18, y + T * 0.18);
      ctx.moveTo(x + T * 0.18, y - T * 0.18); ctx.lineTo(x - T * 0.18, y + T * 0.18);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    const col = it.t === 'chest' ? '#E0B23C' : it.t === 'herb' ? '#8FB86A' : '#6E95E0';
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + T * 0.24, T * 0.28, T * 0.12, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = col;
    if (it.t === 'chest') {
      ctx.fillRect(x - T * 0.26, y - T * 0.16, T * 0.52, T * 0.34);
      ctx.fillStyle = '#8A6A1E';
      ctx.fillRect(x - T * 0.26, y - T * 0.04, T * 0.52, T * 0.07);
    } else if (it.t === 'herb') {
      ctx.beginPath(); ctx.ellipse(x - 5, y, 5, 9, -0.5, 0, 6.3); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 5, y, 5, 9, 0.5, 0, 6.3); ctx.fill();
    } else {
      ctx.fillRect(x - T * 0.28, y - T * 0.06, T * 0.56, T * 0.28);
      ctx.beginPath();
      ctx.moveTo(x - T * 0.34, y - T * 0.06); ctx.lineTo(x, y - T * 0.34);
      ctx.lineTo(x + T * 0.34, y - T * 0.06); ctx.fill();
    }
  });

  // 雜兵
  cell.foes.forEach(f => {
    const x = ox + f.x, y = oy + f.y;
    const bob = Math.sin(G.__mazeT * 7 + f.t) * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + T * 0.22, T * 0.26, T * 0.11, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = p.accent || '#C8503E';
    ctx.beginPath(); ctx.ellipse(x, y + bob, T * 0.26, T * 0.3, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#14110C';
    ctx.fillRect(x - 6, y + bob - 5, 12, 4);
  });

  // 主角
  drawMazeHero(ctx, m, ox, oy);

  ctx.restore();

  // 受傷紅屏
  if (m.hero.flash > 0) {
    const hf = Math.min(1, m.hero.flash);
    const rg = ctx.createRadialGradient(W / 2, H / 2, H * 0.1, W / 2, H / 2, H * 0.78);
    rg.addColorStop(0, 'rgba(216,70,54,0)');
    rg.addColorStop(1, 'rgba(216,70,54,' + (0.85 * hf).toFixed(3) + ')');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  }

  drawMiniMap(ctx, m);
};

function drawMazeHero(ctx, m, ox, oy) {
  const T = G.MAZE.TILE;
  const h = m.hero;
  const x = ox + h.x, y = oy + h.y;
  const r = T * 0.34;
  const step = Math.sin(h.bob);
  const bounce = h.moving ? Math.abs(step) * r * 0.18 : 0;
  const cls = G.getClass(G.S.classId);

  ctx.save();
  if (h.iframe > 0 && Math.floor(G.__mazeT * 18) % 2 === 0) ctx.globalAlpha = 0.5;

  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.62, r * 0.8, r * 0.34, 0, 0, 6.3); ctx.fill();

  const ty = y - bounce;
  // 腿
  ctx.fillStyle = '#C4632E';
  const sw = h.moving ? step * r * 0.3 : 0;
  ctx.fillRect(x - r * 0.5 + sw, ty + r * 0.22, r * 0.4, r * 0.44);
  ctx.fillRect(x + r * 0.1 - sw, ty + r * 0.22, r * 0.4, r * 0.44);
  // 身體
  ctx.fillStyle = h.hurt > 0 ? '#FFF0CF' : '#E07A3F';
  ctx.beginPath(); ctx.ellipse(x, ty, r * 0.92, r * 0.88, 0, 0, 6.3); ctx.fill();
  // 眼睛
  const eo = h.face * r * 0.14;
  ctx.fillStyle = '#F6EFE0';
  ctx.fillRect(x - r * 0.44 + eo, ty - r * 0.3, r * 0.3, r * 0.42);
  ctx.fillRect(x + r * 0.14 + eo, ty - r * 0.3, r * 0.3, r * 0.42);
  ctx.fillStyle = '#141110';
  ctx.fillRect(x - r * 0.36 + eo, ty - r * 0.24, r * 0.18, r * 0.3);
  ctx.fillRect(x + r * 0.22 + eo, ty - r * 0.24, r * 0.18, r * 0.3);
  // 戴著的帽子：跟戰場上同一頂
  wearHat(ctx, G.S.gear && G.S.gear.hat, x, ty - r * 0.62, r / 13, h.face);
  // 盾
  ctx.fillStyle = '#8E8477';
  ctx.beginPath(); ctx.ellipse(x - h.face * r * 0.92, ty + r * 0.14, r * 0.3, r * 0.46, 0, 0, 6.3); ctx.fill();
  ctx.fillStyle = cls.color2;
  ctx.beginPath(); ctx.ellipse(x - h.face * r * 0.92, ty + r * 0.14, r * 0.15, r * 0.24, 0, 0, 6.3); ctx.fill();
  // 劍：揮擊時掃一圈
  ctx.save();
  ctx.translate(x + h.face * r * 0.85, ty);
  const sa = h.swing > 0 ? (1 - h.swing / 0.28) : 0;
  ctx.rotate(-h.face * (0.3 + sa * 1.9));
  ctx.fillStyle = '#DCD8CC';
  ctx.fillRect(-2.5, -r * 1.15, 5, r * 1.5);
  ctx.restore();
  if (h.swing > 0) {
    ctx.globalAlpha = h.swing / 0.28 * 0.5;
    ctx.strokeStyle = '#F2EDE0'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, ty, r * 1.5, -1.4, 1.4); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* 右上角的九宮格小地圖：走過的亮起來，魔王那格標出來 */
function drawMiniMap(ctx, m) {
  const s = 26, gap = 4, pad = 12;
  const w = 3 * s + 2 * gap;
  const bx = W - w - pad, by = pad;
  ctx.save();
  ctx.fillStyle = 'rgba(14,11,8,0.82)';
  ctx.fillRect(bx - 8, by - 8, w + 16, w + 16);
  ctx.strokeStyle = '#8A6A1E'; ctx.lineWidth = 1;
  ctx.strokeRect(bx - 8, by - 8, w + 16, w + 16);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    const c = m.cells[y][x];
    const px = bx + x * (s + gap), py = by + y * (s + gap);
    const here = m.at.x === x && m.at.y === y;
    const isBoss = m.bossAt.x === x && m.bossAt.y === y;
    ctx.fillStyle = here ? '#E0B23C' : c.visited ? '#4A4133' : '#241E17';
    ctx.fillRect(px, py, s, s);
    if (isBoss && (c.visited || here)) {
      ctx.fillStyle = '#C8503E';
      ctx.fillRect(px + 6, py + 6, s - 12, s - 12);
    }
    // 門的方向
    ctx.fillStyle = here ? '#2A2116' : 'rgba(224,178,60,0.45)';
    if (c.doors.n) ctx.fillRect(px + s / 2 - 3, py - 2, 6, 4);
    if (c.doors.s) ctx.fillRect(px + s / 2 - 3, py + s - 2, 6, 4);
    if (c.doors.w) ctx.fillRect(px - 2, py + s / 2 - 3, 4, 6);
    if (c.doors.e) ctx.fillRect(px + s - 2, py + s / 2 - 3, 4, 6);
  }
  ctx.restore();
}
