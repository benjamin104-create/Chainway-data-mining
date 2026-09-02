"""判斷一張從指示書抽出來的圖是什麼東西。

## 為什麼要重寫

第一版只看檔案格式與尺寸：

    if fmt in ("jpeg", "jpg") and max(width, height) >= 600:
        return "打樣照片"

任何大於 600px 的 JPEG 都算打樣照片。結果繡花圖稿、布樣特寫、核可章戳、
掃描頁全被貼上同一個標籤。以圖搜貨號的零標註評測就建立在這個標籤上，
於是「測試題」多半不是衣服照片 —— 等於拿一張刺繡線稿去找整件衣服的系統圖。
Top-1 1.29% 量到的是測試集壞掉，不是檢索能力差。

尺寸與格式跟「這是什麼」幾乎無關。要判斷內容，就得看內容。

## 判斷依據

四個從像素直接算得出來、彼此不重疊的訊號：

    白底比例    近白像素佔多少。棚拍照與線稿都白底，但線稿高得多
    主體佔比    subject_bbox 框出的區域佔畫面多少
    主體長寬比  衣服是直立的；布樣與章戳接近正方
    彩度        線稿幾乎無彩；布樣與衣服有彩

單一訊號都會誤判，組合起來才穩。順序上先排除最好認的（布樣填滿整個畫面、
線稿白底無彩），最後才認打樣照片 —— 寧可漏收也不要誤收，因為誤收一張
就會在評測裡變成一題永遠答不對的題目。

## 這件事的成本不對稱

漏判一張真的打樣照片：測試集少一題，沒有損失。
誤判一張布樣成打樣照片：評測分數被拉低，而且會讓人以為模型不行。

所以門檻刻意偏嚴。`STRICT_PHOTO` 關掉可以放寬，但預設是嚴的。
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

# 近白的門檻。棚拍背景有陰影與漸層，230 比 245 穩。
WHITE = 230
# 布樣：主體幾乎填滿畫面
SWATCH_FILL = 0.88
# 線稿／圖稿：白底佔比高於此，且幾乎沒有彩度
LINEART_WHITE = 0.62
LINEART_SAT = 22
# 打樣照片：主體要佔畫面這麼多，且是直立的
PHOTO_FILL_MIN = 0.12
PHOTO_FILL_MAX = 0.94
PHOTO_MIN_PX = 400


def _stats(img) -> dict[str, float]:
    """算出四個判斷訊號。縮到 256px 再算 —— 判斷用不到原解析度，
    而抽圖動輒六千多張，逐張全解析度計算會慢得不合理。"""
    from ..search.regions import subject_bbox

    small = img.convert("RGB")
    small.thumbnail((256, 256))
    a = np.asarray(small).astype(np.int16)
    h, w = a.shape[:2]

    nonwhite = a.min(axis=2) < WHITE
    white = 1.0 - float(nonwhite.mean())

    # 彩度只看非白像素。整張取中位數會被白底洗掉 —— 一件藍外套躺在白背景上，
    # 全畫面中位彩度是 0，看起來就跟線稿一樣。判斷「這東西有沒有顏色」時，
    # 背景不是證據。取 75 百分位而非中位數：衣服上本來就有陰影與白色細節。
    sat = (float(np.percentile((a.max(axis=2) - a.min(axis=2))[nonwhite], 75))
           if nonwhite.any() else 0.0)

    x1, y1, x2, y2 = subject_bbox(small)
    bw, bh = max(x2 - x1, 1), max(y2 - y1, 1)
    return {"white": white, "sat": sat,
            "fill": (bw * bh) / float(w * h),
            "aspect": bh / bw,
            "w": img.size[0], "h": img.size[1]}


def classify(path: str | Path, *, strict_photo: bool = True) -> tuple[str, dict[str, Any]]:
    """回傳 (分類, 判斷依據)。依據一併回傳，讓人能覆核而不是只能相信。"""
    try:
        from PIL import Image
        with Image.open(path) as im:
            im.load()
            s = _stats(im)
    except Exception as exc:                      # .wdp 等格式 PIL 開不了
        return "無法解析", {"error": type(exc).__name__}

    longest = max(s["w"], s["h"])

    # 章戳：小張、而且大半是白的 —— 一個蓋在空白處的印記。
    # 不能用彩度判：紅色印章的非白像素彩度很高，跟一件紅衣服一樣高。
    # 「小」加上「白底佔多數」才是章戳獨有的組合（布樣白底近乎 0，
    # 打樣照片則有 PHOTO_MIN_PX 的下限擋著，不會落進這一格）。
    if longest < 320 and s["white"] >= 0.60:
        return "章戳/標記", s

    # 布樣：主體塞滿畫面 —— 布料特寫沒有背景可言
    if s["fill"] >= SWATCH_FILL and s["sat"] >= 18:
        return "布樣", s

    # 線稿／繡花圖稿：大片白底加上幾乎沒有彩度
    if s["white"] >= LINEART_WHITE and s["sat"] < LINEART_SAT:
        return "圖稿/線稿", s

    # 打樣照片：主體直立、佔畫面合理比例、有彩度、夠大
    tall = s["aspect"] >= (1.05 if strict_photo else 0.85)
    if (longest >= PHOTO_MIN_PX and tall
            and PHOTO_FILL_MIN <= s["fill"] <= PHOTO_FILL_MAX
            and s["sat"] >= 18):
        return "打樣照片", s

    return "其他", s


def classify_frame(df, *, path_col: str = "image_path",
                   strict_photo: bool = True):
    """整批重新分類，並保留判斷依據欄位供覆核。

    刻意獨立成一支函式：抽圖是慢的（要解壓縮六千多張），分類是快的。
    分開之後可以只重跑分類、不必重抽，調門檻的迭代成本才低。
    """
    import pandas as pd

    kinds, ev = [], []
    for p in df[path_col].astype(str):
        k, s = classify(p, strict_photo=strict_photo)
        kinds.append(k)
        ev.append(s)
    out = df.copy()
    out["kind"] = kinds
    for key in ("white", "sat", "fill", "aspect"):
        out[f"_{key}"] = [round(float(e.get(key, float("nan"))), 3) for e in ev]
    return out
