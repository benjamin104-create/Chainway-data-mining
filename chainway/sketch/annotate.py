"""線稿標註：在線稿上加箭頭、編號、中文說明，做成一張可以直接發給版師的參考頁。

輸出的排版是三欄：
    左：原始市調照（裁切後）
    中：線稿
    右：平塗彩現 + 色票
下方是編號標註與「建議如何應用」的文字說明。
"""

from __future__ import annotations

import platform
from pathlib import Path

import numpy as np

from ..config import Config, get_config

# 常見中文字型位置，找到哪個用哪個
FONT_CANDIDATES = [
    "C:/Windows/Fonts/msjh.ttc",            # 微軟正黑體
    "C:/Windows/Fonts/mingliu.ttc",
    "/System/Library/Fonts/PingFang.ttc",   # macOS
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
]


def find_font(cfg: Config | None = None, size: int = 24):
    from PIL import ImageFont

    cfg = cfg or get_config()
    configured = cfg.get("sketch", {}).get("annotation_font")
    for path in ([configured] if configured else []) + FONT_CANDIDATES:
        if path and Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return None  # 呼叫端會退回英數字標註並提醒使用者設定字型


def font_warning(cfg: Config | None = None) -> str | None:
    if find_font(cfg, 20) is not None:
        return None
    hint = {
        "Windows": 'C:/Windows/Fonts/msjh.ttc',
        "Darwin": '/System/Library/Fonts/PingFang.ttc',
    }.get(platform.system(), '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc')
    return (f"找不到中文字型，標註會顯示成方框。請在 config/settings.yaml 設定："
            f"\n  sketch.annotation_font: \"{hint}\"")


def annotate(
    line_img: np.ndarray,
    notes: list[dict],
    cfg: Config | None = None,
    title: str = "",
) -> np.ndarray:
    """在線稿上畫編號圓點 + 引線 + 側邊說明。

    notes 每筆格式：
      {"point": (0.42, 0.18), "label": "橫開領", "note": "建議縮 1.5cm，避免肩線滑落"}
      point 為 0–1 的相對座標。
    """
    from PIL import Image, ImageDraw

    cfg = cfg or get_config()
    base = Image.fromarray(line_img if line_img.ndim == 3 else np.stack([line_img] * 3, -1)).convert("RGB")
    w, h = base.size
    panel_w = max(360, int(w * 0.55))
    canvas = Image.new("RGB", (w + panel_w, max(h, 120 + 46 * len(notes))), "white")
    canvas.paste(base, (0, 0))

    draw = ImageDraw.Draw(canvas)
    f_title = find_font(cfg, 28)
    f_body = find_font(cfg, 20)
    f_num = find_font(cfg, 18)

    y = 24
    if title:
        draw.text((w + 20, y), title, fill="black", font=f_title)
        y += 46
    draw.line([(w + 16, y), (w + panel_w - 16, y)], fill="#999", width=1)
    y += 18

    accent = (200, 40, 40)
    for i, n in enumerate(notes, start=1):
        px, py = n.get("point", (0.5, 0.5))
        cx, cy = int(px * w), int(py * h)
        r = 16
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=accent, width=3, fill="white")
        draw.text((cx - 5, cy - 10), str(i), fill=accent, font=f_num)
        draw.line([(cx + r, cy), (w + 12, y + 10)], fill=accent, width=2)

        label = n.get("label", "")
        note = n.get("note", "")
        draw.text((w + 20, y), f"{i}. {label}", fill=accent, font=f_body)
        y += 26
        for chunk in _wrap(note, 22):
            draw.text((w + 38, y), chunk, fill="#333", font=f_body)
            y += 24
        y += 10

    return np.array(canvas)


def _wrap(text: str, width: int) -> list[str]:
    """中文按字數斷行（中文沒有空白可切）。"""
    text = str(text or "")
    return [text[i:i + width] for i in range(0, len(text), width)] or [""]


def contact_sheet(
    original: np.ndarray,
    line: np.ndarray,
    render: np.ndarray,
    palette: list[dict],
    title: str,
    cfg: Config | None = None,
) -> np.ndarray:
    """三欄對照頁：原圖 / 線稿 / 彩現 + 色票條。"""
    from PIL import Image, ImageDraw

    cfg = cfg or get_config()
    cell_h = 640

    def to_pil(a: np.ndarray) -> "Image.Image":
        arr = a if a.ndim == 3 else np.stack([a] * 3, -1)
        # OpenCV 是 BGR，PIL 是 RGB
        img = Image.fromarray(arr[:, :, ::-1] if arr.shape[2] == 3 else arr)
        ratio = cell_h / img.height
        return img.resize((int(img.width * ratio), cell_h))

    panels = [to_pil(original), to_pil(line), to_pil(render)]
    labels = ["① 市調原圖（重點裁切）", "② 線稿 Line Art", "③ 平塗彩現參考"]

    gap, pad_top, pad_bottom = 24, 80, 185   # bottom 要放得下面板標籤 + 色票 + 色碼文字
    total_w = sum(p.width for p in panels) + gap * (len(panels) + 1)
    canvas = Image.new("RGB", (total_w, cell_h + pad_top + pad_bottom), "white")
    draw = ImageDraw.Draw(canvas)

    f_title = find_font(cfg, 32)
    f_label = find_font(cfg, 22)
    f_small = find_font(cfg, 18)

    draw.text((gap, 22), title, fill="black", font=f_title)
    x = gap
    for panel, label in zip(panels, labels):
        canvas.paste(panel, (x, pad_top))
        draw.text((x, pad_top + cell_h + 10), label, fill="#333", font=f_label)
        x += panel.width + gap

    # 色票條
    sy = pad_top + cell_h + 48
    sx = gap
    draw.text((sx, sy), "主色票（依面積佔比）", fill="#333", font=f_label)
    sy += 30
    for c in palette[:8]:
        # 色塊寬度至少要放得下 "#RRGGBB 99%" 這行字，否則標籤會互相疊在一起
        bw = max(112, int(c["share"] * 600))
        draw.rectangle([sx, sy, sx + bw, sy + 44], fill=c["hex"], outline="#888")
        draw.text((sx + 4, sy + 50), f"{c['hex']} {c['share']:.0%}", fill="#333", font=f_small)
        sx += bw + 12

    return np.array(canvas)[:, :, ::-1]  # 轉回 BGR 供 cv2.imwrite
