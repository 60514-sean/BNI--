// ===== SETTINGS =====
function openSettings() {
  if (CR !== 'admin') { showToast('無權限'); return; }
  // 從 config 初始化暫存陣列，然後渲染
  const cfg = getConfig();
  cfgUsers = cfg.users.map(u => ({ names: [...(u.names || [])], roles: [...(u.roles || (u.role ? [u.role] : []))], allowedTabs: [...(u.allowedTabs || [])], editableTabs: [...(u.editableTabs || [])] }));
  cfgTasks = (cfg.tasks || []).map(t => ({ ...t, owners: [...(t.owners || [])] }));
  cfgMeetingStaff = Object.assign(
    { 主席:'', 副主席:'', 秘財:'', 教育:'', 活動:'', 委員會:'', 入會:'', 續約:'', 出村:'', 導師:'', 導生:'', 會員1:'', 會員2:'' },
    cfg.meetingStaff || {}
  );
  if (!cfgMeetingStaff['會員1'] && cfg.meetingStaff?.['主題1']) cfgMeetingStaff['會員1'] = cfg.meetingStaff['主題1'];
  if (!cfgMeetingStaff['會員2'] && cfg.meetingStaff?.['主題2']) cfgMeetingStaff['會員2'] = cfg.meetingStaff['主題2'];
  showSettings();
}

let cfgMeetingStaff = { 主席:'', 副主席:'', 秘財:'', 教育:'', 活動:'', 委員會:'', 入會:'', 續約:'', 出村:'', 導師:'', 導生:'', 會員1:'', 會員2:'' };

// 即時把 cfgMeetingStaff 同步到 cache.__config__.meetingStaff（不 push GAS，僅更新本地）
// 同時觸發例會預覽 debounce 重渲染（讓「主題簡報」等預覽即時看到姓名替換）
function _meetSyncStaffLive() {
  if (CR !== 'admin') return;
  const current = cache['__config__'] || {};
  cache['__config__'] = { ...current, meetingStaff: { ...cfgMeetingStaff } };
}
const _meetLiveRender = _debounce(() => {
  if (typeof _meetState !== 'undefined' && _meetState && _activeTab === 'meeting') _meetRenderBody();
}, 200);
function _meetStaffOnInput(key, val) {
  cfgMeetingStaff[key] = val;
  _meetSyncStaffLive();
  _meetLiveRender();
}

function _renderMeetingStaffBlock() {
  const row = (label, key, ph) => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
      <div style="flex-shrink:0;width:60px;font-size:13px;font-weight:700;color:var(--text);">${label}</div>
      <input type="text" value="${_escH(cfgMeetingStaff[key]||'')}" oninput="_meetStaffOnInput('${key}',this.value)" placeholder="${ph}" style="flex:1;padding:9px 12px;border:1.5px solid var(--gray-border);border-radius:8px;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box;">
    </div>`;
  const roles = MEETING_ROLES.map(r => row(r, r, '姓名')).join('');
  const memberSep = `<div style="font-size:11px;color:var(--text-soft);font-weight:600;margin:14px 0 8px;">本週會員（每週調整）</div>`;
  const inputStyle = 'flex:1;min-width:0;padding:9px 12px;border:1.5px solid var(--gray-border);border-radius:8px;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box;';
  const committeeRow = MEETING_COMMITTEE_ROLES.map(r => row(r, r, '本週委員會姓名')).join('');
  const members = MEETING_MEMBERS.map(e => {
    if (e === '出村') {
      return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <div style="flex-shrink:0;width:60px;font-size:13px;font-weight:700;color:var(--text);">出村</div>
        <input type="text" value="${_escH(cfgMeetingStaff['導師']||'')}" oninput="_meetStaffOnInput('導師',this.value)" placeholder="本週導師姓名" style="${inputStyle}">
        <input type="text" value="${_escH(cfgMeetingStaff['導生']||'')}" oninput="_meetStaffOnInput('導生',this.value)" placeholder="本週導生姓名" style="${inputStyle}">
      </div>`;
    }
    return row(e, e, '本週會員姓名');
  }).join('');
  const topicType = cfgMeetingStaff['主題類型'] || '主題簡報';
  const speakerRow = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
    <select onchange="_meetStaffOnInput('主題類型',this.value)" style="flex-shrink:0;width:90px;padding:9px 8px;border:1.5px solid var(--gray-border);border-radius:8px;font-size:13px;font-weight:700;color:var(--text);font-family:inherit;outline:none;background:white;cursor:pointer;">
      <option value="主題簡報" ${topicType==='主題簡報'?'selected':''}>主題簡報</option>
      <option value="主題日" ${topicType==='主題日'?'selected':''}>主題日</option>
    </select>
    <input type="text" value="${_escH(cfgMeetingStaff['會員1']||'')}" oninput="_meetStaffOnInput('會員1',this.value)" placeholder="本週會員1姓名" style="${inputStyle}">
    <input type="text" value="${_escH(cfgMeetingStaff['會員2']||'')}" oninput="_meetStaffOnInput('會員2',this.value)" placeholder="本週會員2姓名" style="${inputStyle}">
  </div>`;
  return roles + memberSep + committeeRow + members + speakerRow;
}

function _captureUserInputsToCfg() {
  cfgUsers = cfgUsers.map((u, i) => {
    const inp = document.getElementById(`usr_${i}_0`);
    const name = inp ? inp.value.trim() : (u.names?.[0] || '');
    const allowed = u.allowedTabs || [];
    const editable = (u.editableTabs || []).filter(t => allowed.includes(t));
    return {
      names: [name],
      roles: [...(u.roles || [])],
      allowedTabs: allowed,
      editableTabs: editable
    };
  });
}

function _toggleUserRole(i, role, checked) {
  const u = cfgUsers[i];
  if (!u) return;
  u.roles = u.roles || [];
  if (checked) {
    if (!u.roles.includes(role)) u.roles.push(role);
  } else {
    u.roles = u.roles.filter(r => r !== role);
  }
  // 更新角色下拉按鈕文字
  const labels = u.roles;
  const text = labels.length
    ? `已選 ${labels.length} 個（${labels.slice(0,3).join('、')}${labels.length>3?'…':''}）`
    : '尚未選擇任何角色';
  const btnSpan = document.querySelector(`#ur_${i} .role-msel-btn > span:first-child`);
  if (btnSpan) btnSpan.textContent = text;
}

function _toggleUserTab(i, tabId, checked) {
  const u = cfgUsers[i];
  if (!u) return;
  u.allowedTabs = u.allowedTabs || [];
  u.editableTabs = u.editableTabs || [];
  if (checked) {
    if (!u.allowedTabs.includes(tabId)) u.allowedTabs.push(tabId);
    if (!u.editableTabs.includes(tabId)) u.editableTabs.push(tabId); // 預設可編輯
  } else {
    u.allowedTabs = u.allowedTabs.filter(t => t !== tabId);
    u.editableTabs = u.editableTabs.filter(t => t !== tabId);
  }
  // 更新可見頁面下拉按鈕文字
  const labels = TAB_LIST.filter(t => u.allowedTabs.includes(t.id)).map(t => t.label);
  const text = labels.length
    ? `已選 ${labels.length} 個（${labels.slice(0,3).join('、')}${labels.length>3?'…':''}）`
    : '尚未選擇任何頁面';
  const btnSpan = document.querySelector(`#ur_${i} .vis-msel-btn > span:first-child`);
  if (btnSpan) btnSpan.textContent = text;
  // 動態切換該項的 ON/OFF toggle 顯示
  const tg = document.querySelector(`#ur_${i} [data-edit-toggle="${tabId}"]`);
  if (tg) {
    tg.style.display = checked ? '' : 'none';
    tg.classList.toggle('on', checked);
    tg.textContent = checked ? 'ON' : 'OFF';
  }
}

function _toggleUserTabEdit(i, tabId, ev) {
  if (ev) { ev.stopPropagation(); ev.preventDefault(); }
  const u = cfgUsers[i];
  if (!u) return;
  u.editableTabs = u.editableTabs || [];
  const isOn = u.editableTabs.includes(tabId);
  if (isOn) u.editableTabs = u.editableTabs.filter(t => t !== tabId);
  else u.editableTabs.push(tabId);
  const tg = document.querySelector(`#ur_${i} [data-edit-toggle="${tabId}"]`);
  if (tg) {
    tg.classList.toggle('on', !isOn);
    tg.textContent = !isOn ? 'ON' : 'OFF';
  }
}

function _mselToggle(panelId) {
  const panels = document.querySelectorAll('.msel-panel.open');
  panels.forEach(p => { if (p.id !== panelId) p.classList.remove('open'); });
  document.getElementById(panelId)?.classList.toggle('open');
}
// 點外面關閉
document.addEventListener('click', (e) => {
  if (e.target.closest('.msel-wrap')) return;
  document.querySelectorAll('.msel-panel.open').forEach(p => p.classList.remove('open'));
});

function showSettings() {
  const ml = document.getElementById('menuLabel'); if (ml) ml.textContent = '系統設定';
  document.getElementById('todoContent').style.display       = 'none';
  document.getElementById('mainContent').style.display       = '';
  document.getElementById('memberContent').style.display     = 'none';
  document.getElementById('dmContent').style.display         = 'none';
  document.getElementById('signinContent').style.display     = 'none';
  document.getElementById('guestTrackContent').style.display = 'none';
  document.getElementById('placardContent').style.display    = 'none';
  document.getElementById('scheduleContent').style.display   = 'none';
  document.getElementById('financeContent').style.display    = 'none';
  document.getElementById('meetingContent').style.display    = 'none';
  _activeTab = 'settings';
  _updateMenuActive('settings');
  const cfg = getConfig();

  // 保留使用者輸入欄位的當前值（重新渲染前先從 DOM 讀回）
  _captureUserInputsToCfg();

  const usersHtml = cfgUsers.map((u, i) => _renderUserRowHtml(u, i)).join('');

  const catOpts  = CAT_ORDER.map(c => `<option value="${c}">${c}</option>`).join('');
  const freqOpts = ['每週','視需要','月底','每月首週','每月末週'].map(f => `<option value="${f}">${f}</option>`).join('');

  const dayPickerOpts = DAYS.map(d => `<option value="${d}">${d}</option>`).join('');

  // 記錄目前展開狀態
  const ACC_IDS = ['acc0','acc1','accMsg','acc2'];
  const accOpen = ACC_IDS.map(id => { const el = document.getElementById(id); return el ? el.style.display !== 'none' : false; });
  const ctDay   = document.getElementById('ctDayPicker')?.value || DAYS[0];

  document.getElementById('mainContent').innerHTML = `
    <style>
      .acc-header{display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;padding:2px 0;}
      .acc-arrow{font-size:12px;color:var(--text-soft);transition:transform .2s;display:inline-block;}
      .acc-arrow.open{transform:rotate(90deg);}
      .acc-body{margin-top:12px;}
    </style>
    <div class="card">
      <div class="acc-header" onclick="toggleAcc('acc0')">
        <div class="card-title" style="margin:0;">管理員名稱</div>
        <span class="acc-arrow" id="acc0-arrow">&#9654;</span>
      </div>
      <div class="acc-body" id="acc0" style="display:none;">
        <div class="form-row"><input type="text" id="adminPw" value="${cfg.adminPassword}" placeholder="管理員名稱"></div>
        <p class="hint">用此名稱登入可查看總覽及修改設定</p>
      </div>
    </div>
    <div class="card">
      <div class="acc-header" onclick="toggleAcc('acc1')">
        <div class="card-title" style="margin:0;">使用者名單</div>
        <span class="acc-arrow" id="acc1-arrow">&#9654;</span>
      </div>
      <div class="acc-body" id="acc1" style="display:none;">
        <p class="hint" style="margin-bottom:12px;">名稱即為登入密碼</p>
        <div id="usersContainer">${usersHtml}</div>
        <button class="add-btn" onclick="addUser()">+ 新增使用者</button>
      </div>
    </div>
    <div class="card">
      <div class="acc-header" onclick="toggleAcc('accMsg')">
        <div class="card-title" style="margin:0;">個人留言板</div>
        <span class="acc-arrow" id="accMsg-arrow">&#9654;</span>
      </div>
      <div class="acc-body" id="accMsg" style="display:none;">
        <p class="hint" style="margin-bottom:12px;">為每位使用者設定登入後在「待辦事項」最上方看到的留言。空白＝不顯示。</p>
        ${cfgUsers.map((u, i) => {
          const name = (u.names && u.names[0]) || '';
          if (!name) return '';
          const msg = (cfg.messages||{})[name] || '';
          return `<div class="msg-row">
            <label class="msg-label">${_escH(name)}</label>
            <textarea id="msg_${i}" rows="2" placeholder="留言給 ${_escH(name)}…" class="msg-textarea">${_escH(msg)}</textarea>
          </div>`;
        }).join('')}
      </div>
    </div>
    <div class="card">
      <div class="acc-header" onclick="toggleAcc('acc2')">
        <div class="card-title" style="margin:0;">週進度任務設定</div>
        <span class="acc-arrow" id="acc2-arrow">&#9654;</span>
      </div>
      <div class="acc-body" id="acc2" style="display:none;">
        <p class="hint" style="margin-bottom:12px;">所有任務皆可編輯與刪除。可指派給特定使用者，未指派則所有人都看得到。</p>
        <select class="modal-input" id="ctDayPicker" onchange="renderCtDay(this.value)" style="font-size:16px;margin-bottom:14px;">${dayPickerOpts}</select>
        <div id="ctContainer"></div>
        <div id="ctFormWrap" style="display:none;background:var(--gray-light);border-radius:10px;padding:16px;margin-top:4px;">
          <div id="ct_form_title" style="font-size:13px;font-weight:700;color:var(--red);margin-bottom:12px;">新增任務</div>
          <div style="margin-bottom:8px;">
            <div style="font-size:11px;color:var(--text-soft);font-weight:600;margin-bottom:4px;">星期</div>
            <select id="ct_day" class="modal-input" style="font-size:15px;"></select>
          </div>
          <div style="margin-bottom:8px;">
            <div style="font-size:11px;color:var(--text-soft);font-weight:600;margin-bottom:4px;">任務內容</div>
            <textarea id="ct_task" class="modal-input" rows="3" placeholder="描述任務內容…" style="font-size:15px;resize:none;"></textarea>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
            <div>
              <div style="font-size:11px;color:var(--text-soft);font-weight:600;margin-bottom:4px;">分類</div>
              <select id="ct_cat" class="modal-input" style="font-size:15px;">${catOpts}</select>
            </div>
            <div>
              <div style="font-size:11px;color:var(--text-soft);font-weight:600;margin-bottom:4px;">頻率</div>
              <select id="ct_freq" class="modal-input" style="font-size:15px;">${freqOpts}</select>
            </div>
          </div>
          <div style="margin-bottom:14px;">
            <div style="font-size:11px;color:var(--text-soft);font-weight:600;margin-bottom:6px;">指派對象（不選 = 全體可見）</div>
            <div id="ct_owners_box" style="display:flex;flex-wrap:wrap;align-items:center;"></div>
          </div>
          <div style="display:flex;gap:8px;">
            <button id="ct_form_btn" class="btn btn-primary" style="flex:1;" onclick="confirmTaskForm()">加入</button>
            <button class="btn btn-secondary" onclick="document.getElementById('ctFormWrap').style.display='none'">取消</button>
          </div>
        </div>
      </div>
    </div>
    <div class="btn-row">
      <button class="btn btn-primary" onclick="saveSettings()">儲存設定</button>
      <button class="btn btn-secondary" onclick="exitSettings()">取消</button>
    </div>`;
  // 還原展開狀態
  ACC_IDS.forEach((id, i) => {
    if (accOpen[i]) {
      document.getElementById(id).style.display = '';
      document.getElementById(id + '-arrow').classList.add('open');
    }
  });
  if (accOpen[2]) {
    document.getElementById('ctDayPicker').value = ctDay;
    renderCtDay(ctDay);
  }
}

function toggleAcc(id) {
  const body  = document.getElementById(id);
  const arrow = document.getElementById(id + '-arrow');
  const open  = body.style.display === 'none';
  body.style.display  = open ? '' : 'none';
  arrow.classList.toggle('open', open);
  if (open && id === 'acc2') renderCtDay(document.getElementById('ctDayPicker').value || DAYS[0]);
}

// 設定頁：產出單一使用者列的 HTML（供首次渲染與局部更新共用）
function _renderUserRowHtml(u, i) {
  const name = (u.names && u.names[0]) || '';

  // 角色（多選）
  const roles = u.roles || [];
  const roleBtnText = roles.length
    ? `已選 ${roles.length} 個（${roles.slice(0,3).join('、')}${roles.length>3?'…':''}）`
    : '尚未選擇任何角色';
  const roleItems = GUEST_ROLES.map(r => `
        <label class="msel-item">
          <input type="checkbox" ${roles.includes(r)?'checked':''} onchange="_toggleUserRole(${i},'${r}',this.checked)">
          <span>${r}</span>
        </label>`).join('');

  // 可見頁面（多選 + 每項 ON/OFF 切換可編輯）
  const allowed = u.allowedTabs || [];
  const editable = u.editableTabs || [];
  const visTabsLabels = TAB_LIST.filter(t => allowed.includes(t.id)).map(t => t.label);
  const visBtnText = visTabsLabels.length
    ? `已選 ${visTabsLabels.length} 個（${visTabsLabels.slice(0,3).join('、')}${visTabsLabels.length>3?'…':''}）`
    : '尚未選擇任何頁面';
  const visItems = TAB_LIST.map(t => {
    const isVis = allowed.includes(t.id);
    const isEdit = editable.includes(t.id);
    return `
        <label class="msel-item msel-vis-item">
          <input type="checkbox" ${isVis?'checked':''} onchange="_toggleUserTab(${i},'${t.id}',this.checked)">
          <span>${t.label}</span>
          <span class="msel-edit-toggle ${isEdit?'on':''}" data-edit-toggle="${t.id}"
                style="${isVis?'':'display:none;'}"
                title="ON＝可編輯，OFF＝唯讀"
                onclick="_toggleUserTabEdit(${i},'${t.id}',event)">${isEdit?'ON':'OFF'}</span>
        </label>`;
  }).join('');

  return `
      <div class="user-row" id="ur_${i}">
        <div class="user-row-head">
          <input type="text" value="${_escH(name)}" id="usr_${i}_0" placeholder="登入名稱" class="user-row-name">
          <button class="btn-danger user-row-del" onclick="removeUser(${i})">刪除</button>
        </div>
        <div class="user-row-grid">
          <div class="user-row-field">
            <label class="user-row-lbl">角色（可複選）</label>
            <div class="msel-wrap">
              <button type="button" class="msel-btn role-msel-btn" onclick="_mselToggle('role_${i}_panel')">
                <span>${roleBtnText}</span>
                <span class="msel-arrow">&#9662;</span>
              </button>
              <div class="msel-panel" id="role_${i}_panel">${roleItems}</div>
            </div>
          </div>
          <div class="user-row-field">
            <label class="user-row-lbl">可見頁面（ON＝可編輯）</label>
            <div class="msel-wrap">
              <button type="button" class="msel-btn vis-msel-btn" onclick="_mselToggle('vis_${i}_panel')">
                <span>${visBtnText}</span>
                <span class="msel-arrow">&#9662;</span>
              </button>
              <div class="msel-panel" id="vis_${i}_panel">${visItems}</div>
            </div>
          </div>
        </div>
      </div>`;
}

// 設定頁：只更新單一使用者列（避免 toggle 一個 chip 就重繪整個設定畫面）
function _refreshUserRow(i) {
  const el = document.getElementById('ur_' + i);
  if (!el) return;
  const u = cfgUsers[i];
  if (!u) { el.remove(); return; }
  // 替換前先把現場 input 的值同步進 cfgUsers，避免名稱被舊值覆寫
  _captureUserInputsToCfg();
  const tmp = document.createElement('div');
  tmp.innerHTML = _renderUserRowHtml(cfgUsers[i], i);
  el.replaceWith(tmp.firstElementChild);
}

function renderCtDay(day) {
  const list = cfgTasks.map((t, idx) => ({ ...t, _idx: idx })).filter(t => t.day === day);
  const itemsHtml = list.map(t => {
    const ownersHtml = (t.owners || []).length
      ? t.owners.map(n => `<span style="font-size:10px;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:999px;">${_escH(n)}</span>`).join(' ')
      : `<span style="font-size:10px;color:var(--text-soft);font-style:italic;">全體</span>`;
    return `
      <div style="display:flex;align-items:flex-start;gap:8px;padding:10px 0;border-bottom:1px solid var(--gray-border);">
        <div style="flex:1;min-width:0;">
          <div style="font-size:11px;color:var(--text-soft);margin-bottom:2px;">${t.cat} · ${t.freq}</div>
          <div style="font-size:13px;color:var(--text);line-height:1.5;margin-bottom:6px;">${t.task}</div>
          <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
            <span style="font-size:10px;color:var(--text-soft);">指派：</span>${ownersHtml}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;align-self:center;">
          <button class="btn-secondary" style="font-size:11px;padding:4px 10px;" onclick="openTaskForm(${t._idx}, '${day}')">編輯</button>
          <button class="btn-danger" style="font-size:11px;padding:4px 10px;" onclick="removeTask(${t._idx})">刪除</button>
        </div>
      </div>`;
  }).join('');
  const empty = list.length ? '' : `<p class="hint" style="text-align:center;padding:12px 0;">此日尚無任務</p>`;
  document.getElementById('ctContainer').innerHTML = itemsHtml + empty + `
    <button class="add-btn" style="margin-top:8px;font-size:12px;padding:6px 12px;" onclick="openTaskForm(null, '${day}')">+ 新增至${day}</button>`;
  const fw = document.getElementById('ctFormWrap');
  if (fw) fw.style.display = 'none';
}

function _cfgAllNames() {
  // 先把「使用者名單」中現場 input 的值同步到 cfgUsers，避免漏掉剛新增/修改但未儲存的名稱
  try { _captureUserInputsToCfg(); } catch (e) {}
  const names = new Set();
  const adminInp = document.getElementById('adminPw');
  if (adminInp && adminInp.value.trim()) names.add(adminInp.value.trim());
  cfgUsers.forEach(u => (u.names || []).forEach(n => { if (n && n.trim()) names.add(n.trim()); }));
  return [...names];
}

function _renderTaskOwnerChips() {
  const names = _cfgAllNames();
  if (!names.length) return `<span style="font-size:11px;color:var(--text-soft);">尚無使用者，請先在「使用者名單」新增</span>`;
  return names.map(n => {
    const on = _editingOwners.includes(n);
    const safe = _escH(n).replace(/'/g, "\\'");
    return `<label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:4px 10px;border:1.5px solid ${on?'#fbbf24':'var(--gray-border)'};border-radius:999px;cursor:pointer;background:${on?'#fef3c7':'transparent'};color:${on?'#92400e':'var(--text-soft)'};margin:0 4px 4px 0;">
      <input type="checkbox" ${on?'checked':''} onchange="_toggleEditingOwner('${safe}', this.checked)" style="margin:0;cursor:pointer;">
      ${_escH(n)}
    </label>`;
  }).join('');
}

function _toggleEditingOwner(name, checked) {
  if (checked) { if (!_editingOwners.includes(name)) _editingOwners.push(name); }
  else { _editingOwners = _editingOwners.filter(n => n !== name); }
  const box = document.getElementById('ct_owners_box');
  if (box) box.innerHTML = _renderTaskOwnerChips();
}

function _refreshUsersContainer() {
  const container = document.getElementById('usersContainer');
  if (!container) { showSettings(); return; }
  container.innerHTML = cfgUsers.map((u, idx) => _renderUserRowHtml(u, idx)).join('');
}
function addUser()     { _captureUserInputsToCfg(); cfgUsers.push({ names: [''], role: '', allowedTabs: [], editableTabs: [] }); _refreshUsersContainer(); }
function removeUser(i) { _captureUserInputsToCfg(); cfgUsers.splice(i, 1); _refreshUsersContainer(); }

function removeTask(i) {
  if (!confirm('確定刪除此任務？已儲存的進度紀錄會保留但此任務將不再顯示。')) return;
  cfgTasks.splice(i, 1);
  const day = document.getElementById('ctDayPicker')?.value || DAYS[0];
  renderCtDay(day);
}

function openTaskForm(idx, day) {
  _editingTaskIdx = idx;
  const cur = (idx == null) ? null : cfgTasks[idx];
  _editingOwners = cur ? [...(cur.owners || [])] : [];
  const initDay = cur ? cur.day : day;
  const dayOpts = DAYS.map(d => `<option value="${d}"${d===initDay?' selected':''}>${d}</option>`).join('');
  document.getElementById('ct_day').innerHTML = dayOpts;
  document.getElementById('ct_task').value = cur ? cur.task : '';
  document.getElementById('ct_cat').value  = cur ? cur.cat  : (CAT_ORDER[0] || '');
  document.getElementById('ct_freq').value = cur ? cur.freq : '每週';
  document.getElementById('ct_owners_box').innerHTML = _renderTaskOwnerChips();
  document.getElementById('ct_form_title').textContent = cur ? '編輯任務' : '新增任務';
  document.getElementById('ct_form_btn').textContent   = cur ? '儲存' : '加入';
  document.getElementById('ctFormWrap').style.display = '';
  document.getElementById('ct_task').focus();
}

function confirmTaskForm() {
  const day  = document.getElementById('ct_day').value;
  const task = document.getElementById('ct_task').value.trim();
  const cat  = document.getElementById('ct_cat').value;
  const freq = document.getElementById('ct_freq').value;
  if (!task) { showToast('請填寫任務內容'); return; }
  const owners = [..._editingOwners];
  if (_editingTaskIdx == null) {
    // id 加上隨機字尾避免快速連續新增時撞同毫秒；也避免跟既有 id 衝突
    const existingIds = new Set(cfgTasks.map(t => String(t.id)));
    let newId;
    do {
      newId = 'c' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    } while (existingIds.has(newId));
    cfgTasks.push({ id: newId, day, owners, task, cat, freq });
  } else {
    cfgTasks[_editingTaskIdx] = { ...cfgTasks[_editingTaskIdx], day, owners, task, cat, freq };
  }
  _editingTaskIdx = null;
  _editingOwners = [];
  document.getElementById('ctDayPicker').value = day;
  renderCtDay(day);
}

async function saveSettings() {
  if (CR !== 'admin') { showToast('無權限'); return; }
  const adminPw = document.getElementById('adminPw').value.trim();
  _captureUserInputsToCfg();
  const users = cfgUsers
    .map(u => ({ ...u, names: (u.names || []).map(n => (n || '').trim()).filter(n => n) }))
    .filter(u => u.names.length);
  // 收集留言（管理員無留言；只給一般使用者）
  const messages = {};
  users.forEach((u, i) => {
    const el = document.getElementById(`msg_${i}`);
    if (el && el.value.trim()) messages[u.names[0]] = el.value.trim();
  });
  await saveConfigData({ adminPassword: adminPw, users, tasks: cfgTasks, meetingStaff: cfgMeetingStaff, messages });
  await _bgRefresh();
  showToast('設定已儲存');
  setTimeout(() => exitSettings(), 600);
}

function exitSettings() {
  switchTab('main');
}

