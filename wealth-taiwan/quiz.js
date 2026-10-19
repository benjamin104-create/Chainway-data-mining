// 財神偵測器・台灣篇：參拜之旅十題情境測驗 → 財富性格 → 細水長流或一次到位 → 眷顧你的神明
// 文化娛樂與自我覺察，不是宗教儀式，也不是投資建議。

// 六種財富性格：說明與練習屬於性格，每種性格由兩尊神明眷顧（A 細水長流、B 一次到位）
export const TAGS = {
  shou: { tag: '守財',
    note: '你的財富來自耐心和穩定。對你來說，最強的招財術是「時間」和「複利」。',
    try: '這週設一個自動轉帳，每個月固定先存下收入的一成。' },
  xin: { tag: '信用',
    note: '你的財富建立在別人對你的信任上。口碑，就是你最值錢的資產。',
    try: '把手上答應別人的事列出來，這週先完成最久的那一件。' },
  zhi: { tag: '智慧',
    note: '你的財富來自腦袋和手藝。投資自己，是你報酬率最高的投資。',
    try: '挑一項能讓你加薪或接案的技能，這週先花兩小時入門。' },
  chuang: { tag: '開創',
    note: '你的財富要靠自己闖出來。敢跨出第一步，運氣才找得到你。',
    try: '把一個想很久的副業點子，寫成一頁「第一步要做什麼」。' },
  yuan: { tag: '貴人',
    note: '你的財富藏在人和人之間。你幫過的人，常常就是下一個機會。',
    try: '這週主動聯絡一位好久不見、但很欣賞的前輩或朋友。' },
  wang: { tag: '格局',
    note: '你的財富跟格局一起長大。看得遠的人，才接得住大的財。',
    try: '寫下三年後想過的生活和需要的收入，再倒推今年要做的一件事。' },
};

export const TAG_NAMES = {
  shou: { zh: '守財', ja: '堅実', en: 'STEADY SAVER' }, xin: { zh: '信用', ja: '信用', en: 'TRUST' },
  zhi: { zh: '智慧', ja: '知恵', en: 'WISDOM' }, chuang: { zh: '開創', ja: '開拓', en: 'PIONEER' },
  yuan: { zh: '貴人', ja: 'ご縁', en: 'CONNECTIONS' }, wang: { zh: '格局', ja: '器量', en: 'VISION' },
};

// 十二尊台灣常見神明。style：a＝細水長流、b＝一次到位
// 每尊的圖放在 stands/<id>.jpg（正中央與片頭構圖用 stands/<id>_front.jpg）
export const STANDS = {
  tudigong: { tagId: 'shou', style: 'a', name: 'TUDIGONG', zh: '福德正神（土地公）',
    tint: '#d9902a', glow: '#ffe2a0', text: '#ffc24d',
    grade: { pow: 'A', spd: 'C', rng: 'B', dur: 'A', pre: 'B', gro: 'A' },
    ability: '有土斯有財。土地公眷顧踏實工作、腳踏實地的人，讓你的每一分努力都慢慢長成存款。' },
  mazu: { tagId: 'shou', style: 'b', name: 'MAZU', zh: '天上聖母（媽祖）',
    tint: '#d23c3c', glow: '#ffd0b0', text: '#ff6b5e',
    grade: { pow: 'B', spd: 'B', rng: 'A', dur: 'A', pre: 'B', gro: 'A' },
    ability: '守護出外打拼的人。媽祖眷顧你勇敢走出去，在遠方、在新市場，也能平平安安帶財回家。' },
  chenghuang: { tagId: 'xin', style: 'a', name: 'CHENGHUANG', zh: '城隍爺',
    tint: '#a8322d', glow: '#ffc9a0', text: '#ff7a5c',
    grade: { pow: 'A', spd: 'C', rng: 'B', dur: 'A', pre: 'A', gro: 'B' },
    ability: '手中的算盤記得每一筆帳。城隍爺眷顧清清楚楚、守法守信的人，正正當當的錢留得最久。' },
  guangong: { tagId: 'xin', style: 'b', name: 'GUAN GONG', zh: '關聖帝君（關公）',
    tint: '#2f8a4e', glow: '#e8f5c0', text: '#5fcf86',
    grade: { pow: 'A', spd: 'B', rng: 'A', dur: 'A', pre: 'B', gro: 'A' },
    ability: '商家最敬重的武財神。關公眷顧講義氣、重承諾的人，你的信用會替你帶來大生意。' },
  wenchang: { tagId: 'zhi', style: 'a', name: 'WENCHANG', zh: '文昌帝君',
    tint: '#2c5fb8', glow: '#d6e6ff', text: '#6fa8ef',
    grade: { pow: 'B', spd: 'C', rng: 'B', dur: 'A', pre: 'A', gro: 'A' },
    ability: '掌管學問與功名。文昌帝君眷顧肯讀書、肯精進的人，證照和專業就是你的鐵飯碗。' },
  xuannu: { tagId: 'zhi', style: 'b', name: 'XUANNU', zh: '九天玄女',
    tint: '#7a3fc2', glow: '#e6d0ff', text: '#b98aff',
    grade: { pow: 'B', spd: 'A', rng: 'B', dur: 'B', pre: 'A', gro: 'A' },
    ability: '傳授兵法與百工技藝。九天玄女眷顧有好手藝、懂策略的人，一招絕活就能打出一片天。' },
  xuantian: { tagId: 'chuang', style: 'a', name: 'XUANTIAN', zh: '玄天上帝',
    tint: '#2a3a6e', glow: '#c8d4ff', text: '#7f9cff',
    grade: { pow: 'A', spd: 'B', rng: 'B', dur: 'A', pre: 'B', gro: 'A' },
    ability: '鎮守北方、降伏一切難關。玄天上帝眷顧在逆境中咬牙撐住的人，越挫越勇，終能翻身。' },
  nezha: { tagId: 'chuang', style: 'b', name: 'NEZHA', zh: '中壇元帥（三太子）',
    tint: '#e0452e', glow: '#ffd48a', text: '#ff7a3d',
    grade: { pow: 'B', spd: 'A', rng: 'B', dur: 'B', pre: 'C', gro: 'A' },
    ability: '踩著風火輪向前衝。三太子眷顧年輕有衝勁、敢創業的人，行動越快，財路開得越快。' },
  guanyin: { tagId: 'yuan', style: 'a', name: 'GUANYIN', zh: '觀世音菩薩',
    tint: '#c9a24a', glow: '#fff6dc', text: '#e8c66a',
    grade: { pow: 'C', spd: 'C', rng: 'A', dur: 'A', pre: 'B', gro: 'A' },
    ability: '大慈大悲，聞聲救苦。觀音眷顧心地善良、樂於助人的人，你種下的善緣，會變成回來幫你的福氣。' },
  yuelao: { tagId: 'yuan', style: 'b', name: 'YUE LAO', zh: '月下老人',
    tint: '#d23f6a', glow: '#ffd0dc', text: '#ff6f96',
    grade: { pow: 'C', spd: 'B', rng: 'A', dur: 'B', pre: 'B', gro: 'A' },
    ability: '手中的紅線不只牽姻緣。月老眷顧善於連結的人，替你牽起合夥人、客戶和一路相挺的貴人。' },
  yuhuang: { tagId: 'wang', style: 'a', name: 'JADE EMPEROR', zh: '玉皇大帝',
    tint: '#c9a227', glow: '#fff0b0', text: '#ffd23f',
    grade: { pow: 'A', spd: 'C', rng: 'A', dur: 'A', pre: 'B', gro: 'A' },
    ability: '統領天界的至尊。玉皇大帝眷顧格局大、看得遠的人，穩穩布局，財富會隨著你的高度一起上升。' },
  caishen: { tagId: 'wang', style: 'b', name: 'CAISHEN', zh: '五路財神',
    tint: '#d4a017', glow: '#fff1a0', text: '#ffcc33',
    grade: { pow: 'A', spd: 'A', rng: 'A', dur: 'B', pre: 'B', gro: 'A' },
    ability: '東西南北中，五路財源廣進。財神眷顧敢為自己開更多收入管道的人，正財偏財一起來。' },
};

// 篇：之後的日本篇等，換掉這一包資料（神明、圖、文字）就能沿用整套測驗與相機
export const PACK = { id: 'taiwan', name: { zh: '台灣篇', ja: '台湾編', en: 'TAIWAN EDITION' } };

// 三種語言的名字、稱號與祝福語（相機畫面上的標題與對話框用）
export const LANGS = { zh: '中文', ja: '日本語', en: 'EN' };
export const LOCALE = {
  tudigong: { names: { zh: '土地公', ja: '土地公', en: 'TUDIGONG' }, titles: { zh: '福德正神', ja: '福を呼ぶ土地の神', en: 'Keeper of Land and Luck' },
    line: { zh: '錢慢慢存，日子會越過越好啦！', ja: '塵も積もれば山となる。コツコツいこうな！', en: 'Every penny counts. Slow and steady wins the race!' } },
  mazu: { names: { zh: '媽祖', ja: '媽祖', en: 'MAZU' }, titles: { zh: '天上聖母', ja: '海を鎮める女神', en: 'She Who Calms the Seas' },
    line: { zh: '出外打拚免驚，媽祖婆罩你！', ja: '安心して行っておいで。ちゃんと見てるからね。', en: "Go on, kiddo. I'll be watching over you." } },
  chenghuang: { names: { zh: '城隍爺', ja: '城隍神', en: 'CHENGHUANG' }, titles: { zh: '城隍爺', ja: '街を見守る裁きの神', en: 'Judge of the City' },
    line: { zh: '做人清清楚楚，錢就賺得心安！', ja: 'お天道様は見ている。正直者が最後に笑うんだ。', en: 'Honesty pays. Always has, always will.' } },
  guangong: { names: { zh: '關公', ja: '関羽', en: 'GUAN GONG' }, titles: { zh: '關聖帝君', ja: '義に生きる武神', en: 'The Warrior of Honor' },
    line: { zh: '講話算話，客人自然一直回來！', ja: '信用は金では買えない。約束は守れよ。', en: "Your word is your bond. Keep it, and they'll keep coming back." } },
  wenchang: { names: { zh: '文昌帝君', ja: '文昌帝君', en: 'WENCHANG' }, titles: { zh: '文昌帝君', ja: '合格を呼ぶ学問の神', en: 'Patron of Scholars' },
    line: { zh: '多學一點，以後都是你的本事！', ja: '学んだことは、誰にも奪えない。', en: 'Knowledge is the one thing nobody can take from you.' } },
  xuannu: { names: { zh: '九天玄女', ja: '九天玄女', en: 'XUANNU' }, titles: { zh: '九天玄女', ja: '天の軍師', en: 'Mistress of Strategy' },
    line: { zh: '手藝練好，走到哪都有飯吃！', ja: '芸は身を助ける。腕を磨きなさい。', en: "Hone your craft, and you'll never go hungry." } },
  xuantian: { names: { zh: '玄天上帝', ja: '玄天上帝', en: 'XUANTIAN' }, titles: { zh: '玄天上帝', ja: '北天を鎮める帝', en: 'Lord of the Northern Sky' },
    line: { zh: '低潮過了就是好運，撐住，你可以！', ja: '明けない夜はない。踏ん張れ！', en: "It's always darkest before the dawn. Hang in there!" } },
  nezha: { names: { zh: '三太子', ja: '哪吒', en: 'NEZHA' }, titles: { zh: '中壇元帥', ja: '風火輪の少年神', en: 'Rider of Wind and Fire' },
    line: { zh: '想做就去做啦，衝一波！', ja: '迷ったらGOだ！一気にいくぞ！', en: "Fortune favors the bold. Let's gooo!" } },
  guanyin: { names: { zh: '觀音', ja: '観音', en: 'GUANYIN' }, titles: { zh: '觀世音菩薩', ja: '慈悲の菩薩', en: 'The Merciful One' },
    line: { zh: '對人好，福氣會自己找上門。', ja: '情けは人のためならず。優しさは必ず返ってくるよ。', en: 'What goes around comes around. Be kind.' } },
  yuelao: { names: { zh: '月老', ja: '月下老人', en: 'YUE LAO' }, titles: { zh: '月下老人', ja: '赤い糸の縁結び神', en: 'Weaver of the Red Thread' },
    line: { zh: '好朋友就是貴人，記得常聯絡喔！', ja: 'ご縁は大事にね。いい出会いが福を運んでくるよ。', en: "It's not what you know, it's who you know. Call your friends!" } },
  yuhuang: { names: { zh: '玉皇大帝', ja: '玉皇大帝', en: 'JADE EMPEROR' }, titles: { zh: '玉皇大帝', ja: '天を統べる帝', en: 'Emperor of Heaven' },
    line: { zh: '眼光放遠一點，好日子在後頭！', ja: '焦るな。大器は晩成するものだ。', en: 'Play the long game. Your best days are still ahead.' } },
  caishen: { names: { zh: '財神', ja: '財神', en: 'CAISHEN' }, titles: { zh: '五路財神', ja: '商売繁盛の神', en: 'Bringer of Wealth' },
    line: { zh: '好運旺旺來，今年發大財！', ja: '商売繁盛！今年はあなたの年だ！', en: 'Show me the money! This is your year!' } },
};

// 財富建議：主性格決定「你的財富類型」，副性格給混搭，每一題選的選項再各給一句
export const MEDIA = {
  shou: { role: '穩健累積型', pitch: '你不靠運氣，靠的是一點一滴存起來的安全感。時間站在你這邊。',
    topics: ['穩定的正職收入', '長期定期定額', '房租或固定收益', '把專業做深做久'],
    formats: '先存再花、記帳、保留六個月緊急預備金', platforms: '家人、長輩，以及做事穩重的老同事',
    first: '開一個「不准動」的帳戶，這週先存進第一筆。', watch: '太保守而錯過該花的錢，例如健康和學習。', mix: '多一點穩定，給自己留後路' },
  xin: { role: '信用經營型', pitch: '你的口碑會替你賺錢。一次做好，客人就會一直回來。',
    topics: ['老客戶與長期合作', '口碑推薦', '需要信任的專業服務', '代理或經銷'],
    formats: '帳目清楚、合約寫明、不輕易借貸', platforms: '合作過、被你準時交件打動的客戶',
    first: '整理一份「我做過的成果清單」，讓別人更容易推薦你。', watch: '人情壓力下的作保與借錢。', mix: '說到做到，替自己累積口碑' },
  zhi: { role: '知識變現型', pitch: '你的腦袋和手藝就是印鈔機。越專業，越值錢。',
    topics: ['證照與專業職', '接案、顧問、教學', '手作或技術服務', '內容與課程'],
    formats: '每年固定撥預算投資自己、把技能變成價目表', platforms: '老師、同業前輩、會買單的學生',
    first: '替自己最拿手的一件事訂一個價錢，問一個人要不要買。', watch: '一直學、卻遲遲不開始收費。', mix: '多學一招，替收入加一個來源' },
  chuang: { role: '開創闖蕩型', pitch: '你適合自己當老闆。風險嚇不倒你，停滯才會。',
    topics: ['創業與副業', '自有品牌', '業務與抽成制', '新市場、新產品'],
    formats: '先小規模試賣、分開生活費和創業金', platforms: '一起打拼的夥伴、敢投資新人的前輩',
    first: '用一個週末，把點子做成最小的版本賣給第一位客人。', watch: '衝太快沒算清成本，或把生活費也押下去。', mix: '多一點行動力，想到就試' },
  yuan: { role: '貴人連結型', pitch: '你的財富跟著人來。人脈經營得好，機會自然上門。',
    topics: ['介紹與合作分潤', '社群、團購、活動', '服務業與顧客關係', '牽線媒合'],
    formats: '請客與送禮有預算、合作分潤寫清楚', platforms: '你身邊總是熱心介紹機會的朋友',
    first: '列出三位可能互相合作的朋友，介紹他們認識。', watch: '為了面子過度請客，或合作沒談清楚就開始。', mix: '多認識一個人，多一條財路' },
  wang: { role: '格局布局型', pitch: '你看得比別人遠。適合布局、帶團隊、做大事。',
    topics: ['投資與資產配置', '管理職與帶團隊', '多元收入', '長期品牌或事業'],
    formats: '分散配置、設停損、每年檢視一次目標', platforms: '比你更有經驗的前輩與領域高手',
    first: '把收入分成三份：生活、存下、讓錢滾錢，今天就設好比例。', watch: '想一步登天，或把所有資金押在同一個地方。', mix: '把眼光放遠，想三年後的自己' },
};

// 依「本人實際選的答案」產生的財富分析：每一題選的選項各給一句
export const ANSWER_MEDIA = [
  ['q1', '你天生的財富雷達', { wang: '你被氣勢與格局吸引，適合做大格局的事', yuan: '你被熱鬧和人氣吸引，適合人多的生意', xin: '你會注意細節和紀錄，天生會管帳', zhi: '你欣賞好手藝，懂得品質值多少錢' }],
  ['q2', '你的開運方式', { shou: '照規矩來最安心，穩穩的規劃最適合你', wang: '你喜歡好彩頭，正向的心態本身就招財', zhi: '親手做的最有誠意，你的手藝就是財源', chuang: '心意最重要，你做事看本心、不拘形式' }],
  ['q3', '遇到卡關時', { chuang: '越挫越勇，適合需要衝刺的工作', yuan: '懂得開口請人幫忙，貴人就在身邊', zhi: '先觀察再調整，最會解決問題', shou: '沉得住氣，等待時機也是一種本事' }],
  ['q4', '你心裡最在意的事', { shou: '家人平安是你最大的動力，賺錢是為了守護他們', xin: '你希望努力被看見，做出成績就是最好的名片', wang: '你在等一個大機會，平常就要把實力準備好', chuang: '你需要的是勇氣，第一步跨出去，運氣就來了' }],
  ['q5', '面對低潮的方式', { shou: '懂得忍耐，時間會替你加分', chuang: '主動出擊，自己就能創造轉機', xin: '誠實面對，問題反而解得快', yuan: '相信貴人，也記得讓人知道你需要幫忙' }],
  ['q6', '你在團體裡的角色', { yuan: '熱心幫忙，是大家都喜歡的好夥伴', zhi: '愛問愛學，走到哪都學得到東西', wang: '會帶人，適合當組織者或主管', xin: '做事有條理，交給你最放心' }],
  ['q7', '你看見商機的眼光', { shou: '先想到家人，花錢有溫度', yuan: '很會聊天，人情就是你的生意', chuang: '一眼看到改良空間，有創業眼光', zhi: '好奇背後的做法，適合鑽研技術' }],
  ['q8', '你的金錢品格', { xin: '一絲不苟，信用就是你最大的資產', yuan: '樂於結緣，連撿到錢包都能交到朋友', shou: '求穩求安心，不讓自己惹麻煩', wang: '有同理心又有行動力，適合當領導' }],
  ['q9', '你心中的財富目標', { shou: '一輩子不缺錢用，最實在', zhi: '讓興趣變收入，最快樂', xin: '賺得心安理得，最長久', wang: '財務自由，最有底氣' }],
  ['q10', '你和財富的長期關係', { yuan: '好東西想分享，人脈會越滾越大', xin: '重承諾，財運會跟著信用一起長大', chuang: '有目標就會拚，成功後記得回饋', wang: '想著回饋，代表你的格局夠大' }],
];

export const STORY = '你來到一座香火鼎盛的老廟。從廟口到離開，一路上的選擇，會透露你的財富性格。';
export const QUESTIONS = [
  { id: 'name', kind: 'text', q: '參拜前，先告訴神明你的名字', hint: '會印在你和神明的合照上。', placeholder: '例如：小安', max: 12 },
  { id: 'q1', scene: '廟口', q: '走到廟口，你最先注意到什麼？', options: [
    ['wang', '門口的石獅子，威風凜凜'], ['yuan', '熱鬧的小吃攤和人潮'], ['xin', '牆上一筆一筆的捐獻芳名錄'], ['zhi', '屋簷上精緻的剪黏彩繪'] ] },
  { id: 'q2', scene: '供品', q: '準備供品時，你會帶什麼？', options: [
    ['zhi', '自己動手做的點心'], ['shou', '照長輩教的：水果三樣、餅乾一盒'], ['chuang', '一包自己最愛吃的零食，心意最重要'], ['wang', '鳳梨（旺來），討個好彩頭'] ] },
  { id: 'q3', scene: '點香', q: '點香時，一陣風把火吹熄了，你會？', options: [
    ['chuang', '擋住風再點，點到好為止'], ['shou', '不急，等風停了再點'], ['zhi', '觀察風向，換個角度再點'], ['yuan', '跟旁邊的阿姨借打火機'] ] },
  { id: 'q4', scene: '許願', q: '雙手合十，你最想跟神明說什麼？', options: [
    ['xin', '「讓我的努力被看見」'], ['chuang', '「給我勇氣去做想做的事」'], ['shou', '「保佑家人平安健康」'], ['wang', '「給我一個翻身的大機會」'] ] },
  { id: 'q5', scene: '抽籤', q: '你抽到一支籤：「守得雲開見月明」。你覺得是在說？', options: [
    ['shou', '現在先忍耐，好事在後頭'], ['yuan', '會有貴人來幫我撥開雲'], ['chuang', '要我主動去把雲撥開'], ['xin', '誠實面對，答案自然會清楚'] ] },
  { id: 'q6', scene: '志工阿伯', q: '廟裡的志工阿伯請你幫忙搬椅子，你會？', options: [
    ['wang', '招呼其他人一起來，分工更快'], ['xin', '先問清楚要搬去哪、搬幾張'], ['yuan', '二話不說馬上幫'], ['zhi', '幫完順便問廟的歷史'] ] },
  { id: 'q7', scene: '平安符', q: '廟口的攤位在賣平安符，你的第一個反應是？', options: [
    ['chuang', '心想：換個設計一定更好賣'], ['zhi', '好奇它是怎麼做出來的'], ['shou', '買一個給家人'], ['yuan', '跟老闆聊開了，結果多送你一個'] ] },
  { id: 'q8', scene: '回程', q: '回程路上撿到一個錢包，你會？', options: [
    ['yuan', '照裡面的名片聯絡失主，順便交個朋友'], ['wang', '想到失主有多著急，馬上處理到好'], ['xin', '送到派出所，一毛都不少'], ['shou', '交給廟公處理，最安心'] ] },
  { id: 'q9', scene: '心願', q: '如果能許一個關於錢的願，你會許？', options: [
    ['zhi', '「做喜歡的事也能賺錢」'], ['wang', '「早日財務自由」'], ['shou', '「一輩子不缺錢用」'], ['xin', '「賺得心安理得」'] ] },
  { id: 'q10', scene: '離開', q: '離開前，你回頭看了廟一眼，心裡想的是？', options: [
    ['xin', '「謝謝，我會照約定努力」'], ['wang', '「希望有一天我也能回饋這裡」'], ['yuan', '「下次帶朋友一起來」'], ['chuang', '「等我成功了，回來還願」'] ] },
  { id: 'sex', kind: 'choice', scene: '擲筊前', q: '擲筊之前，你想跟神明求哪一種財運？', options: [
    ['a', '細水長流，越存越多'], ['b', '大展身手，一次到位'], ['any', '讓神明決定'] ] },
];

// 財運六項：每一角都有自己的意思
export const STAT_KEYS = [['pow', '正財'], ['spd', '偏財'], ['rng', '貴人'], ['dur', '守財'], ['pre', '事業'], ['gro', '福報']];
export const STAT_INFO = {
  pow: { short: { zh: '正財', ja: '本業運', en: 'SALARY' }, desc: '工作、本業帶來的穩定收入' },
  spd: { short: { zh: '偏財', ja: '臨時収入', en: 'WINDFALL' }, desc: '投資、副業、意外之財' },
  rng: { short: { zh: '貴人', ja: '人脈', en: 'HELPERS' }, desc: '有人幫你、替你介紹機會' },
  dur: { short: { zh: '守財', ja: '貯蓄', en: 'SAVING' }, desc: '把錢留住、不亂花的能力' },
  pre: { short: { zh: '事業', ja: '仕事運', en: 'CAREER' }, desc: '升遷、創業、事業發展' },
  gro: { short: { zh: '福報', ja: '福運', en: 'BLESSING' }, desc: '善緣與好心帶回來的福氣' },
};

export function standById(id, owner = '') {
  const s = STANDS[id];
  return { id, owner, ...TAGS[s.tagId], ...s, ...LOCALE[id], tagNames: TAG_NAMES[s.tagId] };
}

export function computeStand(a) {
  const count = {};
  for (const k of Object.keys(a)) if (/^q\d+$/.test(k) && TAGS[a[k]]) count[a[k]] = (count[a[k]] || 0) + 1;   // 抽到哪幾題就算哪幾題
  const best = Math.max(0, ...Object.values(count));
  // 同分時，以第五題（抽籤）為準，其次按題目順序
  const tied = Object.keys(count).filter((k) => count[k] === best);
  const first = a[a._qs?.[0]];   // 同分時，以這次抽到的第一題為準
  const tagId = tied.includes(first) ? first : tied[0] || 'shou';
  const second = Object.keys(count).filter((k) => k !== tagId).sort((x, y) => count[y] - count[x])[0] || null;
  const pair = Object.keys(STANDS).filter((id) => STANDS[id].tagId === tagId);
  let style = a.sex;
  if (style !== 'a' && style !== 'b') {
    // 「交給神明安排」：用答案算出固定的結果，重看時不會變
    let h = 0; for (const ch of JSON.stringify(a)) h = (h * 31 + ch.charCodeAt(0)) | 0;
    style = h & 1 ? 'b' : 'a';
  }
  const id = pair.find((k) => STANDS[k].style === style) || pair[0];
  return { ...standById(id, (a.name || '').trim() || '有福之人'), second, counts: count, answers: a };
}

// ── 題庫：原本 10 題＋新增 30 題，每次隨機抽 8～10 題（六種性格都有機會出現；有劇情的篇依劇情順序排）──
const MORE = [{"id": "q11", "stage": 1, "label": "出門的習慣", "q": "要去廟裡拜拜，出門前你會？", "options": [["shou", "查好要準備什麼，照規矩來"], ["chuang", "直接出發，到了再說"], ["yuan", "揪家人朋友一起去"], ["zhi", "先查這間廟拜的是哪位神明"]], "scene": "出門前"}, {"id": "q12", "stage": 1, "label": "找車位", "q": "廟口停車位好難找，你會？", "options": [["zhi", "早就查好附近哪裡有停車場"], ["yuan", "問廟口的阿伯哪裡好停"], ["shou", "停遠一點，走路也是運動"], ["wang", "乾脆搭計程車，時間最寶貴"]], "scene": "停車"}, {"id": "q13", "stage": 1, "label": "金紙攤", "q": "金紙攤老闆熱情推銷大套組，你會？", "options": [["xin", "先問清楚每一樣是拿來做什麼的"], ["shou", "買基本的就好，心意到了就好"], ["yuan", "跟老闆聊開了，還學會拜拜的順序"], ["wang", "大方買一套，給神明留個好印象"]], "scene": "金紙攤"}, {"id": "q14", "stage": 2, "label": "排隊的時候", "q": "拜拜的人好多要排隊，你會？", "options": [["shou", "慢慢排，不急"], ["zhi", "看看別人怎麼拜，順便學"], ["yuan", "跟前面的阿姨聊起來"], ["chuang", "先去拜人少的那一殿，晚點再回來"]], "scene": "排隊"}, {"id": "q15", "stage": 2, "label": "添香油錢", "q": "添香油錢時，你會放多少？", "options": [["xin", "固定的金額，每次都一樣"], ["wang", "多放一點，當作投資好運"], ["shou", "量力而為，心意最重要"], ["chuang", "看今天的心情和直覺"]], "scene": "香油錢"}, {"id": "q16", "stage": 2, "label": "路過月老", "q": "旁邊就是月老殿，你會？", "options": [["yuan", "當然要拜，人緣也是財緣"], ["chuang", "幫單身的朋友求一條紅線"], ["xin", "專心拜今天要拜的就好"], ["wang", "順便求事業上遇到好夥伴"]], "scene": "月老殿"}, {"id": "q17", "stage": 3, "label": "聽完解籤", "q": "解籤的老師說：「今年財運要靠自己爭取」，你心想？", "options": [["chuang", "太好了，我本來就想自己闖"], ["zhi", "那我要多學一點本事"], ["yuan", "爭取之外，也要找人一起"], ["shou", "那我先把現在的工作顧好"]], "scene": "解籤"}, {"id": "q18", "stage": 3, "label": "拿到錢母", "q": "廟方在發開運錢母，你會？", "options": [["shou", "好好收在錢包裡，捨不得花"], ["wang", "拿去當第一筆投資的本金"], ["yuan", "多求一個，送給朋友"], ["xin", "照廟方說的，明年記得回來還"]], "scene": "發錢母"}, {"id": "q19", "stage": 4, "label": "廟埕小吃", "q": "廟埕有好多小吃攤，你會？", "options": [["zhi", "找排最長的那攤，一定有原因"], ["chuang", "挑沒吃過的新口味"], ["shou", "吃熟悉的老店最安心"], ["yuan", "買一堆跟大家分著吃"]], "scene": "廟埕小吃"}, {"id": "q20", "stage": 4, "label": "看到喜歡的東西", "q": "看到很可愛的紀念品，但有點貴，你會？", "options": [["shou", "拍照就好，不一定要買"], ["wang", "喜歡就買，好東西值得"], ["zhi", "好奇它為什麼賣這個價錢"], ["chuang", "心想：這我也做得出來"]], "scene": "文創小物"}, {"id": "q21", "stage": 0, "label": "發薪日", "q": "發薪日那天，你第一件事是？", "options": [["shou", "先轉一筆到存款帳戶"], ["wang", "想想下一步怎麼讓錢變多"], ["xin", "先把該繳的帳單繳掉"], ["yuan", "請家人或朋友吃頓好的"]], "scene": "先聊聊你"}, {"id": "q22", "stage": 0, "label": "朋友借錢", "q": "好朋友開口跟你借錢，你會？", "options": [["xin", "借，但先說好什麼時候還"], ["yuan", "借！朋友有難一定幫"], ["shou", "借一個「沒還也沒關係」的數字"], ["zhi", "先了解他遇到什麼事，也許有更好的辦法"]], "scene": "先聊聊你"}, {"id": "q23", "stage": 0, "label": "中發票", "q": "發票中了一千塊，你會？", "options": [["shou", "存起來"], ["yuan", "請同事喝飲料"], ["chuang", "當作副業的第一筆資金"], ["wang", "再補一點，買個好東西犒賞自己"]], "scene": "先聊聊你"}, {"id": "q24", "stage": 0, "label": "聽到投資話題", "q": "聽到同事在聊投資，你會？", "options": [["zhi", "回家自己研究，弄懂了再說"], ["chuang", "跟著試一點點，邊做邊學"], ["shou", "我還是習慣定存"], ["yuan", "請他吃飯，跟他請教"]], "scene": "先聊聊你"}, {"id": "q25", "stage": 0, "label": "加薪的機會", "q": "主管說要幫你加薪，但工作也會變多，你會？", "options": [["wang", "接！這是往上走的機會"], ["xin", "先問清楚多了哪些事，確定做得好再接"], ["zhi", "接，剛好學新東西"], ["shou", "想想身體和生活會不會太累"]], "scene": "先聊聊你"}, {"id": "q26", "stage": 0, "label": "擺攤邀約", "q": "朋友找你一起去市集擺攤，你會？", "options": [["chuang", "好啊！我來想要賣什麼"], ["yuan", "去，順便認識一堆新朋友"], ["zhi", "先研究什麼東西最好賣"], ["xin", "我負責收錢記帳"]], "scene": "先聊聊你"}, {"id": "q27", "stage": 0, "label": "網購習慣", "q": "購物車裡放了一堆東西，你會？", "options": [["shou", "放三天，還想要再買"], ["wang", "一次結帳，享受生活"], ["zhi", "比價、等折扣碼"], ["xin", "只買清單上原本要買的"]], "scene": "先聊聊你"}, {"id": "q28", "stage": 0, "label": "收到紅包", "q": "過年收到紅包，你會？", "options": [["shou", "全部存起來"], ["xin", "記下誰給的，明年也要回禮"], ["chuang", "拿一部分去學新東西"], ["wang", "買一個能用很久的好東西"]], "scene": "先聊聊你"}, {"id": "q29", "stage": 0, "label": "用錢實現的夢想", "q": "如果有一筆錢可以實現一個夢想，你選？", "options": [["chuang", "開一間自己的小店"], ["wang", "帶家人去環遊世界"], ["zhi", "出國進修"], ["yuan", "成立一個幫助別人的基金"]], "scene": "先聊聊你"}, {"id": "q30", "stage": 0, "label": "你的貴人", "q": "你覺得「貴人」最可能是？", "options": [["yuan", "平常就互相幫忙的朋友"], ["xin", "看過你認真做事的主管"], ["zhi", "學習路上遇到的老師"], ["wang", "願意投資你的前輩"]], "scene": "先聊聊你"}, {"id": "q31", "stage": 0, "label": "犯錯的時候", "q": "工作上出了錯，讓公司少賺一筆，你會？", "options": [["xin", "第一時間承認，想辦法補救"], ["zhi", "找出原因，寫下來不再犯"], ["chuang", "想一個新方案把錢賺回來"], ["yuan", "請有經驗的同事一起幫忙"]], "scene": "先聊聊你"}, {"id": "q32", "stage": 0, "label": "存錢方式", "q": "你存錢的方式比較像？", "options": [["shou", "每個月固定存，雷打不動"], ["wang", "設一個大目標，努力衝"], ["chuang", "與其省，不如多賺一點"], ["xin", "記帳記得清清楚楚"]], "scene": "先聊聊你"}, {"id": "q33", "stage": 0, "label": "吃飯付錢", "q": "跟朋友吃飯，你通常？", "options": [["yuan", "常常順手就請了"], ["xin", "各付各的，清清楚楚"], ["wang", "這次我請，下次你請"], ["shou", "挑平價又好吃的店"]], "scene": "先聊聊你"}, {"id": "q34", "stage": 0, "label": "合夥邀約", "q": "朋友找你合夥做生意，你的第一個念頭是？", "options": [["chuang", "好刺激，我想試試"], ["xin", "要先講好怎麼分工、怎麼分錢"], ["zhi", "先看看計畫書"], ["shou", "我還是想保住正職"]], "scene": "先聊聊你"}, {"id": "q35", "stage": 0, "label": "最捨得花錢的地方", "q": "你在哪裡花錢最大方？", "options": [["zhi", "買書、上課"], ["yuan", "請朋友、送禮"], ["shou", "家人需要的東西"], ["wang", "能讓生活變更好的東西"]], "scene": "先聊聊你"}, {"id": "q36", "stage": 0, "label": "中樂透", "q": "如果中了頭獎，你第一個打給誰？", "options": [["shou", "家人，叫他們先別說出去"], ["yuan", "最好的朋友"], ["xin", "理財專員，先問怎麼安排"], ["wang", "先打給自己——冷靜，想清楚再說"]], "scene": "先聊聊你"}, {"id": "q37", "stage": 5, "label": "還願", "q": "去年許的願望實現了，你會？", "options": [["xin", "一定回來還願，說到做到"], ["yuan", "帶朋友一起來，分享好運"], ["wang", "捐一筆錢給廟裡做公益"], ["chuang", "再許一個更大的願"]], "scene": "還願"}, {"id": "q38", "stage": 3, "label": "擲到笑筊", "q": "擲筊連續三次都是笑筊，你會？", "options": [["shou", "不急，換個問法再問"], ["chuang", "笑一笑，神明大概覺得我想太多"], ["zhi", "想想是不是問題問得不清楚"], ["yuan", "問旁邊的人都怎麼擲"]], "scene": "擲筊"}, {"id": "q39", "stage": 2, "label": "跟神明說話", "q": "站在神明面前，你通常會說得？", "options": [["xin", "很仔細：名字、住址、想求什麼"], ["wang", "直接說出最大的願望"], ["shou", "簡單說聲謝謝就好"], ["chuang", "說說最近想做的新計畫"]], "scene": "神明面前"}, {"id": "q40", "stage": 4, "label": "當志工", "q": "廟裡在找廟會志工，你會？", "options": [["yuan", "報名！認識新朋友也不錯"], ["zhi", "想學學廟會是怎麼辦起來的"], ["xin", "答應了就一定準時到"], ["wang", "幫忙找更多人一起來"]], "scene": "廟會志工"}];
const STAGE = {"q1": 1, "q2": 1, "q3": 2, "q4": 2, "q5": 3, "q6": 4, "q7": 4, "q8": 5, "q9": 2, "q10": 6};
const SAYS = {"shou": ["穩紮穩打，你的財富會越滾越大", "懂得守，就是最好的開始"], "xin": ["說到做到，信用就是你的本錢", "清清楚楚，別人最放心把事交給你"], "zhi": ["肯學肯想，腦袋就是你的財庫", "你懂得先弄清楚再出手"], "chuang": ["敢試敢闖，機會常常是你自己開出來的", "你看到的是別人還沒看到的機會"], "yuan": ["好人緣會替你帶來好財運", "你給出去的善意，常常會繞回來"], "wang": ["你看得遠，接得住大機會", "捨得投資，也懂得享受成果"]};
const BANK = [...QUESTIONS.filter((q) => /^q\d+$/.test(q.id)), ...MORE];
for (const q of BANK) if (q.stage == null) q.stage = STAGE[q.id] ?? 0;
// 新題目的分析：選的那句話＋一句對應性格的話
for (const q of MORE) ANSWER_MEDIA.push([q.id, q.label, Object.fromEntries(q.options.map(([t, x], i) => [t, `${/^「/.test(x) ? x : `「${x}」`}——${SAYS[t][(parseInt(q.id.slice(1), 10) + i) % SAYS[t].length]}`]))]);
export const BANK_SIZE = BANK.length;
export function drawQuestions() {
  const n = 8 + Math.floor(Math.random() * 3), tags = Object.keys(TAGS);
  let best = null;
  for (let tr = 0; tr < 400; tr++) {
    const pick = [...BANK].sort(() => Math.random() - .5).slice(0, n), c = {};
    for (const q of pick) for (const [t] of q.options) c[t] = (c[t] || 0) + 1;
    const min = Math.min(...tags.map((t) => c[t] || 0));
    if (!best || min > best.min) best = { pick, min };
    if (min >= Math.floor(n * 4 / tags.length)) break;            // 每種性格出現的次數差不多，才公平
  }
  return best.pick.sort((a, b) => a.stage - b.stage).map((q) => q.id);
}
export function questionsFor(ids) {
  const head = QUESTIONS.find((q) => q.id === 'name'), tail = QUESTIONS.find((q) => q.id === 'sex');
  return [head, ...(ids || []).map((id) => BANK.find((q) => q.id === id)).filter(Boolean), tail];
}
