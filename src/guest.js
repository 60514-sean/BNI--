// ===== GUEST TRACK =====
const GUEST_STATUSES = ['待追蹤','持續追蹤','已填單待繳費','審核中','已入會','轉別分會','婉拒/停止追蹤'];
const GUEST_STATUS_COLORS = {
  '待追蹤':         { bg:'#f4f6f8', fg:'#666' },
  '持續追蹤':       { bg:'#fef3c7', fg:'#92400e' },
  '已填單待繳費':   { bg:'#fde68a', fg:'#78350f' },
  '審核中':         { bg:'#e0f2fe', fg:'#075985' },
  '已入會':         { bg:'#dcfce7', fg:'#166534' },
  '轉別分會':       { bg:'#ede9fe', fg:'#5b21b6' },
  '婉拒/停止追蹤':  { bg:'#fee2e2', fg:'#991b1b' }
};
const JOIN_PROBABILITIES = ['未評估','高','中','低'];
const JOIN_PROB_COLORS = {
  '未評估': { bg:'#f4f6f8', fg:'#999' },
  '高':     { bg:'#fee2e2', fg:'#991b1b' },
  '中':     { bg:'#fed7aa', fg:'#9a3412' },
  '低':     { bg:'#dbeafe', fg:'#1e40af' }
};
let _guestData = null;
let _guestSubTab = 'week';   // 'week' | 'all'
let _guestSearch = '';
let _guestStatusFilter = ''; // '' = 全部，否則為特定狀態
let _guestTermFilter = 0;    // 0 = 全部，否則為特定屆數（1, 2, 3, ...）

function _parseDateStr(s) {
  if (!s) return null;
  s = String(s).trim();
  let m = s.match(/^(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  m = s.match(/^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  m = s.match(/^(\d{2,3})年\s*(\d{1,2})月\s*(\d{1,2})/);
  if (m) return new Date(+m[1] + 1911, +m[2]-1, +m[3]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function _weekRange() {
  const now = new Date();
  const dow = now.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(now); mon.setHours(0,0,0,0); mon.setDate(now.getDate() + offset);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
  return { mon, sun };
}

function _weekRangeText() {
  const { mon, sun } = _weekRange();
  const fmt = d => `${d.getMonth()+1}/${d.getDate()}`;
  return `${fmt(mon)} ~ ${fmt(sun)}`;
}

function _parseTracks(s) {
  if (!s) return [];
  try {
    const arr = typeof s === 'string' ? JSON.parse(s) : s;
    return Array.isArray(arr) ? arr.filter(x => x && x.note) : [];
  } catch { return []; }
}

function _guestLatestDate(g) {
  const tracks = _parseTracks(g.tracks);
  const dates = [_parseDateStr(g.firstVisit)];
  tracks.forEach(t => dates.push(_parseDateStr(t.date)));
  const valid = dates.filter(d => d);
  return valid.length ? new Date(Math.max(...valid.map(d => d.getTime()))) : null;
}

const HIGH_POTENTIAL_KEY = '__highPotential__';
const HIGH_POTENTIAL_LABEL = '高機率入會';
function _isHighPotentialGuest(g) {
  return g.joinProb === '高';
}

async function fetchGuests() {
  try {
    const r = await fetch(API_URL + '?action=listGuests&t=' + Date.now());
    const j = await r.json();
    if (!j || j.ok !== true) throw new Error(j?.error || 'fetch failed');
    _guestData = j.data || [];
  } catch (e) {
    _guestData = null;
  }
}

async function renderGuestTrack() {
  const el = document.getElementById('guestTrackContent');
  if (_guestData === null) {
    el.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text-soft);">載入中...</div>`;
    await fetchGuests();
  }
  if (_guestData === null) {
    el.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--red);">載入失敗，請重試 <button class="btn" style="margin-left:12px;background:var(--red);color:white;" onclick="_guestData=null;renderGuestTrack()">重試</button></div>`;
    return;
  }

  const tab = _guestSubTab;
  const subBtn = (v, label) => `<button class="signin-subtab ${tab===v?'active':''}" onclick="_guestSubSwitch('${v}')">${label}</button>`;

  // 依「本周/歷屆 + 搜尋」先縮小範圍，再基於此算各狀態筆數，最後才套狀態篩選
  const scopeFiltered = _filterGuestsScope(tab);
  const statusCounts = _countByStatus(scopeFiltered);
  const guests = !_guestStatusFilter
    ? scopeFiltered
    : (_guestStatusFilter === HIGH_POTENTIAL_KEY
        ? scopeFiltered.filter(_isHighPotentialGuest)
        : scopeFiltered.filter(g => (g.status || '待追蹤') === _guestStatusFilter));

  const rangeText = tab === 'week' ? `本周（${_weekRangeText()}）` : '歷屆全部';

  el.innerHTML = `<div class="signin-wrapper">
    <div class="card" style="margin-bottom:14px;padding:16px 20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:16px;font-weight:900;color:var(--text);">來賓追蹤</div>
          <div style="font-size:12px;color:var(--text-soft);margin-top:3px;">${rangeText} · 共 ${guests.length} 位${_guestStatusFilter ? ` · 狀態：${_escH(_guestStatusFilter === HIGH_POTENTIAL_KEY ? HIGH_POTENTIAL_LABEL : _guestStatusFilter)}` : ''}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="openGuestModal()">+ 新增來賓</button>
          <button class="btn" style="background:white;border:1.5px solid var(--gray-border);color:var(--text-soft);" onclick="_guestData=null;renderGuestTrack()">重整</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        ${subBtn('week','本周來賓')}
        ${subBtn('all','歷屆來賓')}
      </div>
      ${tab === 'all' ? `<input type="text" placeholder="搜尋姓名／產業／邀請人..." value="${_escH(_guestSearch)}" oninput="_guestSearch=this.value;_debouncedRenderGuestList()" style="width:100%;margin-top:10px;padding:10px 14px;border:1.5px solid var(--gray-border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit;outline:none;">` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
        ${tab === 'all' ? _termSelectHtml() : ''}
        ${_statusSelectHtml()}
      </div>
    </div>
    <div id="guestListContainer">${_guestListHtml(guests)}</div>
  </div>`;
}

function _filterGuestsScope(tab, applyYear = true) {
  // 做 tab / 搜尋 / (可選)年份，不做狀態過濾
  if (!_guestData) return [];
  let list = [..._guestData];
  if (tab === 'all' && _guestSearch) {
    const q = _guestSearch.toLowerCase();
    list = list.filter(g =>
      (g.name||'').toLowerCase().includes(q) ||
      (g.industry||'').toLowerCase().includes(q) ||
      (g.inviter||'').toLowerCase().includes(q) ||
      (g.company||'').toLowerCase().includes(q)
    );
  }
  if (tab === 'all' && applyYear && _guestTermFilter) {
    list = list.filter(g => _getTermFromDate(g.firstVisit) === _guestTermFilter);
  }
  if (tab === 'week') {
    const { mon, sun } = _weekRange();
    list = list.filter(g => {
      const candidates = [_parseDateStr(g.firstVisit)];
      _parseTracks(g.tracks).forEach(t => candidates.push(_parseDateStr(t.date)));
      return candidates.some(d => d && d >= mon && d <= sun);
    });
  }
  list.sort((a,b) => {
    const da = _guestLatestDate(a); const db = _guestLatestDate(b);
    return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
  });
  return list;
}

// 屆數規則：第 1 屆 2024/2~2024/3（特例 2 個月），之後每 6 個月一屆，第 2 屆從 2024/4 開始
function _getTermFromDate(dateStr) {
  const d = dateStr instanceof Date ? dateStr : _parseDateStr(dateStr);
  if (!d) return null;
  const ym = d.getFullYear() * 12 + d.getMonth(); // 月份 0-based
  const term1Start = 2024 * 12 + 1; // 2024/02
  const term1End   = 2024 * 12 + 2; // 2024/03
  const term2Start = 2024 * 12 + 3; // 2024/04
  if (ym < term1Start) return null;
  if (ym <= term1End) return 1;
  return Math.floor((ym - term2Start) / 6) + 2;
}

function _getTermDateRange(term) {
  if (term === 1) {
    return { start: new Date(2024, 1, 1), end: new Date(2024, 2, 31, 23, 59, 59, 999) };
  }
  const startYM = 2024 * 12 + 3 + (term - 2) * 6;
  const endYM = startYM + 5;
  const startYear = Math.floor(startYM / 12);
  const startMonth = startYM % 12;
  const endYear = Math.floor(endYM / 12);
  const endMonth = endYM % 12;
  const endDay = new Date(endYear, endMonth + 1, 0).getDate();
  return {
    start: new Date(startYear, startMonth, 1),
    end:   new Date(endYear, endMonth, endDay, 23, 59, 59, 999)
  };
}

function _termLabel(term) {
  const r = _getTermDateRange(term);
  const fmt = d => `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`;
  return `第${term}屆（${fmt(r.start)}~${fmt(r.end)}）`;
}

function _countByTerm(list) {
  const c = {};
  list.forEach(g => {
    const t = _getTermFromDate(g.firstVisit);
    if (t) c[t] = (c[t] || 0) + 1;
  });
  return c;
}

function _availableTerms() {
  if (!_guestData) return [];
  const set = new Set();
  _guestData.forEach(g => {
    const t = _getTermFromDate(g.firstVisit);
    if (t) set.add(t);
  });
  return [...set].sort((a,b) => b - a);
}

function _setTermFilter(t) {
  _guestTermFilter = (_guestTermFilter === t) ? 0 : t;
  renderGuestTrack();
}

function _countByStatus(list) {
  const c = {};
  list.forEach(g => {
    const s = g.status || '待追蹤';
    c[s] = (c[s] || 0) + 1;
  });
  return c;
}

function _statusSelectHtml() {
  // 狀態篩選的「每個選項計數」以「目前 tab + 搜尋 + 年份」為 scope，不套狀態本身
  const scope = _filterGuestsScope(_guestSubTab);
  const counts = _countByStatus(scope);
  const highCount = scope.filter(_isHighPotentialGuest).length;
  return `<select onchange="_setStatusFilter(this.value)" class="guest-filter-sel">
    <option value="" ${!_guestStatusFilter?'selected':''}>全部狀態・${scope.length} 筆</option>
    <option value="${HIGH_POTENTIAL_KEY}" ${_guestStatusFilter===HIGH_POTENTIAL_KEY?'selected':''}>${HIGH_POTENTIAL_LABEL}・${highCount} 筆</option>
    ${GUEST_STATUSES.filter(s => s !== '已入會' && s !== '轉別分會').map(s => `<option value="${s}" ${_guestStatusFilter===s?'selected':''}>${_escH(s)}・${counts[s]||0} 筆</option>`).join('')}
  </select>`;
}

function _termSelectHtml() {
  const scopeNoTerm = _filterGuestsScope(_guestSubTab, false);
  const tCounts = _countByTerm(scopeNoTerm);
  const terms = _availableTerms();
  return `<select onchange="_setTermFilter(+this.value)" class="guest-filter-sel">
    <option value="0" ${_guestTermFilter===0?'selected':''}>全部屆數・${scopeNoTerm.length} 筆</option>
    ${terms.map(t => `<option value="${t}" ${_guestTermFilter===t?'selected':''}>${_termLabel(t)}・${tCounts[t]||0} 筆</option>`).join('')}
  </select>`;
}

function _setStatusFilter(v) {
  _guestStatusFilter = v;
  renderGuestTrack();
}

function _renderGuestListOnly() {
  // 搜尋輸入時：重新渲染除了搜尋框外的所有區塊（select 會被重建，但輸入框保留焦點）
  renderGuestTrack();
  // 把焦點放回搜尋框
  const inp = document.querySelector('#guestTrackContent input[type="text"]');
  if (inp && document.activeElement !== inp) {
    inp.focus();
    const len = inp.value.length;
    inp.setSelectionRange(len, len);
  }
}
const _debouncedRenderGuestList = _debounce(_renderGuestListOnly, 150);

function _guestSubSwitch(v) { _guestSubTab = v; _guestSearch = ''; _guestStatusFilter = ''; _guestTermFilter = 0; renderGuestTrack(); }

function _guestStatusBadge(status) {
  const s = status || '待追蹤';
  const c = GUEST_STATUS_COLORS[s] || GUEST_STATUS_COLORS['待追蹤'];
  return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${c.bg};color:${c.fg};font-size:11px;font-weight:700;white-space:nowrap;">${_escH(s)}</span>`;
}

function _joinProbBadge(joinProb) {
  const p = joinProb || '未評估';
  if (p === '未評估') return '';
  const c = JOIN_PROB_COLORS[p] || JOIN_PROB_COLORS['未評估'];
  return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${c.bg};color:${c.fg};font-size:11px;font-weight:700;white-space:nowrap;">入會機率：${_escH(p)}</span>`;
}

function _guestCardHtml(g) {
  const tracks = _parseTracks(g.tracks);
  const tracksHtml = tracks.length
    ? tracks.map((t, i) => `
      <div style="display:flex;gap:8px;padding:6px 0;border-top:1px dashed var(--gray-border);font-size:12px;">
        <div style="flex-shrink:0;font-weight:700;color:var(--red);min-width:82px;">第${_zhNum(i+1)}次追蹤</div>
        <div style="flex:1;min-width:0;">
          ${t.date ? `<div style="color:var(--text-soft);font-size:11px;margin-bottom:2px;">${_escH(t.date)}</div>` : ''}
          <div style="word-break:break-word;line-height:1.5;">${_escH(t.note)}</div>
        </div>
      </div>`).join('')
    : '';
  const gKey = `${g.year}-${g.sheetRow}`;
  return `<div class="card" style="padding:14px 16px;margin-bottom:10px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px;">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;">
          <span style="font-size:16px;font-weight:900;color:var(--text);">${_escH(g.name)}</span>
          ${g.title ? `<span style="color:var(--text-soft);font-size:13px;font-weight:500;">${_escH(g.title)}</span>` : ''}
          ${_guestStatusBadge(g.status)}
          ${_joinProbBadge(g.joinProb)}
        </div>
        <div style="font-size:12px;color:var(--text-soft);margin-top:4px;line-height:1.5;">
          ${g.industry ? `<span>${_escH(g.industry)}</span>` : ''}
          ${g.company ? ` · <span>${_escH(g.company)}</span>` : ''}
        </div>
        ${g.firstVisit ? `<div style="font-size:12px;color:var(--text-soft);margin-top:2px;">${g.visitType === '二次' ? '二次參訪' : '首訪'} <b style="color:var(--text);">${_escH(g.firstVisit)}</b></div>` : ''}
        <div style="font-size:12px;color:var(--text-soft);margin-top:2px;">
          ${g.inviter ? `邀約：<b style="color:var(--text);">${_escH(g.inviter)}</b>` : ''}
          ${g.closer ? `　締結：<b style="color:var(--text);">${_escH(g.closer)}</b>` : ''}
          ${g.phone ? `　<a href="tel:${_escH(g.phone)}" style="color:var(--red);text-decoration:none;">${_escH(g.phone)}</a>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        ${g._pending
          ? `<span style="padding:6px 12px;font-size:12px;color:var(--text-soft);background:#f4f6f8;border-radius:6px;">同步中...</span>`
          : `<button class="btn" style="padding:6px 12px;font-size:12px;background:white;border:1px solid var(--gray-border);color:var(--text-soft);" onclick="openGuestModal('${gKey}')">編輯</button>
             <button class="btn" style="padding:6px 12px;font-size:12px;background:white;border:1px solid var(--gray-border);color:#c0392b;" onclick="deleteGuestConfirm('${gKey}')">刪除</button>`}
      </div>
    </div>
    ${g.postVisitNote ? `<div style="background:#fafbfc;padding:8px 10px;border-radius:6px;font-size:12px;line-height:1.5;margin-top:6px;">
      <b style="color:var(--text-soft);">參訪後締結：</b>${_escH(g.postVisitNote)}
    </div>` : ''}
    ${tracksHtml ? `<div style="margin-top:8px;">${tracksHtml}</div>` : ''}
  </div>`;
}

function _zhNum(n) {
  const zh = ['零','一','二','三','四','五','六','七','八','九','十'];
  if (n <= 10) return zh[n];
  if (n < 20) return '十' + zh[n-10];
  return String(n);
}

function _guestListHtml(guests) {
  if (!guests.length) {
    const msg = _guestSubTab === 'week'
      ? '本周沒有來賓追蹤紀錄'
      : (_guestSearch ? '找不到符合的來賓' : '目前還沒有來賓資料');
    return `<div class="card" style="padding:40px 24px;text-align:center;color:var(--text-soft);">${msg}</div>`;
  }
  return guests.map(_guestCardHtml).join('');
}

// ===== 新增/編輯 Modal =====
let _guestModalTracks = [];

async function openGuestModal(gKey) {
  // 背景載入會員名單以供邀約/締結人自動提示
  if (!_memberData) fetchMembers();

  let g = null;
  if (gKey) {
    const [year, row] = gKey.split('-').map(Number);
    g = _guestData.find(x => x.year === year && x.sheetRow === row);
    if (!g) { showToast('找不到該來賓'); return; }
  }
  _guestModalTracks = g ? _parseTracks(g.tracks) : [];
  const isEdit = !!g;
  const today = _todayIso();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'guestModal';
  overlay.innerHTML = `<div class="modal-box" onclick="event.stopPropagation()">
    <div class="modal-title">${isEdit ? '編輯來賓' : '新增來賓'}</div>

    <div class="modal-field">
      <div class="modal-label">參訪日</div>
      <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:6px;">
        <label style="display:inline-flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;">
          <input type="radio" name="gm_visitType" value="首次" ${(g?.visitType||'首次')==='首次'?'checked':''}>首次參訪
        </label>
        <label style="display:inline-flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;">
          <input type="radio" name="gm_visitType" value="二次" ${g?.visitType==='二次'?'checked':''}>二次參訪
        </label>
      </div>
      <input class="modal-input" type="date" id="gm_firstVisit" value="${g?.firstVisit || today}">
    </div>
    <div class="modal-row">
      <div class="modal-field" style="flex:1 1 0;min-width:0;">
        <div class="modal-label">狀態</div>
        <select class="modal-input" id="gm_status">
          ${GUEST_STATUSES.map(s => `<option value="${s}" ${g?.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="modal-field" style="flex:1 1 0;min-width:0;">
        <div class="modal-label">入會機率</div>
        <select class="modal-input" id="gm_joinProb">
          ${JOIN_PROBABILITIES.map(p => `<option value="${p}" ${(g?.joinProb||'未評估')===p?'selected':''}>${p}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="modal-row">
      <div class="modal-field" style="flex:3 1 0;min-width:0;">
        <div class="modal-label">姓名 <span style="color:var(--red);">*</span></div>
        <input class="modal-input" type="text" id="gm_name" value="${_escH(g?.name || '')}" placeholder="例：王大明">
      </div>
      <div class="modal-field" style="flex:1 1 0;min-width:0;">
        <div class="modal-label">稱謂</div>
        <select class="modal-input" id="gm_title">
          <option value="" ${!g?.title?'selected':''}>（無）</option>
          <option value="先生" ${g?.title==='先生'?'selected':''}>先生</option>
          <option value="小姐" ${g?.title==='小姐'?'selected':''}>小姐</option>
          <option value="女士" ${g?.title==='女士'?'selected':''}>女士</option>
        </select>
      </div>
    </div>

    <div class="modal-field" style="margin-top:14px;">
      <div class="modal-label">產業別／專長</div>
      <input class="modal-input" type="text" id="gm_industry" value="${_escH(g?.industry || '')}">
    </div>

    <div class="modal-field">
      <div class="modal-label">公司名</div>
      <input class="modal-input" type="text" id="gm_company" value="${_escH(g?.company || '')}">
    </div>

    <div class="modal-field">
      <div class="modal-label">電話</div>
      <input class="modal-input" type="tel" id="gm_phone" value="${_escH(g?.phone || '')}" placeholder="09XX-XXX-XXX">
    </div>

    <div class="modal-field" style="position:relative;">
      <div class="modal-label">邀約人</div>
      <input class="modal-input" type="text" id="gm_inviter" value="${_escH(g?.inviter || '')}" autocomplete="off"
        oninput="_showMemberSuggest('gm_inviter', this.value)"
        onfocus="if(this.value.trim())_showMemberSuggest('gm_inviter', this.value)"
        onblur="setTimeout(()=>_hideMemberSuggest('gm_inviter'), 200)">
      <div id="gm_inviter_suggest" class="member-suggest-box"></div>
    </div>
    <div class="modal-field" style="position:relative;">
      <div class="modal-label">締結人</div>
      <input class="modal-input" type="text" id="gm_closer" value="${_escH(g?.closer || '')}" autocomplete="off"
        oninput="_showMemberSuggest('gm_closer', this.value)"
        onfocus="if(this.value.trim())_showMemberSuggest('gm_closer', this.value)"
        onblur="setTimeout(()=>_hideMemberSuggest('gm_closer'), 200)">
      <div id="gm_closer_suggest" class="member-suggest-box"></div>
    </div>

    <div class="modal-field" style="margin-top:14px;">
      <div class="modal-label">參訪後締結（會後立即評估）</div>
      <textarea class="modal-input" id="gm_postVisit" rows="3" style="resize:vertical;">${_escH(g?.postVisitNote || '')}</textarea>
    </div>

    <!-- 追蹤紀錄 -->
    <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--gray-border);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-size:13px;font-weight:700;color:var(--text);">追蹤紀錄</div>
        <button class="btn" style="padding:6px 12px;font-size:12px;background:var(--red);color:white;" onclick="_addTrackRow()">+ 新增追蹤</button>
      </div>
      <div id="gm_tracksList"></div>
    </div>

    <div class="modal-btns">
      <button class="modal-cancel" onclick="closeGuestModal()">取消</button>
      <button class="modal-save" onclick="saveGuest(${isEdit ? `'${gKey}'` : 'null'})">${isEdit ? '儲存' : '新增'}</button>
    </div>
  </div>`;
  overlay.onclick = closeGuestModal;
  document.body.appendChild(overlay);
  _renderTracksList();
}

function closeGuestModal() {
  const m = document.getElementById('guestModal');
  if (m) m.remove();
  _guestModalTracks = [];
}

function _renderTracksList() {
  const c = document.getElementById('gm_tracksList');
  if (!c) return;
  if (!_guestModalTracks.length) {
    c.innerHTML = `<div style="color:var(--text-soft);font-size:12px;text-align:center;padding:12px;background:#fafbfc;border-radius:6px;">尚無追蹤紀錄</div>`;
    return;
  }
  c.innerHTML = _guestModalTracks.map((t, i) => `
    <div style="padding:10px;background:#fafbfc;border-radius:6px;margin-bottom:8px;">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
        <div style="font-weight:700;color:var(--red);font-size:12px;flex-shrink:0;">第${_zhNum(i+1)}次追蹤</div>
        <input type="date" value="${_escH(t.date || '')}" onchange="_guestModalTracks[${i}].date=this.value" style="flex:1;padding:5px 8px;border:1px solid var(--gray-border);border-radius:4px;font-size:12px;font-family:inherit;">
        <button onclick="_removeTrackRow(${i})" style="flex-shrink:0;padding:4px 10px;font-size:12px;background:white;border:1px solid var(--gray-border);color:#c0392b;border-radius:4px;cursor:pointer;font-family:inherit;">刪除</button>
      </div>
      <textarea oninput="_guestModalTracks[${i}].note=this.value" rows="2" style="width:100%;padding:6px 8px;border:1px solid var(--gray-border);border-radius:4px;font-size:13px;font-family:inherit;resize:vertical;outline:none;box-sizing:border-box;">${_escH(t.note || '')}</textarea>
    </div>`).join('');
}

function _addTrackRow() {
  _guestModalTracks.push({ date: _todayIso(), note: '' });
  _renderTracksList();
}

function _removeTrackRow(i) {
  _guestModalTracks.splice(i, 1);
  _renderTracksList();
}

// 邀約/締結人 自動提示（輸入才跳出、未打字不跳）
function _showMemberSuggest(inputId, value) {
  const box = document.getElementById(inputId + '_suggest');
  if (!box) return;
  const q = (value || '').trim().toLowerCase();
  if (!q || !_memberData || !_memberData.length) { box.style.display = 'none'; return; }
  const matches = _memberData.filter(m => m.name && m.name.toLowerCase().includes(q)).slice(0, 8);
  if (!matches.length) { box.style.display = 'none'; return; }
  box.innerHTML = matches.map(m =>
    `<div class="member-suggest-item" onmousedown="event.preventDefault();_selectMemberSuggest('${inputId}', this.textContent.trim())">${_escH(m.name)}</div>`
  ).join('');
  box.style.display = 'block';
}

function _hideMemberSuggest(inputId) {
  const box = document.getElementById(inputId + '_suggest');
  if (box) box.style.display = 'none';
}

function _selectMemberSuggest(inputId, name) {
  const inp = document.getElementById(inputId);
  if (inp) { inp.value = name; inp.focus(); }
  _hideMemberSuggest(inputId);
}

async function saveGuest(gKey) {
  const name = document.getElementById('gm_name').value.trim();
  if (!name) { showToast('請輸入姓名'); return; }
  const phone = document.getElementById('gm_phone').value.trim();

  // 新增時偵測重複：同姓名（且若兩邊都有電話則需相符）→ 提示改為編輯既有資料
  if (!gKey && Array.isArray(_guestData)) {
    const dupes = _guestData.filter(x => {
      if ((x.name || '').trim() !== name) return false;
      const xp = (x.phone || '').trim();
      if (xp && phone && xp !== phone) return false;
      return true;
    });
    if (dupes.length) {
      dupes.sort((a, b) => (b.firstVisit || '').localeCompare(a.firstVisit || ''));
      const d = dupes[0];
      const ok = confirm(
        `資料庫中已有「${d.name}」` +
        (d.phone ? `（電話 ${d.phone}）` : '') +
        `\n首訪日：${d.firstVisit || '未填'}\n\n` +
        `按「確定」改為編輯該筆既有資料\n按「取消」仍以新來賓建立`
      );
      if (ok) {
        closeGuestModal();
        openGuestModal(`${d.year}-${d.sheetRow}`);
        return;
      }
    }
  }

  const fields = {
    firstVisit:    document.getElementById('gm_firstVisit').value,
    visitType:     document.querySelector('input[name="gm_visitType"]:checked')?.value || '首次',
    inviter:       document.getElementById('gm_inviter').value.trim(),
    closer:        document.getElementById('gm_closer').value.trim(),
    name:          name,
    title:         document.getElementById('gm_title').value,
    industry:      document.getElementById('gm_industry').value.trim(),
    company:       document.getElementById('gm_company').value.trim(),
    phone:         phone,
    postVisitNote: document.getElementById('gm_postVisit').value.trim(),
    status:        document.getElementById('gm_status').value,
    joinProb:      document.getElementById('gm_joinProb').value,
    tracks:        JSON.stringify(_guestModalTracks.filter(t => t.note && t.note.trim()))
  };

  closeGuestModal();

  // 樂觀更新：先改本地資料 + 立即重渲染 + 立即提示，API 在背景同步
  if (Array.isArray(_guestData)) {
    if (gKey) {
      const [year, row] = gKey.split('-').map(Number);
      const idx = _guestData.findIndex(x => x.year === year && x.sheetRow === row);
      if (idx >= 0) _guestData[idx] = { ..._guestData[idx], ...fields };
    } else {
      const yr = Number((fields.firstVisit || _todayIso()).slice(0, 4)) || new Date().getFullYear();
      _guestData.unshift({ ...fields, year: yr, sheetRow: -Date.now(), _pending: true });
    }
    renderGuestTrack();
    showToast(gKey ? '已儲存' : '已新增');
  } else {
    showToast(gKey ? '儲存中...' : '新增中...');
  }

  const payload = { ...fields };
  if (gKey) {
    const [year, row] = gKey.split('-').map(Number);
    payload.action = 'updateGuest';
    payload.year = year;
    payload.sheetRow = row;
  } else {
    payload.action = 'addGuest';
  }

  try {
    await _apiPost(payload);
    if (!gKey) {
      // 新增需要拿到正式 sheetRow，背景重抓但不阻塞 UI
      _guestData = null;
      renderGuestTrack();
    }
  } catch (e) {
    showToast('同步失敗，請重新整理');
    _guestData = null;
    renderGuestTrack();
  }
}

function deleteGuestConfirm(gKey) {
  const [year, row] = gKey.split('-').map(Number);
  const g = _guestData.find(x => x.year === year && x.sheetRow === row);
  if (!g) return;
  if (!confirm(`確定要刪除「${g.name}」？此動作無法還原。`)) return;
  _deleteGuest(year, row);
}

async function _deleteGuest(year, row) {
  // 樂觀刪除：先從本地移除 + 立即重渲染 + 立即提示，API 在背景同步
  if (Array.isArray(_guestData)) {
    _guestData = _guestData.filter(x => !(x.year === year && x.sheetRow === row));
    renderGuestTrack();
    showToast('已刪除');
  } else {
    showToast('刪除中...');
  }
  try {
    await _apiPost({ action: 'deleteGuest', year, sheetRow: row });
  } catch {
    showToast('同步失敗，請重新整理');
    _guestData = null;
    renderGuestTrack();
  }
}

