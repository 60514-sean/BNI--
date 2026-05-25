// ===== LIGHTS (燈號分析) =====
const LIGHTS_API_URL = 'https://script.google.com/macros/s/AKfycbzsOG0E2CHPzdgEV-nmU2g6uSeo3kormxCuNckBnSQxKgpJBWyjnbAiXY9rRYoXCW_TPg/exec';

let _lightsSubTab = 'score';
let _lightsData = null;
let _trainingData = null;       // 培訓資料 cache
let _trainingMeta = null;       // 培訓最後上傳資訊（importTime / from / to）
let _lightsScoreFilter = '綠燈';
let _lightsScoreSearch = '';
let _lightsPredictFilter = '綠燈';
let _lightsPredictSearch = '';
let _lightsImportOpenMonths = null; // 匯入頁展開的月份 set，第一次渲染時自動初始化為「當月」
let _lightsScoreExpanded = new Set();   // 上個月紅綠燈：展開的會員卡牌
let _lightsPredictExpanded = new Set(); // 預測紅綠燈：展開的會員卡牌
let _momentumFilter = null;             // 動能觀測：當前篩選狀態（null = 自動選首個有資料的）

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

// 匯入是否對「目前使用者」可見：用「可見頁面」裡『燈號分析』的 ON/OFF（可編輯）控管
// 管理者一律可見；一般使用者需在系統設定把「燈號分析」設為 ON（可編輯）
function _lightsImportVisible() {
  return (typeof _canEditTab === 'function') ? _canEditTab('lights') : true;
}
// 匯入按鈕（開關關閉時不顯示）；primary=true 為紅底主按鈕
function _lightsImportBtn(primary) {
  if (!_lightsImportVisible()) return '';
  const style = primary
    ? 'padding:7px 14px;background:var(--red);border:1.5px solid var(--red);border-radius:7px;cursor:pointer;font-size:13px;font-family:inherit;color:white;font-weight:700;'
    : 'padding:7px 14px;background:white;border:1.5px solid var(--gray-border);border-radius:7px;cursor:pointer;font-size:13px;font-family:inherit;color:var(--text-soft);';
  return `<button onclick="_lightsSwitch('import')" style="${style}">匯入</button>`;
}
// 匯入功能開關改由「系統設定」控制（config.lightsImportEnabled）

function _renderLightsCurrentTab() {
  const c = document.getElementById('lightsContentInner');
  if (!c) return;
  const spinner = `<div style="min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;"><div class="loader-spinner"></div><div style="font-size:13px;color:var(--text-soft);">載入中...</div></div>`;
  c.innerHTML = spinner;
  // 匯入功能關閉時，禁止進入匯入頁
  if (_lightsSubTab === 'import' && !_lightsImportVisible()) _lightsSubTab = 'score';
  switch (_lightsSubTab) {
    case 'import':   _renderLightsImportTab(); break;
    case 'score':    _renderLightsScoreTab(); break;
    case 'predict':  _renderLightsPredictTab(); break;
  }
}

// ===== 月份視窗工具 =====
function _isoDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function _monthKeyOf(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}
function _rowMonthKey(r) {
  return String(r.to || '').substring(0, 7);
}

// 過去 6 個完整月（不含當月）— 給上個月燈號用
function _completedMonthWindow() {
  const now = new Date();
  const months = [];
  for (let i = 6; i >= 1; i--) {
    months.push(_monthKeyOf(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return months;
}

// 過去 6 個月含當月 — 給預測燈號用
function _predictMonthWindow() {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    months.push(_monthKeyOf(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return months;
}

function _rowsInMonths(allRows, monthKeys) {
  const set = new Set(monthKeys);
  return (allRows || []).filter(r => set.has(_rowMonthKey(r)));
}

// 一個月內所有週五的 ISO 日期
function _fridaysInMonth(year, monthIdx) {
  const fridays = [];
  const d = new Date(year, monthIdx, 1);
  while (d.getMonth() === monthIdx) {
    if (d.getDay() === 5) fridays.push(_isoDate(d));
    d.setDate(d.getDate() + 1);
  }
  return fridays;
}

// 算「今天起到當月底還有幾個週五」（含今天若為週五）
function _remainingFridaysInMonth() {
  const today = new Date();
  const fridays = _fridaysInMonth(today.getFullYear(), today.getMonth());
  const todayIso = _isoDate(today);
  return fridays.filter(f => f >= todayIso).length;
}

// 匯入頁要顯示的月份（當月 + 過去 6 個月，新到舊）
function _getImportMonths() {
  const now = new Date();
  const months = [];
  for (let i = 0; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      monthKey: _monthKeyOf(d),
      monthLabel: `${d.getFullYear()} 年 ${d.getMonth()+1} 月`,
      isCurrent: i === 0,
      fridays: _fridaysInMonth(d.getFullYear(), d.getMonth())
    });
  }
  return months;
}

// ===== 匯入子分頁 =====
function _lightsBackBar() {
  return `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
    <h2 style="font-size:18px;font-weight:700;color:var(--red);margin:0;">匯入 PALMS 資料</h2>
    <button onclick="_lightsSwitch('score')" style="padding:7px 14px;background:white;border:1.5px solid var(--gray-border);border-radius:7px;cursor:pointer;font-size:13px;font-family:inherit;color:var(--text-soft);">← 返回上個月紅綠燈</button>
  </div>`;
}

async function _renderLightsImportTab() {
  const c = document.getElementById('lightsContentInner');
  if (!c) return;
  // 匯入功能已關閉 → 不顯示匯入介面
  if (!_lightsImportVisible()) {
    c.innerHTML = `${_lightsBackBar()}<div class="card" style="padding:40px;text-align:center;color:var(--text-soft);">您沒有匯入權限。<br>請管理員至「系統設定 → 使用者名單 → 可見頁面」把「燈號分析」設為 ON（可編輯）。</div>`;
    return;
  }

  // 並行抓兩個 API
  let lightsErr = null;
  const tasks = [];
  if (!_lightsData) tasks.push(fetchLightsData().catch(e => { lightsErr = e; }));
  if (!_trainingData) tasks.push(fetchTrainingData().catch(() => {}));
  if (tasks.length) await Promise.all(tasks);
  if (lightsErr) {
    c.innerHTML = `${_lightsBackBar()}<div class="card" style="padding:40px;text-align:center;color:var(--red);">載入失敗：${_escH(lightsErr.message || lightsErr)}<br><button class="btn" style="margin-top:14px;" onclick="_renderLightsImportTab()">重試</button></div>`;
    return;
  }

  const todayIso = _isoDate(new Date());
  const dataByTo = {};
  (_lightsData || []).forEach(r => {
    const t = String(r.to || '');
    if (!t) return;
    if (!dataByTo[t]) dataByTo[t] = { from: r.from, to: r.to, isHoliday: false, hasReal: false };
    if (r.name === '__休會__') dataByTo[t].isHoliday = true;
    else dataByTo[t].hasReal = true;
  });

  const months = _getImportMonths();

  // 第一次渲染時自動展開「當月」
  if (_lightsImportOpenMonths === null) {
    _lightsImportOpenMonths = new Set([months[0].monthKey]);
  }

  let totalSlots = 0, uploadedSlots = 0;

  // 先把每月的統計算好（用於 header 顯示）
  const monthsHtml = months.map(m => {
    const isOpen = _lightsImportOpenMonths.has(m.monthKey);
    let monthUploaded = 0, monthTotal = 0, monthFuture = 0;
    m.fridays.forEach(friday => {
      monthTotal++;
      if (friday > todayIso) monthFuture++;
      else if (dataByTo[friday]) monthUploaded++;
    });
    const monthDue = monthTotal - monthFuture;
    totalSlots += monthTotal;
    uploadedSlots += monthUploaded;

    const slotsHtml = !isOpen ? '' : m.fridays.map(friday => {
      const future = friday > todayIso;
      const info = dataByTo[friday];
      const uploaded = !!info;

      let statusText, statusColor, borderColor, btnHtml;
      if (future) {
        statusText = '尚未到期';
        statusColor = '#a0aec0';
        borderColor = '#edf2f7';
        btnHtml = `<span style="padding:6px 14px;background:#edf2f7;border-radius:7px;font-size:12px;color:#a0aec0;flex-shrink:0;">尚未到期</span>`;
      } else if (uploaded) {
        if (info.isHoliday && !info.hasReal) {
          statusText = '✓ 已標記為休會週（無資料）';
          statusColor = '#8e44ad';
          borderColor = '#8e44ad';
        } else {
          statusText = `✓ 已上傳 (${info.from} ~ ${info.to})`;
          statusColor = '#27ae60';
          borderColor = '#27ae60';
        }
        btnHtml = `<button onclick="document.getElementById('lightsFile_${friday}').click()" style="padding:6px 14px;background:white;border:1.5px solid var(--gray-border);border-radius:7px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;color:var(--text-soft);flex-shrink:0;">重新上傳</button>`;
      } else {
        statusText = '尚未上傳';
        statusColor = 'var(--text-soft)';
        borderColor = 'var(--gray-border)';
        btnHtml = `<button onclick="document.getElementById('lightsFile_${friday}').click()" style="padding:6px 14px;background:var(--red);border:1.5px solid var(--red);border-radius:7px;cursor:pointer;font-size:12px;font-weight:700;font-family:inherit;color:white;flex-shrink:0;">上傳</button>`;
      }

      const [, monthNum, dayNum] = friday.split('-');
      const label = `${parseInt(monthNum)}/${parseInt(dayNum)}（週五）`;

      return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:white;border:1.5px solid ${borderColor};border-left:4px solid ${borderColor};border-radius:8px;">
        <div style="font-size:14px;font-weight:700;color:var(--text);width:120px;flex-shrink:0;">${label}</div>
        <div style="flex:1;min-width:0;font-size:12px;color:${statusColor};">${statusText}</div>
        ${btnHtml}
        ${future ? '' : `<input type="file" id="lightsFile_${friday}" accept=".xls,.xml" style="display:none" onchange="_lightsHandleWeekFile(this.files[0], '${friday}')">`}
      </div>`;
    }).join('');

    const monthTag = m.isCurrent
      ? `<span style="font-size:11px;color:#d4ac0d;background:#fef9e7;padding:2px 8px;border-radius:12px;font-weight:700;margin-left:8px;">本月</span>`
      : '';

    // 月份摘要：已上傳 X / 應上傳 Y（應上傳 = 已過週五數）
    const allDone = monthDue > 0 && monthUploaded === monthDue;
    const summaryColor = allDone ? '#27ae60' : monthUploaded > 0 ? '#d4ac0d' : 'var(--text-soft)';
    const summary = `<span style="font-size:12px;color:${summaryColor};font-weight:600;">${allDone ? '✓ ' : ''}${monthUploaded} / ${monthDue} 週已上傳${monthFuture > 0 ? `（${monthFuture} 週未到期）` : ''}</span>`;
    const arrow = isOpen ? '▾' : '▸';

    return `<div style="margin-bottom:12px;border:1.5px solid var(--gray-border);border-radius:10px;overflow:hidden;background:white;">
      <div onclick="_lightsToggleImportMonth('${m.monthKey}')" style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:#fafbfc;cursor:pointer;user-select:none;border-bottom:${isOpen ? '1px solid var(--gray-border)' : '0'};">
        <span style="font-size:14px;color:var(--text-soft);width:14px;">${arrow}</span>
        <span style="font-size:15px;font-weight:700;color:var(--text);">${m.monthLabel}</span>
        ${monthTag}
        <span style="flex:1;"></span>
        ${summary}
      </div>
      ${isOpen ? `<div style="display:flex;flex-direction:column;gap:6px;padding:12px;">${slotsHtml}</div>` : ''}
    </div>`;
  }).join('');

  // 培訓區塊
  const trainCount = (_trainingData || []).length;
  const trainBorder = trainCount > 0 ? '#8e44ad' : 'var(--gray-border)';
  const trainStatus = trainCount > 0
    ? `<span style="font-size:12px;color:#8e44ad;font-weight:600;">✓ ${trainCount} 筆紀錄${_trainingMeta ? `（資料區間 ${_trainingMeta.from} ~ ${_trainingMeta.to}，上次更新 ${_trainingMeta.importTime}）` : ''}</span>`
    : `<span style="font-size:12px;color:var(--text-soft);">尚未上傳</span>`;
  const trainBtn = trainCount > 0
    ? `<button onclick="document.getElementById('lightsFile_training').click()" style="padding:8px 16px;background:white;border:1.5px solid var(--gray-border);border-radius:7px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;color:var(--text-soft);flex-shrink:0;">重新上傳</button>`
    : `<button onclick="document.getElementById('lightsFile_training').click()" style="padding:8px 16px;background:#8e44ad;border:1.5px solid #8e44ad;border-radius:7px;cursor:pointer;font-size:13px;font-weight:700;font-family:inherit;color:white;flex-shrink:0;">上傳培訓</button>`;
  const trainingBlock = `
    <div style="margin-bottom:18px;border:1.5px solid ${trainBorder};border-left:4px solid ${trainBorder};border-radius:10px;padding:14px 16px;background:white;">
      <div style="display:flex;align-items:center;gap:14px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:15px;font-weight:700;color:var(--text);">培訓紀錄（會員培訓報告，整份累計）</div>
          <div style="font-size:12px;color:var(--text-soft);margin-top:2px;">每次上傳會覆蓋整份。培訓分數依活動類型自動換算（MSP 2 分／其他工作坊 4 分）</div>
          <div style="margin-top:6px;">${trainStatus}</div>
        </div>
        ${trainBtn}
        <input type="file" id="lightsFile_training" accept=".xls,.xml" style="display:none" onchange="_lightsHandleTrainingFile(this.files[0])">
      </div>
    </div>`;

  c.innerHTML = `
    ${_lightsBackBar()}
    <div style="font-size:12px;color:var(--text-soft);margin-bottom:14px;line-height:1.6;">
      每週五從 BNI Connect 下載當週的 PALMS，展開月份後點對應週五的「上傳」按鈕匯入。系統會自動依檔案 <code>to</code> 日期歸位，與槽位不符時會跳出確認。
      <br>累計已上傳 <b style="color:var(--text);">${uploadedSlots} / ${totalSlots}</b> 週。
    </div>
    ${trainingBlock}
    ${monthsHtml}`;
}

// 上傳培訓報告（整份覆蓋）
async function _lightsHandleTrainingFile(file) {
  if (!_lightsImportVisible()) { showToast('匯入功能已關閉'); return; }
  if (!file) return;
  if (!/\.(xls|xml)$/i.test(file.name)) {
    showToast('請選擇 .xls 或 .xml 檔案');
    return;
  }
  showLoader(true, '解析中...');
  let parsed;
  try {
    const text = await file.text();
    parsed = _parseTrainingXml(text);
    if (!parsed.rows.length) throw new Error('找不到任何活動紀錄');
    if (!parsed.from || !parsed.to) throw new Error('無法辨識日期區間');
  } catch (e) {
    showLoader(false);
    showToast('解析失敗：' + (e.message || e));
    return;
  }
  showLoader(false);

  // 覆蓋確認
  if ((_trainingData || []).length > 0) {
    if (!confirm(`雲端目前有 ${_trainingData.length} 筆培訓紀錄（${_trainingMeta?.from || '?'} ~ ${_trainingMeta?.to || '?'}）。\n\n確定要覆蓋為新上傳的 ${parsed.rows.length} 筆嗎？\n（培訓報告是累計，新版會完整取代舊版）`)) return;
  }

  showLoader(true, '寫入中...');
  try {
    const res = await fetch(LIGHTS_API_URL, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'addTrainingImport',
        from: parsed.from,
        to: parsed.to,
        importer: (typeof CU !== 'undefined' && CU) ? CU : '',
        rows: parsed.rows
      })
    });
    const json = await res.json();
    if (!json || !json.ok) throw new Error(json?.error || 'API 失敗');
    showToast(`培訓上傳成功（${parsed.rows.length} 筆${json.replaced ? `，覆蓋舊 ${json.replaced} 筆` : ''}）`);
    _trainingData = null;
    _renderLightsImportTab();
  } catch (e) {
    showToast('上傳失敗：' + (e.message || e));
  } finally {
    showLoader(false);
  }
}

function _lightsToggleImportMonth(monthKey) {
  if (!_lightsImportOpenMonths) _lightsImportOpenMonths = new Set();
  if (_lightsImportOpenMonths.has(monthKey)) _lightsImportOpenMonths.delete(monthKey);
  else _lightsImportOpenMonths.add(monthKey);
  _renderLightsImportTab();
}

// 點選某週槽 → 解析檔案 → 驗證 to 是否符合 → 上傳
async function _lightsHandleWeekFile(file, expectedFridayIso) {
  if (!_lightsImportVisible()) { showToast('匯入功能已關閉'); return; }
  if (!file) return;
  if (!/\.(xls|xml)$/i.test(file.name)) {
    showToast('請選擇 .xls 或 .xml 檔案');
    return;
  }
  showLoader(true, '解析中...');
  let parsed;
  try {
    const text = await file.text();
    parsed = _parsePalmsXml(text);
    if (!parsed.from || !parsed.to) throw new Error('無法辨識檔案的日期區間');
  } catch (e) {
    showLoader(false);
    showToast('解析失敗：' + (e.message || e));
    return;
  }
  showLoader(false); // 解析完先關，下面要顯示 confirm

  const isHoliday = !parsed.rows.length;
  const parseIsoDate = (iso) => { const [y,m,d] = iso.split('-').map(Number); return new Date(y, m-1, d); };
  const dayNames = ['日','一','二','三','四','五','六'];

  // 空檔案 → 休會週確認
  if (isHoliday) {
    if (!confirm(`此檔案沒有任何會員資料（可能是休會週）。\n\n仍要標記 ${expectedFridayIso} 為「已匯入」嗎？\n（不會貢獻任何分數計算）`)) return;
    parsed.rows = [{
      name: '__休會__', surname: '__', given: '休會',
      att: 0, abs: 0, late: 0, sick: 0, sub: 0,
      refIn: 0, refOut: 0, refRcvIn: 0, refRcvOut: 0,
      vis: 0, one: 0, amt: 0, train: 0
    }];
  } else {
    // 防呆 1：區間長度太長（>14 天像累計報告）
    const fromD = parseIsoDate(parsed.from);
    const toD = parseIsoDate(parsed.to);
    const days = Math.round((toD - fromD) / 86400000) + 1;
    if (days > 14) {
      if (!confirm(`此檔案區間是 ${parsed.from} ~ ${parsed.to}（${days} 天），看起來像「累計報告」而非單週。\n\n仍要上傳到 ${expectedFridayIso} 嗎？\n⚠️ 會把 ${days} 天的累計數字當成一週存入，導致該週分數爆量。`)) return;
    }

    // 防呆 2：to 不是週五
    const toDay = toD.getDay();
    if (toDay !== 5) {
      if (!confirm(`檔案截止日 ${parsed.to} 是「週${dayNames[toDay]}」，不是週五。\n\n仍要上傳嗎？`)) return;
    }

    // 既有檢查：to ≠ 槽位週五
    if (parsed.to !== expectedFridayIso) {
      if (!confirm(`檔案截止日是 ${parsed.to}，跟所選的 ${expectedFridayIso} 週五不符。\n\n仍要強制上傳到 ${expectedFridayIso} 嗎？\n（建議檔案 to 設成週五，避免日後對位混亂）`)) return;
    }
  }

  // 防呆 3：覆蓋現有資料前確認
  const existingRows = (_lightsData || []).filter(r => String(r.to || '') === expectedFridayIso);
  if (existingRows.length) {
    const wasHoliday = existingRows.every(r => r.name === '__休會__');
    const desc = wasHoliday
      ? '已標記為休會週'
      : `已有上傳資料（${existingRows[0].from} ~ ${existingRows[0].to}，${existingRows.length} 位會員）`;
    if (!confirm(`${expectedFridayIso} 槽${desc}。\n\n確定要覆蓋為新內容嗎？`)) return;
  }

  showLoader(true, '寫入中...');

  // 把 from 補成週五前 6 天，讓雲端資料區間合理（BNI Connect 常給 from=to=週五 單日）
  const fridayDate = new Date(expectedFridayIso + 'T00:00:00');
  const fromAuto = new Date(fridayDate.getTime() - 6 * 86400000);
  const fromAutoIso = _isoDate(fromAuto);

  try {
    const res = await fetch(LIGHTS_API_URL, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'addPalmsImport',
        from: fromAutoIso,        // 強制為週五 - 6 天
        to: expectedFridayIso,    // 統一以週五日期為 to
        rangeType: 'week',
        importer: (typeof CU !== 'undefined' && CU) ? CU : '',
        rows: parsed.rows
      })
    });
    const json = await res.json();
    if (!json || !json.ok) throw new Error(json?.error || 'API 失敗');
    showToast(`${expectedFridayIso} 上傳成功（${parsed.rows.length} 位${json.replaced ? '，覆蓋舊資料' : ''}）`);
    _lightsData = null;
    _renderLightsImportTab();
  } catch (e) {
    showToast('上傳失敗：' + (e.message || e));
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

  // 偵測檔案格式（前 15 列找標籤）
  // 舊版（分會 - PALMS 摘要報告）：「從:」「至:」「姓氏 名字 出席 缺席 ...」共 15 欄
  // 新版（副主席報告）：「月/年:」+ DateTime；標題含「姓氏 名字 續期日期」+ 每週欄位 + 總計欄位（總計在 col 37-45 / 陣列 36-44）
  // 注意：標籤後面的日期 cell 因 MergeAcross 可能不在隔壁，要往後掃直到找到日期格式
  const findNextDate = (row, fromCol) => {
    for (let k = fromCol; k < row.length; k++) {
      const d = String(row[k] || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    }
    return '';
  };
  const findNextNonEmpty = (row, fromCol) => {
    for (let k = fromCol; k < row.length; k++) {
      const v = String(row[k] || '').trim();
      if (v) return v;
    }
    return '';
  };

  let from = '', to = '', chapter = '';
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const row = grid[r];
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c] || '').trim();
      if (v === '從:' || v === '從：') from = findNextDate(row, c + 1);
      else if (v === '至:' || v === '至：') to = findNextDate(row, c + 1);
      else if (v === '分會:' || v === '分會：') chapter = findNextNonEmpty(row, c + 1);
      else if (v === '月/年:' || v === '月/年：') {
        const dStr = findNextDate(row, c + 1);
        if (dStr) {
          from = dStr;
          const [y, mo] = dStr.split('-');
          const last = new Date(parseInt(y), parseInt(mo), 0).getDate();
          to = `${y}-${mo}-${String(last).padStart(2, '0')}`;
        }
      }
    }
  }

  // 找標題列（含「姓氏」）
  let headerRow = -1;
  for (let r = 0; r < grid.length; r++) {
    if ((grid[r][0] || '').trim() === '姓氏') { headerRow = r; break; }
  }
  if (headerRow < 0) throw new Error('找不到「姓氏」標題列');

  // 依「標題名稱 → 陣列索引」做欄位映射，避免 BNI Connect 欄位跳號的問題
  const headerArr = grid[headerRow] || [];
  const colMap = {};
  for (let i = 0; i < headerArr.length; i++) {
    const h = String(headerArr[i] || '').trim();
    if (h && colMap[h] === undefined) colMap[h] = i;  // 只取第一次出現（避免新版有多週重複欄位）
  }
  const col = (name) => {
    const i = colMap[name];
    return (i === undefined) ? -1 : i;
  };
  const getNum = (row, name) => {
    const i = col(name);
    return i < 0 ? 0 : _num(row[i]);
  };
  // 不同 PALMS 格式對「金額」「培訓」欄位的命名不一樣，做相容
  const amtName   = col('交易價值') >= 0 ? '交易價值' : '價值';
  const trainName = col('分會教育單位') >= 0 ? '分會教育單位' : '教育';

  const rows = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r];
    const surname = (row[0] || '').trim();
    const given = (row[1] || '').trim();
    if (!surname) continue;
    if (surname === '來賓' || surname === 'BNI' || surname === '總數' || surname === '價值' || surname === '營運使用者' || surname === '會員') break;
    if (!given) continue;
    rows.push({
      surname, given,
      name:      surname + given,
      att:       getNum(row, '出席'),
      abs:       getNum(row, '缺席'),
      late:      getNum(row, '遲到'),
      sick:      getNum(row, '病假'),
      sub:       getNum(row, '替代人'),
      refIn:     getNum(row, '提供內部引薦'),
      refOut:    getNum(row, '提供外部引薦'),
      refRcvIn:  getNum(row, '收到內部引薦'),
      refRcvOut: getNum(row, '收到外部引薦'),
      vis:       getNum(row, '來賓'),
      one:       getNum(row, '一對一會面'),
      amt:       getNum(row, amtName),
      train:     getNum(row, trainName)
    });
  }

  return { from, to, chapter, rows };
}

function _num(v) {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

// ===== 培訓檔案解析 =====
// 「會員培訓報告」格式：欄位 姓氏(idx3), 名字(idx5), 活動日期(idx6), 活動類型(idx8)
function _parseTrainingXml(text) {
  const ns = 'urn:schemas-microsoft-com:office:spreadsheet';
  let doc;
  try { doc = new DOMParser().parseFromString(text, 'application/xml'); }
  catch (e) { throw new Error('檔案不是有效的 XML'); }
  if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('XML 格式錯誤');

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

  // 找 from / to（與 PALMS 同樣支援 從:/至:、月/年:）
  const findNextDate = (row, fromCol) => {
    for (let k = fromCol; k < row.length; k++) {
      const d = String(row[k] || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    }
    return '';
  };
  let from = '', to = '';
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const row = grid[r];
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c] || '').trim();
      if (v === '從:' || v === '從：') from = findNextDate(row, c + 1);
      else if (v === '至:' || v === '至：') to = findNextDate(row, c + 1);
    }
  }

  // 找標題列
  let headerRow = -1;
  for (let r = 0; r < grid.length; r++) {
    if ((grid[r] || []).some(c => String(c || '').trim() === '姓氏')) { headerRow = r; break; }
  }
  if (headerRow < 0) throw new Error('找不到「姓氏」標題列');

  // 依標題名稱建欄位索引
  const colMap = {};
  (grid[headerRow] || []).forEach((h, i) => {
    const s = String(h || '').trim();
    if (s && colMap[s] === undefined) colMap[s] = i;
  });
  const cSurname = colMap['姓氏'], cGiven = colMap['名字'];
  const cActDate = colMap['活動日期'], cActType = colMap['活動類型'];
  if (cSurname == null || cGiven == null || cActDate == null || cActType == null) {
    throw new Error('培訓報告缺少必要欄位（姓氏 / 名字 / 活動日期 / 活動類型）');
  }

  const rows = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r];
    const surname = String(row[cSurname] || '').trim();
    const given = String(row[cGiven] || '').trim();
    const activityDate = String(row[cActDate] || '').slice(0, 10);
    const activityType = String(row[cActType] || '').trim();
    if (!surname || !given || !activityDate || !activityType) continue;
    const points = _calcTrainingPoints(activityDate, activityType);
    rows.push({
      surname, given,
      name: surname + given,
      activityDate, activityType, points
    });
  }

  return { from, to, rows };
}

// 套使用者定義的培訓計分規則
function _calcTrainingPoints(activityDate, activityType) {
  if (activityType === '會員成功專案') {
    const day = parseInt((activityDate || '').split('-')[2], 10) || 0;
    return day <= 7 ? 2 : 4; // 第一週(1-7號) = MSP 2分；其他週 = 工作坊 4分
  }
  // 領導團隊培訓 / BNI台灣會員大會 / 董事培訓 - Taiwan
  return 4;
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

async function fetchTrainingData() {
  if (!LIGHTS_API_URL) throw new Error('LIGHTS_API_URL 尚未設定');
  const r = await fetch(LIGHTS_API_URL + '?action=listTrainingData&t=' + Date.now());
  const j = await r.json();
  if (!j || !j.ok) throw new Error(j?.error || '載入失敗');
  _trainingData = j.data || [];
  // 取最近一次匯入的元資料（任一列的 importTime/from/to 即可，因為整份是同一次寫入）
  if (_trainingData.length) {
    const r0 = _trainingData[0];
    _trainingMeta = { importTime: r0.importTime || '', from: r0.from, to: r0.to };
  } else {
    _trainingMeta = null;
  }
  return _trainingData;
}

// 把培訓資料聚合成「每位會員的 train 分數 + 堂數」，依日期窗口篩選
function _aggregateTraining(trainingRows, monthKeys) {
  const set = new Set(monthKeys);
  const map = {};
  (trainingRows || []).forEach(t => {
    const monthKey = String(t.activityDate || '').substring(0, 7);
    if (!set.has(monthKey)) return;
    const name = String(t.name || '').trim();
    if (!name) return;
    if (!map[name]) map[name] = { points: 0, count: 0 };
    map[name].points += (Number(t.points) || 0);
    map[name].count += 1;
  });
  return map;
}

// ===== 紅綠燈計算 =====
// 把多筆 row（同一段期間）按 name 加總，weeks 用區間長度算
function _aggregateMembers(rows) {
  const map = {};
  rows.forEach(r => {
    const key = (r.name || '').trim();
    if (!key) return;
    if (key === '__休會__') return; // 休會週 marker，不在這層加總
    if (!map[key]) {
      map[key] = {
        name: key, weeks: 0,
        att: 0, abs: 0, late: 0, sick: 0, sub: 0,
        refIn: 0, refOut: 0, refRcvIn: 0, refRcvOut: 0,
        vis: 0, one: 0, amt: 0, train: 0
      };
    }
    let w = 0;
    if (r.rangeType === 'week') {
      // 單週上傳一律算 1 週（BNI Connect 給的單週檔常 from=to 為週五單日，硬算 days/7 會變 0.14）
      w = 1;
    } else {
      const f = new Date(r.from), t = new Date(r.to);
      if (!isNaN(f.getTime()) && !isNaN(t.getTime())) {
        w = ((t - f) / 86400000 + 1) / 7;
        if (w < 0) w = 0;
      }
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
// 排序比較函式（對齊 BNI 官方規則）：
// 1. 總分 DESC
// 2. 來賓「人數」DESC
// 3. 缺席 ASC（越少越前）
// 4. 遲到 ASC
// 5. 替代人 ASC
// 6. 培訓累計 DESC
// 7. 金額 DESC
// 8. 姓名拼音 ASC（fallback）
// 切換卡牌展開狀態
function _lightsScoreToggleCard(name) {
  if (_lightsScoreExpanded.has(name)) _lightsScoreExpanded.delete(name);
  else _lightsScoreExpanded.add(name);
  _renderLightsScoreTab();
}
function _lightsPredictToggleCard(name) {
  if (_lightsPredictExpanded.has(name)) _lightsPredictExpanded.delete(name);
  else _lightsPredictExpanded.add(name);
  _renderLightsPredictTab();
}

// 判斷會員培訓紀錄是否超過 2 個月沒更新（含完全沒紀錄）
function _isTrainingStale(memberName) {
  if (!_trainingData || !_trainingData.length) return false; // 沒匯入培訓報告就不警示
  const dates = _trainingData
    .filter(t => t.name === memberName)
    .map(t => String(t.activityDate || ''))
    .filter(d => d);
  if (!dates.length) return true; // 完全沒紀錄
  const latest = dates.sort().pop();
  const [y, m, d] = latest.split('-').map(Number);
  const lastD = new Date(y, m - 1, d);
  const today = new Date();
  const days = (today - lastD) / 86400000;
  return days > 60;
}

// 列出某會員在指定月份窗口內的培訓活動紀錄
function _trainingRecordsHtml(memberName, monthKeys) {
  if (!_trainingData || !_trainingData.length) {
    return `<div style="margin-top:10px;font-size:11px;color:var(--text-soft);text-align:center;">尚未匯入培訓報告</div>`;
  }
  const set = new Set(monthKeys);
  const rows = _trainingData
    .filter(t => t.name === memberName && set.has(String(t.activityDate || '').substring(0, 7)))
    .sort((a, b) => String(b.activityDate).localeCompare(String(a.activityDate)));
  if (!rows.length) {
    return `<div style="margin-top:10px;font-size:11px;color:var(--text-soft);text-align:center;">本期間無培訓紀錄</div>`;
  }
  const totalPts = rows.reduce((s, r) => s + (Number(r.points) || 0), 0);
  return `<div style="margin-top:12px;padding-top:10px;border-top:1px dashed var(--gray-border);">
    <div style="font-size:11px;font-weight:700;color:var(--text-soft);margin-bottom:8px;">培訓報告紀錄（${rows.length} 堂 / ${totalPts} 分）</div>
    ${rows.map(r => `<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:5px 8px;background:white;border-radius:4px;margin-bottom:3px;">
      <span style="color:var(--text);font-weight:600;width:90px;">${_escH(r.activityDate)}</span>
      <span style="flex:1;color:var(--text-soft);">${_escH(r.activityType)}</span>
      <span style="color:#27ae60;font-weight:700;">+${r.points} 分</span>
    </div>`).join('')}
  </div>`;
}

function _lightsCompare(a, b, skipTotal) {
  if (!skipTotal && b.total !== a.total) return b.total - a.total;
  if ((b.vis || 0) !== (a.vis || 0)) return (b.vis || 0) - (a.vis || 0);
  if ((a.abs || 0) !== (b.abs || 0)) return (a.abs || 0) - (b.abs || 0);
  if ((a.late || 0) !== (b.late || 0)) return (a.late || 0) - (b.late || 0);
  if ((a.sub || 0) !== (b.sub || 0)) return (a.sub || 0) - (b.sub || 0);
  if ((b.train || 0) !== (a.train || 0)) return (b.train || 0) - (a.train || 0);
  if ((b.amt || 0) !== (a.amt || 0)) return (b.amt || 0) - (a.amt || 0);
  return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-u-co-pinyin');
}

function _calcLightScore(d) {
  const cfg = LIGHTS_CFG;
  const w = d.weeks || 0;
  const ref = d.refIn + d.refOut;
  if (w <= 0) {
    return { total: 0, light: '黑燈', sRef: 0, sVis: 0, sOne: 0, sTrain: 0, sAmt: 0, sAbs: 0, ref: ref };
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
  const light  = total >= ll[0] ? '綠燈' : total >= ll[1] ? '黃燈' : total >= ll[2] ? '紅燈' : '黑燈';
  return { sRef, sVis, sOne, sTrain, sAmt, sAbs, total, light, ref };
}

function _lightBgColor(light) {
  return light === '綠燈' ? '#d9ead3'
       : light === '黃燈' ? '#fff2cc'
       : light === '紅燈' ? '#f4cccc'
       :                    '#d6dbe0'; // 黑燈背景
}

async function _renderLightsScoreTab() {
  const c = document.getElementById('lightsContentInner');
  if (!c) return;

  // 三個 API 並行抓
  let lightsErr = null;
  const tasks = [];
  if (!_lightsData) tasks.push(fetchLightsData().catch(e => { lightsErr = e; }));
  if (!_trainingData) tasks.push(fetchTrainingData().catch(() => {}));
  if (!_memberData) tasks.push(fetchMembers().catch(() => {}));
  if (tasks.length) await Promise.all(tasks);
  if (lightsErr) {
    c.innerHTML = `<div class="card" style="padding:40px;text-align:center;color:var(--red);">載入失敗：${_escH(lightsErr.message || lightsErr)}<br><button class="btn" style="margin-top:14px;" onclick="_lightsData=null;_renderLightsScoreTab()">重試</button></div>`;
    return;
  }

  // 取「過去 6 個完整月」內所有週的 rows，聚合
  const months = _completedMonthWindow();
  const recent = _rowsInMonths(_lightsData, months);
  if (!recent.length) {
    c.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
        <h2 style="font-size:18px;font-weight:700;color:var(--red);margin:0;">上個月紅綠燈</h2>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button onclick="_lightsSwitch('predict')" style="padding:7px 14px;background:white;border:1.5px solid var(--gray-border);border-radius:7px;cursor:pointer;font-size:13px;font-family:inherit;color:var(--text-soft);">預測</button>
          ${_lightsImportBtn(true)}
        </div>
      </div>
      <div class="card" style="padding:40px;text-align:center;color:var(--text-soft);">
        ${months[0]} ~ ${months[months.length-1]} 範圍內尚無匯入資料。<br>請點擊上方「匯入」按鈕上傳對應週的 PALMS。
      </div>`;
    return;
  }

  const grouped = _aggregateMembers(recent);
  // 培訓分數用 PALMS「分會教育單位」算（跟官方對齊）；培訓報告資料保留供卡牌參考
  const trainByName = _aggregateTraining(_trainingData, months);
  const list = Object.values(grouped).map(d => {
    const t = trainByName[d.name] || { points: 0, count: 0 };
    d.trainReportPoints = t.points;
    d.trainReportCount = t.count;
    // d.train 保持 PALMS 分會教育單位累計值
    const s = _calcLightScore(d);
    return { ...d, ...s };
  });
  // 標記新會員（週數 < 該窗口最大週數 = 未滿 6 個月）
  const maxWeeks = Math.max(0, ...list.map(x => x.weeks || 0));
  list.forEach(x => { x.isNew = (x.weeks || 0) < maxWeeks; });
  list.sort((a, b) => _lightsCompare(a, b));

  const lightCounts = { '綠燈': 0, '黃燈': 0, '紅燈': 0, '黑燈': 0 };
  list.forEach(x => lightCounts[x.light]++);
  const totalMembers = list.length;
  const ratio = totalMembers > 0 ? Math.round(((lightCounts['綠燈'] + lightCounts['黃燈']) / totalMembers) * 100) : 0;

  const uniqueWeeks = [...new Set(recent.map(r => r.to))];
  const dataWeeks = list[0]?.weeks?.toFixed(1) || '0';
  const dateRange = `${months[0]} ~ ${months[months.length-1]} · 已匯入 ${uniqueWeeks.length} 週 · ${dataWeeks} 週累計`;

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
    ${statCard('黑燈', '黑燈',   lightCounts['黑燈'], '#2c3e50', '#d6dbe0')}
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
      <h2 style="font-size:18px;font-weight:700;color:var(--red);margin:0;">上個月紅綠燈</h2>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <button onclick="_lightsSwitch('predict')" style="padding:7px 14px;background:white;border:1.5px solid var(--gray-border);border-radius:7px;cursor:pointer;font-size:13px;font-family:inherit;color:var(--text-soft);">預測</button>
        ${_lightsImportBtn(false)}
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
                    : '#2c3e50';
  const _ds = [s.name, specialty].filter(Boolean).join(' ').toLowerCase();

  // 六項指標（左：滿分配置；右：實際得分 / 原始值）
  const items = [
    { label: '出席', score: s.sAbs,   max: 20, raw: `缺${s.abs}` },
    { label: '引薦', score: s.sRef,   max: 20, raw: `${s.ref}筆` },
    { label: '121',  score: s.sOne,   max: 15, raw: `${s.one}次` },
    { label: '培訓', score: s.sTrain, max: 15, raw: `${s.train}` },
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

  const isExpanded = _lightsScoreExpanded.has(s.name);
  const arrow = isExpanded ? '▾' : '▸';
  const trainingHtml = isExpanded ? _trainingRecordsHtml(s.name, _completedMonthWindow()) : '';
  const bodyHtml = isExpanded ? `<div style="padding:12px 14px 14px;background:#fafbfc;border-top:1px solid var(--gray-border);">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px 14px;">${itemsHtml}</div>
      ${trainingHtml}
    </div>` : '';
  const warnings = [];
  if (s.isNew) warnings.push('未滿 6 個月');
  if (_isTrainingStale(s.name)) warnings.push('培訓 2 月未更新');
  const warningsInline = warnings.length
    ? `<span style="font-size:11px;color:var(--text-soft);font-weight:400;margin-left:4px;">· ${warnings.join(' · ')}</span>`
    : '';

  return `<div class="member-card lights-score-card" data-search="${_escH(_ds)}" style="flex-direction:column;gap:0;padding:0;overflow:hidden;align-items:stretch;justify-content:flex-start;">
    <div onclick="_lightsScoreToggleCard('${_escH(s.name)}')" style="display:flex;align-items:center;gap:12px;padding:14px 14px 12px;border-left:4px solid ${lightColor};cursor:pointer;user-select:none;">
      <div style="font-size:18px;font-weight:900;color:#cbd5e0;width:24px;text-align:center;flex-shrink:0;">${idx+1}</div>
      ${photo
        ? `<img src="${_escH(photo)}" loading="lazy" decoding="async" style="width:48px;height:48px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid ${lightColor};" onerror="this.style.display='none'">`
        : `<div style="width:48px;height:48px;border-radius:50%;flex-shrink:0;background:#e8ecf0;border:2px solid ${lightColor};display:flex;align-items:center;justify-content:center;color:#bbb;font-size:18px;font-weight:900;">${_escH((s.name || '?').slice(0,1))}</div>`}
      <div style="flex:1;min-width:0;">
        <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:2px;">${_escH(s.name)} <span style="color:var(--text-soft);font-size:13px;font-weight:400;">${arrow}</span>${warningsInline}</div>
        <div style="font-size:12px;color:var(--text-soft);line-height:1.4;">${_escH(specialty || '—')}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0;">
        <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:${lightBg};color:${lightColor};white-space:nowrap;">${s.light}</span>
        <div style="font-size:22px;font-weight:900;color:${lightColor};line-height:1;">${s.total}<span style="font-size:11px;color:var(--text-soft);font-weight:600;"> 分</span></div>
      </div>
    </div>
    ${bodyHtml}
  </div>`;
}

// ===== 預測紅綠燈 =====
async function _renderLightsPredictTab() {
  const c = document.getElementById('lightsContentInner');
  if (!c) return;

  // 三個 API 並行抓
  let lightsErr = null;
  const tasks = [];
  if (!_lightsData) tasks.push(fetchLightsData().catch(e => { lightsErr = e; }));
  if (!_trainingData) tasks.push(fetchTrainingData().catch(() => {}));
  if (!_memberData) tasks.push(fetchMembers().catch(() => {}));
  if (tasks.length) await Promise.all(tasks);
  if (lightsErr) {
    c.innerHTML = `<div class="card" style="padding:40px;text-align:center;color:var(--red);">載入失敗：${_escH(lightsErr.message || lightsErr)}<br><button class="btn" style="margin-top:14px;" onclick="_lightsData=null;_renderLightsPredictTab()">重試</button></div>`;
    return;
  }

  // 「左邊上個月」用 6 個完整月窗口；「右邊預測」用滾動 6 個月含當月 + 自動剩餘週數
  const lastMonths = _completedMonthWindow();
  const predictMonths = _predictMonthWindow();
  const lastRows = _rowsInMonths(_lightsData, lastMonths);
  const predictRows = _rowsInMonths(_lightsData, predictMonths);
  if (!predictRows.length) {
    c.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
        <h2 style="font-size:18px;font-weight:700;color:var(--red);margin:0;">預測紅綠燈</h2>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          ${_lightsImportBtn(true)}
          <button onclick="_lightsSwitch('score')" style="padding:7px 14px;background:white;border:1.5px solid var(--gray-border);border-radius:7px;cursor:pointer;font-size:13px;font-family:inherit;color:var(--text-soft);">← 返回上個月</button>
        </div>
      </div>
      <div class="card" style="padding:40px;text-align:center;color:var(--text-soft);">${predictMonths[0]} ~ ${predictMonths[predictMonths.length-1]} 範圍內尚無匯入資料。<br>請點擊上方「匯入」按鈕上傳對應週的 PALMS。</div>`;
    return;
  }

  const remainW = _remainingFridaysInMonth(); // 自動算本月剩餘週五
  const lastGrouped = _aggregateMembers(lastRows);
  const predictGrouped = _aggregateMembers(predictRows);
  // 培訓資料雙窗口聚合
  const lastTrainByName = _aggregateTraining(_trainingData, lastMonths);
  const predTrainByName = _aggregateTraining(_trainingData, predictMonths);

  // 整理所有會員（以「預測窗口」為主，因為含當月）
  const list = Object.values(predictGrouped).map(d => {
    const lt = lastTrainByName[d.name] || { points: 0, count: 0 };
    const pt = predTrainByName[d.name] || { points: 0, count: 0 };
    d.trainReportPoints = pt.points;
    d.trainReportCount = pt.count;

    // 上個月燈號：從 lastGrouped 取，計算分數
    const lastD = lastGrouped[d.name];
    const last = lastD
      ? (function() {
          lastD.train = lastD.train || 0; // 已經是 PALMS 累計
          return _calcLightScore(lastD);
        })()
      : { total: 0, light: '黑燈', sRef: 0, sVis: 0, sOne: 0, sTrain: 0, sAmt: 0, sAbs: 0, ref: 0 };

    // 預測燈號：滾動窗口 + 剩餘週數外推
    const futureWeeks = (d.weeks || 0) + remainW;
    const factor = (d.weeks || 0) > 0 ? futureWeeks / d.weeks : 1;
    const pred = _calcLightScore({
      weeks:  futureWeeks,
      refIn:  Math.round(d.refIn * factor),
      refOut: Math.round(d.refOut * factor),
      vis:    Math.round(d.vis * factor),
      one:    Math.round(d.one * factor),
      amt:    Math.round(d.amt * factor),
      train:  d.train,  // 培訓不外推
      abs:    d.abs
    });
    return { ...d, last, pred, futureWeeks, lastWeeks: lastD?.weeks || 0 };
  });
  // 標記新會員：用「上個月窗口」週數判定（< 該窗口最大週數）
  const maxLastWeeks = Math.max(0, ...list.map(x => x.lastWeeks || 0));
  list.forEach(x => { x.isNew = (x.lastWeeks || 0) < maxLastWeeks; });
  // 預測頁先比 pred.total，再用相同 tiebreaker 規則比 raw 數值
  list.sort((a, b) => {
    if (b.pred.total !== a.pred.total) return b.pred.total - a.pred.total;
    return _lightsCompare(a, b, true);
  });

  const lightCounts = { '綠燈': 0, '黃燈': 0, '紅燈': 0, '黑燈': 0 };
  list.forEach(x => lightCounts[x.pred.light]++);
  const totalMembers = list.length;
  const ratio = totalMembers > 0 ? Math.round(((lightCounts['綠燈'] + lightCounts['黃燈']) / totalMembers) * 100) : 0;
  const uniqueWeeks = [...new Set(predictRows.map(r => r.to))];

  const statCard = (id, label, count, color, bg) => {
    const active = _lightsPredictFilter === id;
    const activeStyle = active ? `background:${color};box-shadow:0 4px 12px ${color}55;transform:translateY(-1px);` : `background:${bg};`;
    const textColor = active ? '#fff' : '#2d3748';
    return `<div onclick="_lightsPredictFilter='${id}';_renderLightsPredictTab()" style="${activeStyle}border-radius:10px;padding:14px 10px;display:flex;flex-direction:column;gap:4px;cursor:pointer;transition:all .15s;user-select:none;">
      <div style="font-size:11px;color:${textColor};font-weight:700;letter-spacing:1px;">${label}</div>
      <div style="font-size:24px;color:${textColor};font-weight:900;line-height:1;">${count}</div>
      <div style="font-size:10px;color:${textColor};opacity:${active ? '.9' : '.7'};">位會員</div>
    </div>`;
  };

  const statHtml = `<div class="renewal-stats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px;">
    ${statCard('綠燈', '綠燈', lightCounts['綠燈'], '#27ae60', '#d9ead3')}
    ${statCard('黃燈', '黃燈', lightCounts['黃燈'], '#d4ac0d', '#fff2cc')}
    ${statCard('紅燈', '紅燈', lightCounts['紅燈'], '#c0392b', '#f4cccc')}
    ${statCard('黑燈', '黑燈', lightCounts['黑燈'], '#2c3e50', '#d6dbe0')}
  </div>`;

  const q = (_lightsPredictSearch || '').trim().toLowerCase();
  const filtered = list.filter(s => {
    if (s.pred.light !== _lightsPredictFilter) return false;
    if (q && !s.name.toLowerCase().includes(q)) return false;
    return true;
  });
  const cardsHtml = filtered.map((s, i) => _lightsPredictCard(s, i)).join('');
  const emptyHtml = filtered.length === 0
    ? `<div style="text-align:center;padding:48px 20px;color:var(--text-soft);">查無符合條件的會員</div>`
    : '';

  c.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
      <h2 style="font-size:18px;font-weight:700;color:var(--red);margin:0;">預測紅綠燈</h2>
      <button onclick="_lightsSwitch('score')" style="padding:7px 14px;background:white;border:1.5px solid var(--gray-border);border-radius:7px;cursor:pointer;font-size:13px;font-family:inherit;color:var(--text-soft);">← 返回上個月</button>
    </div>

    <div style="font-size:12px;color:var(--text-soft);margin-bottom:14px;">${predictMonths[0]} ~ ${predictMonths[predictMonths.length-1]} · 已匯入 ${uniqueWeeks.length} 週 · 本月剩餘 <b>${remainW}</b> 週（自動算）· 預測到月底約 ${(list[0]?.futureWeeks || 0).toFixed(1)} 週 · ${totalMembers} 位 · 預測綠黃燈比例 <b style="color:var(--red);">${ratio}%</b></div>

    ${statHtml}

    <input class="member-search" type="text" placeholder="搜尋會員姓名..." value="${_escH(_lightsPredictSearch)}" oninput="_lightsPredictSearch=this.value;_lightsPredictFilterCards()" autocomplete="off" style="margin-bottom:12px;">

    <div id="lightsPredictList" class="member-grid">
      ${cardsHtml}
      ${emptyHtml}
    </div>`;
}

function _lightsPredictFilterCards() {
  const q = (_lightsPredictSearch || '').trim().toLowerCase();
  document.querySelectorAll('#lightsPredictList .lights-predict-card').forEach(c => {
    const match = !q || (c.dataset.search || '').includes(q);
    c.style.display = match ? '' : 'none';
  });
}

// 預測卡：顯示「目前 → 預測」+「達綠燈還需多少」
function _lightsPredictCard(s, idx) {
  const mem = (_memberData || []).find(m => m.name === s.name);
  const photo = mem?.photo || '';
  const specialty = mem?.specialty || '';
  const lightColorOf = l => l === '綠燈' ? '#27ae60' : l === '黃燈' ? '#d4ac0d' : l === '紅燈' ? '#c0392b' : '#2c3e50';
  const lastColor = lightColorOf(s.last.light);
  const predColor = lightColorOf(s.pred.light);
  const predBg = _lightBgColor(s.pred.light);
  const _ds = [s.name, specialty].filter(Boolean).join(' ').toLowerCase();

  // 達綠燈門檻 (用預測週數計算，數據用「滾動窗口」目前累計)
  const fw = s.futureWeeks;
  const needRefGreen   = Math.max(0, Math.ceil(LIGHTS_CFG.refScore[0] * fw) - s.ref);
  const needVisGreen   = Math.max(0, Math.ceil(LIGHTS_CFG.visScore[0] * fw) - s.vis);
  const needOneGreen   = Math.max(0, Math.ceil(LIGHTS_CFG.oneScore[0] * fw) - s.one);
  const needTrainGreen = Math.max(0, LIGHTS_CFG.trainScore[0] - s.train);
  const needAmtGreen   = Math.max(0, LIGHTS_CFG.amtScore[0] - s.amt);

  const items = [
    { label: '引薦', cur: s.ref,   need: needRefGreen,   unit: '筆' },
    { label: '來賓', cur: s.vis,   need: needVisGreen,   unit: '位' },
    { label: '121',  cur: s.one,   need: needOneGreen,   unit: '次' },
    { label: '培訓', cur: s.train, need: needTrainGreen, unit: '分' },
    { label: '金額', cur: `${(s.amt/10000).toFixed(0)}萬`, need: needAmtGreen ? `${(needAmtGreen/10000).toFixed(0)}萬` : 0, unit: '' },
    { label: '出席', cur: `缺${s.abs}`, need: 0, unit: '' }
  ];
  const itemsHtml = items.map(it => {
    const done = !it.need || it.need === 0;
    const tagBg = done ? '#d9ead3' : '#fef9e7';
    const tagColor = done ? '#27ae60' : '#d4ac0d';
    const tagText = done ? '已達綠燈' : `還需 ${it.need}${it.unit}`;
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:white;border:1px solid var(--gray-border);border-radius:6px;font-size:12px;">
      <span style="color:var(--text);font-weight:700;">${it.label}</span>
      <span style="color:var(--text-soft);font-weight:600;">${it.cur}</span>
      <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:${tagBg};color:${tagColor};">${tagText}</span>
    </div>`;
  }).join('');

  const isExpanded = _lightsPredictExpanded.has(s.name);
  const arrow = isExpanded ? '▾' : '▸';
  const trainingHtml = isExpanded ? _trainingRecordsHtml(s.name, _predictMonthWindow()) : '';
  const bodyHtml = isExpanded ? `<div style="padding:10px 14px 14px;background:#fafbfc;border-top:1px solid var(--gray-border);">
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">${itemsHtml}</div>
      ${trainingHtml}
    </div>` : '';
  const warnings = [];
  if (s.isNew) warnings.push('未滿 6 個月');
  if (_isTrainingStale(s.name)) warnings.push('培訓 2 月未更新');
  const warningsInline = warnings.length
    ? `<span style="font-size:11px;color:var(--text-soft);font-weight:400;margin-left:4px;">· ${warnings.join(' · ')}</span>`
    : '';

  return `<div class="member-card lights-predict-card" data-search="${_escH(_ds)}" style="flex-direction:column;gap:0;padding:0;overflow:hidden;align-items:stretch;justify-content:flex-start;">
    <div onclick="_lightsPredictToggleCard('${_escH(s.name)}')" style="display:flex;align-items:center;gap:12px;padding:14px 14px 12px;border-left:4px solid ${predColor};cursor:pointer;user-select:none;">
      <div style="font-size:18px;font-weight:900;color:#cbd5e0;width:24px;text-align:center;flex-shrink:0;">${idx+1}</div>
      ${photo
        ? `<img src="${_escH(photo)}" loading="lazy" decoding="async" style="width:48px;height:48px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid ${predColor};" onerror="this.style.display='none'">`
        : `<div style="width:48px;height:48px;border-radius:50%;flex-shrink:0;background:#e8ecf0;border:2px solid ${predColor};display:flex;align-items:center;justify-content:center;color:#bbb;font-size:18px;font-weight:900;">${_escH((s.name || '?').slice(0,1))}</div>`}
      <div style="flex:1;min-width:0;">
        <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:2px;">${_escH(s.name)} <span style="color:var(--text-soft);font-size:13px;font-weight:400;">${arrow}</span>${warningsInline}</div>
        <div style="font-size:12px;color:var(--text-soft);line-height:1.4;">${_escH(specialty || '—')}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0;">
        <span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;background:${predBg};color:${predColor};white-space:nowrap;">
          <span style="color:${lastColor};">${s.last.light}</span> <span style="color:#999;">→</span> <span style="color:${predColor};">${s.pred.light}</span>
        </span>
        <div style="display:flex;align-items:baseline;gap:6px;line-height:1;">
          <div style="font-size:18px;font-weight:900;color:${lastColor};">${s.last.total}</div>
          <span style="font-size:12px;color:#999;font-weight:700;">→</span>
          <div style="font-size:20px;font-weight:900;color:${predColor};">${s.pred.total}</div>
        </div>
        <div style="font-size:10px;color:var(--text-soft);">上個月 → 預測</div>
      </div>
    </div>
    ${bodyHtml}
  </div>`;
}

// ===== 動能觀測（獨立分頁）=====
// 簡易 SVG sparkline
function _sparkSvg(data, color) {
  if (!data || !data.length) return '';
  const w = 200, h = 32;
  const max = Math.max(1, ...data);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1 || 1)) * w;
    const y = h - (v / max) * (h - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

async function renderMomentum() {
  const c = document.getElementById('momentumContent');
  if (!c) return;
  c.innerHTML = `<div style="min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;"><div class="loader-spinner"></div><div style="font-size:13px;color:var(--text-soft);">載入中...</div></div>`;

  let lightsErr = null;
  const tasks = [];
  if (!_lightsData) tasks.push(fetchLightsData().catch(e => { lightsErr = e; }));
  if (!_memberData) tasks.push(fetchMembers().catch(() => {}));
  if (tasks.length) await Promise.all(tasks);
  if (lightsErr) {
    c.innerHTML = `<div class="card" style="padding:40px;text-align:center;color:var(--red);">載入失敗：${_escH(lightsErr.message || lightsErr)}</div>`;
    return;
  }

  // 取所有「single week」資料（rangeType='week' 且排除休會 marker）的 to 日期，取最近 24 個
  const weekRows = (_lightsData || []).filter(r => r.rangeType === 'week' && r.name !== '__休會__');
  const allTos = [...new Set(weekRows.map(r => r.to))].sort();
  if (allTos.length === 0) {
    c.innerHTML = `<div class="card" style="padding:40px;text-align:center;color:var(--text-soft);">尚無單週匯入資料。</div>`;
    return;
  }
  const last24 = allTos.slice(-24);
  const recent4 = last24.slice(-4);
  const history20 = last24.slice(0, last24.length - 4);

  // 建立每位會員每週的活動值（加權公式）
  // total = 來賓×4 + 外引×3 + 內引×2 + 121×1 + 培訓×1 + 金額/10萬 − 缺席×3 − 遲到×1
  const mapAct = {};
  weekRows.forEach(r => {
    if (!last24.includes(r.to)) return;
    const name = (r.name || '').trim();
    if (!name) return;
    if (!mapAct[name]) mapAct[name] = { dates: {} };
    const refIn  = Number(r.refIn)  || 0;
    const refOut = Number(r.refOut) || 0;
    const refG   = refIn + refOut;
    const vis    = Number(r.vis)    || 0;
    const one    = Number(r.one)    || 0;
    const train  = Number(r.train)  || 0;
    const amt    = Number(r.amt)    || 0;
    const abs    = Number(r.abs)    || 0;
    const late   = Number(r.late)   || 0;
    const att    = Number(r.att)    || 0;
    const total  = vis*4 + refOut*3 + refIn*2 + one + train + amt/100000 - abs*3 - late;
    mapAct[name].dates[r.to] = { total, refG, vis, one, train, att };
  });

  // chapterAvg = 所有 member-week 的 total 平均值（滾動）
  const allTotals = [];
  Object.values(mapAct).forEach(act => {
    Object.values(act.dates).forEach(d => allTotals.push(d.total));
  });
  const chapterAvg = allTotals.length ? allTotals.reduce((a,b) => a+b, 0) / allTotals.length : 0;

  // 每位會員的動能分析
  const list = Object.keys(mapAct).map(name => {
    const act = mapAct[name];
    let rSum=0, hSum=0;
    let rRef=0, rOne=0, rTrain=0, rVis=0, rAtt=0;
    let hRef=0, hOne=0, hTrain=0, hVis=0, hAtt=0;
    let rW=0, hW=0;
    recent4.forEach(t => {
      const d = act.dates[t]; if (!d) return;
      rSum += d.total; rRef += d.refG; rOne += d.one; rTrain += d.train; rVis += d.vis; rAtt += d.att; rW++;
    });
    history20.forEach(t => {
      const d = act.dates[t]; if (!d) return;
      hSum += d.total; hRef += d.refG; hOne += d.one; hTrain += d.train; hVis += d.vis; hAtt += d.att; hW++;
    });
    const rAvg = rW ? rSum / rW : 0;
    const hAvg = hW ? hSum / hW : 0;

    // 狀態判斷（順序很關鍵：嚴重衰退要比動能下滑先判，否則永遠 reach 不到）
    let status = '穩定', color = '#7f8c8d';
    if (rAvg >= hAvg * 1.5 && rAvg > chapterAvg) {
      status = '動能爆發'; color = '#27ae60';
    } else if (rAvg <= hAvg * 0.4 && rAvg < chapterAvg) {
      status = '嚴重衰退'; color = '#c0392b';
    } else if (rAvg <= hAvg * 0.7 && rAvg < chapterAvg) {
      status = '動能下滑'; color = '#e67e22';
    } else if (rAvg <= hAvg * 0.7 && rAvg >= chapterAvg) {
      status = '回到正常值'; color = '#3498db';
    }

    const diffs = {
      att:   (rW ? rAtt/rW : 0)   - (hW ? hAtt/hW : 0),
      train: (rW ? rTrain/rW : 0) - (hW ? hTrain/hW : 0),
      one:   (rW ? rOne/rW : 0)   - (hW ? hOne/hW : 0),
      vis:   (rW ? rVis/rW : 0)   - (hW ? hVis/hW : 0),
      ref:   (rW ? rRef/rW : 0)   - (hW ? hRef/hW : 0)
    };
    const sparkData = last24.map(t => act.dates[t] ? act.dates[t].total : 0);
    return { name, status, color, rAvg, hAvg, diffs, sparkData };
  });

  // 排序：近4週均高 → 前
  list.sort((a, b) => b.rAvg - a.rAvg);

  // 渲染
  const fmtDiff = n => {
    const s = (n >= 0 ? '+' : '') + n.toFixed(1);
    const col = n > 0.01 ? '#27ae60' : n < -0.01 ? '#c0392b' : '#999';
    return `<span style="color:${col};font-weight:700;">${s}</span>`;
  };
  // 統計
  const counts = { '動能爆發': 0, '回到正常值': 0, '動能下滑': 0, '嚴重衰退': 0, '穩定': 0 };
  list.forEach(m => { counts[m.status] = (counts[m.status] || 0) + 1; });

  // 第一次進來自動選首個有資料的狀態（優先序：爆發→下滑→衰退→回正→穩定）
  if (_momentumFilter === null) {
    const order = ['動能爆發', '動能下滑', '嚴重衰退', '回到正常值', '穩定'];
    _momentumFilter = order.find(s => counts[s] > 0) || '穩定';
  }

  // 依當前篩選過濾卡牌
  const filtered = list.filter(m => m.status === _momentumFilter);
  const filteredCardsHtml = filtered.length
    ? filtered.map((m, idx) => {
        // 重新依 filtered 計算 idx
        const mem = (_memberData || []).find(x => x.name === m.name);
        const photo = mem?.photo || '';
        const specialty = mem?.specialty || '';
        return `<div class="member-card" style="flex-direction:column;gap:0;padding:0;overflow:hidden;align-items:stretch;justify-content:flex-start;border-left:4px solid ${m.color};">
          <div style="display:flex;align-items:center;gap:12px;padding:14px 14px 10px;">
            <div style="font-size:18px;font-weight:900;color:#cbd5e0;width:24px;text-align:center;flex-shrink:0;">${idx+1}</div>
            ${photo
              ? `<img src="${_escH(photo)}" loading="lazy" decoding="async" style="width:42px;height:42px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid ${m.color};" onerror="this.style.display='none'">`
              : `<div style="width:42px;height:42px;border-radius:50%;flex-shrink:0;background:#e8ecf0;border:2px solid ${m.color};display:flex;align-items:center;justify-content:center;color:#bbb;font-weight:900;">${_escH((m.name || '?').slice(0,1))}</div>`}
            <div style="flex:1;min-width:0;">
              <div style="font-size:15px;font-weight:700;color:var(--text);">${_escH(m.name)}</div>
              <div style="font-size:11px;color:var(--text-soft);">${_escH(specialty || '—')}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:14px;padding:0 14px 10px;">
            <div style="flex:1;">${_sparkSvg(m.sparkData, m.color)}</div>
            <div style="font-size:11px;color:var(--text-soft);white-space:nowrap;">歷史均 <b style="color:var(--text);">${m.hAvg.toFixed(1)}</b> → 近4週 <b style="color:${m.color};">${m.rAvg.toFixed(1)}</b></div>
          </div>
          <div style="padding:8px 14px 12px;background:#fafbfc;border-top:1px solid var(--gray-border);display:grid;grid-template-columns:repeat(5,1fr);gap:6px;font-size:11px;">
            <div style="text-align:center;"><div style="color:var(--text-soft);margin-bottom:2px;">出席</div>${fmtDiff(m.diffs.att)}</div>
            <div style="text-align:center;"><div style="color:var(--text-soft);margin-bottom:2px;">培訓</div>${fmtDiff(m.diffs.train)}</div>
            <div style="text-align:center;"><div style="color:var(--text-soft);margin-bottom:2px;">121</div>${fmtDiff(m.diffs.one)}</div>
            <div style="text-align:center;"><div style="color:var(--text-soft);margin-bottom:2px;">來賓</div>${fmtDiff(m.diffs.vis)}</div>
            <div style="text-align:center;"><div style="color:var(--text-soft);margin-bottom:2px;">引薦</div>${fmtDiff(m.diffs.ref)}</div>
          </div>
        </div>`;
      }).join('')
    : `<div style="text-align:center;padding:48px 20px;color:var(--text-soft);">沒有「${_momentumFilter}」狀態的會員</div>`;

  const statBox = (label, key, color, bg) => {
    const active = _momentumFilter === key;
    const activeBg = active ? color : bg;
    const activeColor = active ? '#fff' : color;
    return `<div onclick="_momentumSetFilter('${key}')" style="background:${activeBg};border-radius:8px;padding:10px;text-align:center;cursor:pointer;transition:all .15s;user-select:none;${active ? `box-shadow:0 4px 12px ${color}55;transform:translateY(-1px);` : ''}">
      <div style="font-size:11px;color:${activeColor};font-weight:700;">${label}</div>
      <div style="font-size:20px;font-weight:900;color:${activeColor};">${counts[key]}</div>
    </div>`;
  };

  c.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
      <h2 style="font-size:18px;font-weight:700;color:var(--red);margin:0;">動能觀測</h2>
    </div>
    <div style="font-size:12px;color:var(--text-soft);margin-bottom:14px;">過去 ${last24.length} 週 · 比較近 4 週 vs 前 ${history20.length} 週均值 · 分會均值 ${chapterAvg.toFixed(1)} · ${list.length} 位會員</div>

    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:18px;">
      ${statBox('動能爆發', '動能爆發', '#27ae60', '#d4f1d4')}
      ${statBox('回到正常', '回到正常值', '#3498db', '#d6eaf8')}
      ${statBox('穩定',     '穩定',     '#7f8c8d', '#ececec')}
      ${statBox('動能下滑', '動能下滑', '#e67e22', '#fcebd5')}
      ${statBox('嚴重衰退', '嚴重衰退', '#c0392b', '#f4cccc')}
    </div>

    <div class="member-grid">${filteredCardsHtml}</div>`;
}

function _momentumSetFilter(status) {
  _momentumFilter = status;
  renderMomentum();
}

// ===== 副主席報告 / 公告（獨立分頁）=====
async function renderAnnounce() {
  const c = document.getElementById('announceContent');
  if (!c) return;
  c.innerHTML = `<div style="min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;"><div class="loader-spinner"></div><div style="font-size:13px;color:var(--text-soft);">載入中...</div></div>`;

  if (!_lightsData) {
    try { await fetchLightsData(); }
    catch (e) {
      c.innerHTML = `<div class="card" style="padding:40px;text-align:center;color:var(--red);">載入失敗：${_escH(e.message || e)}</div>`;
      return;
    }
  }

  // 用「過去 6 個月含當月」滾動視窗算燈號
  const recent = _rowsInMonths(_lightsData, _predictMonthWindow());
  if (!recent.length) {
    c.innerHTML = `<div class="card" style="padding:40px;text-align:center;color:var(--text-soft);">尚無匯入資料。<br>請到「燈號分析 → 匯入」上傳對應週的 PALMS。</div>`;
    return;
  }
  const grouped = _aggregateMembers(recent);
  const list = Object.values(grouped).map(d => ({ ...d, ...(_calcLightScore(d)) }));

  const lightCounts = { '綠燈': 0, '黃燈': 0, '紅燈': 0, '黑燈': 0 };
  list.forEach(x => lightCounts[x.light]++);
  const totalMembers = list.length;
  const ratio = totalMembers > 0 ? Math.round(((lightCounts['綠燈'] + lightCounts['黃燈']) / totalMembers) * 100) : 0;

  // 期末衝刺預警
  const remainW = _remainingFridaysInMonth();
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
  lines.push(`黑燈：${lightCounts['黑燈']} 位`);
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
      <button class="btn btn-primary" onclick="_lightsCopyReport()">複製報告</button>
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
