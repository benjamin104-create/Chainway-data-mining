"""把報表片段包成可以直接用瀏覽器打開的完整 HTML 檔。

## 為什麼需要這一層

報表模組產出的是「片段」：<title> + <link> + <style> + 內容，沒有
<!doctype> 也沒有 <head>。那是為了發佈成網頁而寫的 —— 發佈時外層會補上。

但同一份片段存成本機檔案、用瀏覽器直接開的時候，就沒有人補了。
**最要命的是缺少 <meta charset="utf-8">**：瀏覽器只好用猜的，
繁體中文版 Windows 的 Edge 會猜成 Big5，於是整份報表的中文變成亂碼。

檔案內容是對的、編碼也是對的，只是沒有人告訴瀏覽器它是 UTF-8。
一行宣告的事，卻讓整份報表看起來像壞掉。

## 為什麼不乾脆讓每個報表都自己寫完整文件

因為同一份報表要走兩條路：發佈成網頁，以及存成本機檔案給人寄送。
發佈那條路外層已經有 <head>，再自己寫一個會變成兩層。
所以片段保持片段，要落地成檔案時再包 —— 包裝的責任放在「寫檔」那一端。
"""
from __future__ import annotations

# 和發佈環境一致的最小重置。沒有這幾行，本機開起來的邊界與線高
# 會跟發佈版本不一樣，看起來像兩份不同的報表。
RESET = (
    ":root{color-scheme:light dark}"
    "body{margin:0}"
    "img{max-width:100%}"
    "[hidden]{display:none!important}"
)


def as_document(fragment: str, *, lang: str = "zh-Hant") -> str:
    """片段 → 完整 HTML 文件。

    片段的慣例是 <title>…<link>…<style>…</style> 之後才是內容，
    所以在最後一個 </style> 切開：前半進 <head>，後半進 <body>。
    找不到 </style> 就整段放進 body —— 瀏覽器仍會把開頭的 title/link
    自動歸到 head，只是不那麼明確。
    """
    marker = "</style>"
    idx = fragment.rfind(marker)
    if idx >= 0:
        head, body = fragment[:idx + len(marker)], fragment[idx + len(marker):]
    else:
        head, body = "", fragment

    return (
        "<!doctype html>\n"
        f'<html lang="{lang}">\n<head>\n'
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
        f"<style>{RESET}</style>\n"
        f"{head}\n</head>\n<body>{body}</body>\n</html>\n"
    )


def write(path, fragment: str, *, lang: str = "zh-Hant") -> int:
    """存檔並回傳位元組數。一律加 BOM 之外的正規做法：meta charset。

    不用 utf-8-sig（BOM）：BOM 能讓 Excel 猜對，但在 HTML 裡它會被當成
    內容的一部分，某些情況下會在頁面最上方留下一個看不見的字元。
    meta charset 才是對 HTML 說話的正確方式。
    """
    from pathlib import Path

    data = as_document(fragment, lang=lang)
    Path(path).write_text(data, encoding="utf-8")
    return len(data.encode("utf-8"))
