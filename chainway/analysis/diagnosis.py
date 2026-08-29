"""★ 診斷引擎：把「資料算出來的績效」和「你填進去的市場理由」對撞。

為什麼需要這一層？
    純數據只能告訴你「這款賣不好」，不能告訴你「為什麼」。
    而業務的口頭回饋沒有量化基礎，容易被個案印象帶偏。
    兩邊交叉之後才能分出三種完全不同的處置：

      假滯銷 → 不是設計問題（缺貨、陳列、鋪貨錯門市）→ 別改設計，改營運
      真滯銷 → 設計/版型/價格問題 → 具體要改哪裡，這裡會指出來
      虛胖暢銷 → 靠折扣或有品質風險的暢銷 → 追單前先擋下來

    最後一項 attribution_by_tag() 是這整套系統最有價值的輸出：
    它把「人填的理由標籤」和「CLIP 標的設計特徵」交叉，
    回答「客人抱怨開領太大的款，是不是集中在某幾種領型？」
    —— 這就從個案抱怨升級成可以改進設計規則的系統性知識。
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..config import Config, get_config

DATA_TO_FB = {"STAR": "STAR", "CORE": "OK", "STEADY": "OK", "SLOW": "SLOW"}


def _clean_str(value: object) -> str:
    """把可能是 NaN / None / pd.NA 的欄位安全地轉成大寫字串。

    直接寫 `str(x or "")` 會踩到 float('nan') 是 truthy 的坑，
    結果得到字串 "NAN"，讓空值被當成有效值處理。
    """
    if value is None or (isinstance(value, float) and pd.isna(value)) or value is pd.NA:
        return ""
    s = str(value).strip()
    return "" if s.lower() in ("nan", "none", "<na>") else s.upper()


def diagnose(master: pd.DataFrame, cfg: Config | None = None) -> pd.DataFrame:
    """逐款診斷。輸出可直接當作設計檢討會議的議程。"""
    cfg = cfg or get_config()
    rules = cfg.feedback_tags.get("consistency_rules", [])
    action_zh = {a["code"]: a["zh"] for a in cfg.feedback_tags.get("actions", [])}

    df = master.copy()
    df["fb_tag_list"] = df.get("fb_tags", pd.Series("", index=df.index)).fillna("").apply(
        lambda s: [t for t in str(s).split("|") if t]
    )

    rows: list[dict] = []
    for _, r in df.iterrows():
        band = r.get("perf_band", "EXCLUDED")
        tags = r["fb_tag_list"]
        # 注意：NaN 在 Python 是 truthy，用 `or ""` 會得到字串 "nan"，
        # 會讓「沒有回饋」被誤判成「回饋與資料衝突」。一定要顯式判空值。
        fb_verdict = _clean_str(r.get("fb_verdict"))

        matched_rule = None
        for rule in rules:
            if rule.get("verdict_data") != band:
                continue
            if set(rule.get("tag_any", [])) & set(tags):
                matched_rule = rule
                break

        # 資料判定 vs 人工判定 是否一致
        expected = DATA_TO_FB.get(band)
        if not fb_verdict:
            agreement = "NO_FEEDBACK"
        elif fb_verdict == "MIXED":
            agreement = "MIXED"
        elif expected == fb_verdict:
            agreement = "AGREE"
        else:
            agreement = "CONFLICT"

        if matched_rule:
            conclusion = matched_rule["conclusion"]
            action = matched_rule.get("action", "A_WATCH")
            priority = "HIGH"
        elif agreement == "CONFLICT":
            conclusion = f"資料判定為「{band}」但現場回饋為「{fb_verdict}」，需人工釐清"
            action = "A_WATCH"
            priority = "HIGH"
        elif agreement == "NO_FEEDBACK" and band in ("SLOW", "STAR"):
            conclusion = "缺市場回饋 —— 這款的成敗原因目前無法歸因，請補填回饋表"
            action = "A_WATCH"
            priority = "MEDIUM"
        elif band == "STAR":
            conclusion = "暢銷且回饋一致，可安心延續"
            action = "A_CARRYOVER"
            priority = "LOW"
        elif band == "SLOW":
            conclusion = "滯銷且回饋一致，依主要歸因面向處理"
            action = _action_from_groups(tags, cfg)
            priority = "MEDIUM"
        else:
            conclusion = "表現符合預期"
            action = "A_WATCH"
            priority = "LOW"

        # 人工填的 suggested_action 一律優先於系統推論
        manual = _clean_str(r.get("suggested_action"))
        if manual:
            action = manual

        groups = sorted({cfg.reason_tag_group(t) for t in tags})
        rows.append({
            "sku": r.get("sku"),
            "product_name": r.get("product_name"),
            "season": r.get("season"),
            "category": r.get("category"),
            "category_zh": cfg.category_label(str(r.get("category"))),
            "image_path": r.get("image_path"),
            "perf_band": band,
            "perf_band_zh": r.get("perf_band_zh"),
            "sell_through_rate": r.get("sell_through_rate"),
            "gross_margin": r.get("gross_margin"),
            "discount_depth": r.get("discount_depth"),
            "fb_n": r.get("fb_n"),
            "fb_verdict": fb_verdict,
            "fb_tags_zh": "、".join(cfg.reason_tag_label(t) for t in tags),
            "fb_groups": "|".join(groups),
            "fb_texts": r.get("fb_texts"),
            "agreement": agreement,
            "diagnosis": conclusion,
            "action_code": action,
            "action_zh": action_zh.get(action, action),
            "priority": priority,
            "rule_hit": matched_rule["rule"] if matched_rule else "",
        })

    out = pd.DataFrame(rows)
    order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    return out.sort_values(
        ["priority", "perf_band"], key=lambda s: s.map(order).fillna(9) if s.name == "priority" else s
    ).reset_index(drop=True)


def _action_from_groups(tags: list[str], cfg: Config) -> str:
    """沒命中規則時，依理由標籤所屬群組推一個合理的行動。"""
    groups = [cfg.reason_tag_group(t) for t in tags]
    if not groups:
        return "A_WATCH"
    dominant = pd.Series(groups).value_counts().idxmax()
    return {
        "FIT": "A_REVISE_FIT",
        "PRODUCT": "A_REVISE_FABRIC",
        "PRICE": "A_REPRICE",
        "SUPPLY": "A_REORDER",
        "CHANNEL": "A_RE_MERCH",
        "MARKET": "A_WATCH",
    }.get(dominant, "A_WATCH")


def attribution_by_tag(master: pd.DataFrame, cfg: Config | None = None, min_n: int = 4) -> pd.DataFrame:
    """★ 把「人填的理由」和「CLIP 標的設計特徵」交叉。

    輸出可讀成：「被標為 F_NECK_OPEN（開領太大）的款，有 78% 都是一字領，
    而一字領只佔全體 12% → 一字領的開領規格需要全面檢討」。
    這是把零散的門市抱怨，變成可以寫進設計規範的證據。
    """
    cfg = cfg or get_config()
    df = master.copy()
    df["fb_tag_list"] = df.get("fb_tags", pd.Series("", index=df.index)).fillna("").apply(
        lambda s: [t for t in str(s).split("|") if t]
    )
    tagged = df[df["fb_tag_list"].str.len() > 0]
    if tagged.empty:
        return pd.DataFrame()

    attrs = [a for a in cfg.taxonomy.get("attributes", {}) if a in df.columns]
    rows: list[dict] = []

    all_tags = sorted({t for lst in tagged["fb_tag_list"] for t in lst})
    for tag in all_tags:
        sel = tagged[tagged["fb_tag_list"].apply(lambda lst: tag in lst)]
        if len(sel) < min_n:
            continue
        for attr in attrs:
            base = df[~df[attr].isin(["n/a", "uncertain"]) & df[attr].notna()]
            sub = sel[~sel[attr].isin(["n/a", "uncertain"]) & sel[attr].notna()]
            if len(sub) < min_n or base.empty:
                continue
            counts = sub[attr].value_counts(normalize=True)
            baseline = base[attr].value_counts(normalize=True)
            for option, share in counts.head(3).items():
                base_share = float(baseline.get(option, 0))
                if base_share <= 0:
                    continue
                lift = share / base_share
                if lift < 1.5 or share < 0.3:
                    continue
                rows.append({
                    "reason_tag": tag,
                    "reason_zh": cfg.reason_tag_label(tag),
                    "reason_group": cfg.reason_tag_group(tag),
                    "n_tagged": len(sub),
                    "attribute": attr,
                    "attribute_zh": cfg.attribute_label(attr),
                    "option": option,
                    "option_zh": cfg.option_label(attr, str(option)),
                    "share_in_tagged": round(float(share), 3),
                    "share_overall": round(base_share, 3),
                    "concentration_lift": round(float(lift), 2),
                    "insight_zh": (
                        f"被標記「{cfg.reason_tag_label(tag)}」的款有 {share:.0%} 是"
                        f"{cfg.attribute_label(attr)}＝{cfg.option_label(attr, str(option))}，"
                        f"而全體只有 {base_share:.0%}（集中度 {lift:.1f}×）"
                    ),
                })
    out = pd.DataFrame(rows)
    return out.sort_values("concentration_lift", ascending=False).reset_index(drop=True) if not out.empty else out


def coverage_gap(master: pd.DataFrame, cfg: Config | None = None) -> pd.DataFrame:
    """哪些款「最需要」補市場回饋 —— 幫你把有限的市調人力用在刀口上。

    優先順序：極端績效（暢銷/滯銷）× 進貨量大 × 目前沒有任何回饋。
    """
    cfg = cfg or get_config()
    df = master.copy()
    has_fb = df.get("fb_n", pd.Series(np.nan, index=df.index)).notna()
    extreme = df.get("perf_band", pd.Series("", index=df.index)).isin(["STAR", "SLOW"])
    need = df[extreme & ~has_fb].copy()
    if need.empty:
        return need

    need["impact"] = (
        need.get("stock_in", pd.Series(0, index=need.index)).fillna(0).rank(pct=True) * 0.6
        + need.get("sales_amount", pd.Series(0, index=need.index)).fillna(0).rank(pct=True) * 0.4
    ).round(3)
    cols = [c for c in ["sku", "product_name", "season", "category", "perf_band_zh",
                        "stock_in", "net_sales_qty", "sell_through_rate", "impact", "image_path"]
            if c in need.columns]
    return need.sort_values("impact", ascending=False)[cols].reset_index(drop=True)


def summary_stats(diag: pd.DataFrame) -> dict[str, object]:
    """診斷結果的一句話摘要，給報告首頁與網頁儀表板用。"""
    if diag.empty:
        return {}
    n = len(diag)
    return {
        "total": n,
        "with_feedback": int((diag["agreement"] != "NO_FEEDBACK").sum()),
        "feedback_coverage": round(float((diag["agreement"] != "NO_FEEDBACK").mean()), 3),
        "conflicts": int((diag["agreement"] == "CONFLICT").sum()),
        "false_slow": int(diag["diagnosis"].str.startswith("假滯銷").sum()),
        "true_slow": int(diag["diagnosis"].str.startswith("真滯銷").sum()),
        "high_priority": int((diag["priority"] == "HIGH").sum()),
        "top_actions": diag["action_zh"].value_counts().head(5).to_dict(),
    }
