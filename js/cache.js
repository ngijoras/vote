/* ============================================================
   E-VOTE • cache.js (FULL FIX - SMART PRELOAD)
   Fitur: TTL, Auto-Index, Stale-While-Revalidate, PreloadAll.
   ============================================================ */
window.Cache = (function () {
  'use strict';

  const Store = (window.SafeStorage || window.localStorage);
  const PREFIX = 'evote_cache_';
  const INDEX_KEY = PREFIX + 'index';
  const TTL = 5 * 60 * 1000; // 5 menit

  /* ---------- Index Helpers (Agar bisa clearAll) ---------- */
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

  /* ---------- Key Generator ---------- */
  function getKey(action, params) {
    return PREFIX + action + (params && Object.keys(params).length ? '_' + JSON.stringify(params) : '');
  }

  /* ---------- Core Cache Operations ---------- */
  function set(action, params, data) {
    try {
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
      
      // Cek TTL (Kedaluwarsa)
      if (Date.now() - parsed.ts > TTL) {
        Store.removeItem(key); 
        _removeFromIndex(key);
        return null;
      }
      
      return parsed.data;
    } catch (_) { return null; }
  }

  /* ---------- Clear Cache ---------- */
  const bgTimers = {};

  function clearAll() {
    try {
      const idx = JSON.parse(Store.getItem(INDEX_KEY) || '[]');
      idx.forEach(key => Store.removeItem(key));
      Store.removeItem(INDEX_KEY);
      
      // Batalkan semua antrean background sync
      Object.keys(bgTimers).forEach(k => { 
        clearTimeout(bgTimers[k]); 
        delete bgTimers[k]; 
      });
    } catch (_) {}
  }

  /* ---------- Smart Fetch API ---------- */
  async function fetchApi(action, params, forceRefresh) {
    const key = getKey(action, params);
    
    // 1. Jika tidak memaksa refresh, coba ambil dari cache
    if (!forceRefresh) {
      const cached = get(action, params);
      if (cached) {
        // Tampilkan data cache, lalu perbarui diam-diam di background
        _triggerBackgroundSync(action, params, key);
        return cached;
      }
    }

    // 2. Jika tidak ada cache / forceRefresh, ambil dari API
    const res = await API.post(action, params);
    if (res && res.success) set(action, params, res);
    return res;
  }

  /* ---------- Background Sync (Stale-While-Revalidate) ---------- */
  function _triggerBackgroundSync(action, params, key) {
    if (bgTimers[key]) return; // Cegah multiple request
    
    bgTimers[key] = setTimeout(async () => {
      delete bgTimers[key];
      try {
        const res = await API.post(action, params);
        if (res && res.success) {
          set(action, params, res);
          // Beri sinyal ke aplikasi bahwa data sudah diperbarui di background
          window.dispatchEvent(new CustomEvent('cacheUpdated', { detail: { action, params, res } }));
        }
      } catch (_) {}
    }, 2000); // Delay 2 detik agar tidak bentrok dengan render awal
  }

  /* ---------- Preload All (Saat pertama kali login) ---------- */
  async function preloadAll() {
    if (!window.API || !API.token || !API.token()) return;
    
    // Daftar semua API yang harus disedot datanya
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
      { action: 'coklit.report', params: {} } // ✅ Rekap Coklit
    ];

    // Jalankan semua request secara paralel
    tasks.forEach(t => fetchApi(t.action, t.params, true).catch(() => {}));
  }

  /* ---------- Exports ---------- */
  return {
    fetchApi: fetchApi,
    clearAll: clearAll,
    preloadAll: preloadAll
  };
})();