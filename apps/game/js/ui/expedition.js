/* 遠征大地圖畫面：節點圖、事件視窗、營地 */
window.G = window.G || {};

(function () {
  const U = G.U;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ══════════ 大地圖 ══════════ */
  U.renderExpedition = function () {
    const run = G.S.run;
    if (!run) { U.show('chapters'); return; }
    const ch = G.getChapter(run.chapterId);
    const p = ch.palette;
    const VB = G.RUN_VB;
    const cur = G.runCurrent();

    /* 連線。陷阱路畫成紅色，而且事先標出要掉多少血。 */
    let edgeLabels = '';
    const edges = run.edges.map(e => {
      const a = e[0], b = e[1], trap = e[2] || 0;
      const A = G.runNode(a), B = G.runNode(b);
      const open = A.done && (B.revealed || B.done);
      const onPath = A.done && B.done;
      const mx = (A.x + B.x) / 2;
      const col = onPath ? p.accent : trap ? '#9A4436' : open ? '#6B5A42' : '#2E2A22';
      if (trap && !onPath) {
        const k = 0.42;
        const lx = A.x + (B.x - A.x) * k;
        const ly = A.y + (B.y - A.y) * k - 13;
        edgeLabels += '<text x="' + lx.toFixed(0) + '" y="' + ly.toFixed(0) + '" ' +
          'text-anchor="middle" font-size="15" fill="#E89684" ' +
          'style="paint-order:stroke;stroke:#12100D;stroke-width:4">陷阱 −' +
          Math.round(trap * 100) + '%</text>';
      }
      return '<path d="M' + A.x + ' ' + A.y + ' C' + mx + ' ' + A.y + ' ' + mx + ' ' + B.y + ' ' + B.x + ' ' + B.y + '" ' +
        'fill="none" stroke="' + col + '" ' +
        'stroke-width="' + (onPath ? 4 : trap ? 3.5 : 3) + '" stroke-linecap="round" ' +
        (onPath ? '' : trap ? 'stroke-dasharray="2 6"' : 'stroke-dasharray="5 7"') + '/>';
    }).join('');

    /* 地形斑塊，讓底圖不要只是一塊色 */
    let blobs = '';
    const seed = run.seed;
    for (let i = 0; i < 14; i++) {
      const a = (seed * (i + 3)) % 997 / 997;
      const b = (seed * (i + 7)) % 733 / 733;
      blobs += '<ellipse cx="' + (a * VB.w).toFixed(0) + '" cy="' + (b * VB.h).toFixed(0) + '" ' +
        'rx="' + (60 + a * 110).toFixed(0) + '" ry="' + (34 + b * 70).toFixed(0) + '" ' +
        'fill="' + (p.field2 || p.mid) + '" opacity="0.35"/>';
    }

    /* 節點 */
    const nodesHtml = run.nodes.map(n => {
      const vt = G.runVisibleType(n);
      const kind = G.NODE_KINDS[vt];
      const isCur = n.id === run.at;
      const can = G.runCanEnter(n);
      const cls = ['exp-node'];
      if (n.done) cls.push('done');
      if (isCur) cls.push('current');
      if (can) cls.push('can');
      if (!can && !n.done && !isCur) cls.push('locked');
      const left = (n.x / VB.w * 100).toFixed(2) + '%';
      const top = (n.y / VB.h * 100).toFixed(2) + '%';
      return '<button class="' + cls.join(' ') + '" data-node-go="' + n.id + '" ' +
        'style="--c:' + kind.color + ';left:' + left + ';top:' + top + '" ' +
        (can || isCur ? '' : 'disabled ') +
        'title="' + esc(kind.name) + '">' +
        (vt === 'unknown' ? '<span class="exp-q">?</span>' : G.icon(kind.icon)) +
        '</button>' +
        '<span class="exp-node-label" style="left:' + left + ';top:' + top + '">' + kind.name +
        (can && G.runTrapCost(n.id) ? '<i class="exp-trap">−' + Math.round(G.runTrapCost(n.id) * 100) + '%</i>' : '') +
        '</span>';
    }).join('');

    /* 側欄 */
    const hpPct = Math.round(run.hpPct * 100);
    const blessHtml = run.blessings.length
      ? run.blessings.map(b => '<li><b>' + b.name + '</b>　<span>' + b.desc + '</span></li>').join('')
      : '<li class="empty">還沒有拿到加持。路上的事件會給。</li>';
    const logHtml = run.log.slice(-9).reverse()
      .map(l => '<li class="log-' + l.kind + '">' + l.text + '</li>').join('');

    const doneCount = run.nodes.filter(n => n.done).length;

    U.view.innerHTML =
      '<section class="panel"><div class="panel-head">' +
        '<h2>' + ch.name + '　·　征途</h2>' +
        '<span class="hint">' + doneCount + ' / ' + run.nodes.length + ' 個地點　·　生命 ' + hpPct + '%</span>' +
      '</div><div class="panel-body">' +
        '<div class="exp-layout">' +
          '<div class="exp-map" style="--field:' + (p.field || p.ground) + ';--road:' + (p.road || p.fog) + '">' +
            '<svg viewBox="0 0 ' + VB.w + ' ' + VB.h + '" preserveAspectRatio="none">' +
              '<rect width="' + VB.w + '" height="' + VB.h + '" fill="' + (p.field || p.ground) + '"/>' +
              blobs + edges + edgeLabels +
            '</svg>' +
            nodesHtml +
            '<div class="exp-compass">左下出發　→　右上是大王</div>' +
          '</div>' +
          '<aside class="exp-side">' +
            '<div class="exp-card">' +
              '<div class="eyebrow">狀態</div>' +
              '<div class="exp-hp"><i style="width:' + hpPct + '%"></i></div>' +
              '<div class="exp-hp-row"><span>生命帶到下一場</span><b>' + hpPct + '%</b></div>' +
              '<p class="exp-note">' + (run.hpPct < 0.35
                ? '血很低了。主角沒有恢復法術，只能靠藥草、油罐或營地。'
                : '打完一場的殘血會帶到下一個地點，倒下一次再多扣 10%。') + '</p>' +
              '<button class="btn btn-ghost btn-full exp-herb" data-act="use-herb"' +
                ((G.S.consumables.c_herb | 0) > 0 && run.hpPct < 0.999 ? '' : ' disabled') + '>' +
                G.icon('herb') + '使用藥草　回復 ' + Math.round(G.HERB_HEAL * 100) + '%' +
                '<b>×' + (G.S.consumables.c_herb | 0) + '</b></button>' +
              '<p class="exp-note">藥草只在洞穴裡採得到，而且只能在地圖上用。</p>' +
            '</div>' +
            '<div class="exp-card">' +
              '<div class="eyebrow">加持</div>' +
              '<ul class="exp-bless">' + blessHtml + '</ul>' +
            '</div>' +
            '<div class="exp-card">' +
              '<div class="eyebrow">沿路發生的事</div>' +
              '<ul class="exp-log">' + logHtml + '</ul>' +
            '</div>' +
            '<button class="btn btn-ghost btn-full" data-act="retreat-run">撤出這趟遠征</button>' +
          '</aside>' +
        '</div>' +
      '</div></section>';

    void cur;
  };

  /* ══════════ 走到一個節點 ══════════ */
  U.goNode = function (nodeId) {
    const node = G.runNode(nodeId);
    if (!node) return;
    if (node.id === G.S.run.at && !node.done) { U.resolveNode(node); return; }
    const r = G.runEnter(node);
    if (!r.ok) { U.toast(r.why); return; }
    if (r.trap) U.toast('陷阱：生命 −' + Math.round(r.trap * 100) + '%');
    U.renderExpedition();
    if (G.S.run.hpPct <= 0.03) { U.showRunEnd(false, '你倒在半路上。這趟遠征到此為止。'); return; }
    U.resolveNode(node);
  };

  U.resolveNode = function (node) {
    const t = node.type;
    if (t === 'battle' || t === 'elite' || t === 'boss' || t === 'cave') {
      const spec = G.runBattleSpec(node);
      U.startRunBattle(spec.stageKey, {
        scaleMul: spec.scaleMul,
        cave: !!spec.cave,
        startHpPct: G.S.run.hpPct,
        label: G.NODE_KINDS[t].name,
        node: node
      });
    } else if (t === 'shop') {
      G.runFinishNode(node, '在商隊補了一些東西。', 'info');
      U.fromExpedition = true;
      U.show('shop');
    } else if (t === 'camp') {
      U.showCamp(node);
    } else {
      U.showEvent(node);
    }
  };

  /* ══════════ 事件視窗 ══════════ */
  U.showEvent = function (node) {
    const ev = G.EVENTS.find(e => e.id === node.eventId);
    if (!ev) { G.runFinishNode(node, '這裡什麼都沒有。', 'info'); U.renderExpedition(); return; }
    const kind = G.NODE_KINDS[ev.kind];

    const opts = ev.options.map((o, i) =>
      '<button class="ev-opt" data-ev-opt="' + i + '">' +
        '<b>' + o.label + '</b>' +
        (o.hint ? '<span>' + o.hint + '</span>' : '') +
      '</button>').join('');

    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML =
      '<div class="event-card" style="--c:' + kind.color + '">' +
        '<div class="event-head">' +
          '<span class="event-kind">' + G.icon(kind.icon) + kind.name + '</span>' +
          '<h2>' + ev.title + '</h2>' +
        '</div>' +
        '<p class="event-text">' + ev.text + '</p>' +
        '<div class="event-opts">' + opts + '</div>' +
      '</div>';
    document.body.appendChild(el);
    U.eventEl = el;
    U.eventCtx = { ev, node };
  };

  U.chooseEventOption = function (idx) {
    const { ev, node } = U.eventCtx;
    const opt = ev.options[idx];
    const res = G.runRoll(opt);
    const changes = G.runApply(res);
    G.runFinishNode(node, ev.title + '：' + opt.label, res.hp && res.hp < -0.2 ? 'bad' : 'good');

    const card = U.eventEl.querySelector('.event-card');
    card.innerHTML =
      '<div class="event-head">' +
        '<span class="event-kind">結果</span>' +
        '<h2>' + ev.title + '</h2>' +
      '</div>' +
      '<p class="event-text">' + (res.text || '什麼都沒發生。') + '</p>' +
      (changes.length
        ? '<ul class="event-changes">' + changes.map(c =>
            '<li class="' + c.kind + '">' + c.text + '</li>').join('') + '</ul>'
        : '') +
      '<div class="event-opts"><button class="btn btn-full" data-ev-close="1">繼續</button></div>';
    U.renderTop();
  };

  U.closeEvent = function () {
    if (U.eventEl) { U.eventEl.remove(); U.eventEl = null; }
    U.eventCtx = null;
    const run = G.S.run;
    if (run && run.hpPct <= 0.03) {
      U.showRunEnd(false, '你在路上倒下了。這趟遠征到此為止。');
      return;
    }
    U.renderExpedition();
  };

  /* ══════════ 營地 ══════════ */
  U.showCamp = function (node) {
    const opts = G.CAMP_OPTIONS.map(o =>
      '<button class="ev-opt" data-camp-opt="' + o.id + '">' +
        G.icon(o.icon) + '<b>' + o.label + '</b><span>' + o.desc + '</span>' +
      '</button>').join('');
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML =
      '<div class="event-card" style="--c:#7FBF6A">' +
        '<div class="event-head"><span class="event-kind">' + G.icon('heal') + '營地</span>' +
        '<h2>一個可以停下來的地方</h2></div>' +
        '<p class="event-text">火還沒滅，有人剛走不久。你只能做一件事，然後繼續上路。</p>' +
        '<div class="event-opts camp">' + opts + '</div>' +
      '</div>';
    document.body.appendChild(el);
    U.eventEl = el;
    U.eventCtx = { node, camp: true };
  };

  U.chooseCamp = function (id) {
    const { node } = U.eventCtx;
    const changes = G.runCamp(node, id);
    const card = U.eventEl.querySelector('.event-card');
    card.innerHTML =
      '<div class="event-head"><span class="event-kind">結果</span><h2>營地</h2></div>' +
      '<ul class="event-changes">' + changes.map(c => '<li class="' + c.kind + '">' + c.text + '</li>').join('') + '</ul>' +
      '<div class="event-opts"><button class="btn btn-full" data-ev-close="1">繼續</button></div>';
    U.renderTop();
  };

  /* ══════════ 遠征結束 ══════════ */
  U.showRunEnd = function (won, line, extra) {
    const ch = G.getChapter(G.S.run.chapterId);
    if (won) G.runComplete(); else G.runRetreat();
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML =
      '<div class="result' + (won ? '' : ' lose') + '">' +
        '<div class="result-head">' +
          '<div class="result-verdict">' + (won ? 'Expedition Complete' : 'Expedition Ended') + '</div>' +
          '<h2>' + ch.name + '</h2>' +
          '<p class="result-line">' + line + '</p>' +
        '</div>' +
        (extra ? '<div class="levelup">' + extra + '</div>' : '') +
        '<div class="result-actions">' +
          '<button class="btn btn-primary" data-run-end="back">回遠征路線</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    U.eventEl = el;
  };

  U.finishRunEnd = function () {
    if (U.eventEl) { U.eventEl.remove(); U.eventEl = null; }
    G.runClear();
    U.show('chapters');
  };
})();
