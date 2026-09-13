/* 遠征事件：寶箱 / 險地 / 謎團
 *
 * 每個事件給 1–3 個選項，選項底下是一張機率表（w 是權重）。
 * 結果欄位：
 *   hp     生命變化，以「最大生命的比例」計（-0.5 = 掉一半）
 *   heal   回復比例      gold 金幣增減      sp 技能點
 *   potion / charge / herb  消耗品
 *   item   直接送一件裝備（'any' = 隨機一件買得起等級的）
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
          { w: 46, gold: 220, text: '裡面是一疊碎銀，壓得整整齊齊。' },
          { w: 24, potion: 2, gold: 80, text: '兩罐油和一點零錢。有人把補給留給下一個人。' },
          { w: 18, sp: 1, text: '箱底刻著一段練法。你看懂了其中一段。' },
          { w: 12, hp: -0.25, text: '箱蓋彈起，一道舊咒打在你臉上。有人把它留給下一個人，但不是善意。' }
        ] },
      { label: '先敲三下再開', hint: '穩，但拿得少',
        roll: [
          { w: 70, gold: 120, text: '沒有機關。你拿走裡面的錢，少了一點驚喜。' },
          { w: 30, gold: 150, herb: 1, text: '敲的時候聽出夾層，裡面還壓著一株乾掉的藥草。' }
        ] },
      { label: '不碰，繞過去', hint: '什麼都不會發生',
        roll: [{ w: 100, text: '你走過去了。有些箱子的價值就在於你沒有打開它。' }] }
    ]
  },
  {
    id: 'ev_chest_sealed', kind: 'chest', chapters: null,
    title: '封蠟的貨箱',
    text: '封蠟上的印記早就沒有人認得。箱子很重，重得不像裝著錢。',
    options: [
      { label: '撬開', hint: '重的東西通常是裝備',
        roll: [
          { w: 40, item: 'any', text: '裡面是一件還能用的裝備。' },
          { w: 35, gold: 300, text: '是金屬，只是被熔成了塊。' },
          { w: 25, bless: { name: '壓艙', desc: '這趟遠征生命上限 +12%', mods: { hp: 0.12 } },
            text: '箱底是一塊配重鉛。你把它綁在背上，走起來竟然更穩。' }
        ] },
      { label: '搬去換錢', hint: '穩定的一筆',
        roll: [{ w: 100, gold: 200, text: '沿路的商隊按重量收，沒有問來歷。' }] }
    ]
  },
  {
    id: 'ev_chest_votive', kind: 'chest', chapters: null,
    title: '供奉的陶罐',
    text: '一排小陶罐擺在石龕上，有的空了，有的還封著。' +
          '這是給神的，不是給你的。不過神已經很久沒來收了。',
    options: [
      { label: '拿封著的那幾個', hint: '拿走供品',
        roll: [
          { w: 50, herb: 2, gold: 90, text: '裡面是曬乾的草和一點碎銀。供品向來很實際。' },
          { w: 30, gold: 280, text: '有人供了錢。神沒有拿，你拿了。' },
          { w: 20, hp: -0.18, text: '罐口封的不是蠟，是某種會咬人的東西。' }
        ] },
      { label: '自己也放一個上去', hint: '花錢，換心安',
        roll: [
          { w: 100, gold: -80, bless: { name: '還願', desc: '這趟遠征護甲 +8、生命上限 +8%', mods: { armorFlat: 8, hp: 0.08 } },
            text: '你把身上的一點錢留在石龕上。接下來那幾天，運氣意外地好。' }
        ] }
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
          { w: 35, hp: -0.5, text: '走到一半，一道舊咒從地下轟上來。你的血掉了一半。' },
          { w: 20, hp: -0.2, gold: 160, text: '爆炸把你掀翻，也把地下的東西掀了出來。你撿了一把。' }
        ] },
      { label: '貼著牆慢慢走', hint: '安全得多，但要花時間',
        roll: [
          { w: 72, hp: -0.08, text: '擦傷而已。慢有慢的好處。' },
          { w: 28, hp: -0.3, text: '牆本身就是機關的一部分。你學到這一課，用掉三成的血。' }
        ] },
      { label: '丟一塊石頭試', hint: '花一點錢買情報',
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
  {
    id: 'ev_hazard_oracle', kind: 'hazard', chapters: null,
    title: '路口的石籤',
    text: '一塊立石上刻著兩行字，字很舊，意思剛好相反。' +
          '古代的神諭向來是這樣寫的：無論發生什麼，事後看都是準的。',
    options: [
      { label: '照上面那行走', hint: '賭一半',
        roll: [
          { w: 50, gold: 300, herb: 1, text: '路通了，而且短。石籤這次是對的。' },
          { w: 50, hp: -0.34, text: '路不通。你繞回來的時候，天已經黑了。' }
        ] },
      { label: '照下面那行走', hint: '也是賭一半',
        roll: [
          { w: 50, sp: 1, text: '你繞了遠路，但在路上看懂了一件之前想不通的事。' },
          { w: 50, hp: -0.26, gold: 80, text: '遠路有遠路的代價。撿到一點東西算是安慰。' }
        ] },
      { label: '兩行都不聽', hint: '自己找路',
        roll: [{ w: 100, hp: -0.12, text: '你自己挑了一條。不好走，但至少是你挑的。' }] }
    ]
  },

  /* ══════════ 謎團（各章一則） ══════════ */
  {
    id: 'ev_atlantis_light', kind: 'mystery', chapters: ['atlantis'],
    title: '還亮著的燈',
    text: '城沉下去九千年了，這排燈還亮著。沒有人在添油，它們就是還亮著。',
    options: [
      { label: '拆一盞帶走', hint: '帶走光',
        roll: [
          { w: 55, item: 'any', text: '燈座裡嵌著一件東西。你把它拆下來，燈滅了。' },
          { w: 45, hp: -0.3, gold: 180, text: '你一碰，整排燈同時暴亮。眼睛痛了很久，但你摸到了燈座裡的金。' }
        ] },
      { label: '什麼都不動，看一會兒', hint: '只是看',
        roll: [
          { w: 100, herb: 2, bless: { name: '還亮著', desc: '這趟遠征吸血 +8%', mods: { lifesteal: 0.08 } },
            text: '你坐下來看了很久。離開的時候，石縫裡長的那些草你也採了幾株——' +
                  '有些東西不是拆下來才有用的。' }
        ] }
    ]
  },
  {
    id: 'ev_knossos_thread', kind: 'mystery', chapters: ['knossos'],
    title: '地上的一條線',
    text: '走道的地上躺著一條細線，一路延伸進黑暗裡。' +
          '線的這一頭綁在門柱上，打了一個很用力的結。',
    options: [
      { label: '順著線往裡走', hint: '有人先進去了',
        roll: [
          { w: 45, item: 'any', gold: 120, text: '線的盡頭是一個人的背包。人不在了，東西還在。' },
          { w: 55, hp: -0.32, text: '線在中途被咬斷。斷口是新的。' }
        ] },
      { label: '把線收起來帶走', hint: '拿走出去的辦法',
        roll: [
          { w: 100, bless: { name: '出來的辦法', desc: '這趟遠征冷卻縮減 +12%、移速 +10%', mods: { cdr: 0.12, moveSpd: 0.10 } },
            text: '進去的辦法人人都有，出來的辦法只有這一團。' +
                  '你把它捲好收進懷裡，之後走每一段路都快了一點。' }
        ] }
    ]
  },
  {
    id: 'ev_troy_horse', kind: 'mystery', chapters: ['troy'],
    title: '門口的那個東西',
    text: '城門外立著一個木造的、很大的東西。沒有人知道是誰做的，' +
          '但所有人都同意：把它留在外面過夜，看起來很不尊重。',
    options: [
      { label: '幫忙把它拉進來', hint: '大家都在拉',
        roll: [
          { w: 40, gold: 420, text: '拉進來之後什麼也沒發生。你分到了一份工錢。' },
          { w: 60, hp: -0.45, gold: 200, text: '半夜它開了。你活下來，還撿到不少東西。' }
        ] },
      { label: '繞到後面看看底部', hint: '先確認',
        roll: [
          { w: 70, sp: 1, bless: { name: '先看底部', desc: '這趟遠征暴擊率 +10%', mods: { crit: 0.10 } },
            text: '底部有拼接的縫，還有腳印。你什麼都沒說，但從此看東西都先看底下。' },
          { w: 30, hp: -0.15, text: '有人從上面推了你一把。「別掃興。」' }
        ] },
      { label: '不管它，去睡覺', hint: '省事',
        roll: [{ w: 100, heal: 0.2, text: '你睡了一個好覺。醒來的時候城裡很吵，但你休息夠了。' }] }
    ]
  },
  {
    id: 'ev_cyclops_name', kind: 'mystery', chapters: ['cyclops'],
    title: '他問你叫什麼',
    text: '洞口的巨人擋住出路。他沒有立刻動手，先問了一個問題：' +
          '「你叫什麼名字？」',
    options: [
      { label: '說真名', hint: '誠實',
        roll: [
          { w: 45, gold: 340, text: '他點點頭，讓開了。有些人只是想知道對方是誰。' },
          { w: 55, hp: -0.4, text: '他記住了。記住之後，他叫來了別人。' }
        ] },
      { label: '說「沒有人」', hint: '古老的那一招',
        roll: [
          { w: 100, herb: 2, bless: { name: '沒有人', desc: '這趟遠征傷害 +18%', mods: { dmg: 0.18 } },
            text: '你從他身邊走出去。身後傳來喊叫：「沒有人弄的！」' +
                  '鄰居聽了，就沒有人來。' }
        ] },
      { label: '不回答，直接走', hint: '不給他任何東西',
        roll: [
          { w: 50, hp: -0.22, text: '他抓了你一把。你掙脫了，但留下了一塊皮。' },
          { w: 50, sp: 1, text: '他愣住了。原來不回答也是一個答案。' }
        ] }
    ]
  },
  {
    id: 'ev_amazon_belt', kind: 'mystery', chapters: ['amazon'],
    title: '她本來願意給',
    text: '女王站在營地中間，手按在腰帶上。' +
          '你來要這條腰帶。她看了你很久，然後說：「你可以直接開口的。」',
    options: [
      { label: '開口要', hint: '不動手',
        roll: [
          { w: 100, item: 'any', bless: { name: '直接開口', desc: '這趟遠征小兵傷害與生命各 +22%', mods: { minionDmg: 0.22, minionHp: 0.22 } },
            text: '她解下來遞給你，順便讓十幾個人跟你走一段。' +
                  '整場仗本來就不必打——只是後來的人不喜歡這個版本。' }
        ] },
      { label: '動手搶', hint: '快，但貴',
        roll: [
          { w: 55, gold: 460, hp: -0.3, text: '你拿到了腰帶。營地在你身後燒了起來。' },
          { w: 45, hp: -0.5, text: '她們騎馬，你不騎。你拿到腰帶的時候，血只剩一半。' }
        ] }
    ]
  },
  {
    id: 'ev_colossus_knee', kind: 'mystery', chapters: ['colossus'],
    title: '不要扶',
    text: '巨像躺在港口邊，從膝蓋折成兩截。旁邊立著一塊石籤，上面只有兩個字：不要扶。' +
          '它已經躺了很久，久到躺著才像是它原本的樣子。',
    options: [
      { label: '試著扶起來', hint: '違背神諭',
        roll: [
          { w: 35, sp: 2, gold: 300, text: '它當然沒有立起來。但你在斷口裡看到了鑄造的手法，學到了東西。' },
          { w: 65, hp: -0.44, text: '一整塊銅皮滑下來。你躲開了大部分，不是全部。' }
        ] },
      { label: '照著石籤，什麼都不做', hint: '聽話',
        roll: [
          { w: 100, gold: 260, bless: { name: '八百年', desc: '這趟遠征護甲 +14、攻城傷害 +25%', mods: { armorFlat: 14, siege: 0.25 } },
            text: '你繞過去，在它的影子裡走了很長一段。' +
                  '那個影子比任何城牆都涼快，也比任何城牆都久。' }
        ] }
    ]
  },
  {
    id: 'ev_pharos_keeper', kind: 'mystery', chapters: ['pharos'],
    title: '添油的人',
    text: '一個守火人正沿著塔內的斜坡把油推上去。他每天推，' +
          '推了三十年。他說他沒有看過那盞火從外面是什麼樣子。',
    options: [
      { label: '幫他推上去', hint: '花力氣',
        roll: [
          { w: 100, hp: -0.12, sp: 1,
            bless: { name: '推上去的人', desc: '這趟遠征技能傷害 +20%、冷卻縮減 +8%', mods: { power: 0.20, cdr: 0.08 } },
            text: '斜坡很長。到頂的時候你們都說不出話。' +
                  '他指著海面說：那些燈是船。你替他看了一眼。' }
        ] },
      { label: '問他為什麼不出去看一次', hint: '只是問',
        roll: [
          { w: 60, gold: 380, text: '「出去看的話，誰添油？」他說完就笑了，塞給你一袋錢。' },
          { w: 40, herb: 3, text: '他沒有回答，只是給了你幾株長在塔基石縫裡的草。' }
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
          { w: 100, gold: -100, item: 'any', herb: 1,
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
