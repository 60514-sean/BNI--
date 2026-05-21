// ===== 車牌登記（仿 PDF 列印格式）=====
// 額外（非會員）車牌：以 __plate_extras__ 存於後端 PropertiesService，跨裝置同步
// 永遠從 cache 讀取，避免本地副本與雲端分歧
function _getPlateExtras() {
  return Array.isArray(cache['__plate_extras__']) ? cache['__plate_extras__'].slice() : [];
}
function _setPlateExtras(arr) {
  apiSave('__plate_extras__', arr);
}

let _plateSubTab = 'member'; // 'member' | 'guest' | 'visitor'

async function renderPlate() {
  _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');

  const el = document.getElementById('plateContent');
  el.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text-soft);">載入中...</div>`;

  // 進入車牌頁前先強制從雲端同步一次最新資料
  await _bgRefresh().catch(() => {});

  if (!_memberData) await fetchMembers();
  if (!_memberData) {
    el.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--red);">載入失敗，請重試 <button class="btn" style="margin-left:12px;background:var(--red);color:white;" onclick="_memberData=null;renderPlate()">重試</button></div>`;
    return;
  }
  if (_plateSubTab === 'guest' && _guestData === null) await fetchGuests();

  const tab = _plateSubTab;
  let rows;
  if (tab === 'member') {
    rows = _flattenPlateRows(_memberData);
  } else if (tab === 'guest') {
    const weekGuests = _getWeekGuestsForSignin();
    rows = weekGuests.map(g => ({ name: g.name || '', plate: '' }));
  } else {
    rows = (typeof getVisitors === 'function' ? getVisitors() : [])
      .map(v => ({ name: v.name || '', plate: '' }));
  }
  const count = rows.length;
  const desc = tab === 'member'
    ? `${count} 筆車牌 · A4 直印 · 預覽如下`
    : tab === 'guest'
      ? `本周 ${count} 位來賓 · A4 直印 · 預覽如下`
      : `${count} 位外賓 · A4 直印 · 預覽如下`;
  const subBtn = (v, label) => `<button class="signin-subtab ${tab===v?'active':''}" onclick="_plateSwitch('${v}')">${label}</button>`;
  const extraBtn = (tab === 'member' && _canEditTab('plate'))
    ? `<button class="btn" style="background:white;border:1.5px solid var(--red);color:var(--red);font-weight:900;flex-shrink:0;" onclick="openPlateExtraModal()" title="新增非會員車牌">+</button>`
    : '';
  const refreshHandler = tab === 'member'
    ? `_memberData=null;renderPlate()`
    : tab === 'guest'
      ? `_guestData=null;renderPlate()`
      : `_bgRefresh().then(()=>renderPlate())`;

  el.innerHTML = `<div class="plate-wrapper">
    <div class="card" style="margin-bottom:14px;padding:16px 20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:16px;font-weight:900;color:var(--text);">車牌登記</div>
          <div style="font-size:12px;color:var(--text-soft);margin-top:3px;">${desc}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:nowrap;white-space:nowrap;">
          <button class="btn btn-primary" style="white-space:nowrap;" onclick="exportPlatePdf()">匯出 PDF</button>
          <button class="btn" style="background:white;border:1.5px solid var(--gray-border);color:var(--text);font-weight:700;white-space:nowrap;" onclick="exportPlateJpg()">匯出 JPG</button>
          ${extraBtn}
          <button class="btn" style="background:white;border:1.5px solid var(--gray-border);color:var(--text-soft);white-space:nowrap;" onclick="${refreshHandler}">重整</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        ${subBtn('member','會員')}
        ${subBtn('guest','來賓')}
        ${subBtn('visitor','外賓')}
      </div>
    </div>
    <div class="plate-preview-outer" id="plateOuter">
      <div class="plate-preview-inner" id="plateInner">${_buildPlateSheet(rows, tab)}</div>
    </div>
  </div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    _scalePlate();
  }));
}

function _plateSwitch(v) { _plateSubTab = v; renderPlate(); }

// 把每位會員的多張車牌展開成 [{name, plate}, ...]，沒有車牌的會員跳過
// 最後再 append 「非會員額外車牌」
function _flattenPlateRows(members) {
  const out = [];
  for (const m of members) {
    if (!m.plates) continue;
    const ps = m.plates.split('|').map(s => s.trim()).filter(Boolean);
    for (const p of ps) out.push({ name: m.name || '', plate: p });
  }
  for (const ex of _getPlateExtras()) {
    if (ex && (ex.name || ex.plate)) {
      out.push({ name: ex.name || '', plate: ex.plate || '' });
    }
  }
  return out;
}

// 每欄 25 列、每張 50 列；超過則自動分頁；不足則補空白列
const PLATE_ROWS_PER_COL = 25;
const PLATE_PER_PAGE = PLATE_ROWS_PER_COL * 2;

function _buildPlateSheet(rows, type) {
  const nameHeader  = type === 'guest' ? '來賓' : type === 'visitor' ? '外賓' : '會員';
  const titlePrefix = type === 'guest' ? '來賓車牌表' : type === 'visitor' ? '外賓車牌表' : '會員車牌表';

  const pages = Math.max(1, Math.ceil(rows.length / PLATE_PER_PAGE));
  const totalSlots = pages * PLATE_PER_PAGE;
  const padded = rows.slice();
  while (padded.length < totalSlots) padded.push({ name: '', plate: '' });

  const dateText = _rocDateText ? _rocDateText(_todayIso()) : new Date().toLocaleDateString();

  const tableRowsHtml = (arr) => arr.map(r => `
    <tr>
      <td class="pl-name">${_escH(r.name)}</td>
      <td class="pl-plate">${_escH(r.plate)}</td>
      <td class="pl-sig"></td>
      <td class="pl-note"></td>
    </tr>`).join('');
  const tableHtml = (arr) => `
    <table class="plate-table">
      <colgroup>
        <col style="width:24%"><col style="width:32%"><col style="width:22%"><col style="width:22%">
      </colgroup>
      <thead>
        <tr><th>${nameHeader}</th><th class="pl-plate-h">車牌號碼</th><th>簽　到</th><th>備　註</th></tr>
      </thead>
      <tbody>${tableRowsHtml(arr)}</tbody>
    </table>`;

  let html = '';
  for (let p = 0; p < pages; p++) {
    const pageRows = padded.slice(p * PLATE_PER_PAGE, (p + 1) * PLATE_PER_PAGE);
    const left  = pageRows.slice(0, PLATE_ROWS_PER_COL);
    const right = pageRows.slice(PLATE_ROWS_PER_COL);
    const suffix = pages > 1 ? `（${p + 1}/${pages}）` : '';
    const sheetId = p === 0 ? 'plateSheet' : `plateSheet${p}`;
    html += `<div class="plate-sheet" id="${sheetId}">
      <div class="plate-header">
        <div class="plate-title">BNI 億展白金分會　${titlePrefix}${suffix}</div>
        <div class="plate-subtitle">${dateText}</div>
      </div>
      <div class="plate-cols">
        <div class="plate-col">${tableHtml(left)}</div>
        <div class="plate-col">${tableHtml(right)}</div>
      </div>
    </div>`;
  }
  return html;
}

function _scalePlate() {
  const outer = document.getElementById('plateOuter');
  const inner = document.getElementById('plateInner');
  if (!outer || !inner) return;
  const availW = outer.clientWidth;
  const baseW  = 794;
  const scale  = Math.min(1, availW / baseW);
  inner.style.transform = `scale(${scale})`;
  inner.style.transformOrigin = 'top left';
  inner.style.marginLeft = Math.max(0, (availW - baseW * scale) / 2) + 'px';
  outer.style.height = (inner.scrollHeight * scale) + 'px';
}
window.addEventListener('resize', () => { if (_activeTab === 'plate') _scalePlate(); });

// 量測表格列高並反推「自動縮放係數」，使表格剛好填滿可用空間
function _autoFitPlate() {
  const sheet = document.getElementById('plateSheet');
  if (!sheet) return;
  const cols = sheet.querySelector('.plate-cols');
  if (!cols) return;
  // 重設縮放後量自然高度
  sheet.style.setProperty('--ps', '1');
  void sheet.offsetHeight;

  const tables = sheet.querySelectorAll('.plate-table');
  let maxScroll = 0;
  tables.forEach(t => { maxScroll = Math.max(maxScroll, t.scrollHeight); });
  if (maxScroll <= 0) return;
  const avail = cols.clientHeight;
  let scale = (avail * 0.95) / maxScroll;
  scale = Math.max(0.5, Math.min(2.5, scale));
  sheet.style.setProperty('--ps', scale.toFixed(3));

  // 文字換行造成的非線性誤差：迭代修正
  for (let pass = 0; pass < 3; pass++) {
    void sheet.offsetHeight;
    let curMax = 0;
    tables.forEach(t => { curMax = Math.max(curMax, t.scrollHeight); });
    if (curMax <= avail * 0.99) break;
    const cur = parseFloat(getComputedStyle(sheet).getPropertyValue('--ps')) || 1;
    sheet.style.setProperty('--ps', (cur * (avail / curMax) * 0.95).toFixed(3));
  }
}

async function _renderOneSheetCanvas(sheetEl) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:-9999px;top:0;background:white;';
  const clone = sheetEl.cloneNode(true);
  clone.style.transform = 'none';
  clone.style.boxShadow = 'none';
  wrap.appendChild(clone);
  document.body.appendChild(wrap);
  try {
    return await html2canvas(clone, {
      scale: 2, useCORS: true, allowTaint: false, logging: false, backgroundColor: '#ffffff'
    });
  } finally {
    document.body.removeChild(wrap);
  }
}

async function exportPlatePdf() {
  _pauseEditLock();
  showLoader(true, 'PDF 產生中...');
  try {
    await Promise.all([
      _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
      _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
    ]);
  } catch { showLoader(false); showToast('載入失敗，請確認網路'); _resumeEditLock(); return; }

  try {
    const sheets = document.querySelectorAll('#plateContent .plate-sheet');
    if (!sheets.length) { showToast('找不到內容'); return; }
    const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFCtor) { showToast('jsPDF 初始化失敗'); return; }
    const doc = new jsPDFCtor({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    for (let i = 0; i < sheets.length; i++) {
      const canvas = await _renderOneSheetCanvas(sheets[i]);
      if (i > 0) doc.addPage();
      doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
    }
    const fnPrefix = _plateSubTab === 'guest' ? 'BNI-來賓車牌'
                    : _plateSubTab === 'visitor' ? 'BNI-外賓車牌' : 'BNI-會員車牌';
    _downloadPdfBlob(doc.output('blob'), `${fnPrefix}-${_todayIso()}.pdf`);
    showToast('PDF 已下載');
  } catch {
    showToast('PDF 產生失敗，請重試');
  } finally {
    showLoader(false);
    _resumeEditLock();
  }
}

async function exportPlateJpg() {
  _pauseEditLock();
  showLoader(true, 'JPG 產生中...');
  try {
    await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  } catch { showLoader(false); showToast('JPG 套件載入失敗，請確認網路'); _resumeEditLock(); return; }

  try {
    const sheets = document.querySelectorAll('#plateContent .plate-sheet');
    if (!sheets.length) { showToast('找不到內容'); return; }
    for (let i = 0; i < sheets.length; i++) {
      const canvas = await _renderOneSheetCanvas(sheets[i]);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/jpeg', 0.92);
      const fnPrefix = _plateSubTab === 'guest' ? 'BNI-來賓車牌'
                      : _plateSubTab === 'visitor' ? 'BNI-外賓車牌' : 'BNI-會員車牌';
      a.download = sheets.length > 1
        ? `${fnPrefix}-${_todayIso()}-${i + 1}.jpg`
        : `${fnPrefix}-${_todayIso()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // 多檔下載稍等避免瀏覽器擋
      if (sheets.length > 1) await new Promise(r => setTimeout(r, 250));
    }
    showToast(sheets.length > 1 ? `${sheets.length} 張 JPG 已下載` : 'JPG 已下載');
  } catch {
    showToast('JPG 產生失敗，請重試');
  } finally {
    showLoader(false);
    _resumeEditLock();
  }
}

// ===== 非會員車牌管理 modal =====
function openPlateExtraModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'plateExtraModal';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:460px;">
      <div class="modal-title">新增非會員車牌</div>
      <p style="font-size:13px;color:var(--text-soft);margin-bottom:12px;line-height:1.5;">這裡新增的車牌會顯示在「會員車牌表」最後一位會員之後，<strong>不受會員增刪影響</strong>。</p>
      <div id="plateExtraList" style="margin-bottom:14px;max-height:280px;overflow-y:auto;border:1px solid var(--gray-border);border-radius:8px;padding:4px 10px;"></div>
      <div style="display:flex;gap:6px;align-items:center;">
        <input class="modal-input" id="plateExtraName" placeholder="姓名" style="margin-bottom:0;flex:1;">
        <input class="modal-input" id="plateExtraPlate" placeholder="車牌號碼" style="margin-bottom:0;flex:1.2;" onkeydown="if(event.key==='Enter')addPlateExtra()">
        <button onclick="addPlateExtra()" style="padding:10px 16px;background:var(--red);color:white;border:none;border-radius:var(--radius-sm);font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;">新增</button>
      </div>
      <div class="modal-btns" style="margin-top:18px;">
        <button class="modal-cancel" style="width:100%;" onclick="closePlateExtraModal()">關閉</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  _renderPlateExtraList();
  setTimeout(() => document.getElementById('plateExtraName')?.focus(), 50);
  // 開啟時也觸發一次背景刷新，拿最新雲端資料後重渲染清單
  _bgRefresh().then(() => { _renderPlateExtraList(); });
}

function _renderPlateExtraList() {
  const el = document.getElementById('plateExtraList');
  if (!el) return;
  const list = _getPlateExtras();
  if (list.length === 0) {
    el.innerHTML = `<div style="color:var(--text-soft);font-size:13px;text-align:center;padding:18px;">尚未新增任何非會員車牌</div>`;
    return;
  }
  el.innerHTML = list.map((it, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--gray-border);">
      <span style="font-size:14px;flex:0 0 90px;font-weight:700;">${_escH(it.name || '')}</span>
      <span style="font-size:14px;flex:1;color:#555;letter-spacing:0.5px;">${_escH(it.plate || '')}</span>
      <button onclick="removePlateExtra(${i})" style="padding:3px 12px;background:white;border:1.5px solid #e74c3c;color:#e74c3c;border-radius:6px;font-size:12px;cursor:pointer;font-family:inherit;">刪除</button>
    </div>`).join('');
}

function addPlateExtra() {
  if (!_canEditTab('plate')) { showToast('無編輯權限'); return; }
  const nameEl  = document.getElementById('plateExtraName');
  const plateEl = document.getElementById('plateExtraPlate');
  const name  = nameEl  ? nameEl.value.trim()  : '';
  const plate = plateEl ? plateEl.value.trim() : '';
  if (!name && !plate) return;
  const arr = _getPlateExtras();
  arr.push({ name, plate });
  _setPlateExtras(arr);
  if (nameEl)  nameEl.value  = '';
  if (plateEl) plateEl.value = '';
  _renderPlateExtraList();
  if (_activeTab === 'plate') renderPlate();
  setTimeout(() => document.getElementById('plateExtraName')?.focus(), 30);
}

function removePlateExtra(i) {
  if (!_canEditTab('plate')) { showToast('無編輯權限'); return; }
  const arr = _getPlateExtras();
  arr.splice(i, 1);
  _setPlateExtras(arr);
  _renderPlateExtraList();
  if (_activeTab === 'plate') renderPlate();
}

function closePlateExtraModal() {
  document.getElementById('plateExtraModal')?.remove();
}
