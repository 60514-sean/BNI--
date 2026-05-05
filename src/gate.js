// ===== 站台密碼閘門 =====
// 在原本的「姓名登入」之前再加一道共用密碼，擋住路人/搜尋引擎/隨機訪客。
//
// 安全等級：弱（密碼 hash 為公開可讀，理論上可暴力破解）
// 用途：擋掉 99% 不會 view-source 的隨機訪客
//
// === 密碼來源優先序 ===
// 1. cfg.sitePasswordHash（管理員在設定頁改的密碼，存在 Google Sheet config）
// 2. SITE_PASSWORD_HASH_FALLBACK（cfg 沒設時用的預設值，第一次部署用）

// SHA-256 of "BNI鳳華2026"（cfg 未設置時的預設值，可隨時被管理員覆寫）
const SITE_PASSWORD_HASH_FALLBACK = '80f23b385d21797e74e6ebfa2bbc18becc8ed9c315b81ba8b56153612423d985';
const SITE_GATE_KEY = 'bni_site_gate_v1';
const SITE_GATE_TTL_DAYS = 30;

async function _sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function _currentSiteHash() {
  try {
    const cfg = (typeof getConfig === 'function') ? getConfig() : null;
    return (cfg && cfg.sitePasswordHash) || SITE_PASSWORD_HASH_FALLBACK;
  } catch { return SITE_PASSWORD_HASH_FALLBACK; }
}

function _isGateUnlocked() {
  try {
    const raw = localStorage.getItem(SITE_GATE_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    if (!obj || obj.hash !== _currentSiteHash()) return false;
    if (Date.now() > obj.expires) return false;
    return true;
  } catch { return false; }
}

function _markGateUnlocked(hash) {
  const expires = Date.now() + SITE_GATE_TTL_DAYS * 24 * 60 * 60 * 1000;
  localStorage.setItem(SITE_GATE_KEY, JSON.stringify({ hash: hash || _currentSiteHash(), expires }));
}

async function submitGate() {
  const input = document.getElementById('gateInput');
  const errEl = document.getElementById('gateError');
  errEl.textContent = '';
  const pw = (input.value || '').trim();
  if (!pw) return;
  const hash = await _sha256Hex(pw);
  if (hash !== _currentSiteHash()) {
    errEl.textContent = '密碼錯誤';
    input.value = '';
    input.focus();
    return;
  }
  _markGateUnlocked(hash);
  document.getElementById('gatePage').style.display = 'none';
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('nameInput').focus();
}

(function _initGate() {
  const gateEl = document.getElementById('gatePage');
  const loginEl = document.getElementById('loginPage');
  if (_isGateUnlocked()) {
    gateEl.style.display = 'none';
    loginEl.style.display = 'flex';
    return;
  }
  gateEl.style.display = 'flex';
  loginEl.style.display = 'none';
  const input = document.getElementById('gateInput');
  if (input) {
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submitGate(); });
    setTimeout(() => input.focus(), 50);
  }
})();
