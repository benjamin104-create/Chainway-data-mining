// 財神偵測器・台灣篇：十題金錢心理測驗 → 財富性格 → 細水長流或一次到位 → 眷顧你的神明
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
    line: { zh: '腳踏實地，有土斯有財。', ja: '地道に歩めば、財は必ず実る。', en: 'Stay grounded, and wealth will grow.' } },
  mazu: { names: { zh: '媽祖', ja: '媽祖', en: 'MAZU' }, titles: { zh: '天上聖母', ja: '天上聖母', en: 'Goddess of the Sea' },
    line: { zh: '放心去闖，我護你平安回航。', ja: '安心して行きなさい。無事に帰れるよう守ります。', en: 'Go boldly. I will guide you safely home.' } },
  chenghuang: { names: { zh: '城隍爺', ja: '城隍神', en: 'CHENGHUANG' }, titles: { zh: '城隍爺', ja: '城隍神', en: 'The City God' },
    line: { zh: '帳清心安，正財長長久久。', ja: '帳簿が清ければ、財は長く続く。', en: 'Clear accounts, lasting fortune.' } },
  guangong: { names: { zh: '關公', ja: '関羽', en: 'GUAN GONG' }, titles: { zh: '關聖帝君', ja: '関聖帝君', en: 'God of Loyalty and Wealth' },
    line: { zh: '守信重義，財自然來。', ja: '信義を守れば、財は自ずと来る。', en: 'Keep your word, and fortune follows.' } },
  wenchang: { names: { zh: '文昌帝君', ja: '文昌帝君', en: 'WENCHANG' }, titles: { zh: '文昌帝君', ja: '学問の神', en: 'God of Learning' },
    line: { zh: '讀進腦裡的，誰也拿不走。', ja: '学んだものは、誰にも奪えない。', en: 'What you learn, no one can take away.' } },
  xuannu: { names: { zh: '九天玄女', ja: '九天玄女', en: 'XUANNU' }, titles: { zh: '九天玄女', ja: '九天玄女', en: 'Lady of the Nine Heavens' },
    line: { zh: '一技在手，天下可走。', ja: '一芸あれば、天下を渡れる。', en: 'Master one craft, and the world opens up.' } },
  xuantian: { names: { zh: '玄天上帝', ja: '玄天上帝', en: 'XUANTIAN' }, titles: { zh: '玄天上帝', ja: '北極の帝', en: 'Emperor of the Dark Heaven' },
    line: { zh: '撐過寒冬，就是你的春天。', ja: '冬を越えれば、春はあなたのもの。', en: 'Endure the winter, and spring is yours.' } },
  nezha: { names: { zh: '三太子', ja: '哪吒', en: 'NEZHA' }, titles: { zh: '中壇元帥', ja: '中壇元帥', en: 'The Third Prince' },
    line: { zh: '想做就衝，風火輪借你！', ja: 'やりたいなら走れ！風火輪を貸してやる！', en: 'Want it? Go for it. My wheels are yours!' } },
  guanyin: { names: { zh: '觀音', ja: '観音', en: 'GUANYIN' }, titles: { zh: '觀世音菩薩', ja: '観世音菩薩', en: 'Bodhisattva of Compassion' },
    line: { zh: '你給出去的善，都會回到你身邊。', ja: 'あなたの優しさは、必ず巡って返ってくる。', en: 'Every kindness you give finds its way back.' } },
  yuelao: { names: { zh: '月老', ja: '月下老人', en: 'YUE LAO' }, titles: { zh: '月下老人', ja: '縁結びの神', en: 'God of Connections' },
    line: { zh: '對的人，我已經幫你牽好線了。', ja: '必要な縁は、もう結んでおいたよ。', en: 'The right people are already on their way to you.' } },
  yuhuang: { names: { zh: '玉皇大帝', ja: '玉皇大帝', en: 'JADE EMPEROR' }, titles: { zh: '玉皇大帝', ja: '天界の帝', en: 'Ruler of Heaven' },
    line: { zh: '眼光放遠，天地自寬。', ja: '遠くを見れば、天地は広がる。', en: 'Look far, and the world grows wide.' } },
  caishen: { names: { zh: '財神', ja: '財神', en: 'CAISHEN' }, titles: { zh: '五路財神', ja: '五路財神', en: 'God of Wealth' },
    line: { zh: '五路財來，四方都是你的財路！', ja: '五方から財が来る！どこもあなたの財の道！', en: 'Fortune from every direction is coming your way!' } },
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

// 依「本人實際選的答案」產生的財富分析：每一題的每個選項都有一句對應的建議
export const ANSWER_MEDIA = [
  ['q2', '你的賺錢強項', { shou: '穩定、不出錯，越重要的工作越放心交給你', xin: '說到做到，最容易累積長期客戶', zhi: '專業又有想法，最適合靠技術和知識收費', chuang: '敢衝、執行力強，適合開發新業務', yuan: '人緣好、會牽線，適合業務與合作', wang: '有遠見、能帶頭，適合管理和布局' }],
  ['q6', '最適合你的收入來源', { shou: '穩定薪水加上固定收益', xin: '長期合作的老客戶', zhi: '專業接案、顧問或教學', chuang: '自己的品牌或事業', yuan: '介紹合作與分潤', wang: '投資與多元收入管道' }],
  ['q1', '意外之財怎麼用最旺', { shou: '先放進緊急預備金，心安就是財運', xin: '先把人情和帳還清，信用會替你加分', zhi: '投資一門能加薪的課，報酬最高', chuang: '當成副業的第一筆本金，小試身手', yuan: '請重要的人吃頓飯，貴人運會更旺', wang: '分成三份配置，讓錢替你工作' }],
  ['q8', '你的花錢習慣', { shou: '花在家和生活必需品，踏實但記得也要犒賞自己', xin: '花在送禮回禮，人情周到但要訂預算', zhi: '花在書、課程和工具，是好習慣', chuang: '花在新嘗試和冒險，記得設上限', yuan: '花在聚會請客，熱情要配上預算', wang: '花在品質與升級，買值得的就好' }],
  ['q7', '借貸與人情的界線', { shou: '先顧好自己的存款再說，很健康', xin: '白紙黑字寫清楚，保護雙方', zhi: '先幫對方想辦法，比直接借錢更有用', chuang: '一起做生意前，先把分工和分潤談好', yuan: '能幫就幫，但只借「不還也不心痛」的金額', wang: '看人看事再決定，值得就大方支持' }],
  ['q4', '你要小心的破財點', { shou: '太怕沒錢而不敢投資自己', xin: '被人情綁住而作保或借錢', zhi: '能力沒跟上時代而被淘汰', chuang: '衝太快、成本沒算清楚', yuan: '為了錢跟重要的人鬧翻', wang: '想一次賭太大、錯過分散風險' }],
  ['q9', '低潮時的翻身方式', { shou: '縮減開銷、先守住，等待時機', xin: '誠實面對，一筆一筆還，信用會留下來', zhi: '學一項新技能，從專業找出口', chuang: '換跑道重新開始，你有這個膽識', yuan: '找信任的人商量，貴人會出現', wang: '拉高視野，找更大的機會' }],
  ['q3', '你對財富的心態', { shou: '你相信努力和時間，這是最穩的心態', xin: '你在乎賺得光明正大，錢會留得久', zhi: '你好奇方法，代表你學得會', chuang: '你看到機會就想試，這是創業者的直覺', yuan: '你樂見別人成功，合作運很好', wang: '你想得更大，記得也要一步一步來' }],
  ['q5', '你的招財法寶', { shou: '聚寶盆：守住本金，慢慢變多', xin: '算盤：帳目清楚就是最好的風水', zhi: '妙筆：把點子寫成能賣的東西', chuang: '風火輪：行動就是你的運氣', yuan: '紅線：人脈就是你的金脈', wang: '大元寶：格局決定你的財富上限' }],
  ['q10', '十年後的財富目標', { shou: '有房有存款，不用為錢擔心', xin: '事業有口碑，客人一直回來', zhi: '靠專業就能過好生活', chuang: '擁有自己的事業', yuan: '身邊都是互相扶持的貴人', wang: '財務自由，還能照顧更多人' }],
];

export const QUESTIONS = [
  { id: 'name', kind: 'text', q: '先告訴神明你的名字', hint: '會印在你和神明的合照上。', placeholder: '例如：小安', max: 12 },
  { id: 'q1', q: '突然拿到一筆 10 萬元的意外之財，你會？', options: [
    ['shou', '存起來當緊急預備金'], ['zhi', '報名一門課投資自己'], ['xin', '先還清欠的人情和帳'],
    ['wang', '研究投資，讓錢滾錢'], ['chuang', '拿去當副業或創業本金'], ['yuan', '請家人朋友吃飯，也捐一部分'] ] },
  { id: 'q2', q: '你最常被稱讚的工作特質是？', options: [
    ['xin', '說到做到'], ['chuang', '敢衝、執行力強'], ['shou', '穩定、不出錯'],
    ['yuan', '人緣好、很會牽線'], ['wang', '有遠見、能帶頭'], ['zhi', '專業又有想法'] ] },
  { id: 'q3', q: '看到別人賺大錢，你的第一個念頭是？', options: [
    ['zhi', '好奇他用了什麼方法'], ['shou', '他背後一定很辛苦'], ['yuan', '恭喜他，說不定能合作'],
    ['chuang', '我也要試試看'], ['xin', '希望他賺得光明正大'], ['wang', '想想我能不能做得更大'] ] },
  { id: 'q4', q: '你最怕遇到哪一種財務狀況？', options: [
    ['chuang', '一輩子領死薪水'], ['xin', '被倒帳或被騙'], ['wang', '格局太小錯過機會'],
    ['shou', '突然沒有存款'], ['zhi', '能力跟不上時代'], ['yuan', '為了錢跟人鬧翻'] ] },
  { id: 'q5', q: '如果神明送你一件招財法寶，你選？', options: [
    ['shou', '聚寶盆'], ['xin', '一把公正的算盤'], ['zhi', '一支能寫出好點子的筆'],
    ['chuang', '一雙踏火前進的風火輪'], ['yuan', '一捆牽起貴人的紅線'], ['wang', '一顆會發光的大元寶'] ] },
  { id: 'q6', q: '你理想中的收入來源是？', options: [
    ['yuan', '介紹合作與分潤'], ['wang', '投資與多元收入'], ['shou', '穩定的月薪加上租金'],
    ['zhi', '專業接案或教學'], ['xin', '長期合作的老客戶'], ['chuang', '自己的品牌或公司'] ] },
  { id: 'q7', q: '朋友開口跟你借錢，你會？', options: [
    ['wang', '看人看事，值得就大方支持'], ['yuan', '能幫就幫，不求回報'], ['chuang', '不如一起做點生意'],
    ['xin', '白紙黑字寫清楚'], ['shou', '先看看自己的存款再決定'], ['zhi', '先幫他想辦法解決問題'] ] },
  { id: 'q8', q: '你花錢最不手軟的地方是？', options: [
    ['zhi', '書、課程、工具'], ['wang', '品質好、能升級的東西'], ['shou', '家和生活必需品'],
    ['yuan', '聚會請客'], ['chuang', '新嘗試與旅行冒險'], ['xin', '送禮與回禮'] ] },
  { id: 'q9', q: '遇到財務低潮時，你會？', options: [
    ['chuang', '換跑道重新開始'], ['shou', '縮衣節食，先守住'], ['wang', '拉高視野，找更大的機會'],
    ['zhi', '學新技能找出路'], ['yuan', '找信任的人商量'], ['xin', '誠實面對，一筆一筆還'] ] },
  { id: 'q10', q: '十年後，你希望自己的財富狀態是？', options: [
    ['yuan', '身邊都是互相扶持的貴人'], ['shou', '有房有存款，不用擔心'], ['zhi', '靠專業就能過好生活'],
    ['wang', '財務自由，還能照顧更多人'], ['xin', '事業有口碑，客人一直回來'], ['chuang', '擁有自己的事業'] ] },
  { id: 'sex', kind: 'choice', q: '最後，你想要哪一種財運？', options: [
    ['a', '細水長流，越存越多'], ['b', '大展身手，一次到位'], ['any', '交給神明安排'] ] },
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
  // 同分時，以第五題（招財法寶）為準，其次按題目順序
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
