"""影像庫比對稽核：為什麼有些款找不到系統圖。

## 為什麼要有這一支

主表 2,854 款，系統圖庫索引到 2,859 個貨號，數量幾乎一樣 ——
但只有 2,166 款對得上（75.9%）。688 款找不到圖。

數量對得上卻對不起來，那就不是「圖不夠」，是**兩邊的貨號寫法不一樣**。
這種問題沒辦法用猜的解決：可能是大小寫、可能是檔名多了前後綴、
可能是分隔符號、也可能是那批圖真的還沒歸檔。每一種的修法完全不同：
改程式、改檔名、還是去要圖。

所以這支的工作是**把 688 款分類**，每一類給出「這一類長什麼樣」的實例，
讓人能決定要修哪一邊。

## 做法：逐層放寬，第一個對上的那一層就是原因

    第 0 層  現行規則 KA\\d{7}（已經失敗）
    第 1 層  忽略大小寫              → 原因是大小寫
    第 2 層  去掉分隔符號與空白      → 原因是 KA-115-1001 這種寫法
    第 3 層  只比七位數字            → 原因是前綴不是 KA
    第 4 層  比前六位                → 原因是流水號差一位／打錯
    都不中                          → 影像庫裡真的沒有這一款

第一個對上的層就是原因，因為每一層都比上一層更寬鬆。層的順序即嚴重度：
第 1、2 層改程式就好，第 4 層要人去核對，最後一層要去要圖。

## 反向也要看

只看「款找不到圖」會漏掉另一半：影像庫裡有一堆檔案，它們的貨號不在
主表裡，或者根本認不出貨號。前者可能是舊季、樣衣、或貨號打錯；
後者可能是命名沒有規則。兩邊一起看才知道問題出在哪一側。
"""
from __future__ import annotations

import re
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

import pandas as pd

# 現行規則。和 report.inventory_report.index_images 一致，
# 改這裡之前先確認那邊也要改 —— 兩邊不同步，稽核就會說謊。
STRICT = re.compile(r"KA\d{7}")

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
# 這些是影像，但現行規則不收。列出來讓人知道有沒有整批圖因為格式被跳過。
OTHER_IMAGE_EXTS = {".tif", ".tiff", ".gif", ".heic", ".heif", ".psd",
                    ".ai", ".eps", ".svg", ".jfif", ".avif"}

SEP = re.compile(r"[\s\-_.·・﹣－_()\[\]]+")


def _norm(s: str) -> str:
    """全形轉半形、去分隔符號、轉大寫。只用來找原因，不用來當正式比對。"""
    out = []
    for ch in s:
        o = ord(ch)
        # 全形英數與空白轉半形。檔名從 Excel 或輸入法帶出來時很常見，
        # 肉眼完全看不出差別，但字串比對一定失敗。
        if 0xFF01 <= o <= 0xFF5E:
            out.append(chr(o - 0xFEE0))
        elif o == 0x3000:
            out.append(" ")
        else:
            out.append(ch)
    return SEP.sub("", "".join(out)).upper()


def scan_images(roots: Iterable[Path]) -> dict[str, Any]:
    """掃過影像庫，回傳各種索引與統計。一次掃完，後面全部離線算。"""
    files: list[Path] = []
    ext_count: Counter[str] = Counter()
    skipped_other: list[Path] = []
    for root in roots:
        if not root or not Path(root).exists():
            continue
        for p in Path(root).rglob("*"):
            if not p.is_file() or p.name.startswith(("~$", ".")):
                continue
            ext = p.suffix.lower()
            ext_count[ext] += 1
            if ext in IMAGE_EXTS:
                files.append(p)
            elif ext in OTHER_IMAGE_EXTS:
                skipped_other.append(p)

    strict: dict[str, Path] = {}
    norm_hits: dict[str, Path] = {}      # 正規化後的檔名 → 檔案
    digits: dict[str, Path] = {}         # 檔名裡的七位數字 → 檔案
    prefix6: dict[str, list[Path]] = {}  # 前六位 → 檔案
    unnamed: list[Path] = []             # 認不出任何貨號的

    for p in files:
        m = STRICT.search(p.name)
        if m:
            strict.setdefault(m.group(0), p)
        n = _norm(p.name)
        norm_hits.setdefault(n, p)
        found = False
        for d in re.finditer(r"(?<!\d)(\d{7})(?!\d)", n):
            digits.setdefault(d.group(1), p)
            prefix6.setdefault(d.group(1)[:6], []).append(p)
            found = True
        if not found and not m:
            unnamed.append(p)

    return {"files": files, "ext_count": ext_count,
            "skipped_other": skipped_other, "strict": strict,
            "norm": norm_hits, "digits": digits, "prefix6": prefix6,
            "unnamed": unnamed}


def _one_off(a: str, b: str) -> bool:
    """兩串數字是不是只差一個打字錯誤：一碼打錯，或相鄰兩碼顛倒。

    不用通用的編輯距離函式 —— 這裡只需要距離 1，而且要排除
    「插入／刪除」造成的長度改變（貨號長度是固定的，長度不同就是別的東西）。
    """
    if len(a) != len(b) or a == b:
        return False
    diff = [i for i, (x, y) in enumerate(zip(a, b)) if x != y]
    if len(diff) == 1:
        return True
    # 相鄰顛倒：1551006 → 1550106 這種
    if len(diff) == 2 and diff[1] == diff[0] + 1:
        i, j = diff
        return a[i] == b[j] and a[j] == b[i]
    return False


def _reason(sku: str, idx: dict[str, Any],
            known: set[str]) -> tuple[str, str]:
    """回傳 (原因, 佐證檔名)。逐層放寬，第一個對上的層就是原因。

    `known` 是主表所有款號（大寫）。前六位那一層需要它 —— 見下方說明。
    """
    up = sku.upper()
    if up in idx["strict"]:
        return "", ""

    # 第 1 層：只差大小寫。要比原始檔名，不能比正規化後的字串 ——
    # 正規化把分隔符號也去掉了，兩種原因會混在一起，而它們的修法不同
    # （大小寫改一行程式，分隔符號要決定改程式還是改檔名）。
    for key, p in idx["norm"].items():
        if up in p.name.upper():
            return "大小寫不同", p.name

    # 第 2 層：去掉分隔符號與全形之後才對得上
    n = _norm(sku)
    for key, p in idx["norm"].items():
        if n in key:
            return "檔名有分隔符號或全形字", p.name

    # 第 3 層：只比數字
    m = re.search(r"(\d{7})", up)
    if m and m.group(1) in idx["digits"]:
        return "檔名沒有 KA 前綴", idx["digits"][m.group(1)].name

    # 第 4 層：只差一碼的「孤兒圖」。
    #
    # 一開始寫的是「前六位相同」，抓不到最常見的情形 ——
    # 1551006 打成 1551096，前六位就已經不同了。改用編輯距離：
    # 一個字元被打錯，或相鄰兩碼顛倒。
    #
    # 而且只認**孤兒圖**：那張圖的貨號不在主表裡，才有可能是這一款打錯字。
    # 已經歸屬於別款的圖不是候選 —— 少了這個條件，
    # 「影像庫裡真的沒有」會被大量誤報成「貨號打錯」。
    if m:
        for code, cand in idx["orphans"].items():
            if _one_off(m.group(1), code):
                return "有一張很像的圖，貨號差一碼", cand.name

    return "影像庫裡沒有這一款", ""


def diagnose(master: pd.DataFrame, roots: Iterable[Path], *,
             sku_col: str | None = None) -> dict[str, Any]:
    """主表 × 影像庫 → 對不上的原因分類。"""
    idx = scan_images(roots)
    col = sku_col or next(
        (c for c in ("款號", "style_code", "sku") if c in master.columns), None)
    if col is None:
        raise ValueError("主表找不到款號欄位")

    skus = (master[col].dropna().astype(str).str.strip()
            .loc[lambda s: s.ne("")].unique().tolist())

    known = {s.upper() for s in skus}
    # 孤兒圖：影像庫有、主表沒有。只有這些才可能是「貨號打錯」的來源。
    idx["orphans"] = {re.search(r"(\d{7})", k).group(1): v
                      for k, v in idx["strict"].items()
                      if k.upper() not in known and re.search(r"(\d{7})", k)}
    rows = []
    for sku in skus:
        if sku.upper() in idx["strict"]:
            continue
        why, ev = _reason(sku, idx, known)
        rows.append({"款號": sku, "原因": why, "影像庫裡疑似的檔名": ev})
    miss = pd.DataFrame(rows)

    # 反向：影像庫有、主表沒有
    extra = sorted(k for k in idx["strict"] if k.upper() not in known)

    return {
        "主表款數": len(skus),
        "影像庫貨號數": len(idx["strict"]),
        "對上": len(skus) - len(miss),
        "對不上": len(miss),
        "明細": miss,
        "原因統計": (miss["原因"].value_counts().rename_axis("原因")
                     .reset_index(name="款數") if not miss.empty
                     else pd.DataFrame()),
        "影像庫有但主表沒有": extra,
        "認不出貨號的檔案": [p.name for p in idx["unnamed"]],
        "被跳過的影像格式": [p.name for p in idx["skipped_other"]],
        "副檔名統計": idx["ext_count"],
    }
