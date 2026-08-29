"""統一指令入口。

典型流程（第一次跑）：
    python -m chainway.cli doctor          # 檢查環境與資料夾
    python -m chainway.cli ingest          # 讀 POS / 系統圖 / 指示書
    python -m chainway.cli embed           # 跑 Fashion-CLIP（最花時間，有快取）
    python -m chainway.cli build           # 合併主表 + 績效分級
    python -m chainway.cli analyze         # 關聯分析 + 診斷 + 報告

日常使用：
    python -m chainway.cli feedback template     # 產生給業務填的 Excel
    python -m chainway.cli search --image x.jpg  # 以圖反查貨號與價格
    python -m chainway.cli sketch --image y.jpg --auto   # 市調圖轉線稿
    python -m chainway.cli plan --week 3         # 週度企劃
    python -m chainway.cli serve                 # 開網頁後台
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

from .config import get_config

pd.set_option("display.width", 180)
pd.set_option("display.max_columns", 40)


def _ok(msg: str) -> None:
    print(f"  ✓ {msg}")


def _warn(msg: str) -> None:
    print(f"  ! {msg}")


# ------------------------------------------------------------------ doctor
def cmd_doctor(args) -> int:
    cfg = get_config()
    print("\n【1】資料夾檢查")
    missing = []
    for key in ("system_images", "tech_packs", "pos", "market_research", "knowledge", "feedback"):
        p = cfg.path(key)
        if p.exists():
            n = sum(1 for _ in p.rglob("*") if _.is_file())
            _ok(f"{key:16s} {p}  ({n} 個檔案)")
        else:
            _warn(f"{key:16s} {p}  ← 不存在")
            missing.append(key)

    print("\n【2】套件檢查")
    core = ["pandas", "numpy", "yaml", "openpyxl"]
    optional = {
        "torch": "影像特徵萃取（必要，除非只跑統計）",
        "transformers": "Fashion-CLIP 模型",
        "sklearn": "特徵重要度與版群分析",
        "scipy": "精確的卡方 p 值",
        "cv2": "線稿生成",
        "PIL": "縮圖與標註",
        "pdfplumber": "PDF 指示書解析",
        "pytesseract": "掃描件 OCR",
        "faiss": "大量商品的快速檢索（可省略）",
        "fastapi": "網頁後台",
    }
    for mod in core:
        try:
            __import__(mod)
            _ok(f"{mod}")
        except ImportError:
            _warn(f"{mod}  ← 必要套件缺少，請 pip install -r requirements.txt")
    for mod, why in optional.items():
        try:
            __import__(mod)
            _ok(f"{mod:14s} {why}")
        except ImportError:
            _warn(f"{mod:14s} 未安裝 — {why}")

    print("\n【3】中文字型（線稿標註用）")
    from .sketch.annotate import font_warning
    w = font_warning(cfg)
    _warn(w) if w else _ok("找到可用的中文字型")

    print("\n【4】回饋表")
    from .ingest.feedback import feedback_path
    fp = feedback_path(cfg)
    if fp.exists():
        df = pd.read_csv(fp)
        _ok(f"{fp}（{len(df)} 筆）")
    else:
        _warn(f"{fp} 尚未建立，執行 `feedback init` 產生")

    if missing:
        print(f"\n→ 請在 config/settings.yaml 的 paths 補上：{', '.join(missing)}")
    return 0


# ------------------------------------------------------------------ ingest
def cmd_ingest(args) -> int:
    from .ingest import images, pos, techpack

    cfg = get_config()
    interim = cfg.path("interim")

    print("\n[1/3] 掃描系統圖…")
    try:
        img_df = images.scan_images(cfg)
        img_df.to_parquet(interim / "image_manifest.parquet", index=False)
        if img_df.empty:
            _warn(f"{cfg.path('system_images')} 底下沒有找到任何圖檔 —— "
                  "分析仍可進行，但無法做屬性標註與以圖搜款")
        else:
            _ok(f"{len(img_df)} 張圖，{img_df['sku'].nunique()} 個貨號")
    except FileNotFoundError as e:
        _warn(str(e))
        img_df = pd.DataFrame()

    print("\n[2/3] 讀取 POS 進銷存…")
    sales_df, audit = pos.load_pos(cfg)
    if sales_df.empty:
        _warn("沒有讀到任何銷售資料 —— 這是必要資料，請確認 paths.pos")
    else:
        agg = pos.aggregate_to_sku_season(sales_df)
        agg.to_parquet(interim / "sales_by_sku_season.parquet", index=False)
        _ok(f"{len(sales_df):,} 筆明細 → 彙總 {len(agg):,} 筆（貨號×季別）")
    audit.to_csv(interim / "pos_import_audit.csv", index=False, encoding="utf-8-sig")
    skipped = audit[audit["status"] == "SKIPPED"] if not audit.empty else pd.DataFrame()
    if not skipped.empty:
        _warn(f"{len(skipped)} 個工作表因找不到貨號欄位被略過，詳見 pos_import_audit.csv")

    print("\n[3/3] 解析裁縫指示書…")
    try:
        tp_df = techpack.load_tech_packs(cfg)
        if tp_df.empty:
            _warn("沒有讀到指示書")
        else:
            tp_df.to_parquet(interim / "techpack.parquet", index=False)
            cov = techpack.coverage_report(tp_df, cfg)
            cov.to_csv(interim / "techpack_coverage.csv", index=False, encoding="utf-8-sig")
            _ok(f"{len(tp_df)} 份指示書，平均抽出 {tp_df['extract_fields'].mean():.1f} 個尺寸欄位")
            print(cov.head(8).to_string(index=False))
    except FileNotFoundError as e:
        _warn(str(e))

    print(f"\n中繼檔已寫入 {interim}")
    return 0


# ------------------------------------------------------------------ embed
def cmd_embed(args) -> int:
    from .features import attributes as attr_mod
    from .features import fashion_clip as fc

    cfg = get_config()
    manifest_path = cfg.path("interim") / "image_manifest.parquet"
    if not manifest_path.exists():
        _warn("請先執行 `ingest`")
        return 1
    manifest = pd.read_parquet(manifest_path)
    if manifest.empty:
        _warn(f"沒有任何系統圖可處理。請確認 config/settings.yaml 的 "
              f"paths.system_images（目前指向 {cfg.path('system_images')}）")
        return 1

    print(f"\n對 {int(manifest['is_primary'].astype(bool).sum())} 張主圖萃取 Fashion-CLIP 向量…")
    meta, vecs = fc.build_image_embeddings(manifest, cfg, use_cache=not args.no_cache)
    fc.save_embeddings(meta, vecs, cfg)
    _ok(f"向量維度 {vecs.shape}")

    print("\n進行 zero-shot 設計屬性標註…")
    tagged = attr_mod.tag_all(meta, vecs, cfg)
    tagged = attr_mod.to_chinese(tagged, cfg)
    tagged.to_parquet(cfg.path("processed") / "image_attributes.parquet", index=False)

    cov = attr_mod.coverage(tagged, cfg)
    cov.to_csv(cfg.path("processed") / "attribute_coverage.csv", index=False, encoding="utf-8-sig")
    _ok(f"完成 {len(tagged)} 款標註")
    print("\n標註品質（uncertain 比例越低越好）：")
    print(cov.to_string(index=False))
    if not cov.empty and cov["uncertain_rate"].max() > 0.4:
        _warn("有屬性維度的不確定比例超過 40% —— 建議調整 taxonomy.yaml 的 prompt 措辭，"
              "或把該維度排除在分析之外")
    return 0


# ------------------------------------------------------------------ build
def cmd_build(args) -> int:
    from .analysis import performance
    from .ingest import feedback as fb_mod
    from .merge import build_master as bm

    cfg = get_config()
    interim, processed = cfg.path("interim"), cfg.path("processed")

    sales_path = interim / "sales_by_sku_season.parquet"
    if not sales_path.exists():
        _warn("找不到銷售彙總檔，請先執行 `ingest`")
        return 1
    sales = pd.read_parquet(sales_path)

    attrs = pd.read_parquet(processed / "image_attributes.parquet") if (processed / "image_attributes.parquet").exists() else None
    tp = pd.read_parquet(interim / "techpack.parquet") if (interim / "techpack.parquet").exists() else None

    fb_raw = fb_mod.load_feedback(cfg)
    issues = fb_mod.validate_feedback(fb_raw, cfg)
    if not issues.empty:
        _warn(f"回饋表有 {len(issues)} 列格式問題：")
        print(issues.to_string(index=False))
        issues.to_csv(processed / "feedback_issues.csv", index=False, encoding="utf-8-sig")
    fb_sum = fb_mod.summarize_feedback(fb_raw, cfg)

    print("\n合併主表…")
    master, audit = bm.build_master(sales, attrs, tp, fb_sum, cfg)
    print(audit.to_string(index=False))

    print("\n績效分級…")
    master = performance.grade(master, cfg)
    counts = master["perf_band_zh"].value_counts()
    print(counts.to_string())

    bm.save_master(master, audit, cfg)
    performance.summary_by_group(master, cfg).to_csv(
        processed / "performance_summary.csv", index=False, encoding="utf-8-sig")
    _ok(f"主表已寫入 {processed / 'master.parquet'}（{len(master):,} 列）")
    return 0


# ------------------------------------------------------------------ analyze
def cmd_analyze(args) -> int:
    from .analysis import correlation, diagnosis, pattern, performance
    from .merge.build_master import load_master
    from .report import build_report as rep

    cfg = get_config()
    master = load_master(cfg)

    print("\n[1/6] 屬性關聯分析…")
    assoc = correlation.attribute_association(master, cfg)
    findings = correlation.top_findings(assoc, cfg)
    _ok(f"{len(assoc)} 組合，{int(assoc['significant'].sum()) if not assoc.empty else 0} 組達顯著")

    print("[2/6] 版型比例相關性…")
    numeric = correlation.numeric_association(master, cfg)

    print("[3/6] 多變量特徵重要度…")
    importance = correlation.feature_importance(master, cfg)

    print("[4/6] 版型甜蜜區間…")
    sweet = pattern.sweet_spot(master, cfg)
    targets = pattern.sweet_spot_targets(sweet)
    drift = pattern.silhouette_drift(master, cfg)

    print("[5/6] 市場回饋交叉診斷…")
    diag = diagnosis.diagnose(master, cfg)
    attribution = diagnosis.attribution_by_tag(master, cfg)
    gaps = diagnosis.coverage_gap(master, cfg)
    stats = diagnosis.summary_stats(diag)
    if stats:
        print(f"    回饋涵蓋率 {stats['feedback_coverage']:.0%}｜衝突 {stats['conflicts']} 款"
              f"｜假滯銷 {stats['false_slow']} 款｜真滯銷 {stats['true_slow']} 款")

    print("[6/6] 產生報告…")
    perf_summary = performance.summary_by_group(master, cfg)
    audit_path = cfg.path("processed") / "join_audit.csv"
    join_audit = pd.read_csv(audit_path) if audit_path.exists() else pd.DataFrame()

    html_str = rep.build_html(master, perf_summary, assoc, findings, numeric, importance,
                              diag, attribution, sweet, join_audit, cfg)
    tables = {
        "關鍵發現": findings, "屬性關聯": assoc, "版型相關": numeric,
        "特徵重要度": importance, "版型甜蜜區間": targets, "版型漂移": drift,
        "逐款診斷": diag, "理由×特徵": attribution, "待補回饋": gaps,
        "績效概況": perf_summary, "串接稽核": join_audit,
    }
    html_path, xlsx_path = rep.save_report(html_str, tables, cfg)
    _ok(f"HTML  {html_path}")
    _ok(f"Excel {xlsx_path}")
    return 0


# ------------------------------------------------------------------ feedback
def cmd_feedback(args) -> int:
    from .ingest import feedback as fb

    cfg = get_config()
    if args.action == "init":
        p = fb.ensure_feedback_file(cfg)
        _ok(f"回饋表：{p}")
    elif args.action == "template":
        p = fb.make_excel_template(cfg=cfg)
        _ok(f"發放用 Excel（含下拉選單）：{p}")
    elif args.action == "validate":
        df = fb.load_feedback(cfg)
        issues = fb.validate_feedback(df, cfg)
        if issues.empty:
            _ok(f"{len(df)} 筆回饋，格式全部正確")
        else:
            _warn(f"{len(issues)} 列有問題：")
            print(issues.to_string(index=False))
    elif args.action == "gaps":
        from .analysis.diagnosis import coverage_gap
        from .merge.build_master import load_master
        gaps = coverage_gap(load_master(cfg), cfg)
        print(f"\n最需要補市調的 {min(30, len(gaps))} 款：")
        print(gaps.head(30).to_string(index=False))
    return 0


# ------------------------------------------------------------------ search
def cmd_search(args) -> int:
    from .search.index import VisualIndex, format_results

    cfg = get_config()
    idx = VisualIndex.load(cfg)
    if args.image:
        res = idx.search_by_image(args.image, args.top_k)
    elif args.text:
        res = idx.search_by_text(args.text, args.top_k)
    elif args.sku:
        res = idx.search_similar(args.sku, args.top_k)
    else:
        _warn("請指定 --image / --text / --sku 其中之一")
        return 1
    print()
    print(format_results(res, cfg).to_string(index=False))
    return 0


# ------------------------------------------------------------------ sketch
def cmd_sketch(args) -> int:
    from .sketch import pipeline

    cfg = get_config()
    if args.jobs:
        results = [pipeline.run_job(j, cfg) for j in pipeline.load_jobs(args.jobs)]
    elif args.image:
        results = [pipeline.run_quick(args.image, cfg, auto=args.auto, max_regions=args.regions)]
    else:
        _warn("請指定 --jobs 或 --image")
        return 1
    for r in results:
        _ok(f"{r['job']} → {r['out_dir']}")
        if r.get("warning"):
            _warn(r["warning"])
    return 0


# ------------------------------------------------------------------ plan
def cmd_plan(args) -> int:
    from .analysis import correlation
    from .merge.build_master import load_master
    from .planning import assortment

    cfg = get_config()
    master = load_master(cfg)
    assoc = correlation.attribute_association(master, cfg)

    out_dir = cfg.path("outputs") / "plans"
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.year:
        year_plan = assortment.plan_year(assoc, master, cfg)
        path = out_dir / "年度波段規劃.csv"
        year_plan.to_csv(path, index=False, encoding="utf-8-sig")
        print(year_plan.to_string(index=False))
        _ok(f"已寫入 {path}")
        return 0

    week = args.week or 1
    waves = cfg.get("planning", {}).get("waves", [])
    wave = waves[min((week - 1) // 9, len(waves) - 1)] if waves else {"code": "NA", "name": "—"}
    plan = assortment.plan_week(week, wave["code"], assoc, master, cfg, args.n)
    md = assortment.to_markdown(plan, week, wave["name"])
    path = out_dir / f"W{week:02d}_企劃.md"
    path.write_text(md, encoding="utf-8")
    print("\n" + md)
    _ok(f"已寫入 {path}")
    return 0


# ------------------------------------------------------------------ serve
def cmd_serve(args) -> int:
    try:
        import uvicorn
    except ImportError:
        _warn("請先安裝：pip install fastapi uvicorn python-multipart")
        return 1
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    print(f"\n網頁後台：http://{args.host}:{args.port}\n")
    uvicorn.run("apps.api.main:app", host=args.host, port=args.port, reload=args.reload)
    return 0


# ------------------------------------------------------------------ main
def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="chainway", description="服飾特徵 × 銷售數據 交叉分析平台")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("doctor", help="檢查環境、資料夾與套件").set_defaults(func=cmd_doctor)
    sub.add_parser("ingest", help="讀取 POS / 系統圖 / 裁縫指示書").set_defaults(func=cmd_ingest)

    e = sub.add_parser("embed", help="Fashion-CLIP 向量與屬性標註")
    e.add_argument("--no-cache", action="store_true", help="忽略快取重新計算")
    e.set_defaults(func=cmd_embed)

    sub.add_parser("build", help="合併主表並做績效分級").set_defaults(func=cmd_build)
    sub.add_parser("analyze", help="關聯分析、診斷與報告").set_defaults(func=cmd_analyze)

    f = sub.add_parser("feedback", help="★ 市場回饋表工具")
    f.add_argument("action", choices=["init", "template", "validate", "gaps"])
    f.set_defaults(func=cmd_feedback)

    s = sub.add_parser("search", help="以圖／以文反查貨號與價格")
    s.add_argument("--image"); s.add_argument("--text"); s.add_argument("--sku")
    s.add_argument("--top-k", type=int, default=None)
    s.set_defaults(func=cmd_search)

    k = sub.add_parser("sketch", help="市調圖 → 線稿 / 彩現 / 標註")
    k.add_argument("--jobs", help="工作單 YAML")
    k.add_argument("--image", help="單張圖片")
    k.add_argument("--auto", action="store_true", help="自動挑重點區域")
    k.add_argument("--regions", type=int, default=4)
    k.set_defaults(func=cmd_sketch)

    pl = sub.add_parser("plan", help="年度／週度商品企劃")
    pl.add_argument("--week", type=int); pl.add_argument("--year", action="store_true")
    pl.add_argument("--n", type=int, default=None, help="當週款數（預設依 settings）")
    pl.set_defaults(func=cmd_plan)

    sv = sub.add_parser("serve", help="啟動網頁後台")
    sv.add_argument("--host", default="127.0.0.1"); sv.add_argument("--port", type=int, default=8000)
    sv.add_argument("--reload", action="store_true")
    sv.set_defaults(func=cmd_serve)

    args = p.parse_args(argv)
    try:
        return args.func(args)
    except (FileNotFoundError, ImportError) as exc:
        # 缺套件與缺檔案是最常見的兩種狀況，給指引比噴 traceback 有用
        _warn(str(exc))
        return 1
    except KeyboardInterrupt:
        print("\n已中斷")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
