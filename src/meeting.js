// ===== 例會流程 =====
const _MEET_LS_DRAFT = 'bni_meeting_draft_v2';
const _MEET_LS_VERS  = 'bni_meeting_versions_v2';
const MEETING_ROLES   = ['主席','副主席','秘財','教育','活動'];
const MEETING_MEMBERS = ['入會','續約','出村']; // 對應「會員-入會 / 會員-續約 / 會員-出村」
const MEETING_EXIT_ROLES = ['導師','導生']; // 出村相關（每週調整）
const MEETING_SPEAKER_ROLES = ['會員1','會員2']; // 本週主題簡報講者
const MEETING_COMMITTEE_ROLES = ['委員會']; // 本週委員會（每週調整）
const MEETING_BOD_ROLES = ['主持','董顧']; // BOD 來賓日專用（每次調整）
const MEETING_BOD_SHARE_ROLES = ['分享1','分享2','分享3']; // BOD 三段分享者（每次調整）

function _meetingPresenterMatch(line) {
  const trimmed = line.trim();
  // 1) 職務或職務-後綴（如「主席」、「副主席-主持」、「秘財-卸任」、「導師」、「主題1」、「委員會-1」）
  const allRoles = [...MEETING_ROLES, ...MEETING_EXIT_ROLES, ...MEETING_SPEAKER_ROLES, ...MEETING_COMMITTEE_ROLES, ...MEETING_BOD_ROLES, ...MEETING_BOD_SHARE_ROLES];
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
  { topic:'會員25秒專業呈現', presenter:'主席', minutes:21, auto:{ by:'member', sec:25, ring:{ a:-10, b:0 } }, note:'□計時 0:15按●，0:25按●●' },
  { topic:'來賓10秒自我介紹', presenter:'主席', minutes:2, auto:{ by:'guest', sec:10, ring:{ a:0, b:5 } }, note:'□計時 0:10按●，0:15按●●' },
  { topic:'副主席報告', presenter:'副主席', minutes:3, note:'□計時 2:30按●，3:00按●●', fixed:true },
  { topic:'會員委員會報告', presenter:'委員會', minutes:2, note:'□計時 1:30按●，2:00按●●', fixed:true, serialHighlight:true },
  { topic:'秘書財務報告\n未來六週主題講者', presenter:'秘財', minutes:1.5, note:'□計時 1:00按●，1:30按●●', fixed:true },
  { topic:'主題簡報', presenter:'會員1\n會員2', minutes:11, note:'□計時 4:30按●，5:00按●●', titleHighlight:true, serialHighlight:true },
  { topic:'會員10秒業務引薦時間', presenter:'主席', minutes:10, auto:{ by:'member', sec:10 }, note:'□計時 0:10按●●' },
  { topic:'來賓分享10秒', presenter:'主席', minutes:2, auto:{ by:'guest', sec:10 }, note:'□計時 1:30按●，2:00按●●' },
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
  declareNewRenew: { topic:'宣布新人入會、續約，宣讀BNI道德規範', presenter:'主席', minutes:2, note:'□計時 1:30按●，2:00按●●', serialHighlight:true },
  declareExitNewRenew: { topic:'宣布新人入會、續約，宣讀BNI道德規範', presenter:'主席', minutes:2, note:'□計時 1:30按●，2:00按●●', serialHighlight:true },
  declareExitRenew: { topic:'宣布出村、續約會員，宣讀BNI道德規範', presenter:'主席', minutes:2, note:'□計時 1:30按●，2:00按●●', serialHighlight:true },
  declareExitNew: { topic:'宣布出村、新人入會，宣讀BNI道德規範', presenter:'主席', minutes:2, note:'□計時 1:30按●，2:00按●●', serialHighlight:true },
  newmember: { topic:'入會感言\n→五長拍照', presenter:'副主席-主持\n會員-入會', minutes:2, note:'□計時 0:30按●，1:00按●●\n□計時 0:30按●，1:00按●●', serialHighlight:true },
  renew: { topic:'續約感言\n→五長拍照', presenter:'副主席-主持\n會員-續約', minutes:2, note:'□計時 0:30按●，1:00按●●\n□計時 0:30按●，1:00按●●', serialHighlight:true },
  newRenewMerged: { topic:'入會感言\n續約感言\n→五長拍照', presenter:'副主席-主持\n會員-入會\n會員-續約\n', minutes:3, note:'□計時 0:30按●，1:00按●●\n□計時 0:30按●，1:00按●●\n□計時 0:30按●，1:00按●●', serialHighlight:true },
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
  const allThree = c.newmember && c.renew && c.exit;
  if (allThree) {
    inserts.push({ ..._MEET_EVENTS.newRenewMerged });
  } else {
    if (c.newmember) inserts.push({ ..._MEET_EVENTS.newmember });
    if (c.renew) inserts.push({ ..._MEET_EVENTS.renew });
  }
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

// BOD（來賓日）基底（18 項，完全獨立議程，會前會 05:30 起算）
// 報告人：標準職務(主席/副主席/秘財)＋BOD職務(主持/董顧)自動帶人名；分享1/2/3 由 BOD分享者欄位帶
// 備註：僅保留「□計時 m:ss按●，m:ss按●●」計時格式，其餘操作說明一律不放
const _MEET_BOD_BASE = [
  { topic:'會前會', presenter:'ALL', minutes:60, note:'' },
  { topic:'來賓報到、交流、拍照', presenter:'主持', minutes:30, note:'' },
  { topic:'宣佈大會開始', presenter:'主持', minutes:2, note:'□計時 1:30按●，2:00按●●' },
  { topic:'主席介紹來賓', presenter:'主席', minutes:1, note:'□計時 0:30按●，1:00按●●' },
  { topic:'介紹執董及領導團隊及會員', presenter:'主席', minutes:3, note:'□計時 2:30按●，3:00按●●' },
  { topic:'What is BNI?', presenter:'主席', minutes:4, note:'□計時 4:30按●，5:00按●●' },
  { topic:'會員25秒專業呈現', presenter:'主持', minutes:23, auto:{ by:'member', sec:25, ring:{ a:-10, b:0 } }, note:'□計時 0:15按●，0:25按●●' },
  { topic:'來賓10秒自我介紹', presenter:'主持', minutes:8.5, auto:{ by:'guest', sec:10, ring:{ a:0, b:5 } }, note:'□計時 0:10按●，0:15按●●' },
  { topic:'搶答活動', presenter:'活動', minutes:6.5, editableTopic:true, note:'□計時 0:15按●，0:30按●●\n□計時 1:00按●，1:30按●●' },
  { topic:'BNI:How it works?', presenter:'分享1', minutes:5, note:'□計時 4:30按●，5:00按●●' },
  { topic:'分會的願景', presenter:'副主席', minutes:3, note:'□計時 2:30按●，3:00按●●' },
  { topic:'會員收穫分享', presenter:'分享2', minutes:5, note:'□計時 4:30按●，5:00按●●' },
  { topic:'會員產業合作分享', presenter:'分享3', minutes:5, note:'□計時 4:30按●，5:00按●●' },
  { topic:'會員12秒業務引薦時間', presenter:'主持', minutes:7, auto:{ by:'member', sec:12 }, note:'□計時 0:12按●' },
  { topic:'來賓分享12秒', presenter:'主持', minutes:8, auto:{ by:'guest', sec:12 }, note:'□計時 0:10按●，0:12按●●' },
  { topic:'BNI:How to apply?', presenter:'秘財', minutes:4.5, note:'□計時 4:00按●，4:30按●●' },
  { topic:'董顧再次介紹分會', presenter:'董顧', minutes:3, note:'□計時 2:30按●，3:00按●●' },
  { topic:'結語及口號', presenter:'主席', minutes:1, note:'□計時 0:30按●，1:00按●●' }
];

const _MEET_TEMPLATES = {
  general: {
    name: '一般正式例會',
    meetingType: '正式例會',
    actualDefault: '｜',
    startTime: '06:30'
  },
  consensus: {
    name: '共識會議',
    meetingType: '正式例會 共識會議',
    actualDefault: '',
    startTime: '06:30',
    items: _MEET_CONSENSUS_BASE.map(x => ({ ...x }))
  },
  bod: {
    name: 'BOD 來賓日',
    meetingType: '正式例會(BOD)',
    actualDefault: '｜',
    startTime: '05:30',
    items: _MEET_BOD_BASE.map(x => ({ ...x }))
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
    memberCount: '',
    guestCount: '',
    ceremonies,
    items: _meetBuildGeneralItems(ceremonies).map(x => ({ ...x, auto: x.auto ? { ...x.auto } : undefined, defaultMinutes: x.minutes }))
  };
}

let _meetState = null;

// 依本週會員/來賓人數重算「隨人數滾動」項目的時長
// item.auto = { by:'member'|'guest', sec:每人秒數(含上下台緩衝) }
// 現有會員人數（會員資料載入後可得，否則 null）
function _meetGetMemberCount() {
  return Array.isArray(_memberData) ? _memberData.filter(m => m && m.name).length : null;
}

// 人數有填(>0) → 時長 = ceil(人數×秒/60)（進位到整數分）；人數未填 → 還原為範本建議時長 defaultMinutes
// 會員人數一律抓現有會員數（鎖定，不手填）；來賓人數為手填
function _meetRecalcHeadcount() {
  if (!_meetState || !Array.isArray(_meetState.items)) return;
  const auto = _meetGetMemberCount();
  if (auto != null) _meetState.memberCount = auto;
  const mc = parseInt(_meetState.memberCount, 10);
  const gc = parseInt(_meetState.guestCount, 10);
  _meetState.items.forEach(it => {
    if (!it.auto) return;
    const cnt = it.auto.by === 'guest' ? gc : mc;
    const sec = parseFloat(it.auto.sec);
    if (!isFinite(cnt) || cnt <= 0 || !isFinite(sec) || sec <= 0) {
      if (it.defaultMinutes != null) it.minutes = it.defaultMinutes;
      return;
    }
    it.minutes = Math.ceil(cnt * sec / 60);
  });
}

// 秒數 → m:ss（如 25→"0:25"、70→"1:10"）
function _meetClock(s) {
  s = Math.max(0, Math.round(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
// 依每人秒數自動產生計時備註：按●=秒數+ring.a、按●●=秒數+ring.b
// 會員專業呈現 ring:{a:-10,b:0}（按●=秒-10、按●●=秒）；來賓自我介紹 ring:{a:0,b:5}（按●=秒、按●●=秒+5）
function _meetAutoNote(it) {
  if (!it || !it.auto || !it.auto.ring) return null;
  const sec = parseFloat(it.auto.sec);
  if (!isFinite(sec) || sec <= 0) return null;
  const a = Math.max(0, sec + it.auto.ring.a);
  const b = Math.max(0, sec + it.auto.ring.b);
  return `□計時 ${_meetClock(a)}按●，${_meetClock(b)}按●●`;
}

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
    // 遷移：宣布道德規範句子改為「新人入會、續約」順序
    if (d && Array.isArray(d.items)) {
      d.items.forEach(it => {
        if (typeof it.topic === 'string') {
          if (it.topic === '宣布出村、續約、新人入會，宣讀BNI道德規範' ||
              it.topic === '宣布續約、新人入會，宣讀BNI道德規範') {
            it.topic = '宣布新人入會、續約，宣讀BNI道德規範';
          }
        }
      });
    }
    // 遷移：BOD 搶答活動報告人預設由「主持」改為「活動」（活動負責）、議程文字可編輯
    if (d && d.templateId === 'bod' && Array.isArray(d.items)) {
      d.items.forEach(it => {
        if (it.topic === '搶答活動') {
          if (it.presenter === '主持') it.presenter = '活動';
          if (!it.editableTopic) it.editableTopic = true;
        }
      });
    }
    // 遷移：三個全選時合併入會/續約感言
    if (d && d.templateId === 'general' && d.ceremonies && d.ceremonies.newmember && d.ceremonies.renew && d.ceremonies.exit && Array.isArray(d.items)) {
      const hasNew = d.items.some(it => it.topic === '入會感言\n→五長拍照');
      const hasRenew = d.items.some(it => it.topic === '續約感言\n→五長拍照');
      const hasMerged = d.items.some(it => it.topic === '入會感言\n續約感言\n→五長拍照');
      if (hasNew && hasRenew && !hasMerged) {
        d.items = _meetBuildGeneralItems(d.ceremonies).map(x => ({ ...x, auto: x.auto ? { ...x.auto } : undefined, defaultMinutes: x.minutes }));
      }
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

async function _meetFetchVersionsRemote() {
  try {
    const res = await fetch(API_URL + '?action=listMeetingVersions&t=' + Date.now(), { signal: AbortSignal.timeout(10000) });
    const json = await res.json();
    if (json && json.ok && Array.isArray(json.data)) {
      _meetSaveVersions(json.data);
      return json.data;
    }
  } catch {}
  return null;
}

function _meetSaveVersionRemote(version) {
  try { _apiPost({ action: 'saveMeetingVersion', version }); } catch {}
}

function _meetDeleteVersionRemote(id) {
  try { _apiPost({ action: 'deleteMeetingVersion', id }); } catch {}
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
  _meetAutoSyncVersion();
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
        <button class="meet-tb-btn" onclick="_meetManageVersions()">版本管理</button>
        <button class="meet-tb-btn" onclick="_meetOpenAddItem()">新增項目</button>
        <span style="flex:1"></span>
        <button class="meet-tb-btn primary" onclick="_meetExportPDF()">PDF</button>
        <button class="meet-tb-btn primary" onclick="_meetExportJPG()">JPG</button>
      </div>
      <div id="meetBody"></div>
    </div>
  `;
  _meetRenderBody();
}

// 目前流程（同日期＋次數）對應到版本管理的版本（無則 null）
function _meetLinkedVersion() {
  if (!_meetState) return null;
  const seqNum = _meetState.seqNum || '';
  if (!seqNum) return null;
  const dateStr = _meetState.dateStr || '';
  return _meetLoadVersions().find(v => v.dateStr === dateStr && v.seqNum === seqNum) || null;
}

function _meetRenderBody() {
  const body = document.getElementById('meetBody');
  if (!body) return;
  const linked = _meetLinkedVersion();
  const linkHtml = linked
    ? `<div style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#1a7f37;background:#e7f5ec;border:1px solid #b7e0c4;border-radius:999px;padding:5px 12px;margin-bottom:10px;">● 已連動版本：${_escH(linked.dateStr||'')} 第 ${_escH(linked.seqNum||'')} 次 · 編輯自動存入</div>`
    : `<div style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--text-soft);background:#f4f6f8;border:1px solid var(--gray-border);border-radius:999px;padding:5px 12px;margin-bottom:10px;">○ 尚未存版本 · 按「另存新版」後編輯自動連動</div>`;
  const s = _meetTimeStatus();
  const statusHtml = (s && s.over) ? `
    <div class="meet-time-status over">
      預計結束 <b>${s.endStr}</b>（目標 <b>${s.targetStr}</b>）·
      超過 <b>${s.diff}</b> 分鐘，請縮短時長
    </div>
  ` : '';
  body.innerHTML = `<div>${linkHtml}</div>` + statusHtml + _meetRenderPreviewArea();
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
  const bottomReserve = parseFloat(cs.paddingBottom);
  const availableH = innerH - titleH - theadH - bottomReserve;
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
  _meetRecalcHeadcount(); // 先同步會員人數（現有會員數）
  const tplOptions = Object.entries(_MEET_TEMPLATES)
    .map(([id,t]) => `<option value="${id}" ${_meetState.templateId===id?'selected':''}>${_escH(t.name)}</option>`)
    .join('');
  const versions = _meetSortVersions(_meetLoadVersions());
  const verOptions = versions.length
    ? versions.map(v => `<option value="${_escH(v.id)}">${_escH(v.dateStr||'')}${v.seqNum?` 第${_escH(v.seqNum)}次`:''}</option>`).join('')
    : '';
  const isAdmin = CR === 'admin';
  if (isAdmin) {
    const saved = getConfig().meetingStaff || {};
    cfgMeetingStaff = Object.assign(
      { 主席:'', 副主席:'', 秘財:'', 教育:'', 活動:'', 主持:'', 董顧:'', 分享1:'', 分享2:'', 分享3:'', 委員會:'', 入會:'', 續約:'', 出村:'', 導師:'', 導生:'', 會員1:'', 會員2:'' },
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
          <div style="font-size:11px;color:var(--text-soft);font-weight:500;margin-bottom:8px">${_meetState.templateId==='bod' ? '主席/副主席/秘財/教育/活動 + BOD分享者 + 主持/董顧，儲存後即時生效。' : '主席/副主席/秘財/教育/活動 + 本週會員 + 出村導師/導生，儲存後即時生效。'}</div>
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
      <div class="modal-row">
        <div class="modal-field" style="flex:1">
          <div class="modal-label">本週會員人數 <span style="color:var(--text-soft);font-weight:500">（現有會員自動帶）</span></div>
          <input class="modal-input" id="ms_memberCount" type="number" value="${_escH(_meetState.memberCount||'')}" readonly title="自動抓現有會員人數，不可編輯" style="background:#f5f5f5;color:var(--text-soft);cursor:not-allowed" placeholder="載入中…">
        </div>
        <div class="modal-field" style="flex:1">
          <div class="modal-label">本週來賓人數</div>
          <input class="modal-input" id="ms_guestCount" type="number" min="0" inputmode="numeric" value="${_escH(_meetState.guestCount||'')}" placeholder="例：8" oninput="_meetSettingsOnCount('guest',this.value)">
        </div>
      </div>
      <div class="modal-row" style="margin-top:-4px">
        <div class="modal-field" style="flex:1">
          <div style="font-size:11px;color:var(--text-soft);font-weight:500">會員人數自動抓現有會員數（鎖定不可改）；來賓人數請手填。會員專業呈現／業務引薦、來賓自我介紹／分享等項目時長會依「人數×每人秒數」自動換算。</div>
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
        <button class="meet-tb-btn" onclick="_meetSettingsReset()">重設為範本</button>
      </div>
      <div class="modal-btns">
        <button class="modal-save" onclick="_meetCommitSettingsModal();_meetCloseSettings();_meetAfterEdit()">完成</button>
        <button class="modal-cancel" onclick="_meetCloseSettings()">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  // 會員資料尚未載入 → 抓一次再帶入會員人數並更新預覽
  if (_meetGetMemberCount() == null && typeof fetchMembers === 'function') {
    fetchMembers().then(() => {
      _meetRecalcHeadcount();
      _meetSaveDraft();
      const el = document.getElementById('ms_memberCount');
      if (el) el.value = _meetState.memberCount;
      if (typeof _meetRenderBody === 'function') _meetRenderBody();
    }).catch(() => {});
  }
}

function _meetCloseSettings() {
  const m = document.getElementById('meetSettingsModal');
  if (m) m.remove();
}

function _meetCommitSettingsModal() {
  const v = id => document.getElementById(id);
  if (v('ms_dateStr')) _meetState.dateStr = (v('ms_dateStr').value || '').replace(/-/g,'/');
  if (v('ms_seqNum')) _meetState.seqNum = v('ms_seqNum').value;
  if (v('ms_guestCount')) _meetState.guestCount = v('ms_guestCount').value;
  _meetRecalcHeadcount(); // 會員人數於此自動帶入現有會員數
  _meetSaveDraft();
  _meetSaveStaffToConfig();
}

// 會議設定裡改人數 → 即時重算時長並更新預覽（不關閉設定視窗）
function _meetSettingsOnCount(which, val) {
  if (!_meetState) return;
  if (which === 'guest') _meetState.guestCount = val;
  else _meetState.memberCount = val;
  _meetRecalcHeadcount();
  _meetSaveDraft();
  if (typeof _meetRenderBody === 'function') _meetRenderBody();
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

function _meetOpenAddItem() {
  if (!_meetState) return;
  const items = _meetState.items || [];
  const opts = ['<option value="0">＝＝開頭（成為第 1 列）＝＝</option>'];
  items.forEach((it, idx) => {
    const topicFirst = String(it.topic||'').split('\n')[0] || '(無議程)';
    opts.push(`<option value="${idx+1}">第 ${idx+1} 列「${_escH(topicFirst)}」之後</option>`);
  });
  const defaultPos = items.length;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'meetAddItemModal';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">新增臨時項目</div>
      <div class="modal-field">
        <div class="modal-label">插入位置</div>
        <select class="modal-input" id="ai_position">${opts.join('')}</select>
      </div>
      <div class="modal-field">
        <div class="modal-label">議程（可換行）</div>
        <textarea class="modal-input" id="ai_topic" rows="2" placeholder="例：臨時宣布事項"></textarea>
      </div>
      <div class="modal-field">
        <div class="modal-label">報告人（可換行）</div>
        <textarea class="modal-input" id="ai_presenter" rows="2" placeholder="例：主席"></textarea>
      </div>
      <div class="modal-field">
        <div class="modal-label">時長(分)</div>
        <input class="modal-input" id="ai_minutes" type="number" min="0" step="0.5" value="2">
      </div>
      <div class="modal-field">
        <div class="modal-label">備註（可換行）</div>
        <textarea class="modal-input" id="ai_note" rows="3">□計時 1:30按●，2:00按●●</textarea>
      </div>
      <div class="modal-btns">
        <button class="modal-save" onclick="_meetCommitAddItem()">新增</button>
        <button class="modal-cancel" onclick="_meetCloseAddItem()">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const sel = document.getElementById('ai_position');
  if (sel) sel.value = String(defaultPos);
  setTimeout(() => document.getElementById('ai_topic')?.focus(), 30);
}

function _meetCloseAddItem() {
  const m = document.getElementById('meetAddItemModal');
  if (m) m.remove();
}

function _meetCommitAddItem() {
  if (!_meetState) return;
  const v = id => document.getElementById(id);
  const pos = parseInt(v('ai_position').value, 10);
  const topic = (v('ai_topic').value || '').trim();
  const presenter = (v('ai_presenter').value || '').trim();
  const minutes = _meetParseDuration(v('ai_minutes').value);
  const note = v('ai_note').value || '';
  if (!topic) { showToast('請輸入議程'); return; }
  const newItem = { topic, presenter, minutes, note, custom: true, defaultMinutes: minutes };
  if (!Array.isArray(_meetState.items)) _meetState.items = [];
  const insertAt = Math.max(0, Math.min(_meetState.items.length, isNaN(pos) ? _meetState.items.length : pos));
  _meetState.items.splice(insertAt, 0, newItem);
  _meetCloseAddItem();
  _meetAfterEdit();
}

function _meetDeleteRow(idx) {
  if (!_meetState || !Array.isArray(_meetState.items)) return;
  const it = _meetState.items[idx];
  if (!it) return;
  if (!it.custom) { showToast('內建項目無法刪除，請改用「會議設定」'); return; }
  if (!confirm(`刪除第 ${idx+1} 項「${String(it.topic||'').split('\n')[0]}」？`)) return;
  _meetState.items.splice(idx, 1);
  _meetCloseRowEditor();
  _meetAfterEdit();
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
        ${it.editableTopic
          ? `<textarea class="modal-input" id="mr_topic" rows="${Math.max(2, String(it.topic||'').split('\n').length)}" style="resize:vertical;line-height:1.4">${_escH(it.topic||'')}</textarea>`
          : `<div id="mr_topicLabel" style="${labelStyle}">${_escH(it.topic||'')}</div>`}
        ${it.titleHighlight ? '<div style="font-size:11px;color:var(--text-soft);font-weight:500;margin-top:6px;">＊紅字標題項目</div>' : ''}
      </div>
      <div class="modal-field">
        <div class="modal-label">報告人</div>
        <textarea class="modal-input" id="mr_presenter" rows="${Math.max(1, String(_resolveMeetingPresenter(it.presenter||'')).split('\n').length)}" style="resize:vertical;line-height:1.4">${_escH(_resolveMeetingPresenter(it.presenter||''))}</textarea>
        <div style="font-size:11px;color:var(--text-soft);font-weight:500;margin-top:6px;">可直接改姓名；未改則沿用職務自動帶入。</div>
      </div>
      <div class="modal-field">
        <div class="modal-label">
          時長(分)
          ${it.auto ? `<span style="color:var(--text-soft);font-weight:500;margin-left:8px">由人數×每人秒數自動算，已鎖定</span>` : ((it.defaultMinutes != null) ? `<span style="color:var(--text-soft);font-weight:500;margin-left:8px">建議 ${it.defaultMinutes} 分</span>` : '')}
        </div>
        <input class="modal-input" id="mr_minutes" type="number" min="0" step="0.5" value="${it.minutes}"${it.auto ? ' readonly' : ''}>
        ${(!it.auto && it.defaultMinutes != null) ? `<div style="margin-top:8px"><button type="button" id="mr_revertBtn" class="meet-tb-btn" style="padding:5px 10px;font-size:11px" onclick="_meetModalRevertMinutes(${it.defaultMinutes})">重設為建議 ${it.defaultMinutes} 分</button></div>` : ''}
      </div>
      ${it.auto ? `
      <div class="modal-field">
        <div class="modal-label">每人秒數（含上下台緩衝）</div>
        <input class="modal-input" id="mr_autoSec" type="number" min="0" step="1" value="${it.auto.sec}" oninput="_meetRowAutoSecPreview()">
        <div style="font-size:11px;color:var(--text-soft);font-weight:500;margin-top:6px">總時長 =「${it.auto.by==='guest'?'來賓':'會員'}人數」× 每人秒數 ÷ 60（進位到整數分），時長欄已鎖定不可手改。人數請在會議設定填；未填則用範本建議時長。</div>
      </div>` : ''}
      <div class="modal-field">
        <div class="modal-label">備註（可換行多行）${(it.auto && it.auto.ring) ? '<span style="color:var(--text-soft);font-weight:500;margin-left:8px">計時隨每人秒數自動帶入，已鎖定</span>' : ''}</div>
        <textarea class="modal-input" id="mr_note" rows="${noteRows}" style="resize:vertical;line-height:1.4">${_escH(it.note||'')}</textarea>
      </div>
      <div class="modal-btns">
        ${it.custom ? `<button class="modal-cancel" style="background:#fff5f4;color:var(--red);border-color:var(--red)" onclick="_meetDeleteRow(${idx})">刪除此項目</button>` : ''}
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
  if (it.editableTopic && v('mr_topic')) it.topic = v('mr_topic').value;
  if (v('mr_presenter')) {
    const origResolved = _resolveMeetingPresenter(it.presenter || '');
    const cur = v('mr_presenter').value;
    if (cur !== origResolved) it.presenter = cur; // 改過才覆寫該列；未改則保留職務自動帶入
  }
  if (v('mr_minutes')) it.minutes = _meetParseDuration(v('mr_minutes').value);
  if (v('mr_note')) it.note = v('mr_note').value;
  const sec = v('mr_autoSec');
  if (sec && it.auto) {
    it.auto.sec = Math.max(0, parseFloat(sec.value) || 0);
    if (it.auto.sec > 0) {
      // 標題的「N秒」跟著每人秒數連動（例：每人秒數改 30 → 會員30秒專業呈現）
      it.topic = String(it.topic || '').replace(/\d+秒/, it.auto.sec + '秒');
      // 計時備註也跟著連動（依 ring 規則：會員按●=秒-10/按●●=秒；來賓按●=秒/按●●=秒+5）
      const autoNote = _meetAutoNote(it);
      if (autoNote != null) it.note = autoNote;
    }
  }
  const f = v('mr_fixed'); if (f) it.fixed = f.checked;
  _meetRecalcHeadcount();
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
  const idx = _meetRowModalIdx();
  const curIt = idx >= 0 ? _meetState.items[idx] : null;
  const isAuto = !!(curIt && curIt.auto);
  const isAutoNote = !!(curIt && curIt.auto && curIt.auto.ring);
  const minutes = document.getElementById('mr_minutes');
  const note = document.getElementById('mr_note');
  const autoSec = document.getElementById('mr_autoSec');
  const revertBtn = document.getElementById('mr_revertBtn');
  const topic = document.getElementById('mr_topic');
  const presenter = document.getElementById('mr_presenter');
  setReadonly(topic, locked);                   // 可編輯議程：鎖定時唯讀
  setReadonly(presenter, locked);               // 可編輯報告人：鎖定時唯讀
  setReadonly(minutes, locked || isAuto);       // auto 項目時長一律鎖定，改由每人秒數×人數換算
  setReadonly(note, locked || isAutoNote);      // 計時備註自動帶入的項目，備註欄鎖定
  setReadonly(autoSec, locked);
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

// 編輯框裡改「每人秒數」時，即時更新（唯讀的）時長欄顯示
function _meetRowAutoSecPreview() {
  const idx = _meetRowModalIdx();
  const it = idx >= 0 ? _meetState.items[idx] : null;
  if (!it || !it.auto) return;
  const minEl = document.getElementById('mr_minutes');
  const secEl = document.getElementById('mr_autoSec');
  if (!minEl || !secEl) return;
  const sec = parseFloat(secEl.value);
  const cnt = it.auto.by === 'guest' ? parseInt(_meetState.guestCount, 10) : parseInt(_meetState.memberCount, 10);
  if (isFinite(cnt) && cnt > 0 && isFinite(sec) && sec > 0) {
    minEl.value = Math.ceil(cnt * sec / 60);
  } else {
    minEl.value = (it.defaultMinutes != null ? it.defaultMinutes : it.minutes);
  }
  // 標題的「N秒」即時跟著每人秒數預覽
  const topicEl = document.getElementById('mr_topicLabel');
  if (topicEl && isFinite(sec) && sec > 0) topicEl.textContent = String(it.topic || '').replace(/\d+秒/, sec + '秒');
  // 計時備註即時跟著每人秒數預覽（僅有 ring 規則的項目）
  const noteEl = document.getElementById('mr_note');
  if (noteEl && it.auto.ring && isFinite(sec) && sec > 0) {
    const a = Math.max(0, sec + it.auto.ring.a);
    const b = Math.max(0, sec + it.auto.ring.b);
    noteEl.value = `□計時 ${_meetClock(a)}按●，${_meetClock(b)}按●●`;
  }
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
  const topicType = (getConfig().meetingStaff || {})['主題類型'] || '主題簡報';
  const displayTopic = (topic) => (topic === '主題簡報' && topicType === '主題日') ? '主題日' : topic;
  const rows = _meetState.items.map((it, idx) => {
    const t = times[idx];
    const titleCls = it.titleHighlight ? 'is-title' : '';
    const serialRowCls = it.serialHighlight ? ' is-serial-row' : '';
    const lockedCls = it.fixed ? ' is-locked' : '';
    const highlightCls = it.serialHighlight ? ' is-serial-highlight' : '';
    const noTd = `<td class="col-no meet-pv-no-btn${lockedCls}${highlightCls}" title="點擊編輯此項" onclick="_meetOpenRowEditor(${idx})">${idx+1}</td>`;
    const resolvedPresenter = _resolveMeetingPresenter(it.presenter||'');
    const isSingleLine = !String(it.topic||'').includes('\n') && !resolvedPresenter.includes('\n') && !String(it.note||'').includes('\n');
    const singleCls = isSingleLine ? ' is-single-line' : '';
    return `
      <tr class="${titleCls}${serialRowCls}${singleCls}">
        ${noTd}
        <td class="col-topic">${_escH(displayTopic(it.topic||'')).replace(/\n/g,'<br>')}</td>
        <td class="col-presenter">${_escH(resolvedPresenter).replace(/\n/g,'<br>')}</td>
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
  if (t.startTime) _meetState.startTime = t.startTime;
  _meetState.ceremonies = _meetEmptyCeremonies();
  if (id === 'consensus') {
    _meetState.items = _MEET_CONSENSUS_BASE.map(x => ({ ...x, auto: x.auto ? { ...x.auto } : undefined, defaultMinutes: x.minutes }));
  } else if (id === 'bod') {
    _meetState.items = _MEET_BOD_BASE.map(x => ({ ...x, auto: x.auto ? { ...x.auto } : undefined, defaultMinutes: x.minutes }));
  } else {
    _meetState.items = _meetBuildGeneralItems(_meetState.ceremonies).map(x => ({ ...x, auto: x.auto ? { ...x.auto } : undefined, defaultMinutes: x.minutes }));
  }
  _meetRecalcHeadcount();
  _meetSaveDraft();
  _meetAutoSyncVersion();
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
  _meetState.items = _meetBuildGeneralItems(_meetState.ceremonies).map(x => ({ ...x, auto: x.auto ? { ...x.auto } : undefined, defaultMinutes: x.minutes }));
  _meetRecalcHeadcount();
  _meetSaveDraft();
  _meetAutoSyncVersion();
  renderMeeting();
}

// 若此場（同日期＋次數）已存在版本管理 → 編輯後自動併存更新該版本（本機即時、雲端 debounce）
// 尚未存進版本管理者不自動建立（仍需手動「另存新版」）
let _meetVerSyncTimer = null;
function _meetAutoSyncVersion() {
  if (!_meetState) return;
  const dateStr = _meetState.dateStr || '';
  const seqNum = _meetState.seqNum || '';
  if (!seqNum) return;
  const versions = _meetLoadVersions();
  const dup = versions.find(v => v.dateStr === dateStr && v.seqNum === seqNum);
  if (!dup) return; // 尚未存進版本管理 → 不自動建立
  Object.assign(dup, {
    title: _meetState.title || '億展',
    templateId: _meetState.templateId,
    ceremonies: { ...(_meetState.ceremonies || _meetEmptyCeremonies()) },
    startTime: _meetState.startTime,
    targetEndTime: _meetState.targetEndTime || '08:30',
    meetingType: _meetState.meetingType || '正式例會',
    actualDefault: _meetState.actualDefault || '',
    memberCount: _meetState.memberCount || '',
    guestCount: _meetState.guestCount || '',
    items: JSON.parse(JSON.stringify(_meetState.items)),
    savedAt: new Date().toISOString()
  });
  _meetSaveVersions(versions);
  clearTimeout(_meetVerSyncTimer);
  _meetVerSyncTimer = setTimeout(() => { _meetSaveVersionRemote(dup); }, 1000);
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
    memberCount: _meetState.memberCount || '',
    guestCount: _meetState.guestCount || '',
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
  _meetSaveVersionRemote(snapshot);
  showToast('已存版本（同步雲端中）');
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
    memberCount: v.memberCount || '',
    guestCount: v.guestCount || '',
    ceremonies,
    items: JSON.parse(JSON.stringify(v.items || []))
  };
  _meetSaveDraft();
  renderMeeting();
  showToast('已載入版本');
}

// 版本排序：例會次數（seqNum）數字大→小；同次數時新存的在上；非數字次數排最後
function _meetSortVersions(arr) {
  return [...(arr || [])].sort((a, b) => {
    const av = parseInt(a.seqNum, 10), bv = parseInt(b.seqNum, 10);
    const an = isNaN(av) ? -Infinity : av, bn = isNaN(bv) ? -Infinity : bv;
    if (bn !== an) return bn - an;
    return (b.savedAt || '').localeCompare(a.savedAt || '');
  });
}

async function _meetManageVersions() {
  const body = document.getElementById('meetBody');
  if (!body) return;
  body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-soft)">載入雲端版本中...</div>';
  const remote = await _meetFetchVersionsRemote();
  const versions = _meetSortVersions(remote || _meetLoadVersions());
  if (!versions.length) {
    body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-soft)">尚無歷史紀錄<div style="margin-top:12px"><button class="meet-tb-btn" onclick="_meetRenderBody()">返回</button></div></div>';
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
            <div class="meet-v-title">${_escH(_meetVersionFullTitle(v))}</div>
            <div class="meet-v-sub">${_escH(_meetVersionLabel(v))} · ${(v.items||[]).length} 項 · 存於 ${(v.savedAt||'').slice(0,10)}</div>
          </div>
          <button onclick="_meetLoadVersion('${_escH(v.id)}')">載入</button>
          <button class="danger" onclick="_meetDelVersion('${_escH(v.id)}')">刪除</button>
        </div>
      `).join('')}
    </div>
  `;
}

function _meetVersionFullTitle(v) {
  const dateStr = v.dateStr || '';
  const title = v.title || '億展';
  const seqNum = v.seqNum || '00';
  const meetingType = v.meetingType || '正式例會';
  return `${dateStr} ${title}第 ${seqNum} 次${meetingType}流程表`;
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
  _meetDeleteVersionRemote(id);
  _meetManageVersions();
}

async function _meetExportPDF() {
  _pauseEditLock();
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
    _resumeEditLock();
    return;
  }
  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!jsPDFCtor) { showLoader(false); showToast('jsPDF 初始化失敗'); _resumeEditLock(); return; }
  const sheet = document.querySelector('#meetingPrintArea .meet-preview-sheet');
  if (!sheet) { showLoader(false); showToast('找不到預覽區'); _resumeEditLock(); return; }
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
    const safeName = _meetVersionFullTitle(_meetState).replace(/[\\/:*?"<>|]/g,'_') + '.pdf';
    _downloadPdfBlob(pdf.output('blob'), safeName);
    showToast('PDF 已產生');
  } catch (e) {
    console.error('[PDF export]', e);
    showToast('PDF 匯出失敗：' + (e && e.message ? e.message : e));
  } finally {
    document.body.classList.remove('meet-print-mode');
    showLoader(false);
    _resumeEditLock();
  }
}

async function _meetExportJPG() {
  _pauseEditLock();
  showLoader(true, 'JPG 產生中...');
  try {
    await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  } catch { showLoader(false); showToast('JPG 套件載入失敗，請確認網路'); _resumeEditLock(); return; }
  const sheet = document.querySelector('#meetingPrintArea .meet-preview-sheet');
  if (!sheet) { showLoader(false); showToast('找不到預覽區'); _resumeEditLock(); return; }
  document.body.classList.add('meet-print-mode');
  await new Promise(r => setTimeout(r, 80));
  try {
    const canvas = await html2canvas(sheet, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const a = document.createElement('a');
    const safeName = _meetVersionFullTitle(_meetState).replace(/[\\/:*?"<>|]/g,'_');
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
    _resumeEditLock();
  }
}

