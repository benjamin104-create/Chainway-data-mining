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


# ── 依 3,279 份實際指示書的掃描結果建立（不是猜的）────────────────
#
# 掃描發現三件事，直接決定了下面的規則：
#
# 1. 「請對格子」/「□請對格子」出現 5,088 次、覆蓋 78.6% 的檔 —— 那是
#    表單樣板上的縫製要求勾選項，不是這件衣服的設計特徵。當特徵用等於
#    給八成的款貼同一個標籤，毫無區辨力。必須排除。
# 2. 「價格」裡有「格」字，801 次純屬關鍵字誤中。必須排除。
# 3. 位置詞極少：門襟 2.9%、配格 1.3%、領台 0.3%。所以「格紋配置在哪」
#    多半是畫在線圖上而非寫成文字 —— 要靠抽內嵌圖來看，不能靠文字。
#
# 因此這裡只擷取「文字裡真的存在且有區辨力」的東西。
NOISE_PATTERNS = [
    r"請對格子", r"對格子", r"價格", r"單價", r"售價", r"成本",
]

# 格紋配色：使用者辨識流程的第二步（「綠色，我們很少用」）。
# 這是規格欄位，不是影像推測 —— 準確度不同級。
PLAID_COLOR_PATTERNS = {
    "卡其格": r"卡格|卡其格",
    "藍格": r"藍格",
    "紅格": r"紅格",
    "粉格": r"粉格",
    "綠格": r"綠格",
    "黑格": r"黑格",
    "灰格": r"灰格",
    "咖啡格": r"咖啡格|棕格",
}

# 裁法：正裁 / 斜裁。斜裁的格子呈 45 度，視覺差異極大。
PLAID_CUT_PATTERNS = {"正格": r"正格", "斜格": r"斜格|斜卡其格|斜卡其"}

# 格紋的呈現形式（不是位置，是形式）
PLAID_FORM_PATTERNS = {
    "格紋布": r"格布(?!色)|格紋布",
    "格紋織帶": r"格紋織帶|格.{0,4}織帶",
    "格標": r"格標",
}

# 繡法：覆蓋 18.5% 的檔，是實打實的工藝差異
EMBROIDERY_PATTERNS = {
    "電繡": r"電繡", "貼布繡": r"貼布繡", "繡花": r"繡花",
    "繡片": r"繡片", "繡雞眼": r"繡雞眼", "刺繡": r"刺繡",
}

# 位置詞：只收覆蓋率低的。低覆蓋才有區辨力 —— 有寫的那少數幾件才是特例。
# 刻意不收「袖口」：它覆蓋 62.6%，因為那是尺寸表的欄位名稱，
# 跟「請對格子」一樣屬於樣板文字，當特徵用會給六成的款貼同一個標籤。
PLACEMENT_PATTERNS = {
    "門襟": r"門襟|前襟",      # 2.9%
    "領台": r"領台|領座",      # 0.3%
    "下襬": r"下擺|下襬",      # 4.8%
    "口袋": r"口袋",           # 7.7%
    "滾邊": r"滾邊",           # 3.6%
}


def _strip_noise(text: str) -> str:
    for pat in NOISE_PATTERNS:
        text = re.sub(pat, "", text)
    return text


def classify_notes(cells: list[str]) -> dict[str, Any]:
    """把一份指示書的文字轉成結構化的設計欄位。

    每一欄都可能是多值（一件衣服可以同時有電繡與貼布繡），
    以頓號串接，保留全部而不強制單選 —— 硬選一個會丟資訊。
    """
    blob = _strip_noise(" ".join(cells))
    hit = lambda table: [k for k, pat in table.items() if re.search(pat, blob)]

    colors = hit(PLAID_COLOR_PATTERNS)
    forms = hit(PLAID_FORM_PATTERNS)
    return {
        "格紋配色": "、".join(colors) or None,
        "格紋裁法": "、".join(hit(PLAID_CUT_PATTERNS)) or None,
        "格紋形式": "、".join(forms) or None,
        "繡法": "、".join(hit(EMBROIDERY_PATTERNS)) or None,
        "提及部位": "、".join(hit(PLACEMENT_PATTERNS)) or None,
        # 有格紋布或格紋織帶或指定了配色，就認定這件用了格紋
        "含格紋": bool(colors or forms),
    }


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
            rec.update(classify_notes(_cells_of(path)))
            rec["sku"] = m.group(1)
            rows.append(rec)
            if limit and len(rows) >= limit:
                return pd.DataFrame(rows)
    return pd.DataFrame(rows)
