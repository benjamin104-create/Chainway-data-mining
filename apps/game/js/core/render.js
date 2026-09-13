/* 戰場繪製：程序生成的視差背景 + 塊狀像素風單位 */
window.G = window.G || {};

const R = {};
G.R = R;

const W = 960, H = 420;
const GY = 322;

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

R.setup = function (canvas) {
  R.canvas = canvas;
  canvas.width = W;
  canvas.height = H;
  R.ctx = canvas.getContext('2d');
  R.ctx.imageSmoothingEnabled = false;
};

/* ── 視差層：把剪影畫進離屏 canvas，之後平鋪捲動 ── */
function makeLayer(w, h, drawFn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  drawFn(x, w, h);
  return c;
}

function silhouette(ctx, motif, w, h, color, seed, sizeMul) {
  const rand = rng(seed);
  ctx.fillStyle = color;
  const base = h;
  const n = Math.ceil(w / 150);
  for (let i = 0; i <= n; i++) {
    const cx = (i / n) * w + (rand() - 0.5) * 60;
    const s = (0.6 + rand() * 0.7) * sizeMul;
    const hgt = h * 0.72 * s;
    switch (motif) {
      case 'ziggurat': {
        const steps = 4 + Math.floor(rand() * 3);
        const bw = 150 * s;
        for (let k = 0; k < steps; k++) {
          const sw = bw * (1 - k / (steps + 0.6));
          const sh = hgt / steps;
          ctx.fillRect(cx - sw / 2, base - sh * (k + 1), sw, sh + 1);
        }
        break;
      }
      case 'pyramid': {
        const bw = 210 * s;
        ctx.beginPath();
        ctx.moveTo(cx - bw / 2, base);
        ctx.lineTo(cx, base - hgt);
        ctx.lineTo(cx + bw / 2, base);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'mesa': {
        const bw = 200 * s;
        ctx.beginPath();
        ctx.moveTo(cx - bw / 2, base);
        ctx.lineTo(cx - bw / 2 + 24, base - hgt * 0.6);
        ctx.lineTo(cx + bw / 2 - 24, base - hgt * 0.6);
        ctx.lineTo(cx + bw / 2, base);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'ruins_sea': {
        const cw = 22 * s;
        const ch = hgt * (0.4 + rand() * 0.6);
        ctx.fillRect(cx - cw / 2, base - ch, cw, ch);
        ctx.fillRect(cx - cw * 0.9, base - ch - 8, cw * 1.8, 9);
        break;
      }
      case 'moai': {
        const bw = 46 * s, bh = hgt * 0.75;
        ctx.fillRect(cx - bw / 2, base - bh, bw, bh);
        ctx.fillRect(cx - bw * 0.62, base - bh - bw * 0.5, bw * 1.24, bw * 0.62);
        break;
      }
      case 'storm_sea': {
        ctx.beginPath();
        ctx.moveTo(cx - 130 * s, base);
        for (let k = 0; k <= 8; k++) {
          const px = cx - 130 * s + (260 * s) * (k / 8);
          const py = base - hgt * 0.35 * Math.abs(Math.sin(k * 1.4 + seed));
          ctx.lineTo(px, py);
        }
        ctx.lineTo(cx + 130 * s, base);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'henge': {
        const pw = 26 * s, gap = 40 * s, ph = hgt * 0.7;
        ctx.fillRect(cx - gap - pw, base - ph, pw, ph);
        ctx.fillRect(cx + gap, base - ph, pw, ph);
        ctx.fillRect(cx - gap - pw - 6, base - ph - 18, (gap + pw) * 2 + 12, 18);
        break;
      }
    }
  }
}

R.buildBackdrop = function (chapter) {
  const p = chapter.palette;
  const seed = chapter.id.split('').reduce((a, c) => a + c.charCodeAt(0), 7);

  R.bg = {
    palette: p,
    far: makeLayer(1200, 240, (x, w, h) => silhouette(x, chapter.motif, w, h, p.far, seed, 0.62)),
    mid: makeLayer(1000, 300, (x, w, h) => silhouette(x, chapter.motif, w, h, p.mid, seed + 31, 1.0)),
    near: makeLayer(800, 140, (x, w, h) => {
      const rand = rng(seed + 99);
      x.fillStyle = p.near;
      for (let i = 0; i < 50; i++) {
        const bx = rand() * w, bw = 8 + rand() * 26, bh = 5 + rand() * 16;
        x.fillRect(bx, h - bh, bw, bh);
      }
    }),
    motes: Array.from({ length: 60 }, () => ({
      x: Math.random() * W, y: Math.random() * GY,
      s: 0.5 + Math.random() * 1.6, sp: 6 + Math.random() * 18, ph: Math.random() * 6.28
    }))
  };
};

function tile(ctx, img, offset, y, alpha) {
  const w = img.width;
  let ox = -((offset % w) + w) % w;
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  while (ox < W) { ctx.drawImage(img, Math.round(ox), Math.round(y)); ox += w; }
  ctx.globalAlpha = 1;
}

/* ══════════ 主繪製 ══════════ */
R.draw = function () {
  const B = G.B, ctx = R.ctx;
  if (!B.stage) return;
  const p = R.bg.palette;
  const cam = B.camX;

  ctx.save();
  if (B.shake > 0) ctx.translate((Math.random() - 0.5) * B.shake, (Math.random() - 0.5) * B.shake * 0.6);

  /* 天空 */
  const sky = ctx.createLinearGradient(0, 0, 0, GY);
  sky.addColorStop(0, p.sky);
  sky.addColorStop(1, p.fog);
  ctx.fillStyle = sky;
  ctx.fillRect(-20, -20, W + 40, GY + 20);

  /* 光柱 */
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = '#FFE9B0';
  ctx.beginPath();
  ctx.moveTo(W * 0.18, -20); ctx.lineTo(W * 0.34, -20);
  ctx.lineTo(W * 0.52, GY); ctx.lineTo(W * 0.12, GY);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  tile(ctx, R.bg.far, cam * 0.18, GY - R.bg.far.height, 0.5);
  tile(ctx, R.bg.mid, cam * 0.42, GY - R.bg.mid.height, 0.95);

  /* 地面 */
  ctx.fillStyle = p.ground;
  ctx.fillRect(-20, GY, W + 40, H - GY + 20);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(-20, GY, W + 40, 4);
  tile(ctx, R.bg.near, cam * 0.8, H - R.bg.near.height, 0.6);

  /* 地面紋理刻線 */
  ctx.strokeStyle = 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 1;
  const step = 48;
  const start = -((cam % step) + step) % step;
  for (let x = start; x < W; x += step) {
    ctx.beginPath();
    ctx.moveTo(Math.round(x), GY + 6);
    ctx.lineTo(Math.round(x) - 16, H);
    ctx.stroke();
  }

  /* 塵埃 */
  ctx.fillStyle = 'rgba(255,228,170,0.35)';
  R.bg.motes.forEach(m => {
    const mx = (m.x - cam * 0.5 * 0.2 + B.time * m.sp) % W;
    const my = m.y + Math.sin(B.time + m.ph) * 8;
    ctx.fillRect(Math.round((mx + W) % W), Math.round(my), m.s, m.s);
  });

  /* 終點距離指示 */
  drawFinishLine(ctx, cam, B);

  /* 僱用所 */
  if (B.posts) B.posts.forEach(pp => drawPost(ctx, pp, cam, B));

  /* 實體：先建築後單位 */
  const list = B.entities.filter(e => !e.dead || e === B.hero);
  list.filter(e => e.isStructure).forEach(e => drawStructure(ctx, e, cam, p));
  list.filter(e => !e.isStructure).sort((a, b) => (a.z || 0) - (b.z || 0)).forEach(e => {
    if (e === B.hero) drawHero(ctx, e, cam);
    else drawUnit(ctx, e, cam);
  });

  /* 特效 */
  B.effects.forEach(f => drawEffect(ctx, f, cam));

  /* 投射物 */
  B.projectiles.forEach(pr => {
    const sx = pr.x - cam, sy = GY + (pr.z || 0) * 0.5 + (pr.y || -22);
    ctx.fillStyle = pr.color;
    ctx.fillRect(Math.round(sx - pr.size / 2), Math.round(sy - pr.size / 2), pr.size, pr.size);
    ctx.globalAlpha = 0.35;
    ctx.fillRect(Math.round(sx - pr.size / 2 - Math.sign(pr.vx || 0) * 6), Math.round(sy - pr.size / 4), pr.size, Math.max(1, pr.size / 2));
    ctx.globalAlpha = 1;
  });

  /* 粒子 */
  B.particles.forEach(pt => {
    ctx.globalAlpha = Math.max(0, 1 - pt.t / pt.dur);
    ctx.fillStyle = pt.color;
    ctx.fillRect(Math.round(pt.x - cam), Math.round(GY + (pt.z || 0) * 0.5 + pt.y), pt.size, pt.size);
  });
  ctx.globalAlpha = 1;

  /* 飄字 */
  B.texts.forEach(t => {
    const a = Math.max(0, 1 - t.t / t.dur);
    ctx.globalAlpha = a;
    ctx.font = (t.big ? 'bold 17px ' : 'bold 13px ') + '"Silkscreen", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(t.text, Math.round(t.x - cam) + 1, Math.round(GY + t.dy) + 1);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, Math.round(t.x - cam), Math.round(GY + t.dy));
  });
  ctx.globalAlpha = 1;

  /* 暗角 */
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  ctx.restore();

  if (B.hero.dead && !B.over) drawRespawn(ctx, B);
};

function drawFinishLine(ctx, cam, B) {
  const x = B.stage.length - cam;
  if (x > -40 && x < W + 40) {
    ctx.strokeStyle = 'rgba(255,220,150,0.25)';
    ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.moveTo(Math.round(x), 0); ctx.lineTo(Math.round(x), GY); ctx.stroke();
    ctx.setLineDash([]);
  }
  // 封鎖線：哨塔還在，就過不去
  if (B.frontLine != null && B.frontLine < B.stage.length) {
    const fx = Math.round(B.frontLine - cam);
    if (fx > -20 && fx < W + 20) {
      ctx.save();
      const g = ctx.createLinearGradient(fx - 26, 0, fx + 6, 0);
      g.addColorStop(0, 'rgba(200,80,62,0)');
      g.addColorStop(1, 'rgba(200,80,62,0.22)');
      ctx.fillStyle = g;
      ctx.fillRect(fx - 26, 0, 32, GY);
      ctx.strokeStyle = 'rgba(200,80,62,0.5)';
      ctx.setLineDash([5, 7]);
      ctx.beginPath(); ctx.moveTo(fx, 0); ctx.lineTo(fx, GY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '10px "Noto Sans TC", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(230,180,160,0.75)';
      ctx.fillText('哨塔未破', fx - 8, 22);
      ctx.restore();
    }
  }
}

/* ── 建築 ── */
function drawStructure(ctx, e, cam, p) {
  const x = Math.round(e.x - cam);
  if (x < -120 || x > W + 120) return;
  if (e.isGear) { drawGear(ctx, e, x); return; }
  const h = e.isWall ? 70 : e.isTurret ? 78 : (e.faction === 'ally' ? 108 : (e.isMain ? 136 : 104));
  const w = e.isWall ? 18 : e.isTurret ? 30 : (e.isMain ? 64 : 52);
  const top = GY - h;

  ctx.save();
  // 影子
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(x, GY + 3, w * 0.62, 7, 0, 0, 6.3); ctx.fill();

  const bodyCol = e.faction === 'ally' ? '#6B5334' : '#3E3428';
  const trimCol = e.faction === 'ally' ? '#E0B23C' : (p.accent || '#8E3B2E');

  ctx.fillStyle = e.hitFlash > 0 ? '#FFF3D0' : bodyCol;
  ctx.fillRect(x - w / 2, top, w, h);

  // 分層磚
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  for (let y = top + 12; y < GY; y += 14) ctx.fillRect(x - w / 2, y, w, 2);

  // 城垛
  ctx.fillStyle = bodyCol;
  for (let i = 0; i < 4; i++) ctx.fillRect(x - w / 2 + i * (w / 4) + 2, top - 10, w / 4 - 4, 10);

  // 釉磚飾帶
  ctx.fillStyle = trimCol;
  ctx.fillRect(x - w / 2, top + h * 0.32, w, 6);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 5; i++) ctx.fillRect(x - w / 2 + i * (w / 5) + w / 10, top + h * 0.32, 2, 6);

  if (e.invuln) {
    ctx.globalAlpha = 0.28 + Math.sin(G.B.time * 4) * 0.1;
    ctx.fillStyle = '#8FB8FF';
    ctx.fillRect(x - w / 2 - 5, top - 14, w + 10, h + 16);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  bar(ctx, x, top - 22, Math.max(48, w + 12), 6, e.hp / e.maxHp, e.faction === 'ally' ? '#7FBF6A' : '#C8503E');
  label(ctx, x, top - 28, e.name + (e.invuln ? '（無敵）' : ''));
}

/* ── 小兵 / 頭目 ── */
function drawUnit(ctx, e, cam) {
  const x = Math.round(e.x - cam);
  if (x < -80 || x > W + 80) return;
  const baseY = GY + (e.z || 0) * 0.5;
  const s = e.size;
  const bob = Math.sin((e.bob || 0)) * 2;

  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath(); ctx.ellipse(x, baseY + 2, s * 0.8, s * 0.26, 0, 0, 6.3); ctx.fill();

  const col = e.hitFlash > 0 ? '#FFF3D0' : e.color;
  const y = baseY - s - 2 + bob;

  // 身體（塊狀）
  ctx.fillStyle = col;
  ctx.fillRect(x - s * 0.62, y, s * 1.24, s * 1.05);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x - s * 0.62, y + s * 0.72, s * 1.24, s * 0.33);

  // 腳
  ctx.fillStyle = col;
  ctx.fillRect(x - s * 0.45, baseY - 5, s * 0.34, 5);
  ctx.fillRect(x + s * 0.12, baseY - 5, s * 0.34, 5);

  // 眼
  ctx.fillStyle = '#12100C';
  const ex = e.facing >= 0 ? 0.1 : -0.34;
  ctx.fillRect(x + s * ex, y + s * 0.22, s * 0.2, s * 0.26);

  // 武器
  ctx.fillStyle = e.kind2 === 'ranged' || e.kind2 === 'caster' ? '#D8C08A' : '#CFCFC4';
  const wdir = e.facing >= 0 ? 1 : -1;
  if (e.swing > 0) {
    ctx.fillRect(x + wdir * s * 0.5, y - s * 0.35, wdir * s * 0.7, 4);
  } else {
    ctx.fillRect(x + wdir * s * 0.55, y + s * 0.1, 3, s * 0.65);
  }

  if (e.kind === 'hired') {
    ctx.fillStyle = '#E0B23C';
    ctx.fillRect(x - 3, y - 7, 6, 2);
    ctx.fillRect(x - 1, y - 10, 2, 5);
  }

  if (e.isBoss) {
    ctx.fillStyle = '#FFD469';
    ctx.fillRect(x - s * 0.5, y - 8, s, 4);
    bar(ctx, x, y - 26, 110, 8, e.hp / e.maxHp, '#C8503E');
    label(ctx, x, y - 32, e.name);
  } else if (e.hp < e.maxHp) {
    bar(ctx, x, y - 10, s * 2.2, 3, e.hp / e.maxHp, e.faction === 'ally' ? '#7FBF6A' : '#C8503E');
  }
  if (e.slowUntil > G.B.time) {
    ctx.fillStyle = 'rgba(140,190,255,0.5)';
    ctx.fillRect(x - s * 0.7, baseY - 3, s * 1.4, 3);
  }
}

/* ── 英雄：橘色黏土球戰士 ── */
function drawHero(ctx, h, cam) {
  const B = G.B;
  const x = Math.round(h.x - cam);
  const baseY = GY;
  if (h.dead) return;
  const r = 17;
  const bob = Math.sin(h.bob) * 2.2;
  const y = baseY - r * 1.5 + bob;
  const f = h.facing;
  const cls = B.cls;

  ctx.save();
  if (h.invuln > 0 && Math.floor(B.time * 20) % 2 === 0) ctx.globalAlpha = 0.45;

  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath(); ctx.ellipse(x, baseY + 2, r * 0.95, r * 0.3, 0, 0, 6.3); ctx.fill();

  // 腳
  ctx.fillStyle = '#C4632E';
  ctx.fillRect(x - r * 0.6, baseY - 6, r * 0.5, 6);
  ctx.fillRect(x + r * 0.12, baseY - 6, r * 0.5, 6);

  // 身體
  const body = h.hitFlash > 0 ? '#FFF0CF' : '#E07A3F';
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.45, r, r * 0.98, 0, 0, 6.3);
  ctx.fill();
  // 高光
  ctx.fillStyle = 'rgba(255,214,170,0.55)';
  ctx.fillRect(x - r * 0.72, y - r * 0.12, r * 0.36, r * 0.22);
  // 底部陰影
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x - r * 0.86, y + r * 1.02, r * 1.72, r * 0.34);

  // 眼睛
  const eox = f >= 0 ? 2 : -2;
  ctx.fillStyle = '#F6EFE0';
  ctx.fillRect(x - r * 0.52 + eox, y + r * 0.06, r * 0.34, r * 0.5);
  ctx.fillRect(x + r * 0.16 + eox, y + r * 0.06, r * 0.34, r * 0.5);
  ctx.fillStyle = '#141110';
  ctx.fillRect(x - r * 0.44 + eox + (f >= 0 ? 2 : 0), y + r * 0.14, r * 0.2, r * 0.36);
  ctx.fillRect(x + r * 0.24 + eox + (f >= 0 ? 2 : 0), y + r * 0.14, r * 0.2, r * 0.36);

  // 盾（後手）
  ctx.fillStyle = '#8E8477';
  const sx = x - f * r * 0.95;
  ctx.beginPath(); ctx.ellipse(sx, y + r * 0.55, r * 0.38, r * 0.55, 0, 0, 6.3); ctx.fill();
  ctx.fillStyle = cls.color2;
  ctx.beginPath(); ctx.ellipse(sx, y + r * 0.55, r * 0.2, r * 0.3, 0, 0, 6.3); ctx.fill();

  // 武器（前手）：依職業換造型
  const wx = x + f * r * 0.9;
  ctx.save();
  ctx.translate(wx, y + r * 0.5);
  ctx.rotate(h.swing > 0 ? (-f * 1.1) : (-f * 0.25));
  ctx.fillStyle = '#D9D6CC';
  if (cls.id === 'stonespeaker') {
    ctx.fillStyle = '#8A6A44'; ctx.fillRect(-2, -r * 1.2, 4, r * 1.9);
    ctx.fillStyle = cls.color; ctx.fillRect(-6, -r * 1.5, 12, 10);
  } else if (cls.id === 'lampwarden') {
    ctx.fillStyle = '#6E5A3A'; ctx.fillRect(-2, -r * 1.3, 4, r * 1.2);
    ctx.fillStyle = '#E0B23C'; ctx.fillRect(-7, -r * 1.3, 14, 12);
    ctx.fillStyle = 'rgba(255,230,150,0.5)'; ctx.fillRect(-12, -r * 1.35, 24, 22);
  } else if (cls.id === 'shadowbinder') {
    ctx.fillStyle = '#C4AEF5'; ctx.fillRect(-2, -r * 1.0, 4, r * 1.4);
    ctx.fillStyle = '#4A3580'; ctx.fillRect(-5, r * 0.35, 10, 4);
  } else {
    ctx.fillStyle = '#DCD8CC'; ctx.fillRect(-3, -r * 1.35, 6, r * 1.75);
    ctx.fillStyle = '#B9B4A6'; ctx.fillRect(-3, -r * 1.35, 2, r * 1.75);
    ctx.fillStyle = '#7A5C34'; ctx.fillRect(-7, r * 0.4, 14, 5);
  }
  ctx.restore();

  // 護盾值
  if (h.shield > 0) {
    ctx.strokeStyle = 'rgba(150,200,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.45, r * 1.35, r * 1.3, 0, 0, 6.3); ctx.stroke();
  }
  // 增益光環
  if (B.buffs.length) {
    ctx.strokeStyle = B.buffs[0].color || '#E0B23C';
    ctx.globalAlpha = 0.5 + Math.sin(B.time * 6) * 0.2;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, baseY, r * 1.5, r * 0.45, 0, 0, 6.3); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  bar(ctx, x, y - 14, 46, 5, h.hp / h.maxHp, '#E07A3F');
}

function drawEffect(ctx, f, cam) {
  const k = f.t / f.dur;
  const x = f.x - cam;
  ctx.save();
  switch (f.type) {
    case 'arc': {
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      const a0 = f.facing > 0 ? -1.0 : Math.PI + 1.0;
      const a1 = f.facing > 0 ? 1.0 : Math.PI - 1.0;
      ctx.arc(x, GY - 22, f.r * (0.5 + k * 0.5), Math.min(a0, a1), Math.max(a0, a1));
      ctx.stroke();
      break;
    }
    case 'ring': {
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 4;
      const rr = f.r + (f.max - f.r) * k;
      ctx.beginPath(); ctx.ellipse(x, GY, rr, rr * 0.34, 0, 0, 6.3); ctx.stroke();
      break;
    }
    case 'telegraph': {
      ctx.globalAlpha = 0.22 + Math.sin(f.t * 22) * 0.1;
      ctx.fillStyle = f.color;
      ctx.beginPath(); ctx.ellipse(x, GY, f.r, f.r * 0.34, 0, 0, 6.3); ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = f.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, GY, f.r, f.r * 0.34, 0, 0, 6.3); ctx.stroke();
      break;
    }
    case 'trail': {
      ctx.globalAlpha = (1 - k) * 0.7;
      ctx.fillStyle = f.color;
      const a = Math.min(f.x, f.x2) - cam, b = Math.max(f.x, f.x2) - cam;
      ctx.fillRect(a, GY - 34, b - a, 24);
      break;
    }
    case 'beam': {
      ctx.globalAlpha = 1 - k;
      const a = Math.min(f.x, f.x2) - cam, b = Math.max(f.x, f.x2) - cam;
      ctx.fillStyle = f.color;
      ctx.fillRect(a, GY - 30 - f.w / 2, b - a, f.w);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(a, GY - 30 - f.w / 6, b - a, f.w / 3);
      break;
    }
  }
  ctx.restore();
}

/* ── 僱用所 ── */
function drawPost(ctx, pp, cam, B) {
  const x = Math.round(pp.x - cam);
  if (x < -80 || x > W + 80) return;
  const active = B.activePost === pp;
  const empty = pp.stock.every(n => n <= 0);
  const t = B.time;

  ctx.save();
  ctx.globalAlpha = empty ? 0.34 : 1;

  // 地上的光圈
  if (active) {
    ctx.globalAlpha = 0.28 + Math.sin(t * 4) * 0.1;
    ctx.fillStyle = '#E0B23C';
    ctx.beginPath(); ctx.ellipse(x, GY, 74, 20, 0, 0, 6.3); ctx.fill();
    ctx.globalAlpha = empty ? 0.34 : 1;
  }

  // 柱
  ctx.fillStyle = '#5A4628';
  ctx.fillRect(x - 20, GY - 44, 4, 44);
  ctx.fillRect(x + 16, GY - 44, 4, 44);
  // 雨棚
  ctx.fillStyle = '#8A6A1E';
  ctx.beginPath();
  ctx.moveTo(x - 30, GY - 44); ctx.lineTo(x, GY - 60); ctx.lineTo(x + 30, GY - 44);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#C09A54';
  for (let i = 0; i < 4; i++) ctx.fillRect(x - 28 + i * 15, GY - 44, 7, 4);
  // 箱
  ctx.fillStyle = '#6E5636';
  ctx.fillRect(x - 14, GY - 16, 16, 16);
  ctx.fillStyle = '#4A3A24';
  ctx.fillRect(x - 14, GY - 10, 16, 3);
  // 燈
  const lit = 0.6 + Math.sin(t * 3) * 0.2;
  ctx.globalAlpha = (empty ? 0.34 : 1) * lit;
  ctx.fillStyle = '#FFD469';
  ctx.fillRect(x + 8, GY - 34, 6, 8);
  ctx.globalAlpha = (empty ? 0.34 : 1) * lit * 0.3;
  ctx.fillRect(x + 2, GY - 40, 18, 20);
  ctx.globalAlpha = 1;
  ctx.restore();

  label(ctx, x, GY - 70, pp.name + (empty ? '（已調度完）' : ''));
  if (active && !empty) {
    ctx.font = '11px "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFD469';
    ctx.fillText('可僱用', x, GY - 84);
  }
}

/* ── 武具 ── */
function drawGear(ctx, e, x) {
  const s = e.size;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath(); ctx.ellipse(x, GY + 2, s * 0.9, s * 0.28, 0, 0, 6.3); ctx.fill();
  const col = e.hitFlash > 0 ? '#FFF3D0' : (e.color || '#C09A54');

  if (e.gearKind === 'h_barricade' || e.isBlocker) {
    ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(x - s, GY); ctx.lineTo(x + s, GY - s * 1.5);
    ctx.moveTo(x + s, GY); ctx.lineTo(x - s, GY - s * 1.5);
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.fillRect(x - s, GY - s * 0.85, s * 2, 4);
  } else if (e.gearKind === 'h_oil') {
    ctx.fillStyle = '#4A3A24';
    ctx.fillRect(x - s * 0.8, GY - s, s * 1.6, s);
    ctx.fillStyle = col;
    ctx.fillRect(x - s * 0.9, GY - s - 4, s * 1.8, 5);
    const f = 0.7 + Math.sin(G.B.time * 9) * 0.3;
    ctx.fillStyle = '#E0862A';
    ctx.fillRect(x - s * 0.4, GY - s - 6 - 10 * f, s * 0.8, 10 * f);
    ctx.fillStyle = '#FFD469';
    ctx.fillRect(x - s * 0.18, GY - s - 4 - 8 * f, s * 0.36, 7 * f);
  } else {
    // 戰旗
    ctx.fillStyle = '#5A4628';
    ctx.fillRect(x - 2, GY - s * 3.2, 4, s * 3.2);
    const wav = Math.sin(G.B.time * 3) * 3;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x + 2, GY - s * 3.1);
    ctx.lineTo(x + 2 + s * 1.5, GY - s * 2.8 + wav);
    ctx.lineTo(x + 2, GY - s * 2.0);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.16 + Math.sin(G.B.time * 2.2) * 0.05;
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, GY, (e.aura ? e.aura.radius : 200), (e.aura ? e.aura.radius : 200) * 0.3, 0, 0, 6.3); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  bar(ctx, x, GY - s * 2 - 14, Math.max(34, s * 2), 4, e.hp / e.maxHp, '#7FBF6A');
}

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
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillText(text, cx + 1, y + 1);
  ctx.fillStyle = '#E6D7B4';
  ctx.fillText(text, cx, y);
}

function drawRespawn(ctx, B) {
  ctx.save();
  ctx.fillStyle = 'rgba(20,14,10,0.55)';
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

R.W = W; R.H = H;
