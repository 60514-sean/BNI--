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

// 手機去前導 0 後比對；空白回傳空字串
function _phoneKey(p) {
  return String(p || '').replace(/\D/g, '').replace(/^0+/, '');
}

// 把同手機的來賓合併成一筆「展示用」物件：以最新（首訪日最大者）為主，想認識/行為合併
function _groupGuestsByPhone(list) {
  const groups = {};
  const ungrouped = [];
  list.forEach(g => {
    const key = _phoneKey(g.phone);
    if (!key) { ungrouped.push(g); return; }
    if (!groups[key]) groups[key] = [];
    groups[key].push(g);
  });
  const merged = [];
  Object.keys(groups).forEach(k => {
    const grp = groups[k];
    grp.sort((a, b) => (a.firstVisit || '').localeCompare(b.firstVisit || ''));
    if (grp.length === 1) {
      merged.push({ ...grp[0], _allRows: grp, _hasSecond: false });
    } else {
      const first = grp[0];
      const last = grp[grp.length - 1];
      merged.push({
        ...last, // 顯示以最新（二訪）為主
        _allRows: grp,
        _hasSecond: true,
        _firstRow: first,
        _secondRow: last,
        // 合併想認識與行為，去重 / 累加
        interestedIn: _mergeInterestRaw(grp.map(x => x.interestedIn)),
        behavior:     _mergeBehaviorRaw(grp.map(x => x.behavior)),
      });
    }
  });
  ungrouped.forEach(g => merged.push({ ...g, _allRows: [g], _hasSecond: false }));
  return merged;
}

function _mergeInterestRaw(jsons) {
  const map = {};
  jsons.forEach(j => {
    _parseInterested(j).forEach(x => {
      if (!x.member) return;
      if (!map[x.member] || (x.date && x.date > (map[x.member].date || ''))) {
        map[x.member] = { member: x.member, date: x.date || '' };
      }
    });
  });
  return JSON.stringify(Object.values(map));
}

function _mergeBehaviorRaw(jsons) {
  const out = { visits: [], phoneClicks: [], webClicks: [], industryJumps: [] };
  jsons.forEach(j => {
    const b = _parseBehavior(j);
    out.visits = out.visits.concat(b.visits);
    out.phoneClicks = out.phoneClicks.concat(b.phoneClicks);
    out.webClicks = out.webClicks.concat(b.webClicks);
    out.industryJumps = out.industryJumps.concat(b.industryJumps);
  });
  return JSON.stringify(out);
}

function _parseInterested(s) {
  if (!s) return [];
  try {
    const arr = typeof s === 'string' ? JSON.parse(s) : s;
    return Array.isArray(arr) ? arr.filter(x => x && x.member) : [];
  } catch { return []; }
}

function _isUnmatchedGuest(g) {
  if (g.inviter && g.inviter.trim()) return false;
  if (_parseInterested(g.interestedIn).length > 0) return true;
  if (_hasBehaviorData(g)) return true;
  // 沒有邀約人 + 追蹤紀錄裡有「QR 自助登記」也算（純瀏覽未產生其他事件的 stub）
  const tracks = _parseTracks(g.tracks);
  return tracks.some(t => /QR\s*自助登記/.test(t.note || ''));
}

// 行為紀錄解析與熱度計算
function _parseBehavior(s) {
  const empty = { visits: [], phoneClicks: [], webClicks: [], industryJumps: [] };
  if (!s) return empty;
  try {
    const obj = typeof s === 'string' ? JSON.parse(s) : s;
    return {
      visits: Array.isArray(obj?.visits) ? obj.visits : [],
      phoneClicks: Array.isArray(obj?.phoneClicks) ? obj.phoneClicks : [],
      webClicks: Array.isArray(obj?.webClicks) ? obj.webClicks : [],
      industryJumps: Array.isArray(obj?.industryJumps) ? obj.industryJumps : []
    };
  } catch { return empty; }
}

// 熱度公式：想認識 ×10 + 撥電話 ×5 + 看官網 ×2 + 產業跳轉 ×1
function _calcHeatScore(g) {
  const interested = _parseInterested(g.interestedIn);
  const beh = _parseBehavior(g.behavior);
  return interested.length * 10 + beh.phoneClicks.length * 5 + beh.webClicks.length * 2 + beh.industryJumps.length;
}

function _heatBadge(score) {
  if (score <= 0) return '';
  let bg = '#f4f6f8', fg = '#666';
  if (score >= 30) { bg = '#fee2e2'; fg = '#991b1b'; }
  else if (score >= 10) { bg = '#fef3c7'; fg = '#92400e'; }
  return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${bg};color:${fg};font-size:11px;font-weight:700;white-space:nowrap;">熱度 ${score}</span>`;
}

function _hasBehaviorData(g) {
  const beh = _parseBehavior(g.behavior);
  return beh.visits.length > 0 || beh.phoneClicks.length > 0 || beh.webClicks.length > 0 || beh.industryJumps.length > 0;
}

// 把事件依指定 key 欄位去重，回傳 [{key, count, latestAt}, ...] 依次數降冪
function _groupByKey(events, keyField) {
  const map = {};
  events.forEach(e => {
    const k = e && e[keyField];
    if (!k) return;
    if (!map[k]) map[k] = { key: k, count: 0, latestAt: '' };
    map[k].count++;
    if (e.at && (!map[k].latestAt || e.at > map[k].latestAt)) {
      map[k].latestAt = e.at;
    }
  });
  return Object.values(map).sort((a, b) => b.count - a.count);
}
// 維持舊呼叫相容
function _groupByMember(events) {
  return _groupByKey(events, 'member').map(x => ({ member: x.key, count: x.count, latestAt: x.latestAt }));
}

function _fmtIsoToShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

function _fmtIsoToTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function _calcVisitStats(visits) {
  let totalMs = 0, lastMs = 0;
  const sorted = visits.slice().sort((a, b) => (b.in || '').localeCompare(a.in || ''));
  sorted.forEach((v, i) => {
    if (!v.in || !v.out) return;
    const d = new Date(v.out) - new Date(v.in);
    if (d > 0) {
      totalMs += d;
      if (i === 0) lastMs = d;
    }
  });
  return { count: visits.length, totalMin: _msToMinText(totalMs), lastMin: _msToMinText(lastMs) };
}

function _msToMinText(ms) {
  if (!ms || ms <= 0) return '0';
  const min = ms / 60000;
  if (min < 1) return '不到 1';
  return String(Math.round(min));
}

function _renderInterestedSection(g) {
  const list = _parseInterested(g?.interestedIn);
  if (!list.length) return '';
  const rows = list.map(x => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px dashed #f5d4cc;">
      <span style="font-size:13px;font-weight:700;color:var(--text);">${_escH(x.member)}</span>
      ${x.date ? `<span style="font-size:11px;color:var(--text-soft);">${_escH(x.date)}</span>` : ''}
    </div>`).join('');
  return `<div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--gray-border);">
    <div style="font-size:13px;font-weight:700;color:#c0392b;margin-bottom:8px;">★ 來賓想認識的會員（${list.length} 位）</div>
    <div style="background:#fff5f3;border:1px solid #f5d4cc;border-radius:8px;overflow:hidden;">${rows}</div>
  </div>`;
}

function _guestLatestDate(g) {
  const rows = g._allRows || [g];
  const dates = [];
  rows.forEach(row => {
    dates.push(_parseDateStr(row.firstVisit));
    _parseTracks(row.tracks).forEach(t => dates.push(_parseDateStr(t.date)));
  });
  const valid = dates.filter(d => d);
  return valid.length ? new Date(Math.max(...valid.map(d => d.getTime()))) : null;
}

const HIGH_POTENTIAL_KEY = '__highPotential__';
const HIGH_POTENTIAL_LABEL = '高機率入會';
function _isHighPotentialGuest(g) {
  return g.joinProb === '高';
}

// localStorage 快取（stale-while-revalidate）：UI 秒顯示舊資料，背景再抓最新
const _GUEST_LS_KEY = 'bni_guest_data_cache_v1';
const _GUEST_LS_TTL_MS = 10 * 60 * 1000; // 10 分鐘以內的舊資料才用

function _loadGuestsFromLS() {
  try {
    const raw = localStorage.getItem(_GUEST_LS_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !Array.isArray(obj.data)) return null;
    if (Date.now() - (obj.t || 0) > _GUEST_LS_TTL_MS) return null;
    return obj.data;
  } catch (e) { return null; }
}
function _saveGuestsToLS(data) {
  try {
    // 過濾 _pending 樂觀更新的暫存項目
    const clean = (data || []).filter(g => !g._pending);
    localStorage.setItem(_GUEST_LS_KEY, JSON.stringify({ data: clean, t: Date.now() }));
  } catch (e) { /* localStorage 滿了就跳過 */ }
}

async function fetchGuests() {
  try {
    const r = await fetch(API_URL + '?action=listGuests&t=' + Date.now());
    const j = await r.json();
    if (!j || j.ok !== true) throw new Error(j?.error || 'fetch failed');
    _guestData = j.data || [];
    _saveGuestsToLS(_guestData);
  } catch (e) {
    _guestData = null;
  }
}

async function renderGuestTrack() {
  const el = document.getElementById('guestTrackContent');
  if (_guestData === null) {
    // stale-while-revalidate：先用 localStorage 舊資料秒顯示，背景重抓
    const cached = _loadGuestsFromLS();
    if (cached) {
      _guestData = cached;
      // 背景刷新：不阻塞 UI
      fetchGuests().then(() => {
        if (_activeTab === 'guest') renderGuestTrack();
      });
    } else {
      el.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text-soft);">載入中...</div>`;
      await fetchGuests();
    }
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
          <button class="btn" style="background:white;border:1.5px solid var(--red);color:var(--red);font-weight:700;" onclick="openGuestImportModal()">匯入 Excel</button>
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
  // 先按手機合併（同手機不同 row 變成一筆「合併視圖」，附帶 _allRows）
  let list = _groupGuestsByPhone(_guestData);
  if (tab === 'all' && _guestSearch) {
    const q = _guestSearch.toLowerCase();
    list = list.filter(g => {
      // 搜尋兩訪的內容
      const rows = g._allRows || [g];
      return rows.some(r =>
        (r.name||'').toLowerCase().includes(q) ||
        (r.industry||'').toLowerCase().includes(q) ||
        (r.inviter||'').toLowerCase().includes(q) ||
        (r.company||'').toLowerCase().includes(q)
      );
    });
  }
  if (tab === 'all' && applyYear && _guestTermFilter) {
    list = list.filter(g => {
      const rows = g._allRows || [g];
      return rows.some(r => _getTermFromDate(r.firstVisit) === _guestTermFilter);
    });
  }
  if (tab === 'week') {
    const { mon, sun } = _weekRange();
    list = list.filter(g => {
      const candidates = [];
      (g._allRows || [g]).forEach(r => {
        candidates.push(_parseDateStr(r.firstVisit));
        _parseTracks(r.tracks).forEach(t => candidates.push(_parseDateStr(t.date)));
      });
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
  // 二訪時 g 為合併視圖：tracks/postVisitNote 等取最新（spread）；想認識/行為已被合併
  const tracks = _parseTracks(g.tracks);
  const interested = _parseInterested(g.interestedIn);
  const unmatched = _isUnmatchedGuest(g);
  const heat = _calcHeatScore(g);
  const hasBeh = _hasBehaviorData(g);
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
  // 編輯/行為按鈕的識別 key：有手機就用手機，沒手機 fallback 用 gKey
  const editArg = g.phone ? g.phone : `${g.year}-${g.sheetRow}`;
  const behKey = (g._hasSecond && g.phone) ? `phone:${g.phone}` : `${g.year}-${g.sheetRow}`;
  const interestedHtml = interested.length
    ? `<div style="margin-top:8px;background:#fff5f3;border:1px solid #f5d4cc;border-radius:6px;padding:8px 10px;font-size:12px;line-height:1.5;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div style="flex:1;min-width:0;">
          <b style="color:#c0392b;">★ 想認識會員：</b>
          <span style="color:var(--text);">${interested.map(x => _escH(x.member)).join('、')}</span>
        </div>
        ${hasBeh ? `<button class="btn" style="padding:5px 12px;font-size:12px;background:white;border:1.5px solid #c0392b;color:#c0392b;font-weight:700;border-radius:6px;flex-shrink:0;" onclick="openGuestBehaviorModal('${_escH(behKey)}')">查看行為紀錄</button>` : ''}
      </div>`
    : (hasBeh ? `<div style="margin-top:8px;display:flex;justify-content:flex-end;">
        <button class="btn" style="padding:5px 12px;font-size:12px;background:white;border:1.5px solid #c0392b;color:#c0392b;font-weight:700;border-radius:6px;" onclick="openGuestBehaviorModal('${_escH(behKey)}')">查看行為紀錄</button>
      </div>` : '');
  // 日期顯示：有二訪則「首訪 X　二訪 Y」，否則「首訪 X」
  const dateLine = g._hasSecond
    ? `首訪 <b style="color:var(--text);">${_escH(g._firstRow.firstVisit)}</b>　二訪 <b style="color:var(--text);">${_escH(g._secondRow.firstVisit)}</b>`
    : (g.firstVisit ? `首訪 <b style="color:var(--text);">${_escH(g.firstVisit)}</b>` : '');
  return `<div class="card" style="padding:14px 16px;margin-bottom:10px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px;">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;">
          <span style="font-size:16px;font-weight:900;color:var(--text);">${_escH(g.name)}</span>
          ${g.title ? `<span style="color:var(--text-soft);font-size:13px;font-weight:500;">${_escH(g.title)}</span>` : ''}
          ${_guestStatusBadge(g.status)}
          ${_joinProbBadge(g.joinProb)}
          ${g._hasSecond ? `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:#dbeafe;color:#1e40af;font-size:11px;font-weight:700;white-space:nowrap;">二訪</span>` : ''}
          ${unmatched ? `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:#fde68a;color:#92400e;font-size:11px;font-weight:700;white-space:nowrap;">未匹配名單</span>` : ''}
          ${_heatBadge(heat)}
        </div>
        <div style="font-size:12px;color:var(--text-soft);margin-top:4px;line-height:1.5;">
          ${g.industry ? `<span>${_escH(g.industry)}</span>` : ''}
          ${g.company ? ` · <span>${_escH(g.company)}</span>` : ''}
        </div>
        ${dateLine ? `<div style="font-size:12px;color:var(--text-soft);margin-top:2px;">${dateLine}</div>` : ''}
        <div style="font-size:12px;color:var(--text-soft);margin-top:2px;">
          ${g.inviter ? `邀約：<b style="color:var(--text);">${_escH(g.inviter)}</b>` : ''}
          ${g.closer ? `　締結：<b style="color:var(--text);">${_escH(g.closer)}</b>` : ''}
          ${g.phone ? `<span class="g-phone"><a href="tel:${_escH(g.phone)}" style="color:var(--red);text-decoration:none;">${_escH(g.phone)}</a></span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        ${g._pending
          ? `<span style="padding:6px 12px;font-size:12px;color:var(--text-soft);background:#f4f6f8;border-radius:6px;">同步中...</span>`
          : `<button class="btn" style="padding:6px 12px;font-size:12px;background:white;border:1px solid var(--gray-border);color:var(--text-soft);" onclick="openGuestModal('${_escH(editArg)}')">編輯</button>`}
      </div>
    </div>
    ${g.postVisitNote ? `<div style="background:#fafbfc;padding:8px 10px;border-radius:6px;font-size:12px;line-height:1.5;margin-top:6px;">
      <b style="color:var(--text-soft);">參訪後締結：</b>${_escH(g.postVisitNote)}
    </div>` : ''}
    ${interestedHtml}
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
let _editingRows = null; // 多訪時為長度 2 的陣列；單訪為 1；新增為 null
let _editingIdx = 0;     // 目前在編輯哪個 row

async function openGuestModal(arg, opts) {
  opts = opts || {};
  if (!_memberData) fetchMembers();

  // 解析 arg → rows
  let rows = null;
  if (arg == null || arg === '' || arg === 'null') {
    rows = null; // 新增
  } else if (typeof arg === 'string' && /^\d{4}-\d+$/.test(arg)) {
    // gKey: year-sheetRow
    const [year, row] = arg.split('-').map(Number);
    const g = _guestData?.find(x => x.year === year && x.sheetRow === row);
    if (!g) { showToast('找不到該來賓'); return; }
    rows = [g];
  } else if (typeof arg === 'string') {
    // 手機 → 撈全部 row
    const key = _phoneKey(arg);
    rows = (_guestData || []).filter(g => _phoneKey(g.phone) === key);
    if (!rows.length) { showToast('找不到該來賓'); return; }
    rows.sort((a, b) => (a.firstVisit || '').localeCompare(b.firstVisit || ''));
  }

  _editingRows = rows;
  _editingIdx = opts.idx != null ? opts.idx : (rows ? rows.length - 1 : 0);
  const g = rows ? rows[_editingIdx] : null;
  _guestModalTracks = g ? _parseTracks(g.tracks) : [];
  const isEdit = !!g;
  const isMulti = !!(rows && rows.length > 1);
  const today = _todayIso();

  // 分頁切換按鈕（兩訪時才出現）
  const tabBarHtml = isMulti ? `
    <div style="display:flex;gap:6px;margin-bottom:14px;padding:3px;background:#f4f6f8;border-radius:8px;">
      ${rows.map((r, i) => `
        <button onclick="_switchGuestEditTab(${i})" style="flex:1;padding:8px 12px;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;${_editingIdx === i ? 'background:white;color:var(--red);box-shadow:0 1px 3px rgba(0,0,0,0.1);' : 'background:transparent;color:var(--text-soft);'}">${i === 0 ? '一訪' : '二訪'}${r.firstVisit ? ` ${_escH(r.firstVisit)}` : ''}</button>
      `).join('')}
    </div>` : '';

  // 標題列 + 刪除按鈕（編輯模式才有）
  const titleText = isEdit
    ? `編輯來賓${g.name ? ' - ' + _escH(g.name) : ''}`
    : '新增來賓';
  const deleteBtnHtml = isEdit
    ? `<button onclick="_deleteGuestFromModal()" style="padding:6px 12px;background:white;border:1.5px solid #e74c3c;color:#e74c3c;border-radius:6px;font-size:13px;cursor:pointer;font-family:inherit;font-weight:600;flex-shrink:0;">${isMulti ? '刪除全部' : '刪除'}</button>`
    : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'guestModal';
  overlay.innerHTML = `<div class="modal-box" onclick="event.stopPropagation()">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;">
      <div class="modal-title" style="margin:0;">${titleText}</div>
      ${deleteBtnHtml}
    </div>
    ${tabBarHtml}

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

    ${_renderInterestedSection(g)}

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
      <button class="modal-save" onclick="_onSaveCurrentTab()">${isEdit ? '儲存' : '新增'}</button>
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
  _editingRows = null;
  _editingIdx = 0;
}

function _switchGuestEditTab(newIdx) {
  if (!_editingRows || newIdx === _editingIdx) return;
  if (!confirm('切換訪次將會丟棄目前未儲存的變更，確定切換？')) return;
  const phone = _editingRows[0] && _editingRows[0].phone;
  const arg = phone || `${_editingRows[_editingIdx].year}-${_editingRows[_editingIdx].sheetRow}`;
  closeGuestModal();
  openGuestModal(arg, { idx: newIdx });
}

function _onSaveCurrentTab() {
  if (!_editingRows || !_editingRows.length) {
    saveGuest(null); // 新增
    return;
  }
  const g = _editingRows[_editingIdx];
  saveGuest(`${g.year}-${g.sheetRow}`);
}

async function _deleteGuestFromModal() {
  if (!_editingRows || !_editingRows.length) return;
  const rows = _editingRows.slice();
  const phone = rows[0].phone;
  const name = rows[0].name || '此來賓';
  const isMulti = rows.length > 1;
  const msg = isMulti
    ? `確定刪除「${name}」？\n\n會一併刪除 ${rows.length} 筆參訪紀錄，無法復原。`
    : `確定刪除「${name}」？\n\n刪除後無法復原。`;
  if (!confirm(msg)) return;
  closeGuestModal();
  // 樂觀更新：先從本地移除
  if (Array.isArray(_guestData)) {
    _guestData = _guestData.filter(g => !rows.some(r => r.year === g.year && r.sheetRow === g.sheetRow));
    renderGuestTrack();
  }
  showToast('刪除中...');
  try {
    if (phone) {
      await _apiPost({ action: 'deleteGuest', phone });
    } else {
      // 沒手機 → 逐筆刪除
      for (const r of rows) {
        await _apiPost({ action: 'deleteGuest', year: r.year, sheetRow: r.sheetRow });
      }
    }
    showToast('已刪除');
    _guestData = null;
    renderGuestTrack();
  } catch (e) {
    showToast('刪除失敗，請重新整理');
    _guestData = null;
    renderGuestTrack();
  }
}

// ===== 來賓行為紀錄彈窗 =====
// arg: "year-sheetRow" 單筆 / "phone:0912..." 多訪合併
function openGuestBehaviorModal(arg) {
  let g = null;
  if (typeof arg === 'string' && arg.startsWith('phone:')) {
    const key = _phoneKey(arg.slice(6));
    const rows = (_guestData || []).filter(x => _phoneKey(x.phone) === key);
    if (!rows.length) { showToast('找不到該來賓'); return; }
    rows.sort((a, b) => (a.firstVisit || '').localeCompare(b.firstVisit || ''));
    const last = rows[rows.length - 1];
    g = {
      ...last,
      interestedIn: _mergeInterestRaw(rows.map(x => x.interestedIn)),
      behavior:     _mergeBehaviorRaw(rows.map(x => x.behavior))
    };
  } else {
    const [year, row] = String(arg).split('-').map(Number);
    g = _guestData?.find(x => x.year === year && x.sheetRow === row);
    if (!g) { showToast('找不到該來賓'); return; }
  }

  const beh = _parseBehavior(g.behavior);
  const interested = _parseInterested(g.interestedIn);
  const heat = _calcHeatScore(g);
  const visitStats = _calcVisitStats(beh.visits);
  const phoneGroups = _groupByMember(beh.phoneClicks);
  const webGroups = _groupByMember(beh.webClicks);
  const industryGroups = _groupByKey(beh.industryJumps, 'industry');

  const visitsSorted = beh.visits.slice().sort((a, b) => (b.in || '').localeCompare(a.in || ''));

  const summaryParts = [];
  summaryParts.push(`<span>造訪 <b>${visitStats.count}</b> 次</span>`);
  summaryParts.push(`<span>累積停留 <b>${visitStats.totalMin}</b> 分</span>`);
  if (visitStats.count > 1) summaryParts.push(`<span>最近停留 <b>${visitStats.lastMin}</b> 分</span>`);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'guestBehaviorModal';
  overlay.innerHTML = `<div class="modal-box" onclick="event.stopPropagation()" style="max-width:520px;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;">
      <div class="modal-title" style="margin:0;">${_escH(g.name)} 的行為紀錄</div>
      ${_heatBadge(heat)}
    </div>

    <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:13px;color:var(--text);padding:10px 12px;background:#fafbfc;border-radius:8px;margin-bottom:16px;">
      ${summaryParts.join('<span style="color:var(--gray-border);">·</span>')}
    </div>

    ${interested.length ? `
      <div style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:700;color:#c0392b;margin-bottom:6px;">★ 想認識的會員（${interested.length}）</div>
        <div style="background:#fff5f3;border:1px solid #f5d4cc;border-radius:8px;overflow:hidden;">
          ${interested.map(x => `
            <div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px dashed #f5d4cc;font-size:13px;">
              <span style="font-weight:700;">${_escH(x.member)}</span>
              ${x.date ? `<span style="color:var(--text-soft);font-size:11px;">${_escH(x.date)}</span>` : ''}
            </div>`).join('')}
        </div>
      </div>` : ''}

    ${phoneGroups.length ? `
      <div style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px;">撥打過電話（共 ${beh.phoneClicks.length} 次）</div>
        <div style="background:#fafbfc;border:1px solid var(--gray-border);border-radius:8px;overflow:hidden;">
          ${phoneGroups.map(p => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px dashed var(--gray-border);font-size:13px;">
              <span><b>${_escH(p.member)}</b><span style="color:var(--text-soft);margin-left:6px;">×${p.count}</span></span>
              <span style="font-size:11px;color:var(--text-soft);">${_escH(_fmtIsoToShort(p.latestAt))}</span>
            </div>`).join('')}
        </div>
      </div>` : ''}

    ${webGroups.length ? `
      <div style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px;">看過官網（共 ${beh.webClicks.length} 次）</div>
        <div style="background:#fafbfc;border:1px solid var(--gray-border);border-radius:8px;overflow:hidden;">
          ${webGroups.map(w => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px dashed var(--gray-border);font-size:13px;">
              <span><b>${_escH(w.member)}</b><span style="color:var(--text-soft);margin-left:6px;">×${w.count}</span></span>
              <span style="font-size:11px;color:var(--text-soft);">${_escH(_fmtIsoToShort(w.latestAt))}</span>
            </div>`).join('')}
        </div>
      </div>` : ''}

    ${industryGroups.length ? `
      <div style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px;">產業鏈跳轉（共 ${beh.industryJumps.length} 次）</div>
        <div style="background:#fafbfc;border:1px solid var(--gray-border);border-radius:8px;overflow:hidden;">
          ${industryGroups.map(x => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px dashed var(--gray-border);font-size:13px;">
              <span><b>${_escH(x.key)}</b><span style="color:var(--text-soft);margin-left:6px;">×${x.count}</span></span>
              <span style="font-size:11px;color:var(--text-soft);">${_escH(_fmtIsoToShort(x.latestAt))}</span>
            </div>`).join('')}
        </div>
      </div>` : ''}

    ${visitsSorted.length ? `
      <div style="margin-bottom:8px;">
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px;">造訪時間軸</div>
        <div style="background:#fafbfc;border:1px solid var(--gray-border);border-radius:8px;overflow:hidden;">
          ${visitsSorted.map(v => {
            const txt = (v.in && v.out) ? _msToMinText(new Date(v.out) - new Date(v.in)) + ' 分' : '進行中';
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px dashed var(--gray-border);font-size:13px;">
              <span>${_escH(_fmtIsoToShort(v.in))} ~ ${_escH(_fmtIsoToTime(v.out))}</span>
              <span style="font-size:11px;color:var(--text-soft);">${_escH(txt)}</span>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}

    ${(!phoneGroups.length && !webGroups.length && !visitsSorted.length && !industryGroups.length) ? `
      <div style="text-align:center;padding:24px;color:var(--text-soft);font-size:13px;">尚無行為資料</div>` : ''}

    <div class="modal-btns" style="margin-top:14px;">
      <button class="modal-cancel" style="width:100%;" onclick="closeGuestBehaviorModal()">關閉</button>
    </div>
  </div>`;
  overlay.onclick = closeGuestBehaviorModal;
  document.body.appendChild(overlay);
}

function closeGuestBehaviorModal() {
  document.getElementById('guestBehaviorModal')?.remove();
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

// ===== 匯入 Excel =====
const SHEETJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let _importParsedGuests = []; // 暫存解析後的待匯入清單

async function openGuestImportModal() {
  showLoader && showLoader(true, '載入匯入模組...');
  try {
    await _loadScript(SHEETJS_CDN);
  } catch (e) {
    showLoader && showLoader(false);
    showToast('套件載入失敗，請確認網路');
    return;
  }
  showLoader && showLoader(false);
  _importParsedGuests = [];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'guestImportModal';
  overlay.innerHTML = `<div class="modal-box" onclick="event.stopPropagation()" style="max-width:640px;">
    <div class="modal-title">匯入來賓（Excel / CSV）</div>
    <div style="font-size:13px;color:var(--text-soft);line-height:1.6;margin-bottom:12px;">
      請先下載範本，填寫資料後上傳。<br>
      <b>姓名</b> 與 <b>電話</b> 為必填；同手機已存在時會自動成為「二訪」紀錄。
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
      <button class="btn" style="background:white;border:1.5px solid var(--gray-border);color:var(--text);font-weight:700;" onclick="_downloadImportTemplate()">下載範本</button>
      <label class="btn" style="background:var(--red);color:white;font-weight:700;cursor:pointer;">
        選擇檔案
        <input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="_handleImportFile(this)">
      </label>
    </div>

    <div id="importPreviewBox" style="display:none;"></div>

    <div class="modal-btns">
      <button class="modal-cancel" onclick="closeGuestImportModal()">關閉</button>
      <button class="modal-save" id="importSubmitBtn" disabled style="opacity:.5;cursor:not-allowed;" onclick="_doImport()">匯入</button>
    </div>
  </div>`;
  overlay.onclick = closeGuestImportModal;
  document.body.appendChild(overlay);
}

function closeGuestImportModal() {
  document.getElementById('guestImportModal')?.remove();
  _importParsedGuests = [];
}

function _downloadImportTemplate() {
  if (!window.XLSX) { showToast('套件未載入'); return; }
  const headers = ['姓名', '電話', '首次參訪', '邀約人', '稱謂', '產業別', '公司名', '參訪後締結', '狀態'];
  const example = ['王大明', '0912345678', '2026-05-13', '陳會員', '先生', 'IT 資訊', '某某公司', '對導入軟體有興趣', '待追蹤'];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws['!cols'] = headers.map(() => ({ wch: 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '來賓清單');
  XLSX.writeFile(wb, 'BNI-來賓匯入範本.xlsx');
}

function _handleImportFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) { showToast('檔案沒有工作表'); return; }
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
      _renderImportPreview(rows);
    } catch (err) {
      showToast('檔案解析失敗，請確認格式');
    }
  };
  reader.readAsArrayBuffer(file);
}

function _normalizeImportDate(v) {
  if (!v) return '';
  const s = String(v).trim();
  // 已是 YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) return s.slice(0, 10);
  // Excel 序號或其他格式 → 嘗試 new Date
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.getFullYear() + '-'
         + String(d.getMonth() + 1).padStart(2, '0') + '-'
         + String(d.getDate()).padStart(2, '0');
  }
  return s;
}

function _renderImportPreview(rows) {
  const box = document.getElementById('importPreviewBox');
  const btn = document.getElementById('importSubmitBtn');
  if (!box) return;
  const today = _todayIso();
  const parsed = rows.map(r => ({
    name:       String(r['姓名'] || r['name'] || '').trim(),
    phone:      String(r['電話'] || r['phone'] || '').trim(),
    firstVisit: _normalizeImportDate(r['首次參訪'] || r['firstVisit'] || '') || today,
    inviter:    String(r['邀約人'] || r['inviter'] || '').trim(),
    title:      String(r['稱謂'] || r['title'] || '').trim(),
    industry:   String(r['產業別'] || r['industry'] || '').trim(),
    company:    String(r['公司名'] || r['company'] || '').trim(),
    postVisitNote: String(r['參訪後締結'] || r['postVisitNote'] || '').trim(),
    status:     String(r['狀態'] || r['status'] || '待追蹤').trim() || '待追蹤'
  }));
  const valid = parsed.filter(g => g.name && g.phone);
  const invalid = parsed.filter(g => !g.name || !g.phone);
  _importParsedGuests = valid;

  if (parsed.length === 0) {
    box.innerHTML = `<div style="padding:12px;background:#fef3c7;color:#92400e;border-radius:6px;font-size:13px;">檔案中沒有可匯入的資料</div>`;
    box.style.display = '';
    btn.disabled = true; btn.style.opacity = '.5'; btn.style.cursor = 'not-allowed';
    return;
  }

  const preview = valid.slice(0, 10);
  const tableHtml = `
    <div style="overflow-x:auto;border:1px solid var(--gray-border);border-radius:6px;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead style="background:#fafbfc;">
          <tr>
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--gray-border);">姓名</th>
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--gray-border);">電話</th>
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--gray-border);">首訪</th>
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--gray-border);">邀約人</th>
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--gray-border);">公司</th>
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--gray-border);">狀態</th>
          </tr>
        </thead>
        <tbody>
          ${preview.map(g => `<tr>
            <td style="padding:6px 8px;border-bottom:1px dashed var(--gray-border);">${_escH(g.name)}</td>
            <td style="padding:6px 8px;border-bottom:1px dashed var(--gray-border);">${_escH(g.phone)}</td>
            <td style="padding:6px 8px;border-bottom:1px dashed var(--gray-border);">${_escH(g.firstVisit)}</td>
            <td style="padding:6px 8px;border-bottom:1px dashed var(--gray-border);">${_escH(g.inviter)}</td>
            <td style="padding:6px 8px;border-bottom:1px dashed var(--gray-border);">${_escH(g.company)}</td>
            <td style="padding:6px 8px;border-bottom:1px dashed var(--gray-border);">${_escH(g.status)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  box.innerHTML = `
    <div style="margin-bottom:8px;font-size:13px;">
      共解析 <b>${parsed.length}</b> 筆，<b style="color:#27ae60;">${valid.length}</b> 筆可匯入${invalid.length ? `，<b style="color:#c0392b;">${invalid.length}</b> 筆缺姓名或電話將略過` : ''}
      ${valid.length > 10 ? `<span style="color:var(--text-soft);">（以下預覽前 10 筆）</span>` : ''}
    </div>
    ${tableHtml}`;
  box.style.display = '';

  if (valid.length > 0) {
    btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer';
  } else {
    btn.disabled = true; btn.style.opacity = '.5'; btn.style.cursor = 'not-allowed';
  }
}

async function _doImport() {
  if (!_importParsedGuests.length) return;
  const guests = _importParsedGuests;
  const btn = document.getElementById('importSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = '匯入中...'; }
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'batchAddGuests', guests })
    });
    const json = await res.json();
    if (!json || !json.ok) throw new Error(json?.error || 'import failed');
    const added = json.added || 0;
    const errs = (json.errors || []).length;
    closeGuestImportModal();
    showToast(`已匯入 ${added} 筆${errs ? `（${errs} 筆失敗）` : ''}`);
    _guestData = null;
    renderGuestTrack();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = '匯入'; }
    showToast('匯入失敗，請重試');
  }
}

