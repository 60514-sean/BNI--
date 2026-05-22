// ===== LIGHTS (燈號分析) =====
const LIGHTS_API_URL = 'https://script.google.com/macros/s/AKfycbzsOG0E2CHPzdgEV-nmU2g6uSeo3kormxCuNckBnSQxKgpJBWyjnbAiXY9rRYoXCW_TPg/exec';

let _lightsSubTab = 'score';
let _lightsImport = null;
let _lightsData = null;
let _lightsScoreMonths = 12;
let _lightsPredictWeeks = 4;
let _lightsScoreFilter = '綠燈';
let _lightsScoreSearch = '';

// 評分標準（依億展白金分會規則，PALMS 報告以 26 週為單位）
const LIGHTS_CFG = {
  refScore:   [1.5, 1.2, 1.0, 0.75],
  visScore:   [0.5, 0.25],
  oneScore:   [2.0, 1.0, 0.5],
  trainScore: [6, 4, 2],
  amtScore:   [2000000, 800000, 400000],
  absScore:   [20, 15, 10, 0],
  lightLevel: [70, 50, 30]
};

function renderLights() {
  const el = document.getElementById('lightsContent');
  if (!el) return;
  el.innerHTML = `<div class="lights-wrapper"><div id="lightsContentInner"></div></div>`;
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
    case 'announce':
      c.innerHTML = '<div class="card" style="padding:48px;text-align:center;color:var(--text-soft);">載入中...</div>';
      _renderLightsAnnounceTab();
      break;
  }
}

// ===== 匯入子分頁 =====
function _lightsBackBar() {
  return `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
    <h2 style="font-size:18px;font-weight:700;color:var(--red);margin:0;">${_lightsSubTab==='import'?'匯入 PALMS 資料':'副主席報告'}</h2>
    <button onclick="_lightsSwitch('score')" style="padding:7px 14px;background:white;border:1.5px solid var(--gray-border);border-radius:7px;cursor:pointer;font-size:13px;font-family:inherit;color:var(--text-soft);">← 返回紅綠燈</button>
  </div>`;
}

function _renderLightsImportHtml() {
  if (!_lightsImport) {
    return `
    ${_lightsBackBar()}
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
  ${_lightsBackBar()}
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

// 計算單一會員的成績
function _calcLightScore(d) {
  const cfg = LIGHTS_CFG;
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

  // 載入會員資料以取得照片 / 專業別（背景拉取，失敗也不影響卡牌渲染）
  if (!_memberData) {
    try { await fetchMembers(); } catch {}
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

  // 統計卡（同時是篩選器：點擊切換顯示）
  const statCard = (id, label, count, color, bg) => {
    const active = _lightsScoreFilter === id;
    const activeStyle = active
      ? `background:${color};box-shadow:0 4px 12px ${color}55;transform:translateY(-1px);`
      : `background:${bg};`;
    const textColor = active ? '#fff' : '#2d3748';
    return `<div onclick="_lightsScoreSetFilter('${id}')" style="${activeStyle}border-radius:10px;padding:14px 10px;display:flex;flex-direction:column;gap:4px;cursor:pointer;transition:all .15s;user-select:none;">
      <div style="font-size:11px;color:${textColor};font-weight:700;letter-spacing:1px;">${label}</div>
      <div style="font-size:24px;color:${textColor};font-weight:900;line-height:1;">${count}</div>
      <div style="font-size:10px;color:${textColor};opacity:${active ? '.9' : '.7'};">位會員</div>
    </div>`;
  };

  const statHtml = `<div class="renewal-stats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px;">
    ${statCard('綠燈', '綠燈',   lightCounts['綠燈'], '#27ae60', '#d9ead3')}
    ${statCard('黃燈', '黃燈',   lightCounts['黃燈'], '#d4ac0d', '#fff2cc')}
    ${statCard('紅燈', '紅燈',   lightCounts['紅燈'], '#c0392b', '#f4cccc')}
    ${statCard('灰燈', '灰燈',   lightCounts['灰燈'], '#7f8c8d', '#efefef')}
  </div>`;

  // 依篩選 + 搜尋過濾
  const q = (_lightsScoreSearch || '').trim().toLowerCase();
  const filtered = list.filter(s => {
    if (s.light !== _lightsScoreFilter) return false;
    if (q && !s.name.toLowerCase().includes(q)) return false;
    return true;
  });

  const cardsHtml = filtered.map((s, i) => _lightsScoreCard(s, i)).join('');
  const emptyHtml = filtered.length === 0
    ? `<div style="text-align:center;padding:48px 20px;color:var(--text-soft);">查無符合條件的會員</div>`
    : '';

  c.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
      <h2 style="font-size:18px;font-weight:700;color:var(--red);margin:0;">紅綠燈成績</h2>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        ${_monthsRangePicker()}
        <button onclick="_lightsSwitch('import')" style="padding:7px 14px;background:white;border:1.5px solid var(--gray-border);border-radius:7px;cursor:pointer;font-size:13px;font-family:inherit;color:var(--text-soft);">匯入</button>
        <button onclick="_lightsSwitch('announce')" style="padding:7px 14px;background:white;border:1.5px solid var(--gray-border);border-radius:7px;cursor:pointer;font-size:13px;font-family:inherit;color:var(--text-soft);">公告</button>
      </div>
    </div>

    <div style="font-size:12px;color:var(--text-soft);margin-bottom:14px;">${dateRange} · ${totalMembers} 位 · 綠黃燈比例 <b style="color:var(--red);">${ratio}%</b></div>

    ${statHtml}

    <input class="member-search" type="text" placeholder="搜尋會員姓名..." value="${_escH(_lightsScoreSearch)}" oninput="_lightsScoreSearch=this.value;_lightsScoreFilterCards()" autocomplete="off" style="margin-bottom:12px;">

    <div id="lightsScoreList" class="member-grid">
      ${cardsHtml}
      ${emptyHtml}
    </div>`;
}

function _lightsScoreSetFilter(id) {
  _lightsScoreFilter = id;
  _renderLightsScoreTab();
}

function _lightsScoreFilterCards() {
  // 搜尋只重渲染列表，不重算（避免每打一個字都閃）
  const q = (_lightsScoreSearch || '').trim().toLowerCase();
  const cards = document.querySelectorAll('#lightsScoreList .lights-score-card');
  let shown = 0;
  cards.forEach(c => {
    const match = !q || (c.dataset.search || '').includes(q);
    c.style.display = match ? '' : 'none';
    if (match) shown++;
  });
}

function _lightsScoreCard(s, idx) {
  // 從 _memberData 比對照片 / 專業別
  const mem = (_memberData || []).find(m => m.name === s.name);
  const photo = mem?.photo || '';
  const specialty = mem?.specialty || '';
  const lightBg = _lightBgColor(s.light);
  const lightColor = s.light === '綠燈' ? '#27ae60'
                    : s.light === '黃燈' ? '#d4ac0d'
                    : s.light === '紅燈' ? '#c0392b'
                    : '#7f8c8d';
  const _ds = [s.name, specialty].filter(Boolean).join(' ').toLowerCase();

  // 六項指標（左：滿分配置；右：實際得分 / 原始值）
  const items = [
    { label: '出席', score: s.sAbs,   max: 20, raw: `缺${s.abs}` },
    { label: '引薦', score: s.sRef,   max: 20, raw: `${s.ref}筆` },
    { label: '121',  score: s.sOne,   max: 15, raw: `${s.one}次` },
    { label: '培訓', score: s.sTrain, max: 15, raw: `${s.train}次` },
    { label: '金額', score: s.sAmt,   max: 15, raw: `${(s.amt/10000).toFixed(0)}萬` },
    { label: '來賓', score: s.sVis,   max: 15, raw: `${s.vis}位` }
  ];
  const itemsHtml = items.map(it => {
    const pct = it.max > 0 ? Math.round((it.score / it.max) * 100) : 0;
    const fillColor = pct >= 100 ? '#27ae60' : pct >= 67 ? '#d4ac0d' : pct > 0 ? '#c0392b' : '#cbd5e0';
    return `<div style="display:flex;flex-direction:column;gap:4px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:11px;">
        <span style="color:var(--text-soft);font-weight:600;">${it.label}</span>
        <span style="color:var(--text);font-weight:700;">${it.score}<span style="color:#999;font-size:10px;font-weight:500;">/${it.max}</span></span>
      </div>
      <div style="height:5px;background:#edf2f7;border-radius:3px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${fillColor};border-radius:3px;transition:width .3s;"></div>
      </div>
      <div style="font-size:10px;color:#999;text-align:right;">${it.raw}</div>
    </div>`;
  }).join('');

  return `<div class="member-card lights-score-card" data-search="${_escH(_ds)}" style="flex-direction:column;gap:0;padding:0;overflow:hidden;align-items:stretch;justify-content:flex-start;">
    <div style="display:flex;align-items:center;gap:12px;padding:14px 14px 12px;border-left:4px solid ${lightColor};">
      <div style="font-size:18px;font-weight:900;color:#cbd5e0;width:24px;text-align:center;flex-shrink:0;">${idx+1}</div>
      ${photo
        ? `<img src="${_escH(photo)}" loading="lazy" decoding="async" style="width:48px;height:48px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid ${lightColor};" onerror="this.style.display='none'">`
        : `<div style="width:48px;height:48px;border-radius:50%;flex-shrink:0;background:#e8ecf0;border:2px solid ${lightColor};display:flex;align-items:center;justify-content:center;color:#bbb;font-size:18px;font-weight:900;">${_escH((s.name || '?').slice(0,1))}</div>`}
      <div style="flex:1;min-width:0;">
        <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:2px;">${_escH(s.name)}</div>
        <div style="font-size:12px;color:var(--text-soft);line-height:1.4;">${_escH(specialty || '—')}</div>
        <div style="font-size:11px;color:var(--text-soft);margin-top:3px;">週數 ${s.weeks.toFixed(1)}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0;">
        <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:${lightBg};color:${lightColor};white-space:nowrap;">${s.light}</span>
        <div style="font-size:22px;font-weight:900;color:${lightColor};line-height:1;">${s.total}<span style="font-size:11px;color:var(--text-soft);font-weight:600;"> 分</span></div>
      </div>
    </div>
    <div style="padding:12px 14px 14px;background:#fafbfc;border-top:1px solid var(--gray-border);">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px 14px;">${itemsHtml}</div>
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
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
      <h2 style="font-size:18px;font-weight:700;color:var(--red);margin:0;">副主席報告</h2>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="_lightsCopyReport()">複製報告</button>
        <button onclick="_lightsSwitch('score')" style="padding:7px 14px;background:white;border:1.5px solid var(--gray-border);border-radius:7px;cursor:pointer;font-size:13px;font-family:inherit;color:var(--text-soft);">← 返回紅綠燈</button>
      </div>
    </div>

    <div style="font-size:12px;color:var(--text-soft);margin-bottom:14px;">${totalMembers} 位現役 · 綠黃燈比例 <b style="color:var(--red);">${ratio}%</b> · 衝刺剩餘 ${remainW} 週</div>

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
