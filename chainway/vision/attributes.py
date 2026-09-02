"""一張衣服照 → 一整排屬性：圖案位置、領型、袖長、衣長、顏色。

## 為什麼要合成一支

位置、版型、顏色三個量測本來就各自存在，但分開呼叫有兩個問題。

一是**來源不一致**。分開跑很容易一個吃系統圖、一個吃打樣照，
同一個款號拿到兩件不同衣服的屬性，而且不會有任何錯誤訊息。
這裡強制三個量測共用同一張圖、同一個遮罩。

二是**前提不一致**。位置有閘門（不是整件衣服就不判），版型與顏色沒有。
於是一塊格紋布的「衣長比 2.4」照樣會被寫進表裡。這裡讓閘門管住整排屬性：
不是一件完整的衣服，一個屬性都不給。

## 顏色為什麼要兩條線

量到的顏色會受色光影響 —— 同一件藏青在暖光下量出來偏黑。所以除了
量測值，還帶上貨號裡的色號當對照：

    量測  → LAB → 比對色卡 → 色號 59（藍色偏光黑），ΔE 10.3
    貨號  → KA11510025636 的 56 → 藏青

兩者不一致不代表量錯，也不代表貨號錯，它代表那張照片的色光要校正。
`search.color_validate` 就是靠累積這種不一致來反推校正量的。
表裡兩欄並列，不強行二選一。
"""
from __future__ import annotations

from typing import Any

import numpy as np

from ..imageio import load_rgb
from . import silhouette
from .locate import is_garment_shot, locate


def garment_color(img) -> dict[str, Any]:
    """衣服主色 → LAB 與最接近的色號。

    取衣服像素的中位數而不是最大分群：熊繡花、格紋滾邊都會自成一群，
    分群取最大的那一群在多數情況下是對的，但一件大面積印花的衣服會翻車。
    中位數穩，代價是印花款的「主色」偏向背景布色 —— 那也正是貨號色號
    在講的那個顏色。
    """
    from ..search.colorcode import classify, load_table
    from ..search.palette import _srgb_to_lab, garment_pixels

    px = garment_pixels(img)
    if px is None or len(px) < 30:
        return {"顏色可量測": False}
    lab = _srgb_to_lab(np.median(px, axis=0).reshape(1, 3))[0]
    hit = classify(lab, load_table())
    return {"顏色可量測": True,
            "量測L": round(float(lab[0]), 1),
            "量測a": round(float(lab[1]), 1),
            "量測b": round(float(lab[2]), 1),
            "量測HEX": hit.get("HEX"),
            "量測色號": hit.get("色號"),
            "量測色系": hit.get("色相族"),
            "色號ΔE": hit.get("ΔE2000"),
            "色號依據": hit.get("依據")}


def describe(img, category: str | None = None) -> dict[str, Any]:
    """一張圖 → 一整排屬性。不是一件完整的衣服就整排不給。"""
    ok, why = is_garment_shot(img)
    if not ok:
        return {"可判讀": False, "不判讀原因": why}

    out: dict[str, Any] = {"可判讀": True}
    res = locate(img, category, gate=False)
    out["圖案描述"] = res["描述"]
    if res["裝飾"]:
        t = res["裝飾"][0]
        out.update({
            "圖案位置": t["主要分區"] if t["可宣稱"] else "跨區未定",
            "圖案x": t["x"], "圖案y": t["y"],
            "圖案佔比": t["面積佔衣服"],
            "圖案重疊": t["重疊比例"],
            "圖案可宣稱": t["可宣稱"],
            "圖案塊數": len(res["裝飾"]),
        })
    else:
        out.update({"圖案位置": "素色", "圖案佔比": 0.0,
                    "圖案可宣稱": False, "圖案塊數": 0})

    out.update({k: v for k, v in silhouette.measure(img, category).items()
                if k not in ("可量測", "說明")})
    out.update(garment_color(img))
    return out


def describe_path(path, category: str | None = None) -> dict[str, Any]:
    try:
        return describe(load_rgb(path), category)
    except Exception as exc:
        return {"可判讀": False, "不判讀原因": f"讀不到圖（{type(exc).__name__}）"}


def one_line(a: dict[str, Any]) -> str:
    """給人看的一句話。屬性表最終是要被設計師讀的，不是被程式讀的。"""
    if not a.get("可判讀"):
        return f"不判讀：{a.get('不判讀原因', '')}"
    bits = [x for x in (a.get("領型"), a.get("袖長"), a.get("衣長")) if x]
    shape = "、".join(bits)
    pos = a.get("圖案位置")
    if pos == "素色":
        motif = "素面"
    elif a.get("圖案可宣稱"):
        motif = f"圖案在{pos}（佔 {a.get('圖案佔比', 0):.1%}）"
    else:
        motif = f"圖案跨區未定（x={a.get('圖案x')} y={a.get('圖案y')}）"
    col = (f"，主色近色號 {a['量測色號']}（ΔE {a.get('色號ΔE')}）"
           if a.get("量測色號") else "")
    return f"{shape}；{motif}{col}"
