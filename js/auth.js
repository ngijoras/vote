/* ============================================================
   E-VOTE • auth.js (FULL FIX - FINAL)
   Layer autentikasi di atas js/api.js.
   Fitur: Session, Role Helpers, Logout Radikal, Cross-Tab Sync.
   ============================================================ */
window.Auth = (function () {
  'use strict';

  /* ============================================================
   *  CONSTANTS
   * ============================================================ */
  const LS_TOKEN    = 'evote_token';
  const LS_USER     = 'evote_user';
  const LS_EXP      = 'evote_exp';
  const LS_REMEMBER = 'evote_remember_username';

  const DEFAULT_LOGIN_PAGE = 'login.html';
  const DEFAULT_APP_PAGE   = 'app.html';

  const ROLE_HOME = {
    admin:   '#/admin',
    petugas: '#/petugas',
    bilik:   '#/bilik',
    coklit:  '#/coklit',
  };

  /* ============================================================
   *  STORAGE RESOLVER (SafeStorage → localStorage)
   * ============================================================ */
  const Store = (window.SafeStorage || window.localStorage);

  function lsGet(key) {
    try { return Store.getItem(key); }
    catch (_) { return null; }
  }
  function lsSet(key, val) {
    try { Store.setItem(key, String(val)); }
    catch (_) {}
  }
  function lsDel(key) {
    try { Store.removeItem(key); }
    catch (_) {}
  }

  /* ============================================================
   *  API RESOLVER (Lazy)
   * ============================================================ */
  function api() {
    if (!window.API) {
      throw new Error('js/auth.js memerlukan js/api.js dimuat lebih dulu');
    }
    return window.API;
  }

  /* ============================================================
   *  SESSION ACCESSORS
   * ============================================================ */
  function token() { return lsGet(LS_TOKEN) || ''; }

  function user() {
    try {
      const raw = lsGet(LS_USER);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function exp() {
    const v = Number(lsGet(LS_EXP));
    return isFinite(v) && v > 0 ? v : 0;
  }

  function setSession(tok, u, expMs) {
    if (!tok || !u) return false;
    lsSet(LS_TOKEN, tok);
    lsSet(LS_USER, JSON.stringify(u));
    if (expMs) lsSet(LS_EXP, String(Number(expMs)));
    else lsDel(LS_EXP);

    emit('change', sessionInfo());
    emit('login', u);
    return true;
  }

  /* ============================================================
   *  CLEAR SESSION (TOTAL)
   *  Menghapus semua key evote_* dan evote_cache_*
   * ============================================================ */
  function clearSession(silent) {
    const had = !!token();

    // Hapus key utama
    lsDel(LS_TOKEN);
    lsDel(LS_USER);
    lsDel(LS_EXP);

    // ✅ Force hapus semua key evote_* dan evote_cache_* dari localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        Object.keys(localStorage).forEach(function (k) {
          if (k.indexOf('evote') === 0) {
            localStorage.removeItem(k);
          }
        });
      }
    } catch (_) {}

    // ✅ Force hapus sessionStorage
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.clear();
      }
    } catch (_) {}

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
  function isCoklit()  { return hasRole('coklit'); }

  /* ============================================================
   *  REDIRECTS
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

  function homeForRole(r) {
    const key = String(r || role()).toLowerCase();
    return ROLE_HOME[key] || DEFAULT_APP_PAGE;
  }

  /* ============================================================
   *  LOGIN
   * ============================================================ */
  async function login(username, password, opts) {
    opts = opts || {};
    const A = api();
    const res = await A.login(username, password);

    if (res && res.success && res.token && res.user) {
      if (typeof opts.rememberUsername === 'boolean') {
        saveRememberedUsername(opts.rememberUsername ? username : '');
      }
      emit('change', sessionInfo());
      emit('login', res.user);
    }
    return res;
  }

  /* ============================================================
   *  ✅ LOGOUT RADIKAL
   *  Hapus semua → Emit event → Redirect paksa.
   *  Tidak bergantung pada API server.
   * ============================================================ */
  function logout(opts) {
    opts = opts || {};

    // 1. Fire and forget hapus token di server (tidak menunggu)
    try {
      if (window.API && typeof API.logout === 'function') {
        API.logout({ redirect: false }).catch(function () {});
      }
    } catch (_) {}

    // 2. Bersihkan semua sesi lokal
    clearSession();

    // 3. Clear Cache
    if (window.Cache) {
      try { window.Cache.clearAll(); } catch (_) {}
    }

    // 4. Emit event logout
    emit('change', null);
    emit('logout', null);

    // 5. REDIRECT PAKSA
    if (opts.redirect !== false) {
      window.location.replace(DEFAULT_LOGIN_PAGE);
    }
    return true;
  }

  /* ============================================================
   *  VERIFY (Anti-Looping)
   * ============================================================ */
  let verifying = false;
  async function verify() {
    if (!isLoggedIn()) return false;
    if (verifying) return false;
    verifying = true;

    const A = api();
    let res;
    try {
      res = await A.post('me');
    } catch (_) {
      verifying = false;
      return false; // Network error → JANGAN logout
    }
    verifying = false;

    if (res && res.success && res.user) {
      try { lsSet(LS_USER, JSON.stringify(res.user)); } catch (_) {}
      emit('change', sessionInfo());
      return true;
    }

    // Server bilang token invalid
    clearSession();
    emit('expired', null);
    return false;
  }

  /* ============================================================
   *  HEARTBEAT (Opsional)
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
    if (u) lsSet(LS_REMEMBER, u);
    else   lsDel(LS_REMEMBER);
  }

  /* ============================================================
   *  EVENTS
   * ============================================================ */
  const listeners = {
    login:   [],
    logout:  [],
    change:  [],
    expired: [],
  };

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
   *  LOGOUT BUTTONS (Fallback — Router sudah handle)
   * ============================================================ */
  function bindLogoutButtons(root) {
    // ✅ DIMATIKAN — handler dipegang router.js & app.html
    return;
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
    isCoklit: isCoklit,

    /* Redirects */
    redirectToLogin: redirectToLogin,
    redirectToApp: redirectToApp,
    homeForRole: homeForRole,

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