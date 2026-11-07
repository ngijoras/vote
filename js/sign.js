/* ============================================================
   E-VOTE • sign.js — DPR-aware canvas signature
   Export: toDataURL() legacy | getBase64() JPEG DataURL
   ============================================================ */
window.Sign = (function () {
  'use strict';

  function mount(container) {
    if (!container) throw new Error('Sign.mount: container required');
    container.innerHTML = '';

    const canvas = document.createElement('canvas');
    canvas.style.cssText = `
      width: 100%; height: 180px; display: block; background: #ffffff;
      border: 1px dashed #cbd5e1; border-radius: 8px; cursor: crosshair;
      touch-action: none; user-select: none; -webkit-user-select: none;
    `;
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    let drawing = false, lastX = 0, lastY = 0, hasDraw = false;

    function setupCanvas() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      let oldContent = null;
      if (canvas.width > 0 && hasDraw) { try { oldContent = canvas.toDataURL(); } catch (e) {} }

      canvas.width  = Math.max(Math.round(rect.width  * dpr), 1);
      canvas.height = Math.max(Math.round(rect.height * dpr), 1);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0f172a'; ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = '#0f172a';

      if (oldContent) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = oldContent;
      }
    }
    setupCanvas();

    let resizeTimer;
    const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(setupCanvas, 200); };
    window.addEventListener('resize', onResize);

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      let cx, cy;
      if (e.touches && e.touches.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
      else if (e.changedTouches && e.changedTouches.length > 0) { cx = e.changedTouches[0].clientX; cy = e.changedTouches[0].clientY; }
      else { cx = e.clientX; cy = e.clientY; }
      return { x: cx - rect.left, y: cy - rect.top };
    }

    function start(e) {
      e.preventDefault(); drawing = true;
      const p = getPos(e); lastX = p.x; lastY = p.y;
      ctx.beginPath(); ctx.arc(lastX, lastY, 1.5, 0, Math.PI * 2); ctx.fill();
      hasDraw = true;
    }
    function draw(e) {
      if (!drawing) return; e.preventDefault();
      const p = getPos(e);
      ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
      lastX = p.x; lastY = p.y;
    }
    function stop() { drawing = false; }

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stop);
    canvas.addEventListener('mouseleave', stop);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove',  draw,  { passive: false });
    canvas.addEventListener('touchend',   stop);
    canvas.addEventListener('touchcancel', stop);
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    return {
      hasContent: function () {
        if (!hasDraw) return false;
        try {
          const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return true;
          return false;
        } catch (_) { return hasDraw; }
      },
      isEmpty: function () { return !this.hasContent(); },

      clear: function () {
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

      /* LEGACY: attendance (<= 47k chars) */
      toDataURL: function () {
        const exp = document.createElement('canvas');
        exp.width = 600; exp.height = 180;
        const ectx = exp.getContext('2d');
        ectx.fillStyle = '#ffffff';
        ectx.fillRect(0, 0, exp.width, exp.height);
        ectx.drawImage(canvas, 0, 0, exp.width, exp.height);
        let url = exp.toDataURL('image/png');
        if (url.length > 38000) url = exp.toDataURL('image/jpeg', 0.8);
        return url;
      },

      /* NEW: JPEG DataURL 800x300 untuk upload ke Drive via base64 */
      getBase64: function () {
        return new Promise(function (resolve, reject) {
          try {
            const exp = document.createElement('canvas');
            exp.width = 800; exp.height = 300;
            const ectx = exp.getContext('2d');
            ectx.fillStyle = '#ffffff';
            ectx.fillRect(0, 0, exp.width, exp.height);
            ectx.drawImage(canvas, 0, 0, exp.width, exp.height);
            resolve(exp.toDataURL('image/jpeg', 0.9));
          } catch (e) { reject(e); }
        });
      },

      /* NEW: Blob JPEG (opsional untuk FormData path) */
      getBlob: function () {
        return new Promise(function (resolve, reject) {
          try {
            const exp = document.createElement('canvas');
            exp.width = 800; exp.height = 300;
            const ectx = exp.getContext('2d');
            ectx.fillStyle = '#ffffff';
            ectx.fillRect(0, 0, exp.width, exp.height);
            ectx.drawImage(canvas, 0, 0, exp.width, exp.height);
            exp.toBlob(function (b) { b ? resolve(b) : reject(new Error('toBlob failed')); }, 'image/jpeg', 0.9);
          } catch (e) { reject(e); }
        });
      },

      getCanvas: function () { return canvas; },
      destroy: function () {
        window.removeEventListener('resize', onResize);
        container.innerHTML = '';
      },
    };
  }

  return { mount };
})();