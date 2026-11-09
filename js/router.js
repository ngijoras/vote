/* ============================================================
   E-VOTE • router.js (FULL FIX - FINAL)
   Hash-based SPA Router + Auth Guard + Role Guard + Cleanup.
   Fitur: Instant Render, Preload, Anti-Looping, Logout External.
   ============================================================ */
(function () {
  'use strict';

  /* ============================================================
   *  1. AUTH GUARD (Anti-Looping)
   * ============================================================ */
  const token   = (window.SafeStorage || localStorage).getItem('evote_token');
  const userRaw = (window.SafeStorage || localStorage).getItem('evote_user');

  let u = null;
  try { u = JSON.parse(userRaw); } catch (_) { u = null; }

  if (!token || !u || !u.role) {
    location.replace('login.html');
    return;
  }

  /* ---------- Verify Token (Anti-Looping) ---------- */
  (function verifyToken() {
    if (!window.API || typeof API.post !== 'function') return;

    API.post('me').then((r) => {
      // ✅ JARINGAN ERROR / OFFLINE: JANGAN LOGOUT
      if (r && r.networkError) {
        console.warn('[router] Offline mode, skip verify');
        return;
      }

      // Token benar-benar invalid dari server
      if (!r || !r.success) {
        console.warn('[router] Token invalid. Logging out...');
        (window.SafeStorage || localStorage).removeItem('evote_token');
        (window.SafeStorage || localStorage).removeItem('evote_user');
        if (window.Cache) Cache.clearAll();
        location.replace('login.html');
      }
    }).catch(() => {
      // Catch error jaringan → biarkan user tetap di halaman
      console.warn('[router] Verify catch error');
    });
  })();

  /* ============================================================
   *  2. MENUS & ROUTES
   * ============================================================ */
  const MENUS = {
    admin: [
      { path: 'admin',              label: 'Dashboard',     icon: '📊' },
      { path: 'admin/voters',       label: 'Pemilih',       icon: '👥' },
      { path: 'admin/candidates',   label: 'Calon',         icon: '🏅' },
      { path: 'admin/booths',       label: 'Bilik',         icon: '🚪' },
      { path: 'admin/users',        label: 'Pengguna',      icon: '🔐' },
      { path: 'admin/invitations',  label: 'Undangan',      icon: '✉️' },
      { path: 'admin/results',      label: 'Hasil',         icon: '📈' },
      { path: 'admin/berita-acara', label: 'Berita Acara',  icon: '📜' },
      { path: 'admin/logs',         label: 'Log Aktivitas', icon: '📝' },
      { path: 'admin/settings',     label: 'Pengaturan',    icon: '⚙️' },
    ],
    petugas: [
      { path: 'petugas',              label: 'Dashboard',       icon: '📊' },
      { path: 'petugas/attendance',   label: 'Absensi',         icon: '📷' },
      { path: 'petugas/queue',        label: 'Antrian & Bilik', icon: '🚪' },
      { path: 'petugas/results',      label: 'Hasil',           icon: '📈' },
      { path: 'petugas/berita-acara', label: 'Berita Acara',    icon: '📜' },
    ],
    bilik: [
      { path: 'bilik', label: 'Bilik Voting', icon: '🗳️' },
    ],
    coklit: [
      { path: 'coklit',        label: 'Dashboard Coklit', icon: '📊' },
      { path: 'coklit/voters', label: 'Coklit Pemilih',   icon: '📋' },
    ],
  };

  const ROUTES = {
    /* ADMIN */
    'admin':              { title: 'Dashboard',         roles: ['admin'],            fn: () => ViewsAdmin.dashboard() },
    'admin/voters':       { title: 'Data Pemilih',      roles: ['admin'],            fn: () => ViewsAdmin.voters() },
    'admin/candidates':   { title: 'Data Calon',        roles: ['admin'],            fn: () => ViewsAdmin.candidates() },
    'admin/booths':       { title: 'Manajemen Bilik',   roles: ['admin'],            fn: () => ViewsAdmin.booths() },
    'admin/users':        { title: 'Pengguna',          roles: ['admin'],            fn: () => ViewsAdmin.users() },
    'admin/invitations':  { title: 'Undangan Pemilih',  roles: ['admin'],            fn: () => ViewsAdmin.invitations() },
    'admin/results':      { title: 'Hasil Real-Time',   roles: ['admin', 'petugas'], fn: () => ViewsAdmin.results() },
    'admin/berita-acara': { title: 'Berita Acara',      roles: ['admin', 'petugas'], fn: () => ViewsAdmin.beritaAcara() },
    'admin/logs':         { title: 'Log Aktivitas',     roles: ['admin'],            fn: () => ViewsAdmin.logs() },
    'admin/settings':     { title: 'Pengaturan Sistem', roles: ['admin'],            fn: () => ViewsAdmin.settings() },

    /* PETUGAS */
    'petugas':              { title: 'Dashboard Petugas', roles: ['petugas', 'admin'], fn: () => ViewsPetugas.dashboard() },
    'petugas/attendance':   { title: 'Absensi Pemilih',   roles: ['petugas', 'admin'], fn: () => ViewsPetugas.attendance() },
    'petugas/queue':        { title: 'Antrian & Bilik',   roles: ['petugas', 'admin'], fn: () => ViewsPetugas.queue() },
    'petugas/results':      { title: 'Hasil Real-Time',   roles: ['petugas', 'admin'], fn: () => ViewsAdmin.results() },
    'petugas/berita-acara': { title: 'Berita Acara',      roles: ['petugas', 'admin'], fn: () => ViewsAdmin.beritaAcara() },

    /* BILIK */
    'bilik':                { title: 'Bilik Voting',     roles: ['bilik'],            fn: () => ViewsBilik.dashboard() },

    /* COKLIT */
    'coklit':               { title: 'Dashboard Coklit', roles: ['coklit'],           fn: () => ViewsCoklit.dashboard() },
    'coklit/voters':        { title: 'Coklit Pemilih',   roles: ['coklit'],           fn: () => ViewsCoklit.voters() },
  };

  const DEFAULT_ROUTE = {
    admin:   'admin',
    petugas: 'petugas',
    bilik:   'bilik',
    coklit:  'coklit',
  };

  /* ============================================================
   *  3. CLEANUP
   * ============================================================ */
  function cleanup() {
    try { if (window.ViewsAdmin   && ViewsAdmin._clearAllPolls)   ViewsAdmin._clearAllPolls();   } catch (_) {}
    try { if (window.ViewsPetugas && ViewsPetugas._clearAllPolls) ViewsPetugas._clearAllPolls(); } catch (_) {}
    try { if (window.ViewsBilik   && ViewsBilik._clearAllPolls)   ViewsBilik._clearAllPolls();   } catch (_) {}
    try { if (window.ViewsCoklit  && ViewsCoklit._clearAllPolls)  ViewsCoklit._clearAllPolls();  } catch (_) {}
    try { if (window.QR    && QR.stop)    QR.stop();    } catch (_) {}
    try { if (window.Voice && Voice.stop) Voice.stop(); } catch (_) {}
    try { if (window.UI    && UI.closeModal) UI.closeModal(); } catch (_) {}
  }

  /* ============================================================
   *  4. NAV RENDER
   * ============================================================ */
  function renderNav(activePath) {
    const nav = document.getElementById('nav');
    if (!nav) return;
    const roleKey = String(u.role).toLowerCase();
    const list = MENUS[roleKey] || [];
    if (!list.length) { nav.innerHTML = ''; return; }
    nav.innerHTML = list.map((m) => {
      const active = m.path === activePath ? ' active' : '';
      return `<a href="#/${m.path}" class="nav-item${active}" data-path="${m.path}"><span class="ico">${m.icon}</span><span>${UI.escapeHtml(m.label)}</span></a>`;
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
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:40;opacity:0;pointer-events:none;transition:opacity .25s ease';
    backdrop.addEventListener('click', closeSidebar);
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function openSidebar() {
    const sb = document.querySelector('.sidebar'); const bd = ensureBackdrop();
    if (sb) sb.classList.add('open');
    bd.style.opacity = '1'; bd.style.pointerEvents = 'auto';
  }

  function closeSidebar() {
    const sb = document.querySelector('.sidebar'); const bd = ensureBackdrop();
    if (sb) sb.classList.remove('open');
    bd.style.opacity = '0'; bd.style.pointerEvents = 'none';
  }

  function toggleSidebar() {
    const sb = document.querySelector('.sidebar');
    if (sb && sb.classList.contains('open')) closeSidebar(); else openSidebar();
  }

  /* ============================================================
   *  6. CLOCK
   * ============================================================ */
  let clockTimer = null;

  function startClock() {
    const el = document.getElementById('clock'); if (!el) return;
    if (clockTimer) clearInterval(clockTimer);
    const tick = () => {
      const d = new Date();
      const day  = d.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short' });
      const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      el.textContent = `${day} • ${time}`;
    };
    tick(); clockTimer = setInterval(tick, 1000);
  }

  function stopClock() { if (clockTimer) { clearInterval(clockTimer); clockTimer = null; } }

  /* ============================================================
   *  7. NAVIGATE
   * ============================================================ */
  function parsePath() {
    const raw = (location.hash || '').replace(/^#\/?/, '').trim();
    return raw.replace(/\/$/, '');
  }

  function defaultPath() {
    const roleKey = String(u.role).toLowerCase();
    return DEFAULT_ROUTE[roleKey] || 'admin';
  }

  async function navigate() {
    const path  = parsePath();
    const view  = document.getElementById('view');
    const title = document.getElementById('pageTitle');

    if (!path) { location.replace('#/' + defaultPath()); return; }

    const route = ROUTES[path];

    if (!route) {
      if (title) title.textContent = 'Tidak Ditemukan';
      if (view) view.innerHTML = `<div class="card text-center" style="padding:40px"><h1>404</h1><h3>Halaman Tidak Ditemukan</h3><a href="#/${defaultPath()}" class="btn-primary">Kembali</a></div>`;
      updateActive('');
      return;
    }

    const roleKey = String(u.role).toLowerCase();
    if (route.roles && route.roles.indexOf(roleKey) === -1) {
      UI.toast('Anda tidak memiliki akses', 'error');
      location.replace('#/' + defaultPath());
      return;
    }

    cleanup();
    closeSidebar();

    if (title) title.textContent = route.title;
    document.title = `${route.title} • E-Vote`;
    updateActive(path);

    try { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }
    catch (_) { window.scrollTo(0, 0); }

    // ✅ TAMPILKAN SKELETON INSTAN
    if (view) view.innerHTML = `<div class="card">${UI.skeleton(4)}</div>`;

    try {
      await route.fn();
    } catch (err) {
      console.error('[router] view error:', err);
      if (view) view.innerHTML = `<div class="card"><h3 style="color:var(--err)">Terjadi Kesalahan</h3><p class="hint">${UI.escapeHtml(err && err.message ? err.message : String(err))}</p><button class="btn-primary" type="button" onclick="location.reload()">Muat Ulang</button></div>`;
    }
  }

  /* ============================================================
   *  8. GLOBAL REFRESH
   * ============================================================ */
  let refreshInFlight = false;

  async function globalRefresh(btn) {
    if (refreshInFlight) return;
    refreshInFlight = true;
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
    try {
      if (window.Cache) Cache.clearAll();
      await navigate();
      if (window.UI) UI.toast('Data berhasil diperbarui', 'success');
    } catch (err) {
      console.error('[router] refresh error:', err);
      if (window.UI) UI.toast('Gagal memperbarui data', 'error');
    } finally {
      refreshInFlight = false;
      if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
    }
  }

  /* ============================================================
   *  9. INIT
   * ============================================================ */
  function init() {
    const userNameEl = document.getElementById('userName');
    const userRoleEl = document.getElementById('userRole');
    if (userNameEl) userNameEl.textContent = u.name || u.username || '—';
    if (userRoleEl) userRoleEl.textContent = String(u.role).toUpperCase();

    const currentPath = parsePath() || defaultPath();
    renderNav(currentPath);

    const btnMenu = document.getElementById('btnMenu');
    if (btnMenu) btnMenu.addEventListener('click', toggleSidebar);

    const nav = document.getElementById('nav');
    if (nav) nav.addEventListener('click', (e) => { if (e.target.closest('.nav-item')) closeSidebar(); });

    /* ============================================================
     *  ⚠️ LOGOUT DITANGANI OLEH logout.html
     *  Tidak ada handler di sini untuk mencegah konflik.
     *  ============================================================ */

    const btnRefresh = document.getElementById('btnGlobalRefresh');
    if (btnRefresh) btnRefresh.addEventListener('click', () => globalRefresh(btnRefresh));

    startClock();
    window.addEventListener('hashchange', navigate);

    // ✅ PRELOAD SEMUA DATA DI BACKGROUND
    if (window.Cache && Cache.preloadAll) {
      setTimeout(function () {
        Cache.preloadAll().catch(function () {});
      }, 800);
    }

    window.addEventListener('beforeunload', () => { cleanup(); stopClock(); });
    navigate();
  }

  /* ============================================================
   *  10. BOOT
   * ============================================================ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();