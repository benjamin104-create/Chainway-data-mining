"""季別診斷報告 —— 一行指令從 POS 原始檔跑到 HTML。

    python scripts/season_report.py
    python scripts/season_report.py --images "C:/Users/USER/Desktop/商品設計Raw Data"

流程：讀 settings.yaml 的 paths.pos → 解析所有進銷存報表 → 彙總到
貨號×季別 → 算出全部季別指標 → 畫成 HTML。中間的資料集會另存一份 JSON，
方便你拿去做別的分析，或在沒有原始檔的機器上重畫報告。

參數：
  --images <根目錄>   把系統圖縮圖內嵌進報告（預設用 settings.yaml 的 paths.root）
  --no-images         明確不要縮圖，只印圖檔路徑
  --data <JSON>       跳過重算，直接用先前存下的資料集重畫
  --out <HTML>        輸出位置（預設 data/outputs/reports/season_report.html）
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from chainway.analysis import season as season_analysis  # noqa: E402
from chainway.config import get_config  # noqa: E402
from chainway.report import season_report  # noqa: E402


def build(cfg, cache: Path) -> dict:
    """從 POS 原始檔算出資料集。優先用 ingest 產生的中繼檔，沒有才現讀。"""
    import pandas as pd

    from chainway.ingest import pos

    interim = cfg.path("interim") / "sales_by_sku_season.parquet"
    if interim.exists():
        print(f"讀取中繼檔 {interim}")
        agg = pd.read_parquet(interim)
    else:
        pos_dirs = cfg.path("pos")
        print(f"讀取進銷存報表：{pos_dirs}")
        try:
            raw, _audit = pos.load_pos(cfg)
        except FileNotFoundError as exc:
            # 路徑填錯是最常見的失誤，給明確指引比丟 traceback 有用
            raise SystemExit(f"{exc}\n  可先跑 python -m chainway.cli doctor 檢查所有路徑。") from None
        if raw.empty:
            raise SystemExit(
                f"沒有讀到任何銷售資料。\n"
                f"  請確認 config/settings.yaml 的 paths.pos 指向正確的資料夾：{pos_dirs}\n"
                f"  也可以先跑 python -m chainway.cli doctor 檢查路徑。")
        agg = pos.aggregate_to_sku_season(raw)
        print(f"  {len(raw):,} 筆明細 → 彙總 {len(agg):,} 筆（貨號×季別）")

    data = season_analysis.build_dataset(agg, cfg)
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"資料集已存 {cache}")
    return data


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="產生季別完銷診斷報告")
    ap.add_argument("--images", nargs="?", const="", default=None,
                    help="系統圖根目錄；不給值就用 settings.yaml 的 paths.root")
    ap.add_argument("--no-images", action="store_true", help="不要內嵌縮圖")
    ap.add_argument("--data", help="用先前存下的資料集 JSON 重畫，不重算")
    ap.add_argument("--out", help="HTML 輸出位置")
    args = ap.parse_args(argv)

    cfg = get_config()
    outputs = cfg.path("outputs") / "reports"
    cache = outputs / "season_dataset.json"

    if args.data:
        data = json.loads(Path(args.data).read_text(encoding="utf-8"))
        print(f"使用既有資料集 {args.data}")
    else:
        data = build(cfg, cache)

    # 縮圖根目錄：--images 有給值就用它，只給旗標就用 paths.root，
    # 都沒給就試 paths.system_images 的上層。找不到就退回只印路徑。
    img_root: Path | None = None
    if not args.no_images:
        if args.images:
            img_root = Path(args.images)
        else:
            try:
                img_root = cfg.path("system_images").parent
            except Exception:
                img_root = None
        if img_root and not img_root.exists():
            print(f"⚠ 找不到圖片根目錄 {img_root} —— 改為只在卡片下方印圖檔路徑")
            img_root = None

    if img_root:
        # 3,729 張圖掃過去要幾秒，先講一聲，不然畫面像當掉了
        print(f"掃描系統圖：{img_root}")
        n_idx = len(season_report.index_images(img_root))
        print(f"  對到 {n_idx:,} 個貨號")
        if n_idx == 0:
            print("  ⚠ 一個貨號都沒對到 —— 檢查該目錄底下是否有檔名含 KA+7 碼的圖檔")

    html = season_report.render(data, img_root)
    # 檔名刻意用 ASCII：Windows 的 .bat 要開這個檔，而批次檔一旦混進
    # 多位元組字元，cmd.exe 會算錯位元組位置並開始執行殘缺的指令片段。
    # 報告標題仍是中文，只有檔名避開。
    out = Path(args.out) if args.out else outputs / "season_report.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")

    n_img = html.count("data:image/jpeg;base64,")
    print(f"\n✓ 報告已產生：{out}")
    print(f"  {len(html):,} bytes　季別 {len(data['seasons'])} 個　"
          f"納入分析 {data['meta']['analysed']:,} 款　縮圖 {n_img} 張")
    if img_root and n_img == 0:
        print(f"  ⚠ 一張縮圖都沒嵌到 —— 檢查 {img_root} 底下是否有「系統圖/KA###/貨號.jpg」")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
