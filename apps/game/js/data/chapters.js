/* 章節資料：七大世界謎團
 * 每章 3 關，關卡數值由 chapter.tier 與 stage.idx 推導。
 * palette 供背景程序繪製使用；motif 決定剪影形狀的生成方式。
 */
window.G = window.G || {};

G.CHAPTERS = [
  {
    id: 'babel',
    no: 'I',
    name: '巴別之塔',
    sub: '語言碎裂之處',
    tier: 1,
    motif: 'ziggurat',
    palette: { sky: '#2B2418', far: '#3A2F20', mid: '#4A3A26', near: '#241C13', ground: '#3E3222', accent: '#2C4D8E', fog: '#6B5334' },
    lore: '人們曾經共用一種語言，於是他們動手蓋一座通到天上的塔。塔沒有蓋完，' +
          '語言就散了。散掉的不是詞，是「同一件事」這個共識。' +
          '現在塔還在，一層一層往上長，每一層說著彼此聽不懂的話。',
    hook: '你越往上爬，敵人的話你越聽不懂——而聽不懂的東西，最容易被當成敵人。',
    enemies: ['brick', 'scribe', 'mason'],
    boss: { name: '眾聲之口', title: '第七層的守門者', sprite: 'mouth' },
    reward: { gold: 220, sp: 2 }
  },
  {
    id: 'giza',
    no: 'II',
    name: '吉薩星門',
    sub: '對準獵戶座的三座石山',
    tier: 2,
    motif: 'pyramid',
    palette: { sky: '#2A2415', far: '#4A3D22', mid: '#6B5730', near: '#2A2113', ground: '#5A4826', accent: '#D8A33C', fog: '#8A6E3A' },
    lore: '三座金字塔的位置，和獵戶座腰帶的三顆星幾乎一樣。' +
          '有人說那是巧合，有人說那是地址。' +
          '若是地址，那就有人打算收信；若有人收信，信早就寄出去了。',
    hook: '通道盡頭沒有棺材，只有一個還在運轉的、對準天空的東西。',
    enemies: ['jackal', 'scarab', 'guardian'],
    boss: { name: '無面之獅', title: '守著問題的那個', sprite: 'sphinx' },
    reward: { gold: 320, sp: 2 }
  },
  {
    id: 'nazca',
    no: 'III',
    name: '納斯卡地紋',
    sub: '只有從天上才看得懂的畫',
    tier: 3,
    motif: 'mesa',
    palette: { sky: '#33241C', far: '#5C3B29', mid: '#7E5334', near: '#2C1D15', ground: '#6E4628', accent: '#C85A32', fog: '#9C6A40' },
    lore: '地上刻了幾百條線、幾十隻動物，每一筆都長達數公里。' +
          '站在地面上你什麼都看不出來，走上去只覺得是一條路。' +
          '要離開地面到足夠高，那些線才會突然變成一隻蜂鳥。',
    hook: '有些事只有在你離得夠遠的時候，才看得出形狀。',
    enemies: ['glyph', 'condor', 'linewalker'],
    boss: { name: '蜂鳥', title: '一直在飛卻從未離地', sprite: 'hummingbird' },
    reward: { gold: 440, sp: 3 }
  },
  {
    id: 'atlantis',
    no: 'IV',
    name: '亞特蘭提斯',
    sub: '一夜之間沉下去的城',
    tier: 4,
    motif: 'ruins_sea',
    palette: { sky: '#0F2230', far: '#153648', mid: '#1D4D63', near: '#0A1822', ground: '#16303C', accent: '#3FB8C8', fog: '#2C6A7E' },
    lore: '柏拉圖寫過一座城，強盛、富有、然後在一天一夜之間沉入海裡。' +
          '他說那是真的。兩千年來沒有人找到它，也沒有人願意說它不存在。' +
          '因為每個時代都需要一座「本來可以更好，卻自己毀掉」的城。',
    hook: '水壓把門推開的那一刻，你才發現城裡的燈全都還亮著。',
    enemies: ['drowned', 'coral', 'tidepriest'],
    boss: { name: '潮位官', title: '把水叫上來的那個人', sprite: 'tide' },
    reward: { gold: 580, sp: 3 }
  },
  {
    id: 'rapanui',
    no: 'V',
    name: '復活節島',
    sub: '會走路的石像',
    tier: 5,
    motif: 'moai',
    palette: { sky: '#20242A', far: '#333A40', mid: '#4B545B', near: '#181B1F', ground: '#3C4348', accent: '#7FA8B8', fog: '#5E6A72' },
    lore: '島民說摩艾是「自己走過去的」。考古學家用繩子左右擺盪，' +
          '真的讓十噸的石像一步一步搖著前進。傳說沒有騙人，' +
          '只是它省略了那條繩子，還有拉繩子的所有人。',
    hook: '石像會走路——這件事是真的。問題是，後來沒有人再拉那條繩子了。',
    enemies: ['stonewalker', 'birdman', 'quarry'],
    boss: { name: '未完成的巨人', title: '還躺在採石場裡', sprite: 'unfinished' },
    reward: { gold: 760, sp: 3 }
  },
  {
    id: 'bermuda',
    no: 'VI',
    name: '百慕達漩渦',
    sub: '把儀表板弄壞的那片海',
    tier: 6,
    motif: 'storm_sea',
    palette: { sky: '#161B2E', far: '#222B4A', mid: '#313D66', near: '#0D1120', ground: '#1C2440', accent: '#8E6BE0', fog: '#4A5690' },
    lore: '飛機在那裡失聯，羅盤在那裡轉圈。統計學家算過，' +
          '那片海的失蹤率其實和別處差不多。但故事不需要統計，' +
          '故事只需要一個地方，讓所有說不清楚的事情有處可去。',
    hook: '指北針不是壞了，它只是指向一個不在這張地圖上的北方。',
    enemies: ['static', 'lostcrew', 'compass'],
    boss: { name: '第十九中隊', title: '一直在回航的路上', sprite: 'flight19' },
    reward: { gold: 980, sp: 4 }
  },
  {
    id: 'stonehenge',
    no: 'VII',
    name: '巨石陣：時鎖',
    sub: '一年只對準兩次的鎖',
    tier: 7,
    motif: 'henge',
    palette: { sky: '#2A1E2C', far: '#463049', mid: '#67456A', near: '#1B1220', ground: '#3A2A3E', accent: '#E0B23C', fog: '#7A5A80' },
    lore: '幾十噸的石頭從兩百公里外被搬來，排成一個圈，' +
          '對準夏至的日出與冬至的日落。它不是神殿也不是墳場，' +
          '它是一台鐘——一台只有在對的那一天，才會走一格的鐘。',
    hook: '所有謎團的最後一格，都指向同一個問題：你打算怎麼用剩下的時間。',
    enemies: ['sarsen', 'druid', 'heelstone'],
    boss: { name: '夏至', title: '一年只來一次，從不遲到', sprite: 'solstice' },
    reward: { gold: 1400, sp: 5 }
  }
];

/* 敵人原型：dmg / hp 為 tier 1 基準，實際依 tier 與 stage 放大 */
G.ENEMY_TYPES = {
  brick:      { name: '磚役',     hp: 34,  dmg: 5,  speed: 30, range: 22, size: 15, color: '#8A6A44', kind: 'melee' },
  scribe:     { name: '抄寫者',   hp: 26,  dmg: 7,  speed: 24, range: 150, size: 14, color: '#B89A5E', kind: 'ranged' },
  mason:      { name: '石工',     hp: 62,  dmg: 9,  speed: 20, range: 26, size: 19, color: '#6E5636', kind: 'tank' },
  jackal:     { name: '豺首衛',   hp: 40,  dmg: 8,  speed: 42, range: 22, size: 15, color: '#4A3A24', kind: 'melee' },
  scarab:     { name: '聖甲蟲群', hp: 22,  dmg: 6,  speed: 52, range: 18, size: 11, color: '#2E5A4A', kind: 'swarm' },
  guardian:   { name: '陵墓守衛', hp: 78,  dmg: 11, speed: 18, range: 28, size: 20, color: '#C09A44', kind: 'tank' },
  glyph:      { name: '走線者',   hp: 38,  dmg: 8,  speed: 36, range: 24, size: 15, color: '#A05A34', kind: 'melee' },
  condor:     { name: '禿鷲紋',   hp: 30,  dmg: 10, speed: 46, range: 170, size: 14, color: '#C87A44', kind: 'ranged' },
  linewalker: { name: '長線',     hp: 88,  dmg: 12, speed: 22, range: 30, size: 21, color: '#7E4E2E', kind: 'tank' },
  drowned:    { name: '溺者',     hp: 46,  dmg: 9,  speed: 30, range: 22, size: 16, color: '#2A6A78', kind: 'melee' },
  coral:      { name: '珊瑚兵',   hp: 34,  dmg: 11, speed: 26, range: 160, size: 15, color: '#3FB8C8', kind: 'ranged' },
  tidepriest: { name: '潮祭司',   hp: 70,  dmg: 14, speed: 20, range: 190, size: 18, color: '#1D7A8E', kind: 'caster' },
  stonewalker:{ name: '行走石像', hp: 120, dmg: 14, speed: 16, range: 28, size: 22, color: '#6A737A', kind: 'tank' },
  birdman:    { name: '鳥人',     hp: 42,  dmg: 12, speed: 50, range: 24, size: 15, color: '#8FA8B4', kind: 'melee' },
  quarry:     { name: '採石影',   hp: 56,  dmg: 13, speed: 30, range: 150, size: 16, color: '#4B545B', kind: 'ranged' },
  static:     { name: '雜訊',     hp: 44,  dmg: 13, speed: 44, range: 26, size: 14, color: '#6A5AA8', kind: 'melee' },
  lostcrew:   { name: '失蹤機組', hp: 72,  dmg: 15, speed: 28, range: 175, size: 17, color: '#8E6BE0', kind: 'ranged' },
  compass:    { name: '亂轉羅盤', hp: 96,  dmg: 17, speed: 22, range: 30, size: 20, color: '#4A5690', kind: 'tank' },
  sarsen:     { name: '砂岩巨柱', hp: 150, dmg: 18, speed: 15, range: 30, size: 24, color: '#67456A', kind: 'tank' },
  druid:      { name: '曆法祭司', hp: 80,  dmg: 20, speed: 26, range: 200, size: 17, color: '#E0B23C', kind: 'caster' },
  heelstone:  { name: '踵石',     hp: 64,  dmg: 16, speed: 40, range: 24, size: 16, color: '#A07AA4', kind: 'melee' }
};

/* 產生 21 個關卡 */
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
        name: ch.name + ' · ' + ['前庭', '內廊', '核心'][s],
        isBoss,
        // 關卡長度：越後面越長
        length: 2100 + ci * 260 + s * 180,
        towers: isBoss ? 3 : 2,
        scale: Math.pow(1.34, ci) * (1 + s * 0.18),
        waveGap: 9.5 - Math.min(3.5, ci * 0.4),
        reward: {
          gold: Math.round(ch.reward.gold * (0.55 + s * 0.35)),
          sp: s === 2 ? ch.reward.sp : 1,
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
