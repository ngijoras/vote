/* ============================================================
   E-VOTE • sign.js (Versi Brutal - Base64 Super Kecil)
   ============================================================ */
window.Sign = (function () {
  'use strict';

  function mount(container, opts) {
    if (!container) throw new Error('Sign.mount: container element required');
    container.innerHTML = '';

    const canvas = document.createElement('canvas');
    // Resolusi kecil, hemat memori
    canvas.width = 400;
    canvas.height = 150;
    
    canvas.style.cssText = `
      width: 100%;
      height: auto;
      aspect-ratio: 400 / 150;
      background: #ffffff;
      border: 1px dashed #cbd5e1;
      border-radius: 8px;
      cursor: crosshair;
      display: block;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      -ms-user-select: none;
    `;
    
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let isDrawing = false;
    let hasDrawn = false;
    let lastX = 0;
    let lastY = 0;

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      
      let clientX = e.clientX;
      let clientY = e.clientY;
      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      }

      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    }

    function start(e) {
      if (e.button !== undefined && e.button !== 0) return; // Klik kiri aja
      e.preventDefault();
      isDrawing = true;
      hasDrawn = true;
      
      const pos = getPos(e);
      lastX = pos.x;
      lastY = pos.y;
      
      ctx.beginPath();
      ctx.arc(lastX, lastY, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
    }

    function draw(e) {
      if (!isDrawing) return;
      e.preventDefault();
      
      const pos = getPos(e);
      
      // Abaikan getaran mikro agar tidak terlalu banyak titik
      const dx = pos.x - lastX;
      const dy = pos.y - lastY;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      
      lastX = pos.x;
      lastY = pos.y;
    }

    function stop(e) {
      if (!isDrawing) return;
      isDrawing = false;
    }

    // GLOBAL TRACKING (Anti hilang di PC)
    if (window.PointerEvent) {
      canvas.addEventListener('pointerdown', start);
      window.addEventListener('pointermove', draw);
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
    } else {
      canvas.addEventListener('mousedown', start);
      window.addEventListener('mousemove', draw);
      window.addEventListener('mouseup', stop);
      canvas.addEventListener('touchstart', start, {passive: false});
      window.addEventListener('touchmove', draw, {passive: false});
      window.addEventListener('touchend', stop);
    }

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    return {
      isEmpty: function () { return !hasDrawn; },
      clear: function () {
        hasDrawn = false;
        isDrawing = false;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#0f172a';
      },
      toDataURL: function () {
        // KOMPRESI JPEG 0.4: Ukuran pasti < 10.000 karakter
        return canvas.toDataURL('image/jpeg', 0.4);
      },
      getCanvas: function () { return canvas; }
    };
  }

  return { mount };
})();