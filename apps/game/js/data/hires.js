/* 戰場僱用：機械 / 武具 / 傭兵
 *
 * 用的是「當場賺到的金幣」，不是倉庫裡的錢。
 * 殺得多 → 僱得起 → 推得動；但花掉的部分不會帶回家，
 * 所以每一次僱用都是「現在贏」跟「之後買裝備」之間的取捨。
 *
 * unit  = 會自己前進作戰的單位（傭兵、機械）
 * gear  = 架在原地的武具（結構物，不會移動）
 *
 * 單位數值會乘上關卡的 scale，所以到後面章節一樣有用；
 * 價錢也跟著章節上調，相對負擔維持不變。
 */
window.G = window.G || {};

G.HIRE_CATS = {
  merc:    { name: '傭兵',  hint: '會自己往前打的人' },
  machine: { name: '機械',  hint: '慢，但拆東西很快' },
  gear:    { name: '武具',  hint: '架在原地，不會走' }
};

G.HIRES = [
  /* ── 傭兵 ── */
  { id: 'h_merc', cat: 'merc', name: '傭兵', cost: 70, icon: 'slash', key: 'Z',
    desc: '一名近戰傭兵，跟著推進線往前打。',
    flavor: '不問你要拆哪座塔，只問付多少。',
    unit: { hp: 140, dmg: 15, speed: 48, range: 28, size: 17, color: '#D0A860', kind: 'melee', siegeMul: 3 } },

  { id: 'h_mage', cat: 'merc', name: '魔法師', cost: 115, icon: 'shard', key: 'Z',
    desc: '遠程法師。攻擊會在命中處炸開，對成群的敵人特別有效。',
    flavor: '他收的錢裡有一半是火藥費。',
    unit: { hp: 74, dmg: 19, speed: 40, range: 185, size: 15, color: '#6E95E0', kind: 'ranged', splash: 75, siegeMul: 2 } },

  { id: 'h_white', cat: 'merc', name: '白魔道士', cost: 135, icon: 'heal', key: 'Z',
    desc: '不攻擊。持續回復周圍的友軍小兵——但救不了你。你的血只能靠藥草、油罐與營地。',
    flavor: '「我只能顧前面那些人。」她說，「你自己的傷，你自己想辦法。」',
    unit: { hp: 90, dmg: 0, speed: 44, range: 150, size: 15, color: '#8FE08A', kind: 'healer',
            heal: 0.05, healRadius: 190, siegeMul: 0 } },

  /* ── 機械 ── */
  { id: 'h_ram', cat: 'machine', name: '攻城車', cost: 165, icon: 'tower', key: 'X',
    desc: '很慢、很厚。對塔與城門傷害極高，對人幾乎沒用。',
    flavor: '它只認得牆。',
    unit: { hp: 460, dmg: 30, speed: 22, range: 36, size: 25, color: '#8A6A44', kind: 'melee',
            siegeMul: 7, unitMul: 0.3 } },

  { id: 'h_ballista', cat: 'machine', name: '彈弩台', cost: 145, icon: 'beam', key: 'X',
    desc: '移動很慢，但射程長、單體傷害高。',
    flavor: '上弦要四個人，放箭只要一個。',
    unit: { hp: 165, dmg: 48, speed: 18, range: 245, size: 21, color: '#A89272', kind: 'ranged',
            atkSpd: 0.55, siegeMul: 3 } },

  { id: 'h_drill', cat: 'machine', name: '鑽地機', cost: 195, icon: 'quake', key: 'X',
    desc: '邊前進邊震地，持續對周圍的敵人造成傷害。',
    flavor: '挖穿一座塔，跟挖穿一座山，對它來說是同一件事。',
    unit: { hp: 330, dmg: 17, speed: 30, range: 32, size: 22, color: '#B0703A', kind: 'melee',
            siegeMul: 4, pulse: { radius: 85, mult: 0.55, tick: 0.7 } } },

  /* ── 武具 ── */
  { id: 'h_barricade', cat: 'gear', name: '拒馬', cost: 60, icon: 'wall', key: 'C',
    desc: '架起路障擋住敵人推進。自己不攻擊。',
    flavor: '擋不了多久。但「多久」常常就是全部的差別。',
    gear: { hp: 560, size: 22, blocker: true } },

  { id: 'h_oil', cat: 'gear', name: '火油槽', cost: 100, icon: 'burn', key: 'C',
    desc: '定點火油，持續燒灼靠近的敵人。',
    flavor: '瀝青本來是拿來黏磚頭的。',
    gear: { hp: 240, size: 18, burn: { radius: 115, dps: 15 } } },

  { id: 'h_banner', cat: 'gear', name: '戰旗', cost: 125, icon: 'rally', key: 'C',
    desc: '插下一面旗。範圍內的友軍傷害 +30%、移動速度 +15%。',
    flavor: '旗子不會打人。但沒有旗子的時候，線會自己散掉。',
    gear: { hp: 200, size: 16, aura: { radius: 230, dmg: 0.30, moveSpd: 0.15 } } }
];

G.getHire = id => G.HIRES.find(h => h.id === id);

/* 每個僱用所提供三件（傭兵 / 機械 / 武具 各一），越深處的越好。
 * 位置固定，所以「要不要冒險走到第三個據點」是一個真的決定。 */
G.POST_OFFERS = [
  { name: '僱用所・壹', offers: ['h_merc', 'h_ram', 'h_barricade'], stock: [3, 2, 2], discount: 1.00 },
  { name: '僱用所・貳', offers: ['h_mage', 'h_ballista', 'h_oil'],   stock: [3, 2, 2], discount: 0.92 },
  { name: '僱用所・參', offers: ['h_white', 'h_drill', 'h_banner'],  stock: [2, 2, 2], discount: 0.84 },
  { name: '僱用所・肆', offers: ['h_merc', 'h_ballista', 'h_banner'], stock: [3, 2, 2], discount: 0.80 }
];

G.hireCost = function (hire, postIdx, chapterIdx) {
  const post = G.POST_OFFERS[Math.min(postIdx, G.POST_OFFERS.length - 1)];
  return Math.round(hire.cost * (1 + chapterIdx * 0.3) * post.discount);
};
