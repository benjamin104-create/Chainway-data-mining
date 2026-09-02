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

from ..imageio import to_rgb

# 白底的門檻。棚拍背景有陰影與漸層，太嚴會把衣服邊緣切掉
BG_TOL = 55
# 一塊區域要佔衣服這麼多比例才算「設計重點」，再小多半是鈕釦或雜訊
MIN_BLOB_FRAC = 0.004
# 與衣服主色差多少才算「另一塊東西」。
# 實拍照有陰影與皺褶，門檻太低會把陰影當成裝飾；改成依衣服本身的
# 色彩離散度自動調整，只把「明顯不是同一塊布」的留下來。
DEV_MIN = 45.0
DEV_MAD_K = 6.0
# 分析用的縮圖尺寸。位置是相對的，不需要原解析度，而且要跑幾千張
WORK_SIZE = 320


def _to_array(img) -> np.ndarray:
    im = to_rgb(img).copy()
    im.thumbnail((WORK_SIZE, WORK_SIZE))
    return np.asarray(im).astype(np.float64)


def garment_mask(img) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    """回傳 (衣服遮罩, 衣服外框)。

    背景色取**整圈邊框**的中位數，不只四角 —— 實拍照片的四角可能剛好
    是陰影或另一件衣服的一角，整圈穩得多。

    再取最大的連通區域當衣服。實拍照裡除了衣服還有牆面反光、吊牌、
    另一件衣服的邊角，全部算進來會讓「衣服主色」被污染。
    """
    a = _to_array(img)
    h, w = a.shape[:2]
    r = max(3, min(h, w) // 40)
    ring = np.concatenate([a[:r].reshape(-1, 3), a[-r:].reshape(-1, 3),
                           a[:, :r].reshape(-1, 3), a[:, -r:].reshape(-1, 3)])
    bg = np.median(ring, axis=0)
    fg = np.linalg.norm(a - bg, axis=2) > BG_TOL

    labels = _label(fg)
    if labels.max() == 0:
        return fg, (0, 0, w, h)
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    mask = labels == int(sizes.argmax())

    ys, xs = np.nonzero(mask)
    if len(ys) < 50:
        return mask, (0, 0, w, h)
    return mask, (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


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


def find_decorations(img, *, min_frac: float = MIN_BLOB_FRAC) -> list[dict[str, Any]]:
    """找出衣服上「明顯不是同一塊布」的區域。

    門檻自動調整：取衣服內部色彩對主色的偏差中位數（MAD），
    再乘一個係數。素色衣服的 MAD 很小，門檻就低、抓得到細緻的繡花；
    格紋或印花滿版的衣服 MAD 很大，門檻自動升高，才不會整件都判成裝飾。
    寫死一個門檻在這兩種衣服之間必然有一種會壞掉。
    """
    a = _to_array(img)
    mask, (x1, y1, x2, y2) = garment_mask(img)
    core = _erode(mask, 6)
    if core.sum() < 200:
        core = _erode(mask, 2)
    if core.sum() < 100:
        return []

    base = np.median(a[core], axis=0)
    dev = np.linalg.norm(a - base, axis=2)
    mad = float(np.median(dev[core])) or 1.0
    thr = max(DEV_MIN, mad * DEV_MAD_K)

    blob = core & (dev > thr)
    total = int(core.sum())
    if blob.sum() < total * min_frac:
        return []

    labels = _label(blob)
    bw, bh = max(x2 - x1, 1), max(y2 - y1, 1)
    out = []
    for lab in range(1, labels.max() + 1):
        sel = labels == lab
        area = int(sel.sum())
        if area < total * min_frac:
            continue
        ys, xs = np.nonzero(sel)
        # 吊架、掛勾、吊牌會從衣服輪廓的最上緣冒出來。真正的設計元素
        # （連領口滾邊也是）不會頂到剪影的最上緣。標記而不是直接丟掉 ——
        # 判斷交給人，程式只負責把證據攤開。
        hanger_like = bool(ys.min() <= y1 + 2)
        out.append({
            "面積佔衣服": round(area / total, 4),
            "y": round(float((ys.mean() - y1) / bh), 3),
            "x": round(float((xs.mean() - x1) / bw), 3),
            "高佔比": round(float((ys.max() - ys.min() + 1) / bh), 3),
            "寬佔比": round(float((xs.max() - xs.min() + 1) / bw), 3),
            "平均色": [round(float(v), 1) for v in a[sel].mean(axis=0)],
            "疑似吊架": hanger_like,
            "_bbox_norm": (round(float((xs.min() - x1) / bw), 3),
                           round(float((ys.min() - y1) / bh), 3),
                           round(float((xs.max() - x1) / bw), 3),
                           round(float((ys.max() - y1) / bh), 3)),
        })
    # 疑似吊架的一律排到後面，不讓它佔走「主要設計重點」的位置
    return sorted(out, key=lambda d: (d["疑似吊架"], -d["面積佔衣服"]))


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


def is_garment_shot(img) -> tuple[bool, str]:
    """這張圖是不是一件完整的衣服。不是的話，位置這個問題本身就沒有意義。

    定位假設「畫面裡有一件衣服，而且看得到它的輪廓」。拿那 10 張真實圖一驗，
    這個假設在多數圖上根本不成立，而定位照樣給出斬釘截鐵的答案：

        格紋布料特寫    → 「設計重點在胸前（重疊 100%）」
        另一塊布料特寫  → 「設計重點在左袖（重疊 100%）」
        繡花規格頁      → 「設計重點在腰腹（重疊 91%）」

    量測本身沒壞 —— 布紋上確實有一塊顏色不同的區域，它確實落在畫面上三分之一。
    壞的是「畫面上三分之一 = 胸前」這個前提。一個會對非衣服的圖給出高信心
    答案的定位，跑完整個影像庫之後產出的位置分析，錯得無聲無息。

    所以定位前先擋一道，判斷依據跟圖片分類同一套（`ingest.image_kind`），
    不另立一套會漂移的規則。
    """
    from ..ingest.image_kind import _stats, HAS_BG_EDGE, HAS_BG_RING_SD

    try:
        s = _stats(img)
    except Exception:
        return False, "圖片讀不到，無法判斷"
    if s["edge_bg"] < HAS_BG_EDGE or s["ring_sd"] > HAS_BG_RING_SD:
        return False, "畫面沒有背景，看起來是布料或細部特寫，不是整件衣服"
    if s["aspect"] < 1.0:
        return False, "主體是橫向的，看起來是版面或規格頁，不是一件直立的衣服"
    return True, ""


def locate(img, category: str | None = None, *, top: int = 3,
           gate: bool = True) -> dict[str, Any]:
    """一張系統圖 → 設計重點在哪裡。

    回傳
        裝飾   由大到小的區塊，每塊帶座標、佔比、重疊分區
        描述   一句話，措辭與證據強度一致（重疊不夠就不說「在某區」）

    `gate=False` 只在覆核工具裡用 —— 用來看「如果不擋，它會答成什麼樣」。
    """
    if gate:
        ok, why = is_garment_shot(img)
        if not ok:
            return {"裝飾": [], "描述": f"不判位置：{why}", "非衣物": True}
    blobs = find_decorations(img)
    real = [b for b in blobs if not b["疑似吊架"]]
    if not real:
        note = ("整件素色，沒有偵測到明顯的局部設計" if not blobs
                else "只偵測到疑似吊架／吊牌，衣服本身沒有明顯的局部設計")
        return {"裝飾": [], "描述": note,
                "疑似非衣物": [b for b in blobs if b["疑似吊架"]][:2]}
    blobs = real[:top]

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
