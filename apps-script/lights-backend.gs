/**
 * BNI 億展 — 燈號分析後端 API
 * 部署位置：獨立 Apps Script 專案
 * 試算表：1vaunMiu-soVacqsbvRxY1dDQ2ZLBghv0t9rTer3KdP0
 *
 * Actions:
 *   GET  ?action=listLightsData [&from=YYYY-MM-DD&to=YYYY-MM-DD]
 *   POST { action: 'addPalmsImport', from, to, rangeType, importer, rows: [...] }
 *   POST { action: 'deletePalmsImport', from, to }
 *   POST { action: 'updateMemberLight', sheetRow, light, streak, settlementTag }
 *   POST { action: 'batchUpdateMemberLights', updates: [{ sheetRow, light, streak, settlementTag }] }
 *   POST { action: 'getLightsConfig' }
 *   POST { action: 'setLightsConfig', config: {...} }
 */

const SS_ID = '1vaunMiu-soVacqsbvRxY1dDQ2ZLBghv0t9rTer3KdP0';
const SHEET_LIGHTS = '燈號-週資料';
const SHEET_TRAINING = '培訓-活動紀錄';
const SHEET_MEMBERS = '會員';

// 「燈號-週資料」的 21 個欄位順序（與 Sheet 標題列一致）
const LIGHTS_COLS = [
  'from', 'to', 'surname', 'given', 'name',
  'att', 'abs', 'late', 'sick', 'sub',
  'refIn', 'refOut', 'refRcvIn', 'refRcvOut',
  'vis', 'one', 'amt', 'train',
  'importTime', 'importer', 'rangeType'
];

// 「培訓-活動紀錄」欄位（每列 = 一筆會員出席紀錄）
const TRAINING_COLS = [
  'from', 'to', 'surname', 'given', 'name',
  'activityDate', 'activityType', 'points',
  'importTime', 'importer'
];

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

// ===== Web App entry =====
function doGet(e) {
  return _handle(e, 'GET');
}
function doPost(e) {
  return _handle(e, 'POST');
}

function _handle(e, method) {
  try {
    let params = {};
    if (method === 'POST' && e.postData && e.postData.contents) {
      try { params = JSON.parse(e.postData.contents); } catch (err) { params = {}; }
    }
    Object.assign(params, e.parameter || {});

    // 所有 action 皆需登入令牌（GET 帶 token，POST 帶 auth）
    if (!_authOk(params.auth || params.token)) return _json({ ok: false, error: 'unauthorized' });

    const action = params.action;
    let result;
    switch (action) {
      case 'listLightsData':           result = listLightsData(params); break;
      case 'addPalmsImport':           result = addPalmsImport(params); break;
      case 'deletePalmsImport':        result = deletePalmsImport(params); break;
      case 'updateMemberLight':        result = updateMemberLight(params); break;
      case 'batchUpdateMemberLights':  result = batchUpdateMemberLights(params); break;
      case 'getLightsConfig':          result = getLightsConfig(); break;
      case 'setLightsConfig':          result = setLightsConfig(params); break;
      case 'listTrainingData':         result = listTrainingData(params); break;
      case 'addTrainingImport':        result = addTrainingImport(params); break;
      case 'listTrash':                result = listTrash(); break;
      case 'restoreTrash':             result = restoreTrashItem(params); break;
      case 'purgeTrash':               result = purgeTrashItem(params); break;
      case 'setAuthHash': {
        const nh = String(params.newHash || '');
        if (!/^[0-9a-f]{64}$/.test(nh)) { result = { ok: false, error: 'bad hash' }; break; }
        PropertiesService.getScriptProperties().setProperty('API_AUTH_HASH', nh);
        result = {}; break;
      }
      default:
        return _json({ ok: false, error: 'unknown action: ' + action });
    }
    return _json({ ok: true, ...result });
  } catch (err) {
    return _json({ ok: false, error: String(err && err.message || err) });
  }
}

// ===== 垃圾桶（軟刪除，防誤刪；7 天後開啟垃圾桶面板時自動清除過期項目） =====
const TRASH_SHEET_NAME = '垃圾桶';
const TRASH_RETENTION_DAYS = 7;

function _trashSheet_() {
  let sh = _ss().getSheetByName(TRASH_SHEET_NAME);
  if (!sh) {
    sh = _ss().insertSheet(TRASH_SHEET_NAME);
    sh.getRange(1, 1, 1, 7).setValues([['id', '刪除時間', '來源分頁', '類型', '摘要', '標頭快照', '列資料']]);
    sh.getRange('A1:G1').setFontWeight('bold').setBackground('#fce8e6');
    sh.setColumnWidth(1, 220);
    sh.setColumnWidth(5, 260);
  }
  return sh;
}

// 把一列資料存進垃圾桶；呼叫端仍需自行執行 deleteRow（此函式不刪除來源列）
function _moveToTrash(sheet, rowIndex, kind, summary) {
  try {
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const values = sheet.getRange(rowIndex, 1, 1, lastCol).getValues()[0];
    const trash = _trashSheet_();
    trash.appendRow([
      Utilities.getUuid(),
      Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss'),
      sheet.getName(),
      kind || '',
      summary || '',
      JSON.stringify(headers),
      JSON.stringify(values)
    ]);
  } catch (e) {
    // 垃圾桶寫入失敗不應阻擋原本的刪除操作
  }
}

function _purgeExpiredTrash_() {
  const sh = _trashSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  const times = sh.getRange(2, 2, lastRow - 1, 1).getValues();
  const now = Date.now();
  const toDelete = [];
  times.forEach(function (r, i) {
    const t = new Date(String(r[0]).replace(' ', 'T'));
    if (!isNaN(t.getTime()) && (now - t.getTime()) > TRASH_RETENTION_DAYS * 86400000) toDelete.push(i + 2);
  });
  toDelete.sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); });
}

function listTrash() {
  _purgeExpiredTrash_();
  const sh = _trashSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { data: [] };
  const rows = sh.getRange(2, 1, lastRow - 1, 5).getValues();
  return {
    data: rows.map(function (r) {
      return { id: r[0], deletedAt: r[1], sourceSheet: r[2], kind: r[3], summary: r[4] };
    })
  };
}

function restoreTrashItem(params) {
  const id = params.id;
  if (!id) throw new Error('missing id');
  const sh = _trashSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) throw new Error('not found');
  const data = sh.getRange(2, 1, lastRow - 1, 7).getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === id) {
      const sourceName = data[i][2];
      const target = _ss().getSheetByName(sourceName);
      if (!target) throw new Error('來源分頁「' + sourceName + '」已不存在，無法還原');
      const oldHeaders = JSON.parse(data[i][5] || '[]');
      const oldValues  = JSON.parse(data[i][6] || '[]');
      const curHeaders = target.getRange(1, 1, 1, target.getLastColumn()).getValues()[0];
      const newRow = curHeaders.map(function (h) {
        const idx = oldHeaders.indexOf(h);
        return idx >= 0 ? oldValues[idx] : '';
      });
      target.appendRow(newRow);
      sh.deleteRow(i + 2);
      return {};
    }
  }
  throw new Error('not found');
}

function purgeTrashItem(params) {
  const id = params.id;
  if (!id) throw new Error('missing id');
  const sh = _trashSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) throw new Error('not found');
  const ids = sh.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) { sh.deleteRow(i + 2); return {}; }
  }
  throw new Error('not found');
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== 工具函式 =====
function _ss() { return SpreadsheetApp.openById(SS_ID); }
function _shLights() {
  const sh = _ss().getSheetByName(SHEET_LIGHTS);
  if (!sh) throw new Error('找不到分頁：' + SHEET_LIGHTS);
  return sh;
}
function _shMembers() {
  const sh = _ss().getSheetByName(SHEET_MEMBERS);
  if (!sh) throw new Error('找不到分頁：' + SHEET_MEMBERS);
  return sh;
}

// 取得所有 row（已含 header），第 1 列是標題
function _readAllLights() {
  const sh = _shLights();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const range = sh.getRange(2, 1, lastRow - 1, LIGHTS_COLS.length);
  const values = range.getValues();
  return values.map((row, i) => {
    const obj = { sheetRow: i + 2 };
    LIGHTS_COLS.forEach((k, idx) => { obj[k] = row[idx]; });
    return obj;
  });
}

// 日期欄位統一成 yyyy-mm-dd 字串
function _fmtDate(v) {
  if (v == null || v === '') return '';
  // 字串：取前 10 字（已是 yyyy-mm-dd）
  if (typeof v === 'string') return v.slice(0, 10);
  // 用 duck typing 判斷 Date（跨 Apps Script context instanceof 可能失效）
  if (v && typeof v.getMonth === 'function') {
    return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd');
  }
  // 最後一搏：嘗試轉成 Date
  try {
    var d = new Date(v);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, 'Asia/Taipei', 'yyyy-MM-dd');
  } catch (e) {}
  return String(v).slice(0, 10);
}

// ===== Actions =====

// 列出所有週資料，可選 from/to 篩選（包含關係：row.from >= from && row.to <= to）
function listLightsData(params) {
  const rows = _readAllLights().map(r => ({
    ...r,
    from: _fmtDate(r.from),
    to: _fmtDate(r.to)
  }));
  let filtered = rows;
  if (params.from) filtered = filtered.filter(r => r.from >= params.from);
  if (params.to) filtered = filtered.filter(r => r.to <= params.to);
  return { data: filtered };
}

// 寫入一份 PALMS 快照
// 同主鍵 (from, to, name) 會先刪除舊資料再寫入新資料
function addPalmsImport(params) {
  const { from, to, rangeType, importer, rows } = params;
  if (!from || !to) throw new Error('需要 from / to');
  if (!Array.isArray(rows) || !rows.length) throw new Error('rows 為空');

  const sh = _shLights();
  const existing = _readAllLights();
  const fromStr = _fmtDate(from);
  const toStr = _fmtDate(to);

  // 找出同 (from, to) 的舊行，從下往上刪
  const oldRows = existing
    .filter(r => _fmtDate(r.from) === fromStr && _fmtDate(r.to) === toStr)
    .map(r => r.sheetRow)
    .sort((a, b) => b - a);
  oldRows.forEach(rowNum => sh.deleteRow(rowNum));

  // 寫入新資料
  const importTime = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm');
  const out = rows.map(r => LIGHTS_COLS.map(k => {
    if (k === 'from') return fromStr;
    if (k === 'to') return toStr;
    if (k === 'importTime') return importTime;
    if (k === 'importer') return importer || '';
    if (k === 'rangeType') return rangeType || 'custom';
    return r[k] != null ? r[k] : '';
  }));
  const startRow = sh.getLastRow() + 1;
  const range = sh.getRange(startRow, 1, out.length, LIGHTS_COLS.length);
  range.setValues(out);
  // 把 from/to 兩欄強制設成純文字格式，避免 Sheet 自動轉 Date 物件
  sh.getRange(startRow, 1, out.length, 2).setNumberFormat('@');

  return { added: out.length, replaced: oldRows.length };
}

// 刪除某次匯入
function deletePalmsImport(params) {
  const { from, to } = params;
  if (!from || !to) throw new Error('需要 from / to');
  const sh = _shLights();
  const existing = _readAllLights();
  const fromStr = _fmtDate(from);
  const toStr = _fmtDate(to);
  const target = existing
    .filter(r => _fmtDate(r.from) === fromStr && _fmtDate(r.to) === toStr)
    .map(r => r.sheetRow)
    .sort((a, b) => b - a);
  target.forEach(rowNum => {
    _moveToTrash(sh, rowNum, 'palmsImport', 'PALMS 匯入：' + fromStr + ' ~ ' + toStr);
    sh.deleteRow(rowNum);
  });
  return { deleted: target.length };
}

// 更新單一會員的燈號 / 連莊 / 結算記錄
function updateMemberLight(params) {
  const { sheetRow, light, streak, settlementTag } = params;
  if (!sheetRow) throw new Error('需要 sheetRow');
  _writeMemberLight(sheetRow, light, streak, settlementTag);
  return { updated: 1 };
}

// 批次更新
function batchUpdateMemberLights(params) {
  const { updates } = params;
  if (!Array.isArray(updates) || !updates.length) return { updated: 0 };
  updates.forEach(u => {
    _writeMemberLight(u.sheetRow, u.light, u.streak, u.settlementTag);
  });
  return { updated: updates.length };
}

function _writeMemberLight(sheetRow, light, streak, settlementTag) {
  const sh = _shMembers();
  const headerRow = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const idxLight = headerRow.findIndex(h => String(h).trim() === '燈號');
  const idxStreak = headerRow.findIndex(h => String(h).trim() === '連莊月數');
  const idxTag = headerRow.findIndex(h => String(h).trim() === '結算記錄');
  if (idxLight < 0 || idxStreak < 0 || idxTag < 0) {
    throw new Error('「會員」分頁缺少欄位：燈號 / 連莊月數 / 結算記錄');
  }
  if (light != null)         sh.getRange(sheetRow, idxLight + 1).setValue(light);
  if (streak != null)        sh.getRange(sheetRow, idxStreak + 1).setValue(streak);
  if (settlementTag != null) sh.getRange(sheetRow, idxTag + 1).setValue(settlementTag);
}

// ===== 設定（評分標準 / 休會次數）=====
const CONFIG_KEY = 'lights_config';
const DEFAULT_CONFIG = {
  refScore:   [1.5, 1.2, 1.0, 0.75],
  visScore:   [0.5, 0.25],
  oneScore:   [2.0, 1.0, 0.5],
  trainScore: [6, 4, 2],
  amtScore:   [2000000, 800000, 400000],
  absDeduct:  { 0: 20, 1: 15, 2: 10 },  // 缺席次數對應扣分後的分數（3+ 為 0）
  lightLevel: [70, 50, 30],
  holidayCount: 0
};

function getLightsConfig() {
  const props = PropertiesService.getDocumentProperties();
  const raw = props.getProperty(CONFIG_KEY);
  if (!raw) return { config: DEFAULT_CONFIG };
  try { return { config: JSON.parse(raw) }; }
  catch (e) { return { config: DEFAULT_CONFIG }; }
}

function setLightsConfig(params) {
  const cfg = params.config;
  if (!cfg) throw new Error('需要 config');
  PropertiesService.getDocumentProperties().setProperty(CONFIG_KEY, JSON.stringify(cfg));
  return { saved: true };
}

// ===== 培訓資料 =====
function _shTraining() {
  let sh = _ss().getSheetByName(SHEET_TRAINING);
  if (!sh) {
    sh = _ss().insertSheet(SHEET_TRAINING);
    sh.getRange(1, 1, 1, TRAINING_COLS.length).setValues([TRAINING_COLS]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function listTrainingData(params) {
  const sh = _ss().getSheetByName(SHEET_TRAINING);
  if (!sh) return { data: [] };
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { data: [] };
  const range = sh.getRange(2, 1, lastRow - 1, TRAINING_COLS.length);
  const values = range.getValues();
  const rows = values.map((row, i) => {
    const obj = { sheetRow: i + 2 };
    TRAINING_COLS.forEach((k, idx) => { obj[k] = row[idx]; });
    obj.from = _fmtDate(obj.from);
    obj.to = _fmtDate(obj.to);
    obj.activityDate = _fmtDate(obj.activityDate);
    return obj;
  });
  return { data: rows };
}

// 培訓報告是完整累計，每次上傳清空後重寫
function addTrainingImport(params) {
  const { from, to, importer, rows } = params;
  if (!from || !to) throw new Error('需要 from / to');
  if (!Array.isArray(rows) || !rows.length) throw new Error('rows 為空');

  const sh = _shTraining();
  const lastRow = sh.getLastRow();
  const oldCount = lastRow >= 2 ? lastRow - 1 : 0;
  if (oldCount > 0) {
    sh.getRange(2, 1, oldCount, TRAINING_COLS.length).clearContent();
  }

  const importTime = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm');
  const fromStr = _fmtDate(from);
  const toStr = _fmtDate(to);
  const out = rows.map(r => TRAINING_COLS.map(k => {
    if (k === 'from') return fromStr;
    if (k === 'to') return toStr;
    if (k === 'importTime') return importTime;
    if (k === 'importer') return importer || '';
    return r[k] != null ? r[k] : '';
  }));
  sh.getRange(2, 1, out.length, TRAINING_COLS.length).setValues(out);
  // 強制 from/to/activityDate 三欄為純文字
  sh.getRange(2, 1, out.length, 2).setNumberFormat('@'); // from, to
  const activityDateCol = TRAINING_COLS.indexOf('activityDate') + 1;
  sh.getRange(2, activityDateCol, out.length, 1).setNumberFormat('@');

  return { added: out.length, replaced: oldCount };
}
