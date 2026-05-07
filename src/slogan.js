// ===== 會員口號 =====
async function renderSlogan() {
  // 預載入匯出套件
  _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');

  const el = document.getElementById('sloganContent');
  el.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text-soft);">載入中...</div>`;

  if (!_memberData) await fetchMembers();
  if (!_memberData) {
    el.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--red);">載入失敗，請重試 <button class="btn" style="margin-left:12px;background:var(--red);color:white;" onclick="_memberData=null;renderSlogan()">重試</button></div>`;
    return;
  }

  const members = [..._memberData];
  const count = members.length;
  el.innerHTML = `<div class="slogan-wrapper">
    <div class="card" style="margin-bottom:14px;padding:16px 20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:16px;font-weight:900;color:var(--text);">會員口號</div>
          <div style="font-size:12px;color:var(--text-soft);margin-top:3px;">${count} 位會員 · A4 直印 · 預覽如下</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="exportSloganPdf()">匯出 PDF</button>
          <button class="btn" style="background:white;border:1.5px solid var(--gray-border);color:var(--text);font-weight:700;" onclick="exportSloganJpg()">匯出 JPG</button>
          <button class="btn" style="background:white;border:1.5px solid var(--gray-border);color:var(--text-soft);" onclick="_memberData=null;renderSlogan()">重整</button>
        </div>
      </div>
    </div>
    <div class="slogan-preview-outer" id="sloganOuter">
      <div class="slogan-preview-inner" id="sloganInner">${_buildSloganSheet(members)}</div>
    </div>
  </div>`;
  // 兩個 raf 等版面真正排好再量測，避免初次量到 0
  requestAnimationFrame(() => requestAnimationFrame(() => {
    _autoFitSlogan();
    _scaleSlogan();
  }));
}

function _buildSloganSheet(members) {
  // 兩欄式 A4 排版；序號從第 1 欄起依序遞增、超過半數移到第 2 欄
  const half = Math.ceil(members.length / 2);
  const left  = members.slice(0, half);
  const right = members.slice(half);
  const itemHtml = (m, n) => `
    <div class="slogan-item">
      <span class="slogan-num">${n}</span>
      <div class="slogan-content">
        <div class="slogan-name-row">
          <span class="slogan-name">${_escH(m.name || '')}</span>
          ${m.specialty ? `<span class="slogan-spec">${_escH(m.specialty)}</span>` : ''}
        </div>
        <div class="slogan-text${m.slogan ? '' : ' empty'}">${_escH(m.slogan || '—')}</div>
      </div>
    </div>`;
  const today = _todayIso ? _todayIso() : '';
  return `<div class="slogan-sheet" id="sloganSheet">
    <div class="slogan-header">
      <div class="slogan-title">BNI 會員口號</div>
      <div class="slogan-subtitle">共 ${members.length} 位 · ${today}</div>
    </div>
    <div class="slogan-cols">
      <div class="slogan-col">${left.map((m, i) => itemHtml(m, i + 1)).join('')}</div>
      <div class="slogan-col">${right.map((m, i) => itemHtml(m, half + i + 1)).join('')}</div>
    </div>
  </div>`;
}

function _scaleSlogan() {
  const outer = document.getElementById('sloganOuter');
  const inner = document.getElementById('sloganInner');
  if (!outer || !inner) return;
  const availW = outer.clientWidth;
  const baseW  = 794; // A4 px @ 96dpi
  const scale  = Math.min(1, availW / baseW);
  inner.style.transform = `scale(${scale})`;
  inner.style.transformOrigin = 'top left';
  inner.style.marginLeft = Math.max(0, (availW - baseW * scale) / 2) + 'px';
  outer.style.height = (inner.scrollHeight * scale) + 'px';
}
window.addEventListener('resize', () => { if (_activeTab === 'slogan') _scaleSlogan(); });

// 列已 flex:1 均分欄位高度（底部不留白）。此函式只負責根據每列分到的高度，反推合適字級
function _autoFitSlogan() {
  const sheet = document.getElementById('sloganSheet');
  if (!sheet) return;
  const cols = sheet.querySelector('.slogan-cols');
  if (!cols) return;
  // 先重設 --ss=1 量測「每列內容自然高度」
  sheet.style.setProperty('--ss', '1');
  void sheet.offsetHeight;

  const colEls = cols.querySelectorAll('.slogan-col');
  let maxItems = 0;
  colEls.forEach(c => { maxItems = Math.max(maxItems, c.querySelectorAll('.slogan-item').length); });
  if (!maxItems) return;

  const items = sheet.querySelectorAll('.slogan-item');
  let naturalH = 0;
  items.forEach(i => { naturalH = Math.max(naturalH, i.scrollHeight); });
  if (naturalH <= 0) return;

  const allocH = cols.clientHeight / maxItems;
  // 目標填到 92% 列高（留一點呼吸空間）
  let scale = (allocH * 0.92) / naturalH;
  scale = Math.max(0.4, Math.min(3.0, scale));
  sheet.style.setProperty('--ss', scale.toFixed(3));

  // 文字換行不完全線性：再迭代修正，遇到溢出就縮小
  for (let pass = 0; pass < 3; pass++) {
    void sheet.offsetHeight;
    let maxRatio = 1;
    items.forEach(i => {
      const r = i.scrollHeight / Math.max(1, i.clientHeight);
      if (r > maxRatio) maxRatio = r;
    });
    if (maxRatio <= 1.02) break;
    const cur = parseFloat(getComputedStyle(sheet).getPropertyValue('--ss')) || 1;
    sheet.style.setProperty('--ss', (cur / maxRatio * 0.95).toFixed(3));
  }
}

async function _renderSloganCanvas() {
  const sheet = document.getElementById('sloganSheet');
  if (!sheet) return null;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:-9999px;top:0;background:white;';
  const clone = sheet.cloneNode(true);
  clone.style.transform = 'none';
  clone.style.boxShadow = 'none';
  wrap.appendChild(clone);
  document.body.appendChild(wrap);
  try {
    const canvas = await html2canvas(clone, {
      scale: 2, useCORS: true, allowTaint: false, logging: false, backgroundColor: '#ffffff'
    });
    return canvas;
  } finally {
    document.body.removeChild(wrap);
  }
}

async function exportSloganPdf() {
  _pauseEditLock();
  showLoader(true, 'PDF 產生中...');
  try {
    await Promise.all([
      _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
      _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
    ]);
  } catch { showLoader(false); showToast('載入失敗，請確認網路'); _resumeEditLock(); return; }

  try {
    const canvas = await _renderSloganCanvas();
    if (!canvas) { showToast('找不到內容'); return; }
    const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFCtor) { showToast('jsPDF 初始化失敗'); return; }
    const doc = new jsPDFCtor({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
    _downloadPdfBlob(doc.output('blob'), `BNI-會員口號-${_todayIso()}.pdf`);
    showToast('PDF 已下載');
  } catch {
    showToast('PDF 產生失敗，請重試');
  } finally {
    showLoader(false);
    _resumeEditLock();
  }
}

async function exportSloganJpg() {
  _pauseEditLock();
  showLoader(true, 'JPG 產生中...');
  try {
    await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  } catch { showLoader(false); showToast('JPG 套件載入失敗，請確認網路'); _resumeEditLock(); return; }

  try {
    const canvas = await _renderSloganCanvas();
    if (!canvas) { showToast('找不到內容'); return; }
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/jpeg', 0.92);
    a.download = `BNI-會員口號-${_todayIso()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('JPG 已下載');
  } catch {
    showToast('JPG 產生失敗，請重試');
  } finally {
    showLoader(false);
    _resumeEditLock();
  }
}
