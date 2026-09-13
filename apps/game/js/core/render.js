/* 俯視戰場繪製
 * 實體的世界座標 (x = 沿路距離, z = 側向偏移) 由 G.buildMap 投影到蜿蜒路線上。
 */
window.G = window.G || {};

const R = {};
G.R = R;

const W = 960, H = 600;

R.setup = function (canvas) {
  R.canvas = canvas;
  canvas.width = W;
  canvas.height = H;
  R.ctx = canvas.getContext('2d');
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

  drawGround(ctx, p, map, B);
  drawPath(ctx, p, map);

  /* 所有會互相遮擋的東西一起依畫面 y 排序，做出俯視的前後關係 */
  const draws = [];

  map.props.forEach(pr => draws.push({ y: pr.y, fn: () => drawProp(ctx, pr, p) }));

  B.posts.forEach(pp => {
    const side = pp.idx % 2 === 0 ? 1 : -1;
    const sp = map.beside(pp.x, 54, side);
    pp._sx = sp.x; pp._sy = sp.y;
    draws.push({ y: sp.y, fn: () => drawPost(ctx, pp, sp, B) });
  });

  (B.corpses || []).forEach(c => {
    const sp = map.at(c.x, c.z || 0);
    draws.push({ y: sp.y - 0.5, fn: () => drawCorpse(ctx, c, sp) });
  });

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

  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  ctx.restore();

  if (B.phase === 'deploy') drawDeployHint(ctx, B);
  else if (B.hero.dead && !B.over) drawRespawn(ctx, B);
};

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
  ctx.strokeStyle = 'rgba(0,0,0,0.34)';        stroke(62);
  ctx.strokeStyle = p.roadEdge || p.far;       stroke(56);
  ctx.strokeStyle = p.road || p.fog;           stroke(46);
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = '#FFF2D2';                 stroke(30);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 2;
  for (let L = 26; L < map.total; L += 26) {
    const a = map.atLen(L);
    ctx.beginPath();
    ctx.moveTo(a.x - a.ny * 21, a.y + a.nx * 21);
    ctx.lineTo(a.x + a.ny * 21, a.y - a.nx * 21);
    ctx.stroke();
  }
  ctx.restore();
}

/* ── 裝飾物：依章節主題 ── */
function drawProp(ctx, pr, p) {
  const s = pr.s * (pr.kind === 2 ? 12 : 18);
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
function drawUnit(ctx, e, sp) {
  if (e.isBoss) { drawBoss(ctx, e, sp); return; }

  const pop = spawnScale(e);
  const s = e.size * 0.92 * pop;
  const face = (e.facing >= 0 ? 1 : -1) * (sp.nx >= 0 ? 1 : -1);
  const arc = swingArc(e);
  const hurt = hurtLean(e);
  const mv = e.moving ? 1 : 0;
  const ph = e.bob || 0;

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

/* ── 魔王：比主角大上一整個量級 ── */
function drawBoss(ctx, e, sp) {
  const pop = spawnScale(e);
  const s = e.size * pop;                       // 體型基準，主角是 16
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

  ctx.save();
  ctx.globalAlpha = pop < 1 ? pop : 1;

  /* 落地的壓迫感：兩層影子 */
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath(); ctx.ellipse(sp.x, y + s * 0.26, s * 1.3, s * 0.48, 0, 0, 6.3); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(sp.x, y + s * 0.26, s * 1.75, s * 0.62, 0, 0, 6.3); ctx.fill();

  /* 詠唱：腳下的光圈 */
  if (cast > 0) {
    ctx.save();
    ctx.globalAlpha = cast * 0.7;
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
  ctx.globalAlpha = 0.35;
  ctx.beginPath(); ctx.ellipse(x - face * s * 0.28, ty - s * 0.26, s * 0.36, s * 0.22, -0.4, 0, 6.3); ctx.fill();
  ctx.globalAlpha = pop < 1 ? pop : 1;
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
  const top = Math.max(y - s * 2.44, 40);
  bar(ctx, sp.x, top - 16, 190, 11, e.hp / e.maxHp, '#C8503E');
  label(ctx, sp.x, top - 22, e.name);
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
    ctx.globalAlpha = Math.min(1, glow);
    ctx.beginPath(); ctx.arc(hx + face * s * 0.12, hy - s * 0.02, s * 0.17, 0, 6.3); ctx.fill();
    ctx.globalAlpha = 1;
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
    ctx.globalAlpha = Math.min(1, glow);
    ctx.fillStyle = '#FFF0C0';
    ctx.beginPath();
    ctx.moveTo(hx - s * 0.34, hy - s * 0.26);
    ctx.quadraticCurveTo(hx - s * 0.12, hy - s * 0.92, hx + s * 0.04, hy - s * 0.44);
    ctx.quadraticCurveTo(hx + s * 0.22, hy - s * 0.82, hx + s * 0.34, hy - s * 0.26);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = dark;
    ctx.fillRect(hx - s * 0.46, hy - s * 0.48, s * 0.92, s * 0.2);
  }

  /* 共用：兩顆發亮的眼睛 */
  ctx.fillStyle = '#120E0A';
  ctx.fillRect(hx + face * s * 0.04 - s * 0.28, hy - s * 0.08, s * 0.5, s * 0.15);
  ctx.globalAlpha = Math.min(1, glow);
  ctx.fillStyle = eye;
  ctx.fillRect(hx + face * s * 0.04 - s * 0.24, hy - s * 0.05, s * 0.16, s * 0.09);
  ctx.fillRect(hx + face * s * 0.04 + s * 0.08, hy - s * 0.05, s * 0.16, s * 0.09);
  ctx.globalAlpha = 1;
}

/* 各章魔王的武器，畫在已經旋轉好的手上 */
function bossWeapon(ctx, shape, s, col, lit) {
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
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#FFE4A0';
    ctx.beginPath(); ctx.arc(0, -s * 1.18, s * 0.62, 0, 6.3); ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = '#C9C2B2';
    ctx.fillRect(-s * 0.11, -s * 1.2, s * 0.22, s * 1.42);
  }
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
  const r = 16;
  const face = (h.facing >= 0 ? 1 : -1) * (sp.nx >= 0 ? 1 : -1);
  const cls = B.cls;
  const arc = swingArc(h);
  const hurt = hurtLean(h);
  const mv = h.moving ? 1 : 0;
  const ph = h.bob || 0;

  const step = Math.sin(ph);
  const bounce = mv ? Math.abs(step) * r * 0.16 : 0;
  const breath = mv ? 0 : Math.sin(ph) * r * 0.05;
  const x = sp.x + face * arc * r * 0.4 - face * hurt * r * 0.3;
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
    ctx.font = (t.big ? 'bold 16px ' : 'bold 12px ') + '"Silkscreen", monospace';
    ctx.textAlign = 'center';
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

function label(ctx, cx, y, text) {
  ctx.font = '11px "Noto Sans TC", sans-serif';
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
