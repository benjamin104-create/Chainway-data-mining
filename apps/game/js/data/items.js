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

  /* ── 帽子 ──
   * 帽子不在商店賣，只從戰場上撿。每一頂都掛在某個職業的路數上：
   * affinity 相符時，額外再吃一份 bonus。白魔帽戴在祭司頭上才是白魔帽。
   * mdef = 魔防，只擋魔王技能那一類的傷害；herb = 藥草回復效果。
   */
  { id: 'h_none',   slot: 'hat', name: '沒戴帽子',   price: 0, unlockAfter: null, drop: false,
    mods: {}, flavor: '風吹得到頭頂。' },

  { id: 'h_white',  slot: 'hat', name: '白魔道士帽', price: 0, unlockAfter: null, tier: 2,
    affinity: 'oracle', mods: { mdef: 0.22, herb: 0.30, hpFlat: 40 },
    bonus: { mdef: 0.12, cdr: 0.08 },
    flavor: '尖頂、紅邊。神廟裡那些不拿武器的人戴的。' },

  { id: 'h_black',  slot: 'hat', name: '黑魔道士帽', price: 0, unlockAfter: null, tier: 2,
    affinity: 'stonespeaker', mods: { power: 0.20, cdr: 0.10, armorFlat: -2 },
    bonus: { critDmg: 0.30 },
    flavor: '帽簷壓得很低，看不見臉。那是刻意的。' },

  { id: 'h_helm',   slot: 'hat', name: '青銅盔',     price: 0, unlockAfter: null, tier: 1,
    affinity: 'delver', mods: { armorFlat: 9, hpFlat: 55, moveSpd: -0.03 },
    bonus: { siege: 0.20 },
    flavor: '戴著聽不清別人喊什麼。通常也不需要聽。' },

  { id: 'h_hood',   slot: 'hat', name: '影兜帽',     price: 0, unlockAfter: null, tier: 2,
    affinity: 'shadowbinder', mods: { crit: 0.10, moveSpd: 0.08 },
    bonus: { critDmg: 0.35 },
    flavor: '布很薄，但影子很深。' },

  { id: 'h_lamp',   slot: 'hat', name: '守燈人斗笠', price: 0, unlockAfter: null, tier: 2,
    affinity: 'lampwarden', mods: { range: 0.12, mdef: 0.15 },
    bonus: { dmg: 0.15 },
    flavor: '寬得能擋雨，也能擋住塔頂落下來的火星。' },

  { id: 'h_laurel', slot: 'hat', name: '桂冠',       price: 0, unlockAfter: null, tier: 3,
    affinity: 'gladiator', mods: { dmg: 0.14, atkSpd: 0.10 },
    bonus: { lifesteal: 0.08 },
    flavor: '贏的人戴。輸的人也曾經戴過。' },

  { id: 'h_horn',   slot: 'hat', name: '獸骨頭冠',   price: 0, unlockAfter: null, tier: 3,
    affinity: 'beastbinder', mods: { minionDmg: 0.25, minionHp: 0.25 },
    bonus: { minionDmg: 0.20 },
    flavor: '不是戰利品，是信物。牠們認得這個。' },

  { id: 'h_circlet', slot: 'hat', name: '祭司額環',  price: 0, unlockAfter: null, tier: 3,
    mods: { mdef: 0.28, herb: 0.20, cdr: 0.08 },
    flavor: '薄薄一圈金，戴上去會覺得有人在聽。' },

  { id: 'h_mask',   slot: 'hat', name: '黃金面具',   price: 0, unlockAfter: null, tier: 4,
    mods: { hpFlat: 90, armorFlat: 8, mdef: 0.18, dmg: 0.10 },
    flavor: '蓋在臉上下葬的那種。它比臉活得久。' },

  { id: 'h_crown',  slot: 'hat', name: '沉城王冠',   price: 0, unlockAfter: null, tier: 5,
    mods: { hpFlat: 120, dmg: 0.16, mdef: 0.25, cdr: 0.10, goldFind: 0.15 },
    flavor: '城沉下去的時候，它還在原來的頭上。' },

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

G.GEAR_SLOTS = ['weapon', 'armor', 'hat', 'relic'];
G.SLOT_LABEL = { weapon: '武器', armor: '防具', hat: '帽子', relic: '遺物' };
G.getItem = id => G.ITEMS.find(i => i.id === id);
G.DEFAULT_GEAR = { weapon: 'w_pick', armor: 'a_cloth', hat: 'h_none', relic: 'r_none' };

/* 戰鬥消耗品。藥草不在這裡賣——它只從洞穴來。 */
G.CONSUMABLES = [
  { id: 'c_potion', name: '油罐',   price: 60,  desc: '戰鬥中按 Q 使用，立即回復 35% 生命。', icon: 'heal' },
  { id: 'c_charge', name: '火藥包', price: 90,  desc: '戰鬥中按 E 使用，對周圍造成一次大範圍爆炸。', icon: 'quake' }
];

/* ══════════ 星光商店 ══════════
 * 集滿五顆星才開。這裡的東西不用金幣買，用星買——
 * 所以它跟「有沒有錢」無關，只跟「打得夠不夠快」有關。
 */
G.STAR_ITEMS = [
  { id: 'w_comet',  slot: 'weapon', name: '墜星鐵',   stars: 2,
    mods: { dmgFlat: 38, crit: 0.12, atkSpd: 0.1 },
    flavor: '天上掉下來的那一塊。落點現在還是一個坑。' },
  { id: 'a_aegis',  slot: 'armor',  name: '神盾殘片', stars: 2,
    mods: { hpFlat: 260, armorFlat: 26, mdef: 0.20 },
    flavor: '據說看過它的人會停在原地。它只剩一片了。' },
  { id: 'h_star',   slot: 'hat',    name: '觀星者冠', stars: 2, tier: 9, drop: false,
    mods: { cdr: 0.16, power: 0.22, mdef: 0.20, herb: 0.25 },
    flavor: '戴著它的人整晚不睡，把天上的位置記下來。' },
  { id: 'r_hour',   slot: 'relic',  name: '沙漏的沙', stars: 3,
    mods: { atkSpd: 0.18, moveSpd: 0.14, cdr: 0.14 },
    flavor: '倒過來的時候，它不知道自己在倒數什麼。' },
  { id: 'r_seed',   slot: 'relic',  name: '一顆種子', stars: 4,
    mods: { hpFlat: 180, lifesteal: 0.12, minionHp: 0.35, minionDmg: 0.35 },
    flavor: '奇蹟都塌了，這個還沒發芽。它在等。' }
];
G.starItem = id => G.STAR_ITEMS.find(i => i.id === id);
G.starShopOpen = () => (G.S.stars | 0) >= G.STAR_GOAL;

/* 星光商品也要能被 getItem 找到，不然裝上去算不出數值 */
G.STAR_ITEMS.forEach(it => {
  it.price = 0; it.unlockAfter = null; it.starOnly = true;
  G.ITEMS.push(it);
});
