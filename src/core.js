// ===== API =====
const API_URL = 'https://script.google.com/macros/s/AKfycbzwn_oKfa0vs21GlWdqtjz0oFJYyNwhVGJQPz_GHRaDGmk6jxHIqs7U0yqrVxyzkwK-/exec';
// 財務控管 API（部署 apps-script-finance.gs 後填入網頁應用程式網址）
const FINANCE_API_URL = 'https://script.google.com/macros/s/AKfycbxg-wq2nKPPqB4HwEwNYYExRhYvbsuUNliBpoD_IYRjmA5vTnOwpBhnLERB7vYwUG_oHg/exec';
const LS_KEY  = 'bni_weekly_v1';

let cache = {};
try { const s = localStorage.getItem(LS_KEY); if (s) cache = JSON.parse(s); } catch {}

// 防 race condition：記錄最近 push 的 key，避免 _bgRefresh 拿回舊資料覆蓋剛勾選/編輯的修改
const _recentSaves = new Map();
const _SAVE_GRACE_MS = 30000;

function _lsSave() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cache)); } catch {}
}

let _refreshP = null;
let _needsPostLoginRender = false; // 登入時設 true，下次背景刷新成功後重新渲染一次
async function _bgRefresh() {
  if (_refreshP) return _refreshP;
  _refreshP = fetch(API_URL, { signal: AbortSignal.timeout(8000) })
    .then(r => r.json())
    .then(j => {
      if (j && typeof j === 'object' && !j.error) {
        const now = Date.now();
        // 清理過期 _recentSaves
        for (const [k, ts] of _recentSaves) {
          if (now - ts >= _SAVE_GRACE_MS) _recentSaves.delete(k);
        }
        const pending = new Set(_saveQueue.keys());
        // 不用 Object.assign 整批覆蓋；對每個 key 逐一檢查是否該保留本地版本
        for (const k of Object.keys(j)) {
          if (pending.has(k)) continue;       // 還在 push queue 裡
          if (_recentSaves.has(k)) continue;  // 8 秒內剛 push 過
          cache[k] = j[k];
        }
        _invalidateCfg();
        _lsSave();
        // 僅在登入後首次刷新成功時重新渲染，避免後續刷新打斷編輯
        if (_needsPostLoginRender && CU && _activeTab && typeof switchTab === 'function') {
          _needsPostLoginRender = false;
          try { switchTab(_activeTab); } catch {}
        }
      }
    })
    .catch(() => {})
    .finally(() => { _refreshP = null; });
  return _refreshP;
}
_bgRefresh();

async function _syncAndRender() {
  await _bgRefresh();
  if (!CU) return;
  if (_activeTab !== 'main') return;
  if (document.activeElement?.tagName === 'TEXTAREA') return;
  renderMain();
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && CU) _syncAndRender();
});

setInterval(() => { if (CU && !document.hidden) _syncAndRender(); }, 30000);

const _saveQueue = new Map();
let _saveRunning = false;

async function _drainSaveQueue() {
  if (_saveRunning || _saveQueue.size === 0) return;
  _saveRunning = true;
  try {
    // 同 batch 內所有 key 並行送出（同 key 多次寫已被 Map.set 覆蓋為最後一次）
    const tasks = [];
    for (const [key, data] of _saveQueue) {
      tasks.push(_apiPost({ key, data }).catch(() => {}));
    }
    _saveQueue.clear();
    await Promise.all(tasks);
  } finally {
    _saveRunning = false;
    if (_saveQueue.size > 0) _drainSaveQueue();
  }
}

async function apiSave(key, data) {
  cache[key] = data;
  if (key === '__config__') _invalidateCfg();
  _lsSave();
  _saveQueue.set(key, data);
  _recentSaves.set(key, Date.now()); // 標記近期保存，refresh 不要覆蓋
  _drainSaveQueue();
}

function _debounce(fn, ms) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

function _apiPost(payload) {
  return fetch(API_URL, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  });
}

// ===== WEEK KEY（每週六深夜自動重置，週日 00:00 起為新週）=====
function getWeekKey() {
  const d = new Date();
  // 找本週週日（day=0），以週日日期為週次識別碼
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - d.getDay());
  const y  = sunday.getFullYear();
  const m  = String(sunday.getMonth() + 1).padStart(2, '0');
  const dd = String(sunday.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ===== CONFIG =====
const DEFAULT_USERS = ['康康', '麥莉', '報到組員', '簡報顧問'];
const DEFAULT_ADMIN = '康康';
const GUEST_ROLES = ['EDM手', '來賓組', '主席', '副主席', '報到組'];
const TAB_LIST = [
  { id: 'todo',       label: '待辦事項', group: '日常' },
  { id: 'main',       label: '工事清單', group: '日常' },
  { id: 'meeting',    label: '例會流程', group: '例會' },
  { id: 'signin',     label: '出席簽到', group: '例會' },
  { id: 'plate',      label: '車牌登記', group: '例會' },
  { id: 'guesttrack', label: '來賓追蹤', group: '例會' },
  { id: 'placard',    label: '桌牌製作', group: '例會' },
  { id: 'schedule',   label: '簡報排程', group: '例會' },
  { id: 'member',     label: '會員資料', group: '會員' },
  { id: 'renewal',    label: '續約管理', group: '會員' },
  { id: 'dm',         label: '會員DM',   group: '會員' },
  { id: 'slogan',     label: '會員口號', group: '會員' },
  { id: 'finance',    label: '財務控管', group: '財務' }
];
const MENU_GROUP_ORDER = ['日常','例會','會員','財務'];

function _normalizeUser(u) {
  if (typeof u === 'string') return { names: [u], roles: [], role: '', allowedTabs: [], editableTabs: [] };
  if (!u) return { names: [], roles: [], role: '', allowedTabs: [], editableTabs: [] };
  let names;
  if (Array.isArray(u.names)) names = u.names.filter(n => n);
  else if (u.name) names = [u.name];
  else names = [];
  // 角色多選：兼容舊 u.role string 與新 u.roles array
  let roles = [];
  if (Array.isArray(u.roles)) roles = u.roles.filter(r => r);
  else if (u.role) roles = [u.role];
  const allowedTabs = u.allowedTabs || [];
  const editableTabs = Array.isArray(u.editableTabs) ? u.editableTabs.filter(t => allowedTabs.includes(t)) : [...allowedTabs];
  return { names, roles, role: roles[0] || '', allowedTabs, editableTabs };
}

// 一次性 owner 名稱遷移表（舊名 → 新名）
// 一次性 owner 名稱遷移表（舊名 → 新名；對應到 '' 表示移除指派）
const _OWNER_RENAME = { '康康': 'K', '麥莉': 'K', '簡報顧問': 'K', '報到組員': '' };
function _renameOwner(n) { return Object.prototype.hasOwnProperty.call(_OWNER_RENAME, n) ? _OWNER_RENAME[n] : n; }

function _normalizeTask(t) {
  const raw = Array.isArray(t.owners) ? t.owners.filter(n => n) : (t.owner ? [t.owner] : []);
  const owners = [...new Set(raw.map(_renameOwner).filter(n => n))];
  return {
    id: t.id,
    day: t.day || '',
    owners,
    task: t.task || '',
    cat: t.cat || '',
    freq: t.freq || ''
  };
}
function _seedTasksFromTaskData() { return TASK_DATA.map(_normalizeTask); }

let _cfgResolved = null;
function _invalidateCfg() { _cfgResolved = null; }

function getConfig() {
  if (_cfgResolved) return _cfgResolved;
  const c = cache['__config__'];
  let result;
  if (c && c.adminPassword) {
    let tasks;
    if (Array.isArray(c.tasks)) {
      tasks = c.tasks.map(_normalizeTask);
    } else {
      // 升級：以 TASK_DATA 為基底 + 舊 customTasks 合併
      const seed = _seedTasksFromTaskData();
      const custom = (c.customTasks || []).map(_normalizeTask);
      tasks = [...seed, ...custom];
    }
    result = { ...c, users: (c.users || []).map(_normalizeUser), tasks };
  } else {
    result = { adminPassword: DEFAULT_ADMIN, users: DEFAULT_USERS.map(_normalizeUser), tasks: _seedTasksFromTaskData() };
  }
  _cfgResolved = result;
  return result;
}
async function saveConfigData(cfg) { await apiSave('__config__', cfg); }

// ===== PROGRESS & NOTES =====
function getProgData()  { return cache[`__prog_${getWeekKey()}__`] || {}; }
async function saveProgData(d)  { await apiSave(`__prog_${getWeekKey()}__`, d); }

function getNoteData()  { return cache[`__notes_${getWeekKey()}__`] || {}; }
async function saveNoteData(d)  { await apiSave(`__notes_${getWeekKey()}__`, d); }

// ===== TODOS（每位使用者一份，雲端同步）=====
function getMyTodos() {
  if (!CU) return [];
  return cache[`__todos_${CU}__`] || [];
}
async function saveMyTodos(list) {
  if (!CU) return;
  await apiSave(`__todos_${CU}__`, list);
}

// ===== TASK DATA =====
// id 為永久固定識別碼，不可更改，新增任務請使用新的 id
const TASK_DATA = [
  { id:1,  day:'週日', owner:'K',    task:'提醒EDM手，週一繳交3張PPT圖<br>1.未來6周簡報主題簡報預告<br>2.當周、下周16:9主題簡報EDM',  cat:'例會',    freq:'每週' },
  { id:2,  day:'週日', owner:'K',    task:'查看三個月內會員有誰，並提醒續約',                   cat:'續約',    freq:'每週' },
  { id:3,  day:'週日', owner:'K', task:'每週簡報工作進度回報',                              cat:'簡報',    freq:'每週' },
  { id:4,  day:'週日', owner:'K', task:'提醒顧問於中午12:00前填寫顧問輔導表',                 cat:'簡報',    freq:'每週' },
  { id:5,  day:'週日', owner:'K',    task:'確認八週內皆有簡報人選',                             cat:'簡報',    freq:'每週' },
  { id:6,  day:'週日', owner:'K',    task:'提醒EDM手PO出下兩週的主題簡報EDM',                   cat:'簡報',    freq:'每週' },
  { id:7,  day:'週一', owner:'K',    task:'請執秘印每週主題簡報感謝狀（每月最後一週印當月）',    cat:'例會',    freq:'每月末週' },
  { id:8,  day:'週一', owner:'K',    task:'領導團隊論壇簡報準備（每月第一週）',                  cat:'例會',    freq:'每月首週' },
  { id:9,  day:'週二', owner:'K',    task:'PO出本週例會流程表（領導團隊群、秘財群組）',           cat:'例會',    freq:'每週' },
  { id:10, day:'週一', owner:'K',    task:'五冠王獎狀 ➔ 副主席、執秘',                         cat:'例會',    freq:'每週' },
  { id:11, day:'週一', owner:'K',    task:'提醒五長隔天繳交簡報',                               cat:'例會',    freq:'每週' },
  { id:12, day:'週一', owner:'K',    task:'買續約黑緞帶，告知並安排上台',                        cat:'續約',    freq:'視需要' },
  { id:13, day:'週一', owner:'K', task:'確認簡報進度/繳交資料',                             cat:'簡報',    freq:'每週' },
  { id:14, day:'週日', owner:'K',    task:'新簡報人選加入簡報準備群',                            cat:'簡報',    freq:'每週' },
  { id:15, day:'週一', owner:'K',    task:'每週簡報進度公告',                                   cat:'簡報',    freq:'每週' },
  { id:16, day:'週一', owner:'K',    task:'更新續約進度',                                       cat:'續約',    freq:'每週' },
  { id:17, day:'週二', owner:'K',    task:'繳交秘財簡報內容，新人放入八大產業 ➔ DJ手',           cat:'例會',    freq:'每週' },
  { id:18, day:'週二', owner:'K',    task:'確認當周主題簡報講者',                                cat:'簡報',    freq:'每週' },
  { id:19, day:'週一', owner:'K',    task:'每週確認上週財務紀錄表',                              cat:'財務',    freq:'每週' },
  { id:20, day:'週三', owner:'K',    task:'在三長會議回報三個月內續約會員進度',                   cat:'續約',    freq:'每週' },
  { id:21, day:'週三', owner:'K',    task:'練習秘財（簡報者/締結）',                             cat:'例會',    freq:'每週' },
  { id:22, day:'週三', owner:'K',    task:'確認新人SLOGAN表完成',                               cat:'會員',    freq:'每週' },
  { id:23, day:'週四', owner:'K', task:'21:00 與下兩週簡報講者最終re稿',                    cat:'簡報',    freq:'每週' },
  { id:24, day:'週四', owner:'K',    task:'群組提醒例會前注意事項',                              cat:'例會',    freq:'每週' },
  { id:25, day:'週四', owner:'', task:'印會員/來賓簽到表',                                  cat:'例會',    freq:'每週' },
  { id:26, day:'週四', owner:'', task:'印流程表 x7份、slogan表',                            cat:'例會',    freq:'每週' },
  { id:27, day:'週四', owner:'', task:'印來賓桌牌',                                         cat:'例會',    freq:'每週' },
  { id:28, day:'週四', owner:'K',    task:'月底早上提醒明天繳錢',                                cat:'財務',    freq:'月底' },
  { id:29, day:'週五', owner:'K',    task:'開例會/報告',                                        cat:'例會',    freq:'每週' },
  { id:30, day:'週五', owner:'K',    task:'群組例會後提醒或表揚',                                cat:'例會',    freq:'每週' },
  { id:31, day:'週五', owner:'K',    task:'續約會員追蹤',                                       cat:'續約',    freq:'每週' },
  { id:32, day:'週五', owner:'', task:'攜帶獎狀、流程表',                                   cat:'例會',    freq:'每週' },
  { id:33, day:'週五', owner:'', task:'資金費用請款（場餐費700元）',                         cat:'財務',    freq:'每週' },
  { id:34, day:'週五', owner:'', task:'資金費用收入記錄',                                   cat:'財務',    freq:'每週' },
  { id:35, day:'週六', owner:'K',    task:'key 來賓資料到 Connect',                             cat:'例會',    freq:'每週' },
  { id:36, day:'週六', owner:'K',    task:'基礎建設日（一對一主題簡報、續約關心、基礎建設）',      cat:'基礎建設', freq:'每週' },
  { id:37, day:'週日', owner:'K',    task:'跟新會員要照片、名片放相簿',                           cat:'會員',    freq:'視需要' },
  { id:38, day:'週一', owner:'K',    task:'導生畢業確認通知 ➔ 導師群組',                         cat:'會員',    freq:'視需要' },
];

const TASK_IDX = new Map(TASK_DATA.map(t => [t, t.id]));

function getAllTasks() { return getConfig().tasks || []; }

function _taskVisibleToUser(t, name) {
  const owners = t.owners || (t.owner ? [t.owner] : []);
  return !owners.length || owners.includes(name);
}
function _canEditTask(t) {
  if (CR === 'admin') return true;
  const owners = t.owners || (t.owner ? [t.owner] : []);
  return owners.includes(CU);
}
// 判斷登入者是否擁有指定頁籤的編輯權
// - admin 一律 true
// - 角色「報到組」對 'finance' 預設 true（比照負責人）；唯一關閉方式：admin 把 finance ON/OFF 切到 OFF
//   （即 allowedTabs 含 finance、editableTabs 不含 finance；屬於明確關閉）
// - 其他情況依 editableTabs 判斷
function _canEditTab(tabId) {
  if (CR === 'admin') return true;
  if (!CU) return false;
  const userObj = getConfig().users.find(u => (u.names || []).includes(CU));
  if (!userObj) return false;
  if (tabId === 'finance' && (userObj.roles || []).includes('報到組')) {
    const allowed  = (userObj.allowedTabs  || []).includes('finance');
    const editable = (userObj.editableTabs || []).includes('finance');
    if (allowed && !editable) return false; // admin 明確切 OFF
    return true;                            // 預設可編
  }
  return (userObj.editableTabs || []).includes(tabId);
}

// ===== 編輯鎖（OFF 狀態下：輸入欄位鎖定，按鈕仍可點）=====
let _editLockPaused = false;
function _pauseEditLock() {
  _editLockPaused = true;
  // 暫停期間徹底中止 observer，避免大量 mutation 累積
  if (_editLockObserver) {
    _editLockObserver.disconnect();
    _editLockObserver = null;
  }
}
function _resumeEditLock() {
  _editLockPaused = false;
  const finish = () => {
    _applyEditLock(_activeTab);
    _startEditLockObserver();
  };
  if (window.requestIdleCallback) {
    requestIdleCallback(finish, { timeout: 500 });
  } else {
    setTimeout(finish, 200);
  }
}
function _applyEditLock(tabId) {
  if (_editLockPaused) return;
  if (!tabId || tabId === 'settings') return;
  if (CR === 'admin') return; // admin 不限制
  const canEdit = _canEditTab(tabId);
  // 取對應 content 容器
  const map = {
    todo:'todoContent', main:'mainContent', member:'memberContent',
    dm:'dmContent', slogan:'sloganContent', plate:'plateContent', signin:'signinContent', guesttrack:'guestTrackContent',
    placard:'placardContent', schedule:'scheduleContent', finance:'financeContent', meeting:'meetingContent'
  };
  const targets = [];
  if (map[tabId]) {
    const el = document.getElementById(map[tabId]);
    if (el) targets.push(el);
  }
  // Modal 內容也要一併鎖定
  document.querySelectorAll('.modal-overlay, .modal-box, .detail-modal').forEach(m => targets.push(m));
  targets.forEach(container => {
    container.querySelectorAll('input, textarea, select').forEach(el => {
      if (canEdit) {
        el.removeAttribute('readonly');
        if (el.dataset.lockedBy === '1') {
          el.disabled = false;
          el.removeAttribute('data-locked-by');
        }
        el.classList.remove('is-locked');
      } else {
        const tag = el.tagName, type = (el.type || '').toLowerCase();
        if (tag === 'SELECT' || ['checkbox','radio','file'].includes(type)) {
          if (!el.disabled) { el.disabled = true; el.dataset.lockedBy = '1'; }
        } else {
          el.setAttribute('readonly', 'readonly');
        }
        el.classList.add('is-locked');
      }
    });
  });
}

// 監視 DOM 變動，動態套用編輯鎖（監視 body 因為 modal 都 append 到 body）
let _editLockObserver = null;
let _editLockTimer = null;
function _startEditLockObserver() {
  if (_editLockObserver) return;
  _editLockObserver = new MutationObserver(() => {
    if (_editLockPaused) return;  // PDF/匯出期間暫停，避免大量 DOM clone 觸發卡頓
    if (_editLockTimer) return;
    _editLockTimer = setTimeout(() => {
      _editLockTimer = null;
      _applyEditLock(_activeTab);
    }, 80);
  });
  _editLockObserver.observe(document.body, { childList: true, subtree: true });
  _applyEditLock(_activeTab);
}

// 重新計算當前使用者允許的 tabs，重新渲染 menu dropdown（保險：避免狀態殘留導致 dropdown 空白）
function _refreshMenuDropdown() {
  if (!CU) return;
  const dd = document.getElementById('menuDropdown');
  if (!dd) return;
  const cfg = getConfig();
  const userObj = cfg.users.find(u => (u.names || []).includes(CU));
  const isAdmin = CR === 'admin';
  const allowed = isAdmin ? TAB_LIST.map(t => t.id) : (userObj ? _visibleTabsForUser(userObj) : []);
  if (typeof _renderMenuDropdown === 'function') _renderMenuDropdown(allowed, isAdmin);
}

// 當分頁從背景切回前景時，強制重置鎖與 observer，並重新渲染 menu，避免 PDF 切到新分頁後狀態殘留
function _resetUiAfterReturn() {
  if (_editLockTimer) { clearTimeout(_editLockTimer); _editLockTimer = null; }
  if (_editLockPaused) {
    _editLockPaused = false;
    _startEditLockObserver();
  }
  // 重新渲染 menu dropdown（避免 dropdown 內容空白）
  _refreshMenuDropdown();
  setTimeout(() => _applyEditLock(_activeTab), 100);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') _resetUiAfterReturn();
});
window.addEventListener('focus', _resetUiAfterReturn);
window.addEventListener('pageshow', _resetUiAfterReturn);

// 角色「報到組」進入後 finance 頁籤一律可見（即使 admin 沒勾，也能看到）
function _visibleTabsForUser(userObj) {
  const set = new Set((userObj && userObj.allowedTabs) || []);
  if (userObj && (userObj.roles || []).includes('報到組')) set.add('finance');
  return [...set];
}
// 工事清單：admin 看全部；其他人都只看「指派給自己 + 全體」
// ON/OFF 由 _applyEditLock 處理編輯能力，不影響可見範圍
function _mainVisibleTasks() {
  const all = getAllTasks();
  if (CR === 'admin') return all;
  return all.filter(t => _taskVisibleToUser(t, CU));
}

const DAYS = ['週日','週一','週二','週三','週四','週五','週六'];
const TODAY_DAY = DAYS[new Date().getDay()];

function getTodayStr() {
  const now = new Date();
  return `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日`;
}

