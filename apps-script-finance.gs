/**
 * BNI 億展 財務控管 - Google Apps Script 後端 (v2 支援寫入)
 * ============================================================
 * 用途：讀寫財務試算表（多個會期分頁）
 *  - GET  → 回傳所有分頁資料的 JSON
 *  - POST → 新增紀錄（自動計算結餘）
 *
 * 重要：每次修改本檔後必須重新部署
 *  「部署」→「管理部署作業」→ 編輯（鉛筆圖示）→ 版本選「新增版本」→「部署」
 *  否則前端打到的舊版本不會有新邏輯
 *
 * 部署步驟（首次）：
 *  1. 開啟 https://script.google.com → 新增專案
 *  2. 將此檔案內容整段貼到 Code.gs（覆蓋）
 *  3. 上方「部署」→「新增部署作業」→ 類型選「網頁應用程式」
 *  4. 執行身分：我；誰可以存取：所有人 → 部署
 *  5. 第一次需授權 SpreadsheetApp 權限
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
    if (action === 'append') return _handleAppend(body);
    if (action === 'delete') return _handleDelete(body);
    return _resp({ ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return _resp({ ok: false, error: String(err) });
  }
}

/**
 * 新增整週紀錄
 *  body = {
 *    action: 'append',
 *    sheet: '億展第六屆',
 *    date: '2026/05/01',
 *    items: [
 *      { type: '入席費', income: 31500, paid: 0, total: 0, extraIncome: 0, extraExpense: 0, extraDesc: '', note: '' },
 *      { type: '早餐',   expense: 32340, paid: 48, total: 49, extraExpense: 600, extraDesc: '生日蛋糕', note: '' }
 *    ]
 *  }
 */
function _handleAppend(body) {
  const ss = SpreadsheetApp.openById(FINANCE_SHEET_ID);
  const sheet = ss.getSheetByName(body.sheet);
  if (!sheet) return _resp({ ok: false, error: '找不到分頁：' + body.sheet });
  if (!body.items || !body.items.length) return _resp({ ok: false, error: '無新增項目' });

  const lastRow = sheet.getLastRow();
  let runningBal = _findLastBalance(sheet, lastRow);

  const newRows = body.items.map(function (item, idx) {
    const income      = _num(item.income);
    const expense     = _num(item.expense);
    const extraIncome = _num(item.extraIncome);
    const extraExpense= _num(item.extraExpense);

    runningBal = runningBal + income - expense;
    const balCol5 = runningBal;
    runningBal = runningBal + extraIncome - extraExpense;
    const balCol10 = runningBal;

    const extraIncomeCell  = extraIncome ? (item.extraIncomeDesc ? extraIncome + '（' + item.extraIncomeDesc + '）' : extraIncome) : '';
    const extraExpenseCell = extraExpense ? (item.extraDesc ? extraExpense + '（' + item.extraDesc + '）' : extraExpense) : '';

    return [
      idx === 0 ? body.date : '',  // A 日期
      item.type || '',             // B 性質
      income || '',                // C 收入
      expense || '',               // D 支出
      balCol5,                     // E 結餘（扣除常規收支後）
      _num(item.paid) || '',       // F 付費人數
      _num(item.total) || '',      // G 總人數
      extraIncomeCell,             // H 額外收入
      extraExpenseCell,            // I 額外支出
      balCol10,                    // J 結餘（再扣除額外項目）
      item.note || ''              // K 備註
    ];
  });

  sheet.getRange(lastRow + 1, 1, newRows.length, 11).setValues(newRows);
  return _resp({ ok: true, lastBalance: runningBal, addedRows: newRows.length });
}

/**
 * 刪除一列（依列號）
 *  body = { action: 'delete', sheet: '億展第六屆', rowIndex: 12 }
 *  rowIndex = 1-based（含表頭）
 */
function _handleDelete(body) {
  const ss = SpreadsheetApp.openById(FINANCE_SHEET_ID);
  const sheet = ss.getSheetByName(body.sheet);
  if (!sheet) return _resp({ ok: false, error: '找不到分頁：' + body.sheet });
  if (!body.rowIndex || body.rowIndex < 2) return _resp({ ok: false, error: 'rowIndex 必須 >= 2' });
  sheet.deleteRow(body.rowIndex);
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

// =============== 測試 ===============
function _test() {
  const ss = SpreadsheetApp.openById(FINANCE_SHEET_ID);
  ss.getSheets().forEach(function (sheet) {
    Logger.log(sheet.getName() + ' 列數：' + sheet.getLastRow());
  });
}
