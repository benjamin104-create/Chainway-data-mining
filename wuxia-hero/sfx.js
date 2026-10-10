// 音效：全部用 Web Audio 當場合成（不用下載音檔）
//   whoosh 集氣的風聲／boom 招式成功的重擊／zap 電流劈啪／drum 大字蹦出的鼓聲／gong 成品照出現的鑼聲
// iPhone 要使用者先點一下畫面，聲音才會開；靜音開關存在手機裡。

let ac = null, master = null, noiseBuf = null;
let muted = (() => { try { return localStorage.getItem('sfxMuted') === '1'; } catch { return false; } })();

export function unlock() {
  try {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ac = new AC(); master = ac.createGain(); master.gain.value = .9; master.connect(ac.destination);
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
