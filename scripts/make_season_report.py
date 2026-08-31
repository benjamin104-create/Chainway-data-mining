"""由 /tmp/rd.json 產生報告 HTML。座標全部由程式計算，避免手寫 SVG 算錯。"""
import json, html
D = json.load(open("/tmp/rd.json"))
M = D["meta"]

S1, S2, S3, S4 = "#2a78d6", "#eb6834", "#1baf7a", "#eda100"   # 已驗證的分類配色
CRIT = "#d03b3b"
SEASON_COLOR = {"春": S3, "夏": S4, "秋": S2, "冬": S1}


def esc(s): return html.escape(str(s))


def hbar(rows, key, label_key, fmt, w=680, rowh=34, maxv=None, color=None, n_key="n"):
    """橫向長條圖。rows 依序畫。"""
    maxv = maxv or max(r[key] for r in rows) * 1.15
    lw, vw = 96, 108                      # 左標籤寬、右數值寬
    plot = w - lw - vw
    h = len(rows) * rowh + 26
    out = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img">']
    # 基準格線
    for t in [0.2, 0.4, 0.6, 0.8]:
        if t > maxv: continue
        x = lw + plot * t / maxv
        out.append(f'<line x1="{x:.1f}" y1="6" x2="{x:.1f}" y2="{len(rows)*rowh+4}" class="grid"/>')
        out.append(f'<text x="{x:.1f}" y="{len(rows)*rowh+20}" class="tick" text-anchor="middle">{t:.0%}</text>')
    for i, r in enumerate(rows):
        y = i * rowh + 8
        bw = plot * r[key] / maxv
        c = color(r) if callable(color) else (color or S1)
        out.append(f'<text x="{lw-10}" y="{y+15}" class="lab" text-anchor="end">{esc(r[label_key])}</text>')
        out.append(f'<rect x="{lw}" y="{y+3}" width="{max(bw,2):.1f}" height="18" rx="4" fill="{c}"/>')
        out.append(f'<text x="{lw+bw+8:.1f}" y="{y+17}" class="val">{fmt(r)}</text>')
    out.append("</svg>")
    return "\n".join(out)


def grouped(cat_season, w=680):
    """秋 vs 冬 分品類對照（成對長條）。"""
    cats = sorted({r["品類"] for r in cat_season},
                  key=lambda c: -next((x["完銷"] for x in cat_season if x["品類"] == c and x["季"] == "冬"), 0))
    lw, vw, rowh = 76, 150, 40
    plot = w - lw - vw
    h = len(cats) * rowh + 40
    maxv = 0.8
    out = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img">']
    for t in [0.2, 0.4, 0.6, 0.8]:
        x = lw + plot * t / maxv
        out.append(f'<line x1="{x:.1f}" y1="6" x2="{x:.1f}" y2="{len(cats)*rowh+6}" class="grid"/>')
        out.append(f'<text x="{x:.1f}" y="{len(cats)*rowh+24}" class="tick" text-anchor="middle">{t:.0%}</text>')
    for i, c in enumerate(cats):
        y = i * rowh + 8
        wt = next((x for x in cat_season if x["品類"] == c and x["季"] == "冬"), None)
        au = next((x for x in cat_season if x["品類"] == c and x["季"] == "秋"), None)
        out.append(f'<text x="{lw-10}" y="{y+22}" class="lab" text-anchor="end">{esc(c)}</text>')
        for j, (rec, col) in enumerate([(wt, S1), (au, S2)]):
            if not rec: continue
            bw = plot * rec["完銷"] / maxv
            yy = y + j * 15
            out.append(f'<rect x="{lw}" y="{yy+2}" width="{max(bw,2):.1f}" height="13" rx="3" fill="{col}"/>')
        if wt and au:
            gap = wt["完銷"] - au["完銷"]
            out.append(f'<text x="{lw+plot+10}" y="{y+14}" class="val">冬 {wt["完銷"]:.0%}<tspan class="dim"> n={wt["n"]}</tspan></text>')
            out.append(f'<text x="{lw+plot+10}" y="{y+29}" class="val">秋 {au["完銷"]:.0%}<tspan class="dim"> n={au["n"]}</tspan> '
                       f'<tspan fill="{CRIT}" font-weight="600">−{gap*100:.0f}pt</tspan></text>')
    out.append("</svg>")
    return "\n".join(out)


def timeline(tl, w=760, h=250):
    """賣期時間軸：四個季別在同一條時間軸上的入庫量，看重疊。"""
    months = sorted({r["ym"] for r in tl})
    idx = {m: i for i, m in enumerate(months)}
    series = {s: [0] * len(months) for s in ["春", "夏", "秋", "冬"]}
    for r in tl:
        if r["季"] in series:
            series[r["季"]][idx[r["ym"]]] = r["n"]
    maxv = max(max(v) for v in series.values()) * 1.1
    pl, pr, pt, pb = 42, 12, 12, 44
    pw, ph = w - pl - pr, h - pt - pb
    out = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img">']
    for t in range(0, int(maxv) + 1, 40):
        y = pt + ph - ph * t / maxv
        out.append(f'<line x1="{pl}" y1="{y:.1f}" x2="{w-pr}" y2="{y:.1f}" class="grid"/>')
        out.append(f'<text x="{pl-8}" y="{y+4:.1f}" class="tick" text-anchor="end">{t}</text>')
    step = pw / max(len(months) - 1, 1)
    for i, m in enumerate(months):
        if not m.endswith(("-01", "-07")): continue
        x = pl + i * step
        out.append(f'<text x="{x:.1f}" y="{h-24}" class="tick" text-anchor="middle">{m[2:]}</text>')
    for s in ["春", "夏", "秋", "冬"]:
        pts = " ".join(f"{pl+i*step:.1f},{pt+ph-ph*v/maxv:.1f}" for i, v in enumerate(series[s]))
        out.append(f'<polyline points="{pts}" fill="none" stroke="{SEASON_COLOR[s]}" stroke-width="2" '
                   f'stroke-linejoin="round" stroke-linecap="round"/>')
        peak = max(range(len(months)), key=lambda i: series[s][i])
        px, py = pl + peak * step, pt + ph - ph * series[s][peak] / maxv
        out.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="4.5" fill="{SEASON_COLOR[s]}" stroke="var(--surface)" stroke-width="2"/>')
        out.append(f'<text x="{px:.1f}" y="{py-10:.1f}" class="val" text-anchor="middle" fill="{SEASON_COLOR[s]}">{s}</text>')
    out.append(f'<text x="{pl-8}" y="{pt+6}" class="tick" text-anchor="end">款</text>')
    out.append("</svg>")
    return "\n".join(out)


def month_lines(w=680, h=230):
    """秋 vs 冬：入庫月份 × 完銷率。這是全報告最關鍵的一張圖。"""
    au, wt = D["month_秋"], D["month_冬"]
    months = list(range(3, 12))
    pl, pr, pt, pb = 46, 96, 14, 40
    pw, ph = w - pl - pr, h - pt - pb
    out = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img">']
    for t in [0, 0.2, 0.4, 0.6, 0.8]:
        y = pt + ph - ph * t / 0.8
        out.append(f'<line x1="{pl}" y1="{y:.1f}" x2="{w-pr}" y2="{y:.1f}" class="grid"/>')
        out.append(f'<text x="{pl-8}" y="{y+4:.1f}" class="tick" text-anchor="end">{t:.0%}</text>')
    step = pw / (len(months) - 1)
    for i, m in enumerate(months):
        out.append(f'<text x="{pl+i*step:.1f}" y="{h-18}" class="tick" text-anchor="middle">{m}月</text>')
    for data, col, name in [(wt, S1, "冬季"), (au, S2, "秋季")]:
        pts = [(pl + months.index(r["月"]) * step, pt + ph - ph * r["完銷"] / 0.8) for r in data if r["月"] in months]
        out.append('<polyline points="' + " ".join(f"{x:.1f},{y:.1f}" for x, y in pts) +
                   f'" fill="none" stroke="{col}" stroke-width="2.5" stroke-linejoin="round"/>')
        for (x, y), r in zip(pts, [r for r in data if r["月"] in months]):
            out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="{col}" stroke="var(--surface)" stroke-width="1.5"/>')
        lx, ly = pts[-1]
        out.append(f'<text x="{lx+10:.1f}" y="{ly+4:.1f}" class="val" fill="{col}" font-weight="600">{name}</text>')
    last = [r for r in au if r["月"] in months][-1]
    lx = pl + months.index(last["月"]) * step
    ly = pt + ph - ph * last["完銷"] / 0.8
    out.append(f'<text x="{lx+10:.1f}" y="{ly+19:.1f}" class="tick" fill="{CRIT}">8月入庫僅 7.8%</text>')
    out.append("</svg>")
    return "\n".join(out)


# ---- 內容組裝 ----
cat = D["cat"]
sd = {r["季"]: r for r in D["season_done"]}
sy = D["season_year"]

cat_bars = hbar(cat, "完銷", "品類",
                lambda r: f'{r["完銷"]:.1%} <tspan class="dim">n={r["n"]}</tspan>',
                color=lambda r: S3 if r["完銷"] >= .57 else (S2 if r["完銷"] < .47 else S1))

season_bars = hbar([sd[s] for s in ["冬", "夏", "春", "秋"]], "完銷", "季",
                   lambda r: f'{r["完銷"]:.1%} <tspan class="dim">n={r["n"]}　完銷≥80% 佔 {r["hi"]:.0%}</tspan>',
                   color=lambda r: CRIT if r["季"] == "秋" else S1, w=700)

year_rows = []
for s in ["冬", "夏", "春", "秋"]:
    for y in [2024, 2025, 2026]:
        rec = next((r for r in sy if r["季"] == s and r["年"] == y), None)
        if rec:
            year_rows.append({"lab": f"{y} {s}", "完銷": rec["完銷"], "n": rec["n"], "季": s})
year_bars = hbar(year_rows, "完銷", "lab",
                 lambda r: f'{r["完銷"]:.1%} <tspan class="dim">n={r["n"]}</tspan>',
                 color=lambda r: CRIT if r["季"] == "秋" else SEASON_COLOR[r["季"]], w=700, rowh=27)

price_rows = sorted(cat, key=lambda r: -r["中位價"])
price_svg = []
pw_, plw = 400, 88
maxp = 11000
price_svg.append(f'<svg viewBox="0 0 680 {len(price_rows)*36+30}" class="chart" role="img">')
for t in [0, 2000, 4000, 6000, 8000, 10000]:
    x = plw + pw_ * t / maxp
    price_svg.append(f'<line x1="{x:.1f}" y1="6" x2="{x:.1f}" y2="{len(price_rows)*36+4}" class="grid"/>')
    price_svg.append(f'<text x="{x:.1f}" y="{len(price_rows)*36+22}" class="tick" text-anchor="middle">{t//1000}k</text>')
for i, r in enumerate(price_rows):
    y = i * 36 + 8
    x1, x2 = plw + pw_ * r["p10"] / maxp, plw + pw_ * r["p90"] / maxp
    xm = plw + pw_ * r["中位價"] / maxp
    price_svg.append(f'<text x="{plw-10}" y="{y+18}" class="lab" text-anchor="end">{esc(r["品類"])}</text>')
    price_svg.append(f'<line x1="{x1:.1f}" y1="{y+13}" x2="{x2:.1f}" y2="{y+13}" stroke="{S1}" stroke-width="10" stroke-linecap="round" opacity="0.32"/>')
    price_svg.append(f'<circle cx="{xm:.1f}" cy="{y+13}" r="5.5" fill="{S1}" stroke="var(--surface)" stroke-width="2"/>')
    price_svg.append(f'<text x="{plw+pw_+14}" y="{y+18}" class="val">{r["中位價"]:,}<tspan class="dim"> ({r["p10"]:,}–{r["p90"]:,})</tspan></text>')
price_svg.append("</svg>")
price_svg = "\n".join(price_svg)

cat_table = "".join(
    f'<tr><td>{esc(r["品類"])}</td><td class="n">{r["n"]}</td><td class="n">{r["中位價"]:,}</td>'
    f'<td class="n">{r["p10"]:,}–{r["p90"]:,}</td><td class="n">{r["完銷"]:.1%}</td>'
    f'<td class="n">{r["hi"]:.1%}</td><td class="n">{r["lo"]:.1%}</td><td class="n">{r["件數"]:,}</td></tr>'
    for r in cat)

HTML = f"""<title>秋季完銷率診斷</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@500;700&family=Noto+Sans+TC:wght@400;500;700&display=swap">
<style>
:root{{
  --surface:#f7f7f4; --panel:#fffffe; --ink:#1c1a17; --ink2:#57544d; --ink3:#8b8780;
  --line:#e0ddd5; --line2:#efece5; --navy:#1f3a5f; --crit:{CRIT};
  --s1:{S1}; --s2:{S2}; --s3:{S3}; --s4:{S4};
}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{
  --surface:#171714; --panel:#1f1e1b; --ink:#f2f0ea; --ink2:#b6b2a8; --ink3:#847f75;
  --line:#33312b; --line2:#26251f; --navy:#8fb3dd; --crit:#e66767;
  --s1:#3987e5; --s2:#d95926; --s3:#199e70; --s4:#c98500;
}}}}
:root[data-theme="dark"]{{
  --surface:#171714; --panel:#1f1e1b; --ink:#f2f0ea; --ink2:#b6b2a8; --ink3:#847f75;
  --line:#33312b; --line2:#26251f; --navy:#8fb3dd; --crit:#e66767;
  --s1:#3987e5; --s2:#d95926; --s3:#199e70; --s4:#c98500;
}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--surface);color:var(--ink);
 font-family:"Noto Sans TC",-apple-system,"Segoe UI",sans-serif;font-size:15px;line-height:1.75;
 -webkit-font-smoothing:antialiased}}
.wrap{{max-width:820px;margin:0 auto;padding:56px 26px 110px}}
h1{{font-family:"Noto Serif TC",serif;font-weight:700;font-size:30px;line-height:1.35;margin:0 0 10px;
 letter-spacing:.01em;text-wrap:balance}}
h2{{font-family:"Noto Serif TC",serif;font-weight:700;font-size:20px;margin:56px 0 4px;text-wrap:balance}}
h3{{font-size:14px;font-weight:700;margin:30px 0 6px;color:var(--ink2)}}
.eyebrow{{font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink3);
 font-weight:500;margin:0 0 6px}}
.sub{{color:var(--ink2);font-size:13.5px;margin:0 0 4px}}
p{{margin:12px 0}}
.lede{{color:var(--ink2);font-size:14.5px;margin:0 0 30px}}
.panel{{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:20px 22px;margin:22px 0}}
.finding{{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--navy);
 border-radius:0 10px 10px 0;padding:16px 20px;margin:20px 0}}
.finding.alert{{border-left-color:var(--crit)}}
.finding b{{display:block;font-family:"Noto Serif TC",serif;font-size:16.5px;margin-bottom:6px}}
.finding p{{margin:6px 0 0;font-size:14px;color:var(--ink2)}}
.caution{{background:color-mix(in srgb,var(--crit) 8%,var(--panel));border:1px solid color-mix(in srgb,var(--crit) 28%,var(--line));
 border-radius:10px;padding:18px 20px;margin:22px 0;font-size:14px}}
.caution b{{color:var(--crit)}}
.kpis{{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:10px;margin:24px 0}}
.kpi{{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:14px 15px}}
.kpi .n{{font-family:"Noto Serif TC",serif;font-size:25px;font-weight:700;letter-spacing:-.01em;
 font-variant-numeric:tabular-nums;line-height:1.15}}
.kpi .l{{font-size:11.5px;color:var(--ink3);margin-top:3px}}
.chart{{width:100%;height:auto;display:block;margin:14px 0 4px;overflow:visible}}
.chart .grid{{stroke:var(--line2);stroke-width:1}}
.chart .tick{{font-size:10.5px;fill:var(--ink3);font-family:"Noto Sans TC",sans-serif}}
.chart .lab{{font-size:12.5px;fill:var(--ink);font-family:"Noto Sans TC",sans-serif}}
.chart .val{{font-size:11.5px;fill:var(--ink);font-variant-numeric:tabular-nums;font-family:"Noto Sans TC",sans-serif}}
.chart .dim{{fill:var(--ink3)}}
.legend{{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--ink2);margin:6px 0 2px}}
.legend i{{width:11px;height:11px;border-radius:3px;display:inline-block;margin-right:5px;vertical-align:-1px}}
.tw{{overflow-x:auto;border:1px solid var(--line);border-radius:9px;background:var(--panel);margin:16px 0}}
table{{width:100%;border-collapse:collapse;font-size:13px}}
th,td{{padding:9px 12px;border-bottom:1px solid var(--line2);text-align:left;white-space:nowrap}}
th{{font-size:11.5px;color:var(--ink3);font-weight:500;letter-spacing:.03em}}
td.n{{text-align:right;font-variant-numeric:tabular-nums}}
tr:last-child td{{border-bottom:none}}
.method{{font-size:12.5px;color:var(--ink3);border-top:1px solid var(--line);margin-top:52px;padding-top:20px}}
.method b{{color:var(--ink2)}}
code{{background:var(--line2);padding:1px 5px;border-radius:4px;font-size:12.5px}}
</style>

<div class="wrap">
<p class="eyebrow">Kinloch Anderson · 進銷存診斷</p>
<h1>秋季完銷率只有其他三季的一半<br>而且不是品類組合的問題</h1>
<p class="lede">
分析 {M['total_raw']:,} 筆 KA135–KA158 進銷存紀錄（2024春–2026秋，11 個季別，
資料截止 {M['snapshot']}）。本報告只用 POS 數據，不含影像判讀 —— 能證明什麼、不能證明什麼，
第五節逐項寫明。
</p>

<div class="kpis">
<div class="kpi"><div class="n">{M['analysed']:,}</div><div class="l">納入分析款數</div></div>
<div class="kpi"><div class="n">{M['done']:,}</div><div class="l">已完結季（2024–25）</div></div>
<div class="kpi"><div class="n" style="color:var(--crit)">33.7%</div><div class="l">秋季平均完銷率</div></div>
<div class="kpi"><div class="n">61.6%</div><div class="l">冬季平均完銷率</div></div>
</div>

<h2>一、母體怎麼來的</h2>
<p class="sub">排除規則若有錯，後面每個數字都會偏。先攤開。</p>
<div class="tw"><table>
<tr><th>步驟</th><th class="n">款數</th><th>理由</th></tr>
<tr><td>原始紀錄</td><td class="n">{M['total_raw']:,}</td><td>11 個季別報表，已扣除每檔一列的「合計」</td></tr>
<tr><td>－ 贈品（8字頭）</td><td class="n">−{M['excl_gift']}</td><td>電風扇、行李箱、購物袋等，是送的不是賣的</td></tr>
<tr><td>－ 樣衣</td><td class="n">−{M['excl_sample']}</td><td>品名含「樣衣」，或投入 ≤2 件且零銷售</td></tr>
<tr><td>－ 投入 &lt; 30 件</td><td class="n">−{M['excl_small']}</td><td>樣本太小，完銷率的隨機波動大於真實差異</td></tr>
<tr><td><b>納入分析</b></td><td class="n"><b>{M['analysed']:,}</b></td><td>再扣除尚在銷售期的 2026 年 → 已完結 {M['done']:,} 款</td></tr>
</table></div>

<h2>二、各品類的價格與完銷</h2>
<p class="sub">完銷率 = 總銷 ÷ 累進投入。以下為 {M['analysed']:,} 款全體（含 2026）。</p>
{cat_bars}
<div class="legend"><span><i style="background:var(--s3)"></i>完銷 ≥57%</span>
<span><i style="background:var(--s1)"></i>47–57%</span>
<span><i style="background:var(--s2)"></i>&lt;47%</span></div>

<h3>價格帶（點為中位，橫條為 10–90 百分位）</h3>
{price_svg}

<div class="finding">
<b>針織與外套是雙冠：完銷最高，單價也最高</b>
<p>針織 59.2%、外套 58.4%，且完銷≥80% 的比例（31.7% / 29.0%）是其他品類的 1.5 倍以上。
外套中位價 5,580 元、90 百分位到 10,824 元 —— <b>高價位沒有拖累完銷</b>。</p>
</div>

<div class="finding alert">
<b>洋裝是唯一該檢討的品類</b>
<p>完銷 45.2%（全體最低），完銷不到 30% 的佔 33.8%（全體最高），
而中位價 5,230 元是第二高。<b>賣得最差、價格第二貴、投入 6,561 件</b>。
它是唯一「高價但賣不動」的品類，與外套形成對比。</p>
</div>

<div class="tw"><table>
<tr><th>品類</th><th class="n">款數</th><th class="n">中位價</th><th class="n">價格帶(10–90%)</th>
<th class="n">平均完銷</th><th class="n">完銷≥80%</th><th class="n">完銷&lt;30%</th><th class="n">投入件數</th></tr>
{cat_table}
</table></div>

<h2>三、賣期分佈：四季在時間軸上的重疊</h2>
<p class="sub">依入庫日統計每月上架款數。四條線各自為一個季別，重疊處代表同時在鋪貨。</p>
{timeline(D['timeline'])}
<div class="legend">
<span><i style="background:var(--s3)"></i>春</span><span><i style="background:var(--s4)"></i>夏</span>
<span><i style="background:var(--s2)"></i>秋</span><span><i style="background:var(--s1)"></i>冬</span>
<span style="color:var(--ink3)">·　圓點為各季入庫高峰</span></div>

<div class="finding">
<b>四季的上架節奏規律且穩定，各季高峰相隔約三個月</b>
<p>冬季高峰在 9 月、春季在 12 月、夏季在 3 月、秋季在 6 月。
相鄰兩季的鋪貨期重疊約兩個月，這是正常的接檔。<b>問題不在節奏，在秋季本身。</b></p>
</div>

<h2>四、秋季：連續三年墊底</h2>
{season_bars}
<p class="sub">上圖為已完結的 2024–2025 兩年（{M['done']:,} 款）。下圖分年檢視，確認不是單一年度異常。</p>
{year_bars}

<div class="finding alert">
<b>秋季完銷率連續三年最低，且差距沒有縮小</b>
<p>2024秋 35.4%、2025秋 32.1%、2026秋 39.1%，而同期冬季都在 60% 以上。
更關鍵的是<b>完銷≥80% 的款只佔 4.6%</b>（冬季 33.6%）—— 秋季幾乎沒有完銷款。</p>
</div>

<h3>不是品類組合造成的</h3>
<p class="sub">若秋季只是剛好排了比較差的品類，那應該有品類在秋季表現正常。實際上沒有：</p>
{grouped(D['cat_season'])}
<div class="legend"><span><i style="background:var(--s1)"></i>冬季</span><span><i style="background:var(--s2)"></i>秋季</span></div>

<div class="finding alert">
<b>七個品類在秋季全數低於冬季，無一例外</b>
<p>針織落差最大（70.4% → 27.6%，−43pt），棉T −30pt、外套 −27pt。
<b>同一個品類、同一批設計師、相近的價格帶，只換一個季別就掉三到四成。</b>
這排除了「秋季商品組合較差」的解釋。</p>
</div>

<h3>入庫越晚，完銷越低 —— 但只發生在秋季</h3>
{month_lines()}
<div class="legend"><span><i style="background:var(--s1)"></i>冬季（相關係數 −0.05）</span>
<span><i style="background:var(--s2)"></i>秋季（相關係數 −0.30）</span></div>

<div class="finding alert">
<b>冬季不管幾月入庫都賣得動，秋季不行</b>
<p>冬季 7–11 月入庫的完銷率都在 60–70% 之間，幾乎持平。
秋季則從 4 月的 39.4% 一路掉到 8 月的 7.8%。
<b>這組對照說明問題不是「晚入庫就會差」，而是「秋季的晚入庫會差」。</b></p>
</div>

<h2>五、這份報告能證明什麼、不能證明什麼</h2>

<div class="panel">
<h3 style="margin-top:0">已經站得住的</h3>
<p style="margin-top:4px">秋季完銷率顯著低於其他三季，且此差異：<b>①</b> 連續三年成立；
<b>②</b> 七個品類全數成立；<b>③</b> 在排除尚未結束銷售的 2026 年後仍成立；
<b>④</b> 有冬季作為對照組，排除「入庫晚必然差」的替代解釋。</p>
</div>

<div class="caution">
<b>還不能下的結論</b>
<p style="margin-top:6px">為什麼秋季差 —— 這份資料回答不了。至少四個解釋還無法區分：</p>
<p><b>1. 商品本身</b>　秋季款的設計、布料、厚薄是否不適合當時氣候？<b>需要系統圖與裁縫指示書</b>才能判斷。</p>
<p><b>2. 檔期競爭</b>　秋季鋪貨期（4–8 月）正好與夏季末出清重疊，是否被自家折扣品瓜分？<b>需要門市日銷資料</b>。</p>
<p><b>3. 氣候</b>　台灣秋季偏短，消費者是否直接從夏裝跳到冬裝？<b>需要氣象資料交叉比對</b>。</p>
<p><b>4. 定價</b>　秋季中位價 3,530 元是四季最低，是否本來就是過渡季的次要檔期？<b>需要毛利資料</b>。</p>
</div>

<div class="caution">
<b>本次沒能做到的分析</b>
<p style="margin-top:6px"><b>分長短袖的完銷率</b> —— 你要求的這一項<b>我做不到，且不建議勉強做</b>。
上衣類 {D['sleeve']['上衣類總數']} 款中，品名有明確寫袖長的只有 {D['sleeve']['有標示']} 款
（{D['sleeve']['有標示']/D['sleeve']['上衣類總數']:.1%}）。
用其餘詞彙推測袖長，方法上不可靠；而且會寫袖長的款本身就有偏誤 ——
設計師認為袖型是賣點時才會寫進品名。</p>
<p><b>正確的來源是裁縫指示書</b>：每份都有「袖長」「袖口」欄位（單位為英吋，寫成 <code>13 3/4</code> 這類帶分數），
以及肩寬、衣長、胸圍。3,489 份指示書全數解析後，袖長涵蓋率可接近 100%，
屆時這項分析才有意義。</p>
</div>

<div class="method">
<p><b>資料與方法</b>　來源：<code>銷售資料excel</code> 之 11 份進銷存報表（KA135–KA158），
共 {M['total_raw']:,} 筆商品紀錄，資料截止 {M['snapshot']}。
完銷率採用報表自帶的「銷售率」欄位（= 總銷 ÷ 累進，已驗證 100% 與 累進 = 總銷 + 總存 相符）。
品類由貨號第 6 碼判定（5 開頭為經典格紋線，取兩碼）。
季別由貨號前 5 碼的 KA 季號對照表判定，非依資料夾位置。</p>
<p><b>本報告的所有數字皆由原始報表計算，未經任何調整或推估。</b>
第四節的分年與分品類檢驗，目的即在於讓結論可被獨立複查。
n 值一律標示於圖表；n &lt; 20 的組別請視為參考而非結論。</p>
<p><b>相關不等於因果。</b>「秋季完銷率低」是觀察到的事實；
「因為 X 所以秋季差」則需要上方列出的額外資料才能檢驗。</p>
</div>
</div>
"""

open("/tmp/report.html", "w", encoding="utf-8").write(HTML)
print(f"已產生 {len(HTML):,} bytes")
