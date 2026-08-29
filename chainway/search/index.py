"""商品視覺反向搜尋：丟一張圖（或一段文字描述）→ 回傳貨號、價格、績效。

三種查詢方式共用同一個索引：
  search_by_image(path)   上傳市調照片、競品照、客人拍的照片 → 找自家最像的款
  search_by_text("高腰百褶格紋裙")  → 不用圖也能找
  search_similar(sku)     → 找同款系的所有變體（做系列延伸時很好用）

索引後端：有裝 faiss 就用 faiss（十萬款以內其實 numpy 就夠快），
沒裝自動退回 numpy 暴力搜尋，結果完全一致。
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from ..config import Config, get_config
from ..features.fashion_clip import embed_images, embed_texts, load_embeddings


class VisualIndex:
    def __init__(self, meta: pd.DataFrame, vecs: np.ndarray, cfg: Config | None = None):
        if len(meta) != len(vecs):
            raise ValueError("meta 與向量列數不一致")
        self.cfg = cfg or get_config()
        self.meta = meta.reset_index(drop=True)
        self.vecs = vecs.astype("float32")
        self._faiss = None
        backend = self.cfg.get("search", {}).get("index_backend", "auto")
        if backend in ("auto", "faiss"):
            self._try_faiss(strict=(backend == "faiss"))

    def _try_faiss(self, strict: bool = False) -> None:
        try:
            import faiss
        except ImportError:
            if strict:
                raise
            return
        index = faiss.IndexFlatIP(self.vecs.shape[1])
        index.add(self.vecs)
        self._faiss = index

    # ------------------------------------------------------------
    @classmethod
    def load(cls, cfg: Config | None = None) -> "VisualIndex":
        cfg = cfg or get_config()
        meta, vecs = load_embeddings(cfg)
        enriched = _attach_business_columns(meta, cfg)
        return cls(enriched, vecs, cfg)

    # ------------------------------------------------------------
    def _search_vec(self, q: np.ndarray, top_k: int) -> pd.DataFrame:
        q = q.reshape(1, -1).astype("float32")
        q = q / np.linalg.norm(q, axis=1, keepdims=True)
        if self._faiss is not None:
            scores, idx = self._faiss.search(q, min(top_k, len(self.vecs)))
            scores, idx = scores[0], idx[0]
        else:
            sims = (self.vecs @ q.T).ravel()
            idx = np.argsort(-sims)[:top_k]
            scores = sims[idx]

        out = self.meta.iloc[idx].copy()
        out.insert(0, "similarity", np.round(scores, 4))
        out.insert(1, "rank", range(1, len(out) + 1))
        return out.reset_index(drop=True)

    def search_by_image(self, image_path: str | Path, top_k: int | None = None) -> pd.DataFrame:
        top_k = top_k or self.cfg.get("search", {}).get("top_k", 12)
        vec = embed_images([str(image_path)], self.cfg, show_progress=False)
        return self._search_vec(vec[0], top_k)

    def search_by_text(self, query: str, top_k: int | None = None) -> pd.DataFrame:
        top_k = top_k or self.cfg.get("search", {}).get("top_k", 12)
        vec = embed_texts([query], self.cfg)
        return self._search_vec(vec[0], top_k)

    def search_similar(self, sku: str, top_k: int | None = None) -> pd.DataFrame:
        top_k = top_k or self.cfg.get("search", {}).get("top_k", 12)
        hits = self.meta.index[self.meta["sku"] == sku].tolist()
        if not hits:
            raise KeyError(f"索引中找不到貨號 {sku}")
        res = self._search_vec(self.vecs[hits[0]], top_k + 1)
        return res[res["sku"] != sku].reset_index(drop=True)


def _attach_business_columns(meta: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    """把價格與績效併進索引 metadata，讓搜尋結果直接可用。"""
    scfg = cfg.get("search", {})
    if not (scfg.get("attach_price", True) or scfg.get("attach_performance", True)):
        return meta

    master_path = cfg.path("processed") / "master.parquet"
    if not master_path.exists():
        return meta

    master = pd.read_parquet(master_path)
    wanted = ["sku", "product_name", "season", "category", "list_price", "avg_selling_price",
              "stock_in", "net_sales_qty", "sell_through_rate", "gross_margin",
              "perf_band", "perf_band_zh", "fb_verdict", "fb_tags", "fb_texts"]
    cols = [c for c in wanted if c in master.columns]
    # 一個貨號可能跨多季，取最新一季代表
    if "season" in master.columns:
        master = master.sort_values("season").drop_duplicates("sku", keep="last")
    else:
        master = master.drop_duplicates("sku", keep="last")

    drop = [c for c in cols if c != "sku" and c in meta.columns]
    return meta.drop(columns=drop, errors="ignore").merge(master[cols], on="sku", how="left")


def format_results(res: pd.DataFrame, cfg: Config | None = None) -> pd.DataFrame:
    """整理成適合直接顯示 / 匯出的欄位順序與中文欄名。"""
    cfg = cfg or get_config()
    cols = {
        "rank": "排名", "similarity": "相似度", "sku": "貨號", "product_name": "品名",
        "season": "季別", "category": "品類", "list_price": "定價",
        "avg_selling_price": "實際均價", "sell_through_rate": "售罄率",
        "perf_band_zh": "績效分級", "fb_verdict": "現場判定", "image_path": "圖檔",
    }
    use = {k: v for k, v in cols.items() if k in res.columns}
    out = res[list(use)].rename(columns=use)
    if "相似度" in out:
        out["相似度"] = out["相似度"].map(lambda v: f"{v:.1%}")
    if "售罄率" in out:
        out["售罄率"] = out["售罄率"].map(lambda v: f"{v:.0%}" if pd.notna(v) else "—")
    return out
