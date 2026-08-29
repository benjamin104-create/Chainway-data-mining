"""機械圖 Prompt 產生器（對應 /draw-flats 技能）。

本機演算法能給你「照片線條化」；要得到乾淨、對稱、可入 Tech Pack 的
向量機械圖，還是得靠生成式繪圖或人工描稿。這支負責產出那份「指令」：

  build_spec()    → 結構化的款式規格（繁中，可直接當 Tech Pack 文字稿）
  build_prompt()  → 英文繪圖 prompt（Firefly / DALL·E / Midjourney 通用）
  from_search_hit() → 從「以圖搜到的自家相似款」自動帶入既有規格，
                      不用從零描述，這是最省時的用法

輸出刻意分成正背面兩段，因為機械圖一定要有背面，
而多數生成模型不給明確指令就只畫正面。
"""

from __future__ import annotations

import pandas as pd

from ..config import Config, get_config

BASE_STYLE = (
    "clean pure white background, 2D technical vector fashion flat sketch, "
    "black line art only, uniform line weight, no greyscale shading, no human model, "
    "no mannequin, perfectly symmetrical, centered, front view and back view side by side, "
    "precise visible stitch lines, industry standard tech pack illustration"
)

NEGATIVE = (
    "no photorealism, no fabric texture rendering, no shadows, no gradients, no colour fill, "
    "no background props, no watermark, no text labels"
)

# 布性 → 線稿畫法（來自品牌知識庫的工藝限制）
FABRIC_LINE_RULES = {
    "woven_crisp": "structured fabric: draw crisp straight structural seam lines, sharp corners, defined dart legs",
    "woven_drape": "fluid fabric: draw soft natural drape lines falling from the shoulder and waist",
    "knit_fine": "fine knit: draw subtle rib indication at neckline, cuff and hem only",
    "knit_chunky": "chunky knit: indicate cable or rib direction with light repeating guide lines",
    "denim": "denim: draw double-needle topstitch lines in the standard 0.6cm spacing, bar tacks at pocket corners",
    "leather": "leather: draw clean panel seams with visible edge stitch",
    "tweed": "tweed: indicate boucle edge with a light broken outline, mark fringe trim if present",
    "sheer": "sheer fabric: draw the underlayer with a lighter dashed line",
    "satin": "satin: draw minimal soft drape lines, avoid hard creases",
}

PLAID_RULE = (
    "plaid alignment: add a vertical centre front alignment guide line and horizontal "
    "match lines at chest, waist and hem; mark pattern-match points at side seams"
)


def build_spec(
    category: str,
    attributes: dict[str, str],
    fabric: str | None = None,
    measurements: dict[str, float] | None = None,
    cfg: Config | None = None,
    notes: list[str] | None = None,
) -> str:
    """產生繁體中文款式規格書（可直接貼進 Tech Pack）。"""
    cfg = cfg or get_config()
    lines = [f"# 款式規格 — {cfg.category_label(category)}", ""]

    lines.append("## 一、結構定義")
    for attr, code in attributes.items():
        if code in ("n/a", "uncertain", None, ""):
            continue
        lines.append(f"- **{cfg.attribute_label(attr)}**：{cfg.option_label(attr, str(code))}（`{code}`）")

    if fabric:
        lines += ["", "## 二、面料與工藝限制", f"- 面料屬性：{cfg.option_label('fabric_look', fabric)}"]
        rule = FABRIC_LINE_RULES.get(fabric)
        if rule:
            lines.append(f"- 線稿畫法要求：{rule}")
        if attributes.get("pattern") == "check":
            lines.append(f"- 對格工藝：{PLAID_RULE}")

    if measurements:
        lines += ["", "## 三、重點尺寸（基準碼，cm）", "", "| 部位 | 尺寸 |", "|---|---|"]
        labels = {f["code"]: f["zh"] for f in cfg.taxonomy.get("measurements", {}).get("fields", [])}
        for code, val in measurements.items():
            if pd.notna(val):
                lines.append(f"| {labels.get(code, code)} | {val} |")

    if notes:
        lines += ["", "## 四、設計備註"] + [f"- {n}" for n in notes]

    return "\n".join(lines)


def build_prompt(
    category: str,
    attributes: dict[str, str],
    fabric: str | None = None,
    extra: str | None = None,
    cfg: Config | None = None,
) -> dict[str, str]:
    """產生英文繪圖 prompt。回傳 {"prompt", "negative", "note"}。"""
    cfg = cfg or get_config()
    garment = {
        "TOP": "womenswear top", "OUTER": "womenswear outerwear jacket",
        "BOTTOM_PANTS": "womenswear trousers", "BOTTOM_SKIRT": "womenswear skirt",
        "DRESS": "womenswear dress", "ACC": "fashion accessory",
    }.get(category, "womenswear garment")

    parts: list[str] = []
    for attr, code in attributes.items():
        if code in ("n/a", "uncertain", None, ""):
            continue
        for opt in cfg.attribute_options(attr):
            if opt["code"] == code:
                parts.append(opt["prompt"].replace("a garment with ", "").replace("a garment ", ""))
                break

    desc = ", ".join(parts)
    prompt = f"{BASE_STYLE}. A {garment} with {desc}"
    if fabric and fabric in FABRIC_LINE_RULES:
        prompt += f". {FABRIC_LINE_RULES[fabric]}"
    if attributes.get("pattern") == "check":
        prompt += f". {PLAID_RULE}"
    if extra:
        prompt += f". {extra}"

    return {
        "prompt": prompt + ".",
        "negative": NEGATIVE,
        "note": "先出正背面線稿；確認結構無誤後，再用同一段 prompt 加上配色描述產彩現圖。",
    }


def from_search_hit(hit: pd.Series, cfg: Config | None = None, extra: str | None = None) -> dict[str, str]:
    """從「以圖搜尋命中的自家款」直接產生規格 + prompt。

    用法：拿市調照片 → search_by_image() → 取第一名 → 這支函式
    → 你就得到一份「以自家既有版型為基礎、加上市調新元素」的規格。
    """
    cfg = cfg or get_config()
    category = str(hit.get("category", "TOP"))
    attrs = {a: hit.get(a) for a in cfg.attributes_for(category) if a in hit.index}
    measurements = {
        f["code"]: hit.get(f["code"])
        for f in cfg.taxonomy.get("measurements", {}).get("fields", [])
        if f["code"] in hit.index and pd.notna(hit.get(f["code"]))
    }
    spec = build_spec(category, attrs, hit.get("fabric_look"), measurements, cfg,
                      notes=[f"基礎版型參考自家貨號 {hit.get('sku')}（歷史售罄率 "
                             f"{hit.get('sell_through_rate', float('nan')):.0%}）"
                             if pd.notna(hit.get("sell_through_rate")) else
                             f"基礎版型參考自家貨號 {hit.get('sku')}"])
    prompt = build_prompt(category, attrs, hit.get("fabric_look"), extra, cfg)
    return {**prompt, "spec_zh": spec, "base_sku": str(hit.get("sku", ""))}
