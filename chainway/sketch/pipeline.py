"""市調圖線稿工作流：一支指令跑完 裁切 → 線稿 → SVG → 彩現 → 標註 → 對照頁。

用法一（有 job 檔，可重現、可版本控管）：
    python -m chainway.cli sketch --jobs config/sketch_jobs.yaml

用法二（快速試一張，自動找重點區）：
    python -m chainway.cli sketch --image "data/raw/market_research/街拍_領口.jpg" --auto

輸出到 data/outputs/sketches/<job_id>/：
    01_crop.png  02_line.png  02_line.svg  03_render.png
    04_annotated.png  05_contact_sheet.png  spec.md  prompt.txt  palette.json
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from ..config import Config, get_config
from . import annotate as ann
from . import lineart as la


@dataclass
class SketchJob:
    id: str
    image: str
    title: str = ""
    regions: list[dict[str, Any]] = field(default_factory=list)
    notes: list[dict[str, Any]] = field(default_factory=list)
    application: str = ""
    category: str = "TOP"
    attributes: dict[str, str] = field(default_factory=dict)
    fabric: str | None = None


def load_jobs(path: str | Path) -> list[SketchJob]:
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    return [SketchJob(**j) for j in data.get("jobs", [])]


def run_job(job: SketchJob, cfg: Config | None = None) -> dict[str, Any]:
    cfg = cfg or get_config()
    scfg = cfg.get("sketch", {})
    out_dir = cfg.path("outputs") / "sketches" / job.id
    out_dir.mkdir(parents=True, exist_ok=True)

    src = Path(job.image)
    if not src.is_absolute():
        candidate = cfg.path("market_research") / job.image
        src = candidate if candidate.exists() else src
    img = la.load_image(src)

    regions = job.regions or [{"box": [0, 0, 1, 1], "label": "全圖"}]
    results = []

    for i, region in enumerate(regions, start=1):
        tag = region.get("label", f"region{i}")
        sub = out_dir if len(regions) == 1 else out_dir / f"{i:02d}_{_safe(tag)}"
        sub.mkdir(parents=True, exist_ok=True)

        crop = la.crop_region(img, tuple(region["box"]), normalized=region.get("normalized", True))
        # 只縮小、不放大：放大過的裁切區是糊的，線稿演算法在上面抓不到邊。
        crop = la.resize_long_side(crop, int(scfg.get("output_size", 1600)), max_upscale=1.0)
        la.save(crop, sub / "01_crop.png")

        line = la.to_lineart(crop, cfg)
        ink = la.ink_ratio(line)
        if ink < 0.005:   # 幾乎空白 → 換 canny 再試一次（低對比照片常見）
            line = la.to_lineart(crop, cfg, engine="canny")
            ink = la.ink_ratio(line)
        la.save(line, sub / "02_line.png")

        svg_path = None
        if scfg.get("vectorize", True):
            svg_path = la.vectorize(line, sub / "02_line.svg")

        render = la.flat_render(crop, line, cfg)
        la.save(render, sub / "03_render.png")

        palette = la.extract_palette(crop, int(scfg.get("render_palette_colors", 6)))
        (sub / "palette.json").write_text(json.dumps(palette, ensure_ascii=False, indent=2), encoding="utf-8")

        notes = [n for n in job.notes if n.get("region", tag) == tag] or job.notes
        if notes:
            annotated = ann.annotate(line, notes, cfg, title=region.get("label", job.title))
            la.save(annotated[:, :, ::-1] if annotated.ndim == 3 else annotated, sub / "04_annotated.png")

        sheet = ann.contact_sheet(crop, line, render, palette,
                                  title=f"{job.title or job.id} — {tag}", cfg=cfg)
        la.save(sheet, sub / "05_contact_sheet.png")

        quality = ("線稿過於稀疏，這一區可能對比不足或本來就沒有結構線" if ink < 0.005
                   else "線稿過密，可能把布料紋理也畫進去了" if ink > 0.25 else "正常")
        results.append({"region": tag, "dir": str(sub), "svg": str(svg_path) if svg_path else None,
                        "palette": palette, "ink_ratio": round(ink, 4), "quality": quality})

    # 規格書與繪圖 prompt
    from .flats_prompt import build_prompt, build_spec

    spec = build_spec(job.category, job.attributes, job.fabric, None, cfg,
                      notes=([job.application] if job.application else None))
    prompt = build_prompt(job.category, job.attributes, job.fabric, cfg=cfg)
    (out_dir / "spec.md").write_text(spec, encoding="utf-8")
    (out_dir / "prompt.txt").write_text(
        f"PROMPT:\n{prompt['prompt']}\n\nNEGATIVE:\n{prompt['negative']}\n\nNOTE:\n{prompt['note']}\n",
        encoding="utf-8",
    )

    warn = ann.font_warning(cfg)
    return {"job": job.id, "out_dir": str(out_dir), "regions": results,
            "spec": str(out_dir / "spec.md"), "prompt": str(out_dir / "prompt.txt"),
            "warning": warn}


def run_quick(image: str | Path, cfg: Config | None = None, auto: bool = True,
              max_regions: int = 4, job_id: str | None = None) -> dict[str, Any]:
    """單張快速處理，不需要 job 檔。"""
    cfg = cfg or get_config()
    img = la.load_image(image)
    regions = ([{"box": list(b), "label": f"重點{i}"} for i, b in
                enumerate(la.auto_regions(img, max_regions), start=1)]
               if auto else [{"box": [0, 0, 1, 1], "label": "全圖"}])
    job = SketchJob(
        id=job_id or Path(image).stem,
        image=str(image),
        title=Path(image).stem,
        regions=regions,
    )
    return run_job(job, cfg)


def _safe(name: str) -> str:
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in str(name))[:40]
