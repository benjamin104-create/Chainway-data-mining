// 律動挑戰：選歌、選難度 → 站到全身入鏡 → 跟著舞者跳 → 自動錄影 → 分數卡、排行榜
//   舞步跟著拍子走：每一拍一個姿勢、重複一到兩小節（像真的跳舞，不是一直換指令）；開始前數「5、6、7、8」
//   參考 Just Dance：大舞者示範、固定編舞（副歌重複）、金色動作、PERFECT/SUPER/GOOD/OK/X、滿分 13333、MEGASTAR
//   參考 Dance Central：做錯的手變紅、一個舞步一個舞步練（Break It Down）、自由舞段落拍照
//   另外：雙人同框對戰、消耗大卡、用自己手機裡的歌（自動抓拍子）
import { FilesetResolver, PoseLandmarker } from './lib/vision_bundle.mjs';
import { MOVES, STEPS, GOLD, POOLS, DIFF, figure, blend, frameOf, match, limbs, energy, makeChart, poseAt, beatScore, grade, windowOf, scoreOf, MAX, STAR_AT, starsOf, analyzeBeat, fakeLandmarks } from './core.js';
import { THEME } from './theme.js';

const $ = (id) => document.getElementById(id);
const M = THEME.music, T = THEME;
const qs = new URLSearchParams(location.search);
const BOT = qs.has('bot') ? Math.min(1, +qs.get('bot') || .9) : 0;          // 測試用：假人自動跳
const poseName = (id) => ({ ...MOVES[id], ...(T.names?.[id] || {}) }).zh;
const stepOf = (id, gold) => (gold ? { zh: T.goldNames?.[id] || GOLD[id]?.zh || 'GOLD', cue: '定格！' } : { ...STEPS[id], ...(T.steps?.[id] || {}) });
const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
const DEVICE = store.get('beatId', '') || (() => { const id = Math.random().toString(36).slice(2, 12); store.set('beatId', id); return id; })();

// ── 選單 ──
function show(id) { for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id; }
const pick = { song: store.get('beatSong', Object.keys(T.songs)[0]), diff: store.get('beatDiff', 'normal'), duo: store.get('beatDuo', '0') === '1' };
if (!T.songs[pick.song]) pick.song = Object.keys(T.songs)[0];
let CUSTOM = null;                                          // 玩家自己的歌 { name, buf, bpm, beat0, duration }
function chips(el, items, key, onPick) {
  el.innerHTML = '';
  for (const [id, label, sub] of items) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.id = id;
    b.innerHTML = `<b>${label}</b>${sub ? `<small>${sub}</small>` : ''}`;
    b.setAttribute('aria-pressed', String(String(pick[key]) === id));
    b.onclick = () => {
      if (id === 'custom' && (!CUSTOM || pick.song === 'custom')) { $('songFile').click(); return; }
      pick[key] = key === 'duo' ? id === 'true' : id;
      if (id !== 'custom') store.set({ song: 'beatSong', diff: 'beatDiff', duo: 'beatDuo' }[key], key === 'duo' ? (pick.duo ? '1' : '0') : id);
      for (const x of el.children) x.setAttribute('aria-pressed', String(x === b)); onPick?.();
    };
    el.append(b);
  }
}
const songLen = (s) => Math.round(s.bars * 4 * 60 / s.bpm * (s.step || 1));
const songItems = () => [
  ...Object.entries(T.songs).map(([id, s]) => [id, s.zh, `${s.vibe}・${songLen(s)} 秒`]),
  ...(T.allowCustom === false ? [] : [['custom', CUSTOM ? `🎵 ${CUSTOM.name}` : '🎵 用自己的歌', CUSTOM ? `${CUSTOM.bpm} BPM・點這裡換一首` : '從手機選一首，自動抓拍子']]),
];
const DIFF_SUB = { easy: '只動手・兩小節換一次', normal: '加上蹲跳', hard: '全身・一小節換一次' };
const DIFF_ITEMS = Object.entries(DIFF).map(([id, d]) => [id, d.zh, DIFF_SUB[id]]);
const renderSongs = () => chips($('songs'), songItems(), 'song');
renderSongs();
chips($('diffs'), DIFF_ITEMS, 'diff');
chips($('players'), [['false', '單人', '可以上排行榜'], ['true', '雙人對戰', '兩個人同一個畫面']], 'duo');
// 自己的歌：解碼、抓拍子
$('songFile').onchange = async () => {
  const f = $('songFile').files?.[0]; $('songFile').value = ''; if (!f) return;
  $('songMsg').textContent = '分析節奏中…'; $('songMsg').hidden = false;
  try {
    const buf = await M.decode(await f.arrayBuffer());
    const ch = buf.getChannelData(0), sr = buf.sampleRate;
    const r = analyzeBeat(ch.length > sr * 120 ? ch.subarray(0, sr * 120) : ch, sr);
    CUSTOM = { name: f.name.replace(/\.[^.]+$/, '').slice(0, 18), buf, bpm: r.bpm, beat0: r.beat0, duration: buf.duration };
    pick.song = 'custom'; renderSongs();
    $('songMsg').textContent = `抓到節奏：每分鐘 ${r.bpm} 拍。自己的歌不列入排行榜；影片會錄進這首歌，分享到社群時請留意版權（IG、抖音可以在平台上另外配樂）。`;
  } catch (e) { console.warn(e); $('songMsg').textContent = '這個檔案打不開，請換 mp3 或 m4a（Apple Music 下載的受保護歌曲不能用）。'; }
};

// ── 模型與相機 ──
const video = $('video'), view = $('view'), ctx = view.getContext('2d');
const S = { pose: null, stream: null, crop: null, phase: 'off', raf: 0 };
let modelP = null;
function loadModel() {
  if (modelP) return modelP;
  modelP = (async () => {
    const fs = await FilesetResolver.forVisionTasks(new URL((T.assets || '') + 'lib/wasm', location.href).href);
    const opts = (delegate) => ({ baseOptions: { modelAssetPath: new URL((T.assets || '') + 'models/pose_landmarker_lite.task', location.href).href, delegate }, runningMode: 'VIDEO', numPoses: 2, minPoseDetectionConfidence: .5, minTrackingConfidence: .5 });
    try { S.pose = await PoseLandmarker.createFromOptions(fs, opts('GPU')); }
    catch { S.pose = await PoseLandmarker.createFromOptions(fs, opts('CPU')); }
  })();
  modelP.catch(() => { modelP = null; });
  return modelP;
}
async function startCamera() {
  if (BOT) { S.vw = 720; S.vh = 1280; return true; }
  if (!navigator.mediaDevices?.getUserMedia) { msg('這個瀏覽器不能開相機，請改用 Safari 或 Chrome 打開。'); return false; }
  try {
    S.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } });
  } catch (e) {
    msg(e.name === 'NotAllowedError' ? '相機權限被拒絕了。請到瀏覽器設定允許這個網站使用相機，再重新整理。' : '打不開相機（' + e.name + '）。');
    return false;
  }
  video.srcObject = S.stream; await video.play();
  S.vw = video.videoWidth; S.vh = video.videoHeight;
  return true;
}
function stopCamera() { S.stream?.getTracks().forEach((t) => t.stop()); S.stream = null; }
function layout() {
  const r = view.parentElement.getBoundingClientRect(), aspect = r.width > 50 ? r.height / r.width : 16 / 9;
  const W = 720, H = Math.round(Math.min(2.2, Math.max(1.3, aspect)) * W);
  view.width = W; view.height = H;
  let cw = S.vw, ch = S.vw * H / W; if (ch > S.vh) { ch = S.vh; cw = S.vh * W / H; }
  S.crop = { sx: (S.vw - cw) / 2, sy: (S.vh - ch) / 2, sw: cw, sh: ch, k: W / cw };
}
function msg(t) { $('msg').textContent = t || ''; $('msg').hidden = !t; }
const toScr = (p) => [(p[0] - S.crop.sx) * S.crop.k, (p[1] - S.crop.sy) * S.crop.k];

// ── 玩家 ──
const G = {};
const newPlayer = (i) => ({ i, f: null, prev: null, sumV: 0, gold: 0, free: 0, freeE: 0, freeN: 0, combo: 0, best: 0, kcal: 0, cards: [], pops: [], n: { perfect: 0, super: 0, good: 0, ok: 0, miss: 0, yeah: 0 } });
const PCOLOR = ['#2ff3ff', '#ff3fd2'];
function assign(frames) {
  const ps = G.players || S.readyPlayers;
  if (ps.length === 1) { ps[0].f = frames.sort((a, b) => b.T - a.T)[0] || null; return; }
  const cx = (f) => toScr(f.hm)[0];
  if (frames.length >= 2) { frames.sort((a, b) => cx(a) - cx(b)); ps[0].f = frames[0]; ps[1].f = frames[1]; }
  else if (frames.length === 1) { const left = cx(frames[0]) < view.width / 2; ps[0].f = left ? frames[0] : null; ps[1].f = left ? null : frames[0]; }
  else ps[0].f = ps[1].f = null;
}

// ── 歌與譜 ──
function songNow() {
  if (pick.song === 'custom' && CUSTOM) {
    const beat = 60 / CUSTOM.bpm, bars = Math.max(12, Math.min(72, Math.floor((CUSTOM.duration - CUSTOM.beat0 - 1) / (4 * beat))));
    const fb = Math.round(bars * .55);
    return { zh: CUSTOM.name, bpm: CUSTOM.bpm, bars, step: 1, free: [fb, fb + 2], color: '#5dffb0', custom: true, secOf: (bar) => (Math.floor((bar - 2) / 8) % 2 ? 'c' : 'v') };
  }
  return T.songs[pick.song];
}
function chartFor() {
  const song = songNow(), beat = 60 / song.bpm * (song.step || 1);
  const seed = song.custom ? 'custom:' + song.zh : pick.song;
  return { song, beat, ...makeChart(song.bars, pick.diff, POOLS[pick.diff], beat, seed, song.free || [20, 22], { secOf: song.secOf }) };
}
async function playSong() {
  if (pick.song === 'custom' && CUSTOM) return M.playBuffer(CUSTOM.buf, CUSTOM.beat0);
  const s = T.songs[pick.song];
  if (s.file) {                                                  // AI 做的歌（音檔放在 songs/）
    s.buf ||= await M.decode(await (await fetch(s.file)).arrayBuffer());
    if (s.beat0 == null || !s.bpm) { const r = analyzeBeat(s.buf.getChannelData(0), s.buf.sampleRate); s.bpm ||= r.bpm; s.beat0 ??= r.beat0; }
    return M.playBuffer(s.buf, s.beat0);
  }
  return M.play(pick.song);
}

// ── 進場 ──
async function enterPlay(practice) {
  M.unlock();
  show('sPlay'); msg(''); $('ready').hidden = false; $('readyText').textContent = '載入中…'; $('practiceBar').hidden = true;
  try { if (!BOT) await loadModel(); } catch (e) { console.warn(e); msg('動作辨識載入失敗，請重新整理再試一次。'); return; }
  if (!(await startCamera())) return;
  layout();
  S.mode = practice ? 'practice' : 'play';
  S.duo = !practice && pick.duo;
  S.readyPlayers = Array.from({ length: S.duo ? 2 : 1 }, (_, i) => newPlayer(i));
  G.players = null;
  S.phase = 'ready'; S.readySince = 0;
  cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(loop);
}
async function begin() {
  if (S.phase !== 'ready') return;
  S.phase = 'starting';
  $('ready').hidden = true;
  if (S.mode === 'practice') return beginPractice();
  const c = chartFor(), d = DIFF[pick.diff];
  Object.assign(G, { ...c, songId: pick.song, diffId: pick.diff, d, players: S.readyPlayers, flash: 0, end: c.song.bars * 4 * c.beat,
    freeSaid: false, done: false, finishAt: 0, rec: null, snaps: [], wantSnap: 0, lastT: 0, freeSnap: false, cueBeat: -1 });
  for (const p of G.players) p.cards = G.cards.map((cd) => ({ bests: cd.beats.map(() => ({ q: 0, t: null })), res: null, snapped: false }));
  try { G.t0 = await playSong(); } catch (e) { console.warn(e); msg('音樂載入失敗，請重新整理再試一次。'); return; }
  S.phase = 'play';
  startRec();
}
function quit() {
  S.phase = 'off'; cancelAnimationFrame(S.raf); M.stop(.2); stopRec(true); stopCamera(); show('sHome');
}
const now = () => M.clock() - G.t0;

// ── 每一格 ──
function loop() {
  S.raf = requestAnimationFrame(loop);
  const W = view.width, H = view.height, u = W / 720;
  const ps = G.players || S.readyPlayers;
  let all = [];
  if (BOT) all = botLandmarks(ps.length);
  else if (S.pose && video.readyState >= 2) {
    try { const r = S.pose.detectForVideo(video, performance.now()); all = r.landmarks || []; } catch {}
  }
  assign(all.map((l) => frameOf(l, S.vw, S.vh)).filter(Boolean));
  // 底圖
  ctx.save(); ctx.fillStyle = T.ink; ctx.fillRect(0, 0, W, H);
  if (BOT) { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a1450'); g.addColorStop(1, '#09040f'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  else if (video.readyState >= 2) {
    const c = S.crop; ctx.translate(W, 0); ctx.scale(-1, 1);
    ctx.filter = 'contrast(1.08) saturate(1.15) brightness(1.04)'; ctx.drawImage(video, c.sx, c.sy, c.sw, c.sh, 0, 0, W, H); ctx.filter = 'none';
  }
  ctx.restore();
  if (G.wantSnap && S.phase === 'play' && G.snaps.length < 4) { G.wantSnap = 0; snap(); }
  const vg = ctx.createRadialGradient(W / 2, H * .45, H * .3, W / 2, H * .45, H * .8); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, T.vignette || 'rgba(10,0,25,.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  if (S.phase === 'ready') return readyStep(ps, W, H, u);
  if (S.phase === 'practice') return practiceStep(ps[0], W, H, u);
  if (S.phase !== 'play') return;
  const t = now(), dt = Math.max(0, Math.min(.1, t - G.lastT)); G.lastT = t;
  const Wb = windowOf(G.beat, G.d);
  for (const p of ps) {
    // 消耗大卡：動得越多 MET 越高（站著約 2.5，用力跳約 9），以 60 公斤估算
    const e = energy(p.f, p.prev); p.prev = p.f;
    if (dt > 0) { const met = 2.5 + Math.min(6.5, (e / dt) * .9); p.kcal += met * 60 * dt / 3600; }
    if (inFree(t)) { p.freeE += e; p.freeN += dt; p.free = Math.min(1, (p.freeE / Math.max(.5, p.freeN)) / 2.2); }
    G.cards.forEach((c, ci) => {
      const s = p.cards[ci];
      if (s.res || t < c.t0 - Wb) return;
      c.beats.forEach((b, bi) => {
        if (!b.pose || Math.abs(t - b.t) > Wb || !p.f) return;
        const q = beatScore(p.f, c, bi, G.d.tol);
        if (q > s.bests[bi].q) { s.bests[bi] = { q, t }; }
        if (c.gold && !s.snapped && q >= G.d.cut[1]) { s.snapped = true; G.wantSnap = 1; }
      });
      const lastPose = [...c.beats].reverse().find((b) => b.pose);
      if (t > lastPose.t + Wb) judge(p, c, s);
    });
  }
  if (G.free && !G.freeSnap && t > (G.free.t0 + G.free.t1) / 2) { G.freeSnap = true; G.wantSnap = 1; }
  // 畫面
  const cur = G.cards.find((c) => t >= c.t0 - G.beat * .5 && t < c.t1);
  for (const p of ps) {
    let mv = null;
    if (cur) { const bi = Math.round((t - cur.t0) / G.beat), b = cur.beats[bi]; if (b?.pose && Math.abs(t - b.t) <= Wb) mv = MOVES[b.pose]; }
    skeleton(p.f, u, { color: S.duo ? PCOLOR[p.i] : null, move: mv, tol: G.d.tol, free: inFree(t) });
  }
  if (G.flash > 0) { ctx.fillStyle = `rgba(255,215,90,${G.flash * .3})`; ctx.fillRect(0, 0, W, H); G.flash *= .88; }
  coach(t, W, H, u);
  lane(t, W, H, u);
  hud(t, W, H, u);
  freeBanner(t, W, H, u);
  countdown(t, W, H, u);
  for (const p of ps) popsOf(p, W, H, u);
  if (t > G.end - G.beat * 2 && !G.done) { G.done = true; G.finishAt = performance.now(); M.cheer(); M.stop(2.5); }
  if (G.done) finishCard(W, H, u, (performance.now() - G.finishAt) / 1000);
}
const inFree = (t) => G.free && t >= G.free.t0 && t < G.free.t1;
function judge(p, c, s) {
  const g = grade(c, s.bests, G.d, G.beat); s.res = g.id;
  p.n[g.id]++;
  if (c.gold) { if (g.id === 'yeah') { p.gold++; G.flash = 1; } }
  else p.sumV += g.v * c.len;
  if (g.id === 'miss') p.combo = 0; else { p.combo++; p.best = Math.max(p.best, p.combo); }
  M.hit(g.id);
  p.pops.push({ g, born: performance.now() });
}
function botLandmarks(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    let target = S.phase === 'ready' ? MOVES.up : MOVES.down;
    if (S.phase === 'play') {
      const t = now();
      // 假人：大部分時候跟著教練跳（稍微晚一點點）
      if (Math.random() < BOT + .05 - i * .15) target = poseAt(G, t - .05, G.beat);
      if (inFree(t)) target = blend(MOVES.yy, MOVES.squatClap, (Math.sin(t * 9) + 1) / 2);
    }
    if (S.phase === 'practice' && P.step) target = P.botPose || MOVES.down;
    out.push(fakeLandmarks(target, S.vw, S.vh, (1 - BOT) * 140 + 4, n === 1 ? .5 : (i ? .7 : .3)));
  }
  return out;
}

// ── 準備：全身入鏡 ──
function readyStep(ps, W, H, u) {
  const legs = pick.diff !== 'easy';
  const need = ['ls', 'rs', 'lh', 'rh', ...(legs ? ['lk', 'rk', 'la', 'ra'] : ['lk', 'rk'])];
  const okP = (f) => f && need.every((k) => f.V[k] > .55) && (() => { const ys = need.map((k) => toScr(f.P[k])[1]); return Math.min(...ys) > H * .05 && Math.max(...ys) < H * .97; })();
  for (const p of ps) skeleton(p.f, u, { color: okP(p.f) ? '#5dffb0' : (S.duo ? PCOLOR[p.i] : null), strong: true });
  const ok = ps.every((p) => okP(p.f));
  const t = performance.now();
  if (ok) { S.readySince ||= t; } else S.readySince = 0;
  const k = S.readySince ? Math.min(1, (t - S.readySince) / 1200) : 0;
  const slots = ps.length === 1 ? [W / 2] : [W * .3, W * .7];
  slots.forEach((x, i) => {
    ctx.save(); ctx.translate(x, H * .22); const sc = H * (ps.length === 1 ? .2 : .15);
    ctx.globalAlpha = .22 + .3 * k; drawFigure(ctx, figure(MOVES.up), 0, 0, sc, okP(ps[i].f) ? '#5dffb0' : '#ffffff', 6 * u, false);
    if (ps.length > 1) text(ctx, `${i + 1}P`, 0, -sc * .9, 48 * u, PCOLOR[i]);
    ctx.restore();
  });
  const where = legs ? '讓頭到腳都進畫面' : '讓上半身到膝蓋都進畫面';
  $('readyText').textContent = ok ? (k < 1 ? '很好，保持不動…' : '開始！')
    : ps.length > 1 ? `兩個人並排站，左邊 1P、右邊 2P，${where}，雙手舉高` : `手機直立放好，退後幾步，${where}，雙手舉高`;
  $('readyBar').style.width = (k * 100) + '%';
  if (k >= 1) begin();
}

// ── 練習（像 Dance Central 的 Break It Down）：一個舞步一個舞步學，慢速、有節拍器；連續 4 拍做對才換下一個 ──
const P = {};
function beginPractice() {
  const c = chartFor(), list = [...new Set([...c.verse, ...c.chorus])];
  const beat = Math.max(.75, c.beat * 1.35);                  // 比原曲慢
  Object.assign(P, { list, i: 0, beat, t0: performance.now() / 1000 + 1.2, streak: 0, best: 0, lastBeat: -1, done: false, song: c.song, d: DIFF[pick.diff] });
  loadStep();
  $('practiceBar').hidden = false; syncPractice();
  S.phase = 'practice';
}
function loadStep() {
  const id = P.list[P.i]; P.step = id;
  P.card = { id, gold: false, beats: STEPS[id].beats.concat(STEPS[id].beats).map((pose, i) => ({ pose, t: i })) };
  P.t0 = performance.now() / 1000 + .8; P.streak = 0; P.lastBeat = -1; P.best = 0; P.marks = [];
}
function syncPractice() { $('practiceStep').textContent = P.done ? '全部練完了！' : `第 ${P.i + 1}／${P.list.length} 個舞步`; $('practiceNext').textContent = P.done ? '上場跳一次' : '跳過這個'; }
function practiceStep(p, W, H, u) {
  if (P.done) { text(ctx, '練完了！', W / 2, H * .35, 110 * u, ['#ffffff', '#ffe36b'], { skew: true }); text(ctx, '按下面「上場跳一次」', W / 2, H * .45, 44 * u, '#fff'); return; }
  const t = performance.now() / 1000 - P.t0, bt = t / P.beat, k = Math.round(bt), n = STEPS[P.step].beats.length;
  const target = STEPS[P.step].beats[((k % n) + n) % n];
  // 教練動作（慢速）
  const kk = Math.floor(bt), ph = bt - kk, e = ph < .45 ? 0 : (ph - .45) / .55;
  const pose = blend(MOVES[STEPS[P.step].beats[((kk % n) + n) % n]], MOVES[STEPS[P.step].beats[(((kk + 1) % n) + n) % n]], e * e * (3 - 2 * e));
  P.botPose = pose;
  // 這一拍的判定：拍點前後 0.35 拍內最像的
  const card = { gold: false, beats: STEPS[P.step].beats.map((pz) => ({ pose: pz })) };
  if (t >= 0 && Math.abs(bt - k) < .35 && p.f) P.best = Math.max(P.best, beatScore(p.f, card, ((k % n) + n) % n, P.d.tol));
  if (t >= 0 && k !== P.lastBeat && bt - k > .35) {
    if (P.lastBeat >= 0 || k === 0) {
      const ok = P.best >= P.d.cut[1];
      P.streak = ok ? P.streak + 1 : 0; P.marks.push(ok);
      M.tick?.(ok);
    }
    P.lastBeat = k; P.best = 0;
  }
  if (Math.abs(bt - Math.round(bt)) < .03 && P.tickAt !== Math.round(bt)) { P.tickAt = Math.round(bt); M.metro?.(Math.round(bt) % n === 0); }
  skeleton(p.f, u, { move: MOVES[target], tol: P.d.tol });
  const st = stepOf(P.step);
  // 大舞者
  const bw = 300 * u, bh = 430 * u, bx = W - bw - 14 * u, by = 100 * u;
  ctx.save(); ctx.fillStyle = 'rgba(12,4,30,.6)'; roundRect(ctx, bx, by, bw, bh, 26 * u); ctx.fill(); ctx.strokeStyle = P.song.color; ctx.lineWidth = 2 * u; ctx.stroke();
  drawFigure(ctx, figure(pose), bx + bw / 2, by + 120 * u + bounce(bt) * 10 * u, 90 * u, T.figure, 9 * u, true);
  text(ctx, poseName(target), bx + bw / 2, by + bh - 34 * u, 34 * u, '#fff', { stroke: false });
  ctx.restore();
  text(ctx, st.zh, W / 2, H - 300 * u, 76 * u, ['#ffffff', P.song.color], { skew: true });
  text(ctx, st.cue, W / 2, H - 225 * u, 40 * u, '#fff');
  // 4 個格子：連續做對 4 拍就過關
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(W / 2 + (i - 1.5) * 70 * u, H - 160 * u, 22 * u, 0, Math.PI * 2); ctx.fillStyle = i < P.streak ? '#5dffb0' : 'rgba(255,255,255,.2)'; ctx.fill(); }
  text(ctx, P.streak ? `連續 ${P.streak} 拍做對！` : '跟著右上的舞者，聽節拍器一拍一個動作', W / 2, H - 110 * u, 30 * u, P.streak ? '#5dffb0' : 'rgba(255,255,255,.85)', { stroke: false });
  if (P.streak >= 4) { M.hit('perfect'); P.i++; if (P.i >= P.list.length) { P.done = true; M.cheer(); } else loadStep(); syncPractice(); }
}
const bounce = (bt) => Math.abs(Math.sin(Math.PI * bt));     // 每一拍往下彈一下

// ── 畫圖 ──
const FL = T.font.latin, FC = T.font.cjk;
const isCJK = (s) => /[㐀-鿿]/.test(s);
function text(c, s, x, y, px, fill, opt = {}) {
  c.save(); c.globalAlpha = Math.max(0, Math.min(1, opt.a ?? 1));
  c.translate(x, y); if (opt.skew) c.transform(1, 0, -.15, 1, 0, 0); if (opt.scale) c.scale(opt.scale, opt.scale);
  c.font = isCJK(s) ? `900 ${px}px ${FC}` : `400 ${px * 1.12}px ${FL}`;
  c.textAlign = opt.align || 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  if (opt.stroke !== false) { c.lineWidth = px * .2; c.strokeStyle = opt.strokeColor || 'rgba(10,0,25,.9)'; c.strokeText(s, 0, 0); }
  if (Array.isArray(fill)) { const g = c.createLinearGradient(0, -px * .5, 0, px * .5); fill.forEach((col, i) => g.addColorStop(i / (fill.length - 1), col)); c.fillStyle = g; } else c.fillStyle = fill;
  c.fillText(s, 0, 0); c.restore();
}
function drawFigure(c, F, x, y, sc, color, lw, glow) {
  const p = (q) => [x + q[0] * sc, y + q[1] * sc];
  const bones = [['ls', 'rs'], ['ls', 'lh'], ['rs', 'rh'], ['lh', 'rh'], ['ls', 'le'], ['le', 'lw'], ['rs', 're'], ['re', 'rw'], ['lh', 'lk'], ['lk', 'la'], ['rh', 'rk'], ['rk', 'ra']];
  c.save(); c.lineCap = c.lineJoin = 'round'; c.strokeStyle = c.fillStyle = color; c.lineWidth = lw;
  if (glow) { c.shadowColor = color; c.shadowBlur = lw * 2; }
  c.beginPath(); for (const k of ['ls', 'rs', 'rh', 'lh']) c.lineTo(...p(F[k])); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); for (const [a, b] of bones.slice(4)) { c.moveTo(...p(F[a])); c.lineTo(...p(F[b])); } c.lineWidth = lw * 1.6; c.stroke();
  c.beginPath(); c.arc(...p(F.head), F.hr * sc, 0, Math.PI * 2); c.fill();
  c.restore();
}
// 身上的骨架線：在拍點上，對的手變綠、錯的手變紅（Dance Central 的做法）
const GOOD_C = '#5dffb0', BAD_C = '#ff4d5e';
function skeleton(f, u, o = {}) {
  if (!f) return;
  const base = o.color || (o.strong ? 'rgba(93,255,176,.85)' : (T.skel || 'rgba(47,243,255,.55)'));
  const l = o.move ? limbs(f, o.move, o.tol) : {};
  const col = (v) => (v == null ? base : v >= .7 ? GOOD_C : v < .45 ? BAD_C : base);
  const groups = [
    [base, [['ls', 'rs'], ['ls', 'lh'], ['rs', 'rh'], ['lh', 'rh']]],
    [col(l.L), [['ls', 'le'], ['le', 'lw']]],
    [col(l.R), [['rs', 're'], ['re', 'rw']]],
    [col(l.X), [['lh', 'lk'], ['lk', 'la'], ['rh', 'rk'], ['rk', 'ra']]],
  ];
  ctx.save(); ctx.lineCap = 'round';
  for (const [c, bones] of groups) {
    const hot = c === GOOD_C || c === BAD_C;
    ctx.lineWidth = (o.strong || hot ? 8 : 5) * u * (o.free ? 1.6 : 1); ctx.strokeStyle = c; ctx.shadowColor = hot ? c : (o.color || T.skelGlow || '#2ff3ff'); ctx.shadowBlur = (o.free ? 30 : 12) * u;
    ctx.beginPath();
    for (const [a, b] of bones) if (f.V[a] > .5 && f.V[b] > .5) { ctx.moveTo(...toScr(f.P[a])); ctx.lineTo(...toScr(f.P[b])); }
    ctx.stroke();
  }
  ctx.restore();
}
// 大舞者（像 Just Dance）：每一拍準時到位、跟著節奏上下彈；下面的 8 個點是「一個八拍」數到哪
function coach(t, W, H, u) {
  const free = inFree(t), bt = t / G.beat;
  const pose = free ? blend(MOVES.yy, MOVES.squatClap, (Math.sin(Math.PI * bt) + 1) / 2) : poseAt(G, t, G.beat);
  const c = G.cards.find((x) => t < x.t1), gold = c?.gold && t > c.t0 - G.beat * 4;
  const bw = 270 * u, bh = 420 * u, bx = S.duo ? (W - bw) / 2 : W - bw - 14 * u, by = 104 * u;
  ctx.save();
  const bg = ctx.createLinearGradient(0, by, 0, by + bh); bg.addColorStop(0, gold ? 'rgba(90,60,0,.6)' : 'rgba(12,4,30,.6)'); bg.addColorStop(1, 'rgba(12,4,30,.25)');
  ctx.fillStyle = bg; roundRect(ctx, bx, by, bw, bh, 26 * u); ctx.fill();
  ctx.strokeStyle = gold ? '#ffd23a' : G.song.color; ctx.lineWidth = (gold ? 4 : 2) * u; ctx.stroke();
  const fc = gold ? '#ffd23a' : T.figure;
  drawFigure(ctx, figure(pose), bx + bw / 2, by + 110 * u + (t > 0 ? bounce(bt) * 10 * u : 0), 84 * u, fc, 8 * u, true);
  // 八拍
  if (t > 0) {
    const k = Math.floor(bt + .5) % 8;
    for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(bx + bw / 2 + (i - 3.5) * 26 * u, by + bh - 30 * u, (i === k ? 9 : 6) * u, 0, Math.PI * 2); ctx.fillStyle = i === k ? '#fff' : 'rgba(255,255,255,.3)'; ctx.fill(); }
  }
  ctx.restore();
}
function roundRect(c, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
// 舞步卡跑道：一張卡＝一個舞步跳一到兩小節，卡上的小點是拍子；正在跳的卡顯示大字和口訣
function lane(t, W, H, u) {
  const cy = H - 175 * u, hx = 90 * u, ch = 150 * u, ahead = G.beat * 10, span = W - hx;
  const X = (tt) => hx + (tt - t) / ahead * span;
  ctx.save();
  const g = ctx.createLinearGradient(0, cy - 110 * u, 0, cy + 110 * u); g.addColorStop(0, 'rgba(12,4,30,0)'); g.addColorStop(.5, 'rgba(12,4,30,.65)'); g.addColorStop(1, 'rgba(12,4,30,0)');
  ctx.fillStyle = g; ctx.fillRect(0, cy - 110 * u, W, 220 * u);
  if (G.free) {
    const x0 = X(G.free.t0), x1 = X(G.free.t1);
    if (x1 > 0 && x0 < W) {
      const rg = ctx.createLinearGradient(x0, 0, x1, 0); ['#ff3fd2', '#ffcf2e', '#5dffb0', '#2ff3ff'].forEach((c, i) => rg.addColorStop(i / 3, c));
      ctx.globalAlpha = .55; ctx.fillStyle = rg; roundRect(ctx, Math.max(x0, 0), cy - ch / 2, Math.max(0, x1 - Math.max(x0, 0)), ch, 20 * u); ctx.fill(); ctx.globalAlpha = 1;
      text(ctx, 'FREESTYLE', Math.max(x0, hx) + 20 * u, cy, 36 * u, '#fff', { align: 'left' });
    }
  }
  const p0 = G.players[0];
  G.cards.forEach((c, ci) => {
    const x0 = X(c.t0), x1 = X(c.t1) - 8 * u;
    if (x1 < -20 || x0 > W) return;
    const res = p0.cards[ci].res, live = t >= c.t0 - G.beat * .5 && t < c.t1;
    const [c1, c2] = c.gold ? ['#fff3a8', '#e0a000'] : T.card(c.id);
    ctx.save(); ctx.globalAlpha = res ? .35 : 1;
    if (c.gold) { ctx.shadowColor = '#ffd23a'; ctx.shadowBlur = 24 * u; }
    const gg = ctx.createLinearGradient(0, cy - ch / 2, 0, cy + ch / 2); gg.addColorStop(0, c1); gg.addColorStop(1, c2);
    roundRect(ctx, x0, cy - ch / 2, x1 - x0, ch, 20 * u); ctx.fillStyle = gg; ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = (live ? 5 : 2) * u; ctx.strokeStyle = live ? '#fff' : 'rgba(255,255,255,.5)'; ctx.stroke();
    // 卡上：兩個小人（舞步的兩個姿勢）＋名稱
    const fc = c.gold ? '#5a3b00' : '#fff', st = stepOf(c.id, c.gold);
    const poses = c.gold ? [c.id] : STEPS[c.id].beats;
    const lx = Math.max(x0, Math.min(hx + 10 * u, x1 - 200 * u));          // 正在跳的卡，小人停在判定線旁邊
    poses.slice(0, 2).forEach((pz, i) => drawFigure(ctx, figure(MOVES[pz]), lx + 46 * u + i * 76 * u, cy - 26 * u, 26 * u, fc, 3.5 * u, false));
    if (x1 - lx > 200 * u) text(ctx, st.zh, lx + 180 * u, cy - 22 * u, 34 * u, fc, { align: 'left', stroke: false });
    if (x1 - lx > 200 * u) text(ctx, c.gold ? 'GOLD MOVE' : st.cue, lx + 180 * u, cy + 18 * u, 22 * u, fc, { align: 'left', stroke: false, a: .85 });
    // 拍點
    c.beats.forEach((b, bi) => {
      if (!b.pose) return; const bx = X(b.t); if (bx < x0 || bx > x1) return;
      const sc = p0.cards[ci].bests[bi].q, passed = t > b.t + windowOf(G.beat, G.d);
      ctx.beginPath(); ctx.arc(bx, cy + ch / 2 - 18 * u, 7 * u, 0, Math.PI * 2);
      ctx.fillStyle = passed ? (sc >= G.d.cut[1] ? GOOD_C : sc >= G.d.cut[3] ? '#ffe36b' : BAD_C) : 'rgba(255,255,255,.75)'; ctx.fill();
    });
    ctx.restore();
  });
  // 判定線（隨拍子呼吸）
  const pulse = 1 - (((t / G.beat) % 1) + 1) % 1;
  ctx.fillStyle = '#fff'; ctx.shadowColor = G.song.color; ctx.shadowBlur = 24 * u * pulse;
  ctx.fillRect(hx - 3 * u, cy - ch / 2 - 14 * u, 6 * u, ch + 28 * u); ctx.shadowBlur = 0;
  ctx.restore();
  // 正在跳的舞步：大字＋口訣（在跑道上方）
  const cur = G.cards.find((c) => t >= c.t0 - G.beat && t < c.t1);
  const nxt = cur ? G.cards[G.cards.indexOf(cur) + 1] : G.cards.find((c) => c.t0 > t);
  if (cur) {
    const st = stepOf(cur.id, cur.gold), k = Math.floor((t - cur.t0) / G.beat);
    text(ctx, st.zh, 24 * u, cy - ch / 2 - 64 * u, 54 * u, cur.gold ? ['#ffffff', '#ffd23a'] : ['#ffffff', G.song.color], { align: 'left', skew: true });
    if (!cur.gold && k >= 0) {
      const b = cur.beats[k]; if (b?.pose) text(ctx, poseName(b.pose), 24 * u, cy - ch / 2 - 22 * u, 28 * u, '#fff', { align: 'left' });
    }
  }
  if (nxt && (!cur || t > cur.t1 - G.beat * 2.5)) text(ctx, `下一個：${stepOf(nxt.id, nxt.gold).zh}`, W - 24 * u, cy - ch / 2 - 22 * u, 28 * u, nxt.gold ? '#ffd23a' : '#fff', { align: 'right' });
}
function hud(t, W, H, u) {
  const ps = G.players;
  ps.forEach((p, i) => {
    const score = scoreOf(p, G), top = 36 * u + i * 30 * u;
    const bx = 24 * u, bw = W - 48 * u, bh = 12 * u, k = Math.min(1, score / MAX);
    ctx.save();
    roundRect(ctx, bx, top, bw, bh, bh / 2); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fill();
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0); (S.duo ? ['#ffffff', PCOLOR[i]] : (T.bar || ['#7b2ff7', '#f107a3', '#ffcf2e'])).forEach((c, j, a) => g.addColorStop(j / (a.length - 1), c));
    if (k > 0) { roundRect(ctx, bx, top, Math.max(bh, bw * k), bh, bh / 2); ctx.fillStyle = g; ctx.fill(); }
    STAR_AT.slice(0, 5).forEach((s) => star(bx + bw * s / MAX, top + bh / 2, 14 * u, score >= s));
    crown(bx + bw * 12000 / MAX, top + bh / 2, 16 * u, score >= 12000);
    ctx.restore();
  });
  const y0 = 36 * u + ps.length * 30 * u + 30 * u;
  if (S.duo) {
    ps.forEach((p, i) => {
      const x = i ? W - 24 * u : 24 * u, al = i ? 'right' : 'left';
      text(ctx, `${i + 1}P ${scoreOf(p, G)}`, x, y0, 40 * u, ['#ffffff', PCOLOR[i]], { align: al });
      if (p.combo >= 3) text(ctx, `${p.combo} COMBO`, x, y0 + 40 * u, 26 * u, PCOLOR[i], { align: al, skew: true });
    });
  } else {
    const p = ps[0];
    text(ctx, String(scoreOf(p, G)).padStart(5, '0'), 24 * u, y0, 46 * u, ['#ffffff', '#ffe36b'], { align: 'left' });
    text(ctx, `${G.song.zh}・${G.d.zh}`, 24 * u, y0 + 40 * u, 24 * u, '#fff', { align: 'left' });
    if (p.combo >= 3) text(ctx, `${p.combo} COMBO`, 24 * u, y0 + 80 * u, 32 * u, ['#ffffff', G.song.color], { align: 'left', skew: true });
    text(ctx, `🔥 ${p.kcal.toFixed(1)} kcal`, 24 * u, y0 + 118 * u, 22 * u, 'rgba(255,255,255,.8)', { align: 'left', stroke: false });
  }
  const pr = Math.max(0, Math.min(1, t / G.end));
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(0, H - 6 * u, W * pr, 6 * u);
}
function star(x, y, r, on) {
  ctx.save(); ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fillStyle = on ? '#ffd23a' : 'rgba(30,20,50,.9)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = on ? '#fff6c2' : 'rgba(255,255,255,.5)'; ctx.stroke(); ctx.restore();
}
function crown(x, y, r, on) {
  ctx.save(); ctx.beginPath();
  ctx.moveTo(x - r, y + r * .6); ctx.lineTo(x - r, y - r * .5); ctx.lineTo(x - r * .5, y); ctx.lineTo(x, y - r * .8); ctx.lineTo(x + r * .5, y); ctx.lineTo(x + r, y - r * .5); ctx.lineTo(x + r, y + r * .6); ctx.closePath();
  ctx.fillStyle = on ? '#ff5ad8' : 'rgba(30,20,50,.9)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = on ? '#ffe0f7' : 'rgba(255,255,255,.5)'; ctx.stroke(); ctx.restore();
}
function freeBanner(t, W, H, u) {
  if (!G.free) return;
  const lead = G.free.t0 - t;
  if (lead > 0 && lead < G.beat * 4) text(ctx, '自由舞要來了！', W / 2, H * .55, 46 * u, '#fff', { a: Math.min(1, (G.beat * 4 - lead) * 2) });
  if (!inFree(t)) return;
  const k = (t - G.free.t0) / (G.free.t1 - G.free.t0), b = (((t / G.beat) % 1) + 1) % 1;
  if (!G.freeSaid) { G.freeSaid = true; M.go(); }
  text(ctx, 'FREESTYLE!', W / 2, H * .5, 120 * u, ['#ffffff', '#ffcf2e', '#ff3fd2'], { skew: true, scale: 1 + (1 - b) * .08 });
  text(ctx, T.freeHint || '自由發揮！動越大分越高', W / 2, H * .58, 38 * u, '#fff');
  G.players.forEach((p, i) => {
    const w = S.duo ? W * .38 : W * .6, x = S.duo ? (i ? W * .56 : W * .06) : W * .2, y = H * .63;
    roundRect(ctx, x, y, w, 18 * u, 9 * u); ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fill();
    roundRect(ctx, x, y, Math.max(18 * u, w * p.free), 18 * u, 9 * u); ctx.fillStyle = S.duo ? PCOLOR[i] : '#ffcf2e'; ctx.fill();
  });
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(0, H * .66, W * (1 - k), 4 * u);
}
// 開場：第一小節標題，第二小節像舞蹈老師一樣數「5、6、7、8」
function countdown(t, W, H, u) {
  const b = t / G.beat;
  if (b < -1 || b >= 8.6) return;
  if (b < 4) { text(ctx, T.title, W / 2, H * .4, 72 * u, ['#ffffff', G.song.color], { skew: true }); text(ctx, '跟著右上的舞者，一拍一個動作', W / 2, H * .47, 32 * u, '#fff'); return; }
  if (b >= 8) { const k = (b - 8) / .6; text(ctx, 'DANCE!', W / 2, H * .42, 150 * u, ['#ffffff', '#ffe36b', '#ff7a00'], { scale: 1 + k * .5, a: 1 - k, skew: true }); return; }
  const lab = ['5', '6', '7', '8'][Math.floor(b - 4)], k = b % 1;
  text(ctx, lab, W / 2, H * .42, 200 * u, ['#ffffff', G.song.color], { scale: 1.4 - Math.min(.4, k * 1.6), a: 1 - Math.max(0, k - .7) / .3, skew: true });
}
function popsOf(p, W, H, u) {
  const nowMs = performance.now();
  p.pops = p.pops.filter((x) => nowMs - x.born < 800);
  const x0 = S.duo ? (p.i ? W * .72 : W * .28) : W * .36;
  const q = p.pops[p.pops.length - 1]; if (!q) return;
  const k = (nowMs - q.born) / 800, sc = k < .15 ? .6 + k / .15 * .6 : 1.2 - Math.min(.2, (k - .15));
  text(ctx, q.g.en, x0, H * .34, (S.duo ? 72 : 92) * u * (q.g.id === 'yeah' ? 1.3 : 1), T.grade[q.g.id], { scale: sc, a: 1 - Math.max(0, k - .6) / .4, skew: true });
}
function snap() {
  const c = document.createElement('canvas'); c.width = 240; c.height = Math.round(240 * view.height / view.width);
  c.getContext('2d').drawImage(view, 0, 0, c.width, c.height); G.snaps.push(c);
}
// 結束：分數卡（也會錄進影片裡）
function finishCard(W, H, u, s) {
  const a = Math.min(1, s / .5);
  ctx.save(); ctx.fillStyle = `rgba(8,2,22,${.8 * a})`; ctx.fillRect(0, 0, W, H); ctx.restore();
  text(ctx, 'FINISH!', W / 2, H * .13, 110 * u, ['#ffffff', '#ffe36b', '#ff7a00'], { a, skew: true, scale: 1.3 - .3 * Math.min(1, s / .4) });
  if (s > .6) {
    const sc = Math.min(1, (s - .6) / .8);
    if (S.duo) {
      const [a1, a2] = G.players.map((p) => scoreOf(p, G)), win = a1 === a2 ? -1 : a1 > a2 ? 0 : 1;
      G.players.forEach((p, i) => {
        const x = W * (i ? .73 : .27), sco = scoreOf(p, G);
        text(ctx, `${i + 1}P`, x, H * .25, 50 * u, PCOLOR[i]);
        text(ctx, String(Math.round(sco * sc)), x, H * .33, 96 * u, ['#ffffff', PCOLOR[i]], { skew: true });
        if (s > 1.6) text(ctx, T.ranks[starsOf(sco)], x, H * .41, 38 * u, '#fff');
        if (s > 1.9 && win === i) text(ctx, 'WIN!', x, H * .47, 70 * u, ['#ffffff', '#ffe36b', '#ff7a00'], { skew: true, scale: 1 + .2 * Math.max(0, 1 - (s - 1.9) * 4) });
      });
      if (s > 1.9 && win < 0) text(ctx, 'DRAW!', W / 2, H * .47, 70 * u, ['#ffffff', '#ffe36b']);
    } else {
      const p = G.players[0], score = scoreOf(p, G), st = starsOf(score);
      text(ctx, String(Math.round(score * sc)), W / 2, H * .27, 140 * u, ['#ffffff', G.song.color], { skew: true });
      for (let i = 0; i < 5; i++) { const on = i < st && s > 1 + i * .15; star(W / 2 + (i - 2) * 80 * u, H * .36, (on ? 34 : 28) * u, on); }
      if (s > 1.9) text(ctx, T.ranks[st], W / 2, H * .43, 60 * u, st >= 6 ? ['#ffffff', '#ff5ad8'] : ['#ffffff', '#ffe36b'], { scale: 1 + .2 * Math.max(0, 1 - (s - 1.9) * 4), skew: st >= 6 });
      if (s > 2.2) {
        const rows = [['PERFECT', p.n.perfect, 'perfect'], ['SUPER', p.n.super, 'super'], ['GOOD', p.n.good, 'good'], ['OK', p.n.ok, 'ok'], ['X', p.n.miss, 'miss'], ['GOLD', p.n.yeah, 'yeah']];
        rows.forEach(([k, v, id], i) => text(ctx, `${k} ${v}`, W / 2 + ((i % 3) - 1) * 210 * u, H * .5 + Math.floor(i / 3) * 46 * u, 30 * u, T.grade[id]));
        text(ctx, `MAX COMBO ${p.best}　🔥 ${p.kcal.toFixed(1)} kcal`, W / 2, H * .5 + 98 * u, 28 * u, '#fff');
      }
    }
    if (s > 2.5 && G.snaps.length) {
      const n = Math.min(3, G.snaps.length), pw = 180 * u, gap = 18 * u, x0 = W / 2 - (n * pw + (n - 1) * gap) / 2, y = H * .64;
      for (let i = 0; i < n; i++) {
        const c = G.snaps[i], ph = pw * c.height / c.width, k = Math.min(1, (s - 2.5 - i * .2) * 4); if (k <= 0) continue;
        ctx.save(); ctx.globalAlpha = k; ctx.translate(x0 + i * (pw + gap) + pw / 2, y + ph / 2); ctx.rotate((i - 1) * .05);
        ctx.fillStyle = '#fff'; ctx.fillRect(-pw / 2 - 6 * u, -ph / 2 - 6 * u, pw + 12 * u, ph + 12 * u); ctx.drawImage(c, -pw / 2, -ph / 2, pw, ph); ctx.restore();
      }
    }
    if (s > 2.2) text(ctx, `${G.song.zh}・${G.d.zh}　${T.site.replace('https://', '')}`, W / 2, H * .95, 24 * u, 'rgba(255,255,255,.7)', { stroke: false });
  }
  if (s > 4.6 && S.phase === 'play') { S.phase = 'end'; M.stop(1); stopRec(); }
}

// ── 錄影 ──
let lastBlob = null, lastUrl = null, lastName = 'dance.mp4', lastType = 'video/mp4';
function pickMime() { for (const m of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']) if (window.MediaRecorder?.isTypeSupported?.(m)) return m; return ''; }
function startRec() {
  if (!view.captureStream || !window.MediaRecorder) return;
  const mime = pickMime(), stream = view.captureStream(30), chunks = [];
  try { const at = M.audioTrack(); if (at) stream.addTrack(at); } catch {}
  let mr; try { mr = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4e6 } : undefined); } catch { return; }
  const rec = { mr };
  mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  mr.onstop = () => {
    stream.getVideoTracks().forEach((t) => t.stop());
    if (rec.discard) return;
    const type = (mr.mimeType || mime || 'video/webm').split(';')[0];
    lastBlob = new Blob(chunks, { type }); lastType = type; lastName = T.game + (type.includes('mp4') ? '.mp4' : '.webm');
    if (lastUrl) URL.revokeObjectURL(lastUrl); lastUrl = URL.createObjectURL(lastBlob);
    showResult();
  };
  mr.start(500); G.rec = rec;
}
function stopRec(discard) {
  const r = G.rec; if (!r) { if (!discard && S.phase === 'end') showResult(); return; }
  r.discard = !!discard; try { r.mr.stop(); } catch {} if (discard) G.rec = null;
}

// ── 結果、排行榜 ──
function result(p = G.players[0]) {
  const score = scoreOf(p, G), st = starsOf(score);
  return { score, stars: st, rank: T.ranks[st], song: G.song.zh, diff: G.d.zh, songId: G.songId, diffId: G.diffId };
}
function showResult() {
  stopCamera(); cancelAnimationFrame(S.raf);
  const r = result(), p = G.players[0];
  if (S.duo) {
    const [a, b] = G.players.map((x) => scoreOf(x, G));
    $('rScore').textContent = `${a} : ${b}`; $('rStars').textContent = '';
    $('rRank').textContent = a === b ? '平手！' : `${a > b ? '1P' : '2P'} 獲勝！`;
    $('rMeta').textContent = `${r.song}・${r.diff}難度　1P ${T.ranks[starsOf(a)]}／2P ${T.ranks[starsOf(b)]}`;
  } else {
    $('rScore').textContent = r.score; $('rRank').textContent = r.rank;
    $('rStars').textContent = '★'.repeat(Math.min(5, r.stars)) + '☆'.repeat(Math.max(0, 5 - r.stars)) + (r.stars >= 7 ? ' 👑' : '');
    $('rMeta').textContent = `${r.song}・${r.diff}難度　PERFECT ${p.n.perfect}／SUPER ${p.n.super}／GOOD ${p.n.good}／OK ${p.n.ok}／X ${p.n.miss}　金色動作 ${p.n.yeah}／${G.cards.filter((c) => c.gold).length}　最高連擊 ${p.best}　消耗約 ${p.kcal.toFixed(1)} 大卡`;
  }
  const v = $('clip');
  if (lastBlob && G.rec) { v.hidden = false; v.src = lastUrl; v.play().catch(() => {}); $('saveVid').hidden = false; $('shareVid').hidden = false; }
  else { v.hidden = true; $('saveVid').hidden = true; $('shareVid').hidden = true; }
  G.rec = null;
  const strip = $('snaps'); strip.innerHTML = '';
  for (const c of G.snaps) { const im = new Image(); im.src = c.toDataURL('image/jpeg', .85); im.alt = '精彩瞬間'; strip.append(im); }
  strip.hidden = !G.snaps.length;
  const board = !S.duo && !G.song.custom;
  $('submitCard').hidden = !board; $('boardCard').hidden = G.song.custom;
  $('nick').value = store.get('beatNick', '');
  $('submit').disabled = false; $('submit').textContent = '上傳成績到排行榜'; $('submitMsg').textContent = '';
  if (!G.song.custom) boardFor($('rBoard'), r.songId, r.diffId, 'day');
  for (const b of document.querySelectorAll('#rTabs button')) b.setAttribute('aria-pressed', String(b.dataset.p === 'day'));
  show('sResult');
}
const boardKey = (song, diff) => `${T.game}:${song}:${diff}`;
async function boardFor(el, song, diff, period) {
  el.innerHTML = '<p class="fine">讀取排行榜中…</p>';
  try {
    const res = await fetch(`${T.board}/api/scores?board=${encodeURIComponent(boardKey(song, diff))}&period=${period}`);
    if (!res.ok) throw new Error(res.status);
    const { list } = await res.json();
    if (!list.length) { el.innerHTML = '<p class="fine">還沒有人上榜，第一名就是你！</p>'; return; }
    el.innerHTML = '<ol class="rank">' + list.slice(0, 50).map((x, i) => `<li${x.id === DEVICE ? ' class="me"' : ''}><span>${i + 1}</span><b>${esc(x.n)}</b><em>${x.s}${x.s >= 12000 ? ' 👑' : ''}</em></li>`).join('') + '</ol>';
  } catch { el.innerHTML = '<p class="fine">排行榜暫時連不上，等一下再試試。</p>'; }
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
$('submit').onclick = async () => {
  const name = $('nick').value.trim().slice(0, 12);
  if (!name) { $('submitMsg').textContent = '先取個暱稱吧！'; $('nick').focus(); return; }
  store.set('beatNick', name);
  const r = result(); $('submit').disabled = true; $('submitMsg').textContent = '上傳中…';
  try {
    const res = await fetch(`${T.board}/api/scores`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ board: boardKey(r.songId, r.diffId), name, score: r.score, id: DEVICE }) });
    const j = await res.json(); if (!res.ok) throw new Error(j.error || res.status);
    $('submit').textContent = '已上傳 ✓';
    $('submitMsg').textContent = j.rank?.day ? `今日第 ${j.rank.day} 名、本週第 ${j.rank.week} 名！` : '已上傳（這次沒有打破你自己的紀錄）';
    boardFor($('rBoard'), r.songId, r.diffId, 'day');
    for (const b of document.querySelectorAll('#rTabs button')) b.setAttribute('aria-pressed', String(b.dataset.p === 'day'));
  } catch (e) { $('submit').disabled = false; $('submitMsg').textContent = '上傳沒有成功，等一下再試一次。'; }
};
function tabs(el, onPick) {
  for (const b of el.querySelectorAll('button')) b.onclick = () => { for (const x of el.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b)); onPick(b.dataset.p); };
}
tabs($('rTabs'), (p) => boardFor($('rBoard'), G.songId, G.diffId, p));
const BP = { song: Object.keys(T.songs).includes(pick.song) ? pick.song : Object.keys(T.songs)[0], diff: pick.diff, period: 'day' };
const BOARD_SONGS = Object.entries(T.songs).map(([id, s]) => [id, s.zh]);
function boardScreen() {
  chipsSimple($('bSongs'), BOARD_SONGS, 'song'); chipsSimple($('bDiffs'), DIFF_ITEMS, 'diff');
  boardFor($('bList'), BP.song, BP.diff, BP.period); show('sBoard');
}
function chipsSimple(el, items, key) {
  el.innerHTML = '';
  for (const [id, label] of items) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip small'; b.textContent = label; b.setAttribute('aria-pressed', String(BP[key] === id));
    b.onclick = () => { BP[key] = id; for (const x of el.children) x.setAttribute('aria-pressed', String(x === b)); boardFor($('bList'), BP.song, BP.diff, BP.period); };
    el.append(b);
  }
}
tabs($('bTabs'), (p) => { BP.period = p; boardFor($('bList'), BP.song, BP.diff, p); });

// ── 分享 ──
function shareText() {
  if (S.duo) { const [a, b] = G.players.map((x) => scoreOf(x, G)); return `我們在「${G.song.zh}」雙人對戰 ${a} : ${b}！換你們來挑戰 → ${T.site}`; }
  return `${T.share(result())} ${T.site}`;
}
async function shareFile(e) {
  if (!lastBlob) return;
  const file = new File([lastBlob], lastName, { type: lastType });
  if (navigator.canShare?.({ files: [file] })) {
    e?.preventDefault();
    try { await navigator.share({ files: [file], text: shareText() }); }
    catch (err) { if (err.name !== 'AbortError') $('submitMsg').textContent = '沒有成功，可以長按影片另存。'; }
    return true;
  }
}
$('saveVid').onclick = async (e) => { if (await shareFile(e)) return; const a = document.createElement('a'); a.href = lastUrl; a.download = lastName; a.click(); };
$('shareVid').onclick = async (e) => { if (await shareFile(e)) return; location.href = 'https://line.me/R/msg/text/?' + encodeURIComponent(shareText()); };
$('shareText').onclick = async () => { try { await navigator.clipboard.writeText(shareText()); $('shareText').textContent = '已複製 ✓'; } catch { prompt('複製這段文字：', shareText()); } };

// ── 按鈕 ──
$('go').onclick = () => enterPlay(false);
$('practice').onclick = () => enterPlay(true);
$('again').onclick = () => enterPlay(false);
$('home').onclick = () => show('sHome');
$('boardBtn').onclick = () => { if (T.songs[pick.song]) BP.song = pick.song; BP.diff = pick.diff; boardScreen(); };
$('boardBack').onclick = () => show('sHome');
$('quit').onclick = () => quit();
$('skipReady').onclick = () => begin();
$('practiceNext').onclick = () => {
  if (P.done) { $('practiceBar').hidden = true; S.mode = 'play'; S.duo = pick.duo; S.readyPlayers = Array.from({ length: S.duo ? 2 : 1 }, (_, i) => newPlayer(i)); G.players = null; S.phase = 'ready'; S.readySince = 0; $('ready').hidden = false; return; }
  P.i++; if (P.i >= P.list.length) P.done = true; else loadStep(); syncPractice();
};
const muteBtn = $('mute');
const syncMute = () => { muteBtn.textContent = M.isMuted() ? '🔇' : '🔊'; };
muteBtn.onclick = () => { M.setMuted(!M.isMuted()); syncMute(); }; syncMute();
document.addEventListener('visibilitychange', () => { if (document.hidden && ['play', 'ready', 'practice'].includes(S.phase)) quit(); });
if ('serviceWorker' in navigator && !BOT) navigator.serviceWorker.register('sw.js').catch(() => {});
setTimeout(() => { if (!BOT) loadModel().catch(() => {}); }, 800);
window.__beat = { G, S, P, MOVES };
