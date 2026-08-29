"""建立主表：影像屬性 × 版型尺寸 × 銷售績效 × 人工回饋。

合併順序刻意如此設計：
    POS（銷售，最權威的事實）
      ← left join 影像屬性（以 sku）
      ← left join 裁縫指示書（先 sku，補不到再用 style_code）
      ← left join 人工回饋摘要（以 sku）

用 left join 而非 inner join 是有意的：沒有系統圖的貨號仍要留在表裡，
否則你會誤以為「有拍照的商品比較好賣」（其實只是拍照的都是主推款）。
每一步都會記錄 join 命中率，寫進 join_audit，缺料狀況一目了然。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from ..config import Config, get_config


@dataclass
class JoinAudit:
    rows: list[dict] = field(default_factory=list)

    def add(self, step: str, left_n: int, matched: int, note: str = "") -> None:
        self.rows.append({
            "step": step,
            "left_rows": left_n,
            "matched": matched,
            "match_rate": round(matched / left_n, 3) if left_n else 0.0,
            "note": note,
        })

    def to_frame(self) -> pd.DataFrame:
        return pd.DataFrame(self.rows)


def _dedupe_on(df: pd.DataFrame, key: str) -> pd.DataFrame:
    """同一個 key 多列時只留第一列，避免 join 後列數爆炸。"""
    return df.drop_duplicates(subset=[key], keep="first")


def build_master(
    sales: pd.DataFrame,
    attributes: pd.DataFrame | None = None,
    techpack: pd.DataFrame | None = None,
    feedback_summary: pd.DataFrame | None = None,
    cfg: Config | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """回傳 (主表, join 稽核表)。sales 應已彙總到 sku × season 粒度。"""
    cfg = cfg or get_config()
    audit = JoinAudit()

    if sales.empty:
        raise ValueError("銷售資料為空，無法建立主表。請先確認 POS 檔案是否讀取成功。")

    master = sales.copy()
    master["sku"] = master["sku"].astype(str).str.strip()
    audit.add("起點：POS 彙總", len(master), len(master), "sku × season")

    # --- 影像屬性 ---
    if attributes is not None and not attributes.empty:
        attr = _dedupe_on(attributes.copy(), "sku")
        attr["sku"] = attr["sku"].astype(str).str.strip()
        drop = [c for c in ("style_code", "category", "season") if c in attr.columns and c in master.columns]
        attr = attr.drop(columns=drop).rename(columns={"category_pred": "category_clip"})
        before = len(master)
        master = master.merge(attr, on="sku", how="left", validate="m:1")
        matched = master["image_path"].notna().sum() if "image_path" in master else 0
        audit.add("併入 影像屬性", before, int(matched), "以 sku 對應系統圖")
    else:
        audit.add("併入 影像屬性", len(master), 0, "無影像資料")

    # --- 裁縫指示書：先 sku，未命中再退回 style_code ---
    if techpack is not None and not techpack.empty:
        tp = techpack.copy()
        tp["sku"] = tp["sku"].astype(str).str.strip()
        before = len(master)
        by_sku = _dedupe_on(tp, "sku").drop(columns=[c for c in ("style_code",) if c in tp.columns])
        master = master.merge(by_sku, on="sku", how="left", suffixes=("", "_tp"), validate="m:1")

        if "style_code" in master.columns and "style_code" in techpack.columns:
            tp_style = _dedupe_on(techpack.copy(), "style_code").drop(columns=["sku"], errors="ignore")
            fill_cols = [c for c in tp_style.columns if c != "style_code" and c in master.columns]
            need = master["techpack_path"].isna() if "techpack_path" in master else pd.Series(True, index=master.index)
            if need.any() and fill_cols:
                filler = master.loc[need, ["style_code"]].merge(tp_style, on="style_code", how="left")
                filler.index = master.index[need]
                for c in fill_cols:
                    master.loc[need, c] = master.loc[need, c].fillna(filler[c])
        matched = master["techpack_path"].notna().sum() if "techpack_path" in master else 0
        audit.add("併入 裁縫指示書", before, int(matched), "sku 優先，其次 style_code")
    else:
        audit.add("併入 裁縫指示書", len(master), 0, "無指示書資料")

    # --- 人工回饋 ---
    if feedback_summary is not None and not feedback_summary.empty:
        fb = _dedupe_on(feedback_summary.copy(), "sku")
        fb["sku"] = fb["sku"].astype(str).str.strip()
        before = len(master)
        master = master.merge(fb, on="sku", how="left", validate="m:1")
        matched = master["fb_n"].notna().sum() if "fb_n" in master else 0
        audit.add("併入 市場回饋", before, int(matched), "★ 人工填寫的暢銷/滯銷理由")
    else:
        master["fb_n"] = pd.NA
        master["fb_verdict"] = pd.NA
        master["fb_tags"] = pd.NA
        master["fb_groups"] = pd.NA
        master["fb_texts"] = pd.NA
        audit.add("併入 市場回饋", len(master), 0, "尚未填寫 sales_feedback.csv")

    # 品類優先序：POS > 回饋 > CLIP
    if "category_clip" in master.columns:
        master["category"] = master.get("category", pd.Series(pd.NA, index=master.index))
        master["category"] = master["category"].fillna(master["category_clip"])
    master["category"] = master["category"].fillna("UNKNOWN")

    return master.reset_index(drop=True), audit.to_frame()


def save_master(master: pd.DataFrame, audit: pd.DataFrame, cfg: Config | None = None) -> tuple[Path, Path]:
    cfg = cfg or get_config()
    out = cfg.path("processed")
    m_path = out / "master.parquet"
    a_path = out / "join_audit.csv"
    master.to_parquet(m_path, index=False)
    audit.to_csv(a_path, index=False, encoding="utf-8-sig")
    return m_path, a_path


def load_master(cfg: Config | None = None) -> pd.DataFrame:
    cfg = cfg or get_config()
    path = cfg.path("processed") / "master.parquet"
    if not path.exists():
        raise FileNotFoundError("尚未建立主表，請先執行：python -m chainway.cli build")
    return pd.read_parquet(path)
