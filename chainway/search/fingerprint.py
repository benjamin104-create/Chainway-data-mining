"""把整個影像庫壓成一個小檔案，讓比對可以離開這台電腦。

## 為什麼需要這個

使用者問：「系統圖你不能直接抓嗎？還是我需要開啟什麼權限？」

沒有任何權限能讓雲端的工作階段碰到他桌面上的資料夾 —— 那不是權限問題，
是兩台機器之間根本沒有通路。圖有 2.69 GB，也不適合傳。

但**比對不需要圖，只需要指紋**。每張系統圖真正用到的只有兩樣東西：

    顏色簽名   2×2 / 3×3 / 4×4 的格子中位 LAB + 每格的亮度離散度
               96 個數字 → float16 就是 192 bytes
    細節特徵   ORB 描述子，每點 32 bytes

全庫 3,323 款算下來：

    顏色指紋    0.6 MB     ← 傳得動，而且它單獨就有 Top-1 88.7% / Top-5 96.3%
    細節指紋    20 MB（每款 200 點）  ← 想要高把握度再加

所以流程變成：在有圖的那台電腦跑一次 `cli fingerprint`，把產出的檔案送
到任何地方（聊天室、內網伺服器、靜態網站），比對就能在那裡跑。圖本身
一步都不用離開原地。

## 順帶解決的三件事

**網站部署**：伺服器只要放指紋檔，不必放 2.69 GB 的圖。
**更新**：新品上架重跑一次，換掉一個檔案就好。
**隱私**：指紋是不可逆的統計量 —— 幾十個 LAB 中位數與二進位描述子
還原不回商品照片。

## 一個誠實的限制

指紋是用**當下那一版**的程式算的。比對的邏輯改了（格子切法、ORB 參數），
舊指紋就不能用了。所以檔案裡寫了版本號，載入時對不上會直接說話，
不會安靜地給出錯的名次。
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

import numpy as np

# 指紋格式版本。**改了比對邏輯就要進版**，否則舊指紋會安靜地算出錯的距離。
VERSION = "fp1"
# 每款存幾個細節特徵點。200 點 = 全庫 20 MB；查詢端仍然抓 1200 點，
# 兩邊點數不同不影響比對（比的是描述子，不是數量）。
MAX_KP = 200


def export(cfg, out: str | Path | None = None, *, with_details: bool = True,
           max_kp: int = MAX_KP, limit: int = 0,
           log: Callable[[str], None] = print) -> dict[str, Any]:
    """掃過所有參考圖，寫出指紋檔。回傳產出的路徑與統計。"""
    from ..imageio import load_rgb
    from ..vision import grid as G
    from ..vision import keypoints as KP
    from . import refs as R

    out = Path(out) if out else (cfg.path("outputs") / "指紋")
    out.mkdir(parents=True, exist_ok=True)
    allrefs = R.collect(cfg)
    skus = sorted(allrefs)
    if limit:
        skus = skus[:limit]
    if not skus:
        return {"錯誤": "沒有讀到任何參考圖，確認 settings.yaml 的 paths"}

    log(f"要處理 {len(skus):,} 款")
    sig_rows: list[np.ndarray] = []
    kept: list[str] = []
    srcs: list[str] = []
    desc_store: dict[str, np.ndarray] = {}
    pts_store: dict[str, np.ndarray] = {}

    for i, sku in enumerate(skus, 1):
        items = allrefs.get(sku) or []
        if not items:
            continue
        p = items[0]["path"]
        try:
            im = load_rgb(p)
            sig = G.cell_signature(im)
        except Exception:
            continue
        if not sig.get("有效格"):
            continue
        sig_rows.append(_flatten(sig))
        kept.append(sku)
        srcs.append(items[0]["來源"])
        if with_details:
            try:
                d = KP.describe_query(im)
            except Exception:
                d = None
            if d is not None:
                pts, des = d
                if len(des) > max_kp:
                    pts, des = pts[:max_kp], des[:max_kp]
                pts_store[sku] = pts.astype(np.float32)
                desc_store[sku] = des.astype(np.uint8)
        if i % 200 == 0:
            log(f"  {i}/{len(skus)}")

    if not kept:
        return {"錯誤": "一款都算不出指紋"}

    colour_p = out / "指紋_顏色.npz"
    np.savez_compressed(
        colour_p, version=np.array([VERSION]),
        skus=np.array(kept), sources=np.array(srcs),
        sig=np.stack(sig_rows).astype(np.float16))
    res: dict[str, Any] = {
        "款數": len(kept), "顏色指紋": str(colour_p),
        "顏色指紋MB": round(colour_p.stat().st_size / 1024 / 1024, 2)}

    if with_details and desc_store:
        det_p = out / "指紋_細節.npz"
        order = [s for s in kept if s in desc_store]
        np.savez_compressed(
            det_p, version=np.array([VERSION]), skus=np.array(order),
            counts=np.array([len(desc_store[s]) for s in order]),
            desc=np.concatenate([desc_store[s] for s in order]),
            pts=np.concatenate([pts_store[s] for s in order]))
        res["細節指紋"] = str(det_p)
        res["細節指紋MB"] = round(det_p.stat().st_size / 1024 / 1024, 2)
        res["有細節的款數"] = len(order)

    # 商品資料：查到貨號之後要顯示的東西。很小，一起帶走。
    try:
        import pandas as pd

        from .find import master, stock

        names, sales = master(cfg)
        inv = stock(cfg)
        rows = []
        for sku in kept:
            v = inv.get(sku) or []
            rows.append({
                "貨號": sku, "品名": names.get(sku, ""),
                "售罄": (sales.get(sku) or {}).get("售罄"),
                "定價": (sales.get(sku) or {}).get("定價"),
                "可售總數": sum(x["庫存"] or 0 for x in v) or None,
                "顏色尺寸庫存": "；".join(
                    f"{x['顏色']}/{x['尺寸']}:{x['庫存']}" for x in v[:40]),
            })
        info_p = out / "指紋_商品.csv"
        pd.DataFrame(rows).to_csv(info_p, index=False, encoding="utf-8-sig")
        res["商品資料"] = str(info_p)
    except Exception:
        pass
    return res


def _flatten(sig: dict[str, Any]) -> np.ndarray:
    """簽名 → 固定長度的一維向量（缺的格用 NaN，載回來還原得回去）。"""
    parts: list[float] = []
    for n in (2, 3, 4):
        cells = sig.get(f"格{n}") or []
        for i in range(n * n):
            lab = (cells[i].get("LAB") if i < len(cells) else None) or [np.nan] * 3
            parts.extend(float(v) for v in lab)
    sp = sig.get("離散") or []
    for i in range(9):
        v = sp[i] if i < len(sp) else None
        parts.append(np.nan if v is None else float(v))
    return np.array(parts, dtype=np.float32)


def _unflatten(vec: np.ndarray) -> dict[str, Any]:
    sig: dict[str, Any] = {}
    k = 0
    for n in (2, 3, 4):
        cells = []
        for _ in range(n * n):
            lab = vec[k:k + 3]
            k += 3
            cells.append({"格": "", "LAB": (None if np.isnan(lab).any()
                                            else [float(x) for x in lab])})
        sig[f"格{n}"] = cells
    sig["格"] = sig["格3"]
    sig["離散"] = [None if np.isnan(v) else float(v) for v in vec[k:k + 9]]
    got = [c["LAB"] for c in sig["格3"] if c["LAB"]]
    sig["主色LAB"] = ([round(float(v), 1)
                       for v in np.median(np.array(got), axis=0)]
                      if got else None)
    sig["有效格"] = len(got)
    return sig


def load(folder: str | Path) -> dict[str, Any]:
    """讀回指紋檔。版本對不上就直接說話，不要安靜地算出錯的距離。"""
    folder = Path(folder)
    cp = folder / "指紋_顏色.npz" if folder.is_dir() else folder
    if not cp.exists():
        return {"錯誤": f"找不到 {cp}"}
    z = np.load(cp, allow_pickle=False)
    ver = str(z["version"][0]) if "version" in z else "?"
    if ver != VERSION:
        return {"錯誤": f"指紋是 {ver} 版，這支程式要 {VERSION} 版 —— "
                        "比對邏輯改過了，請在有圖的機器上重跑 cli fingerprint"}
    skus = [str(s) for s in z["skus"]]
    sig = z["sig"].astype(np.float32)
    out: dict[str, Any] = {
        "貨號": skus,
        "簽名": {s: _unflatten(sig[i]) for i, s in enumerate(skus)},
        "來源": {s: str(z["sources"][i]) for i, s in enumerate(skus)}
        if "sources" in z else {},
        "細節": {},
    }
    dp = folder / "指紋_細節.npz" if folder.is_dir() else None
    if dp and dp.exists():
        d = np.load(dp, allow_pickle=False)
        if str(d["version"][0]) == VERSION:
            k = 0
            for i, s in enumerate(d["skus"]):
                n = int(d["counts"][i])
                out["細節"][str(s)] = (d["pts"][k:k + n].astype(np.float32),
                                       d["desc"][k:k + n].astype(np.uint8))
                k += n
    return out
