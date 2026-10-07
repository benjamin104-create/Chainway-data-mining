// 替身偵測器：五題選擇題 → 人格標籤 → 選男神或女神 → 專屬替身
// 娛樂性的自我探索，不是心理診斷。

// 六種人格標籤：說明與練習屬於標籤，每個標籤有一位男神、一位女神
export const TAGS = {
  courage: { tag: '勇氣', sfx: 'ド',
    note: '阿德勒說，勇氣不是不害怕，而是怕了還是往前一步。',
    try: '這週做一件你有點怕、但其實做得到的小事。' },
  wisdom: { tag: '智慧', sfx: 'ゴ',
    note: '你最容易在「終於弄懂了」的那一刻進入心流。',
    try: '挑一個好奇很久的問題，花 30 分鐘把它查到底。' },
  guard: { tag: '守護', sfx: 'ゴ',
    note: '你的力量來自「為了別人」。阿德勒稱這是社會情懷，是最健康的力量來源。',
    try: '守護別人之前，也記得問問自己：今天累不累？' },
  freedom: { tag: '自由', sfx: 'ゴ',
    note: '你要能自己決定怎麼做，才會全力以赴。自主，是你的心流開關。',
    try: '這週挑一件事，完全照你自己的方式完成。' },
  create: { tag: '創造', sfx: 'ゴ',
    note: '動手做東西做到忘了時間，就是你的心流。',
    try: '每天留 15 分鐘，做一件沒人要求、只為好玩的作品。' },
  bond: { tag: '羈絆', sfx: 'ド',
    note: '理解別人、也被別人理解，是你最大的能量。馬斯洛把它叫作歸屬需求。',
    try: '主動聯絡一個好久沒聊的朋友。' },
};

// 替身以希臘羅馬神話的神祇為原型（神話本身沒有版權），圖是重新繪製的原創圖。
// 每位替身的圖放在 stands/<id>.png 或 stands/<id>.jpg（白底或透明底都可以）
export const STANDS = {
  courage: { tagId: 'courage', sex: 'm', name: 'MARS', zh: '戰神瑪爾斯',
    tint: '#ff2e55', glow: '#ff9a6b', text: '#ff3d6e',
    grade: { pow: 'A', spd: 'A', rng: 'C', dur: 'B', pre: 'C', gro: 'A' },
    ability: '羅馬的戰神。握緊拳頭的瞬間，本體和身邊的人都會一起忘記恐懼。' },
  nike: { tagId: 'courage', sex: 'f', name: 'NIKE', zh: '勝利女神妮姬',
    tint: '#ff2e55', glow: '#ffc27a', text: '#ff3d6e',
    grade: { pow: 'A', spd: 'A', rng: 'B', dur: 'B', pre: 'C', gro: 'A' },
    ability: '展開雙翼的勝利女神。本體舉起拳頭的那一刻，就已經贏了一半。' },
  wisdom: { tagId: 'wisdom', sex: 'f', name: 'ATHENA', zh: '智慧女神雅典娜',
    tint: '#2a6bff', glow: '#7fe8ff', text: '#4fc3ff',
    grade: { pow: 'C', spd: 'B', rng: 'A', dur: 'B', pre: 'A', gro: 'B' },
    ability: '肩上的貓頭鷹能看穿事物背後的規則。女神一點太陽穴，問題卡在哪裡就一清二楚。' },
  apollo: { tagId: 'wisdom', sex: 'm', name: 'APOLLO', zh: '光明之神阿波羅',
    tint: '#2a6bff', glow: '#fff1a0', text: '#4fc3ff',
    grade: { pow: 'B', spd: 'B', rng: 'A', dur: 'B', pre: 'A', gro: 'B' },
    ability: '光明與預言之神。豎琴一響，本體眼前的迷霧就會被陽光照散。' },
  guard: { tagId: 'guard', sex: 'f', name: 'ARTEMIS', zh: '月之女神阿提米絲',
    tint: '#ffc23d', glow: '#fff1b8', text: '#ffd23f',
    grade: { pow: 'B', spd: 'C', rng: 'C', dur: 'A', pre: 'B', gro: 'B' },
    ability: '孩子與弱小者的守護神。月光之弓射出的箭，會擋在每個你想保護的人前面。' },
  zeus: { tagId: 'guard', sex: 'm', name: 'ZEUS', zh: '眾神之王宙斯',
    tint: '#ffc23d', glow: '#fff6c0', text: '#ffd23f',
    grade: { pow: 'A', spd: 'B', rng: 'B', dur: 'A', pre: 'C', gro: 'B' },
    ability: '奧林帕斯的眾神之王。雷霆落下的範圍，就是本體要守護的地方。' },
  freedom: { tagId: 'freedom', sex: 'm', name: 'HERMES', zh: '旅神赫密士',
    tint: '#12d688', glow: '#c6ffe4', text: '#2bd97c',
    grade: { pow: 'C', spd: 'A', rng: 'A', dur: 'C', pre: 'B', gro: 'A' },
    ability: '腳踏羽翼的眾神信使。能化作一陣風，帶著本體去任何想去的地方，誰都抓不住。' },
  iris: { tagId: 'freedom', sex: 'f', name: 'IRIS', zh: '彩虹女神伊麗絲',
    tint: '#12d688', glow: '#e0fff0', text: '#2bd97c',
    grade: { pow: 'C', spd: 'A', rng: 'A', dur: 'B', pre: 'B', gro: 'A' },
    ability: '踩著彩虹往返天地的女神。彩虹架到哪裡，本體就能走到哪裡。' },
  create: { tagId: 'create', sex: 'f', name: 'VENUS', zh: '美神維納斯',
    tint: '#c03dff', glow: '#ffb3f0', text: '#ff4fd8',
    grade: { pow: 'B', spd: 'B', rng: 'B', dur: 'C', pre: 'A', gro: 'A' },
    ability: '從海中誕生的美之女神。手中灑出的玫瑰花瓣落在哪裡，哪裡就會開出新的美好。' },
  hephaestus: { tagId: 'create', sex: 'm', name: 'HEPHAESTUS', zh: '鍛造之神赫菲斯托斯',
    tint: '#c03dff', glow: '#ffc08a', text: '#ff4fd8',
    grade: { pow: 'A', spd: 'C', rng: 'C', dur: 'A', pre: 'A', gro: 'A' },
    ability: '眾神的工匠。鐵鎚每敲一下，本體腦中的想法就變成看得見、摸得到的東西。' },
  bond: { tagId: 'bond', sex: 'm', name: 'CUPID', zh: '愛神丘比特',
    tint: '#ff7a2e', glow: '#ffd9b0', text: '#ff9a4d',
    grade: { pow: 'C', spd: 'C', rng: 'A', dur: 'A', pre: 'B', gro: 'A' },
    ability: '金色的愛心之箭能把人和人的心連起來。連起來的人越多，它就越強。' },
  hera: { tagId: 'bond', sex: 'f', name: 'HERA', zh: '天后希拉',
    tint: '#ff7a2e', glow: '#ffe0c0', text: '#ff9a4d',
    grade: { pow: 'B', spd: 'C', rng: 'A', dur: 'A', pre: 'B', gro: 'B' },
    ability: '守護家人與約定的天后。被她牽起的關係，不會輕易斷掉。' },
};

export const QUESTIONS = [
  { id: 'name', kind: 'text', q: '先替替身的「本體」取個名字', hint: '會印在你的替身照片上。', placeholder: '例如：小安', max: 12 },
  { id: 'q1', q: '朋友遇到困難，你的第一個反應是？', options: [
    ['courage', '先衝過去幫忙再說'], ['wisdom', '先搞清楚到底發生什麼事'], ['guard', '站在他旁邊，誰都別想欺負他'],
    ['freedom', '帶他出去走走、換個環境'], ['create', '想一個別人想不到的解法'], ['bond', '陪他聊到他心情好一點'] ] },
  { id: 'q2', q: '放假一整天，你最想做什麼？', options: [
    ['create', '畫畫、做手作、拍影片'], ['courage', '挑戰一件沒做過的事'], ['bond', '揪朋友聚一聚'],
    ['wisdom', '看書、看紀錄片、研究東西'], ['freedom', '一個人說走就走'], ['guard', '陪家人或照顧寵物'] ] },
  { id: 'q3', q: '別人最常怎麼形容你？', options: [
    ['guard', '很可靠'], ['bond', '很溫暖'], ['wisdom', '很聰明、很冷靜'],
    ['create', '很有想法'], ['courage', '很敢'], ['freedom', '很隨性'] ] },
  { id: 'q4', q: '你最受不了什麼？', options: [
    ['freedom', '被綁住、被管太多'], ['guard', '有人欺負弱小'], ['create', '每天都一模一樣'],
    ['courage', '還沒試就放棄'], ['bond', '大家冷冰冰、各做各的'], ['wisdom', '沒有道理的規定'] ] },
  { id: 'q5', q: '如果能有一種超能力，你選？', options: [
    ['wisdom', '看穿一切的眼睛'], ['freedom', '瞬間移動'], ['courage', '不會受傷的身體'],
    ['bond', '讀懂別人的心'], ['guard', '擋下所有攻擊的盾'], ['create', '想到什麼就能變出什麼'] ] },
  { id: 'sex', kind: 'choice', q: '最後，你想召喚哪一種守護神？', options: [
    ['f', '女神'], ['m', '男神'], ['any', '交給命運決定'] ] },
];

export const STAT_KEYS = [['pow', '破壞力'], ['spd', '速度'], ['rng', '射程距離'], ['dur', '持續力'], ['pre', '精密動作性'], ['gro', '成長性']];

export function standById(id, owner = '') {
  const s = STANDS[id];
  return { id, owner, ...TAGS[s.tagId], ...s };
}

export function computeStand(a) {
  const count = {};
  for (const q of QUESTIONS) if (/^q\d$/.test(q.id) && a[q.id]) count[a[q.id]] = (count[a[q.id]] || 0) + 1;
  const best = Math.max(0, ...Object.values(count));
  // 同分時，以第五題（最想要的超能力）為準，其次按題目順序
  const tied = Object.keys(count).filter((k) => count[k] === best);
  const tagId = tied.includes(a.q5) ? a.q5 : tied[0] || 'courage';
  const pair = Object.keys(STANDS).filter((id) => STANDS[id].tagId === tagId);
  let sex = a.sex;
  if (sex !== 'm' && sex !== 'f') {
    // 「交給命運」：用答案算出固定的結果，重看時不會變
    let h = 0; for (const ch of JSON.stringify(a)) h = (h * 31 + ch.charCodeAt(0)) | 0;
    sex = h & 1 ? 'm' : 'f';
  }
  const id = pair.find((k) => STANDS[k].sex === sex) || pair[0];
  return standById(id, (a.name || '').trim() || '無名的本體');
}
