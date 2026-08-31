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
_NUM_RE = re.compile(r"-?\d+(?:\.\d+)?")


def _norm(s: object) -> str:
    return re.sub(r"[\s_\-/()（）:：]", "", unicodedata.normalize("NFKC", str(s)).strip().lower())


def _alias_index(cfg: Config) -> dict[str, str]:
    """{正規化別名: 標準尺寸欄位代碼}"""
    idx: dict[str, str] = {}
    for field in cfg.taxonomy.get("measurements", {}).get("fields", []):
        for alias in [field["code"], field["zh"], *field.get("aliases", [])]:
            idx[_norm(alias)] = field["code"]
    return idx


def _harvest_pairs(cells: list[list[Any]], alias_idx: dict[str, str]) -> dict[str, float]:
    """從二維表格中找「尺寸名稱 → 數值」的配對。

    指示書的尺寸表有兩種常見排法，兩種都試：
      直式：| 衣長 | 62 | 64 | 66 |     （取第一個數字，通常是基準碼）
      橫式：欄名是尺寸名稱，下一列是數值
    """
    found: dict[str, float] = {}

    # 直式：逐列，第一格是名稱
    for row in cells:
        if not row:
            continue
        key = alias_idx.get(_norm(row[0]))
        if key and key not in found:
            for cell in row[1:]:
                m = _NUM_RE.search(str(cell))
                if m:
                    found[key] = float(m.group())
                    break

    # 橫式：逐欄
    if len(cells) >= 2:
        header, *rest = cells
        for ci, name in enumerate(header):
            key = alias_idx.get(_norm(name))
            if not key or key in found:
                continue
            for row in rest:
                if ci < len(row):
                    m = _NUM_RE.search(str(row[ci]))
                    if m:
                        found[key] = float(m.group())
                        break
    return found


def _from_table_file(path: Path, alias_idx: dict[str, str]) -> dict[str, float]:
    if path.suffix.lower() == ".csv":
        sheets = {"": pd.read_csv(path, header=None)}
    else:
        sheets = pd.read_excel(path, sheet_name=None, header=None)
    merged: dict[str, float] = {}
    for df in sheets.values():
        merged.update(_harvest_pairs(df.fillna("").values.tolist(), alias_idx))
    return merged


def _from_pdf(path: Path, alias_idx: dict[str, str]) -> dict[str, float]:
    try:
        import pdfplumber
    except ImportError:
        return {}
    merged: dict[str, float] = {}
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables() or []:
                merged.update(_harvest_pairs(table, alias_idx))
            if not merged:  # 沒有表格線的 PDF，退回純文字逐行掃描
                text = page.extract_text() or ""
                rows = [[c for c in re.split(r"\s{2,}|\t", line) if c] for line in text.splitlines()]
                merged.update(_harvest_pairs(rows, alias_idx))
    return merged


def _from_image_ocr(path: Path, alias_idx: dict[str, str]) -> dict[str, float]:
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
    return _harvest_pairs(rows, alias_idx)


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
                values, method = _from_table_file(path, alias_idx), "table"
            elif suffix == ".pdf":
                values, method = _from_pdf(path, alias_idx), "pdf"
            else:
                values, method = _from_image_ocr(path, alias_idx), "ocr"
        except Exception as exc:   # 單一份壞掉的指示書不該中斷整批
            values, method = {}, f"error:{type(exc).__name__}"

        rows.append({
            "sku": sku, "style_code": style_code,
            "techpack_path": str(path), "extract_method": method,
            "extract_fields": len(values), **values,
        })

    df = pd.DataFrame(rows)
    return add_derived_ratios(df, cfg) if not df.empty else df


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
