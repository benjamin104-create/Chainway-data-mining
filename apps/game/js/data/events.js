/* 遠征事件：寶箱 / 險地 / 謎團
 *
 * 每個事件給 1–3 個選項，選項底下是一張機率表（w 是權重）。
 * 結果欄位：
 *   hp     生命變化，以「最大生命的比例」計（-0.5 = 掉一半）
 *   heal   回復比例
 *   gold   金幣增減
 *   sp     技能點
 *   potion / charge  消耗品
 *   item   直接送一件裝備（id）
 *   bless  這趟遠征有效的加持 {name, desc, mods}
 *   text   結果描述
 *
 * chapters 為 null 代表哪一章都可能出現。
 */
window.G = window.G || {};

G.EVENTS = [
  /* ══════════ 神秘寶箱 ══════════ */
  {
    id: 'ev_chest_plain', kind: 'chest', chapters: null,
    title: '一只沒有鎖的箱子',
    text: '路邊放著一只木箱，沒有鎖，也沒有灰。' +
          '沒有灰這件事比沒有鎖更可疑——有人最近才把它放在這裡。',
    options: [
      { label: '直接打開', hint: '大機率有東西，小機率有代價',
        roll: [
          { w: 46, gold: 220, text: '裡面是一疊碎金，壓得整整齊齊。' },
          { w: 24, potion: 2, gold: 80, text: '兩罐油和一點零錢。有人把補給留給下一個人。' },
          { w: 18, sp: 1, text: '箱底刻著一段練法。你看懂了其中一段。' },
          { w: 12, hp: -0.25, text: '箱蓋彈起，一道舊咒打在你臉上。有人把它留給下一個人，但不是善意。' }
        ] },
      { label: '先敲三下再開', hint: '穩，但拿得少',
        roll: [
          { w: 70, gold: 120, text: '沒有機關。你拿走裡面的錢，少了一點驚喜。' },
          { w: 30, gold: 150, potion: 1, text: '敲的時候聽出夾層，裡面還藏了一罐油。' }
        ] },
      { label: '不碰，繞過去', hint: '什麼都不會發生',
        roll: [{ w: 100, text: '你走過去了。有些箱子的價值就在於你沒有打開它。' }] }
    ]
  },
  {
    id: 'ev_chest_sealed', kind: 'chest', chapters: null,
    title: '封蠟的貨箱',
    text: '封蠟上的印記早就沒有人認得。箱子很重，重得不像裝著金子。',
    options: [
      { label: '撬開', hint: '重的東西通常是裝備',
        roll: [
          { w: 40, item: 'any', text: '裡面是一件還能用的裝備。' },
          { w: 35, gold: 300, text: '是金屬，只是被熔成了塊。' },
          { w: 25, bless: { name: '壓艙', desc: '這趟遠征生命上限 +12%', mods: { hp: 0.12 } },
            text: '箱底是一塊配重鐵。你把它綁在背上，走起來竟然更穩。' }
        ] },
      { label: '搬去換錢', hint: '穩定的一筆',
        roll: [{ w: 100, gold: 200, text: '沿路的商隊按重量收，沒有問來歷。' }] }
    ]
  },

  /* ══════════ 險地 ══════════ */
  {
    id: 'ev_hazard_blast', kind: 'hazard', chapters: null,
    title: '空氣不對',
    text: '前面一段路完全沒有聲音。沒有風、沒有蟲、沒有回音。' +
          '你走過那麼多條路，知道「安靜」從來不是安全的意思。',
    options: [
      { label: '直接衝過去', hint: '快，但可能吃一記',
        roll: [
          { w: 45, text: '什麼都沒發生。你回頭看了一眼，還是什麼都沒有。' },
          { w: 35, hp: -0.5, text: '走到一半，一道舊魔法從地下轟上來。你的血掉了一半。' },
          { w: 20, hp: -0.2, gold: 160, text: '爆炸把你掀翻，也把地下的東西掀了出來。你撿了一把。' }
        ] },
      { label: '貼著牆慢慢走', hint: '安全得多，但要花時間',
        roll: [
          { w: 72, hp: -0.08, text: '擦傷而已。慢有慢的好處。' },
          { w: 28, hp: -0.3, text: '牆本身就是機關的一部分。你學到這一課，用掉三成的血。' }
        ] },
      { label: '丟一塊石頭試',  hint: '花一點錢買情報',
        roll: [
          { w: 100, gold: -60, text: '石頭飛到一半就化了。你退回來繞遠路，多花了一點盤纏，但人是完整的。' }
        ] }
    ]
  },
  {
    id: 'ev_hazard_bridge', kind: 'hazard', chapters: null,
    title: '斷了一半的橋',
    text: '橋還剩一半。剩的那一半看起來比斷掉的那一半更危險，因為它會讓你想走上去。',
    options: [
      { label: '跳過去', hint: '成敗都很乾脆',
        roll: [
          { w: 55, gold: 140, text: '你跳過去了，還在對岸撿到前一個人沒撿走的東西。' },
          { w: 45, hp: -0.35, text: '落地的時候橋塌了。你抓住邊緣爬上來，代價是三成多的血。' }
        ] },
      { label: '花錢請人搭板子', hint: '用錢換安全',
        roll: [{ w: 100, gold: -120, text: '兩塊板子和一段繩子。你安全過橋，錢包輕了一點。' }] }
    ]
  },
  {
    id: 'ev_hazard_ambush', kind: 'hazard', chapters: null,
    title: '有人在等',
    text: '路的兩側各有一排低矮的石堆。石堆的間距太整齊了，整齊到不像自然形成的。',
    options: [
      { label: '先發制人', hint: '主動出手',
        roll: [
          { w: 50, gold: 260, text: '你先動手，把埋伏的人趕走，順便接收了他們的行李。' },
          { w: 50, hp: -0.28, gold: 100, text: '你先動手，但對方不只兩個。打贏了，血也掉了。' }
        ] },
      { label: '假裝沒看見，照常走', hint: '賭對方也在猶豫',
        roll: [
          { w: 58, text: '什麼事都沒有。也許他們在等別人。' },
          { w: 42, hp: -0.42, text: '你猜錯了。走到中間才發現兩側同時站起來。' }
        ] }
    ]
  },

  /* ══════════ 謎團事件（帶章節味道） ══════════ */
  {
    id: 'ev_babel_tongue', kind: 'mystery', chapters: ['babel'],
    title: '一個聽不懂的人',
    text: '一個工匠坐在階梯上，對你說了很長一段話。你一個字也聽不懂，' +
          '但他的手一直指向同一個方向，而且說到某個詞的時候會停下來等你點頭。',
    options: [
      { label: '點頭', hint: '假裝聽懂',
        roll: [
          { w: 50, gold: 180, text: '他很高興，塞給你一袋東西，然後繼續講下去。' },
          { w: 50, hp: -0.15, text: '他很高興，把你推進了他指的那個方向。那裡有個坑。' }
        ] },
      { label: '搖頭，然後也對他說一段話', hint: '誠實地聽不懂',
        roll: [
          { w: 100, sp: 1, bless: { name: '同一件事', desc: '這趟遠征技能傷害 +15%', mods: { power: 0.15 } },
            text: '他愣了一下，然後笑了。兩個人各說各的，說了很久。' +
                  '你沒聽懂任何一個字，卻突然想通了一件跟塔無關的事。' }
        ] }
    ]
  },
  {
    id: 'ev_giza_alignment', kind: 'mystery', chapters: ['giza'],
    title: '對準的那一刻',
    text: '通道盡頭有一條細縫。你算過，再等一會兒，外面的某顆星就會正好落進那條縫裡。',
    options: [
      { label: '等', hint: '花時間換東西',
        roll: [
          { w: 70, sp: 1, gold: 200, text: '光準時落進來，照亮牆上一行字。你看懂了一半，那一半很有用。' },
          { w: 30, heal: 0.35, text: '光落進來，很暖。你在那道光裡睡著了一下，醒來精神好很多。' }
        ] },
      { label: '不等，繼續走', hint: '時間就是血',
        roll: [{ w: 100, gold: 90, text: '你沒有等。後面的路因此少走了一段，撿到一點零錢。' }] }
    ]
  },
  {
    id: 'ev_nazca_line', kind: 'mystery', chapters: ['nazca'],
    title: '腳下這條線',
    text: '你走的這條路本身就是一條線。它筆直到不合理，一路延伸到看不見的地方。' +
          '站在上面，你看不出它畫的是什麼。',
    options: [
      { label: '爬上旁邊的高地看', hint: '離遠一點',
        roll: [
          { w: 100, bless: { name: '看得出形狀', desc: '這趟遠征暴擊率 +12%、金幣 +20%', mods: { crit: 0.12, goldFind: 0.2 } },
            text: '從高處看下去，那些線突然變成一隻鳥。' +
                  '回到地面之後，你看什麼都比剛才清楚一點。' }
        ] },
      { label: '沿著線繼續走', hint: '相信路',
        roll: [
          { w: 60, gold: 240, text: '線帶你繞到一處補給點。畫線的人顯然也需要休息。' },
          { w: 40, hp: -0.2, text: '線筆直地穿過一片碎石地。它不在乎你的腳。' }
        ] }
    ]
  },
  {
    id: 'ev_atlantis_light', kind: 'mystery', chapters: ['atlantis'],
    title: '還亮著的燈',
    text: '城沉下去兩千年了，這排燈還亮著。沒有人在添油，它們就是還亮著。',
    options: [
      { label: '拆一盞帶走', hint: '帶走光',
        roll: [
          { w: 55, item: 'any', text: '燈座裡嵌著一件東西。你把它拆下來，燈滅了。' },
          { w: 45, hp: -0.3, gold: 180, text: '你一碰，整排燈同時暴亮。眼睛痛了很久，但你摸到了燈座裡的金。' }
        ] },
      { label: '什麼都不動，看一會兒', hint: '只是看',
        roll: [
          { w: 100, heal: 0.5, bless: { name: '還亮著', desc: '這趟遠征吸血 +8%', mods: { lifesteal: 0.08 } },
            text: '你坐下來看了很久。離開的時候傷口好了大半——' +
                  '有些東西不是拆下來才有用的。' }
        ] }
    ]
  },
  {
    id: 'ev_rapanui_rope', kind: 'mystery', chapters: ['rapanui'],
    title: '一截舊繩',
    text: '石像旁邊落著一截繩子，粗得驚人，斷口很舊。' +
          '傳說說石像是自己走過去的。傳說沒提這條繩子，也沒提拉繩子的那些人。',
    options: [
      { label: '撿起來綁在身上', hint: '帶著別人的力氣',
        roll: [
          { w: 100, bless: { name: '拉繩子的人', desc: '這趟遠征小兵傷害與生命各 +25%', mods: { minionDmg: 0.25, minionHp: 0.25 } },
            text: '繩子很重。但你發現，把它掛在身上以後，' +
                  '跟著你走的那些人腳步都變快了。' }
        ] },
      { label: '試著自己推石像', hint: '證明傳說',
        roll: [
          { w: 30, sp: 1, text: '你找到了重心。石像搖了一下，真的動了一步。' },
          { w: 70, hp: -0.4, text: '十噸就是十噸。你的背先讓步。' }
        ] }
    ]
  },
  {
    id: 'ev_bermuda_north', kind: 'mystery', chapters: ['bermuda'],
    title: '指北針在轉',
    text: '你的指北針開始慢慢地轉，沒有停下來的意思。它不是壞了——' +
          '它很認真地在指著某個方向，只是那個方向一直在動。',
    options: [
      { label: '跟著它走', hint: '相信一個不在地圖上的北方',
        roll: [
          { w: 45, gold: 380, text: '它帶你到一處沒有標記的地方。那裡有人留下了很多東西。' },
          { w: 55, hp: -0.45, text: '它帶你繞了一個大圈，回到原地。中間發生了什麼，你想不起來。' }
        ] },
      { label: '收起來，用星星導航', hint: '換一套判準',
        roll: [{ w: 100, gold: 120, heal: 0.2, text: '天上的東西比較老實。你走得慢，但沒有走錯。' }] }
    ]
  },
  {
    id: 'ev_stonehenge_clock', kind: 'mystery', chapters: ['stonehenge'],
    title: '一台只走兩格的鐘',
    text: '這些石頭是一台鐘。它一年只走兩格：夏至一格，冬至一格。' +
          '今天不是那兩天。',
    options: [
      { label: '等到對的那一天', hint: '代價是時間本身',
        roll: [
          { w: 100, sp: 2, hp: -0.3,
            bless: { name: '對準', desc: '這趟遠征傷害 +20%', mods: { dmg: 0.2 } },
            text: '你等了很久，久到忘了在等什麼。' +
                  '光終於落進來的那一刻，你學會了兩件事，也老了一點。' }
        ] },
      { label: '自己把石頭推到對的角度', hint: '不等，就改',
        roll: [
          { w: 50, gold: 320, text: '你推動了其中一塊。鐘走了一格，地上開了一個小口，裡面有東西。' },
          { w: 50, hp: -0.35, text: '你推動了其中一塊。它倒下來，砸在你身上。' }
        ] }
    ]
  },
  {
    id: 'ev_generic_veteran', kind: 'mystery', chapters: null,
    title: '一個坐著的老兵',
    text: '他坐在路邊，裝備比你好，但看起來不打算再往前走了。' +
          '「前面那座塔，」他說，「我拆過三次。」',
    options: [
      { label: '問他為什麼還在這裡', hint: '聽故事',
        roll: [
          { w: 60, sp: 1, text: '「因為拆完才發現，我不知道拆完要幹嘛。」他講了很久，有些是有用的。' },
          { w: 40, bless: { name: '拆過三次', desc: '這趟遠征攻城傷害 +30%', mods: { siege: 0.3 } },
            text: '他沒有回答，只是把怎麼拆塔最快講了一遍。' }
        ] },
      { label: '把補給分他一半', hint: '花東西',
        roll: [
          { w: 100, gold: -100, item: 'any', heal: 0.3,
            text: '他收下了，然後把自己背包裡的一件東西塞給你。「我用不到了。」' }
        ] },
      { label: '什麼都不說，走過去', hint: '不打擾',
        roll: [{ w: 100, text: '你們互相點了個頭。有些對話不發生比較好。' }] }
    ]
  }
];

/* 營地：不是事件，是固定的休息點 */
G.CAMP_OPTIONS = [
  { id: 'rest', label: '休息', desc: '回復 55% 生命。', icon: 'heal' },
  { id: 'sharpen', label: '磨利', desc: '這趟遠征傷害 +12%。', icon: 'crit' },
  { id: 'scout', label: '探路', desc: '揭開地圖上所有未知的節點，並拿一筆盤纏。', icon: 'range' }
];

G.eventsFor = chapterId =>
  G.EVENTS.filter(e => !e.chapters || e.chapters.indexOf(chapterId) >= 0);
