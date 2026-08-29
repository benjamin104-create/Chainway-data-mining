"""網頁後台 API。

啟動：python -m chainway.cli serve
      → http://127.0.0.1:8000

頁面（單頁應用，見 apps/web/index.html）：
  儀表板    各季別品類績效總覽
  關聯分析  特徵 ↔ 暢銷/滯銷 的關聯表與關鍵發現
  以圖搜款  ★ 上傳照片 → 反查貨號與價格
  回饋登錄  ★ 填寫暢銷/滯銷理由（寫回 sales_feedback.csv）
  診斷      資料 vs 現場回饋的交叉診斷清單
  版型研究  甜蜜區間、版群、漂移
  線稿工作台 ★ 上傳市調圖 → 線稿 / 彩現 / 機械圖 prompt
  企劃      週度 10–15 款組套
"""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from chainway.config import REPO_ROOT, get_config

app = FastAPI(title="Chainway 服飾設計數據平台", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

WEB_DIR = REPO_ROOT / "apps" / "web"
_index_cache: dict[str, Any] = {}


def _clean(df: pd.DataFrame, limit: int | None = None) -> list[dict]:
    """DataFrame → JSON-safe records（NaN 轉 None，Timestamp 轉字串）。"""
    if df is None or df.empty:
        return []
    d = df.head(limit) if limit else df
    d = d.copy()
    for c in d.columns:
        if pd.api.types.is_datetime64_any_dtype(d[c]):
            d[c] = d[c].dt.strftime("%Y-%m-%d")
    return d.where(pd.notna(d), None).to_dict("records")


def _master() -> pd.DataFrame:
    from chainway.merge.build_master import load_master
    if "master" not in _index_cache:
        _index_cache["master"] = load_master(get_config())
    return _index_cache["master"]


# ---------------------------------------------------------------- 基本
@app.get("/api/health")
def health() -> dict:
    cfg = get_config()
    processed = cfg.path("processed")
    return {
        "ok": True,
        "project": cfg.get("project", {}).get("name"),
        "has_master": (processed / "master.parquet").exists(),
        "has_embeddings": (processed / "image_embeddings.npy").exists(),
    }


@app.get("/api/meta")
def meta() -> dict:
    """taxonomy 與回饋標籤，供前端建下拉選單。"""
    cfg = get_config()
    return {
        "categories": [{"code": c, "zh": cfg.category_label(c)} for c in cfg.category_codes],
        "attributes": {
            a: {"zh": cfg.attribute_label(a),
                "options": [{"code": o["code"], "zh": o["zh"]} for o in cfg.attribute_options(a)]}
            for a in cfg.taxonomy.get("attributes", {})
        },
        "verdicts": cfg.feedback_tags.get("verdicts", []),
        "sources": cfg.feedback_tags.get("sources", []),
        "actions": cfg.feedback_tags.get("actions", []),
        "reason_groups": [
            {"group": g, "zh": v.get("name_zh", g), "tags": v.get("tags", [])}
            for g, v in cfg.feedback_tags.get("reason_tags", {}).items()
        ],
    }


# ---------------------------------------------------------------- 儀表板
@app.get("/api/dashboard")
def dashboard() -> dict:
    cfg = get_config()
    m = _master()
    from chainway.analysis.performance import summary_by_group

    n_sku = int(m["sku"].nunique())
    return {
        "kpi": {
            "款數": n_sku,
            "有系統圖": f"{m['image_path'].notna().mean():.0%}" if "image_path" in m else "0%",
            "有指示書": f"{m['techpack_path'].notna().mean():.0%}" if "techpack_path" in m else "0%",
            "有市場回饋": f"{m['fb_n'].notna().mean():.0%}" if "fb_n" in m else "0%",
        },
        "bands": m["perf_band_zh"].value_counts().to_dict() if "perf_band_zh" in m else {},
        "summary": _clean(summary_by_group(m, cfg)),
        "seasons": sorted(m["season"].dropna().unique().tolist()) if "season" in m else [],
    }


@app.get("/api/styles")
def styles(category: str | None = None, season: str | None = None,
           band: str | None = None, q: str | None = None, limit: int = 200) -> dict:
    m = _master()
    if category:
        m = m[m["category"] == category]
    if season:
        m = m[m["season"] == season]
    if band:
        m = m[m["perf_band"] == band]
    if q:
        mask = m["sku"].str.contains(q, case=False, na=False)
        if "product_name" in m:
            mask |= m["product_name"].astype(str).str.contains(q, case=False, na=False)
        m = m[mask]
    cols = [c for c in ["sku", "product_name", "season", "category", "category_zh", "list_price",
                        "avg_selling_price", "stock_in", "net_sales_qty", "sell_through_rate",
                        "gross_margin", "perf_band_zh", "fb_verdict", "fb_tags", "image_path"]
            if c in m.columns]
    return {"total": len(m), "rows": _clean(m[cols], limit)}


# ---------------------------------------------------------------- 關聯分析
@app.get("/api/analysis/association")
def association(category: str | None = None, significant_only: bool = True) -> dict:
    from chainway.analysis import correlation
    cfg = get_config()
    if "assoc" not in _index_cache:
        _index_cache["assoc"] = correlation.attribute_association(_master(), cfg)
    df = _index_cache["assoc"]
    if df.empty:
        return {"rows": [], "findings": []}
    sel = df[df["significant"]] if significant_only and "significant" in df else df
    if category:
        sel = sel[sel["category"] == category]
    findings = correlation.top_findings(df, cfg)
    if category and not findings.empty:
        findings = findings[findings["category"] == category]
    return {"rows": _clean(sel, 400), "findings": _clean(findings, 40)}


@app.get("/api/analysis/pattern")
def pattern_study(category: str | None = None) -> dict:
    from chainway.analysis import pattern
    cfg = get_config()
    m = _master()
    if "sweet" not in _index_cache:
        _index_cache["sweet"] = pattern.sweet_spot(m, cfg)
    sweet = _index_cache["sweet"]
    targets = pattern.sweet_spot_targets(sweet)
    drift = pattern.silhouette_drift(m, cfg)
    if category and not targets.empty:
        targets = targets[targets["category"] == category]
        drift = drift[drift["category"] == category] if not drift.empty else drift
    return {"targets": _clean(targets), "drift": _clean(drift, 200)}


@app.get("/api/analysis/diagnosis")
def diagnosis_view(priority: str | None = None) -> dict:
    from chainway.analysis import diagnosis
    cfg = get_config()
    m = _master()
    if "diag" not in _index_cache:
        _index_cache["diag"] = diagnosis.diagnose(m, cfg)
    diag = _index_cache["diag"]
    stats = diagnosis.summary_stats(diag)
    attribution = diagnosis.attribution_by_tag(m, cfg)
    gaps = diagnosis.coverage_gap(m, cfg)
    sel = diag[diag["priority"] == priority] if priority else diag
    return {"stats": stats, "rows": _clean(sel, 300),
            "attribution": _clean(attribution, 80), "gaps": _clean(gaps, 60)}


# ---------------------------------------------------------------- ★ 以圖搜款
@app.post("/api/search/image")
async def search_image(file: UploadFile = File(...), top_k: int = Form(12)) -> dict:
    from chainway.search.index import VisualIndex
    cfg = get_config()
    if "vindex" not in _index_cache:
        _index_cache["vindex"] = VisualIndex.load(cfg)

    suffix = Path(file.filename or "upload.jpg").suffix or ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    try:
        res = _index_cache["vindex"].search_by_image(tmp_path, top_k)
    finally:
        Path(tmp_path).unlink(missing_ok=True)
    return {"rows": _clean(res)}


@app.get("/api/search/text")
def search_text(q: str, top_k: int = 12) -> dict:
    from chainway.search.index import VisualIndex
    cfg = get_config()
    if "vindex" not in _index_cache:
        _index_cache["vindex"] = VisualIndex.load(cfg)
    return {"rows": _clean(_index_cache["vindex"].search_by_text(q, top_k))}


@app.get("/api/image")
def image(path: str):
    """安全地回傳系統圖：只允許讀取設定中的資料夾底下的檔案。"""
    cfg = get_config()
    target = Path(path).resolve()
    allowed = [cfg.path(k).resolve() for k in ("system_images", "market_research", "outputs", "tech_packs")]
    if not any(str(target).startswith(str(a)) for a in allowed):
        raise HTTPException(403, "路徑不在允許範圍內")
    if not target.exists():
        raise HTTPException(404, "檔案不存在")
    return FileResponse(target)


# ---------------------------------------------------------------- ★ 回饋登錄
@app.get("/api/feedback")
def feedback_list(sku: str | None = None, limit: int = 300) -> dict:
    from chainway.ingest import feedback as fb
    cfg = get_config()
    df = fb.load_feedback(cfg)
    if sku:
        df = df[df["sku"] == sku]
    issues = fb.validate_feedback(df, cfg)
    return {"total": len(df), "rows": _clean(df.drop(columns=["reason_tag_list"]), limit),
            "issues": _clean(issues)}


@app.post("/api/feedback")
async def feedback_add(payload: dict) -> dict:
    from chainway.ingest import feedback as fb
    cfg = get_config()
    try:
        path = fb.append_feedback(payload, cfg)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    _index_cache.pop("diag", None)     # 診斷結果失效，下次重算
    _index_cache.pop("master", None)
    return {"ok": True, "file": str(path),
            "note": "已寫入。要讓診斷與報告反映這筆，請重新執行 build → analyze。"}


@app.get("/api/feedback/template")
def feedback_template():
    from chainway.ingest import feedback as fb
    path = fb.make_excel_template(cfg=get_config())
    return FileResponse(path, filename=path.name,
                        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


# ---------------------------------------------------------------- ★ 線稿工作台
@app.post("/api/sketch")
async def sketch(file: UploadFile = File(...), auto: bool = Form(True),
                 regions: int = Form(4), job_id: str = Form("")) -> dict:
    from chainway.sketch import pipeline
    cfg = get_config()

    inbox = cfg.path("market_research") / "_uploads"
    inbox.mkdir(parents=True, exist_ok=True)
    dest = inbox / (file.filename or "upload.jpg")
    with dest.open("wb") as fh:
        shutil.copyfileobj(file.file, fh)

    try:
        result = pipeline.run_quick(dest, cfg, auto=auto, max_regions=regions,
                                    job_id=job_id or None)
    except ImportError as exc:
        raise HTTPException(500, str(exc))
    return result


@app.post("/api/sketch/prompt")
def sketch_prompt(payload: dict) -> dict:
    """由屬性組合產生機械圖規格與英文 prompt。"""
    from chainway.sketch.flats_prompt import build_prompt, build_spec
    cfg = get_config()
    category = payload.get("category", "TOP")
    attrs = payload.get("attributes", {})
    fabric = payload.get("fabric")
    out = build_prompt(category, attrs, fabric, payload.get("extra"), cfg)
    out["spec_zh"] = build_spec(category, attrs, fabric, payload.get("measurements"), cfg,
                                payload.get("notes"))
    return out


# ---------------------------------------------------------------- 企劃
@app.get("/api/plan/week")
def plan_week(week: int = 1, n: int | None = None) -> dict:
    from chainway.analysis import correlation
    from chainway.planning import assortment
    cfg = get_config()
    m = _master()
    if "assoc" not in _index_cache:
        _index_cache["assoc"] = correlation.attribute_association(m, cfg)
    waves = cfg.get("planning", {}).get("waves", [])
    wave = waves[min((week - 1) // 9, len(waves) - 1)] if waves else {"code": "NA", "name": "—"}
    plan = assortment.plan_week(week, wave["code"], _index_cache["assoc"], m, cfg, n)
    return {
        "wave": wave,
        "new_styles": _clean(plan["new_styles"]),
        "carryover": _clean(plan["carryover"]),
        "outfits": _clean(plan["outfits"]),
        "markdown": assortment.to_markdown(plan, week, wave["name"]),
    }


@app.get("/api/plan/year")
def plan_year() -> dict:
    from chainway.analysis import correlation
    from chainway.planning import assortment
    cfg = get_config()
    m = _master()
    if "assoc" not in _index_cache:
        _index_cache["assoc"] = correlation.attribute_association(m, cfg)
    return {"rows": _clean(assortment.plan_year(_index_cache["assoc"], m, cfg))}


@app.post("/api/cache/clear")
def clear_cache() -> dict:
    _index_cache.clear()
    return {"ok": True}


@app.exception_handler(FileNotFoundError)
async def not_found(request, exc):
    return JSONResponse(status_code=409, content={
        "error": str(exc),
        "hint": "資料尚未備妥。請依序執行：ingest → embed → build → analyze",
    })


if WEB_DIR.exists():
    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
