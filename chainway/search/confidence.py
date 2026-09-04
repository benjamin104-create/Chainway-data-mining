"""搜尋結果該不該相信 —— 「找不到」也是一個答案。

## 為什麼一定要有這一層

`search_by_crops` 一定會回傳排名第一的貨號，不管那張圖跟庫裡的東西
有多不像。上傳一件別家品牌的外套，它照樣給您一個 KA 開頭的貨號，
排名 1，看起來就像找到了。

使用者要的是「**確定**貨號」。而系統做的是「最像的」——
這兩件事在庫裡沒有那一款的時候，差距是無限大。
沒有這一層，最常見的失敗不是「找不到」，是**找到一個錯的**，
而錯的那個看起來和對的一模一樣。

## 怎麼判斷，而且不需要先標註資料

不用「相似度 > 0.8 就算命中」這種絕對門檻 —— 那個數字要有標註資料
才定得出來，而現在沒有。改用兩個**相對**訊號，兩個都不需要校準：

**一、第一名有沒有明顯突出。** 把第一名的相似度拿去和「跟庫裡所有款的
相似度分布」比。真的命中時，第一名會遠遠離群；庫裡沒有那一款時，
第一名只是一堆同樣不像的東西裡最不像的那個，離群程度接近 0。

**二、第一名和第二名差多少。** 差距很小代表有好幾款一樣像，
分不出來 —— 這時候給一個第一名是在騙人。

## 這裡的門檻是暫定的，而且程式會把原始數字印出來

下面兩個常數我沒有資料可以校準，是憑分布的常識訂的。所以：

  1. 判定旁邊一律附上實際的離群程度與邊際，讓人自己看
  2. 跑過 `eval-search` 之後，用那份逐筆結果回頭調這兩個數字

在調過之前，把這裡的「確定」讀成「值得點開看」，不是「就是這款」。
"""
from __future__ import annotations

from typing import Any

import numpy as np

# 第一名要比「純粹亂猜時的最高分」再高出多少，才算真的突出。
#
# 一開始我用固定門檻（離群 3 個標準差）。用模擬一驗就垮了：
# 把一件**庫裡根本沒有**的衣服丟進去，第一名照樣離群 3.74 個標準差，
# 判定「值得點開看」。原因是 N 個樣本的最大值本來就會隨 N 變大 ——
# 2,400 款的話，就算全部是雜訊，最高的那個也預期落在 3.9 個標準差外。
# 固定門檻 3 比雜訊自己產生的還低，等於這道關卡完全沒有作用。
#
# 所以門檻要跟著庫的大小走：N 個標準常態樣本的最大值約 sqrt(2·ln N)。
# 下面兩個數字是「要比那個預期最大值再高出多少個標準差」。
OVER_NOISE_STRONG = 1.0
OVER_NOISE_WEAK = 0.0
# 第一名與第二名的相似度差距。差太少代表分不出來。
MARGIN_MIN = 0.02


def _noise_max(n: int) -> float:
    """N 個標準常態樣本，最大值大概會落在幾個標準差外。

    這是「什麼都沒找到時，第一名長什麼樣」的基準線。
    比它高才叫找到東西，比它低只是抽樣的正常現象。
    """
    import math

    return math.sqrt(2.0 * math.log(max(n, 2)))


def assess(sims: np.ndarray, top_sims: list[float] | None = None
           ) -> dict[str, Any]:
    """`sims` 是這張查詢圖對庫裡**每一款**的相似度（不是只有前幾名）。

    回傳判定與原始數字。原始數字一定要回傳 —— 判定是這兩個數字推出來的，
    而門檻還沒校準，所以人得看得到推導的依據，不能只看結論。
    """
    s = np.asarray(sims, dtype=float)
    s = s[np.isfinite(s)]
    if s.size < 3:
        return {"判定": "資料太少", "說明": "索引裡的款數太少，判斷不了",
                "離群程度": None, "邊際": None}

    order = np.sort(s)[::-1]
    top1 = float(order[0])
    top2 = float(order[1])
    margin = top1 - top2
    mu, sd = float(s.mean()), float(s.std())
    z = (top1 - mu) / sd if sd > 1e-9 else 0.0

    base = _noise_max(s.size)          # 什麼都沒找到時，第一名的預期高度
    over = z - base                    # 比那條基準線高出多少

    if over < OVER_NOISE_WEAK:
        verdict = "找不到"
        why = (f"第一名離群 {z:.1f} 個標準差，但這個庫有 {s.size:,} 款，"
               f"就算完全沒有相似的款，最高的那個也預期落在 {base:.1f} 個"
               f"標準差外 —— 它沒有超過那條線。庫裡很可能沒有這一款，"
               f"排在前面的只是一堆同樣不像的東西裡最接近的那個。")
    elif margin < MARGIN_MIN:
        verdict = "分不出來"
        why = (f"第一名和第二名只差 {margin:.3f}（要 {MARGIN_MIN} 以上）"
               f"—— 有好幾款一樣像，這時候指定一個第一名是在騙人。"
               f"請看前五名自己挑。")
    elif over >= OVER_NOISE_STRONG:
        verdict = "值得點開看"
        why = (f"第一名離群 {z:.1f} 個標準差，比「什麼都沒找到」的基準線"
               f"（{base:.1f}）高出 {over:.1f}，領先第二名 {margin:.3f}。")
    else:
        verdict = "可能，但要自己確認"
        why = (f"第一名離群 {z:.1f} 個標準差，只比基準線 {base:.1f} 高出 "
               f"{over:.1f}（要 {OVER_NOISE_STRONG} 以上才算明顯）。"
               f"方向對，但別當定論。")

    return {"判定": verdict, "說明": why, "離群程度": round(z, 2),
            "雜訊基準": round(base, 2), "高出基準": round(over, 2),
            "邊際": round(margin, 4), "最高相似度": round(top1, 4),
            "平均相似度": round(mu, 4), "庫裡款數": int(s.size)}


# 已知案例。第 ② 組是這支程式存在的理由，也是第一版整個漏掉的那一組。
CASES: list[tuple[str, int, list[float], str]] = [
    # (說明, 庫裡款數, 額外插進去的高分, 應該判成什麼)
    ("庫裡真的有這一款",       2400, [0.82],                "值得點開看"),
    ("庫裡沒有（別家品牌）",   2400, [],                    "找不到"),
    ("好幾款一樣像",           2400, [0.79, 0.785, 0.783],  "分不出來"),
    ("勉強像但不夠突出",       2400, [0.58],                "找不到"),
    ("小庫也要成立",            144, [0.80],                "值得點開看"),
    ("小庫沒有這款",            144, [],                    "找不到"),
]


def check() -> list[str]:
    """跑一遍已知案例，回傳失敗訊息（空的代表全過）。

    留著是因為門檻只要一動，「庫裡沒有這一款」那一組最容易重新漏掉，
    而漏掉的症狀是「每次搜尋都很有信心」—— 看起來像變準了。
    """
    import numpy as np

    rng = np.random.default_rng(1)
    bad: list[str] = []
    for label, n, extra, want in CASES:
        s = rng.normal(0.35, 0.06, n)
        if extra:
            s = np.concatenate([s, extra])
        got = assess(s)["判定"]
        if got != want:
            bad.append(f"{label}：判成「{got}」，應該是「{want}」")
    return bad


def one_line(a: dict[str, Any]) -> str:
    z, m = a.get("離群程度"), a.get("邊際")
    tail = (f"（離群 {z} 個標準差、領先第二名 {m}）"
            if z is not None else "")
    return f"{a['判定']}{tail}　{a['說明']}"
