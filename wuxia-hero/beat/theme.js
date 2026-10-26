// 武俠篇「江湖律動擂台」的外觀、招式名稱與配樂（程式跟舞蹈篇共用）
import * as sfx from '../sfx.js';

let t0fallback = 0;
export const THEME = {
  game: 'wuxia',
  assets: '../',                               // 模型、程式庫放在武俠篇根目錄，跟 AR 相機共用
  board: 'https://jaminepa-dance.netlify.app',   // 排行榜跟舞蹈篇共用同一個後台
  site: 'https://jaminepa-wuxia.netlify.app/beat/',
  title: '江湖律動擂台',
  // 武俠決鬥曲 150 拍，動作間隔加倍（不然太快）
  songs: { duel: { zh: '江湖決鬥', en: 'DUEL', vibe: '古箏太鼓・150 拍', bpm: 150, bars: 38, step: 2, color: '#e0a526' } },
  music: {
    unlock: sfx.unlock,
    play: () => { sfx.unlock(); const t = sfx.startMusic(); t0fallback = performance.now() / 1000 + .1; return t ?? t0fallback; },
    stop: (f) => sfx.stopMusic(f),
    clock: sfx.clock, ready: sfx.running,
    hit: (id) => (id === 'perfect' ? sfx.boom() : id === 'great' ? sfx.drum(true) : id === 'good' ? sfx.drum(false) : null),
    cheer: () => sfx.gong(), go: () => sfx.drum(true),
    audioTrack: sfx.audioTrack, isMuted: sfx.isMuted, setMuted: sfx.setMuted,
  },
  names: {
    up: { zh: '霸王舉鼎' }, tee: { zh: '大鵬展翅' }, yy: { zh: '雙龍出海' }, discoL: { zh: '白鶴亮翅' }, discoR: { zh: '指天劃地' },
    muscle: { zh: '雙峰貫耳' }, heart: { zh: '合掌朝天' }, clap: { zh: '抱拳行禮' }, pointL: { zh: '左掌推山' }, pointR: { zh: '右掌推山' },
    squat: { zh: '蹲馬步' }, kneeL: { zh: '金雞・左' }, kneeR: { zh: '金雞・右' }, star: { zh: '天羅地網' },
  },
  font: { latin: '"Anton", "Impact", "Arial Black", sans-serif', cjk: '"Noto Serif TC", "Noto Sans TC", serif' },
  ink: '#0e0c0a',
  grade: { perfect: ['#fff7d6', '#ffd36b', '#e0a526'], great: ['#ffffff', '#f3d9a6', '#c98a2b'], good: ['#ffe0d6', '#e8695a', '#a3271a'], miss: ['#d5d0c6', '#8a8478', '#55504a'] },
  bar: ['#5a1a10', '#b8321f', '#e0a526'],
  figure: '#f6f1e6',
  skel: 'rgba(255,211,107,.55)', skelGlow: '#e0a526', vignette: 'rgba(14,8,4,.6)',
  ranks: ['初出茅廬', '江湖新秀', '少年英俠', '一代大俠', '武林盟主', '天下第一'],
  share: (s) => `我在江湖律動擂台「${s.diff}」難度打出 ${s.score} 分，封號「${s.rank}」！少俠可敢一戰？`,
  card: (id) => (['squat', 'kneeL', 'kneeR', 'star'].includes(id) ? ['#c8962a', '#7a3d0f'] : ['#8a1c12', '#2a1610']),
};
