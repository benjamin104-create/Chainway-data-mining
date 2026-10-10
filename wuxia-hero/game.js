// 挑戰模式（太鼓達人風）：手勢音符從右往左跑，跑到左邊的判定鼓時比出同樣的手勢
//   良／可／不可：時機越準分數越高；連擊越多，魂量表越滿
//   絕招段：一串框起來的手勢（每位英雄不同），全部打中 → 英雄切入大絕招，之後分數加倍（直到失手）
//   連打：一段時間內手刀一直劈（手張開再併攏算一下），劈越多下分越多
//   最後壓軸：如來神掌
//   配樂 150 BPM，每個音符都在拍點上；開始時自動錄影，結束停止
import { ICON, gestureOf } from './poses.js';
import * as sfx from './sfx.js';

const NAME = { fist: '握拳', palm: '張手', flat: '手刀', sword: '劍指', thumb: '比讚', vee: '插眼' };
// 太鼓的兩種顏色：紅（咚）＝握拳、手刀、比讚；藍（咔）＝張手、劍指、插眼
const COLOR = { fist: '#e8402a', flat: '#e8402a', thumb: '#e8402a', palm: '#2f8fd8', sword: '#2f8fd8', vee: '#2f8fd8' };
const POOL = ['fist', 'palm', 'flat', 'sword', 'thumb', 'vee'];
// 每位英雄的絕招串：照順序比出來就發動
export const COMBOS = {
  guojing: { seq: ['palm', 'flat', 'palm'], name: '降龍十八掌', sub: '飛龍在天' },
  huangrong: { seq: ['flat', 'flat', 'sword'], name: '打狗棒法', sub: '棒打狗頭' },
  xiaofeng: { seq: ['fist', 'fist', 'palm'], name: '擒龍功', sub: '隔空取物' },
  linghu: { seq: ['sword', 'sword', 'sword'], name: '獨孤九劍', sub: '破劍式' },
  yangguo: { seq: ['palm', 'fist', 'palm'], name: '黯然銷魂掌', sub: '心驚肉跳' },
  xiaolongnu: { seq: ['sword', 'flat', 'sword'], name: '玉女素心劍', sub: '雙劍合璧' },
  wuji: { seq: ['palm', 'flat', 'palm'], name: '乾坤大挪移', sub: '借力打力' },
  xuzhu: { seq: ['fist', 'palm', 'palm'], name: '天山六陽掌', sub: '生死符' },
  duanyu: { seq: ['sword', 'vee', 'sword'], name: '六脈神劍', sub: '少商劍' },
  botong: { seq: ['fist', 'palm', 'fist', 'palm'], name: '左右互搏', sub: '自己打自己' },
  dongfang: { seq: ['vee', 'sword', 'flat'], name: '葵花點穴手', sub: '繡花針' },
  // 韋小寶：搞笑秘技
  xiaobao: { seq: ['vee', 'flat', 'flat', 'flat'], name: '插眼連環手刀', sub: '溜之大吉', comic: ['插眼！', '手刀！', '再一刀！', '劈喉嚨！'] },
};

const G = { on: false };
export const gameState = G;
const B = sfx.BEAT;

export function startGame(t, onEnd, opt = {}) {
  const combo = COMBOS[opt.hero] || COMBOS.guojing, notes = [];
  const pick = (prev) => { let g; do g = POOL[Math.floor(Math.random() * POOL.length)]; while (g === prev && Math.random() < .7); return g; };
  let beat = 12, prev = null;                              // 前 8 拍倒數，第 12 拍開始
  const add = (n) => { notes.push({ ...n, at: beat * B, res: null }); beat += n.gap || 2; };
  const normal = (k) => { for (let i = 0; i < k; i++) { prev = pick(prev); add({ g: prev, big: Math.random() < .15 }); } };
  const comboRun = (id) => { combo.seq.forEach((g, j) => add({ g, combo: id, cj: j, gap: j === combo.seq.length - 1 ? 3 : 2 })); };
  normal(4); comboRun(1); normal(3);
  notes.push({ roll: true, at: beat * B, end: (beat + 8) * B, res: null, count: 0, label: opt.hero === 'xiaobao' ? '連環手刀！' : '連打手刀！' }); beat += 10;
  normal(3); comboRun(2); normal(3);
  notes.push({ g: 'palm', at: (beat + 1) * B, res: null, special: true }); beat += 6;   // 壓軸：如來神掌
  sfx.startMusic();
  Object.assign(G, { on: true, t0: t, notes, combo, hero: opt.hero, img: opt.img, glow: opt.glow || '#ffd36b',
    score: 0, chain: 0, best: 0, ryo: 0, ka: 0, miss: 0, soul: 0, mult: 1, pops: [], cut: null, ult: null,
    comboOk: {}, end: beat * B, onEnd, done: false, beat: -1, prevFlat: false, musicOff: false });
}
export function stopGame() { G.on = false; sfx.stopMusic(); }

// ── 字 ──
const KOF_LATIN = '"Anton", "Impact", "Arial Black", sans-serif';
const CJK = '"Noto Sans TC", "PingFang TC", sans-serif';
const BRUSH = '"Kouzan Mouhitsu", "Kouzan Gyosho", "Yuji Boku", "Noto Serif TC", serif';
function kofText(ctx, txt, x, y, px, a = 1, hot = false) {
  ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, a));
  ctx.translate(x, y); ctx.transform(1, 0, -.18, 1, 0, 0);
  const cjk = /[㐀-鿿]/.test(txt);
  ctx.font = cjk ? `900 ${px}px ${CJK}` : `400 ${px * 1.15}px ${KOF_LATIN}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = px * .22; ctx.strokeStyle = '#0a0503'; ctx.strokeText(txt, 0, 0);
  ctx.lineWidth = px * .1; ctx.strokeStyle = hot ? '#d81b0c' : '#5a6270'; ctx.strokeText(txt, 0, 0);
  const g = ctx.createLinearGradient(0, -px * .5, 0, px * .5);
  if (hot) { g.addColorStop(0, '#ffffff'); g.addColorStop(.35, '#fff27a'); g.addColorStop(.55, '#ffb000'); g.addColorStop(.75, '#ff4a00'); g.addColorStop(1, '#ffd23a'); }
  else { g.addColorStop(0, '#ffffff'); g.addColorStop(.45, '#e9eef5'); g.addColorStop(.52, '#8a96a8'); g.addColorStop(.8, '#dfe6ef'); g.addColorStop(1, '#ffffff'); }
  ctx.fillStyle = g; ctx.fillText(txt, 0, 0);
  ctx.restore();
}
function label(ctx, txt, x, y, px, fill, a = 1) {
  ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, a));
  ctx.font = `900 ${px}px ${CJK}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = px * .28; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(txt, x, y); ctx.fillStyle = fill; ctx.fillText(txt, x, y);
  ctx.restore();
}
function brush(ctx, txt, x, y, px, fill, a = 1) {
  ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, a));
  ctx.font = `${px}px ${BRUSH}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = px * .16; ctx.strokeStyle = '#0b0806'; ctx.strokeText(txt, x, y);
  ctx.fillStyle = fill; ctx.fillText(txt, x, y); ctx.lineWidth = px * .045; ctx.strokeStyle = fill; ctx.strokeText(txt, x, y);
  ctx.restore();
}
// 漫畫爆炸框（搞笑招式用）
function comicBurst(ctx, x, y, r, txt, k) {
  ctx.save(); ctx.globalAlpha = Math.max(0, 1 - Math.max(0, k - .7) / .3);
  ctx.translate(x, y); ctx.rotate(-.12); const sc = .6 + .4 * Math.min(1, k * 4); ctx.scale(sc, sc);
  ctx.beginPath();
  for (let i = 0; i < 24; i++) { const an = i / 24 * Math.PI * 2, rr = r * (i % 2 ? .72 : 1.05 + .08 * Math.sin(i * 3)); ctx.lineTo(Math.cos(an) * rr * 1.3, Math.sin(an) * rr); }
  ctx.closePath(); ctx.fillStyle = '#ffe14a'; ctx.fill(); ctx.lineWidth = r * .08; ctx.strokeStyle = '#111'; ctx.stroke();
  ctx.font = `900 ${r * .62}px ${CJK}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = r * .12; ctx.strokeStyle = '#fff'; ctx.strokeText(txt, 0, 0); ctx.fillStyle = '#d81b0c'; ctx.fillText(txt, 0, 0);
  ctx.restore();
}

// ── 每一格 ──
export function drawGame(ctx, W, H, u, now, hands, glow, onHit) {
  if (!G.on) return false;
  const t = Math.max(0, now - G.t0), laneY = H * .17, hitX = W * .2, R = W * .075, TRAVEL = B * 6, speed = (W + R - hitX) / TRAVEL;
  const shown = new Set(hands.map((h) => gestureOf(h, W, H)).filter(Boolean));
  const isFlat = shown.has('flat');

  // 倒數：8 拍（READY、3、2、1、GO!）
  const bi = Math.floor(t / B);
  if (t < 12 * B) {
    if (bi !== G.beat && bi % 2 === 0 && bi >= 2 && bi <= 8) sfx.drum(bi === 8);
    G.beat = bi;
    const step = Math.floor(bi / 2), k = (t / B - step * 2) / 2;
    if (step === 0) kofText(ctx, 'READY', W / 2, H * .42, 13 * u, 1, true);
    else if (step <= 3) kofText(ctx, String(4 - step), W / 2, H * .45, 30 * u * (1.3 - .3 * Math.min(1, k * 4)), 1 - Math.max(0, k - .75) / .25);
    else if (step <= 5) kofText(ctx, 'GO!', W / 2, H * .45, 26 * u * (1.3 - .3 * Math.min(1, k * 4)), 1 - Math.max(0, k - .6) / .4, true);
    if (t < 8 * B) label(ctx, '手勢跑到左邊的鼓時，比出一樣的手勢！', W / 2, H * .62, 3.4 * u, '#fff');
    if (t < 8 * B) label(ctx, `框起來的一串＝絕招「${G.combo.name}」，全中分數加倍！`, W / 2, H * .67, 3 * u, '#ffe08a');
  }

  // 跑道（太鼓風：深色帶＋左邊的判定鼓）
  ctx.save();
  ctx.fillStyle = 'rgba(30,18,10,.6)'; ctx.fillRect(0, laneY - R * 1.25, W, R * 2.5);
  ctx.fillStyle = 'rgba(255,224,138,.5)'; ctx.fillRect(0, laneY - R * 1.25, W, .5 * u); ctx.fillRect(0, laneY + R * 1.25 - .5 * u, W, .5 * u);
  const pulse = Math.max(0, 1 - ((t / B) % 1) * 3);       // 跟著拍子閃
  ctx.fillStyle = '#2a1a10'; ctx.beginPath(); ctx.arc(hitX, laneY, R * 1.12, 0, 7); ctx.fill();
  ctx.strokeStyle = `rgba(255,240,200,${.6 + .4 * pulse})`; ctx.lineWidth = 1.1 * u; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = .4 * u; ctx.beginPath(); ctx.arc(hitX, laneY, R * .8, 0, 7); ctx.stroke();
  ctx.restore();
  if (G.mult > 1) kofText(ctx, `×${G.mult}`, hitX, laneY + R * 2.1 + 6 * u, 6 * u, 1, true);   // 倍率

  const WIN = .32, RYO = .12;
  for (const n of G.notes) {
    const dt = t - n.at;
    // ── 連打：手刀一直劈 ──
    if (n.roll) {
      if (t >= n.at - .05 && t <= n.end && isFlat && !G.prevFlat) {
        n.count++; G.score += 30 * G.mult; G.soul = Math.min(1, G.soul + .01); sfx.drum(false);
        G.pops.push(G.hero === 'xiaobao' ? { t, txt: ['劈！', '砍！', '喝！'][n.count % 3], comic: true, roll: true } : { t, txt: `${n.count}`, hot: true, small: true });
      }
      if (!n.res && t > n.end) { n.res = 'done'; if (n.count >= 5) G.pops.push({ t, txt: `${n.count} 連打！`, hot: true }); }
      const x0 = hitX + (n.at - t) * speed, x1 = hitX + (n.end - t) * speed, xs = Math.max(hitX, x0);
      if (x1 > hitX - R && x0 < W + R) {
        ctx.save(); ctx.fillStyle = '#f2b82a'; ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = .6 * u;
        ctx.beginPath(); ctx.roundRect(xs - R * .85, laneY - R * .85, Math.max(R * 1.7, x1 - xs + R * 1.7), R * 1.7, R * .85); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = .45 * u; ICON.flat(ctx, xs, laneY + R * .1, R * .62, false);
        ctx.restore();
        label(ctx, n.label + (n.count ? ` ${n.count}` : ''), Math.max(hitX + R * 2.6, Math.min(W - R * 3, (xs + x1) / 2)), laneY, 3.8 * u, '#fff');
      }
      continue;
    }
    // ── 一般音符的判定 ──
    if (!n.res) {
      if (Math.abs(dt) <= WIN && shown.has(n.g)) {
        n.res = Math.abs(dt) < RYO ? 'ryo' : 'ka'; n.rt = t;
        G.chain++; G.best = Math.max(G.best, G.chain); G[n.res]++;
        const base = (n.res === 'ryo' ? 100 : 50) * (n.big ? 2 : 1);
        G.score += Math.round(base * G.mult * (1 + Math.min(G.chain, 50) * .02));
        G.soul = Math.min(1, G.soul + (n.res === 'ryo' ? .035 : .02));
        G.pops.push({ t, txt: n.res === 'ryo' ? '良' : '可', hot: n.res === 'ryo' });
        if (n.combo && G.combo.comic) G.pops.push({ t, txt: G.combo.comic[n.cj], comic: true });
        sfx.drum(true); if (n.res === 'ryo') sfx.zap();
        onHit?.(n.res, [hitX, laneY]);
        if (n.combo) {
          G.comboOk[n.combo] = (G.comboOk[n.combo] ?? 0) + 1;
          if (G.comboOk[n.combo] === G.combo.seq.length) { G.cut = { t }; G.mult = 2; G.score += 500; sfx.boom(); }   // 絕招發動
        }
        if (n.special) { G.ult = { t }; G.score += 1000; sfx.boom(); }
      } else if (dt > WIN) {
        n.res = 'miss'; n.rt = t; G.chain = 0; G.miss++; G.mult = 1; G.soul = Math.max(0, G.soul - .03);
        if (n.combo) G.comboOk[n.combo] = -99;                // 絕招串斷了
        G.pops.push({ t, txt: '不可', miss: true });
      }
    }
    const x = hitX - dt * speed;
    if (x > W + R * 2 || x < -R * 1.5) continue;
    if (n.res && n.res !== 'miss') {                        // 打中：在鼓上爆開
      const k = (t - n.rt) / .35; if (k > 1 || k < 0) continue;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(hitX, laneY, 0, hitX, laneY, R * (1 + k * 1.8));
      gr.addColorStop(0, `rgba(255,255,255,${.8 * (1 - k)})`); gr.addColorStop(.45, `rgba(255,200,80,${.5 * (1 - k)})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(hitX, laneY, R * (1 + k * 1.8), 0, 7); ctx.fill();
      ctx.restore(); continue;
    }
    // 音符：太鼓的紅／藍圓鼓，大音符更大；絕招串打底金色
    const rr = R * (n.special ? 1.2 : n.big ? 1.12 : .9);
    ctx.save(); ctx.globalAlpha = n.res === 'miss' ? .3 : 1;
    if (n.combo) { ctx.fillStyle = 'rgba(255,200,60,.28)'; ctx.fillRect(x - R * 1.2, laneY - R * 1.2, R * 2.4, R * 2.4); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, laneY, rr + .7 * u, 0, 7); ctx.fill();
    ctx.fillStyle = n.special ? '#d99a00' : COLOR[n.g]; ctx.beginPath(); ctx.arc(x, laneY, rr, 0, 7); ctx.fill();
    ctx.strokeStyle = '#1a0e06'; ctx.lineWidth = .5 * u; ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = .45 * u; ICON[n.g](ctx, x, laneY + rr * .12, rr * .66, false);
    ctx.restore();
    label(ctx, n.special ? '如來神掌' : NAME[n.g], x, laneY + R * 1.55, (n.special ? 4 : 3.4) * u, n.special || n.combo ? '#ffd36b' : '#fff', n.res === 'miss' ? .3 : 1);
  }
  G.prevFlat = isFlat;
  // 絕招串：虛線框＋上方標題
  for (const id of [1, 2]) {
    const first = G.notes.find((n) => n.combo === id), last = [...G.notes].reverse().find((n) => n.combo === id);
    if (!first) continue;
    const x0 = hitX - (t - first.at) * speed, x1 = hitX - (t - last.at) * speed;
    if (x1 < -R || x0 > W + R || G.comboOk[id] < 0 || G.comboOk[id] >= G.combo.seq.length) continue;
    ctx.save(); ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = .6 * u; ctx.setLineDash([1.2 * u, .8 * u]);
    ctx.strokeRect(x0 - R * 1.2, laneY - R * 1.2, x1 - x0 + R * 2.4, R * 2.4); ctx.restore();
    label(ctx, `絕招：${G.combo.name}`, Math.max(R * 4, Math.min(W - R * 4, (x0 + x1) / 2)), laneY - R * 1.25 - 6.6 * u, 3.4 * u, '#ffd36b');
  }

  // 分數、連擊、魂量表
  kofText(ctx, `${G.score}`, W - 11 * u, laneY + R * 2.1, 6.5 * u, 1, true);
  if (G.chain >= 3) kofText(ctx, `${G.chain} COMBO`, W * .6, laneY + R * 3.3, 7 * u, 1, G.chain >= 10);
  ctx.save(); const gx = W * .05, gy = laneY - R * 1.25 - 3.4 * u, gw = W * .86;
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(gx, gy, gw, 2.2 * u);
  const sg = ctx.createLinearGradient(gx, 0, gx + gw, 0); sg.addColorStop(0, '#ff7a1a'); sg.addColorStop(.8, '#ffd23a'); sg.addColorStop(1, '#fff3a0');
  ctx.fillStyle = sg; ctx.fillRect(gx, gy, gw * G.soul, 2.2 * u);
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(gx + gw * .8, gy - .4 * u, .4 * u, 3 * u);   // 過關線
  ctx.restore();
  label(ctx, '魂', gx + gw + 3 * u, gy + 1.1 * u, 3.2 * u, G.soul >= .8 ? '#ffd23a' : '#fff');

  G.pops = G.pops.filter((p) => t - p.t < .75);
  for (const p of G.pops) {
    const k = (t - p.t) / .75;
    if (p.comic) comicBurst(ctx, W * .62 + (p.roll ? ((p.t * 97) % 1 - .5) * W * .3 : 0), H * .42, 9 * u, p.txt, k);
    else kofText(ctx, p.txt, p.small ? hitX + R * 2.2 : hitX, laneY + R * (p.small ? .1 : 2), (p.miss ? 6 : p.small ? 5 : 8) * u * (1.3 - .3 * Math.min(1, k * 4)), 1 - k * k, p.hot);
  }
  if (G.cut) drawCutIn(ctx, W, H, u, t - G.cut.t);
  if (G.ult) drawUlt(ctx, W, H, u, t - G.ult.t);

  // 結束
  if (!G.musicOff && t > G.end - B * 2) { G.musicOff = true; sfx.stopMusic(1.2); }
  if (t > G.end) {
    const k = Math.min(1, (t - G.end) / .4), total = G.notes.filter((n) => !n.roll).length;
    const rate = (G.ryo + G.ka * .6) / total;
    const title = rate > .85 ? '武林盟主' : rate > .6 ? '一代宗師' : rate > .35 ? '江湖新秀' : '初入江湖';
    ctx.save(); ctx.globalAlpha = .6 * k; ctx.fillStyle = '#000'; ctx.fillRect(0, H * .3, W, H * .34); ctx.restore();
    kofText(ctx, G.soul >= .8 ? 'CLEAR!' : 'FINISH!', W / 2, H * .35, 9 * u, k, G.soul >= .8);
    kofText(ctx, title, W / 2, H * .45, 14 * u * (1.3 - .3 * k), k, true);
    kofText(ctx, `SCORE ${G.score}   MAX ${G.best} COMBO`, W / 2, H * .55, 4.6 * u, k, false);
    label(ctx, `良 ${G.ryo}　可 ${G.ka}　不可 ${G.miss}`, W / 2, H * .6, 3.4 * u, '#fff', k);
    if (!G.done && t > G.end + 2.4) { G.done = true; G.on = false; sfx.gong(); G.onEnd?.({ score: G.score, title, best: G.best }); }
  }
  return G.on;
}

// ── 絕招切入：斜斜的色帶從右邊切進來，英雄的圖滑過去，毛筆大字寫招式名，蓋上「×2」 ──
function drawCutIn(ctx, W, H, u, age) {
  if (age > 1.8) return;
  const k = Math.min(1, age / .25), out = age > 1.45 ? (age - 1.45) / .35 : 0, comic = !!G.combo.comic;
  ctx.save();
  ctx.globalAlpha = .55 * (1 - out); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  ctx.translate(W / 2, H * .46); ctx.rotate(-.18);
  const bw = W * 1.6, bh = H * .3, slide = (1 - k) * W * 1.2 - out * W * 1.2;
  ctx.translate(slide, 0);
  ctx.save(); ctx.beginPath(); ctx.rect(-bw / 2, -bh / 2, bw, bh); ctx.clip();
  const bg = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
  if (comic) { bg.addColorStop(0, '#ffe14a'); bg.addColorStop(1, '#ff9a1a'); } else { bg.addColorStop(0, '#120a06'); bg.addColorStop(.5, G.glow); bg.addColorStop(1, '#120a06'); }
  ctx.fillStyle = bg; ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
  if (comic) { ctx.fillStyle = 'rgba(200,40,0,.25)'; for (let x = -bw / 2; x < bw / 2; x += 2.4 * u) for (let y = -bh / 2; y < bh / 2; y += 2.4 * u) { ctx.beginPath(); ctx.arc(x, y, .6 * u, 0, 7); ctx.fill(); } }   // 漫畫網點
  else { ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = .4 * u; for (let i = 0; i < 14; i++) { const y = -bh / 2 + bh * ((i * 37 % 14) / 14); ctx.beginPath(); ctx.moveTo(-bw / 2, y); ctx.lineTo(bw / 2, y); ctx.stroke(); } }   // 速度線
  if (G.img) { const ih = bh * 1.5, iw = ih * G.img.width / G.img.height; ctx.drawImage(G.img, W * .1 - age * W * .08, -bh * .42, iw, ih); }
  ctx.restore();
  ctx.lineWidth = .8 * u; ctx.strokeStyle = comic ? '#111' : '#ffe08a'; ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
  ctx.restore();
  const a = Math.min(1, (age - .15) * 5) * (1 - out);
  if (comic) { comicBurst(ctx, W * .36, H * .42, 12 * u, '插眼！', Math.min(.69, age * 2)); kofText(ctx, G.combo.name, W * .5, H * .6, 8 * u, a, true); }
  else brush(ctx, G.combo.name, W * .42, H * .46, Math.min(15 * u, W * .8 / G.combo.name.length), '#fff6d8', a);
  label(ctx, `・${G.combo.sub}・`, W * .45, H * .56 + (comic ? 9 * u : 0), 3.8 * u, '#fff', a);
  kofText(ctx, '×2', W * .82, H * .34, 12 * u * (1 + Math.max(0, .3 - age) * 2), a, true);
}

// ── 如來神掌・萬佛朝宗：巨大金色掌印從天而降 ──
function drawUlt(ctx, W, H, u, age) {
  if (age > 2.4) return;
  const k = Math.min(1, age / .45), e = 1 - Math.pow(1 - k, 3), fade = age > 1.8 ? 1 - (age - 1.8) / .6 : 1;
  const cx = W / 2, cy = H * .48, size = W * (1.6 - .7 * e);
  ctx.save();
  if (age < .5) { const sh = (1 - age / .5) * 2.5 * u; ctx.translate((Math.random() - .5) * sh, (Math.random() - .5) * sh); }
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 18; i++) {
    const an = i / 18 * Math.PI * 2 + age * .4, L = Math.hypot(W, H);
    const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(an) * L, cy + Math.sin(an) * L);
    g.addColorStop(0, `rgba(255,230,150,${.35 * fade})`); g.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(an - .05) * L, cy + Math.sin(an - .05) * L); ctx.lineTo(cx + Math.cos(an + .05) * L, cy + Math.sin(an + .05) * L); ctx.fill();
  }
  for (let i = 0; i < 3; i++) {
    const p = Math.min(1, Math.max(0, (age - .35 - i * .15) / .9)); if (p <= 0 || p >= 1) continue;
    ctx.strokeStyle = `rgba(255,220,120,${(1 - p) * .8 * fade})`; ctx.lineWidth = (1 - p) * 3 * u;
    ctx.beginPath(); ctx.ellipse(cx, cy + size * .25, W * p * .9, W * p * .3, 0, 0, 7); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.save(); ctx.translate(cx, cy - (1 - e) * H * .4); ctx.globalAlpha = .85 * fade;
  ctx.shadowColor = '#ffcc4d'; ctx.shadowBlur = 6 * u;
  const pg = ctx.createLinearGradient(0, -size * .6, 0, size * .5);
  pg.addColorStop(0, '#fff6c8'); pg.addColorStop(.5, '#ffcf3a'); pg.addColorStop(1, '#c88400');
  ctx.fillStyle = pg; ctx.strokeStyle = '#7a4a00'; ctx.lineWidth = u * .8;
  const r = size * .5, fw = r * .2, path = new Path2D();
  path.roundRect(-r * .5, -r * .15, r, r * .95, r * .3);
  for (const [dx, len] of [[-.47, .62], [-.22, .78], [.03, .82], [.28, .7]]) path.roundRect(dx * r, -r * .15 - len * r, fw, len * r + r * .2, fw / 2);
  path.roundRect(r * .42, 0, fw * 1.1, r * .6, fw / 2);
  ctx.fill(path); ctx.shadowBlur = 0; ctx.stroke(path);
  ctx.restore();
  kofText(ctx, '如來神掌', cx, H * .78, 13 * u, Math.min(1, age * 4) * fade, true);
  brush(ctx, '萬佛朝宗', cx, H * .87, 7 * u, '#ffe08a', Math.min(1, (age - .2) * 4) * fade);
  ctx.restore();
}
