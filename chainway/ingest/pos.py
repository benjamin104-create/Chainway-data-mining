"""POS 進銷存匯入：讀取歷年分季 Excel，轉成統一的銷售事實表。

現實情況是每年的報表欄位名稱都會變一點，所以這裡用「別名比對」而不是寫死欄位。
比對不到的欄位會在 report 中明確列出，不會靜默丟掉。
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

import pandas as pd

from ..config import Config, get_config

# 標準欄位 → 可能出現的來源欄位名（比對時忽略大小寫、空白、全半形）
COLUMN_ALIASES: dict[str, list[str]] = {
    "sku": ["貨號", "商品編號", "品號", "料號", "sku", "item_no", "itemno", "商品貨號"],
    "style_code": ["款號", "款式編號", "style", "style_no", "stylecode"],
    "product_name": ["品名", "商品名稱", "商品名", "name", "描述"],
    "category": ["品類", "類別", "大類", "商品分類", "category", "class"],
    "sub_category": ["中類", "小類", "次分類", "sub_category"],
    "season": ["季別", "年季", "季節", "波段", "season"],
    "color": ["顏色", "色號", "色彩", "color", "colour"],
    "size": ["尺寸", "尺碼", "size"],
    "list_price": ["定價", "售價", "原價", "牌價", "list_price", "price", "零售價"],
    "avg_selling_price": ["平均售價", "實際售價", "均價", "asp"],
    "cost": ["成本", "進價", "cost"],
    "stock_in": ["進貨量", "進貨數", "入庫量", "採購數量", "訂購量", "stock_in", "qty_in"],
    "sales_qty": ["銷售量", "銷貨數量", "銷量", "出貨數", "sales_qty", "qty_sold"],
    "return_qty": ["退貨量", "退貨數", "return_qty"],
    "sales_amount": ["銷售金額", "銷貨金額", "營業額", "sales_amount", "amount"],
    "stock_on_hand": ["庫存量", "期末庫存", "現有庫存", "stock", "on_hand"],
    "first_sale_date": ["上市日", "首賣日", "上架日", "首次銷售日", "launch_date"],
    "last_sale_date": ["最後銷售日", "末次銷售日", "last_sale_date"],
    "store": ["門市", "店號", "分店", "通路", "store", "channel"],
    "region": ["區域", "地區", "region"],
}

EXCEL_EXTS = {".xlsx", ".xlsm", ".xls", ".csv"}


def _norm(name: object) -> str:
    s = unicodedata.normalize("NFKC", str(name)).strip().lower()
    return re.sub(r"[\s_\-/()（）]", "", s)


def map_columns(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, str], list[str]]:
    """回傳 (改名後的 df, {標準欄位: 原欄位}, 未被對應到的原欄位)。"""
    norm_to_orig = {_norm(c): c for c in df.columns}
    mapping: dict[str, str] = {}
    used: set[str] = set()

    for std, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            key = _norm(alias)
            if key in norm_to_orig and norm_to_orig[key] not in used:
                mapping[std] = norm_to_orig[key]
                used.add(norm_to_orig[key])
                break

    renamed = df.rename(columns={v: k for k, v in mapping.items()})
    unmapped = [c for c in df.columns if c not in used]
    return renamed, mapping, unmapped


def _read_any(path: Path) -> dict[str, pd.DataFrame]:
    if path.suffix.lower() == ".csv":
        return {"": pd.read_csv(path)}
    sheets = pd.read_excel(path, sheet_name=None)
    return {k: v for k, v in sheets.items() if not v.empty}


def load_pos(cfg: Config | None = None, root: Path | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """讀取 POS 目錄下所有檔案。

    回傳 (銷售事實表, 匯入稽核表)。稽核表列出每個檔案對到/沒對到的欄位，
    讓你一眼看出哪一年的報表格式需要在 COLUMN_ALIASES 補一筆。
    """
    cfg = cfg or get_config()
    root = root or cfg.path("pos")
    if not root.exists():
        raise FileNotFoundError(
            f"POS 資料夾不存在：{root}\n請在 config/settings.yaml 的 paths.pos 填入公司實際路徑。"
        )

    frames: list[pd.DataFrame] = []
    audit_rows: list[dict] = []

    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in EXCEL_EXTS:
            continue
        for sheet, raw in _read_any(path).items():
            renamed, mapping, unmapped = map_columns(raw)
            if "sku" not in mapping:
                audit_rows.append({
                    "file": path.name, "sheet": sheet, "rows": len(raw),
                    "status": "SKIPPED", "note": "找不到貨號欄位",
                    "mapped": "", "unmapped": ", ".join(map(str, unmapped))[:500],
                })
                continue
            keep = [c for c in COLUMN_ALIASES if c in renamed.columns]
            sub = renamed[keep].copy()
            sub["source_file"] = path.name
            sub["source_sheet"] = sheet
            # 季別若報表沒有，嘗試從檔名抓（例如 "2023AW_進銷存.xlsx"）
            if "season" not in sub.columns:
                m = re.search(r"(20\d{2})\s*[-_ ]?\s*(SS|AW|春夏|秋冬|Q[1-4])", path.name, re.I)
                sub["season"] = m.group(0).upper().replace(" ", "") if m else "UNKNOWN"
            frames.append(sub)
            audit_rows.append({
                "file": path.name, "sheet": sheet, "rows": len(raw),
                "status": "OK", "note": "",
                "mapped": ", ".join(f"{k}<-{v}" for k, v in mapping.items()),
                "unmapped": ", ".join(map(str, unmapped))[:500],
            })

    audit = pd.DataFrame(audit_rows)
    if not frames:
        return pd.DataFrame(), audit

    df = pd.concat(frames, ignore_index=True)
    df = _clean(df, cfg)
    return df, audit


def _clean(df: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    df["sku"] = df["sku"].astype(str).str.strip()
    df = df[df["sku"].ne("") & df["sku"].str.lower().ne("nan")]

    numeric = ["list_price", "avg_selling_price", "cost", "stock_in", "sales_qty",
               "return_qty", "sales_amount", "stock_on_hand"]
    for col in numeric:
        if col in df.columns:
            df[col] = pd.to_numeric(
                df[col].astype(str).str.replace(r"[,\s$元]", "", regex=True),
                errors="coerce",
            )
        else:
            df[col] = pd.NA

    for col in ("first_sale_date", "last_sale_date"):
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")
        else:
            df[col] = pd.NaT

    for col in ("season", "category", "color", "size", "store", "region",
                "product_name", "sub_category", "style_code"):
        if col not in df.columns:
            df[col] = pd.NA
        else:
            df[col] = df[col].astype("string").str.strip()

    # style_code 缺就用貨號規則推導
    style_pattern = cfg.get("sku", {}).get("style_code_pattern")
    if style_pattern:
        derived = df["sku"].str.extract(style_pattern, expand=False)
        df["style_code"] = df["style_code"].fillna(derived).fillna(df["sku"])
    else:
        df["style_code"] = df["style_code"].fillna(df["sku"])

    df["season"] = df["season"].fillna("UNKNOWN").str.upper()
    return df.reset_index(drop=True)


def aggregate_to_sku_season(df: pd.DataFrame) -> pd.DataFrame:
    """把門市 × 日期層級的明細，彙總到 貨號 × 季別 —— 分析的基本粒度。"""
    if df.empty:
        return df

    agg = {
        "stock_in": "sum", "sales_qty": "sum", "return_qty": "sum",
        "sales_amount": "sum", "stock_on_hand": "sum",
        "list_price": "median", "cost": "median",
        "first_sale_date": "min", "last_sale_date": "max",
        "product_name": "first", "category": "first", "sub_category": "first",
        "style_code": "first",
    }
    agg = {k: v for k, v in agg.items() if k in df.columns}
    out = df.groupby(["sku", "season"], dropna=False).agg(agg).reset_index()

    out["net_sales_qty"] = out["sales_qty"].fillna(0) - out["return_qty"].fillna(0)
    out["return_rate"] = (out["return_qty"] / out["sales_qty"].replace(0, pd.NA)).astype(float)
    out["sell_through_rate"] = (out["net_sales_qty"] / out["stock_in"].replace(0, pd.NA)).astype(float)
    out["avg_selling_price"] = (out["sales_amount"] / out["net_sales_qty"].replace(0, pd.NA)).astype(float)
    if "cost" in out.columns:
        out["gross_margin"] = (
            (out["avg_selling_price"] - out["cost"]) / out["avg_selling_price"].replace(0, pd.NA)
        ).astype(float)
    out["discount_depth"] = (
        1 - out["avg_selling_price"] / out["list_price"].replace(0, pd.NA)
    ).astype(float)
    span = (out["last_sale_date"] - out["first_sale_date"]).dt.days
    out["weeks_on_sale"] = (span / 7).round(1)
    return out
