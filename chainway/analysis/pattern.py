"""版型分析研究 (Pattern / Silhouette Study)。

回答的是設計師實際會問的四個問題：

  Q1 暢銷款的版型「甜蜜區間」在哪？   → sweet_spot()
     例：上衣胸腰比落在 1.12–1.18 的款，售罄率中位數最高。

  Q2 我這一季的新款，版型偏離甜蜜區間多少？ → deviation_report()
     這是打版前就能做的檢查，比賣完才知道有價值得多。

  Q3 十五年下來我們的版型怎麼漂移的？  → silhouette_drift()
     用來抓「不知不覺越做越寬」這種慢性偏移。

  Q4 哪些款其實是同一個版的變體？      → block_clusters()
     用 CLIP 向量 + 尺寸比例一起分群，找出可以共用版型的款，
     直接減少打版工時 —— 這是降低設計師工作量最實在的一條。
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..config import Config, get_config


def _derived_codes(cfg: Config) -> dict[str, str]:
    return {d["code"]: d["zh"] for d in cfg.taxonomy.get("measurements", {}).get("derived", [])}


def sweet_spot(df: pd.DataFrame, cfg: Config | None = None, bins: int = 5) -> pd.DataFrame:
    """把每個版型比例指標切成分位區間，看哪一段的績效最好。"""
    cfg = cfg or get_config()
    labels = _derived_codes(cfg)
    pool = df[~df.get("perf_excluded", pd.Series(False, index=df.index))]

    rows: list[dict] = []
    for cat, g in pool.groupby("category"):
        for code, zh in labels.items():
            if code not in g.columns:
                continue
            sub = g[[code, "sell_through_rate", "perf_percentile", "perf_band", "sku"]].dropna(subset=[code])
            if len(sub) < bins * 6:
                continue
            try:
                sub = sub.assign(band=pd.qcut(sub[code], bins, duplicates="drop"))
            except ValueError:
                continue
            for interval, gg in sub.groupby("band", observed=True):
                rows.append({
                    "category": cat,
                    "category_zh": cfg.category_label(str(cat)),
                    "metric": code,
                    "metric_zh": zh,
                    "range_low": round(float(interval.left), 3),
                    "range_high": round(float(interval.right), 3),
                    "n": len(gg),
                    "median_sell_through": round(float(gg["sell_through_rate"].median()), 4),
                    "star_rate": round(float((gg["perf_band"] == "STAR").mean()), 4),
                    "slow_rate": round(float((gg["perf_band"] == "SLOW").mean()), 4),
                })

    out = pd.DataFrame(rows)
    if out.empty:
        return out
    # 每個 (品類, 指標) 標記出最佳區間
    out["is_sweet_spot"] = out.groupby(["category", "metric"])["median_sell_through"].transform(
        lambda s: s == s.max()
    )
    return out.sort_values(["category", "metric", "range_low"]).reset_index(drop=True)


def sweet_spot_targets(spot: pd.DataFrame) -> pd.DataFrame:
    """濃縮成一張「打版目標值」表 —— 可以直接發給版師。"""
    if spot.empty:
        return spot
    best = spot[spot["is_sweet_spot"]].copy()
    best["target_mid"] = ((best["range_low"] + best["range_high"]) / 2).round(3)
    best["target_range"] = best.apply(lambda r: f"{r['range_low']:.2f} – {r['range_high']:.2f}", axis=1)
    return best[["category", "category_zh", "metric", "metric_zh", "target_range", "target_mid",
                 "n", "median_sell_through", "star_rate"]].reset_index(drop=True)


def deviation_report(
    candidates: pd.DataFrame,
    spot: pd.DataFrame,
    cfg: Config | None = None,
) -> pd.DataFrame:
    """新款版型 vs 歷史甜蜜區間的偏離度。用在打版之前。

    candidates: 至少要有 sku, category 與各版型比例欄位。
    """
    cfg = cfg or get_config()
    targets = sweet_spot_targets(spot)
    if targets.empty or candidates.empty:
        return pd.DataFrame()

    rows: list[dict] = []
    for _, cand in candidates.iterrows():
        cat = cand.get("category")
        for _, t in targets[targets["category"] == cat].iterrows():
            val = cand.get(t["metric"])
            if pd.isna(val):
                continue
            lo, hi = [float(x) for x in t["target_range"].split("–")]
            if lo <= val <= hi:
                status, note = "IN", "落在歷史最佳區間"
            else:
                gap = (val - hi) if val > hi else (val - lo)
                pct = abs(gap) / max(t["target_mid"], 1e-6) * 100
                status = "OUT"
                note = f"偏離最佳區間 {gap:+.3f}（約 {pct:.0f}%），建議打版時修正"
            rows.append({
                "sku": cand.get("sku"),
                "category_zh": t["category_zh"],
                "metric_zh": t["metric_zh"],
                "value": round(float(val), 3),
                "target_range": t["target_range"],
                "status": status,
                "note": note,
            })
    out = pd.DataFrame(rows)
    if not out.empty:
        out = out.sort_values(["sku", "status"], ascending=[True, True]).reset_index(drop=True)
    return out


def silhouette_drift(df: pd.DataFrame, cfg: Config | None = None) -> pd.DataFrame:
    """歷年版型漂移：每季各指標中位數，以及對應的績效。"""
    cfg = cfg or get_config()
    labels = _derived_codes(cfg)
    cols = [c for c in labels if c in df.columns]
    if not cols or "season" not in df.columns:
        return pd.DataFrame()

    agg = {c: "median" for c in cols}
    agg["sell_through_rate"] = "median"
    agg["sku"] = "nunique"
    out = df.groupby(["season", "category"], dropna=False).agg(agg).reset_index()
    out = out.rename(columns={"sku": "n_styles"})
    out["category_zh"] = out["category"].map(lambda c: cfg.category_label(str(c)))

    # 逐季變化量，幫你看出慢性漂移
    out = out.sort_values(["category", "season"])
    for c in cols:
        out[f"{c}__delta"] = out.groupby("category")[c].diff().round(4)
    return out.reset_index(drop=True)


def block_clusters(
    meta: pd.DataFrame,
    vecs: np.ndarray,
    cfg: Config | None = None,
    n_clusters: int | None = None,
) -> pd.DataFrame:
    """用 CLIP 向量分群，找出「可以共用同一個版」的款群。

    輸出每群的代表款（離群心最近者）與群內績效差異 ——
    同一群內有暢銷也有滯銷時，差別通常就出在細節或配色，那正是最值得看的對比。
    """
    cfg = cfg or get_config()
    if len(meta) != len(vecs) or len(vecs) == 0:
        raise ValueError("meta 與向量列數不一致")

    try:
        from sklearn.cluster import KMeans
    except ImportError:
        return pd.DataFrame([{"note": "未安裝 scikit-learn，無法分群。pip install scikit-learn"}])

    k = n_clusters or max(4, min(40, len(vecs) // 15))
    km = KMeans(n_clusters=k, n_init=10, random_state=42).fit(vecs)

    out = meta.reset_index(drop=True).copy()
    out["block_cluster"] = km.labels_
    dists = np.linalg.norm(vecs - km.cluster_centers_[km.labels_], axis=1)
    out["dist_to_center"] = dists.round(4)
    out["is_block_representative"] = out.groupby("block_cluster")["dist_to_center"].transform("min") == out["dist_to_center"]
    return out


def block_summary(clustered: pd.DataFrame, cfg: Config | None = None) -> pd.DataFrame:
    """每個版群的規模、績效落差與「可共用版型」判斷。"""
    cfg = cfg or get_config()
    if "block_cluster" not in clustered.columns:
        return pd.DataFrame()

    rows = []
    for cid, g in clustered.groupby("block_cluster"):
        rep = g[g.get("is_block_representative", False)]
        band = g["perf_band"] if "perf_band" in g else pd.Series(dtype=str)
        rows.append({
            "block_cluster": cid,
            "n_styles": len(g),
            "categories": ", ".join(sorted(set(g.get("category", pd.Series(dtype=str)).dropna().astype(str)))),
            "representative_sku": rep["sku"].iloc[0] if len(rep) else "",
            "representative_image": rep["image_path"].iloc[0] if len(rep) and "image_path" in rep else "",
            "star_n": int((band == "STAR").sum()),
            "slow_n": int((band == "SLOW").sum()),
            "median_sell_through": round(float(g["sell_through_rate"].median()), 4)
                if "sell_through_rate" in g and g["sell_through_rate"].notna().any() else np.nan,
        })
    out = pd.DataFrame(rows)
    if out.empty:
        return out
    out["shareable_block"] = out["n_styles"] >= 4
    out["worth_reviewing"] = (out["star_n"] > 0) & (out["slow_n"] > 0)
    out["note"] = np.where(
        out["worth_reviewing"],
        "同版群內同時有暢銷與滯銷 → 差異在細節/配色，值得逐款對比",
        np.where(out["shareable_block"], "款數足夠，可共用版型基礎降低打版工時", ""),
    )
    return out.sort_values("n_styles", ascending=False).reset_index(drop=True)
