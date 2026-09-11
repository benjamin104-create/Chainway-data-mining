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

    光線    暖／冷偏移，整體亮度上下
    背景    白底換成室內牆色
    構圖    縮放、平移，四邊不等量留白
    壓縮    重新存成 JPEG，帶進真實的塊狀雜訊

## 它量得到什麼、量不到什麼

**量得到**：對光線、構圖、縮放、壓縮的耐受度。這些正是我一路上用
「相對偏移」「滑動視窗」去對付的東西 —— 這支就是它們的考卷。

**量不到**：真穿搭照與棚拍之間那道最難的鴻溝 —— 衣服穿在身上會皺、
會被手臂遮住、會有褶子的陰影。合成圖沒有這些。

所以這支給的是**上界**：它跑不好，真照片一定更差；它跑得好，真照片
還要另外看。把這句話寫在報表上，不要讓人把上界當成實測。
"""
from __future__ import annotations

import io
import random
from typing import Any, Callable

import numpy as np


def simulate(img, *, seed: int = 0):
    """棚拍系統圖 → 一張「像是隨手拍的」查詢圖。"""
    from PIL import Image as _I

    rng = random.Random(seed)
    im = img.convert("RGB")
    w, h = im.size

    # 光線：暖或冷，加上整體亮度
    gain = np.array([rng.uniform(0.88, 1.20), rng.uniform(0.96, 1.05),
                     rng.uniform(0.82, 1.18)]) * rng.uniform(0.85, 1.12)
    a = np.clip(np.asarray(im, float) * gain, 0, 255).astype(np.uint8)
    im = _I.fromarray(a)

    # 構圖：縮放、貼到室內牆色的背景上、四邊不等量留白
    k = rng.uniform(0.55, 0.92)
    im = im.resize((max(8, int(w * k)), max(8, int(h * k))), _I.LANCZOS)
    wall = tuple(int(v) for v in np.clip(
        np.array([rng.uniform(198, 242)] * 3) + rng.uniform(-8, 8), 0, 255))
    W = int(im.width * rng.uniform(1.10, 1.45))
    H = int(im.height * rng.uniform(1.10, 1.45))
    bg = _I.new("RGB", (W, H), wall)
    bg.paste(im, (rng.randint(0, max(0, W - im.width)),
                  rng.randint(0, max(0, H - im.height))))

    # 壓縮：真實照片一定經過 JPEG，塊狀雜訊會影響每一格的中位數
    buf = io.BytesIO()
    bg.save(buf, "JPEG", quality=rng.randint(62, 88))
    buf.seek(0)
    return _I.open(buf).convert("RGB")


def run(cfg, *, n: int = 30, pool: int = 200, seed: int = 20260911,
        images: dict | None = None,
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
            q = simulate(load_rgb(images[truth]), seed=seed + i)
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
