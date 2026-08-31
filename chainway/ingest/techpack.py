"""裁縫指示書匯入：抽出重點尺寸表（衣長、袖長、領寬…）與線稿圖。

支援三種來源，依成本由低到高：
  1. Excel/CSV 尺寸表    → 直接讀（最準，強烈建議請版師改用這種格式匯出）
  2. 文字型 PDF         → pdfplumber 抽表格
  3. 掃描件 / 圖片      → OCR（需另裝 pytesseract + 中文語言包）

抽出的尺寸會再依 taxonomy.yaml 的 measurements.derived 推導成「版型比例指標」，
那才是能跨款、跨品類比較的東西（絕對公分數大小受尺碼影響，比例不受）。
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from ..config import Config, get_config
from .images import _is_ignored, parse_sku

DOC_EXTS = {".xlsx", ".xlsm", ".xls", ".csv", ".pdf", ".png", ".jpg", ".jpeg"}

# 尺寸寫法是英吋帶分數：「22 1/2」「13 3/4」「1/2」。
# 只用 \d+(\.\d+)? 會把「22 1/2」讀成 22 —— 靜默少掉 0.5 吋（1.3 公分），
# 而且錯得很有規律，會讓所有比例指標一起偏掉。
_MIXED_FRACTION_RE = re.compile(r"(-?\d+)\s+(\d+)\s*/\s*(\d+)")   # 22 1/2
_FRACTION_RE = re.compile(r"(-?\d+)\s*/\s*(\d+)")                  # 1/2
_PLAIN_RE = re.compile(r"-?\d+(?:\.\d+)?")
INCH_TO_CM = 2.54


def parse_number(value: object) -> float | None:
    """把儲存格內容轉成數字，支援「22 1/2」這種帶分數寫法。"""
    if value is None:
        return None
    s = str(value).strip()
    if not s or s in ("_", "-", "—"):
        return None
    m = _MIXED_FRACTION_RE.search(s)
    if m:
        whole, num, den = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if den:
            sign = -1 if whole < 0 else 1
            return abs(whole) * sign + sign * num / den
    m = _FRACTION_RE.search(s)
    if m and int(m.group(2)):
        return int(m.group(1)) / int(m.group(2))
    m = _PLAIN_RE.search(s)
    return float(m.group()) if m else None


def _norm(s: object) -> str:
    return re.sub(r"[\s_\-/()（）:：]", "", unicodedata.normalize("NFKC", str(s)).strip().lower())


def _alias_index(cfg: Config) -> dict[str, str]:
    """{正規化別名: 標準尺寸欄位代碼}"""
    idx: dict[str, str] = {}
    for field in cfg.taxonomy.get("measurements", {}).get("fields", []):
        for alias in [field["code"], field["zh"], *field.get("aliases", [])]:
            idx[_norm(alias)] = field["code"]
    return idx


def _find_size_columns(cells: list[list[Any]]) -> tuple[list[int], list[str], int]:
    """找出尺碼標題列，回傳 (尺碼欄索引, 尺碼名稱, 標題列號)。

    指示書長這樣：
        r4:  ... | 尺寸 | 34 | 36 | 38 | 40 |
        r5:  ... | 胸圍 | 36 | 38 | 40 | 42 |
        r9:  ... | 衣長 | 22 1/2 | 23 | 23 3/4 | 24 1/2 |
    所以要先鎖定尺碼欄，各部位才知道該讀哪一格。
    """
    for ri, row in enumerate(cells):
        for ci, cell in enumerate(row):
            if _norm(cell) not in ("尺寸", "size", "尺碼"):
                continue
            cols, names = [], []
            for cj in range(ci + 1, len(row)):
                v = str(row[cj]).strip()
                if v and v.lower() != "nan" and _PLAIN_RE.fullmatch(v.replace(".0", "")):
                    cols.append(cj)
                    names.append(v.replace(".0", ""))
            if len(cols) >= 2:
                return cols, names, ri
    return [], [], -1


def _pick_base_size(cells: list[list[Any]], size_names: list[str], pref: str) -> int:
    """決定用哪一個尺碼當基準碼。

    pref = "max_qty" → 找「預定件數」那一區，取件數最多的尺碼；
    pref = 具體尺碼（如 "36"）→ 直接用；
    找不到就取中間那一碼（母版通常在中間）。
    """
    if pref and pref != "max_qty" and pref in size_names:
        return size_names.index(pref)

    if pref == "max_qty":
        # 預定件數區：標題列有尺碼，下面幾列是各碼件數
        for ri, row in enumerate(cells):
            labels = [_norm(c) for c in row]
            if "預定件數" not in labels:
                continue
            for rj in range(ri, min(ri + 4, len(cells))):
                hdr = [str(c).strip().replace(".0", "") for c in cells[rj]]
                idxs = [k for k, v in enumerate(hdr) if v in size_names]
                if len(idxs) < 2:
                    continue
                totals = [0.0] * len(idxs)
                for rk in range(rj + 1, min(rj + 8, len(cells))):
                    for n, k in enumerate(idxs):
                        if k < len(cells[rk]):
                            q = parse_number(cells[rk][k])
                            if q:
                                totals[n] += q
                if any(totals):
                    best = idxs[totals.index(max(totals))]
                    return size_names.index(hdr[best])
    return len(size_names) // 2


def _harvest_pairs(cells: list[list[Any]], alias_idx: dict[str, str],
                   base_size_pref: str = "max_qty") -> tuple[dict[str, float], dict[str, Any]]:
    """從二維表格抽出「部位 → 基準碼尺寸」。回傳 (尺寸, 抽取資訊)。"""
    found: dict[str, float] = {}
    info: dict[str, Any] = {}

    size_cols, size_names, hdr_row = _find_size_columns(cells)
    if size_cols:
        bi = _pick_base_size(cells, size_names, base_size_pref)
        base_col = size_cols[bi]
        info.update({"base_size": size_names[bi], "all_sizes": "/".join(size_names)})
        for ri, row in enumerate(cells):
            if ri == hdr_row:
                continue
            for ci, cell in enumerate(row):
                key = alias_idx.get(_norm(cell))
                if not key or key in found or ci >= base_col:
                    continue
                if base_col < len(row):
                    v = parse_number(row[base_col])
                    if v is not None:
                        found[key] = v
        if found:
            return found, info

    # 沒有尺碼表頭時退回原本的「標籤後第一個數字」掃描
    for row in cells:
        if not row:
            continue
        for ci, cell in enumerate(row):
            key = alias_idx.get(_norm(cell))
            if key and key not in found:
                for nxt in row[ci + 1:]:
                    v = parse_number(nxt)
                    if v is not None:
                        found[key] = v
                        break
    if len(cells) >= 2:
        header, *rest = cells
        for ci, name in enumerate(header):
            key = alias_idx.get(_norm(name))
            if not key or key in found:
                continue
            for row in rest:
                if ci < len(row):
                    v = parse_number(row[ci])
                    if v is not None:
                        found[key] = v
                        break
    return found, info


def _is_header_row(row: list[Any], known_labels: set[str],
                   min_labels: int = 3, min_ratio: float = 0.7) -> bool:
    """這一列是不是「標籤成排、值在下一列」的表頭列。"""
    filled = [s for s in (str(x).strip() for x in row) if s and s.lower() != "nan"]
    if len(filled) < min_labels:
        return False
    n_labels = sum(1 for s in filled if _norm(s) in known_labels)
    return n_labels >= min_labels and n_labels / len(filled) >= min_ratio


def _harvest_metadata(cells: list[list[Any]], cfg: Config) -> dict[str, Any]:
    """抽出表單式欄位（標籤在左或在上，值在右或在下）。

    上市日、成份、總版數、工資這些欄位的分析價值不輸尺寸，
    但它們不在尺碼表裡，要另外用「找標籤 → 取相鄰值」的方式抓。
    """
    specs = cfg.taxonomy.get("measurements", {}).get("metadata", []) or []
    alias_to_spec: dict[str, dict] = {}
    for spec in specs:
        for a in [spec["zh"], *spec.get("aliases", [])]:
            alias_to_spec[_norm(a)] = spec

    # 判斷一格是不是「另一個標籤」用的字典：metadata 名稱 + 尺寸部位名稱
    # + 表單上常見但我們不抽的欄位名。誤把標籤當成值是最容易犯的錯。
    known_labels = set(alias_to_spec)
    for field in cfg.taxonomy.get("measurements", {}).get("fields", []):
        for a in [field["zh"], *field.get("aliases", [])]:
            known_labels.add(_norm(a))
    known_labels |= {_norm(x) for x in (
        "貨號", "尺寸", "日期", "日期：", "製表", "本布", "幅寬", "用碼量", "價格",
        "項目", "廠商型號/尺寸", "用量", "單價", "合計", "備註欄", "備註欄：",
        "表布", "裡布", "襯", "羅紋", "格布", "牽條芯", "內裡", "吊鐘", "蕾絲",
        "拉鍊", "釦子", "暗釦", "旗釦", "久帶", "彈性釦根", "色號", "布樣",
        "預定件數", "格布色", "繡花", "車線", "吊卡", "洗標", "運費", "裁剪費",
        "成本合計", "預定單價", "大方標", "四角標", "三角標", "黑標", "備釦袋")}

    def coerce(s: str, spec: dict) -> Any:
        if spec.get("type") == "number":
            return parse_number(s)
        if spec.get("type") == "date":
            d = pd.to_datetime(s, errors="coerce")
            return None if pd.isna(d) else d
        # 純數字不會是品牌、成份、人名這類文字欄位的值
        return None if _PLAIN_RE.fullmatch(s.replace(".0", "")) else s.replace("\n", " ")[:200]

    out: dict[str, Any] = {}
    for ri, row in enumerate(cells):
        for ci, cell in enumerate(row):
            spec = alias_to_spec.get(_norm(cell))
            if not spec or spec["code"] in out:
                continue

            # 版面一：標籤在左、值在右（貨號 | KA1583008）
            # 一碰到下一個標籤就停 —— 表單裡某欄的值只會落在
            # 「這個標籤與下一個標籤之間」。越過去取，會把隔壁欄的值搬過來
            # （副品牌沒填時，會抓到再過去的「代工：木易」）。
            for s in (str(x).strip() for x in row[ci + 1:ci + 4]):
                if not s or s.lower() == "nan":
                    continue
                if _norm(s) in known_labels:
                    break
                v = coerce(s, spec)
                if v is not None:
                    out[spec["code"]] = v
                break
            if spec["code"] in out:
                continue

            # 版面二：標籤成排在上、值在下一列（企劃|打版|打樣 → penny|Emi|木易）
            #
            # 什麼時候該往下找？看這一列是不是「表頭列」：
            #   r0 = 企劃|打版|打樣|製表|上市日|…      幾乎全是標籤 → 值在下一列
            #   r3 = 貨號|KA1583008|樣號|T420|…        標籤與值交錯 → 值在右邊
            # 用「標籤佔非空格的比例」判斷，比看右邊空不空可靠：
            # 副品牌沒填時右邊也是空的，但它在交錯列，往下會抓到尺寸表的數字。
            # 用比例而非「全部都是標籤」，是因為表頭列常帶一個公司抬頭之類的標題格。
            if not _is_header_row(row, known_labels):
                continue
            for rj in range(ri + 1, min(ri + 4, len(cells))):
                if ci >= len(cells[rj]):
                    break
                s = str(cells[rj][ci]).strip()
                if not s or s.lower() == "nan" or _norm(s) in known_labels:
                    continue
                v = coerce(s, spec)
                if v is not None:
                    out[spec["code"]] = v
                    break
    return out


def _extract(cells: list[list[Any]], alias_idx: dict[str, str], cfg: Config) -> dict[str, Any]:
    base_pref = cfg.taxonomy.get("measurements", {}).get("base_size", "max_qty")
    sizes, info = _harvest_pairs(cells, alias_idx, base_pref)
    meta = _harvest_metadata(cells, cfg)
    return {**sizes, **info, **meta}


def _from_table_file(path: Path, alias_idx: dict[str, str], cfg: Config) -> dict[str, Any]:
    if path.suffix.lower() == ".csv":
        sheets = {"": pd.read_csv(path, header=None)}
    else:
        sheets = pd.read_excel(path, sheet_name=None, header=None)
    merged: dict[str, Any] = {}
    for df in sheets.values():
        if df.empty:
            continue
        merged.update(_extract(df.fillna("").values.tolist(), alias_idx, cfg))
    return merged


def _from_pdf(path: Path, alias_idx: dict[str, str], cfg: Config) -> dict[str, Any]:
    try:
        import pdfplumber
    except ImportError:
        return {}
    merged: dict[str, Any] = {}
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables() or []:
                merged.update(_extract(table, alias_idx, cfg))
            if not merged:  # 沒有表格線的 PDF，退回純文字逐行掃描
                text = page.extract_text() or ""
                rows = [[c for c in re.split(r"\s{2,}|\t", line) if c] for line in text.splitlines()]
                merged.update(_extract(rows, alias_idx, cfg))
    return merged


def _from_image_ocr(path: Path, alias_idx: dict[str, str], cfg: Config) -> dict[str, Any]:
    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        return {}
    try:
        text = pytesseract.image_to_string(Image.open(path), lang="chi_tra+eng")
    except Exception:
        return {}
    rows = [[c for c in re.split(r"\s{2,}|\t|:|：", line) if c] for line in text.splitlines()]
    return _extract(rows, alias_idx, cfg)


def load_tech_packs(cfg: Config | None = None, root: Path | None = None) -> pd.DataFrame:
    cfg = cfg or get_config()
    roots = [root] if root is not None else cfg.path_list("tech_packs")
    existing = [r for r in roots if r.exists()]
    if not existing:
        raise FileNotFoundError(
            "裁縫指示書資料夾都不存在：\n  " + "\n  ".join(str(r) for r in roots) +
            "\n請在 config/settings.yaml 的 paths.tech_packs 填入實際路徑。"
        )

    alias_idx = _alias_index(cfg)
    rows: list[dict[str, Any]] = []

    files = [p for base in existing for p in sorted(base.rglob("*"))
             if p.is_file() and p.suffix.lower() in DOC_EXTS and not _is_ignored(p, base)]
    for path in files:
        sku, style_code = parse_sku(path.stem, cfg)
        suffix = path.suffix.lower()
        try:
            if suffix in {".xlsx", ".xlsm", ".xls", ".csv"}:
                values, method = _from_table_file(path, alias_idx, cfg), "table"
            elif suffix == ".pdf":
                values, method = _from_pdf(path, alias_idx, cfg), "pdf"
            else:
                values, method = _from_image_ocr(path, alias_idx, cfg), "ocr"
        except Exception as exc:   # 單一份壞掉的指示書不該中斷整批
            values, method = {}, f"error:{type(exc).__name__}"

        size_codes = {f["code"] for f in cfg.taxonomy.get("measurements", {}).get("fields", [])}
        rows.append({
            "sku": sku, "style_code": style_code,
            "techpack_path": str(path), "extract_method": method,
            "extract_fields": sum(1 for k in values if k in size_codes), **values,
        })

    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df = add_unit_columns(df, cfg)
    return add_derived_ratios(df, cfg)


def add_unit_columns(df: pd.DataFrame, cfg: Config | None = None) -> pd.DataFrame:
    """尺寸單位是英吋時，另外產生一組公分欄位。

    比例指標本身不受單位影響，但報表上寫「衣長 22.5」而不註明是英吋，
    看的人會直接當成公分 —— 那是 57 公分與 22.5 公分的差別。
    """
    cfg = cfg or get_config()
    mcfg = cfg.taxonomy.get("measurements", {})
    out = df.copy()
    out["measure_unit"] = mcfg.get("unit", "cm")
    if mcfg.get("unit") == "inch" and mcfg.get("convert_to_cm", True):
        for field in mcfg.get("fields", []):
            code = field["code"]
            if code in out.columns:
                out[f"{code}_cm"] = (pd.to_numeric(out[code], errors="coerce") * INCH_TO_CM).round(1)
    return out


def add_derived_ratios(df: pd.DataFrame, cfg: Config | None = None) -> pd.DataFrame:
    """依 taxonomy.measurements.derived 計算版型比例指標。"""
    cfg = cfg or get_config()
    out = df.copy()
    for spec in cfg.taxonomy.get("measurements", {}).get("derived", []):
        num, _, den = [t.strip() for t in spec["formula"].partition("/")]
        if num in out.columns and den in out.columns:
            out[spec["code"]] = (
                pd.to_numeric(out[num], errors="coerce")
                / pd.to_numeric(out[den], errors="coerce").replace(0, np.nan)
            ).astype(float).round(4)
        else:
            out[spec["code"]] = pd.NA
    return out


def coverage_report(df: pd.DataFrame, cfg: Config | None = None) -> pd.DataFrame:
    """哪些尺寸欄位抽到了、抽到幾成 —— 用來決定要不要請版師補格式。"""
    cfg = cfg or get_config()
    fields = [f["code"] for f in cfg.taxonomy.get("measurements", {}).get("fields", [])]
    labels = {f["code"]: f["zh"] for f in cfg.taxonomy.get("measurements", {}).get("fields", [])}
    total = max(len(df), 1)
    rows = [{
        "field": f, "field_zh": labels.get(f, f),
        "filled": int(df[f].notna().sum()) if f in df.columns else 0,
        "coverage": round((df[f].notna().sum() if f in df.columns else 0) / total, 3),
    } for f in fields]
    return pd.DataFrame(rows).sort_values("coverage", ascending=False).reset_index(drop=True)
