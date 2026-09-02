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


def load_rgb(path: str | Path, *, background: tuple[int, int, int] = WHITE):
    """開檔並轉 RGB。回傳的圖已經 load()，可以安全地在 with 之外使用。"""
    from PIL import Image

    with Image.open(path) as im:
        im.load()
        return to_rgb(im, background=background)
