// 江湖英雄榜・武俠篇：十個江湖情境 → 你的俠客性格 → 你心中的英雄 → 跟英雄學一招，AR 相機發出氣芒
// 向金庸武俠小說致敬的性格小遊戲。人物圖為原創水墨插圖，招式特效為原創設計。不是算命。

// 六種俠客性格：說明與練習屬於性格，每種性格有一位剛猛（a）和一位靈動（b）的英雄
export const TAGS = {
  shou: { tag: '守護',
    note: '你是大家的靠山。答應過的事一定做到，有人需要時，你永遠站在最前面。',
    try: '這週替一個需要幫忙的人做一件小事，不用說出來。' },
  hao: { tag: '豪情',
    note: '你重情重義、說話直接。朋友有難，你二話不說就到；看不慣的事，你會說出來。',
    try: '打給一個很久沒聯絡、但你很在乎的朋友，約他吃一頓飯。' },
  qing: { tag: '深情',
    note: '你對在乎的人全心全意。比起天下第一，你更想守著一個懂你的人。',
    try: '把一句一直沒說出口的感謝，傳給那個重要的人。' },
  ren: { tag: '仁厚',
    note: '你心軟又包容，最會化解衝突。就算被誤會，你也先想著別讓任何人受傷。',
    try: '這週試著對自己也溫柔一點：做一件讓自己開心的事。' },
  zhen: { tag: '率真',
    note: '你活得自在、真心待人。名利對你沒那麼重要，好玩、真誠才是你的江湖。',
    try: '挑一件你一直想學、但覺得「沒什麼用」的事，這週開始玩玩看。' },
  qi: { tag: '機變',
    note: '你腦筋動得最快，總能在絕境裡想出一條活路。不按牌理出牌，是你最大的武器。',
    try: '把最近卡住的一件事，換一個完全不同的角度重新想一次。' },
};

export const TAG_NAMES = {
  shou: { zh: '守護', ja: '守護', en: 'GUARDIAN' }, hao: { zh: '豪情', ja: '豪傑', en: 'BOLD HEART' },
  qing: { zh: '深情', ja: '一途', en: 'DEVOTED' }, ren: { zh: '仁厚', ja: '仁愛', en: 'KIND SOUL' },
  zhen: { zh: '率真', ja: '天真', en: 'FREE SPIRIT' }, qi: { zh: '機變', ja: '機転', en: 'TRICKSTER' },
};

// 十二位英雄。style：a＝剛猛、b＝靈動
// move：招式（gesture＝要比的手勢：palm 張開手掌、sword 劍指、point 食指、pinch 蘭花指、thumb 比讚；fx＝特效）
// 圖放在 stands/<id>.webp
export const STANDS = {
  guojing: { tagId: 'shou', style: 'a', name: '郭靖', zh: '郭靖・北俠',
    tint: '#6b4a1f', glow: '#ffd36b', text: '#ffc24d',
    grade: { pow: 'A', spd: 'C', rng: 'A', dur: 'A', pre: 'C', gro: 'A' },
    move: { name: '降龍十八掌', sub: '飛龍在天', gesture: 'palm', fx: 'dragon' },
    ability: '資質不算聰明，卻靠著一千遍、一萬遍的苦練，練成天下最剛猛的掌法。他守著一座城幾十年，因為那裡有他要保護的人。「俠之大者，為國為民」，說的就是你這種人。' },
  huangrong: { tagId: 'shou', style: 'b', name: '黃蓉', zh: '黃蓉・女諸葛',
    tint: '#4f7a3a', glow: '#e8ffc8', text: '#b5e86a',
    grade: { pow: 'B', spd: 'A', rng: 'A', dur: 'B', pre: 'A', gro: 'A' },
    move: { name: '蘭花拂穴手', sub: '指如蘭花', gesture: 'pinch', fx: 'petals' },
    ability: '聰明伶俐、鬼點子最多，做得一手好菜，也當得起一整個幫派的幫主。她用智慧守護身邊的人：別人用拳頭解決的事，她用一個計策就解決了。' },
  xiaofeng: { tagId: 'hao', style: 'a', name: '蕭峰', zh: '蕭峰・南院大王',
    tint: '#5a2a2a', glow: '#ffb38a', text: '#ff7a4d',
    grade: { pow: 'A', spd: 'B', rng: 'A', dur: 'A', pre: 'B', gro: 'A' },
    move: { name: '降龍十八掌', sub: '亢龍有悔', gesture: 'palm', fx: 'dragon' },
    ability: '一碗酒交一個朋友，一掌打退千軍萬馬。被全天下誤會時，他不辯解，只用行動證明自己。你和他一樣：義氣比面子重要，朋友比輸贏重要。' },
  linghu: { tagId: 'hao', style: 'b', name: '令狐沖', zh: '令狐沖・獨孤傳人',
    tint: '#2f4f6f', glow: '#cfe8ff', text: '#7fc0ff',
    grade: { pow: 'B', spd: 'A', rng: 'A', dur: 'B', pre: 'B', gro: 'A' },
    move: { name: '獨孤九劍', sub: '無招勝有招', gesture: 'sword', fx: 'ninesword' },
    ability: '愛喝酒、愛笑、不愛規矩，卻比誰都講義氣。他的劍法沒有固定招式，看穿對手的破綻就出手。你也是：不照劇本走，反而走得最瀟灑。' },
  yangguo: { tagId: 'qing', style: 'a', name: '楊過', zh: '楊過・神鵰俠',
    tint: '#3a3f4a', glow: '#d8e0ff', text: '#a8b8ff',
    grade: { pow: 'A', spd: 'A', rng: 'B', dur: 'A', pre: 'A', gro: 'B' },
    move: { name: '黯然銷魂掌', sub: '思念成掌', gesture: 'palm', fx: 'wave' },
    ability: '為了一個約定，等了十六年。他把最深的思念練成了一套掌法，也把傷痛活成了傳奇。你愛一個人的方式，就是不放棄。' },
  xiaolongnu: { tagId: 'qing', style: 'b', name: '小龍女', zh: '小龍女・古墓仙子',
    tint: '#5f6a78', glow: '#f4f8ff', text: '#e0ecff',
    grade: { pow: 'B', spd: 'A', rng: 'C', dur: 'A', pre: 'B', gro: 'A' },
    move: { name: '玉女素心劍', sub: '心意相通', gesture: 'sword', fx: 'swordlight' },
    ability: '清冷安靜、不食人間煙火，心裡卻只住著一個人。她的劍法要兩個人心意相通才最強。你的溫柔不張揚，但一旦認定，就是一輩子。' },
  wuji: { tagId: 'ren', style: 'a', name: '張無忌', zh: '張無忌・明教教主',
    tint: '#6a1f24', glow: '#ffc0a8', text: '#ff6b5a',
    grade: { pow: 'A', spd: 'B', rng: 'A', dur: 'B', pre: 'B', gro: 'A' },
    move: { name: '乾坤大挪移', sub: '借力打力', gesture: 'palm', fx: 'taiji' },
    ability: '身懷絕世神功，最常做的事卻是勸架。他把對手打來的力量轉個方向化解掉，讓大家都不用受傷。你也一樣：最強的力量，是讓衝突消失。' },
  xuzhu: { tagId: 'ren', style: 'b', name: '虛竹', zh: '虛竹・逍遙派掌門',
    tint: '#3d5a78', glow: '#e0f4ff', text: '#9fd8ff',
    grade: { pow: 'A', spd: 'B', rng: 'A', dur: 'A', pre: 'C', gro: 'A' },
    move: { name: '天山六陽掌', sub: '生死符', gesture: 'palm', fx: 'ice' },
    ability: '本來只是個老實的小和尚，因為一次心軟救人，意外得到了一身絕學。好人有好報，在他身上應驗了。你的善良，也會在最意想不到的時候回到你身上。' },
  duanyu: { tagId: 'zhen', style: 'a', name: '段譽', zh: '段譽・大理世子',
    tint: '#3f6a52', glow: '#dcffe8', text: '#7ee0a8',
    grade: { pow: 'A', spd: 'A', rng: 'A', dur: 'C', pre: 'B', gro: 'B' },
    move: { name: '六脈神劍', sub: '劍氣縱橫', gesture: 'point', fx: 'beams' },
    ability: '一個不想學武功的書呆子王子，卻練成了最神奇的劍氣。他真誠、天真，對誰都好。你也是：不爭不搶，福氣反而一直來找你。' },
  botong: { tagId: 'zhen', style: 'b', name: '周伯通', zh: '周伯通・老頑童',
    tint: '#5a5a3a', glow: '#fff8d0', text: '#ffe27a',
    grade: { pow: 'A', spd: 'A', rng: 'B', dur: 'B', pre: 'B', gro: 'B' },
    move: { name: '左右互搏', sub: '一心二用', gesture: 'palm', fx: 'circlesquare' },
    ability: '活了一大把年紀，還像個孩子一樣愛玩。被困在山洞十五年，他發明了自己跟自己打架的武功。你最大的天賦，就是在任何地方都能找到樂趣。' },
  dongfang: { tagId: 'qi', style: 'a', name: '東方不敗', zh: '東方不敗・日月神教',
    tint: '#7a1a2a', glow: '#ffc0d0', text: '#ff4d6a',
    grade: { pow: 'A', spd: 'A', rng: 'C', dur: 'A', pre: 'A', gro: 'C' },
    move: { name: '葵花點穴手', sub: '繡花針', gesture: 'pinch', fx: 'needles' },
    ability: '快到沒有人看得清的身手，一根繡花針就能決定勝負。神秘、自成一格，從不在意別人怎麼看。你也一樣：做自己，就是最強的武功。' },
  xiaobao: { tagId: 'qi', style: 'b', name: '韋小寶', zh: '韋小寶・鹿鼎公',
    tint: '#2a4a8a', glow: '#fff0b0', text: '#ffd24d',
    grade: { pow: 'C', spd: 'A', rng: 'A', dur: 'C', pre: 'A', gro: 'B' },
    move: { name: '神行百變', sub: '溜之大吉', gesture: 'thumb', fx: 'coins' },
    ability: '武功最差，卻是混得最好的那一個。靠一張嘴、一顆機靈的腦袋和講義氣，交遍天下朋友。你懂得變通，任何場面都難不倒你。' },
};

// 篇
export const PACK = { id: 'wuxia', name: { zh: '武俠篇', ja: '武侠編', en: 'WUXIA EDITION' } };

// 三種語言的名字、稱號與台詞（相機畫面上的標題與對話框用）
export const LANGS = { zh: '中文', ja: '日本語', en: 'EN' };
export const LOCALE = {
  guojing: { names: { zh: '郭靖', ja: '郭靖', en: 'GUO JING' }, titles: { zh: '為國為民的北俠', ja: '国を護る北の大侠', en: 'The Hero of the North' },
    line: { zh: '練一千遍，就會了。', ja: '千回やれば、必ずできる。', en: 'Practice it a thousand times. You will get it.' } },
  huangrong: { names: { zh: '黃蓉', ja: '黄蓉', en: 'HUANG RONG' }, titles: { zh: '鬼靈精怪的女諸葛', ja: '知略の女軍師', en: 'The Cleverest Girl in Jianghu' },
    line: { zh: '打不贏？那就想個辦法讓他自己認輸。', ja: '力で勝てないなら、知恵で勝てばいいの。', en: "Can't win by force? Then win by wit." } },
  xiaofeng: { names: { zh: '蕭峰', ja: '蕭峰', en: 'XIAO FENG' }, titles: { zh: '義薄雲天的大英雄', ja: '義に生きる大英雄', en: 'The Righteous Giant' },
    line: { zh: '來，乾了這碗，我們就是兄弟。', ja: 'この一杯を飲み干せば、俺たちは兄弟だ。', en: 'Drink this bowl with me, and we are brothers.' } },
  linghu: { names: { zh: '令狐沖', ja: '令狐冲', en: 'LINGHU CHONG' }, titles: { zh: '笑傲江湖的浪子', ja: '江湖を笑い渡る剣士', en: 'The Laughing Swordsman' },
    line: { zh: '人生在世，開心最重要。', ja: '生きてるうちは、笑ってなんぼだ。', en: "Life's too short not to laugh." } },
  yangguo: { names: { zh: '楊過', ja: '楊過', en: 'YANG GUO' }, titles: { zh: '神鵰大俠', ja: '神鵰の大侠', en: 'The Condor Hero' },
    line: { zh: '等一個人，再久都值得。', ja: '待つ価値のある人がいる。', en: 'Some people are worth waiting a lifetime for.' } },
  xiaolongnu: { names: { zh: '小龍女', ja: '小龍女', en: 'XIAOLONGNÜ' }, titles: { zh: '古墓裡的仙子', ja: '古墓の仙女', en: 'The Maiden of the Ancient Tomb' },
    line: { zh: '心靜了，劍就快了。', ja: '心が静まれば、剣は速くなる。', en: 'Still the heart, and the sword flies.' } },
  wuji: { names: { zh: '張無忌', ja: '張無忌', en: 'ZHANG WUJI' }, titles: { zh: '化解恩怨的教主', ja: '争いを鎮める教主', en: 'The Peacemaker' },
    line: { zh: '別打了，大家都不要受傷。', ja: 'もうやめよう。誰も傷つかなくていい。', en: "Let's stop. No one needs to get hurt." } },
  xuzhu: { names: { zh: '虛竹', ja: '虚竹', en: 'XUZHU' }, titles: { zh: '好人有好報的小和尚', ja: '善意が報われた若き僧', en: 'The Lucky Monk' },
    line: { zh: '多做一件好事，運氣就多一分。', ja: '善いことをひとつ。運がひとつ巡ってくる。', en: 'Do one more good deed. Luck will find you.' } },
  duanyu: { names: { zh: '段譽', ja: '段誉', en: 'DUAN YU' }, titles: { zh: '天真的大理王子', ja: '大理の天真な王子', en: 'The Innocent Prince' },
    line: { zh: '真心待人，就不怕吃虧。', ja: '真心で向き合えば、損なんてしない。', en: 'Be sincere. It always pays off.' } },
  botong: { names: { zh: '周伯通', ja: '周伯通', en: 'ZHOU BOTONG' }, titles: { zh: '永遠長不大的老頑童', ja: '永遠のいたずら老人', en: 'The Eternal Child' },
    line: { zh: '好玩嗎？好玩就對啦！', ja: '面白いか？なら正解じゃ！', en: "Is it fun? Then you're doing it right!" } },
  dongfang: { names: { zh: '東方不敗', ja: '東方不敗', en: 'DONGFANG BUBAI' }, titles: { zh: '天下無敵的教主', ja: '天下無敵の教主', en: 'The Undefeated' },
    line: { zh: '別人怎麼看，與我何干。', ja: '人がどう見ようと、私は私。', en: 'What others think is none of my business.' } },
  xiaobao: { names: { zh: '韋小寶', ja: '韋小宝', en: 'WEI XIAOBAO' }, titles: { zh: '最會混的鹿鼎公', ja: '世渡り上手の鹿鼎公', en: 'The Smoothest Talker' },
    line: { zh: '打不過就跑，跑得掉就是贏！', ja: '勝てなきゃ逃げる。逃げ切れば勝ちだ！', en: "Can't win? Run! Getting away is winning!" } },
};

// 江湖分析：主性格決定「你在江湖的角色」，副性格給混搭，每一題選的選項再各給一句
export const MEDIA = {
  shou: { role: '守城大俠', pitch: '你是團體裡最可靠的那根柱子。大家遇到麻煩，第一個想到的就是你。',
    topics: ['帶領團隊', '照顧家人', '長期經營一件事', '當別人的後盾'],
    formats: '把承諾說清楚、做到；累了也要說出來', platforms: '機變型與率真型的朋友：替你的責任感加一點彈性和輕鬆',
    first: '這週列出三件「一直在扛、其實可以請人幫忙」的事，挑一件交出去。', watch: '什麼都自己扛，把自己累垮了。', mix: '多一份擔當，讓大家安心' },
  hao: { role: '豪俠', pitch: '你有一呼百應的魅力。義氣、直接、敢說敢做，朋友都願意跟著你。',
    topics: ['結交朋友', '帶動活動', '仗義執言', '說走就走的冒險'],
    formats: '直接說出想法，但先聽完對方的話', platforms: '深情型與仁厚型的朋友：讓你的熱血多一分細膩',
    first: '主動揪一個很久沒見的朋友聚一聚，由你來安排。', watch: '說話太直傷到人，或衝太快沒想清楚。', mix: '多一點義氣與膽識' },
  qing: { role: '癡情俠侶', pitch: '你重感情、懂得珍惜。比起贏過所有人，你更在乎身邊那個人好不好。',
    topics: ['經營關係', '用心送禮', '長期的承諾', '陪伴與傾聽'],
    formats: '把在乎說出口，也記得照顧自己的心', platforms: '率真型與豪情型的朋友：帶你出去走走，別一直等',
    first: '寫一封短訊給一個重要的人，告訴他你為什麼珍惜他。', watch: '太在乎一個人，忘了自己也需要被愛。', mix: '多一份真心，關係更深' },
  ren: { role: '和事佬掌門', pitch: '你是團體裡的調和者。你一出現，緊張的氣氛就會鬆下來。',
    topics: ['調解衝突', '照顧弱者', '志工與公益', '團隊溝通'],
    formats: '先聽每個人的立場，再找大家都能接受的路', platforms: '守護型與機變型的朋友：幫你在心軟時守住底線',
    first: '這週練習說一次「不」，對一件你其實不想答應的事。', watch: '太怕衝突，委屈了自己。', mix: '多一點包容，讓大家和氣' },
  zhen: { role: '逍遙散人', pitch: '你活得真、活得自在。你的快樂很有感染力，跟你在一起的人都會變輕鬆。',
    topics: ['興趣與創作', '旅行與探索', '學新東西', '跟孩子一起玩'],
    formats: '保持好奇心，答應的事記得做完', platforms: '守護型與深情型的朋友：替你的自由加一點穩定',
    first: '找一件你小時候很愛、長大後就沒做的事，這週再玩一次。', watch: '太隨性而放了別人鴿子。', mix: '多一點真性情，活得更快樂' },
  qi: { role: '江湖鬼才', pitch: '你反應快、點子多，最會在混亂裡找到出口。別人卡住的地方，就是你發光的地方。',
    topics: ['解決問題', '談判與交涉', '創業與企劃', '危機處理'],
    formats: '先想三條路，再挑最省力的那一條', platforms: '仁厚型與守護型的朋友：讓你的聰明用在對的地方',
    first: '把最近卡住的問題寫下來，想出三個完全不同的解法。', watch: '太愛走捷徑，讓別人覺得不夠真誠。', mix: '多一點機智，絕境也能翻身' },
};

// 依「本人實際選的答案」產生的江湖分析：每一題選的選項各給一句
export const ANSWER_MEDIA = [
  ['q1', '客棧裡看到不公平', { shou: '你會站出來保護弱小', hao: '你敢說出大家不敢說的話', qi: '你用聰明的方法化解危機', ren: '你希望兩邊都不要受傷' }],
  ['q2', '面對誘惑時', { shou: '你守住對朋友的承諾', qing: '你先想到重要的人', zhen: '你想把好事分給大家', qi: '你懂得先拿到機會再想辦法' }],
  ['q3', '被全世界誤會時', { hao: '你不解釋，用行動證明', ren: '你不記恨，先把事情做好', qing: '懂你的人懂就夠了', zhen: '你照樣過自己的日子' }],
  ['q4', '有人突然對你好', { zhen: '你真心接受，交個朋友', qi: '你會先觀察，保護好自己', hao: '你會加倍回報這份情義', ren: '你收下好意，也回送一份' }],
  ['q5', '知己有難、你又有任務', { qing: '你會放下一切去找他', shou: '你先做完答應的事，再去', hao: '你兩件事一起扛', qi: '你想出兩全其美的辦法' }],
  ['q6', '練功遇到瓶頸', { shou: '你靠紮實的苦練突破', zhen: '你換個玩法，自創一招', ren: '你去幫別人，回來就想通了', hao: '你先睡一覺，明天再拚' }],
  ['q7', '被推舉當盟主', { shou: '你願意扛起責任', ren: '你願意幫忙，不必當老大', zhen: '你更想要自由', qi: '你先接下機會再說' }],
  ['q8', '宿敵倒在面前', { ren: '你先救人，恩怨放一邊', hao: '你要堂堂正正地贏', qing: '你想到他也有在等他的人', qi: '你讓他欠你一個人情' }],
  ['q9', '你最想要的', { hao: '跟好朋友大口喝酒', qing: '和懂你的人一起生活', shou: '大家都平安', zhen: '自由自在' }],
  ['q10', '你想被記得的樣子', { shou: '最可靠的人', zhen: '最快樂的人', qing: '最深情的人', ren: '最溫柔的人' }],
];

export const QUESTIONS = [
  { id: 'name', kind: 'text', q: '行走江湖，先報上名號', hint: '會印在你和英雄的合照上。', placeholder: '例如：小安', max: 12 },
  { id: 'q1', scene: '客棧', q: '你在客棧喝茶，一群惡霸正在欺負賣唱的老伯。你會？', options: [
    ['shou', '直接站到老伯前面：「有什麼衝著我來。」'], ['hao', '拍桌大笑：「以多欺少，算什麼好漢！」'], ['qi', '假裝喝醉撞翻桌子，趁亂讓老伯溜走'], ['ren', '上前勸架，請大家各退一步'] ] },
  { id: 'q2', scene: '奇遇', q: '一位隱世高人說要傳你絕世武功，條件是要你離開朋友、閉關十年。你會？', options: [
    ['shou', '婉拒：我答應過要陪大家走下去'], ['qing', '先去問那個重要的人怎麼想'], ['zhen', '問高人：「可以帶朋友一起學嗎？」'], ['qi', '先學了再說，之後再想辦法溜出來'] ] },
  { id: 'q3', scene: '考驗', q: '有人陷害你，整個武林都以為你是壞人。你會？', options: [
    ['hao', '不解釋，用行動證明我是誰'], ['ren', '不怨恨，先把被牽連的人救出來'], ['qing', '只要懂我的那個人相信我，就夠了'], ['zhen', '照樣吃飯睡覺，清者自清'] ] },
  { id: 'q4', scene: '善意', q: '敵對門派的一個人，突然送你一份大禮，說想跟你做朋友。你會？', options: [
    ['zhen', '真心收下，好啊，交個朋友！'], ['qi', '笑著收下，但先觀察他的目的'], ['hao', '直接約他喝酒，喝完就結拜'], ['ren', '收下好意，也回送他一份禮'] ] },
  { id: 'q5', scene: '紅粉知己', q: '你的紅粉知己（或藍顏知己）遇上危險，偏偏你正在執行一件重要的任務。你會？', options: [
    ['qing', '什麼都不管了，立刻趕去找他'], ['shou', '託人先去保護他，任務完成馬上趕到'], ['hao', '兩件事一起扛，我做得到'], ['qi', '想一個計策，讓兩邊都不耽誤'] ] },
  { id: 'q6', scene: '閉關', q: '練功卡關，三天都沒有進步。你會？', options: [
    ['shou', '每天繼續練一千遍，總會突破'], ['zhen', '換個玩法，乾脆自創一招'], ['ren', '先下山幫人做點事，回來就想通了'], ['hao', '喝碗酒、睡一覺，明天再拚'] ] },
  { id: 'q7', scene: '武林大會', q: '武林大會上，大家一致推你當盟主。你會？', options: [
    ['shou', '接下來：責任總要有人扛'], ['ren', '推辭，但答應有事一定幫忙'], ['zhen', '「當盟主好麻煩，我想去玩」'], ['qi', '「好啊！」先接了再說'] ] },
  { id: 'q8', scene: '宿敵', q: '追了你三年的宿敵，受了重傷倒在你面前。你會？', options: [
    ['ren', '先救人，恩怨以後再說'], ['hao', '等他傷好，再堂堂正正打一場'], ['qing', '想到他也有在等他回家的人，放他走'], ['qi', '救他，順便讓他欠你一個人情'] ] },
  { id: 'q9', scene: '月下', q: '月光下，朋友問你：「這輩子最想要什麼？」你說？', options: [
    ['hao', '天下好友，一起大口喝酒'], ['qing', '和懂我的人，隱居在山裡'], ['shou', '天下太平，大家平平安安'], ['zhen', '自由自在，想去哪就去哪'] ] },
  { id: 'q10', scene: '傳說', q: '很多年後，江湖上流傳著你的故事。你希望大家怎麼說你？', options: [
    ['shou', '「最可靠的就是這個人」'], ['zhen', '「這個人活得最快樂」'], ['qing', '「這個人最深情」'], ['ren', '「這個人最溫柔」'] ] },
  { id: 'sex', kind: 'choice', scene: '拜師', q: '最後，你想跟哪一種英雄並肩闖江湖？', options: [
    ['a', '剛猛霸氣，一掌定乾坤'], ['b', '瀟灑靈動，以巧破千斤'], ['any', '交給緣分決定'] ] },
];

// 武學六項：每一角都有自己的意思
export const STAT_KEYS = [['pow', '內力'], ['spd', '輕功'], ['rng', '人緣'], ['dur', '定力'], ['pre', '智謀'], ['gro', '俠氣']];
export const STAT_INFO = {
  pow: { short: { zh: '內力', ja: '内功', en: 'INNER POWER' }, desc: '遇到大事時，撐得住、扛得起的力量' },
  spd: { short: { zh: '輕功', ja: '軽功', en: 'AGILITY' }, desc: '反應快、身段軟，懂得見機行事' },
  rng: { short: { zh: '人緣', ja: '人望', en: 'CHARISMA' }, desc: '走到哪裡都有朋友、有人願意幫你' },
  dur: { short: { zh: '定力', ja: '胆力', en: 'RESOLVE' }, desc: '被誤會、被考驗時，守得住自己' },
  pre: { short: { zh: '智謀', ja: '知略', en: 'WIT' }, desc: '想辦法、出點子、看穿局勢' },
  gro: { short: { zh: '俠氣', ja: '侠気', en: 'CHIVALRY' }, desc: '看到不公平，願意站出來' },
};

export function standById(id, owner = '') {
  const s = STANDS[id];
  return { id, owner, ...TAGS[s.tagId], ...s, ...LOCALE[id], tagNames: TAG_NAMES[s.tagId] };
}

export function computeStand(a) {
  const count = {};
  for (const q of QUESTIONS) if (/^q\d+$/.test(q.id) && a[q.id]) count[a[q.id]] = (count[a[q.id]] || 0) + 1;
  const best = Math.max(0, ...Object.values(count));
  // 同分時，以第三題（被全世界誤會的考驗）為準，其次按題目順序
  const tied = Object.keys(count).filter((k) => count[k] === best);
  const tagId = tied.includes(a.q3) ? a.q3 : tied[0] || 'shou';
  const second = Object.keys(count).filter((k) => k !== tagId).sort((x, y) => count[y] - count[x])[0] || null;
  const pair = Object.keys(STANDS).filter((id) => STANDS[id].tagId === tagId);
  let style = a.sex;
  if (style !== 'a' && style !== 'b') {
    // 「交給緣分」：用答案算出固定的結果，重看時不會變
    let h = 0; for (const ch of JSON.stringify(a)) h = (h * 31 + ch.charCodeAt(0)) | 0;
    style = h & 1 ? 'b' : 'a';
  }
  const id = pair.find((k) => STANDS[k].style === style) || pair[0];
  return { ...standById(id, (a.name || '').trim() || '少俠'), second, counts: count, answers: a };
}
