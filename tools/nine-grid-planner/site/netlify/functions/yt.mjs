// 找 YouTube 影片：網頁送歌名來，這裡回傳一支可以嵌入播放的影片 ID。
// 有 YOUTUBE_API_KEY（YouTube Data API v3，免費額度）就用官方 API；沒有就讀 YouTube 搜尋頁的第一支影片。
const json = (o, status = 200, cache = 0) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": cache ? `public, max-age=${cache}` : "no-store" } });

export default async (req) => {
  const u = new URL(req.url), q = (u.searchParams.get("q") || "").trim().slice(0, 120);
  if (!q) return json({ error: "bad_request" }, 400);
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== u.host) return json({ error: "forbidden" }, 403);
  try {
    const key = process.env.YOUTUBE_API_KEY;
    if (key) {
      const api = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=1&q=${encodeURIComponent(q)}&key=${key}`;
      const r = await fetch(api);
      if (r.ok) { const j = await r.json(), it = j.items && j.items[0];
        if (it) return json({ id: it.id.videoId, title: it.snippet.title, channel: it.snippet.channelTitle }, 200, 86400); }
    }
    const r = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, { headers: { "accept-language": "zh-TW,zh;q=0.9,en;q=0.8", "user-agent": "Mozilla/5.0" } });
    const html = await r.text(), m = html.match(/"videoRenderer":\{"videoId":"([\w-]{11})"/) || html.match(/"videoId":"([\w-]{11})"/);
    if (m) return json({ id: m[1] }, 200, 86400);
    return json({ error: "not_found" }, 404);
  } catch (e) { return json({ error: "upstream" }, 502); }
};
