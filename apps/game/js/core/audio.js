/* 聲音：全部用 WebAudio 現場合成，不載任何音檔
 *
 * 為什麼不放 mp3：這個遊戲是以 Artifact 的形式發佈的，
 * 外部網址的音檔會被 CSP 擋掉，內嵌成 data URI 又會讓整包大好幾 MB。
 * 所以這裡用振盪器與雜訊自己合成，整個聲音系統只有幾 KB。
 *
 * 兩個重要的限制：
 * 1. 瀏覽器不准網頁自己開始播聲音，一定要等使用者按過東西。
 *    所以 ready 在第一次點擊／按鍵之前都是 false，之前的呼叫全部是空操作。
 * 2. 戰鬥模擬在無頭測試裡一秒會跑幾千幀。
 *    ready 是 false 時什麼都不會發生，所以測試不會被拖垮；
 *    真的在播的時候也有每秒上限，免得二十隻小兵同時打人變成一團噪音。
 */
window.G = window.G || {};

const A = {
  ready: false,      // 使用者按過東西了沒
  on: true,          // 玩家有沒有關掉聲音
  ctx: null,
  master: null,
  musicGain: null,
  sfxGain: null,
  timer: null,
  key: null,         // 現在在播哪一章的曲子
  step: 0
};
G.Audio = A;

/* ── 音階 ──
   每一章給一組音階與速度。用的都是自然小調／多利安這類「古老」的音階，
   聽起來不會像流行樂。 */
const SCALES = {
  atlantis:  { root: 196.00, steps: [0, 2, 3, 5, 7, 8, 10], bpm: 62, wave: 'sine',     color: 620 },
  knossos:   { root: 220.00, steps: [0, 1, 5, 7, 8],        bpm: 70, wave: 'triangle', color: 760 },
  troy:      { root: 174.61, steps: [0, 2, 3, 7, 10],       bpm: 76, wave: 'sawtooth', color: 540 },
  cyclops:   { root: 146.83, steps: [0, 3, 5, 6, 10],       bpm: 58, wave: 'square',   color: 420 },
  amazon:    { root: 233.08, steps: [0, 2, 4, 7, 9],        bpm: 84, wave: 'triangle', color: 900 },
  colossus:  { root: 164.81, steps: [0, 2, 3, 5, 7, 10],    bpm: 66, wave: 'sawtooth', color: 500 },
  pharos:    { root: 261.63, steps: [0, 2, 5, 7, 9],        bpm: 72, wave: 'sine',     color: 1100 },
  _default:  { root: 196.00, steps: [0, 2, 3, 5, 7],        bpm: 68, wave: 'triangle', color: 700 }
};

function freq(sc, degree, octave) {
  const n = sc.steps[((degree % sc.steps.length) + sc.steps.length) % sc.steps.length];
  return sc.root * Math.pow(2, (n + (octave || 0) * 12) / 12);
}

/* ── 起動 ── */
A.unlock = function () {
  if (A.ready) return;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;                       // 瀏覽器不支援就安靜地算了
  try {
    A.ctx = new Ctor();
    A.master = A.ctx.createGain();
    A.master.gain.value = A.on ? 0.9 : 0;
    A.master.connect(A.ctx.destination);

    A.musicGain = A.ctx.createGain();
    A.musicGain.gain.value = 0.30;         // 音樂要退到後面，不能蓋掉音效
    A.musicGain.connect(A.master);

    A.sfxGain = A.ctx.createGain();
    A.sfxGain.gain.value = 0.85;
    A.sfxGain.connect(A.master);

    A.ready = true;
    if (A.pendingKey) A.music(A.pendingKey);
  } catch (e) { /* 不能播就算了，不要讓遊戲掛掉 */ }
};

A.setOn = function (v) {
  A.on = !!v;
  if (A.master) A.master.gain.value = A.on ? 0.9 : 0;
  if (!A.on) A.stopMusic();
  else if (A.pendingKey) A.music(A.pendingKey);
};

/* ── 音效 ──
   每秒最多這麼多個，超過就丟掉。
   二十隻小兵同時互砍的話，不設限會變成一團爆音。 */
let budget = 14, budgetAt = 0;
function take() {
  if (!A.ready || !A.on) return false;
  const now = A.ctx.currentTime;
  if (now - budgetAt > 1) { budget = 14; budgetAt = now; }
  if (budget <= 0) return false;
  budget--;
  return true;
}

function tone(opt) {
  const t = A.ctx.currentTime;
  const o = A.ctx.createOscillator();
  const g = A.ctx.createGain();
  o.type = opt.wave || 'square';
  o.frequency.setValueAtTime(opt.f0, t);
  if (opt.f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, opt.f1), t + opt.dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(opt.vol || 0.2, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + opt.dur);
  o.connect(g);
  if (opt.filter) {
    const f = A.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = opt.filter;
    g.connect(f); f.connect(opt.bus || A.sfxGain);
  } else {
    g.connect(opt.bus || A.sfxGain);
  }
  o.start(t);
  o.stop(t + opt.dur + 0.02);
}

/* 雜訊：撞擊、爆炸、腳步用 */
let noiseBuf = null;
function noise(dur, vol, filterHz, sweepTo) {
  const t = A.ctx.currentTime;
  if (!noiseBuf) {
    noiseBuf = A.ctx.createBuffer(1, A.ctx.sampleRate * 0.5, A.ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = A.ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = A.ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(filterHz, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t + dur);
  const g = A.ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(A.sfxGain);
  src.start(t);
  src.stop(t + dur + 0.02);
}

const SFX = {
  hit:      () => { noise(0.07, 0.16, 1800, 500); tone({ f0: 180, f1: 90, dur: 0.06, vol: 0.10 }); },
  crit:     () => { noise(0.10, 0.22, 3200, 700); tone({ f0: 420, f1: 150, dur: 0.12, vol: 0.16, wave: 'sawtooth' }); },
  hurt:     () => { tone({ f0: 300, f1: 90, dur: 0.22, vol: 0.22, wave: 'sawtooth', filter: 900 }); },
  kill:     () => { noise(0.16, 0.14, 1200, 240); },
  skill:    () => { tone({ f0: 300, f1: 900, dur: 0.20, vol: 0.18, wave: 'triangle' });
                    tone({ f0: 600, f1: 1500, dur: 0.16, vol: 0.08, wave: 'sine' }); },
  hire:     () => { tone({ f0: 520, dur: 0.08, vol: 0.16, wave: 'square' });
                    setTimeout(() => { if (take()) tone({ f0: 780, dur: 0.12, vol: 0.14, wave: 'square' }); }, 70); },
  coin:     () => { tone({ f0: 900, dur: 0.05, vol: 0.12, wave: 'square' });
                    setTimeout(() => { if (A.ready && A.on) tone({ f0: 1350, dur: 0.09, vol: 0.10, wave: 'square' }); }, 55); },
  pickup:   () => { tone({ f0: 660, f1: 1320, dur: 0.18, vol: 0.16, wave: 'triangle' }); },
  tower:    () => { noise(0.5, 0.3, 900, 90); tone({ f0: 90, f1: 40, dur: 0.5, vol: 0.22, wave: 'square' }); },
  boss:     () => { tone({ f0: 70, f1: 46, dur: 1.2, vol: 0.30, wave: 'sawtooth', filter: 320 });
                    noise(0.8, 0.18, 500, 120); },
  cast:     () => { tone({ f0: 140, f1: 520, dur: 0.35, vol: 0.20, wave: 'sawtooth', filter: 1400 }); },
  win:      () => { [0, 4, 7, 12].forEach((n, i) => setTimeout(() => { if (A.ready && A.on)
                      tone({ f0: 392 * Math.pow(2, n / 12), dur: 0.32, vol: 0.16, wave: 'triangle' }); }, i * 110)); },
  lose:     () => { [0, -3, -7, -12].forEach((n, i) => setTimeout(() => { if (A.ready && A.on)
                      tone({ f0: 330 * Math.pow(2, n / 12), dur: 0.42, vol: 0.16, wave: 'sawtooth', filter: 700 }); }, i * 160)); },
  step:     () => { noise(0.05, 0.05, 700, 300); },
  door:     () => { tone({ f0: 220, f1: 440, dur: 0.16, vol: 0.14, wave: 'triangle' }); },
  trap:     () => { tone({ f0: 200, f1: 60, dur: 0.3, vol: 0.22, wave: 'square', filter: 600 }); },
  click:    () => { tone({ f0: 660, dur: 0.04, vol: 0.10, wave: 'square' }); }
};

A.sfx = function (name) {
  if (!take()) return;
  const fn = SFX[name];
  if (!fn) return;
  try { fn(); } catch (e) { /* 播不出來就算了 */ }
};

/* ── 音樂 ──
   一個很簡單的循環：低音長音 + 分解和弦 + 偶爾一下敲擊。
   每一章的音階、速度、音色不同，所以七章聽起來不一樣。 */
A.music = function (key) {
  A.pendingKey = key;
  if (!A.ready || !A.on) return;
  if (A.key === key && A.timer) return;      // 同一首就不要重開
  A.stopMusic();
  A.key = key;
  A.step = 0;
  const sc = SCALES[key] || SCALES._default;
  const beat = 60 / sc.bpm / 2;              // 八分音符

  const tick = () => {
    if (!A.ready || !A.on) return;
    const s = A.step++;
    const bar = Math.floor(s / 8);

    try {
      // 低音：每兩小節換一次根音
      if (s % 8 === 0) {
        const deg = [0, 0, 4, 3][bar % 4];
        tone({ f0: freq(sc, deg, -1), dur: beat * 7.5, vol: 0.16,
               wave: 'sine', filter: sc.color * 0.5, bus: A.musicGain });
      }
      // 分解和弦
      const pattern = [0, 2, 4, 2, 5, 4, 2, 0];
      if (s % 2 === 0 || (s % 8) === 3) {
        const deg = pattern[s % 8] + [0, 0, 2, 1][bar % 4];
        tone({ f0: freq(sc, deg, 0), dur: beat * 1.6, vol: 0.085,
               wave: sc.wave, filter: sc.color, bus: A.musicGain });
      }
      // 高一個八度的點綴，每小節一次
      if (s % 8 === 6) {
        tone({ f0: freq(sc, pattern[(s + 2) % 8], 1), dur: beat * 2.2, vol: 0.05,
               wave: 'sine', filter: sc.color * 1.6, bus: A.musicGain });
      }
    } catch (e) { /* 忽略 */ }
  };

  tick();
  A.timer = setInterval(tick, beat * 1000);
};

A.stopMusic = function () {
  if (A.timer) { clearInterval(A.timer); A.timer = null; }
  A.key = null;
};

/* 第一次互動就解鎖。用 capture，確保比其他按鈕的處理先跑到。 */
['pointerdown', 'keydown', 'touchstart'].forEach(ev => {
  window.addEventListener(ev, function once() {
    A.unlock();
    ['pointerdown', 'keydown', 'touchstart'].forEach(e2 =>
      window.removeEventListener(e2, once, true));
  }, true);
});
