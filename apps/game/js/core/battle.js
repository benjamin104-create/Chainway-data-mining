/* 戰鬥模擬：橫向單線推塔
 * 世界座標 x 從 0（我方城門）到 stage.length（敵方主塔）
 * z 是車道偏移（-22 ~ 22），只影響視覺與距離判定的細微差異
 */
window.G = window.G || {};

const B = {};
G.B = B;

const GROUND_Y = 322;      // 畫面上的地平線
const VIEW_W = 960;
const VIEW_H = 420;

/* 我方小兵原型 */
const ALLY_UNITS = {
  recruit: { name: '志願兵', hp: 52, dmg: 8,  speed: 46, range: 26,  size: 15, color: '#C8A05E', kind: 'melee' },
  archer:  { name: '弓手',   hp: 36, dmg: 9,  speed: 42, range: 155, size: 14, color: '#9FC2F0', kind: 'ranged' },
  bulwark: { name: '盾衛',   hp: 130, dmg: 7, speed: 34, range: 28,  size: 19, color: '#8E7A54', kind: 'tank' },
  lamp:    { name: '燈兵',   hp: 88, dmg: 19, speed: 52, range: 34,  size: 15, color: '#E0B23C', kind: 'melee' },
  clone:   { name: '影分身', hp: 60, dmg: 18, speed: 120, range: 32, size: 14, color: '#8E6BE0', kind: 'melee' }
};

let uid = 0;
const nid = () => ++uid;

/* ══════════ 初始化 ══════════ */
B.init = function (stageKey, opts) {
  opts = opts || {};
  const stage = opts.cave ? G.caveStage(G.getStage(stageKey)) : G.getStage(stageKey);
  const chapter = G.getChapter(stage.chapterId);
  const built = G.computeStats();

  B.stage = stage;
  B.chapter = chapter;
  const depth = opts.scaleMul || 1;
  B.escale = stage.scale * depth;                       // 敵方：遠征走得越深越硬
  B.ascale = stage.scale * (1 + (depth - 1) * 0.5);     // 我方吃一半，否則整條線會被輾平
  B.startHpPct = opts.startHpPct != null ? opts.startHpPct : 1;
  B.nodeLabel = opts.label || null;
  B.stats = built.stats;
  B.flags = built.flags;
  B.skillDefs = built.skills;
  B.cls = built.cls;

  B.token = (B.token || 0) + 1;   // 用來讓上一場的延遲回呼失效
  B.time = 0;
  B.over = null;              // 'win' | 'lose'
  B.overTimer = 0;
  B.entities = [];
  B.projectiles = [];
  B.effects = [];
  B.texts = [];
  B.particles = [];
  B.camX = 0;
  B.shake = 0;
  B.waveTimer = 3;
  B.waveNo = 0;
  B.kills = 0;
  B.goldEarned = 0;
  B.goldSpent = 0;
  B.purse = Math.round(90 * (1 + stage.chapterIdx * 0.3));   // 出發時的現場資金
  B.activePost = null;
  B.auras = [];
  B.blocker = null;
  B.blockX = null;
  B.respawnTimer = 0;
  B.paused = false;
  B.deaths = 0;                // 倒下幾次，會從帶出去的血扣掉
  B.caveMode = !!opts.cave;    // 洞穴：短、怪有限、打完有藥草
  B.phase = 'deploy';          // 'deploy' → 按開戰 → 'fight'

  B.cd = [0, 0, 0, 0];
  B.dashCharges = B.flags.has('doubleDash') ? 2 : 1;
  B.dashRecharge = 0;
  B.consumables = { c_potion: G.S.consumables.c_potion | 0, c_charge: G.S.consumables.c_charge | 0 };
  B.buffs = [];               // {mods, allyMods, until}
  B.resonance = { stacks: 0, until: 0 };
  B.stillTimer = 0;
  B.channel = null;
  B.blinkStorm = null;

  /* 英雄 */
  B.hero = {
    id: nid(), kind: 'hero', faction: 'ally', x: 60, z: 0,
    hp: Math.max(1, Math.round(B.stats.hp * B.startHpPct)), maxHp: B.stats.hp, size: 18,
    dead: false, facing: 1, atkTimer: 0, bob: 0, hitFlash: 0,
    shield: 0, invuln: 0, name: B.cls.name, color: '#E07A3F'
  };
  B.entities.push(B.hero);

  /* 我方城門 */
  const gateAtkSpd = B.flags.has('bigwave') ? 1.5 : 1.0;
  B.gate = mkStructure('ally', 20, 1400 * B.ascale, 14 * B.escale, 200, '我方城門', gateAtkSpd);
  B.gate.armor = 18;
  B.entities.push(B.gate);

  /* 敵方塔 */
  const n = stage.towers;
  const spots = n === 3 ? [0.40, 0.70, 1.0] : n === 2 ? [0.55, 1.0] : [1.0];
  B.towers = spots.map((f, i) => {
    const last = i === n - 1;
    const t = mkStructure(
      'enemy',
      Math.round(stage.length * f),
      Math.round((last ? (B.caveMode ? 210 : 620) : 340) * B.escale),
      Math.round((last ? (B.caveMode ? 9 : 22) : 16) * B.escale),
      last ? (B.caveMode ? 125 : 230) : 190,
      last ? (B.caveMode ? '巢穴' : '主塔') : '哨塔 ' + (i + 1),
      1.0
    );
    t.isMain = last;
    t.order = i;
    B.entities.push(t);
    return t;
  });

  /* 頭目：與主塔一起出現 */
  if (stage.isBoss) {
    const bossProto = G.ENEMY_TYPES[chapter.enemies[2]];
    const boss = {
      id: nid(), kind: 'boss', faction: 'enemy',
      x: stage.length - 150, z: 0,
      hp: Math.round(bossProto.hp * B.escale * 7),
      maxHp: 0, dmg: bossProto.dmg * B.escale * 1.5,
      speed: bossProto.speed * 0.8, range: 46, size: 34,
      color: chapter.palette.accent, atkTimer: 0, dead: false,
      name: chapter.boss.name, title: chapter.boss.title,
      armor: 10 + stage.chapterIdx * 3, bob: 0, hitFlash: 0,
      isBoss: true, castTimer: 4,
      leashX: stage.length - 430      // 守塔：不會再一路走到你家城門
    };
    boss.maxHp = boss.hp;
    B.entities.push(boss);
    B.boss = boss;
  } else {
    B.boss = null;
  }

  /* 僱用所：城門附近一個，每座敵塔前方各一個。
     越深處的據點貨色越好、也越便宜，但要先把前面的塔拆掉才走得到。 */
  B.posts = [{ x: 260, idx: 0 }].concat(
    B.towers.map((t, i) => ({ x: Math.round(t.x - 300), idx: i + 1 }))
  ).map(pp => {
    const def = G.POST_OFFERS[Math.min(pp.idx, G.POST_OFFERS.length - 1)];
    return { x: pp.x, idx: pp.idx, name: def.name, offers: def.offers.slice(), stock: def.stock.slice() };
  });

  updateMainInvuln();
  updateFrontLine();
  return B;
};

/* 封鎖線：還有哨塔活著就過不去 */
function updateFrontLine() {
  const front = B.towers.find(t => !t.dead);
  // 停在塔的正前方，不是塔後 230。設太遠的話往前走到底反而打不到那座塔。
  B.frontLine = (front && !front.isMain) ? front.x + 40 : B.stage.length + 40;
}

/* 部署完畢，開打 */
B.begin = function () {
  if (B.phase !== 'deploy') return;
  B.phase = 'fight';
  B.time = 0;
  B.waveTimer = 3;
  B.activePost = null;
  B.effects.length = 0;
};

function mkStructure(faction, x, hp, dmg, range, name, atkSpdMul) {
  return {
    id: nid(), kind: 'tower', faction, x, z: 0,
    hp: Math.round(hp), maxHp: Math.round(hp),
    dmg, range, atkSpd: 0.8 * (atkSpdMul || 1), atkTimer: 0,
    size: 30, isStructure: true, dead: false, name,
    armor: 6, hitFlash: 0, invuln: false
  };
}

function updateMainInvuln() {
  const main = B.towers[B.towers.length - 1];
  const others = B.towers.slice(0, -1);
  main.invuln = others.some(t => !t.dead);
}

/* ══════════ 數值輔助 ══════════ */
function heroBuffMods(key) {
  let v = 0;
  B.buffs.forEach(b => { if (b.mods && b.mods[key]) v += b.mods[key]; });
  return v;
}
function allyBuffMods(key) {
  let v = 0;
  B.buffs.forEach(b => { if (b.allyMods && b.allyMods[key]) v += b.allyMods[key]; });
  return v;
}

B.heroDmg = function () {
  let d = B.stats.dmg * (1 + heroBuffMods('dmg') + auraBonus(B.hero, 'dmg'));
  if (B.flags.has('rooted') && B.stillTimer >= 1) d *= 1.5;
  return d;
};
B.heroAtkSpd = function () {
  let s = B.stats.atkSpd * (1 + heroBuffMods('atkSpd'));
  if (B.resonance.until > B.time) s *= (1 + 0.06 * B.resonance.stacks);
  return s;
};
B.heroMoveSpd = function () {
  let s = B.stats.moveSpd * (1 + heroBuffMods('moveSpd'));
  if (B.channel && B.channel.moveBonus) s *= (1 + B.channel.moveBonus);
  return s;
};
B.cdMul = () => 1 - B.stats.cdr;

function mitigate(amount, armor) {
  const a = Math.max(0, armor || 0);
  return amount * (60 / (60 + a));
}

/* ══════════ 傷害 ══════════ */
function dealDamage(src, tgt, amount, opt) {
  opt = opt || {};
  if (!tgt || tgt.dead || tgt.invuln) return 0;
  const fromHero = src === B.hero;

  let dmg = amount;
  let crit = !!opt.forceCrit;

  if (fromHero) {
    if (!opt.noCrit) {
      if (B.flags.has('backstab') && !tgt.isStructure && Math.sign(tgt.x - B.hero.x) !== B.hero.facing) crit = true;
      if (!crit && Math.random() < B.stats.crit) crit = true;
    }
    if (crit) dmg *= B.stats.critDmg;
    if (B.flags.has('execute') && !tgt.isStructure && tgt.hp / tgt.maxHp < 0.25) dmg *= 1.8;
    if (tgt.isStructure) dmg *= (1 + B.stats.siege);
  }
  if (!fromHero && src && src.faction === 'ally' && tgt.isStructure) {
    dmg *= (src.siegeMul != null ? src.siegeMul
          : (src.kind === 'minion' || src.kind === 'hired') ? 3 : 1);
  }
  if (!fromHero && src && src.unitMul != null && !tgt.isStructure) dmg *= src.unitMul;
  if (tgt.vulnUntil > B.time) dmg *= (1 + tgt.vuln);

  dmg = mitigate(dmg, tgt.armor);
  if (fromHero && B.flags.has('rooted') === false) { /* no-op */ }

  dmg = Math.max(1, Math.round(dmg));

  if (tgt === B.hero) {
    if (B.hero.invuln > 0) return 0;
    let taken = dmg;
    if (B.flags.has('rooted') && B.stillTimer >= 1) taken *= 0.75;
    if (B.hero.shield > 0) {
      const absorbed = Math.min(B.hero.shield, taken);
      B.hero.shield -= absorbed;
      taken -= absorbed;
    }
    taken = Math.round(taken);
    B.hero.hp -= taken;
    B.hero.hitFlash = 0.18;
    if (taken > 0) pushText(B.hero.x, -30, '-' + taken, '#FF8A6A', false);
    if (B.flags.has('thorns') && src && !src.isStructure && dist(src, B.hero) < 60) {
      src.hp -= Math.round(taken * 0.25);
      checkDeath(src, B.hero);
    }
    if (B.hero.hp <= 0) heroDown();
    return taken;
  }

  tgt.hp -= dmg;
  tgt.hitFlash = 0.14;
  pushText(tgt.x, -(tgt.size + 14), (crit ? '' : '') + dmg, crit ? '#FFD469' : '#F0E4CC', crit);

  if (fromHero) {
    if (B.stats.lifesteal > 0 || (B.flags.has('lastStand') && B.hero.hp / B.hero.maxHp < 0.35)) {
      const ls = B.stats.lifesteal + (B.flags.has('lastStand') && B.hero.hp / B.hero.maxHp < 0.35 ? 0.1 : 0);
      B.hero.hp = Math.min(B.hero.maxHp, B.hero.hp + Math.round(dmg * ls));
    }
    if (crit) {
      if (B.flags.has('combo')) for (let i = 0; i < 4; i++) B.cd[i] = Math.max(0, B.cd[i] - 0.6);
      if (B.flags.has('echoCrit') && !opt.isEcho) {
        dealDamage(B.hero, tgt, amount * 0.45, { noCrit: true, isEcho: true, noProc: true });
      }
    }
    if (opt.isSkill && B.flags.has('burn') && !tgt.isStructure) {
      tgt.burn = { dps: amount * 0.4 / 4, until: B.time + 4 };
    }
    if (opt.isSkill && B.flags.has('resonance')) {
      B.resonance.stacks = Math.min(5, B.resonance.stacks + 1);
      B.resonance.until = B.time + 5;
    }
  }

  checkDeath(tgt, src);
  return dmg;
}
B.dealDamage = dealDamage;

function checkDeath(e, killer) {
  if (e.dead || e.hp > 0) return;
  e.dead = true;
  burst(e.x, e.z, e.color || '#C8A05E', e.isStructure ? 34 : 14);

  if (e.faction === 'enemy') {
    B.kills++;
    const g = Math.round((e.isStructure ? 45 : e.isBoss ? 160 : 7) * (1 + B.stage.chapterIdx * 0.3) * (1 + B.stats.goldFind));
    B.goldEarned += g;
    B.purse += g;
    pushText(e.x, -(e.size + 26), '+' + g, '#E0B23C', false);

    if (killer === B.hero && B.flags.has('resetOnKill')) {
      B.dashCharges = B.flags.has('doubleDash') ? 2 : 1;
      B.hero.hp = Math.min(B.hero.maxHp, B.hero.hp + Math.round(B.hero.maxHp * 0.03));
    }
    if (e.isStructure) {
      B.shake = Math.max(B.shake, 16);
      updateMainInvuln();
      if (B.flags.has('breach')) {
        B.hero.hp = Math.min(B.hero.maxHp, B.hero.hp + Math.round(B.hero.maxHp * 0.12));
        let best = 0;
        for (let i = 1; i < 4; i++) if (B.cd[i] > B.cd[best]) best = i;
        B.cd[best] = 0;
      }
      if (e.isMain) finish('win');
    }
  } else {
    if (e.isStructure && e === B.gate) finish('lose');
    if (e.kind === 'minion' && B.flags.has('ember')) {
      B.effects.push({ type: 'ring', x: e.x, z: e.z, r: 0, max: 80, t: 0, dur: 0.35, color: '#E0B23C' });
      B.entities.forEach(o => {
        if (o.faction === 'enemy' && !o.dead && !o.isStructure && dist(o, e) < 80) {
          dealDamage(B.hero, o, B.stats.dmg * 1.2, { noCrit: true, noProc: true });
        }
      });
    }
  }
}

function heroDown() {
  B.hero.dead = true;
  B.hero.hp = 0;
  B.deaths++;
  B.respawnTimer = 6;
  burst(B.hero.x, B.hero.z, '#E07A3F', 26);
  B.shake = 12;
}

function finish(result) {
  if (B.over) return;
  B.over = result;
  B.overTimer = 0;
  B.shake = 20;
}

/* ══════════ 工具 ══════════ */
function dist(a, b) { const dx = a.x - b.x, dz = (a.z || 0) - (b.z || 0); return Math.hypot(dx, dz); }
B.dist = dist;

function pushText(x, dy, text, color, big) {
  if (B.texts.length > 90) B.texts.shift();
  B.texts.push({ x, dy, text, color, big: !!big, t: 0, dur: 0.85, vx: (Math.random() - 0.5) * 14 });
}
function burst(x, z, color, count) {
  for (let i = 0; i < count; i++) {
    B.particles.push({
      x, z, y: 0,
      vx: (Math.random() - 0.5) * 170,
      vy: -Math.random() * 190 - 40,
      vz: (Math.random() - 0.5) * 40,
      color, t: 0, dur: 0.45 + Math.random() * 0.4, size: 1 + Math.random() * 2.5
    });
  }
}
B.burst = burst;

function hostiles(faction) { return faction === 'ally' ? 'enemy' : 'ally'; }

function nearestHostile(e, maxRange, structuresToo) {
  const want = hostiles(e.faction);
  let best = null, bd = maxRange;
  for (const o of B.entities) {
    if (o.dead || o.faction !== want) continue;
    if (o.isStructure && !structuresToo) continue;
    if (o.invuln) continue;
    if (o === B.hero && B.hero.dead) continue;
    const d = dist(e, o);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

/* 射程內的敵方建築 */
function nearestStructure(e, maxRange) {
  const want = hostiles(e.faction);
  let best = null, bd = maxRange;
  for (const o of B.entities) {
    if (o.dead || o.faction !== want || !o.isStructure || o.invuln) continue;
    const d = dist(e, o) - o.size * 0.6;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

/* 前方目標：小兵往前推，優先打路上的敵人，否則打最近的敵方建築 */
function marchTarget(e) {
  // 被路障擋住的敵人：除非有東西貼著它，否則先拆路障
  if (e.faction === 'enemy' && B.blocker && !B.blocker.dead && Math.abs(e.x - B.blocker.x) < 60) {
    return nearestHostile(e, 70, false) || B.blocker;
  }
  const near = nearestHostile(e, 230, false);
  if (near) return near;
  const want = hostiles(e.faction);
  let best = null, bd = Infinity;
  for (const o of B.entities) {
    if (o.dead || o.faction !== want || !o.isStructure || o.invuln) continue;
    const d = Math.abs(o.x - e.x);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

/* ══════════ 生成波次 ══════════ */
function spawnWave() {
  B.waveNo++;
  const s = B.stage;

  /* 洞穴是短程遭遇：雙方都少，怪清光就結束 */
  if (B.caveMode) {
    ['recruit', 'recruit', 'archer'].forEach((k, i) => spawnMinion('ally', k, B.gate.x + 30 + i * 16, i));
    if (B.waveNo > 2) return;
    const cpool = B.chapter.enemies;
    const src0 = B.towers[0];
    const n0 = 3 + B.stage.idx;
    for (let i = 0; i < n0; i++) {
      spawnEnemy(cpool[Math.floor(Math.random() * cpool.length)], src0.x - 60 - i * 22, i);
    }
    return;
  }

  /* 我方：跟敵方一樣隨波次變多，英雄才是決勝的那一票 */
  const growth = Math.min(3, Math.floor(B.waveNo / 3));
  const extra = B.flags.has('bigwave') ? 2 : 0;
  const comp = ['recruit', 'recruit', 'archer'];
  for (let i = 0; i < growth; i++) comp.push(i % 2 === 0 ? 'recruit' : 'archer');
  if (B.waveNo % 3 === 0) comp.push('bulwark');
  for (let i = 0; i < extra; i++) comp.push('recruit');
  comp.forEach((k, i) => spawnMinion('ally', k, B.gate.x + 30 + i * 16, i));

  /* 敵方：從最前面還活著的塔出來 */
  const src = B.towers.find(t => !t.dead) || B.towers[B.towers.length - 1];
  const pool = B.chapter.enemies;
  // 拆掉一座塔，敵方出兵就少一截 —— 推進本身就是防守
  const towerFrac = B.towers.filter(t => !t.dead).length / B.towers.length;
  let count = Math.max(1, Math.round((3 + Math.min(3, Math.floor(B.waveNo / 3)) + s.idx) * towerFrac));
  // 場上敵人有上限：清不掉的時候不該再往上疊，否則一旦落後就永遠追不回來
  const onField = B.entities.filter(e => e.faction === 'enemy' && e.kind === 'minion' && !e.dead).length;
  count = Math.max(0, Math.min(count, 24 - onField));
  if (count === 0) return;
  for (let i = 0; i < count; i++) {
    const key = pool[Math.min(pool.length - 1, Math.floor(Math.random() * (1 + Math.min(2, Math.floor(B.waveNo / 2)))))];
    spawnEnemy(key, src.x - 40 - i * 18, i);
  }
}

function spawnMinion(faction, key, x, i) {
  const p = ALLY_UNITS[key];
  const hpMul = B.ascale * (1 + B.stats.minionHp);
  const dmgMul = B.ascale * (1 + B.stats.minionDmg);
  const e = {
    id: nid(), kind: 'minion', faction, unit: key,
    x, z: ((i % 5) - 2) * 9 + (Math.random() - 0.5) * 5,
    hp: Math.round(p.hp * hpMul), maxHp: Math.round(p.hp * hpMul),
    dmg: p.dmg * dmgMul, speed: p.speed, range: p.range,
    size: p.size, color: p.color, kind2: p.kind, name: p.name,
    atkTimer: 0, atkSpd: 0.9, armor: 3 + B.stage.chapterIdx, dead: false,
    facing: 1, bob: Math.random() * 6, hitFlash: 0, regenTimer: 0
  };
  B.entities.push(e);
  return e;
}

function spawnEnemy(key, x, i) {
  const p = G.ENEMY_TYPES[key];
  const sc = B.escale;
  const e = {
    id: nid(), kind: 'minion', faction: 'enemy', unit: key,
    x, z: ((i % 5) - 2) * 9 + (Math.random() - 0.5) * 5,
    hp: Math.round(p.hp * sc), maxHp: Math.round(p.hp * sc),
    dmg: p.dmg * sc, speed: p.speed, range: p.range,
    size: p.size, color: p.color, kind2: p.kind, name: p.name,
    atkTimer: Math.random(), atkSpd: p.kind === 'swarm' ? 1.5 : 0.85,
    armor: 2 + B.stage.chapterIdx * 1.5, dead: false,
    facing: -1, bob: Math.random() * 6, hitFlash: 0
  };
  B.entities.push(e);
  return e;
}
B.spawnMinion = spawnMinion;

/* ══════════ 僱用 ══════════ */
function spawnHired(hire, x) {
  const u = hire.unit;
  const sc = B.ascale;
  const hpMul = sc * (1 + B.stats.minionHp);
  const dmgMul = sc * (1 + B.stats.minionDmg);
  const e = {
    id: nid(), kind: 'hired', faction: 'ally', unit: hire.id, hireId: hire.id,
    x, z: (Math.random() - 0.5) * 18,
    hp: Math.round(u.hp * hpMul), maxHp: Math.round(u.hp * hpMul),
    dmg: u.dmg * dmgMul, speed: u.speed, range: u.range,
    size: u.size, color: u.color, kind2: u.kind, name: hire.name,
    atkTimer: 0, atkSpd: u.atkSpd || 0.9,
    armor: 4 + B.stage.chapterIdx * 1.5, dead: false,
    facing: 1, bob: Math.random() * 6, hitFlash: 0,
    siegeMul: u.siegeMul, unitMul: u.unitMul, splash: u.splash,
    pulse: u.pulse ? { radius: u.pulse.radius, mult: u.pulse.mult, tick: u.pulse.tick, t: 0 } : null,
    heal: u.heal, healRadius: u.healRadius
  };
  B.entities.push(e);
  return e;
}

function placeGear(hire, x) {
  const g = hire.gear;
  const e = mkStructure('ally', Math.round(x), g.hp * B.ascale, 0, 0, hire.name, 1);
  e.isGear = true;
  e.gearKind = hire.id;
  e.size = g.size;
  e.armor = 10 + B.stage.chapterIdx;
  e.isBlocker = !!g.blocker;
  e.burnAura = g.burn || null;
  e.aura = g.aura || null;
  e.color = '#C09A54';
  B.entities.push(e);
  return e;
}

B.selectPost = function (post) {
  if (B.phase !== 'deploy') return false;
  if (!post || post.x > B.frontLine) return false;
  B.activePost = post;
  return true;
};

B.hireCostAt = function (hireId, post) {
  return G.hireCost(G.getHire(hireId), post.idx, B.stage.chapterIdx);
};

B.hire = function (hireId) {
  if (B.over || B.paused) return { ok: false, why: '現在不能僱用' };
  if (B.phase === 'fight' && B.hero.dead) return { ok: false, why: '你倒下了，等重生' };
  const post = B.activePost;
  if (!post) return { ok: false, why: B.phase === 'deploy' ? '先點地圖上的據點' : '要站到僱用所旁邊' };
  if (B.phase === 'deploy' && post.x > B.frontLine) return { ok: false, why: '這個據點要先拆掉前面的哨塔才到得了' };
  const slot = post.offers.indexOf(hireId);
  if (slot < 0) return { ok: false, why: '這個據點沒有這一項' };
  if (post.stock[slot] <= 0) return { ok: false, why: '這裡已經調度完了' };
  const hire = G.getHire(hireId);
  const cost = B.hireCostAt(hireId, post);
  if (B.purse < cost) return { ok: false, why: '現場資金不足' };

  B.purse -= cost;
  B.goldSpent += cost;
  post.stock[slot]--;
  const at = B.phase === 'deploy' ? post.x : B.hero.x;
  if (hire.gear) placeGear(hire, at);
  else spawnHired(hire, at + 26);
  pushText(at, -54, '-' + cost, '#E0B23C', false);
  B.effects.push({ type: 'ring', x: at, z: 0, r: 0, max: 72, t: 0, dur: 0.35, color: '#E0B23C' });
  return { ok: true, hire: hire, cost: cost };
};

/* 光環：戰旗之類的武具 */
function auraBonus(e, key) {
  let v = 0;
  for (const a of B.auras) if (dist(a, e) < a.aura.radius) v += (a.aura[key] || 0);
  return v;
}

/* ══════════ 技能 ══════════ */
B.cast = function (slot) {
  if (B.over || B.hero.dead || B.paused) return;
  const def = B.skillDefs[slot];
  if (!def) return;
  if (def.type === 'dash') {
    if (B.dashCharges <= 0) return;
    B.dashCharges--;
    if (B.dashRecharge <= 0) B.dashRecharge = def.cd * B.cdMul();
  } else {
    if (B.cd[slot] > 0) return;
    B.cd[slot] = def.cd * B.cdMul();
  }
  runSkill(def);
  if (B.flags.has('echo') && Math.random() < 0.3) {
    const tok = B.token;
    setTimeout(() => { if (B.token === tok && !B.over) runSkill(def, 0.5); }, 220);
  }
};

function runSkill(def, scale) {
  scale = scale || 1;
  const tok = B.token;
  const h = B.hero;
  const power = B.stats.power * scale;
  const base = B.heroDmg() * power;

  switch (def.type) {
    case 'arc': {
      B.effects.push({ type: 'arc', x: h.x, z: h.z, r: def.radius, t: 0, dur: 0.28, facing: h.facing, color: B.cls.color });
      B.shake = Math.max(B.shake, 5);
      B.entities.forEach(o => {
        if (o.faction !== 'enemy' || o.dead || o.invuln) return;
        const dx = o.x - h.x;
        if (Math.sign(dx) !== h.facing && Math.abs(dx) > 12) return;
        if (dist(o, h) > def.radius + o.size) return;
        dealDamage(h, o, base * def.mult, { isSkill: true });
        if (def.knock && !o.isStructure) o.x += def.knock * h.facing;
      });
      break;
    }
    case 'proj': {
      for (let i = 0; i < (def.count || 1); i++) {
        const spreadDeg = (i - ((def.count || 1) - 1) / 2) * (def.spread || 0);
        const rad = spreadDeg * Math.PI / 180;
        B.projectiles.push({
          x: h.x + h.facing * 18, z: h.z, y: -22,
          vx: Math.cos(rad) * (def.speed) * h.facing,
          vz: Math.sin(rad) * def.speed * 0.35,
          dmg: base * def.mult, src: h, faction: 'ally',
          pierce: def.pierce || 0, hits: [], size: def.size || 5,
          color: def.color || B.cls.color, life: 1.6, isSkill: true
        });
      }
      break;
    }
    case 'ground': {
      const cx = h.x + (def.offset || 0) * h.facing;
      const fire = () => {
        B.effects.push({ type: 'ring', x: cx, z: 0, r: 0, max: def.radius, t: 0, dur: 0.4, color: B.cls.color });
        B.shake = Math.max(B.shake, 9);
        B.entities.forEach(o => {
          if (o.faction !== 'enemy' || o.dead || o.invuln) return;
          if (Math.abs(o.x - cx) > def.radius + o.size) return;
          dealDamage(h, o, base * def.mult, { isSkill: true });
          if (def.slow && !o.isStructure) { o.slow = def.slow; o.slowUntil = B.time + def.slowDur; }
          if (def.vuln) { o.vuln = def.vuln; o.vulnUntil = B.time + (def.slowDur || 5); }
          if (def.dot && !o.isStructure) o.burn = { dps: base * def.dot / 4, until: B.time + 4 };
        });
      };
      if (def.delay) {
        B.effects.push({ type: 'telegraph', x: cx, z: 0, r: def.radius, t: 0, dur: def.delay, color: B.cls.color });
        setTimeout(() => { if (B.token === tok && !B.over) fire(); }, def.delay * 1000);
      } else fire();
      break;
    }
    case 'dash': {
      const from = h.x;
      const to = Math.max(10, Math.min(B.stage.length - 10, h.x + def.dist * h.facing));
      h.x = to;
      if (def.invuln) h.invuln = Math.max(h.invuln, 0.35);
      B.effects.push({ type: 'trail', x: from, x2: to, z: h.z, t: 0, dur: 0.3, color: B.cls.color });
      const lo = Math.min(from, to), hi = Math.max(from, to);
      B.entities.forEach(o => {
        if (o.faction !== 'enemy' || o.dead || o.invuln || o.isStructure) return;
        if (o.x >= lo - 20 && o.x <= hi + 20) dealDamage(h, o, base * def.mult, { isSkill: true });
      });
      break;
    }
    case 'buff': {
      B.buffs.push({ mods: def.mods, allyMods: def.allyMods, until: B.time + def.dur, name: def.name, color: B.cls.color });
      B.effects.push({ type: 'ring', x: h.x, z: 0, r: 0, max: 200, t: 0, dur: 0.5, color: B.cls.color });
      break;
    }
    case 'summon': {
      const dur = def.dur * (B.flags.has('longburn') ? 1.6 : 1);
      for (let i = 0; i < def.count; i++) {
        const m = spawnMinion('ally', def.unit, h.x + 20 + i * 22, i);
        m.expire = B.time + dur;
        if (def.unit === 'clone') {
          m.dmg = B.heroDmg() * 0.55;
          m.hp = m.maxHp = Math.round(B.hero.maxHp * 0.28);
        }
        B.effects.push({ type: 'ring', x: m.x, z: m.z, r: 0, max: 44, t: 0, dur: 0.3, color: B.cls.color });
      }
      break;
    }
    case 'beam': {
      const x2 = h.x + def.len * h.facing;
      B.effects.push({ type: 'beam', x: h.x, x2, z: h.z, w: def.width, t: 0, dur: 0.45, color: B.cls.color });
      B.shake = Math.max(B.shake, 12);
      const lo = Math.min(h.x, x2), hi = Math.max(h.x, x2);
      B.entities.forEach(o => {
        if (o.faction !== 'enemy' || o.dead || o.invuln) return;
        if (o.x >= lo && o.x <= hi) dealDamage(h, o, base * def.mult, { isSkill: true });
      });
      break;
    }
    case 'wall': {
      const wx = h.x + 90 * h.facing;
      const w = mkStructure('ally', wx, B.hero.maxHp * def.hpMult, 0, 0, '石壁', 1);
      w.isWall = true; w.expire = B.time + def.dur; w.size = 26; w.armor = 20;
      B.entities.push(w);
      h.shield += Math.round(B.hero.maxHp * 0.25 * def.shieldMult);
      break;
    }
    case 'turret': {
      const t = mkStructure('ally', h.x + 40 * h.facing, B.hero.maxHp * 0.6, B.heroDmg() * def.dmgMult, def.range, '燈塔', 1.4);
      t.isTurret = true; t.expire = B.time + def.dur * (B.flags.has('longburn') ? 1.6 : 1);
      t.size = 24; t.armor = 8;
      B.entities.push(t);
      break;
    }
    case 'channel': {
      B.channel = { def, until: B.time + def.dur, next: 0, moveBonus: def.moveBonus };
      break;
    }
    case 'blinkstorm': {
      B.blinkStorm = { def, until: B.time + def.dur, next: 0 };
      break;
    }
  }
}

/* 消耗品 */
B.useConsumable = function (id) {
  if (B.over || B.hero.dead || !B.consumables[id]) return;
  B.consumables[id]--;
  if (id === 'c_potion') {
    const amt = Math.round(B.hero.maxHp * 0.35);
    B.hero.hp = Math.min(B.hero.maxHp, B.hero.hp + amt);
    pushText(B.hero.x, -40, '+' + amt, '#8FE08A', true);
    B.effects.push({ type: 'ring', x: B.hero.x, z: 0, r: 0, max: 60, t: 0, dur: 0.4, color: '#8FE08A' });
  } else {
    B.effects.push({ type: 'ring', x: B.hero.x, z: 0, r: 0, max: 170, t: 0, dur: 0.45, color: '#E0862A' });
    B.shake = 14;
    B.entities.forEach(o => {
      if (o.faction === 'enemy' && !o.dead && !o.invuln && Math.abs(o.x - B.hero.x) < 170) {
        dealDamage(B.hero, o, B.heroDmg() * 3.5, { isSkill: true, noCrit: true });
      }
    });
  }
};

/* ══════════ 每幀更新 ══════════ */
B.update = function (dt, input) {
  if (B.paused) return;
  dt = Math.min(dt, 0.05);
  B.time += dt;

  if (B.phase === 'deploy') {
    // 只讓特效與飄字動，戰局完全靜止
    updateFrontLine();
    B.effects.forEach(f => f.t += dt);
    B.effects = B.effects.filter(f => f.t < f.dur);
    B.texts.forEach(t => { t.t += dt; t.dy -= 42 * dt; });
    B.texts = B.texts.filter(t => t.t < t.dur);
    B.particles.forEach(pp => { pp.t += dt; pp.x += pp.vx * dt; pp.y += pp.vy * dt; pp.vy += 620 * dt; });
    B.particles = B.particles.filter(pp => pp.t < pp.dur && pp.y < 30);
    return;
  }

  if (B.shake > 0) B.shake = Math.max(0, B.shake - dt * 42);

  if (B.over) { B.overTimer += dt; }

  /* 冷卻 */
  for (let i = 0; i < 4; i++) if (B.cd[i] > 0) B.cd[i] = Math.max(0, B.cd[i] - dt);
  const maxCharges = B.flags.has('doubleDash') ? 2 : 1;
  if (B.dashCharges < maxCharges) {
    B.dashRecharge -= dt;
    if (B.dashRecharge <= 0) {
      B.dashCharges++;
      const dashDef = B.skillDefs.find(s => s && s.type === 'dash');
      if (B.dashCharges < maxCharges && dashDef) B.dashRecharge = dashDef.cd * B.cdMul();
    }
  }
  B.buffs = B.buffs.filter(b => b.until > B.time);

  /* 場上的武具：光環與路障 */
  B.auras.length = 0;
  B.blocker = null;
  for (const o of B.entities) {
    if (o.dead || o.faction !== 'ally') continue;
    if (o.aura) B.auras.push(o);
    if (o.isBlocker && (!B.blocker || o.x > B.blocker.x)) B.blocker = o;
  }
  B.blockX = B.blocker ? B.blocker.x : null;

  updateFrontLine();

  /* 站在哪個僱用所旁邊（部署階段改由點地圖決定） */
  B.activePost = (B.over || B.hero.dead) ? null :
    (B.posts.find(pp => Math.abs(pp.x - B.hero.x) < 120) || null);

  /* 英雄 */
  const h = B.hero;
  if (h.dead) {
    B.respawnTimer -= dt;
    if (B.respawnTimer <= 0 && !B.over) {
      h.dead = false;
      h.hp = Math.round(h.maxHp * 0.4);
      h.x = B.gate.x + 30;
      h.invuln = 1.5;
      B.effects.push({ type: 'ring', x: h.x, z: 0, r: 0, max: 70, t: 0, dur: 0.4, color: '#E07A3F' });
    }
  } else if (!B.over) {
    h.invuln = Math.max(0, h.invuln - dt);
    h.hitFlash = Math.max(0, h.hitFlash - dt);
    let mv = 0;
    if (input.left) mv -= 1;
    if (input.right) mv += 1;
    if (mv !== 0) {
      h.facing = mv;
      h.x += mv * B.heroMoveSpd() * dt;
      h.bob += dt * 12;
      B.stillTimer = 0;
    } else {
      B.stillTimer += dt;
      h.bob += dt * 2;
    }
    // 封鎖線：不能繞過還活著的哨塔跑到無敵的主塔前面乾等
    h.x = Math.max(12, Math.min(B.frontLine, h.x));
    /* 這一版主角沒有任何自動回血。血只能靠藥草、油罐與營地。 */

    /* 自動普攻 */
    h.atkTimer -= dt;
    if (h.atkTimer <= 0) {
      // 貼臉的先處理，否則射程內有塔就打塔 —— 不然遠程職業永遠在清兵、塔一格都掉不下來
      const close = nearestHostile(h, Math.max(52, B.stats.range * 0.45), false);
      const tgt = close || nearestStructure(h, B.stats.range + 20) || nearestHostile(h, B.stats.range + 20, false);
      if (tgt) {
        h.facing = Math.sign(tgt.x - h.x) || h.facing;
        h.atkTimer = 1 / Math.max(0.2, B.heroAtkSpd());
        h.swing = 0.18;
        if (B.stats.range > 90) {
          B.projectiles.push({
            x: h.x + h.facing * 16, z: h.z, y: -22,
            vx: 330 * h.facing, vz: 0, dmg: B.heroDmg(),
            faction: 'ally', pierce: 0, hits: [], size: 4,
            color: B.cls.color, life: 1.2
          });
        } else {
          dealDamage(h, tgt, B.heroDmg(), {});
          if (B.flags.has('cleave')) {
            const second = B.entities.find(o => o !== tgt && o.faction === 'enemy' && !o.dead && !o.invuln && dist(o, h) < B.stats.range + 45);
            if (second) dealDamage(h, second, B.heroDmg() * 0.6, { noProc: true });
          }
          if (B.flags.has('regen')) {
            let near = null, bd = 200;
            B.entities.forEach(o => { if (o.faction === 'ally' && o.kind === 'minion' && !o.dead) { const d = dist(o, h); if (d < bd) { bd = d; near = o; } } });
            if (near) near.hp = Math.min(near.maxHp, near.hp + Math.round(near.maxHp * 0.06));
          }
        }
      }
    }
    if (h.swing > 0) h.swing -= dt;
  }

  /* 引導技 */
  if (B.channel) {
    if (B.time > B.channel.until) B.channel = null;
    else {
      B.channel.next -= dt;
      if (B.channel.next <= 0) {
        B.channel.next = B.channel.def.tick;
        const d = B.channel.def;
        B.effects.push({ type: 'ring', x: h.x, z: 0, r: d.radius * 0.5, max: d.radius, t: 0, dur: 0.22, color: B.cls.color });
        B.entities.forEach(o => {
          if (o.faction === 'enemy' && !o.dead && !o.invuln && dist(o, h) < d.radius + o.size)
            dealDamage(h, o, B.heroDmg() * B.stats.power * d.mult, { isSkill: true });
        });
      }
    }
  }
  if (B.blinkStorm) {
    if (B.time > B.blinkStorm.until) B.blinkStorm = null;
    else {
      B.blinkStorm.next -= dt;
      if (B.blinkStorm.next <= 0) {
        B.blinkStorm.next = B.blinkStorm.def.tick;
        const tgt = nearestHostile(h, B.blinkStorm.def.reach, false);
        if (tgt) {
          const from = h.x;
          h.x = tgt.x - Math.sign(tgt.x - h.x) * 24;
          h.facing = Math.sign(tgt.x - h.x) || h.facing;
          h.invuln = Math.max(h.invuln, 0.12);
          B.effects.push({ type: 'trail', x: from, x2: h.x, z: h.z, t: 0, dur: 0.2, color: B.cls.color });
          dealDamage(h, tgt, B.heroDmg() * B.stats.power * B.blinkStorm.def.mult, { isSkill: true });
        }
      }
    }
  }

  /* 波次 */
  if (!B.over) {
    B.waveTimer -= dt;
    if (B.waveTimer <= 0) { spawnWave(); B.waveTimer = B.stage.waveGap; }
  }

  /* 單位 */
  const rallyOn = B.flags.has('rally');
  for (const e of B.entities) {
    if (e.dead || e === h) continue;
    e.hitFlash = Math.max(0, (e.hitFlash || 0) - dt);

    if (e.burn && e.burn.until > B.time) {
      e.hp -= e.burn.dps * dt;
      if (Math.random() < dt * 6) B.particles.push({ x: e.x, z: e.z, y: -e.size, vx: (Math.random() - .5) * 20, vy: -50, vz: 0, color: '#E0862A', t: 0, dur: .35, size: 2 });
      checkDeath(e, h);
      if (e.dead) continue;
    }
    if (e.expire && B.time > e.expire) { e.hp = 0; checkDeath(e, null); continue; }

    if (e.isStructure) {
      if (e.burnAura) {
        e.burnTick = (e.burnTick || 0) + dt;
        if (e.burnTick >= 0.4) {
          e.burnTick = 0;
          const tickDmg = e.burnAura.dps * 0.4 * B.ascale;
          for (const o of B.entities) {
            if (o.faction !== 'enemy' || o.dead || o.invuln || o.isStructure) continue;
            if (dist(o, e) < e.burnAura.radius) dealDamage(e, o, tickDmg, { noCrit: true });
          }
          B.particles.push({ x: e.x + (Math.random() - .5) * 40, z: e.z, y: -10,
            vx: (Math.random() - .5) * 20, vy: -70, vz: 0, color: '#E0862A', t: 0, dur: .5, size: 2 });
        }
      }
      e.atkTimer -= dt;
      if (e.atkTimer <= 0 && e.dmg > 0) {
        const tgt = nearestHostile(e, e.range, false);
        if (tgt) {
          e.atkTimer = 1 / e.atkSpd;
          B.projectiles.push({
            x: e.x, z: e.z, y: -46, vx: 0, vz: 0, homing: tgt,
            speed: 300, dmg: e.dmg, src: e, faction: e.faction, pierce: 0,
            hits: [], size: 6, color: e.faction === 'ally' ? '#E0B23C' : '#D1584A', life: 3
          });
        }
      }
      continue;
    }

    /* 小兵 / 頭目 AI */
    if (B.flags.has('regen') && e.faction === 'ally' && (e.kind === 'minion' || e.kind === 'hired')) {
      e.regenTimer = (e.regenTimer || 0) + dt;
      if (e.regenTimer >= 3) { e.regenTimer = 0; e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.06); }
    }

    /* 白魔道士：不打人，只補血 */
    if (e.heal) {
      e.healTimer = (e.healTimer || 0) + dt;
      if (e.healTimer >= 1.2) {
        e.healTimer = 0;
        let target = null, worst = 0.999;
        for (const o of B.entities) {
          if (o.dead || o.faction !== 'ally' || o.isStructure) continue;
          if (o === h) continue;                       // 主角不吃治療
          if (dist(o, e) > e.healRadius) continue;
          const f = o.hp / o.maxHp;
          if (f < worst) { worst = f; target = o; }
        }
        if (target) {
          const amt = Math.round(target.maxHp * e.heal);
          target.hp = Math.min(target.maxHp, target.hp + amt);
          pushText(target.x, -(target.size + 18), '+' + amt, '#8FE08A', false);
          B.effects.push({ type: 'ring', x: e.x, z: e.z, r: 0, max: 56, t: 0, dur: 0.3, color: '#8FE08A' });
        }
      }
    }

    /* 鑽地機：邊走邊震 */
    if (e.pulse) {
      e.pulse.t += dt;
      if (e.pulse.t >= e.pulse.tick) {
        e.pulse.t = 0;
        B.effects.push({ type: 'ring', x: e.x, z: e.z, r: e.pulse.radius * 0.4, max: e.pulse.radius, t: 0, dur: 0.25, color: '#B0703A' });
        for (const o of B.entities) {
          if (o.faction !== 'enemy' || o.dead || o.invuln || o.isStructure) continue;
          if (dist(o, e) < e.pulse.radius) dealDamage(e, o, e.dmg * e.pulse.mult, { noCrit: true });
        }
      }
    }

    const tgt = marchTarget(e);
    const dir = e.faction === 'ally' ? 1 : -1;
    let speed = e.speed;
    if (e.slowUntil > B.time) speed *= (1 - e.slow);
    if (e.faction === 'ally') speed *= (1 + allyBuffMods('moveSpd') + auraBonus(e, 'moveSpd'));

    if (!tgt) {
      e.x += dir * speed * dt;
    } else {
      const d = dist(e, tgt);
      const reach = e.range + tgt.size * 0.6;
      if (d > reach) {
        const step = Math.sign(tgt.x - e.x) || dir;
        e.x += step * speed * dt;
        e.facing = step;
        e.bob += dt * 10;
      } else {
        e.facing = Math.sign(tgt.x - e.x) || e.facing;
        e.atkTimer -= dt;
        if (e.atkTimer <= 0) {
          e.atkTimer = 1 / e.atkSpd;
          e.swing = 0.15;
          let dmg = e.dmg;
          if (e.faction === 'ally') {
            dmg *= (1 + allyBuffMods('dmg') + auraBonus(e, 'dmg'));
            if (rallyOn && dist(e, h) < 180) dmg *= 1.25;
          }
          if (e.heal) {
            /* 白魔道士不攻擊 */
          } else if (e.range > 90) {
            B.projectiles.push({
              x: e.x + e.facing * 12, z: e.z, y: -e.size, vx: 0, vz: 0, homing: tgt,
              speed: 280, dmg, src: e, splash: e.splash, faction: e.faction,
              pierce: 0, hits: [], size: e.splash ? 6 : 4,
              color: e.color, life: 2.5
            });
          } else {
            dealDamage(e, tgt, dmg, { noCrit: true });
          }
        }
      }
    }
    if (e.swing > 0) e.swing -= dt;
    if (e.leashX != null && e.x < e.leashX) e.x = e.leashX;
    // 路障：已經在它右邊的敵人過不去；本來就在左邊的不受影響
    if (e.faction === 'enemy' && B.blockX != null && e.x >= B.blockX + 20) {
      e.x = Math.max(e.x, B.blockX + 24);
    }

    /* 頭目技能 */
    if (e.isBoss) {
      e.castTimer -= dt;
      if (e.castTimer <= 0) {
        e.castTimer = 7;
        const cx = h.x;
        const btok = B.token;
        B.effects.push({ type: 'telegraph', x: cx, z: 0, r: 130, t: 0, dur: 0.9, color: '#D1584A' });
        setTimeout(() => {
          if (B.token !== btok || B.over || e.dead) return;
          B.effects.push({ type: 'ring', x: cx, z: 0, r: 0, max: 130, t: 0, dur: 0.4, color: '#D1584A' });
          B.shake = 12;
          B.entities.forEach(o => {
            if (o.faction === 'ally' && !o.dead && Math.abs(o.x - cx) < 130) dealDamage(e, o, e.dmg * 1.8, { noCrit: true });
          });
        }, 900);
      }
    }
  }

  /* 投射物 */
  for (const p of B.projectiles) {
    if (p.dead) continue;
    if (p.homing) {
      if (p.homing.dead) { p.dead = true; continue; }
      const dx = p.homing.x - p.x, dz = (p.homing.z || 0) - p.z, dy = (-p.homing.size) - p.y;
      const len = Math.hypot(dx, dz, dy) || 1;
      p.x += dx / len * p.speed * dt;
      p.z += dz / len * p.speed * dt;
      p.y += dy / len * p.speed * dt;
      if (len < 14) {
        dealDamage(p.src || null, p.homing, p.dmg, { noCrit: true });
        if (p.splash) {
          B.effects.push({ type: 'ring', x: p.x, z: p.z, r: 0, max: p.splash, t: 0, dur: 0.25, color: p.color });
          for (const o of B.entities) {
            if (o === p.homing || o.dead || o.invuln || o.isStructure || o.faction === p.faction) continue;
            if (dist(p, o) < p.splash) dealDamage(p.src || null, o, p.dmg * 0.6, { noCrit: true });
          }
        }
        p.dead = true;
      }
    } else {
      p.x += p.vx * dt;
      p.z += p.vz * dt;
    }
    p.life -= dt;
    if (p.life <= 0) { p.dead = true; continue; }
    if (!p.homing) {
      for (const o of B.entities) {
        if (o.dead || o.invuln || o.faction === p.faction) continue;
        if (p.hits.indexOf(o.id) >= 0) continue;
        if (dist(p, o) < o.size + p.size + 4) {
          p.hits.push(o.id);
          dealDamage(p.src || (p.faction === 'ally' ? h : null), o, p.dmg, { isSkill: !!p.isSkill });
          if (p.pierce > 0) p.pierce--; else { p.dead = true; break; }
        }
      }
    }
  }
  B.projectiles = B.projectiles.filter(p => !p.dead);

  /* 特效 / 文字 / 粒子 */
  B.effects.forEach(f => f.t += dt);
  B.effects = B.effects.filter(f => f.t < f.dur);
  B.texts.forEach(t => { t.t += dt; t.dy -= 42 * dt; t.x += t.vx * dt; });
  B.texts = B.texts.filter(t => t.t < t.dur);
  B.particles.forEach(p => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 620 * dt; p.z += p.vz * dt; });
  B.particles = B.particles.filter(p => p.t < p.dur && p.y < 30);

  B.entities = B.entities.filter(e => !e.dead || e === h);
  if (h.dead) { /* 英雄保留在陣列裡以便重生 */ }

  /* 攝影機 */
  const targetCam = Math.max(0, Math.min(B.stage.length - VIEW_W + 140, h.x - VIEW_W * 0.42));
  B.camX += (targetCam - B.camX) * Math.min(1, dt * 6);
};

B.GROUND_Y = GROUND_Y;
B.VIEW_W = VIEW_W;
B.VIEW_H = VIEW_H;
B.ALLY_UNITS = ALLY_UNITS;
