// ===== 會議紀錄通用模組（三長周會 / 領導月會）=====
// 資料結構：cache[module.storageKey] = Meeting[]
// Meeting = { id, weekKey, meetingDate, absent,
//             topics:[{title,content,decision}],
//             actions:[{text,owner,due,status,trackNote}],
//             nextMeeting, summary, createdAt, updatedAt }

const _SC_STATUS_LABELS = { pending: '待處理', done: '已完成', delay: '延期', cancel: '取消' };
const _SC_STATUS_ORDER = ['pending', 'done', 'delay', 'cancel'];

const _SC_MODULES = {
  sanchang: {
    id: 'sanchang',
    storageKey: '__sanchang_meetings__',
    contentEl: 'sanchangContent',
    title: '三長周會',
    attendees: '主席、副主席、秘書財務',
    owners: ['主席', '副主席', '秘書財務'],
    filePrefix: '三長周會',
    hasTopics: true,
    hasMotions: false,
    hasSummary: true,
    hasAnnouncements: true,
    groupActionsByRole: true,
    unifiedRoleView: true,   // 單一頁：頂部基本資訊折疊條 + 快速新增列，下方依職掌分組
  },
  leadership: {
    id: 'leadership',
    storageKey: '__leadership_meetings__',
    contentEl: 'leadershipContent',
    title: '領導月會',
    attendees: '主席、副主席、秘書財務、活動協調員、教育協調員、成長協調員、導師協調員、來賓接待員、網站管理員、董顧、支持成長董顧',
    owners: ['主席', '副主席', '秘書財務', '活動協調員', '教育協調員', '成長協調員', '導師協調員', '來賓接待員', '網站管理員', '董顧', '支持成長董顧'],
    filePrefix: '領導月會',
    hasTopics: false,
    hasReports: true,
    hasMotions: true,
    hasSummary: true,
    hasAnnouncements: true,
    groupActionsByRole: true,
    unifiedRoleView: true,   // 比照三長周會：單頁式（基本資訊折疊 + 快速新增 + 依職掌分組卡片）
    reportRoles: ['主席', '副主席', '秘書財務', '活動協調員', '教育協調員', '成長協調員', '導師協調員', '來賓接待員', '網站管理員', '董顧', '支持成長董顧']
  }
};

const _scStates = {
  sanchang:   { view: 'current', histDetailId: null, section: 'items', roleCollapsed: {}, quickType: 'announce', quickRole: '主席', basicOpen: false, carryCollapsed: false },
  leadership: { view: 'current', histDetailId: null, section: 'items', roleCollapsed: {}, quickType: 'announce', quickRole: '主席', basicOpen: false, carryCollapsed: false }
};

let _scCurMod = 'sanchang';
let _scState = _scStates[_scCurMod];
function _scMod() { return _SC_MODULES[_scCurMod]; }
function _scSetModule(modId) {
  _scCurMod = modId;
  _scState = _scStates[modId];
  // 防呆：若 section 不在當前模組的 sectionTabs，自動 fallback 到第一個
  const mod = _SC_MODULES[modId];
  if (mod && Array.isArray(mod.sectionTabs) && mod.sectionTabs.length) {
    const valid = mod.sectionTabs.some(s => s.id === _scState.section);
    if (!valid) _scState.section = mod.sectionTabs[0].id;
  }
  if (!_scState.roleCollapsed) _scState.roleCollapsed = {};
}

// 是否該收合某職掌卡片
// 規則：使用者明確設定 > 預設（沒內容自動收合，有內容自動展開）
function _scIsRoleCollapsed(section, role, itemCount) {
  const key = `${section}:${role}`;
  const explicit = _scState.roleCollapsed[key];
  if (explicit === true || explicit === false) return explicit;
  return itemCount === 0;
}
function _scToggleRoleCollapsed(section, role, ev) {
  if (ev) { ev.stopPropagation(); }
  const key = `${section}:${role}`;
  const cur = _scState.roleCollapsed[key];
  // 取得目前實際狀態（未設定時依預設）→ 切換為相反
  const card = document.getElementById(`sc-role-card-${section}-${_scRoleSlug(role)}`);
  const body = card ? card.querySelector('.sc-card-body') : null;
  const nowCollapsed = body ? body.classList.contains('is-collapsed') : (cur === true);
  _scState.roleCollapsed[key] = !nowCollapsed;
  if (body) {
    body.classList.toggle('is-collapsed', !nowCollapsed);
    card.classList.toggle('is-collapsed', !nowCollapsed);
  }
}
function _scExpandRole(section, role) {
  _scState.roleCollapsed[`${section}:${role}`] = false;
}
function _scSetAllRolesCollapsed(section, collapsed) {
  // 從 DOM 掃描當前 section 內所有職掌卡，套用狀態
  const container = document.getElementById(_scMod().contentEl);
  if (!container) return;
  container.querySelectorAll(`.sc-card-role[data-role-key]`).forEach(card => {
    const sec = card.dataset.sec;
    const key = card.dataset.roleKey;
    if (sec !== section) return;
    _scState.roleCollapsed[`${section}:${key}`] = collapsed;
    card.classList.toggle('is-collapsed', collapsed);
    const body = card.querySelector('.sc-card-body');
    if (body) body.classList.toggle('is-collapsed', collapsed);
  });
}
function _scExpandAllRoles(section)   { _scSetAllRolesCollapsed(section, false); }
function _scCollapseAllRoles(section) { _scSetAllRolesCollapsed(section, true); }
function _scRoleSlug(role) {
  // 把中文職掌名轉為 DOM id 安全字元（直接 encode）
  return encodeURIComponent(role).replace(/%/g, '_');
}
function _scScrollToRole(section, role) {
  // 確保展開
  _scExpandRole(section, role);
  const id = `sc-role-card-${section}-${_scRoleSlug(role)}`;
  const card = document.getElementById(id);
  if (card) {
    const body = card.querySelector('.sc-card-body');
    if (body) { body.classList.remove('is-collapsed'); }
    card.classList.remove('is-collapsed');
    // 計算 sticky 區頭部高度做 offset
    const stickyHead = document.querySelector(`#${_scMod().contentEl} .sc-sticky-head`);
    const offset = stickyHead ? stickyHead.offsetHeight + 60 : 80; // 60 為 app header 高度
    const top = card.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  }
}

function _scRoleCounts(m, section) {
  const roles = _scMod().owners || [];
  const out = {};
  if (section === 'announce') {
    roles.forEach(r => { out[r] = _scAnnouncementsForRole(m, r).length; });
  } else if (section === 'topics') {
    roles.forEach(r => { out[r] = _scTopicsForRole(m, r).length; });
  } else if (section === 'actions') {
    roles.forEach(r => { out[r] = _scActionsForRole(m, r).length; });
  } else if (section === 'items') {
    roles.forEach(r => {
      out[r] = _scAnnouncementsForRole(m, r).length
             + _scTopicsForRole(m, r).length
             + _scActionsForRole(m, r).length;
    });
  }
  return out;
}

// 職掌快速跳轉列 + 全部展開/收合
function _scRoleNavBarHtml(m, section) {
  const roles = (_scMod().owners || []).slice();
  const counts = _scRoleCounts(m, section);
  // 領導月會 announce 區段：把委員姓名也納入跳轉列
  const committeeChips = [];
  if (section === 'announce' && _scMod().hasReports && Array.isArray(m.committee)) {
    m.committee.forEach(c => {
      const n = (c.name || '').trim();
      if (!n) return;
      const cnt = (Array.isArray(c.announcements) ? c.announcements : []).length;
      committeeChips.push({ role: n, label: n, count: cnt, key: `_com_${n}`, isCommittee: true });
    });
  }
  const chips = roles.map(r => ({ role: r, label: r, count: counts[r] || 0, key: r, isCommittee: false }));
  // 副主席之後插入委員 chip（領導月會）
  let finalChips = chips;
  if (committeeChips.length) {
    const idx = chips.findIndex(x => x.role === '副主席');
    if (idx >= 0) finalChips = [...chips.slice(0, idx + 1), ...committeeChips, ...chips.slice(idx + 1)];
    else finalChips = [...chips, ...committeeChips];
  }
  const jsEsc = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const chipsHtml = finalChips.map(c => {
    const muted = c.count === 0 ? ' is-muted' : '';
    const com = c.isCommittee ? ' is-committee' : '';
    return `<button class="sc-role-chip${muted}${com}" onclick="_scScrollToRole('${section}', '${jsEsc(c.role)}')" title="${_scEsc(c.label)} (${c.count})">
      <span class="sc-role-chip-name">${_scEsc(c.label)}</span>
      <span class="sc-role-chip-count">${c.count}</span>
    </button>`;
  }).join('');
  return `
    <div class="sc-role-nav">
      <div class="sc-role-nav-actions">
        <button class="sc-role-nav-btn" onclick="_scExpandAllRoles('${section}')" title="全部展開">＋全展</button>
        <button class="sc-role-nav-btn" onclick="_scCollapseAllRoles('${section}')" title="全部收合">－全收</button>
      </div>
      <div class="sc-role-nav-chips">${chipsHtml}</div>
    </div>
  `;
}

const _scDebounceTimers = new Map();

// ===== 資料 =====
function _scGetMeetings() {
  const list = cache[_scMod().storageKey];
  return Array.isArray(list) ? list : [];
}
async function _scSaveMeetings(list) { await apiSave(_scMod().storageKey, list); }

function _scTodayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

// 與 <input type="date"> 格式互轉
// 顯示用 yyyy/mm/dd，date input 需要 yyyy-mm-dd
function _scDateToInput(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
}
function _scDateFromInput(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return s;
  return `${m[1]}/${m[2].padStart(2,'0')}/${m[3].padStart(2,'0')}`;
}
// 待辦期限：欄位用日期選擇，但儲存仍可能是 MM/DD 舊資料；顯示時統一傳整碼
function _scDueToInput(s, fallbackYear) {
  if (!s) return '';
  let m = String(s).match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  m = String(s).match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m && fallbackYear) return `${fallbackYear}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  return '';
}
function _scNewId(prefix) {
  return prefix + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

function _scNewMeeting() {
  return {
    id: _scNewId('m'),
    weekKey: getWeekKey(),
    meetingDate: _scTodayDateStr(),
    absent: '',
    announcements: [],
    topics: [],
    motions: [],
    actions: [],
    reports: {},
    committee: [],
    nextMeeting: '',
    summary: '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

// 把委員姓名插在副主席後面、秘書財務之前；無委員時回原配置
function _scComputedAttendees(m) {
  const mod = _scMod();
  const names = (m && Array.isArray(m.committee) ? m.committee : [])
    .map(c => (c && c.name || '').trim()).filter(n => n);
  if (!names.length) return mod.attendees;
  const base = (mod.reportRoles || mod.owners || []).slice();
  const idx = base.indexOf('副主席');
  if (idx >= 0) base.splice(idx + 1, 0, ...names);
  else base.push(...names);
  return base.join('、');
}

function _scComputedOwners(m) {
  const mod = _scMod();
  const owners = (mod.owners || []).slice();
  const names = (m && Array.isArray(m.committee) ? m.committee : [])
    .map(c => (c && c.name || '').trim()).filter(n => n);
  names.forEach(n => { if (!owners.includes(n)) owners.push(n); });
  return owners;
}

function _scFindMeeting(mid) { return _scGetMeetings().find(m => m.id === mid); }

// 取出該角色的議題（含原始索引）。沒填 role 的舊資料歸給「主席」
function _scTopicsForRole(m, role) {
  const topics = m.topics || [];
  const out = [];
  topics.forEach((t, idx) => {
    const r = t.role || '主席';
    if (r === role) out.push({ t, idx });
  });
  return out;
}

// 取出該角色的布達（含原始索引）。沒填 role 的舊資料歸給「主席」
function _scAnnouncementsForRole(m, role) {
  const list = m.announcements || [];
  const out = [];
  list.forEach((a, idx) => {
    const r = a.role || '主席';
    if (r === role) out.push({ a, idx });
  });
  return out;
}

// 取出該負責人的待辦（含原始索引）。role=null → 未指派
function _scActionsForRole(m, role) {
  const actions = m.actions || [];
  const out = [];
  actions.forEach((a, idx) => {
    if (role === null) {
      if (!a.owner) out.push({ a, idx });
    } else if (a.owner === role) {
      out.push({ a, idx });
    }
  });
  return out;
}

function _scCurrentMeeting() {
  const wk = getWeekKey();
  return _scGetMeetings().find(m => m.weekKey === wk) || null;
}

function _scLastMeeting() {
  const wk = getWeekKey();
  return _scGetMeetings()
    .filter(m => m.weekKey !== wk)
    .slice()
    .sort((a, b) => (b.meetingDate || '').localeCompare(a.meetingDate || ''))[0] || null;
}

async function _scUpsertMeeting(m) {
  m.updatedAt = Date.now();
  const all = _scGetMeetings().slice();
  const i = all.findIndex(x => x.id === m.id);
  if (i >= 0) all[i] = m; else all.push(m);
  await _scSaveMeetings(all);
}

function _scDebouncedSave(m) {
  const modId = _scCurMod;
  clearTimeout(_scDebounceTimers.get(m.id));
  _scDebounceTimers.set(m.id, setTimeout(async () => {
    m.updatedAt = Date.now();
    const key = _SC_MODULES[modId].storageKey;
    const all = (Array.isArray(cache[key]) ? cache[key] : []).slice();
    const i = all.findIndex(x => x.id === m.id);
    if (i >= 0) all[i] = m; else all.push(m);
    await apiSave(key, all);
  }, 500));
}

// ===== 主渲染 =====
function renderSanchang()   { _scSetModule('sanchang');   _scRenderActive(); }
function renderLeadership() { _scSetModule('leadership'); _scRenderActive(); }
function _scRenderActive() {
  const ht = document.getElementById('headerTitle');
  if (ht) ht.textContent = _scMod().title;
  const view = _scState.view;
  const tabs = [
    { id: 'current', label: '本週會議' },
    { id: 'track', label: '上週追蹤' },
    { id: 'history', label: '歷史會議' }
  ];
  const tabHtml = tabs.map(t =>
    `<button class="sc-tab ${view === t.id ? 'active' : ''}" onclick="_scSwitchView('${t.id}')">${t.label}</button>`
  ).join('');
  let body = '';
  if (view === 'current') body = _scRenderCurrent();
  if (view === 'track') body = _scRenderTrack();
  if (view === 'history') body = _scRenderHistory();
  document.getElementById(_scMod().contentEl).innerHTML = `
    <div class="sc-wrap">
      <div class="sc-subnav">${tabHtml}</div>
      ${body}
    </div>
  `;
  // 統一事項頁（三長周會）：初始化拖拉排序
  if (_scMod().unifiedRoleView && _canEditTab(_scMod().id)) _scInitUnifiedSortable();
}
function _scSwitchView(v) { _scState.view = v; _scState.histDetailId = null; _scRenderActive(); }
function _scSetSection(s) { _scState.section = s; _scRenderActive(); }

// 計算各區段的數量徽章
function _scSectionCounts(m) {
  const mod = _scMod();
  const roles = mod.reportRoles || mod.owners || [];
  const reports = m.reports || {};
  const committee = (Array.isArray(m.committee) ? m.committee : []).filter(c => (c.name || '').trim() && (c.report || '').trim());
  const filledReports = roles.filter(r => (reports[r] || '').trim()).length + committee.length;
  return {
    announce: (m.announcements || []).length,
    topics:   (m.topics   || []).length,
    reports:  filledReports,
    actions:  (m.actions  || []).length,
    motions:  (m.motions  || []).length,
    items:    (m.announcements || []).length + (m.topics || []).length + (m.actions || []).length,
  };
}

// ===== 本週會議 =====
function _scRenderCurrent() {
  const canEdit = _canEditTab('sanchang');
  const m = _scCurrentMeeting();
  if (!m) {
    return `
      <div class="sc-card sc-empty">
        <div class="sc-empty-title">本週尚未建立${_scMod().title}紀錄</div>
        <div class="sc-empty-desc">點下方按鈕開始本週紀錄</div>
        ${canEdit ? `<button class="sc-btn sc-btn-primary" onclick="_scCreateThisWeek()">建立本週紀錄</button>` : ''}
      </div>
    `;
  }
  return _scRenderEditor(m);
}

async function _scCreateThisWeek() {
  const m = _scNewMeeting();
  await _scUpsertMeeting(m);
  _scRenderActive();
}

function _scRenderEditor(m) {
  const canEdit = _canEditTab(_scMod().id);
  const mod = _scMod();
  if (mod.id === 'leadership') _scMigrateLeadershipReports(m);
  const showTopics       = mod.hasTopics !== false;
  const showMotions      = mod.hasMotions === true;
  const showSummary      = mod.hasSummary !== false;
  const showAnnouncements= mod.hasAnnouncements === true;

  const sectionMap = {
    basic: `<div class="sc-card">
      <div class="sc-card-head">
        <span class="sc-card-title">基本資訊</span>
      </div>
      <label class="sc-field">
        <span class="sc-label">會議日期</span>
        <input type="date" class="sc-input" value="${_scDateToInput(m.meetingDate)}" onchange="_scUpdateDateField('${m.id}','meetingDate',this.value)">
      </label>
      <label class="sc-field">
        <span class="sc-label">出席人員</span>
        <div class="sc-input sc-input-static" id="scAttendeesDisplay">${_scComputedAttendees(m)}</div>
      </label>
      <label class="sc-field">
        <span class="sc-label">請假人員（如有）</span>
        <input type="text" class="sc-input" value="${_scEsc(m.absent)}" placeholder="例：副主席" oninput="_scUpdateField('${m.id}','absent',this.value)">
      </label>
      <label class="sc-field">
        <span class="sc-label">下次會議日期</span>
        <input type="date" class="sc-input" value="${_scDateToInput(m.nextMeeting)}" onchange="_scUpdateDateField('${m.id}','nextMeeting',this.value)">
      </label>
      ${showSummary ? `<label class="sc-field">
        <span class="sc-label">摘要</span>
        <textarea class="sc-textarea" rows="3" placeholder="本次會議重點摘要..." oninput="_scUpdateField('${m.id}','summary',this.value)">${_scEsc(m.summary)}</textarea>
      </label>` : ''}
    </div>`,
    announce: showAnnouncements ? _scAnnouncementsEditorHtml(m, canEdit) : '',
    topics: showTopics ? _scTopicsEditorHtml(m, canEdit) : '',
    reports: _scReportsSectionHtml(m, canEdit),
    actions: mod.groupActionsByRole
      ? _scActionsEditorHtml(m, canEdit, false)
      : `<div class="sc-card">
        <div class="sc-card-head">
          <span class="sc-card-title">本週決議待辦</span>
          ${canEdit ? `<button class="sc-btn sc-btn-sm" onclick="_scAddAction('${m.id}')">+ 新增待辦</button>` : ''}
        </div>
        ${(m.actions || []).map((a, i) => _scActionRowHtml(m, a, i, canEdit, false)).join('') || `<div class="sc-empty-mini">尚未新增待辦事項</div>`}
      </div>`,
    motions: showMotions ? `<div class="sc-card">
      <div class="sc-card-head">
        <span class="sc-card-title">臨時動議</span>
        ${canEdit ? `<button class="sc-btn sc-btn-sm" onclick="_scAddMotion('${m.id}')">+ 新增動議</button>` : ''}
      </div>
      ${(m.motions || []).map((mo, i) => _scMotionCardHtml(m.id, mo, i, canEdit)).join('') || `<div class="sc-empty-mini">本次無臨時動議</div>`}
    </div>` : '',
    items: mod.unifiedRoleView ? _scUnifiedItemsHtml(m, canEdit) : '',
  };

  // 區段分頁模式：只渲染當前 section；否則全部渲染
  let body;
  if (mod.unifiedRoleView) {
    // 單一頁：基本資訊折疊條 + 快速新增列（皆固定頂部），下方職掌章節
    const quickAddHtml = canEdit ? _scQuickAddBarHtml(m) : '';
    const basicFold = _scBasicFoldHtml(m, sectionMap.basic);
    // 上週未結案提醒：僅本週會議顯示
    const carryHtml = (m.weekKey === getWeekKey()) ? _scCarryOverHtml(canEdit) : '';
    body = `<div class="sc-sticky-head sc-sticky-unified">${basicFold}${quickAddHtml}</div>${carryHtml}${sectionMap.items}`;
  } else if (mod.sectionTabs && mod.sectionTabs.length) {
    const active = _scState.section || mod.sectionTabs[0].id;
    const counts = _scSectionCounts(m);
    const tabs = mod.sectionTabs.map(s => {
      const c = counts[s.id];
      const cBadge = c ? `<span class="sc-sec-count">${c}</span>` : '';
      return `<button class="sc-sec-tab ${active === s.id ? 'active' : ''}" onclick="_scSetSection('${s.id}')">${s.label}${cBadge}</button>`;
    }).join('');
    let secHtml = '';
    if (active === 'basic')         secHtml = sectionMap.basic;
    else if (active === 'announce') secHtml = sectionMap.announce;
    else if (active === 'topics')   secHtml = sectionMap.topics;
    else if (active === 'reports')  secHtml = sectionMap.reports;
    else if (active === 'actions')  secHtml = sectionMap.actions;
    else if (active === 'motions')  secHtml = sectionMap.motions;
    else if (active === 'items')    secHtml = sectionMap.items;
    // 職掌分組區段：在 sticky 區頭加上職掌跳轉列
    const roleGrouped =
      (active === 'announce' && mod.hasAnnouncements === true) ||
      (active === 'topics'   && mod.hasTopics !== false) ||
      (active === 'actions'  && mod.groupActionsByRole === true);
    const roleNavHtml = roleGrouped ? _scRoleNavBarHtml(m, active) : '';
    // 統一事項頁：頂部固定快速新增列
    const quickAddHtml = (active === 'items' && mod.unifiedRoleView === true && canEdit)
      ? _scQuickAddBarHtml(m) : '';
    body = `<div class="sc-sticky-head"><div class="sc-sec-tabs">${tabs}</div>${quickAddHtml}${roleNavHtml}</div>${secHtml}`;
  } else {
    body = sectionMap.basic + sectionMap.topics + sectionMap.reports + sectionMap.actions + sectionMap.motions;
  }

  return `
    ${body}
    ${mod.unifiedRoleView ? '' : `<div class="sc-toolbar">
      <button class="sc-btn sc-btn-ghost" onclick="_scPreview('${m.id}')">預覽</button>
      <button class="sc-btn sc-btn-primary" onclick="_scExportPDF('${m.id}')">PDF</button>
      <button class="sc-btn sc-btn-primary" onclick="_scExportJPG('${m.id}')">JPG</button>
      <button class="sc-btn sc-btn-primary" onclick="_scCopyLineText('${m.id}')">複製文字</button>
    </div>`}
  `;
}

function _scTopicCardHtml(mid, t, idx, displayIdx, canEdit) {
  return `
    <div class="sc-topic" data-tidx="${idx}">
      <div class="sc-topic-head">
        <span class="sc-topic-num">議題 ${displayIdx + 1}</span>
        ${canEdit ? `<button class="sc-icon-btn" onclick="_scDelTopic('${mid}',${idx})" title="刪除">×</button>` : ''}
      </div>
      <input type="text" class="sc-input" placeholder="議題標題" value="${_scEsc(t.title || '')}" oninput="_scUpdateTopic('${mid}',${idx},'title',this.value)">
      <textarea class="sc-textarea" rows="2" placeholder="討論內容" oninput="_scUpdateTopic('${mid}',${idx},'content',this.value)">${_scEsc(t.content || '')}</textarea>
      <textarea class="sc-textarea sc-textarea-decision" rows="2" placeholder="決議" oninput="_scUpdateTopic('${mid}',${idx},'decision',this.value)">${_scEsc(t.decision || '')}</textarea>
    </div>
  `;
}

function _scAnnouncementCardHtml(mid, a, idx, displayIdx, canEdit) {
  return `
    <div class="sc-topic sc-announce" data-aidx="${idx}">
      <div class="sc-topic-head">
        <span class="sc-topic-num">第 ${displayIdx + 1} 則</span>
        ${canEdit ? `<button class="sc-icon-btn" onclick="_scDelAnnouncement('${mid}',${idx})" title="刪除">×</button>` : ''}
      </div>
      <textarea class="sc-textarea" rows="2" placeholder="布達內容（資訊共識，無須討論）" oninput="_scUpdateAnnouncement('${mid}',${idx},'content',this.value)">${_scEsc(a.content || '')}</textarea>
    </div>
  `;
}

function _scAnnouncementsEditorHtml(m, canEdit) {
  const mod = _scMod();
  const roles = mod.owners || [];
  const supportsCommittee = mod.hasReports === true; // 領導月會才有委員
  const out = [];
  roles.forEach(role => {
    const items = _scAnnouncementsForRole(m, role);
    const inner = items.map(({ a, idx }, di) => _scAnnouncementCardHtml(m.id, a, idx, di, canEdit)).join('');
    const collapsed = _scIsRoleCollapsed('announce', role, items.length);
    out.push(`<div class="sc-card sc-card-role${collapsed ? ' is-collapsed' : ''}" id="sc-role-card-announce-${_scRoleSlug(role)}" data-sec="announce" data-role-key="${role}">
      <div class="sc-card-head sc-card-head-toggle" onclick="_scToggleRoleCollapsed('announce','${role}',event)">
        <span class="sc-card-title"><span class="sc-role-tag">${role}</span>本周布達事項<span class="sc-role-count">${items.length}</span></span>
        <span class="sc-card-head-actions">
          ${canEdit ? `<button class="sc-btn sc-btn-sm" onclick="event.stopPropagation();_scAddAnnouncement('${m.id}','${role}')">+ 新增布達</button>` : ''}
          <span class="sc-card-chevron">▾</span>
        </span>
      </div>
      <div class="sc-card-body${collapsed ? ' is-collapsed' : ''}">
        ${inner || `<div class="sc-empty-mini">尚無布達事項</div>`}
      </div>
    </div>`);
    // 副主席 之後插入委員群組（領導月會專用）
    if (supportsCommittee && role === '副主席') {
      out.push(_scCommitteeAnnounceBlockHtml(m, canEdit));
    }
  });
  return out.join('');
}

// 委員群組（合併在布達區塊內）：每位委員 = 一張卡（姓名 + 布達清單 + 新增布達 + 刪除委員）
function _scCommitteeAnnounceBlockHtml(m, canEdit) {
  const committee = Array.isArray(m.committee) ? m.committee : [];
  const rows = committee.map((c, i) => {
    const items = Array.isArray(c.announcements) ? c.announcements : [];
    const name = (c.name || '').trim();
    const slug = `_com_${i}_${_scRoleSlug(name || 'unnamed')}`;
    const collapseKey = name ? `_com_${name}` : `_com_idx_${i}`;
    const jsKey = String(collapseKey).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const collapsed = _scIsRoleCollapsed('announce', collapseKey, items.length);
    const inner = items.map((a, di) => `
      <div class="sc-topic sc-announce">
        <div class="sc-topic-head">
          <span class="sc-topic-num">第 ${di + 1} 則</span>
          ${canEdit ? `<button class="sc-icon-btn" onclick="_scDelCommitteeAnnouncement('${m.id}',${i},${di})" title="刪除">×</button>` : ''}
        </div>
        <textarea class="sc-textarea" rows="2" placeholder="布達內容（資訊共識，無須討論）" oninput="_scUpdateCommitteeAnnouncement('${m.id}',${i},${di},this.value)">${_scEsc(a.content || '')}</textarea>
      </div>
    `).join('');
    return `<div class="sc-card sc-card-role${collapsed ? ' is-collapsed' : ''}" id="sc-role-card-announce-${slug}" data-sec="announce" data-role-key="${_scEsc(collapseKey)}">
      <div class="sc-card-head sc-card-head-toggle" onclick="_scToggleRoleCollapsed('announce','${jsKey}',event)">
        <span class="sc-card-title" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="sc-role-tag">委員</span>
          <input type="text" class="sc-input sc-input-sm" placeholder="委員姓名" value="${_scEsc(c.name || '')}" oninput="_scUpdateCommittee('${m.id}',${i},'name',this.value)" onclick="event.stopPropagation();" style="width:auto;min-width:120px;">
          ${canEdit ? `<button class="sc-icon-btn" onclick="event.stopPropagation();_scDelCommittee('${m.id}',${i})" title="刪除委員">×</button>` : ''}
          <span class="sc-role-count">${items.length}</span>
        </span>
        <span class="sc-card-head-actions">
          ${canEdit ? `<button class="sc-btn sc-btn-sm" onclick="event.stopPropagation();_scAddCommitteeAnnouncement('${m.id}',${i})">+ 新增布達</button>` : ''}
          <span class="sc-card-chevron">▾</span>
        </span>
      </div>
      <div class="sc-card-body${collapsed ? ' is-collapsed' : ''}">
        ${inner || `<div class="sc-empty-mini">尚無布達事項</div>`}
      </div>
    </div>`;
  }).join('');
  const addBtn = canEdit
    ? `<div style="margin:6px 0 14px;"><button class="sc-btn sc-btn-sm sc-btn-ghost" onclick="_scAddCommittee('${m.id}')">+ 新增委員</button></div>`
    : '';
  return rows + addBtn;
}

// === 委員布達 CRUD ===
async function _scAddCommitteeAnnouncement(mid, cidx) {
  const m = _scFindMeeting(mid);
  if (!m || !m.committee || !m.committee[cidx]) return;
  if (!Array.isArray(m.committee[cidx].announcements)) m.committee[cidx].announcements = [];
  m.committee[cidx].announcements.push({ content: '' });
  const name = (m.committee[cidx].name || '').trim();
  const key = name ? `_com_${name}` : `_com_idx_${cidx}`;
  _scExpandRole('announce', key);
  await _scUpsertMeeting(m);
  _scRenderActive();
}
async function _scDelCommitteeAnnouncement(mid, cidx, aidx) {
  if (!confirm('刪除這則布達？')) return;
  const m = _scFindMeeting(mid);
  if (!m || !m.committee || !m.committee[cidx] || !m.committee[cidx].announcements) return;
  m.committee[cidx].announcements.splice(aidx, 1);
  await _scUpsertMeeting(m);
  _scRenderActive();
}
function _scUpdateCommitteeAnnouncement(mid, cidx, aidx, val) {
  const m = _scFindMeeting(mid);
  if (!m || !m.committee || !m.committee[cidx]) return;
  if (!Array.isArray(m.committee[cidx].announcements)) m.committee[cidx].announcements = [];
  if (!m.committee[cidx].announcements[aidx]) return;
  m.committee[cidx].announcements[aidx].content = val;
  _scDebouncedSave(m);
}

async function _scAddAnnouncement(mid, role) {
  const m = _scFindMeeting(mid);
  if (!m) return;
  (m.announcements = m.announcements || []).push({ role: role || '主席', content: '' });
  _scExpandRole('announce', role || '主席');
  await _scUpsertMeeting(m);
  _scRenderActive();
}

async function _scDelAnnouncement(mid, idx) {
  if (!confirm('刪除這則布達？')) return;
  const m = _scFindMeeting(mid);
  if (!m || !m.announcements) return;
  m.announcements.splice(idx, 1);
  await _scUpsertMeeting(m);
  _scRenderActive();
}

function _scUpdateAnnouncement(mid, idx, field, val) {
  const m = _scFindMeeting(mid);
  if (!m || !m.announcements[idx]) return;
  m.announcements[idx][field] = val;
  _scDebouncedSave(m);
}

function _scTopicsEditorHtml(m, canEdit) {
  const mod = _scMod();
  const roles = mod.owners || [];
  return roles.map(role => {
    const items = _scTopicsForRole(m, role);
    const inner = items.map(({ t, idx }, di) => _scTopicCardHtml(m.id, t, idx, di, canEdit)).join('');
    const collapsed = _scIsRoleCollapsed('topics', role, items.length);
    return `<div class="sc-card sc-card-role${collapsed ? ' is-collapsed' : ''}" id="sc-role-card-topics-${_scRoleSlug(role)}" data-sec="topics" data-role-key="${role}">
      <div class="sc-card-head sc-card-head-toggle" onclick="_scToggleRoleCollapsed('topics','${role}',event)">
        <span class="sc-card-title"><span class="sc-role-tag">${role}</span>會議議題與決議<span class="sc-role-count">${items.length}</span></span>
        <span class="sc-card-head-actions">
          ${canEdit ? `<button class="sc-btn sc-btn-sm" onclick="event.stopPropagation();_scAddTopic('${m.id}','${role}')">+ 新增議題</button>` : ''}
          <span class="sc-card-chevron">▾</span>
        </span>
      </div>
      <div class="sc-card-body${collapsed ? ' is-collapsed' : ''}">
        ${inner || `<div class="sc-empty-mini">尚未新增議題</div>`}
      </div>
    </div>`;
  }).join('');
}

function _scActionsEditorHtml(m, canEdit, isTrack) {
  const mod = _scMod();
  const roles = mod.owners || [];
  const titleLabel = isTrack ? '待辦追蹤' : '本週決議待辦';
  const groups = roles.map(role => {
    const items = _scActionsForRole(m, role);
    if (isTrack && !items.length) return '';
    const inner = items.map(({ a, idx }) => _scActionRowHtml(m, a, idx, canEdit, isTrack)).join('');
    const collapsed = _scIsRoleCollapsed('actions', role, items.length);
    return `<div class="sc-card sc-card-role${collapsed ? ' is-collapsed' : ''}" id="sc-role-card-actions-${_scRoleSlug(role)}" data-sec="actions" data-role-key="${role}">
      <div class="sc-card-head sc-card-head-toggle" onclick="_scToggleRoleCollapsed('actions','${role}',event)">
        <span class="sc-card-title"><span class="sc-role-tag">${role}</span>${titleLabel}<span class="sc-role-count">${items.length}</span></span>
        <span class="sc-card-head-actions">
          ${(canEdit && !isTrack) ? `<button class="sc-btn sc-btn-sm" onclick="event.stopPropagation();_scAddAction('${m.id}','${role}')">+ 新增待辦</button>` : ''}
          <span class="sc-card-chevron">▾</span>
        </span>
      </div>
      <div class="sc-card-body${collapsed ? ' is-collapsed' : ''}">
        ${inner || `<div class="sc-empty-mini">尚未新增待辦</div>`}
      </div>
    </div>`;
  }).join('');
  // 未指派的待辦（owner 是空字串）→ 額外列出，不顯示新增按鈕
  const unassigned = _scActionsForRole(m, null);
  const unassignedHtml = unassigned.length
    ? `<div class="sc-card sc-card-role">
        <div class="sc-card-head">
          <span class="sc-card-title"><span class="sc-role-tag sc-role-tag-muted">未指派</span>${titleLabel}<span class="sc-role-count">${unassigned.length}</span></span>
        </div>
        <div class="sc-card-body">
          ${unassigned.map(({ a, idx }) => _scActionRowHtml(m, a, idx, canEdit, isTrack)).join('')}
        </div>
      </div>`
    : '';
  return groups + unassignedHtml;
}

// ===== 統一事項頁（三長周會專用）=====
// 基本資訊折疊條：標題列常駐，內容預設收合，點擊展開
function _scBasicFoldHtml(m, basicInnerHtml) {
  const open = _scState.basicOpen === true;
  return `<div class="sc-basic-fold${open ? ' is-open' : ''}">
    <div class="sc-basic-fold-head" onclick="_scToggleBasic()">
      <span class="sc-card-chevron">▾</span>
      <span class="sc-basic-fold-title">基本資訊</span>
      <span class="sc-basic-fold-tools">
        <button type="button" class="sc-mini-btn" onclick="event.stopPropagation();_scPreview('${m.id}')">預覽</button>
        <button type="button" class="sc-mini-btn" onclick="event.stopPropagation();_scExportPDF('${m.id}')">PDF</button>
        <button type="button" class="sc-mini-btn" onclick="event.stopPropagation();_scExportJPG('${m.id}')">JPG</button>
        <button type="button" class="sc-mini-btn" onclick="event.stopPropagation();_scCopyLineText('${m.id}')">複製</button>
      </span>
    </div>
    <div class="sc-basic-fold-body${open ? '' : ' is-collapsed'}">
      ${basicInnerHtml}
    </div>
  </div>`;
}

function _scToggleBasic() {
  _scState.basicOpen = !_scState.basicOpen;
  const fold = document.querySelector(`#${_scMod().contentEl} .sc-basic-fold`);
  if (!fold) return;
  fold.classList.toggle('is-open', _scState.basicOpen);
  const fbody = fold.querySelector('.sc-basic-fold-body');
  if (fbody) fbody.classList.toggle('is-collapsed', !_scState.basicOpen);
}

// 頂部快速新增列：選類型 + 職掌 + 內容，送出後自動歸到下方對應職掌卡
function _scQuickAddBarHtml(m) {
  const st = _scState;
  const mod = _scMod();
  const types = [];
  if (mod.hasAnnouncements === true) types.push({ id: 'announce', label: '布達' });
  if (mod.hasTopics !== false)       types.push({ id: 'topics',   label: '議題' });
  types.push({ id: 'actions', label: '待辦' });
  if (!types.some(t => t.id === st.quickType)) st.quickType = types[0].id;
  const roles = _scComputedOwners(m);
  if (!roles.includes(st.quickRole)) st.quickRole = roles[0] || '主席';
  const typeBtns = types.map(t =>
    `<button type="button" class="sc-qa-type sc-qa-type-${t.id}${st.quickType === t.id ? ' active' : ''}" data-qatype="${t.id}" onclick="_scQuickSetType('${t.id}')">${t.label}</button>`
  ).join('');
  const roleOpts = roles.map(r =>
    `<option value="${_scEsc(r)}" ${st.quickRole === r ? 'selected' : ''}>${_scEsc(r)}</option>`
  ).join('');
  return `
    <div class="sc-quickadd">
      <div class="sc-qa-types">${typeBtns}</div>
      <div class="sc-qa-entry">
        <select class="sc-select sc-input-sm sc-qa-role" onchange="_scQuickSetRole(this.value)">${roleOpts}</select>
        <input type="text" class="sc-input sc-qa-input" id="scQuickInput" autocomplete="off" placeholder="${_scQuickPlaceholder(st.quickType)}"
          onkeydown="if(event.key==='Enter'){event.preventDefault();_scQuickSubmit('${m.id}');}">
        <button type="button" class="sc-btn sc-btn-primary sc-qa-submit" onclick="_scQuickSubmit('${m.id}')">送入</button>
      </div>
    </div>
  `;
}

function _scQuickPlaceholder(t) {
  return t === 'topics'  ? '輸入議題標題，按 Enter 或送入…'
       : t === 'actions' ? '輸入待辦內容，按 Enter 或送入…'
       :                   '輸入布達內容，按 Enter 或送入…';
}

function _scQuickSetType(t) {
  _scState.quickType = t;
  document.querySelectorAll('.sc-qa-type').forEach(b =>
    b.classList.toggle('active', b.dataset.qatype === t)
  );
  const inp = document.getElementById('scQuickInput');
  if (inp) { inp.placeholder = _scQuickPlaceholder(t); inp.focus(); }
}

function _scQuickSetRole(r) { _scState.quickRole = r; }

async function _scQuickSubmit(mid) {
  const inp = document.getElementById('scQuickInput');
  if (!inp) return;
  const val = inp.value.trim();
  if (!val) { inp.focus(); return; }
  const m = _scFindMeeting(mid);
  if (!m) return;
  const type = _scState.quickType || 'announce';
  const roles = _scComputedOwners(m);
  const role = roles.includes(_scState.quickRole) ? _scState.quickRole : (roles[0] || '主席');
  // 委員（領導月會）：布達寫進該委員的 announcements，而非 m.announcements
  const comIdx = (_scMod().hasReports === true && Array.isArray(m.committee))
    ? m.committee.findIndex(c => (c.name || '').trim() === role)
    : -1;
  if (type === 'announce' && comIdx >= 0) {
    if (!Array.isArray(m.committee[comIdx].announcements)) m.committee[comIdx].announcements = [];
    m.committee[comIdx].announcements.push({ content: val });
    _scExpandRole('items', `_com_${role}`);
    await _scUpsertMeeting(m);
    _scRenderActive();
    const inpc = document.getElementById('scQuickInput');
    if (inpc) { inpc.value = ''; inpc.focus(); }
    return;
  }
  if (type === 'announce') {
    (m.announcements = m.announcements || []).push({ role, content: val });
  } else if (type === 'topics') {
    (m.topics = m.topics || []).push({ role, title: val, content: '', decision: '' });
  } else if (type === 'actions') {
    (m.actions = m.actions || []).push({ owner: role, text: val, due: '', status: 'pending' });
  }
  _scExpandRole('items', role);
  await _scUpsertMeeting(m);
  _scRenderActive();
  // 重新渲染後把焦點移回輸入框，方便連續輸入
  const inp2 = document.getElementById('scQuickInput');
  if (inp2) { inp2.value = ''; inp2.focus(); }
}

// 摘要列展開/收合：點摘要列 → 切換下方編輯框；收合時把編輯內容寫回摘要文字
function _scToggleItem(barEl) {
  const item = barEl.closest('.sc-item');
  if (!item) return;
  const willCollapse = !item.classList.contains('is-collapsed');
  item.classList.toggle('is-collapsed');
  if (willCollapse) {
    const src = item.querySelector('[data-summary-src]');
    const txt = item.querySelector('.sc-item-text');
    if (src && txt) {
      const v = (src.value || '').trim();
      txt.textContent = v || (txt.dataset.empty || '(空白)');
    }
  }
}

// 單筆摘要列：布達
function _scUnifiedAnnounceItem(mid, a, idx, displayIdx, canEdit) {
  const summary = (a.content || '').trim() || '(空白布達)';
  return `<div class="sc-item is-collapsed" data-aidx="${idx}">
    <div class="sc-item-bar" onclick="_scToggleItem(this)">
      ${canEdit ? `<span class="sc-drag-handle" onclick="event.stopPropagation()" title="拖曳排序">⠿</span>` : ''}
      <span class="sc-item-chev">▸</span>
      <span class="sc-item-no">${displayIdx + 1}</span>
      <span class="sc-item-text" data-empty="(空白布達)">${_scEsc(summary)}</span>
      ${canEdit ? `<button class="sc-icon-btn sc-item-del" onclick="event.stopPropagation();_scDelAnnouncement('${mid}',${idx})" title="刪除">×</button>` : ''}
    </div>
    <div class="sc-item-edit">
      <textarea class="sc-textarea" data-summary-src rows="2" placeholder="布達內容（資訊共識，無須討論）" oninput="_scUpdateAnnouncement('${mid}',${idx},'content',this.value)">${_scEsc(a.content || '')}</textarea>
    </div>
  </div>`;
}

// 單筆摘要列：議題（有決議時顯示「已決議」標記）
function _scUnifiedTopicItem(mid, t, idx, displayIdx, canEdit) {
  const summary = (t.title || '').trim() || '(未填標題)';
  const decided = (t.decision || '').trim();
  return `<div class="sc-item is-collapsed" data-tidx="${idx}">
    <div class="sc-item-bar" onclick="_scToggleItem(this)">
      ${canEdit ? `<span class="sc-drag-handle" onclick="event.stopPropagation()" title="拖曳排序">⠿</span>` : ''}
      <span class="sc-item-chev">▸</span>
      <span class="sc-item-no">${displayIdx + 1}</span>
      <span class="sc-item-text" data-empty="(未填標題)">${_scEsc(summary)}</span>
      ${decided ? `<span class="sc-item-badge sc-item-badge-ok">已決議</span>` : ''}
      ${canEdit ? `<button class="sc-icon-btn sc-item-del" onclick="event.stopPropagation();_scDelTopic('${mid}',${idx})" title="刪除">×</button>` : ''}
    </div>
    <div class="sc-item-edit">
      <input type="text" class="sc-input" data-summary-src placeholder="議題標題" value="${_scEsc(t.title || '')}" oninput="_scUpdateTopic('${mid}',${idx},'title',this.value)">
      <textarea class="sc-textarea" rows="2" placeholder="討論內容" oninput="_scUpdateTopic('${mid}',${idx},'content',this.value)">${_scEsc(t.content || '')}</textarea>
      <textarea class="sc-textarea sc-textarea-decision" rows="2" placeholder="決議" oninput="_scUpdateTopic('${mid}',${idx},'decision',this.value)">${_scEsc(t.decision || '')}</textarea>
    </div>
  </div>`;
}

// 單筆摘要列：待辦（摘要顯示期限 + 狀態）
function _scUnifiedActionItem(m, a, idx, canEdit) {
  const mid = m.id;
  const status = a.status || 'pending';
  const summary = (a.text || '').trim() || '(未填待辦)';
  const metaBits = [];
  if (a.due) metaBits.push(`<span class="sc-item-due">${_scEsc(a.due)}</span>`);
  metaBits.push(`<span class="sc-status-dot sc-status-${status}"></span>${_SC_STATUS_LABELS[status]}`);
  return `<div class="sc-item is-collapsed" data-aidx="${idx}">
    <div class="sc-item-bar" onclick="_scToggleItem(this)">
      ${canEdit ? `<span class="sc-drag-handle" onclick="event.stopPropagation()" title="拖曳排序">⠿</span>` : ''}
      <span class="sc-item-chev">▸</span>
      <span class="sc-item-text" data-empty="(未填待辦)">${_scEsc(summary)}</span>
      <span class="sc-item-meta">${metaBits.join(' ')}</span>
      ${canEdit ? `<button class="sc-icon-btn sc-item-del" onclick="event.stopPropagation();_scDelAction('${mid}',${idx})" title="刪除">×</button>` : ''}
    </div>
    <div class="sc-item-edit">
      <input type="text" class="sc-input" data-summary-src placeholder="待辦內容" value="${_scEsc(a.text || '')}" oninput="_scUpdateAction('${mid}',${idx},'text',this.value)">
      <div class="sc-action-meta">
        <input type="date" class="sc-input sc-input-sm" value="${_scDueToInput(a.due, (m.meetingDate || '').slice(0, 4))}" onchange="_scUpdateActionDate('${mid}',${idx},'due',this.value)">
        <select class="sc-select sc-input-sm sc-status sc-status-${status}" onchange="_scUpdateAction('${mid}',${idx},'status',this.value)">
          ${_SC_STATUS_ORDER.map(k => `<option value="${k}" ${status === k ? 'selected' : ''}>${_SC_STATUS_LABELS[k]}</option>`).join('')}
        </select>
      </div>
    </div>
  </div>`;
}

// ===== 上週未結案（延續追蹤）=====
// 取上一場會議中尚未結案（待處理 / 延期）的待辦
function _scCarryOverActions() {
  const last = _scLastMeeting();
  if (!last) return { last: null, items: [] };
  const items = (last.actions || [])
    .map((a, idx) => ({ a, idx }))
    .filter(({ a }) => {
      const s = a.status || 'pending';
      return s === 'pending' || s === 'delay';
    });
  return { last, items };
}

// 本週會議頂部的「上週未結案」提醒區（可直接更新狀態，標完成/取消後消失）
function _scCarryOverHtml(canEdit) {
  const { last, items } = _scCarryOverActions();
  if (!last || !items.length) return '';
  const rows = items.map(({ a, idx }) => {
    const status = a.status || 'pending';
    const owner = a.owner ? `<span class="sc-carry-owner">${_scEsc(a.owner)}</span>` : '';
    const due = a.due ? `<span class="sc-item-due">${_scEsc(a.due)}</span>` : '';
    const statusCtl = canEdit
      ? `<select class="sc-select sc-input-sm sc-status sc-status-${status}" onchange="_scUpdateCarryStatus('${last.id}',${idx},this.value)">
           ${_SC_STATUS_ORDER.map(k => `<option value="${k}" ${status === k ? 'selected' : ''}>${_SC_STATUS_LABELS[k]}</option>`).join('')}
         </select>`
      : `<span class="sc-status-dot sc-status-${status}"></span>${_SC_STATUS_LABELS[status]}`;
    const reasonCtl = canEdit
      ? `<input type="text" class="sc-input sc-input-sm sc-carry-reason" placeholder="原因／說明（為何尚未結案）" value="${_scEsc(a.carryReason || '')}" oninput="_scUpdateCarryReason('${last.id}',${idx},this.value)">`
      : (a.carryReason ? `<div class="sc-carry-reason-text">原因：${_scEsc(a.carryReason)}</div>` : '');
    return `<div class="sc-carry-row">
      <div class="sc-carry-main">${owner}<span class="sc-carry-text">${_scEsc(a.text || '(未填待辦)')}</span></div>
      <div class="sc-carry-meta">${due}${statusCtl}</div>
      ${reasonCtl}
    </div>`;
  }).join('');
  const collapsed = _scState.carryCollapsed === true;
  return `<section class="sc-docsec sc-carry${collapsed ? ' is-collapsed' : ''}">
    <div class="sc-docsec-head sc-carry-head" onclick="_scToggleCarry()">
      <span class="sc-docsec-bar sc-carry-bar"></span>
      <span class="sc-docsec-name">${_scMod().id === 'leadership' ? '上次未結案' : '上週未結案'}</span>
      <span class="sc-carry-from">${_scEsc(last.meetingDate || '')}</span>
      <span class="sc-carry-count">${items.length}</span>
      <span class="sc-card-chevron">▾</span>
    </div>
    <div class="sc-carry-body">${rows}</div>
  </section>`;
}

function _scToggleCarry() {
  _scState.carryCollapsed = !_scState.carryCollapsed;
  const sec = document.querySelector(`#${_scMod().contentEl} .sc-carry`);
  if (sec) sec.classList.toggle('is-collapsed', _scState.carryCollapsed);
}

// 本周為上週未結案項目填寫原因／說明（存在上週該待辦上，debounced 不重渲染避免失焦）
function _scUpdateCarryReason(lastId, idx, val) {
  const last = _scFindMeeting(lastId);
  if (!last || !last.actions || !last.actions[idx]) return;
  last.actions[idx].carryReason = val;
  _scDebouncedSave(last);
}

function _scUpdateCarryStatus(lastId, idx, val) {
  const last = _scFindMeeting(lastId);
  if (!last || !last.actions || !last.actions[idx]) return;
  last.actions[idx].status = val;
  _scUpsertMeeting(last).then(() => _scRenderActive());
}

// 職掌混合卡：一張卡內依「布達 / 議題 / 待辦」分區呈現該職掌的所有事項
// 領導月會：副主席後插入委員卡片、所有職掌卡下方加臨時動議區塊
function _scUnifiedItemsHtml(m, canEdit) {
  const mod = _scMod();
  const roles = mod.owners || [];
  const out = [];
  roles.forEach(role => {
    out.push(_scUnifiedRoleCardHtml(m, role, canEdit));
    if (mod.hasReports === true && role === '副主席') {
      out.push(_scUnifiedCommitteeCardsHtml(m, canEdit));
    }
  });
  // 對不到任何職掌/委員的待辦（owner 為空或委員已刪除）→ 收進「未指派」卡，避免被隱藏
  const committeeNames = (Array.isArray(m.committee) ? m.committee : [])
    .map(c => (c.name || '').trim()).filter(Boolean);
  const shownOwners = new Set([...roles, ...committeeNames]);
  const leftover = (m.actions || []).map((a, idx) => ({ a, idx })).filter(({ a }) => !shownOwners.has(a.owner));
  if (leftover.length) out.push(_scUnifiedUnassignedCardHtml(m, leftover, canEdit));
  if (mod.hasMotions === true) out.push(_scUnifiedMotionsHtml(m, canEdit));
  return out.join('');
}

// 未指派待辦卡（單頁式）：收容對不到職掌/委員的待辦
function _scUnifiedUnassignedCardHtml(m, items, canEdit) {
  const collapsed = _scIsRoleCollapsed('items', '_unassigned', items.length);
  const actInner = items.map(({ a, idx }) => _scUnifiedActionItem(m, a, idx, canEdit)).join('');
  return `<section class="sc-docsec sc-card-role${collapsed ? ' is-collapsed' : ''}" id="sc-role-card-items-_unassigned" data-sec="items" data-role-key="_unassigned">
    <div class="sc-docsec-head sc-card-head-toggle" onclick="_scToggleRoleCollapsed('items','_unassigned',event)">
      <span class="sc-docsec-bar"></span>
      <span class="sc-docsec-name"><span class="sc-role-tag sc-role-tag-muted">未指派</span>待辦</span>
      <span class="sc-card-chevron">▾</span>
    </div>
    <div class="sc-card-body${collapsed ? ' is-collapsed' : ''}">
      <div class="sc-type sc-type-action"><div class="sc-item-list">${actInner}</div></div>
    </div>
  </section>`;
}

// 委員卡片（領導月會）：每位委員一張卡，布達來自 committee[i].announcements、
// 待辦來自 actions(owner==委員姓名)；卡頭可命名/刪除，最後附「新增委員」
function _scUnifiedCommitteeCardsHtml(m, canEdit) {
  const committee = Array.isArray(m.committee) ? m.committee : [];
  const cards = committee.map((c, ci) => {
    const name = (c.name || '').trim();
    const anns = Array.isArray(c.announcements) ? c.announcements : [];
    const acts = name ? _scActionsForRole(m, name) : [];
    const total = anns.length + acts.length;
    const collapseKey = name ? `_com_${name}` : `_com_idx_${ci}`;
    const jsKey = String(collapseKey).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const collapsed = _scIsRoleCollapsed('items', collapseKey, total);

    const annInner = anns.map((a, di) => _scUnifiedCommitteeAnnounceItem(m.id, ci, a, di, canEdit)).join('');
    const actInner = acts.map(({ a, idx }) => _scUnifiedActionItem(m, a, idx, canEdit)).join('');
    const annList = anns.length
      ? `<div class="sc-type sc-type-announce">
           <div class="sc-type-label"><span class="sc-type-name">布達</span><span class="sc-type-rule"></span></div>
           <div class="sc-item-list"${canEdit && anns.length > 1 ? ` data-sc-sortable data-sc-type="announce" data-sc-committee="${ci}" data-sc-mid="${m.id}"` : ''}>${annInner}</div>
         </div>` : '';
    const actList = acts.length
      ? `<div class="sc-type sc-type-action">
           <div class="sc-type-label"><span class="sc-type-name">待辦</span><span class="sc-type-rule"></span></div>
           <div class="sc-item-list"${canEdit && acts.length > 1 ? ` data-sc-sortable data-sc-type="action" data-sc-role="${_scEsc(name)}" data-sc-mid="${m.id}"` : ''}>${actInner}</div>
         </div>` : '';

    return `<section class="sc-docsec sc-card-role${collapsed ? ' is-collapsed' : ''}" id="sc-role-card-items-${_scRoleSlug(collapseKey)}" data-sec="items" data-role-key="${_scEsc(collapseKey)}">
      <div class="sc-docsec-head sc-card-head-toggle" onclick="_scToggleRoleCollapsed('items','${jsKey}',event)">
        <span class="sc-docsec-bar"></span>
        <span class="sc-docsec-name" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="sc-role-tag">委員</span>
          <input type="text" class="sc-input sc-input-sm" placeholder="委員姓名" value="${_scEsc(c.name || '')}" oninput="_scUpdateCommittee('${m.id}',${ci},'name',this.value)" onclick="event.stopPropagation();" style="width:auto;min-width:110px;">
          ${canEdit ? `<button class="sc-icon-btn" onclick="event.stopPropagation();_scDelCommittee('${m.id}',${ci})" title="刪除委員">×</button>` : ''}
        </span>
        ${total ? '' : `<span class="sc-docsec-empty">尚無事項</span>`}
        <span class="sc-card-chevron">▾</span>
      </div>
      <div class="sc-card-body${collapsed ? ' is-collapsed' : ''}">
        ${annList}${actList}
      </div>
    </section>`;
  }).join('');
  const addBtn = canEdit
    ? `<div class="sc-committee-add"><button class="sc-btn sc-btn-sm sc-btn-ghost" onclick="_scAddCommittee('${m.id}')">+ 新增委員</button></div>`
    : '';
  return cards + addBtn;
}

// 委員布達單筆摘要列（資料在 committee[ci].announcements）
function _scUnifiedCommitteeAnnounceItem(mid, ci, a, displayIdx, canEdit) {
  const summary = (a.content || '').trim() || '(空白布達)';
  return `<div class="sc-item is-collapsed" data-aidx="${displayIdx}">
    <div class="sc-item-bar" onclick="_scToggleItem(this)">
      ${canEdit ? `<span class="sc-drag-handle" onclick="event.stopPropagation()" title="拖曳排序">⠿</span>` : ''}
      <span class="sc-item-chev">▸</span>
      <span class="sc-item-no">${displayIdx + 1}</span>
      <span class="sc-item-text" data-empty="(空白布達)">${_scEsc(summary)}</span>
      ${canEdit ? `<button class="sc-icon-btn sc-item-del" onclick="event.stopPropagation();_scDelCommitteeAnnouncement('${mid}',${ci},${displayIdx})" title="刪除">×</button>` : ''}
    </div>
    <div class="sc-item-edit">
      <textarea class="sc-textarea" data-summary-src rows="2" placeholder="布達內容（資訊共識，無須討論）" oninput="_scUpdateCommitteeAnnouncement('${mid}',${ci},${displayIdx},this.value)">${_scEsc(a.content || '')}</textarea>
    </div>
  </div>`;
}

// 臨時動議區塊（領導月會）：所有職掌卡下方的獨立區塊
function _scUnifiedMotionsHtml(m, canEdit) {
  const motions = Array.isArray(m.motions) ? m.motions : [];
  const collapsed = _scIsRoleCollapsed('items', '_motions', motions.length);
  const inner = motions.map((mo, i) => _scUnifiedMotionItem(m.id, mo, i, canEdit)).join('');
  const list = motions.length
    ? `<div class="sc-type sc-type-topic">
         <div class="sc-item-list"${canEdit && motions.length > 1 ? ` data-sc-sortable data-sc-type="motion" data-sc-mid="${m.id}"` : ''}>${inner}</div>
       </div>`
    : '';
  return `<section class="sc-docsec sc-card-role${collapsed ? ' is-collapsed' : ''}" id="sc-role-card-items-_motions" data-sec="items" data-role-key="_motions">
    <div class="sc-docsec-head sc-card-head-toggle" onclick="_scToggleRoleCollapsed('items','_motions',event)">
      <span class="sc-docsec-bar"></span>
      <span class="sc-docsec-name">臨時動議</span>
      ${canEdit ? `<button class="sc-btn sc-btn-sm" onclick="event.stopPropagation();_scAddMotion('${m.id}')">+ 新增動議</button>` : ''}
      ${motions.length ? '' : `<span class="sc-docsec-empty">本次無動議</span>`}
      <span class="sc-card-chevron">▾</span>
    </div>
    <div class="sc-card-body${collapsed ? ' is-collapsed' : ''}">
      ${list}
    </div>
  </section>`;
}

// 動議單筆摘要列：標題（摘要）+ 決議
function _scUnifiedMotionItem(mid, mo, idx, canEdit) {
  const summary = (mo.title || '').trim() || '(未填動議)';
  const decided = (mo.decision || '').trim();
  return `<div class="sc-item is-collapsed" data-midx="${idx}">
    <div class="sc-item-bar" onclick="_scToggleItem(this)">
      ${canEdit ? `<span class="sc-drag-handle" onclick="event.stopPropagation()" title="拖曳排序">⠿</span>` : ''}
      <span class="sc-item-chev">▸</span>
      <span class="sc-item-no">${idx + 1}</span>
      <span class="sc-item-text" data-empty="(未填動議)">${_scEsc(summary)}</span>
      ${decided ? `<span class="sc-item-badge sc-item-badge-ok">已決議</span>` : ''}
      ${canEdit ? `<button class="sc-icon-btn sc-item-del" onclick="event.stopPropagation();_scDelMotion('${mid}',${idx})" title="刪除">×</button>` : ''}
    </div>
    <div class="sc-item-edit">
      <input type="text" class="sc-input" data-summary-src placeholder="動議內容" value="${_scEsc(mo.title || '')}" oninput="_scUpdateMotion('${mid}',${idx},'title',this.value)">
      <textarea class="sc-textarea sc-textarea-decision" rows="2" placeholder="決議" oninput="_scUpdateMotion('${mid}',${idx},'decision',this.value)">${_scEsc(mo.decision || '')}</textarea>
    </div>
  </div>`;
}

function _scUnifiedRoleCardHtml(m, role, canEdit) {
  const anns = _scAnnouncementsForRole(m, role);
  const tops = _scTopicsForRole(m, role);
  const acts = _scActionsForRole(m, role);
  const total = anns.length + tops.length + acts.length;
  const collapsed = _scIsRoleCollapsed('items', role, total);

  const roleAttr = _scEsc(role);
  const typeBlock = (label, cls, items, inner) => items.length
    ? `<div class="sc-type sc-type-${cls}">
         <div class="sc-type-label"><span class="sc-type-name">${label}</span><span class="sc-type-rule"></span></div>
         <div class="sc-item-list"${canEdit && items.length > 1 ? ` data-sc-sortable data-sc-type="${cls}" data-sc-role="${roleAttr}" data-sc-mid="${m.id}"` : ''}>${inner}</div>
       </div>`
    : '';

  const annInner = anns.map(({ a, idx }, di) => _scUnifiedAnnounceItem(m.id, a, idx, di, canEdit)).join('');
  const topInner = tops.map(({ t, idx }, di) => _scUnifiedTopicItem(m.id, t, idx, di, canEdit)).join('');
  const actInner = acts.map(({ a, idx }) => _scUnifiedActionItem(m, a, idx, canEdit)).join('');

  const body = total
    ? typeBlock('布達', 'announce', anns, annInner)
      + typeBlock('議題', 'topic', tops, topInner)
      + typeBlock('待辦', 'action', acts, actInner)
    : '';

  return `<section class="sc-docsec sc-card-role${collapsed ? ' is-collapsed' : ''}" id="sc-role-card-items-${_scRoleSlug(role)}" data-sec="items" data-role-key="${role}">
    <div class="sc-docsec-head sc-card-head-toggle" onclick="_scToggleRoleCollapsed('items','${role}',event)">
      <span class="sc-docsec-bar"></span>
      <span class="sc-docsec-name">${_scEsc(role)}</span>
      ${total ? '' : `<span class="sc-docsec-empty">尚無事項</span>`}
      <span class="sc-card-chevron">▾</span>
    </div>
    <div class="sc-card-body${collapsed ? ' is-collapsed' : ''}">
      ${body}
    </div>
  </section>`;
}

// 統一事項頁：拖拉排序（每個「職掌＋類型」清單各自可重排，長按 200ms 觸發）
async function _scInitUnifiedSortable() {
  try { await _scLoadScript('https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js'); }
  catch { return; }
  if (!window.Sortable) return;
  const container = document.getElementById(_scMod().contentEl);
  if (!container) return;
  container.querySelectorAll('.sc-item-list[data-sc-sortable]').forEach(list => {
    if (list._scSortable) { try { list._scSortable.destroy(); } catch {} }
    list._scSortable = Sortable.create(list, {
      animation: 160,
      handle: '.sc-drag-handle',
      delay: 200,
      delayOnTouchOnly: true,
      touchStartThreshold: 5,
      // iOS Safari 對 HTML5 drag API 支援差 → 走 Sortable 內建觸控/滑鼠實作
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 4,
      ghostClass: 'sc-item-ghost',
      chosenClass: 'sc-item-chosen',
      dragClass: 'sc-item-drag',
      onEnd: (evt) => {
        const o = evt.oldIndex, n = evt.newIndex;
        if (o == null || n == null || o === n) return;
        const ds = list.dataset;
        const com = ds.scCommittee != null ? parseInt(ds.scCommittee, 10) : null;
        _scReorderUnified(ds.scMid, ds.scType, ds.scRole, o, n, com);
      }
    });
  });
}

// 重排：只動「同一職掌、同一類型」的子集，其他職掌的位置保持不變
function _scReorderUnified(mid, type, role, oldIdx, newIdx, committeeIdx) {
  const m = _scFindMeeting(mid);
  if (!m) return;
  // 委員布達：重排該委員的 announcements
  if (type === 'announce' && committeeIdx != null) {
    const c = (m.committee || [])[committeeIdx];
    if (!c || !Array.isArray(c.announcements)) return;
    const arr = c.announcements;
    if (oldIdx < 0 || newIdx < 0 || oldIdx >= arr.length || newIdx >= arr.length) return;
    const [moved] = arr.splice(oldIdx, 1);
    arr.splice(newIdx, 0, moved);
    _scUpsertMeeting(m).then(() => _scRenderActive());
    return;
  }
  // 臨時動議：整個 m.motions 陣列重排
  if (type === 'motion') {
    const arr = m.motions;
    if (!Array.isArray(arr) || oldIdx < 0 || newIdx < 0 || oldIdx >= arr.length || newIdx >= arr.length) return;
    const [moved] = arr.splice(oldIdx, 1);
    arr.splice(newIdx, 0, moved);
    _scUpsertMeeting(m).then(() => _scRenderActive());
    return;
  }
  let arr, roleOf;
  if (type === 'announce')    { arr = m.announcements; roleOf = it => (it.role  || '主席'); }
  else if (type === 'topic')  { arr = m.topics;        roleOf = it => (it.role  || '主席'); }
  else if (type === 'action') { arr = m.actions;       roleOf = it => (it.owner || ''); }
  else return;
  if (!Array.isArray(arr)) return;
  // 蒐集屬於此職掌的原始索引（依目前陣列順序）
  const idxs = [];
  arr.forEach((it, i) => { if (roleOf(it) === role) idxs.push(i); });
  if (oldIdx < 0 || newIdx < 0 || oldIdx >= idxs.length || newIdx >= idxs.length) return;
  // 取出子集 → 依新順序重排 → 寫回原本占用的位置
  const elems = idxs.map(i => arr[i]);
  const [moved] = elems.splice(oldIdx, 1);
  elems.splice(newIdx, 0, moved);
  idxs.forEach((origIdx, k) => { arr[origIdx] = elems[k]; });
  _scUpsertMeeting(m).then(() => _scRenderActive());
}

function _scMotionCardHtml(mid, mo, idx, canEdit) {
  return `
    <div class="sc-topic" data-midx="${idx}">
      <div class="sc-topic-head">
        <span class="sc-topic-num">動議 ${idx + 1}</span>
        ${canEdit ? `<button class="sc-icon-btn" onclick="_scDelMotion('${mid}',${idx})" title="刪除">×</button>` : ''}
      </div>
      <input type="text" class="sc-input" placeholder="動議內容" value="${_scEsc(mo.title || '')}" oninput="_scUpdateMotion('${mid}',${idx},'title',this.value)">
      <textarea class="sc-textarea sc-textarea-decision" rows="2" placeholder="決議" oninput="_scUpdateMotion('${mid}',${idx},'decision',this.value)">${_scEsc(mo.decision || '')}</textarea>
    </div>
  `;
}

function _scActionRowHtml(m, a, idx, canEdit, isTrack) {
  const mid = m.id;
  const status = a.status || 'pending';
  const mod = _scMod();
  const hideOwner = mod.groupActionsByRole === true;
  const ownersList = _scComputedOwners(m);
  return `
    <div class="sc-action${hideOwner ? ' sc-action-no-owner' : ''}" data-aidx="${idx}">
      <div class="sc-action-main">
        <input type="text" class="sc-input sc-input-flex" placeholder="待辦內容" value="${_scEsc(a.text || '')}" oninput="_scUpdateAction('${mid}',${idx},'text',this.value)">
        ${canEdit ? `<button class="sc-icon-btn" onclick="_scDelAction('${mid}',${idx})" title="刪除">×</button>` : ''}
      </div>
      <div class="sc-action-meta">
        ${hideOwner ? '' : `<select class="sc-select sc-input-sm" onchange="_scUpdateAction('${mid}',${idx},'owner',this.value)">
          <option value="" ${!a.owner ? 'selected' : ''}>選負責人</option>
          ${ownersList.map(o => `<option value="${o}" ${a.owner === o ? 'selected' : ''}>${o}</option>`).join('')}
        </select>`}
        <input type="date" class="sc-input sc-input-sm" value="${_scDueToInput(a.due, (m.meetingDate||'').slice(0,4))}" onchange="_scUpdateActionDate('${mid}',${idx},'due',this.value)">
        <select class="sc-select sc-input-sm sc-status sc-status-${status}" onchange="_scUpdateAction('${mid}',${idx},'status',this.value)">
          ${_SC_STATUS_ORDER.map(k => `<option value="${k}" ${status === k ? 'selected' : ''}>${_SC_STATUS_LABELS[k]}</option>`).join('')}
        </select>
      </div>
      ${isTrack ? `<input type="text" class="sc-input sc-input-note" placeholder="追蹤備註（執行進度／結果）" value="${_scEsc(a.trackNote || '')}" oninput="_scUpdateAction('${mid}',${idx},'trackNote',this.value)">` : ''}
    </div>
  `;
}

function _scReportsSectionHtml(m, canEdit) {
  const mod = _scMod();
  if (!mod.hasReports) return '';
  const roles = mod.reportRoles || mod.owners || [];
  const reports = m.reports || {};
  const committee = Array.isArray(m.committee) ? m.committee : [];

  const filledRoles = roles.filter(r => (reports[r] || '').trim()).length;
  const filledCom = committee.filter(c => (c.report || '').trim() && (c.name || '').trim()).length;

  // 在「副主席」之後插入委員群組
  const out = [];
  roles.forEach(role => {
    out.push(`
      <div class="sc-report-row">
        <div class="sc-report-role">${role}</div>
        <textarea class="sc-textarea sc-report-text" rows="2" placeholder="無報告事項" oninput="_scUpdateReport('${m.id}','${role}',this.value)">${_scEsc(reports[role] || '')}</textarea>
      </div>
    `);
    if (role === '副主席') out.push(_scCommitteeBlockHtml(m, canEdit));
  });

  return `
    <div class="sc-card">
      <div class="sc-card-head">
        <span class="sc-card-title">各領導人報告事項</span>
        <span class="sc-badge sc-badge-soft">${filledRoles + filledCom}/${roles.length + committee.length} 已填</span>
      </div>
      ${out.join('')}
    </div>
  `;
}

function _scCommitteeBlockHtml(m, canEdit) {
  const committee = Array.isArray(m.committee) ? m.committee : [];
  const rows = committee.map((c, i) => `
    <div class="sc-report-row sc-committee-row" data-cidx="${i}">
      <div class="sc-committee-name-wrap">
        <input type="text" class="sc-input sc-input-sm sc-committee-name" placeholder="委員姓名" value="${_scEsc(c.name || '')}" oninput="_scUpdateCommittee('${m.id}',${i},'name',this.value)">
        ${canEdit ? `<button class="sc-icon-btn" onclick="_scDelCommittee('${m.id}',${i})" title="刪除">×</button>` : ''}
      </div>
      <textarea class="sc-textarea sc-report-text" rows="2" placeholder="無報告事項" oninput="_scUpdateCommittee('${m.id}',${i},'report',this.value)">${_scEsc(c.report || '')}</textarea>
    </div>
  `).join('');
  return `
    <div class="sc-committee-group">
      <div class="sc-committee-head">
        <span class="sc-committee-label">委員</span>
        ${canEdit ? `<button class="sc-btn sc-btn-sm sc-btn-ghost" onclick="_scAddCommittee('${m.id}')">+ 新增委員</button>` : ''}
      </div>
      ${rows}
    </div>
  `;
}

// ===== 編輯動作 =====
function _scUpdateReport(mid, role, val) {
  const m = _scFindMeeting(mid);
  if (!m) return;
  m.reports = m.reports || {};
  m.reports[role] = val;
  _scDebouncedSave(m);
  // 更新已填徽章
  const mod = _scMod();
  const roles = mod.reportRoles || mod.owners || [];
  const filled = roles.filter(r => (m.reports[r] || '').trim()).length;
  document.querySelectorAll('.sc-card-head .sc-badge-soft').forEach(el => {
    if (el.textContent.includes('已填')) el.textContent = `${filled}/${roles.length} 已填`;
  });
}

function _scUpdateField(mid, field, val) {
  const m = _scFindMeeting(mid);
  if (!m) return;
  m[field] = val;
  _scDebouncedSave(m);
}

// 日期欄位專用：將 <input type="date"> 的 yyyy-mm-dd 轉成 yyyy/mm/dd 後儲存
function _scUpdateDateField(mid, field, val) {
  const m = _scFindMeeting(mid);
  if (!m) return;
  m[field] = _scDateFromInput(val);
  _scDebouncedSave(m);
}

// 待辦期限：同樣轉成 yyyy/mm/dd（保留完整日期）
function _scUpdateActionDate(mid, idx, field, val) {
  const m = _scFindMeeting(mid);
  if (!m || !m.actions[idx]) return;
  m.actions[idx][field] = _scDateFromInput(val);
  _scDebouncedSave(m);
}

async function _scAddTopic(mid, role) {
  const m = _scFindMeeting(mid);
  if (!m) return;
  (m.topics = m.topics || []).push({ role: role || '主席', title: '', content: '', decision: '' });
  _scExpandRole('topics', role || '主席');
  await _scUpsertMeeting(m);
  _scRenderActive();
}

async function _scDelTopic(mid, idx) {
  if (!confirm('刪除這個議題？')) return;
  const m = _scFindMeeting(mid);
  if (!m) return;
  m.topics.splice(idx, 1);
  await _scUpsertMeeting(m);
  _scRenderActive();
}

function _scUpdateTopic(mid, idx, field, val) {
  const m = _scFindMeeting(mid);
  if (!m || !m.topics[idx]) return;
  m.topics[idx][field] = val;
  _scDebouncedSave(m);
}

async function _scAddCommittee(mid) {
  const m = _scFindMeeting(mid);
  if (!m) return;
  (m.committee = m.committee || []).push({ name: '', report: '' });
  await _scUpsertMeeting(m);
  _scRenderActive();
}

async function _scDelCommittee(mid, idx) {
  if (!confirm('刪除這位委員？')) return;
  const m = _scFindMeeting(mid);
  if (!m || !m.committee) return;
  m.committee.splice(idx, 1);
  await _scUpsertMeeting(m);
  _scRenderActive();
}

function _scUpdateCommittee(mid, idx, field, val) {
  const m = _scFindMeeting(mid);
  if (!m || !m.committee || !m.committee[idx]) return;
  m.committee[idx][field] = val;
  _scDebouncedSave(m);
  // 重新計算出席人員顯示
  if (field === 'name') {
    const disp = document.getElementById('scAttendeesDisplay');
    if (disp) disp.textContent = _scComputedAttendees(m);
  }
}

async function _scAddMotion(mid) {
  const m = _scFindMeeting(mid);
  if (!m) return;
  (m.motions = m.motions || []).push({ title: '', decision: '' });
  await _scUpsertMeeting(m);
  _scRenderActive();
}

async function _scDelMotion(mid, idx) {
  if (!confirm('刪除這個臨時動議？')) return;
  const m = _scFindMeeting(mid);
  if (!m) return;
  m.motions.splice(idx, 1);
  await _scUpsertMeeting(m);
  _scRenderActive();
}

function _scUpdateMotion(mid, idx, field, val) {
  const m = _scFindMeeting(mid);
  if (!m || !m.motions || !m.motions[idx]) return;
  m.motions[idx][field] = val;
  _scDebouncedSave(m);
}

async function _scAddAction(mid, owner) {
  const m = _scFindMeeting(mid);
  if (!m) return;
  (m.actions = m.actions || []).push({ text: '', owner: owner || '', due: '', status: 'pending' });
  if (owner) _scExpandRole('actions', owner);
  await _scUpsertMeeting(m);
  _scRenderActive();
}

async function _scDelAction(mid, idx) {
  if (!confirm('刪除這個待辦？')) return;
  const m = _scFindMeeting(mid);
  if (!m) return;
  m.actions.splice(idx, 1);
  await _scUpsertMeeting(m);
  _scRenderActive();
}

function _scUpdateAction(mid, idx, field, val) {
  const m = _scFindMeeting(mid);
  if (!m || !m.actions[idx]) return;
  m.actions[idx][field] = val;
  if (field === 'status') {
    _scUpsertMeeting(m);
    const sel = document.querySelector(`.sc-action[data-aidx="${idx}"] .sc-status`);
    if (sel) sel.className = `sc-select sc-input-sm sc-status sc-status-${val}`;
    // track 頁面同步更新完成度徽章
    if (_scState.view === 'track') {
      const total = m.actions.length;
      const done = m.actions.filter(x => x.status === 'done').length;
      const pct = total ? Math.round(done / total * 100) : 0;
      const badge = document.querySelector('.sc-badge-soft');
      const bar = document.querySelector('.sc-progress-fill');
      if (badge) badge.textContent = `${done}/${total} 完成 ${pct}%`;
      if (bar) bar.style.width = pct + '%';
    }
  } else if (field === 'owner' && _scMod().groupActionsByRole) {
    // 負責人改變 → 重新渲染讓待辦移到對應分組
    _scUpsertMeeting(m).then(() => _scRenderActive());
  } else {
    _scDebouncedSave(m);
  }
}

// ===== 上週追蹤 =====
function _scRenderTrack() {
  const m = _scLastMeeting();
  if (!m) {
    return `
      <div class="sc-card sc-empty">
        <div class="sc-empty-title">沒有上一場會議紀錄</div>
        <div class="sc-empty-desc">完成第一場本週會議後，下次就可以做追蹤</div>
      </div>
    `;
  }
  const mod = _scMod();
  const canEdit = _canEditTab('sanchang');
  const actions = m.actions || [];
  const total = actions.length;
  const done = actions.filter(a => a.status === 'done').length;
  const pct = total ? Math.round(done / total * 100) : 0;

  const trackBody = mod.groupActionsByRole
    ? (actions.length ? _scActionsEditorHtml(m, canEdit, true) : `<div class="sc-card"><div class="sc-empty-mini">上一場無待辦事項</div></div>`)
    : `<div class="sc-card">
        <div class="sc-card-head"><span class="sc-card-title">待辦追蹤</span></div>
        ${actions.length ? actions.map((a, i) => _scActionRowHtml(m, a, i, canEdit, true)).join('') : `<div class="sc-empty-mini">上一場無待辦事項</div>`}
      </div>`;

  return `
    <div class="sc-card">
      <div class="sc-card-head">
        <span class="sc-card-title">上次會議：${_scEsc(m.meetingDate)}</span>
        <span class="sc-badge sc-badge-soft">${done}/${total} 完成 ${pct}%</span>
      </div>
      <div class="sc-progress"><div class="sc-progress-fill" style="width:${pct}%"></div></div>
    </div>
    ${trackBody}
    <div class="sc-toolbar">
      <button class="sc-btn sc-btn-ghost" onclick="_scPreview('${m.id}')">預覽</button>
      ${mod.id === 'sanchang' ? '' : `<button class="sc-btn sc-btn-primary" onclick="_scCopyLineText('${m.id}')">複製文字</button>`}
    </div>
  `;
}

// ===== 歷史會議 =====
function _scRenderHistory() {
  const all = _scGetMeetings().slice().sort((a, b) =>
    (b.meetingDate || '').localeCompare(a.meetingDate || '')
  );
  if (_scState.histDetailId) {
    const m = _scFindMeeting(_scState.histDetailId);
    if (m) {
      return `
        <div class="sc-hist-back">
          <button class="sc-btn sc-btn-sm sc-btn-ghost" onclick="_scState.histDetailId=null;_scRenderActive();">← 返回列表</button>
        </div>
        ${_scRenderEditor(m)}
      `;
    }
  }
  if (!all.length) {
    return `<div class="sc-card sc-empty"><div class="sc-empty-title">尚無歷史紀錄</div><div class="sc-empty-desc">完成本週會議後會出現在這裡</div></div>`;
  }
  const rows = all.map(m => {
    const actions = m.actions || [];
    const done = actions.filter(a => a.status === 'done').length;
    return `
      <div class="sc-hist-row" onclick="_scOpenHist('${m.id}')">
        <div class="sc-hist-row-main">
          <div class="sc-hist-row-date">${_scEsc(m.meetingDate || '(未設日期)')}</div>
          <div class="sc-hist-row-sub">${(m.topics || []).length} 議題 ・ ${done}/${actions.length} 待辦完成</div>
        </div>
        <div class="sc-hist-row-arrow">›</div>
      </div>
    `;
  }).join('');
  return `<div class="sc-card sc-hist-list">${rows}</div>`;
}
function _scOpenHist(id) {
  _scState.histDetailId = id;
  _scRenderActive();
}

// ===== util =====
function _scEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ===== A4 預覽 sheet HTML =====
function _scBuildSheetHtml(m) {
  const mod = _scMod();

  const barHtml = `
    <div class="sc-sheet-bar">
      <div class="sc-sheet-bar-left">BNI 億展白金分會</div>
      <div class="sc-sheet-bar-right">${_scMod().title}紀錄</div>
    </div>
  `;
  // 第一頁的品牌 hero 區塊（取代原本的 bar + headline）
  const headlineHtml = `
    <div class="sc-sheet-hero">
      <div class="sc-sheet-hero-l">
        <div class="sc-sheet-hero-brand">BNI</div>
        <div class="sc-sheet-hero-org">億展白金分會</div>
        <div class="sc-sheet-hero-divider"></div>
        <div class="sc-sheet-hero-doctitle">${_scMod().title}紀錄</div>
        <div class="sc-sheet-hero-date">${_scEsc(m.meetingDate || '')}</div>
      </div>
      <div class="sc-sheet-hero-r">
        <div class="sc-sheet-hero-meta"><span class="sc-sheet-hero-key">出席</span><span class="sc-sheet-hero-val">${_scComputedAttendees(m)}</span></div>
        ${m.absent ? `<div class="sc-sheet-hero-meta"><span class="sc-sheet-hero-key">請假</span><span class="sc-sheet-hero-val">${_scEsc(m.absent)}</span></div>` : ''}
        <div class="sc-sheet-hero-meta"><span class="sc-sheet-hero-key">下次</span><span class="sc-sheet-hero-val">${_scEsc(m.nextMeeting || '未訂')}</span></div>
        <div class="sc-sheet-hero-meta"><span class="sc-sheet-hero-key">紀錄</span><span class="sc-sheet-hero-val">${_scEsc(CU || '')}</span></div>
        ${m.summary ? `<div class="sc-sheet-hero-meta sc-sheet-hero-meta-summary"><span class="sc-sheet-hero-key">摘要</span><span class="sc-sheet-hero-val">${_scEsc(m.summary).replace(/\n/g, '<br>')}</span></div>` : ''}
      </div>
    </div>
  `;
  const footHtml = '';

  // 兩個模組共用動態分頁 + hero header
  const blocks = mod.hasReports
    ? _scBuildLeadershipBlocks(m)
    : _scBuildSanchangBlocks(m);

  // ===== 量測高度 =====
  const measureEl = document.createElement('div');
  measureEl.className = 'sc-sheet-page';
  measureEl.style.cssText = 'position:fixed!important;left:-10000px!important;top:0!important;height:auto!important;box-shadow:none!important;visibility:hidden;';
  document.body.appendChild(measureEl);
  const measure = (html) => {
    const d = document.createElement('div');
    d.innerHTML = html;
    measureEl.appendChild(d);
    const h = d.offsetHeight;
    measureEl.removeChild(d);
    return h;
  };
  const headerH = measure(headlineHtml);
  const barH    = measure(barHtml);
  const footH   = measure(footHtml);
  blocks.forEach(b => { b.height = measure(b.html); });
  document.body.removeChild(measureEl);

  // ===== 分頁 =====
  const MM_PX = 96 / 25.4;
  // 內容區高度 = 297 - 14 上 - 15 下保留區（給頁碼 + 預留空白）
  const PAGE_INNER_PX = (297 - 14 - 15) * MM_PX;

  const pages = [];
  let cur = { blocks: [], used: headerH };
  for (const b of blocks) {
    const needBreak = (b.pageBreakBefore && cur.blocks.length > 0)
      || (cur.used + b.height > PAGE_INNER_PX && cur.blocks.length > 0);
    if (needBreak) {
      pages.push(cur);
      cur = { blocks: [], used: barH };
    }
    cur.blocks.push(b);
    cur.used += b.height;
  }
  pages.push(cur);

  // 頁尾若放不進最後一頁 → 新增空白頁
  const lastPage = pages[pages.length - 1];
  if (lastPage.used + footH > PAGE_INNER_PX) {
    pages.push({ blocks: [], used: barH });
  }

  // 處理 keepWithNext：避免區段標題 / 角色標題落單在頁尾
  for (let p = 0; p < pages.length - 1; p++) {
    const cp = pages[p];
    while (cp.blocks.length > 0) {
      const tail = cp.blocks[cp.blocks.length - 1];
      if (tail.keepWithNext) {
        cp.blocks.pop();
        cp.used -= tail.height;
        pages[p + 1].blocks.unshift(tail);
        pages[p + 1].used += tail.height;
      } else break;
    }
  }

  // 移除被 keepWithNext 搬空、或頁尾預留產生的空白頁（只剩頁首/頁碼的空殼）
  const renderPages = pages.filter(p => p.blocks.length > 0);

  // ===== 組裝最終 HTML =====
  return renderPages.map((page, idx) => {
    const isFirst = idx === 0;
    const isLast  = idx === renderPages.length - 1;
    const top = isFirst ? headlineHtml : barHtml;
    const bottom = isLast ? footHtml : '';
    const content = page.blocks.map(b => b.html).join('');
    const pageNo = renderPages.length > 1
      ? `<div class="sc-sheet-page-no">- ${idx + 1} / ${renderPages.length} -</div>`
      : '';
    return `<div class="sc-sheet-page" data-page="${idx + 1}">${top}${content}${bottom}${pageNo}</div>`;
  }).join('');
}

// 三長周會：產生扁平 block 清單（每個 block 可獨立配置到不同 A4 頁）
function _scBuildSanchangBlocks(m) {
  const mod = _scMod();
  const blocks = [];

  // 結論摘要已併入 headline 的「摘要」欄，此處不再重複輸出

  // === 本周布達事項（總是顯示）===
  if (mod.hasAnnouncements === true) {
    const hasAny = (mod.owners || []).some(r => _scAnnouncementsForRole(m, r).length);
    blocks.push({
      html: `<div class="sc-sheet-h2"><span class="sc-sheet-h2-bar"></span>本周布達事項</div>`,
      keepWithNext: true,
      pageBreakBefore: true
    });
    if (!hasAny) {
      blocks.push({ html: `<div class="sc-sheet-empty-block">本次無布達事項</div>` });
    } else {
      (mod.owners || []).forEach(role => {
        const items = _scAnnouncementsForRole(m, role);
        if (!items.length) return;
        blocks.push({
          html: `<div class="sc-sheet-role-h">${role}</div>`,
          keepWithNext: true
        });
        items.forEach(({ a }, i) => {
          blocks.push({
            html: `<div class="sc-sheet-announce-item">
              <span class="sc-sheet-announce-num">${i + 1}</span>
              <span class="sc-sheet-announce-text">${_scEsc(a.content || '').replace(/\n/g, '<br>')}</span>
            </div>`
          });
        });
      });
    }
  }

  // === 議題與決議（清爽表格） ===
  if (mod.hasTopics !== false) {
    const hasAny = (mod.owners || []).some(r => _scTopicsForRole(m, r).length);
    blocks.push({
      html: `<div class="sc-sheet-h2"><span class="sc-sheet-h2-bar"></span>議題與決議</div>`,
      keepWithNext: true,
      pageBreakBefore: true
    });
    if (!hasAny) {
      blocks.push({ html: `<div class="sc-sheet-empty-block">本次無議題</div>` });
    } else {
      const buildTopicsDocTable = (items) => `<table class="sc-doc-table">
        <colgroup>
          <col style="width:7mm"><col><col style="width:38%">
        </colgroup>
        <thead><tr>
          <th class="d-col-num">#</th>
          <th>議題 / 內容</th>
          <th>決議</th>
        </tr></thead>
        <tbody>
          ${items.map(({ t }, i) => `
            <tr>
              <td class="d-col-num">${i + 1}</td>
              <td>
                <div class="d-title">${_scEsc(t.title || '(未填標題)')}</div>
                ${t.content ? `<div class="d-desc">${_scEsc(t.content).replace(/\n/g, '<br>')}</div>` : ''}
              </td>
              <td>${t.decision ? _scEsc(t.decision).replace(/\n/g, '<br>') : '<span class="d-muted">—</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
      (mod.owners || []).forEach(role => {
        const items = _scTopicsForRole(m, role);
        if (!items.length) return;
        blocks.push({
          html: `<div class="sc-sheet-role-h">${role}</div>`,
          keepWithNext: true
        });
        blocks.push({ html: buildTopicsDocTable(items) });
      });
    }
  }

  // === 待辦事項追蹤（清爽表格） ===
  blocks.push({
    html: `<div class="sc-sheet-h2"><span class="sc-sheet-h2-bar"></span>待辦事項追蹤</div>`,
    keepWithNext: true,
    pageBreakBefore: true
  });
  const buildActionsDocTable = (items) => `<table class="sc-doc-table">
    <colgroup>
      <col style="width:7mm"><col><col style="width:22mm"><col style="width:22mm">
    </colgroup>
    <thead><tr>
      <th class="d-col-num">#</th>
      <th>待辦事項</th>
      <th class="d-col-end">期限</th>
      <th class="d-col-end">狀態</th>
    </tr></thead>
    <tbody>
      ${items.map((a, i) => `
        <tr>
          <td class="d-col-num">${i + 1}</td>
          <td>
            <div class="d-title">${_scEsc(a.text || '(未填內容)')}</div>
            ${a.trackNote ? `<div class="d-desc">追蹤：${_scEsc(a.trackNote).replace(/\n/g, '<br>')}</div>` : ''}
          </td>
          <td class="d-col-end">${a.due ? _scEsc(a.due) : '<span class="d-muted">—</span>'}</td>
          <td class="d-col-end"><span class="sc-sheet-status sc-sheet-status-${a.status || 'pending'}">${_SC_STATUS_LABELS[a.status || 'pending']}</span></td>
        </tr>
      `).join('')}
    </tbody>
  </table>`;

  let hasAnyAction = false;
  (mod.owners || []).forEach(role => {
    const items = _scActionsForRole(m, role).map(x => x.a);
    if (!items.length) return;
    hasAnyAction = true;
    blocks.push({
      html: `<div class="sc-sheet-role-h">${role}</div>`,
      keepWithNext: true
    });
    blocks.push({ html: buildActionsDocTable(items) });
  });
  const unassigned = _scActionsForRole(m, null).map(x => x.a);
  if (unassigned.length) {
    hasAnyAction = true;
    blocks.push({
      html: `<div class="sc-sheet-role-h sc-sheet-role-h-muted">未指派</div>`,
      keepWithNext: true
    });
    blocks.push({ html: buildActionsDocTable(unassigned) });
  }
  if (!hasAnyAction) {
    blocks.push({ html: `<div class="sc-sheet-empty-block">本次無待辦事項</div>` });
  }

  // === 上週未結案（僅本週會議的紀錄顯示）===
  if (m.weekKey === getWeekKey()) {
    const { last, items } = _scCarryOverActions();
    if (last && items.length) {
      blocks.push({
        // 不強制換頁：若與「待辦事項追蹤」放得下同一頁就接著排，放不下才換頁
        html: `<div class="sc-sheet-h2"><span class="sc-sheet-h2-bar"></span>上週未結案<span class="sc-sheet-h2-sub">（${_scEsc(last.meetingDate || '')}）</span></div>`,
        keepWithNext: true
      });
      const carryTable = `<table class="sc-doc-table">
        <colgroup>
          <col style="width:7mm"><col><col style="width:22mm"><col style="width:22mm"><col style="width:22mm">
        </colgroup>
        <thead><tr>
          <th class="d-col-num">#</th>
          <th>待辦事項</th>
          <th class="d-col-end">負責</th>
          <th class="d-col-end">期限</th>
          <th class="d-col-end">狀態</th>
        </tr></thead>
        <tbody>
          ${items.map(({ a }, i) => `
            <tr>
              <td class="d-col-num">${i + 1}</td>
              <td>
                <div class="d-title">${_scEsc(a.text || '(未填內容)')}</div>
                ${a.carryReason ? `<div class="d-desc">原因：${_scEsc(a.carryReason).replace(/\n/g, '<br>')}</div>` : ''}
              </td>
              <td class="d-col-end">${a.owner ? _scEsc(a.owner) : '<span class="d-muted">—</span>'}</td>
              <td class="d-col-end">${a.due ? _scEsc(a.due) : '<span class="d-muted">—</span>'}</td>
              <td class="d-col-end"><span class="sc-sheet-status sc-sheet-status-${a.status || 'pending'}">${_SC_STATUS_LABELS[a.status || 'pending']}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
      blocks.push({ html: carryTable });
    }
  }

  return blocks;
}

// 領導月會：把舊版的 reports + committee.report 資料遷移到 announcements 結構
function _scMigrateLeadershipReports(m) {
  if (m._leadershipReportsMigrated) return;
  if (!Array.isArray(m.announcements)) m.announcements = [];
  // m.reports[role] → m.announcements
  Object.entries(m.reports || {}).forEach(([role, text]) => {
    const t = (text || '').trim();
    if (!t) return;
    const exists = m.announcements.some(a => a.role === role && a.content === t);
    if (!exists) m.announcements.push({ role, content: t });
  });
  // m.committee[i].report → m.committee[i].announcements
  (m.committee || []).forEach(c => {
    if (!Array.isArray(c.announcements)) c.announcements = [];
    const t = (c.report || '').trim();
    if (!t) return;
    const exists = c.announcements.some(a => a.content === t);
    if (!exists) c.announcements.push({ content: t });
  });
  m._leadershipReportsMigrated = true;
}

// 領導月會：產生扁平 block 清單（與三長周會共用動態分頁）
function _scBuildLeadershipBlocks(m) {
  const mod = _scMod();
  _scMigrateLeadershipReports(m);
  const blocks = [];

  // === 本周布達事項（11 領導角色 + 委員，已合併原本的「報告」，總是顯示）===
  if (mod.hasAnnouncements === true) {
    const roles = mod.owners || [];
    const committee = (Array.isArray(m.committee) ? m.committee : [])
      .filter(c => (c.name || '').trim() && Array.isArray(c.announcements) && c.announcements.length);
    const fixedHasAny = roles.some(r => _scAnnouncementsForRole(m, r).length);
    const hasAny = fixedHasAny || committee.length > 0;

    blocks.push({
      html: `<div class="sc-sheet-h2"><span class="sc-sheet-h2-bar"></span>本周布達事項</div>`,
      keepWithNext: true,
      pageBreakBefore: true
    });
    if (!hasAny) {
      blocks.push({ html: `<div class="sc-sheet-empty-block">本次無布達事項</div>` });
    } else {
      roles.forEach(role => {
        const items = _scAnnouncementsForRole(m, role);
        if (items.length) {
          blocks.push({
            html: `<div class="sc-sheet-role-h">${role}</div>`,
            keepWithNext: true
          });
          items.forEach(({ a }, i) => {
            blocks.push({
              html: `<div class="sc-sheet-announce-item">
                <span class="sc-sheet-announce-num">${i + 1}</span>
                <span class="sc-sheet-announce-text">${_scEsc(a.content || '').replace(/\n/g, '<br>')}</span>
              </div>`
            });
          });
        }
        // 副主席之後：穿插委員的布達
        if (role === '副主席') {
          committee.forEach(c => {
            blocks.push({
              html: `<div class="sc-sheet-role-h">${_scEsc(c.name)}</div>`,
              keepWithNext: true
            });
            c.announcements.forEach((a, i) => {
              blocks.push({
                html: `<div class="sc-sheet-announce-item">
                  <span class="sc-sheet-announce-num">${i + 1}</span>
                  <span class="sc-sheet-announce-text">${_scEsc(a.content || '').replace(/\n/g, '<br>')}</span>
                </div>`
              });
            });
          });
        }
      });
    }
  }

  // === 待辦事項追蹤（領導月會：含「負責人」欄位，不分組）===
  blocks.push({
    html: `<div class="sc-sheet-h2"><span class="sc-sheet-h2-bar"></span>待辦事項追蹤</div>`,
    keepWithNext: true,
    pageBreakBefore: true
  });
  if ((m.actions || []).length) {
    const actsHtml = `<table class="sc-doc-table">
      <colgroup>
        <col style="width:7mm"><col><col style="width:24mm"><col style="width:22mm"><col style="width:22mm">
      </colgroup>
      <thead><tr>
        <th class="d-col-num">#</th>
        <th>待辦事項</th>
        <th class="d-col-end">負責人</th>
        <th class="d-col-end">期限</th>
        <th class="d-col-end">狀態</th>
      </tr></thead>
      <tbody>
        ${m.actions.map((a, i) => `
          <tr>
            <td class="d-col-num">${i + 1}</td>
            <td>
              <div class="d-title">${_scEsc(a.text || '(未填內容)')}</div>
              ${a.trackNote ? `<div class="d-desc">追蹤：${_scEsc(a.trackNote).replace(/\n/g, '<br>')}</div>` : ''}
            </td>
            <td class="d-col-end">${a.owner ? _scEsc(a.owner) : '<span class="d-muted">—</span>'}</td>
            <td class="d-col-end">${a.due ? _scEsc(a.due) : '<span class="d-muted">—</span>'}</td>
            <td class="d-col-end"><span class="sc-sheet-status sc-sheet-status-${a.status || 'pending'}">${_SC_STATUS_LABELS[a.status || 'pending']}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
    blocks.push({ html: actsHtml });
  } else {
    blocks.push({ html: `<div class="sc-sheet-empty-block">本次無待辦事項</div>` });
  }

  // === 臨時動議 ===
  if (mod.hasMotions === true) {
    blocks.push({
      html: `<div class="sc-sheet-h2"><span class="sc-sheet-h2-bar"></span>臨時動議</div>`,
      keepWithNext: true,
      pageBreakBefore: true
    });
    if ((m.motions || []).length) {
      const motionsHtml = `<table class="sc-doc-table">
        <colgroup>
          <col style="width:7mm"><col><col style="width:38%">
        </colgroup>
        <thead><tr>
          <th class="d-col-num">#</th>
          <th>動議內容</th>
          <th>決議</th>
        </tr></thead>
        <tbody>
          ${m.motions.map((mo, i) => `
            <tr>
              <td class="d-col-num">${i + 1}</td>
              <td><div class="d-title">${_scEsc(mo.title || '(未填內容)')}</div></td>
              <td>${mo.decision ? _scEsc(mo.decision).replace(/\n/g, '<br>') : '<span class="d-muted">—</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
      blocks.push({ html: motionsHtml });
    } else {
      blocks.push({ html: `<div class="sc-sheet-empty-block">本次無臨時動議</div>` });
    }
  }

  // === 上次未結案（僅當前週期的紀錄顯示）===
  if (m.weekKey === getWeekKey()) {
    const { last, items } = _scCarryOverActions();
    if (last && items.length) {
      blocks.push({
        html: `<div class="sc-sheet-h2"><span class="sc-sheet-h2-bar"></span>上次未結案<span class="sc-sheet-h2-sub">（${_scEsc(last.meetingDate || '')}）</span></div>`,
        keepWithNext: true
      });
      const carryTable = `<table class="sc-doc-table">
        <colgroup>
          <col style="width:7mm"><col><col style="width:22mm"><col style="width:22mm"><col style="width:22mm">
        </colgroup>
        <thead><tr>
          <th class="d-col-num">#</th>
          <th>待辦事項</th>
          <th class="d-col-end">負責</th>
          <th class="d-col-end">期限</th>
          <th class="d-col-end">狀態</th>
        </tr></thead>
        <tbody>
          ${items.map(({ a }, i) => `
            <tr>
              <td class="d-col-num">${i + 1}</td>
              <td>
                <div class="d-title">${_scEsc(a.text || '(未填內容)')}</div>
                ${a.carryReason ? `<div class="d-desc">原因：${_scEsc(a.carryReason).replace(/\n/g, '<br>')}</div>` : ''}
              </td>
              <td class="d-col-end">${a.owner ? _scEsc(a.owner) : '<span class="d-muted">—</span>'}</td>
              <td class="d-col-end">${a.due ? _scEsc(a.due) : '<span class="d-muted">—</span>'}</td>
              <td class="d-col-end"><span class="sc-sheet-status sc-sheet-status-${a.status || 'pending'}">${_SC_STATUS_LABELS[a.status || 'pending']}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
      blocks.push({ html: carryTable });
    }
  }

  return blocks;
}

// === 舊版領導月會固定 2 頁分頁（已停用，保留參考） ===

function _scEnsureSheetEl() {
  let wrap = document.getElementById('sanchangPrintArea');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'sanchangPrintArea';
    wrap.innerHTML = '<div class="sc-sheet"></div>';
    document.body.appendChild(wrap);
  }
  return wrap.querySelector('.sc-sheet');
}

// ===== 預覽 =====
function _scPreview(mid) {
  const m = _scFindMeeting(mid);
  if (!m) { showToast('找不到會議紀錄'); return; }
  // 把每個 .sc-sheet-page 包進一個尺寸=縮放後的 wrapper（讓滾動範圍對應視覺大小）
  const tmp = document.createElement('div');
  tmp.innerHTML = _scBuildSheetHtml(m);
  const wrapped = [...tmp.children].map(p => {
    const wrap = document.createElement('div');
    wrap.className = 'sc-page-wrap';
    wrap.appendChild(p);
    return wrap.outerHTML;
  }).join('');

  const ov = document.createElement('div');
  ov.className = 'sc-modal-overlay';
  ov.onclick = () => ov.remove();
  ov.innerHTML = `
    <div class="sc-modal sc-modal-wide" onclick="event.stopPropagation()">
      <div class="sc-modal-head">
        <span>預覽</span>
        <button class="sc-icon-btn" onclick="this.closest('.sc-modal-overlay').remove()">×</button>
      </div>
      <div class="sc-modal-body">
        <div class="sc-sheet sc-sheet-in-modal">${wrapped}</div>
      </div>
    </div>
  `;
  document.body.appendChild(ov);
}

// ===== PDF / JPG / 列印 =====
function _scLoadScript(url) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${url}"]`)) return res();
    const s = document.createElement('script');
    s.src = url; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

function _scSafeName(m, ext) {
  const d = (m.meetingDate || '').replace(/[\\/:*?"<>|]/g, '_');
  return `${_scMod().filePrefix}_${d}.${ext}`;
}

async function _scExportPDF(mid) {
  const m = _scFindMeeting(mid);
  if (!m) return;
  _pauseEditLock();
  showLoader(true, 'PDF 產生中...');
  try {
    await Promise.all([
      _scLoadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'),
      _scLoadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
    ]);
    const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFCtor) throw new Error('jsPDF 初始化失敗');
    const sheet = _scEnsureSheetEl();
    sheet.innerHTML = _scBuildSheetHtml(m);
    document.body.classList.add('sc-print-mode');
    await new Promise(r => setTimeout(r, 150));
    const pages = sheet.querySelectorAll('.sc-sheet-page');
    const pdf = new jsPDFCtor({ orientation: 'p', unit: 'mm', format: 'a4' });
    try {
      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      }
    } finally {
      document.body.classList.remove('sc-print-mode');
    }
    pdf.save(_scSafeName(m, 'pdf'));
    showToast('PDF 已下載');
  } catch (e) {
    console.error('[SC PDF]', e);
    showToast('PDF 匯出失敗：' + (e.message || e));
  } finally {
    showLoader(false);
    _resumeEditLock();
  }
}

// JPG：逐頁輸出，每張 A4 各下載一個檔（不再合成一整條長圖）
async function _scExportJPG(mid) {
  const m = _scFindMeeting(mid);
  if (!m) return;
  _pauseEditLock();
  showLoader(true, 'JPG 產生中...');
  try {
    await _scLoadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    const sheet = _scEnsureSheetEl();
    sheet.innerHTML = _scBuildSheetHtml(m);
    document.body.classList.add('sc-print-mode');
    await new Promise(r => setTimeout(r, 150));
    const pages = sheet.querySelectorAll('.sc-sheet-page');
    const total = pages.length;
    const baseDate = (m.meetingDate || '').replace(/[\\/:*?"<>|]/g, '_');
    try {
      for (let i = 0; i < total; i++) {
        showLoader(true, `JPG 產生中... (${i + 1}/${total})`);
        const canvas = await html2canvas(pages[i], { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
        const dataUrl = canvas.toDataURL('image/jpeg', 0.93);
        const suffix = total > 1 ? `_第${i + 1}頁` : '';
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${_scMod().filePrefix}_${baseDate}${suffix}.jpg`;
        document.body.appendChild(a); a.click(); a.remove();
        // 多檔下載：間隔避免瀏覽器擋下後續下載
        if (i < total - 1) await new Promise(r => setTimeout(r, 450));
      }
    } finally {
      document.body.classList.remove('sc-print-mode');
    }
    showToast(total > 1 ? `已下載 ${total} 張 JPG` : 'JPG 已下載');
  } catch (e) {
    console.error('[SC JPG]', e);
    showToast('JPG 匯出失敗');
  } finally {
    showLoader(false);
    _resumeEditLock();
  }
}

// ===== LINE 文字 =====
function _scBuildLineText(m) {
  const lines = [];
  lines.push(`【${_scMod().title}紀錄】${m.meetingDate || ''}`);
  lines.push(`出席：${_scComputedAttendees(m)}`);
  if (m.absent) lines.push(`請假：${m.absent}`);
  lines.push('');

  if (_scMod().hasAnnouncements === true) {
    const _amod = _scMod();
    const roles = _amod.owners || [];
    const committee = (Array.isArray(m.committee) ? m.committee : [])
      .filter(c => (c.name || '').trim() && Array.isArray(c.announcements) && c.announcements.length);
    const fixedHasAny = roles.some(r => _scAnnouncementsForRole(m, r).length);
    const hasAny = fixedHasAny || committee.length > 0;
    lines.push('━━ 本周布達事項 ━━');
    if (!hasAny) {
      lines.push('  本次無布達事項');
    } else {
      roles.forEach(role => {
        const items = _scAnnouncementsForRole(m, role);
        if (items.length) {
          lines.push(`【${role}】`);
          items.forEach(({ a }, i) => {
            lines.push(`  ${i + 1}. ${a.content || ''}`);
          });
        }
        if (role === '副主席') {
          committee.forEach(c => {
            lines.push(`【${c.name}】`);
            c.announcements.forEach((a, i) => {
              lines.push(`  ${i + 1}. ${a.content || ''}`);
            });
          });
        }
      });
    }
    lines.push('');
  }

  if (_scMod().hasTopics !== false && (m.topics || []).length) {
    const _tmod = _scMod();
    const roles = _tmod.owners || [];
    const hasAny = roles.some(r => _scTopicsForRole(m, r).length);
    if (hasAny) {
      lines.push('━━ 議題與決議 ━━');
      roles.forEach(role => {
        const items = _scTopicsForRole(m, role);
        if (!items.length) return;
        lines.push(`【${role}】`);
        items.forEach(({ t }, i) => {
          lines.push(`  [議題${i + 1}] ${t.title || ''}`);
          if (t.content) lines.push(`    內容：${t.content}`);
          if (t.decision) lines.push(`    決議：${t.decision}`);
        });
      });
      lines.push('');
    }
  }

  // 領導月會的「各領導人報告」已合併到「本周布達事項」

  if ((m.actions || []).length) {
    const _amod = _scMod();
    if (_amod.groupActionsByRole) {
      const roles = _amod.owners || [];
      const dumpGroup = (label, items) => {
        if (!items.length) return;
        lines.push(`【${label}】`);
        items.forEach(({ a }, i) => {
          const meta = [];
          if (a.due) meta.push(`期限：${a.due}`);
          meta.push(`狀態：${_SC_STATUS_LABELS[a.status || 'pending']}`);
          lines.push(`  ${i + 1}. ${a.text || ''}`);
          lines.push(`     ${meta.join('｜')}`);
          if (a.trackNote) lines.push(`     追蹤：${a.trackNote}`);
        });
      };
      const hasAny = roles.some(r => _scActionsForRole(m, r).length) || _scActionsForRole(m, null).length;
      if (hasAny) {
        lines.push('━━ 待辦事項 ━━');
        roles.forEach(r => dumpGroup(r, _scActionsForRole(m, r)));
        dumpGroup('未指派', _scActionsForRole(m, null));
        lines.push('');
      }
    } else {
      lines.push('━━ 待辦事項 ━━');
      m.actions.forEach((a, i) => {
        const meta = [];
        if (a.owner) meta.push(`負責：${a.owner}`);
        if (a.due) meta.push(`期限：${a.due}`);
        meta.push(`狀態：${_SC_STATUS_LABELS[a.status || 'pending']}`);
        lines.push(`${i + 1}. ${a.text || ''}`);
        lines.push(`   ${meta.join('｜')}`);
        if (a.trackNote) lines.push(`   追蹤：${a.trackNote}`);
      });
      lines.push('');
    }
  }

  if (_scMod().hasMotions === true && (m.motions || []).length) {
    lines.push('━━ 臨時動議 ━━');
    m.motions.forEach((mo, i) => {
      lines.push(`[動議${i + 1}] ${mo.title || ''}`);
      if (mo.decision) lines.push(`  決議：${mo.decision}`);
    });
    lines.push('');
  }

  if (_scMod().hasSummary !== false && m.summary) {
    lines.push('━━ 結論摘要 ━━');
    lines.push(m.summary);
    lines.push('');
  }

  if (m.nextMeeting) lines.push(`下次會議：${m.nextMeeting}`);
  if (CU) lines.push(`紀錄人：${CU}`);
  return lines.join('\n');
}

async function _scCopyLineText(mid) {
  const m = _scFindMeeting(mid);
  if (!m) return;
  const text = _scBuildLineText(m);
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {}
  if (copied) {
    showToast('已複製到剪貼簿');
    return;
  }
  // 退回：彈出 textarea 讓使用者手動複製
  const ov = document.createElement('div');
  ov.className = 'sc-modal-overlay';
  ov.onclick = () => ov.remove();
  ov.innerHTML = `
    <div class="sc-modal" onclick="event.stopPropagation()">
      <div class="sc-modal-head">
        <span>文字內容（請手動複製）</span>
        <button class="sc-icon-btn" onclick="this.closest('.sc-modal-overlay').remove()">×</button>
      </div>
      <div class="sc-modal-body">
        <textarea class="sc-textarea" style="width:100%;height:60vh;font-family:monospace;" readonly>${_scEsc(text)}</textarea>
      </div>
    </div>
  `;
  document.body.appendChild(ov);
  setTimeout(() => {
    const ta = ov.querySelector('textarea');
    if (ta) { ta.focus(); ta.select(); }
  }, 100);
}
