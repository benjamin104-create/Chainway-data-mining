"""自己出題、自己改：不需要任何人標答案，就能量出這條流程的準確率。

## 為什麼要有這支

先前我一直要使用者「再給我幾張照片的正解貨號」，好讓我校正。他說得
很直接：「不是要叫我一直幫你做圖讓你校正。」他是對的 —— 一個系統要
證明自己準不準，不能靠使用者交作業。

而其實答案早就在手上：**每一張系統圖都自帶正解**（檔名裡就是貨號）。
把系統圖改造成「像是隨手拍的」，丟回流程裡，看它找不找得回原來那一款。
一次跑幾十題，Top-1 / Top-5 就出來了，而且完全不用人。

## 出題方式：把棚拍變成隨手拍

一張查詢圖會被動這幾刀（每題隨機，種子固定所以可重跑）：

    光線    相機自動白平衡之後的殘餘偏色、曝光上下
    皺褶    低頻的明暗起伏 —— 衣服穿在身上會皺，這一刀最接近真穿搭照
    鏡頭    輕微失焦、手持的傾斜
    背景    白底換成室內牆色
    構圖    縮放、平移，四邊不等量留白
    壓縮    重新存成 JPEG，帶進真實的塊狀雜訊

`harsh=True` 是壓力測試：混合光源、沒有白平衡、更大的皺褶與傾斜。

## 它量得到什麼、量不到什麼

**量得到**：對光線、皺褶、構圖、縮放、模糊、壓縮的耐受度。

**量不到**：手臂遮住半件衣服、衣服被下擺塞進褲頭、從側面拍。
這些是真穿搭照才有的，合成圖做不出來。

所以這支給的是**上界**：它跑不好，真照片一定更差；它跑得好，真照片
還要另外看。把這句話寫在報表上，不要讓人把上界當成實測。

## 它逼出來的每一次改版

    只有顏色（3×3 偏移）                Top-1  5.0%   Top-5 31.7%
    顏色改多尺度（2×2 + 4×4 + 離散）     Top-1 61.3%   Top-5 73.8%
    ＋關鍵點＋RANSAC 幾何驗證            Top-1 83.8%   Top-5 92.5%
    亂猜                                Top-1  0.7%   Top-5  3.3%

每一次都是這支先說「現在只有這樣」，才有得改。沒有它，我只能一直問
使用者「再給我幾張正解」。
"""
from __future__ import annotations

import io
import random
from typing import Any, Callable

import numpy as np


def simulate(img, *, seed: int = 0, harsh: bool = False):
    """棚拍系統圖 → 一張「像是隨手拍的」查詢圖。

    ## 出題要出得像真的，不是出得越難越好

    第一版的白平衡偏移最大到單一通道 ±34%。手機不會那樣拍 —— 它會自動
    白平衡。用那種考卷評分，等於拿一個現實不存在的難度去否定一個方法。
    現在分兩級：

      預設（harsh=False）  手機隨手拍：自動白平衡之後的殘餘偏色 ±6%、
                           曝光 ±15%、裁切縮放、皺褶造成的明暗、輕微
                           模糊與旋轉、JPEG。
      harsh=True           混合光源、沒有白平衡的極端情況。壓力測試用。

    ## 皺褶是這裡最像真穿搭照的一刀

    衣服穿在身上會皺，皺褶造成的是**低頻的明暗起伏** —— 同一塊布，這裡
    亮那裡暗。這一刀比換一盞燈更接近真穿搭照與棚拍之間的差距，所以一定
    要有。做法是疊一張很粗的隨機噪點放大成平滑的亮度場。
    """
    from PIL import Image as _I, ImageFilter as _F

    rng = random.Random(seed)
    im = img.convert("RGB")
    w, h = im.size
    a = np.asarray(im, float)

    # 光線。預設是「相機已經自動白平衡過」之後的殘留，不是原始光源色溫。
    if harsh:
        gain = np.array([rng.uniform(0.85, 1.22), rng.uniform(0.95, 1.06),
                         rng.uniform(0.80, 1.20)])
        expo = rng.uniform(0.82, 1.15)
    else:
        gain = np.array([rng.uniform(0.95, 1.06), rng.uniform(0.98, 1.02),
                         rng.uniform(0.94, 1.06)])
        expo = rng.uniform(0.88, 1.14)
    a = a * gain * expo

    # 皺褶：低頻的亮度起伏，強度 ±10%（harsh 時 ±18%）
    amp = 0.18 if harsh else 0.10
    fold = np.random.default_rng(seed).normal(0.0, 1.0, size=(6, 4))
    span = float(fold.max() - fold.min()) or 1.0
    fold = np.asarray(_I.fromarray(
        ((fold - fold.min()) / span * 255).astype(np.uint8)
    ).resize((a.shape[1], a.shape[0]), _I.BICUBIC), dtype=float) / 255.0
    a = a * (1.0 + amp * (fold - 0.5) * 2.0)[:, :, None]
    im = _I.fromarray(np.clip(a, 0, 255).astype(np.uint8))

    # 鏡頭：輕微失焦與手持的傾斜
    if rng.random() < 0.6:
        im = im.filter(_F.GaussianBlur(rng.uniform(0.3, 1.1)))
    ang = rng.uniform(-4, 4) if not harsh else rng.uniform(-8, 8)

    # 構圖：縮放、貼到室內牆色的背景上、四邊不等量留白
    k = rng.uniform(0.6, 0.95)
    im = im.resize((max(8, int(w * k)), max(8, int(h * k))), _I.LANCZOS)
    im = im.rotate(ang, resample=_I.BICUBIC, expand=True,
                   fillcolor=(255, 255, 255))
    wall = tuple(int(v) for v in np.clip(
        np.array([rng.uniform(198, 242)] * 3) + rng.uniform(-8, 8), 0, 255))
    W = int(im.width * rng.uniform(1.10, 1.40))
    H = int(im.height * rng.uniform(1.10, 1.40))
    bg = _I.new("RGB", (W, H), wall)
    bg.paste(im, (rng.randint(0, max(0, W - im.width)),
                  rng.randint(0, max(0, H - im.height))))

    # 壓縮：真實照片一定經過 JPEG，塊狀雜訊會影響每一格的中位數
    buf = io.BytesIO()
    bg.save(buf, "JPEG", quality=rng.randint(70, 92))
    buf.seek(0)
    return _I.open(buf).convert("RGB")


def run(cfg, *, n: int = 30, pool: int = 200, seed: int = 20260911,
        harsh: bool = False, images: dict | None = None,
        log: Callable[[str], None] = print) -> dict[str, Any]:
    """跑 `n` 題，每題在 `pool` 款裡找。回傳準確率與逐題名次。"""
    from ..imageio import load_rgb
    from ..report.inventory_report import index_images
    from . import find as F

    if images is None:
        roots = [r for r in cfg.path_list("system_images") if r]
        images = index_images(roots) if roots else {}
    skus = sorted(images)
    if len(skus) < 10:
        return {"錯誤": f"只有 {len(skus)} 款系統圖，不夠出題"}

    rng = random.Random(seed)
    pool = min(pool, len(skus))
    n = min(n, len(skus))
    asked = rng.sample(skus, n)

    ranks: list[dict[str, Any]] = []
    for i, truth in enumerate(asked, 1):
        others = [s for s in rng.sample(skus, min(pool * 2, len(skus)))
                  if s != truth][:pool - 1]
        sub = {s: images[s] for s in others + [truth]}
        try:
            q = simulate(load_rgb(images[truth]), seed=seed + i, harsh=harsh)
        except Exception:
            continue
        tmp = cfg.path("interim") / "_selfeval_query.jpg"
        tmp.parent.mkdir(parents=True, exist_ok=True)
        q.save(tmp, "JPEG", quality=90)
        try:
            res = F.run(cfg, photo=tmp, words="", images=sub,
                        top=1, truth=[truth], log=lambda *_: None)
        except Exception as exc:
            log(f"  第 {i} 題跑不動：{type(exc).__name__}")
            continue
        r = (res.get("正解") or {}).get(truth)
        ranks.append({"題": i, "貨號": truth, "名次": r,
                      "候選數": res.get("總候選")})
        if i % 5 == 0:
            got = [x for x in ranks if x["名次"]]
            t1 = sum(1 for x in got if x["名次"] == 1)
            log(f"  {i}/{n} 題　目前 Top-1 {t1}/{len(ranks)}")
    tmp = cfg.path("interim") / "_selfeval_query.jpg"
    tmp.unlink(missing_ok=True)

    got = [x["名次"] for x in ranks if x["名次"]]
    m = len(ranks)
    if not m:
        return {"錯誤": "一題都沒跑完"}
    top1 = sum(1 for r in got if r == 1)
    top5 = sum(1 for r in got if r <= 5)
    return {
        "題數": m, "候選數": pool,
        "Top-1": round(top1 / m, 3), "Top-5": round(top5 / m, 3),
        "中位名次": int(np.median(got)) if got else None,
        # 亂猜的基準線。沒有它，「Top-1 三成」聽起來像成績，其實可能是
        # 候選太少造成的。準確率一定要跟基準線一起看。
        "亂猜 Top-1": round(1 / pool, 4),
        "亂猜 Top-5": round(5 / pool, 4),
        "逐題": ranks,
    }
