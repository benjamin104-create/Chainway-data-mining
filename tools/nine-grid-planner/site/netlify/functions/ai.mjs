// 免費 AI 轉接：把網頁的請求轉給 Gemini，金鑰只存在 Netlify 的環境變數 GEMINI_API_KEY，訪客看不到。
// 可選：GEMINI_MODEL（預設 gemini-2.5-flash）。
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
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

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.content || "") }] })),
      generationConfig: body.json ? { responseMimeType: "application/json" } : {},
    }),
  });
  if (r.status === 429) return json({ error: "rate_limited" }, 429);
  if (!r.ok) return json({ error: "upstream", status: r.status }, 502);
  const j = await r.json();
  const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  return json({ text });
};
