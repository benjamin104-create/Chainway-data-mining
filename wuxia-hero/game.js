// 挑戰模式（像跳舞機）：手勢符號從畫面右邊往左跑，跑到左邊的圈圈時比出同樣的手勢
//   順序每次隨機；比得準＝「完美」、差一點＝「好」、沒比到＝「失手」，連擊越多分數越高
//   開始時自動錄影，結束時停止，影片裡會有整段挑戰
import { ICON, gestureOf } from './poses.js';
import * as sfx from './sfx.js';

const KINDS = ['fist', 'palm', 'flat', 'sword', 'thumb'];
const NAME = { fist: '握拳', palm: '張手', flat: '手刀', sword: '劍指', thumb: '比讚' };
const TRAVEL = 2.4, WINDOW = .4, N = 14;

const G = { on: false };
export const gameState = G;

export function startGame(t, onEnd) {
  // 配樂 120 BPM（一拍 0.5 秒）：倒數剛好 8 拍，之後每個手勢都落在拍點上
  const notes = []; let at = 4, prev = null;
  const GAPS = [1.5, 1.5, 1.5, 1.5, 1.25, 1.25, 1.25, 1.25, 1, 1, 1, 1, 1, 1];
  for (let i = 0; i < N; i++) {
    let g; do g = KINDS[Math.floor(Math.random() * KINDS.length)]; while (g === prev && Math.random() < .7);
    prev = g; notes.push({ g, at, res: null }); at += GAPS[i];
  }
  notes.push({ g: 'palm', at: at + .5, res: null, special: true });   // 壓軸大絕：如來神掌（張開手掌一推）
  at += 2.6;
  sfx.startMusic();
  Object.assign(G, { on: true, t0: t, notes, score: 0, combo: 0, best: 0, perfect: 0, good: 0, miss: 0, pops: [], end: at + 1, onEnd, done: false, beat: -1 });
}
export function stopGame() { G.on = false; sfx.stopMusic(); }

const BRUSH = '"Kouzan Mouhitsu", "Kouzan Gyosho", "Yuji Boku", "Noto Serif TC", serif';
// 格鬥遊戲風的字：粗黑斜體、金屬漸層（白→金→橘紅）、厚黑框＋紅色內框
const KOF_LATIN = '"Anton", "Impact", "Arial Black", sans-serif';
const KOF_CJK = '"Noto Sans TC", "PingFang TC", sans-serif';
function kofText(ctx, txt, x, y, px, a = 1, hot = false) {
  ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, a));
  ctx.translate(x, y); ctx.transform(1, 0, -.18, 1, 0, 0);            // 往右斜
  const cjk = /[\u3400-\u9fff]/.test(txt);
  ctx.font = cjk ? `900 ${px}px ${KOF_CJK}` : `400 ${px * 1.15}px ${KOF_LATIN}`;   // 一個詞只用一種字型，不混搭
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = px * .22; ctx.strokeStyle = '#0a0503'; ctx.strokeText(txt, 0, 0);
  ctx.lineWidth = px * .1; ctx.strokeStyle = hot ? '#d81b0c' : '#5a6270'; ctx.strokeText(txt, 0, 0);
  const g = ctx.createLinearGradient(0, -px * .5, 0, px * .5);
  if (hot) { g.addColorStop(0, '#ffffff'); g.addColorStop(.35, '#fff27a'); g.addColorStop(.55, '#ffb000'); g.addColorStop(.75, '#ff4a00'); g.addColorStop(1, '#ffd23a'); }
  else { g.addColorStop(0, '#ffffff'); g.addColorStop(.45, '#e9eef5'); g.addColorStop(.52, '#8a96a8'); g.addColorStop(.8, '#dfe6ef'); g.addColorStop(1, '#ffffff'); }
  ctx.fillStyle = g; ctx.fillText(txt, 0, 0);
  ctx.restore();
}
function labelText(ctx, txt, x, y, px, fill, a = 1) {
  ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, a));
  ctx.font = `900 ${px}px "Noto Sans TC", "PingFang TC", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = px * .28; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(txt, x, y); ctx.fillStyle = fill; ctx.fillText(txt, x, y);
  ctx.restore();
}
function brushText(ctx, txt, x, y, px, fill, a = 1) {
  ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, a));
  ctx.font = `${px}px ${BRUSH}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = px * .16; ctx.strokeStyle = '#0b0806'; ctx.strokeText(txt, x, y);
  ctx.fillStyle = fill; ctx.fillText(txt, x, y);
  ctx.lineWidth = px * .04; ctx.strokeStyle = fill; ctx.strokeText(txt, x, y);
  ctx.restore();
}

// 每一格：判定、畫跑道、畫分數。回傳是否還在進行
export function drawGame(ctx, W, H, u, now, hands, glow, onHit) {
  if (!G.on) return false;
  const t = Math.max(0, now - G.t0), laneY = H * .17, hitX = W * .18, R = W * .085, speed = (W + R - hitX) / TRAVEL;
  const shown = new Set(hands.map((h) => gestureOf(h, W, H)).filter(Boolean));

  // 倒數 3、2、1、開始
  if (t < 4.2) {
    const n = Math.max(0, Math.floor(t)), k = t % 1;
    if (n !== G.beat) { G.beat = n; if (n < 4) sfx.drum(n === 3); }
    const word = ['3', '2', '1', 'GO!'][Math.min(3, n)];
    if (n < 4) kofText(ctx, word, W / 2, H * .45, (n === 3 ? 24 : 32) * u * (1.4 - .4 * Math.min(1, k * 4)), 1 - Math.max(0, k - .75) / .25, n === 3);
    if (t < 1) kofText(ctx, 'READY', W / 2, H * .32, 12 * u, 1 - Math.max(0, t - .8) / .2, true);
    if (t < 3) labelText(ctx, '手勢跑到左邊的圈圈時，比出一樣的手勢！', W / 2, H * .62, 3.4 * u, '#fff');
  }

  // 跑道
  ctx.save();
  ctx.fillStyle = 'rgba(8,6,4,.45)'; ctx.fillRect(0, laneY - R * 1.15, W, R * 2.3);
  ctx.strokeStyle = 'rgba(255,224,138,.35)'; ctx.lineWidth = .4 * u; ctx.beginPath(); ctx.moveTo(0, laneY - R * 1.15); ctx.lineTo(W, laneY - R * 1.15); ctx.moveTo(0, laneY + R * 1.15); ctx.lineTo(W, laneY + R * 1.15); ctx.stroke();
  // 判定圈：心跳似的微微發亮
  const pulse = .5 + .5 * Math.sin(t * 8);
  ctx.strokeStyle = `rgba(255,224,138,${.7 + .3 * pulse})`; ctx.lineWidth = 1.1 * u;
  ctx.beginPath(); ctx.arc(hitX, laneY, R * 1.08, 0, 7); ctx.stroke();
  ctx.restore();

  for (const n of G.notes) {
    const dt = t - n.at;                                   // <0：還沒到，>0：已經過了
    // 判定
    if (!n.res) {
      if (Math.abs(dt) <= WINDOW && shown.has(n.g)) {
        n.res = Math.abs(dt) < .18 ? 'perfect' : 'good'; n.rt = t;
        G.combo++; G.lastComboT = t; G.best = Math.max(G.best, G.combo); G[n.res]++;
        G.score += Math.round((n.res === 'perfect' ? 100 : 60) * (1 + Math.min(G.combo, 20) * .1));
        G.pops.push({ t, txt: n.res === 'perfect' ? 'PERFECT' : 'GREAT', hot: n.res === 'perfect' });
        if (n.special) { G.ult = { t, at: [hitX, laneY] }; G.score += 1000; sfx.boom(); }
        sfx.drum(true); if (n.res === 'perfect') sfx.zap();
        onHit?.(n.res, [hitX, laneY]);
      } else if (dt > WINDOW) {
        n.res = 'miss'; n.rt = t; G.combo = 0; G.miss++;
        G.pops.push({ t, txt: 'MISS', hot: false });
      }
    }
    // 畫符號
    const x = hitX - dt * speed;
    if (x > W + R * 1.2 || x < -R * 1.5) continue;
    if (n.res && n.res !== 'miss') {                        // 打中：在圈上爆開
      const k = (t - n.rt) / .4; if (k > 1 || k < 0) continue;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(hitX, laneY, 0, hitX, laneY, R * (1 + k * 1.6));
      gr.addColorStop(0, `rgba(255,255,255,${.8 * (1 - k)})`); gr.addColorStop(.4, glow + 'aa'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(hitX, laneY, R * (1 + k * 1.6), 0, 7); ctx.fill();
      ctx.restore(); continue;
    }
    ctx.save(); ctx.globalAlpha = n.res === 'miss' ? .35 : 1;
    ctx.fillStyle = n.special ? 'rgba(120,70,0,.92)' : 'rgba(20,14,8,.85)'; ctx.beginPath(); ctx.arc(x, laneY, R * (n.special ? 1.15 : 1), 0, 7); ctx.fill();
    if (n.special) { ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 1 * u; ctx.stroke(); }
    ctx.strokeStyle = Math.abs(dt) <= WINDOW && !n.res ? '#ffe08a' : 'rgba(255,255,255,.7)'; ctx.lineWidth = .6 * u; ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = .45 * u; ctx.setLineDash([]);
    ICON[n.g](ctx, x, laneY + R * .15, R * .7, false);
    ctx.restore();
    labelText(ctx, n.special ? '如來神掌' : NAME[n.g], x, laneY + R * 1.5, (n.special ? 4.2 : 3.6) * u, n.special ? '#ffd36b' : '#fff', n.res === 'miss' ? .35 : 1);
  }

  // 分數、連擊
  kofText(ctx, `${G.score}`, W - 10 * u, laneY + R * 2.1, 6.5 * u, 1, true);
  if (G.combo >= 2) kofText(ctx, `${G.combo} HITS`, W * .62, laneY + R * 3.4, 7.5 * u * (1 + .15 * Math.max(0, 1 - (t - (G.lastComboT || 0)) * 5)), 1, G.combo >= 5);
  G.pops = G.pops.filter((p) => t - p.t < .7);
  for (const p of G.pops) { const k = (t - p.t) / .7; kofText(ctx, p.txt, hitX + R * 1.2, laneY + R * 1.9 - k * 4 * u, 6.5 * u * (1.35 - .35 * Math.min(1, k * 4)), 1 - k * k, p.hot); }
  if (G.ult) drawUlt(ctx, W, H, u, t - G.ult.t, G.ult.at);

  // 結束：顯示總分與稱號
  if (t > G.end) {
    const k = Math.min(1, (t - G.end) / .4), total = G.notes.length;
    const rate = (G.perfect + G.good * .6) / total;
    const title = rate > .85 ? '武林盟主' : rate > .6 ? '一代宗師' : rate > .35 ? '江湖新秀' : '初入江湖';
    ctx.save(); ctx.globalAlpha = .55 * k; ctx.fillStyle = '#000'; ctx.fillRect(0, H * .3, W, H * .32); ctx.restore();
    kofText(ctx, 'FINISH!', W / 2, H * .34, 9 * u, k, false);
    kofText(ctx, title, W / 2, H * .44, 14 * u * (1.3 - .3 * k), k, true);
    kofText(ctx, `SCORE ${G.score}   MAX ${G.best} HITS`, W / 2, H * .54, 4.6 * u, k, false);
    if (!G.done && t > G.end - .8 && !G.musicOff) { G.musicOff = true; sfx.stopMusic(1.2); }
    if (!G.done && t > G.end + 2.2) { G.done = true; G.on = false; sfx.gong(); G.onEnd?.({ score: G.score, title, best: G.best }); }
  }
  return G.on;
}

// 如來神掌・萬佛朝宗：一隻巨大的金色掌印從天而降，金光四射、地面震波
function drawUlt(ctx, W, H, u, age, at) {
  if (age > 2.4) return;
  const k = Math.min(1, age / .45), e = 1 - Math.pow(1 - k, 3), fade = age > 1.8 ? 1 - (age - 1.8) / .6 : 1;
  const cx = W / 2, cy = H * .48, size = W * (1.6 - .7 * e);
  ctx.save();
  if (age < .5) { const sh = (1 - age / .5) * 2.5 * u; ctx.translate((Math.random() - .5) * sh, (Math.random() - .5) * sh); }
  ctx.globalCompositeOperation = 'lighter';
  // 放射金光
  for (let i = 0; i < 18; i++) {
    const an = i / 18 * Math.PI * 2 + age * .4, L = Math.hypot(W, H);
    const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(an) * L, cy + Math.sin(an) * L);
    g.addColorStop(0, `rgba(255,230,150,${.35 * fade})`); g.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(an - .05) * L, cy + Math.sin(an - .05) * L); ctx.lineTo(cx + Math.cos(an + .05) * L, cy + Math.sin(an + .05) * L); ctx.fill();
  }
  // 震波
  for (let i = 0; i < 3; i++) {
    const p = Math.min(1, Math.max(0, (age - .35 - i * .15) / .9)); if (p <= 0 || p >= 1) continue;
    ctx.strokeStyle = `rgba(255,220,120,${(1 - p) * .8 * fade})`; ctx.lineWidth = (1 - p) * 3 * u;
    ctx.beginPath(); ctx.ellipse(cx, cy + size * .25, W * p * .9, W * p * .3, 0, 0, 7); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  // 巨大的金色掌印（從畫面上方壓下來）
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
  brushText(ctx, '萬佛朝宗', cx, H * .87, 7 * u, '#ffe08a', Math.min(1, (age - .2) * 4) * fade);
  ctx.restore();
}
