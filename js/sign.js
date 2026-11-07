/* ============================================================
   E-VOTE • sign.js (Versi Anti-Gagal PC)
   ============================================================ */
window.Sign = (function () {
  'use strict';

  function mount(container, opts) {
    if (!container) throw new Error('Sign.mount: container element required');

    container.innerHTML = '';
    
    // Set ukuran canvas yang solid
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 200;
    
    // CSS Mencegah seleksi teks & gesture browser
    canvas.style.cssText = `
      width: 100%;
      height: auto;
      aspect-ratio: 600 / 200;
      background: #ffffff;
      border-radius: 8px;
      cursor: crosshair;
      display: block;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    `;
    
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    
    // Selalu isi background putih
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    let hasDrawn = false;

    // Fungsi menghitung koordinat presisi
    function getCoordinates(e) {
      const rect = canvas.getBoundingClientRect();
      
      // Validasi agar tidak error jika canvas belum tampil
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

    function startDrawing(e) {
      if (e.button === 2) return; // Abaikan klik kanan
      e.preventDefault(); // Cegah drag & drop teks browser
      
      isDrawing = true;
      hasDrawn = true;
      
      const pos = getCoordinates(e);
      lastX = pos.x;
      lastY = pos.y;
      
      // Gambar titik awal
      ctx.beginPath();
      ctx.arc(lastX, lastY, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
    }

    // Fungsi Inti: Dilacak dari window agar tidak terputus saat mouse keluar
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

    // Attach Events (Mouse & Touch)
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('touchstart', startDrawing, {passive: false});
    
    // Listener global di Window (Kunci utama tidak putus saat keluar kotak)
    window.addEventListener('mousemove', draw);
    window.addEventListener('touchmove', draw, {passive: false});
    
    window.addEventListener('mouseup', stopDrawing);
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
        return canvas.toDataURL('image/png');
      },
      getCanvas: function () { return canvas; }
    };
  }

  return { mount };
})();