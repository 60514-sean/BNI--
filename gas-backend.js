// BNI Weekly Tracker + Guest Tracker - GAS Backend

// ===== Member System =====
const SS_ID           = '1vaunMiu-soVacqsbvRxY1dDQ2ZLBghv0t9rTer3KdP0';
const SHEET_GID       = 466594149;
const PRESENTATION_ID = '15ImCbhAZ6WtBwEAmpMDzXXz1JUOk7l8ta9YGHSb0oIs';

// ===== Guest System =====
const GUEST_SS_ID   = '1CSFoZvkiz0kSX-ZUSZ5DOQKZ1laf4w2zrDN4N9NZhF8';
const GUEST_HEADERS = ['首次參訪', '邀約人', '締結人', '姓名', '稱謂', '產業別', '公司名', '電話', '參訪後締結', '狀態', '追蹤紀錄'];

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

function listGuests() {
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
        tracks:        String(row[10] || '')
      });
    });
  });
  return result;
}

function addGuest(body) {
  const year = yearFromDate(body.firstVisit);
  const sh = getGuestSheetForYear(year);
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
    body.tracks        || ''
  ];
  sh.appendRow(row);
  return { ok: true, year: year, sheetRow: sh.getLastRow() };
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

  if (oldYear === newYear) {
    oldSh.getRange(r, 1, 1, GUEST_HEADERS.length).setValues(rowData);
    return { ok: true, year: newYear, sheetRow: r };
  }
  const newSh = getGuestSheetForYear(newYear);
  newSh.appendRow(rowData[0]);
  oldSh.deleteRow(r);
  return { ok: true, year: newYear, sheetRow: newSh.getLastRow() };
}

function deleteGuest(body) {
  const sh = getGuestSheetForYear(body.year);
  sh.deleteRow(body.sheetRow);
  return { ok: true };
}

// ===== 公開 DM 用 token（同時在前端 dm-public.html 設定）=====
const PUBLIC_DM_TOKEN = '9k4r7p2m8x5v3t6y';

// 速率限制：每分鐘最多 N 次（防止爬蟲大量呼叫）
const PUBLIC_DM_RATE_LIMIT_PER_MIN = 30;

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
function getPublicMembers() {
  const sh = getSheet();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const idx = function(name) {
    return headers.findIndex(function(h) { return String(h).indexOf(name) >= 0; });
  };
  const iName = idx('姓名'), iSpec = idx('專業別'), iComp = idx('公司'), iServ = idx('服務'), iPhone = idx('電話');
  const iPhoto = idx('照片連結'), iInd = idx('產業鏈'), iSlogan = idx('口號');
  const data = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  return data
    .map(function(r) {
      return {
        name:      iName >= 0 ? String(r[iName] || '').trim() : '',
        specialty: iSpec >= 0 ? String(r[iSpec] || '').trim() : '',
        industry:  iInd >= 0 ? String(r[iInd] || '').trim() : '',
        slogan:    iSlogan >= 0 ? String(r[iSlogan] || '').trim() : '',
        company:   iComp >= 0 ? String(r[iComp] || '').trim() : '',
        phone:     iPhone >= 0 ? String(r[iPhone] || '').trim() : '',
        service:   iServ >= 0 ? String(r[iServ] || '').trim() : '',
        photo:     iPhoto >= 0 ? String(r[iPhoto] || '').trim() : ''
      };
    })
    .filter(function(m) { return m.name; });
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

    if (action === 'addGuest') {
      return ContentService
        .createTextOutput(JSON.stringify(addGuest(body)))
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
      const fileName = 'dm_p' + panel + '.png';
      // 清除舊版本
      const existing = folder.getFilesByName(fileName);
      while (existing.hasNext()) existing.next().setTrashed(true);
      const b64 = body.base64.indexOf(',') >= 0 ? body.base64.split(',')[1] : body.base64;
      const decoded = Utilities.base64Decode(b64);
      const blob = Utilities.newBlob(decoded, 'image/png', fileName);
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      const url = 'https://lh3.googleusercontent.com/d/' + file.getId();
      // 存到 PropertiesService 給前端讀取
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
      if (ci('服務') >= 0) sh.getRange(row, ci('服務') + 1).setValue(body.service || '');
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
