/**
 * BNI 億展 財務控管 - Google Apps Script 後端
 * ============================================================
 * 用途：讀取財務試算表（多個會期分頁）→ 回傳 JSON 給前端 Web App
 *
 * 部署步驟：
 *  1. 開啟 https://script.google.com → 新增專案
 *  2. 將此檔案內容整段貼到 Code.gs（覆蓋原有內容）
 *  3. 上方「部署」→「新增部署作業」→ 類型選「網頁應用程式」
 *  4. 設定：
 *       說明：BNI 財務控管 API
 *       執行身分：我（您的 Google 帳號）
 *       誰可以存取：所有人
 *  5. 點「部署」→ 授權帳號（首次需同意 SpreadsheetApp 權限）
 *  6. 複製產生的「網頁應用程式網址」貼回對話視窗
 *
 * 注意：
 *  - 部署的帳號必須對 FINANCE_SHEET_ID 至少有「檢視者」權限
 *  - 之後修改 Code.gs 後，要再「管理部署作業」→ 編輯（鉛筆）→ 版本選「新增版本」→ 部署
 *    （否則網址不會抓到新邏輯）
 */

const FINANCE_SHEET_ID = '11cE-7UusxRTB2lNuFsk9MNLyrzzkjMR0QpAE9dvl96s';

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
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, sheets: out, updated: new Date().toISOString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 測試函式：在 Apps Script 編輯器中可手動執行，確認讀取無誤
 */
function _test() {
  const ss = SpreadsheetApp.openById(FINANCE_SHEET_ID);
  ss.getSheets().forEach(function (sheet) {
    Logger.log(sheet.getName() + ' 列數：' + sheet.getLastRow());
  });
}
