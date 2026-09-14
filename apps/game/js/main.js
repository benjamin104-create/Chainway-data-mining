/* 啟動、事件路由、戰鬥迴圈 */
(function () {
  const U = G.U, B = G.B, R = G.R;

  const input = { left: false, right: false, up: false, down: false };
  G.input = input;   // 方便除錯／自動測試
  let raf = null, last = 0, hudRefs = null, currentStageKey = null, currentOpts = null;

  /* ══════ 戰鬥畫面 ══════ */
  /* 讓整個戰場一定塞得進視窗。
     CSS 只能用固定的上下框估算值，但實際的上下框在手機、橫躺、
     App 內的小面板各不相同——估錯就會把主角推到畫面外，
     玩家看到一片空戰場，以為沒有戰鬥。所以這裡直接量。 */
  function fitBattle() {
    const wrap = document.querySelector('.battle-wrap');
    const cv = document.getElementById('screen');
    const hud = document.querySelector('.hud');
    if (!wrap || !cv) return;
    wrap.style.maxWidth = '';                 // 先還原，才量得到自然寬度
    const side = wrap.querySelector('.battle-side');
    const top = cv.getBoundingClientRect().top;

    /* 側欄在畫布「右邊」還是「下面」，由 CSS 的斷點決定。
       這裡用量的：側欄的左緣如果在畫布右緣之後，就是並排，
       並排時它不吃高度。把斷點寫在 JS 裡會跟 CSS 走散。 */
    const cb0 = cv.getBoundingClientRect();
    const sb0 = side ? side.getBoundingClientRect() : null;
    const beside = !!(sb0 && sb0.left >= cb0.right - 6);

    /* 畫布底下不是只有 HUD：迷宮層還多一條提示列。
       只量 HUD 的話，方向鍵會被擠到畫面外（橫躺的手機實測就是這樣）。
       所以把畫布之後的每一塊都加起來。 */
    let below = 16;
    if (!beside) {
      let sib = cv.nextElementSibling;
      while (sib) { below += sib.getBoundingClientRect().height; sib = sib.nextElementSibling; }
      if (!cv.nextElementSibling && hud) below += hud.getBoundingClientRect().height;
    }
    const avail = window.innerHeight - top - below;
    // 4:3 的畫布：高度預算換算成寬度預算
    const byHeight = avail * (960 / 720);

    if (beside) {
      /* 並排：畫布能用的寬是「外框寬 − 側欄寬」，高度就是整個視窗剩下的。
         桌機實測戰場只佔視窗寬的 19%，右邊空著 513px，就是因為
         原本什麼都往下疊，高度被吃光、寬度卻沒人用。 */
      wrap.style.maxWidth = '';
      const room = wrap.getBoundingClientRect().width - sb0.width - 14;
      const w = Math.max(280, Math.min(room, byHeight));
      cv.style.width = Math.round(w) + 'px';
      cv.style.height = Math.round(w * 720 / 960) + 'px';
      cv.style.margin = '';
    } else {
      const natural = wrap.getBoundingClientRect().width;
      const w = Math.max(240, Math.min(natural, byHeight));
      /* 收窄的是整個外框，標題列與 HUD 也跟著被擠。
         擠到 340 以下，標題列的字會折成兩三行、HUD 也長高，
         反而把剛省下來的高度吃回去——手機橫躺實測：
         外框被收到 264，標題列就從 28 長到 70。
         所以太窄的時候只收畫布，外框讓它維持原寬。 */
      if (w < 340) {
        wrap.style.maxWidth = '';
        cv.style.width = Math.round(w) + 'px';
        cv.style.height = Math.round(w * 720 / 960) + 'px';
        cv.style.margin = '0 auto';
      } else {
        cv.style.width = cv.style.height = cv.style.margin = '';
        wrap.style.maxWidth = Math.round(w) + 'px';
      }
    }

    /* 矮螢幕的十字鍵是浮在上面的（CSS 那邊設成 absolute）。
       預設貼外框底部會壓在血條上，所以抬高一個 HUD 的高度，
       讓它落在戰場的右下角。高度是量的，不是寫死的。 */
    const dp = wrap.querySelector('.dpad');
    if (dp) {
      if (getComputedStyle(dp).position === 'absolute' && hud) {
        dp.style.bottom = Math.round(hud.getBoundingClientRect().height + 6) + 'px';
      } else {
        dp.style.bottom = '';
      }
    }
  }
  U.fitBattle = fitBattle;

  const fitsHere = () => U.screen === 'battle' || U.screen === 'maze';
  window.addEventListener('resize', () => { if (fitsHere()) fitBattle(); });
  window.addEventListener('orientationchange', () => {
    if (fitsHere()) setTimeout(fitBattle, 120);
  });

  /* 上下左右方向鍵。
     線形戰場只吃得到左右（上下沒有意義，會自動變灰），
     迷宮層四個方向都要用。兩邊共用同一組按鍵與同一個 input 物件。 */
  function dpad(withAttack) {
    return '<div class="dpad' + (withAttack ? ' with-atk' : '') + '">' +
      '<button class="dp up"    data-hold="up"    aria-label="上">▲</button>' +
      '<button class="dp left"  data-hold="left"  aria-label="左">◀</button>' +
      '<button class="dp down"  data-hold="down"  aria-label="下">▼</button>' +
      '<button class="dp right" data-hold="right" aria-label="右">▶</button>' +
      (withAttack ? '<button class="dp atk" data-act="maze-swing" aria-label="攻擊">劍</button>' : '') +
    '</div>';
  }
  U.dpad = dpad;

  function battleView(stage, opts) {
    const cls = G.getClass(G.S.classId);
    const skills = G.S.classes[cls.id].bar;
    const slots = skills.map((id, i) => {
      const sk = id ? G.SKILLS[id] : null;
      return '<button class="sk' + (sk ? '' : ' empty') + '" style="--c:' + cls.color + '" data-cast="' + i + '">' +
        '<span class="key">' + (i + 1) + '</span>' +
        (sk ? G.icon(sk.icon) : '') +
        '<span class="cd" hidden></span>' +
        '<span class="charges" hidden></span>' +
        (sk ? '<span class="sk-name">' + sk.name + '</span>' : '') +
      '</button>';
    }).join('');

    U.view.innerHTML =
      '<div class="battle-wrap">' +
        '<div class="battle-top">' +
          '<span class="battle-title">' + ((opts && opts.label) ? opts.label + '　·　' : '') + stage.name + '</span>' +
          '<span class="sep">|</span>' +
          '<span class="towers-left" id="towersLeft"></span>' +
          '<span class="sep">|</span>' +
          '<span style="font-size:12px;color:var(--parch-mute)" id="waveInfo"></span>' +
          (stage.par && !(opts && opts.cave)
            ? '<span class="sep">|</span><span class="par-clock" id="parClock" title="在限時內過關可以拿一顆星與一點技能點"></span>'
            : '') +
          '<span class="spacer"></span>' +
          '<button class="btn btn-primary" data-act="begin-battle" id="beginBtn">開戰</button>' +
          '<button class="btn btn-ghost" data-act="pause" id="pauseBtn" hidden>暫停</button>' +
          '<button class="btn btn-ghost" data-act="retreat">撤退</button>' +
        '</div>' +
        '<canvas id="screen"></canvas>' +
        '<div class="battle-side">' +
        '<div class="hud">' +
          '<div class="vital">' +
            '<div class="vital-row"><span>' + cls.name + '</span><span id="hpText"></span></div>' +
            '<div class="hpbar"><u id="hpGhost"></u><i id="hpFill"></i></div>' +
            '<div class="vital-row"><span id="goldRun">現場資金 0</span><span id="killRun">0 擊殺</span></div>' +
          '</div>' +
          '<div class="skillbar">' + slots + '</div>' +
          '<div class="consumables">' +
            '<button class="cons" data-cons-use="c_potion"><span class="key">Q</span>' + G.icon('heal') + '<span class="n" id="nPotion"></span></button>' +
            '<button class="cons" data-cons-use="c_charge"><span class="key">E</span>' + G.icon('quake') + '<span class="n" id="nCharge"></span></button>' +
            dpad() +
          '</div>' +
        '</div>' +
        /* 僱用所是「會花錢」的區塊，跟上面「不用錢」的道具欄隔開。
           兩排長得一樣又貼在一起，手指滑一下就變成買東西。 */
        '<div class="hirebar" id="hirebar">' +
          '<div class="hire-head"><span class="hire-spend">花錢</span>' +
          '<span class="hire-post" id="hirePostName">僱用所</span>' +
          '<span class="hire-purse" id="hirePurse"></span></div>' +
          '<div class="hire-opts" id="hireOpts"></div>' +
        '</div>' +
        '<p class="controls-hint"><kbd>A</kbd><kbd>D</kbd>／<kbd>←</kbd><kbd>→</kbd> 移動　' +
        '<kbd>1</kbd>–<kbd>4</kbd> 技能　<kbd>Q</kbd>／<kbd>E</kbd> 消耗品　' +
        '<kbd>Z</kbd><kbd>X</kbd><kbd>C</kbd> 僱用　<kbd>空白鍵</kbd> 暫停。' +
        '部署階段點地圖上的據點先擺好人，按<kbd>空白鍵</kbd>或「開戰」開始。' +
        '普通攻擊自動進行；先拆掉哨塔，主塔才會失去無敵。</p>' +
        '</div>' +
      '</div>';

    hudRefs = {
      hpFill: document.getElementById('hpFill'),
      hpGhost: document.getElementById('hpGhost'),
      hpbar: document.querySelector('.hpbar'),
      hpText: document.getElementById('hpText'),
      goldRun: document.getElementById('goldRun'),
      killRun: document.getElementById('killRun'),
      towersLeft: document.getElementById('towersLeft'),
      waveInfo: document.getElementById('waveInfo'),
      nPotion: document.getElementById('nPotion'),
      nCharge: document.getElementById('nCharge'),
      pauseBtn: document.getElementById('pauseBtn'),
      beginBtn: document.getElementById('beginBtn'),
      hirebar: document.getElementById('hirebar'),
      hirePostName: document.getElementById('hirePostName'),
      hirePurse: document.getElementById('hirePurse'),
      hireOpts: document.getElementById('hireOpts'),
      hireSig: '',
      sks: Array.from(document.querySelectorAll('.sk'))
    };
  }

  /* ══════════ 魔王迷宮 ══════════ */
  let mazeRaf = null;

  U.startMaze = function (chapterId, node) {
    const ch = G.getChapter(chapterId);
    G.S.maze = G.buildMaze(chapterId, (Date.now() ^ (Math.random() * 1e9)) >>> 0);
    G.S.maze.node = node ? node.id : null;
    G.S.maze.hp = (G.runActive() ? G.runActive().hpPct : 1);
    G.save();
    U.showMaze();
  };

  U.showMaze = function () {
    const m = G.S.maze;
    if (!m) { U.show('chapters'); return; }
    const ch = G.getChapter(m.chapterId);
    U.screen = 'maze';
    U.renderTop(); U.renderNav();
    U.view.innerHTML =
      '<div class="battle-wrap is-maze">' +
        '<div class="battle-top">' +
          '<span class="battle-title">' + ch.name + ' · 魔王迷宮</span>' +
          '<span class="sep">|</span>' +
          '<span id="mazeWhere" style="font-size:12px;color:var(--parch-mute)"></span>' +
          '<span class="spacer"></span>' +
          '<button class="btn btn-ghost" data-act="maze-leave">撤退</button>' +
        '</div>' +
        '<canvas id="screen"></canvas>' +
        '<div class="battle-side">' +
        '<div class="hud">' +
          '<div class="vital">' +
            '<div class="vital-row"><span>' + G.getClass(G.S.classId).name + '</span><span id="mazeHp"></span></div>' +
            '<div class="hpbar"><i id="mazeFill"></i></div>' +
            '<div class="vital-row"><span id="mazeLoot">撿到 0 金幣</span><span id="mazeHerb">藥草 0</span></div>' +
          '</div>' +
          '<div class="cons-row">' + dpad(true) + '</div>' +
        '</div>' +
        '<div class="maze-tip" id="mazeTip">用方向鍵走迷宮，找到亮起來的「門」就能進下一格。' +
          '右上角的小地圖會標出魔王在哪一格。</div>' +
        '</div>' +
      '</div>';
    const cv = document.getElementById('screen');
    R.setup(cv);
    R.palette = ch.palette; R.chapter = ch;
    input.left = input.right = input.up = input.down = false;
    requestAnimationFrame(fitBattle);
    G.__mazeT = 0;
    lastMaze = performance.now();
    if (mazeRaf) cancelAnimationFrame(mazeRaf);
    mazeRaf = requestAnimationFrame(mazeLoop);
  };

  let lastMaze = 0;
  function stopMaze() { if (mazeRaf) cancelAnimationFrame(mazeRaf); mazeRaf = null; }

  function mazeLoop(now) {
    const m = G.S.maze;
    if (!m || U.screen !== 'maze') { stopMaze(); return; }
    const dt = Math.min(0.05, (now - lastMaze) / 1000);
    lastMaze = now;
    G.__mazeT += dt;

    const evs = G.mazeUpdate(m, dt, input);
    R.drawMaze(m);
    mazeHud(m);

    for (const ev of evs) {
      if (ev.t === 'boss') { stopMaze(); enterMazeBoss(); return; }
      if (ev.t === 'down') { stopMaze(); mazeDown(); return; }
      if (ev.t === 'village') { stopMaze(); mazeVillage(); return; }
      if (ev.t === 'chest') tip('打開了寶箱。');
      if (ev.t === 'herb') { tip('採到兩株藥草。'); }
      if (ev.t === 'trap') tip('踩到陷阱。');
      if (ev.t === 'move') tip(ev.kind === 'boss' ? '魔王就在這一格。' : '換了一格。');
    }
    mazeRaf = requestAnimationFrame(mazeLoop);
  }

  let tipTimer = 0;
  function tip(text) {
    const el = document.getElementById('mazeTip');
    if (!el) return;
    el.textContent = text;
    el.classList.add('hot');
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { el.classList.remove('hot'); }, 1400);
  }

  function mazeHud(m) {
    const f = document.getElementById('mazeFill');
    if (!f) return;
    f.style.width = Math.round(m.hp * 100) + '%';
    document.getElementById('mazeHp').textContent = Math.round(m.hp * 100) + '%';
    document.getElementById('mazeLoot').textContent = '撿到 ' + m.gold + ' 金幣';
    document.getElementById('mazeHerb').textContent = '藥草 ' + m.herbs;
    const w = document.getElementById('mazeWhere');
    if (w) {
      const c = G.mazeCell(m);
      const names = { start: '入口', boss: '魔王', treasure: '寶室', cave: '洞穴',
                      village: '村子', trap: '陷阱區', empty: '空房' };
      w.textContent = '第 ' + (m.at.x + 1) + ' 行 ' + (m.at.y + 1) + ' 列　·　' + (names[c.kind] || '房間');
    }
  }

  function enterMazeBoss() {
    const m = G.S.maze;
    G.S.gold += m.gold;
    G.S.consumables.c_herb = (G.S.consumables.c_herb | 0) + m.herbs;
    const run = G.runActive();
    if (run) run.hpPct = m.hp;
    const node = run && m.node ? G.runNode(m.node) : null;
    G.save();
    U.renderTop();          // 迷宮撿到的金幣要馬上反映在上面那條，不然玩家會以為沒算到
    startBattle(m.chapterId + '-3', { node: node, startHpPct: m.hp, label: '魔王', fromMaze: true });
  }

  function mazeDown() {
    const m = G.S.maze;
    G.S.gold += Math.round(m.gold * 0.5);
    G.save();
    U.showRunEnd(false, '你在迷宮裡倒下了。撿到的東西只帶回一半。');
    G.S.maze = null;
  }

  function mazeVillage() {
    const m = G.S.maze;
    m.hp = Math.min(1, m.hp + 0.4);
    G.save();
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML =
      '<div class="event-box">' +
        '<div class="event-head" style="--c:#7FBF6A"><span class="event-kind">村子</span><h2>還有人住在這裡</h2></div>' +
        '<p class="event-text">他們給了你水跟一塊麵包，沒有問你要去哪裡。<b>生命回復 40%</b>。</p>' +
        '<div class="event-options"><button class="btn btn-primary" data-act="maze-resume">繼續走</button></div>' +
      '</div>';
    document.body.appendChild(el);
    U.eventEl = el;
  }

  U.resumeMaze = function () {
    U.closeEvent();
    lastMaze = performance.now();
    if (mazeRaf) cancelAnimationFrame(mazeRaf);
    mazeRaf = requestAnimationFrame(mazeLoop);
  };

  function startBattle(stageKey, opts) {
    currentStageKey = stageKey;
    currentOpts = opts || null;
    const stage = G.getStage(stageKey);
    U.screen = 'battle';
    U.renderNav();
    battleView(stage, currentOpts);
    B.init(stageKey, currentOpts || {});
    const cv = document.getElementById('screen');
    R.setup(cv);
    R.buildBackdrop(G.getChapter(stage.chapterId), stage);
    cv.addEventListener('pointerdown', onCanvasPointer);
    requestAnimationFrame(fitBattle);
    input.left = input.right = input.up = input.down = false;
    hpGhostPct = null; hpPrevPct = 100;
    last = performance.now();
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  U.startRunBattle = function (stageKey, opts) { startBattle(stageKey, opts); };

  function stopBattle() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    B.update(dt, input);
    R.draw();
    dtHud = dt;
    updateHud();
    if (B.over && B.overTimer > 1.1) { endBattle(); return; }
    raf = requestAnimationFrame(loop);
  }

  let hpGhostPct = null, hpPrevPct = 100, dtHud = 1 / 60;

  function updateHud() {
    const pc = document.getElementById('parClock');
    if (pc && B.stage && B.stage.par) {
      const left = B.stage.par - B.time;
      const mm = t => Math.floor(Math.abs(t) / 60) + ':' + String(Math.floor(Math.abs(t) % 60)).padStart(2, '0');
      const got = G.S.starred[B.stage.key];
      pc.textContent = got ? '★ 已拿過星'
        : left > 0 ? '★ ' + mm(left)
        : '★ 超時 ' + mm(left);
      pc.className = 'par-clock' + (got ? ' done' : left > 0 ? (left < 20 ? ' warn' : '') : ' over');
    }
    if (!hudRefs) return;
    const h = B.hero;
    const pct = Math.max(0, h.hp) / h.maxHp * 100;
    hudRefs.hpFill.style.width = pct.toFixed(1) + '%';

    /* 血條的掉血動畫：
       實心的那條立刻掉到新的血量，後面留一條紅色殘影慢慢追上來，
       追的過程中整條血條會閃一下。這樣才看得出「剛剛被打掉多少」。 */
    if (hpGhostPct == null) hpGhostPct = pct;
    if (pct < hpGhostPct - 0.01) {
      if (pct < hpPrevPct - 0.01) {
        hudRefs.hpbar.classList.remove('hit');
        void hudRefs.hpbar.offsetWidth;      // 重跑動畫
        hudRefs.hpbar.classList.add('hit');
      }
      // 殘影每秒追掉 55% 的差距，小傷追得快、大傷留得久
      hpGhostPct = Math.max(pct, hpGhostPct - Math.max(18, (hpGhostPct - pct) * 2.4) * dtHud);
    } else {
      hpGhostPct = pct;
    }
    hpPrevPct = pct;
    hudRefs.hpGhost.style.width = hpGhostPct.toFixed(1) + '%';
    hudRefs.hpText.textContent = Math.max(0, Math.round(h.hp)) + ' / ' + h.maxHp + (h.shield > 0 ? '  +' + Math.round(h.shield) : '');
    hudRefs.goldRun.textContent = '現場資金 ' + B.purse;
    hudRefs.killRun.textContent = B.kills + ' 擊殺';
    const alive = B.towers.filter(t => !t.dead).length;
    hudRefs.towersLeft.textContent = '敵塔 ' + alive + ' / ' + B.towers.length;
    hudRefs.waveInfo.textContent = B.phase === 'deploy'
      ? '部署階段　·　按「開戰」開始'
      : '第 ' + B.waveNo + ' 波　·　下一波 ' + Math.ceil(Math.max(0, B.waveTimer)) + ' 秒';
    if (hudRefs.beginBtn) hudRefs.beginBtn.hidden = B.phase !== 'deploy';
    if (hudRefs.pauseBtn) hudRefs.pauseBtn.hidden = B.phase === 'deploy';
    hudRefs.nPotion.textContent = B.consumables.c_potion;
    hudRefs.nCharge.textContent = B.consumables.c_charge;

    updateHireBar();

    hudRefs.sks.forEach((el, i) => {
      const def = B.skillDefs[i];
      const cdEl = el.querySelector('.cd');
      const chEl = el.querySelector('.charges');
      if (!def) { cdEl.hidden = true; chEl.hidden = true; return; }
      if (def.type === 'dash') {
        const max = B.flags.has('doubleDash') ? 2 : 1;
        chEl.hidden = false;
        chEl.textContent = B.dashCharges + '/' + max;
        const busy = B.dashCharges <= 0;
        cdEl.hidden = !busy;
        if (busy) cdEl.textContent = Math.ceil(B.dashRecharge);
        el.classList.toggle('ready', !busy);
      } else {
        chEl.hidden = true;
        const cd = B.cd[i];
        cdEl.hidden = cd <= 0;
        if (cd > 0) cdEl.textContent = cd >= 10 ? Math.ceil(cd) : cd.toFixed(1);
        el.classList.toggle('ready', cd <= 0);
      }
    });
  }

  function onCanvasPointer(ev) {
    if (B.phase !== 'deploy') return;
    const cv = ev.currentTarget;
    const rect = cv.getBoundingClientRect();
    const sx = (ev.clientX - rect.left) / rect.width * R.W;
    const sy = (ev.clientY - rect.top) / rect.height * R.H;
    const post = R.postAt(sx, sy);
    if (!post) return;
    if (!B.selectPost(post)) { U.toast('這個據點要先拆掉前面的哨塔才到得了'); return; }
    hudRefs.hireSig = '';
  }

  function updateHireBar() {
    const post = B.activePost;
    hudRefs.hirePurse.textContent = B.purse + ' 金幣';

    if (!post) {
      if (B.phase === 'deploy') {
        if (hudRefs.hireSig !== 'deploy-none') {
          hudRefs.hireSig = 'deploy-none';
          hudRefs.hirebar.classList.add('away');
          hudRefs.hirePostName.textContent = '部署';
          hudRefs.hireOpts.innerHTML =
            '<span class="hire-away">點地圖上亮起的據點，就能在那裡部署機械、武具或傭兵</span>';
        }
        return;
      }
      // 不在據點旁邊：指出最近的一個在哪個方向
      let near = null, bd = Infinity;
      B.posts.forEach(pp => {
        if (pp.stock.every(n => n <= 0)) return;
        const d = Math.abs(pp.x - B.hero.x);
        if (d < bd) { bd = d; near = pp; }
      });
      const sig = 'far:' + (near ? near.idx : 'none');
      if (hudRefs.hireSig !== sig) {
        hudRefs.hireSig = sig;
        hudRefs.hirebar.classList.add('away');
        hudRefs.hirePostName.textContent = near ? near.name : '僱用所';
        hudRefs.hireOpts.innerHTML = near
          ? '<span class="hire-away">在' + (near.x > B.hero.x ? '右' : '左') + '方，走過去就能僱用</span>'
          : '<span class="hire-away">這一關的僱用所都調度完了</span>';
      }
      return;
    }

    const sig = post.idx + ':' + post.stock.join(',');
    if (hudRefs.hireSig !== sig) {
      hudRefs.hireSig = sig;
      hudRefs.hirebar.classList.remove('away');
      hudRefs.hirePostName.textContent = post.name;
      hudRefs.hireOpts.innerHTML = post.offers.map((id, i) => {
        const hire = G.getHire(id);
        const cost = B.hireCostAt(id, post);
        const left = post.stock[i];
        return '<button class="hire" data-hire="' + id + '" title="' + hire.desc + '">' +
          '<span class="hire-key">' + hire.key + '</span>' +
          G.icon(hire.icon) +
          '<span class="hire-body"><b>' + hire.name + '</b>' +
          '<span class="hire-cat">' + G.HIRE_CATS[hire.cat].name + '</span></span>' +
          '<span class="hire-cost">' + cost + '</span>' +
          '<span class="hire-stock">' + (left > 0 ? '×' + left : '無') + '</span>' +
        '</button>';
      }).join('');
    }
    // 每幀只更新買不買得起
    Array.from(hudRefs.hireOpts.children).forEach((el, i) => {
      if (!el.dataset || !el.dataset.hire) return;
      const cost = B.hireCostAt(el.dataset.hire, post);
      el.disabled = post.stock[i] <= 0 || B.purse < cost;
    });
  }

  function tryHire(id) {
    const r = B.hire(id);
    if (!r.ok) { U.toast(r.why); return; }
    hudRefs.hireSig = '';        // 逼它重畫庫存
    U.toast('僱用　' + r.hire.name + '　−' + r.cost);
  }

  function hireByKey(key) {
    const post = B.activePost;
    if (!post) { U.toast('要站到僱用所旁邊'); return; }
    const id = post.offers.find(x => G.getHire(x).key === key);
    if (id) tryHire(id);
  }

  function endBattle() {
    stopBattle();
    const stage = B.stage;
    const win = B.over === 'win';
    const firstClear = win && !G.S.cleared[stage.key];

    const kept = Math.max(0, B.goldEarned - B.goldSpent);
    let gold = win ? kept + stage.reward.gold : Math.round(kept * 0.5);
    gold = Math.round(gold * (1 + B.stats.goldFind));
    let sp = 0, xp = 0, levels = 0;

    G.S.gold += gold;
    G.S.consumables = { c_potion: B.consumables.c_potion, c_charge: B.consumables.c_charge };

    if (win) {
      xp = stage.reward.xp;
      levels = G.addXp(xp).levels;
    } else {
      xp = Math.round(stage.reward.xp * 0.35);   // 打輸也算數，不會愈重打愈沒希望
      levels = G.addXp(xp).levels;
    }
    let star = false;
    if (win) {
      if (firstClear) {
        sp = stage.reward.sp;
        G.S.sp += sp;
        G.S.cleared[stage.key] = true;
      }
      const t = B.time;
      if (!G.S.best[stage.key] || t < G.S.best[stage.key]) G.S.best[stage.key] = t;
      /* 限時過關給一顆星 + 一點技能點。同一關只給一次，不能重刷。 */
      if (stage.par && t <= stage.par && !G.S.starred[stage.key] && !B.caveMode) {
        G.S.starred[stage.key] = true;
        G.S.stars = (G.S.stars | 0) + 1;
        G.S.sp += 1;
        sp += 1;
        star = true;
      }
    }
    /* 遠征：血量帶回地圖，贏了才算走完這個地點 */
    const run = G.runActive();
    const node = currentOpts && currentOpts.node ? G.runNode(currentOpts.node.id) : null;
    let bossWin = false, herbs = 0, guardDrop = null;
    const deaths = B.deaths;
    if (run && node) {
      // 帶出去的血 = 結束時的血，每倒下一次再扣 15%
      const endPct = win ? Math.max(0.10, B.hero.hp / B.hero.maxHp) : 0.25;
      run.hpPct = Math.max(0.06, endPct - deaths * 0.10);
      if (node.type === 'guardian') {
        guardDrop = G.runGuardianDone(node, win);
      } else if (node.type === 'cave') {
        herbs = G.runCaveDone(node, win);
      } else if (win) {
        G.runFinishNode(node, G.NODE_KINDS[node.type].name + '：拿下了。', 'good');
        const key = G.runStageKeyFor(node);
        if (key) G.S.cleared[key] = true;             // 裝備與職業解鎖看的是關卡代號
        bossWin = node.type === 'boss';
      } else {
        run.log.push({ text: G.NODE_KINDS[node.type].name + '：被打回來了，重整再上。', kind: 'bad' });
      }
    }

    /* 迷宮走完就丟掉，不要留一份走過的舊迷宮在存檔裡。
       打輸了也一樣：下次再進魔王節點會重新長一張。 */
    if (currentOpts && currentOpts.fromMaze) G.S.maze = null;

    G.save();
    U.renderTop();

    U.showResult({ result: B.over, stage, gold, sp, xp, levels, kills: B.kills,
                   time: B.time, earned: B.goldEarned, spent: B.goldSpent,
                   inRun: !!(run && node), bossWin: bossWin,
                   herbs: herbs, deaths: deaths,
                   cave: !!(node && node.type === 'cave'),
                   star: star, par: stage.par, stars: G.S.stars | 0,
                   guardian: !!(node && node.type === 'guardian'),
                   guardDrop: guardDrop ? guardDrop.name : null,
                   hats: (B.hatsFound || []).slice(),
                   hpLeft: run ? Math.round(run.hpPct * 100) : null });
  }

  function closeResult() {
    if (U.resultEl) { U.resultEl.remove(); U.resultEl = null; }
  }

  /* ══════ 事件 ══════ */
  document.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;

    /* 導覽 */
    if (t.dataset.tab) { closeResult(); stopBattle(); U.show(t.dataset.tab); return; }

    /* 開場 */
    if (t.dataset.act === 'begin') { G.S.seenIntro = true; G.save(); U.show('chapters'); return; }

    /* 關卡 */
    if (t.dataset.stage) { closeResult(); startBattle(t.dataset.stage); return; }

    /* 職業 */
    if (t.dataset.class) {
      G.S.classId = t.dataset.class;
      G.save();
      U.toast('已切換為　' + G.getClass(t.dataset.class).name);
      U.show('class');
      return;
    }

    /* 技能樹 */
    if (t.dataset.act === 'unlock') {
      const r = G.unlockNode(G.S.classId, t.dataset.node);
      if (!r.ok) { U.toast(r.why); return; }
      U.toast('已學習　' + G.getNode(G.S.classId, t.dataset.node).name);
      U.show('tree');
      return;
    }
    if (t.classList.contains('node')) { U.selectedNode = t.dataset.node; U.show('tree'); return; }
    if (t.dataset.act === 'respec') {
      G.respec(G.S.classId);
      U.selectedNode = null;
      U.toast('已重置，點數全部退回');
      U.show('tree');
      return;
    }
    if (t.dataset.slot != null) {
      U.activeSlot = parseInt(t.dataset.slot, 10);
      U.show('tree');
      return;
    }
    if (t.dataset.assign != null) {
      if (U.activeSlot == null) { U.toast('先點上面的欄位'); return; }
      G.setBarSlot(U.activeSlot, t.dataset.assign || null);
      U.show('tree');
      return;
    }

    /* 商店 */
    if (t.dataset.item) {
      const it = G.getItem(t.dataset.item);
      if (!G.S.owned.includes(it.id)) {
        if (G.S.gold < it.price) { U.toast('金幣不足'); return; }
        G.S.gold -= it.price;
        G.S.owned.push(it.id);
        U.toast('已購買　' + it.name);
      } else {
        U.toast('已裝備　' + it.name);
      }
      G.S.gear[it.slot] = it.id;
      G.save();
      U.show('shop');
      return;
    }
    if (t.dataset.cons) {
      const c = G.CONSUMABLES.find(x => x.id === t.dataset.cons);
      if (G.S.gold < c.price) { U.toast('金幣不足'); return; }
      G.S.gold -= c.price;
      G.S.consumables[c.id] = (G.S.consumables[c.id] | 0) + 1;
      G.save();
      U.show('shop');
      return;
    }

    /* 戰鬥中 */
    if (t.dataset.cast != null) { B.cast(parseInt(t.dataset.cast, 10)); return; }
    if (t.dataset.consUse) { B.useConsumable(t.dataset.consUse); return; }
    if (t.dataset.hire) { tryHire(t.dataset.hire); return; }
    if (t.dataset.act === 'pause') {
      B.paused = !B.paused;
      t.textContent = B.paused ? '繼續' : '暫停';
      return;
    }
    if (t.dataset.act === 'begin-battle') { B.begin(); hudRefs.hireSig = ''; return; }
    if (t.dataset.act === 'retreat') {
      stopBattle();
      if (G.runActive() && currentOpts && currentOpts.node) {
        G.S.run.hpPct = Math.max(0.12, B.hero.hp / B.hero.maxHp);
        G.save();
      }
      U.show('chapters');
      return;
    }

    /* 結算 */
    if (t.dataset.res) {
      const which = t.dataset.res;
      closeResult();
      if (which === 'retry') startBattle(currentStageKey, currentOpts);
      else if (which === 'tree') U.show('tree');
      else if (which === 'runwin') {
        U.showRunEnd(true, '大王倒了。這一章的答案，現在歸你。',
          '完成獎勵已經入帳。地圖會在下次出發時重新生成。');
      }
      else U.show('chapters');
      return;
    }

    /* ── 遠征 ── */
    if (t.dataset.startRun) {
      G.S.run = G.buildRun(t.dataset.startRun, (Date.now() ^ (Math.random() * 1e9)) >>> 0);
      G.save();
      U.show('chapters');
      return;
    }
    if (t.dataset.resumeRun) { U.show('chapters'); return; }
    if (t.dataset.act === 'retreat-run') {
      U.showRunEnd(false, '你從這一章撤了出來。撿到的東西都還在，路要重走。');
      return;
    }
    if (t.dataset.act === 'back-to-run') { U.fromExpedition = false; U.show('chapters'); return; }
    if (t.dataset.act === 'use-herb') {
      const r = G.runUseHerb();
      if (!r.ok) { U.toast(r.why); return; }
      U.toast('回復到 ' + r.hp + '%');
      U.renderExpedition();
      return;
    }
    if (t.dataset.nodeGo) { U.goNode(t.dataset.nodeGo); return; }
    if (t.dataset.evOpt != null) { U.chooseEventOption(parseInt(t.dataset.evOpt, 10)); return; }
    if (t.dataset.campOpt) { U.chooseCamp(t.dataset.campOpt); return; }
    if (t.dataset.starItem) {
      const it = G.starItem(t.dataset.starItem);
      if (it) {
        if (!G.S.owned.includes(it.id)) {
          if ((G.S.stars | 0) < it.stars) return;
          G.S.stars -= it.stars;
          G.S.owned.push(it.id);
        }
        G.S.gear[it.slot] = it.id;
        G.save(); U.renderTop(); U.renderShop();
      }
      return;
    }
    if (t.dataset.act === 'maze-swing') { if (G.S.maze) G.mazeSwing(G.S.maze); return; }
    if (t.dataset.act === 'maze-resume') { U.resumeMaze(); return; }
    if (t.dataset.act === 'maze-leave') {
      stopMaze();
      U.showRunEnd(false, '你從迷宮退了出來。撿到的東西沒帶走。');
      G.S.maze = null; G.save();
      return;
    }
    if (t.dataset.evClose) { U.closeEvent(); return; }
    if (t.dataset.guardGo) {
      const n = G.runNode(t.dataset.guardGo);
      U.closeEvent();
      if (n) U.startGuardianFight(n);
      return;
    }
    if (t.dataset.guardCancel) { U.closeEvent(); U.renderExpedition(); return; }
    if (t.dataset.runEnd) { U.finishRunEnd(); return; }
  });

  /* 觸控：按住移動 */
  ['pointerdown', 'pointerup', 'pointerleave', 'pointercancel'].forEach(ev => {
    document.addEventListener(ev, e => {
      const t = e.target.closest && e.target.closest('[data-hold]');
      if (!t) return;
      const on = ev === 'pointerdown';
      input[t.dataset.hold] = on;
      if (on) e.preventDefault();
    }, { passive: false });
  });

  /* 鍵盤 */
  window.addEventListener('keydown', e => {
    if (U.screen !== 'battle') return;
    const k = e.key.toLowerCase();
    if (B.phase === 'deploy') {
      if (k === 'z' || k === 'x' || k === 'c') { hireByKey(k.toUpperCase()); e.preventDefault(); }
      else if (k === 'enter' || k === ' ') { B.begin(); hudRefs.hireSig = ''; e.preventDefault(); }
      return;
    }
    if (k === 'a' || e.key === 'ArrowLeft') { input.left = true; e.preventDefault(); }
    else if (k === 'd' || e.key === 'ArrowRight') { input.right = true; e.preventDefault(); }
    else if (k === 'w' || e.key === 'ArrowUp') { input.up = true; e.preventDefault(); }
    else if (k === 's' || e.key === 'ArrowDown') { input.down = true; e.preventDefault(); }
    else if (e.key === ' ' && U.screen === 'maze') { if (G.S.maze) G.mazeSwing(G.S.maze); e.preventDefault(); }
    else if (k >= '1' && k <= '4') { B.cast(parseInt(k, 10) - 1); e.preventDefault(); }
    else if (k === 'z' || k === 'x' || k === 'c') { hireByKey(k.toUpperCase()); e.preventDefault(); }
    else if (k === 'q') { B.useConsumable('c_potion'); e.preventDefault(); }
    else if (k === 'e') { B.useConsumable('c_charge'); e.preventDefault(); }
    else if (k === ' ') {
      B.paused = !B.paused;
      if (hudRefs && hudRefs.pauseBtn) hudRefs.pauseBtn.textContent = B.paused ? '繼續' : '暫停';
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k === 'a' || e.key === 'ArrowLeft') input.left = false;
    if (k === 'd' || e.key === 'ArrowRight') input.right = false;
    if (k === 'w' || e.key === 'ArrowUp') input.up = false;
    if (k === 's' || e.key === 'ArrowDown') input.down = false;
  });
  window.addEventListener('blur', () => { input.left = input.right = input.up = input.down = false; });

  /* ══════ 啟動 ══════ */
  G.S = G.load();
  U.mount();
  U.show(G.S.seenIntro ? 'chapters' : 'intro');
})();
