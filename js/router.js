/* ============================================================
   E-VOTE • router.js (FULL FIX - FINAL + COKLIT)
   Hash-based SPA Router + Auth Guard + Role Guard + Cleanup.
   ============================================================ */
(function () {
  'use strict';

  /* ============================================================
   *  1. AUTH GUARD (via Auth helper — support SafeStorage)
   * ============================================================ */
  if (!window.Auth) {
    console.error('[router] js/auth.js wajib dimuat sebelum router.js');
    location.replace('login.html');
    return;
  }

  if (!Auth.isLoggedIn()) {
    location.replace('login.html');
    return;
  }

  const u = Auth.user() || {};
  const role = String(u.role || '').toLowerCase();

  if (!role) {
    console.warn('[router] role kosong, redirect login');
    location.replace('login.html');
    return;
  }

  /* ---------- Verify token server-side (silent, grace on network err) ---------- */
  (function verifyToken() {
    if (!window.API || typeof API.post !== 'function') return;
    API.post('me').then((r) => {
      if (!r || !r.success) {
        // Token invalid/expired — Auth akan handle via event 'expired'
        try { Auth.clearSession(); } catch (_) {}
        if (window.Cache) Cache.clearAll();
        location.replace('login.html');
      }
    }).catch(() => {
      // Network error → jangan logout, biarkan user tetap di halaman
      console.warn('[router] verify network error — offline mode');
    });
  })();

  /* ---------- Session expired listener ---------- */
  if (Auth.on) {
    Auth.on('expired', function () {
      try {
        if (window.UI && UI.toast) {
          UI.toast('Sesi berakhir. Silakan login ulang.', 'warn', 4000);
        }
      } catch (_) {}
      setTimeout(() => location.replace('login.html'), 600);
    });
  }

  /* ============================================================
   *  2. MENUS
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
      { path: 'petugas',              label: 'Dashboard',     icon: '📊' },
      { path: 'petugas/attendance',   label: 'Absensi',       icon: '📷' },
      { path: 'petugas/queue',        label: 'Antrian',       icon: '🚪' },
      { path: 'petugas/results',      label: 'Hasil',         icon: '📈' },
      { path: 'petugas/berita-acara', label: 'Berita Acara',  icon: '📜' },
    ],
    bilik: [
      { path: 'bilik', label: 'Bilik Voting', icon: '🗳️' },
    ],
    coklit: [
      { path: 'coklit',        label: 'Dashboard Coklit', icon: '📊' },
      { path: 'coklit/voters', label: 'Coklit Pemilih',   icon: '📋' },
    ],
  };

  /* ============================================================
   *  3. ROUTES
   * ============================================================ */
  const ROUTES = {
    /* ---------- ADMIN ---------- */
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

    /* ---------- PETUGAS ---------- */
    'petugas':              { title: 'Dashboard Petugas', roles: ['petugas', 'admin'], fn: () => ViewsPetugas.dashboard() },
    'petugas/attendance':   { title: 'Absensi Pemilih',   roles: ['petugas', 'admin'], fn: () => ViewsPetugas.attendance() },
    'petugas/queue':        { title: 'Antrian & Bilik',   roles: ['petugas', 'admin'], fn: () => ViewsPetugas.queue() },
    'petugas/results':      { title: 'Hasil Real-Time',   roles: ['petugas', 'admin'], fn: () => ViewsAdmin.results() },
    'petugas/berita-acara': { title: 'Berita Acara',      roles: ['petugas', 'admin'], fn: () => ViewsAdmin.beritaAcara() },

    /* ---------- BILIK ---------- */
    'bilik': { title: 'Bilik Voting', roles: ['bilik'], fn: () => ViewsBilik.dashboard() },

    /* ---------- COKLIT ---------- */
    'coklit':        { title: 'Dashboard Coklit', roles: ['coklit'], fn: () => ViewsCoklit.dashboard() },
    'coklit/voters': { title: 'Coklit Pemilih',   roles: ['coklit'], fn: () => ViewsCoklit.voters() },
  };

  /* ============================================================
   *  4. DEFAULT ROUTES
   * ============================================================ */
  const DEFAULT_ROUTE = {
    admin:   'admin',
    petugas: 'petugas',
    bilik:   'bilik',
    coklit:  'coklit',
  };

  /* ============================================================
   *  5. CLEANUP (Mencegah Memory Leak & Timer Zombie)
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
   *  6. SIDEBAR NAV RENDER
   * ============================================================ */
  function renderNav(activePath) {
    const nav = document.getElementById('nav');
    if (!nav) return;
    const list = MENUS[role] || [];

    if (!list.length) {
      nav.innerHTML = `<p class="hint" style="padding:12px;color:var(--err)">
        Menu tidak tersedia untuk role "${UI.escapeHtml(role)}"
      </p>`;
      return;
    }

    nav.innerHTML = list.map((m) => {
      const active = m.path === activePath ? ' active' : '';
      return `
        <a href="#/${m.path}" class="nav-item${active}" data-path="${m.path}">
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
   *  7. MOBILE SIDEBAR
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
   *  8. CLOCK
   * ============================================================ */
  let clockTimer = null;

  function startClock() {
    const el = document.getElementById('clock');
    if (!el) return;
    if (clockTimer) clearInterval(clockTimer);

    const tick = () => {
      const d = new Date();
      const day  = d.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short' });
      const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      el.textContent = `${day} • ${time}`;
    };
    tick();
    clockTimer = setInterval(tick, 1000);
  }

  function stopClock() {
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  }

  /* ============================================================
   *  9. NAVIGATE
   * ============================================================ */
  function parsePath() {
    const raw = (location.hash || '').replace(/^#\/?/, '').trim();
    // Strip trailing slash
    return raw.replace(/\/$/, '');
  }

  function defaultPath() {
    return DEFAULT_ROUTE[role] || 'admin';
  }

  async function navigate() {
    const path  = parsePath();
    const view  = document.getElementById('view');
    const title = document.getElementById('pageTitle');

    /* Empty hash → redirect ke default route */
    if (!path) {
      location.replace('#/' + defaultPath());
      return;
    }

    const route = ROUTES[path];

    /* ---------- 404 ---------- */
    if (!route) {
      if (title) title.textContent = 'Tidak Ditemukan';
      document.title = 'Tidak Ditemukan • E-Vote';
      if (view) {
        view.innerHTML = `
          <div class="card text-center" style="padding:40px">
            <h1 style="font-size:3rem;margin:0">404</h1>
            <h3 style="margin-top:8px">Halaman Tidak Ditemukan</h3>
            <p class="hint">Route "<code>${UI.escapeHtml(path)}</code>" tidak tersedia.</p>
            <a href="#/${defaultPath()}" class="btn-primary" style="margin-top:16px">
              Kembali ke Dashboard
            </a>
          </div>`;
      }
      updateActive('');
      return;
    }

    /* ---------- Role guard ---------- */
    if (route.roles && route.roles.indexOf(role) === -1) {
      UI.toast('Anda tidak memiliki akses ke halaman ini', 'error');
      location.replace('#/' + defaultPath());
      return;
    }

    /* ---------- Cleanup previous view ---------- */
    cleanup();
    closeSidebar();

    /* ---------- Update UI meta ---------- */
    if (title) title.textContent = route.title;
    document.title = `${route.title} • E-Vote`;
    updateActive(path);

    /* ---------- Scroll to top ---------- */
    try { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }
    catch (_) { window.scrollTo(0, 0); }

    /* ---------- Render view ---------- */
    try {
      await route.fn();
    } catch (err) {
      console.error('[router] view error:', err);
      if (view) {
        view.innerHTML = `
          <div class="card">
            <h3 style="color:var(--err)">Terjadi Kesalahan</h3>
            <p class="hint">${UI.escapeHtml(err && err.message ? err.message : String(err))}</p>
            <div class="row">
              <button class="btn-primary" type="button" onclick="location.reload()">
                Muat Ulang Halaman
              </button>
              <a href="#/${defaultPath()}" class="btn-ghost">Kembali ke Dashboard</a>
            </div>
          </div>`;
      }
    }
  }

  /* ============================================================
   *  10. GLOBAL REFRESH
   * ============================================================ */
  let refreshInFlight = false;

  async function globalRefresh(btn) {
    if (refreshInFlight) return;
    refreshInFlight = true;

    if (btn) {
      btn.classList.add('loading');
      btn.disabled = true;
    }

    try {
      if (window.Cache) Cache.clearAll();
      await navigate();
      if (window.UI) UI.toast('Data berhasil diperbarui', 'success');
    } catch (err) {
      console.error('[router] refresh error:', err);
      if (window.UI) UI.toast('Gagal memperbarui data', 'error');
    } finally {
      refreshInFlight = false;
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    }
  }

  /* ============================================================
   *  11. INIT
   * ============================================================ */
  function init() {
    /* ---------- User info sidebar ---------- */
    const userNameEl = document.getElementById('userName');
    const userRoleEl = document.getElementById('userRole');
    if (userNameEl) userNameEl.textContent = u.name || u.username || '—';
    if (userRoleEl) userRoleEl.textContent = role.toUpperCase();

    /* ---------- Nav ---------- */
    const currentPath = parsePath() || defaultPath();
    renderNav(currentPath);

    /* ---------- Menu toggle (mobile) ---------- */
    const btnMenu = document.getElementById('btnMenu');
    if (btnMenu) {
      btnMenu.addEventListener('click', toggleSidebar);
    }

    /* ---------- Auto-close sidebar saat klik nav item ---------- */
    const nav = document.getElementById('nav');
    if (nav) {
      nav.addEventListener('click', (e) => {
        if (e.target.closest('.nav-item')) closeSidebar();
      });
    }

    /* ---------- Logout button (fallback jika Auth.bind tidak jalan) ---------- */
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
        if (ok) {
          // Auth.logout akan clear session + redirect login
          if (window.Auth && Auth.logout) Auth.logout({ redirect: true });
          else API.logout();
        }
      });
    });

    /* ---------- Global refresh button ---------- */
    const btnRefresh = document.getElementById('btnGlobalRefresh');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => globalRefresh(btnRefresh));
    }

    /* ---------- Clock & route listener ---------- */
    startClock();
    window.addEventListener('hashchange', navigate);

    /* ---------- Cleanup saat tab close ---------- */
    window.addEventListener('beforeunload', () => {
      cleanup();
      stopClock();
    });

    /* ---------- First navigate ---------- */
    navigate();
  }

  /* ============================================================
   *  12. BOOT
   * ============================================================ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();