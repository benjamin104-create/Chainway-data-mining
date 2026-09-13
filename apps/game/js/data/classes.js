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
        icon: 'gate', desc: '摧毀一座塔後，回復 12% 生命並重置一個技能冷卻。', flags: ['breach'] }
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
    unlock: { stage: 'atlantis-3', text: '通關 亞特蘭提斯' },
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
    unlock: { stage: 'troy-3', text: '通關 特洛伊' },
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
        icon: 'execute', desc: '擊殺敵人時，重置影襲冷卻並回復 3% 生命。', flags: ['resetOnKill'] },
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
    unlock: { stage: 'cyclops-3', text: '通關 獨眼巨人之島' },
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

      { id: 'l2a', name: '潑油', type: 'active', tier: 2, cost: 2, pos: P(2, 100), req: ['l1a'],
        icon: 'burn', desc: '擲出一罐火油，範圍內的敵人受傷並持續灼燒 4 秒。',
        skill: { id: 's_oil', name: '火油彈', cd: 11, type: 'ground', radius: 120, offset: 150, mult: 2.0, dot: 1.2 } },
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
  },

  /* ══════════════ 神諭祭司 ══════════════ */
  {
    id: 'oracle',
    name: '神諭祭司',
    en: 'Oracle',
    tagline: '她說不要扶，於是八百年沒有人扶',
    color: '#EFE7D4',
    color2: '#C8503E',
    unlock: { stage: 'knossos-3', text: '通關 克諾索斯 · 迷宮' },
    desc: '白袍那一路。魔防最高、藥草吃得最好，還能給自己護盾。' +
          '她打得慢，但她是唯一能站著挨完魔王一整套技能的人。',
    base: { hp: 300, dmg: 14, atkSpd: 1.0, range: 150, moveSpd: 104, crit: 0.05, critDmg: 1.55, armor: 5, cdr: 0.06, power: 1.1 },
    nodes: [
      { id: 'o0', name: '禱詞', type: 'active', tier: 0, cost: 0, pos: P(0, 280), req: [],
        icon: 'mark', desc: '一道光柱落在前方，穿透路上的敵人。',
        skill: { id: 's_pillar', name: '神諭光柱', cd: 5, type: 'beam', len: 300, width: 30, mult: 1.7 } },

      { id: 'o1a', name: '素袍', type: 'passive', tier: 1, cost: 1, pos: P(1, 170), req: ['o0'],
        icon: 'shield', desc: '魔防 +18%，生命上限 +10%。', mods: { mdef: 0.18, hp: 0.10 } },
      { id: 'o1b', name: '採藥', type: 'passive', tier: 1, cost: 1, pos: P(1, 390), req: ['o0'],
        icon: 'heal', desc: '藥草回復效果 +35%，冷卻縮減 +6%。', mods: { herb: 0.35, cdr: 0.06 } },

      { id: 'o2a', name: '結界', type: 'active', tier: 2, cost: 2, pos: P(2, 100), req: ['o1a'],
        icon: 'shield', desc: '給自己一層護盾，吸收傷害，持續 8 秒。',
        skill: { id: 's_ward', name: '祈願結界', cd: 14, type: 'shield', mult: 2.6, dur: 8 } },
      { id: 'o2b', name: '靜心', type: 'passive', tier: 2, cost: 2, pos: P(2, 280), req: ['o1a', 'o1b'],
        icon: 'anchor', desc: '站著不動滿 1 秒後，受到的傷害 −25%。', flags: ['rooted'] },
      { id: 'o2c', name: '長頌', type: 'passive', tier: 2, cost: 2, pos: P(2, 460), req: ['o1b'],
        icon: 'range', desc: '射程 +20%，技能傷害 +15%。', mods: { range: 0.20, power: 0.15 } },

      { id: 'o3a', name: '不壞', type: 'passive', tier: 3, cost: 2, pos: P(3, 120), req: ['o2a'],
        icon: 'thorns', desc: '魔防 +20%，護甲 +8。', mods: { mdef: 0.20, armorFlat: 8 } },
      { id: 'o3b', name: '祝福', type: 'active', tier: 3, cost: 2, pos: P(3, 240), req: ['o2a', 'o2b'],
        icon: 'rally', desc: '10 秒內自身與友軍小兵傷害 +30%，你自己再 +15% 移速。',
        skill: { id: 's_bless', name: '神諭祝福', cd: 22, type: 'buff', dur: 10, mods: { dmg: 0.30, moveSpd: 0.15 }, allyMods: { dmg: 0.30 } } },
      { id: 'o3c', name: '迴響', type: 'passive', tier: 3, cost: 2, pos: P(3, 360), req: ['o2b', 'o2c'],
        icon: 'echo', desc: '冷卻縮減 +12%，技能傷害 +18%。', mods: { cdr: 0.12, power: 0.18 } },
      { id: 'o3d', name: '石籤', type: 'passive', tier: 3, cost: 2, pos: P(3, 480), req: ['o2c'],
        icon: 'crit', desc: '暴擊率 +8%，暴擊傷害 +30%。', mods: { crit: 0.08, critDmg: 0.30 } },

      { id: 'o4a', name: '神殿之光', type: 'active', tier: 4, cost: 3, pos: P(4, 170), req: ['o3a', 'o3b'],
        icon: 'quake', desc: '以自身為中心降下大範圍的光，重創所有敵人。',
        skill: { id: 's_sanctum', name: '神殿之光', cd: 26, type: 'ground', radius: 210, mult: 3.6, slow: 0.35, slowDur: 2.5 } },
      { id: 'o4b', name: '不要扶', type: 'passive', tier: 4, cost: 3, pos: P(4, 300), req: ['o3b', 'o3c'],
        icon: 'life', desc: '魔防 +18%，生命低於 35% 時護甲與吸血大幅提升。',
        mods: { mdef: 0.18 }, flags: ['lastStand'] },
      { id: 'o4c', name: '聽得見', type: 'passive', tier: 4, cost: 3, pos: P(4, 430), req: ['o3c', 'o3d'],
        icon: 'mark', desc: '技能傷害 +30%，冷卻縮減 +10%，藥草效果 +25%。',
        mods: { power: 0.30, cdr: 0.10, herb: 0.25 } }
    ]
  },

  /* ══════════════ 角鬥士 ══════════════ */
  {
    id: 'gladiator',
    name: '角鬥士',
    en: 'Gladiator',
    tagline: '贏的人戴桂冠，輸的人也曾經戴過',
    color: '#E0662A',
    color2: '#7FBF6A',
    unlock: { stage: 'amazon-3', text: '通關 泰美斯基拉' },
    desc: '快、脆、暴擊高。他不擋，他讓對方沒有第二下。' +
          '吸血是他唯一的回復手段——這一版沒有別的。',
    base: { hp: 290, dmg: 21, atkSpd: 1.45, range: 36, moveSpd: 122, crit: 0.12, critDmg: 1.75, armor: 4, cdr: 0.04, power: 1 },
    nodes: [
      { id: 'g0', name: '開場', type: 'active', tier: 0, cost: 0, pos: P(0, 280), req: [],
        icon: 'spin', desc: '向前突進並劈砍，命中就回一點血。',
        skill: { id: 's_lunge', name: '搶拍', cd: 4, type: 'dash', dist: 130, mult: 2.0 } },

      { id: 'g1a', name: '空手', type: 'passive', tier: 1, cost: 1, pos: P(1, 170), req: ['g0'],
        icon: 'speed', desc: '攻擊速度 +16%，移動速度 +8%。', mods: { atkSpd: 0.16, moveSpd: 0.08 } },
      { id: 'g1b', name: '見血', type: 'passive', tier: 1, cost: 1, pos: P(1, 390), req: ['g0'],
        icon: 'crit', desc: '暴擊率 +8%，吸血 +5%。', mods: { crit: 0.08, lifesteal: 0.05 } },

      { id: 'g2a', name: '連擊', type: 'passive', tier: 2, cost: 2, pos: P(2, 100), req: ['g1a'],
        icon: 'cleave', desc: '普通攻擊擴散到身後的第二個目標（60% 傷害）。', flags: ['cleave'] },
      { id: 'g2b', name: '背刺', type: 'passive', tier: 2, cost: 2, pos: P(2, 280), req: ['g1a', 'g1b'],
        icon: 'slash', desc: '攻擊背對你的敵人必定暴擊。', flags: ['backstab'] },
      { id: 'g2c', name: '斬殺', type: 'passive', tier: 2, cost: 2, pos: P(2, 460), req: ['g1b'],
        icon: 'execute', desc: '對生命低於 25% 的敵人傷害 +80%。', flags: ['execute'] },

      { id: 'g3a', name: '旋身', type: 'active', tier: 3, cost: 2, pos: P(3, 120), req: ['g2a'],
        icon: 'spin', desc: '原地旋轉 2 秒，期間持續傷害周圍並加速。',
        skill: { id: 's_whirl', name: '旋身', cd: 18, type: 'channel', radius: 88, tick: 0.25, dur: 2, mult: 0.6, moveBonus: 0.35 } },
      { id: 'g3b', name: '追擊', type: 'passive', tier: 3, cost: 2, pos: P(3, 240), req: ['g2a', 'g2b'],
        icon: 'combo', desc: '暴擊時所有技能冷卻各減 0.6 秒。', flags: ['combo'] },
      { id: 'g3c', name: '嗜血', type: 'passive', tier: 3, cost: 2, pos: P(3, 360), req: ['g2b', 'g2c'],
        icon: 'life', desc: '吸血 +10%，暴擊傷害 +30%。', mods: { lifesteal: 0.10, critDmg: 0.30 } },
      { id: 'g3d', name: '不設防', type: 'passive', tier: 3, cost: 2, pos: P(3, 480), req: ['g2c'],
        icon: 'burn', desc: '傷害 +25%，但護甲 −4。', mods: { dmg: 0.25, armorFlat: -4 } },

      { id: 'g4a', name: '一對多', type: 'active', tier: 4, cost: 3, pos: P(4, 170), req: ['g3a', 'g3b'],
        icon: 'roar', desc: '8 秒內攻速 +60%、吸血 +15%。',
        skill: { id: 's_arena', name: '競技場', cd: 24, type: 'buff', dur: 8, mods: { atkSpd: 0.6, lifesteal: 0.15 } } },
      { id: 'g4b', name: '致命', type: 'passive', tier: 4, cost: 3, pos: P(4, 300), req: ['g3b', 'g3c'],
        icon: 'crit', desc: '暴擊率 +14%，暴擊傷害 +55%。', mods: { crit: 0.14, critDmg: 0.55 } },
      { id: 'g4c', name: '桂冠', type: 'passive', tier: 4, cost: 3, pos: P(4, 430), req: ['g3c', 'g3d'],
        icon: 'echo', desc: '暴擊會再打出一次 45% 傷害的追擊。', flags: ['echoCrit'] }
    ]
  },

  /* ══════════════ 縛獸人 ══════════════ */
  {
    id: 'beastbinder',
    name: '縛獸人',
    en: 'Beastbinder',
    tagline: '牠們比牠好相處',
    color: '#8FB86A',
    color2: '#7A5C34',
    unlock: { stage: 'colossus-3', text: '通關 羅得島巨神像' },
    desc: '自己不強，但他帶的東西很強。小兵傷害與血量的加成全遊戲最高，' +
          '而且他能把敵人變成自己人。線推得動，塔就會倒。',
    base: { hp: 330, dmg: 15, atkSpd: 1.05, range: 120, moveSpd: 108, crit: 0.05, critDmg: 1.6, armor: 6, cdr: 0.05, power: 1 },
    nodes: [
      { id: 'b0', name: '哨音', type: 'active', tier: 0, cost: 0, pos: P(0, 280), req: [],
        icon: 'echo', desc: '一聲哨音震開周圍的敵人並造成傷害。',
        skill: { id: 's_whistle', name: '哨音', cd: 5, type: 'ground', radius: 120, mult: 1.5, slow: 0.3, slowDur: 1.5 } },

      { id: 'b1a', name: '同行', type: 'passive', tier: 1, cost: 1, pos: P(1, 170), req: ['b0'],
        icon: 'rally', desc: '友軍小兵傷害 +20%、生命 +20%。', mods: { minionDmg: 0.20, minionHp: 0.20 } },
      { id: 'b1b', name: '厚皮', type: 'passive', tier: 1, cost: 1, pos: P(1, 390), req: ['b0'],
        icon: 'shield', desc: '生命上限 +12%，護甲 +4，魔防 +10%。', mods: { hp: 0.12, armorFlat: 4, mdef: 0.10 } },

      { id: 'b2a', name: '群出', type: 'passive', tier: 2, cost: 2, pos: P(2, 100), req: ['b1a'],
        icon: 'gate', desc: '每一波小兵多出兩名。', flags: ['bigwave'] },
      { id: 'b2b', name: '領路', type: 'passive', tier: 2, cost: 2, pos: P(2, 280), req: ['b1a', 'b1b'],
        icon: 'rally', desc: '小兵在你身邊 180 單位內時傷害再 +25%。', flags: ['rally'] },
      { id: 'b2c', name: '餵食', type: 'passive', tier: 2, cost: 2, pos: P(2, 460), req: ['b1b'],
        icon: 'life', desc: '友軍小兵每 3 秒回復 6% 生命。', flags: ['regen'] },

      { id: 'b3a', name: '放獸', type: 'active', tier: 3, cost: 2, pos: P(3, 120), req: ['b2a'],
        icon: 'roar', desc: '立刻叫出一批小兵，站在你身邊往前推。',
        skill: { id: 's_unleash', name: '放獸', cd: 20, type: 'summon', count: 4, dur: 16, unit: 'beast' } },
      { id: 'b3b', name: '馴服', type: 'passive', tier: 3, cost: 2, pos: P(3, 240), req: ['b2a', 'b2b'],
        icon: 'mark', desc: '小兵傷害與生命再各 +25%。', mods: { minionDmg: 0.25, minionHp: 0.25 } },
      { id: 'b3c', name: '獸群', type: 'active', tier: 3, cost: 2, pos: P(3, 360), req: ['b2b', 'b2c'],
        icon: 'rally', desc: '12 秒內全體友軍傷害 +40%、移動速度 +25%。',
        skill: { id: 's_stampede', name: '獸潮', cd: 26, type: 'buff', dur: 12, mods: { dmg: 0.15 }, allyMods: { dmg: 0.40, moveSpd: 0.25 } } },
      { id: 'b3d', name: '骨哨', type: 'passive', tier: 3, cost: 2, pos: P(3, 480), req: ['b2c'],
        icon: 'burn', desc: '友軍小兵死亡時爆炸，對周圍造成傷害。', flags: ['ember'] },

      { id: 'b4a', name: '獸骨陣', type: 'active', tier: 4, cost: 3, pos: P(4, 170), req: ['b3a', 'b3b'],
        icon: 'tower', desc: '架設一座友方砲塔，持續 18 秒。',
        skill: { id: 's_bonepost', name: '獸骨樁', cd: 28, type: 'turret', dur: 18, dmgMult: 1.5, range: 215 } },
      { id: 'b4b', name: '整群過去', type: 'passive', tier: 4, cost: 3, pos: P(4, 300), req: ['b3b', 'b3c'],
        icon: 'gate', desc: '小兵傷害與生命再各 +35%，己方城門射速 +50%。',
        mods: { minionDmg: 0.35, minionHp: 0.35 }, flags: ['bigwave'] },
      { id: 'b4c', name: '牠們認得你', type: 'passive', tier: 4, cost: 3, pos: P(4, 430), req: ['b3c', 'b3d'],
        icon: 'thorns', desc: '魔防 +22%，護甲 +10，受近戰攻擊時反彈 25%。',
        mods: { mdef: 0.22, armorFlat: 10 }, flags: ['thorns'] }
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
