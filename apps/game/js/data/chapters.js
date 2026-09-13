/* 章節：古世界史詩，依年代排序
 *
 * 前 9600 亞特蘭提斯 → 前 1700 克諾索斯 → 前 1184 特洛伊 → 前 1178 獨眼巨人之島
 * → 前 450 亞馬遜 → 前 280 羅得島巨神像 → 前 247 法羅斯燈塔
 *
 * 七大奇蹟佔了最後兩章（巨神像、燈塔），巨人國與女人國各一章。
 * 敵人數值分七段，第 n 章用第 n 段，實際強度再乘上 stage.scale。
 */
window.G = window.G || {};

G.CHAPTERS = [
  {
    id: 'atlantis',
    no: 'I',
    year: '約前 9600 年',
    name: '亞特蘭提斯',
    sub: '柏拉圖說那是九千年前的事',
    tier: 1,
    motif: 'ruins_sea',
    palette: { field: '#122F3E', field2: '#17414F', road: '#4E8E9C', roadEdge: '#1D5566', prop: '#1E4C5C',
               sky: '#0F2230', far: '#153648', mid: '#1D4D63', near: '#0A1822', ground: '#16303C',
               accent: '#3FB8C8', fog: '#2C6A7E' },
    lore: '柏拉圖在兩篇對話錄裡寫了一座城：強盛、富有，然後在一天一夜之間沉進海裡。' +
          '他說那是九千年前的事，還說消息是從埃及祭司那裡傳下來的。' +
          '兩千多年來沒有人找到它，也沒有人願意說它不存在。',
    hook: '水壓把門推開的那一刻，你才發現城裡的燈全都還亮著。',
    enemies: ['drowned', 'coralArcher', 'deepGuard'],
    boss: { shape: 'tide', name: '潮位官', skills: ['tide_surge', 'tide_drag'], title: '把水叫上來的那個人' },
    reward: { gold: 220, sp: 2 }
  },
  {
    id: 'knossos',
    no: 'II',
    year: '約前 1700 年',
    name: '克諾索斯 · 迷宮',
    sub: '一座蓋來讓人走不出去的建築',
    tier: 2,
    motif: 'maze',
    palette: { field: '#3E2A1E', field2: '#52392A', road: '#C9A882', roadEdge: '#7A5640', prop: '#6A4630',
               sky: '#2A1E18', far: '#4A2E22', mid: '#6E4632', near: '#241A14', ground: '#5A3A28',
               accent: '#D8543C', fog: '#8A5A3E' },
    lore: '克里特島的王宮有一千多個房間，走道彼此相通、互相折返。' +
          '傳說裡面關著一頭牛頭人，雅典每隔幾年要送七個少年和七個少女進去。' +
          '考古學家挖出來的是排水系統、倉庫和壁畫，沒有牛頭人——' +
          '但那座建築確實是設計來讓人迷路的。',
    hook: '迷宮不是用來困住怪物的。是用來困住那些進去找怪物的人。',
    enemies: ['threadHolder', 'ratSwarm', 'axeGuard'],
    boss: { shape: 'minotaur', name: '米諾陶', skills: ['bull_charge', 'bull_stomp'], title: '被關起來的那個，不是為了保護外面' },
    reward: { gold: 320, sp: 2 }
  },
  {
    id: 'troy',
    no: 'III',
    year: '約前 1184 年',
    name: '特洛伊',
    sub: '為了一個名字打了十年',
    tier: 3,
    motif: 'wall',
    palette: { field: '#3A3220', field2: '#4C4229', road: '#B79E6A', roadEdge: '#6E5E38', prop: '#5E5030',
               sky: '#2A2418', far: '#4A4028', mid: '#6B5C38', near: '#221E14', ground: '#55492C',
               accent: '#C87A3C', fog: '#8A7846' },
    lore: '荷馬寫了十年的圍城，寫了城破的那一夜。' +
          '十九世紀有人照著詩去挖，真的挖到一座城——而且不只一座，' +
          '九層城疊在同一個土丘上。詩是真的，它只是沒說是哪一層。',
    hook: '城牆擋得住十年。擋不住一個被你親手拉進來的禮物。',
    enemies: ['spearman', 'trojanArcher', 'bronzeHoplite'],
    boss: { shape: 'horse', name: '木馬之腹', skills: ['horse_volley', 'horse_disgorge'], title: '你自己把它拉過門檻的' },
    reward: { gold: 440, sp: 3 }
  },
  {
    id: 'cyclops',
    no: 'IV',
    year: '約前 1178 年',
    name: '獨眼巨人之島',
    sub: '巨人國。荷馬說那裡的人不耕種也不立法',
    tier: 4,
    motif: 'crag',
    palette: { field: '#28321F', field2: '#36432B', road: '#8A9470', roadEdge: '#4A5638', prop: '#3E4C30',
               sky: '#1A2018', far: '#2C3A28', mid: '#44583C', near: '#141A12', ground: '#36442E',
               accent: '#8ABF5A', fog: '#5A7048' },
    lore: '奧德修斯漂到一座島，島上的巨人住在洞裡、牧羊，不開會也不種田。' +
          '他吃掉了六個人。奧德修斯用一根燒紅的木樁弄瞎他，' +
          '然後告訴他自己叫「沒有人」。',
    hook: '巨人喊救命的時候，鄰居問是誰弄的。他說：「沒有人。」於是沒有人來。',
    enemies: ['caveDweller', 'boulderThrower', 'shepherdGiant'],
    boss: { shape: 'cyclops', name: '波呂斐摩斯', skills: ['rock_throw', 'cyclops_sweep'], title: '他問了你的名字，你沒有給他' },
    reward: { gold: 580, sp: 3 }
  },
  {
    id: 'amazon',
    no: 'V',
    year: '約前 450 年',
    name: '泰美斯基拉',
    sub: '女人國。希羅多德把它當成史實記下來',
    tier: 5,
    motif: 'column',
    palette: { field: '#2E3730', field2: '#3E4A3E', road: '#9EA890', roadEdge: '#56624F', prop: '#4A564A',
               sky: '#232A2E', far: '#3A4440', mid: '#566356', near: '#1A1F20', ground: '#414C44',
               accent: '#A8C0D8', fog: '#6A7A6C' },
    lore: '希臘人說黑海南岸有一個只有女人的國家：她們騎馬、射箭、自己挑丈夫。' +
          '希羅多德記下來的時候當成史實，後來的人當成神話。' +
          '近年在草原上挖開的墓裡，有女人和她的弓、箭、馬一起下葬。',
    hook: '傳說是她們替阿提米絲立了神廟。那座神廟燒過，也重蓋過，' +
          '最後成了七大奇蹟之一。',
    enemies: ['templeSentinel', 'horseArcher', 'javelineer'],
    boss: { shape: 'queen', name: '希波呂忒', skills: ['arrow_rain', 'queen_mark'], title: '腰帶上刻的是她自己的名字' },
    reward: { gold: 760, sp: 3 }
  },
  {
    id: 'colossus',
    no: 'VI',
    year: '前 280 年落成',
    name: '羅得島巨神像',
    sub: '七大奇蹟。站了五十幾年，躺了八百年',
    tier: 6,
    motif: 'statue',
    palette: { field: '#2E3A4C', field2: '#3E4C60', road: '#C4A878', roadEdge: '#6A7488', prop: '#4C5A6E',
               sky: '#20283A', far: '#3A4A60', mid: '#5A6E86', near: '#181E2A', ground: '#46566C',
               accent: '#E0A03C', fog: '#7A8CA0' },
    lore: '羅得島人把敵人撤退時丟下的攻城器材熔成銅，' +
          '鑄了一座三十幾公尺高的太陽神。' +
          '五十幾年後一場地震把它從膝蓋折斷。' +
          '倒下之後它躺了八百年，沒有人敢扶——神諭說不要。',
    hook: '它站著的時間，比它躺著的時間短得多。但人們記得的是站著的那幾十年。',
    enemies: ['bronzeSentinel', 'siegeEngine', 'fallenLimb' ],
    boss: { shape: 'colossus', name: '折膝的太陽', skills: ['sun_beam', 'bronze_quake'], title: '它不是被打倒的，是被地面放倒的' },
    reward: { gold: 980, sp: 4 }
  },
  {
    id: 'pharos',
    no: 'VII',
    year: '約前 247 年落成',
    name: '法羅斯燈塔',
    sub: '七大奇蹟裡最後一個熄掉的',
    tier: 7,
    motif: 'beacon',
    palette: { field: '#1A2038', field2: '#28304E', road: '#6E7A9E', roadEdge: '#343E62', prop: '#323A5C',
               sky: '#14182A', far: '#242C48', mid: '#3A456A', near: '#0E1120', ground: '#202844',
               accent: '#FFB43C', fog: '#4E5A84' },
    lore: '亞歷山大港外的小島上有一座一百多公尺高的塔，' +
          '頂上的火整夜燒著，幾十公里外的船看得見。' +
          '七大奇蹟裡它活得第二久，只輸給金字塔。' +
          '幾次地震之後它終於塌了，石頭被拿去蓋了一座堡壘。',
    hook: '所有的奇蹟最後都變成別人家的石頭。問題是在那之前，它替多少船指過路。',
    enemies: ['seawallGuard', 'mirrorSoldier', 'fireKeeper'],
    boss: { shape: 'flame', name: '最後一盞火', skills: ['beacon_sweep', 'flame_pool'], title: '它熄掉的那一晚，沒有人記下來' },
    reward: { gold: 1400, sp: 5 }
  }
];

/* 敵人原型：數值分七段，第 n 章用第 n 段。
 * 這七組數字沿用先前已經驗證過的平衡，只換了名字與顏色。 */
G.ENEMY_TYPES = {
  /* I 亞特蘭提斯 */
  drowned:        { name: '溺者',       hp: 34,  dmg: 5,  speed: 30, range: 22,  size: 15, color: '#2A6A78', kind: 'melee' },
  coralArcher:    { name: '珊瑚弓手',   hp: 26,  dmg: 7,  speed: 24, range: 150, size: 14, color: '#3FB8C8', kind: 'ranged' },
  deepGuard:      { name: '深海守衛',   hp: 62,  dmg: 9,  speed: 20, range: 26,  size: 19, color: '#1D7A8E', kind: 'tank' },

  /* II 克諾索斯 */
  threadHolder:   { name: '執線者',     hp: 40,  dmg: 8,  speed: 42, range: 22,  size: 15, color: '#B06A48', kind: 'melee' },
  ratSwarm:       { name: '迷宮鼠群',   hp: 22,  dmg: 6,  speed: 52, range: 18,  size: 11, color: '#6E4632', kind: 'swarm' },
  axeGuard:       { name: '雙斧衛',     hp: 78,  dmg: 11, speed: 18, range: 28,  size: 20, color: '#D8543C', kind: 'tank' },

  /* III 特洛伊 */
  spearman:       { name: '長矛兵',     hp: 38,  dmg: 8,  speed: 36, range: 24,  size: 15, color: '#A8894E', kind: 'melee' },
  trojanArcher:   { name: '特洛伊弓手', hp: 30,  dmg: 10, speed: 46, range: 170, size: 14, color: '#C87A3C', kind: 'ranged' },
  bronzeHoplite:  { name: '青銅重裝',   hp: 88,  dmg: 12, speed: 22, range: 30,  size: 21, color: '#8A6E38', kind: 'tank' },

  /* IV 獨眼巨人之島 */
  caveDweller:    { name: '洞居者',     hp: 46,  dmg: 9,  speed: 30, range: 22,  size: 16, color: '#5C6E48', kind: 'melee' },
  boulderThrower: { name: '擲石者',     hp: 34,  dmg: 11, speed: 26, range: 160, size: 15, color: '#8ABF5A', kind: 'ranged' },
  shepherdGiant:  { name: '牧羊巨人',   hp: 70,  dmg: 14, speed: 20, range: 190, size: 18, color: '#44583C', kind: 'caster' },

  /* V 泰美斯基拉 */
  templeSentinel: { name: '神廟石衛',   hp: 120, dmg: 14, speed: 16, range: 28,  size: 22, color: '#8A968C', kind: 'tank' },
  horseArcher:    { name: '騎射手',     hp: 42,  dmg: 12, speed: 50, range: 24,  size: 15, color: '#A8C0D8', kind: 'melee' },
  javelineer:     { name: '標槍手',     hp: 56,  dmg: 13, speed: 30, range: 150, size: 16, color: '#6A7A6C', kind: 'ranged' },

  /* VI 羅得島 */
  bronzeSentinel: { name: '銅鑄衛',     hp: 44,  dmg: 13, speed: 44, range: 26,  size: 14, color: '#C08A42', kind: 'melee' },
  siegeEngine:    { name: '攻城弩',     hp: 72,  dmg: 15, speed: 28, range: 175, size: 17, color: '#E0A03C', kind: 'ranged' },
  fallenLimb:     { name: '巨像殘肢',   hp: 96,  dmg: 17, speed: 22, range: 30,  size: 20, color: '#5A6E86', kind: 'tank' },

  /* VII 法羅斯 */
  seawallGuard:   { name: '石堤衛',     hp: 150, dmg: 18, speed: 15, range: 30,  size: 24, color: '#3A456A', kind: 'tank' },
  mirrorSoldier:  { name: '鏡兵',       hp: 80,  dmg: 20, speed: 26, range: 200, size: 17, color: '#FFB43C', kind: 'caster' },
  fireKeeper:     { name: '守火人',     hp: 64,  dmg: 16, speed: 40, range: 24,  size: 16, color: '#C48A5A', kind: 'melee' }
};

/* 產生 21 個關卡（遠征系統用 -1 當一般戰、-2 當精銳戰、-3 當大王） */
G.buildStages = function () {
  const list = [];
  G.CHAPTERS.forEach((ch, ci) => {
    for (let s = 0; s < 3; s++) {
      const isBoss = s === 2;
      list.push({
        key: ch.id + '-' + (s + 1),
        chapterId: ch.id,
        chapterIdx: ci,
        idx: s,
        name: ch.name + ' · ' + ['外圍', '內廊', '核心'][s],
        isBoss,
        length: 2100 + ci * 260 + s * 180,
        towers: isBoss ? 3 : 2,
        scale: Math.pow(1.34, ci) * (1 + s * 0.18),
        waveGap: 9.5 - Math.min(3.5, ci * 0.4),
        /* 限時過關的秒數。用實測的通關時間定出來的：
           一般關大多 90～180 秒，核心關 150～330 秒，
           所以把門檻壓在「打得順才過得了」的位置。 */
        par: Math.round((isBoss ? 190 : 120) + ci * 14 + s * 10),
        reward: {
          gold: Math.round(ch.reward.gold * (0.55 + s * 0.35)),
          // 打王給的技能點最多，因為那是拿去修行別的職業的本錢
          sp: s === 2 ? ch.reward.sp + 2 : 1,
          xp: Math.round(110 * Math.pow(1.3, ci) * (1 + s * 0.3))
        }
      });
    }
  });
  return list;
};

G.STAGES = G.buildStages();
G.getChapter = id => G.CHAPTERS.find(c => c.id === id);
G.getStage = key => G.STAGES.find(s => s.key === key);

/* 換過世界觀，舊存檔的章節代號已經不存在了。
 * 進度按「通關幾章」等量換算到新的章節，不讓玩家白走。 */
/* ══════════ 捷徑守衛 ══════════
 * 大地圖上有一條捷徑，會直接跳過中間兩排，但路口站著一個守衛。
 * 守衛身上有「結界」：不對味的傷害只會吃到 18%。
 * 所以這不是硬碰硬，是先看它擋什麼、再回去換職業或換技能欄。
 * 打贏了：捷徑打開，而且掉一件那一章最好的武器或防具。
 */
G.WARDS = {
  phys:  { name: '石膚結界', hint: '普通攻擊打不破。只有技能傷害穿得過去。',
           color: '#A89170', pass: 'skill',
           how: '技能欄至少放一個主動技能，靠技能輸出。' },
  /* 這一道是給帽子系統的：魔防不夠就傷不到它。
     （試過「要站遠打」，但主角站遠了自己也打不到，反而更慢——那不是門檻，是懲罰。） */
  mdef:  { name: '灼魂結界', hint: '魔防不夠的人碰不到它。',
           color: '#8E6BE0', pass: 'mdef',
           how: '魔防要有 25% 以上。白魔道士帽、祭司額環、神諭祭司的技能樹都給魔防。' },
  swift: { name: '殘影結界', hint: '打不到會動的東西。只有暴擊穿得過去。',
           color: '#3FB8C8', pass: 'crit',
           how: '把暴擊率堆上去——武器、遺物、技能樹都可以。' },
  siege: { name: '城工結界', hint: '只認得攻城的力道。攻城加成不夠就傷不到。',
           color: '#C8503E', pass: 'siege',
           how: '攻城傷害要有 +20% 以上。掘徑者的攻城錘或巨像碎銅都行。' }
};
G.WARD_SIEGE_MIN = 0.20;   // 城工結界的門檻
G.WARD_MDEF_MIN = 0.25;    // 灼魂結界的魔防門檻

G.GUARDIANS = [
  { id: 'g_tide',   chapter: 'atlantis', name: '守門的潮',   ward: 'phys',
    drop: 'w_labrys', line: '門在水下。它不讓你游過去。' },
  { id: 'g_thread', chapter: 'knossos',  name: '線的盡頭',   ward: 'swift',
    drop: 'a_hoplite', line: '線在這裡斷了。斷口有人守著。' },
  { id: 'g_gate',   chapter: 'troy',     name: '斯開安門衛', ward: 'siege',
    drop: 'w_spear',  line: '這道門開過一次。守的人記得那一次。' },
  { id: 'g_noone',  chapter: 'cyclops',  name: '沒有人',     ward: 'mdef',
    drop: 'a_fleece', line: '你問它是誰。它說：「沒有人。」' },
  { id: 'g_belt',   chapter: 'amazon',   name: '執腰帶者',   ward: 'phys',
    drop: 'w_bow',    line: '她說腰帶不是搶來的。要先證明你配。' },
  { id: 'g_knee',   chapter: 'colossus', name: '膝上的鉚',   ward: 'siege',
    drop: 'a_plate',  line: '巨像的膝蓋斷在這裡。斷口長出了一個人。' },
  { id: 'g_wick',   chapter: 'pharos',   name: '最後的燈芯', ward: 'mdef',
    drop: 'w_mirror', line: '它替船指過路。現在它擋你的路。' }
];

G.guardianFor = id => G.GUARDIANS.find(g => g.chapter === id) || null;

G.CONTENT_VERSION = 4;

/* 星星：限時過關拿的。滿這個數字就開星光商店。 */
G.STAR_GOAL = 5;
G.OLD_CHAPTER_IDS = ['babel', 'giza', 'nazca', 'atlantis', 'rapanui', 'bermuda', 'stonehenge'];
