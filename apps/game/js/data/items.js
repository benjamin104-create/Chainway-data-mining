/* 商店：武器 / 防具 / 遺物
 * unlockAfter = 需要通關的關卡 key（null 代表一開始就有）
 * mods 欄位與技能樹相同。
 */
window.G = window.G || {};

G.ITEMS = [
  /* ── 武器 ── */
  { id: 'w_pick',    slot: 'weapon', name: '礦工鎬',       price: 0,    unlockAfter: null,
    mods: {}, flavor: '你帶進來的東西。它挖過石頭，還沒挖過別的。' },
  { id: 'w_brick',   slot: 'weapon', name: '燒磚短劍',     price: 180,  unlockAfter: null,
    mods: { dmgFlat: 6, atkSpd: 0.05 }, flavor: '巴別塔的磚，燒到玻璃化才夠硬。' },
  { id: 'w_copper',  slot: 'weapon', name: '銅鑿長刃',     price: 420,  unlockAfter: 'babel-2',
    mods: { dmgFlat: 12, crit: 0.05 }, flavor: '切石頭的工具，拿來切別的也不會抗議。' },
  { id: 'w_scepter', slot: 'weapon', name: '星門權杖',     price: 760,  unlockAfter: 'giza-2',
    mods: { dmgFlat: 10, power: 0.22, range: 0.1 }, flavor: '指向天空的時候會微微發熱。' },
  { id: 'w_line',    slot: 'weapon', name: '納斯卡量繩',   price: 1150, unlockAfter: 'nazca-2',
    mods: { dmgFlat: 16, atkSpd: 0.14, moveSpd: 0.05 }, flavor: '用它畫出的線，幾公里都不會歪。' },
  { id: 'w_trident', slot: 'weapon', name: '潮位三叉',     price: 1680, unlockAfter: 'atlantis-2',
    mods: { dmgFlat: 24, lifesteal: 0.08 }, flavor: '海沒有退，是城自己下去的。' },
  { id: 'w_moai',    slot: 'weapon', name: '摩艾拳',       price: 2400, unlockAfter: 'rapanui-2',
    mods: { dmgFlat: 34, siege: 0.35, atkSpd: -0.08 }, flavor: '十噸的石頭，靠左右搖晃就能走路。' },
  { id: 'w_compass', slot: 'weapon', name: '失準羅盤刃',   price: 3300, unlockAfter: 'bermuda-2',
    mods: { dmgFlat: 30, crit: 0.14, critDmg: 0.4 }, flavor: '它一直指著北方，只是不是你的那個北方。' },
  { id: 'w_solstice',slot: 'weapon', name: '至日之石',     price: 4800, unlockAfter: 'stonehenge-1',
    mods: { dmgFlat: 42, power: 0.3, cdr: 0.12 }, flavor: '一年對準兩次。對準的那一刻，什麼都擋不住。' },

  /* ── 防具 ── */
  { id: 'a_cloth',   slot: 'armor', name: '粗布工衣',      price: 0,    unlockAfter: null,
    mods: {}, flavor: '會弄髒，但至少是你自己的。' },
  { id: 'a_leather', slot: 'armor', name: '瀝青皮甲',      price: 160,  unlockAfter: null,
    mods: { hpFlat: 40, armorFlat: 4 }, flavor: '巴別塔用瀝青當黏著劑，拿來防身也還行。' },
  { id: 'a_scale',   slot: 'armor', name: '聖甲蟲鱗甲',    price: 500,  unlockAfter: 'babel-3',
    mods: { hpFlat: 70, armorFlat: 8, moveSpd: -0.03 }, flavor: '幾千片鱗，每一片都被單獨磨過。' },
  { id: 'a_feather', slot: 'armor', name: '禿鷲羽披',      price: 880,  unlockAfter: 'nazca-1',
    mods: { hpFlat: 55, moveSpd: 0.12, atkSpd: 0.06 }, flavor: '要離地夠高，才看得出地上畫了什麼。' },
  { id: 'a_coral',   slot: 'armor', name: '活珊瑚胸甲',    price: 1380, unlockAfter: 'atlantis-1',
    mods: { hpFlat: 120, armorFlat: 12, lifesteal: 0.05 }, flavor: '它還活著，會自己長回來。' },
  { id: 'a_basalt',  slot: 'armor', name: '玄武岩背板',    price: 2100, unlockAfter: 'rapanui-1',
    mods: { hpFlat: 190, armorFlat: 20, moveSpd: -0.06 }, flavor: '從採石場直接鑿下來的，沒有修邊。' },
  { id: 'a_static',  slot: 'armor', name: '靜電外衣',      price: 3000, unlockAfter: 'bermuda-1',
    mods: { hpFlat: 150, armorFlat: 14, cdr: 0.1 }, flavor: '穿著它，儀表板會開始說謊。' },
  { id: 'a_henge',   slot: 'armor', name: '環石聖衣',      price: 4400, unlockAfter: 'stonehenge-1',
    mods: { hpFlat: 260, armorFlat: 26, power: 0.15 }, flavor: '站在圈裡的人，太陽會替他計時。' },

  /* ── 遺物 ── */
  { id: 'r_none',    slot: 'relic', name: '空手',          price: 0,    unlockAfter: null,
    mods: {}, flavor: '什麼都沒帶，也是一種選擇。' },
  { id: 'r_tablet',  slot: 'relic', name: '泥板殘片',      price: 300,  unlockAfter: 'babel-1',
    mods: { goldFind: 0.2, cdr: 0.05 }, flavor: '上面的字沒人讀得懂，但數字看得懂。' },
  { id: 'r_ankh',    slot: 'relic', name: '安卡符',        price: 720,  unlockAfter: 'giza-3',
    mods: { hpFlat: 60, lifesteal: 0.07 }, flavor: '生命的符號，被畫在所有死人的牆上。' },
  { id: 'r_hummingbird', slot: 'relic', name: '蜂鳥線稿',  price: 1250, unlockAfter: 'nazca-3',
    mods: { moveSpd: 0.14, crit: 0.08 }, flavor: '九十三公尺長的一隻鳥，一筆畫完。' },
  { id: 'r_crystal', slot: 'relic', name: '深海晶核',      price: 1900, unlockAfter: 'atlantis-3',
    mods: { power: 0.28, cdr: 0.1 }, flavor: '城沉下去之後，燈還亮了兩千年。' },
  { id: 'r_rope',    slot: 'relic', name: '拉石像的繩',    price: 2700, unlockAfter: 'rapanui-3',
    mods: { minionDmg: 0.3, minionHp: 0.3 }, flavor: '傳說說石像自己走過去。傳說沒提這條繩子。' },
  { id: 'r_flight',  slot: 'relic', name: '十九中隊徽',    price: 3600, unlockAfter: 'bermuda-3',
    mods: { critDmg: 0.5, dmgFlat: 12 }, flavor: '最後一次通訊：「我們看不出哪邊是西。」' },
  { id: 'r_heel',    slot: 'relic', name: '踵石碎塊',      price: 5200, unlockAfter: 'stonehenge-2',
    mods: { hpFlat: 120, dmgFlat: 18, cdr: 0.15, goldFind: 0.25 }, flavor: '所有石頭都對準它，它對準太陽。' }
];

G.SLOT_LABEL = { weapon: '武器', armor: '防具', relic: '遺物' };
G.getItem = id => G.ITEMS.find(i => i.id === id);
G.DEFAULT_GEAR = { weapon: 'w_pick', armor: 'a_cloth', relic: 'r_none' };

/* 戰鬥消耗品：每場戰鬥開始時依購買數量帶入 */
G.CONSUMABLES = [
  { id: 'c_potion', name: '油罐',   price: 60,  desc: '戰鬥中按 Q 使用，立即回復 35% 生命。', icon: 'heal' },
  { id: 'c_charge', name: '火藥包', price: 90,  desc: '戰鬥中按 E 使用，對周圍造成一次大範圍爆炸。', icon: 'quake' }
];
