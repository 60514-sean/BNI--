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
// 額外綁 click event（保險：onclick attribute 若被某些情境清掉，這條依然生效）
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('menuBtn');
  if (btn) btn.addEventListener('click', toggleMenu);
});
// DOMContentLoaded 已過時的情況也補綁
if (document.readyState !== 'loading') {
  const btn = document.getElementById('menuBtn');
  if (btn) btn.addEventListener('click', toggleMenu);
}
function _pickTab(tab) {
  closeMenu();
  if (tab === 'settings') openSettings();
  else switchTab(tab);
}

// ===== TODO =====
function _getTodos() { try { return JSON.parse(localStorage.getItem('bni_todos') || '[]'); } catch { return []; } }
function _saveTodos(list) { localStorage.setItem('bni_todos', JSON.stringify(list)); }

function renderTodo() {
  const todos = _getTodos();
  const done  = todos.filter(t => t.done);
  const todo  = todos.filter(t => !t.done);

  const itemHtml = (t, isLast) => `
    <div style="display:flex;align-items:center;gap:10px;padding:12px 0;box-sizing:border-box;${isLast?'':'border-bottom:1px solid var(--gray-border);'}">
      <label style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;min-width:22px;border-radius:50%;border:2px solid ${t.done?'var(--red)':'var(--gray-border)'};background:${t.done?'var(--red)':'white'};cursor:pointer;box-sizing:border-box;">
        <input type="checkbox" ${t.done?'checked':''} onchange="toggleTodo('${t.id}')" style="display:none;">
        ${t.done?`<svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4L4.5 7.5L10 1" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`:''}
      </label>
      <span style="flex:1;min-width:0;font-size:14px;line-height:1.5;word-break:break-word;${t.done?'text-decoration:line-through;color:var(--text-soft);':'color:var(--text);'}">${_escH(t.text)}</span>
      <button onclick="deleteTodo('${t.id}')" style="flex-shrink:0;min-width:28px;width:28px;height:28px;border-radius:50%;background:var(--gray-light);border:none;color:var(--text-soft);font-size:16px;cursor:pointer;line-height:1;padding:0;">&times;</button>
    </div>`;

  document.getElementById('todoContent').innerHTML = `
    <div class="card" style="background:linear-gradient(135deg,#c0392b 0%,#e74c3c 100%);box-shadow:none;box-sizing:border-box;">
      <div style="font-size:13px;font-weight:700;color:rgba(255,255,255,0.85);margin-bottom:10px;">新增待辦</div>
      <div style="display:flex;gap:8px;width:100%;box-sizing:border-box;">
        <input id="todoInput" type="text" placeholder="輸入待辦事項..." onkeydown="if(event.key==='Enter')addTodo()"
          style="flex:1;min-width:0;font-size:16px;padding:10px 12px;border-radius:10px;border:none;outline:none;background:rgba(255,255,255,0.95);color:var(--text);font-family:inherit;box-sizing:border-box;">
        <button onclick="addTodo()"
          style="flex-shrink:0;padding:0 16px;border-radius:10px;background:white;color:var(--red);border:none;font-size:14px;font-weight:900;cursor:pointer;font-family:inherit;white-space:nowrap;">新增</button>
      </div>
    </div>
    ${todo.length ? `<div class="card" style="box-sizing:border-box;">
      <div style="font-size:12px;font-weight:700;color:var(--text-soft);margin-bottom:4px;">待辦 ${todo.length} 項</div>
      ${todo.map((t,i)=>itemHtml(t, i===todo.length-1)).join('')}
    </div>` : ''}
    ${done.length ? `<div class="card" style="box-sizing:border-box;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <div style="font-size:12px;font-weight:700;color:var(--text-soft);">已完成 ${done.length} 項</div>
        <button onclick="clearDoneTodos()" style="font-size:12px;color:var(--red);background:none;border:none;cursor:pointer;font-weight:600;font-family:inherit;padding:0;">清除已完成</button>
      </div>
      ${done.map((t,i)=>itemHtml(t, i===done.length-1)).join('')}
    </div>` : ''}
    ${!todo.length && !done.length ? `<div class="card" style="text-align:center;padding:40px 20px;color:var(--text-soft);box-sizing:border-box;">
      <div style="font-size:32px;margin-bottom:10px;">&#10003;</div>
      <div style="font-size:14px;">沒有待辦事項</div>
    </div>` : ''}`;
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

