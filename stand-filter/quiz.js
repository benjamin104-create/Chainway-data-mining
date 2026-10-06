// 替身偵測器：五題選擇題 → 人格標籤 → 專屬替身
// 娛樂性的自我探索，不是心理診斷。

// 每隻替身的圖放在 stands/<id>.png 或 stands/<id>.jpg（白底或透明底都可以）
export const STANDS = {
  courage: { tag: '勇氣', name: 'CRIMSON VOW', zh: '赤之誓約', sfx: 'ド',
    tint: '#ff2e55', glow: '#ff9a6b', text: '#ff3d6e',
    grade: { pow: 'A', spd: 'A', rng: 'C', dur: 'B', pre: 'C', gro: 'A' },
    ability: '出拳前拳頭會先燃燒起來。本體越害怕，火燒得越旺。',
    note: '阿德勒說，勇氣不是不害怕，而是怕了還是往前一步。',
    try: '這週做一件你有點怕、但其實做得到的小事。' },
  wisdom: { tag: '智慧', name: 'BLUE CIPHER', zh: '蒼藍密碼', sfx: 'ゴ',
    tint: '#2a6bff', glow: '#7fe8ff', text: '#4fc3ff',
    grade: { pow: 'C', spd: 'B', rng: 'A', dur: 'B', pre: 'A', gro: 'B' },
    ability: '三隻眼睛能看穿事物背後的規則，一眼找出問題卡在哪裡。',
    note: '你最容易在「終於弄懂了」的那一刻進入心流。',
    try: '挑一個好奇很久的問題，花 30 分鐘把它查到底。' },
  guard: { tag: '守護', name: 'IVORY BASTION', zh: '象牙堡壘', sfx: 'ゴ',
    tint: '#ffc23d', glow: '#fff1b8', text: '#ffd23f',
    grade: { pow: 'B', spd: 'C', rng: 'C', dur: 'A', pre: 'B', gro: 'B' },
    ability: '交叉的雙臂能展開看不見的盾，擋下衝向重要之人的一切。',
    note: '你的力量來自「為了別人」。阿德勒稱這是社會情懷，是最健康的力量來源。',
    try: '守護別人之前，也記得問問自己：今天累不累？' },
  freedom: { tag: '自由', name: 'EMERALD GALE', zh: '翡翠疾風', sfx: 'ゴ',
    tint: '#12d688', glow: '#c6ffe4', text: '#2bd97c',
    grade: { pow: 'C', spd: 'A', rng: 'A', dur: 'C', pre: 'B', gro: 'A' },
    ability: '能把自己化成一陣風，去任何想去的地方，誰都抓不住。',
    note: '你要能自己決定怎麼做，才會全力以赴。自主，是你的心流開關。',
    try: '這週挑一件事，完全照你自己的方式完成。' },
  create: { tag: '創造', name: 'PRISM MUSE', zh: '稜鏡繆思', sfx: 'ゴ',
    tint: '#c03dff', glow: '#ffb3f0', text: '#ff4fd8',
    grade: { pow: 'B', spd: 'B', rng: 'B', dur: 'C', pre: 'A', gro: 'A' },
    ability: '手掌能把想像畫進現實，畫出來的東西會真的存在三秒。',
    note: '動手做東西做到忘了時間，就是你的心流。',
    try: '每天留 15 分鐘，做一件沒人要求、只為好玩的作品。' },
  bond: { tag: '羈絆', name: 'CORAL THREAD', zh: '珊瑚之線', sfx: 'ド',
    tint: '#ff7a2e', glow: '#ffd9b0', text: '#ff9a4d',
    grade: { pow: 'C', spd: 'C', rng: 'A', dur: 'A', pre: 'B', gro: 'A' },
    ability: '指尖的光線能把人和人的心連起來。連起來的人越多，它就越強。',
    note: '理解別人、也被別人理解，是你最大的能量。馬斯洛把它叫作歸屬需求。',
    try: '主動聯絡一個好久沒聊的朋友。' },
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
];

export const STAT_KEYS = [['pow', '破壞力'], ['spd', '速度'], ['rng', '射程距離'], ['dur', '持續力'], ['pre', '精密動作性'], ['gro', '成長性']];

export function computeStand(a) {
  const count = {};
  for (const q of QUESTIONS) if (q.options && a[q.id]) count[a[q.id]] = (count[a[q.id]] || 0) + 1;
  const best = Math.max(0, ...Object.values(count));
  // 同分時，以最後一題（最想要的超能力）為準，其次按題目順序
  const tied = Object.keys(count).filter((k) => count[k] === best);
  const id = tied.includes(a.q5) ? a.q5 : tied[0] || 'courage';
  return { id, owner: (a.name || '').trim() || '無名的本體', ...STANDS[id] };
}
