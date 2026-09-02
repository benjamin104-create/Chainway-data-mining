"""把圖片分類的結果攤成接觸表，讓人一眼判斷分對了沒。

分類器再怎麼寫都是啟發式的。與其宣稱它準，不如把每一類的實際樣本印出來 ——
看一眼就知道「布樣」那一格裡是不是真的都是布，比任何準確率數字都直接。

每張圖底下附上判斷依據（白底比例、彩度、主體佔比、長寬比），
所以分錯的時候能看出是哪個門檻沒調好，而不是只能重猜。
"""
from __future__ import annotations

import base64
import html
import io
from pathlib import Path
from typing import Any

import pandas as pd

# 覆核用，不必大；一頁要放得下夠多張才看得出一類的整體長相
THUMB = (150, 200)

# 先列最該覆核的：打樣照片決定評測分數，錯一張就多一題永遠答不對的題目
ORDER = ["打樣照片", "布樣", "圖稿/線稿", "章戳/標記", "其他", "無法解析"]


def e(s: Any) -> str:
    return html.escape(str(s))


def thumb(path: str | Path) -> str | None:
    try:
        from PIL import Image
        with Image.open(path) as im:
            im = im.convert("RGB")
            im.thumbnail(THUMB)
            b = io.BytesIO()
            im.save(b, "JPEG", quality=72)
        return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()
    except Exception:
        return None


def build(df: pd.DataFrame, *, per_kind: int = 24,
          kind_col: str = "kind") -> str:
    counts = df[kind_col].value_counts()
    order = [k for k in ORDER if k in counts.index]
    order += [k for k in counts.index if k not in order]

    blocks = []
    for kind in order:
        sub = df[df[kind_col] == kind]
        # 取樣而不是取前 N 張：前 N 張常常來自同幾份指示書，
        # 看起來很一致，會讓人誤以為分類很準。
        show = sub.sample(min(per_kind, len(sub)), random_state=7)
        cells = []
        for _, r in show.iterrows():
            src = thumb(r.get("image_path"))
            pic = (f'<img src="{src}" alt="" loading="lazy">' if src
                   else '<div class="no">開不了</div>')
            ev = "　".join(
                f"{k}{r[f'_{k}']:.2f}" if pd.notna(r.get(f"_{k}")) else ""
                for k in ("white", "sat", "fill", "aspect") if f"_{k}" in r.index)
            cells.append(f'<figure>{pic}<figcaption>{e(r.get("sku", ""))}'
                         f'<span>{e(ev)}</span></figcaption></figure>')
        blocks.append(
            f'<section><h2>{e(kind)}<span class="n">{len(sub):,} 張</span></h2>'
            f'<p class="sub">隨機抽 {len(show)} 張。看這一格裡的圖是不是都真的是'
            f'「{e(kind)}」—— 有混到別的，跟我說是哪一類混進哪一類。</p>'
            f'<div class="grid">{"".join(cells)}</div></section>')

    tbl = "".join(f'<tr><td>{e(k)}</td><td class="n">{v:,}</td>'
                  f'<td class="n">{v/max(len(df),1):.1%}</td></tr>'
                  for k, v in counts.items())

    return f"""<title>圖片分類覆核</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Noto+Sans+TC:wght@400;600;700&family=Noto+Serif+TC:wght@700&display=swap">
<style>
:root{{--paper:#F2EEE6;--panel:#FBF9F4;--ink:#232019;--ink2:#5E574A;--ink3:#8C8474;
 --rule:#DCD4C4;--rule2:#EDE7DA;--wine:#7A2E38}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{
 --paper:#191712;--panel:#221F19;--ink:#F0EBDF;--ink2:#B3AB99;--ink3:#847C6B;
 --rule:#38332A;--rule2:#2B271F;--wine:#C08A93}}}}
:root[data-theme="dark"]{{--paper:#191712;--panel:#221F19;--ink:#F0EBDF;
 --ink2:#B3AB99;--ink3:#847C6B;--rule:#38332A;--rule2:#2B271F;--wine:#C08A93}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--paper);color:var(--ink);font-size:15px;line-height:1.75;
 font-family:"Noto Sans TC","Microsoft JhengHei UI","Microsoft JhengHei","PingFang TC",-apple-system,"Segoe UI",system-ui,sans-serif}}
.page{{max-width:1200px;margin:0 auto;padding:48px 22px 100px}}
h1{{font-family:"Noto Serif TC","Source Han Serif TC","PMingLiU","Songti TC",Georgia,serif;font-size:30px;margin:0 0 10px}}
.dek{{color:var(--ink2);max-width:62ch;margin:0 0 24px}}
h2{{font-family:"Noto Serif TC","Source Han Serif TC","PMingLiU","Songti TC",Georgia,serif;font-size:21px;margin:44px 0 2px}}
h2 .n{{font-family:"IBM Plex Mono",monospace;font-size:13px;color:var(--ink3);
 font-weight:400;margin-left:10px}}
.sub{{font-size:13px;color:var(--ink2);margin:0 0 12px;max-width:64ch}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(126px,1fr));gap:10px}}
figure{{margin:0;background:var(--panel);border:1px solid var(--rule);border-radius:4px;
 overflow:hidden}}
figure img{{width:100%;height:158px;object-fit:contain;background:#fff;display:block}}
.no{{height:158px;display:flex;align-items:center;justify-content:center;
 color:var(--ink3);font-size:11px;background:var(--rule2)}}
figcaption{{padding:5px 7px;font-size:10.5px;font-family:"IBM Plex Mono",monospace;
 line-height:1.5}}
figcaption span{{display:block;color:var(--ink3);font-size:9.5px}}
table{{border-collapse:collapse;background:var(--panel);border:1px solid var(--rule);
 border-radius:4px;font-size:14px;min-width:320px}}
td{{padding:8px 14px;border-bottom:1px solid var(--rule2)}}
td.n{{text-align:right;font-variant-numeric:tabular-nums;
 font-family:"IBM Plex Mono",monospace}}
tr:last-child td{{border-bottom:none}}
.note{{border-left:3px solid var(--wine);background:var(--panel);padding:14px 18px;
 margin:20px 0;border-radius:0 4px 4px 0;font-size:13.5px;color:var(--ink2)}}
.note b{{color:var(--ink)}}
</style>
<div class="page">
<h1>圖片分類覆核</h1>
<p class="dek">從裁縫指示書抽出來的 {len(df):,} 張圖，重新依照內容分類。
分類是啟發式的，所以把每一類的實際樣本攤出來讓人判斷，而不是叫人相信一個數字。</p>

<div class="note">
<p><b>為什麼要重做這件事。</b>舊的分類只看檔案格式與尺寸：
「JPEG 而且大於 600px」就算打樣照片。於是繡花圖稿、布樣特寫、核可章戳
全被當成衣服照片。以圖搜貨號的評測就建立在這個標籤上 ——
Top-1 只有 1.29%，量到的是測試集壞掉，不是檢索能力差。</p>
<p><b>請重點看「打樣照片」那一格。</b>那一格決定評測分數。
裡面若混進布樣或線稿，分數就會被拉低；漏掉幾張真照片反而沒有損失。
所以門檻是刻意從嚴的。</p>
</div>

<table>{tbl}</table>
{"".join(blocks)}
</div>"""
