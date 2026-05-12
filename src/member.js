// ===== MEMBER =====
const MEMBER_CSV = 'https://docs.google.com/spreadsheets/d/1vaunMiu-soVacqsbvRxY1dDQ2ZLBghv0t9rTer3KdP0/export?format=csv&gid=466594149';
let _memberData = null;

const MEMBER_ORDER = [
  '黃愷訢','蔡志銘','蔡秀敏','林庭秀','蔡忠翰','郭懷憶','陳韋辰','謝秋霞',
  '鄭湘蓁','高靜觀','張宥瑩','康竣傑','方爰心','黃沛晴','陳麗安','余佳華',
  '潘禾家','金萱蓉','蔡佳霖','林惠雯','李蕙如','黃韋廸','温智翔','曹文豪',
  '江子揚','劉庭君','葉淑娟','蔡仲博','張育菁','郭霈蓉','吳少宇','劉珮汝',
  '李語婕','魏純雅','郭郁祥','陳柏豪','薛祐謙','王秋舒','林淑媛','李俐臻',
  '許孝群','黃蘭婷','王怡琳','李姵禎','馮士維','龍映庭','謝宗憲'
];
const _MEMBER_ORDER_MAP = MEMBER_ORDER.reduce((m, n, i) => (m[n] = i, m), {});

function _parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i+1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQ = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQ = true; }
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else { field += c; }
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function fetchMembers() {
  document.getElementById('memberContent').innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text-soft);">載入中...</div>`;
  try {
    const r = await fetch(MEMBER_CSV + '&t=' + Date.now());
    const rows = _parseCSV(await r.text());
    if (rows.length < 2) { _memberData = []; return; }
    const headers = rows[0];
    const idx = name => headers.findIndex(h => h.includes(name));
    const iName = idx('姓名'), iSpec = idx('專業別'), iComp = idx('公司'), iPhone = idx('電話'), iServ = idx('服務');
    const iDays = idx('到期續約天數'), iDate = idx('到期日');
    const iApply = idx('申請書'), iPay = idx('繳費'), iComplete = idx('完成續約'), iRibbon = idx('綢帶');
    const iCeremony = idx('感言');
    const iPhoto = idx('照片連結');
    const iInd = idx('產業鏈');
    const iBirthday = idx('生日');
    const iSlogan = idx('口號');
    const iPlates = idx('車牌');
    const iWebsite = idx('官網');
    const iGender = idx('性別');

    _memberData = rows.slice(1)
      .map((r, i) => ({
        sheetRow:    i + 2,
        name:        r[iName]?.trim()     || '',
        specialty:   r[iSpec]?.trim()     || '',
        industry:    iInd >= 0 ? (r[iInd]?.trim() || '') : '',
        birthday:    iBirthday >= 0 ? (r[iBirthday]?.trim() || '') : '',
        slogan:      iSlogan >= 0 ? (r[iSlogan]?.trim() || '') : '',
        plates:      iPlates >= 0 ? (r[iPlates]?.trim() || '') : '',
        website:     iWebsite >= 0 ? (r[iWebsite]?.trim() || '') : '',
        gender:      iGender >= 0 ? (r[iGender]?.trim() || '') : '',
        company:     r[iComp]?.trim()     || '',
        phone:       r[iPhone]?.trim()    || '',
        service:     r[iServ]?.trim()     || '',
        photo:       r[iPhoto]?.trim()    || '',
        renewDays:   r[iDays]?.trim()     || '',
        renewDate:   r[iDate]?.trim()     || '',
        renewApply:  r[iApply]?.trim()    || '',
        renewPay:    r[iPay]?.trim()      || '',
        renewComplete: r[iComplete]?.trim() || '',
        renewRibbon: r[iRibbon]?.trim()   || '',
        ceremonyDate: iCeremony >= 0 ? (r[iCeremony]?.trim() || '') : '',
      }))
      .filter(m => m.name);

    const BIG = MEMBER_ORDER.length;
    _memberData.sort((a, b) => {
      const ai = _MEMBER_ORDER_MAP[a.name];
      const bi = _MEMBER_ORDER_MAP[b.name];
      const av = ai === undefined ? BIG : ai;
      const bv = bi === undefined ? BIG : bi;
      if (av !== bv) return av - bv;
      return a.sheetRow - b.sheetRow;
    });
  } catch(e) {
    document.getElementById('memberContent').innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--red);">載入失敗，請重試</div>`;
    _memberData = null;
  }
}

let _memberSearch = '';
let _memberBirthMonth = ''; // '' | '1' .. '12'
let _defaultIndustry = '';
let _industries = (() => {
  if (cache['__industries__'] && cache['__industries__'].length) return cache['__industries__'];
  const old = JSON.parse(localStorage.getItem('bni_industries') || '[]');
  // 若有舊 localStorage 資料但伺服器尚無，自動遷移上傳
  if (old.length) setTimeout(() => apiSave('__industries__', old), 500);
  return old;
})();
// 背景刷新完成後同步最新伺服器資料
_bgRefresh().then(() => {
  if (cache['__industries__'] && cache['__industries__'].length) _industries = cache['__industries__'];
});

function _saveIndustries() {
  apiSave('__industries__', _industries);
}

function _getIndustryOptions(selected) {
  const fromData = _memberData ? [...new Set(_memberData.map(m => m.industry).filter(Boolean))] : [];
  const merged = [...new Set([..._industries, ...fromData])];
  return `<option value="">-- 選擇產業鏈 --</option>` +
    merged.map(ind => `<option value="${_escH(ind)}"${ind===selected?' selected':''}>${_escH(ind)}</option>`).join('');
}

function openManageIndustries() {
  if (cache['__industries__'] && cache['__industries__'].length) _industries = cache['__industries__'];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'industryModal';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:340px;">
      <div class="modal-title">產業鏈管理</div>
      <div id="industryList" style="margin-bottom:14px;max-height:280px;overflow-y:auto;"></div>
      <div style="display:flex;gap:8px;">
        <input class="modal-input" id="industryNewInput" placeholder="輸入新產業鏈名稱" style="margin-bottom:0;flex:1;" onkeydown="if(event.key==='Enter')addIndustry()">
        <button onclick="addIndustry()" style="padding:10px 16px;background:var(--red);color:white;border:none;border-radius:var(--radius-sm);font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;">新增</button>
      </div>
      <div class="modal-btns" style="margin-top:16px;">
        <button class="modal-cancel" style="width:100%;" onclick="document.getElementById('industryModal').remove()">關閉</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  _renderIndustryList();
  // 背景取得最新伺服器資料，如有更新則重新渲染清單
  _bgRefresh().then(() => {
    if (cache['__industries__'] && cache['__industries__'].length) {
      _industries = cache['__industries__'];
      _renderIndustryList();
    }
  });
}

function _renderIndustryList() {
  const el = document.getElementById('industryList');
  if (!el) return;
  if (_industries.length === 0) {
    el.innerHTML = `<div style="color:var(--text-soft);font-size:13px;text-align:center;padding:12px;">尚無產業鏈，請新增</div>`;
    return;
  }
  el.innerHTML = _industries.map((ind, i) => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gray-border);">
      <span style="font-size:14px;">${_escH(ind)}</span>
      <button onclick="removeIndustry(${i})" style="padding:3px 10px;background:white;border:1.5px solid #e74c3c;color:#e74c3c;border-radius:6px;font-size:12px;cursor:pointer;font-family:inherit;">刪除</button>
    </div>`).join('');
}

function _renderIndustryListSettings() {
  const el = document.getElementById('industryListSettings');
  if (!el) return;
  // 進入設定頁時先從 cache 同步最新（跨裝置同步用）
  if (cache['__industries__'] && Array.isArray(cache['__industries__'])) {
    _industries = cache['__industries__'];
  }
  if (_industries.length === 0) {
    el.innerHTML = `<div style="color:var(--text-soft);font-size:13px;text-align:center;padding:12px;">尚無產業鏈，請新增</div>`;
  } else {
    el.innerHTML = _industries.map((ind, i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gray-border);">
        <span style="font-size:14px;">${_escH(ind)}</span>
        <button onclick="removeIndustry(${i})" style="padding:3px 10px;background:white;border:1.5px solid #e74c3c;color:#e74c3c;border-radius:6px;font-size:12px;cursor:pointer;font-family:inherit;">刪除</button>
      </div>`).join('');
  }
  // 主動呼叫一次 _bgRefresh，拿雲端最新資料後再重渲染（跨裝置即時同步）
  _bgRefresh().then(() => {
    if (cache['__industries__'] && Array.isArray(cache['__industries__'])) {
      const fresh = cache['__industries__'];
      // 若雲端與目前不同，更新並重渲染
      if (JSON.stringify(fresh) !== JSON.stringify(_industries)) {
        _industries = fresh;
        const el2 = document.getElementById('industryListSettings');
        if (el2) {
          if (_industries.length === 0) {
            el2.innerHTML = `<div style="color:var(--text-soft);font-size:13px;text-align:center;padding:12px;">尚無產業鏈，請新增</div>`;
          } else {
            el2.innerHTML = _industries.map((ind, i) => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gray-border);">
                <span style="font-size:14px;">${_escH(ind)}</span>
                <button onclick="removeIndustry(${i})" style="padding:3px 10px;background:white;border:1.5px solid #e74c3c;color:#e74c3c;border-radius:6px;font-size:12px;cursor:pointer;font-family:inherit;">刪除</button>
              </div>`).join('');
          }
        }
      }
    }
  });
}

function addIndustry() {
  const val = document.getElementById('industryNewInput')?.value.trim();
  if (!val || _industries.includes(val)) return;
  _industries.push(val);
  _saveIndustries();
  document.getElementById('industryNewInput').value = '';
  _renderIndustryList();
  _renderIndustryListSettings();
}

function addIndustryFromSettings() {
  const val = document.getElementById('industryNewInputSettings')?.value.trim();
  if (!val || _industries.includes(val)) return;
  _industries.push(val);
  _saveIndustries();
  document.getElementById('industryNewInputSettings').value = '';
  _renderIndustryListSettings();
  _renderIndustryList();
}

function removeIndustry(i) {
  _industries.splice(i, 1);
  _saveIndustries();
  _renderIndustryList();
  _renderIndustryListSettings();
}

async function renderMembers() {
  if (!_memberData) await fetchMembers();
  if (!_memberData) return;
  let list = _memberData;
  if (_memberBirthMonth) list = list.filter(m => {
    if (!m.birthday) return false;
    const parts = m.birthday.split('/');
    if (parts.length !== 3) return false;
    return parseInt(parts[1]) === parseInt(_memberBirthMonth);
  });
  const canEdit = CR === 'admin';
  const selectStyle = `padding:7px 10px;border:1.5px solid var(--gray-border);border-radius:7px;font-size:13px;font-family:inherit;color:var(--text-soft);background:white;cursor:pointer;`;
  const monthOpts = ['<option value="">生日月份（全部）</option>']
    .concat([1,2,3,4,5,6,7,8,9,10,11,12].map(m => `<option value="${m}"${String(m)===_memberBirthMonth?' selected':''}>${m} 月生日</option>`)).join('');
  const parts = [];
  parts.push(`<div style="display:flex;gap:8px;margin-bottom:14px;align-items:center;">
    <input class="member-search" type="text" placeholder="搜尋姓名、專業別、公司..." value="${_escH(_memberSearch)}" oninput="_memberSearch=this.value;_debouncedFilterMembers()" autocomplete="off" style="margin-bottom:0;flex:1;">
    <button onclick="_memberData=null;renderMembers()" style="flex-shrink:0;padding:11px 14px;background:white;border:1.5px solid var(--gray-border);border-radius:var(--radius-sm);cursor:pointer;font-size:13px;font-family:inherit;color:var(--text-soft);">重整</button>
  </div>`);
  parts.push(`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
    <span id="memberCount" style="font-size:13px;color:var(--text-soft);">${list.length} 位會員</span>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
      <select onchange="_memberBirthMonth=this.value;renderMembers()" style="${selectStyle}">${monthOpts}</select>
      ${canEdit ? `<button onclick="openAddMember()" style="padding:7px 16px;background:var(--red);color:white;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">+ 新增會員</button>` : ''}
    </div>
  </div>`);
  parts.push(`<div class="member-grid">`);
  for (let k = 0; k < list.length; k++) {
    const m = list[k];
    const days = parseInt(m.renewDays);
    const daysBg    = days>=120?'#eaf7ee':days>=90?'#fef9e7':'#fdecea';
    const daysColor = days>=120?'#27ae60':days>=90?'#d4ac0d':'#c0392b';
    const _ds = [m.name,m.specialty,m.company,m.industry,m.service].filter(Boolean).join(' ').toLowerCase();
    parts.push(`<div class="member-card" data-search="${_escH(_ds)}" style="flex-direction:column;gap:0;padding:0;overflow:hidden;align-items:stretch;justify-content:flex-start;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:16px 16px 12px;">
        ${(() => {
          const url = _memberPhotoUrl(m);
          return url
            ? `<img src="${_escH(url)}" loading="lazy" decoding="async" style="width:60px;height:60px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2.5px solid var(--red);background:#fff;" onerror="this.style.display='none'">`
            : `<div style="width:60px;height:60px;border-radius:50%;flex-shrink:0;background:#e8ecf0;border:2.5px solid var(--red);box-sizing:border-box;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:22px;font-weight:900;">?</div>`;
        })()}
        <div style="flex:1;min-width:0;">
          ${m.specialty?`<div style="margin-bottom:6px;"><span style="display:inline-block;background:var(--red);color:white;font-size:11px;font-weight:900;padding:3px 12px;border-radius:20px;letter-spacing:0.5px;">${_escH(m.specialty)}</span></div>`:''}
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
            <span class="member-name" style="margin:0;">${_escH(m.name)}</span>
            ${m.industry?`<span class="member-specialty">${_escH(m.industry)}</span>`:''}
          </div>
          <div class="member-row" style="margin-bottom:3px;">${_escH(m.company)}</div>
          <div class="member-row" style="margin-bottom:3px;"><a class="member-phone-link" href="tel:${_escH(m.phone)}">${_escH(m.phone)}</a></div>
          <div class="member-row" style="font-size:12px;">${_escH(m.service)}</div>
        </div>
        ${canEdit?`<button class="member-edit-btn" style="flex-shrink:0;" data-row="${m.sheetRow}" onclick="openEditMember(this.dataset.row)">編輯</button>`:''}
      </div>
      <div style="border-top:1px solid var(--gray-border);padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:8px;background:#fafbfc;flex-wrap:wrap;">
        <span style="font-size:12px;color:var(--text-soft);display:flex;gap:10px;flex-wrap:wrap;">
          ${m.birthday?`<span>生日：${_escH(m.birthday)}</span>`:''}
          ${m.renewDate?`<span>到期：${_escH(m.renewDate)}</span>`:''}
        </span>
        <div style="display:flex;align-items:center;gap:6px;">
          ${m.renewDays?`<span style="font-size:12px;font-weight:700;padding:2px 10px;border-radius:20px;background:${daysBg};color:${daysColor};">${_escH(m.renewDays)}天</span>`:''}
        </div>
      </div>
    </div>`);
  }
  if (list.length === 0) parts.push(`<div style="text-align:center;padding:48px 20px;color:var(--text-soft);">查無符合條件的會員</div>`);
  parts.push(`<div id="memberNoResult" style="display:none;text-align:center;padding:48px 20px;color:var(--text-soft);">查無搜尋結果</div></div>`);
  document.getElementById('memberContent').innerHTML = parts.join('');
  _filterMemberCards();
}

function _filterMemberCards() {
  const q = _memberSearch.trim().toLowerCase();
  const cards = document.querySelectorAll('#memberContent .member-card[data-search]');
  let shown = 0;
  cards.forEach(c => {
    const match = !q || c.dataset.search.includes(q);
    c.style.display = match ? '' : 'none';
    if (match) shown++;
  });
  const noRes = document.getElementById('memberNoResult');
  if (noRes) noRes.style.display = (q && shown === 0) ? '' : 'none';
  const countEl = document.getElementById('memberCount');
  if (countEl) countEl.textContent = (q ? shown : cards.length) + ' 位會員';
}
const _debouncedFilterMembers = _debounce(_filterMemberCards, 100);

function _escH(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// 取得會員大頭照 URL：若沒上傳照片，依性別回傳預設圖；都沒就回空字串
function _memberPhotoUrl(m) {
  if (m && m.photo) return m.photo;
  if (m && (m.gender === '男' || m.gender === 'M')) return 'default-male.png';
  if (m && (m.gender === '女' || m.gender === 'F')) return 'default-female.png';
  return '';
}

function _fmtService(s) {
  // 斷行只發生在最後一個標點符號之後：最後標點前（含標點）不斷，之後的文字整體移到下一行
  const text = String(s);
  const m = text.match(/^([\s\S]*[、，。；,;])([\s\S]+)$/);
  if (!m) return _escH(text);
  return `<span style="white-space:nowrap">${_escH(m[1])}</span><span style="white-space:nowrap">${_escH(m[2])}</span>`;
}

// ===== 車牌動態列：以 "|" 分隔多個車牌存於 Sheet「車牌」欄 =====
function _buildPlateRows(platesStr) {
  const arr = (platesStr || '').split('|').map(s => s.trim()).filter(Boolean);
  if (arr.length === 0) arr.push('');
  return arr.map(p => _plateRowHtml(p)).join('');
}
function _plateRowHtml(value) {
  return `<div class="mf-plate-row" style="display:flex;gap:6px;margin-bottom:6px;">
    <input class="modal-input mf-plate-input" value="${_escH(value)}" placeholder="例：ABC-1234" style="margin-bottom:0;flex:1;">
    <button type="button" onclick="removePlateRow(this)" style="padding:0 12px;background:white;border:1.5px solid #e74c3c;color:#e74c3c;border-radius:6px;cursor:pointer;font-family:inherit;font-size:16px;font-weight:700;line-height:1;">×</button>
  </div>`;
}
function addPlateRow() {
  const box = document.getElementById('mf_plates_box');
  if (!box) return;
  box.insertAdjacentHTML('beforeend', _plateRowHtml(''));
  const inputs = box.querySelectorAll('.mf-plate-input');
  inputs[inputs.length - 1].focus();
}
function removePlateRow(btn) {
  const row = btn.closest('.mf-plate-row');
  const box = row?.parentElement;
  if (!row || !box) return;
  row.remove();
  if (box.children.length === 0) box.insertAdjacentHTML('beforeend', _plateRowHtml(''));
}
function _collectPlates() {
  const inputs = document.querySelectorAll('#mf_plates_box .mf-plate-input');
  return [...inputs].map(i => i.value.trim()).filter(Boolean).join('|');
}

function openEditMember(sheetRow) {
  sheetRow = parseInt(sheetRow);
  const m = _memberData.find(x => x.sheetRow === sheetRow);
  if (!m) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'memberModal';
  overlay.innerHTML = `
    <div class="modal-box">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <div class="modal-title" style="margin-bottom:0;">編輯會員資料</div>
        <button onclick="confirmDeleteMemberByRow(${sheetRow},'${_escH(m.name)}')" style="padding:5px 12px;background:white;border:1.5px solid #e74c3c;color:#e74c3c;border-radius:6px;font-size:13px;cursor:pointer;font-family:inherit;font-weight:600;">刪除</button>
      </div>
      <div class="modal-field">
        <div class="modal-label">大頭照</div>
        <div style="display:flex;align-items:center;gap:14px;">
          <img id="mf_photo_preview" src="${_escH(m.photo)}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:2.5px solid #c0392b;background:#eee;flex-shrink:0;" onerror="this.style.visibility='hidden'">
          <div>
            <input type="file" id="mf_photo_file" accept="image/*" style="display:none" onchange="previewPhoto(this,'mf_photo_preview')">
            <button onclick="document.getElementById('mf_photo_file').click()" style="padding:7px 14px;background:white;border:1.5px solid var(--gray-border);border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit;">更換照片</button>
          </div>
        </div>
      </div>
      <div class="modal-field"><div class="modal-label">姓名</div><input class="modal-input" id="mf_name" value="${_escH(m.name)}"></div>
      <div class="modal-field"><div class="modal-label">性別（未上傳照片時決定預設大頭照）</div><select class="modal-input" id="mf_gender" style="appearance:auto;background:white;">
        <option value=""${!m.gender?' selected':''}>未填</option>
        <option value="男"${m.gender==='男'?' selected':''}>男</option>
        <option value="女"${m.gender==='女'?' selected':''}>女</option>
      </select></div>
      <div class="modal-field"><div class="modal-label">產業鏈（DM分組標題）</div><select class="modal-input" id="mf_ind" style="appearance:auto;background:white;">${_getIndustryOptions(m.industry)}</select></div>
      <div class="modal-field"><div class="modal-label">專業別</div><input class="modal-input" id="mf_spec" value="${_escH(m.specialty)}"></div>
      <div class="modal-field"><div class="modal-label">生日（民國/月/日，例：80/5/15）</div><input class="modal-input" id="mf_birthday" value="${_escH(m.birthday)}" placeholder="例：80/5/15"></div>
      <div class="modal-field"><div class="modal-label">口號</div><input class="modal-input" id="mf_slogan" value="${_escH(m.slogan)}" placeholder="個人口號 / Slogan"></div>
      <div class="modal-field">
        <div class="modal-label">車牌（多台車可新增）</div>
        <div id="mf_plates_box">${_buildPlateRows(m.plates)}</div>
        <button type="button" onclick="addPlateRow()" style="margin-top:4px;padding:7px 14px;background:white;border:1.5px dashed var(--gray-border);color:var(--text-soft);border-radius:6px;cursor:pointer;font-family:inherit;font-size:13px;">+ 新增車牌</button>
      </div>
      <div class="modal-field"><div class="modal-label">公司或品牌名稱</div><input class="modal-input" id="mf_comp" value="${_escH(m.company)}"></div>
      <div class="modal-field"><div class="modal-label">電話</div><input class="modal-input" id="mf_phone" type="tel" value="${_escH(m.phone)}"></div>
      <div class="modal-field"><div class="modal-label">官網（DM 公開頁顯示連結）</div><input class="modal-input" id="mf_website" type="url" value="${_escH(m.website)}" placeholder="https://example.com"></div>
      <div class="modal-field"><div class="modal-label">服務項目</div><input class="modal-input" id="mf_serv" value="${_escH(m.service)}"></div>
      <div class="modal-btns">
        <button class="modal-save" onclick="saveMemberEdit(${sheetRow})">儲存</button>
        <button class="modal-cancel" onclick="closeEditMember()">取消</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function confirmDeleteMemberByRow(sheetRow, name) {
  closeEditMember();
  deleteMember(parseInt(sheetRow), name);
}

function closeEditMember() {
  document.getElementById('memberModal')?.remove();
}

function openAddMember() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'memberModal';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">新增會員</div>
      <div class="modal-field">
        <div class="modal-label">大頭照</div>
        <div style="display:flex;align-items:center;gap:14px;">
          <div id="mf_photo_preview" style="width:72px;height:72px;border-radius:50%;background:#e8ecf0;border:2.5px solid #c0392b;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:28px;flex-shrink:0;">?</div>
          <div>
            <input type="file" id="mf_photo_file" accept="image/*" style="display:none" onchange="previewPhotoNew(this)">
            <button onclick="document.getElementById('mf_photo_file').click()" style="padding:7px 14px;background:white;border:1.5px solid var(--gray-border);border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit;">上傳照片</button>
          </div>
        </div>
      </div>
      <div class="modal-field"><div class="modal-label">姓名</div><input class="modal-input" id="mf_name" placeholder="輸入姓名"></div>
      <div class="modal-field"><div class="modal-label">性別（未上傳照片時決定預設大頭照）</div><select class="modal-input" id="mf_gender" style="appearance:auto;background:white;">
        <option value="" selected>未填</option>
        <option value="男">男</option>
        <option value="女">女</option>
      </select></div>
      <div class="modal-field"><div class="modal-label">產業鏈（DM分組標題）</div><select class="modal-input" id="mf_ind" style="appearance:auto;background:white;">${_getIndustryOptions(_defaultIndustry)}</select></div>
      <div class="modal-field"><div class="modal-label">專業別</div><input class="modal-input" id="mf_spec" placeholder="輸入專業別"></div>
      <div class="modal-field"><div class="modal-label">生日（民國/月/日，例：80/5/15）</div><input class="modal-input" id="mf_birthday" placeholder="例：80/5/15"></div>
      <div class="modal-field"><div class="modal-label">口號</div><input class="modal-input" id="mf_slogan" placeholder="個人口號 / Slogan"></div>
      <div class="modal-field">
        <div class="modal-label">車牌（多台車可新增）</div>
        <div id="mf_plates_box">${_buildPlateRows('')}</div>
        <button type="button" onclick="addPlateRow()" style="margin-top:4px;padding:7px 14px;background:white;border:1.5px dashed var(--gray-border);color:var(--text-soft);border-radius:6px;cursor:pointer;font-family:inherit;font-size:13px;">+ 新增車牌</button>
      </div>
      <div class="modal-field"><div class="modal-label">公司或品牌名稱</div><input class="modal-input" id="mf_comp" placeholder="輸入公司或品牌名稱"></div>
      <div class="modal-field"><div class="modal-label">電話</div><input class="modal-input" id="mf_phone" type="tel" placeholder="輸入電話"></div>
      <div class="modal-field"><div class="modal-label">官網（DM 公開頁顯示連結）</div><input class="modal-input" id="mf_website" type="url" placeholder="https://example.com"></div>
      <div class="modal-field"><div class="modal-label">服務項目</div><input class="modal-input" id="mf_serv" placeholder="輸入服務項目"></div>
      <div style="border-top:1px solid var(--gray-border);margin:14px 0 10px;padding-top:12px;">
        <div class="modal-label" style="margin-bottom:10px;">續約資訊</div>
        <div class="modal-field"><div class="modal-label">到期日</div><input class="modal-input" id="mf_renewDate" placeholder="例：2027/2/1"></div>
      </div>
      <div class="modal-btns">
        <button class="modal-save" onclick="addMember()">新增</button>
        <button class="modal-cancel" onclick="closeEditMember()">取消</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function addMember() {
  const name = document.getElementById('mf_name').value.trim();
  if (!name) { showToast('請輸入姓名'); return; }
  const photoFile = document.getElementById('mf_photo_file')?.files[0];
  const predictedRow = (_memberData && _memberData.length > 0)
    ? Math.max(..._memberData.map(m => m.sheetRow)) + 1
    : 2;
  const payload = {
    action:    'addMember',
    name,
    industry:  document.getElementById('mf_ind').value.trim(),
    specialty: document.getElementById('mf_spec').value.trim(),
    birthday:  document.getElementById('mf_birthday').value.trim(),
    slogan:    document.getElementById('mf_slogan').value.trim(),
    plates:    _collectPlates(),
    company:   document.getElementById('mf_comp').value.trim(),
    phone:     document.getElementById('mf_phone').value.trim(),
    website:   document.getElementById('mf_website').value.trim(),
    gender:    document.getElementById('mf_gender').value.trim(),
    service:   document.getElementById('mf_serv').value.trim(),
    renewDate: document.getElementById('mf_renewDate').value.trim(),
    renewApply: 'FALSE', renewPay: 'FALSE', renewComplete: 'FALSE', renewRibbon: 'FALSE',
  };
  closeEditMember();
  showToast('新增中...');
  try {
    await _apiPost(payload);
    if (photoFile) {
      showToast('上傳照片中...');
      await uploadMemberPhoto(predictedRow, photoFile);
    }
    _memberData = null;
    showToast('已新增');
    if (_activeTab === 'member') renderMembers();
    if (_activeTab === 'dm') renderDM();
  } catch { showToast('新增失敗，請重試'); }
}

function confirmDeleteMember(btn) {
  const sheetRow = parseInt(btn.dataset.row);
  const name = btn.dataset.name;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'memberModal';
  overlay.dataset.delRow = sheetRow;
  overlay.dataset.delName = name;
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-title" style="color:#e74c3c;">確認刪除</div>
      <p style="font-size:15px;margin-bottom:8px;">確定要刪除 <strong>${_escH(name)}</strong> 的資料嗎？</p>
      <p style="font-size:13px;color:var(--text-soft);">刪除後雲端試算表中的該筆資料也會一併移除，無法復原。</p>
      <div class="modal-btns" style="margin-top:24px;">
        <button class="modal-save" style="background:#e74c3c;" onclick="deleteMemberFromModal()">確認刪除</button>
        <button class="modal-cancel" onclick="closeEditMember()">取消</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function deleteMemberFromModal() {
  const overlay = document.getElementById('memberModal');
  const sheetRow = parseInt(overlay.dataset.delRow);
  const memberName = overlay.dataset.delName;
  deleteMember(sheetRow, memberName);
}

async function deleteMember(sheetRow, memberName) {
  if (!memberName) {
    const m = _memberData?.find(x => x.sheetRow === sheetRow);
    memberName = m?.name || '';
  }
  closeEditMember();
  if (_memberData) {
    _memberData = _memberData.filter(x => x.sheetRow !== sheetRow);
    _memberData.forEach(m => { if (m.sheetRow > sheetRow) m.sheetRow--; });
  }
  renderMembers();
  showToast('刪除中...');
  try {
    await _apiPost({ action: 'deleteMember', sheetRow: sheetRow, name: memberName });
    showToast('已刪除');
  } catch { showToast('刪除失敗，請重試'); }
}

async function saveMemberEdit(sheetRow) {
  const m = _memberData.find(x => x.sheetRow === sheetRow);
  if (!m) return;
  const originalName = m.name;
  const photoFile = document.getElementById('mf_photo_file')?.files[0];
  m.name         = document.getElementById('mf_name').value.trim();
  m.industry     = document.getElementById('mf_ind').value.trim();
  m.specialty    = document.getElementById('mf_spec').value.trim();
  m.birthday     = document.getElementById('mf_birthday').value.trim();
  m.slogan       = document.getElementById('mf_slogan').value.trim();
  m.plates       = _collectPlates();
  m.company      = document.getElementById('mf_comp').value.trim();
  m.phone        = document.getElementById('mf_phone').value.trim();
  m.website      = document.getElementById('mf_website').value.trim();
  m.gender       = document.getElementById('mf_gender').value.trim();
  m.service      = document.getElementById('mf_serv').value.trim();

  closeEditMember();
  renderMembers();
  showToast('儲存中...');
  try {
    const task = _apiPost({ action: 'updateMember', sheetRow, originalName, name: m.name, industry: m.industry, specialty: m.specialty, birthday: m.birthday, slogan: m.slogan, plates: m.plates, company: m.company, phone: m.phone, website: m.website, gender: m.gender, service: m.service });
    if (photoFile) {
      showToast('上傳照片中...');
      await uploadMemberPhoto(sheetRow, photoFile);
      m.photo = URL.createObjectURL(photoFile);
      renderMembers();
    }
    await task;
    showToast('已儲存');
  } catch { showToast('儲存失敗，請重試'); }
}

// ===== TOAST =====
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ===== MANUAL SAVE =====
async function manualSave(btn) {
  if (btn) { btn.disabled = true; btn.textContent = '儲存中...'; }
  try {
    const prog  = getProgData();
    const notes = getNoteData();
    await Promise.all([
      _apiPost({ key: `__prog_${getWeekKey()}__`, data: prog }),
      _apiPost({ key: `__notes_${getWeekKey()}__`, data: notes })
    ]);
    _lsSave();
    showToast('已儲存');
  } catch {}
  if (btn) { btn.disabled = false; btn.textContent = '儲存'; }
}

// ===== PHOTO UPLOAD =====
function previewPhoto(input, previewId) {
  if (!input.files[0]) return;
  const img = document.getElementById(previewId);
  if (img) { img.src = URL.createObjectURL(input.files[0]); img.style.visibility = ''; }
}

function previewPhotoNew(input) {
  if (!input.files[0]) return;
  const el = document.getElementById('mf_photo_preview');
  if (!el) return;
  const img = document.createElement('img');
  img.id = 'mf_photo_preview';
  img.src = URL.createObjectURL(input.files[0]);
  img.style.cssText = 'width:72px;height:72px;border-radius:50%;object-fit:cover;border:2.5px solid #c0392b;background:#eee;flex-shrink:0;';
  el.replaceWith(img);
}

async function resizeImage(file, maxPx = 400) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = url;
  });
}

async function uploadMemberPhoto(sheetRow, file) {
  try {
    const base64 = await resizeImage(file, 400);
    await _apiPost({ action: 'uploadPhoto', sheetRow, base64 });
    return null;
  } catch { return null; }
}

