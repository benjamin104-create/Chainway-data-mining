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

從像素直接算得出來、彼此不重疊的訊號：

    有沒有背景  邊框是不是同一個均勻的顏色。布樣沒有背景，布紋長到四個邊
    白底比例    近白像素佔多少。棚拍照與線稿都白底，但線稿高得多
    顏色種類    量化到 32 階後有幾種。章戳是單一油墨，種類極少
    主體長寬比  衣服是直立的；版面與布樣多半是橫的
    彩度        線稿幾乎無彩；布樣與衣服有彩

單一訊號都會誤判，組合起來才穩。順序上先判「有沒有背景」—— 這是最硬的
事實，而且布樣一旦沒排掉，它的白底比例與彩度都會誤導後面每一條規則。

## 第二次重寫：用「主體佔畫面」判布樣是錯的

原本布樣的條件是 `fill >= 0.88`（主體塞滿畫面）。那是白底棚拍才成立的
假設。拿真實照片一驗就破 —— 衣服掛在牆上拍，衣服本來就佔滿畫面：

    海軍藍熊 T（461×508，真實照片）  fill 0.91  → 判「布樣」

也就是說，凡是真實照片一律被排除在後續的定位與檢索之外。改用「邊框是不是
一個均勻的背景色」之後，同一張圖判「打樣照片」，而五張布料特寫仍然判布樣。

同一次還修掉一個更沉默的錯：PIL 的 `convert("RGB")` 把透明像素變成黑色，
帶透明背景的 PNG（章戳、去背圖稿）整片背景變全黑，白底比例量成 0.00。
載圖統一走 `chainway.imageio.to_rgb`，先合成到白底。

## 這件事的成本不對稱

漏判一張真的打樣照片：測試集少一題，沒有損失。
誤判一張布樣成打樣照片：評測分數被拉低，而且會讓人以為模型不行。

所以門檻刻意偏嚴。`STRICT_PHOTO` 關掉可以放寬，但預設是嚴的。

## 門檻的來源，以及它還沒被驗到什麼程度

現行門檻是從 10 張真實圖（1 張衣服照、5 張布樣、2 枚章戳、1 張繡花規格頁、
1 張細部特寫）加上合成的白底系統圖上量出來的，全對。10 張不是驗證，是校準。
真正的覆核要靠 `reclassify-images` 產出的對照表 —— 那份表就是為了讓人
一眼否定它而做的。

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
# 背景色的容差（0–255，取三通道最大差）
BG_TOL = 55
# 「這張圖有背景」：邊框大半貼近同一個色，而且那個色本身夠均勻。
# 兩個條件都要成立 —— 只看 edge_bg，一塊素色布也會通過。
HAS_BG_EDGE = 0.70
HAS_BG_RING_SD = 20.0
# 章戳：單一油墨蓋在白紙上，量化後的顏色種類極少
STAMP_NCOLOR = 24
STAMP_WHITE = 0.55
# 線稿／圖稿：白底佔比高於此，且幾乎沒有彩度
LINEART_WHITE = 0.62
LINEART_SAT = 22
# 打樣照片：主體要佔畫面這麼多，且是直立的
PHOTO_FILL_MIN = 0.12
PHOTO_FILL_MAX = 0.94
PHOTO_MIN_PX = 400


def _background(a: np.ndarray) -> tuple[float, float]:
    """量「這張圖有沒有背景」。回傳 (邊框是背景的比例, 邊框自身的雜亂度)。

    這是布樣與衣服照片唯一可靠的分野。原本用 `fill >= 0.88`（主體塞滿畫面）
    判布樣，那是白底棚拍才成立的假設 —— 真實照片是衣服掛在牆上拍的，
    衣服本來就佔滿畫面，於是每一張真實照片都被判成布樣。實測那張
    海軍藍熊 T：fill 0.91，判「布樣」。

    布料特寫沒有背景可言：布紋一路長到四個邊，所以邊框自己就很花
    （ring_sd 48–76），而且只有一部分像素貼近邊框中位色（edge_bg 0.34–0.57）。
    衣服掛在牆上拍：邊框幾乎全是牆（edge_bg 0.96），牆本身很均勻（ring_sd 9）。
    """
    ring = np.concatenate([a[:3].reshape(-1, 3), a[-3:].reshape(-1, 3),
                           a[:, :3].reshape(-1, 3), a[:, -3:].reshape(-1, 3)])
    bg = np.median(ring, axis=0)
    ring_sd = float(np.median(np.abs(ring - bg).max(axis=1)))
    dist = np.abs(a - bg).max(axis=2)
    edge = np.concatenate([(dist[:3] <= BG_TOL).ravel(),
                           (dist[-3:] <= BG_TOL).ravel(),
                           (dist[:, :3] <= BG_TOL).ravel(),
                           (dist[:, -3:] <= BG_TOL).ravel()])
    return float(edge.mean()), ring_sd


def _stats(img) -> dict[str, float]:
    """算出判斷訊號。縮到 256px 再算 —— 判斷用不到原解析度，
    而抽圖動輒六千多張，逐張全解析度計算會慢得不合理。"""
    from ..search.regions import subject_bbox
    from ..imageio import to_rgb

    small = to_rgb(img).copy()
    small.thumbnail((256, 256))
    a = np.asarray(small).astype(np.int16)
    h, w = a.shape[:2]

    nonwhite = a.min(axis=2) < WHITE
    white = 1.0 - float(nonwhite.mean())
    edge_bg, ring_sd = _background(a)
    # 顏色種類（量化到 32 階）。章戳是單一油墨蓋在白紙上，種類極少
    # （實測「可生產大貨」8 種、另一枚 16 種），衣服照片與彩色圖稿
    # 都在 60 種以上。用種類數判章戳，比用尺寸判穩得多 ——
    # 同一枚章戳在不同指示書裡被截成不同大小，種類數不會變。
    q = (a // 32).astype(np.int32)
    ncolor = int(len(np.unique(q[:, :, 0] * 64 + q[:, :, 1] * 8 + q[:, :, 2])))

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
            "edge_bg": edge_bg, "ring_sd": ring_sd, "ncolor": float(ncolor),
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
    has_bg = (s["edge_bg"] >= HAS_BG_EDGE and s["ring_sd"] <= HAS_BG_RING_SD)

    # 布樣：沒有背景可言 —— 布紋一路長到四個邊。
    # 先判這一條，因為「有沒有背景」是最硬的事實，其餘的訊號（白底比例、
    # 彩度）在布料上都會給出誤導的值：一塊米白格紋布的白底比例很高，
    # 用白底判會被歸到線稿去。
    if not has_bg:
        return "布樣", s

    # 章戳：單一油墨蓋在白紙上 —— 顏色種類極少，而且大半是白的。
    # 不能用彩度判：紅色印章的非白像素彩度很高，跟一件紅衣服一樣高。
    # 也不能用尺寸判：同一枚章戳在不同指示書裡被截成不同大小，
    # 原本的 `longest < 320` 讓 481px 的「可生產大貨」漏掉了。
    if s["ncolor"] <= STAMP_NCOLOR and s["white"] >= STAMP_WHITE:
        return "章戳/標記", s

    # 線稿／繡花圖稿：大片白底加上幾乎沒有彩度
    if s["white"] >= LINEART_WHITE and s["sat"] < LINEART_SAT:
        return "圖稿/線稿", s

    # 版面／彩色圖稿：白紙上的排版（繡花規格頁、配色表），橫幅居多，
    # 而且不是一件直立的衣服。彩度高所以上一條擋不住它。
    if s["white"] >= 0.45 and s["aspect"] < 1.0:
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
    for key in ("white", "sat", "fill", "aspect", "edge_bg", "ring_sd", "ncolor"):
        out[f"_{key}"] = [round(float(e.get(key, float("nan"))), 3) for e in ev]
    return out
