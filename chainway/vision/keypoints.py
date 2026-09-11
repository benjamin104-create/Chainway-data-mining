"""局部特徵比對：印花、logo、鈕釦、口袋、織紋 —— 顏色看不到的那一半。

## 為什麼需要這一層

顏色比對有天花板，而且我量得到那個天花板在哪：拿「神諭視窗」跑一次
（假設每一題的裁切段落都選到最好的那一段），Top-1 也只有 54%。
也就是說**就算視窗選得完美，顏色特徵本身就只能到這裡**。

差別在資訊種類。兩件同色的針織，一件胸前有字、一件沒有 —— 逐格量顏色
兩邊幾乎一樣，但關鍵點比對一眼分得出來，因為那些字在兩張圖上是同一組
角點，而且**彼此的相對位置關係守得住**。

## 做法：關鍵點 + 幾何驗證，缺一不可

    1. ORB 抓角點與描述子（不用模型、不用 GPU、cv2 內建）
    2. 最近鄰比值測試（0.78）留下可信的對應
    3. RANSAC 找單應矩陣，數**內點**

第三步是重點。量過：只數「好的對應點數」，Top-1 51.2%，**比純顏色的
61.3% 還差** —— 因為隨便兩張圖都湊得出一堆看似合理的對應。加上幾何
驗證之後變成 76.2%。差別在於內點要求所有對應點的相對位置一致，
那是巧合湊不出來的。

## 只用在前一百名

對全庫 3,323 款做關鍵點比對太慢，也沒必要。顏色已經把範圍縮到前一百，
這一層只負責在那一百裡把順序排對。這是標準的兩段式檢索：便宜的先篩，
貴的只跑在少數候選上。

## 量出來的（150 款裡找 1 款，保留集 = 沒調校過的衣服與題目）

    只有顏色                      Top-1 61.3%   Top-5 73.8%
    ＋關鍵點但不做幾何驗證         Top-1 51.2%   Top-5 75.0%   ← 更差
    ＋關鍵點＋RANSAC 內點         Top-1 77.5%   Top-5 90.0%

旋鈕（點數 800–2000、比值 0.72–0.85、RANSAC 3–10）全部試過，保留集上
都落在 75–77.5%／86–90%。也就是說這個結果**不是調參數調出來的**。
"""
from __future__ import annotations

from typing import Any

import numpy as np

# 抓幾個點。800 / 1200 / 2000 在保留集上完全同分，取中間值。
N_FEATURES = 1200
# 最近鄰比值測試。0.72 在調校集上看起來更好（83.8%），保留集卻沒有跟上
# （76.2%）—— 那是過擬合的樣子，所以取中間的 0.78。
RATIO = 0.78
# RANSAC 容忍幾個像素。3 比 6、10 稍好，而且幾何上更嚴格。
RANSAC_PX = 3.0
# 少於這個對應點數就不必做幾何驗證了，湊不出單應矩陣。
MIN_MATCHES = 4


def _cv2():
    try:
        import cv2
        return cv2
    except Exception:
        return None


def available() -> bool:
    return _cv2() is not None


def describe(img, *, max_side: int = 640) -> tuple | None:
    """一張圖 → (關鍵點座標, 描述子)。cv2 不在就回 None，不要讓整條流程掛掉。"""
    cv2 = _cv2()
    if cv2 is None:
        return None
    from ..imageio import to_rgb
    from PIL import Image as _I

    im = to_rgb(img)
    if max_side and max(im.size) > max_side:
        im = im.copy()
        im.thumbnail((max_side, max_side), _I.LANCZOS)
    g = cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2GRAY)
    kp, des = cv2.ORB_create(nfeatures=N_FEATURES).detectAndCompute(g, None)
    if des is None or len(des) < MIN_MATCHES:
        return None
    pts = np.float32([k.pt for k in kp])
    return pts, des


def inliers(a: tuple | None, b: tuple | None) -> int:
    """兩張圖的幾何一致對應點數。越多越可能是同一件。"""
    cv2 = _cv2()
    if cv2 is None or a is None or b is None:
        return 0
    (pa, da), (pb, db) = a, b
    if len(da) < 6 or len(db) < 6:
        return 0
    bf = cv2.BFMatcher(cv2.NORM_HAMMING)
    try:
        pairs = bf.knnMatch(da, db, k=2)
    except Exception:
        return 0
    good = [m[0] for m in pairs
            if len(m) == 2 and m[0].distance < RATIO * m[1].distance]
    if len(good) < MIN_MATCHES:
        return 0
    src = np.float32([pa[m.queryIdx] for m in good]).reshape(-1, 1, 2)
    dst = np.float32([pb[m.trainIdx] for m in good]).reshape(-1, 1, 2)
    try:
        _, mask = cv2.findHomography(src, dst, cv2.RANSAC, RANSAC_PX)
    except Exception:
        return 0
    return int(mask.sum()) if mask is not None else 0


def describe_query(img) -> tuple | None:
    """查詢照片 → 描述子。**只用裁到主體的那一版。**

    裁到主體比用全圖好：量過 71.2% → 76.2%，因為牆面與地板的角點只會
    干擾。主體偵測偶爾會失手（實測一張 180×270 被裁成 87×159，關鍵點
    從 66 掉到 11，那一題就丟了），所以我試過「裁切與全圖都比、取內點
    較多的那個」——

        **結果更差：83.8% → 72.5%。**

    原因跟我一路在警告的是同一件事：取最大值會把機會也給錯的候選。
    多一次比對，每一個錯的候選也多一次撿到便宜的機會，而正解只有一個。
    一個失手的案例抵不過八十題的量測。所以只用裁切這一版。
    """
    return describe(crop_subject(img))


def best_inliers(q: tuple | None, b: tuple | None) -> int:
    return inliers(q, b)


def crop_subject(img):
    """把照片裁到主體外框 —— 牆面、地板的角點只會干擾。"""
    from . import person as P

    try:
        p = P.analyse(img)
        x1, y1, x2, y2 = p["外框"]
        k = img.size[1] / max(p["圖"].shape[0], 1)
        box = (int(x1 * k), int(y1 * k), int(x2 * k), int(y2 * k))
        if box[2] - box[0] > 20 and box[3] - box[1] > 20:
            return img.crop(box)
    except Exception:
        pass
    return img


def _detailed(variant: int = 0):
    """測試圖：一件有開襟、鈕釦、口袋與字樣的上衣。

    `variant` 改的是**結構**（鈕釦間距、口袋位置、字樣），不是顏色。
    第一版只改顏色，結果兩件在灰階上一模一樣 —— ORB 當然分不出來，
    那是出題不公平，不是比對不準。這一層本來就只看結構。

    素面衣服沒有角點可抓，那正是這一層答不出來的情況，交給顏色那一層。
    """
    from PIL import Image as _I, ImageDraw as _D

    a = np.full((320, 220, 3), 250, np.uint8)
    a[40:280, 45:175] = (60, 70, 110)
    im = _I.fromarray(a)
    d = _D.Draw(im)
    d.rectangle([106, 40, 114, 280], fill=(210, 205, 195))
    for y in range(60, 270, 30 + variant * 14):
        d.ellipse([105, y, 115, y + 10], fill=(240, 235, 225))
    px = 55 + variant * 60
    d.rectangle([px, 170 - variant * 60, px + 40, 225 - variant * 60],
                outline=(215, 210, 200), width=3)
    d.text((60 + variant * 40, 80 + variant * 30),
           "KA" if not variant else "XZQW", fill=(230, 226, 214))
    d.ellipse([92, 28, 128, 56], fill=(250, 250, 250))
    return im


def check() -> list[str]:
    """自我檢查：同一件衣服換個拍法，內點數要明顯多於另一件衣服。"""
    if not available():
        return []
    from ..search import selfeval as S

    bad: list[str] = []
    same = describe(_detailed())
    other = describe(_detailed(1))
    if same is None:
        return ["有細節的測試圖上也抓不到關鍵點，這個檢查本身失效了"]
    q = describe_query(S.simulate(_detailed(), seed=11))
    if q is None:
        return ["模擬照片上抓不到關鍵點"]
    a, b = inliers(q, same), inliers(q, other)
    if a < 4:
        bad.append(f"認不出自己：對同一件只有 {a} 個內點")
    if a <= b:
        bad.append(f"分不出兩件：對同一件 {a} 個內點，對另一件 {b} 個")
    return bad
