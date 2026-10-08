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
export const PACK = { id: 'taiwan', name: { zh: '台灣篇', ja: '台湾編', en: 'TAIWAN' } };

// 三種語言的名字、稱號與祝福語（相機畫面上的標題與對話框用）
export const LANGS = { zh: '中文', ja: '日本語', en: 'EN' };
export const LOCALE = {
  tudigong: { names: { zh: '土地公', ja: '土地公', en: 'TUDIGONG' }, titles: { zh: '福德正神', ja: '福徳正神', en: 'God of the Land' },
    line: { zh: '錢慢慢存，日子會越過越好啦！', ja: 'コツコツ貯めれば、毎日もっと良くなるよ！', en: 'Save little by little, life keeps getting better!' } },
  mazu: { names: { zh: '媽祖', ja: '媽祖', en: 'MAZU' }, titles: { zh: '天上聖母', ja: '天上聖母', en: 'Goddess of the Sea' },
    line: { zh: '出外打拚免驚，媽祖婆罩你！', ja: '外で頑張るあなたを、ちゃんと見守ってるよ！', en: "Go out and work hard. I've got you covered!" } },
  chenghuang: { names: { zh: '城隍爺', ja: '城隍神', en: 'CHENGHUANG' }, titles: { zh: '城隍爺', ja: '城隍神', en: 'The City God' },
    line: { zh: '做人清清楚楚，錢就賺得心安！', ja: '誠実にいれば、安心して稼げるよ！', en: 'Stay honest, and every dollar feels good!' } },
  guangong: { names: { zh: '關公', ja: '関羽', en: 'GUAN GONG' }, titles: { zh: '關聖帝君', ja: '関聖帝君', en: 'God of Loyalty and Wealth' },
    line: { zh: '講話算話，客人自然一直回來！', ja: '約束を守れば、お客さんはまた来てくれる！', en: 'Keep your word, and customers keep coming back!' } },
  wenchang: { names: { zh: '文昌帝君', ja: '文昌帝君', en: 'WENCHANG' }, titles: { zh: '文昌帝君', ja: '学問の神', en: 'God of Learning' },
    line: { zh: '多學一點，以後都是你的本事！', ja: '今学んだことは、全部あなたの力になる！', en: 'Everything you learn becomes your superpower!' } },
  xuannu: { names: { zh: '九天玄女', ja: '九天玄女', en: 'XUANNU' }, titles: { zh: '九天玄女', ja: '九天玄女', en: 'Lady of the Nine Heavens' },
    line: { zh: '手藝練好，走到哪都有飯吃！', ja: '腕を磨けば、どこでもやっていける！', en: 'Master your craft, and you will never go hungry!' } },
  xuantian: { names: { zh: '玄天上帝', ja: '玄天上帝', en: 'XUANTIAN' }, titles: { zh: '玄天上帝', ja: '北極の帝', en: 'Emperor of the Dark Heaven' },
    line: { zh: '低潮過了就是好運，撐住，你可以！', ja: 'つらい時を越えたら幸運が来る。大丈夫、できる！', en: 'Good luck comes after the hard part. Hang in there!' } },
  nezha: { names: { zh: '三太子', ja: '哪吒', en: 'NEZHA' }, titles: { zh: '中壇元帥', ja: '中壇元帥', en: 'The Third Prince' },
    line: { zh: '想做就去做啦，衝一波！', ja: 'やりたいならやっちゃおう！行くぞ！', en: "Want to do it? Let's gooo!" } },
  guanyin: { names: { zh: '觀音', ja: '観音', en: 'GUANYIN' }, titles: { zh: '觀世音菩薩', ja: '観世音菩薩', en: 'Bodhisattva of Compassion' },
    line: { zh: '對人好，福氣會自己找上門。', ja: '人に優しくすれば、福は自然とやってくる。', en: 'Be kind, and good fortune finds its way to you.' } },
  yuelao: { names: { zh: '月老', ja: '月下老人', en: 'YUE LAO' }, titles: { zh: '月下老人', ja: '縁結びの神', en: 'God of Connections' },
    line: { zh: '好朋友就是貴人，記得常聯絡喔！', ja: 'いい友達こそ恩人。こまめに連絡してね！', en: 'Good friends are lucky charms. Keep in touch!' } },
  yuhuang: { names: { zh: '玉皇大帝', ja: '玉皇大帝', en: 'JADE EMPEROR' }, titles: { zh: '玉皇大帝', ja: '天界の帝', en: 'Ruler of Heaven' },
    line: { zh: '眼光放遠一點，好日子在後頭！', ja: '遠くを見て。いい日はこれからだよ！', en: 'Look a little further. The best days are ahead!' } },
  caishen: { names: { zh: '財神', ja: '財神', en: 'CAISHEN' }, titles: { zh: '五路財神', ja: '五路財神', en: 'God of Wealth' },
    line: { zh: '好運旺旺來，今年發大財！', ja: '運気上昇！今年は大きく稼ごう！', en: 'Good luck is rolling in. This is your year!' } },
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
  pow: { short: { zh: '正財', ja: '正財', en: 'SALARY' }, desc: '工作、本業帶來的穩定收入' },
  spd: { short: { zh: '偏財', ja: '偏財', en: 'WINDFALL' }, desc: '投資、副業、意外之財' },
  rng: { short: { zh: '貴人', ja: '人脈', en: 'HELPERS' }, desc: '有人幫你、替你介紹機會' },
  dur: { short: { zh: '守財', ja: '貯蓄', en: 'SAVING' }, desc: '把錢留住、不亂花的能力' },
  pre: { short: { zh: '事業', ja: '事業', en: 'CAREER' }, desc: '升遷、創業、事業發展' },
  gro: { short: { zh: '福報', ja: '福徳', en: 'BLESSING' }, desc: '善緣與好心帶回來的福氣' },
};

export function standById(id, owner = '') {
  const s = STANDS[id];
  return { id, owner, ...TAGS[s.tagId], ...s, ...LOCALE[id], tagNames: TAG_NAMES[s.tagId] };
}

export function computeStand(a) {
  const count = {};
  for (const q of QUESTIONS) if (/^q\d+$/.test(q.id) && a[q.id]) count[a[q.id]] = (count[a[q.id]] || 0) + 1;
  const best = Math.max(0, ...Object.values(count));
  // 同分時，以第五題（抽籤）為準，其次按題目順序
  const tied = Object.keys(count).filter((k) => count[k] === best);
  const tagId = tied.includes(a.q5) ? a.q5 : tied[0] || 'shou';
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
