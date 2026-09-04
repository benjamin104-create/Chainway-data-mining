"""九宮格比對：把衣服切成 3×3，每一格各自量顏色與花色。

## 為什麼要切格，不整張比

整張衣服壓成一個顏色、一個花色標籤，會把最重要的資訊平均掉。實例：
一件素面藏青上衣，只有右肩一個格紋蝴蝶結。整張量 →「藏青、素面」，
那個結消失了；而那個結正是這件衣服唯一的識別特徵。

切成九格之後同一件衣服變成：

    八格 素面藏青　＋　右上一格 格紋

這個指紋短、穩、而且**位置有意義** —— 它直接對應到品名裡的
「單邊」「肩」「領口」「胸前」「下擺」，所以影像量到的東西
可以跟品名對得起來，兩邊互相驗證。

## 花色怎麼判（不用模型）

格紋的定義就是「水平與垂直方向都有規律重複的線」。所以取每一格的
灰階，分別對列與行做一階差分，看能量集中在哪裡：

    素面     兩個方向都低
    格紋     兩個方向都高，而且自相關有明顯週期
    條紋     只有一個方向高
    其他花紋 能量高但沒有週期（繡花、印花、圖案）

不用神經網路。格紋這種東西的定義本身就是頻率上的規律，
拿模型去猜反而比直接量週期不可靠。

## 這支程式的限制

**穿搭照的格線不是量測級。** 衣服穿在身上會皺、會轉、會被手臂遮住，
週期會被拉扯。所以「格紋 vs 素面」在穿搭照上可信，
「格子多大」不可信。系統圖（平拍去背）才量得準。
"""
from __future__ import annotations

from typing import Any

import numpy as np

# 一格裡有多少比例是衣服，才算數。低於這個就標「不足」——
# 穿搭照的角落常常是背景或手臂，硬要給答案只會是雜訊。
MIN_CELL_COVER = 0.25
# 方向能量高過這個就算「有紋理」。0.06 是拿真實布樣與素面照量出來的
# 分界（布樣 0.12–0.28，素面棚拍 0.01–0.04）。
TEX_HI = 0.06
# 兩個方向的能量比。接近 1 = 兩向都有（格）；差很多 = 單向（條）。
DIR_BALANCE = 0.45


def _gray(cell: np.ndarray) -> np.ndarray:
    return (0.299 * cell[..., 0] + 0.587 * cell[..., 1]
            + 0.114 * cell[..., 2]).astype(np.float64)


def _dir_energy(g: np.ndarray) -> tuple[float, float]:
    """回傳 (橫向能量, 縱向能量)，已除以亮度平均做正規化。

    正規化很重要：同一塊布，暗色的絕對梯度一定比淺色小，
    不除掉的話所有深色衣服都會被判成素面。
    """
    m = max(float(g.mean()), 1.0)
    dy = float(np.abs(np.diff(g, axis=0)).mean()) / m   # 沿列變化 → 橫線
    dx = float(np.abs(np.diff(g, axis=1)).mean()) / m   # 沿行變化 → 直線
    return dx, dy


def _periodic(g: np.ndarray, axis: int) -> float:
    """這個方向的紋理有多規律（0–1）。格紋規律，繡花不規律。

    做法：把該方向的平均剖面去掉直流，算自相關，取第一個非零延遲之後
    的最大值。週期性強的圖樣會在某個延遲上出現明顯的峰。
    """
    prof = g.mean(axis=axis)
    prof = prof - prof.mean()
    n = len(prof)
    if n < 16 or float(np.abs(prof).sum()) < 1e-6:
        return 0.0
    ac = np.correlate(prof, prof, mode="full")[n - 1:]
    if ac[0] <= 0:
        return 0.0
    ac = ac / ac[0]
    lo = max(2, n // 32)
    return float(np.clip(ac[lo:n // 2].max(), 0.0, 1.0)) if n // 2 > lo else 0.0


def _spread(g: np.ndarray) -> float:
    """紋理鋪滿整格，還是擠在一小塊？回傳「有紋理的面積佔比」。

    這一項是拿真圖踩出來的。原本只看方向能量與週期，結果 KA1583008
    那件**素面**藏青上衣胸前的繡花熊被判成「格紋」—— 因為針織底加繡線
    在兩個方向都有規律。週期性分不開它們。

    分得開的是分布：格紋是整片布的織法，能量鋪滿整格；
    繡花／印花是一個圖案，能量擠在中間一小塊，四周仍然是素的。
    """
    d = np.abs(np.diff(g, axis=0))[:, :-1] + np.abs(np.diff(g, axis=1))[:-1, :]
    if d.size == 0:
        return 0.0
    # 門檻必須是**絕對**的（該格的平均梯度），不能用百分位。
    # 第一版用 75 百分位，那依定義永遠有 25% 的像素超過它，
    # 於是每一格都回傳同一個數字，整項指標形同不存在 ——
    # 而它照樣印出漂亮的 1.00，看起來像量到了東西。
    thr = float(d.mean())
    if thr <= 1e-9:
        return 0.0
    # 均勻紋理（格紋、織紋）：梯度分布集中，約四到五成的點高於平均。
    # 局部圖案：大片平坦把平均拉低不了多少，反而是少數強邊撐高平均，
    # 高於平均的點只有一兩成。
    return float((d > thr).mean())


# 有紋理的面積要鋪到這麼滿才算「整片布的花色」。低於這個是局部圖案。
# 拿貴司 KA1583008 指示書裡的真圖量出來的：
#     六塊真格紋布樣   0.377 – 0.427
#     素面藏青熊 T     0.129 – 0.209（含胸前繡花那一格）
# 中間空了 0.21→0.38 一大段，取 0.30。
SPREAD_MIN = 0.30


def cell_pattern(cell: np.ndarray) -> dict[str, Any]:
    """一格的花色判定。"""
    g = _gray(cell)
    dx, dy = _dir_energy(g)
    px, py = _periodic(g, 0), _periodic(g, 1)
    hi = max(dx, dy)
    bal = min(dx, dy) / hi if hi > 1e-9 else 0.0
    sp = _spread(g)

    # 判斷順序有意義，排錯就會互相攔截。實測踩到兩次：
    #
    # 一、鋪滿度那一關原本排在方向之前，把明顯的橫條紋判成「局部圖案」——
    #     條紋的梯度集中在細線上，鋪滿度天生就低（0.25），會被誤攔。
    #     方向不平衡是條紋最乾淨的證據，要先問。
    #
    # 二、週期性（自相關）**完全沒有鑑別力**，已經從判斷裡拿掉。
    #     實測：素面 0.92、繡花 0.93、條紋 0.95、格紋 0.87 —— 全部一樣高。
    #     它量到的是針織底紋與影像雜訊的規律，不是花色的規律。
    #     數值仍然回傳供人參考，但不再參與分類。
    if hi < TEX_HI:
        kind = "素面"
    elif bal < DIR_BALANCE:
        # 能量明顯偏一個方向 → 條紋（橫或直）
        kind = "條紋（橫／直）"
    elif sp < SPREAD_MIN:
        # 兩向都有能量、但擠在一小塊 → 是圖案，不是布的花色
        kind = "局部圖案（繡花／印花）"
    else:
        kind = "格紋／織紋"
    return {"花色": kind, "橫能量": round(dx, 4), "縱能量": round(dy, 4),
            "方向平衡": round(bal, 3), "週期性": round(max(px, py), 3),
            "鋪滿度": round(sp, 3)}


def cell_color(cell: np.ndarray, mask: np.ndarray | None = None) -> dict[str, Any]:
    """一格的主色 → LAB 與色號。取中位數，不取平均 ——
    平均會被一個亮反光或一顆鈕釦拉走，中位數不會。"""
    from ..search.colorcode import classify, load_table
    from ..search.palette import _srgb_to_lab

    px = cell.reshape(-1, 3) if mask is None else cell[mask]
    if len(px) < 30:
        return {"色號": None, "說明": "有效像素太少"}
    med = np.median(px.astype(np.float64), axis=0)
    lab = _srgb_to_lab(med.reshape(1, 3))[0]
    r = classify(lab, load_table())
    return {"HEX": "#%02X%02X%02X" % tuple(int(v) for v in med),
            "色號": r.get("色號"), "色名": r.get("名稱"),
            "色相族": r.get("色相族"), "ΔE": r.get("ΔE2000")}


def analyse(img, *, n: int = 3, use_mask: bool = True) -> dict[str, Any]:
    """把圖切成 n×n，每格回報顏色與花色。

    `use_mask=True` 會先用 garment_mask 框出衣服再切 —— 對系統圖有用
    （去掉白底）。穿搭照框不準，設 False 直接對整張切。
    """
    from ..imageio import to_rgb

    a = np.asarray(to_rgb(img))
    box = None
    if use_mask:
        try:
            from .locate import garment_mask
            mask, b = garment_mask(img)
            k = a.shape[0] / mask.shape[0]
            box = tuple(int(v * k) for v in b)
        except Exception:
            box = None
    if box:
        x1, y1, x2, y2 = box
        a = a[y1:y2, x1:x2]

    H, W = a.shape[:2]
    names = [["左上", "中上", "右上"], ["左中", "正中", "右中"],
             ["左下", "中下", "右下"]]
    cells = []
    for i in range(n):
        for j in range(n):
            y0, y1_ = H * i // n, H * (i + 1) // n
            x0, x1_ = W * j // n, W * (j + 1) // n
            c = a[y0:y1_, x0:x1_]
            if c.size == 0:
                continue
            nm = names[i][j] if n == 3 else f"r{i+1}c{j+1}"
            cells.append({"格": nm, "列": i, "行": j,
                          **cell_color(c), **cell_pattern(c)})
    return {"格數": len(cells), "格": cells, "外框": box}


def fingerprint(res: dict[str, Any]) -> str:
    """壓成一行，方便並排看與比對。"""
    out = []
    for c in res["格"]:
        out.append(f"{c['格']}:{c.get('色號','?')}/{c['花色']}")
    return "　".join(out)


def compare(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    """兩張圖的九宮格逐格比。回傳相同格數與逐格差異。

    分開報「顏色對得上幾格」與「花色對得上幾格」——
    合成一個分數會讓「顏色全對但花色全錯」跟「各對一半」長得一樣，
    而這兩件事的意思完全不同。
    """
    ca = {c["格"]: c for c in a["格"]}
    cb = {c["格"]: c for c in b["格"]}
    rows, same_c, same_p = [], 0, 0
    for k in ca:
        if k not in cb:
            continue
        x, y = ca[k], cb[k]
        cok = x.get("色號") is not None and x.get("色號") == y.get("色號")
        pok = x["花色"] == y["花色"]
        same_c += cok
        same_p += pok
        rows.append({"格": k, "A色": x.get("色號"), "B色": y.get("色號"),
                     "色相同": cok, "A花色": x["花色"], "B花色": y["花色"],
                     "花色相同": pok})
    n = len(rows)
    return {"格數": n, "顏色相同": same_c, "花色相同": same_p,
            "顏色一致率": round(same_c / n, 3) if n else 0.0,
            "花色一致率": round(same_p / n, 3) if n else 0.0,
            "逐格": rows}
