// ===== LIGHTS (燈號分析) =====
// 階段 2：前端匯入介面 + PALMS .xls 解析
// 後端 API 將於階段 2b 補上

const LIGHTS_SHEET_GID = 594862570;
const LIGHTS_CSV = `https://docs.google.com/spreadsheets/d/1vaunMiu-soVacqsbvRxY1dDQ2ZLBghv0t9rTer3KdP0/export?format=csv&gid=${LIGHTS_SHEET_GID}`;
// 部署 Apps Script 後填入此 URL（apps-script/lights-backend.gs 的 Web App 部署網址）
const LIGHTS_API_URL = 'https://script.google.com/macros/s/AKfycbzsOG0E2CHPzdgEV-nmU2g6uSeo3kormxCuNckBnSQxKgpJBWyjnbAiXY9rRYoXCW_TPg/exec';

let _lightsSubTab = 'import';
let _lightsImport = null;  // { fileName, from, to, chapter, importer, rangeType, rows: [{...}] }
let _lightsData = null;    // listLightsData 結果（cache）
let _lightsScoreMonths = 6; // 紅綠燈分析回溯月數（預設 6）
let _lightsPredictWeeks = 4; // 預測：剩餘週數
let _lightsConfig = null;   // 評分標準（從後端拉）

const DEFAULT_LIGHTS_CONFIG = {
  refScore:   [1.5, 1.2, 1.0, 0.75],         // 引薦倍率：20/15/10/5 分
  visScore:   [0.5, 0.25],                    // 來賓倍率：15/10 分
  oneScore:   [2.0, 1.0, 0.5],                // 121 倍率：15/10/5 分
  trainScore: [6, 4, 2],                      // 培訓次數：15/10/5 分
  amtScore:   [2000000, 800000, 400000],      // 金額門檻：15/10/5 分
  absScore:   [20, 15, 10, 0],                // 缺席 0/1/2/3+ 對應分數
  lightLevel: [70, 50, 30],                   // 燈號閾值：綠/黃/紅
  holidayCount: 0                             // 本月休會次數
};

function _getLightsCfg() {
  return _lightsConfig || DEFAULT_LIGHTS_CONFIG;
}

const LIGHTS_SUBTABS = [
  { id: 'import',   label: '匯入' },
  { id: 'score',    label: '紅綠燈' },
  { id: 'predict',  label: '預測' },
  { id: 'announce', label: '公告' },
  { id: 'config',   label: '設定' }
];

function renderLights() {
  const el = document.getElementById('lightsContent');
  if (!el) return;

  const subBtn = (id, label) =>
    `<button class="lights-subtab ${_lightsSubTab===id?'active':''}" onclick="_lightsSwitch('${id}')">${label}</button>`;

  el.innerHTML = `<div class="lights-wrapper">
    <div class="card" style="margin-bottom:14px;padding:14px 18px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div>
          <div style="font-size:16px;font-weight:900;color:var(--text);">燈號分析</div>
          <div style="font-size:12px;color:var(--text-soft);margin-top:3px;">PALMS 數據 → 紅綠燈 / 預測 / 副主席報告</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
        ${LIGHTS_SUBTABS.map(t => subBtn(t.id, t.label)).join('')}
      </div>
    </div>
    <div id="lightsContentInner"></div>
  </div>`;

  _renderLightsCurrentTab();
}

function _lightsSwitch(id) {
  _lightsSubTab = id;
  renderLights();
}

function _renderLightsCurrentTab() {
  const c = document.getElementById('lightsContentInner');
  if (!c) return;
  switch (_lightsSubTab) {
    case 'import':   c.innerHTML = _renderLightsImportHtml(); break;
    case 'score':
      c.innerHTML = '<div class="card" style="padding:48px;text-align:center;color:var(--text-soft);">載入中...</div>';
      _renderLightsScoreTab();
      break;
    case 'predict':
      c.innerHTML = '<div class="card" style="padding:48px;text-align:center;color:var(--text-soft);">載入中...</div>';
      _renderLightsPredictTab();
      break;
    case 'announce':
      c.innerHTML = '<div class="card" style="padding:48px;text-align:center;color:var(--text-soft);">載入中...</div>';
      _renderLightsAnnounceTab();
      break;
    case 'config':
      c.innerHTML = '<div class="card" style="padding:48px;text-align:center;color:var(--text-soft);">載入中...</div>';
      _renderLightsConfigTab();
      break;
  }
}

function _placeholderCard(title, desc) {
  return `<div class="card" style="padding:40px 24px;text-align:center;">
    <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:6px;">${_escH(title)}</div>
    <div style="font-size:12px;color:var(--text-soft);">${_escH(desc)}</div>
    <div style="font-size:11px;color:var(--text-soft);margin-top:10px;">（待後續階段實作）</div>
  </div>`;
}

// ===== 匯入子分頁 =====
function _renderLightsImportHtml() {
  if (!_lightsImport) {
    return `
    <div class="card" style="padding:24px;">
      <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:10px;">上傳 BNI Connect PALMS 報告</div>
      <div style="font-size:12px;color:var(--text-soft);line-height:1.6;margin-bottom:14px;">
        從 BNI Connect 下載「分會 - PALMS 摘要報告」<b>.xls</b> 檔案後拖到下方區域，或點擊選檔。<br>
        系統會自動辨識區間 from/to、會員資料 15 欄。
      </div>
      <div id="lightsDropZone"
        ondrop="_lightsHandleDrop(event)"
        ondragover="event.preventDefault();this.classList.add('drag-over');"
        ondragleave="this.classList.remove('drag-over');"
        onclick="document.getElementById('lightsFileInput').click();"
        class="lights-dropzone">
        <div style="font-size:14px;font-weight:700;color:var(--text);">點擊或拖曳 PALMS .xls 檔案</div>
        <div style="font-size:11px;color:var(--text-soft);margin-top:4px;">支援 BNI Connect 匯出的 SpreadsheetML 格式</div>
        <input type="file" id="lightsFileInput" accept=".xls,.xml" style="display:none" onchange="_lightsHandleFile(this.files[0])">
      </div>
    </div>`;
  }

  const imp = _lightsImport;
  const rowsHtml = imp.rows.map((r, i) => `<tr>
    <td>${i+1}</td>
    <td style="text-align:left;font-weight:600;">${_escH(r.name)}</td>
    <td>${r.att}</td><td>${r.abs}</td><td>${r.late}</td>
    <td>${r.refIn}</td><td>${r.refOut}</td><td>${r.refRcvIn}</td><td>${r.refRcvOut}</td>
    <td>${r.vis}</td><td>${r.one}</td>
    <td style="text-align:right;">${Number(r.amt).toLocaleString()}</td>
    <td>${r.train}</td>
  </tr>`).join('');

  return `
  <div class="card" style="padding:18px;margin-bottom:14px;">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <div style="font-size:14px;font-weight:700;color:var(--text);">預覽 — ${_escH(imp.fileName)}</div>
      <button class="btn" style="padding:6px 12px;font-size:12px;background:white;border:1px solid var(--gray-border);color:var(--text-soft);" onclick="_lightsClearImport()">重選檔案</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));gap:10px;margin-top:14px;">
      <div class="modal-field">
        <div class="modal-label">區間起 (from)</div>
        <input class="modal-input" type="date" id="lightsFromInput" value="${_escH(imp.from)}">
      </div>
      <div class="modal-field">
        <div class="modal-label">區間迄 (to)</div>
        <input class="modal-input" type="date" id="lightsToInput" value="${_escH(imp.to)}">
      </div>
      <div class="modal-field">
        <div class="modal-label">區間類型</div>
        <select class="modal-input" id="lightsRangeType" style="appearance:auto;background:white;">
          <option value="week"   ${imp.rangeType==='week'?'selected':''}>單週 (7 天)</option>
          <option value="month"  ${imp.rangeType==='month'?'selected':''}>單月 (~30 天)</option>
          <option value="period" ${imp.rangeType==='period'?'selected':''}>整期 (>80 天)</option>
          <option value="custom" ${imp.rangeType==='custom'?'selected':''}>自訂</option>
        </select>
      </div>
      <div class="modal-field">
        <div class="modal-label">匯入者</div>
        <input class="modal-input" type="text" id="lightsImporter" value="${_escH(imp.importer)}">
      </div>
    </div>
    <div style="margin-top:12px;font-size:13px;color:var(--text-soft);">
      共解析到 <b style="color:var(--text);">${imp.rows.length}</b> 位會員${imp.chapter ? ` · 分會：${_escH(imp.chapter)}` : ''}
    </div>
  </div>

  <div class="card" style="padding:0;overflow:hidden;">
    <div style="overflow-x:auto;max-height:520px;">
      <table class="lights-preview-table">
        <thead>
          <tr>
            <th>#</th><th>姓名</th>
            <th>出席</th><th>缺席</th><th>遲到</th>
            <th>提內引</th><th>提外引</th><th>收內引</th><th>收外引</th>
            <th>來賓</th><th>121</th><th>交易價值</th><th>教育</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  </div>

  <div class="card" style="padding:14px 18px;margin-top:14px;display:flex;justify-content:flex-end;gap:8px;">
    <button class="btn" onclick="_lightsClearImport()" style="background:white;border:1.5px solid var(--gray-border);color:var(--text-soft);">取消</button>
    <button class="btn btn-primary" onclick="_lightsConfirmImport()">確認匯入</button>
  </div>`;
}

function _lightsHandleDrop(ev) {
  ev.preventDefault();
  ev.currentTarget.classList.remove('drag-over');
  const file = ev.dataTransfer.files[0];
  if (file) _lightsHandleFile(file);
}

async function _lightsHandleFile(file) {
  if (!file) return;
  if (!/\.(xls|xml)$/i.test(file.name)) {
    showToast('請選擇 .xls 或 .xml 檔案');
    return;
  }
  showLoader(true, '解析中...');
  try {
    const text = await file.text();
    const parsed = _parsePalmsXml(text);
    if (!parsed.rows.length) throw new Error('找不到會員資料列');
    _lightsImport = {
      fileName: file.name,
      from: parsed.from,
      to: parsed.to,
      chapter: parsed.chapter,
      rows: parsed.rows,
      importer: (typeof CU !== 'undefined' && CU) ? CU : '',
      rangeType: _guessRangeType(parsed.from, parsed.to)
    };
    _renderLightsCurrentTab();
    showToast(`解析成功，共 ${parsed.rows.length} 位會員`);
  } catch (e) {
    showToast('解析失敗：' + (e.message || e));
  } finally {
    showLoader(false);
  }
}

function _guessRangeType(fromIso, toIso) {
  if (!fromIso || !toIso) return 'custom';
  const f = new Date(fromIso);
  const t = new Date(toIso);
  if (isNaN(f) || isNaN(t)) return 'custom';
  const days = Math.round((t - f) / 86400000);
  if (days >= 5 && days <= 9) return 'week';
  if (days >= 25 && days <= 35) return 'month';
  if (days >= 80) return 'period';
  return 'custom';
}

function _lightsClearImport() {
  _lightsImport = null;
  _renderLightsCurrentTab();
}

async function _lightsConfirmImport() {
  const from = document.getElementById('lightsFromInput')?.value || _lightsImport.from;
  const to = document.getElementById('lightsToInput')?.value || _lightsImport.to;
  const rangeType = document.getElementById('lightsRangeType')?.value || _lightsImport.rangeType;
  const importer = document.getElementById('lightsImporter')?.value || _lightsImport.importer;
  const rows = _lightsImport.rows;

  if (!from || !to) { showToast('請填寫 from / to'); return; }

  // 後端尚未部署 → console.log
  if (!LIGHTS_API_URL) {
    console.log('[Lights] 將匯入（後端尚未部署）：', { from, to, rangeType, importer, rowCount: rows.length });
    console.log('[Lights] 前 3 筆資料：', rows.slice(0, 3));
    showToast('後端 API 尚未填入 LIGHTS_API_URL，請見 console。');
    return;
  }

  showLoader(true, '寫入中...');
  try {
    const res = await fetch(LIGHTS_API_URL, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'addPalmsImport', from, to, rangeType, importer, rows })
    });
    const json = await res.json();
    if (!json || !json.ok) throw new Error(json?.error || 'API 失敗');
    showToast(`匯入成功：新增 ${json.added} 筆${json.replaced ? `，覆蓋 ${json.replaced} 筆舊資料` : ''}`);
    _lightsImport = null;
    _renderLightsCurrentTab();
  } catch (e) {
    showToast('匯入失敗：' + (e.message || e));
  } finally {
    showLoader(false);
  }
}

// ===== PALMS SpreadsheetML 解析 =====
function _parsePalmsXml(text) {
  const ns = 'urn:schemas-microsoft-com:office:spreadsheet';
  let doc;
  try {
    doc = new DOMParser().parseFromString(text, 'application/xml');
  } catch (e) {
    throw new Error('檔案不是有效的 XML');
  }
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('XML 格式錯誤');
  }
  const worksheets = doc.getElementsByTagNameNS(ns, 'Worksheet');
  if (!worksheets.length) throw new Error('找不到 Worksheet');
  const table = worksheets[0].getElementsByTagNameNS(ns, 'Table')[0];
  if (!table) throw new Error('找不到 Table');

  const xmlRows = table.getElementsByTagNameNS(ns, 'Row');
  const grid = [];
  for (let r = 0; r < xmlRows.length; r++) {
    const cells = xmlRows[r].getElementsByTagNameNS(ns, 'Cell');
    const row = [];
    let colIdx = 0;
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c];
      const idxAttr = cell.getAttributeNS(ns, 'Index');
      if (idxAttr) {
        const target = parseInt(idxAttr, 10) - 1;
        while (colIdx < target) { row.push(''); colIdx++; }
      }
      const data = cell.getElementsByTagNameNS(ns, 'Data')[0];
      row.push(data ? data.textContent : '');
      colIdx++;
    }
    grid.push(row);
  }

  // 從前 10 列找 from / to / 分會
  let from = '', to = '', chapter = '';
  for (let r = 0; r < Math.min(grid.length, 10); r++) {
    const row = grid[r];
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c] || '').trim();
      if (v === '從:' || v === '從：') from = String(row[c+1] || '').slice(0, 10);
      else if (v === '至:' || v === '至：') to = String(row[c+1] || '').slice(0, 10);
      else if (v === '分會:' || v === '分會：') chapter = String(row[c+1] || '').trim();
    }
  }

  // 找標題列（含「姓氏」）
  let headerRow = -1;
  for (let r = 0; r < grid.length; r++) {
    if ((grid[r][0] || '').trim() === '姓氏') { headerRow = r; break; }
  }
  if (headerRow < 0) throw new Error('找不到「姓氏」標題列');

  // 從標題列下一列開始抓資料，遇到 來賓 / BNI / 總數 結束
  const rows = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r];
    const surname = (row[0] || '').trim();
    const given = (row[1] || '').trim();
    if (!surname) continue;
    if (surname === '來賓' || surname === 'BNI' || surname === '總數') break;
    if (!given) continue;
    rows.push({
      surname, given,
      name:      surname + given,
      att:       _num(row[2]),
      abs:       _num(row[3]),
      late:      _num(row[4]),
      sick:      _num(row[5]),
      sub:       _num(row[6]),
      refIn:     _num(row[7]),
      refOut:    _num(row[8]),
      refRcvIn:  _num(row[9]),
      refRcvOut: _num(row[10]),
      vis:       _num(row[11]),
      one:       _num(row[12]),
      amt:       _num(row[13]),
      train:     _num(row[14])
    });
  }

  return { from, to, chapter, rows };
}

function _num(v) {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

// ===== API：拉資料 =====
async function fetchLightsData() {
  if (!LIGHTS_API_URL) throw new Error('LIGHTS_API_URL 尚未設定');
  const r = await fetch(LIGHTS_API_URL + '?action=listLightsData&t=' + Date.now());
  const j = await r.json();
  if (!j || !j.ok) throw new Error(j?.error || '載入失敗');
  _lightsData = j.data || [];
  return _lightsData;
}

// ===== 紅綠燈計算 =====
// 把多筆 row（同一段期間）按 name 加總，weeks 用區間長度算
function _aggregateMembers(rows) {
  const map = {};
  rows.forEach(r => {
    const key = (r.name || '').trim();
    if (!key) return;
    if (!map[key]) {
      map[key] = {
        name: key, weeks: 0,
        att: 0, abs: 0, late: 0, sick: 0, sub: 0,
        refIn: 0, refOut: 0, refRcvIn: 0, refRcvOut: 0,
        vis: 0, one: 0, amt: 0, train: 0
      };
    }
    const f = new Date(r.from), t = new Date(r.to);
    let w = 0;
    if (!isNaN(f.getTime()) && !isNaN(t.getTime())) {
      w = ((t - f) / 86400000 + 1) / 7;
      if (w < 0) w = 0;
    }
    const m = map[key];
    m.weeks    += w;
    m.att      += _num(r.att);
    m.abs      += _num(r.abs);
    m.late     += _num(r.late);
    m.sick     += _num(r.sick);
    m.sub      += _num(r.sub);
    m.refIn    += _num(r.refIn);
    m.refOut   += _num(r.refOut);
    m.refRcvIn += _num(r.refRcvIn);
    m.refRcvOut+= _num(r.refRcvOut);
    m.vis      += _num(r.vis);
    m.one      += _num(r.one);
    m.amt      += _num(r.amt);
    m.train    += _num(r.train);
  });
  return map;
}

// 計算單一會員的成績（依 _lightsConfig 設定）
function _calcLightScore(d) {
  const cfg = _getLightsCfg();
  const w = d.weeks || 0;
  const ref = d.refIn + d.refOut;
  if (w <= 0) {
    return { total: 0, light: '灰燈', sRef: 0, sVis: 0, sOne: 0, sTrain: 0, sAmt: 0, sAbs: 0, ref: ref };
  }
  const rt = cfg.refScore;   // 4 個門檻 → 20/15/10/5
  const sRef   = ref >= Math.ceil(rt[0]*w) ? 20 : ref >= Math.ceil(rt[1]*w) ? 15 : ref >= Math.ceil(rt[2]*w) ? 10 : ref >= Math.ceil(rt[3]*w) ? 5 : 0;
  const vt = cfg.visScore;   // 2 個門檻 → 15/10
  const sVis   = d.vis >= Math.ceil(vt[0]*w) ? 15 : d.vis >= Math.ceil(vt[1]*w) ? 10 : 0;
  const ot = cfg.oneScore;   // 3 個門檻 → 15/10/5
  const sOne   = d.one >= Math.ceil(ot[0]*w) ? 15 : d.one >= Math.ceil(ot[1]*w) ? 10 : d.one >= Math.ceil(ot[2]*w) ? 5 : 0;
  const tt = cfg.trainScore; // 3 個門檻 → 15/10/5
  const sTrain = d.train >= tt[0] ? 15 : d.train >= tt[1] ? 10 : d.train >= tt[2] ? 5 : 0;
  const at = cfg.amtScore;   // 3 個門檻 → 15/10/5
  const sAmt   = d.amt >= at[0] ? 15 : d.amt >= at[1] ? 10 : d.amt >= at[2] ? 5 : 0;
  const ab = cfg.absScore;   // [缺0, 缺1, 缺2, 缺3+]
  const sAbs   = d.abs >= 3 ? ab[3] : d.abs === 2 ? ab[2] : d.abs === 1 ? ab[1] : ab[0];
  const total  = sRef + sVis + sOne + sTrain + sAmt + sAbs;
  const ll = cfg.lightLevel; // [綠, 黃, 紅]
  const light  = total >= ll[0] ? '綠燈' : total >= ll[1] ? '黃燈' : total >= ll[2] ? '紅燈' : '灰燈';
  return { sRef, sVis, sOne, sTrain, sAmt, sAbs, total, light, ref };
}

function _lightBgColor(light) {
  return light === '綠燈' ? '#d9ead3'
       : light === '黃燈' ? '#fff2cc'
       : light === '紅燈' ? '#f4cccc'
       :                    '#efefef';
}

// 算「現在往回 N 個月」的起始日（取月初）
function _monthsAgoIso(n) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - n + 1, 1); // 含本月共 N 個月
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

async function _renderLightsScoreTab() {
  const c = document.getElementById('lightsContentInner');
  if (!c) return;

  if (!_lightsData) {
    try { await fetchLightsData(); }
    catch (e) {
      c.innerHTML = `<div class="card" style="padding:40px;text-align:center;color:var(--red);">載入失敗：${_escH(e.message || e)}<br><button class="btn" style="margin-top:14px;" onclick="_lightsData=null;_renderLightsScoreTab()">重試</button></div>`;
      return;
    }
  }
  if (!_lightsData.length) {
    c.innerHTML = `<div class="card" style="padding:40px;text-align:center;color:var(--text-soft);">尚無 PALMS 匯入資料，請先到「匯入」分頁上傳。</div>`;
    return;
  }

  // 篩選最近 N 個月的 row（依 from 起始日）
  const fromCutoff = _monthsAgoIso(_lightsScoreMonths);
  const recent = _lightsData.filter(r => String(r.from || '') >= fromCutoff);

  if (!recent.length) {
    const earliest = _lightsData.map(r => r.from).sort()[0];
    c.innerHTML = `<div class="card" style="padding:40px;text-align:center;color:var(--text-soft);">
      最近 ${_lightsScoreMonths} 個月內沒有資料（cutoff: ${fromCutoff}）。<br>
      最早的資料在 ${earliest}。<br>
      ${_monthsRangePicker()}
    </div>`;
    return;
  }

  const grouped = _aggregateMembers(recent);
  const list = Object.values(grouped).map(d => {
    const s = _calcLightScore(d);
    return { ...d, ...s };
  });
  list.sort((a, b) => b.total - a.total);

  const lightCounts = { '綠燈': 0, '黃燈': 0, '紅燈': 0, '灰燈': 0 };
  list.forEach(x => lightCounts[x.light]++);
  const totalMembers = list.length;
  const ratio = totalMembers > 0 ? Math.round(((lightCounts['綠燈'] + lightCounts['黃燈']) / totalMembers) * 100) : 0;

  const dateRange = `${fromCutoff} ~ 至今（最近 ${_lightsScoreMonths} 個月）`;

  const statHtml = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;">
    ${['綠燈','黃燈','紅燈','灰燈'].map(l => {
      const bg = _lightBgColor(l);
      return `<div style="background:${bg};padding:14px 10px;border-radius:10px;text-align:center;">
        <div style="font-size:11px;font-weight:700;color:var(--text);letter-spacing:0.5px;">${l}</div>
        <div style="font-size:24px;font-weight:900;color:var(--text);margin-top:4px;">${lightCounts[l]}</div>
      </div>`;
    }).join('')}
  </div>`;

  const rowsHtml = list.map((s, i) => `<tr style="background:${_lightBgColor(s.light)};">
    <td>${i+1}</td>
    <td style="text-align:left;font-weight:700;">${_escH(s.name)}</td>
    <td>${s.weeks.toFixed(1)}</td>
    <td>${s.sAbs}<span style="color:#666;font-size:10px;"> (${s.abs})</span></td>
    <td>${s.sRef}<span style="color:#666;font-size:10px;"> (${s.ref})</span></td>
    <td>${s.sOne}<span style="color:#666;font-size:10px;"> (${s.one})</span></td>
    <td>${s.sTrain}<span style="color:#666;font-size:10px;"> (${s.train})</span></td>
    <td>${s.sAmt}<span style="color:#666;font-size:10px;"> (${(s.amt/10000).toFixed(0)}萬)</span></td>
    <td>${s.sVis}<span style="color:#666;font-size:10px;"> (${s.vis})</span></td>
    <td style="font-weight:900;font-size:14px;">${s.total}</td>
    <td style="font-weight:700;">${s.light}</td>
  </tr>`).join('');

  c.innerHTML = `
    <div class="card" style="padding:14px 18px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div>
          <div style="font-size:14px;font-weight:700;color:var(--text);">紅綠燈成績</div>
          <div style="font-size:12px;color:var(--text-soft);margin-top:3px;">${dateRange} · ${totalMembers} 位 · 綠黃燈比例 <b style="color:var(--red);">${ratio}%</b></div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          ${_monthsRangePicker()}
          <button class="btn" style="padding:6px 12px;font-size:12px;background:white;border:1px solid var(--gray-border);color:var(--text-soft);" onclick="_lightsData=null;_renderLightsScoreTab()">重整</button>
        </div>
      </div>
      ${statHtml}
    </div>

    <div class="card" style="padding:0;overflow:hidden;">
      <div style="overflow-x:auto;">
        <table class="lights-score-table">
          <thead>
            <tr>
              <th>#</th><th>會員</th><th>週數</th>
              <th>出席</th><th>引薦</th><th>121</th><th>培訓</th><th>金額</th><th>來賓</th>
              <th>總分</th><th>燈號</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>`;
}

function _monthsRangePicker() {
  return `<select onchange="_lightsScoreMonths=+this.value;_renderLightsScoreTab()" class="guest-filter-sel" style="min-width:120px;flex:0;">
    <option value="3"  ${_lightsScoreMonths===3?'selected':''}>最近 3 個月</option>
    <option value="6"  ${_lightsScoreMonths===6?'selected':''}>最近 6 個月</option>
    <option value="12" ${_lightsScoreMonths===12?'selected':''}>最近 12 個月</option>
    <option value="999" ${_lightsScoreMonths===999?'selected':''}>全部</option>
  </select>`;
}

// ===== 期末預測 =====
async function _renderLightsPredictTab() {
  const c = document.getElementById('lightsContentInner');
  if (!c) return;

  if (!_lightsData) {
    try { await fetchLightsData(); }
    catch (e) {
      c.innerHTML = `<div class="card" style="padding:40px;text-align:center;color:var(--red);">載入失敗：${_escH(e.message || e)}</div>`;
      return;
    }
  }
  if (!_lightsData.length) {
    c.innerHTML = `<div class="card" style="padding:40px;text-align:center;color:var(--text-soft);">尚無 PALMS 匯入資料，請先到「匯入」分頁上傳。</div>`;
    return;
  }

  // 用「全部資料」當作期末已實際的成績（更準確）
  const grouped = _aggregateMembers(_lightsData);
  const remainW = _lightsPredictWeeks;

  // 對每位會員：預測 = 假設剩餘 N 週用「目前平均速率」累加
  const list = Object.values(grouped).map(d => {
    const cur = _calcLightScore(d);
    // 預測：用目前速率推到剩餘週數
    const w = d.weeks || 0;
    const factor = w > 0 ? (w + remainW) / w : 1;
    const predict = _calcLightScore({
      weeks:    w + remainW,
      att:      d.att,
      abs:      d.abs,
      late:     d.late,
      sick:     d.sick,
      sub:      d.sub,
      refIn:    Math.round(d.refIn * factor),
      refOut:   Math.round(d.refOut * factor),
      refRcvIn: Math.round(d.refRcvIn * factor),
      refRcvOut:Math.round(d.refRcvOut * factor),
      vis:      Math.round(d.vis * factor),
      one:      Math.round(d.one * factor),
      amt:      Math.round(d.amt * factor),
      train:    d.train  // 培訓不外推（手動值）
    });
    return { ...d, cur, predict };
  });
  list.sort((a, b) => b.predict.total - a.predict.total);

  const rowsHtml = list.map((s, i) => {
    const gap = s.predict.total < 70 ? `差 ${70 - s.predict.total} 分` : '達綠燈';
    return `<tr style="background:${_lightBgColor(s.predict.light)};">
      <td>${i+1}</td>
      <td style="text-align:left;font-weight:700;">${_escH(s.name)}</td>
      <td>${s.weeks.toFixed(1)}</td>
      <td style="font-weight:700;">${s.cur.total}</td>
      <td>${s.cur.light}</td>
      <td style="font-weight:900;color:#c0392b;">${s.predict.total}</td>
      <td style="font-weight:700;">${s.predict.light}</td>
      <td style="font-size:11px;">${gap}</td>
    </tr>`;
  }).join('');

  c.innerHTML = `
    <div class="card" style="padding:14px 18px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div>
          <div style="font-size:14px;font-weight:700;color:var(--text);">期末預測</div>
          <div style="font-size:12px;color:var(--text-soft);margin-top:3px;">依目前速率推算到「剩餘週數」之後的總分</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <label style="font-size:12px;color:var(--text-soft);font-weight:600;">剩餘週數</label>
          <input type="number" min="0" max="52" value="${_lightsPredictWeeks}" onchange="_lightsPredictWeeks=Math.max(0,+this.value||0);_renderLightsPredictTab()"
            style="width:70px;padding:6px 10px;border:1.5px solid var(--gray-border);border-radius:8px;font-family:inherit;font-size:13px;outline:none;text-align:center;">
          <button class="btn" style="padding:6px 12px;font-size:12px;background:white;border:1px solid var(--gray-border);color:var(--text-soft);" onclick="_lightsData=null;_renderLightsPredictTab()">重整</button>
        </div>
      </div>
    </div>

    <div class="card" style="padding:0;overflow:hidden;">
      <div style="overflow-x:auto;">
        <table class="lights-score-table">
          <thead>
            <tr>
              <th>#</th><th>會員</th><th>週數</th>
              <th>目前總分</th><th>目前燈號</th>
              <th>期末預測</th><th>預測燈號</th><th>距綠燈</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>`;
}

// ===== 副主席報告 / 公告 =====
async function _renderLightsAnnounceTab() {
  const c = document.getElementById('lightsContentInner');
  if (!c) return;

  if (!_lightsData) {
    try { await fetchLightsData(); }
    catch (e) {
      c.innerHTML = `<div class="card" style="padding:40px;text-align:center;color:var(--red);">載入失敗：${_escH(e.message || e)}</div>`;
      return;
    }
  }
  if (!_lightsData.length) {
    c.innerHTML = `<div class="card" style="padding:40px;text-align:center;color:var(--text-soft);">尚無 PALMS 匯入資料，請先到「匯入」分頁上傳。</div>`;
    return;
  }

  // 主體：用「全部資料」算燈號
  const grouped = _aggregateMembers(_lightsData);
  const list = Object.values(grouped).map(d => ({ ...d, ...(_calcLightScore(d)) }));

  const lightCounts = { '綠燈': 0, '黃燈': 0, '紅燈': 0, '灰燈': 0 };
  list.forEach(x => lightCounts[x.light]++);
  const totalMembers = list.length;
  const ratio = totalMembers > 0 ? Math.round(((lightCounts['綠燈'] + lightCounts['黃燈']) / totalMembers) * 100) : 0;

  // 期末衝刺預警
  const remainW = _lightsPredictWeeks || 4;
  const needTrain = [], needRef = [], need121 = [], nearGuest = [], nearAmt = [];
  list.forEach(s => {
    const w = (s.weeks || 0) + remainW;
    if (w <= 0) return;
    if (s.train < 6) needTrain.push({ name: s.name, gap: 6 - s.train });
    const tRef = Math.ceil(1.5 * w);
    if (s.ref < tRef) needRef.push({ name: s.name, gap: tRef - s.ref });
    const t121 = Math.ceil(2.0 * w);
    if (s.one < t121) need121.push({ name: s.name, gap: t121 - s.one });
    const tVis10 = Math.ceil(0.25 * w), tVis15 = Math.ceil(0.5 * w);
    if (s.vis < tVis10) nearGuest.push({ name: s.name, gap: tVis10 - s.vis, score: 10 });
    else if (s.vis < tVis15) nearGuest.push({ name: s.name, gap: tVis15 - s.vis, score: 15 });
    const amtSteps = [{ h: 400000, p: 5 }, { h: 800000, p: 10 }, { h: 2000000, p: 15 }];
    for (const st of amtSteps) {
      if (s.amt < st.h) { nearAmt.push({ name: s.name, gap: st.h - s.amt, score: st.p }); break; }
    }
  });
  needTrain.sort((a,b) => a.gap - b.gap);
  needRef.sort((a,b) => a.gap - b.gap);
  need121.sort((a,b) => a.gap - b.gap);
  nearGuest.sort((a,b) => a.gap - b.gap);
  nearAmt.sort((a,b) => a.gap - b.gap);

  // 五冠王：找最近一筆「單月」PALMS（rangeType=month 或 days~30）
  const monthRows = _findRecentMonthRows(_lightsData);
  const crown = _calcCrowns(monthRows);

  // 報告文字
  const lines = [];
  lines.push('【副主席報告】');
  lines.push('以下是結算至本期的現役會員成績概況：');
  lines.push('');
  lines.push(`綠燈：${lightCounts['綠燈']} 位`);
  lines.push(`黃燈：${lightCounts['黃燈']} 位`);
  lines.push(`紅燈：${lightCounts['紅燈']} 位`);
  lines.push(`灰燈：${lightCounts['灰燈']} 位`);
  lines.push(`綠黃燈比例：${ratio}%`);
  lines.push('');
  lines.push('=========================');
  lines.push('【期末衝刺預警】');
  lines.push(`（依目前數據 + 剩餘 ${remainW} 週推算）`);
  lines.push('');

  const writeBlock = (title, items, fmt) => {
    lines.push(title);
    if (!items.length) lines.push('（皆已達滿分門檻）');
    else items.forEach((it, i) => lines.push(`${i+1}. ${fmt(it)}`));
    lines.push('');
  };
  writeBlock('需要補培訓的夥伴：',       needTrain, it => `${it.name} (差 ${it.gap} 次)`);
  writeBlock('需要補引薦的夥伴：',       needRef,   it => `${it.name} (差 ${it.gap} 筆)`);
  writeBlock('需要補一對一的夥伴：',     need121,   it => `${it.name} (差 ${it.gap} 次)`);
  writeBlock('來賓分快得分的夥伴：',     nearGuest, it => `${it.name} (差 ${it.gap} 位可得 ${it.score} 分)`);
  writeBlock('引薦金額快升級的夥伴：',   nearAmt,   it => `${it.name} (差 ${(it.gap/10000).toFixed(0)} 萬可得 ${it.score} 分)`);

  // 五冠王
  if (crown && crown.label) {
    lines.push('=========================');
    lines.push(`【${crown.label} 五冠王】`);
    lines.push('');
    ['ref','amt','one','train','vis'].forEach(k => {
      const tops = crown.tops[k];
      if (!tops || !tops.length) return;
      lines.push(`${crown.titles[k]}：`);
      tops.forEach((t, i) => lines.push(`  ${i+1}. ${t.label}`));
      lines.push('');
    });
  }

  const reportText = lines.join('\n');

  // UI
  c.innerHTML = `
    <div class="card" style="padding:14px 18px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div>
          <div style="font-size:14px;font-weight:700;color:var(--text);">副主席報告</div>
          <div style="font-size:12px;color:var(--text-soft);margin-top:3px;">${totalMembers} 位現役 · 綠黃燈比例 <b style="color:var(--red);">${ratio}%</b> · 衝刺剩餘 ${remainW} 週</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn-primary" onclick="_lightsCopyReport()">複製報告</button>
          <button class="btn" style="padding:6px 12px;font-size:12px;background:white;border:1px solid var(--gray-border);color:var(--text-soft);" onclick="_lightsData=null;_renderLightsAnnounceTab()">重整</button>
        </div>
      </div>
    </div>

    <div class="card" style="padding:18px;">
      <textarea id="lightsReportText" readonly style="width:100%;height:520px;padding:14px;border:1px solid var(--gray-border);border-radius:8px;font-family:'Noto Sans TC',sans-serif;font-size:14px;line-height:1.7;resize:vertical;outline:none;background:#fafbfc;">${_escH(reportText)}</textarea>
    </div>`;
}

function _lightsCopyReport() {
  const ta = document.getElementById('lightsReportText');
  if (!ta) return;
  ta.select();
  try {
    document.execCommand('copy');
    showToast('報告已複製');
  } catch {
    navigator.clipboard.writeText(ta.value).then(() => showToast('報告已複製')).catch(() => showToast('複製失敗'));
  }
  window.getSelection().removeAllRanges();
}

// 找最近一筆「單月」資料；若無則用最近一筆任意區間
function _findRecentMonthRows(allRows) {
  // 把所有 (from, to, rangeType) 聚合，挑 rangeType='month' 且最新
  const grouped = {};
  allRows.forEach(r => {
    const key = `${r.from}|${r.to}|${r.rangeType || ''}`;
    (grouped[key] = grouped[key] || []).push(r);
  });
  const keys = Object.keys(grouped);
  // 優先選 rangeType='month' 且最新（依 from 倒序）
  const monthKeys = keys.filter(k => k.endsWith('|month'));
  let chosen = null;
  if (monthKeys.length) {
    monthKeys.sort((a, b) => b.localeCompare(a));
    chosen = grouped[monthKeys[0]];
  } else {
    // 退而求其次：選最新一份
    keys.sort((a, b) => b.localeCompare(a));
    chosen = grouped[keys[0]];
  }
  return chosen || [];
}

// ===== 設定子分頁 =====
async function _fetchLightsConfig() {
  if (!LIGHTS_API_URL) throw new Error('LIGHTS_API_URL 尚未設定');
  const r = await fetch(LIGHTS_API_URL, {
    method: 'POST', mode: 'cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'getLightsConfig' })
  });
  const j = await r.json();
  if (!j || !j.ok) throw new Error(j?.error || '取設定失敗');
  // 合併到 DEFAULT（避免欄位缺失）
  const merged = { ...DEFAULT_LIGHTS_CONFIG, ...(j.config || {}) };
  // 對於陣列欄位，若長度不對則 fallback 到 default
  ['refScore','visScore','oneScore','trainScore','amtScore','absScore','lightLevel'].forEach(k => {
    if (!Array.isArray(merged[k]) || merged[k].length !== DEFAULT_LIGHTS_CONFIG[k].length) {
      merged[k] = DEFAULT_LIGHTS_CONFIG[k].slice();
    }
  });
  return merged;
}

async function _renderLightsConfigTab() {
  const c = document.getElementById('lightsContentInner');
  if (!c) return;

  if (!_lightsConfig) {
    try {
      _lightsConfig = await _fetchLightsConfig();
    } catch (e) {
      _lightsConfig = JSON.parse(JSON.stringify(DEFAULT_LIGHTS_CONFIG));
      showToast('讀取設定失敗，已套用預設：' + (e.message || e));
    }
  }
  const cfg = _lightsConfig;

  const section = (title, html) => `
    <div class="card" style="padding:16px 18px;margin-bottom:12px;">
      <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:10px;">${title}</div>
      ${html}
    </div>`;

  const field = (id, label, val, step) => `
    <div class="modal-field" style="margin:0;">
      <div class="modal-label">${label}</div>
      <input class="modal-input" type="number" step="${step}" id="${id}" value="${val}">
    </div>`;

  c.innerHTML = `
    <div class="card" style="padding:14px 18px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div>
          <div style="font-size:14px;font-weight:700;color:var(--text);">系統設定</div>
          <div style="font-size:12px;color:var(--text-soft);margin-top:3px;">評分標準、燈號閾值、休會次數</div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn" onclick="_lightsConfigReset()" style="background:white;border:1.5px solid var(--gray-border);color:var(--text-soft);">恢復預設</button>
          <button class="btn btn-primary" onclick="_lightsConfigSave()">儲存</button>
        </div>
      </div>
    </div>

    ${section('引薦分（提內+提外，× 週數）',
      `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
        ${field('cfg_ref_0', '20 分 ≥', cfg.refScore[0], '0.05')}
        ${field('cfg_ref_1', '15 分 ≥', cfg.refScore[1], '0.05')}
        ${field('cfg_ref_2', '10 分 ≥', cfg.refScore[2], '0.05')}
        ${field('cfg_ref_3', '5 分 ≥',  cfg.refScore[3], '0.05')}
      </div>`)}

    ${section('來賓分（× 週數）',
      `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">
        ${field('cfg_vis_0', '15 分 ≥', cfg.visScore[0], '0.05')}
        ${field('cfg_vis_1', '10 分 ≥', cfg.visScore[1], '0.05')}
      </div>`)}

    ${section('一對一分（× 週數）',
      `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        ${field('cfg_one_0', '15 分 ≥', cfg.oneScore[0], '0.05')}
        ${field('cfg_one_1', '10 分 ≥', cfg.oneScore[1], '0.05')}
        ${field('cfg_one_2', '5 分 ≥',  cfg.oneScore[2], '0.05')}
      </div>`)}

    ${section('培訓分（次數）',
      `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        ${field('cfg_train_0', '15 分 ≥', cfg.trainScore[0], '1')}
        ${field('cfg_train_1', '10 分 ≥', cfg.trainScore[1], '1')}
        ${field('cfg_train_2', '5 分 ≥',  cfg.trainScore[2], '1')}
      </div>`)}

    ${section('金額分（元）',
      `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        ${field('cfg_amt_0', '15 分 ≥', cfg.amtScore[0], '100000')}
        ${field('cfg_amt_1', '10 分 ≥', cfg.amtScore[1], '100000')}
        ${field('cfg_amt_2', '5 分 ≥',  cfg.amtScore[2], '100000')}
      </div>`)}

    ${section('出席分（依缺席次數對應的分數）',
      `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
        ${field('cfg_abs_0', '缺 0 次', cfg.absScore[0], '1')}
        ${field('cfg_abs_1', '缺 1 次', cfg.absScore[1], '1')}
        ${field('cfg_abs_2', '缺 2 次', cfg.absScore[2], '1')}
        ${field('cfg_abs_3', '缺 3+ 次', cfg.absScore[3], '1')}
      </div>`)}

    ${section('燈號閾值（總分）',
      `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        ${field('cfg_light_0', '綠燈 ≥', cfg.lightLevel[0], '1')}
        ${field('cfg_light_1', '黃燈 ≥', cfg.lightLevel[1], '1')}
        ${field('cfg_light_2', '紅燈 ≥', cfg.lightLevel[2], '1')}
      </div>`)}

    ${section('其他',
      `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">
        ${field('cfg_holiday', '本月休會次數', cfg.holidayCount || 0, '1')}
      </div>`)}
  `;
}

function _lightsConfigCollect() {
  const v = id => +document.getElementById(id).value;
  return {
    refScore:   [v('cfg_ref_0'), v('cfg_ref_1'), v('cfg_ref_2'), v('cfg_ref_3')],
    visScore:   [v('cfg_vis_0'), v('cfg_vis_1')],
    oneScore:   [v('cfg_one_0'), v('cfg_one_1'), v('cfg_one_2')],
    trainScore: [v('cfg_train_0'), v('cfg_train_1'), v('cfg_train_2')],
    amtScore:   [v('cfg_amt_0'), v('cfg_amt_1'), v('cfg_amt_2')],
    absScore:   [v('cfg_abs_0'), v('cfg_abs_1'), v('cfg_abs_2'), v('cfg_abs_3')],
    lightLevel: [v('cfg_light_0'), v('cfg_light_1'), v('cfg_light_2')],
    holidayCount: v('cfg_holiday')
  };
}

async function _lightsConfigSave() {
  const cfg = _lightsConfigCollect();
  showLoader(true, '儲存中...');
  try {
    const r = await fetch(LIGHTS_API_URL, {
      method: 'POST', mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'setLightsConfig', config: cfg })
    });
    const j = await r.json();
    if (!j || !j.ok) throw new Error(j?.error || '儲存失敗');
    _lightsConfig = cfg;
    showToast('設定已儲存');
  } catch (e) {
    showToast('儲存失敗：' + (e.message || e));
  } finally {
    showLoader(false);
  }
}

function _lightsConfigReset() {
  if (!confirm('確定要恢復預設值？目前未儲存的變更會清除。\n（按下「儲存」後才會寫入後端）')) return;
  _lightsConfig = JSON.parse(JSON.stringify(DEFAULT_LIGHTS_CONFIG));
  _renderLightsConfigTab();
}

function _calcCrowns(rows) {
  if (!rows || !rows.length) return null;
  const sample = rows[0];
  const label = sample.from === sample.to ? sample.from : `${sample.from} ~ ${sample.to}`;
  const list = rows.map(r => ({
    name: r.name,
    ref: _num(r.refIn) + _num(r.refOut),
    amt: _num(r.amt),
    one: _num(r.one),
    train: _num(r.train),
    vis: _num(r.vis)
  }));
  const top3 = (key, isCurrency) => {
    const filtered = list.filter(x => x[key] > 0);
    if (!filtered.length) return [];
    filtered.sort((a, b) => b[key] - a[key]);
    const distinctVals = [...new Set(filtered.map(x => x[key]))].slice(0, 3);
    return distinctVals.map(v => {
      const names = filtered.filter(x => x[key] === v).map(x => x.name);
      const valStr = isCurrency ? Number(v).toLocaleString() : v;
      return { label: `${names.join('、')} (${valStr})` };
    });
  };
  return {
    label,
    titles: {
      ref:   '引薦單數',
      amt:   '引薦金額',
      one:   '121 次數',
      train: '培訓分數',
      vis:   '帶來賓數'
    },
    tops: {
      ref:   top3('ref'),
      amt:   top3('amt', true),
      one:   top3('one'),
      train: top3('train'),
      vis:   top3('vis')
    }
  };
}
