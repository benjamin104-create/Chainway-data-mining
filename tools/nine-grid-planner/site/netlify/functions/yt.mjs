// YouTube 找歌（免費、不需要金鑰）：
//   ?q=歌名         → 一支最適合的影片 {id}（播放用）
//   ?q=歌名&list=1  → 最多 8 支影片的清單（網站裡的「搜尋歌曲」用）
// 有 YOUTUBE_API_KEY 時，單支查詢會優先用官方 API；清單一律讀搜尋頁，避免用光每天的額度。
const json = (o, status = 200, cache = 0) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": cache ? `public, max-age=${cache}` : "no-store" } });

function videosFrom(html, n) {
  const m = html.match(/(?:var ytInitialData|window\["ytInitialData"\])\s*=\s*(\{.+?\});\s*<\/script>/s);
  if (!m) return [];
  let data; try { data = JSON.parse(m[1]); } catch { return []; }
  const out = [];
  const walk = (o) => {
    if (!o || typeof o !== "object" || out.length >= n) return;
    if (o.videoRenderer && o.videoRenderer.videoId) {
      const v = o.videoRenderer, t = (v.title && (v.title.runs || []).map((r) => r.text).join("")) || "";
      out.push({ id: v.videoId, title: t, channel: v.ownerText && v.ownerText.runs && v.ownerText.runs[0].text || "", len: v.lengthText && v.lengthText.simpleText || "" });
      return;
    }
    for (const k in o) walk(o[k]);
  };
  walk(data);
  return out;
}

export default async (req) => {
  const u = new URL(req.url), q = (u.searchParams.get("q") || "").trim().slice(0, 120), list = u.searchParams.get("list") === "1";
  if (!q) return json({ error: "bad_request" }, 400);
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== u.host) return json({ error: "forbidden" }, 403);
  try {
    const key = process.env.YOUTUBE_API_KEY;
    if (key && !list) {
      const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=1&q=${encodeURIComponent(q)}&key=${key}`);
      if (r.ok) { const j = await r.json(), it = j.items && j.items[0];
        if (it) return json({ id: it.id.videoId, title: it.snippet.title, channel: it.snippet.channelTitle }, 200, 86400); }
    }
    const r = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=zh-TW`, { headers: { "accept-language": "zh-TW,zh;q=0.9,en;q=0.8", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" } });
    const html = await r.text(), vids = videosFrom(html, list ? 8 : 1);
    if (list) {
      // page layout changed: still return the ids (the site shows their thumbnails)
      if (!vids.length) for (const [, id] of html.matchAll(/"videoId":"([\w-]{11})"/g)) { if (!vids.some((v) => v.id === id)) vids.push({ id, title: "", channel: "", len: "" }); if (vids.length >= 8) break; }
      return json({ items: vids }, 200, vids.length ? 3600 : 0);
    }
    if (vids[0]) return json(vids[0], 200, 86400);
    const m = html.match(/"videoId":"([\w-]{11})"/);
    return m ? json({ id: m[1] }, 200, 86400) : json({ error: "not_found" }, 404);
  } catch (e) { return json({ error: "upstream" }, 502); }
};
