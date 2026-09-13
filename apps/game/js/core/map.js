/* 俯視地圖：把「沿路徑的距離」換算成畫面座標
 *
 * 關鍵想法：戰鬥邏輯完全不動。
 * 實體的 x 仍然是「從我方城門沿路走了多遠」，z 仍然是左右偏移；
 * 只有畫的時候才把 (x, z) 投影到蜿蜒的路徑上。
 * 這樣所有既有的射程、行軍、封鎖線、僱用所判定都照舊成立。
 */
window.G = window.G || {};

const MAP_W = 960, MAP_H = 600;

function mrng(seed) {
  let a = seed >>> 0;
  return function () {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
  };
}

function smooth(wp, per) {
  const out = [];
  const n = wp.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = wp[Math.max(0, i - 1)], p1 = wp[i], p2 = wp[i + 1], p3 = wp[Math.min(n - 1, i + 2)];
    for (let k = 0; k < per; k++) out.push(catmull(p0, p1, p2, p3, k / per));
  }
  out.push(wp[n - 1]);
  return out;
}

/* 建一張地圖 */
G.buildMap = function (stage) {
  const seed = stage.key.split('').reduce((a, c) => a + c.charCodeAt(0) * 7, 13);
  const rand = mrng(seed);

  /* 蛇行路線：由下往上，左右來回。起點在左下（我方城門），終點在最上排（敵方主塔） */
  const rows = stage.length > 2450 ? 4 : 3;
  const padX = 118;
  const yBottom = MAP_H - 96;
  const yTop = 104;
  const rowGap = (yBottom - yTop) / (rows - 1);

  const wp = [];
  for (let r = 0; r < rows; r++) {
    const y = yBottom - r * rowGap;
    const l2r = r % 2 === 0;
    const x0 = l2r ? padX : MAP_W - padX;
    const x1 = l2r ? MAP_W - padX : padX;
    const seg = 3;
    for (let k = 0; k <= seg; k++) {
      const t = k / seg;
      const edge = (k === 0 || k === seg);
      wp.push({
        x: x0 + (x1 - x0) * t + (edge ? 0 : (rand() - 0.5) * 30),
        y: y + (edge ? 0 : (rand() - 0.5) * 26)
      });
    }
  }

  const pts = smooth(wp, 9);

  /* 累積長度 */
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  const total = cum[cum.length - 1];
  const scale = total / stage.length;   // 世界單位 → 畫素

  const map = { pts, cum, total, scale, w: MAP_W, h: MAP_H, worldLen: stage.length };

  /* 路徑上某個弧長的位置與切線 */
  map.atLen = function (len) {
    const L = Math.max(0, Math.min(total, len));
    let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= L) lo = mid; else hi = mid;
    }
    const segLen = cum[hi] - cum[lo] || 1;
    const t = (L - cum[lo]) / segLen;
    const a = pts[lo], b = pts[hi];
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: a.x + dx * t, y: a.y + dy * t, nx: dx / d, ny: dy / d };
  };

  /* 世界座標 (x 沿路距離, z 側向偏移) → 畫面座標 */
  map.at = function (worldX, z) {
    const p = map.atLen(worldX * scale);
    if (!z) return p;
    // 垂直於前進方向的偏移
    return { x: p.x - p.ny * z, y: p.y + p.nx * z, nx: p.nx, ny: p.ny };
  };

  /* 路邊的空地：給僱用所與裝飾用，往路徑左側或右側推開 */
  map.beside = function (worldX, dist, side) {
    const p = map.atLen(worldX * scale);
    return { x: p.x - p.ny * dist * side, y: p.y + p.nx * dist * side };
  };

  /* 一段路徑的取樣點，畫光束、衝刺軌跡用 */
  map.slice = function (worldA, worldB) {
    const a = Math.max(0, Math.min(total, worldA * scale));
    const b = Math.max(0, Math.min(total, worldB * scale));
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const out = [];
    const step = Math.max(6, (hi - lo) / 26);
    for (let L = lo; L < hi; L += step) out.push(map.atLen(L));
    out.push(map.atLen(hi));
    return out;
  };

  /* 判斷一個畫面點離路徑多遠（放裝飾物用） */
  function distToPath(px, py) {
    let best = Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      const d = Math.hypot(pts[i].x - px, pts[i].y - py);
      if (d < best) best = d;
    }
    return best;
  }

  /* 裝飾物：依章節主題散佈在路徑外側 */
  const props = [];
  const tries = 220;
  for (let i = 0; i < tries && props.length < 34; i++) {
    const px = 40 + rand() * (MAP_W - 80);
    const py = 60 + rand() * (MAP_H - 110);
    if (distToPath(px, py) < 58) continue;
    let ok = true;
    for (const q of props) if (Math.hypot(q.x - px, q.y - py) < 54) { ok = false; break; }
    if (!ok) continue;
    props.push({ x: px, y: py, s: 0.7 + rand() * 0.7, r: rand(), kind: Math.floor(rand() * 3) });
  }
  map.props = props;

  /* 地面斑塊，讓底色不要太平 */
  const patches = [];
  for (let i = 0; i < 26; i++) {
    patches.push({
      x: rand() * MAP_W, y: 40 + rand() * (MAP_H - 60),
      rx: 40 + rand() * 90, ry: 26 + rand() * 60, a: 0.05 + rand() * 0.07
    });
  }
  map.patches = patches;

  return map;
};

G.MAP_W = MAP_W;
G.MAP_H = MAP_H;
