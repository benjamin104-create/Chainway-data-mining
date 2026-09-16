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

# 指紋格式版本。**改了比對邏輯或檔案格式就要進版**，否則舊指紋會安靜地
# 算出錯的距離。
#   fp1 → fp2：一列從「一個貨號」改成「一張參考圖」，並加上色號欄位。
#              fp1 每款只存一個顏色，顏色那一關等於廢掉（見 export 的註解）。
VERSION = "fp2"
# 每款存幾個細節特徵點。200 點 = 全庫 20 MB；查詢端仍然抓 1200 點，
# 兩邊點數不同不影響比對（比的是描述子，不是數量）。
MAX_KP = 200
# 一個貨號最多存幾張參考圖。**一個顏色就是一張圖** —— 存少了，使用者拍的
# 那個顏色就可能不在指紋裡，顏色那一關直接失效（第一版每款只存一張，
# 實測已知正解的九宮格距離 136.8，等於完全沒比到）。
MAX_PER_SKU = 24
# 縮圖的長邊像素。**這不是拿來比對的**，比對用簽名與描述子。
#
# 它在的理由只有一個：讓「改了比對邏輯」不必再叫使用者重跑一次匯出。
# 顏色簽名是從像素算出來的衍生值，格子切法一改（SCALES、SPREAD_W）舊
# 簽名就作廢；有縮圖就能在任何機器上重算，不必再回去碰那 2.69 GB。
# 順帶也讓我看得到參考圖長什麼樣 —— 上一個 bug（每款只存一個顏色）
# 如果當時看得到圖，一眼就發現了。
#
# 128 長邊、JPEG q70 大約 4 KB；一萬張約 40 MB。
#
# **誠實說明**：有了縮圖，指紋檔就不再是「還原不回商品照片」的統計量，
# 它裡面是真的（很小的）商品圖。所以只放私人倉庫，不要放公開網站。
# 不想帶就下 --no-thumbs，比對完全不受影響。
THUMB_PX = 128


def export(cfg, out: str | Path | None = None, *, with_details: bool = True,
           max_kp: int = MAX_KP, limit: int = 0, per_sku: int = MAX_PER_SKU,
           with_thumbs: bool = True,
           log: Callable[[str], None] = print) -> dict[str, Any]:
    """掃過所有參考圖，寫出指紋檔。回傳產出的路徑與統計。

    **一個貨號要存它所有的顏色，不是只存第一張。**

    這是第一版最嚴重的錯。系統圖的檔名是 `KA126902670F.jpg`，其中 70 是
    色號、F 是尺寸，但抓貨號的規則是 `KA\d{7}` —— 色號被切掉，同一款的
    每個顏色全部歸成同一個 KA1269026，而 export 只留 `items[0]`。等於
    每款只留下一個顏色的指紋。

    後果在真照片上很致命：使用者拍的是米白那件，指紋裡存的可能是藏青
    那件。實測一筆已知正解，九宮格距離 136.8 —— 顏色完全對不上，因為
    比的根本不是同一個顏色。顏色那一關是整條流程最強的一關，被這個
    bug 廢掉了。

    所以改成**一張參考圖一列**，並且把檔名裡的完整編碼（含色號）一起
    存下來，查到之後就答得出「哪一個顏色」。
    """
    import re as _re

    from ..imageio import load_rgb
    from ..vision import grid as G
    from ..vision import keypoints as KP
    from . import refs as R

    out = Path(out) if out else (cfg.path("outputs") / "指紋")
    out.mkdir(parents=True, exist_ok=True)
    allrefs = R.collect(cfg, max_per_sku=max(per_sku, 1))
    skus = sorted(allrefs)
    if limit:
        skus = skus[:limit]
    if not skus:
        return {"錯誤": "沒有讀到任何參考圖，確認 settings.yaml 的 paths"}

    n_img = sum(len(allrefs.get(s) or []) for s in skus)
    log(f"要處理 {len(skus):,} 款、{n_img:,} 張參考圖"
        f"（平均一款 {n_img / max(len(skus), 1):.1f} 個顏色／角度）")
    sig_rows: list[np.ndarray] = []
    thumbs: list[bytes] = []
    kept: list[str] = []          # 每一列的貨號（會重複）
    codes: list[str] = []         # 檔名裡的完整編碼，含色號
    srcs: list[str] = []
    desc_store: list[np.ndarray] = []
    pts_store: list[np.ndarray] = []
    det_rows: list[int] = []      # 有細節的是第幾列

    # 檔名裡「KA + 7 碼」之後還黏著的數字就是色號（KA126902670F → 70）。
    full = _re.compile(r"(KA\d{7})(\d{0,3})", _re.I)
    done = 0
    for sku in skus:
        for it in (allrefs.get(sku) or []):
            p_ = Path(it["path"])
            try:
                im = load_rgb(p_)
                sig = G.cell_signature(im)
            except Exception:
                continue
            if not sig.get("有效格"):
                continue
            m = full.search(p_.name)
            if with_thumbs:
                thumbs.append(_thumb(im))
            sig_rows.append(_flatten(sig))
            kept.append(sku)
            codes.append((m.group(0).upper() if m else sku))
            srcs.append(it["來源"])
            if with_details:
                try:
                    d = KP.describe_query(im)
                except Exception:
                    d = None
                if d is not None:
                    pts, des = d
                    if len(des) > max_kp:
                        pts, des = pts[:max_kp], des[:max_kp]
                    pts_store.append(pts.astype(np.float32))
                    desc_store.append(des.astype(np.uint8))
                    det_rows.append(len(kept) - 1)
        done += 1
        if done % 200 == 0:
            log(f"  {done}/{len(skus)} 款")

    if not kept:
        return {"錯誤": "一款都算不出指紋"}

    colour_p = out / "指紋_顏色.npz"
    np.savez_compressed(
        colour_p, version=np.array([VERSION]),
        skus=np.array(kept), codes=np.array(codes), sources=np.array(srcs),
        sig=np.stack(sig_rows).astype(np.float16))
    n_sku = len(set(kept))
    res: dict[str, Any] = {
        "款數": n_sku, "參考圖數": len(kept), "顏色指紋": str(colour_p),
        "顏色指紋MB": round(colour_p.stat().st_size / 1024 / 1024, 2)}

    if with_thumbs and thumbs:
        th_p = out / "指紋_縮圖.npz"
        np.savez_compressed(
            th_p, version=np.array([VERSION]),
            lengths=np.array([len(b) for b in thumbs], dtype=np.int32),
            blob=np.frombuffer(b"".join(thumbs), dtype=np.uint8))
        res["縮圖"] = str(th_p)
        res["縮圖MB"] = round(th_p.stat().st_size / 1024 / 1024, 2)

    if with_details and desc_store:
        det_p = out / "指紋_細節.npz"
        np.savez_compressed(
            det_p, version=np.array([VERSION]),
            rows=np.array(det_rows, dtype=np.int32),
            counts=np.array([len(d) for d in desc_store]),
            desc=np.concatenate(desc_store),
            pts=np.concatenate(pts_store))
        res["細節指紋"] = str(det_p)
        res["細節指紋MB"] = round(det_p.stat().st_size / 1024 / 1024, 2)
        res["有細節的參考圖數"] = len(det_rows)

    # 商品資料：查到貨號之後要顯示的東西。很小，一起帶走。
    try:
        import pandas as pd

        from .find import master, stock

        names, sales = master(cfg)
        inv = stock(cfg)
        rows = []
        for sku in sorted(set(kept)):
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

        # 空欄位要在**這裡**講，不要等使用者上傳完、查了才發現查不到。
        # 先前那一版 3,320 款裡定價 0 筆、庫存 0 筆，他是在我這邊才知道的。
        n = len(rows)
        gaps = []
        miss_name = sum(1 for r in rows if not r["品名"])
        if miss_name:
            gaps.append(f"{miss_name:,}/{n:,} 款沒有品名 —— "
                        "第一關（特徵詞）找不到這些款。主表缺這些貨號，"
                        "先跑 `cli build` 重建主表。")
        if not any(r["定價"] for r in rows):
            gaps.append("定價全部是空的 —— 主表沒有 list_price 欄，"
                        "ERP 匯出時請含「定價／售價」。")
        if not any(r["顏色尺寸庫存"] for r in rows):
            gaps.append("庫存全部是空的 —— 少了 "
                        "data/interim/stock_by_variant.parquet。"
                        "先跑 `cli ingest`（選單 1），"
                        "而且 ERP 匯出要含「貨品編號＋顏色＋尺寸＋總存」。")
        res["缺口"] = gaps
    except Exception:
        pass
    return res


def verify(cfg, folder: str | Path, *, n: int = 40,
           log: Callable[[str], None] = print) -> dict[str, Any]:
    """剛做好的指紋檔，就地驗一次 —— **在有圖的那台電腦上**。

    這支存在的理由跟準確率無關，跟使用者的時間有關。先前的流程是：
    他跑匯出 → 上傳 → 我這邊發現格式或內容有問題 → 他再跑一次。
    驗證在我這邊，他就得一直當跑腿。

    所以把驗證搬到匯出的下一步：隨機抽 n 張系統圖，退化成「手機隨手拍」
    （同 selfeval 的做法），拿剛寫好的指紋檔去查，看找不找得回原圖。
    每張圖自己就帶著答案（檔名就是貨號），**不需要任何人工標註**。

    數字不對就當場知道，不必等上傳完才發現。
    """
    import random

    from ..imageio import load_rgb
    from . import find as F
    from . import refs as R
    from . import selfeval as SE

    index = load(Path(folder))
    if index.get("錯誤"):
        return {"錯誤": index["錯誤"]}
    allrefs = R.collect(cfg)
    pool = [(sku, it) for sku, items in allrefs.items() for it in items]
    if not pool:
        return {"錯誤": "找不到系統圖，沒辦法驗"}
    random.Random(0).shuffle(pool)

    import tempfile

    t1 = t5 = done = 0
    with tempfile.TemporaryDirectory() as tmp:
        for sku, it in pool:
            if done >= n:
                break
            try:
                im = load_rgb(Path(it["path"]))
                q = Path(tmp) / "q.jpg"
                SE.simulate(im, seed=done + 1).save(q, quality=88)
                r = F.run(cfg, photo=str(q), index=index, top=5,
                          log=lambda *_: None)
            except Exception:
                continue
            got = [x["貨號"] for x in r["候選"]]
            done += 1
            t1 += got[:1] == [sku]
            t5 += sku in got[:5]
            if done % 10 == 0:
                log(f"  驗到 {done}/{n}…")
    if not done:
        return {"錯誤": "一題都跑不起來"}
    out = {"題數": done, "Top-1": round(t1 / done, 4),
           "Top-5": round(t5 / done, 4)}
    log(f"\n自我驗證：{done} 題　Top-1 {out['Top-1']:.1%}　"
        f"Top-5 {out['Top-5']:.1%}")
    # 這是「退化過的系統圖找回系統圖」，比真的穿搭照容易。所以它是
    # **下限**：這裡都不及格，真照片一定更差，不必上傳了先修。
    if out["Top-1"] < 0.60:
        log("！這個數字太低了。指紋檔有問題，先不要上傳 —— "
            "多半是 settings.yaml 的 system_images 路徑指到了別的東西。")
    elif out["Top-1"] < 0.80:
        log("△ 偏低。這是退化過的系統圖找回自己，算是最容易的題目；"
            "真的穿搭照只會更難。")
    else:
        log("✓ 指紋檔沒問題。注意這是最容易的題目（系統圖找系統圖），"
            "真的穿搭照會低不少。")
    return out


def _thumb(im, px: int = THUMB_PX) -> bytes:
    """縮圖成一小塊 JPEG。理由見 THUMB_PX 的註解。"""
    import io

    from PIL import Image as _I

    w, h = im.size
    k = px / max(w, h)
    small = im.resize((max(1, int(w * k)), max(1, int(h * k))), _I.LANCZOS)
    buf = io.BytesIO()
    small.convert("RGB").save(buf, "JPEG", quality=70, optimize=True)
    return buf.getvalue()


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
    # **每個 z[...] 都會把那個陣列從 zip 裡重新解壓一次**，NpzFile 不做快取。
    # 所以一律先整個取出來放進區域變數，不要在迴圈裡索引 —— 先前
    # `z["sources"][i]` 寫在 3,320 次的迴圈內，光這一行就要 5 分鐘。
    # 一列 = 一張參考圖 = 一個顏色。同一個貨號會出現好幾列，所以用
    # 「指紋:<列號>」當鍵，再用 `貨號的圖` 把列號歸回貨號底下 ——
    # find.run 本來就會在同一個貨號的多張參考圖裡取最好的那張。
    row_sku = [str(s) for s in z["skus"]]
    sig = z["sig"].astype(np.float32)
    srcs = [str(x) for x in z["sources"]] if "sources" in z else []
    codes = [str(x) for x in z["codes"]] if "codes" in z else list(row_sku)
    per: dict[str, list[int]] = {}
    for i, s in enumerate(row_sku):
        per.setdefault(s, []).append(i)
    out: dict[str, Any] = {
        "貨號": sorted(per),
        "列貨號": row_sku,
        "貨號的圖": per,
        "色號": codes,
        "簽名": {f"指紋:{i}": _unflatten(sig[i]) for i in range(len(row_sku))},
        "來源": {f"指紋:{i}": (srcs[i] if srcs else "指紋")
                 for i in range(len(row_sku))},
        "細節": {},
    }
    dp = folder / "指紋_細節.npz" if folder.is_dir() else None
    if dp and dp.exists():
        d = np.load(dp, allow_pickle=False)
        if str(d["version"][0]) == VERSION and "rows" in d:
            rows_ = d["rows"]
            counts = d["counts"]
            pts, desc = d["pts"], d["desc"]
            k = 0
            for i in range(len(rows_)):
                n = int(counts[i])
                out["細節"][f"指紋:{int(rows_[i])}"] = (
                    pts[k:k + n].astype(np.float32),
                    desc[k:k + n].astype(np.uint8))
                k += n
    tp = folder / "指紋_縮圖.npz" if folder.is_dir() else None
    out["縮圖"] = []
    if tp and tp.exists():
        t = np.load(tp, allow_pickle=False)
        if str(t["version"][0]) == VERSION:
            blob = t["blob"].tobytes()
            k = 0
            for ln in t["lengths"]:
                n = int(ln)
                out["縮圖"].append(blob[k:k + n])
                k += n

    ip = folder / "指紋_商品.csv" if folder.is_dir() else None
    out["商品"] = _read_info(ip) if ip and ip.exists() else {}
    return out


def auto(cfg) -> dict[str, Any] | None:
    """找出這台機器上可用的指紋檔；沒有就回 None。

    部署到網站、或把指紋檔帶到另一台電腦時，那裡通常只有這三個檔，
    沒有 2.69 GB 的圖，也沒有主表與 POS 報表。這支讓查詢在那種機器上
    也能直接跑，不必每次都手動指定路徑。

    **圖優先。** 有圖就用圖 —— 指紋是拍完照的快照，新品上架之後還沒
    重跑，就會少掉那幾款；有圖的機器不該冒這個險。所以呼叫端只在
    收不到任何參考圖時才問這支。
    """
    folder = _folder(cfg)
    return load(folder) if folder else None


def describe(cfg) -> dict[str, Any]:
    """指紋檔的狀態，不把 16 MB 的描述子讀進記憶體。

    健康檢查會被一直輪詢，所以這支只開顏色檔的表頭。要真的比對才用
    `auto()`／`load()`。
    """
    folder = _folder(cfg)
    if folder is None:
        return {"有指紋": False}
    cp = folder / "指紋_顏色.npz"
    try:
        z = np.load(cp, allow_pickle=False)
        ver = str(z["version"][0]) if "version" in z else "?"
        if ver != VERSION:
            return {"有指紋": False,
                    "錯誤": f"指紋是 {ver} 版，這支程式要 {VERSION} 版 —— "
                            "請在有圖的機器上重跑 cli fingerprint"}
        n = int(z["skus"].shape[0])
    except Exception as exc:
        return {"有指紋": False, "錯誤": f"{type(exc).__name__}: {exc}"}
    dp = folder / "指紋_細節.npz"
    return {"有指紋": True, "款數": n, "資料夾": str(folder),
            "有細節": dp.exists(), "有商品資料": (folder / "指紋_商品.csv").exists(),
            "算出來的時間": _mtime(cp)}


def _folder(cfg) -> Path | None:
    conf = cfg.get("search", {}) or {}
    named = str(conf.get("index") or "").strip()
    cands = ([Path(named)] if named else []) + [cfg.path("outputs") / "指紋"]
    return next((f for f in cands if (f / "指紋_顏色.npz").exists()), None)


def _mtime(p: Path) -> str:
    from datetime import datetime

    try:
        return datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
    except OSError:
        return ""


def _read_info(path: Path) -> dict[str, dict[str, Any]]:
    """指紋_商品.csv → `{貨號: {品名, 售罄, 定價, 可售總數, 庫存明細}}`。

    查到貨號之後真正要問的是「有沒有貨、什麼顏色、什麼尺寸」。那些數字
    本來在主表與 POS 報表裡，但帶著指紋走的機器上沒有那兩份資料，
    所以匯出時就把它們寫進這個 CSV 一起帶走。
    """
    import pandas as pd

    try:
        df = pd.read_csv(path, dtype=str, keep_default_na=False)
    except Exception:
        return {}
    got: dict[str, dict[str, Any]] = {}
    for row in df.to_dict("records"):
        sku = str(row.get("貨號", "")).strip()
        if not sku:
            continue
        got[sku] = {
            "品名": str(row.get("品名", "")).strip(),
            "售罄": _num(row.get("售罄")),
            "定價": _num(row.get("定價")),
            "可售總數": _num(row.get("可售總數")),
            "庫存明細": _variants(row.get("顏色尺寸庫存", "")),
        }
    return got


def _variants(text: Any) -> list[dict[str, Any]]:
    """「藍/S:3；藍/M:0」→ 一筆一筆的顏色尺寸庫存。

    分隔字元本身可能出現在顏色名裡（「藍/白」），所以尺寸取最後一段、
    庫存取最後一個冒號之後 —— 拆錯也只是顯示不好看，不會影響名次。
    """
    rows: list[dict[str, Any]] = []
    for part in str(text or "").split("；"):
        part = part.strip()
        if not part or ":" not in part:
            continue
        cs, qty = part.rsplit(":", 1)
        colour, sep, size = cs.rpartition("/")
        if not sep:
            colour, size = cs, ""
        rows.append({"顏色": colour, "尺寸": size, "庫存": _num(qty, int),
                     "另一套庫存數": None, "已售": None})
    return rows


def _num(v: Any, kind: type = float):
    try:
        s = str(v).strip()
        return kind(float(s)) if s else None
    except (TypeError, ValueError):
        return None


def check() -> list[str]:
    """回歸測試：寫得出去的，要原封不動讀得回來。

    守住三件事。一是 float16 壓縮與 NaN 佔位不能把簽名弄壞 —— 壞了不會
    報錯，只會讓名次悄悄變差。二是版本對不上一定要出聲，寧可不答也不要
    用舊指紋算出一份看起來很正常的錯名次。三是商品 CSV 要解得回顏色
    尺寸庫存，否則帶著指紋走的機器只答得出貨號。
    """
    import tempfile

    from ..vision import grid as G

    bad: list[str] = []
    plain = G.cell_signature(G._synthetic(False))
    striped = G.cell_signature(G._synthetic(True))
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        # 同一個貨號兩個顏色 —— fp2 的重點就在這裡，一定要測得到。
        np.savez_compressed(
            folder / "指紋_顏色.npz", version=np.array([VERSION]),
            skus=np.array(["KA0000001", "KA0000001", "KA0000002"]),
            codes=np.array(["KA000000170", "KA000000199", "KA000000210"]),
            sources=np.array(["系統圖", "系統圖", "系統圖"]),
            sig=np.stack([_flatten(plain), _flatten(striped),
                          _flatten(striped)]).astype(np.float16))
        (folder / "指紋_商品.csv").write_text(
            "貨號,品名,售罄,定價,可售總數,顏色尺寸庫存\n"
            "KA0000001,素面上衣,0.42,1280,5,藍/S:3；藍/M:0；藍/白/L:2\n"
            "KA0000002,橫紋上衣,,,,\n", encoding="utf-8-sig")
        got = load(folder)

        (folder / "指紋_顏色.npz").unlink()
        np.savez_compressed(
            folder / "指紋_顏色.npz", version=np.array(["fp0"]),
            skus=np.array(["KA0000001"]), codes=np.array(["KA000000170"]),
            sources=np.array(["系統圖"]),
            sig=np.stack([_flatten(plain)]).astype(np.float16))
        if not load(folder).get("錯誤"):
            bad.append("指紋版本對不上卻照樣載入 —— 會安靜地算出錯的名次")

    if got.get("錯誤"):
        return bad + [f"寫得出去卻讀不回來：{got['錯誤']}"]

    if got["貨號"] != ["KA0000001", "KA0000002"]:
        bad.append(f"貨號沒有去重：{got['貨號']}")
    if (got.get("貨號的圖") or {}).get("KA0000001") != [0, 1]:
        bad.append("同一款的兩個顏色沒有歸在一起："
                   f"{(got.get('貨號的圖') or {}).get('KA0000001')}")
    if (got.get("色號") or [""])[1] != "KA000000199":
        bad.append(f"色號讀不回來：{got.get('色號')}")
    pk = G.pack({k: got["簽名"][k] for k in sorted(got["簽名"])})
    d = G.distance({**plain, "段": "x"}, pk)
    if d[0] > 1.0:
        bad.append(f"存進去再讀回來，同一張圖對自己的距離 {d[0]:.2f}，"
                   "應該接近 0（float16 壓壞了簽名）")
    if d[1] < 5.0:
        bad.append(f"讀回來之後素面對橫紋只差 {d[1]:.2f}，分不出花色")

    a = (got.get("商品") or {}).get("KA0000001") or {}
    if a.get("品名") != "素面上衣":
        bad.append(f"商品 CSV 的品名讀成 {a.get('品名')!r}")
    if a.get("定價") != 1280:
        bad.append(f"商品 CSV 的定價讀成 {a.get('定價')!r}")
    v = a.get("庫存明細") or []
    if [(x["顏色"], x["尺寸"], x["庫存"]) for x in v] != [
            ("藍", "S", 3), ("藍", "M", 0), ("藍/白", "L", 2)]:
        bad.append(f"顏色尺寸庫存拆錯了：{v}")
    if (got.get("商品") or {}).get("KA0000002", {}).get("庫存明細") != []:
        bad.append("沒有庫存的那一款應該拆出空清單")
    return bad
