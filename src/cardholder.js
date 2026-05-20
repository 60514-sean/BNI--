// ===== 名片盒 =====
// PDF 頁面 = 名片盒單張（寬 90mm × 高 75mm），每位會員獨立一頁
let _cardholderSelected  = null;   // null = 全選；Set<sheetRow>
let _cardholderPanelOpen = false;

function _getSelectedCardholderMembers() {
  if (!_memberData) return [];
  if (_cardholderSelected === null) return [..._memberData];
  return _memberData.filter(m => _cardholderSelected.has(String(m.sheetRow)));
}

function _cardholderSelectAll() {
  _cardholderSelected = null;
  document.querySelectorAll('.cholder-selector-item input').forEach(cb => cb.checked = true);
  _cardholderRefreshView();
}
function _cardholderSelectNone() {
  _cardholderSelected = new Set();
  document.querySelectorAll('.cholder-selector-item input').forEach(cb => cb.checked = false);
  _cardholderRefreshView();
}
function _cardholderToggle(sheetRow) {
  const key = String(sheetRow);
  if (_cardholderSelected === null) {
    _cardholderSelected = new Set(_memberData.map(m => String(m.sheetRow)));
  }
  if (_cardholderSelected.has(key)) _cardholderSelected.delete(key);
  else _cardholderSelected.add(key);
  _cardholderRefreshView();
}
function _cardholderTogglePanel() {
  _cardholderPanelOpen = !_cardholderPanelOpen;
  const p = document.getElementById('cholderPanel');
  const arrow = document.getElementById('cholderSelArrow');
  if (p) p.style.display = _cardholderPanelOpen ? '' : 'none';
  if (arrow) arrow.textContent = _cardholderPanelOpen ? '▲' : '▼';
}

function _cardholderRefreshView() {
  const total = _memberData ? _memberData.length : 0;
  const sel   = _getSelectedCardholderMembers();
  const count = sel.length;
  const body  = document.getElementById('cardholderBody');
  if (body) body.innerHTML = _cardholderBodyHtml(sel);
  const desc  = document.getElementById('cardholderDesc');
  if (desc) desc.textContent = `已選 ${count} / ${total} 位 · ${count} 頁 PDF（每頁 1 位 · 90×75mm）`;
  const btn   = document.getElementById('cardholderPdfBtn');
  if (btn) btn.disabled = count === 0;
  const selTx = document.getElementById('cholderSelBtnText');
  if (selTx) selTx.textContent = `選擇會員（已選 ${count} / ${total} 位）`;
}

async function renderCardholder() {
  _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  const el = document.getElementById('cardholderContent');
  el.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text-soft);">載入中...</div>`;
  if (!_memberData) await fetchMembers();
  if (!_memberData) {
    el.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--red);">載入失敗，請重試 <button class="btn" style="margin-left:12px;background:var(--red);color:white;" onclick="_memberData=null;renderCardholder()">重試</button></div>`;
    return;
  }

  const total = _memberData.length;
  const sel   = _getSelectedCardholderMembers();
  const count = sel.length;
  const desc  = `已選 ${count} / ${total} 位 · ${count} 頁 PDF（每頁 1 位 · 90×75mm）`;

  el.innerHTML = `<div class="cardholder-wrapper">
    <div class="card" style="margin-bottom:14px;padding:16px 20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:16px;font-weight:900;color:var(--text);">名片盒</div>
          <div id="cardholderDesc" style="font-size:12px;color:var(--text-soft);margin-top:3px;">${desc}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button id="cardholderPdfBtn" class="btn btn-primary" onclick="printCardholders()" ${count===0?'disabled':''}>匯出 PDF</button>
          <button class="btn" style="background:white;border:1.5px solid var(--gray-border);color:var(--text-soft);" onclick="_memberData=null;renderCardholder()">重整</button>
        </div>
      </div>
      ${_cardholderSelectorHtml(_memberData)}
    </div>
    <div id="cardholderBody">${_cardholderBodyHtml(sel)}</div>
  </div>`;
}

function _cardholderSelectorHtml(members) {
  const sel = _getSelectedCardholderMembers();
  const isSelected = (m) => _cardholderSelected === null || _cardholderSelected.has(String(m.sheetRow));
  const items = members.map(m => `
    <label class="mplacard-selector-item cholder-selector-item">
      <input type="checkbox" ${isSelected(m) ? 'checked' : ''} onchange="_cardholderToggle('${m.sheetRow}')">
      <span>${_escH(m.name)}</span>
    </label>`).join('');
  return `<div class="mplacard-selector">
    <button class="mplacard-selector-btn" onclick="_cardholderTogglePanel()">
      <span id="cholderSelBtnText">選擇會員（已選 ${sel.length} / ${members.length} 位）</span>
      <span id="cholderSelArrow" style="color:var(--text-soft);font-size:12px;">${_cardholderPanelOpen ? '▲' : '▼'}</span>
    </button>
    <div class="mplacard-selector-panel" id="cholderPanel" style="display:${_cardholderPanelOpen ? '' : 'none'};">
      <div class="mplacard-selector-actions">
        <button onclick="_cardholderSelectAll()">全選</button>
        <button onclick="_cardholderSelectNone()">全不選</button>
      </div>
      <div class="mplacard-selector-list">${items}</div>
    </div>
  </div>`;
}

function _cardholderBodyHtml(members) {
  if (!members.length) {
    return `<div class="card" style="padding:40px 24px;text-align:center;color:var(--text-soft);">
      尚未選取任何會員<br>
      <span style="font-size:12px;">請點擊上方「選擇會員」下拉選單勾選要製作的會員</span>
    </div>`;
  }
  return `<div class="cardholder-list">${members.map(_cardholderSheetHtml).join('')}</div>`;
}

function _cardholderSheetHtml(m) {
  const name = _escH(m.name || '');
  const industry = _escH(m.industry || m.specialty || '');
  return `<div class="cardholder-sheet" style="background-image:url('cardholder_bg/cardholder.jpg');">
    <div class="cardholder-industry">${industry}</div>
    <div class="cardholder-name">${name}</div>
  </div>`;
}

async function printCardholders() {
  _pauseEditLock();
  showLoader(true, 'PDF 產生中...');
  try {
    await Promise.all([
      _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
      _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
    ]);
  } catch { showLoader(false); showToast('載入失敗，請確認網路'); _resumeEditLock(); return; }

  const sheets = document.querySelectorAll('#cardholderBody .cardholder-sheet');
  if (!sheets.length) { _resumeEditLock(); return; }

  let bgDataURL;
  try { bgDataURL = await _fetchAsDataURL('cardholder_bg/cardholder.jpg'); }
  catch { showLoader(false); showToast('底圖載入失敗'); _resumeEditLock(); return; }

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:-9999px;top:0;background:transparent;';
  document.body.appendChild(wrap);

  try {
    const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFCtor) { showToast('jsPDF 初始化失敗'); return; }
    // 自訂頁面尺寸 90×75mm（橫式）
    const doc = new jsPDFCtor({ orientation: 'landscape', unit: 'mm', format: [75, 90], compress: false });
    for (let i = 0; i < sheets.length; i++) {
      wrap.innerHTML = '';
      const clone = sheets[i].cloneNode(true);
      clone.style.backgroundImage = 'none';
      clone.style.background      = 'transparent';
      clone.style.boxShadow       = 'none';
      clone.style.marginTop       = '0';
      wrap.appendChild(clone);
      const canvas = await html2canvas(clone, {
        scale: 4, useCORS: true, allowTaint: false, logging: false, backgroundColor: null
      });
      if (i > 0) doc.addPage([75, 90], 'landscape');
      doc.addImage(bgDataURL, 'JPEG', 0, 0, 90, 75);
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 90, 75);
    }
    _downloadPdfBlob(doc.output('blob'), `BNI-名片盒-${_todayIso()}.pdf`);
    showToast('PDF 已下載');
  } catch {
    showToast('PDF 產生失敗，請重試');
  } finally {
    document.body.removeChild(wrap);
    showLoader(false);
    _resumeEditLock();
  }
}
