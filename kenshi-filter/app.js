import { FilesetResolver, PoseLandmarker } from './lib/vision_bundle.mjs';
import { TYPES, CHARACTERS, ORDER, QUESTIONS, WEAPONS, score, topType, encodeScores, decodeScores, similarity, pairNote } from './data.js';
import { fromLandmarks, smooth, frame, weaponPose, drawTrail, matchPose, guidePose, drawGuide, drawFinisher, drawAtmosphere, drawCinematicFrame, drawRealHaori, drawAnimeOutfit, placePose } from './ar.js';
import { Stage3D } from './render3d.js';

const stage3d = new Stage3D();

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('kata-' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('kata-' + k, JSON.stringify(v)); } catch { /* 無痕模式存不了就算了 */ } },
};
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  $(id).scrollTop = 0;
  if (id !== 'cam') stopCamera();
}

// ── 網址參數：朋友的比一比連結、換瀏覽器帶過來的答案 ──────────
const params = new URLSearchParams(location.search);
const friend = (() => {
  const s = decodeScores(params.get('vs'));
  if (!s) return null;
  const t = ORDER.includes(params.get('t')) ? params.get('t') : topType(s, [0]);
  return { scores: s, type: t, name: (params.get('n') || '朋友').slice(0, 12) };
})();
try {
  const carry = JSON.parse(params.get('carry'));
  if (Array.isArray(carry) && carry.length === QUESTIONS.length) store.set('answers', carry);
} catch { /* 沒有就算了 */ }

const rememberedChar = store.get('char');
const state = { answers: [], qi: 0, type: null, scores: null, char: ORDER.includes(rememberedChar) ? rememberedChar : 'compete', mode: 'move', facing: 'user',
  outfit: 'real', weapon: store.get('weapon') || 'own', camOrigin: 'intro' };

// ── 開場 ───────────────────────────────────
if (friend) {
  $('inviteMsg').hidden = false;
  $('inviteMsg').textContent = `${friend.name} 是「${TYPES[friend.type].name}」。做完測驗，看看你們有幾 % 像。`;
}
if (store.get('answers')?.length === QUESTIONS.length) $('resume').hidden = false;
$('start').onclick = () => { state.answers = []; state.qi = 0; show('quiz'); renderQ(); };
$('resume').onclick = () => { state.answers = store.get('answers'); finish(); };
$('quickCam').onclick = () => openCam('intro');

// ── 題目 ───────────────────────────────────
function renderQ() {
  const { q, a } = QUESTIONS[state.qi];
  $('qnum').textContent = `第 ${state.qi + 1} 題／共 ${QUESTIONS.length} 題`;
  $('progress').style.width = `${state.qi / QUESTIONS.length * 100}%`;
  $('qtext').textContent = q;
  const box = $('opts');
  box.className = 'opts' + (a.length > 4 ? ' kanji' : '');
  box.replaceChildren(...a.map(([label], i) => {
    const b = document.createElement('button');
    b.className = 'opt'; b.textContent = label;
    b.setAttribute('aria-pressed', String(state.answers[state.qi] === i));
    b.onclick = () => {
      state.answers[state.qi] = i;
      if (state.qi < QUESTIONS.length - 1) { state.qi++; renderQ(); } else finish();
    };
    return b;
  }));
  $('back').disabled = state.qi === 0;
}
$('back').onclick = () => { if (state.qi > 0) { state.qi--; renderQ(); } };

// ── 結果 ───────────────────────────────────
function finish() {
  store.set('answers', state.answers);
  state.scores = score(state.answers);
  state.type = topType(state.scores, state.answers);
  state.char = state.type;
  const t = TYPES[state.type], c = CHARACTERS[state.type];
  show('result');
  $('hero').style.setProperty('--tint', c.tint);
  $('heroTag').textContent = `${t.en}・${c.kana}`;
  $('heroVert').textContent = `${c.title}・${c.name}`;
  $('who').textContent = `你是「${t.name}」`;
  $('quote').textContent = `「${t.line}」`;
  for (const k of ['healthy', 'shadow', 'adler', 'maslow', 'try']) $(k).textContent = t[k];
  drawPortrait($('heroCanvas'), c, params.has('pt') ? +params.get('pt') : .8);

  // 和每位劍士的相似度：用分數本身（每一型 0～100）
  const ranked = ORDER.map((id) => [id, state.scores[id]]).sort((a, b) => b[1] - a[1]);
  const rarity = ranked[0][1] >= 65 || ranked[0][1] - ranked[1][1] >= 20 ? 'SSR' : 'SR';
  $('rarity').textContent = rarity;
  $('rarityLarge').textContent = rarity;
  $('rarityNote').textContent = rarity === 'SSR'
    ? '你的核心姿態非常鮮明，這張角色卡帶有更強的專屬招式共鳴。'
    : '你的力量分布更均衡，能在不同任務裡切換姿態。';
  renderAbilities(state.scores, c);
  $('sims').replaceChildren(...ranked.map(([id, v]) => {
    const row = document.createElement('div'); row.className = 'sim';
    const label = document.createElement('span'); label.textContent = `${CHARACTERS[id].title}・${CHARACTERS[id].name}`;
    const track = document.createElement('div'); track.className = 'track';
    const fill = document.createElement('i'); fill.style.width = v + '%'; fill.style.background = CHARACTERS[id].tint; track.append(fill);
    const num = document.createElement('b'); num.textContent = v + '%';
    row.append(label, track, num); return row;
  }));
  const second = ranked.find(([id]) => id !== state.type)[0];
  $('second').textContent = `你身上也有「${TYPES[second].name}」的影子：${TYPES[second].line}`;

  if (friend) {
    $('friendCard').hidden = false;
    $('friendTitle').textContent = `你和 ${friend.name}（${TYPES[friend.type].name}）的相似度`;
    $('friendPct').textContent = similarity(state.scores, friend.scores) + '%';
    $('friendNote').textContent = pairNote(state.type, friend.type);
  }
  $('nick').value = store.get('nick') || '';
}
$('retry').onclick = () => { state.answers = []; state.qi = 0; show('quiz'); renderQ(); };
$('toCam').onclick = () => openCam();

function renderAbilities(scores, c) {
  const avg = (...ids) => ids.reduce((n, id) => n + scores[id], 0) / ids.length;
  const stats = [
    ['守護', avg('devote', 'duty')],
    ['洞察', avg('detach', 'harmony')],
    ['行動', avg('compete', 'recognize')],
    ['意志', avg('duty', 'compete')],
    ['共鳴', avg('harmony', 'devote', 'recognize')],
  ].map(([name, value]) => [name, Math.round(Math.min(100, 28 + value * .72))]);
  $('abilityStats').replaceChildren(...stats.map(([name, value]) => {
    const row = document.createElement('div'); row.className = 'stat';
    const label = document.createElement('span'); label.textContent = name;
    const track = document.createElement('div'); track.className = 'stat-track';
    const fill = document.createElement('i'); fill.style.setProperty('--stat', c.tint); track.append(fill);
    const num = document.createElement('b'); num.textContent = value;
    row.append(label, track, num);
    requestAnimationFrame(() => { fill.style.width = value + '%'; });
    return row;
  }));
}

$('shareLink').onclick = async () => {
  const nick = $('nick').value.trim().slice(0, 12);
  store.set('nick', nick);
  const url = new URL(location.pathname, location.href);
  url.searchParams.set('vs', encodeScores(state.scores));
  url.searchParams.set('t', state.type);
  if (nick) url.searchParams.set('n', nick);
  const text = `我是「${TYPES[state.type].name}」，最像${CHARACTERS[state.type].title}・${CHARACTERS[state.type].name}。你呢？做完看看我們有幾 % 像：`;
  try {
    if (navigator.share) { await navigator.share({ title: '心之型・劍士測驗', text, url: url.href }); return; }
    await navigator.clipboard.writeText(text + url.href);
    $('shareMsg').textContent = '已複製連結，貼給朋友就可以。';
  } catch (e) {
    if (e?.name !== 'AbortError') prompt('長按複製這個連結', url.href);
  }
};

// ── 立繪：沒有相機時用一個簡單的人偶示範服裝與招式 ──────────
const NEUTRAL = { n: [0, -1.35], ls: [-.36, -1], rs: [.36, -1], le: [-.44, -.5], re: [.44, -.5], lw: [-.4, -.04], rw: [.42, -.1],
  lh: [-.2, 0], rh: [.2, 0], lk: [-.22, .88], rk: [.22, .88], la: [-.24, 1.75], ra: [.24, 1.75] };
function blendPose(a, b, t) {
  const out = {};
  for (const k in a) out[k] = [a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t];
  return out;
}
// 示範人偶：3D 人偶穿上服裝、拿著武器
function renderDoll(W, H, kp, c, light = 1) {
  stage3d.setCharacter(c);
  const wp = weaponPose(kp, c, c.move.blade, 1);
  return stage3d.render(W, H, { kp, blades: wp.blades, doll: true, light });
}
function drawPortrait(cv, c, t) {
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  const T = cv.height * .2;
  const pose = blendPose(NEUTRAL, c.move.pose, t);
  const kp = placePose(pose, { x: cv.width / 2, y: cv.height * .5 }, T);
  ctx.drawImage(renderDoll(cv.width, cv.height, kp, c), 0, 0);
}

// ── AR 相機 ─────────────────────────────────
const stage = $('stage'), sctx = stage.getContext('2d');
const video = document.createElement('video');
video.playsInline = true; video.muted = true; video.setAttribute('playsinline', '');
const cam = { frame: 0, stream: null, raf: 0, kp: null, lastSeen: 0, trail: [], hold: 0, firedAt: 0, cool: 0, match: 0, wantShot: false, demoT: 0 };

const MODES = [['move', '招式挑戰'], ['free', '自由揮刀']];
$('modes').replaceChildren(...MODES.map(([id, label]) => {
  const b = document.createElement('button'); b.className = 'chip'; b.textContent = label; b.dataset.id = id;
  b.onclick = () => { state.mode = id; syncChips(); updateHint(); };
  return b;
}));
$('roster').replaceChildren(...ORDER.map((id) => {
  const b = document.createElement('button'); b.className = 'chip'; b.dataset.id = id;
  b.textContent = `${CHARACTERS[id].title}・${CHARACTERS[id].name}`;
  b.onclick = () => { state.char = id; store.set('char', id); syncChips(); updateHint(); cam.hold = 0; };
  return b;
}));
// 穿法與武器：「只披羽織」保留使用者自己的衣服；武器可換成武士刀、小太刀、二刀
const OUTFITS = [['real', '寫實布料']];
const WEAPON_CHOICES = [['own', '角色武器'], ['katana', '武士刀'], ['kodachi', '小太刀'], ['nito', '二刀']];
function gearChips() {
  const mk = (group, id, label) => {
    const b = document.createElement('button'); b.className = 'chip'; b.textContent = label; b.dataset.group = group; b.dataset.id = id;
    b.onclick = () => { state[group] = id; store.set(group, id); syncChips(); };
    return b;
  };
  const sep = document.createElement('span'); sep.className = 'sep';
  $('gear').replaceChildren(...OUTFITS.map(([id, l]) => mk('outfit', id, l)), sep, ...WEAPON_CHOICES.map(([id, l]) => mk('weapon', id, l)));
}
gearChips();
$('customizeBtn').onclick = () => {
  const open = $('customizer').hidden;
  $('customizer').hidden = !open;
  $('customizeBtn').setAttribute('aria-expanded', String(open));
  $('customizeBtn').textContent = open ? '收起' : '造型';
};
// 目前畫面上的角色：角色資料＋換過的武器（同一組合回傳同一個物件，3D 舞台才不會每幀重建）
const gearCache = new Map();
function gear(id = state.char) {
  const key = id + '|' + state.weapon;
  if (!gearCache.has(key)) {
    const ch = CHARACTERS[id], own = { tsuba: ch.weapon.tsuba, grip: ch.weapon.grip };
    const spec = (k) => ({ ...own, ...WEAPONS[k] });
    const g = state.weapon === 'own' ? ch
      : state.weapon === 'nito' ? { ...ch, weapon: spec('katana'), offhand: spec('kodachi') }
      : { ...ch, weapon: spec(state.weapon) };
    gearCache.set(key, g);
  }
  return gearCache.get(key);
}
function syncChips() {
  for (const b of $('gear').querySelectorAll('.chip')) b.setAttribute('aria-pressed', String(state[b.dataset.group] === b.dataset.id));
  for (const b of $('modes').children) b.setAttribute('aria-pressed', String(b.dataset.id === state.mode));
  for (const b of $('roster').children) b.setAttribute('aria-pressed', String(b.dataset.id === state.char));
  const c = CHARACTERS[state.char], t = TYPES[state.char];
  $('camName').innerHTML = '';
  $('camName').append(`${c.title}・${c.name}`);
  const sm = document.createElement('small'); sm.textContent = state.mode === 'move' ? c.move.name : `${t.name}・${c.element}`;
  $('camName').append(sm);
  $('meter').style.visibility = state.mode === 'move' ? 'visible' : 'hidden';
}
let hintTimer = 0;
function updateHint(msg) {
  const c = CHARACTERS[state.char];
  $('hint').hidden = false;
  $('hint').textContent = msg || (state.mode === 'move'
    ? '手持自拍就可以：把臉、雙肩和雙手放進畫面，跟著白色手臂框擺姿勢。到位會自動發動並拍照。'
    : '把臉、雙肩和持刀手放進畫面。隨意揮刀看看，揮快一點會有刀光。按紅色按鈕拍照。');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { $('hint').hidden = true; }, 6000);
}

async function loadModel() {
  try {
    const fs = await FilesetResolver.forVisionTasks(new URL('lib/wasm', location.href).href);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: new URL('models/pose_landmarker_lite.task', location.href).href, delegate },
      runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: .5, minTrackingConfidence: .5,
    });
    try { cam.pose = await PoseLandmarker.createFromOptions(fs, opts('GPU')); }
    catch { cam.pose = await PoseLandmarker.createFromOptions(fs, opts('CPU')); }
    $('loadState').textContent = '';
  } catch (e) {
    console.warn('pose failed', e);
    $('loadState').textContent = '姿勢辨識載入失敗';
  }
}
let modelReady = null;

async function openCam(origin = 'result') {
  state.camOrigin = origin;
  show('cam');
  $('customizer').hidden = true;
  $('customizeBtn').setAttribute('aria-expanded', 'false');
  $('customizeBtn').textContent = '造型';
  modelReady ||= loadModel();
  syncChips(); updateHint();
  fitStage();
  await startCamera();
  cancelAnimationFrame(cam.raf);
  cam.raf = requestAnimationFrame(loop);
}
function fitStage() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  stage.width = Math.round(stage.clientWidth * dpr); stage.height = Math.round(stage.clientHeight * dpr);
}
addEventListener('resize', () => { if (!$('cam').hidden) fitStage(); });

async function startCamera() {
  stopStream();
  if (!navigator.mediaDevices?.getUserMedia || params.has('demo')) { cam.demo = true; return; }
  try {
    cam.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: state.facing, width: { ideal: 1280 }, height: { ideal: 1280 } } });
    video.srcObject = cam.stream; await video.play();
    cam.demo = false;
  } catch (e) {
    cam.demo = true;
    updateHint(e.name === 'NotAllowedError'
      ? '相機權限被拒絕了，先用示範人偶看看效果。要用相機的話，請到瀏覽器設定允許這個網站使用相機再重新整理。'
      : '打不開相機，先用示範人偶看看效果。' + (window.IN_APP ? '在 App 裡的話，請改用手機瀏覽器開。' : ''));
  }
}
function stopStream() { cam.stream?.getTracks().forEach((t) => t.stop()); cam.stream = null; }
function stopCamera() { stopStream(); cancelAnimationFrame(cam.raf); }
$('flip').onclick = () => { state.facing = state.facing === 'user' ? 'environment' : 'user'; cam.kp = null; startCamera(); };
$('camBack').onclick = () => show(state.camOrigin === 'result' ? 'result' : 'intro');

// 估計現場亮度（0.4～1.4），讓衣服的打光跟環境接近
const lightC = document.createElement('canvas'); lightC.width = lightC.height = 8;
function videoLight() {
  try {
    const g = lightC.getContext('2d', { willReadFrequently: true });
    g.drawImage(video, 0, 0, 8, 8);
    const d = g.getImageData(0, 0, 8, 8).data;
    let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11;
    return Math.min(1.4, Math.max(.4, s / 64 / 255 * 2.2));
  } catch { return 1; }
}

function loop(now) {
  cam.raf = requestAnimationFrame(loop);
  const W = stage.width, H = stage.height, ctx = sctx;
  if (W < 2 || H < 2) return; // 手機旋轉／瀏覽器改尺寸的瞬間不要把 0×0 畫布交給 WebGL
  const c = gear();
  const mirror = state.facing === 'user';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0f0c0b'; ctx.fillRect(0, 0, W, H);

  // 1. 背景：相機畫面（cover 填滿，前鏡頭鏡像）
  let kp = null;
  if (!cam.demo && video.readyState >= 2 && video.videoWidth) {
    const vw = video.videoWidth, vh = video.videoHeight, s = Math.max(W / vw, H / vh);
    const dw = vw * s, dh = vh * s, dx = (W - dw) / 2, dy = (H - dh) / 2;
    ctx.save();
    if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    ctx.filter = 'contrast(1.08) saturate(1.12) brightness(.94)';
    ctx.drawImage(video, dx, dy, dw, dh);
    ctx.filter = 'none';
    ctx.restore();
    if (!(cam.frame++ % 20)) cam.light = videoLight();
    if (cam.pose && video.currentTime !== cam.lastVideoTime) {
      cam.lastVideoTime = video.currentTime;
      const res = cam.pose.detectForVideo(video, now);
      const lms = res.landmarks?.[0];
      if (lms) {
        const map = (x, y, z) => [mirror ? W - (dx + x * dw) : dx + x * dw, dy + y * dh, -(z || 0) * dw];
        const raw = fromLandmarks(lms, map, mirror);
        const rf = frame(raw), shoulderW = Math.hypot(raw.rs.x - raw.ls.x, raw.rs.y - raw.ls.y);
        const bodyRatio = shoulderW / rf.T;
        const hipsReady = raw.lh.v > .32 && raw.rh.v > .32;
        // 手持自拍只需要頭和雙肩；髖部沒入鏡時由肩線建立虛擬胸腔。
        const torsoReady = raw.ls.v > .52 && raw.rs.v > .52 && (raw.n.v > .42 || hipsReady)
          && shoulderW > Math.min(W, H) * .075 && rf.T > Math.min(W, H) * .055
          && bodyRatio > .35 && bodyRatio < 2.2;
        if (torsoReady) { cam.kp = smooth(cam.kp, raw); cam.lastSeen = now; }
      }
    }
    if (now - cam.lastSeen < 400) kp = cam.kp;
    else if (cam.kp) { cam.kp = null; cam.trail = []; }
  } else if (cam.demo) {
    // 示範人偶：在站姿與招式之間來回
    cam.demoT += 1 / 60;
    const t = (Math.sin(cam.demoT * 1.3) + 1) / 2;
    const partialPreview = params.get('flat') === 'partial';
    const trackingPreview = params.has('track');
    const T = Math.min(W, H) * (partialPreview ? .55 : .2) * (trackingPreview ? .9 + Math.sin(cam.demoT * .7) * .16 : 1);
    ctx.fillStyle = '#231c19'; ctx.fillRect(0, H * .8, W, H * .2);
    const anchor = trackingPreview
      ? { x: W * (.5 + Math.sin(cam.demoT * .9) * .22), y: H * (.54 + Math.cos(cam.demoT * .6) * .06) }
      : { x: W / 2, y: H * .55 };
    kp = placePose(blendPose(NEUTRAL, c.move.pose, t * t), anchor, T);
    if (trackingPreview) {
      const angle = Math.sin(cam.demoT * .65) * .16, cs = Math.cos(angle), sn = Math.sin(angle);
      for (const p of Object.values(kp)) {
        const x = p.x - anchor.x, y = p.y - anchor.y;
        p.x = anchor.x + x * cs - y * sn; p.y = anchor.y + x * sn + y * cs;
      }
    }
    if (partialPreview) for (const k of ['le', 're', 'lw', 'rw']) kp[k].v = .1;
  }

  drawAtmosphere(ctx, W, H, c, kp, now);
  const flatPreview = params.has('flat');
  if (kp && (!cam.demo || flatPreview)) {
    const dressed = drawRealHaori(ctx, kp, c, cam.light ?? 1);
    if (!dressed) drawAnimeOutfit(ctx, kp, c, 'haori', cam.light ?? 1);
  }

  // 2. 招式吻合度
  let res = null, guide = null;
  const handReady = (s) => kp?.[s + 'e']?.v > .5 && kp?.[s + 'w']?.v > .48;
  const armsReady = c.move.hand === 'both' ? handReady('l') && handReady('r') : handReady(c.move.hand);
  if (kp && armsReady && state.mode === 'move' && now - cam.firedAt > 1600) {
    res = matchPose(kp, c.move.pose);
    cam.match += (res.score - cam.match) * .3;
    guide = guidePose(kp, c, res);
    if (cam.match > .8 && now > cam.cool) {
      cam.hold ||= now;
      if (now - cam.hold > 650) { cam.firedAt = now; cam.cool = now + 3200; cam.hold = 0; cam.shotAt = now + 450; }
    } else cam.hold = 0;
  } else if (!kp || !armsReady) { cam.match = 0; cam.hold = 0; }
  const pct = Math.round(Math.min(1, Math.max(0, (cam.match - .35) / .45)) * 100);
  $('meterText').textContent = !kp ? '請把臉和雙肩放進畫面' : !armsReady ? '再把雙手放進畫面' : (cam.hold ? '保持住！' : `招式吻合 ${pct}%`);
  $('meterBar').style.width = (kp ? pct : 0) + '%';

  // 3. 3D 服裝與武器（招式框的淡影一起畫）
  stage3d.setCharacter(c);
  if (kp || guide) {
    const assist = state.mode === 'move' ? Math.max(0, (cam.match - .5) * 2) : 0;
    const wp = kp && armsReady && weaponPose(kp, c, c.move.blade, cam.demo ? 1 : assist);
    // 招式發動時吹一陣風：衣服往刀的反方向翻飛
    const ft0 = (now - cam.firedAt) / 1000, gust = cam.firedAt && ft0 < 1.4 ? (1 - ft0 / 1.4) * (wp?.T || 0) * (1.2 + .4 * Math.sin(now / 45)) : 0;
    const bd = c.move.blade, wind = gust ? { x: -bd[0] * gust, y: -bd[1] * gust - gust * .2 } : null;
    ctx.drawImage(stage3d.render(W, H, { kp, blades: wp?.blades, ghostKp: guide?.tg, ghostBlades: guide?.blades, doll: cam.demo, light: cam.light ?? 1, now, wind, outfit: state.outfit, showOutfit: cam.demo && !flatPreview }), 0, 0);
    if (guide) drawGuide(ctx, guide.tg, c, res, (Math.sin(now / 250) + 1) / 2);
    if (wp) {
      const b0 = wp.blades[0], R = stage3d.reach(wp.T);
      const tip = { x: b0.grip.x + b0.dir.x * R, y: b0.grip.y + b0.dir.y * R };
      const last = cam.trail.at(-1);
      if (!last || Math.hypot(tip.x - last.x, tip.y - last.y) > wp.T * .04) cam.trail.push({ x: tip.x, y: tip.y, t: now });
      cam.trail = cam.trail.filter((p) => now - p.t < 280);
      if (!cam.demo) drawTrail(ctx, cam.trail, c, wp.T);
    }
  }

  // 4. 招式發動
  const ft = (now - cam.firedAt) / 1000;
  if (kp && cam.firedAt && ft < 1.6) {
    drawFinisher(ctx, W, H, c, kp, ft);
    drawMoveName(ctx, W, H, c, ft);
  }
  drawCinematicFrame(ctx, W, H, c, cam.firedAt && ft < 1.6 ? ft : -1);
  if (cam.shotAt && now >= cam.shotAt) { cam.shotAt = 0; cam.wantShot = true; }
  if (cam.wantShot) { cam.wantShot = false; takeShot(); }
}

function drawMoveName(ctx, W, H, c, t) {
  const a = Math.min(1, t * 4) * Math.min(1, (1.6 - t) * 3);
  const [head, tail] = c.move.name.split('・');
  const size = Math.min(W * .16, H * .085);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `900 ${size}px "Noto Serif TC", serif`;
  ctx.lineWidth = size * .14; ctx.strokeStyle = '#000'; ctx.fillStyle = '#fff';
  ctx.shadowColor = c.tint; ctx.shadowBlur = size * .5;
  // 直排：每個字一行
  const x = W - size * .9, chars = [...tail];
  const y0 = H * .18 + (1 - Math.min(1, t * 4)) * -size;
  chars.forEach((ch, i) => { ctx.strokeText(ch, x, y0 + i * size * 1.05); ctx.fillText(ch, x, y0 + i * size * 1.05); });
  ctx.font = `700 ${size * .42}px "Noto Serif TC", serif`; ctx.lineWidth = size * .08;
  [...head].forEach((ch, i) => { ctx.strokeText(ch, x - size * .95, H * .18 + i * size * .48); ctx.fillText(ch, x - size * .95, H * .18 + i * size * .48); });
  ctx.restore();
}

// ── 拍照 ───────────────────────────────────
let shotBlob = null;
function takeShot() {
  const W = stage.width, H = stage.height;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const o = out.getContext('2d');
  o.drawImage(stage, 0, 0);
  // 底部標籤：社會姿態＋角色
  const c = CHARACTERS[state.char], t = TYPES[state.char];
  const s = Math.min(W, H) / 22;
  const g = o.createLinearGradient(0, H - s * 5, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.75)');
  o.fillStyle = g; o.fillRect(0, H - s * 5, W, s * 5);
  o.fillStyle = '#fff'; o.textBaseline = 'alphabetic';
  o.font = `900 ${s * 1.3}px "Noto Serif TC", serif`;
  o.fillText(`${c.title}・${c.name}`, s, H - s * 2.1);
  o.font = `500 ${s * .75}px "Noto Sans TC", sans-serif`;
  o.fillStyle = '#f3ead8';
  o.fillText(`我是「${t.name}」｜心之型・劍士測驗`, s, H - s * .9);
  out.toBlob((b) => {
    shotBlob = b;
    const url = URL.createObjectURL(b);
    $('shot').src = url; $('save').href = url;
    $('sheet').hidden = false;
  }, 'image/jpeg', .92);
}
$('shutter').onclick = () => { cam.wantShot = true; };
$('close').onclick = () => { $('sheet').hidden = true; };
$('share').onclick = async () => {
  if (!shotBlob) return;
  const file = new File([shotBlob], 'kokoro-no-kata.jpg', { type: 'image/jpeg' });
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: '心之型・劍士測驗' });
    else $('save').click();
  } catch { /* 使用者取消 */ }
};

// 直接帶 ?demo=1 開啟時，跳過測驗看示範（方便預覽）
if (params.has('demo')) {
  state.answers = store.get('answers') || QUESTIONS.map(() => 0);
  finish();
  if (ORDER.includes(params.get('c'))) state.char = params.get('c');
  if (params.get('demo') === 'cam') openCam();
}
