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
    def _search_vec(self, q: np.ndarray, top_k: int, category: str | None = None) -> pd.DataFrame:
        q = q.reshape(1, -1).astype("float32")
        q = q / np.linalg.norm(q, axis=1, keepdims=True)
        sims = (self.vecs @ q.T).ravel()

        # 品類過濾：查詢是上衣時，不該讓裙子出現在候選名單裡佔位置。
        # 貨號第 6 碼已經帶了品類，這個過濾幾乎沒有成本卻能明顯拉高命中率。
        mask = np.ones(len(sims), dtype=bool)
        if category and "category" in self.meta.columns:
            mask = (self.meta["category"] == category).to_numpy()
            if mask.sum() < 5:      # 該品類樣本太少就不過濾，免得沒結果
                mask = np.ones(len(sims), dtype=bool)

        # 一個貨號可能有多個配色面板，取該貨號最高分的那一面板代表它，
        # 否則前十名會被同一款的不同顏色佔滿。
        order = np.argsort(-np.where(mask, sims, -np.inf))
        rows, seen = [], set()
        for i in order:
            if not mask[i]:
                break
            sku = self.meta.iloc[i].get("sku")
            if sku in seen:
                continue
            seen.add(sku)
            rows.append((i, sims[i]))
            if len(rows) >= top_k:
                break

        if not rows:
            return pd.DataFrame()
        idx = [i for i, _ in rows]
        out = self.meta.iloc[idx].copy()
        out.insert(0, "similarity", np.round([s for _, s in rows], 4))
        out.insert(1, "rank", range(1, len(out) + 1))
        return out.reset_index(drop=True)

    def search_by_image(self, image_path: str | Path, top_k: int | None = None,
                        category: str | None = None) -> pd.DataFrame:
        top_k = top_k or self.cfg.get("search", {}).get("top_k", 12)
        vec = embed_images([str(image_path)], self.cfg, show_progress=False)
        return self._search_vec(vec[0], top_k, category)

    def search_by_crops(self, image_path: str | Path, top_k: int | None = None,
                        max_regions: int = 4) -> pd.DataFrame:
        """穿搭照專用：先把畫面切成幾塊，每塊各自搜尋。

        一張穿搭照裡有上衣＋下身＋外套，整張比對等於拿「一整套」去比對
        「單件」，必然不準。切開之後每一件各自去找，命中率會差很多。
        """
        from ..sketch.lineart import auto_regions, crop_region, load_image

        top_k = top_k or self.cfg.get("search", {}).get("top_k", 12)
        img = load_image(image_path)
        frames = []
        for i, box in enumerate(auto_regions(img, max_regions), start=1):
            crop = crop_region(img, box)
            from PIL import Image
            pil = Image.fromarray(crop[:, :, ::-1])
            vec = embed_images([pil], self.cfg, show_progress=False)
            res = self._search_vec(vec[0], top_k)
            if not res.empty:
                res.insert(0, "region", i)
                frames.append(res)
        if not frames:
            return pd.DataFrame()
        out = pd.concat(frames, ignore_index=True)
        return out.sort_values("similarity", ascending=False).reset_index(drop=True)

    def search_by_text(self, query: str, top_k: int | None = None,
                       category: str | None = None) -> pd.DataFrame:
        top_k = top_k or self.cfg.get("search", {}).get("top_k", 12)
        vec = embed_texts([query], self.cfg)
        return self._search_vec(vec[0], top_k, category)

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


def evaluate(truth: pd.DataFrame, predictions: pd.DataFrame,
             ks: tuple[int, ...] = (1, 5, 10)) -> tuple[pd.DataFrame, pd.DataFrame]:
    """用同一把尺量任何一套以圖搜貨號系統。

    truth:       欄位 query_image, true_sku（一列一張查詢圖）
    predictions: 欄位 query_image, rank, sku（一列一個候選，rank 由 1 起）

    回傳 (整體指標, 逐筆結果)。指標包含 Top-K 命中率與 MRR
    （平均倒數排名 —— 正確答案排第 1 得 1 分、第 2 得 0.5 分，
    比單看 Top-1 更能反映「有沒有接近」）。

    這支函式刻意不綁定任何搜尋實作：把別套系統的前十名匯成同樣格式，
    就能跟本專案的結果放在同一張表上比，不用靠感覺爭論誰比較準。
    """
    t = truth.copy()
    t["query_image"] = t["query_image"].astype(str).str.strip()
    t["true_sku"] = t["true_sku"].astype(str).str.strip().str.upper()

    p = predictions.copy()
    p["query_image"] = p["query_image"].astype(str).str.strip()
    p["sku"] = p["sku"].astype(str).str.strip().str.upper()
    p["rank"] = pd.to_numeric(p["rank"], errors="coerce")

    rows = []
    for _, r in t.iterrows():
        cand = p[p["query_image"] == r["query_image"]].sort_values("rank")
        hit_rank = None
        for _, c in cand.iterrows():
            if c["sku"] == r["true_sku"]:
                hit_rank = int(c["rank"])
                break
        rows.append({
            "query_image": r["query_image"],
            "true_sku": r["true_sku"],
            "n_candidates": len(cand),
            "hit_rank": hit_rank,
            "top1": hit_rank == 1,
            "predicted_top1": cand["sku"].iloc[0] if len(cand) else "",
        })
    detail = pd.DataFrame(rows)

    n = max(len(detail), 1)
    summary = {"查詢張數": len(detail),
               "有候選的張數": int((detail["n_candidates"] > 0).sum())}
    for k in ks:
        summary[f"Top-{k} 命中率"] = round(
            float(detail["hit_rank"].apply(lambda v: v is not None and v <= k).sum() / n), 4)
    summary["MRR"] = round(
        float(detail["hit_rank"].apply(lambda v: 1 / v if v else 0).sum() / n), 4)
    summary["完全沒找到"] = int(detail["hit_rank"].isna().sum())
    return pd.DataFrame([summary]).T.rename(columns={0: "值"}), detail


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
