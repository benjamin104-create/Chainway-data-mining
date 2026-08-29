"""關聯性分析報告：一份 HTML（給人看）+ 一份 Excel（給人接著算）。

報告刻意把「證據強度」放在很顯眼的位置 —— 樣本數、q 值、資料涵蓋率。
分析報告最大的風險不是算錯，是讀的人把弱證據當成鐵律去改設計。
"""

from __future__ import annotations

import base64
import datetime as dt
import html
from pathlib import Path

import pandas as pd

from ..config import Config, get_config

CSS = """
:root{--ink:#1a1a1a;--muted:#6b6b6b;--line:#e2e2e2;--accent:#8c1d18;--ok:#1c6b3c;--warn:#9a6b00;--bg:#fbfaf8;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
 font:15px/1.7 -apple-system,"Segoe UI","Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;}
.wrap{max-width:1180px;margin:0 auto;padding:48px 28px 96px}
h1{font-size:30px;margin:0 0 6px;letter-spacing:.02em}
h2{font-size:21px;margin:52px 0 14px;padding-bottom:8px;border-bottom:2px solid var(--ink)}
h3{font-size:16px;margin:28px 0 10px;color:var(--accent)}
.sub{color:var(--muted);margin:0 0 32px;font-size:13px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin:22px 0}
.card{background:#fff;border:1px solid var(--line);border-radius:8px;padding:16px}
.card .n{font-size:26px;font-weight:600;letter-spacing:-.02em}
.card .l{font-size:12px;color:var(--muted);margin-top:4px}
table{width:100%;border-collapse:collapse;background:#fff;font-size:13.5px;margin:12px 0 4px}
th,td{padding:9px 11px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{background:#f2efea;font-weight:600;font-size:12.5px;white-space:nowrap}
tr:hover td{background:#faf8f5}
.scroll{overflow-x:auto;border:1px solid var(--line);border-radius:8px}
.pos{color:var(--ok);font-weight:600}.neg{color:var(--accent);font-weight:600}
.tag{display:inline-block;padding:2px 8px;border-radius:11px;font-size:11.5px;background:#eee;margin:1px 2px}
.tag.star{background:#e6f2ea;color:var(--ok)}.tag.slow{background:#f7e7e6;color:var(--accent)}
.note{background:#fff8e8;border-left:3px solid var(--warn);padding:12px 16px;margin:16px 0;font-size:13.5px}
.finding{background:#fff;border:1px solid var(--line);border-left:3px solid var(--accent);
 padding:12px 16px;margin:8px 0;border-radius:0 6px 6px 0}
.thumb{width:64px;height:64px;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:4px}
footer{margin-top:64px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}
@media(prefers-color-scheme:dark){
 :root{--ink:#ececec;--muted:#9a9a9a;--line:#333;--bg:#141414;--accent:#e0736b;--ok:#63c48d;--warn:#d8a838}
 .card,table,.finding{background:#1c1c1c}th{background:#252525}tr:hover td{background:#222}
 .note{background:#2a2213}.tag{background:#2a2a2a}.tag.star{background:#16301f}.tag.slow{background:#2f1b1a}}
"""


def _table(df: pd.DataFrame, max_rows: int = 60, thumb_col: str | None = None) -> str:
    if df is None or df.empty:
        return '<p class="sub">（無資料）</p>'
    d = df.head(max_rows)
    head = "".join(f"<th>{html.escape(str(c))}</th>" for c in d.columns)
    rows = []
    for _, r in d.iterrows():
        cells = []
        for c in d.columns:
            v = r[c]
            if thumb_col and c == thumb_col and isinstance(v, str) and Path(v).exists():
                cells.append(f'<td>{_img_tag(v)}</td>')
            elif isinstance(v, float):
                cells.append(f"<td>{v:,.3f}</td>" if pd.notna(v) else "<td>—</td>")
            else:
                cells.append(f"<td>{html.escape(str(v)) if pd.notna(v) else '—'}</td>")
        rows.append("<tr>" + "".join(cells) + "</tr>")
    more = f'<p class="sub">顯示前 {max_rows} 列，共 {len(df)} 列 —— 完整資料見同名 Excel。</p>' if len(df) > max_rows else ""
    return f'<div class="scroll"><table><thead><tr>{head}</tr></thead><tbody>{"".join(rows)}</tbody></table></div>{more}'


def _img_tag(path: str, size: int = 64) -> str:
    try:
        from PIL import Image
        import io
        img = Image.open(path).convert("RGB")
        img.thumbnail((size, size))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=72)
        b64 = base64.b64encode(buf.getvalue()).decode()
        return f'<img class="thumb" src="data:image/jpeg;base64,{b64}"/>'
    except Exception:
        return "—"


def _cards(stats: dict) -> str:
    items = [(str(v), k) for k, v in stats.items()]
    return '<div class="cards">' + "".join(
        f'<div class="card"><div class="n">{html.escape(n)}</div><div class="l">{html.escape(l)}</div></div>'
        for n, l in items) + "</div>"


def build_html(
    master: pd.DataFrame,
    perf_summary: pd.DataFrame,
    assoc: pd.DataFrame,
    findings: pd.DataFrame,
    numeric: pd.DataFrame,
    importance: pd.DataFrame,
    diag: pd.DataFrame,
    attribution: pd.DataFrame,
    sweet: pd.DataFrame,
    join_audit: pd.DataFrame,
    cfg: Config | None = None,
) -> str:
    cfg = cfg or get_config()
    now = dt.datetime.now().strftime("%Y-%m-%d %H:%M")

    n_sku = master["sku"].nunique()
    n_img = int(master["image_path"].notna().sum()) if "image_path" in master else 0
    n_tp = int(master["techpack_path"].notna().sum()) if "techpack_path" in master else 0
    n_fb = int(master["fb_n"].notna().sum()) if "fb_n" in master else 0
    stats = {
        "分析款數": f"{n_sku:,}",
        "有系統圖": f"{n_img / max(n_sku,1):.0%}",
        "有指示書尺寸": f"{n_tp / max(n_sku,1):.0%}",
        "有市場回饋": f"{n_fb / max(n_sku,1):.0%}",
        "顯著關聯數": f"{int(assoc['significant'].sum()) if not assoc.empty else 0}",
    }

    finding_html = "".join(
        f'<div class="finding">{html.escape(str(r["finding_zh"]))}'
        f'<br><span class="sub">Cramér\'s V={r["cramers_v"]:.3f}　q={r["q_value"]:.4f}　n={r["n"]}</span></div>'
        for _, r in findings.head(30).iterrows()
    ) if not findings.empty else '<p class="sub">（尚無達顯著水準的關聯 —— 通常是樣本不足或屬性標註信心偏低）</p>'

    attribution_html = _table(
        attribution[["reason_zh", "n_tagged", "attribute_zh", "option_zh",
                     "share_in_tagged", "share_overall", "concentration_lift", "insight_zh"]]
        if not attribution.empty else attribution, 40)

    fb_note = ""
    if n_fb == 0:
        fb_note = ('<div class="note"><b>市場回饋尚未填寫。</b>目前所有結論都只有量化面，'
                   '無法區分「真滯銷（設計問題）」與「假滯銷（缺貨／陳列問題）」。'
                   '請填寫 <code>data/feedback/sales_feedback.csv</code>，或用網頁後台的「回饋登錄」頁，'
                   '再重跑一次分析 —— 診斷章節會自動生效。</div>')

    return f"""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>服飾設計特徵 × 銷售關聯分析報告</title><style>{CSS}</style></head><body><div class="wrap">

<h1>服飾設計特徵 × 銷售關聯分析報告</h1>
<p class="sub">{html.escape(cfg.get('project', {}).get('name', ''))}　·　產出時間 {now}</p>
{_cards(stats)}
{fb_note}

<h2>一、資料涵蓋與串接品質</h2>
<p class="sub">先看這一節。任何一個環節命中率偏低，後面的結論就要打折扣。</p>
{_table(join_audit)}

<h2>二、各季別 × 品類 銷售概況</h2>
{_table(perf_summary)}

<h2>三、關鍵發現：什麼樣的設計特徵比較好賣</h2>
{finding_html}

<h3>3.1 完整關聯表</h3>
{_table(assoc[assoc['significant']] if not assoc.empty and 'significant' in assoc else assoc, 80)}

<h3>3.2 版型比例指標的相關性</h3>
<p class="sub">連續型指標（胸腰比、擺胸比…）與績效百分位的 Spearman 相關。</p>
{_table(numeric)}

<h3>3.3 多變量特徵重要度</h3>
<p class="sub">所有特徵一起放進模型時，誰真的解釋得了暢銷（可排除共線性造成的假關聯）。</p>
{_table(importance, 25)}

<h2>四、版型甜蜜區間</h2>
<p class="sub">標記為最佳的區間可直接當作打版目標值。</p>
{_table(sweet[sweet['is_sweet_spot']] if not sweet.empty and 'is_sweet_spot' in sweet else sweet, 50)}

<h2>五、★ 市場回饋交叉診斷</h2>
<p class="sub">把「資料算出來的績效」對上「業務／門市填寫的理由」，區分真滯銷與假滯銷。</p>
{_table(diag[['sku','category_zh','perf_band_zh','fb_verdict','fb_tags_zh','agreement','diagnosis','action_zh','priority']]
        if not diag.empty else diag, 60)}

<h3>5.1 抱怨理由 × 設計特徵 集中度</h3>
<p class="sub">把零散的門市抱怨，收斂成可以寫進設計規範的證據。</p>
{attribution_html}

<h2>六、如何使用這份報告</h2>
<div class="note">
<b>讀法建議：</b><br>
1. 先看第一節的資料涵蓋率。低於 60% 的欄位，其相關結論只能當參考。<br>
2. 第三節的結論一律附樣本數，<b>n &lt; 20 的請視為假設而非結論</b>。<br>
3. 第五節「衝突」與「假滯銷」的款最值得開會討論 —— 那是純數據看不出來的。<br>
4. 要把結論變成下一季企劃，執行：<code>python -m chainway.cli plan --week 1</code>
</div>

<footer>本報告由 Chainway 分析平台自動產生。統計方法：卡方檢定 + Cramér's V + BH-FDR 多重檢定校正；
特徵重要度為 permutation importance。所有關聯為觀察性資料的相關，非因果。</footer>
</div></body></html>"""


def save_report(html_str: str, tables: dict[str, pd.DataFrame], cfg: Config | None = None) -> tuple[Path, Path]:
    cfg = cfg or get_config()
    out_dir = cfg.path("outputs") / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d_%H%M")

    html_path = out_dir / f"關聯分析報告_{stamp}.html"
    html_path.write_text(html_str, encoding="utf-8")

    xlsx_path = out_dir / f"關聯分析明細_{stamp}.xlsx"
    with pd.ExcelWriter(xlsx_path, engine="openpyxl") as writer:
        for name, df in tables.items():
            if df is not None and not df.empty:
                df.head(100000).to_excel(writer, sheet_name=name[:31], index=False)
    return html_path, xlsx_path
