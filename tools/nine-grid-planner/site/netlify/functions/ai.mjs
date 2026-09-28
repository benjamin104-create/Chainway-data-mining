// 免費 AI 轉接：把網頁的請求轉給 Gemini，金鑰只存在 Netlify 的環境變數 GEMINI_API_KEY，訪客看不到。
// 可選環境變數：
//   GEMINI_MODEL       預設 gemini-2.5-flash
//   AI_PER_HOUR        同一個網路（IP）每小時最多幾次，預設 30
//   AI_PER_DAY         同一個網路（IP）每天最多幾次，預設 150（學校、公司共用網路也夠用）
//   AI_PLUS_PER_DAY    AI 加值包每組兌換碼每天幾次，預設 200
//   AI_DAILY_CAP       整個網站每天最多幾次（保護你的帳單），預設 3000
//   AI_PASS_HASHES     AI 加值包兌換碼的雜湊，逗號分隔（make-code.py 會印出來）
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const num = (v, d) => (Number.isFinite(+v) && +v > 0 ? +v : d);
const sha = (s) => createHash("sha256").update(s).digest("hex");

// 計數存在 Netlify Blobs；萬一讀不到，退回這個執行個體的記憶體，不讓 AI 因此停擺
const mem = new Map();
let store = null;
try { store = getStore("ai-limits"); } catch { store = null; }
async function bump(key) {
  if (store) {
    try { const n = ((await store.get(key, { type: "json" })) || 0) + 1; await store.setJSON(key, n); return n; } catch { /* fall through */ }
  }
  const n = (mem.get(key) || 0) + 1; mem.set(key, n); return n;
}
async function peek(key) {
  if (store) { try { return (await store.get(key, { type: "json" })) || 0; } catch { /* fall through */ } }
  return mem.get(key) || 0;
}

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: "not_configured" }, 503);

  // 只接受自己網站送來的請求，避免被別人拿去用光免費額度
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return json({ error: "forbidden" }, 403);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-16) : [];
  const size = messages.reduce((n, m) => n + String(m.content || "").length, 0);
  if (!messages.length || size > 24000) return json({ error: "bad_request" }, 413);
  // 拍照匯入：最多 3 張已縮小的 JPEG/PNG，附在最後一則使用者訊息
  const images = (Array.isArray(body.images) ? body.images : []).slice(0, 3)
    .filter((g) => g && /^image\/(jpeg|png|webp)$/.test(g.mime) && typeof g.data === "string" && g.data.length < 2_800_000 && /^[A-Za-z0-9+/=]+$/.test(g.data));
  if (Array.isArray(body.images) && body.images.length && !images.length) return json({ error: "bad_request" }, 413);

  // 使用次數：先看限制，Gemini 回答成功才記一次
  const now = new Date(), day = now.toISOString().slice(0, 10), hour = now.toISOString().slice(0, 13);
  const ip = (context && context.ip) || req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "unknown";
  const who = sha("ng:" + ip).slice(0, 24);           // 只存雜湊，不存 IP
  const pass = String(req.headers.get("x-ng-pass") || "").trim().toUpperCase().replace(/\s+/g, "");
  const passes = String(process.env.AI_PASS_HASHES || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const passId = pass && passes.includes(sha(pass)) ? sha(pass).slice(0, 24) : "";
  const keys = passId
    ? { a: `p/${day}/${passId}`, aMax: num(process.env.AI_PLUS_PER_DAY, 200), aErr: "daily_limit" }
    : { a: `d/${day}/${who}`, aMax: num(process.env.AI_PER_DAY, 150), aErr: "daily_limit", b: `h/${hour}/${who}`, bMax: num(process.env.AI_PER_HOUR, 30) };
  const gKey = `g/${day}`, gMax = num(process.env.AI_DAILY_CAP, 3000);
  const [a, b, g] = await Promise.all([peek(keys.a), keys.b ? peek(keys.b) : 0, peek(gKey)]);
  if (g >= gMax) return json({ error: "site_busy" }, 429);
  if (a >= keys.aMax) return json({ error: keys.aErr }, 429);
  if (keys.b && b >= keys.bMax) return json({ error: "hourly_limit" }, 429);

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: messages.map((m, i) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.content || "") }, ...(i === messages.length - 1 ? images.map((g) => ({ inline_data: { mime_type: g.mime, data: g.data } })) : [])] })),
      generationConfig: body.json ? { responseMimeType: "application/json" } : {},
    }),
  });
  if (r.status === 429) return json({ error: "rate_limited" }, 429);
  if (!r.ok) return json({ error: "upstream", status: r.status }, 502);
  const j = await r.json();
  const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  await Promise.all([bump(keys.a), keys.b ? bump(keys.b) : 0, bump(gKey)]);
  return json({ text });
};
