"""定位結果的證明圖：原圖 + 框出偵測到的區域 + 判到的分區。

定位是啟發式的。宣稱準確率沒有意義 —— 框畫錯了，人一眼就看得出來，
比任何數字都直接。所以這份報表的工作不是說服，是讓人能否定。

先前吃過虧：圖片分類我用「JPEG 且大於 600px」判打樣照片，自己覺得
合理就上線，結果整個以圖搜貨號的評測建立在錯的標籤上，
Top-1 1.29% 量到的是測試集壞掉。這次先讓人看。
"""
from __future__ import annotations

import base64
import html
import io
from pathlib import Path
from typing import Any

import pandas as pd

from ..vision.locate import CLAIM_OVERLAP

THUMB = 200
# 每一個分區抽幾張。抽樣而不是取前 N —— 前 N 張常來自同幾季，
# 看起來很一致會讓人誤以為規則很準。
PER_ZONE = 12


def e(s: Any) -> str:
    return html.escape(str(s))


def _draw(path: str, row: pd.Series, category: str | None) -> str | None:
    """把偵測到的區域框在原圖上。框是畫在縮圖上的，不動原檔。"""
    try:
        from PIL import ImageDraw
        from ..imageio import load_rgb
        from ..vision.locate import garment_mask, find_decorations

        im = load_rgb(path)
        if str(row.get("分區")) == "非衣物":
            # 被擋下來的圖照樣要看得到原圖 —— 擋錯了（把真的衣服照片
            # 判成布樣）是這道閘門最危險的失誤，而且只有看圖才發現得了。
            im.thumbnail((THUMB, int(THUMB * 1.4)))
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=76)
            return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
        _, (x1, y1, x2, y2) = garment_mask(im)
        blobs = find_decorations(im)
        # garment_mask 在縮圖座標系工作，畫框前要換算回原圖比例
        sw, sh = im.size
        scale = max(sw, sh) / 320 if max(sw, sh) > 320 else 1.0
        gx1, gy1 = x1 * scale, y1 * scale
        gw, gh = (x2 - x1) * scale, (y2 - y1) * scale

        d = ImageDraw.Draw(im)
        d.rectangle([gx1, gy1, gx1 + gw, gy1 + gh], outline=(150, 150, 150), width=2)
        for i, b in enumerate(blobs[:3]):
            bx1, by1, bx2, by2 = b["_bbox_norm"]
            col = (31, 111, 156) if i == 0 else (194, 96, 58)
            d.rectangle([gx1 + bx1 * gw, gy1 + by1 * gh,
                         gx1 + bx2 * gw, gy1 + by2 * gh],
                        outline=col, width=max(2, int(3 * scale / 2)))
        im.thumbnail((THUMB, int(THUMB * 1.4)))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=76)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return None


def build(df: pd.DataFrame, *, per_zone: int = PER_ZONE) -> str:
    if df.empty:
        return "<title>定位覆核</title><p>沒有資料</p>"

    order = (df["分區"].value_counts().index.tolist())
    blocks = []
    for zone in order:
        sub = df[df["分區"] == zone]
        show = sub.sample(min(per_zone, len(sub)), random_state=3)
        cells = []
        for _, r in show.iterrows():
            src = _draw(r["image_path"], r, r.get("部位"))
            pic = (f'<img src="{src}" alt="">' if src
                   else '<div class="no">開不了</div>')
            coord = ("" if pd.isna(r.get("x"))
                     else f"x{r['x']:.2f} y{r['y']:.2f}　佔{r['面積佔衣服']:.1%}")
            # 版型屬性與比例值並列。只給標籤，覆核的人沒有東西可以指著說
            # 「這個數字不對」—— 上一次「熊在口袋」就是敗在中間那一步
            # 沒有攤開來。
            shape = "、".join(str(r[k]) for k in ("領型", "袖長", "衣長")
                              if k in r and pd.notna(r.get(k)))
            nums = "　".join(
                f"{lab}{r[k]}" for lab, k in
                (("領深", "領深比"), ("領寬", "領寬比"), ("袖", "袖長比"),
                 ("衣長", "衣長比"))
                if k in r and pd.notna(r.get(k)))
            cells.append(
                f'<figure>{pic}<figcaption><b>{e(r["款號"])}</b>'
                f'<span>{e(r.get("部位") or "")}　{e(coord)}</span>'
                f'{f"<u>{e(shape)}</u>" if shape else ""}'
                f'{f"<i>{e(nums)}</i>" if nums else ""}'
                f'<i>{e(r.get("分區重疊") or "")}</i></figcaption></figure>')
        hint = ('<b>這一區是被擋下來、不做位置判讀的圖。</b>'
                '這裡應該只有布料特寫、規格頁、章戳。'
                '如果您在這裡看到一件完整的衣服，那就是擋錯了 —— 跟我說是哪一號。'
                if zone == "非衣物" else
                '<b>藍框是偵測到的設計重點，灰框是衣服範圍。</b>'
                '框畫錯的、或分區判錯的，跟我說是哪一號。')
        blocks.append(
            f'<section><h2>{e(zone)}<span class="n">{sub["款號"].nunique():,} 款</span></h2>'
            f'<p class="sub">隨機抽 {len(show)} 件。{hint}</p>'
            f'<div class="grid">{"".join(cells)}</div></section>')

    tbl = "".join(
        f'<tr><td>{e(r["分區"])}</td><td class="n">{r["款數"]:,}</td>'
        f'<td class="n">{r["平均佔比"]:.1%}</td>'
        f'<td class="n">{r["可宣稱比例"]:.0%}</td></tr>'
        for _, r in _summary(df).iterrows())

    return f"""<title>設計重點定位 覆核</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Noto+Sans+TC:wght@400;600;700&family=Noto+Serif+TC:wght@700&display=swap">
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
body{{margin:0;background:var(--paper);color:var(--ink);font-size:15px;line-height:1.75;
 font-family:"Noto Sans TC","Microsoft JhengHei UI","Microsoft JhengHei","PingFang TC",-apple-system,"Segoe UI",sans-serif}}
.page{{max-width:1240px;margin:0 auto;padding:46px 20px 100px}}
h1{{font-family:"Noto Serif TC","Source Han Serif TC",Georgia,serif;font-size:30px;margin:0 0 10px}}
.dek{{color:var(--ink2);max-width:64ch;margin:0 0 22px}}
h2{{font-family:"Noto Serif TC","Source Han Serif TC",Georgia,serif;font-size:21px;margin:44px 0 2px}}
h2 .n{{font-family:"IBM Plex Mono",monospace;font-size:13px;color:var(--ink3);
 font-weight:400;margin-left:10px}}
.sub{{font-size:13px;color:var(--ink2);margin:0 0 12px;max-width:70ch}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:11px}}
figure{{margin:0;background:var(--panel);border:1px solid var(--rule);
 border-radius:5px;overflow:hidden}}
figure img{{width:100%;height:212px;object-fit:contain;background:#fff;display:block}}
.no{{height:212px;display:flex;align-items:center;justify-content:center;
 color:var(--ink3);font-size:11px;background:var(--rule2)}}
figcaption{{padding:6px 8px;font-size:11px;line-height:1.5;
 font-family:"IBM Plex Mono",monospace}}
figcaption b{{display:block;font-size:12px}}
figcaption span{{display:block;color:var(--ink2);font-size:10px}}
figcaption i{{display:block;color:var(--ink3);font-size:9.5px;font-style:normal}}
figcaption u{{display:block;color:var(--pos);font-size:10.5px;text-decoration:none;font-weight:500}}
table{{border-collapse:collapse;background:var(--panel);border:1px solid var(--rule);
 border-radius:4px;font-size:14px;min-width:400px;margin:8px 0 4px}}
th,td{{padding:8px 14px;border-bottom:1px solid var(--rule2);text-align:left}}
th{{font-size:11px;color:var(--ink3);font-weight:500;
 font-family:"IBM Plex Mono",monospace}}
td.n{{text-align:right;font-variant-numeric:tabular-nums;
 font-family:"IBM Plex Mono",monospace}}
tr:last-child td{{border-bottom:none}}
.note{{border-left:3px solid var(--wine);background:var(--panel);padding:15px 19px;
 margin:20px 0;border-radius:0 4px 4px 0;font-size:13.5px;color:var(--ink2);max-width:78ch}}
.note b{{color:var(--ink)}} .note p{{margin:0 0 9px}} .note p:last-child{{margin:0}}
</style>
<div class="page">
<h1>設計重點定位　覆核</h1>
<p class="dek">從 {df["款號"].nunique():,} 款系統圖量出設計重點落在衣服的哪一段。
<b>這份報表的工作不是說服，是讓您能否定它。</b></p>

<div class="note">
<p><b>怎麼做的。</b>「在哪裡」不交給 CLIP —— 系統圖是白底棚拍，衣服上的繡花與
印花本質上就是「一塊與衣服主色不同的區域」，那用像素就找得到。
CLIP 只負責回答那一塊「是什麼」。各自做自己擅長的。</p>
<p><b>分區依部位而定，不用固定九宮格。</b>長褲的上三分之一是腰與大腿，
上衣的上三分之一是領與肩 —— 同一個格子意義完全不同。</p>
<p><b>版型是量出來的，不是猜的。</b>領型看輪廓上緣中間那個缺口有多深多寬，
袖長看肩線到最寬處（袖口）的距離，衣長看肩線到下擺 —— 三個比例的分母
都是身寬，因為身寬跟領、袖都無關，是圖裡唯一穩定的尺標。
藍字是判定，灰字是量到的比例；比例對不上判定的，那是門檻要改。</p>
<p><b>重疊不到 {CLAIM_OVERLAP:.0%} 就不宣稱歸屬。</b>
「在口袋附近」不等於「在口袋」。那種情況會歸到「跨區未定」，
並附上座標與各區重疊比例，讓人自己判斷。</p>
</div>

<table><tr><th>分區</th><th>款數</th><th>平均佔衣服</th><th>敢宣稱的比例</th></tr>
{tbl}</table>
{"".join(blocks)}
</div>"""


def _summary(df: pd.DataFrame) -> pd.DataFrame:
    from ..vision.batch import summary
    return summary(df)

