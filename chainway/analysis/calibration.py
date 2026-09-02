"""專櫃判斷的校準：他們當時說的，後來對了嗎。

## 為什麼要做這件事

專櫃的回饋如果只是拿來讀，那它就只是意見。要能拿來當**早期訊號**用
—— 商品才上架三週，還來得及追單或止血 —— 就得先知道：這個人講的話，
過去準不準。

準不準有兩層，而且兩層都要看：

    答對率    他判暢銷的款，後來真的暢銷了嗎
    校準      他說「很有把握」的時候，是不是真的比較準

第二層才是關鍵。一個人答對率七成、而且高把握時九成、低把握時四成，
他的把握程度是有資訊的 —— 下一季他說「很有把握這款會爆」，值得聽。
另一個人同樣七成，但高把握與低把握都是七成，那他的把握程度是雜訊，
只看他的判定就好。

## 用 Brier 分數，不用單純的答對率

答對率把「很有把握卻說錯」和「不太確定而說錯」算成一樣，但這兩件事
對決策的傷害差很多。Brier 分數是「把握程度換算成機率之後，與實際結果
的平方差」，說得越滿、錯得越離譜，罰得越重。分數越低越好，0 是完美。

把握程度換算成機率的對應表（HIGH 0.85 / MEDIUM 0.65 / LOW 0.5）是
**假設**，不是量出來的。它決定了分數的絕對值，但不影響人與人之間的
排序，而排序才是這份分析要用的東西。等累積夠多資料，這張表應該
用實際答對率反推重寫。

## 「後來真的暢銷嗎」怎麼定義

用該款在同季同品類裡的售罄率分位數，不用絕對門檻 ——
秋季整季售罄 35%，用 80% 的絕對門檻會讓整季沒有一款算暢銷，
那不是專櫃看錯，是季節效應。分位數把季節效應除掉。

## 樣本太少就不給分數

一個人只填過三款，答對兩款，答對率 67% —— 這個數字沒有意義。
低於 `MIN_RESPONSES` 一律不給分數，只列出筆數。寧可說「還不知道」，
也不要給一個會被拿去開會的假數字。
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

# 把握程度 → 機率。這是假設，不是量出來的（見模組說明）。
CONFIDENCE_P: dict[str, float] = {"HIGH": 0.85, "MEDIUM": 0.65, "LOW": 0.50}

# 實際結果的分位數門檻：同季同品類裡排前 30% 算暢銷，後 30% 算滯銷。
TOP_Q = 0.70
BOTTOM_Q = 0.30

# 少於這個筆數不給分數
MIN_RESPONSES = 12


def actual_verdict(df: pd.DataFrame, *, sell_col: str = "售罄率",
                   by: tuple[str, ...] = ("季別", "品類")) -> pd.Series:
    """實際結果 → STAR / OK / SLOW，用同季同品類的分位數而不是絕對門檻。

    絕對門檻會把季節效應算到人頭上：秋季整季售罄 35%，用 80% 當暢銷門檻，
    整季沒有一款過關，於是每個在秋季說「這款會賣」的人都被判定看錯。
    那量到的是季節，不是判斷力。
    """
    out = pd.Series("OK", index=df.index, dtype=object)
    have = [c for c in by if c in df.columns]
    grp = df.groupby(have)[sell_col] if have else None
    hi = grp.transform(lambda s: s.quantile(TOP_Q)) if grp is not None \
        else df[sell_col].quantile(TOP_Q)
    lo = grp.transform(lambda s: s.quantile(BOTTOM_Q)) if grp is not None \
        else df[sell_col].quantile(BOTTOM_Q)
    out[df[sell_col] >= hi] = "STAR"
    out[df[sell_col] <= lo] = "SLOW"
    return out


def score(feedback: pd.DataFrame, outcome: pd.DataFrame, *,
          sku_col: str = "sku", sell_col: str = "售罄率") -> pd.DataFrame:
    """把回饋與實際結果對起來，逐筆判斷答對沒有。

    `feedback` 要有 sku / verdict / confidence / respondent；
    `outcome` 要有 sku 與售罄率，最好還有季別與品類（用來算分位數）。
    """
    o = outcome.copy()
    o["實際"] = actual_verdict(o, sell_col=sell_col)
    m = feedback.merge(o, left_on=sku_col, right_on=sku_col,
                       how="inner", suffixes=("", "_o"))
    if m.empty:
        return m

    # MIXED（兩極）不計分：它說的是「有些門市好有些差」，
    # 而實際結果是全公司彙總的一個數字，兩者不是同一件事。
    m = m[m["verdict"].isin(["STAR", "OK", "SLOW"])].copy()
    m["答對"] = (m["verdict"] == m["實際"])
    # 方向錯（說暢銷結果滯銷，或反過來）比說錯成普通嚴重得多，另外記
    m["方向相反"] = (((m["verdict"] == "STAR") & (m["實際"] == "SLOW")) |
                     ((m["verdict"] == "SLOW") & (m["實際"] == "STAR")))
    m["宣稱機率"] = m["confidence"].map(CONFIDENCE_P).fillna(CONFIDENCE_P["MEDIUM"])
    m["brier"] = (m["宣稱機率"] - m["答對"].astype(float)) ** 2
    return m


def by_respondent(scored: pd.DataFrame, *,
                  min_n: int = MIN_RESPONSES) -> pd.DataFrame:
    """每個人一列：答對率、Brier、以及高把握時是不是真的比較準。"""
    if scored.empty:
        return pd.DataFrame()
    rows = []
    for who, g in scored.groupby("respondent"):
        hi = g[g["confidence"] == "HIGH"]
        lo = g[g["confidence"].isin(["LOW", "MEDIUM"])]
        enough = len(g) >= min_n
        rows.append({
            "填表人": who,
            "筆數": len(g),
            "答對率": g["答對"].mean() if enough else np.nan,
            "Brier": g["brier"].mean() if enough else np.nan,
            "方向相反": int(g["方向相反"].sum()),
            "高把握筆數": len(hi),
            "高把握答對率": hi["答對"].mean() if len(hi) >= 5 else np.nan,
            "其餘答對率": lo["答對"].mean() if len(lo) >= 5 else np.nan,
            "把握有資訊": (hi["答對"].mean() - lo["答對"].mean()
                           if len(hi) >= 5 and len(lo) >= 5 else np.nan),
            "資料足夠": enough,
        })
    out = pd.DataFrame(rows)
    return out.sort_values(["資料足夠", "Brier"], ascending=[False, True],
                           na_position="last").reset_index(drop=True)


def by_confidence(scored: pd.DataFrame) -> pd.DataFrame:
    """整體校準表：說 HIGH 的時候實際答對幾成。

    這張表是全公司層級的，用來看整體有沒有系統性的過度自信。
    宣稱機率遠高於實際答對率，就是全體偏樂觀，那要調的是填表的引導語，
    不是罵某個人。
    """
    if scored.empty:
        return pd.DataFrame()
    g = (scored.groupby("confidence")
                .agg(筆數=("答對", "size"), 實際答對率=("答對", "mean"),
                     方向相反=("方向相反", "sum"))
                .reset_index())
    g["宣稱機率"] = g["confidence"].map(CONFIDENCE_P)
    g["過度自信"] = g["宣稱機率"] - g["實際答對率"]
    order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    return g.sort_values("confidence", key=lambda s: s.map(order)).reset_index(drop=True)


def by_tag(scored: pd.DataFrame, *, min_n: int = 8) -> pd.DataFrame:
    """哪些理由標籤事後被證實。

    「說滯銷是因為定價偏高」如果事後多半成立，那這個標籤就可以拿來
    當設計決策的依據；如果不成立，那它只是店員最順口的解釋。
    """
    if scored.empty or "reason_tags" not in scored.columns:
        return pd.DataFrame()
    rows = []
    exploded = scored.assign(
        tag=scored["reason_tags"].fillna("").str.replace(",", "|").str.split("|"))
    exploded = exploded.explode("tag")
    exploded["tag"] = exploded["tag"].str.strip().str.upper()
    exploded = exploded[exploded["tag"].ne("")]
    for tag, g in exploded.groupby("tag"):
        if len(g) < min_n:
            continue
        rows.append({"理由標籤": tag, "筆數": len(g),
                     "事後成立比例": g["答對"].mean()})
    if not rows:
        return pd.DataFrame()
    return (pd.DataFrame(rows).sort_values("事後成立比例", ascending=False)
            .reset_index(drop=True))


def summary(scored: pd.DataFrame) -> dict[str, Any]:
    if scored.empty:
        return {"可評分": False,
                "說明": "沒有任何一筆回饋對得上實際銷售結果"}
    return {
        "可評分": True,
        "筆數": int(len(scored)),
        "人數": int(scored["respondent"].nunique()),
        "款數": int(scored["sku"].nunique()),
        "整體答對率": float(scored["答對"].mean()),
        "整體Brier": float(scored["brier"].mean()),
        "方向相反": int(scored["方向相反"].sum()),
        # 全部猜 OK 的基準線。答對率贏不過這條線，代表這批回饋
        # 目前還沒有比「什麼都不填」多出資訊。
        "全猜普通的答對率": float((scored["實際"] == "OK").mean()),
    }
