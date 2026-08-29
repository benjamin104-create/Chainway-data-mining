"""Zero-shot 設計屬性標註：用 Fashion-CLIP 把每張系統圖打上 taxonomy 的標籤。

作法：對每個屬性維度（例如「領型」），把該維度的所有選項 prompt 轉成文字向量，
和影像向量算相似度，取 softmax 後選最高分的那一個，同時保留信心值。

信心值很重要 —— 低於門檻的標註不該拿去跑統計，否則你會得到「看起來很顯著、
其實是模型在猜」的假結論。confidence 欄位會一路帶到分析與報告。
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..config import Config, get_config
from .fashion_clip import embed_texts

# 屬性判定的最低信心（softmax 機率）；低於此值標為 uncertain
MIN_CONFIDENCE = 0.28
# 第一名與第二名的差距；太接近代表模型分不出來
MIN_MARGIN = 0.05


def classify_category(vecs: np.ndarray, cfg: Config | None = None) -> pd.DataFrame:
    """先判品類（上衣/褲子/裙子…），因為不同品類要問的問題不一樣。"""
    cfg = cfg or get_config()
    cats = cfg.taxonomy.get("categories", {})
    codes, prompts = [], []
    for code, entry in cats.items():
        for kw in entry.get("keywords", []):
            codes.append(code)
            prompts.append(f"a product photo of {kw}")

    text_vecs = embed_texts(prompts, cfg)
    sims = vecs @ text_vecs.T  # (n_img, n_prompt)

    # 同一品類有多個關鍵字，取該品類最高分
    code_arr = np.array(codes)
    uniq = list(dict.fromkeys(codes))
    scores = np.stack([sims[:, code_arr == c].max(axis=1) for c in uniq], axis=1)
    probs = _softmax(scores * 100)

    best = probs.argmax(axis=1)
    return pd.DataFrame({
        "category_pred": [uniq[i] for i in best],
        "category_conf": probs.max(axis=1).round(4),
    })


def _softmax(x: np.ndarray) -> np.ndarray:
    x = x - x.max(axis=1, keepdims=True)
    e = np.exp(x)
    return e / e.sum(axis=1, keepdims=True)


def classify_attribute(vecs: np.ndarray, attribute: str, cfg: Config | None = None) -> pd.DataFrame:
    """對單一屬性維度做 zero-shot 分類。"""
    cfg = cfg or get_config()
    options = cfg.attribute_options(attribute)
    if not options:
        return pd.DataFrame(index=range(len(vecs)))

    prompts = [f"a product photo of {o['prompt']}" for o in options]
    text_vecs = embed_texts(prompts, cfg)
    sims = vecs @ text_vecs.T
    probs = _softmax(sims * 100)

    order = np.argsort(-probs, axis=1)
    best = order[:, 0]
    second = order[:, 1] if probs.shape[1] > 1 else best
    top_p = probs[np.arange(len(probs)), best]
    margin = top_p - probs[np.arange(len(probs)), second]

    codes = [options[i]["code"] for i in best]
    uncertain = (top_p < MIN_CONFIDENCE) | (margin < MIN_MARGIN)
    codes = ["uncertain" if u else c for c, u in zip(codes, uncertain)]

    return pd.DataFrame({
        attribute: codes,
        f"{attribute}__conf": top_p.round(4),
        f"{attribute}__margin": margin.round(4),
    })


def tag_all(
    meta: pd.DataFrame,
    vecs: np.ndarray,
    cfg: Config | None = None,
    category_col: str | None = None,
) -> pd.DataFrame:
    """對整批影像做完整屬性標註。

    category_col: 若 POS 已有可信的品類欄位，傳欄位名優先採用（比模型準）；
                  沒有就用 CLIP 預測的品類。
    """
    cfg = cfg or get_config()
    out = meta.reset_index(drop=True).copy()

    cat_pred = classify_category(vecs, cfg)
    out = pd.concat([out, cat_pred], axis=1)
    if category_col and category_col in out.columns:
        out["category"] = out[category_col].fillna(out["category_pred"])
        out["category_source"] = np.where(out[category_col].notna(), "POS", "CLIP")
    else:
        out["category"] = out["category_pred"]
        out["category_source"] = "CLIP"

    # 所有品類會用到的屬性聯集，一次算完再依品類遮蔽不適用的欄位
    all_attrs: list[str] = []
    for code in cfg.category_codes:
        for a in cfg.attributes_for(code):
            if a not in all_attrs:
                all_attrs.append(a)

    for attr in all_attrs:
        print(f"  屬性標註：{cfg.attribute_label(attr)} ({attr})")
        res = classify_attribute(vecs, attr, cfg)
        out = pd.concat([out, res], axis=1)

    # 遮蔽：褲子不該有「領型」，把不適用的維度設成 n/a
    for attr in all_attrs:
        applicable = out["category"].map(lambda c: attr in cfg.attributes_for(str(c)))
        out.loc[~applicable, attr] = "n/a"
        out.loc[~applicable, f"{attr}__conf"] = np.nan
        out.loc[~applicable, f"{attr}__margin"] = np.nan

    out["attr_uncertain_count"] = (out[all_attrs] == "uncertain").sum(axis=1)
    return out


def to_chinese(df: pd.DataFrame, cfg: Config | None = None) -> pd.DataFrame:
    """把屬性代碼轉成中文，供報表與網頁顯示。"""
    cfg = cfg or get_config()
    out = df.copy()
    for attr in cfg.taxonomy.get("attributes", {}):
        if attr in out.columns:
            out[f"{attr}_zh"] = out[attr].map(
                lambda v: "—" if v in ("n/a", "uncertain", None) else cfg.option_label(attr, str(v))
            )
    if "category" in out.columns:
        out["category_zh"] = out["category"].map(lambda c: cfg.category_label(str(c)))
    return out


def coverage(df: pd.DataFrame, cfg: Config | None = None) -> pd.DataFrame:
    """標註品質稽核：每個屬性有多少比例是 uncertain，平均信心多少。"""
    cfg = cfg or get_config()
    rows = []
    for attr in cfg.taxonomy.get("attributes", {}):
        if attr not in df.columns:
            continue
        applicable = df[df[attr] != "n/a"]
        if applicable.empty:
            continue
        rows.append({
            "attribute": attr,
            "attribute_zh": cfg.attribute_label(attr),
            "n_applicable": len(applicable),
            "uncertain_rate": round((applicable[attr] == "uncertain").mean(), 3),
            "mean_conf": round(applicable[f"{attr}__conf"].mean(), 3),
            "n_distinct": applicable[attr].nunique(),
        })
    return pd.DataFrame(rows).sort_values("uncertain_rate", ascending=False).reset_index(drop=True)
