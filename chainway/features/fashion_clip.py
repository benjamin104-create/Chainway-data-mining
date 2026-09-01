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
from typing import Any

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


def strip_caption_band(img, max_frac: float = 0.30, tol: int = 12):
    """裁掉系統圖底部印著貨號的字幕帶。

    實際系統圖底部有一條純色帶，上面印著貨號（例如「KA1583008」）。
    那條帶子會被 CLIP 一起編碼進去 —— 文字與大片色塊會污染「色系」
    與「面料外觀」的判讀，而它跟商品本身完全無關。

    作法：由下往上找「每一列都是同一個顏色」的連續區塊，
    碰到第一列有明顯色彩變化就停。找不到就原圖返回。
    """
    import numpy as np

    a = np.asarray(img.convert("RGB")).astype(np.int16)
    h = a.shape[0]
    if h < 20:
        return img
    limit = max(1, int(h * max_frac))

    # 用每列的「中位數顏色」而不是平均或全列純色：字幕帶上印著貨號文字，
    # 那幾列並非純色，但文字像素佔比小，中位數仍然是底色。
    row_median = np.median(a, axis=1)
    ref = row_median[h - 1]

    cut = h
    for y in range(h - 1, h - limit - 1, -1):
        if np.abs(row_median[y] - ref).max() <= tol:
            cut = y
        else:
            break

    if h - cut < h * 0.05:
        return img                      # 太薄，不像字幕帶

    # 關鍵防呆：字幕帶的顏色必須和「整張圖的背景色」明顯不同。
    # 背景色取四個角落的中位數（商品在中間，角落幾乎一定是底色）。
    # 少了這道檢查，商品下方單純留白的圖會被當成字幕帶切掉一截，
    # 淺色下擺就跟著不見了。
    k = max(2, min(h, img.width) // 20)
    corners = np.concatenate([
        a[:k, :k].reshape(-1, 3), a[:k, -k:].reshape(-1, 3),
    ])
    background = np.median(corners, axis=0)
    if np.abs(background - ref).max() <= tol:
        return img                      # 底部那塊就是背景，不是字幕帶
    return img.crop((0, 0, img.width, cut))


def split_garments(img, min_gap_frac: float = 0.02, min_panel_frac: float = 0.08,
                   tol: int = 14) -> list:
    """把一張系統圖切成單件。

    為什麼一定要切：系統圖一張放 2–4 個配色併排（白 T + 藏青 T），
    整張丟給 CLIP 得到的是「白色和藏青的兩件衣服」這個混合語意。
    而查詢端（穿搭照、街拍）通常只有一件。拿混合語意去比對單件，
    相似度會被稀釋，排名就亂了 —— 這是以圖搜貨號搜不準最大的單一原因。

    切法：找出整欄都是背景色的「走道」，在走道處切開。
    切不出兩塊以上就原圖返回。
    """
    import numpy as np

    a = np.asarray(img.convert("RGB")).astype(np.int16)
    h, w = a.shape[:2]
    if w < 60:
        return [img]

    # 背景色取上緣兩角（商品在中間，上緣角落幾乎必為底色）
    k = max(2, min(h, w) // 20)
    bg = np.median(np.concatenate([a[:k, :k].reshape(-1, 3),
                                   a[:k, -k:].reshape(-1, 3)]), axis=0)
    col_is_bg = (np.abs(np.median(a, axis=0) - bg).max(axis=1) <= tol)

    # 找出連續的背景走道
    gaps, start = [], None
    for x in range(w):
        if col_is_bg[x] and start is None:
            start = x
        elif not col_is_bg[x] and start is not None:
            gaps.append((start, x)); start = None
    if start is not None:
        gaps.append((start, w))

    min_gap = max(3, int(w * min_gap_frac))
    # 只取「內部」的寬走道當切點，左右外緣的留白不算
    cuts = [(s + e) // 2 for s, e in gaps if e - s >= min_gap and s > 0 and e < w]
    if not cuts:
        return [img]

    bounds = [0, *cuts, w]
    panels = []
    for i in range(len(bounds) - 1):
        x1, x2 = bounds[i], bounds[i + 1]
        if x2 - x1 < w * min_panel_frac:
            continue
        # 該區塊若整片都是背景（純留白），跳過
        if col_is_bg[x1:x2].mean() > 0.95:
            continue
        panels.append(img.crop((x1, 0, x2, h)))
    return panels if len(panels) >= 2 else [img]


def prepare_image(path: str | Path, cfg: Config | None = None):
    """開圖 + 裁掉貨號字幕帶 + 去背後補白底 + 置中補成正方形。

    系統圖是透明去背 PNG，直接丟給 CLIP 時透明區會被當成黑色，
    會嚴重干擾「色系」與「面料外觀」的判讀 —— 所以一定要先補底色。
    """
    from PIL import Image

    cfg = cfg or get_config()
    clip_cfg = cfg.get("clip", {})
    img = Image.open(path) if not hasattr(path, "mode") else path
    if clip_cfg.get("strip_caption", True):
        img = strip_caption_band(img)

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


def _to_embedding(out, model, kind: str):
    """把 get_image_features / get_text_features 的回傳統一成向量張量。

    transformers 在版本之間改過這個回傳型別：
      舊版  直接回傳投影後的張量 (n, 512)
      新版  回傳整個 vision/text model 的輸出（BaseModelOutputWithPooling），
            投影層要呼叫端自己套

    只寫死其中一種，換一個 transformers 版本就會炸在
    `'BaseModelOutputWithPooling' object has no attribute 'norm'`，
    而且要跑完模型下載才看得到，代價很高。所以兩種都吃。

    注意一定要套投影層而不是直接用 pooler_output：pooler_output 是投影前的
    768 維，影像與文字各自在不同空間，拿去做 zero-shot 屬性標註會全錯。
    """
    import torch

    if torch.is_tensor(out):
        return out
    emb = getattr(out, "image_embeds" if kind == "image" else "text_embeds", None)
    if emb is not None:
        return emb
    pooled = getattr(out, "pooler_output", None)
    if pooled is None and isinstance(out, (tuple, list)) and out:
        pooled = out[1] if len(out) > 1 else out[0]
    if pooled is None:
        raise TypeError(
            f"無法從 {type(out).__name__} 取出 {kind} 向量 —— "
            f"transformers 版本可能又改了回傳格式，請回報這行訊息")
    proj = model.visual_projection if kind == "image" else model.text_projection
    return proj(pooled)


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
        images = [p if hasattr(p, "mode") else prepare_image(p, cfg) for p in chunk]
        inputs = processor(images=images, return_tensors="pt").to(device)
        with torch.no_grad():
            feats = _to_embedding(model.get_image_features(**inputs), model, "image")
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
        feats = _to_embedding(model.get_text_features(**inputs), model, "text")
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

    meta_pq = cache_dir / f"img_{key}.parquet"
    if use_cache and npy.exists() and meta_pq.exists():
        log.info("使用快取向量 %s", npy)
        return pd.read_parquet(meta_pq), np.load(npy)

    # 一張系統圖常含多個配色，逐件切開後各自建向量。
    # 這樣查詢端的單件照片才是跟單件比對，而不是跟一張混合圖比對。
    if cfg.get("clip", {}).get("split_colorways", True):
        # 邊讀邊算，算完就丟。
        #
        # 不能先把所有圖解碼進一個 list 再一次送進模型：一張系統圖解開約
        # 5 MB，3,729 張切件後有五千到八千張，那是幾十 GB，記憶體一定爆。
        # 這裡只讓 flush_at 張同時存在，其餘都在算完後就釋放。
        batch_size = int(cfg.get("clip", {}).get("batch_size", 16))
        flush_at = max(batch_size * 4, 32)
        rows: list[dict] = []
        chunks: list[np.ndarray] = []
        buf_panels: list[Any] = []
        buf_rows: list[dict] = []
        total, n_panels = len(paths), 0

        def _flush() -> None:
            nonlocal buf_panels, buf_rows
            if not buf_panels:
                return
            chunks.append(embed_images(buf_panels, cfg, show_progress=False))
            rows.extend(buf_rows)
            buf_panels, buf_rows = [], []

        for i, p in enumerate(paths):
            try:
                prepared = prepare_image(p, cfg)
            except Exception as exc:  # 壞檔、非影像、權限問題都不該中斷整批
                log.warning("略過讀不進來的圖 %s：%s", p, exc)
                continue
            for j, panel in enumerate(split_garments(prepared), start=1):
                buf_panels.append(panel)
                buf_rows.append({**df.iloc[i].to_dict(), "panel": j})
                n_panels += 1
            if len(buf_panels) >= flush_at:
                _flush()
            print(f"  影像特徵 {i + 1}/{total} 張圖 → {n_panels} 個單件", end="\r", flush=True)
        _flush()
        print()

        df = pd.DataFrame(rows)
        if n_panels > total:
            log.info("%d 張圖切出 %d 個單件（多切 %d 件）", total, n_panels, n_panels - total)
        vecs = np.vstack(chunks) if chunks else np.zeros((0, 512), dtype="float32")
    else:
        df = df.assign(panel=1)
        vecs = embed_images(paths, cfg)

    np.save(npy, vecs)
    df.to_parquet(meta_pq, index=False)
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
