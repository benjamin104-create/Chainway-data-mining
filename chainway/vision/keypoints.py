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


def describe_query(img, *, max_side: int = 900, drop_head: float = 0.18
                   ) -> tuple | None:
    """查詢照片 → 描述子。**只在衣服上抓，而且要在夠高的解析度上抓。**

    ## 兩件事都是拿真照片換來的

    **一、臉和頭髮會把比對帶歪。** 目錄圖是同一個模特兒拍的，整張圖抓
    關鍵點等於在比對**她本人**。實測四張真穿搭照，兩套完全不同的衣服
    之間有 54–63 個「幾何一致」的內點 —— 那是她的臉和髮絲，不是衣服。
    改成只在「人的遮罩扣掉皮膚、再切掉頭部那一段」裡抓之後，同樣兩張
    掉到 0–5。

    **二、遮罩要放大回高解析度再抓。** 第一次修正時我直接在 320px 的
    分析縮圖上抓，結果連自己對自己都只剩 0 個內點（原本 429）——
    ORB 需要細節，320px 上根本沒有角點可抓。遮罩在縮圖上算、放大到
    900px 再抓，自己對自己回到 177–1,422。

    系統圖（白底去背的單件）不要用這支，用 `describe` —— 那種圖整張
    都是衣服，沒有臉也沒有背景要排除。
    """
    import numpy as np
    from PIL import Image as _I

    cv2 = _cv2()
    if cv2 is None:
        return None
    from ..imageio import to_rgb
    from . import person as P

    im = to_rgb(img)
    try:
        p = P.analyse(im)
        m, sk = p["人"], p["皮膚"]
        x1, y1, x2, y2 = p["外框"]
        # 沒有頭就不要切頭。平拍商品照、合成圖都沒有人，硬切等於把衣服
        # 上緣 18% 丟掉 —— 實測合成測試因此掉了 5 個百分點。
        # **沒抓到人就整張圖照舊，一個像素都不遮。**
        #
        # 這一條是量出來的，而且代價很大。遮罩只在「照片裡有模特兒」時
        # 才划算：
        #
        #   有人（真穿搭照）  非遮不可。不遮的話比對的是**模特兒本人** ——
        #                     實測兩套完全不同的衣服之間冒出 54–63 個
        #                     幾何一致的內點，那是她的臉和髮絲。遮掉之後
        #                     降到 0–5，真訊號（自己對自己）還留著。
        #
        #   沒人（平拍商品照、合成圖）
        #                     遮了只有損失。衣服的**輪廓角點**落在衣服與
        #                     背景的交界上，遮罩一蓋就沒了；而那裡本來
        #                     就沒有臉要排除。實測 Top-1 從 85.0% 掉到
        #                     73.8%，整整 11 個百分點。
        # 退回原本的做法：裁到主體再抓（量過 71.2% → 76.2%），
        # 不是整張圖 —— 這個退路我第一次寫錯過，直接掉 15 個百分點。
        if not p.get("有人"):
            return describe(crop_subject(im))
        y0 = y1 + int((y2 - y1) * drop_head)
        small = m[y0:y2, x1:x2] & ~sk[y0:y2, x1:x2]
        if small.size == 0 or small.sum() < 200:
            return describe(crop_subject(im))
        big = im.copy()
        if max(big.size) > max_side:
            big.thumbnail((max_side, max_side), _I.LANCZOS)
        A = np.asarray(big)
        k = A.shape[0] / m.shape[0]
        box = (int(x1 * k), int(y0 * k), int(x2 * k), int(y2 * k))
        sub = A[box[1]:box[3], box[0]:box[2]]
        if sub.size == 0:
            return describe(crop_subject(im))
        mk = np.asarray(_I.fromarray((small * 255).astype(np.uint8))
                        .resize((sub.shape[1], sub.shape[0]), _I.NEAREST))
        g = cv2.cvtColor(sub, cv2.COLOR_RGB2GRAY)
        kp, des = cv2.ORB_create(nfeatures=N_FEATURES).detectAndCompute(g, mk)
        if des is None or len(des) < MIN_MATCHES:
            return describe(crop_subject(im))
        return np.float32([q.pt for q in kp]), des
    except Exception:
        return describe(crop_subject(img))


def strength(q: tuple | None, b: tuple | None) -> float:
    """**不要用這支排序。** 留著是為了記住一個被量測打掉的想法。

    想法：內點數 ÷ 兩邊較少的關鍵點數，問「看得到的細節裡對上幾成」。
    動機是真的 —— 內點的絕對數量跟「這件衣服有多少細節」綁在一起，
    真資料上同一條灰丹寧熊裙有 172–192 個內點，同一條格紋荷葉裙只有
    32–36，而雜訊底是 5–17。

    真資料 11 題上它確實好看：Top-1 55% → 64%。**但合成測試 160 題上
    是災難：一般 76.2% → 61.3%，嚴苛 68.8% → 30.0%。**

    原因很清楚：分母是較少的那一方，素面款的關鍵點本來就少，分母一小
    分數就虛高，整批素面浮到前面。11 題的 9 個百分點是雜訊，160 題的
    38 個百分點不是。所以排序一律用原始內點數。
    """
    v = inliers(q, b)
    if not v:
        return 0.0
    return v / max(min(len(q[1]), len(b[1])), 1)


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
