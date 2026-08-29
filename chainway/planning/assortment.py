"""商品系列企劃：把分析結論變成「這一週要開哪 10–15 款」的具體清單。

這一支是整個系統對設計師工作量最直接的減負：
    輸入：年度款數目標、波段、歷史績效與特徵關聯
    輸出：每週的新品開發清單（含建議特徵組合）＋ 庫存調用清單 ＋ 成套搭接邏輯

演算法不是黑盒：每一款的建議特徵都來自 correlation.py 找出的高提升度選項，
並且會標明「這個建議根據幾款歷史資料、提升度多少」，設計師可以自己判斷要不要採用。
系統負責把 450 款的骨架排出來，人負責做最後的美感決策 —— 這才是合理的分工。
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..config import Config, get_config

# 品類在一個系列裡的典型結構比重（可依貴司實際調整）
DEFAULT_MIX = {
    "TOP": 0.38,
    "BOTTOM_SKIRT": 0.16,
    "BOTTOM_PANTS": 0.16,
    "OUTER": 0.16,
    "DRESS": 0.10,
    "ACC": 0.04,
}


def winning_recipe(assoc: pd.DataFrame, category: str, cfg: Config | None = None,
                   top_per_attr: int = 2) -> pd.DataFrame:
    """某品類的「勝率配方」：每個屬性維度提升度最高的選項。"""
    cfg = cfg or get_config()
    cols = ["attribute", "attribute_zh", "option", "option_zh", "n", "lift", "success_rate", "q_value"]
    if assoc.empty:
        return pd.DataFrame(columns=cols)
    sel = assoc[(assoc["category"] == category) & assoc["significant"] & (assoc["lift"] > 1)]
    if sel.empty:   # 沒有達顯著的，退而求其次看提升度為正的（報告會標明證據較弱）
        sel = assoc[(assoc["category"] == category) & (assoc["lift"] > 1)]
    if sel.empty:
        return pd.DataFrame(columns=cols)
    return (sel.sort_values("lift", ascending=False)
               .groupby("attribute").head(top_per_attr)
               .sort_values(["attribute", "lift"], ascending=[True, False])
               [cols].reset_index(drop=True))


RISK_COLUMNS = ["attribute_zh", "option_zh", "n", "lift", "success_rate"]


def risk_list(assoc: pd.DataFrame, category: str, cfg: Config | None = None) -> pd.DataFrame:
    """該避開的特徵：顯著且提升度明顯低於 1 的選項。

    沒有歷史資料時回傳「有欄位的空表」而不是完全空的 DataFrame —— 呼叫端
    才能無條件取欄位，不必到處寫 if empty。
    """
    if assoc.empty:
        return pd.DataFrame(columns=RISK_COLUMNS)
    sel = assoc[(assoc["category"] == category) & assoc["significant"] & (assoc["lift"] < 0.8)]
    if sel.empty:
        return pd.DataFrame(columns=RISK_COLUMNS)
    return sel.sort_values("lift")[RISK_COLUMNS].reset_index(drop=True)


def carryover_candidates(master: pd.DataFrame, top_n: int = 60) -> pd.DataFrame:
    """15 年庫存中值得再拿出來賣的款：歷史績效好、且不是靠折扣。"""
    pool = master[master.get("perf_band", "").isin(["STAR", "CORE"])].copy()
    if pool.empty:
        return pool
    pool["carryover_score"] = (
        pool["sell_through_rate"].rank(pct=True).fillna(0) * 0.5
        + pool.get("gross_margin", pd.Series(0, index=pool.index)).rank(pct=True).fillna(0) * 0.3
        - pool.get("discount_depth", pd.Series(0, index=pool.index)).rank(pct=True).fillna(0) * 0.2
    ).round(3)
    # 同款只留最好的一季
    pool = pool.sort_values("carryover_score", ascending=False).drop_duplicates("style_code", keep="first")
    cols = [c for c in ["sku", "style_code", "product_name", "season", "category", "category_zh",
                        "list_price", "sell_through_rate", "gross_margin", "carryover_score",
                        "image_path"] if c in pool.columns]
    return pool.head(top_n)[cols].reset_index(drop=True)


def plan_year(
    assoc: pd.DataFrame,
    master: pd.DataFrame,
    cfg: Config | None = None,
    mix: dict[str, float] | None = None,
) -> pd.DataFrame:
    """年度波段規劃：每個波段各品類要開幾款、新舊比例。"""
    cfg = cfg or get_config()
    pcfg = cfg.get("planning", {})
    total = pcfg.get("styles_per_year", 450)
    new_ratio = pcfg.get("new_ratio", 0.65)
    waves = pcfg.get("waves", [])
    mix = mix or DEFAULT_MIX

    # 用歷史各波段的銷售金額佔比決定波段權重；沒資料就均分
    weights = {w["code"]: 1 / len(waves) for w in waves}
    rows = []
    for wave in waves:
        wave_total = round(total * weights[wave["code"]])
        for cat, share in mix.items():
            n_cat = round(wave_total * share)
            if n_cat <= 0:
                continue
            rows.append({
                "wave_code": wave["code"],
                "wave_zh": wave["name"],
                "weeks": wave["weeks"],
                "category": cat,
                "category_zh": cfg.category_label(cat),
                "total_styles": n_cat,
                "new_styles": round(n_cat * new_ratio),
                "carryover_styles": n_cat - round(n_cat * new_ratio),
            })
    return pd.DataFrame(rows)


def plan_week(
    week_no: int,
    wave_code: str,
    assoc: pd.DataFrame,
    master: pd.DataFrame,
    cfg: Config | None = None,
    n_styles: int | None = None,
) -> dict[str, pd.DataFrame]:
    """單週 10–15 款的具體企劃。

    回傳三張表：
      new_styles  新品開發清單（含建議特徵配方）
      carryover   庫存調用清單
      outfits     上下身成套搭接建議
    """
    cfg = cfg or get_config()
    pcfg = cfg.get("planning", {})
    lo, hi = pcfg.get("styles_per_week_min", 10), pcfg.get("styles_per_week_max", 15)
    n = n_styles or int(np.clip((lo + hi) / 2, lo, hi))
    new_n = round(n * pcfg.get("new_ratio", 0.65))

    # 依 mix 分配當週各品類款數
    alloc: list[str] = []
    for cat, share in DEFAULT_MIX.items():
        alloc += [cat] * max(0, round(new_n * share))
    alloc = (alloc + ["TOP"] * new_n)[:new_n]

    new_rows = []
    variant_seq: dict[str, int] = {}
    for i, cat in enumerate(alloc, start=1):
        # 同品類開多款時要給不同方向，否則會排出一模一樣的 3 件上衣。
        # 作法：每個屬性維度取前 3 名選項，同品類第 k 款就往下取第 k 個。
        variant = variant_seq.get(cat, 0)
        variant_seq[cat] = variant + 1
        recipe_pool = winning_recipe(assoc, cat, cfg, top_per_attr=3)
        recipe = (recipe_pool.groupby("attribute", group_keys=False)
                  .apply(lambda g: g.iloc[[min(variant, len(g) - 1)]])
                  .reset_index(drop=True)) if not recipe_pool.empty else recipe_pool

        desc_parts = [f"{r['attribute_zh']}：{r['option_zh']}" for _, r in recipe.iterrows()]
        evidence = "；".join(
            f"{r['option_zh']}(+{(r['lift'] - 1) * 100:.0f}%, n={r['n']})" for _, r in recipe.head(4).iterrows()
        )
        new_rows.append({
            "week": f"W{week_no:02d}",
            "wave": wave_code,
            "seq": i,
            "category": cat,
            "category_zh": cfg.category_label(cat),
            "suggested_design": " ／ ".join(desc_parts) if desc_parts else "（歷史資料不足，由設計師自由發揮）",
            "evidence": evidence,
            "avoid": "、".join(risk_list(assoc, cat, cfg).head(3)["option_zh"].tolist()),
            "status": "待設計",
        })
    new_df = pd.DataFrame(new_rows)

    carry = carryover_candidates(master, top_n=200)
    carry_n = n - new_n
    carry_df = carry.head(carry_n).assign(week=f"W{week_no:02d}", wave=wave_code) if not carry.empty else pd.DataFrame()

    outfits = build_outfits(new_df, carry_df, cfg)
    return {"new_styles": new_df, "carryover": carry_df, "outfits": outfits}


def build_outfits(new_df: pd.DataFrame, carry_df: pd.DataFrame, cfg: Config | None = None) -> pd.DataFrame:
    """成套搭接：確保每 1 款下身能被 2.5 款上衣搭到，且新舊混搭。"""
    cfg = cfg or get_config()
    ratio = cfg.get("planning", {}).get("tops_per_bottom", 2.5)

    def pick(df: pd.DataFrame, cats: list[str], label: str) -> list[dict]:
        if df.empty or "category" not in df.columns:
            return []
        sub = df[df["category"].isin(cats)]
        col = "sku" if "sku" in sub.columns else "seq"
        return [{"id": str(r[col]), "cat": r["category"], "src": label} for _, r in sub.iterrows()]

    tops = pick(new_df, ["TOP", "OUTER"], "新品") + pick(carry_df, ["TOP", "OUTER"], "庫存")
    bottoms = pick(new_df, ["BOTTOM_SKIRT", "BOTTOM_PANTS"], "新品") + pick(carry_df, ["BOTTOM_SKIRT", "BOTTOM_PANTS"], "庫存")

    rows = []
    if not bottoms:
        return pd.DataFrame()
    for bi, bottom in enumerate(bottoms):
        for k in range(int(round(ratio))):
            if not tops:
                break
            top = tops[(bi * int(round(ratio)) + k) % len(tops)]
            rows.append({
                "look_id": f"L{len(rows) + 1:02d}",
                "top": f"{top['id']}({top['src']})",
                "bottom": f"{bottom['id']}({bottom['src']})",
                "mix": f"{top['src']}×{bottom['src']}",
                "silhouette_note": _silhouette_note(top["cat"], bottom["cat"]),
                "scene": "學院通勤 / 雅致日常",
            })
    return pd.DataFrame(rows)


def _silhouette_note(top_cat: str, bottom_cat: str) -> str:
    if bottom_cat == "BOTTOM_SKIRT":
        return "上身收、下身放（A/X 型）：短版上衣 + 傘狀裙擺，維持高腰比"
    if bottom_cat == "BOTTOM_PANTS":
        return "上身放、下身收（H/V 型）：落肩上衣 + 直筒或錐形褲，避免上下皆寬"
    return "維持上下身鬆緊對比，不要同時寬鬆"


def to_markdown(week_plan: dict[str, pd.DataFrame], week_no: int, wave_zh: str) -> str:
    """輸出成可以直接貼進會議紀錄的 Markdown 表格。"""
    new_df, carry_df, outfits = week_plan["new_styles"], week_plan["carryover"], week_plan["outfits"]
    lines = [f"## W{week_no:02d}（{wave_zh}）商品企劃", ""]

    lines += ["### 一、新品開發款式", "", "| # | 品類 | 建議設計方向 | 數據依據 | 應避開 |", "|---|---|---|---|---|"]
    for _, r in new_df.iterrows():
        lines.append(f"| {r['seq']} | {r['category_zh']} | {r['suggested_design']} | {r['evidence'] or '—'} | {r['avoid'] or '—'} |")

    lines += ["", "### 二、庫存調用款式", "", "| 貨號 | 品名 | 品類 | 定價 | 歷史售罄率 |", "|---|---|---|---|---|"]
    if not carry_df.empty:
        for _, r in carry_df.iterrows():
            st = f"{r['sell_through_rate']:.0%}" if pd.notna(r.get("sell_through_rate")) else "—"
            lines.append(f"| {r.get('sku','')} | {r.get('product_name','')} | {r.get('category_zh','')} | {r.get('list_price','')} | {st} |")
    else:
        lines.append("| — | 尚無庫存資料 | | | |")

    lines += ["", "### 三、上下身成套搭接", "", "| Look | 上身 | 下身 | 新舊配比 | 廓形邏輯 |", "|---|---|---|---|---|"]
    if not outfits.empty:
        for _, r in outfits.iterrows():
            lines.append(f"| {r['look_id']} | {r['top']} | {r['bottom']} | {r['mix']} | {r['silhouette_note']} |")
    else:
        lines.append("| — | 下身款數不足，無法組套 | | | |")

    return "\n".join(lines)
