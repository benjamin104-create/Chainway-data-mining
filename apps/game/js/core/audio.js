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

    /* 音量平衡是量出來的：
       第一次設 音樂 0.30 / 音效 0.85，量到音樂峰值 0.146、音效只有 0.090，
       打擊聲整個被墊在音樂底下。音效是短瞬間的東西，峰值要壓得過音樂才聽得到。
       現在音效的峰值高於音樂，兩個一起響的總峰值仍離破音很遠。 */
    A.musicGain = A.ctx.createGain();
    A.musicGain.gain.value = 0.24;
    A.musicGain.connect(A.master);

    A.sfxGain = A.ctx.createGain();
    A.sfxGain.gain.value = 1.5;
    A.sfxGain.connect(A.master);

    A.ready = true;
    if (A.pendingKey) A.music(A.pendingKey, A.pendingMode);
  } catch (e) { /* 不能播就算了，不要讓遊戲掛掉 */ }
};

A.setOn = function (v) {
  A.on = !!v;
  if (A.master) A.master.gain.value = A.on ? 0.9 : 0;
  if (!A.on) A.stopMusic();
  else if (A.pendingKey) A.music(A.pendingKey, A.pendingMode);
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

/* ── 樂曲 ──
 *
 * 走的是日式 RPG 戰鬥曲那一路（太空戰士／勇者鬥惡龍那種），不是氛圍襯底。
 * 上一版是 62～84 BPM 的長音加疏落的分解和弦，聽起來像環境音，
 * 缺的就是「緊湊」：沒有旋律線、沒有走動的貝斯、沒有鼓。
 *
 * 這一版每首曲子有四層，跟那個年代的音源一樣：
 *   lead  主旋律，方波（脈衝），帶一點顫音
 *   bass  走動的貝斯，八分音符不停
 *   harm  和聲墊底，跟著和弦進行
 *   drums 大鼓／小鼓／腳踏鈸
 *
 * 和弦進行用的是那類曲子的常見手法：
 *   戰鬥 i – VI – VII – i（自然小調，往前推）
 *   魔王 i – bII – i – V（拿坡里和弦與導音，壓迫感）
 *   迷宮 i – VI – III – VII（沒有解決，一直懸著）
 *
 * 旋律全部是自己寫的，不是任何一首既有曲子的複製。
 *
 * 時間精度：用「預先排程」而不是 setInterval 一拍排一個音。
 * setInterval 會漂移，漂移聽起來就是不緊湊——這是這次的重點之一。
 * 排程器每 25ms 醒一次，把未來 120ms 內該響的音先排進 WebAudio 的時間軸，
 * 由音訊時鐘決定什麼時候出聲，誤差是取樣等級的。
 */

/* 音長單位是十六分音符。[半音, 長度]，半音是相對於該曲主音。
   null 表示休止。 */
const SONGS = {
  battle: {
    bpm: 150,
    chords: [0, 8, 10, 0],          // i – VI – VII – i
    lead: [
      [12,2],[15,2],[19,2],[15,2],[12,2],[14,2],[15,4],
      [8,2],[12,2],[15,2],[12,2],[8,2],[10,2],[12,4],
      [10,2],[14,2],[17,2],[14,2],[10,2],[12,2],[14,4],
      [12,2],[15,2],[19,4],[17,2],[15,2],[12,4]
    ],
    leadWave: 'square',
    drums: 'drive'
  },

  boss: {
    bpm: 168,
    chords: [0, 1, 0, 11],          // i – bII – i – VII(導音)
    lead: [
      [12,1],[13,1],[12,1],[13,1],[12,2],[15,2],[18,4],[17,4],
      [13,1],[14,1],[13,1],[14,1],[13,2],[16,2],[19,4],[18,4],
      [12,2],[18,2],[17,2],[15,2],[12,2],[11,2],[12,4],
      [23,2],[22,2],[20,2],[18,2],[17,4],[12,4]
    ],
    leadWave: 'sawtooth',
    drums: 'heavy'
  },

  maze: {
    bpm: 116,
    chords: [0, 8, 3, 10],          // i – VI – III – VII，一直懸著
    lead: [
      [12,4],[15,2],[14,2],[12,4],[7,4],
      [8,4],[12,2],[10,2],[8,8],
      [15,4],[19,2],[17,2],[15,4],[12,4],
      [14,4],[12,2],[10,2],[7,8]
    ],
    leadWave: 'triangle',
    drums: 'soft'
  }
};

/* 七章各自的主音與音色。同一首曲子換個調、換個音色，七章聽起來就不一樣。 */
const CHAPTER_KEY = {
  atlantis: { root: 220.00, wave: 'triangle' },   // A
  knossos:  { root: 246.94, wave: 'square'   },   // B
  troy:     { root: 196.00, wave: 'square'   },   // G
  cyclops:  { root: 174.61, wave: 'sawtooth' },   // F
  amazon:   { root: 261.63, wave: 'square'   },   // C
  colossus: { root: 164.81, wave: 'sawtooth' },   // E
  pharos:   { root: 293.66, wave: 'triangle' },   // D
  _default: { root: 220.00, wave: 'square'   }
};

const semi = (root, n) => root * Math.pow(2, n / 12);

/* 一個帶包絡的聲音。attack 很短、decay 收得快，才有那種顆粒感，
   拖長的話整首會糊成一片。 */
function voice(bus, when, f, dur, vol, wave, opt) {
  opt = opt || {};
  const o = A.ctx.createOscillator();
  const g = A.ctx.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(f, when);
  if (opt.vibrato) {
    const lfo = A.ctx.createOscillator();
    const lg = A.ctx.createGain();
    lfo.frequency.value = 5.5;
    lg.gain.value = f * 0.008;
    lfo.connect(lg); lg.connect(o.frequency);
    lfo.start(when); lfo.stop(when + dur);
  }
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(vol, when + 0.012);
  g.gain.setValueAtTime(vol, when + Math.max(0.02, dur * 0.55));
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g);
  if (opt.filter) {
    const flt = A.ctx.createBiquadFilter();
    flt.type = 'lowpass'; flt.frequency.value = opt.filter;
    g.connect(flt); flt.connect(bus);
  } else g.connect(bus);
  o.start(when);
  o.stop(when + dur + 0.03);
}

function drumKick(bus, when) {
  const o = A.ctx.createOscillator(), g = A.ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(140, when);
  o.frequency.exponentialRampToValueAtTime(42, when + 0.12);
  g.gain.setValueAtTime(0.5, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
  o.connect(g); g.connect(bus);
  o.start(when); o.stop(when + 0.18);
}

function drumNoise(bus, when, dur, vol, hz, type) {
  if (!noiseBuf) {
    noiseBuf = A.ctx.createBuffer(1, A.ctx.sampleRate * 0.5, A.ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = A.ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = A.ctx.createBiquadFilter();
  f.type = type || 'bandpass';
  f.frequency.value = hz;
  const g = A.ctx.createGain();
  g.gain.setValueAtTime(vol, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(f); f.connect(g); g.connect(bus);
  src.start(when); src.stop(when + dur + 0.02);
}

/* 鼓組。三種力度，對應三首曲子。 */
function drums(bus, when, step16, kind) {
  const s = step16 % 16;
  if (kind === 'soft') {
    if (s === 0 || s === 8) drumKick(bus, when);
    if (s % 4 === 2) drumNoise(bus, when, 0.04, 0.05, 8000, 'highpass');
    return;
  }
  const heavy = kind === 'heavy';
  if (s === 0 || s === 8 || (heavy && s === 6) || s === 10) drumKick(bus, when);
  if (s === 4 || s === 12) drumNoise(bus, when, 0.12, heavy ? 0.32 : 0.24, 1900);
  if (s % 2 === 0) drumNoise(bus, when, 0.03, heavy ? 0.09 : 0.06, 9000, 'highpass');
}

/* ── 排程器 ──
   每 25ms 醒一次，把未來 120ms 內的音先排好。
   音什麼時候響是由音訊時鐘決定的，不是由 setInterval 決定的，
   所以節奏不會漂。 */
const LOOKAHEAD = 0.12, TICK = 25;

A.music = function (key, mode) {
  A.pendingKey = key;
  A.pendingMode = mode || 'battle';
  if (!A.ready || !A.on) return;
  const id = key + '|' + A.pendingMode;
  if (A.key === id && A.timer) return;          // 同一首就不要重開
  A.stopMusic();
  A.key = id;

  const song = SONGS[A.pendingMode] || SONGS.battle;
  const ck = CHAPTER_KEY[key] || CHAPTER_KEY._default;
  const root = ck.root;
  const sixteenth = 60 / song.bpm / 4;

  // 把旋律攤平成「第幾個十六分音符 → 音」
  const leadAt = {};
  let cursor = 0;
  song.lead.forEach(([n, len]) => {
    if (n != null) leadAt[cursor] = { n: n, len: len };
    cursor += len;
  });
  const totalSteps = Math.max(cursor, song.chords.length * 16);

  A.step = 0;
  let nextTime = A.ctx.currentTime + 0.06;

  const schedule = () => {
    if (!A.ready || !A.on) return;
    try {
      while (nextTime < A.ctx.currentTime + LOOKAHEAD) {
        const s = A.step % totalSteps;
        const bar = Math.floor(s / 16) % song.chords.length;
        const chord = song.chords[bar];

        // 貝斯：八分音符不停地走，第 3 拍跳高八度
        if (s % 2 === 0) {
          const jump = (s % 16 === 8 || s % 16 === 12) ? 12 : 0;
          voice(A.musicGain, nextTime, semi(root, chord + jump - 24),
                sixteenth * 1.9, 0.20, 'triangle', { filter: 700 });
        }
        // 和聲：每小節兩下，三度與五度
        if (s % 8 === 0) {
          voice(A.musicGain, nextTime, semi(root, chord - 12), sixteenth * 6, 0.055, 'square', { filter: 1100 });
          voice(A.musicGain, nextTime, semi(root, chord - 12 + 7), sixteenth * 6, 0.045, 'square', { filter: 1100 });
        }
        // 主旋律
        const ld = leadAt[s];
        if (ld) {
          voice(A.musicGain, nextTime, semi(root, ld.n), sixteenth * ld.len * 0.92,
                0.105, ck.wave || song.leadWave, { vibrato: ld.len >= 4, filter: 3200 });
        }
        // 鼓
        drums(A.musicGain, nextTime, s, song.drums);

        nextTime += sixteenth;
        A.step++;
      }
    } catch (e) { /* 排不出來就安靜 */ }
  };

  schedule();
  A.timer = setInterval(schedule, TICK);
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
