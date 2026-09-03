"""重複款偵測的報表。

## 這份給誰看

設計總監在開下一季的款之前。所以它必須先講「這幾組是對的」，再講
「這幾組要停」—— 一份只會挑毛病的表沒有人會第二次打開，而常青款
本來就該重複，把延續跟誤區混在一起報，設計師第一次看就知道這份表
不懂他們在做什麼。

## 為什麼一定要放圖

指紋一樣不代表衣服長得一樣。版型、布料、配色都不在品名裡 ——
實測「連帽卡格外套」與「麂皮連帽可拆外套」指紋完全相同，
一件是格紋一件是麂皮。那一組後來被殘字擋掉了，但擋不掉的一定還有。

所以每一組都把兩件的照片並排放出來。這份表的工作是**把該比對的
兩件放到一起**，不是替人做決定；沒有圖，人就沒辦法否決它。
找不到圖的照樣列出來，並且明說「沒有圖」——
沉默地少一件，比多一件錯的更危險。
"""
from __future__ import annotations

import html
from pathlib import Path
from typing import Any

import pandas as pd

from .counter_form import thumb

# 判定的呈現順序與語氣。先確認、再警告 ——
# 順序本身就是這份表想說的話。
VERDICTS: list[tuple[str, str, str]] = [
    ("重複而且一直好", "ok", "這是對的，繼續做"),
    ("同季自己打自己", "warn", "同一季裡兩款分掉同一批客人的預算"),
    ("重複而且愈來愈差", "bad", "一季比一季低，早就該停了"),
    ("重複但沒有明確趨勢", "flat", "有重複，但數字沒有指向任何一邊"),
]

THUMB_W = 190


def e(s: Any) -> str:
    return html.escape(str(s))


def _card(m: dict[str, Any], images: dict[str, Path]) -> str:
    # 用貨號查圖，不用資料裡存的相對路徑 —— 資料夾怎麼分是人決定的、會變，
    # 貨號寫在檔名裡是規則，不會變。（inventory_report.index_images 同一套。）
    sku = str(m.get("款號", ""))
    p = images.get(sku)
    src = thumb(p, THUMB_W) if p else None
    pic = (f'<img src="{src}" alt="{e(sku)}">' if src
           else '<div class="noimg">沒有圖</div>')
    st = m.get("售罄率")
    st_txt = f"{st:.0%}" if isinstance(st, (int, float)) else "—"
    return (f'<figure class="card">{pic}'
            f'<figcaption><b>{e(m.get("品名", ""))}</b>'
            f'<span>{e(sku)}　{e(m.get("季別", ""))}</span>'
            f'<i>售罄 {st_txt}</i></figcaption></figure>')


def _group(r: pd.Series, images: dict[str, Path]) -> str:
    cards = "".join(_card(m, images) for m in r["明細"])
    resid = r.get("殘字", "")
    tail = (f'<span class="resid">品名裡沒被認出來的字：{e(resid)}</span>'
            if resid and resid != "（無）" else "")
    return (f'<section class="grp"><h4>{e(r["指紋"])}{tail}</h4>'
            f'<p class="note">{e(r["說明"])}</p>'
            f'<div class="row">{cards}</div></section>')


def _weak_table(w: pd.DataFrame) -> str:
    if w is None or len(w) == 0:
        return ""
    rows = "".join(
        f'<tr><td>{e(r.get("款號", ""))}</td><td>{e(r.get("品名", ""))}</td>'
        f'<td class="n">{r["特徵覆蓋"]:.0%}</td></tr>'
        for _, r in w.sort_values("特徵覆蓋").iterrows())
    return (f'<div class="scroll"><table><tr><th>貨號</th><th>品名</th>'
            f'<th>認出來的字</th></tr>{rows}</table></div>')


def build(res: dict[str, Any], *,
          images: dict[str, Path] | None = None) -> str:
    images = images or {}

    if not res.get("可分析") or not res.get("組數"):
        body = f'<p class="dek">{e(res.get("說明", "沒有找到重複"))}</p>'
        sections = ""
    else:
        g = res["分組"]
        body = ""
        parts = []
        for name, cls, blurb in VERDICTS:
            sub = g[g["判定"] == name]
            if sub.empty:
                continue
            groups = "".join(_group(r, images) for _, r in sub.iterrows())
            parts.append(
                f'<h2 class="{cls}">{e(name)}'
                f'<span class="cnt">{len(sub)} 組</span></h2>'
                f'<p class="sub">{e(blurb)}</p>{groups}')
        sections = "".join(parts)

    weak = res.get("指紋不可靠")
    n_weak = 0 if weak is None else len(weak)
    weak_html = _weak_table(weak) if n_weak else ""
    split_off = res.get("殘字拆開的指紋", 0)

    stamp = (f'{res.get("款數", 0):,} 款參與比對　'
             f'詞彙：{res.get("詞彙來源", "—")}（{res.get("詞彙數", 0)} 個詞）')

    return f"""<title>重複款偵測</title>
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
.dek{{color:var(--ink2);max-width:62ch;margin:0 0 6px;font-size:16px}}
.stamp{{font-family:"IBM Plex Mono",monospace;font-size:11.5px;color:var(--ink3);
 margin:0 0 34px}}
h2{{font-family:"Noto Serif TC","Source Han Serif TC",Georgia,serif;font-size:23px;
 margin:52px 0 4px;padding-top:18px;border-top:1px solid var(--rule)}}
h2.ok{{color:var(--pos)}} h2.bad{{color:var(--neg)}} h2.warn{{color:var(--wine)}}
h2 .cnt{{font-family:"IBM Plex Mono",monospace;font-size:13px;color:var(--ink3);
 font-weight:400;margin-left:10px}}
p{{max-width:70ch}}
.sub{{font-size:13.5px;color:var(--ink2);margin:0 0 18px;max-width:70ch}}
.grp{{background:var(--panel);border:1px solid var(--rule);border-radius:6px;
 padding:16px 18px;margin:0 0 16px}}
.grp h4{{margin:0;font-size:13px;font-family:"IBM Plex Mono",monospace;
 font-weight:500;color:var(--ink2)}}
.resid{{color:var(--ink3);font-size:11.5px;margin-left:12px}}
.note{{margin:6px 0 14px;font-size:14px;color:var(--ink)}}
.row{{display:flex;gap:16px;flex-wrap:wrap}}
.card{{margin:0;width:{THUMB_W}px}}
.card img{{width:100%;border-radius:4px;border:1px solid var(--rule);display:block;
 background:#fff}}
.noimg{{width:100%;aspect-ratio:2/3;border:1px dashed var(--rule);border-radius:4px;
 display:flex;align-items:center;justify-content:center;color:var(--ink3);
 font-size:12px}}
figcaption{{margin-top:7px;line-height:1.5}}
figcaption b{{display:block;font-size:13.5px;font-weight:600}}
figcaption span,figcaption i{{display:block;font-style:normal;font-size:11.5px;
 color:var(--ink3);font-family:"IBM Plex Mono",monospace}}
.scroll{{overflow-x:auto;margin:14px 0 6px}}
table{{border-collapse:collapse;background:var(--panel);border:1px solid var(--rule);
 border-radius:5px;font-size:14px}}
th,td{{padding:9px 13px;border-bottom:1px solid var(--rule2);text-align:left}}
th{{font-size:11.5px;color:var(--ink3);font-weight:500;white-space:nowrap;
 font-family:"IBM Plex Mono",monospace}}
td.n{{text-align:right;font-variant-numeric:tabular-nums;
 font-family:"IBM Plex Mono",monospace}}
tr:last-child td{{border-bottom:none}}
.caveat{{border:1px dashed var(--rule);padding:15px 19px;margin:20px 0;
 border-radius:5px;max-width:78ch;font-size:13.5px;color:var(--ink2)}}
.caveat b{{color:var(--wine)}}
</style>
<div class="page">

<h1>重複款偵測</h1>
<p class="dek">這一季要開的，是不是三年前做過了 —— 以及哪幾組的重複是對的。</p>
<p class="stamp">{e(stamp)}</p>
{body}{sections}

<h2>認不出足夠的字，沒有參與比對<span class="cnt">{n_weak} 款</span></h2>
<p class="sub">品名裡被認出來的字不到 45%，指紋不可信，所以這幾款完全沒進比對。
「沒被報成重複」和「沒辦法判斷」是兩件事，所以列在這裡而不是默默丟掉。</p>
{weak_html}

<h2>這份分析怎麼判、以及它會漏掉什麼</h2>
<p class="sub">三道把關，每一道都是拿真實品名踩到坑之後加的。</p>
<div class="caveat">
<p><b>一、詞彙是從貴司的品名自己學的，不是我寫的。</b>
第一版用手寫清單，144 個真實品名一驗，覆蓋率中位數只有 40%，
而且「小香風蛋糕裙」「貼袋緄邊長褲」「愛心兔子領口剪接」一個詞都抓不到 ——
問題不是清單寫得不夠長，是我不知道這個品牌怎麼命名。
改成統計品名裡出現三次以上的 2–5 字片段，覆蓋率中位數升到 70%，
而且自動學到「假兩件」「連袖」「格布」「拼接」。</p>
<p><b>二、認出來的字太少就不敢說它重複。</b>
實測「圓領片透膚剪接棉T」與「圓領前片格布拼接棉T」只因為都有「圓領」
就差點被判成同一款。所以覆蓋率不到 45% 的一律退出比對，另外列出來。</p>
<p><b>三、沒認出來的字要一起比。</b>
覆蓋率過關也不夠：「連帽卡格外套」覆蓋率 67%，指紋卻和
「麂皮連帽可拆外套」一模一樣 —— 因為「卡格」「麂皮」在這批資料裡
各只出現兩次，低於學詞門檻，整個消失了。覆蓋率只能說
「這個品名我看懂了多少」，不能說「我有沒有看懂讓它與眾不同的那部分」。
所以剩下沒認出來的字也拿來比：一邊是另一邊的子集才算同一款
（「連帽腰間抽繩外套→連帽腰抽繩外套→連帽抽繩外套」是同一件衣服改名，
留在一組），各有各的字就拆開。這一次把 {split_off} 個指紋拆開了。</p>
</div>
<div class="caveat">
<p><b>指紋一樣不代表衣服長得一樣。</b>版型、布料、配色都不在品名裡。
所以每一組都附照片與貨號 —— 這份表的工作是把該比對的兩件放到一起，
不是替人做決定。看起來不像同一款的，以圖為準。</p>
<p><b>反過來也會漏。</b>兩款真的很像但品名寫法完全不同，這裡抓不到。
要補這個洞得靠影像比對，不是靠品名。</p>
</div>

</div>"""
