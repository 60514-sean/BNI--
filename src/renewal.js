// ===== RENEWAL（續約管理）=====
// 全用既有 _memberData / member.js 的編輯函式，不新增資料欄位
// 4 個區塊：頂部統計卡 + 本週儀式推薦 + 三大狀態 tab + 流程進度視覺化

let _renewalSubTab = 'progress'; // 'progress' 續約進行中 | 'pending' 待辦儀式 | 'done' 已完成
let _renewalSearch = '';
let _renewalAutoResetDone = new Set(); // 本次 session 已自動重置的 sheetRow，避免重複呼叫 API

// 狀態分群：互斥
function _renewalStatus(m) {
  if (m.renewRibbon === 'TRUE') return 'done';       // 已辦儀式（已完成）
  if (m.renewComplete === 'TRUE') return 'pending';  // 已完成續約、未辦儀式
  if (m.renewApply === 'TRUE' || m.renewPay === 'TRUE') return 'progress'; // 已手動啟動流程
  // 自動轉換：倒數 ≤ 120 天 → 進入續約進行中
  const days = parseInt(m.renewDays);
  if (isNaN(days)) return 'progress'; // 無天數資料，顯示讓管理員處理
  if (days <= 120) return 'progress';
  // days > 120 且無 checkbox：判定新會員須再確認「感言（儀式日期）」是空的
  if (!m.ceremonyDate) return 'distant'; // 真新會員：從未辦過儀式
  return 'progress'; // 有儀式紀錄但無 checkbox = 異常資料，視為進行中讓管理員留意
}

// 自動重置：renewRibbon=TRUE 且 renewDays ≤ 120 表示上一輪資料過時，靜默清空進入新一輪
function _renewalAutoResetIfNeeded(m) {
  if (_renewalAutoResetDone.has(m.sheetRow)) return false;
  if (m.renewRibbon !== 'TRUE') return false;
  const days = parseInt(m.renewDays);
  if (isNaN(days) || days > 120) return false;

  m.renewApply = 'FALSE';
  m.renewPay = 'FALSE';
  m.renewComplete = 'FALSE';
  m.renewRibbon = 'FALSE';
  m.ceremonyDate = '';
  _renewalAutoResetDone.add(m.sheetRow);
  // 同步雲端（fire-and-forget，失敗下次 render 會再試）
  _apiPost({ action: 'updateRenewal', sheetRow: m.sheetRow, renewDate: m.renewDate, renewApply: 'FALSE', renewPay: 'FALSE', renewComplete: 'FALSE', renewRibbon: 'FALSE', ceremonyDate: '' }).catch(() => {});
  return true;
}

// 修復遺留資料：完成續約=TRUE 但到期日仍是舊年份（renewDays < 0），自動把年份 +1
let _renewalAutoFixDone = new Set();
function _renewalAutoFixIfNeeded(m) {
  if (_renewalAutoFixDone.has(m.sheetRow)) return false;
  if (m.renewComplete !== 'TRUE') return false;
  if (m.renewRibbon === 'TRUE') return false; // 已完成週期不動
  const days = parseInt(m.renewDays);
  if (isNaN(days) || days >= 0) return false; // 只修負數（已過期還沒 +1 年的）

  const newDate = _addOneYearStr(m.renewDate);
  m.renewDate = newDate;
  // 本機重算 renewDays
  const localDays = _renewalDaysLocal(newDate);
  if (localDays !== null) m.renewDays = String(localDays);
  _renewalAutoFixDone.add(m.sheetRow);
  // 同步雲端
  _apiPost({ action: 'updateRenewal', sheetRow: m.sheetRow, renewDate: newDate, renewApply: m.renewApply, renewPay: m.renewPay, renewComplete: m.renewComplete, renewRibbon: m.renewRibbon, ceremonyDate: m.ceremonyDate || '' }).catch(() => {});
  return true;
}

// 把日期字串轉成 timestamp（支援 2027/2/1、2027-2-1）
function _renewalDateTs(s) {
  if (!s) return Infinity;
  const m = String(s).match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (!m) return Infinity;
  return new Date(+m[1], +m[2]-1, +m[3]).getTime();
}

async function renderRenewal() {
  if (!_memberData) await fetchMembers();
  if (!_memberData) return;
  const canEdit = CR === 'admin';

  // 1. 自動重置（renewRibbon=TRUE 且 renewDays ≤ 120）→ 進入新一輪
  let autoResetCount = 0;
  _memberData.forEach(m => { if (_renewalAutoResetIfNeeded(m)) autoResetCount++; });
  if (autoResetCount > 0) {
    showToast(`已自動為 ${autoResetCount} 位會員開始新一輪續約`);
  }
  // 1b. 自動修復（完成續約但到期日卡在舊年份）→ 年份 +1
  let autoFixCount = 0;
  _memberData.forEach(m => { if (_renewalAutoFixIfNeeded(m)) autoFixCount++; });
  if (autoFixCount > 0) {
    showToast(`已自動修復 ${autoFixCount} 位會員的到期日`);
  }

  // 2. 狀態分群
  const groups = { progress: [], pending: [], done: [], distant: [] };
  _memberData.forEach(m => {
    const s = _renewalStatus(m);
    groups[s].push(m);
  });

  // 2. 待辦儀式排序：按到期日由近到遠
  const ritualQueue = [...groups.pending].sort((a, b) => _renewalDateTs(a.renewDate) - _renewalDateTs(b.renewDate));

  // 3. 渲染
  const parts = [];

  // —— 標題 + 重整 —— //
  parts.push(`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
    <h2 style="font-size:18px;font-weight:700;color:var(--red);margin:0;">續約管理</h2>
    <button onclick="_memberData=null;renderRenewal()" style="padding:7px 14px;background:white;border:1.5px solid var(--gray-border);border-radius:7px;cursor:pointer;font-size:13px;font-family:inherit;color:var(--text-soft);">重整</button>
  </div>`);

  // —— 區塊 1：頂部統計卡 —— //
  parts.push(`<div class="renewal-stats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px;">
    ${_renewalStatCard('續約進行中', groups.progress.length,  '#c0392b', '#fdecea')}
    ${_renewalStatCard('待辦儀式',  groups.pending.length,   '#d4ac0d', '#fef9e7')}
    ${_renewalStatCard('已完成',    groups.done.length,      '#27ae60', '#eaf7ee')}
    ${_renewalStatCard('新會員',    groups.distant.length,   '#7f8c8d', '#ecf0f1')}
  </div>`);

  // —— 區塊 3：搜尋 + sub-tab —— //
  const subTabBtn = (id, label, count, color) => {
    const active = _renewalSubTab === id;
    return `<button onclick="_renewalSubTab='${id}';renderRenewal()" style="flex:1;padding:10px 8px;border:none;background:${active ? color : '#f5f5f5'};color:${active ? 'white' : 'var(--text-soft)'};font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;border-radius:8px;transition:all .15s;">
      ${label} <span style="opacity:.85;font-size:11px;">(${count})</span>
    </button>`;
  };
  parts.push(`<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;">
    ${subTabBtn('progress', '續約進行中', groups.progress.length, '#c0392b')}
    ${subTabBtn('pending',  '待辦儀式 ★', groups.pending.length,  '#d4ac0d')}
    ${subTabBtn('done',     '已完成',     groups.done.length,     '#27ae60')}
    ${subTabBtn('distant',  '新會員',     groups.distant.length,  '#7f8c8d')}
  </div>`);

  parts.push(`<input class="member-search" type="text" placeholder="搜尋姓名、公司..." value="${_escH(_renewalSearch)}" oninput="_renewalSearch=this.value;_filterRenewalCards()" autocomplete="off" style="margin-bottom:12px;">`);

  // —— 區塊 4：當前 sub-tab 列表 —— //
  let list;
  if (_renewalSubTab === 'pending') {
    list = ritualQueue; // 按到期日排序
  } else if (_renewalSubTab === 'progress') {
    list = [...groups.progress].sort((a, b) => _renewalDateTs(a.renewDate) - _renewalDateTs(b.renewDate));
  } else if (_renewalSubTab === 'distant') {
    list = [...groups.distant].sort((a, b) => _renewalDateTs(a.renewDate) - _renewalDateTs(b.renewDate)); // 新會員依到期日近→遠
  } else {
    list = [...groups.done].sort((a, b) => _renewalDateTs(a.renewDate) - _renewalDateTs(b.renewDate)); // 已完成依到期日近→遠
  }

  parts.push(`<div id="renewalList" class="member-grid">`);
  list.forEach(m => parts.push(_renewalCard(m, canEdit)));
  if (list.length === 0) {
    parts.push(`<div style="text-align:center;padding:48px 20px;color:var(--text-soft);grid-column:1/-1;">此分類目前沒有會員</div>`);
  }
  parts.push(`<div id="renewalNoResult" style="display:none;text-align:center;padding:48px 20px;color:var(--text-soft);grid-column:1/-1;">查無搜尋結果</div>`);
  parts.push(`</div>`);

  document.getElementById('renewalContent').innerHTML = parts.join('');
  _filterRenewalCards();
}

function _renewalStatCard(label, count, color, bg) {
  return `<div style="background:${bg};border-radius:10px;padding:14px 10px;display:flex;flex-direction:column;gap:4px;">
    <div style="font-size:11px;color:${color};font-weight:700;letter-spacing:1px;">${label}</div>
    <div style="font-size:24px;color:${color};font-weight:900;line-height:1;">${count}</div>
    <div style="font-size:10px;color:${color};opacity:.7;">位會員</div>
  </div>`;
}

function _renewalCard(m, canEdit) {
  const status = _renewalStatus(m);
  const days = parseInt(m.renewDays);
  const daysBg    = days>=120?'#eaf7ee':days>=90?'#fef9e7':'#fdecea';
  const daysColor = days>=120?'#27ae60':days>=90?'#d4ac0d':'#c0392b';
  const _ds = [m.name, m.specialty, m.company, m.industry, m.service].filter(Boolean).join(' ').toLowerCase();

  // 流程進度視覺化：4 個小點
  const steps = [
    { key: 'apply',   label: '申請',   done: m.renewApply === 'TRUE' },
    { key: 'pay',     label: '繳費',   done: m.renewPay === 'TRUE' },
    { key: 'complete',label: '續約',   done: m.renewComplete === 'TRUE' },
    { key: 'ribbon',  label: '儀式',   done: m.renewRibbon === 'TRUE' },
  ];
  const stepsHtml = steps.map((s, i) => `
    <div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:1;position:relative;">
      ${i > 0 ? `<div style="position:absolute;left:-50%;top:7px;width:100%;height:2px;background:${steps[i-1].done && s.done ? 'var(--red)' : (steps[i-1].done ? 'var(--red)' : '#e8ecf0')};z-index:0;"></div>` : ''}
      <div style="width:16px;height:16px;border-radius:50%;background:${s.done ? 'var(--red)' : 'white'};border:2px solid ${s.done ? 'var(--red)' : '#e8ecf0'};z-index:1;display:flex;align-items:center;justify-content:center;">
        ${s.done ? '<svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4l2 2 4-4" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}
      </div>
      <div style="font-size:10px;color:${s.done ? 'var(--red)' : '#bbb'};font-weight:${s.done ? 700 : 500};">${s.label}</div>
    </div>
  `).join('');

  // 狀態 chip
  let chipBg, chipColor, chipText;
  if (status === 'done')         { chipBg = '#eaf7ee'; chipColor = '#27ae60'; chipText = '已完成儀式'; }
  else if (status === 'pending') { chipBg = '#fef9e7'; chipColor = '#d4ac0d'; chipText = '★ 待辦儀式'; }
  else if (status === 'progress'){ chipBg = '#fdecea'; chipColor = '#c0392b'; chipText = '續約進行中'; }
  else if (status === 'distant') { chipBg = '#ecf0f1'; chipColor = '#7f8c8d'; chipText = '新會員'; }
  else                           { chipBg = '#fdecea'; chipColor = '#c0392b'; chipText = '未續約'; }

  return `<div class="member-card renewal-card" data-search="${_escH(_ds)}" style="flex-direction:column;gap:0;padding:0;overflow:hidden;align-items:stretch;justify-content:flex-start;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:14px 14px 10px;">
      ${m.photo
        ? `<img src="${_escH(m.photo)}" loading="lazy" decoding="async" style="width:48px;height:48px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid var(--red);" onerror="this.style.display='none'">`
        : `<div style="width:48px;height:48px;border-radius:50%;flex-shrink:0;background:#e8ecf0;border:2px solid var(--red);display:flex;align-items:center;justify-content:center;color:#bbb;font-size:18px;font-weight:900;">?</div>`}
      <div style="flex:1;min-width:0;">
        <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:2px;">${_escH(m.name)}</div>
        <div style="font-size:12px;color:var(--text-soft);line-height:1.4;">${_escH(m.specialty)}</div>
        <div style="font-size:11px;color:var(--text-soft);margin-top:3px;">到期 ${_escH(m.renewDate || '—')}</div>
        ${status === 'done' && m.ceremonyDate ? `<div style="font-size:11px;color:#27ae60;margin-top:2px;font-weight:600;">儀式 ${_escH(m.ceremonyDate)}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0;">
        <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:${chipBg};color:${chipColor};white-space:nowrap;">${chipText}</span>
        ${m.renewDays && status !== 'done' ? `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:${daysBg};color:${daysColor};">${_escH(m.renewDays)} 天</span>` : ''}
      </div>
    </div>
    <div style="padding:10px 14px 12px;background:#fafbfc;border-top:1px solid var(--gray-border);">
      <div style="display:flex;align-items:flex-start;gap:0;">${stepsHtml}</div>
    </div>
    ${canEdit ? `<button onclick="openEditRenewal(${m.sheetRow})" style="border:none;border-top:1px solid var(--gray-border);background:white;padding:8px;color:var(--red);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">編輯續約進度</button>` : ''}
  </div>`;
}

function _renewalDaysLocal(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (!m) return null;
  const target = new Date(+m[1], +m[2]-1, +m[3]);
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((target - today) / 86400000);
}

function openEditRenewal(sheetRow) {
  sheetRow = parseInt(sheetRow);
  const m = _memberData.find(x => x.sheetRow === sheetRow);
  if (!m) return;
  const days = _renewalDaysLocal(m.renewDate);
  const anyStepDone = m.renewApply === 'TRUE' || m.renewPay === 'TRUE' || m.renewComplete === 'TRUE' || m.renewRibbon === 'TRUE';
  // 鎖定條件：尚未啟動任何流程 + 距到期日 > 90 天（避免太早勾選）。
  // 一旦流程已啟動，必須允許繼續編輯到完成（例如完成續約後到期日 +1 年，days 跳到 ~365 也不應鎖定）
  const locked = !anyStepDone && days !== null && days > 90;
  const lockNote = locked
    ? `<div style="font-size:12px;color:#c0392b;background:#fdecea;padding:9px 12px;border-radius:6px;margin-bottom:10px;line-height:1.5;border:1px solid #f5c6cb;">距離到期日還有 <strong>${days}</strong> 天，倒數 <strong>90 天</strong> 內才開放勾選續約流程。</div>`
    : '';
  const orderNote = !locked
    ? `<div style="font-size:11px;color:var(--text-soft);margin-bottom:8px;">續約流程須依序勾選，取消前面步驟會清除後面步驟。</div>`
    : '';
  const cbId = ['rf_renewApply','rf_renewPay','rf_renewComplete','rf_renewRibbon'];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'renewalModal';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">續約進度 — ${_escH(m.name)}</div>
      <div class="modal-field"><div class="modal-label">到期日</div><input class="modal-input" id="rf_renewDate" value="${_escH(m.renewDate)}" placeholder="例：2027/2/1"></div>
      <div class="modal-field">
        <div class="modal-label" style="margin-bottom:10px;">續約流程</div>
        ${lockNote}
        ${orderNote}
        <div style="display:flex;flex-direction:column;gap:10px;background:#fafbfc;padding:12px 14px;border-radius:8px;border:1px solid var(--gray-border);">
          <label id="rf_lbl_renewApply"    class="rf-step"><input type="checkbox" id="rf_renewApply"    ${m.renewApply==='TRUE'?'checked':''}    onchange="_renewalStepChange()">1. 申請書</label>
          <label id="rf_lbl_renewPay"      class="rf-step"><input type="checkbox" id="rf_renewPay"      ${m.renewPay==='TRUE'?'checked':''}      onchange="_renewalStepChange()">2. 繳費</label>
          <label id="rf_lbl_renewComplete" class="rf-step"><input type="checkbox" id="rf_renewComplete" ${m.renewComplete==='TRUE'?'checked':''} onchange="_renewalStepChange()">3. 完成續約</label>
          <label id="rf_lbl_renewRibbon"   class="rf-step"><input type="checkbox" id="rf_renewRibbon"   ${m.renewRibbon==='TRUE'?'checked':''}   onchange="_renewalStepChange()">4. 綢帶 / 頒獎儀式</label>
        </div>
      </div>
      <div class="modal-btns">
        <button class="modal-save" onclick="saveRenewalEdit(${sheetRow})">儲存</button>
        <button class="modal-cancel" onclick="closeEditRenewal()">取消</button>
      </div>
    </div>
    <style>
      .rf-step { display:flex; align-items:center; gap:8px; font-size:14px; cursor:pointer; }
      .rf-step.rf-disabled { opacity:.4; cursor:not-allowed; }
      .rf-step input[type="checkbox"]:disabled { cursor:not-allowed; }
    </style>`;
  document.body.appendChild(overlay);
  // 鎖定狀態下 disabled 所有；否則初始化依序鎖定
  if (locked) {
    cbId.forEach(id => {
      document.getElementById(id).disabled = true;
      document.getElementById('rf_lbl_' + id.replace('rf_','')).classList.add('rf-disabled');
    });
  } else {
    _renewalStepChange();
  }
}

// 強制依序：取消前一步會清掉後續所有步驟；後一步在前一步未勾時 disabled
function _renewalStepChange() {
  const order = ['rf_renewApply','rf_renewPay','rf_renewComplete','rf_renewRibbon'];
  // 級聯取消：找到第一個未勾選的，後面全部 uncheck
  let firstUnchecked = -1;
  for (let i = 0; i < order.length; i++) {
    const cb = document.getElementById(order[i]);
    if (!cb.checked && firstUnchecked === -1) firstUnchecked = i;
  }
  if (firstUnchecked >= 0) {
    for (let i = firstUnchecked + 1; i < order.length; i++) {
      document.getElementById(order[i]).checked = false;
    }
  }
  // 重設 disabled：第 i 步 disabled iff 第 i-1 步未勾選
  for (let i = 0; i < order.length; i++) {
    const cb = document.getElementById(order[i]);
    const lbl = document.getElementById('rf_lbl_' + order[i].replace('rf_',''));
    let disable = false;
    if (i > 0) {
      const prev = document.getElementById(order[i-1]);
      disable = !prev.checked;
    }
    cb.disabled = disable;
    if (disable) lbl.classList.add('rf-disabled');
    else lbl.classList.remove('rf-disabled');
  }
}

function closeEditRenewal() {
  document.getElementById('renewalModal')?.remove();
}

function _todayStr() {
  const d = new Date();
  return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
}

// 將日期字串 +1 年（保持月日不變）；無效輸入則回傳「今天 +1 年」
function _addOneYearStr(dateStr) {
  const m = String(dateStr || '').match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) return `${+m[1] + 1}/${+m[2]}/${+m[3]}`;
  const d = new Date();
  return `${d.getFullYear() + 1}/${d.getMonth() + 1}/${d.getDate()}`;
}

async function saveRenewalEdit(sheetRow) {
  const m = _memberData.find(x => x.sheetRow === sheetRow);
  if (!m) return;
  const oldDate = m.renewDate;
  const wasRibbonDone = m.renewRibbon === 'TRUE';
  const wasCompleteDone = m.renewComplete === 'TRUE';
  const newDate = document.getElementById('rf_renewDate').value.trim();

  m.renewDate = newDate;

  // 條件混合重置：上一輪已辦儀式（綢帶/頒獎=TRUE）且到期日有變更 → 視為新一輪，清空所有勾選
  if (wasRibbonDone && newDate && newDate !== oldDate) {
    m.renewApply = 'FALSE';
    m.renewPay = 'FALSE';
    m.renewComplete = 'FALSE';
    m.renewRibbon = 'FALSE';
    m.ceremonyDate = ''; // 清空儀式日期紀錄
    showToast('已開始新一輪續約週期');
  } else {
    m.renewApply   = document.getElementById('rf_renewApply').checked    ? 'TRUE' : 'FALSE';
    m.renewPay     = document.getElementById('rf_renewPay').checked      ? 'TRUE' : 'FALSE';
    m.renewComplete= document.getElementById('rf_renewComplete').checked ? 'TRUE' : 'FALSE';
    m.renewRibbon  = document.getElementById('rf_renewRibbon').checked   ? 'TRUE' : 'FALSE';

    // 完成續約 FALSE→TRUE：自動把到期日 +1 年（僅在管理員沒有手動改到期日時才覆寫）
    if (!wasCompleteDone && m.renewComplete === 'TRUE' && newDate === oldDate) {
      m.renewDate = _addOneYearStr(oldDate);
      showToast(`到期日自動更新為 ${m.renewDate}`);
    }

    // 儀式日期自動紀錄：綢帶/頒獎 FALSE→TRUE 自動寫入今天；TRUE→FALSE 清空
    if (!wasRibbonDone && m.renewRibbon === 'TRUE') {
      m.ceremonyDate = _todayStr();
    } else if (wasRibbonDone && m.renewRibbon === 'FALSE') {
      m.ceremonyDate = '';
    }
  }

  // 本機重算倒數天數，避免畫面延遲到下次 fetch 才更新
  const localDays = _renewalDaysLocal(m.renewDate);
  if (localDays !== null) m.renewDays = String(localDays);

  closeEditRenewal();
  renderRenewal();
  showToast('儲存中...');
  try {
    await _apiPost({ action: 'updateRenewal', sheetRow, renewDate: m.renewDate, renewApply: m.renewApply, renewPay: m.renewPay, renewComplete: m.renewComplete, renewRibbon: m.renewRibbon, ceremonyDate: m.ceremonyDate || '' });
    showToast('已儲存');
  } catch { showToast('儲存失敗，請重試'); }
}

function _filterRenewalCards() {
  const q = (_renewalSearch || '').trim().toLowerCase();
  const cards = document.querySelectorAll('#renewalContent .renewal-card[data-search]');
  let shown = 0;
  cards.forEach(c => {
    const match = !q || c.dataset.search.includes(q);
    c.style.display = match ? '' : 'none';
    if (match) shown++;
  });
  const noRes = document.getElementById('renewalNoResult');
  if (noRes) noRes.style.display = (q && shown === 0) ? '' : 'none';
}
