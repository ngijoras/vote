/* ============================================================
   E-VOTE • storage.js
   Safe Wrapper untuk localStorage.
   Fitur: Fallback ke Memory Storage jika localStorage diblokir
   (misal: Safari Private Mode, Edge Tracking Prevention, dsb).
   ============================================================ */
window.SafeStorage = (function () {
  'use strict';

  const mem = new Map();
  let blocked = false;

  // Uji coba apakah localStorage bisa diakses
  try {
    const testKey = '__evote_test__' + Date.now();
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
  } catch (e) {
    blocked = true;
    console.warn('[SafeStorage] localStorage diblokir. Menggunakan Memory Storage.');
  }

  return {
    getItem: function (key) {
      if (blocked) return mem.has(key) ? mem.get(key) : null;
      try {
        return window.localStorage.getItem(key);
      } catch (e) {
        blocked = true;
        return mem.has(key) ? mem.get(key) : null;
      }
    },

    setItem: function (key, value) {
      if (blocked) {
        mem.set(key, String(value));
        return;
      }
      try {
        window.localStorage.setItem(key, String(value));
      } catch (e) {
        blocked = true;
        mem.set(key, String(value));
      }
    },

    removeItem: function (key) {
      if (blocked) {
        mem.delete(key);
        return;
      }
      try {
        window.localStorage.removeItem(key);
      } catch (e) {
        blocked = true;
        mem.delete(key);
      }
    },

    isBlocked: function () {
      return blocked;
    },

    mode: function () {
      return blocked ? 'memory' : 'local';
    }
  };
})();