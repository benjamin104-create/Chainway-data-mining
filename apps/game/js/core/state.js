/* 存檔、玩家狀態、數值結算 */
window.G = window.G || {};

G.SAVE_KEY = 'siege_of_mysteries_v1';

/* 每個職業的起手技能免費送，不然新玩家第一場會沒有技能可以按 */
G.grantRoots = function (s) {
  G.CLASSES.forEach(c => {
    const root = c.nodes.find(n => n.tier === 0);
    const cs = s.classes[c.id];
    if (!root || !cs || cs.nodes.includes(root.id)) return;
    cs.nodes.push(root.id);
    if (root.skill && cs.bar.indexOf(root.skill.id) < 0) {
      const empty = cs.bar.indexOf(null);
      if (empty >= 0) cs.bar[empty] = root.skill.id;
    }
  });
  return s;
};

G.newSave = function () {
  const classes = {};
  G.CLASSES.forEach(c => {
    classes[c.id] = {
      spent: 0,
      nodes: [],
      bar: [null, null, null, null]
    };
  });
  return G.grantRoots({
    v: 1,
    gold: 200,
    sp: 1,
    level: 1,
    xp: 0,
    classId: 'delver',
    classes,
    gear: { ...G.DEFAULT_GEAR },
    owned: ['w_pick', 'a_cloth', 'r_none'],
    consumables: { c_potion: 0, c_charge: 0, c_herb: 0 },
    cleared: {},
    best: {},
    run: null,          // 進行中的遠征
    cv: 2,              // 內容版本，換世界觀時用來換算進度
    seenIntro: false
  });
};

G.load = function () {
  let raw = null;
  try { raw = localStorage.getItem(G.SAVE_KEY); } catch (e) { raw = null; }
  if (!raw) return G.newSave();
  try {
    const s = JSON.parse(raw);
    const fresh = G.newSave();
    const merged = Object.assign(fresh, s);
    // 補齊後來新增的職業
    G.CLASSES.forEach(c => {
      if (!merged.classes[c.id]) merged.classes[c.id] = { spent: 0, nodes: [], bar: [null, null, null, null] };
      const cc = merged.classes[c.id];
      if (!Array.isArray(cc.nodes)) cc.nodes = [];
      if (!Array.isArray(cc.bar) || cc.bar.length !== 4) cc.bar = [null, null, null, null];
    });
    merged.gear = Object.assign({ ...G.DEFAULT_GEAR }, merged.gear || {});
    merged.consumables = Object.assign({ c_potion: 0, c_charge: 0, c_herb: 0 }, merged.consumables || {});
    // 舊存檔的技能欄可能指向已經移除的技能
    G.CLASSES.forEach(c => {
      const cc = merged.classes[c.id];
      cc.bar = cc.bar.map(id => (id && G.SKILLS[id]) ? id : null);
    });
    migrateContent(merged);
    return G.grantRoots(merged);
  } catch (e) {
    return G.newSave();
  }
};

/* 世界觀換掉之後，舊的章節代號已經不存在。
   把「通關過幾章」等量換算到新章節，金幣、等級、技能點、裝備全部保留。 */
function migrateContent(save) {
  if (save.cv === G.CONTENT_VERSION) return;
  const done = G.OLD_CHAPTER_IDS.filter(id => save.cleared && save.cleared[id + '-3']).length;
  save.cleared = {};
  for (let i = 0; i < done && i < G.CHAPTERS.length; i++) {
    const id = G.CHAPTERS[i].id;
    save.cleared[id + '-1'] = true;
    save.cleared[id + '-2'] = true;
    save.cleared[id + '-3'] = true;
  }
  save.run = null;            // 進行到一半的遠征指向不存在的章節
  save.best = {};
  save.cv = G.CONTENT_VERSION;
}

G.save = function () {
  try { localStorage.setItem(G.SAVE_KEY, JSON.stringify(G.S)); } catch (e) { /* 隱私模式會失敗，忽略 */ }
};

G.S = null;

/* ── 等級 ── */
G.xpNeeded = lv => Math.round(120 * Math.pow(1.24, lv - 1));
G.addXp = function (amount) {
  const res = { levels: 0 };
  G.S.xp += amount;
  while (G.S.xp >= G.xpNeeded(G.S.level)) {
    G.S.xp -= G.xpNeeded(G.S.level);
    G.S.level++;
    res.levels++;
    if (G.S.level % 2 === 0) G.S.sp++;   // 每兩級一點技能點
  }
  return res;
};

/* ── 技能點 ── */
G.spAvailable = function (classId) {
  classId = classId || G.S.classId;
  return G.S.sp - (G.S.classes[classId].spent || 0);
};

G.canUnlock = function (classId, nodeId) {
  const cls = G.getClass(classId);
  const node = cls.nodes.find(n => n.id === nodeId);
  const cs = G.S.classes[classId];
  if (!node || cs.nodes.includes(nodeId)) return { ok: false, why: '已學習' };
  if (node.req.length && !node.req.some(r => cs.nodes.includes(r))) return { ok: false, why: '前置未學習' };
  if (G.spAvailable(classId) < node.cost) return { ok: false, why: '技能點不足' };
  return { ok: true };
};

G.unlockNode = function (classId, nodeId) {
  const chk = G.canUnlock(classId, nodeId);
  if (!chk.ok) return chk;
  const node = G.getNode(classId, nodeId);
  const cs = G.S.classes[classId];
  cs.nodes.push(nodeId);
  cs.spent += node.cost;
  // 主動技能：若技能欄有空位就自動放進去
  if (node.skill) {
    const empty = cs.bar.indexOf(null);
    if (empty >= 0) cs.bar[empty] = node.skill.id;
  }
  G.save();
  return { ok: true };
};

G.respec = function (classId) {
  const cs = G.S.classes[classId];
  cs.nodes = [];
  cs.spent = 0;
  cs.bar = [null, null, null, null];
  G.grantRoots(G.S);
  G.save();
};

/* ── 職業解鎖 ── */
G.classUnlocked = function (cls) {
  if (!cls.unlock) return true;
  return !!G.S.cleared[cls.unlock.stage];
};

/* ── 關卡解鎖 ── */
G.stageUnlocked = function (stage) {
  const i = G.STAGES.indexOf(stage);
  if (i <= 0) return true;
  return !!G.S.cleared[G.STAGES[i - 1].key];
};
G.chapterUnlocked = function (ci) {
  if (ci === 0) return true;
  const prev = G.CHAPTERS[ci - 1];
  return !!G.S.cleared[prev.id + '-3'];
};

/* ── 數值結算 ──
 * 回傳 { stats, flags:Set, skills:[skillDef|null ×4] }
 */
G.computeStats = function (classId) {
  classId = classId || G.S.classId;
  const cls = G.getClass(classId);
  const cs = G.S.classes[classId];
  const lv = G.S.level - 1;

  const add = { hp: 0, dmg: 0, atkSpd: 0, range: 0, moveSpd: 0, crit: 0, critDmg: 0, armor: 0,
                cdr: 0, power: 0, lifesteal: 0, minionDmg: 0, minionHp: 0, goldFind: 0, siege: 0 };
  const flat = { hpFlat: 0, dmgFlat: 0, armorFlat: 0 };
  const flags = new Set();

  const applyMods = m => {
    if (!m) return;
    for (const k in m) {
      if (k in add) add[k] += m[k];
      else if (k in flat) flat[k] += m[k];
    }
  };

  cs.nodes.forEach(id => {
    const n = cls.nodes.find(x => x.id === id);
    if (!n) return;
    applyMods(n.mods);
    (n.flags || []).forEach(f => flags.add(f));
  });

  ['weapon', 'armor', 'relic'].forEach(slot => {
    const it = G.getItem(G.S.gear[slot]);
    if (it) applyMods(it.mods);
  });

  // 這趟遠征路上撿到的加持
  if (G.runMods) applyMods(G.runMods());

  const b = cls.base;
  const stats = {
    hp:       Math.round((b.hp + lv * 22 + flat.hpFlat) * (1 + add.hp)),
    dmg:      (b.dmg + lv * 2.0 + flat.dmgFlat) * (1 + add.dmg),
    atkSpd:   b.atkSpd * (1 + add.atkSpd),
    range:    b.range * (1 + add.range),
    moveSpd:  b.moveSpd * (1 + add.moveSpd),
    crit:     Math.min(0.95, b.crit + add.crit),
    critDmg:  b.critDmg + add.critDmg,
    armor:    b.armor + lv * 0.6 + flat.armorFlat,
    cdr:      Math.min(0.6, b.cdr + add.cdr),
    power:    b.power + add.power,
    lifesteal: add.lifesteal,
    minionDmg: add.minionDmg,
    minionHp:  add.minionHp,
    goldFind:  add.goldFind,
    siege:     add.siege
  };

  const skills = cs.bar.map(id => (id ? G.SKILLS[id] : null));
  return { stats, flags, skills, cls };
};

/* 已學會的主動技能清單 */
G.unlockedActives = function (classId) {
  classId = classId || G.S.classId;
  const cls = G.getClass(classId);
  const cs = G.S.classes[classId];
  return cls.nodes.filter(n => n.skill && cs.nodes.includes(n.id)).map(n => ({ ...n.skill, icon: n.icon, nodeName: n.name, desc: n.desc }));
};

G.setBarSlot = function (slot, skillId) {
  const cs = G.S.classes[G.S.classId];
  // 同一個技能不能放兩格
  const dup = cs.bar.indexOf(skillId);
  if (skillId && dup >= 0 && dup !== slot) cs.bar[dup] = null;
  cs.bar[slot] = skillId;
  G.save();
};

G.fmtGold = n => n.toLocaleString('en-US');
