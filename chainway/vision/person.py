"""從穿搭照裡把「人」與「皮膚」分出來 —— 不要求使用者先裁圖。

## 為什麼這支必須存在

九宮格比對的前提是「這九格量到的是衣服」。穿搭照有臉、頭髮、手臂、腿、
包包、牆面，硬切九格就會拿臉去比袖子。我原本的做法是請使用者先用小畫家
裁乾淨 —— 那是把我的問題丟給他。使用者的原話：「不是叫使用者一直幫你
修圖編圖的。」他是對的。

## 但這裡**不**試圖裁準，那是走不通的路

第一版真的去裁了：去背景、扣皮膚、取最大連通區、再切掉上緣的頭髮。
兩個反例當場把它打掉：

  1. 上衣跟裙子都不是皮膚，它們在腰部相連 → 變成一整塊，框含了裙子。
  2. 米色／裸粉的**衣服**會被皮膚偵測吃掉 → 框只剩下裙子，上衣整件消失。

每多一條裁切規則就多一個反例。所以這支只做兩件**站得住**的事：

    人在哪裡   前景（離邊框背景色夠遠）的最大連通區域
    皮膚在哪裡 YCbCr 的老方法，臉、手臂、腿都落在同一個窄區間

「衣服在人身上的哪一段」不猜 —— 交給 `grid.photo_signatures` 在這個人
身上**滑動視窗**，讓比對自己找出最像的那一段。裁不準沒關係，因為根本
不需要裁準。

## 皮膚為什麼只扣像素、不扣框

扣掉皮膚像素是為了讓「半格是手臂」的格子不要把手臂的顏色平均進去。
但整件米色上衣也會被判成皮膚，所以**扣皮膚只在格子層級做，而且有保險**：
一格扣完皮膚剩不到三成，就當這格的衣服本來就是膚色，改用全部前景像素。
寧可量到一點手臂，也不要把整件米色衣服變成「沒有資料」。
"""
from __future__ import annotations

from typing import Any

import numpy as np

from .locate import BG_TOL, _label, _to_array

# 皮膚在 YCbCr 的範圍。放寬到涵蓋不同膚色與室內黃光 ——
# 這裡寧可多判一點皮膚，因為下游有「剩太少就不扣」的保險。
CR_LO, CR_HI = 133.0, 182.0
CB_LO, CB_HI = 74.0, 132.0
SKIN_Y_MIN = 55.0


def skin_mask(a: np.ndarray) -> np.ndarray:
    """YCbCr 皮膚偵測。`a` 是 float RGB 陣列。"""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    y = 0.299 * r + 0.587 * g + 0.114 * b
    cb = 128.0 - 0.168736 * r - 0.331264 * g + 0.5 * b
    cr = 128.0 + 0.5 * r - 0.418688 * g - 0.081312 * b
    return ((cr >= CR_LO) & (cr <= CR_HI) & (cb >= CB_LO) & (cb <= CB_HI)
            & (y >= SKIN_Y_MIN))


def _close(mask: np.ndarray, r: int = 3) -> np.ndarray:
    """把細縫補起來再取最大區域。

    為什麼需要：一條淺色門襟、一個亮色口袋、一道印花，都會把衣服的前景
    遮罩**從中間切成兩塊**，接著「取最大連通區域」就只拿到半邊。實測一張
    有門襟的上衣，框出來只有 56 像素寬（全寬 206），關鍵點整個抓不到。

    膨脹再侵蝕，r 像素以內的縫會被接起來，外框不變胖。
    """
    try:
        from scipy import ndimage
        return ndimage.binary_closing(mask, np.ones((r * 2 + 1, r * 2 + 1)))
    except Exception:
        pass
    # 沒有 scipy 就用位移取聯集／交集，效果一樣，只是慢一點。
    def shift_or(m, k):
        out = m.copy()
        for dy in range(-k, k + 1):
            for dx in range(-k, k + 1):
                out |= np.roll(np.roll(m, dy, 0), dx, 1)
        return out

    def shift_and(m, k):
        out = m.copy()
        for dy in range(-k, k + 1):
            for dx in range(-k, k + 1):
                out &= np.roll(np.roll(m, dy, 0), dx, 1)
        return out

    return shift_and(shift_or(mask, r), r)


def _largest(mask: np.ndarray) -> np.ndarray:
    lab = _label(mask)
    if lab.max() == 0:
        return mask
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    return lab == int(sizes.argmax())


def analyse(img) -> dict[str, Any]:
    """穿搭照 → 人的遮罩、外框、皮膚遮罩（都在縮圖座標上）。

    一定回傳 `說明`，因為這一步會錯，錯的時候要看得出來錯在哪。
    """
    a = _to_array(img)
    h, w = a.shape[:2]
    r = max(3, min(h, w) // 40)
    ring = np.concatenate([a[:r].reshape(-1, 3), a[-r:].reshape(-1, 3),
                           a[:, :r].reshape(-1, 3), a[:, -r:].reshape(-1, 3)])
    bg = np.median(ring, axis=0)
    fg = np.linalg.norm(a - bg, axis=2) > BG_TOL
    skin = skin_mask(a)

    if fg.sum() < 0.02 * fg.size:
        return {"人": np.ones((h, w), bool), "外框": (0, 0, w, h),
                "皮膚": skin, "圖": a, "尺寸": (w, h),
                "說明": "整張跟邊框同色，當成整張都是主體"}

    m = _largest(_close(fg)) & fg
    ys, xs = np.nonzero(m)
    box = ((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
           if len(ys) >= 50 else (0, 0, w, h))
    frac = float(m.mean())
    note = []

    # 抓不到主體時**退回整張圖**，不要回一個空手。
    #
    # 為什麼：背景色是拿邊框中位數推的，衣服顏色一旦接近背景就整片低於
    # 門檻。白襯衫拍在白牆前就是這樣 —— 實測一張只框到全圖的 2.5%
    # （90×17 像素），整個比對直接放棄，退化成只比主色。
    # 框錯一點還有滑動視窗可以救，完全不框就什麼都沒有了。
    small = (x2_ := box[2] - box[0]) < 0.15 * w or (box[3] - box[1]) < 0.15 * h
    if frac < 0.08 or small:
        note.append(f"抓不到主體（只有全圖的 {frac:.0%}），"
                    "衣服顏色可能接近背景 —— 改用整張圖比對")
        m = np.ones((h, w), bool)
        box = (0, 0, w, h)
        frac = 1.0
    elif frac > 0.85:
        note.append("主體佔滿全圖，背景可能跟衣服同色")
    return {"人": m, "外框": box, "皮膚": skin & m, "圖": a, "尺寸": (w, h),
            "主體佔比": round(float(frac), 3),
            "皮膚佔主體": round(float((skin & m).sum() / max(m.sum(), 1)), 3),
            "說明": "；".join(note) or "抓到主體"}


def _person(garment=(41, 37, 61), skin=(214, 168, 140), bg=(236, 236, 232),
            stripe=False, skirt=(60, 60, 66)):
    """造一張測試用穿搭照：牆、頭髮、頭、脖子、上衣、兩隻手臂、裙、兩條腿。"""
    from PIL import Image as _I

    a = np.full((400, 240, 3), bg, np.uint8)
    a[12:34, 92:148] = (40, 32, 28)
    a[20:70, 95:145] = skin
    a[70:85, 108:132] = skin
    a[85:210, 70:170] = garment
    if stripe:
        a[135:160, 70:170] = (205, 185, 180)
    a[95:200, 52:70] = skin
    a[95:200, 170:188] = skin
    a[210:270, 78:162] = skirt
    a[270:385, 88:114] = skin
    a[270:385, 126:152] = skin
    return _I.fromarray(a)


def check() -> list[str]:
    """自我檢查。要守住的是這支**該做**的兩件事，不是它刻意不做的那件。"""
    bad: list[str] = []
    r = analyse(_person())
    x1, y1, x2, y2 = r["外框"]
    W, H = r["尺寸"]
    k = H / 400.0

    # 人的外框要從頭髮蓋到腳，不多不少（背景不該被framed進來）
    if y1 > 20 * k + 0.04 * H:
        bad.append(f"上緣 {y1} 太低，頭髮沒被framed到")
    if y2 < 380 * k - 0.05 * H:
        bad.append(f"下緣 {y2} 太高，腿沒被framed到")
    if x1 < 0.05 * W and x2 > 0.95 * W:
        bad.append("左右框到整張圖寬，背景被當成人了")

    # 皮膚要抓到臉與四肢，但不能把深藏青上衣也算進去
    skin = r["皮膚"]
    face = skin[int(30 * k):int(65 * k), int(100 * k):int(140 * k)]
    top = skin[int(100 * k):int(200 * k), int(85 * k):int(155 * k)]
    if face.mean() < 0.7:
        bad.append(f"臉只有 {face.mean():.0%} 被判成皮膚")
    if top.mean() > 0.1:
        bad.append(f"藏青上衣有 {top.mean():.0%} 被誤判成皮膚")
    return bad
