/* ============================================================
   E-VOTE • cache.js (FULL FIX - SMART PRELOAD)
   ============================================================ */
window.Cache = (function () {
  'use strict';

  const Store = (window.SafeStorage || window.localStorage);
  const PREFIX = 'evote_cache_';
  const INDEX_KEY = PREFIX + 'index';
  const TTL = 5 * 60 * 1000; // 5 menit

  function _addToIndex(key) {
    try {
      let idx = JSON.parse(Store.getItem(INDEX_KEY) || '[]');
      if (idx.indexOf(key) === -1) { idx.push(key); Store.setItem(INDEX_KEY, JSON.stringify(idx)); }
    } catch (_) {}
  }
  function _removeFromIndex(key) {
    try {
      let idx = JSON.parse(Store.getItem(INDEX_KEY) || '[]');
      idx = idx.filter(function(k) { return k !== key; });
      Store.setItem(INDEX_KEY, JSON.stringify(idx));
    } catch (_) {}
  }

  function getKey(action, params) {
    return PREFIX + action + (params && Object.keys(params).length ? '_' + JSON.stringify(params) : '');
  }

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
      if (Date.now() - parsed.ts > TTL) {
        Store.removeItem(key); _removeFromIndex(key);
        return null;
      }
      return parsed.data;
    } catch (_) { return null; }
  }

  function clearAll() {
    try {
      const idx = JSON.parse(Store.getItem(INDEX_KEY) || '[]');
      idx.forEach(key => Store.removeItem(key));
      Store.removeItem(INDEX_KEY);
      Object.keys(bgTimers).forEach(k => { clearTimeout(bgTimers[k]); delete bgTimers[k]; });
    } catch (_) {}
  }

  const bgTimers = {};

  async function fetchApi(action, params, forceRefresh) {
    const key = getKey(action, params);
    if (!forceRefresh) {
      const cached = get(action, params);
      if (cached) {
        _triggerBackgroundSync(action, params, key);
        return cached;
      }
    }
    const res = await API.post(action, params);
    if (res && res.success) set(action, params, res);
    return res;
  }

  function _triggerBackgroundSync(action, params, key) {
    if (bgTimers[key]) return;
    bgTimers[key] = setTimeout(async () => {
      delete bgTimers[key];
      const res = await API.post(action, params);
      if (res && res.success) {
        set(action, params, res);
        window.dispatchEvent(new CustomEvent('cacheUpdated', { detail: { action, params, res } }));
      }
    }, 2000);
  }

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
      { action: 'ba.list', params: {} }
    ];
    tasks.forEach(t => fetchApi(t.action, t.params, true).catch(() => {}));
  }

  return { fetchApi, clearAll, preloadAll };
})();