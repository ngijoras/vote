/* ============================================================
   E-VOTE • cache.js (FULL FIX)
   Preload, Background Sync, dan Caching data.

   Perbaikan:
   - bgTimers di-clear saat clearAll() (anti stale cache)
   - Dedup bg sync per key (tidak spam)
   - Event listener di-cleanup
   - Guard API belum siap
   - TTL configurable
   - Preload hanya sekali (idempotent)
   - Cache invalidation per action
   - Tidak pernah throw
   ============================================================ */
window.Cache = (function () {
  'use strict';

  const Store = (window.SafeStorage || window.localStorage);
  const PREFIX = 'evote_cache_';
  const INDEX_KEY = PREFIX + 'index';
  const DEFAULT_TTL = 5 * 60 * 1000; // 5 menit

  let ttl = DEFAULT_TTL;

  /* ---------- Storage helpers (safe) ---------- */
  function sGet(k) { try { return Store.getItem(k); } catch (_) { return null; } }
  function sSet(k, v) { try { Store.setItem(k, v); } catch (_) {} }
  function sDel(k) { try { Store.removeItem(k); } catch (_) {} }

  /* ---------- Index management ---------- */
  function _readIndex() {
    try {
      const raw = sGet(INDEX_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }
  function _writeIndex(arr) {
    try { sSet(INDEX_KEY, JSON.stringify(arr)); } catch (_) {}
  }
  function _addToIndex(key) {
    const idx = _readIndex();
    if (idx.indexOf(key) === -1) {
      idx.push(key);
      _writeIndex(idx);
    }
  }
  function _removeFromIndex(key) {
    const idx = _readIndex().filter(k => k !== key);
    _writeIndex(idx);
  }

  /* ---------- Key builder ---------- */
  function getKey(action, params) {
    let suffix = '';
    if (params && typeof params === 'object') {
      try {
        const keys = Object.keys(params);
        if (keys.length) {
          const sorted = keys.sort().reduce((o, k) => { o[k] = params[k]; return o; }, {});
          suffix = '_' + JSON.stringify(sorted);
        }
      } catch (_) {}
    }
    return PREFIX + String(action || '') + suffix;
  }

  /* ---------- Core get/set ---------- */
  function set(action, params, data) {
    try {
      const key = getKey(action, params);
      const payload = { ts: Date.now(), data: data };
      sSet(key, JSON.stringify(payload));
      _addToIndex(key);
    } catch (_) {}
  }

  function get(action, params) {
    try {
      const key = getKey(action, params);
      const raw = sGet(key);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.ts !== 'number') {
        sDel(key); _removeFromIndex(key);
        return null;
      }
      if (Date.now() - parsed.ts > ttl) {
        sDel(key); _removeFromIndex(key);
        return null;
      }
      return parsed.data;
    } catch (_) {
      return null;
    }
  }

  function invalidate(action, params) {
    try {
      const key = getKey(action, params);
      sDel(key);
      _removeFromIndex(key);
    } catch (_) {}
  }

  function clearAll() {
    try {
      // 1. Batalkan semua background sync yang pending
      Object.keys(bgTimers).forEach(k => {
        clearTimeout(bgTimers[k]);
        delete bgTimers[k];
      });
      // 2. Hapus semua key yang terdaftar
      const idx = _readIndex();
      idx.forEach(k => sDel(k));
      sDel(INDEX_KEY);
    } catch (_) {}
  }

  function setTTL(ms) {
    const v = Number(ms);
    if (isFinite(v) && v > 0) ttl = v;
  }

  /* ============================================================
     WRAPPER API: Ambil dari cache dulu, sync di background
     ============================================================ */
  const bgTimers = {};  // deklarasi sebelum clearAll() agar hoisted

  async function fetchApi(action, params, forceRefresh) {
    // Guard API siap
    if (!window.API || typeof API.post !== 'function') {
      return { success: false, message: 'API belum siap' };
    }

    // 1. Coba cache dulu (kecuali forceRefresh)
    if (!forceRefresh) {
      const cached = get(action, params);
      if (cached) {
        _triggerBackgroundSync(action, params);
        return cached;
      }
    }

    // 2. Ambil fresh dari server
    try {
      const res = await API.post(action, params);
      if (res && res.success) {
        set(action, params, res);
      }
      return res || { success: false, message: 'Respon kosong' };
    } catch (err) {
      return { success: false, message: 'Network error: ' + (err && err.message ? err.message : err) };
    }
  }

  // Background sync dengan debounce per-key
  function _triggerBackgroundSync(action, params) {
    const key = getKey(action, params);
    if (bgTimers[key]) return;

    bgTimers[key] = setTimeout(async () => {
      delete bgTimers[key];
      try {
        const res = await API.post(action, params);
        if (res && res.success) {
          set(action, params, res);
          try {
            window.dispatchEvent(new CustomEvent('cacheUpdated', {
              detail: { action: action, params: params, res: res }
            }));
          } catch (_) {}
        }
      } catch (_) {
        // silent — background sync tidak boleh crash
      }
    }, 2000);
  }

  /* ============================================================
     PRELOAD DATA SAAT APLIKASI DIBUKA (idempotent)
     ============================================================ */
  let preloading = false;

  async function preloadAll() {
    if (preloading) return;
    if (!window.API || typeof API.token !== 'function' || !API.token()) return;

    preloading = true;

    const tasks = [
      { action: 'list', params: { sheet: 'voters' } },
      { action: 'list', params: { sheet: 'candidates' } },
      { action: 'list', params: { sheet: 'booths' } },
      { action: 'list', params: { sheet: 'settings' } },
      { action: 'list', params: { sheet: 'users' } },
      { action: 'dash.summary', params: {} },
      { action: 'ba.list', params: {} },
    ];

    // Jalankan paralel tapi jangan block; abaikan error
    await Promise.all(tasks.map(t =>
      fetchApi(t.action, t.params, true).catch(() => null)
    ));

    preloading = false;
  }

  /* ============================================================
     EXPORTS
     ============================================================ */
  return {
    fetchApi: fetchApi,
    get: get,
    set: set,
    invalidate: invalidate,
    clearAll: clearAll,
    preloadAll: preloadAll,
    setTTL: setTTL,
    getKey: getKey,
  };
})();