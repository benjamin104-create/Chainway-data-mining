// 律動挑戰的核心（舞蹈篇、武俠篇共用同一份）
//   動作：用「手臂、腿每一段骨頭的方向」定義，跟身高、離鏡頭多遠無關
//   舞步：一個舞步是「每一拍一個姿勢」的循環（例如 拍手→張開→拍手→張開），跟著拍子重複一到兩小節
//   判定：每一拍前後一小段時間內，取「最像的那一格」；整個舞步的平均就是這張卡的分數
//   編舞：每首歌固定（主歌一套、副歌一套，副歌重複），像 Just Dance 一樣跳第二遍就記得
//   全部在手機上算，影像不會傳出去

// ── 骨架 ──────────────────────────────────────────────
// MediaPipe 全身 33 點：11/12 肩、13/14 肘、15/16 腕、23/24 髖、25/26 膝、27/28 踝、0 鼻
// 「左」＝本人的左手。畫面是鏡像的，所以本人的左手就在畫面左邊，跟動作卡上的小人一致
export const J = { nose: 0, ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16, lh: 23, rh: 24, lk: 25, rk: 26, la: 27, ra: 28 };

// 動作卡小人的標準身形（肩膀中點為原點，軀幹長約 1，y 朝下）
const BODY = { sw: .4, hw: .22, hip: 1.02, arm: .5, leg: .82, head: .5, hr: .25 };
const DOWN = { L: [96, 93], R: [84, 87] };                 // 手自然垂下
const STAND = { L: [94, 90], R: [86, 90] };                // 腿站直

// 角度（度）：0 → 右、90 → 下、180 → 左、-90 → 上（畫面座標）
// arms: { L: [上臂, 前臂], R: [...] }；legs: { L: [大腿, 小腿], R: [...] }；drop：身體往下蹲多少（只影響小人圖）
// score：要不要比對手臂（arms）、額外的全身條件（check）
export const MOVES = {
  up:      { zh: '雙手舉高', en: 'HANDS UP', arms: { L: [-100, -95], R: [-80, -85] } },
  tee:     { zh: 'T 字展開', en: 'T-POSE', arms: { L: [180, 180], R: [0, 0] } },
  yy:      { zh: 'Y 字歡呼', en: 'Y-POSE', arms: { L: [-128, -128], R: [-52, -52] } },
  discoL:  { zh: '左手指天', en: 'DISCO L', arms: { L: [-125, -118], R: [55, 55] } },
  discoR:  { zh: '右手指天', en: 'DISCO R', arms: { L: [125, 125], R: [-55, -62] } },
  muscle:  { zh: '秀肌肉', en: 'MUSCLE', arms: { L: [178, -88], R: [2, -92] } },
  heart:   { zh: '頭上比愛心', en: 'HEART', arms: { L: [-100, -40], R: [-80, -140] }, check: (f) => near(f, .75) * above(f) },
  clap:    { zh: '胸前拍手', en: 'CLAP', arms: { L: [108, -12], R: [72, -168] }, check: (f) => near(f, .7) },
  pointL:  { zh: '雙手向左', en: 'POINT LEFT', arms: { L: [-160, -160], R: [-178, 178] } },
  pointR:  { zh: '雙手向右', en: 'POINT RIGHT', arms: { L: [-2, 2], R: [-20, -20] } },
  squat:   { zh: '蹲下', en: 'SQUAT', arms: { L: [120, 30], R: [60, 150] }, armsOff: true, legs: { L: [148, 82], R: [32, 98] }, drop: .5, check: (f) => squat(f) },
  kneeL:   { zh: '抬左膝', en: 'KNEE UP L', arms: { L: [150, -100], R: [30, -80] }, armsOff: true, legs: { L: [-178, 90], R: STAND.R }, check: (f) => knee(f, 'l') },
  kneeR:   { zh: '抬右膝', en: 'KNEE UP R', arms: { L: [150, -100], R: [30, -80] }, armsOff: true, legs: { L: STAND.L, R: [-2, 90] }, check: (f) => knee(f, 'r') },
  star:    { zh: '大字跳', en: 'STAR JUMP', arms: { L: [-140, -140], R: [-40, -40] }, legs: { L: [118, 112], R: [62, 68] }, check: (f) => wide(f) },
  // 舞步用的過門姿勢
  down:    { zh: '手放下', en: 'DOWN', arms: DOWN },
  openLow: { zh: '手往下張開', en: 'OPEN', arms: { L: [135, 135], R: [45, 45] } },
  waveL:   { zh: '雙手擺左', en: 'WAVE L', arms: { L: [-150, -160], R: [-112, -122] } },
  waveR:   { zh: '雙手擺右', en: 'WAVE R', arms: { L: [-68, -58], R: [-30, -20] } },
  planeL:  { zh: '飛機左傾', en: 'PLANE L', arms: { L: [142, 142], R: [-38, -38] } },
  planeR:  { zh: '飛機右傾', en: 'PLANE R', arms: { L: [-142, -142], R: [38, 38] } },
  hips:    { zh: '雙手插腰', en: 'HANDS ON HIPS', arms: { L: [128, 48], R: [52, 132] } },
  discoDn: { zh: '右手往下指', en: 'DISCO DOWN', arms: { L: DOWN.L, R: [118, 124] } },
  discoDnL:{ zh: '左手往下指', en: 'DISCO DOWN', arms: { L: [62, 56], R: DOWN.R } },
  pumpUp:  { zh: '右拳往上', en: 'PUMP', arms: { L: [128, 48], R: [-88, -90] } },
  pumpDn:  { zh: '右拳收回', en: 'PUMP', arms: { L: [128, 48], R: [6, -86] } },
  squatClap: { zh: '蹲下拍手', en: 'SQUAT CLAP', arms: { L: [108, -12], R: [72, -168] }, armsOff: true, legs: { L: [148, 82], R: [32, 98] }, drop: .5, check: (f) => squat(f) * (.4 + .6 * near(f, .8)) },
  jackIn:  { zh: '併腳', en: 'JACK', arms: DOWN, check: (f) => 1 - wide(f) * .8 },
};

// ── 舞步（每一拍一個姿勢，循環）──────────────────────
// beats：一個循環幾拍、每拍的姿勢；cue：卡片上教的口訣
export const STEPS = {
  clapStep: { zh: '踏步拍手', cue: '拍・開・拍・開', beats: ['clap', 'openLow'] },
  wave:     { zh: '雙手擺擺', cue: '左・右・左・右', beats: ['waveL', 'waveR'] },
  roof:     { zh: '推天花板', cue: '收・推・收・推', beats: ['muscle', 'up'] },
  point:    { zh: '左右指', cue: '左・右・左・右', beats: ['pointL', 'pointR'] },
  plane:    { zh: '小飛機', cue: '左傾・右傾', beats: ['planeL', 'planeR'] },
  heart:    { zh: '愛心歡呼', cue: '愛心・打開', beats: ['heart', 'yy'] },
  hips:     { zh: '插腰拍手', cue: '插腰・拍・插腰・拍', beats: ['hips', 'clap'] },
  disco:    { zh: '迪斯可', cue: '上・下・上・下', beats: ['discoR', 'discoDn'] },
  discoL:   { zh: '迪斯可（左）', cue: '上・下・上・下', beats: ['discoL', 'discoDnL'] },
  pump:     { zh: '舉拳打氣', cue: '上・收・上・收', beats: ['pumpUp', 'pumpDn'] },
  fly:      { zh: '展翅', cue: '展開・放下', beats: ['tee', 'down'] },
  bounce:   { zh: '蹲蹲跳', cue: '蹲・起・蹲・起', beats: ['squatClap', 'up'], legs: true },
  knee:     { zh: '抬膝', cue: '左膝・右膝', beats: ['kneeL', 'kneeR'], legs: true },
  jack:     { zh: '開合跳', cue: '開・合・開・合', beats: ['star', 'jackIn'], legs: true },
};
// 金色動作：一小節的定格大招（第一拍做到就 YEAH）
export const GOLD = { yy: { zh: '勝利 Y 字' }, star: { zh: '大字定格' }, up: { zh: '雙手高舉' } };
// 各難度可以出現的動作
// 各難度的舞步、一個舞步跳幾小節
export const POOLS = {
  easy: ['clapStep', 'wave', 'roof', 'point', 'plane', 'heart', 'hips'],
  normal: ['clapStep', 'wave', 'roof', 'point', 'plane', 'heart', 'disco', 'discoL', 'pump', 'fly', 'bounce'],
  hard: ['clapStep', 'wave', 'roof', 'point', 'plane', 'heart', 'disco', 'discoL', 'pump', 'fly', 'bounce', 'knee', 'jack'],
};
const BARS_PER = { easy: 2, normal: 2, hard: 1 };

// 小人每個關節的位置（給動作卡、教練、測試機器人用）
export function figure(m) {
  const a = m.arms || DOWN, l = m.legs || STAND, d = m.drop || 0;
  const dir = (deg, len) => [Math.cos(deg * Math.PI / 180) * len, Math.sin(deg * Math.PI / 180) * len];
  const add = (p, v) => [p[0] + v[0], p[1] + v[1]];
  const ls = [-BODY.sw, d], rs = [BODY.sw, d], lh = [-BODY.hw, BODY.hip + d], rh = [BODY.hw, BODY.hip + d];
  const le = add(ls, dir(a.L[0], BODY.arm)), lw = add(le, dir(a.L[1], BODY.arm));
  const re = add(rs, dir(a.R[0], BODY.arm)), rw = add(re, dir(a.R[1], BODY.arm));
  const lk = add(lh, dir(l.L[0], BODY.leg)), la = add(lk, dir(l.L[1], BODY.leg));
  const rk = add(rh, dir(l.R[0], BODY.leg)), ra = add(rk, dir(l.R[1], BODY.leg));
  return { ls, rs, le, re, lw, rw, lh, rh, lk, rk, la, ra, head: [0, -BODY.head + d], hr: BODY.hr };
}
// 兩個姿勢之間的過渡（教練跳舞用）：直接內插角度
export function blend(a, b, k) {
  const mix = (x, y) => { let d = ((y - x + 540) % 360) - 180; return x + d * k; };
  const pair = (p, q) => [mix(p[0], q[0]), mix(p[1], q[1])];
  const A = a.arms || DOWN, B = b.arms || DOWN, LA = a.legs || STAND, LB = b.legs || STAND;
  return { arms: { L: pair(A.L, B.L), R: pair(A.R, B.R) }, legs: { L: pair(LA.L, LB.L), R: pair(LA.R, LB.R) }, drop: (a.drop || 0) * (1 - k) + (b.drop || 0) * k, sway: (a.sway || 0) * (1 - k) + (b.sway || 0) * k };
}

// ── 比對 ──────────────────────────────────────────────
// f：一格的身體資料（鏡像後的畫面座標）＋可信度
export function frameOf(lms, w, h) {
  if (!lms || lms.length < 29) return null;
  const P = {}, V = {};
  for (const [k, i] of Object.entries(J)) { const p = lms[i]; P[k] = [(1 - p.x) * w, p.y * h]; V[k] = p.visibility ?? 1; }
  const mid = (a, b) => [(P[a][0] + P[b][0]) / 2, (P[a][1] + P[b][1]) / 2];
  const sm = mid('ls', 'rs'), hm = mid('lh', 'rh');
  const sw = Math.hypot(P.ls[0] - P.rs[0], P.ls[1] - P.rs[1]);
  const T = V.lh > .4 && V.rh > .4 ? Math.hypot(sm[0] - hm[0], sm[1] - hm[1]) : sw * 1.25;
  return { P, V, sm, hm, sw: Math.max(sw, 1), T: Math.max(T, 1) };
}
const ang = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
const adiff = (x, y) => Math.abs(((y - x + 540) % 360) - 180);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
function seg(f, a, b, target, tol) {
  if (f.V[a] < .35 || f.V[b] < .35) return .15;           // 看不到這段手臂：給很低的分
  return clamp(1 - Math.max(0, adiff(ang(f.P[a], f.P[b]), target) - tol) / 50);
}
// 兩手腕靠近（比愛心、拍手）
function near(f, lim) { const d = Math.hypot(f.P.lw[0] - f.P.rw[0], f.P.lw[1] - f.P.rw[1]) / f.sw; return clamp((lim + .5 - d) / .5); }
function above(f) { return clamp((f.P.nose[1] - (f.P.lw[1] + f.P.rw[1]) / 2) / (f.T * .25)); }
// 蹲下：大腿朝鏡頭，從正面看膝蓋會跑到髖關節附近
function legSeen(f) { return Math.min(f.V.lh, f.V.rh, f.V.lk, f.V.rk) > .4; }
function squat(f) {
  if (!legSeen(f)) return .1;
  const r = Math.max(f.P.lk[1] - f.P.lh[1], f.P.rk[1] - f.P.rh[1]) / f.T;   // 兩腳都要蹲（只抬一腳不算）
  return clamp((.72 - r) / .3);
}
function knee(f, s) {
  if (!legSeen(f)) return .1;
  const o = s === 'l' ? 'r' : 'l';
  const up = (f.P[s + 'k'][1] - f.P[s + 'h'][1]) / f.T, st = (f.P[o + 'k'][1] - f.P[o + 'h'][1]) / f.T;
  return clamp((.68 - up) / .35) * clamp((st - .35) / .25);
}
function wide(f) {
  if (Math.min(f.V.la, f.V.ra) < .4) return .1;
  return clamp((Math.abs(f.P.la[0] - f.P.ra[0]) / f.sw - 1.25) / .7);
}
// 每一段身體各自像不像（左手、右手、全身條件）——畫面上把做錯的那隻手標紅（Dance Central 的做法）
export function limbs(f, m, tol = 20) {
  const out = { L: null, R: null, X: null };
  if (!f) return out;
  if (m.arms && !m.armsOff) for (const s of ['l', 'r']) {
    const t = m.arms[s.toUpperCase()];
    out[s.toUpperCase()] = .4 * seg(f, s + 's', s + 'e', t[0], tol) + .6 * seg(f, s + 'e', s + 'w', t[1], tol);
  }
  if (m.check) out.X = m.check(f);
  return out;
}
// 一格跟某個動作有多像（0～1）
export function match(f, m, tol = 20) {
  if (!f) return 0;
  const l = limbs(f, m, tol), parts = [l.L, l.R, l.X].filter((v) => v != null);
  if (!parts.length) return 0;
  const mean = parts.reduce((a, b) => a + b, 0) / parts.length;
  return .6 * mean + .4 * Math.min(...parts);
}
// 運動量（算大卡、自由舞段落用）：手腕、腳踝這一格移動了幾個軀幹長
export function energy(f, prev) {
  if (!f || !prev) return 0;
  let e = 0;
  for (const k of ['lw', 'rw', 'la', 'ra', 'le', 're']) if (f.V[k] > .5 && prev.V[k] > .5) e += Math.hypot(f.P[k][0] - prev.P[k][0], f.P[k][1] - prev.P[k][1]);
  return e / f.T;
}

// ── 難度 ──────────────────────────────────────────────
export const DIFF = {
  easy:   { zh: '簡單', en: 'EASY', win: .5, tol: 26, cut: [.76, .6, .45, .3], ahead: 3.6 },
  normal: { zh: '普通', en: 'NORMAL', win: .42, tol: 20, cut: [.8, .66, .5, .34], ahead: 3.1 },
  hard:   { zh: '困難', en: 'HARD', win: .36, tol: 16, cut: [.84, .7, .55, .38], ahead: 2.7 },
};
// 跟 Just Dance 一樣五級：PERFECT／SUPER／GOOD／OK／X；金色動作只有 YEAH 或 X
export const GRADES = [
  { id: 'perfect', en: 'PERFECT', v: 1 },
  { id: 'super', en: 'SUPER', v: .8 },
  { id: 'good', en: 'GOOD', v: .55 },
  { id: 'ok', en: 'OK', v: .3 },
  { id: 'miss', en: 'X', v: 0 },
];
export const YEAH = { id: 'yeah', en: 'YEAH!', v: 1 };

// ── 編舞 ──────────────────────────────────────────────
function rng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
const PAIR = { disco: 'discoL', discoL: 'disco' };
// 一套舞：n 個舞步，相鄰不重複、腳的舞步不連著；迪斯可常常左右接著跳
function routine(pool, n, rnd, avoid = []) {
  const out = [];
  while (out.length < n) {
    const prev = out[out.length - 1];
    if (prev && PAIR[prev] && pool.includes(PAIR[prev]) && !out.includes(PAIR[prev]) && rnd() < .7) { out.push(PAIR[prev]); continue; }
    let cand = pool.filter((m) => m !== prev && !(STEPS[prev]?.legs && STEPS[m].legs) && !out.includes(m));
    if (!cand.length) cand = pool.filter((m) => m !== prev);
    const fresh = cand.filter((m) => !avoid.includes(m)); if (fresh.length >= 2 && rnd() < .7) cand = fresh;
    out.push(cand[Math.floor(rnd() * cand.length)]);
  }
  return out;
}
// 段落：前兩小節倒數（5、6、7、8），之後每 8 小節主歌、副歌輪替；free＝自由舞的小節
//   bars：總小節數；beat：一拍幾秒（快歌可以用兩拍當一拍）
export function makeChart(bars, diff, pool, beat, seed = 'x', free = null, opt = {}) {
  const rnd = rng(seed + ':' + diff), per = BARS_PER[diff];
  const verse = routine(pool, 4, rnd), chorus = routine(pool, 4, rnd, verse);
  const goldId = Object.keys(GOLD)[Math.floor(rnd() * 3)];
  const secOf = opt.secOf || ((bar) => (bar < 12 ? 'v' : 'c'));
  const cards = [], cnt = { v: 0, c: 0 };
  const lastBar = bars - 1;                                   // 最後一小節收尾
  let bar = 2;
  while (bar < lastBar) {
    if (free && bar >= free[0] && bar < free[1]) { bar = free[1]; continue; }
    const sec = secOf(bar), next = secOf(bar + per);
    // 段落的最後一小節（下一個段落開始前、自由舞前、結尾前）放金色動作
    const endOfSec = sec !== secOf(bar + 1) || bar + 1 === lastBar || (free && bar + 1 === free[0]);
    if (endOfSec && cards.length) { cards.push(card(goldId, bar, 1, beat, true)); bar += 1; continue; }
    let len = per;
    while (len > 1 && (secOf(bar + len - 1) !== sec || bar + len > lastBar || (free && bar + len > free[0] && bar < free[0]))) len--;
    // 段落最後一小節要留給金色動作
    if (len > 1 && (secOf(bar + len) !== sec || bar + len === lastBar || (free && bar + len === free[0]))) len--;
    const list = sec === 'v' ? verse : chorus;
    cards.push(card(list[cnt[sec]++ % list.length], bar, len, beat, false));
    bar += len;
  }
  return { cards, free: free && free[1] > free[0] ? { t0: free[0] * 4 * beat, t1: free[1] * 4 * beat } : null, verse, chorus, goldId };
}
function card(id, bar, len, beat, gold) {
  const t0 = bar * 4 * beat, n = len * 4, beats = [];
  for (let i = 0; i < n; i++) beats.push({ t: t0 + i * beat, pose: gold ? (i === 0 ? id : null) : STEPS[id].beats[i % STEPS[id].beats.length] });
  return { id, gold, bar, len, t0, t1: t0 + n * beat, beats };
}
// 某個時間點，教練／小人應該擺什麼姿勢（每一拍準時到位，中間平滑過去，跟著拍子上下彈）
export function poseAt(chart, t, beat) {
  const cs = chart.cards, i = cs.findIndex((c) => t < c.t1);
  const c = cs[i];
  const at = (cc, k) => { if (!cc) return MOVES.down; const b = cc.beats[Math.max(0, Math.min(cc.beats.length - 1, k))]; return MOVES[b.pose || cc.id] || MOVES.down; };
  if (!c || t < c.t0 - beat) return { ...MOVES.down, bounce: 1 };
  const k = Math.floor((t - c.t0) / beat), ph = (t - c.t0) / beat - k;
  const cur = k < 0 ? MOVES.down : at(c, k);
  const nxt = k + 1 < c.beats.length ? at(c, k + 1) : at(cs[i + 1], 0);
  // 前半拍停在這一拍的姿勢，後半拍移向下一拍
  const e = ph < .45 ? 0 : (ph - .45) / .55, ee = e * e * (3 - 2 * e);
  return { ...blend(cur, nxt, ee), bounce: 1 };
}
// 這一拍做得像不像：要像這一拍的姿勢，而且不能只是停在舞步的另一個姿勢（不然站著不動也會拿分）
export function beatScore(f, card, i, tol) {
  const b = card.beats[i]; if (!b?.pose || !f) return 0;
  const q = match(f, MOVES[b.pose], tol);
  if (card.gold) return q;
  const others = [...new Set(card.beats.map((x) => x.pose))].filter((p) => p && p !== b.pose);
  if (!others.length) return q;
  const qa = Math.max(...others.map((p) => match(f, MOVES[p], tol)));
  return q * clamp(1 - (qa - q + .15) / .4);
}
// 判定：一拍的時間窗（拍點前後）
export function windowOf(beat, d) { return Math.min(d.win, beat * .42); }
// 一張卡的成績：每一拍取最像的一格，離拍點太遠打一點折扣，再平均
export function grade(c, bests, d, beat) {
  const W = windowOf(beat, d);
  const qs = c.beats.map((b, i) => (b.pose ? (bests[i]?.q || 0) * (1 - .25 * clamp((Math.abs((bests[i]?.t ?? b.t) - b.t) - W * .5) / (W * .5))) : null)).filter((v) => v != null);
  const q = qs.reduce((a, b) => a + b, 0) / Math.max(1, qs.length);
  if (c.gold) return { ...(q >= d.cut[2] ? YEAH : GRADES[4]), q };
  const i = d.cut.findIndex((x) => q >= x);
  return { ...GRADES[i < 0 ? 4 : i], q };
}
// 分數（跟 Just Dance 一樣滿分 13333）：一般舞步 11333、金色動作合計 1500、自由舞 500
export const MAX = 13333;
export function scoreOf(st, chart) {
  const reg = chart.cards.filter((c) => !c.gold).reduce((a, c) => a + c.len, 0) || 1, gold = chart.cards.filter((c) => c.gold).length || 1;
  return Math.min(MAX, Math.round(11333 * st.sumV / reg + 1500 * st.gold / gold + (chart.free ? 500 * Math.min(1, st.free || 0) : 500 * (st.sumV / reg))));
}
// 星星：2000 一顆，10000 五顆；11000 SUPERSTAR、12000 MEGASTAR
export const STAR_AT = [2000, 4000, 6000, 8000, 10000, 11000, 12000];
export const starsOf = (s) => STAR_AT.filter((x) => s >= x).length;

// ── 自己的歌：抓拍子（BPM）和第一拍在哪裡 ─────────────
// 方法：算每一小段的音量變化（鼓點會讓音量突然變大），找出最常重複的間隔＝一拍，再對齊鼓點的位置
export function analyzeBeat(ch, sr) {
  const hop = Math.max(128, Math.round(sr / 172)), n = Math.floor(ch.length / hop), env = new Float32Array(n), low = new Float32Array(n);
  let lp = 0; const a = Math.exp(-2 * Math.PI * 150 / sr);
  for (let i = 0; i < n; i++) {
    let e = 0, el = 0;
    for (let j = i * hop; j < (i + 1) * hop; j++) { const x = ch[j]; lp = a * lp + (1 - a) * x; e += x * x; el += lp * lp; }
    env[i] = Math.log1p(e * 100); low[i] = Math.log1p(el * 400);
  }
  const on = new Float32Array(n);
  for (let i = 1; i < n; i++) on[i] = Math.max(0, env[i] - env[i - 1]) + 1.5 * Math.max(0, low[i] - low[i - 1]);
  const fps = sr / hop;
  let best = 0, bestLag = 0;
  const lagOf = (bpm) => 60 * fps / bpm;
  for (let bpm = 70; bpm <= 180; bpm += .5) {
    const L = lagOf(bpm); let s = 0;
    for (let i = 0; i + L * 4 < n; i += 1) { const k = i + L; const k0 = Math.floor(k), f = k - k0; s += on[i] * (on[k0] * (1 - f) + on[k0 + 1] * f); }
    const w = Math.exp(-.5 * (Math.log2(bpm / 118) / .45) ** 2);       // 偏好舞曲常見的速度
    if (s * w > best) { best = s * w; bestLag = L; }
  }
  let bpm = 60 * fps / bestLag;
  while (bpm < 88) bpm *= 2; while (bpm > 152) bpm /= 2;
  // 細調：速度差 1 拍／分鐘，一分鐘就會差半拍，所以在附近 ±2 拍／分鐘、每 0.02 找「整首歌的拍點都對到鼓點」的速度和相位
  const sm = (k) => { const i = Math.round(k); return i > 0 && i < n - 1 ? on[i] + .5 * (on[i - 1] + on[i + 1]) : 0; };
  let bp = 0, bestPh = 0, fine = bpm;
  for (let cand = bpm - 2; cand <= bpm + 2; cand += .02) {
    const per = 60 * fps / cand;
    for (let ph = 0; ph < per; ph += 1) {
      let s = 0; for (let k = ph; k < n - 1; k += per) s += sm(k);
      if (s > bp) { bp = s; bestPh = ph; fine = cand; }
    }
  }
  bpm = fine;
  const period = 60 * fps / bpm;
  // 第一拍：音樂真正開始的地方
  const thr = Math.max(...env) * .35;
  let start = 0; while (start < n && env[start] < thr) start++;
  let first = bestPh; while (first + period < start - period * .25) first += period;
  // 小節的第一拍：四個位置裡低音最重的那個
  let bd = 0, best4 = 0;
  for (let k = 0; k < 4; k++) { let s = 0; for (let x = first + k * period; x < n; x += 4 * period) s += low[Math.round(x)] + on[Math.round(x)]; if (s > best4) { best4 = s; bd = k; } }
  first += bd * period;
  return { bpm: Math.round(bpm * 100) / 100, beat0: first / fps, duration: ch.length / sr };
}

// 給測試／示範用：把某個動作變成假的 MediaPipe 全身點（還原成未鏡像的 0～1 座標）
export function fakeLandmarks(m, w, h, jitter = 0, cxk = .5) {
  const F = figure(m), sc = h * .23, cx = w * cxk, cy = h * .3;
  const p = (q) => [cx + q[0] * sc + (Math.random() - .5) * jitter, cy + q[1] * sc + (Math.random() - .5) * jitter];
  const out = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: .2 }));
  const put = (i, q) => { const [x, y] = p(q); out[i] = { x: 1 - x / w, y: y / h, visibility: .95 }; };
  put(0, [0, F.head[1]]);
  for (const k of ['ls', 'rs', 'le', 're', 'lw', 'rw', 'lh', 'rh', 'lk', 'rk', 'la', 'ra']) put(J[k], F[k]);
  return out;
}
