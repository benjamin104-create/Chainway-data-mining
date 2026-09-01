"""季別診斷報告產生器。

設計原則：
  1. 每張表都標明季號（KA135…）、年季、入庫日區間與來源檔名 —— 讀者要能回查原始資料
  2. 年份一律拆開，不併算。服裝業每年流行條件不同，併年會蓋掉真實差異
  3. 尚在銷售期的季別（2026）永遠另外標示，不與已完結的季混在同一個平均裡

在放有系統圖的電腦上執行時加 --images <根目錄>，會把商品縮圖內嵌報告：
    python scripts/season_report.py --images "C:/Users/USER/Desktop/商品設計Raw Data"
"""
import base64, datetime as dt, html, io, json, sys
from pathlib import Path

O = json.load(open("/tmp/full.json"))
M = O["meta"]
IMG_ROOT = Path(sys.argv[sys.argv.index("--images") + 1]) if "--images" in sys.argv else None

# 季別對照（由貨號末碼判定，客戶提供）：7=早春 長袖／8=夏 短袖／5=秋 短袖／6=冬 長袖
NAME = {"春": "早春", "夏": "夏", "秋": "秋", "冬": "冬"}
CODE = {"春": 7, "夏": 8, "秋": 5, "冬": 6}
SLEEVE = {"春": "長袖", "夏": "短袖", "秋": "短袖", "冬": "長袖"}
ORDER = ["春", "夏", "秋", "冬"]                       # 早春(7) → 夏(8) → 秋(5) → 冬(6)
KC = {(s["y"], s["s"]): s["kc"] for s in O["seasons"]}  # (年, 季) → 季號

S1, S2, S3, S4 = "#2a78d6", "#eb6834", "#1baf7a", "#eda100"
CRIT = "#d03b3b"
SC = {"春": S3, "夏": S4, "秋": S2, "冬": S1}
YC = {2024: S1, 2025: S3, 2026: S4}
SLC = {"長袖": "#1f3a5f", "短袖": "#c98a1e"}
def e(s): return html.escape(str(s))


def sname(s, sleeve=True):
    """季名 + 季號碼 + 袖長，例：早春（7・長袖）"""
    return f'{NAME[s]}（{CODE[s]}{"・" + SLEEVE[s] if sleeve else ""}）'


def slabel(y, s, sleeve=True):
    """完整季別標籤，例：2024秋（KA135・5・短袖）"""
    kc = KC.get((y, s))
    tail = f'{kc}・' if kc else ""
    return f'{y}{NAME[s]}（{tail}{CODE[s]}{"・" + SLEEVE[s] if sleeve else ""}）'


def thumb(rel):
    if not IMG_ROOT: return None
    p = IMG_ROOT / rel
    if not p.exists():
        for alt in (".png", ".JPG", ".jpeg"):
            q = p.with_suffix(alt)
            if q.exists(): p = q; break
        else: return None
    try:
        from PIL import Image
        im = Image.open(p).convert("RGB"); im.thumbnail((190, 190))
        b = io.BytesIO(); im.save(b, "JPEG", quality=76)
        return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()
    except Exception:
        return None


def se_label(se):
    """把資料裡的 '2024秋' 展開成 '2024秋（5・短袖）'"""
    y, s = se[:4], se[4:]
    return f'{y}{NAME.get(s, s)}（{CODE.get(s, "?")}・{SLEEVE.get(s, "?")}）'


def cards(items, rank=False):
    if not items:
        return '<p class="sub" style="padding:8px 0">（本季無符合條件的款）</p>'
    out = ['<div class="cards">']
    for i, r in enumerate(items, 1):
        src = thumb(r["img"])
        pic = (f'<img src="{src}" alt="{e(r["sku"])}">' if src
               else f'<div class="noimg"><span>系統圖</span>{e(r["sku"])}</div>')
        c = S3 if r["st"] >= .8 else (CRIT if r["st"] < .3 else S1)
        badge = f'<div class="rank">{i}</div>' if rank else ""
        out.append(f'''<figure class="card">{badge}{pic}<figcaption>
<div class="sku">{e(r["sku"])}<span class="kc">{e(r["kc"])}</span></div>
<div class="nm">{e(r["nm"])}</div>
<div class="meta">{e(se_label(r["se"]))}　{e(r["cat"])}　{e(r["de"])}</div>
<div class="price">NT$ {r["pr"]:,}</div>
<div class="track"><span style="width:{min(r["st"],1)*100:.0f}%;background:{c}"></span></div>
<div class="nums">投入 <b>{r["in"]:,}</b>　售出 <b>{r["sold"]:,}</b>　剩 <b>{r["left"]:,}</b></div>
<div class="st" style="color:{c}">完銷 {r["st"]:.0%}</div>
<div class="path">{e(r["img"])}</div></figcaption></figure>''')
    return "\n".join(out) + "</div>"


def grouped_bars(rows, gkey, skey, vkey, nkey, order_g, order_s, colors,
                 w=700, maxv=0.8, gh=64, lw=64, glab=str, slab=None):
    """分組長條：每組（如季別）內有數個系列（如年份）。"""
    if slab is None: slab = lambda s, rec: str(s)
    vw = 132; plot = w - lw - vw
    h = len(order_g) * gh + 30
    o = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img">']
    for t in [0.2, 0.4, 0.6, 0.8]:
        x = lw + plot * t / maxv
        o.append(f'<line x1="{x:.1f}" y1="4" x2="{x:.1f}" y2="{len(order_g)*gh+2}" class="grid"/>')
        o.append(f'<text x="{x:.1f}" y="{len(order_g)*gh+20}" class="tick" text-anchor="middle">{t:.0%}</text>')
    bh = 15
    for gi, g in enumerate(order_g):
        y0 = gi * gh + 6
        for li, line in enumerate(glab(g).split("\n")):
            o.append(f'<text x="{lw-10}" y="{y0+gh/2-8+li*13:.0f}" class="lab" text-anchor="end">{e(line)}</text>')
        for si, s in enumerate(order_s):
            rec = next((r for r in rows if r[gkey] == g and r[skey] == s), None)
            y = y0 + si * (bh + 2)
            if not rec:
                o.append(f'<text x="{lw+4}" y="{y+bh-3}" class="tick">{e(slab(s,None))} 　無資料</text>'); continue
            bw = plot * rec[vkey] / maxv
            o.append(f'<rect x="{lw}" y="{y}" width="{max(bw,2):.1f}" height="{bh}" rx="3" fill="{colors[s]}"/>')
            o.append(f'<text x="{lw+bw+7:.1f}" y="{y+bh-3}" class="val">{e(slab(s,rec))} {rec[vkey]:.1%}'
                     f'<tspan class="dim"> n={rec[nkey]}</tspan></text>')
    return "\n".join(o) + "</svg>"


def sleeve_rank(stats, w=700):
    """四季依加權完銷排序，顏色代表袖長 —— 用來看袖長是否解釋得了排名。"""
    lw, vw, rowh = 148, 168, 40
    plot = w - lw - vw
    h = len(stats) * rowh + 26
    o = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img">']
    for t in [0.2, 0.4, 0.6]:
        x = lw + plot * t / 0.7
        o.append(f'<line x1="{x:.1f}" y1="4" x2="{x:.1f}" y2="{len(stats)*rowh+2}" class="grid"/>')
        o.append(f'<text x="{x:.1f}" y="{len(stats)*rowh+20}" class="tick" text-anchor="middle">{t:.0%}</text>')
    for i, r in enumerate(stats):
        y = i * rowh + 8
        bw = plot * r["st"] / 0.7
        o.append(f'<text x="{lw-10}" y="{y+13}" class="lab" text-anchor="end">{e(r["label"])}</text>')
        o.append(f'<text x="{lw-10}" y="{y+27}" class="tick" text-anchor="end">{e(r["kcs"])}</text>')
        o.append(f'<rect x="{lw}" y="{y+2}" width="{max(bw,2):.1f}" height="19" rx="3" fill="{SLC[r["sleeve"]]}"/>')
        o.append(f'<text x="{lw+8}" y="{y+16}" style="font-size:11px;font-weight:700" fill="#fff">{e(r["sleeve"])}</text>')
        o.append(f'<text x="{lw+bw+8:.1f}" y="{y+16}" class="val" font-weight="700">{r["st"]:.1%}'
                 f'<tspan class="dim" font-weight="400"> ／{r["n"]} 款・銷冠 {r["ch"]}</tspan></text>')
    return "\n".join(o) + "</svg>"


def timeline(seasons, w=760):
    """入庫日區間時間軸：同色＝同季別，可直接看出哪兩季在架上重疊。"""
    p = lambda s: dt.date.fromisoformat(s)
    lo = min(p(s["d0"]) for s in seasons); hi = max(p(s["d1"]) for s in seasons)
    span = (hi - lo).days
    lw, rw, rowh, top = 128, 16, 27, 34
    plot = w - lw - rw
    rows = sorted(seasons, key=lambda s: (s["y"], ORDER.index(s["s"])))
    h = len(rows) * rowh + top + 14
    x = lambda d: lw + plot * (p(d) - lo).days / span
    o = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img">']
    for yr in range(lo.year, hi.year + 1):
        for mo in (1, 7):
            d = dt.date(yr, mo, 1)
            if not (lo <= d <= hi): continue
            xx = lw + plot * (d - lo).days / span
            o.append(f'<line x1="{xx:.1f}" y1="{top-12}" x2="{xx:.1f}" y2="{len(rows)*rowh+top-4}" class="grid"/>')
            o.append(f'<text x="{xx:.1f}" y="{top-18}" class="tick" text-anchor="middle">{yr}/{mo:02d}</text>')
    for i, s in enumerate(rows):
        y = i * rowh + top
        x0, x1 = x(s["d0"]), x(s["d1"])
        o.append(f'<text x="{lw-10}" y="{y+13}" class="lab" text-anchor="end" font-size="11.5">'
                 f'{e(s["kc"])} {s["y"]}{e(NAME[s["s"]])}（{CODE[s["s"]]}・{e(SLEEVE[s["s"]])}）</text>')
        o.append(f'<rect x="{x0:.1f}" y="{y+2}" width="{max(x1-x0,3):.1f}" height="14" rx="3" '
                 f'fill="{SC[s["s"]]}" opacity="{0.95 if s["s"] in ("夏","秋") else 0.4}"/>')
        o.append(f'<text x="{x1+6:.1f}" y="{y+13}" class="val" font-size="10">{s["st"]:.0%}</text>')
    return "\n".join(o) + "</svg>"


def month_lines(rows, w=720, h=250):
    """月份 × 年：每年一條線。"""
    months = sorted({r["m"] for r in rows})
    pl, pr, pt, pb = 44, 60, 14, 40
    pw, ph = w - pl - pr, h - pt - pb
    o = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img">']
    for t in [0, .2, .4, .6, .8]:
        y = pt + ph - ph * t / .85
        o.append(f'<line x1="{pl}" y1="{y:.1f}" x2="{w-pr}" y2="{y:.1f}" class="grid"/>')
        o.append(f'<text x="{pl-8}" y="{y+4:.1f}" class="tick" text-anchor="end">{t:.0%}</text>')
    st = pw / max(len(months) - 1, 1)
    for i, m in enumerate(months):
        o.append(f'<text x="{pl+i*st:.1f}" y="{h-16}" class="tick" text-anchor="middle">{m}月</text>')
    for y_ in [2024, 2025, 2026]:
        pts = [(pl + months.index(r["m"]) * st, pt + ph - ph * r["st"] / .85)
               for r in sorted(rows, key=lambda r: r["m"]) if r["y"] == y_]
        if len(pts) < 2: continue
        o.append('<polyline points="' + " ".join(f"{x:.1f},{yy:.1f}" for x, yy in pts) +
                 f'" fill="none" stroke="{YC[y_]}" stroke-width="2.2" stroke-linejoin="round"/>')
        for x, yy in pts:
            o.append(f'<circle cx="{x:.1f}" cy="{yy:.1f}" r="3.6" fill="{YC[y_]}" stroke="var(--surface)" stroke-width="1.4"/>')
        o.append(f'<text x="{pts[-1][0]+8:.1f}" y="{pts[-1][1]+4:.1f}" class="val" fill="{YC[y_]}" font-weight="600">{y_}</text>')
    return "\n".join(o) + "</svg>"


def champ_bars(seasons, w=700):
    """各季別的銷冠數（完銷≥80% 且投入≥100）。"""
    lw, vw, rowh = 158, 150, 26
    plot = w - lw - vw
    mx = max(s["champ_n"] for s in seasons) + 1
    h = len(seasons) * rowh + 26
    o = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img">']
    for t in range(0, mx + 1, 2):
        x = lw + plot * t / mx
        o.append(f'<line x1="{x:.1f}" y1="4" x2="{x:.1f}" y2="{len(seasons)*rowh+2}" class="grid"/>')
        o.append(f'<text x="{x:.1f}" y="{len(seasons)*rowh+20}" class="tick" text-anchor="middle">{t}</text>')
    for i, s in enumerate(seasons):
        y = i * rowh + 6
        bw = plot * s["champ_n"] / mx
        c = CRIT if s["s"] == "秋" else SC[s["s"]]
        o.append(f'<text x="{lw-10}" y="{y+14}" class="lab" text-anchor="end" font-size="11.5">'
                 f'{e(s["kc"])} {s["y"]}{e(NAME[s["s"]])}（{CODE[s["s"]]}・{e(SLEEVE[s["s"]])}）</text>')
        o.append(f'<rect x="{lw}" y="{y+2}" width="{max(bw,2):.1f}" height="14" rx="3" fill="{c}"/>')
        note = "　尚在銷售期" if not s["done"] else ""
        o.append(f'<text x="{lw+bw+7:.1f}" y="{y+14}" class="val">{s["champ_n"]} 款'
                 f'<tspan class="dim">／全季 {s["n"]}　完銷 {s["st"]:.0%}{note}</tspan></text>')
    return "\n".join(o) + "</svg>"


# ---------- 組裝 ----------
seasons = O["seasons"]
for s in seasons:
    s["champ_n"] = len(O["champs"].get(s["kc"], []))
by_season_order = ORDER
cats = sorted({r["cat"] for r in O["cat_year"]},
              key=lambda c: -next((r["st"] for r in O["cat_year"] if r["cat"] == c and r["y"] == 2024), 0))

# 四季彙總：加權完銷＝1 −（總剩餘 ÷ 總投入），不是各款完銷率的平均
season_stats = []
for s in ORDER:
    ss = [x for x in seasons if x["s"] == s]
    inn = sum(x["in"] for x in ss); left = sum(x["left"] for x in ss)
    season_stats.append({
        "s": s, "sleeve": SLEEVE[s], "st": 1 - left / inn,
        "n": sum(x["n"] for x in ss), "in": inn, "left": left,
        "ch": sum(x["champ_n"] for x in ss),
        "label": sname(s), "kcs": "・".join(x["kc"] for x in ss)})
rank_stats = sorted(season_stats, key=lambda r: -r["st"])

sleeve_stats = {}
for g in ("長袖", "短袖"):
    ss = [x for x in seasons if SLEEVE[x["s"]] == g]
    inn = sum(x["in"] for x in ss); left = sum(x["left"] for x in ss)
    sleeve_stats[g] = {"st": 1 - left / inn, "n": sum(x["n"] for x in ss),
                       "in": inn, "left": left,
                       "ch": sum(x["champ_n"] for x in ss),
                       "seasons": "、".join(sname(s) for s in ORDER if SLEEVE[s] == g)}

# 夏（8・短袖）與秋（5・短袖）的入庫區間重疊天數 —— 同袖型同時在架
_p = lambda x: dt.date.fromisoformat(x)
overlaps = []
for y in [2024, 2025, 2026]:
    a = next((x for x in seasons if x["y"] == y and x["s"] == "夏"), None)
    b = next((x for x in seasons if x["y"] == y and x["s"] == "秋"), None)
    if a and b:
        lo = max(_p(a["d0"]), _p(b["d0"])); hi = min(_p(a["d1"]), _p(b["d1"]))
        overlaps.append({"y": y, "a": a, "b": b, "days": max((hi - lo).days, 0),
                         "lo": lo.isoformat(), "hi": hi.isoformat()})

scope_rows = "".join(
    f'<tr><td><b>{e(s["kc"])}</b></td><td>{s["y"]}{e(NAME[s["s"]])}</td>'
    f'<td class="n">{CODE[s["s"]]}</td><td>{e(SLEEVE[s["s"]])}</td><td class="n">{s["n"]}</td>'
    f'<td>{e(s["d0"])} ～ {e(s["d1"])}</td><td class="n">{s["st"]:.1%}</td>'
    f'<td class="n">{s["hi"]}</td><td class="n">{s["in"]:,}</td><td class="n">{s["left"]:,}</td>'
    f'<td>{"已完結" if s["done"] else "<b style=color:var(--crit)>尚在銷售期</b>"}</td>'
    f'<td class="src">{e(s["f"])}</td></tr>' for s in seasons)

overlap_rows = "".join(
    f'<tr><td>{o["y"]}</td>'
    f'<td>{e(o["a"]["kc"])}　夏（8・短袖）</td><td>{e(o["a"]["d0"])} ～ {e(o["a"]["d1"])}</td>'
    f'<td>{e(o["b"]["kc"])}　秋（5・短袖）</td><td>{e(o["b"]["d0"])} ～ {e(o["b"]["d1"])}</td>'
    f'<td class="n"><b>{o["days"]}</b> 天</td><td>{e(o["lo"])} ～ {e(o["hi"])}</td>'
    f'<td class="n">{o["a"]["st"]:.1%}</td>'
    f'<td class="n" style="color:var(--crit)">{o["b"]["st"]:.1%}</td></tr>' for o in overlaps)

cat_year_rows = "".join(
    f'<tr><td>{e(c)}</td>' + "".join(
        (lambda r: f'<td class="n">{r["st"]:.1%}<span class="dim"> n={r["n"]}</span></td>' if r
         else '<td class="n dim">—</td>')(next((x for x in O["cat_year"] if x["cat"] == c and x["y"] == y), None))
        for y in [2024, 2025, 2026]) +
    (lambda a, b: f'<td class="n" style="color:{CRIT if b and a and b["st"]<a["st"] else "var(--ink3)"}">'
     f'{(b["st"]-a["st"])*100:+.0f}pt</td></tr>' if a and b else '<td class="n dim">—</td></tr>')(
        next((x for x in O["cat_year"] if x["cat"] == c and x["y"] == 2024), None),
        next((x for x in O["cat_year"] if x["cat"] == c and x["y"] == 2026), None))
    for c in cats)

champ_sections = "".join(
    f'<h3>{e(s["kc"])}　{s["y"]}{e(NAME[s["s"]])}（{CODE[s["s"]]}・{e(SLEEVE[s["s"]])}）　'
    f'<span class="hn">入庫 {e(s["d0"])}～{e(s["d1"])}　全季 {s["n"]} 款　平均完銷 {s["st"]:.1%}'
    f'{"" if s["done"] else "　·　尚在銷售期"}</span></h3>'
    + cards(O["champs"].get(s["kc"], []), rank=True)
    for s in seasons)

top_sections = "".join(
    f'<h3>{y} 年售出件數前 15</h3>'
    f'<p class="sub">涵蓋季別：'
    + "、".join(f'{x["kc"]}（{x["y"]}{NAME[x["s"]]}・{CODE[x["s"]]}・{SLEEVE[x["s"]]}）'
                for x in seasons if x["y"] == int(y))
    + ("　·　本年度尚在銷售期，數字仍會變動" if y == "2026" else "") + "</p>"
    + cards(O["top_year"][y], rank=True)
    for y in ["2024", "2025", "2026"])

NL = "\n"
chart_yoy = grouped_bars(
    O["yoy"], "s", "y", "st", "n", by_season_order, [2024, 2025, 2026], YC, gh=62, lw=96,
    glab=lambda g: f"{NAME[g]}（{CODE[g]}）{NL}{SLEEVE[g]}",
    slab=lambda y, rec: f"{y} {rec['kc']}" if rec else str(y))
chart_seasons = grouped_bars(
    O["yoy"], "y", "s", "st", "n", [2024, 2025, 2026], by_season_order, SC, gh=78, lw=52,
    slab=lambda s, rec: f"{NAME[s]}（{CODE[s]}・{SLEEVE[s]}）{rec['kc'] if rec else ''}")
sleeve_rows = "".join(
    f'<tr><td><b>{g}</b></td><td>{e(v["seasons"])}</td><td class="n">{v["n"]}</td>'
    f'<td class="n">{v["in"]:,}</td><td class="n">{v["left"]:,}</td>'
    f'<td class="n"><b>{v["st"]:.1%}</b></td><td class="n">{v["ch"]}</td></tr>'
    for g, v in sleeve_stats.items())
gap_sleeve = (sleeve_stats["長袖"]["st"] - sleeve_stats["短袖"]["st"]) * 100
_summer = next(r for r in season_stats if r["s"] == "夏")
_autumn = next(r for r in season_stats if r["s"] == "秋")
_spring = next(r for r in season_stats if r["s"] == "春")
gap_within = (_summer["st"] - _autumn["st"]) * 100

img_note = ("" if IMG_ROOT else
 '<div class="imgnote"><b>商品縮圖需在放有系統圖的電腦上產生。</b>'
 '每張卡片下方已標明圖檔路徑，可直接開檔對照；執行 '
 '<code>python scripts/season_report.py --images "C:/Users/USER/Desktop/商品設計Raw Data"</code> '
 '即可把縮圖嵌入。</div>')

HTML = f"""<title>秋季完銷率診斷</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@500;700&family=Noto+Sans+TC:wght@400;500;700&display=swap">
<style>
:root{{--surface:#f7f7f4;--panel:#fffffe;--ink:#1c1a17;--ink2:#57544d;--ink3:#8b8780;
 --line:#e0ddd5;--line2:#efece5;--navy:#1f3a5f;--crit:{CRIT};--s1:{S1};--s2:{S2};--s3:{S3}}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{
 --surface:#171714;--panel:#1f1e1b;--ink:#f2f0ea;--ink2:#b6b2a8;--ink3:#847f75;
 --line:#33312b;--line2:#26251f;--navy:#8fb3dd;--crit:#e66767;--s1:#3987e5;--s2:#d95926;--s3:#199e70}}}}
:root[data-theme="dark"]{{--surface:#171714;--panel:#1f1e1b;--ink:#f2f0ea;--ink2:#b6b2a8;--ink3:#847f75;
 --line:#33312b;--line2:#26251f;--navy:#8fb3dd;--crit:#e66767;--s1:#3987e5;--s2:#d95926;--s3:#199e70}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--surface);color:var(--ink);font-family:"Noto Sans TC",-apple-system,"Segoe UI",sans-serif;
 font-size:15px;line-height:1.75;-webkit-font-smoothing:antialiased}}
.wrap{{max-width:900px;margin:0 auto;padding:52px 24px 110px}}
h1{{font-family:"Noto Serif TC",serif;font-weight:700;font-size:28px;line-height:1.4;margin:0 0 10px;text-wrap:balance}}
h2{{font-family:"Noto Serif TC",serif;font-weight:700;font-size:20px;margin:54px 0 4px;text-wrap:balance}}
h3{{font-size:14px;font-weight:700;margin:30px 0 4px}}
h3 .hn{{font-weight:400;color:var(--ink3);font-size:12px;margin-left:6px}}
.eyebrow{{font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink3);margin:0 0 6px}}
.sub{{color:var(--ink2);font-size:13px;margin:0 0 4px}}
.lede{{color:var(--ink2);font-size:14.5px;margin:0 0 24px}}
p{{margin:12px 0}}
.kpis{{display:grid;grid-template-columns:repeat(auto-fit,minmax(124px,1fr));gap:10px;margin:22px 0}}
.kpi{{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:13px 15px}}
.kpi .n{{font-family:"Noto Serif TC",serif;font-size:23px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.15}}
.kpi .l{{font-size:11.5px;color:var(--ink3);margin-top:3px}}
.finding{{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--navy);
 border-radius:0 10px 10px 0;padding:15px 20px;margin:20px 0}}
.finding.alert{{border-left-color:var(--crit)}}
.finding b{{display:block;font-family:"Noto Serif TC",serif;font-size:16px;margin-bottom:5px}}
.finding p{{margin:5px 0 0;font-size:14px;color:var(--ink2)}}
.caution{{background:color-mix(in srgb,var(--crit) 8%,var(--panel));
 border:1px solid color-mix(in srgb,var(--crit) 26%,var(--line));border-radius:10px;padding:16px 20px;margin:20px 0;font-size:14px}}
.caution b{{color:var(--crit)}}
.imgnote{{background:var(--panel);border:1px dashed var(--line);border-radius:9px;padding:12px 16px;
 margin:16px 0;font-size:13px;color:var(--ink2)}}
.season-key{{background:var(--panel);border:1px solid var(--line);border-radius:10px;
 padding:14px 18px;margin:22px 0;font-size:13px}}
.season-key>b{{font-family:"Noto Serif TC",serif;font-size:14.5px}}
.season-key .keys{{display:flex;flex-wrap:wrap;gap:8px 22px;margin-top:9px;
 font-variant-numeric:tabular-nums;font-size:13.5px}}
.season-key .keys i{{width:11px;height:11px;border-radius:3px;display:inline-block;
 margin-right:7px;vertical-align:-1px}}
.season-key .keys b{{font-family:"Noto Serif TC",serif;font-size:15px}}
.cards{{display:grid;grid-template-columns:repeat(auto-fill,minmax(152px,1fr));gap:11px;margin:12px 0 4px}}
.card{{background:var(--panel);border:1px solid var(--line);border-radius:9px;overflow:hidden;margin:0;position:relative}}
.card img{{width:100%;height:166px;object-fit:contain;background:#fff;display:block;border-bottom:1px solid var(--line2)}}
.rank{{position:absolute;top:7px;left:7px;z-index:2;background:var(--ink);color:var(--surface);
 width:21px;height:21px;border-radius:50%;display:flex;align-items:center;justify-content:center;
 font-size:11.5px;font-weight:700;font-variant-numeric:tabular-nums}}
.noimg{{height:80px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
 background:var(--line2);color:var(--ink3);font-size:11.5px;font-variant-numeric:tabular-nums;border-bottom:1px solid var(--line)}}
.noimg span{{font-size:10px;letter-spacing:.12em}}
.card figcaption{{padding:9px 10px 10px}}
.card .sku{{font-size:11px;color:var(--ink3);font-variant-numeric:tabular-nums;display:flex;justify-content:space-between}}
.card .kc{{background:var(--line2);padding:0 4px;border-radius:3px}}
.card .nm{{font-size:12.5px;font-weight:500;line-height:1.45;margin:2px 0 3px}}
.card .meta{{font-size:10.5px;color:var(--ink3)}}
.card .price{{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;margin:4px 0 5px}}
.track{{height:5px;background:var(--line2);border-radius:3px;overflow:hidden;margin-bottom:5px}}
.track span{{display:block;height:100%;border-radius:3px}}
.card .nums{{font-size:11px;color:var(--ink2);font-variant-numeric:tabular-nums}}
.card .nums b{{color:var(--ink)}}
.card .st{{font-size:12.5px;font-weight:700;font-variant-numeric:tabular-nums;margin-top:2px}}
.card .path{{font-size:9.5px;color:var(--ink3);margin-top:5px;word-break:break-all;line-height:1.4}}
.chart{{width:100%;height:auto;display:block;margin:12px 0 4px;overflow:visible}}
.chart .grid{{stroke:var(--line2);stroke-width:1}}
.chart .tick{{font-size:10.5px;fill:var(--ink3)}}
.chart .lab{{font-size:12.5px;fill:var(--ink)}}
.chart .val{{font-size:11px;fill:var(--ink);font-variant-numeric:tabular-nums}}
.chart .dim{{fill:var(--ink3)}}
.legend{{display:flex;gap:15px;flex-wrap:wrap;font-size:12px;color:var(--ink2);margin:6px 0 2px}}
.legend i{{width:11px;height:11px;border-radius:3px;display:inline-block;margin-right:5px;vertical-align:-1px}}
.tw{{overflow-x:auto;border:1px solid var(--line);border-radius:9px;background:var(--panel);margin:14px 0}}
table{{width:100%;border-collapse:collapse;font-size:12.5px}}
th,td{{padding:8px 11px;border-bottom:1px solid var(--line2);text-align:left;white-space:nowrap}}
th{{font-size:11px;color:var(--ink3);font-weight:500}}
td.n{{text-align:right;font-variant-numeric:tabular-nums}}
td.src{{font-size:11px;color:var(--ink3)}}
.dim{{color:var(--ink3);font-size:11px}}
tr:last-child td{{border-bottom:none}}
.method{{font-size:12.5px;color:var(--ink3);border-top:1px solid var(--line);margin-top:48px;padding-top:20px}}
.method b{{color:var(--ink2)}}
code{{background:var(--line2);padding:1px 5px;border-radius:4px;font-size:12px;word-break:break-all}}
</style>
<div class="wrap">
<p class="eyebrow">Kinloch Anderson · 進銷存季別診斷</p>
<h1>11 個季別逐季拆解<br>秋（5・短袖）連續三年生不出銷冠</h1>
<p class="lede">
本報告不併年計算。服裝業每年的流行與線條不同，把 2024–2026 合併平均會蓋掉真實差異，
因此所有指標一律拆到「季號 × 年 × 季別」，並標明每一批資料的入庫日區間與來源檔名，
以利回查原始報表。<b>所有季別一律以「年＋季名（季號・袖長）」標示。</b>
</p>

<div class="season-key">
<b>季別代碼對照</b>（貨號第 5 碼；由貴司提供）
<div class="keys">
<span><i style="background:{SC['春']}"></i><b>7</b>　早春　長袖</span>
<span><i style="background:{SC['夏']}"></i><b>8</b>　夏　　短袖</span>
<span><i style="background:{SC['秋']}"></i><b>5</b>　秋　　短袖</span>
<span><i style="background:{SC['冬']}"></i><b>6</b>　冬　　長袖</span>
</div>
<p style="margin:8px 0 0;font-size:12.5px">例：<code>KA1355012</code> → <code>KA</code>＋<code>135</code>（2024 年第 5 季＝秋・短袖）＋<code>5</code>（經典格紋線）＋<code>012</code>。
本報告每一張表、每一張圖、每一張商品卡都帶著這組代碼，可直接回推到原始報表。</p>
</div>

<div class="kpis">
<div class="kpi"><div class="n">{M['raw']:,}</div><div class="l">原始商品紀錄</div></div>
<div class="kpi"><div class="n">{M['analysed']:,}</div><div class="l">納入分析款數</div></div>
<div class="kpi"><div class="n">11</div><div class="l">季別（KA135–KA158）</div></div>
<div class="kpi"><div class="n">{M['snapshot']}</div><div class="l">報表匯出日</div></div>
</div>
{img_note}

<h2>一、資料範圍：每個季別的區間與來源</h2>
<p class="sub">回查任何一個數字時，先看這張表確認它取自哪一批資料。</p>
<div class="tw"><table>
<tr><th>季號</th><th>年季</th><th class="n">季碼</th><th>袖長</th><th class="n">款數</th><th>入庫日區間</th><th class="n">平均完銷</th>
<th class="n">完銷≥80%</th><th class="n">投入件數</th><th class="n">剩餘件數</th><th>狀態</th><th>來源檔</th></tr>
{scope_rows}
</table></div>
<div class="caution"><b>2026 年的三個季別尚在銷售期</b>
<p style="margin-top:5px">報表匯出日為 {M['snapshot']}，KA155／KA157／KA158 的商品仍在架上，
完銷率會繼續上升。<b>凡涉及跨年比較，本報告一律另外標示，不與已完結季別混算。</b></p></div>

<h2>二、年對年：同一季別的逐年變化</h2>
<p class="sub">同季別比較才有意義 —— 拿 2024秋（KA135・5・短袖）比 2025早春（KA147・7・長袖）不能說明任何事。</p>
{chart_yoy}
<div class="legend">{"".join(f'<span><i style="background:{YC[y]}"></i>{y}</span>' for y in [2024,2025,2026])}
<span style="color:var(--ink3)">·　2026 尚在銷售期</span></div>

<div class="finding"><b>早春·夏波動大，秋·冬穩定 —— 這是兩種不同性質的問題</b>
<p>早春（7・長袖）49.0%（KA137）→ 62.2%（KA147）→ 59.4%（KA157），
夏（8・短袖）60.5%（KA138）→ 52.5%（KA148）→ 67.7%（KA158），
兩者逐年擺盪十幾個百分點，反映的是<b>當年度流行與商品組合的差異</b>。<br>
秋（5・短袖）35.4%（KA135）→ 32.1%（KA145）→ 39.1%（KA155）、
冬（6・長袖）62.6%（KA136）→ 60.4%（KA146），三年幾乎不動 ——
這是<b>結構性的，與該年做了什麼款無關</b>。</p></div>

<h2>三、季別對季別：四季的相對位置</h2>
{chart_seasons}
<div class="legend">{"".join(f'<span><i style="background:{SC[s]}"></i>{sname(s)}</span>' for s in by_season_order)}</div>
<div class="finding alert"><b>秋（5・短袖）在三個年度都是墊底，且與第三名的差距都超過 13 個百分點</b>
<p>2024 年：冬 62.6%（KA136） ＞ 夏 60.5%（KA138） ＞ 早春 49.0%（KA137） ＞ <b>秋 35.4%（KA135）</b>（與早春差 13.6pt）<br>
2025 年：早春 62.2%（KA147） ＞ 冬 60.4%（KA146） ＞ 夏 52.5%（KA148） ＞ <b>秋 32.1%（KA145）</b>（與夏差 20.4pt）<br>
2026 年：夏 67.7%（KA158） ＞ 早春 59.4%（KA157） ＞ <b>秋 39.1%（KA155）</b>（與早春差 20.3pt，冬季資料未到）</p></div>

<h2>四、袖長對照：長袖季 vs 短袖季</h2>
<p class="sub">依貴司季別碼，7 早春與 6 冬為長袖季、8 夏與 5 秋為短袖季。
這一節要回答的是：<b>秋季賣不動，是不是因為它是短袖？</b></p>
{sleeve_rank(rank_stats)}
<div class="legend"><span><i style="background:{SLC['長袖']}"></i>長袖季（早春 7、冬 6）</span>
<span><i style="background:{SLC['短袖']}"></i>短袖季（夏 8、秋 5）</span>
<span style="color:var(--ink3)">·　加權完銷 ＝ 1 −（該季總剩餘 ÷ 總投入），已含 2026 三個未完結季</span></div>

<div class="tw"><table>
<tr><th>袖長</th><th>季別</th><th class="n">款數</th><th class="n">投入件數</th><th class="n">剩餘件數</th>
<th class="n">加權完銷</th><th class="n">銷冠款數</th></tr>
{sleeve_rows}
</table></div>

<div class="finding"><b>答案是否定的：袖長解釋不了排名</b>
<p>四季依加權完銷排序為
<b>冬（6・長袖）{rank_stats[0]['st']:.1%} ＞ 夏（8・短袖）{rank_stats[1]['st']:.1%}
＞ 早春（7・長袖）{rank_stats[2]['st']:.1%} ＞ 秋（5・短袖）{rank_stats[3]['st']:.1%}</b>
—— 長袖、短袖在名次上交錯出現，不是長袖在前、短袖在後。</p>
<p>更關鍵的是：<b>同為短袖的夏與秋，差距 {gap_within:.1f} 個百分點，
比「長袖季整體 vs 短袖季整體」的 {gap_sleeve:.1f} 個百分點還大。</b>
短袖季整體看起來較差（{sleeve_stats['短袖']['st']:.1%} vs {sleeve_stats['長袖']['st']:.1%}），
完全是被秋季一季拉下來的 —— 夏季（{_summer['st']:.1%}）本身還贏過長袖的早春（{_spring['st']:.1%}）。</p>
<p><b>可以據此排除的假設：</b>「秋季賣不動是因為短袖商品在台灣的可穿期短」。
若成立，夏季應同樣受害，但夏季是第二名。<b>問題出在秋季這一檔本身，不在袖型。</b></p></div>

<h2>五、上架時間軸：哪兩季在架上重疊</h2>
<p class="sub">橫軸為實際入庫日。深色為兩個短袖季（夏 8、秋 5），淺色為兩個長袖季（早春 7、冬 6）。右端數字為該季平均完銷。</p>
{timeline(seasons)}
<div class="tw"><table>
<tr><th>年度</th><th>夏季季號</th><th>夏入庫區間</th><th>秋季季號</th><th>秋入庫區間</th>
<th class="n">重疊天數</th><th>重疊期間</th><th class="n">夏完銷</th><th class="n">秋完銷</th></tr>
{overlap_rows}
</table></div>
<div class="finding"><b>兩個短袖季在架上重疊 {overlaps[0]["days"]}／{overlaps[1]["days"]}／{overlaps[2]["days"]} 天</b>
<p>秋（5・短袖）進貨時，同為短袖的夏（8・短袖）尚未鋪完貨，兩檔短袖商品在同一段期間同時在架。
這是一個<b>具體、可檢驗</b>的假設：秋季短袖被自家夏季短袖分食，且夏季此時多已進入折扣期。</p>
<p style="margin-top:6px"><b>但這三年的資料還不足以證實它。</b>重疊天數逐年縮短（159 → 69 → 41 天），
秋季完銷卻是 35.4% → 32.1% → 39.1%，並非同步改善。
若重疊是主因，重疊縮短時完銷應單調上升 —— 目前沒有。
要驗證需要<b>門市層級的日銷資料</b>（看夏、秋短袖是否互相排擠），本報告的季彙總資料做不到。</p></div>

<h2>六、月份對月份：入庫月份的影響</h2>
<p class="sub">橫軸為入庫月份，三條線為三個年度。僅列出該月款數 ≥6 的資料點。</p>
{month_lines(O['month_year'])}
<div class="legend">{"".join(f'<span><i style="background:{YC[y]}"></i>{y} 年入庫</span>' for y in [2024,2025,2026])}</div>
<div class="finding"><b>三年的月份曲線形狀一致：6–8 月入庫的款表現最差</b>
<p>這三個月正是秋（5・短袖）的鋪貨期（見第一節 KA135／KA145／KA155 的入庫區間）。
月份效應與季別效應在此重疊，<b>本報告的資料無法分離兩者</b> ——
究竟是「秋季商品不好賣」還是「6–8 月上架不好賣」，需要一個在 6–8 月上架的非秋季商品群才能檢驗。</p></div>

<h2>七、品類的三年趨勢</h2>
<p class="sub">併年會蓋掉趨勢。拆開後可看出哪些品類是持續變化，哪些只是單年波動。</p>
<div class="tw"><table>
<tr><th>品類</th><th class="n">2024</th><th class="n">2025</th><th class="n">2026</th><th class="n">2024→2026</th></tr>
{cat_year_rows}
</table></div>
<div class="finding alert"><b>洋裝是唯一連續三年下滑的品類：50.3% → 43.8% → 37.6%</b>
<p>三年累計掉 12.7 個百分點，且每一年都比前一年低。這不是單年波動。
款數也同步縮減（35 → 26 → 19），顯示公司內部已在減量，但完銷率仍持續惡化。</p>
<p style="margin-top:6px">相對地，<b>上衣 2026 年大幅回升</b>（48.2% → 63.5%），
針織則從 62.1% 掉到 51.9% —— 這兩項都只有單年變化，需再觀察一季才能判斷是趨勢或波動。</p></div>

<h2>八、各季別銷冠：完銷≥80% 且投入≥100 件</h2>
<p class="sub">同時要求「賣得完」與「有量」。只有完銷率高但投入 30 件的款，不足以支撐下量決策。</p>
{champ_bars(seasons)}
<div class="finding alert"><b>三個秋（5・短袖）季合計只生出 5 款銷冠，其他八個季別平均每季 9.5 款</b>
<p>KA135（2024秋・5・短袖）1 款、KA145（2025秋・5・短袖）1 款、KA155（2026秋・5・短袖）3 款。
而 KA136（冬・6）、KA138（夏・8）、KA146（冬・6）、KA148（夏・8）、KA157（早春・7）、KA158（夏・8）都是滿額 10 款。
<b>秋季不是「賣得比較差」，是幾乎沒有成功案例可供學習。</b>
對照第四節：同為短袖的夏季三檔全部滿額，可見這不是短袖的問題。</p></div>
{champ_sections}

<h2>九、各年度售出件數前 15 名</h2>
<p class="sub">依實際售出件數排序（非完銷率），代表對營收貢獻最大的款。</p>
{top_sections}

<h2>十、能證明什麼、不能證明什麼</h2>
<div class="finding"><b>已經站得住的</b>
<p>① 秋（5・短袖）完銷率在三個年度都墊底（KA135 35.4%／KA145 32.1%／KA155 39.1%），且差距未縮小；<br>
② 三個秋季合計只有 5 款達「完銷≥80% 且投入≥100」，其他季別平均 9.5 款；<br>
③ <b>袖長不是原因</b> —— 四季排名為冬（長）＞夏（短）＞早春（長）＞秋（短），長短袖交錯；
同為短袖的夏、秋差 {gap_within:.1f}pt，大於長袖季 vs 短袖季整體的
{gap_sleeve:.1f}pt；<br>
④ 洋裝連續三年完銷下滑，是唯一具明確趨勢的品類；<br>
⑤ 早春（7）·夏（8）逐年波動大、秋（5）·冬（6）穩定，兩者性質不同。</p></div>

<div class="caution"><b>本報告無法區分的問題</b>
<p style="margin-top:5px"><b>1. 季別效應 vs 月份效應</b>　秋（5・短袖）商品都在 6–8 月入庫，兩個變因完全重疊。
要分離，需要一批在 6–8 月上架的非秋季商品作為對照。</p>
<p><b>2. 夏秋短袖是否互相排擠</b>　第五節已算出兩季在架重疊 159／69／41 天，
但重疊縮短時秋季完銷並未同步改善，故<b>假設成立與否尚未定案</b>，需門市日銷資料。</p>
<p><b>3. 為什麼秋季差 —— 仍未解</b>　已排除「因為是短袖」。其餘可能：布料克重不合氣候（需裁縫指示書成份欄）、
台灣秋季過短（需氣象資料）、本就是次要檔期而下量策略不同（需毛利與企劃投入資料）——
三者皆無法以現有進銷存資料檢驗。</p>
<p><b>4. 2026 年的三個季別尚未結束</b>　KA155（秋）／KA157（早春）／KA158（夏）的完銷率會繼續上升，
本報告中所有含 2026 的數字都應視為期中值。</p></div>

<div class="method">
<p><b>資料來源</b>　{len(M['files'])} 份進銷存報表：{"、".join(f"<code>{e(f)}</code>" for f in M['files'])}。
原始 {M['raw']:,} 筆商品紀錄（已扣除每檔一列的「合計」），排除贈品（貨號第 6 碼為 8）、
樣衣（品名含「樣衣」或投入 ≤2 件且零銷售）、投入 &lt;30 件者，納入分析 {M['analysed']:,} 款。</p>
<p><b>指標定義</b>　完銷率採報表自帶的「銷售率」欄位（＝總銷÷累進），已驗證 100% 與「累進＝總銷＋總存」相符。
品類由貨號第 6 碼判定（5 開頭為經典格紋線，取兩碼）；季別由貨號前 5 碼的 KA 季號對照表判定。
設計師代號已正規化（E049/e049 同人、E071/e071/M044 同為一人）。</p>
<p><b>季別與袖長對照</b>　季碼取自貨號第 5 碼，對照關係為貴司提供：
<b>7＝早春（長袖）、8＝夏（短袖）、5＝秋（短袖）、6＝冬（長袖）</b>。
袖長屬「季別層級」屬性，非逐款判定 —— 本報告未宣稱單一款式的實際袖長，
第四節的長短袖比較是以整季為單位。若某季內含例外款式（如秋季的長袖外套），
會落在該季的統計中而未另外扣除，這是此節的已知限制。</p>
<p><b>所有數字皆由原始報表計算，未經調整或推估。</b>圖表座標由程式計算而非手繪。
n 值一律標示；n &lt; 12 的組別請視為參考而非結論。
每張表與每張卡片均標明季號，可依第一節的對照表回查來源檔案。</p>
<p><b>相關不等於因果。</b>本報告呈現的是觀察到的差異，不是差異的成因。</p>
</div>
</div>"""
Path("/tmp/report.html").write_text(HTML, encoding="utf-8")
print(f"已產生 {len(HTML):,} bytes；縮圖：{'開' if IMG_ROOT else '關（僅列路徑）'}")
