/* Chainway 前端：無框架、無建置流程，公司任何一台電腦開瀏覽器就能用。 */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
let META = null;

/* ---------------------------------------------------------------- 工具 */
async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.detail || data.hint || `HTTP ${res.status}`);
  return data;
}
function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = v => (v === null || v === undefined || isNaN(v)) ? '—' : (v * 100).toFixed(0) + '%';
const num = v => (v === null || v === undefined || v === '') ? '—'
  : (typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString() : v.toFixed(3)) : esc(v));

function table(rows, cols, wrapCols = []) {
  if (!rows || !rows.length) return '<p class="hint" style="padding:16px">（無資料）</p>';
  const head = cols.map(c => `<th>${esc(c.label)}</th>`).join('');
  const body = rows.map(r => '<tr>' + cols.map(c => {
    let v = r[c.key];
    if (c.fmt === 'pct') v = pct(v);
    else if (c.fmt === 'lift') v = v == null ? '—'
      : `<span class="${v >= 1 ? 'pos' : 'neg'}">${(v).toFixed(2)}×</span>`;
    else v = num(v);
    const cls = wrapCols.includes(c.key) ? 'wrap' : (c.fmt ? 'num' : '');
    return `<td class="${cls}">${v}</td>`;
  }).join('') + '</tr>').join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
const imgUrl = p => p ? `/api/image?path=${encodeURIComponent(p)}` : '';

/* ---------------------------------------------------------------- 導覽 */
$$('#nav button').forEach(b => b.onclick = () => {
  $$('#nav button').forEach(x => x.classList.remove('active'));
  $$('.view').forEach(v => v.classList.remove('active'));
  b.classList.add('active');
  $('#view-' + b.dataset.view).classList.add('active');
  LOADERS[b.dataset.view]?.();
});

/* ---------------------------------------------------------------- 啟動 */
(async function init() {
  try {
    const h = await api('/api/health');
    $('#status').textContent = h.has_master
      ? `${h.project}　資料就緒`
      : `${h.project}　⚠ 尚未建立主表（請先跑 ingest → embed → build）`;
    META = await api('/api/meta');
    fillSelects();
    buildTagChips();
    buildFlatAttrs();
    LOADERS.dashboard();
  } catch (e) {
    $('#status').textContent = '無法連線 API';
    toast('API 連線失敗：' + e.message);
  }
})();

function fillSelects() {
  const cats = META.categories.map(c => `<option value="${c.code}">${esc(c.zh)}</option>`).join('');
  ['#assocCat', '#patCat'].forEach(s => $(s).insertAdjacentHTML('beforeend', cats));
  $('[name=category]', $('#fbForm')).insertAdjacentHTML('beforeend', cats);
  $('[name=verdict]').innerHTML = META.verdicts.map(v =>
    `<option value="${v.code}">${esc(v.zh)}${v.note ? '（' + esc(v.note) + '）' : ''}</option>`).join('');
  $('[name=source]').innerHTML = META.sources.map(s =>
    `<option value="${s.code}">${esc(s.zh)}</option>`).join('');
  $('[name=suggested_action]').insertAdjacentHTML('beforeend',
    META.actions.map(a => `<option value="${a.code}">${esc(a.zh)}</option>`).join(''));
  $('[name=survey_date]').value = new Date().toISOString().slice(0, 10);
}

/* ---------------------------------------------------------------- 儀表板 */
const LOADERS = {};
LOADERS.dashboard = async () => {
  try {
    const d = await api('/api/dashboard');
    $('#kpis').innerHTML = Object.entries(d.kpi).map(([l, n]) =>
      `<div class="kpi"><div class="n">${esc(n)}</div><div class="l">${esc(l)}</div></div>`).join('');
    $('#bands').innerHTML = Object.entries(d.bands).map(([k, v]) => {
      const cls = k.includes('暢銷') ? 'star' : k.includes('滯銷') ? 'slow' : '';
      return `<div class="band ${cls}">${esc(k)}<b>${v}</b></div>`;
    }).join('');
    $('#summaryTable').innerHTML = table(d.summary, [
      { key: 'season', label: '季別' }, { key: 'category_zh', label: '品類' },
      { key: 'n_styles', label: '款數', fmt: 'n' }, { key: 'stock_in', label: '進貨', fmt: 'n' },
      { key: 'net_sales_qty', label: '淨銷量', fmt: 'n' }, { key: 'sales_amount', label: '銷售額', fmt: 'n' },
      { key: 'sell_through', label: '售罄率中位', fmt: 'pct' },
      { key: 'discount_depth', label: '折扣深度', fmt: 'pct' },
      { key: 'STAR', label: '暢銷', fmt: 'n' }, { key: 'SLOW', label: '滯銷', fmt: 'n' },
    ]);
  } catch (e) { $('#kpis').innerHTML = `<div class="notice">${esc(e.message)}</div>`; }
};

/* ---------------------------------------------------------------- 關聯分析 */
LOADERS.association = async () => {
  const cat = $('#assocCat').value, sig = $('#assocSig').checked;
  try {
    const d = await api(`/api/analysis/association?category=${cat}&significant_only=${sig}`);
    $('#findings').innerHTML = d.findings.length ? d.findings.map(f =>
      `<div class="finding">${esc(f.finding_zh)}
        <div class="ev">Cramér's V=${num(f.cramers_v)}　q=${num(f.q_value)}　n=${f.n}</div></div>`).join('')
      : '<p class="hint">尚無達顯著水準的關聯 —— 通常是樣本不足或屬性標註信心偏低。</p>';
    $('#assocTable').innerHTML = table(d.rows, [
      { key: 'category_zh', label: '品類' }, { key: 'attribute_zh', label: '屬性' },
      { key: 'option_zh', label: '選項' }, { key: 'n', label: 'n', fmt: 'n' },
      { key: 'success_rate', label: '成功率', fmt: 'pct' }, { key: 'base_rate', label: '平均', fmt: 'pct' },
      { key: 'lift', label: '提升度', fmt: 'lift' }, { key: 'cramers_v', label: "V", fmt: 'n' },
      { key: 'q_value', label: 'q值', fmt: 'n' },
      { key: 'median_sell_through', label: '售罄中位', fmt: 'pct' },
    ]);
  } catch (e) { $('#findings').innerHTML = `<div class="notice">${esc(e.message)}</div>`; }
};
$('#assocCat').onchange = LOADERS.association;
$('#assocSig').onchange = LOADERS.association;

/* ------------------------------------------------------- ★ 穿搭照找貨號 */
/* 先特徵、後顏色。整條邏輯在 chainway/search/find.py，命令列共用同一支，
   所以網頁上看到的名次跟 cmd 裡跑出來的永遠一樣。                        */
let PHOTO = null;

function findCards(rows) {
  if (!rows.length) return '<p class="hint">沒有結果。</p>';
  return rows.map(r => `
    <div class="pcard${r['顏色對不上'] ? ' dim' : ''}">
      ${r['圖'] ? `<img src="${imgUrl(r['圖'])}" alt="">` : ''}
      <div class="sim">${r['名次']}</div>
      <div class="body">
        <div class="sku">${esc(r['貨號'])}</div>
        <div class="meta">
          ${r['品名'] ? esc(r['品名']) + '<br>' : ''}
          定價 ${num(r['定價'])}　售罄 ${pct(r['售罄'])}<br>
          ${r['命中'] ? '命中 ' + esc(r['命中']) + '<br>' : ''}
          ${r['內點'] ? '<b>相同特徵 ' + r['內點'] + ' 處</b>　' : ''}
          ${r['判定'] ? esc(r['判定']) + '<br>' : ''}
          ${r['比中來源'] ? '比中的是' + esc(r['比中來源']) + '　' : ''}
          ${r['參考圖數'] > 1 ? '（這款有 ' + r['參考圖數'] + ' 張參考圖）<br>' : ''}
          ${r['九宮格'] != null ? '顏色距離 ' + r['九宮格'] + '　' : ''}
          ${r['主色ΔE'] != null ? '主色ΔE ' + r['主色ΔE'] : ''}
          ${r['顏色對不上'] ? '<br><b>顏色對不上</b>（沒有刪掉，排在最後）' : ''}
        </div>
      </div>
    </div>`).join('');
}

/* 這一段是覆核，不是裝飾：把系統怎麼判的攤開來，看得到才信得過。 */
function findWhy(d) {
  const p = d['照片'] || {}, s1 = d['特徵'] || {};
  const bits = [];
  if (p['主體佔比'] != null)
    bits.push(`照片：主體佔全圖 ${pct(p['主體佔比'])}，皮膚佔主體 ${pct(p['皮膚佔主體'])}，
               不裁圖，在人身上試了 ${p['試了幾段']} 段。${esc(p['說明'] || '')}`);
  if (p['主色']) bits.push(`整張主色 ${esc(p['主色'])} ${esc(p['色名'] || '')}`);
  if (d['關鍵點命中'])
    bits.push(`前段候選裡有 ${d['關鍵點命中']} 款抓到幾何一致的關鍵點，已依此重排。`);
  if (s1['命中'])
    bits.push(`第一關特徵：${s1['母數']} 款裡 ${s1['命中']} 款品名命中，
               取前 ${s1['進第二關']} 進第二關${s1['同分放寬'] ? '（有同分，整群帶進去）' : ''}。`);
  if (s1['分數跨幅'] != null && s1['分數跨幅'] < 0.5 && s1['命中'])
    bits.push(`<b>這些詞分不出誰比較像</b>（分數只跨 ${s1['分數跨幅']}）——
               多打幾個罕見特徵詞會明顯變準。`);
  const SURE = {'高': '第 1 名有關鍵點證實，而且明顯領先第 2 名。',
                '中': '第 1 名有一些關鍵點證據，但沒有拉開距離 —— 前三名都看一下。',
                '低': '關鍵點沒有對上任何一款，這個排名完全由顏色決定。素面衣服本來就抓不到關鍵點，那時候只能靠顏色。'};
  if (d['把握度'])
    bits.push(`<b>把握度：${esc(d['把握度'])}</b>　${SURE[d['把握度']] || ''}`);
  (d['警告'] || []).forEach(w => bits.push('<b>' + esc(w) + '</b>'));
  if (!bits.length) return '';
  return `<div class="notice">${bits.join('<br>')}<br>
    <span class="hint">排序依據：${esc(d['排序依據'] || '')}。
    顏色距離＝把衣服切成 2×2 與 4×4 逐格比顏色，再加上每格的花色深淺差，越小越像。
    相同特徵＝兩張圖上幾何位置一致的關鍵點數（印花、字樣、鈕釦、口袋），越多越可能是同一件；
    素面衣服抓不到，那時就完全靠顏色。
    整條流程用自家系統圖出題量過，換一套沒看過的衣服驗：Top-1 83.8%、Top-5 92.5%。
    </span></div>`;
}

async function runFind() {
  const words = $('#searchText').value.trim();
  if (!PHOTO && !words) {
    $('#searchWhy').innerHTML = '<div class="notice">給一張照片，或打幾個看到的特徵詞。</div>';
    return;
  }
  $('#searchWhy').innerHTML = '';
  $('#searchResults').innerHTML =
    '<p class="hint">比對中…第一次會量系統圖的顏色，之後有快取就快了。</p>';
  const fd = new FormData();
  if (PHOTO) fd.append('file', PHOTO);
  fd.append('words', words);
  fd.append('season', $('#searchSeason').value.trim());
  fd.append('top_k', 15);
  try {
    const d = await api('/api/find', { method: 'POST', body: fd });
    $('#searchWhy').innerHTML = findWhy(d);
    $('#searchResults').innerHTML = findCards(d['候選'] || []);
  } catch (e) {
    $('#searchResults').innerHTML = `<div class="notice">${esc(e.message)}</div>`;
  }
}

function wireDrop(dropSel, fileSel, handler) {
  const dz = $(dropSel), fi = $(fileSel);
  dz.onclick = () => fi.click();
  fi.onchange = () => fi.files[0] && handler(fi.files[0]);
  ['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); dz.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); dz.classList.remove('over');
  }));
  dz.addEventListener('drop', e => e.dataTransfer.files[0] && handler(e.dataTransfer.files[0]));
}

wireDrop('#searchDrop', '#searchFile', file => {
  PHOTO = file;
  const p = $('#searchPreview');
  p.src = URL.createObjectURL(file); p.hidden = false;
  runFind();
});

$('#searchTextBtn').onclick = runFind;
$('#searchText').onkeydown = e => e.key === 'Enter' && runFind();

/* ---------------------------------------------------------------- ★ 回饋登錄 */
function buildTagChips() {
  $('#tagGroups').innerHTML = META.reason_groups.map(g => `
    <div class="taggroup">
      <h4>${esc(g.zh)}</h4>
      <div class="tagchips">
        ${g.tags.map(t => `<label class="tagchip">
          <input type="checkbox" value="${t.code}" title="${esc(t.code)}">${esc(t.zh)}</label>`).join('')}
      </div>
    </div>`).join('');
  $$('#tagGroups .tagchip input').forEach(i =>
    i.onchange = () => i.closest('.tagchip').classList.toggle('on', i.checked));
}

$('#fbForm').onsubmit = async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = Object.fromEntries(fd.entries());
  payload.reason_tags = $$('#tagGroups input:checked').map(i => i.value);
  if (!payload.reason_tags.length && !payload.reason_text.trim()) {
    return toast('請至少勾選一個理由標籤，或填寫文字說明');
  }
  try {
    const r = await api('/api/feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    toast('已儲存。' + r.note);
    e.target.reset();
    $$('#tagGroups .tagchip').forEach(c => c.classList.remove('on'));
    $('[name=survey_date]').value = new Date().toISOString().slice(0, 10);
    LOADERS.feedback();
  } catch (err) { toast('儲存失敗：' + err.message); }
};

LOADERS.feedback = async () => {
  try {
    const d = await api('/api/feedback');
    $('#fbIssues').innerHTML = d.issues.length
      ? `<div class="notice"><b>有 ${d.issues.length} 列格式需要修正：</b><br>` +
        d.issues.map(i => `第 ${i.row} 列（${esc(i.sku)}）：${esc(i.issues)}`).join('<br>') + '</div>'
      : '';
    $('#fbTable').innerHTML = table(d.rows, [
      { key: 'sku', label: '貨號' }, { key: 'season', label: '季別' },
      { key: 'verdict', label: '判定' }, { key: 'reason_tags', label: '理由標籤' },
      { key: 'reason_text', label: '文字說明' }, { key: 'source', label: '來源' },
      { key: 'store_or_region', label: '門市/區域' }, { key: 'respondent', label: '填寫人' },
      { key: 'survey_date', label: '日期' }, { key: 'suggested_action', label: '建議行動' },
    ], ['reason_text', 'reason_tags']);
  } catch (e) { $('#fbTable').innerHTML = `<div class="notice">${esc(e.message)}</div>`; }

  try {
    const d = await api('/api/analysis/diagnosis');
    $('#fbGaps').innerHTML = d.gaps.length ? d.gaps.map(g => `
      <div class="row" data-sku="${esc(g.sku)}">
        <b>${esc(g.sku)}　${esc(g.perf_band_zh || '')}</b>
        ${esc(g.product_name || '')}　進貨 ${num(g.stock_in)}　售罄 ${pct(g.sell_through_rate)}
      </div>`).join('') : '<p class="hint">目前沒有待補的極端款。</p>';
    $$('#fbGaps .row').forEach(r => r.onclick = () => {
      $('[name=sku]').value = r.dataset.sku;
      $('[name=sku]').scrollIntoView({ behavior: 'smooth', block: 'center' });
      $('[name=sku]').focus();
    });
  } catch { /* 主表還沒建好時忽略 */ }
};

/* ---------------------------------------------------------------- 診斷 */
LOADERS.diagnosis = async () => {
  try {
    const d = await api('/api/analysis/diagnosis?priority=' + $('#diagPriority').value);
    const s = d.stats || {};
    $('#diagStats').innerHTML = [
      ['款數', s.total], ['回饋涵蓋率', s.feedback_coverage != null ? pct(s.feedback_coverage) : '—'],
      ['資料與現場衝突', s.conflicts], ['假滯銷', s.false_slow], ['真滯銷', s.true_slow],
      ['高優先', s.high_priority],
    ].map(([l, n]) => `<div class="kpi"><div class="n">${n ?? '—'}</div><div class="l">${l}</div></div>`).join('');
    $('#diagTable').innerHTML = table(d.rows, [
      { key: 'sku', label: '貨號' }, { key: 'category_zh', label: '品類' },
      { key: 'perf_band_zh', label: '資料判定' }, { key: 'fb_verdict', label: '現場判定' },
      { key: 'agreement', label: '一致性' }, { key: 'fb_tags_zh', label: '理由' },
      { key: 'diagnosis', label: '診斷' }, { key: 'action_zh', label: '建議行動' },
      { key: 'priority', label: '優先度' },
    ], ['fb_tags_zh', 'diagnosis']);
    $('#attrTable').innerHTML = table(d.attribution, [
      { key: 'reason_zh', label: '理由' }, { key: 'n_tagged', label: 'n', fmt: 'n' },
      { key: 'attribute_zh', label: '設計特徵' }, { key: 'option_zh', label: '選項' },
      { key: 'share_in_tagged', label: '標記款佔比', fmt: 'pct' },
      { key: 'share_overall', label: '全體佔比', fmt: 'pct' },
      { key: 'concentration_lift', label: '集中度', fmt: 'lift' },
      { key: 'insight_zh', label: '解讀' },
    ], ['insight_zh']);
  } catch (e) { $('#diagTable').innerHTML = `<div class="notice">${esc(e.message)}</div>`; }
};
$('#diagPriority').onchange = LOADERS.diagnosis;

/* ---------------------------------------------------------------- 版型研究 */
LOADERS.pattern = async () => {
  try {
    const d = await api('/api/analysis/pattern?category=' + $('#patCat').value);
    $('#targetTable').innerHTML = table(d.targets, [
      { key: 'category_zh', label: '品類' }, { key: 'metric_zh', label: '版型指標' },
      { key: 'target_range', label: '建議區間' }, { key: 'target_mid', label: '目標值', fmt: 'n' },
      { key: 'n', label: 'n', fmt: 'n' }, { key: 'median_sell_through', label: '售罄中位', fmt: 'pct' },
      { key: 'star_rate', label: '暢銷率', fmt: 'pct' },
    ]);
    const driftCols = d.drift.length ? Object.keys(d.drift[0])
      .filter(k => !k.endsWith('__delta') && !['category'].includes(k))
      .map(k => ({ key: k, label: k, fmt: typeof d.drift[0][k] === 'number' ? 'n' : null })) : [];
    $('#driftTable').innerHTML = table(d.drift, driftCols);
  } catch (e) { $('#targetTable').innerHTML = `<div class="notice">${esc(e.message)}</div>`; }
};
$('#patCat').onchange = LOADERS.pattern;

/* ---------------------------------------------------------------- ★ 線稿工作台 */
wireDrop('#sketchDrop', '#sketchFile', async file => {
  $('#sketchResults').innerHTML = '<p class="hint">處理中…（裁切 → 線稿 → 向量化 → 彩現）</p>';
  const fd = new FormData();
  fd.append('file', file);
  fd.append('auto', $('#sketchAuto').checked);
  fd.append('regions', $('#sketchRegions').value);
  try {
    const d = await api('/api/sketch', { method: 'POST', body: fd });
    let html = d.warning ? `<div class="notice">${esc(d.warning)}</div>` : '';
    html += d.regions.map(r => `
      <div class="sketchset">
        <h3>${esc(r.region)}</h3>
        <img src="${imgUrl(r.dir + '/05_contact_sheet.png')}" alt="">
        <div class="swatches">${(r.palette || []).slice(0, 8).map(c =>
          `<div class="sw" style="background:${c.hex}"><span>${c.hex}</span></div>`).join('')}</div>
        <p class="hint" style="margin-top:26px">
          輸出資料夾：<code>${esc(r.dir)}</code>
          ${r.svg ? '　·　向量檔：<code>02_line.svg</code>（可直接開 Illustrator）' : ''}
        </p>
      </div>`).join('');
    html += `<p class="hint">規格書：<code>${esc(d.spec)}</code>　繪圖 prompt：<code>${esc(d.prompt)}</code></p>`;
    $('#sketchResults').innerHTML = html;
  } catch (e) { $('#sketchResults').innerHTML = `<div class="notice">${esc(e.message)}</div>`; }
});

function buildFlatAttrs() {
  const wanted = ['collar', 'sleeve', 'silhouette_top', 'closure', 'fabric_look', 'pattern', 'detail_top'];
  $('#flatAttrs').innerHTML =
    `<label>品類<select id="flatCat">${META.categories.map(c =>
      `<option value="${c.code}">${esc(c.zh)}</option>`).join('')}</select></label>` +
    wanted.filter(a => META.attributes[a]).map(a => `
      <label>${esc(META.attributes[a].zh)}
        <select data-attr="${a}"><option value="">—</option>
          ${META.attributes[a].options.map(o =>
            `<option value="${o.code}">${esc(o.zh)}</option>`).join('')}
        </select></label>`).join('');
}

$('#flatBtn').onclick = async () => {
  const attrs = {};
  $$('#flatAttrs select[data-attr]').forEach(s => { if (s.value) attrs[s.dataset.attr] = s.value; });
  try {
    const d = await api('/api/sketch/prompt', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: $('#flatCat').value, attributes: attrs, fabric: attrs.fabric_look }),
    });
    const out = $('#flatOut');
    out.hidden = false;
    out.textContent = `${d.spec_zh}\n\n───── 英文繪圖 PROMPT ─────\n${d.prompt}\n\n───── NEGATIVE ─────\n${d.negative}\n\n${d.note}`;
  } catch (e) { toast(e.message); }
};

/* ---------------------------------------------------------------- 企劃 */
let planMd = '';
$('#planBtn').onclick = async () => {
  $('#planOut').innerHTML = '<p class="hint">產生中…</p>';
  try {
    const d = await api(`/api/plan/week?week=${$('#planWeek').value}&n=${$('#planN').value}`);
    planMd = d.markdown;
    $('#planOut').innerHTML = `
      <div class="notice">波段：${esc(d.wave.name)}（${esc(d.wave.weeks || '')}）</div>
      <h2>新品開發</h2><div class="tablewrap">${table(d.new_styles, [
        { key: 'seq', label: '#' }, { key: 'category_zh', label: '品類' },
        { key: 'suggested_design', label: '建議設計方向' },
        { key: 'evidence', label: '數據依據' }, { key: 'avoid', label: '應避開' },
      ], ['suggested_design', 'evidence', 'avoid'])}</div>
      <h2>庫存調用</h2><div class="tablewrap">${table(d.carryover, [
        { key: 'sku', label: '貨號' }, { key: 'product_name', label: '品名' },
        { key: 'category_zh', label: '品類' }, { key: 'list_price', label: '定價', fmt: 'n' },
        { key: 'sell_through_rate', label: '歷史售罄率', fmt: 'pct' },
      ])}</div>
      <h2>成套搭接</h2><div class="tablewrap">${table(d.outfits, [
        { key: 'look_id', label: 'Look' }, { key: 'top', label: '上身' },
        { key: 'bottom', label: '下身' }, { key: 'mix', label: '新舊配比' },
        { key: 'silhouette_note', label: '廓形邏輯' },
      ], ['silhouette_note'])}</div>`;
  } catch (e) { $('#planOut').innerHTML = `<div class="notice">${esc(e.message)}</div>`; }
};
$('#planCopy').onclick = () => {
  if (!planMd) return toast('請先產生企劃');
  navigator.clipboard.writeText(planMd).then(() => toast('Markdown 已複製，可直接貼進會議紀錄'));
};
LOADERS.plan = () => { };
LOADERS.visual = () => { };
LOADERS.sketch = () => { };
