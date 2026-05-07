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
const SHEET_GID = 1895828585;   // 寫入用：預設指向「最新」屆別分頁；前端帶 sheetName 時以 sheetName 為準
const SHEET_NAME = '';          // SHEET_GID 找不到時的備援
// 讀取規則：只挑名稱含「屆」的分頁（避開 config/會員/其他工作分頁）
const TERM_TAB_REGEX = /第[一二三四五六七八九十百零0-9]+屆/;

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
  if (p.action === 'listSheets')  return jsonOut({ ok: true, sheets: listSheets() });
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
// 前端應傳 body.sheetName（從讀取時取得）；未傳則回退到預設 SHEET_GID 分頁。
function updateSchedule(body) {
  const sheet = resolveSheet(body && body.sheetName);
  if (!sheet) return jsonOut({ ok: false, error: 'sheet not found: ' + (body && body.sheetName || '<default>') });

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

  return jsonOut({ ok: true, sheet: sheet.getName(), row: row, presenterCell: presenterCell });
}

// ===== 清空一列（保留週次與日期）=====
function clearRow(body) {
  const sheet = resolveSheet(body && body.sheetName);
  if (!sheet) return jsonOut({ ok: false, error: 'sheet not found: ' + (body && body.sheetName || '<default>') });
  const row = parseInt(body.row, 10);
  if (!row || row < 2) return jsonOut({ ok: false, error: 'invalid row: ' + body.row });

  [COL.PRESENTERS, COL.MENTOR, COL.DEADLINE, COL.TOPIC].forEach(function (c) {
    sheet.getRange(row, c).setValue('');
  });
  return jsonOut({ ok: true, sheet: sheet.getName(), row: row });
}

// ===== 讀取：合併「所有屆別分頁」 =====
// 規則：只挑名稱符合 TERM_TAB_REGEX 的分頁（避開 config / 會員清單等其他工作分頁）。
// 每個分頁前先丟一列 ["", "<分頁名>", "", "", "", "", "", "", ""] 觸發前端「第X屆」標頭判定。
// 每筆資料尾端塞 [..., sheetName, realRow]，讓前端寫入時可以指回正確分頁。
function readSchedule() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheets = ss.getSheets().filter(function (s) {
    return TERM_TAB_REGEX.test(s.getName());
  });
  // 排序：屆數小（資歷舊）→ 屆數大（最新），不依 sheet 排列順序
  sheets.sort(function (a, b) {
    return termOrder(a.getName()) - termOrder(b.getName());
  });
  const out = [];
  sheets.forEach(function (sheet) {
    const name = sheet.getName();
    out.push(['', name, '', '', '', '', '', '', '']); // 屆別標頭列（前端 c0 = r[1] = name 即可被 /第X屆/ 抓到）
    const values = sheet.getDataRange().getValues();
    for (let r = 0; r < values.length; r++) {
      const row = values[r] || [];
      // 補滿 7 欄
      const padded = [];
      for (let c = 0; c < 7; c++) padded.push(c < row.length ? row[c] : '');
      // 第 8 欄 = sheetName，第 9 欄 = realRow（1-based）
      padded.push(name);
      padded.push(r + 1);
      out.push(padded);
    }
  });
  return out;
}

// ===== Debug：列出所有分頁名稱與 GID =====
function listSheets() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  return ss.getSheets().map(function (s) {
    return { name: s.getName(), gid: s.getSheetId(), isTerm: TERM_TAB_REGEX.test(s.getName()) };
  });
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

function resolveSheet(sheetName) {
  if (sheetName) {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const found = ss.getSheetByName(sheetName);
    if (found) return found;
  }
  return openSheet();
}

// 「第六屆」→ 6；「第二十屆」→ 20；不可解析 → 9999（沒有屆數則放最後）
function termOrder(name) {
  const m = String(name).match(/第([一二三四五六七八九十百零0-9]+)屆/);
  if (!m) return 9999;
  const ZH = { '零':0,'〇':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'百':100 };
  const s = m[1];
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  // 簡易中文數字解析（支援到「百」級即可，BNI 屆別不會超過幾十）
  let total = 0, section = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i], v = ZH[ch];
    if (v === undefined) continue;
    if (v >= 10) {
      section = (section || 1) * v;
      total += section; section = 0;
    } else {
      section = v;
    }
  }
  total += section;
  return total || 9999;
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
