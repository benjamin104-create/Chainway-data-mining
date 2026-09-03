"""照片 → 線稿轉換。

這裡做的是「真正在本機跑得動、不需要任何 API」的部分：

  crop_region()   把你圈出的重點（領口、口袋、開衩、褶子）裁出來
  to_lineart()    轉成黑白線稿
  vectorize()     線稿轉 SVG（給 Illustrator 用）
  flat_render()   把原圖顏色量化後填回線稿 → 平塗彩現參考圖

線稿演算法用 XDoG（eXtended Difference of Gaussians）而不是 Canny：
  Canny 只給你「邊緣在哪」，線條斷斷續續、粗細一致，看起來像雜訊。
  XDoG 模擬的是「手繪筆觸」，線條連續且有輕重，出來的東西比較接近
  設計師習慣看的機械圖線稿。Canny 保留為備選（處理極低對比的照片時較穩）。

⚠️ 誠實說明：本機演算法產出的是「照片的線條化」，不是版師畫的機械圖。
   它適合當作「這個細節長這樣」的參考與描圖底稿。
   要得到真正乾淨、對稱、可入 Tech Pack 的向量機械圖，走 flats_prompt.py
   產生的規格 + 生成式繪圖（Adobe Firefly / DALL·E），或由設計師照著這張描。
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from ..config import Config, get_config


def _require_cv2():
    try:
        import cv2
        return cv2
    except ImportError as exc:  # pragma: no cover
        raise ImportError(
            "線稿功能需要 OpenCV。請執行：pip install opencv-python-headless"
        ) from exc


def load_image(path: str | Path) -> np.ndarray:
    """讀成 OpenCV 的 BGR 陣列。**不要**直接用 cv2.imread。

    兩個理由，兩個都會安靜地毀掉線稿：

    **一、透明背景會變成全黑。** `cv2.imread(..., IMREAD_COLOR)` 直接丟掉
    alpha 通道，去背 PNG 的透明處剩下 (0,0,0)。實測一張中央有紅方塊的
    透明 PNG，讀進來四角是 [0 0 0]。市調圖有相當一部分是電商去背圖或
    截圖存成 PNG，而線稿是**邊緣偵測**——整片黑底會讓演算法沿著畫面
    邊界描出一個大方框，那個方框不是衣服上的任何東西。線稿看起來
    「多了一道邊」，不會有錯誤訊息。

    這和先前圖片分類踩到的是同一個坑（章戳的白底比例量成 0.00），
    所以走同一條路：`imageio.load_rgb` 先合成到白底。

    **二、Windows 上中文檔名讀不到。** `cv2.imread` 在 Windows 用 ANSI
    代碼頁開檔，路徑含中文時直接回 None，而這支程式的說明裡舉的例子
    就是「街拍_領口.jpg」。在 Linux 上重現不出來（實測讀得到），
    但貴司是繁中 Windows，市調圖的檔名幾乎一定有中文。
    先用 Python 開檔再交給 PIL，就完全避開這件事。
    """
    from ..imageio import load_rgb

    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"無法讀取影像：{path}")
    rgb = np.asarray(load_rgb(p))          # 透明處已合成到白底
    return rgb[:, :, ::-1].copy()          # RGB → BGR，cv2 用的順序


def crop_region(
    img: np.ndarray,
    box: tuple[float, float, float, float],
    normalized: bool = True,
    padding: float = 0.04,
) -> np.ndarray:
    """裁出重點區域。box = (x1, y1, x2, y2)。

    normalized=True 時座標是 0–1 的比例（推薦，跟解析度無關，
    你在 config/sketch_jobs.yaml 裡用比例標一次，換圖也能重用）。
    """
    h, w = img.shape[:2]
    x1, y1, x2, y2 = box
    if normalized:
        x1, x2 = x1 * w, x2 * w
        y1, y2 = y1 * h, y2 * h
    px, py = (x2 - x1) * padding, (y2 - y1) * padding
    x1 = int(max(0, x1 - px)); y1 = int(max(0, y1 - py))
    x2 = int(min(w, x2 + px)); y2 = int(min(h, y2 + py))
    if x2 <= x1 or y2 <= y1:
        raise ValueError(f"裁切框無效：{box}")
    return img[y1:y2, x1:x2].copy()


def auto_regions(img: np.ndarray, max_regions: int = 4) -> list[tuple[float, float, float, float]]:
    """沒有手動框時，用邊緣密度自動挑出「細節最豐富」的幾塊。

    這是輔助不是魔法 —— 它找的是「視覺上最複雜的區域」，
    通常會命中領口、口袋、釦組這類地方，但不保證。建議當作草案再手動微調。
    """
    cv2 = _require_cv2()
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 60, 160)

    gh, gw = 6, 4                      # 直向切 6 段、橫向 4 段
    cell_h, cell_w = h // gh, w // gw
    scores = []
    for r in range(gh):
        for c in range(gw):
            cell = edges[r * cell_h:(r + 1) * cell_h, c * cell_w:(c + 1) * cell_w]
            scores.append((cell.mean(), r, c))
    scores.sort(reverse=True)

    boxes = []
    for _, r, c in scores[:max_regions]:
        boxes.append((c * cell_w / w, r * cell_h / h, (c + 1) * cell_w / w, (r + 1) * cell_h / h))
    return boxes


def _xdog(gray: np.ndarray, p: dict) -> np.ndarray:
    cv2 = _require_cv2()
    g = gray.astype(np.float32) / 255.0
    sigma = float(p.get("sigma", 0.8))
    k = float(p.get("k", 4.5))
    gamma = float(p.get("gamma", 0.97))
    eps = float(p.get("epsilon", -0.1))
    phi = float(p.get("phi", 200))

    g1 = cv2.GaussianBlur(g, (0, 0), sigma)
    g2 = cv2.GaussianBlur(g, (0, 0), sigma * k)
    d = g1 - gamma * g2
    out = np.where(d >= eps, 1.0, 1.0 + np.tanh(phi * (d - eps)))
    return np.clip(out, 0, 1)


REFERENCE_LONG_SIDE = 1200  # XDoG 參數的校準基準解析度


def to_lineart(
    img: np.ndarray,
    cfg: Config | None = None,
    engine: str | None = None,
    invert: bool = False,
) -> np.ndarray:
    """回傳單通道線稿（白底黑線，0–255）。"""
    cv2 = _require_cv2()
    cfg = cfg or get_config()
    scfg = cfg.get("sketch", {})
    engine = engine or scfg.get("engine", "xdog")

    # 保邊平滑，去掉布料紋理與噪點，只留結構線。
    # sigmaColor 不能開太大：去背商品照上「領片 vs 身片」的色差常常只有 20–30 階，
    # sigmaColor=75 會把這種結構邊一起抹掉，線稿就只剩外輪廓。
    smooth = cv2.bilateralFilter(img, 7, 25, 50)
    gray = cv2.cvtColor(smooth, cv2.COLOR_BGR2GRAY)
    gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)

    # XDoG 的 sigma 是以像素為單位的，固定值套在不同解析度上結果差很多：
    # 小圖放大後邊緣變糊，固定 sigma=0.8 會完全抓不到線。所以隨解析度縮放。
    # 只往上調，不往下調：小圖用更小的 sigma 只會讓線更稀疏。
    scale = max(1.0, max(gray.shape) / REFERENCE_LONG_SIDE)

    if engine == "canny":
        ink = _auto_canny(gray) > 0
    else:  # xdog（預設）
        params = dict(scfg.get("xdog", {}))
        params["sigma"] = float(params.get("sigma", 0.8)) * scale
        # XDoG 給的是筆觸感的軟線；Canny 補上硬結構邊（領口、口袋、下擺）。
        # 單用 XDoG 在低對比的去背照上常常整片空白，兩者聯集才穩。
        ink = (_xdog(gray, params) < 0.55) | (_auto_canny(gray) > 0)

    # 線條加粗，並清掉孤立雜點。粗細隨解析度走，否則大圖的線細到看不見。
    line = np.where(ink, 0, 255).astype(np.uint8)
    width = max(1, int(round(int(scfg.get("line_width", 2)) * scale)))
    if width > 1:
        line = cv2.erode(line, np.ones((width, width), np.uint8), iterations=1)
    line = cv2.medianBlur(line, 3)

    return 255 - line if invert else line


def _auto_canny(gray: np.ndarray, sigma: float = 0.33) -> np.ndarray:
    """門檻依影像中位數自動決定 —— 固定門檻在低對比的去背商品照上幾乎抓不到邊。"""
    cv2 = _require_cv2()
    med = float(np.median(gray))
    lo = int(max(0, (1.0 - sigma) * med))
    hi = int(min(255, (1.0 + sigma) * med))
    return cv2.Canny(gray, lo, max(hi, lo + 1))


def ink_ratio(line: np.ndarray) -> float:
    """線稿的黑色佔比。太低（<0.5%）代表沒抓到東西，太高（>25%）代表變成塗黑。"""
    return float((line < 128).mean())


def resize_long_side(img: np.ndarray, target: int, max_upscale: float = 2.0) -> np.ndarray:
    """縮放到指定長邊。放大有上限 —— 把 150px 的裁切區硬拉到 1600px
    只會得到一張糊圖，線稿演算法在上面抓不到任何邊緣。"""
    cv2 = _require_cv2()
    h, w = img.shape[:2]
    scale = min(target / max(h, w), max_upscale)
    if abs(scale - 1) < 0.01:
        return img
    interp = cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC
    return cv2.resize(img, (max(1, int(w * scale)), max(1, int(h * scale))), interpolation=interp)


def flat_render(img: np.ndarray, line: np.ndarray, cfg: Config | None = None) -> np.ndarray:
    """平塗彩現：把原圖顏色量化成幾個色塊，再疊上線稿。

    用途是「這個細節配上實際顏色會長怎樣」的快速示意，
    也順便產出這張圖的建議色票（見 extract_palette）。
    """
    cv2 = _require_cv2()
    cfg = cfg or get_config()
    n_colors = int(cfg.get("sketch", {}).get("render_palette_colors", 6))

    small = cv2.pyrMeanShiftFiltering(img, 15, 35)
    data = small.reshape(-1, 3).astype(np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, labels, centers = cv2.kmeans(data, n_colors, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
    quant = centers.astype(np.uint8)[labels.flatten()].reshape(img.shape)

    line_bgr = cv2.cvtColor(line, cv2.COLOR_GRAY2BGR)
    if line_bgr.shape[:2] != quant.shape[:2]:
        line_bgr = cv2.resize(line_bgr, (quant.shape[1], quant.shape[0]))
    return cv2.bitwise_and(quant, line_bgr)


def extract_palette(img: np.ndarray, n: int = 6) -> list[dict]:
    """抽出主色票（含佔比），可直接寫進色彩計畫 60/30/10。"""
    cv2 = _require_cv2()
    data = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).reshape(-1, 3).astype(np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, labels, centers = cv2.kmeans(data, n, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
    counts = np.bincount(labels.flatten(), minlength=n)
    order = np.argsort(-counts)
    out = []
    for i in order:
        r, g, b = centers[i].astype(int)
        out.append({
            "hex": f"#{r:02X}{g:02X}{b:02X}",
            "rgb": [int(r), int(g), int(b)],
            "share": round(float(counts[i] / counts.sum()), 3),
        })
    return out


def vectorize(line: np.ndarray, out_svg: Path) -> Path | None:
    """線稿轉 SVG。優先用 potrace（品質最好），沒有就退回輪廓描邊。"""
    cv2 = _require_cv2()
    out_svg.parent.mkdir(parents=True, exist_ok=True)

    try:
        import potrace  # pypotrace
        bitmap = potrace.Bitmap((line < 128).astype(np.uint8))
        path = bitmap.trace()
        h, w = line.shape
        parts = []
        for curve in path:
            d = [f"M {curve.start_point[0]:.2f} {curve.start_point[1]:.2f}"]
            for seg in curve:
                if seg.is_corner:
                    d.append(f"L {seg.c[0]:.2f} {seg.c[1]:.2f} L {seg.end_point[0]:.2f} {seg.end_point[1]:.2f}")
                else:
                    d.append(f"C {seg.c1[0]:.2f} {seg.c1[1]:.2f} {seg.c2[0]:.2f} {seg.c2[1]:.2f} "
                             f"{seg.end_point[0]:.2f} {seg.end_point[1]:.2f}")
            parts.append(f'<path d="{" ".join(d)} Z" fill="black"/>')
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
               f'viewBox="0 0 {w} {h}">{"".join(parts)}</svg>')
        out_svg.write_text(svg, encoding="utf-8")
        return out_svg
    except ImportError:
        pass

    # 備援：OpenCV 輪廓 → polyline SVG（線條較硬，但完全不用額外套件）
    contours, _ = cv2.findContours((line < 128).astype(np.uint8), cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    h, w = line.shape
    parts = []
    for c in contours:
        # 用周長而非面積過濾：線稿的筆畫是細長的，面積接近 0，
        # 用 contourArea 篩會把所有線條都當成雜點刪掉。
        if cv2.arcLength(c, True) < 20:
            continue
        approx = cv2.approxPolyDP(c, 1.2, True).reshape(-1, 2)
        pts = " ".join(f"{x},{y}" for x, y in approx)
        parts.append(f'<polyline points="{pts}" fill="none" stroke="black" stroke-width="1.5"/>')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
           f'viewBox="0 0 {w} {h}"><rect width="{w}" height="{h}" fill="white"/>{"".join(parts)}</svg>')
    out_svg.write_text(svg, encoding="utf-8")
    return out_svg


def save(img: np.ndarray, path: Path) -> Path:
    cv2 = _require_cv2()
    path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(path), img)
    return path
