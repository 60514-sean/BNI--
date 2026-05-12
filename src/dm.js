// ===== DM =====
function _scaleDM() {
  const wrapper = document.querySelector('.dm-wrapper');
  if (!wrapper) return;
  const availW = wrapper.offsetWidth;
  const baseW = 900, baseH = 636;
  const scale = Math.min(1, availW / baseW);
  [['dmOuter1','dmSide1'],['dmOuter2','dmSide2']].forEach(([outerId, wrapId]) => {
    const outer = document.getElementById(outerId);
    const wrap  = document.getElementById(wrapId);
    if (!outer || !wrap) return;
    wrap.style.zoom = scale;
    outer.style.height = Math.round(baseH * scale) + 'px';
  });
}
window.addEventListener('resize', _scaleDM);
let _scrollRaf = false;
window.addEventListener('scroll', () => {
  if (_scrollRaf) return;
  _scrollRaf = true;
  requestAnimationFrame(() => {
    const btn = document.getElementById('backToTop');
    if (btn) btn.style.display = window.scrollY > 300 ? 'flex' : 'none';
    _scrollRaf = false;
  });
});

const DM_CAT_COLORS = ['#c0392b','#7b6914','#2e6e8e','#7b3f6a','#2e7d52','#b5631a','#5a4a8a','#4a7a5a','#8e3a3a','#3a6a7a'];
const DM_PANEL_W  = 225;   // px，每面板寬度（900px / 4）
const DM_PANEL_H  = 636;   // px，畫布高度
const DM_RED_MM   = 21.8;  // mm，P1-P2 底部禁區
const PX2MM = 297 / 636;   // px→mm 換算（面板高 297mm / 畫布高 636px）

// 公開 DM 網址（QR code 內容）
const DM_PUBLIC_URL = 'https://bni-weekly.vercel.app/dm-public.html?t=9k4r7p2m8x5v3t6y';

// 取得 DM 底圖 URL（優先自訂，否則預設本地檔）
function _dmBgSrc(panel) {
  if (typeof getDMBgUrl === 'function') return getDMBgUrl(panel);
  return 'dm_p' + panel + '.png';
}
const DM_QR_COLOR = '#c0392b';

// 建立 QR code 設定物件（給 qr-code-styling 用）
function _buildQRConfig(sizePx, asSvg) {
  return {
    width: sizePx,
    height: sizePx,
    type: asSvg ? 'svg' : 'canvas',
    data: DM_PUBLIC_URL,
    margin: 0,
    qrOptions: { errorCorrectionLevel: 'H' },
    dotsOptions:          { type: 'dots',           color: DM_QR_COLOR },
    cornersSquareOptions: { type: 'extra-rounded',  color: DM_QR_COLOR },
    cornersDotOptions:    { type: 'dot',            color: DM_QR_COLOR },
    backgroundOptions:    { color: '#ffffff' }
  };
}

// 在指定 DOM 容器渲染 QR code（用於螢幕預覽）
// 因為 qr-code-styling 不支援太小的尺寸，先渲染 200px，再用 CSS scale 縮到目標大小
function _renderQRInto(container, sizePx) {
  if (typeof QRCodeStyling === 'undefined') {
    console.error('[DM] QRCodeStyling 函式庫尚未載入');
    container.innerHTML = '<div style="font-size:9px;color:#c0392b;text-align:center;padding:6px;">QR 載入失敗</div>';
    return;
  }
  const RENDER_SIZE = 200;
  const scale = sizePx / RENDER_SIZE;
  container.style.width = sizePx + 'px';
  container.style.height = sizePx + 'px';
  container.style.overflow = 'hidden';
  container.innerHTML = '';
  const inner = document.createElement('div');
  inner.style.cssText = `width:${RENDER_SIZE}px;height:${RENDER_SIZE}px;transform:scale(${scale});transform-origin:top left;`;
  container.appendChild(inner);
  try {
    const qr = new QRCodeStyling(_buildQRConfig(RENDER_SIZE, false));
    qr.append(inner);
  } catch (e) {
    console.error('[DM] QR 渲染錯誤:', e);
  }
}

// 產生 QR code 並回傳 data URL（用於 PDF 嵌入）
async function _generateQRDataURL(sizePx) {
  if (typeof QRCodeStyling === 'undefined') {
    console.error('[DM] QRCodeStyling 函式庫尚未載入（PDF）');
    return '';
  }
  try {
    const qr = new QRCodeStyling(_buildQRConfig(sizePx, false));
    const blob = await qr.getRawData('png');
    if (!blob) return '';
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error('[DM] QR PDF 產生錯誤:', e);
    return '';
  }
}

// ===== DM 分配：6 個會員面板（P1,P2,P5,P6,P7,P8）=====
// 依面板高度比例平均分配人數，群組可跨面板分割，不限制產業鏈位置
function _dmDistribute() {
  const groups = {};
  _memberData.forEach(m => {
    const k = m.industry || m.specialty || '其他';
    if (!groups[k]) groups[k] = [];
    groups[k].push(m);
  });
  const colorMap = {};
  Object.keys(groups).forEach((k, i) => { colorMap[k] = DM_CAT_COLORS[i % DM_CAT_COLORS.length]; });

  const total = _memberData.length;
  // 等量分配：6 格目標人數相近，餘數從 P1 開始補
  const base = Math.floor(total / 6);
  const extra = total % 6;
  const TARGETS = Array.from({ length: 6 }, (_, i) => base + (i < extra ? 1 : 0));

  const panels = Array.from({ length: 6 }, () => []);

  // 隨機打亂群組順序，讓每次重整顯示不同排版
  const groupEntries = Object.entries(groups);
  for (let i = groupEntries.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [groupEntries[i], groupEntries[j]] = [groupEntries[j], groupEntries[i]];
  }

  // 分兩個獨立區域：Zone1=P1-P2，Zone2=P5-P8，群組不跨區
  const zone1Cap = TARGETS[0] + TARGETS[1];
  const zone1Groups = [], zone2Groups = [];
  let zone1Used = 0;
  for (const entry of groupEntries) {
    const size = entry[1].length;
    if (zone1Used + size <= zone1Cap) { zone1Groups.push(entry); zone1Used += size; }
    else zone2Groups.push(entry);
  }

  // 在指定面板集合內分配群組（整組放不下才切分）
  const fillZone = (entries, idxList) => {
    let pi = 0;
    for (const [spec, members] of entries) {
      let offset = 0;
      while (offset < members.length) {
        if (pi >= idxList.length) {
          const last = panels[idxList[idxList.length - 1]];
          const ex = last.find(g => g.spec === spec);
          if (ex) ex.members.push(...members.slice(offset));
          else last.push({ spec, members: members.slice(offset) });
          break;
        }
        const idx  = idxList[pi];
        const used = panels[idx].reduce((s, g) => s + g.members.length, 0);
        const rem  = TARGETS[idx] - used;
        const left = members.length - offset;
        if (rem <= 0) { pi++; continue; }
        if (left <= rem) {
          panels[idx].push({ spec, members: members.slice(offset) });
          offset = members.length;
          if (used + left >= TARGETS[idx]) pi++;
        } else {
          panels[idx].push({ spec, members: members.slice(offset, offset + rem) });
          offset += rem; pi++;
        }
      }
    }
  };

  fillZone(zone1Groups, [0, 1]);
  fillZone(zone2Groups, [2, 3, 4, 5]);

  // 各區內部重新平衡：把過滿格的完整群組搬到同區有空間的格子
  const rebalance = (idxList) => {
    for (let iter = 0; iter < 15; iter++) {
      let improved = false;
      for (let fi = idxList.length - 1; fi >= 1 && !improved; fi--) {
        const from = idxList[fi];
        const fromCount = panels[from].reduce((s, g) => s + g.members.length, 0);
        if (fromCount <= TARGETS[from]) continue;
        for (let ti = 0; ti < fi && !improved; ti++) {
          const to = idxList[ti];
          const avail = TARGETS[to] - panels[to].reduce((s, g) => s + g.members.length, 0);
          if (avail <= 0) continue;
          const movable = panels[from]
            .filter(g => g.members.length <= avail)
            .sort((a, b) => b.members.length - a.members.length);
          if (movable.length) {
            const grp = movable[0];
            panels[from] = panels[from].filter(g => g !== grp);
            panels[to].push(grp);
            improved = true;
          }
        }
      }
      if (!improved) break;
    }
  };

  rebalance([0, 1]);
  rebalance([2, 3, 4, 5]);

  return { panels, colorMap };
}

// cardH: fixed height per card (px, pre-zoom). Photo & font scale within it.
function _dmCardNew(m, bc, cardH, isLast) {
  const ps = Math.min(cardH - 4, Math.max(26, Math.min(36, cardH - 8)) + 8); // photo size, min +2mm
  const ph = m.photo
    ? `<img style="width:${ps}px;height:${ps}px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid ${bc};display:block;" src="${_escH(m.photo)}" onerror="this.style.display='none'">`
    : `<div style="width:${ps}px;height:${ps}px;border-radius:50%;flex-shrink:0;border:2px solid ${bc};background:#e8ecf0;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:${Math.round(ps*0.3)}px;font-weight:900;">?</div>`;
  const svcLines = cardH >= 48 ? 2 : 1;
  return `<div style="display:flex;gap:4px;align-items:center;${isLast?'':'border-bottom:1px solid rgba(0,0,0,0.07);'}min-height:${cardH}px;box-sizing:border-box;padding:2px 2px;">
    <div style="display:flex;align-items:center;flex-shrink:0;">${ph}</div>
    <div style="flex:1;min-width:0;padding:1px 0;">
      <div style="display:flex;align-items:baseline;gap:3px;justify-content:space-between;">
        <span style="font-size:8.5px;font-weight:900;color:#1a1a2e;line-height:1.2;">${_escH(m.name)}</span>
        ${m.specialty?`<span style="font-size:6.5px;font-weight:700;color:${bc};flex-shrink:0;">${_escH(m.specialty)}</span>`:''}
      </div>
      ${m.company?`<div style="font-size:7px;color:#777;line-height:1.2;word-break:break-all;">${_escH(m.company)}</div>`:''}
      ${m.phone?`<div style="font-size:7px;color:#555;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_escH(m.phone)}</div>`:''}
      ${m.service?`<div style="font-size:7px;font-weight:700;color:#222;line-height:1.25;">${_fmtService(m.service)}</div>`:''}
    </div>
  </div>`;
}

// availHPreZoom: overlay height before zoom
function _renderPanelHtml(panelData, colorMap, availHPreZoom) {
  if (!panelData || !panelData.length) return '';
  const numGroups = panelData.length;
  const hdrH = 14;
  const totalMembers = panelData.reduce((s, g) => s + g.members.length, 0);
  // MIN_CARD：最小可讀高度；MAX_CARD：人少時避免卡片過大
  const MIN_CARD = 22, MAX_CARD = 70;
  const cardH = Math.max(MIN_CARD, Math.min(MAX_CARD, Math.floor((availHPreZoom - numGroups * hdrH) / totalMembers)));
  return panelData.map(({spec, members}) => {
    const bc = colorMap[spec] || '#888';
    return `<div>
      <div style="height:${hdrH}px;display:flex;align-items:center;font-size:7.5px;font-weight:900;color:white;padding:0 5px;border-radius:2px;background:${bc};margin-bottom:0;">${_escH(spec)}</div>
      ${members.map((m, i) => _dmCardNew(m, colorMap[m.industry||m.specialty||'其他']||bc, cardH, i === members.length - 1)).join('')}
    </div>`;
  }).join('');
}

async function renderDM() {
  // 預先背景載入 PDF 函式庫，避免匯出時有延遲
  _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');

  const el = document.getElementById('dmContent');
  el.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text-soft);">載入中...</div>`;
  if (!_memberData) await fetchMembers();
  if (!_memberData) { el.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--red);">載入失敗，請重試</div>`; return; }
  // 確保 DM 底圖 URL 已載入（首次進入 DM 時觸發）
  if (typeof _dmBgUrls !== 'undefined' && _dmBgUrls === null && typeof fetchDMBgs === 'function') await fetchDMBgs();

  const { panels, colorMap } = _dmDistribute();
  // px/mm 換算比例
  const PX_H = 225 / 105; // 水平：面板225px = 105mm
  const PX_V = 636 / 297; // 垂直：畫布636px = 297mm
  const RED_TOP = Math.round(636 - 21.8 * PX_V); // P1-2 紅色禁區上界 ≈ 589px
  // 各面板邊距設定 (mm)：[left, right, top, bottom]
  const MG = [
    [10, 5,  10, 10], // P1
    [5,  5,  10, 10], // P2
    [10, 5,  10, 10], // P5
    [5,  5,  10, 10], // P6
    [5,  5,  10, 10], // P7
    [5,  10, 10, 10], // P8
  ];
  const dividers = [25,50,75].map(p=>`<div style="position:absolute;left:${p}%;top:0;width:1px;height:100%;background:rgba(0,0,0,0.15);z-index:5;"></div>`).join('');
  // pi: panel index(0-5), xi: x位置(0-3), isP12: 是否為P1-2面板
  const ov = (pi, xi, isP12) => {
    const [lmm, rmm, tmm, bmm] = MG[pi];
    const lPx = Math.round(lmm * PX_H);
    const rPx = Math.round(rmm * PX_H);
    const tPx = Math.round(tmm * PX_V);
    const bPx = Math.round(bmm * PX_V);
    const z   = isP12 ? 1.1 : 1.0;
    const x   = xi * 225 + lPx;
    const w   = 225 - lPx - rPx;
    const botY = isP12 ? Math.min(636 - bPx, RED_TOP) : (636 - bPx);
    const h   = botY - tPx;
    const preZW = Math.round(w / z);
    const preZH = Math.round(h / z);
    return `<div style="position:absolute;left:${x}px;top:${tPx}px;width:${w}px;height:${h}px;overflow:visible;outline:1.5px dashed rgba(192,57,43,0.45);outline-offset:-1px;z-index:10;">
      <div style="width:${preZW}px;zoom:${z};">
        ${_renderPanelHtml(panels[pi], colorMap, preZH)}
      </div>
    </div>`;
  };

  el.innerHTML = `<div class="dm-wrapper">
    <div class="card" style="margin-bottom:14px;padding:16px 20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:16px;font-weight:900;color:var(--text);">會員 DM</div>
          <div style="font-size:12px;color:var(--text-soft);margin-top:3px;">共 ${_memberData.length} 位會員</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="printDM()">匯出 PDF</button>
          <button class="btn" style="background:white;border:1.5px solid var(--gray-border);color:var(--text-soft);" onclick="openDMPreview()">預覽公開頁</button>
          <button class="btn" style="background:white;border:1.5px solid var(--gray-border);color:var(--text-soft);" onclick="renderDM()">換一種排法</button>
        </div>
      </div>
    </div>

    <div class="dm-panel-label">正面 A3（Page 1–4，左→右）</div>
    <div class="dm-scale-outer" id="dmOuter1">
      <div class="dm-bg-wrap" id="dmSide1">
        <img style="position:absolute;left:0;top:0;width:25%;height:100%;object-fit:fill;display:block;" src="${_dmBgSrc(1)}" alt="" crossorigin="anonymous">
        <img style="position:absolute;left:25%;top:0;width:25%;height:100%;object-fit:fill;display:block;" src="${_dmBgSrc(2)}" alt="" crossorigin="anonymous">
        <img style="position:absolute;left:50%;top:0;width:25%;height:100%;object-fit:fill;display:block;" src="${_dmBgSrc(3)}" alt="" crossorigin="anonymous">
        <img style="position:absolute;left:75%;top:0;width:25%;height:100%;object-fit:fill;display:block;" src="${_dmBgSrc(4)}" alt="" crossorigin="anonymous">
        ${dividers}
        <div id="dmQRPreview" style="position:absolute;left:828px;top:521px;width:48px;height:48px;display:flex;align-items:center;justify-content:center;z-index:8;">
          <div id="dmQRBox" style="width:48px;height:48px;"></div>
        </div>
        ${ov(0,0,true)}${ov(1,1,true)}
      </div>
    </div>

    <div style="font-size:11px;color:var(--text-soft);margin-top:6px;text-align:center;">↑ P4 含 QR Code（位置/大小可調整）</div>

    <div class="dm-panel-label" style="margin-top:16px;">背面 A3（Page 5–8，左→右）</div>
    <div class="dm-scale-outer" id="dmOuter2">
      <div class="dm-bg-wrap" id="dmSide2">
        <img style="position:absolute;left:0;top:0;width:25%;height:100%;object-fit:fill;display:block;" src="${_dmBgSrc(5)}" alt="" crossorigin="anonymous">
        <img style="position:absolute;left:25%;top:0;width:25%;height:100%;object-fit:fill;display:block;" src="${_dmBgSrc(6)}" alt="" crossorigin="anonymous">
        <img style="position:absolute;left:50%;top:0;width:25%;height:100%;object-fit:fill;display:block;" src="${_dmBgSrc(7)}" alt="" crossorigin="anonymous">
        <img style="position:absolute;left:75%;top:0;width:25%;height:100%;object-fit:fill;display:block;" src="${_dmBgSrc(8)}" alt="" crossorigin="anonymous">
        ${dividers}
        ${ov(2,0,false)}${ov(3,1,false)}${ov(4,2,false)}${ov(5,3,false)}
      </div>
    </div>
  </div>`;
  _scaleDM();
  // 在 P4 渲染 QR code
  const qrBox = document.getElementById('dmQRBox');
  if (qrBox) _renderQRInto(qrBox, 48);
}

function openDMPreview() {
  // 已開啟則不重複開
  if (document.getElementById('dmPreviewModal')) return;
  const overlay = document.createElement('div');
  overlay.id = 'dmPreviewModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:0;';
  overlay.innerHTML = `
    <div style="width:100%;max-width:480px;height:100%;display:flex;flex-direction:column;background:#f4f5f7;">
      <div style="display:flex;align-items:center;justify-content:space-between;background:#1a1a1a;color:white;padding:10px 14px;flex-shrink:0;">
        <div style="font-size:13px;font-weight:700;letter-spacing:1px;">公開頁預覽（來賓視角）</div>
        <div style="display:flex;gap:8px;">
          <button onclick="window.open('${DM_PUBLIC_URL}','_blank')" style="background:rgba(255,255,255,0.15);border:none;color:white;padding:5px 10px;border-radius:6px;font-size:12px;cursor:pointer;font-family:inherit;">新分頁開啟</button>
          <button onclick="closeDMPreview()" style="background:rgba(255,255,255,0.15);border:none;color:white;padding:5px 12px;border-radius:6px;font-size:14px;cursor:pointer;font-family:inherit;font-weight:700;">關閉 ✕</button>
        </div>
      </div>
      <iframe src="${DM_PUBLIC_URL}" style="flex:1;width:100%;border:none;background:white;"></iframe>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
}

function closeDMPreview() {
  document.getElementById('dmPreviewModal')?.remove();
  document.body.style.overflow = '';
}

function _loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

// 用 <a> 觸發 PDF blob 下載；桌機會直接下載，行動裝置在新分頁開啟（iOS Safari 不支援 download 屬性）
function _downloadPdfBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // 不加 target='_blank'：避免某些瀏覽器把 PDF 開到新分頁，導致原頁面 freeze/卡頓
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { try { a.remove(); URL.revokeObjectURL(url); } catch {} }, 2000);
}

async function printDM() {
  if (!_memberData) return;
  _pauseEditLock();
  showLoader(true, 'PDF 產生中...');

  try {
    await Promise.all([
      _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
      _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
    ]);
  } catch {
    showLoader(false);
    showToast('載入失敗，請確認網路連線');
    _resumeEditLock();
    return;
  }

  const { panels, colorMap } = _dmDistribute();
  const base = location.origin + location.pathname.replace(/[^/]*$/, '');

  const MG = [
    [10, 5,  10, 10],
    [5,  5,  10, 10],
    [10, 5,  10, 10],
    [5,  5,  10, 10],
    [5,  5,  10, 10],
    [5,  10, 10, 10],
  ];
  const RED_MM = 297 - DM_RED_MM;
  const HDR_MM = +(14 * PX2MM).toFixed(2);
  const MIN_CARD_MM = +(30 * PX2MM).toFixed(2);

  const pCard = (m, bc, rendCardH_mm, z, isLast) => {
    const preZCardH = rendCardH_mm / z;
    const psPre = Math.max(22 * PX2MM + 2, Math.min(36 * PX2MM, preZCardH - 8 * PX2MM)) + 4;
    const psMm     = +(psPre * z).toFixed(2);
    const nameMm   = +(8.5 * PX2MM * z).toFixed(2);
    const spMm     = +(6.5 * PX2MM * z).toFixed(2);
    const smMm     = +(7   * PX2MM * z).toFixed(2);
    const gapMm    = +(4   * PX2MM * z).toFixed(2);
    const borderMm = +(2   * PX2MM * z).toFixed(2);
    const padMm    = +(2   * PX2MM * z).toFixed(2);
    const ph = m.photo
      ? `<img style="width:${psMm}mm;height:${psMm}mm;border-radius:50%;object-fit:cover;flex-shrink:0;border:${borderMm}mm solid ${bc};display:block;" src="${_escH(m.photo)}" crossorigin="anonymous" onerror="this.style.display='none'">`
      : `<div style="width:${psMm}mm;height:${psMm}mm;border-radius:50%;flex-shrink:0;border:${borderMm}mm solid ${bc};background:#e8ecf0;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:${+(psMm*0.3).toFixed(2)}mm;font-weight:900;">?</div>`;
    return `<div style="display:flex;gap:${gapMm}mm;align-items:center;${isLast?'':'border-bottom:1pt solid rgba(0,0,0,0.07);'}min-height:${rendCardH_mm}mm;box-sizing:border-box;padding:${padMm}mm ${padMm}mm;">
      <div style="display:flex;align-items:center;flex-shrink:0;">${ph}</div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:baseline;gap:${+(1.5*PX2MM*z).toFixed(2)}mm;justify-content:space-between;">
          <span style="font-size:${nameMm}mm;font-weight:900;color:#1a1a2e;line-height:1.2;">${_escH(m.name)}</span>
          ${m.specialty?`<span style="font-size:${spMm}mm;font-weight:700;color:${bc};flex-shrink:0;">${_escH(m.specialty)}</span>`:''}
        </div>
        ${m.company?`<div style="font-size:${smMm}mm;color:#777;line-height:1.2;word-break:break-all;">${_escH(m.company)}</div>`:''}
        ${m.phone?`<div style="font-size:${smMm}mm;color:#555;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_escH(m.phone)}</div>`:''}
        ${m.service?`<div style="font-size:${smMm}mm;font-weight:700;color:#222;line-height:1.25;">${_fmtService(m.service)}</div>`:''}
      </div>
    </div>`;
  };

  const pPanel = (pi, hMm, z) => {
    if (!panels[pi] || !panels[pi].length) return '';
    const numGroups = panels[pi].length;
    const totalMembers = panels[pi].reduce((s, g) => s + g.members.length, 0);
    const preZH = hMm / z;
    const MAX_CARD_MM = 70 * PX2MM;
    const cardH = Math.max(MIN_CARD_MM, Math.min(MAX_CARD_MM, Math.floor((preZH - numGroups * HDR_MM) / totalMembers * 10) / 10));
    const rendHdr  = +(HDR_MM * z).toFixed(2);
    const rendCard = +(cardH  * z).toFixed(2);
    const hdrFontMm = +(7.5 * PX2MM * z).toFixed(2);
    return panels[pi].map(({spec, members}) => {
      const bc = colorMap[spec] || '#888';
      return `<div>
        <div style="height:${rendHdr}mm;display:flex;align-items:center;font-size:${hdrFontMm}mm;font-weight:900;color:white;padding:0 ${+(2*PX2MM*z).toFixed(2)}mm;border-radius:0.5mm;background:${bc};">${_escH(spec)}</div>
        ${members.map((m, i) => pCard(m, colorMap[m.industry||m.specialty||'其他']||bc, rendCard, z, i === members.length - 1)).join('')}
      </div>`;
    }).join('');
  };

  const ovP12 = (pi, xi) => {
    const [lmm, rmm, tmm] = MG[pi];
    const x = xi * 105 + lmm;
    const w = 105 - lmm - rmm;
    const h = +(Math.min(297 - MG[pi][3], RED_MM) - tmm).toFixed(2);
    return `<div style="position:absolute;left:${x}mm;top:${tmm}mm;width:${w}mm;height:${h}mm;overflow:hidden;">${pPanel(pi, h, 1.1)}</div>`;
  };
  const ovP58 = (pi, xi) => {
    const [lmm, rmm, tmm, bmm] = MG[pi];
    const x = xi * 105 + lmm;
    const w = 105 - lmm - rmm;
    const h = +(297 - tmm - bmm).toFixed(2);
    return `<div style="position:absolute;left:${x}mm;top:${tmm}mm;width:${w}mm;height:${h}mm;overflow:hidden;">${pPanel(pi, h, 1.0)}</div>`;
  };
  const bg = (n, xmm) => {
    const customUrl = (typeof getDMBgUrl === 'function') ? getDMBgUrl(n) : null;
    const url = (customUrl && customUrl.indexOf('dm_p') !== 0) ? customUrl : (base + 'dm_p' + n + '.png');
    return `<img style="position:absolute;left:${xmm}mm;top:0;width:105mm;height:297mm;object-fit:fill;display:block;" src="${url}" crossorigin="anonymous">`;
  };

  // 為 P4 產生 QR code（PDF 版本，較高解析度）
  // 新版 P4 底圖紅框位置：left=382mm, top=240mm, 寬 29mm × 高 27mm
  const qrDataUrl = await _generateQRDataURL(400);
  const qrSizeMm = 21;
  // 新版 P4 紅框位置：64.3%~93.0% 水平 / 81.5%~90.0% 垂直
  const qrBoxX = 382.5;
  const qrBoxY = 242;
  const qrBoxW = 30;
  const qrBoxH = 25;
  const qrX = +(qrBoxX + (qrBoxW - qrSizeMm) / 2).toFixed(2);
  const qrY = +(qrBoxY + (qrBoxH - qrSizeMm) / 2).toFixed(2);
  const qrOverlay = qrDataUrl
    ? `<img src="${qrDataUrl}" style="position:absolute;left:${qrX}mm;top:${qrY}mm;width:${qrSizeMm}mm;height:${qrSizeMm}mm;display:block;">`
    : '';

  const pages = [
    `${bg(1,0)}${bg(2,105)}${bg(3,210)}${bg(4,315)}${ovP12(0,0)}${ovP12(1,1)}${qrOverlay}`,
    `${bg(5,0)}${bg(6,105)}${bg(7,210)}${bg(8,315)}${ovP58(2,0)}${ovP58(3,1)}${ovP58(4,2)}${ovP58(5,3)}`
  ];

  // 建立隱藏渲染容器
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:-9999px;top:0;';
  const pageEl = document.createElement('div');
  pageEl.style.cssText = "position:relative;width:420mm;height:297mm;overflow:hidden;background:white;font-family:'Noto Sans TC','Microsoft JhengHei',sans-serif;";
  wrap.appendChild(pageEl);
  document.body.appendChild(wrap);

  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!jsPDFCtor) { showToast('jsPDF 初始化失敗'); document.body.removeChild(wrap); showLoader(false); _resumeEditLock(); return; }
  const doc = new jsPDFCtor({ orientation: 'landscape', unit: 'mm', format: 'a3', compress: true });

  try {
    for (let i = 0; i < 2; i++) {
      pageEl.innerHTML = pages[i];
      // 等待所有圖片載入
      await Promise.all([...pageEl.querySelectorAll('img')].map(img =>
        img.complete ? Promise.resolve() :
        new Promise(r => { img.onload = r; img.onerror = r; })
      ));
      const canvas = await html2canvas(pageEl, {
        scale: 1.5,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: '#ffffff'
      });
      if (i > 0) doc.addPage();
      doc.addImage(canvas.toDataURL('image/jpeg', 0.78), 'JPEG', 0, 0, 420, 297);
    }
    _downloadPdfBlob(doc.output('blob'), 'BNI-億展分會-會員名錄.pdf');
    showToast('PDF 已下載');
  } catch {
    showToast('PDF 產生失敗，請重試');
  } finally {
    document.body.removeChild(wrap);
    showLoader(false);
    _resumeEditLock();
  }
}

