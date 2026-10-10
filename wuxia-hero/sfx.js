// 音效：全部用 Web Audio 當場合成（不用下載音檔）
//   whoosh 集氣的風聲／boom 招式成功的重擊／zap 電流劈啪／drum 大字蹦出的鼓聲／gong 成品照出現的鑼聲
// iPhone 要使用者先點一下畫面，聲音才會開；靜音開關存在手機裡。

let ac = null, master = null, noiseBuf = null, recDest = null;
let muted = (() => { try { return localStorage.getItem('sfxMuted') === '1'; } catch { return false; } })();

export function unlock() {
  try {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ac = new AC(); master = ac.createGain(); master.gain.value = .9; master.connect(ac.destination);
      try { recDest = ac.createMediaStreamDestination(); master.connect(recDest); } catch {}   // 錄影時把音樂、音效一起錄進去
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
  } catch {}
}
export const isMuted = () => muted;
export function setMuted(m) { muted = m; try { localStorage.setItem('sfxMuted', m ? '1' : '0'); } catch {} }
const ready = () => ac && !muted && ac.state === 'running';

function noise(t0, dur, { type = 'bandpass', f0 = 800, f1 = 800, q = 1, gain = .5, attack = .02 } = {}) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + attack); g.gain.exponentialRampToValueAtTime(.001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t0, Math.random()); s.stop(t0 + dur + .05);
}
function tone(t0, dur, { type = 'sine', f0 = 120, f1 = 40, gain = .6, attack = .005 } = {}) {
  const o = ac.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + attack); g.gain.exponentialRampToValueAtTime(.001, t0 + dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + .05);
}

// 集氣：由低往高掃的風聲
export function whoosh() { if (!ready()) return; const t = ac.currentTime; noise(t, .7, { f0: 300, f1: 2400, q: 1.2, gain: .35, attack: .25 }); }
// 招式成功：低頻重擊＋爆裂聲
export function boom() {
  if (!ready()) return; const t = ac.currentTime;
  tone(t, .9, { f0: 110, f1: 32, gain: .9 });
  noise(t, .5, { type: 'lowpass', f0: 3000, f1: 200, q: .7, gain: .7, attack: .003 });
  zap();
}
// 電流：幾下很短的高頻劈啪
export function zap() {
  if (!ready()) return; const t = ac.currentTime;
  for (let i = 0; i < 4; i++) noise(t + i * .035 + Math.random() * .02, .05, { type: 'highpass', f0: 2500 + Math.random() * 3000, f1: 1800, q: 2, gain: .22, attack: .002 });
}
// 大字蹦出：太鼓般的「咚」
export function drum(big = true) {
  if (!ready()) return; const t = ac.currentTime;
  tone(t, big ? .45 : .3, { f0: big ? 150 : 190, f1: big ? 55 : 80, gain: big ? .9 : .6 });
  noise(t, .08, { type: 'bandpass', f0: 1200, f1: 600, q: 1, gain: .35, attack: .002 });
}
// 成品照出現：鑼聲（幾個不和諧的泛音慢慢消失）
export function gong() {
  if (!ready()) return; const t = ac.currentTime;
  for (const [f, g] of [[98, .35], [196.7, .22], [262, .14], [347, .1], [523, .06]]) tone(t, 2.4, { type: 'sine', f0: f, f1: f * .985, gain: g, attack: .01 });
  noise(t, .25, { type: 'bandpass', f0: 2500, f1: 1200, q: .8, gain: .15, attack: .003 });
}

// 給錄影用：音樂和音效的聲音軌
export function audioTrack() { return recDest?.stream.getAudioTracks()[0] || null; }

// ── 江湖對戰配樂：太鼓＋小鼓＋沙鈴＋低音＋五聲音階的胡琴旋律（D 小調五聲：D F G A C），120 BPM ──
// 用「提前排程」的方式播放，節拍很穩；beat() 回傳目前是第幾拍（遊戲用來對拍）
const BPM = 120, SPB = 60 / BPM / 4;          // 一個十六分音符的秒數
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const PENTA = [62, 65, 67, 69, 72, 74, 77, 79, 81];      // D4 F4 G4 A4 C5 D5 F5 G5 A5
// 旋律（每格一個十六分音符，-1＝休止，數字＝PENTA 的位置），四小節一循環
const MEL = [
  4, -1, 3, 4, 5, -1, 4, -1, 3, -1, 2, 3, 4, -1, -1, -1,
  5, -1, 6, 5, 4, -1, 3, -1, 4, -1, 3, 2, 1, -1, -1, -1,
  0, -1, 1, 2, 3, -1, 4, -1, 5, -1, 4, 3, 4, -1, 6, -1,
  7, -1, 6, 5, 4, -1, 5, 4, 3, -1, 2, -1, 3, -1, -1, -1,
];
const BASS = [50, 50, 57, 48];                // 每小節的根音：D2 D2 A2 C2
let music = null;
export function startMusic() {
  if (!ac || muted) return;
  stopMusic();
  const bus = ac.createGain(); bus.gain.value = .55; bus.connect(master);
  music = { bus, step: 0, next: ac.currentTime + .08, t0: ac.currentTime + .08, timer: null };
  const tick = () => {
    while (music && music.next < ac.currentTime + .15) { playStep(music.step, music.next, bus); music.step++; music.next += SPB; }
  };
  tick(); music.timer = setInterval(tick, 25);
}
export function stopMusic(fade = .6) {
  if (!music) return;
  const m = music; music = null; clearInterval(m.timer);
  try { m.bus.gain.setTargetAtTime(0, ac.currentTime, fade / 3); setTimeout(() => m.bus.disconnect(), fade * 1000 + 300); } catch {}
}
function playStep(i, t, bus) {
  const st = i % 16, bar = Math.floor(i / 16) % 4;
  const hit = (dur, f0, f1, g, type = 'sine') => {
    const o = ac.createOscillator(), gg = ac.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    gg.gain.setValueAtTime(g, t); gg.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(gg); gg.connect(bus); o.start(t); o.stop(t + dur + .02);
  };
  const nz = (dur, type, f, q, g) => {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const gg = ac.createGain(); gg.gain.setValueAtTime(g, t); gg.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(fl); fl.connect(gg); gg.connect(bus); s.start(t, Math.random()); s.stop(t + dur + .02);
  };
  // 太鼓（大鼓）：咚、咚咚
  if ([0, 6, 8, 11].includes(st) || (bar === 3 && st >= 12 && st % 1 === 0 && st !== 13)) hit(.35, 120, 45, .9);
  // 小鼓（啪）
  if (st === 4 || st === 12) { nz(.12, 'bandpass', 1800, .8, .5); hit(.08, 300, 180, .25, 'triangle'); }
  // 沙鈴
  if (st % 2 === 0) nz(.04, 'highpass', 7000, 1, st % 4 === 2 ? .16 : .08);
  // 鑼：每四小節開頭
  if (i % 64 === 0) for (const [f, g] of [[98, .18], [197, .1], [262, .07]]) hit(2.2, f, f * .985, g);
  // 低音：每拍一下，八度跳
  if (st % 4 === 0 || st === 14) {
    const n = BASS[bar] + (st === 8 ? 12 : 0), o = ac.createOscillator(), fl = ac.createBiquadFilter(), gg = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = NOTE(n); fl.type = 'lowpass'; fl.frequency.value = 500;
    gg.gain.setValueAtTime(.32, t); gg.gain.exponentialRampToValueAtTime(.001, t + SPB * 3.5);
    o.connect(fl); fl.connect(gg); gg.connect(bus); o.start(t); o.stop(t + SPB * 4);
  }
  // 胡琴般的旋律：鋸齒波＋顫音＋濾波，滑音進入
  const m = MEL[i % 64];
  if (m >= 0) {
    let len = 1; while (len < 4 && MEL[(i + len) % 64] === -1) len++;
    const f = NOTE(PENTA[m]), o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), fl = ac.createBiquadFilter(), gg = ac.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f * .97, t); o.frequency.linearRampToValueAtTime(f, t + .05);
    lfo.frequency.value = 6; lg.gain.value = f * .012; lfo.connect(lg); lg.connect(o.frequency);
    fl.type = 'bandpass'; fl.frequency.value = f * 2.2; fl.Q.value = 1.2;
    const d = SPB * len;
    gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(.22, t + .03); gg.gain.setValueAtTime(.2, t + d * .7); gg.gain.exponentialRampToValueAtTime(.001, t + d + .08);
    o.connect(fl); fl.connect(gg); gg.connect(bus); o.start(t); lfo.start(t); o.stop(t + d + .1); lfo.stop(t + d + .1);
  }
}
