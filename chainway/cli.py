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

    for w in cfg.platform_warnings():
        _warn(w)
        print()

    print("\n【1】資料夾檢查")
    root = cfg.root
    if root is not None:
        mark = "✓" if root.exists() else "!"
        print(f"  {mark} 原始資料根目錄  {root}")
        if not root.exists():
            _warn("  根目錄不存在。常見原因：")
            _warn("    · 路徑打錯（注意中文字與空白，例如「商品設計Raw Data」中間有一個空格）")
            _warn("    · 在 WSL / macOS 上跑，看不到 Windows 的 C:\\ 磁碟")
            _warn("    · settings.yaml 裡用了反斜線 \\，請改成正斜線 /")
        print()

    missing = []
    for row in cfg.describe_paths():
        label = f"{row['key']:16s}"
        if row["exists"]:
            _ok(f"[{row['kind']}] {label} {row['path']}  ({row['n_files']} 個檔案)")
        else:
            _warn(f"[{row['kind']}] {label} {row['path']}  ← 不存在")
            if row["kind"] == "來源":
                missing.append(row["key"])

    # 根目錄存在但子資料夾對不上時，把實際看到的子資料夾列出來供對照
    if root is not None and root.exists() and missing:
        subdirs = sorted(p.name for p in root.iterdir() if p.is_dir())
        print(f"\n  根目錄底下實際的子資料夾：{('、'.join(subdirs) if subdirs else '（沒有子資料夾）')}")
        print("  → 請把 settings.yaml 的名稱改成上面實際的名字，")
        print("    或執行 `python -m chainway.cli scaffold` 依設定自動建立這些資料夾。")

    # POS 找不到時，自動在根目錄底下搜尋長得像進銷存的檔案，直接把路徑列出來。
    # 使用者不必知道「POS 路徑」是什麼意思，看到路徑照抄進設定就好。
    if root is not None and root.exists() and "pos" in missing:
        print("\n  自動搜尋進銷存報表中…（檔名含 KA 季號的 Excel）")
        hits: dict[Path, int] = {}
        for p in root.rglob("*.xls*"):
            if p.is_file() and cfg.find_season_code(p.name):
                hits[p.parent] = hits.get(p.parent, 0) + 1
        if hits:
            print("  找到了，請把下面其中一行的路徑填進 settings.yaml 的 paths.pos：")
            for folder, n in sorted(hits.items(), key=lambda kv: -kv[1])[:5]:
                try:
                    rel = folder.relative_to(root)
                    print(f"    pos: \"{rel.as_posix()}\"      （{n} 個檔案）")
                except ValueError:
                    print(f"    pos: \"{folder.as_posix()}\"   （{n} 個檔案）")
        else:
            print("  沒找到。進銷存報表可能不在這個根目錄底下 ——")
            print("  在檔案總管搜尋你的報表檔名（例如 KA158_0828），")
            print("  在檔案上按右鍵 →「複製檔案位址」，把路徑貼進 paths.pos 即可。")

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
        print(f"\n→ 尚未就緒的來源資料夾：{', '.join(missing)}")
        print("  修正方式：改 config/settings.yaml 的 paths，"
              "或執行 `python -m chainway.cli scaffold` 建立資料夾")
    return 0


# ------------------------------------------------------------------ scaffold
def cmd_scaffold(args) -> int:
    """依 settings.yaml 建立來源資料夾，並在每個夾內放一張說明卡。"""
    cfg = get_config()
    root = cfg.root
    if root is not None and not root.exists():
        if not args.yes:
            _warn(f"根目錄不存在：{root}")
            _warn("確認路徑無誤的話，加上 --yes 讓我一併建立它。")
            return 1
        root.mkdir(parents=True, exist_ok=True)
        _ok(f"已建立根目錄 {root}")

    hints = {
        "system_images": "放去背商品照，檔名必須含貨號，例如 CW24AW-TP-0135-BLK.png",
        "tech_packs": "放裁縫指示書，檔名必須含貨號。Excel 尺寸表準確率最高（100%），其次文字型 PDF",
        "pos": "放 POS 進銷存 Excel，一年一季一個檔都可以，欄位名稱不用統一",
        "market_research": "放市調照片、街拍、流行線條參考圖，建議依主題分子資料夾",
        "knowledge": "放服裝設計專業知識文件（領型、人體結構、服裝比例）",
    }
    created = 0
    for row in cfg.describe_paths():
        if row["kind"] != "來源":
            continue
        p = row["path"]
        if p.exists():
            _ok(f"已存在  {p}")
            continue
        p.mkdir(parents=True, exist_ok=True)
        (p / "_請把檔案放在這個資料夾.txt").write_text(
            f"{row['key']}\n\n{hints.get(row['key'], '')}\n\n"
            f"詳細格式說明見專案的 docs/data_contract.md\n",
            encoding="utf-8",
        )
        _ok(f"已建立  {p}")
        created += 1
    print(f"\n共建立 {created} 個資料夾。放好檔案後執行：python -m chainway.cli doctor")
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
            if "techpack_variant" in tp_df.columns:
                extra = tp_df[tp_df["techpack_variant"].fillna("") != ""]
                if len(extra):
                    _ok(f"其中 {len(extra)} 份是追加/補單（合併時以尺寸較完整者為準）")
            print(cov.head(8).to_string(index=False))

            if args.extract_images:
                print("\n[3b] 抽取指示書內嵌圖（繡花圖稿／布樣／打樣照）…")
                img_dir = cfg.path("outputs") / "techpack_images"
                frames = [techpack.extract_techpack_images(r["techpack_path"], img_dir, r["sku"])
                          for _, r in tp_df.iterrows()]
                frames = [f for f in frames if not f.empty]
                if frames:
                    imgs = pd.concat(frames, ignore_index=True)
                    imgs.to_csv(interim / "techpack_images.csv", index=False, encoding="utf-8-sig")
                    _ok(f"{len(imgs)} 張圖 → {img_dir}")
                    print(imgs["kind_guess"].value_counts().to_string())
                else:
                    _warn("沒有抽到內嵌圖（舊版 .xls 不是 zip 容器，抽不出來）")
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

    print("[6/6] 商業分析與報告…")
    from .analysis import commercial
    timing = commercial.launch_timing_report(master, cfg)
    commercial_tables = {
        "排除稽核": commercial.exclusion_audit(master, cfg),
        "產品線": commercial.product_line_report(master, cfg),
        "上市月份": timing,
        "時機影響": commercial.timing_impact(timing),
        "定價帶": commercial.price_band_report(master, cfg),
        "設計師": commercial.designer_report(master, cfg),
        "改番號家族": pattern.reissue_families(master, cfg),
    }
    hits = {k: len(v) for k, v in commercial_tables.items() if v is not None and not v.empty}
    _ok("商業分析：" + "、".join(f"{k} {n} 列" for k, n in hits.items()))

    perf_summary = performance.summary_by_group(master, cfg)
    audit_path = cfg.path("processed") / "join_audit.csv"
    join_audit = pd.read_csv(audit_path) if audit_path.exists() else pd.DataFrame()

    html_str = rep.build_html(master, perf_summary, assoc, findings, numeric, importance,
                              diag, attribution, sweet, join_audit, cfg, commercial_tables)
    tables = {
        "關鍵發現": findings, "屬性關聯": assoc, "版型相關": numeric,
        "特徵重要度": importance, "版型甜蜜區間": targets, "版型漂移": drift,
        "逐款診斷": diag, "理由×特徵": attribution, "待補回饋": gaps,
        "績效概況": perf_summary, "串接稽核": join_audit,
        **commercial_tables,
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
        res = (idx.search_by_crops(args.image, args.top_k) if args.crops
               else idx.search_by_image(args.image, args.top_k, args.category))
    elif args.text:
        res = idx.search_by_text(args.text, args.top_k, args.category)
    elif args.sku:
        res = idx.search_similar(args.sku, args.top_k)
    else:
        _warn("請指定 --image / --text / --sku 其中之一")
        return 1
    print()
    print(format_results(res, cfg).to_string(index=False))
    return 0


# ------------------------------------------------------------------ eval-search
def cmd_eval_search(args) -> int:
    """用同一把尺量任何一套以圖搜貨號系統的準確率。"""
    from .search.index import VisualIndex, evaluate

    cfg = get_config()

    # 零標註模式：指示書裡的打樣照片是同一件衣服的另一張真實照片，
    # 貨號從檔名就知道。拿它當查詢、看系統圖能不能被找回來，
    # 完全不需要人工標答案，就能得到第一個準確率數字。
    if args.self_test:
        img_csv = cfg.path("interim") / "techpack_images.csv"
        if not img_csv.exists():
            _warn("找不到指示書圖片清單。請先執行："
                  "\n  python -m chainway.cli ingest --extract-images")
            return 1
        imgs = pd.read_csv(img_csv)
        photos = imgs[imgs["kind_guess"] == "打樣照片"]
        if photos.empty:
            _warn("指示書裡沒有抓到打樣照片，無法用零標註模式。請改用 --truth 手動標註。")
            return 1
        truth = photos.rename(columns={"image_path": "query_image", "sku": "true_sku"})[
            ["query_image", "true_sku"]]
        _ok(f"零標註測試集：{len(truth)} 張打樣照片（答案來自指示書檔名）")
    else:
        if not args.truth:
            _warn("請指定 --truth 答案檔，或用 --self-test 跑零標註測試")
            return 1
        try:
            truth = pd.read_csv(args.truth)
        except (pd.errors.EmptyDataError, FileNotFoundError):
            _warn(f"讀不到答案檔：{args.truth}\n格式為兩欄 CSV：query_image,true_sku")
            return 1
    for col in ("query_image", "true_sku"):
        if col not in truth.columns:
            _warn(f"答案檔缺少欄位 '{col}'。格式：query_image,true_sku")
            return 1

    if args.predictions:
        preds = pd.read_csv(args.predictions)
        label = f"外部系統（{Path(args.predictions).name}）"
    else:
        idx = VisualIndex.load(cfg)
        rows = []
        for i, q in enumerate(truth["query_image"], start=1):
            print(f"  搜尋 {i}/{len(truth)}", end="\r", flush=True)
            try:
                res = (idx.search_by_crops(q, args.top_k) if args.crops
                       else idx.search_by_image(q, args.top_k))
            except FileNotFoundError:
                continue
            for _, r in res.iterrows():
                rows.append({"query_image": q, "rank": r["rank"], "sku": r["sku"]})
        print()
        preds = pd.DataFrame(rows, columns=["query_image", "rank", "sku"])
        label = "Chainway" + ("（切塊搜尋）" if args.crops else "")

    summary, detail = evaluate(truth, preds)
    print(f"\n=== {label} ===")
    print(summary.to_string())

    out_dir = cfg.path("outputs") / "eval"
    out_dir.mkdir(parents=True, exist_ok=True)
    tag = ("external" if args.predictions
           else ("selftest" if args.self_test else ("crops" if args.crops else "whole")))
    detail.to_csv(out_dir / f"search_eval_{tag}.csv", index=False, encoding="utf-8-sig")
    _ok(f"逐筆結果 → {out_dir / f'search_eval_{tag}.csv'}")

    miss = detail[detail["hit_rank"].isna()]
    if len(miss):
        print(f"\n完全沒找到的 {len(miss)} 張（最值得看的失敗案例）：")
        print(miss[["query_image", "true_sku", "predicted_top1"]].head(10).to_string(index=False))
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


# -------------------------------------------------------- techpack-notes
def cmd_techpack_notes(args) -> int:
    """先看貴司的指示書實際怎麼寫設計註記，再決定怎麼分類。

    格紋配置寫在指示書上 —— 那是設計師下的規格，不是推測。與其讓
    Fashion-CLIP 猜「格紋在門襟還是領口」，不如直接讀原始文件。
    但要讀之前得先知道用詞，所以這個指令只做一件事：把實際用語攤出來。
    """
    from .ingest import techpack_notes as tn

    cfg = get_config()
    kws = [k.strip() for k in args.keywords.split(",")] if args.keywords else None
    print(f"\n掃描裁縫指示書…（關鍵字：{'、'.join(kws or tn.DEFAULT_KEYWORDS)}）")
    vocab = tn.scan_vocabulary(cfg, kws, limit=args.limit)
    scanned = vocab.attrs.get("scanned_files", 0)
    if vocab.empty:
        _warn(f"掃了 {scanned} 份指示書，沒有任何一格含這些關鍵字。"
              "\n  可能是關鍵字不對，用 --keywords 換一組再試。")
        return 1

    out = cfg.path("interim")
    cov = tn.keyword_coverage(vocab)
    _ok(f"掃描 {scanned} 份指示書，命中 {len(vocab)} 種不同的寫法")
    print("\n【關鍵字覆蓋率】哪些詞真的常用，值得建對照表：")
    print(cov.to_string(index=False))
    print(f"\n【最常出現的 {min(args.top, len(vocab))} 種寫法】")
    print(vocab.head(args.top).to_string(index=False))

    vocab.to_csv(out / "techpack_vocabulary.csv", index=False, encoding="utf-8-sig")
    cov.to_csv(out / "techpack_keyword_coverage.csv", index=False, encoding="utf-8-sig")
    _ok(f"完整清單 → {out / 'techpack_vocabulary.csv'}")
    print("\n把這份清單給我，我依實際用詞建「格紋配置」對照表 —— "
          "不用猜的，也不必靠影像模型推測。")
    return 0


# ------------------------------------------------------- season-report
def cmd_season_report(args) -> int:
    """季別診斷報告：每個季別的完銷、袖長對照、上架重疊、銷冠與年度排行。"""
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from scripts import season_report as runner

    argv: list[str] = []
    if args.no_images:
        argv.append("--no-images")
    elif args.images is not None:
        argv += ["--images", args.images] if args.images else ["--images"]
    if args.data:
        argv += ["--data", args.data]
    if args.out:
        argv += ["--out", args.out]
    return runner.main(argv)


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

    sc = sub.add_parser("scaffold", help="依設定建立來源資料夾")
    sc.add_argument("--yes", action="store_true", help="根目錄不存在時也一併建立")
    sc.set_defaults(func=cmd_scaffold)

    ing = sub.add_parser("ingest", help="讀取 POS / 系統圖 / 裁縫指示書")
    ing.add_argument("--extract-images", action="store_true",
                     help="一併抽出指示書內嵌的繡花圖稿、布樣與打樣照")
    ing.set_defaults(func=cmd_ingest)

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
    s.add_argument("--category", help="限定品類（TOP/BOTTOM_PANTS/…），可大幅提高命中率")
    s.add_argument("--crops", action="store_true", help="穿搭照：切塊後逐件搜尋")
    s.set_defaults(func=cmd_search)

    ev = sub.add_parser("eval-search", help="量測以圖搜貨號的準確率（可比較不同系統）")
    ev.add_argument("--truth", help="答案檔 CSV：query_image,true_sku")
    ev.add_argument("--self-test", action="store_true",
                    help="零標註模式：用指示書的打樣照片當查詢，答案取自檔名")
    ev.add_argument("--predictions", help="外部系統的結果 CSV：query_image,rank,sku（省略則用本專案）")
    ev.add_argument("--crops", action="store_true", help="用切塊搜尋（穿搭照建議開）")
    ev.add_argument("--top-k", type=int, default=10)
    ev.set_defaults(func=cmd_eval_search)

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

    tn = sub.add_parser("techpack-notes", help="★ 掃描指示書的設計註記用詞（格紋配置等）")
    tn.add_argument("--keywords", help="自訂關鍵字，逗號分隔；預設含 格/配格/對格/門襟/滾邊…")
    tn.add_argument("--top", type=int, default=40, help="畫面上顯示幾種寫法（預設 40）")
    tn.add_argument("--limit", type=int, help="只掃前 N 份，先試跑用")
    tn.set_defaults(func=cmd_techpack_notes)

    sr = sub.add_parser("season-report", help="★ 季別完銷診斷報告（含袖長對照）")
    sr.add_argument("--images", nargs="?", const="", default=None,
                    help="系統圖根目錄；不給值就用 settings.yaml 的 paths.root")
    sr.add_argument("--no-images", action="store_true", help="不要內嵌縮圖，只印路徑")
    sr.add_argument("--data", help="用先前存下的資料集 JSON 重畫，不重算")
    sr.add_argument("--out", help="HTML 輸出位置")
    sr.set_defaults(func=cmd_season_report)

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
