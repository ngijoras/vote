/* ============================================================
   E-VOTE • sign.js
   Tanda Tangan Digital — Canvas-based
   Dioptimalkan untuk Mouse (PC), Touch (HP), dan Stylus.
   ============================================================ */
window.Sign = (function () {
  'use strict';

  function mount(container, opts) {
    if (!container) throw new Error('Sign.mount: container element required');

    const o = Object.assign({
      width: 600,
      height: 200,
      bgColor: '#ffffff',
      strokeColor: '#0f172a',
      strokeWidth: 2.5
    }, opts || {});

    container.innerHTML = '';

    const canvas = document.createElement('canvas');
    canvas.width = o.width;
    canvas.height = o.height;
    
    // Styling canvas agar responsif dan tidak ada garis putus-putus bawaan
    canvas.style.cssText = `
      width: 100%;
      height: auto;
      aspect-ratio: ${o.width}/${o.height};
      background: ${o.bgColor};
      border-radius: 8px;
      touch-action: none;
      cursor: crosshair;
      display: block;
    `;
    
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Sign.mount: canvas 2d context unavailable');

    ctx.lineWidth = o.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = o.strokeColor;
    
    // Fill background putih solid
    ctx.fillStyle = o.bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const strokes = [];
    let currentStroke = null;
    let drawing = false;
    let activePointerId = null;

    // --- Coordinate Transformasi (Presisi PC & HP) ---
    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      
      return {
        x: (e.clientX - rect.left) * sx,
        y: (e.clientY - rect.top) * sy
      };
    }

    // --- Drawing Logic ---
    function begin(e) {
      if (activePointerId !== null) return; // Cegah multitouch
      activePointerId = e.pointerId;
      
      // Set pointer capture agar gambar tetap dilacak walau kursor keluar canvas
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}

      drawing = true;
      const p = getPos(e);
      currentStroke = { points: [{ x: p.x, y: p.y }] };
      
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y); 
      ctx.stroke();
      
      e.preventDefault();
    }

    function extend(e) {
      if (!drawing || e.pointerId !== activePointerId) return;
      
      const p = getPos(e);
      const prev = currentStroke.points[currentStroke.points.length - 1];
      
      currentStroke.points.push({ x: p.x, y: p.y });
      
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      
      e.preventDefault();
    }

    function finish(e) {
      if (e.pointerId !== activePointerId) return;
      
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
      
      drawing = false;
      activePointerId = null;
      
      if (currentStroke) {
        strokes.push(currentStroke);
        currentStroke = null;
      }
      e.preventDefault();
    }

    // --- Event Listeners (Menggunakan Pointer Events) ---
    canvas.addEventListener('pointerdown', begin);
    canvas.addEventListener('pointermove', extend);
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);
    
    // Fallback untuk browser sangat lama (opsional, tapi bagus untuk kompatibilitas)
    if (!window.PointerEvent) {
      canvas.addEventListener('mousedown', begin);
      window.addEventListener('mousemove', extend);
      window.addEventListener('mouseup', finish);
      canvas.addEventListener('touchstart', begin, {passive: false});
      canvas.addEventListener('touchmove', extend, {passive: false});
      canvas.addEventListener('touchend', finish, {passive: false});
    }

    // --- API Public ---
    return {
      isEmpty: function () {
        return strokes.length === 0;
      },
      clear: function () {
        strokes.length = 0;
        drawing = false;
        activePointerId = null;
        currentStroke = null;
        ctx.fillStyle = o.bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = o.strokeColor;
        ctx.lineWidth = o.strokeWidth;
      },
      toDataURL: function (type, quality) {
        return canvas.toDataURL(type || 'image/png', quality);
      },
      getCanvas: function () { return canvas; },
      destroy: function () {
        canvas.removeEventListener('pointerdown', begin);
        canvas.removeEventListener('pointermove', extend);
        canvas.removeEventListener('pointerup', finish);
        canvas.removeEventListener('pointercancel', finish);
        container.innerHTML = '';
      }
    };
  }

  return { mount };
})();