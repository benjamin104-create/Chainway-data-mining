"""商品規劃展開圖的報表。

## 這份給誰看

開發會議上的設計總監與主管。所以每一格都要能被指著問「這個數字哪來的」，
而且每一個結論都要附上「什麼情況下它是錯的」。

先前的教訓：「熊在口袋 +16.2pt」數據是對的，但中間那一步的定義沒攤開，
結論看起來像硬凹。這份報表把否定的路徑寫在結論旁邊，不放在附註。
"""
from __future__ import annotations

import html
from typing import Any

import pandas as pd

# 售罄率的配色。藍↔紅、灰色中點，色覺辨識異常也分得出來
# （scripts/validate_palette.js 驗過）。中點取 55% —— 那是這五年的
# 整體水準，不是隨手挑的好看數字。
MID = 0.55
SPAN = 0.22


def e(s: Any) -> str:
    return html.escape(str(s))


def _tone(st: float) -> str:
    """售罄率 → 背景色。越紅越滯銷，越藍越暢銷。"""
    if st is None or pd.isna(st):
        return "transparent"
    t = max(-1.0, min(1.0, (st - MID) / SPAN))
    if t >= 0:
        return f"rgba(31,111,156,{0.10 + 0.42 * t:.3f})"
    return f"rgba(160,50,45,{0.10 + 0.42 * -t:.3f})"


def _grid_table(g: pd.DataFrame) -> str:
    terms = [t for t in ("早春", "夏", "秋", "冬") if (g["季別"] == t).any()]
    cats = [c for c in g["品類"].cat.categories if (g["品類"] == c).any()]
    head = "".join(f"<th>{e(t)}</th>" for t in terms)
    rows = []
    for c in cats:
        cells = []
        for t in terms:
            r = g[(g["品類"] == c) & (g["季別"] == t)]
            if r.empty:
                cells.append("<td></td>")
                continue
            r = r.iloc[0]
            cells.append(
                f'<td style="background:{_tone(r["售罄率"])}">'
                f'<b>{int(r["款數"])}</b> 款'
                f'<span>售罄 {r["售罄率"]:.0%}</span>'
                f'<i>{r["售罄落差"]:+.1f}pt vs 該季</i></td>')
        tot = int(g[g["品類"] == c]["款數"].sum())
        rows.append(f'<tr><th class="rh">{e(c)}<span>{tot} 款</span></th>'
                    f'{"".join(cells)}</tr>')
    return (f'<table class="grid"><tr><th></th>{head}</tr>{"".join(rows)}</table>')


def _season_table(s: pd.DataFrame) -> str:
    s = s.sort_values(["年", "季別"])
    rows = []
    for _, r in s.iterrows():
        note = "" if r["已結束"] else '<u title="這一季還在賣，售罄率會被低估">未結束</u>'
        rows.append(
            f'<tr><td>{e(r["季"])}</td><td>{e(r["袖長"])}</td>'
            f'<td class="n">{int(r["款數"])}</td>'
            f'<td class="n">{int(r["投入"]):,}</td>'
            f'<td class="n">{r["投入深度"]:.0f}</td>'
            f'<td class="n" style="background:{_tone(r["售罄率"])}">{r["售罄率"]:.1%}</td>'
            f'<td class="n">{int(r["暢銷款數"])}</td>'
            f'<td class="n">{int(r["上架天數"])}</td>'
            f'<td class="n">{int(r["剩餘"]):,}</td><td>{note}</td></tr>')
    return ('<table class="wide"><tr><th>季</th><th>袖長</th><th>款數</th>'
            '<th>投入</th><th>每款投入</th><th>售罄率</th><th>暢銷款</th>'
            '<th>上架天數</th><th>剩餘</th><th></th></tr>'
            f'{"".join(rows)}</table>')


def _consistent(g: pd.DataFrame) -> list[tuple[str, int, int, float, int]]:
    """哪些品類在每一季都高於／低於該季平均。

    一致性才是證據。單季高 8 個百分點可能是那一季剛好有一款爆量；
    四季都高，才輪得到談配置。
    """
    out = []
    for c in g["品類"].cat.categories:
        sub = g[g["品類"] == c]
        if sub.empty:
            continue
        up = int((sub["售罄落差"] > 0).sum())
        out.append((str(c), up, int(len(sub)),
                    float(sub["售罄落差"].mean()),
                    int(sub["款數"].sum())))
    return sorted(out, key=lambda r: -r[3])


def build(t: dict[str, Any]) -> str:
    g, s = t["展開"], t["季"]
    sep, win, sim = t["秋分離"], t["上架期檢驗"], t["試算"]
    meta = t["meta"]

    cons = "".join(
        f'<tr><td>{e(c)}</td><td class="n">{n:,}</td>'
        f'<td class="n">{up}/{tot}</td>'
        f'<td class="n" style="background:{_tone(MID + d / 100)}">{d:+.1f}pt</td></tr>'
        for c, up, tot, d, n in _consistent(g))

    aut_years = s[s["季別"] == "秋"].sort_values("年")
    aut_rows = "".join(
        f'<tr><td>{e(r["季"])}</td>'
        f'<td class="n" style="background:{_tone(r["售罄率"])}">{r["售罄率"]:.1%}</td>'
        f'<td class="n">{int(r["款數"])}</td><td class="n">{int(r["剩餘"]):,}</td>'
        f'<td class="n">{int(r["暢銷款數"])}</td></tr>'
        for _, r in aut_years.iterrows())

    return f"""<title>商品規劃展開圖</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Noto+Sans+TC:wght@400;500;600;700&family=Noto+Serif+TC:wght@700&display=swap">
<style>
:root{{--paper:#F2EEE6;--panel:#FBF9F4;--ink:#232019;--ink2:#5E574A;--ink3:#8C8474;
 --rule:#DCD4C4;--rule2:#EDE7DA;--wine:#7A2E38;--pos:#1F6F9C;--neg:#A0322D}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{
 --paper:#191712;--panel:#221F19;--ink:#F0EBDF;--ink2:#B3AB99;--ink3:#847C6B;
 --rule:#38332A;--rule2:#2B271F;--wine:#C08A93;--pos:#57A0CD;--neg:#D98078}}}}
:root[data-theme="dark"]{{--paper:#191712;--panel:#221F19;--ink:#F0EBDF;
 --ink2:#B3AB99;--ink3:#847C6B;--rule:#38332A;--rule2:#2B271F;
 --wine:#C08A93;--pos:#57A0CD;--neg:#D98078}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--paper);color:var(--ink);font-size:15px;line-height:1.78;
 font-family:"Noto Sans TC","Microsoft JhengHei UI","Microsoft JhengHei","PingFang TC",-apple-system,"Segoe UI",sans-serif}}
.page{{max-width:1120px;margin:0 auto;padding:52px 20px 110px}}
h1{{font-family:"Noto Serif TC","Source Han Serif TC",Georgia,serif;font-size:32px;
 margin:0 0 8px;line-height:1.3}}
.dek{{color:var(--ink2);max-width:60ch;margin:0 0 6px;font-size:16px}}
.stamp{{font-family:"IBM Plex Mono",monospace;font-size:11.5px;color:var(--ink3);
 margin:0 0 34px}}
h2{{font-family:"Noto Serif TC","Source Han Serif TC",Georgia,serif;font-size:23px;
 margin:52px 0 4px;padding-top:18px;border-top:1px solid var(--rule)}}
h3{{font-size:15.5px;margin:30px 0 6px;color:var(--ink)}}
p{{max-width:70ch}}
.sub{{font-size:13.5px;color:var(--ink2);margin:0 0 16px;max-width:70ch}}
.scroll{{overflow-x:auto;margin:14px 0 6px}}
table{{border-collapse:collapse;background:var(--panel);border:1px solid var(--rule);
 border-radius:5px;font-size:14px}}
th,td{{padding:9px 13px;border-bottom:1px solid var(--rule2);text-align:left;
 vertical-align:top}}
th{{font-size:11.5px;color:var(--ink3);font-weight:500;white-space:nowrap;
 font-family:"IBM Plex Mono",monospace}}
td.n{{text-align:right;font-variant-numeric:tabular-nums;
 font-family:"IBM Plex Mono",monospace}}
tr:last-child td{{border-bottom:none}}
table.grid td{{text-align:center;min-width:104px;font-size:12px;line-height:1.45}}
table.grid td b{{display:block;font-size:19px;font-weight:600;
 font-family:"IBM Plex Mono",monospace;line-height:1.2}}
table.grid td span{{display:block;color:var(--ink2);font-size:11.5px;
 font-family:"IBM Plex Mono",monospace}}
table.grid td i{{display:block;color:var(--ink3);font-size:10.5px;font-style:normal;
 font-family:"IBM Plex Mono",monospace}}
table.grid th.rh{{font-family:inherit;font-size:14px;color:var(--ink);
 font-weight:600;white-space:nowrap}}
table.grid th.rh span{{display:block;font-size:10.5px;color:var(--ink3);
 font-weight:400;font-family:"IBM Plex Mono",monospace}}
table.wide{{font-size:13px}} table.wide td,table.wide th{{padding:6px 11px}}
u{{text-decoration:none;color:var(--wine);font-size:11px;
 font-family:"IBM Plex Mono",monospace}}
.key{{border-left:3px solid var(--wine);background:var(--panel);padding:17px 21px;
 margin:22px 0;border-radius:0 5px 5px 0;max-width:78ch}}
.key b{{color:var(--ink)}}
.key p{{margin:0 0 10px;color:var(--ink2);font-size:14px}} .key p:last-child{{margin:0}}
.big{{font-family:"IBM Plex Mono",monospace;font-size:27px;color:var(--ink);
 font-weight:500;line-height:1.35;display:block;margin:4px 0 10px}}
.caveat{{border:1px dashed var(--rule);background:transparent;padding:15px 19px;
 margin:20px 0;border-radius:5px;max-width:78ch;font-size:13.5px;color:var(--ink2)}}
.caveat b{{color:var(--wine)}}
.legend{{font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--ink3);
 margin:8px 0 0}}
.legend i{{display:inline-block;width:26px;height:11px;vertical-align:-1px;
 border:1px solid var(--rule);margin:0 4px}}
</style>
<div class="page">

<h1>商品規劃展開圖</h1>
<p class="dek">各品類各季該開幾款 —— 用過去五年那一格真正賣掉多少來回答。</p>
<p class="stamp">{meta['analysed']:,} 款納入分析（原始 {meta['raw']:,} 款）
19 季　快照 {meta['snapshot']}　暢銷定義：售罄 ≥ {meta['champion_rule']['sell_through']:.0%}
且投入 ≥ {meta['champion_rule']['min_qty']} 件</p>

<h2>一、展開現況</h2>
<p class="sub">格子裡是款數，也就是設計部門實際配置的資源 —— 一個款位等於
一次打版、一次選布、一次上架位置。底色是售罄率。</p>
<div class="scroll">{_grid_table(g)}</div>
<p class="legend">售罄率　<i style="background:rgba(160,50,45,.5)"></i>33%
<i style="background:rgba(160,50,45,.2)"></i>
<i style="background:rgba(31,111,156,.2)"></i>
<i style="background:rgba(31,111,156,.5)"></i>77%
「vs 該季」是這一格的售罄率減去該季的款數加權平均。</p>

<h2>二、秋季這一格</h2>
<span class="big">秋季最好的一年 {sep['最好']:.1%}<br>
還是輸給其他季別最差的一年 {sep['其他最差']:.1%}</span>
<p>五個秋季 vs 十四個其他季，<b>完全沒有重疊</b>。這不是平均值被幾年拉低，
是每一年都在下面。程度問題可以微調，結構問題不行。</p>
<div class="scroll"><table><tr><th>季</th><th>售罄率</th><th>款數</th>
<th>剩餘</th><th>暢銷款</th></tr>{aut_rows}</table></div>

<h3>先試著推翻它</h3>
<p class="sub">結論要能被否定才有價值。最容易講得通的反駁是「秋季只是上架期短」。</p>
<div class="caveat">
<p><b>推翻失敗。</b>上架天數與售罄率的相關係數只有 {win['相關係數']:+.3f}
（n={win['n']}），而且方向是<b>越久賣得越好</b>——
如果短是原因，秋季就不該有一季賣了 {win['秋天數全距'][1]} 天還是 35.4%。
秋季平均 {win['秋平均天數']:.0f} 天，其他季 {win['其他平均天數']:.0f} 天，
天數區間 {win['秋天數全距'][0]}–{win['秋天數全距'][1]} 天與其他季大幅重疊。</p>
<p>另一個對照：早春只賣 111 天，售罄 68.4%，是全部十九季裡最高的。
天數解釋不掉這件事。</p>
</div>

<h3>一個講得通的機制</h3>
<p>秋線（貨號 KA*5*）是<b>短袖</b>線，三、四月上架，賣到八月。
夏線（KA*8*）也是短袖，比它早半年上架，兩條線每年重疊 41–159 天。
長袖那邊（早春 KA*7*、冬 KA*6*）重疊天數是 <b>0</b>。</p>
<p class="sub">短袖一年鋪兩條線，長袖一年鋪一條。這解釋得了「為什麼是秋」，
但解釋不了「為什麼每年差距都差不多」—— 重疊 159 天那年（2024）售罄 35.4%，
重疊 41 天那年（2026）39.1%，重疊天數與售罄率之間看不出對應。
所以這是一個值得查的方向，不是已經證實的原因。</p>

<h2>三、五年的量</h2>
<span class="big">秋季五年投入 {sim['投入']:,} 件，賣掉 {sim['實際賣出']:,} 件，
剩 {sim['累積剩餘']:,} 件</span>
<p>同樣的投入量，若照其他季別的整體售罄率 {sim['其他季售罄']:.1%} 計算，
會賣掉 {sim['同投入按其他季售罄可賣']:,} 件 ——
差 <b>{sim['差額件數']:,} 件</b>。</p>
<div class="caveat">
<p><b>這是算術，不是預測。</b>它假設款位移過去之後表現得跟既有款位一樣，
而這個假設通常不成立：一季多開五十款，多出來的那五十款多半是次要想法，
表現會比原本的差。</p>
<p>所以這個數字的用途是「值不值得認真討論」，不是「照這個做」。
要真的驗證只有一條路：下一季秋線少開，看數字往哪邊走。</p>
</div>

<h2>四、跨季一致的品類</h2>
<p class="sub">單季高出八個百分點可能是那一季剛好有一款爆量。
四季都高，才輪得到談配置。</p>
<div class="scroll"><table><tr><th>品類</th><th>五年款數</th>
<th>高於該季平均</th><th>平均落差</th></tr>{cons}</table></div>
<div class="key">
<p><b>外套在四個季別全部高於該季平均</b>（+4.1、+8.0、+6.6、+6.5 個百分點），
但款位佔比只有 5–16%，是除了洋裝以外最少的。</p>
<p><b>洋裝只有夏季成立</b>（+5.2），其餘三季都在平均之下，秋季 −8.3 是全表最差的一格。</p>
<p><b>上衣拿走 55–60% 的款位，四季都貼著平均或略低。</b>
它不是問題，但它也不是把款位加上去會變好的地方。</p>
</div>
<div class="caveat">
<p><b>這裡給不出信賴區間。</b>手上是彙總到「品類 × 季別」的資料，
不是款級資料表，沒有辦法做拔靴法。所以證據強度靠的是
<b>四個獨立季別方向一致</b>，不是靠區間。</p>
<p>要補上區間，需要公司電腦上的款級資料表。外套那四格的樣本數分別是
48、34、39、106 —— 34 那一格特別要留意。</p>
</div>

<h2>五、每一季的原始數字</h2>
<p class="sub">上面每一個結論都是從這張表算出來的。對不上的，以這張為準。</p>
<div class="scroll">{_season_table(s)}</div>

<h2>這份展開圖還缺什麼</h2>
<div class="caveat">
<p><b>價格帶</b>。手上只有暢銷款的價格，那是選出來的樣本，
拿它算「哪個價格帶好賣」必然偏誤，所以整份報表沒有價格帶那一段。</p>
<p><b>圖案與版型的展開</b>。「熊放胸前該開幾款」「格紋佔比多少」
需要把款級資料表與影像屬性接起來。影像那一段已經做好了
（位置、領型、袖長、衣長、顏色），缺的是在公司電腦上跑一次。</p>
<p><b>顧客輪廓</b>。這份完全沒有碰。誰在買、買去搭什麼，POS 看不到。</p>
</div>

</div>"""
