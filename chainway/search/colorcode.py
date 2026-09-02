"""用貴司的兩位數色號判讀顏色。

## 為什麼這套色號比一般色卡好用

十位是色相族、個位是調子。這個結構本身帶資訊：56 與 57 必定是同一族的
相鄰調子，不查表就知道它們接近；56 與 26 必定差很遠。平鋪的色卡
（一串沒有規律的編號）沒有這個性質，只能一個一個比。

於是判讀可以拆成兩件難度差很多的事：

    色相族（十位）  從照片判很穩。紅就是紅，光線再偏也不會變成綠
    調子（個位）    要看 L* 與 C*，而這兩個正是最容易被光線與相機影響的

分開報，人才知道哪一半能信。合成一個「色號 56」然後不講信心度，
等於把不確定藏起來。

## 目前的限制，講在前面

色號表的每一格還沒有實際的 L*a*b* 值（config/color_codes.yaml 裡是空的）。
我刻意不從色卡照片取值：那張照片有明顯的光線漸層，同一列的「水藍」
量出來是 #ABB8C3 —— 一個灰藍，那是紙面反光，不是色票的顏色。
拿它當基準，誤差會大過相鄰調子之間的差距，ΔE 就沒有意義了。

所以現在的行為是：

    有填實際值的色號  → 用 ΔE2000 比對，報色號與色差
    沒填的            → 只報色相族與推測的調子，並標明是推測

寧可少報一層，也不要拿猜的值冒充規格。
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import yaml

from .colorcard import delta_e_2000, hex_to_lab, lab_to_hex

# 調子的 (L*, C*) 中心點。依色號表的欄位名稱（淡／淺／明／明亮／明灰／
# 純色／深色／濁色／暗色／偏光黑）訂出，不是量出來的 —— 所以判讀時
# 只當成「最接近的調子」，並一併回報第二名，讓人知道它在邊界上。
TONE_ANCHORS: dict[str, tuple[float, float]] = {
    "0": (86, 20),   # 淡：很亮、彩度低
    "1": (75, 35),   # 淺
    "2": (67, 57),   # 明
    "3": (56, 70),   # 明亮：彩度最高的亮色
    "4": (71, 21),   # 明灰：亮但帶灰
    "5": (50, 74),   # 純色
    "6": (37, 56),   # 深色
    "7": (41, 27),   # 濁色
    "8": (27, 38),   # 暗色
    "9": (17, 16),   # 偏光黑
}
# 無色族（8）的調子只由明度決定，彩度一律接近 0
ACHROMATIC_L: dict[str, float] = {
    "0": 96, "1": 88, "2": 82, "3": 66, "4": 58,
    "5": 45, "6": 38, "7": 31, "8": 18, "9": 10,
}


def load_table(path: str | Path | None = None) -> dict[str, Any]:
    """讀色號表。預設讀 config/color_codes.yaml。"""
    if path is None:
        path = Path(__file__).resolve().parents[2] / "config" / "color_codes.yaml"
    with open(path, encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def _lab_of(entry: dict[str, Any]) -> np.ndarray | None:
    """某一格有沒有填實際顏色值。沒有就回 None —— 不補、不猜。"""
    if not isinstance(entry, dict):
        return None
    lab = entry.get("lab")
    if isinstance(lab, (list, tuple)) and len(lab) == 3:
        return np.array([float(v) for v in lab])
    if entry.get("hex"):
        return hex_to_lab(entry["hex"])
    return None


def family_of(lab: np.ndarray, table: dict[str, Any]) -> tuple[str, str, float]:
    """LAB → (十位數, 族名, 信心 0-1)。

    信心來自「離族邊界多遠」：色相落在區間正中央就有把握，
    貼著邊界（例如紅與橘之間）就該說出來，而不是硬選一邊。
    """
    L, A, B = float(lab[0]), float(lab[1]), float(lab[2])
    chroma = float(np.hypot(A, B))
    hue = float(np.degrees(np.arctan2(B, A)) % 360)
    fams = table["families"]

    ach = fams["8"]
    if chroma < float(ach.get("max_chroma", 12)):
        # 越接近純灰越確定；貼著門檻就不確定
        conf = min(1.0, (ach["max_chroma"] - chroma) / ach["max_chroma"] + 0.25)
        return "8", ach["name"], round(conf, 2)

    # 茶色要先判：它是低彩度低明度的橘黃，不先攔就會被歸成橘色
    brown = fams["7"]
    lo, hi = brown["hue_deg"]
    if (lo <= hue <= hi and chroma <= brown["max_chroma"]
            and L <= brown["max_lightness"]):
        margin = min(chroma / brown["max_chroma"], L / brown["max_lightness"])
        return "7", brown["name"], round(min(1.0, 1.35 - margin), 2)

    for key in ("1", "2", "3", "4", "5", "6"):
        f = fams[key]
        lo, hi = f["hue_deg"]
        inside = (lo <= hue < hi) or (key == "1" and (hue >= 358 or hue < 10))
        if inside:
            span = hi - lo
            centre = (lo + hi) / 2
            conf = 1.0 - min(1.0, abs(hue - centre) / (span / 2)) * 0.5
            return key, f["name"], round(conf, 2)
    return "1", fams["1"]["name"], 0.4


def tone_of(lab: np.ndarray, family: str) -> tuple[str, str, float]:
    """LAB + 色相族 → (個位數, 調子名, 信心)。

    信心是「最接近與次接近的差距」。兩個調子一樣近時信心低 ——
    那就是實話，因為調子本來就是最受光線影響的一半。
    """
    L, A, B = float(lab[0]), float(lab[1]), float(lab[2])
    C = float(np.hypot(A, B))
    if family == "8":
        d = {k: abs(L - v) for k, v in ACHROMATIC_L.items()}
    else:
        d = {k: float(np.hypot(L - aL, C - aC))
             for k, (aL, aC) in TONE_ANCHORS.items()}
    order = sorted(d, key=lambda k: d[k])
    best, second = order[0], order[1]
    gap = d[second] - d[best]
    conf = round(min(1.0, gap / 18.0), 2)
    return best, second, conf


def classify(lab: np.ndarray, table: dict[str, Any] | None = None) -> dict[str, Any]:
    """LAB → 色號判讀。有填實際值就用 ΔE2000 比對，沒有就報推測。"""
    table = table or load_table()
    fam, fam_name, fam_conf = family_of(lab, table)
    codes = table.get("codes", {})

    # 有實際色值時，比對整張色卡而不是先用色相猜的族篩一次。
    # 先篩會出事：軍綠(45)的色相落在黃色區，用色相族當閘門就永遠比不到
    # 綠色那一列，把自己的色票餵回去都會答錯（實測 64%）。
    # 色相族是「沒有色值時的退路」，不該凌駕於真正的量測之上。
    measured = {c: _lab_of(e) for c, e in codes.items()
                if _lab_of(e) is not None}

    out: dict[str, Any] = {
        "HEX": lab_to_hex(lab),
        "L*": round(float(lab[0]), 1),
        "a*": round(float(lab[1]), 1),
        "b*": round(float(lab[2]), 1),
        "色相族": f"{fam} {fam_name}",
        "色相族信心": fam_conf,
    }

    if table["families"][fam].get("metallic"):
        out["判讀"] = "金屬色，單一色值無法代表，不做比對"
        return out

    if measured:
        cands = sorted(measured, key=lambda c: float(
            delta_e_2000(lab, measured[c].reshape(1, 3))[0]))
        best = cands[0]
        de = float(delta_e_2000(lab, measured[best].reshape(1, 3))[0])
        out["色號"] = best
        # 族別以比對到的色號為準，不是色相猜的那個
        fam_of_best = table["families"].get(best[0], {})
        out["色相族"] = f"{best[0]} {fam_of_best.get('name', '')}".strip()
        out["名稱"] = codes[best].get("zh") or codes[best].get("en") or ""
        out["ΔE2000"] = round(de, 2)
        out["依據"] = "比對色卡實際值"
        out["其他候選"] = "、".join(
            f"{c}(ΔE{float(delta_e_2000(lab, measured[c].reshape(1,3))[0]):.1f})"
            for c in cands[1:3])
        return out

    tone, second, tone_conf = tone_of(lab, fam)
    code = fam + tone
    alt = fam + second
    out["推測色號"] = code
    out["名稱"] = codes.get(code, {}).get("zh") or codes.get(code, {}).get("en") or ""
    out["次接近"] = f"{alt} {codes.get(alt, {}).get('zh', '')}".strip()
    # 這個數字只反映「最接近與次接近差多少」，沒有拿實際資料校準過。
    # 實測就看得出問題：藏青被判成暗藍，而它還給了 0.75。
    # 有把握卻答錯比沒把握答錯更糟，所以欄名要講清楚它未經校準。
    out["調子分離度_未校準"] = tone_conf
    out["依據"] = ("推測 —— 色卡尚未填實際色值。色相族可信，"
                  "調子只是依欄位語意推算，尚未用實際色值驗證過")
    return out


def coverage(table: dict[str, Any] | None = None) -> dict[str, Any]:
    """色卡填了多少 —— 讓人知道現在的判讀有多少是比對、多少是推測。"""
    table = table or load_table()
    codes = table.get("codes", {})
    named = {c: e for c, e in codes.items()
             if (e.get("zh") or e.get("en"))}
    filled = {c for c, e in codes.items() if _lab_of(e) is not None}
    return {"色號總數": len(codes), "有名稱的": len(named),
            "已填實際色值": len(filled),
            "填寫率": round(len(filled) / max(len(named), 1), 3)}
