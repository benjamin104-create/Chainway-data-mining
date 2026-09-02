"""把以圖搜貨號的評測結果畫成看得見的對照表。

一個 Top-1 = 1.29% 的數字沒辦法告訴你要修哪裡。它可能是：

  · 查詢圖根本不是衣服照片（抽錯圖了）
  · 正解的貨號不在索引裡（沒有系統圖，怎麼找都找不到）
  · 圖對了、索引也有，但排名不對（這才是演算法問題）

三種原因的解法完全不同，而**看一眼就能分辨**。所以與其猜，不如把
「查詢圖 → 正解的系統圖 → 系統猜的前三名」並排印出來，讓人直接判斷。

這份報告不做結論，只把證據攤開。
"""
from __future__ import annotations

import base64
import html
import io
from pathlib import Path
from typing import Any

import pandas as pd

THUMB = (150, 200)


def e(s: Any) -> str:
    return html.escape(str(s))


def thumb(path: str | Path | None, box: tuple[int, int] = THUMB) -> str | None:
    if not path:
        return None
    p = Path(path)
    if not p.exists():
        return None
    try:
        from PIL import Image
        im = Image.open(p).convert("RGB")
        im.thumbnail(box)
        b = io.BytesIO()
        im.save(b, "JPEG", quality=78)
        return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()
    except Exception:
        return None


def _cell(src: str | None, caption: str, sub: str = "", tone: str = "") -> str:
    pic = (f'<img src="{src}">' if src
           else '<div class="noimg">找不到<br>圖檔</div>')
    return (f'<figure class="{tone}">{pic}'
            f'<figcaption><b>{e(caption)}</b>{f"<span>{e(sub)}</span>" if sub else ""}'
            f'</figcaption></figure>')


def build(detail: pd.DataFrame, sku_images: dict[str, Path], *,
          kinds: pd.DataFrame | None = None, limit: int = 60,
          summary: pd.DataFrame | None = None) -> str:
    """detail 需含 query_image / true_sku / hit_rank / predicted_top1…（evaluate 的輸出）。

    sku_images：貨號 → 系統圖路徑，用來顯示「正解長什麼樣」。
    """
    total = len(detail)
    miss = detail[detail["hit_rank"].isna()]
    hit = detail[detail["hit_rank"].notna()]

    # 正解是否在索引裡 —— 不在的話，任何演算法都找不到，
    # 這一項要先分離出來，否則會把「資料缺漏」誤判成「模型不準」。
    detail = detail.copy()
    detail["答案有系統圖"] = detail["true_sku"].map(lambda s: s in sku_images)
    no_gallery = int((~detail["答案有系統圖"]).sum())

    pred_cols = [c for c in detail.columns if c.startswith("predicted_top")]

    rows = []
    # 先列沒命中的（最值得看），再列命中的當對照
    show = pd.concat([miss.head(int(limit * 0.7)), hit.head(limit - int(limit * 0.7))])
    for _, r in show.iterrows():
        q = _cell(thumb(r["query_image"]), "查詢圖",
                  Path(str(r["query_image"])).parent.name, "q")
        truth_p = sku_images.get(r["true_sku"])
        t = _cell(thumb(truth_p), f'正解 {r["true_sku"]}',
                  "（索引裡沒有這件的系統圖）" if truth_p is None else "", "t")
        preds = ""
        for i, c in enumerate(pred_cols[:3], start=1):
            sku = r.get(c)
            if not isinstance(sku, str):
                continue
            ok = sku == r["true_sku"]
            preds += _cell(thumb(sku_images.get(sku)), f"#{i} {sku}",
                           "✓ 正解" if ok else "", "ok" if ok else "p")
        rank = r["hit_rank"]
        badge = ("<span class='bad'>沒進前十</span>" if pd.isna(rank)
                 else f"<span class='good'>第 {int(rank)} 名命中</span>")
        rows.append(f'<div class="row"><div class="hd">{badge}</div>'
                    f'<div class="cells">{q}<div class="arrow">→</div>{t}'
                    f'<div class="arrow">vs</div>{preds}</div></div>')

    kind_block = ""
    if kinds is not None and not kinds.empty:
        kind_block = ('<h2>查詢圖的來源分類</h2>'
                      '<p class="sub">這些分類是程式用圖片尺寸與顏色數猜的，不保證正確。'
                      '若「打樣照片」裡混進了布樣或表格截圖，評測分數就沒有意義。</p>'
                      '<div class="tw"><table><tr><th>分類</th><th class="n">張數</th></tr>'
                      + "".join(f'<tr><td>{e(k)}</td><td class="n">{v:,}</td></tr>'
                                for k, v in kinds.items()) + '</table></div>')

    summary_block = ""
    if summary is not None and not summary.empty:
        summary_block = ('<div class="tw"><table><tr><th>指標</th><th class="n">值</th></tr>'
                         + "".join(f'<tr><td>{e(i)}</td><td class="n">{v:,.4g}</td></tr>'
                                   for i, v in summary.iloc[:, 0].items()) + '</table></div>')

    return f"""<title>以圖搜貨號 診斷</title>
<style>
:root{{--bg:#f7f7f4;--panel:#fff;--ink:#1c1a17;--ink2:#57544d;--ink3:#8b8780;
 --line:#e0ddd5;--good:#1baf7a;--bad:#d03b3b}}
@media (prefers-color-scheme:dark){{:root:not([data-theme=light]){{
 --bg:#171714;--panel:#1f1e1b;--ink:#f2f0ea;--ink2:#b6b2a8;--ink3:#847f75;
 --line:#33312b;--good:#199e70;--bad:#e66767}}}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--ink);font-size:15px;line-height:1.7;
 font-family:"Noto Sans TC","Microsoft JhengHei UI","Microsoft JhengHei","PingFang TC",-apple-system,"Segoe UI",system-ui,sans-serif}}
.wrap{{max-width:1100px;margin:0 auto;padding:44px 22px 90px}}
h1{{font-size:26px;margin:0 0 8px}} h2{{font-size:19px;margin:44px 0 6px}}
.sub{{color:var(--ink2);font-size:13.5px;margin:0 0 10px}}
.kpis{{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:20px 0}}
.kpi{{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:13px 15px}}
.kpi .n{{font-size:23px;font-weight:700;font-variant-numeric:tabular-nums}}
.kpi .l{{font-size:11.5px;color:var(--ink3)}}
.alert{{background:color-mix(in srgb,var(--bad) 8%,var(--panel));
 border:1px solid color-mix(in srgb,var(--bad) 28%,var(--line));
 border-radius:10px;padding:15px 19px;margin:18px 0;font-size:14px}}
.alert b{{color:var(--bad)}}
.row{{background:var(--panel);border:1px solid var(--line);border-radius:10px;
 padding:12px 14px;margin:12px 0}}
.hd{{font-size:12px;margin-bottom:8px}}
.good{{color:var(--good);font-weight:700}} .bad{{color:var(--bad);font-weight:700}}
.cells{{display:flex;gap:10px;align-items:flex-start;overflow-x:auto}}
figure{{margin:0;flex:0 0 auto;width:126px}}
figure img{{width:126px;height:168px;object-fit:contain;background:#fff;
 border:1px solid var(--line);border-radius:6px;display:block}}
.noimg{{width:126px;height:168px;display:flex;align-items:center;justify-content:center;
 text-align:center;background:var(--line);color:var(--ink3);font-size:11px;border-radius:6px}}
figcaption{{font-size:10.5px;margin-top:4px;line-height:1.4;font-variant-numeric:tabular-nums}}
figcaption b{{display:block}} figcaption span{{color:var(--ink3)}}
figure.q figcaption b{{color:var(--ink)}}
figure.t img{{border-color:var(--good);border-width:2px}}
figure.ok img{{border-color:var(--good);border-width:2px}}
.arrow{{align-self:center;color:var(--ink3);font-size:15px;flex:0 0 auto}}
.tw{{overflow-x:auto;border:1px solid var(--line);border-radius:9px;background:var(--panel);margin:12px 0;max-width:420px}}
table{{width:100%;border-collapse:collapse;font-size:13px}}
th,td{{padding:7px 11px;border-bottom:1px solid var(--line);text-align:left}}
th{{font-size:11px;color:var(--ink3);font-weight:500}}
td.n{{text-align:right;font-variant-numeric:tabular-nums}}
tr:last-child td{{border-bottom:none}}
</style>
<div class="wrap">
<h1>以圖搜貨號 · 失敗案例逐張檢視</h1>
<p class="sub">左起：查詢圖 → 正解應有的系統圖 → 系統猜的前三名。
這份報告不下結論，只把證據攤開讓人判斷。</p>

<div class="kpis">
<div class="kpi"><div class="n">{total:,}</div><div class="l">測試張數</div></div>
<div class="kpi"><div class="n">{len(hit):,}</div><div class="l">前十名內命中</div></div>
<div class="kpi"><div class="n">{len(miss):,}</div><div class="l">完全沒找到</div></div>
<div class="kpi"><div class="n">{no_gallery:,}</div><div class="l">正解沒有系統圖</div></div>
</div>

{f'''<div class="alert"><b>{no_gallery:,} 張的正解貨號在索引裡沒有系統圖。</b>
這些不論用什麼演算法都不可能找到 —— 屬於資料缺漏，不是檢索能力問題。
計算真實準確率時應該把它們排除，否則會低估。</div>''' if no_gallery else ''}

{summary_block}
{kind_block}

<h2>逐張檢視（沒命中的排前面）</h2>
<p class="sub">請先看「查詢圖」那一欄：如果它不是一張衣服的照片
（而是布樣特寫、表格截圖、logo），那這一列的失敗與檢索無關，是抽圖抽錯了。</p>
{''.join(rows)}
</div>"""
