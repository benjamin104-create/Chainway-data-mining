"""季別診斷資料集：把 POS 明細算成報告需要的全部彙總。

這個模組是「季別報告」的唯一算式來源。報告產生器只負責畫，
所有數字都在這裡算完，好處是同一份數字可以被報告、API 與試算表共用，
也才有辦法在別台機器上用同一套規則重跑出一模一樣的結果。

三個貫穿全檔的原則：

1. **年份一律拆開**。服裝業每年的流行與線條不同，把 2024–2026 併成
   一個平均會蓋掉真實差異。所有指標都拆到「季號 × 年 × 季別」。

2. **袖長是季別層級屬性**，由季號末碼查 ``season_terms``
   （7=早春長袖／8=夏短袖／5=秋短袖／6=冬長袖）。不是逐款判定 ——
   報表只有約 16% 的上衣在品名裡寫了袖長，靠品名做長短袖分析會漏掉八成。

3. **尚在銷售期的季別要標出來**。完銷率還會上升，不能跟已完結的季
   混在同一個平均裡，否則會低估當季表現。
"""
from __future__ import annotations

import datetime as dt
from typing import Any

import numpy as np
import pandas as pd

from ..config import Config

# 銷冠門檻：同時要求「賣得完」與「有量」。
# 只看完銷率的話，投入 30 件賣掉 27 件會排在投入 800 件賣掉 600 件前面，
# 但前者對營收與下量決策都沒有參考價值。
CHAMPION_SELL_THROUGH = 0.80
CHAMPION_MIN_QTY = 100
# 投入太少的款，完銷率的分母不穩定，一件的差異就會讓比率跳好幾個百分點
MIN_QTY_FOR_ANALYSIS = 30
# 月份曲線上款數太少的點不畫，避免用 2 款去代表一整個月
MIN_N_PER_MONTH = 6
DEFAULT_TOP_N = 15


def _dstr(v: Any) -> str | None:
    """把日期欄轉成 YYYY-MM-DD；NaT 與空值一律回 None（不要回 'NaT' 字串）。"""
    if v is None or pd.isna(v):
        return None
    return pd.Timestamp(v).date().isoformat()


def _num(v: Any, default: float = 0.0) -> float:
    return default if v is None or pd.isna(v) else float(v)


def _int(v: Any, default: int = 0) -> int:
    return default if v is None or pd.isna(v) else int(round(float(v)))


def annotate_seasons(df: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    """補上 season_code / year / term / sleeve 等欄位，全部由貨號前 5 碼推導。

    報表本身沒有季別欄，但貨號一定有 —— 這比信任報表的季別欄可靠，
    因為貨號是開單時就決定的，不會因為報表匯出方式不同而變。
    """
    out = df.copy()
    info = out["sku"].astype(str).str[:5].map(lambda c: cfg.season_from_code(c) or {})
    out["season_code"] = [i.get("code") for i in info]
    out["season_year"] = [i.get("year") for i in info]
    out["season_term"] = [i.get("term") for i in info]
    out["season_term_code"] = [i.get("term_code") for i in info]
    out["sleeve"] = [i.get("sleeve") for i in info]
    out["season_order"] = [i.get("order", 9) for i in info]
    out["season_label"] = [i.get("label") for i in info]
    out["season_full_label"] = [i.get("full_label") for i in info]
    return out


def filter_for_analysis(df: pd.DataFrame,
                        min_qty: int = MIN_QTY_FOR_ANALYSIS) -> tuple[pd.DataFrame, dict[str, int]]:
    """套用分析用的排除規則，並回報每一條規則各排掉幾筆。

    排除清單本身就是報告的一部分 —— 讀者要能看到「1,570 筆怎麼變成
    1,348 款」，不然沒辦法判斷這份分析涵蓋了多少實際商品。
    """
    audit: dict[str, int] = {"原始": len(df)}
    out = df

    if "is_gift" in out.columns:
        mask = out["is_gift"].fillna(False).astype(bool)
        audit["贈品／魅力商品"] = int(mask.sum())
        out = out[~mask]
    if "is_sample" in out.columns:
        mask = out["is_sample"].fillna(False).astype(bool)
        audit["樣衣／樣品"] = int(mask.sum())
        out = out[~mask]

    mask = out["season_code"].isna()
    audit["季號不在對照表"] = int(mask.sum())
    out = out[~mask]

    qty = pd.to_numeric(out["stock_in"], errors="coerce")
    mask = qty.isna() | (qty < min_qty)
    audit[f"投入 < {min_qty} 件"] = int(mask.sum())
    out = out[~mask]

    audit["納入分析"] = len(out)
    return out.reset_index(drop=True), audit


def _sell_through(g: pd.DataFrame) -> float:
    """加權完銷率 ＝ 1 −（總剩餘 ÷ 總投入）。

    刻意不用「各款完銷率的平均」：後者會讓投入 30 件的款和投入 800 件的款
    等重，一批小單就能把整季的數字拉高。這裡問的是「這一季的貨賣掉幾成」，
    答案只能由件數決定。
    """
    inn = pd.to_numeric(g["stock_in"], errors="coerce").sum()
    left = pd.to_numeric(g["stock_on_hand"], errors="coerce").sum()
    if not inn:
        return float("nan")
    return float(1 - left / inn)


def _mean_sell_through(g: pd.DataFrame) -> float:
    """各款完銷率的平均 —— 回答「典型的一款賣得如何」，與加權版互補。"""
    return float(pd.to_numeric(g["sell_through_rate"], errors="coerce").mean())


def _image_path(sku: str, season_code: str) -> str:
    """系統圖的相對路徑。實際檔案在使用者機器上，這裡只給可回查的路徑。"""
    return f"系統圖/{season_code}/{sku}.jpg"


def _style_rows(g: pd.DataFrame, cfg: Config, limit: int | None = None) -> list[dict]:
    rows = []
    for _, r in g.iterrows():
        rows.append({
            "sku": str(r["sku"]),
            "nm": str(r.get("product_name") or ""),
            "kc": str(r["season_code"]),
            "se": str(r.get("season_label") or ""),
            "sleeve": r.get("sleeve"),
            "cat": cfg.category_label(str(r.get("category") or "")) or str(r.get("sub_category") or ""),
            "de": str(r.get("designer") or "—"),
            "pr": _int(r.get("list_price")),
            "in": _int(r.get("stock_in")),
            "sold": _int(r.get("net_sales_qty")),
            "left": _int(r.get("stock_on_hand")),
            "st": round(_num(r.get("sell_through_rate")), 4),
            "img": _image_path(str(r["sku"]), str(r["season_code"])),
        })
        if limit and len(rows) >= limit:
            break
    return rows


def build_dataset(df: pd.DataFrame, cfg: Config, *,
                  top_n: int = DEFAULT_TOP_N) -> dict[str, Any]:
    """由 貨號 × 季別 層級的 POS 資料，算出季別報告需要的全部彙總。

    傳入的 df 應是 ``aggregate_to_sku_season()`` 的輸出。
    """
    raw_n = len(df)
    df = annotate_seasons(df, cfg)
    data, audit = filter_for_analysis(df)
    if data.empty:
        raise ValueError("套用排除規則後沒有任何資料可分析 —— 請先確認 POS 檔是否讀進來了")

    snapshot = data["snapshot_date"].max() if "snapshot_date" in data.columns else pd.NaT
    snapshot_s = _dstr(snapshot)
    files = sorted({str(f) for f in data.get("source_file", pd.Series(dtype=str)).dropna()})

    # ---- 每個季別的範圍與表現 --------------------------------------
    # 「已完結」判定：該季最晚的入庫日距報表匯出日超過半年。
    # 半年是這個品牌一檔商品從鋪貨到出清的實際長度（由 KA136 等已結束的
    # 季別回推），不是隨便取的整數。
    seasons: list[dict] = []
    for kc, g in data.groupby("season_code", dropna=True):
        info = cfg.season_from_code(str(kc)) or {}
        d1 = g["first_sale_date"].max()
        done = bool(pd.notna(d1) and pd.notna(snapshot)
                    and (pd.Timestamp(snapshot) - pd.Timestamp(d1)).days > 182)
        champs = g[(pd.to_numeric(g["sell_through_rate"], errors="coerce") >= CHAMPION_SELL_THROUGH)
                   & (pd.to_numeric(g["stock_in"], errors="coerce") >= CHAMPION_MIN_QTY)]
        seasons.append({
            "kc": str(kc),
            "y": info.get("year"),
            "s": info.get("term"),
            "tc": info.get("term_code"),
            "sleeve": info.get("sleeve"),
            "order": info.get("order", 9),
            "label": info.get("label"),
            "full_label": info.get("full_label"),
            "n": len(g),
            "d0": _dstr(g["first_sale_date"].min()),
            "d1": _dstr(d1),
            "st": round(_mean_sell_through(g), 4),
            "wst": round(_sell_through(g), 4),
            "med": round(float(pd.to_numeric(g["sell_through_rate"], errors="coerce").median()), 4),
            "hi": int((pd.to_numeric(g["sell_through_rate"], errors="coerce") >= CHAMPION_SELL_THROUGH).sum()),
            "in": _int(pd.to_numeric(g["stock_in"], errors="coerce").sum()),
            "left": _int(pd.to_numeric(g["stock_on_hand"], errors="coerce").sum()),
            "pr": _int(pd.to_numeric(g["list_price"], errors="coerce").median()),
            "champ_n": len(champs),
            "done": done,
            "f": ", ".join(sorted({str(x) for x in g.get("source_file", pd.Series(dtype=str)).dropna()})),
        })
    seasons.sort(key=lambda s: (s["y"] or 0, s["order"]))

    # ---- 年對年 / 季對季（同一組數字，兩種讀法）--------------------
    yoy = [{"kc": s["kc"], "y": s["y"], "s": s["s"], "tc": s["tc"],
            "sleeve": s["sleeve"], "st": s["st"], "wst": s["wst"], "n": s["n"]}
           for s in seasons]

    # ---- 四季彙總與袖長彙總 ----------------------------------------
    terms = cfg.season_terms()
    order = sorted(terms, key=lambda k: terms[k].get("order", 9))
    season_stats = []
    for tc in order:
        ss = [s for s in seasons if s["tc"] == tc]
        if not ss:
            continue
        inn = sum(s["in"] for s in ss)
        left = sum(s["left"] for s in ss)
        season_stats.append({
            "tc": tc, "s": terms[tc]["name"], "sleeve": terms[tc]["sleeve"],
            "st": round(1 - left / inn, 4) if inn else float("nan"),
            "n": sum(s["n"] for s in ss), "in": inn, "left": left,
            "ch": sum(s["champ_n"] for s in ss),
            "codes": [s["kc"] for s in ss],
        })

    sleeve_stats = []
    for sl in dict.fromkeys(terms[tc]["sleeve"] for tc in order):
        ss = [s for s in seasons if s["sleeve"] == sl]
        inn = sum(s["in"] for s in ss)
        left = sum(s["left"] for s in ss)
        sleeve_stats.append({
            "sleeve": sl,
            "st": round(1 - left / inn, 4) if inn else float("nan"),
            "n": sum(s["n"] for s in ss), "in": inn, "left": left,
            "ch": sum(s["champ_n"] for s in ss),
            "terms": [terms[tc]["name"] for tc in order if terms[tc]["sleeve"] == sl],
        })

    # ---- 同袖型季別的上架重疊 --------------------------------------
    # 同一年、同一種袖長的兩個季別若在架上重疊，就是自家商品互相分食的
    # 候選解釋。這裡只算出重疊天數，不宣稱因果 —— 要證實需要門市日銷。
    overlaps = []
    for sl in {s["sleeve"] for s in seasons if s["sleeve"]}:
        for y in sorted({s["y"] for s in seasons if s["y"]}):
            grp = [s for s in seasons if s["sleeve"] == sl and s["y"] == y
                   and s["d0"] and s["d1"]]
            if len(grp) < 2:
                continue
            grp.sort(key=lambda s: s["order"])
            for a, b in zip(grp, grp[1:]):
                lo = max(dt.date.fromisoformat(a["d0"]), dt.date.fromisoformat(b["d0"]))
                hi = min(dt.date.fromisoformat(a["d1"]), dt.date.fromisoformat(b["d1"]))
                overlaps.append({
                    "y": y, "sleeve": sl,
                    "a": a["kc"], "a_term": a["s"], "a_d0": a["d0"], "a_d1": a["d1"], "a_st": a["st"],
                    "b": b["kc"], "b_term": b["s"], "b_d0": b["d0"], "b_d1": b["d1"], "b_st": b["st"],
                    "days": max((hi - lo).days, 0),
                    "lo": lo.isoformat(), "hi": hi.isoformat(),
                })
    overlaps.sort(key=lambda o: (o["sleeve"], o["y"]))

    # ---- 品類 × 年 --------------------------------------------------
    cat_year = []
    for (cat, y), g in data.groupby([data["category"], data["season_year"]], dropna=True):
        cat_year.append({"cat": cfg.category_label(str(cat)) or str(cat),
                         "y": int(y), "st": round(_mean_sell_through(g), 4),
                         "wst": round(_sell_through(g), 4), "n": len(g)})

    # ---- 品類 × 季別碼（讓「哪個品類在哪一季塌掉」看得出來）--------
    cat_term = []
    for (cat, tc), g in data.groupby([data["category"], data["season_term_code"]], dropna=True):
        if len(g) < MIN_N_PER_MONTH:
            continue
        cat_term.append({"cat": cfg.category_label(str(cat)) or str(cat),
                         "tc": str(tc), "s": terms.get(str(tc), {}).get("name"),
                         "sleeve": terms.get(str(tc), {}).get("sleeve"),
                         "st": round(_mean_sell_through(g), 4),
                         "wst": round(_sell_through(g), 4), "n": len(g)})

    # ---- 入庫月份 × 年 ---------------------------------------------
    month_year = []
    mdf = data[data["first_sale_date"].notna()].copy()
    mdf["_m"] = mdf["first_sale_date"].dt.month
    mdf["_y"] = mdf["first_sale_date"].dt.year
    for (m, y), g in mdf.groupby(["_m", "_y"]):
        if len(g) < MIN_N_PER_MONTH:
            continue
        month_year.append({"m": int(m), "y": int(y),
                           "st": round(_mean_sell_through(g), 4), "n": len(g)})
    month_year.sort(key=lambda r: (r["y"], r["m"]))

    # ---- 銷冠與年度前 N ---------------------------------------------
    champs: dict[str, list[dict]] = {}
    for s in seasons:
        g = data[data["season_code"] == s["kc"]]
        g = g[(pd.to_numeric(g["sell_through_rate"], errors="coerce") >= CHAMPION_SELL_THROUGH)
              & (pd.to_numeric(g["stock_in"], errors="coerce") >= CHAMPION_MIN_QTY)]
        g = g.sort_values("net_sales_qty", ascending=False)
        champs[s["kc"]] = _style_rows(g, cfg, limit=10)

    top_year: dict[str, list[dict]] = {}
    for y, g in data.groupby("season_year", dropna=True):
        g = g.sort_values("net_sales_qty", ascending=False)
        top_year[str(int(y))] = _style_rows(g, cfg, limit=top_n)

    return {
        "meta": {
            "raw": raw_n,
            "analysed": len(data),
            "snapshot": snapshot_s,
            "files": files,
            "audit": audit,
            "champion_rule": {"sell_through": CHAMPION_SELL_THROUGH, "min_qty": CHAMPION_MIN_QTY},
            "min_qty": MIN_QTY_FOR_ANALYSIS,
            "generated": dt.datetime.now().date().isoformat(),
        },
        "terms": terms,
        "seasons": seasons,
        "yoy": yoy,
        "season_stats": season_stats,
        "sleeve_stats": sleeve_stats,
        "overlaps": overlaps,
        "cat_year": cat_year,
        "cat_term": cat_term,
        "month_year": month_year,
        "champs": champs,
        "top_year": top_year,
    }
