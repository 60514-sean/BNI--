/**
 * BNI 億展 財務控管 - Google Apps Script 後端 (v3)
 * ============================================================
 * 變更：v2 → v3
 *  - 新增 update（修改既有列）
 *  - append 自動偵測跨月並插入「第N屆MM月」標題列
 *  - 新增 appendSpecial（特殊活動，多列批次寫入）
 *
 * 重要：每次修改本檔後必須重新部署
 *  「部署」→「管理部署作業」→ 編輯（鉛筆）→ 版本選「新增版本」→「部署」
 */

const FINANCE_SHEET_ID = '1Huie4O6tboRVjP3LtTTqAbduCBpzTZ8r9iIRvAi44No';

// =============== 登入令牌驗證 ===============
// 前端送出使用者輸入的分會密碼明文（GET: ?token= / POST: body.auth），後端比對其 SHA-256。
// 預設 = SHA-256("88888888")；變更密碼時於「指令碼屬性」設 API_AUTH_HASH 覆寫。
const API_AUTH_HASH_FALLBACK = '615ed7fb1504b0c724a296d7a69e6c7b2f9ea2c57c1d8206c5afdf392ebdfd25';
function _sha256Hex(str) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(str), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { const v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}
function _expectedAuthHash() {
  return PropertiesService.getScriptProperties().getProperty('API_AUTH_HASH') || API_AUTH_HASH_FALLBACK;
}
function _authOk(token) {
  if (!token) return false;
  try { return _sha256Hex(token) === _expectedAuthHash(); } catch (e) { return false; }
}

// =============== GET：讀取 ===============
function doGet(e) {
  if (!_authOk(e && e.parameter && e.parameter.token)) return _resp({ ok: false, error: 'unauthorized' });
  try {
    const ss = SpreadsheetApp.openById(FINANCE_SHEET_ID);
    const out = {};
    ss.getSheets().forEach(function (sheet) {
      const name = sheet.getName();
      const range = sheet.getDataRange();
      const values = range ? range.getValues() : [];
      out[name] = values.map(function (row) {
        return row.map(function (cell) {
          if (cell instanceof Date) {
            return Utilities.formatDate(cell, 'Asia/Taipei', 'yyyy/MM/dd');
          }
          return cell;
        });
      });
    });
    return _resp({ ok: true, sheets: out, updated: new Date().toISOString() });
  } catch (err) {
    return _resp({ ok: false, error: String(err) });
  }
}

// =============== POST：寫入 ===============
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (!_authOk(body.auth)) return _resp({ ok: false, error: 'unauthorized' });
    const action = body.action || 'append';
    if (action === 'setAuthHash') {
      const nh = String(body.newHash || '');
      if (!/^[0-9a-f]{64}$/.test(nh)) return _resp({ ok: false, error: 'bad hash' });
      PropertiesService.getScriptProperties().setProperty('API_AUTH_HASH', nh);
      return _resp({ ok: true });
    }
    if (action === 'append')           return _handleAppend(body);
    if (action === 'appendSpecial')    return _handleAppendSpecial(body);
    if (action === 'update')           return _handleUpdate(body);
    if (action === 'delete')           return _handleDelete(body);
    if (action === 'addReceivable')    return _handleAddReceivable(body);
    if (action === 'settleReceivable') return _handleSettleReceivable(body);
    if (action === 'deleteReceivable') return _handleDeleteReceivable(body);
    return _resp({ ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return _resp({ ok: false, error: String(err) });
  }
}

/**
 * 取得分頁 schema：'legacy' (11 欄含 H 額外收入/I 額外支出/J 結餘) 或 'clean' (8 欄)
 */
function _schemaOf(sheet) {
  return sheet.getLastColumn() >= 11 ? 'legacy' : 'clean';
}
function _ncolOf(sheet) {
  return _schemaOf(sheet) === 'legacy' ? 11 : 8;
}
function _noteColOf(sheet) {
  return _schemaOf(sheet) === 'legacy' ? 11 : 8;
}

/**
 * 新增單筆紀錄（自動跨月插入月份標題、自動算結餘）
 *  body = { action, sheet, date, type, kind, amount, paid, total, note }
 */
function _handleAppend(body) {
  const ss = SpreadsheetApp.openById(FINANCE_SHEET_ID);

  // 依日期自動路由到正確屆別（每 6 個月滾屆）
  let targetName = body.sheet;
  let routed = false;
  const expectedTermNum = _termNumOfDate(body.date);
  if (expectedTermNum > 0) {
    const expectedName = _termNameByNum(expectedTermNum);
    if (expectedName !== body.sheet && _termNumOfSheet(body.sheet) > 0) {
      targetName = expectedName;
      routed = true;
    } else if (expectedName === body.sheet || !ss.getSheetByName(body.sheet)) {
      targetName = expectedName;
    }
  }

  let sheet = ss.getSheetByName(targetName);
  if (!sheet) {
    const tn = _termNumOfSheet(targetName);
    if (tn > 0) sheet = _ensureTermSheet(tn);
  }
  if (!sheet) return _resp({ ok: false, error: '找不到分頁：' + targetName });

  const ncol = _ncolOf(sheet);
  const lastRow = sheet.getLastRow();
  let runningBal = _findLastBalance(sheet, lastRow);
  let cursor = lastRow;

  // 跨月 → 插入月份標題列
  const newMonth = _monthOfDate(body.date);
  const lastMonth = _findLastMonth(sheet, lastRow);
  if (newMonth && lastMonth && newMonth !== lastMonth) {
    const termLabel = body.sheet.replace(/^億展/, '');
    const monthLabel = termLabel + String(parseInt(newMonth.split('-')[1])) + '月';
    const headerRow = new Array(ncol).fill('');
    headerRow[1] = monthLabel;
    sheet.getRange(cursor + 1, 1, 1, ncol).setValues([headerRow]);
    cursor++;
  }

  const type   = body.type || '';
  const kind   = (body.kind || 'expense').toLowerCase();
  const amount = _num(body.amount);
  const paid   = _num(body.paid);
  const total  = _num(body.total);
  const note   = body.note || '';

  // 共用前 7 欄（E 結餘留空，後面 setFormula）
  const row = [
    body.date || '',                            // A 日期
    type,                                       // B 性質
    kind === 'income'  ? (amount || '') : '',   // C 收入
    kind === 'expense' ? (amount || '') : '',   // D 支出
    '',                                         // E 結餘（公式）
    paid  || '',                                // F 付費人數
    total || '',                                // G 總人數
  ];
  if (ncol === 11) {
    row.push('');   // H 額外收入
    row.push('');   // I 額外支出
    row.push('');   // J 結餘（公式）
    row.push(note); // K 備註
  } else {
    row.push(note); // H 備註
  }

  const newR = cursor + 1;
  sheet.getRange(newR, 1, 1, ncol).setValues([row]);
  _setBalanceFormulas(sheet, newR, ncol);
  SpreadsheetApp.flush();
  const lastBal = sheet.getRange(newR, ncol === 11 ? 10 : 5).getValue();
  return _resp({ ok: true, lastBalance: lastBal, addedRows: 1, sheet: sheet.getName(), routed: routed });
}

// 套用 E 欄結餘公式（與 legacy 11 欄分頁的 J 欄）
function _setBalanceFormulas(sheet, r, ncol) {
  sheet.getRange(r, 5).setFormula('=$E$2+SUM(C$3:C' + r + ')-SUM(D$3:D' + r + ')');
  if (ncol === 11) {
    sheet.getRange(r, 10).setFormula(
      '=E' + r + '+IFERROR(VALUE(REGEXEXTRACT(H' + r + '&"","[0-9.]+")),0)' +
      '-IFERROR(VALUE(REGEXEXTRACT(I' + r + '&"","[0-9.]+")),0)'
    );
  }
}

/**
 * 新增特殊活動（批次寫入）
 *  body = {
 *    action: 'appendSpecial',
 *    sheet:  '億展第五屆',
 *    date:   '2026/3/28',
 *    title:  '白金晚宴',
 *    titleAmount: 79900,        // 主標題列的金額（收入）
 *    items: [
 *      { name:'職董贊助', income:10000, expense:0, note:'' },
 *      { name:'東東廠餐費', income:0, expense:96195, note:'' },
 *      ...
 *    ]
 *  }
 *  寫入格式：
 *    第一列：date | title | titleAmount | _ | _ ...
 *    後續列：''   | name  | income | expense | ...
 */
function _handleAppendSpecial(body) {
  const ss = SpreadsheetApp.openById(FINANCE_SHEET_ID);
  const sheet = ss.getSheetByName(body.sheet);
  if (!sheet) return _resp({ ok: false, error: '找不到分頁：' + body.sheet });
  if (!body.title) return _resp({ ok: false, error: '缺活動名稱' });

  const ncol = _ncolOf(sheet);
  const lastRow = sheet.getLastRow();

  const titleAmt = _num(body.titleAmount);

  const rows = [];

  // 標題列（E 留空，不套公式 → 結餘留空白；C 欄帶 titleAmt 會被下方明細列的 SUM 公式自動納入）
  const titleRow = [body.date || '', body.title, titleAmt || '', '', '', '', ''];
  if (ncol === 11) {
    titleRow.push('', '', '', body.note || '');
  } else {
    titleRow.push(body.note || '');
  }
  rows.push(titleRow);

  // 明細列（E/J 留空，下方批次 setFormula）
  (body.items || []).forEach(function (it) {
    const inc = _num(it.income);
    const exp = _num(it.expense);
    const r = ['', it.name || '', inc || '', exp || '', '', '', ''];
    if (ncol === 11) {
      r.push('', '', '', it.note || '');
    } else {
      r.push(it.note || '');
    }
    rows.push(r);
  });

  sheet.getRange(lastRow + 1, 1, rows.length, ncol).setValues(rows);
  // 對明細列（rows[1..]）套公式；rows[0] 是標題列保持空白
  for (let i = 1; i < rows.length; i++) {
    _setBalanceFormulas(sheet, lastRow + 1 + i, ncol);
  }
  SpreadsheetApp.flush();
  const lastR = lastRow + rows.length;
  const lastBal = sheet.getRange(lastR, ncol === 11 ? 10 : 5).getValue();
  return _resp({ ok: true, lastBalance: lastBal, addedRows: rows.length });
}

/**
 * 更新單列
 *  body = { action:'update', sheet, rowIndex, values: { date, type, income, expense, paid, total, extraIncome, extraIncomeDesc, extraExpense, extraDesc, finalBalance, note } }
 *  rowIndex = 1-based。前端傳哪些 key 就只更新對應欄。
 */
function _handleUpdate(body) {
  const ss = SpreadsheetApp.openById(FINANCE_SHEET_ID);
  const sheet = ss.getSheetByName(body.sheet);
  if (!sheet) return _resp({ ok: false, error: '找不到分頁：' + body.sheet });
  if (!body.rowIndex || body.rowIndex < 2) return _resp({ ok: false, error: 'rowIndex 必須 >= 2' });

  const ncol = _ncolOf(sheet);
  const isLegacy = ncol === 11;
  const v = body.values || {};
  const rng = sheet.getRange(body.rowIndex, 1, 1, ncol);
  const cur = rng.getValues()[0];
  const formulas = rng.getFormulas()[0]; // 公式（若不是公式則為空字串）
  const out = cur.slice();

  if (v.date !== undefined)    out[0] = v.date;
  if (v.type !== undefined)    out[1] = v.type;
  if (v.income !== undefined)  out[2] = _num(v.income) || '';
  if (v.expense !== undefined) out[3] = _num(v.expense) || '';
  // E 結餘改由公式計算，不接受外部覆蓋
  if (v.paid !== undefined)    out[5] = _num(v.paid) || '';
  if (v.total !== undefined)   out[6] = _num(v.total) || '';

  if (isLegacy) {
    if (v.extraIncome !== undefined) {
      const n = _num(v.extraIncome);
      out[7] = n ? (v.extraIncomeDesc ? n + '（' + v.extraIncomeDesc + '）' : n) : '';
    }
    if (v.extraExpense !== undefined) {
      const n = _num(v.extraExpense);
      out[8] = n ? (v.extraDesc ? n + '（' + v.extraDesc + '）' : n) : '';
    }
    // J 最終結餘改由公式計算
    if (v.note !== undefined)         out[10] = v.note;
  } else {
    if (v.note !== undefined) out[7] = v.note;
  }

  // E、J 欄先以原值佔位寫入，下面再用 setFormula 還原（如果原本是公式）
  out[4] = '';
  if (isLegacy) out[9] = '';

  rng.setValues([out]);

  // 還原 E 與 J 欄：若原本是公式 → 重新 setFormula；若無公式但屬一般紀錄列 → 套上新公式
  const r = body.rowIndex;
  const wasMonthHeaderOrTitle = !cur[4] && !formulas[4]; // E 原本就空（月份標題列/特殊標題列）→ 不套公式
  if (formulas[4]) {
    sheet.getRange(r, 5).setFormula(formulas[4]);
  } else if (!wasMonthHeaderOrTitle) {
    sheet.getRange(r, 5).setFormula('=$E$2+SUM(C$3:C' + r + ')-SUM(D$3:D' + r + ')');
  }
  if (isLegacy) {
    if (formulas[9]) {
      sheet.getRange(r, 10).setFormula(formulas[9]);
    } else if (!wasMonthHeaderOrTitle && cur[9] !== '' && cur[9] !== null) {
      sheet.getRange(r, 10).setFormula(
        '=E' + r + '+IFERROR(VALUE(REGEXEXTRACT(H' + r + '&"","[0-9.]+")),0)' +
        '-IFERROR(VALUE(REGEXEXTRACT(I' + r + '&"","[0-9.]+")),0)'
      );
    }
  }
  // 公式自動跟著新數值重算，不再需要 _recalcBalancesFrom
  return _resp({ ok: true });
}

/**
 * 刪除一列
 *  body = { action:'delete', sheet, rowIndex }
 */
function _handleDelete(body) {
  const ss = SpreadsheetApp.openById(FINANCE_SHEET_ID);
  const sheet = ss.getSheetByName(body.sheet);
  if (!sheet) return _resp({ ok: false, error: '找不到分頁：' + body.sheet });
  if (!body.rowIndex || body.rowIndex < 2) return _resp({ ok: false, error: 'rowIndex 必須 >= 2' });
  sheet.deleteRow(body.rowIndex);
  // E/J 欄為公式（=$E$2+SUM(...)-SUM(...)），刪除整列後 SUM 範圍由 Sheets 自動調整，不需重算
  return _resp({ ok: true });
}

// =============== 應收追蹤 ===============
const RECEIVABLE_SHEET = '應收追蹤';
const RECEIVABLE_HEADERS = ['建立日期', '會員', '項目', '金額', '狀態', '銷帳日', '銷帳分頁', '備註'];

function _ensureReceivableSheet() {
  const ss = SpreadsheetApp.openById(FINANCE_SHEET_ID);
  let sheet = ss.getSheetByName(RECEIVABLE_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(RECEIVABLE_SHEET);
    sheet.getRange(1, 1, 1, RECEIVABLE_HEADERS.length).setValues([RECEIVABLE_HEADERS]);
    sheet.getRange(1, 1, 1, RECEIVABLE_HEADERS.length)
      .setFontWeight('bold').setBackground('#f9ecec').setFontColor('#c0392b');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, RECEIVABLE_HEADERS.length, 110);
    sheet.setColumnWidth(8, 220); // 備註寬一點
  }
  return sheet;
}

/**
 * 新增一筆應收
 *  body = { action:'addReceivable', date, member, item, amount, note }
 */
function _handleAddReceivable(body) {
  const sheet = _ensureReceivableSheet();
  if (!body.member) return _resp({ ok: false, error: '請填會員姓名' });
  if (!_num(body.amount)) return _resp({ ok: false, error: '請填金額' });
  sheet.appendRow([
    body.date || _today(),
    body.member,
    body.item || '入席費',
    _num(body.amount),
    '未繳',
    '',
    '',
    body.note || ''
  ]);
  return _resp({ ok: true });
}

/**
 * 銷帳：標記為已繳，並在指定屆別分頁建立一筆收入紀錄
 *  body = { action:'settleReceivable', rowIndex, settleSheet, settleDate? }
 */
function _handleSettleReceivable(body) {
  const recv = _ensureReceivableSheet();
  if (!body.rowIndex || body.rowIndex < 2) return _resp({ ok: false, error: 'rowIndex 必須 >= 2' });
  if (!body.settleSheet) return _resp({ ok: false, error: '請指定銷帳屆別' });

  const row = recv.getRange(body.rowIndex, 1, 1, RECEIVABLE_HEADERS.length).getValues()[0];
  const status = String(row[4] || '').trim();
  if (status === '已繳') return _resp({ ok: false, error: '此筆已銷帳' });

  const member = String(row[1] || '').trim();
  const item   = String(row[2] || '').trim() || '入席費';
  const amount = _num(row[3]);
  // 原欠款日：sheet 上若以 Date 物件儲存，String(Date) 會出現 "Fri Apr 10 2026 00:00..."
  // 統一格式化為 yyyy/MM/dd
  const origDate = (row[0] instanceof Date)
    ? Utilities.formatDate(row[0], 'Asia/Taipei', 'yyyy/MM/dd')
    : String(row[0] || '').trim();
  if (!amount) return _resp({ ok: false, error: '金額為 0' });

  const settleDate = body.settleDate || _today();

  // 1) 標記應收為已繳
  recv.getRange(body.rowIndex, 5).setValue('已繳');
  recv.getRange(body.rowIndex, 6).setValue(settleDate);
  recv.getRange(body.rowIndex, 7).setValue(body.settleSheet);

  // 2) 在屆別分頁建立收入紀錄
  const result = _handleAppend({
    sheet:  body.settleSheet,
    date:   settleDate,
    type:   item + '（' + member + '補繳）',
    kind:   'income',
    amount: amount,
    note:   '銷帳：' + member + ' ' + origDate + ' ' + item
  });

  // 解析 _handleAppend 的回傳（已是 ContentService output → 重新拼一個 ok）
  return _resp({ ok: true, settled: true, settleDate: settleDate });
}

/**
 * 刪除應收
 *  body = { action:'deleteReceivable', rowIndex }
 */
function _handleDeleteReceivable(body) {
  const sheet = _ensureReceivableSheet();
  if (!body.rowIndex || body.rowIndex < 2) return _resp({ ok: false, error: 'rowIndex 必須 >= 2' });
  sheet.deleteRow(body.rowIndex);
  return _resp({ ok: true });
}

function _today() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd');
}

// =============== 屆別滾動（每 6 個月一屆） ===============
// 第四屆: 2025/04 - 2025/09
// 第五屆: 2025/10 - 2026/03
// 第六屆: 2026/04 - 2026/09
// 第N屆 起始 = 2025/04 + (N-4)*6 個月
const TERM_BASE_NUM = 4;
const TERM_BASE_YEAR = 2025;
const TERM_BASE_MONTH = 4;

function _numToCN(n) {
  const arr = ['零','一','二','三','四','五','六','七','八','九','十'];
  if (n <= 10) return arr[n];
  if (n < 20) return '十' + arr[n - 10];
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return arr[tens] + '十' + (ones ? arr[ones] : '');
  }
  return String(n);
}

function _cnToNum(s) {
  const map = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10};
  if (!s) return 0;
  if (s in map) return map[s];
  if (s[0] === '十') return 10 + (map[s[1]] || 0);
  if (s.length === 2 && s[1] === '十') return map[s[0]] * 10;
  if (s.length === 3 && s[1] === '十') return map[s[0]] * 10 + map[s[2]];
  return parseInt(s) || 0;
}

function _termNumOfDate(dateStr) {
  if (!dateStr) return 0;
  const m = String(dateStr).match(/(\d{4})\/(\d{1,2})/);
  if (!m) return 0;
  const year = +m[1], month = +m[2];
  const monthsFromBase = (year - TERM_BASE_YEAR) * 12 + (month - TERM_BASE_MONTH);
  if (monthsFromBase < 0) return 0;
  return TERM_BASE_NUM + Math.floor(monthsFromBase / 6);
}

function _termNameByNum(termNum) {
  return '億展第' + _numToCN(termNum) + '屆';
}

function _termRangeOfNum(termNum) {
  const totalMonths = (termNum - TERM_BASE_NUM) * 6;
  const sIdx = TERM_BASE_MONTH - 1 + totalMonths;
  const eIdx = sIdx + 5;
  return {
    startYear:  TERM_BASE_YEAR + Math.floor(sIdx / 12),
    startMonth: (sIdx % 12) + 1,
    endYear:    TERM_BASE_YEAR + Math.floor(eIdx / 12),
    endMonth:   (eIdx % 12) + 1,
  };
}

function _termNumOfSheet(sheetName) {
  const m = String(sheetName || '').match(/^億展第([一二三四五六七八九十]+)屆$/);
  return m ? _cnToNum(m[1]) : 0;
}

/**
 * 確保某屆別分頁存在；不存在則建立並從前一屆結餘帶入
 */
function _ensureTermSheet(termNum) {
  const ss = SpreadsheetApp.openById(FINANCE_SHEET_ID);
  const name = _termNameByNum(termNum);
  let sheet = ss.getSheetByName(name);
  if (sheet) return sheet;

  // 從前一屆讀結餘
  let initialBalance = 0;
  for (let p = termNum - 1; p >= TERM_BASE_NUM; p--) {
    const prev = ss.getSheetByName(_termNameByNum(p));
    if (prev) { initialBalance = _findLastBalance(prev, prev.getLastRow()); break; }
  }

  sheet = ss.insertSheet(name);
  const headers = ['日期', '性質', '收入', '支出', '結餘', '付費人數', '總人數', '備註'];
  sheet.getRange(1, 1, 1, 8).setValues([headers]);
  sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#f9ecec').setFontColor('#c0392b');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 7, 100);
  sheet.setColumnWidth(8, 220);

  const range = _termRangeOfNum(termNum);
  const startDate = range.startYear + '/' + String(range.startMonth).padStart(2, '0') + '/01';
  const monthLabel = '第' + _numToCN(termNum) + '屆' + String(range.startMonth).padStart(2, '0') + '月(初始)';
  sheet.getRange(2, 1, 1, 8).setValues([[
    startDate, monthLabel, '', '', initialBalance, '', '', ''
  ]]);

  return sheet;
}

/**
 * 手動建立下一屆（從編輯器執行）
 */
function createNextTerm() {
  const ss = SpreadsheetApp.openById(FINANCE_SHEET_ID);
  let maxNum = 0;
  ss.getSheets().forEach(function (s) {
    const n = _termNumOfSheet(s.getName());
    if (n > maxNum) maxNum = n;
  });
  if (!maxNum) {
    Logger.log('未找到任何屆別分頁');
    return { ok: false, error: 'no term' };
  }
  const nextNum = maxNum + 1;
  const sheet = _ensureTermSheet(nextNum);
  Logger.log('已建立 ' + sheet.getName() + '，期初結餘 ' + sheet.getRange(2, 5).getValue());
  return { ok: true, name: sheet.getName() };
}

// =============== 一次性遷移：把 H/I 額外欄拆成獨立列 ===============
/**
 * 預覽（不實際寫入）：在執行紀錄看會發生什麼
 *   工具列「執行」→ 選 migrateExtrasToRows_preview → ▶
 */
function migrateExtrasToRows_preview() {
  return _doMigration(true);
}

/**
 * 正式遷移
 *   工具列「執行」→ 選 migrateExtrasToRows → ▶
 *   ⚠ 不可逆，請先建立試算表副本備份
 */
function migrateExtrasToRows() {
  return _doMigration(false);
}

// 多金額儲存格的覆寫對照表（依 KK 與使用者確認）
const EXTRA_OVERRIDES = [
  {
    match: '4400+4300',
    items: [
      { kind: 'expense', amount: 4400, desc: '子揚請款' },
      { kind: 'expense', amount: 4300, desc: 'Happy請款' }
    ]
  },
  {
    match: '宥瑩請款1012',
    items: [
      { kind: 'expense', amount: 1012, desc: '宥瑩請款（會員名牌）' },
      { kind: 'expense', amount: 10,   desc: '仲博請款（影印）' }
    ]
  },
  {
    match: '五冠王+專題',
    items: [
      { kind: 'expense', amount: 165, desc: '五冠王+專題請款' },
      { kind: 'expense', amount: 408, desc: '會員DM請款' }
    ]
  },
  {
    match: '600+1430+900',
    items: [
      { kind: 'expense', amount: 600,  desc: '小哈請款' },
      { kind: 'expense', amount: 1430, desc: '秘財請款' },
      { kind: 'expense', amount: 900,  desc: '蕙如請款' }
    ]
  }
];

function _doMigration(previewOnly) {
  const ss = SpreadsheetApp.openById(FINANCE_SHEET_ID);
  const summary = { previewOnly, sheets: [], totalSplit: 0, warnings: [], overrides: [] };

  ss.getSheets().forEach(function (sheet) {
    const name = sheet.getName();
    if (name === RECEIVABLE_SHEET) return;

    const headers = sheet.getRange(1, 1, 1, 11).getValues()[0];
    if (String(headers[0]).trim() !== '日期' || String(headers[1]).trim() !== '性質') return;

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const data = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
    let splitCount = 0;

    // 由下往上處理，避免插入後索引錯位
    for (let i = data.length - 1; i >= 0; i--) {
      const row = data[i];
      const sheetRow = i + 2;
      const extraIn  = row[7];
      const extraOut = row[8];

      const newRows = [];
      const localWarn = [];

      const inItems  = _parseExtraValue(extraIn,  'income',  localWarn, summary.overrides, name + ' 列' + sheetRow);
      for (const it of inItems) {
        newRows.push(['', it.desc || '額外收入', it.amount, '', '', '', '', '', '', '', '']);
      }

      const outItems = _parseExtraValue(extraOut, 'expense', localWarn, summary.overrides, name + ' 列' + sheetRow);
      for (const it of outItems) {
        newRows.push(['', it.desc || '額外支出', '', it.amount, '', '', '', '', '', '', '']);
      }

      for (const w of localWarn) summary.warnings.push(name + ' 列' + sheetRow + '：' + w);

      if (!newRows.length) continue;

      if (!previewOnly) {
        sheet.getRange(sheetRow, 8).setValue('');
        sheet.getRange(sheetRow, 9).setValue('');
        sheet.insertRowsAfter(sheetRow, newRows.length);
        sheet.getRange(sheetRow + 1, 1, newRows.length, 11).setValues(newRows);
      }
      splitCount += newRows.length;
    }

    if (!previewOnly && splitCount > 0) {
      _recalcBalancesFrom(sheet, 2);
    }
    if (splitCount > 0) {
      summary.sheets.push(name + '（拆 ' + splitCount + ' 列）');
      summary.totalSplit += splitCount;
    }
  });

  Logger.log('========================================');
  Logger.log('%s', previewOnly ? '【PREVIEW 模式】未實際寫入' : '【遷移完成】已實際寫入');
  Logger.log('總拆出列數：%s', summary.totalSplit);
  Logger.log('處理分頁：%s', summary.sheets.join('; ') || '(無)');
  if (summary.overrides.length) {
    Logger.log('套用覆寫規則 (%s 處)：', summary.overrides.length);
    summary.overrides.forEach(function (o) { Logger.log('  ' + o); });
  }
  if (summary.warnings.length) {
    Logger.log('⚠ 警告 (%s 筆)：', summary.warnings.length);
    summary.warnings.forEach(function (w) { Logger.log('  ' + w); });
  } else {
    Logger.log('無警告');
  }
  Logger.log('========================================');
  return summary;
}

/**
 * 解析一個額外欄儲存格 → 回傳 [{amount, desc}, ...]
 * 多筆金額會優先套用 EXTRA_OVERRIDES，否則合併並警告
 */
function _parseExtraValue(cell, defaultKind, warnings, overrideLog, ctx) {
  if (cell === '' || cell === null || cell === undefined) return [];
  if (typeof cell === 'number') {
    if (!cell) return [];
    return [{ amount: Math.abs(cell), desc: '' }];
  }
  const s = String(cell).trim();
  if (!s) return [];

  // 覆寫規則
  for (const ov of EXTRA_OVERRIDES) {
    if (s.indexOf(ov.match) !== -1) {
      const matched = ov.items.filter(function (it) { return it.kind === defaultKind; });
      if (matched.length) {
        if (overrideLog) overrideLog.push(ctx + '：套用覆寫「' + ov.match + '」→ 拆 ' + matched.length + ' 筆');
        return matched.map(function (it) { return { amount: it.amount, desc: it.desc }; });
      }
    }
  }

  // 通用：抓所有正整數
  const numMatches = s.match(/\d[\d,，]*(\.\d+)?/g) || [];
  const numbers = numMatches
    .map(function (n) { return Number(n.replace(/[,，]/g, '')); })
    .filter(function (n) { return !isNaN(n) && n > 0; });

  if (numbers.length === 0) {
    if (warnings) warnings.push('無法解析金額：「' + s + '」（已跳過）');
    return [];
  }

  if (numbers.length === 1) {
    const amt = numbers[0];
    const desc = s
      .replace(/\d[\d,，]*(\.\d+)?/, '')
      .replace(/[（()]/g, '')
      .replace(/^[、，,\s.\-+]+|[、，,\s.\-+]+$/g, '')
      .trim();
    return [{ amount: amt, desc: desc }];
  }

  // 多筆但無覆寫 → 合併
  const total = numbers.reduce(function (s, n) { return s + n; }, 0);
  const desc = s.replace(/[（()]/g, '').trim();
  if (warnings) warnings.push('多筆金額「' + s + '」→ 合併為 ' + total + '（請手動確認）');
  return [{ amount: total, desc: desc }];
}

// =============== Helpers ===============
function _findLastBalance(sheet, lastRow) {
  const ncol = _ncolOf(sheet);
  const isLegacy = ncol === 11;
  for (let r = lastRow; r >= 1; r--) {
    const row = sheet.getRange(r, 1, 1, ncol).getValues()[0];
    if (isLegacy) {
      const v10 = Number(row[9]);
      if (!isNaN(v10) && row[9] !== '' && row[9] !== null) return v10;
    }
    const v5 = Number(row[4]);
    if (!isNaN(v5) && row[4] !== '' && row[4] !== null) return v5;
  }
  return 0;
}

function _findLastDate(sheet, lastRow) {
  for (let r = lastRow; r >= 2; r--) {
    const v = sheet.getRange(r, 1).getValue();
    const s = (v instanceof Date) ? Utilities.formatDate(v, 'Asia/Taipei', 'yyyy/MM/dd') : String(v || '').trim();
    const m = s.match(/(\d{4})\/(\d{1,2})/);
    if (m) return s;
  }
  return '';
}

function _findLastMonth(sheet, lastRow) {
  return _monthOfDate(_findLastDate(sheet, lastRow));
}

function _monthOfDate(s) {
  if (!s) return '';
  const m = String(s).match(/(\d{4})\/(\d{1,2})/);
  return m ? m[1] + '-' + String(m[2]).padStart(2, '0') : '';
}

function _recalcBalancesFrom(sheet, fromRow) {
  const lastRow = sheet.getLastRow();
  if (fromRow > lastRow) return;
  const ncol = _ncolOf(sheet);
  const isLegacy = ncol === 11;
  let runningBal = _findLastBalance(sheet, fromRow - 1);

  for (let r = fromRow; r <= lastRow; r++) {
    const row = sheet.getRange(r, 1, 1, ncol).getValues()[0];
    const date = String(row[0] || '').trim();
    const type = String(row[1] || '').trim();

    if (!date && !type && !row[2] && !row[3] && !(isLegacy && (row[7] || row[8]))) continue;

    const isMonthHeader = /第[一二三四五六七八九十]屆\s*\d+月/.test(type) || /第[一二三四五六七八九十]屆\s*\d+月/.test(date);
    const isInitial     = /初始/.test(type) || /^第[一二三四五六七八九十]期初始$/.test(type);
    if (isMonthHeader || isInitial) {
      const e = Number(row[4]);
      if (!isNaN(e) && row[4] !== '' && row[4] !== null) runningBal = e;
      continue;
    }

    const income  = _num(row[2]);
    const expense = _num(row[3]);
    runningBal = runningBal + income - expense;
    sheet.getRange(r, 5).setValue(runningBal);

    if (isLegacy) {
      const extraIncome  = _extractAmount(row[7]);
      const extraExpense = _extractAmount(row[8]);
      runningBal = runningBal + extraIncome - extraExpense;
      sheet.getRange(r, 10).setValue(runningBal);
    }
  }
}

// =============== 一次性：刪除 H、I、J（額外收入/支出/重複結餘）===============
/**
 * 刪除所有屆別分頁的 H、I、J 三欄，留下 8 欄結構
 *   工具列「執行」→ 選 cleanupColumns → ▶
 *   ⚠ 不可逆，請先確認試算表副本已備份
 */
function cleanupColumns() {
  const ss = SpreadsheetApp.openById(FINANCE_SHEET_ID);
  const log = [];
  ss.getSheets().forEach(function (sheet) {
    const name = sheet.getName();
    if (name === RECEIVABLE_SHEET) { log.push(name + '：跳過（應收追蹤）'); return; }
    if (sheet.getLastColumn() < 11) { log.push(name + '：跳過（已是 8 欄結構）'); return; }
    const headers = sheet.getRange(1, 1, 1, 11).getValues()[0];
    if (String(headers[0]).trim() !== '日期' || String(headers[1]).trim() !== '性質') {
      log.push(name + '：跳過（非屆別結構）');
      return;
    }
    // 由高到低刪欄，避免索引錯位
    sheet.deleteColumn(10); // J 結餘
    sheet.deleteColumn(9);  // I 額外支出
    sheet.deleteColumn(8);  // H 額外收入
    log.push(name + '：完成（已刪 H、I、J）');
  });
  Logger.log('========================================');
  Logger.log('cleanupColumns 結果：');
  log.forEach(function (l) { Logger.log('  ' + l); });
  Logger.log('========================================');
  return { ok: true, log: log };
}

function _extractAmount(cell) {
  if (typeof cell === 'number') return cell;
  if (!cell) return 0;
  const m = String(cell).match(/^-?[\d,，]+(\.\d+)?/);
  return m ? Number(m[0].replace(/[,，]/g, '')) : 0;
}

function _num(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/[,，\s]/g, ''));
  return isNaN(n) ? 0 : n;
}

function _resp(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// =============== 一次性：把現有結餘從「值」改為「公式」 ===============
/**
 * 把指定屆別分頁的 E 欄（與 legacy 11 欄分頁的 J 欄）改成公式：
 *   E{r} = $E$2 + SUM(C$3:C{r}) - SUM(D$3:D{r})
 *   J{r} = E{r} + (H 內的數字) - (I 內的數字)   ← legacy only
 * 只對「原本 E 欄有值」的列套公式；月份標題列、特殊活動標題列（E 原本就空）保持空白。
 * E2（期初結餘）保持為手動填入的值。
 */
function convertBalancesToFormula(sheetName) {
  const ss = SpreadsheetApp.openById(FINANCE_SHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('找不到分頁：' + sheetName);
  const ncol = _ncolOf(sheet);
  const isLegacy = ncol === 11;
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return { ok: true, sheet: sheetName, converted: 0 };

  const range = sheet.getRange(3, 1, lastRow - 2, ncol);
  const values = range.getValues();
  let converted = 0;

  for (let i = 0; i < values.length; i++) {
    const r = i + 3;
    const e = values[i][4];
    if (e !== '' && e !== null) {
      sheet.getRange(r, 5).setFormula('=$E$2+SUM(C$3:C' + r + ')-SUM(D$3:D' + r + ')');
      converted++;
    }
    if (isLegacy) {
      const j = values[i][9];
      if (j !== '' && j !== null) {
        sheet.getRange(r, 10).setFormula(
          '=E' + r + '+IFERROR(VALUE(REGEXEXTRACT(H' + r + '&"","[0-9.]+")),0)' +
          '-IFERROR(VALUE(REGEXEXTRACT(I' + r + '&"","[0-9.]+")),0)'
        );
      }
    }
  }
  Logger.log(sheetName + '：已轉換 ' + converted + ' 列為公式');
  return { ok: true, sheet: sheetName, converted: converted };
}

/** 把所有屆別分頁（億展開頭）的結餘都轉成公式 */
function convertAllTermsBalancesToFormula() {
  const ss = SpreadsheetApp.openById(FINANCE_SHEET_ID);
  const log = [];
  ss.getSheets().forEach(function (sheet) {
    const name = sheet.getName();
    if (name === RECEIVABLE_SHEET) return;
    const headers = sheet.getRange(1, 1, 1, Math.min(2, sheet.getLastColumn())).getValues()[0];
    if (String(headers[0]).trim() !== '日期' || String(headers[1]).trim() !== '性質') {
      log.push(name + '：跳過（非屆別結構）');
      return;
    }
    try {
      const r = convertBalancesToFormula(name);
      log.push(name + '：完成（' + r.converted + ' 列）');
    } catch (e) {
      log.push(name + '：失敗 - ' + e.message);
    }
  });
  Logger.log('========================================');
  log.forEach(function (l) { Logger.log('  ' + l); });
  Logger.log('========================================');
  return { ok: true, log: log };
}

function _test() {
  const ss = SpreadsheetApp.openById(FINANCE_SHEET_ID);
  ss.getSheets().forEach(function (sheet) {
    Logger.log(sheet.getName() + ' 列數：' + sheet.getLastRow());
  });
}

// =============== 一次性：修正既有銷帳備註中的「Fri Apr 10 2026 GMT...」長日期 ===============
/**
 * 把所有屆別分頁中備註欄（最後一欄）內形如
 *   "Fri Apr 10 2026 00:00:00 GMT+0800 (台北標準時間)"
 * 的長日期字串，自動替換成 yyyy/MM/dd。
 *   工具列「執行」→ 選 fixSettlementDateFormat → ▶
 */
function fixSettlementDateFormat() {
  const ss = SpreadsheetApp.openById(FINANCE_SHEET_ID);
  const log = [];
  let totalFixed = 0;
  const re = /[A-Za-z]{3} [A-Za-z]{3} \d{1,2} \d{4} [\d:]+ GMT[+\-]\d{4}(?:\s*\([^)]+\))?/g;

  ss.getSheets().forEach(function (sheet) {
    const name = sheet.getName();
    if (name === RECEIVABLE_SHEET) return;
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, Math.min(2, lastCol)).getValues()[0];
    if (String(headers[0]).trim() !== '日期' || String(headers[1]).trim() !== '性質') return;

    const ncol = _ncolOf(sheet);
    const noteCol = ncol; // 最後一欄就是備註
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const range = sheet.getRange(2, noteCol, lastRow - 1, 1);
    const values = range.getValues();
    let fixedInSheet = 0;

    for (let i = 0; i < values.length; i++) {
      const cell = values[i][0];
      if (typeof cell !== 'string' || !cell) continue;
      if (!re.test(cell)) { re.lastIndex = 0; continue; }
      re.lastIndex = 0;
      const newCell = cell.replace(re, function (m) {
        const d = new Date(m);
        if (isNaN(d.getTime())) return m;
        return Utilities.formatDate(d, 'Asia/Taipei', 'yyyy/MM/dd');
      });
      if (newCell !== cell) {
        sheet.getRange(i + 2, noteCol).setValue(newCell);
        fixedInSheet++;
      }
    }

    if (fixedInSheet > 0) {
      log.push(name + '：修正 ' + fixedInSheet + ' 筆');
      totalFixed += fixedInSheet;
    } else {
      log.push(name + '：無需修正');
    }
  });

  Logger.log('========================================');
  Logger.log('合計修正：' + totalFixed + ' 筆');
  log.forEach(function (l) { Logger.log('  ' + l); });
  Logger.log('========================================');
  return { ok: true, totalFixed: totalFixed, log: log };
}
