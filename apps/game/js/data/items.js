/* 商店：武器 / 防具 / 遺物
 * unlockAfter = 需要通關的關卡代號（null 代表一開始就有）
 * 每一件都掛在某一章的史料上，依年代往後推。
 */
window.G = window.G || {};

G.ITEMS = [
  /* ── 武器 ── */
  { id: 'w_pick',    slot: 'weapon', name: '舊銅鑿',       price: 0,    unlockAfter: null,
    mods: {}, flavor: '你帶進來的東西。它鑿過石頭，還沒鑿過別的。' },
  { id: 'w_shell',   slot: 'weapon', name: '硨磲短劍',     price: 180,  unlockAfter: null,
    mods: { dmgFlat: 6, atkSpd: 0.05 }, flavor: '磨了兩千年的貝殼，邊緣比青銅還利。' },
  { id: 'w_labrys',  slot: 'weapon', name: '雙面斧',       price: 420,  unlockAfter: 'atlantis-2',
    mods: { dmgFlat: 12, crit: 0.05 }, flavor: '克里特的壁畫上到處都是它。沒有人確定那是武器還是符號。' },
  { id: 'w_spear',   slot: 'weapon', name: '白楊長矛',     price: 760,  unlockAfter: 'knossos-2',
    mods: { dmgFlat: 10, power: 0.22, range: 0.1 }, flavor: '十年圍城，矛桿換過七次，矛頭是同一個。' },
  { id: 'w_stake',   slot: 'weapon', name: '燒紅的木樁',   price: 1150, unlockAfter: 'knossos-3',
    mods: { dmgFlat: 16, atkSpd: 0.14, moveSpd: 0.05 }, flavor: '橄欖木，削尖，在火裡轉到發紅。它只用過一次。' },
  { id: 'w_bow',     slot: 'weapon', name: '反曲弓',       price: 1680, unlockAfter: 'cyclops-2',
    mods: { dmgFlat: 24, lifesteal: 0.08 }, flavor: '草原上的墓裡，它跟主人葬在一起。主人是女人。' },
  { id: 'w_bronze',  slot: 'weapon', name: '巨像碎銅',     price: 2400, unlockAfter: 'amazon-2',
    mods: { dmgFlat: 34, siege: 0.35, atkSpd: -0.08 }, flavor: '從膝蓋那一段切下來的。折斷處到現在還是新的。' },
  { id: 'w_mirror',  slot: 'weapon', name: '燈塔鏡片',     price: 3300, unlockAfter: 'colossus-1',
    mods: { dmgFlat: 30, crit: 0.14, critDmg: 0.4 }, flavor: '據說它能把火光送到幾十公里外。據說也能送別的東西。' },
  { id: 'w_flame',   slot: 'weapon', name: '不滅之焰',     price: 4800, unlockAfter: 'colossus-3',
    mods: { dmgFlat: 42, power: 0.3, cdr: 0.12 }, flavor: '燒了一千六百年。熄掉的那一晚，沒有人記下來。' },

  /* ── 防具 ── */
  { id: 'a_cloth',   slot: 'armor', name: '粗麻短衣',      price: 0,    unlockAfter: null,
    mods: {}, flavor: '會弄髒，但至少是你自己的。' },
  { id: 'a_leather', slot: 'armor', name: '鞣皮胸甲',      price: 160,  unlockAfter: null,
    mods: { hpFlat: 40, armorFlat: 4 }, flavor: '泡過海水又曬乾，硬得像木頭。' },
  { id: 'a_fresco',  slot: 'armor', name: '壁畫護胸',      price: 500,  unlockAfter: 'atlantis-3',
    mods: { hpFlat: 75, armorFlat: 8, moveSpd: -0.03 }, flavor: '上面畫著跳牛的少年。跳過去的那些人沒有留下名字。' },
  { id: 'a_hoplite', slot: 'armor', name: '青銅胸甲',      price: 880,  unlockAfter: 'knossos-1',
    mods: { hpFlat: 110, armorFlat: 12, moveSpd: -0.02 }, flavor: '照著穿的人的身體打的。所以只合一個人。' },
  { id: 'a_fleece',  slot: 'armor', name: '羊毛襯甲',      price: 1380, unlockAfter: 'knossos-3',
    mods: { hpFlat: 150, armorFlat: 15, lifesteal: 0.05 }, flavor: '巨人洞裡那些羊的毛。它們比牠好相處。' },
  { id: 'a_scale',   slot: 'armor', name: '草原鱗甲',      price: 2100, unlockAfter: 'cyclops-1',
    mods: { hpFlat: 200, armorFlat: 21, moveSpd: -0.05 }, flavor: '幾千片骨片縫在皮上。騎馬的時候會響。' },
  { id: 'a_plate',   slot: 'armor', name: '鑄銅外殼',      price: 3000, unlockAfter: 'amazon-1',
    mods: { hpFlat: 245, armorFlat: 24, cdr: 0.08 }, flavor: '巨像的外殼是一片一片鉚上去的。這是其中一片。' },
  { id: 'a_seawall', slot: 'armor', name: '海堤石衣',      price: 4400, unlockAfter: 'colossus-1',
    mods: { hpFlat: 300, armorFlat: 30, power: 0.12 }, flavor: '擋了一千年的浪。最後輸給的是地震。' },

  /* ── 遺物 ── */
  { id: 'r_none',    slot: 'relic', name: '空手',          price: 0,    unlockAfter: null,
    mods: {}, flavor: '什麼都沒帶，也是一種選擇。' },
  { id: 'r_tablet',  slot: 'relic', name: '線形文字泥板',  price: 300,  unlockAfter: 'atlantis-1',
    mods: { goldFind: 0.2, cdr: 0.05 }, flavor: '線形文字 A 到現在沒人讀得懂。但上面的數字看得懂。' },
  { id: 'r_thread',  slot: 'relic', name: '一團線',        price: 720,  unlockAfter: 'knossos-3',
    mods: { hpFlat: 60, lifesteal: 0.07 }, flavor: '進去的辦法人人都有。出來的辦法只有這一團。' },
  { id: 'r_shard',   slot: 'relic', name: '九層土丘的陶片', price: 1250, unlockAfter: 'troy-3',
    mods: { moveSpd: 0.14, crit: 0.08 }, flavor: '九座城疊在同一個丘上。這片不知道是第幾層的。' },
  { id: 'r_name',    slot: 'relic', name: '沒有人',        price: 1900, unlockAfter: 'cyclops-3',
    mods: { power: 0.28, cdr: 0.1 }, flavor: '一個名字。用一次就夠了，而且只能用一次。' },
  { id: 'r_belt',    slot: 'relic', name: '女王的腰帶',    price: 2700, unlockAfter: 'amazon-3',
    mods: { minionDmg: 0.3, minionHp: 0.3 }, flavor: '為了它打了一場仗。她本來願意直接給的。' },
  { id: 'r_oracle',  slot: 'relic', name: '神諭石籤',      price: 3600, unlockAfter: 'colossus-3',
    mods: { critDmg: 0.5, dmgFlat: 12 }, flavor: '上面寫著「不要扶」。於是八百年沒有人扶。' },
  { id: 'r_ash',     slot: 'relic', name: '塔頂的餘燼',    price: 5200, unlockAfter: 'pharos-2',
    mods: { hpFlat: 120, dmgFlat: 18, cdr: 0.15, goldFind: 0.25 }, flavor: '奇蹟最後都變成別人家的石頭。這是沒被搬走的那一點。' }
];

G.SLOT_LABEL = { weapon: '武器', armor: '防具', relic: '遺物' };
G.getItem = id => G.ITEMS.find(i => i.id === id);
G.DEFAULT_GEAR = { weapon: 'w_pick', armor: 'a_cloth', relic: 'r_none' };

/* 戰鬥消耗品。藥草不在這裡賣——它只從洞穴來。 */
G.CONSUMABLES = [
  { id: 'c_potion', name: '油罐',   price: 60,  desc: '戰鬥中按 Q 使用，立即回復 35% 生命。', icon: 'heal' },
  { id: 'c_charge', name: '火藥包', price: 90,  desc: '戰鬥中按 E 使用，對周圍造成一次大範圍爆炸。', icon: 'quake' }
];
