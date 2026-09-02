"""衣服的顏色signature：抽出來、比對、講成人話。

## 為什麼顏色要獨立處理，而不是交給 CLIP

貴司辨識商品的第一步是顏色 ——「綠色我們很少用，看到綠就縮小一半範圍」。
實測全庫五年 2,469 款，品名出現「綠」字的是 0 款。顏色的區辨力極強。

但 CLIP 的向量把顏色、版型、材質、圖案全部揉在一起，沒辦法單獨拿顏色來篩。
而且顏色是四個訊號裡最不需要模型的：直接從像素算，又快又不會錯。

## 兩個一定會遇到的坑

**一、背景會污染顏色。** 系統圖是白底去背，手機拍的是店裡的地板或牆。
不先框出衣服就取平均色，比到的是背景不是衣服。所以先用 subject_bbox
框主體，再把近背景色的像素剔掉。

**二、白平衡。** 同一件藍外套，棚拍偏冷、手機在黃光店裡拍偏暖，
RGB 差很多但人眼一看就知道是同一件。所以比對前先做灰世界正規化
（假設整張圖的平均應該是灰的，據此校正三個通道）。這是最便宜的白平衡校正，
對「同一件衣服在不同光線下」這個情境特別有效。

## 為什麼用 LAB 而不是 RGB

RGB 的數值距離跟人眼看到的差異對不起來 —— 深藍到黑的 RGB 距離，
可能比紅到橘還大。LAB 是為了「距離等於視覺差異」設計的，
比對顏色本來就該用它。這裡用不依賴 OpenCV 的純 numpy 實作，
少一個幾百 MB 的相依。
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Sequence

import numpy as np

from .regions import subject_bbox

# 取幾個主色。一件衣服常有主色加配色（格紋、拼接），只取一個會丟資訊；
# 取太多則會把陰影與細節也當成主色。
N_COLORS = 3
# 離背景色多近就算背景，要剔掉
BG_TOL = 30
# 主色至少要佔這麼多像素才算數，否則是雜訊
MIN_WEIGHT = 0.06


def _srgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    """(N,3) 0-255 sRGB → (N,3) LAB（D65）。"""
    a = rgb.astype(np.float64) / 255.0
    a = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805],
                  [0.2126, 0.7152, 0.0722],
                  [0.0193, 0.1192, 0.9505]])
    xyz = a @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[:, 1] - 16,
                     500 * (f[:, 0] - f[:, 1]),
                     200 * (f[:, 1] - f[:, 2])], axis=1)


def _grey_world(a: np.ndarray) -> np.ndarray:
    """灰世界白平衡。假設整體平均應為灰，據此校正三通道增益。

    對「同一件衣服在不同光線下」很有效，這正是手機照 vs 棚拍照的情況。
    刻意夾住增益：整張都是單一鮮色時（一件大紅外套佔滿畫面），
    這個假設不成立，不夾住會把紅色校成灰色。
    """
    mean = a.reshape(-1, 3).mean(axis=0)
    mean = np.where(mean < 1, 1, mean)
    gain = np.clip(mean.mean() / mean, 0.75, 1.33)
    return np.clip(a * gain, 0, 255)


def garment_pixels(img, *, white_balance: bool = True) -> np.ndarray:
    """回傳衣服區域的像素 (N,3)，已剔除背景。"""
    small = img.convert("RGB")
    small.thumbnail((220, 220))
    a = np.asarray(small).astype(np.float64)
    if white_balance:
        a = _grey_world(a)

    x1, y1, x2, y2 = subject_bbox(small)
    crop = a[y1:y2, x1:x2]
    if crop.size == 0:
        crop = a

    # 角落中位數當背景色，把貼近它的像素剔掉。去背的系統圖背景是白的，
    # 店裡拍的背景可能是任何顏色 —— 用「四角的顏色」比寫死白色可靠。
    h, w = a.shape[:2]
    k = max(3, min(h, w) // 20)
    bg = np.median(np.concatenate([
        a[:k, :k].reshape(-1, 3), a[:k, -k:].reshape(-1, 3),
        a[-k:, :k].reshape(-1, 3), a[-k:, -k:].reshape(-1, 3)]), axis=0)

    px = crop.reshape(-1, 3)
    keep = np.abs(px - bg).max(axis=1) > BG_TOL
    return px[keep] if keep.sum() >= 40 else px


def palette(img, n_colors: int = N_COLORS, *,
            white_balance: bool = True) -> list[tuple[np.ndarray, float]]:
    """回傳 [(LAB 色, 佔比)]，由大到小。

    用固定次數的 k-means（不引入 sklearn，這裡只要幾個群心，
    不值得為它多一個相依）。種子固定，同一張圖每次結果一致 ——
    檢索結果不該因為執行兩次就變動。
    """
    px = garment_pixels(img, white_balance=white_balance)
    if len(px) < n_colors:
        return []
    lab = _srgb_to_lab(px)

    rng = np.random.default_rng(0)
    idx = rng.choice(len(lab), size=min(len(lab), 3000), replace=False)
    sample = lab[idx]
    centers = sample[rng.choice(len(sample), size=n_colors, replace=False)]
    for _ in range(12):
        d = ((sample[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
        who = d.argmin(axis=1)
        for c in range(n_colors):
            hit = who == c
            if hit.any():
                centers[c] = sample[hit].mean(axis=0)

    d = ((sample[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
    who = d.argmin(axis=1)
    out = [(centers[c], float((who == c).mean())) for c in range(n_colors)]
    out = [(c, wgt) for c, wgt in out if wgt >= MIN_WEIGHT]
    return sorted(out, key=lambda t: -t[1])


def palette_distance(a: Sequence[tuple[np.ndarray, float]],
                     b: Sequence[tuple[np.ndarray, float]]) -> float:
    """兩個色盤的距離。查詢色盤的每個顏色，找對方最近的顏色，依佔比加權。

    不對稱是刻意的：查詢圖裡的顏色都該在索引圖裡找得到，
    但索引圖可以有查詢圖沒拍到的顏色（背面配色、內裡）。
    要求雙向都對得上，會把「只拍到正面」的合理查詢判成不像。
    """
    if not a or not b:
        return float("inf")
    B = np.stack([c for c, _ in b])
    total = sum(w for _, w in a) or 1.0
    return float(sum(w * np.linalg.norm(B - c, axis=1).min() for c, w in a) / total)


# 色系名稱：對應貴司辨識時講的話（「綠色我們很少用」）。
# 中心點用 LAB，判定取最近者 —— 硬切 hue 區間在低彩度時會亂跳。
FAMILIES: dict[str, tuple[float, float, float]] = {
    "黑":   (18, 0, 0),
    "深灰": (38, 0, 0),
    "灰":   (62, 0, 0),
    "白":   (94, 0, 0),
    "米白": (90, 2, 10),
    "紅":   (48, 62, 40),
    "粉":   (78, 26, 6),
    "橘":   (64, 38, 52),
    "咖啡": (38, 16, 24),
    "卡其": (66, 4, 26),
    "黃":   (86, -6, 74),
    "綠":   (54, -44, 32),
    "藍":   (44, 8, -46),
    "淺藍": (72, -6, -22),
    "紫":   (44, 36, -34),
}
_FAM_NAMES = list(FAMILIES)
_FAM_LAB = np.array([FAMILIES[k] for k in _FAM_NAMES], dtype=float)


def color_family(lab: np.ndarray) -> str:
    """LAB → 色系名稱。低彩度先歸到無彩色，否則深藍會被判成黑。"""
    L, A, Bv = float(lab[0]), float(lab[1]), float(lab[2])
    chroma = (A * A + Bv * Bv) ** 0.5
    if chroma < 12:
        for name, lo, hi in (("黑", -1, 28), ("深灰", 28, 50),
                             ("灰", 50, 78), ("白", 78, 101)):
            if lo <= L < hi:
                return name
        return "白"
    return _FAM_NAMES[int(np.argmin(np.linalg.norm(_FAM_LAB - np.array([L, A, Bv]),
                                                   axis=1)))]


def describe(img, n_colors: int = N_COLORS) -> list[dict[str, Any]]:
    """人看得懂的版本：色系名稱與佔比。用在介面上與人工覆核。"""
    return [{"色系": color_family(c), "佔比": round(w, 3),
             "LAB": [round(float(v), 1) for v in c]}
            for c, w in palette(img, n_colors)]


def signature(path: str | Path, n_colors: int = N_COLORS) -> np.ndarray | None:
    """存進索引用的緊湊表示：(n_colors, 4) = LAB + 佔比。缺圖回傳 None。"""
    try:
        from PIL import Image
        with Image.open(path) as im:
            im.load()
            pal = palette(im, n_colors)
    except Exception:
        return None
    if not pal:
        return None
    out = np.zeros((n_colors, 4), dtype="float32")
    for i, (c, w) in enumerate(pal[:n_colors]):
        out[i, :3], out[i, 3] = c, w
    return out


def sig_to_palette(sig: np.ndarray) -> list[tuple[np.ndarray, float]]:
    return [(sig[i, :3], float(sig[i, 3])) for i in range(len(sig)) if sig[i, 3] > 0]
