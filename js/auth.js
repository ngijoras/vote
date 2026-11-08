/* ============================================================
   E-VOTE • auth.js (FULL FIX - FINAL)
   Layer autentikasi di atas js/api.js.
   ============================================================ */
window.Auth = (function () {
  'use strict';

  const LS_TOKEN    = 'evote_token';
  const LS_USER     = 'evote_user';
  const LS_EXP      = 'evote_exp';
  const LS_REMEMBER = 'evote_remember_username';

  const Store = (window.SafeStorage || window.localStorage);

  function lsGet(key) { try { return Store.getItem(key); } catch (_) { return null; } }
  function lsSet(key, val) { try { Store.setItem(key, String(val)); } catch (_) {} }
  function lsDel(key) { try { Store.removeItem(key); } catch (_) {} }

  function api() {
    if (!window.API) throw new Error('js/auth.js memerlukan js/api.js dimuat lebih dulu');
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

  function clearSession(silent) {
    const had = !!token();
    lsDel(LS_TOKEN);
    lsDel(LS_USER);
    lsDel(LS_EXP);
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
    return { token: t, user: u, exp: e, remainingMs: e ? (e - Date.now()) : 0 };
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
    const url = next ? 'login.html?next=' + encodeURIComponent(next) : 'login.html';
    location.replace(url);
  }

  function homeForRole(r) {
    const key = String(r || role()).toLowerCase();
    return ({ admin: '#/admin', petugas: '#/petugas', bilik: '#/bilik', coklit: '#/coklit' }[key]) || 'app.html';
  }

  /* ============================================================
   *  LOGIN / LOGOUT
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

  async function logout(opts) {
    opts = opts || {};
    const A = api();
    
    // 1. Coba hapus di server (tidak peduli berhasil/gagal)
    try { await A.logout({ redirect: false }); } 
    catch (_) {}
    
    // 2. Hapus sesi lokal
    clearSession();
    
    // 3. Emit event
    emit('change', null);
    emit('logout', null);
    
    // 4. Redirect
    if (opts.redirect !== false) {
      redirectToLogin(opts.redirectTo || '');
    }
    return true;
  }

  /* ============================================================
   *  VERIFY
   * ============================================================ */
  let verifying = false;
  async function verify() {
    if (!isLoggedIn()) return false;
    if (verifying) return false;
    verifying = true;

    const A = api();
    let res;
    try { res = await A.post('me'); } 
    catch (_) { verifying = false; return false; }
    verifying = false;

    if (res && res.success && res.user) {
      try { lsSet(LS_USER, JSON.stringify(res.user)); } catch (_) {}
      emit('change', sessionInfo());
      return true;
    }

    clearSession();
    emit('expired', null);
    return false;
  }

  /* ============================================================
   *  REMEMBER USERNAME
   * ============================================================ */
  function rememberedUsername() { return lsGet(LS_REMEMBER) || ''; }
  function saveRememberedUsername(u) {
    if (u) lsSet(LS_REMEMBER, u);
    else   lsDel(LS_REMEMBER);
  }

  /* ============================================================
   *  EVENTS
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
      try { cb(payload); } catch (e) { console.warn('[Auth] listener error:', e); }
    });
  }

  /* ============================================================
   *  EXPORT
   * ============================================================ */
  return {
    token, user, role, exp, sessionInfo,
    setSession, clearSession, isLoggedIn,
    hasRole, isAdmin, isPetugas, isBilik, isCoklit,
    redirectToLogin, homeForRole,
    login, logout, verify,
    rememberedUsername, saveRememberedUsername,
    on, off,
    keys: { TOKEN: LS_TOKEN, USER: LS_USER, EXP: LS_EXP, REMEMBER: LS_REMEMBER },
  };
})();