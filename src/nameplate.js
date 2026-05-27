// ===== 名牌 =====
// PDF 頁面 = 名牌單張（寬 79mm × 高 45.5mm），每位會員獨立一頁 PNG 無損輸出
let _nameplateSelected  = null;   // null = 全選；Set<sheetRow>
let _nameplatePanelOpen = false;

function _getSelectedNameplateMembers() {
  if (!_memberData) return [];
  if (_nameplateSelected === null) return [..._memberData];
  return _memberData.filter(m => _nameplateSelected.has(String(m.sheetRow)));
}

function _nameplateSelectAll() {
  _nameplateSelected = null;
  document.querySelectorAll('.nplate-selector-item input').forEach(cb => cb.checked = true);
  _nameplateRefreshView();
}
function _nameplateSelectNone() {
  _nameplateSelected = new Set();
  document.querySelectorAll('.nplate-selector-item input').forEach(cb => cb.checked = false);
  _nameplateRefreshView();
}
function _nameplateToggle(sheetRow) {
  const key = String(sheetRow);
  if (_nameplateSelected === null) {
    _nameplateSelected = new Set(_memberData.map(m => String(m.sheetRow)));
  }
  if (_nameplateSelected.has(key)) _nameplateSelected.delete(key);
  else _nameplateSelected.add(key);
  _nameplateRefreshView();
}
function _nameplateTogglePanel() {
  _nameplatePanelOpen = !_nameplatePanelOpen;
  const p = document.getElementById('nplatePanel');
  const arrow = document.getElementById('nplateSelArrow');
  if (p) p.style.display = _nameplatePanelOpen ? '' : 'none';
  if (arrow) arrow.textContent = _nameplatePanelOpen ? '▲' : '▼';
}

function _nameplateRefreshView() {
  const total = _memberData ? _memberData.length : 0;
  const sel   = _getSelectedNameplateMembers();
  const count = sel.length;
  const body  = document.getElementById('nameplateBody');
  if (body) body.innerHTML = _nameplateBodyHtml(sel);
  const desc  = document.getElementById('nameplateDesc');
  if (desc) desc.textContent = `已選 ${count} / ${total} 位 · ${count} 張 PDF（每張 1 位）`;
  const btn   = document.getElementById('nameplatePdfBtn');
  if (btn) btn.disabled = count === 0;
  const selTx = document.getElementById('nplateSelBtnText');
  if (selTx) selTx.textContent = `選擇會員（已選 ${count} / ${total} 位）`;
}

async function renderNameplate() {
  _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  const el = document.getElementById('nameplateContent');
  el.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text-soft);">載入中...</div>`;
  if (!_memberData) await fetchMembers();
  if (!_memberData) {
    el.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--red);">載入失敗，請重試 <button class="btn" style="margin-left:12px;background:var(--red);color:white;" onclick="_memberData=null;renderNameplate()">重試</button></div>`;
    return;
  }

  const total = _memberData.length;
  const sel   = _getSelectedNameplateMembers();
  const count = sel.length;
  const desc  = `已選 ${count} / ${total} 位 · ${count} 頁 PDF（每頁 1 位 · 79×45.5mm）`;

  el.innerHTML = `<div class="nameplate-wrapper">
    <div class="card" style="margin-bottom:14px;padding:16px 20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:16px;font-weight:900;color:var(--text);">名牌</div>
          <div id="nameplateDesc" style="font-size:12px;color:var(--text-soft);margin-top:3px;">${desc}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button id="nameplatePdfBtn" class="btn btn-primary" onclick="printNameplates()" ${count===0?'disabled':''}>匯出 PDF</button>
          <button class="btn" style="background:white;border:1.5px solid var(--gray-border);color:var(--text-soft);" onclick="_memberData=null;renderNameplate()">重整</button>
        </div>
      </div>
      ${_nameplateSelectorHtml(_memberData)}
    </div>
    <div id="nameplateBody">${_nameplateBodyHtml(sel)}</div>
  </div>`;
}

function _nameplateSelectorHtml(members) {
  const sel = _getSelectedNameplateMembers();
  const isSelected = (m) => _nameplateSelected === null || _nameplateSelected.has(String(m.sheetRow));
  const items = members.map(m => `
    <label class="mplacard-selector-item nplate-selector-item">
      <input type="checkbox" ${isSelected(m) ? 'checked' : ''} onchange="_nameplateToggle('${m.sheetRow}')">
      <span>${_escH(m.name)}</span>
    </label>`).join('');
  return `<div class="mplacard-selector">
    <button class="mplacard-selector-btn" onclick="_nameplateTogglePanel()">
      <span id="nplateSelBtnText">選擇會員（已選 ${sel.length} / ${members.length} 位）</span>
      <span id="nplateSelArrow" style="color:var(--text-soft);font-size:12px;">${_nameplatePanelOpen ? '▲' : '▼'}</span>
    </button>
    <div class="mplacard-selector-panel" id="nplatePanel" style="display:${_nameplatePanelOpen ? '' : 'none'};">
      <div class="mplacard-selector-actions">
        <button onclick="_nameplateSelectAll()">全選</button>
        <button onclick="_nameplateSelectNone()">全不選</button>
      </div>
      <div class="mplacard-selector-list">${items}</div>
    </div>
  </div>`;
}

function _nameplateBodyHtml(members) {
  if (!members.length) {
    return `<div class="card" style="padding:40px 24px;text-align:center;color:var(--text-soft);">
      尚未選取任何會員<br>
      <span style="font-size:12px;">請點擊上方「選擇會員」下拉選單勾選要製作的會員</span>
    </div>`;
  }
  return `<div class="nameplate-list">${members.map(_nameplateSheetHtml).join('')}</div>`;
}

function _nameplateSheetHtml(m) {
  const name = _escH(m.name || '');
  const industry = _escH(m.specialty || m.industry || '');  // 顯示專業別（優先），無則退回產業鏈
  return `<div class="nameplate-sheet" style="background-image:url('nameplate_bg/nameplate.jpg');">
    <div class="nameplate-industry">${industry}</div>
    <div class="nameplate-name">${name}</div>
  </div>`;
}

// 把圖片網址讀成 DataURL（不經 canvas 重新編碼，保留原始檔案位元）
async function _fetchAsDataURL(url) {
  const r = await fetch(url);
  const blob = await r.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function printNameplates() {
  _pauseEditLock();
  showLoader(true, 'PDF 產生中...');
  try {
    await Promise.all([
      _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
      _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
    ]);
  } catch { showLoader(false); showToast('載入失敗，請確認網路'); _resumeEditLock(); return; }

  const sheets = document.querySelectorAll('#nameplateBody .nameplate-sheet');
  if (!sheets.length) { _resumeEditLock(); return; }

  // 直接拿底圖原檔（不經 html2canvas 降採樣）
  let bgDataURL;
  try { bgDataURL = await _fetchAsDataURL('nameplate_bg/nameplate.jpg'); }
  catch { showLoader(false); showToast('底圖載入失敗'); _resumeEditLock(); return; }

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:-9999px;top:0;background:transparent;';
  document.body.appendChild(wrap);

  try {
    const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFCtor) { showToast('jsPDF 初始化失敗'); return; }
    // 自訂頁面尺寸 79×45.5mm（橫式）
    const doc = new jsPDFCtor({ orientation: 'landscape', unit: 'mm', format: [45.5, 79], compress: false });
    for (let i = 0; i < sheets.length; i++) {
      wrap.innerHTML = '';
      const clone = sheets[i].cloneNode(true);
      // 移除底圖，html2canvas 只抓文字（背景透明）
      clone.style.backgroundImage = 'none';
      clone.style.background      = 'transparent';
      clone.style.boxShadow       = 'none';
      clone.style.marginTop       = '0';
      wrap.appendChild(clone);
      const canvas = await html2canvas(clone, {
        scale: 4, useCORS: true, allowTaint: false, logging: false, backgroundColor: null
      });
      if (i > 0) doc.addPage([45.5, 79], 'landscape');
      // 1) 先放底圖原檔（PDF 內保留原始解析度）
      doc.addImage(bgDataURL, 'JPEG', 0, 0, 79, 45.5);
      // 2) 再疊上文字透明 PNG（4× 像素密度）
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 79, 45.5);
    }
    _downloadPdfBlob(doc.output('blob'), `BNI-名牌-${_todayIso()}.pdf`);
    showToast('PDF 已下載');
  } catch {
    showToast('PDF 產生失敗，請重試');
  } finally {
    document.body.removeChild(wrap);
    showLoader(false);
    _resumeEditLock();
  }
}
