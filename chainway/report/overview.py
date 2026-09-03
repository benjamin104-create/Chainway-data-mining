"""報表總覽：一頁看完系統現在有什麼、資料多新、卡在哪。

## 為什麼需要這一頁

報表散在 `outputs\\inventory\\`、`outputs\\locate\\`、`outputs\\eval\\`、
`outputs\\color\\`、`outputs\\影像比對稽核\\`…… 五六個資料夾裡。使用者
已經抱怨過一次「怎麼越變越多」，那次是一鍵檔，這次是同一個問題升到報表層。

一頁入口能解決三件事，缺一件這頁就不值得做：

**找得到。** 每一份報表配一句「這份在回答什麼問題」，不是檔名而已。
檔名只告訴人它叫什麼，不告訴人什麼時候該打開它。

**知道多新。** 一份三週前的報表擺在剛跑完的旁邊，長得一模一樣。
所以每一份都標產生時間，超過門檻就標「可能過期」。這比連結本身重要 ——
拿舊數字開會比沒有數字更糟。

**知道卡在哪。** 這套系統有幾件事只有人能做（匯出 ERP、填櫃點清單、
把表單發給專櫃）。那些事不做，後面全部停住，但停住的時候畫面上什麼
都不會說。所以待辦清單直接放在最上面，而且是**從實際檔案狀態算出來的**，
不是我寫死的一張紙 —— 寫死的清單會過期，算出來的不會。

## 不做網頁伺服器

原本專案有一個 FastAPI 後台。但這套的使用者自己說過「我也許不會是
經常性操作者」，而伺服器要 pip install、要開起來、要記網址、關掉就沒了。
一個雙擊就開的 HTML 檔對這個情境好得多，代價是沒有互動 ——
而總覽頁本來就不需要互動。
"""
from __future__ import annotations

import datetime as dt
import html
from pathlib import Path
from typing import Any

# 報表登錄簿。這張表本身就是「這套系統有哪些東西」的地圖 ——
# 新增報表卻忘了登錄，它就不會出現在總覽頁上，等於沒做。
#
# 欄位：(相對 outputs 的樣式, 標題, 這份在回答什麼, 選單項, 幾天算過期)
REPORTS: list[tuple[str, str, str, str, int]] = [
    ("inventory/*進銷存清單*.html", "進銷存清單",
     "熊／牛仔／格紋各系列現在還剩多少、哪些完銷。含大張縮圖。", "1", 14),
    ("商品規劃展開圖.html", "商品規劃展開圖",
     "各品類各季該開幾款 —— 用過去五年那一格真的賣掉多少來回答。", "5", 90),
    ("reports/*.html", "季別診斷報告",
     "每一季的完銷率、袖長對照、上架期重疊、銷冠。", "6", 30),
    ("locate/定位覆核.html", "設計重點定位　覆核",
     "★ 要看：框有沒有畫對。每一款的設計重點落在衣服哪一段，"
     "藍框是偵測到的重點，灰框是衣服範圍。", "1", 30),
    ("eval/圖片分類覆核.html", "圖片分類　覆核",
     "★ 要看：分類有沒有分對。指示書抽出來的圖被判成打樣照片／布樣／"
     "圖稿／章戳，每一類抽幾張排在一起。", "1", 30),
    ("專櫃回填表單_*.html", "專櫃回填表單",
     "發給專櫃用手機填的一頁式表單。填完匯出 CSV 回收。", "2", 21),
    ("專櫃判斷校準/*.csv", "專櫃判斷校準",
     "專櫃當時說的，後來對了嗎。答對率與把握程度的校準分數。", "3", 30),
    ("影像比對稽核/*.csv", "影像比對稽核",
     "為什麼有些款找不到系統圖 —— 分成五類，每類給實例。", "4", 30),
    ("color/*.csv", "色號盤點",
     "色號寫在哪裡（檔名／指示書／ERP），以及量到的顏色對不對得上。", "1", 60),
    ("motif/*.csv", "熊／格紋拆解",
     "圖案的位置、比例、形式與售罄率的關係（附信賴區間）。", "-", 60),
]


# 一組最多列幾個檔。各季的專櫃表單會累積成幾十份，全列會把頁面淹掉；
# 而進銷存那四個系列檔是同時產生的，四份都要看得到。
MAX_FILES = 6


def e(s: Any) -> str:
    return html.escape(str(s))


def _age_days(p: Path) -> float:
    try:
        return (dt.datetime.now()
                - dt.datetime.fromtimestamp(p.stat().st_mtime)).total_seconds() / 86400
    except OSError:
        return 1e9


def _human_size(n: int) -> str:
    for unit, div in (("MB", 1 << 20), ("KB", 1 << 10)):
        if n >= div:
            return f"{n / div:.1f} {unit}"
    return f"{n} B"


def collect(outputs: Path) -> list[dict[str, Any]]:
    """掃出每一類報表最新的那一份。

    同一類可能有很多檔，而且**那些檔一樣重要** —— 進銷存清單分成熊／牛仔／
    經典格紋線／格紋元素四份，只連其中一份等於藏起另外三份。所以整組都列出來，
    最新的那一份放前面。真的很多（各季的專櫃表單）才截斷。
    """
    rows = []
    for pattern, title, why, menu, stale in REPORTS:
        found = sorted(outputs.glob(pattern), key=lambda p: -p.stat().st_mtime
                       if p.exists() else 0)
        found = [p for p in found if p.is_file()]
        if not found:
            rows.append({"標題": title, "說明": why, "選單": menu,
                         "有檔案": False, "過期天數": stale})
            continue
        newest = found[0]
        age = _age_days(newest)
        rows.append({
            "標題": title, "說明": why, "選單": menu, "有檔案": True,
            "檔案": found[:MAX_FILES],
            "大小": _human_size(sum(f.stat().st_size for f in found)),
            "天數": age, "過期": age > stale, "過期天數": stale,
            "截斷": max(0, len(found) - MAX_FILES),
        })
    return rows


def todos(cfg) -> list[dict[str, str]]:
    """待辦清單。從實際檔案狀態算出來，不是寫死的一張紙。

    寫死的清單會過期 —— 事情做完了它還在那裡，看久了就沒有人相信它。
    """
    import pandas as pd
    import yaml

    out: list[dict[str, str]] = []

    def add(what: str, why: str, how: str) -> None:
        out.append({"要做的事": what, "不做會怎樣": why, "怎麼做": how})

    # 櫃點清單
    try:
        tags = yaml.safe_load(Path("config/feedback_tags.yaml").read_text(encoding="utf-8"))
        if not (tags.get("stores") or []):
            add("把櫃點清單填進 config/feedback_tags.yaml 的 stores",
                "專櫃表單的「哪一櫃」是空白的自由填寫欄。"
                "同一個櫃會被寫成三種寫法，之後「哪一櫃看得比較準」永遠算不出來。",
                "用記事本打開那個檔，在 stores: 底下一行一個櫃名。")
    except Exception:
        pass

    # 專櫃回饋回收
    try:
        fb = cfg.path("feedback") / "sales_feedback.csv"
        n = 0
        if fb.exists():
            df = pd.read_csv(fb, dtype=str, keep_default_na=False)
            real = df[~df["sku"].astype(str).str.startswith(("CW", "SKU", ""))]
            n = len(real)
        if n == 0:
            add("把專櫃表單發出去，回收至少一輪",
                "校準模組已經寫好也測過，但沒有回收就永遠是空的。"
                "這是整套裡唯一沒辦法用程式加速的一環。",
                "選單 2 產生表單 → LINE 發給專櫃 → 回收 CSV "
                "貼進 data/feedback/sales_feedback.csv → 選單 3。")
    except Exception:
        pass

    # 色號驗證需要 ERP 匯出
    try:
        cal = cfg.path("outputs") / "color" / "色卡校正.csv"
        if not cal.exists():
            add("從 ERP 匯出一份含「貨品編號 + 顏色」的報表",
                "色號驗證整條卡住。程式已經確認色號不在檔名裡 —— "
                "3,536 個檔名 100% 只到款、不含配色 —— 而是在 ERP 的顏色/尺寸欄。",
                "貨品追蹤簡表匯出成 xlsx，欄位名稱不用整理，程式會自己找。")
    except Exception:
        pass

    # 覆核表沒看過（用「有沒有比報表更新的註記檔」判斷太脆弱，
    # 所以只在報表存在時提醒，並說明為什麼一定要看）
    sheet = cfg.path("outputs") / "eval" / "圖片分類覆核.html"
    if sheet.exists():
        add("打開「圖片分類覆核」，確認布樣那一區沒有整件衣服的照片",
            "上一次分類錯掉，整個以圖搜貨號的評測建立在錯的標籤上，"
            "量到 Top-1 1.29%，而那量的是測試集壞掉。分類是所有影像分析的地基。",
            "在下面的清單裡點「圖片分類　覆核」。看幾眼就好。")
    return out


def build(cfg, *, master_rows: int | None = None,
          base: Path | None = None) -> str:
    """`base` 是總覽檔自己會被放在哪 —— 連結要相對於它算。

    用絕對路徑寫 href（C:/Users/...）在瀏覽器裡點不開，要 file:/// 前綴，
    而那個前綴又跟著磁碟機代號跑。相對路徑沒有這些問題，
    整個 outputs 資料夾複製到別台電腦也還是通的。
    """
    outputs = cfg.path("outputs")
    base = Path(base) if base else outputs
    rows = collect(outputs)
    todo = todos(cfg)

    master = cfg.path("processed") / "master.parquet"
    if master.exists():
        m_age = _age_days(master)
        fresh = (f'主表 {master_rows:,} 款' if master_rows
                 else "主表已建立")
        fresh += f"，{m_age:.0f} 天前更新"
        fresh_bad = m_age > 14
    else:
        fresh, fresh_bad = "還沒建立主表 —— 先跑選單 1", True

    todo_html = "".join(
        f'<li><b>{e(t["要做的事"])}</b>'
        f'<span class="why">{e(t["不做會怎樣"])}</span>'
        f'<span class="how">→ {e(t["怎麼做"])}</span></li>' for t in todo)

    cards = []
    for r in rows:
        if not r["有檔案"]:
            cards.append(
                f'<div class="card none"><h3>{e(r["標題"])}</h3>'
                f'<p>{e(r["說明"])}</p>'
                f'<span class="tag">還沒產生　'
                f'{"選單 " + e(r["選單"]) if r["選單"] != "-" else "尚未排程"}</span>'
                f'</div>')
            continue
        age = r["天數"]
        when = ("今天" if age < 1 else f"{age:.0f} 天前")
        warn = ' <b class="stale">可能過期</b>' if r["過期"] else ""
        more = (f'　另有 {r["截斷"]} 份沒列出' if r["截斷"] else "")

        def _href(f: Path) -> str:
            try:
                return f.relative_to(base).as_posix()
            except ValueError:
                return f.as_posix()

        files = r["檔案"]
        head = (f'<h3><a href="{e(_href(files[0]))}">{e(r["標題"])}</a></h3>'
                if len(files) == 1 else f'<h3>{e(r["標題"])}</h3>')
        links = ("" if len(files) == 1 else
                 '<ul class="files">' + "".join(
                     f'<li><a href="{e(_href(f))}">{e(f.name)}</a></li>'
                     for f in files) + '</ul>')
        cards.append(
            f'<div class="card">{head}<p>{e(r["說明"])}</p>{links}'
            f'<span class="tag">{e(when)}更新{warn}　{e(r["大小"])}{e(more)}'
            f'　選單 {e(r["選單"])}</span></div>')

    return f"""<title>報表總覽</title>
<style>
:root{{--paper:#F2EEE6;--panel:#FBF9F4;--ink:#232019;--ink2:#5E574A;--ink3:#8C8474;
 --rule:#DCD4C4;--rule2:#EDE7DA;--wine:#7A2E38;--pos:#1F6F9C}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{
 --paper:#191712;--panel:#221F19;--ink:#F0EBDF;--ink2:#B3AB99;--ink3:#847C6B;
 --rule:#38332A;--rule2:#2B271F;--wine:#C08A93;--pos:#57A0CD}}}}
:root[data-theme="dark"]{{--paper:#191712;--panel:#221F19;--ink:#F0EBDF;
 --ink2:#B3AB99;--ink3:#847C6B;--rule:#38332A;--rule2:#2B271F;
 --wine:#C08A93;--pos:#57A0CD}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--paper);color:var(--ink);font-size:15.5px;line-height:1.7;
 font-family:"Microsoft JhengHei UI","Microsoft JhengHei","PingFang TC",
 "Noto Sans TC",-apple-system,"Segoe UI",sans-serif}}
.page{{max-width:1000px;margin:0 auto;padding:44px 20px 90px}}
h1{{font-size:29px;margin:0 0 6px}}
.dek{{color:var(--ink2);margin:0 0 4px}}
.stamp{{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;
 color:var(--ink3);margin:0 0 32px}}
.stamp b.bad{{color:var(--wine)}}
h2{{font-size:20px;margin:38px 0 10px;padding-top:16px;border-top:1px solid var(--rule)}}
.sub{{font-size:13.5px;color:var(--ink2);margin:0 0 16px;max-width:70ch}}
ol.todo{{list-style:none;counter-reset:t;padding:0;margin:0}}
ol.todo li{{counter-increment:t;position:relative;padding:14px 16px 14px 46px;
 background:var(--panel);border:1px solid var(--rule);border-left:3px solid var(--wine);
 border-radius:0 6px 6px 0;margin-bottom:9px}}
ol.todo li::before{{content:counter(t);position:absolute;left:16px;top:14px;
 font-family:ui-monospace,monospace;font-size:15px;color:var(--wine);font-weight:700}}
ol.todo b{{display:block;font-size:15px;margin-bottom:3px}}
ol.todo .why{{display:block;font-size:13px;color:var(--ink2)}}
ol.todo .how{{display:block;font-size:13px;color:var(--pos);margin-top:5px}}
.grid{{display:grid;gap:11px;grid-template-columns:repeat(auto-fill,minmax(292px,1fr))}}
.card{{background:var(--panel);border:1px solid var(--rule);border-radius:7px;
 padding:14px 16px}}
.card.none{{opacity:.55;border-style:dashed}}
.card h3{{font-size:16px;margin:0 0 5px}}
.card h3 a{{color:var(--pos);text-decoration:none}}
.card h3 a:hover{{text-decoration:underline}}
.card p{{font-size:13px;color:var(--ink2);margin:0 0 9px}}
ul.files{{list-style:none;padding:0;margin:0 0 9px}}
ul.files li{{margin:0 0 2px}}
ul.files a{{color:var(--pos);text-decoration:none;font-size:12.5px;
 font-family:ui-monospace,Menlo,Consolas,monospace}}
ul.files a:hover{{text-decoration:underline}}
.tag{{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;
 color:var(--ink3)}}
.tag b.stale{{color:var(--wine)}}
.note{{border:1px dashed var(--rule);border-radius:6px;padding:14px 18px;
 font-size:13.5px;color:var(--ink2);max-width:76ch;margin:20px 0}}
.note b{{color:var(--ink)}}
</style>
<div class="page">
<h1>報表總覽</h1>
<p class="dek">這套系統現在有什麼、資料多新、卡在哪。</p>
<p class="stamp">{'<b class="bad">' if fresh_bad else ''}{e(fresh)}
{'</b>' if fresh_bad else ''}　　本頁產生於 {dt.datetime.now():%Y-%m-%d %H:%M}</p>

{f'''<h2>先做這幾件事</h2>
<p class="sub">這幾件只有人能做。不做，後面全部停在原地 ——
而停住的時候畫面上什麼都不會說，所以放在最前面。</p>
<ol class="todo">{todo_html}</ol>''' if todo else
 '<h2>沒有卡住的事</h2><p class="sub">需要人做的都做完了。</p>'}

<h2>報表</h2>
<p class="sub">每一份都標了產生時間。<b>拿舊數字開會比沒有數字更糟</b>，
所以超過該份的合理週期就會標「可能過期」。「選單 N」是指
<code>開始.bat</code> 裡的第幾項。</p>
<div class="grid">{"".join(cards)}</div>

<div class="note">
<p><b>虛線框的是還沒產生的。</b>不是壞掉 —— 是那一項還沒跑過，
或它需要的資料還沒進來（例如專櫃校準要先有回收的表單）。</p>
<p><b>這一頁每次跑完都會重新產生。</b>所以它反映的一定是最後一次執行的狀態，
不會是我某次寫死的快照。</p>
</div>
</div>"""
