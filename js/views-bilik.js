/* ============================================================
   E-VOTE • views-bilik.js (FULL FIX)
   Role: BILIK
   ============================================================ */
window.ViewsBilik = (function () {
  'use strict';

  const POLL_MS   = 2500;
  const PING_MS   = 30000;
  const CAM_MAX   = 320;
  const PHOTO_Q   = 0.7;
  
  const LABELS = {
    ketua_rt:           'Ketua RT',
    ketua_pemuda:       'Ketua Pemuda',
    wakil_pemuda:       'Wakil Ketua Pemuda',
    ketua_wakil_pemuda: 'Ketua & Wakil Pemuda',
  };
  const labelPos = p => LABELS[p] || p;

  let pollTimer = null;
  let pingTimer = null;
  let cameraStream = null;
  let loadingBooth = false;
  let loadingVoter = false;

  let state = {
    booth:      null,
    voter:      null,
    candidates: [],
    photo:      null,
    submitting: false,
    settings:   {}
  };

  function user() { return API.user() || {}; }
  function view() { return document.getElementById('view'); }
  function isTrue(v) { return v === true || String(v) === 'TRUE' || String(v) === 'true'; }
  function esc(s) { return UI.escapeHtml(s); }

  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
  function stopPing() { if (pingTimer) { clearInterval(pingTimer); pingTimer = null; } }
  function stopCamera() {
    if (cameraStream) {
      try { cameraStream.getTracks().forEach(t => t.stop()); } catch (_) {}
      cameraStream = null;
    }
    const video = document.getElementById('camPreview');
    if (video) { try { video.srcObject = null; } catch (_) {} }
  }
  function cleanup() {
    stopPoll();
    stopPing();
    stopCamera();
    loadingBooth = false;
    loadingVoter = false;
    state = { booth: null, voter: null, candidates: [], photo: null, submitting: false, settings: {} };
  }

  /* ENTRY */
  async function dashboard() {
    cleanup();
    const el = view();
    if (!el) return;

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
            <button class="btn-ghost btn-sm" id="btnCamOn" type="button">📷 Kamera</button>
            <button class="btn-ghost btn-sm" id="btnCamSnap" type="button">📸 Ambil Foto</button>
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

    const btnCamOn = document.getElementById('btnCamOn');
    const btnCamSnap = document.getElementById('btnCamSnap');
    if (btnCamOn) btnCamOn.onclick = () => startCamera();
    if (btnCamSnap) btnCamSnap.onclick = () => capturePhoto(false);

    await loadSettings();
    await loadCandidates();

    API.post('booth.ping').catch(() => {});
    pingTimer = setInterval(() => {
      if (!document.getElementById('bilikStatusCard')) { stopPing(); return; }
      API.post('booth.ping').catch(() => {});
    }, PING_MS);

    await refreshBooth();
    pollTimer = setInterval(refreshBooth, POLL_MS);
  }

  async function loadSettings() {
    try {
      const r = await API.post('settings.public');
      if (r && r.success) state.settings = r.data || {};
    } catch (_) {}
  }

  async function loadCandidates() {
    try {
      const r = await API.post('list', { sheet: 'candidates' });
      if (!r || !r.success) return;
      state.candidates = (r.data || []).filter(c => isTrue(c.active));
    } catch (_) {
      state.candidates = [];
    }
  }

  async function refreshBooth() {
    if (loadingBooth || loadingVoter) return;
    if (state.voter) return;

    const me = user();
    if (!me.boothId) { renderNoBooth(); return; }

    loadingBooth = true;
    try {
      const r = await API.post('booth.status');
      if (!r || !r.success) return;

      const booth = (r.data || []).find(b => String(b.id) === String(me.boothId));
      if (!booth) { renderBoothMissing(); return; }

      state.booth = booth;
      renderBoothStatus(booth);

      if (booth.currentVoterId) {
        await loadActiveVoter(booth.currentVoterId);
      } else {
        clearActiveVoter();
      }
    } catch (err) {
      console.warn('[bilik] refreshBooth error:', err);
    } finally {
      loadingBooth = false;
    }
  }

  async function loadActiveVoter(voterId) {
    if (state.voter && String(state.voter.id) === String(voterId)) return;
    if (loadingVoter) return;

    loadingVoter = true;
    try {
      const r = await API.post('list', { sheet: 'voters', filter: { id: voterId } });
      if (!r || !r.success || !r.data || !r.data.length) {
        UI.toast('Gagal memuat data pemilih', 'error');
        return;
      }
      const voter = r.data[0];

      if (isTrue(voter.voted)) {
        try { await API.post('booth.setCurrent', { boothId: state.booth.id, voterId: '', name: state.booth.name || '' }); } catch (_) {}
        return;
      }

      state.voter = voter;
      state.photo = null;
      renderVoting();

      if (cameraStream) setTimeout(() => capturePhoto(true), 700);
    } catch (err) {
      console.warn('[bilik] loadActiveVoter error:', err);
    } finally {
      loadingVoter = false;
    }
  }

  function clearActiveVoter() {
    if (!state.voter) { renderWaiting(); return; }
    state.voter = null;
    state.photo = null;

    const card = document.getElementById('bilikActiveCard');
    if (card) card.style.display = 'none';
    const thumb = document.getElementById('photoThumb');
    if (thumb) thumb.innerHTML = '';

    renderWaiting();
  }

  /* RENDER */
  function renderNoBooth() {
    const text = document.getElementById('bilikStatusText');
    const badge = document.getElementById('bilikBadge');
    if (text) text.textContent = 'Akun bilik ini belum terhubung ke bilik manapun. Hubungi admin.';
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
    text.textContent = `${booth.name || 'Bilik'} — ${active ? 'sedang dipakai' : 'siap menerima pemilih'}`;
    badge.textContent = active ? 'Terisi' : 'Siap';
    badge.className = 'badge ' + (active ? 'occupied' : 'ready');

    const card = document.getElementById('bilikActiveCard');
    if (card) card.style.display = active ? 'block' : 'none';
  }

  function renderWaiting() {
    const voteArea = document.getElementById('voteArea');
    if (!voteArea) return;
    voteArea.innerHTML = `
      <div class="card text-center" style="padding:40px">
        <div style="font-size:2rem">🗳️</div>
        <h3 style="margin-top:8px">Menunggu Pemilih…</h3>
        <p class="hint">Pemilih akan diarahkan otomatis oleh petugas.</p>
      </div>`;
  }

  function renderVoting() {
    const v = state.voter;
    if (!v) { renderWaiting(); return; }

    const nameEl = document.getElementById('activeVoterName');
    const metaEl = document.getElementById('activeVoterMeta');
    if (nameEl) nameEl.textContent = v.name || 'Pemilih';
    if (metaEl) metaEl.textContent = `Kode: ${v.code || '-'} • RT ${v.rt || '-'} / RW ${v.rw || '-'}`;

    const groups = {};
    state.candidates.forEach(c => { (groups[c.position] = groups[c.position] || []).push(c); });
    const positions = Object.keys(groups);
    const voteArea = document.getElementById('voteArea');
    if (!voteArea) return;

    if (!positions.length) {
      voteArea.innerHTML = `<div class="card text-center" style="padding:32px"><p class="hint" style="color:var(--err)">Belum ada calon aktif. Hubungi admin.</p></div>`;
      return;
    }

    const mode = state.settings.voting_mode || 'single';
    const isDual = (mode === 'dual');
    const inputType = isDual ? 'checkbox' : 'radio';

    voteArea.innerHTML = `
      <div class="card">
        <h3>Pilih Calon</h3>
        <p class="hint">${isDual ? 'Anda dapat memilih maksimal 2 calon (Ketua & Wakil).' : 'Pilih satu calon per posisi.'}</p>
        ${positions.map(pos => `
          <div class="pos-group" data-pos="${esc(pos)}">
            <h4>${esc(labelPos(pos))}</h4>
            <div class="cand-list">
              ${groups[pos].map(c => `
                <label class="cand-item">
                  <input type="${inputType}" name="pos-${esc(pos)}" value="${esc(c.id)}" class="${isDual ? 'dual-checkbox' : ''}">
                  <img src="${esc(c.photoUrl || '')}" alt=""
                       onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2252%22 height=%2252%22><circle cx=%2226%22 cy=%2226%22 r=%2226%22 fill=%22%23e2e8f0%22/></svg>'">
                  <div><strong>${esc(c.name)}</strong><div class="hint">No. ${esc(c.noUrut || '-')}</div></div>
                </label>`).join('')}
            </div>
          </div>`).join('')}
        <div class="row" style="margin-top:16px">
          <button class="btn-ghost" id="btnBlank" type="button">Suara Kosong</button>
          <button class="btn-primary" id="btnSubmit" type="button">✅ Kirim Suara</button>
        </div>
      </div>
    `;

    const btnBlank = document.getElementById('btnBlank');
    const btnSubmit = document.getElementById('btnSubmit');
    if (btnBlank)  btnBlank.onclick  = () => submitVote(true);
    if (btnSubmit) btnSubmit.onclick = () => submitVote(false);
  }

  /* CAMERA */
  async function startCamera() {
    if (cameraStream) { UI.toast('Kamera sudah aktif', 'info'); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      UI.toast('Browser tidak mendukung kamera', 'error'); return;
    }
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 } }, audio: false
      });
      const video = document.getElementById('camPreview');
      const wrap = document.getElementById('camWrap');
      if (video) video.srcObject = cameraStream;
      if (wrap) wrap.style.display = 'block';
      UI.toast('Kamera aktif', 'success');
    } catch (e) {
      cameraStream = null;
      UI.toast('Kamera tidak bisa diakses: ' + (e.message || ''), 'error');
    }
  }

  function capturePhoto(silent) {
    const video = document.getElementById('camPreview');
    const canvas = document.getElementById('photoCanvas');
    if (!video || !canvas) return;
    if (!video.videoWidth) { if (!silent) UI.toast('Kamera belum siap', 'error'); return; }

    try {
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      state.photo = canvas.toDataURL('image/jpeg', PHOTO_Q);

      const thumb = document.getElementById('photoThumb');
      if (thumb) {
        thumb.innerHTML = `<img src="${state.photo}" alt="Foto" style="max-width:120px;border-radius:10px;border:1px solid var(--border)">`;
      }
      if (!silent) UI.toast('Foto tersimpan', 'success');
    } catch (err) {
      if (!silent) UI.toast('Gagal ambil foto: ' + err.message, 'error');
    }
  }

  /* SUBMIT */
  async function submitVote(blank) {
    if (state.submitting) return;

    const v = state.voter;
    if (!v) { UI.toast('Tidak ada pemilih aktif', 'error'); return; }

    const mode = state.settings.voting_mode || 'single';
    const isDual = (mode === 'dual');
    const votes = [];
    let isError = false;

    document.querySelectorAll('.pos-group').forEach(g => {
      const checked = g.querySelectorAll('input:checked');
      
      if (isDual && checked.length > 2) {
        UI.toast('Maksimal memilih 2 calon (Ketua & Wakil)', 'error');
        isError = true;
      }

      checked.forEach(sel => {
        votes.push({ position: g.dataset.pos, candidateId: sel.value });
      });
    });

    if (isError) return;

    if (!blank && votes.length === 0) {
      UI.toast('Pilih minimal satu calon atau klik "Suara Kosong"', 'error');
      return;
    }

    const confirmMsg = blank
      ? `Kirim SUARA KOSONG untuk ${v.name}?`
      : `Kirim ${votes.length} suara untuk ${v.name}? Tidak bisa diubah.`;

    const ok = await UI.confirm(confirmMsg, { okLabel: 'Ya, Kirim' });
    if (!ok) return;

    state.submitting = true;
    const btnSubmit = document.getElementById('btnSubmit');
    const btnBlank  = document.getElementById('btnBlank');
    if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.textContent = 'Mengirim…'; }
    if (btnBlank)  { btnBlank.disabled = true; }

    try {
      const payload = { voterId: v.id, votes: votes, photoUrl: state.photo || '' };
      const r = await API.post('vote.submit', payload);

      if (!r || !r.success) {
        UI.toast((r && r.message) || 'Gagal mengirim suara', 'error');
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

      const activeCard = document.getElementById('bilikActiveCard');
      if (activeCard) activeCard.style.display = 'none';

      const voteArea = document.getElementById('voteArea');
      if (voteArea) {
        voteArea.innerHTML = `
          <div class="card text-center" style="padding:40px">
            <div style="font-size:2rem">✅</div>
            <h3 style="margin-top:8px">Suara Tersimpan</h3>
            <p class="hint">Menunggu pemilih berikutnya…</p>
          </div>`;
      }

      refreshBooth();
    } catch (err) {
      UI.toast('Koneksi bermasalah: ' + (err.message || err), 'error');
    } finally {
      state.submitting = false;
      const btnSubmit2 = document.getElementById('btnSubmit');
      const btnBlank2  = document.getElementById('btnBlank');
      if (btnSubmit2) { btnSubmit2.disabled = false; btnSubmit2.textContent = '✅ Kirim Suara'; }
      if (btnBlank2)  { btnBlank2.disabled = false; }
    }
  }

  /* EXPORTS */
  return {
    dashboard,
    startCamera,
    capturePhoto,
    submitVote,
    _clearAllPolls: cleanup
  };
})();