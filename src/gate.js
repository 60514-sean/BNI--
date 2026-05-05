// ===== 站台密碼閘門（與姓名登入合併在同一頁） =====
// 第一次進站或 30 天 token 過期：登入頁同時顯示「分會共用密碼 + 姓名」兩欄
// 30 天內已驗證過：分會密碼欄隱藏，只顯示姓名
//
// === 密碼來源優先序 ===
// 1. cfg.sitePasswordHash（管理員在設定頁改的密碼，存在 Google Sheet config）
// 2. SITE_PASSWORD_HASH_FALLBACK（cfg 沒設時用的預設值）

// SHA-256 of "BNI鳳華2026"（cfg 未設置時的預設值，可被管理員覆寫）
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

(function _initLoginGate() {
  const loginEl = document.getElementById('loginPage');
  const promptEl = document.getElementById('loginPrompt');
  const gateInput = document.getElementById('gateInput');
  const nameInput = document.getElementById('nameInput');

  loginEl.style.display = 'flex';

  if (_isGateUnlocked()) {
    gateInput.style.display = 'none';
    promptEl.textContent = '請輸入您的名稱登入';
    setTimeout(() => nameInput?.focus(), 50);
  } else {
    gateInput.style.display = '';
    promptEl.textContent = '請輸入分會共用密碼及您的姓名';
    setTimeout(() => gateInput?.focus(), 50);
  }

  if (gateInput) {
    gateInput.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  }
})();
