"""款號 × 色號 × 尺寸 的對照主檔。

## 這份主檔解決什麼問題

POS 彙總報表的貨號只到款（KA1151002），系統圖檔名也只到款。
色號存在 ERP 裡，而 ERP 匯出的報表用的是完整品號（KA11510025636）。
所以只要有一份帶完整品號的匯出檔，就能把「款 → 有哪些顏色」建起來，
之後所有分析都能多一個顏色維度。

## 刻意只取三個欄位

貨號、尺寸、顏色。匯出檔裡雖然也有進銷存數字，但那是另一份報表的口徑，
與現行主表的季別範圍不同 —— 混進去會讓同一個款出現兩套互相矛盾的銷售數字。
主檔就當成主檔用，不兼差當銷售資料。

## 累積而不是覆蓋

每次匯入都與既有的合併去重。一份匯出檔通常只涵蓋部分季別，
覆蓋式寫入會讓上一次匯入的資料消失。合併的代價只是要處理重複，
那比默默弄丟資料好得多。
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd

from ..config import Config, get_config
from .color_discovery import parse_item_code

COLS = ["款號", "色號", "尺寸"]


def master_path(cfg: Config | None = None) -> Path:
    cfg = cfg or get_config()
    return cfg.path("interim") / "sku_colors.csv"


def parse_export(path: str | Path, *, sku_col: str | None = None) -> pd.DataFrame:
    """匯出檔 → 款號/色號/尺寸。只讀貨號那一欄，其他欄位一概不碰。"""
    p = Path(path)
    frames = (list(pd.read_excel(p, sheet_name=None, dtype=str).values())
              if p.suffix.lower() in (".xls", ".xlsx", ".xlsm")
              else [pd.read_csv(p, dtype=str)])

    rows: list[dict[str, Any]] = []
    for df in frames:
        if df is None or df.empty:
            continue
        col = sku_col
        if col is None:
            # 挑「解析出完整品號的比例最高」的欄，而不是靠欄名猜。
            # 匯出檔的欄名不保證叫「貨號」，但帶色號的品號長得很特別。
            best, best_hit = None, 0
            for c in df.columns:
                vals = df[c].dropna().astype(str).head(300)
                hit = sum(1 for v in vals
                          if (r := parse_item_code(v)) and r["色號"])
                if hit > best_hit:
                    best, best_hit = c, hit
            if best is None or best_hit < 3:
                continue
            col = best
        for v in df[col].dropna().astype(str):
            r = parse_item_code(v)
            if r and r["色號"]:
                rows.append(r)
    return pd.DataFrame(rows, columns=COLS).drop_duplicates()


def load(cfg: Config | None = None) -> pd.DataFrame:
    p = master_path(cfg)
    if not p.exists():
        return pd.DataFrame(columns=COLS)
    return pd.read_csv(p, dtype=str).fillna("")


def merge_into_master(new: pd.DataFrame, cfg: Config | None = None
                      ) -> dict[str, Any]:
    """把新解析的資料併進主檔。回傳併入前後的統計，讓人看得到增量。"""
    cfg = cfg or get_config()
    old = load(cfg)
    before = len(old)
    both = (pd.concat([old, new[COLS]], ignore_index=True)
            .drop_duplicates(subset=COLS)
            .sort_values(COLS)
            .reset_index(drop=True))
    p = master_path(cfg)
    p.parent.mkdir(parents=True, exist_ok=True)
    both.to_csv(p, index=False, encoding="utf-8-sig")
    per = both.groupby("款號")["色號"].nunique()
    return {"路徑": str(p), "併入前": before, "併入後": len(both),
            "新增": len(both) - before,
            "款號數": int(both["款號"].nunique()),
            "單色款": int((per == 1).sum()),
            "多色款": int((per > 1).sum())}


def colors_of(sku: str, master: pd.DataFrame) -> list[str]:
    """某個款號有哪些顏色。空清單代表主檔裡沒有這一款。"""
    return sorted(master.loc[master["款號"] == str(sku).upper(), "色號"].unique())


def attach(df: pd.DataFrame, cfg: Config | None = None, *,
           sku_col: str = "sku") -> pd.DataFrame:
    """給任何一張以款號為鍵的表加上顏色欄位。

    刻意加的是「顏色清單」與「顏色數」，而不是展開成一列一色 ——
    展開會讓每一列的銷售數字被重複計算，那是最容易犯又最難發現的錯。
    要做顏色層級的分析，得有顏色層級的銷售資料才行。
    """
    master = load(cfg)
    if master.empty or sku_col not in df.columns:
        return df
    grp = master.groupby("款號")["色號"].agg(lambda s: "、".join(sorted(set(s))))
    cnt = master.groupby("款號")["色號"].nunique()
    out = df.copy()
    key = out[sku_col].astype(str).str.upper()
    out["顏色清單"] = key.map(grp)
    out["顏色數"] = key.map(cnt)
    return out
