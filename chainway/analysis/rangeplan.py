"""商品規劃展開圖：這一季該在哪個品類開幾款。

## 展開圖要回答什麼

開發會議上真正要決定的事只有幾件：這一季各品類各開幾款、每款投多深。
過去的做法是照去年微調。這支模組把「照去年微調」換成「照去年的實際表現
微調」—— 同樣一張展開表，但每一格旁邊放上那一格過去五年真的賣掉多少。

## 為什麼用款數佔比，不用金額

款數是設計部門真正在配置的資源：一個款位就是一次打版、一次選布、一次
上架位置。金額是結果不是配置。展開圖是配置表，所以格子裡放款數。

## 一格一格算，不做整體迴歸

跨品類跨季的迴歸會給出一個漂亮的係數，但沒有人能拿它去開會 ——
「上衣係數 0.23」不能決定上衣開幾款。所以這裡只做一件事：
把每一格的款數與售罄率並排，讓落差自己浮出來。

## 這份分析不做什麼

不做「熊放胸前該開幾款」那一層。圖案、版型的展開需要款級資料表，
那份表在公司的電腦上。這裡只用已經彙總好的季別 × 品類資料
（2,469 款、19 季），跑得起來、也算得準的就這些。
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

DATASET = "data/outputs/reports/season_dataset.json"

# 季別的排列順序（上架先後），不是字典序
TERM_ORDER = ["早春", "夏", "秋", "冬"]
CAT_ORDER = ["上衣", "外套", "裙子", "褲子", "洋裝"]


def load(path: str | Path = DATASET) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def grid(data: dict[str, Any]) -> pd.DataFrame:
    """展開現況：品類 × 季別，每格是款數與售罄率。"""
    df = pd.DataFrame(data["cat_term"])
    df = df.rename(columns={"cat": "品類", "s": "季別", "sleeve": "袖長",
                            "st": "售罄率", "wst": "加權售罄率", "n": "款數"})
    df["季別"] = pd.Categorical(df["季別"], TERM_ORDER, ordered=True)
    df["品類"] = pd.Categorical(df["品類"], CAT_ORDER, ordered=True)
    return df.sort_values(["品類", "季別"]).reset_index(drop=True)


def gaps(g: pd.DataFrame) -> pd.DataFrame:
    """展開落差：這一格佔了該季多少款位，售罄率又比該季平均高多少。

    兩個數字放在一起才有意義。售罄率低但只開三款，那是試水溫；
    售罄率低又開三百款，那是把款位押在賣不掉的地方。
    """
    out = g.copy()
    tot = out.groupby("季別", observed=True)["款數"].transform("sum")
    out["佔該季款位"] = out["款數"] / tot
    # 該季平均用款數加權 —— 未加權的話，開 30 款的洋裝與開 378 款的上衣
    # 對「該季平均」有一樣的發言權，那不合理。
    wavg = (out.assign(_w=out["售罄率"] * out["款數"])
               .groupby("季別", observed=True)["_w"].transform("sum") / tot)
    out["該季平均售罄"] = wavg
    out["售罄落差"] = out["售罄率"] - wavg
    # 押錯的款位：低於該季平均的部分，換算成款數
    out["低於平均的款位"] = np.where(out["售罄落差"] < 0, out["款數"], 0)
    return out


def by_year(data: dict[str, Any]) -> pd.DataFrame:
    """品類 × 年度，用來看一格是長期如此還是最近才變。"""
    df = pd.DataFrame(data["cat_year"])
    return df.rename(columns={"cat": "品類", "y": "年", "st": "售罄率",
                              "wst": "加權售罄率", "n": "款數"})


def seasons(data: dict[str, Any]) -> pd.DataFrame:
    """每一季的投入、售罄、上架天數。上架天數是用來否定結論的。"""
    df = pd.DataFrame(data["seasons"])
    df["上架天數"] = [
        (dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days
        for a, b in zip(df["d0"], df["d1"])]
    df["投入深度"] = df["in"] / df["n"]
    return df.rename(columns={"label": "季", "s": "季別", "y": "年",
                              "n": "款數", "in": "投入", "left": "剩餘",
                              "st": "售罄率", "champ_n": "暢銷款數",
                              "done": "已結束", "sleeve": "袖長"})


def term_separation(s: pd.DataFrame, term: str = "秋") -> dict[str, Any]:
    """檢驗某一季別是不是每一年都墊底，還是只是平均被拉低。

    平均值會被離群年份帶著走。真正有力的證據是**完全分離**：
    這個季別最好的一年，仍然差過其他季別最差的一年。那不是程度問題，
    是結構問題，而且用一句話就能講清楚，不需要聽的人相信任何統計方法。
    """
    a = s[s["季別"] == term]["售罄率"]
    b = s[s["季別"] != term]["售罄率"]
    if a.empty or b.empty:
        return {"可判斷": False}
    return {
        "可判斷": True, "季別": term,
        "n": int(len(a)), "其他n": int(len(b)),
        "平均": float(a.mean()), "其他平均": float(b.mean()),
        "最好": float(a.max()), "其他最差": float(b.min()),
        "完全分離": bool(a.max() < b.min()),
        "落差": float(b.mean() - a.mean()),
    }


def shelf_window_test(s: pd.DataFrame) -> dict[str, Any]:
    """否定測試：「那一季只是上架期比較短」講不講得通。

    講得通的話，上架天數與售罄率應該有明顯正相關，而且該季別的天數
    應該系統性偏短。兩件事都要成立才算解釋得掉。
    """
    r = float(np.corrcoef(s["上架天數"], s["售罄率"])[0, 1])
    aut = s[s["季別"] == "秋"]["上架天數"]
    oth = s[s["季別"] != "秋"]["上架天數"]
    return {"相關係數": round(r, 3), "n": int(len(s)),
            "秋平均天數": round(float(aut.mean()), 1),
            "其他平均天數": round(float(oth.mean()), 1),
            "秋天數全距": (int(aut.min()), int(aut.max())),
            "解釋得掉": bool(r > 0.5 and aut.mean() < oth.mean() * 0.8)}


def reallocation(s: pd.DataFrame, term: str = "秋") -> dict[str, Any]:
    """情境試算：那一季的款位如果不放在那裡，過去五年會是什麼數字。

    **這是算術，不是預測。** 它假設移過去的款位表現得跟既有款位一樣，
    而這個假設通常不成立 —— 一季多開五十款，多出來的那五十款多半是
    次要想法，表現會比原本的差。所以這個數字的用途是「值不值得認真討論」，
    不是「照這個做」。要驗證只有一條路：真的少開，看下一季的數字。
    """
    a = s[s["季別"] == term]
    b = s[s["季別"] != term]
    if a.empty or b.empty:
        return {"可試算": False}
    sold_now = float((a["投入"] * a["售罄率"]).sum())
    rate_other = float((b["投入"] * b["售罄率"]).sum() / b["投入"].sum())
    return {
        "可試算": True, "季別": term,
        "年數": int(a["年"].nunique()),
        "款數": int(a["款數"].sum()),
        "投入": int(a["投入"].sum()),
        "實際賣出": int(round(sold_now)),
        "實際售罄": float(a["投入"].mul(a["售罄率"]).sum() / a["投入"].sum()),
        "其他季售罄": rate_other,
        "同投入按其他季售罄可賣": int(round(float(a["投入"].sum()) * rate_other)),
        "差額件數": int(round(float(a["投入"].sum()) * rate_other - sold_now)),
        "累積剩餘": int(a["剩餘"].sum()),
    }


def tables(path: str | Path = DATASET) -> dict[str, Any]:
    """一次算完，報表直接取用。"""
    data = load(path)
    g = gaps(grid(data))
    s = seasons(data)
    return {
        "meta": data["meta"],
        "展開": g,
        "年度": by_year(data),
        "季": s,
        "秋分離": term_separation(s, "秋"),
        "上架期檢驗": shelf_window_test(s),
        "試算": reallocation(s, "秋"),
    }
