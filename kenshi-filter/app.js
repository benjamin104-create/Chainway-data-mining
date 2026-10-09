import { FilesetResolver, PoseLandmarker, ImageSegmenter } from './lib/vision_bundle.mjs';
import { TYPES, CHARACTERS, ORDER, QUESTIONS, WEAPONS, score, topType, encodeScores, decodeScores, similarity, pairNote } from './data.js';
import { fromLandmarks, smooth, frame, weaponPose, drawTrail, matchPose, guidePose, drawGuide, drawFinisher, drawAtmosphere, drawCinematicFrame, drawRealHaori, haoriAssetsReady, placePose } from './ar.js';
import { copyPersonMask, copyPartMasks, drawMappedMask, cutForeground } from './composite.js';
import { Stage3D } from './render3d.js';
import { Haori3D, fabricReady, silhouetteEase } from './haori3d.js';
import { scabbardPoses } from './weapon-layout.js';
import { buildHaoriRig } from './garment-rig.js';

const stage3d = new Stage3D();
let haori3d = null;

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
const state = { answers: [], qi: 0, type: null, scores: null, char: ORDER.includes(rememberedChar) ? rememberedChar : 'compete', mode: 'free', facing: 'user',
  outfit: params.get('fit')==='physics'?'physics':'real', weapon: store.get('weapon-v2') || 'none', camOrigin: 'intro' };

// ── 開場 ───────────────────────────────────
if (friend) {
  $('inviteMsg').hidden = false;
  $('inviteMsg').textContent = `${friend.name} 是「${TYPES[friend.type].name}」。做完測驗，看看你們有幾 % 像。`;
}
if (store.get('answers')?.length === QUESTIONS.length) $('resume').hidden = false;
$('start').onclick = () => { state.answers = []; state.qi = 0; show('quiz'); renderQ(); };
$('resume').onclick = () => { state.answers = store.get('answers'); finish(); };
$('quickCam').onclick = () => openCam('intro');
$('uploadPhoto').onclick = () => choosePhoto('intro');
$('resultPhoto').onclick = () => choosePhoto('result');

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
const stage = $('stage'), sctx = stage.getContext('2d', { willReadFrequently: true });
const video = document.createElement('video');
video.playsInline = true; video.muted = true; video.setAttribute('playsinline', '');
const cam = { frame: 0, stream: null, raf: 0, kp: null, lastSeen: 0, trail: [], hold: 0, firedAt: 0, cool: 0, match: 0, wantShot: false, demoT: 0 };
const garmentLayer = document.createElement('canvas'), foregroundLayer = document.createElement('canvas');
const weaponLayer = document.createElement('canvas');
const maskVideo = document.createElement('canvas'), maskScreen = document.createElement('canvas');
const headVideo = document.createElement('canvas'), skinVideo = document.createElement('canvas');
const headScreen = document.createElement('canvas'), skinScreen = document.createElement('canvas');
const atmosphereLayer = document.createElement('canvas');
const fit = { width: 1, length: 1 };
for (const key of ['width', 'length']) {
  const input = $('fit-' + key), output = $('fit-' + key + '-value');
  input.oninput = () => { fit[key] = Number(input.value) / 100; output.textContent = input.value + '%'; };
}
$('fitReset').onclick = () => {
  for (const key of ['width', 'length']) { fit[key] = 1; $('fit-' + key).value = 100; $('fit-' + key + '-value').textContent = '100%'; }
};
function sizeLayer(cv, W, H) { if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; } }

const MODES = [['free', '自拍模式'], ['move', '招式挑戰']];
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
const OUTFITS = [['real', '原版照片貼合'],['physics','3D 物理布料（測試）']];
const WEAPON_CHOICES = [['none', '不持武器'], ['own', '角色武器'], ['katana', '打刀'], ['wakizashi','脇差'], ['kodachi', '小太刀'], ['nito', '大小二刀']];
function gearChips() {
  const mk = (group, id, label) => {
    const b = document.createElement('button'); b.className = 'chip'; b.textContent = label; b.dataset.group = group; b.dataset.id = id;
    b.onclick = () => { state[group] = id; if(group==='outfit')haori3d?.reset(); store.set(group === 'weapon' ? 'weapon-v2' : group, id); syncChips(); };
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
    const g = state.weapon === 'own' || state.weapon === 'none' ? ch
      : state.weapon === 'nito' ? { ...ch, weapon: spec('katana'), offhand: spec('wakizashi') }
      : { ...ch, weapon: spec(state.weapon) };
    gearCache.set(key, g);
  }
  return gearCache.get(key);
}
function syncChips() {
  $('cam').dataset.realism=String(state.outfit==='physics');
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
    : '臉和雙肩入鏡即可穿上羽織。空出的手入鏡時可以持刀，按紅色按鈕拍照。');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { $('hint').hidden = true; }, 6000);
}

async function loadModel() {
  try {
    const fs = await FilesetResolver.forVisionTasks(new URL('lib/wasm', location.href).href);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: new URL('models/pose_landmarker_lite.task', location.href).href, delegate },
      runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: .5, minTrackingConfidence: .5, outputSegmentationMasks: true,
    });
    try { cam.pose = await PoseLandmarker.createFromOptions(fs, opts('GPU')); }
    catch { cam.pose = await PoseLandmarker.createFromOptions(fs, opts('CPU')); }
    // Semantic masks are optional: never block pose tracking if unavailable.
    loadPartsModel(fs);
    $('loadState').textContent = '';
  } catch (e) {
    console.warn('pose failed', e);
    $('loadState').textContent = '姿勢辨識載入失敗';
  }
}
let modelReady = null;

async function loadPartsModel(fs) {
  const opts = (delegate) => ({ baseOptions: {
    modelAssetPath: new URL('models/selfie_multiclass_256x256.tflite', location.href).href, delegate,
  }, runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true });
  try {
    try { cam.parts = await ImageSegmenter.createFromOptions(fs, opts('GPU')); }
    catch { cam.parts = await ImageSegmenter.createFromOptions(fs, opts('CPU')); }
  } catch (e) { cam.partsFailed = true; console.warn('semantic masks unavailable; using joint masks', e); }
}

function choosePhoto(origin = state.camOrigin) {
  cam.uploadOrigin = origin;
  $('photoInput').value = '';
  $('photoInput').click();
}

let photoSelection = 0;
$('photoInput').onchange = async () => {
  const file = $('photoInput').files?.[0];
  if (!file) return;
  const selection = ++photoSelection;
  let url = null;
  try {
    if (file.type && !file.type.startsWith('image/')) throw new Error('請選擇圖片檔案。');
    if (file.size > 25 * 1024 * 1024) throw new Error('照片超過 25 MB，請先縮小照片後再試。');
    url = URL.createObjectURL(file);
    const image = new Image(); image.src = url;
    try { await image.decode(); } catch { throw new Error('讀不到這張照片，請改用 JPG、PNG 或 WebP；HEIC 可先匯出為 JPG。'); }
    if (selection !== photoSelection) { URL.revokeObjectURL(url); return; }
    // Keep browser memory manageable for very large phone originals. EXIF
    // orientation is applied by Image.decode before the image is downscaled.
    if (Math.max(image.naturalWidth, image.naturalHeight) > 2560) {
      const cv = document.createElement('canvas'), scale = 2560 / Math.max(image.naturalWidth, image.naturalHeight);
      cv.width = Math.round(image.naturalWidth * scale); cv.height = Math.round(image.naturalHeight * scale);
      cv.getContext('2d').drawImage(image, 0, 0, cv.width, cv.height);
      const blob = await new Promise((resolve) => cv.toBlob(resolve, 'image/jpeg', .95));
      if (!blob) throw new Error('照片處理失敗，請再選一次。');
      URL.revokeObjectURL(url); url = URL.createObjectURL(blob); image.src = url; await image.decode();
    }
    if (selection !== photoSelection) { URL.revokeObjectURL(url); return; }
    $('photoError').hidden = true; $('resultPhotoError').hidden = true;
    await openCam(cam.uploadOrigin, { image, url });
  } catch (e) {
    if (url && url !== cam.uploadUrl) URL.revokeObjectURL(url);
    if (!$('cam').hidden) updateHint(e.message);
    else {
      const message = $(cam.uploadOrigin === 'result' ? 'resultPhotoError' : 'photoError');
      message.textContent = e.message; message.hidden = false;
    }
  }
};

async function openCam(origin = 'result', photo = null) {
  cancelAnimationFrame(cam.raf); stopStream(); releaseUploadedPhoto();
  cam.uploadedPhoto = photo?.image || null; cam.uploadUrl = photo?.url || null;
  $('fitReset').click();
  cam.hold = 0; cam.firedAt = 0; cam.shotAt = 0; cam.wantShot = false; cam.match = 0; cam.light = null;
  cam.photoRenderKey = null;
  haori3d?.reset(); cam.clothEase = null;
  if (photo) state.mode = 'free';
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
  haori3d?.reset();cam.clothEase=null;
  cam.propsFocalRatio=null;
  cam.kp = null; cam.maskAt = 0; cam.partsAt = 0; cam.partsSourceTime = undefined; cam.lastVideoTime = undefined; cam.trail = [];
  cam.photoDemo = !cam.uploadedPhoto && params.get('demo') === 'photo';
  cam.photoMode = !!cam.uploadedPhoto || cam.photoDemo;
  $('flip').textContent = cam.photoMode ? '↥' : '⟲';
  $('flip').setAttribute('aria-label', cam.photoMode ? '換一張照片' : '切換前後鏡頭');
  $('modes').hidden = cam.photoMode; $('photoModeLabel').hidden = !cam.photoMode;
  $('shutter').setAttribute('aria-label', cam.photoMode ? '產生試穿照' : '拍照');
  $('shutter').disabled = cam.photoMode;
  if (cam.uploadedPhoto) {
    cam.demo = true; updateHint('照片只在你的瀏覽器內處理。點「造型」換角色，按紅色按鈕產生試穿照；右上角可換照片。');
    return;
  }
  if (cam.photoDemo) {
    cam.demo = true; cam.previewPhoto ||= new Image();
    cam.previewPhoto.src = new URL('assets/preview-model.png', import.meta.url).href;
    await cam.previewPhoto.decode();
    updateHint('AI 模特示範照片。正式拍照時會使用你的相機畫面。');
    return;
  }
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
function releaseUploadedPhoto() {
  if (cam.uploadUrl) URL.revokeObjectURL(cam.uploadUrl);
  cam.uploadUrl = null; cam.uploadedPhoto = null;
}
function stopCamera() { stopStream(); cancelAnimationFrame(cam.raf); releaseUploadedPhoto(); }
$('flip').onclick = () => {
  if (cam.photoMode) { choosePhoto(); return; }
  state.facing = state.facing === 'user' ? 'environment' : 'user'; cam.kp = null; startCamera();
};
$('camBack').onclick = () => show(state.camOrigin === 'result' ? 'result' : 'intro');

// 估計現場亮度（0.4～1.4），讓衣服的打光跟環境接近
const lightC = document.createElement('canvas'); lightC.width = lightC.height = 8;
function videoLight(source = video) {
  try {
    const g = lightC.getContext('2d', { willReadFrequently: true });
    g.drawImage(source, 0, 0, 8, 8);
    const d = g.getImageData(0, 0, 8, 8).data;
    let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11;
    return Math.min(1.4, Math.max(.4, s / 64 / 255 * 2.2));
  } catch { return 1; }
}

function loop(now) {
  cam.raf = requestAnimationFrame(loop);
  // Still photos redraw only when tracking/model/garment/control state changes.
  const photoKey = [!!cam.pose, !!cam.parts, state.outfit, state.outfit==='physics'?fabricReady():haoriAssetsReady(),state.outfit==='physics'?haori3d?.settledSteps:0, cam.partsFailed, cam.partsAt, cam.lastSeen, state.char, state.weapon,
    fit.width, fit.length, stage.width, stage.height].join('|');
  if (cam.photoMode ? photoKey !== cam.photoRenderKey : now - (cam.lastPhotoRender || 0) >= 33) {
    const began=performance.now();renderFrame(now);cam.renderMs=performance.now()-began; cam.lastPhotoRender = now; cam.photoRenderKey = photoKey;
  }
  if (cam.shotAt && now >= cam.shotAt) { cam.shotAt = 0; cam.wantShot = true; }
  if (cam.wantShot) { cam.wantShot = false; takeShot(now); }
}

// Local background samples estimate dominant light side/color. This is not a
// recovered HDR environment or camera depth-of-field model.
function sceneLight(ctx,kp,brightness) {
  const S=Math.hypot(kp.rs.x-kp.ls.x,kp.rs.y-kp.ls.y),x=(kp.ls.x+kp.rs.x)/2,y=(kp.ls.y+kp.rs.y)/2;
  const sample=(sx,sy)=>{
    const x0=Math.max(0,Math.min(ctx.canvas.width-1,Math.round(sx-8))),y0=Math.max(0,Math.min(ctx.canvas.height-1,Math.round(sy-8)));
    const w=Math.min(16,ctx.canvas.width-x0),h=Math.min(16,ctx.canvas.height-y0),d=ctx.getImageData(x0,y0,w,h).data,sum=[0,0,0];
    for(let i=0;i<d.length;i+=4)for(let k=0;k<3;k++)sum[k]+=d[i+k];return sum.map(v=>v/(w*h));
  };
  const a=sample(x-S*.8,y-S*.3),b=sample(x+S*.8,y-S*.3),lum=c=>c[0]*.3+c[1]*.59+c[2]*.11;
  const avg=a.map((v,i)=>(v+b[i])/2),max=Math.max(...avg,1);
  return {brightness:Math.max(.45,Math.min(1.3,lum(avg)/255*1.5+.12)),x:Math.abs(lum(a)-lum(b))<12?-.55:clampLight((lum(b)-lum(a))/100),color:avg.map(c=>.82+.18*c/max)};
}
const clampLight=x=>Math.max(-1.2,Math.min(1.2,x));

function mapTrackedPose(crop, W, H, mirror) {
  if (!cam.kp) return null;
  const previous = cam.trackCrop || { dx: 0, dy: 0, dw: cam.trackW || W, dh: cam.trackH || H };
  return Object.fromEntries(Object.entries(cam.kp).map(([k, p]) => {
    const x = ((cam.trackMirror ? cam.trackW - p.x : p.x) - previous.dx) / previous.dw;
    const y = (p.y - previous.dy) / previous.dh;
    const projectedX = crop.dx + x * crop.dw;
    return [k, { ...p, x: mirror ? W - projectedX : projectedX, y: crop.dy + y * crop.dh, z: p.z * crop.dw / previous.dw }];
  }));
}

function renderFrame(now, ctx = sctx, W = stage.width, H = stage.height, capture = false) {
  if (W < 2 || H < 2) return; // 手機旋轉／瀏覽器改尺寸的瞬間不要把 0×0 畫布交給 WebGL
  if (cam.photoDemo && cam.pose) $('loadState').textContent = 'AI 模特示範';
  const c = gear();
  const mirror = !cam.photoMode && state.facing === 'user';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0f0c0b'; ctx.fillRect(0, 0, W, H);

  // 1. 背景：相機畫面（cover 填滿，前鏡頭鏡像）
  let kp = null, personMask = null, parts = null;
  const source = cam.uploadedPhoto || (cam.photoDemo ? cam.previewPhoto : video);
  if ((!cam.demo || cam.photoMode) && (cam.photoMode ? source?.naturalWidth : video.readyState >= 2 && video.videoWidth)) {
    const vw = source.videoWidth || source.naturalWidth, vh = source.videoHeight || source.naturalHeight;
    const s = cam.photoMode ? Math.min(W / vw, H / vh) : Math.max(W / vw, H / vh);
    const dw = vw * s, dh = vh * s, dx = (W - dw) / 2, dy = (H - dh) / 2;
    const crop = { dx, dy, dw, dh };
    ctx.save();
    if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    ctx.filter = state.outfit==='physics'?'none':'contrast(1.025) saturate(1.025)';
    ctx.drawImage(source, dx, dy, dw, dh);
    ctx.filter = 'none';
    ctx.restore();
    if (!capture && !(cam.frame++ % 20)) {
      const measured = videoLight(source); cam.light = cam.light == null ? measured : cam.light * .8 + measured * .2;
    }
    const sourceTime = cam.photoMode ? 0 : video.currentTime;
    if (!capture && cam.pose && sourceTime !== cam.lastVideoTime && now - (cam.detectAt || 0) >= 40) {
      cam.detectAt = now;
      cam.lastVideoTime = sourceTime;
      const res = cam.pose.detectForVideo(source, now);
      try {
      if (res.segmentationMasks?.[0]) {
        copyPersonMask(res.segmentationMasks[0], maskVideo); cam.maskAt = now;
      }
      const lms = res.landmarks?.[0];
      if (lms) {
        const map = (x, y, z) => [mirror ? W - (dx + x * dw) : dx + x * dw, dy + y * dh, -(z || 0) * dw];
        const raw = fromLandmarks(lms, map, mirror, res.worldLandmarks?.[0]);
        const rf = frame(raw), shoulderW = Math.hypot(raw.rs.x - raw.ls.x, raw.rs.y - raw.ls.y);
        const bodyRatio = shoulderW / rf.T;
        const hipsReady = raw.lh.v > .32 && raw.rh.v > .32;
        // 手持自拍只需要頭和雙肩；髖部沒入鏡時由肩線建立虛擬胸腔。
        const torsoReady = raw.ls.v > .52 && raw.rs.v > .52 && (cam.photoMode ? raw.n.v > .55 : raw.n.v > .42 || hipsReady)
          && shoulderW > Math.min(W, H) * .075 && rf.T > Math.min(W, H) * .055
          && bodyRatio > .16 && bodyRatio < 2.2;
        if (torsoReady) {
          const previous = mapTrackedPose(crop, W, H, mirror);
          cam.kp = smooth(previous, raw); cam.trackW = W; cam.trackH = H; cam.trackCrop = crop; cam.trackMirror = mirror; cam.lastSeen = now;
        }
      }
      } finally { res.close(); }
    }
    // A photo is segmented once (including when the optional model loads late).
    // Live masks are deliberately slower than pose inference to limit phone cost.
    if (!capture && cam.parts && sourceTime !== cam.partsSourceTime && (cam.photoMode || now - (cam.partsAttemptAt || 0) > 600)) {
      cam.partsAttemptAt = now;
      try {
        const result = cam.parts.segmentForVideo(source, now);
        try { if (copyPartMasks(result, headVideo, skinVideo)) cam.partsAt = now; }
        finally { result.close(); }
        cam.partsSourceTime = sourceTime;
      } catch (e) { console.warn('semantic frame failed', e); cam.partsSourceTime = sourceTime; }
    }
    if ((cam.photoMode || now - cam.lastSeen < 400) && cam.kp) kp = mapTrackedPose(crop, W, H, mirror);
    else if (cam.kp) { cam.kp = null; cam.trail = []; }
    if (kp && cam.maskAt && (cam.photoMode || now - cam.maskAt < 400)) {
      sizeLayer(maskScreen, W, H);
      const mg = maskScreen.getContext('2d'); mg.clearRect(0, 0, W, H);
      drawMappedMask(mg, maskVideo, { dx, dy, dw, dh }, mirror, W); personMask = maskScreen;
    }
    if (kp && cam.partsAt && (cam.photoMode || now - cam.partsAt < 850)) {
      for (const [src, dst] of [[headVideo, headScreen], [skinVideo, skinScreen]]) {
        sizeLayer(dst, W, H); const g = dst.getContext('2d'); g.clearRect(0, 0, W, H);
        drawMappedMask(g, src, crop, mirror, W);
      }
      parts = { head: headScreen, skin: skinScreen };
    }
  } else if (cam.demo) {
    // 示範人偶：在站姿與招式之間來回
    if (!capture) cam.demoT += 1 / 60;
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

  sizeLayer(atmosphereLayer, W, H);
  const ag = atmosphereLayer.getContext('2d'); ag.clearRect(0, 0, W, H);
  if(state.outfit!=='physics'||state.mode==='move')drawAtmosphere(ag, W, H, c, kp, now);
  if (personMask) {
    ag.save(); ag.globalCompositeOperation = 'destination-out'; ag.drawImage(personMask, 0, 0); ag.restore();
  }
  ctx.drawImage(atmosphereLayer, 0, 0);
  if (kp) {
    sizeLayer(garmentLayer, W, H); sizeLayer(foregroundLayer, W, H);
    const gg = garmentLayer.getContext('2d'); gg.clearRect(0, 0, W, H);
    const measuredEase = silhouetteEase(personMask,kp);
    if(!capture)cam.clothEase = cam.clothEase==null?measuredEase:cam.clothEase*.92+measuredEase*.08;
    const usePhysics=state.outfit==='physics';
    let rendered;
    if(usePhysics){haori3d ||=new Haori3D();rendered=haori3d.render(W,H,kp,c,{fit,ease:cam.clothEase||measuredEase,photo:cam.photoMode,capture,now,light:sceneLight(ctx,kp,cam.light??1)});}
    else {const ready=drawRealHaori(gg,kp,c,cam.light??1,fit);rendered={ready,valid:ready,unsupported:buildHaoriRig(kp)?.unsupported};$('physicsReport').textContent='原版為 2.5D 照片貼合；未啟用布料物理。切換「3D 物理布料（測試）」才會顯示物理檢查。';}
    const outfitReady=rendered.ready,unsupported=rendered.unsupported;
    cam.fitValid=outfitReady&&rendered.valid;
    if(outfitReady&&rendered.canvas)gg.drawImage(rendered.canvas,0,0);
    if(rendered.metrics){
      const m=rendered.metrics;
      $('physicsReport').textContent=`重力 ${m.gravity.toFixed(2)} m/s² · 面積重量 ${(m.density*1000).toFixed(0)} g/m²\n估計衣重 ${(m.massKg*1000).toFixed(0)} g · 最大網格拉伸 ${(m.maxStretch*100).toFixed(1)}%\n各部位 ${m.parts.map(p=>p.name+':'+(p.maxStretch*100).toFixed(1)+'%').join(' / ')}\n估計俯仰 ${m.pitch.toFixed(1)}° · 重投影誤差 ${m.reprojectionPx.toFixed(1)} px\n上次合成耗時 ${(cam.renderMs||0).toFixed(1)} ms（含辨識／布料，不等於實機 FPS）\n${m.finite&&m.maxStretch<.05?'通過 5% 拉伸門檻':'未通過 5% 拉伸門檻'}。示範參數；人體尺度與光線是影像估計，不是實測尺寸。`;
    }
    if (!cam.demo || cam.photoMode) cutForeground(garmentLayer, foregroundLayer, kp, personMask, ctx.canvas, parts);
    ctx.drawImage(garmentLayer, 0, 0);
    if (cam.photoMode) {
      $('shutter').disabled = !cam.fitValid;
      $('loadState').textContent = unsupported ? (rendered.reason==='projection'?'視角估計不穩，請換較清楚的照片':'側身角度太大，請換較正面的照片')
        : outfitReady ? (rendered.settling?`布料垂墜計算 ${Math.round(rendered.progress*100)}%`:!rendered.valid?'布料拉伸過大，請微調姿勢':cam.photoDemo?'AI 模特示範':!usePhysics?'原版貼合 · 本機處理':parts ? '3D 布料 · 本機處理' : cam.partsFailed ? '3D 布料 · 基本遮擋' : '3D 布料 · 遮罩載入中') : '載入布料／視角估計中…';
    } else if (!cam.demo) {
      $('loadState').textContent = unsupported ? '請稍微轉回正面' : '';
      $('shutter').disabled = !cam.fitValid;
    }
  } else if (cam.photoMode) {
    $('shutter').disabled = true;
    if (cam.uploadedPhoto && cam.pose) $('loadState').textContent = '請換一張臉與雙肩清楚的照片';
  } else if (!cam.demo) {
    $('shutter').disabled = true;
    if (cam.pose) $('loadState').textContent = '請讓臉與雙肩清楚入鏡';
  }

  // 2. 招式吻合度
  let res = null, guide = null;
  const handReady = (s) => kp?.[s + 'e']?.v > .5 && kp?.[s + 'w']?.v > .48;
  const freeHand = handReady('r') ? 'r' : handReady('l') ? 'l' : null;
  const armsReady = state.mode === 'free' ? !!freeHand : c.move.hand === 'both' ? handReady('l') && handReady('r') : handReady(c.move.hand);
  if (kp && armsReady && state.mode === 'move' && now - cam.firedAt > 1600) {
    res = matchPose(kp, c.move.pose);
    if (!capture) cam.match += (res.score - cam.match) * .3;
    guide = guidePose(kp, c, res);
    if (!capture && cam.match > .8 && now > cam.cool) {
      cam.hold ||= now;
      if (now - cam.hold > 650) { cam.firedAt = now; cam.cool = now + 3200; cam.hold = 0; cam.shotAt = now + 450; }
    } else if (!capture) cam.hold = 0;
  } else if ((!kp || !armsReady) && !capture) { cam.match = 0; cam.hold = 0; }
  const pct = Math.round(Math.min(1, Math.max(0, (cam.match - .35) / .45)) * 100);
  $('meterText').textContent = !kp ? '請把臉和雙肩放進畫面' : !armsReady ? '再把雙手放進畫面' : (cam.hold ? '保持住！' : `招式吻合 ${pct}%`);
  $('meterBar').style.width = (kp ? pct : 0) + '%';

  // 3. 3D 服裝與武器（招式框的淡影一起畫）
  stage3d.setCharacter(c);
  if (kp || guide) {
    const assist = state.mode === 'move' ? Math.max(0, (cam.match - .5) * 2) : 0;
    const wp = state.weapon !== 'none' && kp && armsReady && weaponPose(kp, c, c.move.blade, cam.demo && !cam.photoMode ? 1 : assist, state.mode === 'free' ? freeHand : null);
    // 招式發動時吹一陣風：衣服往刀的反方向翻飛
    const ft0 = (now - cam.firedAt) / 1000, gust = cam.firedAt && ft0 < 1.4 ? (1 - ft0 / 1.4) * (wp?.T || 0) * (1.2 + .4 * Math.sin(now / 45)) : 0;
    const bd = c.move.blade, wind = gust ? { x: -bd[0] * gust, y: -bd[1] * gust - gust * .2 } : null;
    const sheaths=state.weapon!=='none'&&kp&&c.weapon.kind!=='naginata'?scabbardPoses(kp,W,H,mirror,c.offhand||c.weapon.kind==='twin'?2:1,c.weapon.kind==='kodachi',state.outfit==='physics'?haori3d?.focalRatio:cam.propsFocalRatio):[];
    if(sheaths[0])cam.propsFocalRatio ||=sheaths[0].focalRatio;
    sizeLayer(weaponLayer,W,H);const wg=weaponLayer.getContext('2d');wg.clearRect(0,0,W,H);
    wg.drawImage(stage3d.render(W, H, { kp, blades: wp?.blades, sheaths, ghostKp: capture ? null : guide?.tg, ghostBlades: capture || state.weapon === 'none' ? null : guide?.blades, doll: cam.demo && !cam.photoMode, light: cam.light ?? 1, now, wind, outfit: state.outfit, realism:state.outfit==='physics',showOutfit: false }), 0, 0);
    if(kp&&(!cam.demo||cam.photoMode))cutForeground(weaponLayer,foregroundLayer,kp,personMask,ctx.canvas,parts);
    ctx.drawImage(weaponLayer,0,0);
    if (guide && !capture) drawGuide(ctx, guide.tg, c, res, (Math.sin(now / 250) + 1) / 2);
    if (wp && !capture) {
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
  if(state.outfit!=='physics'||state.mode==='move')drawCinematicFrame(ctx, W, H, c, cam.firedAt && ft < 1.6 ? ft : -1);
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
let shotUrl = null;
function takeShot(now) {
  if((!cam.demo||cam.photoMode)&&!cam.fitValid){updateHint('布料貼合尚未通過檢查，請換較清楚的姿勢，或微調寬鬆度。');return;}
  // Re-render from the camera + original garment asset at photo resolution.
  // Preview guides and controls are excluded; no user photo is uploaded.
  const photo = cam.uploadedPhoto || (cam.photoDemo ? cam.previewPhoto : null);
  const sourceH = photo ? photo.naturalHeight : video.videoHeight;
  const scale = photo ? Math.min(1, 2048 / Math.max(photo.naturalWidth, photo.naturalHeight))
    : Math.min(2048 / Math.max(stage.width, stage.height), Math.max(1, (sourceH || 1600) / stage.height));
  const W = Math.round((photo ? photo.naturalWidth : stage.width) * scale), H = Math.round((photo ? photo.naturalHeight : stage.height) * scale);
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const o = out.getContext('2d', { willReadFrequently: true });
  renderFrame(now, o, W, H, true);
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
    if (!b) { updateHint('照片製作失敗，請再拍一次。'); return; }
    shotBlob = b;
    const url = URL.createObjectURL(b);
    if (shotUrl) URL.revokeObjectURL(shotUrl); shotUrl = url;
    $('shot').src = url; $('save').href = url;
    $('sheet').hidden = false;
  }, 'image/jpeg', .96);
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
  if (['cam', 'photo'].includes(params.get('demo'))) openCam();
}
