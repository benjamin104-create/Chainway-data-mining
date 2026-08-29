"""Fashion-CLIP 影像／文字向量萃取。

Fashion-CLIP 是把 OpenAI CLIP 用 80 萬筆時尚商品圖文對再訓練過的版本，
對「領型、袖型、廓形、材質」這類服裝語彙的辨識力遠高於原始 CLIP，
所以我們用它來做兩件事：
  1. 影像向量 (512 維) → 以圖搜圖、反查貨號、款式聚類
  2. 影像 × 文字比對   → zero-shot 標註設計屬性（不需要人工標訓練資料）

模型是懶載入的：只有真的要跑向量時才載入 torch，
其他分析流程（統計、報表、網頁）在沒有 GPU 甚至沒裝 torch 的電腦上也能跑。
"""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path

import numpy as np
import pandas as pd

from ..config import Config, get_config

log = logging.getLogger(__name__)

_MODEL = None
_PROCESSOR = None
_DEVICE = None


def _pick_device(pref: str) -> str:
    import torch

    if pref and pref != "auto":
        return pref
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def load_model(cfg: Config | None = None):
    """載入 Fashion-CLIP（同一個 process 只載一次）。"""
    global _MODEL, _PROCESSOR, _DEVICE
    if _MODEL is not None:
        return _MODEL, _PROCESSOR, _DEVICE

    cfg = cfg or get_config()
    clip_cfg = cfg.get("clip", {})
    try:
        import torch
        from transformers import CLIPModel, CLIPProcessor
    except ImportError as exc:  # pragma: no cover
        raise ImportError(
            "需要 torch 與 transformers 才能萃取影像特徵。\n"
            "請執行：pip install torch torchvision transformers\n"
            "（沒有顯卡也可以，CPU 跑 3000 張系統圖約 10–20 分鐘）"
        ) from exc

    model_id = clip_cfg.get("model_id", "patrickjohncyh/fashion-clip")
    device = _pick_device(clip_cfg.get("device", "auto"))
    log.info("載入 %s 到 %s", model_id, device)
    model = CLIPModel.from_pretrained(model_id).to(device).eval()
    processor = CLIPProcessor.from_pretrained(model_id)
    _MODEL, _PROCESSOR, _DEVICE = model, processor, device
    return model, processor, device


def prepare_image(path: str | Path, cfg: Config | None = None):
    """開圖 + 去背後補白底 + 置中補成正方形。

    系統圖是透明去背 PNG，直接丟給 CLIP 時透明區會被當成黑色，
    會嚴重干擾「色系」與「面料外觀」的判讀 —— 所以一定要先補底色。
    """
    from PIL import Image

    cfg = cfg or get_config()
    clip_cfg = cfg.get("clip", {})
    img = Image.open(path)

    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg_hex = clip_cfg.get("background", "#FFFFFF").lstrip("#")
        bg = tuple(int(bg_hex[i:i + 2], 16) for i in (0, 2, 4))
        canvas = Image.new("RGB", img.size, bg)
        canvas.paste(img, mask=img.split()[-1])
        img = canvas
    else:
        img = img.convert("RGB")

    if clip_cfg.get("pad_to_square", True):
        side = max(img.size)
        bg_hex = clip_cfg.get("background", "#FFFFFF").lstrip("#")
        bg = tuple(int(bg_hex[i:i + 2], 16) for i in (0, 2, 4))
        square = Image.new("RGB", (side, side), bg)
        square.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
        img = square
    return img


def embed_images(paths: list[str], cfg: Config | None = None, show_progress: bool = True) -> np.ndarray:
    """回傳 L2 正規化後的影像向量矩陣 (n, dim)。"""
    cfg = cfg or get_config()
    model, processor, device = load_model(cfg)   # 先載入，缺套件時會給可讀的說明
    import torch
    batch_size = int(cfg.get("clip", {}).get("batch_size", 16))

    vectors: list[np.ndarray] = []
    total = len(paths)
    for start in range(0, total, batch_size):
        chunk = paths[start:start + batch_size]
        images = [prepare_image(p, cfg) for p in chunk]
        inputs = processor(images=images, return_tensors="pt").to(device)
        with torch.no_grad():
            feats = model.get_image_features(**inputs)
        feats = feats / feats.norm(dim=-1, keepdim=True)
        vectors.append(feats.cpu().numpy().astype("float32"))
        if show_progress:
            done = min(start + batch_size, total)
            print(f"  影像特徵 {done}/{total}", end="\r", flush=True)
    if show_progress:
        print()
    return np.vstack(vectors) if vectors else np.zeros((0, 512), dtype="float32")


def embed_texts(texts: list[str], cfg: Config | None = None) -> np.ndarray:
    """回傳 L2 正規化後的文字向量矩陣，與影像向量在同一個語意空間。"""
    cfg = cfg or get_config()
    model, processor, device = load_model(cfg)
    import torch
    inputs = processor(text=texts, return_tensors="pt", padding=True, truncation=True).to(device)
    with torch.no_grad():
        feats = model.get_text_features(**inputs)
    feats = feats / feats.norm(dim=-1, keepdim=True)
    return feats.cpu().numpy().astype("float32")


# ---------------------------------------------------------------- 快取


def _cache_key(paths: list[str], model_id: str) -> str:
    h = hashlib.sha256(model_id.encode())
    for p in paths:
        try:
            st = Path(p).stat()
            h.update(f"{p}|{st.st_size}|{int(st.st_mtime)}".encode())
        except OSError:
            h.update(p.encode())
    return h.hexdigest()[:16]


def build_image_embeddings(
    manifest: pd.DataFrame,
    cfg: Config | None = None,
    primary_only: bool = True,
    use_cache: bool = True,
) -> tuple[pd.DataFrame, np.ndarray]:
    """對 image_manifest 產生向量。回傳 (對齊的 metadata, 向量矩陣)。

    向量另存 .npy，metadata 存 parquet —— 分開存是因為向量檔會很大，
    每次改欄位不用重跑模型。
    """
    cfg = cfg or get_config()
    if manifest.empty:
        return manifest.reset_index(drop=True), np.zeros((0, 512), dtype="float32")

    if primary_only and "is_primary" in manifest:
        # 一定要轉成 bool：空表或 parquet 來回後 is_primary 可能是 object dtype，
        # 這時 df[series] 會被 pandas 當成「選這些欄位」而不是「篩這些列」。
        df = manifest[manifest["is_primary"].astype(bool)]
    else:
        df = manifest
    df = df.reset_index(drop=True)
    paths = df["image_path"].tolist()
    if not paths:
        return df, np.zeros((0, 512), dtype="float32")

    cache_dir = Path(cfg.get("clip", {}).get("cache_dir", "data/interim/clip_cache"))
    if not cache_dir.is_absolute():
        from ..config import REPO_ROOT
        cache_dir = REPO_ROOT / cache_dir
    cache_dir.mkdir(parents=True, exist_ok=True)
    key = _cache_key(paths, cfg.get("clip", {}).get("model_id", ""))
    npy = cache_dir / f"img_{key}.npy"

    if use_cache and npy.exists():
        log.info("使用快取向量 %s", npy)
        return df, np.load(npy)

    vecs = embed_images(paths, cfg)
    np.save(npy, vecs)
    return df, vecs


def save_embeddings(df: pd.DataFrame, vecs: np.ndarray, cfg: Config | None = None) -> tuple[Path, Path]:
    cfg = cfg or get_config()
    out_dir = cfg.path("processed")
    meta_path = out_dir / "image_embeddings_meta.parquet"
    vec_path = out_dir / "image_embeddings.npy"
    df.to_parquet(meta_path, index=False)
    np.save(vec_path, vecs)
    return meta_path, vec_path


def load_embeddings(cfg: Config | None = None) -> tuple[pd.DataFrame, np.ndarray]:
    cfg = cfg or get_config()
    meta_path = cfg.path("processed") / "image_embeddings_meta.parquet"
    vec_path = cfg.path("processed") / "image_embeddings.npy"
    if not meta_path.exists() or not vec_path.exists():
        raise FileNotFoundError("尚未產生影像向量，請先執行：python -m chainway.cli embed")
    return pd.read_parquet(meta_path), np.load(vec_path)
