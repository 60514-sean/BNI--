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
 *
 * === 自動建立下一屆 ===
 * 每次前端讀取排程（getSchedule）時會自動檢查：若最新屆分頁最後一場距今 <=28 天
 * 且下一屆分頁還不存在，就自動新增「第X+1屆」分頁，往後排 6 個月的空白週五場次
 * （特殊場次如暫停/共識會/BOD/年會不會自動猜，仍需在前端手動編輯標記）。
 * 也可手動測試：<網址>?action=ensureNextTerm&token=xxx
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

// ===== 登入令牌驗證 =====
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

// ===== 進入點 =====
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'ping')        return jsonOut({ ok: true, time: new Date().toISOString() });
  if (!_authOk(p.token)) return jsonOut({ ok: false, error: 'unauthorized' });
  if (p.action === 'getSchedule') {
    try { ensureNextTermIfNeeded(); } catch (e) { /* 自動建立失敗不影響讀取 */ }
    return jsonOut({ ok: true, rows: readSchedule() });
  }
  if (p.action === 'listSheets')  return jsonOut({ ok: true, sheets: listSheets() });
  if (p.action === 'ensureNextTerm') { ensureNextTermIfNeeded(); return jsonOut({ ok: true, sheets: listSheets() }); }
  return jsonOut({ ok: true, message: 'BNI 簡報排程 API（請以 POST 呼叫 updateSchedule，或 GET ?action=ping/getSchedule）' });
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || '{}';
    const body = JSON.parse(raw);
    if (!_authOk(body.auth)) return jsonOut({ ok: false, error: 'unauthorized' });
    const action = body.action;

    if (action === 'setAuthHash') {
      const nh = String(body.newHash || '');
      if (!/^[0-9a-f]{64}$/.test(nh)) return jsonOut({ ok: false, error: 'bad hash' });
      PropertiesService.getScriptProperties().setProperty('API_AUTH_HASH', nh);
      return jsonOut({ ok: true });
    }
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

// ===== 自動建立下一屆空白排程 =====
// 條件：最新屆分頁的最後一列日期距今 <= NEXT_TERM_TRIGGER_DAYS，且下一屆分頁還不存在時，
// 自動新增分頁，依「上一屆最後一場之後的下一個週五」起算，往後排滿 NEXT_TERM_MONTHS 個月的週五空白場次。
// 特殊場次（暫停/共識會/BOD/年會）不自動猜測日期，需事後於前端「編輯」功能手動標記。
const NEXT_TERM_TRIGGER_DAYS = 28;
const NEXT_TERM_MONTHS = 6;

function ensureNextTermIfNeeded() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const termSheets = ss.getSheets().filter(function (s) { return TERM_TAB_REGEX.test(s.getName()); });
  if (!termSheets.length) return;
  termSheets.sort(function (a, b) { return termOrder(a.getName()) - termOrder(b.getName()); });
  const latest = termSheets[termSheets.length - 1];
  const latestNum = termOrder(latest.getName());
  if (latestNum === 9999) return; // 無法解析屆數，放棄自動建立

  const nextName = _nextTermName(latest.getName(), latestNum + 1);
  if (ss.getSheetByName(nextName)) return; // 下一屆已存在

  const lastDate = _findLastMeetingDate(latest);
  if (!lastDate) return;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((lastDate - today) / 86400000);
  if (daysLeft > NEXT_TERM_TRIGGER_DAYS) return; // 還早，先不建立

  _createNextTermSheet(ss, nextName, lastDate);
}

// 掃描分頁找出最後一列有效日期（還原年份：靠年份標記列 + 跨年判斷，與前端 _parseScheduleRows 邏輯一致）
function _findLastMeetingDate(sheet) {
  const values = sheet.getDataRange().getValues();
  let curYear = new Date().getFullYear();
  let lastMonth = 0;
  let lastDate = null;
  for (let r = 0; r < values.length; r++) {
    const row = values[r] || [];
    const b = String(row[1] || '').trim();
    const c = String(row[2] || '').trim();

    const ym = b.match(/^(\d{4})年?$/);
    if (ym) { curYear = parseInt(ym[1], 10); lastMonth = 0; continue; }

    const dm = c.match(/(\d{1,2})\/(\d{1,2})/);
    if (!dm) continue;
    const M = parseInt(dm[1], 10), D = parseInt(dm[2], 10);
    if (lastMonth >= 11 && M <= 2) curYear++;
    lastMonth = M;
    lastDate = new Date(curYear, M - 1, D);
  }
  return lastDate;
}

// 「第六屆」→「第七屆」；來源若用阿拉伯數字則沿用阿拉伯數字
function _nextTermName(latestName, nextNum) {
  if (/第\d+屆/.test(latestName)) return '第' + nextNum + '屆';
  return '第' + _numToChinese(nextNum) + '屆';
}

function _numToChinese(n) {
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (n < 10) return digits[n];
  if (n < 20) return '十' + (n % 10 === 0 ? '' : digits[n % 10]);
  const tens = Math.floor(n / 10), ones = n % 10;
  return digits[tens] + '十' + (ones === 0 ? '' : digits[ones]);
}

function _createNextTermSheet(ss, nextName, lastDate) {
  const newSheet = ss.insertSheet(nextName, ss.getSheets().length);

  // 下一屆第一場：上一屆最後一列之後的下一個週五
  const start = new Date(lastDate);
  start.setDate(start.getDate() + 1);
  while (start.getDay() !== 5) start.setDate(start.getDate() + 1);

  const termEnd = new Date(start);
  termEnd.setMonth(termEnd.getMonth() + NEXT_TERM_MONTHS);

  const rows = [];
  rows.push(['', nextName, '', '', '', '', '']);
  rows.push(['', '排序', '日期', '主題簡報者', '簡報輔導', '簡報截稿日', '主題']);
  rows.push(['', String(start.getFullYear()), '', '', '', '', '']);

  const fmt = function (d) { return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0'); };

  let seq = 1;
  const d = new Date(start);
  while (d < termEnd) {
    const deadline = new Date(d);
    deadline.setDate(deadline.getDate() - 10);
    rows.push(['', seq, fmt(d), '', '', fmt(deadline), '']);
    seq++;
    d.setDate(d.getDate() + 7);
  }

  newSheet.getRange(1, 1, rows.length, 7).setValues(rows);
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
