/* ============================================================
   E-VOTE • api.js
   Wrapper HTTP Fetch untuk Google Apps Script.
   ============================================================ */
window.API = (function () {
  'use strict';

  /* ⚠️ GANTI URL INI DENGAN URL DEPLOY APPS SCRIPT ANDA (Yang berakhiran /exec) */
  const BASE_URL = 'https://script.google.com/macros/s/AKfycbzmmSTjkNQ4QONiyntL7TQzuoHiEepI3HZqs6CuBV20eb8CnyJfFRqkfT514-y02jsldQ/exec';
  
  const TIMEOUT_MS = 25000;

  /* ---------- STORAGE HELPER ---------- */
  const LS_TOKEN = 'evote_token';
  const LS_USER  = 'evote_user';
  // Gunakan SafeStorage jika ada (dari storage.js), jika tidak gunakan localStorage biasa
  const Store = (window.SafeStorage || window.localStorage);

  /* ---------- SESSION HELPERS ---------- */
  function getToken() {
    try { return Store.getItem(LS_TOKEN) || ''; } catch (_) { return ''; }
  }

  function getUser() {
    try {
      const raw = Store.getItem(LS_USER);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function setSession(token, user) {
    try {
      if (token) Store.setItem(LS_TOKEN, token);
      if (user) Store.setItem(LS_USER, JSON.stringify(user));
    } catch (_) {}
  }

  function clearSession() {
    try {
      Store.removeItem(LS_TOKEN);
      Store.removeItem(LS_USER);
    } catch (_) {}
  }

  function isLoggedIn() {
    return !!getToken() && !!getUser();
  }

  /* ---------- CORE REQUEST ---------- */
  async function request(payload, opts) {
    opts = opts || {};
    const method = opts.method || 'POST';
    const timeout = opts.timeout || TIMEOUT_MS;

    // Validasi URL
    if (!BASE_URL || /XXXX_DEPLOY_ID_XXXX/.test(BASE_URL)) {
      return {
        success: false,
        message: 'URL Backend (Apps Script) belum diatur di js/api.js',
        configError: true
      };
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => { try { controller.abort(); } catch (_) {} }, timeout) : null;

    let res;
    try {
      res = await fetch(BASE_URL, {
        method: method,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // WAJIB text/plain untuk Apps Script
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined,
        redirect: 'follow',
        cache: 'no-store'
      });
    } catch (err) {
      if (timer) clearTimeout(timer);
      const isAbort = err && (err.name === 'AbortError' || /aborted/i.test(err.message || ''));
      return {
        success: false,
        message: isAbort ? 'Koneksi timeout. Periksa internet Anda.' : 'Gagal terhubung ke server.',
        networkError: true
      };
    }

    if (timer) clearTimeout(timer);

    const text = await (async () => {
      try { return await res.text(); } catch (_) { return ''; }
    })();

    if (!res.ok) {
      return {
        success: false,
        message: 'Server Error (HTTP ' + res.status + ').',
        httpStatus: res.status,
        raw: text.slice(0, 200)
      };
    }

    // Parse JSON (Apps Script kadang return HTML jika terjadi error script)
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      const isHtml = /^\s*<(?:!doctype|html)/i.test(text);
      return {
        success: false,
        message: isHtml 
          ? 'Respon server bukan JSON. Pastikan Web App Apps Script di-deploy dengan akses "Anyone".' 
          : 'Respon server tidak valid.',
        raw: text.slice(0, 200),
        parseError: true
      };
    }

    if (!data || typeof data !== 'object') {
      return { success: false, message: 'Respon server kosong.' };
    }
    
    if (typeof data.success === 'undefined') data.success = true;
    return data;
  }

  /* ---------- HTTP METHODS ---------- */
  async function post(action, data) {
    data = data || {};
    const payload = Object.assign({ action, token: getToken() }, data);
    const res = await request(payload);

    // Auto-logout jika token expired (kecuali dari halaman login/me)
    if (
      res && res.success === false &&
      action !== 'login' && action !== 'me' &&
      typeof res.message === 'string' &&
      /token|expired|kadaluarsa|login ulang|sesi habis/i.test(res.message)
    ) {
      clearSession();
      res.sessionExpired = true;
    }

    return res;
  }

  async function get(action, params) {
    params = params || {};
    if (!BASE_URL || /XXXX_DEPLOY_ID_XXXX/.test(BASE_URL)) {
      return { success: false, message: 'URL Backend belum diatur.' };
    }
    const qs = new URLSearchParams(Object.assign({ action, token: getToken() }, params)).toString();
    try {
      const res = await fetch(BASE_URL + '?' + qs, { cache: 'no-store' });
      if (!res.ok) return { success: false, message: 'HTTP ' + res.status };
      const txt = await res.text();
      try { return JSON.parse(txt); } catch (_) { return { success: false, message: 'Invalid JSON' }; }
    } catch (err) {
      return { success: false, message: 'Network Error' };
    }
  }

  /* ---------- AUTH METHODS ---------- */
  async function login(username, password) {
    const res = await request({
      action: 'login',
      username: String(username || '').trim(),
      password: String(password || '')
    });
    if (res && res.success && res.token && res.user) {
      setSession(res.token, res.user);
    }
    return res;
  }

  async function logout(opts) {
    opts = opts || {};
    try { await request({ action: 'logout', token: getToken() }); } catch (_) {}
    clearSession();
    if (opts.redirect !== false) {
      // Redirect ke halaman login
      location.replace(opts.redirectTo || 'login.html');
    }
  }

  /* ---------- PUBLIC API (Untuk index.html) ---------- */
  function getPublicCandidates() {
    return post('candidates.public');
  }

  function getPublicSettings() {
    return post('settings.public');
  }

  /* ---------- EXPORTS ---------- */
  return {
    /* Session */
    token: getToken,
    user: getUser,
    isLoggedIn: isLoggedIn,
    setSession: setSession,
    clearSession: clearSession,

    /* Requests */
    post: post,
    get: get,

    /* Auth */
    login: login,
    logout: logout,

    /* Public */
    getPublicCandidates: getPublicCandidates,
    getPublicSettings: getPublicSettings,

    /* Meta */
    BASE: BASE_URL,
    isConfigured: function() {
      return !!BASE_URL && !/XXXX_DEPLOY_ID_XXXX/.test(BASE_URL);
    }
  };
})();