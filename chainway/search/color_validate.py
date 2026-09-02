"""拿貨號裡的色號當標準答案，驗證從圖片量色準不準。

## 這一步為什麼是整件事的轉折

在此之前，顏色判讀的所有數字都是自我測試：拿色票餵回色票、拿合成圖測合成圖。
那只能證明程式沒寫錯，不能證明它在真實商品照上有用。

貨號帶色號（KA1151002 + 56 藏青 + 36）之後，情況完全不同 ——
**每一張系統圖都是一道有標準答案的題目**：檔名說它是 56，圖片說它看起來是什麼。
幾千張圖就是幾千道題。這才叫量準確率。

## 兩個產出，重要性不同

**驗證**：色號猜對幾成、色相族猜對幾成、ΔE 分布長怎樣。

**校準**（更重要）：每個色號蒐集到幾十上百件實際商品的量測值，取中位數，
那個中位數比印刷色卡更貼近「這個色號在貴司實際布料上長什麼樣」。
色卡是 CMYK 油墨、商品是染料，兩者本來就不同 —— 用商品自己校準，
等於跳過印刷這一層誤差。

校準值不會自動覆寫色卡：寫進 `calibrated_lab` 另存一欄，
並要求該色號至少有 MIN_SAMPLES 件商品才採用。少數幾件的中位數不穩，
而且拍攝條件若剛好一致，會把系統性偏差固化成「標準」。

## 一個必須避開的陷阱

同一款會有多張圖（正面、背面、細部）。細部圖多半是局部特寫，
量到的顏色可能是配色而不是主色。所以以「款×色」為單位取中位數，
而不是把每張圖當獨立樣本 —— 否則圖多的款會主導校準結果。
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from ..ingest.color_discovery import build_sku_color_map
from .colorcard import delta_e_2000, lab_to_hex
from .colorcode import _lab_of, family_of, load_table

# 一個色號至少要有這麼多「款×色」才拿來校準。
# 少數幾件的中位數不穩，而且若那幾件剛好在同一批拍攝條件下，
# 會把系統性偏差當成標準固化下來。
MIN_SAMPLES = 8


def measure_images(pairs: pd.DataFrame, *, n_colors: int = 2,
                   progress: bool = True) -> pd.DataFrame:
    """對每張圖量主色。回傳加上 L/a/b 與 HEX 的表。"""
    from PIL import Image
    from .palette import palette

    rows: list[dict[str, Any]] = []
    total = len(pairs)
    for i, (_, r) in enumerate(pairs.iterrows(), start=1):
        if progress and i % 50 == 0:
            print(f"  量色 {i}/{total}", end="\r", flush=True)
        try:
            with Image.open(r["image_path"]) as im:
                im.load()
                pal = palette(im, n_colors)
        except Exception:
            continue
        if not pal:
            continue
        lab, weight = pal[0]          # 佔比最大的當主色
        rows.append({**r.to_dict(), "L": float(lab[0]), "a": float(lab[1]),
                     "b": float(lab[2]), "主色佔比": round(float(weight), 3),
                     "量到HEX": lab_to_hex(lab)})
    if progress:
        print()
    return pd.DataFrame(rows)


def validate(measured: pd.DataFrame, table: dict[str, Any] | None = None
             ) -> tuple[pd.DataFrame, dict[str, Any]]:
    """比對量到的顏色與貨號宣告的色號。回傳 (逐筆結果, 摘要)。"""
    table = table or load_table()
    codes = table["codes"]
    ref = {c: _lab_of(e) for c, e in codes.items() if _lab_of(e) is not None}
    if not ref:
        raise ValueError("色號表裡沒有任何色值，無法比對")
    ref_codes = list(ref)
    ref_lab = np.stack([ref[c] for c in ref_codes])

    rows = []
    for _, r in measured.iterrows():
        truth = str(r["色號"])
        if truth not in ref:
            continue                                  # 色卡上沒有這一號，跳過
        lab = np.array([r["L"], r["a"], r["b"]])
        de_all = delta_e_2000(lab, ref_lab)
        best = ref_codes[int(np.argmin(de_all))]
        fam, fam_name, _ = family_of(lab, table)
        rows.append({
            **{k: r[k] for k in ("款號", "色號", "尺寸", "image_path", "量到HEX")
               if k in r},
            "宣告名稱": codes[truth].get("zh") or codes[truth].get("en") or "",
            "猜到色號": best,
            "猜到名稱": codes[best].get("zh") or codes[best].get("en") or "",
            "色號正確": best == truth,
            "色相族正確": best[0] == truth[0],
            "影像色相族": fam,
            "ΔE對宣告色": round(float(delta_e_2000(lab, ref[truth].reshape(1, 3))[0]), 2),
            "L": r["L"], "a": r["a"], "b": r["b"],
        })
    detail = pd.DataFrame(rows)
    if detail.empty:
        return detail, {"筆數": 0}

    summary = {
        "筆數": len(detail),
        "不同款×色": int(detail.groupby(["款號", "色號"]).ngroups),
        "色號正確率": round(float(detail["色號正確"].mean()), 4),
        "色相族正確率": round(float(detail["色相族正確"].mean()), 4),
        "ΔE中位數": round(float(detail["ΔE對宣告色"].median()), 2),
        "ΔE_90百分位": round(float(detail["ΔE對宣告色"].quantile(0.9)), 2),
    }
    return detail, summary


def per_code(detail: pd.DataFrame, table: dict[str, Any] | None = None
             ) -> pd.DataFrame:
    """逐色號的表現與校準建議。

    以「款×色」為單位取中位數 —— 同一款的正面／背面／細部圖不該各算一票，
    否則圖多的款會主導整個色號的校準值。
    """
    table = table or load_table()
    codes = table["codes"]
    if detail.empty:
        return detail
    per_style = (detail.groupby(["色號", "款號"])[["L", "a", "b"]]
                 .median().reset_index())
    rows = []
    for code, g in per_style.groupby("色號"):
        d = detail[detail["色號"] == code]
        med = g[["L", "a", "b"]].median().to_numpy()
        card = _lab_of(codes.get(code, {}))
        rows.append({
            "色號": code,
            "名稱": codes.get(code, {}).get("zh") or codes.get(code, {}).get("en") or "",
            "款×色數": len(g), "圖片數": len(d),
            "色號正確率": round(float(d["色號正確"].mean()), 3),
            "色相族正確率": round(float(d["色相族正確"].mean()), 3),
            "色卡HEX": lab_to_hex(card) if card is not None else "",
            "商品中位HEX": lab_to_hex(med),
            "色卡vs商品ΔE": (round(float(delta_e_2000(med, card.reshape(1, 3))[0]), 2)
                          if card is not None else None),
            "可校準": len(g) >= MIN_SAMPLES,
            "calibrated_lab": [round(float(v), 1) for v in med],
        })
    return (pd.DataFrame(rows)
            .sort_values(["可校準", "款×色數"], ascending=[False, False])
            .reset_index(drop=True))


def write_calibration(per: pd.DataFrame, path: str | Path) -> int:
    """把可校準的色號寫成一份 YAML 片段，讓人檢視後再決定要不要併入。

    刻意不直接改 config/color_codes.yaml —— 校準值是從商品照推回來的，
    值得看過再採用。自動覆寫等於把一個判斷偷偷替使用者做掉。
    """
    ok = per[per["可校準"]]
    lines = [
        "# 由實際商品照校準出來的色值（以款×色為單位取中位數）。",
        "# 來源是商品本身，不是印刷色卡 —— 跳過了 CMYK 油墨那一層誤差。",
        f"# 只列出樣本數 >= {MIN_SAMPLES} 的色號；少數幾件的中位數不穩。",
        "#",
        "# 檢視過覺得合理，就把 calibrated_lab 貼進 config/color_codes.yaml，",
        "# 改成該色號的 lab: [L, a, b]。程式會優先用 lab，沒有才用 hex。",
        "",
    ]
    for _, r in ok.iterrows():
        lines.append(
            f'"{r["色號"]}": {{zh: "{r["名稱"]}", lab: {r["calibrated_lab"]}}}'
            f'   # {r["款×色數"]} 款×色，色卡差 ΔE{r["色卡vs商品ΔE"]}')
    Path(path).write_text("\n".join(lines) + "\n", encoding="utf-8")
    return len(ok)


def run(cfg=None, *, limit: int | None = None,
        erp: str | None = None) -> dict[str, Any]:
    """完整流程：取得款號×色號 → 量色 → 驗證 → 逐色號校準建議。

    色號的來源有兩個，優先用 ERP 匯出檔：那是系統裡的事實。
    檔名只有在命名規則帶色號時才有用 —— 貴司的系統圖檔名只到款，
    所以實務上多半要走 ERP 這條。
    """
    from ..ingest.color_discovery import read_erp_export

    if erp:
        emap = read_erp_export(erp)
        if emap.empty:
            return {"pairs": emap, "detail": pd.DataFrame(),
                    "summary": {"筆數": 0}, "per_code": pd.DataFrame(),
                    "note": "ERP 匯出檔裡找不到帶色號的品號"}
        # ERP 給的是「款×色」，圖片是「款」一張 —— 用款號接起來。
        # 同一款有多個顏色時，那一款的圖無法判斷是哪一色，必須排除，
        # 否則等於拿一張圖去對三個不同的標準答案，量到的準確率沒有意義。
        n_color = emap.groupby("款號")["色號"].nunique()
        single = set(n_color[n_color == 1].index)
        uniq = (emap[emap["款號"].isin(single)]
                .drop_duplicates(subset=["款號", "色號"]))
        imgs = build_sku_color_map(cfg, pattern=None)
        if imgs.empty:
            from ..ingest.color_discovery import SKU_RE
            from ..config import get_config
            cfg2 = cfg or get_config()
            rows = []
            for root in [r for r in cfg2.path_list("system_images") if r.exists()]:
                for p in root.rglob("*"):
                    if p.is_file() and not p.name.startswith(("~$", ".")):
                        m = SKU_RE.search(p.stem)
                        if m:
                            rows.append({"款號": m.group(1).upper(),
                                         "image_path": str(p)})
            imgs = pd.DataFrame(rows)
        pairs = imgs.merge(uniq[["款號", "色號", "尺寸"]], on="款號", how="inner")
        pairs.attrs["來源"] = "ERP"
        pairs.attrs["單色款"] = len(single)
        pairs.attrs["多色款排除"] = int((n_color > 1).sum())
    else:
        pairs = build_sku_color_map(cfg)
    if pairs.empty:
        return {"pairs": pairs, "detail": pd.DataFrame(),
                "summary": {"筆數": 0}, "per_code": pd.DataFrame()}
    if limit:
        pairs = pairs.head(limit)
    measured = measure_images(pairs)
    detail, summary = validate(measured)
    return {"pairs": pairs, "measured": measured, "detail": detail,
            "summary": summary, "per_code": per_code(detail)}
