// ===== SIGNIN SHEET =====
const SIGNIN_ROWS_PER_PAGE = 15;     // 會員每頁人數
const SIGNIN_GUEST_PER_PAGE = 10;    // 來賓每頁人數
const SIGNIN_GUEST_TOTAL    = 10;    // 來賓總人數
const SIGNIN_VISITOR_PER_PAGE = 15;  // 外賓每頁人數（比照會員）
let _signinSubTab = 'member';       // 'member' | 'guest' | 'visitor'
let _signinDate = '';                // 'YYYY-MM-DD'，預設今天

function _rocDateText(isoDate) {
  const d = isoDate ? new Date(isoDate + 'T00:00:00') : new Date();
  const roc = d.getFullYear() - 1911;
  const m   = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${roc} 年 ${m} 月 ${day} 日`;
}
function _todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function renderSignin() {
  _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');

  const el = document.getElementById('signinContent');
  el.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text-soft);">載入中...</div>`;
  if (!_memberData) await fetchMembers();
  if (!_memberData) { el.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--red);">載入失敗，請重試 <button class="btn" style="margin-left:12px;background:var(--red);color:white;" onclick="_memberData=null;renderSignin()">重試</button></div>`; return; }
  // 來賓簽到表需要本周來賓資料
  if (_signinSubTab === 'guest' && _guestData === null) await fetchGuests();

  if (!_signinDate) _signinDate = _todayIso();
  const dateText = _rocDateText(_signinDate);
  const tab = _signinSubTab;
  const subBtn = (v, label) => `<button class="signin-subtab ${tab===v?'active':''}" onclick="_signinSwitch('${v}')">${label}</button>`;
  const sheetsHtml = tab === 'member' ? _buildMemberSheets(dateText)
                   : tab === 'guest'  ? _buildGuestSheets(dateText)
                   : _buildVisitorSheets(dateText);
  const pageCount = (sheetsHtml.match(/class="signin-sheet"/g) || []).length;
  const weekGuestCount = tab === 'guest' ? _getWeekGuestsForSignin().length : 0;
  const visitorCount   = tab === 'visitor' ? getVisitors().length : 0;
  const desc = tab === 'member' ? `共 ${_memberData.length} 位會員 · ${pageCount} 張 A4（每張 ${SIGNIN_ROWS_PER_PAGE} 人）`
             : tab === 'guest'  ? `本周 ${weekGuestCount} 位 · 表格 ${SIGNIN_GUEST_TOTAL} 格 · ${pageCount} 張 A4`
             : `共 ${visitorCount} 位外賓 · ${pageCount} 張 A4（每張 ${SIGNIN_VISITOR_PER_PAGE} 人）`;

  el.innerHTML = `<div class="signin-wrapper">
    <div class="card" style="margin-bottom:14px;padding:16px 20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:16px;font-weight:900;color:var(--text);">出席簽到</div>
          <div style="font-size:12px;color:var(--text-soft);margin-top:3px;">A4 直式 · ${desc}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <label style="font-size:13px;color:var(--text-soft);font-weight:600;">日期</label>
          <input type="date" value="${_signinDate}" onchange="_signinSetDate(this.value)" style="padding:8px 10px;border:1.5px solid var(--gray-border);border-radius:var(--radius-sm);font-family:inherit;font-size:13px;outline:none;">
          <button class="btn btn-primary" onclick="printSignin()">匯出 PDF</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        ${subBtn('member','會員')}
        ${subBtn('guest','來賓')}
        ${subBtn('visitor','外賓')}
      </div>
    </div>
    <div class="signin-preview-outer" id="signinOuter">
      <div class="signin-preview-inner" id="signinInner">
        ${sheetsHtml}
      </div>
    </div>
  </div>`;
  _scaleSignin();
}

function _signinSwitch(v) { _signinSubTab = v; renderSignin(); }
function _signinSetDate(v) { _signinDate = v || _todayIso(); renderSignin(); }

function _buildMemberSheets(dateText) {
  const members = [..._memberData].sort((a, b) => (a.sheetRow || 0) - (b.sheetRow || 0));
  const chunks = [];
  for (let i = 0; i < members.length; i += SIGNIN_ROWS_PER_PAGE) {
    chunks.push(members.slice(i, i + SIGNIN_ROWS_PER_PAGE));
  }
  if (!chunks.length) chunks.push([]);
  return chunks.map((arr, pi) =>
    _memberSheetHtml(dateText, arr, pi * SIGNIN_ROWS_PER_PAGE, pi + 1, chunks.length)
  ).join('');
}

function _buildVisitorSheets(dateText) {
  const visitors = getVisitors();
  const chunks = [];
  for (let i = 0; i < visitors.length; i += SIGNIN_VISITOR_PER_PAGE) {
    chunks.push(visitors.slice(i, i + SIGNIN_VISITOR_PER_PAGE));
  }
  if (!chunks.length) chunks.push([]);
  return chunks.map((arr, pi) =>
    _visitorSigninSheetHtml(dateText, arr, pi * SIGNIN_VISITOR_PER_PAGE, pi + 1, chunks.length)
  ).join('');
}

function _visitorSigninSheetHtml(dateText, visitors, startIdx, pageNum, totalPages) {
  const rowH = 14;
  const suffix = totalPages > 1 ? `（${pageNum}/${totalPages}）` : '';
  let rows = '';
  for (let i = 0; i < SIGNIN_VISITOR_PER_PAGE; i++) {
    const v = visitors[i];
    rows += `
    <tr style="height:${rowH}mm;">
      <td class="c-num">${startIdx + i + 1}</td>
      <td class="c-name">${v ? _escH(v.name || '') : ''}</td>
      <td></td>
      <td class="c-time">:</td>
      <td></td>
      <td></td>
    </tr>`;
  }
  return `<div class="signin-sheet">
    <div class="ss-title">BNI 億展白金分會　外賓出席簽到${suffix}</div>
    <div class="ss-subtitle">${dateText}　　6:15 領導團隊應到　6:30 應到</div>
    <table class="ss-table">
      <colgroup>
        <col style="width:9%"><col style="width:17%"><col style="width:22%"><col style="width:16%"><col style="width:12%"><col style="width:24%">
      </colgroup>
      <thead><tr><th>序號</th><th>外賓</th><th>簽名</th><th>簽到時間</th><th>收費</th><th>備註</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function _buildGuestSheets(dateText) {
  const total   = SIGNIN_GUEST_TOTAL;
  const perPage = SIGNIN_GUEST_PER_PAGE;
  const pages   = Math.max(1, Math.ceil(total / perPage));
  let html = '';
  for (let p = 0; p < pages; p++) {
    const start = p * perPage;
    const count = Math.min(perPage, total - start);
    html += _guestSheetHtml(dateText, start, count, p + 1, pages);
  }
  return html;
}

function _memberSheetHtml(dateText, members, startIdx, pageNum, totalPages) {
  const rowH = 14; // mm，每列 14mm 以容納 26pt 姓名
  const suffix = totalPages > 1 ? `（${pageNum}/${totalPages}）` : '';
  let rows = '';
  for (let i = 0; i < SIGNIN_ROWS_PER_PAGE; i++) {
    const m = members[i];
    rows += `
    <tr style="height:${rowH}mm;">
      <td class="c-num">${startIdx + i + 1}</td>
      <td class="c-name">${m ? _escH(m.name) : ''}</td>
      <td></td>
      <td class="c-time">:</td>
      <td></td>
      <td></td>
    </tr>`;
  }
  return `<div class="signin-sheet">
    <div class="ss-title">BNI 億展白金分會　會員出席簽到${suffix}</div>
    <div class="ss-subtitle">${dateText}　　6:15 領導團隊應到　6:30 會員應到</div>
    <table class="ss-table">
      <colgroup>
        <col style="width:9%"><col style="width:17%"><col style="width:22%"><col style="width:16%"><col style="width:12%"><col style="width:24%">
      </colgroup>
      <thead><tr><th>序號</th><th>會員</th><th>簽名</th><th>簽到時間</th><th>收費</th><th>備註</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function _guestSheetHtml(dateText, startIdx, rowCount, pageNum, totalPages) {
  const rowH = 10; // mm，每個子列；每位來賓佔 2 子列 = 20mm
  const suffix = totalPages > 1 ? `（${pageNum}/${totalPages}）` : '';
  const weekGuests = _getWeekGuestsForSignin();
  let rows = '';
  for (let i = 1; i <= rowCount; i++) {
    const g = weekGuests[startIdx + i - 1]; // 對應本周來賓（若有）
    const infoText = g
      ? `${g.name || ''}${g.title ? ' ' + g.title : ''}${g.industry ? ' / ' + g.industry : ''}${g.inviter ? ' / ' + g.inviter : ''}`
      : '';
    const phoneText = g && g.phone ? `電話：${g.phone}` : '電話：';
    rows += `
      <tr style="height:${rowH}mm;">
        <td class="c-num" rowspan="2">${startIdx + i}</td>
        <td class="c-guest-info">${_escH(infoText)}</td>
        <td class="c-sig" rowspan="2"></td>
        <td class="c-check c-check-top">□　名　片</td>
      </tr>
      <tr style="height:${rowH}mm;">
        <td class="c-guest-phone">${_escH(phoneText)}</td>
        <td class="c-check c-check-bot">□　出席費</td>
      </tr>`;
  }
  return `<div class="signin-sheet">
    <div class="ss-title">BNI 億展白金分會　來賓出席簽到${suffix}</div>
    <div class="ss-subtitle">${dateText}</div>
    <table class="ss-table">
      <colgroup>
        <col style="width:6%"><col style="width:50%"><col style="width:20%"><col style="width:24%">
      </colgroup>
      <thead><tr><th>序號</th><th>姓名 / 產業別 / 邀請人</th><th>簽到</th><th>（由工作人員勾選）</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function _getWeekGuestsForSignin() {
  if (!_guestData) return [];
  const { mon, sun } = _weekRange();
  return _guestData.filter(g => {
    if (_isUnmatchedGuest(g)) return false;
    const d = _parseDateStr(g.firstVisit);
    return d && d >= mon && d <= sun;
  }).sort((a,b) => (a.firstVisit||'').localeCompare(b.firstVisit||''));
}

function _scaleSignin() {
  const outer = document.getElementById('signinOuter');
  const inner = document.getElementById('signinInner');
  if (!outer || !inner) return;
  const availW = outer.clientWidth;
  const baseW  = 794;  // 210mm @ 96dpi
  const scale  = Math.min(1, availW / baseW);
  inner.style.transform = `scale(${scale})`;
  inner.style.marginLeft = Math.max(0, (availW - baseW * scale) / 2) + 'px';
  // 高度以 scrollHeight（未縮放的實際高）× 縮放比例 計算
  outer.style.height = (inner.scrollHeight * scale) + 'px';
}
window.addEventListener('resize', () => { if (_activeTab === 'signin') _scaleSignin(); });

async function printSignin() {
  _pauseEditLock();
  showLoader(true, 'PDF 產生中...');
  try {
    await Promise.all([
      _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
      _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
    ]);
  } catch { showLoader(false); showToast('載入失敗，請確認網路連線'); _resumeEditLock(); return; }

  const sheets = document.querySelectorAll('#signinInner .signin-sheet');
  if (!sheets.length) { _resumeEditLock(); return; }

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:-9999px;top:0;background:white;';
  document.body.appendChild(wrap);

  try {
    const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFCtor) { showToast('jsPDF 初始化失敗'); return; /* finally 會 resume */ }
    const doc = new jsPDFCtor({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    for (let i = 0; i < sheets.length; i++) {
      wrap.innerHTML = '';
      const clone = sheets[i].cloneNode(true);
      clone.style.boxShadow = 'none';
      clone.style.marginTop = '0';
      wrap.appendChild(clone);
      const canvas = await html2canvas(clone, {
        scale: 2, useCORS: true, allowTaint: false, logging: false, backgroundColor: '#ffffff'
      });
      if (i > 0) doc.addPage();
      doc.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297);
    }
    const fn = _signinSubTab === 'member'  ? `BNI-億展分會-會員出席簽到-${_signinDate}.pdf`
             : _signinSubTab === 'guest'   ? `BNI-億展分會-來賓出席簽到-${_signinDate}.pdf`
             : `BNI-億展分會-外賓出席簽到-${_signinDate}.pdf`;
    _downloadPdfBlob(doc.output('blob'), fn);
    showToast('PDF 已下載');
  } catch {
    showToast('PDF 產生失敗，請重試');
  } finally {
    document.body.removeChild(wrap);
    showLoader(false);
    _resumeEditLock();
  }
}

