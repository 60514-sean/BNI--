// ===== 簡報排程 =====
// 資料來源：Google Sheet（透過 Apps Script 直讀，無 CSV cache 延遲）
const SCHEDULE_CSV = 'https://docs.google.com/spreadsheets/d/12cGPw7f8L1HxZv6G5H3yKzPYNKNg8jIdzV3gl2sEN_Y/export?format=csv';
const SCHEDULE_API_URL = 'https://script.google.com/macros/s/AKfycbyCbrWCBgRxngzVXB3njoyqZaDrHOIzQ_9Dcvr85BX-HxfDEpjNI-jmpDhsIpTtS9IaMQ/exec';

let _scheduleData = null;
let _scheduleFilterTerm   = null;       // null=自動帶最新屆，'__all__'=全部
let _scheduleFilterType   = '__all__';  // __all__ / 主題簡報 / 主題日 / special
const _schedExpandedMobile = new Set(); // 手機卡片展開狀態（rowIndex）

window._schedToggleMobileCard = function(rowIdx) {
  if (_schedExpandedMobile.has(rowIdx)) _schedExpandedMobile.delete(rowIdx);
  else _schedExpandedMobile.add(rowIdx);
  _schedRefreshTable();
};
let _scheduleSuggestOpen  = false;      // 折疊
let _scheduleUnmatchedOpen = false;     // 折疊
let _scheduleHistoryOpen  = false;      // 預設收起
let _scheduleHistoryTarget = '';

// 暱稱／替代寫法 → 正式姓名（會員清單裡的拼法為準）
// TODO: 未來搬到 cfg.scheduleAliases 由設定頁維護
const _NAME_ALIASES = {
  'Stan':   '温智翔',
  '溫智翔': '温智翔',
  'Happy':  '金萱蓉',
  '小哈':   '蔡忠翰',
  '張毓芠': '張宥瑩',
  '詠宸':   '陳詠宸',
  '謝佳霖': '蔡佳霖',
};

// 已確認的離會會員（不再警示，但仍以淡灰色呈現該列）
// TODO: 未來搬到 cfg.scheduleLeftMembers 由設定頁維護
const _LEFT_MEMBERS = new Set([
  '賴笙','蘇泓達','陳詠宸','李汶昇','李佳蓉','蘇玲玉','潘穎鈞',
  '黃莉萍','王瑜甄','吳晉魁','吳映瑩','陳森棠','王靖雯',
  '黃若綾','王筱君','顏柏倫','郭宥蓁','黃煒雯',
  '郭懷憶','吳少宇',
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
  let curYear = new Date().getFullYear();
  let lastMonth = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const c0 = _schedCell(r[1]);
    const c1 = _schedCell(r[2]);
    const c2 = _schedCell(r[3]);
    const c3 = '';
    const c4 = _schedCell(r[4]);
    const c5 = _schedCell(r[5]);
    const c6 = _schedCell(r[6]);
    const sheetName = (r[7] !== undefined) ? String(r[7] || '') : '';
    const sheetRow  = (r[8] !== undefined) ? parseInt(r[8], 10) || 0 : 0;

    const tm = c0.match(/(第[一二三四五六七八九十]+屆)/);
    if (tm) { curTerm = tm[1]; continue; }
    const ym = c0.match(/^(\d{4})年?$/);
    if (ym) { curYear = parseInt(ym[1]); lastMonth = 0; continue; }

    if (!c1) continue;
    const dm = c1.match(/(\d{1,2})\/(\d{1,2})/);
    if (!dm) continue;
    const M = parseInt(dm[1]);
    const D = parseInt(dm[2]);

    // 跨年判斷：上一筆是 11/12 月，這筆變成 1/2 月 → 年份 +1
    if (lastMonth >= 11 && M <= 2) curYear++;
    lastMonth = M;

    const isoDate = `${curYear}-${String(M).padStart(2,'0')}-${String(D).padStart(2,'0')}`;

    const c2Compact = c2.replace(/\s+/g, '');
    let type = '主題簡報';
    let isEmpty = false;
    let isSkip  = false;
    let presenters = [];

    if (/暫停|連假/.test(c0) || /暫停/.test(c2Compact)) { type = '暫停'; isSkip = true; }
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
      sheetName, sheetRow,
      raw: { c0, c1, c2, c3, c4, c5, c6 }
    });
  }
  return out;
}

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

// ===== 姓名解析 =====
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
  return aliased;
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
    if (_NAME_ALIASES[name]) return;
    if (_matchMemberName(name)) return;
    const canon = _canonicalName(name);
    if (canon && _LEFT_MEMBERS.has(canon)) return;
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
      載入失敗 <button class="sched-jump-btn" style="margin-left:12px;" onclick="_scheduleData=null;renderSchedule()">重試</button>
    </div>`;
    return;
  }
  if (!_memberData) await fetchMembers();

  el.innerHTML = `<div class="sched-wrap">
    ${_schedHeroHtml()}
    ${_schedSuggestHtml()}
    ${_schedUnmatchedHtml()}
    ${_schedHistoryCardHtml()}
    ${_schedTableCardHtml()}
  </div>`;
}

function _schedHeaderHtml() {
  const canEdit = _canEditTab('schedule');
  const editTag = canEdit
    ? `<span style="background:#27ae60;color:white;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;">可編輯</span>`
    : `<span style="background:#bdc3c7;color:white;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;">唯讀</span>`;
  return `<div class="sched-card">
    <div class="sched-card-head no-cursor">
      <div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="sched-card-title">簡報排程</div>
          ${editTag}
        </div>
        <div class="sched-card-sub">資料來源：Google Sheet · 共 ${_scheduleData.length} 筆</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="sched-jump-btn" onclick="_schedExportCsv()" style="background:white;border:1.5px solid var(--gray-border);color:var(--text-soft);">匯出 CSV</button>
        <button class="sched-jump-btn" onclick="_scheduleData=null;renderSchedule()" style="background:white;border:1.5px solid var(--gray-border);color:var(--text-soft);">重整</button>
      </div>
    </div>
  </div>`;
}

// ===== Hero：本週 / 下週 =====
function _schedHeroHtml() {
  const today = _todayIso();
  const future = _scheduleData
    .filter(x => x.dateIso >= today && !x.isSkip)
    .sort((a,b) => a.dateIso.localeCompare(b.dateIso));
  const thisWeek = future[0] || null;
  const nextWeek = future[1] || null;

  const card = (slot, label, accent) => {
    if (!slot) {
      return `<div class="sched-hero-card">
        <div class="sched-hero-label">${label}</div>
        <div class="sched-hero-empty-text">無資料</div>
      </div>`;
    }
    if (slot.isEmpty) {
      return `<div class="sched-hero-card is-empty">
        <div class="sched-hero-label">${label}</div>
        <div class="sched-hero-date">${slot.dateMd} <span style="font-size:12px;color:var(--text-soft);font-weight:500;">${slot.year}</span></div>
        <div class="sched-hero-empty-text">— 待排定 —</div>
      </div>`;
    }
    const presNames = slot.presenters.map(p => _escH(_resolvedName(p))).join('、') || '—';
    const mentorList = [...new Set(_splitNames(slot.mentor).map(m => _resolvedName(m)))];
    const mentorTxt = mentorList.length ? mentorList.map(_escH).join('、') : '—';
    const dl = slot.deadline ? _normalizeDeadline(slot.deadline, slot.year) : null;
    const dlDays = dl ? _daysUntil(dl) : null;
    const dlWarn = dlDays !== null && dlDays >= 0 && dlDays <= 7;
    return `<div class="sched-hero-card ${accent}">
      <div class="sched-hero-label">${label}</div>
      <div class="sched-hero-date">${slot.dateMd} <span style="font-size:12px;color:var(--text-soft);font-weight:500;">${slot.year}</span> <span class="sched-hero-type">${_escH(_displayType(slot.type))}</span></div>
      <div class="sched-hero-pres">${presNames}</div>
      <div class="sched-hero-meta">顧問：<b>${mentorTxt}</b></div>
      ${slot.topic && slot.topic !== 'N/A' ? `<div class="sched-hero-meta">主題：<b>${_escH(slot.topic.split(/[\n｜|]/)[0].trim())}</b></div>` : ''}
      ${slot.deadline ? `<div class="sched-hero-meta">截稿：<b style="${dlWarn?'color:#c0392b;':''}">${_escH(slot.deadline)}${dlWarn?` (${dlDays}天)`:''}</b></div>` : ''}
    </div>`;
  };

  return `<div class="sched-hero">
    ${card(thisWeek, '本週', 'is-now')}
    ${card(nextWeek, '下週', '')}
  </div>`;
}

// ===== 待排建議（折疊） =====
function _schedSuggestHtml() {
  const today = _todayIso();
  const empties = _scheduleData
    .filter(x => x.isEmpty && x.dateIso >= today)
    .sort((a,b) => a.dateIso.localeCompare(b.dateIso))
    .slice(0, 8);
  if (empties.length === 0) return '';

  const suggestions = empties.map(slot => {
    const recs = _recommendPresenters(slot, 3);
    const recTags = recs.length
      ? recs.map(r => `<span class="sched-suggest-pill" title="上次：${r.lastDate || '從未'} · 累積：${r.count} 次">${_escH(r.name)} <span style="opacity:.7;font-weight:400;">${r.lastDate ? `${r.weeksAgo}週前` : '新人'}</span></span>`).join('')
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

  return `<div class="sched-card">
    <div class="sched-card-head" onclick="_scheduleSuggestOpen=!_scheduleSuggestOpen;renderSchedule()">
      <div>
        <div class="sched-card-title" style="color:#c0392b;">待排建議（${empties.length} 個空缺）</div>
        <div class="sched-card-sub">依「最久未簡報 + 累積次數最少」排序推薦</div>
      </div>
      <div class="sched-arrow">${_scheduleSuggestOpen ? '▼' : '▶'}</div>
    </div>
    ${_scheduleSuggestOpen ? `<div class="sched-card-body" style="padding:8px 12px;">${suggestions}</div>` : ''}
  </div>`;
}

function _recommendPresenters(slot, n) {
  if (!_memberData || !_memberData.length) return [];
  const today = _todayIso();
  const stats = _scheduleMemberStats();
  const candidates = _memberData.map(m => {
    const s = stats[m.name] || { count: 0, lastDate: null, weeksAgo: 9999 };
    return { name: m.name, industry: m.industry, member: m, count: s.count, lastDate: s.lastDate, weeksAgo: s.weeksAgo };
  });
  // 排除「今天以後」任何已被排上的人（不管哪一場）
  const scheduledNames = new Set(_scheduleData
    .filter(x => !x.isEmpty && !x.isSkip && x.dateIso >= today)
    .flatMap(x => x.presenters.map(p => _resolvedName(p))));
  return candidates
    .filter(c => !scheduledNames.has(c.name))
    .filter(c => !_isNewMember(c.member))   // 入會未滿 3 個月不推薦
    .sort((a,b) => (b.weeksAgo - a.weeksAgo) || (a.count - b.count))
    .slice(0, n);
}

// 入會未滿 3 個月（90 天）視為新會員，不列入待排建議
function _isNewMember(m) {
  if (!m) return false;
  const join = _parseMemberJoinDate(m);
  if (!join) return false;
  const diffDays = (Date.now() - join.getTime()) / 86400000;
  return diffDays < 90;
}
function _parseMemberJoinDate(m) {
  // 優先用「入會感言日期」(ceremonyDate)，無則用「到期日」往前推 1 年
  const tryParse = s => {
    if (!s) return null;
    const mm = String(s).match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (!mm) return null;
    return new Date(+mm[1], +mm[2]-1, +mm[3]);
  };
  const j = tryParse(m.ceremonyDate);
  if (j) return j;
  const r = tryParse(m.renewDate);
  if (r) return new Date(r.getTime() - 365 * 86400000);
  return null;
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

// ===== 無法判定姓名警示（折疊） =====
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
  return `<div class="sched-card">
    <div class="sched-card-head" onclick="_scheduleUnmatchedOpen=!_scheduleUnmatchedOpen;renderSchedule()">
      <div>
        <div class="sched-card-title">姓名待確認（${list.length}）</div>
        <div class="sched-card-sub">無法在會員清單比對到的姓名，可能是離會或暱稱</div>
      </div>
      <div class="sched-arrow">${_scheduleUnmatchedOpen ? '▼' : '▶'}</div>
    </div>
    ${_scheduleUnmatchedOpen ? `<div class="sched-card-body" style="padding:10px 14px;">${items}</div>` : ''}
  </div>`;
}

// ===== 會員簡報歷史（中段、預設展開） =====
function _schedHistoryCardHtml() {
  return `<div id="schedHistCard">${_schedHistoryCardInner()}</div>`;
}
function _schedHistoryCardInner() {
  if (!_memberData || !_memberData.length) {
    return `<div class="sched-card"><div class="sched-card-body" style="padding:14px;color:var(--text-soft);font-size:12px;">會員資料尚未載入</div></div>`;
  }
  const stats = _scheduleMemberStats();
  const list = _memberData.map(m => ({
    name: m.name, industry: m.industry,
    ...(stats[m.name] || { count: 0, lastDate: null, weeksAgo: 9999, history: [] })
  })).sort((a,b) => (b.weeksAgo - a.weeksAgo) || (a.count - b.count));

  const rows = list.map(s => {
    const lastTxt = s.lastDate ? `${s.lastDate}（${s.weeksAgo} 週前）` : `<span style="color:#c0392b;font-weight:700;">尚未簡報</span>`;
    const flag = s.weeksAgo >= 24
      ? '<span class="sched-flag" style="background:#ef4444;" title="超過 24 週"></span>'
      : s.weeksAgo >= 12
      ? '<span class="sched-flag" style="background:#f59e0b;" title="超過 12 週"></span>'
      : '';
    const isOpen = _scheduleHistoryTarget === s.name;
    const histRows = isOpen && s.history && s.history.length
      ? `<tr class="sched-hist-detail-row"><td colspan="5" style="padding:0;">
          <div style="background:#f9fafb;padding:8px 14px;">
            ${s.history.sort((a,b)=>b.dateIso.localeCompare(a.dateIso)).map(h => `
              <div style="display:flex;gap:10px;padding:5px 0;border-bottom:1px dashed var(--gray-border);font-size:11px;">
                <span style="font-weight:700;min-width:55px;">${h.dateMd}</span>
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

  return `<div class="sched-card">
    <div class="sched-card-head" onclick="_scheduleHistoryOpen=!_scheduleHistoryOpen;_schedRefreshHistory()">
      <div>
        <div class="sched-card-title">會員簡報歷史</div>
        <div class="sched-card-sub">依「最久未簡報」排序 · 點會員列展開歷次紀錄</div>
      </div>
      <div class="sched-arrow">${_scheduleHistoryOpen ? '▼' : '▶'}</div>
    </div>
    ${_scheduleHistoryOpen ? `<div class="sched-table-wrap">
      <table class="sched-table">
        <thead><tr><th>會員</th><th>產業</th><th style="text-align:center;">累積</th><th>上次簡報</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>` : ''}
  </div>`;
}
function _schedRefreshHistory() {
  const host = document.getElementById('schedHistCard');
  if (!host) return;
  // 保留：頁面捲動位置 + 表格內部捲動位置
  const winScroll = window.scrollY;
  const wrap = host.querySelector('.sched-table-wrap');
  const wrapScroll = wrap ? wrap.scrollTop : 0;
  host.innerHTML = _schedHistoryCardInner();
  const newWrap = host.querySelector('.sched-table-wrap');
  if (newWrap) newWrap.scrollTop = wrapScroll;
  if (window.scrollY !== winScroll) window.scrollTo(0, winScroll);
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

// ===== 完整排程表（含篩選） =====
function _schedTableCardHtml() {
  return `<div class="sched-card">
    <div class="sched-card-head no-cursor">
      <div>
        <div class="sched-card-title">完整排程</div>
      </div>
    </div>
    ${_schedFilterHtml()}
    <div id="schedTableHost">${_schedTableHtml()}</div>
  </div>`;
}

function _schedFilterHtml() {
  const allTerms = [...new Set(_scheduleData.map(x => x.term).filter(Boolean))];
  if (_scheduleFilterTerm === null) {
    _scheduleFilterTerm = allTerms[allTerms.length - 1] || '__all__';
  }
  const termOpts = allTerms.map(t => `<option value="${t}" ${t===_scheduleFilterTerm?'selected':''}>${t}</option>`).join('');
  return `<div class="sched-filter-row">
    <select class="sched-fl" onchange="_scheduleFilterTerm=this.value;_schedRefreshTable()">
      <option value="__all__" ${_scheduleFilterTerm==='__all__'?'selected':''}>全部屆別</option>
      ${termOpts}
    </select>
    <select class="sched-fl" onchange="_scheduleFilterType=this.value;_schedRefreshTable()">
      <option value="__all__" ${_scheduleFilterType==='__all__'?'selected':''}>全部類型</option>
      <option value="主題簡報" ${_scheduleFilterType==='主題簡報'?'selected':''}>主題簡報</option>
      <option value="主題日" ${_scheduleFilterType==='主題日'?'selected':''}>主題日</option>
      <option value="special" ${_scheduleFilterType==='special'?'selected':''}>特殊日</option>
    </select>
    <button class="sched-jump-btn" onclick="_schedJumpToThisWeek()">回到本週</button>
  </div>`;
}

function _schedFiltered() {
  return _scheduleData.filter(x => {
    if (_scheduleFilterTerm && _scheduleFilterTerm !== '__all__' && x.term !== _scheduleFilterTerm) return false;
    if (_scheduleFilterType === '主題簡報' && x.type !== '主題簡報') return false;
    if (_scheduleFilterType === '主題日' && x.type !== '主題日') return false;
    if (_scheduleFilterType === 'special' && !x.isSkip) return false;
    return true;
  });
}

function _schedRefreshTable() {
  const host = document.getElementById('schedTableHost');
  if (host) host.innerHTML = _schedTableHtml();
}

function _schedTableHtml() {
  const list = _schedFiltered();
  if (!list.length) return `<div style="padding:24px;text-align:center;color:var(--text-soft);font-size:13px;">沒有符合條件的紀錄</div>`;
  return `<div class="sched-cards">${list.map(_schedMobileCardsForItem).join('')}</div>`;
}

// 手機卡片（摺疊式）：左側狀態色塊 + 右側白底內容區
function _schedMobileCardsForItem(x) {
  const today = _todayIso();
  const canEdit = _canEditTab('schedule');
  const isPast = x.dateIso < today;
  const isToday = x.dateIso === today;
  const dl = x.deadline ? _normalizeDeadline(x.deadline, x.year) : null;
  const daysToDeadline = dl ? _daysUntil(dl) : null;
  const deadlineWarn = daysToDeadline !== null && daysToDeadline >= 0 && daysToDeadline <= 7;
  const expanded = _schedExpandedMobile.has(x.rowIndex);

  // 解析日期取得星期
  const dateObj = new Date(x.dateIso + 'T00:00:00');
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][dateObj.getDay()];

  let statusText, dateblockTheme;
  if (x.isEmpty)              { statusText = '空缺';   dateblockTheme = 'empty'; }
  else if (isToday)           { statusText = '本週';   dateblockTheme = 'now'; }
  else if (x.type === '暫停') { statusText = '暫停';   dateblockTheme = 'skip'; }
  else if (x.isSkip)          { statusText = isPast ? '已完成' : '已排定'; dateblockTheme = 'skip'; }
  else if (isPast)            { statusText = '已完成'; dateblockTheme = 'done'; }
  else                        { statusText = '已排定'; dateblockTheme = 'planned'; }

  // 講者簡短列表（collapsed 時的標題）
  let summaryText;
  if (x.isEmpty) {
    summaryText = `<span style="color:#c0392b;font-weight:700;">— 待排定 —</span>`;
  } else if (x.isSkip && x.presenters.length === 0) {
    summaryText = `<span style="color:var(--text-soft);">${_escH(_displayType(x.type))}</span>`;
  } else {
    const names = x.presenters.map(p => _resolvedName(p));
    summaryText = `<span class="sched-mc-names">${names.map(n => _escH(n)).join('、')}</span>`;
  }

  const allLeft = !x.isEmpty && !x.isSkip && x.presenters.length > 0 && x.presenters.every(p => _isLeftMember(p));
  const classes = ['sched-mc', `theme-${dateblockTheme}`];
  if (allLeft) classes.push('is-left-row');
  if (expanded) classes.push('is-expanded');

  // 日期色塊（左側）：日期 + 星期 + 狀態
  const dateBlock = `<div class="sched-mc-dateblock sched-mc-theme-${dateblockTheme}">
    <div class="sched-mc-md">${x.dateMd}</div>
    <div class="sched-mc-wk">${weekday}</div>
    <div class="sched-mc-status-tag">${statusText}</div>
  </div>`;

  // 摺疊頭：點擊展開/收回
  const collapsedHead = `<div class="sched-mc-collapsed" onclick="_schedToggleMobileCard(${x.rowIndex})">
    ${dateBlock}
    <div class="sched-mc-c-mid">${summaryText}</div>
    <span class="sched-mc-caret">${expanded ? '▾' : '▸'}</span>
  </div>`;

  // 展開區（only render when expanded）
  let expandedBody = '';
  if (expanded) {
    if (x.isEmpty) {
      const editBtnEmpty = canEdit ? `<button class="sched-edit-btn" onclick="_schedOpenEdit(${x.rowIndex})">編輯</button>` : '';
      expandedBody = `<div class="sched-mc-body">
        <div class="sched-mc-row"><span class="sched-mc-lbl">簡報者</span><span style="color:#c0392b;font-weight:700;">— 待排定 —</span></div>
        <div class="sched-mc-row"><span class="sched-mc-lbl">年度</span><span style="color:var(--text-soft);">${x.year}</span></div>
        ${editBtnEmpty ? `<div class="sched-mc-deadline-row" style="justify-content:flex-end;border-top:none;padding-top:0;">${editBtnEmpty}</div>` : ''}
      </div>`;
    } else if (x.isSkip && x.presenters.length === 0) {
      const editBtnSkip = canEdit ? `<button class="sched-edit-btn" onclick="_schedOpenEdit(${x.rowIndex})">編輯</button>` : '';
      expandedBody = `<div class="sched-mc-body">
        <div class="sched-mc-row"><span class="sched-mc-lbl">類型</span><span>${_escH(_displayType(x.type))}</span></div>
        <div class="sched-mc-row"><span class="sched-mc-lbl">年度</span><span style="color:var(--text-soft);">${x.year}</span></div>
        ${editBtnSkip ? `<div class="sched-mc-deadline-row" style="justify-content:flex-end;border-top:none;padding-top:0;">${editBtnSkip}</div>` : ''}
      </div>`;
    } else {
      const mentorsRaw = _splitNames(x.mentor).map(m => ({ full: _resolvedName(m), left: _isLeftMember(m) }));
      const uniqMentors = [];
      const seenM = new Set();
      mentorsRaw.forEach(m => { if (!seenM.has(m.full)) { seenM.add(m.full); uniqMentors.push(m); } });
      const sameMentor = uniqMentors.length === 1 && x.presenters.length > 1;
      const topicParts = (x.topic && x.topic !== 'N/A')
        ? String(x.topic).split(/[\n｜|]/).map(s => s.trim()).filter(Boolean)
        : [];
      const deadlineHtml = x.deadline
        ? `<span class="sched-deadline ${deadlineWarn?'warn':''}">${_escH(x.deadline)}${deadlineWarn?` (${daysToDeadline}天)`:''}</span>`
        : `<span style="color:var(--text-soft);">—</span>`;

      const blocks = x.presenters.map((p, i) => {
        const presFull = _resolvedName(p);
        const presLeft = _isLeftMember(p);
        const mentor = sameMentor
          ? uniqMentors[0]
          : (mentorsRaw[i] || mentorsRaw[mentorsRaw.length - 1] || null);
        const mentorHtml = mentor
          ? `<span class="sched-mentor${mentor.left?' is-left':''}">${_escH(mentor.full)}</span>`
          : `<span style="color:var(--text-soft);">—</span>`;
        const topic = topicParts.length === 1 ? topicParts[0] : (topicParts[i] || '');
        const topicHtml = topic ? _escH(topic) : `<span style="color:var(--text-soft);">—</span>`;
        return `<div class="sched-mc-speaker">
          <div class="sched-mc-row">
            <span class="sched-mc-lbl">簡報者</span>
            <span class="sched-name${presLeft?' is-left':''}" onclick="_schedShowMemberHistory('${_escH(presFull)}')">${_escH(presFull)}</span>
          </div>
          <div class="sched-mc-row">
            <span class="sched-mc-lbl">顧問</span>
            ${mentorHtml}
          </div>
          <div class="sched-mc-row">
            <span class="sched-mc-lbl">主題</span>
            <span class="sched-mc-topic">${topicHtml}</span>
          </div>
        </div>`;
      }).join('');

      const editBtn = canEdit ? `<button class="sched-edit-btn" onclick="_schedOpenEdit(${x.rowIndex})">編輯</button>` : '';
      expandedBody = `<div class="sched-mc-body">
        ${blocks}
        <div class="sched-mc-deadline-row">
          <div class="sched-mc-row" style="margin:0;">
            <span class="sched-mc-lbl">截稿日</span>
            ${deadlineHtml}
          </div>
          ${editBtn}
        </div>
      </div>`;
    }
  }

  return `<div class="${classes.join(' ')}">
    ${collapsedHead}
    ${expandedBody}
  </div>`;
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

  // 次數一律由系統自動計算（過去場次 + 1），避免人工誤填
  const initCount  = sp1 ? _autoDetectCount(sp1, item.dateIso) : '';
  const initCount2 = sp2 ? _autoDetectCount(sp2, item.dateIso) : '';

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
          <input id="se_count" class="modal-input" type="text" value="${_escH(initCount)}" placeholder="自動" readonly title="自動計算（過去場次 +1）" style="font-size:14px;text-align:center;background:#f3f4f6;color:var(--text-soft);cursor:not-allowed;">
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
        <div style="display:grid;grid-template-columns:1fr 90px;gap:8px;margin-bottom:6px;">
          <div>
            <div class="se-lbl">姓名</div>
            <input id="se_speaker2" class="modal-input" type="text" value="${_escH(sp2)}" list="se_member_list" oninput="_schedRecountAuto2(${rowIdx})" style="font-size:14px;">
          </div>
          <div>
            <div class="se-lbl">次數</div>
            <input id="se_count2" class="modal-input" type="text" value="${_escH(initCount2)}" placeholder="自動" readonly title="自動計算（過去場次 +1）" style="font-size:14px;text-align:center;background:#f3f4f6;color:var(--text-soft);cursor:not-allowed;">
          </div>
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

function _schedRecountAuto2(rowIdx) {
  const item = _scheduleData.find(x => x.rowIndex === rowIdx);
  if (!item) return;
  const inp = document.getElementById('se_speaker2');
  const cnt = document.getElementById('se_count2');
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
  const count1 = (document.getElementById('se_count')?.value || '').trim();
  const count2 = (document.getElementById('se_count2')?.value || '').trim();
  const deadline = (document.getElementById('se_deadline').value || '').trim();

  const isPaused = type === '暫停';
  const SPECIAL_TYPES = ['共識會','BOD','大商分享','啟動會','年會','暫停'];

  const presenters = isPaused ? [] : [sp1, sp2].filter(Boolean);
  const mentorList = isPaused ? [] : [...new Set([me1, me2].filter(Boolean))];
  const mentor = mentorList.join('、');
  const topic = isPaused ? '' : [tp1, tp2].filter(Boolean).join('｜');
  // 兩位講者 → 「3｜2」格式；單位/暫停 → 單一值或 N/A
  const finalCount = isPaused
    ? 'N/A'
    : (sp2 && count2 ? `${count1}｜${count2}` : count1);

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
      const targetRow = item.sheetRow || (item.rowIndex + 1);
      const r = await fetch(SCHEDULE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'updateSchedule',
          sheetName: item.sheetName || '',
          row: targetRow,
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
function _schedJumpToThisWeek() {
  // 捲到本週卡片（或最接近今天的未來卡片）
  setTimeout(() => {
    const today = _todayIso();
    const cards = document.querySelectorAll('#schedTableHost .sched-mc');
    let todayCard = null, upcoming = null;
    cards.forEach(c => {
      const head = c.querySelector('.sched-mc-collapsed');
      const dateblock = c.querySelector('.sched-mc-dateblock');
      if (!dateblock) return;
      // 從卡片內 theme 判斷：本週 / 未來已排定
      if (!todayCard && dateblock.classList.contains('sched-mc-theme-now')) todayCard = c;
      if (!upcoming && (dateblock.classList.contains('sched-mc-theme-planned') || dateblock.classList.contains('sched-mc-theme-empty'))) upcoming = c;
    });
    const target = todayCard || upcoming;
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 50);
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
