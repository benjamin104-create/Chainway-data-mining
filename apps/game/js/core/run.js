/* 遠征：一章一張大地圖，有分岔、有隨機節點
 *
 * 版面：八個縱列，第 0 列在左下角出發，第 7 列在右上角是大王。
 * 中間每列 2–3 個節點，節點之間只往右連，所以路一定是往前的，
 * 但「走哪一條」由玩家決定——而且有些節點在你走到之前是問號。
 *
 * 血量在整趟遠征之間延續，所以「被魔法轟掉一半血」是真的有代價的。
 */
window.G = window.G || {};

const COLS = 8;
const VB_W = 980, VB_H = 560;

function rrng(seed) {
  let a = seed >>> 0;
  return function () {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];

function weighted(rand, table) {
  const total = table.reduce((a, e) => a + e.w, 0);
  let r = rand() * total;
  for (const e of table) { r -= e.w; if (r <= 0) return e; }
  return table[table.length - 1];
}

G.NODE_KINDS = {
  start:   { name: '出發點', icon: 'gate',   color: '#A89170' },
  battle:  { name: '遭遇戰', icon: 'slash',  color: '#C8503E' },
  elite:   { name: '精銳戰', icon: 'crit',   color: '#E0662A' },
  boss:    { name: '大王',   icon: 'roar',   color: '#C8503E' },
  chest:   { name: '神秘寶箱', icon: 'stack', color: '#E0B23C' },
  shop:    { name: '商隊',   icon: 'tower',  color: '#6E95E0' },
  camp:    { name: '營地',   icon: 'heal',   color: '#7FBF6A' },
  hazard:  { name: '險地',   icon: 'burn',   color: '#8E6BE0' },
  mystery: { name: '謎團',   icon: 'mark',   color: '#4E7ECF' },
  cave:    { name: '洞穴',   icon: 'cave',   color: '#8FB86A' },
  unknown: { name: '未知',   icon: 'echo',   color: '#75634B' }
};

const TYPE_TABLE = [
  { w: 30, t: 'battle' },
  { w: 12, t: 'elite' },
  { w: 15, t: 'chest' },
  { w: 16, t: 'hazard' },
  { w: 15, t: 'mystery' },
  { w: 7,  t: 'shop' },
  { w: 5,  t: 'camp' }
];

/* 緩動：讓路線從左下往右、再往上 */
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

G.buildRun = function (chapterId, seed) {
  const rand = rrng(seed);
  const ch = G.getChapter(chapterId);
  const pool = G.eventsFor(chapterId);

  const nodes = [];
  const byCol = [];
  let nid = 0;

  for (let c = 0; c < COLS; c++) {
    const x = 62 + c * ((VB_W - 130) / (COLS - 1));
    const yc = VB_H - 92 - ease(c / (COLS - 1)) * (VB_H - 210);
    const count = (c === 0 || c === COLS - 1) ? 1 : (rand() < 0.42 ? 2 : 3);
    const col = [];
    for (let r = 0; r < count; r++) {
      const spread = 94;
      const y = yc + (r - (count - 1) / 2) * spread + (rand() - 0.5) * 16;
      col.push({
        id: 'n' + (nid++), c, r, x: Math.round(x), y: Math.round(Math.max(50, Math.min(VB_H - 60, y))),
        type: 'battle', hidden: false, done: false
      });
    }
    byCol.push(col);
    col.forEach(n => nodes.push(n));
  }

  /* 節點種類 */
  byCol[0][0].type = 'start';
  byCol[0][0].done = true;
  byCol[COLS - 1][0].type = 'boss';

  const mid = [];
  for (let c = 1; c < COLS - 1; c++) byCol[c].forEach(n => mid.push(n));
  mid.forEach(n => { n.type = weighted(rand, TYPE_TABLE).t; });

  /* 商隊與營地各有上下限：太多就不稀奇，一個都沒有又太硬 */
  const capKind = (kind, max) => {
    const has = mid.filter(n => n.type === kind);
    for (let i = max; i < has.length; i++) has[i].type = rand() < 0.5 ? 'battle' : 'chest';
  };
  capKind('shop', 2);
  capKind('camp', 2);
  if (!mid.some(n => n.type === 'shop')) {
    const cand = mid.filter(n => n.c >= 2 && n.c <= 4 && n.type !== 'camp');
    if (cand.length) pick(rand, cand).type = 'shop';
  }
  const lastCol = byCol[COLS - 2];
  if (!lastCol.some(n => n.type === 'camp')) pick(rand, lastCol).type = 'camp';

  /* 事件節點抽事件；戰鬥節點決定關卡與難度 */
  mid.forEach(n => {
    if (n.type === 'chest' || n.type === 'hazard' || n.type === 'mystery') {
      const cands = pool.filter(e => e.kind === n.type);
      n.eventId = cands.length ? pick(rand, cands).id : null;
      if (!n.eventId) n.type = 'battle';
    }
  });
  byCol[COLS - 1][0].eventId = null;

  /* 有些節點走到才知道是什麼 —— 這就是「走錯方向」的空間 */
  mid.forEach(n => {
    if (n.c >= 2 && n.type !== 'shop' && rand() < 0.32) n.hidden = true;
  });

  /* 連線：只往右連，並確保下一列每個節點都有人進得來 */
  const edges = [];
  for (let c = 0; c < COLS - 1; c++) {
    const from = byCol[c], to = byCol[c + 1];
    const gotIn = new Set();
    from.forEach(a => {
      const sorted = to.slice().sort((p, q) => Math.abs(p.y - a.y) - Math.abs(q.y - a.y));
      const k = to.length === 1 ? 1 : (rand() < 0.45 ? 2 : 1);
      sorted.slice(0, k).forEach(b => {
        if (!edges.some(e => e[0] === a.id && e[1] === b.id)) edges.push([a.id, b.id]);
        gotIn.add(b.id);
      });
    });
    to.forEach(b => {
      if (gotIn.has(b.id)) return;
      const a = from.slice().sort((p, q) => Math.abs(p.y - b.y) - Math.abs(q.y - b.y))[0];
      edges.push([a.id, b.id]);
    });
  }

  /* 死路：從主線岔出去的洞穴。走進去要花一步，打完有藥草，然後原路退回。 */
  const spurCands = mid
    .filter(n => n.c >= 1 && n.c <= COLS - 3 && n.type !== 'shop' && n.type !== 'camp')
    .sort((a, b) => byCol[a.c].length - byCol[b.c].length);
  const caveCount = 2;
  for (let i = 0; i < caveCount && spurCands.length; i++) {
    const parent = spurCands.splice(rand() < 0.7 ? 0 : Math.floor(rand() * spurCands.length), 1)[0];
    const side = parent.y > VB_H / 2 ? -1 : 1;
    // 多試幾個擺法，只試一個的話大部分地圖會生不出洞穴
    const tries = [
      [56, side * 96], [-56, side * 96], [0, side * 112],
      [64, -side * 96], [-64, -side * 96], [0, -side * 112],
      [82, side * 62], [-82, side * 62]
    ];
    let cx = 0, cy = 0, placed = false;
    for (const [dx, dy] of tries) {
      cx = Math.round(Math.max(48, Math.min(VB_W - 48, parent.x + dx)));
      cy = Math.round(Math.max(50, Math.min(VB_H - 60, parent.y + dy)));
      if (!nodes.some(n => Math.hypot(n.x - cx, n.y - cy) < 72)) { placed = true; break; }
    }
    if (!placed) continue;
    const cave = {
      id: 'n' + (nid++), c: parent.c, r: -1, x: cx, y: cy,
      type: 'cave', hidden: false, done: false, backTo: parent.id, spur: true
    };
    nodes.push(cave);
    edges.push([parent.id, cave.id, 0]);
  }

  /* 陷阱路：走過去就掉血，而且事先看得到要掉多少。 */
  edges.forEach(e => {
    const to = nodes.find(n => n.id === e[1]);
    if (!to || to.type === 'cave' || to.type === 'boss') return;
    if (rand() < 0.2) e[2] = Math.round((0.06 + rand() * 0.10) * 100) / 100;
  });
  // 只有一條路的時候不設陷阱：沒得選就不叫選擇
  nodes.forEach(n => {
    const outs = edges.filter(e => e[0] === n.id);
    if (outs.length <= 1) outs.forEach(e => { e[2] = 0; });
    else if (outs.every(e => e[2])) outs[Math.floor(rand() * outs.length)][2] = 0;
  });

  return {
    chapterId, seed,
    nodes, edges,
    at: byCol[0][0].id,
    hpPct: 1,
    blessings: [],
    log: [{ text: '從' + ch.name + '的邊緣出發。', kind: 'start' }],
    battles: 0, cleared: false, finished: false
  };
};

/* 洞穴：短、只有一個巢穴、怪有限。用原關卡當底改幾個欄位。 */
G.caveStage = function (base) {
  return Object.assign({}, base, {
    name: '洞穴',
    length: 1000,
    towers: 1,
    isBoss: false,
    waveGap: 11,
    reward: {
      gold: Math.round(base.reward.gold * 0.45),
      sp: 0,
      xp: Math.round(base.reward.xp * 0.5)
    }
  });
};

G.HERB_HEAL = 0.25;

/* ══════════ 存取 ══════════ */
G.runNode = id => G.S.run && G.S.run.nodes.find(n => n.id === id);
G.runCurrent = () => G.S.run && G.runNode(G.S.run.at);

G.runNext = function () {
  const run = G.S.run;
  if (!run) return [];
  return run.edges.filter(e => e[0] === run.at).map(e => G.runNode(e[1]));
};

/* 現在可以走去哪裡：必須是當前節點的下一步，而且當前節點已經結算完 */
G.runCanEnter = function (node) {
  const run = G.S.run;
  if (!run || run.finished) return false;
  if (node.done) return false;          // 結算過的地點不能再進去（洞穴會被無限刷藥草）
  const cur = G.runCurrent();
  if (!cur || !cur.done) return false;
  return run.edges.some(e => e[0] === run.at && e[1] === node.id);
};

G.runVisibleType = function (node) {
  return (node.hidden && !node.revealed) ? 'unknown' : node.type;
};

/* ══════════ 進入節點 ══════════ */
G.runEnter = function (node) {
  const run = G.S.run;
  if (!G.runCanEnter(node)) return { ok: false, why: '那裡現在走不到' };
  const edge = run.edges.find(e => e[0] === run.at && e[1] === node.id);
  const trap = (edge && edge[2]) || 0;
  run.at = node.id;
  node.revealed = true;
  if (trap) {
    run.hpPct = Math.max(0.02, run.hpPct - trap);
    run.log.push({ text: '走了陷阱路，掉了 ' + Math.round(trap * 100) + '% 生命。', kind: 'bad' });
  }
  G.save();
  return { ok: true, node, trap };
};

/* 從當前節點走到某個節點要付出的陷阱代價 */
G.runTrapCost = function (nodeId) {
  const run = G.S.run;
  if (!run) return 0;
  const e = run.edges.find(x => x[0] === run.at && x[1] === nodeId);
  return (e && e[2]) || 0;
};

/* 戰鬥節點 → 用哪一關、加多少難度 */
G.runBattleSpec = function (node) {
  const ch = G.getChapter(G.S.run.chapterId);
  // 大王就是原本的核心關，不再另外加成；其餘一律用第一關當底，靠深度拉難度
  if (node.type === 'boss') return { stageKey: ch.id + '-3', scaleMul: 1 };
  if (node.type === 'cave') return { stageKey: ch.id + '-1', scaleMul: 1 + node.c * 0.05, cave: true };
  const depth = 1 + node.c * 0.065;
  return { stageKey: ch.id + '-1', scaleMul: node.type === 'elite' ? depth * 1.2 : depth };
};

/* 節點打贏了，對應到哪一個關卡代號（裝備與職業解鎖看的是這個） */
G.runStageKeyFor = function (node) {
  const ch = G.getChapter(G.S.run.chapterId);
  if (node.type === 'cave') return null;       // 洞穴不是關卡，不解鎖任何東西
  if (node.type === 'boss') return ch.id + '-3';
  if (node.type === 'elite') return ch.id + '-2';
  return ch.id + '-1';
};

/* ══════════ 結果套用 ══════════ */
function grantItem() {
  const owned = G.S.owned;
  const ci = G.CHAPTERS.findIndex(c => c.id === G.S.run.chapterId);
  const cands = G.ITEMS.filter(it => it.price > 0 && owned.indexOf(it.id) < 0);
  if (!cands.length) return null;
  // 盡量給跟目前進度相稱的東西，太超前的不給
  const cap = 400 + ci * 900;
  const fit = cands.filter(it => it.price <= cap);
  const list = fit.length ? fit : cands;
  const it = list[Math.floor(Math.random() * list.length)];
  owned.push(it.id);
  return it;
};

G.runApply = function (res) {
  const run = G.S.run;
  const out = [];
  if (res.hp) {
    run.hpPct = Math.max(0.02, Math.min(1, run.hpPct + res.hp));
    out.push({ kind: res.hp < 0 ? 'bad' : 'good', text: (res.hp < 0 ? '生命 −' : '生命 +') + Math.round(Math.abs(res.hp) * 100) + '%' });
  }
  if (res.heal) {
    run.hpPct = Math.min(1, run.hpPct + res.heal);
    out.push({ kind: 'good', text: '回復 ' + Math.round(res.heal * 100) + '% 生命' });
  }
  if (res.gold) {
    G.S.gold = Math.max(0, G.S.gold + res.gold);
    out.push({ kind: res.gold < 0 ? 'bad' : 'good', text: '金幣 ' + (res.gold > 0 ? '+' : '−') + G.fmtGold(Math.abs(res.gold)) });
  }
  if (res.sp) { G.S.sp += res.sp; out.push({ kind: 'good', text: '技能點 +' + res.sp }); }
  if (res.potion) { G.S.consumables.c_potion += res.potion; out.push({ kind: 'good', text: '油罐 ×' + res.potion }); }
  if (res.charge) { G.S.consumables.c_charge += res.charge; out.push({ kind: 'good', text: '火藥包 ×' + res.charge }); }
  if (res.herb) {
    G.S.consumables.c_herb = (G.S.consumables.c_herb | 0) + res.herb;
    out.push({ kind: 'good', text: '藥草 ×' + res.herb });
  }
  if (res.item) {
    const it = res.item === 'any' ? grantItem() : G.getItem(res.item);
    if (it) {
      if (G.S.owned.indexOf(it.id) < 0) G.S.owned.push(it.id);
      out.push({ kind: 'good', text: '獲得裝備：' + it.name });
    }
  }
  if (res.bless) {
    run.blessings.push(res.bless);
    out.push({ kind: 'good', text: '加持：' + res.bless.name + '　' + res.bless.desc });
  }
  if (run.hpPct <= 0.02 && res.hp) out.push({ kind: 'bad', text: '你剩下最後一口氣。' });
  G.save();
  return out;
};

/* 擲一次事件選項 */
G.runRoll = function (option) {
  const total = option.roll.reduce((a, e) => a + e.w, 0);
  let r = Math.random() * total;
  for (const e of option.roll) { r -= e.w; if (r <= 0) return e; }
  return option.roll[option.roll.length - 1];
};

G.runFinishNode = function (node, logText, logKind) {
  node.done = true;
  node.revealed = true;
  if (logText) G.S.run.log.push({ text: logText, kind: logKind || 'info' });
  if (G.S.run.log.length > 24) G.S.run.log.shift();
  G.save();
};

/* 洞穴：清空拿藥草，然後原路退回岔路口 */
G.runCaveDone = function (node, won) {
  const run = G.S.run;
  let herbs = 0;
  if (won) {
    herbs = 4 + Math.floor(Math.random() * 2);
    G.S.consumables.c_herb = (G.S.consumables.c_herb | 0) + herbs;
    G.runFinishNode(node, '洞穴清空了，採到 ' + herbs + ' 株藥草。', 'good');
  } else {
    run.log.push({ text: '洞穴裡的東西沒清乾淨，退了出來。', kind: 'bad' });
  }
  run.at = node.backTo || run.at;
  G.save();
  return herbs;
};

/* 在地圖上用藥草。戰鬥中不能用 —— 主角沒有恢復手段是這一版的前提。 */
G.runUseHerb = function () {
  const run = G.runActive();
  if (!run) return { ok: false, why: '沒有進行中的遠征' };
  if (!(G.S.consumables.c_herb > 0)) return { ok: false, why: '沒有藥草了。去洞穴採。' };
  if (run.hpPct >= 0.999) return { ok: false, why: '生命已經滿了' };
  G.S.consumables.c_herb--;
  run.hpPct = Math.min(1, run.hpPct + G.HERB_HEAL);
  run.log.push({ text: '嚼了一株藥草，回復 ' + Math.round(G.HERB_HEAL * 100) + '% 生命。', kind: 'good' });
  G.save();
  return { ok: true, hp: Math.round(run.hpPct * 100) };
};

/* 營地 */
G.runCamp = function (node, optionId) {
  const run = G.S.run;
  let out = [];
  if (optionId === 'rest') out = G.runApply({ heal: 0.55 });
  else if (optionId === 'sharpen') out = G.runApply({ bless: { name: '磨利', desc: '這趟遠征傷害 +12%', mods: { dmg: 0.12 } } });
  else {
    run.nodes.forEach(n => { if (n.hidden) n.revealed = true; });
    out = G.runApply({ gold: 140 });
    out.push({ kind: 'good', text: '地圖上所有未知的節點都亮起來了' });
  }
  G.runFinishNode(node, '在營地' + (optionId === 'rest' ? '休息' : optionId === 'sharpen' ? '磨了武器' : '派人探路') + '。', 'good');
  return out;
};

/* ══════════ 遠征結束 ══════════ */
G.runRetreat = function () {
  if (!G.S.run) return;
  G.S.run.finished = true;
  G.S.run.retreated = true;
  G.save();
};

G.runComplete = function () {
  const run = G.S.run;
  if (!run) return null;
  const ch = G.getChapter(run.chapterId);
  run.cleared = true;
  run.finished = true;
  const bonus = Math.round(ch.reward.gold * 1.2);
  G.S.gold += bonus;
  // 打完大王等同整章通過，後面章節與裝備解鎖都看這三個代號
  G.S.cleared[ch.id + '-1'] = true;
  G.S.cleared[ch.id + '-2'] = true;
  G.S.cleared[ch.id + '-3'] = true;
  G.save();
  return { bonus, chapter: ch };
};

G.runClear = function () {
  G.S.run = null;
  G.save();
};

/* 這章有沒有正在進行的遠征 */
G.runActive = () => G.S.run && !G.S.run.finished ? G.S.run : null;

/* 加持轉成數值加成，讓 computeStats 吃得到 */
G.runMods = function () {
  const run = G.runActive();
  if (!run) return null;
  const m = {};
  run.blessings.forEach(b => {
    for (const k in b.mods) m[k] = (m[k] || 0) + b.mods[k];
  });
  return m;
};

G.RUN_VB = { w: VB_W, h: VB_H };
G.RUN_COLS = COLS;
