/* ============================================================
   E-VOTE • cache.js (FULL FIX - FINAL)
   Fitur: TTL, Anti Simpan Error, Preload Parallel, Background Sync.
   ============================================================ */
window.Cache = (function () {
  'use strict';

  const Store = (window.SafeStorage || window.localStorage);
  const PREFIX = 'evote_cache_';
  const INDEX_KEY = PREFIX + 'index';
  const TTL = 5 * 60 * 1000; // 5 menit

  /* ---------- Index Helpers ---------- */
  function _addToIndex(key) {
    try {
      let idx = JSON.parse(Store.getItem(INDEX_KEY) || '[]');
      if (idx.indexOf(key) === -1) {
        idx.push(key);
        Store.setItem(INDEX_KEY, JSON.stringify(idx));
      }
    } catch (_) {}
  }

  function _removeFromIndex(key) {
    try {
      let idx = JSON.parse(Store.getItem(INDEX_KEY) || '[]');
      idx = idx.filter(function (k) { return k !== key; });
      Store.setItem(INDEX_KEY, JSON.stringify(idx));
    } catch (_) {}
  }

  /* ---------- Key Generator ---------- */
  function getKey(action, params) {
    return PREFIX + action + (params && Object.keys(params).length ? '_' + JSON.stringify(params) : '');
  }

  /* ---------- Core Cache Operations ---------- */
  function set(action, params, data) {
    try {
      // ✅ Hanya simpan jika data valid
      if (!data || data.success !== true) {
        console.warn('[Cache] Skip simpan (data tidak sukses):', action);
        return;
      }
      const key = getKey(action, params);
      Store.setItem(key, JSON.stringify({ ts: Date.now(), data: data }));
      _addToIndex(key);
    } catch (_) {}
  }

  function get(action, params) {
    try {
      const key = getKey(action, params);
      const raw = Store.getItem(key);
      if (!raw) return null;

      const parsed = JSON.parse(raw);

      // Cek TTL
      if (!parsed.ts || (Date.now() - parsed.ts > TTL)) {
        Store.removeItem(key);
        _removeFromIndex(key);
        return null;
      }

      // ✅ Validasi cache
      if (!parsed.data || parsed.data.success !== true) {
        Store.removeItem(key);
        _removeFromIndex(key);
        return null;
      }

      return parsed.data;
    } catch (_) { return null; }
  }

  /* ---------- Clear All ---------- */
  const bgTimers = {};

  function clearAll() {
    try {
      const idx = JSON.parse(Store.getItem(INDEX_KEY) || '[]');
      idx.forEach(function (key) {
        try { Store.removeItem(key); } catch (_) {}
      });
      Store.removeItem(INDEX_KEY);

      // Batalkan background sync
      Object.keys(bgTimers).forEach(function (k) {
        clearTimeout(bgTimers[k]);
        delete bgTimers[k];
      });
    } catch (_) {}
  }

  /* ---------- Smart Fetch API (Stale-While-Revalidate) ---------- */
  async function fetchApi(action, params, forceRefresh) {
    const key = getKey(action, params);

    // 1. Coba cache dulu
    if (!forceRefresh) {
      const cached = get(action, params);
      if (cached) {
        // Tampilkan data cache, lalu perbarui diam-diam di background
        _triggerBackgroundSync(action, params, key);
        return cached;
      }
    }

    // 2. Fetch API
    let res;
    try {
      res = await API.post(action, params);
    } catch (err) {
      console.error('[Cache] API error:', err);
      return {
        success: false,
        message: 'Gagal terhubung ke server: ' + (err.message || err),
        networkError: true
      };
    }

    // ✅ Simpan ke cache HANYA jika sukses
    if (res && res.success) {
      set(action, params, res);
    }

    return res;
  }

  /* ---------- Background Sync ---------- */
  function _triggerBackgroundSync(action, params, key) {
    if (bgTimers[key]) return;

    bgTimers[key] = setTimeout(async () => {
      delete bgTimers[key];
      try {
        const res = await API.post(action, params);
        if (res && res.success) {
          set(action, params, res);
          window.dispatchEvent(new CustomEvent('cacheUpdated', {
            detail: { action: action, params: params, res: res }
          }));
        }
      } catch (_) {}
    }, 2000);
  }

  /* ---------- Preload All (Promise All) ---------- */
  async function preloadAll() {
    if (!window.API || !API.token || !API.token()) return;

    const tasks = [
      { action: 'list', params: { sheet: 'voters' } },
      { action: 'list', params: { sheet: 'candidates' } },
      { action: 'list', params: { sheet: 'booths' } },
      { action: 'list', params: { sheet: 'settings' } },
      { action: 'list', params: { sheet: 'users' } },
      { action: 'list', params: { sheet: 'attendance' } },
      { action: 'dash.summary', params: {} },
      { action: 'results', params: {} },
      { action: 'ba.list', params: {} },
      { action: 'coklit.report', params: {} }
    ];

    // ✅ Promise.all: Jalankan paralel agar cepat
    const promises = tasks.map(function (t) {
      return fetchApi(t.action, t.params, true).catch(function () {});
    });

    await Promise.all(promises);
    console.log('[Cache] ✅ Preload selesai. ' + tasks.length + ' endpoint siap.');
  }

  /* ---------- Exports ---------- */
  return {
    fetchApi: fetchApi,
    clearAll: clearAll,
    preloadAll: preloadAll
  };
})();