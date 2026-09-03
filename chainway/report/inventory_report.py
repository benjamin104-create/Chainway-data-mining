"""款號 × 進銷存清單，依設計特徵分區。

前一份報告回答「哪種配置好賣」。這一份回答下一個問題：
**那些款到底是哪幾件、現在還剩多少貨。** 結論要能落到貨號上才用得了。

## 三個刻意的設計決定

**一、每一款在一個系列裡只出現一次。**

一件「熊頭織標口袋格紋休閒外套」同時符合熊在口袋、熊用織標、格紋外套。
若讓它在每個群組都出現，小計加起來會超過實際款數，庫存也會重複計算 ——
報表就不能用了。所以群組用優先序指派：位置優先於形式，先命中先歸屬。

系列之間（熊／牛仔／格紋）則允許重疊，因為那是真實情況（42 款既有熊也有格）。
總計改用去重後的聯集，重疊數另外標出來。

**二、庫存給兩個數字，因為貴司報表本來就有兩個。**

`總存` = 累進 − 總銷，是這一季投入的量還沒賣掉的部分（2,469 款完全相符，
不是估算）。`庫存` 是報表另一欄，與總存只有 15% 相同 —— 多半是現場實際
還在架上／倉裡的量。兩個都給，讓人自己判斷要看哪一個，不替使用者做選擇。

**三、縮圖要看得清楚。**

小到只有程式讀得懂的縮圖沒有意義。預設存 300px 寬、顯示 180px，
滑過去放大到原尺寸 —— 放大用的是同一張點陣圖，不會多佔位元組也不會糊。
整份超過大小上限時自動降階並在報表上註明，不會靜靜地產生一個開不了的檔案。
"""
from __future__ import annotations

import base64
import html
import io
import re
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import pandas as pd

from ..analysis import motif

# 完銷率分級。名稱一律跟著顏色出現 —— 顏色不單獨承載意義。
BANDS: list[tuple[str, float, str]] = [
    ("完售", 0.95, "b5"),
    ("暢銷", 0.80, "b4"),
    ("一般", 0.50, "b3"),
    ("偏慢", 0.30, "b2"),
    ("滯銷", 0.00, "b1"),
]

# 熊：位置優先於形式。位置是設計圖上看得到的東西，形式要看工單，
# 對前端設計群來說位置好用得多。
BEAR_GROUPS: list[tuple[str, str]] = [
    ("熊在口袋", motif.BEAR_PLACEMENT["口袋"]),
    ("熊在連帽", motif.BEAR_PLACEMENT["連帽"]),
    ("熊在袖", motif.BEAR_PLACEMENT["袖"]),
    ("熊在領口", motif.BEAR_PLACEMENT["領口"]),
    ("熊在肩／披肩", motif.BEAR_PLACEMENT["肩／披肩"]),
    ("熊在胸前", motif.BEAR_PLACEMENT["胸前"]),
    ("熊在下擺", motif.BEAR_PLACEMENT["下擺"]),
    ("熊在腰", motif.BEAR_PLACEMENT["腰"]),
    ("熊在側邊／不對稱", motif.BEAR_PLACEMENT["側邊／不對稱"]),
    ("立體吊飾熊", motif.BEAR_FORM["立體吊飾（吊掛・腰包・皮絆）"]),
    # 半數熊款的品名沒寫位置，只寫工法（「大熊頭燙鑽針織上衣」「小熊繡花短袖棉T」）。
    # 全部丟進一個「未標明」等於一百件擠在一格，看不出東西。
    # 這些款的品名寫的是形式，就依形式分 —— 用資料實際提供的維度，不是硬套。
    ("未標位置・刺繡", motif.BEAR_FORM["刺繡（電繡・繡花）"]),
    ("未標位置・燙鑽水鑽", motif.BEAR_FORM["燙鑽・水鑽・亮片"]),
    ("未標位置・織標", motif.BEAR_FORM["織標"]),
    ("未標位置・貼布繡", motif.BEAR_FORM["貼布繡"]),
    ("未標位置・印花圖案", motif.BEAR_FORM["印花・圖案"]),
    ("未標位置・其他", r"."),
]

# 部位詞與「格」相鄰才算局部配格 —— 兩種語序都要收：
# 「格布肩帶短袖棉T」「久帶絲領口格上衣」「一字口袋卡格邊連帽外套」
_PLAID_LOCAL = (r"格[^，]{0,3}(?:領|袖|口袋|貼袋|肩|腰|帽|下擺)"
                r"|(?:領|袖|口袋|貼袋|肩|腰|帽|下擺)[^，]{0,3}格")

PLAID_GROUPS: list[tuple[str, str]] = [
    ("格紋配件（腰帶・領巾・披肩）", motif.PLAID_FORM["格紋配件（腰帶・領巾・蝴蝶結・披肩）"]),
    ("織花格（菱格・千鳥・棋盤）", motif.PLAID_FORM["織花格（菱格・千鳥・棋盤）"]),
    ("格紋滾邊／包釦", motif.PLAID_FORM["格紋滾邊／包釦"]),
    ("拼接配格（格布接素面）", motif.PLAID_FORM["拼接配格（格布接素面）"]),
    ("局部配格（領・袖・口袋・肩・腰・帽）", _PLAID_LOCAL),
    # 到這一層還帶「格」字、卻沒有部位詞也沒有拼接詞的，多半是整件格布
    #（「格吊帶裙」「涼爽羊毛格布裙」「經典格布西裝外套」）。
    # 但它是排除法得到的，不是正面辨認出來的，名字就照實寫。
    ("主體格布（未標局部或拼接）", r"格"),
    # 5 字頭卻整個品名沒提到格紋的款。這不是分類失敗，是一個真實的類別 ——
    # 值得單獨看，因為它們掛在格紋線底下但外觀可能看不出格紋。
    ("品名未提及格紋", r"."),
]

DENIM_GROUPS: list[tuple[str, str]] = [
    ("牛仔褲", r"褲"), ("牛仔裙", r"裙"), ("牛仔外套", r"外套"),
    ("牛仔洋裝", r"洋裝"), ("其他牛仔款", r"."),
]

NUM_COLS = ["stock_in", "net_sales_qty", "stock_on_hand",
            "stock_on_hand_alt", "sales_amount"]


def e(s: Any) -> str:
    return html.escape(str(s))


def band_of(rate: float | None) -> tuple[str, str]:
    if rate is None or pd.isna(rate):
        return ("無資料", "b0")
    for name, floor, cls in BANDS:
        if rate >= floor:
            return (name, cls)
    return ("滯銷", "b1")


def index_images(roots: Iterable[Path], pattern: str = r"KA\d{7}") -> dict[str, Path]:
    """掃描影像庫，貨號 → 圖檔路徑。

    用檔名比對而不是猜路徑結構 —— 資料夾怎麼分是人決定的，會變；
    貨號寫在檔名裡是規則，不會變。同一貨號有多張時取檔案較大的那張
    （通常是主圖而非細部圖）。
    """
    rx = re.compile(pattern)
    best: dict[str, tuple[int, Path]] = {}
    exts = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    for root in roots:
        if not root or not Path(root).exists():
            continue
        for p in Path(root).rglob("*"):
            if not p.is_file() or p.suffix.lower() not in exts:
                continue
            m = rx.search(p.name)
            if not m:
                continue
            try:
                size = p.stat().st_size
            except OSError:
                continue
            cur = best.get(m.group(0))
            if cur is None or size > cur[0]:
                best[m.group(0)] = (size, p)
    return {k: v[1] for k, v in best.items()}


def thumb(path: Path | None, width: int = 300, quality: int = 72) -> str | None:
    if not path:
        return None
    try:
        from PIL import Image
        im = Image.open(path).convert("RGB")
        im.thumbnail((width, int(width * 1.4)))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=quality, optimize=True)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return None


def assign_groups(pool: pd.DataFrame, groups: Sequence[tuple[str, str]], *,
                  name_col: str = "product_name") -> pd.Series:
    """依優先序把每一款指派到唯一一個群組 —— 先命中先歸屬。

    回傳與 pool 同索引的群組名。沒有這一步，小計就會重複計算。
    """
    names = pool[name_col].fillna("").astype(str)
    out = pd.Series(index=pool.index, dtype=object)
    for label, pat in groups:
        hit = names.str.contains(pat, regex=True) & out.isna()
        out[hit] = label
    return out.fillna(groups[-1][0] if groups else "其他")


def totals(sub: pd.DataFrame) -> dict[str, Any]:
    n = {c: float(pd.to_numeric(sub[c], errors="coerce").fillna(0).sum())
         for c in NUM_COLS if c in sub.columns}
    inn = n.get("stock_in", 0.0)
    return {"款數": len(sub), "進": inn, "銷": n.get("net_sales_qty", 0.0),
            "存": n.get("stock_on_hand", 0.0), "現場": n.get("stock_on_hand_alt", 0.0),
            "銷貨額": n.get("sales_amount", 0.0),
            "整體完銷": (n.get("net_sales_qty", 0.0) / inn) if inn else float("nan")}


def _fmt(v: float, d: int = 0) -> str:
    return "—" if pd.isna(v) else f"{v:,.{d}f}"


def _sum_strip(t: dict[str, Any], *, label: str = "小計") -> str:
    rate = t["整體完銷"]
    bname, bcls = band_of(rate)
    cells = [("款數", f'{t["款數"]:,}'), ("進　累進", _fmt(t["進"])),
             ("銷　總銷", _fmt(t["銷"])), ("存　總存", _fmt(t["存"])),
             ("現場庫存", _fmt(t["現場"])), ("銷貨額", _fmt(t["銷貨額"]))]
    return ('<div class="sums"><span class="lbl">' + e(label) + "</span>"
            + "".join(f'<span class="s"><i>{e(k)}</i><b>{v}</b></span>' for k, v in cells)
            + f'<span class="s rate {bcls}"><i>整體完銷</i>'
            f'<b>{"—" if pd.isna(rate) else f"{rate:.1%}"}</b></span></div>')


def _card(r: pd.Series, src: str | None, season_label: str) -> str:
    rate = r.get("sell_through_rate")
    bname, bcls = band_of(rate)
    pic = (f'<img src="{src}" alt="" loading="lazy">' if src
           else '<div class="noimg">無<br>系統圖</div>')
    def q(c):
        v = pd.to_numeric(pd.Series([r.get(c)]), errors="coerce").iloc[0]
        return "—" if pd.isna(v) else f"{v:,.0f}"
    return (f'<article class="card {bcls}">'
            f'<div class="ph">{pic}<span class="tag {bcls}">{e(bname)}</span></div>'
            f'<div class="meta"><p class="sku">{e(r.get("sku", ""))}</p>'
            f'<p class="nm">{e(r.get("product_name", ""))}</p>'
            f'<p class="ss">{e(season_label)}　NT$ {q("list_price")}</p>'
            f'<dl><div><dt>進</dt><dd>{q("stock_in")}</dd></div>'
            f'<div><dt>銷</dt><dd>{q("net_sales_qty")}</dd></div>'
            f'<div class="hi"><dt>存</dt><dd>{q("stock_on_hand")}</dd></div>'
            f'<div><dt>現場</dt><dd>{q("stock_on_hand_alt")}</dd></div></dl>'
            f'<p class="rt {bcls}">完銷 '
            f'{"—" if pd.isna(rate) else f"{rate:.0%}"}</p></div></article>')


CSS = """
:root{--paper:#F2EEE6;--panel:#FBF9F4;--ink:#232019;--ink2:#5E574A;--ink3:#8C8474;
 --rule:#DCD4C4;--rule2:#EDE7DA;--wine:#7A2E38;--ochre:#B08A3E;--navy:#2B3A55;
 --b5:#1a5599;--b4:#5aa4ee;--b3:#8b8478;--b2:#f09355;--b1:#b53230;--b0:#a9a296}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
 --paper:#191712;--panel:#221F19;--ink:#F0EBDF;--ink2:#B3AB99;--ink3:#847C6B;
 --rule:#38332A;--rule2:#2B271F;--wine:#C08A93;--ochre:#CBA455;--navy:#8FA3C4;
 --b5:#66b0f0;--b4:#2a70bd;--b3:#9a9284;--b2:#efa94f;--b1:#d34f57;--b0:#6f6a5f}}
:root[data-theme="dark"]{
 --paper:#191712;--panel:#221F19;--ink:#F0EBDF;--ink2:#B3AB99;--ink3:#847C6B;
 --rule:#38332A;--rule2:#2B271F;--wine:#C08A93;--ochre:#CBA455;--navy:#8FA3C4;
 --b5:#66b0f0;--b4:#2a70bd;--b3:#9a9284;--b2:#efa94f;--b1:#d34f57;--b0:#6f6a5f}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-size:15px;line-height:1.75;
 font-family:"Noto Sans TC","Microsoft JhengHei UI","Microsoft JhengHei","PingFang TC",-apple-system,"Segoe UI",system-ui,sans-serif}
.page{max-width:1360px;margin:0 auto;padding:0 22px 110px}
.sett{height:9px;border:none;margin:0;background:repeating-linear-gradient(90deg,
 var(--navy) 0 22px,var(--wine) 22px 30px,var(--navy) 30px 40px,var(--ochre) 40px 43px,
 var(--navy) 43px 62px,var(--paper) 62px 66px,var(--navy) 66px 74px,
 var(--ochre) 74px 77px,var(--navy) 77px 96px)}
header.mast{padding:52px 0 22px}
.eyebrow{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:11.5px;
 letter-spacing:.16em;text-transform:uppercase;color:var(--ink3);margin:0 0 12px}
h1{font-family:"Noto Serif TC","Source Han Serif TC","PMingLiU","Songti TC",Georgia,serif;font-weight:700;
 font-size:clamp(27px,4.4vw,40px);line-height:1.25;margin:0 0 14px;text-wrap:balance}
.dek{font-size:16px;color:var(--ink2);max-width:62ch;margin:0 0 8px}

nav.jump{position:sticky;top:0;z-index:20;background:var(--paper);
 border-bottom:1px solid var(--rule);padding:9px 0;margin-bottom:6px;
 display:flex;flex-wrap:wrap;gap:6px;align-items:center}
nav.jump a{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:11.5px;
 letter-spacing:.04em;text-decoration:none;color:var(--ink2);padding:4px 10px;
 border:1px solid var(--rule);border-radius:99px;background:var(--panel);white-space:nowrap}
nav.jump a:hover,nav.jump a:focus-visible{color:var(--ink);border-color:var(--ink3);outline:none}
nav.jump a:focus-visible{outline:2px solid var(--navy);outline-offset:2px}

section{padding-top:44px;scroll-margin-top:56px}
h2{font-family:"Noto Serif TC","Source Han Serif TC","PMingLiU","Songti TC",Georgia,serif;font-size:24px;font-weight:700;margin:0 0 4px}
h2 .num{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12.5px;
 color:var(--wine);letter-spacing:.1em;display:block;margin-bottom:7px;font-weight:500}
h3{font-family:"Noto Serif TC","Source Han Serif TC","PMingLiU","Songti TC",Georgia,serif;font-size:18px;margin:34px 0 2px;font-weight:600}
h3 .cnt{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12px;
 color:var(--ink3);font-weight:400;margin-left:8px}
p{margin:0 0 13px;max-width:66ch}
.sub{font-size:13.5px;color:var(--ink2)}

.sums{display:flex;flex-wrap:wrap;align-items:center;gap:0;background:var(--panel);
 border:1px solid var(--rule);border-radius:4px;margin:10px 0 16px;overflow:hidden}
.sums .lbl{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:10.5px;
 letter-spacing:.1em;color:var(--ink3);padding:11px 14px;border-right:1px solid var(--rule2);
 align-self:stretch;display:flex;align-items:center;white-space:nowrap}
.sums .s{padding:9px 16px;border-right:1px solid var(--rule2);flex:1 1 auto;min-width:104px}
.sums .s:last-child{border-right:none}
.sums i{display:block;font-style:normal;font-size:10.5px;color:var(--ink3);
 font-family:"IBM Plex Mono",ui-monospace,monospace;letter-spacing:.05em}
.sums b{font-size:17px;font-variant-numeric:tabular-nums;
 font-family:"IBM Plex Mono",ui-monospace,monospace;font-weight:600}
.sums .rate b{color:var(--ink)}
.sums.grand{border-width:2px;border-color:var(--ink3)}
.sums.grand b{font-size:20px}

.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(186px,1fr));gap:12px}
.card{background:var(--panel);border:1px solid var(--rule);border-radius:5px;
 overflow:hidden;border-left-width:4px}
.card.b5{border-left-color:var(--b5)} .card.b4{border-left-color:var(--b4)}
.card.b3{border-left-color:var(--b3)} .card.b2{border-left-color:var(--b2)}
.card.b1{border-left-color:var(--b1)} .card.b0{border-left-color:var(--b0)}
.ph{position:relative;background:#fff;height:240px;display:flex;align-items:center;
 justify-content:center;border-bottom:1px solid var(--rule2);overflow:visible}
.ph img{max-width:100%;max-height:240px;object-fit:contain;display:block;
 transition:transform .16s ease}
.card:hover .ph img,.card:focus-within .ph img{transform:scale(1.55);
 position:relative;z-index:9;box-shadow:0 6px 26px rgba(0,0,0,.32)}
@media (prefers-reduced-motion:reduce){.ph img{transition:none}
 .card:hover .ph img{transform:none}}
.noimg{color:var(--ink3);font-size:11.5px;text-align:center;line-height:1.5}
.tag{position:absolute;top:6px;left:6px;font-size:10.5px;font-weight:700;
 padding:2px 7px;border-radius:3px;color:#fff;letter-spacing:.05em;z-index:2}
.tag.b5{background:var(--b5)} .tag.b4{background:var(--b4);color:#08243f}
.tag.b3{background:var(--b3)} .tag.b2{background:var(--b2);color:#3d1f05}
.tag.b1{background:var(--b1)} .tag.b0{background:var(--b0)}
.meta{padding:8px 10px 10px}
.sku{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12.5px;
 font-weight:600;margin:0;letter-spacing:.02em}
.nm{font-size:12.5px;margin:1px 0 3px;line-height:1.45;color:var(--ink)}
.ss{font-size:11px;color:var(--ink3);margin:0 0 7px;
 font-family:"IBM Plex Mono",ui-monospace,monospace}
.meta dl{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin:0;
 border-top:1px solid var(--rule2);padding-top:6px}
.meta dl div{text-align:center}
.meta dt{font-size:9.5px;color:var(--ink3);margin:0;
 font-family:"IBM Plex Mono",ui-monospace,monospace}
.meta dd{margin:0;font-size:13px;font-variant-numeric:tabular-nums;font-weight:600;
 font-family:"IBM Plex Mono",ui-monospace,monospace}
.meta dl .hi dd{color:var(--wine)}
.rt{font-size:11.5px;margin:6px 0 0;font-weight:700;text-align:right;
 font-family:"IBM Plex Mono",ui-monospace,monospace}
.rt.b5{color:var(--b5)} .rt.b4{color:var(--b4)} .rt.b3{color:var(--b3)}
.rt.b2{color:var(--b2)} .rt.b1{color:var(--b1)} .rt.b0{color:var(--b0)}

.legend{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 4px;align-items:center}
.legend span{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink2);
 font-family:"IBM Plex Mono",ui-monospace,monospace}
.legend i{width:13px;height:13px;border-radius:3px;display:block}
.note{border-left:3px solid var(--wine);background:var(--panel);padding:14px 18px;
 margin:18px 0;border-radius:0 4px 4px 0;font-size:13.5px;color:var(--ink2)}
.note b{color:var(--ink)}
.note p{margin:0 0 8px}.note p:last-child{margin:0}
footer{margin-top:60px;padding-top:22px;border-top:1px solid var(--rule);
 font-size:13px;color:var(--ink2)}
footer code{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12px;
 background:var(--panel);border:1px solid var(--rule);padding:1px 5px;border-radius:2px}
"""


def build(df: pd.DataFrame, sku_images: Mapping[str, Path] | None = None, *,
          thumb_width: int = 300, quality: int = 72,
          season_labeller=None, only: Sequence[str] | None = None) -> str:
    """產生完整報表 HTML。sku_images 為空時照樣產出，只是沒有縮圖。

    only：只出這幾個系列（bear / denim / plaidline / plaidother）。
    帶圖時整份會很大，需要時可以只出其中一兩節。
    """
    sku_images = sku_images or {}
    d = motif.add_body_part(df)
    names = d["product_name"].fillna("").astype(str)
    label = season_labeller or (lambda sku: "")

    series: list[dict[str, Any]] = [
        {"id": "bear", "title": "熊系列", "num": "一",
         "pool": d[names.str.contains(motif.BEAR_PATTERN)],
         "groups": BEAR_GROUPS,
         "lead": "依熊出現的位置分區。位置優先於形式指派，每一款只會出現一次，"
                 "所以各區小計相加等於系列總數。"},
        {"id": "denim", "title": "牛仔系列", "num": "二",
         "pool": d[names.str.contains(r"牛仔")],
         "groups": DENIM_GROUPS, "lead": "依部位分區。"},
        {"id": "plaidline", "title": "經典格紋線（貨號 5 字頭）", "num": "三",
         "pool": d[d["category_code"].astype(str).str.startswith("5")],
         "groups": PLAID_GROUPS,
         "lead": "這是正式的格紋產品線，以貨號認定，不靠品名猜。依格紋的使用形式分區。"},
        {"id": "plaidother", "title": "格紋元素（品名有格，但不在格紋線）", "num": "四",
         "pool": d[names.str.contains(motif.PLAID_PATTERN)
                   & ~d["category_code"].astype(str).str.startswith("5")],
         "groups": PLAID_GROUPS,
         "lead": "領子配格、格蝴蝶結這類「帶一點格紋」的款。與上一節分開，"
                 "因為兩者的表現差很多（格紋線 +8.0pt，這一群 +3.2pt）。"},
    ]

    if only:
        keep = {k.strip() for k in only}
        series = [s for s in series if s["id"] in keep]
        if not series:
            raise ValueError("--series 沒有對應到任何系列；可用："
                             "bear、denim、plaidline、plaidother")

    body: list[str] = []
    nav: list[str] = []
    seen: set[str] = set()

    for s in series:
        pool = s["pool"].copy()
        if pool.empty:
            continue
        pool["_g"] = assign_groups(pool, s["groups"])
        seen |= set(pool["sku"].astype(str))
        st = totals(pool)
        nav.append(f'<a href="#{s["id"]}">{e(s["title"])}　{st["款數"]}</a>')

        blocks = []
        order = [g for g, _ in s["groups"]]
        for gname in order:
            sub = pool[pool["_g"] == gname]
            if sub.empty:
                continue
            sub = sub.sort_values("stock_on_hand", ascending=False)
            cards = "".join(
                _card(r, thumb(sku_images.get(str(r.get("sku"))), thumb_width, quality),
                      label(str(r.get("sku"))))
                for _, r in sub.iterrows())
            blocks.append(f'<h3>{e(gname)}<span class="cnt">{len(sub)} 款</span></h3>'
                          f'{_sum_strip(totals(sub))}'
                          f'<div class="grid">{cards}</div>')

        body.append(
            f'<section id="{s["id"]}"><h2><span class="num">{s["num"]}</span>'
            f'{e(s["title"])}</h2><p class="sub">{e(s["lead"])}</p>'
            f'{_sum_strip(st, label=s["title"] + " 合計")}'
            + "".join(blocks) + "</section><hr class=\"sett\">")

    union = d[d["sku"].astype(str).isin(seen)]
    grand = totals(union)
    overlap = sum(len(s["pool"]) for s in series) - len(seen)
    with_img = sum(1 for k in seen if k in sku_images)

    no_img_note = ("" if with_img else
        '<div class="note"><p><b>這一份沒有縮圖。</b>'
        '影像庫裡沒有比對到任何貨號的圖檔 —— 不是這些款不存在，是跑報表的機器上'
        '讀不到系統圖資料夾。在放著系統圖的電腦上執行 '
        '<code>python -m chainway.cli inventory</code>，'
        '或加 <code>--images "系統圖資料夾路徑"</code> 指定位置，'
        '同一份報表就會帶圖。數字不受影響。</p></div>')

    legend = "".join(
        f'<span><i style="background:var(--{cls})"></i>{e(n)}'
        f'{"　≥" + f"{f:.0%}" if f else "　<30%"}</span>'
        for n, f, cls in BANDS)

    return f"""<title>熊・牛仔・格紋 進銷存清單</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Noto+Sans+TC:wght@400;500;600;700&family=Noto+Serif+TC:wght@600;700&display=swap">
<style>{CSS}</style>
<div class="page">
<header class="mast">
  <p class="eyebrow">Kinloch Anderson　設計逆向工程　款號對照</p>
  <h1>熊・牛仔・格紋　款號與進銷存清單</h1>
  <p class="dek">前一份報告說哪種配置好賣。這一份把它落到貨號上：
  是哪幾件、賣掉多少、現在還剩多少。</p>
  <div class="legend">{legend}</div>
</header>
<nav class="jump" aria-label="分區導覽">{"".join(nav)}
<a href="#total">總計</a></nav>

{''}{no_img_note}
<div class="note">
<p><b>庫存有兩個數字，因為貴司報表本來就有兩欄。</b>
「<b>總存</b>」＝累進 − 總銷，是這一季投入的量還沒賣掉的部分，
2,469 款完全對得起來，不是估算。「<b>現場</b>」是報表另一欄的「庫存」，
與總存只有 15% 相同 —— 每六款有五款對不上。那不是誤差，
是兩個在量不同東西的數字。</p>
<p><b>該看哪一個，看您要做什麼決定：</b></p>
<p>・<b>設計決策</b>（這款要不要延續、下季開幾款、投多少量）→ 看<b>總存</b>。
問的是「這一季的投入划不划算」，那是一筆封閉的帳；調撥、報廢、盤差、
跨季混庫都不該影響這個判斷，而總存的算法本來就碰不到那些。</p>
<p>・<b>營運決策</b>（要不要補貨、要不要調撥、要不要打折出清）→ 看<b>現場</b>。
問的是「現在還有多少摸得到的貨」。這時候帳上的數字沒有用，架上有沒有才有用。</p>
<p>・<b>兩個差很多的那幾款 → 先盤點，兩個都不要用。</b>
差到一定程度時至少有一個是錯的，而從報表上分不出是哪一個 ——
拿任何一個下決定都是在賭。哪幾款值得走一趟，跑
<code>inventory --stock-gap</code>，它按差的件數排序（盤點成本按件算，
一款差 300 件比十款各差 3 件重要得多）。</p>
<p><b>系列之間會重疊，系列之內不會。</b>
一件「熊頭織標口袋格紋休閒外套」同時屬於熊系列與格紋系列，這是真實情況。
但在同一個系列裡，每一款只會被指派到一個分區（位置優先於形式），
所以各分區小計相加＝系列合計。最後的總計用去重後的聯集，重疊 {overlap} 款只算一次。</p>
</div>

{"".join(body)}

<section id="total">
  <h2><span class="num">總計</span>三個系列的去重合計</h2>
  <p class="sub">{len(seen):,} 款（各系列相加 {sum(len(s["pool"]) for s in series):,}，
  扣掉重複計入的 {overlap} 款）。全庫 {len(d):,} 款，佔 {len(seen)/max(len(d),1):.1%}。</p>
  {_sum_strip(grand, label="總計")}
</section>

<footer>
<p><b>納入條件</b>　投入件數 ≥ 30、非贈品、完銷率有值。資料為 5 年 19 季。
縮圖對應到 {with_img:,} / {len(seen):,} 款；沒有系統圖的以「無系統圖」標示，
不是那件不存在，是影像庫裡沒有比對到該貨號的檔案。</p>
<p><b>分級</b>　完售 ≥95%、暢銷 80–95%、一般 50–80%、偏慢 30–50%、滯銷 &lt;30%。
配色為藍↔紅發散色階、灰色為中點，已通過色盲分離度驗證；
每個色塊都同時標示文字，顏色不單獨承載意義。</p>
<p><b>重跑</b>　<code>python -m chainway.cli inventory</code>
可加 <code>--series bear,denim</code> 只出特定系列，<code>--thumb 360</code> 放大縮圖。</p>
</footer>
</div>"""
