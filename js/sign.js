/* ============================================================
   E-VOTE • sign.js (Versi Brutal - Dijamin Jalan di PC)
   ============================================================ */
window.Sign = (function () {
  'use strict';

  function mount(container, opts) {
    if (!container) throw new Error('Sign.mount: container element required');
    container.innerHTML = '';

    const canvas = document.createElement('canvas');
    // Resolusi kecil agar ringan dan hemat memori
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
    
    // Paksa background putih solid
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    let hasDrawn = false;

    function getCoordinates(e) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };

      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      
      // Support Touch and Mouse
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

    function startDrawing(e) {
      if (e.button === 2) return; // Abaikan klik kanan
      e.preventDefault(); // Blokir drag text browser
      
      isDrawing = true;
      hasDrawn = true;
      const pos = getCoordinates(e);
      lastX = pos.x;
      lastY = pos.y;
      
      // Titik awal
      ctx.beginPath();
      ctx.arc(lastX, lastY, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
    }

    // Fungsi ini didengarkan di WINDOW, bukan Canvas. 
    // Jadi sejauh apapun mouse bergerak, garis akan terus mengikuti.
    function draw(e) {
      if (!isDrawing) return;
      e.preventDefault();
      
      const pos = getCoordinates(e);
      
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      
      lastX = pos.x;
      lastY = pos.y;
    }

    function stopDrawing(e) {
      if (!isDrawing) return;
      isDrawing = false;
    }

    // --- EVENT LISTENERS ---
    // Mouse
    canvas.addEventListener('mousedown', startDrawing);
    window.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDrawing);
    
    // Touch (HP)
    canvas.addEventListener('touchstart', startDrawing, {passive: false});
    window.addEventListener('touchmove', draw, {passive: false});
    window.addEventListener('touchend', stopDrawing);
    window.addEventListener('touchcancel', stopDrawing);
    
    // Cegah klik kanan
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
        // KUNCI: Gunakan JPEG kualitas 0.4 agar ukuran Base64 sangat kecil (< 5KB)
        // Ini mencegah Google Sheets memotong data (limit 50.000 karakter).
        return canvas.toDataURL('image/jpeg', 0.4);
      },
      getCanvas: function () { return canvas; }
    };
  }

  return { mount };
})();