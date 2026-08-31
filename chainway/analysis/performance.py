"""銷售績效分級：把每一款放進 暢銷 / 主力 / 平銷 / 滯銷 四級。

關鍵設計：分級一定要在「同季別 × 同品類」內做相對比較。
理由很實際 —— 冬天大衣的絕對銷量永遠比不上夏天 T 恤，
如果用全公司同一條線切，你會得到「冬季外套全部滯銷」這種沒有意義的結論。
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..config import Config, get_config

BAND_ORDER = ["STAR", "CORE", "STEADY", "SLOW", "EXCLUDED"]
BAND_ZH = {
    "STAR": "暢銷", "CORE": "主力", "STEADY": "平銷",
    "SLOW": "滯銷", "EXCLUDED": "不列入(樣本不足)",
}


def grade(master: pd.DataFrame, cfg: Config | None = None) -> pd.DataFrame:
    cfg = cfg or get_config()
    perf = cfg.get("performance", {})
    metric = perf.get("primary_metric", "sell_through_rate")
    group_by = [c for c in perf.get("group_by", ["season", "category"]) if c in master.columns]
    bands = perf.get("bands", {})
    star_q, core_q, slow_q = bands.get("star", 0.8), bands.get("core", 0.5), bands.get("slow", 0.2)

    df = master.copy()
    if metric not in df.columns:
        raise KeyError(f"主表缺少績效欄位 '{metric}'，請檢查 POS 是否有進貨量與銷售量。")

    # 排除樣本不足的款
    excluded = pd.Series(False, index=df.index)
    if "weeks_on_sale" in df.columns:
        # 只在「算得出上市週數」時才用這個門檻。報表沒有真正的最後銷售日時
        # weeks_on_sale 會整欄是 NaN，若用 fillna(0) 判斷會把全部商品誤殺。
        weeks = pd.to_numeric(df["weeks_on_sale"], errors="coerce")
        excluded |= weeks.notna() & (weeks < perf.get("min_weeks_on_sale", 4))
    if "stock_in" in df.columns:
        excluded |= df["stock_in"].fillna(0) < perf.get("min_stock_in", 30)
    excluded |= df[metric].isna()

    df["perf_excluded"] = excluded
    df["perf_band"] = "EXCLUDED"

    pool = df[~excluded]
    if pool.empty:
        df["perf_percentile"] = np.nan
        df["perf_band_zh"] = df["perf_band"].map(BAND_ZH)
        return df

    # 組內百分位
    pct = pool.groupby(group_by, dropna=False)[metric].rank(pct=True) if group_by else pool[metric].rank(pct=True)
    df.loc[pool.index, "perf_percentile"] = pct.round(4)

    def to_band(p: float) -> str:
        if p >= star_q:
            return "STAR"
        if p >= core_q:
            return "CORE"
        if p >= slow_q:
            return "STEADY"
        return "SLOW"

    df.loc[pool.index, "perf_band"] = pct.map(to_band)
    df["perf_band_zh"] = df["perf_band"].map(BAND_ZH)

    # 組內樣本數太少時，百分位沒有統計意義 —— 標記出來供報告加註警語
    if group_by:
        sizes = df.groupby(group_by, dropna=False)["sku"].transform("size")
        df["perf_group_n"] = sizes
        df["perf_group_reliable"] = sizes >= 10
    else:
        df["perf_group_n"] = len(df)
        df["perf_group_reliable"] = True

    return df


def summary_by_group(df: pd.DataFrame, cfg: Config | None = None) -> pd.DataFrame:
    """各季別 × 品類的分級分布與關鍵指標，作為報告首頁。"""
    cfg = cfg or get_config()
    group_by = [c for c in cfg.get("performance", {}).get("group_by", []) if c in df.columns]
    if not group_by:
        return pd.DataFrame()

    agg = df.groupby(group_by, dropna=False).agg(
        n_styles=("sku", "nunique"),
        stock_in=("stock_in", "sum"),
        net_sales_qty=("net_sales_qty", "sum"),
        sales_amount=("sales_amount", "sum"),
        sell_through=("sell_through_rate", "median"),
        discount_depth=("discount_depth", "median"),
    ).reset_index()

    bands = df.pivot_table(
        index=group_by, columns="perf_band", values="sku", aggfunc="nunique", fill_value=0
    ).reset_index()
    out = agg.merge(bands, on=group_by, how="left")
    if "category" in out.columns:
        out["category_zh"] = out["category"].map(lambda c: cfg.category_label(str(c)))
    return out.sort_values(group_by).reset_index(drop=True)


def top_and_bottom(df: pd.DataFrame, n: int = 20, by: str = "category") -> dict[str, pd.DataFrame]:
    """各品類的 Top N 暢銷 / Bottom N 滯銷清單。"""
    cols = [c for c in ["sku", "product_name", "season", "category", "category_zh", "image_path",
                        "list_price", "avg_selling_price", "stock_in", "net_sales_qty",
                        "sell_through_rate", "gross_margin", "perf_band_zh", "perf_percentile",
                        "fb_verdict", "fb_tags"] if c in df.columns]
    pool = df[~df["perf_excluded"]] if "perf_excluded" in df else df
    out: dict[str, pd.DataFrame] = {}
    key = by if by in pool.columns else None
    groups = pool.groupby(key) if key else [("ALL", pool)]
    for name, g in groups:
        g = g.sort_values("perf_percentile", ascending=False)
        out[str(name)] = pd.concat([g.head(n)[cols], g.tail(n)[cols]]).reset_index(drop=True)
    return out
