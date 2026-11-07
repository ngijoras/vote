/* ============================================================
   E-VOTE • views-petugas.js (FULL FIX - AUTO VOICE)
   Role: PETUGAS (asisten panitia)
   ============================================================ */
window.ViewsPetugas = (function () {
  'use strict';

  const view = () => document.getElementById('view');
  const me   = () => API.user() || {};
  const isTrue = (v) => v === true || String(v) === 'TRUE' || String(v) === 'true';
  const esc = (s) => UI.escapeHtml(s);

  /* ---------- Polling ---------- */
  const polls = {};
  function setPoll(id, ms, fn) {
    clearPoll(id);
    let busy = false;
    polls[id] = setInterval(async () => {
      if (!document.getElementById(id)) { clearPoll(id); return; }
      if (busy) return;
      busy = true;
      try { await fn(); } catch (e) { console.error(e); } finally { busy = false; }
    }, ms);
  }
  function clearPoll(id) { if (polls[id]) { clearInterval(polls[id]); delete polls[id]; } }
  function clearAllPolls() { Object.keys(polls).forEach(clearPoll); }

  /* ---------- Local state ---------- */
  let checkinState = { active: false, voter: null, pad: null };
  let waitingCache = [];
  let boothsCache  = [];

  function safeQRStop() { try { if (window.QR && QR.stop) QR.stop(); } catch (_) {} }

  /* ============================================================
   *  DASHBOARD PETUGAS
   * ============================================================ */
  async function dashboard() {
    clearAllPolls();
    safeQRStop();
    const el = view();
    el.innerHTML = `<div id="petugasDash">${UI.skeleton(4)}</div>`;
    await loadDash();
  }

  async function loadDash() {
    const area = document.getElementById('petugasDash');
    if (!area) return;

    const [sumRes, votersRes, boothsRes] = await Promise.all([
      API.post('dash.summary'),
      API.post('list', { sheet: 'voters' }),
      API.post('booth.status'),
    ]);

    if (!sumRes.success) {
      area.innerHTML = `<div class="card"><p class="hint" style="color:var(--err)">${esc(sumRes.message || 'Gagal memuat data')}</p></div>`;
      return;
    }

    const d = sumRes.data || {};
    const voters = votersRes.data || [];
    const booths = boothsRes.data || [];

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
        <div class="row">
          <a href="#/petugas/attendance" class="btn-primary">📷 Absensi Pemilih</a>
          <a href="#/petugas/queue" class="btn-ghost">🚪 Antrian & Bilik</a>
          <a href="#/petugas/results" class="btn-ghost">📈 Hasil Real-Time</a>
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
    checkinState = { active: false, voter: null, pad: null };

    const el = view();
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
            <input class="input" id="manualCode" placeholder="Masukkan kode pemilih…" style="flex:1" autocomplete="off">
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
        <div id="sigPad"></div>
        <div class="row" style="margin-top:12px">
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

    document.getElementById('btnManual').onclick = onManualSearch;
    document.getElementById('manualCode').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onManualSearch(); }
    });
    document.getElementById('btnRestartScan').onclick = restartScanner;

    startScanner();
  }

  async function startScanner() {
    const readerEl = document.getElementById('qrReader');
    if (!readerEl) return;
    readerEl.innerHTML = '';
    try {
      await QR.scanOnce('qrReader', onCodeScanned, () => {});
    } catch (e) { console.error('[scan]', e); }
  }

  async function restartScanner() {
    safeQRStop();
    await new Promise(r => setTimeout(r, 150));
    startScanner();
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

  async function handleCode(code) {
    if (checkinState.active) return;

    const res = await API.post('voters.byCode', { code });
    if (!res.success) {
      UI.toast(res.message || 'Kode tidak valid', 'error');
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

    checkinState.active = true;
    checkinState.voter  = voter;
    showCheckinCard(voter);
  }

  function showCheckinCard(voter) {
    document.getElementById('scanCard').style.display    = 'none';
    document.getElementById('successCard').style.display = 'none';
    const card = document.getElementById('checkinCard');
    card.style.display = 'block';

    document.getElementById('ciName').textContent = voter.name || 'Pemilih';
    document.getElementById('ciMeta').textContent =
      `Kode: ${voter.code || '-'} • RT ${voter.rt || '-'} / RW ${voter.rw || '-'}`;

    const padHost = document.getElementById('sigPad');
    padHost.innerHTML = '';
    try {
      checkinState.pad = Sign.mount(padHost);
    } catch (e) {
      UI.toast('Gagal memuat pad tanda tangan', 'error');
      checkinState.pad = null;
    }

    document.getElementById('btnCancelCheckin').onclick = resetCheckin;
    document.getElementById('btnSubmitCheckin').onclick = submitCheckin;
  }

  async function submitCheckin() {
    if (!checkinState.voter || !checkinState.pad) return;
    if (checkinState.pad.isEmpty()) {
      UI.toast('Tanda tangan masih kosong', 'error');
      return;
    }

    const btn = document.getElementById('btnSubmitCheckin');
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…'; }

    const payload = {
      code: checkinState.voter.code,
      signature: checkinState.pad.toDataURL(),
      photoUrl: '',
    };

    const r = await API.post('attendance.checkin', payload);
    if (btn) { btn.disabled = false; btn.textContent = '✅ Konfirmasi Kehadiran'; }

    if (!r.success) {
      UI.toast(r.message || 'Gagal menyimpan', 'error');
      return;
    }

    // --- PIC U SUARA ---
    const boothName = r.voter.booth || null;
    const voterName = r.voter.name;
    
    // Beri jeda 1 detik agar UI selesai render sebelum bicara
    setTimeout(() => {
      try {
        if (boothName) {
          Voice.speak(`Pemilih ${voterName}, silakan menuju ${boothName}.`);
        } else {
          Voice.speak(`Pemilih ${voterName}, bilik penuh. Silakan duduk di kursi tunggu.`);
        }
      } catch (_) {}
    }, 1000);

    showSuccessCard(voterName, boothName);
    checkinState.active = false;
  }

  function showSuccessCard(name, boothName) {
    document.getElementById('checkinCard').style.display = 'none';
    document.getElementById('scanCard').style.display    = 'none';
    const card = document.getElementById('successCard');
    card.style.display = 'block';
    document.getElementById('successName').textContent = name;
    document.getElementById('successMsg').textContent =
      boothName
        ? `Silakan menuju ${boothName}.`
        : `Bilik penuh. Silakan duduk di kursi tunggu.`;

    const btnNext = document.getElementById('btnNextScan');
    btnNext.onclick = resetCheckin;

    clearTimeout(showSuccessCard._t);
    showSuccessCard._t = setTimeout(resetCheckin, 3000);
  }

  function resetCheckin() {
    clearTimeout(showSuccessCard._t);
    checkinState = { active: false, voter: null, pad: null };

    const scanCard = document.getElementById('scanCard');
    const ciCard   = document.getElementById('checkinCard');
    const sucCard  = document.getElementById('successCard');
    if (scanCard) scanCard.style.display = 'block';
    if (ciCard)   ciCard.style.display   = 'none';
    if (sucCard)  sucCard.style.display  = 'none';

    const manual = document.getElementById('manualCode');
    if (manual) manual.value = '';

    startScanner();
  }

  function restartScanAfterDelay() {
    setTimeout(resetCheckin, 1200);
  }

  /* ============================================================
   *  ANTRIAN & BILIK
   * ============================================================ */
  async function queue() {
    clearAllPolls(); safeQRStop();

    const el = view();
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
          <div id="waitingList" style="margin-top:12px">${UI.skeleton(2)}</div>
        </div>
      </div>

      <div class="card">
        <h3>Kontrol Manual</h3>
        <div class="row">
          <button class="btn-ghost" type="button" onclick="ViewsPetugas.refreshQueue()">🔄 Refresh</button>
          <button class="btn-primary" type="button" onclick="ViewsPetugas.autoAssignAll()">⚡ Auto-Assign Semua</button>
        </div>
      </div>
    `;

    await refreshQueue();
    setPoll('boothList', 3000, refreshQueue);
  }

  async function refreshQueue() {
    const [bRes, vRes] = await Promise.all([
      API.post('booth.status'),
      API.post('list', { sheet: 'voters' }),
    ]);
    if (!bRes.success || !vRes.success) return;

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
    if (wCount)  wCount.textContent = waitingCache.length + ' orang';

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

  async function callNext(boothId) {
    if (!waitingCache.length) {
      UI.toast('Tidak ada pemilih menunggu', 'warn');
      return;
    }
    const next  = waitingCache[0];
    const booth = boothsCache.find(b => String(b.id) === String(boothId));
    if (!booth) { UI.toast('Bilik tidak ditemukan', 'error'); return; }
    if (booth.currentVoterId) { UI.toast('Bilik sedang terisi', 'warn'); return; }

    const r = await API.post('booth.setCurrent', {
      boothId,
      voterId: next.id,
      voterName: next.name,
      name: booth.name,
    });
    if (!r.success) { UI.toast(r.message || 'Gagal', 'error'); return; }

    try { Voice.speak(`Pemilih ${next.name}, silakan menuju ${booth.name}.`); } catch (_) {}
    UI.toast(`${next.name} → ${booth.name}`, 'success');
    await refreshQueue();
  }

  async function freeBooth(boothId) {
    const ok = await UI.confirm('Kosongkan bilik ini?', { danger: true });
    if (!ok) return;
    const r = await API.post('booth.setCurrent', { boothId, voterId: '' });
    if (!r.success) { UI.toast(r.message || 'Gagal', 'error'); return; }
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

    for (const p of pairs) {
      await API.post('booth.setCurrent', {
        boothId: p.booth.id,
        voterId: p.voter.id,
        voterName: p.voter.name,
        name: p.booth.name,
      });
    }

    const names = pairs.map(p => p.voter.name).join(', ');
    try { Voice.speak(`Pemilih ${names}, silakan menuju bilik yang tersedia.`); } catch (_) {}
    UI.toast(`${n} pemilih diarahkan ke bilik`, 'success');
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