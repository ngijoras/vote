/* ============================================================
   E-VOTE • qr.js
   Wrapper QRCode (generate) + Html5Qrcode (scan).
   Bergantung pada library global:
     - window.QRCode     (qrcodejs)
     - window.Html5Qrcode (html5-qrcode)
   Semua error ditangani — tidak throw ke pemanggil.
   ============================================================ */
window.QR = (function () {
  'use strict';

  let currentScanner = null;
  let isStopping = false;

  /* ============================================================
   *  GENERATE — render QR ke dalam container
   * ============================================================ */
  function generate(container, text, size) {
    size = size || 180;
    if (!container) {
      console.warn('[QR] generate: container tidak ada');
      return;
    }
    container.innerHTML = '';

    if (typeof QRCode === 'undefined') {
      console.error('[QR] library QRCode tidak dimuat');
      container.textContent = '[QR lib missing]';
      return;
    }

    try {
      new QRCode(container, {
        text: String(text == null ? '' : text),
        width: size,
        height: size,
        colorDark: '#0f172a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });
    } catch (e) {
      console.error('[QR] generate error:', e);
      container.textContent = '[QR error]';
    }
  }

  /* ============================================================
   *  SCAN — mulai scanner (fire-and-forget)
   *  onResult(decoded)  → dipanggil SEKALI saat QR terbaca
   *  onError(err)       → opsional, dipanggil kalau start gagal
   * ============================================================ */
  async function scan(elementId, onResult, onError) {
    await stop();

    const el = document.getElementById(elementId);
    if (!el) {
      console.warn('[QR] scan: element #' + elementId + ' tidak ada');
      return;
    }

    if (typeof Html5Qrcode === 'undefined') {
      const err = new Error('Library Html5Qrcode tidak dimuat');
      if (onError) onError(err);
      else if (window.UI) UI.toast('Library QR belum dimuat', 'error');
      return;
    }

    if (!window.isSecureContext
        && location.hostname !== 'localhost'
        && location.hostname !== '127.0.0.1') {
      const err = new Error('Kamera membutuhkan koneksi HTTPS');
      if (onError) onError(err);
      else if (window.UI) UI.toast('Kamera butuh HTTPS', 'error');
      return;
    }

    let hasResult = false;

    try {
      currentScanner = new Html5Qrcode(elementId, { verbose: false });

      await currentScanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: function (vw, vh) {
            const min = Math.min(vw, vh);
            const size = Math.floor(min * 0.72);
            return { width: size, height: size };
          },
        },
        (decodedText) => {
          if (hasResult) return;
          hasResult = true;
          try { onResult(decodedText); }
          catch (e) { console.error('[QR] onResult error:', e); }
        },
        () => { /* ignore per-frame decode errors */ }
      );
    } catch (e) {
      currentScanner = null;
      console.error('[QR] scan start error:', e);

      const msg = /permission|notallowed|denied/i.test(String(e && e.message))
        ? 'Izin kamera ditolak. Cek pengaturan browser.'
        : 'Kamera tidak bisa diakses: ' + ((e && e.message) || e);

      if (onError) onError(e);
      else if (window.UI) UI.toast(msg, 'error');
    }
  }

  /* ============================================================
   *  SCAN-ONCE — shortcut: stop setelah QR terbaca
   * ============================================================ */
  async function scanOnce(elementId, onResult, onError) {
    await scan(
      elementId,
      async (decoded) => {
        await stop();
        try { onResult(decoded); }
        catch (e) { console.error('[QR] onResult error:', e); }
      },
      onError
    );
  }

  /* ============================================================
   *  STOP — hentikan scanner (idempotent)
   * ============================================================ */
  async function stop() {
    if (isStopping) return;
    if (!currentScanner) return;

    isStopping = true;
    const scanner = currentScanner;
    currentScanner = null;

    try {
      await scanner.stop();
    } catch (e) {
      // ignore — mungkin sudah berhenti
    }
    try { scanner.clear(); }
    catch (_) { /* ignore */ }

    isStopping = false;
  }

  /* ============================================================
   *  STATE
   * ============================================================ */
  function isActive() { return !!currentScanner; }

  /* ============================================================
   *  EXPORTS
   * ============================================================ */
  return { generate, scan, scanOnce, stop, isActive };
})();