// ===== 會員車牌（仿 PDF 列印格式）=====
async function renderPlate() {
  _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');

  const el = document.getElementById('plateContent');
  el.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text-soft);">載入中...</div>`;

  if (!_memberData) await fetchMembers();
  if (!_memberData) {
    el.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--red);">載入失敗，請重試 <button class="btn" style="margin-left:12px;background:var(--red);color:white;" onclick="_memberData=null;renderPlate()">重試</button></div>`;
    return;
  }

  const rows = _flattenPlateRows(_memberData);
  const count = rows.length;
  el.innerHTML = `<div class="plate-wrapper">
    <div class="card" style="margin-bottom:14px;padding:16px 20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:16px;font-weight:900;color:var(--text);">會員車牌</div>
          <div style="font-size:12px;color:var(--text-soft);margin-top:3px;">${count} 筆車牌 · A4 直印 · 預覽如下</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="exportPlatePdf()">匯出 PDF</button>
          <button class="btn" style="background:white;border:1.5px solid var(--gray-border);color:var(--text);font-weight:700;" onclick="exportPlateJpg()">匯出 JPG</button>
          <button class="btn" style="background:white;border:1.5px solid var(--gray-border);color:var(--text-soft);" onclick="_memberData=null;renderPlate()">重整</button>
        </div>
      </div>
    </div>
    <div class="plate-preview-outer" id="plateOuter">
      <div class="plate-preview-inner" id="plateInner">${_buildPlateSheet(rows)}</div>
    </div>
  </div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    _scalePlate();
  }));
}

// 把每位會員的多張車牌展開成 [{name, plate}, ...]，沒有車牌的會員跳過
function _flattenPlateRows(members) {
  const out = [];
  for (const m of members) {
    if (!m.plates) continue;
    const ps = m.plates.split('|').map(s => s.trim()).filter(Boolean);
    for (const p of ps) out.push({ name: m.name || '', plate: p });
  }
  return out;
}

// 每欄 25 列、每張 50 列；超過則自動分頁；不足則補空白列
const PLATE_ROWS_PER_COL = 25;
const PLATE_PER_PAGE = PLATE_ROWS_PER_COL * 2;

function _buildPlateSheet(rows) {
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
        <tr><th>會員</th><th>車牌號碼</th><th>簽　到</th><th>備　註</th></tr>
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
        <div class="plate-title">BNI 億展白金分會　會員車牌表${suffix}</div>
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
    _downloadPdfBlob(doc.output('blob'), `BNI-會員車牌-${_todayIso()}.pdf`);
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
      a.download = sheets.length > 1
        ? `BNI-會員車牌-${_todayIso()}-${i + 1}.jpg`
        : `BNI-會員車牌-${_todayIso()}.jpg`;
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
