// ===== 財務控管 =====
let _financeRaw = null;
let _financeParsed = null;
let _financeTermTab = null;
let _financeMonthsOpen = {};
let _financeSelectedMonth = null;
let _financeNotesOpen = {}; // { rowIndex: true }
let _receivableFilter = 'unpaid'; // all | unpaid | paid

function _finNum(v) {
  if (typeof v === 'number') return Math.round(v);
  if (!v) return 0;
  const m = String(v).replace(/[,，\s]/g, '').match(/^-?\d+(\.\d+)?/);
  return m ? Math.round(Number(m[0])) : 0;
}

function _finExtraDesc(v) {
  if (!v || typeof v === 'number') return '';
  const s = String(v).trim();
  return s.replace(/^-?[\d,，.\s]+/, '').replace(/^[（(]/, '').replace(/[）)]$/, '').trim();
}

function _finFmt(n) {
  if (!n) return '0';
  return n.toLocaleString('en-US');
}

function _finYM(dateStr) {
  if (!dateStr) return '';
  const m = String(dateStr).match(/(\d{4})\/(\d{1,2})/);
  return m ? `${m[1]}-${String(m[2]).padStart(2,'0')}` : '';
}

function _finIsTermSheet(rows) {
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (rows[i] && rows[i][0] === '日期' && rows[i][1] === '性質') return i;
  }
  return -1;
}

function _parseTermSheet(rows) {
  const headerIdx = _finIsTermSheet(rows);
  if (headerIdx < 0) return null;
  const hdr = rows[headerIdx] || [];
  const isLegacy = hdr.length >= 11;
  const C = isLegacy
    ? { date:0, type:1, income:2, expense:3, balance:4, paid:5, total:6, exIn:7, exOut:8, finalBal:9, note:10 }
    : { date:0, type:1, income:2, expense:3, balance:4, paid:5, total:6, exIn:-1, exOut:-1, finalBal:4, note:7 };

  const records = [];
  let initial = 0;
  let initialDate = '';
  let currentDate = '';
  const specialItems = [];
  let inSpecial = false;
  let specialName = '';

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    let dateRaw = String(row[0] || '').trim();
    const type = String(row[1] || '').trim();
    if (!dateRaw && !type) continue;

    // 特殊活動標題列：以關鍵字偵測，無論是否填金額都視為活動起點
    const SPECIAL_KEYWORDS = /晚宴|餐會|聚餐|大會|慶祝|週年|表揚|募款|主辦|專題|論壇|工作坊|頒獎|尾牙|春酒|入會典禮|發表|大型/;
    if (type && SPECIAL_KEYWORDS.test(type) && !type.includes('入席費') && !type.includes('早餐')) {
      inSpecial = true;
      specialName = type;
      const inc = _finNum(row[C.income]);
      const exp = _finNum(row[C.expense]);
      if (inc > 0) {
        specialItems.push({ name: type, amount: inc, kind: 'income', date: dateRaw || currentDate });
      } else if (exp > 0) {
        specialItems.push({ name: type, amount: exp, kind: 'expense', date: dateRaw || currentDate });
      }
      if (dateRaw) currentDate = dateRaw;
      continue;
    }
    // 在 inSpecial 區段且日期欄空、性質非入席費/早餐 → 特殊活動子項
    if (inSpecial && !dateRaw && type && !type.includes('入席費') && !type.includes('早餐') && !type.includes('屆')) {
      const inAmt = _finNum(row[C.income]);
      const outAmt = _finNum(row[C.expense]);
      specialItems.push({
        name: type,
        amount: inAmt > 0 ? inAmt : outAmt,
        kind: inAmt > 0 ? 'income' : 'expense',
        note: String(row[C.note] || '').trim(),
        date: currentDate,
      });
      continue;
    }
    if (inSpecial && (type.includes('入席費') || type.includes('早餐') || type.includes('屆'))) {
      inSpecial = false;
    }

    // 屆期初始
    if (type.includes('初始') || /^第[一二三四五六七八九十]期初始$/.test(type)) {
      initial = _finNum(row[4]);
      initialDate = dateRaw;
      continue;
    }

    // 月份標題行（無收支只有標籤）：例如「第六屆04月」「2026/3/6 第五屆3月（餐費漲至700)」
    const monthHeader = (type && /第[一二三四五六七八九十]屆\s*\d+月/.test(type) && !type.includes('入席費') && !type.includes('早餐'));
    const dateMonthHeader = /第[一二三四五六七八九十]屆\s*\d+月/.test(dateRaw);
    if (monthHeader || dateMonthHeader) {
      // 跳過標題本身（不入紀錄）
      if (dateRaw) currentDate = dateRaw.replace(/\s*第.*$/, '').trim();
      continue;
    }

    if (dateRaw) currentDate = dateRaw;

    records.push({
      rowIndex: i + 1, // Apps Script 1-based row number
      date: currentDate,
      ym: _finYM(currentDate),
      type,
      income:  _finNum(row[C.income]),
      expense: _finNum(row[C.expense]),
      balance: _finNum(row[C.balance]),
      paid:    _finNum(row[C.paid]),
      total:   _finNum(row[C.total]),
      extraIncome:  C.exIn  >= 0 ? _finNum(row[C.exIn])  : 0,
      extraExpense: C.exOut >= 0 ? _finNum(row[C.exOut]) : 0,
      extraDesc:    C.exOut >= 0 ? (_finExtraDesc(row[C.exOut]) || _finExtraDesc(row[C.exIn])) : '',
      finalBalance: _finNum(row[C.finalBal]) || _finNum(row[C.balance]),
      note: String(row[C.note] || '').trim(),
    });
  }

  return { initial, initialDate, records, specialItems };
}

function _parseFinance(raw) {
  if (!raw || !raw.sheets) return null;
  const result = { terms: [], budget: null, receivables: [] };
  for (const [name, rows] of Object.entries(raw.sheets)) {
    if (!rows || !rows.length) continue;
    if (name === '應收追蹤') {
      result.receivables = _parseReceivables(rows);
      continue;
    }
    const parsed = _parseTermSheet(rows);
    if (parsed) {
      result.terms.push({ name, ...parsed });
    } else {
      result.budget = result.budget || { name, rows };
    }
  }
  return result;
}

function _parseReceivables(rows) {
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (!r[1] && !r[2] && !_finNum(r[3])) continue;
    list.push({
      rowIndex: i + 1,
      date: String(r[0] || '').trim(),
      member: String(r[1] || '').trim(),
      item: String(r[2] || '').trim(),
      amount: _finNum(r[3]),
      status: String(r[4] || '').trim() || '未繳',
      settleDate: String(r[5] || '').trim(),
      settleSheet: String(r[6] || '').trim(),
      note: String(r[7] || '').trim(),
    });
  }
  return list;
}

async function _fetchFinance() {
  if (!FINANCE_API_URL) return null;
  try {
    const res = await fetch(FINANCE_API_URL, { signal: AbortSignal.timeout(20000) });
    const j = await res.json();
    if (!j || !j.ok) throw new Error(j && j.error || 'unknown');
    _financeRaw = j;
    _financeParsed = _parseFinance(j);
    try { localStorage.setItem('bni_finance_v1', JSON.stringify(j)); } catch {}
    return _financeParsed;
  } catch (e) {
    return null;
  }
}

function _loadFinanceFromCache() {
  try {
    const s = localStorage.getItem('bni_finance_v1');
    if (s) {
      _financeRaw = JSON.parse(s);
      _financeParsed = _parseFinance(_financeRaw);
    }
  } catch {}
}

function _termSummary(term) {
  let inc = 0, exp = 0, exInc = 0, exExp = 0;
  let totalPaid = 0, totalCnt = 0;
  const weekSet = new Set();
  const months = {};
  for (const r of term.records) {
    inc += r.income;
    exp += r.expense;
    exInc += r.extraIncome;
    exExp += r.extraExpense;
    if (r.paid > 0) totalPaid += r.paid;
    if (r.total > 0) totalCnt += r.total;
    if (r.date) {
      const d = new Date(r.date);
      if (!isNaN(d.getTime())) {
        const sunday = new Date(d);
        sunday.setDate(d.getDate() - d.getDay());
        weekSet.add(`${sunday.getFullYear()}-${String(sunday.getMonth()+1).padStart(2,'0')}-${String(sunday.getDate()).padStart(2,'0')}`);
      }
    }
    if (r.ym) {
      if (!months[r.ym]) months[r.ym] = { ym: r.ym, records: [], inc: 0, exp: 0, lastBal: 0 };
      months[r.ym].records.push(r);
      months[r.ym].inc += r.income;
      months[r.ym].exp += r.expense + r.extraExpense;
      if (r.finalBalance) months[r.ym].lastBal = r.finalBalance;
    }
  }
  const weeks = weekSet.size;
  const last = term.records[term.records.length - 1];
  return {
    totalIncome: inc + exInc,
    totalExpense: exp + exExp,
    currentBalance: last ? (last.finalBalance || last.balance) : term.initial,
    weeks,
    avgPaid: weeks ? Math.round(totalPaid / weeks) : 0,
    months: Object.values(months).sort((a, b) => a.ym.localeCompare(b.ym)),
  };
}

function _financeRenderKpi(term, sum) {
  const updated = _financeRaw && _financeRaw.updated
    ? _financeRaw.updated.replace('T',' ').slice(0,19)
    : '';
  return `
    <div class="fin-summary">
      <div class="fin-summary-cell hero">
        <div class="lbl">目前結餘</div>
        <div class="val">${_finFmt(sum.currentBalance)}</div>
      </div>
      <div class="fin-summary-cell">
        <div class="lbl">會議週次</div>
        <div class="val">${sum.weeks}</div>
      </div>
      <div class="fin-summary-cell">
        <div class="lbl">期初結餘</div>
        <div class="val">${_finFmt(term.initial)}</div>
      </div>
      <div class="fin-summary-cell updated">
        <div class="lbl">資料更新</div>
        <div class="val">${_escH(updated || '—')}</div>
      </div>
    </div>
  `;
}

function _financeRenderMonthWeeks(m) {
  const weekMap = {};
  for (const r of m.records) {
    if (!weekMap[r.date]) weekMap[r.date] = [];
    weekMap[r.date].push(r);
  }
  const weeksHtml = Object.entries(weekMap).map(([date, rs]) => {
    const items = [];
    for (const r of rs) {
      const hasIn = r.income > 0;
      const hasOut = r.expense > 0;
      const meta = (r.paid || r.total) ? `${r.paid}/${r.total} 人` : '';
      const noteOpen = !!_financeNotesOpen[r.rowIndex];
      items.push({
        type:'tx', main: true,
        kind: hasIn ? 'in' : (hasOut ? 'out' : ''),
        amt:  hasIn ? r.income : (hasOut ? r.expense : 0),
        desc: r.type, meta, rowIndex: r.rowIndex,
        hasNote: !!r.note, noteOpen
      });
      if (r.extraExpense > 0) {
        items.push({ type:'tx', sub:true, kind:'out', amt:r.extraExpense, desc: r.extraDesc || '額外支出', rowIndex:r.rowIndex });
      }
      if (r.extraIncome > 0) {
        items.push({ type:'tx', sub:true, kind:'in', amt:r.extraIncome, desc: r.extraDesc || '額外收入', rowIndex:r.rowIndex });
      }
      if (r.note && noteOpen) {
        items.push({ type:'note', content: r.note });
      }
    }
    const linesHtml = items.map(L => {
      if (L.type === 'note') {
        return `<div class="fin-week-note">${_escH(L.content)}</div>`;
      }
      const tag = L.kind === 'in' ? '收入' : (L.kind === 'out' ? '支出' : '—');
      const sign = L.kind === 'in' ? '+' : (L.kind === 'out' ? '-' : '');
      const amtStr = L.amt > 0 ? `${sign}${_finFmt(L.amt)}` : '—';
      const tagHtml = L.kind ? `<span class="tag ${L.kind}">${tag}</span>` : `<span></span>`;
      const noteToggle = (L.main && L.hasNote)
        ? `<span class="note-toggle ${L.kind || ''} ${L.noteOpen?'open':''}" onclick="event.stopPropagation();toggleFinanceNote(${L.rowIndex})" title="${L.noteOpen?'收合':'展開'}備註">▶</span>`
        : `<span class="note-toggle-placeholder"></span>`;
      const isClickable = (_canEditTab('finance') && L.main);
      const cls = `fin-line${L.sub?' sub':''}${isClickable?' clickable':''}`;
      const onClick = isClickable ? ` onclick="openFinanceEdit(${L.rowIndex})"` : '';
      return `
        <div class="${cls}"${onClick}>
          ${tagHtml}
          ${noteToggle}
          <span class="amt ${L.kind || ''}">${amtStr}</span>
          <span class="desc">${_escH(L.desc)}${L.meta?`<span class="meta">${L.meta}</span>`:''}</span>
        </div>
      `;
    }).join('');

    const lastRec = rs[rs.length - 1];
    const finalBal = lastRec ? lastRec.finalBalance : 0;

    return `
      <div class="fin-week">
        <div class="fin-week-head">
          <span class="fin-week-date">${_escH(date)}</span>
          <span class="fin-week-balance">
            結餘 ${_finFmt(finalBal)}
          </span>
        </div>
        ${linesHtml}
      </div>
    `;
  }).join('');

  return weeksHtml;
}

function selectFinanceMonth(ym) {
  _financeSelectedMonth = ym;
  renderFinance();
}

function toggleFinanceNote(rowIndex) {
  _financeNotesOpen[rowIndex] = !_financeNotesOpen[rowIndex];
  renderFinance();
}

function _financeRenderSpecial(term) {
  if (!term.specialItems || !term.specialItems.length) return '';
  let inSum = 0, outSum = 0;
  const rows = term.specialItems.map(it => {
    if (it.kind === 'income') inSum += it.amount;
    else outSum += it.amount;
    return `
      <div class="fin-special-row">
        <span class="lbl">${_escH(it.name)}${it.note ? ' <span style="font-size:11px;color:var(--text-soft);">（' + _escH(it.note) + '）</span>' : ''}</span>
        <span class="amt ${it.kind === 'income' ? 'in' : 'out'}">${it.kind === 'income' ? '+' : '-'}${_finFmt(it.amount)}</span>
      </div>
    `;
  }).join('');
  return `
    <div class="fin-section-title">特殊活動</div>
    <div class="fin-special-card">
      ${rows}
      <div class="fin-special-row" style="margin-top:8px;border-top:2px solid var(--gray-border);padding-top:10px;">
        <span class="lbl" style="font-weight:900;">小計</span>
        <span class="amt in">+${_finFmt(inSum)}</span>
        <span class="amt out" style="margin-left:14px;">-${_finFmt(outSum)}</span>
        <span class="amt" style="margin-left:14px;color:var(--text);">淨額 ${_finFmt(inSum - outSum)}</span>
      </div>
    </div>
  `;
}

function switchFinanceTerm(name) {
  _financeTermTab = name;
  _financeMonthsOpen = {};
  renderFinance();
}

function renderFinance() {
  const el = document.getElementById('financeContent');

  if (!FINANCE_API_URL) {
    el.innerHTML = `
      <div class="card" style="padding:32px 20px;line-height:1.8;">
        <div style="font-size:18px;font-weight:900;color:var(--red);margin-bottom:10px;">財務控管 - 等待後端部署</div>
        <div style="font-size:13px;color:var(--text-soft);">
          請先依 <code>apps-script-finance.gs</code> 中的說明部署 Google Apps Script，<br>
          並把產生的「網頁應用程式網址」交回，將其填入 <code>index.html</code> 中的 <code>FINANCE_API_URL</code>。
        </div>
      </div>
    `;
    return;
  }

  if (!_financeParsed) _loadFinanceFromCache();

  if (!_financeParsed) {
    el.innerHTML = `<div class="fin-empty">載入財務資料中...</div>`;
    _fetchFinance().then(p => { if (p) renderFinance(); else {
      el.innerHTML = `<div class="card" style="padding:24px;color:var(--red);">財務資料載入失敗，請稍後重試或檢查 Apps Script 部署。</div>`;
    }});
    return;
  }

  // 背景刷新
  _fetchFinance().then(p => { if (p && document.getElementById('financeContent').isConnected && _activeTab === 'finance') {
    // 僅在資料變動時重繪，避免折疊狀態被打斷
    const old = JSON.stringify(_financeParsed);
    _financeParsed = p;
    if (JSON.stringify(p) !== old) renderFinance();
  }});

  const terms = _financeParsed.terms;
  if (!terms.length) {
    el.innerHTML = `<div class="fin-empty">尚無會期資料</div>`;
    return;
  }

  // 預設顯示第一個（最新）屆
  if (!_financeTermTab || !terms.find(t => t.name === _financeTermTab)) {
    _financeTermTab = terms[0].name;
  }
  const term = terms.find(t => t.name === _financeTermTab);
  const sum = _termSummary(term);

  // 月份預設選最新一個（'__overview__' 是合法值，不要被覆蓋）
  if (_financeSelectedMonth !== '__overview__' && !sum.months.find(m => m.ym === _financeSelectedMonth)) {
    _financeSelectedMonth = sum.months.length ? sum.months[sum.months.length - 1].ym : null;
  }

  const toolbar = `
    <div class="fin-toolbar">
      <select class="fin-term-select" onchange="switchFinanceTerm(this.value)">
        ${terms.map(t => `<option value="${_escH(t.name)}" ${t.name===_financeTermTab?'selected':''}>${_escH(t.name)}</option>`).join('')}
      </select>
      <button class="fin-tb-btn" onclick="refreshFinance()" title="重新整理">↻</button>
    </div>
  `;

  el.innerHTML = `
    ${toolbar}
    ${_financeRenderKpi(term, sum)}
    ${_financeRenderReceivables()}
    <div class="fin-section-title-row">
      <div class="fin-section-title">月份明細</div>
      <div style="display:flex;gap:8px;align-items:center;">
        ${_financeRenderMonthPicker(sum)}
        ${_canEditTab('finance') ? `<button class="btn btn-primary" style="padding:7px 14px;font-size:12px;white-space:nowrap;" onclick="openFinanceAdd()">新增</button>` : ''}
      </div>
    </div>
    ${_renderMonthsBlock(term, sum)}
    ${_financeRenderSpecial(term)}
  `;
}

function _financeRenderMonthPicker(sum) {
  if (!sum.months.length) return '';
  const isOverview = _financeSelectedMonth === '__overview__';
  const pickerOptions = [
    `<option value="__overview__" ${isOverview?'selected':''}>本屆概況</option>`,
    ...sum.months.map(m => {
      const [yy, mm] = m.ym.split('-');
      return `<option value="${m.ym}" ${m.ym===_financeSelectedMonth?'selected':''}>${yy} 年 ${parseInt(mm)} 月</option>`;
    })
  ].join('');
  return `<select class="fin-month-picker" onchange="selectFinanceMonth(this.value)">${pickerOptions}</select>`;
}

function _renderMonthsBlock(term, sum) {
  if (!sum.months.length) return '<div class="fin-empty">本屆尚無紀錄</div>';

  const isOverview = _financeSelectedMonth === '__overview__';
  const selected = isOverview ? null : sum.months.find(m => m.ym === _financeSelectedMonth);

  const contentHtml = isOverview
    ? _financeRenderTermOverview(sum)
    : (selected ? `<div class="fin-month-weeks">${_financeRenderMonthWeeks(selected)}</div>` : '<div class="fin-empty">未選擇月份</div>');

  return `
    <div class="fin-months-block">
      ${contentHtml}
    </div>
  `;
}

function _financeRenderTermOverview(sum) {
  let totIn = 0, totOut = 0;
  const rows = sum.months.map(m => {
    totIn  += m.inc;
    totOut += m.exp;
    const [yy, mm] = m.ym.split('-');
    return `<tr onclick="selectFinanceMonth('${m.ym}')">
      <td>${yy} 年 ${parseInt(mm)} 月</td>
      <td class="in">+${_finFmt(m.inc)}</td>
      <td class="out">-${_finFmt(m.exp)}</td>
      <td class="bal">${_finFmt(m.lastBal)}</td>
    </tr>`;
  }).join('');
  return `
    <table class="fin-monthly-table">
      <thead><tr>
        <th>月份</th><th>收入</th><th>支出</th><th>月底結餘</th>
      </tr></thead>
      <tbody>
        ${rows}
        <tr class="total-row">
          <td>合計</td>
          <td class="in">+${_finFmt(totIn)}</td>
          <td class="out">-${_finFmt(totOut)}</td>
          <td class="bal">${_finFmt(sum.currentBalance)}</td>
        </tr>
      </tbody>
    </table>
  `;
}

// （保留舊函式以防其他地方引用，但已不被 renderFinance 呼叫）

function _financeRenderReceivables() {
  const list = (_financeParsed && _financeParsed.receivables) || [];
  const unpaid = list.filter(r => r.status === '未繳');
  const paid   = list.filter(r => r.status === '已繳');
  const totalUnpaid = unpaid.reduce((s, r) => s + r.amount, 0);

  const visible =
    _receivableFilter === 'all'  ? list :
    _receivableFilter === 'paid' ? paid :
                                   unpaid;

  const filterBar = `
    <div class="fin-recv-bar">
      <span class="fin-recv-title">應收追蹤</span>
      ${unpaid.length ? `<span class="fin-recv-total">未繳合計 ${_finFmt(totalUnpaid)}</span>` : ''}
      <span style="flex:1;"></span>
      <select class="fin-recv-filter-select" onchange="setReceivableFilter(this.value)">
        <option value="unpaid" ${_receivableFilter==='unpaid'?'selected':''}>未繳 ${unpaid.length}</option>
        <option value="paid"   ${_receivableFilter==='paid'?'selected':''}>已繳 ${paid.length}</option>
        <option value="all"    ${_receivableFilter==='all'?'selected':''}>全部 ${list.length}</option>
      </select>
      ${_canEditTab('finance') ? `<button class="btn btn-primary" style="padding:7px 14px;font-size:12px;" onclick="openReceivableAdd()">新增</button>` : ''}
    </div>
  `;

  let listHtml;
  if (!visible.length) {
    const emptyMsg = _receivableFilter === 'unpaid' ? '目前沒有未繳項目' :
                     _receivableFilter === 'paid'   ? '尚無已銷帳紀錄' :
                                                      '尚無應收紀錄';
    listHtml = `<div class="fin-recv-empty">${emptyMsg}</div>`;
  } else {
    listHtml = visible.map(r => {
      const isPaid = r.status === '已繳';
      const settleTxt = isPaid && r.settleDate
        ? `已銷 ${_escH(r.settleDate)}${r.settleSheet?'·'+_escH(r.settleSheet):''}` : '';
      const adminBtns = _canEditTab('finance')
        ? (isPaid
          ? `<button class="btn-act del" onclick="confirmReceivableDelete(${r.rowIndex})">×</button>`
          : `<button class="btn-act settle" onclick="confirmReceivableSettle(${r.rowIndex})">銷帳</button><button class="btn-act del" onclick="confirmReceivableDelete(${r.rowIndex})">×</button>`)
        : '';
      const subInfo = [_escH(r.date), _escH(r.item), r.note ? _escH(r.note) : '', settleTxt].filter(Boolean).join(' · ');
      return `
        <div class="fin-recv-row${isPaid?' paid':''}">
          <span class="badge ${isPaid?'paid':'unpaid'}">${isPaid?'已繳':'未繳'}</span>
          <div class="info">
            <div class="member">${_escH(r.member)}</div>
            <div class="item">${subInfo}</div>
          </div>
          <span class="amt">${_finFmt(r.amount)}</span>
          <div class="actions">${adminBtns}</div>
        </div>
      `;
    }).join('');
  }

  return `${filterBar}<div class="fin-recv-card">${listHtml}</div>`;
}

function setReceivableFilter(f) {
  _receivableFilter = f;
  renderFinance();
}

async function refreshFinance() {
  showToast('重新載入中...');
  const ok = await _fetchFinance();
  if (ok) {
    renderFinance();
    showToast('已更新');
  } else {
    showToast('載入失敗');
  }
}

const FINANCE_TYPE_SUGGESTIONS = {
  income:  ['入席費', '額外收入', '職董贊助', '主席贊助', '報名費', '入會費'],
  expense: ['早餐', '額外支出', '印製品請款', '生日蛋糕', '桌牌', '獎狀', '名牌', '競賽獎金', '主持費', '攝影師', '場地費', '董顧大使費用', '會員DM', 'BOD文宣']
};

// 從「億展第X屆」解析屆別號（一-十）
function _termNumOfName(name) {
  const m = String(name||'').match(/^億展第([一二三四五六七八九十]+)屆$/);
  if (!m) return 0;
  const map = {一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
  const s = m[1];
  if (s in map) return map[s];
  if (s[0]==='十') return 10 + (map[s[1]]||0);
  if (s.length===2 && s[1]==='十') return map[s[0]]*10;
  if (s.length===3 && s[1]==='十') return map[s[0]]*10 + (map[s[2]]||0);
  return 0;
}
function _isV6PlusIncome() {
  return _termNumOfName(_financeTermTab) >= 6;
}

function openFinanceAdd() {
  if (!_canEditTab('finance')) { showToast('無權限'); return; }
  if (!_financeTermTab) { showToast('請先選擇屆別'); return; }

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'financeAddModal';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">＋ 新增紀錄</div>
      <div style="font-size:12px;color:var(--text-soft);margin-bottom:14px;">寫入：<b style="color:var(--red);">${_escH(_financeTermTab)}</b></div>

      <div class="modal-field">
        <div class="modal-label">類型</div>
        <div class="fin-kind-toggle">
          <button type="button" class="fin-kind-btn" data-kind="income"  onclick="_setFinAddKind('income')">收入</button>
          <button type="button" class="fin-kind-btn active" data-kind="expense" onclick="_setFinAddKind('expense')">支出</button>
        </div>
        <input type="hidden" id="finAddKind" value="expense">
      </div>

      <!-- ===== 通用區塊（支出 / 第五屆以前的收入） ===== -->
      <div id="finAddNormal">
        <div class="modal-field">
          <div class="modal-label">性質（點選欄位會顯示常用選項）</div>
          <input type="text" class="modal-input" id="finAddType" list="finTypeList" placeholder="例如：早餐 / 入席費 / 印製品請款" autocomplete="off">
          <datalist id="finTypeList"></datalist>
        </div>

        <div class="modal-row">
          <div class="modal-field" style="flex:2;">
            <div class="modal-label">日期</div>
            <input type="date" class="modal-input" id="finAddDate" value="${todayStr}">
          </div>
          <div class="modal-field" style="flex:1;">
            <div class="modal-label">金額</div>
            <input type="number" class="modal-input" id="finAddAmount" placeholder="0" inputmode="numeric">
          </div>
        </div>

        <div class="modal-row">
          <div class="modal-field" style="flex:1;">
            <div class="modal-label">付費人數（選填）</div>
            <input type="number" class="modal-input" id="finAddPaid" placeholder="0" inputmode="numeric">
          </div>
          <div class="modal-field" style="flex:1;">
            <div class="modal-label">總人數（選填）</div>
            <input type="number" class="modal-input" id="finAddTotal" placeholder="0" inputmode="numeric">
          </div>
        </div>

        <div class="modal-field">
          <div class="modal-label">備註（選填）</div>
          <input type="text" class="modal-input" id="finAddNote" placeholder="例如：阿寶、文豪未繳">
        </div>
      </div>

      <!-- ===== 第六屆+ 專用區塊（收入 / 支出共用） ===== -->
      <div id="finAddV6" style="display:none;">
        <div class="modal-field">
          <div class="modal-label" id="finAddV6TypeLabel">類型</div>
          <select class="modal-input" id="finAddV6Type" onchange="_setFinAddV6Type(this.value)"></select>
        </div>

        <div class="modal-field">
          <div class="modal-label">日期</div>
          <input type="date" class="modal-input" id="finAddDateV6" value="${todayStr}">
        </div>

        <!-- 收入：場餐費 -->
        <div id="finAddV6Meal" style="display:none;">
          <div style="font-size:12px;color:var(--red);font-weight:900;margin:6px 0;">會員</div>
          <div class="modal-row">
            <div class="modal-field" style="flex:1;">
              <div class="modal-label">人數</div>
              <input type="number" class="modal-input" id="finAddV6MemPaid" placeholder="0" inputmode="numeric" oninput="_updV6MealMember()">
            </div>
            <div class="modal-field" style="flex:1;">
              <div class="modal-label">單價</div>
              <input type="number" class="modal-input" id="finAddV6MemPrice" placeholder="0" inputmode="numeric" oninput="_updV6MealMember()">
            </div>
            <div class="modal-field" style="flex:1;">
              <div class="modal-label">總價</div>
              <input type="number" class="modal-input" id="finAddV6MemTotal" placeholder="0" readonly style="background:var(--gray-light);">
            </div>
          </div>

          <div style="font-size:12px;color:var(--red);font-weight:900;margin:14px 0 6px;">來賓</div>
          <div class="modal-row">
            <div class="modal-field" style="flex:1;">
              <div class="modal-label">人數</div>
              <input type="number" class="modal-input" id="finAddV6GstPaid" placeholder="0" inputmode="numeric" oninput="_updV6MealGuest()">
            </div>
            <div class="modal-field" style="flex:1;">
              <div class="modal-label">單價</div>
              <input type="number" class="modal-input" id="finAddV6GstPrice" placeholder="0" inputmode="numeric" oninput="_updV6MealGuest()">
            </div>
            <div class="modal-field" style="flex:1;">
              <div class="modal-label">總價</div>
              <input type="number" class="modal-input" id="finAddV6GstTotal" placeholder="0" readonly style="background:var(--gray-light);">
            </div>
          </div>
          <div style="font-size:11px;color:var(--text-soft);margin-bottom:8px;">兩組可只填其一，留白該組就不會建立紀錄。</div>
        </div>

        <!-- 收入：其他 -->
        <div id="finAddV6Other" style="display:none;">
          <div class="modal-row">
            <div class="modal-field" style="flex:2;">
              <div class="modal-label">收入來源</div>
              <input type="text" class="modal-input" id="finAddV6OtherSrc" placeholder="例如：贊助 / 報名費">
            </div>
            <div class="modal-field" style="flex:1;">
              <div class="modal-label">費用</div>
              <input type="number" class="modal-input" id="finAddV6OtherAmt" placeholder="0" inputmode="numeric">
            </div>
          </div>
        </div>

        <!-- 支出：飯店費用 -->
        <div id="finAddV6Hotel" style="display:none;">
          <div class="modal-row">
            <div class="modal-field" style="flex:1;">
              <div class="modal-label">會員</div>
              <input type="number" class="modal-input" id="finAddV6HotelMem" placeholder="0" inputmode="numeric" oninput="_updV6Hotel()">
            </div>
            <div class="modal-field" style="flex:1;">
              <div class="modal-label">來賓</div>
              <input type="number" class="modal-input" id="finAddV6HotelGst" placeholder="0" inputmode="numeric" oninput="_updV6Hotel()">
            </div>
            <div class="modal-field" style="flex:1;">
              <div class="modal-label">董顧</div>
              <input type="number" class="modal-input" id="finAddV6HotelCons" placeholder="0" inputmode="numeric" oninput="_updV6Hotel()">
            </div>
          </div>
          <div style="font-size:11px;color:var(--text-soft);margin:-4px 0 8px;">合計人數：<b id="finAddV6HotelSumDisp" style="color:var(--text);">0</b> 人</div>
          <div class="modal-row">
            <div class="modal-field" style="flex:1;">
              <div class="modal-label">單價</div>
              <input type="number" class="modal-input" id="finAddV6HotelPrice" placeholder="0" inputmode="numeric" oninput="_updV6Hotel()">
            </div>
            <div class="modal-field" style="flex:1;">
              <div class="modal-label">總價</div>
              <input type="number" class="modal-input" id="finAddV6HotelTotal" placeholder="0" readonly style="background:var(--gray-light);">
            </div>
          </div>
        </div>

        <!-- 支出:其他 -->
        <div id="finAddV6ExpOther" style="display:none;">
          <div class="modal-field">
            <div class="modal-label">內容</div>
            <input type="text" class="modal-input" id="finAddV6ExpOtherDesc" placeholder="例如：印製品請款">
          </div>
          <div class="modal-row">
            <div class="modal-field" style="flex:1;">
              <div class="modal-label">單價</div>
              <input type="number" class="modal-input" id="finAddV6ExpOtherPrice" placeholder="0" inputmode="numeric" oninput="_updV6ExpOther()">
            </div>
            <div class="modal-field" style="flex:1;">
              <div class="modal-label">數量</div>
              <input type="number" class="modal-input" id="finAddV6ExpOtherQty" placeholder="1" inputmode="numeric" oninput="_updV6ExpOther()">
            </div>
            <div class="modal-field" style="flex:1;">
              <div class="modal-label">總價</div>
              <input type="number" class="modal-input" id="finAddV6ExpOtherTotal" placeholder="0" readonly style="background:var(--gray-light);">
            </div>
          </div>
        </div>
      </div>

      <div class="modal-btns">
        <button class="modal-cancel" onclick="closeFinanceAdd()">取消</button>
        <button class="modal-save" id="finAddSave" onclick="submitFinanceAdd()">儲存</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  _setFinAddKind('expense');
}

function _setFinAddKind(kind) {
  const hidden = document.getElementById('finAddKind');
  if (hidden) hidden.value = kind;
  document.querySelectorAll('.fin-kind-btn').forEach(b => b.classList.toggle('active', b.dataset.kind === kind));
  const list = document.getElementById('finTypeList');
  if (list) {
    list.innerHTML = (FINANCE_TYPE_SUGGESTIONS[kind] || []).map(t => `<option value="${_escH(t)}">`).join('');
  }
  // 第六屆+ 收入或支出：切換為下拉專用區塊
  const useV6 = _isV6PlusIncome(); // 第六屆+ 收支都用 V6
  const v6 = document.getElementById('finAddV6');
  const normal = document.getElementById('finAddNormal');
  if (v6) v6.style.display = useV6 ? '' : 'none';
  if (normal) normal.style.display = useV6 ? 'none' : '';
  if (useV6) {
    // 設定下拉選項與 label
    const sel = document.getElementById('finAddV6Type');
    const lbl = document.getElementById('finAddV6TypeLabel');
    if (kind === 'income') {
      lbl.textContent = '收入類型';
      sel.innerHTML = `<option value="場餐費">場餐費</option><option value="其他">其他</option>`;
    } else {
      lbl.textContent = '支出類型';
      sel.innerHTML = `<option value="飯店費用">飯店費用</option><option value="其他">其他</option>`;
    }
    _setFinAddV6Type(sel.value);
  }
}

function _setFinAddV6Type(value) {
  const kind = document.getElementById('finAddKind')?.value || 'expense';
  const meal     = document.getElementById('finAddV6Meal');
  const other    = document.getElementById('finAddV6Other');
  const hotel    = document.getElementById('finAddV6Hotel');
  const expOther = document.getElementById('finAddV6ExpOther');
  if (meal)     meal.style.display     = (kind === 'income' && value === '場餐費') ? '' : 'none';
  if (other)    other.style.display    = (kind === 'income' && value === '其他')   ? '' : 'none';
  if (hotel)    hotel.style.display    = (kind === 'expense' && value === '飯店費用') ? '' : 'none';
  if (expOther) expOther.style.display = (kind === 'expense' && value === '其他')     ? '' : 'none';
}

// 即時計算（總價 = 人數 × 單價 / 加總人數 × 單價）
function _updV6MealMember() {
  const n = +document.getElementById('finAddV6MemPaid').value || 0;
  const p = +document.getElementById('finAddV6MemPrice').value || 0;
  document.getElementById('finAddV6MemTotal').value = n * p || '';
}
function _updV6MealGuest() {
  const n = +document.getElementById('finAddV6GstPaid').value || 0;
  const p = +document.getElementById('finAddV6GstPrice').value || 0;
  document.getElementById('finAddV6GstTotal').value = n * p || '';
}
function _updV6Hotel() {
  const m = +document.getElementById('finAddV6HotelMem').value || 0;
  const g = +document.getElementById('finAddV6HotelGst').value || 0;
  const c = +document.getElementById('finAddV6HotelCons').value || 0;
  const sum = m + g + c;
  const p = +document.getElementById('finAddV6HotelPrice').value || 0;
  document.getElementById('finAddV6HotelSumDisp').textContent = sum;
  document.getElementById('finAddV6HotelTotal').value = sum * p || '';
}
function _updV6ExpOther() {
  const p = +document.getElementById('finAddV6ExpOtherPrice').value || 0;
  const q = +document.getElementById('finAddV6ExpOtherQty').value || 0;
  document.getElementById('finAddV6ExpOtherTotal').value = (p * q) || '';
}

function closeFinanceAdd() {
  const m = document.getElementById('financeAddModal');
  if (m) m.remove();
}

async function submitFinanceAdd() {
  const sheet  = _financeTermTab;
  const kind   = document.getElementById('finAddKind').value;
  const useV6  = _isV6PlusIncome(); // 第六屆+ 收支都用 V6

  if (!sheet) { showToast('請先選擇屆別'); return; }

  // 收集要新增的紀錄陣列：[{ date, type, kind, amount, paid, total, note }, ...]
  const records = [];

  if (useV6) {
    const date = document.getElementById('finAddDateV6').value.trim().replace(/-/g, '/');
    if (!date) { showToast('請填日期'); return; }
    const v6Type = document.getElementById('finAddV6Type').value;

    if (kind === 'income' && v6Type === '場餐費') {
      const memN = +document.getElementById('finAddV6MemPaid').value || 0;
      const memP = +document.getElementById('finAddV6MemPrice').value || 0;
      const gstN = +document.getElementById('finAddV6GstPaid').value || 0;
      const gstP = +document.getElementById('finAddV6GstPrice').value || 0;
      const memTotal = memN * memP;
      const gstTotal = gstN * gstP;
      if (memTotal) records.push({ date, type: '場餐費（會員）', kind: 'income', amount: memTotal, paid: memN, total: memN, note: '' });
      if (gstTotal) records.push({ date, type: '場餐費（來賓）', kind: 'income', amount: gstTotal, paid: gstN, total: gstN, note: '' });
      if (!records.length) { showToast('會員或來賓兩組至少填一組（人數×單價）'); return; }
    } else if (kind === 'income' && v6Type === '其他') {
      const src = document.getElementById('finAddV6OtherSrc').value.trim();
      const amt = +document.getElementById('finAddV6OtherAmt').value || 0;
      if (!src) { showToast('請填收入來源'); return; }
      if (!amt) { showToast('請填費用'); return; }
      records.push({ date, type: src, kind: 'income', amount: amt, paid: 0, total: 0, note: '' });
    } else if (kind === 'expense' && v6Type === '飯店費用') {
      const m = +document.getElementById('finAddV6HotelMem').value || 0;
      const g = +document.getElementById('finAddV6HotelGst').value || 0;
      const c = +document.getElementById('finAddV6HotelCons').value || 0;
      const p = +document.getElementById('finAddV6HotelPrice').value || 0;
      const sum = m + g + c;
      const total = sum * p;
      if (!sum)   { showToast('請填會員/來賓/董顧人數'); return; }
      if (!total) { showToast('請填單價'); return; }
      records.push({
        date, type: '飯店費用', kind: 'expense', amount: total, paid: sum, total: sum,
        note: `會員${m}/來賓${g}/董顧${c} × ${p}`
      });
    } else if (kind === 'expense' && v6Type === '其他') {
      const desc = document.getElementById('finAddV6ExpOtherDesc').value.trim();
      const p    = +document.getElementById('finAddV6ExpOtherPrice').value || 0;
      const q    = +document.getElementById('finAddV6ExpOtherQty').value || 0;
      const total = p * q;
      if (!desc)  { showToast('請填內容'); return; }
      if (!p)     { showToast('請填單價'); return; }
      if (!q)     { showToast('請填數量'); return; }
      records.push({ date, type: desc, kind: 'expense', amount: total, paid: q, total: q, note: q > 1 ? `${p} × ${q}` : '' });
    }
  } else {
    const date   = document.getElementById('finAddDate').value.trim().replace(/-/g, '/');
    const type   = document.getElementById('finAddType').value.trim();
    const amount = +document.getElementById('finAddAmount').value || 0;
    const paid   = +document.getElementById('finAddPaid').value || 0;
    const total  = +document.getElementById('finAddTotal').value || 0;
    const note   = document.getElementById('finAddNote').value.trim();
    if (!date)   { showToast('請填日期'); return; }
    if (!type)   { showToast('請填性質'); return; }
    if (!amount) { showToast('請填金額'); return; }
    records.push({ date, type, kind, amount, paid, total, note });
  }

  // ===== 樂觀更新：本地依序 push 每筆紀錄，並重新計算結餘 =====
  const sheetData = _financeRaw?.sheets?.[sheet];
  const optimisticIndices = [];
  if (sheetData?.length) {
    const ncol = sheetData[0]?.length || 8;
    let lastBal = 0;
    for (let i = sheetData.length - 1; i >= 0; i--) {
      const v = Number(sheetData[i][4]);
      if (!isNaN(v) && sheetData[i][4] !== '' && sheetData[i][4] !== null) { lastBal = v; break; }
    }
    for (const r of records) {
      lastBal = r.kind === 'income' ? lastBal + r.amount : lastBal - r.amount;
      const row = new Array(ncol).fill('');
      row[0] = r.date;
      row[1] = r.type;
      row[2] = r.kind === 'income'  ? r.amount : '';
      row[3] = r.kind === 'expense' ? r.amount : '';
      row[4] = lastBal;
      row[5] = r.paid  || '';
      row[6] = r.total || '';
      row[ncol - 1] = r.note;
      if (ncol === 11) row[9] = lastBal;
      sheetData.push(row);
      optimisticIndices.push(sheetData.length - 1);
    }
    _financeParsed = _parseFinance(_financeRaw);
  }
  closeFinanceAdd();
  if (optimisticIndices.length) renderFinance();
  showToast(`已新增 ${records.length} 筆`);

  // ===== 真正 POST 在背景同步（依序送，避免後端結餘亂序） =====
  try {
    for (const r of records) {
      const res = await fetch(FINANCE_API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'append', sheet, ...r })
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'unknown');
      if (j.routed && j.sheet) _financeTermTab = j.sheet;
    }
    _fetchFinance().then(() => { if (_activeTab === 'finance') renderFinance(); });
  } catch (err) {
    // 回滾本地樂觀更新（從尾端移除剛 push 的列）
    if (sheetData && optimisticIndices.length) {
      // 由大到小 splice
      optimisticIndices.sort((a,b) => b - a).forEach(idx => sheetData.splice(idx, 1));
      _financeParsed = _parseFinance(_financeRaw);
      renderFinance();
    }
    showToast('儲存失敗：' + (err.message || err));
  }
}

// ===== 編輯 =====
function _findFinanceRecord(rowIndex) {
  if (!_financeParsed) return null;
  for (const t of _financeParsed.terms) {
    if (t.name !== _financeTermTab) continue;
    const r = t.records.find(rec => rec.rowIndex === rowIndex);
    if (r) return { term: t, record: r };
  }
  return null;
}

function _detectV6EditMode(r) {
  if (r.income > 0) {
    if (r.type === '場餐費（會員）') return 'mealMember';
    if (r.type === '場餐費（來賓）') return 'mealGuest';
    return 'incomeOther';
  }
  if (r.expense > 0) {
    if (r.type === '飯店費用') return 'hotel';
    return 'expenseOther';
  }
  return 'incomeOther';
}

function openFinanceEdit(rowIndex) {
  if (!_canEditTab('finance')) { showToast('無權限'); return; }
  const found = _findFinanceRecord(rowIndex);
  if (!found) { showToast('找不到該紀錄'); return; }
  const r = found.record;
  const useV6 = _isV6PlusIncome();
  const dateVal = _escH((r.date || '').replace(/\//g, '-'));

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'financeEditModal';

  if (!useV6) {
    overlay.innerHTML = `
      <div class="modal-box">
        <div class="modal-title">編輯紀錄（列 ${rowIndex}）</div>
        <div class="modal-field"><div class="modal-label">日期</div>
          <input type="date" class="modal-input" id="finEditDate" value="${dateVal}"></div>
        <div class="modal-field"><div class="modal-label">性質</div>
          <input type="text" class="modal-input" id="finEditType" value="${_escH(r.type)}"></div>
        <div class="modal-row">
          <div class="modal-field" style="flex:1;"><div class="modal-label">收入</div>
            <input type="number" class="modal-input" id="finEditIncome" value="${r.income || ''}"></div>
          <div class="modal-field" style="flex:1;"><div class="modal-label">支出</div>
            <input type="number" class="modal-input" id="finEditExpense" value="${r.expense || ''}"></div>
        </div>
        <div class="modal-row">
          <div class="modal-field" style="flex:1;"><div class="modal-label">付費人數</div>
            <input type="number" class="modal-input" id="finEditPaid" value="${r.paid || ''}"></div>
          <div class="modal-field" style="flex:1;"><div class="modal-label">總人數</div>
            <input type="number" class="modal-input" id="finEditTotal" value="${r.total || ''}"></div>
        </div>
        <div class="modal-field"><div class="modal-label">備註</div>
          <input type="text" class="modal-input" id="finEditNote" value="${_escH(r.note)}"></div>
        <div class="modal-btns">
          <button class="modal-del" onclick="closeFinanceEdit();confirmFinanceDelete(${rowIndex})">刪除</button>
          <button class="modal-cancel" onclick="closeFinanceEdit()">取消</button>
          <button class="modal-save" id="finEditSave" onclick="submitFinanceEdit(${rowIndex})">儲存</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    return;
  }

  // 第六屆+ 用 V6 介面（與新增完全一致：類型 toggle + 可切換子類型下拉 + 4 子區塊）
  const mode = _detectV6EditMode(r);
  const editKind = (mode === 'hotel' || mode === 'expenseOther') ? 'expense' : 'income';
  const v6TypeDefault = (mode === 'mealMember' || mode === 'mealGuest') ? '場餐費'
                      : mode === 'hotel' ? '飯店費用'
                      : '其他';

  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">編輯紀錄（列 ${rowIndex}）</div>
      <div class="modal-field">
        <div class="modal-label">類型</div>
        <div class="fin-kind-toggle">
          <button type="button" class="fin-kind-btn ${editKind==='income'?'active':''}" data-kind="income" disabled>收入</button>
          <button type="button" class="fin-kind-btn ${editKind==='expense'?'active':''}" data-kind="expense" disabled>支出</button>
        </div>
        <input type="hidden" id="finAddKind" value="${editKind}">
      </div>

      <div class="modal-field">
        <div class="modal-label" id="finAddV6TypeLabel">類型</div>
        <select class="modal-input" id="finAddV6Type" onchange="_setFinAddV6Type(this.value)"></select>
      </div>

      <div class="modal-field">
        <div class="modal-label">日期</div>
        <input type="date" class="modal-input" id="finAddDateV6" value="${dateVal}">
      </div>

      <div id="finAddV6Meal" style="display:none;">
        <div style="font-size:12px;color:var(--red);font-weight:900;margin:6px 0;">會員</div>
        <div class="modal-row">
          <div class="modal-field" style="flex:1;"><div class="modal-label">人數</div>
            <input type="number" class="modal-input" id="finAddV6MemPaid" placeholder="0" inputmode="numeric" oninput="_updV6MealMember()"></div>
          <div class="modal-field" style="flex:1;"><div class="modal-label">單價</div>
            <input type="number" class="modal-input" id="finAddV6MemPrice" placeholder="0" inputmode="numeric" oninput="_updV6MealMember()"></div>
          <div class="modal-field" style="flex:1;"><div class="modal-label">總價</div>
            <input type="number" class="modal-input" id="finAddV6MemTotal" placeholder="0" readonly style="background:var(--gray-light);"></div>
        </div>
        <div style="font-size:12px;color:var(--red);font-weight:900;margin:14px 0 6px;">來賓</div>
        <div class="modal-row">
          <div class="modal-field" style="flex:1;"><div class="modal-label">人數</div>
            <input type="number" class="modal-input" id="finAddV6GstPaid" placeholder="0" inputmode="numeric" oninput="_updV6MealGuest()"></div>
          <div class="modal-field" style="flex:1;"><div class="modal-label">單價</div>
            <input type="number" class="modal-input" id="finAddV6GstPrice" placeholder="0" inputmode="numeric" oninput="_updV6MealGuest()"></div>
          <div class="modal-field" style="flex:1;"><div class="modal-label">總價</div>
            <input type="number" class="modal-input" id="finAddV6GstTotal" placeholder="0" readonly style="background:var(--gray-light);"></div>
        </div>
        <div style="font-size:11px;color:var(--text-soft);margin-bottom:8px;">原本紀錄會更新；另一組若填寫會新增為第二筆紀錄。</div>
      </div>

      <div id="finAddV6Other" style="display:none;">
        <div class="modal-row">
          <div class="modal-field" style="flex:2;"><div class="modal-label">收入來源</div>
            <input type="text" class="modal-input" id="finAddV6OtherSrc" placeholder="例如：贊助 / 報名費"></div>
          <div class="modal-field" style="flex:1;"><div class="modal-label">費用</div>
            <input type="number" class="modal-input" id="finAddV6OtherAmt" placeholder="0" inputmode="numeric"></div>
        </div>
      </div>

      <div id="finAddV6Hotel" style="display:none;">
        <div class="modal-row">
          <div class="modal-field" style="flex:1;"><div class="modal-label">會員</div>
            <input type="number" class="modal-input" id="finAddV6HotelMem" placeholder="0" inputmode="numeric" oninput="_updV6Hotel()"></div>
          <div class="modal-field" style="flex:1;"><div class="modal-label">來賓</div>
            <input type="number" class="modal-input" id="finAddV6HotelGst" placeholder="0" inputmode="numeric" oninput="_updV6Hotel()"></div>
          <div class="modal-field" style="flex:1;"><div class="modal-label">董顧</div>
            <input type="number" class="modal-input" id="finAddV6HotelCons" placeholder="0" inputmode="numeric" oninput="_updV6Hotel()"></div>
        </div>
        <div style="font-size:11px;color:var(--text-soft);margin:-4px 0 8px;">合計人數：<b id="finAddV6HotelSumDisp" style="color:var(--text);">0</b> 人</div>
        <div class="modal-row">
          <div class="modal-field" style="flex:1;"><div class="modal-label">單價</div>
            <input type="number" class="modal-input" id="finAddV6HotelPrice" placeholder="0" inputmode="numeric" oninput="_updV6Hotel()"></div>
          <div class="modal-field" style="flex:1;"><div class="modal-label">總價</div>
            <input type="number" class="modal-input" id="finAddV6HotelTotal" placeholder="0" readonly style="background:var(--gray-light);"></div>
        </div>
      </div>

      <div id="finAddV6ExpOther" style="display:none;">
        <div class="modal-field"><div class="modal-label">內容</div>
          <input type="text" class="modal-input" id="finAddV6ExpOtherDesc" placeholder="例如：印製品請款"></div>
        <div class="modal-row">
          <div class="modal-field" style="flex:1;"><div class="modal-label">單價</div>
            <input type="number" class="modal-input" id="finAddV6ExpOtherPrice" placeholder="0" inputmode="numeric" oninput="_updV6ExpOther()"></div>
          <div class="modal-field" style="flex:1;"><div class="modal-label">數量</div>
            <input type="number" class="modal-input" id="finAddV6ExpOtherQty" placeholder="1" inputmode="numeric" oninput="_updV6ExpOther()"></div>
          <div class="modal-field" style="flex:1;"><div class="modal-label">總價</div>
            <input type="number" class="modal-input" id="finAddV6ExpOtherTotal" placeholder="0" readonly style="background:var(--gray-light);"></div>
        </div>
      </div>

      <div class="modal-btns">
        <button class="modal-del" onclick="closeFinanceEdit();confirmFinanceDelete(${rowIndex})">刪除</button>
        <button class="modal-cancel" onclick="closeFinanceEdit()">取消</button>
        <button class="modal-save" id="finEditSave" onclick="_submitFinanceEditApply(${rowIndex})">儲存</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // 設定子類型下拉選項並切到對應子區塊
  const _sel = document.getElementById('finAddV6Type');
  const _lbl = document.getElementById('finAddV6TypeLabel');
  if (editKind === 'income') {
    _lbl.textContent = '收入類型';
    _sel.innerHTML = '<option value="場餐費">場餐費</option><option value="其他">其他</option>';
  } else {
    _lbl.textContent = '支出類型';
    _sel.innerHTML = '<option value="飯店費用">飯店費用</option><option value="其他">其他</option>';
  }
  _sel.value = v6TypeDefault;
  _setFinAddV6Type(v6TypeDefault);

  // 預填當前 mode 的值
  if (mode === 'mealMember' || mode === 'mealGuest') {
    const editingMember = mode === 'mealMember';
    const n = r.paid || 0;
    const total = r.income || 0;
    const price = n > 0 ? Math.round(total / n) : total;
    if (editingMember) {
      document.getElementById('finAddV6MemPaid').value  = n || '';
      document.getElementById('finAddV6MemPrice').value = price || '';
      document.getElementById('finAddV6MemTotal').value = total || '';
    } else {
      document.getElementById('finAddV6GstPaid').value  = n || '';
      document.getElementById('finAddV6GstPrice').value = price || '';
      document.getElementById('finAddV6GstTotal').value = total || '';
    }
  } else if (mode === 'hotel') {
    const n = r.paid || 0;
    const total = r.expense || 0;
    const price = n > 0 ? Math.round(total / n) : total;
    document.getElementById('finAddV6HotelMem').value   = n || '';
    document.getElementById('finAddV6HotelPrice').value = price || '';
    _updV6Hotel();
  } else if (mode === 'incomeOther') {
    document.getElementById('finAddV6OtherSrc').value = r.type || '';
    document.getElementById('finAddV6OtherAmt').value = r.income || '';
  } else {
    const q = r.paid || 1;
    const total = r.expense || 0;
    const price = q > 0 ? Math.round(total / q) : total;
    document.getElementById('finAddV6ExpOtherDesc').value  = r.type || '';
    document.getElementById('finAddV6ExpOtherPrice').value = price || '';
    document.getElementById('finAddV6ExpOtherQty').value   = q || '';
    document.getElementById('finAddV6ExpOtherTotal').value = total || '';
  }
}

async function _submitFinanceEditApply(rowIndex) {
  const sheet  = _financeTermTab;
  const date   = document.getElementById('finAddDateV6').value.trim().replace(/-/g, '/');
  const kind   = document.getElementById('finAddKind').value;
  const v6Type = document.getElementById('finAddV6Type').value;
  if (!date) { showToast('請填日期'); return; }

  let updateValues = null;
  const appendRecords = [];

  if (kind === 'income' && v6Type === '場餐費') {
    const memN = +document.getElementById('finAddV6MemPaid').value || 0;
    const memP = +document.getElementById('finAddV6MemPrice').value || 0;
    const gstN = +document.getElementById('finAddV6GstPaid').value || 0;
    const gstP = +document.getElementById('finAddV6GstPrice').value || 0;
    const memT = memN * memP;
    const gstT = gstN * gstP;
    if (!memT && !gstT) { showToast('會員或來賓至少填一組'); return; }
    if (memT && gstT) {
      updateValues = { date, type: '場餐費（會員）', income: memT, expense: 0, paid: memN, total: memN, note: '' };
      appendRecords.push({ date, type: '場餐費（來賓）', kind: 'income', amount: gstT, paid: gstN, total: gstN, note: '' });
    } else if (memT) {
      updateValues = { date, type: '場餐費（會員）', income: memT, expense: 0, paid: memN, total: memN, note: '' };
    } else {
      updateValues = { date, type: '場餐費（來賓）', income: gstT, expense: 0, paid: gstN, total: gstN, note: '' };
    }
  } else if (kind === 'income' && v6Type === '其他') {
    const src = document.getElementById('finAddV6OtherSrc').value.trim();
    const amt = +document.getElementById('finAddV6OtherAmt').value || 0;
    if (!src) { showToast('請填收入來源'); return; }
    if (!amt) { showToast('請填費用'); return; }
    updateValues = { date, type: src, income: amt, expense: 0, paid: 0, total: 0, note: '' };
  } else if (kind === 'expense' && v6Type === '飯店費用') {
    const m = +document.getElementById('finAddV6HotelMem').value || 0;
    const g = +document.getElementById('finAddV6HotelGst').value || 0;
    const c = +document.getElementById('finAddV6HotelCons').value || 0;
    const p = +document.getElementById('finAddV6HotelPrice').value || 0;
    const sum = m + g + c;
    const total = sum * p;
    if (!sum)   { showToast('請填會員/來賓/董顧人數'); return; }
    if (!total) { showToast('請填單價'); return; }
    updateValues = { date, type: '飯店費用', income: 0, expense: total, paid: sum, total: sum, note: `會員${m}/來賓${g}/董顧${c} × ${p}` };
  } else if (kind === 'expense' && v6Type === '其他') {
    const desc = document.getElementById('finAddV6ExpOtherDesc').value.trim();
    const p    = +document.getElementById('finAddV6ExpOtherPrice').value || 0;
    const q    = +document.getElementById('finAddV6ExpOtherQty').value || 0;
    const total = p * q;
    if (!desc)  { showToast('請填內容'); return; }
    if (!total) { showToast('請填單價與數量'); return; }
    updateValues = { date, type: desc, income: 0, expense: total, paid: q, total: q, note: q > 1 ? `${p} × ${q}` : '' };
  }

  if (!updateValues) { showToast('資料不完整'); return; }

  const btn = document.getElementById('finEditSave');
  btn.disabled = true; btn.textContent = '儲存中...';
  try {
    const r1 = await fetch(FINANCE_API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'update', sheet, rowIndex, values: updateValues })
    });
    const j1 = await r1.json();
    if (!j1.ok) throw new Error(j1.error || 'unknown');
    for (const rec of appendRecords) {
      const r2 = await fetch(FINANCE_API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'append', sheet, ...rec })
      });
      const j2 = await r2.json();
      if (!j2.ok) throw new Error(j2.error || 'unknown');
    }
    showToast('已更新');
    closeFinanceEdit();
    await _fetchFinance();
    renderFinance();
  } catch (err) {
    showToast('更新失敗：' + (err.message || err));
    btn.disabled = false; btn.textContent = '儲存';
  }
}
function closeFinanceEdit() {
  const m = document.getElementById('financeEditModal');
  if (m) m.remove();
}

async function submitFinanceEdit(rowIndex) {
  const sheet = _financeTermTab;
  const v = {
    date:        document.getElementById('finEditDate').value.trim().replace(/-/g, '/'),
    type:        document.getElementById('finEditType').value.trim(),
    income:      +document.getElementById('finEditIncome').value || 0,
    expense:     +document.getElementById('finEditExpense').value || 0,
    paid:        +document.getElementById('finEditPaid').value || 0,
    total:       +document.getElementById('finEditTotal').value || 0,
    note:        document.getElementById('finEditNote').value.trim(),
  };

  const btn = document.getElementById('finEditSave');
  btn.disabled = true; btn.textContent = '儲存中...';
  try {
    const res = await fetch(FINANCE_API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'update', sheet, rowIndex, values: v })
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'unknown');
    showToast('已更新（後續結餘已重算）');
    closeFinanceEdit();
    await _fetchFinance();
    renderFinance();
  } catch (err) {
    showToast('更新失敗：' + (err.message || err));
    btn.disabled = false; btn.textContent = '儲存';
  }
}

// ===== 刪除 =====
function confirmFinanceDelete(rowIndex) {
  if (!_canEditTab('finance')) { showToast('無權限'); return; }
  const found = _findFinanceRecord(rowIndex);
  if (!found) { showToast('找不到該紀錄'); return; }
  const r = found.record;
  const desc = `${r.date} ${r.type} ${r.income ? '+' + r.income : ''}${r.expense ? '-' + r.expense : ''}`;
  if (!confirm('確定刪除此筆？\n' + desc + '\n（後續結餘會自動重算）')) return;
  _doFinanceDelete(_financeTermTab, rowIndex);
}

async function _doFinanceDelete(sheet, rowIndex) {
  try {
    const res = await fetch(FINANCE_API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', sheet, rowIndex })
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'unknown');
    showToast('已刪除');
    await _fetchFinance();
    renderFinance();
  } catch (err) {
    showToast('刪除失敗：' + (err.message || err));
  }
}

// ===== 應收追蹤 =====
function openReceivableAdd() {
  if (!_canEditTab('finance')) { showToast('無權限'); return; }
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  // 取會員清單作為下拉選單（若已載入）
  const memberOptions = (typeof _memberData !== 'undefined' && Array.isArray(_memberData))
    ? _memberData.map(m => m.name).filter(Boolean)
    : [];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'receivableAddModal';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">＋ 新增應收</div>
      <div class="modal-row">
        <div class="modal-field" style="flex:1;">
          <div class="modal-label">日期（欠款發生日）</div>
          <input type="date" class="modal-input" id="recvAddDate" value="${todayStr}">
        </div>
        <div class="modal-field" style="flex:1;">
          <div class="modal-label">會員</div>
          <input type="text" class="modal-input" id="recvAddMember" list="recvMemberList" placeholder="例如：阿寶" autocomplete="off">
          <datalist id="recvMemberList">
            ${memberOptions.map(n => `<option value="${_escH(n)}">`).join('')}
          </datalist>
        </div>
      </div>
      <div class="modal-row">
        <div class="modal-field" style="flex:2;">
          <div class="modal-label">項目</div>
          <input type="text" class="modal-input" id="recvAddItem" list="recvItemList" placeholder="入席費" value="入席費">
          <datalist id="recvItemList">
            <option value="入席費">
            <option value="早餐">
            <option value="名牌">
            <option value="入會費">
            <option value="活動報名費">
          </datalist>
        </div>
        <div class="modal-field" style="flex:1;">
          <div class="modal-label">金額</div>
          <input type="number" class="modal-input" id="recvAddAmount" placeholder="0" inputmode="numeric">
        </div>
      </div>
      <div class="modal-field">
        <div class="modal-label">備註（選填）</div>
        <input type="text" class="modal-input" id="recvAddNote" placeholder="">
      </div>
      <div class="modal-btns">
        <button class="modal-cancel" onclick="closeReceivableAdd()">取消</button>
        <button class="modal-save" id="recvAddSave" onclick="submitReceivableAdd()">新增</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function closeReceivableAdd() {
  const m = document.getElementById('receivableAddModal');
  if (m) m.remove();
}

async function submitReceivableAdd() {
  const dateRaw = document.getElementById('recvAddDate').value.trim();
  const date    = dateRaw.replace(/-/g, '/'); // type=date 給 YYYY-MM-DD，後端用 YYYY/MM/DD
  const member = document.getElementById('recvAddMember').value.trim();
  const item   = document.getElementById('recvAddItem').value.trim() || '入席費';
  const amount = +document.getElementById('recvAddAmount').value || 0;
  const note   = document.getElementById('recvAddNote').value.trim();

  if (!member) { showToast('請填會員姓名'); return; }
  if (!amount) { showToast('請填金額'); return; }

  // 樂觀更新：本地立即新增應收
  let optimisticPushed = false;
  if (_financeRaw?.sheets?.['應收追蹤']) {
    const ar = _financeRaw.sheets['應收追蹤'];
    ar.push([date, member, item, amount, '未繳', '', '', note]);
    _financeParsed = _parseFinance(_financeRaw);
    optimisticPushed = true;
  }
  closeReceivableAdd();
  if (optimisticPushed) renderFinance();
  showToast(optimisticPushed ? '已新增應收' : '儲存中…');

  try {
    const res = await fetch(FINANCE_API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'addReceivable', date, member, item, amount, note })
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'unknown');
    _fetchFinance().then(() => { if (_activeTab === 'finance') renderFinance(); });
  } catch (err) {
    if (optimisticPushed && _financeRaw?.sheets?.['應收追蹤']) {
      _financeRaw.sheets['應收追蹤'].pop();
      _financeParsed = _parseFinance(_financeRaw);
      renderFinance();
    }
    showToast('儲存失敗：' + (err.message || err));
  }
}

function confirmReceivableSettle(rowIndex) {
  if (!_canEditTab('finance')) return;
  const r = ((_financeParsed && _financeParsed.receivables) || []).find(x => x.rowIndex === rowIndex);
  if (!r) return;
  if (!_financeParsed || !_financeParsed.terms.length) { showToast('資料未載入'); return; }

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const sheets = _financeParsed.terms.map(t => t.name);
  const defaultSheet = _financeTermTab || sheets[0];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'receivableSettleModal';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">銷帳</div>
      <div style="background:#f9ecec;border-radius:10px;padding:12px 14px;margin-bottom:14px;">
        <div style="font-size:15px;font-weight:900;color:var(--red);">${_escH(r.member)} · ${_escH(r.item)}</div>
        <div style="font-size:18px;color:var(--text);margin-top:4px;font-family:'DM Mono',monospace;font-weight:900;">${_finFmt(r.amount)}</div>
        <div style="font-size:11px;color:var(--text-soft);margin-top:4px;">原欠款日：${_escH(r.date || '—')}${r.note?'　・'+_escH(r.note):''}</div>
      </div>
      <div class="modal-field">
        <div class="modal-label">銷帳日期（補繳日）</div>
        <input type="date" class="modal-input" id="recvSettleDate" value="${todayStr}">
      </div>
      <div class="modal-field">
        <div class="modal-label">寫入屆別</div>
        <select class="modal-input" id="recvSettleSheet">
          ${sheets.map(s => `<option value="${_escH(s)}" ${s===defaultSheet?'selected':''}>${_escH(s)}</option>`).join('')}
        </select>
      </div>
      <div class="modal-btns">
        <button class="modal-cancel" onclick="closeReceivableSettle()">取消</button>
        <button class="modal-save" id="recvSettleSave" onclick="submitReceivableSettle(${rowIndex})">確認銷帳</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function closeReceivableSettle() {
  const m = document.getElementById('receivableSettleModal');
  if (m) m.remove();
}

async function submitReceivableSettle(rowIndex) {
  const settleDate  = document.getElementById('recvSettleDate').value.trim().replace(/-/g, '/');
  const settleSheet = document.getElementById('recvSettleSheet').value;
  if (!settleDate)  { showToast('請填銷帳日期'); return; }
  if (!settleSheet) { showToast('請選擇寫入屆別'); return; }

  const btn = document.getElementById('recvSettleSave');
  btn.disabled = true; btn.textContent = '處理中...';
  try {
    const res = await fetch(FINANCE_API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'settleReceivable', rowIndex, settleSheet, settleDate })
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'unknown');
    showToast('已銷帳（' + settleDate + '）');
    closeReceivableSettle();
    await _fetchFinance();
    renderFinance();
  } catch (err) {
    showToast('銷帳失敗：' + (err.message || err));
    btn.disabled = false; btn.textContent = '確認銷帳';
  }
}

async function confirmReceivableDelete(rowIndex) {
  if (!_canEditTab('finance')) return;
  const r = ((_financeParsed && _financeParsed.receivables) || []).find(x => x.rowIndex === rowIndex);
  if (!r) return;
  if (!confirm(`確定刪除應收紀錄？\n${r.member} ${r.item} ${_finFmt(r.amount)}\n\n（這只刪除應收清單列；已銷帳的收入紀錄不會被刪）`)) return;
  try {
    const res = await fetch(FINANCE_API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'deleteReceivable', rowIndex })
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'unknown');
    showToast('已刪除');
    await _fetchFinance();
    renderFinance();
  } catch (err) {
    showToast('刪除失敗：' + (err.message || err));
  }
}

