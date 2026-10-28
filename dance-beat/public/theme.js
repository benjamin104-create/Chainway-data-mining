// 舞蹈篇的外觀、文字與音樂（武俠篇有自己的一份 theme.js，其他程式共用）
import * as music from './music.js';

export const THEME = {
  game: 'dance',
  board: '',                                   // 排行榜 API 在同一個網站
  site: 'https://jaminepa-dance.netlify.app',
  title: '全民律動王',
  songs: music.SONGS,
  music: {
    unlock: music.unlock, play: music.play, stop: music.stop, clock: music.clock, ready: music.ready,
    hit: music.hit, cheer: music.cheer, go: music.go, metro: music.metro, audioTrack: music.audioTrack, isMuted: music.isMuted, setMuted: music.setMuted,
    decode: music.decode, playBuffer: music.playBuffer,
  },
  names: {},                                   // 用 core.js 的動作名稱
  font: { latin: '"Anton", "Impact", "Arial Black", sans-serif', cjk: '"Noto Sans TC", "PingFang TC", sans-serif' },
  ink: '#0b0618',
  grade: { perfect: ['#fff7a8', '#ffcf2e', '#ff7a00'], super: ['#e9fffb', '#2ff3ff', '#1a9bff'], good: ['#ffe6fb', '#ff7ae6', '#c03bff'], ok: ['#f3eaff', '#b7a3ff', '#7b5bd6'], miss: ['#ffd5d9', '#ff4d5e', '#a3172a'], yeah: ['#ffffff', '#ffe36b', '#ffb000'] },
  figure: '#ffffff',
  ranks: ['暖身中', '律動新手', '派對常客', '舞池焦點', '舞林高手', '舞王', 'SUPERSTAR', 'MEGASTAR'],
  share: (s) => `我在「${s.song}」${s.diff}難度跳出 ${s.score} 分（${s.rank}）！換你來挑戰 →`,
  // 動作卡的底色：手的動作／全身動作
  card: (id) => (['bounce', 'knee', 'jack'].includes(id) ? ['#ff9f1c', '#ff3d7f'] : ['#7b2ff7', '#f107a3']),
};
