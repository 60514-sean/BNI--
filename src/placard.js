// ===== 桌牌製作 =====
let _placardSubTab = 'guest';        // 'guest' | 'member' | 'director'
let _placardMemberSelected = null;   // null = 全選；Set<sheetRow> = 自訂
let _placardMemberPanelOpen = false;
let _placardGuestSelected = null;    // null = 全選；Set<year-sheetRow> = 自訂
let _placardGuestPanelOpen = false;
let _placardDirectorSelected = null; // null = 全選；Set<id> = 自訂
let _placardDirectorPanelOpen = false;
let _placardVisitorSelected = null;  // null = 全選；Set<id> = 自訂
let _placardVisitorPanelOpen = false;

function _placardSwitch(v) { _placardSubTab = v; renderPlacard(); }

// ===== 董顧資料（手動新增，存於後端 cache['__directors__']）=====
function getDirectors() {
  const v = cache['__directors__'];
  return Array.isArray(v) ? v : [];
}
async function saveDirectors(list) { await apiSave('__directors__', list); }

// ===== 外賓（外分會參訪）資料（手動新增，存於後端 cache['__visitors__']）=====
function getVisitors() {
  const v = cache['__visitors__'];
  return Array.isArray(v) ? v : [];
}
async function saveVisitors(list) { await apiSave('__visitors__', list); }

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

function _guestKey(g) { return `${g.year}-${g.sheetRow}`; }

function _getSelectedGuests() {
  const week = _getWeekGuestsForSignin();
  if (_placardGuestSelected === null) return week;
  return week.filter(g => _placardGuestSelected.has(_guestKey(g)));
}

function _placardSelectAllGuests() {
  _placardGuestSelected = null;
  document.querySelectorAll('.gplacard-selector-item input').forEach(cb => cb.checked = true);
  _placardRefreshGuestView();
}
function _placardSelectNoneGuests() {
  _placardGuestSelected = new Set();
  document.querySelectorAll('.gplacard-selector-item input').forEach(cb => cb.checked = false);
  _placardRefreshGuestView();
}
function _placardToggleGuest(key) {
  if (_placardGuestSelected === null) {
    _placardGuestSelected = new Set(_getWeekGuestsForSignin().map(_guestKey));
  }
  if (_placardGuestSelected.has(key)) _placardGuestSelected.delete(key);
  else _placardGuestSelected.add(key);
  _placardRefreshGuestView();
}
function _placardToggleGuestSelectorPanel() {
  _placardGuestPanelOpen = !_placardGuestPanelOpen;
  const p = document.getElementById('gplacardPanel');
  const arrow = document.getElementById('gplacardSelArrow');
  if (p) p.style.display = _placardGuestPanelOpen ? '' : 'none';
  if (arrow) arrow.textContent = _placardGuestPanelOpen ? '▲' : '▼';
}

// ===== 董顧選擇 =====
function _getSelectedDirectors() {
  const all = getDirectors();
  if (_placardDirectorSelected === null) return [...all];
  return all.filter(d => _placardDirectorSelected.has(String(d.id)));
}
function _placardSelectAllDirectors() {
  _placardDirectorSelected = null;
  document.querySelectorAll('.dplacard-selector-item input').forEach(cb => cb.checked = true);
  _placardRefreshDirectorView();
}
function _placardSelectNoneDirectors() {
  _placardDirectorSelected = new Set();
  document.querySelectorAll('.dplacard-selector-item input').forEach(cb => cb.checked = false);
  _placardRefreshDirectorView();
}
function _placardToggleDirector(id) {
  const key = String(id);
  if (_placardDirectorSelected === null) {
    _placardDirectorSelected = new Set(getDirectors().map(d => String(d.id)));
  }
  if (_placardDirectorSelected.has(key)) _placardDirectorSelected.delete(key);
  else _placardDirectorSelected.add(key);
  _placardRefreshDirectorView();
}
function _placardToggleDirectorSelectorPanel() {
  _placardDirectorPanelOpen = !_placardDirectorPanelOpen;
  const p = document.getElementById('dplacardPanel');
  const arrow = document.getElementById('dplacardSelArrow');
  if (p) p.style.display = _placardDirectorPanelOpen ? '' : 'none';
  if (arrow) arrow.textContent = _placardDirectorPanelOpen ? '▲' : '▼';
}

// ===== 外賓選擇 =====
function _getSelectedVisitors() {
  const all = getVisitors();
  if (_placardVisitorSelected === null) return [...all];
  return all.filter(v => _placardVisitorSelected.has(String(v.id)));
}
function _placardSelectAllVisitors() {
  _placardVisitorSelected = null;
  document.querySelectorAll('.vplacard-selector-item input').forEach(cb => cb.checked = true);
  _placardRefreshVisitorView();
}
function _placardSelectNoneVisitors() {
  _placardVisitorSelected = new Set();
  document.querySelectorAll('.vplacard-selector-item input').forEach(cb => cb.checked = false);
  _placardRefreshVisitorView();
}
function _placardToggleVisitor(id) {
  const key = String(id);
  if (_placardVisitorSelected === null) {
    _placardVisitorSelected = new Set(getVisitors().map(v => String(v.id)));
  }
  if (_placardVisitorSelected.has(key)) _placardVisitorSelected.delete(key);
  else _placardVisitorSelected.add(key);
  _placardRefreshVisitorView();
}
function _placardToggleVisitorSelectorPanel() {
  _placardVisitorPanelOpen = !_placardVisitorPanelOpen;
  const p = document.getElementById('vplacardPanel');
  const arrow = document.getElementById('vplacardSelArrow');
  if (p) p.style.display = _placardVisitorPanelOpen ? '' : 'none';
  if (arrow) arrow.textContent = _placardVisitorPanelOpen ? '▲' : '▼';
}

function _placardRefreshGuestView() {
  const week  = _getWeekGuestsForSignin();
  const sel   = _getSelectedGuests();
  const total = week.length;
  const count = sel.length;
  const body  = document.getElementById('placardBody');
  if (body) body.innerHTML = _placardBodyHtml('guest', sel, []);
  const desc  = document.getElementById('placardDesc');
  if (desc) desc.textContent = `已選 ${count} / ${total} 位 · ${count} 張 A4（每張 1 位，上下對摺為立牌）`;
  const btn   = document.getElementById('placardPdfBtn');
  if (btn) btn.disabled = count === 0;
  const selTx = document.getElementById('gplacardSelBtnText');
  if (selTx) selTx.textContent = `選擇來賓（已選 ${count} / ${total} 位）`;
  _scalePlacard();
}

function _placardRefreshDirectorView() {
  const all   = getDirectors();
  const sel   = _getSelectedDirectors();
  const total = all.length;
  const count = sel.length;
  const body  = document.getElementById('placardBody');
  if (body) body.innerHTML = _placardBodyHtml('director', [], sel);
  const desc  = document.getElementById('placardDesc');
  if (desc) desc.textContent = `已選 ${count} / ${total} 位 · ${Math.ceil(count/2)} 張 A4（每張 2 位，上下對摺為立牌）`;
  const btn   = document.getElementById('placardPdfBtn');
  if (btn) btn.disabled = count === 0;
  const selTx = document.getElementById('dplacardSelBtnText');
  if (selTx) selTx.textContent = `選擇董顧（已選 ${count} / ${total} 位）`;
  _scalePlacard();
}

function _placardRefreshVisitorView() {
  const all   = getVisitors();
  const sel   = _getSelectedVisitors();
  const total = all.length;
  const count = sel.length;
  const body  = document.getElementById('placardBody');
  if (body) body.innerHTML = _placardBodyHtml('visitor', sel, []);
  const desc  = document.getElementById('placardDesc');
  if (desc) desc.textContent = `已選 ${count} / ${total} 位 · ${count} 張 A4（每張 1 位，上下對摺為立牌）`;
  const btn   = document.getElementById('placardPdfBtn');
  if (btn) btn.disabled = count === 0;
  const selTx = document.getElementById('vplacardSelBtnText');
  if (selTx) selTx.textContent = `選擇外賓（已選 ${count} / ${total} 位）`;
  _scalePlacard();
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

  const weekGuests   = tab === 'guest'    ? _getWeekGuestsForSignin() : [];
  const allMembers   = tab === 'member'   ? [..._memberData]          : [];
  const allDirectors = tab === 'director' ? getDirectors()            : [];
  const allVisitors  = tab === 'visitor'  ? getVisitors()             : [];
  const selGuests    = tab === 'guest'    ? _getSelectedGuests()      : [];
  const sel          = tab === 'member'   ? _getSelectedMembers()     : [];
  const selDirectors = tab === 'director' ? _getSelectedDirectors()   : [];
  const selVisitors  = tab === 'visitor'  ? _getSelectedVisitors()    : [];
  let count, total, title, desc;
  if (tab === 'guest')        { count = selGuests.length;    total = weekGuests.length;   title = '來賓桌牌'; desc = `已選 ${count} / ${total} 位 · ${count} 張 A4（每張 1 位，上下對摺為立牌）`; }
  else if (tab === 'member')  { count = sel.length;          total = allMembers.length;   title = '會員桌牌'; desc = `已選 ${count} / ${total} 位 · ${Math.ceil(count/2)} 張 A4（每張 2 位，上下對摺為立牌）`; }
  else if (tab === 'director'){ count = selDirectors.length; total = allDirectors.length; title = '董顧桌牌'; desc = `已選 ${count} / ${total} 位 · ${Math.ceil(count/2)} 張 A4（每張 2 位，上下對摺為立牌）`; }
  else                        { count = selVisitors.length;  total = allVisitors.length;  title = '外賓桌牌'; desc = `已選 ${count} / ${total} 位 · ${count} 張 A4（每張 1 位，上下對摺為立牌）`; }

  const refreshExpr = tab === 'guest' ? '_guestData=null;renderPlacard()'
                    : tab === 'member' ? '_memberData=null;renderPlacard()'
                    : '_bgRefresh().then(()=>renderPlacard())';

  let bodyArg1, bodyArg2;
  if (tab === 'guest')         { bodyArg1 = selGuests;    bodyArg2 = []; }
  else if (tab === 'member')   { bodyArg1 = weekGuests;   bodyArg2 = sel; }
  else if (tab === 'director') { bodyArg1 = [];           bodyArg2 = selDirectors; }
  else                         { bodyArg1 = selVisitors;  bodyArg2 = []; }

  el.innerHTML = `<div class="placard-wrapper">
    <div class="card" style="margin-bottom:14px;padding:16px 20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:16px;font-weight:900;color:var(--text);">${title}</div>
          <div id="placardDesc" style="font-size:12px;color:var(--text-soft);margin-top:3px;">${desc}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${tab === 'director' ? `<button class="btn" style="background:white;border:1.5px solid var(--gray-border);color:var(--text);" onclick="_placardOpenDirectorManager()">管理董顧</button>` : ''}
          ${tab === 'visitor'  ? `<button class="btn" style="background:white;border:1.5px solid var(--gray-border);color:var(--text);" onclick="_placardOpenVisitorManager()">管理外賓</button>` : ''}
          <button id="placardPdfBtn" class="btn btn-primary" onclick="printPlacards()" ${count===0?'disabled':''}>匯出 PDF</button>
          <button class="btn" style="background:white;border:1.5px solid var(--gray-border);color:var(--text-soft);" onclick="${refreshExpr}">重整</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        ${subBtn('member','會員')}
        ${subBtn('guest','來賓')}
        ${subBtn('director','董顧')}
        ${subBtn('visitor','外賓')}
      </div>
      ${tab === 'member'   ? _memberSelectorHtml(allMembers)     : ''}
      ${tab === 'guest'    ? _guestSelectorHtml(weekGuests)      : ''}
      ${tab === 'director' ? _directorSelectorHtml(allDirectors) : ''}
      ${tab === 'visitor'  ? _visitorSelectorHtml(allVisitors)   : ''}
    </div>
    <div id="placardBody">${_placardBodyHtml(tab, bodyArg1, bodyArg2)}</div>
  </div>`;
  _scalePlacard();
}

function _guestSelectorHtml(guests) {
  const sel = _getSelectedGuests();
  const isSelected = (g) => _placardGuestSelected === null || _placardGuestSelected.has(_guestKey(g));
  if (!guests.length) return '';
  const items = guests.map(g => `
    <label class="mplacard-selector-item gplacard-selector-item">
      <input type="checkbox" ${isSelected(g) ? 'checked' : ''} onchange="_placardToggleGuest('${_guestKey(g)}')">
      <span>${_escH(g.name || '')}</span>
    </label>`).join('');
  return `<div class="mplacard-selector">
    <button class="mplacard-selector-btn" onclick="_placardToggleGuestSelectorPanel()">
      <span id="gplacardSelBtnText">選擇來賓（已選 ${sel.length} / ${guests.length} 位）</span>
      <span id="gplacardSelArrow" style="color:var(--text-soft);font-size:12px;">${_placardGuestPanelOpen ? '▲' : '▼'}</span>
    </button>
    <div class="mplacard-selector-panel" id="gplacardPanel" style="display:${_placardGuestPanelOpen ? '' : 'none'};">
      <div class="mplacard-selector-actions">
        <button onclick="_placardSelectAllGuests()">全選</button>
        <button onclick="_placardSelectNoneGuests()">全不選</button>
      </div>
      <div class="mplacard-selector-list">${items}</div>
    </div>
  </div>`;
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

function _visitorSelectorHtml(visitors) {
  const sel = _getSelectedVisitors();
  const isSelected = (v) => _placardVisitorSelected === null || _placardVisitorSelected.has(String(v.id));
  if (!visitors.length) {
    return `<div class="mplacard-selector" style="padding:12px 0;color:var(--text-soft);font-size:13px;">
      尚無外賓資料，請點右上「管理外賓」新增。
    </div>`;
  }
  const items = visitors.map(v => `
    <label class="mplacard-selector-item vplacard-selector-item">
      <input type="checkbox" ${isSelected(v) ? 'checked' : ''} onchange="_placardToggleVisitor('${_escH(v.id)}')">
      <span>${_escH(v.name || '')}${v.industry ? `<span style="color:var(--text-soft);font-size:12px;margin-left:6px;">${_escH(v.industry)}</span>` : ''}</span>
    </label>`).join('');
  return `<div class="mplacard-selector">
    <button class="mplacard-selector-btn" onclick="_placardToggleVisitorSelectorPanel()">
      <span id="vplacardSelBtnText">選擇外賓（已選 ${sel.length} / ${visitors.length} 位）</span>
      <span id="vplacardSelArrow" style="color:var(--text-soft);font-size:12px;">${_placardVisitorPanelOpen ? '▲' : '▼'}</span>
    </button>
    <div class="mplacard-selector-panel" id="vplacardPanel" style="display:${_placardVisitorPanelOpen ? '' : 'none'};">
      <div class="mplacard-selector-actions">
        <button onclick="_placardSelectAllVisitors()">全選</button>
        <button onclick="_placardSelectNoneVisitors()">全不選</button>
      </div>
      <div class="mplacard-selector-list">${items}</div>
    </div>
  </div>`;
}

function _directorSelectorHtml(directors) {
  const sel = _getSelectedDirectors();
  const isSelected = (d) => _placardDirectorSelected === null || _placardDirectorSelected.has(String(d.id));
  if (!directors.length) {
    return `<div class="mplacard-selector" style="padding:12px 0;color:var(--text-soft);font-size:13px;">
      尚無董顧資料，請點右上「管理董顧」新增。
    </div>`;
  }
  const items = directors.map(d => `
    <label class="mplacard-selector-item dplacard-selector-item">
      <input type="checkbox" ${isSelected(d) ? 'checked' : ''} onchange="_placardToggleDirector('${_escH(d.id)}')">
      <span>${_escH(d.name || '')}${d.specialty ? `<span style="color:var(--text-soft);font-size:12px;margin-left:6px;">${_escH(d.specialty)}</span>` : ''}</span>
    </label>`).join('');
  return `<div class="mplacard-selector">
    <button class="mplacard-selector-btn" onclick="_placardToggleDirectorSelectorPanel()">
      <span id="dplacardSelBtnText">選擇董顧（已選 ${sel.length} / ${directors.length} 位）</span>
      <span id="dplacardSelArrow" style="color:var(--text-soft);font-size:12px;">${_placardDirectorPanelOpen ? '▲' : '▼'}</span>
    </button>
    <div class="mplacard-selector-panel" id="dplacardPanel" style="display:${_placardDirectorPanelOpen ? '' : 'none'};">
      <div class="mplacard-selector-actions">
        <button onclick="_placardSelectAllDirectors()">全選</button>
        <button onclick="_placardSelectNoneDirectors()">全不選</button>
      </div>
      <div class="mplacard-selector-list">${items}</div>
    </div>
  </div>`;
}

function _placardBodyHtml(tab, weekGuests, members) {
  if (tab === 'guest') {
    const totalWeek = _getWeekGuestsForSignin().length;
    if (!totalWeek) {
      return `<div class="card" style="padding:40px 24px;text-align:center;color:var(--text-soft);">本周沒有來賓資料<br><span style="font-size:12px;">請先在「來賓追蹤」新增本周邀約的來賓</span></div>`;
    }
    if (!weekGuests.length) {
      return `<div class="card" style="padding:40px 24px;text-align:center;color:var(--text-soft);">
        尚未選取任何來賓<br>
        <span style="font-size:12px;">請點擊上方「選擇來賓」下拉選單勾選要製作的來賓</span>
      </div>`;
    }
    return `<div class="placard-preview-outer" id="placardOuter">
        <div class="placard-preview-inner" id="placardInner">${weekGuests.map(_placardSheetHtml).join('')}</div>
      </div>`;
  }
  if (tab === 'director') {
    const totalAll = getDirectors().length;
    if (!totalAll) {
      return `<div class="card" style="padding:40px 24px;text-align:center;color:var(--text-soft);">
        尚無董顧資料<br>
        <span style="font-size:12px;">請點擊右上「管理董顧」新增姓名與職稱</span>
      </div>`;
    }
    if (!members.length) {
      return `<div class="card" style="padding:40px 24px;text-align:center;color:var(--text-soft);">
        尚未選取任何董顧<br>
        <span style="font-size:12px;">請點擊上方「選擇董顧」下拉選單勾選要製作的董顧</span>
      </div>`;
    }
    return `<div class="placard-preview-outer" id="placardOuter">
        <div class="placard-preview-inner" id="placardInner">${_buildMemberPlacardSheets(members)}</div>
      </div>`;
  }
  if (tab === 'visitor') {
    const visitors = weekGuests;  // visitor 分頁時 bodyArg1 為已選外賓清單
    const totalAll = getVisitors().length;
    if (!totalAll) {
      return `<div class="card" style="padding:40px 24px;text-align:center;color:var(--text-soft);">
        尚無外賓資料<br>
        <span style="font-size:12px;">請點擊右上「管理外賓」新增姓名、產業與職稱</span>
      </div>`;
    }
    if (!visitors.length) {
      return `<div class="card" style="padding:40px 24px;text-align:center;color:var(--text-soft);">
        尚未選取任何外賓<br>
        <span style="font-size:12px;">請點擊上方「選擇外賓」下拉選單勾選要製作的外賓</span>
      </div>`;
    }
    return `<div class="placard-preview-outer" id="placardOuter">
        <div class="placard-preview-inner" id="placardInner">${visitors.map(_visitorSheetHtml).join('')}</div>
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

// 外賓專用：背景圖右下角內建「外賓」字樣；職稱以黑底白字小框顯示（比照來賓黑色框框位置）
function _visitorSheetHtml(g) {
  const name = _escH(g.name || '');
  const industry = _escH(g.industry || '');
  const title = _escH(g.inviter || '');  // 內部沿用 inviter 欄位，UI 顯示為「職稱」
  // 黑色框（位置/尺寸比照來賓 .placard-inviter-box，右側齊右對齊「賓」字）
  const titleBox = title
    ? `<div style="position:absolute;right:12%;top:85.97%;width:30%;height:11.40%;display:flex;align-items:center;justify-content:flex-end;color:white;font-size:8.5mm;font-weight:700;letter-spacing:1mm;padding-right:0;line-height:1;white-space:nowrap;z-index:3;box-sizing:border-box;">${title}</div>`
    : '';
  const contentHtml = `
    <div class="placard-content" style="z-index:2;">
      <div class="placard-industry-box">${industry}</div>
      <div class="placard-name-box">${name}</div>
      ${titleBox}
    </div>`;
  // 上半部底圖需 180 度（對摺後正向）；用內層 div 包住底圖層 rotate，不影響 placard-content
  const upperBg = `<div style="position:absolute;inset:0;background-image:url('placard_bg/visitor.jpg');background-size:100% 100%;background-repeat:no-repeat;transform:rotate(180deg);z-index:0;"></div>`;
  const lowerBg = `<div style="position:absolute;inset:0;background-image:url('placard_bg/visitor.jpg');background-size:100% 100%;background-repeat:no-repeat;z-index:0;"></div>`;
  return `<div class="placard-sheet">
    <div class="placard-row" style="background-image:url('placard_bg/4.png');"></div>
    <div class="placard-row placard-row-upper">${upperBg}${contentHtml}</div>
    <div class="placard-fold-line"></div>
    <div class="placard-row placard-row-lower">${lowerBg}${contentHtml}</div>
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

// ===== 高解析 PDF 工具 =====
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
async function _rotateImageDataURL(dataURL, deg) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(deg * Math.PI / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = dataURL;
  });
}
function _extractBgUrl(el) {
  const bg = el.style?.backgroundImage || '';
  const m = bg.match(/url\(['"]?([^'")]+)['"]?\)/);
  return m ? m[1] : null;
}
function _isRotated180Placard(el, sheetEl) {
  let count = 0;
  let p = el;
  while (p && p !== sheetEl.parentElement) {
    if (p.classList && p.classList.contains('rotated')) count++;
    const t = p.style?.transform || '';
    if (/rotate\s*\(\s*180/.test(t)) count++;
    if (p === sheetEl) break;
    p = p.parentElement;
  }
  return count % 2 === 1;
}

async function printPlacards() {
  _pauseEditLock();
  showLoader(true, 'PDF 產生中...');
  try {
    await Promise.all([
      _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
      _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
    ]);
  } catch { showLoader(false); showToast('載入失敗，請確認網路'); _resumeEditLock(); return; }

  const sheets = document.querySelectorAll('#placardInner .placard-sheet');
  if (!sheets.length) { _resumeEditLock(); return; }

  // 蒐集所有 inline background-image 的 URL，預載成 DataURL + 180 度版本
  const urlSet = new Set();
  sheets.forEach(s => {
    s.querySelectorAll('[style*="background-image"]').forEach(el => {
      const u = _extractBgUrl(el);
      if (u) urlSet.add(u);
    });
  });
  const bgCache = {};
  for (const u of urlSet) {
    try {
      const normal = await _fetchAsDataURL(u);
      bgCache[u] = { normal, rotated180: await _rotateImageDataURL(normal, 180) };
    } catch {}
  }

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:-9999px;top:0;background:transparent;';
  document.body.appendChild(wrap);

  try {
    const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFCtor) { showToast('jsPDF 初始化失敗'); return; }
    const doc = new jsPDFCtor({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const A4W = 210, A4H = 297;

    for (let i = 0; i < sheets.length; i++) {
      if (i > 0) doc.addPage();
      const sheet = sheets[i];
      const sheetRect = sheet.getBoundingClientRect();

      // 1) 對每個有 background-image 的元素，按位置直接 addImage 原圖（保留底圖原解析度）
      const bgEls = sheet.querySelectorAll('[style*="background-image"]');
      for (const el of bgEls) {
        const url = _extractBgUrl(el);
        if (!url || !bgCache[url]) continue;
        const r = el.getBoundingClientRect();
        const x = (r.left - sheetRect.left) / sheetRect.width  * A4W;
        const y = (r.top  - sheetRect.top ) / sheetRect.height * A4H;
        const w = r.width  / sheetRect.width  * A4W;
        const h = r.height / sheetRect.height * A4H;
        const rotated = _isRotated180Placard(el, sheet);
        const data = rotated ? bgCache[url].rotated180 : bgCache[url].normal;
        const fmt = url.toLowerCase().endsWith('.png') ? 'PNG' : 'JPEG';
        doc.addImage(data, fmt, x, y, w, h);
      }

      // 2) html2canvas 抓無底圖的文字層，疊上去
      wrap.innerHTML = '';
      const clone = sheet.cloneNode(true);
      clone.querySelectorAll('[style*="background-image"]').forEach(el => {
        el.style.backgroundImage = 'none';
        el.style.background = 'transparent';
      });
      clone.style.boxShadow = 'none';
      clone.style.marginTop = '0';
      clone.style.background = 'transparent';
      wrap.appendChild(clone);
      const canvas = await html2canvas(clone, {
        scale: 3, useCORS: true, allowTaint: false, logging: false, backgroundColor: null
      });
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, A4W, A4H);
    }
    const fname = _placardSubTab === 'member' ? '會員桌牌'
                : _placardSubTab === 'director' ? '董顧桌牌'
                : _placardSubTab === 'visitor' ? '外賓桌牌'
                : '來賓桌牌';
    _downloadPdfBlob(doc.output('blob'), `BNI-${fname}-${_todayIso()}.pdf`);
    showToast('PDF 已下載');
  } catch (e) {
    console.error(e);
    showToast('PDF 產生失敗，請重試');
  } finally {
    document.body.removeChild(wrap);
    showLoader(false);
    _resumeEditLock();
  }
}

// ===== 管理董顧 modal =====
function _placardDirectorRowHtml(d) {
  const id = _escH(d && d.id != null ? d.id : ('new-' + Date.now() + '-' + Math.random().toString(36).slice(2,8)));
  const name = _escH(d && d.name || '');
  const spec = _escH(d && d.specialty || '');
  return `<div class="director-edit-row" data-id="${id}" style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">
    <input class="modal-input" data-field="name" value="${name}" placeholder="姓名" style="flex:1;">
    <input class="modal-input" data-field="specialty" value="${spec}" placeholder="職稱" style="flex:1;">
    <button type="button" class="modal-del" style="padding:9px 12px;font-size:13px;margin:0;" onclick="this.closest('.director-edit-row').remove()">刪除</button>
  </div>`;
}
function _placardOpenDirectorManager() {
  const list = getDirectors();
  const itemHtml = list.map(_placardDirectorRowHtml).join('');
  const html = `<div class="modal-overlay" id="directorMgrModal" onclick="if(event.target===this) _placardCloseDirectorManager()">
    <div class="modal-box">
      <div class="modal-title">管理董顧名單</div>
      <div style="font-size:12px;color:var(--text-soft);margin-bottom:10px;">每筆需填寫姓名（必填）與職稱。空白姓名儲存時會被忽略。</div>
      <div id="directorEditList">${itemHtml}</div>
      <button type="button" class="btn" style="margin-top:6px;background:white;border:1.5px solid var(--gray-border);color:var(--text);" onclick="_placardDirectorAddRow()">＋ 新增一筆</button>
      <div class="modal-btns">
        <button type="button" class="modal-cancel" onclick="_placardCloseDirectorManager()">取消</button>
        <button type="button" class="modal-save" onclick="_placardSaveDirectors()">儲存</button>
      </div>
    </div>
  </div>`;
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap.firstChild);
}
function _placardCloseDirectorManager() {
  const m = document.getElementById('directorMgrModal');
  if (m) m.remove();
}
function _placardDirectorAddRow() {
  const list = document.getElementById('directorEditList');
  if (!list) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = _placardDirectorRowHtml(null);
  list.appendChild(tmp.firstChild);
}
async function _placardSaveDirectors() {
  const rows = document.querySelectorAll('#directorEditList .director-edit-row');
  const out = [];
  rows.forEach(r => {
    const id = r.dataset.id || ('d-' + Date.now() + '-' + Math.random().toString(36).slice(2,8));
    const name = (r.querySelector('[data-field="name"]')?.value || '').trim();
    const specialty = (r.querySelector('[data-field="specialty"]')?.value || '').trim();
    if (!name) return;
    out.push({ id, name, specialty });
  });
  await saveDirectors(out);
  _placardDirectorSelected = null;
  _placardCloseDirectorManager();
  showToast('已儲存董顧名單');
  if (_placardSubTab === 'director') renderPlacard();
}

// ===== 管理外賓 modal =====
function _placardVisitorRowHtml(v) {
  const id = _escH(v && v.id != null ? v.id : ('new-' + Date.now() + '-' + Math.random().toString(36).slice(2,8)));
  const name     = _escH(v && v.name     || '');
  const industry = _escH(v && v.industry || '');
  const inviter  = _escH(v && v.inviter  || '');
  return `<div class="visitor-edit-row" data-id="${id}" style="display:flex;gap:8px;margin-bottom:8px;align-items:center;flex-wrap:wrap;">
    <input class="modal-input" data-field="name"     value="${name}"     placeholder="姓名"   style="flex:1 1 110px;min-width:90px;">
    <input class="modal-input" data-field="industry" value="${industry}" placeholder="產業"   style="flex:1 1 110px;min-width:90px;">
    <input class="modal-input" data-field="inviter"  value="${inviter}"  placeholder="職稱" style="flex:1 1 110px;min-width:90px;">
    <button type="button" class="modal-del" style="padding:9px 12px;font-size:13px;margin:0;" onclick="this.closest('.visitor-edit-row').remove()">刪除</button>
  </div>`;
}
function _placardOpenVisitorManager() {
  const list = getVisitors();
  const itemHtml = list.map(_placardVisitorRowHtml).join('');
  const html = `<div class="modal-overlay" id="visitorMgrModal" onclick="if(event.target===this) _placardCloseVisitorManager()">
    <div class="modal-box">
      <div class="modal-title">管理外賓名單（外分會參訪）</div>
      <div style="font-size:12px;color:var(--text-soft);margin-bottom:10px;">每筆需填寫姓名（必填）、產業、職稱。空白姓名儲存時會被忽略。</div>
      <div id="visitorEditList">${itemHtml}</div>
      <button type="button" class="btn" style="margin-top:6px;background:white;border:1.5px solid var(--gray-border);color:var(--text);" onclick="_placardVisitorAddRow()">＋ 新增一筆</button>
      <div class="modal-btns">
        <button type="button" class="modal-cancel" onclick="_placardCloseVisitorManager()">取消</button>
        <button type="button" class="modal-save" onclick="_placardSaveVisitors()">儲存</button>
      </div>
    </div>
  </div>`;
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap.firstChild);
}
function _placardCloseVisitorManager() {
  const m = document.getElementById('visitorMgrModal');
  if (m) m.remove();
}
function _placardVisitorAddRow() {
  const list = document.getElementById('visitorEditList');
  if (!list) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = _placardVisitorRowHtml(null);
  list.appendChild(tmp.firstChild);
}
async function _placardSaveVisitors() {
  const rows = document.querySelectorAll('#visitorEditList .visitor-edit-row');
  const out = [];
  rows.forEach(r => {
    const id = r.dataset.id || ('v-' + Date.now() + '-' + Math.random().toString(36).slice(2,8));
    const name     = (r.querySelector('[data-field="name"]')?.value     || '').trim();
    const industry = (r.querySelector('[data-field="industry"]')?.value || '').trim();
    const inviter  = (r.querySelector('[data-field="inviter"]')?.value  || '').trim();
    if (!name) return;
    out.push({ id, name, industry, inviter });
  });
  await saveVisitors(out);
  _placardVisitorSelected = null;
  _placardCloseVisitorManager();
  showToast('已儲存外賓名單');
  if (_placardSubTab === 'visitor') renderPlacard();
}
