/* ============================================================
   E-VOTE • sign.js
   Tanda Tangan Digital — Canvas-based
   API: Sign.mount(container, opts) → { isEmpty, clear, undo,
        toDataURL, toBlob, getCanvas, destroy }

   Fitur:
   - Pointer Events (mouse + touch + pen) — modern, unified
   - Fallback ke mouse/touch untuk browser lama
   - Retina-friendly: fixed internal 800×300, responsif via CSS
   - White background — aman untuk print & export
   - Smooth stroke (quadratic curve) — tidak pecah
   - Undo (per stroke)
   - Anti-tap: tap tunggal tidak dianggap tanda tangan
   - `touch-action: none` — cegah scroll saat menandatangani
   - Idempotent clear/destroy — tidak error kalau dipanggil berkali-kali
   ============================================================ */
window.Sign = (function () {
  'use strict';

  const DEFAULTS = {
    width: 800,          // internal resolution (px)
    height: 300,
    bgColor: '#ffffff',
    strokeColor: '#0f172a',
    strokeWidth: 2.5,
    minDistance: 1.5,    // px movement to register a point
    showControls: false, // (opsional) tampilkan tombol undo/clear di wrapper
  };

  const hasPointerEvents = ('PointerEvent' in window);

  /* ============================================================
   *  MOUNT
   * ============================================================ */
  function mount(container, opts) {
    if (!container || !(container instanceof Element)) {
      throw new Error('Sign.mount: container element required');
    }

    const o = Object.assign({}, DEFAULTS, opts || {});

    // Clear existing content
    container.innerHTML = '';

    /* ---------- Wrapper ---------- */
    const wrapper = document.createElement('div');
    wrapper.className = 'sign-wrapper';
    wrapper.style.cssText = 'position:relative;width:100%;';

    /* ---------- Canvas ---------- */
    const canvas = document.createElement('canvas');
    canvas.width  = o.width;
    canvas.height = o.height;
    canvas.style.cssText = [
      'width:100%',
      'height:auto',
      'aspect-ratio:' + o.width + '/' + o.height,
      'display:block',
      'background:' + o.bgColor,
      'border:1.5px dashed #cbd5e1',
      'border-radius:12px',
      'touch-action:none',
      '-ms-touch-action:none',
      'cursor:crosshair',
      'user-select:none',
      '-webkit-user-select:none',
      '-webkit-touch-callout:none',
    ].join(';');
    wrapper.appendChild(canvas);

    /* ---------- Optional controls ---------- */
    let btnUndo = null, btnClear = null;
    if (o.showControls) {
      const ctrl = document.createElement('div');
      ctrl.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
      btnUndo  = document.createElement('button');
      btnClear = document.createElement('button');
      btnUndo.type = 'button'; btnClear.type = 'button';
      btnUndo.className = 'btn-ghost btn-sm';
      btnClear.className = 'btn-ghost btn-sm';
      btnUndo.textContent = '↶ Undo';
      btnClear.textContent = '🧹 Hapus';
      ctrl.appendChild(btnUndo);
      ctrl.appendChild(btnClear);
      wrapper.appendChild(ctrl);
    }

    container.appendChild(wrapper);

    /* ---------- Context ---------- */
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) throw new Error('Sign.mount: canvas 2d context unavailable');

    ctx.lineWidth   = o.strokeWidth;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.strokeStyle = o.strokeColor;

    // Fill white background
    ctx.fillStyle = o.bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    /* ---------- State ---------- */
    const strokes = [];            // committed strokes
    let currentStroke = null;
    let drawing       = false;
    let activeId      = null;      // for pointer capture
    let lastX         = 0;
    let lastY         = 0;

    /* ---------- Coordinate transform ---------- */
    function getPos(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width  / (rect.width  || 1);
      const sy = canvas.height / (rect.height || 1);
      return {
        x: (clientX - rect.left) * sx,
        y: (clientY - rect.top)  * sy,
      };
    }

    /* ---------- Drawing primitives ---------- */
    function drawDot(x, y) {
      ctx.beginPath();
      ctx.arc(x, y, o.strokeWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = o.strokeColor;
      ctx.fill();
    }

    function drawSegment(p1, p2) {
      // Quadratic smoothing
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      ctx.quadraticCurveTo(p1.x, p1.y, mx, my);
      ctx.stroke();
    }

    function clearCanvas() {
      ctx.fillStyle = o.bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function redraw() {
      clearCanvas();
      ctx.strokeStyle = o.strokeColor;
      ctx.lineWidth = o.strokeWidth;
      for (let i = 0; i < strokes.length; i++) {
        const s = strokes[i];
        if (!s.points || s.points.length < 2) continue;
        const pts = s.points;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let j = 1; j < pts.length; j++) {
          const p = pts[j];
          const prev = pts[j - 1];
          const mx = (prev.x + p.x) / 2;
          const my = (prev.y + p.y) / 2;
          ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
        }
        ctx.stroke();
      }
    }

    /* ---------- Start ---------- */
    function begin(x, y) {
      drawing = true;
      lastX = x;
      lastY = y;
      currentStroke = { points: [{ x, y }] };
      // Feedback dot
      drawDot(x, y);
    }

    function extend(x, y) {
      if (!drawing || !currentStroke) return;
      const dx = x - lastX;
      const dy = y - lastY;
      if ((dx * dx + dy * dy) < (o.minDistance * o.minDistance)) return;

      drawSegment({ x: lastX, y: lastY }, { x, y });
      currentStroke.points.push({ x, y });
      lastX = x;
      lastY = y;
    }

    function finish() {
      if (!drawing) return;
      drawing = false;
      activeId = null;

      if (currentStroke) {
        if (currentStroke.points.length > 1) {
          strokes.push(currentStroke);
        } else {
          // Single tap — hapus dot supaya isEmpty tetap true
          redraw();
        }
      }
      currentStroke = null;
    }

    /* ============================================================
     *  EVENT HANDLERS
     * ============================================================ */

    /* ---------- Pointer Events (modern) ---------- */
    function onPointerDown(e) {
      if (activeId !== null) return;       // already drawing another pointer
      if (e.button !== undefined && e.button !== 0) return; // left click only
      activeId = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      const p = getPos(e.clientX, e.clientY);
      begin(p.x, p.y);
      e.preventDefault();
    }

    function onPointerMove(e) {
      if (activeId === null || e.pointerId !== activeId) return;
      const p = getPos(e.clientX, e.clientY);
      extend(p.x, p.y);
      e.preventDefault();
    }

    function onPointerUp(e) {
      if (activeId === null) return;
      if (e.pointerId !== undefined && e.pointerId !== activeId) return;
      try { canvas.releasePointerCapture(activeId); } catch (_) {}
      finish();
      e.preventDefault();
    }

    function onPointerCancel(e) {
      if (activeId === null) return;
      finish();
    }

    /* ---------- Mouse / Touch fallback ---------- */
    function onMouseDown(e) {
      if (e.button !== 0) return;
      const p = getPos(e.clientX, e.clientY);
      begin(p.x, p.y);
      e.preventDefault();
    }
    function onMouseMove(e) {
      if (!drawing) return;
      const p = getPos(e.clientX, e.clientY);
      extend(p.x, p.y);
    }
    function onMouseUp() { finish(); }

    function onTouchStart(e) {
      if (e.touches.length > 1) return;    // multi-touch ignored
      const t = e.touches[0];
      const p = getPos(t.clientX, t.clientY);
      begin(p.x, p.y);
      e.preventDefault();
    }
    function onTouchMove(e) {
      if (!drawing) return;
      const t = e.touches[0];
      if (!t) return;
      const p = getPos(t.clientX, t.clientY);
      extend(p.x, p.y);
      e.preventDefault();
    }
    function onTouchEnd(e) {
      finish();
      if (e.cancelable) e.preventDefault();
    }

    /* ---------- Attach listeners ---------- */
    if (hasPointerEvents) {
      canvas.addEventListener('pointerdown',  onPointerDown);
      canvas.addEventListener('pointermove',  onPointerMove);
      canvas.addEventListener('pointerup',    onPointerUp);
      canvas.addEventListener('pointercancel',onPointerCancel);
      // Prevent scroll while drawing on canvas (Safari iOS)
      canvas.addEventListener('touchstart', (e) => {
        if (e.cancelable) e.preventDefault();
      }, { passive: false });
    } else {
      // Legacy fallback
      canvas.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup',   onMouseUp);
      canvas.addEventListener('touchstart', onTouchStart, { passive: false });
      canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
      canvas.addEventListener('touchend',   onTouchEnd,   { passive: false });
      canvas.addEventListener('touchcancel',onTouchEnd,   { passive: false });
    }

    /* ---------- Wire optional controls ---------- */
    if (btnUndo)  btnUndo.onclick  = () => api.undo();
    if (btnClear) btnClear.onclick = () => api.clear();

    /* ============================================================
     *  PUBLIC API
     * ============================================================ */
    const api = {
      /**
       * Cek apakah tanda tangan kosong (belum ada stroke valid).
       * Tap tunggal TIDAK dihitung sebagai tanda tangan.
       */
      isEmpty: function () {
        return strokes.length === 0;
      },

      /**
       * Hapus seluruh tanda tangan.
       */
      clear: function () {
        strokes.length = 0;
        currentStroke = null;
        drawing = false;
        activeId = null;
        clearCanvas();
      },

      /**
       * Undo stroke terakhir.
       */
      undo: function () {
        if (strokes.length === 0) return false;
        strokes.pop();
        redraw();
        return true;
      },

      /**
       * Export sebagai data URL. Default: PNG (paling jernih untuk TTD).
       * @param {string} [type='image/png']  'image/png' | 'image/jpeg'
       * @param {number} [quality=0.9]       0–1 (hanya JPEG)
       */
      toDataURL: function (type, quality) {
        return canvas.toDataURL(type || 'image/png', quality);
      },

      /**
       * Export sebagai Blob (Promise). Cocok untuk upload ke Drive.
       */
      toBlob: function (type, quality) {
        return new Promise(function (resolve, reject) {
          try {
            canvas.toBlob(function (b) {
              if (b) resolve(b);
              else reject(new Error('toBlob failed'));
            }, type || 'image/png', quality);
          } catch (e) {
            reject(e);
          }
        });
      },

      /**
       * Akses canvas mentah (untuk advanced use).
       */
      getCanvas: function () { return canvas; },

      /**
       * Bersihkan listener + DOM. Idempotent.
       */
      destroy: function () {
        try {
          if (hasPointerEvents) {
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('pointercancel', onPointerCancel);
          } else {
            canvas.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
            canvas.removeEventListener('touchcancel', onTouchEnd);
          }
        } catch (_) {}
        if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
        if (container) container.innerHTML = '';
      },
    };

    return api;
  }

  /* ============================================================
   *  EXPORT
   * ============================================================ */
  return { mount };
})();