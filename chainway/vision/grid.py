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
TOL_LIGHT = 12.0


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
    px = cell.reshape(-1, 3) if mask is None else cell[mask]
    if len(px) < 30:
        return {"色號": None, "說明": "有效像素太少"}
    med = np.median(px.astype(np.float64), axis=0)
    out = {"HEX": "#%02X%02X%02X" % tuple(int(v) for v in med), "色號": None}

    # 色卡對照是**加分項**，不是必要條件。缺了色號表照樣要能判花色 ——
    # 「這一格是不是橫條紋」跟色卡完全無關。
    #
    # 實測踩到：使用者機器上 config/color_codes.yaml 不存在（一鍵檔更新時
    # 整個 config 資料夾被排除），整支 grid 就 FileNotFoundError 掛掉，
    # 連跟顏色無關的花色判定都一起沒了。一個附加功能不該讓主功能停擺。
    try:
        from ..search.colorcode import classify, load_table
        from ..search.palette import _srgb_to_lab

        lab = _srgb_to_lab(med.reshape(1, 3))[0]
        r = classify(lab, load_table())
        out.update({"色號": r.get("色號"), "色名": r.get("名稱"),
                    "色相族": r.get("色相族"), "ΔE": r.get("ΔE2000")})
    except FileNotFoundError:
        out["色號說明"] = "沒有色卡對照表（config/color_codes.yaml），只給 HEX"
    except Exception as exc:
        out["色號說明"] = f"色號對照失敗（{type(exc).__name__}）"
    return out


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


def garment_color(img, *, max_side: int = 320) -> dict[str, Any]:
    """整件衣服的主色 —— **只取衣服像素，排除背景**。

    為什麼要排除背景：系統圖是白底去背，九宮格的四角常常整格都是白的。
    實測 KA1369013 的左上與右上是 #FCFCFB，那是紙不是衣服。
    連背景一起平均，深色衣服會被拉淺，比對就整個歪掉。

    取中位數不取平均：一顆亮鈕釦或一道反光會把平均拉走，中位數不會。

    `max_side` 先把圖縮小再量。主色是統計量，不需要解析度 —— 縮到 320px
    之後中位數幾乎不變，但速度差一個量級。全庫 3,323 張要跑得動，
    這一步是必要的，不是最佳化。
    """
    from PIL import Image as _PIL

    from ..imageio import to_rgb
    from .locate import garment_mask

    img = to_rgb(img)
    if max_side and max(img.size) > max_side:
        img = img.copy()
        img.thumbnail((max_side, max_side), _PIL.LANCZOS)
    a = np.asarray(img)
    try:
        mask, box = garment_mask(img)
        k = a.shape[0] / mask.shape[0]
        # 遮罩是在縮小的副本上算的，取像素前先把它放大回原尺寸
        from PIL import Image as _I
        m = np.asarray(_I.fromarray((mask * 255).astype(np.uint8))
                       .resize((a.shape[1], a.shape[0]), _I.NEAREST)) > 127
    except Exception:
        m = None
    px = a[m] if m is not None and m.sum() >= 100 else a.reshape(-1, 3)
    med = np.median(px.astype(np.float64), axis=0)
    out = {"HEX": "#%02X%02X%02X" % tuple(int(v) for v in med),
           "RGB": [int(v) for v in med], "衣服像素": int(len(px))}
    try:
        from ..search.colorcode import classify, load_table
        from ..search.palette import _srgb_to_lab

        lab = _srgb_to_lab(med.reshape(1, 3))[0]
        out["LAB"] = [round(float(v), 1) for v in lab]
        r = classify(lab, load_table())
        out.update({"色號": r.get("色號"), "色名": r.get("名稱"),
                    "色相族": r.get("色相族")})
    except Exception:
        from ..search.palette import _srgb_to_lab
        out["LAB"] = [round(float(v), 1)
                      for v in _srgb_to_lab(med.reshape(1, 3))[0]]
    return out


def color_distance(lab_a, lab_b) -> float:
    """兩個顏色差多少（ΔE2000）。數字越小越像。

    用 ΔE2000 而不是 RGB 距離：RGB 上等距的兩步，人眼看到的差異可以差
    好幾倍，尤其在深色區。深藏青與深紫在 RGB 上很近，在 ΔE 上分得開。
    """
    from ..search.colorcard import delta_e_2000

    return float(np.ravel(delta_e_2000(
        list(lab_a), np.asarray(lab_b, dtype=float).reshape(1, 3)))[0])


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


# ---------------------------------------------------------------- 顏色簽名
#
# 這一段的每一個數字都是量出來的，不是想出來的。用自己的系統圖出題
# （`search.selfeval`），150 款裡找 1 款，換一套全新的衣服與題目再驗一次：
#
#     公式                        調校集 T1/T5      保留集 T1/T5
#     3×3 逐格                    45.3% / 65.3%    40.4% / 62.8%
#     2×2 逐格                    49.3% / 78.7%    51.1% / 78.7%
#     2×2 + 4×4 + 離散×0.5        54.7% / 82.7%    55.3% / 81.9%  ← 用這個
#
# 一路上被自我測驗打掉的想法（都寫在這裡，免得哪天又想一次）：
#
#   「扣掉各自主色只比偏移」  單用它 Top-1 = 0%。抗光線是真的，但也把
#                             顏色整個丟掉了 —— 素面紅衣跟素面藍衣變成
#                             一模一樣。它是同分裁決，不是相似度。
#   「顏色直方圖」            34.7%，加進來反而拉低 Top-5。
#   「亮度離散度單用」        2.7%，但當**配菜**（×0.5）穩定加 3–6 個百分點。
#   「格子切更細」            4×4 單用不如 2×2。細格對錯位很敏感。
#
# 為什麼 2×2 勝過 3×3：查詢圖跟系統圖永遠對不齊（縮放、留白、人站的
# 位置）。格子越大，錯一點位的容忍度越高。九宮格是給人看的語言，
# 四宮格才是比對用的。兩個都留著，各司其職。
SCALES = (2, 3, 4)
SPREAD_N = 3
SPREAD_W = 0.5


def _cell_list(a: np.ndarray, m: np.ndarray, n: int, *,
               skin: np.ndarray | None = None,
               min_cover: float = MIN_CELL_COVER) -> list[dict[str, Any]]:
    """n×n 每格的中位 LAB。`skin` 給了就扣掉皮膚，但一格扣完剩不到三成
    就不扣 —— 那代表這一格的衣服本身是膚色，扣下去等於把它變成沒資料。"""
    from ..search.palette import _srgb_to_lab

    H, W = a.shape[:2]
    names = ([["左上", "中上", "右上"], ["左中", "正中", "右中"],
              ["左下", "中下", "右下"]] if n == 3 else None)
    out: list[dict[str, Any]] = []
    for i in range(n):
        for j in range(n):
            ys, ye = H * i // n, H * (i + 1) // n
            xs, xe = W * j // n, W * (j + 1) // n
            c, cf = a[ys:ye, xs:xe], m[ys:ye, xs:xe]
            nm = names[i][j] if names else f"r{i+1}c{j+1}"
            cover = float(cf.mean()) if cf.size else 0.0
            use = cf
            if skin is not None and cf.sum():
                nos = cf & ~skin[ys:ye, xs:xe]
                if nos.sum() >= 0.30 * cf.sum():
                    use = nos
            if c.size == 0 or cover < min_cover or use.sum() < 30:
                out.append({"格": nm, "LAB": None, "覆蓋": round(cover, 2)})
                continue
            med = np.median(c[use].astype(np.float64), axis=0)
            out.append({"格": nm, "覆蓋": round(cover, 2),
                        "HEX": "#%02X%02X%02X" % tuple(int(v) for v in med),
                        "LAB": [round(float(v), 1)
                                for v in _srgb_to_lab(med.reshape(1, 3))[0]]})
    return out


def _spread_list(a: np.ndarray, m: np.ndarray, n: int = SPREAD_N) -> list:
    """每格的亮度離散度（P90−P10）。素面小、格紋大。

    它回答的是「這一格花不花」，不是「花色長什麼樣」。位置對不齊也還在，
    所以它在錯位的查詢圖上仍然有用 —— 這正是方向能量那套做不到的。
    """
    H, W = a.shape[:2]
    out: list = []
    for i in range(n):
        for j in range(n):
            ys, ye = H * i // n, H * (i + 1) // n
            xs, xe = W * j // n, W * (j + 1) // n
            c, cf = a[ys:ye, xs:xe], m[ys:ye, xs:xe]
            if cf.sum() < 30:
                out.append(None)
                continue
            g = c[cf].astype(np.float64) @ [0.299, 0.587, 0.114]
            out.append(round(float(np.percentile(g, 90)
                                   - np.percentile(g, 10)), 1))
    return out


def _signature_from(a, fg, skin=None, *, min_cover: float = MIN_CELL_COVER
                    ) -> dict[str, Any]:
    """一塊已經框好的區域 → 多尺度顏色簽名。

    有皮膚遮罩時，**覆蓋率也要用扣掉皮膚之後的遮罩算**。這一條是量出來
    的：先前覆蓋率用含皮膚的遮罩，整格都是手臂的格子覆蓋率 100%、被當成
    有效格，它的顏色就混進比對裡 —— 同一批題目 Top-1 從 54.7% 掉到 36.2%。
    整格都是手臂，就該當作「這一格沒有衣服」。
    """
    if skin is not None:
        nos = fg & ~skin
        # 整段扣完剩不到三成 → 這件衣服本身是膚色（米、駝、裸粉），不扣。
        if nos.sum() >= 0.25 * max(fg.sum(), 1):
            fg, skin = nos, None
    sig: dict[str, Any] = {"離散": _spread_list(a, fg)}
    for n in SCALES:
        sig[f"格{n}"] = _cell_list(a, fg, n, skin=skin, min_cover=min_cover)
    sig["格"] = sig["格3"]          # 九宮格是給人看的那一份
    got = [c["LAB"] for c in sig["格3"] if c["LAB"]]
    sig["主色LAB"] = ([round(float(v), 1)
                       for v in np.median(np.array(got), axis=0)]
                      if got else None)
    sig["有效格"] = len(got)
    return sig


def cell_signature(img, *, max_side: int = 320,
                   min_cover: float = MIN_CELL_COVER) -> dict[str, Any]:
    """系統圖（白底去背的單件棚拍）→ 顏色簽名。

    衣服像素不足的格回 None —— 系統圖的四角是白紙，實測 KA1369013 的
    左上與右上是 #FCFCFB。給那種格一個顏色只是在製造雜訊。

    穿搭照不要用這支，用 `photo_signatures`。
    """
    from PIL import Image as _I

    from ..imageio import to_rgb
    from .locate import garment_mask

    img = to_rgb(img)
    if max_side and max(img.size) > max_side:
        img = img.copy()
        img.thumbnail((max_side, max_side), _I.LANCZOS)
    a = np.asarray(img)
    try:
        mask, box = garment_mask(img)
        m = np.asarray(_I.fromarray((mask * 255).astype(np.uint8))
                       .resize((a.shape[1], a.shape[0]), _I.NEAREST)) > 127
        x1, y1, x2, y2 = box
        k = a.shape[0] / mask.shape[0]
        x1, y1, x2, y2 = (int(x1 * k), int(y1 * k), int(x2 * k), int(y2 * k))
        if x2 - x1 > 8 and y2 - y1 > 8:
            a, m = a[y1:y2, x1:x2], m[y1:y2, x1:x2]
    except Exception:
        m = np.ones(a.shape[:2], dtype=bool)
    return _signature_from(a, m, None, min_cover=min_cover)


# 在人身上要試哪些段。(上緣佔比, 高度佔比)，以人的外框為基準。
#
# 為什麼是滑動視窗而不是裁準一次：上衣跟裙子在腰部相連、米色上衣會被
# 皮膚偵測吃掉 —— 每多一條裁切規則就多一個反例。改成試二十段、取最像
# 的那一段。量過：只用一段 Top-1 37.3%，用滿 21 段 46.7%。
#
# 二十段對每一個候選都一樣，所以「取最小」帶來的樂觀偏差是**共同的**，
# 不偏袒任何一款，排名仍然公平。
# (上緣, 高度, 左緣, 寬度)，都是人框的比例。
#
# 橫帶之外還要有**窄窗**：衣服被外套蓋住時，只露出胸前中間一條縫。
# 實測一張「粉上衣外面罩米色西裝外套」的真照片，只用整幅寬的橫帶時，
# 它跟「同一件粉上衣、沒罩外套」那張的距離是 66.0；加上中間窄窗之後
# 降到 61.6。有幫助，但沒有翻盤 —— 那一題它仍然比較像「不同上衣＋
# 同一件外套」的那張。衣服被蓋住八成就是比不出來，這是限制不是 bug。
_WINDOWS = [(t, h, 0.0, 1.0) for t in (0.0, 0.08, 0.16, 0.26, 0.36)
            for h in (0.30, 0.40, 0.52, 0.66, 0.85) if t + h <= 1.001]
_WINDOWS += [(t, h, xl, wd) for t in (0.08, 0.16, 0.26)
             for h in (0.25, 0.35, 0.45) for wd in (0.34, 0.50)
             for xl in (0.0, (1 - 0.34) / 2 if wd == 0.34 else 0.25, 1 - wd)
             if t + h <= 1.001]


def photo_signatures(img) -> dict[str, Any]:
    """穿搭照 → 人身上一整排候選段落的簽名。不裁、不猜衣服在哪一段。"""
    from . import person as P

    p = P.analyse(img)
    a, m, skin = p["圖"].astype(np.uint8), p["人"], p["皮膚"]
    x1, y1, x2, y2 = p["外框"]
    bw, bh = x2 - x1, y2 - y1
    wins: list[dict[str, Any]] = []
    for t, hf, xl, wd in _WINDOWS:
        ys = y1 + int(bh * t)
        ye = min(y2, ys + int(bh * hf))
        xs = x1 + int(bw * xl)
        xe = min(x2, xs + int(bw * wd))
        if ye - ys < 24 or xe - xs < 24:
            continue
        sig = _signature_from(a[ys:ye, xs:xe], m[ys:ye, xs:xe],
                              skin[ys:ye, xs:xe])
        if sig["有效格"] >= 5:
            seg = f"{t:.0%}–{t + hf:.0%}"
            if wd < 0.99:
                seg += f"　左右 {xl:.0%}–{xl + wd:.0%}"
            wins.append({"段": seg, "y": (ys, ye), **sig})
    return {"人": {k: v for k, v in p.items() if k not in ("人", "皮膚", "圖")},
            "視窗": wins}


def _cells_array(cells: list[dict[str, Any]]) -> np.ndarray:
    out = np.full((len(cells), 3), np.nan)
    for i, c in enumerate(cells):
        if c.get("LAB"):
            out[i] = c["LAB"]
    return out


def pack(sigs: dict[str, dict]) -> dict[str, Any]:
    """把一堆簽名壓成矩陣，一次算完所有候選。

    為什麼一定要做這一步：原本逐款逐視窗用 Python 迴圈，60 題 × 150 款
    × 21 段兩分鐘跑不完 —— 而網頁上一次查詢要面對 3,323 款。慢到不能用
    就等於不能用，這是產品問題，不是最佳化問題。
    """
    keys = list(sigs)
    out: dict[str, Any] = {"貨號": keys}
    for n in SCALES:
        out[f"格{n}"] = np.stack([_cells_array(sigs[k][f"格{n}"])
                                  for k in keys]) if keys else np.zeros((0, n * n, 3))
    out["離散"] = (np.array([[np.nan if v is None else v
                              for v in sigs[k]["離散"]] for k in keys],
                            dtype=float) if keys else np.zeros((0, SPREAD_N ** 2)))
    return out


def _mean_dist(q: np.ndarray, C: np.ndarray) -> np.ndarray:
    """逐格距離的平均，只算兩邊都量得到的格。"""
    both = (~np.isnan(q).any(axis=1))[None, :] & (~np.isnan(C).any(axis=2))
    d = np.linalg.norm(np.nan_to_num(q)[None] - np.nan_to_num(C), axis=2)
    n = both.sum(axis=1)
    return np.where(n > 0, (d * both).sum(axis=1) / np.maximum(n, 1), np.inf)


def _mean_abs(q: np.ndarray, C: np.ndarray) -> np.ndarray:
    both = (~np.isnan(q))[None, :] & (~np.isnan(C))
    d = np.abs(np.nan_to_num(q)[None] - np.nan_to_num(C))
    n = both.sum(axis=1)
    return np.where(n > 0, (d * both).sum(axis=1) / np.maximum(n, 1), np.inf)


def distance(win: dict[str, Any], packed: dict[str, Any]) -> np.ndarray:
    """一個視窗對上所有候選 → 距離向量。公式與上面表格裡的 D 一致。"""
    return (_mean_dist(_cells_array(win["格2"]), packed["格2"])
            + _mean_dist(_cells_array(win["格4"]), packed["格4"])
            + SPREAD_W * _mean_abs(
                np.array([np.nan if v is None else v for v in win["離散"]],
                         dtype=float), packed["離散"]))


def score_all(wins: list[dict[str, Any]], packed: dict[str, Any]
              ) -> tuple[np.ndarray, np.ndarray]:
    """所有視窗 × 所有候選 → (最小距離, 是哪一段)。"""
    n = len(packed["貨號"])
    best = np.full(n, np.inf)
    which = np.zeros(n, dtype=int)
    for wi, w in enumerate(wins):
        d = distance(w, packed)
        upd = d < best
        best[upd] = d[upd]
        which[upd] = wi
    return best, which


def compare_cells(a: dict[str, Any], b: dict[str, Any]) -> list[dict[str, Any]]:
    """九宮格逐格對照 —— 給人看的那一份，不參與排序。"""
    ca = {c["格"]: c for c in a["格3"]}
    cb = {c["格"]: c for c in b["格3"]}
    rows = []
    for k, x in ca.items():
        y = cb.get(k)
        if not y or not x.get("LAB") or not y.get("LAB"):
            continue
        rows.append({"格": k, "A": x.get("HEX"), "B": y.get("HEX"),
                     "ΔE": round(color_distance(x["LAB"], y["LAB"]), 1)})
    return rows


def check() -> list[str]:
    """回歸測試。守住的是「換一盞燈 ≠ 換一件衣服」這件事。"""
    bad: list[str] = []
    plain = cell_signature(_synthetic(False))
    striped = cell_signature(_synthetic(True))
    lit = cell_signature(_synthetic(False, warm=1.18))
    pk = pack({"素面": plain, "橫紋": striped})
    d_lit = distance({**lit, "段": "x"}, pk)
    if not (d_lit[0] < d_lit[1]):
        bad.append(f"換光線之後認不出自己：對素面 {d_lit[0]:.1f}、"
                   f"對橫紋 {d_lit[1]:.1f}")
    d_plain = distance({**plain, "段": "x"}, pk)
    if d_plain[0] > 1.0:
        bad.append(f"同一張圖對自己的距離 {d_plain[0]:.1f}，應該是 0")
    if d_plain[1] < 5.0:
        bad.append(f"素面對橫紋只差 {d_plain[1]:.1f}，分不出花色")
    return bad


def _synthetic(stripe: bool, warm: float = 1.0):
    """測試圖：白底、中間一件深藏青上衣，可選中列一條淺橫紋。"""
    from PIL import Image as _I

    a = np.full((300, 200, 3), 250, np.uint8)
    a[40:260, 40:160] = (41, 37, 61)
    if stripe:
        a[130:170, 40:160] = (200, 180, 175)
    if warm != 1.0:
        a = np.clip(np.asarray(a, float) * [warm, 1.02, 2.0 - warm],
                    0, 255).astype(np.uint8)
    return _I.fromarray(a)
