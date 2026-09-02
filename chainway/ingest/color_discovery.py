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
# 完整品號 = 款號(KA+7碼) + 色號(2碼) + 尺寸。ERP「貨品追蹤簡表」直接證實：
#   KA115100170F   -> KA1151001 + 70 米白 + F（均碼，字母）
#   KA11510025636  -> KA1151002 + 56 藏青 + 36（數字尺寸）
#   KA11510026038  -> KA1151002 + 60 粉紫 + 38
# 尺寸兩種形態都要收；色號一律兩碼，所以先切色號再切尺寸不會有歧義。
ITEM_RE = re.compile(r"(KA\d{7})(\d{2})([A-Za-z]{1,3}|\d{1,3})?", re.I)
# 檔名與報表的分隔符寫法不一，先正規化再解析，一種規則吃所有寫法
SEP_RE = re.compile(r"[-_\s./]+")
# 兩位數色號的樣子：10–92。收得寬一點，篩選留給人做。
TWO_DIGIT = re.compile(r"(?<!\d)([1-9][0-9])(?!\d)")


def parse_item_code(text: str) -> dict[str, str] | None:
    """完整品號 → {款號, 色號, 尺寸}。只有款號就回傳色號為空字串。

    刻意不在找不到色號時猜一個 —— POS 報表的貨號本來就只有款號，
    那不是缺漏，是它的粒度就是款。硬補一個色號會讓後面的驗證失去意義。
    """
    flat = SEP_RE.sub("", str(text))
    m = ITEM_RE.search(flat)
    if not m:
        s = SKU_RE.search(flat)
        return {"款號": s.group(1).upper(), "色號": "", "尺寸": ""} if s else None
    return {"款號": m.group(1).upper(), "色號": m.group(2),
            "尺寸": (m.group(3) or "").upper()}


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
                        key: str = "system_images",
                        pattern: str | None = None) -> pd.DataFrame:
    """檔名 → (款號, 色號, 尺寸, 圖檔路徑)。

    預設吃 ERP 的完整品號格式（KA115100170F），連寫或用 - _ 空白分隔都收。
    貴司若還有別的寫法，先跑 scan_filenames 看清楚，再用 pattern 覆寫。
    """
    cfg = cfg or get_config()
    rx = re.compile(pattern) if pattern else None
    rows = []
    for root in [r for r in cfg.path_list(key) if r.exists()]:
        for p in root.rglob("*"):
            if not p.is_file() or p.name.startswith(("~$", ".")):
                continue
            if rx is not None:
                m = SKU_RE.search(p.stem)
                c = rx.search(_suffix_of(p.stem)) if m else None
                if not (m and c):
                    continue
                rec = {"款號": m.group(1).upper(), "色號": c.group(1), "尺寸": ""}
            else:
                # 分隔符不影響語意，先拿掉再解析，一種規則吃三種寫法
                rec = parse_item_code(p.stem)
                if not rec or not rec["色號"]:
                    continue
            rows.append({**rec, "image_path": str(p)})
    return pd.DataFrame(rows)


def diagnose_filenames(cfg: Config | None = None) -> str:
    """掃完檔名之後，講清楚色號在不在檔名裡、不在的話下一步是什麼。

    「找不到，請再跑一次掃描」是最沒用的錯誤訊息 —— 掃描已經跑過了，
    答案就在結果裡。與其叫人再試一次，不如直接把結論講出來。
    """
    found = scan_filenames(cfg)
    if not found:
        return "系統圖與指示書資料夾都找不到，無法判斷。"

    lines = []
    for key, t in found.items():
        if t.empty:
            continue
        a = t.attrs
        no_suffix = t[t["後綴樣式"] == "（沒有後綴）"]["檔數"].sum()
        share = no_suffix / max(a["含貨號的"], 1)
        looks_like_code = t[t["當兩位數色號_落在10-92"] >= 0.8]["檔數"].sum()
        if share >= 0.9:
            lines.append(
                f"{key}：{a['含貨號的']:,} 個含貨號的檔裡，{no_suffix:,} 個"
                f"（{share:.0%}）貨號後面什麼都沒有 —— 檔名只到款，不含配色。"
                f"平均每貨號 {a['平均每貨號檔數']} 檔，也印證了是一款一張而非一色一張。")
        elif looks_like_code:
            lines.append(
                f"{key}：有 {looks_like_code:,} 個檔的後綴長得像兩位數色號，"
                f"可以拿來對照。")
        else:
            lines.append(
                f"{key}：後綴大多不是色號（多為日期、廠商名或張數編號），"
                f"最常見的樣式是 {t.iloc[0]['後綴樣式']}。")
    return "\n     ".join(lines)


# ERP 匯出的欄名不保證統一，所以認得多種寫法；認不出來就退回掃全表找完整品號
ITEM_COLS = ["貨品編號", "貨號", "品號", "商品編號", "item", "item_code", "sku"]
COLOR_COLS = ["顏色", "顏色/尺寸", "色號", "color", "colour"]
SIZE_COLS = ["尺寸", "size"]


def read_erp_export(path: str | Path) -> pd.DataFrame:
    """從 ERP 匯出的報表建立 (款號, 色號, 尺寸) 對照。

    兩條路徑，先試前者：

      1. 有一欄是完整品號（KA115100170F）→ 直接拆
      2. 有「貨號」與「顏色」兩欄 → 從顏色欄取兩位數色號

    第二條路要小心：ERP 的顏色欄長成「5636  藏青」，前四碼是色號+尺寸，
    後面才是色名。所以取「開頭的兩位數」而不是「任何兩位數」——
    色名裡若出現數字（例如「3號藍」）會誤抓。
    """
    p = Path(path)
    frames = []
    if p.suffix.lower() in (".xls", ".xlsx", ".xlsm"):
        sheets = pd.read_excel(p, sheet_name=None, dtype=str)
        frames = list(sheets.values())
    else:
        frames = [pd.read_csv(p, dtype=str)]

    rows = []
    for df in frames:
        if df is None or df.empty:
            continue
        cols = {str(c).strip(): c for c in df.columns}
        item_col = next((cols[k] for k in cols
                         for n in ITEM_COLS if n.lower() == k.lower()), None)
        color_col = next((cols[k] for k in cols
                          for n in COLOR_COLS if n.lower() == k.lower()), None)
        size_col = next((cols[k] for k in cols
                         for n in SIZE_COLS if n.lower() == k.lower()), None)

        if item_col is not None:
            for v in df[item_col].dropna().astype(str):
                rec = parse_item_code(v)
                if rec and rec["色號"]:
                    rows.append(rec)

        if color_col is not None and item_col is not None:
            for _, r in df[[item_col, color_col]].dropna().iterrows():
                sku = SKU_RE.search(str(r[item_col]))
                # 顏色欄長成「5636 藏青」或「70F  米白」：色號兩碼，
                # 之後是尺寸（數字或字母），再之後才是色名
                m = re.match(r"\s*(\d{2})(\d{1,3}|[A-Za-z]{1,3})?",
                             str(r[color_col]))
                if sku and m:
                    rows.append({"款號": sku.group(1).upper(), "色號": m.group(1),
                                 "尺寸": m.group(2) or (str(r[size_col]).strip()
                                                      if size_col else "")})

        if item_col is None and color_col is None:
            # 認不出欄名就掃全表找完整品號 —— 匯出檔常常沒有乾淨的標題列
            for v in df.astype(str).to_numpy().ravel():
                rec = parse_item_code(v)
                if rec and rec["色號"]:
                    rows.append(rec)

    out = pd.DataFrame(rows).drop_duplicates()
    out.attrs["source"] = str(p)
    return out
