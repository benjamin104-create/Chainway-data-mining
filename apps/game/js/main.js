/* 啟動、事件路由、戰鬥迴圈 */
(function () {
  const U = G.U, B = G.B, R = G.R;

  const input = { left: false, right: false };
  G.input = input;   // 方便除錯／自動測試
  let raf = null, last = 0, hudRefs = null, currentStageKey = null;

  /* ══════ 戰鬥畫面 ══════ */
  function battleView(stage) {
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
          '<span class="battle-title">' + stage.name + '</span>' +
          '<span class="sep">|</span>' +
          '<span class="towers-left" id="towersLeft"></span>' +
          '<span class="sep">|</span>' +
          '<span style="font-size:12px;color:var(--parch-mute)" id="waveInfo"></span>' +
          '<span class="spacer"></span>' +
          '<button class="btn btn-ghost" data-act="pause" id="pauseBtn">暫停</button>' +
          '<button class="btn btn-ghost" data-act="retreat">撤退</button>' +
        '</div>' +
        '<canvas id="screen"></canvas>' +
        '<div class="hud">' +
          '<div class="vital">' +
            '<div class="vital-row"><span>' + cls.name + '</span><span id="hpText"></span></div>' +
            '<div class="hpbar"><i id="hpFill"></i></div>' +
            '<div class="vital-row"><span id="goldRun">+0</span><span id="killRun">0 擊殺</span></div>' +
          '</div>' +
          '<div class="skillbar">' + slots + '</div>' +
          '<div class="consumables">' +
            '<button class="cons" data-cons-use="c_potion"><span class="key">Q</span>' + G.icon('heal') + '<span class="n" id="nPotion"></span></button>' +
            '<button class="cons" data-cons-use="c_charge"><span class="key">E</span>' + G.icon('quake') + '<span class="n" id="nCharge"></span></button>' +
            '<button class="cons" data-hold="left" aria-label="向左移動">◀</button>' +
            '<button class="cons" data-hold="right" aria-label="向右移動">▶</button>' +
          '</div>' +
        '</div>' +
        '<p class="controls-hint"><kbd>A</kbd><kbd>D</kbd>／<kbd>←</kbd><kbd>→</kbd> 移動　' +
        '<kbd>1</kbd>–<kbd>4</kbd> 技能　<kbd>Q</kbd>／<kbd>E</kbd> 消耗品　<kbd>空白鍵</kbd> 暫停。' +
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
      sks: Array.from(document.querySelectorAll('.sk'))
    };
  }

  function startBattle(stageKey) {
    currentStageKey = stageKey;
    const stage = G.getStage(stageKey);
    U.screen = 'battle';
    U.renderNav();
    battleView(stage);
    B.init(stageKey);
    R.setup(document.getElementById('screen'));
    R.buildBackdrop(G.getChapter(stage.chapterId));
    input.left = input.right = false;
    last = performance.now();
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

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
    if (!hudRefs) return;
    const h = B.hero;
    const pct = Math.max(0, h.hp) / h.maxHp * 100;
    hudRefs.hpFill.style.width = pct.toFixed(1) + '%';
    hudRefs.hpText.textContent = Math.max(0, Math.round(h.hp)) + ' / ' + h.maxHp + (h.shield > 0 ? '  +' + Math.round(h.shield) : '');
    hudRefs.goldRun.textContent = '+' + B.goldEarned + ' 金幣';
    hudRefs.killRun.textContent = B.kills + ' 擊殺';
    const alive = B.towers.filter(t => !t.dead).length;
    hudRefs.towersLeft.textContent = '敵塔 ' + alive + ' / ' + B.towers.length;
    hudRefs.waveInfo.textContent = '第 ' + B.waveNo + ' 波　·　下一波 ' + Math.ceil(Math.max(0, B.waveTimer)) + ' 秒';
    hudRefs.nPotion.textContent = B.consumables.c_potion;
    hudRefs.nCharge.textContent = B.consumables.c_charge;

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

  function endBattle() {
    stopBattle();
    const stage = B.stage;
    const win = B.over === 'win';
    const firstClear = win && !G.S.cleared[stage.key];

    let gold = win ? B.goldEarned + stage.reward.gold : Math.round(B.goldEarned * 0.5);
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
    if (win) {
      if (firstClear) {
        sp = stage.reward.sp;
        G.S.sp += sp;
        G.S.cleared[stage.key] = true;
      }
      const t = B.time;
      if (!G.S.best[stage.key] || t < G.S.best[stage.key]) G.S.best[stage.key] = t;
    }
    G.save();
    U.renderTop();

    U.showResult({ result: B.over, stage, gold, sp, xp, levels, kills: B.kills, time: B.time });
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
    if (t.dataset.act === 'pause') {
      B.paused = !B.paused;
      t.textContent = B.paused ? '繼續' : '暫停';
      return;
    }
    if (t.dataset.act === 'retreat') { stopBattle(); U.show('chapters'); return; }

    /* 結算 */
    if (t.dataset.res) {
      const which = t.dataset.res;
      closeResult();
      if (which === 'retry') startBattle(currentStageKey);
      else if (which === 'tree') U.show('tree');
      else U.show('chapters');
      return;
    }
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
    if (k === 'a' || e.key === 'ArrowLeft') { input.left = true; e.preventDefault(); }
    else if (k === 'd' || e.key === 'ArrowRight') { input.right = true; e.preventDefault(); }
    else if (k >= '1' && k <= '4') { B.cast(parseInt(k, 10) - 1); e.preventDefault(); }
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
