"""從衣服的輪廓量出版型屬性：領型、袖長、衣長、肩型。

## 為什麼不用 CLIP 問

CLIP 可以零樣本回答「這是圓領還是 V 領」，但它給的是一個信心分數，
分數低的時候你不知道是模型不確定、還是圖片不清楚、還是這件衣服本來就
介於兩者之間。分數也不可稽核 —— 說錯了，沒有中間值可以拿出來看。

領型、袖長、衣長本質上是**幾何**，不是語意：

    領型   輪廓最上緣中間那個缺口有多深、多寬
    袖長   肩線到最寬處（袖口）的距離
    衣長   肩線到下擺的距離
    肩型   最寬處與身寬的落差

四個比例的分母一律是**身寬**。身寬是這張圖裡唯一與領、袖都無關的尺標：
拍遠拍近會變的是像素，比例不會；換一件有袖的同版型，肩寬會變，身寬不會。

幾何量得出數字，數字可以印在覆核表上讓人指著說「這件不對」。
CLIP 留給它真正擅長的：那塊繡花「是什麼」（熊？格紋？字母？）。

## 一律回傳量到的數值，不只回傳標籤

`領型 = "V領"` 這種輸出沒辦法否定。所以每一個屬性都同時回傳
原始比例（缺口深度佔身寬多少）與判定門檻，覆核表把兩者並列。
先前「熊在口袋」那次的教訓就是：結論看起來合理、數據也對，
但中間那一步的定義沒攤開來，於是沒有人能指出它哪裡不對。

## 適用範圍

只在「一件完整的衣服、看得到輪廓」時有意義，跟 `locate` 同一個前提。
呼叫端要先過 `locate.is_garment_shot`。下身（褲、裙）沒有領與袖，
這支只處理上衣與洋裝。

## 門檻校準到什麼程度

袖長與領型的門檻是在九款合成衣（無袖／蓋袖／短袖／七分／長袖 ×
圓領／深 V／一字／高領／大開領）上校準的，九款全中；再拿一件真實的
海軍藍短袖圓領 T 驗，領型、袖長、衣長三項都對。

**衣長的門檻只有那一件真衣服當錨點。** 合成衣是照固定比例畫的，
不能代表真實版型的長短分布。所以 `衣長` 這一欄目前應該當成「比例值」看，
標籤（短版／正常／長版）要等跑過真實影像庫、看過覆核表才算數。
"""
from __future__ import annotations

from typing import Any

import numpy as np

from .locate import garment_mask

# 領口缺口的門檻，單位一律是「佔**身寬**的比例」。
#
# 分母是身寬而不是肩寬。肩寬會隨袖子變動 —— 同一個圓領，有袖時肩寬 144、
# 無袖時 110，同一個缺口就從 0.125 變成 0.164，於是無袖那件被判成「大開領」。
# 身寬與領子無關，是這張圖裡唯一穩定的尺標。
NECK_HIGH = 0.15          # 缺口窄於身寬這個比例 → 高領／密合
NECK_DEEP = 0.26          # 深過這個算深領（V／U）
NECK_SHALLOW = 0.09       # 淺於這個且很寬 → 一字領／船領
NECK_WIDE = 0.62          # 缺口寬度超過身寬這個比例算寬領

# 袖長，單位是「袖子長度佔衣長的比例」
SLEEVE_NONE = 0.06        # 幾乎沒有外伸 → 無袖／背心
SLEEVE_CAP = 0.16         # 蓋袖
SLEEVE_SHORT = 0.34       # 短袖
SLEEVE_MID = 0.55         # 五分～七分
# 最寬處要超過身寬這個倍數才算「有袖子」
SLEEVE_MIN_EXCESS = 1.06

# 上衣衣長，單位是「肩線到下擺的長度除以身寬」
LEN_CROP = 1.02           # 短版
LEN_REG = 1.45            # 正常
LEN_LONG = 1.85           # 長版（再長就是洋裝身長）

# 量寬度剖面時，忽略太細的雜訊列（吊牌、線頭）
MIN_ROW_PX = 3


def width_profile(mask: np.ndarray, box: tuple[int, int, int, int]
                  ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """回傳每一列的 (寬度, 左緣, 右緣)，座標都相對於衣服外框。

    沒有前景的列寬度記 0，左右緣記 -1 —— 用 NaN 會讓後面每一個比較
    都要先擋 NaN，反而容易漏擋。
    """
    x1, y1, x2, y2 = box
    sub = mask[y1:y2, x1:x2]
    widths = sub.sum(axis=1).astype(np.float64)
    left = np.full(sub.shape[0], -1.0)
    right = np.full(sub.shape[0], -1.0)
    for i in range(sub.shape[0]):
        xs = np.nonzero(sub[i])[0]
        if len(xs) >= MIN_ROW_PX:
            left[i], right[i] = float(xs.min()), float(xs.max())
        else:
            widths[i] = 0.0
    return widths, left, right


def body_width(widths: np.ndarray) -> float:
    """身寬：下半身寬度的低百分位數。

    不能用「下半段的中位數」—— 長袖會一路蓋到 0.75 的高度，中位數量到的
    是袖子不是身體，於是身寬 ≈ 最寬處，判出來變成「無袖」（實測合成長袖
    三款全錯）。也不能用最小值：下擺的縫份與陰影會給出偏小的離群列。
    取 20 百分位：長袖時避開袖子那一段，A 字擺時取到腰身而不是擺寬。
    """
    lower = widths[int(len(widths) * 0.50):int(len(widths) * 0.97)]
    lower = lower[lower > 0]
    if not lower.size:
        pos = widths[widths > 0]
        return float(np.median(pos)) if pos.size else 0.0
    return float(np.percentile(lower, 20))


def _shoulder_row(widths: np.ndarray, body: float) -> int:
    """肩線：從上往下，寬度第一次達到身寬七成的那一列。

    不用「上四分之一最寬的列」—— 短袖的最寬處是袖口，落在衣長四成處，
    根本不在上四分之一裡；而掛在木衣架上拍的照片，衣架橫桿又會在更上面
    製造一個假的寬列。「第一次到達身寬七成」對兩者都穩。
    """
    if body <= 0:
        return 0
    hit = np.nonzero(widths >= body * 0.70)[0]
    return int(hit[0]) if hit.size else 0


def neckline(mask: np.ndarray, box: tuple[int, int, int, int]) -> dict[str, Any]:
    """量領口：輪廓最上緣中間的缺口有多深、多寬。

    做法是逐列看「這一列的前景中間有沒有斷開」。領口是一個從上緣往下
    凹進去的洞：最上面幾列被領子的左右兩肩夾著，中間是空的。
    洞在哪一列閉合，就是領深。
    """
    x1, y1, x2, y2 = box
    sub = mask[y1:y2, x1:x2]
    h, w = sub.shape
    widths, _, _ = width_profile(mask, box)
    body = body_width(widths) or float(w)
    sh = _shoulder_row(widths, body)

    gap_w = 0.0
    depth = None
    # 只看肩線以上到肩線下方一小段 —— 再往下的空洞是腋下，不是領口
    limit = min(h, max(sh + 1, int(h * 0.30)))
    for i in range(limit):
        xs = np.nonzero(sub[i])[0]
        if len(xs) < MIN_ROW_PX:
            continue
        # 中央 60% 範圍內的空洞才算領口；肩線兩端的空隙是袖子與身體的分界
        lo, hi = int(w * 0.20), int(w * 0.80)
        centre = sub[i, lo:hi]
        holes = np.nonzero(~centre)[0]
        if holes.size == 0:
            depth = i
            break
        gap_w = max(gap_w, float(holes.size))
    if depth is None:
        depth = limit

    d = depth / body if body else 0.0
    g = gap_w / body if body else 0.0

    if g < NECK_HIGH:
        kind = "高領/密合"
    elif d >= NECK_DEEP:
        kind = "深 V／U 領" if g < NECK_WIDE else "大開領"
    elif d <= NECK_SHALLOW and g >= NECK_WIDE:
        kind = "一字／船型領"
    elif g >= NECK_WIDE:
        kind = "寬圓領"
    else:
        kind = "圓領"
    return {"領型": kind, "領深比": round(d, 3), "領寬比": round(g, 3)}


def sleeve(mask: np.ndarray, box: tuple[int, int, int, int]) -> dict[str, Any]:
    """量袖長：肩線到袖口的距離，佔衣服高度的比例。

    袖口取「最寬的那一列」。袖子是往下往外斜的，所以最寬處就是袖口。
    原本找的是「寬度收回身寬的那一列」，那量到的是腋下 —— 腋下比袖口低，
    那件真實的短袖 T 因此被判成七分袖。

    有沒有袖子，看最寬處超過身寬多少（SLEEVE_MIN_EXCESS）。

    量不準的情況：落肩、連袖（raglan）的外緣可能是直落的，沒有明顯的
    最寬點，袖長會偏短。這類版型要靠品名或人工覆核補。
    """
    widths, _, _ = width_profile(mask, box)
    n = len(widths)
    if n < 10:
        return {"袖長": "量不到", "袖長比": None}
    body = body_width(widths)
    sh = _shoulder_row(widths, body)

    up = widths[:max(3, int(n * 0.75))]
    cuff = int(up.argmax())
    peak_w = float(up[cuff])
    if not body or peak_w <= body * SLEEVE_MIN_EXCESS:
        return {"袖長": "無袖／背心", "袖長比": 0.0,
                "肩寬px": round(peak_w, 1), "身寬px": round(body, 1)}
    ratio = max(0.0, (cuff - sh) / float(n))
    shoulder_w = peak_w

    if ratio <= SLEEVE_NONE:
        kind = "無袖／背心"
    elif ratio <= SLEEVE_CAP:
        kind = "蓋袖"
    elif ratio <= SLEEVE_SHORT:
        kind = "短袖"
    elif ratio <= SLEEVE_MID:
        kind = "五分～七分袖"
    else:
        kind = "長袖"
    return {"袖長": kind, "袖長比": round(ratio, 3),
            "肩寬px": round(shoulder_w, 1), "身寬px": round(body, 1)}


def length(mask: np.ndarray, box: tuple[int, int, int, int],
           category: str | None = None) -> dict[str, Any]:
    """量衣長：肩線到下擺的長度除以身寬。

    分母用身寬，跟領型同一把尺 —— 拍遠拍近像素長度會變，比例不會。
    起點用肩線而不是外框上緣：掛在木衣架上拍的照片，外框上緣是衣架，
    從那裡量起每一件都會多出一截。
    """
    x1, y1, x2, y2 = box
    widths, _, _ = width_profile(mask, box)
    body = body_width(widths)
    sh = _shoulder_row(widths, body)
    h = float(y2 - y1) - sh
    if not body:
        return {"衣長": "量不到", "衣長比": None}
    r = h / body
    if str(category) == "洋裝":
        kind = ("短洋裝" if r < 1.9 else "及膝洋裝" if r < 2.5 else "長洋裝")
    elif r < LEN_CROP:
        kind = "短版"
    elif r < LEN_REG:
        kind = "正常身長"
    elif r < LEN_LONG:
        kind = "長版"
    else:
        kind = "長版／長罩衫"
    return {"衣長": kind, "衣長比": round(r, 3)}


def measure(img, category: str | None = None) -> dict[str, Any]:
    """一張衣服照 → 版型屬性。呼叫前請先過 locate.is_garment_shot。

    下身（褲、裙）沒有領與袖，只回傳身長比例，不硬套上衣的標籤。
    """
    from .locate import CATEGORY_ZONES

    mask, box = garment_mask(img)
    family = CATEGORY_ZONES.get(str(category), "上衣")
    x1, y1, x2, y2 = box
    if (x2 - x1) < 8 or (y2 - y1) < 8:
        return {"可量測": False, "說明": "衣服輪廓太小，量不出版型"}

    out: dict[str, Any] = {"可量測": True, "品類群": family}
    if family == "下身":
        widths, _, _ = width_profile(mask, box)
        top = float(np.median(widths[:max(3, len(widths) // 6)]))
        out.update({"腰寬px": round(top, 1),
                    "長寬比": round((y2 - y1) / max(top, 1.0), 3),
                    "說明": "下身不判領型與袖長"})
        return out
    out.update(neckline(mask, box))
    out.update(sleeve(mask, box))
    out.update(length(mask, box, category))
    return out
