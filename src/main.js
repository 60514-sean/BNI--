// ===== MAIN =====
function renderMain() {
  document.getElementById('headerTitle').textContent = '秘書財務小組';
  const prog  = getProgData();
  const notes = getNoteData();

  const ALL_TASKS = getAllTasks();
  const visibleTasks  = _mainVisibleTasks();
  const filteredByDay = currentDay === '全部' ? visibleTasks : visibleTasks.filter(t => t.day === currentDay);
  const total = visibleTasks.length;
  const done  = visibleTasks.filter(t => prog[t.id]).length;
  const pct   = total ? Math.round(done / total * 100) : 0;

  const RING_R = 46, RING_C = 2 * Math.PI * RING_R;
  const ringOffset = RING_C * (1 - pct / 100);
  let html = `
  <div class="hero-card">
    <div class="hero-date">
      <span class="hero-date-main">${getTodayStr()}</span>
      <span class="hero-date-weekday">${TODAY_DAY}</span>
    </div>
    <div class="hero-body">
      <div class="hero-ring">
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="${RING_R}" fill="none" stroke="#f0f0f0" stroke-width="9"/>
          <circle id="progRing" cx="60" cy="60" r="${RING_R}" fill="none"
                  stroke="var(--red)" stroke-width="9" stroke-linecap="round"
                  stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${ringOffset.toFixed(2)}"
                  transform="rotate(-90 60 60)" style="transition: stroke-dashoffset 0.5s ease;"/>
        </svg>
        <div class="hero-ring-text">
          <div class="hero-ring-pct" id="valPct">${pct}%</div>
          <div class="hero-ring-sub">完成度</div>
        </div>
      </div>
      <div class="hero-stats">
        <div class="hero-stat"><span class="hero-stat-label">完成</span><span class="hero-stat-value" id="valDone">${done}</span></div>
        <div class="hero-stat"><span class="hero-stat-label">待辦</span><span class="hero-stat-value" id="valPend">${total - done}</span></div>
        <div class="hero-stat"><span class="hero-stat-label">今日</span><span class="hero-stat-value">${total}</span></div>
      </div>
    </div>
  </div>`;

  html += `<div class="day-tabs">`;
  ['全部', ...DAYS].forEach(d => {
    const count = d === '全部' ? visibleTasks.length : visibleTasks.filter(t => t.day === d).length;
    if (count === 0 && d !== '全部') return;
    const isActive = currentDay === d;
    const isToday  = d === TODAY_DAY;
    let cls = 'day-tab';
    if (isActive) cls += ' active';
    if (isToday)  cls += ' today-tab';
    html += `<button class="${cls}" onclick="filterDay('${d}')">${d === '全部' ? '全部' : d}<span class="dot-count">${count}</span></button>`;
  });
  html += `</div><div class="tasks-section">`;

  if (filteredByDay.length === 0) {
    html += `<div style="text-align:center;padding:48px 20px;color:var(--text-soft);"><div style="font-size:15px;">今天沒有任務</div></div>`;
  } else if (currentDay === '全部') {
    DAYS.forEach(day => {
      const dayTasks = filteredByDay.filter(t => t.day === day);
      if (!dayTasks.length) return;
      const isToday = day === TODAY_DAY;
      const dayDone = dayTasks.filter(t => prog[t.id]).length;
      html += `<div style="background:white;border-radius:14px;box-shadow:var(--shadow);margin-bottom:10px;overflow:hidden;">
        <div style="padding:13px 18px;display:flex;align-items:center;justify-content:space-between;border-left:4px solid var(--red);">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:14px;font-weight:700;color:var(--red);">${day}</span>
            <span id="catbadge_day_${day}" style="font-size:12px;background:#c0392b18;color:var(--red);padding:2px 8px;border-radius:10px;">${dayDone}/${dayTasks.length}</span>
          </div>
        </div>
        <div>${renderFlatTasks(dayTasks, prog, notes)}</div>
      </div>`;
    });
  } else {
    html += renderCatGroups(filteredByDay, prog, notes, currentDay);
  }

  html += `</div><button class="page-save-btn" onclick="manualSave(this)" style="margin-bottom:24px;">儲存</button>`;

  // 記憶頁籤捲動位置與任務備註展開狀態
  const tabsScrollLeft = document.querySelector('.day-tabs')?.scrollLeft || 0;
  const openDets = new Set();
  document.querySelectorAll('[id^="det_"]').forEach(el => {
    if (el.classList.contains('open')) openDets.add(el.id);
  });

  document.getElementById('mainContent').innerHTML = html;

  // 還原頁籤捲動位置
  const tabsEl = document.querySelector('.day-tabs');
  if (tabsEl) tabsEl.scrollLeft = tabsScrollLeft;

  // 還原任務備註展開狀態
  openDets.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('open');
    const eb = document.getElementById('eb_' + id.replace('det_', ''));
    if (eb) eb.classList.add('open');
  });
}

function renderFlatTasks(tasks, prog, notes) {
  let html = '';
  tasks.forEach(t => {
    const gi      = t.id;
    const isDone  = !!prog[gi];
    const note    = notes[gi] || '';
    const canEdit = _canEditTask(t);
    html += `<div style="border-top:1px solid #f5f5f5;" id="tc_${gi}">
      <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 18px;">
        <input type="checkbox" class="task-cb" ${isDone?'checked':''} ${canEdit?'':'disabled'} onchange="toggleTask('${gi}',this)" style="margin-top:3px;">
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:500;line-height:1.5;color:${isDone?'#bbb':'var(--text)'};${isDone?'text-decoration:line-through;':''}" id="ttl_${gi}">${t.task}</div>
          <div style="display:flex;gap:6px;margin-top:3px;">
            <span class="tag tag-freq">${t.freq}</span>
          </div>
        </div>
        <button class="task-expand-btn${note?' has-note':''}" id="eb_${gi}" onclick="toggleExpand('${gi}')">▾</button>
      </div>
      <div class="task-detail" id="det_${gi}" style="padding:0 18px 12px 48px;">
        <div class="task-note-label">備註</div>
        ${canEdit
          ? `<textarea class="task-note" placeholder="新增備註..." oninput="saveNote('${gi}',this.value);document.getElementById('eb_${gi}').classList.toggle('has-note',!!this.value);">${note}</textarea>`
          : (note
              ? `<div style="font-size:13px;color:var(--text-soft);padding:8px 12px;background:var(--gray-light);border-radius:8px;border-left:3px solid var(--gray-border);">${note}</div>`
              : `<div style="font-size:13px;color:#ccc;">無備註</div>`)}
      </div>
    </div>`;
  });
  return html;
}

function renderCatGroups(tasks, prog, notes, dayKey) {
  let html = '';
  CAT_ORDER.forEach(cat => {
    const catTasks = tasks.filter(t => t.cat === cat);
    if (!catTasks.length) return;
    const color   = CAT_COLOR;
    const catDone = catTasks.filter(t => prog[t.id]).length;
    const catId   = `cat_${dayKey}_${cat}`;
    html += `<div style="background:white;border-radius:14px;box-shadow:var(--shadow);margin-bottom:10px;overflow:hidden;">
      <div style="padding:12px 18px;display:flex;align-items:center;gap:10px;border-left:4px solid ${color};">
        <span style="font-size:14px;font-weight:700;color:${color};">${cat}</span>
        <span id="catbadge_${catId}" style="font-size:12px;background:${color}18;color:${color};padding:2px 8px;border-radius:10px;">${catDone}/${catTasks.length}</span>
      </div>
      <div>`;
    catTasks.forEach(t => {
      const gi      = t.id;
      const isDone  = !!prog[gi];
      const note    = notes[gi] || '';
      const canEdit = _canEditTask(t);
      html += `<div style="border-top:1px solid #f5f5f5;" id="tc_${gi}">
        <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 18px;">
          <input type="checkbox" class="task-cb" ${isDone?'checked':''} ${canEdit?'':'disabled'} onchange="toggleTask('${gi}',this)" style="margin-top:3px;">
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:500;line-height:1.5;color:${isDone?'#bbb':'var(--text)'};${isDone?'text-decoration:line-through;':''}" id="ttl_${gi}">${t.task}</div>
            <div style="display:flex;gap:6px;margin-top:3px;">
              <span class="tag tag-freq">${t.freq}</span>
            </div>
          </div>
          <button class="task-expand-btn${note?' has-note':''}" id="eb_${gi}" onclick="toggleExpand('${gi}')">▾</button>
        </div>
        <div class="task-detail" id="det_${gi}" style="padding:0 18px 12px 48px;">
          <div class="task-note-label">備註</div>
          ${canEdit
            ? `<textarea class="task-note" placeholder="新增備註..." oninput="saveNote('${gi}',this.value);document.getElementById('eb_${gi}').classList.toggle('has-note',!!this.value);">${note}</textarea>`
            : (note
                ? `<div style="font-size:13px;color:var(--text-soft);padding:8px 12px;background:var(--gray-light);border-radius:8px;border-left:3px solid var(--gray-border);">${note}</div>`
                : `<div style="font-size:13px;color:#ccc;">無備註</div>`)}
        </div>
      </div>`;
    });
    html += `</div></div>`;
  });
  return html;
}

function toggleCat(id) {
  const el  = document.getElementById(id);
  const arr = document.getElementById('arr_' + id);
  if (!el) return;
  const isOpen = el.style.display !== 'none';
  el.style.display = isOpen ? 'none' : '';
  if (arr) arr.textContent = isOpen ? '▾' : '▲';
}

function filterDay(day) { currentDay = day; renderMain(); }

function toggleExpand(idx) {
  document.getElementById('det_' + idx)?.classList.toggle('open');
  document.getElementById('eb_'  + idx)?.classList.toggle('open');
}

async function toggleTask(idx, cb) {
  const prog = getProgData();
  prog[idx] = cb.checked;
  saveProgData(prog);

  const ttl = document.getElementById('ttl_' + idx);
  if (ttl) {
    ttl.style.textDecoration = cb.checked ? 'line-through' : '';
    ttl.style.color = cb.checked ? '#bbb' : 'var(--text)';
  }

  const t      = getAllTasks().find(t => String(t.id) === String(idx));
  if (!t) { console.warn('[toggleTask] 找不到 task id:', idx); return; }
  const dayKey = currentDay === '全部' ? t.day : currentDay;
  const vis    = _mainVisibleTasks();
  const catTasks = vis.filter(t2 => t2.cat === t.cat && t2.day === t.day);
  const catDone  = catTasks.filter(t2 => prog[t2.id]).length;
  const badge = document.getElementById(`catbadge_cat_${dayKey}_${t.cat}`);
  if (badge) badge.textContent = `${catDone}/${catTasks.length}`;

  // 全部頁同步更新日期徽章
  if (currentDay === '全部') {
    const dayTasks = vis.filter(t2 => t2.day === t.day);
    const dayDone  = dayTasks.filter(t2 => prog[t2.id]).length;
    const dayBadge = document.getElementById(`catbadge_day_${t.day}`);
    if (dayBadge) dayBadge.textContent = `${dayDone}/${dayTasks.length}`;
  }

  const total = vis.length;
  const done  = vis.filter(t2 => prog[t2.id]).length;
  const pct   = total ? Math.round(done / total * 100) : 0;
  const ring = document.getElementById('progRing');
  if (ring) {
    const c = 2 * Math.PI * 46;
    ring.setAttribute('stroke-dashoffset', (c * (1 - pct / 100)).toFixed(2));
  }
  document.getElementById('valDone').textContent  = done;
  document.getElementById('valPend').textContent  = total - done;
  document.getElementById('valPct').textContent   = pct + '%';
  showToast(cb.checked ? '已完成' : '已取消');
}

const _noteTimer = {};
function saveNote(idx, val) {
  clearTimeout(_noteTimer[idx]);
  _noteTimer[idx] = setTimeout(async () => {
    const notes = getNoteData();
    notes[idx] = val;
    await saveNoteData(notes);
  }, 600);
}

