"""一個貨號有好幾張圖 —— 把它們全部找出來，而不是只挑一張。

## 先前丟掉了什麼

`index_images` 的規則是「同一貨號有多張時取檔案較大的那張」。一行註解，
丟掉的東西是這樣的：

    系統圖    白底去背的單件棚拍。原本只用這個。
    目錄圖    **穿在人身上拍的**。跟使用者上傳的穿搭照是同一個領域 ——
              不必跨那道最難的鴻溝（皺褶、遮擋、角度）。設定檔裡被整個
              排除掃描，理由是「20,558 檔、58.9 GB、許多沒有貨號」。
              檔名有貨號的那些是金礦，用檔名過濾就好，不必全掃。
    打樣照片  指示書裡抽出來的真實照片。有皺褶、有陰影、有真實光線。
    布樣      布料特寫。織紋、格紋的真實尺度，系統圖上看不清楚。
    繡花圖稿  繡花的原始線稿。關鍵點比對最吃得到的東西。

同一款有五種不同拍法，等於五次機會認出它。只留一張是拿三成的資訊去
回答一個十成的問題。

## 公平性：多的不能佔便宜

每款的參考圖數量不一樣（有的五張、有的只有系統圖一張）。如果直接
「取最好的那一張的分數」，圖多的款天生佔優 —— 五次抽樣的最小值本來就
比一次抽樣的最小值小，跟像不像無關。

這個陷阱我已經踩過一次：查詢圖「裁切版與全圖都比、取內點較多的」，
準確率從 83.8% 掉到 72.5%。

所以這裡**一定要扣掉那個便宜**。做法見 `penalty()`：期望最小值隨樣本數
的增長是可以算的，把它減回去。扣多少不是我猜的，是量出來的。
"""
from __future__ import annotations

import math
import re
from pathlib import Path
from typing import Any

import pandas as pd

SKU_RE = re.compile(r"KA\d{7}", re.I)
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
# 一款最多帶幾張參考圖。目錄圖有些款幾十張，全部比對只是拖慢，
# 而且同一場拍攝的連拍照彼此幾乎一樣，帶不進新資訊。
MAX_PER_SKU = 6
# 來源的優先序：同領域的排前面（穿在人身上的最像查詢照）。
ORDER = ["目錄圖", "打樣照片", "系統圖", "繡花圖稿", "布樣", "其他"]


def _scan(roots, kind: str) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    for root in roots or []:
        if not root or not Path(root).exists():
            continue
        for p in Path(root).rglob("*"):
            if (not p.is_file() or p.suffix.lower() not in EXTS
                    or p.name.startswith(("~$", "."))):
                continue
            m = SKU_RE.search(p.name)
            if not m:
                continue
            try:
                size = p.stat().st_size
            except OSError:
                continue
            out.setdefault(m.group(0).upper(), []).append(
                {"path": p, "來源": kind, "大小": size})
    return out


def _techpack(cfg) -> dict[str, list[dict[str, Any]]]:
    """指示書抽出來的圖。用 image_kind 判過的種類，只收看得到衣服的那幾類。

    章戳、線稿、版面不收 —— 它們跟「這件衣服長什麼樣」無關，收進來只會
    讓錯的候選多一次撿便宜的機會。
    """
    out: dict[str, list[dict[str, Any]]] = {}
    csv = cfg.path("interim") / "techpack_images.csv"
    want = {"打樣照片", "布樣", "繡花圖稿"}
    if csv.exists():
        try:
            df = pd.read_csv(csv)
            pcol = next((c for c in ("path", "image_path", "檔案") if c in df), None)
            kcol = next((c for c in ("kind", "種類", "判定") if c in df), None)
            scol = next((c for c in ("sku", "貨號", "款號") if c in df), None)
            if pcol and scol:
                for _, r in df.iterrows():
                    kind = str(r[kcol]) if kcol else "打樣照片"
                    if kcol and kind not in want:
                        continue
                    p = Path(str(r[pcol]))
                    if p.exists() and p.suffix.lower() in EXTS:
                        out.setdefault(str(r[scol]).upper(), []).append(
                            {"path": p, "來源": kind, "大小": p.stat().st_size})
                return out
        except Exception:
            pass
    # 沒有 CSV 就退回掃資料夾（抽圖時以貨號為資料夾名）
    root = cfg.path("outputs") / "techpack_images"
    if root.exists():
        for d in root.iterdir():
            if not d.is_dir() or not SKU_RE.fullmatch(d.name.upper()):
                continue
            for p in d.iterdir():
                if p.is_file() and p.suffix.lower() in EXTS:
                    out.setdefault(d.name.upper(), []).append(
                        {"path": p, "來源": "打樣照片", "大小": p.stat().st_size})
    return out


def collect(cfg, *, use_catalog: bool | None = None,
            use_techpack: bool | None = None,
            max_per_sku: int = MAX_PER_SKU) -> dict[str, list[dict[str, Any]]]:
    """貨號 → 參考圖清單（已依來源優先序排好、去重、截到上限）。

    **預設只用系統圖。** 不是因為其他來源沒用，是因為我量不出它們有用：
    我的測試庫裡的「目錄圖」是拿系統圖加雜訊合成的，不帶新資訊，加進去
    反而把 Top-1 從 83.8% 拉低到 70.0%（多一張圖，錯的候選也多一次
    撿便宜的機會）。真目錄圖有不同姿勢、真實垂墜與光線，那是新資訊 ——
    但那件事只有真資料證得了。

    所以：做好、接好、預設關閉，讓 `cli selftest --sources` 在真實影像庫
    上一次跑兩種設定，用數字決定要不要開。開關在 settings.yaml：

        search:
          use_catalog: true
          use_techpack: true
    """
    conf = cfg.get("search", {}) or {}
    if use_catalog is None:
        use_catalog = bool(conf.get("use_catalog", False))
    if use_techpack is None:
        use_techpack = bool(conf.get("use_techpack", False))
    got: dict[str, list[dict[str, Any]]] = {}

    def merge(part):
        for sku, items in part.items():
            got.setdefault(sku, []).extend(items)

    merge(_scan(cfg.path_list("system_images"), "系統圖"))
    if use_catalog:
        merge(_scan(cfg.path_list("catalog_images"), "目錄圖"))
    if use_techpack:
        merge(_techpack(cfg))

    out: dict[str, list[dict[str, Any]]] = {}
    for sku, items in got.items():
        seen: set[str] = set()
        uniq = []
        for it in sorted(items, key=lambda x: (ORDER.index(x["來源"])
                                               if x["來源"] in ORDER else 9,
                                               -x["大小"])):
            k = str(it["path"])
            if k in seen:
                continue
            seen.add(k)
            uniq.append(it)
        out[sku] = uniq[:max_per_sku]
    return out


def primary(refs: dict[str, list[dict[str, Any]]]) -> dict[str, Path]:
    """每款挑一張當代表圖（列表、縮圖用）。系統圖優先 —— 它最乾淨。"""
    out: dict[str, Path] = {}
    for sku, items in refs.items():
        best = next((i for i in items if i["來源"] == "系統圖"), None)
        out[sku] = (best or items[0])["path"] if items else None
    return {k: v for k, v in out.items() if v}


def penalty(n_refs: int, *, per_ref: float = 0.0) -> float:
    """圖多的款要扣多少，才不算佔便宜。

    `per_ref` 是每多一張參考圖要加回去的懲罰，單位跟距離相同。
    預設 0（不扣）—— 因為扣多少必須量，不能猜。`search.selfeval` 的
    `--refs` 模式就是拿來量這件事的：讓一半的款有多張參考圖、一半只有
    一張，看不公平有多嚴重，再決定這個數字。

    形狀用 sqrt(2·ln n)：n 個常態樣本的期望最大值就是這個量級。
    同一條公式先前抓出過「固定 3σ 門檻會放行不在目錄裡的衣服」——
    2,400 個樣本的期望最大值本來就有 3.9σ。
    """
    if n_refs <= 1 or per_ref <= 0:
        return 0.0
    return per_ref * math.sqrt(2.0 * math.log(n_refs))
