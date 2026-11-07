/* ============================================================
   E-VOTE • sign.js (FULL FIX)
   DPR-aware canvas signature pad.

   Perbaikan:
   - DPR handling konsisten di semua method
   - Resize tidak menghilangkan konten (redraw dari snapshot)
   - isEmpty() benar (cek alpha pixel)
   - Clear() reset transform dengan benar
   - getBase64() / getBlob() export dengan quality
   - destroy() bersihkan listener & memory
   - Support mounting di container hidden (defer mount)
   - Tidak throw ke pemanggil
   ============================================================ */
window.Sign = (function () {
  'use strict';

  const DEFAULT_QUALITY = 0.9;
  const EXPORT_WIDTH  = 800;
  const EXPORT_HEIGHT = 300;

  /* ============================================================
   *  MOUNT
   * ============================================================ */
  function mount(container) {
    if (!container) {
      console.warn('[Sign] container required');
      // Return stub agar tidak crash pemanggil
      return createStub();
    }
    container.innerHTML = '';

    const canvas = document.createElement('canvas');
    canvas.style.cssText = [
      'width: 100%', 'height: 180px', 'display: block', 'background: #ffffff',
      'border: 1px dashed #cbd5e1', 'border-radius: 8px', 'cursor: crosshair',
      'touch-action: none', 'user-select: none', '-webkit-user-select: none'
    ].join(';');
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('[Sign] canvas 2d context unavailable');
      return createStub();
    }

    let drawing = false;
    let lastX = 0;
    let lastY = 0;
    let hasDraw = false;
    let destroyed = false;
    let resizeTimer = null;

    /* ---------- Snapshot / restore ---------- */
    function snapshot() {
      if (!hasDraw) return null;
      try { return canvas.toDataURL('image/png'); }
      catch (_) { return null; }
    }

    function restore(snap) {
      if (!snap) return;
      const img = new Image();
      img.onload = function () {
        if (destroyed) return;
        const rect = canvas.getBoundingClientRect();
        try { ctx.drawImage(img, 0, 0, rect.width, rect.height); }
        catch (_) {}
      };
      img.src = snap;
    }

    /* ---------- DPR setup ---------- */
    function setupCanvas() {
      if (destroyed) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(Math.round(rect.width * dpr), 1);
      const h = Math.max(Math.round(rect.height * dpr), 1);

      // Simpan konten lama jika ada
      const oldContent = snapshot();

      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;

      // Reset transform dulu
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0f172a';
      ctx.fillStyle = '#ffffff';

      // Fill background (koordinat CSS px, bukan device px)
      ctx.fillRect(0, 0, rect.width, rect.height);

      // Restore konten jika ada
      if (oldContent) restore(oldContent);
    }

    // Defer jika container masih hidden (width = 0)
    if (container.offsetWidth === 0) {
      requestAnimationFrame(() => {
        requestAnimationFrame(setupCanvas);
      });
    } else {
      setupCanvas();
    }

    /* ---------- Resize handler ---------- */
    function onResize() {
      if (destroyed) return;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(setupCanvas, 200);
    }
    window.addEventListener('resize', onResize);

    /* ---------- Position helper ---------- */
    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      let cx, cy;
      if (e.touches && e.touches.length > 0) {
        cx = e.touches[0].clientX;
        cy = e.touches[0].clientY;
      } else if (e.changedTouches && e.changedTouches.length > 0) {
        cx = e.changedTouches[0].clientX;
        cy = e.changedTouches[0].clientY;
      } else {
        cx = e.clientX;
        cy = e.clientY;
      }
      return { x: cx - rect.left, y: cy - rect.top };
    }

    /* ---------- Draw handlers ---------- */
    function start(e) {
      if (destroyed) return;
      e.preventDefault();
      drawing = true;
      const p = getPos(e);
      lastX = p.x;
      lastY = p.y;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      hasDraw = true;
    }

    function draw(e) {
      if (!drawing || destroyed) return;
      e.preventDefault();
      const p = getPos(e);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastX = p.x;
      lastY = p.y;
    }

    function stop() {
      drawing = false;
    }

    /* ---------- Event binding ---------- */
    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stop);
    canvas.addEventListener('mouseleave', stop);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove',  draw,  { passive: false });
    canvas.addEventListener('touchend',   stop);
    canvas.addEventListener('touchcancel', stop);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    /* ============================================================
     *  PUBLIC API
     * ============================================================ */
    return {
      hasContent: function () {
        if (!hasDraw) return false;
        try {
          const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          // Cek apakah ada pixel non-transparent & non-white
          for (let i = 0; i < d.length; i += 4) {
            // skip jika alpha = 0
            if (d[i + 3] === 0) continue;
            // skip putih murni (background fill)
            if (d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 255) continue;
            return true;
          }
          return false;
        } catch (_) {
          return hasDraw;
        }
      },

      isEmpty: function () { return !this.hasContent(); },

      clear: function () {
        if (destroyed) return;
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, rect.width, rect.height);
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#0f172a';
        hasDraw = false;
      },

      /* LEGACY: untuk attendance (<= 47k chars) */
      toDataURL: function () {
        if (destroyed) return '';
        try {
          const exp = document.createElement('canvas');
          exp.width = 600;
          exp.height = 180;
          const ectx = exp.getContext('2d');
          ectx.fillStyle = '#ffffff';
          ectx.fillRect(0, 0, exp.width, exp.height);
          ectx.drawImage(canvas, 0, 0, exp.width, exp.height);
          let url = exp.toDataURL('image/png');
          if (url.length > 38000) url = exp.toDataURL('image/jpeg', 0.8);
          return url;
        } catch (_) {
          return '';
        }
      },

      /* NEW: JPEG DataURL untuk upload ke Drive via base64 */
      getBase64: function () {
        return new Promise(function (resolve, reject) {
          if (destroyed) { reject(new Error('Sign pad destroyed')); return; }
          try {
            const exp = document.createElement('canvas');
            exp.width = EXPORT_WIDTH;
            exp.height = EXPORT_HEIGHT;
            const ectx = exp.getContext('2d');
            ectx.fillStyle = '#ffffff';
            ectx.fillRect(0, 0, exp.width, exp.height);
            ectx.drawImage(canvas, 0, 0, exp.width, exp.height);
            resolve(exp.toDataURL('image/jpeg', DEFAULT_QUALITY));
          } catch (e) {
            reject(e);
          }
        });
      },

      /* NEW: Blob JPEG (opsional untuk FormData path) */
      getBlob: function () {
        return new Promise(function (resolve, reject) {
          if (destroyed) { reject(new Error('Sign pad destroyed')); return; }
          try {
            const exp = document.createElement('canvas');
            exp.width = EXPORT_WIDTH;
            exp.height = EXPORT_HEIGHT;
            const ectx = exp.getContext('2d');
            ectx.fillStyle = '#ffffff';
            ectx.fillRect(0, 0, exp.width, exp.height);
            ectx.drawImage(canvas, 0, 0, exp.width, exp.height);
            exp.toBlob(function (b) {
              if (b) resolve(b);
              else reject(new Error('toBlob failed'));
            }, 'image/jpeg', DEFAULT_QUALITY);
          } catch (e) {
            reject(e);
          }
        });
      },

      getCanvas: function () { return canvas; },

      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        if (resizeTimer) { clearTimeout(resizeTimer); resizeTimer = null; }
        try { window.removeEventListener('resize', onResize); } catch (_) {}
        try { container.innerHTML = ''; } catch (_) {}
      },
    };
  }

  /* ============================================================
   *  STUB (jika container invalid)
   * ============================================================ */
  function createStub() {
    return {
      hasContent: function () { return false; },
      isEmpty: function () { return true; },
      clear: function () {},
      toDataURL: function () { return ''; },
      getBase64: function () { return Promise.resolve(''); },
      getBlob: function () { return Promise.reject(new Error('No canvas')); },
      getCanvas: function () { return null; },
      destroy: function () {},
    };
  }

  /* ============================================================
   *  EXPORTS
   * ============================================================ */
  return { mount: mount };
})();