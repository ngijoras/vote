/**
 * =====================================================================
 *  CONFIG.JS — Konfigurasi Global Aplikasi Pemilihan
 * =====================================================================
 *
 *  File ini dimuat PERTAMA sebelum semua modul lain.
 *  Menyediakan window.EV_CONFIG yang diakses oleh api() di app.js.
 *
 *  ═══════════════════════════════════════════════════════════════════
 *    ⚠️  WAJIB DIISI: EXEC_URL
 *  ═══════════════════════════════════════════════════════════════════
 *
 *  CARA MENDAPATKAN EXEC_URL:
 *    1. Buka script.google.com → project Pemilihan Anda
 *    2. Klik tombol "Deploy" (kanan atas) → "New deployment"
 *    3. Klik ikon gerigi (⚙) di "Select type" → pilih "Web app"
 *    4. Isi:
 *         Description : Pemilihan v1
 *         Execute as  : Me (email Anda)
 *         Who has access : Anyone
 *    5. Klik "Deploy" → copy URL yang muncul
 *    6. Paste ke baris EXEC_URL di bawah ini
 *
 *  Format URL:
 *    https://script.google.com/macros/s/AKfycbx...LONG_STRING.../exec
 *
 *  CATATAN PENTING:
 *    • Setelah update Code.gs / doPost, DEPLOY ULANG dengan cara:
 *      Deploy → Manage deployments → Edit (✏️) → New version → Deploy
 *    • JANGAN klik "New deployment" setiap update — URL akan berubah.
 *    • Kalau backend di-redeploy, URL /exec TETAP SAMA selama pakai
 *      "Manage deployments → New version".
 *
 *  =====================================================================
 */

(function (window) {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════
     ⚠️  GANTI BARIS INI DENGAN URL /exec HASIL DEPLOY ANDA
     ══════════════════════════════════════════════════════════════════ */
  var EXEC_URL = 'https://script.google.com/macros/s/AKfycbxc54_fCCg02bhNaZePLBqPR9dnmva1TUyQGzrw-4iaO6EQzOOsHhaAOk3V7CZu_q2X/exec';

  /* ══════════════════════════════════════════════════════════════════
     KONFIGURASI APLIKASI
     ══════════════════════════════════════════════════════════════════ */
  window.EV_CONFIG = {
    /* ─── Backend URL (WAJIB) ─── */
    EXEC_URL: EXEC_URL,

    /* ─── Identitas aplikasi ─── */
    APP_NAME: 'Pemilihan',
    APP_SUBTITLE: 'Ketua RT / Ketua Pemuda',
    VERSION: '3.1',

    /* ─── Polling intervals (ms) ─── */
    /** Refresh halaman hasil real-time */
    RESULTS_POLL_MS: 8000,
    /** Refresh display antrian publik */
    QUEUE_POLL_MS: 3000,
    /** Refresh panel status bilik di scanner */
    ATTENDANCE_POLL_MS: 5000,

    /* ─── Timeout fetch API (ms) ─── */
    FETCH_TIMEOUT_MS: 30000,

    /* ─── Feature flags (bisa dimatikan jika bermasalah) ─── */
    FEATURES: {
      VOICE_ANNOUNCEMENT: true,   // panggilan suara di Display & Scanner
      AUTO_REFRESH: true,         // auto polling
      QR_SCANNER: true,           // scanner kamera
      PRINT_PDF: true             // tombol cetak undangan & BA
    },

    /* ─── Debug mode ─── */
    DEBUG: false
  };

  /* ══════════════════════════════════════════════════════════════════
     VALIDASI OTOMATIS — cek EXEC_URL saat load
     ══════════════════════════════════════════════════════════════════ */
  (function validate() {
    var isPlaceholder = EXEC_URL.indexOf('GANTI_DENGAN_URL') >= 0;
    var isGoogleUrl = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(EXEC_URL);
    var isPlaceholderReal = EXEC_URL.indexOf('AKfycbxGANTI') >= 0;

    /* Cek di console untuk debugging */
    if (isPlaceholder || isPlaceholderReal) {
      console.warn(
        '%c[Pemilihan] ⚠️  EXEC_URL belum diisi!\n' +
        'Edit config.js → baris EXEC_URL → ganti dengan URL /exec hasil deploy GAS.\n' +
        'Tanpa EXEC_URL, semua API call akan gagal.',
        'color:#f59e0b;font-weight:bold;font-size:12px;'
      );
    } else if (!isGoogleUrl) {
      console.warn(
        '%c[Pemilihan] ⚠️  Format EXEC_URL terlihat tidak standar.\n' +
        'Format benar: https://script.google.com/macros/s/XXX/exec\n' +
        'Anda menggunakan: ' + EXEC_URL.slice(0, 80) + '...',
        'color:#f59e0b;font-weight:bold;font-size:12px;'
      );
    } else {
      if (window.EV_CONFIG.DEBUG) {
        console.log(
          '%c[Pemilihan] ✓ EXEC_URL valid: ' + EXEC_URL.slice(0, 60) + '...',
          'color:#10b981;font-weight:bold;'
        );
      }
    }

    /* Cek jika dijalankan dalam GAS HtmlService (bukan standalone) */
    var isInGAS = typeof google !== 'undefined' &&
                  google.script &&
                  google.script.run &&
                  typeof google.script.run.api === 'function';

    if (isInGAS) {
      console.log(
        '%c[Pemilihan] Mode GAS HtmlService terdeteksi → pakai google.script.run (lebih cepat, EXEC_URL diabaikan)',
        'color:#6366f1;font-weight:bold;'
      );
    } else {
      console.log(
        '%c[Pemilihan] Mode Standalone SPA → pakai fetch(EXEC_URL)',
        'color:#6366f1;font-weight:bold;'
      );
    }
  })();

})(window);