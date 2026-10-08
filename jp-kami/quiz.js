// 旅神偵測器・日本篇：一趟日本旅行的十題情境測驗 → 旅伴性格 → 神獸或神明 → 守護你出門的那一位
// 文化娛樂與自我覺察，不是宗教儀式，也不是算命。

// 六種旅伴性格：說明與練習屬於性格，每種性格有一隻神獸（a）和一位神明（b）
export const TAGS = {
  dao: { tag: '領航',
    note: '你是隊伍裡的方向感。大家迷路時會先看你，因為你總能找到下一步。',
    try: '下次出門前，先把集合點和備案路線傳到群組，讓大家安心。' },
  ji: { tag: '規劃',
    note: '你的旅行從出發前就開始了。行程、預算、交通，你一手掌握，大家玩得放心。',
    try: '把行程留一段「空白時間」，讓意外的驚喜有地方發生。' },
  tan: { tag: '冒險',
    note: '你最愛沒去過的地方。地圖上的空白，對你來說都是邀請函。',
    try: '這個月挑一個沒去過的地方，就算只是隔壁區的小巷也好。' },
  hu: { tag: '照顧',
    note: '你是隊伍的守護者。誰累了、誰餓了、誰不開心，你總是第一個發現。',
    try: '這次旅行也排一段「只照顧自己」的時間，你值得被好好對待。' },
  le: { tag: '氣氛',
    note: '有你在，再普通的路也會變成回憶。笑聲是你送給大家最好的伴手禮。',
    try: '幫這趟旅行想一個隊名或口號，拍一張最好笑的合照。' },
  en: { tag: '結緣',
    note: '你走到哪裡都交得到朋友。旅途上遇見的人，常常成為你的貴人。',
    try: '在旅途上主動跟一位當地人聊天，問他最推薦的私房景點。' },
};

export const TAG_NAMES = {
  dao: { zh: '領航', ja: '導き', en: 'NAVIGATOR' }, ji: { zh: '規劃', ja: '段取り', en: 'PLANNER' },
  tan: { zh: '冒險', ja: '冒険', en: 'EXPLORER' }, hu: { zh: '照顧', ja: '守護', en: 'GUARDIAN' },
  le: { zh: '氣氛', ja: '盛り上げ', en: 'MOOD MAKER' }, en: { zh: '結緣', ja: 'ご縁', en: 'CONNECTOR' },
};

// 十二位日本的神獸與神明。style：a＝神獸、b＝神明
// 每位的圖放在 stands/<id>.webp（左右構圖用 stands/<id>_left.webp、stands/<id>_right.webp，正中央與片頭用 stands/<id>_front.webp）
export const STANDS = {
  yatagarasu: { tagId: 'dao', style: 'a', name: 'YATAGARASU', zh: '八咫烏',
    tint: '#1f2a44', glow: '#ffd27a', text: '#ffb84d',
    grade: { pow: 'A', spd: 'B', rng: 'B', dur: 'A', pre: 'A', gro: 'B' },
    ability: '三隻腳的神鳥，傳說曾替神武天皇帶路。八咫烏守護替大家找方向的人，再陌生的地方，你都走得出路。' },
  amaterasu: { tagId: 'dao', style: 'b', name: 'AMATERASU', zh: '天照大神',
    tint: '#d9822b', glow: '#fff1b8', text: '#ffcc4d',
    grade: { pow: 'A', spd: 'B', rng: 'A', dur: 'A', pre: 'B', gro: 'A' },
    ability: '照亮天地的太陽女神。天照守護走在前面、讓大家安心的人，你在的地方，就是光的方向。' },
  inari: { tagId: 'ji', style: 'a', name: 'INARI', zh: '稻荷神（神狐）',
    tint: '#c8372d', glow: '#ffe0c8', text: '#ff6a4d',
    grade: { pow: 'A', spd: 'C', rng: 'B', dur: 'A', pre: 'A', gro: 'B' },
    ability: '叼著寶珠與倉庫鑰匙的神狐。稻荷神守護把一切準備周全的人，你的好行程，就是大家的好運氣。' },
  bishamonten: { tagId: 'ji', style: 'b', name: 'BISHAMONTEN', zh: '毘沙門天',
    tint: '#2a4f8f', glow: '#d6e4ff', text: '#6f9cff',
    grade: { pow: 'A', spd: 'B', rng: 'B', dur: 'A', pre: 'A', gro: 'B' },
    ability: '七福神裡的戰神，手持寶塔與寶棒。毘沙門天守護運籌帷幄的人，事前想得越清楚，路上越順。' },
  ryujin: { tagId: 'tan', style: 'a', name: 'RYUJIN', zh: '龍神',
    tint: '#1d7a78', glow: '#c8fff4', text: '#4fe0c8',
    grade: { pow: 'A', spd: 'A', rng: 'B', dur: 'B', pre: 'C', gro: 'A' },
    ability: '掌管海與雨的龍神，在雲裡翻騰前進。龍神守護敢往未知出發的人，你越勇敢，路就開得越寬。' },
  tengu: { tagId: 'tan', style: 'b', name: 'TENGU', zh: '大天狗',
    tint: '#9b2b2b', glow: '#ffd0b8', text: '#ff5c4d',
    grade: { pow: 'A', spd: 'A', rng: 'B', dur: 'B', pre: 'B', gro: 'B' },
    ability: '住在深山、一揮羽扇就能颳起大風。天狗守護愛上山下海、挑戰極限的人，你的腳步就是你的修行。' },
  okami: { tagId: 'hu', style: 'a', name: 'OKAMI', zh: '大口真神（神狼）',
    tint: '#3d4a5c', glow: '#e4ecff', text: '#9fb8e8',
    grade: { pow: 'B', spd: 'B', rng: 'B', dur: 'A', pre: 'B', gro: 'A' },
    ability: '在山路上守護旅人的神狼。大口真神守護照顧夥伴的人，你在隊伍裡，大家就一個都不會走丟。' },
  sakuya: { tagId: 'hu', style: 'b', name: 'SAKUYA', zh: '木花咲耶姬',
    tint: '#d46a8c', glow: '#ffe4ee', text: '#ff8fb3',
    grade: { pow: 'B', spd: 'C', rng: 'A', dur: 'A', pre: 'B', gro: 'A' },
    ability: '富士山的櫻花女神。木花咲耶姬守護溫柔照顧別人的人，你給出去的體貼，會像櫻花一樣回來。' },
  manekineko: { tagId: 'le', style: 'a', name: 'MANEKI-NEKO', zh: '招財貓',
    tint: '#d9a520', glow: '#fff3c4', text: '#ffcf33',
    grade: { pow: 'A', spd: 'B', rng: 'A', dur: 'B', pre: 'C', gro: 'A' },
    ability: '舉起手就招來福氣和人潮的神貓。招財貓守護把氣氛炒熱的人，你一笑，好運就跟著上門。' },
  benzaiten: { tagId: 'le', style: 'b', name: 'BENZAITEN', zh: '弁財天',
    tint: '#6a3fb0', glow: '#ead8ff', text: '#b98aff',
    grade: { pow: 'B', spd: 'B', rng: 'A', dur: 'B', pre: 'B', gro: 'A' },
    ability: '七福神裡唯一的女神，彈著琵琶、掌管藝能與財富。弁財天守護會帶動大家的人，你的旅行永遠有配樂。' },
  shirousagi: { tagId: 'en', style: 'a', name: 'SHIROUSAGI', zh: '因幡白兔',
    tint: '#4f7fbf', glow: '#f2f7ff', text: '#8fc0ff',
    grade: { pow: 'B', spd: 'A', rng: 'A', dur: 'B', pre: 'C', gro: 'A' },
    ability: '神話裡牽起大國主神良緣的白兔，日本最有名的結緣神獸。白兔守護到處結善緣的人，路上的相遇都是命中注定。' },
  daikokuten: { tagId: 'en', style: 'b', name: 'DAIKOKUTEN', zh: '大黑天',
    tint: '#8a5a1f', glow: '#ffe6b0', text: '#ffb84d',
    grade: { pow: 'A', spd: 'C', rng: 'A', dur: 'A', pre: 'B', gro: 'A' },
    ability: '背著大福袋、手持萬寶槌的七福神，也是結緣之神大國主。大黑天守護廣結善緣的人，你身邊的人，就是你最大的福氣。' },
};

// 篇：同一套測驗與相機，換一包神明、圖與文字
export const PACK = { id: 'japan', name: { zh: '日本篇', ja: '日本編', en: 'JAPAN EDITION' } };

// 三種語言的名字、稱號與台詞（相機畫面上的標題與對話框用）
export const LANGS = { zh: '中文', ja: '日本語', en: 'EN' };
export const LOCALE = {
  yatagarasu: { names: { zh: '八咫烏', ja: '八咫烏', en: 'YATAGARASU' }, titles: { zh: '導路神鳥', ja: '道を拓く三本足', en: 'The Three-Legged Guide' },
    line: { zh: '跟著我，不會迷路的！', ja: '迷うな。道は俺が示す。', en: "Follow me. I know the way." } },
  amaterasu: { names: { zh: '天照', ja: '天照', en: 'AMATERASU' }, titles: { zh: '太陽女神', ja: '天を照らす日の女神', en: 'Goddess of the Rising Sun' },
    line: { zh: '往有光的地方走，就對了。', ja: '光のある方へ。あなたなら大丈夫。', en: 'Walk toward the light. You were born to lead.' } },
  inari: { names: { zh: '稻荷', ja: 'お稲荷さま', en: 'INARI' }, titles: { zh: '五穀豐收的神狐', ja: '千本鳥居の白狐', en: 'Fox of a Thousand Gates' },
    line: { zh: '準備好了嗎？好運，我已經幫你排進行程了。', ja: '準備は万端。あとは楽しむだけだよ。', en: "Everything's planned. All that's left is to enjoy it." } },
  bishamonten: { names: { zh: '毘沙門天', ja: '毘沙門天', en: 'BISHAMONTEN' }, titles: { zh: '七福神・戰神', ja: '七福神の守護将', en: 'General of the Seven Gods' },
    line: { zh: '作戰計畫完美，出發！', ja: '備えあれば憂いなし。いざ、出陣！', en: 'Plan the battle, then win it. Move out!' } },
  ryujin: { names: { zh: '龍神', ja: '龍神', en: 'RYUJIN' }, titles: { zh: '雲海之龍', ja: '雲を裂く龍神', en: 'Dragon of the Clouds' },
    line: { zh: '地圖外面，才是真正的冒險！', ja: '地図の外へ行こうぜ。そこからが本番だ。', en: "Off the map is where the adventure begins." } },
  tengu: { names: { zh: '天狗', ja: '天狗', en: 'TENGU' }, titles: { zh: '深山之主', ja: '霊峰を翔ける大天狗', en: 'Lord of the Sacred Peaks' },
    line: { zh: '山再高，也擋不住你！', ja: '高い山ほど、景色は最高だ！', en: 'The higher the climb, the better the view.' } },
  okami: { names: { zh: '大口真神', ja: '大口真神', en: 'OKAMI' }, titles: { zh: '山路的守護神狼', ja: '旅人を護る白狼', en: 'Wolf Who Guards Travelers' },
    line: { zh: '放心走，我在後面顧著。', ja: '安心して進め。背中は任せろ。', en: "Go on ahead. I've got your back." } },
  sakuya: { names: { zh: '咲耶姬', ja: '咲耶姫', en: 'SAKUYA' }, titles: { zh: '富士的櫻花女神', ja: '富士に咲く桜の姫', en: 'Cherry Blossom of Mt. Fuji' },
    line: { zh: '累了就休息一下，風景不會跑掉的。', ja: '疲れたら休もう。桜は待っててくれるから。', en: "Rest if you're tired. The blossoms will wait." } },
  manekineko: { names: { zh: '招財貓', ja: '招き猫', en: 'MANEKI-NEKO' }, titles: { zh: '招福的神貓', ja: '福を招く猫神さま', en: 'The Lucky Cat' },
    line: { zh: '笑一個～好運都被你招來囉！', ja: '笑う門には福来たる、だニャ！', en: 'Smile! Good luck follows good vibes.' } },
  benzaiten: { names: { zh: '弁財天', ja: '弁財天', en: 'BENZAITEN' }, titles: { zh: '七福神・藝能女神', ja: '琵琶を奏でる芸能の女神', en: 'Muse of the Seven Gods' },
    line: { zh: '這趟旅行，要有最好聽的配樂！', ja: 'さあ、旅に音楽を。最高の思い出にしましょう。', en: "Every great trip needs a soundtrack." } },
  shirousagi: { names: { zh: '白兔', ja: '白兎', en: 'SHIROUSAGI' }, titles: { zh: '結緣神兔', ja: '縁を結ぶ白兎', en: 'Rabbit of Fated Encounters' },
    line: { zh: '下一個轉角，會遇見對的人喔！', ja: '次の角を曲がったら、素敵なご縁が待ってるよ。', en: "Around the next corner, someone special is waiting." } },
  daikokuten: { names: { zh: '大黑天', ja: '大黒天', en: 'DAIKOKUTEN' }, titles: { zh: '七福神・結緣福神', ja: '七福神の縁結び福神', en: 'God of Fortune and Bonds' },
    line: { zh: '朋友多，福氣就多！', ja: 'ご縁は宝。福袋いっぱいに詰めていこう！', en: 'Friends are the real treasure. Fill the bag!' } },
};

// 旅伴分析：主性格決定「你的旅伴角色」，副性格給混搭，每一題選的選項再各給一句
export const MEDIA = {
  dao: { role: '領航隊長', pitch: '你天生有方向感，也敢做決定。有你帶路，大家可以放心看風景。',
    topics: ['自由行帶隊', '城市散步', '登山健行', '公路旅行'],
    formats: '先講好集合點與時間，決定前問一句「大家覺得呢？」', platforms: '規劃型與照顧型的夥伴：一個幫你排細節、一個幫你顧人',
    first: '下一趟旅行，主動當一天的帶路人，並先做好一個雨天備案。', watch: '走太快、忘了回頭等大家。', mix: '多一點方向感，關鍵時刻敢做決定' },
  ji: { role: '行程軍師', pitch: '你讓旅行變得輕鬆。交通、訂房、預算，交給你最安心。',
    topics: ['精打細算的自由行', '美食與排隊名店', '溫泉旅館', '季節限定活動'],
    formats: '做一份共用行程表、預算分帳先講好', platforms: '冒險型與氣氛型的夥伴：替你的計畫加上驚喜和笑聲',
    first: '把下次旅行的行程留半天空白，看看會發生什麼好事。', watch: '行程排太滿，或因為計畫被打亂而心情不好。', mix: '多一點準備，玩得更放心' },
  tan: { role: '探險先鋒', pitch: '你負責發現。小巷、秘境、沒人去過的店，都是你帶大家找到的。',
    topics: ['秘境與離島', '登山、潛水、滑雪', '在地人才知道的店', '說走就走的旅行'],
    formats: '出發前查好安全資訊、讓同伴知道你的位置', platforms: '領航型與照顧型的夥伴：替你的衝勁踩一點煞車',
    first: '挑一個附近沒去過的地方，這個週末就出發。', watch: '太衝動而忽略安全，或讓同伴跟不上。', mix: '多一點好奇心，旅途更有故事' },
  hu: { role: '隊伍守護者', pitch: '你讓每個人都玩得開心又安全。藥、水、充電器，你包包裡什麼都有。',
    topics: ['家族旅行', '親子與長輩同行', '療癒系小旅行', '慢步調的鄉間旅行'],
    formats: '準備隨身急救包、留意大家的體力與情緒', platforms: '氣氛型與結緣型的夥伴：讓你也能放鬆、被照顧',
    first: '下次旅行替自己安排一段獨處時間，好好照顧自己。', watch: '一直照顧別人，自己卻累壞了。', mix: '多一點體貼，大家都玩得安心' },
  le: { role: '開心果', pitch: '你是旅行的靈魂。塞車、下雨、迷路，有你在都能變成好笑的回憶。',
    topics: ['朋友團旅行', '祭典與演唱會', '主題樂園', '夜生活與美食'],
    formats: '負責拍照、選音樂、炒熱氣氛，並留意安靜的同伴', platforms: '規劃型與領航型的夥伴：替你的熱情打好基礎',
    first: '替下次旅行做一份歌單，或想一個全員要做的合照動作。', watch: '玩太嗨而忘了時間，或沒注意到累了的人。', mix: '多一點笑聲，旅途更難忘' },
  en: { role: '結緣大使', pitch: '你最會遇見好人。問路問出朋友、搭車聊出機會，旅途就是你的貴人地圖。',
    topics: ['打工度假與交換', '民宿與沙發衝浪', '參加當地活動與工作坊', '跨國朋友團'],
    formats: '學幾句當地語言、準備一點小禮物、記得交換聯絡方式', platforms: '冒險型與領航型的夥伴：帶你到更多可以結緣的地方',
    first: '下次旅行，主動跟一位當地人聊天，問他的私房推薦。', watch: '對陌生人太快信任，或答應太多約而累壞自己。', mix: '多一點好人緣，路上處處是貴人' },
};

// 依「本人實際選的答案」產生的旅伴分析：每一題選的選項各給一句
export const ANSWER_MEDIA = [
  ['q1', '你出發前的樣子', { ji: '行程表在手，出發就有底氣', tan: '說走就走，最自由', le: '最期待的是跟誰一起去', hu: '先想到大家需要什麼' }],
  ['q2', '你的行李哲學', { hu: '什麼都帶，大家都靠你', ji: '剛剛好，一切都算好了', tan: '輕裝上路，空間留給新發現', en: '伴手禮的位置先留好' }],
  ['q3', '你在月台上的反應', { dao: '馬上找出新路線，最可靠', le: '先安撫大家，再一起想辦法', ji: '早就有備案，不慌不忙', en: '開口問人，問到更好的走法' }],
  ['q4', '迷路時的你', { tan: '迷路也是一種冒險', dao: '看地圖、找地標，自己找出路', en: '問當地人，順便交個朋友', hu: '先確認大家都跟上了' }],
  ['q5', '你抽到的籤', { dao: '相信自己的方向', en: '相信路上的貴人', tan: '相信未知的驚喜', hu: '相信同伴之間的互相照顧' }],
  ['q6', '下雨天的你', { le: '雨天也玩得很開心，最會轉換心情', ji: '立刻換成室內行程，超有效率', hu: '先發雨傘、顧好大家', tan: '雨中的景色反而最特別' }],
  ['q7', '溫泉旅館的晚上', { le: '你是宴會的主角', en: '跟隔壁桌的旅客聊開了', hu: '默默替大家鋪好被子', dao: '已經在想明天怎麼走最好' }],
  ['q8', '團體意見不合時', { dao: '你敢做決定，讓隊伍往前走', hu: '你照顧每個人的感受', le: '你用笑聲化解尷尬', ji: '你拿出方案，讓大家選' }],
  ['q9', '你最想帶回家的', { en: '一段新的緣分', le: '一堆好笑的回憶', ji: '一次完美的旅程', tan: '一個沒人知道的秘境' }],
  ['q10', '你的下一趟旅行', { tan: '去更遠、更沒去過的地方', en: '去拜訪路上認識的朋友', dao: '帶更多人一起出發', le: '找同一群人再去一次' }],
];

export const STORY = '你要和朋友去日本旅行。從出發前到回程，一路上的選擇，會透露你是什麼樣的旅伴。';
export const QUESTIONS = [
  { id: 'name', kind: 'text', q: '出發前，先寫下你的名字', hint: '會印在你和守護神的合照上。', placeholder: '例如：小安', max: 12 },
  { id: 'q1', scene: '出發前一晚', q: '出發前一晚，你在做什麼？', options: [
    ['ji', '最後一次確認行程表和車票'], ['tan', '什麼都還沒查，到了再說'], ['le', '在群組裡跟大家倒數、分享期待'], ['hu', '幫大家準備藥品和暖暖包'] ] },
  { id: 'q2', scene: '行李箱', q: '你的行李箱打開，裡面是？', options: [
    ['ji', '每天的衣服都配好了，一套一套放'], ['hu', '大家可能用到的東西，什麼都有'], ['tan', '只有一個背包，輕裝上路'], ['en', '一半是空的，要裝伴手禮'] ] },
  { id: 'q3', scene: '車站', q: '到了車站，發現電車停駛了。你會？', options: [
    ['dao', '馬上查替代路線，帶大家換車'], ['ji', '拿出早就準備好的備案'], ['en', '去問站務員或旁邊的當地人'], ['le', '先說「這也是一種回憶啦！」讓大家放鬆'] ] },
  { id: 'q4', scene: '老街', q: '在京都的小巷裡迷路了，你會？', options: [
    ['tan', '乾脆往沒走過的巷子鑽，看看有什麼'], ['dao', '看地圖、找地標，帶大家走出去'], ['en', '問路，結果被店家阿姨招待了一杯茶'], ['hu', '先確認每個人都跟上了'] ] },
  { id: 'q5', scene: '神社', q: '在神社抽到一支籤：「待ち人 来る」（等的人會來）。你覺得是在說？', options: [
    ['en', '這趟旅行會遇見重要的人'], ['dao', '要我主動去找，答案在前方'], ['tan', '會有意想不到的驚喜'], ['hu', '身邊的同伴，就是我在等的人'] ] },
  { id: 'q6', scene: '下雨天', q: '原本要去看富士山，結果整天下雨。你會？', options: [
    ['ji', '立刻換成室內行程：美術館和商店街'], ['le', '穿上雨衣去玩水，拍超好笑的照片'], ['hu', '先去便利商店幫大家買雨傘'], ['tan', '堅持出發：雨中的富士山說不定更美'] ] },
  { id: 'q7', scene: '溫泉旅館', q: '晚上在溫泉旅館，你在做什麼？', options: [
    ['le', '帶大家玩遊戲，笑到隔壁來敲門'], ['en', '在大廳跟其他旅客聊天'], ['dao', '研究明天的路線'], ['hu', '幫大家鋪被子、倒熱茶'] ] },
  { id: 'q8', scene: '意見不合', q: '大家對明天要去哪裡意見不合，你會？', options: [
    ['dao', '綜合大家的意見，直接做決定'], ['ji', '列出幾個方案，讓大家投票'], ['le', '用一個笑話化解尷尬'], ['hu', '先問最安靜的那位朋友想去哪'] ] },
  { id: 'q9', scene: '伴手禮', q: '回程前，你最想帶回家的是？', options: [
    ['en', '路上交到的新朋友的聯絡方式'], ['le', '手機裡幾百張好笑的照片'], ['ji', '剛好花完的預算和完美的回憶'], ['tan', '一個只有你知道的秘境'] ] },
  { id: 'q10', scene: '回程', q: '飛機起飛時，你心裡想的是？', options: [
    ['tan', '「下次要去更遠的地方」'], ['en', '「要回來看看那些朋友」'], ['dao', '「下次換我帶更多人來」'], ['le', '「下次還要跟這群人一起」'] ] },
  { id: 'sex', kind: 'choice', scene: '鳥居前', q: '最後，穿過鳥居時，你希望誰陪你上路？', options: [
    ['a', '可愛又強大的神獸'], ['b', '帥氣又神秘的神明'], ['any', '交給緣分決定'] ] },
];

// 旅運六項：每一角都有自己的意思
export const STAT_KEYS = [['pow', '外出運'], ['spd', '冒險心'], ['rng', '貴人運'], ['dur', '團隊力'], ['pre', '規劃力'], ['gro', '療癒力']];
export const STAT_INFO = {
  pow: { short: { zh: '外出運', ja: '旅運', en: 'TRAVEL LUCK' }, desc: '出門順不順、天氣和交通站不站在你這邊' },
  spd: { short: { zh: '冒險心', ja: '冒険心', en: 'ADVENTURE' }, desc: '敢不敢去沒去過的地方' },
  rng: { short: { zh: '貴人運', ja: '縁', en: 'HELPERS' }, desc: '旅途上遇到好人、被幫忙的機會' },
  dur: { short: { zh: '團隊力', ja: '協調性', en: 'TEAMWORK' }, desc: '和同伴一起合作、互相配合' },
  pre: { short: { zh: '規劃力', ja: '段取り力', en: 'PLANNING' }, desc: '行程、預算與備案安排' },
  gro: { short: { zh: '療癒力', ja: '癒し', en: 'HEALING' }, desc: '讓自己和大家放鬆、恢復元氣' },
};

export function standById(id, owner = '') {
  const s = STANDS[id];
  return { id, owner, ...TAGS[s.tagId], ...s, ...LOCALE[id], tagNames: TAG_NAMES[s.tagId] };
}

export function computeStand(a) {
  const count = {};
  for (const q of QUESTIONS) if (/^q\d+$/.test(q.id) && a[q.id]) count[a[q.id]] = (count[a[q.id]] || 0) + 1;
  const best = Math.max(0, ...Object.values(count));
  // 同分時，以第五題（神社抽籤）為準，其次按題目順序
  const tied = Object.keys(count).filter((k) => count[k] === best);
  const tagId = tied.includes(a.q5) ? a.q5 : tied[0] || 'dao';
  const second = Object.keys(count).filter((k) => k !== tagId).sort((x, y) => count[y] - count[x])[0] || null;
  const pair = Object.keys(STANDS).filter((id) => STANDS[id].tagId === tagId);
  let style = a.sex;
  if (style !== 'a' && style !== 'b') {
    // 「交給緣分」：用答案算出固定的結果，重看時不會變
    let h = 0; for (const ch of JSON.stringify(a)) h = (h * 31 + ch.charCodeAt(0)) | 0;
    style = h & 1 ? 'b' : 'a';
  }
  const id = pair.find((k) => STANDS[k].style === style) || pair[0];
  return { ...standById(id, (a.name || '').trim() || '旅人'), second, counts: count, answers: a };
}
