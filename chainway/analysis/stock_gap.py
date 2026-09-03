"""兩個庫存數字對不上的那些款。

## 為什麼有兩個數字

貴司報表本來就有兩欄，進銷存報告兩個都列，並且刻意不替人選：

    總存   ＝ 累進 − 總銷。一個封閉的帳：這一季投進去多少、賣掉多少、
             剩多少。2,469 款完全對得起來，不是估算。
    現場   ＝ 報表另一欄的「庫存」。多半是實際還在架上或倉裡的量。

兩者只有 15% 相同。也就是**每六款有五款對不上** —— 那不是誤差，
那是兩個在量不同東西的數字。

## 不替人選是對的，但人還是得選

報表寫「兩個都列，不替您決定該看哪一個」，誠實，但把問題原封不動
丟回去了。實際上該用哪一個是可以從它們的定義推出來的：

    設計決策（這款要不要延續、下季開幾款、投多少量）→ **總存**
      因為問的是「這一季的投入划不划算」，那是一筆封閉的帳。
      調撥、報廢、盤差、跨季混庫都不該影響這個判斷，而總存的算法
      本來就碰不到那些東西。

    營運決策（要不要補貨、要不要調撥、要不要打折出清）→ **現場**
      因為問的是「現在還有多少摸得到的貨」。這時候帳上的數字沒有用，
      架上有沒有才有用。

    兩個差很多的款 → **先盤點，兩個都不要用**
      差距大到一定程度時，至少有一個是錯的，而你分不出是哪一個。
      這種款拿任何一個數字下決定都是在賭。

## 這支程式做的事

把第三種款找出來，按差距大小排序 —— 盤點要花人力，先盤差最多的幾款
才划算。同時給出差距的方向，因為兩個方向的成因完全不同：

    現場 > 總存   多出來的貨。跨季庫存混在一起、或別櫃調撥進來。
    現場 < 總存   帳上還有、實際沒有。已賣未入帳、報廢、遺失、或盤差。

**這支程式不會告訴你哪一個數字是對的。** 它只告訴你哪幾款值得走一趟。
判斷哪個對需要現場，不需要更多統計。
"""
from __future__ import annotations

from typing import Any

import pandas as pd

BOOK = "stock_on_hand"       # 總存＝累進 − 總銷
FLOOR = "stock_on_hand_alt"  # 現場＝報表另一欄的「庫存」
SKU = "style_code"

# 差幾件以內當作對得上。不用 0 —— 完全相等只有 15%，用 0 當門檻等於
# 說「八成五的款都有問題」，那句話沒有可操作性，人看了只會不理它。
# 用件數而不是比例：盤點的成本是按件算的，不是按比例算的。
TOL_UNITS = 2
# 或者差距佔投入量的比例夠小也算對得上 —— 投 1,000 件差 5 件無所謂，
# 投 30 件差 5 件就不是小事。兩個條件取寬鬆的那個。
TOL_RATIO = 0.02


def gap(df: pd.DataFrame, *, book: str = BOOK, floor: str = FLOOR,
        base: str = "stock_in") -> pd.DataFrame:
    """加上差額欄位。缺欄位就回原表，不硬算。"""
    out = df.copy()
    if book not in out.columns or floor not in out.columns:
        out.attrs["可分析"] = False
        out.attrs["說明"] = f"缺少 {book} 或 {floor} 欄位"
        return out
    b = pd.to_numeric(out[book], errors="coerce")
    f = pd.to_numeric(out[floor], errors="coerce")
    inn = (pd.to_numeric(out[base], errors="coerce")
           if base in out.columns else pd.Series(pd.NA, index=out.index))
    out["差額"] = f - b
    # 分母用投入量，不用兩個庫存數字裡的任何一個 —— 用其中一個當分母，
    # 等於預設那一個是對的，而「哪個對」正是這裡答不出來的問題。
    out["差額比"] = (out["差額"].abs() / inn.replace(0, pd.NA))
    out["方向"] = out["差額"].map(
        lambda d: "" if pd.isna(d) else
        ("現場多" if d > 0 else ("現場少" if d < 0 else "相同")))
    out.attrs["可分析"] = True
    return out


def _agrees(r: pd.Series) -> bool:
    d = r.get("差額")
    if pd.isna(d):
        return False
    if abs(d) <= TOL_UNITS:
        return True
    ratio = r.get("差額比")
    return bool(pd.notna(ratio) and ratio <= TOL_RATIO)


def summarise(g: pd.DataFrame) -> dict[str, Any]:
    if not g.attrs.get("可分析", False):
        return {"可分析": False, "說明": g.attrs.get("說明", "")}
    d = g[g["差額"].notna()]
    if d.empty:
        return {"可分析": False, "說明": "兩欄都是空的"}
    ok = d.apply(_agrees, axis=1)
    more = d["差額"] > 0
    return {
        "可分析": True,
        "款數": int(len(d)),
        "完全相同": int((d["差額"] == 0).sum()),
        "對得上": int(ok.sum()),
        "對不上": int((~ok).sum()),
        "現場多": int((more & ~ok).sum()),
        "現場少": int((~more & ~ok).sum()),
        # 淨差是把兩個方向相抵之後的數字。相抵之後很小，代表多半是
        # 調撥／歸帳時間差（貨在公司裡搬來搬去）；相抵之後仍然很大，
        # 代表是系統性的漏（報廢、遺失、或某一欄的定義和我以為的不同）。
        "淨差件數": int(d["差額"].sum()),
        "總差件數": int(d["差額"].abs().sum()),
    }


def worth_counting(g: pd.DataFrame, *, top: int = 30,
                   sku: str = SKU) -> pd.DataFrame:
    """值得走一趟盤點的款，差最多的排前面。

    按**件數**排序而不是比例：盤點的成本是按件算的。一款差 300 件
    比十款各差 3 件重要得多，即使後者的比例更難看。
    """
    if not g.attrs.get("可分析", False):
        return pd.DataFrame()
    d = g[g["差額"].notna()]
    d = d[~d.apply(_agrees, axis=1)]
    cols = [c for c in (sku, "product_name", "品名", "season", BOOK, FLOOR,
                        "stock_in", "差額", "差額比", "方向") if c in d.columns]
    return (d.assign(_a=d["差額"].abs())
            .sort_values("_a", ascending=False)[cols].head(top)
            .reset_index(drop=True))


def one_line(s: dict[str, Any]) -> str:
    if not s.get("可分析"):
        return s.get("說明", "")
    pct = s["對不上"] / max(s["款數"], 1)
    return (f"{s['款數']:,} 款裡有 {s['對不上']:,} 款兩個庫存數字對不上"
            f"（{pct:.0%}）：現場多 {s['現場多']:,} 款、"
            f"現場少 {s['現場少']:,} 款，合計差 {s['總差件數']:,} 件，"
            f"相抵之後淨差 {s['淨差件數']:+,} 件。")
