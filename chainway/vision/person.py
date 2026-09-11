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
# 有了她自己的膚色當圓心，容許的半徑就可以縮到很小（CbCr 平面上的距離）。
# 通用範圍是 CR 跨 49、CB 跨 58；這裡只要 14，因為圓心是對的。
SKIN_REF_TOL = 14.0
# 皮膚佔主體的合理範圍。低於下限代表沒抓到人；高於上限代表基準色抓錯了
# （抓到衣服），那時候寧可完全不扣皮膚。
SKIN_MIN_FRAC = 0.03
SKIN_MAX_FRAC = 0.60
# 背景雜亂度超過這個就改用 GrabCut 分割。量出來的：合成圖 0、棚拍 3、
# 試衣間（木門框＋白板＋地板）50–57。取 20，兩邊各有兩倍以上餘裕。
CLUTTER_MAX = 20.0


def _ycbcr(a: np.ndarray):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    y = 0.299 * r + 0.587 * g + 0.114 * b
    cb = 128.0 - 0.168736 * r - 0.331264 * g + 0.5 * b
    cr = 128.0 + 0.5 * r - 0.418688 * g - 0.081312 * b
    return y, cb, cr


def skin_mask(a: np.ndarray, ref: np.ndarray | None = None) -> np.ndarray:
    """皮膚偵測。給了 `ref`（這個人自己的膚色）就以它為圓心，否則用通用範圍。

    ## 為什麼一定要「她自己的膚色」

    通用的 YCbCr 範圍在真照片上當場出事：貴司的主色調是 ivory／cream／
    taupe，米白襯衫整片落在膚色範圍裡 —— 實測一張白襯衫的穿搭照，
    「皮膚佔主體 77%」，等於把衣服當成手臂扣掉。

    改成先從**頭部區域**取她本人的膚色當基準，再判「離這個顏色多近」。
    米白布料跟她的膚色在 CbCr 上分得開，跟一個涵蓋所有膚色的大範圍
    分不開 —— 範圍大到能容納所有人，就一定容得下米白。
    """
    y, cb, cr = _ycbcr(a)
    if ref is not None:
        _, rb, rr = _ycbcr(np.asarray(ref, float).reshape(1, 1, 3))
        d = np.hypot(cb - float(np.ravel(rb)[0]), cr - float(np.ravel(rr)[0]))
        return (d <= SKIN_REF_TOL) & (y >= SKIN_Y_MIN)
    return ((cr >= CR_LO) & (cr <= CR_HI) & (cb >= CB_LO) & (cb <= CB_HI)
            & (y >= SKIN_Y_MIN))


def _has_head(skin: np.ndarray, box) -> bool:
    """主體頂上有沒有一張臉。

    ## 這個判斷要回答的其實只有一件事

    它控制兩件事：色格要不要扣皮膚、關鍵點要不要切掉頭部。兩件都只跟
    「畫面裡有沒有一個人的頭」有關，**跟有幾隻手、幾條腿無關**。

    我先前的判準是「至少三塊分開的皮膚（頭＋兩隻手臂）」，理由是人一定
    有頭有手。真照片打掉了它：手插口袋、長袖、裙子遮腿，三塊湊不齊 ——
    十五張真人像裡有三張被判成「不是人」。判準應該問它真正要問的事。

    ## 怎麼認一顆頭

    在主體外框的**上三成**裡，有一塊夠大、而且**比身體窄**的皮膚。
    窄這個條件是關鍵：一件米色或裸粉的衣服被誤判成皮膚時，那一塊會橫跨
    整個身寬；一顆頭不會。合成的平拍商品照誤判率因此是 0。
    """
    x1, y1, x2, y2 = box
    bw, bh = max(x2 - x1, 1), max(y2 - y1, 1)
    lab = _label(skin)
    if lab.max() == 0:
        return False
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    thr = max(30, 0.003 * skin.size)
    for i, sz in enumerate(sizes):
        if sz < thr:
            continue
        ys, xs = np.nonzero(lab == i)
        if (xs.max() - xs.min() + 1) > 0.60 * bw:
            continue
        if (float(ys.mean()) - y1) / bh < 0.30:
            return True
    return False


def _skin_ref(a: np.ndarray, m: np.ndarray, box) -> np.ndarray | None:
    """從人的頭部取她自己的膚色。

    不用臉部模型 —— cv2 沒有內建 cascade，要另外下載，使用者的機器也得裝。
    全身站姿照有一個很硬的幾何事實可以用：**頭在人框的最上面**。
    取上緣 18% 裡「通用規則判為皮膚」的像素中位數，再檢查它真的像膚色。
    不像就回 None，退回通用規則 —— 寧可用弱一點的規則，也不要拿一個
    錯的基準色去扣掉整件衣服。
    """
    x1, y1, x2, y2 = box
    hh = max(4, int((y2 - y1) * 0.18))
    head = (slice(y1, min(y2, y1 + hh)), slice(x1, x2))
    sub, sm = a[head], m[head]
    if sub.size == 0 or sm.sum() < 30:
        return None
    cand = sm & skin_mask(sub)
    if cand.sum() < 25:
        return None
    # 頭部區塊裡有頭髮、陰影、衣領。直接取中位數會被拉暗 —— 實測一張
    # 「卡其外套」的照片，基準色被拉成卡其色，接著**整件外套被當成皮膚**
    # （一塊 4,708 像素、佔身寬 72% 的「皮膚」）。
    # 臉比頭髮亮，所以只取通過膚色規則的像素裡**較亮的那一半**。
    px = sub[cand].astype(np.float64)
    lum = px @ [0.299, 0.587, 0.114]
    keep = lum >= np.percentile(lum, 50)
    if keep.sum() < 15:
        keep = np.ones(len(px), bool)
    ref = np.median(px[keep], axis=0)
    _, cb, cr = _ycbcr(ref.reshape(1, 1, 3))
    cb, cr = float(np.ravel(cb)[0]), float(np.ravel(cr)[0])
    if not (CR_LO <= cr <= CR_HI and CB_LO <= cb <= CB_HI):
        return None
    return ref


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


def clutter(a: np.ndarray) -> float:
    """背景有多雜亂：邊框顏色離自己中位數的中位絕對偏差。

    量出來的分離度大到不需要猶豫：

        合成查詢圖          0
        棚拍白底的穿搭照     3
        試衣間（木門框＋白板＋地板）  50–57

    門檻取 20，兩邊都有兩倍以上的餘裕。
    """
    h, w = a.shape[:2]
    r = max(3, min(h, w) // 40)
    ring = np.concatenate([a[:r].reshape(-1, 3), a[-r:].reshape(-1, 3),
                           a[:, :r].reshape(-1, 3), a[:, -r:].reshape(-1, 3)])
    return float(np.median(np.abs(ring - np.median(ring, axis=0)).sum(1)))


def _grabcut(a: np.ndarray, margin: float = 0.12, iters: int = 4):
    """背景雜亂時改用 GrabCut 分割。

    ## 為什麼需要

    「背景 = 邊框顏色的中位數」只在背景單一時成立。試衣間照片是木門框
    ＋白板＋木地板，邊框中位數落在木頭色上，於是**整片白板都變成主體**
    —— 實測主體佔比 72–78%，接著膚色基準從「頭部」取到的其實是頭髮
    （#B28761、#905E39），整條規則連鎖失效。

    GrabCut 以「中央是前景、四周是背景」起手，迭代四次。實測同樣那幾張
    掉回合理的 25–28%，一張 0.2–0.3 秒。只跑在查詢照片上（一次查詢一張），
    參考圖那邊是棚拍白底，走原本的快路徑。
    """
    try:
        import cv2
    except Exception:
        return None
    h, w = a.shape[:2]
    if h < 40 or w < 40:
        return None
    rect = (int(w * margin), int(h * 0.02),
            int(w * (1 - 2 * margin)), int(h * 0.96))
    mask = np.zeros((h, w), np.uint8)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(np.ascontiguousarray(a.astype(np.uint8)), mask, rect,
                    bgd, fgd, iters, cv2.GC_INIT_WITH_RECT)
    except Exception:
        return None
    out = (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)
    return out if out.sum() > 0.02 * out.size else None


def _fill(mask: np.ndarray) -> np.ndarray:
    """把遮罩內部的洞補起來（衣服跟背景同色時會變成洞）。"""
    try:
        from scipy import ndimage
        return ndimage.binary_fill_holes(mask)
    except Exception:
        pass
    # 沒有 scipy：從四邊往內灌水，灌不到的背景就是洞。
    out = ~mask
    seed = np.zeros_like(out)
    seed[0], seed[-1], seed[:, 0], seed[:, -1] = (out[0], out[-1],
                                                  out[:, 0], out[:, -1])
    for _ in range(max(mask.shape)):
        grown = seed.copy()
        grown[1:] |= seed[:-1]
        grown[:-1] |= seed[1:]
        grown[:, 1:] |= seed[:, :-1]
        grown[:, :-1] |= seed[:, 1:]
        grown &= out
        if (grown == seed).all():
            break
        seed = grown
    return mask | (out & ~seed)


def _largest(mask: np.ndarray) -> np.ndarray:
    lab = _label(mask)
    if lab.max() == 0:
        return mask
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    return lab == int(sizes.argmax())


def _row_fill(mask: np.ndarray, upto: float = 0.55,
              max_gap: float = 0.95) -> np.ndarray:
    """上半身逐列補洞：同一列左右都有主體，中間就補起來。

    ## 為什麼非做不可

    米白襯衫拍在白底上，離背景色只有 14（前景門檻 55）—— 固定門檻無論
    怎麼調都分不開，調低就把背景雜訊全吃進來。實測**真照片**：白襯衫那
    兩張，胸前只有 20% 與 44% 落在主體遮罩裡，也就是說那件衣服的顏色
    是從邊緣、鈕釦、陰影量出來的，不是從布面。而米白正是貴司的主色。

    填洞（`_fill`）救不了，因為那塊區域不是任何連通區的**內部** ——
    衣服消失之後，頭、兩隻手臂、下半身之間本來就是通到畫面外的。
    逐列補就可以：那一列的左右兩端是手臂或身體輪廓，中間一定是衣服。

    ## 只補上半身

    下半身補下去會把**兩腿之間的背景**也補成衣服，那一段的顏色就變成
    白牆。上衣查詢用的是上半身的視窗，所以只補到 `upto`（預設 55%）。
    這是明知的取捨，不是疏忽。
    """
    ys, xs = np.nonzero(mask)
    if len(ys) < 50:
        return mask
    y0, y1 = int(ys.min()), int(ys.max())
    out = mask.copy()
    stop = y0 + int((y1 - y0 + 1) * upto)
    for y in range(y0, min(stop, mask.shape[0])):
        row = np.nonzero(mask[y])[0]
        if len(row) < 2:
            continue
        a, b = int(row.min()), int(row.max())
        span = b - a + 1
        if span < 8:
            continue
        gap = span - len(row)
        if gap <= max_gap * span:
            out[y, a:b + 1] = True
    return out


def _subject(mask: np.ndarray) -> np.ndarray:
    """把同一個人的各部分合起來，不是只取最大那一塊。

    白襯衫拍在白底上時，衣服整片低於前景門檻，**人會被切成互不相連的
    幾塊**：頭是一塊、兩隻手臂各一塊、下半身一塊。這時候「取最大連通
    區域」只會拿到裙子和腿，胸前完全不在遮罩裡，填洞也救不回來 ——
    因為那個區域根本不是任何一塊的內部。

    判準：夠大，而且**水平間距夠近**。

    間距而不是重疊 —— 這一條踩過坑：第一版要求 x 範圍與主塊重疊，
    結果肩膀比裙子寬，兩隻手臂（x 41–55、136–150）跟主塊（62–129）
    完全不重疊，整個被排除，胸前還是空的。人的肩比下襬寬是常態。

    間距門檻用主塊寬度的四成：手臂離身體 7 像素（主塊寬 68）遠遠在內，
    而版面圖上另一個人離得很遠，仍然排除得掉。
    """
    lab = _label(mask)
    if lab.max() == 0:
        return mask
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    main = int(sizes.argmax())
    ys, xs = np.nonzero(lab == main)
    mx0, mx1 = int(xs.min()), int(xs.max())
    mw = max(mx1 - mx0 + 1, 1)
    out = lab == main
    for i, sz in enumerate(sizes):
        if i == main or sz < 0.12 * sizes[main]:
            continue
        yy, xx = np.nonzero(lab == i)
        gap = max(mx0 - int(xx.max()), int(xx.min()) - mx1, 0)
        if gap <= 0.40 * mw:
            out |= lab == i
    return out


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
    messy = clutter(a)
    if messy > CLUTTER_MAX:
        cut = _grabcut(a)
        if cut is not None:
            fg = cut
    skin = skin_mask(a)

    if fg.sum() < 0.02 * fg.size:
        return {"人": np.ones((h, w), bool), "外框": (0, 0, w, h),
                "皮膚": skin, "圖": a, "尺寸": (w, h),
                "說明": "整張跟邊框同色，當成整張都是主體"}

    # 填洞：白襯衫拍在白底上，離背景色只有 14（門檻 55）—— 偵測器看不見
    # 它。但它是被頭髮、手臂、下身包圍的一個**洞**，填起來就回來了。
    # 實測①白襯衫那張，上衣區塊在遮罩裡的比例從 34% 回到接近全部。
    m = _row_fill(_fill(_subject(_close(fg))))
    ys, xs = np.nonzero(m)
    box = ((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
           if len(ys) >= 50 else (0, 0, w, h))
    frac = float(m.mean())
    note = []
    if messy > CLUTTER_MAX:
        note.append(f"背景雜亂（{messy:.0f}），用 GrabCut 分割")

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
    # 頭部膚色只在「真的有人」時才用得上。
    #
    # 合成圖與平拍商品照沒有頭，上緣 18% 取到的是**衣服自己的顏色** ——
    # 接著整件衣服被當成皮膚扣光。實測合成測試的 Top-1 從 83.8% 掉到
    # 72.5%，就是這樣掉的。米色、駝色的真衣服平拍時也會中同樣的招。
    #
    # 所以用結果反過來檢查基準色：拿它算出來的皮膚若佔了主體六成以上，
    # 那不是皮膚，是衣服 —— 丟掉這個基準色。
    ref = _skin_ref(a, m, box)
    has_person = False
    if ref is not None:
        cand = skin_mask(a, ref) & m
        frac_s = float(cand.sum()) / max(m.sum(), 1)
        scattered = _has_head(cand, box)
        if SKIN_MIN_FRAC <= frac_s <= SKIN_MAX_FRAC and scattered:
            skin, has_person = skin_mask(a, ref), True
            note.append(f"膚色以她自己的頭部為準 "
                        f"#{int(ref[0]):02X}{int(ref[1]):02X}{int(ref[2]):02X}")
        elif not scattered:
            note.append("主體頂上找不到一顆頭 —— 這張多半不是人像，不扣皮膚")
            ref = None
        else:
            note.append(f"頭部取到的基準色算出 {frac_s:.0%} 的皮膚，"
                        "不合理 —— 不扣皮膚")
            ref = None
    if ref is None:
        # 通用規則也會吃掉米白衣服。佔比大到不可能是皮膚時，整個不扣，
        # 寧可量到一點手臂，也不要把整件衣服變成「沒有資料」。
        gen = float((skin & m).sum()) / max(m.sum(), 1)
        if gen > SKIN_MAX_FRAC:
            note.append(f"通用膚色規則判出 {gen:.0%} 的皮膚（多半是米白衣服），"
                        "不扣皮膚")
            skin = np.zeros_like(skin)
    return {"人": m, "外框": box, "皮膚": skin & m, "圖": a, "尺寸": (w, h),
            "有人": has_person,
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
    # 手臂從肩膀（衣服上緣）開始，不是從胸口 —— 差這十列，衣服的左右
    # 上角就是開口而不是封閉的洞，填洞救不回來，而真照片是肩膀包住的。
    a[85:200, 52:70] = skin
    a[85:200, 170:188] = skin
    a[210:270, 78:162] = skirt
    a[270:385, 88:114] = skin
    a[270:385, 126:152] = skin
    return _I.fromarray(a)


def check() -> list[str]:
    """自我檢查。每一條都對應一個真照片上踩到的坑。"""
    bad: list[str] = []
    r = analyse(_person())
    x1, y1, x2, y2 = r["外框"]
    W, H = r["尺寸"]
    k = H / 400.0

    if y1 > 20 * k + 0.04 * H:
        bad.append(f"上緣 {y1} 太低，頭髮沒框到")
    if y2 < 380 * k - 0.05 * H:
        bad.append(f"下緣 {y2} 太高，腿沒框到")
    if x1 < 0.05 * W and x2 > 0.95 * W:
        bad.append("左右框到整張圖寬，背景被當成人了")
    if not r.get("有人"):
        bad.append("標準人像沒被判成『有人』")

    skin = r["皮膚"]
    face = skin[int(30 * k):int(65 * k), int(100 * k):int(140 * k)]
    top = skin[int(100 * k):int(200 * k), int(85 * k):int(155 * k)]
    if face.mean() < 0.7:
        bad.append(f"臉只有 {face.mean():.0%} 被判成皮膚")
    if top.mean() > 0.1:
        bad.append(f"藏青上衣有 {top.mean():.0%} 被誤判成皮膚")

    # 真照片教的第一件事：米白上衣不能被當成皮膚扣掉。
    # 實測一張白襯衫的穿搭照，通用膚色規則判出「皮膚佔主體 77%」。
    r2 = analyse(_person(garment=(238, 232, 220)))
    band = r2["皮膚"][int(100 * k):int(200 * k), int(85 * k):int(155 * k)]
    if band.mean() > 0.35:
        bad.append(f"米白上衣有 {band.mean():.0%} 被當成皮膚扣掉")

    # 第二件：白衣服拍在白底上，離背景只有 14（門檻 55），
    # 它是被頭髮手臂包圍的一個洞 —— 填洞要把它救回來。
    r3 = analyse(_person(garment=(246, 246, 244), bg=(252, 252, 252)))
    chest = r3["人"][int(100 * k):int(190 * k), int(90 * k):int(150 * k)]
    if chest.mean() < 0.8:
        bad.append(f"白衣服白底：胸前只有 {chest.mean():.0%} 進到主體遮罩")

    # 第三件：沒有人的平拍商品照不可以被判成人像，否則會套上切頭、
    # 扣皮膚的規則，把衣服自己扣掉（合成測試曾誤判 22%）。
    flat = _flat_garment()
    if analyse(flat).get("有人"):
        bad.append("平拍商品照被誤判成人像")
    return bad


def _flat_garment():
    """平拍的膚色商品照 —— 最容易被誤判成人的那一種。"""
    from PIL import Image as _I

    a = np.full((360, 260, 3), 252, np.uint8)
    a[50:300, 60:200] = (226, 190, 168)
    return _I.fromarray(a)
