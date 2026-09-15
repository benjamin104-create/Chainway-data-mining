"""不需要任何資料的比對基準測試。

`selfeval` 要有系統圖才跑得動 —— 它把真的系統圖退化成「手機隨手拍」，
再看系統找不找得回原圖。那是最貼近真實的測法，但帶著指紋走的機器、
以及任何還沒接上公司資料夾的電腦，都沒有那些圖。

這一支自己畫一個影像庫出來（每款一塊底色加上隨機紋樣），所以**在任何
機器上、什麼資料都不用，就能回答一個問題：比對邏輯本身有沒有退步。**

一個必須說清楚的限制：這裡的衣服是隨機色塊畫的，紋理比真系統圖單純，
關鍵點在這裡比在真實庫可靠得多。所以它量得出「改壞了沒有」，量不出
「在真實庫上有多準」。真實庫那一側要用 `cli selftest`，或直接看
find.py 裡 KP_DOMINANCE 上方記的雜訊量測。先前把這裡的數字當成真實庫
的數字，正是門檻訂錯的原因。
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

import numpy as np

N_LIB = 150
N_QUERY = 80


def _garment(seed: int):
    """一件測試用的衣服：白底、中間一塊底色，上面隨機灑紋樣。"""
    from PIL import Image

    rng = np.random.default_rng(seed)
    a = np.full((700, 480, 3), 248, np.uint8)
    base = rng.integers(25, 215, 3)
    a[90:610, 100:380] = base
    for _ in range(int(rng.integers(25, 110))):
        y, x = rng.integers(95, 600), rng.integers(105, 375)
        h, w = rng.integers(6, 45), rng.integers(6, 45)
        a[y:y + h, x:x + w] = np.clip(base + rng.integers(-100, 100, 3), 0, 255)
    return Image.fromarray(a)


def run(cfg, *, n_lib: int = N_LIB, n_query: int = N_QUERY,
        workdir: str | Path | None = None,
        log: Callable[[str], None] = print) -> dict[str, Any]:
    """畫一個庫、出一批題、量 Top-1／Top-5。回傳統計。"""
    import tempfile

    from ..vision import grid as G
    from ..vision import keypoints as KP
    from . import find as F
    from . import fingerprint as FP
    from . import selfeval as SE

    tmp = Path(workdir) if workdir else Path(tempfile.mkdtemp(prefix="bench-"))
    lib = tmp / "指紋"
    lib.mkdir(parents=True, exist_ok=True)

    log(f"畫 {n_lib} 款測試衣服…")
    skus = [f"KB{i:06d}" for i in range(n_lib)]
    ims = {s: _garment(1000 + i) for i, s in enumerate(skus)}
    # 一列 = 一張參考圖（見 fingerprint.export 的註解）。這裡每款一張，
    # 但**格式要跟真的指紋檔一模一樣** —— 先前這裡還寫舊格式，載入端
    # 安靜地把細節整包丟掉，基準測試就變成純顏色而不自知（倍數中位
    # 掉到 0.0x 才看出來）。所以測試資料一定要走跟正式一樣的欄位。
    sig, pts_s, des_s, det_rows = [], [], [], []
    for i, s in enumerate(skus):
        sig.append(FP._flatten(G.cell_signature(ims[s])))
        d = KP.describe_query(ims[s])
        if d is not None:
            pp, ee = d
            pts_s.append(pp[:FP.MAX_KP].astype(np.float32))
            des_s.append(ee[:FP.MAX_KP].astype(np.uint8))
            det_rows.append(i)
    np.savez_compressed(lib / "指紋_顏色.npz", version=np.array([FP.VERSION]),
                        skus=np.array(skus), codes=np.array(skus),
                        sources=np.array(["系統圖"] * len(skus)),
                        sig=np.stack(sig).astype(np.float16))
    if det_rows:
        np.savez_compressed(lib / "指紋_細節.npz",
                            version=np.array([FP.VERSION]),
                            rows=np.array(det_rows, dtype=np.int32),
                            counts=np.array([len(d) for d in des_s]),
                            desc=np.concatenate(des_s),
                            pts=np.concatenate(pts_s))
    index = FP.load(lib)

    log(f"出 {n_query} 題（把系統圖退化成手機隨手拍）…")
    rng = np.random.default_rng(0)
    qdir = tmp / "題目"
    qdir.mkdir(exist_ok=True)
    paths = []
    for k in range(n_query):
        truth = skus[int(rng.integers(0, n_lib))]
        p = qdir / f"{k:03d}.jpg"
        SE.simulate(ims[truth], seed=int(rng.integers(1, 10 ** 6))).save(
            p, quality=88)
        paths.append((p, truth))

    t1 = t5 = 0
    ratios: list[float] = []
    for p, truth in paths:
        r = F.run(cfg, photo=str(p), index=index, top=5, log=lambda *_: None)
        got = [x["貨號"] for x in r["候選"]]
        t1 += got[:1] == [truth]
        t5 += truth in got[:5]
        ks = sorted((x.get("相同細節") or 0) for x in r["候選"])[::-1] + [0]
        ratios.append(ks[0] / max(ks[1], 1))
    if index.get("細節") and all(r == 0 for r in ratios):
        log("！細節指紋存在，卻一個內點都比不出來 —— 多半是格式沒對上，"
            "載入端安靜地丟掉了整包描述子。")
    out = {
        "款數": n_lib, "題數": n_query,
        "有細節的參考圖數": len(index.get("細節") or {}),
        "Top-1": round(t1 / n_query, 4), "Top-5": round(t5 / n_query, 4),
        "倍數中位": round(float(np.median(ratios)), 2),
        "資料夾": str(tmp),
    }
    log(f"Top-1 {out['Top-1']:.1%}　Top-5 {out['Top-5']:.1%}　"
        f"第一名比第二名的倍數中位 {out['倍數中位']}x")
    log("提醒：這裡的衣服紋理比真系統圖單純，關鍵點在這裡偏可靠。")
    log("　　　真實庫的準確率要用 cli selftest，不要拿這個數字對外講。")
    return out
