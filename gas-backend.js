// BNI Weekly Tracker + Guest Tracker - GAS Backend

// ===== Member System =====
const SS_ID           = '1vaunMiu-soVacqsbvRxY1dDQ2ZLBghv0t9rTer3KdP0';
const SHEET_GID       = 466594149;
const PRESENTATION_ID = '15ImCbhAZ6WtBwEAmpMDzXXz1JUOk7l8ta9YGHSb0oIs';

// ===== Guest System =====
const GUEST_SS_ID   = '1CSFoZvkiz0kSX-ZUSZ5DOQKZ1laf4w2zrDN4N9NZhF8';
const GUEST_HEADERS = ['首次參訪', '邀約人', '締結人', '姓名', '稱謂', '產業別', '公司名', '電話', '參訪後締結', '狀態', '追蹤紀錄', '想認識的會員', '行為紀錄', '預期收穫', '事業現狀', '個性', '入會機率', '結案前狀態', '已填單', '已繳費', '已結案', '補充說明'];

function getSheet() {
  return SpreadsheetApp.openById(SS_ID).getSheets()
    .find(function(s) { return s.getSheetId() === SHEET_GID; });
}

function getPhotoFolder() {
  const folders = DriveApp.getFoldersByName('BNI_Member_Photos');
  return folders.hasNext() ? folders.next() : DriveApp.createFolder('BNI_Member_Photos');
}

function getDMBgFolder() {
  const folders = DriveApp.getFoldersByName('BNI_DM_Backgrounds');
  return folders.hasNext() ? folders.next() : DriveApp.createFolder('BNI_DM_Backgrounds');
}

function getPhotoCol(sh) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  let idx = headers.findIndex(function(h) { return String(h) === '照片連結'; });
  if (idx === -1) {
    idx = sh.getLastColumn();
    sh.getRange(1, idx + 1).setValue('照片連結');
    return idx + 1;
  }
  return idx + 1;
}

function columnToLetter(col) {
  let letter = '';
  while (col > 0) {
    const mod = (col - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

function exportOneSlide(sheetRow) {
  const sh = getSheet();
  const photoCol = getPhotoCol(sh);
  const folder = getPhotoFolder();
  const slideIndex = sheetRow - 2;
  const pres = Slides.Presentations.get(PRESENTATION_ID);
  const slides = pres.slides || [];
  if (slideIndex >= slides.length) return;
  const pageObjectId = slides[slideIndex].objectId;
  try {
    const thumb = Slides.Presentations.Pages.getThumbnail(
      PRESENTATION_ID, pageObjectId,
      { 'thumbnailProperties.mimeType': 'PNG', 'thumbnailProperties.thumbnailSize': 'LARGE' }
    );
    const blob = UrlFetchApp.fetch(thumb.contentUrl).getBlob().setName('member_' + sheetRow + '.png');
    const existing = folder.getFilesByName('member_' + sheetRow + '.png');
    while (existing.hasNext()) existing.next().setTrashed(true);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    sh.getRange(sheetRow, photoCol).setValue('https://lh3.googleusercontent.com/d/' + file.getId());
  } catch(e) {
    Logger.log('Row ' + sheetRow + ' photo failed: ' + e.message);
  }
}

function exportSlidesToSheet() {
  const sh = getSheet();
  const photoCol = getPhotoCol(sh);
  const folder = getPhotoFolder();
  const pres = Slides.Presentations.get(PRESENTATION_ID);
  const slides = pres.slides || [];
  const lastRow = sh.getLastRow();
  for (let i = 2; i <= lastRow; i++) {
    const slideIndex = i - 2;
    if (slideIndex >= slides.length) { sh.getRange(i, photoCol).setValue(''); continue; }
    const pageObjectId = slides[slideIndex].objectId;
    try {
      const thumb = Slides.Presentations.Pages.getThumbnail(
        PRESENTATION_ID, pageObjectId,
        { 'thumbnailProperties.mimeType': 'PNG', 'thumbnailProperties.thumbnailSize': 'LARGE' }
      );
      const blob = UrlFetchApp.fetch(thumb.contentUrl).getBlob().setName('member_' + i + '.png');
      const existing = folder.getFilesByName('member_' + i + '.png');
      while (existing.hasNext()) existing.next().setTrashed(true);
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      sh.getRange(i, photoCol).setValue('https://lh3.googleusercontent.com/d/' + file.getId());
      Logger.log('Row ' + i + ': done');
    } catch(e) {
      sh.getRange(i, photoCol).setValue('');
      Logger.log('Row ' + i + ' failed: ' + e.message);
    }
    Utilities.sleep(500);
  }
  Logger.log('All done');
}

// ===== Guest helpers =====
function getGuestSS() {
  return SpreadsheetApp.openById(GUEST_SS_ID);
}

function getGuestSheetForYear(year) {
  const ss = getGuestSS();
  const name = String(year);
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, GUEST_HEADERS.length).setValues([GUEST_HEADERS]);
    sh.getRange(1, 1, 1, GUEST_HEADERS.length).setFontWeight('bold').setBackground('#e8ecf0');
    sh.setFrozenRows(1);
  }
  return sh;
}

function yearFromDate(v) {
  if (!v) return new Date().getFullYear();
  if (v instanceof Date) return v.getFullYear();
  const m = String(v).match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : new Date().getFullYear();
}

function fmtDate(v) {
  if (!v) return '';
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  return String(v);
}

// 加入 30 秒快取；增刪改/註冊事件主動清快取，行為事件（高頻）不清以保持快取效益
const GUEST_LIST_CACHE_KEY = 'guest_list_v2';
const GUEST_LIST_CACHE_TTL = 30;

function invalidateGuestListCache() {
  try { CacheService.getScriptCache().remove(GUEST_LIST_CACHE_KEY); } catch (e) {}
}

function listGuests() {
  const cache = CacheService.getScriptCache();
  try {
    const cached = cache.get(GUEST_LIST_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch (e) { /* miss → 重讀 */ }

  const ss = getGuestSS();
  const sheets = ss.getSheets();
  const result = [];
  sheets.forEach(function(sh) {
    const name = sh.getName();
    if (!/^\d{4}$/.test(name)) return;
    const year = parseInt(name, 10);
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return;
    const width = Math.max(sh.getLastColumn(), GUEST_HEADERS.length);
    const values = sh.getRange(2, 1, lastRow - 1, width).getValues();
    values.forEach(function(row, i) {
      if (!row[3]) return;
      result.push({
        year: year,
        sheetRow: i + 2,
        firstVisit:    fmtDate(row[0]),
        inviter:       String(row[1] || ''),
        closer:        String(row[2] || ''),
        name:          String(row[3] || ''),
        title:         String(row[4] || ''),
        industry:      String(row[5] || ''),
        company:       String(row[6] || ''),
        phone:         String(row[7] || ''),
        postVisitNote: String(row[8] || ''),
        status:        String(row[9] || '待追蹤'),
        tracks:        String(row[10] || ''),
        interestedIn:  String(row[11] || ''),
        behavior:      String(row[12] || ''),
        expectedGain:  String(row[13] || ''),
        businessStatus:String(row[14] || ''),
        personality:   String(row[15] || ''),
        joinProb:      String(row[16] || ''),
        prevStatus:    String(row[17] || ''),
        applied:       String(row[18] || '') === 'TRUE',
        paid:          String(row[19] || '') === 'TRUE',
        closed:        String(row[20] || '') === 'TRUE',
        extraNote:     String(row[21] || '')
      });
    });
  });

  // 寫入快取（單筆上限 100KB，超過就跳過）
  try {
    const json = JSON.stringify(result);
    if (json.length < 99000) cache.put(GUEST_LIST_CACHE_KEY, json, GUEST_LIST_CACHE_TTL);
  } catch (e) {}
  return result;
}

function addGuest(body) {
  const year = yearFromDate(body.firstVisit);
  const sh = getGuestSheetForYear(year);
  ensureColumns(sh);
  const row = [
    body.firstVisit    || '',
    body.inviter       || '',
    body.closer        || '',
    body.name          || '',
    body.title         || '',
    body.industry      || '',
    body.company       || '',
    body.phone         || '',
    body.postVisitNote || '',
    body.status        || '待追蹤',
    body.tracks        || '',
    body.interestedIn  || '',
    body.behavior      || '',
    body.expectedGain  || '',
    body.businessStatus|| '',
    body.personality   || '',
    body.joinProb      || '',
    body.prevStatus    || '',
    body.applied ? 'TRUE' : 'FALSE',
    body.paid    ? 'TRUE' : 'FALSE',
    body.closed  ? 'TRUE' : 'FALSE',
    body.extraNote || ''
  ];
  sh.appendRow(row);
  invalidateGuestListCache();
  return { ok: true, year: year, sheetRow: sh.getLastRow() };
}

// 確保所有 GUEST_HEADERS 欄位都存在（補齊舊分頁缺少的欄位）
function ensureColumns(sh) {
  const lastCol = sh.getLastColumn();
  if (lastCol >= GUEST_HEADERS.length) return;
  for (let i = lastCol + 1; i <= GUEST_HEADERS.length; i++) {
    sh.getRange(1, i).setValue(GUEST_HEADERS[i - 1]);
    sh.getRange(1, i).setFontWeight('bold').setBackground('#e8ecf0');
  }
}
// 保留舊名稱以維持相容
function ensureInterestColumn(sh) { ensureColumns(sh); }

function normalizePhone(p) {
  // 取出所有數字，並去掉前導 0
  // 原因：Google Sheets 儲存 "0912345678" 會被自動轉成 number 912345678，前導 0 被吃掉
  // 統一去前導 0 後兩種格式都能匹配
  return String(p || '').replace(/\D/g, '').replace(/^0+/, '');
}

function updateGuest(body) {
  const oldYear = body.year;
  const oldSh = getGuestSheetForYear(oldYear);
  const r = body.sheetRow;
  const newYear = yearFromDate(body.firstVisit);

  const rowData = [[
    body.firstVisit    || '',
    body.inviter       || '',
    body.closer        || '',
    body.name          || '',
    body.title         || '',
    body.industry      || '',
    body.company       || '',
    body.phone         || '',
    body.postVisitNote || '',
    body.status        || '',
    body.tracks        || ''
  ]];

  // 寫入策略：前 11 欄批次寫；第 12「想認識」/第 13「行為紀錄」由其他 action 維護不動；
  // 第 14「預期收穫」/15「事業現狀」/16「個性」由前端可編輯，傳什麼寫什麼
  if (oldYear === newYear) {
    ensureColumns(oldSh);
    oldSh.getRange(r, 1, 1, 11).setValues(rowData);
    if (body.expectedGain   !== undefined) oldSh.getRange(r, 14).setValue(String(body.expectedGain || ''));
    if (body.businessStatus !== undefined) oldSh.getRange(r, 15).setValue(String(body.businessStatus || ''));
    if (body.personality    !== undefined) oldSh.getRange(r, 16).setValue(String(body.personality || ''));
    if (body.joinProb       !== undefined) oldSh.getRange(r, 17).setValue(String(body.joinProb || ''));
    if (body.prevStatus     !== undefined) oldSh.getRange(r, 18).setValue(String(body.prevStatus || ''));
    if (body.applied        !== undefined) oldSh.getRange(r, 19).setValue(body.applied ? 'TRUE' : 'FALSE');
    if (body.paid           !== undefined) oldSh.getRange(r, 20).setValue(body.paid ? 'TRUE' : 'FALSE');
    if (body.closed         !== undefined) oldSh.getRange(r, 21).setValue(body.closed ? 'TRUE' : 'FALSE');
    if (body.extraNote      !== undefined) oldSh.getRange(r, 22).setValue(String(body.extraNote || ''));
    invalidateGuestListCache();
    return { ok: true, year: newYear, sheetRow: r };
  }
  const newSh = getGuestSheetForYear(newYear);
  ensureColumns(newSh);
  // 跨年度搬移時保留所有額外欄位
  const lastCol = oldSh.getLastColumn();
  const existingInterest = lastCol >= 12 ? String(oldSh.getRange(r, 12).getValue() || '') : '';
  const existingBehavior = lastCol >= 13 ? String(oldSh.getRange(r, 13).getValue() || '') : '';
  const existingGain     = lastCol >= 14 ? String(oldSh.getRange(r, 14).getValue() || '') : '';
  const existingBiz      = lastCol >= 15 ? String(oldSh.getRange(r, 15).getValue() || '') : '';
  const existingPer      = lastCol >= 16 ? String(oldSh.getRange(r, 16).getValue() || '') : '';
  const existingProb     = lastCol >= 17 ? String(oldSh.getRange(r, 17).getValue() || '') : '';
  const existingPrevSt   = lastCol >= 18 ? String(oldSh.getRange(r, 18).getValue() || '') : '';
  const existingApplied  = lastCol >= 19 ? String(oldSh.getRange(r, 19).getValue() || '') : 'FALSE';
  const existingPaid     = lastCol >= 20 ? String(oldSh.getRange(r, 20).getValue() || '') : 'FALSE';
  const existingClosed   = lastCol >= 21 ? String(oldSh.getRange(r, 21).getValue() || '') : 'FALSE';
  const existingExtra    = lastCol >= 22 ? String(oldSh.getRange(r, 22).getValue() || '') : '';
  // 若 body 有新值就用新值，否則保留原值
  const finalGain = body.expectedGain   !== undefined ? String(body.expectedGain   || '') : existingGain;
  const finalBiz  = body.businessStatus !== undefined ? String(body.businessStatus || '') : existingBiz;
  const finalPer  = body.personality    !== undefined ? String(body.personality    || '') : existingPer;
  const finalProb = body.joinProb       !== undefined ? String(body.joinProb       || '') : existingProb;
  const finalPrev = body.prevStatus     !== undefined ? String(body.prevStatus     || '') : existingPrevSt;
  const finalApp  = body.applied        !== undefined ? (body.applied ? 'TRUE' : 'FALSE') : existingApplied;
  const finalPaid = body.paid           !== undefined ? (body.paid    ? 'TRUE' : 'FALSE') : existingPaid;
  const finalCls  = body.closed         !== undefined ? (body.closed  ? 'TRUE' : 'FALSE') : existingClosed;
  const finalExtra= body.extraNote      !== undefined ? String(body.extraNote      || '') : existingExtra;
  newSh.appendRow(rowData[0].concat([existingInterest, existingBehavior, finalGain, finalBiz, finalPer, finalProb, finalPrev, finalApp, finalPaid, finalCls, finalExtra]));
  oldSh.deleteRow(r);
  invalidateGuestListCache();
  return { ok: true, year: newYear, sheetRow: newSh.getLastRow() };
}

// 刪除來賓：若帶 phone 則刪除該手機所有 row（包含一訪+二訪）；否則用 year + sheetRow 刪單筆
function deleteGuest(body) {
  if (body.phone) {
    const phoneNorm = normalizePhone(body.phone);
    if (!phoneNorm) return { ok: false, error: 'invalid phone' };
    const ss = getGuestSS();
    const sheets = ss.getSheets();
    let deleted = 0;
    sheets.forEach(function (sh) {
      if (!/^\d{4}$/.test(sh.getName())) return;
      const lastRow = sh.getLastRow();
      if (lastRow < 2) return;
      const phones = sh.getRange(2, 8, lastRow - 1, 1).getValues();
      // 從底往上收集要刪的 row，避免刪除過程 row index 位移
      const toDelete = [];
      for (let i = phones.length - 1; i >= 0; i--) {
        if (normalizePhone(phones[i][0]) === phoneNorm) toDelete.push(i + 2);
      }
      toDelete.forEach(function (r) { sh.deleteRow(r); deleted++; });
    });
    invalidateGuestListCache();
    return { ok: true, deleted: deleted };
  }
  const sh = getGuestSheetForYear(body.year);
  sh.deleteRow(body.sheetRow);
  invalidateGuestListCache();
  return { ok: true };
}

// 輕量更新：用於進度條的勾選 / 取消
// 可選欄位：status (col 10) / prevStatus (col 18) / applied (col 19) / paid (col 20) / closed (col 21)
function updateGuestStatus(body) {
  const sh = getGuestSheetForYear(body.year);
  ensureColumns(sh);
  const row = parseInt(body.sheetRow, 10);
  if (!row || row < 2) return { ok: false, error: 'invalid sheetRow' };
  const boolStr = (v) => v ? 'TRUE' : 'FALSE';
  if (body.status     !== undefined) sh.getRange(row, 10).setValue(String(body.status || ''));
  if (body.prevStatus !== undefined) sh.getRange(row, 18).setValue(String(body.prevStatus || ''));
  if (body.applied    !== undefined) sh.getRange(row, 19).setValue(boolStr(body.applied));
  if (body.paid       !== undefined) sh.getRange(row, 20).setValue(boolStr(body.paid));
  if (body.closed     !== undefined) sh.getRange(row, 21).setValue(boolStr(body.closed));
  invalidateGuestListCache();
  return { ok: true };
}

// 批次匯入來賓：不檢查重複，全部 append（同手機已存在會自動形成「二訪」紀錄）
function batchAddGuests(body) {
  if (!Array.isArray(body.guests)) return { ok: false, error: 'invalid guests' };
  const today = new Date();
  const todayStr = today.getFullYear() + '-'
                 + String(today.getMonth() + 1).padStart(2, '0') + '-'
                 + String(today.getDate()).padStart(2, '0');
  let added = 0;
  const errors = [];
  body.guests.forEach(function (g, idx) {
    try {
      if (!g || !g.name) { errors.push({ row: idx + 1, error: '缺少姓名' }); return; }
      if (!g.phone)      { errors.push({ row: idx + 1, error: '缺少電話' }); return; }
      const firstVisit = String(g.firstVisit || todayStr);
      const year = yearFromDate(firstVisit);
      const sh = getGuestSheetForYear(year);
      ensureColumns(sh);
      sh.appendRow([
        firstVisit,
        String(g.inviter || ''),
        String(g.closer || ''),
        String(g.name),
        String(g.title || ''),
        String(g.industry || ''),
        String(g.company || ''),
        String(g.phone),
        String(g.postVisitNote || ''),
        String(g.status || '待追蹤'),
        '',  // 追蹤紀錄
        '',  // 想認識的會員
        '',  // 行為紀錄
        String(g.expectedGain   || ''),
        String(g.businessStatus || ''),
        String(g.personality    || ''),
        String(g.joinProb       || ''),
        '',     // 結案前狀態
        'FALSE',// 已填單
        'FALSE',// 已繳費
        'FALSE',// 已結案
        String(g.extraNote || '') // 補充說明
      ]);
      added++;
    } catch (err) {
      errors.push({ row: idx + 1, error: String((err && err.message) || err) });
    }
  });
  if (added > 0) invalidateGuestListCache();
  return { ok: true, added: added, errors: errors };
}

// ===== 來賓 DM 頁「想認識」按鈕：寫入歷屆來賓的「想認識的會員」欄 =====
// 比對手機（去除非數字）找對應來賓，找不到則自動建立新紀錄
function registerGuestInterest(body) {
  if (body.token !== PUBLIC_DM_TOKEN) return { ok: false, error: 'invalid token' };
  if (!checkPublicDMRateLimit()) return { ok: false, error: 'rate limit' };

  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const memberName = String(body.memberName || '').trim();
  if (!name || !phone || !memberName) return { ok: false, error: 'missing fields' };

  const phoneNorm = normalizePhone(phone);
  if (!phoneNorm) return { ok: false, error: 'invalid phone' };

  // 用統一 helper 找最新那筆（一訪/二訪皆寫入最新）
  const target = findGuestRowByPhone(phoneNorm);
  if (target) {
    const cell = target.sheet.getRange(target.row, 12);
    const existing = parseInterest(cell.getValue());
    const updated = upsertInterest(existing, memberName);
    cell.setValue(JSON.stringify(updated));
    return { ok: true, matched: true, year: parseInt(target.sheet.getName(), 10), sheetRow: target.row };
  }

  // 沒對到 → 自動建立新來賓（標記未匹配名單）
  const today = new Date();
  const todayStr = today.getFullYear() + '-'
                 + String(today.getMonth() + 1).padStart(2, '0') + '-'
                 + String(today.getDate()).padStart(2, '0');
  const year = today.getFullYear();
  const sh = getGuestSheetForYear(year);
  ensureColumns(sh);
  const tracks = JSON.stringify([{ date: todayStr, note: 'QR 自助登記，未匹配名單' }]);
  const interestJson = JSON.stringify([{ member: memberName, date: todayStr }]);
  sh.appendRow([
    todayStr, '', '', name, '', '', '', phone, '', '待追蹤', tracks, interestJson, '', '', '', '', '', '', 'FALSE', 'FALSE', 'FALSE', ''
  ]);
  invalidateGuestListCache();
  return { ok: true, matched: false, year: year, sheetRow: sh.getLastRow() };
}

// 查詢手機是否在歷屆來賓名單裡，回傳資料庫中的姓名（用於「歡迎回來」訊息）
// 沒對到時自動建 stub 紀錄，讓後續所有行為事件（撥電話、看官網、想認識）都能寫入該筆
function lookupGuestByPhone(body) {
  if (body.token !== PUBLIC_DM_TOKEN) return { ok: false, error: 'invalid token' };
  if (!checkPublicDMRateLimit()) return { ok: false, error: 'rate limit' };

  const phone = String(body.phone || '').trim();
  const phoneNorm = normalizePhone(phone);
  if (!phoneNorm) return { ok: false, error: 'invalid phone' };

  const target = findGuestRowByPhone(phoneNorm);
  if (target) return { ok: true, matched: true, name: String(target.name || '') };

  // 沒對到 → 自動建立 stub（純瀏覽的來賓也能完整記錄行為）
  const name = String(body.name || '').trim();
  if (!name) return { ok: true, matched: false }; // 沒名字就不建檔
  const today = new Date();
  const todayStr = today.getFullYear() + '-'
                 + String(today.getMonth() + 1).padStart(2, '0') + '-'
                 + String(today.getDate()).padStart(2, '0');
  const year = today.getFullYear();
  const sh = getGuestSheetForYear(year);
  ensureColumns(sh);
  const tracks = JSON.stringify([{ date: todayStr, note: 'QR 自助登記，未匹配名單' }]);
  sh.appendRow([
    todayStr, '', '', name, '', '', '', phone, '', '待追蹤', tracks, '', '', '', '', '', '', '', 'FALSE', 'FALSE', 'FALSE', ''
  ]);
  invalidateGuestListCache();
  return { ok: true, matched: false };
}

function parseInterest(v) {
  if (!v) return [];
  try {
    const arr = JSON.parse(String(v));
    return Array.isArray(arr) ? arr : [];
  } catch (err) { return []; }
}

// 紀錄來賓行為（visit/phoneClick/webClick），寫入歷屆來賓的「行為紀錄」欄
// body: { token, phone, name, type: 'visit'|'phoneClick'|'webClick', member?, startAt?, endAt?, at? }
function recordGuestBehavior(body) {
  if (body.token !== PUBLIC_DM_TOKEN) return { ok: false, error: 'invalid token' };
  if (!checkPublicDMRateLimit()) return { ok: false, error: 'rate limit' };

  const phone = String(body.phone || '').trim();
  const phoneNorm = normalizePhone(phone);
  if (!phoneNorm) return { ok: false, error: 'invalid phone' };

  const type = String(body.type || '');
  if (!['visit', 'phoneClick', 'webClick', 'industryJump'].includes(type)) return { ok: false, error: 'invalid type' };

  // 用統一 helper 找最新那筆（一訪/二訪皆寫入最新）
  const target = findGuestRowByPhone(phoneNorm);
  if (!target) return { ok: true, matched: false };

  const cell = target.sheet.getRange(target.row, 13);
  const raw = String(cell.getValue() || '');
  const data = parseBehavior(raw);

  if (type === 'visit') {
    const start = String(body.startAt || '');
    const end = String(body.endAt || '');
    if (start && end) {
      data.visits.push({ in: start, out: end });
      // 限制長度避免無限增長
      if (data.visits.length > 50) data.visits = data.visits.slice(-50);
    }
  } else if (type === 'phoneClick') {
    const member = String(body.member || '');
    const at = String(body.at || new Date().toISOString());
    if (member) {
      data.phoneClicks.push({ member, at });
      if (data.phoneClicks.length > 200) data.phoneClicks = data.phoneClicks.slice(-200);
    }
  } else if (type === 'webClick') {
    const member = String(body.member || '');
    const at = String(body.at || new Date().toISOString());
    if (member) {
      data.webClicks.push({ member, at });
      if (data.webClicks.length > 200) data.webClicks = data.webClicks.slice(-200);
    }
  } else if (type === 'industryJump') {
    const industry = String(body.industry || '');
    const at = String(body.at || new Date().toISOString());
    if (industry) {
      data.industryJumps.push({ industry, at });
      if (data.industryJumps.length > 200) data.industryJumps = data.industryJumps.slice(-200);
    }
  }

  cell.setValue(JSON.stringify(data));
  return { ok: true, matched: true };
}

// 批次處理多個行為事件（前端 buffer 後一次送）：只找一次手機、讀一次 cell、寫一次 cell
function batchBehavior(body) {
  if (body.token !== PUBLIC_DM_TOKEN) return { ok: false, error: 'invalid token' };
  if (!checkPublicDMRateLimit()) return { ok: false, error: 'rate limit' };

  const events = Array.isArray(body.events) ? body.events : [];
  if (events.length === 0) return { ok: true, count: 0 };

  const phone = String(body.phone || '').trim();
  const phoneNorm = normalizePhone(phone);
  if (!phoneNorm) return { ok: false, error: 'invalid phone' };

  const target = findGuestRowByPhone(phoneNorm);
  if (!target) return { ok: true, matched: false, count: 0 };

  const cell = target.sheet.getRange(target.row, 13);
  const data = parseBehavior(cell.getValue());

  const nowStr = new Date().toISOString();
  events.forEach(function (ev) {
    const t = String(ev && ev.type || '');
    if (t === 'visit') {
      if (ev.startAt && ev.endAt) data.visits.push({ in: ev.startAt, out: ev.endAt });
    } else if (t === 'phoneClick' && ev.member) {
      data.phoneClicks.push({ member: String(ev.member), at: String(ev.at || nowStr) });
    } else if (t === 'webClick' && ev.member) {
      data.webClicks.push({ member: String(ev.member), at: String(ev.at || nowStr) });
    } else if (t === 'industryJump' && ev.industry) {
      data.industryJumps.push({ industry: String(ev.industry), at: String(ev.at || nowStr) });
    }
  });

  if (data.visits.length > 50) data.visits = data.visits.slice(-50);
  if (data.phoneClicks.length > 200) data.phoneClicks = data.phoneClicks.slice(-200);
  if (data.webClicks.length > 200) data.webClicks = data.webClicks.slice(-200);
  if (data.industryJumps.length > 200) data.industryJumps = data.industryJumps.slice(-200);

  cell.setValue(JSON.stringify(data));
  return { ok: true, matched: true, count: events.length };
}

// 找出對應手機的歷屆來賓列；同一手機可能有多筆（一訪/二訪），回傳「首次參訪日期最新」那筆
// 搜尋順序：當年 → 其他年份；同年內掃完全部，比首訪日期挑最新
function findGuestRowByPhone(phoneNorm) {
  const ss = getGuestSS();
  const currentYear = new Date().getFullYear();
  const sheets = ss.getSheets()
    .filter(function (s) { return /^\d{4}$/.test(s.getName()); })
    .sort(function (a, b) {
      const ay = parseInt(a.getName(), 10);
      const by = parseInt(b.getName(), 10);
      if (ay === currentYear) return -1;
      if (by === currentYear) return 1;
      return by - ay;
    });
  const matches = [];
  for (let s = 0; s < sheets.length; s++) {
    const sh = sheets[s];
    const lastRow = sh.getLastRow();
    if (lastRow < 2) continue;
    ensureColumns(sh);
    // 一次抓首次參訪(col 1) + 電話(col 8)
    const data = sh.getRange(2, 1, lastRow - 1, 8).getValues();
    for (let i = 0; i < data.length; i++) {
      if (normalizePhone(data[i][7]) === phoneNorm) {
        matches.push({ sheet: sh, row: i + 2, firstVisit: data[i][0], name: data[i][3] });
      }
    }
  }
  if (matches.length === 0) return null;
  // 依 firstVisit 由新到舊排序，取最新那筆
  matches.sort(function (a, b) {
    const av = a.firstVisit instanceof Date ? a.firstVisit.getTime() : (new Date(a.firstVisit).getTime() || 0);
    const bv = b.firstVisit instanceof Date ? b.firstVisit.getTime() : (new Date(b.firstVisit).getTime() || 0);
    return bv - av;
  });
  return matches[0];
}

function parseBehavior(v) {
  const empty = { visits: [], phoneClicks: [], webClicks: [], industryJumps: [] };
  if (!v) return empty;
  try {
    const obj = JSON.parse(String(v));
    return {
      visits: Array.isArray(obj.visits) ? obj.visits : [],
      phoneClicks: Array.isArray(obj.phoneClicks) ? obj.phoneClicks : [],
      webClicks: Array.isArray(obj.webClicks) ? obj.webClicks : [],
      industryJumps: Array.isArray(obj.industryJumps) ? obj.industryJumps : []
    };
  } catch (e) { return empty; }
}

function upsertInterest(list, memberName) {
  const today = new Date();
  const todayStr = today.getFullYear() + '-'
                 + String(today.getMonth() + 1).padStart(2, '0') + '-'
                 + String(today.getDate()).padStart(2, '0');
  const idx = list.findIndex(function(x) { return x && x.member === memberName; });
  if (idx >= 0) {
    list[idx].date = todayStr;
  } else {
    list.push({ member: memberName, date: todayStr });
  }
  return list;
}

// ===== 公開 DM 用 token（同時在前端 dm-public.html 設定）=====
const PUBLIC_DM_TOKEN = '9k4r7p2m8x5v3t6y';

// 速率限制：每分鐘最多 N 次（防止爬蟲大量呼叫）
const PUBLIC_DM_RATE_LIMIT_PER_MIN = 150;

function checkPublicDMRateLimit() {
  const minute = Math.floor(new Date().getTime() / 60000);
  const key = 'rl_pubdm_' + minute;
  const cache = CacheService.getScriptCache();
  const count = parseInt(cache.get(key) || '0', 10) + 1;
  if (count > PUBLIC_DM_RATE_LIMIT_PER_MIN) return false;
  cache.put(key, String(count), 120); // 2 分鐘後自動過期
  return true;
}

// 取得會員公開資料（僅 8 個欄位，不含車牌、生日、續約等敏感資訊）
// 加入 60 秒 CacheService 快取，多人同時開 DM 頁時大幅減少 Sheet 讀取
const PUBLIC_MEMBERS_CACHE_KEY = 'public_members_v2';
const PUBLIC_MEMBERS_CACHE_TTL = 60;

function invalidatePublicMembersCache() {
  try { CacheService.getScriptCache().remove(PUBLIC_MEMBERS_CACHE_KEY); } catch (e) {}
}

function getPublicMembers() {
  const cache = CacheService.getScriptCache();
  try {
    const cached = cache.get(PUBLIC_MEMBERS_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch (e) { /* cache miss/error → 重新讀 sheet */ }

  const sh = getSheet();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const idx = function(name) {
    return headers.findIndex(function(h) { return String(h).indexOf(name) >= 0; });
  };
  const iName = idx('姓名'), iSpec = idx('專業別'), iComp = idx('公司'), iServ = idx('服務'), iPhone = idx('電話');
  const iPhoto = idx('照片連結'), iInd = idx('產業鏈'), iSlogan = idx('口號'), iWeb = idx('官網'), iGender = idx('性別');
  const data = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  const result = data
    .map(function(r) {
      return {
        name:      iName >= 0 ? String(r[iName] || '').trim() : '',
        specialty: iSpec >= 0 ? String(r[iSpec] || '').trim() : '',
        industry:  iInd >= 0 ? String(r[iInd] || '').trim() : '',
        slogan:    iSlogan >= 0 ? String(r[iSlogan] || '').trim() : '',
        company:   iComp >= 0 ? String(r[iComp] || '').trim() : '',
        phone:     iPhone >= 0 ? String(r[iPhone] || '').trim() : '',
        service:   iServ >= 0 ? String(r[iServ] || '').trim() : '',
        photo:     iPhoto >= 0 ? String(r[iPhoto] || '').trim() : '',
        website:   iWeb >= 0 ? String(r[iWeb] || '').trim() : '',
        gender:    iGender >= 0 ? String(r[iGender] || '').trim() : ''
      };
    })
    .filter(function(m) { return m.name; });

  // 寫入快取
  try { cache.put(PUBLIC_MEMBERS_CACHE_KEY, JSON.stringify(result), PUBLIC_MEMBERS_CACHE_TTL); } catch (e) {}
  return result;
}

// ===== doGet / doPost =====
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  if (action === 'getPublicDM') {
    try {
      const token = (e.parameter && e.parameter.token) || '';
      if (token !== PUBLIC_DM_TOKEN) {
        return ContentService
          .createTextOutput(JSON.stringify({ ok: false, error: 'invalid token' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      if (!checkPublicDMRateLimit()) {
        return ContentService
          .createTextOutput(JSON.stringify({ ok: false, error: 'rate limit', message: '請求過於頻繁，請稍後再試' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, data: getPublicMembers() }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (action === 'listDMBgs') {
    try {
      const props = PropertiesService.getScriptProperties();
      const result = {};
      for (let i = 1; i <= 8; i++) {
        const url = props.getProperty('dm_bg_p' + i);
        if (url) result[i] = url;
      }
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, data: result }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (action === 'listGuests') {
    try {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, data: listGuests() }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  const props = PropertiesService.getScriptProperties();
  const data = {};
  props.getKeys().forEach(function(k) {
    try { data[k] = JSON.parse(props.getProperty(k)); }
    catch(e) { data[k] = props.getProperty(k); }
  });
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    if (action === 'registerGuestInterest') {
      return ContentService
        .createTextOutput(JSON.stringify(registerGuestInterest(body)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'lookupGuest') {
      return ContentService
        .createTextOutput(JSON.stringify(lookupGuestByPhone(body)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'recordGuestBehavior') {
      return ContentService
        .createTextOutput(JSON.stringify(recordGuestBehavior(body)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'batchBehavior') {
      return ContentService
        .createTextOutput(JSON.stringify(batchBehavior(body)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'addGuest') {
      return ContentService
        .createTextOutput(JSON.stringify(addGuest(body)))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'batchAddGuests') {
      return ContentService
        .createTextOutput(JSON.stringify(batchAddGuests(body)))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'updateGuestStatus') {
      return ContentService
        .createTextOutput(JSON.stringify(updateGuestStatus(body)))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'updateGuest') {
      return ContentService
        .createTextOutput(JSON.stringify(updateGuest(body)))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'deleteGuest') {
      return ContentService
        .createTextOutput(JSON.stringify(deleteGuest(body)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'uploadDMBg') {
      const panel = parseInt(body.panel, 10);
      if (!panel || panel < 1 || panel > 8) {
        return ContentService
          .createTextOutput(JSON.stringify({ ok: false, error: 'invalid panel' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const folder = getDMBgFolder();
      // 偵測 MIME 與副檔名（保留原始格式不轉檔）
      const inputMime = body.mimeType || 'image/png';
      const ext = inputMime.indexOf('jpeg') >= 0 || inputMime.indexOf('jpg') >= 0 ? 'jpg'
                : inputMime.indexOf('webp') >= 0 ? 'webp'
                : 'png';
      const fileName = 'dm_p' + panel + '.' + ext;
      // 清除任何副檔名的舊版本
      ['png', 'jpg', 'jpeg', 'webp'].forEach(function(e) {
        const old = folder.getFilesByName('dm_p' + panel + '.' + e);
        while (old.hasNext()) old.next().setTrashed(true);
      });
      const b64 = body.base64.indexOf(',') >= 0 ? body.base64.split(',')[1] : body.base64;
      const decoded = Utilities.base64Decode(b64);
      const blob = Utilities.newBlob(decoded, inputMime, fileName);
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      const url = 'https://lh3.googleusercontent.com/d/' + file.getId();
      PropertiesService.getScriptProperties().setProperty('dm_bg_p' + panel, url);
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, url: url }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'deleteDMBg') {
      const panel = parseInt(body.panel, 10);
      if (!panel || panel < 1 || panel > 8) {
        return ContentService
          .createTextOutput(JSON.stringify({ ok: false, error: 'invalid panel' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const folder = getDMBgFolder();
      const fileName = 'dm_p' + panel + '.png';
      const existing = folder.getFilesByName(fileName);
      while (existing.hasNext()) existing.next().setTrashed(true);
      PropertiesService.getScriptProperties().deleteProperty('dm_bg_p' + panel);
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'uploadPhoto') {
      const sh = getSheet();
      const photoCol = getPhotoCol(sh);
      const folder = getPhotoFolder();
      const sheetRow = body.sheetRow;
      const fileName = 'member_' + sheetRow + '.jpg';
      const existingJpg = folder.getFilesByName(fileName);
      while (existingJpg.hasNext()) existingJpg.next().setTrashed(true);
      const existingPng = folder.getFilesByName('member_' + sheetRow + '.png');
      while (existingPng.hasNext()) existingPng.next().setTrashed(true);
      const b64 = body.base64.indexOf(',') >= 0 ? body.base64.split(',')[1] : body.base64;
      const decoded = Utilities.base64Decode(b64);
      const blob = Utilities.newBlob(decoded, 'image/jpeg', fileName);
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      const url = 'https://lh3.googleusercontent.com/d/' + file.getId();
      sh.getRange(sheetRow, photoCol).setValue(url);
      invalidatePublicMembersCache();
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, url: url }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'addMember') {
      const sh = getSheet();
      const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      const ci = function(name) { return headers.findIndex(function(h) { return String(h).indexOf(name) >= 0; }); };
      const seqNum = sh.getLastRow();
      const newRow = new Array(headers.length).fill('');
      newRow[0] = seqNum;
      newRow[ci('姓名')] = body.name || '';
      newRow[ci('產業鏈')] = body.industry || '';
      newRow[ci('專業別')] = body.specialty || '';
      if (ci('生日') >= 0) newRow[ci('生日')] = body.birthday || '';
      if (ci('口號') >= 0) newRow[ci('口號')] = body.slogan || '';
      if (ci('車牌') >= 0) newRow[ci('車牌')] = body.plates || '';
      newRow[ci('公司')] = body.company || '';
      newRow[ci('電話')] = body.phone || '';
      if (ci('官網') >= 0) newRow[ci('官網')] = body.website || '';
      if (ci('性別') >= 0) newRow[ci('性別')] = body.gender || '';
      newRow[ci('服務')] = body.service || '';
      if (ci('到期日') >= 0) newRow[ci('到期日')] = body.renewDate || '';
      if (ci('申請書') >= 0) newRow[ci('申請書')] = body.renewApply || 'FALSE';
      if (ci('繳費') >= 0) newRow[ci('繳費')] = body.renewPay || 'FALSE';
      if (ci('完成續約') >= 0) newRow[ci('完成續約')] = body.renewComplete || 'FALSE';
      if (ci('綢帶') >= 0) newRow[ci('綢帶')] = body.renewRibbon || 'FALSE';
      sh.appendRow(newRow);

      const newRowNum = sh.getLastRow();

      const daysColIdx = ci('到期續約天數');
      const dateColIdx = ci('到期日');
      if (daysColIdx >= 0 && dateColIdx >= 0) {
        const dateLetter = columnToLetter(dateColIdx + 1);
        sh.getRange(newRowNum, daysColIdx + 1).setFormula(
          '=IF(' + dateLetter + newRowNum + '="","",DATEDIF(TODAY(),' + dateLetter + newRowNum + ',"D"))'
        );
      }

      SlidesApp.openById(PRESENTATION_ID).appendSlide(SlidesApp.PredefinedLayout.BLANK);
      invalidatePublicMembersCache();
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, sheetRow: newRowNum }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'updateMember') {
      const sh = getSheet();
      const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      const ci = function(name) { return headers.findIndex(function(h) { return String(h).indexOf(name) >= 0; }); };
      const row = body.sheetRow;
      if (ci('姓名') >= 0) sh.getRange(row, ci('姓名') + 1).setValue(body.name || '');
      if (ci('產業鏈') >= 0) sh.getRange(row, ci('產業鏈') + 1).setValue(body.industry || '');
      if (ci('專業別') >= 0) sh.getRange(row, ci('專業別') + 1).setValue(body.specialty || '');
      if (ci('生日') >= 0) sh.getRange(row, ci('生日') + 1).setValue(body.birthday || '');
      if (ci('口號') >= 0) sh.getRange(row, ci('口號') + 1).setValue(body.slogan || '');
      if (ci('車牌') >= 0) sh.getRange(row, ci('車牌') + 1).setValue(body.plates || '');
      if (ci('公司') >= 0) sh.getRange(row, ci('公司') + 1).setValue(body.company || '');
      if (ci('電話') >= 0) sh.getRange(row, ci('電話') + 1).setValue(body.phone || '');
      if (ci('官網') >= 0) sh.getRange(row, ci('官網') + 1).setValue(body.website || '');
      if (ci('性別') >= 0) sh.getRange(row, ci('性別') + 1).setValue(body.gender || '');
      if (ci('服務') >= 0) sh.getRange(row, ci('服務') + 1).setValue(body.service || '');
      invalidatePublicMembersCache();
      return ok();
    }

    if (action === 'updateRenewal') {
      const sh = getSheet();
      const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      const ci = function(name) { return headers.findIndex(function(h) { return String(h).indexOf(name) >= 0; }); };
      const row = body.sheetRow;
      if (ci('到期日') >= 0) sh.getRange(row, ci('到期日') + 1).setValue(body.renewDate || '');
      if (ci('申請書') >= 0) sh.getRange(row, ci('申請書') + 1).setValue(body.renewApply || '');
      if (ci('繳費') >= 0) sh.getRange(row, ci('繳費') + 1).setValue(body.renewPay || '');
      if (ci('完成續約') >= 0) sh.getRange(row, ci('完成續約') + 1).setValue(body.renewComplete || '');
      if (ci('綢帶') >= 0) sh.getRange(row, ci('綢帶') + 1).setValue(body.renewRibbon || '');
      // 感言欄位用作「儀式日期」紀錄：勾選綢帶時自動寫入儀式日期，取消勾選時清空
      if (ci('感言') >= 0) sh.getRange(row, ci('感言') + 1).setValue(body.ceremonyDate || '');
      return ok();
    }

    if (action === 'deleteMember') {
      const sh = getSheet();
      const slideIndex = body.sheetRow - 2;
      const slides = SlidesApp.openById(PRESENTATION_ID).getSlides();
      if (slideIndex >= 0 && slideIndex < slides.length) {
        slides[slideIndex].remove();
      }
      sh.deleteRow(body.sheetRow);
      renumberSeq(sh);
      invalidatePublicMembersCache();
      return ok();
    }

    if (body.key !== undefined) {
      const val = body.value !== undefined ? body.value : body.data;
      PropertiesService.getScriptProperties()
        .setProperty(String(body.key), JSON.stringify(val));
      return ok();
    }

    return ok();

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function renumberSeq(sh) {
  const lastRow = sh.getLastRow();
  for (let i = 2; i <= lastRow; i++) {
    sh.getRange(i, 1).setValue(i - 1);
  }
}

function ok() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== Reorder members by Sheet「排序名單」分頁 =====
// 流程：
//  1) 在 Apps Script 編輯器手動執行 reorderMembers
//  2) 函數會自動同步「排序名單」分頁：主表新加的人自動補到名單末端、主表已刪除的人自動從名單移除
//  3) 函數會按名單順序重排主表，並重新編序號（1, 2, 3...）
//  4) 想調整排序：直接到「排序名單」分頁拖曳列即可，下次執行時生效
// 維運上不再需要修改 Apps Script 程式碼
function reorderMembers() {
  const SS_ID       = '1vaunMiu-soVacqsbvRxY1dDQ2ZLBghv0t9rTer3KdP0';
  const SHEET_GID   = 466594149;
  const ORDER_SHEET = '排序名單';

  const ss = SpreadsheetApp.openById(SS_ID);
  const sheet = ss.getSheets().find(function(s) { return s.getSheetId() === SHEET_GID; });
  if (!sheet) { Logger.log('Main sheet not found'); return; }

  // 取得或建立「排序名單」分頁
  let orderSheet = ss.getSheetByName(ORDER_SHEET);
  if (!orderSheet) {
    orderSheet = ss.insertSheet(ORDER_SHEET);
    orderSheet.getRange('A1').setValue('姓名（依此順序排列，可拖曳列調整）');
    orderSheet.getRange('A1').setFontWeight('bold').setBackground('#fff2cc');
    orderSheet.setColumnWidth(1, 280);
    Logger.log('已建立「排序名單」分頁');
  }

  // 讀取主表
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const allValues   = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const allFormulas = sheet.getRange(1, 1, lastRow, lastCol).getFormulas();

  // 合併公式與值（保留 DATEDIF 等公式）
  const merged = allValues.map(function(row, r) {
    return row.map(function(val, c) {
      const f = allFormulas[r][c];
      return f ? f : val;
    });
  });

  // 找標題列、姓名欄、序號欄
  let headerRowIndex = 0, nameColIndex = -1, numColIndex = -1;
  for (let r = 0; r < merged.length && nameColIndex === -1; r++) {
    for (let c = 0; c < merged[r].length; c++) {
      if (merged[r][c] === '姓名') { headerRowIndex = r; nameColIndex = c; break; }
    }
  }
  if (nameColIndex === -1) { Logger.log('姓名欄找不到'); return; }
  for (let c = 0; c < merged[headerRowIndex].length; c++) {
    if (merged[headerRowIndex][c] === 0 || merged[headerRowIndex][c] === '0') {
      numColIndex = c; break;
    }
  }

  // 建立姓名 → row 索引、收集所有主表會員姓名
  const byName = {};
  const memberNames = [];
  for (let r = headerRowIndex + 1; r < merged.length; r++) {
    const name = String(merged[r][nameColIndex]).trim();
    if (name && name !== 'undefined' && name !== 'null') {
      byName[name] = merged[r].slice();
      memberNames.push(name);
    }
  }

  // 從「排序名單」分頁讀取目前順序
  const orderLastRow = orderSheet.getLastRow();
  let newOrder = [];
  if (orderLastRow >= 2) {
    newOrder = orderSheet.getRange(2, 1, orderLastRow - 1, 1).getValues()
      .map(function(r) { return String(r[0]).trim(); })
      .filter(function(n) { return n; });
  }

  // 自動補上：主表有但名單沒有的姓名（接到最後）
  const inOrder = {};
  newOrder.forEach(function(n) { inOrder[n] = true; });
  const appended = [];
  memberNames.forEach(function(n) {
    if (!inOrder[n]) { newOrder.push(n); appended.push(n); }
  });
  if (appended.length > 0) Logger.log('自動加入名單： ' + appended.join(', '));

  // 自動清理：名單有但主表沒有（已退會）
  const inMember = {};
  memberNames.forEach(function(n) { inMember[n] = true; });
  const removed = [];
  newOrder = newOrder.filter(function(n) {
    if (inMember[n]) return true;
    removed.push(n);
    return false;
  });
  if (removed.length > 0) Logger.log('自動移出名單（主表已不存在）： ' + removed.join(', '));

  // 寫回更新後的「排序名單」
  if (orderSheet.getLastRow() >= 2) {
    orderSheet.getRange(2, 1, orderSheet.getLastRow() - 1, 1).clearContent();
  }
  if (newOrder.length > 0) {
    orderSheet.getRange(2, 1, newOrder.length, 1).setValues(newOrder.map(function(n) { return [n]; }));
  }

  // 按 newOrder 重新排列主表
  const newRows = [];
  for (let i = 0; i < newOrder.length; i++) {
    const targetName = newOrder[i];
    if (byName[targetName]) {
      const rowData = byName[targetName].slice();
      if (numColIndex !== -1) rowData[numColIndex] = i + 1;
      newRows.push(rowData);
    }
  }

  const startRow = headerRowIndex + 2;
  // setValues 會把以 "=" 開頭的字串視為公式 → 自動還原 DATEDIF
  sheet.getRange(startRow, 1, newRows.length, lastCol).setValues(newRows);

  Logger.log('Done! Reordered ' + newRows.length + ' members. Order list updated in 「' + ORDER_SHEET + '」');
}

// 一次性：將會員主表 A 欄（序號）依目前列順序從上到下重編 1, 2, 3...
// 用法：在 Apps Script 編輯器選 renumberMembers → 執行
function renumberMembers() {
  const SS_ID     = '1vaunMiu-soVacqsbvRxY1dDQ2ZLBghv0t9rTer3KdP0';
  const SHEET_GID = 466594149;
  const ss = SpreadsheetApp.openById(SS_ID);
  const sheet = ss.getSheets().find(function(s) { return s.getSheetId() === SHEET_GID; });
  if (!sheet) { Logger.log('Main sheet not found'); return; }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const nameCol = headers.findIndex(function(h) { return String(h).indexOf('姓名') >= 0; }) + 1;
  if (nameCol < 1) { Logger.log('找不到姓名欄'); return; }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log('沒有資料列'); return; }

  const names = sheet.getRange(2, nameCol, lastRow - 1, 1).getValues();
  let n = 0;
  const newSeq = names.map(function(r) {
    const name = String(r[0]).trim();
    if (name) { n++; return [n]; }
    return [''];
  });
  sheet.getRange(2, 1, newSeq.length, 1).setValues(newSeq);
  Logger.log('Renumbered ' + n + ' members in column A.');
}

// 一次性：寫入指定順序到「排序名單」分頁，並執行 reorderMembers()
// 用法：在 Apps Script 編輯器選 applyKKOrder_2026_05 → 執行
function applyKKOrder_2026_05() {
  const SS_ID       = '1vaunMiu-soVacqsbvRxY1dDQ2ZLBghv0t9rTer3KdP0';
  const ORDER_SHEET = '排序名單';
  const ORDER = [
    '黃愷訢','蔡志銘','蔡秀敏','林庭秀','蔡忠翰','郭懷憶','陳韋辰','謝秋霞',
    '鄭湘蓁','高靜觀','張宥瑩','康竣傑','方爰心','黃沛晴','陳麗安','余佳華',
    '潘禾家','金萱蓉','蔡佳霖','林惠雯','李蕙如','黃韋廸','温智翔','曹文豪',
    '江子揚','劉庭君','葉淑娟','蔡仲博','張育菁','郭霈蓉','吳少宇','劉珮汝',
    '李語婕','魏純雅','郭郁祥','陳柏豪','薛祐謙','王秋舒','林淑媛','李俐臻',
    '許孝群','黃蘭婷','王怡琳','李姵禎','馮士維','龍映庭','謝宗憲'
  ];

  const ss = SpreadsheetApp.openById(SS_ID);
  let orderSheet = ss.getSheetByName(ORDER_SHEET);
  if (!orderSheet) {
    orderSheet = ss.insertSheet(ORDER_SHEET);
    orderSheet.getRange('A1').setValue('姓名（依此順序排列，可拖曳列調整）');
    orderSheet.getRange('A1').setFontWeight('bold').setBackground('#fff2cc');
    orderSheet.setColumnWidth(1, 280);
  }

  if (orderSheet.getLastRow() >= 2) {
    orderSheet.getRange(2, 1, orderSheet.getLastRow() - 1, 1).clearContent();
  }
  orderSheet.getRange(2, 1, ORDER.length, 1).setValues(ORDER.map(function(n) { return [n]; }));

  reorderMembers();
}
