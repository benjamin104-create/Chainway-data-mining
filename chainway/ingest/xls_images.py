"""從舊版 .xls 指示書裡把內嵌圖片挖出來。

## 為什麼需要這一支

新版 .xlsx 是一個 zip，圖片就躺在 `xl/media/` 底下，解壓縮就有了。
舊版 .xls 不是 zip，是 OLE2 複合文件，所以原本的抽圖程式第一行就擋掉：

    if path.suffix.lower() not in (".xlsx", ".xlsm"):
        return pd.DataFrame()

代價是整批舊季看不見。實際追一款 KA1185113（2022 夏）：整個桌面
276,070 個檔案裡，只有一個檔案含這個貨號 ——
`裁縫指示書\\KA118\\KA1185113-0325.XLS`。系統圖資料夾裡沒有它，
指示書又抽不出圖，於是這一款在整套系統裡等於不存在。

## 做法：掃位元組，不解析格式

.xls 裡的圖片存在 Escher／MSODRAWING 的 BLIP 記錄裡。完整解析那套格式
要處理一堆版本差異與巢狀結構，而我們只想要圖片本身 ——
而 BLIP 記錄裡放的就是**一整個完整的 JPEG／PNG 位元組流**，
連檔頭帶結尾標記都在。

所以直接掃檔案找影像的起訖標記：

    JPEG  \\xff\\xd8\\xff ... \\xff\\xd9
    PNG   \\x89PNG\\r\\n\\x1a\\n ... IEND\\xaeB`\\x82

這個做法看起來粗暴，但它有一個關鍵優點：**每一個候選都會被 PIL 實際打開
驗證過**。掃錯了、切歪了、或撈到別的東西，PIL 就開不起來，直接丟掉。
所以誤收的風險由驗證擋住，而不是由掃描的精確度擋住。

## 為什麼不轉檔

用 LibreOffice 把 .xls 轉成 .xlsx 再走原本的路，看起來乾淨得多。
但那要在使用者的 Windows 電腦上裝 LibreOffice，而這整套的前提是
「雙擊一個 .bat 就好」。多一個要安裝的東西，就多一個會卡住的地方。

## 已知的限制

抽出來的圖沒有順序資訊，也不知道它在工作表的哪個位置 —— .xlsx 那條路
同樣沒有。要分辨「哪張是打樣照片、哪張是布樣」靠的是 `ingest.image_kind`
的內容判斷，跟這裡無關。
"""
from __future__ import annotations

import hashlib
import io
from pathlib import Path
from typing import Any, Iterator

import pandas as pd

JPEG_START = b"\xff\xd8\xff"
JPEG_END = b"\xff\xd9"
PNG_START = b"\x89PNG\r\n\x1a\n"
PNG_END = b"IEND\xaeB`\x82"

# 小於這個尺寸的多半是圖示、按鈕、外框線，不是內容。
# 指示書裡真正有用的圖（打樣照片、布樣、繡花圖稿）都遠大於此。
MIN_SIDE = 64
MIN_BYTES = 2048


def _scan(data: bytes, start: bytes, end: bytes) -> Iterator[bytes]:
    """在位元組流裡找出所有 start…end 的區段。

    找 end 時從 start 之後開始找，並取**第一個**結尾 —— 取最後一個
    會把兩張相鄰的圖黏成一張（前一張的檔頭配後一張的結尾），
    PIL 多半還是開得起來，但畫面是壞的，而且不會報錯。
    """
    i = 0
    n = len(data)
    while True:
        s = data.find(start, i)
        if s < 0:
            return
        e = data.find(end, s + len(start))
        if e < 0:
            return
        yield data[s:e + len(end)]
        i = e + len(end)


def extract(path: str | Path, out_dir: str | Path,
            sku: str | None = None) -> pd.DataFrame:
    """把一份 .xls 裡的圖抽到 out_dir/<sku>/，回傳每張圖的資訊。"""
    from PIL import Image

    path = Path(path)
    if path.suffix.lower() not in (".xls", ".xlt"):
        return pd.DataFrame()
    try:
        raw = path.read_bytes()
    except OSError:
        return pd.DataFrame()

    sku = sku or path.stem
    dest = Path(out_dir) / sku
    seen: set[str] = set()
    rows: list[dict[str, Any]] = []

    candidates = list(_scan(raw, JPEG_START, JPEG_END))
    candidates += list(_scan(raw, PNG_START, PNG_END))

    for blob in candidates:
        if len(blob) < MIN_BYTES:
            continue
        # 內容雜湊去重。同一張圖在 .xls 裡常常存好幾份
        # （縮圖快取、複製貼上的副本），檔名不同但位元組一樣。
        h = hashlib.sha1(blob).hexdigest()
        if h in seen:
            continue
        # 唯一的把關：實際打開它。開不起來就是掃錯了。
        try:
            im = Image.open(io.BytesIO(blob))
            im.load()
        except Exception:
            continue
        w, ht = im.size
        if w < MIN_SIDE or ht < MIN_SIDE:
            continue
        seen.add(h)
        dest.mkdir(parents=True, exist_ok=True)
        ext = (im.format or "jpeg").lower()
        ext = {"jpeg": "jpg"}.get(ext, ext)
        target = dest / f"{sku}_{h[:8]}.{ext}"
        target.write_bytes(blob)
        rows.append({
            "sku": sku, "image_path": str(target), "file_name": target.name,
            "width": w, "height": ht, "format": ext, "bytes": len(blob),
            "source": "xls",
        })
    return pd.DataFrame(rows)


def extract_any(path: str | Path, out_dir: str | Path,
                sku: str | None = None) -> pd.DataFrame:
    """新舊格式都收。呼叫端不必自己判斷副檔名 —— 判斷分散在呼叫端，
    就會有某一處忘了更新，然後又是一整批安靜地被跳過。"""
    from .techpack import extract_techpack_images

    p = Path(path)
    if p.suffix.lower() in (".xlsx", ".xlsm"):
        return extract_techpack_images(p, out_dir, sku)
    if p.suffix.lower() in (".xls", ".xlt"):
        return extract(p, out_dir, sku)
    return pd.DataFrame()
