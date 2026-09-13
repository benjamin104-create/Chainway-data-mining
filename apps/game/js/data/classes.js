/* 職業與技能樹
 * 技能樹節點座標直接寫死，對應 SVG viewBox "0 0 820 560"。
 * 五個階層 x = 80 / 240 / 400 / 560 / 720
 * req 為「任一前置已點即可」（OR）。
 *
 * mods 可用欄位：
 *   hp dmg atkSpd range moveSpd crit critDmg armor cdr power
 *   lifesteal minionDmg minionHp goldFind siege(對塔傷害)
 * 均為加法百分比（0.15 = +15%），hp/dmg/armor 另有 flat 版本 hpFlat/dmgFlat/armorFlat
 *
 * flags：cleave 擴散 / burn 灼燒 / execute 斬殺 / thorns 反傷 / rally 小兵光環
 */
window.G = window.G || {};

const TX = [80, 240, 400, 560, 720];
const P = (t, y) => ({ x: TX[t], y });

G.CLASSES = [
  /* ══════════════ 掘徑者 ══════════════ */
  {
    id: 'delver',
    name: '掘徑者',
    en: 'Delver',
    tagline: '把牆當成門的那種人',
    color: '#E07A3F',
    color2: '#8E4A20',
    unlock: null,
    desc: '近戰推進型。血厚、站得住、對建築物傷害最高。' +
          '他不擅長閃躲，他擅長讓對方先撐不住。',
    base: { hp: 320, dmg: 17, atkSpd: 1.15, range: 34, moveSpd: 106, crit: 0.05, critDmg: 1.6, armor: 6, cdr: 0, power: 1 },
    nodes: [
      { id: 'd0', name: '掘進', type: 'active', tier: 0, cost: 0, pos: P(0, 280), req: [],
        icon: 'slash', desc: '向前劈出一道土石弧。命中的第一個目標額外受到擊退。',
        skill: { id: 's_cleave', name: '破土斬', cd: 4.5, type: 'arc', radius: 78, angle: 110, mult: 1.9, knock: 26 } },

      { id: 'd1a', name: '厚繭', type: 'passive', tier: 1, cost: 1, pos: P(1, 170), req: ['d0'],
        icon: 'shield', desc: '生命上限 +14%，護甲 +5。', mods: { hp: 0.14, armorFlat: 5 } },
      { id: 'd1b', name: '短柄', type: 'passive', tier: 1, cost: 1, pos: P(1, 390), req: ['d0'],
        icon: 'speed', desc: '攻擊速度 +12%，移動速度 +6%。', mods: { atkSpd: 0.12, moveSpd: 0.06 } },

      { id: 'd2a', name: '震地', type: 'active', tier: 2, cost: 2, pos: P(2, 100), req: ['d1a'],
        icon: 'quake', desc: '重擊地面，範圍內所有敵人受傷並被減速 2 秒。',
        skill: { id: 's_quake', name: '震地', cd: 9, type: 'ground', radius: 110, mult: 2.2, slow: 0.45, slowDur: 2 } },
      { id: 'd2b', name: '順勢', type: 'passive', tier: 2, cost: 2, pos: P(2, 280), req: ['d1a', 'd1b'],
        icon: 'cleave', desc: '普通攻擊會擴散到身後 45 單位內的第二個目標（60% 傷害）。', flags: ['cleave'] },
      { id: 'd2c', name: '攻城錘', type: 'passive', tier: 2, cost: 2, pos: P(2, 460), req: ['d1b'],
        icon: 'tower', desc: '對塔與城門的傷害 +45%。', mods: { siege: 0.45 } },

      { id: 'd3a', name: '不退', type: 'passive', tier: 3, cost: 2, pos: P(3, 120), req: ['d2a'],
        icon: 'anchor', desc: '生命低於 35% 時，護甲 +12、吸血 +10%。', mods: { armorFlat: 6 }, flags: ['lastStand'] },
      { id: 'd3b', name: '怒吼', type: 'active', tier: 3, cost: 2, pos: P(3, 240), req: ['d2a', 'd2b'],
        icon: 'roar', desc: '8 秒內自身傷害 +40%，友軍小兵傷害 +25%。',
        skill: { id: 's_roar', name: '攻城怒吼', cd: 18, type: 'buff', dur: 8, mods: { dmg: 0.4 }, allyMods: { dmg: 0.25 } } },
      { id: 'd3c', name: '裂石', type: 'passive', tier: 3, cost: 2, pos: P(3, 360), req: ['d2b', 'd2c'],
        icon: 'crit', desc: '暴擊率 +10%，暴擊傷害 +35%。', mods: { crit: 0.10, critDmg: 0.35 } },
      { id: 'd3d', name: '硬皮', type: 'passive', tier: 3, cost: 2, pos: P(3, 480), req: ['d2c'],
        icon: 'thorns', desc: '受到近戰攻擊時反彈 25% 傷害。', flags: ['thorns'] },

      { id: 'd4a', name: '地心迴旋', type: 'active', tier: 4, cost: 3, pos: P(4, 170), req: ['d3a', 'd3b'],
        icon: 'spin', desc: '原地旋轉 2.5 秒，期間每 0.3 秒對周圍造成傷害，移動速度 +30%。',
        skill: { id: 's_spin', name: '地心迴旋', cd: 22, type: 'channel', radius: 95, tick: 0.3, dur: 2.5, mult: 0.55, moveBonus: 0.3 } },
      { id: 'd4b', name: '一錘定音', type: 'passive', tier: 4, cost: 3, pos: P(4, 300), req: ['d3b', 'd3c'],
        icon: 'execute', desc: '對生命低於 25% 的敵人傷害 +80%。', flags: ['execute'] },
      { id: 'd4c', name: '通道', type: 'passive', tier: 4, cost: 3, pos: P(4, 430), req: ['d3c', 'd3d'],
        icon: 'gate', desc: '摧毀一座塔後，立即回復 30% 生命並重置一個技能冷卻。', flags: ['breach'] }
    ]
  },

  /* ══════════════ 石語者 ══════════════ */
  {
    id: 'stonespeaker',
    name: '石語者',
    en: 'Stonespeaker',
    tagline: '石頭會回答，只要你問對問題',
    color: '#4E7ECF',
    color2: '#22407A',
    unlock: { stage: 'babel-3', text: '通關 巴別之塔 · 核心' },
    desc: '遠程法術型。清場能力最強，單體最弱。' +
          '打法是把敵人的推進整片抹掉，而不是一個一個殺。',
    base: { hp: 230, dmg: 13, atkSpd: 0.95, range: 168, moveSpd: 100, crit: 0.04, critDmg: 1.5, armor: 2, cdr: 0.08, power: 1.25 },
    nodes: [
      { id: 'p0', name: '碎石', type: 'active', tier: 0, cost: 0, pos: P(0, 280), req: [],
        icon: 'shard', desc: '射出三枚石片，扇形散開。',
        skill: { id: 's_shard', name: '碎石彈', cd: 3.5, type: 'proj', count: 3, spread: 14, speed: 340, mult: 0.85, size: 5, color: '#9FC2F0' } },

      { id: 'p1a', name: '長頌', type: 'passive', tier: 1, cost: 1, pos: P(1, 170), req: ['p0'],
        icon: 'range', desc: '攻擊距離 +22%，技能傷害 +10%。', mods: { range: 0.22, power: 0.10 } },
      { id: 'p1b', name: '短頌', type: 'passive', tier: 1, cost: 1, pos: P(1, 390), req: ['p0'],
        icon: 'cdr', desc: '冷卻縮減 +12%。', mods: { cdr: 0.12 } },

      { id: 'p2a', name: '落石', type: 'active', tier: 2, cost: 2, pos: P(2, 100), req: ['p1a'],
        icon: 'quake', desc: '在前方落下巨石，延遲 0.6 秒後造成大範圍傷害。',
        skill: { id: 's_rockfall', name: '落石', cd: 10, type: 'ground', radius: 125, offset: 170, delay: 0.6, mult: 2.8 } },
      { id: 'p2b', name: '石膚', type: 'passive', tier: 2, cost: 2, pos: P(2, 280), req: ['p1a', 'p1b'],
        icon: 'shield', desc: '生命上限 +18%，護甲 +6。', mods: { hp: 0.18, armorFlat: 6 } },
      { id: 'p2c', name: '熱脈', type: 'passive', tier: 2, cost: 2, pos: P(2, 460), req: ['p1b'],
        icon: 'burn', desc: '技能命中會附加灼燒：4 秒內造成 40% 技能傷害。', flags: ['burn'] },

      { id: 'p3a', name: '石壁', type: 'active', tier: 3, cost: 2, pos: P(3, 120), req: ['p2a'],
        icon: 'wall', desc: '召出一道石壁，擋住敵人推進 6 秒，並吸收自身所受傷害。',
        skill: { id: 's_wall', name: '石壁', cd: 20, type: 'wall', hpMult: 4, dur: 6, shieldMult: 1.2 } },
      { id: 'p3b', name: '共鳴', type: 'passive', tier: 3, cost: 2, pos: P(3, 240), req: ['p2a', 'p2b'],
        icon: 'wave', desc: '技能傷害 +25%。', mods: { power: 0.25 } },
      { id: 'p3c', name: '層積', type: 'passive', tier: 3, cost: 2, pos: P(3, 360), req: ['p2b', 'p2c'],
        icon: 'stack', desc: '每次技能命中，接下來 5 秒內攻擊速度 +6%（最多 5 層）。', flags: ['resonance'] },
      { id: 'p3d', name: '地層記憶', type: 'passive', tier: 3, cost: 2, pos: P(3, 480), req: ['p2c'],
        icon: 'cdr', desc: '冷卻縮減 +15%，法術暴擊率 +8%。', mods: { cdr: 0.15, crit: 0.08 } },

      { id: 'p4a', name: '熔脈', type: 'active', tier: 4, cost: 3, pos: P(4, 170), req: ['p3a', 'p3b'],
        icon: 'beam', desc: '射出一道貫穿光束，穿透路徑上所有敵人與建築。',
        skill: { id: 's_beam', name: '熔脈', cd: 24, type: 'beam', len: 520, width: 26, mult: 4.2 } },
      { id: 'p4b', name: '眾石同聲', type: 'passive', tier: 4, cost: 3, pos: P(4, 300), req: ['p3b', 'p3c'],
        icon: 'echo', desc: '技能有 30% 機率立刻再觸發一次（傷害 50%）。', flags: ['echo'] },
      { id: 'p4c', name: '不動之基', type: 'passive', tier: 4, cost: 3, pos: P(4, 430), req: ['p3c', 'p3d'],
        icon: 'anchor', desc: '站著不動滿 1 秒後，傷害 +50%、受到傷害 −25%。', flags: ['rooted'] }
    ]
  },

  /* ══════════════ 縛影者 ══════════════ */
  {
    id: 'shadowbinder',
    name: '縛影者',
    en: 'Shadowbinder',
    tagline: '不與人對砍，只結束對砍',
    color: '#8E6BE0',
    color2: '#4A3580',
    unlock: { stage: 'nazca-3', text: '通關 納斯卡地紋 · 核心' },
    desc: '刺客型。血少、位移多、暴擊爆發極高。' +
          '適合繞過小兵直接處理後排與塔，但一被圍住就很難走。',
    base: { hp: 215, dmg: 20, atkSpd: 1.35, range: 32, moveSpd: 126, crit: 0.14, critDmg: 1.75, armor: 3, cdr: 0.05, power: 1.1 },
    nodes: [
      { id: 'h0', name: '影襲', type: 'active', tier: 0, cost: 0, pos: P(0, 280), req: [],
        icon: 'dash', desc: '向前突進，穿過的敵人受到傷害，過程中不受傷害。',
        skill: { id: 's_blink', name: '影襲', cd: 5, type: 'dash', dist: 190, mult: 1.7, invuln: true } },

      { id: 'h1a', name: '銳角', type: 'passive', tier: 1, cost: 1, pos: P(1, 170), req: ['h0'],
        icon: 'crit', desc: '暴擊率 +10%。', mods: { crit: 0.10 } },
      { id: 'h1b', name: '無聲', type: 'passive', tier: 1, cost: 1, pos: P(1, 390), req: ['h0'],
        icon: 'speed', desc: '移動速度 +12%，攻擊速度 +8%。', mods: { moveSpd: 0.12, atkSpd: 0.08 } },

      { id: 'h2a', name: '背刺印', type: 'passive', tier: 2, cost: 2, pos: P(2, 100), req: ['h1a'],
        icon: 'mark', desc: '從敵人背後攻擊時必定暴擊。', flags: ['backstab'] },
      { id: 'h2b', name: '飲影', type: 'passive', tier: 2, cost: 2, pos: P(2, 280), req: ['h1a', 'h1b'],
        icon: 'life', desc: '吸血 +12%，生命上限 +10%。', mods: { lifesteal: 0.12, hp: 0.10 } },
      { id: 'h2c', name: '影刃', type: 'active', tier: 2, cost: 2, pos: P(2, 460), req: ['h1b'],
        icon: 'shard', desc: '擲出五道影刃，可貫穿目標。',
        skill: { id: 's_blades', name: '影刃', cd: 8, type: 'proj', count: 5, spread: 9, speed: 420, mult: 0.95, pierce: 3, size: 4, color: '#C4AEF5' } },

      { id: 'h3a', name: '連段', type: 'passive', tier: 3, cost: 2, pos: P(3, 120), req: ['h2a'],
        icon: 'combo', desc: '每次暴擊使所有技能冷卻減少 0.6 秒。', flags: ['combo'] },
      { id: 'h3b', name: '分身', type: 'active', tier: 3, cost: 2, pos: P(3, 240), req: ['h2a', 'h2b'],
        icon: 'summon', desc: '召出兩個影分身，持續 10 秒，各自作戰。',
        skill: { id: 's_clone', name: '影分身', cd: 22, type: 'summon', count: 2, dur: 10, unit: 'clone' } },
      { id: 'h3c', name: '致命', type: 'passive', tier: 3, cost: 2, pos: P(3, 360), req: ['h2b', 'h2c'],
        icon: 'crit', desc: '暴擊傷害 +55%。', mods: { critDmg: 0.55 } },
      { id: 'h3d', name: '脫身', type: 'passive', tier: 3, cost: 2, pos: P(3, 480), req: ['h2c'],
        icon: 'dash', desc: '影襲改為兩段蓄能，冷卻縮減 +14%。', mods: { cdr: 0.14 }, flags: ['doubleDash'] },

      { id: 'h4a', name: '斷句', type: 'passive', tier: 4, cost: 3, pos: P(4, 170), req: ['h3a', 'h3b'],
        icon: 'execute', desc: '擊殺敵人時，重置影襲冷卻並回復 8% 生命。', flags: ['resetOnKill'] },
      { id: 'h4b', name: '影之潮', type: 'active', tier: 4, cost: 3, pos: P(4, 300), req: ['h3b', 'h3c'],
        icon: 'spin', desc: '3 秒內每 0.25 秒瞬移到最近的敵人身上並攻擊。',
        skill: { id: 's_tide', name: '影之潮', cd: 26, type: 'blinkstorm', dur: 3, tick: 0.25, mult: 0.8, reach: 260 } },
      { id: 'h4c', name: '兩個北方', type: 'passive', tier: 4, cost: 3, pos: P(4, 430), req: ['h3c', 'h3d'],
        icon: 'echo', desc: '暴擊時額外造成一次 45% 傷害的追擊。', flags: ['echoCrit'] }
    ]
  },

  /* ══════════════ 燈守 ══════════════ */
  {
    id: 'lampwarden',
    name: '燈守',
    en: 'Lampwarden',
    tagline: '自己不推，但讓整條線都往前',
    color: '#E0B23C',
    color2: '#8A6A1E',
    unlock: { stage: 'atlantis-3', text: '通關 亞特蘭提斯 · 核心' },
    desc: '召喚支援型。本體傷害最低，但小兵是所有職業裡最強的。' +
          '玩法是經營整條推進線，而不是自己站在最前面。',
    base: { hp: 275, dmg: 15, atkSpd: 1.0, range: 120, moveSpd: 104, crit: 0.05, critDmg: 1.5, armor: 5, cdr: 0.1, power: 1.05 },
    nodes: [
      { id: 'l0', name: '點燈', type: 'active', tier: 0, cost: 0, pos: P(0, 280), req: [],
        icon: 'summon', desc: '點燃一盞燈，召出兩名燈兵為你作戰。',
        skill: { id: 's_light', name: '點燈', cd: 8, type: 'summon', count: 2, dur: 20, unit: 'lamp' } },

      { id: 'l1a', name: '油足', type: 'passive', tier: 1, cost: 1, pos: P(1, 170), req: ['l0'],
        icon: 'life', desc: '所有友軍小兵生命 +25%。', mods: { minionHp: 0.25 } },
      { id: 'l1b', name: '芯亮', type: 'passive', tier: 1, cost: 1, pos: P(1, 390), req: ['l0'],
        icon: 'flame', desc: '所有友軍小兵傷害 +20%。', mods: { minionDmg: 0.20 } },

      { id: 'l2a', name: '提燈', type: 'active', tier: 2, cost: 2, pos: P(2, 100), req: ['l1a'],
        icon: 'heal', desc: '回復自身與周圍友軍的生命。',
        skill: { id: 's_heal', name: '提燈', cd: 12, type: 'heal', radius: 150, amount: 0.28, allies: true } },
      { id: 'l2b', name: '守夜', type: 'passive', tier: 2, cost: 2, pos: P(2, 280), req: ['l1a', 'l1b'],
        icon: 'shield', desc: '生命上限 +20%，護甲 +8。', mods: { hp: 0.20, armorFlat: 8 } },
      { id: 'l2c', name: '照明彈', type: 'active', tier: 2, cost: 2, pos: P(2, 460), req: ['l1b'],
        icon: 'flare', desc: '照亮一片區域：敵人減速 50%、受到傷害 +20%，持續 5 秒。',
        skill: { id: 's_flare', name: '照明彈', cd: 14, type: 'ground', radius: 140, offset: 180, mult: 0.8, slow: 0.5, slowDur: 5, vuln: 0.2 } },

      { id: 'l3a', name: '長明', type: 'passive', tier: 3, cost: 2, pos: P(3, 120), req: ['l2a'],
        icon: 'clock', desc: '召喚物持續時間 +60%，冷卻縮減 +10%。', mods: { cdr: 0.10 }, flags: ['longburn'] },
      { id: 'l3b', name: '列燈', type: 'active', tier: 3, cost: 2, pos: P(3, 240), req: ['l2a', 'l2b'],
        icon: 'roar', desc: '10 秒內全體友軍傷害 +35%、移動速度 +20%。',
        skill: { id: 's_rally', name: '列燈陣', cd: 24, type: 'buff', dur: 10, mods: { dmg: 0.15 }, allyMods: { dmg: 0.35, moveSpd: 0.20 } } },
      { id: 'l3c', name: '同溫', type: 'passive', tier: 3, cost: 2, pos: P(3, 360), req: ['l2b', 'l2c'],
        icon: 'rally', desc: '小兵在你身邊 180 單位內時，傷害再 +25%。', flags: ['rally'] },
      { id: 'l3d', name: '餘燼', type: 'passive', tier: 3, cost: 2, pos: P(3, 480), req: ['l2c'],
        icon: 'burn', desc: '友軍小兵死亡時爆炸，對周圍造成傷害。', flags: ['ember'] },

      { id: 'l4a', name: '燈塔', type: 'active', tier: 4, cost: 3, pos: P(4, 170), req: ['l3a', 'l3b'],
        icon: 'tower', desc: '架設一座友方砲塔，持續 18 秒，射程與傷害都很高。',
        skill: { id: 's_beacon', name: '燈塔', cd: 28, type: 'turret', dur: 18, dmgMult: 1.6, range: 230 } },
      { id: 'l4b', name: '不滅', type: 'passive', tier: 4, cost: 3, pos: P(4, 300), req: ['l3b', 'l3c'],
        icon: 'life', desc: '友軍小兵每 3 秒回復 6% 生命；你的每次攻擊也治療最近的小兵。', flags: ['regen'] },
      { id: 'l4c', name: '整條線', type: 'passive', tier: 4, cost: 3, pos: P(4, 430), req: ['l3c', 'l3d'],
        icon: 'gate', desc: '每波小兵多出兩名，且己方城門射速 +50%。', flags: ['bigwave'] }
    ]
  }
];

G.getClass = id => G.CLASSES.find(c => c.id === id);
G.getNode = (classId, nodeId) => {
  const c = G.getClass(classId);
  return c && c.nodes.find(n => n.id === nodeId);
};
/* 所有主動技能索引 */
G.allSkills = () => {
  const out = {};
  G.CLASSES.forEach(c => c.nodes.forEach(n => { if (n.skill) out[n.skill.id] = { ...n.skill, classId: c.id, nodeId: n.id, icon: n.icon }; }));
  return out;
};
G.SKILLS = G.allSkills();
