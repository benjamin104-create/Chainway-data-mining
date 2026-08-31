"""季別診斷報告 v2 —— 每個論點都掛實際款號、定價、進銷存與圖檔路徑。

在你的電腦上執行時加 --images <系統圖根目錄>，會把縮圖直接嵌進報告；
沒有影像時仍會列出檔案路徑，設計主管可以自行開檔對照。
"""
import base64, html, io, json, sys
from pathlib import Path

D = json.load(open("/tmp/rd.json")); E = json.load(open("/tmp/ev.json"))
M = D["meta"]
IMG_ROOT = None
if "--images" in sys.argv:
    IMG_ROOT = Path(sys.argv[sys.argv.index("--images") + 1])

S1, S2, S3, S4 = "#2a78d6", "#eb6834", "#1baf7a", "#eda100"
CRIT = "#d03b3b"
SC = {"春": S3, "夏": S4, "秋": S2, "冬": S1}
def esc(s): return html.escape(str(s))


def thumb(rel):
    """有影像就內嵌縮圖，沒有就回傳 None。"""
    if not IMG_ROOT:
        return None
    p = IMG_ROOT / rel
    if not p.exists():
        for alt in (".png", ".JPG", ".jpeg"):
            q = p.with_suffix(alt)
            if q.exists(): p = q; break
        else:
            return None
    try:
        from PIL import Image
        im = Image.open(p).convert("RGB"); im.thumbnail((190, 190))
        b = io.BytesIO(); im.save(b, "JPEG", quality=76)
        return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()
    except Exception:
        return None


def cards(items, tone="ok"):
    """佐證卡：貨號、品名、定價、進銷存長條、圖檔路徑。"""
    out = [f'<div class="cards">']
    for r in items:
        src = thumb(r["img"])
        pic = (f'<img src="{src}" alt="{esc(r["sku"])}">' if src
               else f'<div class="noimg"><span>系統圖</span>{esc(r["sku"])}</div>')
        pct = min(r["st"], 1.0)
        bar_c = S3 if r["st"] >= .8 else (CRIT if r["st"] < .3 else S1)
        out.append(f'''<figure class="card {tone}">
{pic}
<figcaption>
<div class="sku">{esc(r["sku"])}</div>
<div class="nm">{esc(r["nm"])}</div>
<div class="meta">{esc(r["se"])}　{esc(r["de"])}</div>
<div class="price">NT$ {r["pr"]:,}</div>
<div class="track"><span style="width:{pct*100:.0f}%;background:{bar_c}"></span></div>
<div class="nums">投入 <b>{r["in"]:,}</b>　售出 <b>{r["sold"]:,}</b>　剩 <b>{r["left"]:,}</b></div>
<div class="st" style="color:{bar_c}">完銷 {r["st"]:.0%}</div>
<div class="path">{esc(r["img"])}</div>
</figcaption></figure>''')
    out.append("</div>")
    return "\n".join(out)


def pair_chart(pairs, w=700):
    """同設計師×同品類的秋冬對照。這是控制了兩個變因後的證據。"""
    rowh = 30; lw, vw = 118, 148
    plot = w - lw - vw
    h = len(pairs) * rowh + 34
    o = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img">']
    for t in [0.2, 0.4, 0.6, 0.8]:
        x = lw + plot * t / 0.9
        o.append(f'<line x1="{x:.1f}" y1="4" x2="{x:.1f}" y2="{len(pairs)*rowh+4}" class="grid"/>')
        o.append(f'<text x="{x:.1f}" y="{len(pairs)*rowh+22}" class="tick" text-anchor="middle">{t:.0%}</text>')
    for i, p in enumerate(pairs):
        y = i * rowh + 6
        xa, xw = lw + plot * p["au"] / 0.9, lw + plot * p["wt"] / 0.9
        o.append(f'<text x="{lw-10}" y="{y+16}" class="lab" text-anchor="end">{esc(p["de"])}·{esc(p["cat"])}</text>')
        o.append(f'<line x1="{min(xa,xw):.1f}" y1="{y+11}" x2="{max(xa,xw):.1f}" y2="{y+11}" stroke="var(--line)" stroke-width="2"/>')
        o.append(f'<circle cx="{xw:.1f}" cy="{y+11}" r="5" fill="{S1}"/>')
        o.append(f'<circle cx="{xa:.1f}" cy="{y+11}" r="5" fill="{S2}"/>')
        g = p["gap"] * 100
        col = CRIT if g >= 20 else "var(--ink3)"
        o.append(f'<text x="{lw+plot+10}" y="{y+15}" class="val">冬{p["wt"]:.0%} 秋{p["au"]:.0%} '
                 f'<tspan fill="{col}" font-weight="600">{-g:+.0f}pt</tspan>'
                 f'<tspan class="dim"> n={p["wt_n"]}/{p["au_n"]}</tspan></text>')
    o.append("</svg>")
    return "\n".join(o)


def hbar(rows, key, lk, fmt, w=680, rowh=32, maxv=None, color=None):
    maxv = maxv or max(r[key] for r in rows) * 1.15
    lw, vw = 96, 116; plot = w - lw - vw
    h = len(rows) * rowh + 26
    o = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img">']
    for t in [0.2, 0.4, 0.6, 0.8]:
        if t > maxv: continue
        x = lw + plot * t / maxv
        o.append(f'<line x1="{x:.1f}" y1="6" x2="{x:.1f}" y2="{len(rows)*rowh+4}" class="grid"/>')
        o.append(f'<text x="{x:.1f}" y="{len(rows)*rowh+20}" class="tick" text-anchor="middle">{t:.0%}</text>')
    for i, r in enumerate(rows):
        y = i * rowh + 8
        bw = plot * r[key] / maxv
        c = color(r) if callable(color) else (color or S1)
        o.append(f'<text x="{lw-10}" y="{y+15}" class="lab" text-anchor="end">{esc(r[lk])}</text>')
        o.append(f'<rect x="{lw}" y="{y+2}" width="{max(bw,2):.1f}" height="17" rx="4" fill="{c}"/>')
        o.append(f'<text x="{lw+bw+8:.1f}" y="{y+16}" class="val">{fmt(r)}</text>')
    o.append("</svg>")
    return "\n".join(o)


def timeline(tl, w=740, h=232):
    months = sorted({r["ym"] for r in tl}); idx = {m: i for i, m in enumerate(months)}
    ser = {s: [0]*len(months) for s in ["春","夏","秋","冬"]}
    for r in tl:
        if r["季"] in ser: ser[r["季"]][idx[r["ym"]]] = r["n"]
    mx = max(max(v) for v in ser.values())*1.12
    pl,pr,pt,pb = 40,12,14,42; pw,ph = w-pl-pr, h-pt-pb
    o=[f'<svg viewBox="0 0 {w} {h}" class="chart" role="img">']
    for t in range(0,int(mx)+1,40):
        y=pt+ph-ph*t/mx
        o.append(f'<line x1="{pl}" y1="{y:.1f}" x2="{w-pr}" y2="{y:.1f}" class="grid"/>')
        o.append(f'<text x="{pl-8}" y="{y+4:.1f}" class="tick" text-anchor="end">{t}</text>')
    st=pw/max(len(months)-1,1)
    for i,m in enumerate(months):
        if m.endswith(("-01","-07")):
            o.append(f'<text x="{pl+i*st:.1f}" y="{h-22}" class="tick" text-anchor="middle">{m[2:]}</text>')
    for s in ["春","夏","秋","冬"]:
        o.append('<polyline points="'+" ".join(f"{pl+i*st:.1f},{pt+ph-ph*v/mx:.1f}" for i,v in enumerate(ser[s]))+
                 f'" fill="none" stroke="{SC[s]}" stroke-width="2" stroke-linejoin="round"/>')
        pk=max(range(len(months)),key=lambda i:ser[s][i])
        px,py=pl+pk*st, pt+ph-ph*ser[s][pk]/mx
        o.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="4.5" fill="{SC[s]}" stroke="var(--surface)" stroke-width="2"/>')
        o.append(f'<text x="{px:.1f}" y="{py-10:.1f}" class="val" text-anchor="middle" fill="{SC[s]}">{s}</text>')
    o.append("</svg>")
    return "\n".join(o)


def month_lines(w=680,h=222):
    au,wt=D["month_秋"],D["month_冬"]; months=list(range(3,12))
    pl,pr,pt,pb=44,92,12,38; pw,ph=w-pl-pr,h-pt-pb
    o=[f'<svg viewBox="0 0 {w} {h}" class="chart" role="img">']
    for t in [0,0.2,0.4,0.6,0.8]:
        y=pt+ph-ph*t/0.8
        o.append(f'<line x1="{pl}" y1="{y:.1f}" x2="{w-pr}" y2="{y:.1f}" class="grid"/>')
        o.append(f'<text x="{pl-8}" y="{y+4:.1f}" class="tick" text-anchor="end">{t:.0%}</text>')
    st=pw/(len(months)-1)
    for i,m in enumerate(months):
        o.append(f'<text x="{pl+i*st:.1f}" y="{h-16}" class="tick" text-anchor="middle">{m}月</text>')
    for data,col,nm in [(wt,S1,"冬季"),(au,S2,"秋季")]:
        pts=[(pl+months.index(r["月"])*st, pt+ph-ph*r["完銷"]/0.8) for r in data if r["月"] in months]
        o.append('<polyline points="'+" ".join(f"{x:.1f},{y:.1f}" for x,y in pts)+
                 f'" fill="none" stroke="{col}" stroke-width="2.5" stroke-linejoin="round"/>')
        for x,y in pts:
            o.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="{col}" stroke="var(--surface)" stroke-width="1.5"/>')
        o.append(f'<text x="{pts[-1][0]+10:.1f}" y="{pts[-1][1]+4:.1f}" class="val" fill="{col}" font-weight="600">{nm}</text>')
    return "\n".join(o)+"</svg>"


cat=D["cat"]; sd={r["季"]:r for r in D["season_done"]}
lo_a, lo_w = E["load_秋"], E["load_冬"]

cat_bars = hbar(cat,"完銷","品類",
  lambda r:f'{r["完銷"]:.1%} <tspan class="dim">n={r["n"]}　中位 {r["中位價"]:,}</tspan>',
  color=lambda r: S3 if r["完銷"]>=.57 else (CRIT if r["完銷"]<.47 else S1))
season_bars = hbar([sd[s] for s in ["冬","夏","春","秋"]],"完銷","季",
  lambda r:f'{r["完銷"]:.1%} <tspan class="dim">n={r["n"]}　完銷≥80% 佔 {r["hi"]:.0%}</tspan>',
  color=lambda r: CRIT if r["季"]=="秋" else S1, w=700)
yr=[]
for s in ["冬","夏","春","秋"]:
    for y in [2024,2025,2026]:
        rec=next((r for r in D["season_year"] if r["季"]==s and r["年"]==y),None)
        if rec: yr.append({"lab":f"{y} {s}","完銷":rec["完銷"],"n":rec["n"],"季":s})
year_bars = hbar(yr,"完銷","lab",lambda r:f'{r["完銷"]:.1%} <tspan class="dim">n={r["n"]}</tspan>',
  color=lambda r: CRIT if r["季"]=="秋" else SC[r["季"]], w=700, rowh=25)

img_note = ("" if IMG_ROOT else
 '<div class="imgnote">本頁的商品縮圖需要在放有系統圖的電腦上產生。'
 '每張卡片下方已標明圖檔路徑，可直接開檔對照；'
 '在你的電腦執行 <code>python scripts/season_report.py --images "C:/Users/USER/Desktop/商品設計Raw Data"</code> '
 '即可把縮圖嵌進報告。</div>')

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
.wrap{{max-width:880px;margin:0 auto;padding:54px 24px 110px}}
h1{{font-family:"Noto Serif TC",serif;font-weight:700;font-size:29px;line-height:1.4;margin:0 0 10px;text-wrap:balance}}
h2{{font-family:"Noto Serif TC",serif;font-weight:700;font-size:20px;margin:54px 0 4px;text-wrap:balance}}
h3{{font-size:14px;font-weight:700;margin:32px 0 6px;color:var(--ink2)}}
.eyebrow{{font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink3);margin:0 0 6px}}
.sub{{color:var(--ink2);font-size:13.5px;margin:0 0 4px}}
.lede{{color:var(--ink2);font-size:14.5px;margin:0 0 26px}}
p{{margin:12px 0}}
.kpis{{display:grid;grid-template-columns:repeat(auto-fit,minmax(126px,1fr));gap:10px;margin:22px 0}}
.kpi{{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:13px 15px}}
.kpi .n{{font-family:"Noto Serif TC",serif;font-size:24px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.15}}
.kpi .l{{font-size:11.5px;color:var(--ink3);margin-top:3px}}
.finding{{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--navy);
 border-radius:0 10px 10px 0;padding:15px 20px;margin:20px 0}}
.finding.alert{{border-left-color:var(--crit)}}
.finding b{{display:block;font-family:"Noto Serif TC",serif;font-size:16.5px;margin-bottom:5px}}
.finding p{{margin:5px 0 0;font-size:14px;color:var(--ink2)}}
.caution{{background:color-mix(in srgb,var(--crit) 8%,var(--panel));
 border:1px solid color-mix(in srgb,var(--crit) 26%,var(--line));border-radius:10px;padding:17px 20px;margin:22px 0;font-size:14px}}
.caution b{{color:var(--crit)}}
.imgnote{{background:var(--panel);border:1px dashed var(--line);border-radius:9px;padding:13px 17px;
 margin:18px 0;font-size:13px;color:var(--ink2)}}
.cards{{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:12px;margin:16px 0}}
.card{{background:var(--panel);border:1px solid var(--line);border-radius:9px;overflow:hidden;margin:0}}
.card img{{width:100%;height:172px;object-fit:contain;background:#fff;display:block;border-bottom:1px solid var(--line2)}}
.noimg{{height:86px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
 background:var(--line2);color:var(--ink3);font-size:11.5px;font-variant-numeric:tabular-nums;border-bottom:1px solid var(--line)}}
.noimg span{{font-size:10px;letter-spacing:.12em}}
.card figcaption{{padding:10px 11px 11px}}
.card .sku{{font-size:11.5px;color:var(--ink3);font-variant-numeric:tabular-nums}}
.card .nm{{font-size:13px;font-weight:500;line-height:1.45;margin:1px 0 4px}}
.card .meta{{font-size:11px;color:var(--ink3)}}
.card .price{{font-size:13.5px;font-weight:700;font-variant-numeric:tabular-nums;margin:5px 0 6px}}
.track{{height:5px;background:var(--line2);border-radius:3px;overflow:hidden;margin-bottom:6px}}
.track span{{display:block;height:100%;border-radius:3px}}
.card .nums{{font-size:11.5px;color:var(--ink2);font-variant-numeric:tabular-nums}}
.card .nums b{{color:var(--ink)}}
.card .st{{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;margin-top:3px}}
.card .path{{font-size:10px;color:var(--ink3);margin-top:6px;word-break:break-all;line-height:1.4}}
.chart{{width:100%;height:auto;display:block;margin:14px 0 4px;overflow:visible}}
.chart .grid{{stroke:var(--line2);stroke-width:1}}
.chart .tick{{font-size:10.5px;fill:var(--ink3)}}
.chart .lab{{font-size:12.5px;fill:var(--ink)}}
.chart .val{{font-size:11.5px;fill:var(--ink);font-variant-numeric:tabular-nums}}
.chart .dim{{fill:var(--ink3)}}
.legend{{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--ink2);margin:6px 0 2px}}
.legend i{{width:11px;height:11px;border-radius:3px;display:inline-block;margin-right:5px;vertical-align:-1px}}
.tw{{overflow-x:auto;border:1px solid var(--line);border-radius:9px;background:var(--panel);margin:16px 0}}
table{{width:100%;border-collapse:collapse;font-size:13px}}
th,td{{padding:9px 12px;border-bottom:1px solid var(--line2);text-align:left;white-space:nowrap}}
th{{font-size:11.5px;color:var(--ink3);font-weight:500}}
td.n{{text-align:right;font-variant-numeric:tabular-nums}}
tr:last-child td{{border-bottom:none}}
.method{{font-size:12.5px;color:var(--ink3);border-top:1px solid var(--line);margin-top:50px;padding-top:20px}}
.method b{{color:var(--ink2)}}
code{{background:var(--line2);padding:1px 5px;border-radius:4px;font-size:12.5px;word-break:break-all}}
</style>
<div class="wrap">
<p class="eyebrow">Kinloch Anderson · 進銷存診斷</p>
<h1>秋季完銷率只有其他三季的一半<br>而且與品類、設計師、價格帶都無關</h1>
<p class="lede">分析 {M['total_raw']:,} 筆 KA135–KA158 進銷存紀錄（2024春–2026秋，11 個季別，資料截止 {M['snapshot']}）。
每一項結論都附實際款號、定價與進銷存數字；圖檔路徑一併列出，可逐款開檔覆核。</p>

<div class="kpis">
<div class="kpi"><div class="n" style="color:var(--crit)">33.7%</div><div class="l">秋季平均完銷率</div></div>
<div class="kpi"><div class="n">61.6%</div><div class="l">冬季平均完銷率</div></div>
<div class="kpi"><div class="n" style="color:var(--crit)">11,536</div><div class="l">秋季賣不掉的件數</div></div>
<div class="kpi"><div class="n">15/17</div><div class="l">同設計師同品類仍輸給冬季</div></div>
</div>
{img_note}

<h2>一、母體怎麼來的</h2>
<p class="sub">排除規則若有錯，後面每個數字都會偏。</p>
<div class="tw"><table>
<tr><th>步驟</th><th class="n">款數</th><th>理由</th></tr>
<tr><td>原始紀錄</td><td class="n">{M['total_raw']:,}</td><td>11 份報表，已扣除每檔一列的「合計」</td></tr>
<tr><td>－ 贈品（8字頭）</td><td class="n">−{M['excl_gift']}</td><td>電風扇、行李箱、購物袋等，是送的不是賣的</td></tr>
<tr><td>－ 樣衣</td><td class="n">−{M['excl_sample']}</td><td>品名含「樣衣」，或投入 ≤2 件且零銷售</td></tr>
<tr><td>－ 投入 &lt; 30 件</td><td class="n">−{M['excl_small']}</td><td>樣本太小，完銷率的隨機波動大於真實差異</td></tr>
<tr><td><b>納入分析</b></td><td class="n"><b>{M['analysed']:,}</b></td><td>再排除尚在銷售期的 2026 年 → 已完結 {M['done']:,} 款</td></tr>
</table></div>

<h2>二、各品類的完銷表現</h2>
{cat_bars}
<div class="legend"><span><i style="background:var(--s3)"></i>≥57%</span><span><i style="background:var(--s1)"></i>47–57%</span>
<span><i style="background:var(--crit)"></i>&lt;47%</span></div>

<div class="finding"><b>高價位沒有拖累完銷 —— 外套是最好的反證</b>
<p>外套中位價 5,580 元（全品類第一），完銷 58.4%（第二高）。下列五款單價都在 5,000 元以上，全數完銷 100%：</p></div>
{cards(E['外套高'])}

<div class="finding"><b>針織是完銷最高的品類（59.2%），且不靠低價</b>
<p>中位價 3,980 元高於棉T（3,180）與褲（3,680）。完銷≥80% 的比例達 31.7%。</p></div>
{cards(E['針織高'])}

<div class="finding alert"><b>洋裝是唯一「高價又賣不動」的品類</b>
<p>完銷 45.2% 全體最低、完銷不到 30% 的佔 33.8% 全體最高，而中位價 5,230 元排第二。
下列五款投入 40–126 件，全部只賣出個位數：</p></div>
{cards(E['洋裝低'], 'bad')}
<p class="sub">但洋裝不是全軍覆沒 —— 這三款完銷 100%，價格帶反而較低（4,680–4,980）：</p>
{cards(E['洋裝高'])}

<div class="tw"><table>
<tr><th>品類</th><th class="n">款數</th><th class="n">中位價</th><th class="n">價格帶(10–90%)</th>
<th class="n">平均完銷</th><th class="n">完銷≥80%</th><th class="n">完銷&lt;30%</th><th class="n">投入件數</th></tr>
{"".join(f'<tr><td>{esc(r["品類"])}</td><td class="n">{r["n"]}</td><td class="n">{r["中位價"]:,}</td>'
 f'<td class="n">{r["p10"]:,}–{r["p90"]:,}</td><td class="n">{r["完銷"]:.1%}</td><td class="n">{r["hi"]:.1%}</td>'
 f'<td class="n">{r["lo"]:.1%}</td><td class="n">{r["件數"]:,}</td></tr>' for r in cat)}
</table></div>

<h2>三、賣期分佈：四季在時間軸上的重疊</h2>
<p class="sub">依入庫日統計每月上架款數，四條線各為一個季別。</p>
{timeline(D['timeline'])}
<div class="legend"><span><i style="background:var(--s3)"></i>春</span><span><i style="background:{S4}"></i>夏</span>
<span><i style="background:var(--s2)"></i>秋</span><span><i style="background:var(--s1)"></i>冬</span>
<span style="color:var(--ink3)">·　圓點為各季入庫高峰</span></div>
<div class="finding"><b>上架節奏規律，各季高峰相隔約三個月</b>
<p>冬季高峰 9 月、春季 12 月、夏季 3 月、秋季 6 月，相鄰兩季鋪貨期重疊約兩個月，屬正常接檔。
<b>問題不在節奏，在秋季本身。</b></p></div>

<h2>四、秋季：連續三年墊底</h2>
{season_bars}
<p class="sub">上圖為已完結的 2024–2025（{M['done']:,} 款）。下圖分年檢視，確認不是單一年度異常。</p>
{year_bars}

<h3>證據一：七個品類全數低於冬季</h3>
<p class="sub">若只是「秋季剛好排了較差的品類」，應有品類表現正常。實際上沒有。</p>
<div class="tw"><table>
<tr><th>品類</th><th class="n">冬季完銷</th><th class="n">秋季完銷</th><th class="n">差距</th><th class="n">n（冬/秋）</th></tr>
{"".join(f'<tr><td>{esc(c)}</td><td class="n">{w_["完銷"]:.1%}</td><td class="n">{a_["完銷"]:.1%}</td>'
 f'<td class="n" style="color:var(--crit)">−{(w_["完銷"]-a_["完銷"])*100:.0f}pt</td>'
 f'<td class="n">{w_["n"]}/{a_["n"]}</td></tr>'
 for c in sorted({r["品類"] for r in D["cat_season"]},
   key=lambda c:-(next(r["完銷"] for r in D["cat_season"] if r["品類"]==c and r["季"]=="冬")
                 -next(r["完銷"] for r in D["cat_season"] if r["品類"]==c and r["季"]=="秋")))
 for w_ in [next(r for r in D["cat_season"] if r["品類"]==c and r["季"]=="冬")]
 for a_ in [next(r for r in D["cat_season"] if r["品類"]==c and r["季"]=="秋")])}
</table></div>

<h3>證據二：同一位設計師、同一個品類，只換季別</h3>
<p class="sub">下圖同時控制設計師與品類兩個變因。每一列是同一人做同一品類，只差季別。</p>
{pair_chart(E['pairs'])}
<div class="legend"><span><i style="background:var(--s1)"></i>冬季</span><span><i style="background:var(--s2)"></i>秋季</span>
<span style="color:var(--ink3)">·　n 為兩季各自款數</span></div>
<div class="finding alert"><b>17 個組合中 15 個秋季低於冬季，只有 2 個持平</b>
<p>徐嘉欣的洋裝從冬季 71% 掉到秋季 28%（−44pt）、針織 82%→41%（−41pt）。
<b>同一個人、同一個品類、相近的價格帶，只換季別就掉三到四成。</b>
唯二持平的是李幸真的褲（39%/39%）與陳潔如的上衣（50%/52%），兩者 n 都小於 12。</p></div>

<h3>證據三：入庫越晚完銷越低，但只發生在秋季</h3>
{month_lines()}
<div class="legend"><span><i style="background:var(--s1)"></i>冬季（相關 −0.05）</span>
<span><i style="background:var(--s2)"></i>秋季（相關 −0.30）</span></div>
<div class="finding alert"><b>冬季不管幾月入庫都賣得動，秋季不行</b>
<p>冬季 7–11 月入庫的完銷率都在 60–70% 之間幾乎持平；秋季從 4 月的 39.4% 一路掉到 8 月的 7.8%。
<b>問題不是「晚入庫就會差」，而是「秋季的晚入庫會差」。</b></p></div>

<h2>五、這件事值多少錢</h2>
<div class="tw"><table>
<tr><th>投入 ≥100 件的款</th><th class="n">秋季</th><th class="n">冬季</th></tr>
<tr><td>款數</td><td class="n">{lo_a['n']}</td><td class="n">{lo_w['n']}</td></tr>
<tr><td>合計投入件數</td><td class="n">{lo_a['in']:,}</td><td class="n">{lo_w['in']:,}</td></tr>
<tr><td>賣不掉剩餘件數</td><td class="n" style="color:var(--crit)"><b>{lo_a['left']:,}</b></td><td class="n">{lo_w['left']:,}</td></tr>
<tr><td>未售出零售值</td><td class="n">NT$ {lo_a['retail']/1e6:.1f} 百萬</td><td class="n">NT$ {lo_w['retail']/1e6:.1f} 百萬</td></tr>
<tr><td>平均完銷率</td><td class="n" style="color:var(--crit)">{lo_a['st']:.1%}</td><td class="n">{lo_w['st']:.1%}</td></tr>
</table></div>
<div class="finding alert"><b>秋季用了冬季 60% 的投入量，壓出幾乎相同的庫存</b>
<p>秋季 121 款投入 17,424 件、剩 11,536 件；冬季 213 款投入 29,091 件、剩 11,285 件。
<b>兩季剩餘量相當，但秋季只投了六成的量。</b>
未售出零售值為秋季 4,170 萬對冬季 5,430 萬 —— 以投入比例衡量，秋季的庫存效率遠差於冬季。</p>
<p style="margin-top:8px">下列六款是秋季投入 100 件以上、完銷最低的實例，可逐款開檔覆核：</p></div>
{cards(E['秋慘'], 'bad')}
<p class="sub">同期冬季投入 100 件以上、完銷最高的四款作為對照：</p>
{cards(E['冬好'])}

<h2>六、能證明什麼、不能證明什麼</h2>
<div class="finding"><b>已經站得住的</b>
<p>秋季完銷率顯著低於其他三季，且此差異：① 連續三年成立；② 七個品類全數成立；
③ 排除尚在銷售期的 2026 年後仍成立；④ 同一設計師同一品類的對照中 15/17 成立；
⑤ 有冬季作為對照組，排除「入庫晚必然差」的替代解釋。</p></div>

<div class="caution"><b>還不能下的結論 —— 為什麼秋季差</b>
<p style="margin-top:6px">至少四個解釋這份資料無法區分：</p>
<p><b>1. 商品本身</b>　秋季款的布料克重、厚薄是否不合當時氣候？<b>需要裁縫指示書的成份與克重欄位</b>。</p>
<p><b>2. 檔期競爭</b>　秋季鋪貨期（4–8 月）與夏季末出清重疊，是否被自家折扣品瓜分？<b>需要門市日銷資料</b>。</p>
<p><b>3. 氣候</b>　台灣秋季偏短，消費者是否直接從夏裝跳到冬裝？<b>需要氣象資料交叉比對</b>。</p>
<p><b>4. 定價策略</b>　秋季中位價 3,530 元為四季最低，是否本就被視為過渡檔期？<b>需要毛利與成本資料</b>。</p>
</div>

<div class="caution"><b>本次無法進行的分析：分長短袖</b>
<p style="margin-top:6px">上衣類 {D['sleeve']['上衣類總數']} 款中，品名明確標示袖長者僅 {D['sleeve']['有標示']} 款
（{D['sleeve']['有標示']/D['sleeve']['上衣類總數']:.1%}）。用其餘詞彙推測不可靠；
且會寫袖長的款本身有偏誤 —— 設計師認為袖型是賣點時才寫進品名。</p>
<p><b>正確來源是裁縫指示書</b>：每份都有袖長、袖口、肩寬、衣長、胸圍（單位英吋，寫成 <code>13 3/4</code> 這類帶分數）。
3,489 份全數解析後涵蓋率可接近 100%。</p></div>

<div class="method">
<p><b>資料與方法</b>　來源：<code>銷售資料excel</code> 之 11 份進銷存報表（KA135–KA158），共 {M['total_raw']:,} 筆商品紀錄，
資料截止 {M['snapshot']}。完銷率採報表自帶的「銷售率」欄位（＝總銷÷累進，已驗證 100% 與「累進＝總銷＋總存」相符）。
品類由貨號第 6 碼判定（5 開頭為經典格紋線，取兩碼）；季別由貨號前 5 碼的 KA 季號對照表判定，非依資料夾位置。
設計師代號已正規化（E049/e049 同人、E071/e071/M044 同為一人）。</p>
<p><b>所有數字皆由原始報表計算，未經調整或推估。</b>圖表座標由程式計算而非手繪。
n 值一律標示；n &lt; 12 的組別請視為參考而非結論。「未售出零售值」＝剩餘件數×定價，
為未實現營收而非損失，實際成本需搭配進價資料。</p>
<p><b>相關不等於因果。</b>「秋季完銷率低」是觀察到的事實；「因為 X 所以秋季差」需要上方列出的額外資料才能檢驗。</p>
</div>
</div>"""
Path("/tmp/report2.html").write_text(HTML, encoding="utf-8")
print(f"已產生 {len(HTML):,} bytes；縮圖模式：{'開' if IMG_ROOT else '關（僅列路徑）'}")
