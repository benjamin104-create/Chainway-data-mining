"""色號比對：把量到的顏色對到「你們實際在用的色號」，並報出色差。

## 為什麼要有這一層

上一版我用自己編的色系表（藍／紅／卡其…）。那是我發明的詞彙，
不是貴司在用的東西 —— 設計端與布廠溝通講的是色號，不是「藍色」。
「藍」可以是深藍、寶藍、丈青、藏青，做出來完全不同件衣服。

所以正確的做法是：**比對的基準來自你們的色卡，不是我的想像**。
系統只負責兩件事 —— 從照片量出客觀的顏色值，以及算出它離色卡上
每一個色號有多遠。哪個色號叫什麼名字、公司用不用它，是你們的資料。

## 色差用 ΔE2000，因為那是紡織業在用的

RGB 距離跟人眼看到的差異對不上。LAB 好一些，但仍然在藍色區高估、
在灰色區低估。CIEDE2000 是為了修正這些偏差而訂的，也是紡織品色差
驗收的標準。既然要對色號，就用對色號的那把尺。

實務上的判讀（紡織業常見的門檻）：

    ΔE < 1     肉眼幾乎看不出差別
    ΔE 1–2     細看才看得出來
    ΔE 2–3.5   一般人看得出來，多數成衣可接受
    ΔE > 5     明顯不同色

從照片量色會比實際布料量色不準（相機、光線、螢幕都會偏），
所以照片比對別用 ΔE<1 這種等級當門檻。這裡回傳 ΔE 讓人自己判斷，
不替使用者訂可接受範圍 —— 那是品管的決定，不是程式的。

## 沒有色卡時

不猜。回傳客觀值（HEX 與 LAB）＋ 一個粗略的色系名稱，並註明色系名稱
只是為了讀起來方便，不是規格。要精確就把色卡給我。
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Sequence

import numpy as np
import pandas as pd

from .palette import _srgb_to_lab, color_family

# 色卡檔可以用這些欄名，大小寫與中英文都接受
CODE_COLS = ["色號", "colour_code", "color_code", "code", "pantone", "編號"]
NAME_COLS = ["色名", "顏色", "colour", "color", "name", "名稱"]
HEX_COLS = ["hex", "HEX", "色碼", "rgb_hex", "十六進位"]
LAB_COLS = {"L": ["L", "L*", "l", "lab_l"], "a": ["a", "a*", "lab_a"],
            "b": ["b", "b*", "lab_b"]}


def _pick(df: pd.DataFrame, names: Sequence[str]) -> str | None:
    lower = {str(c).strip().lower(): c for c in df.columns}
    for n in names:
        if n.strip().lower() in lower:
            return lower[n.strip().lower()]
    return None


def hex_to_lab(value: str) -> np.ndarray | None:
    s = str(value).strip().lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    if len(s) != 6:
        return None
    try:
        rgb = np.array([[int(s[i:i + 2], 16) for i in (0, 2, 4)]], dtype=float)
    except ValueError:
        return None
    return _srgb_to_lab(rgb)[0]


def lab_to_hex(lab: Sequence[float]) -> str:
    """LAB → #RRGGBB，用來把量到的顏色顯示成色塊。"""
    L, a, b = float(lab[0]), float(lab[1]), float(lab[2])
    fy = (L + 16) / 116
    fx, fz = fy + a / 500, fy - b / 200
    f = lambda t: t ** 3 if t ** 3 > 0.008856 else (t - 16 / 116) / 7.787
    xyz = np.array([f(fx) * 0.95047, f(fy), f(fz) * 1.08883])
    m = np.array([[3.2406, -1.5372, -0.4986],
                  [-0.9689, 1.8758, 0.0415],
                  [0.0557, -0.2040, 1.0570]])
    rgb = xyz @ m.T
    rgb = np.where(rgb <= 0.0031308, 12.92 * rgb, 1.055 * np.abs(rgb) ** (1 / 2.4) - 0.055)
    return "#" + "".join(f"{int(round(v * 255)):02X}" for v in np.clip(rgb, 0, 1))


def delta_e_2000(lab1: Sequence[float], lab2: np.ndarray) -> np.ndarray:
    """CIEDE2000 色差。lab2 可以是 (N,3)，一次算完整張色卡。

    公式照 CIE 技術報告實作。看起來繁瑣，但每一項都有它要修正的偏差，
    自己簡化就不再是 ΔE2000 了 —— 那會讓「色差 2.3」這個數字失去它
    在紡織業裡本來的意義。
    """
    lab1 = np.asarray(lab1, dtype=float).reshape(1, 3)
    lab2 = np.atleast_2d(np.asarray(lab2, dtype=float))
    L1, a1, b1 = lab1[:, 0], lab1[:, 1], lab1[:, 2]
    L2, a2, b2 = lab2[:, 0], lab2[:, 1], lab2[:, 2]

    C1, C2 = np.hypot(a1, b1), np.hypot(a2, b2)
    Cbar = (C1 + C2) / 2
    G = 0.5 * (1 - np.sqrt(Cbar ** 7 / (Cbar ** 7 + 25.0 ** 7)))
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = np.hypot(a1p, b1), np.hypot(a2p, b2)
    h1p = np.degrees(np.arctan2(b1, a1p)) % 360
    h2p = np.degrees(np.arctan2(b2, a2p)) % 360

    dLp = L2 - L1
    dCp = C2p - C1p
    dhp = h2p - h1p
    dhp = np.where(C1p * C2p == 0, 0,
                   np.where(dhp > 180, dhp - 360,
                            np.where(dhp < -180, dhp + 360, dhp)))
    dHp = 2 * np.sqrt(C1p * C2p) * np.sin(np.radians(dhp / 2))

    Lbp = (L1 + L2) / 2
    Cbp = (C1p + C2p) / 2
    hsum, hdiff = h1p + h2p, np.abs(h1p - h2p)
    hbp = np.where(C1p * C2p == 0, hsum,
                   np.where(hdiff <= 180, hsum / 2,
                            np.where(hsum < 360, (hsum + 360) / 2, (hsum - 360) / 2)))

    T = (1 - 0.17 * np.cos(np.radians(hbp - 30))
         + 0.24 * np.cos(np.radians(2 * hbp))
         + 0.32 * np.cos(np.radians(3 * hbp + 6))
         - 0.20 * np.cos(np.radians(4 * hbp - 63)))
    dTheta = 30 * np.exp(-(((hbp - 275) / 25) ** 2))
    Rc = 2 * np.sqrt(Cbp ** 7 / (Cbp ** 7 + 25.0 ** 7))
    Sl = 1 + (0.015 * (Lbp - 50) ** 2) / np.sqrt(20 + (Lbp - 50) ** 2)
    Sc = 1 + 0.045 * Cbp
    Sh = 1 + 0.015 * Cbp * T
    Rt = -np.sin(np.radians(2 * dTheta)) * Rc

    return np.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2
                   + Rt * (dCp / Sc) * (dHp / Sh))


def load_card(path: str | Path) -> pd.DataFrame:
    """讀色卡。接受 CSV 或 Excel，欄位可以是 HEX 或 L/a/b。

    回傳含 色號 / 色名 / L / a / b 的表。欄名認得中英文常見寫法，
    因為色卡多半是別人給的檔案，不該要求先整理成特定格式。
    """
    p = Path(path)
    df = (pd.read_excel(p) if p.suffix.lower() in (".xls", ".xlsx", ".xlsm")
          else pd.read_csv(p))
    if df.empty:
        raise ValueError(f"色卡是空的：{p}")

    code = _pick(df, CODE_COLS)
    if code is None:
        raise ValueError(
            f"色卡缺少色號欄。可接受的欄名：{'、'.join(CODE_COLS)}\n"
            f"目前的欄位：{'、'.join(map(str, df.columns))}")
    name = _pick(df, NAME_COLS)
    hexc = _pick(df, HEX_COLS)
    lcol = _pick(df, LAB_COLS["L"])
    acol = _pick(df, LAB_COLS["a"])
    bcol = _pick(df, LAB_COLS["b"])

    rows = []
    for _, r in df.iterrows():
        lab = None
        if lcol and acol and bcol:
            try:
                lab = np.array([float(r[lcol]), float(r[acol]), float(r[bcol])])
            except (TypeError, ValueError):
                lab = None
        if lab is None and hexc:
            lab = hex_to_lab(r[hexc])
        if lab is None:
            continue                       # 這一列沒有可用的顏色值，跳過而不是猜
        rows.append({"色號": str(r[code]).strip(),
                     "色名": str(r[name]).strip() if name else "",
                     "L": lab[0], "a": lab[1], "b": lab[2]})
    out = pd.DataFrame(rows)
    if out.empty:
        raise ValueError(
            f"色卡裡沒有任何一列有可用的顏色值。\n"
            f"需要 HEX 欄（例如 #A82E34）或 L/a/b 三欄。")
    return out


def match(lab: Sequence[float], card: pd.DataFrame, top: int = 3) -> pd.DataFrame:
    """量到的顏色 → 色卡上最接近的幾個色號，附 ΔE2000。"""
    ref = card[["L", "a", "b"]].to_numpy(dtype=float)
    de = delta_e_2000(lab, ref)
    order = np.argsort(de)[:top]
    out = card.iloc[order][["色號", "色名"]].copy()
    out.insert(2, "ΔE2000", np.round(de[order], 2))
    out.insert(3, "色卡HEX", [lab_to_hex(ref[i]) for i in order])
    out.insert(4, "判讀", [_verdict(d) for d in de[order]])
    return out.reset_index(drop=True)


def _verdict(de: float) -> str:
    if de < 1:
        return "幾乎一致"
    if de < 2:
        return "細看才有差"
    if de < 3.5:
        return "看得出差異"
    if de < 5:
        return "明顯有差"
    return "不同色"


def measure(img, card: pd.DataFrame | None = None, n_colors: int = 3,
            top: int = 3) -> list[dict[str, Any]]:
    """一張圖 → 每個主色的客觀值，有色卡就一併給最接近的色號。

    沒有色卡時不假裝知道色號，只給 HEX 與 LAB（那是量出來的事實），
    外加一個粗略色系名稱方便閱讀，並在欄名上標明它只是概略。
    """
    from .palette import palette

    out = []
    for lab, weight in palette(img, n_colors):
        rec: dict[str, Any] = {
            "佔比": round(float(weight), 3),
            "HEX": lab_to_hex(lab),
            "L*": round(float(lab[0]), 1),
            "a*": round(float(lab[1]), 1),
            "b*": round(float(lab[2]), 1),
            "概略色系": color_family(lab),
        }
        if card is not None and len(card):
            m = match(lab, card, top=top)
            rec["最接近色號"] = m.iloc[0]["色號"]
            rec["ΔE2000"] = float(m.iloc[0]["ΔE2000"])
            rec["判讀"] = m.iloc[0]["判讀"]
            rec["其他候選"] = "、".join(
                f"{r['色號']}(ΔE{r['ΔE2000']})" for _, r in m.iloc[1:].iterrows())
        out.append(rec)
    return out
