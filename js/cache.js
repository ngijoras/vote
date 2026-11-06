/* ============================================================
   E-VOTE • cache.js
   Mengatur Preload, Background Sync, dan Caching data.
   ============================================================ */
window.Cache = (function () {
  'use strict';

  const Store = (window.SafeStorage || window.localStorage);
  const PREFIX = 'evote_cache_';
  const INDEX_KEY = PREFIX + 'index';
  const TTL = 5 * 60 * 1000; // 5 menit masa berlaku cache

  /* ---------- Helper: Manage Index Keys ---------- */
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
      idx = idx.filter(function(k) { return k !== key; });
      Store.setItem(INDEX_KEY, JSON.stringify(idx));
    } catch (_) {}
  }

  /* ---------- Core Methods ---------- */
  function getKey(action, params) {
    return PREFIX + action + (params && Object.keys(params).length ? '_' + JSON.stringify(params) : '');
  }

  function set(action, params, data) {
    try {
      const key = getKey(action, params);
      const payload = { ts: Date.now(), data: data };
      Store.setItem(key, JSON.stringify(payload));
      _addToIndex(key);
    } catch (_) {}
  }

  function get(action, params) {
    try {
      const key = getKey(action, params);
      const raw = Store.getItem(key);
      if (!raw) return null;
      
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.ts > TTL) {
        Store.removeItem(key);
        _removeFromIndex(key);
        return null; // Expired
      }
      return parsed.data;
    } catch (_) { return null; }
  }

  function clearAll() {
    try {
      const idx = JSON.parse(Store.getItem(INDEX_KEY) || '[]');
      idx.forEach(function(key) {
        Store.removeItem(key);
      });
      Store.removeItem(INDEX_KEY);
    } catch (_) {}
  }

  /* ============================================================
     WRAPPER API: Ambil dari cache dulu, lalu sync di background
     ============================================================ */
  const bgTimers = {};

  async function fetchApi(action, params, forceRefresh) {
    const key = getKey(action, params);

    // 1. Jika tidak dipaksa refresh, coba ambil dari cache
    if (!forceRefresh) {
      const cached = get(action, params);
      if (cached) {
        // Tampilkan data cache seketika (0 detik)
        // Lalu tembak background fetch untuk update senyap
        _triggerBackgroundSync(action, params, key);
        return cached;
      }
    }

    // 2. Jika cache kosong, expired, atau dipaksa refresh (forceRefresh=true)
    const res = await API.post(action, params);
    if (res && res.success) {
      set(action, params, res);
    }
    return res;
  }

  // Background Sync (Debounce 2 detik agar tidak spam request)
  function _triggerBackgroundSync(action, params, key) {
    if (bgTimers[key]) return;
    
    bgTimers[key] = setTimeout(async () => {
      delete bgTimers[key];
      const res = await API.post(action, params);
      if (res && res.success) {
        set(action, params, res);
        // Beri tahu UI jika ada update dari background (opsional)
        window.dispatchEvent(new CustomEvent('cacheUpdated', { detail: { action, params, res } }));
      }
    }, 2000);
  }

  /* ============================================================
     PRELOAD DATA SAAT APLIKASI DIBUKA
     ============================================================ */
  async function preloadAll() {
    // Hanya preload jika sudah login (ada token)
    if (!API.token || !API.token()) return;

    const tasks = [
      { action: 'list', params: { sheet: 'voters' } },
      { action: 'list', params: { sheet: 'candidates' } },
      { action: 'list', params: { sheet: 'booths' } },
      { action: 'list', params: { sheet: 'settings' } },
      { action: 'list', params: { sheet: 'users' } },
      { action: 'dash.summary', params: {} },
      { action: 'ba.list', params: {} }
    ];
    
    // Jalankan secara paralel di background
    tasks.forEach(function(t) {
      fetchApi(t.action, t.params, true).catch(function() {});
    });
  }

  return {
    fetchApi: fetchApi,
    clearAll: clearAll,
    preloadAll: preloadAll
  };
})();