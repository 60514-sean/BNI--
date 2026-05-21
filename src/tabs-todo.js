// ===== PAGE TAB =====
let _activeTab = 'main';

const TAB_LABELS = {
  todo:'待辦事項', main:'工事清單', member:'會員資料', renewal:'續約管理', dm:'會員DM', slogan:'會員口號', plate:'車牌登記',
  signin:'出席簽到', guesttrack:'來賓追蹤', placard:'桌牌', nameplate:'名牌', cardholder:'名片盒', schedule:'簡報排程',
  finance:'財務控管', meeting:'流程表', sanchang:'三長周會', leadership:'領導月會', report:'報告內容', settings:'系統設定'
};

function switchTab(tab) {
  // settings 不是一般 tab，由 openSettings 自行處理；避免 _bgRefresh 後重渲染把 settings 畫面隱藏
  if (tab === 'settings') return;
  _activeTab = tab;
  document.getElementById('todoContent').style.display       = tab === 'todo'       ? '' : 'none';
  document.getElementById('mainContent').style.display       = tab === 'main'       ? '' : 'none';
  document.getElementById('memberContent').style.display     = tab === 'member'     ? '' : 'none';
  document.getElementById('renewalContent').style.display    = tab === 'renewal'    ? '' : 'none';
  document.getElementById('dmContent').style.display         = tab === 'dm'         ? '' : 'none';
  document.getElementById('sloganContent').style.display     = tab === 'slogan'     ? '' : 'none';
  document.getElementById('plateContent').style.display      = tab === 'plate'      ? '' : 'none';
  document.getElementById('signinContent').style.display     = tab === 'signin'     ? '' : 'none';
  document.getElementById('guestTrackContent').style.display = tab === 'guesttrack' ? '' : 'none';
  document.getElementById('placardContent').style.display    = tab === 'placard'    ? '' : 'none';
  document.getElementById('nameplateContent').style.display  = tab === 'nameplate'  ? '' : 'none';
  document.getElementById('cardholderContent').style.display = tab === 'cardholder' ? '' : 'none';
  document.getElementById('scheduleContent').style.display   = tab === 'schedule'   ? '' : 'none';
  document.getElementById('financeContent').style.display    = tab === 'finance'    ? '' : 'none';
  document.getElementById('meetingContent').style.display    = tab === 'meeting'    ? '' : 'none';
  document.getElementById('sanchangContent').style.display   = tab === 'sanchang'   ? '' : 'none';
  document.getElementById('leadershipContent').style.display = tab === 'leadership' ? '' : 'none';
  document.getElementById('reportContent').style.display     = tab === 'report'     ? '' : 'none';
  _updateMenuActive(tab);
  const label = TAB_LABELS[tab] || '';
  const ml = document.getElementById('menuLabel');
  if (ml) ml.textContent = label;
  if (tab === 'todo')       renderTodo();
  if (tab === 'main')       renderMain();
  if (tab === 'member')     renderMembers();
  if (tab === 'renewal')    renderRenewal();
  if (tab === 'dm')         renderDM();
  if (tab === 'slogan')     renderSlogan();
  if (tab === 'plate')      renderPlate();
  if (tab === 'signin')     renderSignin();
  if (tab === 'guesttrack') renderGuestTrack();
  if (tab === 'placard')    renderPlacard();
  if (tab === 'nameplate')  renderNameplate();
  if (tab === 'cardholder') renderCardholder();
  if (tab === 'schedule')   renderSchedule();
  if (tab === 'finance')    renderFinance();
  if (tab === 'meeting')    renderMeeting();
  if (tab === 'sanchang')   renderSanchang();
  if (tab === 'leadership') renderLeadership();
  if (tab === 'report')     renderReport();
}

function _updateMenuActive(tab) {
  document.querySelectorAll('.menu-item, .menu-tile').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
}

function _renderMenuDropdown(allowedIds, isAdmin) {
  const dd = document.getElementById('menuDropdown');
  if (!dd) return;
  const groups = {};
  TAB_LIST.forEach(t => {
    if (!allowedIds.includes(t.id)) return;
    (groups[t.group] = groups[t.group] || []).push(t);
  });
  const groupHtml = MENU_GROUP_ORDER.filter(g => groups[g]).map(g =>
    `<div class="menu-group-title">${g}</div>` +
    `<div class="menu-grid">` +
    groups[g].map(t => `<button class="menu-tile" data-tab="${t.id}" onclick="_pickTab('${t.id}')">${t.label}</button>`).join('') +
    `</div>`
  ).join('');
  const settingsItem = isAdmin
    ? `<button class="menu-item menu-settings" data-tab="settings" onclick="_pickTab('settings')">系統設定</button>`
    : '';
  const logoutItem = `<button class="menu-item menu-settings" onclick="closeMenu();doLogout();">登出休息</button>`;
  dd.innerHTML = groupHtml + `<div class="menu-divider"></div>` + settingsItem + logoutItem;
  _updateMenuActive(_activeTab);
}

function toggleMenu(ev) {
  if (ev) { ev.stopPropagation(); }
  const dd = document.getElementById('menuDropdown');
  if (!dd) return;
  dd.classList.toggle('show');
}
function closeMenu() {
  document.getElementById('menuDropdown')?.classList.remove('show');
}
// 點 dropdown 與按鈕以外的地方時關閉
document.addEventListener('click', (e) => {
  const dd = document.getElementById('menuDropdown');
  if (!dd || !dd.classList.contains('show')) return;
  if (e.target.closest('#menuBtn') || e.target.closest('#menuDropdown')) return;
  dd.classList.remove('show');
});
function _pickTab(tab) {
  closeMenu();
  if (tab === 'settings') openSettings();
  else switchTab(tab);
}

// ===== TODO =====
let _editingTodoId = null;
function _getTodos() { return getMyTodos(); }
function _saveTodos(list) { saveMyTodos(list); }
// 啟動時清掉舊版單機 localStorage（避免跨使用者污染）
try { localStorage.removeItem('bni_todos'); } catch {}

// 從文字中萃取日期，回傳 timestamp。支援：YYYY/MM/DD、YYYY-MM-DD、(YYYY年)M月D日、M/D、M-D
function _parseTodoDate(text) {
  if (!text) return null;
  const now = new Date();
  const yearNow = now.getFullYear();
  let m;
  m = text.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]).getTime();
  m = text.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/);
  if (m) return new Date(+(m[1]||yearNow), +m[2]-1, +m[3]).getTime();
  m = text.match(/(?:^|[^\d\/\-])(\d{1,2})[\/\-](\d{1,2})(?:$|[^\d\/\-])/);
  if (m) return new Date(yearNow, +m[1]-1, +m[2]).getTime();
  return null;
}

// 排序：無日期優先（保留原順序）→ 有日期者依日期由近到遠
function _sortTodos(list) {
  return list.map((t, i) => ({ t, i, d: _parseTodoDate(t.text) }))
    .sort((a, b) => {
      if (a.d == null && b.d == null) return a.i - b.i;
      if (a.d == null) return -1;
      if (b.d == null) return 1;
      return a.d - b.d || a.i - b.i;
    })
    .map(x => x.t);
}

function _getMyMessage() {
  if (!CU) return '';
  if (CR === 'admin') return ''; // 管理員不顯示留言
  return (getConfig().messages || {})[CU] || '';
}

function renderTodo() {
  const todos = _sortTodos(_getTodos());
  const done  = todos.filter(t => t.done);
  const todo  = todos.filter(t => !t.done);
  const total = todos.length;
  const pct   = total ? Math.round(done.length / total * 100) : 0;
  const myMsg = _getMyMessage();

  const itemHtml = (t) => {
    const editing = _editingTodoId === t.id;
    const textPart = editing
      ? `<input class="todo-edit-input" id="todoEdit_${t.id}" type="text" value="${_escH(t.text)}"
          onkeydown="_onEditKey(event,'${t.id}')"
          onblur="_commitEditTodo('${t.id}',this.value)">`
      : `<span class="todo-text" onclick="_startEditTodo('${t.id}')" title="點擊編輯">${_escH(t.text)}</span>`;
    return `
    <div class="todo-row${t.done?' is-done':''}">
      <label class="todo-cb-wrap">
        <input type="checkbox" ${t.done?'checked':''} onchange="toggleTodo('${t.id}')">
        <span class="todo-cb">
          ${t.done?`<svg width="12" height="10" viewBox="0 0 11 9" fill="none"><path d="M1 4L4.5 7.5L10 1" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`:''}
        </span>
      </label>
      ${textPart}
      <button class="todo-del" onclick="deleteTodo('${t.id}')" aria-label="刪除">&times;</button>
    </div>`;
  };

  const summaryHtml = total ? `
    <div class="todo-summary">
      <div class="todo-summary-stat">
        <span class="todo-summary-num">${todo.length}</span>
        <span class="todo-summary-lbl">待辦</span>
      </div>
      <div class="todo-summary-stat">
        <span class="todo-summary-num">${done.length}</span>
        <span class="todo-summary-lbl">已完成</span>
      </div>
      <div class="todo-summary-stat">
        <span class="todo-summary-num">${pct}%</span>
        <span class="todo-summary-lbl">完成率</span>
      </div>
      <div class="todo-summary-bar"><div class="todo-summary-bar-fill" style="width:${pct}%"></div></div>
    </div>` : '';

  const todoSection = todo.length ? `
    <div class="todo-section">
      <div class="todo-section-title">
        <span class="todo-section-dot" style="background:var(--red);"></span>
        進行中
        <span class="todo-section-count">${todo.length}</span>
      </div>
      <div class="todo-section-body">${todo.map(itemHtml).join('')}</div>
    </div>` : '';

  const doneSection = done.length ? `
    <div class="todo-section">
      <div class="todo-section-title">
        <span class="todo-section-dot" style="background:var(--green);"></span>
        已完成
        <span class="todo-section-count" style="background:var(--green);">${done.length}</span>
        <button class="todo-clear-btn" onclick="clearDoneTodos()">清除</button>
      </div>
      <div class="todo-section-body">${done.map(itemHtml).join('')}</div>
    </div>` : '';

  const emptyHtml = !total ? `
    <div class="todo-empty">
      <div class="todo-empty-icon">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 11l3 3L22 4"></path>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
        </svg>
      </div>
      <div class="todo-empty-title">還沒有待辦事項</div>
      <div class="todo-empty-desc">新增第一項，開始今天的計畫</div>
    </div>` : '';

  const messageHtml = myMsg ? `
    <div class="todo-message">
      <div class="todo-message-text">${_escH(myMsg)}</div>
    </div>` : '';

  document.getElementById('todoContent').innerHTML = `
    <div class="todo-wrap">
      ${messageHtml}
      ${summaryHtml}
      <div class="todo-input-card">
        <input id="todoInput" type="text" placeholder="輸入待辦事項…" onkeydown="if(event.key==='Enter')addTodo()" autocomplete="off">
        <button onclick="addTodo()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新增
        </button>
      </div>
      ${todoSection}
      ${doneSection}
      ${emptyHtml}
    </div>`;

  if (_editingTodoId) {
    const ip = document.getElementById(`todoEdit_${_editingTodoId}`);
    if (ip) { ip.focus(); ip.setSelectionRange(ip.value.length, ip.value.length); }
  }
}

function _startEditTodo(id) {
  if (_editingTodoId === id) return;
  _editingTodoId = id;
  renderTodo();
}

function _commitEditTodo(id, val) {
  if (_editingTodoId !== id) return; // 已被其他事件處理過
  const text = (val || '').trim();
  _editingTodoId = null;
  if (!text) { renderTodo(); return; } // 空字串視為取消
  const todos = _getTodos();
  const t = todos.find(x => x.id === id);
  if (t && t.text !== text) { t.text = text; _saveTodos(todos); }
  renderTodo();
}

function _cancelEditTodo() {
  if (!_editingTodoId) return;
  _editingTodoId = null;
  renderTodo();
}

function _onEditKey(ev, id) {
  if (ev.key === 'Enter') { ev.preventDefault(); ev.target.blur(); }
  else if (ev.key === 'Escape') { ev.preventDefault(); _cancelEditTodo(); }
}

function addTodo() {
  const input = document.getElementById('todoInput');
  const text = input.value.trim();
  if (!text) return;
  const todos = _getTodos();
  todos.unshift({ id: Date.now().toString(), text, done: false });
  _saveTodos(todos);
  input.value = '';
  renderTodo();
}

function toggleTodo(id) {
  const todos = _getTodos();
  const t = todos.find(x => x.id === id);
  if (t) { t.done = !t.done; _saveTodos(todos); renderTodo(); }
}

function deleteTodo(id) {
  _saveTodos(_getTodos().filter(x => x.id !== id));
  renderTodo();
}

function clearDoneTodos() {
  _saveTodos(_getTodos().filter(x => !x.done));
  renderTodo();
}

