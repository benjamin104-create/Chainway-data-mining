"""只用 POS 就能做的商業分析（不需要影像特徵）。

這一層存在的理由很實際：Fashion-CLIP 要跑幾十分鐘、要有系統圖才動得了，
但貨號本身已經帶了品類、產品線、季別，加上報表裡的定價、設計師、入庫日，
不必等影像就能回答一批很具體的問題：

    產品線     經典格紋線值不值得繼續投資？哪個品類的格紋做得起來？
    定價帶     哪個價格帶最好賣？貴的款是不是靠折扣才動？
    上市時機   同一款早一個月或晚一個月上，差多少？
    設計師     各人負責的款表現如何（附樣本偏誤警語）

影像特徵進來之後這些分析不會作廢 —— 它們是彼此獨立的切面。
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..config import Config, get_config


def _active(df: pd.DataFrame) -> pd.DataFrame:
    """只留下真正參與販售、且分級有效的款。"""
    out = df
    if "perf_excluded" in out.columns:
        out = out[~out["perf_excluded"].fillna(False).astype(bool)]
    return out


def product_line_report(df: pd.DataFrame, cfg: Config | None = None) -> pd.DataFrame:
    """經典格紋線 vs 一般線，以及格紋線內各品類的表現。"""
    cfg = cfg or get_config()
    pool = _active(df)
    if pool.empty or "product_line" not in pool.columns:
        return pd.DataFrame()

    rows = []
    for line, g in pool.groupby("product_line"):
        rows.append(_perf_row({"層級": "產品線", "項目": str(line)}, g))
    for (line, sub), g in pool.groupby(["product_line", "sub_category"], dropna=False):
        if len(g) < 4:
            continue
        rows.append(_perf_row({"層級": f"{line}·細分", "項目": str(sub)}, g))
    out = pd.DataFrame(rows)
    return out.sort_values(["層級", "售罄率中位"], ascending=[True, False]).reset_index(drop=True)


def _perf_row(base: dict, g: pd.DataFrame) -> dict:
    n = len(g)
    return {
        **base,
        "款數": n,
        "售罄率中位": round(float(g["sell_through_rate"].median()), 3),
        "暢銷率": round(float((g["perf_band"] == "STAR").mean()), 3),
        "滯銷率": round(float((g["perf_band"] == "SLOW").mean()), 3),
        "定價中位": round(float(g["list_price"].median()), 0) if g["list_price"].notna().any() else np.nan,
        "折扣中位": round(float(g["discount_depth"].median()), 3) if g["discount_depth"].notna().any() else np.nan,
        "投入件數": int(g["stock_in"].fillna(0).sum()),
        # 樣本太少時任何結論都不該當真，直接寫在表上而不是藏在註腳
        "證據強度": "足夠" if n >= 30 else ("偏弱" if n >= 10 else "極弱，僅供參考"),
    }


def price_band_report(df: pd.DataFrame, cfg: Config | None = None,
                      n_bands: int = 5) -> pd.DataFrame:
    """定價帶 × 表現。分品類做，因為外套與 T 恤的價格帶本來就不同。"""
    cfg = cfg or get_config()
    pool = _active(df)
    pool = pool[pool["list_price"].fillna(0) > 0]
    if len(pool) < n_bands * 6:
        return pd.DataFrame()

    rows = []
    for cat, g in pool.groupby("category"):
        if len(g) < n_bands * 6:
            continue
        try:
            bands = pd.qcut(g["list_price"], n_bands, duplicates="drop")
        except ValueError:
            continue
        for band, gg in g.groupby(bands, observed=True):
            rows.append(_perf_row(
                {"層級": cfg.category_label(str(cat)),
                 "項目": f"{int(band.left):,}–{int(band.right):,}"}, gg))
    return pd.DataFrame(rows)


def launch_timing_report(df: pd.DataFrame, cfg: Config | None = None) -> pd.DataFrame:
    """上市月份 × 表現。

    改番號家族的分析顯示同一設計在不同季差距可達 95%，強烈暗示時機是主因。
    這張表換個角度驗證同一件事：把入庫月份當成上市時機的代理變數，
    看同一品類在不同月份入庫的款，表現差多少。
    """
    cfg = cfg or get_config()
    pool = _active(df)
    if "first_sale_date" not in pool.columns or pool["first_sale_date"].isna().all():
        return pd.DataFrame()
    pool = pool[pool["first_sale_date"].notna()].copy()
    pool["入庫月"] = pool["first_sale_date"].dt.month

    rows = []
    for (cat, month), g in pool.groupby(["category", "入庫月"]):
        if len(g) < 8:
            continue
        rows.append(_perf_row(
            {"層級": cfg.category_label(str(cat)), "項目": f"{int(month)}月"}, g))
    out = pd.DataFrame(rows)
    if out.empty:
        return out
    # 同品類內，最好月份與最差月份的差距 —— 差距大代表時機很關鍵
    out["同品類內排名"] = out.groupby("層級")["售罄率中位"].rank(ascending=False).astype(int)
    return out.sort_values(["層級", "售罄率中位"], ascending=[True, False]).reset_index(drop=True)


def timing_impact(timing: pd.DataFrame) -> pd.DataFrame:
    """把上市月份表濃縮成「每個品類的時機影響有多大」。"""
    if timing.empty:
        return timing
    rows = []
    for cat, g in timing.groupby("層級"):
        if len(g) < 3:
            continue
        best, worst = g.iloc[0], g.iloc[-1]
        rows.append({
            "品類": cat,
            "最佳月份": best["項目"], "最佳售罄率": best["售罄率中位"], "最佳n": best["款數"],
            "最差月份": worst["項目"], "最差售罄率": worst["售罄率中位"], "最差n": worst["款數"],
            "差距": round(float(best["售罄率中位"] - worst["售罄率中位"]), 3),
            "涵蓋月份數": len(g),
        })
    out = pd.DataFrame(rows)
    if out.empty:
        return out
    out["解讀"] = np.where(
        out["差距"] >= 0.30,
        "★ 時機影響大：同品類差距超過 30 個百分點，排期值得重新檢討",
        np.where(out["差距"] >= 0.15, "時機有影響", "時機影響不明顯"))
    return out.sort_values("差距", ascending=False).reset_index(drop=True)


def designer_report(df: pd.DataFrame, cfg: Config | None = None,
                    min_styles: int = 20) -> pd.DataFrame:
    """設計師表現。

    ⚠️ 這張表最容易被誤用。款數差距可達數倍，而且誰接到哪些品類、
    哪些價格帶的案子本身就不隨機 —— 直接讀成「誰比較會設計」是錯的。
    所以一併輸出各人的品類與價格帶組成，讓讀的人自己判斷可比性。
    """
    cfg = cfg or get_config()
    pool = _active(df)
    if "designer" not in pool.columns:
        return pd.DataFrame()
    pool = pool[pool["designer"].notna()]

    rows = []
    for name, g in pool.groupby("designer"):
        if len(g) < min_styles:
            continue
        mix = g["category"].value_counts(normalize=True)
        rows.append({
            **_perf_row({"層級": "設計師", "項目": str(name)}, g),
            "主要品類": "、".join(f"{cfg.category_label(str(c))}{v:.0%}"
                              for c, v in mix.head(3).items()),
            "格紋線佔比": round(float((g["product_line"] == "經典格紋").mean()), 3)
            if "product_line" in g else np.nan,
        })
    out = pd.DataFrame(rows)
    return out.sort_values("售罄率中位", ascending=False).reset_index(drop=True) if not out.empty else out


def exclusion_audit(df: pd.DataFrame, cfg: Config | None = None) -> pd.DataFrame:
    """哪些款被排除、為什麼。排除規則錯了會讓整份報告失真，必須攤開來看。"""
    cfg = cfg or get_config()
    total = len(df)
    rows = []

    def add(label: str, mask: pd.Series, note: str) -> None:
        n = int(mask.fillna(False).astype(bool).sum())
        rows.append({"排除原因": label, "款數": n,
                     "佔全體": round(n / max(total, 1), 3), "說明": note})

    if "is_gift" in df.columns:
        add("贈品／魅力商品", df["is_gift"], "8 字頭。是送的不是賣的，售罄率與毛利對它們沒有意義")
    if "is_sample" in df.columns:
        add("樣衣／樣品", df["is_sample"], "品名含樣衣字樣，或累進 ≤2 且無銷售")
    if "stock_in" in df.columns:
        perf = cfg.get("performance", {})
        add(f"投入量 < {perf.get('min_stock_in', 30)}",
            df["stock_in"].fillna(0) < perf.get("min_stock_in", 30),
            "樣本太小，售罄率的隨機波動大於真實差異")
    if "perf_excluded" in df.columns:
        rows.append({"排除原因": "── 實際排除合計（含重疊）──",
                     "款數": int(df["perf_excluded"].sum()),
                     "佔全體": round(float(df["perf_excluded"].mean()), 3),
                     "說明": "一款可能同時符合多個排除條件"})
    return pd.DataFrame(rows)
