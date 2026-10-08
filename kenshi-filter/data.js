// 大正劍士・心之型：十題情境測驗 → 六種「社會姿態」→ 對應的原創劍士角色、服裝、武器、招式
// 娛樂性的自我探索，不是心理診斷。
//
// 角色全部是原創：只借用「大正浪漫」「和風劍士」這種共通題材與日本傳統紋樣（紋樣本身沒有版權），
// 沒有使用任何漫畫或動畫原作的角色、名字、服裝花色或招式名。

// ── 六種社會姿態（阿德勒：人怎麼面對「人際關係」這個課題） ──────────
// healthy：這個姿態健康的樣子　shadow：用力過頭時的樣子　try：這週可以做的一個小練習
export const TYPES = {
  devote: {
    name: '犧牲奉獻型', short: '奉獻', en: 'THE GIVER',
    line: '只要大家平安，我累一點沒關係。',
    healthy: '你很自然就會看見別人的需要，願意為團體付出。阿德勒把這叫作「社會情懷」——覺得自己和別人是同一國的，這是最健康的力量來源。',
    shadow: '用力過頭時，你會把自己排到最後，甚至要靠「被需要」才覺得自己有價值。別人沒開口，你也先扛了，最後累倒的是自己。',
    adler: '阿德勒說「課題分離」：先分清楚這是誰的課題。幫忙是好事，但替別人做完他自己該做的事，反而拿走了他長大的機會。',
    maslow: '你正在滿足「歸屬與愛」，下一步是「尊重自己」：你的需要也算數。',
    try: '這週練習說一次「這次我不行，下次再幫你」，然後觀察：天並沒有塌下來。',
  },
  detach: {
    name: '疏離獨行型', short: '獨行', en: 'THE LONE BLADE',
    line: '一個人比較快，也比較不會受傷。',
    healthy: '你獨立、界線清楚、能長時間專注在一件事上——這正是最容易進入「心流」的體質。你不需要靠熱鬧來證明自己。',
    shadow: '用力過頭時，「一個人比較好」會變成一道牆：不是不想靠近，而是怕靠近之後會失望、會被看穿。',
    adler: '阿德勒說：「人的煩惱，全都是人際關係的煩惱。」反過來說，人的喜悅也幾乎都來自人際關係。保持距離可以保護你，但也會擋住這一半。',
    maslow: '你很重視「安全」——先確保不會受傷。等安全感夠了，可以試著往「歸屬」踏一小步。',
    try: '這週挑一個你覺得還算安全的人，回訊息時多寫一句真心話（不用多，一句就好）。',
  },
  recognize: {
    name: '渴求認同型', short: '認同', en: 'THE SEEN ONE',
    line: '我希望我的努力，有人看得見。',
    healthy: '你有熱情、有表現欲，想把事情做好、也想讓人知道你做得到。這股想被看見的力量，常常讓你比別人更拚。',
    shadow: '用力過頭時，別人的一句評價就能決定你一整天的心情——方向盤交到了別人手上。沒人按讚，就懷疑是不是自己不夠好。',
    adler: '阿德勒不鼓勵「稱讚」，而是「感謝」：稱讚是上對下的評價，感謝是平等的。你不需要先被評為合格，才有資格待在這裡。',
    maslow: '你正在追求「尊重需求」。真正穩的尊重，來自你對自己的肯定，而不是按讚數。',
    try: '這週做一件好事，但不告訴任何人。做完之後問自己：我還是覺得值得嗎？',
  },
  compete: {
    name: '好勝爭先型', short: '爭先', en: 'THE CHALLENGER',
    line: '下一次，我一定贏。',
    healthy: '你不服輸、追求進步，有目標就會全力衝刺。阿德勒說每個人都有「追求優越」的動力，你把它燒得最旺。',
    shadow: '用力過頭時，身邊的人都變成了對手；贏了不敢停，輸了就全盤否定自己。其實你在跟一個想像中「更厲害的人」比賽。',
    adler: '阿德勒說：健康的追求優越，是「和理想的自己比」，不是和別人比。人與人之間是平等的「橫向關係」，不是排名。',
    maslow: '你在「尊重」這一層衝得很猛。再往上是「自我實現」：做這件事，是因為我想，不是因為要贏。',
    try: '這週替一個你暗暗當成對手的人，真心說一句「恭喜」。',
  },
  duty: {
    name: '扛責守序型', short: '扛責', en: 'THE PILLAR',
    line: '交給我，我會負責到底。',
    healthy: '你可靠、有原則，大家遇到事情第一個想到你。你讓團體有了可以站穩的地方。',
    shadow: '用力過頭時，你什麼都攬在身上，不允許自己出錯，也很難把事情交出去——因為「出錯」好像就等於「我不夠好」。',
    adler: '阿德勒說「不完美的勇氣」：敢承認自己做不到、敢讓別人看見你的不完美，才是真正的強。',
    maslow: '你很重視「安全」與「秩序」，替大家守住地基。也記得留一點空間給自己的「想要」，不只是「應該」。',
    try: '這週把一件你本來會自己做完的事，交給別人做，而且不去修改他的成果。',
  },
  harmony: {
    name: '和合共感型', short: '共感', en: 'THE BRIDGE',
    line: '大家好好的，比誰對誰錯重要。',
    healthy: '你讀得懂氣氛、聽得出別人沒說出口的話，是團體裡的黏著劑。有你在，衝突比較容易軟著陸。',
    shadow: '用力過頭時，你會為了不起衝突把自己的意見吞回去，久了連自己也不知道自己真正想要什麼。',
    adler: '阿德勒說「被討厭的勇氣」：別人要怎麼看你，是別人的課題。你可以溫柔，同時也有自己的立場。',
    maslow: '你在「歸屬與愛」這一層很豐富。下一步是「尊重」：讓別人認識真正的你，而不只是好相處的你。',
    try: '這週在一個小決定上（吃什麼、去哪裡），第一個說出「我想要……」。',
  },
};

// ── 原創劍士角色：服裝、武器、招式 ──────────────────────
// pattern：和風紋樣（七寶、立涌、矢絣、稻妻、龜甲、青海波）
// weapon.kind：katana 打刀／long 細身長刀／twin 雙短刀／odachi 大太刀／naginata 薙刀
// move.pose：招式的目標姿勢，座標以「兩髖中點」為原點、軀幹長度為 1、y 往下（畫面方向，已鏡像）
//   s=肩 e=肘 w=腕 h=髖 k=膝 a=踝，l=畫面左、r=畫面右，n=鼻子
//   blade：招式完成時刀的方向（畫面座標）　hand：持刀的手（r／l／both）
export const CHARACTERS = {
  devote: {
    title: '燈之劍士', name: '灯里', kana: 'AKARI', element: '燈火',
    haori: '#d8432f', haori2: '#f6c453', inner: '#2b1d1a', hakama: '#3a2a26', trim: '#f6c453',
    pattern: 'shippo', tint: '#ff8a3d', glow: '#ffd27a', fx: 'flame',
    weapon: { kind: 'katana', len: 1.75, tsuba: '#f6c453', grip: '#5a1a12' },
    move: {
      name: '燈之型・守火上段', hint: '雙手把刀高舉過頭，站穩。',
      blade: [0, -1], hand: 'both',
      pose: { n: [0, -1.35], ls: [-.36, -1], rs: [.36, -1], le: [-.42, -1.5], re: [.42, -1.5], lw: [-.08, -1.85], rw: [.08, -1.85],
        lh: [-.2, 0], rh: [.2, 0], lk: [-.28, .85], rk: [.28, .85], la: [-.32, 1.7], ra: [.32, 1.7] },
    },
  },
  detach: {
    title: '月之劍士', name: '朔', kana: 'SAKU', element: '新月',
    haori: '#2f3e63', haori2: '#c9d3e6', inner: '#14161d', hakama: '#20232c', trim: '#c9d3e6',
    pattern: 'tatewaku', tint: '#9fc4ff', glow: '#e8f0ff', fx: 'moon',
    weapon: { kind: 'long', len: 2.05, tsuba: '#c9d3e6', grip: '#1c2236' },
    move: {
      name: '月之型・側身居合', hint: '身體轉側面，刀往側邊水平揮出，另一手收在腰間。',
      blade: [1, 0], hand: 'r',
      pose: { n: [.18, -1.33], ls: [-.06, -1], rs: [.1, -1], le: [-.24, -.62], re: [.55, -.96], lw: [-.08, -.33], rw: [1.0, -.93],
        lh: [-.06, 0], rh: [.08, 0], lk: [-.32, .75], rk: [.45, .7], la: [-.58, 1.55], ra: [.62, 1.5] },
    },
  },
  recognize: {
    title: '陽之劍士', name: '晴', kana: 'HARE', element: '朝陽',
    haori: '#f2a516', haori2: '#b3261e', inner: '#2a1c10', hakama: '#7a1f17', trim: '#fff1b8',
    pattern: 'yagasuri', tint: '#ffd23f', glow: '#fff6c0', fx: 'sun',
    weapon: { kind: 'katana', len: 1.8, tsuba: '#ffd23f', grip: '#7a1f17' },
    move: {
      name: '陽之型・昇天一閃', hint: '持刀的手往斜上方伸直，另一手叉腰，抬頭。',
      blade: [.6, -.8], hand: 'r',
      pose: { n: [.03, -1.37], ls: [-.36, -1], rs: [.36, -1], le: [-.62, -.58], re: [.66, -1.45], lw: [-.32, -.18], rw: [.92, -1.86],
        lh: [-.2, 0], rh: [.2, 0], lk: [-.26, .86], rk: [.3, .85], la: [-.3, 1.72], ra: [.38, 1.7] },
    },
  },
  compete: {
    title: '雷之劍士', name: '迅', kana: 'JIN', element: '迅雷',
    haori: '#5b2bbf', haori2: '#f4e04d', inner: '#16121f', hakama: '#241b38', trim: '#f4e04d',
    pattern: 'inazuma', tint: '#c38bff', glow: '#fff5a8', fx: 'thunder',
    weapon: { kind: 'twin', len: 1.05, tsuba: '#f4e04d', grip: '#241b38' },
    move: {
      name: '雷之型・疾走雙斬', hint: '側身弓步往前衝，一手往前、一手的刀拖在身後。',
      blade: [-.9, .45], hand: 'both',
      pose: { n: [.55, -1.2], ls: [.26, -.95], rs: [.36, -.95], le: [.7, -.75], re: [0, -.56], lw: [1.0, -.6], rw: [-.4, -.3],
        lh: [-.05, 0], rh: [.05, 0], lk: [-.42, .6], rk: [.6, .55], la: [-.95, 1.15], ra: [.66, 1.3] },
    },
  },
  duty: {
    title: '岩之劍士', name: '巌', kana: 'IWAO', element: '磐岩',
    haori: '#6b5a45', haori2: '#d9c9a8', inner: '#1d1a16', hakama: '#3d342a', trim: '#d9c9a8',
    pattern: 'kikko', tint: '#d9b26b', glow: '#fff0cc', fx: 'rock',
    weapon: { kind: 'odachi', len: 2.2, tsuba: '#8a7a60', grip: '#2b241c' },
    move: {
      name: '岩之型・不動構', hint: '雙腳打開站穩，雙手握刀，刀身直立在胸前。',
      blade: [0, -1], hand: 'both',
      pose: { n: [0, -1.35], ls: [-.38, -1], rs: [.38, -1], le: [-.42, -.56], re: [.42, -.56], lw: [-.05, -.48], rw: [.05, -.48],
        lh: [-.21, 0], rh: [.21, 0], lk: [-.5, .8], rk: [.5, .8], la: [-.66, 1.6], ra: [.66, 1.6] },
    },
  },
  harmony: {
    title: '潮之劍士', name: '汐', kana: 'SHIO', element: '潮汐',
    haori: '#1f8f8a', haori2: '#e9f7f2', inner: '#10201f', hakama: '#184845', trim: '#e9f7f2',
    pattern: 'seigaiha', tint: '#5fe0d0', glow: '#e0fffa', fx: 'wave',
    weapon: { kind: 'naginata', len: 2.4, tsuba: '#e9f7f2', grip: '#5b3a22' },
    move: {
      name: '潮之型・迴流', hint: '兩手大大張開像在轉圈，持刀的手往斜下方伸出。',
      blade: [.8, .6], hand: 'r',
      pose: { n: [-.04, -1.35], ls: [-.36, -1], rs: [.36, -1], le: [-.76, -1.06], re: [.76, -.9], lw: [-1.16, -1.16], rw: [1.16, -.64],
        lh: [-.2, 0], rh: [.2, 0], lk: [-.25, .85], rk: [.32, .8], la: [-.3, 1.7], ra: [.5, 1.6] },
    },
  },
};

export const ORDER = ['devote', 'detach', 'recognize', 'compete', 'duty', 'harmony'];

// ── 十題情境題：每個選項替一或兩種姿態加分 ──────────────
export const QUESTIONS = [
  { q: '出任務前一晚，隊長說明天有一段最危險的路，要有人打頭陣。你：',
    a: [
      ['「我去。」大家平安比較重要。', { devote: 2 }],
      ['我自己先去探路就好，不用人跟。', { detach: 2, compete: 1 }],
      ['我想去，也希望隊長看到我做得到。', { recognize: 2 }],
      ['先把路線、補給、撤退方案排好，誰去都要能活著回來。', { duty: 2 }],
    ] },
  { q: '修練場上，同期的劍士進步得比你快。你心裡第一個念頭：',
    a: [
      ['不行，今晚加練，下次一定超過他。', { compete: 2 }],
      ['去問他怎麼練的，乾脆一起練。', { harmony: 2 }],
      ['有點慌：師父會不會覺得我比較差？', { recognize: 2 }],
      ['他是他，我照我自己的步調。', { detach: 2 }],
    ] },
  { q: '同伴受了傷，任務還沒完成。你：',
    a: [
      ['把他揹起來，剩下的我一個人扛。', { devote: 2, duty: 1 }],
      ['先穩住大家的情緒，讓每個人知道接下來怎麼做。', { harmony: 2, duty: 1 }],
      ['冷靜判斷：最有效率的做法是我單獨去完成。', { detach: 2 }],
      ['這正是證明我實力的時候。', { compete: 2 }],
    ] },
  { q: '慶功宴上，大家都在稱讚另一位隊員的功勞（其實你也出了不少力）。你：',
    a: [
      ['跟著一起稱讚，氣氛好最重要。', { harmony: 2 }],
      ['心裡有點酸，好希望也有人提到我。', { recognize: 2 }],
      ['無所謂，我早就溜到外面看月亮了。', { detach: 2 }],
      ['下次我要立一個大到沒人能忽略的功。', { compete: 2 }],
    ] },
  { q: '難得的休假日，你最想怎麼過？',
    a: [
      ['回去幫家人或村子裡的人做點事。', { devote: 2 }],
      ['一個人去山裡磨刀、練劍，誰都別來吵。', { detach: 2 }],
      ['跟隊友一起吃飯聊天，誰都不要落單。', { harmony: 2 }],
      ['整理裝備，順便把下個月的任務先排好。', { duty: 2 }],
    ] },
  { q: '隊長交代的命令，你覺得有問題。你：',
    a: [
      ['先照做，出了事我來扛，事後再提。', { duty: 2 }],
      ['私下找隊長，用不傷和氣的方式說。', { harmony: 2 }],
      ['直接提出更好的方案，用結果說話。', { compete: 2 }],
      ['想說，但怕被討厭，最後還是沒開口。', { recognize: 2 }],
    ] },
  { q: '你最怕聽到哪一句話？',
    a: [
      ['「有沒有你都一樣。」', { devote: 2 }],
      ['「你輸了。」', { compete: 2 }],
      ['「根本沒人注意到你。」', { recognize: 2 }],
      ['「都是因為你沒做好。」', { duty: 2 }],
    ] },
  { q: '你最想聽到哪一句話？',
    a: [
      ['「有你在，真好。」', { harmony: 2, devote: 1 }],
      ['「交給你，我很放心。」', { duty: 2 }],
      ['「你真的好厲害！」', { recognize: 2 }],
      ['「你想怎麼做，就怎麼做。」', { detach: 2 }],
    ] },
  { q: '一個不太熟的新隊員一直跟著你，想跟你學劍。你：',
    a: [
      ['全部教給他，他變強就是我最大的回報。', { devote: 2 }],
      ['有點困擾，我習慣一個人練。', { detach: 2 }],
      ['有點開心，被崇拜的感覺還不錯。', { recognize: 2 }],
      ['可以啊，但要跟得上我的速度。', { compete: 2 }],
    ] },
  { q: '最後一戰前，你在刀柄上刻下一個字：',
    a: [
      ['捨', { devote: 2 }],
      ['獨', { detach: 2 }],
      ['光', { recognize: 2 }],
      ['勝', { compete: 2 }],
      ['守', { duty: 2 }],
      ['和', { harmony: 2 }],
    ] },
];

// 每種姿態可能拿到的最高分（題目分配不平均，用它換算成百分比才公平）
const MAX = Object.fromEntries(ORDER.map((t) => [t,
  QUESTIONS.reduce((s, { a }) => s + Math.max(0, ...a.map(([, w]) => w[t] || 0)), 0)]));

// answers：每題選的選項索引 → 每種姿態 0～100 的分數
export function score(answers) {
  const raw = Object.fromEntries(ORDER.map((t) => [t, 0]));
  answers.forEach((i, qi) => {
    const w = QUESTIONS[qi]?.a[i]?.[1] || {};
    for (const t in w) raw[t] += w[t];
  });
  return Object.fromEntries(ORDER.map((t) => [t, Math.round(100 * raw[t] / MAX[t])]));
}

// 最高分的姿態；同分時看最後一題（刻在刀柄上的字）選了誰
export function topType(scores, answers) {
  const best = Math.max(...ORDER.map((t) => scores[t]));
  const tied = ORDER.filter((t) => scores[t] === best);
  if (tied.length === 1) return tied[0];
  const last = QUESTIONS.at(-1).a[answers.at(-1)]?.[1] || {};
  return tied.find((t) => last[t]) || tied[0];
}

// ── 朋友比一比：分數壓成網址上的六個字 ─────────────────
export const encodeScores = (s) => ORDER.map((t) => Math.min(35, Math.round(s[t] / 100 * 35)).toString(36)).join('');
export function decodeScores(code) {
  if (!/^[0-9a-z]{6}$/i.test(code || '')) return null;
  return Object.fromEntries(ORDER.map((t, i) => [t, Math.round(parseInt(code[i], 36) / 35 * 100)]));
}
// 兩個人的相似度：分數向量去掉平均後的相關係數，換成 0～100%
export function similarity(a, b) {
  const va = ORDER.map((t) => a[t]), vb = ORDER.map((t) => b[t]);
  const ma = va.reduce((x, y) => x + y) / 6, mb = vb.reduce((x, y) => x + y) / 6;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < 6; i++) { const x = va[i] - ma, y = vb[i] - mb; num += x * y; da += x * x; db += y * y; }
  const r = da && db ? num / Math.sqrt(da * db) : 1;
  return Math.round((r + 1) * 50);
}

// 兩種姿態湊在一起時的關係（沒列到的組合用通用句）
const PAIRS = {
  'devote|detach': '一個習慣靠近、一個習慣保持距離。奉獻的那位別追太緊，獨行的那位偶爾回個頭，你們會很互補。',
  'devote|recognize': '一個想付出、一個想被看見——很容易一拍即合，但小心變成「一個一直給，一個一直要」。',
  'devote|compete': '衝在前面的和守在後面的。記得：贏了的功勞，有一半是後面那個人的。',
  'devote|duty': '兩個都很會扛。一起出任務很穩，但也最容易一起累倒——互相提醒對方休息。',
  'devote|harmony': '最溫柔的組合。你們都很照顧別人，唯一要練習的是：說出自己真的想要什麼。',
  'detach|recognize': '一個不在乎別人怎麼看、一個很在乎。你們可以從對方身上學到自己最缺的那一塊。',
  'detach|compete': '兩個都習慣自己來。各自練、偶爾切磋，會是最好的勁敵。',
  'detach|duty': '安靜又可靠的組合。話不多，但事情交給你們就會完成。',
  'detach|harmony': '共感的那位能讀懂獨行者沒說出口的話；獨行的那位能讓共感者安靜下來。',
  'recognize|compete': '火力全開的組合，互相激勵會進步飛快，但別讓比較變成傷人。',
  'recognize|duty': '一個想發光、一個想把事情做對。你負責被看見，他負責讓你站得穩。',
  'recognize|harmony': '很會炒熱氣氛的組合。試著真心肯定對方「這個人」，不只是他做了什麼。',
  'compete|duty': '一個往前衝、一個守住後方。目標一致時是最強的前鋒加後衛。',
  'compete|harmony': '衝突時，共感的那位是緩衝；猶豫時，好勝的那位推大家一把。',
  'duty|harmony': '團體的地基與黏著劑。你們在，大家就安心——記得也替自己留點力氣。',
};
export function pairNote(a, b) {
  if (a === b) return `你們是同一型（${TYPES[a].name}）：很懂彼此，也很容易一起卡在同一個地方——可以互相提醒對方的「小練習」。`;
  return PAIRS[`${a}|${b}`] || PAIRS[`${b}|${a}`] || '';
}
