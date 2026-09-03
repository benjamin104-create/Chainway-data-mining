"""版型 × 銷售：領型、袖長、衣長跟賣不賣得動有沒有關係。

## 和 motif 那支的分工

`motif` 回答圖案的問題（熊放哪裡、格紋做多大），資料來源是**品名** ——
因為貴司的品名把位置與形式寫得很清楚，比讓模型去猜可靠。

這一支回答版型的問題（領開多深、袖多長、衣長多少），資料來源是
**影像量測** —— 因為品名幾乎不寫版型。「口袋一隻熊短褲裙」沒告訴你
領型，但照片有。

兩支的統計方法刻意用同一套（相對同部位、bootstrap 區間、同樣的最小
組數）。兩份報告用不同方法算出兩個「+8pt」，看的人沒辦法比較，
而他們一定會比較。

## 為什麼要先驗準確率，而且驗不過就不報

`motif` 的來源是人寫的品名，錯了是人的錯，看得出來。這一支的來源是
程式量出來的，量錯了只會得到一個看起來很正常的標籤 —— 一件連袖上衣
被判成短袖，表上不會有任何異狀，然後「短袖 +6pt」就進了報告。

版型量測到目前為止只在 9 張合成圖與 1 張真實 T 恤上驗過。拿那個
去支撐一份會影響開款決定的報告，是把它當成比實際更可靠的東西 ——
上一次這樣做的結果是 Top-1 1.29%，量到的是測試集自己壞掉。

所以這裡先做一件不用人工標註就能做的事：**品名有寫的那些款，
拿品名當答案，看量測對不對。** 貴司的品名裡有「圓領」「V領」「連帽」
「短袖」「五分袖」「長版」，雖然只有一小部分款有寫，但那一小部分
就是免費的驗證集。

    對得上的比例 ≥ MIN_AGREE  → 這個屬性的數字可以看
    低於門檻                  → 照樣印出來，但標成「量測不可靠」，
                                並且**不給**售罄率的比較

不給比較是關鍵。標一句「僅供參考」沒有用 —— 數字印出來就會被引用。

## 這份分析的另一個限制

有系統圖的款才有版型。影像庫涵蓋的是近幾季，早期的款照片少，
所以每一組的款數與季別分布都要一起看 —— 一個「+12pt」如果全部
來自 2025 冬，那是那一季的事，不是那個領型的事。
"""
from __future__ import annotations

import re
from typing import Any

import numpy as np
import pandas as pd

from . import motif

# 品名有寫的款裡，量測要對到這個比例才敢拿去比售罄率。
# 0.70 不是統計上的門檻，是「說出去站得住腳」的門檻：十件裡錯三件的
# 量測，拿來支撐開款決定太勉強；而要求九成又會讓所有屬性都被擋掉，
# 那等於這支程式不存在。先用 0.70 跑一次，看真實數字再調 ——
# 這個常數本來就該被真實資料改掉。
MIN_AGREE = 0.70
# 品名裡至少要有這麼多款寫了這個屬性，準確率才算得準
MIN_LABELLED = 20
# 光是準確率高還不夠，還要贏過「每次都猜最常見的那一個」。
#
# 這條是測試時發現的：一個永遠回答「長袖」的量測，拿去對照
# 一批多半寫著「長袖」的品名，準確率會很好看 —— 但它什麼都沒量。
# 服飾的版型標籤本來就極度不平均（長袖遠多於蓋袖），所以這個陷阱
# 在真實資料上一定會出現，而且準確率那個數字完全看不出來。
MIN_MARGIN = 0.10

# 品名怎麼寫 → 量測會給的標籤。左邊是實際出現在貴司品名裡的寫法。
#
# 只在「量測分得比品名細」的地方放寬：品名說圓領、量測說寬圓領，
# 那不是量錯，是量得比較細。**相鄰的長度一律不放寬** ——
# 一開始我讓品名的「長袖」也接受量測的「五分～七分袖」，想說差一級
# 不算錯。結果是「五分～七分袖」變成一張免死金牌：一個永遠回答
# 五分～七分袖的程式，對照一批多半寫著長袖的品名，準確率有 82%。
# 放寬相鄰級距等於把這個檢查關掉，而這個檢查是整支程式唯一的把關。
NAME_TO_MEASURED: dict[str, dict[str, tuple[str, ...]]] = {
    "領型": {
        r"高領|半高領|立領":            ("高領/密合",),
        r"[Vv]領|深[Vv]":               ("深 V／U 領",),
        r"一字領|船型領|船領":           ("一字／船型領",),
        r"圓領":                        ("圓領", "寬圓領"),   # 量測較細
        r"大開領|寬領":                  ("大開領",),
    },
    "袖長": {
        r"無袖|背心":                    ("無袖／背心",),
        r"蓋袖":                        ("蓋袖",),
        r"短袖":                        ("短袖",),
        r"五分袖|七分袖|五分～七分":      ("五分～七分袖",),
        r"長袖|九分袖":                  ("長袖",),
    },
    "衣長": {
        r"短版":                        ("短版",),
        r"長版|長罩衫":                  ("長版", "長版／長罩衫"),  # 量測較細
    },
}

# 這些量測標籤代表「沒量出來」，不參與任何統計。
# 混進去會讓「量不到」自己變成一個看起來有意義的組。
NOT_MEASURED = {"量不到", "", None}


def _stated(name: str, attr: str) -> str | None:
    """品名有沒有寫這個屬性；有的話回傳它對應的量測標籤集合的 key。

    長的寫法先比 —— 不然「V領」會被「領」吃掉，「半高領」會被
    「高領」以外的規則搶走。規則表本身已經按這個順序排。
    """
    s = str(name or "")
    for pat in NAME_TO_MEASURED.get(attr, {}):
        if re.search(pat, s):
            return pat
    return None


def agreement(df: pd.DataFrame, *, name_col: str = "product_name"
              ) -> dict[str, Any]:
    """品名有寫的那些款，量測對不對。回傳每個屬性的準確率與錯誤實例。

    這是免費的驗證集：不用人工標註，因為貴司的品名本來就寫了一部分。
    代價是它只驗得到「品名有寫」的那些款，而那些款不見得能代表全部
    —— 會特地在品名寫「V領」的，多半就是領型明顯的那些。
    所以這個準確率是**樂觀的上界**，不是實際準確率。
    """
    out: dict[str, Any] = {}
    for attr, rules in NAME_TO_MEASURED.items():
        if attr not in df.columns or name_col not in df.columns:
            continue
        rows = []
        for _, r in df.iterrows():
            pat = _stated(r[name_col], attr)
            if pat is None:
                continue
            got = r[attr]
            if got in NOT_MEASURED or pd.isna(got):
                rows.append({"款號": r.get("style_code", ""),
                             "品名": r[name_col], "品名說": pat,
                             "量測說": "量不到", "對得上": False})
                continue
            rows.append({"款號": r.get("style_code", ""),
                         "品名": r[name_col], "品名說": pat,
                         "量測說": got, "對得上": got in rules[pat]})
        d = pd.DataFrame(rows)
        if d.empty:
            out[attr] = {"可判斷": False, "說明": "品名裡沒有一款寫了這個屬性"}
            continue
        acc = float(d["對得上"].mean())
        # 基準：一個什麼都不量、永遠回答同一個標籤的程式，能拿到幾分。
        # 贏不過它，代表這個量測沒有帶進任何資訊。
        base = 0.0
        base_label = ""
        for cand in {v for vals in rules.values() for v in vals}:
            hit = float(d["品名說"].map(
                lambda p: cand in rules[p]).mean())
            if hit > base:
                base, base_label = hit, cand
        enough = len(d) >= MIN_LABELLED
        ok = enough and acc >= MIN_AGREE and acc >= base + MIN_MARGIN

        if not enough:
            why = (f"品名有寫的只有 {len(d)} 款，不足 {MIN_LABELLED} 款，"
                   f"算不出可靠的準確率")
        else:
            why = (f"品名有寫的 {len(d)} 款裡對得上 {int(d['對得上'].sum())} 款"
                   f"（{acc:.0%}）")
            if acc < MIN_AGREE:
                why += f"，低於 {MIN_AGREE:.0%}，不拿去比售罄率"
            elif acc < base + MIN_MARGIN:
                gap = acc - base
                cmp = (f"只贏 {gap:.0%}" if gap > 0 else
                       "打平" if gap == 0 else f"還輸 {-gap:.0%}")
                why += (f"，但一個永遠回答「{base_label}」、什麼都不量的程式"
                        f"就有 {base:.0%} —— {cmp}，"
                        f"代表這個量測幾乎沒帶進資訊，不拿去比售罄率")
        out[attr] = {
            "可判斷": enough, "可信": ok,
            "品名有寫的款數": int(len(d)),
            "對得上": int(d["對得上"].sum()),
            "準確率": acc, "猜最常見的準確率": base, "最常見標籤": base_label,
            "錯的實例": d[~d["對得上"]].head(20),
            "說明": why,
        }
    return out


def lift(df: pd.DataFrame, *, attr: str, metric: str = "sell_through_rate",
         min_group: int = motif.MIN_GROUP) -> pd.DataFrame:
    """某個版型屬性的各個值，相對同部位平均高／低幾個百分點。

    方法與 motif 完全一樣 —— 兩份報告用不同方法算出兩個「+8pt」，
    看的人沒辦法比較，而他們一定會比較。

    用 `stratified_bootstrap`（分層到部位 × 季別段）而不是只相對部位：
    有系統圖的款集中在近幾季，不控季別的話，一個領型的「+12pt」可能
    整個來自剛好賣得好的那一季。分層之後那種效果會自己消掉。
    """
    if attr not in df.columns or metric not in df.columns:
        return pd.DataFrame()
    d = motif.add_body_part(df)
    d = d[~d[attr].isin(NOT_MEASURED) & d[attr].notna()]
    d = d[pd.to_numeric(d[metric], errors="coerce").notna()].reset_index(drop=True)
    if d.empty:
        return pd.DataFrame()

    rows = []
    for val, g in d.groupby(attr):
        if len(g) < min_group:
            continue
        res = motif.stratified_bootstrap(
            d, (d[attr] == val).to_numpy(), metric=metric)
        lo, hi = res.get("低pt"), res.get("高pt")
        rows.append({
            "屬性": attr, "值": val, "款數": int(len(g)),
            "季數": int(g["season"].nunique()) if "season" in g.columns else None,
            "相對同部位": res.get("效果pt"),
            "區間下限": lo, "區間上限": hi,
            # 區間跨過 0 的一律標出來。「+21.9pt」看起來像結論，
            # 但如果區間是 −4 到 +48，它只是六件衣服的平均。
            "跨過0": bool(lo is None or hi is None
                          or np.isnan(lo) or np.isnan(hi)
                          or (lo <= 0 <= hi)),
        })
    if not rows:
        return pd.DataFrame()
    return (pd.DataFrame(rows)
            .sort_values("相對同部位", ascending=False, na_position="last")
            .reset_index(drop=True))


def analyse(measured: pd.DataFrame, master: pd.DataFrame, *,
            sku_col: str = "style_code",
            metric: str = "sell_through_rate") -> dict[str, Any]:
    """量測表 + 主表 → 準確率、可用的屬性、各屬性的售罄落差。"""
    m = measured.copy()
    key = next((c for c in (sku_col, "sku", "款號") if c in m.columns), None)
    if key is None:
        return {"可分析": False, "說明": "量測表裡找不到貨號欄"}
    m = m.rename(columns={key: sku_col})

    mk = next((c for c in (sku_col, "sku", "款號") if c in master.columns), None)
    if mk is None:
        return {"可分析": False, "說明": "主表裡找不到貨號欄"}
    keep = [c for c in (mk, "product_name", "season", "category_code", metric)
            if c in master.columns]
    joined = m.merge(master[keep].rename(columns={mk: sku_col}),
                     on=sku_col, how="inner", suffixes=("", "_主表"))
    if joined.empty:
        return {"可分析": False,
                "說明": "量測表與主表對不到任何一個貨號"}

    acc = agreement(joined)
    lifts: dict[str, pd.DataFrame] = {}
    for attr, a in acc.items():
        # 驗不過就不給比較。標一句「僅供參考」沒有用 ——
        # 數字印出來就會被引用，而引用的時候那句話不會跟著。
        if a.get("可信"):
            t = lift(joined, attr=attr, metric=metric)
            if not t.empty:
                lifts[attr] = t
    # 一次比了幾組，一定要一起報。95% 區間的意思是「每 20 組會有 1 組
    # 就算完全沒效果、區間也剛好不跨過 0」。比 9 組就預期會冒出 0.45 個
    # 假陽性 —— 這不是瑕疵，是 95% 這個數字的定義。
    # 不講的話，一份表上五個「區間不跨 0」看起來像五個發現。
    tested = int(sum(len(t) for t in lifts.values()))
    flagged = int(sum((~t["跨過0"]).sum() for t in lifts.values()))
    return {
        "可分析": True,
        "量測款數": int(len(m)),
        "對到主表": int(len(joined)),
        "準確率": acc,
        "落差": lifts,
        "比了幾組": tested,
        "區間不跨0的組數": flagged,
        "純屬巧合的預期組數": round(tested * 0.05, 1),
        "季別分布": (joined["season"].value_counts().rename_axis("季別")
                     .reset_index(name="款數")
                     if "season" in joined.columns else pd.DataFrame()),
    }


def one_line(res: dict[str, Any]) -> str:
    if not res.get("可分析"):
        return res.get("說明", "")
    good = [a for a, v in res["準確率"].items() if v.get("可信")]
    bad = [a for a, v in res["準確率"].items() if not v.get("可信")]
    bits = []
    if good:
        bits.append("量測驗得過的：" + "、".join(
            f"{a}（{res['準確率'][a]['準確率']:.0%}）" for a in good))
    if bad:
        bits.append("驗不過、不拿去比售罄率的：" + "、".join(bad))
    tail = ""
    if res.get("比了幾組"):
        tail = (f"　比了 {res['比了幾組']} 組，其中 {res['區間不跨0的組數']} 組"
                f"區間不跨過 0；就算完全沒效果，預期也會有 "
                f"{res['純屬巧合的預期組數']} 組長這樣。")
    return (f"{res['對到主表']:,} 款同時有量測與銷售資料。"
            + "　".join(bits) + tail)
