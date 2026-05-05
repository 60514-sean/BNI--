// ===== 站台密碼閘門 =====
// 在原本的「姓名登入」之前再加一道共用密碼，擋住路人/搜尋引擎/隨機訪客。
//
// 安全等級：弱（密碼 hash 寫在前端原始碼，理論上有人抓 hash 暴力破解）
// 用途：擋掉 99% 不會 view-source 的隨機訪客，相當於「貼一張內部公告紙條」
//
// === 換密碼步驟 ===
// 1. 開瀏覽器 console，貼這段（換成新密碼）：
//      const t=new TextEncoder().encode('新密碼字串');
//      crypto.subtle.digest('SHA-256',t).then(b=>console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')));
//    或用 python：python -c "import hashlib; print(hashlib.sha256('新密碼'.encode()).hexdigest())"
// 2. 把產出的 hash 字串貼到下方 SITE_PASSWORD_HASH
// 3. commit + push，全員下次打開網站時要重新輸入新密碼

// SHA-256 of "BNI鳳華2026"
const SITE_PASSWORD_HASH = '80f23b385d21797e74e6ebfa2bbc18becc8ed9c315b81ba8b56153612423d985';
const SITE_GATE_KEY = 'bni_site_gate_v1';
const SITE_GATE_TTL_DAYS = 30;

async function _sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function _isGateUnlocked() {
  try {
    const raw = localStorage.getItem(SITE_GATE_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    if (!obj || obj.hash !== SITE_PASSWORD_HASH) return false;
    if (Date.now() > obj.expires) return false;
    return true;
  } catch { return false; }
}

function _markGateUnlocked() {
  const expires = Date.now() + SITE_GATE_TTL_DAYS * 24 * 60 * 60 * 1000;
  localStorage.setItem(SITE_GATE_KEY, JSON.stringify({ hash: SITE_PASSWORD_HASH, expires }));
}

async function submitGate() {
  const input = document.getElementById('gateInput');
  const errEl = document.getElementById('gateError');
  errEl.textContent = '';
  const pw = (input.value || '').trim();
  if (!pw) return;
  const hash = await _sha256Hex(pw);
  if (hash !== SITE_PASSWORD_HASH) {
    errEl.textContent = '密碼錯誤';
    input.value = '';
    input.focus();
    return;
  }
  _markGateUnlocked();
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
