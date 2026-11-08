/* ============================================================
   E-VOTE • views-coklit.js (FULL FIX - FINAL)
   Role: COKLIT — Pencocokan & Penelitian Data Pemilih.
   Fitur: Normalisasi RT, filter otomatis, batch validation.
   ============================================================ */
window.ViewsCoklit = (function () {
  'use strict';

  /* ---------- Shorthand ---------- */
  const view    = () => document.getElementById('view');
  const esc     = (s) => UI.escapeHtml(s);
  const isTrue  = (v) => v === true || String(v) === 'TRUE' || String(v) === 'true';

  /* ============================================================
   *  HELPER: NORMALISASI RT (Sangat Penting!)
   *  Mengubah "3", "3.0", "03" menjadi "03"
   *  Mencegah error saat Sheets menyimpan angka sebagai 3
   *  ============================================================ */
  function normalizeRt(rt) {
    let val = String(rt || '').trim();
    if (!val) return '';
    // Tangani format desimal dari Google Sheets (misal: "3.0")
    if (val.endsWith('.0')) val = val.slice(0, -2);
    // Tambahkan nol di depan jika 1 digit (misal: "3" jadi "03")
    if (val.length === 1) val = '0' + val;
    return val;
  }

  /* ---------- Helper: ambil info user aktif ---------- */
  function me() {
    if (window.Auth && Auth.user) return Auth.user() || {};
    if (window.API && API.user) return API.user() || {};
    return {};
  }

  /* ---------- Helper: cek apakah user adalah coklit dengan RT ---------- */
  function myRt() {
    const u = me();
    if (String(u.role || '').toLowerCase() !== 'coklit') return '';
    return normalizeRt(u.rt); // ✅ Gunakan normalisasi
  }

  /* ---------- Safe fetch (pakai Cache jika ada) ---------- */
  async function fetchData(action, params, force) {
    if (window.Cache) return Cache.fetchApi(action, params, force);
    return API.post(action, params);
  }

  /* ---------- Polling helper ---------- */
  const polls = {};
  function setPoll(id, ms, fn) {
    clearPoll(id);
    let busy = false;
    polls[id] = setInterval(async () => {
      if (!document.getElementById(id)) { clearPoll(id); return; }
      if (busy) return;
      busy = true;
      try { await fn(); } catch (e) { console.error('[coklit poll]', e); }
      finally { busy = false; }
    }, ms);
  }
  function clearPoll(id) {
    if (polls[id]) { clearInterval(polls[id]); delete polls[id]; }
  }
  function clearAllPolls() { Object.keys(polls).forEach(clearPoll); }

  /* ---------- Local state ---------- */
  const state = {
    rtFilter: '',
    coklitFilter: 'all',
    search: '',
    selected: {},   // {voterId: true} — batch mode
  };

  /* ============================================================
   *  1. DASHBOARD COKLIT
   * ============================================================ */
  async function dashboard() {
    clearAllPolls();
    state.selected = {};

    const el = view(); if (!el) return;
    el.innerHTML = `<div id="coklitDash">${UI.skeleton(4)}</div>`;
    await loadDash();
    setPoll('coklitDash', 8000, loadDash);
  }

  async function loadDash() {
    const area = document.getElementById('coklitDash'); if (!area) return;

    let res;
    try { res = await fetchData('list', { sheet: 'voters' }); }
    catch (_) { return; }
    if (!res || !res.success) return;

    /* ✅ FILTER: coklit hanya lihat RT-nya sendiri (Gunakan normalizeRt) */
    const myRtValue = myRt();
    let voters = res.data || [];
    if (myRtValue) {
      voters = voters.filter(v => normalizeRt(v.rt) === myRtValue);
    }

    const total   = voters.length;
    const valid   = voters.filter(v => v.coklitStatus === 'valid').length;
    const invalid = voters.filter(v => v.coklitStatus === 'invalid').length;
    const pending = total - valid - invalid;

    const pctValid   = total ? Math.round(valid / total * 100)   : 0;
    const pctInvalid = total ? Math.round(invalid / total * 100) : 0;
    const pctPending = total ? Math.round(pending / total * 100) : 0;
    const pctDone    = pctValid + pctInvalid;

    const u = me();
    const rtLabel = myRtValue
      ? `<span class="badge info" style="font-size:0.75rem;">RT ${esc(myRtValue)}</span>`
      : '';

    area.innerHTML = `
      <div class="row-between" style="margin-bottom:12px;">
        <h2 style="margin:0;font-size:1.2rem;display:flex;align-items:center;gap:8px;">
          Dashboard Coklit ${rtLabel}
        </h2>
        <span class="hint">Auto-refresh 8 detik</span>
      </div>

      ${myRtValue ? `
        <div class="card" style="background:linear-gradient(135deg, #eff6ff 0%, #fff 100%); border-color:#bfdbfe;">
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <div style="font-size:1.5rem;">👤</div>
            <div style="flex:1; min-width:200px;">
              <strong>${esc(u.name || u.username || 'Petugas Coklit')}</strong>
              <p class="hint" style="margin:2px 0 0;">Anda bertanggung jawab untuk <strong>RT ${esc(myRtValue)}</strong></p>
            </div>
          </div>
        </div>
      ` : ''}

      <div class="grid-3">
        <div class="stat">
          <small>Total Pemilih${myRtValue ? ' RT ' + esc(myRtValue) : ''}</small>
          <h3>${total}</h3>
        </div>
        <div class="stat">
          <small style="color:var(--ok-text)">Valid (Sesuai)</small>
          <h3 style="color:var(--ok)">${valid}</h3>
          <small class="hint" style="margin-top:4px">${pctValid}%</small>
        </div>
        <div class="stat">
          <small style="color:var(--err-text)">Perlu Perbaikan</small>
          <h3 style="color:var(--err)">${invalid}</h3>
          <small class="hint" style="margin-top:4px">${pctInvalid}%</small>
        </div>
        <div class="stat">
          <small style="color:var(--warn-text)">Belum Dicoklit</small>
          <h3 style="color:var(--warn)">${pending}</h3>
          <small class="hint" style="margin-top:4px">${pctPending}%</small>
        </div>
      </div>

      <div class="card">
        <div class="row-between">
          <h3>Progress Coklit${myRtValue ? ' RT ' + esc(myRtValue) : ''}</h3>
          <span class="badge ${pctDone === 100 ? 'ok' : 'info'}">
            ${pctDone}% Selesai
          </span>
        </div>
        <div style="margin-top:12px; height:18px; background:#f1f5f9; border-radius:999px; overflow:hidden; display:flex;">
          <div style="width:${pctValid}%; background:var(--ok); transition:width .5s ease" title="Valid"></div>
          <div style="width:${pctInvalid}%; background:var(--err); transition:width .5s ease" title="Perbaikan"></div>
        </div>
        <div class="row" style="margin-top:8px; gap:16px; font-size:0.82rem; color:var(--muted)">
          <span><span style="display:inline-block;width:10px;height:10px;background:var(--ok);border-radius:2px;margin-right:4px"></span>Valid (${valid})</span>
          <span><span style="display:inline-block;width:10px;height:10px;background:var(--err);border-radius:2px;margin-right:4px"></span>Perbaikan (${invalid})</span>
          <span><span style="display:inline-block;width:10px;height:10px;background:#f1f5f9;border:1px solid var(--border);border-radius:2px;margin-right:4px"></span>Belum (${pending})</span>
        </div>
      </div>

      <div class="card">
        <h3>Aksi Cepat</h3>
        <p class="hint">Validasi data pemilih sebelum hari-H.</p>
        <div class="row">
          <a href="#/coklit/voters" class="btn-primary">📋 Mulai Coklit Data</a>
          ${pending > 0
            ? `<a href="#/coklit/voters" class="btn-ghost" onclick="ViewsCoklit._jumpToPending()">⏳ Lihat ${pending} Belum Dicoklit</a>`
            : ''}
        </div>
      </div>
    `;
  }

  function jumpToPending() {
    state.coklitFilter = 'pending';
    state.search = '';
    location.hash = '#/coklit/voters';
  }

  /* ============================================================
   *  2. DAFTAR PEMILIH (Coklit)
   * ============================================================ */
  async function voters() {
    clearAllPolls();
    state.selected = {};

    const el = view(); if (!el) return;
    const myRtValue = myRt();
    const isRtLocked = !!myRtValue;
    const u = me();

    el.innerHTML = `
      <div class="card">
        <div class="row-between" style="margin-bottom:12px;">
          <div>
            <h3 style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              Daftar Pemilih (Coklit)
              ${isRtLocked ? `<span class="badge info">RT ${esc(myRtValue)}</span>` : ''}
            </h3>
            <p class="hint" style="margin:0;">
              ${isRtLocked
                ? `Anda bertanggung jawab untuk <strong>RT ${esc(myRtValue)}</strong>. Validasi sesuai KTP/KK.`
                : 'Validasi data sesuai KTP/KK.'}
            </p>
          </div>
          <select class="input" id="coklitFilter" style="width:auto">
            <option value="all">Semua</option>
            <option value="pending">Belum Dicoklit</option>
            <option value="valid">Valid</option>
            <option value="invalid">Perbaikan</option>
          </select>
        </div>

        <div class="row" style="margin-top:0; align-items:center;">
          <input class="input" id="voterSearch" placeholder="Cari nama / kode..."
                 style="flex:2; min-width:200px;" autocomplete="off">
          ${isRtLocked
            ? `<input class="input" value="RT ${esc(myRtValue)}" disabled
                     style="flex:1; min-width:140px; background:#f1f5f9; cursor:not-allowed;"
                     title="Anda hanya bisa melihat RT ${esc(myRtValue)}">`
            : `<select class="input" id="rtFilter" style="flex:1; min-width:140px;">
                 <option value="">Semua RT</option>
               </select>`}
        </div>

        <div class="row-between" style="margin-top:12px;">
          <div id="batchInfo" class="hint"></div>
          <div class="row" style="margin:0; gap:8px;">
            <button class="btn-ghost btn-sm" id="btnBatchValid" type="button" disabled>✅ Valid Terpilih</button>
            <button class="btn-ghost btn-sm" id="btnBatchInvalid" type="button" disabled>❌ Perbaikan Terpilih</button>
          </div>
        </div>

        <div id="voterList" style="margin-top:12px">${UI.skeleton(4)}</div>
        <div class="row-between" style="margin-top:12px;">
          <span class="hint" id="voterSyncInfo">—</span>
          <button class="btn-ghost btn-sm" id="btnManualRefresh" type="button">🔄 Refresh Manual</button>
        </div>
      </div>
    `;

    /* Restore filter */
    const filter = document.getElementById('coklitFilter');
    if (filter && state.coklitFilter) filter.value = state.coklitFilter;
    const searchInput = document.getElementById('voterSearch');
    if (searchInput && state.search) searchInput.value = state.search;

    /* Bind listeners */
    if (searchInput) {
      searchInput.addEventListener('input', UI.debounce(() => {
        state.search = searchInput.value;
        loadVoters();
      }, 300));
    }

    if (filter) {
      filter.addEventListener('change', () => {
        state.coklitFilter = filter.value;
        loadVoters();
      });
    }

    const rtFilter = document.getElementById('rtFilter');
    if (rtFilter) {
      rtFilter.addEventListener('change', () => {
        state.rtFilter = rtFilter.value;
        loadVoters();
      });
    }

    /* Batch buttons */
    const btnValid = document.getElementById('btnBatchValid');
    const btnInvalid = document.getElementById('btnBatchInvalid');
    if (btnValid)   btnValid.onclick   = () => batchUpdate('valid');
    if (btnInvalid) btnInvalid.onclick = () => batchUpdate('invalid');

    /* Manual refresh */
    const btnManual = document.getElementById('btnManualRefresh');
    if (btnManual) {
      btnManual.onclick = () => {
        if (window.Cache) Cache.clearAll();
        UI.toast('Memuat data terbaru…', 'info', 1200);
        loadVoters(true);
      };
    }

    await loadVoters();

    /* ✅ Auto-refresh 20 detik (agar admin update terlihat) */
    setPoll('voterList', 20000, () => loadVoters(true));
  }

  async function loadVoters(forceRefresh) {
    const area = document.getElementById('voterList'); if (!area) return;
    const syncInfo = document.getElementById('voterSyncInfo');

    let res;
    try { res = await fetchData('list', { sheet: 'voters' }, forceRefresh === true); }
    catch (_) {
      area.innerHTML = `<p class="hint" style="color:var(--err)">Gagal memuat data.</p>`;
      return;
    }
    if (!res || !res.success) {
      area.innerHTML = `<p class="hint" style="color:var(--err)">Gagal memuat data.</p>`;
      return;
    }

    let list = res.data || [];

    /* ✅ FILTER: coklit hanya lihat RT-nya sendiri (Gunakan normalizeRt) */
    const myRtValue = myRt();
    if (myRtValue) {
      list = list.filter(v => normalizeRt(v.rt) === myRtValue);
    }

    /* Populate RT dropdown (untuk admin/petugas yg akses view ini) */
    const rtFilter = document.getElementById('rtFilter');
    if (rtFilter && rtFilter.options.length <= 1 && !myRtValue) {
      const rts = [...new Set(list.map(v => normalizeRt(v.rt)))]
        .filter(rt => rt !== '')
        .sort();
      rts.forEach(rt => {
        const opt = document.createElement('option');
        opt.value = rt;
        opt.textContent = `RT ${rt}`;
        rtFilter.appendChild(opt);
      });
      if (state.rtFilter) rtFilter.value = state.rtFilter;
    }

    /* Apply search filter */
    const keyword = (state.search || '').trim().toLowerCase();
    if (keyword) {
      list = list.filter(v =>
        String(v.name || '').toLowerCase().includes(keyword) ||
        String(v.code || '').toLowerCase().includes(keyword) ||
        String(v.rt   || '').toLowerCase().includes(keyword)
      );
    }

    /* Apply RT filter (jika tidak locked) */
    if (rtFilter && rtFilter.value) {
      list = list.filter(v => normalizeRt(v.rt) === rtFilter.value);
    }

    /* Apply coklit status filter */
    const filter = document.getElementById('coklitFilter');
    const filterVal = filter ? filter.value : 'all';
    if (filterVal !== 'all') {
      if (filterVal === 'pending') {
        list = list.filter(v => !v.coklitStatus || v.coklitStatus === 'pending');
      } else {
        list = list.filter(v => v.coklitStatus === filterVal);
      }
    }

    /* Empty state */
    if (!list.length) {
      area.innerHTML = `
        <div class="card text-center" style="padding:40px;background:#fafbfc;">
          <div style="font-size:2rem">🔍</div>
          <h3 style="margin-top:8px">Tidak Ada Data</h3>
          <p class="hint">Coba ubah filter atau kata kunci pencarian.</p>
        </div>`;
      updateBatchUI(0);
      if (syncInfo) syncInfo.textContent = `Update: ${UI.formatTime(new Date())} • 0 data`;
      return;
    }

    /* Render table */
    area.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:32px;">
                <input type="checkbox" id="selectAll" title="Pilih semua di halaman ini">
              </th>
              <th>Kode</th>
              <th>Nama</th>
              <th>RT/RW</th>
              <th>Kontak</th>
              <th>Status Coklit</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(v => {
              const st = v.coklitStatus || 'pending';
              let badge = 'info', label = 'Belum';
              if (st === 'valid')   { badge = 'ok';     label = 'Sesuai'; }
              if (st === 'invalid') { badge = 'danger'; label = 'Perbaikan'; }

              const isSelected = !!state.selected[v.id];

              return `
                <tr data-voter-id="${esc(v.id)}">
                  <td>
                    <input type="checkbox" class="row-select"
                           data-id="${esc(v.id)}"
                           ${isSelected ? 'checked' : ''}>
                  </td>
                  <td><code>${esc(v.code || '-')}</code></td>
                  <td>
                    <strong>${esc(v.name)}</strong>
                    ${v.address ? `<div class="hint" style="margin:0;font-size:0.75rem">${esc(v.address)}</div>` : ''}
                  </td>
                  <td>${esc(v.rt || '-')}/${esc(v.rw || '-')}</td>
                  <td>
                    <small style="color:var(--muted)">
                      ${v.phone ? esc(v.phone) : '-'}
                    </small>
                  </td>
                  <td><span class="badge ${badge}">${label}</span></td>
                  <td style="white-space:nowrap;">
                    <button class="btn-ghost btn-sm" type="button"
                            onclick="ViewsCoklit.markValid('${esc(v.id)}')"
                            ${st === 'valid' ? 'disabled' : ''}
                            title="Tandai Sesuai">✅</button>
                    <button class="btn-danger btn-sm" type="button"
                            onclick="ViewsCoklit.markInvalid('${esc(v.id)}')"
                            ${st === 'invalid' ? 'disabled' : ''}
                            title="Tandai Perbaikan">❌</button>
                    ${st !== 'pending'
                      ? `<button class="btn-ghost btn-sm" type="button"
                          onclick="ViewsCoklit.markPending('${esc(v.id)}')"
                          title="Reset ke Belum">↩️</button>`
                      : ''}
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    /* Bind row checkbox */
    area.querySelectorAll('.row-select').forEach(cb => {
      cb.addEventListener('change', function () {
        const id = this.getAttribute('data-id');
        if (this.checked) state.selected[id] = true;
        else delete state.selected[id];
        updateBatchUI(list.length);
      });
    });

    /* Bind "select all" */
    const selectAll = document.getElementById('selectAll');
    if (selectAll) {
      selectAll.checked = list.length > 0 && list.every(v => state.selected[v.id]);
      selectAll.addEventListener('change', function () {
        const checked = this.checked;
        list.forEach(v => {
          if (checked) state.selected[v.id] = true;
          else delete state.selected[v.id];
        });
        area.querySelectorAll('.row-select').forEach(cb => { cb.checked = checked; });
        updateBatchUI(list.length);
      });
    }

    /* Hitung statistik untuk info sync */
    const totalValid   = list.filter(v => v.coklitStatus === 'valid').length;
    const totalInvalid = list.filter(v => v.coklitStatus === 'invalid').length;
    const totalPending = list.length - totalValid - totalInvalid;

    if (syncInfo) {
      syncInfo.innerHTML = `
        Update: ${UI.formatTime(new Date())} • 
        <span style="color:var(--ok)">${totalValid} valid</span> • 
        <span style="color:var(--err)">${totalInvalid} perbaikan</span> • 
        <span style="color:var(--warn)">${totalPending} pending</span>
      `;
    }

    updateBatchUI(list.length);
  }

  function updateBatchUI(visibleCount) {
    const selectedCount = Object.keys(state.selected).length;
    const info = document.getElementById('batchInfo');
    const btnValid = document.getElementById('btnBatchValid');
    const btnInvalid = document.getElementById('btnBatchInvalid');

    if (info) {
      info.textContent = selectedCount > 0
        ? `${selectedCount} pemilih dipilih${visibleCount ? ` (dari ${visibleCount} tampil)` : ''}`
        : '';
    }
    if (btnValid)   btnValid.disabled   = selectedCount === 0;
    if (btnInvalid) btnInvalid.disabled = selectedCount === 0;
  }

  /* ============================================================
   *  3. AKSI MARK (valid / invalid / pending)
   * ============================================================ */
  async function markValid(id)   { await updateStatus(id, 'valid'); }
  async function markInvalid(id) { await updateStatus(id, 'invalid'); }
  async function markPending(id) { await updateStatus(id, 'pending'); }

  async function updateStatus(id, status) {
    const labels = { valid: 'SESUAI', invalid: 'PERLU PERBAIKAN', pending: 'BELUM DICOKLIT' };
    const ok = await UI.confirm(
      `Tandai data ini sebagai <strong>${labels[status]}</strong>?`,
      { okLabel: 'Ya, Tandai' }
    );
    if (!ok) return;

    try {
      UI.loading(document.getElementById('view'), true);
      const r = await API.post('voters.coklit', { voterId: id, status });
      if (!r || !r.success) {
        UI.toast((r && r.message) || 'Gagal memperbarui', 'error');
        return;
      }
      UI.toast('Status diperbarui — Admin akan melihat perubahan ini', 'success');
      if (window.Cache) Cache.clearAll();
      await loadVoters(true);
    } catch (err) {
      UI.toast(err.message || 'Error', 'error');
    } finally {
      UI.loading(document.getElementById('view'), false);
    }
  }

  /* ============================================================
   *  4. BATCH UPDATE
   * ============================================================ */
  async function batchUpdate(status) {
    const ids = Object.keys(state.selected);
    if (!ids.length) { UI.toast('Pilih minimal satu pemilih', 'warn'); return; }

    const labels = { valid: 'SESUAI', invalid: 'PERLU PERBAIKAN' };
    const ok = await UI.confirm(
      `Tandai <strong>${ids.length} pemilih</strong> sebagai <strong>${labels[status]}</strong>?`,
      { okLabel: 'Ya, Tandai Semua' }
    );
    if (!ok) return;

    const btnValid   = document.getElementById('btnBatchValid');
    const btnInvalid = document.getElementById('btnBatchInvalid');
    if (btnValid)   btnValid.disabled   = true;
    if (btnInvalid) btnInvalid.disabled = true;

    let success = 0, failed = 0;
    const errors = [];

    try {
      for (const id of ids) {
        try {
          const r = await API.post('voters.coklit', { voterId: id, status });
          if (r && r.success) success++;
          else { failed++; errors.push((r && r.message) || 'unknown'); }
        } catch (err) { failed++; errors.push(err.message || 'network'); }
      }

      if (success > 0) {
        const msg = `${success} pemilih ditandai — Admin akan melihat perubahan ini` +
                    (failed ? ` (${failed} gagal)` : '');
        UI.toast(msg, success === ids.length ? 'success' : 'warn', 4000);
      } else {
        UI.toast('Semua gagal. ' + (errors[0] || ''), 'error');
      }

      state.selected = {};
      if (window.Cache) Cache.clearAll();
      await loadVoters(true);
    } finally {
      updateBatchUI(0);
    }
  }

  /* ============================================================
   *  EXPORTS (Router-friendly)
   * ============================================================ */
  return {
    dashboard,
    voters,
    markValid,
    markInvalid,
    markPending,
    _jumpToPending: jumpToPending,
    _clearAllPolls: function () {
      clearAllPolls();
      state.selected = {};
    },
  };
})();