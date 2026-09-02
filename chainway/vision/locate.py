"""找出設計重點落在衣服的哪個位置。

## 為什麼「在哪裡」不交給 CLIP

CLIP 的向量把顏色、版型、材質、圖案全部揉在一起，問它「熊在胸前還是口袋」
它只能從整體印象猜。但這件事根本不需要模型：系統圖是白底棚拍，
衣服上的繡花、印花、貼布繡，本質上就是**一塊與衣服主色不同的區域**。
那是像素層面就找得到的東西。

所以分工是：

    在哪裡   傳統影像處理。找出與主色不同的區域，算它落在衣服的哪一段
    是什麼   Fashion-CLIP。只對那一小塊問「這是熊還是格紋還是蕾絲」

各自做自己擅長的。把定位也丟給 CLIP，等於用一個不確定的工具去做
一件確定的事。

## 分區怎麼定

不用固定的九宮格。九宮格對「一件上衣」與「一條長褲」意義完全不同 ——
長褲的上三分之一是腰與大腿，上衣的上三分之一是領與肩。
所以分區依品類而定，名稱用設計端的語言（領口／胸前／腰腹／下擺／袖／口袋區）。

而且回報的不只是分區名稱，還有**在衣服框裡的正規化座標與佔比**。
分區名稱是給人讀的，座標是給人驗的 —— 設計師可以自己判斷
「這個 y=0.28 到底算胸前還是算腰上」，而不是只能相信我的切法。

## 一個必須避開的錯誤

使用者指出過：「在口袋附近，不等於熊在口袋」。所以回報位置時，
只要重疊比例不夠高就不宣稱歸屬，改回報座標與最接近的分區，
並標明重疊程度。寧可說「胸前偏下、與口袋區重疊三成」，
也不要簡化成「在口袋」。
"""
from __future__ import annotations

from typing import Any, Sequence

import numpy as np

# 白底的門檻。棚拍背景有陰影與漸層，太嚴會把衣服邊緣切掉
BG_TOL = 26
# 一塊區域要佔衣服這麼多比例才算「設計重點」，再小多半是鈕釦或雜訊
MIN_BLOB_FRAC = 0.004
# 與衣服主色差多少才算不同（LAB 的 ΔE 概念，這裡用簡化的歐氏距離）
DEV_THRESHOLD = 18.0
# 分析用的縮圖尺寸。位置是相對的，不需要原解析度，而且要跑幾千張
WORK_SIZE = 320


def _to_array(img) -> np.ndarray:
    im = img.convert("RGB")
    im.thumbnail((WORK_SIZE, WORK_SIZE))
    return np.asarray(im).astype(np.float64)


def garment_mask(img) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    """回傳 (衣服遮罩, 衣服外框)。外框是 (x1, y1, x2, y2)。

    背景色取四角中位數而不是寫死白色 —— 系統圖多半白底，
    但偶爾是淺灰或米色，寫死會整張判成前景。
    """
    a = _to_array(img)
    h, w = a.shape[:2]
    k = max(3, min(h, w) // 20)
    bg = np.median(np.concatenate([
        a[:k, :k].reshape(-1, 3), a[:k, -k:].reshape(-1, 3),
        a[-k:, :k].reshape(-1, 3), a[-k:, -k:].reshape(-1, 3)]), axis=0)
    mask = np.abs(a - bg).max(axis=2) > BG_TOL

    rows = np.where(mask.mean(axis=1) > 0.02)[0]
    cols = np.where(mask.mean(axis=0) > 0.02)[0]
    if len(rows) < 4 or len(cols) < 4:
        return mask, (0, 0, w, h)
    return mask, (int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1)


# 分區依品類而定。數值是「在衣服外框裡的相對範圍」(y起, y迄, x起, x迄)。
# 刻意重疊：胸前與腰腹的界線因版型而異，硬切會讓落在交界的東西無處可歸。
ZONES: dict[str, list[tuple[str, float, float, float, float]]] = {
    "上衣": [
        ("領口",   0.00, 0.16, 0.25, 0.75),
        ("肩",     0.00, 0.18, 0.00, 1.00),
        ("胸前",   0.14, 0.45, 0.20, 0.80),
        ("腰腹",   0.42, 0.72, 0.20, 0.80),
        ("下擺",   0.70, 1.00, 0.10, 0.90),
        ("左袖",   0.10, 0.75, 0.00, 0.22),
        ("右袖",   0.10, 0.75, 0.78, 1.00),
        ("口袋區", 0.38, 0.68, 0.08, 0.45),
    ],
    "下身": [
        ("腰頭",   0.00, 0.14, 0.00, 1.00),
        ("口袋區", 0.06, 0.32, 0.00, 0.40),
        ("大腿",   0.14, 0.55, 0.10, 0.90),
        ("膝下",   0.55, 0.88, 0.10, 0.90),
        ("褲裙口", 0.86, 1.00, 0.05, 0.95),
    ],
    "洋裝": [
        ("領口",   0.00, 0.12, 0.25, 0.75),
        ("胸前",   0.10, 0.32, 0.20, 0.80),
        ("腰",     0.30, 0.50, 0.15, 0.85),
        ("裙身",   0.48, 0.85, 0.05, 0.95),
        ("下擺",   0.83, 1.00, 0.05, 0.95),
        ("袖",     0.08, 0.45, 0.00, 0.20),
    ],
}
# 品類 → 用哪一組分區
CATEGORY_ZONES = {
    "梭織上衣": "上衣", "棉T": "上衣", "針織": "上衣", "外套": "上衣",
    "褲": "下身", "裙": "下身", "洋裝": "洋裝",
}


def zones_for(category: str | None) -> list[tuple[str, float, float, float, float]]:
    return ZONES[CATEGORY_ZONES.get(str(category), "上衣")]


def _erode(mask: np.ndarray, k: int = 3) -> np.ndarray:
    """把遮罩往內縮 k 圈。

    非做不可：衣服的輪廓是反鋸齒的，邊緣像素是衣服色與背景色的混合，
    對主色的偏差極大。不內縮的話，每一件素色衣服都會被偵測成
    「輪廓上有一圈裝飾」—— 實測合成的純素色上衣就中招了。
    """
    out = mask
    for _ in range(k):
        e = out.copy()
        e[1:, :] &= out[:-1, :]
        e[:-1, :] &= out[1:, :]
        e[:, 1:] &= out[:, :-1]
        e[:, :-1] &= out[:, 1:]
        out = e
    return out


def find_decorations(img, *, dev_threshold: float = DEV_THRESHOLD,
                     min_frac: float = MIN_BLOB_FRAC) -> list[dict[str, Any]]:
    """找出衣服上與主色不同的區域。

    主色取遮罩內的中位數而不是平均 —— 平均會被大面積的裝飾拉走，
    中位數對「大部分是素色、局部有圖案」這個情境穩定得多。
    """
    a = _to_array(img)
    mask, (x1, y1, x2, y2) = garment_mask(img)
    inside = _erode(mask, 3)
    inside[:y1] = inside[y2:] = False
    inside[:, :x1] = inside[:, x2:] = False
    if inside.sum() < 200:
        return []

    base = np.median(a[inside], axis=0)
    dev = np.linalg.norm(a - base, axis=2)
    blob = inside & (dev > dev_threshold)
    total = inside.sum()
    if blob.sum() < total * min_frac:
        return []

    labels = _label(blob)
    out = []
    bw, bh = max(x2 - x1, 1), max(y2 - y1, 1)
    for lab in range(1, labels.max() + 1):
        sel = labels == lab
        area = int(sel.sum())
        if area < total * min_frac:
            continue
        ys, xs = np.nonzero(sel)
        cy, cx = ys.mean(), xs.mean()
        out.append({
            "面積佔衣服": round(area / total, 4),
            # 正規化到衣服外框內：0 是最上／最左，1 是最下／最右
            "y": round(float((cy - y1) / bh), 3),
            "x": round(float((cx - x1) / bw), 3),
            "高佔比": round(float((ys.max() - ys.min() + 1) / bh), 3),
            "寬佔比": round(float((xs.max() - xs.min() + 1) / bw), 3),
            "平均色": [round(float(v), 1) for v in a[sel].mean(axis=0)],
            "_bbox_norm": (round(float((xs.min() - x1) / bw), 3),
                           round(float((ys.min() - y1) / bh), 3),
                           round(float((xs.max() - x1) / bw), 3),
                           round(float((ys.max() - y1) / bh), 3)),
        })
    return sorted(out, key=lambda d: -d["面積佔衣服"])


def _label(mask: np.ndarray) -> np.ndarray:
    """連通區域標記。用 scipy 有就用，沒有就用自己的兩趟掃描版本。

    不強制依賴 scipy：這個專案已經有不少相依，而連通標記本身
    幾十行就寫得完，為它多裝一個套件不划算。
    """
    try:
        from scipy import ndimage
        return ndimage.label(mask)[0]
    except ImportError:
        pass

    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    parent: dict[int, int] = {}

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    nxt = 1
    for y in range(h):
        for x in range(w):
            if not mask[y, x]:
                continue
            up = labels[y - 1, x] if y else 0
            left = labels[y, x - 1] if x else 0
            if up and left:
                labels[y, x] = min(up, left)
                union(up, left)
            elif up or left:
                labels[y, x] = up or left
            else:
                labels[y, x] = nxt
                parent[nxt] = nxt
                nxt += 1

    remap: dict[int, int] = {}
    out = np.zeros_like(labels)
    for y in range(h):
        for x in range(w):
            if labels[y, x]:
                root = find(labels[y, x])
                if root not in remap:
                    remap[root] = len(remap) + 1
                out[y, x] = remap[root]
    return out


def zone_overlap(blob: dict[str, Any], category: str | None
                 ) -> list[tuple[str, float]]:
    """一塊裝飾與各分區的重疊比例，由大到小。

    回傳比例而不是只回傳「最像哪一區」—— 使用者指出過
    「在口袋附近不等於在口袋」，所以重疊程度必須攤出來讓人判斷。
    """
    bx1, by1, bx2, by2 = blob["_bbox_norm"]
    area = max((bx2 - bx1) * (by2 - by1), 1e-6)
    out = []
    for name, zy1, zy2, zx1, zx2 in zones_for(category):
        ox = max(0.0, min(bx2, zx2) - max(bx1, zx1))
        oy = max(0.0, min(by2, zy2) - max(by1, zy1))
        if ox > 0 and oy > 0:
            zone_area = (zy2 - zy1) * (zx2 - zx1)
            out.append((name, round(ox * oy / area, 3), zone_area))
    # 重疊相同時，範圍小的分區優先。口袋區整個落在腰腹裡面，
    # 兩者都 100% 重疊時該說「口袋」而不是「腰腹」—— 講得具體才有用。
    # 重疊不同時仍以重疊為準，所以「腰腹 100%、口袋 29%」還是判腰腹。
    out.sort(key=lambda t: (-t[1], t[2]))
    return [(n, v) for n, v, _ in out]


# 重疊要到這個程度才敢說「在這一區」。低於此只報座標與最接近的區。
CLAIM_OVERLAP = 0.55


def locate(img, category: str | None = None, *, top: int = 3) -> dict[str, Any]:
    """一張系統圖 → 設計重點在哪裡。

    回傳
        裝飾   由大到小的區塊，每塊帶座標、佔比、重疊分區
        描述   一句話，措辭與證據強度一致（重疊不夠就不說「在某區」）
    """
    blobs = find_decorations(img)[:top]
    if not blobs:
        return {"裝飾": [], "描述": "整件素色，沒有偵測到明顯的局部設計"}

    items = []
    for b in blobs:
        ov = zone_overlap(b, category)
        best = ov[0] if ov else ("", 0.0)
        items.append({**{k: v for k, v in b.items() if not k.startswith("_")},
                      "分區重疊": ov[:3],
                      "主要分區": best[0], "重疊比例": best[1],
                      "可宣稱": bool(best[1] >= CLAIM_OVERLAP)})
    top1 = items[0]
    if top1["可宣稱"]:
        desc = (f"設計重點在{top1['主要分區']}"
                f"（佔衣服 {top1['面積佔衣服']:.1%}，"
                f"與該區重疊 {top1['重疊比例']:.0%}）")
    else:
        near = "、".join(f"{n} {v:.0%}" for n, v in top1["分區重疊"][:2])
        desc = (f"設計重點落在 x={top1['x']}、y={top1['y']}，"
                f"橫跨 {near}；重疊都不到 {CLAIM_OVERLAP:.0%}，不歸單一分區")
    return {"裝飾": items, "描述": desc}
