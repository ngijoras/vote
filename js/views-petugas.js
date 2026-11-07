/* ============================================================
   E-VOTE • views-petugas.js (FULL FIX)
   Role: PETUGAS (asisten panitia)
   Menu: Dashboard • Absensi (scan) • Antrian & Bilik
   (Results & Berita Acara di-delegate ke ViewsAdmin)
   
   Perbaikan:
   - setPoll anti race (flag busy)
   - QR scanner lifecycle bersih (auto-stop, restart aman)
   - Signature pad dibersihkan saat batal
   - Checkin idempotent (double-click guard)
   - Error API transient tidak crash
   - Poll dibersihkan saat DOM hilang
   ============================================================ */
window.ViewsPetugas = (function () {
  'use strict';

  /* ---------- Helpers ---------- */
  const view = () => document.getElementById('view');
  const me   = () => API.user() || {};
  const isTrue = (v) => v === true || String(v) === 'TRUE' || String(v) === 'true';
  const esc = (s) => UI.escapeHtml(s);

  /* ============================================================
   *  POLLING (anti race, auto-cleanup)
   * ============================================================ */
  const polls = {};

  function setPoll(id, ms, fn) {
    clearPoll(id);
    let busy = false;
    polls[id] = setInterval(async () => {
      // Stop kalau target DOM hilang
      if (!document.getElementById(id)) {
        clearPoll(id);
        return;
      }
      if (busy) return; // anti race
      busy = true;
      try {
        await fn();
      } catch (e) {
        console.error('[poll:' + id + ']', e);
      } finally {
        busy = false;
      }
    }, ms);
  }
  function clearPoll(id) {
    if (polls[id]) {
      clearInterval(polls[id]);
      delete polls[id];
    }
  }
  function clearAllPolls() {
    Object.keys(polls).forEach(clearPoll);
  }

  /* ---------- Local state ---------- */
  let checkinState = { active: false, voter: null, pad: null, submitting: false };
  let waitingCache = [];
  let boothsCache  = [];

  function safeQRStop() {
    try { if (window.QR && QR.stop) QR.stop(); } catch (_) {}
  }

  /* ============================================================
   *  DASHBOARD PETUGAS
   * ============================================================ */
  async function dashboard() {
    clearAllPolls();
    safeQRStop();
    const el = view();
    if (!el) return;
    el.innerHTML = `<div id="petugasDash">${UI.skeleton(4)}</div>`;
    await loadDash();
  }

  async function loadDash() {
    const area = document.getElementById('petugasDash');
    if (!area) return;

    let sumRes, votersRes, boothsRes;
    try {
      [sumRes, votersRes, boothsRes] = await Promise.all([
        API.post('dash.summary'),
        API.post('list', { sheet: 'voters' }),
        API.post('booth.status'),
      ]);
    } catch (err) {
      area.innerHTML = `<div class="card"><p class="hint" style="color:var(--err)">Gagal memuat data: ${esc(err.message)}</p></div>`;
      return;
    }

    if (!sumRes || !sumRes.success) {
      area.innerHTML = `<div class="card"><p class="hint" style="color:var(--err)">${
        esc((sumRes && sumRes.message) || 'Gagal memuat data')}</p></div>`;
      return;
    }

    const d = sumRes.data || {};
    const voters = (votersRes && votersRes.data) || [];
    const booths = (boothsRes && boothsRes.data) || [];

    const waiting = voters.filter(v => v.checkinAt && !isTrue(v.voted) && !v.boothId);
    const notCheckedIn = voters.filter(v => !v.checkinAt && !isTrue(v.voted));
    const activeBooths = booths.filter(b => b.currentVoterId);

    area.innerHTML = `
      <div class="grid-3">
        <div class="stat"><small>Total Pemilih</small><h3>${d.totalVoters || 0}</h3></div>
        <div class="stat"><small>Sudah Memilih</small><h3>${d.voted || 0}</h3></div>
        <div class="stat"><small>Kursi Tunggu</small><h3>${waiting.length}</h3></div>
        <div class="stat"><small>Bilik Aktif</small><h3>${activeBooths.length} / ${d.boothsTotal || 0}</h3></div>
        <div class="stat"><small>Belum Absen</small><h3>${notCheckedIn.length}</h3></div>
        <div class="stat"><small>Bilik Siap</small><h3>${d.boothsReady || 0}</h3></div>
      </div>

      <div class="card">
        <h3>Aksi Cepat</h3>
        <p class="hint">Pantau alur pemilih secara real-time.</p>
        <div class="row">
          <a href="#/petugas/attendance" class="btn-primary">📷 Absensi Pemilih</a>
          <a href="#/petugas/queue" class="btn-ghost">🚪 Antrian &amp; Bilik</a>
          <a href="#/petugas/results" class="btn-ghost">📈 Hasil Real-Time</a>
        </div>
      </div>

      <div class="card">
        <div class="row-between">
          <h3>Status Bilik</h3>
          <span class="hint">${UI.formatTime(new Date())}</span>
        </div>
        <div style="margin-top:12px">
          ${booths.length === 0
            ? `<p class="hint">Belum ada bilik.</p>`
            : booths.map(b => `
                <div class="booth-row ${b.currentVoterId ? 'occupied' : 'ready'}">
                  <strong>${esc(b.name)}</strong>
                  <span class="badge ${b.currentVoterId ? 'occupied' : 'ready'}">
                    ${b.currentVoterId ? 'Terisi' : 'Siap'}
                  </span>
                  <span class="hint" style="margin-left:auto">
                    ${b.currentVoterId ? 'Sedang memilih' : 'Menunggu pemilih'}
                  </span>
                </div>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="row-between">
          <h3>Kursi Tunggu</h3>
          <span class="badge info">${waiting.length} orang</span>
        </div>
        <div style="margin-top:12px">
          ${waiting.length === 0
            ? `<p class="hint">Tidak ada pemilih menunggu.</p>`
            : waiting.map(v => `
                <div class="booth-row">
                  <strong>${esc(v.name)}</strong>
                  <span class="hint">${esc(v.code)}</span>
                  <span class="hint" style="margin-left:auto">${UI.formatTime(v.checkinAt)}</span>
                </div>`).join('')}
        </div>
      </div>
    `;
  }

  /* ============================================================
   *  ABSENSI (SCAN QR + TTD + CHECK-IN)
   * ============================================================ */
  async function attendance() {
    clearAllPolls();
    safeQRStop();
    checkinState = { active: false, voter: null, pad: null, submitting: false };

    const el = view();
    if (!el) return;
    el.innerHTML = `
      <div class="card" id="scanCard">
        <div class="row-between">
          <div>
            <h3>Scan QR Undangan</h3>
            <p class="hint">Arahkan kamera ke QR pada undangan pemilih.</p>
          </div>
          <button class="btn-ghost btn-sm" id="btnRestartScan" type="button">🔄 Restart Kamera</button>
        </div>
        <div id="qrReader" style="max-width:380px;margin:12px auto"></div>
        <hr>
        <label class="field">
          <span>Input manual (jika QR rusak)</span>
          <div class="row" style="margin:0">
            <input class="input" id="manualCode" placeholder="Masukkan kode pemilih…"
                   style="flex:1" autocomplete="off">
            <button class="btn-primary" id="btnManual" type="button">🔍 Cari</button>
          </div>
        </label>
      </div>

      <div class="card" id="checkinCard" style="display:none">
        <div class="row-between">
          <div>
            <h3 id="ciName">—</h3>
            <p class="hint" id="ciMeta">—</p>
          </div>
          <span class="badge ok">✓ Pemilih Ditemukan</span>
        </div>
        <hr>
        <h4>Tanda Tangan Digital</h4>
        <p class="hint">Minta pemilih untuk tanda tangan di bawah ini.</p>
        <div id="sigPad"></div>
        <div class="row" style="margin-top:12px">
          <button class="btn-ghost" id="btnSigClear" type="button">🧹 Hapus</button>
          <button class="btn-ghost" id="btnCancelCheckin" type="button">↩ Batal</button>
          <button class="btn-primary" id="btnSubmitCheckin" type="button">✅ Konfirmasi Kehadiran</button>
        </div>
      </div>

      <div class="card" id="successCard" style="display:none;text-align:center;padding:32px">
        <div style="font-size:2.5rem">✅</div>
        <h3 id="successName">—</h3>
        <p class="hint" id="successMsg">Kehadiran tercatat.</p>
        <div class="row" style="justify-content:center;margin-top:16px">
          <button class="btn-primary" id="btnNextScan" type="button">📷 Scan Berikutnya</button>
        </div>
      </div>
    `;

    const btnManual = document.getElementById('btnManual');
    const manualCode = document.getElementById('manualCode');
    const btnRestart = document.getElementById('btnRestartScan');

    if (btnManual) btnManual.onclick = onManualSearch;
    if (manualCode) manualCode.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onManualSearch(); }
    });
    if (btnRestart) btnRestart.onclick = restartScanner;

    startScanner();
  }

  /* ---------- Scanner control ---------- */
  async function startScanner() {
    const readerEl = document.getElementById('qrReader');
    if (!readerEl) return;
    readerEl.innerHTML = '';
    try {
      await QR.scanOnce('qrReader', onCodeScanned, () => {
        // onError — biarkan user klik Restart
      });
    } catch (e) {
      console.error('[scan]', e);
    }
  }

  async function restartScanner() {
    safeQRStop();
    await new Promise(r => setTimeout(r, 200));
    // Hanya restart jika masih di halaman attendance
    if (document.getElementById('qrReader')) startScanner();
  }

  async function onManualSearch() {
    const input = document.getElementById('manualCode');
    if (!input) return;
    const code = input.value.trim();
    if (!code) { UI.toast('Kode tidak boleh kosong', 'warn'); return; }
    safeQRStop();
    await handleCode(code);
  }

  async function onCodeScanned(code) {
    await handleCode(code);
  }

  /* ---------- Handle valid code ---------- */
  async function handleCode(code) {
    if (checkinState.active || checkinState.submitting) return;

    let res;
    try {
      res = await API.post('voters.byCode', { code });
    } catch (err) {
      UI.toast('Koneksi bermasalah: ' + err.message, 'error');
      restartScanAfterDelay();
      return;
    }

    if (!res || !res.success) {
      UI.toast((res && res.message) || 'Kode tidak valid', 'error');
      restartScanAfterDelay();
      return;
    }

    const voter = res.data;
    if (isTrue(voter.voted)) {
      UI.toast('Pemilih ini sudah memilih', 'error');
      try { Voice.speak(`Pemilih ${voter.name} sudah memilih.`); } catch (_) {}
      restartScanAfterDelay();
      return;
    }
    if (voter.checkinAt) {
      UI.toast('Pemilih sudah absen sebelumnya', 'warn');
      try { Voice.speak(`Pemilih ${voter.name} sudah absen.`); } catch (_) {}
      restartScanAfterDelay();
      return;
    }

    // Show signature pad
    checkinState.active = true;
    checkinState.voter  = voter;
    showCheckinCard(voter);
  }

  function showCheckinCard(voter) {
    const scanCard = document.getElementById('scanCard');
    const successCard = document.getElementById('successCard');
    const card = document.getElementById('checkinCard');
    if (!card) return;

    if (scanCard)    scanCard.style.display = 'none';
    if (successCard) successCard.style.display = 'none';
    card.style.display = 'block';

    const ciName = document.getElementById('ciName');
    const ciMeta = document.getElementById('ciMeta');
    if (ciName) ciName.textContent = voter.name || 'Pemilih';
    if (ciMeta) ciMeta.textContent =
      `Kode: ${voter.code || '-'} • RT ${voter.rt || '-'} / RW ${voter.rw || '-'}`;

    const padHost = document.getElementById('sigPad');
    if (padHost) {
      padHost.innerHTML = '';
      try {
        checkinState.pad = Sign.mount(padHost);
      } catch (e) {
        console.error('[sign mount]', e);
        UI.toast('Gagal memuat pad tanda tangan', 'error');
        checkinState.pad = null;
      }
    }

    const btnSigClear = document.getElementById('btnSigClear');
    const btnCancel   = document.getElementById('btnCancelCheckin');
    const btnSubmit   = document.getElementById('btnSubmitCheckin');

    if (btnSigClear) btnSigClear.onclick = () => checkinState.pad && checkinState.pad.clear();
    if (btnCancel)   btnCancel.onclick   = resetCheckin;
    if (btnSubmit)   btnSubmit.onclick   = submitCheckin;
  }

  /* ---------- Submit check-in ---------- */
  async function submitCheckin() {
    if (checkinState.submitting) return;
    if (!checkinState.voter || !checkinState.pad) return;

    if (checkinState.pad.isEmpty()) {
      UI.toast('Tanda tangan masih kosong', 'error');
      return;
    }

    checkinState.submitting = true;
    const btn = document.getElementById('btnSubmitCheckin');
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…'; }

    try {
      const payload = {
        code: checkinState.voter.code,
        signature: checkinState.pad.toDataURL(),
        photoUrl: '',
      };

      const r = await API.post('attendance.checkin', payload);

      if (!r || !r.success) {
        UI.toast((r && r.message) || 'Gagal menyimpan', 'error');
        return;
      }

      // Voice announcement
      const boothName = r.voter && r.voter.booth ? r.voter.booth : null;
      const voterName = r.voter && r.voter.name ? r.voter.name : checkinState.voter.name;
      try {
        if (boothName) Voice.speak(`Pemilih ${voterName}, silakan menuju ${boothName}.`);
        else Voice.speak(`Pemilih ${voterName}, silakan duduk di kursi tunggu.`);
      } catch (_) {}

      showSuccessCard(voterName, boothName);
      checkinState.active = false;
    } catch (err) {
      UI.toast('Koneksi bermasalah: ' + err.message, 'error');
    } finally {
      checkinState.submitting = false;
      const btn2 = document.getElementById('btnSubmitCheckin');
      if (btn2) { btn2.disabled = false; btn2.textContent = '✅ Konfirmasi Kehadiran'; }
    }
  }

  let successTimer = null;
  function showSuccessCard(name, boothName) {
    if (successTimer) { clearTimeout(successTimer); successTimer = null; }

    const checkinCard = document.getElementById('checkinCard');
    const scanCard    = document.getElementById('scanCard');
    const card        = document.getElementById('successCard');
    if (!card) return;

    if (checkinCard) checkinCard.style.display = 'none';
    if (scanCard)    scanCard.style.display    = 'none';
    card.style.display = 'block';

    const successName = document.getElementById('successName');
    const successMsg  = document.getElementById('successMsg');
    if (successName) successName.textContent = name || '—';
    if (successMsg) {
      successMsg.textContent = boothName
        ? `Silakan menuju ${boothName}.`
        : `Bilik penuh. Silakan duduk di kursi tunggu.`;
    }

    const btnNext = document.getElementById('btnNextScan');
    if (btnNext) btnNext.onclick = resetCheckin;

    successTimer = setTimeout(resetCheckin, 3000);
  }

  function resetCheckin() {
    if (successTimer) { clearTimeout(successTimer); successTimer = null; }

    checkinState = { active: false, voter: null, pad: null, submitting: false };

    const scanCard = document.getElementById('scanCard');
    const ciCard   = document.getElementById('checkinCard');
    const sucCard  = document.getElementById('successCard');
    if (scanCard) scanCard.style.display = 'block';
    if (ciCard)   ciCard.style.display   = 'none';
    if (sucCard)  sucCard.style.display  = 'none';

    const manual = document.getElementById('manualCode');
    if (manual) manual.value = '';

    const padHost = document.getElementById('sigPad');
    if (padHost) padHost.innerHTML = '';

    startScanner();
  }

  function restartScanAfterDelay() {
    setTimeout(resetCheckin, 1200);
  }

  /* ============================================================
   *  ANTRIAN & BILIK
   * ============================================================ */
  async function queue() {
    clearAllPolls();
    safeQRStop();

    const el = view();
    if (!el) return;
    el.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="row-between">
            <h3>Status Bilik</h3>
            <span class="hint" id="queueTime">—</span>
          </div>
          <div id="boothList" style="margin-top:12px">${UI.skeleton(3)}</div>
        </div>
        <div class="card">
          <div class="row-between">
            <h3>Kursi Tunggu</h3>
            <span class="badge info" id="waitingCount">—</span>
          </div>
          <p class="hint">Pemilih yang menunggu bilik kosong.</p>
          <div id="waitingList" style="margin-top:12px">${UI.skeleton(2)}</div>
        </div>
      </div>

      <div class="card">
        <h3>Kontrol Manual</h3>
        <p class="hint">Gunakan jika auto-assign tidak berjalan mulus.</p>
        <div class="row">
          <button class="btn-ghost" type="button" onclick="ViewsPetugas.refreshQueue()">
            🔄 Refresh
          </button>
          <button class="btn-primary" type="button" onclick="ViewsPetugas.autoAssignAll()">
            ⚡ Auto-Assign Semua
          </button>
        </div>
      </div>
    `;

    await refreshQueue();
    setPoll('boothList', 3000, refreshQueue);
  }

  async function refreshQueue() {
    let bRes, vRes;
    try {
      [bRes, vRes] = await Promise.all([
        API.post('booth.status'),
        API.post('list', { sheet: 'voters' }),
      ]);
    } catch (err) {
      console.warn('[queue] refreshQueue error:', err);
      return;
    }
    if (!bRes || !bRes.success || !vRes || !vRes.success) return;

    boothsCache = bRes.data || [];
    const voters = vRes.data || [];
    waitingCache = voters
      .filter(v => v.checkinAt && !isTrue(v.voted) && !v.boothId)
      .sort((a, b) => new Date(a.checkinAt) - new Date(b.checkinAt));

    renderQueue();
  }

  function renderQueue() {
    const bList = document.getElementById('boothList');
    const wList = document.getElementById('waitingList');
    const timeEl = document.getElementById('queueTime');
    const wCount = document.getElementById('waitingCount');

    if (timeEl) timeEl.textContent = UI.formatTime(new Date());
    if (wCount) wCount.textContent = waitingCache.length + ' orang';

    if (bList) {
      if (!boothsCache.length) {
        bList.innerHTML = `<p class="hint">Belum ada bilik.</p>`;
      } else {
        bList.innerHTML = boothsCache.map(b => {
          const occupied = !!b.currentVoterId;
          const canCall  = !occupied && waitingCache.length > 0;
          return `
            <div class="booth-row ${occupied ? 'occupied' : 'ready'}">
              <strong>${esc(b.name)}</strong>
              <span class="badge ${occupied ? 'occupied' : 'ready'}">
                ${occupied ? 'Terisi' : 'Siap'}
              </span>
              <div class="row" style="margin:0;margin-left:auto;gap:4px">
                ${canCall
                  ? `<button class="btn-primary btn-sm" type="button"
                        onclick="ViewsPetugas.callNext('${esc(b.id)}')">📢 Panggil</button>`
                  : ''}
                ${occupied
                  ? `<button class="btn-ghost btn-sm" type="button"
                        onclick="ViewsPetugas.freeBooth('${esc(b.id)}')">Kosongkan</button>`
                  : ''}
              </div>
            </div>`;
        }).join('');
      }
    }

    if (wList) {
      if (!waitingCache.length) {
        wList.innerHTML = `<p class="hint">Tidak ada pemilih menunggu.</p>`;
      } else {
        wList.innerHTML = waitingCache.map((v, i) => `
          <div class="booth-row">
            <span class="badge info">${i + 1}</span>
            <strong>${esc(v.name)}</strong>
            <span class="hint">${esc(v.code)}</span>
            <span class="hint" style="margin-left:auto">${UI.formatTime(v.checkinAt)}</span>
          </div>`).join('');
      }
    }
  }

  /* ---------- Queue actions ---------- */
  async function callNext(boothId) {
    if (!waitingCache.length) {
      UI.toast('Tidak ada pemilih menunggu', 'warn');
      return;
    }
    const next  = waitingCache[0];
    const booth = boothsCache.find(b => String(b.id) === String(boothId));
    if (!booth) { UI.toast('Bilik tidak ditemukan', 'error'); return; }
    if (booth.currentVoterId) { UI.toast('Bilik sedang terisi', 'warn'); return; }

    let r;
    try {
      r = await API.post('booth.setCurrent', {
        boothId,
        voterId: next.id,
        voterName: next.name,
        name: booth.name,
      });
    } catch (err) {
      UI.toast('Koneksi bermasalah: ' + err.message, 'error');
      return;
    }
    if (!r || !r.success) {
      UI.toast((r && r.message) || 'Gagal', 'error');
      return;
    }

    try { Voice.speak(`Pemilih ${next.name}, silakan menuju ${booth.name}.`); } catch (_) {}
    UI.toast(`${next.name} → ${booth.name}`, 'success');
    await refreshQueue();
  }

  async function freeBooth(boothId) {
    const ok = await UI.confirm('Kosongkan bilik ini?', { danger: true });
    if (!ok) return;

    let r;
    try {
      r = await API.post('booth.setCurrent', { boothId, voterId: '' });
    } catch (err) {
      UI.toast('Koneksi bermasalah: ' + err.message, 'error');
      return;
    }
    if (!r || !r.success) {
      UI.toast((r && r.message) || 'Gagal', 'error');
      return;
    }
    UI.toast('Bilik dikosongkan', 'success');
    await refreshQueue();
  }

  async function autoAssignAll() {
    if (!waitingCache.length) {
      UI.toast('Tidak ada pemilih menunggu', 'warn');
      return;
    }
    const freeBooths = boothsCache.filter(b => !b.currentVoterId);
    if (!freeBooths.length) {
      UI.toast('Tidak ada bilik kosong', 'warn');
      return;
    }

    const n = Math.min(freeBooths.length, waitingCache.length);
    const pairs = [];
    for (let i = 0; i < n; i++) {
      pairs.push({ booth: freeBooths[i], voter: waitingCache[i] });
    }

    let successCount = 0;
    for (const p of pairs) {
      try {
        const r = await API.post('booth.setCurrent', {
          boothId: p.booth.id,
          voterId: p.voter.id,
          voterName: p.voter.name,
          name: p.booth.name,
        });
        if (r && r.success) successCount++;
      } catch (_) {}
    }

    if (successCount > 0) {
      const names = pairs.slice(0, successCount).map(p => p.voter.name).join(', ');
      try { Voice.speak(`Pemilih ${names}, silakan menuju bilik yang tersedia.`); } catch (_) {}
      UI.toast(`${successCount} pemilih diarahkan ke bilik`, 'success');
    } else {
      UI.toast('Gagal mengarahkan pemilih', 'error');
    }
    await refreshQueue();
  }

  /* ============================================================
   *  EXPORTS
   * ============================================================ */
  return {
    dashboard,
    attendance,
    queue,
    refreshQueue,
    callNext,
    freeBooth,
    autoAssignAll,
    _clearAllPolls: clearAllPolls,
  };
})();