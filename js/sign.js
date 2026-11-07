/* ============================================================
   E-VOTE • sign.js (Versi Brutal - Dijamin Jalan di PC)
   ============================================================ */
window.Sign = (function () {
  'use strict';

  function mount(container, opts) {
    if (!container) throw new Error('Sign.mount: container element required');
    container.innerHTML = '';

    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 150;
    
    // CSS Mencegah seleksi teks browser PC
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
    let hasDrawn = false;
    let lastX = 0;
    let lastY = 0;

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }

    function start(e) {
      // Abaikan klik kanan
      if (e.button !== undefined && e.button !== 2) { // 0 = kiri
        e.preventDefault();
        isDrawing = true;
        const pos = getPos(e);
        lastX = pos.x;
        lastY = pos.y;
        
        ctx.beginPath();
        ctx.arc(lastX, lastY, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
      }
    }

    // KUNCI: Event listener dipasang di WINDOW (seluruh layar)
    // Jadi meskipun mouse keluar dari kotak, garis tetap dilacak.
    function draw(e) {
      if (!isDrawing) return;
      e.preventDefault(); // Blokir seleksi teks
      
      const pos = getPos(e);
      
      // Hitung jarak gerak (jika terlalu kecil, abaikan)
      const dx = pos.x - lastX;
      const dy = pos.y - lastY;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return; // Abaikan getaran mikro
      
      hasDrawn = true; // Sah digambar jika ada pergerakan
      
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

    // Gunakan PointerEvents (Mendukung Mouse, Touch, Stylus secara seragam)
    if (window.PointerEvent) {
      canvas.addEventListener('pointerdown', start);
      window.addEventListener('pointermove', draw);
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
    } else {
      // Fallback browser lawas
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
        // Kompres ke JPEG kualitas 0.4 (Sangat kecil, aman dari limit Google Sheets)
        return canvas.toDataURL('image/jpeg', 0.4);
      },
      getCanvas: function () { return canvas; }
    };
  }

  return { mount };
})();