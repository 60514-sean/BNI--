// ===== LOADER =====
function showLoader(show, text) {
  const el = document.getElementById('loader');
  if (show) { el.classList.add('show'); document.getElementById('loaderText').textContent = text || '載入中...'; }
  else { el.classList.remove('show'); }
}

// ===== LOGIN =====
let CU = null, CR = null;
let currentDay = TODAY_DAY;
let cfgUsers = [];        // 設定頁暫存
let cfgTasks = [];        // 設定頁暫存：所有週進度任務
let _editingTaskIdx = null;
let _editingOwners = [];


async function doLogin() {
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';

  // 站台共用密碼：若分會密碼欄可見（=未解鎖或 30 天 token 過期）才驗證
  const gateInput = document.getElementById('gateInput');
  if (gateInput && gateInput.style.display !== 'none') {
    const pw = (gateInput.value || '').trim();
    if (!pw) { errEl.textContent = '請輸入分會共用密碼'; gateInput.focus(); return; }
    const hash = await _sha256Hex(pw);
    if (hash !== _currentSiteHash()) {
      errEl.textContent = '分會共用密碼錯誤';
      gateInput.value = '';
      gateInput.focus();
      return;
    }
    _markGateUnlocked(hash);
    gateInput.style.display = 'none';
  }

  const name = document.getElementById('nameInput').value.trim();
  if (!name) { errEl.textContent = '請輸入姓名'; document.getElementById('nameInput').focus(); return; }

  let cfg = getConfig();
  let userObj = cfg.users.find(u => (u.names || []).includes(name)) || null;
  let isAdmin = name === cfg.adminPassword;

  if (!userObj && !isAdmin) {
    await Promise.race([_bgRefresh(), new Promise(r => setTimeout(r, 3000))]);
    cfg = getConfig();
    userObj = cfg.users.find(u => (u.names || []).includes(name)) || null;
    isAdmin = name === cfg.adminPassword;
  } else {
    _bgRefresh();
  }

  if (!userObj && !isAdmin) { document.getElementById('loginError').textContent = '找不到此姓名，請確認後重試'; return; }
  CU = name; CR = isAdmin ? 'admin' : 'user';
  _needsPostLoginRender = true;
  try {
    sessionStorage.setItem('bni_session', JSON.stringify({ name, role: CR }));
  } catch {}
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appPage').style.display = 'flex';
  document.getElementById('userChip').textContent = name;
  document.getElementById('userChip').style.display = 'none'; // 依需求隱藏使用者名稱標記
  document.getElementById('menuBtn').style.display = 'flex';

  // 啟動編輯鎖 observer（依 _canEditTab 自動鎖定 OFF 頁面的輸入欄位）
  _startEditLockObserver();

  // 套用頁籤權限：admin 看全部；一般使用者依 allowedTabs 限制
  const allowed = isAdmin ? TAB_LIST.map(t => t.id) : _visibleTabsForUser(userObj);
  _renderMenuDropdown(allowed, isAdmin);

  currentDay = TODAY_DAY;
  // 預設停在「待辦事項」（若有權限），否則退回第一個允許的 tab
  const firstTab = allowed.includes('todo') ? 'todo' : (allowed[0] || null);
  if (firstTab) {
    _activeTab = firstTab;
    switchTab(firstTab);
  } else {
    // 沒有任何頁籤 → 空畫面 + 提示
    const ml = document.getElementById('menuLabel'); if (ml) ml.textContent = '歡迎';
    ['todoContent','mainContent','memberContent','dmContent','signinContent','guestTrackContent','placardContent','scheduleContent','financeContent','meetingContent'].forEach(id => {
      const el = document.getElementById(id); if (el) el.style.display = 'none';
    });
    const msgEl = document.getElementById('mainContent');
    if (msgEl) {
      msgEl.style.display = '';
      msgEl.innerHTML = `<div class="card" style="padding:40px 24px;text-align:center;color:var(--text-soft);">
        <div style="font-size:16px;font-weight:900;color:var(--text);margin-bottom:8px;">尚未指派頁面</div>
        <div style="font-size:13px;">請洽管理員設定您可以存取的頁籤</div>
      </div>`;
    }
  }
}


async function doLogout() {
  // 等 _saveQueue 內的 push 全部送出 + GAS 寫入緩衝（避免登出時最後一次修改沒到雲端）
  if (_saveQueue.size > 0 || _saveRunning) {
    showToast('儲存中…');
    let waitCount = 0;
    while ((_saveQueue.size > 0 || _saveRunning) && waitCount < 50) {
      await new Promise(r => setTimeout(r, 100));
      waitCount++;
    }
    // GAS 寫入緩衝：no-cors push 沒辦法等 GAS 確認，固定再等 1.5 秒
    await new Promise(r => setTimeout(r, 1500));
  }
  CU = null; CR = null;
  _memberData = null;
  try { sessionStorage.removeItem('bni_session'); } catch {}
  // 登出同時清除 gate token，下次登入要重新輸入分會共用密碼
  if (typeof _clearGateToken === 'function') _clearGateToken();
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('appPage').style.display = 'none';
  document.getElementById('menuBtn').style.display = 'none';
  closeMenu();
  document.getElementById('nameInput').value = '';
  document.getElementById('loginError').textContent = '';
  // 顯示分會共用密碼欄、提示文字復原
  const gateInput = document.getElementById('gateInput');
  if (gateInput) { gateInput.style.display = ''; gateInput.value = ''; }
  const promptEl = document.getElementById('loginPrompt');
  if (promptEl) promptEl.textContent = '請輸入分會共用密碼及您的姓名';
}

document.getElementById('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

// 同一分頁 session 內若曾登入過（PDF 返回、頁面重新載入），自動還原；新分頁則會看到登入畫面
// 站台共用密碼閘門未通過時不自動還原（避免繞過閘門）
(async () => {
  try {
    if (typeof _isGateUnlocked === 'function' && !_isGateUnlocked()) return;
    const s = sessionStorage.getItem('bni_session');
    if (!s) return;
    const sess = JSON.parse(s);
    if (!sess || !sess.name) return;
    document.getElementById('nameInput').value = sess.name;
    await doLogin();
  } catch {}
})();


const CAT_ORDER = ['例會','簡報','續約','財務','會員','基礎建設'];
const CAT_COLOR = '#c0392b';

