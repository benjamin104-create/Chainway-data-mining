"""從裁縫指示書挖出設計註記（格紋配置、工法、特殊要求）。

為什麼這件事要單獨做：格紋配置寫在指示書上，那是設計師自己下的規格 ——
是答案本身，不是推測。讓 Fashion-CLIP 去猜「格紋在門襟還是領口」會帶著
不確定性，但指示書上白紙黑字寫著。有原始文件就不該用猜的。

方法論上刻意分兩步，不一步到位：

  第一步 scan_vocabulary()  先看貴司實際上怎麼寫，列出真實用詞與出現次數
  第二步 依真實用詞建對照表，才做分類

先前吃過虧：品類碼 5 我用「品名關鍵字的相關性」去推論它的意義，
結論完全錯了（它是經典格紋線，不是我推的工法分類）。相關性不等於定義。
所以這裡先看資料怎麼說，再決定怎麼歸類。
"""
from __future__ import annotations

import re
from collections import Counter
from pathlib import Path
from typing import Any

import pandas as pd

from ..config import Config, get_config

# 掃描時的關鍵字。先寬後窄 —— 寧可多撈一些再人工篩，
# 也不要一開始就用我猜的詞把真實用語濾掉。
DEFAULT_KEYWORDS = ["格", "配格", "對格", "拼接", "滾邊", "撞色", "門襟",
                    "領台", "袖口", "下襬", "口袋", "繡", "織帶"]

# 一格文字太長多半是整段工序說明，不是欄位值；截斷免得報表難讀
MAX_SNIPPET = 60


def _cells_of(path: Path) -> list[str]:
    """把一份指示書的所有儲存格攤成字串清單。"""
    try:
        sheets = pd.read_excel(path, sheet_name=None, header=None)
    except Exception:
        return []
    out: list[str] = []
    for df in sheets.values():
        for val in df.to_numpy().ravel():
            if val is None or (isinstance(val, float) and pd.isna(val)):
                continue
            s = str(val).strip()
            if s and not s.replace(".", "").replace("-", "").isdigit():
                out.append(s)
    return out


def scan_vocabulary(cfg: Config | None = None, keywords: list[str] | None = None,
                    limit: int | None = None) -> pd.DataFrame:
    """掃過所有指示書，回報含關鍵字的實際用詞與出現次數。

    這一步不做任何分類判斷，只是把「貴司到底怎麼寫」攤出來看。
    """
    cfg = cfg or get_config()
    keywords = keywords or DEFAULT_KEYWORDS
    roots = cfg.path_list("tech_packs")

    files: list[Path] = []
    for root in roots:
        if root.exists():
            files += [p for p in root.rglob("*.xls*")
                      if p.is_file() and not p.name.startswith(("~$", "."))]
    if limit:
        files = files[:limit]

    phrase_counts: Counter[str] = Counter()
    keyword_files: Counter[str] = Counter()
    example: dict[str, str] = {}
    scanned = 0

    for path in files:
        cells = _cells_of(path)
        if not cells:
            continue
        scanned += 1
        seen_here: set[str] = set()
        for cell in cells:
            for kw in keywords:
                if kw in cell:
                    snippet = cell[:MAX_SNIPPET]
                    phrase_counts[snippet] += 1
                    example.setdefault(snippet, path.name)
                    seen_here.add(kw)
        for kw in seen_here:
            keyword_files[kw] += 1

    rows = [{"用詞": p, "出現次數": n,
             "含此詞的檔數比例": None, "範例檔": example.get(p, "")}
            for p, n in phrase_counts.most_common()]
    df = pd.DataFrame(rows)
    df.attrs["scanned_files"] = scanned
    df.attrs["keyword_files"] = dict(keyword_files)
    return df


def keyword_coverage(vocab: pd.DataFrame) -> pd.DataFrame:
    """每個關鍵字出現在多少份指示書裡 —— 判斷哪些詞值得建對照表。"""
    scanned = vocab.attrs.get("scanned_files", 0) or 1
    rows = [{"關鍵字": k, "出現的檔數": n, "佔掃描檔比例": round(n / scanned, 3)}
            for k, n in sorted(vocab.attrs.get("keyword_files", {}).items(),
                               key=lambda kv: -kv[1])]
    return pd.DataFrame(rows)


def extract_notes(path: str | Path, keywords: list[str] | None = None) -> dict[str, Any]:
    """單一份指示書 → 命中的註記文字，供之後建立配置對照。"""
    keywords = keywords or DEFAULT_KEYWORDS
    cells = _cells_of(Path(path))
    hits = [c for c in cells if any(k in c for k in keywords)]
    return {"techpack_path": str(path), "n_cells": len(cells),
            "n_hits": len(hits), "notes": " | ".join(dict.fromkeys(hits))[:2000]}


def build_notes_table(cfg: Config | None = None, limit: int | None = None) -> pd.DataFrame:
    """所有指示書的註記彙總，以貨號為鍵，之後可併進主表。"""
    cfg = cfg or get_config()
    sku_re = re.compile(cfg.get("sku", {}).get("filename_pattern", r"(KA\d{7})"))
    rows = []
    for root in cfg.path_list("tech_packs"):
        if not root.exists():
            continue
        for path in root.rglob("*.xls*"):
            if not path.is_file() or path.name.startswith(("~$", ".")):
                continue
            m = sku_re.search(path.stem)
            if not m:
                continue
            rec = extract_notes(path)
            rec["sku"] = m.group(1)
            rows.append(rec)
            if limit and len(rows) >= limit:
                return pd.DataFrame(rows)
    return pd.DataFrame(rows)
