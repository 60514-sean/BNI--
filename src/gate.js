// ===== 站台密碼閘門（與姓名登入合併在同一頁） =====
// 每次登入（新分頁、登出後重登）都要重新輸入分會共用密碼
// gate token 用 sessionStorage：分頁關閉自動消失、登出時手動清除
//
// === 密碼來源優先序 ===
// 1. cfg.sitePasswordHash（管理員在設定頁改的密碼，存在 Google Sheet config）
// 2. SITE_PASSWORD_HASH_FALLBACK（cfg 沒設時用的預設值）

// SHA-256 of "BNI鳳華2026"（cfg 未設置時的預設值，可被管理員覆寫）
const SITE_PASSWORD_HASH_FALLBACK = '80f23b385d21797e74e6ebfa2bbc18becc8ed9c315b81ba8b56153612423d985';
const SITE_GATE_KEY = 'bni_site_gate_v1';

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
    const raw = sessionStorage.getItem(SITE_GATE_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    return obj && obj.hash === _currentSiteHash();
  } catch { return false; }
}

function _markGateUnlocked(hash) {
  sessionStorage.setItem(SITE_GATE_KEY, JSON.stringify({ hash: hash || _currentSiteHash() }));
}

function _clearGateToken() {
  try { sessionStorage.removeItem(SITE_GATE_KEY); } catch {}
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
