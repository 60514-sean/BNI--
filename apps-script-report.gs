/**
 * BNI 億展 報告圖片儲存 - Google Apps Script 後端
 * ============================================================
 * 用 Drive Files 存簡報圖，避開 PropertiesService 單 key 9KB / 整體 500KB 限制
 *
 * === 部署步驟 ===
 *  1. 在 Google Drive 建立一個資料夾（例如：「BNI報告圖片」），開啟資料夾後從網址列複製 ID
 *     （網址形如 https://drive.google.com/drive/folders/【這串】）
 *  2. 開 https://script.google.com → 新增專案 → 把本檔程式碼整個貼上
 *  3. 把下方常數 REPORT_FOLDER_ID 換成你剛抄下的資料夾 ID
 *  4. 「部署」→「新增部署作業」→ 類型選「網頁應用程式」
 *     - 執行身分：我（你的帳號）
 *     - 存取權限：任何人
 *  5. 點「部署」，授權需要的權限，最後取得「網頁應用程式」URL
 *  6. 把那個 URL 貼給 Claude，會幫你寫進前端
 *
 * 每次修改本檔後要重新部署：「部署 → 管理部署作業 → 編輯 → 版本選新增版本 → 部署」
 */

const REPORT_FOLDER_ID = '請填入你的 Drive 資料夾 ID';

// ========== HTTP ==========
function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) || 'list';
    if (action === 'list') return _resp(_listAll());
    if (action === 'get')  return _resp({ id: e.parameter.id, url: _getUrl(e.parameter.id) });
    return _resp({ error: 'unknown action: ' + action });
  } catch (err) {
    return _resp({ error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    if (action === 'upload') return _resp(_uploadFile(body.id, body.dataUrl));
    if (action === 'delete') return _resp(_deleteFile(body.id));
    return _resp({ error: 'unknown action: ' + action });
  } catch (err) {
    return _resp({ error: String(err) });
  }
}

// ========== Drive 操作 ==========
function _folder() { return DriveApp.getFolderById(REPORT_FOLDER_ID); }

function _findAllByBaseName(folder, id) {
  const out = [];
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const base = f.getName().replace(/\.(jpe?g|png|webp|gif)$/i, '');
    if (base === id) out.push(f);
  }
  return out;
}

function _uploadFile(id, dataUrl) {
  if (!id || !dataUrl) return { error: 'missing id or dataUrl' };
  const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return { error: 'invalid dataUrl' };
  const mime = m[1];
  const ext  = (mime === 'image/png') ? '.png' : (mime === 'image/webp') ? '.webp' : '.jpg';
  const bytes = Utilities.base64Decode(m[2]);
  const blob = Utilities.newBlob(bytes, mime, id + ext);

  const folder = _folder();
  // 先刪同 id 舊檔
  _findAllByBaseName(folder, id).forEach(f => f.setTrashed(true));
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { id: id, url: _viewUrl(file.getId()) };
}

function _deleteFile(id) {
  const folder = _folder();
  const list = _findAllByBaseName(folder, id);
  list.forEach(f => f.setTrashed(true));
  return { id: id, deleted: list.length };
}

function _listAll() {
  const folder = _folder();
  const it = folder.getFiles();
  const result = {};
  while (it.hasNext()) {
    const f = it.next();
    const base = f.getName().replace(/\.(jpe?g|png|webp|gif)$/i, '');
    if (base) result[base] = _viewUrl(f.getId());
  }
  return result;
}

function _getUrl(id) {
  if (!id) return '';
  const list = _findAllByBaseName(_folder(), id);
  return list.length ? _viewUrl(list[0].getId()) : '';
}

function _viewUrl(fileId) {
  // 直顯圖片 URL（公開連結即可瀏覽器 <img> 顯示）
  return 'https://drive.google.com/uc?export=view&id=' + fileId;
}

// ========== 工具 ==========
function _resp(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
