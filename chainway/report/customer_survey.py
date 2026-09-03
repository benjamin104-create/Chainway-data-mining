"""客戶意見調查：行銷流程設計 + 表單預覽 + 題目稿。

## 這份檔案為什麼不是「一個可以填的表單」

專櫃表單是單檔 HTML，填完按「匯出 CSV」—— 那招在專櫃行得通，因為
填的人是自己人，用的是店裡的電腦或自己的手機瀏覽器，而且只有幾十個人。

客人這一端行不通，原因有三個，每一個都足以讓資料默默流失：

    LINE 內建瀏覽器擋下載      按了匯出，什麼事都不會發生，也不會報錯
    客人不會回傳檔案          就算存下來了，也沒有人會把 CSV 寄回公司
    一天可能幾百份            用檔案收，第一週就會亂掉

所以**收件這一段必須交給真的做得到的工具**（LINE 官方帳號內建問卷，
或 Google 表單）。那些工具處理儲存、LINE 瀏覽器的怪癖、抽獎名單，
這些都不是這個專案該重寫的東西。

這裡負責的是它們做不到的三件事：

    1. 題目本身 —— 問什麼、選項怎麼寫、哪一題該追問
    2. 預覽 —— 讓您在發出去之前看到客人會看到的樣子並改字
    3. 接回來 —— 匯出的 CSV 怎麼對到貨號，怎麼和專櫃表單放在一起看

做一個看起來能填、其實收不到的表單，比誠實地說「這段要接別的工具」
糟糕得多 —— 前者會讓人以為資料在累積，等到要分析時才發現一筆都沒有。
"""
from __future__ import annotations

import html
import json
from pathlib import Path
from typing import Any

# 只有選了「不太好」「應該不會」「有試穿沒買」才展開後續題目。
# 一次把二十題攤在手機上，看到的人會直接關掉；而中途離開的人不是
# 隨機的 —— 通常是趕時間或不滿意那群，剛好是最需要聽見的。
CONDITIONAL = {"tried": "T_YES", "service": "不太好", "return": "R_NO"}


def e(s: Any) -> str:
    return html.escape(str(s))


def load(path: str | Path = "config/customer_survey.yaml") -> dict[str, Any]:
    import yaml

    return yaml.safe_load(Path(path).read_text(encoding="utf-8"))


def _opts(items: list[dict[str, str]], name: str, kind: str = "radio") -> str:
    """選項一律做成整塊可點的區域，不是只有那個小圓點。

    手機上點得到才填得完 —— 44px 是 Apple 與 Google 的無障礙下限，
    低於這個數字，手指粗一點的人要點兩三次。
    """
    return "".join(
        f'<label class="opt"><input type="{kind}" name="{e(name)}" '
        f'value="{e(o["code"])}"><span>{e(o["zh"])}</span></label>'
        for o in items)


def _question_bank(cfg: dict[str, Any]) -> str:
    """貼進 LINE 問卷／Google 表單用的純文字題目稿。

    附上代碼是為了讓匯出的 CSV 對得回來。工具那邊多半只存中文選項字串，
    所以代碼寫在括號裡一起貼 —— 匯入時用中文對代碼，改過字也還原得回去。
    """
    lines: list[str] = []
    t, lf, sv, ri = (cfg["tried_not_bought"], cfg["looking_for"],
                     cfg["service"], cfg["return_intent"])

    lines.append(f"【1】{t['question']}（單選）")
    lines.append("  ○ 沒有 (T_NO)")
    lines.append("  ○ 有 (T_YES)　→ 選「有」才顯示第 2、3 題")
    lines.append("")
    lines.append(f"【2】{t['ask_which']}（簡答，選「有」才問）")
    lines.append("")
    lines.append("【3】沒買的原因是？（可複選，選「有」才問）")
    lines += [f"  □ {o['zh']} ({o['code']})" for o in t["reasons"]]
    lines.append("")
    lines.append(f"【4】{lf['question']}（單選）")
    lines += [f"  ○ {o['zh']} ({o['code']})" for o in lf["options"]]
    lines.append("")
    lines.append(f"【5】{lf['free_text']}（簡答，非必填）")
    lines.append("")
    lines.append(f"【6】{sv['question']}（每一項單選：{'／'.join(sv['scale'])}）")
    lines += [f"  ・{a['zh']} ({a['code']})" for a in sv["aspects"]]
    lines.append("")
    lines.append(f"【7】{sv['followup_if_bad']}（簡答，"
                 f"任一項選「不太好」才問）")
    lines.append("")
    lines.append(f"【8】{ri['question']}（單選）")
    lines += [f"  ○ {o['zh']} ({o['code']})" for o in ri["options"]]
    lines.append("")
    lines.append(f"【9】{ri['followup_if_no']}（簡答，選「應該不會」才問）")
    lines.append("")
    aw = cfg["after_wear"]
    lines.append(f"—— 以下是第 {aw['delay_days']} 天另外推的第二份，只有一題 ——")
    lines.append(f"【10】{aw['question']}（可複選）")
    lines += [f"  □ {o['zh']} ({o['code']})" for o in aw["options"]]
    return "\n".join(lines)


def build(cfg: dict[str, Any]) -> str:
    m, lot = cfg["meta"], cfg["lottery"]
    t, lf, sv, ri, aw = (cfg["tried_not_bought"], cfg["looking_for"],
                         cfg["service"], cfg["return_intent"], cfg["after_wear"])

    svc_rows = "".join(
        f'<tr><td>{e(a["zh"])}</td>' + "".join(
            f'<td><label class="cell"><input type="radio" '
            f'name="sv_{e(a["code"])}" value="{e(s)}"><span>{e(s)}</span>'
            f'</label></td>' for s in sv["scale"]) + "</tr>"
        for a in sv["aspects"])

    bank = _question_bank(cfg)

    return f"""<title>客戶意見調查　流程與表單</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Noto+Sans+TC:wght@400;500;600;700&family=Noto+Serif+TC:wght@700&display=swap">
<style>
:root{{--paper:#F2EEE6;--panel:#FBF9F4;--ink:#232019;--ink2:#5E574A;--ink3:#8C8474;
 --rule:#DCD4C4;--rule2:#EDE7DA;--wine:#7A2E38;--pos:#1F6F9C;--neg:#A0322D}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{
 --paper:#191712;--panel:#221F19;--ink:#F0EBDF;--ink2:#B3AB99;--ink3:#847C6B;
 --rule:#38332A;--rule2:#2B271F;--wine:#C08A93;--pos:#57A0CD;--neg:#D98078}}}}
:root[data-theme="dark"]{{--paper:#191712;--panel:#221F19;--ink:#F0EBDF;
 --ink2:#B3AB99;--ink3:#847C6B;--rule:#38332A;--rule2:#2B271F;
 --wine:#C08A93;--pos:#57A0CD;--neg:#D98078}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--paper);color:var(--ink);font-size:15px;line-height:1.78;
 font-family:"Noto Sans TC","Microsoft JhengHei UI","Microsoft JhengHei","PingFang TC",-apple-system,"Segoe UI",sans-serif}}
.page{{max-width:1120px;margin:0 auto;padding:52px 20px 110px}}
h1{{font-family:"Noto Serif TC","Source Han Serif TC",Georgia,serif;font-size:32px;
 margin:0 0 8px;line-height:1.3}}
.dek{{color:var(--ink2);max-width:62ch;margin:0 0 6px;font-size:16px}}
.stamp{{font-family:"IBM Plex Mono",monospace;font-size:11.5px;color:var(--ink3);
 margin:0 0 34px}}
h2{{font-family:"Noto Serif TC","Source Han Serif TC",Georgia,serif;font-size:23px;
 margin:52px 0 6px;padding-top:18px;border-top:1px solid var(--rule)}}
h3{{font-size:15.5px;margin:28px 0 6px}}
p{{max-width:70ch}}
.sub{{font-size:13.5px;color:var(--ink2);margin:0 0 18px;max-width:70ch}}
.flow{{list-style:none;padding:0;margin:18px 0;counter-reset:s}}
.flow li{{position:relative;padding:14px 18px 14px 58px;background:var(--panel);
 border:1px solid var(--rule);border-radius:6px;margin-bottom:9px;max-width:78ch}}
.flow li::before{{counter-increment:s;content:counter(s);position:absolute;left:17px;
 top:14px;width:26px;height:26px;border-radius:50%;background:var(--wine);color:#fff;
 display:flex;align-items:center;justify-content:center;font-size:13px;
 font-family:"IBM Plex Mono",monospace}}
.flow b{{display:block;font-size:14.5px}}
.flow span{{color:var(--ink2);font-size:13.5px}}
.flow em{{display:block;color:var(--wine);font-style:normal;font-size:12.5px;
 margin-top:5px}}
.key{{border-left:3px solid var(--wine);background:var(--panel);padding:17px 21px;
 margin:22px 0;border-radius:0 5px 5px 0;max-width:78ch}}
.key p{{margin:0 0 10px;color:var(--ink2);font-size:14px}} .key p:last-child{{margin:0}}
.key b{{color:var(--ink)}}
.caveat{{border:1px dashed var(--rule);padding:15px 19px;margin:20px 0;
 border-radius:5px;max-width:78ch;font-size:13.5px;color:var(--ink2)}}
.caveat b{{color:var(--wine)}}
.scroll{{overflow-x:auto;margin:14px 0}}
table{{border-collapse:collapse;background:var(--panel);border:1px solid var(--rule);
 border-radius:5px;font-size:14px;width:100%}}
th,td{{padding:9px 13px;border-bottom:1px solid var(--rule2);text-align:left}}
th{{font-size:11.5px;color:var(--ink3);font-weight:500;
 font-family:"IBM Plex Mono",monospace}}
tr:last-child td{{border-bottom:none}}

/* ---- 手機表單預覽 ---- */
.phone{{max-width:390px;border:1px solid var(--rule);border-radius:22px;
 background:var(--panel);padding:20px 18px 26px;margin:18px 0;
 box-shadow:0 2px 16px rgba(0,0,0,.06)}}
.phone h4{{margin:0 0 4px;font-size:19px;
 font-family:"Noto Serif TC",Georgia,serif}}
.phone .lot{{background:rgba(122,46,56,.09);border-radius:6px;padding:10px 12px;
 font-size:12.5px;color:var(--ink2);margin:12px 0 18px}}
.q{{margin:0 0 20px}}
.q>p{{margin:0 0 8px;font-size:15px;font-weight:600}}
.opt{{display:flex;align-items:center;gap:10px;min-height:44px;padding:0 12px;
 border:1px solid var(--rule);border-radius:8px;margin-bottom:7px;cursor:pointer;
 font-size:14px;background:var(--paper)}}
.opt:has(input:checked){{border-color:var(--wine);
 background:rgba(122,46,56,.07)}}
.opt input{{width:19px;height:19px;accent-color:var(--wine);flex:none}}
.cell{{display:flex;align-items:center;gap:6px;min-height:44px;font-size:13px;
 cursor:pointer;white-space:nowrap}}
.cell input{{width:18px;height:18px;accent-color:var(--wine)}}
.phone table{{width:100%;font-size:13px;background:transparent;border:none}}
.phone td{{padding:2px 4px;border-bottom:1px solid var(--rule2)}}
.phone td:first-child{{font-size:13.5px}}
textarea,input[type=text]{{width:100%;min-height:44px;border:1px solid var(--rule);
 border-radius:8px;padding:10px 12px;font-family:inherit;font-size:14px;
 background:var(--paper);color:var(--ink)}}
.hint{{font-size:12px;color:var(--ink3);margin:2px 0 0}}
.send{{width:100%;min-height:50px;border:none;border-radius:9px;background:var(--wine);
 color:#fff;font-size:16px;font-family:inherit;cursor:pointer;margin-top:6px}}
.cond{{border-left:2px solid var(--rule);padding-left:13px;margin-top:12px}}
pre{{background:var(--panel);border:1px solid var(--rule);border-radius:6px;
 padding:16px 18px;overflow-x:auto;font-family:"IBM Plex Mono",monospace;
 font-size:12.5px;line-height:1.72;color:var(--ink2);white-space:pre-wrap}}
code{{font-family:"IBM Plex Mono",monospace;font-size:12.5px;
 background:var(--rule2);padding:1px 5px;border-radius:3px}}
</style>
<div class="page">

<h1>客戶意見調查</h1>
<p class="dek">上傳發票 → 回填表單 → 抽禮金。這一頁是流程設計、表單長相，
以及貼進 LINE 或 Google 表單的題目稿。</p>
<p class="stamp">題目版本以 config/customer_survey.yaml 為準
目標填寫時間 {m['target_seconds']} 秒</p>

<h2>一、先講一件會讓整件事白做的細節</h2>
<div class="key">
<p><b>抽獎資格要綁「上傳發票」，不能綁「填得好不好」。</b>
獎勵一旦和滿意度沾上邊，買到的就是讚美 —— 而讚美沒有資訊，
還會讓整份資料變成廢的，卻從外表看不出來哪裡壞掉。</p>
<p>所以表單最上面那一句要直接寫出來：
「{e(lot['qualify'])}」。這句話不是客套，它是這份資料能不能用的前提。</p>
<p><b>一張發票一次</b>。不設限的話，一個人可以填十份，
樣本就變成他個人的意見。</p>
</div>

<h2>二、建議的流程</h2>
<p class="sub">和您原本的想法差在兩個地方：時間點提前，以及三週後多一次。</p>
<ol class="flow">
<li><b>客人在官方帳號上傳發票照片（或載具條碼）</b>
<span>這一步是整件事的關鍵，不是為了驗證身分，是為了讓意見接得回貨號。</span></li>
<li><b>系統自動回一個連結，發票號碼、門市、日期已經帶好</b>
<span>客人不用重打。每多一個要打的欄位就少一批人填完，
而發票號碼有 10 位，用手機打完還要核對。</span>
<em>如果 LINE 那端讀不出發票內容，就只問發票號碼 —— 門市和日期公司查得到。</em></li>
<li><b>當下就填，不要等兩週</b>
<span>「為什麼把那件放回去」這種事，隔兩週想不起來了。
專櫃表單等兩週是對的（要看銷售反應），客人這端相反，越即時越準。</span></li>
<li><b>送出後立刻顯示抽獎序號</b>
<span>「我們之後會抽」跟「您的序號是 A0473」給人的感覺完全不同。
不確定的獎勵會讓人下次懶得填。</span></li>
<li><b>第 {aw['delay_days']} 天，再推一次，只有一題</b>
<span>縮水、起毛球、退色，當天問不出來。這一題對應到品質標籤，
是「賣得好但退貨吃掉毛利」那種款唯一的早期警訊。</span>
<em>這是我加的，您原本的流程裡沒有 —— 也是整份調查裡最貴的一題。</em></li>
</ol>

<h2>三、題目怎麼設計的</h2>
<div class="key">
<p><b>只問發生過的事，不問希望。</b>
「您希望我們多做什麼」得到的答案，客人自己也不會照著買 ——
人預測不了自己下一季的購物行為。但客人記得很清楚，二十分鐘前
為什麼把那件外套放回架上。</p>
<p><b>最值錢的一題是「試穿了但沒買」。</b>
POS 只記錄賣掉的。試穿了卻放回去的那一件，公司完全看不到，
而它離成交只差一步 —— 它比任何一件賣出去的衣服更能告訴您差在哪裡。
如果整份問卷只能留一題，留這題。</p>
<p><b>商品和服務要分開問、分開報。</b>
壓在一起，一件好衣服會因為那天店員很忙而被記成滯銷，
然後設計部門改了不該改的東西。</p>
</div>

<h2>四、客人會看到的樣子</h2>
<p class="sub">下面是可以點的，請直接試填一次。字寫得對不對、會不會太長，
點過一次最清楚。要改字就改 <code>config/customer_survey.yaml</code>。</p>

<div class="phone">
<h4>{e(m['title'])}</h4>
<p class="hint">大約 {m['target_seconds']} 秒　{e(m['reward'])}</p>
<div class="lot">{e(lot['qualify'])}<br>{e(lot['unit'])}</div>

<div class="q"><p>{e(t['question'])}</p>
<label class="opt"><input type="radio" name="tried" value="T_NO"><span>沒有</span></label>
<label class="opt"><input type="radio" name="tried" value="T_YES" id="triedYes"><span>有</span></label>
<div class="cond" id="triedMore" hidden>
  <p style="font-size:14px;margin:10px 0 6px">{e(t['ask_which'])}</p>
  <input type="text" placeholder="例：那件深藍色格紋外套">
  <p style="font-size:14px;margin:14px 0 6px">沒買的原因？（可複選）</p>
  {_opts(t['reasons'], 'why', 'checkbox')}
</div></div>

<div class="q"><p>{e(lf['question'])}</p>
{_opts(lf['options'], 'look')}
<p class="hint" style="margin-top:8px">{e(lf['free_text'])}</p>
<input type="text" placeholder="非必填"></div>

<div class="q"><p>{e(sv['question'])}</p>
<table>{svc_rows}</table>
<div class="cond" id="svcMore" hidden>
  <p style="font-size:14px;margin:12px 0 6px">{e(sv['followup_if_bad'])}</p>
  <textarea rows="3"></textarea>
</div></div>

<div class="q"><p>{e(ri['question'])}</p>
{_opts(ri['options'], 'ret')}
<div class="cond" id="retMore" hidden>
  <p style="font-size:14px;margin:12px 0 6px">{e(ri['followup_if_no'])}</p>
  <textarea rows="2"></textarea>
</div></div>

<button class="send" type="button" onclick="alert('這是預覽，不會真的送出。\\n實際收件請用 LINE 官方帳號問卷或 Google 表單 —— 見下一段。')">送出，參加抽獎</button>
</div>

<script>
// 條件顯示：沒發生的事就不要問。一次攤開二十題，看到的人會直接關掉，
// 而關掉的人不是隨機的 —— 通常是趕時間或不滿意那群，剛好最該聽見。
(function () {{
  const show = (el, on) => {{ if (el) el.hidden = !on; }};
  document.querySelectorAll('input[name=tried]').forEach(r =>
    r.addEventListener('change', () =>
      show(document.getElementById('triedMore'),
           document.getElementById('triedYes').checked)));
  document.querySelectorAll('input[name^=sv_]').forEach(r =>
    r.addEventListener('change', () =>
      show(document.getElementById('svcMore'),
           !![...document.querySelectorAll('input[name^=sv_]:checked')]
             .find(x => x.value === '不太好'))));
  document.querySelectorAll('input[name=ret]').forEach(r =>
    r.addEventListener('change', () =>
      show(document.getElementById('retMore'), r.checked && r.value === 'R_NO')));
}})();
</script>

<h2>五、收件要用別的工具，這件事必須講清楚</h2>
<div class="caveat">
<p><b>上面那張表單收不到回覆，它只是預覽。</b>
專櫃表單能用「匯出 CSV」是因為填的人是自己人、只有幾十份。
客人這端三件事都不成立：<b>LINE 內建瀏覽器擋下載</b>（按了完全沒反應，
也不會報錯）、客人不會把檔案寄回公司、一天幾百份用檔案收第一週就會亂。</p>
<p>所以收件請用 <b>LINE 官方帳號內建的問卷</b>（同一個帳號裡，客人不用跳出去，
完成率最高），或 <b>Google 表單</b>（題型彈性大、匯出乾淨）。
儲存、抽獎名單、LINE 瀏覽器的怪癖都由它們處理 —— 那些不值得這個專案重寫。</p>
<p>做一個看起來能填、其實收不到的表單，比誠實地說「這段要接別的工具」
糟得多：前者會讓人以為資料正在累積，等到要分析的時候才發現一筆都沒有。</p>
</div>

<h3>題目稿（直接複製貼上）</h3>
<p class="sub">括號裡的代碼請一起貼。工具匯出的 CSV 多半只存中文選項，
代碼留著才對得回來 —— 之後有人改了措辭也還原得回去。</p>
<pre>{e(bank)}</pre>

<h2>六、要不要串進系統的標準流程？要，但是是<b>另一個迴圈</b></h2>
<p class="sub">把它塞進專櫃表單那個迴圈會兩邊都壞掉：頻率不同、填的人不同、
問的東西也不同。</p>
<div class="scroll"><table>
<tr><th></th><th>專櫃回填表單</th><th>客戶意見調查</th></tr>
<tr><td>誰填</td><td>店員</td><td>客人</td></tr>
<tr><td>多久一次</td><td>每週的新品，上市兩週後</td><td>每一筆交易，隨時</td></tr>
<tr><td>問什麼</td><td>看到的反應 + 自己的判斷</td><td>自己做了什麼、為什麼沒買</td></tr>
<tr><td>接點</td><td colspan="2">貨號。兩邊都對到同一款，才放得到一起</td></tr>
<tr><td>怎麼收</td><td>單檔 HTML，匯出 CSV</td><td>LINE／Google 表單，匯出 CSV</td></tr>
</table></div>

<div class="key">
<p><b>兩份表放在一起看，才會出現任何一份自己給不出的答案。</b>
您上次指出客戶意見和專櫃意見要分兩欄，是同一個道理，只是這次跨到店外：</p>
<p>・客人一直說「沒有我的尺寸」＋ 店員說「賣得好」
　→ <b>斷碼</b>。售罄率漂亮是因為賣完了，不是因為備夠了。</p>
<p>・店員說「幾乎沒人注意到」＋ 客人說「想找這類但沒找到」
　→ <b>陳列</b>。東西在店裡，只是沒被看見。這款先別判死刑。</p>
<p>・客人說「試穿了不合」很多 ＋ 售罄率還不錯
　→ <b>打版</b>。買的人買了，但流失的人您本來完全看不到。</p>
</div>

<h3>接進來的步驟</h3>
<ol class="flow">
<li><b>從 LINE／Google 表單匯出 CSV</b>
<span>每月一次就夠。回應是連續進來的，但分析用不到那個即時性。</span></li>
<li><b>放進 <code>data/feedback/</code>，跑 <code>customer-survey --import 檔名</code></b>
<span>欄位名稱會自動對應（工具那邊的欄名多半是整句題目），
對不上的欄位會列出來讓您看，不會默默丟掉。</span></li>
<li><b>它會和專櫃表單、售罄率一起出現在報表總覽</b>
<span>接點是貨號。對不到貨號的回應照樣收，另外列 ——
「客人想找但沒找到」那一題本來就沒有貨號，而那題正是它最有價值的地方。</span></li>
</ol>

<h2>七、這份調查看不到什麼</h2>
<div class="caveat">
<p><b>填的人不是隨機的。</b>會上傳發票填問卷的，是本來就對品牌有好感、
而且加了官方帳號的那群。不喜歡的人不會填，走進來沒買就離開的人更不會 ——
而後者可能才是最該問的。所以這份資料能回答「買的人為什麼買、為什麼有一件沒買」，
<b>不能</b>回答「市場怎麼看我們」。</p>
<p><b>不要拿它算滿意度的絕對值。</b>樣本偏正向，算出來一定好看。
它的用法是<b>比較</b>：這一款的「試穿沒買」比例比其他款高多少、
這一櫃的服務分數和其他櫃差多少 —— 偏誤在兩邊都一樣，相減就抵掉了。</p>
<p><b>樣本要夠才看得出東西。</b>單一款的回應通常個位數，那個數字別拿去做決定。
先看得出來的會是品類層級和門市層級。</p>
</div>

</div>"""
