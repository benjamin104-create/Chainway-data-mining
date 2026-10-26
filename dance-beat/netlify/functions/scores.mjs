// 排行榜：只存暱稱、分數、時間和一組隨機的裝置代碼（同一支手機只留最好的一次）
//   今日、本週（台灣時間）、總榜各一份，每份最多 100 名
//   舞蹈篇和武俠篇共用（武俠篇從另一個網址呼叫，所以要開 CORS）
import { getStore } from '@netlify/blobs';

const ORIGINS = /^https:\/\/(jaminepa-dance|jaminepa-wuxia)\.netlify\.app$|^https:\/\/[a-z0-9-]+--jaminepa-(dance|wuxia)\.netlify\.app$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const BOARDS = /^(dance:(neon|summer|power)|wuxia:duel):(easy|normal|hard)$/;
const KEEP = 100;

function periodKeys(ms = Date.now()) {
  const d = new Date(ms + 8 * 3600e3);                       // 台灣時間
  const day = d.toISOString().slice(0, 10);
  // ISO 週次
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const wd = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - wd);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t - y0) / 864e5 + 1) / 7);
  return { day: `d/${day}`, week: `w/${t.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`, all: 'all' };
}
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮<>]/g, '').trim().slice(0, 12);

export default async (req) => {
  const origin = req.headers.get('origin') || '';
  const cors = { 'access-control-allow-origin': ORIGINS.test(origin) ? origin : 'https://jaminepa-dance.netlify.app', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'origin' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const store = getStore({ name: 'scores', consistency: 'strong' });
  const keyOf = (board, p) => `${board.replace(/:/g, '_')}/${p}`;

  if (req.method === 'GET') {
    const u = new URL(req.url), board = u.searchParams.get('board') || '', period = u.searchParams.get('period') || 'day';
    if (!BOARDS.test(board) || !['day', 'week', 'all'].includes(period)) return json({ error: 'bad board' }, 400, cors);
    const list = (await store.get(keyOf(board, periodKeys()[period]), { type: 'json' })) || [];
    return json({ list: list.map(({ n, s, id }) => ({ n, s, id })) }, 200, cors);
  }
  if (req.method !== 'POST') return json({ error: 'method' }, 405, cors);

  let b; try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400, cors); }
  const name = cleanName(b.name), score = Number(b.score), id = String(b.id || '');
  if (!BOARDS.test(b.board || '')) return json({ error: 'bad board' }, 400, cors);
  if (!name) return json({ error: 'name' }, 400, cors);
  if (!Number.isInteger(score) || score < 0 || score > 10000) return json({ error: 'score' }, 400, cors);
  if (!/^[a-z0-9]{4,16}$/.test(id)) return json({ error: 'id' }, 400, cors);

  const keys = periodKeys(), rank = {}; let improved = false;
  for (const [p, k] of Object.entries(keys)) {
    const key = keyOf(b.board, k);
    const list = (await store.get(key, { type: 'json' })) || [];
    const mine = list.find((x) => x.id === id);
    if (mine) { mine.n = name; if (score > mine.s) { mine.s = score; mine.t = Date.now(); improved = true; } }
    else { list.push({ n: name, s: score, id, t: Date.now() }); improved = true; }
    list.sort((x, y) => y.s - x.s || x.t - y.t);
    const top = list.slice(0, KEEP);
    await store.setJSON(key, top);
    const i = top.findIndex((x) => x.id === id);
    rank[p] = i >= 0 ? i + 1 : null;
  }
  return json({ ok: true, improved, rank }, 200, cors);
};
export const config = { path: '/api/scores' };
