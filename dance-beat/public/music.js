// 音樂與音效：全部用 Web Audio 當場合成（原創曲、不用下載音檔、沒有版權問題）
//   三首歌：霓虹心跳（合成器流行）、夏日派對（熱帶浩室）、能量全開（電子舞曲）
//   段落：前奏倒數 → 主歌 → 漸強 → 副歌 → 間奏 → 副歌 → 收尾
//   用「提前排程」播放，拍子很穩；遊戲的時間以 AudioContext 的時鐘為準，動作卡跟音樂不會跑掉
let ac = null, master = null, noiseBuf = null, recDest = null;
let muted = (() => { try { return localStorage.getItem('beatMuted') === '1'; } catch { return false; } })();

export function unlock() {
  try {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ac = new AC(); master = ac.createGain(); master.gain.value = muted ? 0 : .85;
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4;
      master.connect(comp); comp.connect(ac.destination);
      try { recDest = ac.createMediaStreamDestination(); comp.connect(recDest); } catch {}   // 錄影時音樂一起錄
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
  } catch {}
}
export const isMuted = () => muted;
export function setMuted(m) { muted = m; try { localStorage.setItem('beatMuted', m ? '1' : '0'); } catch {} if (master) master.gain.setTargetAtTime(m ? 0 : .85, ac.currentTime, .05); }
export function audioTrack() { return recDest?.stream.getAudioTracks()[0] || null; }
// 遊戲時鐘：扣掉喇叭的延遲，畫面跟聽到的拍子對齊
export function clock() { return ac ? ac.currentTime - (ac.outputLatency || ac.baseLatency || 0) : performance.now() / 1000; }
export const ready = () => !!ac && ac.state === 'running';

export const SONGS = {
  neon: {
    zh: '霓虹心跳', en: 'NEON HEARTBEAT', vibe: '合成器流行・中速', bpm: 112, bars: 30, root: 57,   // A 小調
    prog: [[0, 'm'], [-4, 'M'], [-9, 'M'], [-2, 'M']],                                          // Am F C G
    lead: [2, -1, 1, 2, -1, 3, 2, 1, 0, -1, -1, 1, 2, -1, -1, -1, 2, -1, 1, 2, 3, -1, 4, 3, 2, -1, 1, -1, 0, -1, -1, -1],
    kit: { kick: 'punch', bass: 'oct', chord: 'pad', lead: 'square', hat: 'eighth' }, color: '#ff3fd2',
  },
  summer: {
    zh: '夏日派對', en: 'SUMMER PARTY', vibe: '熱帶浩室・輕快', bpm: 118, bars: 31, root: 60,   // C 大調
    prog: [[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M']],                                             // C G Am F
    lead: [0, -1, 2, -1, 3, -1, 2, 1, -1, 1, 2, -1, 0, -1, -1, -1, 2, -1, 3, -1, 4, -1, 3, 2, -1, 2, 1, -1, 2, -1, -1, -1],
    kit: { kick: 'soft', bass: 'pluck', chord: 'marimba', lead: 'pluck', hat: 'shaker' }, color: '#ffb52e',
  },
  power: {
    zh: '能量全開', en: 'POWER UP', vibe: '電子舞曲・快', bpm: 126, bars: 33, root: 50,   // D 小調
    prog: [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M']],                                           // Dm Bb F C
    lead: [0, 0, -1, 2, -1, 0, 3, -1, 2, -1, 1, -1, 0, -1, 2, -1, 0, 0, -1, 2, -1, 0, 4, -1, 3, -1, 2, -1, 1, -1, -1, -1],
    kit: { kick: 'hard', bass: 'saw', chord: 'stab', lead: 'saw', hat: 'sixteenth' }, color: '#2ff3ff',
  },
};

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
function env(g, t, a, peak, d) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.001, t + a + d); }
function osc(out, type, f, t, dur, peak, a = .005, f1) {
  const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, a, peak, dur); o.connect(g); g.connect(out); o.start(t); o.stop(t + a + dur + .05); return o;
}
function nz(out, t, dur, type, f, q, peak, a = .002, f1) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf; const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ac.createGain(); env(g, t, a, peak, dur); s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random()); s.stop(t + a + dur + .05);
}

let song = null;
// 開始播：回傳第 0 拍的時間（AudioContext 時鐘）
export function play(id) {
  unlock(); stop(.05);
  const S = SONGS[id] || SONGS.neon, spb = 60 / S.bpm / 4;
  const bus = ac.createGain(); bus.gain.value = .7; bus.connect(master);
  const dl = ac.createDelay(1), fb = ac.createGain(), wet = ac.createGain();
  dl.delayTime.value = spb * 3; fb.gain.value = .3; wet.gain.value = .25;
  const verb = ac.createGain(); verb.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(bus);
  // 側鏈「抽吸感」：和弦每一拍被大鼓壓一下
  const duck = ac.createGain(); duck.connect(bus);
  const t0 = ac.currentTime + .25;
  song = { S, spb, bus, verb, duck, step: 0, next: t0, t0, timer: null, total: S.bars * 16 };
  const tick = () => { while (song && song.next < ac.currentTime + .2 && song.step < song.total) { stepAt(song, song.step, song.next); song.step++; song.next += spb; } };
  tick(); song.timer = setInterval(tick, 25);
  return t0;
}
export function stop(fade = .6) {
  if (!song) return;
  const m = song; song = null; clearInterval(m.timer);
  try { m.bus.gain.setTargetAtTime(0, ac.currentTime, Math.max(.01, fade / 3)); setTimeout(() => { try { m.src?.stop(); } catch {} m.bus.disconnect(); }, fade * 1000 + 600); } catch {}
}
// 音檔（AI 做的歌、玩家自己的歌）：解碼一次，之後直接播；回傳第 0 拍（beat0 秒）的時間
export async function decode(arrayBuffer) { unlock(); return await ac.decodeAudioData(arrayBuffer); }
export function playBuffer(buf, beat0 = 0) {
  unlock(); stop(.05);
  const bus = ac.createGain(); bus.gain.value = .9; bus.connect(master);
  const src = ac.createBufferSource(); src.buffer = buf; src.connect(bus);
  const t0 = ac.currentTime + .25; src.start(t0);
  song = { bus, src, timer: null };
  return t0 + beat0;
}
function section(bar, n) {
  if (bar < 2) return 'intro';
  if (bar < 10) return 'verse';
  if (bar < 12) return 'build';
  if (bar < 20) return 'drop';
  if (bar < 22) return 'break';
  if (bar < n - 1) return 'drop2';
  return 'outro';
}
function stepAt(m, i, t) {
  const { S, spb, bus, verb, duck } = m, k = S.kit;
  const st = i % 16, bar = Math.floor(i / 16), sec = section(bar, S.bars);
  const [off, q] = S.prog[bar % 4], croot = S.root + off;
  const tones = q === 'm' ? [0, 3, 7, 12, 14] : [0, 4, 7, 12, 14];
  const full = sec === 'drop' || sec === 'drop2';
  if (sec === 'outro') {
    if (st === 0) { crash(bus, t); chord(m, t, croot, tones, spb * 16, .16, 'pad'); kick(bus, t, k.kick); }
    return;
  }
  // 大鼓：四拍各一下（前奏第一小節、間奏不打）
  const kickOn = !(bar === 0 || sec === 'break') && st % 4 === 0;
  if (kickOn) { kick(bus, t, k.kick); duck.gain.setValueAtTime(.25, t); duck.gain.linearRampToValueAtTime(1, t + spb * 3); }
  // 拍手／小鼓：二、四拍
  if ((sec === 'verse' || full) && (st === 4 || st === 12)) clap(bus, t, k.kick === 'hard');
  // 漸強：小鼓越打越密
  if (sec === 'build') {
    const dense = bar === 11 ? 1 : (st % 2 === 0 ? 1 : 0);
    if (dense) nz(bus, t, .08, 'bandpass', 1900, 1, .1 + .3 * ((bar - 10) * 16 + st) / 32);
    if (st === 0 && bar === 10) riser(bus, t, spb * 32);
  }
  if (full && bar % 8 === (sec === 'drop' ? 4 : 6) && st === 0) crash(bus, t);
  if ((sec === 'drop' && bar === 12 || sec === 'drop2' && bar === 22) && st === 0) crash(bus, t);
  // 鈸
  if (bar >= 1 && sec !== 'break') {
    if (k.hat === 'eighth' && st % 2 === 0) hat(bus, t, st % 4 === 2);
    if (k.hat === 'shaker' && full || k.hat === 'shaker' && sec === 'verse' && st % 2 === 0) nz(bus, t, .05, 'highpass', 6000, .7, st % 4 === 2 ? .12 : .06);
    if (k.hat === 'sixteenth') hat(bus, t, st % 4 === 2, st % 4 === 2 ? 1 : .55);
  }
  // 倒數的木魚（第二小節的四拍）
  if (bar === 1 && st % 4 === 0) osc(bus, 'square', st === 12 ? 1320 : 880, t, .06, .12);
  if (sec === 'intro') { if (bar === 0 && st === 0) chord(m, t, croot, tones, spb * 32, .12, 'pad'); return; }
  // 低音
  if (sec !== 'break') {
    const b = croot - 24;
    if (k.bass === 'oct' && st % 2 === 0) bass(bus, t, st % 4 === 2 ? b + 12 : b, spb * 1.8, 'sawtooth', 500);
    if (k.bass === 'pluck' && [0, 3, 6, 10, 12, 14].includes(st)) bass(bus, t, st === 14 ? b + 7 : b, spb * 2, 'triangle', 1200);
    if (k.bass === 'saw' && st % 4 !== 0) bass(bus, t, b + (st % 4 === 2 ? 12 : 0), spb * .9, 'sawtooth', full ? 900 : 500);
  }
  // 和弦
  if (k.chord === 'pad' && st === 0) chord(m, t, croot, tones, spb * 16, full ? .13 : .09, 'pad');
  if (k.chord === 'marimba' && [2, 6, 10, 14, 7].includes(st)) for (const n of tones.slice(0, 3)) marimba(bus, verb, t, croot + 12 + n);
  if (k.chord === 'stab' && (full ? [2, 6, 10, 13] : [0, 10]).includes(st)) chord(m, t, croot, tones, spb * 1.5, .12, 'stab');
  // 旋律（副歌才有，主歌只有一半）
  if (full || (sec === 'verse' && bar % 2 === 1)) {
    if (st % 2 === 0) {
      const idx = S.lead[(bar % 2) * 16 + st];
      if (idx >= 0) {
        let len = 1; while (len < 4 && S.lead[((bar % 2) * 16 + st + len * 2) % 32] === -1 && ((bar % 2) * 16 + st + len * 2) % 16 !== 0) len++;
        lead(bus, verb, t, croot + 12 + tones[idx], spb * 2 * len * .9, k.lead, full ? .11 : .1);
        if (full) vox(bus, verb, t, st % 4 === 0 ? 'a' : 'o', NOTE(croot + 12 + tones[idx]), spb * 2 * len * .95, .2);   // 副歌：像有人在唱「啊—喔—」
      }
    }
  }
  if (sec === 'break' && st === 0) chord(m, t, croot, tones, spb * 16, .14, 'pad');
  // ── 人聲（合成的母音：hey!、oh、yeah）──
  const vb = croot + 12;
  if (bar === 1 && st === 12) vox(bus, verb, t, 'hey', NOTE(vb + 7), .32, .5);                               // 倒數最後一拍：Hey!
  if (sec === 'build' && st % 4 === 0) vox(bus, verb, t, 'o', NOTE(vb + [0, 2, 4, 5, 7, 9, 11, 12][(bar - 10) * 4 + st / 4]), spb * 3.2, .34);   // oh-oh-oh 往上爬
  if (full && bar % 2 === 1 && st === 12) vox(bus, verb, t, 'hey', NOTE(vb + 7), .3, .55);                    // 副歌每兩小節一次 Hey!
  if (full && bar % 4 === 2 && (st === 10 || st === 14)) vox(bus, verb, t, 'o', NOTE(vb + (st === 10 ? 4 : 7)), spb * 1.6, .3);
  if (sec === 'break' && bar === 20 && st === 0) vox(bus, verb, t, 'yeah', NOTE(vb + 7), .7, .5);
  if (sec === 'break' && bar === 21 && st === 8) vox(bus, verb, t, 'hey', NOTE(vb + 7), .3, .55);
}
// 母音合成：鋸齒波（聲帶）＋三個共振峰濾波器（嘴型）。hey＝氣音 h＋e；yeah＝i 滑到 a
const FORMANT = { a: [800, 1150, 2900], e: [530, 1840, 2480], o: [500, 800, 2400], i: [300, 2200, 3000] };
function vox(out, verb, t, kind, f0, dur, peak) {
  const seq = kind === 'hey' ? ['e', 'e'] : kind === 'yeah' ? ['i', 'a'] : [kind, kind];
  const src = ac.createOscillator(), src2 = ac.createOscillator(), g = ac.createGain(), mix = ac.createGain();
  src.type = src2.type = 'sawtooth';
  const fall = kind === 'hey' ? .8 : kind === 'yeah' ? .92 : 1;
  for (const [o, det] of [[src, 1], [src2, 1.006]]) { o.frequency.setValueAtTime(f0 * det * 1.02, t); o.frequency.exponentialRampToValueAtTime(f0 * det * fall, t + dur); o.connect(mix); }
  const vib = ac.createOscillator(), vg = ac.createGain(); vib.frequency.value = 5.2; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f0 * .012, t + dur * .6); vib.connect(vg); vg.connect(src.frequency); vg.connect(src2.frequency);
  [0, 1, 2].forEach((k) => {
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = [6, 9, 11][k];
    bp.frequency.setValueAtTime(FORMANT[seq[0]][k], t); bp.frequency.linearRampToValueAtTime(FORMANT[seq[1]][k], t + dur * .7);
    const kg = ac.createGain(); kg.gain.value = [1, .55, .3][k]; mix.connect(bp); bp.connect(kg); kg.connect(g);
  });
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + .03); g.gain.setValueAtTime(peak * .85, t + dur * .7); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  g.connect(out); g.connect(verb);
  for (const o of [src, src2, vib]) { o.start(t); o.stop(t + dur + .05); }
  if (kind === 'hey') nz(out, t - .02, .07, 'bandpass', 2400, 1.2, peak * .5, .005);   // h 的氣音
}
function kick(out, t, kind) {
  const hard = kind === 'hard', soft = kind === 'soft';
  osc(out, 'sine', hard ? 170 : 140, t, hard ? .42 : .32, soft ? .7 : .95, .002, 42);
  nz(out, t, .02, 'highpass', 3000, .7, soft ? .08 : .2);
}
function clap(out, t, snare) {
  for (const d of [0, .012, .024]) nz(out, t + d, .14, 'bandpass', 1500, .9, .35);
  if (snare) osc(out, 'triangle', 190, t, .1, .25, .002, 120);
}
function hat(out, t, open, v = 1) { nz(out, t, open ? .18 : .04, 'highpass', 7500, .8, (open ? .14 : .1) * v); }
function crash(out, t) { nz(out, t, 1.6, 'highpass', 4500, .5, .22, .003); }
function riser(out, t, dur) { nz(out, t, dur, 'bandpass', 400, 2, .2, dur * .95, 7000); }
function bass(out, t, n, dur, type, cut) {
  const o = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain();
  o.type = type; o.frequency.value = NOTE(n); fl.type = 'lowpass'; fl.frequency.setValueAtTime(cut * 2.5, t); fl.frequency.exponentialRampToValueAtTime(cut, t + dur * .6);
  env(g, t, .004, .32, dur); o.connect(fl); fl.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .05);
  osc(out, 'sine', NOTE(n), t, dur, .25);
}
function chord(m, t, root, tones, dur, peak, kind) {
  for (const n of tones.slice(0, 4)) for (const det of [-1, 1]) {
    const o = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = NOTE(root + 12 + n) * (1 + det * .004);
    fl.type = 'lowpass'; fl.frequency.value = kind === 'stab' ? 2600 : 1400;
    if (kind === 'stab') env(g, t, .004, peak * .5, dur);
    else { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak * .4, t + .12); g.gain.setValueAtTime(peak * .4, t + dur * .85); g.gain.linearRampToValueAtTime(0, t + dur); }
    o.connect(fl); fl.connect(g); g.connect(m.duck); g.connect(m.verb); o.start(t); o.stop(t + dur + .05);
  }
}
function marimba(out, verb, t, n) {
  const f = NOTE(n);
  for (const [mul, pk, d] of [[1, .14, .35], [4, .04, .08]]) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f * mul;
    env(g, t, .002, pk, d); o.connect(g); g.connect(out); g.connect(verb); o.start(t); o.stop(t + d + .05);
  }
}
function lead(out, verb, t, n, dur, kind, peak) {
  const f = NOTE(n), o = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain();
  o.type = kind === 'square' ? 'square' : kind === 'saw' ? 'sawtooth' : 'triangle';
  o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = kind === 'pluck' ? 4000 : 2800;
  if (kind === 'pluck') env(g, t, .003, peak * 1.4, Math.min(dur, .3));
  else { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + .015); g.gain.setValueAtTime(peak * .85, t + dur * .8); g.gain.exponentialRampToValueAtTime(.001, t + dur + .08); }
  o.connect(fl); fl.connect(g); g.connect(out); g.connect(verb); o.start(t); o.stop(t + dur + .12);
  if (kind === 'saw') { const o2 = ac.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f * 1.007; o2.connect(fl); o2.start(t); o2.stop(t + dur + .12); }
}

// ── 音效 ──
const on = () => ac && !muted && ac.state === 'running';
export function hit(id) {
  if (!on()) return; const t = ac.currentTime;
  if (id === 'yeah') { for (const [f, d] of [[1047, 0], [1319, .06], [1568, .12], [2093, .18]]) osc(master, 'square', f, t + d, .22, .1); nz(master, t, .5, 'highpass', 5000, .7, .14); return; }
  if (id === 'super') id = 'great'; else if (id === 'ok') id = 'good';
  if (id === 'perfect') { osc(master, 'sine', 1568, t, .25, .22); osc(master, 'sine', 2349, t + .05, .3, .16); nz(master, t, .15, 'highpass', 6000, .7, .1); }
  else if (id === 'great') { osc(master, 'sine', 1319, t, .2, .2); osc(master, 'sine', 1976, t + .04, .2, .1); }
  else if (id === 'good') osc(master, 'triangle', 880, t, .15, .16);
  else osc(master, 'sine', 160, t, .2, .2, .003, 80);
}
export function cheer() {
  if (!on()) return; const t = ac.currentTime;
  nz(master, t, 2.2, 'bandpass', 1400, .6, .22, .4);
  for (let i = 0; i < 40; i++) nz(master, t + Math.random() * 1.8, .03, 'bandpass', 1500 + Math.random() * 2000, 1.5, .12);   // 拍手聲
  for (const d of [.3, .9]) osc(master, 'sine', 2200, t + d, .35, .06, .02, 2900);                                          // 口哨
}
// 練習用節拍器：一拍一聲，循環開頭高一點
export function metro(accent) { if (on()) osc(master, 'square', accent ? 1760 : 1175, ac.currentTime, .05, .1); }
export function go() { if (on()) { const t = ac.currentTime; osc(master, 'square', 1760, t, .18, .12); crash(master, t); } }
