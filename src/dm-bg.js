// ===== DM 底圖管理 =====
// admin 專用：上傳 P1~P8 底圖到 Google Drive，覆蓋預設的 dm_p*.png

let _dmBgUrls = null; // { 1: url, 2: url, ... }

async function fetchDMBgs() {
  try {
    const res = await fetch(API_URL + '?action=listDMBgs', { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    _dmBgUrls = json.ok ? (json.data || {}) : {};
  } catch {
    _dmBgUrls = {};
  }
}

// DM 渲染時使用：回傳指定面板的圖片 URL（自訂優先，否則用預設）
function getDMBgUrl(panel) {
  if (_dmBgUrls && _dmBgUrls[panel]) return _dmBgUrls[panel];
  return 'dm_p' + panel + '.png';
}

async function renderDMBackgrounds() {
  if (CR !== 'admin') {
    document.getElementById('dmBgContent').innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-soft);">此頁僅管理員可用</div>';
    return;
  }
  await fetchDMBgs();
  const urls = _dmBgUrls || {};

  const parts = [];
  parts.push(`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
    <h2 style="font-size:18px;font-weight:700;color:var(--red);margin:0;">DM 底圖管理</h2>
    <button onclick="renderDMBackgrounds()" style="padding:7px 14px;background:white;border:1.5px solid var(--gray-border);border-radius:7px;cursor:pointer;font-size:13px;font-family:inherit;color:var(--text-soft);">重整</button>
  </div>`);

  parts.push(`<div style="font-size:12px;color:var(--text-soft);background:#fef9e7;border:1px solid #fcf3cf;padding:10px 14px;border-radius:8px;margin-bottom:16px;line-height:1.5;">
    上傳後，DM 渲染會自動使用新底圖。建議尺寸：<strong>單面板 1288 × 3556 px</strong>（對應 105mm × 297mm 印刷）。<br>
    P4 需保留 QR 紅框位置（水平 63.8%~91.4%、垂直 80.8%~89.7%）。
  </div>`);

  parts.push(`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px;">`);
  for (let i = 1; i <= 8; i++) {
    const isCustom = !!urls[i];
    const imgUrl = isCustom ? urls[i] : ('dm_p' + i + '.png');
    parts.push(`<div style="background:white;border:1.5px solid var(--gray-border);border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:6px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:12px;font-weight:900;color:var(--text);">P${i}</span>
        ${isCustom ? '<span style="font-size:9px;font-weight:700;color:#27ae60;background:#eaf7ee;padding:2px 6px;border-radius:10px;">自訂</span>' : '<span style="font-size:9px;font-weight:700;color:#7f8c8d;background:#ecf0f1;padding:2px 6px;border-radius:10px;">預設</span>'}
      </div>
      <div style="aspect-ratio:1288/3556;background:#f0f0f0;border-radius:4px;overflow:hidden;display:flex;align-items:center;justify-content:center;">
        <img src="${_escH(imgUrl)}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none'">
      </div>
      <input type="file" id="dmbgFile${i}" accept="image/png,image/jpeg" style="display:none" onchange="uploadDMBg(${i}, this.files[0])">
      <button onclick="document.getElementById('dmbgFile${i}').click()" style="padding:5px;background:var(--red);color:white;border:none;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">更換 P${i}</button>
      ${isCustom ? `<button onclick="confirmDeleteDMBg(${i})" style="padding:3px;background:white;border:1px solid #e74c3c;color:#e74c3c;border-radius:5px;font-size:10px;cursor:pointer;font-family:inherit;">還原預設</button>` : ''}
    </div>`);
  }
  parts.push(`</div>`);

  document.getElementById('dmBgContent').innerHTML = parts.join('');
}

async function uploadDMBg(panel, file) {
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    showToast('檔案太大（上限 8MB）');
    return;
  }
  showToast(`P${panel} 上傳中...`);
  try {
    const base64 = await _fileToBase64(file);
    await _apiPost({ action: 'uploadDMBg', panel, base64 });
    // no-cors 無法讀回應，等 2 秒後重抓 listDMBgs 確認
    await new Promise(r => setTimeout(r, 2000));
    _dmBgUrls = null;
    await fetchDMBgs();
    showToast(`P${panel} 已更新`);
    await renderDMBackgrounds();
    if (typeof renderDM === 'function' && _activeTab === 'dm') renderDM();
  } catch (e) {
    showToast('上傳失敗，請重試');
  }
}

function _fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function confirmDeleteDMBg(panel) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'dmBgDelModal';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-title" style="color:#e74c3c;">還原 P${panel} 為預設？</div>
      <p style="font-size:14px;color:var(--text);margin-bottom:8px;">將刪除自訂底圖，恢復使用內建的 <code>dm_p${panel}.png</code>。</p>
      <div class="modal-btns" style="margin-top:20px;">
        <button class="modal-save" style="background:#e74c3c;" onclick="deleteDMBg(${panel})">確認還原</button>
        <button class="modal-cancel" onclick="document.getElementById('dmBgDelModal').remove()">取消</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function deleteDMBg(panel) {
  document.getElementById('dmBgDelModal')?.remove();
  showToast(`還原 P${panel} 中...`);
  try {
    await _apiPost({ action: 'deleteDMBg', panel });
    await new Promise(r => setTimeout(r, 1500));
    _dmBgUrls = null;
    await fetchDMBgs();
    showToast(`P${panel} 已還原預設`);
    await renderDMBackgrounds();
    if (typeof renderDM === 'function' && _activeTab === 'dm') renderDM();
  } catch {
    showToast('還原失敗，請重試');
  }
}
