"""系統圖匯入：掃描去背商品照，從檔名解析貨號，建立影像清單。

預期檔名格式（可在 settings.yaml 的 sku.filename_pattern 調整）：
    CW24AW-TP-0135-BLK.png      → sku=CW24AW-TP-0135-BLK
    CW24AW-TP-0135-BLK_02.jpg   → 同款第 2 張（view=02）
子資料夾名稱若為季別或品類，會一併記錄，作為缺值時的備援。
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from pathlib import Path

import pandas as pd

from ..config import Config, get_config

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
_VIEW_RE = re.compile(r"[_-](\d{1,2})$")


@dataclass
class ImageRecord:
    image_path: str
    file_name: str
    sku: str
    style_code: str
    view: str
    folder: str


def parse_sku(stem: str, cfg: Config) -> tuple[str, str]:
    """從檔名主幹解析 (sku, style_code)。"""
    rules = cfg.get("sku", {})
    pattern = rules.get("filename_pattern")

    sku = stem
    if pattern:
        m = re.search(pattern, stem)
        if m:
            sku = m.group(1)

    style_pattern = rules.get("style_code_pattern")
    style_code = sku
    if style_pattern:
        m = re.match(style_pattern, sku)
        if m and m.group(1):
            style_code = m.group(1)
    return sku, style_code


def scan_images(cfg: Config | None = None, root: Path | None = None) -> pd.DataFrame:
    cfg = cfg or get_config()
    root = root or cfg.path("system_images")
    if not root.exists():
        raise FileNotFoundError(
            f"系統圖資料夾不存在：{root}\n"
            "請在 config/settings.yaml 的 paths.system_images 填入公司實際路徑。"
        )

    records: list[ImageRecord] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in IMAGE_EXTS:
            continue
        stem = path.stem
        view = "01"
        m = _VIEW_RE.search(stem)
        if m:
            view = m.group(1).zfill(2)
            stem_for_sku = stem[: m.start()]
        else:
            stem_for_sku = stem
        sku, style_code = parse_sku(stem_for_sku, cfg)
        records.append(
            ImageRecord(
                image_path=str(path),
                file_name=path.name,
                sku=sku,
                style_code=style_code,
                view=view,
                folder=str(path.parent.relative_to(root)) if path.parent != root else "",
            )
        )

    # 即使沒有任何圖，也要回傳帶完整欄位的空表 —— 下游程式才不用到處寫 if empty
    columns = list(ImageRecord.__dataclass_fields__) + ["is_primary"]
    if not records:
        return pd.DataFrame(columns=columns)

    df = pd.DataFrame([asdict(r) for r in records])
    # 同一貨號多張時，view 最小的視為主圖（用來做特徵萃取與縮圖）
    df = df.sort_values(["sku", "view"]).reset_index(drop=True)
    df["is_primary"] = ~df.duplicated("sku", keep="first")
    return df


def write_manifest(cfg: Config | None = None) -> Path:
    cfg = cfg or get_config()
    df = scan_images(cfg)
    out = cfg.path("interim") / "image_manifest.parquet"
    df.to_parquet(out, index=False)
    return out
