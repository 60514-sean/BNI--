// ===== 例會流程 =====
const _MEET_LS_DRAFT = 'bni_meeting_draft_v2';
const _MEET_LS_VERS  = 'bni_meeting_versions_v2';
const MEETING_ROLES   = ['主席','副主席','秘財','教育','活動'];
const MEETING_MEMBERS = ['入會','續約','出村']; // 對應「會員-入會 / 會員-續約 / 會員-出村」
const MEETING_EXIT_ROLES = ['導師','導生']; // 出村相關（每週調整）
const MEETING_SPEAKER_ROLES = ['會員1','會員2']; // 本週主題簡報講者
const MEETING_COMMITTEE_ROLES = ['委員會']; // 本週委員會（每週調整）

function _meetingPresenterMatch(line) {
  const trimmed = line.trim();
  // 1) 職務或職務-後綴（如「主席」、「副主席-主持」、「秘財-卸任」、「導師」、「主題1」、「委員會-1」）
  const allRoles = [...MEETING_ROLES, ...MEETING_EXIT_ROLES, ...MEETING_SPEAKER_ROLES, ...MEETING_COMMITTEE_ROLES];
  const sortedRoles = allRoles.sort((a, b) => b.length - a.length);
  const rolePattern = new RegExp('^(' + sortedRoles.join('|') + ')(-.*)?$');
  let m = trimmed.match(rolePattern);
  if (m) return { type: 'role', key: m[1], origPart: m[1] };
  // 2) 會員-入會 / 會員-續約 / 會員-出村 — 替換「會員」為姓名（顯示為「{姓名}-入會」）
  const memberPattern = new RegExp('^會員-(' + MEETING_MEMBERS.join('|') + ')$');
  m = trimmed.match(memberPattern);
  if (m) return { type: 'member', key: m[1], origPart: '會員' };
  // 3) 會員-導師 / 會員-導生 — 替換「會員」為姓名（顯示為「{姓名}-導師」）
  const exitMemberPattern = new RegExp('^會員-(' + MEETING_EXIT_ROLES.join('|') + ')$');
  m = trimmed.match(exitMemberPattern);
  if (m) return { type: 'exitMember', key: m[1], origPart: '會員' };
  return null;
}

function _resolveMeetingPresenter(presenter) {
  if (!presenter) return presenter;
  const map = getConfig().meetingStaff || {};
  return String(presenter).split('\n').map(line => {
    const matched = _meetingPresenterMatch(line);
    if (matched && map[matched.key]) return line.replace(matched.origPart, map[matched.key]);
    return line;
  }).join('\n');
}

// 一般正式例會基底（21 項，新版 25 秒/10 秒/10 秒）
// fixed:true 表示時長為固定值，編輯 modal 中時長欄位會鎖定
const _MEET_NORMAL_BASE = [
  { topic:'會員報到、交流、拍照', presenter:'活動', minutes:30, note:'□計時 06:55拍照', fixed:true },
  { topic:'主席開場', presenter:'主席', minutes:2, note:'□計時 1:30按●，2:00按●●', fixed:true },
  { topic:'主席歡迎來賓\n介紹領導團隊', presenter:'主席', minutes:4, note:'□計時 3:30按●，4:00按●●', fixed:true },
  { topic:'BNI的宗旨及概況', presenter:'主席', minutes:5, note:'□計時 4:30按●，5:00按●●', fixed:true },
  { topic:'教育培訓時間', presenter:'教育', minutes:3, note:'□計時 2:30按●，3:00按●●' },
  { topic:'表揚優秀會員', presenter:'副主席', minutes:2, note:'□計時 1:30按●，2:00按●●', fixed:true },
  { topic:'傳遞會員名片盒', presenter:'主席', minutes:1.5, note:'請跑麥手協助傳遞名片盒\nDJ手側桌開始', fixed:true },
  { topic:'會員25秒專業呈現', presenter:'主席', minutes:21, note:'□計時 0:15按●，0:25按●●' },
  { topic:'來賓10秒自我介紹', presenter:'主席', minutes:2, note:'□計時 0:10按●，0:15按●●' },
  { topic:'副主席報告', presenter:'副主席', minutes:3, note:'□計時 2:30按●，3:00按●●', fixed:true },
  { topic:'會員委員會報告', presenter:'委員會', minutes:2, note:'□計時 1:30按●，2:00按●●', fixed:true, serialHighlight:true },
  { topic:'秘書財務報告\n未來六週主題講者', presenter:'秘財', minutes:1.5, note:'□計時 1:00按●，1:30按●●', fixed:true },
  { topic:'主題簡報', presenter:'會員1\n會員2', minutes:11, note:'□計時 4:30按●，5:00按●●', titleHighlight:true, serialHighlight:true },
  { topic:'會員10秒業務引薦時間', presenter:'主席', minutes:10, note:'□計時 0:10按●●' },
  { topic:'來賓分享10秒', presenter:'主席', minutes:2, note:'□計時 1:30按●，2:00按●●' },
  { topic:'引薦單查核', presenter:'副主席', minutes:2, note:'□計時 1:30按●，2:00按●●', fixed:true },
  { topic:'秘書財務報告\n會員申請資格', presenter:'秘財', minutes:4, note:'□計時 3:30按●，4:00按●●', fixed:true },
  { topic:'主席感謝來賓', presenter:'主席', minutes:1, note:'□計時 0:30按●，1:00按●●', fixed:true },
  { topic:'活動協調人報告', presenter:'活動', minutes:3, note:'□計時 2:30按●，3:00按●●', fixed:true },
  { topic:'抽獎時間', presenter:'副主席', minutes:2, note:'□計時 1:30按●，2:00按●●', fixed:true },
  { topic:'會議結束', presenter:'主席', minutes:1, note:'□計時 0:30按●，1:00按●●', fixed:true }
];

// 共識會議基底（22 項，屆別交接專用）
const _MEET_CONSENSUS_BASE = [
  { topic:'會員報到、交流、拍照', presenter:'活動', minutes:20, note:'□計時 06:45拍照' },
  { topic:'開場', presenter:'主席', minutes:1, note:'□計時 0:30按●，1:00按●●' },
  { topic:'三長卸任感言', presenter:'秘財-卸任\n副主席-卸任\n主席-卸任', minutes:3, note:'□計時 0:30按●，1:00按●●\n□計時 0:30按●，1:00按●●\n□計時 0:30按●，1:00按●●' },
  { topic:'頒發上屆\n九長+委員+導師=感謝狀', presenter:'主席', minutes:4, note:'□不傳麥克風，主席統一介紹' },
  { topic:'頒發本屆\n九長+委員+導師=聘書', presenter:'主席', minutes:3, note:'□不傳麥克風，主席統一介紹' },
  { topic:'本屆領導團隊介紹', presenter:'主席', minutes:4, note:'□計時 3:30按●，4:00按●●' },
  { topic:'布達行政小組', presenter:'主席', minutes:2, note:'□計時 1:30按●，2:00按●●' },
  { topic:'報告本屆目標', presenter:'主席', minutes:5, note:'□計時 4:30按●，5:00按●●' },
  { topic:'副主席報告', presenter:'副主席', minutes:5, note:'□計時 4:30按●，5:00按●●' },
  { topic:'秘書財務報告', presenter:'秘財', minutes:8, note:'□計時 7:30按●，8:00按●●' },
  { topic:'會員委員會報告', presenter:'委員會-1\n委員會-2', minutes:18, note:'□計時 8:30按●，9:00按●●\n□計時 8:30按●，9:00按●●', serialHighlight:true },
  { topic:'教育協調人報告', presenter:'教育', minutes:4, note:'□計時 4:00按●，4:30按●●' },
  { topic:'活動協調人', presenter:'活動', minutes:5, note:'□計時 4:30按●，5:00按●●' },
  { topic:'來賓接待人', presenter:'來賓接待', minutes:5, note:'□計時 4:30按●，5:00按●●' },
  { topic:'導師協調人', presenter:'導師', minutes:5, note:'□計時 4:30按●，5:00按●●' },
  { topic:'成長協調人', presenter:'成長', minutes:9, note:'□計時 8:30按●，9:00按●●' },
  { topic:'網站管理員', presenter:'網站', minutes:5, note:'□計時 4:30按●，5:00按●●' },
  { topic:'上屆五冠王頒獎', presenter:'主席', minutes:2, note:'□計時 1:30按●，2:00按●●' },
  { topic:'個人收穫分享(1)', presenter:'會員-1', minutes:3, note:'□計時 2:30按●，3:00按●●' },
  { topic:'個人收穫分享(2)', presenter:'會員-2', minutes:3, note:'□計時 2:30按●，3:00按●●' },
  { topic:'支持成長董顧時間', presenter:'董顧', minutes:3, note:'□計時 2:30按●，3:00按●●' },
  { topic:'主席結束會議聚能', presenter:'主席', minutes:3, note:'□計時 2:30按●，3:00按●●' }
];

// 變體插入項目（在「表揚優秀會員」後、「傳遞名片盒」前）
const _MEET_EVENTS = {
  declareNew: { topic:'宣布新人入會，宣讀BNI道德規範', presenter:'主席', minutes:2, note:'□計時 1:30按●，2:00按●●', serialHighlight:true },
  declareRenew: { topic:'宣布續約會員，宣讀BNI道德規範', presenter:'主席', minutes:2, note:'□計時 1:30按●，2:00按●●', serialHighlight:true },
  declareExit: { topic:'宣布出村會員，宣讀BNI道德規範', presenter:'主席', minutes:2, note:'□計時 1:30按●，2:00按●●', serialHighlight:true },
  declareNewRenew: { topic:'宣布續約、新人入會，宣讀BNI道德規範', presenter:'主席', minutes:2, note:'□計時 1:30按●，2:00按●●', serialHighlight:true },
  declareExitNewRenew: { topic:'宣布出村、續約、新人入會，宣讀BNI道德規範', presenter:'主席', minutes:2, note:'□計時 1:30按●，2:00按●●', serialHighlight:true },
  declareExitRenew: { topic:'宣布出村、續約會員，宣讀BNI道德規範', presenter:'主席', minutes:2, note:'□計時 1:30按●，2:00按●●', serialHighlight:true },
  declareExitNew: { topic:'宣布出村、新人入會，宣讀BNI道德規範', presenter:'主席', minutes:2, note:'□計時 1:30按●，2:00按●●', serialHighlight:true },
  newmember: { topic:'入會感言\n→五長拍照', presenter:'副主席-主持\n會員-入會', minutes:2, note:'□計時 0:30按●，1:00按●●\n□計時 0:30按●，1:00按●●', serialHighlight:true },
  renew: { topic:'續約感言\n→五長拍照', presenter:'副主席-主持\n會員-續約', minutes:2, note:'□計時 0:30按●，1:00按●●\n□計時 0:30按●，1:00按●●', serialHighlight:true },
  exit: { topic:'出村典禮', presenter:'主席-主持\n會員-導生\n會員-導師', minutes:3, note:'□計時 0:30按●，1:00按●●\n□計時 0:30按●，1:00按●●\n□計時 0:30按●，0:45按●●', serialHighlight:true }
};

const _MEET_CEREMONY_KEYS = ['newmember','renew','exit'];
const _MEET_CEREMONY_LABELS = { newmember:'入會儀式', renew:'續約儀式', exit:'出村典禮' };

function _meetEmptyCeremonies() { return { newmember:false, renew:false, exit:false }; }

function _meetPickDeclareKey(c) {
  if (c.exit && c.newmember && c.renew) return 'declareExitNewRenew';
  if (c.exit && c.newmember) return 'declareExitNew';
  if (c.exit && c.renew) return 'declareExitRenew';
  if (c.exit) return 'declareExit';
  if (c.newmember && c.renew) return 'declareNewRenew';
  if (c.newmember) return 'declareNew';
  if (c.renew) return 'declareRenew';
  return null;
}

function _meetBuildGeneralItems(ceremonies) {
  const c = ceremonies || _meetEmptyCeremonies();
  const arr = _MEET_NORMAL_BASE.map(x => ({ ...x }));
  const declareKey = _meetPickDeclareKey(c);
  const inserts = [];
  if (declareKey) inserts.push({ ..._MEET_EVENTS[declareKey] });
  if (c.newmember) inserts.push({ ..._MEET_EVENTS.newmember });
  if (c.renew) inserts.push({ ..._MEET_EVENTS.renew });
  if (c.exit) inserts.push({ ..._MEET_EVENTS.exit });
  arr.splice(6, 0, ...inserts);
  // 單純只有出村典禮的特例調整
  const exitOnly = c.exit && !c.newmember && !c.renew;
  if (exitOnly) {
    if (arr[4]) arr[4].minutes = 4;                   // 序號5：教育培訓時間
    if (arr[6]) arr[6].topic = '宣布出村會員';         // 序號7：宣布出村會員（移除「，宣讀BNI道德規範」）
    if (arr[7]) arr[7].minutes = 4;                   // 序號8：出村典禮
  }
  return arr;
}

const _MEET_TEMPLATES = {
  general: {
    name: '一般正式例會',
    meetingType: '正式例會',
    actualDefault: '｜'
  },
  consensus: {
    name: '共識會議',
    meetingType: '正式例會 共識會議',
    actualDefault: '',
    items: _MEET_CONSENSUS_BASE.map(x => ({ ...x }))
  }
};

// 舊版本 templateId 遷移對應
const _MEET_LEGACY_CEREMONIES = {
  new_exit:   { newmember:true,  renew:false, exit:true  },
  renew_exit: { newmember:false, renew:true,  exit:true  },
  new_renew:  { newmember:true,  renew:true,  exit:false },
  full:       { newmember:true,  renew:true,  exit:true  }
};

function _meetTodayDate() {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

function _meetDefault() {
  const tpl = _MEET_TEMPLATES.general;
  const ceremonies = _meetEmptyCeremonies();
  return {
    templateId: 'general',
    title: '億展',
    seqNum: '',
    dateStr: _meetTodayDate(),
    startTime: '06:30',
    targetEndTime: '08:30',
    meetingType: tpl.meetingType,
    actualDefault: tpl.actualDefault,
    ceremonies,
    items: _meetBuildGeneralItems(ceremonies).map(x => ({ ...x, defaultMinutes: x.minutes }))
  };
}

let _meetState = null;

function _meetLoadDraft() {
  try {
    const s = localStorage.getItem(_MEET_LS_DRAFT);
    if (!s) return null;
    const d = JSON.parse(s);
    // 舊版 templateId 遷移為 general + ceremonies
    if (d && _MEET_LEGACY_CEREMONIES[d.templateId]) {
      d.ceremonies = { ..._MEET_LEGACY_CEREMONIES[d.templateId] };
      d.templateId = 'general';
    }
    if (d && !d.ceremonies) d.ceremonies = _meetEmptyCeremonies();
    // 遷移舊欄位名：主題1/主題2 → 會員1/會員2
    if (d && Array.isArray(d.items)) {
      d.items.forEach(it => {
        if (typeof it.presenter === 'string') {
          it.presenter = it.presenter.replace(/主題1/g, '會員1').replace(/主題2/g, '會員2');
        }
      });
    }
    return d;
  } catch {}
  return null;
}
function _meetSaveDraft() {
  if (!_meetState) return;
  try { localStorage.setItem(_MEET_LS_DRAFT, JSON.stringify(_meetState)); } catch {}
}
function _meetLoadVersions() {
  try { const s = localStorage.getItem(_MEET_LS_VERS); if (s) return JSON.parse(s); } catch {}
  return [];
}
function _meetSaveVersions(arr) {
  try { localStorage.setItem(_MEET_LS_VERS, JSON.stringify(arr)); } catch {}
}

function _meetParseHHMM(s) {
  const m = String(s||'').match(/^\s*(\d{1,2}):(\d{2})\s*$/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h<0||h>23||mi<0||mi>59) return null;
  return h*60 + mi;
}
function _meetFormatHHMM(min) {
  let v = ((min % (24*60)) + 24*60) % (24*60);
  v = Math.floor(v);
  return `${String(Math.floor(v/60)).padStart(2,'0')}:${String(v%60).padStart(2,'0')}`;
}
function _meetParseDuration(s) {
  const v = parseFloat(s);
  if (!isFinite(v) || v < 0) return 0;
  return v;
}
function _meetComputeTimes() {
  if (!_meetState) return [];
  let cur = _meetParseHHMM(_meetState.startTime);
  if (cur == null) cur = 6*60+30;
  return _meetState.items.map(it => {
    const start = cur;
    const dur = _meetParseDuration(it.minutes);
    cur += dur;
    return { start: _meetFormatHHMM(start), end: _meetFormatHHMM(cur) };
  });
}
function _meetFmtDur(min) {
  const v = _meetParseDuration(min);
  return Number.isInteger(v) ? `${v}min` : `${v}min`;
}

function _meetTimeStatus() {
  if (!_meetState) return null;
  const start = _meetParseHHMM(_meetState.startTime);
  const startMin = (start == null) ? (6*60+30) : start;
  const totalDur = (_meetState.items||[]).reduce((s, it) => s + _meetParseDuration(it.minutes), 0);
  const endMin = startMin + totalDur;
  const tgt = _meetParseHHMM(_meetState.targetEndTime || '08:30');
  const tgtMin = (tgt == null) ? (8*60+30) : tgt;
  const diff = Math.round(endMin - tgtMin);
  return {
    endStr: _meetFormatHHMM(endMin),
    targetStr: _meetFormatHHMM(tgtMin),
    diff,
    over: diff > 0
  };
}

function _meetAfterEdit() {
  _meetSaveDraft();
  _meetRenderBody();
  const s = _meetTimeStatus();
  if (s && s.over) {
    showToast(`總時長超過 ${s.diff} 分鐘，預計 ${s.endStr} 結束（目標 ${s.targetStr}），請調整`);
  }
}

function renderMeeting() {
  if (!_meetState) {
    _meetState = _meetLoadDraft() || _meetDefault();
  }
  const el = document.getElementById('meetingContent');
  if (!el) return;
  el.innerHTML = `
    <div class="meet-wrapper">
      <div class="meet-toolbar">
        <button class="meet-tb-btn" onclick="_meetOpenSettings()">會議設定</button>
        <span style="flex:1"></span>
        <button class="meet-tb-btn primary" onclick="_meetExportPDF()">輸出 PDF</button>
        <button class="meet-tb-btn primary" onclick="_meetExportJPG()">輸出 JPG</button>
      </div>
      <div id="meetBody"></div>
    </div>
  `;
  _meetRenderBody();
}

function _meetRenderBody() {
  const body = document.getElementById('meetBody');
  if (!body) return;
  const s = _meetTimeStatus();
  const statusHtml = (s && s.over) ? `
    <div class="meet-time-status over">
      預計結束 <b>${s.endStr}</b>（目標 <b>${s.targetStr}</b>）·
      超過 <b>${s.diff}</b> 分鐘，請縮短時長
    </div>
  ` : '';
  body.innerHTML = statusHtml + _meetRenderPreviewArea();
  _meetExpandRows();
  _meetFitPreview();
  _meetEnsureFitListener();
}

function _meetExpandRows() {
  const sheet = document.querySelector('#meetingPrintArea .meet-preview-sheet');
  if (!sheet) return;
  const title = sheet.querySelector('.meet-pv-title');
  const table = sheet.querySelector('.meet-pv-table');
  if (!title || !table) return;
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  // 重設先前設定
  tbody.querySelectorAll('tr').forEach(tr => { tr.style.height = ''; });
  const cs = getComputedStyle(sheet);
  const innerH = sheet.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const titleCs = getComputedStyle(title);
  const titleH = title.offsetHeight + parseFloat(titleCs.marginTop) + parseFloat(titleCs.marginBottom);
  const theadH = thead ? thead.offsetHeight : 0;
  const naturalH = tbody.offsetHeight;
  const availableH = innerH - titleH - theadH;
  if (availableH <= naturalH) return; // 內容已填滿或超出
  const rows = tbody.querySelectorAll('tr');
  if (!rows.length) return;
  const rowH = availableH / rows.length;
  rows.forEach(tr => { tr.style.height = rowH + 'px'; });
}

function _meetFitPreview() {
  const outer = document.querySelector('#meetingPrintArea .meet-preview-outer');
  if (!outer) return;
  const sheet = outer.querySelector('.meet-preview-sheet');
  const inner = outer.querySelector('.meet-preview-inner');
  if (!sheet || !inner) return;
  // 重置上次縮放
  sheet.style.transform = '';
  inner.style.width = '';
  inner.style.height = '';
  outer.style.overflowX = '';
  // 計算
  const containerWidth = outer.clientWidth;
  const sheetWidth = sheet.offsetWidth;
  if (sheetWidth > containerWidth && containerWidth > 0) {
    const scale = containerWidth / sheetWidth;
    sheet.style.transform = `scale(${scale})`;
    inner.style.width = sheetWidth + 'px';
    inner.style.height = (sheet.offsetHeight * scale) + 'px';
    outer.style.overflowX = 'hidden';
  }
}

function _meetEnsureFitListener() {
  if (window._meetFitListenerInstalled) return;
  window._meetFitListenerInstalled = true;
  let pending = false;
  window.addEventListener('resize', () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      _meetFitPreview();
    });
  });
}

function _meetOpenSettings() {
  const tplOptions = Object.entries(_MEET_TEMPLATES)
    .map(([id,t]) => `<option value="${id}" ${_meetState.templateId===id?'selected':''}>${_escH(t.name)}</option>`)
    .join('');
  const versions = _meetLoadVersions();
  const verOptions = versions.length
    ? versions.map(v => `<option value="${_escH(v.id)}">${_escH(v.dateStr||'')}${v.seqNum?` 第${_escH(v.seqNum)}次`:''}</option>`).join('')
    : '';
  const isAdmin = CR === 'admin';
  if (isAdmin) {
    const saved = getConfig().meetingStaff || {};
    cfgMeetingStaff = Object.assign(
      { 主席:'', 副主席:'', 秘財:'', 教育:'', 活動:'', 委員會:'', 入會:'', 續約:'', 出村:'', 導師:'', 導生:'', 會員1:'', 會員2:'' },
      saved
    );
    // 遷移舊欄位 主題1/主題2 → 會員1/會員2
    if (!cfgMeetingStaff['會員1'] && saved['主題1']) cfgMeetingStaff['會員1'] = saved['主題1'];
    if (!cfgMeetingStaff['會員2'] && saved['主題2']) cfgMeetingStaff['會員2'] = saved['主題2'];
  }
  const staffHtml = isAdmin ? `
      <div class="modal-row" style="margin-top:6px">
        <div class="modal-field" style="flex:1">
          <div class="modal-label">職務名單（例會自動帶人名）</div>
          <div style="font-size:11px;color:var(--text-soft);font-weight:500;margin-bottom:8px">主席/副主席/秘財/教育/活動 + 本週會員 + 出村導師/導生，儲存後即時生效。</div>
          ${_renderMeetingStaffBlock()}
        </div>
      </div>` : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'meetSettingsModal';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">會議設定</div>
      <div class="modal-row">
        <div class="modal-field" style="flex:1">
          <div class="modal-label">日期</div>
          <input class="modal-input" type="date" id="ms_dateStr" value="${_escH((_meetState.dateStr||'').replace(/\//g,'-'))}">
        </div>
        <div class="modal-field" style="flex:1">
          <div class="modal-label">第幾次</div>
          <input class="modal-input" id="ms_seqNum" value="${_escH(_meetState.seqNum)}" placeholder="00">
        </div>
      </div>
      <div class="modal-row">
        <div class="modal-field" style="flex:1">
          <div class="modal-label">套用範本</div>
          <select class="modal-input" style="appearance:auto;background:white;" onchange="_meetSettingsApplyTemplate(this.value)">${tplOptions}</select>
        </div>
        <div class="modal-field" style="flex:1">
          <div class="modal-label">歷史紀錄</div>
          <select class="modal-input" style="appearance:auto;background:white;" onchange="_meetSettingsLoadVersion(this.value)">
            <option value="">${versions.length?'（選擇載入）':'（尚無紀錄）'}</option>
            ${verOptions}
          </select>
        </div>
      </div>
      <div class="modal-row" id="ms_ceremonyRow" style="${_meetState.templateId==='general' ? '' : 'display:none'}">
        <div class="modal-field" style="flex:1">
          <div class="modal-label">儀式組合（可複選，依勾選自動產生流程）</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${_MEET_CEREMONY_KEYS.map(k => {
              const on = !!(_meetState.ceremonies && _meetState.ceremonies[k]);
              return `<button type="button" class="meet-tb-btn ${on?'active':''}" onclick="_meetSettingsToggleCeremony('${k}')">${_MEET_CEREMONY_LABELS[k]}</button>`;
            }).join('')}
          </div>
        </div>
      </div>
      ${staffHtml}
      <div class="modal-btns" style="flex-wrap:wrap;gap:8px;margin-top:10px">
        <button class="meet-tb-btn" onclick="_meetSettingsSaveVersion()">另存新版</button>
        <button class="meet-tb-btn" onclick="_meetCommitSettingsModal();_meetCloseSettings();_meetManageVersions()">版本管理</button>
        <button class="meet-tb-btn" onclick="_meetSettingsReset()">重設為範本</button>
      </div>
      <div class="modal-btns">
        <button class="modal-save" onclick="_meetCommitSettingsModal();_meetCloseSettings();_meetAfterEdit()">完成</button>
        <button class="modal-cancel" onclick="_meetCloseSettings()">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function _meetCloseSettings() {
  const m = document.getElementById('meetSettingsModal');
  if (m) m.remove();
}

function _meetCommitSettingsModal() {
  const v = id => document.getElementById(id);
  if (v('ms_dateStr')) _meetState.dateStr = (v('ms_dateStr').value || '').replace(/-/g,'/');
  if (v('ms_seqNum')) _meetState.seqNum = v('ms_seqNum').value;
  _meetSaveDraft();
  _meetSaveStaffToConfig();
}

function _meetSaveStaffToConfig() {
  if (CR !== 'admin') return;
  const current = cache['__config__'] || {};
  saveConfigData({ ...current, meetingStaff: { ...cfgMeetingStaff } });
}

function _meetSettingsApplyTemplate(id) {
  if (!id) return;
  if (id === _meetState.templateId) return;
  _meetCommitSettingsModal();
  _meetApplyTemplate(id);
  _meetCloseSettings();
  _meetOpenSettings();
}

function _meetSettingsToggleCeremony(key) {
  if (_meetState.templateId !== 'general') return;
  const cur = !!(_meetState.ceremonies && _meetState.ceremonies[key]);
  _meetCommitSettingsModal();
  _meetSetCeremony(key, !cur);
  _meetCloseSettings();
  _meetOpenSettings();
}

function _meetSettingsLoadVersion(id) {
  if (!id) return;
  _meetCommitSettingsModal();
  _meetLoadVersion(id);
  _meetCloseSettings();
  _meetOpenSettings();
}

function _meetSettingsReset() {
  _meetCommitSettingsModal();
  _meetReset();
  _meetCloseSettings();
  _meetOpenSettings();
}

function _meetSettingsSaveVersion() {
  _meetCommitSettingsModal();
  _meetSaveAsVersion();
  _meetCloseSettings();
  _meetOpenSettings();
}

function _meetOpenRowEditor(idx) {
  const it = _meetState.items[idx];
  if (!it) return;
  const noteRows = Math.max(3, String(it.note||'').split('\n').length);
  const labelStyle = 'padding:9px 12px;border:1.5px solid var(--gray-border);border-radius:8px;background:#f5f5f5;color:var(--text);font-size:14px;font-weight:600;line-height:1.5;white-space:pre-wrap;min-height:36px;box-sizing:border-box;';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'meetRowModal';
  overlay.dataset.idx = String(idx);
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">第 ${idx+1} 項</div>
      <div class="modal-field" style="margin-bottom:6px">
        <label style="font-weight:700;color:var(--text);font-size:13px;display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" id="mr_fixed" ${it.fixed?'checked':''} style="margin:0;width:auto" onchange="_meetModalSyncLock(this.checked)"> 鎖定（勾選後此項所有欄位不可編輯）
        </label>
      </div>
      <div class="modal-field">
        <div class="modal-label">議程</div>
        <div style="${labelStyle}">${_escH(it.topic||'')}</div>
        ${it.titleHighlight ? '<div style="font-size:11px;color:var(--text-soft);font-weight:500;margin-top:6px;">＊紅字標題項目</div>' : ''}
      </div>
      <div class="modal-field">
        <div class="modal-label">報告人</div>
        <div style="${labelStyle}">${_escH(_resolveMeetingPresenter(it.presenter||''))}</div>
      </div>
      <div class="modal-field">
        <div class="modal-label">
          時長(分)
          ${(it.defaultMinutes != null) ? `<span style="color:var(--text-soft);font-weight:500;margin-left:8px">建議 ${it.defaultMinutes} 分</span>` : ''}
        </div>
        <input class="modal-input" id="mr_minutes" type="number" min="0" step="0.5" value="${it.minutes}">
        ${(it.defaultMinutes != null) ? `<div style="margin-top:8px"><button type="button" id="mr_revertBtn" class="meet-tb-btn" style="padding:5px 10px;font-size:11px" onclick="_meetModalRevertMinutes(${it.defaultMinutes})">重設為建議 ${it.defaultMinutes} 分</button></div>` : ''}
      </div>
      <div class="modal-field">
        <div class="modal-label">備註（可換行多行）</div>
        <textarea class="modal-input" id="mr_note" rows="${noteRows}" style="resize:vertical;line-height:1.4">${_escH(it.note||'')}</textarea>
      </div>
      <div class="modal-btns">
        <button class="modal-save" onclick="_meetSaveRowEditor()">儲存</button>
        <button class="modal-cancel" onclick="_meetCloseRowEditor()">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  _meetModalSyncLock(!!it.fixed);
  setTimeout(() => { document.getElementById(it.fixed?'mr_fixed':'mr_minutes')?.focus(); }, 30);
}

function _meetRowModalIdx() {
  const m = document.getElementById('meetRowModal');
  return m ? parseInt(m.dataset.idx, 10) : -1;
}

function _meetCloseRowEditor() {
  const m = document.getElementById('meetRowModal');
  if (m) m.remove();
}

function _meetCommitRowModal() {
  const idx = _meetRowModalIdx();
  if (idx < 0) return -1;
  const it = _meetState.items[idx];
  if (!it) return -1;
  const v = id => document.getElementById(id);
  if (v('mr_minutes')) it.minutes = _meetParseDuration(v('mr_minutes').value);
  if (v('mr_note')) it.note = v('mr_note').value;
  const f = v('mr_fixed'); if (f) it.fixed = f.checked;
  return idx;
}

function _meetModalSyncLock(locked) {
  const setReadonly = (el, on) => {
    if (!el) return;
    if (on) {
      el.setAttribute('readonly', 'readonly');
      el.style.background = '#f5f5f5';
      el.style.color = 'var(--text-soft)';
      el.style.cursor = 'not-allowed';
    } else {
      el.removeAttribute('readonly');
      el.style.background = '';
      el.style.color = '';
      el.style.cursor = '';
    }
  };
  const setDisabled = (el, on) => {
    if (!el) return;
    el.disabled = !!on;
    el.style.cursor = on ? 'not-allowed' : '';
    el.style.opacity = on ? '0.5' : '';
  };
  const minutes = document.getElementById('mr_minutes');
  const note = document.getElementById('mr_note');
  const revertBtn = document.getElementById('mr_revertBtn');
  setReadonly(minutes, locked);
  setReadonly(note, locked);
  setDisabled(revertBtn, locked);
}

function _meetModalRevertMinutes(d) {
  const inp = document.getElementById('mr_minutes');
  if (!inp) return;
  if (inp.hasAttribute('readonly')) {
    showToast('已鎖定，請先取消鎖定再重設');
    return;
  }
  inp.value = d;
}

function _meetSaveRowEditor() {
  _meetCommitRowModal();
  _meetCloseRowEditor();
  _meetAfterEdit();
}


function _meetRenderPreviewArea() {
  return `<div id="meetingPrintArea">${_meetRenderPreview()}</div>`;
}

function _meetRenderPreview() {
  const times = _meetComputeTimes();
  const meetingType = _meetState.meetingType || '正式例會';
  const titleHtml = `${_meetState.dateStr||''} ${_meetState.title||''}第 ${_meetState.seqNum||'00'} 次${meetingType}流程表`;
  const actual = _meetState.actualDefault || '';
  const rows = _meetState.items.map((it, idx) => {
    const t = times[idx];
    const titleCls = it.titleHighlight ? 'is-title' : '';
    const serialRowCls = it.serialHighlight ? ' is-serial-row' : '';
    const lockedCls = it.fixed ? ' is-locked' : '';
    const highlightCls = it.serialHighlight ? ' is-serial-highlight' : '';
    const noTd = `<td class="col-no meet-pv-no-btn${lockedCls}${highlightCls}" title="點擊編輯此項" onclick="_meetOpenRowEditor(${idx})">${idx+1}</td>`;
    return `
      <tr class="${titleCls}${serialRowCls}">
        ${noTd}
        <td class="col-topic">${_escH(it.topic||'').replace(/\n/g,'<br>')}</td>
        <td class="col-presenter">${_escH(_resolveMeetingPresenter(it.presenter||'')).replace(/\n/g,'<br>')}</td>
        <td class="col-dur">${_meetFmtDur(it.minutes)}</td>
        <td class="col-st">${t.start}</td>
        <td class="col-et">${t.end}</td>
        <td class="col-actual">${_escH(actual)}</td>
        <td class="col-note">${_escH(it.note||'').replace(/\n/g,'<br>')}</td>
      </tr>
    `;
  }).join('');
  return `
    <div class="meet-preview-outer">
      <div class="meet-preview-inner">
        <div class="meet-preview-sheet">
          <div class="meet-pv-title">${_escH(titleHtml)}</div>
          <table class="meet-pv-table">
            <colgroup>
              <col class="col-no"><col class="col-topic"><col class="col-presenter">
              <col class="col-dur"><col class="col-st"><col class="col-et"><col class="col-actual"><col class="col-note">
            </colgroup>
            <thead>
              <tr><th>序號</th><th>議程</th><th>報告人</th><th class="col-dur">時長/分</th><th class="col-st">開始</th><th class="col-et">結束</th><th class="col-actual">實際</th><th>備註</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function _meetApplyTemplate(id) {
  const t = _MEET_TEMPLATES[id];
  if (!t) return;
  if (!confirm(`套用「${t.name}」範本？目前的編輯內容將被覆蓋（已存版本不受影響）。`)) {
    renderMeeting();
    return;
  }
  _meetState.templateId = id;
  _meetState.meetingType = t.meetingType;
  _meetState.actualDefault = t.actualDefault;
  _meetState.ceremonies = _meetEmptyCeremonies();
  if (id === 'consensus') {
    _meetState.items = _MEET_CONSENSUS_BASE.map(x => ({ ...x, defaultMinutes: x.minutes }));
  } else {
    _meetState.items = _meetBuildGeneralItems(_meetState.ceremonies).map(x => ({ ...x, defaultMinutes: x.minutes }));
  }
  _meetSaveDraft();
  renderMeeting();
}
function _meetReset() {
  _meetApplyTemplate(_meetState.templateId);
}

function _meetSetCeremony(key, on) {
  if (_meetState.templateId !== 'general') return;
  if (!_meetState.ceremonies) _meetState.ceremonies = _meetEmptyCeremonies();
  if (!!_meetState.ceremonies[key] === !!on) return;
  if (!confirm(`${on?'加入':'移除'}「${_MEET_CEREMONY_LABELS[key]}」？流程內容將依組合重新產生（手動編輯將被覆蓋，已存版本不受影響）。`)) {
    return;
  }
  _meetState.ceremonies = { ..._meetState.ceremonies, [key]: !!on };
  _meetState.items = _meetBuildGeneralItems(_meetState.ceremonies).map(x => ({ ...x, defaultMinutes: x.minutes }));
  _meetSaveDraft();
  renderMeeting();
}

function _meetSaveAsVersion() {
  const dateStr = _meetState.dateStr || _meetTodayDate();
  const seqNum = _meetState.seqNum || '';
  const title = _meetState.title || '億展';
  const versions = _meetLoadVersions();
  const dup = seqNum ? versions.find(v => v.dateStr === dateStr && v.seqNum === seqNum) : null;
  const snapshot = {
    id: dup ? dup.id : `v_${Date.now()}`,
    dateStr, seqNum, title,
    templateId: _meetState.templateId,
    ceremonies: { ...(_meetState.ceremonies || _meetEmptyCeremonies()) },
    startTime: _meetState.startTime,
    targetEndTime: _meetState.targetEndTime || '08:30',
    meetingType: _meetState.meetingType || '正式例會',
    actualDefault: _meetState.actualDefault || '',
    items: JSON.parse(JSON.stringify(_meetState.items)),
    savedAt: new Date().toISOString()
  };
  if (dup) {
    if (!confirm(`同日期＋同次數已有版本（${dateStr} 第${seqNum}次），覆蓋？`)) return;
    Object.assign(dup, snapshot);
  } else {
    versions.unshift(snapshot);
  }
  _meetSaveVersions(versions);
  showToast('已存版本');
  renderMeeting();
}

function _meetLoadVersion(id) {
  const v = _meetLoadVersions().find(x => x.id === id);
  if (!v) return;
  // 舊版本 templateId 遷移為 general + ceremonies
  let templateId = v.templateId || 'general';
  let ceremonies = v.ceremonies ? { ..._meetEmptyCeremonies(), ...v.ceremonies } : null;
  if (_MEET_LEGACY_CEREMONIES[templateId]) {
    ceremonies = { ..._MEET_LEGACY_CEREMONIES[templateId] };
    templateId = 'general';
  }
  if (!ceremonies) ceremonies = _meetEmptyCeremonies();
  _meetState = {
    templateId,
    title: v.title || '億展',
    seqNum: v.seqNum || '',
    dateStr: v.dateStr || _meetTodayDate(),
    startTime: v.startTime || '06:30',
    targetEndTime: v.targetEndTime || '08:30',
    meetingType: v.meetingType || '正式例會',
    actualDefault: v.actualDefault || '',
    ceremonies,
    items: JSON.parse(JSON.stringify(v.items || []))
  };
  _meetSaveDraft();
  renderMeeting();
  showToast('已載入版本');
}

function _meetManageVersions() {
  const versions = _meetLoadVersions();
  const body = document.getElementById('meetBody');
  if (!body) return;
  if (!versions.length) {
    showToast('尚無歷史紀錄');
    return;
  }
  body.innerHTML = `
    <div class="meet-version-list">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:13px;font-weight:900;color:var(--text)">歷史版本（${versions.length}）</div>
        <button class="meet-tb-btn" onclick="_meetRenderBody()">返回</button>
      </div>
      ${versions.map(v => `
        <div class="meet-version-item">
          <div class="meet-v-info">
            <div class="meet-v-title">${_escH(v.dateStr||'')}${v.seqNum?` 第${_escH(v.seqNum)}次`:''}</div>
            <div class="meet-v-sub">${_escH(_meetVersionLabel(v))} · ${(v.items||[]).length} 項 · 存於 ${(v.savedAt||'').slice(0,10)}</div>
          </div>
          <button onclick="_meetLoadVersion('${_escH(v.id)}')">載入</button>
          <button class="danger" onclick="_meetDelVersion('${_escH(v.id)}')">刪除</button>
        </div>
      `).join('')}
    </div>
  `;
}

function _meetVersionLabel(v) {
  let templateId = v.templateId || 'general';
  let ceremonies = v.ceremonies;
  if (_MEET_LEGACY_CEREMONIES[templateId]) {
    ceremonies = _MEET_LEGACY_CEREMONIES[templateId];
    templateId = 'general';
  }
  const baseName = _MEET_TEMPLATES[templateId]?.name || templateId || '';
  if (templateId !== 'general' || !ceremonies) return baseName;
  const extras = _MEET_CEREMONY_KEYS.filter(k => ceremonies[k]).map(k => _MEET_CEREMONY_LABELS[k]);
  return extras.length ? `${baseName}＋${extras.join('＋')}` : baseName;
}

function _meetDelVersion(id) {
  if (!confirm('刪除這個版本？')) return;
  const versions = _meetLoadVersions().filter(v => v.id !== id);
  _meetSaveVersions(versions);
  _meetManageVersions();
}

async function _meetExportPDF() {
  showLoader(true, 'PDF 產生中...');
  try {
    await Promise.all([
      _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'),
      _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
    ]);
  } catch (e) {
    console.error('[PDF script load]', e);
    showLoader(false);
    showToast('PDF 套件載入失敗，請確認網路');
    return;
  }
  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!jsPDFCtor) { showLoader(false); showToast('jsPDF 初始化失敗'); return; }
  const sheet = document.querySelector('#meetingPrintArea .meet-preview-sheet');
  if (!sheet) { showLoader(false); showToast('找不到預覽區'); return; }
  document.body.classList.add('meet-print-mode');
  await new Promise(r => setTimeout(r, 100)); // 等 layout 更新
  try {
    console.log('[PDF] start html2canvas, sheet=', sheet.offsetWidth, 'x', sheet.offsetHeight);
    const canvas = await Promise.race([
      html2canvas(sheet, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, imageTimeout: 5000 }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('截圖逾時 60 秒')), 60000))
    ]);
    console.log('[PDF] canvas ready', canvas.width, 'x', canvas.height);
    const imgData = canvas.toDataURL('image/jpeg', 0.9);
    const pdf = new jsPDFCtor({ orientation: 'p', unit: 'mm', format: 'a4' });
    pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
    const safeName = `例會流程_${_meetState.dateStr || _meetTodayDate()}_第${_meetState.seqNum||'00'}次`.replace(/[\\/:*?"<>|]/g,'_') + '.pdf';
    _downloadPdfBlob(pdf.output('blob'), safeName);
    showToast('PDF 已產生');
  } catch (e) {
    console.error('[PDF export]', e);
    showToast('PDF 匯出失敗：' + (e && e.message ? e.message : e));
  } finally {
    document.body.classList.remove('meet-print-mode');
    showLoader(false);
  }
}

async function _meetExportJPG() {
  showLoader(true, 'JPG 產生中...');
  try {
    await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  } catch { showLoader(false); showToast('JPG 套件載入失敗，請確認網路'); return; }
  const sheet = document.querySelector('#meetingPrintArea .meet-preview-sheet');
  if (!sheet) { showLoader(false); showToast('找不到預覽區'); return; }
  document.body.classList.add('meet-print-mode');
  await new Promise(r => setTimeout(r, 80));
  try {
    const canvas = await html2canvas(sheet, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const a = document.createElement('a');
    const safeName = `例會流程_${_meetState.dateStr || _meetTodayDate()}_第${_meetState.seqNum||'00'}次`.replace(/[\\/:*?"<>|]/g,'_');
    a.href = dataUrl;
    a.download = safeName + '.jpg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast('JPG 已下載');
  } catch (e) {
    showToast('JPG 匯出失敗');
  } finally {
    document.body.classList.remove('meet-print-mode');
    showLoader(false);
  }
}

