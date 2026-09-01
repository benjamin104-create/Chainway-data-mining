"""設計逆向工程：從賣掉的東西反推「為什麼賣」。

這個模組要回答的是設計端的問題，不是財務端的：
    下一季該做什麼領型？格紋放哪裡？什麼價位帶？開幾款？

方法上有三個堅持，都是為了讓結論站得住：

**一、一律在同一個「品類 × 季別」內比較，不做全庫比較。**

全庫比較會得到「格紋款完銷率比較高」這種結論，但格紋多半做在外套上，
而外套本來就好賣 —— 那是品類效果，不是格紋效果。這種混淆（辛普森悖論）
在服裝資料裡幾乎必然發生，因為特徵和品類高度綁定。分層之後，
比的是「同樣是外套，有格紋的 vs 沒格紋的」，這才是設計師能用的資訊。

**二、以「有幾個分層同向」當主要證據，而不是單一個 p 值。**

一個特徵若在 7 個品類裡有 6 個都往同一方向，那比一個 p=0.04 更值得相信 ——
後者可能是多重比較撿到的。方向一致性直觀、抗離群、也好對設計師解釋。

**三、每一條結論都帶得回實際的款。**

設計師是看圖工作的。只給「提升 12 個百分點」沒有用，要能點回去看
是哪幾件、長什麼樣、賣了多少。所以每一列都附上代表貨號。
"""
from __future__ import annotations

from typing import Any, Sequence

import numpy as np
import pandas as pd

from ..config import Config, get_config

# 一個分層裡至少要有這麼多款，比較才有意義。
# 低於這個數，一兩件離群就能翻轉結論。
MIN_PER_CELL = 6
# 一個特徵值至少要在這麼多個分層裡出現過，才談方向一致性
MIN_STRATA = 3
# 組合挖掘的樣本下限比單特徵高 —— 組合本來就切得更碎，更容易過度擬合
MIN_COMBO_N = 12

# 預設的分層維度：品類決定版型與價位帶，季別碼決定氣候與檔期。
# 這兩個是服裝資料裡最強的混淆來源，不控制它們，其餘分析都不可信。
DEFAULT_STRATA = ("category", "season_term_code")

# 這些欄位是績效本身或它的成分，拿來當「特徵」等於用答案解釋答案
LEAK_COLS = {
    "sell_through_rate", "sell_through_reported", "net_sales_qty", "sales_qty",
    "stock_on_hand", "stock_in", "sales_amount", "perf_band", "perf_band_zh",
    "perf_percentile", "avg_selling_price", "gross_margin", "return_rate",
}


def _evidence(n: int) -> str:
    """樣本量對應的證據強度。報告裡每一列都要標，讀者才知道能信到什麼程度。"""
    if n >= 30:
        return "足夠"
    if n >= 12:
        return "偏弱"
    return "極弱"


def candidate_features(df: pd.DataFrame, extra: Sequence[str] = ()) -> list[str]:
    """挑出可以當設計特徵的欄位：類別型、值不太多、也不是績效本身。"""
    out = []
    for c in df.columns:
        if c in LEAK_COLS or c.endswith(("_path", "_conf", "_id")):
            continue
        if c in ("sku", "style_code", "season", "source_file", "product_name"):
            continue
        s = df[c]
        if s.dtype.kind in "biufc" and c not in extra:
            continue
        nun = s.nunique(dropna=True)
        if 2 <= nun <= 40 and s.notna().mean() >= 0.05:
            out.append(c)
    return out


def stratified_lift(df: pd.DataFrame, features: Sequence[str] | None = None, *,
                    metric: str = "sell_through_rate",
                    strata: Sequence[str] = DEFAULT_STRATA,
                    min_per_cell: int = MIN_PER_CELL,
                    min_strata: int = MIN_STRATA) -> pd.DataFrame:
    """在每個分層內比較「有此特徵 vs 同層其他款」，再跨層彙總。

    回傳每個 (特徵, 值) 一列，含：
        平均差異   跨層加權後的完銷率差（百分點），正值代表比同層平均好
        同向層數   有幾個分層的方向一致 —— 這是主要證據
        層數       總共在幾個分層裡出現
        n          總款數
        代表貨號   讓人回頭看實際商品
    """
    df = df[df[metric].notna()].copy()
    if df.empty:
        return pd.DataFrame()
    features = list(features) if features is not None else candidate_features(df)
    strata = [s for s in strata if s in df.columns]
    if not strata:
        df = df.assign(_all="全部")
        strata = ["_all"]

    rows: list[dict[str, Any]] = []
    for feat in features:
        if feat in strata or feat not in df.columns:
            continue
        for value, _ in df[feat].value_counts().items():
            diffs, weights, n_in_total, examples = [], [], 0, []
            for _, g in df.groupby(list(strata), dropna=True):
                if len(g) < min_per_cell * 2:
                    continue
                inside = g[g[feat] == value]
                outside = g[g[feat] != value]
                if len(inside) < min_per_cell or len(outside) < min_per_cell:
                    continue
                diffs.append(float(inside[metric].mean() - outside[metric].mean()))
                weights.append(len(inside))
                n_in_total += len(inside)
                if "sku" in inside.columns:
                    examples += inside.nlargest(2, metric)["sku"].astype(str).tolist()
            if len(diffs) < min_strata:
                continue
            d = np.array(diffs)
            w = np.array(weights, dtype=float)
            pooled = float((d * w).sum() / w.sum())
            same_dir = int((np.sign(d) == np.sign(pooled)).sum())
            rows.append({
                "特徵": feat, "特徵值": value,
                "平均差異pt": round(pooled * 100, 2),
                "同向層數": same_dir, "層數": len(d),
                "一致率": round(same_dir / len(d), 3),
                "n": n_in_total,
                "證據強度": _evidence(n_in_total),
                "代表貨號": "、".join(dict.fromkeys(examples))[:60],
            })
    out = pd.DataFrame(rows)
    if out.empty:
        return out
    return out.sort_values(["一致率", "平均差異pt"], ascending=[False, False]).reset_index(drop=True)


def robust_findings(lift: pd.DataFrame, *, min_consistency: float = 0.7,
                    min_strata: int = MIN_STRATA, min_effect_pt: float = 4.0,
                    min_n: int = 12) -> pd.DataFrame:
    """只留下「夠多層同向、效果夠大、樣本夠」的結論。

    三個條件要同時滿足。單看效果大小會撿到一堆小樣本的雜訊；
    單看一致率會撿到差 0.5 個百分點但剛好都同向的無用結論。
    """
    if lift.empty:
        return lift
    keep = lift[(lift["一致率"] >= min_consistency)
                & (lift["層數"] >= min_strata)
                & (lift["平均差異pt"].abs() >= min_effect_pt)
                & (lift["n"] >= min_n)].copy()
    keep["方向"] = np.where(keep["平均差異pt"] > 0, "助銷", "拖累")
    return keep.sort_values("平均差異pt", ascending=False).reset_index(drop=True)


def combo_lift(df: pd.DataFrame, features: Sequence[str], *,
               metric: str = "sell_through_rate",
               strata: Sequence[str] = DEFAULT_STRATA,
               min_n: int = MIN_COMBO_N, top: int = 40) -> pd.DataFrame:
    """兩個特徵一起看，並扣掉各自單獨的效果，只留下真正的加成。

    為什麼要扣：「格紋 × 拉鍊」看起來很好，可能只是因為格紋本身就好，
    跟拉鍊無關。交互作用 = 組合的效果 −（特徵 A 的效果 ＋ 特徵 B 的效果）。
    只有這個殘差夠大，才代表「這兩個搭在一起」本身有意義。

    ⚠️ 排序用「組合效果」而不是「交互作用」，這一點是實測後改的。

    真交互作用存在時，它的**互補格**殘差也會變大 —— 例如真訊號是
    「格紋＋拉鍊 +14pt」，加法模型會過度低估「素色＋鈕釦」，
    於是後者的交互作用算出 +7.27，比真訊號的 +2.55 還大。
    那是數學必然，不是錯誤，但拿它排序會把「素色配鈕釦」推到第一名 ——
    一條沒有任何行動意義的結論。設計師要的是「哪一組真的賣得好」，
    所以用組合效果排序，交互作用留作判讀欄位。
    """
    single = stratified_lift(df, features, metric=metric, strata=strata)
    if single.empty:
        return pd.DataFrame()
    solo = {(r["特徵"], r["特徵值"]): r["平均差異pt"] for _, r in single.iterrows()}

    df = df[df[metric].notna()].copy()
    strata = [s for s in strata if s in df.columns] or ["_all"]
    if strata == ["_all"]:
        df["_all"] = "全部"

    rows: list[dict[str, Any]] = []
    feats = list(features)
    for i, fa in enumerate(feats):
        for fb in feats[i + 1:]:
            if fa not in df.columns or fb not in df.columns:
                continue
            for (va, vb), sub in df.groupby([fa, fb], dropna=True):
                if len(sub) < min_n:
                    continue
                diffs, weights = [], []
                for key, g in df.groupby(list(strata), dropna=True):
                    inside = g[(g[fa] == va) & (g[fb] == vb)]
                    outside = g[~((g[fa] == va) & (g[fb] == vb))]
                    if len(inside) < 3 or len(outside) < MIN_PER_CELL:
                        continue
                    diffs.append(float(inside[metric].mean() - outside[metric].mean()))
                    weights.append(len(inside))
                if len(diffs) < 2:
                    continue
                d, w = np.array(diffs), np.array(weights, dtype=float)
                combo = float((d * w).sum() / w.sum()) * 100
                expected = solo.get((fa, va), 0.0) + solo.get((fb, vb), 0.0)
                rows.append({
                    "特徵A": fa, "值A": va, "特徵B": fb, "值B": vb,
                    "組合效果pt": round(combo, 2),
                    "各自加總pt": round(expected, 2),
                    "交互作用pt": round(combo - expected, 2),
                    "n": len(sub), "同向層數": int((np.sign(d) == np.sign(combo)).sum()),
                    "層數": len(d), "證據強度": _evidence(len(sub)),
                })
    out = pd.DataFrame(rows)
    if out.empty:
        return out
    return out.sort_values("組合效果pt", ascending=False).head(top).reset_index(drop=True)


def bestseller_fingerprint(df: pd.DataFrame, features: Sequence[str] | None = None, *,
                           metric: str = "sell_through_rate",
                           strata: Sequence[str] = DEFAULT_STRATA,
                           top_q: float = 0.75, bottom_q: float = 0.25) -> pd.DataFrame:
    """暢銷群 vs 滯銷群的特徵分布差異 —— 在同一分層內取分位數。

    與 stratified_lift 的差別：這裡問的是「賣得最好的那批長什麼樣」，
    適合做成設計簡報；lift 問的是「這個特徵值得不值得做」，適合做決策。
    兩者互補，方向不一致時特別值得追 —— 那通常代表分布是雙峰的。
    """
    df = df[df[metric].notna()].copy()
    if df.empty:
        return pd.DataFrame()
    features = list(features) if features is not None else candidate_features(df)
    strata = [s for s in strata if s in df.columns]

    if strata:
        hi_mask = df.groupby(list(strata))[metric].transform(lambda s: s >= s.quantile(top_q))
        lo_mask = df.groupby(list(strata))[metric].transform(lambda s: s <= s.quantile(bottom_q))
    else:
        hi_mask = df[metric] >= df[metric].quantile(top_q)
        lo_mask = df[metric] <= df[metric].quantile(bottom_q)
    hi, lo = df[hi_mask.astype(bool)], df[lo_mask.astype(bool)]
    if hi.empty or lo.empty:
        return pd.DataFrame()

    rows = []
    for feat in features:
        if feat not in df.columns:
            continue
        ph = hi[feat].value_counts(normalize=True)
        pl = lo[feat].value_counts(normalize=True)
        for value in set(ph.index) | set(pl.index):
            a, b = float(ph.get(value, 0)), float(pl.get(value, 0))
            n_hi = int((hi[feat] == value).sum())
            if n_hi < 4:
                continue
            rows.append({
                "特徵": feat, "特徵值": value,
                "暢銷群佔比": round(a, 3), "滯銷群佔比": round(b, 3),
                # 加 1% 平滑：某個值在滯銷群完全沒出現時，比值會變成無限大
                "倍數": round((a + 0.01) / (b + 0.01), 2),
                "暢銷群款數": n_hi, "證據強度": _evidence(n_hi),
            })
    out = pd.DataFrame(rows)
    if out.empty:
        return out
    return out.sort_values("倍數", ascending=False).reset_index(drop=True)


def season_blueprint(df: pd.DataFrame, findings: pd.DataFrame, term_code: str, *,
                     metric: str = "sell_through_rate", top: int = 12) -> pd.DataFrame:
    """給某一個季別的設計方向：該季歷史上什麼特徵有效、目前做得夠不夠。

    「做得夠不夠」比「有沒有效」更能驅動行動：一個有效但已經佔了七成的
    特徵，再加碼的空間有限；有效但只佔一成的，才是可以擴張的方向。
    """
    if df.empty or findings.empty:
        return pd.DataFrame()
    season = df[df.get("season_term_code").astype(str) == str(term_code)] \
        if "season_term_code" in df.columns else df
    if season.empty:
        return pd.DataFrame()

    rows = []
    for _, f in findings.iterrows():
        feat, value = f["特徵"], f["特徵值"]
        if feat not in season.columns:
            continue
        sub = season[season[feat] == value]
        if sub.empty:
            continue
        share = len(sub) / len(season)
        rows.append({
            "特徵": feat, "特徵值": value, "方向": f["方向"],
            "平均差異pt": f["平均差異pt"],
            "本季佔比": round(share, 3),
            "本季款數": len(sub),
            "本季完銷": round(float(sub[metric].mean()), 3),
            "建議": ("加碼" if f["平均差異pt"] > 0 and share < 0.25 else
                     "維持" if f["平均差異pt"] > 0 else
                     "縮減" if share > 0.15 else "少量試"),
            "一致率": f["一致率"], "證據強度": f["證據強度"],
        })
    out = pd.DataFrame(rows)
    if out.empty:
        return out
    order = {"加碼": 0, "縮減": 1, "維持": 2, "少量試": 3}
    return (out.assign(_o=out["建議"].map(order))
            .sort_values(["_o", "平均差異pt"], ascending=[True, False])
            .drop(columns="_o").head(top).reset_index(drop=True))
