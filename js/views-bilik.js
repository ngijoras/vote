/* ============================================================
   E-VOTE • views-bilik.js
   Role: BILIK
   ============================================================ */
window.ViewsBilik = (function () {
  'use strict';

  const POLL_MS   = 2500;
  const CAM_MAX   = 320;
  const PHOTO_Q   = 0.7;
  
  const LABELS = {
    ketua_rt:           'Ketua RT',
    ketua_pemuda:       'Ketua Pemuda',
    wakil_pemuda:       'Wakil Ketua Pemuda',
    ketua_wakil_pemuda: 'Ketua & Wakil Pemuda',
  };
  const labelPos = p => LABELS[p] || p;

  /* ---------- Module state ---------- */
  let pollTimer = null;
  let pingTimer = null; // <-- Tambahan untuk Heartbeat
  let cameraStream = null;
  let state = {
    booth:      null,
    voter:      null,
    candidates: [],
    photo:      null,
    loading:    false,
  };

  function user() { return API.user() || {}; }
  function view() { return document.getElementById('view'); }
  function isTrue(v) { return v === true || String(v) === 'TRUE' || String(v) === 'true'; }
  function esc(s) { return UI.escapeHtml(s); }

  /* ---------- Cleanup ---------- */
  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
  function stopPing() { if (pingTimer) { clearInterval(pingTimer); pingTimer = null; } }
  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
    }
  }
  function cleanup() {
    stopPoll();
    stopPing();
    stopCamera();
    state = { booth: null, voter: null, candidates: [], photo: null, loading: false };
  }

  /* ============================================================
   *  ENTRY
   * ============================================================ */
  async function dashboard() {
    cleanup();
    const el = view();
    el.innerHTML = `
      <div class="card" id="bilikStatusCard">
        <div class="row-between">
          <div>
            <h3>Status Bilik</h3>
            <p class="hint" id="bilikStatusText">Memuat…</p>
          </div>
          <span class="badge" id="bilikBadge">—</span>
        </div>
      </div>

      <div class="card" id="bilikActiveCard" style="display:none">
        <div class="row-between">
          <div>
            <h3 id="activeVoterName">—</h3>
            <p class="hint" id="activeVoterMeta">—</p>
          </div>
          <div class="row" style="margin:0">
            <button class="btn-ghost btn-sm" id="btnCamOn">📷 Kamera</button>
            <button class="btn-ghost btn-sm" id="btnCamSnap">📸 Ambil Foto</button>
          </div>
        </div>
        <div id="camWrap" style="margin-top:12px;display:none">
          <video id="camPreview" autoplay playsinline muted style="width:100%;max-width:${CAM_MAX}px;border-radius:12px;background:#000"></video>
          <canvas id="photoCanvas" style="display:none"></canvas>
          <div id="photoThumb" style="margin-top:8px"></div>
        </div>
      </div>

      <div id="voteArea"></div>
    `;

    document.getElementById('btnCamOn').onclick = () => startCamera();
    document.getElementById('btnCamSnap').onclick = () => capturePhoto();

    await loadCandidates();

    // Kirim ping pertama
    API.post('booth.ping').catch(() => {});
    // Set interval ping setiap 30 detik
    pingTimer = setInterval(() => {
      API.post('booth.ping').catch(() => {});
    }, 30000);

    await refreshBooth();
    pollTimer = setInterval(refreshBooth, POLL_MS);
  }

  /* ============================================================
   *  DATA LOADERS
   * ============================================================ */
  async function loadCandidates() {
    const r = await API.post('list', { sheet: 'candidates' });
    if (!r.success) return;
    state.candidates = (r.data || []).filter(c => isTrue(c.active));
  }

  async function refreshBooth() {
    const me = user();
    if (!me.boothId) {
      renderNoBooth();
      return;
    }
    
    if (state.voter) return; // Jangan ganggu jika sedang memilih

    const r = await API.post('booth.status');
    if (!r.success) return;
    
    const booth = (r.data || []).find(b => String(b.id) === String(me.boothId));
    if (!booth) {
      renderBoothMissing();
      return;
    }
    state.booth = booth;
    renderBoothStatus(booth);

    if (booth.currentVoterId) {
      await loadActiveVoter(booth.currentVoterId);
    } else {
      clearActiveVoter();
    }
  }

  async function loadActiveVoter(voterId) {
    if (state.voter && String(state.voter.id) === String(voterId)) return;
    state.loading = true;
    const r = await API.post('list', { sheet: 'voters', filter: { id: voterId } });
    state.loading = false;
    
    if (!r.success || !r.data || !r.data.length) {
      UI.toast('Gagal memuat data pemilih', 'error');
      return;
    }
    const voter = r.data[0];
    if (isTrue(voter.voted)) {
      await API.post('booth.setCurrent', { boothId: state.booth.id, voterId: '' });
      return;
    }
    state.voter = voter;
    state.photo = null;
    renderVoting();
    if (cameraStream) setTimeout(() => capturePhoto(true), 700);
  }

  function clearActiveVoter() {
    if (!state.voter) return;
    state.voter = null;
    state.photo = null;
    const card = document.getElementById('bilikActiveCard');
    if (card) card.style.display = 'none';
    const voteArea = document.getElementById('voteArea');
    if (voteArea) {
      voteArea.innerHTML = `
        <div class="card text-center" style="padding:40px">
          <div style="font-size:2rem">🗳️</div>
          <h3 style="margin-top:8px">Menunggu Pemilih…</h3>
          <p class="hint">Pemilih akan diarahkan otomatis oleh petugas.</p>
        </div>`;
    }
  }

  /* ============================================================
   *  RENDER
   * ============================================================ */
  function renderNoBooth() {
    const text = document.getElementById('bilikStatusText');
    const badge = document.getElementById('bilikBadge');
    if (text) text.textContent = 'Akun bilik ini belum terhubung ke bilik manapun.';
    if (badge) { badge.textContent = 'Belum'; badge.className = 'badge warn'; }
  }

  function renderBoothMissing() {
    const text = document.getElementById('bilikStatusText');
    const badge = document.getElementById('bilikBadge');
    if (text) text.textContent = 'Bilik tidak ditemukan di sistem. Hubungi admin.';
    if (badge) { badge.textContent = 'Error'; badge.className = 'badge danger'; }
  }

  function renderBoothStatus(booth) {
    const text = document.getElementById('bilikStatusText');
    const badge = document.getElementById('bilikBadge');
    if (!text || !badge) return;
    const active = !!booth.currentVoterId;
    text.textContent = `${booth.name} — ${active ? 'sedang dipakai' : 'siap menerima pemilih'}`;
    badge.textContent = active ? 'Terisi' : 'Siap';
    badge.className = 'badge ' + (active ? 'occupied' : 'ready');

    const card = document.getElementById('bilikActiveCard');
    if (card) card.style.display = active ? 'block' : 'none';

    if (!active && !state.voter) {
      const voteArea = document.getElementById('voteArea');
      if (voteArea) {
        voteArea.innerHTML = `
          <div class="card text-center" style="padding:40px">
            <div style="font-size:2rem">🗳️</div>
            <h3 style="margin-top:8px">Menunggu Pemilih…</h3>
            <p class="hint">Pemilih akan diarahkan otomatis oleh petugas.</p>
          </div>`;
      }
    }
  }

  function renderVoting() {
    const v = state.voter;
    if (!v) return;
    document.getElementById('activeVoterName').textContent = v.name || 'Pemilih';
    document.getElementById('activeVoterMeta').textContent = `Kode: ${v.code || '-'} • RT ${v.rt || '-'} / RW ${v.rw || '-'}`;

    const groups = {};
    state.candidates.forEach(c => { (groups[c.position] = groups[c.position] || []).push(c); });
    const positions = Object.keys(groups);
    const voteArea = document.getElementById('voteArea');

    if (!positions.length) {
      voteArea.innerHTML = `<div class="card text-center" style="padding:32px"><p class="hint" style="color:var(--err)">Belum ada calon aktif. Hubungi admin.</p></div>`;
      return;
    }

    voteArea.innerHTML = `
      <div class="card">
        <h3>Pilih Calon</h3>
        <p class="hint">Pilih satu calon per posisi.</p>
        ${positions.map(pos => `
          <div class="pos-group" data-pos="${esc(pos)}">
            <h4>${esc(labelPos(pos))}</h4>
            <div class="cand-list">
              ${groups[pos].map(c => `
                <label class="cand-item">
                  <input type="radio" name="pos-${esc(pos)}" value="${esc(c.id)}">
                  <img src="${esc(c.photoUrl || '')}" alt="" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2252%22 height=%2252%22><circle cx=%2226%22 cy=%2226%22 r=%2226%22 fill=%22%23e2e8f0%22/></svg>'">
                  <div><strong>${esc(c.name)}</strong><div class="hint">No. ${esc(c.noUrut || '-')}</div></div>
                </label>`).join('')}
            </div>
          </div>`).join('')}
        <div class="row" style="margin-top:16px">
          <button class="btn-ghost" id="btnBlank">Suara Kosong</button>
          <button class="btn-primary" id="btnSubmit">✅ Kirim Suara</button>
        </div>
      </div>
    `;

    document.getElementById('btnBlank').onclick = () => submitVote(true);
    document.getElementById('btnSubmit').onclick = () => submitVote(false);
  }

  /* ============================================================
   *  CAMERA
   * ============================================================ */
  async function startCamera() {
    if (cameraStream) return;
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false });
      const video = document.getElementById('camPreview');
      const wrap = document.getElementById('camWrap');
      if (video) video.srcObject = cameraStream;
      if (wrap) wrap.style.display = 'block';
      UI.toast('Kamera aktif', 'success');
    } catch (e) { UI.toast('Kamera tidak bisa diakses: ' + (e.message || ''), 'error'); }
  }

  function capturePhoto(silent) {
    const video = document.getElementById('camPreview');
    const canvas = document.getElementById('photoCanvas');
    if (!video || !canvas) return;
    if (!video.videoWidth) { if (!silent) UI.toast('Kamera belum siap', 'error'); return; }
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    state.photo = canvas.toDataURL('image/jpeg', PHOTO_Q);
    
    const thumb = document.getElementById('photoThumb');
    if (thumb) thumb.innerHTML = `<img src="${state.photo}" style="max-width:120px;border-radius:10px;border:1px solid var(--border)">`;
    if (!silent) UI.toast('Foto tersimpan', 'success');
  }

  /* ============================================================
   *  SUBMIT
   * ============================================================ */
  async function submitVote(blank) {
    const v = state.voter;
    if (!v) { UI.toast('Tidak ada pemilih aktif', 'error'); return; }

    const votes = [];
    document.querySelectorAll('.pos-group').forEach(g => {
      const sel = g.querySelector('input:checked');
      if (sel) votes.push({ position: g.dataset.pos, candidateId: sel.value });
    });

    if (!blank && votes.length === 0) { UI.toast('Pilih minimal satu calon atau klik "Suara Kosong"', 'error'); return; }

    const ok = await UI.confirm(blank ? `Kirim SUARA KOSONG untuk ${v.name}?` : `Kirim suara untuk ${v.name}? Tidak bisa diubah.`, { okLabel: 'Ya, Kirim' });
    if (!ok) return;

    const btn = document.getElementById('btnSubmit');
    if (btn) { btn.disabled = true; btn.textContent = 'Mengirim…'; }

    const payload = { voterId: v.id, votes: votes, photoUrl: state.photo || '' };
    const r = await API.post('vote.submit', payload);

    if (!r.success) {
      UI.toast(r.message || 'Gagal mengirim suara', 'error');
      if (btn) { btn.disabled = false; btn.textContent = '✅ Kirim Suara'; }
      return;
    }

    UI.toast('Suara tersimpan. Terima kasih!', 'success');
    try { Voice.speak('Terima kasih. Suara Anda telah tersimpan.'); } catch (_) {}

    stopCamera();
    const wrap = document.getElementById('camWrap');
    if (wrap) wrap.style.display = 'none';
    const thumb = document.getElementById('photoThumb');
    if (thumb) thumb.innerHTML = '';
    state.voter = null;
    state.photo = null;

    document.getElementById('bilikActiveCard').style.display = 'none';
    document.getElementById('voteArea').innerHTML = `
      <div class="card text-center" style="padding:40px">
        <div style="font-size:2rem">✅</div>
        <h3 style="margin-top:8px">Suara Tersimpan</h3>
        <p class="hint">Menunggu pemilih berikutnya…</p>
      </div>`;
    refreshBooth();
  }

  /* ============================================================
   *  EXPORTS
   * ============================================================ */
  return {
    dashboard,
    startCamera,
    capturePhoto,
    submitVote,
    _clearAllPolls: cleanup
  };
})();