/* ============================================================
   E-VOTE • router.js
   Hash-based SPA Router + Auth Guard + Role Guard + Cleanup.
   ============================================================ */
(function () {
  'use strict';

  /* ============================================================
   *  1. AUTH GUARD
   * ============================================================ */
  const token   = localStorage.getItem('evote_token');
  const userRaw = localStorage.getItem('evote_user');

  let u = null;
  try { u = JSON.parse(userRaw); } catch (_) { u = null; }

  // Jika tidak ada sesi, tendang ke login.html
  if (!token || !u || !u.role) {
    location.replace('login.html');
    return;
  }

  /* ---------- Verify token server-side (silent) ---------- */
  (function verifyToken() {
    if (!window.API || typeof API.post !== 'function') return;
    API.post('me').then((r) => {
      if (!r || !r.success) {
        localStorage.removeItem('evote_token');
        localStorage.removeItem('evote_user');
        location.replace('login.html');
      }
    }).catch(() => { /* offline / network error → biarkan */ });
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
    try { if (ViewsAdmin   && ViewsAdmin._clearAllPolls)   ViewsAdmin._clearAllPolls();   } catch (_) {}
    try { if (ViewsPetugas && ViewsPetugas._clearAllPolls) ViewsPetugas._clearAllPolls(); } catch (_) {}
    try { if (window.QR    && QR.stop)    QR.stop();    } catch (_) {}
    try { if (window.Voice && Voice.stop) Voice.stop(); } catch (_) {}
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
   *  6. CLOCK
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

  /* ============================================================
   *  7. NAVIGATE
   * ============================================================ */
  function parsePath() {
    const raw = (location.hash || '').replace(/^#\/?/, '').trim();
    return raw;
  }

  function defaultPath() {
    return DEFAULT_ROUTE[u.role] || 'admin';
  }

  async function navigate() {
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
    if (btnMenu) btnMenu.addEventListener('click', toggleSidebar);

    /* Auto-close sidebar */
    const nav = document.getElementById('nav');
    if (nav) {
      nav.addEventListener('click', (e) => {
        if (e.target.closest('.nav-item')) closeSidebar();
      });
    }

    /* Logout button */
    document.querySelectorAll('[data-logout]').forEach((btn) => {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      
      btn.addEventListener('click', async () => {
        if (window.UI && UI.confirm) {
          const ok = await UI.confirm('Keluar dari aplikasi?', { okLabel: 'Ya, Keluar' });
          if (ok) API.logout();
        } else {
          if (confirm('Keluar dari aplikasi?')) API.logout();
        }
      });
    });

    /* TOMBOL GLOBAL REFRESH */
    const btnRefresh = document.getElementById('btnGlobalRefresh');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', async () => {
        btnRefresh.classList.add('loading');
        btnRefresh.disabled = true;
        
        // Hapus cache dan paksa tarik data baru
        if (window.Cache) Cache.clearAll();
        await navigate();
        
        btnRefresh.classList.remove('loading');
        btnRefresh.disabled = false;
        if (window.UI) UI.toast('Data berhasil diperbarui', 'success');
      });
    }

    /* PRELOAD DATA DI BACKGROUND */
    if (window.Cache && Cache.preloadAll) {
      Cache.preloadAll();
    }

    /* Clock & Routing */
    startClock();
    window.addEventListener('hashchange', navigate);
    window.addEventListener('beforeunload', () => { cleanup(); });

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