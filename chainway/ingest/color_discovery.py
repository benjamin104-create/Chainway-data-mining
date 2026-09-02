"""找出色號到底存在哪裡。

## 為什麼要找

POS 報表的貨號是 9 碼，拆開驗過：KA + 季別(3) + 品類(1，格紋線佔 2) + 流水號。
**沒有配色的位置** —— 它識別的是款，不是款×色。

但使用者說貨號裡有色號編碼。兩者不衝突：POS 為了做銷售彙總，多半只留款號；
完整的款×色編號會出現在檔名上（系統圖一色一張、指示書一色一份）。

這件事值得找，因為找到就等於**每一張系統圖都變成一個有標準答案的樣本**：
檔名給色號、圖片給顏色。有了幾千組配對，才談得上
「量出真實準確率」與「把調子的門檻校準到貴司的實際用色」——
而不是像現在只能用合成圖與色卡自我測試。

## 方法

不預設格式。先把貨號之後剩下的字串（後綴）全部收集起來、按出現次數排序，
讓人看貴司實際上怎麼命名。掃完自然會知道
「-13」是色號、「_2」是第二張圖、還是「(1)」是複製檔。

同一套順序用了三次（指示書用詞、圖片分類、現在是色號）：
先看資料怎麼說，再決定怎麼歸類。第一次沒這麼做的時候，我把品類碼 5
推論成工法分類，整個推錯。
"""
from __future__ import annotations

import re
from collections import Counter
from pathlib import Path
from typing import Any

import pandas as pd

from ..config import Config, get_config

SKU_RE = re.compile(r"(KA\d{7})", re.I)
# 兩位數色號的樣子：10–92。收得寬一點，篩選留給人做。
TWO_DIGIT = re.compile(r"(?<!\d)([1-9][0-9])(?!\d)")


def _suffix_of(stem: str) -> str:
    """貨號之後剩下的部分。找不到貨號回空字串。"""
    m = SKU_RE.search(stem)
    return stem[m.end():] if m else ""


def scan_filenames(cfg: Config | None = None, *,
                   keys: tuple[str, ...] = ("system_images", "tech_packs"),
                   limit: int | None = None) -> dict[str, Any]:
    """掃檔名，回報貨號後面接了什麼。

    回傳 {資料夾: DataFrame}，每列一種後綴樣式與出現次數，
    並附上「若把它當兩位數色號，落在合法範圍的比例」——
    那是判斷「這串數字是不是色號」最直接的證據。
    """
    cfg = cfg or get_config()
    out: dict[str, Any] = {}
    for key in keys:
        roots = [r for r in cfg.path_list(key) if r.exists()]
        if not roots:
            continue
        suffix_counts: Counter[str] = Counter()
        pattern_counts: Counter[str] = Counter()
        examples: dict[str, str] = {}
        n_files = n_with_sku = 0
        skus: Counter[str] = Counter()

        for root in roots:
            for p in root.rglob("*"):
                if not p.is_file() or p.name.startswith(("~$", ".")):
                    continue
                n_files += 1
                if limit and n_files > limit:
                    break
                m = SKU_RE.search(p.stem)
                if not m:
                    continue
                n_with_sku += 1
                skus[m.group(1).upper()] += 1
                suf = _suffix_of(p.stem)
                suffix_counts[suf] += 1
                # 把數字換成 # 得到「樣式」，看命名規則而不是看個別值
                pat = re.sub(r"\d", "#", suf)
                pattern_counts[pat] += 1
                examples.setdefault(pat, p.name)

        rows = []
        for pat, n in pattern_counts.most_common(30):
            vals = [s for s in suffix_counts if re.sub(r"\d", "#", s) == pat]
            nums = [int(x) for s in vals for x in TWO_DIGIT.findall(s)]
            in_range = (sum(10 <= v <= 92 for v in nums) / len(nums)) if nums else 0.0
            rows.append({
                "後綴樣式": pat or "（沒有後綴）",
                "檔數": n,
                "不同的值": len(vals),
                "當兩位數色號_落在10-92": round(in_range, 3),
                "範例檔名": examples.get(pat, ""),
                "實際值": "、".join(sorted(vals)[:10])[:80],
            })
        df = pd.DataFrame(rows)
        df.attrs.update({"檔案總數": n_files, "含貨號的": n_with_sku,
                         "不同貨號": len(skus),
                         "平均每貨號檔數": round(n_with_sku / max(len(skus), 1), 2)})
        out[key] = df
    return out


def build_sku_color_map(cfg: Config | None = None, *,
                        pattern: str = r"[-_ ]?(\d{2})$",
                        key: str = "system_images") -> pd.DataFrame:
    """用確認過的後綴規則，把檔名解析成 (貨號, 色號, 圖檔路徑)。

    pattern 只在**人看過 scan_filenames 的結果、確認規則之後**才該指定。
    預設值只是最常見的猜測，不保證適用 —— 所以這支函式不會被自動呼叫。
    """
    cfg = cfg or get_config()
    rx = re.compile(pattern)
    rows = []
    for root in [r for r in cfg.path_list(key) if r.exists()]:
        for p in root.rglob("*"):
            if not p.is_file() or p.name.startswith(("~$", ".")):
                continue
            m = SKU_RE.search(p.stem)
            if not m:
                continue
            c = rx.search(_suffix_of(p.stem))
            if not c:
                continue
            rows.append({"sku": m.group(1).upper(), "色號": c.group(1),
                         "image_path": str(p)})
    return pd.DataFrame(rows)
