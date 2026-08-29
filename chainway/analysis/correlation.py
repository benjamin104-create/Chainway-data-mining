"""設計特徵 × 銷售績效 關聯性分析。

三層方法，由淺到深，互相驗證：
  1. 交叉表 + 卡方檢定 + Cramér's V  → 「這個特徵和暢銷有沒有關係？關係多強？」
  2. Lift（提升度）                  → 「這個選項讓暢銷機率提高幾倍？」（給人看的）
  3. 梯度提升樹特徵重要度            → 「所有特徵一起看時，誰真的重要？」（控制共線性）

刻意避免的陷阱：
  * 樣本數不足的格子直接排除，不讓「只有 2 款的青果領」變成重大發現
  * 多重檢定會膨脹假陽性，所以套用 Benjamini–Hochberg FDR 校正
  * 所有結論都附上樣本數，報告裡讀者能自己判斷可信度
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..config import Config, get_config


def _chi2(table: np.ndarray) -> tuple[float, float, int]:
    """回傳 (chi2, p_value, dof)。沒有 scipy 時用常態近似求 p。"""
    row = table.sum(axis=1, keepdims=True)
    col = table.sum(axis=0, keepdims=True)
    total = table.sum()
    if total == 0:
        return 0.0, 1.0, 0
    expected = row @ col / total
    with np.errstate(divide="ignore", invalid="ignore"):
        stat = np.nansum((table - expected) ** 2 / np.where(expected == 0, np.nan, expected))
    dof = (table.shape[0] - 1) * (table.shape[1] - 1)
    try:
        from scipy.stats import chi2 as chi2_dist
        p = float(chi2_dist.sf(stat, dof)) if dof > 0 else 1.0
    except ImportError:
        # Wilson–Hilferty 近似
        if dof <= 0:
            return float(stat), 1.0, dof
        z = ((stat / dof) ** (1 / 3) - (1 - 2 / (9 * dof))) / np.sqrt(2 / (9 * dof))
        p = float(0.5 * np.erfc(z / np.sqrt(2))) if hasattr(np, "erfc") else float(np.exp(-0.717 * z - 0.416 * z * z))
    return float(stat), float(min(max(p, 0.0), 1.0)), dof


def cramers_v(table: np.ndarray) -> float:
    stat, _, _ = _chi2(table)
    n = table.sum()
    if n == 0:
        return 0.0
    k = min(table.shape) - 1
    return float(np.sqrt(stat / (n * k))) if k > 0 else 0.0


def _bh_fdr(pvals: list[float]) -> list[float]:
    """Benjamini–Hochberg 校正後的 q 值。"""
    n = len(pvals)
    if n == 0:
        return []
    order = np.argsort(pvals)
    ranked = np.array(pvals)[order]
    q = ranked * n / (np.arange(n) + 1)
    q = np.minimum.accumulate(q[::-1])[::-1]
    out = np.empty(n)
    out[order] = np.clip(q, 0, 1)
    return out.tolist()


def attribute_association(
    df: pd.DataFrame,
    cfg: Config | None = None,
    success_bands: tuple[str, ...] = ("STAR", "CORE"),
    by_category: bool = True,
) -> pd.DataFrame:
    """每個「品類 × 屬性 × 選項」的暢銷關聯強度與提升度。"""
    cfg = cfg or get_config()
    acfg = cfg.get("analysis", {})
    min_cell = acfg.get("min_samples_per_cell", 5)

    pool = df[~df.get("perf_excluded", pd.Series(False, index=df.index))].copy()
    pool = pool[pool["perf_band"].isin(["STAR", "CORE", "STEADY", "SLOW"])]
    if pool.empty:
        return pd.DataFrame()

    pool["is_success"] = pool["perf_band"].isin(success_bands)
    attrs = list(cfg.taxonomy.get("attributes", {}).keys())
    groups = pool.groupby("category") if by_category else [("ALL", pool)]

    rows: list[dict] = []
    for cat, g in groups:
        base_rate = g["is_success"].mean()
        for attr in attrs:
            if attr not in g.columns:
                continue
            sub = g[~g[attr].isin(["n/a", "uncertain"]) & g[attr].notna()]
            if len(sub) < min_cell * 2 or sub[attr].nunique() < 2:
                continue

            # 欄名一律轉成字串：布林欄名會被 pandas 當成遮罩，不能直接拿來取欄
            table = pd.crosstab(sub[attr], sub["is_success"].map({False: "fail", True: "win"}))
            for col in ("fail", "win"):
                if col not in table.columns:
                    table[col] = 0
            table = table[["fail", "win"]]
            table = table[table.sum(axis=1) >= min_cell]
            if len(table) < 2:
                continue

            stat, p, dof = _chi2(table.values)
            v = cramers_v(table.values)

            for option, r in table.iterrows():
                n = int(r["fail"] + r["win"])
                rate = r["win"] / n if n else np.nan
                lift = rate / base_rate if base_rate else np.nan
                opt_sub = sub[sub[attr] == option]
                rows.append({
                    "category": cat,
                    "category_zh": cfg.category_label(str(cat)),
                    "attribute": attr,
                    "attribute_zh": cfg.attribute_label(attr),
                    "option": option,
                    "option_zh": cfg.option_label(attr, str(option)),
                    "n": n,
                    "success_rate": round(float(rate), 4),
                    "base_rate": round(float(base_rate), 4),
                    "lift": round(float(lift), 3) if pd.notna(lift) else np.nan,
                    "cramers_v": round(v, 4),
                    "chi2": round(stat, 3),
                    "p_value": p,
                    "dof": dof,
                    "median_sell_through": round(float(opt_sub["sell_through_rate"].median()), 4)
                        if "sell_through_rate" in opt_sub else np.nan,
                    "median_margin": round(float(opt_sub["gross_margin"].median()), 4)
                        if "gross_margin" in opt_sub and opt_sub["gross_margin"].notna().any() else np.nan,
                })

    out = pd.DataFrame(rows)
    if out.empty:
        return out

    # 每個 (category, attribute) 是一次檢定，去重後做 FDR 校正
    tests = out[["category", "attribute", "p_value"]].drop_duplicates()
    tests["q_value"] = _bh_fdr(tests["p_value"].tolist())
    out = out.merge(tests, on=["category", "attribute", "p_value"], how="left")
    alpha = acfg.get("alpha", 0.05)
    out["significant"] = out["q_value"] < alpha
    return out.sort_values(["category", "attribute", "lift"], ascending=[True, True, False]).reset_index(drop=True)


def numeric_association(df: pd.DataFrame, cfg: Config | None = None) -> pd.DataFrame:
    """版型比例指標（連續值）與績效百分位的相關性（Spearman）。"""
    cfg = cfg or get_config()
    derived = [d["code"] for d in cfg.taxonomy.get("measurements", {}).get("derived", [])]
    labels = {d["code"]: d["zh"] for d in cfg.taxonomy.get("measurements", {}).get("derived", [])}
    pool = df[~df.get("perf_excluded", pd.Series(False, index=df.index))]

    rows = []
    for cat, g in pool.groupby("category"):
        for code in derived:
            if code not in g.columns:
                continue
            pair = g[[code, "perf_percentile"]].dropna()
            if len(pair) < 15:
                continue
            rho = pair[code].rank().corr(pair["perf_percentile"].rank())
            rows.append({
                "category": cat,
                "category_zh": cfg.category_label(str(cat)),
                "metric": code,
                "metric_zh": labels.get(code, code),
                "n": len(pair),
                "spearman_rho": round(float(rho), 4) if pd.notna(rho) else np.nan,
                "direction": "越大越好賣" if rho and rho > 0 else "越小越好賣",
                "star_median": round(float(g.loc[g["perf_band"] == "STAR", code].median()), 3),
                "slow_median": round(float(g.loc[g["perf_band"] == "SLOW", code].median()), 3),
            })
    out = pd.DataFrame(rows)
    return out.reindex(out["spearman_rho"].abs().sort_values(ascending=False).index).reset_index(drop=True) if not out.empty else out


def feature_importance(df: pd.DataFrame, cfg: Config | None = None) -> pd.DataFrame:
    """所有特徵一起放進模型，看誰真的解釋得了暢銷（控制特徵間的相關）。"""
    cfg = cfg or get_config()
    try:
        from sklearn.ensemble import HistGradientBoostingClassifier
        from sklearn.inspection import permutation_importance
        from sklearn.model_selection import train_test_split
    except ImportError:
        return pd.DataFrame([{"note": "未安裝 scikit-learn，略過特徵重要度。pip install scikit-learn"}])

    pool = df[~df.get("perf_excluded", pd.Series(False, index=df.index))].copy()
    if len(pool) < 60:
        return pd.DataFrame([{"note": f"樣本僅 {len(pool)} 筆，不足以訓練模型（建議 ≥ 60）"}])

    attrs = [a for a in cfg.taxonomy.get("attributes", {}) if a in pool.columns]
    nums = [d["code"] for d in cfg.taxonomy.get("measurements", {}).get("derived", []) if d["code"] in pool.columns]
    nums += [c for c in ("list_price",) if c in pool.columns]
    if not attrs and not nums:
        return pd.DataFrame([{"note": "沒有可用特徵欄位"}])

    X = pd.DataFrame(index=pool.index)
    for a in attrs:
        X[a] = pool[a].astype("category").cat.codes
    for n in nums:
        X[n] = pd.to_numeric(pool[n], errors="coerce")
    y = pool["perf_band"].isin(["STAR", "CORE"]).astype(int)

    if y.nunique() < 2:
        return pd.DataFrame([{"note": "績效分級只有單一類別，無法建模"}])

    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)
    model = HistGradientBoostingClassifier(max_iter=250, random_state=42)
    model.fit(Xtr, ytr)
    acc = model.score(Xte, yte)
    imp = permutation_importance(model, Xte, yte, n_repeats=12, random_state=42)

    labels = {**{a: cfg.attribute_label(a) for a in attrs},
              **{d["code"]: d["zh"] for d in cfg.taxonomy.get("measurements", {}).get("derived", [])},
              "list_price": "定價"}
    out = pd.DataFrame({
        "feature": X.columns,
        "feature_zh": [labels.get(c, c) for c in X.columns],
        "importance": imp.importances_mean.round(4),
        "std": imp.importances_std.round(4),
    }).sort_values("importance", ascending=False).reset_index(drop=True)
    out.attrs["holdout_accuracy"] = round(float(acc), 3)
    out.attrs["n_train"] = len(Xtr)
    return out


def top_findings(assoc: pd.DataFrame, cfg: Config | None = None) -> pd.DataFrame:
    """挑出最值得寫進報告的結論：顯著、樣本夠、提升度明顯。"""
    cfg = cfg or get_config()
    if assoc.empty:
        return assoc
    n = cfg.get("analysis", {}).get("top_n_findings", 15)
    sel = assoc[assoc["significant"] & (assoc["n"] >= cfg.get("analysis", {}).get("min_samples_per_cell", 5) * 2)].copy()
    sel["effect"] = (sel["lift"] - 1).abs() * sel["cramers_v"]
    sel = sel.sort_values("effect", ascending=False).groupby("category").head(n)

    def sentence(r: pd.Series) -> str:
        direction = "高" if r["lift"] >= 1 else "低"
        pct = abs(r["lift"] - 1) * 100
        return (f"{r['category_zh']}：{r['attribute_zh']}為「{r['option_zh']}」的款，"
                f"進入暢銷/主力的機率比同品類平均{direction} {pct:.0f}%"
                f"（{r['n']} 款，成功率 {r['success_rate']:.0%} vs 平均 {r['base_rate']:.0%}）")

    sel["finding_zh"] = sel.apply(sentence, axis=1)
    return sel.reset_index(drop=True)
