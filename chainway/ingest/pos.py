"""POS 進銷存匯入：讀取歷年分季 Excel，轉成統一的銷售事實表。

現實情況是每年的報表欄位名稱都會變一點，所以這裡用「別名比對」而不是寫死欄位。
比對不到的欄位會在 report 中明確列出，不會靜默丟掉。
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

from ..config import Config, get_config
from .images import _is_ignored

# 標準欄位 → 可能出現的來源欄位名（比對時忽略大小寫、空白、全半形）
# 標準欄位 → 可能出現的來源欄位名。
# 別名順序即優先序：先命中的先用，所以要把最精確的排前面。
# 「累進 / 總銷 / 總存」是貴司報表的實際用語，已驗證 累進 = 總銷 + 總存（100% 相符）。
COLUMN_ALIASES: dict[str, list[str]] = {
    "sku": ["貨號", "商品編號", "品號", "料號", "sku", "item_no", "itemno", "商品貨號"],
    "style_code": ["款號", "款式編號", "style", "style_no", "stylecode"],
    "product_name": ["品名", "商品名稱", "商品名", "name", "描述"],
    "designer": ["設計師", "設計", "designer"],
    "rank": ["名次", "排名", "rank"],
    "category": ["品類", "類別", "大類", "商品分類", "category", "class"],
    "sub_category": ["中類", "小類", "次分類", "sub_category"],
    "season": ["季別", "年季", "季節", "波段", "season"],
    "color": ["顏色", "色號", "色彩", "color", "colour"],
    "size": ["尺寸", "尺碼", "size"],
    "list_price": ["定價", "售價", "原價", "牌價", "list_price", "price", "零售價"],
    "avg_selling_price": ["平均售價", "實際售價", "均價", "asp"],
    "cost": ["成本", "進價", "cost"],
    # 累進 = 該款累計投入的總量（= 總銷 + 總存），即真正的分母
    "stock_in": ["累進", "進貨量", "進貨數", "入庫量", "採購數量", "訂購量", "stock_in", "qty_in"],
    # 總銷才是與累進、總存對得起來的銷售數；「銷量」另有定義（僅 89% 與總銷相同）
    "sales_qty": ["總銷", "銷售量", "銷貨數量", "出貨數", "sales_qty", "qty_sold"],
    "sales_qty_alt": ["銷量"],
    "return_qty": ["退貨量", "退貨數", "return_qty"],
    "sales_amount": ["銷貨額", "銷售金額", "銷貨金額", "營業額", "sales_amount", "amount"],
    # 總存 = 累進 - 總銷，是真正的剩餘量；「庫存」是另一套數（僅 15% 與總存相同）
    "stock_on_hand": ["總存", "庫存量", "期末庫存", "現有庫存", "stock", "on_hand"],
    "stock_on_hand_alt": ["庫存"],
    # 報表已自算售罄率，優先採用他們的官方數字
    "sell_through_reported": ["銷售率", "售罄率", "sell_through"],
    "stock_ratio_reported": ["總存佔比", "庫存佔比"],
    "first_sale_date": ["入庫日", "上市日", "首賣日", "上架日", "首次銷售日", "launch_date"],
    # ⚠️ 「出貨日」不是最後銷售日 —— 實測 6.2% 的款出貨日早於入庫日，
    #    中位差僅 14 天，它應是「首次配貨給門市」的日期。拿它算上市週數會得到
    #    大量 2 週以下甚至負值，讓 min_weeks_on_sale 門檻誤殺近六成商品。
    #    所以獨立成 ship_date，不參與上市週數計算。
    "ship_date": ["出貨日", "配貨日"],
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


def _season_from_filename(path: Path, cfg: Config) -> str:
    """從檔名或所在資料夾推季別。KA 季號優先（那是公司的正式代號）。"""
    for text in (path.name, str(path.parent)):
        code = cfg.find_season_code(text)
        if code:
            info = cfg.season_from_code(code)
            return info["label"] if info else code
    m = re.search(r"(20\d{2})\s*[-_ ]?\s*(SS|AW|春夏|秋冬|Q[1-4])", path.name, re.I)
    return m.group(0).upper().replace(" ", "") if m else "UNKNOWN"


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
    roots = [root] if root is not None else cfg.path_list("pos")
    existing = [r for r in roots if r.exists()]
    if not existing:
        raise FileNotFoundError(
            "POS 資料夾都不存在：\n  " + "\n  ".join(str(r) for r in roots) +
            "\n請在 config/settings.yaml 的 paths.pos 填入實際路徑。"
        )

    frames: list[pd.DataFrame] = []
    audit_rows: list[dict] = []

    files = [p for base in existing for p in sorted(base.rglob("*"))
             if p.is_file() and p.suffix.lower() in EXCEL_EXTS and not _is_ignored(p, base)]
    for path in files:
        try:
            sheets = _read_any(path)
        except Exception as exc:   # 壞檔、加密檔不該讓整批匯入中斷
            audit_rows.append({
                "file": path.name, "sheet": "", "rows": 0, "status": "ERROR",
                "note": f"無法開啟：{type(exc).__name__}: {exc}"[:200],
                "mapped": "", "unmapped": "",
            })
            continue
        for sheet, raw in sheets.items():
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
            # 季別若報表沒有，依序嘗試：KA 季號 → 一般年季字樣
            if "season" not in sub.columns:
                sub["season"] = _season_from_filename(path, cfg)
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


def _parse_date(series: pd.Series) -> pd.Series:
    """日期欄可能是 20260415 這種數字，也可能是真正的日期格式，兩種都要吃。"""
    s = series.copy()
    as_num = pd.to_numeric(s, errors="coerce")
    looks_yyyymmdd = as_num.between(19000101, 21001231).fillna(False)
    out = pd.Series(pd.NaT, index=s.index, dtype="datetime64[ns]")
    if looks_yyyymmdd.any():
        out[looks_yyyymmdd] = pd.to_datetime(
            as_num[looks_yyyymmdd].astype("Int64").astype(str), format="%Y%m%d", errors="coerce")
    rest = ~looks_yyyymmdd
    if rest.any():
        out[rest] = pd.to_datetime(s[rest], errors="coerce")
    return out


def _flag_samples(df: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    """標記樣衣／樣品。

    兩個判準（任一成立即標記）：
      1. 品名含「樣衣」「樣裙」等字樣
      2. 累進 ≤ max_qty 且完全沒有銷售 —— 一件兩件又賣不掉，是打樣不是商品
    另外「1571007樣衣」這種品名會回推母款號，方便追溯。
    """
    conf = cfg.get("sku", {}).get("sample_detection") or {}
    patterns = conf.get("name_patterns") or []
    max_qty = conf.get("max_qty", 2)

    name = df.get("product_name", pd.Series("", index=df.index)).fillna("").astype(str)
    by_name = name.str.contains("|".join(patterns), regex=True, na=False) if patterns else pd.Series(False, index=df.index)
    by_qty = (df["stock_in"].fillna(0) <= max_qty) & (df["sales_qty"].fillna(0) <= 0)

    df["is_sample"] = by_name | by_qty
    df["sample_reason"] = np.where(by_name, "品名含樣衣字樣",
                          np.where(by_qty, f"累進≤{max_qty}且無銷售", ""))

    parent_pat = conf.get("parent_in_name_pattern")
    if parent_pat:
        found = name.str.extract(parent_pat, expand=False)
        df["sample_parent_sku"] = np.where(
            df["is_sample"] & found.notna(), "KA" + found.fillna(""), "")
    else:
        df["sample_parent_sku"] = ""
    return df


def _design_family_key(df: pd.DataFrame, cfg: Config) -> pd.Series:
    """同品名 + 同定價 → 同一設計家族（用來辨識改番號重出的款）。"""
    conf = cfg.get("sku", {}).get("design_family") or {}
    fields = conf.get("key_fields") or ["product_name", "list_price"]
    parts = []
    for f in fields:
        s = df.get(f, pd.Series("", index=df.index)).astype(str).fillna("")
        if f == "product_name" and conf.get("normalize_name", True):
            s = s.str.strip().str.replace(r"\s+", "", regex=True)
            s = s.map(lambda v: unicodedata.normalize("NFKC", v))
        parts.append(s)
    key = parts[0]
    for p in parts[1:]:
        key = key + "|" + p
    return key.where(parts[0].str.len() > 0, other=pd.NA)


def _clean(df: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    df["sku"] = df["sku"].astype(str).str.strip()
    df = df[df["sku"].ne("") & df["sku"].str.lower().ne("nan")]

    # 排除「合計：」這類小計／總計列。報表最後一列的累進動輒上萬，
    # 混進來會讓整季的分母爆掉，所有售罄率跟著失真。
    df = df[~df["sku"].str.contains("合計|小計|總計|total", case=False, na=False)]

    # 再用貨號格式做一次過濾，但只在「這個格式確實適用於這批資料」時才做。
    # 若 pattern 只對得上少數列，代表設定的格式跟這份報表不符 ——
    # 這時把不符的列全丟掉會讓整批資料無聲消失，比留著髒資料更危險。
    sku_pattern = cfg.get("sku", {}).get("filename_pattern")
    if sku_pattern and len(df):
        valid = df["sku"].str.fullmatch(sku_pattern.strip("()"), na=False)
        if valid.mean() >= 0.5:
            df = df[valid]

    numeric = ["list_price", "avg_selling_price", "cost", "stock_in", "sales_qty",
               "sales_qty_alt", "return_qty", "sales_amount", "stock_on_hand",
               "stock_on_hand_alt", "sell_through_reported", "stock_ratio_reported", "rank"]
    for col in numeric:
        if col in df.columns:
            df[col] = pd.to_numeric(
                df[col].astype(str).str.replace(r"[,\s$元%]", "", regex=True),
                errors="coerce",
            ).astype("float64")
        else:
            # 缺漏的數值欄要補 NaN 而非 pd.NA：pd.NA 會讓整欄變成 object dtype，
            # 後續任何算術再 .astype(float) 都會炸。
            df[col] = np.nan

    for col in ("first_sale_date", "last_sale_date", "ship_date"):
        df[col] = _parse_date(df[col]) if col in df.columns else pd.NaT

    # 每個報表檔是某個時間點的快照。用該檔中最晚的日期當快照日，
    # 就能算出「這款到報表產出時已經上架多久」——這是判斷新品的關鍵：
    # 當季剛入庫的商品銷 0 是正常的，不該被打成滯銷。
    if "source_file" in df.columns:
        latest = df[["first_sale_date", "ship_date"]].max(axis=1)
        df["snapshot_date"] = df.groupby("source_file")[[]].apply(
            lambda g: latest.loc[g.index].max()).reindex(df["source_file"]).to_numpy()
    else:
        df["snapshot_date"] = df[["first_sale_date", "ship_date"]].max(axis=1).max()

    for col in ("season", "category", "color", "size", "store", "region",
                "product_name", "sub_category", "style_code", "designer"):
        if col not in df.columns:
            df[col] = pd.NA
        else:
            df[col] = df[col].astype("string").str.strip()

    # style_code 缺就用貨號規則推導；沒有規則表示貨號本身即款號
    style_pattern = cfg.get("sku", {}).get("style_code_pattern")
    if style_pattern:
        derived = df["sku"].str.extract(style_pattern, expand=False)
        df["style_code"] = df["style_code"].fillna(derived).fillna(df["sku"])
    else:
        df["style_code"] = df["style_code"].fillna(df["sku"])

    # 設計師代號正規化（同一人有多組代號與大小寫）
    df["designer"] = df["designer"].map(cfg.normalize_designer).replace("", pd.NA)

    # 季別：報表沒有就從貨號的 KA 季號推
    df["season"] = df["season"].fillna(pd.NA)
    need = df["season"].isna() | df["season"].isin(["UNKNOWN", ""])
    if need.any():
        derived = df.loc[need, "sku"].map(
            lambda s: (cfg.season_from_code(s[:5]) or {}).get("label"))
        df.loc[need, "season"] = derived
    df["season"] = df["season"].fillna("UNKNOWN")

    # 樣衣辨識：樣衣不是商品，混進分析會佔滿滯銷榜
    df = _flag_samples(df, cfg)
    # 改番號家族：同品名 + 同定價視為同一設計的不同番號
    df["design_family"] = _design_family_key(df, cfg)

    # 品類：報表沒有就用貨號品類碼，再退回品名關鍵字
    cat_info = df.apply(
        lambda r: cfg.category_from_sku(r["sku"], r.get("product_name") or ""), axis=1)
    df["category"] = df["category"].fillna(pd.Series([c["category"] for c in cat_info], index=df.index))
    df["sub_category"] = df["sub_category"].fillna(
        pd.Series([c["sub_category"] for c in cat_info], index=df.index))
    df["category_source"] = [c["source"] for c in cat_info]
    df["category_code"] = [c["category_code"] for c in cat_info]
    # 經典格紋是品牌核心產品線，貨號本身就標明了，不必等 CLIP 判圖案
    df["product_line"] = [c["product_line"] for c in cat_info]
    # 贈品／魅力商品：不是賣出去的，售罄率與毛利對它們沒有意義
    df["is_gift"] = [c["is_gift"] for c in cat_info]

    return df.reset_index(drop=True)


def aggregate_to_sku_season(df: pd.DataFrame) -> pd.DataFrame:
    """把門市 × 日期層級的明細，彙總到 貨號 × 季別 —— 分析的基本粒度。"""
    if df.empty:
        return df

    agg = {
        "stock_in": "sum", "sales_qty": "sum", "return_qty": "sum",
        "sales_amount": "sum", "stock_on_hand": "sum",
        "list_price": "median", "cost": "median",
        "first_sale_date": "min", "last_sale_date": "max", "ship_date": "min",
        "snapshot_date": "max",
        "product_name": "first", "category": "first", "sub_category": "first",
        "style_code": "first", "designer": "first", "rank": "min",
        "category_source": "first", "sell_through_reported": "mean",
        "is_sample": "max", "sample_reason": "first", "sample_parent_sku": "first",
        "design_family": "first", "stock_on_hand_alt": "sum",
        "category_code": "first", "product_line": "first", "is_gift": "max",
    }
    agg = {k: v for k, v in agg.items() if k in df.columns}
    out = df.groupby(["sku", "season"], dropna=False).agg(agg).reset_index()

    out["net_sales_qty"] = out["sales_qty"].fillna(0) - out["return_qty"].fillna(0)
    out["return_rate"] = (out["return_qty"] / out["sales_qty"].replace(0, np.nan)).astype(float)

    # 售罄率：報表自帶就用他們的官方數字，缺漏才自算。
    # 兩者不一致時記在 sell_through_diff，差距大的款值得回頭查報表。
    computed = (out["net_sales_qty"] / out["stock_in"].replace(0, np.nan)).astype(float)
    if "sell_through_reported" in out.columns and out["sell_through_reported"].notna().any():
        out["sell_through_rate"] = out["sell_through_reported"].fillna(computed)
        out["sell_through_diff"] = (out["sell_through_reported"] - computed).abs().round(4)
    else:
        out["sell_through_rate"] = computed
        out["sell_through_diff"] = pd.NA

    # 銷貨額為 0 的款（贈品、未計價）不該算出 0 元均價去汙染折扣統計
    valid_amount = out["sales_amount"].fillna(0) > 0
    out["avg_selling_price"] = np.nan
    out.loc[valid_amount, "avg_selling_price"] = (
        out.loc[valid_amount, "sales_amount"] / out.loc[valid_amount, "net_sales_qty"].replace(0, np.nan)
    )
    out["avg_selling_price"] = out["avg_selling_price"].astype(float)

    if "cost" in out.columns:
        out["gross_margin"] = (
            (out["avg_selling_price"] - out["cost"]) / out["avg_selling_price"].replace(0, np.nan)
        ).astype(float)
    out["discount_depth"] = (
        1 - out["avg_selling_price"] / out["list_price"].replace(0, np.nan)
    ).astype(float)
    # 上市週數：有真正的最後銷售日就用它；沒有（多數情況）就用
    # 「報表快照日 - 入庫日」，代表這款到報表產出時已經上架多久。
    span = (out["last_sale_date"] - out["first_sale_date"]).dt.days
    if "snapshot_date" in out.columns:
        fallback = (out["snapshot_date"] - out["first_sale_date"]).dt.days
        span = span.fillna(fallback)
    out["weeks_on_sale"] = (span / 7).round(1)
    # 負值代表日期本身有問題（跨季調撥、補鍵資料），不是真的上架時間
    out.loc[out["weeks_on_sale"] < 0, "weeks_on_sale"] = np.nan
    return out
