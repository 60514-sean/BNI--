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

// =============== GET：讀取 ===============
function doGet(e) {
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
    const action = body.action || 'append';
    if (action === 'append')        return _handleAppend(body);
    if (action === 'appendSpecial') return _handleAppendSpecial(body);
    if (action === 'update')        return _handleUpdate(body);
    if (action === 'delete')        return _handleDelete(body);
    return _resp({ ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return _resp({ ok: false, error: String(err) });
  }
}

/**
 * 新增單筆紀錄（自動跨月插入月份標題、自動算結餘）
 *  body = {
 *    action: 'append',
 *    sheet:  '億展第六屆',
 *    date:   '2026/05/01',
 *    type:   '入席費',         // 性質（自由文字，前端有常用建議）
 *    kind:   'income',         // 'income' or 'expense'
 *    amount: 31500,
 *    paid:   0,                // optional
 *    total:  0,                // optional
 *    note:   ''
 *  }
 */
function _handleAppend(body) {
  const ss = SpreadsheetApp.openById(FINANCE_SHEET_ID);
  const sheet = ss.getSheetByName(body.sheet);
  if (!sheet) return _resp({ ok: false, error: '找不到分頁：' + body.sheet });

  const lastRow = sheet.getLastRow();
  let runningBal = _findLastBalance(sheet, lastRow);
  let cursor = lastRow;

  // 跨月 → 插入月份標題列
  const newMonth = _monthOfDate(body.date);
  const lastMonth = _findLastMonth(sheet, lastRow);
  if (newMonth && lastMonth && newMonth !== lastMonth) {
    const termLabel = body.sheet.replace(/^億展/, '');
    const monthLabel = termLabel + String(parseInt(newMonth.split('-')[1])) + '月';
    sheet.getRange(cursor + 1, 1, 1, 11).setValues([['', monthLabel, '', '', '', '', '', '', '', '', '']]);
    cursor++;
  }

  const type   = body.type || '';
  const kind   = (body.kind || 'expense').toLowerCase();
  const amount = _num(body.amount);
  const paid   = _num(body.paid);
  const total  = _num(body.total);
  const note   = body.note || '';

  if (kind === 'income') runningBal += amount;
  else                   runningBal -= amount;

  const row = [
    body.date || '',                          // A 日期
    type,                                     // B 性質
    kind === 'income'  ? (amount || '') : '', // C 收入
    kind === 'expense' ? (amount || '') : '', // D 支出
    runningBal,                               // E 結餘
    paid  || '',                              // F 付費人數
    total || '',                              // G 總人數
    '',                                       // H 額外收入（簡化後不再使用）
    '',                                       // I 額外支出
    runningBal,                               // J 結餘
    note                                      // K 備註
  ];

  sheet.getRange(cursor + 1, 1, 1, 11).setValues([row]);
  return _resp({ ok: true, lastBalance: runningBal, addedRows: 1 });
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

  const lastRow = sheet.getLastRow();
  let runningBal = _findLastBalance(sheet, lastRow);

  const titleAmt = _num(body.titleAmount);
  runningBal += titleAmt;

  const rows = [];
  rows.push([
    body.date || '', body.title, titleAmt || '', '', '', '', '', '', '', '', body.note || ''
  ]);

  (body.items || []).forEach(function (it) {
    const inc = _num(it.income);
    const exp = _num(it.expense);
    runningBal = runningBal + inc - exp;
    rows.push([
      '', it.name || '', inc || '', exp || '', '', '', '', '', '', runningBal, it.note || ''
    ]);
  });

  sheet.getRange(lastRow + 1, 1, rows.length, 11).setValues(rows);
  return _resp({ ok: true, lastBalance: runningBal, addedRows: rows.length });
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

  const v = body.values || {};
  const rng = sheet.getRange(body.rowIndex, 1, 1, 11);
  const cur = rng.getValues()[0];

  const out = cur.slice();
  if (v.date !== undefined)         out[0] = v.date;
  if (v.type !== undefined)         out[1] = v.type;
  if (v.income !== undefined)       out[2] = _num(v.income) || '';
  if (v.expense !== undefined)      out[3] = _num(v.expense) || '';
  if (v.balance !== undefined)      out[4] = _num(v.balance);
  if (v.paid !== undefined)         out[5] = _num(v.paid) || '';
  if (v.total !== undefined)        out[6] = _num(v.total) || '';
  if (v.extraIncome !== undefined) {
    const n = _num(v.extraIncome);
    out[7] = n ? (v.extraIncomeDesc ? n + '（' + v.extraIncomeDesc + '）' : n) : '';
  }
  if (v.extraExpense !== undefined) {
    const n = _num(v.extraExpense);
    out[8] = n ? (v.extraDesc ? n + '（' + v.extraDesc + '）' : n) : '';
  }
  if (v.finalBalance !== undefined) out[9] = _num(v.finalBalance);
  if (v.note !== undefined)         out[10] = v.note;

  rng.setValues([out]);

  // 重新計算這列以下所有列的結餘
  _recalcBalancesFrom(sheet, body.rowIndex + 1);

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
  // 從刪除位置開始重算結餘
  _recalcBalancesFrom(sheet, body.rowIndex);
  return _resp({ ok: true });
}

// =============== Helpers ===============
function _findLastBalance(sheet, lastRow) {
  for (let r = lastRow; r >= 1; r--) {
    const row = sheet.getRange(r, 1, 1, 11).getValues()[0];
    const v10 = Number(row[9]);
    if (!isNaN(v10) && row[9] !== '' && row[9] !== null) return v10;
    const v5  = Number(row[4]);
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
  // 從 fromRow-1 找上一個結餘做起點
  let runningBal = _findLastBalance(sheet, fromRow - 1);
  for (let r = fromRow; r <= lastRow; r++) {
    const row = sheet.getRange(r, 1, 1, 11).getValues()[0];
    const type = String(row[1] || '');
    // 跳過月份標題列、初始列、空列、特殊活動標題
    if (!row[0] && !row[2] && !row[3] && !row[7] && !row[8] && row[1] && /屆\s*\d+月|初始/.test(type)) continue;
    if (!row[2] && !row[3] && !row[7] && !row[8] && !row[4] && !row[9]) continue;

    const income = _num(row[2]);
    const expense = _num(row[3]);
    const extraIncome = _extractAmount(row[7]);
    const extraExpense = _extractAmount(row[8]);

    runningBal = runningBal + income - expense;
    if (row[4] !== '' && row[4] !== null) sheet.getRange(r, 5).setValue(runningBal);

    runningBal = runningBal + extraIncome - extraExpense;
    if (row[9] !== '' && row[9] !== null) sheet.getRange(r, 10).setValue(runningBal);
  }
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

function _test() {
  const ss = SpreadsheetApp.openById(FINANCE_SHEET_ID);
  ss.getSheets().forEach(function (sheet) {
    Logger.log(sheet.getName() + ' 列數：' + sheet.getLastRow());
  });
}
