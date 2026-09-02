"""把定位跑過整個影像庫，產出「款號 → 設計重點位置」的表。

## 這張表是幹嘛的

品名只有 13% 寫了位置，所以位置分析一直做不起來。這張表補上那一塊：
每一款系統圖跑一次，得到設計重點的分區、座標、佔比。
之後「熊在胸前 vs 熊在口袋哪個好賣」才有資料可算。

## 一定要附證明圖

定位是啟發式的，宣稱準確率沒有意義 —— 要人看。所以除了 CSV 之外
還產出一張抽樣的對照表：原圖 + 框出偵測到的區域 + 判到的分區。
框畫錯了一眼就看得出來，比任何數字都直接。

先前的教訓：圖片分類我用「JPEG 且 >600px」判打樣照片，
自己覺得合理就上線了，結果整個評測建立在錯的標籤上。
這次先讓人看。
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pandas as pd

from ..config import Config, get_config
from ..imageio import load_rgb
from . import silhouette
from .locate import CLAIM_OVERLAP, locate

# 版型屬性帶進表裡的欄位。標籤與量到的比例一起帶 ——
# 只有標籤的話，覆核的人沒有東西可以指著說「這個數字不對」。
SIL_COLS = ("領型", "領深比", "領寬比", "袖長", "袖長比",
            "衣長", "衣長比", "肩寬px", "身寬px")


def _sil_cols(sil: dict[str, Any]) -> dict[str, Any]:
    return {c: sil.get(c) for c in SIL_COLS}

SKU_RE = re.compile(r"(KA\d{7})", re.I)
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def _category_of(sku: str, cfg: Config) -> str | None:
    """貨號 → 部位。分區依部位而定，長褲與上衣的上三分之一意義完全不同。"""
    info = cfg.category_from_sku(sku) if hasattr(cfg, "category_from_sku") else None
    if isinstance(info, dict):
        code = str(info.get("category_code") or "")
        return {"1": "梭織上衣", "2": "褲", "3": "棉T", "4": "裙",
                "6": "外套", "7": "洋裝", "9": "針織"}.get(code[-1:])
    return None


def run(cfg: Config | None = None, *, limit: int | None = None,
        progress: bool = True) -> pd.DataFrame:
    """掃過系統圖，回傳每一款的設計重點位置與版型屬性。"""
    cfg = cfg or get_config()
    files: list[Path] = []
    for root in cfg.path_list("system_images"):
        if root.exists():
            files += [p for p in root.rglob("*")
                      if p.is_file() and p.suffix.lower() in EXTS
                      and not p.name.startswith(("~$", "."))]
    files.sort()
    if limit:
        files = files[:limit]

    rows: list[dict[str, Any]] = []
    for i, p in enumerate(files, start=1):
        if progress and i % 100 == 0:
            print(f"  定位 {i}/{len(files)}", end="\r", flush=True)
        m = SKU_RE.search(p.stem)
        if not m:
            continue
        sku = m.group(1).upper()
        cat = _category_of(sku, cfg)
        try:
            im = load_rgb(p)
            res = locate(im, cat)
            # 版型與位置量的是同一張圖、同一個遮罩，一起算比較便宜，
            # 而且兩者必須來自同一張圖 —— 分開跑很容易一個用系統圖、
            # 一個用打樣照，屬性就對不起來了。
            sil = ({} if res.get("非衣物")
                   else silhouette.measure(im, cat))
        except Exception:
            continue
        if not res["裝飾"]:
            # 「非衣物」與「素色」要分開記。前者是這張圖不該問位置，
            # 後者是問了、答案是沒有局部設計。混在一起，素色的比例會被
            # 一堆布樣特寫灌水，而位置分析的分母就錯了。
            zone = "非衣物" if res.get("非衣物") else "素色"
            rows.append({"款號": sku, "部位": cat, "image_path": str(p),
                         "分區": zone, "x": None, "y": None,
                         "面積佔衣服": 0.0, "重疊比例": None,
                         "可宣稱": False, "描述": res["描述"],
                         **_sil_cols(sil)})
            continue
        t = res["裝飾"][0]
        rows.append({
            "款號": sku, "部位": cat, "image_path": str(p),
            "分區": t["主要分區"] if t["可宣稱"] else "跨區未定",
            "x": t["x"], "y": t["y"],
            "面積佔衣服": t["面積佔衣服"],
            "寬佔比": t["寬佔比"], "高佔比": t["高佔比"],
            "重疊比例": t["重疊比例"],
            "可宣稱": t["可宣稱"],
            "分區重疊": "、".join(f"{n} {v:.0%}" for n, v in t["分區重疊"]),
            "裝飾塊數": len(res["裝飾"]),
            "描述": res["描述"],
            **_sil_cols(sil),
        })
    if progress:
        print()
    return pd.DataFrame(rows)


def summary(df: pd.DataFrame) -> pd.DataFrame:
    """分區分布 —— 用來檢查有沒有整批倒向某一區（那通常代表規則壞了）。"""
    if df.empty:
        return df
    g = (df.groupby("分區")
           .agg(款數=("款號", "nunique"),
                平均佔比=("面積佔衣服", "mean"),
                可宣稱比例=("可宣稱", "mean"))
           .sort_values("款數", ascending=False)
           .reset_index())
    g["平均佔比"] = g["平均佔比"].round(4)
    g["可宣稱比例"] = g["可宣稱比例"].round(3)
    return g
