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
  const notes = []; let at = 4.2, gap = 1.5, prev = null;
  for (let i = 0; i < N; i++) {
    let g; do g = KINDS[Math.floor(Math.random() * KINDS.length)]; while (g === prev && Math.random() < .7);
    prev = g; notes.push({ g, at, res: null }); at += gap; gap = Math.max(.95, gap - .05);
  }
  Object.assign(G, { on: true, t0: t, notes, score: 0, combo: 0, best: 0, perfect: 0, good: 0, miss: 0, pops: [], end: at + 1, onEnd, done: false, beat: -1 });
}
export function stopGame() { G.on = false; }

const BRUSH = '"Kouzan Mouhitsu", "Kouzan Gyosho", "Yuji Boku", "Noto Serif TC", serif';
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
    const word = ['三', '二', '一', '開始'][Math.min(3, n)];
    if (n < 4) brushText(ctx, word, W / 2, H * .45, (n === 3 ? 20 : 30) * u * (1.3 - .3 * Math.min(1, k * 3)), n === 3 ? '#ffe08a' : '#fff', 1 - Math.max(0, k - .7) / .3);
    if (t < 3) brushText(ctx, '手勢跑到左邊的圈圈時，比出一樣的手勢！', W / 2, H * .62, 3.6 * u, '#fff');
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
        G.combo++; G.best = Math.max(G.best, G.combo); G[n.res]++;
        G.score += Math.round((n.res === 'perfect' ? 100 : 60) * (1 + Math.min(G.combo, 20) * .1));
        G.pops.push({ t, txt: n.res === 'perfect' ? '完美' : '好', col: n.res === 'perfect' ? '#ffe08a' : '#cfe8ff' });
        sfx.drum(true); if (n.res === 'perfect') sfx.zap();
        onHit?.(n.res, [hitX, laneY]);
      } else if (dt > WINDOW) {
        n.res = 'miss'; n.rt = t; G.combo = 0; G.miss++;
        G.pops.push({ t, txt: '失手', col: '#ff8a7a' });
      }
    }
    // 畫符號
    const x = hitX - dt * speed;
    if (x > W + R * 1.2 || x < -R * 1.5) continue;
    if (n.res && n.res !== 'miss') {                        // 打中：在圈上爆開
      const k = (t - n.rt) / .4; if (k > 1) continue;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(hitX, laneY, 0, hitX, laneY, R * (1 + k * 1.6));
      gr.addColorStop(0, `rgba(255,255,255,${.8 * (1 - k)})`); gr.addColorStop(.4, glow + 'aa'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(hitX, laneY, R * (1 + k * 1.6), 0, 7); ctx.fill();
      ctx.restore(); continue;
    }
    ctx.save(); ctx.globalAlpha = n.res === 'miss' ? .35 : 1;
    ctx.fillStyle = 'rgba(20,14,8,.85)'; ctx.beginPath(); ctx.arc(x, laneY, R, 0, 7); ctx.fill();
    ctx.strokeStyle = Math.abs(dt) <= WINDOW && !n.res ? '#ffe08a' : 'rgba(255,255,255,.7)'; ctx.lineWidth = .6 * u; ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = .45 * u; ctx.setLineDash([]);
    ICON[n.g](ctx, x, laneY + R * .15, R * .7, false);
    ctx.restore();
    brushText(ctx, NAME[n.g], x, laneY + R * 1.5, 4.4 * u, '#fff', n.res === 'miss' ? .35 : 1);
  }

  // 分數、連擊
  brushText(ctx, `${G.score}`, W - 9 * u, laneY + R * 2.1, 6 * u, '#ffe08a');
  if (G.combo >= 2) brushText(ctx, `${G.combo} 連擊`, W / 2, laneY + R * 2.1, 6.5 * u, '#fff');
  G.pops = G.pops.filter((p) => t - p.t < .7);
  for (const p of G.pops) { const k = (t - p.t) / .7; brushText(ctx, p.txt, hitX + R * .2, laneY + R * 1.9 - k * 4 * u, 6 * u * (1.2 - .2 * k), p.col, 1 - k); }

  // 結束：顯示總分與稱號
  if (t > G.end) {
    const k = Math.min(1, (t - G.end) / .4), total = G.notes.length;
    const rate = (G.perfect + G.good * .6) / total;
    const title = rate > .85 ? '武林盟主' : rate > .6 ? '一代宗師' : rate > .35 ? '江湖新秀' : '初入江湖';
    ctx.save(); ctx.globalAlpha = .55 * k; ctx.fillStyle = '#000'; ctx.fillRect(0, H * .3, W, H * .32); ctx.restore();
    brushText(ctx, title, W / 2, H * .41, 15 * u * (1.3 - .3 * k), '#ffe08a', k);
    brushText(ctx, `${G.score} 分　最高 ${G.best} 連擊`, W / 2, H * .53, 4.6 * u, '#fff', k);
    if (!G.done && t > G.end + 2.2) { G.done = true; G.on = false; sfx.gong(); G.onEnd?.({ score: G.score, title, best: G.best }); }
  }
  return G.on;
}
