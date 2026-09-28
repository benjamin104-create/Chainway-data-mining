// 網站內建的 AI：金鑰只存在 Netlify 的環境變數，訪客看不到。
// 有 ANTHROPIC_API_KEY 就用 Claude（比較聰明，教練對話、計畫都用它）；沒有的話用 GEMINI_API_KEY。
// 回答用串流（一段一段傳），長一點的計畫也不會逾時。
// 可選環境變數：
//   CLAUDE_MODEL       預設 claude-opus-5
//   GEMINI_MODEL       預設 gemini-2.5-flash
//   AI_PER_HOUR        同一個網路（IP）每小時最多幾次，預設 30
//   AI_PER_DAY         同一個網路（IP）每天最多幾次，預設 150（學校、公司共用網路也夠用）
//   AI_PLUS_PER_DAY    AI 加值包每組兌換碼每天幾次，預設 200
//   AI_DAILY_CAP       整個網站每天最多幾次（保護你的帳單），預設 3000
//   AI_PASS_HASHES     AI 加值包兌換碼的雜湊，逗號分隔（make-code.py 會印出來）
import Anthropic from "@anthropic-ai/sdk";
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const num = (v, d) => (Number.isFinite(+v) && +v > 0 ? +v : d);
const sha = (s) => createHash("sha256").update(s).digest("hex");
// a failure after the stream has started is sent as this marker, followed by an error code
const ERR = "\u0000ERR:";

// 計數存在 Netlify Blobs；萬一讀不到，退回這個執行個體的記憶體，不讓 AI 因此停擺
const mem = new Map();
function limits() { try { return getStore("ai-limits"); } catch { return null; } }
async function bump(store, key) {
  if (store) {
    try { const n = ((await store.get(key, { type: "json" })) || 0) + 1; await store.setJSON(key, n); return n; } catch { /* fall through */ }
  }
  const n = (mem.get(key) || 0) + 1; mem.set(key, n); return n;
}
async function peek(store, key) {
  if (store) { try { return (await store.get(key, { type: "json" })) || 0; } catch { /* fall through */ } }
  return mem.get(key) || 0;
}

// the page asks for "quick" (a chat reply), "default" or "complex" (plans): that sets how hard Claude thinks
const EFFORT = { quick: "low", default: "medium", complex: "high" };
const JSON_RULE = "Reply with only one valid JSON object: no code fences and no text before or after it.";

function claudeStream(apiKey, body, messages, images, done) {
  const client = new Anthropic({ apiKey });
  const last = messages.length - 1;
  const params = {
    model: process.env.CLAUDE_MODEL || "claude-opus-5",
    max_tokens: 16000,
    output_config: { effort: EFFORT[body.tier] || "medium" },
    ...(body.json ? { system: JSON_RULE } : {}),
    messages: messages.map((m, i) => ({
      role: m.role,
      content: i === last && images.length
        ? [...images.map((g) => ({ type: "image", source: { type: "base64", media_type: g.mime, data: g.data } })), { type: "text", text: m.content }]
        : m.content,
    })),
    // if Claude declines, the API retries on the model Anthropic recommends for that case
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  };
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(ctl) {
      let sent = false;
      try {
        const stream = client.beta.messages.stream(params);
        stream.on("text", (t) => { sent = true; ctl.enqueue(enc.encode(t)); });
        const msg = await stream.finalMessage();
        if (msg.stop_reason === "refusal") ctl.enqueue(enc.encode(ERR + "refusal"));
        else if (!sent) ctl.enqueue(enc.encode(ERR + "empty"));
        else await done();
      } catch (e) {
        const code = e instanceof Anthropic.RateLimitError ? "rate_limited"
          : e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError ? "server_key"
          : "upstream";
        console.error("claude", e && e.status, e && e.message);
        ctl.enqueue(enc.encode(ERR + code));
      }
      ctl.close();
    },
  });
}

async function gemini(key, body, messages, images) {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: messages.map((m, i) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }, ...(i === messages.length - 1 ? images.map((g) => ({ inline_data: { mime_type: g.mime, data: g.data } })) : [])] })),
      generationConfig: body.json ? { responseMimeType: "application/json" } : {},
    }),
  });
  if (r.status === 429) return { error: "rate_limited", status: 429 };
  if (!r.ok) return { error: "upstream", status: 502 };
  const j = await r.json();
  return { text: (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("") };
}

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const claudeKey = process.env.ANTHROPIC_API_KEY, geminiKey = process.env.GEMINI_API_KEY;
  if (!claudeKey && !geminiKey) return json({ error: "not_configured" }, 503);

  // 只接受自己網站送來的請求，避免被別人拿去用光額度
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return json({ error: "forbidden" }, 403);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  // turns alternate user/assistant and start with the user, as both AIs expect
  const messages = [];
  for (const m of (Array.isArray(body.messages) ? body.messages.slice(-16) : [])) {
    const role = m && m.role === "assistant" ? "assistant" : "user", content = String((m && m.content) || "");
    if (!content) continue;
    const prev = messages[messages.length - 1];
    if (prev && prev.role === role) prev.content += "\n\n" + content; else messages.push({ role, content });
  }
  while (messages.length && messages[0].role !== "user") messages.shift();
  const size = messages.reduce((n, m) => n + m.content.length, 0);
  if (!messages.length || messages[messages.length - 1].role !== "user" || size > 24000) return json({ error: "bad_request" }, 413);
  // 拍照匯入：最多 3 張已縮小的 JPEG/PNG，附在最後一則使用者訊息
  const images = (Array.isArray(body.images) ? body.images : []).slice(0, 3)
    .filter((g) => g && /^image\/(jpeg|png|webp)$/.test(g.mime) && typeof g.data === "string" && g.data.length < 2_800_000 && /^[A-Za-z0-9+/=]+$/.test(g.data));
  if (Array.isArray(body.images) && body.images.length && !images.length) return json({ error: "bad_request" }, 413);

  // 使用次數：先看限制，AI 回答成功才記一次
  const store = limits();
  const now = new Date(), day = now.toISOString().slice(0, 10), hour = now.toISOString().slice(0, 13);
  const ip = (context && context.ip) || req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "unknown";
  const who = sha("ng:" + ip).slice(0, 24);           // 只存雜湊，不存 IP
  const pass = String(req.headers.get("x-ng-pass") || "").trim().toUpperCase().replace(/\s+/g, "");
  const passes = String(process.env.AI_PASS_HASHES || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const passId = pass && passes.includes(sha(pass)) ? sha(pass).slice(0, 24) : "";
  const keys = passId
    ? { a: `p/${day}/${passId}`, aMax: num(process.env.AI_PLUS_PER_DAY, 200) }
    : { a: `d/${day}/${who}`, aMax: num(process.env.AI_PER_DAY, 150), b: `h/${hour}/${who}`, bMax: num(process.env.AI_PER_HOUR, 30) };
  const gKey = `g/${day}`, gMax = num(process.env.AI_DAILY_CAP, 3000);
  const [a, b, g] = await Promise.all([peek(store, keys.a), keys.b ? peek(store, keys.b) : 0, peek(store, gKey)]);
  if (g >= gMax) return json({ error: "site_busy" }, 429);
  if (a >= keys.aMax) return json({ error: "daily_limit" }, 429);
  if (keys.b && b >= keys.bMax) return json({ error: "hourly_limit" }, 429);
  const count = () => Promise.all([bump(store, keys.a), keys.b ? bump(store, keys.b) : 0, bump(store, gKey)]);

  if (claudeKey) {
    return new Response(claudeStream(claudeKey, body, messages, images, count), {
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-ng-engine": "claude" },
    });
  }
  const r = await gemini(geminiKey, body, messages, images);
  if (r.error) return json({ error: r.error }, r.status);
  await count();
  return json({ text: r.text, engine: "gemini" });
};
