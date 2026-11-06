/* ============================================================
   E-VOTE • auth.js
   Layer autentikasi di atas js/api.js.

   Fitur:
   - Session get/set/clear (kompatibel dengan key localStorage api.js:
     'evote_token' & 'evote_user')
   - login / logout wrapper (delegate ke API)
   - Role helpers: hasRole, isAdmin, isPetugas, isBilik
   - Page guard: requireLogin, requireRole
   - Verify async ke server (endpoint 'me') — untuk refresh user & cek token
   - Heartbeat optional — auto-verify periodik; matikan kalau expired
   - Event subscription: 'login', 'logout', 'change', 'expired'
   - Cross-tab sync: login/logout di tab lain otomatis terdeteksi
   - Remember username helpers
   - bindLogoutButtons opsional (tidak auto-bind — router sudah handle)

   Tidak menimpa window.API. Router & views yang sudah ada tetap
   berfungsi tanpa perubahan apa pun.

   ⚠️ WAJIB dimuat SETELAH js/api.js, SEBELUM js/router.js.
   ============================================================ */
window.Auth = (function () {
  'use strict';

  /* ---------- Storage keys (sinkron dengan api.js) ---------- */
  const LS_TOKEN    = 'evote_token';
  const LS_USER     = 'evote_user';
  const LS_EXP      = 'evote_exp';               // optional — diisi kalau ada estimasi
  const LS_REMEMBER = 'evote_remember_username';

  const DEFAULT_LOGIN_PAGE = 'index.html';
  const DEFAULT_APP_PAGE   = 'app.html';

  /* ---------- Memory fallback (privacy mode / localStorage disabled) ---------- */
  let memory = { token: '', user: null, exp: 0 };
  let memoryOnly = false;

  function lsGet(key) {
    if (memoryOnly) return null;
    try { return localStorage.getItem(key); }
    catch (_) { memoryOnly = true; return null; }
  }
  function lsSet(key, val) {
    if (memoryOnly) return;
    try { localStorage.setItem(key, val); }
    catch (_) { memoryOnly = true; }
  }
  function lsDel(key) {
    if (memoryOnly) return;
    try { localStorage.removeItem(key); }
    catch (_) { memoryOnly = true; }
  }

  /* ---------- API resolver (lazy) ---------- */
  function api() {
    if (!window.API) {
      throw new Error('js/auth.js memerlukan js/api.js dimuat lebih dulu');
    }
    return window.API;
  }

  /* ============================================================
   *  SESSION ACCESSORS
   * ============================================================ */
  function token() {
    if (memoryOnly) return memory.token || '';
    return lsGet(LS_TOKEN) || '';
  }

  function user() {
    if (memoryOnly) return memory.user;
    try {
      const raw = lsGet(LS_USER);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function exp() {
    if (memoryOnly) return Number(memory.exp) || 0;
    const v = Number(lsGet(LS_EXP));
    return isFinite(v) ? v : 0;
  }

  function setSession(tok, u, expMs) {
    if (!tok || !u) return false;
    if (memoryOnly) {
      memory.token = tok;
      memory.user = u;
      memory.exp = Number(expMs) || 0;
    } else {
      lsSet(LS_TOKEN, tok);
      lsSet(LS_USER, JSON.stringify(u));
      if (expMs) lsSet(LS_EXP, String(Number(expMs)));
      else lsDel(LS_EXP);
    }
    emit('change', sessionInfo());
    emit('login', u);
    return true;
  }

  function clearSession(silent) {
    const had = !!token();
    if (memoryOnly) {
      memory = { token: '', user: null, exp: 0 };
    } else {
      lsDel(LS_TOKEN);
      lsDel(LS_USER);
      lsDel(LS_EXP);
    }
    if (!silent && had) {
      emit('change', null);
      emit('logout', null);
    }
    return true;
  }

  function isLoggedIn() {
    if (!token() || !user()) return false;
    const e = exp();
    if (e && e <= Date.now()) {
      clearSession();
      emit('expired', null);
      return false;
    }
    return true;
  }

  /**
   * Snapshot info session (tanpa efek samping).
   * Aman dipanggil dari listener event — tidak akan trigger clearSession.
   */
  function sessionInfo() {
    const t = token();
    const u = user();
    const e = exp();
    if (!t || !u) return null;
    if (e && e <= Date.now()) return null;
    return {
      token: t,
      user: u,
      exp: e,
      remainingMs: e ? (e - Date.now()) : 0,
    };
  }

  function role() {
    const u = user();
    return u && u.role ? String(u.role).toLowerCase() : '';
  }

  /* ============================================================
   *  ROLE HELPERS
   * ============================================================ */
  function hasRole(roles) {
    const r = role();
    if (!r) return false;
    if (Array.isArray(roles)) return roles.indexOf(r) !== -1;
    if (typeof roles === 'string') return r === roles.toLowerCase();
    return false;
  }
  function isAdmin()   { return hasRole('admin'); }
  function isPetugas() { return hasRole('petugas'); }
  function isBilik()   { return hasRole('bilik'); }

  /* ============================================================
   *  REDIRECT HELPERS
   * ============================================================ */
  function redirectToLogin(next) {
    const url = next
      ? DEFAULT_LOGIN_PAGE + '?next=' + encodeURIComponent(next)
      : DEFAULT_LOGIN_PAGE;
    location.replace(url);
  }
  function redirectToApp() {
    location.replace(DEFAULT_APP_PAGE);
  }

  /* ============================================================
   *  GUARDS
   * ============================================================ */
  function requireLogin(opts) {
    opts = opts || {};
    if (isLoggedIn()) return true;
    if (opts.redirect !== false) redirectToLogin(opts.next || '');
    return false;
  }

  function requireRole(roles, opts) {
    opts = opts || {};
    if (!requireLogin(opts)) return false;
    if (hasRole(roles)) return true;
    if (opts.redirect !== false) {
      const fallback = {
        admin:   '#/admin',
        petugas: '#/petugas',
        bilik:   '#/bilik',
      }[role()] || DEFAULT_APP_PAGE;
      location.replace(fallback);
    }
    return false;
  }

  /* ============================================================
   *  LOGIN / LOGOUT / VERIFY
   * ============================================================ */
  async function login(username, password, opts) {
    opts = opts || {};
    const A = api();
    const res = await A.login(username, password);

    if (res && res.success && res.token && res.user) {
      // API.login sudah menulis ke localStorage; sinkronkan memory cache
      if (memoryOnly) {
        memory.token = res.token;
        memory.user  = res.user;
      }
      if (typeof opts.rememberUsername === 'boolean') {
        saveRememberedUsername(opts.rememberUsername ? username : '');
      }
      emit('change', sessionInfo());
      emit('login', res.user);
    }
    return res;
  }

  async function logout(opts) {
    opts = opts || {};
    const A = api();
    try { await A.logout({ redirect: false }); }
    catch (_) { clearSession(); }
    emit('change', null);
    emit('logout', null);
    if (opts.redirect !== false) redirectToLogin(opts.redirectTo || '');
    return true;
  }

  /**
   * Verifikasi token ke server. Kalau sukses → refresh user object.
   * Kalau gagal karena server bilang tidak valid → clearSession.
   * Kalau gagal karena network error → JANGAN clear (biar user coba lagi).
   */
  async function verify() {
    if (!isLoggedIn()) return false;
    const A = api();

    let res;
    try { res = await A.post('me'); }
    catch (_) { return false; } // network error — jangan clear session

    if (res && res.success && res.user) {
      try {
        if (!memoryOnly) lsSet(LS_USER, JSON.stringify(res.user));
        else memory.user = res.user;
      } catch (_) {}
      emit('change', sessionInfo());
      return true;
    }

    // Server bilang tidak valid
    clearSession();
    emit('expired', null);
    return false;
  }

  /* ============================================================
   *  HEARTBEAT (optional)
   * ============================================================ */
  let heartbeatId = null;

  function startHeartbeat(ms) {
    stopHeartbeat();
    const interval = Math.max(60000, Number(ms) || 5 * 60 * 1000);
    heartbeatId = setInterval(async function () {
      const ok = await verify();
      if (!ok) {
        stopHeartbeat();
        emit('expired', null);
      }
    }, interval);
    return heartbeatId;
  }

  function stopHeartbeat() {
    if (heartbeatId) {
      clearInterval(heartbeatId);
      heartbeatId = null;
    }
  }

  /* ============================================================
   *  REMEMBER USERNAME
   * ============================================================ */
  function rememberedUsername() {
    return lsGet(LS_REMEMBER) || '';
  }
  function saveRememberedUsername(u) {
    if (u) lsSet(LS_REMEMBER, String(u));
    else   lsDel(LS_REMEMBER);
  }

  /* ============================================================
   *  EVENT SYSTEM
   * ============================================================ */
  const listeners = { login: [], logout: [], change: [], expired: [] };

  function on(event, cb) {
    if (!listeners[event] || typeof cb !== 'function') return function () {};
    listeners[event].push(cb);
    return function () { off(event, cb); };
  }
  function off(event, cb) {
    if (!listeners[event]) return;
    const i = listeners[event].indexOf(cb);
    if (i >= 0) listeners[event].splice(i, 1);
  }
  function emit(event, payload) {
    if (!listeners[event]) return;
    listeners[event].slice().forEach(function (cb) {
      try { cb(payload); }
      catch (e) { console.warn('[Auth] listener error (' + event + '):', e); }
    });
  }

  /* ============================================================
   *  CROSS-TAB SYNC
   * ============================================================ */
  function setupStorageSync() {
    if (typeof window === 'undefined') return;
    try {
      window.addEventListener('storage', function (e) {
        if (!e || !e.key) return;
        if (e.key !== LS_TOKEN && e.key !== LS_USER && e.key !== LS_EXP) return;

        if (isLoggedIn()) {
          emit('change', sessionInfo());
          emit('login', user());
        } else {
          emit('change', null);
          emit('logout', null);
        }
      });
    } catch (_) {}
  }
  setupStorageSync();

  /* ============================================================
   *  LOGOUT BUTTONS (opsional — router sudah handle)
   *  Panggil manual kalau pakai halaman tanpa router.js.
   * ============================================================ */
  function bindLogoutButtons(root) {
    const scope = root || document;
    const btns = scope.querySelectorAll('[data-logout]');
    btns.forEach(function (btn) {
      if (btn.dataset.authBound === '1') return;
      btn.dataset.authBound = '1';
      btn.addEventListener('click', async function (e) {
        e.preventDefault();
        let ok = true;
        if (window.UI && typeof UI.confirm === 'function') {
          ok = await UI.confirm('Keluar dari aplikasi?', { okLabel: 'Ya, Keluar' });
        } else {
          ok = window.confirm('Keluar dari aplikasi?');
        }
        if (ok) logout({ redirect: true });
      });
    });
  }

  /* ============================================================
   *  EXPORT
   * ============================================================ */
  return {
    /* Session */
    token: token,
    user: user,
    role: role,
    exp: exp,
    sessionInfo: sessionInfo,
    setSession: setSession,
    clearSession: clearSession,
    isLoggedIn: isLoggedIn,

    /* Roles */
    hasRole: hasRole,
    isAdmin: isAdmin,
    isPetugas: isPetugas,
    isBilik: isBilik,

    /* Guards */
    requireLogin: requireLogin,
    requireRole: requireRole,

    /* Redirects */
    redirectToLogin: redirectToLogin,
    redirectToApp: redirectToApp,

    /* Auth */
    login: login,
    logout: logout,
    verify: verify,

    /* Heartbeat */
    startHeartbeat: startHeartbeat,
    stopHeartbeat: stopHeartbeat,

    /* Remember */
    rememberedUsername: rememberedUsername,
    saveRememberedUsername: saveRememberedUsername,

    /* Events */
    on: on,
    off: off,

    /* DOM */
    bindLogoutButtons: bindLogoutButtons,

    /* Meta */
    keys: {
      TOKEN: LS_TOKEN,
      USER: LS_USER,
      EXP: LS_EXP,
      REMEMBER: LS_REMEMBER,
    },
  };
})();