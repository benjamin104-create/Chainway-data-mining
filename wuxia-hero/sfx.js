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

// ── 武俠決鬥配樂（150 BPM，D 小調五聲）──
//   太鼓重拍＋快速古箏撥弦琶音＋低音弦樂持續音＋笛子／胡琴主旋律＋每段開頭的鑼與鈸
//   用「提前排程」播放，拍子很穩；遊戲用 BEAT（一拍幾秒）把手勢排在拍點上
export const BEAT = 60 / 150;
const SPB = BEAT / 4;                                   // 十六分音符
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const SCALE = [50, 53, 55, 57, 60, 62, 65, 67, 69, 72, 74, 77, 79, 81];   // D 小調五聲，D3 起
// 和聲進行（每小節）：Dm Dm C A | Bb C Dm Dm（用五聲音裡的音代替）
const ROOT = [50, 50, 48, 45, 46, 48, 50, 50];
// 主旋律（八小節，每格十六分音符；數字是 SCALE 位置，-1 休止，-2 延長）
const LEAD = [
  9, -2, -2, 8, 9, -2, 10, -2, 11, -2, -2, -2, 10, -2, 9, -2,
  8, -2, 7, -2, 8, -2, 9, -2, 7, -2, -2, -2, -1, -1, -1, -1,
  7, -2, 8, -2, 9, -2, 10, 9, 8, -2, -2, -2, 7, -2, 5, -2,
  6, -2, -2, -2, 7, -2, 6, 5, 4, -2, -2, -2, -1, -1, -1, -1,
  9, -2, 10, -2, 11, -2, 12, -2, 13, -2, -2, -2, 12, 11, 10, -2,
  11, -2, 10, -2, 9, -2, 8, -2, 9, -2, -2, -2, -1, -1, 8, 9,
  10, -2, 9, -2, 8, -2, 7, -2, 8, -2, 7, -2, 6, -2, 5, -2,
  4, -2, -2, -2, -2, -2, -2, -2, -1, -1, -1, -1, -1, -1, -1, -1,
];
let music = null;
export function startMusic() {
  if (!ac || muted) return;
  stopMusic(.05);
  const bus = ac.createGain(); bus.gain.value = .6; bus.connect(master);
  // 一點點殘響（讓古箏和笛子有空間感）：用回授延遲模擬
  const dl = ac.createDelay(1), fb = ac.createGain(), wet = ac.createGain();
  dl.delayTime.value = BEAT * .75; fb.gain.value = .28; wet.gain.value = .22;
  const verb = ac.createGain(); verb.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(bus);
  music = { bus, verb, step: 0, next: ac.currentTime + .06, timer: null };
  const tick = () => { while (music && music.next < ac.currentTime + .15) { playStep(music.step, music.next, bus, verb); music.step++; music.next += SPB; } };
  tick(); music.timer = setInterval(tick, 25);
}
export function stopMusic(fade = .6) {
  if (!music) return;
  const m = music; music = null; clearInterval(m.timer);
  try { m.bus.gain.setTargetAtTime(0, ac.currentTime, Math.max(.01, fade / 3)); setTimeout(() => m.bus.disconnect(), fade * 1000 + 400); } catch {}
}
function env(g, t, a, peak, d) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.001, t + a + d); }
function playStep(i, t, bus, verb) {
  const st = i % 16, bar = Math.floor(i / 16) % 8, intro = i < 32;   // 前兩小節是倒數前奏（只有鼓）
  const osc = (type, f, dur, peak, a = .005, out = bus, f1) => {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, a, peak, dur); o.connect(g); g.connect(out); o.start(t); o.stop(t + a + dur + .05); return o;
  };
  const nz = (dur, type, f, q, peak) => {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ac.createGain(); env(g, t, .002, peak, dur); s.connect(fl); fl.connect(g); g.connect(bus); s.start(t, Math.random()); s.stop(t + dur + .05);
  };
  // 太鼓：咚—咚咚—咚，每兩小節最後來一串滾奏
  const roll = bar % 2 === 1 && st >= 12;
  if ([0, 3, 6, 8, 10].includes(st) || roll) osc('sine', 115, .32, roll ? .65 : .95, .002, bus, 42);
  if (st === 0) nz(.06, 'bandpass', 900, 1, .4);                          // 鼓皮的「啪」
  // 鼓邊（喀）
  if (st === 4 || st === 12) { nz(.07, 'bandpass', 2600, 2, .38); osc('triangle', 420, .05, .2); }
  // 鈸＋鑼：每四小節開頭（前奏不敲鑼）
  if (i % 64 === 0 && !intro) { for (const [f, g] of [[98, .2], [196, .12], [263, .08], [349, .05]]) osc('sine', f, 2.4, g, .01, bus, f * .985); nz(1.2, 'highpass', 5000, .7, .22); }
  if (intro) return;
  // 低音弦樂：每小節根音，鋸齒波低通、慢慢起音
  if (st === 0) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain();
    o.type = o2.type = 'sawtooth'; o.frequency.value = NOTE(ROOT[bar]); o2.frequency.value = NOTE(ROOT[bar]) * 1.004; fl.type = 'lowpass'; fl.frequency.value = 420;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.22, t + .15); g.gain.setValueAtTime(.2, t + SPB * 14); g.gain.linearRampToValueAtTime(0, t + SPB * 16);
    o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(bus); o.start(t); o2.start(t); o.stop(t + SPB * 16 + .05); o2.stop(t + SPB * 16 + .05);
  }
  // 古箏：快速十六分音符琶音（撥弦：短促起音、明亮、迅速衰減）
  {
    const pat = [0, 2, 4, 2, 5, 4, 2, 4, 0, 2, 4, 5, 7, 5, 4, 2];
    const n = SCALE[3 + pat[st]] + (ROOT[bar] - 50);       // 跟著和聲移調
    const o = ac.createOscillator(), o2 = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'triangle'; o2.type = 'sawtooth'; o.frequency.value = NOTE(n); o2.frequency.value = NOTE(n) * 2;
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(5000, t); fl.frequency.exponentialRampToValueAtTime(900, t + .25);
    const g2 = ac.createGain(); g2.gain.value = .25; o2.connect(g2); g2.connect(fl); o.connect(fl);
    env(g, t, .002, st % 4 === 0 ? .2 : .13, .4); fl.connect(g); g.connect(bus); g.connect(verb);
    o.start(t); o2.start(t); o.stop(t + .5); o2.stop(t + .5);
  }
  // 笛子／胡琴主旋律：滑音進入、顫音、帶氣聲
  const m = LEAD[i % 128];
  if (m >= 0) {
    let len = 1; while (len < 16 && LEAD[(i + len) % 128] === -2) len++;
    const f = NOTE(SCALE[m] + 12), d = SPB * len;
    const o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), fl = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f * .96, t); o.frequency.linearRampToValueAtTime(f, t + .06);
    lfo.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * .014, t + Math.min(.3, d * .6)); lfo.connect(lg); lg.connect(o.frequency);
    fl.type = 'bandpass'; fl.frequency.value = f * 1.6; fl.Q.value = 1.6;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.2, t + .04); g.gain.setValueAtTime(.18, t + d * .8); g.gain.exponentialRampToValueAtTime(.001, t + d + .12);
    o.connect(fl); fl.connect(g); g.connect(bus); g.connect(verb); o.start(t); lfo.start(t); o.stop(t + d + .15); lfo.stop(t + d + .15);
    nz(Math.min(.15, d), 'bandpass', f * 3, 2, .04);                       // 吹氣聲
  }
}
