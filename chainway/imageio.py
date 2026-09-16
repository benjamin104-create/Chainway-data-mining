"""統一的載圖入口。所有量測都必須從這裡拿圖。

## 為什麼需要這支

PIL 的 `img.convert("RGB")` 會把透明像素變成**黑色**。指示書裡抽出來的
圖有相當一部分是帶透明背景的 PNG（章戳、去背的圖稿），它們在人眼看是
白底，轉成 RGB 之後整片背景變全黑。

實測「可生產大貨」那張紅色章戳：

    PIL 直接轉 RGB    白底比例 0.00  → 分類「其他」
    先合成到白底      白底比例 0.79  → 分類「章戳/標記」

白底比例是圖片分類的主要訊號之一，一整類的圖全部量錯，而且錯得無聲無息
—— 沒有例外、沒有警告，只是分類結果莫名其妙。上一次踩到「量測本身壞掉、
卻拿去當評測基準」的坑是 Top-1 1.29%，那次是尺寸當內容用。這次是背景色。

所以載圖這件事不再讓各處自己做。

## 為什麼合成到白色而不是別的

指示書的排版底色是白的，去背 PNG 的設計意圖就是「貼在白紙上」。
合成到白底等於還原它被看見時的樣子。
"""
from __future__ import annotations

from pathlib import Path

WHITE = (255, 255, 255)

# PIL 預設在 8,900 萬像素以上會警告（防解壓縮炸彈）。指示書裡有掃描整頁的
# 圖，實測有一張 1.26 億像素 —— 那是真的圖，不是攻擊，但完整解碼成 RGB
# 要吃掉約 380MB 記憶體。所以把上限明確調高，同時在載入時用 draft()
# 讓 JPEG 在解碼階段就縮小，不要先展開成全尺寸再縮。
MAX_PIXELS = 250_000_000
# 分析用不到超過這個邊長。位置與顏色都是相對量，解析度再高也不會更準。
DECODE_MAX_SIDE = 2000
# 一列要多「平」才算得上是後製貼的純色字幕帶（見 blank_caption_band）。
FLAT_TOL = 4


def _configure() -> None:
    from PIL import Image

    if Image.MAX_IMAGE_PIXELS is None or Image.MAX_IMAGE_PIXELS < MAX_PIXELS:
        Image.MAX_IMAGE_PIXELS = MAX_PIXELS


def to_rgb(img, *, background: tuple[int, int, int] = WHITE):
    """把任何模式的圖轉成 RGB，透明處合成到 background 而不是黑色。"""
    from PIL import Image

    if img.mode == "RGB":
        return img
    # P 模式的透明資訊放在 info["transparency"]，不轉成 RGBA 就讀不到
    if img.mode in ("RGBA", "LA") or (
            img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        canvas = Image.new("RGB", rgba.size, background)
        canvas.paste(rgba, mask=rgba.split()[3])
        return canvas
    return img.convert("RGB")


def blank_caption_band(img, max_frac: float = 0.30, tol: int = 12):
    """把系統圖底部印著貨號的字幕帶**填成白色**（不是裁掉）。

    實際系統圖底部有一條純色帶，上面印著貨號（例如「KA1583008」）。
    量過 300 張 283×354 的系統圖：帶子從 y=268 開始，**佔畫面高度 24.3%**，
    而且每張圖都一樣（帶內跨圖標準差 17.3，帶外 66.1）。
    顏色簽名的 3×3 最底下一排有 73% 是這條帶子，4×4 是 97%。

    ## ⚠️ 不要把這支接進比對流程 —— 量過三種做法，不動它最好

    條件完全相同的三組對照（fingerprint.verify 協定、全庫 3,321 款候選、
    simulate() 退化後的模擬手機拍、40 題、固定種子）：

        原圖（完全不動）   Top-1 15.0%   Top-5 20.0%   ← 最好
        填白              Top-1  5.0%   Top-5 20.0%
        裁切              Top-1  7.5%   Top-5 17.5%

    去掉字幕帶**兩種做法都讓 Top-1 變差**，填白甚至比裁切更糟。
    原因還不清楚 —— 原本以為裁切的問題在改變長寬比，但填白保持了原尺寸
    卻更差，所以那個解釋不成立。

    n=40 很小（15.0% 是 6/40、5.0% 是 2/40），差異未達統計顯著。
    但三組裡沒有任何一組贏過「不動」，所以目前的做法是不動。
    要翻案請先把題數拉到 n≥300 再說。

    這支目前只有 features/fashion_clip.py 在用（CLIP 對大片色塊與文字
    敏感，那條路上裁掉是合理的）。比對路徑 grid.py / keypoints.py /
    fingerprint.py / selfeval.py **刻意不呼叫它**。

    另外記一筆已推翻的假設，避免有人再繞回去：ORB 關鍵點確實有 34.0%
    落在只佔 24% 面積的帶子裡，看起來像「在讀印上去的貨號」。但只留帶子
    去查的結果是 Top-1 0.0%（亂猜是 0.03%）—— 那些關鍵點配不出任何東西。
    字幕帶不帶可檢索訊號，但拿掉它也不會變好。

    作法：由下往上找「每一列都是同一個顏色」的連續區塊，
    碰到第一列有明顯色彩變化就停。找不到就原圖返回。
    """
    import numpy as np

    a = np.asarray(to_rgb(img)).astype(np.int16)
    h = a.shape[0]
    if h < 20:
        return img
    limit = max(1, int(h * max_frac))

    # 用每列的「中位數顏色」而不是平均或全列純色：字幕帶上印著貨號文字，
    # 那幾列並非純色，但文字像素佔比小，中位數仍然是底色。
    row_median = np.median(a, axis=1)

    ref = row_median[h - 1]

    cut = h
    for y in range(h - 1, h - limit - 1, -1):
        if np.abs(row_median[y] - ref).max() <= tol:
            cut = y
        else:
            break

    if h - cut < h * 0.05:
        return img                      # 太薄，不像字幕帶

    # 整段的平坦度。字幕帶是後製貼上去的純色塊，實測每列 MAD 是 0.0–1.3；
    # 照片底部就算顏色接近均勻（牆面、地板、桌面）也帶紋理，MAD 有 8–20。
    # 少了這道檢查，手機實拍會被當成字幕帶切掉一截 ——
    # 實測 IMG_5738（2000×1500 吊掛實拍）被誤切 193px，佔畫面 12.9%。
    #
    # 取整段的**中位數**而不是逐列都要求平坦：帶子上印著貨號，那幾列有
    # JPEG 振鈴，MAD 會偏高。逐列嚴格判定會在第一列文字就停住 ——
    # 實測 KA1165101（8.7KB、壓得很兇）只裁到 8.2%，帶子還剩一大半。
    band = a[cut:]
    band_median = np.median(band, axis=1)
    band_mad = np.median(np.abs(band - band_median[:, None, :]),
                         axis=1).mean(axis=1)
    if float(np.median(band_mad)) > FLAT_TOL:
        return img                      # 底部是紋理，不是純色帶

    # 關鍵防呆：字幕帶的顏色必須和「整張圖的背景色」明顯不同。
    # 背景色取**上緣**兩個角落的中位數（下緣角落就是帶子本身）。
    # 少了這道檢查，商品下方單純留白的圖會被當成字幕帶切掉一截，
    # 淺色下擺就跟著不見了。
    k = max(2, min(h, a.shape[1]) // 20)
    corners = np.concatenate([
        a[:k, :k].reshape(-1, 3), a[:k, -k:].reshape(-1, 3),
    ])
    background = np.median(corners, axis=0)
    if np.abs(background - ref).max() <= tol:
        return img                      # 底部那塊就是背景，不是字幕帶

    # 尺寸維持原樣，只把帶子那幾列改成白底 —— 白底跟系統圖去背後的背景一致，
    # 所以那幾格會被 garment_mask 當成背景排除，而不是當成一塊有顏色的布。
    out = np.asarray(to_rgb(img)).copy()
    out[cut:] = WHITE
    from PIL import Image
    return Image.fromarray(out)


def load_rgb(path: str | Path, *, background: tuple[int, int, int] = WHITE,
             max_side: int = DECODE_MAX_SIDE):
    """開檔並轉 RGB。回傳的圖已經 load()，可以安全地在 with 之外使用。

    超大的圖用 draft() 在解碼階段就縮小 —— 先展開成全尺寸再縮，
    一張 1.26 億像素的掃描頁會瞬間吃掉幾百 MB，而後續分析根本用不到
    那個解析度。draft() 只對 JPEG 有效，其他格式解碼後再縮。
    """
    from PIL import Image

    _configure()
    with Image.open(path) as im:
        if max_side and max(im.size) > max_side:
            try:
                im.draft("RGB", (max_side, max_side))
            except Exception:
                pass        # 非 JPEG 沒有 draft，照常走下面的路
        im.load()
        out = to_rgb(im, background=background)
        if max_side and max(out.size) > max_side:
            out = out.copy()
            out.thumbnail((max_side, max_side))
        return out
