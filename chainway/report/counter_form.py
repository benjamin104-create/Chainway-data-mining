"""專櫃回填表單：一頁式，看照片勾選，匯出成回饋 CSV。

## 這張表最大的風險不是欄位不夠，是沒人填

受控詞彙表有 55 個理由標籤。全部攤在專櫃人員面前，一款要讀 55 個選項，
一次巡三十款就是一千六百次閱讀 —— 這張表會在第一天被放棄，然後整條
「市場回饋 → 設計修正」的迴路就斷了。欄位再完整都沒有用。

所以這裡的設計原則是**分層揭露**：

    第一層  看照片，點一下：暢 / 普 / 滯 / 兩極          ← 每款約 5 秒
    第二層  點了暢或滯，才展開理由，而且只給該方向的     ← 只有需要解釋的款才做
    第三層  「更多理由」收起其餘的標籤                    ← 詞彙表完整性不打折

第一層自己就有價值：三十款的暢滯判斷，比十款寫得很詳細但只有三款回來
更有用。理由是加分，不是門檻。

## 為什麼把握程度是必填

整套設計的目的之一是**用後續的實際銷售回頭校準專櫃的判斷**。
沒有把握程度就沒得校準 —— 「說對了」和「很有把握而且說對了」是兩件事，
後者才代表這個人的直覺可以拿來當早期訊號用。所以它不是選填。

## 為什麼不做登入、不連資料庫

專櫃的網路與設備不能假設。這張表是一個單檔 HTML：照片內嵌、
離線可用、填到一半重新整理不會掉（存在瀏覽器本機），
填完按一個鍵匯出 CSV。

匯出的欄位與 `ingest.feedback.COLUMNS` 完全一致，可以直接丟回系統。
"""
from __future__ import annotations

import base64
import html
import io
import json
from pathlib import Path
from typing import Any, Sequence

# 第一層先露出的理由。挑選依據是「專櫃真的觀察得到的事」——
# 店員看得到客人試穿後放回去、看得到問價格就走，看不到布料克重是否超標。
# 其餘標籤收在「更多理由」裡，詞彙表的完整性沒有打折。
PRIMARY_GOOD = ["P_COLOR_GOOD", "P_PATTERN_GOOD", "P_MATCH_EASY",
                "F_FIT_GOOD", "PR_WORTH", "M_TREND_HIT",
                "C_STAFF_PUSH", "S_OOS_HOT"]
PRIMARY_BAD = ["PR_TOO_HIGH", "F_TOO_TIGHT", "F_TOO_LOOSE", "P_MATCH_HARD",
               "P_COLOR_BAD", "F_SIZE_RANGE", "C_DISPLAY_BAD", "M_SEASON_OFF"]

# 判定 → 該露出哪一組理由。兩極兩組都露 —— 「這家好那家差」通常
# 一半是商品、一半是通路，硬要選一邊會失真。
VERDICT_POLARITY = {"STAR": "good", "OK": "both", "SLOW": "bad", "MIXED": "both"}

THUMB = 420
QUALITY = 82


def e(s: Any) -> str:
    return html.escape(str(s))


def thumb(path: str | Path, width: int = THUMB) -> str | None:
    """照片內嵌成 data URI —— 表單要能離線用，也要能整份寄出去。"""
    try:
        from ..imageio import load_rgb

        im = load_rgb(path)
        im.thumbnail((width, int(width * 1.5)))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=QUALITY)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return None


def _tag_lookup(tags_cfg: dict[str, Any]) -> dict[str, str]:
    out: dict[str, str] = {}
    for grp in tags_cfg.get("reason_tags", {}).values():
        for t in grp.get("tags", []):
            out[t["code"]] = t["zh"]
    return out


def _split_tags(tags_cfg: dict[str, Any]) -> dict[str, Any]:
    """把 55 個標籤分成「第一層好／第一層壞／其餘」三堆。

    其餘那一堆按原本的六大類分組保留 —— 展開之後仍然要看得出
    這是設計面的問題還是通路面的問題，那是後續歸因的依據。
    """
    look = _tag_lookup(tags_cfg)
    primary = set(PRIMARY_GOOD) | set(PRIMARY_BAD)
    more = []
    for key, grp in tags_cfg.get("reason_tags", {}).items():
        items = [{"code": t["code"], "zh": t["zh"]}
                 for t in grp.get("tags", []) if t["code"] not in primary]
        if items:
            more.append({"group": grp.get("name_zh", key), "tags": items})
    return {
        "good": [{"code": c, "zh": look.get(c, c)} for c in PRIMARY_GOOD if c in look],
        "bad": [{"code": c, "zh": look.get(c, c)} for c in PRIMARY_BAD if c in look],
        "more": more,
    }


def build(products: Sequence[dict[str, Any]], tags_cfg: dict[str, Any], *,
          title: str = "專櫃暢滯銷觀察紀錄",
          period: str = "", store_hint: str = "") -> str:
    """products 每筆要有 sku、name、category、season，image 可有可無。"""
    tags = _split_tags(tags_cfg)
    verdicts = tags_cfg.get("verdicts", [])
    sources = tags_cfg.get("sources", [])
    payload = json.dumps({
        "products": list(products), "tags": tags, "verdicts": verdicts,
        "sources": sources, "polarity": VERDICT_POLARITY,
        "period": period,
    }, ensure_ascii=False)

    # 刻意不載字體 CDN。這張表要在專櫃的網路下開，也要能離線開 ——
    # 一個擋住渲染的外部樣式表，在訊號差的地方就是白畫面好幾秒，
    # 而填表的人只會關掉它。Windows／iOS／Android 內建的中文字體都夠用。
    return f"""<title>{e(title)}</title>
<style>
:root{{--paper:#F4F1EA;--panel:#FFFDF8;--ink:#221F18;--ink2:#5C5648;--ink3:#8B8372;
 --rule:#DDD5C5;--rule2:#EDE8DC;--star:#1F6F9C;--slow:#A0322D;--ok:#7A7263;
 --mixed:#7A5C2E;--acc:#7A2E38}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{
 --paper:#17150F;--panel:#211E17;--ink:#F2EDE1;--ink2:#B4AC99;--ink3:#867E6C;
 --rule:#39342A;--rule2:#2A261E;--star:#57A0CD;--slow:#D98078;--ok:#9A9182;
 --mixed:#C9A468;--acc:#C08A93}}}}
:root[data-theme="dark"]{{--paper:#17150F;--panel:#211E17;--ink:#F2EDE1;
 --ink2:#B4AC99;--ink3:#867E6C;--rule:#39342A;--rule2:#2A261E;--star:#57A0CD;
 --slow:#D98078;--ok:#9A9182;--mixed:#C9A468;--acc:#C08A93}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--paper);color:var(--ink);font-size:16px;line-height:1.6;
 font-family:"Microsoft JhengHei UI","Microsoft JhengHei","PingFang TC","Noto Sans TC","Hiragino Sans TC",-apple-system,"Segoe UI",sans-serif;
 -webkit-text-size-adjust:100%}}
.page{{max-width:1080px;margin:0 auto;padding:0 14px 150px}}
header{{padding:26px 0 14px}}
h1{{font-size:24px;margin:0 0 4px;font-weight:700}}
.dek{{color:var(--ink2);font-size:14px;margin:0 0 18px;max-width:62ch}}
.who{{background:var(--panel);border:1px solid var(--rule);border-radius:9px;
 padding:14px;display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}}
.who label{{display:block;font-size:12px;color:var(--ink3);margin-bottom:3px;
 font-weight:500}}
.who input,.who select{{width:100%;padding:9px 10px;font-size:16px;
 border:1px solid var(--rule);border-radius:6px;background:var(--paper);
 color:var(--ink);font-family:inherit}}
.who input:focus,.who select:focus{{outline:2px solid var(--acc);outline-offset:1px}}
.grid{{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(258px,1fr));
 margin-top:20px}}
.card{{background:var(--panel);border:1px solid var(--rule);border-radius:9px;
 overflow:hidden;display:flex;flex-direction:column}}
.card.done{{border-color:var(--acc)}}
.card img{{width:100%;height:224px;object-fit:contain;background:#fff;display:block}}
.card .noimg{{height:224px;display:flex;align-items:center;justify-content:center;
 color:var(--ink3);font-size:12px;background:var(--rule2)}}
.meta{{padding:9px 11px 4px}}
.meta b{{display:block;font-size:14.5px;line-height:1.35}}
.meta span{{display:block;color:var(--ink3);font-size:11.5px;
 font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace}}
.vrow{{display:flex;gap:5px;padding:7px 9px 9px}}
.vrow button{{flex:1;padding:11px 2px;font-size:14px;font-weight:600;cursor:pointer;
 border:1px solid var(--rule);border-radius:7px;background:var(--paper);
 color:var(--ink2);font-family:inherit;min-height:44px}}
.vrow button[aria-pressed="true"]{{color:#fff;border-color:transparent}}
.vrow button[data-v="STAR"][aria-pressed="true"]{{background:var(--star)}}
.vrow button[data-v="OK"][aria-pressed="true"]{{background:var(--ok)}}
.vrow button[data-v="SLOW"][aria-pressed="true"]{{background:var(--slow)}}
.vrow button[data-v="MIXED"][aria-pressed="true"]{{background:var(--mixed)}}
.detail{{border-top:1px solid var(--rule2);padding:11px;display:none}}
.detail.open{{display:block}}
.lab{{font-size:11.5px;color:var(--ink3);font-weight:500;margin:0 0 6px;
 display:flex;justify-content:space-between;align-items:baseline}}
.lab i{{font-style:normal;font-size:10.5px;color:var(--ink3)}}
.chips{{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px}}
.chips button{{padding:7px 11px;font-size:13px;cursor:pointer;min-height:36px;
 border:1px solid var(--rule);border-radius:16px;background:var(--paper);
 color:var(--ink2);font-family:inherit}}
.chips button[aria-pressed="true"]{{background:var(--acc);color:#fff;
 border-color:transparent}}
.more{{margin-bottom:12px}}
.more summary{{font-size:12.5px;color:var(--ink2);cursor:pointer;padding:5px 0;
 list-style:none}}
.more summary::-webkit-details-marker{{display:none}}
.more summary::before{{content:"▸ ";color:var(--ink3)}}
.more[open] summary::before{{content:"▾ "}}
.more h4{{font-size:11px;color:var(--ink3);margin:9px 0 5px;font-weight:500}}
.conf{{display:flex;gap:5px;margin-bottom:11px}}
.conf button{{flex:1;padding:9px 2px;font-size:13px;cursor:pointer;min-height:40px;
 border:1px solid var(--rule);border-radius:7px;background:var(--paper);
 color:var(--ink2);font-family:inherit}}
.conf button[aria-pressed="true"]{{background:var(--ink);color:var(--paper);
 border-color:transparent}}
.detail textarea{{width:100%;min-height:56px;padding:8px;font-size:15px;
 border:1px solid var(--rule);border-radius:6px;background:var(--paper);
 color:var(--ink);font-family:inherit;resize:vertical}}
.need{{color:var(--acc);font-size:11.5px;margin:0 0 9px;display:none}}
.need.show{{display:block}}
footer{{position:fixed;left:0;right:0;bottom:0;background:var(--panel);
 border-top:1px solid var(--rule);padding:11px 14px;
 box-shadow:0 -2px 14px rgba(0,0,0,.09);z-index:9}}
.fin{{max-width:1080px;margin:0 auto;display:flex;gap:11px;align-items:center;
 flex-wrap:wrap}}
.prog{{flex:1;min-width:150px;font-size:13px;color:var(--ink2)}}
.prog b{{color:var(--ink);font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:15px}}
.bar{{height:5px;background:var(--rule2);border-radius:3px;margin-top:5px;
 overflow:hidden}}
.bar i{{display:block;height:100%;background:var(--acc);width:0;
 transition:width .2s}}
footer button{{padding:11px 17px;font-size:14.5px;font-weight:600;cursor:pointer;
 border-radius:7px;font-family:inherit;min-height:44px;border:1px solid var(--rule);
 background:var(--paper);color:var(--ink)}}
footer button.go{{background:var(--acc);color:#fff;border-color:transparent}}
.hint{{font-size:12px;color:var(--ink3);max-width:1080px;margin:7px auto 0}}
.note{{border-left:3px solid var(--acc);background:var(--panel);padding:13px 17px;
 margin:18px 0 0;border-radius:0 7px 7px 0;font-size:13.5px;color:var(--ink2);
 max-width:70ch}}
.note b{{color:var(--ink)}}
@media(max-width:520px){{
 .grid{{grid-template-columns:1fr 1fr;gap:9px}}
 .card img,.card .noimg{{height:158px}}
 .meta b{{font-size:13px}} .vrow button{{font-size:13px;padding:10px 1px}}
 /* 兩欄的卡片只有約 190px 寬，三顆並排會把「很有把握」折成兩行，
    看起來像壞掉。窄螢幕改直排：卡片變高，但每一顆都點得到、讀得完。 */
 .conf{{flex-direction:column;gap:4px}}
 .conf button{{min-height:38px;font-size:13.5px}}
}}
</style>
<div class="page">
<header>
<h1>{e(title)}</h1>
<p class="dek">看照片，點一下暢或滯就好{'。' if not period else f'（{e(period)}）。'}
<b>只點暢滯、不填理由也算完成</b> —— 三十款的判斷比三款的長篇更有用。
點了暢或滯才會展開理由，那時候再填。</p>
<div class="who">
<div><label for="who">填表人</label><input id="who" placeholder="您的姓名"></div>
<div><label for="store">門市／區域</label><input id="store"
 placeholder="{e(store_hint) or '例：台北信義店'}"></div>
<div><label for="src">身分</label><select id="src"></select></div>
<div><label for="date">日期</label><input id="date" type="date"></div>
</div>
<div class="note">
<p><b>把握程度是必填的。</b>這不是多問一句。之後商品實際賣完了，
系統會回頭比對您當時的判斷準不準 —— 「說對了」和「很有把握而且說對了」
是兩件事，只有後者能當下一季的早期訊號用。沒把握就選「不太確定」，
那不會扣分，猜一個高把握才會。</p>
</div>
</header>
<div class="grid" id="grid"></div>
</div>
<footer><div class="fin">
<div class="prog"><span id="ptxt">尚未開始</span>
<div class="bar"><i id="pbar"></i></div></div>
<button id="csv" class="go">匯出 CSV</button>
<button id="copy">複製到剪貼簿</button>
<button id="clear">清空</button>
</div><p class="hint" id="hint">填到一半可以關掉，資料留在這台裝置的瀏覽器裡。</p></footer>
<script>
const D = {payload};
const KEY = "kinloch_counter_" + (D.period || "default");
let S = {{}};
try {{ S = JSON.parse(localStorage.getItem(KEY) || "{{}}"); }} catch (e) {{ S = {{}}; }}

function save() {{
  try {{ localStorage.setItem(KEY, JSON.stringify(S)); }} catch (e) {{}}
  progress();
}}
// 「完成」的定義是點了判定。理由與備註是加分，不是門檻 ——
// 把門檻設在理由上，回收率會掉，而判定本身才是最有價值的那一格。
function isDone(s) {{ return s && s.verdict && s.confidence; }}

function progress() {{
  const n = D.products.filter(p => isDone(S[p.sku])).length;
  const t = D.products.length;
  document.getElementById("ptxt").textContent =
    n === 0 ? "尚未開始" : `已完成 ${{n}} / ${{t}} 款`;
  document.getElementById("pbar").style.width = (t ? n / t * 100 : 0) + "%";
}}

function chip(code, zh, sku) {{
  const on = (S[sku]?.tags || []).includes(code);
  return `<button type="button" data-tag="${{code}}" data-sku="${{sku}}"
    aria-pressed="${{on}}">${{zh}}</button>`;
}}

function detailHTML(p) {{
  const s = S[p.sku] || {{}};
  const pol = D.polarity[s.verdict] || "both";
  let pool = [];
  if (pol === "good") pool = D.tags.good;
  else if (pol === "bad") pool = D.tags.bad;
  else pool = D.tags.good.concat(D.tags.bad);
  const chips = pool.map(t => chip(t.code, t.zh, p.sku)).join("");
  const more = D.tags.more.map(g =>
    `<h4>${{g.group}}</h4><div class="chips">` +
    g.tags.map(t => chip(t.code, t.zh, p.sku)).join("") + `</div>`).join("");
  const cf = [["HIGH", "很有把握"], ["MEDIUM", "還算確定"], ["LOW", "不太確定"]]
    .map(([c, zh]) => `<button type="button" data-conf="${{c}}" data-sku="${{p.sku}}"
      aria-pressed="${{s.confidence === c}}">${{zh}}</button>`).join("");
  return `
    <p class="need ${{s.verdict && !s.confidence ? "show" : ""}}"
       id="need-${{p.sku}}">↓ 還差把握程度</p>
    <div class="lab">把握程度<i>必填</i></div>
    <div class="conf">${{cf}}</div>
    <div class="lab">理由<i>選填，可複選</i></div>
    <div class="chips">${{chips}}</div>
    <details class="more"><summary>更多理由</summary>${{more}}</details>
    <div class="lab">補充<i>選填</i></div>
    <textarea data-note="${{p.sku}}" placeholder="客人怎麼說的？"
      >${{(s.note || "").replace(/</g, "&lt;")}}</textarea>`;
}}

function render() {{
  document.getElementById("grid").innerHTML = D.products.map(p => {{
    const s = S[p.sku] || {{}};
    const img = p.image
      ? `<img src="${{p.image}}" alt="" loading="lazy">`
      : `<div class="noimg">沒有照片</div>`;
    const vb = D.verdicts.map(v =>
      `<button type="button" data-v="${{v.code}}" data-sku="${{p.sku}}"
        aria-pressed="${{s.verdict === v.code}}" title="${{v.note || ""}}"
        >${{v.zh}}</button>`).join("");
    return `<div class="card ${{isDone(s) ? "done" : ""}}" data-card="${{p.sku}}">
      ${{img}}
      <div class="meta"><b>${{p.name || ""}}</b>
        <span>${{p.sku}}　${{p.category || ""}}　${{p.season || ""}}</span></div>
      <div class="vrow">${{vb}}</div>
      <div class="detail ${{s.verdict ? "open" : ""}}">${{s.verdict ? detailHTML(p) : ""}}</div>
    </div>`;
  }}).join("");
  progress();
}}

function redrawCard(sku) {{
  const p = D.products.find(x => x.sku === sku);
  const card = document.querySelector(`[data-card="${{sku}}"]`);
  if (!p || !card) return;
  const s = S[sku] || {{}};
  card.classList.toggle("done", isDone(s));
  card.querySelectorAll(".vrow button").forEach(b =>
    b.setAttribute("aria-pressed", String(s.verdict === b.dataset.v)));
  const d = card.querySelector(".detail");
  d.classList.toggle("open", !!s.verdict);
  d.innerHTML = s.verdict ? detailHTML(p) : "";
}}

document.addEventListener("click", ev => {{
  const b = ev.target.closest("button");
  if (!b) return;
  const sku = b.dataset.sku;
  if (b.dataset.v && sku) {{
    S[sku] = S[sku] || {{}};
    // 再點一次同一個判定就取消 —— 點錯了要收得回來
    S[sku].verdict = S[sku].verdict === b.dataset.v ? "" : b.dataset.v;
    if (!S[sku].verdict) {{ delete S[sku].confidence; }}
    save(); redrawCard(sku);
  }} else if (b.dataset.conf && sku) {{
    S[sku] = S[sku] || {{}};
    S[sku].confidence = S[sku].confidence === b.dataset.conf ? "" : b.dataset.conf;
    save(); redrawCard(sku);
  }} else if (b.dataset.tag && sku) {{
    S[sku] = S[sku] || {{}};
    const t = new Set(S[sku].tags || []);
    t.has(b.dataset.tag) ? t.delete(b.dataset.tag) : t.add(b.dataset.tag);
    S[sku].tags = [...t];
    b.setAttribute("aria-pressed", String(t.has(b.dataset.tag)));
    save();
  }}
}});

document.addEventListener("input", ev => {{
  const sku = ev.target.dataset?.note;
  if (!sku) return;
  S[sku] = S[sku] || {{}};
  S[sku].note = ev.target.value;
  save();
}});

// 匯出的欄位順序與 ingest.feedback.COLUMNS 一字不差，
// 對不上的話匯進系統會靜靜地錯位，不會報錯。
const COLS = ["sku","style_code","season","category","verdict","reason_tags",
  "reason_text","source","respondent","store_or_region","survey_date",
  "confidence","suggested_action","follow_up_note"];

function q(v) {{
  v = (v == null ? "" : String(v));
  return /[",\\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}}

function csv() {{
  const who = document.getElementById("who").value.trim();
  const store = document.getElementById("store").value.trim();
  const src = document.getElementById("src").value;
  const date = document.getElementById("date").value;
  const lines = [COLS.join(",")];
  for (const p of D.products) {{
    const s = S[p.sku];
    if (!isDone(s)) continue;
    lines.push([p.sku, p.style_code || p.sku, p.season || "", p.category || "",
      s.verdict, (s.tags || []).join("|"), s.note || "", src, who, store,
      date, s.confidence, "", ""].map(q).join(","));
  }}
  return lines.join("\\n");
}}

function guard() {{
  const who = document.getElementById("who").value.trim();
  const n = D.products.filter(p => isDone(S[p.sku])).length;
  if (!who) {{ alert("請先填「填表人」，不然回報進系統時分不出是誰填的。"); return false; }}
  if (!n) {{ alert("還沒有完成任何一款（判定 + 把握程度）。"); return false; }}
  return true;
}}

document.getElementById("csv").onclick = () => {{
  if (!guard()) return;
  const who = document.getElementById("who").value.trim();
  const date = document.getElementById("date").value;
  // Excel 認 UTF-8 要靠 BOM，少了它中文會變亂碼
  const blob = new Blob(["\\uFEFF" + csv()], {{type: "text/csv;charset=utf-8"}});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `回饋_${{who}}_${{date}}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}};

document.getElementById("copy").onclick = async () => {{
  if (!guard()) return;
  try {{
    await navigator.clipboard.writeText(csv());
    document.getElementById("hint").textContent =
      "已複製。貼到 Excel 或直接回傳訊息都可以。";
  }} catch (e) {{
    // 某些行動瀏覽器不給剪貼簿權限，退回讓人自己選取
    const w = window.open("", "_blank");
    w.document.write("<pre style='font:13px/1.5 monospace;white-space:pre-wrap'>"
      + csv().replace(/</g, "&lt;") + "</pre>");
  }}
}};

document.getElementById("clear").onclick = () => {{
  if (!confirm("清空這份表單已填的內容？")) return;
  S = {{}}; save(); render();
}};

(function init() {{
  document.getElementById("src").innerHTML = D.sources.map(s =>
    `<option value="${{s.code}}">${{s.zh}}</option>`).join("");
  const d = document.getElementById("date");
  d.value = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4)
    .toISOString().slice(0, 10);
  for (const id of ["who", "store", "src", "date"]) {{
    const el = document.getElementById(id);
    const k = KEY + "_" + id;
    try {{ if (localStorage.getItem(k)) el.value = localStorage.getItem(k); }} catch (e) {{}}
    el.addEventListener("change", () => {{
      try {{ localStorage.setItem(k, el.value); }} catch (e) {{}}
    }});
  }}
  render();
}})();
</script>"""
