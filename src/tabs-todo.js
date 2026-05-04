// ===== PAGE TAB =====
let _activeTab = 'main';

const TAB_LABELS = {
  todo:'待辦事項', main:'工事清單', member:'會員資料', dm:'會員DM',
  signin:'出席簽到', guesttrack:'來賓追蹤', placard:'桌牌製作',
  finance:'財務控管', meeting:'例會流程', settings:'系統設定'
};

function switchTab(tab) {
  _activeTab = tab;
  document.getElementById('todoContent').style.display       = tab === 'todo'       ? '' : 'none';
  document.getElementById('mainContent').style.display       = tab === 'main'       ? '' : 'none';
  document.getElementById('memberContent').style.display     = tab === 'member'     ? '' : 'none';
  document.getElementById('dmContent').style.display         = tab === 'dm'         ? '' : 'none';
  document.getElementById('signinContent').style.display     = tab === 'signin'     ? '' : 'none';
  document.getElementById('guestTrackContent').style.display = tab === 'guesttrack' ? '' : 'none';
  document.getElementById('placardContent').style.display    = tab === 'placard'    ? '' : 'none';
  document.getElementById('financeContent').style.display    = tab === 'finance'    ? '' : 'none';
  document.getElementById('meetingContent').style.display    = tab === 'meeting'    ? '' : 'none';
  _updateMenuActive(tab);
  const label = TAB_LABELS[tab] || '';
  const ml = document.getElementById('menuLabel');
  if (ml) ml.textContent = label;
  if (tab === 'todo')       renderTodo();
  if (tab === 'main')       renderMain();
  if (tab === 'member')     renderMembers();
  if (tab === 'dm')         renderDM();
  if (tab === 'signin')     renderSignin();
  if (tab === 'guesttrack') renderGuestTrack();
  if (tab === 'placard')    renderPlacard();
  if (tab === 'finance')    renderFinance();
  if (tab === 'meeting')    renderMeeting();
}

function _updateMenuActive(tab) {
  document.querySelectorAll('.menu-item').forEach(b => {
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
    groups[g].map(t => `<button class="menu-item" data-tab="${t.id}" onclick="_pickTab('${t.id}')">${t.label}</button>`).join('')
  ).join('');
  const settingsItem = isAdmin
    ? `<button class="menu-item menu-settings" data-tab="settings" onclick="_pickTab('settings')">系統設定</button>`
    : '';
  const logoutItem = `<button class="menu-item menu-settings" onclick="closeMenu();doLogout();">登出休息</button>`;
  dd.innerHTML = groupHtml + `<div class="menu-divider"></div>` + settingsItem + logoutItem;
  _updateMenuActive(_activeTab);
}

function toggleMenu(ev) {
  if (ev) { ev.stopPropagation(); ev.preventDefault(); }
  const dd = document.getElementById('menuDropdown');
  const ov = document.getElementById('menuOverlay');
  if (!dd || !ov) { console.warn('[menu] dropdown or overlay not found'); return; }
  const open = dd.classList.contains('show');
  if (open) closeMenu();
  else { dd.classList.add('show'); ov.classList.add('show'); }
}
function closeMenu() {
  const dd = document.getElementById('menuDropdown');
  const ov = document.getElementById('menuOverlay');
  if (dd) dd.classList.remove('show');
  if (ov) ov.classList.remove('show');
}
function _pickTab(tab) {
  closeMenu();
  if (tab === 'settings') openSettings();
  else switchTab(tab);
}

// ===== TODO =====
let _todoMigrated = false;
function _getTodos() {
  // 一次性把舊版單機 localStorage('bni_todos') 遷移到當前使用者的雲端 todos
  if (CU && !_todoMigrated && !cache[`__todos_${CU}__`]) {
    _todoMigrated = true;
    try {
      const oldRaw = localStorage.getItem('bni_todos');
      if (oldRaw) {
        const old = JSON.parse(oldRaw);
        if (Array.isArray(old) && old.length) {
          cache[`__todos_${CU}__`] = old;
          saveMyTodos(old);
        }
        localStorage.removeItem('bni_todos');
      }
    } catch {}
  }
  return getMyTodos();
}
function _saveTodos(list) { saveMyTodos(list); }

function renderTodo() {
  const todos = _getTodos();
  const done  = todos.filter(t => t.done);
  const todo  = todos.filter(t => !t.done);
  const total = todos.length;
  const pct   = total ? Math.round(done.length / total * 100) : 0;

  const itemHtml = (t) => `
    <div class="todo-row${t.done?' is-done':''}">
      <label class="todo-cb-wrap">
        <input type="checkbox" ${t.done?'checked':''} onchange="toggleTodo('${t.id}')">
        <span class="todo-cb">
          ${t.done?`<svg width="12" height="10" viewBox="0 0 11 9" fill="none"><path d="M1 4L4.5 7.5L10 1" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`:''}
        </span>
      </label>
      <span class="todo-text">${_escH(t.text)}</span>
      <button class="todo-del" onclick="deleteTodo('${t.id}')" aria-label="刪除">&times;</button>
    </div>`;

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

  document.getElementById('todoContent').innerHTML = `
    <div class="todo-wrap">
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

