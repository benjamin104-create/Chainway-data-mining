// 替身偵測器：心流（你在哪裡忘了時間）× 阿德勒（你怎麼面對困難、怎麼和人連結）× 馬斯洛（你現在最缺什麼）
// 娛樂性的自我探索，不是心理診斷。

// 心流的領域 → 替身的本體
export const DOMAINS = {
  make: { name: 'GOLDEN WORKSHOP', zh: '黃金工坊', style: 'gold', bonus: { pre: 1 },
    ability: '碰觸到的東西可以「拆開再重組」成新的形狀。你把腦中畫面變成實物的那股手感，就是它的力量來源。' },
  move: { name: 'RUSH ENGINE', zh: '疾走引擎', style: 'crimson', bonus: { pow: 1, spd: 1 },
    ability: '全力衝刺的瞬間，周圍的時間會慢半拍，只有你看得清下一步。身體全開時的專注是它的燃料。' },
  know: { name: 'SILENT INDEX', zh: '無聲索引', style: 'jade', bonus: { pre: 1, rng: 1 },
    ability: '能看見事物背後的「結構線」，一眼找出問題卡在哪裡。越安靜，看得越遠。' },
  care: { name: 'HARBOR LIGHT', zh: '港灣之光', style: 'dawn', bonus: { dur: 1 },
    ability: '能把自己的能量分給身邊的人，讓對方重新站起來。被你照顧過的人，會在背後替你發光。' },
  show: { name: 'ECHO PARADE', zh: '回聲遊行', style: 'swap', bonus: { rng: 1 },
    ability: '說出口的話會變成看得見的聲波，直接打進聽的人心裡。舞台越大，聲波越強。' },
  plan: { name: 'CHESS CLOCK', zh: '棋盤時鐘', style: 'violet', bonus: { pre: 1 },
    ability: '能預讀五秒後的局面，把一團亂的狀況排成一盤棋。混亂越大，它看得越清楚。' },
};

// 你想把能力用在哪裡（阿德勒的「社會情懷」）→ 替身的型態
export const FORMS = {
  guard: { zh: '守護型', stat: { dur: 2, rng: -1 }, desc: '替身站在你正後方，替你和你在乎的人擋下衝擊。' },
  power: { zh: '近距離力量型', stat: { pow: 2, spd: 1, rng: -2 }, desc: '射程短，但貼身時爆發力驚人。' },
  remote: { zh: '遠距離操作型', stat: { rng: 3, pow: -1, pre: 1 }, desc: '能離開本體很遠，在你看不到的地方行動。' },
  swarm: { zh: '群體型', stat: { rng: 1, dur: 1, pow: -1 }, desc: '由好幾個小替身組成，一起行動時最強。' },
};

// 壓力下最想避免的事（阿德勒學派的「人格優先順序」）→ 優勢與弱點
export const PRIORITIES = {
  please: { zh: '取悅', strength: '很會讀空氣，讓身邊的人安心。',
    weak: '本體太在意別人的反應時，替身會變透明、出不了手。',
    why: '阿德勒說，我們常把「被喜歡」當成安全感，代價是把方向盤交給別人。',
    try: '這週做一件小事，只因為你想做，不先問別人覺得好不好。' },
  control: { zh: '掌控', strength: '可靠、有條理，危機時大家會看向你。',
    weak: '遇到計畫外的狀況，替身會僵住一秒。',
    why: '想掌控一切，是為了不再受傷；代價是很難放鬆，也很難讓別人靠近。',
    try: '這週留一段完全不安排的時間，看看會發生什麼。' },
  superior: { zh: '卓越', strength: '有企圖心、肯負責，能把事情做到最好。',
    weak: '本體覺得「還不夠好」時，替身會過熱。',
    why: '阿德勒認為追求卓越是人的動力，但一直跟「理想的自己」比，會讓人累垮。',
    try: '完成一件事後，先說一句「這樣就夠了」，再去看缺點。' },
  comfort: { zh: '舒適', strength: '好相處、懂得照顧自己，不容易被壓垮。',
    weak: '替身暖機很慢，壓力一大會先縮回去。',
    why: '避開麻煩的同時，也會一起避開讓你成長的挑戰。',
    try: '把想做的事切成「五分鐘就能開始」的第一步，今天只做那一步。' },
};

// 最近最缺的東西（馬斯洛需求層次）→ 覺醒條件
export const NEEDS = {
  safety: { zh: '安定感', title: '先把地基穩住',
    text: '馬斯洛提醒我們：睡不好、錢不夠、身體不舒服的時候，心力會先拿去擔心，很難進入心流。替身不是不強，是本體太累了。',
    try: '這週先處理一件讓你不安的小事：一筆帳、一次早睡、一次看醫生。' },
  belong: { zh: '歸屬感', title: '找到可以做自己的地方',
    text: '人需要被接納，才敢把真正的自己拿出來。替身也需要一個安全的地方練習現身。',
    try: '找一個人或一個小團體，分享你剛剛寫下的那段「忘了時間」的回憶。' },
  esteem: { zh: '被肯定', title: '讓自己被看見',
    text: '你已經有能力了，缺的是證據。被看見不是虛榮，是讓你相信自己的燃料。',
    try: '把你做過、最滿意的一件作品給三個人看，記下他們說的話。' },
  meaning: { zh: '意義感', title: '往真正想做的事走一步',
    text: '基本的需要大致顧好了，你開始問「這一切是為了什麼」。這正是替身準備進化的徵兆。',
    try: '每週留兩小時，給一件「沒人要求、但你自己想做」的事。' },
};

// 心流開關（讓你停不下來的條件）
export const KEYS = {
  challenge: { stat: { spd: 1, gro: 1 }, text: '你的心流開關是「難度剛好比能力高一點」。太簡單會無聊、太難會焦慮；每次只把難度往上調一小格。' },
  feedback: { stat: { pre: 1, dur: 1 }, text: '你的心流開關是「立刻看得到進度」。把大目標拆成每天都能打勾的小格子。' },
  people: { stat: { rng: 1, gro: 1 }, text: '你的心流開關是「跟人一起」。找夥伴一起做，或是做給某個特定的人看。' },
  autonomy: { stat: { dur: 1, pow: 1 }, text: '你的心流開關是「照自己的方式來」。爭取一件可以完全由你決定怎麼做的事。' },
};

export const QUESTIONS = [
  { id: 'name', kind: 'text', q: '先替替身的「本體」取個名字', hint: '可以是本名、綽號或代號，會印在你的替身照片上。', placeholder: '例如：小安', max: 12 },
  { id: 'memory', kind: 'text', q: '回想一次你做某件事做到「忘了時間」的經驗', hint: '不用是大事。可能是小時候拼樂高、熬夜改作品、和朋友聊到天亮。用一句話寫下來，替身就是從那一刻誕生的。', placeholder: '例如：國中時為了社團成發，一個人把整支舞編完', max: 60 },
  { id: 'domain', kind: 'pick', q: '那個時刻，你在做的事比較像哪一種？', options: [
    ['make', '動手做出一個東西', '畫畫、手作、寫程式、做菜'],
    ['move', '讓身體全力運轉', '運動、跳舞、比賽、爬山'],
    ['know', '弄懂一件事情', '研究、解謎、讀書、拆解問題'],
    ['care', '陪伴或照顧某個人', '聽人說話、帶小孩、幫朋友'],
    ['show', '把自己表達出來', '表演、說故事、拍影片、寫文章'],
    ['plan', '把一團亂整理好', '規劃活動、帶團隊、排策略'],
  ] },
  { id: 'key', kind: 'pick', q: '當時讓你停不下來的，最主要是什麼？', options: [
    ['challenge', '難度剛剛好，越做越想挑戰'],
    ['feedback', '每一步都看得到成果'],
    ['people', '有人一起，或是為了某個人'],
    ['autonomy', '完全照我自己的方式來'],
  ] },
  { id: 'stuck', kind: 'pick', q: '現在的你遇到卡關，通常會怎麼做？', options: [
    ['rush', '先衝再說，邊做邊修'],
    ['study', '先研究清楚再動手'],
    ['ask', '找人商量、一起想辦法'],
    ['wait', '先放著，等狀態好了再處理'],
  ] },
  { id: 'priority', kind: 'pick', q: '壓力很大的時候，你最想避免的是？', options: [
    ['please', '被拒絕，或讓別人失望'],
    ['control', '事情失控、被突發狀況打亂'],
    ['superior', '顯得沒用、做得不夠好'],
    ['comfort', '麻煩、衝突、讓自己不舒服'],
  ] },
  { id: 'form', kind: 'pick', q: '如果你真的有一股特別的力量，你最想用在？', options: [
    ['guard', '保護身邊重要的人'],
    ['power', '突破自己的極限'],
    ['remote', '看清楚別人看不到的事'],
    ['swarm', '把一群人聚在一起'],
  ] },
  { id: 'need', kind: 'pick', q: '老實說，最近的你最缺的是什麼？', options: [
    ['safety', '安定感', '錢、身體、睡眠、生活節奏'],
    ['belong', '歸屬感', '被接納、有夥伴、不孤單'],
    ['esteem', '被肯定', '成就、被看見、被認可'],
    ['meaning', '意義感', '想做真正想做的事'],
  ] },
];

const STUCK = { rush: { pow: 1, spd: 1 }, study: { pre: 2 }, ask: { rng: 1, gro: 1 }, wait: { dur: 1 } };
export const STAT_KEYS = [['pow', '破壞力'], ['spd', '速度'], ['rng', '射程距離'], ['dur', '持續力'], ['pre', '精密動作性'], ['gro', '成長性']];

export function computeStand(a) {
  const d = DOMAINS[a.domain] || DOMAINS.make, f = FORMS[a.form] || FORMS.guard;
  const s = { pow: 2, spd: 2, rng: 2, dur: 2, pre: 2, gro: 3 };
  for (const add of [d.bonus, f.stat, KEYS[a.key]?.stat, STUCK[a.stuck], a.need === 'meaning' ? { gro: 1 } : null]) {
    for (const k in add || {}) s[k] += add[k];
  }
  s.gro = Math.max(s.gro, 3); // 成長性至少 B：替身會跟著本體長大
  const grade = {};
  for (const [k] of STAT_KEYS) grade[k] = 'EDCBA'[Math.max(0, Math.min(4, s[k]))];
  return {
    owner: (a.name || '').trim() || '無名的本體',
    memory: (a.memory || '').trim(),
    domain: d, form: f, formId: a.form || 'guard',
    priority: PRIORITIES[a.priority] || PRIORITIES.comfort,
    need: NEEDS[a.need] || NEEDS.meaning,
    key: KEYS[a.key] || KEYS.challenge,
    grade,
  };
}
