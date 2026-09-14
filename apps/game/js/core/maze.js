/* 魔王迷宮：九宮格，每一格是一座小迷宮
 *
 * 主角從左下那格出發，在格子裡走迷宮找到「門」，
 * 穿過門就進到相鄰的那一格。九格裡散著寶箱、洞穴、村子、陷阱與雜兵，
 * 走到有魔王的那一格才會進入原本的魔王戰。
 *
 * 這一層跟原本的線形戰鬥是分開的：
 * 這裡是二維的走位與探索，戰鬥仍然發生在魔王戰裡。
 * 房間裡的雜兵是會追人的，碰到會掉血，可以打掉換錢。
 */
window.G = window.G || {};

const CW = 19, CH = 13;        // 每個房間的格數（奇數，迷宮演算法要用）
const TILE = 44;               // 一格幾像素
const GRID = 3;                // 九宮格

G.MAZE = { CW, CH, TILE, GRID };

function mzrng(seed) {
  let a = seed >>> 0;
  return function () {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 一個房間的迷宮。1 = 牆，0 = 路。
   遞迴回溯法：從 (1,1) 出發，每次往隨機方向跳兩格並打通中間那格。 */
function carveRoom(rand) {
  const g = [];
  for (let y = 0; y < CH; y++) { g.push([]); for (let x = 0; x < CW; x++) g[y].push(1); }

  const stack = [[1, 1]];
  g[1][1] = 0;
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const dirs = [[0, -2], [0, 2], [-2, 0], [2, 0]];
    // 洗牌
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = dirs[i]; dirs[i] = dirs[j]; dirs[j] = tmp;
    }
    let moved = false;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (nx <= 0 || ny <= 0 || nx >= CW - 1 || ny >= CH - 1) continue;
      if (g[ny][nx] === 0) continue;
      g[cy + dy / 2][cx + dx / 2] = 0;
      g[ny][nx] = 0;
      stack.push([nx, ny]);
      moved = true;
      break;
    }
    if (!moved) stack.pop();
  }

  /* 打掉幾面牆做出環路。全是一本道的話走起來很煩。 */
  const loops = 7 + Math.floor(rand() * 6);
  for (let i = 0; i < loops; i++) {
    const x = 1 + Math.floor(rand() * (CW - 2));
    const y = 1 + Math.floor(rand() * (CH - 2));
    if (g[y][x] !== 1) continue;
    // 只打通「牆的兩側都是路」的那種，不然會挖出死角
    const h = g[y][x - 1] === 0 && g[y][x + 1] === 0;
    const v = g[y - 1] && g[y + 1] && g[y - 1][x] === 0 && g[y + 1][x] === 0;
    if (h || v) g[y][x] = 0;
  }
  return g;
}

/* 把門打在共用的那道邊上，並保證門內側連得到迷宮 */
function punchDoor(g, side) {
  const midY = CH % 2 === 0 ? CH / 2 - 1 : (CH - 1) / 2;
  const midX = CW % 2 === 0 ? CW / 2 - 1 : (CW - 1) / 2;
  const y = midY % 2 === 0 ? midY + 1 : midY;   // 落在奇數列，一定接得到通道
  const x = midX % 2 === 0 ? midX + 1 : midX;
  if (side === 'n') { g[0][x] = 0; g[1][x] = 0; return { x, y: 0 }; }
  if (side === 's') { g[CH - 1][x] = 0; g[CH - 2][x] = 0; return { x, y: CH - 1 }; }
  if (side === 'w') { g[y][0] = 0; g[y][1] = 0; return { x: 0, y }; }
  g[y][CW - 1] = 0; g[y][CW - 2] = 0; return { x: CW - 1, y };
}

const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
const DXY = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

G.buildMaze = function (chapterId, seed) {
  const rand = mzrng(seed >>> 0);
  const ch = G.getChapter(chapterId);

  /* 九宮格的連通：先做一棵生成樹，保證每一格都到得了，再加兩條捷徑 */
  const links = {};                       // 'cx,cy' -> {n,s,e,w}
  const key = (x, y) => x + ',' + y;
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) links[key(x, y)] = {};

  const seen = new Set([key(0, GRID - 1)]);   // 從左下角開始
  const frontier = [[0, GRID - 1]];
  while (frontier.length) {
    const i = Math.floor(rand() * frontier.length);
    const [cx, cy] = frontier[i];
    const opts = Object.keys(DXY).filter(d => {
      const nx = cx + DXY[d][0], ny = cy + DXY[d][1];
      return nx >= 0 && ny >= 0 && nx < GRID && ny < GRID && !seen.has(key(nx, ny));
    });
    if (!opts.length) { frontier.splice(i, 1); continue; }
    const d = opts[Math.floor(rand() * opts.length)];
    const nx = cx + DXY[d][0], ny = cy + DXY[d][1];
    links[key(cx, cy)][d] = true;
    links[key(nx, ny)][OPP[d]] = true;
    seen.add(key(nx, ny));
    frontier.push([nx, ny]);
  }
  // 兩條捷徑
  for (let k = 0; k < 2; k++) {
    const cx = Math.floor(rand() * GRID), cy = Math.floor(rand() * GRID);
    const d = Object.keys(DXY)[Math.floor(rand() * 4)];
    const nx = cx + DXY[d][0], ny = cy + DXY[d][1];
    if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
    links[key(cx, cy)][d] = true;
    links[key(nx, ny)][OPP[d]] = true;
  }

  /* 房間內容。魔王放在離出發點最遠的那一格。 */
  const start = { x: 0, y: GRID - 1 };
  const dist = {};
  dist[key(start.x, start.y)] = 0;
  const q = [[start.x, start.y]];
  while (q.length) {
    const [cx, cy] = q.shift();
    Object.keys(links[key(cx, cy)]).forEach(d => {
      const nx = cx + DXY[d][0], ny = cy + DXY[d][1];
      if (dist[key(nx, ny)] != null) return;
      dist[key(nx, ny)] = dist[key(cx, cy)] + 1;
      q.push([nx, ny]);
    });
  }
  let bossKey = key(start.x, start.y), best = -1;
  Object.keys(dist).forEach(k => { if (dist[k] > best) { best = dist[k]; bossKey = k; } });

  const others = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const k = key(x, y);
    if (k === bossKey || (x === start.x && y === start.y)) continue;
    others.push(k);
  }
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = others[i]; others[i] = others[j]; others[j] = t;
  }
  const kinds = ['treasure', 'cave', 'village', 'trap', 'trap', 'empty', 'empty'];
  const kindOf = {};
  kindOf[bossKey] = 'boss';
  kindOf[key(start.x, start.y)] = 'start';
  others.forEach((k, i) => { kindOf[k] = kinds[i % kinds.length]; });

  /* 造房間 */
  const cells = [];
  for (let y = 0; y < GRID; y++) {
    cells.push([]);
    for (let x = 0; x < GRID; x++) {
      const k = key(x, y);
      const g = carveRoom(rand);
      const doors = {};
      Object.keys(links[k]).forEach(d => { doors[d] = punchDoor(g, d); });

      const kind = kindOf[k];
      const items = [];
      const floor = [];
      for (let ty = 1; ty < CH - 1; ty++) for (let tx = 1; tx < CW - 1; tx++) if (g[ty][tx] === 0) floor.push([tx, ty]);
      const pickFloor = () => floor.length ? floor[Math.floor(rand() * floor.length)] : [1, 1];

      if (kind === 'treasure') { const [tx, ty] = pickFloor(); items.push({ t: 'chest', x: tx, y: ty }); }
      if (kind === 'cave')     { const [tx, ty] = pickFloor(); items.push({ t: 'herb', x: tx, y: ty }); }
      if (kind === 'village')  { const [tx, ty] = pickFloor(); items.push({ t: 'village', x: tx, y: ty }); }
      if (kind === 'trap') {
        const n = 6 + Math.floor(rand() * 5);
        for (let i = 0; i < n; i++) { const [tx, ty] = pickFloor(); items.push({ t: 'trap', x: tx, y: ty }); }
      }

      /* 雜兵：出發那格不放，其他格依章節放 1～3 隻 */
      const foes = [];
      if (kind !== 'start' && kind !== 'boss') {
        const n = 1 + Math.floor(rand() * 2) + Math.min(2, Math.floor(G.CHAPTERS.indexOf(ch) * 0.4));
        for (let i = 0; i < n; i++) {
          const [tx, ty] = pickFloor();
          foes.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2,
                      hp: 1, dir: rand() * 6.28, t: 0 });
        }
      }

      cells[y].push({ cx: x, cy: y, g, doors, kind, items, foes, visited: false });
    }
  }

  return {
    chapterId, seed,
    cells,
    at: { x: start.x, y: start.y },
    bossAt: { x: parseInt(bossKey.split(',')[0], 10), y: parseInt(bossKey.split(',')[1], 10) },
    hero: { x: 1.5 * TILE, y: 1.5 * TILE, vx: 0, vy: 0, face: 1, bob: 0, hurt: 0, swing: 0 },
    hp: 1,                 // 生命百分比，跟遠征一樣帶著走
    doorCd: 0,             // 換格冷卻
    gold: 0, herbs: 0,
    log: [],
    cleared: false
  };
};

/* 現在這一格 */
G.mazeCell = m => m.cells[m.at.y][m.at.x];

/* 某個格子座標是不是牆 */
G.mazeWall = function (cell, tx, ty) {
  if (ty < 0 || ty >= CH || tx < 0 || tx >= CW) return true;
  return cell.g[ty][tx] === 1;
};

/* 這個位置放得下半徑 r 的圓嗎 */
G.mazeFree = function (cell, px, py, r) {
  const minX = Math.floor((px - r) / TILE), maxX = Math.floor((px + r) / TILE);
  const minY = Math.floor((py - r) / TILE), maxY = Math.floor((py + r) / TILE);
  for (let ty = minY; ty <= maxY; ty++)
    for (let tx = minX; tx <= maxX; tx++)
      if (G.mazeWall(cell, tx, ty)) return false;
  return true;
};

/* 圓形的主角跟格子牆的碰撞：分軸處理，才能沿著牆滑 */
G.mazeMove = function (m, dx, dy, r) {
  const cell = G.mazeCell(m);
  const h = m.hero;
  const tryAxis = (nx, ny) => G.mazeFree(cell, nx, ny, r);
  if (dx && tryAxis(h.x + dx, h.y)) h.x += dx;
  if (dy && tryAxis(h.x, h.y + dy)) h.y += dy;
};

/* 走到邊上的門就換格 */
G.mazeDoorAt = function (m) {
  const cell = G.mazeCell(m);
  const tx = Math.floor(m.hero.x / TILE), ty = Math.floor(m.hero.y / TILE);
  for (const d of ['n', 's', 'e', 'w']) {
    const dd = cell.doors[d];
    if (!dd) continue;
    if (dd.x === tx && dd.y === ty) return d;
  }
  return null;
};

G.mazeEnter = function (m, d) {
  const nx = m.at.x + DXY[d][0], ny = m.at.y + DXY[d][1];
  if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) return false;
  m.at.x = nx; m.at.y = ny;
  const cell = G.mazeCell(m);
  cell.visited = true;
  const back = cell.doors[OPP[d]];
  if (back) {
    /* 從對面那道門進來，往房間裡站「剛好一格」。
       punchDoor 只保證門與門內側那一格是通的，
       推得更遠（試過 1.7 格）會把主角塞進牆裡，從此動不了。 */
    m.hero.x = back.x * TILE + TILE / 2 + DXY[d][0] * TILE;
    m.hero.y = back.y * TILE + TILE / 2 + DXY[d][1] * TILE;
  }
  /* 保險：萬一還是落在牆裡，找最近的通路把人放出來。
     卡在牆裡的話四個方向都撞牆，玩家會完全動不了。 */
  const r = TILE * 0.34;
  if (!G.mazeFree(cell, m.hero.x, m.hero.y, r)) {
    let best = null, bd = Infinity;
    for (let ty = 1; ty < CH - 1; ty++) for (let tx = 1; tx < CW - 1; tx++) {
      if (cell.g[ty][tx] === 1) continue;
      const px = tx * TILE + TILE / 2, py = ty * TILE + TILE / 2;
      if (!G.mazeFree(cell, px, py, r)) continue;
      const dd = Math.hypot(px - m.hero.x, py - m.hero.y);
      if (dd < bd) { bd = dd; best = [px, py]; }
    }
    if (best) { m.hero.x = best[0]; m.hero.y = best[1]; }
  }
  return true;
};

G.MAZE_OPP = OPP;
G.MAZE_DXY = DXY;

/* ══════════ 每一幀 ══════════
 * 回傳這一幀發生的事件，讓上層決定要不要換畫面（進魔王戰、開村子…）。
 */
G.mazeUpdate = function (m, dt, input) {
  const ev = [];
  const cell = G.mazeCell(m);
  const h = m.hero;
  const r = TILE * 0.34;

  h.bob += dt * 9;
  if (h.hurt > 0) h.hurt = Math.max(0, h.hurt - dt);
  if (h.iframe > 0) h.iframe = Math.max(0, h.iframe - dt);
  if (h.swing > 0) h.swing = Math.max(0, h.swing - dt);
  if (h.flash > 0) h.flash = Math.max(0, h.flash - dt * 3);

  /* 走位：八方向，速度用主角的移動速度換算 */
  const spd = (G.computeStats().stats.moveSpd || 110) * 1.35;
  let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
  if (dx) h.face = dx > 0 ? 1 : -1;
  h.moving = !!(dx || dy);
  if (h.moving) G.mazeMove(m, dx * spd * dt, dy * spd * dt, r);

  /* 踩到門就換格。換完給 0.35 秒冷卻，
     不然壓著方向鍵會在門口被來回傳送。 */
  if (m.doorCd > 0) m.doorCd = Math.max(0, m.doorCd - dt);
  const d = m.doorCd > 0 ? null : G.mazeDoorAt(m);
  if (d) {
    if (G.mazeEnter(m, d)) {
      m.doorCd = 0.35;
      const nc = G.mazeCell(m);
      ev.push({ t: 'move', to: { x: m.at.x, y: m.at.y }, kind: nc.kind });
      if (nc.kind === 'boss') ev.push({ t: 'boss' });
    }
    return ev;
  }

  /* 房間裡的東西 */
  const hx = h.x, hy = h.y;
  cell.items = cell.items.filter(it => {
    const ix = it.x * TILE + TILE / 2, iy = it.y * TILE + TILE / 2;
    if (Math.hypot(ix - hx, iy - hy) > TILE * 0.55) return true;
    if (it.t === 'trap') {
      if (h.iframe > 0) return true;
      h.iframe = 1.0; h.hurt = 0.3; h.flash = 1;
      m.hp = Math.max(0.04, m.hp - 0.08);
      ev.push({ t: 'trap', dmg: 8 });
      return true;                       // 陷阱不會消失，下次還是會踩到
    }
    if (it.t === 'chest')   { m.gold += 120 + Math.round(Math.random() * 140); ev.push({ t: 'chest', gold: m.gold }); return false; }
    if (it.t === 'herb')    { m.herbs += 2; ev.push({ t: 'herb' }); return false; }
    if (it.t === 'village') { ev.push({ t: 'village' }); return false; }
    return true;
  });

  /* 雜兵：慢慢追人，碰到掉血；主角揮擊可以打掉 */
  cell.foes.forEach(f => {
    if (f.hp <= 0) return;
    f.t += dt;
    const ddx = hx - f.x, ddy = hy - f.y;
    const dd = Math.hypot(ddx, ddy) || 1;
    if (dd < TILE * 7) {
      const fs = 46 * dt;
      const nx = f.x + ddx / dd * fs, ny = f.y + ddy / dd * fs;
      if (!G.mazeWall(cell, Math.floor(nx / TILE), Math.floor(f.y / TILE))) f.x = nx;
      if (!G.mazeWall(cell, Math.floor(f.x / TILE), Math.floor(ny / TILE))) f.y = ny;
    }
    if (dd < TILE * 0.62 && h.iframe <= 0) {
      h.iframe = 0.9; h.hurt = 0.3; h.flash = 1;
      m.hp = Math.max(0.04, m.hp - 0.06);
      ev.push({ t: 'hit', dmg: 6 });
    }
    // 揮擊命中
    if (h.swing > 0 && dd < TILE * 1.15) {
      f.hp = 0;
      m.gold += 18;
      ev.push({ t: 'kill' });
    }
  });
  cell.foes = cell.foes.filter(f => f.hp > 0);

  if (m.hp <= 0.05) ev.push({ t: 'down' });
  return ev;
};

/* 揮一刀 */
G.mazeSwing = function (m) {
  if (m.hero.swing > 0) return false;
  m.hero.swing = 0.28;
  return true;
};
