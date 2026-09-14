/* 介面：頂欄、章節、職業、技能樹、商店、結算 */
window.G = window.G || {};

const U = {};
G.U = U;

const MOD_LABEL = {
  hp: '生命', hpFlat: '生命', dmg: '傷害', dmgFlat: '傷害', atkSpd: '攻速', range: '射程',
  moveSpd: '移速', crit: '暴擊', critDmg: '暴傷', armor: '護甲', armorFlat: '護甲',
  cdr: '冷卻縮減', power: '技能傷害', lifesteal: '吸血', minionDmg: '小兵傷害',
  minionHp: '小兵生命', goldFind: '金幣', siege: '攻城傷害',
  mdef: '魔防', herb: '藥草效果'
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
    '<div class="res res-star"><span class="res-label">★</span><span class="star-track">' +
      Array.from({ length: G.STAR_GOAL }, (_, i) =>
        '<i class="' + ((s.stars | 0) > i ? 'on' : '') + '">★</i>').join('') +
      ((s.stars | 0) > G.STAR_GOAL ? '<span class="res-val">+' + ((s.stars | 0) - G.STAR_GOAL) + '</span>' : '') +
    '</span></div>' +
    '<div class="res res-gold"><span class="res-label">Gold</span><span class="res-val">' + G.fmtGold(s.gold) + '</span></div>' +
    '<button class="sound-btn" data-act="sound" aria-label="聲音開關" ' +
      'title="' + (G.S.sound === false ? '聲音：關' : '聲音：開') + '">' +
      (G.S.sound === false ? '🔇' : '🔊') + '</button>';
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
  else if (name === 'chapters') { if (G.runActive()) U.renderExpedition(); else U.renderChapters(); }
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
        '<p>古代世界留下七個地方。它們被寫進史詩、刻在石頭上、' +
        '或者只活在一份沒有人能證實的目擊報告裡。</p>' +
        '<p>從柏拉圖說的那座沉城開始，一路往後走到亞歷山大港外那盞燈——' +
        '九千年、七座塔，每一座都還有守衛，守著一個沒有人記得的答案。</p>' +
        '<p>你是一顆被派去拆塔的橘色小東西。你有一把劍、一面盾，' +
        '和一條會跟著你往前推的線。城門在你身後，主塔在最前面，中間全是別人。</p>' +
        '<p>每一章都是一張有分岔的大地圖。你從左下角出發，往右、再往上，' +
        '路上會遇到寶箱、商隊、營地、險地與謎團——有些地點走到才知道是什麼，' +
        '有些岔路是死路，但死路盡頭的洞穴裡長著藥草。</p>' +
        '<p style="color:var(--parch);">這一版你沒有任何恢復法術。' +
        '血量一路帶到底，倒下一次再扣 10%，有些路本身就是陷阱、走過去就掉血。' +
        '要不要走，自己量力而為。</p>' +
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
    return '<article class="chapter' + (unlocked ? '' : ' locked') + '">' +
      '<div class="chapter-top">' +
        '<div class="chapter-no">' + ch.no + '</div>' +
        '<div><div class="chapter-name">' + ch.name + '</div>' +
        '<div class="chapter-year">' + ch.year + '</div>' +
        '<div class="chapter-sub">' + ch.sub + '</div></div>' +
      '</div>' +
      '<p class="chapter-lore">' + ch.lore + '</p>' +
      '<p class="chapter-hook">' + ch.hook + '</p>' +
      '<div class="stages">' + U.chapterAction(ch, ci, unlocked) + '</div>' +
    '</article>';
  }).join('');

  U.view.innerHTML =
    '<section class="panel"><div class="panel-head"><h2>遠征路線</h2>' +
    '<span class="hint">依年代排序的七個地方，從前 9600 年走到前 247 年。每一章都是一張有分岔的大地圖。</span></div>' +
    '<div class="panel-body"><div class="chapters">' + cards + '</div></div></section>';
};

/* 章節卡底下那顆按鈕：出發 / 繼續 / 再走一次 */
U.chapterAction = function (ch, ci, unlocked) {
  const run = G.runActive();
  const cleared = !!G.S.cleared[ch.id + '-3'];
  if (run && run.chapterId === ch.id) {
    return '<button class="stage boss" data-resume-run="1">繼續這趟遠征' +
      '<span class="tick">生命 ' + Math.round(run.hpPct * 100) + '%</span></button>';
  }
  if (run) {
    return '<button class="stage" disabled>先把手上那趟遠征走完' +
      '<span class="tick">或從地圖上撤出</span></button>';
  }
  if (!unlocked) {
    return '<button class="stage" disabled>未開啟<span class="tick">先通過前一章</span></button>';
  }
  return '<button class="stage' + (cleared ? '' : ' boss') + '" data-start-run="' + ch.id + '">' +
    (cleared ? '再走一次' : '出發') +
    '<span class="tick">' + (cleared ? '地圖會重新生成' : '八段路，終點是' + ch.boss.name) + '</span></button>';
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
  const VB_W = 960, VB_H = 560;   // 放寬到 960，最右邊那一欄留給共通技能

  /* 連線。三種狀態：
     兩端都學了＝亮線＋外圍一層光暈（看得出這條路已經走通）
     只有起點學了＝半亮的虛線（這是下一步可以走的方向）
     都沒學＝很暗的虛線（知道有這條路，但不搶視線） */
  const edges = [];
  const glow = [];
  cls.nodes.forEach(n => {
    /* 共通技能的前置是「第四階任一個」，照實畫會變成 3×3 九條線交叉成一團。
       所以只畫到最靠近的那一個——判定照舊是任一個就行，線只是給人看的。 */
    let reqs = n.req;
    if (n.shared && reqs.length > 1) {
      reqs = [reqs.slice().sort((a, b) => {
        const na = cls.nodes.find(x => x.id === a), nb = cls.nodes.find(x => x.id === b);
        return Math.abs((na ? na.pos.y : 0) - n.pos.y) - Math.abs((nb ? nb.pos.y : 0) - n.pos.y);
      })[0]];
    }
    reqs.forEach(rid => {
      const from = cls.nodes.find(x => x.id === rid);
      if (!from) return;
      const owned = G.hasNode(cls.id, rid) && G.hasNode(cls.id, n.id);
      const half = G.hasNode(cls.id, rid);
      const mx = (from.pos.x + n.pos.x) / 2;
      const d = 'M' + from.pos.x + ' ' + from.pos.y +
        ' C' + mx + ' ' + from.pos.y + ' ' + mx + ' ' + n.pos.y + ' ' + n.pos.x + ' ' + n.pos.y;
      if (owned) {
        // 底下先鋪一條粗的半透明，做出發光的感覺
        glow.push('<path d="' + d + '" fill="none" stroke="' + cls.color +
          '" stroke-width="9" stroke-opacity="0.20" stroke-linecap="round"/>');
        edges.push('<path d="' + d + '" fill="none" stroke="' + cls.color +
          '" stroke-width="3.2" stroke-linecap="round"/>');
      } else {
        edges.push('<path d="' + d + '" fill="none" stroke="' + (half ? '#6A5A3E' : '#2A2419') +
          '" stroke-width="' + (half ? 2.2 : 1.8) + '" stroke-dasharray="' + (half ? '5 6' : '3 7') +
          '" stroke-linecap="round"/>');
      }
    });
  });

  /* 階層標記：每一個 tier 在最上面標一行，讓人看得出樹是往右長的 */
  const tierX = {};
  cls.nodes.forEach(n => {
    const t = n.tier || 0;
    if (tierX[t] == null) tierX[t] = [];
    tierX[t].push(n.pos.x);
  });
  const tierMarks = Object.keys(tierX).sort((a, b) => a - b).map(t => {
    const xs = tierX[t];
    const cx = xs.reduce((s, v) => s + v, 0) / xs.length;
    const names = ['起手', '第二階', '第三階', '第四階', '第五階', '第六階'];
    return '<span class="tier-mark" style="left:' + (cx / VB_W * 100).toFixed(2) + '%">' +
      (names[t] || ('第 ' + (Number(t) + 1) + ' 階')) + '</span>';
  }).join('');

  const nodesHtml = cls.nodes.map(n => {
    const owned = G.hasNode(cls.id, n.id);
    const chk = G.canUnlock(cls.id, n.id);
    const avail = !owned && chk.ok;
    const reqMet = !n.req.length || n.req.some(r => G.hasNode(cls.id, r));
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
        '<svg viewBox="0 0 ' + VB_W + ' ' + VB_H + '" preserveAspectRatio="none">' +
          glow.join('') + edges.join('') + '</svg>' +
        tierMarks + nodesHtml +
      '</div>' +
      '<div class="tree-side">' + detail + U.barConfig(cls, cs) +
        '<button class="btn btn-ghost btn-full" data-act="respec">重置這個職業的技能樹（退回全部點數）</button>' +
      '</div>' +
    '</div></div></section>';
};

U.nodeDetail = function (cls, cs, n) {
  const owned = G.hasNode(cls.id, n.id);
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

/* 帽子只從戰場上撿，所以卡片講的是「有沒有」而不是「買不買」 */
function hatCard(it) {
  const owned = G.S.owned.includes(it.id);
  const equipped = G.S.gear.hat === it.id;
  const cls = ['item'];
  if (equipped) cls.push('equipped');
  else if (owned) cls.push('owned-not-eq');
  else cls.push('unfound');
  const aff = it.affinity ? G.getClass(it.affinity) : null;
  return '<button class="' + cls.join(' ') + '" data-item="' + it.id + '"' + (owned ? '' : ' disabled') + '>' +
    '<span class="item-name">' + (owned ? it.name : '？？？') + '</span>' +
    '<span class="item-price">' + (owned ? '—' : '未撿到') + '</span>' +
    '<span class="item-mods">' + (owned ? modList(it.mods) : '') + '</span>' +
    (owned && aff
      ? '<span class="item-aff">' + aff.name + ' 專屬加成：' + modList(it.bonus) + '</span>'
      : '') +
    '<span class="item-flavor">' + (owned ? it.flavor : '還沒在路上撿到這一頂。') + '</span>' +
    '<span class="item-state" style="' + (equipped ? '' : 'color:var(--parch-mute)') + '">' +
      (equipped ? '戴著' : owned ? '點一下戴上' : '路上會掉') + '</span>' +
  '</button>';
}

/* ══════ 商店 ══════ */
U.renderShop = function () {
  const cols = G.GEAR_SLOTS.map(slot => {
    /* 帽子不賣，只在路上撿；星光商品走另一個攤位 */
    const items = G.ITEMS.filter(i => i.slot === slot && !i.starOnly).map(it => {
      if (slot === 'hat') return hatCard(it);
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
    ['攻城傷害', '+' + Math.round(st.siege * 100) + '%'], ['小兵強化', '+' + Math.round(st.minionDmg * 100) + '%'],
    ['魔防', Math.round((st.mdef || 0) * 100) + '%'], ['藥草效果', '+' + Math.round((st.herb || 0) * 100) + '%']
  ].map(([k, v]) => '<div class="cls-stat"><b>' + v + '</b><span>' + k + '</span></div>').join('');

  const backBar = (U.fromExpedition && G.runActive())
    ? '<button class="btn btn-primary btn-full" data-act="back-to-run" style="margin-bottom:16px">' +
      '補給完畢，回到征途</button>'
    : '';

  U.view.innerHTML =
    '<section class="panel"><div class="panel-head"><h2>補給所</h2>' +
    '<span class="hint">' + (U.fromExpedition && G.runActive()
      ? '這是路上的商隊。買完按上面的鈕回地圖。'
      : '買過的裝備會留著，可以隨時換回來。') + '</span></div>' +
    '<div class="panel-body">' + backBar +
      '<div class="eyebrow" style="margin-bottom:8px">目前總數值　·　' + G.getClass(G.S.classId).name + '　Lv ' + G.S.level + '</div>' +
      '<div class="cls-stats" style="grid-template-columns:repeat(auto-fit,minmax(84px,1fr));margin-bottom:20px">' + statRows + '</div>' +
      starShop() +
      '<div class="shop-cols">' + cols +
        '<div class="shop-col"><h3>戰鬥消耗品</h3>' + cons + '</div>' +
      '</div>' +
    '</div></section>';
};

/* 星光商店：用星買，不用錢買。所以它跟有沒有錢無關，只跟打得夠不夠快有關。 */
function starShop() {
  const have = G.S.stars | 0;
  if (!G.starShopOpen()) {
    return '<div class="starshop locked">' +
      '<h3>★　星光商店</h3>' +
      '<p>限時過關會拿到星。集滿 <b>' + G.STAR_GOAL + '</b> 顆就開。' +
      '目前 <b>' + have + ' / ' + G.STAR_GOAL + '</b>。</p>' +
      '<p class="hint">每一關的限時寫在戰鬥畫面右上角。同一關只能拿一次星。</p>' +
    '</div>';
  }
  const cards = G.STAR_ITEMS.map(it => {
    const owned = G.S.owned.includes(it.id);
    const equipped = G.S.gear[it.slot] === it.id;
    const afford = have >= it.stars;
    const cls = ['item'];
    if (equipped) cls.push('equipped');
    else if (owned) cls.push('owned-not-eq');
    return '<button class="' + cls.join(' ') + '" data-star-item="' + it.id + '"' +
      ((!owned && !afford) ? ' disabled' : '') + '>' +
      '<span class="item-name">' + it.name + '</span>' +
      '<span class="item-price">' + (owned ? '—' : it.stars + '★') + '</span>' +
      '<span class="item-mods">' + modList(it.mods) + '</span>' +
      '<span class="item-flavor">' + it.flavor + '</span>' +
      '<span class="item-state" style="' + (equipped ? '' : 'color:var(--parch-mute)') + '">' +
        (equipped ? '裝備中' : owned ? '已擁有　·　點一下裝備'
          : afford ? '點一下用 ' + it.stars + ' 顆星換' : '星不夠') + '</span>' +
    '</button>';
  }).join('');
  return '<div class="starshop"><h3>★　星光商店　<span>剩 ' + have + ' 顆星</span></h3>' +
    '<div class="shop-col">' + cards + '</div></div>';
}

/* ══════ 結算 ══════ */
U.showResult = function (data) {
  const win = data.result === 'win';
  const ch = G.getChapter(data.stage.chapterId);
  const line = data.cave
    ? (win ? '洞穴清空了。深處長著東西，你把它們採了下來。'
           : '洞裡的東西沒清乾淨。你退了出來，什麼也沒帶走。')
    : data.guardian
      ? (win ? '守衛倒了。它身後那條路，現在是你的。'
             : '結界還在。你打不動它——先去換一套打得動的。')
    : win
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
  if (data.herbs) rows.push(['採到藥草', '×' + data.herbs]);
  if (data.guardDrop) rows.push(['守衛掉落', data.guardDrop]);
  if (data.deaths) rows.push(['倒下次數', data.deaths + ' 次　−' + (data.deaths * 10) + '%']);
  if (data.inRun && data.hpLeft != null) rows.push(['帶往下一個地點的生命', data.hpLeft + '%']);
  if (data.hats && data.hats.length) {
    rows.push(['路上撿到', data.hats.map(id => (G.getItem(id) || {}).name || '帽子').join('、')]);
  }
  rows.push(['擊殺', String(data.kills)]);
  const mmss = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  rows.push(['耗時', mmss(data.time) + (data.par ? '　（限時 ' + mmss(data.par) + '）' : '')]);

  const el = document.createElement('div');
  el.className = 'overlay';
  el.innerHTML =
    '<div class="result' + (win ? '' : ' lose') + '">' +
      '<div class="result-head">' +
        '<div class="result-verdict">' + (win ? 'Tower Down' : 'Gate Lost') + '</div>' +
        '<h2>' + data.stage.name + '</h2>' +
        '<p class="result-line">' + line + '</p>' +
      '</div>' +
      (data.star
        ? '<div class="starwin">★　限時內過關　＋1 星、＋1 技能點' +
          '<span>目前 ' + data.stars + ' / ' + G.STAR_GOAL + ' 星' +
          (data.stars >= G.STAR_GOAL ? '　—　星光商店已經開了' : '') + '</span></div>'
        : (win && data.par && !data.cave
            ? '<div class="starmiss">差一點：這一關限時 ' +
              Math.floor(data.par / 60) + ':' + String(data.par % 60).padStart(2, '0') +
              '　再快一點就有星。</div>'
            : '')) +
      (data.levels ? '<div class="levelup">升到 ' + G.S.level + ' 級' + (data.levels >= 1 && G.S.level % 2 === 0 ? '，多拿到 1 點技能點' : '') + '。</div>' : '') +
      '<div class="result-rows">' + rows.map(([k, v]) =>
        '<div class="result-row"><span>' + k + '</span><b>' + v + '</b></div>').join('') + '</div>' +
      '<div class="result-actions">' +
        (data.bossWin
          ? '<button class="btn btn-primary" data-res="runwin">完成遠征</button>'
          : data.inRun
            ? '<button class="btn btn-primary" data-res="back">回到征途</button>' +
              (win ? '' : '<button class="btn btn-ghost" data-res="retry">立刻重打</button>')
            : '<button class="btn btn-primary" data-res="retry">' + (win ? '再打一次' : '重來') + '</button>') +
        '<button class="btn btn-ghost" data-res="tree">技能樹</button>' +
        (data.inRun ? '' : '<button class="btn btn-ghost" data-res="back">回遠征路線</button>') +
      '</div>' +
    '</div>';
  document.body.appendChild(el);
  U.resultEl = el;
};
