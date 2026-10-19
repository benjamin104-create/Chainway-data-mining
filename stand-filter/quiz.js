// 守護神偵測器：十題選擇題 → 人格標籤 → 選男神或女神 → 專屬守護神
// 娛樂性的自我探索，不是心理診斷。

// 六種人格標籤：說明與練習屬於標籤，每個標籤有一位男神、一位女神
export const TAGS = {
  courage: { tag: '勇氣',
    note: '阿德勒說，勇氣不是不害怕，而是怕了還是往前一步。',
    try: '這週做一件你有點怕、但其實做得到的小事。' },
  wisdom: { tag: '智慧',
    note: '你最容易在「終於弄懂了」的那一刻進入心流。',
    try: '挑一個好奇很久的問題，花 30 分鐘把它查到底。' },
  guard: { tag: '守護',
    note: '你的力量來自「為了別人」。阿德勒稱這是社會情懷，是最健康的力量來源。',
    try: '守護別人之前，也記得問問自己：今天累不累？' },
  freedom: { tag: '自由',
    note: '你要能自己決定怎麼做，才會全力以赴。自主，是你的心流開關。',
    try: '這週挑一件事，完全照你自己的方式完成。' },
  create: { tag: '創造',
    note: '動手做東西做到忘了時間，就是你的心流。',
    try: '每天留 15 分鐘，做一件沒人要求、只為好玩的作品。' },
  bond: { tag: '羈絆',
    note: '理解別人、也被別人理解，是你最大的能量。馬斯洛把它叫作歸屬需求。',
    try: '主動聯絡一個好久沒聊的朋友。' },
};

// 守護神以希臘羅馬神話的神祇為原型（神話本身沒有版權），圖是重新繪製的原創圖。
// 每位守護神的圖放在 stands/<id>.png 或 stands/<id>.jpg（白底或透明底都可以）
export const STANDS = {
  courage: { tagId: 'courage', sex: 'm', name: 'MARS', zh: '戰神瑪爾斯',
    tint: '#ff2e55', glow: '#ff9a6b', text: '#ff3d6e',
    grade: { pow: 'A', spd: 'A', rng: 'C', dur: 'B', pre: 'C', gro: 'A' },
    ability: '羅馬的戰神。握緊拳頭的瞬間，你和身邊的人都會一起忘記恐懼。' },
  nike: { tagId: 'courage', sex: 'f', name: 'NIKE', zh: '勝利女神妮姬',
    tint: '#ff2e55', glow: '#ffc27a', text: '#ff3d6e',
    grade: { pow: 'A', spd: 'A', rng: 'B', dur: 'B', pre: 'C', gro: 'A' },
    ability: '展開雙翼的勝利女神。你舉起拳頭的那一刻，就已經贏了一半。' },
  wisdom: { tagId: 'wisdom', sex: 'f', name: 'ATHENA', zh: '智慧女神雅典娜',
    tint: '#2a6bff', glow: '#7fe8ff', text: '#4fc3ff',
    grade: { pow: 'C', spd: 'B', rng: 'A', dur: 'B', pre: 'A', gro: 'B' },
    ability: '肩上的貓頭鷹能看穿事物背後的規則。女神一點太陽穴，問題卡在哪裡就一清二楚。' },
  apollo: { tagId: 'wisdom', sex: 'm', name: 'APOLLO', zh: '光明之神阿波羅',
    tint: '#2a6bff', glow: '#fff1a0', text: '#4fc3ff',
    grade: { pow: 'B', spd: 'B', rng: 'A', dur: 'B', pre: 'A', gro: 'B' },
    ability: '光明與預言之神。豎琴一響，你眼前的迷霧就會被陽光照散。' },
  guard: { tagId: 'guard', sex: 'f', name: 'ARTEMIS', zh: '月之女神阿提米絲',
    tint: '#ffc23d', glow: '#fff1b8', text: '#ffd23f',
    grade: { pow: 'B', spd: 'C', rng: 'C', dur: 'A', pre: 'B', gro: 'B' },
    ability: '孩子與弱小者的守護神。月光之弓射出的箭，會擋在每個你想保護的人前面。' },
  zeus: { tagId: 'guard', sex: 'm', name: 'ZEUS', zh: '眾神之王宙斯',
    tint: '#ffc23d', glow: '#fff6c0', text: '#ffd23f',
    grade: { pow: 'A', spd: 'B', rng: 'B', dur: 'A', pre: 'C', gro: 'B' },
    ability: '奧林帕斯的眾神之王。雷霆落下的範圍，就是你要守護的地方。' },
  freedom: { tagId: 'freedom', sex: 'm', name: 'HERMES', zh: '旅神赫密士',
    tint: '#12d688', glow: '#c6ffe4', text: '#2bd97c',
    grade: { pow: 'C', spd: 'A', rng: 'A', dur: 'C', pre: 'B', gro: 'A' },
    ability: '腳踏羽翼的眾神信使。能化作一陣風，帶著你去任何想去的地方，誰都抓不住。' },
  iris: { tagId: 'freedom', sex: 'f', name: 'IRIS', zh: '彩虹女神伊麗絲',
    tint: '#12d688', glow: '#e0fff0', text: '#2bd97c',
    grade: { pow: 'C', spd: 'A', rng: 'A', dur: 'B', pre: 'B', gro: 'A' },
    ability: '踩著彩虹往返天地的女神。彩虹架到哪裡，你就能走到哪裡。' },
  create: { tagId: 'create', sex: 'f', name: 'VENUS', zh: '美神維納斯',
    tint: '#c03dff', glow: '#ffb3f0', text: '#ff4fd8',
    grade: { pow: 'B', spd: 'B', rng: 'B', dur: 'C', pre: 'A', gro: 'A' },
    ability: '從海中誕生的美之女神。手中灑出的玫瑰花瓣落在哪裡，哪裡就會開出新的美好。' },
  hephaestus: { tagId: 'create', sex: 'm', name: 'HEPHAESTUS', zh: '鍛造之神赫菲斯托斯',
    tint: '#c03dff', glow: '#ffc08a', text: '#ff4fd8',
    grade: { pow: 'A', spd: 'C', rng: 'C', dur: 'A', pre: 'A', gro: 'A' },
    ability: '眾神的工匠。鐵鎚每敲一下，你腦中的想法就變成看得見、摸得到的東西。' },
  bond: { tagId: 'bond', sex: 'm', name: 'CUPID', zh: '愛神丘比特',
    tint: '#ff7a2e', glow: '#ffd9b0', text: '#ff9a4d',
    grade: { pow: 'C', spd: 'C', rng: 'A', dur: 'A', pre: 'B', gro: 'A' },
    ability: '金色的愛心之箭能把人和人的心連起來。連起來的人越多，它就越強。' },
  hera: { tagId: 'bond', sex: 'f', name: 'HERA', zh: '天后希拉',
    tint: '#ff7a2e', glow: '#ffe0c0', text: '#ff9a4d',
    grade: { pow: 'B', spd: 'C', rng: 'A', dur: 'A', pre: 'B', gro: 'B' },
    ability: '守護家人與約定的天后。被她牽起的關係，不會輕易斷掉。' },
};

// 篇：之後的「台灣篇」「日本篇」換掉這一包資料（神祇、圖、文字）就能沿用整套測驗與相機
export const PACK = { id: 'greek', name: { zh: '希臘篇', ja: 'ギリシャ編', en: 'GREEK MYTHS' } };

// 三種語言的名字、稱號與台詞（相機畫面上的標題與對話框用）
export const LANGS = { zh: '中文', ja: '日本語', en: 'EN' };
export const TAG_NAMES = {
  courage: { zh: '勇氣', ja: '勇気', en: 'COURAGE' }, wisdom: { zh: '智慧', ja: '知恵', en: 'WISDOM' },
  guard: { zh: '守護', ja: '守護', en: 'PROTECTION' }, freedom: { zh: '自由', ja: '自由', en: 'FREEDOM' },
  create: { zh: '創造', ja: '創造', en: 'CREATION' }, bond: { zh: '羈絆', ja: '絆', en: 'BOND' },
};
export const LOCALE = {
  courage: { names: { zh: '瑪爾斯', ja: 'マルス', en: 'MARS' }, titles: { zh: '戰神', ja: '不屈の軍神', en: 'The Unbreakable Warrior' },
    line: { zh: '怕什麼？我就在你身後！', ja: '怖がるな。背中は俺が預かる。', en: "Don't be afraid. I've got your six." } },
  nike: { names: { zh: '妮姬', ja: 'ニケ', en: 'NIKE' }, titles: { zh: '勝利女神', ja: '勝利を運ぶ翼', en: 'She Who Brings Victory' },
    line: { zh: '勝利，已經在你手中。', ja: '勝利の女神は、もう君に微笑んでる。', en: "This one's yours. Go get it." } },
  wisdom: { names: { zh: '雅典娜', ja: 'アテナ', en: 'ATHENA' }, titles: { zh: '智慧女神', ja: '叡智の戦女神', en: 'The Grey-Eyed Strategist' },
    line: { zh: '冷靜下來，答案就在眼前。', ja: '落ち着いて。答えは、もう君の中にある。', en: 'Breathe. You already know the answer.' } },
  apollo: { names: { zh: '阿波羅', ja: 'アポロン', en: 'APOLLO' }, titles: { zh: '光明之神', ja: '太陽と竪琴の神', en: 'Lord of the Sun' },
    line: { zh: '讓光照亮你的路吧。', ja: '君は君のまま、輝けばいい。', en: 'Shine on. The world needs your light.' } },
  guard: { names: { zh: '阿提米絲', ja: 'アルテミス', en: 'ARTEMIS' }, titles: { zh: '月之女神', ja: '月夜の狩人', en: 'Huntress of the Moon' },
    line: { zh: '你想守護的人，我一起守護。', ja: '君の大切なものは、私が守り抜く。', en: 'Anyone who messes with yours answers to me.' } },
  zeus: { names: { zh: '宙斯', ja: 'ゼウス', en: 'ZEUS' }, titles: { zh: '眾神之王', ja: '天空の雷帝', en: 'King of Thunder' },
    line: { zh: '有我在，誰也動不了你。', ja: '案ずるな。この私がついている。', en: 'Fear not. Olympus has your back.' } },
  freedom: { names: { zh: '赫密士', ja: 'ヘルメス', en: 'HERMES' }, titles: { zh: '旅神', ja: '風を駆ける旅神', en: 'The Swift Messenger' },
    line: { zh: '走吧，世界在等你！', ja: 'さあ、出発だ！世界が君を待ってる。', en: 'Pack light. Adventure is calling!' } },
  iris: { names: { zh: '伊麗絲', ja: 'イリス', en: 'IRIS' }, titles: { zh: '彩虹女神', ja: '虹の架け橋', en: 'Messenger of the Rainbow' },
    line: { zh: '彩虹的盡頭，由你決定。', ja: '止まない雨はない。次は君が虹をかける番だ。', en: "Every storm runs out of rain. Your rainbow's next." } },
  create: { names: { zh: '維納斯', ja: 'ヴィーナス', en: 'VENUS' }, titles: { zh: '美神', ja: '愛と美の女神', en: 'Born of the Sea Foam' },
    line: { zh: '你創造的一切，都很美。', ja: 'あなたは、あなたのままで十分きれい。', en: "You're beautiful just the way you are." } },
  hephaestus: { names: { zh: '赫菲斯托斯', ja: 'ヘパイストス', en: 'HEPHAESTUS' }, titles: { zh: '鍛造之神', ja: '炎の鍛冶神', en: 'Master of the Forge' },
    line: { zh: '想到了？那就動手打造吧！', ja: '鉄は熱いうちに打て！', en: "Strike while the iron's hot!" } },
  bond: { names: { zh: '丘比特', ja: 'キューピッド', en: 'CUPID' }, titles: { zh: '愛神', ja: '恋の射手', en: 'The Archer of Hearts' },
    line: { zh: '你的心，連著好多人的心。', ja: '君は、ひとりじゃない。', en: "You're never alone. Not on my watch." } },
  hera: { names: { zh: '希拉', ja: 'ヘラ', en: 'HERA' }, titles: { zh: '天后', ja: 'オリュンポスの女王', en: 'Queen of Olympus' },
    line: { zh: '重要的人，我幫你牢牢牽住。', ja: '縁は大事にしなさい。きっと君を助けてくれる。', en: "Hold on to your people. They're your treasure." } },
};

// 自媒體建議：主標籤決定定位與方向，副標籤給混搭點子，等級 A 的能力是要放大的強項
export const MEDIA = {
  courage: { role: '挑戰者', pitch: '記錄自己跨出舒適圈的過程，讓觀眾跟著你一起變勇敢。',
    topics: ['30 天挑戰', '第一次做某件事', '實測與體驗', '失敗後怎麼站起來'],
    formats: '短影音 vlog、實測影片、挑戰系列', platforms: 'TikTok、IG Reels、YouTube Shorts',
    first: '開一個「30 天挑戰」系列，每天用 30 秒記錄進度。',
    watch: '別只追求刺激，每支影片都說一句你學到了什麼。', mix: '加一點挑戰元素，例如「我試了一週…」' },
  wisdom: { role: '拆解者', pitch: '把複雜的知識講到誰都聽得懂，讓人看完就學會一件事。',
    topics: ['心理學小知識', '書摘與觀念整理', '迷思破解', '懶人包'],
    formats: '圖文懶人包、解說影片、Podcast', platforms: 'IG 圖文、YouTube、方格子或部落格',
    first: '挑一個你懂、但別人常搞錯的觀念，做成 5 張圖卡。',
    watch: '少一點專有名詞，多一個生活裡的例子。', mix: '在內容裡加一個「一句話重點」' },
  guard: { role: '陪伴者', pitch: '給需要的人安心感和實用的幫助，成為大家遇到困難時第一個想到的人。',
    topics: ['親子教養', '照顧自己與家人', '心理支持', '實用生活清單'],
    formats: '實用清單、問答整理、溫暖短文', platforms: 'Facebook 社團、LINE 社群、IG',
    first: '把身邊朋友最常問你的 3 個問題，各寫成一篇回答。',
    watch: '先照顧好自己，替留言回覆設定時間和界線。', mix: '加上一個「可以馬上做的小步驟」' },
  freedom: { role: '探索者', pitch: '分享不一樣的生活方式，讓人看到人生還有別的選擇。',
    topics: ['旅行與在地探索', '斜槓與自由工作', '一個人的生活', '慢生活'],
    formats: '生活 vlog、旅記、限時動態', platforms: 'YouTube、IG 限動、Threads',
    first: '不寫腳本，拍一支「我的一天」。',
    watch: '自由也要有節奏：固定每週同一天更新。', mix: '加入你自己的生活風格和觀點' },
  create: { role: '創作者', pitch: '讓人看見作品，也看見它是怎麼一步步做出來的。',
    topics: ['作品與製作過程', '改造前後對比', '手作或設計教學', '靈感來源'],
    formats: '製作過程縮時、before／after、教學影片', platforms: 'IG Reels、Pinterest、TikTok',
    first: '拍下一件作品從零到完成的 15 秒縮時。',
    watch: '不用等完美才發，過程本身就是好內容。', mix: '加上一點視覺巧思或手作感' },
  bond: { role: '連結者', pitch: '經營一個讓大家彼此認識、互相打氣的社群。',
    topics: ['人際關係與溝通', '讀者故事', '心情交流', '線上或線下聚會'],
    formats: '直播、提問箱、互動貼文、社群活動', platforms: 'Threads、IG 直播、LINE 社群',
    first: '發一篇提問貼文，再把大家的回答整理成下一篇。',
    watch: '也要說自己的故事，不要只當主持人。', mix: '在結尾加一個邀請大家留言的問題' },
};

// 依「本人實際選的答案」產生的自媒體分析：每一題的每個選項都有一句對應的建議
// （六角圖是守護神角色的能力，用來分享；分析只看答案）
export const ANSWER_MEDIA = [
  ['q7', '你最擅長的那一段', { wisdom: '研究與企劃：找資料、整理架構，最適合當內容的大腦', create: '視覺與創意：畫面、排版、點子都交給你', courage: '出鏡與表達：你上鏡、敢講，適合露臉說話', bond: '社群互動：回留言、帶話題、讓大家熱絡', guard: '品質把關：校對、剪輯細節，讓內容不出錯', freedom: '挑題目、找角度：你知道什麼題材有趣' }],
  ['q2', '適合你的題材', { create: '手作、繪畫、影像創作', courage: '新體驗與挑戰紀錄', bond: '朋友聚會、人際互動', wisdom: '書、紀錄片、知識整理', freedom: '一個人的旅行與生活', guard: '家庭、寵物、照顧日常' }],
  ['q3', '你的說話風格', { guard: '可靠、說到做到，讓人放心', bond: '溫暖，像朋友聊天', wisdom: '冷靜、條理分明', create: '有想法、帶點新奇感', courage: '直接、有衝勁', freedom: '輕鬆隨性、不說教' }],
  ['q8', '拍攝與呈現方式', { freedom: '隨拍紀實，不刻意擺拍', wisdom: '深度導覽，有知識含量', courage: '第一人稱、節奏快的實境', create: '重視構圖與畫面美感', bond: '熱鬧、多人一起出鏡', guard: '溫馨、實用、貼心提醒' }],
  ['q1', '你帶給觀眾的價值', { courage: '用行動示範，帶觀眾一起動起來', wisdom: '幫觀眾把狀況看清楚、理出頭緒', guard: '給觀眾安全感，讓他們知道有人挺', freedom: '帶觀眾換個角度、換個環境看事情', create: '給觀眾意想不到的新解法', bond: '陪觀眾聊，讓他們覺得被理解' }],
  ['q5', '可以做成招牌單元', { wisdom: '「一眼看穿」解析系列', freedom: '「說走就走」系列', courage: '「我試過了」實測系列', bond: '「讀者心聲」問答系列', guard: '「幫你避雷」清單系列', create: '「變出來」作品揭曉系列' }],
  ['q6', '遇到爭議時的發聲方式', { courage: '直接表達立場', wisdom: '用資料和邏輯說話', guard: '站在受影響的人那邊說話', freedom: '分享自己走的另一條路', create: '提出新的做法', bond: '開放討論，先聽大家的意見' }],
  ['q4', '要避開的經營方式', { freedom: '被固定格式綁死：保留一個彈性單元', guard: '嘲諷、踩人的內容：不蹭負面話題', create: '一成不變的模板：每週加一個新嘗試', courage: '想太久不發：先發再修', bond: '只單向發文：每篇都留一個互動問題', wisdom: '跟風沒根據：每篇附上來源或理由' }],
  ['q9', '最能讓你持續的成就感', { create: '作品完成數和收藏數', guard: '私訊跟你說「謝謝」的人數', wisdom: '留言說「學到了」的次數', courage: '自己突破的紀錄', bond: '留言互動和社群成員數', freedom: '自己做得開心，能一直更新' }],
  ['q10', '長期目標', { bond: '經營一個真心交流的社群', freedom: '讓自媒體帶來選擇生活的自由', guard: '成為大家信任的照顧型帳號', create: '累積作品集，出自己的作品', wisdom: '成為領域裡的專家帳號', courage: '留下一路挑戰的紀錄' }],
];

export const QUESTIONS = [
  { id: 'name', kind: 'text', q: '先告訴守護神你的名字', hint: '會印在你和守護神的合照上。', placeholder: '例如：小安', max: 12 },
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
  { id: 'q6', q: '遇到不公平的事，你會？', options: [
    ['courage', '站出來直接說'], ['wisdom', '先蒐集證據再處理'], ['guard', '先保護受影響的人'],
    ['freedom', '不想被捲進去，找自己的路'], ['create', '想一個新方法讓規則變好'], ['bond', '找大家一起討論'] ] },
  { id: 'q7', q: '分組做報告，你通常負責？', options: [
    ['wisdom', '查資料、整理重點'], ['create', '做簡報、想創意'], ['courage', '上台報告'],
    ['bond', '協調大家、幫忙打氣'], ['guard', '最後檢查，確保不出錯'], ['freedom', '挑自己有興趣的部分做'] ] },
  { id: 'q8', q: '你最喜歡哪一種旅行？', options: [
    ['freedom', '不排行程，走到哪算哪'], ['wisdom', '博物館、古蹟、深度導覽'], ['courage', '登山、潛水、刺激挑戰'],
    ['create', '拍照、寫生、逛市集找靈感'], ['bond', '跟一大群朋友熱鬧出遊'], ['guard', '帶家人出去、照顧大家'] ] },
  { id: 'q9', q: '哪一刻最讓你有成就感？', options: [
    ['create', '做出一個原本不存在的東西'], ['guard', '在乎的人平平安安'], ['wisdom', '解開一個難題'],
    ['courage', '突破自己的極限'], ['bond', '大家因為你變得更親近'], ['freedom', '照自己的方式完成一件事'] ] },
  { id: 'q10', q: '你希望十年後的自己是？', options: [
    ['bond', '身邊有一群真心的朋友'], ['freedom', '能自由選擇想過的生活'], ['guard', '能照顧好家人和在乎的人'],
    ['create', '留下屬於自己的作品'], ['wisdom', '成為某個領域的專家'], ['courage', '做過很多勇敢的事'] ] },
  { id: 'sex', kind: 'choice', q: '最後，你想召喚哪一種守護神？', options: [
    ['f', '女神'], ['m', '男神'], ['any', '交給命運決定'] ] },
];

// 六角圖的六個頂點：每一項都有自己的意思，畫在頂點旁邊
export const STAT_KEYS = [['pow', '力量'], ['spd', '行動力'], ['rng', '影響力'], ['dur', '持久力'], ['pre', '精準度'], ['gro', '成長性']];
export const STAT_INFO = {
  pow: { short: { zh: '力量', ja: 'パワー', en: 'POWER' }, desc: '遇到困難時，往前推的力氣' },
  spd: { short: { zh: '行動力', ja: '行動力', en: 'SPEED' }, desc: '想到就去做的速度' },
  rng: { short: { zh: '影響力', ja: '影響力', en: 'REACH' }, desc: '能影響、幫助多少人' },
  dur: { short: { zh: '持久力', ja: '持久力', en: 'STAMINA' }, desc: '遇到挫折還能撐多久' },
  pre: { short: { zh: '精準度', ja: '精密性', en: 'PRECISION' }, desc: '把事情做細、做對的能力' },
  gro: { short: { zh: '成長性', ja: '成長性', en: 'GROWTH' }, desc: '未來還能長多大' },
};

export function standById(id, owner = '') {
  const s = STANDS[id];
  return { id, owner, ...TAGS[s.tagId], ...s, ...LOCALE[id], tagNames: TAG_NAMES[s.tagId] };
}

export function computeStand(a) {
  const count = {};
  for (const k of Object.keys(a)) if (/^q\d+$/.test(k) && TAGS[a[k]]) count[a[k]] = (count[a[k]] || 0) + 1;   // 抽到哪幾題就算哪幾題
  const best = Math.max(0, ...Object.values(count));
  // 同分時，以第五題（最想要的超能力）為準，其次按題目順序
  const tied = Object.keys(count).filter((k) => count[k] === best);
  const first = a[a._qs?.[0]];   // 同分時，以這次抽到的第一題為準
  const tagId = tied.includes(first) ? first : tied[0] || 'courage';
  // 副標籤：主標籤以外，次多的那一個
  const second = Object.keys(count).filter((k) => k !== tagId).sort((x, y) => count[y] - count[x])[0] || null;
  const pair = Object.keys(STANDS).filter((id) => STANDS[id].tagId === tagId);
  let sex = a.sex;
  if (sex !== 'm' && sex !== 'f') {
    // 「交給命運」：用答案算出固定的結果，重看時不會變
    let h = 0; for (const ch of JSON.stringify(a)) h = (h * 31 + ch.charCodeAt(0)) | 0;
    sex = h & 1 ? 'm' : 'f';
  }
  const id = pair.find((k) => STANDS[k].sex === sex) || pair[0];
  return { ...standById(id, (a.name || '').trim() || '無名的勇者'), second, counts: count, answers: a };
}

// ── 題庫：原本 10 題＋新增 30 題，每次隨機抽 8～10 題（六種性格都有機會出現；有劇情的篇依劇情順序排）──
const MORE = [{"id": "q11", "stage": 0, "label": "早上的你", "q": "早上鬧鐘響了三次，你會？", "options": [["freedom", "再睡五分鐘，人生不用那麼趕"], ["guard", "馬上起床，今天還有人在等我"], ["create", "躺著想今天要穿什麼、做點什麼新鮮事"], ["courage", "直接跳起來，冷水洗臉清醒！"]]}, {"id": "q12", "stage": 0, "label": "臨時邀約", "q": "朋友突然約你今晚吃火鍋，但你原本想在家耍廢，你會？", "options": [["bond", "當然去！跟朋友吃飯最重要"], ["freedom", "老實說今天想自己待著"], ["guard", "問一下還有誰，要不要順便去接人"], ["wisdom", "先查一下那家店的評價"]]}, {"id": "q13", "stage": 0, "label": "最後的電量", "q": "手機只剩 5% 的電，你會拿來？", "options": [["bond", "傳訊息給在乎的人"], ["wisdom", "查好回家的路線"], ["create", "拍下眼前這個好看的畫面"], ["courage", "管他的，用完再說"]]}, {"id": "q14", "stage": 0, "label": "路上的小插曲", "q": "路上有人東西掉了一地，你會？", "options": [["guard", "馬上蹲下來幫忙撿"], ["courage", "喊旁邊的人一起來幫"], ["wisdom", "先看看有沒有東西會滾到馬路上"], ["bond", "幫忙撿完，還跟對方聊了兩句"]]}, {"id": "q15", "stage": 0, "label": "想體驗的工作", "q": "如果可以換一種工作體驗一個月，你選？", "options": [["create", "動畫師或設計師"], ["freedom", "到處跑的旅遊記者"], ["wisdom", "博物館研究員"], ["guard", "消防員或救難隊"]]}, {"id": "q16", "stage": 0, "label": "意見不合時", "q": "跟朋友意見不合，你通常？", "options": [["courage", "直接講清楚，不想憋著"], ["bond", "先聽完他的想法再說"], ["wisdom", "把兩邊的理由列出來比一比"], ["freedom", "各自保留意見，不用一定要一樣"]]}, {"id": "q17", "stage": 0, "label": "手機桌布", "q": "你的手機桌布最可能是？", "options": [["create", "自己拍的照片或畫的圖"], ["bond", "跟朋友或家人的合照"], ["freedom", "一片大海或天空"], ["guard", "家裡的寵物"]]}, {"id": "q18", "stage": 0, "label": "新環境第一天", "q": "到新學校、新公司的第一天，你會？", "options": [["courage", "主動跟旁邊的人打招呼"], ["wisdom", "先觀察大家都在做什麼"], ["bond", "找一個看起來也很緊張的人聊天"], ["create", "把桌面布置成自己喜歡的樣子"]]}, {"id": "q19", "stage": 0, "label": "聽到瘋狂點子", "q": "朋友說：「我有一個很瘋的點子……」你的反應是？", "options": [["courage", "「好啊！什麼時候開始？」"], ["create", "「然後呢？還可以再加這個！」"], ["wisdom", "「等等，先想想可不可行」"], ["guard", "「好，但要注意安全喔」"]]}, {"id": "q20", "stage": 0, "label": "一個人的晚上", "q": "一個人在家的晚上，你最常？", "options": [["create", "畫畫、寫東西、剪影片"], ["wisdom", "追紀錄片或看書"], ["freedom", "出門散步，走到哪算哪"], ["bond", "開視訊跟朋友聊天"]]}, {"id": "q21", "stage": 0, "label": "群組裡的你", "q": "在朋友群組裡，你通常是？", "options": [["bond", "最會接話的開心果"], ["wisdom", "默默把重點整理出來的人"], ["guard", "提醒大家時間、記得帶傘的人"], ["freedom", "已讀之後，隔天才回的人"]]}, {"id": "q22", "stage": 0, "label": "前一晚", "q": "考試或報告的前一晚，你是？", "options": [["guard", "早就準備好了，還幫朋友複習"], ["courage", "熬夜衝刺，相信自己可以"], ["create", "用自己的方法畫重點圖"], ["freedom", "該睡就睡，盡力就好"]]}, {"id": "q23", "stage": 0, "label": "最能說動你的話", "q": "哪一句話最能說動你？", "options": [["courage", "「你敢不敢？」"], ["wisdom", "「你知道為什麼嗎？」"], ["bond", "「我們一起去吧」"], ["create", "「這是全新的東西」"]]}, {"id": "q24", "stage": 0, "label": "朋友失戀時", "q": "朋友失戀，半夜打給你，你會？", "options": [["guard", "馬上衝去陪他"], ["bond", "聽他說到天亮"], ["wisdom", "幫他想想問題出在哪"], ["freedom", "約他明天去海邊吹吹風"]]}, {"id": "q25", "stage": 0, "label": "買東西的習慣", "q": "你買東西的習慣是？", "options": [["wisdom", "比價、看評價，研究很久才買"], ["courage", "看到喜歡就買，不想太多"], ["create", "喜歡獨特、別人沒有的款式"], ["guard", "先買家人需要的"]]}, {"id": "q26", "stage": 0, "label": "神話寵物", "q": "如果可以養一隻神話裡的動物，你選？", "options": [["courage", "會噴火的龍"], ["wisdom", "會說話的貓頭鷹"], ["freedom", "有翅膀的飛馬"], ["guard", "三個頭的看門狗"]]}, {"id": "q27", "stage": 0, "label": "打動你的角色", "q": "看電影時，哪種角色最打動你？", "options": [["guard", "為了保護大家挺身而出的人"], ["bond", "一路陪著主角的好朋友"], ["freedom", "不被規則綁住的浪子"], ["create", "老是發明奇怪東西的怪咖"]]}, {"id": "q28", "stage": 0, "label": "最浪費時間的事", "q": "你覺得最浪費時間的是？", "options": [["freedom", "開了很久還沒有結論的會"], ["create", "每天重複做一樣的事"], ["courage", "想了很久還不開始"], ["bond", "大家坐在一起，卻各滑各的手機"]]}, {"id": "q29", "stage": 0, "label": "背包裡的必需品", "q": "出門旅行，你的背包裡一定有？", "options": [["guard", "急救包和行動電源，誰需要都有"], ["create", "筆記本或相機"], ["wisdom", "旅遊書和地圖"], ["freedom", "只有手機和錢包，其他到了再買"]]}, {"id": "q30", "stage": 0, "label": "最想聽到的稱讚", "q": "被稱讚時，你最開心聽到？", "options": [["courage", "「你好勇敢！」"], ["wisdom", "「你好聰明！」"], ["create", "「這是你做的？好厲害！」"], ["bond", "「有你在真好」"]]}, {"id": "q31", "stage": 0, "label": "想發的貼文", "q": "如果今天要在社群發一篇文，你會發？", "options": [["create", "自己的作品"], ["bond", "跟朋友出去玩的照片"], ["wisdom", "最近學到的有趣知識"], ["courage", "剛完成的一個挑戰"]]}, {"id": "q32", "stage": 0, "label": "下雨沒帶傘", "q": "下雨了，你沒帶傘，你會？", "options": [["courage", "直接衝，淋點雨也不錯"], ["freedom", "找間咖啡店等雨停"], ["guard", "先把包包裡重要的東西包好"], ["bond", "打給朋友：「你在附近嗎？」"]]}, {"id": "q33", "stage": 0, "label": "理想住處", "q": "最想住在哪一種地方？", "options": [["freedom", "海邊的小屋，每天看海"], ["bond", "有很多鄰居朋友的熱鬧社區"], ["create", "可以自己改造的老房子"], ["wisdom", "圖書館旁邊的公寓"]]}, {"id": "q34", "stage": 0, "label": "口頭禪", "q": "你最常說的口頭禪比較像？", "options": [["courage", "「衝了啦！」"], ["guard", "「你還好嗎？」"], ["wisdom", "「真的假的？我查一下」"], ["freedom", "「都可以啦～」"]]}, {"id": "q35", "stage": 0, "label": "遊戲角色", "q": "玩遊戲時，你喜歡當？", "options": [["courage", "衝第一個的戰士"], ["guard", "保護隊友的坦克"], ["wisdom", "出主意的法師"], ["create", "蓋房子、造東西的建築師"]]}, {"id": "q36", "stage": 0, "label": "送生日禮物", "q": "朋友生日，你會送？", "options": [["create", "親手做的卡片或小禮物"], ["bond", "揪大家一起幫他慶生"], ["guard", "他最近剛好需要的東西"], ["freedom", "一張說走就走的車票"]]}, {"id": "q37", "stage": 0, "label": "一整個月的假", "q": "如果明天開始放一整個月的假，你會？", "options": [["freedom", "背包出國，不訂回程"], ["create", "完成一直想做的作品"], ["wisdom", "把一個新技能學起來"], ["bond", "每天約不同的朋友見面"]]}, {"id": "q38", "stage": 0, "label": "紓壓方式", "q": "壓力很大的時候，你會？", "options": [["courage", "去運動，流一身汗"], ["create", "畫畫、聽音樂、做手作"], ["bond", "找人聊一聊"], ["freedom", "一個人出去走走"]]}, {"id": "q39", "stage": 0, "label": "合照位置", "q": "大家拍團體照時，你通常？", "options": [["courage", "站最前面，比最大的姿勢"], ["guard", "站邊邊，幫大家看有沒有人被擋到"], ["create", "負責想姿勢和角度"], ["bond", "擠在正中間，跟大家黏在一起"]]}, {"id": "q40", "stage": 0, "label": "給未來的信", "q": "寫一封信給十年後的自己，你會寫？", "options": [["guard", "「希望你身邊的人都平安」"], ["wisdom", "「希望你還保有好奇心」"], ["freedom", "「希望你活成自己想要的樣子」"], ["courage", "「希望你沒有因為害怕而放棄」"]]}];
const STAGE = {};
const SAYS = {"courage": ["敢衝敢試，是你最大的魅力", "你的行動力會帶著大家往前"], "wisdom": ["你習慣先想清楚，判斷很可靠", "好奇心就是你的超能力"], "guard": ["你總是先想到別人，是大家的靠山", "可靠，是你給人的第一印象"], "freedom": ["你需要自己的節奏，才能發光", "不被框住，你才做得出最好的自己"], "create": ["你的點子總讓人眼睛一亮", "動手做東西，是你最快樂的時候"], "bond": ["你讓身邊的人覺得被在乎", "人和人的連結，是你的能量來源"]};
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
