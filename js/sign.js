/* ============================================================
   E-VOTE • sign.js
   Tanda Tangan Digital — Canvas-based (Sangat Robust)
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
    
    // CSS Mencegah seleksi teks dan gesture default
    canvas.style.cssText = `
      width: 100%;
      height: auto;
      aspect-ratio: ${o.width}/${o.height};
      background: ${o.bgColor};
      border-radius: 8px;
      cursor: crosshair;
      display: block;
      user-select: none;
      -webkit-user-select: none;
      -ms-user-select: none;
      touch-action: none;
    `;
    
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Sign.mount: canvas 2d context unavailable');

    ctx.lineWidth = o.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = o.strokeColor;
    
    // Isi background putih solid di awal
    ctx.fillStyle = o.bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let drawing = false;
    let activePointerId = null;
    let prevPos = null;
    let hasStrokes = false; // Flag untuk validasi isEmpty

    // --- Coordinate Transformasi ---
    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * sx,
        y: (e.clientY - rect.top) * sy
      };
    }

    // --- Event Handlers ---
    function onPointerDown(e) {
      // Hanya respon klik kiri (mouse) atau sentuhan (touch)
      if (e.button !== undefined && e.button !== 0) return;
      
      if (activePointerId !== null) return; // Abaikan jika sudah ada pointer aktif
      activePointerId = e.pointerId;
      
      // KUNCI: Set pointer capture agar event terus mengikuti mouse meski keluar area
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      
      drawing = true;
      hasStrokes = true;
      prevPos = getPos(e);
      
      // Buat titik awal (dot)
      ctx.beginPath();
      ctx.arc(prevPos.x, prevPos.y, o.strokeWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = o.strokeColor;
      ctx.fill();
      
      e.preventDefault();
    }

    function onPointerMove(e) {
      if (!drawing || e.pointerId !== activePointerId) return;
      
      const currentPos = getPos(e);
      
      ctx.beginPath();
      ctx.moveTo(prevPos.x, prevPos.y);
      ctx.lineTo(currentPos.x, currentPos.y);
      ctx.stroke();
      
      prevPos = currentPos;
      e.preventDefault();
    }

    function onPointerUp(e) {
      if (e.pointerId !== activePointerId) return;
      
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
      
      drawing = false;
      activePointerId = null;
      prevPos = null;
      e.preventDefault();
    }

    function onPointerCancel(e) {
      if (e.pointerId !== activePointerId) return;
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
      drawing = false;
      activePointerId = null;
      prevPos = null;
    }

    // --- Attach Listeners ---
    if (window.PointerEvent) {
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointercancel', onPointerCancel);
    } else {
      // Fallback (Browser lawas)
      canvas.addEventListener('mousedown', onPointerDown);
      window.addEventListener('mousemove', onPointerMove);
      window.addEventListener('mouseup', onPointerUp);
      canvas.addEventListener('touchstart', onPointerDown, {passive: false});
      canvas.addEventListener('touchmove', onPointerMove, {passive: false});
      canvas.addEventListener('touchend', onPointerUp, {passive: false});
    }

    // --- API Public ---
    return {
      isEmpty: function () { return !hasStrokes; },
      clear: function () {
        hasStrokes = false;
        drawing = false;
        activePointerId = null;
        prevPos = null;
        ctx.fillStyle = o.bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      },
      toDataURL: function (type, quality) {
        return canvas.toDataURL(type || 'image/png', quality);
      },
      getCanvas: function () { return canvas; },
      destroy: function () {
        if (window.PointerEvent) {
          canvas.removeEventListener('pointerdown', onPointerDown);
          canvas.removeEventListener('pointermove', onPointerMove);
          canvas.removeEventListener('pointerup', onPointerUp);
          canvas.removeEventListener('pointercancel', onPointerCancel);
        } else {
          canvas.removeEventListener('mousedown', onPointerDown);
          window.removeEventListener('mousemove', onPointerMove);
          window.removeEventListener('mouseup', onPointerUp);
          canvas.removeEventListener('touchstart', onPointerDown);
          canvas.removeEventListener('touchmove', onPointerMove);
          canvas.removeEventListener('touchend', onPointerUp);
        }
        container.innerHTML = '';
      }
    };
  }

  return { mount };
})();