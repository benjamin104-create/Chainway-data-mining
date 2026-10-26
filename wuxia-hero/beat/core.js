// 律動挑戰的核心（舞蹈篇、武俠篇共用同一份）
//   動作：用「手臂、腿每一段骨頭的方向」定義，跟身高、離鏡頭多遠無關
//   判定：每個動作卡跑到判定圈的前後一小段時間內，取「最像的那一格」打分數
//   譜面：同一首歌、同一個難度，動作數量和拍點固定（排行榜才公平），出哪個動作每次隨機
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
};
// 各難度可以出現的動作
export const POOLS = {
  easy: ['up', 'tee', 'yy', 'discoL', 'discoR', 'muscle', 'clap'],
  normal: ['up', 'tee', 'yy', 'discoL', 'discoR', 'muscle', 'clap', 'heart', 'pointL', 'pointR', 'squat'],
  hard: ['up', 'tee', 'yy', 'discoL', 'discoR', 'muscle', 'clap', 'heart', 'pointL', 'pointR', 'squat', 'kneeL', 'kneeR', 'star'],
};
const LEGGY = new Set(['squat', 'kneeL', 'kneeR', 'star']);

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
  return { arms: { L: pair(A.L, B.L), R: pair(A.R, B.R) }, legs: { L: pair(LA.L, LB.L), R: pair(LA.R, LB.R) }, drop: (a.drop || 0) * (1 - k) + (b.drop || 0) * k };
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
// 一格跟某個動作有多像（0～1）
export function match(f, m, tol = 20) {
  if (!f) return 0;
  const parts = [];
  if (m.arms && !m.armsOff) {
    for (const s of ['l', 'r']) {
      const t = m.arms[s.toUpperCase()];
      parts.push(.4 * seg(f, s + 's', s + 'e', t[0], tol) + .6 * seg(f, s + 'e', s + 'w', t[1], tol));
    }
  }
  if (m.check) parts.push(m.check(f));
  if (!parts.length) return 0;
  const mean = parts.reduce((a, b) => a + b, 0) / parts.length;
  return .6 * mean + .4 * Math.min(...parts);
}

// ── 難度 ──────────────────────────────────────────────
export const DIFF = {
  easy:   { zh: '簡單', en: 'EASY', win: .5, tol: 26, cut: [.72, .52, .34], ahead: 3.6 },
  normal: { zh: '普通', en: 'NORMAL', win: .42, tol: 20, cut: [.78, .58, .4], ahead: 3.1 },
  hard:   { zh: '困難', en: 'HARD', win: .36, tol: 16, cut: [.82, .64, .45], ahead: 2.7 },
};
export const GRADES = [
  { id: 'perfect', en: 'PERFECT', v: 1 },
  { id: 'great', en: 'GREAT', v: .75 },
  { id: 'good', en: 'GOOD', v: .45 },
  { id: 'miss', en: 'MISS', v: 0 },
];

// ── 譜面 ──────────────────────────────────────────────
// 拍點固定（由歌和難度決定）；動作隨機。bars：歌的總小節數，前兩小節倒數、最後一小節收尾
// step：快歌（例如 150 拍的武俠曲）每個動作隔兩倍拍數
export function makeChart(bars, diff, pool, beat, rnd = Math.random, step = 1) {
  const at = [];
  const first = 8, last = (bars - 1) * 4;
  for (let b = first; b < last; ) {
    at.push(b);
    if (diff === 'easy') b += 4 * step;
    else if (diff === 'normal') b += 2 * step;
    else {
      const bar = Math.floor(b / 4);
      b += (bar % 4 === 3 ? 1 : 2) * step;                // 困難：每四小節有一小節一拍一個
    }
  }
  const notes = []; let prev = null, prev2 = null;
  at.forEach((b, i) => {
    const gap = Math.min(i ? b - at[i - 1] : 4 * step, i < at.length - 1 ? at[i + 1] - b : 4 * step) / step;
    // 一拍一個的時候只出手的動作（腳來不及換），蹲下、抬腿之後不接另一個腳的動作
    let cand = pool.filter((m) => m !== prev && !(gap < 2 && LEGGY.has(m)) && !(LEGGY.has(prev) && LEGGY.has(m)));
    if (cand.length > 2) cand = cand.filter((m) => m !== prev2);
    const id = cand[Math.floor(rnd() * cand.length)];
    notes.push({ id, t: b * beat, beat: b, gap: gap * step * beat, best: 0, bestT: 0, res: null });
    prev2 = prev; prev = id;
  });
  return notes;
}
// 判定：時間窗內最像的一格；離拍點太遠會打一點折扣
export function grade(n, d) {
  const W = Math.min(d.win, n.gap * .45);
  const off = Math.abs(n.bestT - n.t), late = clamp((off - W * .5) / (W * .5));
  const q = n.best * (1 - .25 * late);
  const [p, g, o] = d.cut;
  return q >= p ? GRADES[0] : q >= g ? GRADES[1] : q >= o ? GRADES[2] : GRADES[3];
}
export function windowOf(n, d) { return Math.min(d.win, n.gap * .45); }
// 分數：滿分 10000＝準確度 9000＋最高連擊 1000
export function scoreOf(sumV, bestCombo, total) { return Math.round(9000 * sumV / total + 1000 * bestCombo / total); }
export const STAR_AT = [2000, 4000, 6000, 8000, 9300];
export const starsOf = (s) => STAR_AT.filter((x) => s >= x).length;

// 給測試／示範用：把某個動作變成假的 MediaPipe 全身點（還原成未鏡像的 0～1 座標）
export function fakeLandmarks(m, w, h, jitter = 0) {
  const F = figure(m), sc = h * .23, cx = w / 2, cy = h * .3;
  const p = (q) => [cx + q[0] * sc + (Math.random() - .5) * jitter, cy + q[1] * sc + (Math.random() - .5) * jitter];
  const out = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: .2 }));
  const put = (i, q) => { const [x, y] = p(q); out[i] = { x: 1 - x / w, y: y / h, visibility: .95 }; };
  put(0, [0, F.head[1]]);
  for (const k of ['ls', 'rs', 'le', 're', 'lw', 'rw', 'lh', 'rh', 'lk', 'rk', 'la', 'ra']) put(J[k], F[k]);
  return out;
}
