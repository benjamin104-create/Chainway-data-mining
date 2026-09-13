/* 介面：頂欄、章節、職業、技能樹、商店、結算 */
window.G = window.G || {};

const U = {};
G.U = U;

const MOD_LABEL = {
  hp: '生命', hpFlat: '生命', dmg: '傷害', dmgFlat: '傷害', atkSpd: '攻速', range: '射程',
  moveSpd: '移速', crit: '暴擊', critDmg: '暴傷', armor: '護甲', armorFlat: '護甲',
  cdr: '冷卻縮減', power: '技能傷害', lifesteal: '吸血', minionDmg: '小兵傷害',
  minionHp: '小兵生命', goldFind: '金幣', siege: '攻城傷害'
};
const FLAT_KEYS = ['hpFlat', 'dmgFlat', 'armorFlat'];

function fmtMod(k, v) {
  const name = MOD_LABEL[k] || k;
  const flat = FLAT_KEYS.includes(k);
  const val = flat ? (v > 0 ? '+' + v : String(v)) : ((v > 0 ? '+' : '') + Math.round(v * 100) + '%');
  return '<span class="' + (v < 0 ? 'neg' : '') + '">' + name + ' ' + val + '</span>';
}
function modList(mods) {
  const keys = Object.keys(mods || {});
  if (!keys.length) return '<span style="color:var(--parch-mute)">無加成</span>';
  return keys.map(k => fmtMod(k, mods[k])).join('');
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

U.screen = 'chapters';
U.selectedNode = null;

U.mount = function () {
  U.topbar = document.getElementById('topbar');
  U.nav = document.getElementById('nav');
  U.view = document.getElementById('view');
};

U.toast = function (msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1900);
};

/* ══════ 頂欄 ══════ */
U.renderTop = function () {
  const s = G.S;
  const need = G.xpNeeded(s.level);
  U.topbar.innerHTML =
    '<div class="brand"><span class="brand-mark">Siege of Mysteries</span>' +
    '<span class="brand-cn">通天鬥塔</span></div>' +
    '<div class="res res-lv"><span class="res-label">Lv</span><span class="res-val">' + s.level + '</span>' +
    '<span class="xpwrap"><i style="width:' + Math.round(s.xp / need * 100) + '%"></i></span></div>' +
    '<div class="res res-sp"><span class="res-label">SP</span><span class="res-val">' + G.spAvailable() + '/' + s.sp + '</span></div>' +
    '<div class="res res-gold"><span class="res-label">Gold</span><span class="res-val">' + G.fmtGold(s.gold) + '</span></div>';
};

U.renderNav = function () {
  const tabs = [['chapters', '遠征'], ['class', '職業'], ['tree', '技能樹'], ['shop', '補給所']];
  U.nav.innerHTML = tabs.map(([k, label]) =>
    '<button data-tab="' + k + '" aria-selected="' + (U.screen === k) + '">' + label + '</button>').join('');
  U.nav.hidden = U.screen === 'battle' || U.screen === 'intro';
};

U.show = function (name) {
  U.screen = name;
  U.renderTop();
  U.renderNav();
  if (name === 'intro') U.renderIntro();
  else if (name === 'chapters') U.renderChapters();
  else if (name === 'class') U.renderClasses();
  else if (name === 'tree') U.renderTree();
  else if (name === 'shop') U.renderShop();
  window.scrollTo({ top: 0, behavior: 'instant' });
};

/* ══════ 開場 ══════ */
U.renderIntro = function () {
  U.view.innerHTML =
    '<div class="intro">' +
      '<div class="intro-title">Siege of Mysteries</div>' +
      '<div class="intro-cn">通天鬥塔</div>' +
      '<div class="intro-body">' +
        '<p>世界上有幾個地方，人類蓋了東西，然後忘了為什麼要蓋。</p>' +
        '<p>巴別塔、金字塔、納斯卡線、亞特蘭提斯、摩艾、百慕達、巨石陣——' +
        '每一處都留著一座還在運轉的塔，塔裡的守衛守著一個沒有人記得的答案。</p>' +
        '<p>你是一顆被派去拆塔的橘色小東西。你有一把劍、一面盾，' +
        '和一條會跟著你往前推的線。城門在你身後，主塔在最前面，中間全是別人。</p>' +
        '<p>戰場上有幾個僱用所。殺出來的錢可以當場僱傭兵、魔法師、白魔道士，' +
        '買攻城車與彈弩台，或是架起拒馬、火油槽與戰旗——' +
        '但花掉的錢不會跟你回家。</p>' +
        '<p style="color:var(--parch);">拆完七座塔，你會知道那個答案。也可能只會知道，' +
        '這些塔本來就不是蓋給人懂的。</p>' +
      '</div>' +
      '<div class="intro-actions">' +
        '<button class="btn btn-primary" data-act="begin">開始第一次遠征</button>' +
      '</div>' +
      '<p class="controls-hint" style="margin-top:20px">' +
        '操作：<kbd>A</kbd><kbd>D</kbd> 或 <kbd>←</kbd><kbd>→</kbd> 移動　' +
        '<kbd>1</kbd>–<kbd>4</kbd> 技能　<kbd>Q</kbd> 油罐　<kbd>E</kbd> 火藥包　' +
        '<kbd>Z</kbd><kbd>X</kbd><kbd>C</kbd> 僱用　<kbd>空白鍵</kbd> 暫停。普通攻擊會自動進行。' +
      '</p>' +
    '</div>';
};

/* ══════ 章節 ══════ */
U.renderChapters = function () {
  const cards = G.CHAPTERS.map((ch, ci) => {
    const unlocked = G.chapterUnlocked(ci);
    const stages = G.STAGES.filter(s => s.chapterId === ch.id);
    return '<article class="chapter' + (unlocked ? '' : ' locked') + '">' +
      '<div class="chapter-top">' +
        '<div class="chapter-no">' + ch.no + '</div>' +
        '<div><div class="chapter-name">' + ch.name + '</div>' +
        '<div class="chapter-sub">' + ch.sub + '</div></div>' +
      '</div>' +
      '<p class="chapter-lore">' + ch.lore + '</p>' +
      '<p class="chapter-hook">' + ch.hook + '</p>' +
      '<div class="stages">' + stages.map(st => {
        const ok = unlocked && G.stageUnlocked(st);
        const done = !!G.S.cleared[st.key];
        return '<button class="stage' + (st.isBoss ? ' boss' : '') + '" data-stage="' + st.key + '"' +
          (ok ? '' : ' disabled') + '>' +
          ['前庭', '內廊', '核心'][st.idx] +
          (st.isBoss ? '　' + ch.boss.name : '') +
          '<span class="tick">' + (done ? '已通過' : ok ? '可進入' : '未開啟') + '</span></button>';
      }).join('') + '</div>' +
    '</article>';
  }).join('');

  U.view.innerHTML =
    '<section class="panel"><div class="panel-head"><h2>遠征路線</h2>' +
    '<span class="hint">七座塔，二十一個關卡。每章的核心關有頭目。</span></div>' +
    '<div class="panel-body"><div class="chapters">' + cards + '</div></div></section>';
};

/* ══════ 職業 ══════ */
U.renderClasses = function () {
  const cards = G.CLASSES.map(c => {
    const unlocked = G.classUnlocked(c);
    const cur = G.S.classId === c.id;
    const cs = G.S.classes[c.id];
    return '<button class="cls' + (unlocked ? '' : ' locked') + '" style="--c:' + c.color + '"' +
      ' aria-pressed="' + cur + '" data-class="' + c.id + '"' + (unlocked ? '' : ' disabled') + '>' +
      (cur ? '<span class="cls-badge">使用中</span>' : '') +
      '<div><div class="cls-en">' + c.en + '</div><div class="cls-name">' + c.name + '</div></div>' +
      '<div class="cls-tag">「' + c.tagline + '」</div>' +
      '<p class="cls-desc">' + c.desc + '</p>' +
      '<div class="cls-stats">' +
        '<div class="cls-stat"><b>' + c.base.hp + '</b><span>生命</span></div>' +
        '<div class="cls-stat"><b>' + c.base.dmg + '</b><span>傷害</span></div>' +
        '<div class="cls-stat"><b>' + Math.round(c.base.range) + '</b><span>射程</span></div>' +
      '</div>' +
      '<div class="cls-stat" style="border:none;padding:0;margin-top:4px">' +
        '<span style="font-size:11px;color:var(--parch-mute)">已學 ' + cs.nodes.length + ' / ' + c.nodes.length +
        ' 個節點　·　已投入 ' + cs.spent + ' 點</span></div>' +
      (unlocked ? '' : '<div class="cls-lock">尚未解鎖　·　' + c.unlock.text + '</div>') +
    '</button>';
  }).join('');

  U.view.innerHTML =
    '<section class="panel"><div class="panel-head"><h2>職業</h2>' +
    '<span class="hint">技能點是共用的，每個職業各自分配——換職業不會失去任何進度。</span></div>' +
    '<div class="panel-body"><div class="classes">' + cards + '</div></div></section>';
};

/* ══════ 技能樹 ══════ */
U.renderTree = function () {
  const cls = G.getClass(G.S.classId);
  const cs = G.S.classes[cls.id];
  const VB_W = 820, VB_H = 560;

  /* 連線 */
  const edges = [];
  cls.nodes.forEach(n => {
    n.req.forEach(rid => {
      const from = cls.nodes.find(x => x.id === rid);
      if (!from) return;
      const owned = cs.nodes.includes(rid) && cs.nodes.includes(n.id);
      const half = cs.nodes.includes(rid);
      const mx = (from.pos.x + n.pos.x) / 2;
      edges.push('<path d="M' + from.pos.x + ' ' + from.pos.y +
        ' C' + mx + ' ' + from.pos.y + ' ' + mx + ' ' + n.pos.y + ' ' + n.pos.x + ' ' + n.pos.y + '" ' +
        'fill="none" stroke="' + (owned ? cls.color : half ? '#4A3E2C' : '#2A2419') + '" ' +
        'stroke-width="' + (owned ? 3 : 2) + '" ' + (owned ? '' : 'stroke-dasharray="4 5"') + '/>');
    });
  });

  const nodesHtml = cls.nodes.map(n => {
    const owned = cs.nodes.includes(n.id);
    const chk = G.canUnlock(cls.id, n.id);
    const avail = !owned && chk.ok;
    const reqMet = !n.req.length || n.req.some(r => cs.nodes.includes(r));
    const classes = ['node'];
    if (owned) classes.push('owned');
    else if (avail) classes.push('avail');
    if (n.skill) classes.push('active-skill');
    if (U.selectedNode === n.id) classes.push('sel');
    const left = (n.pos.x / VB_W * 100).toFixed(2) + '%';
    const top = (n.pos.y / VB_H * 100).toFixed(2) + '%';
    return '<button class="' + classes.join(' ') + '" data-node="' + n.id + '" ' +
      'style="--c:' + cls.color + ';left:' + left + ';top:' + top + '" ' +
      'title="' + esc(n.name) + '" aria-label="' + esc(n.name) + (reqMet ? '' : '（前置未學習）') + '">' +
      G.icon(n.icon) + '</button>' +
      '<span class="node-label" style="left:' + left + ';top:' + top + '">' + n.name + '</span>';
  }).join('');

  const sel = U.selectedNode ? cls.nodes.find(n => n.id === U.selectedNode) : null;
  const detail = sel ? U.nodeDetail(cls, cs, sel) :
    '<div class="detail"><span class="detail-kind">說明</span>' +
    '<h3>' + cls.name + '　的路徑圖</h3>' +
    '<p class="detail-desc">點任何一個節點看它做什麼。外圈是圓形的代表主動技能，' +
    '學會之後可以放進下方的技能欄；方形的是被動，學會就一直生效。' +
    '亮起金邊的是現在點得起的節點。</p>' +
    '<div class="detail-meta"><span>可用 SP ' + G.spAvailable() + '</span>' +
    '<span>已投入 ' + cs.spent + '</span></div></div>';

  U.view.innerHTML =
    '<section class="panel"><div class="panel-head"><h2>' + cls.name + '　技能樹</h2>' +
    '<span class="hint">可用技能點 ' + G.spAvailable() + '　·　已投入 ' + cs.spent + '</span></div>' +
    '<div class="panel-body"><div class="tree-layout">' +
      '<div class="tree-canvas" id="treeCanvas">' +
        '<svg viewBox="0 0 ' + VB_W + ' ' + VB_H + '" preserveAspectRatio="none">' + edges.join('') + '</svg>' +
        nodesHtml +
      '</div>' +
      '<div class="tree-side">' + detail + U.barConfig(cls, cs) +
        '<button class="btn btn-ghost btn-full" data-act="respec">重置這個職業的技能樹（退回全部點數）</button>' +
      '</div>' +
    '</div></div></section>';
};

U.nodeDetail = function (cls, cs, n) {
  const owned = cs.nodes.includes(n.id);
  const chk = G.canUnlock(cls.id, n.id);
  let btn;
  if (owned) btn = '<button class="btn btn-full" disabled>已學習</button>';
  else if (chk.ok) btn = '<button class="btn btn-full" data-act="unlock" data-node="' + n.id + '">學習　·　' + n.cost + ' SP</button>';
  else btn = '<button class="btn btn-full" disabled>' + chk.why + '</button>';

  const skillMeta = n.skill ?
    '<span>冷卻 ' + n.skill.cd + ' 秒</span><span>' + ({
      arc: '扇形近戰', proj: '投射物', ground: '地面範圍', dash: '位移', buff: '增益',
      summon: '召喚', heal: '治療', beam: '貫穿', wall: '設置', turret: '設置',
      channel: '引導', blinkstorm: '連續瞬移'
    }[n.skill.type] || n.skill.type) + '</span>' : '';

  return '<div class="detail" style="--c:' + cls.color + '">' +
    '<span class="detail-kind">' + (n.skill ? '主動技能' : '被動') + '　·　第 ' + (n.tier + 1) + ' 階</span>' +
    '<h3 style="color:' + cls.color + '">' + n.name + (n.skill ? '　<span style="font-size:13px;color:var(--parch-dim)">' + n.skill.name + '</span>' : '') + '</h3>' +
    '<p class="detail-desc">' + n.desc + '</p>' +
    '<div class="detail-meta"><span>費用 ' + n.cost + ' SP</span>' + skillMeta + '</div>' +
    '<div style="margin-top:12px">' + btn + '</div>' +
  '</div>';
};

U.barConfig = function (cls, cs) {
  const actives = G.unlockedActives(cls.id);
  const slots = cs.bar.map((id, i) => {
    const sk = id ? G.SKILLS[id] : null;
    return '<button class="bar-slot' + (sk ? ' filled' : '') + '" style="--c:' + cls.color + '" ' +
      'data-slot="' + i + '" title="' + (sk ? esc(sk.name) : '空欄位') + '">' +
      '<span class="key">' + (i + 1) + '</span>' +
      (sk ? G.icon(sk.icon) : '<span style="color:var(--parch-mute);font-size:18px">·</span>') +
      '</button>';
  }).join('');

  const pool = actives.length ?
    actives.map(a => '<button class="pool-item" data-assign="' + a.id + '">' + G.icon(a.icon) + a.name + '</button>').join('') +
    '<button class="pool-item" data-assign="">清空選取欄位</button>'
    : '<span style="color:var(--parch-mute);font-size:12px">還沒有學會任何主動技能。</span>';

  return '<div class="bar-config" style="--c:' + cls.color + '">' +
    '<div class="eyebrow">戰鬥技能欄</div>' +
    '<div class="bar-slots">' + slots + '</div>' +
    '<p style="font-size:11.5px;color:var(--parch-mute);margin-top:10px">' +
      '先點上面的欄位，再點下面的技能把它放進去。' + (U.activeSlot != null ? '　目前選取：第 ' + (U.activeSlot + 1) + ' 格' : '') +
    '</p>' +
    '<div class="pool">' + pool + '</div>' +
  '</div>';
};

/* ══════ 商店 ══════ */
U.renderShop = function () {
  const cols = ['weapon', 'armor', 'relic'].map(slot => {
    const items = G.ITEMS.filter(i => i.slot === slot).map(it => {
      const owned = G.S.owned.includes(it.id);
      const equipped = G.S.gear[slot] === it.id;
      const unlocked = !it.unlockAfter || !!G.S.cleared[it.unlockAfter];
      const afford = G.S.gold >= it.price;
      const cls = ['item'];
      if (equipped) cls.push('equipped');
      else if (owned) cls.push('owned-not-eq');
      const dis = !unlocked || (!owned && !afford);
      let state;
      if (equipped) state = '裝備中';
      else if (owned) state = '已擁有　·　點一下裝備';
      else if (!unlocked) state = '需先通關：' + (G.getStage(it.unlockAfter) ? G.getStage(it.unlockAfter).name : it.unlockAfter);
      else if (!afford) state = '金幣不足';
      else state = '點一下購買';
      return '<button class="' + cls.join(' ') + '" data-item="' + it.id + '"' + (dis ? ' disabled' : '') + '>' +
        '<span class="item-name">' + it.name + '</span>' +
        '<span class="item-price">' + (owned ? '—' : G.fmtGold(it.price)) + '</span>' +
        '<span class="item-mods">' + modList(it.mods) + '</span>' +
        '<span class="item-flavor">' + it.flavor + '</span>' +
        '<span class="item-state" style="' + (equipped ? '' : 'color:var(--parch-mute)') + '">' + state + '</span>' +
      '</button>';
    }).join('');
    return '<div class="shop-col"><h3>' + G.SLOT_LABEL[slot] + '</h3>' + items + '</div>';
  }).join('');

  const cons = G.CONSUMABLES.map(c =>
    '<button class="item" data-cons="' + c.id + '"' + (G.S.gold < c.price ? ' disabled' : '') + '>' +
      '<span class="item-name">' + c.name + '　<span style="color:var(--parch-mute);font-size:11px">持有 ' + (G.S.consumables[c.id] | 0) + '</span></span>' +
      '<span class="item-price">' + c.price + '</span>' +
      '<span class="item-flavor">' + c.desc + '</span>' +
    '</button>').join('');

  const built = G.computeStats();
  const st = built.stats;
  const statRows = [
    ['生命', Math.round(st.hp)], ['傷害', st.dmg.toFixed(1)], ['攻速', st.atkSpd.toFixed(2) + '/秒'],
    ['射程', Math.round(st.range)], ['移速', Math.round(st.moveSpd)], ['護甲', Math.round(st.armor)],
    ['暴擊', Math.round(st.crit * 100) + '%'], ['暴傷', Math.round(st.critDmg * 100) + '%'],
    ['冷卻縮減', Math.round(st.cdr * 100) + '%'], ['技能傷害', Math.round(st.power * 100) + '%'],
    ['攻城傷害', '+' + Math.round(st.siege * 100) + '%'], ['小兵強化', '+' + Math.round(st.minionDmg * 100) + '%']
  ].map(([k, v]) => '<div class="cls-stat"><b>' + v + '</b><span>' + k + '</span></div>').join('');

  U.view.innerHTML =
    '<section class="panel"><div class="panel-head"><h2>補給所</h2>' +
    '<span class="hint">買過的裝備會留著，可以隨時換回來。</span></div>' +
    '<div class="panel-body">' +
      '<div class="eyebrow" style="margin-bottom:8px">目前總數值　·　' + G.getClass(G.S.classId).name + '　Lv ' + G.S.level + '</div>' +
      '<div class="cls-stats" style="grid-template-columns:repeat(auto-fit,minmax(84px,1fr));margin-bottom:20px">' + statRows + '</div>' +
      '<div class="shop-cols">' + cols +
        '<div class="shop-col"><h3>戰鬥消耗品</h3>' + cons + '</div>' +
      '</div>' +
    '</div></section>';
};

/* ══════ 結算 ══════ */
U.showResult = function (data) {
  const win = data.result === 'win';
  const ch = G.getChapter(data.stage.chapterId);
  const line = win
    ? (data.stage.isBoss
        ? '「' + ch.boss.name + '」倒下了。它守著的東西，現在歸你。'
        : '主塔塌了。前面還有更深的一層。')
    : '城門被推倒了。這條線斷在你出發的地方。';

  const rows = [];
  if (win) {
    rows.push(['獲得金幣', '+' + G.fmtGold(data.gold)]);
    rows.push(['技能點', '+' + data.sp]);
    rows.push(['經驗', '+' + data.xp]);
  } else {
    rows.push(['帶回的金幣', '+' + G.fmtGold(data.gold)]);
    if (data.xp) rows.push(['經驗（打輸也算）', '+' + data.xp]);
  }
  if (data.spent) {
    rows.push(['戰場收入', G.fmtGold(data.earned)]);
    rows.push(['僱用支出', '−' + G.fmtGold(data.spent)]);
  }
  rows.push(['擊殺', String(data.kills)]);
  rows.push(['耗時', Math.floor(data.time / 60) + ':' + String(Math.floor(data.time % 60)).padStart(2, '0')]);

  const el = document.createElement('div');
  el.className = 'overlay';
  el.innerHTML =
    '<div class="result' + (win ? '' : ' lose') + '">' +
      '<div class="result-head">' +
        '<div class="result-verdict">' + (win ? 'Tower Down' : 'Gate Lost') + '</div>' +
        '<h2>' + data.stage.name + '</h2>' +
        '<p class="result-line">' + line + '</p>' +
      '</div>' +
      (data.levels ? '<div class="levelup">升到 ' + G.S.level + ' 級' + (data.levels >= 1 && G.S.level % 2 === 0 ? '，多拿到 1 點技能點' : '') + '。</div>' : '') +
      '<div class="result-rows">' + rows.map(([k, v]) =>
        '<div class="result-row"><span>' + k + '</span><b>' + v + '</b></div>').join('') + '</div>' +
      '<div class="result-actions">' +
        '<button class="btn btn-primary" data-res="retry">' + (win ? '再打一次' : '重來') + '</button>' +
        '<button class="btn btn-ghost" data-res="tree">技能樹</button>' +
        '<button class="btn btn-ghost" data-res="back">回遠征路線</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(el);
  U.resultEl = el;
};
