// 會員名單：使用者自己在網站「加入會員」時才會存進來（Netlify Blobs），只有站長看得到。
//   POST {action:"save", id, tok, name, email, line, consent, auto}   使用者新增／更新自己的資料
//   POST {action:"delete", id, tok}                                   使用者刪除自己的資料
//   GET  （標頭 x-admin-key）                                          站長讀取全部名單
//   POST {action:"otags", id, otags}（標頭 x-admin-key）                站長替某位會員加上自己的標籤
// 環境變數 ADMIN_KEY：後台密碼（至少 12 個字），只設在 Netlify，不要放進程式或聊天。
import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const sha = (s) => createHash("sha256").update(String(s)).digest("hex");
const str = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const store = () => getStore({ name: "members", consistency: "strong" });

function isAdmin(req) {
  const want = process.env.ADMIN_KEY || "", got = req.headers.get("x-admin-key") || "";
  if (want.length < 12 || !got) return false;
  const a = Buffer.from(sha(want)), b = Buffer.from(sha(got));
  return a.length === b.length && timingSafeEqual(a, b);
}
// the automatic tags the site computes on the user's device: short strings only
const cleanAuto = (a) => {
  const o = {};
  if (!a || typeof a !== "object") return o;
  if (Array.isArray(a.tags)) o.tags = [...new Set(a.tags.map((x) => str(x, 40)).filter(Boolean))].slice(0, 40);
  for (const k of ["lang", "region", "level", "visits", "lastSeen", "skin"]) if (a[k] != null) o[k] = str(a[k], 20);
  return o;
};

export default async (req, context) => {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return json({ error: "forbidden" }, 403);
  const st = store();

  if (req.method === "GET") {
    if (!isAdmin(req)) return json({ error: "unauthorized" }, 401);
    const { blobs } = await st.list();
    const rows = (await Promise.all(blobs.map((b) => st.get(b.key, { type: "json" })))).filter(Boolean).map((r) => { const { tokh, ...rest } = r; return rest; });
    rows.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
    return json({ members: rows });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const id = str(body.id, 40);
  if (!/^[a-z0-9-]{16,40}$/.test(id)) return json({ error: "bad_request" }, 400);

  if (body.action === "otags") {
    if (!isAdmin(req)) return json({ error: "unauthorized" }, 401);
    const r = await st.get(id, { type: "json" });
    if (!r) return json({ error: "not_found" }, 404);
    r.otags = (Array.isArray(body.otags) ? body.otags : []).map((x) => str(x, 30)).filter(Boolean).slice(0, 30);
    await st.setJSON(id, r);
    return json({ ok: true });
  }

  const tok = str(body.tok, 80);
  if (tok.length < 20) return json({ error: "bad_request" }, 400);
  const old = await st.get(id, { type: "json" });
  if (old && old.tokh !== sha(tok)) return json({ error: "forbidden" }, 403);

  if (body.action === "delete") {
    if (old) await st.delete(id);
    return json({ ok: true });
  }
  if (body.action !== "save") return json({ error: "bad_request" }, 400);
  const email = str(body.email, 120), line = str(body.line, 60), name = str(body.name, 40);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "bad_email" }, 400);
  if (!name || (!email && !line)) return json({ error: "bad_request" }, 400);
  if (!old) {   // new sign-ups: at most 20 a day from one network
    const ipk = `rate/${new Date().toISOString().slice(0, 10)}/${sha("m:" + ((context && context.ip) || "x")).slice(0, 20)}`;
    const rs = getStore("member-rate"), n = ((await rs.get(ipk, { type: "json" })) || 0) + 1;
    if (n > 20) return json({ error: "rate_limited" }, 429);
    await rs.setJSON(ipk, n);
  }
  const now = new Date().toISOString();
  const rec = {
    id, tokh: old ? old.tokh : sha(tok), name, email, line,
    consent: { mkt: !!(body.consent && body.consent.mkt), at: body.consent && body.consent.mkt ? (old && old.consent && old.consent.mkt ? old.consent.at : now) : "" },
    auto: cleanAuto(body.auto), otags: old ? old.otags || [] : [],
    country: (context && context.geo && context.geo.country && context.geo.country.code) || (old && old.country) || "",
    created: old ? old.created : now, updated: now,
  };
  await st.setJSON(id, rec);
  return json({ ok: true });
};
