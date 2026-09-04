"""看圖讀出特徵 → 比對品名 → 候選貨號。不需要影像索引。

## 為什麼有這一條路

以圖搜圖要跨過「穿在人身上、有臉有腿有背景」到「單件去背棚拍」的鴻溝，
而且要先跑完整個影像庫的向量化。這一條繞過那些：人（或模型）看圖讀出
特徵詞，直接比對品名。貴司的品名寫得極精確，這是資料裡最可靠的一欄。

## 兩條規則，都是拿一個真實錯誤換來的

使用者給了一張穿搭照，正解是 **KA1369013 蝴蝶結裝飾領口針織上衣**。
我連錯兩次，原因是兩個結構性的錯：

**一、特徵是證據，不是條件。**

照片上最顯眼的是胸前一大片剪接。我就要求品名必須含
「荷葉／領片／披領／披肩」，結果正解被**完全排除** ——
因為它的品名根本沒提那一片，只叫「蝴蝶結裝飾領口」。

品名不是完整描述。它寫的是設計師認為的賣點，不是你看得到的一切，
而且**不見得是最顯眼的那個**。所以任何「必須含有 X」的硬條件，
都會殺掉正確答案。這裡一律只加分。

看不到的東西（熊、繡花、格紋、外套、裙）出現在品名裡則**扣分**，
同樣不排除 —— 因為那些詞也可能指向配件或裡布，不是主體。

**二、排序不准看銷售。**

第一版拿售罄率當排序。那是「賣得好不好」，跟「這是不是同一件」
毫無關係。加上這條之後正解只排第 5；拿掉之後排第 2。
售罄率是**找到之後才要看的**，不是拿來找的。

修正這兩點：正解從「排除」→ 3,183 款裡第 2 名。

## 這條路答不出來的事

品名沒寫的特徵，這裡永遠找不到。要補那一塊只能靠影像比對
（`vision.grid` 的九宮格），而那需要系統圖。
"""
from __future__ import annotations

import math
from typing import Any

import pandas as pd

# 看不到卻出現在品名裡 → 扣分。權重刻意小於一個高 IDF 詞的加分，
# 因為這些詞可能指的是配件、裡布或滾邊，不是衣服主體。
NEGATIVE = ["熊", "繡", "印花", "燙鑽", "貼布", "蕾絲", "網紗", "雪紡",
            "條紋", "連帽", "外套", "背心", "洋裝", "裙", "褲", "帽"]
NEG_PENALTY = 1.6

# 已知正解。一個就夠開始 —— 它已經抓出兩個結構性錯誤。
# 每多一個，門檻就多一分依據；沒有它們，任何調整都是在猜。
TRUTH: list[dict[str, Any]] = [
    {
        "貨號": "KA1369013",
        "說明": "藏青針織上衣、羅紋圓領、胸前一大片剪接、右肩領口一個格紋蝴蝶結",
        "特徵": {"蝴蝶結": 0.95, "領口": 0.85, "針織": 0.90, "上衣": 0.70,
                 "單邊": 0.60, "肩": 0.45, "裝飾": 0.40,
                 "荷葉": 0.45, "領片": 0.45, "披領": 0.30, "披肩": 0.30,
                 "圓領": 0.55, "長袖": 0.60, "素面": 0.35},
        "應排進前": 5,
    },
]


def _idf(names: list[str], term: str) -> float:
    df = sum(1 for n in names if term in n)
    return math.log((len(names) + 1) / (df + 1))


def rank(df: pd.DataFrame, features: dict[str, float], *,
         name_col: str = "品名", top: int = 20) -> pd.DataFrame:
    """`features` 是 {特徵詞: 我看到它的把握 0–1}。

    分數 = Σ IDF(詞) × 把握。IDF 讓罕見詞說話 ——「上衣」出現一千多次，
    命中它幾乎不帶資訊；「單邊」只出現幾十次，命中它就把候選縮掉一大半。
    """
    names = df[name_col].fillna("").astype(str).tolist()
    w = {t: _idf(names, t) for t in features}
    rows = []
    for i, nm in enumerate(names):
        hit = [t for t in features if t in nm]
        if not hit:
            continue
        score = sum(w[t] * features[t] for t in hit)
        score -= NEG_PENALTY * sum(1 for t in NEGATIVE if t in nm)
        rows.append({"分數": round(score, 2), "命中": "+".join(hit),
                     **df.iloc[i].to_dict()})
    if not rows:
        return pd.DataFrame()
    out = (pd.DataFrame(rows).sort_values("分數", ascending=False)
           .reset_index(drop=True))
    out.insert(0, "排名", out.index + 1)
    return out.head(top)


def check(df: pd.DataFrame, *, sku_col: str = "母款") -> list[str]:
    """拿已知正解跑一遍，回傳失敗訊息（空的代表全過）。

    這是唯一能證明「調整有沒有變好」的東西。沒有它，改權重就是換一種猜法。
    """
    bad: list[str] = []
    for t in TRUTH:
        res = rank(df, t["特徵"], top=10 ** 6)
        hit = res[res[sku_col].astype(str) == t["貨號"]]
        if hit.empty:
            bad.append(f"{t['貨號']}：完全沒進候選")
            continue
        r = int(hit["排名"].iloc[0])
        if r > t["應排進前"]:
            bad.append(f"{t['貨號']}：排第 {r} 名，應該在前 {t['應排進前']}")
    return bad
