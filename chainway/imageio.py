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
