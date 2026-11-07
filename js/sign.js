/* ============================================================
   E-VOTE • sign.js
   Pendekatan IDENTIK dengan absensi.js (yang berhasil di PC)
   - DPR-aware canvas
   - Simple coordinate math
   - mouseleave handler
   - Fixed-size export (600×180) → aman di Google Sheets
   - PNG (preserve quality) → fallback JPEG jika kepanjangan
   ============================================================ */
window.Sign = (function () {
  'use strict';

  function mount(container, opts) {
    if (!container) throw new Error('Sign.mount: container required');
    container.innerHTML = '';

    const o = Object.assign({
      lineColor: '#0f172a',
      lineWidth: 2.5,
      exportWidth: 600,
      exportHeight: 180
    }, opts || {});

    const canvas = document.createElement('canvas');
    canvas.style.cssText = `
      width: 100%;
      height: 180px;
      display: block;
      background: #ffffff;
      border: 1px dashed #cbd5e1;
      border-radius: 8px;
      cursor: crosshair;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      -ms-user-select: none;
    `;
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let drawing = false;
    let lastX = 0, lastY = 0;
    let hasDraw = false;

    // ── DPR-AWARE SETUP (KUNCI SUKSES ABSENSI) ──
    function setupCanvas() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      let oldContent = null;
      if (canvas.width > 0 && hasDraw) {
        try { oldContent = canvas.toDataURL(); } catch (e) {}
      }

      canvas.width  = Math.max(Math.round(rect.width  * dpr), 1);
      canvas.height = Math.max(Math.round(rect.height * dpr), 1);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.lineWidth   = o.lineWidth;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.strokeStyle = o.lineColor;
      ctx.fillStyle   = '#ffffff';
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.fillStyle   = o.lineColor;

      if (oldContent) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = oldContent;
      }
    }

    setupCanvas();

    let resizeTimer;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(setupCanvas, 200);
    };
    window.addEventListener('resize', onResize);

    // ── SIMPLE COORDINATE (NO SCALING - karena ctx.scale sudah handle) ──
    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      let cx, cy;
      if (e.touches && e.touches.length > 0) {
        cx = e.touches[0].clientX; cy = e.touches[0].clientY;
      } else if (e.changedTouches && e.changedTouches.length > 0) {
        cx = e.changedTouches[0].clientX; cy = e.changedTouches[0].clientY;
      } else {
        cx = e.clientX; cy = e.clientY;
      }
      return { x: cx - rect.left, y: cy - rect.top };
    }

    function start(e) {
      e.preventDefault();
      drawing = true;
      const p = getPos(e);
      lastX = p.x; lastY = p.y;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 1.5, 0, Math.PI * 2);
      ctx.fill();
      hasDraw = true;
    }

    function draw(e) {
      if (!drawing) return;
      e.preventDefault();
      const p = getPos(e);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastX = p.x; lastY = p.y;
    }

    function stop() {
      drawing = false;
    }

    // ── LISTENERS (persis absensi) ──
    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stop);
    canvas.addEventListener('mouseleave', stop);   // ← KUNCI PC
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove',  draw,  { passive: false });
    canvas.addEventListener('touchend',   stop);
    canvas.addEventListener('touchcancel', stop);
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // ── PUBLIC API ──
    return {
      hasContent: function () {
        if (!hasDraw) return false;
        try {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          for (let i = 3; i < imgData.length; i += 4) {
            if (imgData[i] !== 0) return true;
          }
          return false;
        } catch (e) {
          return hasDraw;
        }
      },
      isEmpty: function () { return !this.hasContent(); },
      clear: function () {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, rect.width, rect.height);
        ctx.fillStyle = o.lineColor;
        ctx.strokeStyle = o.lineColor;
        ctx.lineWidth = o.lineWidth;
        hasDraw = false;
      },
      toDataURL: function () {
        // FIXED-SIZE EXPORT (aman dari limit Google Sheets 50k)
        const exp = document.createElement('canvas');
        exp.width  = o.exportWidth;
        exp.height = o.exportHeight;
        const ectx = exp.getContext('2d');
        ectx.fillStyle = '#ffffff';
        ectx.fillRect(0, 0, exp.width, exp.height);
        ectx.drawImage(canvas, 0, 0, exp.width, exp.height);

        let url = exp.toDataURL('image/png');
        // Jika PNG terlalu besar (>38000 chars), fallback ke JPEG
        if (url.length > 38000) {
          url = exp.toDataURL('image/jpeg', 0.8);
        }
        return url;
      },
      getCanvas: function () { return canvas; },
      destroy: function () {
        window.removeEventListener('resize', onResize);
        container.innerHTML = '';
      }
    };
  }

  return { mount };
})();