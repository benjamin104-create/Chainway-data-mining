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
    # **每個 z[...] 都會把那個陣列從 zip 裡重新解壓一次**，NpzFile 不做快取。
    # 所以一律先整個取出來放進區域變數，不要在迴圈裡索引 —— 先前
    # `z["sources"][i]` 寫在 3,320 次的迴圈內，光這一行就要 5 分鐘。
    skus = [str(s) for s in z["skus"]]
    sig = z["sig"].astype(np.float32)
    srcs = [str(x) for x in z["sources"]] if "sources" in z else []
    out: dict[str, Any] = {
        "貨號": skus,
        "簽名": {s: _unflatten(sig[i]) for i, s in enumerate(skus)},
        "來源": {s: srcs[i] for i, s in enumerate(skus)} if srcs else {},
        "細節": {},
    }
    dp = folder / "指紋_細節.npz" if folder.is_dir() else None
    if dp and dp.exists():
        d = np.load(dp, allow_pickle=False)
        if str(d["version"][0]) == VERSION:
            d_skus = [str(s) for s in d["skus"]]
            counts = d["counts"]
            pts, desc = d["pts"], d["desc"]
            k = 0
            for i, s in enumerate(d_skus):
                n = int(counts[i])
                out["細節"][s] = (pts[k:k + n].astype(np.float32),
                                  desc[k:k + n].astype(np.uint8))
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
        np.savez_compressed(
            folder / "指紋_顏色.npz", version=np.array([VERSION]),
            skus=np.array(["KA0000001", "KA0000002"]),
            sources=np.array(["系統圖", "系統圖"]),
            sig=np.stack([_flatten(plain),
                          _flatten(striped)]).astype(np.float16))
        (folder / "指紋_商品.csv").write_text(
            "貨號,品名,售罄,定價,可售總數,顏色尺寸庫存\n"
            "KA0000001,素面上衣,0.42,1280,5,藍/S:3；藍/M:0；藍/白/L:2\n"
            "KA0000002,橫紋上衣,,,,\n", encoding="utf-8-sig")
        got = load(folder)

        (folder / "指紋_顏色.npz").unlink()
        np.savez_compressed(
            folder / "指紋_顏色.npz", version=np.array(["fp0"]),
            skus=np.array(["KA0000001"]), sources=np.array(["系統圖"]),
            sig=np.stack([_flatten(plain)]).astype(np.float16))
        if not load(folder).get("錯誤"):
            bad.append("指紋版本對不上卻照樣載入 —— 會安靜地算出錯的名次")

    if got.get("錯誤"):
        return bad + [f"寫得出去卻讀不回來：{got['錯誤']}"]

    pk = G.pack({s: got["簽名"][s] for s in got["貨號"]})
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
