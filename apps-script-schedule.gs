/**
 * BNI 簡報排程 — Apps Script 後端
 *
 * 目標 Sheet：https://docs.google.com/spreadsheets/d/12cGPw7f8L1HxZv6G5H3yKzPYNKNg8jIdzV3gl2sEN_Y/edit
 *
 * === 部署步驟 ===
 * 1. 開啟上面那份 Sheet → 上方選單「擴充功能 → Apps Script」
 * 2. 把預設的 Code.gs 內容全部刪掉，貼上整份本檔內容
 * 3. 上方藍色按鈕「部署 → 新增部署作業」
 *      - 類型：網頁應用程式
 *      - 執行身分：我（你的 Google 帳號）
 *      - 存取權限：「任何人」（這樣前端 fetch 才不用驗證）
 *      - 點「部署」→ 按「授權存取」→ 同意各項權限
 * 4. 部署完成後複製「網頁應用程式」網址（形如 https://script.google.com/macros/s/AKfy.../exec）
 * 5. 把網址貼到 src/schedule.js 第 5 行的 SCHEDULE_API_URL
 *      const SCHEDULE_API_URL = 'https://script.google.com/macros/s/.../exec';
 *
 * === 後續更新程式碼 ===
 * 改完 .gs 之後一定要重新「部署 → 管理部署作業 → 鉛筆圖示 → 版本：新版本 → 部署」
 * 否則網址端跑的還是舊版。
 *
 * === 測試（可選）===
 * 部署後在瀏覽器打開 <網址>?action=ping，應該回傳 {"ok":true,"time":"..."}
 */

const SHEET_ID = '12cGPw7f8L1HxZv6G5H3yKzPYNKNg8jIdzV3gl2sEN_Y';
const SHEET_GID = 1895828585;   // 第六屆分頁；以 gid 鎖定避免分頁改名失效
const SHEET_NAME = '';          // SHEET_GID 找不到時的備援

// 欄位對應（Sheet 第幾欄；A=1, B=2, ...）— 第六屆分頁格式：A 欄空白、無次數欄
const COL = {
  WEEK:       2,  // B 排序/標記（屆別、年份、連假暫停等）
  DATE:       3,  // C 日期
  PRESENTERS: 4,  // D 主題簡報者
  MENTOR:     5,  // E 簡報輔導
  DEADLINE:   6,  // F 簡報截稿日
  TOPIC:      7,  // G 主題
};

// ===== 進入點 =====
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'ping')        return jsonOut({ ok: true, time: new Date().toISOString() });
  if (p.action === 'getSchedule') return jsonOut({ ok: true, rows: readSchedule() });
  return jsonOut({ ok: true, message: 'BNI 簡報排程 API（請以 POST 呼叫 updateSchedule，或 GET ?action=ping/getSchedule）' });
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || '{}';
    const body = JSON.parse(raw);
    const action = body.action;

    if (action === 'updateSchedule') return updateSchedule(body);
    if (action === 'clearRow')       return clearRow(body);

    return jsonOut({ ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message || err) });
  }
}

// ===== 寫入：更新一列 =====
function updateSchedule(body) {
  const sheet = openSheet();
  if (!sheet) return jsonOut({ ok: false, error: 'sheet not found' });

  const row = parseInt(body.row, 10);
  if (!row || row < 2) return jsonOut({ ok: false, error: 'invalid row: ' + body.row });

  const data = body.data || {};
  const presenters = parsePresentersInput(data.presenters);
  const presenterCell = composePresenterCell(data.type, presenters);
  const isPaused = data.type === '暫停';

  sheet.getRange(row, COL.PRESENTERS).setValue(presenterCell);
  sheet.getRange(row, COL.MENTOR).setValue(data.mentor || '');
  sheet.getRange(row, COL.DEADLINE).setValue(data.deadline || '');
  sheet.getRange(row, COL.TOPIC).setValue(isPaused ? '' : (data.topic || ''));

  return jsonOut({ ok: true, row: row, presenterCell: presenterCell });
}

// ===== 清空一列（保留週次與日期）=====
function clearRow(body) {
  const sheet = openSheet();
  if (!sheet) return jsonOut({ ok: false, error: 'sheet not found' });
  const row = parseInt(body.row, 10);
  if (!row || row < 2) return jsonOut({ ok: false, error: 'invalid row: ' + body.row });

  [COL.PRESENTERS, COL.MENTOR, COL.DEADLINE, COL.TOPIC].forEach(function (c) {
    sheet.getRange(row, c).setValue('');
  });
  return jsonOut({ ok: true, row: row });
}

// ===== 讀取整張表（備援，前端目前直接讀公開 CSV，不需要走這裡）=====
function readSchedule() {
  const sheet = openSheet();
  if (!sheet) return [];
  return sheet.getDataRange().getValues();
}

// ===== 工具 =====
function openSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  if (SHEET_GID) {
    const found = ss.getSheets().find(function (s) { return s.getSheetId() === SHEET_GID; });
    if (found) return found;
  }
  return SHEET_NAME ? ss.getSheetByName(SHEET_NAME) : ss.getSheets()[0];
}

function parsePresentersInput(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input.map(function (s) { return String(s).trim(); }).filter(Boolean);
  return String(input).split(/[、,，\/／]/).map(function (s) { return s.trim(); }).filter(Boolean);
}

// 把「類型 + 簡報者陣列」組成 Sheet 主簡報者儲存格的字串
function composePresenterCell(type, presenters) {
  presenters = presenters || [];
  switch (type) {
    case '主題簡報': return presenters.join('、');
    case '主題日':   return presenters.length ? ('主題日(' + presenters.join('/') + ')') : '主題日';
    case '共識會':   return presenters.length ? ('共識會議(' + presenters.join('/') + ')') : '共識會議(無主題簡報)';
    case 'BOD':      return presenters.length ? ('BOD(' + presenters.join('/') + ')') : 'BOD(無主題簡報)';
    case '大商分享': return '大商分享';
    case '啟動會':   return '啟動會(無主題簡報)';
    case '年會':     return '年會(無主題簡報)';
    case '暫停':     return '';
    default:         return presenters.join('、');
  }
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
