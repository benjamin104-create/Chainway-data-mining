"""季別診斷報告：把 analysis.season 算出的資料集畫成一份 HTML。

這裡只負責畫，不做任何計算 —— 所有數字都來自 ``analysis.season.build_dataset``。
分開的理由是：同一份數字要能同時餵給報告、網頁後台與試算表，
如果算式散在畫圖的程式裡，三邊就會慢慢對不起來。

季別一律標成「年＋季名（季號・季別碼・袖長）」，例：2024秋（KA135・5・短袖）。
服裝業每年的流行不同，只寫年份的話讀者無法回查是哪一批貨。
"""
from __future__ import annotations

import base64
import datetime as dt
import html
import io
import re
from pathlib import Path
from typing import Any

from ..analysis.season import MIN_N_PER_MONTH as MIN_N

# 季別色：同一季別在全報告用同一個顏色，讀者掃過去不必每張圖重新對照
TERM_COLOR = {"7": "#1baf7a", "8": "#eda100", "5": "#eb6834", "6": "#2a78d6"}
YEAR_COLOR = ["#2a78d6", "#1baf7a", "#eda100", "#8a63d2", "#eb6834"]
SLEEVE_COLOR = {"長袖": "#1f3a5f", "短袖": "#c98a1e"}
CRIT = "#d03b3b"
FALLBACK = "#7a756c"


def e(s: Any) -> str:
    return html.escape(str(s))


def _pct(v: Any, nd: int = 1) -> str:
    return "—" if v is None or v != v else f"{v:.{nd}%}"


IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".bmp")
SKU_RE = re.compile(r"KA\d{7}")


def index_images(root: Path) -> dict[str, Path]:
    """掃一次圖庫，建立 貨號 → 圖檔 的對照。

    刻意不假設檔名格式。實際的系統圖有 KA1583008.jpg、KA1583008-1.jpg、
    KA1583008 正面.jpg 等多種寫法，也可能多分一層資料夾；只要檔名裡
    找得到貨號就對得上。用猜路徑的方式做，換個命名慣例就整批落空。

    同一貨號有多張時取檔名最短的 —— 通常是主圖，帶 -1／-2／_02 或
    「背面」等後綴的是次要角度。
    """
    idx: dict[str, Path] = {}
    if not root or not root.exists():
        return idx
    for p in root.rglob("*"):
        if p.suffix.lower() not in IMAGE_EXTS or not p.is_file():
            continue
        if p.name.startswith(("~$", ".")):
            continue
        m = SKU_RE.search(p.stem.upper())
        if not m:
            continue
        sku = m.group(0)
        prev = idx.get(sku)
        if prev is None or len(p.name) < len(prev.name):
            idx[sku] = p
    return idx


class SeasonReport:
    def __init__(self, data: dict[str, Any], images_root: Path | None = None):
        self.d = data
        self.meta = data["meta"]
        self.terms = data["terms"]
        self.seasons = data["seasons"]
        self.img_root = Path(images_root) if images_root else None
        self.img_index = index_images(self.img_root) if self.img_root else {}
        self.years = sorted({s["y"] for s in self.seasons if s["y"]})
        self.yc = {y: YEAR_COLOR[i % len(YEAR_COLOR)] for i, y in enumerate(self.years)}
        self.order = sorted(self.terms, key=lambda k: self.terms[k].get("order", 9))

    # -- 標示 ------------------------------------------------------
    def term_name(self, tc: str) -> str:
        return self.terms.get(str(tc), {}).get("name", str(tc))

    def sleeve(self, tc: str) -> str:
        return self.terms.get(str(tc), {}).get("sleeve", "")

    def tag(self, tc: str) -> str:
        """季名（碼・袖長），例：秋（5・短袖）"""
        return f"{self.term_name(tc)}（{tc}・{self.sleeve(tc)}）"

    def color(self, tc: str) -> str:
        return TERM_COLOR.get(str(tc), FALLBACK)

    # -- 縮圖 ------------------------------------------------------
    def thumb(self, sku: str) -> str | None:
        """把系統圖轉成內嵌縮圖。找不到就回 None，由卡片改印路徑。

        報告常常在沒有圖檔的機器上產生（例如遠端）。這時不該讓整份報告
        失敗，也不該假裝有圖 —— 卡片會改印路徑讓人自己開檔對照。
        """
        p = self.img_index.get(sku)
        if p is None:
            return None
        try:
            from PIL import Image
            im = Image.open(p).convert("RGB")
            im.thumbnail((190, 190))
            b = io.BytesIO()
            im.save(b, "JPEG", quality=76)
            return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()
        except Exception:
            return None

    def img_path_label(self, sku: str, fallback: str) -> str:
        """卡片下方那行路徑：找得到就印實際位置，找不到才印預期位置。"""
        p = self.img_index.get(sku)
        if p is None:
            return fallback
        try:
            return str(p.relative_to(self.img_root))
        except ValueError:
            return str(p)

    def cards(self, items: list[dict], rank: bool = False) -> str:
        if not items:
            return '<p class="sub" style="padding:8px 0">（本季無符合條件的款）</p>'
        out = ['<div class="cards">']
        for i, r in enumerate(items, 1):
            src = self.thumb(r["sku"])
            pic = (f'<img src="{src}" alt="{e(r["sku"])}">' if src
                   else f'<div class="noimg"><span>系統圖</span>{e(r["sku"])}</div>')
            c = "#1baf7a" if r["st"] >= .8 else (CRIT if r["st"] < .3 else "#2a78d6")
            tc = r["kc"][-1]
            badge = f'<div class="rank">{i}</div>' if rank else ""
            out.append(
                f'<figure class="card">{badge}{pic}<figcaption>'
                f'<div class="sku">{e(r["sku"])}<span class="kc">{e(r["kc"])}</span></div>'
                f'<div class="nm">{e(r["nm"])}</div>'
                f'<div class="meta">{e(r["se"])}（{e(tc)}・{e(r.get("sleeve") or self.sleeve(tc))}）'
                f'　{e(r["cat"])}　{e(r["de"])}</div>'
                f'<div class="price">NT$ {r["pr"]:,}</div>'
                f'<div class="track"><span style="width:{min(r["st"],1)*100:.0f}%;background:{c}"></span></div>'
                f'<div class="nums">投入 <b>{r["in"]:,}</b>　售出 <b>{r["sold"]:,}</b>　剩 <b>{r["left"]:,}</b></div>'
                f'<div class="st" style="color:{c}">完銷 {r["st"]:.0%}</div>'
                f'<div class="path">{e(self.img_path_label(r["sku"], r["img"]))}</div>'
                f'</figcaption></figure>')
        return "\n".join(out) + "</div>"

    # -- 圖表 ------------------------------------------------------
    def yoy_bars(self, w: int = 700, maxv: float = 0.8) -> str:
        """每個季別一組，組內是各年份 —— 回答「同一季逐年變好還是變差」。"""
        lw, vw, gh, bh = 96, 132, 26 + 18 * len(self.years), 15
        plot = w - lw - vw
        h = len(self.order) * gh + 30
        o = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img">']
        for t in (0.2, 0.4, 0.6, 0.8):
            x = lw + plot * t / maxv
            o.append(f'<line x1="{x:.1f}" y1="4" x2="{x:.1f}" y2="{len(self.order)*gh+2}" class="grid"/>')
            o.append(f'<text x="{x:.1f}" y="{len(self.order)*gh+20}" class="tick" text-anchor="middle">{t:.0%}</text>')
        for gi, tc in enumerate(self.order):
            y0 = gi * gh + 6
            o.append(f'<text x="{lw-10}" y="{y0+gh/2-8:.0f}" class="lab" text-anchor="end">{e(self.term_name(tc))}（{e(tc)}）</text>')
            o.append(f'<text x="{lw-10}" y="{y0+gh/2+5:.0f}" class="tick" text-anchor="end">{e(self.sleeve(tc))}</text>')
            for si, yr in enumerate(self.years):
                rec = next((r for r in self.d["yoy"] if r["tc"] == tc and r["y"] == yr), None)
                y = y0 + si * (bh + 2)
                if not rec:
                    o.append(f'<text x="{lw+4}" y="{y+bh-3}" class="tick">{yr} 　無資料</text>')
                    continue
                bw = plot * rec["st"] / maxv
                o.append(f'<rect x="{lw}" y="{y}" width="{max(bw,2):.1f}" height="{bh}" rx="3" fill="{self.yc[yr]}"/>')
                o.append(f'<text x="{lw+bw+7:.1f}" y="{y+bh-3}" class="val">{yr} {e(rec["kc"])} {rec["st"]:.1%}'
                         f'<tspan class="dim"> n={rec["n"]}</tspan></text>')
        return "\n".join(o) + "</svg>"

    def term_bars(self, w: int = 700, maxv: float = 0.8) -> str:
        """每一年一組，組內是四季 —— 回答「當年度四季的相對位置」。"""
        lw, vw, bh = 52, 132, 15
        gh = 26 + 18 * len(self.order)
        plot = w - lw - vw
        h = len(self.years) * gh + 30
        o = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img">']
        for t in (0.2, 0.4, 0.6, 0.8):
            x = lw + plot * t / maxv
            o.append(f'<line x1="{x:.1f}" y1="4" x2="{x:.1f}" y2="{len(self.years)*gh+2}" class="grid"/>')
            o.append(f'<text x="{x:.1f}" y="{len(self.years)*gh+20}" class="tick" text-anchor="middle">{t:.0%}</text>')
        for gi, yr in enumerate(self.years):
            y0 = gi * gh + 6
            o.append(f'<text x="{lw-10}" y="{y0+gh/2-2:.0f}" class="lab" text-anchor="end">{yr}</text>')
            for si, tc in enumerate(self.order):
                rec = next((r for r in self.d["yoy"] if r["tc"] == tc and r["y"] == yr), None)
                y = y0 + si * (bh + 2)
                if not rec:
                    o.append(f'<text x="{lw+4}" y="{y+bh-3}" class="tick">{e(self.tag(tc))} 　無資料</text>')
                    continue
                bw = plot * rec["st"] / maxv
                o.append(f'<rect x="{lw}" y="{y}" width="{max(bw,2):.1f}" height="{bh}" rx="3" fill="{self.color(tc)}"/>')
                o.append(f'<text x="{lw+bw+7:.1f}" y="{y+bh-3}" class="val">{e(self.tag(tc))} {e(rec["kc"])} {rec["st"]:.1%}'
                         f'<tspan class="dim"> n={rec["n"]}</tspan></text>')
        return "\n".join(o) + "</svg>"

    def sleeve_rank(self, w: int = 700) -> str:
        """四季依加權完銷排序，長條顏色代表袖長。

        用排序而不是分組，是因為要回答的問題是「袖長能不能解釋名次」——
        如果能，顏色會分成上下兩段；交錯出現就表示不能。
        """
        stats = sorted(self.d["season_stats"], key=lambda r: -r["st"])
        lw, vw, rowh = 148, 178, 40
        plot = w - lw - vw
        h = len(stats) * rowh + 26
        o = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img">']
        for t in (0.2, 0.4, 0.6):
            x = lw + plot * t / 0.7
            o.append(f'<line x1="{x:.1f}" y1="4" x2="{x:.1f}" y2="{len(stats)*rowh+2}" class="grid"/>')
            o.append(f'<text x="{x:.1f}" y="{len(stats)*rowh+20}" class="tick" text-anchor="middle">{t:.0%}</text>')
        for i, r in enumerate(stats):
            y = i * rowh + 8
            bw = plot * r["st"] / 0.7
            o.append(f'<text x="{lw-10}" y="{y+13}" class="lab" text-anchor="end">{e(self.tag(r["tc"]))}</text>')
            o.append(f'<text x="{lw-10}" y="{y+27}" class="tick" text-anchor="end">{e("・".join(r["codes"]))}</text>')
            o.append(f'<rect x="{lw}" y="{y+2}" width="{max(bw,2):.1f}" height="19" rx="3" '
                     f'fill="{SLEEVE_COLOR.get(r["sleeve"], FALLBACK)}"/>')
            o.append(f'<text x="{lw+8}" y="{y+16}" style="font-size:11px;font-weight:700" fill="#fff">{e(r["sleeve"])}</text>')
            o.append(f'<text x="{lw+bw+8:.1f}" y="{y+16}" class="val" font-weight="700">{r["st"]:.1%}'
                     f'<tspan class="dim" font-weight="400"> ／{r["n"]} 款・銷冠 {r["ch"]}</tspan></text>')
        return "\n".join(o) + "</svg>"

    def timeline(self, w: int = 760) -> str:
        """入庫日區間。同袖型的季別畫成深色，一眼看出哪兩季在架上重疊。"""
        rows = [s for s in self.seasons if s["d0"] and s["d1"]]
        if not rows:
            return ""
        p = dt.date.fromisoformat
        lo = min(p(s["d0"]) for s in rows)
        hi = max(p(s["d1"]) for s in rows)
        span = max((hi - lo).days, 1)
        lw, rw, rowh, top = 176, 40, 27, 34
        plot = w - lw - rw
        h = len(rows) * rowh + top + 14
        x = lambda d: lw + plot * (p(d) - lo).days / span
        o = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img">']
        for yr in range(lo.year, hi.year + 1):
            for mo in (1, 7):
                d = dt.date(yr, mo, 1)
                if not (lo <= d <= hi):
                    continue
                xx = lw + plot * (d - lo).days / span
                o.append(f'<line x1="{xx:.1f}" y1="{top-12}" x2="{xx:.1f}" y2="{len(rows)*rowh+top-4}" class="grid"/>')
                o.append(f'<text x="{xx:.1f}" y="{top-18}" class="tick" text-anchor="middle">{yr}/{mo:02d}</text>')
        for i, s in enumerate(rows):
            y = i * rowh + top
            x0, x1 = x(s["d0"]), x(s["d1"])
            o.append(f'<text x="{lw-10}" y="{y+13}" class="lab" text-anchor="end" font-size="11.5">'
                     f'{e(s["kc"])} {s["y"]}{e(self.tag(s["tc"]))}</text>')
            o.append(f'<rect x="{x0:.1f}" y="{y+2}" width="{max(x1-x0,3):.1f}" height="14" rx="3" '
                     f'fill="{self.color(s["tc"])}" opacity="{0.95 if s["sleeve"]=="短袖" else 0.4}"/>')
            o.append(f'<text x="{min(x1+6, w-rw):.1f}" y="{y+13}" class="val" font-size="10">{s["st"]:.0%}</text>')
        return "\n".join(o) + "</svg>"

    def month_lines(self, w: int = 720, h: int = 250) -> str:
        rows = self.d["month_year"]
        if not rows:
            return ""
        months = sorted({r["m"] for r in rows})
        top = max(max(r["st"] for r in rows) * 1.15, 0.5)
        pl, pr_, pt, pb = 44, 60, 14, 40
        pw, ph = w - pl - pr_, h - pt - pb
        o = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img">']
        for t in (0, .2, .4, .6, .8):
            if t > top:
                continue
            y = pt + ph - ph * t / top
            o.append(f'<line x1="{pl}" y1="{y:.1f}" x2="{w-pr_}" y2="{y:.1f}" class="grid"/>')
            o.append(f'<text x="{pl-8}" y="{y+4:.1f}" class="tick" text-anchor="end">{t:.0%}</text>')
        st = pw / max(len(months) - 1, 1)
        for i, m in enumerate(months):
            o.append(f'<text x="{pl+i*st:.1f}" y="{h-16}" class="tick" text-anchor="middle">{m}月</text>')
        for yr in self.years:
            pts = [(pl + months.index(r["m"]) * st, pt + ph - ph * r["st"] / top)
                   for r in sorted(rows, key=lambda r: r["m"]) if r["y"] == yr]
            if len(pts) < 2:
                continue
            o.append('<polyline points="' + " ".join(f"{a:.1f},{b:.1f}" for a, b in pts) +
                     f'" fill="none" stroke="{self.yc[yr]}" stroke-width="2.2" stroke-linejoin="round"/>')
            for a, b in pts:
                o.append(f'<circle cx="{a:.1f}" cy="{b:.1f}" r="3.6" fill="{self.yc[yr]}" '
                         f'stroke="var(--surface)" stroke-width="1.4"/>')
            o.append(f'<text x="{pts[-1][0]+8:.1f}" y="{pts[-1][1]+4:.1f}" class="val" '
                     f'fill="{self.yc[yr]}" font-weight="600">{yr}</text>')
        return "\n".join(o) + "</svg>"

    def champ_bars(self, w: int = 700) -> str:
        lw, vw, rowh = 172, 150, 26
        plot = w - lw - vw
        mx = max((s["champ_n"] for s in self.seasons), default=0) + 1
        h = len(self.seasons) * rowh + 26
        o = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img">']
        for t in range(0, mx + 1, 2):
            x = lw + plot * t / mx
            o.append(f'<line x1="{x:.1f}" y1="4" x2="{x:.1f}" y2="{len(self.seasons)*rowh+2}" class="grid"/>')
            o.append(f'<text x="{x:.1f}" y="{len(self.seasons)*rowh+20}" class="tick" text-anchor="middle">{t}</text>')
        worst = min(self.d["season_stats"], key=lambda r: r["st"])["tc"] if self.d["season_stats"] else None
        for i, s in enumerate(self.seasons):
            y = i * rowh + 6
            bw = plot * s["champ_n"] / mx
            c = CRIT if s["tc"] == worst else self.color(s["tc"])
            o.append(f'<text x="{lw-10}" y="{y+14}" class="lab" text-anchor="end" font-size="11.5">'
                     f'{e(s["kc"])} {s["y"]}{e(self.tag(s["tc"]))}</text>')
            o.append(f'<rect x="{lw}" y="{y+2}" width="{max(bw,2):.1f}" height="14" rx="3" fill="{c}"/>')
            note = "" if s["done"] else "　尚在銷售期"
            o.append(f'<text x="{lw+bw+7:.1f}" y="{y+14}" class="val">{s["champ_n"]} 款'
                     f'<tspan class="dim">／全季 {s["n"]}　完銷 {s["st"]:.0%}{note}</tspan></text>')
        return "\n".join(o) + "</svg>"


def render(data: dict[str, Any], images_root: Path | None = None) -> str:
    """把資料集畫成一份完整的 HTML 報告。"""
    R = SeasonReport(data, images_root)
    M, seasons, terms = R.meta, R.seasons, R.terms
    stats = {r["tc"]: r for r in data["season_stats"]}
    sleeve = {r["sleeve"]: r for r in data["sleeve_stats"]}
    ranked = sorted(data["season_stats"], key=lambda r: -r["st"])
    ongoing = [s for s in seasons if not s["done"]]

    key_row = "".join(
        f'<span><i style="background:{R.color(tc)}"></i><b>{e(tc)}</b>　{e(terms[tc]["name"])}　{e(terms[tc]["sleeve"])}</span>'
        for tc in R.order)

    scope_rows = "".join(
        f'<tr><td><b>{e(s["kc"])}</b></td><td>{s["y"]}{e(R.term_name(s["tc"]))}</td>'
        f'<td class="n">{e(s["tc"])}</td><td>{e(s["sleeve"])}</td><td class="n">{s["n"]}</td>'
        f'<td>{e(s["d0"])} ～ {e(s["d1"])}</td><td class="n">{_pct(s["st"])}</td>'
        f'<td class="n">{s["hi"]}</td><td class="n">{s["in"]:,}</td><td class="n">{s["left"]:,}</td>'
        f'<td>{"已完結" if s["done"] else "<b style=color:var(--crit)>尚在銷售期</b>"}</td>'
        f'<td class="src">{e(s["f"])}</td></tr>' for s in seasons)

    sleeve_rows = "".join(
        f'<tr><td><b>{e(r["sleeve"])}</b></td>'
        f'<td>{e("、".join(f"{n}（{tc}）" for tc in R.order for n in [terms[tc]["name"]] if terms[tc]["sleeve"]==r["sleeve"]))}</td>'
        f'<td class="n">{r["n"]}</td><td class="n">{r["in"]:,}</td><td class="n">{r["left"]:,}</td>'
        f'<td class="n"><b>{_pct(r["st"])}</b></td><td class="n">{r["ch"]}</td></tr>'
        for r in data["sleeve_stats"])

    overlap_rows = "".join(
        f'<tr><td>{o["y"]}</td><td>{e(o["sleeve"])}</td>'
        f'<td>{e(o["a"])}　{e(o["a_term"])}</td><td>{e(o["a_d0"])} ～ {e(o["a_d1"])}</td>'
        f'<td>{e(o["b"])}　{e(o["b_term"])}</td><td>{e(o["b_d0"])} ～ {e(o["b_d1"])}</td>'
        f'<td class="n"><b>{o["days"]}</b> 天</td><td>{e(o["lo"])} ～ {e(o["hi"])}</td>'
        f'<td class="n">{_pct(o["a_st"], 0)}</td><td class="n">{_pct(o["b_st"], 0)}</td></tr>'
        for o in data["overlaps"])

    cats = sorted({r["cat"] for r in data["cat_year"]},
                  key=lambda c: -next((r["st"] for r in data["cat_year"]
                                       if r["cat"] == c and r["y"] == R.years[0]), 0))
    first, last = (R.years[0], R.years[-1]) if R.years else (None, None)

    def _cy(c, y):
        return next((r for r in data["cat_year"] if r["cat"] == c and r["y"] == y), None)

    cat_year_rows = ""
    for c in cats:
        cells = "".join(
            (f'<td class="n">{_pct(r["st"])}<span class="dim"> n={r["n"]}</span></td>'
             if (r := _cy(c, y)) else '<td class="n dim">—</td>') for y in R.years)
        a, b = _cy(c, first), _cy(c, last)
        delta = (f'<td class="n" style="color:{CRIT if b["st"]<a["st"] else "var(--ink3)"}">'
                 f'{(b["st"]-a["st"])*100:+.0f}pt</td>' if a and b else '<td class="n dim">—</td>')
        cat_year_rows += f'<tr><td>{e(c)}</td>{cells}{delta}</tr>'

    champ_sections = "".join(
        f'<h3>{e(s["kc"])}　{s["y"]}{e(R.tag(s["tc"]))}　'
        f'<span class="hn">入庫 {e(s["d0"])}～{e(s["d1"])}　全季 {s["n"]} 款　平均完銷 {_pct(s["st"])}'
        f'{"" if s["done"] else "　·　尚在銷售期"}</span></h3>'
        + R.cards(data["champs"].get(s["kc"], []), rank=True) for s in seasons)

    top_sections = "".join(
        f'<h3>{y} 年售出件數前 {len(data["top_year"][str(y)])}</h3>'
        f'<p class="sub">涵蓋季別：'
        + "、".join(f'{s["kc"]}（{s["y"]}{R.tag(s["tc"])}）' for s in seasons if s["y"] == y)
        + ("　·　本年度尚在銷售期，數字仍會變動"
           if any(s["y"] == y and not s["done"] for s in seasons) else "")
        + "</p>" + R.cards(data["top_year"][str(y)], rank=True)
        for y in R.years if str(y) in data["top_year"])

    audit_rows = "".join(f'<tr><td>{e(k)}</td><td class="n">{v:,}</td></tr>'
                         for k, v in M["audit"].items())

    img_note = ("" if images_root else
                '<div class="imgnote"><b>商品縮圖需在放有系統圖的電腦上產生。</b>'
                '每張卡片下方已標明圖檔路徑，可直接開檔對照；執行 '
                '<code>python -m chainway.cli season-report --images</code> 即可把縮圖嵌入。</div>')

    ongoing_note = ("" if not ongoing else
        f'<div class="caution"><b>{"／".join(s["kc"] for s in ongoing)} 尚在銷售期</b>'
        f'<p style="margin-top:5px">報表匯出日為 {e(M["snapshot"])}，這些季別的商品仍在架上，'
        f'完銷率會繼續上升。<b>凡涉及跨年比較，本報告一律另外標示，不與已完結季別混算。</b></p></div>')

    # 袖長是否解釋得了名次：若排序後顏色分成上下兩段就是能，交錯就是不能
    sleeve_seq = [r["sleeve"] for r in ranked]
    sleeve_explains = sleeve_seq == sorted(sleeve_seq, key=lambda s: -sleeve[s]["st"])
    best_sleeve = max(data["sleeve_stats"], key=lambda r: r["st"])
    worst_sleeve = min(data["sleeve_stats"], key=lambda r: r["st"])
    gap_between = (best_sleeve["st"] - worst_sleeve["st"]) * 100
    same_sleeve_gaps = []
    for sl, grp in ((r["sleeve"], [x for x in ranked if x["sleeve"] == r["sleeve"]])
                    for r in data["sleeve_stats"]):
        if len(grp) >= 2:
            same_sleeve_gaps.append((sl, grp[0], grp[-1], (grp[0]["st"] - grp[-1]["st"]) * 100))
    widest = max(same_sleeve_gaps, key=lambda t: t[3]) if same_sleeve_gaps else None

    sleeve_verdict = (
        f'<div class="finding{"" if sleeve_explains else " alert"}"><b>'
        f'{"袖長與名次一致" if sleeve_explains else "袖長解釋不了排名"}</b>'
        f'<p>四季依加權完銷排序為 <b>'
        + " ＞ ".join(f'{R.tag(r["tc"])} {r["st"]:.1%}' for r in ranked) + '</b>。</p>'
        + ("" if not widest else
           f'<p>同為{widest[0]}的{R.term_name(widest[1]["tc"])}與{R.term_name(widest[2]["tc"])}相差 '
           f'<b>{widest[3]:.1f} 個百分點</b>，'
           f'而「{best_sleeve["sleeve"]}整體 vs {worst_sleeve["sleeve"]}整體」只差 '
           f'<b>{gap_between:.1f} 個百分點</b>。'
           + (f'同一種袖長內部的差距比袖長之間的差距還大，'
              f'表示<b>問題出在季別本身，不在袖型</b>。'
              if widest[3] > gap_between else
              f'袖長之間的差距較大，袖型仍是值得追的變因。') + '</p>')
        + '</div>')

    # 重疊的解讀完全取決於資料長什麼樣，所以這段文字由數字決定，不寫死。
    # 兩種袖型的重疊天數若差很多，「同袖型互相分食」才是值得追的線索；
    # 若兩邊都重疊或都不重疊，這條線索就沒有解釋力。
    by_sleeve: dict[str, list[int]] = {}
    for o in data["overlaps"]:
        by_sleeve.setdefault(o["sleeve"], []).append(o["days"])
    avg = {k: sum(v) / len(v) for k, v in by_sleeve.items() if v}
    if len(avg) >= 2:
        hi_sl = max(avg, key=lambda k: avg[k])
        lo_sl = min(avg, key=lambda k: avg[k])
        contrast = avg[hi_sl] - avg[lo_sl]
        hi_detail = "、".join(
            f"{o['y']} 年 {o['days']} 天" for o in data["overlaps"] if o["sleeve"] == hi_sl)
        always = "總是" if avg[lo_sl] == 0 else "大幅"
        lo_detail = ("完全不重疊（0 天）" if avg[lo_sl] == 0
                     else f"平均只重疊 {avg[lo_sl]:.0f} 天")
        worst_sleeve_name = ranked[-1]["sleeve"]
        aligned = hi_sl == worst_sleeve_name and contrast > 15
        overlap_finding = (
            f'<div class="finding{" alert" if aligned else ""}">'
            f'<b>{e(hi_sl)}季平均重疊 {avg[hi_sl]:.0f} 天，{e(lo_sl)}季只有 {avg[lo_sl]:.0f} 天</b>'
            f'<p>{e(hi_sl)}的兩個季別在架上{always}重疊：{hi_detail}；'
            f'而{e(lo_sl)}的兩季{lo_detail}。</p>'
            + (f'<p style="margin-top:6px">墊底的 <b>{e(R.tag(ranked[-1]["tc"]))}</b> 正好屬於'
               f'重疊較嚴重的{e(hi_sl)}季。這是一個<b>具體、可檢驗</b>的假設：'
               f'後季被同袖型的前季分食，且前季此時多已進入折扣期。</p>'
               if aligned else
               '<p style="margin-top:6px">重疊程度與完銷表現的高低沒有對上，'
               '這條線索目前解釋不了季別之間的差距。</p>')
            + f'<p style="margin-top:6px"><b>但季彙總資料證實不了它。</b>'
              f'重疊天數逐年的變化與完銷率的變化並不同步，若重疊是主因，'
              f'重疊縮短時完銷應同步改善。要驗證需要<b>門市層級的日銷資料</b>，'
              f'看兩者的銷售曲線是否互相排擠。本報告只提出重疊天數這個事實，不宣稱因果。</p></div>')
    else:
        overlap_finding = ('<div class="finding"><b>同袖型季別的上架重疊</b>'
                           '<p>資料中同袖型的季別不足兩個，無法比較重疊程度。</p></div>')

    css = """
:root{--surface:#f7f7f4;--panel:#fffffe;--ink:#1c1a17;--ink2:#57544d;--ink3:#8b8780;
 --line:#e0ddd5;--line2:#efece5;--navy:#1f3a5f;--crit:#d03b3b}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
 --surface:#171714;--panel:#1f1e1b;--ink:#f2f0ea;--ink2:#b6b2a8;--ink3:#847f75;
 --line:#33312b;--line2:#26251f;--navy:#8fb3dd;--crit:#e66767}}
:root[data-theme="dark"]{--surface:#171714;--panel:#1f1e1b;--ink:#f2f0ea;--ink2:#b6b2a8;
 --ink3:#847f75;--line:#33312b;--line2:#26251f;--navy:#8fb3dd;--crit:#e66767}
*{box-sizing:border-box}
body{margin:0;background:var(--surface);color:var(--ink);
 font-family:"Noto Sans TC","Microsoft JhengHei UI","Microsoft JhengHei","PingFang TC",-apple-system,"Segoe UI",system-ui,sans-serif;
 font-size:15px;line-height:1.75;-webkit-font-smoothing:antialiased}
.wrap{max-width:900px;margin:0 auto;padding:52px 24px 110px}
h1{font-family:"Noto Serif TC",serif;font-weight:700;font-size:28px;line-height:1.4;
 margin:0 0 10px;text-wrap:balance}
h2{font-family:"Noto Serif TC",serif;font-weight:700;font-size:20px;margin:54px 0 4px;text-wrap:balance}
h3{font-size:14px;font-weight:700;margin:30px 0 4px}
h3 .hn{font-weight:400;color:var(--ink3);font-size:12px;margin-left:6px}
.eyebrow{font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink3);margin:0 0 6px}
.sub{color:var(--ink2);font-size:13px;margin:0 0 4px}
.lede{color:var(--ink2);font-size:14.5px;margin:0 0 24px}
p{margin:12px 0}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(124px,1fr));gap:10px;margin:22px 0}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:13px 15px}
.kpi .n{font-family:"Noto Serif TC",serif;font-size:23px;font-weight:700;
 font-variant-numeric:tabular-nums;line-height:1.15}
.kpi .l{font-size:11.5px;color:var(--ink3);margin-top:3px}
.finding{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--navy);
 border-radius:0 10px 10px 0;padding:15px 20px;margin:20px 0}
.finding.alert{border-left-color:var(--crit)}
.finding b{display:block;font-family:"Noto Serif TC",serif;font-size:16px;margin-bottom:5px}
.finding p{margin:5px 0 0;font-size:14px;color:var(--ink2)}
.finding p b{display:inline;font-family:inherit;font-size:inherit;color:var(--ink)}
.caution{background:color-mix(in srgb,var(--crit) 8%,var(--panel));
 border:1px solid color-mix(in srgb,var(--crit) 26%,var(--line));border-radius:10px;
 padding:16px 20px;margin:20px 0;font-size:14px}
.caution b{color:var(--crit)}
.imgnote{background:var(--panel);border:1px dashed var(--line);border-radius:9px;
 padding:12px 16px;margin:16px 0;font-size:13px;color:var(--ink2)}
.season-key{background:var(--panel);border:1px solid var(--line);border-radius:10px;
 padding:14px 18px;margin:22px 0;font-size:13px}
.season-key>b{font-family:"Noto Serif TC",serif;font-size:14.5px}
.season-key .keys{display:flex;flex-wrap:wrap;gap:8px 22px;margin-top:9px;
 font-variant-numeric:tabular-nums;font-size:13.5px}
.season-key .keys i{width:11px;height:11px;border-radius:3px;display:inline-block;
 margin-right:7px;vertical-align:-1px}
.season-key .keys b{font-family:"Noto Serif TC",serif;font-size:15px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(152px,1fr));gap:11px;margin:12px 0 4px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:9px;
 overflow:hidden;margin:0;position:relative}
.card img{width:100%;height:166px;object-fit:contain;background:#fff;display:block;
 border-bottom:1px solid var(--line2)}
.rank{position:absolute;top:7px;left:7px;z-index:2;background:var(--ink);color:var(--surface);
 width:21px;height:21px;border-radius:50%;display:flex;align-items:center;justify-content:center;
 font-size:11.5px;font-weight:700;font-variant-numeric:tabular-nums}
.noimg{height:80px;display:flex;flex-direction:column;align-items:center;justify-content:center;
 gap:2px;background:var(--line2);color:var(--ink3);font-size:11.5px;
 font-variant-numeric:tabular-nums;border-bottom:1px solid var(--line)}
.noimg span{font-size:10px;letter-spacing:.12em}
.card figcaption{padding:9px 10px 10px}
.card .sku{font-size:11px;color:var(--ink3);font-variant-numeric:tabular-nums;
 display:flex;justify-content:space-between}
.card .kc{background:var(--line2);padding:0 4px;border-radius:3px}
.card .nm{font-size:12.5px;font-weight:500;line-height:1.45;margin:2px 0 3px}
.card .meta{font-size:10.5px;color:var(--ink3)}
.card .price{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;margin:4px 0 5px}
.track{height:5px;background:var(--line2);border-radius:3px;overflow:hidden;margin-bottom:5px}
.track span{display:block;height:100%;border-radius:3px}
.card .nums{font-size:11px;color:var(--ink2);font-variant-numeric:tabular-nums}
.card .nums b{color:var(--ink)}
.card .st{font-size:12.5px;font-weight:700;font-variant-numeric:tabular-nums;margin-top:2px}
.card .path{font-size:9.5px;color:var(--ink3);margin-top:5px;word-break:break-all;line-height:1.4}
.chart{width:100%;height:auto;display:block;margin:12px 0 4px;overflow:visible}
.chart .grid{stroke:var(--line2);stroke-width:1}
.chart .tick{font-size:10.5px;fill:var(--ink3)}
.chart .lab{font-size:12.5px;fill:var(--ink)}
.chart .val{font-size:11px;fill:var(--ink);font-variant-numeric:tabular-nums}
.chart .dim{fill:var(--ink3)}
.legend{display:flex;gap:15px;flex-wrap:wrap;font-size:12px;color:var(--ink2);margin:6px 0 2px}
.legend i{width:11px;height:11px;border-radius:3px;display:inline-block;margin-right:5px;vertical-align:-1px}
.tw{overflow-x:auto;border:1px solid var(--line);border-radius:9px;background:var(--panel);margin:14px 0}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th,td{padding:8px 11px;border-bottom:1px solid var(--line2);text-align:left;white-space:nowrap}
th{font-size:11px;color:var(--ink3);font-weight:500}
td.n{text-align:right;font-variant-numeric:tabular-nums}
td.src{font-size:11px;color:var(--ink3)}
.dim{color:var(--ink3);font-size:11px}
tr:last-child td{border-bottom:none}
.method{font-size:12.5px;color:var(--ink3);border-top:1px solid var(--line);
 margin-top:48px;padding-top:20px}
.method b{color:var(--ink2)}
code{background:var(--line2);padding:1px 5px;border-radius:4px;font-size:12px;word-break:break-all}
"""

    return f"""<title>季別完銷診斷</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@500;700&family=Noto+Sans+TC:wght@400;500;700&display=swap">
<style>{css}</style>
<div class="wrap">
<p class="eyebrow">Kinloch Anderson · 進銷存季別診斷</p>
<h1>{len(seasons)} 個季別逐季拆解<br>{e(R.tag(ranked[-1]["tc"]))} 是三年來的最低點</h1>
<p class="lede">
本報告不併年計算。服裝業每年的流行與線條不同，把 {R.years[0]}–{R.years[-1]} 合併平均會蓋掉真實差異，
因此所有指標一律拆到「季號 × 年 × 季別」，並標明每一批資料的入庫日區間與來源檔名，
以利回查原始報表。<b>所有季別一律以「年＋季名（季號・季別碼・袖長）」標示。</b>
</p>

<div class="season-key">
<b>季別代碼對照</b>（貨號第 5 碼；由貴司提供）
<div class="keys">{key_row}</div>
<p style="margin:8px 0 0;font-size:12.5px">例：<code>KA1355012</code> →
<code>KA</code>＋<code>135</code>（{seasons[0]["y"] if seasons else ""} 年之季號）＋<code>5</code>（經典格紋線）＋<code>012</code>。
本報告每一張表、每一張圖、每一張商品卡都帶著這組代碼，可直接回推到原始報表。</p>
</div>

<div class="kpis">
<div class="kpi"><div class="n">{M['raw']:,}</div><div class="l">原始商品紀錄</div></div>
<div class="kpi"><div class="n">{M['analysed']:,}</div><div class="l">納入分析款數</div></div>
<div class="kpi"><div class="n">{len(seasons)}</div><div class="l">季別（{seasons[0]['kc']}–{seasons[-1]['kc']}）</div></div>
<div class="kpi"><div class="n">{e(M['snapshot'])}</div><div class="l">報表匯出日</div></div>
</div>
{img_note}

<h2>一、資料範圍：每個季別的區間與來源</h2>
<p class="sub">回查任何一個數字時，先看這張表確認它取自哪一批資料。</p>
<div class="tw"><table>
<tr><th>季號</th><th>年季</th><th class="n">季碼</th><th>袖長</th><th class="n">款數</th>
<th>入庫日區間</th><th class="n">平均完銷</th><th class="n">完銷≥80%</th>
<th class="n">投入件數</th><th class="n">剩餘件數</th><th>狀態</th><th>來源檔</th></tr>
{scope_rows}
</table></div>
{ongoing_note}

<h2>二、年對年：同一季別的逐年變化</h2>
<p class="sub">同季別比較才有意義 —— 拿秋季比早春不能說明任何事。</p>
{R.yoy_bars()}
<div class="legend">{"".join(f'<span><i style="background:{R.yc[y]}"></i>{y}</span>' for y in R.years)}</div>

<h2>三、季別對季別：四季的相對位置</h2>
{R.term_bars()}
<div class="legend">{"".join(f'<span><i style="background:{R.color(tc)}"></i>{R.tag(tc)}</span>' for tc in R.order)}</div>

<h2>四、袖長對照：長袖季 vs 短袖季</h2>
<p class="sub">依貴司季別碼，{"、".join(f"{tc} {terms[tc]['name']}為{terms[tc]['sleeve']}" for tc in R.order)}。
這一節要回答的是：<b>墊底那一季賣不動，是不是因為袖型？</b></p>
{R.sleeve_rank()}
<div class="legend">{"".join(f'<span><i style="background:{SLEEVE_COLOR.get(r["sleeve"], FALLBACK)}"></i>{r["sleeve"]}季（{"、".join(r["terms"])}）</span>' for r in data["sleeve_stats"])}
<span style="color:var(--ink3)">·　加權完銷 ＝ 1 −（該季總剩餘 ÷ 總投入）</span></div>
<div class="tw"><table>
<tr><th>袖長</th><th>季別</th><th class="n">款數</th><th class="n">投入件數</th>
<th class="n">剩餘件數</th><th class="n">加權完銷</th><th class="n">銷冠款數</th></tr>
{sleeve_rows}
</table></div>
{sleeve_verdict}

<h2>五、上架時間軸：哪兩季在架上重疊</h2>
<p class="sub">橫軸為實際入庫日。深色為短袖季，淺色為長袖季。右端數字為該季平均完銷。</p>
{R.timeline()}
<div class="tw"><table>
<tr><th>年度</th><th>袖長</th><th>前一季</th><th>入庫區間</th><th>後一季</th><th>入庫區間</th>
<th class="n">重疊天數</th><th>重疊期間</th><th class="n">前季完銷</th><th class="n">後季完銷</th></tr>
{overlap_rows}
</table></div>
{overlap_finding}

<h2>六、月份對月份：入庫月份的影響</h2>
<p class="sub">橫軸為入庫月份，每年一條線。僅列出該月款數 ≥{MIN_N} 的資料點。</p>
{R.month_lines()}
<div class="legend">{"".join(f'<span><i style="background:{R.yc[y]}"></i>{y} 年入庫</span>' for y in R.years)}</div>
<div class="finding"><b>月份效應與季別效應在此重疊</b>
<p>每一季的鋪貨月份是固定的（見第一節的入庫區間），所以「某月入庫的款表現差」和
「某季的商品表現差」在這份資料裡是同一件事的兩種說法，<b>無法分離</b>。
要分離，需要一批在同一個月上架、但屬於不同季別的商品作為對照。</p></div>

<h2>七、品類的逐年趨勢</h2>
<p class="sub">併年會蓋掉趨勢。拆開後可看出哪些品類是持續變化，哪些只是單年波動。</p>
<div class="tw"><table>
<tr><th>品類</th>{"".join(f'<th class="n">{y}</th>' for y in R.years)}
<th class="n">{first}→{last}</th></tr>
{cat_year_rows}
</table></div>

<h2>八、各季別銷冠：完銷≥{M['champion_rule']['sell_through']:.0%} 且投入≥{M['champion_rule']['min_qty']} 件</h2>
<p class="sub">同時要求「賣得完」與「有量」。只有完銷率高但投入 30 件的款，不足以支撐下量決策。</p>
{R.champ_bars()}
{champ_sections}

<h2>九、各年度售出件數前 {M.get('top_n', 15)} 名</h2>
<p class="sub">依實際售出件數排序（非完銷率），代表對營收貢獻最大的款。</p>
{top_sections}

<h2>十、資料的邊界</h2>
<div class="caution"><b>這份報告做不到的事</b>
<p style="margin-top:5px"><b>1. 季別效應 vs 月份效應無法分離</b>　同一季的商品鋪貨月份固定，兩個變因完全重疊。</p>
<p><b>2. 同袖型季別是否互相排擠，尚未定案</b>　第五節只算出重疊天數，證實需要門市日銷資料。</p>
<p><b>3. 沒有圖文對證</b>　本報告全部建立在進銷存數字上。
布料、版型、圖案位置等設計變因，要跑 <code>embed</code> 讓 Fashion-CLIP 判系統圖之後才能納入。</p>
{"" if not ongoing else f'<p><b>4. {"／".join(s["kc"] for s in ongoing)} 尚未結束</b>　這些季別的完銷率會繼續上升，相關數字都應視為期中值。</p>'}
</div>

<div class="method">
<p><b>資料來源</b>　{len(M['files'])} 份進銷存報表：{"、".join(f"<code>{e(f)}</code>" for f in M['files'])}。</p>
<div class="tw" style="max-width:360px"><table>
<tr><th>排除步驟</th><th class="n">筆數</th></tr>{audit_rows}</table></div>
<p><b>指標定義</b>　平均完銷率＝各款完銷率的算術平均（回答「典型的一款賣得如何」）；
加權完銷率＝1 −（總剩餘÷總投入）（回答「這一季的貨賣掉幾成」）。
兩者在第四節的季別彙總用加權版，其餘用平均版，每張表都已標明。
品類由貨號品類碼判定；季別由貨號前 5 碼的 KA 季號對照表判定。</p>
<p><b>季別與袖長對照</b>　季碼取自貨號第 5 碼，對照關係為貴司提供：
{"、".join(f"<b>{tc}＝{terms[tc]['name']}（{terms[tc]['sleeve']}）</b>" for tc in R.order)}。
袖長屬「季別層級」屬性，非逐款判定 —— 本報告未宣稱單一款式的實際袖長，
第四節的長短袖比較是以整季為單位。若某季內含例外款式，
會落在該季的統計中而未另外扣除，這是此節的已知限制。</p>
<p><b>所有數字皆由原始報表計算，未經調整或推估。</b>圖表座標由程式計算而非手繪。
n 值一律標示；n &lt; 12 的組別請視為參考而非結論。
每張表與每張卡片均標明季號，可依第一節的對照表回查來源檔案。</p>
<p><b>相關不等於因果。</b>本報告呈現的是觀察到的差異，不是差異的成因。
報告產生日：{e(M.get('generated', ''))}。</p>
</div>
</div>"""
