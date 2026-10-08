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
  courage: { names: { zh: '瑪爾斯', ja: 'マルス', en: 'MARS' }, titles: { zh: '戰神', ja: '戦いの神', en: 'God of War' },
    line: { zh: '怕什麼？我就在你身後！', ja: '怖がるな。背中は俺が預かる。', en: "Don't be afraid. I've got your six." } },
  nike: { names: { zh: '妮姬', ja: 'ニケ', en: 'NIKE' }, titles: { zh: '勝利女神', ja: '勝利の女神', en: 'Goddess of Victory' },
    line: { zh: '勝利，已經在你手中。', ja: '勝利の女神は、もう君に微笑んでる。', en: "This one's yours. Go get it." } },
  wisdom: { names: { zh: '雅典娜', ja: 'アテナ', en: 'ATHENA' }, titles: { zh: '智慧女神', ja: '知恵の女神', en: 'Goddess of Wisdom' },
    line: { zh: '冷靜下來，答案就在眼前。', ja: '落ち着いて。答えは、もう君の中にある。', en: 'Breathe. You already know the answer.' } },
  apollo: { names: { zh: '阿波羅', ja: 'アポロン', en: 'APOLLO' }, titles: { zh: '光明之神', ja: '光の神', en: 'God of Light' },
    line: { zh: '讓光照亮你的路吧。', ja: '君は君のまま、輝けばいい。', en: 'Shine on. The world needs your light.' } },
  guard: { names: { zh: '阿提米絲', ja: 'アルテミス', en: 'ARTEMIS' }, titles: { zh: '月之女神', ja: '月の女神', en: 'Goddess of the Moon' },
    line: { zh: '你想守護的人，我一起守護。', ja: '君の大切なものは、私が守り抜く。', en: 'Anyone who messes with yours answers to me.' } },
  zeus: { names: { zh: '宙斯', ja: 'ゼウス', en: 'ZEUS' }, titles: { zh: '眾神之王', ja: '神々の王', en: 'King of the Gods' },
    line: { zh: '有我在，誰也動不了你。', ja: '案ずるな。この私がついている。', en: 'Fear not. Olympus has your back.' } },
  freedom: { names: { zh: '赫密士', ja: 'ヘルメス', en: 'HERMES' }, titles: { zh: '旅神', ja: '旅の神', en: 'God of Travelers' },
    line: { zh: '走吧，世界在等你！', ja: 'さあ、出発だ！世界が君を待ってる。', en: 'Pack light. Adventure is calling!' } },
  iris: { names: { zh: '伊麗絲', ja: 'イリス', en: 'IRIS' }, titles: { zh: '彩虹女神', ja: '虹の女神', en: 'Goddess of the Rainbow' },
    line: { zh: '彩虹的盡頭，由你決定。', ja: '止まない雨はない。次は君が虹をかける番だ。', en: "Every storm runs out of rain. Your rainbow's next." } },
  create: { names: { zh: '維納斯', ja: 'ヴィーナス', en: 'VENUS' }, titles: { zh: '美神', ja: '美の女神', en: 'Goddess of Beauty' },
    line: { zh: '你創造的一切，都很美。', ja: 'あなたは、あなたのままで十分きれい。', en: "You're beautiful just the way you are." } },
  hephaestus: { names: { zh: '赫菲斯托斯', ja: 'ヘパイストス', en: 'HEPHAESTUS' }, titles: { zh: '鍛造之神', ja: '鍛冶の神', en: 'God of the Forge' },
    line: { zh: '想到了？那就動手打造吧！', ja: '鉄は熱いうちに打て！', en: "Strike while the iron's hot!" } },
  bond: { names: { zh: '丘比特', ja: 'キューピッド', en: 'CUPID' }, titles: { zh: '愛神', ja: '愛の神', en: 'God of Love' },
    line: { zh: '你的心，連著好多人的心。', ja: '君は、ひとりじゃない。', en: "You're never alone. Not on my watch." } },
  hera: { names: { zh: '希拉', ja: 'ヘラ', en: 'HERA' }, titles: { zh: '天后', ja: '神々の女王', en: 'Queen of the Gods' },
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
  for (const q of QUESTIONS) if (/^q\d+$/.test(q.id) && a[q.id]) count[a[q.id]] = (count[a[q.id]] || 0) + 1;
  const best = Math.max(0, ...Object.values(count));
  // 同分時，以第五題（最想要的超能力）為準，其次按題目順序
  const tied = Object.keys(count).filter((k) => count[k] === best);
  const tagId = tied.includes(a.q5) ? a.q5 : tied[0] || 'courage';
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
