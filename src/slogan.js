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
  requestAnimationFrame(() => requestAnimationFrame(() => {
    _scaleSlogan();
  }));
}

// 取出 slogan 末段慣用語（最後一個空格之後的字），讓它在表格中以紅色突顯
function _splitSloganTail(text) {
  if (!text) return { head: '', tail: '' };
  // 半形空格、全形空格、tab 都算
  const m = text.match(/^([\s\S]*[\s 　])(\S+)$/);
  if (m) return { head: m[1], tail: m[2] };
  return { head: text, tail: '' };
}

// 每欄 25 列、每張 50 列；超過則自動分頁；不足則補空白列
const SLOGAN_ROWS_PER_COL = 25;
const SLOGAN_PER_PAGE = SLOGAN_ROWS_PER_COL * 2;

function _buildSloganSheet(members) {
  const pages = Math.max(1, Math.ceil(members.length / SLOGAN_PER_PAGE));
  const totalSlots = pages * SLOGAN_PER_PAGE;
  const padded = members.slice();
  while (padded.length < totalSlots) padded.push(null); // 用 null 代表空白列

  const rowHtml = (m, n) => {
    if (!m) {
      return `<tr>
        <td class="sl-num">${n}</td>
        <td class="sl-spec"></td>
        <td class="sl-name"></td>
        <td class="sl-text"></td>
      </tr>`;
    }
    const { head, tail } = _splitSloganTail(m.slogan || '');
    const sloganCell = m.slogan
      ? `${_escH(head)}<span class="slogan-tail">${_escH(tail)}</span>`
      : '';
    return `<tr>
      <td class="sl-num">${n}</td>
      <td class="sl-spec">${_escH(m.specialty || '')}</td>
      <td class="sl-name">${_escH(m.name || '')}</td>
      <td class="sl-text">${sloganCell}</td>
    </tr>`;
  };
  const tableHtml = (arr, startN) => `
    <table class="slogan-table">
      <colgroup>
        <col style="width:9%"><col style="width:24%"><col style="width:16%"><col style="width:51%">
      </colgroup>
      <thead>
        <tr><th></th><th>專業類別</th><th>姓名</th><th>slogan</th></tr>
      </thead>
      <tbody>${arr.map((m, i) => rowHtml(m, startN + i)).join('')}</tbody>
    </table>`;

  let html = '';
  for (let p = 0; p < pages; p++) {
    const pageRows = padded.slice(p * SLOGAN_PER_PAGE, (p + 1) * SLOGAN_PER_PAGE);
    const left  = pageRows.slice(0, SLOGAN_ROWS_PER_COL);
    const right = pageRows.slice(SLOGAN_ROWS_PER_COL);
    const baseN = p * SLOGAN_PER_PAGE + 1;
    const sheetId = p === 0 ? 'sloganSheet' : `sloganSheet${p}`;
    html += `<div class="slogan-sheet" id="${sheetId}">
      <div class="slogan-cols">
        <div class="slogan-col">${tableHtml(left, baseN)}</div>
        <div class="slogan-col">${tableHtml(right, baseN + SLOGAN_ROWS_PER_COL)}</div>
      </div>
    </div>`;
  }
  return html;
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

// 量測表格高度，反推合適 --ss 使表格剛好填滿可用高度（不溢出）
function _autoFitSlogan() {
  const sheet = document.getElementById('sloganSheet');
  if (!sheet) return;
  const table = sheet.querySelector('.slogan-table');
  if (!table) return;

  sheet.style.setProperty('--ss', '1');
  void sheet.offsetHeight;

  const avail = sheet.clientHeight
    - parseFloat(getComputedStyle(sheet).paddingTop)
    - parseFloat(getComputedStyle(sheet).paddingBottom);
  if (avail <= 0) return;

  // 量測自然高
  let natural = table.scrollHeight;
  if (natural <= 0) return;
  let scale = (avail * 0.97) / natural;
  scale = Math.max(0.4, Math.min(3.0, scale));
  sheet.style.setProperty('--ss', scale.toFixed(3));

  // 文字換行造成的非線性：迭代修正
  for (let pass = 0; pass < 3; pass++) {
    void sheet.offsetHeight;
    const cur = parseFloat(getComputedStyle(sheet).getPropertyValue('--ss')) || 1;
    const h = table.scrollHeight;
    if (h <= avail * 0.99) break;
    sheet.style.setProperty('--ss', (cur * (avail / h) * 0.96).toFixed(3));
  }
}

async function _renderOneSloganCanvas(sheetEl) {
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
    const sheets = document.querySelectorAll('#sloganContent .slogan-sheet');
    if (!sheets.length) { showToast('找不到內容'); return; }
    const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFCtor) { showToast('jsPDF 初始化失敗'); return; }
    const doc = new jsPDFCtor({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    for (let i = 0; i < sheets.length; i++) {
      const canvas = await _renderOneSloganCanvas(sheets[i]);
      if (i > 0) doc.addPage();
      doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
    }
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
    const sheets = document.querySelectorAll('#sloganContent .slogan-sheet');
    if (!sheets.length) { showToast('找不到內容'); return; }
    for (let i = 0; i < sheets.length; i++) {
      const canvas = await _renderOneSloganCanvas(sheets[i]);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/jpeg', 0.92);
      a.download = sheets.length > 1
        ? `BNI-會員口號-${_todayIso()}-${i + 1}.jpg`
        : `BNI-會員口號-${_todayIso()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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
