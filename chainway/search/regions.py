"""把穿搭照切成「可以拿去比對單品」的區塊。

為什麼需要這個：查詢端是穿搭照（模特兒、臉、腿、背景牆、還穿著別款下身），
索引端是單件去背棚拍。整張照片壓成一個向量，外套可能只佔三成畫面，
其餘七成都是雜訊 —— 相似度被稀釋，排名就沒有意義。

這裡不用物件偵測模型（多一個幾百 MB 的相依、還要另外下載），
改用兩個對「站姿全身照」幾乎必然成立的結構假設：

  1. 背景是大片相近的顏色（棚拍白牆、純色背景），從四邊往內縮就能框出人
  2. 人是直立的，上身在上、下身在下，橫向切帶就能分開單品

這兩點在時尚攝影裡穩定成立，成本近乎零。真的要更準，下一步才是換成
人體解析模型（human parsing），那是另一個量級的工程。
"""
from __future__ import annotations

import numpy as np

# 邊界顏色與背景的容差。棚拍背景有漸層與陰影，抓太緊會把人的邊緣也切掉。
BG_TOL = 26
# 一列／一欄裡有多少比例不是背景，才算「有東西」
FG_ROW_FRAC = 0.06
# 切出來的區塊至少要有原圖這麼大，太小的碎片拿去比對只會是雜訊
MIN_AREA_FRAC = 0.04


def _bg_color(a: np.ndarray) -> np.ndarray:
    """取四個角落的中位數當背景色。人在中間，角落幾乎必為背景。"""
    h, w = a.shape[:2]
    k = max(4, min(h, w) // 20)
    corners = np.concatenate([
        a[:k, :k].reshape(-1, 3), a[:k, -k:].reshape(-1, 3),
        a[-k:, :k].reshape(-1, 3), a[-k:, -k:].reshape(-1, 3),
    ])
    return np.median(corners, axis=0)


def subject_bbox(img) -> tuple[int, int, int, int]:
    """框出畫面裡的主體，回傳 (x1, y1, x2, y2)。

    抓不到就回傳整張圖 —— 去背的系統圖本身幾乎全是背景，
    這時硬切反而會切壞，原圖返回才是對的。
    """
    a = np.asarray(img.convert("RGB")).astype(np.int16)
    h, w = a.shape[:2]
    fg = np.abs(a - _bg_color(a)).max(axis=2) > BG_TOL

    rows = np.where(fg.mean(axis=1) > FG_ROW_FRAC)[0]
    cols = np.where(fg.mean(axis=0) > FG_ROW_FRAC)[0]
    if len(rows) < h * 0.1 or len(cols) < w * 0.1:
        return (0, 0, w, h)
    return (int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1)


def garment_regions(img, include_whole: bool = True) -> list[tuple[str, object]]:
    """回傳 [(區塊名稱, PIL 影像)]，涵蓋整張、主體、上身、下身、中段。

    刻意保留「整張」：查詢圖若本來就是單件去背圖，切帶反而會切壞，
    保留整張當其中一個候選，聚合時取最高分，就不會比原本更差。
    """
    out: list[tuple[str, object]] = []
    if include_whole:
        out.append(("整張", img))

    x1, y1, x2, y2 = subject_bbox(img)
    sw, sh = x2 - x1, y2 - y1
    if sw <= 0 or sh <= 0:
        return out

    subject = img.crop((x1, y1, x2, y2))
    full_area = img.width * img.height

    # 橫向切帶。比例抓寬一點並刻意重疊 —— 外套下襬落在哪裡因款而異，
    # 切太準反而會把下襬切掉，重疊可以確保每一件都至少完整落在某一帶裡。
    bands = [
        ("主體", 0.00, 1.00),
        ("上身", 0.08, 0.62),   # 從肩線下方起算，避開頭與臉
        ("中段", 0.25, 0.80),
        ("下身", 0.45, 1.00),
    ]
    for name, top, bottom in bands:
        by1, by2 = int(sh * top), int(sh * bottom)
        if by2 - by1 < 16:
            continue
        crop = subject.crop((0, by1, sw, by2))
        if crop.width * crop.height < full_area * MIN_AREA_FRAC:
            continue
        out.append((name, crop))
    return out
