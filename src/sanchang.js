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
    hasSummary: true
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
    hasSummary: false,
    reportRoles: ['主席', '副主席', '秘書財務', '活動協調員', '教育協調員', '成長協調員', '導師協調員', '來賓接待員', '網站管理員', '董顧', '支持成長董顧']
  }
};

const _scStates = {
  sanchang: { view: 'current', histDetailId: null },
  leadership: { view: 'current', histDetailId: null }
};

let _scCurMod = 'sanchang';
let _scState = _scStates[_scCurMod];
function _scMod() { return _SC_MODULES[_scCurMod]; }
function _scSetModule(modId) {
  _scCurMod = modId;
  _scState = _scStates[modId];
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
function _scNewId(prefix) {
  return prefix + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

function _scNewMeeting() {
  return {
    id: _scNewId('m'),
    weekKey: getWeekKey(),
    meetingDate: _scTodayDateStr(),
    absent: '',
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
}
function _scSwitchView(v) { _scState.view = v; _scState.histDetailId = null; _scRenderActive(); }

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
  const showTopics  = mod.hasTopics !== false;
  const showMotions = mod.hasMotions === true;
  const showSummary = mod.hasSummary !== false;
  const topicsHtml  = showTopics  ? (m.topics  || []).map((t, i) => _scTopicCardHtml(m.id, t, i, canEdit)).join('') : '';
  const motionsHtml = showMotions ? (m.motions || []).map((mo, i) => _scMotionCardHtml(m.id, mo, i, canEdit)).join('') : '';
  const actionsHtml = (m.actions || []).map((a, i) => _scActionRowHtml(m, a, i, canEdit, false)).join('');
  const reportsHtml = _scReportsSectionHtml(m, canEdit);

  return `
    <div class="sc-card">
      <div class="sc-card-head">
        <span class="sc-card-title">基本資訊</span>
      </div>
      <label class="sc-field">
        <span class="sc-label">會議日期</span>
        <input type="text" class="sc-input" value="${_scEsc(m.meetingDate)}" placeholder="2026/05/20" oninput="_scUpdateField('${m.id}','meetingDate',this.value)">
      </label>
      <label class="sc-field">
        <span class="sc-label">出席人員</span>
        <div class="sc-input sc-input-static" id="scAttendeesDisplay">${_scComputedAttendees(m)}</div>
      </label>
      <label class="sc-field">
        <span class="sc-label">請假人員（如有）</span>
        <input type="text" class="sc-input" value="${_scEsc(m.absent)}" placeholder="例：副主席" oninput="_scUpdateField('${m.id}','absent',this.value)">
      </label>
    </div>

    ${showTopics ? `<div class="sc-card">
      <div class="sc-card-head">
        <span class="sc-card-title">會議議題與決議</span>
        ${canEdit ? `<button class="sc-btn sc-btn-sm" onclick="_scAddTopic('${m.id}')">+ 新增議題</button>` : ''}
      </div>
      ${topicsHtml || `<div class="sc-empty-mini">尚未新增議題</div>`}
    </div>` : ''}

    ${reportsHtml}

    <div class="sc-card">
      <div class="sc-card-head">
        <span class="sc-card-title">本週決議待辦</span>
        ${canEdit ? `<button class="sc-btn sc-btn-sm" onclick="_scAddAction('${m.id}')">+ 新增待辦</button>` : ''}
      </div>
      ${actionsHtml || `<div class="sc-empty-mini">尚未新增待辦事項</div>`}
    </div>

    ${showMotions ? `<div class="sc-card">
      <div class="sc-card-head">
        <span class="sc-card-title">臨時動議</span>
        ${canEdit ? `<button class="sc-btn sc-btn-sm" onclick="_scAddMotion('${m.id}')">+ 新增動議</button>` : ''}
      </div>
      ${motionsHtml || `<div class="sc-empty-mini">本次無臨時動議</div>`}
    </div>` : ''}

    <div class="sc-card">
      <div class="sc-card-head">
        <span class="sc-card-title">${showSummary ? '下次會議與結論' : '下次會議'}</span>
      </div>
      <label class="sc-field">
        <span class="sc-label">下次會議日期</span>
        <input type="text" class="sc-input" value="${_scEsc(m.nextMeeting)}" placeholder="2026/05/27" oninput="_scUpdateField('${m.id}','nextMeeting',this.value)">
      </label>
      ${showSummary ? `<label class="sc-field">
        <span class="sc-label">結論摘要</span>
        <textarea class="sc-textarea" rows="3" placeholder="本次會議重點結論..." oninput="_scUpdateField('${m.id}','summary',this.value)">${_scEsc(m.summary)}</textarea>
      </label>` : ''}
    </div>

    <div class="sc-toolbar">
      <button class="sc-btn sc-btn-ghost" onclick="_scPreview('${m.id}')">預覽</button>
      <button class="sc-btn sc-btn-primary" onclick="_scExportPDF('${m.id}')">PDF</button>
      <button class="sc-btn sc-btn-primary" onclick="_scExportJPG('${m.id}')">JPG</button>
      <button class="sc-btn sc-btn-primary" onclick="_scCopyLineText('${m.id}')">複製文字</button>
    </div>
  `;
}

function _scTopicCardHtml(mid, t, idx, canEdit) {
  return `
    <div class="sc-topic" data-tidx="${idx}">
      <div class="sc-topic-head">
        <span class="sc-topic-num">議題 ${idx + 1}</span>
        ${canEdit ? `<button class="sc-icon-btn" onclick="_scDelTopic('${mid}',${idx})" title="刪除">×</button>` : ''}
      </div>
      <input type="text" class="sc-input" placeholder="議題標題" value="${_scEsc(t.title || '')}" oninput="_scUpdateTopic('${mid}',${idx},'title',this.value)">
      <textarea class="sc-textarea" rows="2" placeholder="討論內容" oninput="_scUpdateTopic('${mid}',${idx},'content',this.value)">${_scEsc(t.content || '')}</textarea>
      <textarea class="sc-textarea sc-textarea-decision" rows="2" placeholder="決議" oninput="_scUpdateTopic('${mid}',${idx},'decision',this.value)">${_scEsc(t.decision || '')}</textarea>
    </div>
  `;
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
  const ownersList = _scComputedOwners(m);
  return `
    <div class="sc-action" data-aidx="${idx}">
      <div class="sc-action-main">
        <input type="text" class="sc-input sc-input-flex" placeholder="待辦內容" value="${_scEsc(a.text || '')}" oninput="_scUpdateAction('${mid}',${idx},'text',this.value)">
        ${canEdit ? `<button class="sc-icon-btn" onclick="_scDelAction('${mid}',${idx})" title="刪除">×</button>` : ''}
      </div>
      <div class="sc-action-meta">
        <select class="sc-select sc-input-sm" onchange="_scUpdateAction('${mid}',${idx},'owner',this.value)">
          <option value="" ${!a.owner ? 'selected' : ''}>選負責人</option>
          ${ownersList.map(o => `<option value="${o}" ${a.owner === o ? 'selected' : ''}>${o}</option>`).join('')}
        </select>
        <input type="text" class="sc-input sc-input-sm" placeholder="期限（如 05/24）" value="${_scEsc(a.due || '')}" oninput="_scUpdateAction('${mid}',${idx},'due',this.value)">
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

async function _scAddTopic(mid) {
  const m = _scFindMeeting(mid);
  if (!m) return;
  (m.topics = m.topics || []).push({ title: '', content: '', decision: '' });
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

async function _scAddAction(mid) {
  const m = _scFindMeeting(mid);
  if (!m) return;
  (m.actions = m.actions || []).push({ text: '', owner: '', due: '', status: 'pending' });
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
  } else {
    _scDebouncedSave(m);
  }
}

async function _scDeleteMeeting(id) {
  if (!confirm('確定要刪除這場會議紀錄？此操作無法復原。')) return;
  const all = _scGetMeetings().filter(m => m.id !== id);
  await _scSaveMeetings(all);
  showToast('已刪除');
  _scState.histDetailId = null;
  _scRenderActive();
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
  const canEdit = _canEditTab('sanchang');
  const actions = m.actions || [];
  const total = actions.length;
  const done = actions.filter(a => a.status === 'done').length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const rows = actions.length
    ? actions.map((a, i) => _scActionRowHtml(m, a, i, canEdit, true)).join('')
    : `<div class="sc-empty-mini">上一場無待辦事項</div>`;

  return `
    <div class="sc-card">
      <div class="sc-card-head">
        <span class="sc-card-title">上次會議：${_scEsc(m.meetingDate)}</span>
        <span class="sc-badge sc-badge-soft">${done}/${total} 完成 ${pct}%</span>
      </div>
      <div class="sc-progress"><div class="sc-progress-fill" style="width:${pct}%"></div></div>
    </div>
    <div class="sc-card">
      <div class="sc-card-head">
        <span class="sc-card-title">待辦追蹤</span>
      </div>
      ${rows}
    </div>
    <div class="sc-toolbar">
      <button class="sc-btn sc-btn-ghost" onclick="_scPreview('${m.id}')">預覽</button>
      <button class="sc-btn sc-btn-primary" onclick="_scCopyLineText('${m.id}')">複製文字</button>
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
  const topicsHtml = (m.topics || []).length
    ? m.topics.map((t, i) => `
        <div class="sc-sheet-topic">
          <div class="sc-sheet-topic-title">
            <span class="sc-sheet-topic-num">議題 ${i + 1}</span>
            <span>${_scEsc(t.title || '(未填標題)')}</span>
          </div>
          ${t.content ? `<div class="sc-sheet-topic-content">${_scEsc(t.content)}</div>` : ''}
          ${t.decision ? `<div class="sc-sheet-topic-decision"><span class="sc-sheet-tag">決議</span>${_scEsc(t.decision)}</div>` : ''}
        </div>
      `).join('')
    : `<div class="sc-sheet-empty-block">本次無議題</div>`;

  const motionsHtml = (m.motions || []).length
    ? m.motions.map((mo, i) => `
        <div class="sc-sheet-topic">
          <div class="sc-sheet-topic-title">
            <span class="sc-sheet-topic-num sc-sheet-topic-num-alt">動議 ${i + 1}</span>
            <span>${_scEsc(mo.title || '(未填內容)')}</span>
          </div>
          ${mo.decision ? `<div class="sc-sheet-topic-decision"><span class="sc-sheet-tag">決議</span>${_scEsc(mo.decision)}</div>` : ''}
        </div>
      `).join('')
    : `<div class="sc-sheet-empty-block">本次無臨時動議</div>`;

  const actsHtml = (m.actions || []).length
    ? `<table class="sc-sheet-table">
        <thead><tr>
          <th style="width:8mm;">#</th>
          <th>待辦內容</th>
          <th style="width:22mm;">負責人</th>
          <th style="width:22mm;">期限</th>
          <th style="width:18mm;">狀態</th>
        </tr></thead>
        <tbody>
          ${m.actions.map((a, i) => `
            <tr>
              <td class="sc-sheet-td-num">${i + 1}</td>
              <td class="sc-sheet-td-text">${_scEsc(a.text || '')}${a.trackNote ? `<div class="sc-sheet-tracknote">追蹤：${_scEsc(a.trackNote)}</div>` : ''}</td>
              <td>${_scEsc(a.owner || '')}</td>
              <td>${_scEsc(a.due || '')}</td>
              <td><span class="sc-sheet-status sc-sheet-status-${a.status || 'pending'}">${_SC_STATUS_LABELS[a.status || 'pending']}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>`
    : `<div class="sc-sheet-empty-block">本次無待辦事項</div>`;

  const barHtml = `
    <div class="sc-sheet-bar">
      <div class="sc-sheet-bar-left">BNI 億展白金分會</div>
      <div class="sc-sheet-bar-right">${_scMod().title}紀錄</div>
    </div>
  `;
  const headlineHtml = `
    <div class="sc-sheet-headline">
      <div class="sc-sheet-headline-l">
        <div class="sc-sheet-date">${_scEsc(m.meetingDate || '')}</div>
        <div class="sc-sheet-meta-strong">${_scMod().title}</div>
      </div>
      <div class="sc-sheet-headline-r">
        <div class="sc-sheet-meta"><span class="sc-sheet-meta-key">出席</span><b>${_scComputedAttendees(m)}</b></div>
        ${m.absent ? `<div class="sc-sheet-meta"><span class="sc-sheet-meta-key">請假</span>${_scEsc(m.absent)}</div>` : ''}
      </div>
    </div>
  `;
  const headerHtml = barHtml + headlineHtml;

  const topicsBlock = mod.hasTopics !== false ? `<div class="sc-sheet-section">
    <div class="sc-sheet-h2"><span class="sc-sheet-h2-bar"></span>議題與決議</div>
    ${topicsHtml}
  </div>` : '';

  const reportsBlock = _scBuildSheetReports(m);

  const actionsBlock = `<div class="sc-sheet-section">
    <div class="sc-sheet-h2"><span class="sc-sheet-h2-bar"></span>待辦事項追蹤</div>
    ${actsHtml}
  </div>`;

  const motionsBlock = mod.hasMotions === true ? `<div class="sc-sheet-section">
    <div class="sc-sheet-h2"><span class="sc-sheet-h2-bar"></span>臨時動議</div>
    ${motionsHtml}
  </div>` : '';

  const summaryBlock = mod.hasSummary !== false && m.summary ? `<div class="sc-sheet-section">
    <div class="sc-sheet-h2"><span class="sc-sheet-h2-bar"></span>結論摘要</div>
    <div class="sc-sheet-summary">${_scEsc(m.summary).replace(/\n/g, '<br>')}</div>
  </div>` : '';

  const footHtml = `<div class="sc-sheet-foot">
    <div>下次會議：<b>${_scEsc(m.nextMeeting || '未訂')}</b></div>
    <div>紀錄人：${_scEsc(CU || '')}</div>
  </div>`;

  // 分頁規則：有 hasReports 的模組（領導月會）→ 報告全部放第一頁，待辦/動議/結論放第二頁
  // 第二頁不重複日期與出席名單（只保留 BNI 標頭）
  let pages;
  if (mod.hasReports) {
    pages = [
      headerHtml + topicsBlock + reportsBlock,
      barHtml + actionsBlock + motionsBlock + summaryBlock + footHtml
    ];
  } else {
    pages = [
      headerHtml + topicsBlock + reportsBlock + actionsBlock + motionsBlock + summaryBlock + footHtml
    ];
  }
  return pages.map((p, i) => `<div class="sc-sheet-page" data-page="${i + 1}">${p}${mod.hasReports ? `<div class="sc-sheet-page-no">- ${i + 1} -</div>` : ''}</div>`).join('');
}

function _scBuildSheetReports(m) {
  const mod = _scMod();
  if (!mod.hasReports) return '';
  const roles = mod.reportRoles || mod.owners || [];
  const reports = m.reports || {};
  const committee = (Array.isArray(m.committee) ? m.committee : [])
    .filter(c => (c.name || '').trim() && (c.report || '').trim());

  const parts = [];
  roles.forEach(r => {
    if ((reports[r] || '').trim()) {
      parts.push(`
        <div class="sc-sheet-report">
          <div class="sc-sheet-report-role">${r}</div>
          <div class="sc-sheet-report-text">${_scEsc(reports[r]).replace(/\n/g, '<br>')}</div>
        </div>
      `);
    }
    if (r === '副主席') {
      committee.forEach(c => {
        parts.push(`
          <div class="sc-sheet-report">
            <div class="sc-sheet-report-role sc-sheet-report-role-com">${_scEsc(c.name)}<div class="sc-sheet-report-role-tag">委員</div></div>
            <div class="sc-sheet-report-text">${_scEsc(c.report).replace(/\n/g, '<br>')}</div>
          </div>
        `);
      });
    }
  });
  return `
    <div class="sc-sheet-section">
      <div class="sc-sheet-h2"><span class="sc-sheet-h2-bar"></span>各領導人報告事項</div>
      ${parts.join('') || `<div class="sc-sheet-empty-block">本次無報告事項</div>`}
    </div>
  `;
}

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

async function _scRenderSheetToCanvas(m) {
  const sheet = _scEnsureSheetEl();
  sheet.innerHTML = _scBuildSheetHtml(m);
  document.body.classList.add('sc-print-mode');
  await new Promise(r => setTimeout(r, 120));
  try {
    return await html2canvas(sheet, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
  } finally {
    document.body.classList.remove('sc-print-mode');
  }
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

async function _scExportJPG(mid) {
  const m = _scFindMeeting(mid);
  if (!m) return;
  _pauseEditLock();
  showLoader(true, 'JPG 產生中...');
  try {
    await _scLoadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    const canvas = await _scRenderSheetToCanvas(m);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.93);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = _scSafeName(m, 'jpg');
    document.body.appendChild(a); a.click(); a.remove();
    showToast('JPG 已下載');
  } catch (e) {
    console.error('[SC JPG]', e);
    showToast('JPG 匯出失敗');
  } finally {
    showLoader(false);
    _resumeEditLock();
  }
}

function _scPrint(mid) {
  const m = _scFindMeeting(mid);
  if (!m) return;
  const sheet = _scEnsureSheetEl();
  sheet.innerHTML = _scBuildSheetHtml(m);
  document.body.classList.add('sc-print-mode');
  setTimeout(() => {
    window.print();
    setTimeout(() => document.body.classList.remove('sc-print-mode'), 500);
  }, 120);
}

// ===== LINE 文字 =====
function _scBuildLineText(m) {
  const lines = [];
  lines.push(`【${_scMod().title}紀錄】${m.meetingDate || ''}`);
  lines.push(`出席：${_scComputedAttendees(m)}`);
  if (m.absent) lines.push(`請假：${m.absent}`);
  lines.push('');

  if (_scMod().hasTopics !== false && (m.topics || []).length) {
    lines.push('━━ 議題與決議 ━━');
    m.topics.forEach((t, i) => {
      lines.push(`[議題${i + 1}] ${t.title || ''}`);
      if (t.content) lines.push(`  內容：${t.content}`);
      if (t.decision) lines.push(`  決議：${t.decision}`);
    });
    lines.push('');
  }

  const _mod = _scMod();
  if (_mod.hasReports) {
    const roles = _mod.reportRoles || _mod.owners || [];
    const reports = m.reports || {};
    const committee = (Array.isArray(m.committee) ? m.committee : [])
      .filter(c => (c.name || '').trim() && (c.report || '').trim());
    const hasAnyReport = roles.some(r => (reports[r] || '').trim()) || committee.length > 0;
    if (hasAnyReport) {
      lines.push('━━ 各領導人報告 ━━');
      roles.forEach(r => {
        if ((reports[r] || '').trim()) {
          lines.push(`【${r}】`);
          reports[r].split('\n').forEach(line => { if (line.trim()) lines.push(`  ${line}`); });
        }
        if (r === '副主席') {
          committee.forEach(c => {
            lines.push(`【委員 ${c.name}】`);
            c.report.split('\n').forEach(line => { if (line.trim()) lines.push(`  ${line}`); });
          });
        }
      });
      lines.push('');
    }
  }

  if ((m.actions || []).length) {
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
