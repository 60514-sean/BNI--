// ===== 簡報排程 =====
// 資料來源：Google Sheet（透過 Apps Script 直讀，無 CSV cache 延遲）
const SCHEDULE_CSV = 'https://docs.google.com/spreadsheets/d/12cGPw7f8L1HxZv6G5H3yKzPYNKNg8jIdzV3gl2sEN_Y/export?format=csv';
const SCHEDULE_API_URL = 'https://script.google.com/macros/s/AKfycbyCbrWCBgRxngzVXB3njoyqZaDrHOIzQ_9Dcvr85BX-HxfDEpjNI-jmpDhsIpTtS9IaMQ/exec';

let _scheduleData = null;
let _scheduleFilterTerm   = '__all__';
let _scheduleFilterYear   = '__all__';
let _scheduleFilterStatus = '__all__';
let _scheduleFilterType   = '__all__';
let _scheduleHistoryOpen  = false;
let _scheduleSuggestOpen  = true;
let _scheduleHistoryTarget = '';

const _SCHED_TYPE_COLORS = {
  '主題簡報': '#27ae60',
  '主題日':   '#e67e22',
  '共識會':   '#7f8c8d',
  'BOD':      '#8e44ad',
  '大商分享': '#16a085',
  '啟動會':   '#2980b9',
  '年會':     '#34495e',
  '暫停':     '#bdc3c7',
};

// 暱稱／替代寫法 → 正式姓名（會員清單裡的拼法為準）
const _NAME_ALIASES = {
  'Stan':   '温智翔',
  '溫智翔': '温智翔',  // 排程用「溫」，會員清單用「温」（不同 Unicode）
  'Happy':  '金萱蓉',
  '小哈':   '蔡忠翰',
  '張毓芠': '張宥瑩',
  '詠宸':   '陳詠宸',  // 短名 → 已離會會員的正式姓名
};

// 已確認的離會會員（不再警示，但仍以淡灰色呈現該列）
const _LEFT_MEMBERS = new Set([
  '賴笙','蘇泓達','陳詠宸','李汶昇','李佳蓉','蘇玲玉','潘穎鈞',
  '黃莉萍','王瑜甄','吳晉魁','吳映瑩','陳森棠','王靖雯',
  '黃若綾','王筱君','顏柏倫','郭宥蓁','黃煒雯',
]);

// ===== 資料解析 =====
function _schedCell(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    return `${v.getMonth()+1}/${v.getDate()}`;
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return `${d.getMonth()+1}/${d.getDate()}`;
  }
  return String(v).trim();
}

function _parseScheduleRows(rows) {
  const out = [];
  let curTerm = '';
  let curYear = 2024;
  let lastMonth = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const c0 = _schedCell(r[0]);
    const c1 = _schedCell(r[1]);
    const c2 = _schedCell(r[2]);
    const c3 = _schedCell(r[3]);
    const c4 = _schedCell(r[4]);
    const c5 = _schedCell(r[5]);
    const c6 = _schedCell(r[6]);

    const tm = c0.match(/(第[一二三四五六七八九十]+屆)/);
    if (tm) { curTerm = tm[1]; continue; }
    const ym = c0.match(/(\d{4})年/);
    if (ym) { curYear = parseInt(ym[1]); lastMonth = 0; continue; }

    if (!c1) continue;
    const dm = c1.match(/(\d{1,2})\/(\d{1,2})/);
    if (!dm) continue;
    const M = parseInt(dm[1]);
    const D = parseInt(dm[2]);

    if (lastMonth > 6 && M <= 2 && lastMonth >= 11) curYear++;
    lastMonth = M;

    const isoDate = `${curYear}-${String(M).padStart(2,'0')}-${String(D).padStart(2,'0')}`;

    const c2Compact = c2.replace(/\s+/g, '');
    let type = '主題簡報';
    let isEmpty = false;
    let isSkip  = false;
    let presenters = [];

    if (/暫停/.test(c0) || /暫停/.test(c2Compact)) { type = '暫停'; isSkip = true; }
    else if (/年會/.test(c2Compact)) { type = '年會'; isSkip = true; }
    else if (/啟動會/.test(c2Compact)) { type = '啟動會'; isSkip = true; }
    else if (/共識會/.test(c2Compact)) { type = '共識會'; isSkip = true; }
    else if (/^BOD/.test(c2Compact) || /^BOD\(/.test(c2Compact)) { type = 'BOD'; isSkip = true; }
    else if (/大商分享/.test(c2Compact)) { type = '大商分享'; isSkip = true; }
    else if (/主題日/.test(c2)) {
      type = '主題日';
      presenters = _extractPresenters(c2);
    } else if (c2) {
      const list = _extractPresenters(c2);
      presenters = list;
      if (list.length >= 2) type = '主題日';
    } else {
      isEmpty = true;
    }

    out.push({
      rowIndex: i,
      term: curTerm,
      year: curYear,
      month: M,
      day: D,
      dateMd: c1,
      dateIso: isoDate,
      weekIndex: c0,
      type, isEmpty, isSkip, presenters,
      count: c3, mentor: c4, deadline: c5, topic: c6,
      raw: { c0, c1, c2, c3, c4, c5, c6 }
    });
  }
  return out;
}

// 清洗 + 切分姓名字串（共用：講者、顧問都用這支）
// 規則：先移除「X/Y出村」、括號內註記，再用各種分隔符切，最後過濾雜訊
function _splitNames(str) {
  if (!str) return [];
  let body = String(str)
    .replace(/\s*\d+\/\d+\s*出村/g, '')
    .replace(/[（(][^（()）]*[)）]/g, '');
  return body
    .split(/[、,，\/／\n\r.]/)
    .map(x => x.replace(/\s+/g, '').trim())
    .filter(x => x && !/^N\/A$/i.test(x) && !/無主題簡報/.test(x) && !/當天壽星/.test(x));
}

function _extractPresenters(s) {
  if (!s) return [];
  let body = s;
  if (/主題日/.test(s)) {
    // 主題日：括號內或破折號後的人名才是講者
    const paren = s.match(/[（(]([^（()）]+)[)）]/);
    if (paren) body = paren[1];
    else {
      const dash = s.match(/[-—–]\s*(.+)$/m);
      if (dash) body = dash[1];
    }
    body = body.replace(/主題日|活動主題日|健康主題日|餐飲主題日|二代接班主題日/g, '');
  }
  return _splitNames(body);
}

// ===== 姓名解析（短名 / 暱稱 → 完整姓名） =====
// _canonicalName：永遠回傳「正式姓名」（即使該人已離會也可解析）
// _matchMemberName：必須在當前會員清單中才回傳，否則 null
// _isLeftMember：true 表示「我知道是誰，但他不在當前會員清單」或「完全不認識」
function _canonicalName(short) {
  if (!short) return '';
  const s = String(short).trim();
  if (!s) return '';
  const aliased = _NAME_ALIASES[s] || s;
  if (!_memberData || !_memberData.length) return aliased;
  const exact = _memberData.find(x => x.name === aliased);
  if (exact) return exact.name;
  const ends = _memberData.filter(x => x.name.endsWith(aliased));
  if (ends.length === 1) return ends[0].name;
  const contains = _memberData.filter(x => x.name.includes(aliased));
  if (contains.length === 1) return contains[0].name;
  return aliased; // 保持 alias 後的全名（即使非當前會員）
}
function _matchMemberName(short) {
  const canon = _canonicalName(short);
  if (!canon || !_memberData || !_memberData.length) return null;
  return _memberData.find(x => x.name === canon) ? canon : null;
}
function _resolvedName(short) { return _canonicalName(short) || short || ''; }
function _isLeftMember(short) {
  if (!short || !_memberData || !_memberData.length) return false;
  return _matchMemberName(short) === null;
}
function _displayType(t) { return t === '共識會' ? '共識會議' : t; }

function _autoDetectCount(name, beforeDateIso) {
  if (!name || !_scheduleData) return '';
  const target = _canonicalName(name) || name;
  const count = _scheduleData.filter(x => {
    if (x.isEmpty || x.isSkip) return false;
    if (x.dateIso >= beforeDateIso) return false;
    if (x.type !== '主題簡報' && x.type !== '主題日') return false;
    return x.presenters.some(p => _canonicalName(p) === target);
  }).length;
  return String(count + 1);
}

function _collectUnmatchedNames() {
  if (!_memberData || !_memberData.length) return [];
  const map = new Map();
  const add = (name, kind, dateIso) => {
    if (_NAME_ALIASES[name]) return;             // 已知 alias
    if (_matchMemberName(name)) return;          // 在當前會員清單
    const canon = _canonicalName(name);
    if (canon && _LEFT_MEMBERS.has(canon)) return; // 已知離會會員
    if (!map.has(name)) map.set(name, { name, presenter: 0, mentor: 0, lastDate: null });
    const v = map.get(name);
    v[kind]++;
    if (!v.lastDate || dateIso > v.lastDate) v.lastDate = dateIso;
  };
  _scheduleData.forEach(x => {
    x.presenters.forEach(p => { if (p) add(p, 'presenter', x.dateIso); });
    if (x.mentor) _splitNames(x.mentor).forEach(m => add(m, 'mentor', x.dateIso));
  });
  return [...map.values()];
}

// ===== 載入 =====
async function fetchSchedule() {
  document.getElementById('scheduleContent').innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text-soft);">載入中...</div>`;
  try {
    let rows;
    if (SCHEDULE_API_URL) {
      const r = await fetch(`${SCHEDULE_API_URL}?action=getSchedule&t=${Date.now()}`, { signal: AbortSignal.timeout(20000) });
      const json = await r.json();
      if (!json.ok) throw new Error(json.error || 'getSchedule failed');
      rows = json.rows || [];
    } else {
      const r = await fetch(SCHEDULE_CSV + '&t=' + Date.now());
      rows = _parseCSV(await r.text());
    }
    _scheduleData = _parseScheduleRows(rows);
  } catch(e) {
    _scheduleData = null;
  }
}

// ===== 渲染入口 =====
async function renderSchedule() {
  const el = document.getElementById('scheduleContent');
  if (_scheduleData === null) await fetchSchedule();
  if (!_scheduleData) {
    el.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--red);">
      載入失敗 <button class="btn" style="margin-left:12px;background:var(--red);color:white;" onclick="_scheduleData=null;renderSchedule()">重試</button>
    </div>`;
    return;
  }
  if (!_memberData) await fetchMembers();

  el.innerHTML = `<div class="sched-wrap" style="padding:14px 12px 60px;">
    ${_schedHeaderHtml()}
    ${_schedUnmatchedHtml()}
    ${_schedSuggestHtml()}
    ${_schedStatsHtml()}
    ${_schedFilterHtml()}
    <div id="schedTableHost">${_schedTableHtml()}</div>
    <div id="schedHistoryHost">${_schedHistoryHtml()}</div>
  </div>
  <style>${_schedStyles()}</style>`;
}

function _schedHeaderHtml() {
  const canEdit = _canEditTab('schedule');
  const editTag = canEdit
    ? `<span style="background:#27ae60;color:white;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;">可編輯</span>`
    : `<span style="background:#bdc3c7;color:white;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;">唯讀</span>`;
  return `<div class="card" style="padding:14px 18px;margin-bottom:12px;">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="font-size:17px;font-weight:900;color:var(--text);">簡報排程</div>
          ${editTag}
        </div>
        <div style="font-size:11px;color:var(--text-soft);margin-top:3px;">資料來源：Google Sheet · 共 ${_scheduleData.length} 筆</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="_schedJumpToToday()" style="padding:7px 14px;font-size:12px;">跳到本週</button>
        <button class="btn" style="padding:7px 14px;font-size:12px;background:white;border:1.5px solid var(--gray-border);color:var(--text-soft);" onclick="_schedExportCsv()">匯出 CSV</button>
        <button class="btn" style="padding:7px 14px;font-size:12px;background:white;border:1.5px solid var(--gray-border);color:var(--text-soft);" onclick="_scheduleData=null;renderSchedule()">重整</button>
      </div>
    </div>
  </div>`;
}

// ===== 無法判定姓名警示 =====
function _schedUnmatchedHtml() {
  if (!_memberData || !_memberData.length) return '';
  const list = _collectUnmatchedNames();
  if (list.length === 0) return '';
  const items = list.sort((a,b) => (b.presenter+b.mentor) - (a.presenter+a.mentor)).map(u => {
    const detail = [
      u.presenter ? `講者×${u.presenter}` : '',
      u.mentor    ? `顧問×${u.mentor}`    : '',
    ].filter(Boolean).join(' · ');
    return `<span class="sched-unmatched-pill" title="最近：${u.lastDate||''}">${_escH(u.name)} <span style="opacity:.7;font-weight:400;">${detail}</span></span>`;
  }).join('');
  return `<div class="card" style="padding:10px 14px;margin-bottom:10px;background:#fff5e1;border:1.5px solid #e67e22;">
    <div style="font-size:12px;font-weight:900;color:#923f00;margin-bottom:4px;">無法判定的姓名（${list.length}）</div>
    <div style="font-size:11px;color:#7c3a00;margin-bottom:6px;line-height:1.5;">下列姓名在現有會員清單中無法唯一比對，可能是已離會、暱稱、或非會員講者。請在編輯時改為完整姓名（會自動同步至 Sheet）。</div>
    <div>${items}</div>
  </div>`;
}

// ===== 統計卡 =====
function _schedStatsHtml() {
  const list = _schedFiltered();
  const total = list.length;
  const scheduled = list.filter(x => !x.isEmpty && !x.isSkip).length;
  const empty = list.filter(x => x.isEmpty).length;
  const special = list.filter(x => x.isSkip).length;
  const upcoming = list.filter(x => !x.isEmpty && !x.isSkip && _daysUntil(x.dateIso) >= 0 && _daysUntil(x.dateIso) <= 56).length;
  const stat = (n, l, c) => `<div style="flex:1;min-width:90px;text-align:center;padding:10px 6px;background:white;border:1.5px solid var(--gray-border);border-radius:10px;">
    <div style="font-size:22px;font-weight:900;color:${c};">${n}</div>
    <div style="font-size:11px;color:var(--text-soft);margin-top:2px;">${l}</div>
  </div>`;
  return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
    ${stat(total, '總場次', 'var(--text)')}
    ${stat(scheduled, '已排定', '#27ae60')}
    ${stat(empty, '空缺', '#c0392b')}
    ${stat(upcoming, '8 週內', '#e67e22')}
    ${stat(special, '特殊日', '#7f8c8d')}
  </div>`;
}

// ===== 待排建議 =====
function _schedSuggestHtml() {
  const today = _todayIso();
  const empties = _scheduleData
    .filter(x => x.isEmpty && x.dateIso >= today)
    .sort((a,b) => a.dateIso.localeCompare(b.dateIso))
    .slice(0, 8);

  if (empties.length === 0) {
    return `<div class="card" style="padding:12px 16px;margin-bottom:10px;background:#e8f5ec;border:1.5px solid #27ae60;">
      <div style="font-size:13px;font-weight:700;color:#27ae60;">未來日期已排滿，無待排建議</div>
    </div>`;
  }

  const suggestions = empties.map(slot => {
    const recs = _recommendPresenters(slot, 3);
    const recTags = recs.length
      ? recs.map(r => `<span class="sched-rec-pill" title="上次：${r.lastDate || '從未'} · 累積：${r.count} 次">${_escH(r.name)} <span style="opacity:.7;">${r.lastDate ? `${r.weeksAgo}週前` : '新人'}</span></span>`).join('')
      : `<span style="font-size:11px;color:var(--text-soft);">無候選</span>`;
    const weeks = Math.max(0, Math.round(_daysUntil(slot.dateIso) / 7));
    return `<div class="sched-slot-row">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <div style="font-weight:900;font-size:14px;color:var(--text);min-width:60px;">${slot.dateMd}</div>
        <div style="font-size:11px;color:var(--text-soft);">${slot.year}年 · 距今 ${weeks} 週</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">${recTags}</div>
    </div>`;
  }).join('');

  const arrow = _scheduleSuggestOpen ? '▼' : '▶';
  return `<div class="card" style="padding:0;margin-bottom:10px;overflow:hidden;border:1.5px solid #c0392b;">
    <div style="padding:12px 16px;background:#fef0ee;cursor:pointer;display:flex;align-items:center;justify-content:space-between;" onclick="_scheduleSuggestOpen=!_scheduleSuggestOpen;renderSchedule()">
      <div>
        <div style="font-size:13px;font-weight:900;color:#c0392b;">待排建議（${empties.length} 個空缺）</div>
        <div style="font-size:11px;color:var(--text-soft);margin-top:2px;">依「最久未簡報 + 累積次數最少」排序推薦</div>
      </div>
      <div style="font-size:14px;color:#c0392b;">${arrow}</div>
    </div>
    ${_scheduleSuggestOpen ? `<div style="padding:8px 12px;background:white;">${suggestions}</div>` : ''}
  </div>`;
}

function _recommendPresenters(slot, n) {
  if (!_memberData || !_memberData.length) return [];
  const today = _todayIso();
  const stats = _scheduleMemberStats();
  const candidates = _memberData.map(m => {
    const s = stats[m.name] || { count: 0, lastDate: null, weeksAgo: 9999 };
    return { name: m.name, industry: m.industry, count: s.count, lastDate: s.lastDate, weeksAgo: s.weeksAgo };
  });
  const futureNames = new Set(_scheduleData
    .filter(x => !x.isEmpty && !x.isSkip && x.dateIso >= today && x.dateIso <= slot.dateIso)
    .flatMap(x => x.presenters.map(p => _resolvedName(p))));
  return candidates
    .filter(c => !futureNames.has(c.name))
    .sort((a,b) => (b.weeksAgo - a.weeksAgo) || (a.count - b.count))
    .slice(0, n);
}

function _scheduleMemberStats() {
  const today = _todayIso();
  const map = {};
  _scheduleData.forEach(x => {
    if (x.isEmpty || x.isSkip) return;
    if (x.dateIso > today) return;
    x.presenters.forEach(name => {
      if (!name) return;
      const key = _resolvedName(name);
      if (!map[key]) map[key] = { count: 0, lastDate: null, history: [] };
      map[key].count++;
      map[key].history.push(x);
      if (!map[key].lastDate || x.dateIso > map[key].lastDate) map[key].lastDate = x.dateIso;
    });
  });
  Object.keys(map).forEach(k => {
    const s = map[k];
    s.weeksAgo = s.lastDate ? Math.floor(_daysBetween(s.lastDate, today) / 7) : 9999;
  });
  return map;
}

// ===== 篩選列 =====
function _schedFilterHtml() {
  const terms = ['__all__', ...new Set(_scheduleData.map(x => x.term).filter(Boolean))];
  const years = ['__all__', ...new Set(_scheduleData.map(x => x.year))].sort();
  const types = ['__all__','主題簡報','主題日','共識會','BOD','大商分享','啟動會','年會','暫停'];
  const opts = (arr, cur) => arr.map(v => {
    const label = v === '__all__' ? '全部' : _displayType(v);
    return `<option value="${v}" ${v===cur?'selected':''}>${label}</option>`;
  }).join('');
  return `<div class="card" style="padding:12px 14px;margin-bottom:10px;">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;">
      <div>
        <div style="font-size:10px;color:var(--text-soft);font-weight:600;margin-bottom:3px;">屆別</div>
        <select class="sched-fl" onchange="_scheduleFilterTerm=this.value;_schedRefreshTable()">${opts(terms, _scheduleFilterTerm)}</select>
      </div>
      <div>
        <div style="font-size:10px;color:var(--text-soft);font-weight:600;margin-bottom:3px;">年份</div>
        <select class="sched-fl" onchange="_scheduleFilterYear=this.value;_schedRefreshTable()">${opts(years, _scheduleFilterYear)}</select>
      </div>
      <div>
        <div style="font-size:10px;color:var(--text-soft);font-weight:600;margin-bottom:3px;">狀態</div>
        <select class="sched-fl" onchange="_scheduleFilterStatus=this.value;_schedRefreshTable()">
          <option value="__all__" ${_scheduleFilterStatus==='__all__'?'selected':''}>全部</option>
          <option value="scheduled" ${_scheduleFilterStatus==='scheduled'?'selected':''}>已排定</option>
          <option value="empty" ${_scheduleFilterStatus==='empty'?'selected':''}>未排定</option>
          <option value="special" ${_scheduleFilterStatus==='special'?'selected':''}>特殊日</option>
          <option value="future" ${_scheduleFilterStatus==='future'?'selected':''}>未來</option>
        </select>
      </div>
      <div>
        <div style="font-size:10px;color:var(--text-soft);font-weight:600;margin-bottom:3px;">類型</div>
        <select class="sched-fl" onchange="_scheduleFilterType=this.value;_schedRefreshTable()">${opts(types, _scheduleFilterType)}</select>
      </div>
    </div>
  </div>`;
}

function _schedFiltered() {
  const today = _todayIso();
  return _scheduleData.filter(x => {
    if (_scheduleFilterTerm   !== '__all__' && x.term !== _scheduleFilterTerm) return false;
    if (_scheduleFilterYear   !== '__all__' && String(x.year) !== String(_scheduleFilterYear)) return false;
    if (_scheduleFilterStatus === 'scheduled' && (x.isEmpty || x.isSkip)) return false;
    if (_scheduleFilterStatus === 'empty'     && !x.isEmpty) return false;
    if (_scheduleFilterStatus === 'special'   && !x.isSkip)  return false;
    if (_scheduleFilterStatus === 'future'    && x.dateIso < today) return false;
    if (_scheduleFilterType   !== '__all__' && x.type !== _scheduleFilterType) return false;
    return true;
  });
}

function _schedRefreshTable() {
  document.getElementById('schedTableHost').innerHTML = _schedTableHtml();
}

// ===== 主表格 =====
function _schedTableHtml() {
  const list = _schedFiltered();
  if (!list.length) return `<div class="card" style="padding:24px;text-align:center;color:var(--text-soft);font-size:13px;">沒有符合條件的紀錄</div>`;
  const today = _todayIso();
  const canEdit = _canEditTab('schedule');

  const rowHtml = (x) => {
    const typeColor = _SCHED_TYPE_COLORS[x.type] || '#7f8c8d';
    const isPast = x.dateIso < today;
    const isToday = x.dateIso === today;
    const isPaused = x.type === '暫停';
    const dl = x.deadline ? _normalizeDeadline(x.deadline, x.year) : null;
    const daysToDeadline = dl ? _daysUntil(dl) : null;
    const deadlineWarn = daysToDeadline !== null && daysToDeadline >= 0 && daysToDeadline <= 7;

    // 講者（多位上下排列）
    let presenterTxt;
    if (x.isEmpty) {
      presenterTxt = `<span style="color:#c0392b;font-weight:700;white-space:nowrap;">— 待排定 —</span>`;
    } else if (x.isSkip && x.presenters.length === 0) {
      presenterTxt = `<span style="color:var(--text-soft);">—</span>`;
    } else {
      presenterTxt = x.presenters.map(p => {
        const full = _resolvedName(p);
        const left = _isLeftMember(p);
        return `<div><span class="sched-name${left?' is-left':''}" onclick="_schedShowMemberHistory('${_escH(full)}')">${_escH(full)}</span></div>`;
      }).join('');
    }

    // 顧問（多位上下排列；同人去重；個別離會單獨灰色＋刪除線）
    const mentorRaw = _splitNames(x.mentor);
    const seenM = new Set();
    const mentorItems = [];
    mentorRaw.forEach(m => {
      const full = _resolvedName(m);
      if (seenM.has(full)) return;
      seenM.add(full);
      mentorItems.push({ full, left: _isLeftMember(m) });
    });
    const mentorTxt = mentorItems.length
      ? mentorItems.map(u => `<div><span class="sched-mentor${u.left?' is-left':''}">${_escH(u.full)}</span></div>`).join('')
      : '<span style="color:var(--text-soft);">—</span>';

    // 主題（主題日可能 ｜ 分隔）
    let topicTxt;
    if (x.topic && x.topic !== 'N/A') {
      const parts = (x.type === '主題日') ? x.topic.split(/[｜|]/).map(s => s.trim()).filter(Boolean) : [x.topic];
      topicTxt = parts.length > 1
        ? parts.map(p => `<div>${_escH(p)}</div>`).join('')
        : _escH(parts[0] || '');
    } else {
      topicTxt = '<span style="color:var(--text-soft);">—</span>';
    }

    const statusBadge = x.isEmpty
      ? `<span class="sched-status" style="color:#c0392b;font-weight:700;">空缺</span>`
      : (isToday ? `<span class="sched-status" style="color:#e67e22;font-weight:700;">本週</span>`
        : (isPast ? `<span class="sched-status" style="color:var(--text-soft);">已完成</span>` : `<span class="sched-status" style="color:#27ae60;font-weight:700;">已排定</span>`));

    const editBtn = canEdit ? `<button class="sched-edit-btn" onclick="_schedOpenEdit(${x.rowIndex})">編輯</button>` : '';

    // 已離會：所有講者均不在當前會員清單內（且不是空缺/特殊日）
    const allLeft = !x.isEmpty && !x.isSkip && x.presenters.length > 0 && x.presenters.every(p => _isLeftMember(p));
    const trClasses = [];
    if (x.isEmpty) trClasses.push('is-empty');
    if (isToday) trClasses.push('is-today');
    if (isPaused) trClasses.push('is-paused');
    if (allLeft)  trClasses.push('is-left-row');

    return `<tr class="${trClasses.join(' ')}">
      <td><div class="sched-term-bar" style="background:${typeColor};" title="${_displayType(x.type)}"></div></td>
      <td>
        <div style="font-weight:900;font-size:13px;color:var(--text);white-space:nowrap;">${x.dateMd}</div>
        <div style="font-size:10px;color:var(--text-soft);">${x.year}</div>
      </td>
      <td>${statusBadge}</td>
      <td><span class="sched-type-text">${_displayType(x.type)}</span></td>
      <td>${presenterTxt}</td>
      <td>${mentorTxt}</td>
      <td>${x.deadline ? `<span class="sched-deadline ${deadlineWarn?'warn':''}">${_escH(x.deadline)}${deadlineWarn?` (${daysToDeadline}天)`:''}</span>` : '<span style="color:var(--text-soft);">—</span>'}</td>
      <td style="font-size:12px;color:var(--text);">${topicTxt}</td>
      <td>${editBtn}</td>
    </tr>`;
  };

  return `<div class="card" style="padding:0;overflow:hidden;">
    <div class="sched-table-wrap">
      <table class="sched-table">
        <thead>
          <tr>
            <th style="width:6px;"></th>
            <th>日期</th>
            <th>狀態</th>
            <th>類型</th>
            <th>簡報者</th>
            <th>顧問</th>
            <th>截稿日</th>
            <th>主題</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${list.map(rowHtml).join('')}</tbody>
      </table>
    </div>
  </div>`;
}

// ===== 會員簡報歷史 =====
function _schedHistoryHtml() {
  if (!_memberData || !_memberData.length) {
    return `<div class="card" style="padding:14px;margin-top:10px;color:var(--text-soft);font-size:12px;">會員資料尚未載入，無法計算簡報歷史</div>`;
  }
  const stats = _scheduleMemberStats();
  const list = _memberData.map(m => ({
    name: m.name, industry: m.industry,
    ...(stats[m.name] || { count: 0, lastDate: null, weeksAgo: 9999, history: [] })
  })).sort((a,b) => (b.weeksAgo - a.weeksAgo) || (a.count - b.count));

  const rows = list.map(s => {
    const lastTxt = s.lastDate ? `${s.lastDate}（${s.weeksAgo} 週前）` : `<span style="color:#c0392b;font-weight:700;">尚未簡報</span>`;
    const flag = s.weeksAgo >= 24
      ? '<span class="sched-flag" style="background:#ef4444;"></span>'
      : s.weeksAgo >= 12
      ? '<span class="sched-flag" style="background:#f59e0b;"></span>'
      : '';
    const isOpen = _scheduleHistoryTarget === s.name;
    const histRows = isOpen && s.history && s.history.length
      ? `<tr class="sched-hist-detail-row"><td colspan="5" style="padding:0;">
          <div style="background:#f9fafb;padding:8px 14px;">
            ${s.history.sort((a,b)=>b.dateIso.localeCompare(a.dateIso)).map(h => `
              <div style="display:flex;gap:10px;padding:5px 0;border-bottom:1px dashed var(--gray-border);font-size:11px;">
                <span style="font-weight:700;min-width:55px;">${h.dateMd}</span>
                <span style="color:var(--text-soft);min-width:30px;">第${h.count||'?'}次</span>
                <span style="color:var(--text-soft);min-width:60px;">顧問：${_escH(_resolvedName(_splitNames(h.mentor)[0])||'—')}</span>
                <span style="color:var(--text);">${_escH(h.topic||'')}</span>
              </div>
            `).join('')}
          </div>
        </td></tr>` : '';
    return `<tr class="sched-hist-row" onclick="_schedToggleHistory('${_escH(s.name)}')">
      <td>${_escH(s.name)} ${flag}</td>
      <td>${_escH(s.industry||'—')}</td>
      <td style="text-align:center;font-weight:700;">${s.count}</td>
      <td>${lastTxt}</td>
      <td style="text-align:center;color:var(--text-soft);font-size:11px;">${isOpen?'▼':'▶'}</td>
    </tr>${histRows}`;
  }).join('');

  const arrow = _scheduleHistoryOpen ? '▼' : '▶';
  return `<div class="card" style="padding:0;margin-top:12px;overflow:hidden;">
    <div style="padding:12px 16px;background:var(--gray-light);cursor:pointer;display:flex;align-items:center;justify-content:space-between;" onclick="_schedToggleHistoryOpen()">
      <div>
        <div style="font-size:13px;font-weight:900;color:var(--text);">會員簡報歷史</div>
        <div style="font-size:11px;color:var(--text-soft);margin-top:2px;">依「最久未簡報」排序 · 點會員列展開歷次紀錄</div>
      </div>
      <div style="font-size:14px;color:var(--text-soft);">${arrow}</div>
    </div>
    ${_scheduleHistoryOpen ? `<div class="sched-table-wrap" style="max-height:60vh;overflow-y:auto;">
      <table class="sched-table sched-hist-table">
        <thead><tr><th>會員</th><th>產業</th><th style="text-align:center;">累積次數</th><th>上次簡報</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>` : ''}
  </div>`;
}

function _schedRefreshHistory() {
  const host = document.getElementById('schedHistoryHost');
  if (host) host.innerHTML = _schedHistoryHtml();
}
function _schedToggleHistoryOpen() {
  _scheduleHistoryOpen = !_scheduleHistoryOpen;
  _schedRefreshHistory();
}
function _schedToggleHistory(name) {
  _scheduleHistoryTarget = (_scheduleHistoryTarget === name) ? '' : name;
  _schedRefreshHistory();
}
function _schedShowMemberHistory(name) {
  _scheduleHistoryOpen = true;
  _scheduleHistoryTarget = name;
  _schedRefreshHistory();
  setTimeout(() => {
    document.querySelectorAll('.sched-hist-row').forEach(r => {
      if (r.textContent.startsWith(name)) r.scrollIntoView({behavior:'smooth', block:'center'});
    });
  }, 100);
}

// ===== 編輯 modal =====
function _schedOpenEdit(rowIdx) {
  if (!_canEditTab('schedule')) { showToast('無編輯權限'); return; }
  const item = _scheduleData.find(x => x.rowIndex === rowIdx);
  if (!item) return;
  const memberOpts = (_memberData || []).map(m => `<option value="${_escH(m.name)}">`).join('');
  const noBackend = !SCHEDULE_API_URL;

  const sp1 = _resolvedName(item.presenters[0] || '');
  const sp2 = _resolvedName(item.presenters[1] || '');
  const mentorList = _splitNames(item.mentor);
  const me1 = _resolvedName(mentorList[0] || '');
  const me2 = _resolvedName(mentorList[1] || '');
  const topicParts = item.topic && item.topic !== 'N/A'
    ? item.topic.split(/[｜|]/).map(s => s.trim()) : [];
  const tp1 = topicParts[0] || '';
  const tp2 = topicParts[1] || '';

  const autoCount = sp1 ? _autoDetectCount(sp1, item.dateIso) : '';
  const initCount = (item.count && item.count !== 'N/A') ? item.count : autoCount;

  const isPaused = item.type === '暫停';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'schedEditModal';
  overlay.innerHTML = `<div class="modal-box" style="max-width:540px;max-height:90vh;overflow-y:auto;">
    <div class="modal-title">編輯簡報安排（${_escH(item.dateMd)} ${item.year}）</div>
    ${noBackend ? `<div style="background:#fff5e1;border:1.5px solid #e67e22;padding:8px 12px;border-radius:8px;font-size:11px;color:#923f00;margin-bottom:12px;">尚未設定寫入端點，當前修改不會寫回 Sheet。</div>` : ''}

    <div style="margin-bottom:10px;">
      <div class="se-lbl">類型</div>
      <select id="se_type" class="modal-input" style="font-size:14px;" onchange="_schedToggleEditBlocks()">
        <option value="主題簡報" ${item.type==='主題簡報'?'selected':''}>主題簡報</option>
        <option value="主題日"   ${item.type==='主題日'?'selected':''}>主題日</option>
        <option value="共識會"   ${item.type==='共識會'?'selected':''}>共識會議</option>
        <option value="BOD"      ${item.type==='BOD'?'selected':''}>BOD</option>
        <option value="暫停"     ${item.type==='暫停'?'selected':''}>暫停</option>
      </select>
    </div>

    <datalist id="se_member_list">${memberOpts}</datalist>

    <div id="se_speaker_block" style="display:${isPaused?'none':''};">
      <div class="se-block-title">講者 1</div>
      <div style="display:grid;grid-template-columns:1fr 90px;gap:8px;margin-bottom:6px;">
        <div>
          <div class="se-lbl">姓名</div>
          <input id="se_speaker1" class="modal-input" type="text" value="${_escH(sp1)}" list="se_member_list" oninput="_schedRecountAuto(${rowIdx})" style="font-size:14px;">
        </div>
        <div>
          <div class="se-lbl">次數</div>
          <input id="se_count" class="modal-input" type="text" value="${_escH(initCount)}" placeholder="自動" style="font-size:14px;text-align:center;">
        </div>
      </div>
      <div style="margin-bottom:6px;">
        <div class="se-lbl">主題</div>
        <textarea id="se_topic1" class="modal-input" rows="2" style="font-size:14px;resize:none;">${_escH(tp1)}</textarea>
      </div>
      <div style="margin-bottom:10px;">
        <div class="se-lbl">顧問</div>
        <input id="se_mentor1" class="modal-input" type="text" value="${_escH(me1)}" list="se_member_list" style="font-size:14px;">
      </div>

      <div id="se_speaker2_block" style="border-top:1px dashed var(--gray-border);padding-top:10px;">
        <div class="se-block-title">講者 2</div>
        <div style="margin-bottom:6px;">
          <div class="se-lbl">姓名</div>
          <input id="se_speaker2" class="modal-input" type="text" value="${_escH(sp2)}" list="se_member_list" style="font-size:14px;">
        </div>
        <div style="margin-bottom:6px;">
          <div class="se-lbl">主題</div>
          <textarea id="se_topic2" class="modal-input" rows="2" style="font-size:14px;resize:none;">${_escH(tp2)}</textarea>
        </div>
        <div style="margin-bottom:10px;">
          <div class="se-lbl">顧問</div>
          <input id="se_mentor2" class="modal-input" type="text" value="${_escH(me2)}" list="se_member_list" style="font-size:14px;">
        </div>
      </div>
    </div>

    <div style="margin-bottom:14px;border-top:1px solid var(--gray-border);padding-top:10px;">
      <div class="se-lbl">截稿日（共用）</div>
      <input id="se_deadline" class="modal-input" type="text" value="${_escH(item.deadline)}" placeholder="例：4/8" style="font-size:14px;">
    </div>

    <div style="display:flex;gap:8px;">
      <button class="btn btn-primary" style="flex:1;" onclick="_schedSaveEdit(${rowIdx})">儲存</button>
      <button class="btn btn-secondary" onclick="document.getElementById('schedEditModal').remove()">取消</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}

function _schedToggleEditBlocks() {
  const t = document.getElementById('se_type')?.value;
  const isPaused = t === '暫停';
  const speaker = document.getElementById('se_speaker_block');
  if (speaker) speaker.style.display = isPaused ? 'none' : '';
}

function _schedRecountAuto(rowIdx) {
  const item = _scheduleData.find(x => x.rowIndex === rowIdx);
  if (!item) return;
  const inp = document.getElementById('se_speaker1');
  const cnt = document.getElementById('se_count');
  if (!inp || !cnt) return;
  const name = inp.value.trim();
  if (!name) { cnt.value = ''; return; }
  cnt.value = _autoDetectCount(name, item.dateIso);
}

async function _schedSaveEdit(rowIdx) {
  const item = _scheduleData.find(x => x.rowIndex === rowIdx);
  if (!item) return;
  const type = document.getElementById('se_type').value;
  const sp1 = (document.getElementById('se_speaker1')?.value || '').trim();
  const sp2 = (document.getElementById('se_speaker2')?.value || '').trim();
  const me1 = (document.getElementById('se_mentor1')?.value || '').trim();
  const me2 = (document.getElementById('se_mentor2')?.value || '').trim();
  const tp1 = (document.getElementById('se_topic1')?.value || '').trim();
  const tp2 = (document.getElementById('se_topic2')?.value || '').trim();
  const count = (document.getElementById('se_count')?.value || '').trim();
  const deadline = (document.getElementById('se_deadline').value || '').trim();

  const isPaused = type === '暫停';
  const SPECIAL_TYPES = ['共識會','BOD','大商分享','啟動會','年會','暫停'];

  const presenters = isPaused ? [] : [sp1, sp2].filter(Boolean);
  // 顧問去重（兩位填同人 → 只存一次）
  const mentorList = isPaused ? [] : [...new Set([me1, me2].filter(Boolean))];
  const mentor = mentorList.join('、');
  const topic = isPaused ? '' : [tp1, tp2].filter(Boolean).join('｜');
  const finalCount = isPaused ? 'N/A' : count;

  item.type = type;
  item.presenters = presenters;
  item.count = finalCount;
  item.mentor = mentor;
  item.deadline = deadline;
  item.topic = topic;
  item.isSkip = SPECIAL_TYPES.includes(type);
  item.isEmpty = !item.isSkip && presenters.length === 0;

  if (SCHEDULE_API_URL) {
    try {
      const r = await fetch(SCHEDULE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'updateSchedule',
          row: item.rowIndex + 1,
          data: { presenters: presenters.join('、'), count: finalCount, mentor, deadline, topic, type }
        })
      });
      const json = await r.json().catch(() => ({}));
      if (json && json.ok === false) throw new Error(json.error || '');
      showToast('已儲存並同步至 Sheet');
    } catch(e) {
      showToast('寫入失敗：' + (e.message || ''));
    }
  } else {
    showToast('已暫存（未連接 Sheet 寫入端點）');
  }
  document.getElementById('schedEditModal').remove();
  renderSchedule();
}

// ===== 工具 =====
function _todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function _daysBetween(isoA, isoB) {
  const a = new Date(isoA), b = new Date(isoB);
  return Math.round((b - a) / 86400000);
}
function _daysUntil(iso) { return _daysBetween(_todayIso(), iso); }
function _normalizeDeadline(s, year) {
  const m = String(s).match(/(\d{1,2})\/(\d{1,2})/);
  if (!m) return _todayIso();
  return `${year}-${String(parseInt(m[1])).padStart(2,'0')}-${String(parseInt(m[2])).padStart(2,'0')}`;
}
function _schedJumpToToday() {
  _scheduleFilterStatus = 'future';
  _schedRefreshTable();
  showToast('已切換至「未來」');
}
function _schedExportCsv() {
  const list = _schedFiltered();
  const rows = [['屆別','日期','類型','簡報者','次數','顧問','截稿日','主題']];
  list.forEach(x => rows.push([
    x.term, `${x.year}-${x.dateMd}`, _displayType(x.type),
    x.presenters.map(_resolvedName).join('、'), x.count,
    _splitNames(x.mentor).map(_resolvedName).join('、'),
    x.deadline, x.topic
  ]));
  const csv = rows.map(r => r.map(c => `"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `簡報排程_${_todayIso()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ===== Styles =====
function _schedStyles() {
  return `
  .sched-table-wrap { overflow-x:auto; }
  .sched-table { width:100%; border-collapse:collapse; font-size:12px; }
  .sched-table th { background:#f9fafb; padding:8px 10px; text-align:left; font-size:11px; color:var(--text-soft); font-weight:700; border-bottom:1.5px solid var(--gray-border); position:sticky; top:0; z-index:1; white-space:nowrap; }
  .sched-table td { padding:8px 10px; border-bottom:1px solid var(--gray-border); vertical-align:middle; }
  .sched-table tr.is-empty td { background:#fef0ee; }
  .sched-table tr.is-today td { background:#fff7e6; }
  .sched-table tr.is-paused td,
  .sched-table tr.is-left-row td { background:#f4f6f8 !important; }
  .sched-table tr.is-paused td,
  .sched-table tr.is-paused td *,
  .sched-table tr.is-left-row td,
  .sched-table tr.is-left-row td * { color:#9ca3af !important; }
  .sched-table tr.is-paused .sched-count-pill,
  .sched-table tr.is-left-row .sched-count-pill { background:#e5e7eb !important; }
  .sched-table tr.is-paused .sched-term-bar,
  .sched-table tr.is-left-row .sched-term-bar { background:#d1d5db !important; }
  .sched-table tr:hover td { background:#f4f7fa; }
  .sched-term-bar { width:5px; height:32px; border-radius:2px; }
  .sched-status { white-space:nowrap; font-size:11px; font-weight:700; }
  .sched-type-text { font-weight:700; color:var(--text); white-space:nowrap; }
  .sched-count-pill { display:inline-block; padding:2px 7px; border-radius:99px; font-size:10px; font-weight:700; margin-left:6px; }
  .sched-count-1 { background:#d4edda; color:#155724; }
  .sched-count-2 { background:#cfe2ff; color:#0c5cb8; }
  .sched-count-3 { background:#e0d4f5; color:#5b3296; }
  .sched-name { color:var(--text); font-weight:600; cursor:pointer; padding:0 2px; }
  .sched-name:hover { color:var(--red); text-decoration:underline; }
  .sched-name.is-left { color:#9ca3af; text-decoration:line-through; }
  .sched-mentor { color:var(--text); font-weight:500; }
  .sched-mentor.is-left { color:#9ca3af; text-decoration:line-through; }
  .sched-deadline { font-size:12px; white-space:nowrap; }
  .sched-deadline.warn { color:#c0392b; font-weight:700; }
  .sched-edit-btn { background:white; border:1.5px solid var(--gray-border); padding:4px 10px; font-size:11px; border-radius:6px; cursor:pointer; color:var(--text-soft); font-family:inherit; white-space:nowrap; }
  .sched-edit-btn:hover { border-color:var(--red); color:var(--red); }
  .sched-fl { width:100%; padding:7px 8px; border:1.5px solid var(--gray-border); border-radius:7px; font-size:12px; background:white; font-family:inherit; }
  .sched-fl:focus { border-color:var(--red); outline:none; }
  .sched-rec-pill { display:inline-block; padding:3px 9px; background:#eef4fb; color:#1a5490; border-radius:99px; font-size:11px; font-weight:700; }
  .sched-slot-row { padding:8px 6px; border-bottom:1px dashed var(--gray-border); }
  .sched-slot-row:last-child { border-bottom:none; }
  .sched-flag { display:inline-block; width:8px; height:8px; border-radius:50%; margin-left:4px; vertical-align:middle; }
  .sched-hist-row { cursor:pointer; }
  .sched-hist-row:hover td { background:#eef4fb; }
  .sched-hist-detail-row td { padding:0 !important; border-bottom:1.5px solid var(--gray-border); }
  .sched-unmatched-pill { display:inline-block; padding:3px 9px; background:white; border:1px solid #e67e22; color:#923f00; border-radius:99px; font-size:11px; font-weight:700; margin:2px; }
  .se-lbl { font-size:11px; color:var(--text-soft); font-weight:600; margin-bottom:4px; }
  .se-block-title { font-size:12px; font-weight:900; color:var(--text); margin-bottom:6px; }
  @media (max-width: 720px) {
    .sched-table { font-size:11px; }
    .sched-table th, .sched-table td { padding:6px 7px; }
  }
  `;
}
