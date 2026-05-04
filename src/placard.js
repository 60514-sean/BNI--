// ===== 桌牌製作 =====
let _placardSubTab = 'guest';        // 'guest' | 'member'
let _placardMemberSelected = null;   // null = 全選；Set<sheetRow> = 自訂
let _placardMemberPanelOpen = false;

function _placardSwitch(v) { _placardSubTab = v; renderPlacard(); }

function _getSelectedMembers() {
  if (!_memberData) return [];
  if (_placardMemberSelected === null) return [..._memberData];
  return _memberData.filter(m => _placardMemberSelected.has(String(m.sheetRow)));
}

function _placardSelectAll() {
  _placardMemberSelected = null;
  document.querySelectorAll('.mplacard-selector-item input').forEach(cb => cb.checked = true);
  _placardRefreshMemberView();
}
function _placardSelectNone() {
  _placardMemberSelected = new Set();
  document.querySelectorAll('.mplacard-selector-item input').forEach(cb => cb.checked = false);
  _placardRefreshMemberView();
}
function _placardToggleMember(sheetRow) {
  const key = String(sheetRow);
  if (_placardMemberSelected === null) {
    _placardMemberSelected = new Set(_memberData.map(m => String(m.sheetRow)));
  }
  if (_placardMemberSelected.has(key)) _placardMemberSelected.delete(key);
  else _placardMemberSelected.add(key);
  _placardRefreshMemberView();
}
function _placardToggleSelectorPanel() {
  _placardMemberPanelOpen = !_placardMemberPanelOpen;
  const p = document.getElementById('mplacardPanel');
  const arrow = document.getElementById('mplacardSelArrow');
  if (p) p.style.display = _placardMemberPanelOpen ? '' : 'none';
  if (arrow) arrow.textContent = _placardMemberPanelOpen ? '▲' : '▼';
}

// 部分更新：不重建下拉選單面板，保留 scroll 位置
function _placardRefreshMemberView() {
  if (!_memberData) return;
  const sel   = _getSelectedMembers();
  const total = _memberData.length;
  const count = sel.length;
  const body  = document.getElementById('placardBody');
  if (body) body.innerHTML = _placardBodyHtml('member', [], sel);
  const desc  = document.getElementById('placardDesc');
  if (desc) desc.textContent = `已選 ${count} / ${total} 位 · ${Math.ceil(count/2)} 張 A4（每張 2 位，上下對摺為立牌）`;
  const btn   = document.getElementById('placardPdfBtn');
  if (btn) btn.disabled = count === 0;
  const selTx = document.getElementById('mplacardSelBtnText');
  if (selTx) selTx.textContent = `選擇會員（已選 ${count} / ${total} 位）`;
  _scalePlacard();
}

async function renderPlacard() {
  _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  const el = document.getElementById('placardContent');
  el.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text-soft);">載入中...</div>`;

  const tab = _placardSubTab;
  if (tab === 'guest' && _guestData === null) await fetchGuests();
  if (tab === 'guest' && _guestData === null) { el.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--red);">載入失敗，請重試 <button class="btn" style="margin-left:12px;background:var(--red);color:white;" onclick="_guestData=null;renderPlacard()">重試</button></div>`; return; }
  if (tab === 'member' && !_memberData) await fetchMembers();
  if (tab === 'member' && !_memberData) { el.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--red);">載入失敗，請重試</div>`; return; }

  const subBtn = (v, label) => `<button class="signin-subtab ${tab===v?'active':''}" onclick="_placardSwitch('${v}')">${label}</button>`;

  const weekGuests   = tab === 'guest'  ? _getWeekGuestsForSignin() : [];
  const allMembers   = tab === 'member' ? [..._memberData]           : [];
  const sel          = tab === 'member' ? _getSelectedMembers()      : [];
  const count        = tab === 'guest'  ? weekGuests.length          : sel.length;
  const totalMembers = allMembers.length;
  const title = tab === 'guest' ? '來賓桌牌' : '會員桌牌';
  const desc  = tab === 'guest'
    ? `本周 ${count} 位 · ${count} 張 A4（每張 1 位，上下對摺為立牌）`
    : `已選 ${count} / ${totalMembers} 位 · ${Math.ceil(count/2)} 張 A4（每張 2 位，上下對摺為立牌）`;

  el.innerHTML = `<div class="placard-wrapper">
    <div class="card" style="margin-bottom:14px;padding:16px 20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:16px;font-weight:900;color:var(--text);">${title}</div>
          <div id="placardDesc" style="font-size:12px;color:var(--text-soft);margin-top:3px;">${desc}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button id="placardPdfBtn" class="btn btn-primary" onclick="printPlacards()" ${count===0?'disabled':''}>匯出 PDF</button>
          <button class="btn" style="background:white;border:1.5px solid var(--gray-border);color:var(--text-soft);" onclick="${tab==='guest'?'_guestData':'_memberData'}=null;renderPlacard()">重整</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        ${subBtn('member','會員')}
        ${subBtn('guest','來賓')}
      </div>
      ${tab === 'member' ? _memberSelectorHtml(allMembers) : ''}
    </div>
    <div id="placardBody">${_placardBodyHtml(tab, weekGuests, sel)}</div>
  </div>`;
  _scalePlacard();
}

function _memberSelectorHtml(members) {
  const sel = _getSelectedMembers();
  const isSelected = (m) => _placardMemberSelected === null || _placardMemberSelected.has(String(m.sheetRow));
  const items = members.map(m => `
    <label class="mplacard-selector-item">
      <input type="checkbox" ${isSelected(m) ? 'checked' : ''} onchange="_placardToggleMember('${m.sheetRow}')">
      <span>${_escH(m.name)}</span>
    </label>`).join('');
  return `<div class="mplacard-selector">
    <button class="mplacard-selector-btn" onclick="_placardToggleSelectorPanel()">
      <span id="mplacardSelBtnText">選擇會員（已選 ${sel.length} / ${members.length} 位）</span>
      <span id="mplacardSelArrow" style="color:var(--text-soft);font-size:12px;">${_placardMemberPanelOpen ? '▲' : '▼'}</span>
    </button>
    <div class="mplacard-selector-panel" id="mplacardPanel" style="display:${_placardMemberPanelOpen ? '' : 'none'};">
      <div class="mplacard-selector-actions">
        <button onclick="_placardSelectAll()">全選</button>
        <button onclick="_placardSelectNone()">全不選</button>
      </div>
      <div class="mplacard-selector-list">${items}</div>
    </div>
  </div>`;
}

function _placardBodyHtml(tab, weekGuests, members) {
  if (tab === 'guest') {
    if (!weekGuests.length) {
      return `<div class="card" style="padding:40px 24px;text-align:center;color:var(--text-soft);">本周沒有來賓資料<br><span style="font-size:12px;">請先在「來賓追蹤」新增本周邀約的來賓</span></div>`;
    }
    return `<div class="placard-preview-outer" id="placardOuter">
        <div class="placard-preview-inner" id="placardInner">${weekGuests.map(_placardSheetHtml).join('')}</div>
      </div>`;
  }
  if (!members.length) {
    return `<div class="card" style="padding:40px 24px;text-align:center;color:var(--text-soft);">
      尚未選取任何會員<br>
      <span style="font-size:12px;">請點擊上方「選擇會員」下拉選單勾選要製作的會員</span>
    </div>`;
  }
  return `<div class="placard-preview-outer" id="placardOuter">
      <div class="placard-preview-inner" id="placardInner">${_buildMemberPlacardSheets(members)}</div>
    </div>`;
}

function _buildMemberPlacardSheets(members) {
  let html = '';
  for (let i = 0; i < members.length; i += 2) {
    html += _memberPlacardSheetHtml(members[i], members[i + 1] || null);
  }
  return html;
}

function _memberPlacardSheetHtml(memberA, memberB) {
  const bg = `background-image:url('member_bg/1.png');`;
  const content = (m) => m ? `
    <div class="mplacard-industry-box">${_escH(m.specialty || '')}</div>
    <div class="mplacard-name-box">${_escH(m.name || '')}</div>` : '';
  const rowB_empty = memberB ? '' : 'empty';
  return `<div class="placard-sheet mplacard-sheet">
    <div class="mplacard-row rotated" style="${bg}">${content(memberA)}</div>
    <div class="mplacard-row" style="${bg}">${content(memberA)}</div>
    <div class="mplacard-row rotated ${rowB_empty}" style="${bg}">${content(memberB)}</div>
    <div class="mplacard-row ${rowB_empty}" style="${bg}">${content(memberB)}</div>
  </div>`;
}

function _placardSheetHtml(g) {
  const name = _escH(g.name || '');
  const inviter = _escH(g.inviter || '');
  const industry = _escH(g.industry || '');
  const contentHtml = `
    <div class="placard-content">
      <div class="placard-industry-box">${industry}</div>
      <div class="placard-name-box">${name}</div>
      <div class="placard-inviter-box">${inviter}</div>
    </div>`;
  return `<div class="placard-sheet">
    <div class="placard-row" style="background-image:url('placard_bg/4.png');"></div>
    <div class="placard-row placard-row-upper" style="background-image:url('placard_bg/3.png');">${contentHtml}</div>
    <div class="placard-fold-line"></div>
    <div class="placard-row placard-row-lower" style="background-image:url('placard_bg/2.png');">${contentHtml}</div>
    <div class="placard-row" style="background-image:url('placard_bg/1.png');"></div>
  </div>`;
}

function _scalePlacard() {
  const outer = document.getElementById('placardOuter');
  const inner = document.getElementById('placardInner');
  if (!outer || !inner) return;
  const availW = outer.clientWidth;
  const baseW  = 794;
  const scale  = Math.min(1, availW / baseW);
  inner.style.transform = `scale(${scale})`;
  inner.style.marginLeft = Math.max(0, (availW - baseW * scale) / 2) + 'px';
  outer.style.height = (inner.scrollHeight * scale) + 'px';
}
window.addEventListener('resize', () => { if (_activeTab === 'placard') _scalePlacard(); });

async function printPlacards() {
  showLoader(true, 'PDF 產生中...');
  try {
    await Promise.all([
      _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
      _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
    ]);
  } catch { showLoader(false); showToast('載入失敗，請確認網路'); return; }

  const sheets = document.querySelectorAll('#placardInner .placard-sheet');
  if (!sheets.length) return;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:-9999px;top:0;background:white;';
  document.body.appendChild(wrap);

  try {
    const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFCtor) { showToast('jsPDF 初始化失敗'); return; }
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
    const fname = _placardSubTab === 'member' ? '會員桌牌' : '來賓桌牌';
    _downloadPdfBlob(doc.output('blob'), `BNI-${fname}-${_todayIso()}.pdf`);
    showToast('PDF 已下載');
  } catch {
    showToast('PDF 產生失敗，請重試');
  } finally {
    document.body.removeChild(wrap);
    showLoader(false);
  }
}

