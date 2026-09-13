/* 啟動、事件路由、戰鬥迴圈 */
(function () {
  const U = G.U, B = G.B, R = G.R;

  const input = { left: false, right: false };
  G.input = input;   // 方便除錯／自動測試
  let raf = null, last = 0, hudRefs = null, currentStageKey = null, currentOpts = null;

  /* ══════ 戰鬥畫面 ══════ */
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
        '<div class="hud">' +
          '<div class="vital">' +
            '<div class="vital-row"><span>' + cls.name + '</span><span id="hpText"></span></div>' +
            '<div class="hpbar"><i id="hpFill"></i></div>' +
            '<div class="vital-row"><span id="goldRun">現場資金 0</span><span id="killRun">0 擊殺</span></div>' +
          '</div>' +
          '<div class="skillbar">' + slots + '</div>' +
          '<div class="consumables">' +
            '<button class="cons" data-cons-use="c_potion"><span class="key">Q</span>' + G.icon('heal') + '<span class="n" id="nPotion"></span></button>' +
            '<button class="cons" data-cons-use="c_charge"><span class="key">E</span>' + G.icon('quake') + '<span class="n" id="nCharge"></span></button>' +
            '<button class="cons" data-hold="left" aria-label="向左移動">◀</button>' +
            '<button class="cons" data-hold="right" aria-label="向右移動">▶</button>' +
          '</div>' +
        '</div>' +
        '<div class="hirebar" id="hirebar">' +
          '<div class="hire-head"><span class="hire-post" id="hirePostName">僱用所</span>' +
          '<span class="hire-purse" id="hirePurse"></span></div>' +
          '<div class="hire-opts" id="hireOpts"></div>' +
        '</div>' +
        '<p class="controls-hint"><kbd>A</kbd><kbd>D</kbd>／<kbd>←</kbd><kbd>→</kbd> 移動　' +
        '<kbd>1</kbd>–<kbd>4</kbd> 技能　<kbd>Q</kbd>／<kbd>E</kbd> 消耗品　' +
        '<kbd>Z</kbd><kbd>X</kbd><kbd>C</kbd> 僱用　<kbd>空白鍵</kbd> 暫停。' +
        '部署階段點地圖上的據點先擺好人，按<kbd>空白鍵</kbd>或「開戰」開始。' +
        '普通攻擊自動進行；先拆掉哨塔，主塔才會失去無敵。</p>' +
      '</div>';

    hudRefs = {
      hpFill: document.getElementById('hpFill'),
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
    /* 螢幕矮的時候戰場會超出視窗，主角開場又站在地圖最下排，
       不捲過去玩家會看到一片空戰場，以為沒有戰鬥。 */
    try {
      if (cv.getBoundingClientRect().bottom > window.innerHeight) {
        cv.scrollIntoView({ block: 'center', behavior: 'auto' });
      }
    } catch (e) { /* 舊瀏覽器沒有就算了 */ }
    input.left = input.right = false;
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
    updateHud();
    if (B.over && B.overTimer > 1.1) { endBattle(); return; }
    raf = requestAnimationFrame(loop);
  }

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
  });
  window.addEventListener('blur', () => { input.left = input.right = false; });

  /* ══════ 啟動 ══════ */
  G.S = G.load();
  U.mount();
  U.show(G.S.seenIntro ? 'chapters' : 'intro');
})();
