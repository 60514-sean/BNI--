// ===== REPORT（報告內容：簡報圖+備註台詞，可匯出 PDF 講義）=====
// 主檔：__report__  = { title, slides: [{ id, note }] }（雲端共用）
// 圖片：__report_img_<id>__ = dataURL（每張獨立 key，避免單一 key 過大）

const _RPT_IMG_MAX_PX  = 720;   // 上傳前壓縮邊長
const _RPT_IMG_QUALITY = 0.72;  // JPEG 品質

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

  const slidesHtml = d.slides.length
    ? d.slides.map((s, i) => _rptSlideRow(s, i, d.slides.length, canEdit)).join('')
    : `<div class="rpt-empty">
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
          ＋ 新增圖片
        </label>
        <button class="rpt-btn rpt-btn-preview" onclick="previewReport()"
                ${d.slides.length ? '' : 'disabled'}>
          預覽
        </button>
        <button class="rpt-btn rpt-btn-export" onclick="exportReportPDF()"
                ${d.slides.length ? '' : 'disabled'}>
          匯出 PDF
        </button>
      </div>

      <div class="rpt-list" id="rptList">${slidesHtml}</div>
    </div>`;
}

function _rptSlideRow(s, idx, total, canEdit) {
  const img = getReportImage(s.id);
  const imgHtml = img
    ? `<img class="rpt-thumb-img" src="${img}" alt="">`
    : `<div class="rpt-thumb-empty">載入中…</div>`;
  return `
    <div class="rpt-slide" data-id="${_rptEsc(s.id)}">
      <div class="rpt-slide-no">${idx + 1}</div>
      <div class="rpt-thumb">${imgHtml}</div>
      <div class="rpt-note-col">
        <div class="rpt-note-label">備註台詞</div>
        <textarea class="rpt-note" placeholder="輸入這張圖要講的台詞…"
                  oninput="_rptOnNote('${_rptEsc(s.id)}', this.value)"
                  ${canEdit ? '' : 'readonly'}>${_rptEsc(s.note)}</textarea>
      </div>
      <div class="rpt-actions">
        <button class="rpt-mini" title="上移" onclick="moveReportSlide('${_rptEsc(s.id)}', -1)"
                ${canEdit && idx > 0 ? '' : 'disabled'}>▲</button>
        <button class="rpt-mini" title="下移" onclick="moveReportSlide('${_rptEsc(s.id)}', 1)"
                ${canEdit && idx < total - 1 ? '' : 'disabled'}>▼</button>
        <button class="rpt-mini rpt-mini-del" title="刪除" onclick="removeReportSlide('${_rptEsc(s.id)}')"
                ${canEdit ? '' : 'disabled'}>×</button>
      </div>
    </div>`;
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
        await saveReportImage(id, dataUrl);
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
  renderReport();
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
  const img = getReportImage(s.id);
  const imgHtml = img
    ? `<img class="rpt-pp-img" src="${img}" alt="">`
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
  measure.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;';
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
