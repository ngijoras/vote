/* ============================================================
   E-VOTE • router.js (FULL FIX)
   Hash-based SPA Router + Auth Guard + Role Guard + Cleanup.
   - Gunakan SafeStorage (fallback memory mode)
   - Verify token server-side, tidak loop redirect
   - Cleanup anti memory-leak (poll, camera, voice, QR, clock)
   - Guard error per-route agar 1 view crash tidak matikan app
   - Navigate idempotent (tidak double-render saat hashchange dobel)
   ============================================================ */
(function () {
  'use strict';

  /* ============================================================
   *  0. STORAGE RESOLVER
   * ============================================================ */
  const Store = window.SafeStorage || window.localStorage;

  function safeGet(k) {
    try { return Store.getItem(k); } catch (_) { return null; }
  }
  function safeDel(k) {
    try { Store.removeItem(k); } catch (_) {}
  }

  /* ============================================================
   *  1. AUTH GUARD
   * ============================================================ */
  const token   = safeGet('evote_token');
  const userRaw = safeGet('evote_user');

  let u = null;
  try { u = userRaw ? JSON.parse(userRaw) : null; } catch (_) { u = null; }

  if (!token || !u || !u.role) {
    location.replace('login.html');
    return;
  }

  /* ---------- Verify token server-side (silent, satu kali) ---------- */
  let verified = false;
  (function verifyToken() {
    if (!window.API || typeof API.post !== 'function') {
      verified = true; // fallback: anggap OK bila API belum siap
      return;
    }
    API.post('me')
      .then((r) => {
        verified = true;
        if (!r || !r.success) {
          safeDel('evote_token');
          safeDel('evote_user');
          safeDel('evote_exp');
          if (window.Cache && Cache.clearAll) Cache.clearAll();
          location.replace('login.html');
        }
      })
      .catch(() => {
        // network error → biarkan sesi lokal tetap valid
        verified = true;
      });
  })();

  /* ============================================================
   *  2. MENUS & ROUTES
   * ============================================================ */
  const MENUS = {
    admin: [
      { path: 'admin',              label: 'Dashboard',    icon: '📊' },
      { path: 'admin/voters',       label: 'Pemilih',      icon: '👥' },
      { path: 'admin/candidates',   label: 'Calon',        icon: '🏅' },
      { path: 'admin/booths',       label: 'Bilik',        icon: '🚪' },
      { path: 'admin/users',        label: 'Pengguna',     icon: '🔐' },
      { path: 'admin/invitations',  label: 'Undangan',     icon: '✉️' },
      { path: 'admin/results',      label: 'Hasil',        icon: '📈' },
      { path: 'admin/berita-acara', label: 'Berita Acara', icon: '📜' },
      { path: 'admin/settings',     label: 'Pengaturan',   icon: '⚙️' },
    ],
    petugas: [
      { path: 'petugas',              label: 'Dashboard',    icon: '📊' },
      { path: 'petugas/attendance',   label: 'Absensi',      icon: '📷' },
      { path: 'petugas/queue',        label: 'Antrian',      icon: '🚪' },
      { path: 'petugas/results',      label: 'Hasil',        icon: '📈' },
      { path: 'petugas/berita-acara', label: 'Berita Acara', icon: '📜' },
    ],
    bilik: [
      { path: 'bilik', label: 'Bilik Voting', icon: '🗳️' },
    ],
  };

  const ROUTES = {
    /* ---------- ADMIN ---------- */
    'admin':               { title: 'Dashboard',        roles: ['admin'],            fn: () => ViewsAdmin.dashboard() },
    'admin/voters':        { title: 'Data Pemilih',     roles: ['admin'],            fn: () => ViewsAdmin.voters() },
    'admin/candidates':    { title: 'Data Calon',       roles: ['admin'],            fn: () => ViewsAdmin.candidates() },
    'admin/booths':        { title: 'Manajemen Bilik',  roles: ['admin'],            fn: () => ViewsAdmin.booths() },
    'admin/users':         { title: 'Pengguna',         roles: ['admin'],            fn: () => ViewsAdmin.users() },
    'admin/invitations':   { title: 'Undangan Pemilih', roles: ['admin'],            fn: () => ViewsAdmin.invitations() },
    'admin/results':       { title: 'Hasil Real-Time',  roles: ['admin', 'petugas'], fn: () => ViewsAdmin.results() },
    'admin/berita-acara':  { title: 'Berita Acara',     roles: ['admin', 'petugas'], fn: () => ViewsAdmin.beritaAcara() },
    'admin/settings':      { title: 'Pengaturan Sistem',roles: ['admin'],            fn: () => ViewsAdmin.settings() },

    /* ---------- PETUGAS ---------- */
    'petugas':             { title: 'Dashboard Petugas',roles: ['petugas', 'admin'], fn: () => ViewsPetugas.dashboard() },
    'petugas/attendance':  { title: 'Absensi Pemilih',  roles: ['petugas', 'admin'], fn: () => ViewsPetugas.attendance() },
    'petugas/queue':       { title: 'Antrian & Bilik',  roles: ['petugas', 'admin'], fn: () => ViewsPetugas.queue() },
    'petugas/results':     { title: 'Hasil Real-Time',  roles: ['petugas', 'admin'], fn: () => ViewsAdmin.results() },
    'petugas/berita-acara':{ title: 'Berita Acara',     roles: ['petugas', 'admin'], fn: () => ViewsAdmin.beritaAcara() },

    /* ---------- BILIK ---------- */
    'bilik':               { title: 'Bilik Voting',     roles: ['bilik'],            fn: () => ViewsBilik.dashboard() },
  };

  const DEFAULT_ROUTE = {
    admin:   'admin',
    petugas: 'petugas',
    bilik:   'bilik',
  };

  /* ============================================================
   *  3. CLEANUP (dipanggil sebelum setiap route switch)
   * ============================================================ */
  function cleanup() {
    try { if (window.ViewsAdmin   && ViewsAdmin._clearAllPolls)   ViewsAdmin._clearAllPolls();   } catch (_) {}
    try { if (window.ViewsPetugas && ViewsPetugas._clearAllPolls) ViewsPetugas._clearAllPolls(); } catch (_) {}
    try { if (window.ViewsBilik   && ViewsBilik._clearAllPolls)   ViewsBilik._clearAllPolls();   } catch (_) {}
    try { if (window.QR    && QR.stop)    QR.stop();    } catch (_) {}
    try { if (window.Voice && Voice.stop) Voice.stop(); } catch (_) {}
    try { if (window.UI    && UI.closeModal) UI.closeModal(); } catch (_) {}
  }

  /* ============================================================
   *  4. SIDEBAR + NAV RENDER
   * ============================================================ */
  function renderNav(activePath) {
    const nav = document.getElementById('nav');
    if (!nav) return;
    const list = MENUS[u.role] || [];

    nav.innerHTML = list.map((m) => {
      const active = m.path === activePath ? ' active' : '';
      return `<a href="#/${m.path}" class="nav-item${active}" data-path="${m.path}">
        <span class="ico" aria-hidden="true">${m.icon}</span>
        <span>${UI.escapeHtml(m.label)}</span>
      </a>`;
    }).join('');
  }

  function updateActive(path) {
    document.querySelectorAll('.nav-item').forEach((el) => {
      el.classList.toggle('active', el.getAttribute('data-path') === path);
    });
  }

  /* ============================================================
   *  5. MOBILE SIDEBAR
   * ============================================================ */
  let backdrop = null;

  function ensureBackdrop() {
    if (backdrop && document.body.contains(backdrop)) return backdrop;
    backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    backdrop.style.cssText = [
      'position:fixed', 'inset:0',
      'background:rgba(15,23,42,.45)',
      'z-index:40',
      'opacity:0', 'pointer-events:none',
      'transition:opacity .25s ease',
    ].join(';');
    backdrop.addEventListener('click', closeSidebar);
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function openSidebar() {
    const sb = document.querySelector('.sidebar');
    const bd = ensureBackdrop();
    if (sb) sb.classList.add('open');
    bd.style.opacity = '1';
    bd.style.pointerEvents = 'auto';
  }

  function closeSidebar() {
    const sb = document.querySelector('.sidebar');
    const bd = ensureBackdrop();
    if (sb) sb.classList.remove('open');
    bd.style.opacity = '0';
    bd.style.pointerEvents = 'none';
  }

  function toggleSidebar() {
    const sb = document.querySelector('.sidebar');
    if (sb && sb.classList.contains('open')) closeSidebar();
    else openSidebar();
  }

  /* ============================================================
   *  6. CLOCK (auto-cleanup)
   * ============================================================ */
  let clockTimer = null;

  function startClock() {
    const el = document.getElementById('clock');
    if (!el) return;
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }

    const tick = () => {
      try {
        const d = new Date();
        const day  = d.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short' });
        const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        el.textContent = `${day} • ${time}`;
      } catch (_) {}
    };
    tick();
    clockTimer = setInterval(tick, 1000);
  }

  function stopClock() {
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  }

  /* ============================================================
   *  7. NAVIGATE (idempotent)
   * ============================================================ */
  let navigating = false;
  let pendingPath = null;

  function parsePath() {
    const raw = (location.hash || '').replace(/^#\/?/, '').trim();
    return raw;
  }

  function defaultPath() {
    return DEFAULT_ROUTE[u.role] || 'admin';
  }

  async function navigate() {
    // Idempotent: jika sedang navigasi, simpan request terakhir
    if (navigating) { pendingPath = parsePath(); return; }
    navigating = true;

    try {
      const path  = parsePath();
      const view  = document.getElementById('view');
      const title = document.getElementById('pageTitle');

      if (!path) {
        location.replace('#/' + defaultPath());
        return;
      }

      const route = ROUTES[path];

      if (!route) {
        if (title) title.textContent = 'Tidak Ditemukan';
        if (view) {
          view.innerHTML = `
            <div class="card text-center" style="padding:40px">
              <h1 style="font-size:3rem;margin:0">404</h1>
              <h3 style="margin-top:8px">Halaman Tidak Ditemukan</h3>
              <p class="hint">Route "${UI.escapeHtml(path)}" tidak tersedia.</p>
              <a href="#/${defaultPath()}" class="btn-primary" style="margin-top:16px">
                Kembali ke Dashboard
              </a>
            </div>`;
        }
        updateActive('');
        return;
      }

      if (route.roles && route.roles.indexOf(u.role) === -1) {
        UI.toast('Anda tidak memiliki akses ke halaman ini', 'error');
        location.replace('#/' + defaultPath());
        return;
      }

      // Cleanup sebelum pindah
      cleanup();
      closeSidebar();

      if (title) title.textContent = route.title;
      document.title = `${route.title} • E-Vote`;
      updateActive(path);

      try { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }
      catch (_) { window.scrollTo(0, 0); }

      try {
        await route.fn();
      } catch (err) {
        console.error('[router] view error:', err);
        if (view) {
          view.innerHTML = `
            <div class="card">
              <h3 style="color:var(--err)">Terjadi Kesalahan</h3>
              <p class="hint">${UI.escapeHtml(err && err.message ? err.message : String(err))}</p>
              <button class="btn-primary" type="button" onclick="location.reload()">
                Muat Ulang Halaman
              </button>
            </div>`;
        }
      }
    } finally {
      navigating = false;
      // Jika ada request navigasi baru saat kita masih proses, jalankan sekali lagi
      if (pendingPath !== null) {
        pendingPath = null;
        setTimeout(navigate, 0);
      }
    }
  }

  /* ============================================================
   *  8. INIT
   * ============================================================ */
  function init() {
    /* User info */
    const userNameEl = document.getElementById('userName');
    const userRoleEl = document.getElementById('userRole');
    if (userNameEl) userNameEl.textContent = u.name || u.username || '—';
    if (userRoleEl) userRoleEl.textContent = (u.role || '').toUpperCase();

    /* Nav */
    const currentPath = parsePath() || defaultPath();
    renderNav(currentPath);

    /* Menu toggle (mobile) */
    const btnMenu = document.getElementById('btnMenu');
    if (btnMenu && !btnMenu.dataset.bound) {
      btnMenu.dataset.bound = '1';
      btnMenu.addEventListener('click', toggleSidebar);
    }

    /* Auto-close sidebar */
    const nav = document.getElementById('nav');
    if (nav && !nav.dataset.bound) {
      nav.dataset.bound = '1';
      nav.addEventListener('click', (e) => {
        if (e.target.closest('.nav-item')) closeSidebar();
      });
    }

    /* Logout button */
    document.querySelectorAll('[data-logout]').forEach((btn) => {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';

      btn.addEventListener('click', async () => {
        let ok = true;
        if (window.UI && UI.confirm) {
          ok = await UI.confirm('Keluar dari aplikasi?', { okLabel: 'Ya, Keluar' });
        } else {
          ok = window.confirm('Keluar dari aplikasi?');
        }
        if (!ok) return;

        cleanup();
        stopClock();
        if (window.API && API.logout) API.logout();
      });
    });

    /* TOMBOL GLOBAL REFRESH */
    const btnRefresh = document.getElementById('btnGlobalRefresh');
    if (btnRefresh && !btnRefresh.dataset.bound) {
      btnRefresh.dataset.bound = '1';
      btnRefresh.addEventListener('click', async () => {
        btnRefresh.classList.add('loading');
        btnRefresh.disabled = true;
        try {
          if (window.Cache) Cache.clearAll();
          await navigate();
          if (window.UI) UI.toast('Data berhasil diperbarui', 'success');
        } catch (err) {
          if (window.UI) UI.toast('Gagal refresh: ' + err.message, 'error');
        } finally {
          btnRefresh.classList.remove('loading');
          btnRefresh.disabled = false;
        }
      });
    }

    /* PRELOAD DATA DI BACKGROUND (hanya sekali) */
    if (window.Cache && Cache.preloadAll && !window.__evotePreloaded) {
      window.__evotePreloaded = true;
      Cache.preloadAll();
    }

    /* Clock & Routing */
    startClock();
    window.addEventListener('hashchange', navigate);

    window.addEventListener('beforeunload', () => {
      cleanup();
      stopClock();
    });

    navigate();
  }

  /* ============================================================
   *  9. BOOT
   * ============================================================ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();