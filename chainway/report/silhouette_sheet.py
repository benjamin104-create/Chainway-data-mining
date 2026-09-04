"""版型量測的證明圖：把量到的四條線畫回原圖上。

## 為什麼一定要有這一份

`locate` 有覆核圖（把偵測到的區域框出來），版型量測沒有。於是
「領型＝深 V／U 領」這種標籤只能整批相信或整批不信，中間沒有東西。

而版型量測特別需要被看，因為它**錯了也會給出一個很正常的標籤**。
一件連袖上衣被判成短袖，表上不會有任何異狀 —— 沒有信心分數變低、
沒有警告、沒有空值。它就只是錯了，然後那個錯誤會流進「短袖 +6pt」
那種結論裡。

實測過一次：我拿八張自己畫的圖去測，其中兩張的袖子和衣身糊在一起、
根本不是有效的測試圖，但程式照樣給了答案。**我看一眼就知道那兩張壞了，
程式不會。** 這份報表就是把那個「看一眼」還給人。

## 畫哪四條線

每一條都對應一個會影響標籤的量測步驟，所以線畫錯 = 標籤錯，
而且看得出來是哪一步錯：

    藍色橫線   肩線 —— 衣長與袖長都從這裡量起。這條畫在衣架上或
               畫到胸口，後面兩個數字全錯。
    紅色橫線   領口最深處。它與肩線的距離 ÷ 身寬 = 領深比。
    紅色直線   領口兩側寬度。÷ 身寬 = 領寬比。深與寬一起決定領型。
    綠色橫線   袖口（輪廓最寬的那一列）。到肩線的距離決定袖長。
    灰色直線   身寬 —— 上面每一個比例的分母。這條抓到袖子上，
               所有比例會一起偏小。

底下印出實際數值與判到的標籤。**看圖判斷線對不對，不要看標籤判斷。**
標籤是線推出來的，用標籤驗線是循環論證。
"""
from __future__ import annotations

import base64
import html
import io
from pathlib import Path
from typing import Any

import pandas as pd

THUMB = 260
# 每一種標籤抽幾張。抽樣而不是取前 N —— 前 N 張常常來自同幾季，
# 看起來很一致，會讓人誤以為規則很準。
PER_LABEL = 8

SHOULDER = (46, 110, 190)
NECK = (176, 48, 52)
CUFF = (32, 120, 70)
BODY = (130, 130, 130)


def e(s: Any) -> str:
    return html.escape(str(s))


def _draw(path: str | Path) -> tuple[str | None, dict[str, Any]]:
    """把量測的四條線畫在縮圖上。回傳 (data URI, 量到的值)。

    重新量一次而不是吃 CSV 的欄位 —— 這份的工作是證明「那些數字是
    這樣來的」，用另一條路算出來的數字去畫線，證明不了原來那條路。
    """
    try:
        from PIL import ImageDraw

        from ..imageio import load_rgb
        from ..vision.silhouette import (body_width, garment_mask, measure,
                                         width_profile, _shoulder_row)

        im = load_rgb(path)
        sil = measure(im)
        if not sil.get("可量測"):
            return None, sil

        mask, box = garment_mask(im)
        widths, lefts, rights = width_profile(mask, box)
        body = body_width(widths)
        sh = _shoulder_row(widths, body)

        # garment_mask 是在**縮小過的**副本上算的（實測一張 950px 高的圖，
        # mask 只有 320px 高），所以 box 與 profile 都是遮罩座標，不是
        # 影像像素。第一版直接把遮罩座標畫到原圖上，四條線全部擠在
        # 衣服上方 —— 而且它照樣產出了一份看起來很正常的報表。
        # 這正是這份報表要抓的那種錯，只是這次錯在報表自己身上。
        k = im.height / mask.shape[0]
        x1, y1, x2, y2 = (v * k for v in box)

        canvas = im.copy()
        d = ImageDraw.Draw(canvas)
        w = max(2, canvas.width // 220)
        bodypx = body * k

        # 肩線
        shy = y1 + sh * k
        d.line([(x1, shy), (x2, shy)], fill=SHOULDER, width=w)
        # 身寬（畫在下半身，量身寬取的就是那一段）
        my = y1 + (y2 - y1) * 0.75
        cx = (x1 + x2) / 2
        d.line([(cx - bodypx / 2, my), (cx + bodypx / 2, my)], fill=BODY, width=w)

        # 領口：深度與寬度。兩者都是「÷ 身寬」的比例，所以乘回身寬像素。
        dep = sil.get("領深比")
        if dep is not None and bodypx:
            ny = shy + float(dep) * bodypx
            d.line([(x1, ny), (x2, ny)], fill=NECK, width=w)
            gw = float(sil.get("領寬比") or 0) * bodypx
            d.line([(cx - gw / 2, shy), (cx - gw / 2, ny)], fill=NECK, width=w)
            d.line([(cx + gw / 2, shy), (cx + gw / 2, ny)], fill=NECK, width=w)

        # 袖口。袖長比的分母是 profile 的長度（＝外框高），不是身寬。
        r = sil.get("袖長比")
        if r:
            cy = shy + float(r) * len(widths) * k
            d.line([(x1, cy), (x2, cy)], fill=CUFF, width=w)

        canvas.thumbnail((THUMB, int(THUMB * 1.6)))
        buf = io.BytesIO()
        canvas.save(buf, "JPEG", quality=84)
        return ("data:image/jpeg;base64,"
                + base64.b64encode(buf.getvalue()).decode()), sil
    except Exception as exc:
        return None, {"可量測": False, "說明": f"{type(exc).__name__}: {exc}"}


def _card(row: pd.Series, img_root: dict[str, Path]) -> str:
    sku = str(row.get("款號", ""))
    p = img_root.get(sku)
    if p is None:
        return ""
    src, sil = _draw(p)
    if src is None:
        return (f'<figure class="c bad"><div class="noimg">量不到</div>'
                f'<figcaption><b>{e(sku)}</b>'
                f'<span>{e(sil.get("說明", ""))}</span></figcaption></figure>')
    nums = (f'領深 {sil.get("領深比")}　領寬 {sil.get("領寬比")}<br>'
            f'袖長比 {sil.get("袖長比")}　衣長比 {sil.get("衣長比")}<br>'
            f'身寬 {sil.get("身寬px")}px')
    return (f'<figure class="c"><img src="{src}" alt="{e(sku)}">'
            f'<figcaption><b>{e(sku)}</b>'
            f'<span class="lab">{e(sil.get("領型"))}／{e(sil.get("袖長"))}'
            f'／{e(sil.get("衣長"))}</span>'
            f'<span class="num">{nums}</span></figcaption></figure>')


def build(df: pd.DataFrame, images: dict[str, Path], *,
          per_label: int = PER_LABEL, seed: int = 20260904) -> str:
    """依「領型」分組抽樣，每一組排一列。

    依標籤分組是為了讓同一類的圖排在一起 —— 一整排都判成「深 V／U 領」
    而其中一張明顯是圓領，並排看一眼就會跳出來；混在一起看不出來。
    """
    groups: list[tuple[str, pd.DataFrame]] = []
    if "領型" in df.columns:
        for label, g in df[df["領型"].notna()].groupby("領型"):
            g = g.sample(min(len(g), per_label), random_state=seed)
            groups.append((str(label), g))
    groups.sort(key=lambda t: -len(t[1]))

    body = "".join(
        f'<h2>{e(label)}<span class="cnt">{len(df[df["領型"] == label]):,} 款'
        f'　抽 {len(g)} 張</span></h2>'
        f'<div class="row">{"".join(_card(r, images) for _, r in g.iterrows())}</div>'
        for label, g in groups)

    return f"""<title>版型量測　覆核</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Noto+Sans+TC:wght@400;500;600;700&family=Noto+Serif+TC:wght@700&display=swap">
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
 font-family:"Noto Sans TC","Microsoft JhengHei UI","PingFang TC",-apple-system,sans-serif}}
.page{{max-width:1400px;margin:0 auto;padding:52px 20px 110px}}
h1{{font-family:"Noto Serif TC",Georgia,serif;font-size:32px;margin:0 0 8px}}
.dek{{color:var(--ink2);max-width:66ch;margin:0 0 18px;font-size:16px}}
h2{{font-family:"Noto Serif TC",Georgia,serif;font-size:21px;margin:44px 0 10px;
 padding-top:16px;border-top:1px solid var(--rule)}}
h2 .cnt{{font-family:"IBM Plex Mono",monospace;font-size:12.5px;color:var(--ink3);
 font-weight:400;margin-left:12px}}
.row{{display:flex;gap:14px;flex-wrap:wrap}}
.c{{margin:0;width:{THUMB}px;background:var(--panel);border:1px solid var(--rule);
 border-radius:6px;padding:9px}}
.c img{{width:100%;border-radius:3px;display:block;background:#fff}}
.noimg{{aspect-ratio:2/3;border:1px dashed var(--rule);border-radius:3px;display:flex;
 align-items:center;justify-content:center;color:var(--ink3);font-size:12px}}
figcaption{{margin-top:7px;line-height:1.5}}
figcaption b{{display:block;font-size:12.5px;font-family:"IBM Plex Mono",monospace}}
.lab{{display:block;font-size:13px;color:var(--ink)}}
.num{{display:block;font-size:10.5px;color:var(--ink3);
 font-family:"IBM Plex Mono",monospace;line-height:1.5;margin-top:3px}}
.key{{border-left:3px solid var(--wine);background:var(--panel);padding:16px 20px;
 margin:18px 0 26px;border-radius:0 5px 5px 0;max-width:80ch}}
.key p{{margin:0 0 8px;font-size:14px;color:var(--ink2)}} .key p:last-child{{margin:0}}
.key b{{color:var(--ink)}}
.sw{{display:inline-block;width:26px;height:3px;vertical-align:3px;margin-right:6px}}
</style>
<div class="page">
<h1>版型量測　覆核</h1>
<p class="dek">量到的四條線畫回原圖上。<b>看線對不對，不要看標籤對不對</b> ——
標籤是線推出來的，用標籤驗線是循環論證。</p>

<div class="key">
<p><span class="sw" style="background:rgb(46,110,190)"></span><b>肩線</b>
衣長與袖長都從這裡量起。畫在衣架上或畫到胸口，後面兩個數字全錯。</p>
<p><span class="sw" style="background:rgb(176,48,52)"></span><b>領口</b>
橫線是最深處，兩條直線是兩側寬度。深與寬一起決定領型。</p>
<p><span class="sw" style="background:rgb(32,120,70)"></span><b>袖口</b>
輪廓最寬的那一列。到肩線的距離決定袖長。落肩與連袖沒有明顯最寬點，
這條會偏高、袖長會偏短。</p>
<p><span class="sw" style="background:rgb(130,130,130)"></span><b>身寬</b>
上面每一個比例的分母。這條抓到袖子上，所有比例會一起偏小。</p>
<p><b>看到畫錯的，把貨號記下來告訴我。</b>這份報表的工作不是說服您，
是讓您能否定它 —— 版型量測錯了也會給出一個看起來很正常的標籤，
沒有警告、沒有空值，只是錯了。</p>
</div>

{body}
</div>"""
