// ===== REPORT（報告內容：簡報圖+備註台詞，可匯出 PDF 講義）=====
// 主檔：__report__  = { title, slides: [{ id, note }] }（雲端共用）
// 圖片雙寫：雲端 cache[`__report_img_<id>__`] + 本地 IndexedDB（同台電腦保底）

const _RPT_IMG_MAX_PX  = 720;   // 上傳前壓縮邊長
const _RPT_IMG_QUALITY = 0.72;  // JPEG 品質

// ----- IndexedDB 本地保底層 -----
const _RPT_IDB_NAME = 'bni_report';
const _RPT_IDB_STORE = 'images';
let _rptIdbDb = null;
const _rptIdbCache = new Map();  // id -> dataURL（preload 完才有資料）

function _rptIdbOpen() {
  return new Promise((resolve, reject) => {
    if (_rptIdbDb) return resolve(_rptIdbDb);
    if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'));
    const req = indexedDB.open(_RPT_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(_RPT_IDB_STORE)) db.createObjectStore(_RPT_IDB_STORE);
    };
    req.onsuccess = () => { _rptIdbDb = req.result; resolve(_rptIdbDb); };
    req.onerror = () => reject(req.error);
  });
}
async function _rptIdbPut(id, dataUrl) {
  try {
    const db = await _rptIdbOpen();
    await new Promise((res, rej) => {
      const tx = db.transaction(_RPT_IDB_STORE, 'readwrite');
      tx.objectStore(_RPT_IDB_STORE).put(dataUrl, id);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
  } catch (e) { console.warn('[REPORT IDB put]', e); }
}
async function _rptIdbDelete(id) {
  try {
    const db = await _rptIdbOpen();
    await new Promise((res, rej) => {
      const tx = db.transaction(_RPT_IDB_STORE, 'readwrite');
      tx.objectStore(_RPT_IDB_STORE).delete(id);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
  } catch (e) { console.warn('[REPORT IDB delete]', e); }
}
async function _rptIdbPreload() {
  try {
    const db = await _rptIdbOpen();
    await new Promise((res, rej) => {
      const tx = db.transaction(_RPT_IDB_STORE, 'readonly');
      const cur = tx.objectStore(_RPT_IDB_STORE).openCursor();
      cur.onsuccess = (e) => {
        const c = e.target.result;
        if (c) { _rptIdbCache.set(c.key, c.value); c.continue(); }
        else res();
      };
      cur.onerror = () => rej(cur.error);
    });
  } catch (e) { console.warn('[REPORT IDB preload]', e); }
}
// 啟動時就把本機已存的圖載到記憶體，渲染時可同步取用
const _rptIdbReadyPromise = _rptIdbPreload();

function _rptEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function _rptUid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function _rptLoadScript(url) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${url}"]`)) return res();
    const s = document.createElement('script');
    s.src = url; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

// dataURL → Blob URL（解碼一次，後續直接顯示，避免大字串每次渲染都重新解碼）
const _rptObjectUrls = new Map();
function _rptGetImageSrc(id) {
  if (_rptObjectUrls.has(id)) return _rptObjectUrls.get(id);
  // 優先：雲端 cache；找不到則退本機 IDB
  let dataUrl = getReportImage(id);
  if (!dataUrl) dataUrl = _rptIdbCache.get(id) || '';
  if (!dataUrl) return '';
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return dataUrl;
  try {
    const bin = atob(m[2]);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([u8], { type: m[1] }));
    _rptObjectUrls.set(id, url);
    return url;
  } catch {
    return dataUrl;
  }
}
function _rptRevokeImage(id) {
  if (_rptObjectUrls.has(id)) {
    URL.revokeObjectURL(_rptObjectUrls.get(id));
    _rptObjectUrls.delete(id);
  }
}

// 缺圖時主動 polling 雲端，圖到了就補入 DOM（不重渲整頁，保留編輯狀態）
let _rptWaitTimer = null;
let _rptWaitTries = 0;
function _rptStopWaitImages() {
  if (_rptWaitTimer) { clearInterval(_rptWaitTimer); _rptWaitTimer = null; }
  _rptWaitTries = 0;
}
function _rptPatchMissingImages() {
  const d = getReportData();
  let stillMissing = 0;
  d.slides.forEach(s => {
    const thumbEl = document.querySelector(`#reportContent .rpt-card[data-id="${CSS.escape(s.id)}"] .rpt-card-thumb`);
    if (!thumbEl) return;
    if (thumbEl.querySelector('img')) return; // 已有圖
    const src = _rptGetImageSrc(s.id);
    if (!src) { stillMissing++; return; }
    thumbEl.querySelector('.rpt-thumb-empty')?.remove();
    const img = document.createElement('img');
    img.src = src; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    thumbEl.appendChild(img);
  });
  return stillMissing;
}
async function _rptStartWaitImages() {
  _rptStopWaitImages();
  // 等本機 IDB preload 完成，立刻 patch 一次（同台電腦自己上傳的圖直接顯示）
  await _rptIdbReadyPromise;
  _rptPatchMissingImages();
  if (typeof _bgRefresh === 'function') _bgRefresh();
  _rptWaitTimer = setInterval(() => {
    _rptWaitTries++;
    if (_activeTab !== 'report') { _rptStopWaitImages(); return; }
    const stillMissing = _rptPatchMissingImages();
    if (stillMissing === 0) { _rptStopWaitImages(); return; }
    if (_rptWaitTries >= 30) { _rptStopWaitImages(); return; }
    if (_rptWaitTries % 3 === 0 && typeof _bgRefresh === 'function') _bgRefresh();
  }, 1000);
}

function _rptResize(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, _RPT_IMG_MAX_PX / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      try { resolve(canvas.toDataURL('image/jpeg', _RPT_IMG_QUALITY)); }
      catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('圖片讀取失敗')); };
    img.src = url;
  });
}

// ===== RENDER =====
function renderReport() {
  document.getElementById('headerTitle').textContent = '報告內容';
  const d = getReportData();
  const canEdit = _canEditTab('report');

  // 進入分頁時若有缺圖，啟動等待補入機制
  const hasMissing = d.slides.some(s => !_rptGetImageSrc(s.id));
  if (hasMissing) _rptStartWaitImages();
  else _rptStopWaitImages();

  const cardsHtml = d.slides.length
    ? d.slides.map((s, i) => _rptCardHtml(s, i)).join('')
    : `<div class="rpt-empty" style="grid-column:1 / -1;">
         <div class="rpt-empty-title">尚未新增任何簡報圖</div>
         <div class="rpt-empty-desc">點下方「新增圖片」開始建立你的講義</div>
       </div>`;

  document.getElementById('reportContent').innerHTML = `
    <div class="rpt-wrap">
      <div class="rpt-header-card">
        <input class="rpt-title" id="rptTitle" type="text"
               placeholder="報告標題（例：本週秘財報告）"
               value="${_rptEsc(d.title)}"
               oninput="_rptOnTitle(this.value)" ${canEdit ? '' : 'readonly'}>
        <div class="rpt-stats">
          <span class="rpt-stats-num">${d.slides.length}</span>
          <span class="rpt-stats-lbl">張</span>
        </div>
      </div>

      <div class="rpt-toolbar">
        <label class="rpt-btn rpt-btn-primary ${canEdit ? '' : 'is-disabled'}">
          <input type="file" id="rptFileInput" accept="image/*" multiple
                 style="display:none"
                 onchange="addReportImages(this.files)" ${canEdit ? '' : 'disabled'}>
          <span class="rpt-btn-full">＋ 新增圖片</span>
          <span class="rpt-btn-short">新增</span>
        </label>
        <button class="rpt-btn rpt-btn-preview" onclick="previewReport()"
                ${d.slides.length ? '' : 'disabled'}>
          預覽
        </button>
        <button class="rpt-btn rpt-btn-export" onclick="exportReportPDF()"
                ${d.slides.length ? '' : 'disabled'}>
          <span class="rpt-btn-full">匯出 PDF</span>
          <span class="rpt-btn-short">PDF</span>
        </button>
      </div>

      <div class="rpt-grid" id="rptGrid">${cardsHtml}</div>
    </div>`;

  // 拖曳排序（長按啟動）
  if (d.slides.length && canEdit) _rptInitSortable();
}

function _rptCardHtml(s, idx) {
  const img = _rptGetImageSrc(s.id);
  const note = (s.note || '').trim();
  const imgHtml = img
    ? `<img src="${img}" alt="" loading="lazy" decoding="async">`
    : `<div class="rpt-thumb-empty">載入中…</div>`;
  return `
    <div class="rpt-card" data-id="${_rptEsc(s.id)}" onclick="openReportSlideEditor('${_rptEsc(s.id)}')">
      <div class="rpt-card-thumb">
        <div class="rpt-card-no">${idx + 1}</div>
        ${imgHtml}
      </div>
      <div class="rpt-card-note${note ? '' : ' is-empty'}">${_rptEsc(note || '（未填備註）')}</div>
    </div>`;
}

// Sortable.js 拖曳排序（長按 250ms 觸發）
async function _rptInitSortable() {
  try {
    await _rptLoadScript('https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js');
  } catch { return; }
  if (!window.Sortable) return;
  const grid = document.getElementById('rptGrid');
  if (!grid) return;
  if (grid._sortable) { try { grid._sortable.destroy(); } catch {} }
  grid._sortable = Sortable.create(grid, {
    animation: 180,
    delay: 250,
    delayOnTouchOnly: true,
    touchStartThreshold: 5,
    ghostClass: 'rpt-card-ghost',
    chosenClass: 'rpt-card-chosen',
    onEnd: async (evt) => {
      const o = evt.oldIndex, n = evt.newIndex;
      if (o == null || n == null || o === n) return;
      const d = getReportData();
      if (o < 0 || n < 0 || o >= d.slides.length || n >= d.slides.length) return;
      const [moved] = d.slides.splice(o, 1);
      d.slides.splice(n, 0, moved);
      await saveReportData(d);
      renderReport();
    }
  });
}

// 點卡片開啟編輯 modal（換圖、編輯備註、刪除）
function openReportSlideEditor(id) {
  const d = getReportData();
  const idx = d.slides.findIndex(s => s.id === id);
  if (idx < 0) return;
  const s = d.slides[idx];
  const img = _rptGetImageSrc(id);
  const canEdit = _canEditTab('report');

  const ov = document.createElement('div');
  ov.className = 'sc-modal-overlay';
  ov.id = 'rptEditorOverlay';
  ov.onclick = (e) => { if (e.target === ov) closeReportSlideEditor(); };
  ov.innerHTML = `
    <div class="sc-modal sc-modal-wide" onclick="event.stopPropagation()">
      <div class="sc-modal-head">
        <span>第 ${idx + 1} 張 · 編輯</span>
        <button class="sc-icon-btn" onclick="closeReportSlideEditor()">×</button>
      </div>
      <div class="sc-modal-body">
        <div class="rpt-editor-thumb">
          ${img ? `<img src="${img}" alt="">` : `<div class="rpt-editor-empty">圖片載入中…</div>`}
        </div>
        <div class="rpt-editor-actions">
          <button class="rpt-btn rpt-btn-preview" onclick="replaceReportImage('${_rptEsc(id)}')"
                  ${canEdit ? '' : 'disabled'}>換圖</button>
          <button class="rpt-btn rpt-btn-danger" onclick="removeReportSlide('${_rptEsc(id)}')"
                  ${canEdit ? '' : 'disabled'}>刪除</button>
        </div>
        <div class="rpt-editor-note-label">備註台詞</div>
        <textarea class="rpt-editor-note" placeholder="輸入這張圖要講的台詞…"
                  oninput="_rptOnNote('${_rptEsc(id)}', this.value)"
                  ${canEdit ? '' : 'readonly'}>${_rptEsc(s.note)}</textarea>
      </div>
    </div>`;
  document.body.appendChild(ov);
}

function closeReportSlideEditor() {
  document.getElementById('rptEditorOverlay')?.remove();
}

// ===== EDIT =====
const _rptDebounce = {};
function _rptOnTitle(v) {
  clearTimeout(_rptDebounce.title);
  _rptDebounce.title = setTimeout(() => {
    const d = getReportData();
    d.title = v;
    saveReportData(d);
  }, 500);
}
function _rptOnNote(id, v) {
  clearTimeout(_rptDebounce['n_' + id]);
  _rptDebounce['n_' + id] = setTimeout(() => {
    const d = getReportData();
    const s = d.slides.find(x => x.id === id);
    if (!s) return;
    s.note = v;
    saveReportData(d);
  }, 500);
}

async function addReportImages(fileList) {
  if (!fileList || !fileList.length) return;
  const files = [...fileList].filter(f => f.type.startsWith('image/'));
  if (!files.length) { showToast('沒有可上傳的圖片'); return; }
  showLoader(true, `處理圖片 0 / ${files.length}`);
  try {
    const d = getReportData();
    for (let i = 0; i < files.length; i++) {
      showLoader(true, `處理圖片 ${i + 1} / ${files.length}`);
      try {
        const dataUrl = await _rptResize(files[i]);
        const id = _rptUid();
        _rptIdbCache.set(id, dataUrl);
        _rptIdbPut(id, dataUrl);              // 本機保底
        await saveReportImage(id, dataUrl);   // 雲端同步
        d.slides.push({ id, note: '' });
      } catch (e) {
        console.error('[REPORT] 處理失敗', files[i].name, e);
        showToast('「' + files[i].name + '」處理失敗');
      }
    }
    await saveReportData(d);
    showToast('已新增 ' + files.length + ' 張');
  } finally {
    showLoader(false);
    const ip = document.getElementById('rptFileInput');
    if (ip) ip.value = '';
    renderReport();
  }
}

async function removeReportSlide(id) {
  if (!confirm('確定刪除這張？')) return;
  const d = getReportData();
  d.slides = d.slides.filter(s => s.id !== id);
  await saveReportData(d);
  await deleteReportImage(id);
  _rptIdbCache.delete(id);
  _rptIdbDelete(id);
  _rptRevokeImage(id);
  closeReportSlideEditor();
  renderReport();
}

function replaceReportImage(id) {
  // 用單例的隱藏 input，避免動態 input 在 iOS Safari 上不彈出檔案選擇器
  let input = document.getElementById('_rptReplaceInput');
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.id = '_rptReplaceInput';
    input.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;';
    document.body.appendChild(input);
  }
  input.value = '';
  input.onchange = async () => {
    const f = input.files && input.files[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { showToast('請選擇圖片檔'); return; }
    showLoader(true, '更新圖片中...');
    try {
      const dataUrl = await _rptResize(f);
      _rptIdbCache.set(id, dataUrl);
      _rptIdbPut(id, dataUrl);
      await saveReportImage(id, dataUrl);
      _rptRevokeImage(id);
      showToast('已更新');
    } catch (e) {
      console.error('[REPORT] 更新失敗', e);
      showToast('更新失敗：' + (e.message || e));
    } finally {
      showLoader(false);
      input.value = '';
      closeReportSlideEditor();
      renderReport();
    }
  };
  input.click();
}

async function moveReportSlide(id, delta) {
  const d = getReportData();
  const i = d.slides.findIndex(s => s.id === id);
  if (i < 0) return;
  const j = i + delta;
  if (j < 0 || j >= d.slides.length) return;
  [d.slides[i], d.slides[j]] = [d.slides[j], d.slides[i]];
  await saveReportData(d);
  renderReport();
}

// ===== 預覽（modal 內縮放呈現 A4 排版）=====
function previewReport() {
  const d = getReportData();
  if (!d.slides.length) { showToast('沒有可預覽的內容'); return; }
  const tmp = document.createElement('div');
  tmp.innerHTML = _rptBuildSheetHtml(d);
  const pages = [...tmp.children];
  const wrappedHtml = pages.map(p => `<div class="rpt-page-wrap">${p.outerHTML}</div>`).join('');

  const ov = document.createElement('div');
  ov.className = 'sc-modal-overlay';
  ov.onclick = () => ov.remove();
  ov.innerHTML = `
    <div class="sc-modal sc-modal-wide" onclick="event.stopPropagation()">
      <div class="sc-modal-head">
        <span>預覽 · ${d.slides.length} 張 / ${pages.length} 頁</span>
        <button class="sc-icon-btn" onclick="this.closest('.sc-modal-overlay').remove()">×</button>
      </div>
      <div class="sc-modal-body"><div class="rpt-preview">${wrappedHtml}</div></div>
    </div>`;
  document.body.appendChild(ov);
}

// ===== PDF 匯出（A4 直式，每頁 2 組：左圖右備註並列）=====
async function exportReportPDF() {
  const d = getReportData();
  if (!d.slides.length) { showToast('沒有可匯出的內容'); return; }

  _pauseEditLock();
  showLoader(true, '載入 PDF 元件...');
  try {
    await Promise.all([
      _rptLoadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'),
      _rptLoadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
    ]);
    const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFCtor) throw new Error('jsPDF 初始化失敗');

    // 構建列印區（離畫面，但需可被 html2canvas 取到尺寸）
    let area = document.getElementById('rptPrintArea');
    if (!area) {
      area = document.createElement('div');
      area.id = 'rptPrintArea';
      document.body.appendChild(area);
    }
    area.innerHTML = _rptBuildSheetHtml(d);
    document.body.classList.add('rpt-print-mode');
    await new Promise(r => setTimeout(r, 150));

    const pages = area.querySelectorAll('.rpt-page');
    const pdf = new jsPDFCtor({ orientation: 'p', unit: 'mm', format: 'a4' });
    try {
      for (let i = 0; i < pages.length; i++) {
        showLoader(true, `匯出中 ${i + 1} / ${pages.length}`);
        const canvas = await html2canvas(pages[i], { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      }
    } finally {
      document.body.classList.remove('rpt-print-mode');
    }

    const safeTitle = (d.title || '報告內容').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
    pdf.save(`${safeTitle}.pdf`);
    showToast('PDF 已下載');
  } catch (e) {
    console.error('[REPORT PDF]', e);
    showToast('PDF 匯出失敗：' + (e.message || e));
  } finally {
    showLoader(false);
    _resumeEditLock();
  }
}

// 單組 row（左圖 + 右備註）的 HTML
function _rptRowHtml(s, idx) {
  const img = _rptGetImageSrc(s.id);
  const imgHtml = img
    ? `<img class="rpt-pp-img" src="${img}" alt="" loading="lazy" decoding="async">`
    : `<div class="rpt-pp-img rpt-pp-img-empty">（圖片）</div>`;
  const noteHtml = (s.note || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\r?\n/g, '<br>');
  return `
    <div class="rpt-pp-row">
      <div class="rpt-pp-left">
        <div class="rpt-pp-no">${idx}</div>
        ${imgHtml}
      </div>
      <div class="rpt-pp-right">
        <div class="rpt-pp-note-label">備註台詞</div>
        <div class="rpt-pp-note">${noteHtml || '<span style="color:#bbb;">（未填寫）</span>'}</div>
      </div>
    </div>`;
}

// 動態分頁：實際量測每組高度，總和超過頁面底邊就換頁
function _rptBuildSheetHtml(d) {
  const slides = d.slides;
  if (!slides.length) return '';

  const GAP_MM = 5;
  const TITLE_HTML = _rptEsc(d.title || '報告內容');

  // 1) 離畫面 measure 容器：放單一 .rpt-page，內含 head + 所有 row，量測每 row 高度
  const measure = document.createElement('div');
  measure.style.cssText = 'position:fixed;left:-99999px;top:0;z-index:-1;visibility:hidden;pointer-events:none;';
  measure.innerHTML = `
    <div class="rpt-page">
      <div class="rpt-pp-head">
        <div class="rpt-pp-title">${TITLE_HTML}</div>
        <div class="rpt-pp-pager">1 / 1</div>
      </div>
      <div class="rpt-pp-body">
        ${slides.map((s, i) => _rptRowHtml(s, i + 1)).join('')}
      </div>
    </div>`;
  document.body.appendChild(measure);

  let groups;
  try {
    // mm → px 換算用尺
    const ruler = document.createElement('div');
    ruler.style.cssText = 'position:fixed;left:-9999px;top:0;width:100mm;height:0;';
    document.body.appendChild(ruler);
    const pxPerMm = ruler.offsetWidth / 100;
    ruler.remove();

    const pageEl = measure.querySelector('.rpt-page');
    const headEl = measure.querySelector('.rpt-pp-head');
    // clientHeight 包含 padding，要手動扣掉上下 padding 才是真正可放內容的高度
    const pageStyle = getComputedStyle(pageEl);
    const padTop = parseFloat(pageStyle.paddingTop) || 0;
    const padBottom = parseFloat(pageStyle.paddingBottom) || 0;
    const pageInnerHeight = pageEl.clientHeight - padTop - padBottom;
    // head 占用 = 自身 offsetHeight（含 padding/border）+ margin-bottom
    const headStyle = getComputedStyle(headEl);
    const headTotal = headEl.offsetHeight + (parseFloat(headStyle.marginBottom) || 0);
    // 保留 1mm 安全邊距，避免瀏覽器小數捨入造成的細微溢出
    const safetyPx = 1 * pxPerMm;
    const bodyMaxPx = pageInnerHeight - headTotal - safetyPx;
    const gapPx = GAP_MM * pxPerMm;

    const rows = measure.querySelectorAll('.rpt-pp-row');
    groups = [];
    let current = [];
    let currentHeight = 0;
    for (let i = 0; i < rows.length; i++) {
      const rh = rows[i].offsetHeight;
      const need = current.length === 0 ? rh : currentHeight + gapPx + rh;
      if (need > bodyMaxPx && current.length > 0) {
        groups.push(current);
        current = [i];
        currentHeight = rh;
      } else {
        current.push(i);
        currentHeight = need;
      }
    }
    if (current.length) groups.push(current);
  } finally {
    measure.remove();
  }

  // 2) 用分組結果產出最終 HTML
  const totalPages = groups.length;
  return groups.map((indexes, pi) => {
    const rowsHtml = indexes.map(i => _rptRowHtml(slides[i], i + 1)).join('');
    return `
      <div class="rpt-page">
        <div class="rpt-pp-head">
          <div class="rpt-pp-title">${TITLE_HTML}</div>
          <div class="rpt-pp-pager">${pi + 1} / ${totalPages}</div>
        </div>
        <div class="rpt-pp-body">${rowsHtml}</div>
      </div>`;
  }).join('');
}
