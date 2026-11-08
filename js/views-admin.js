/* ============================================================
   E-VOTE • views-admin.js (FULL FIX - FINAL)
   Role: ADMIN — Dashboard, Coklit, Kunci Bilik, Flyer Premium.
   ============================================================ */
window.ViewsAdmin = (function () {
  'use strict';

  /* ---------- Shorthand ---------- */
  const view   = () => document.getElementById('view');
  const me     = () => API.user() || {};
  const isTrue = (v) => v === true || String(v) === 'TRUE' || String(v) === 'true';
  const esc    = (s) => UI.escapeHtml(s);

  /* ---------- Safe fetch (Gunakan Cache untuk Preload) ---------- */
  async function fetchData(action, params, force) {
    if (window.Cache) return Cache.fetchApi(action, params, force);
    return API.post(action, params);
  }

  /* ---------- Polling helper (Background Sync) ---------- */
  const polls = {};
  function setPoll(id, ms, fn) {
    clearPoll(id);
    let busy = false;
    polls[id] = setInterval(async () => {
      if (!document.getElementById(id)) { clearPoll(id); return; }
      if (busy) return;
      busy = true;
      try { await fn(); } catch (e) { console.error('[admin poll]', e); }
      finally { busy = false; }
    }, ms);
  }
  function clearPoll(id) {
    if (polls[id]) { clearInterval(polls[id]); delete polls[id]; }
  }
  function clearAllPolls() { Object.keys(polls).forEach(clearPoll); }

  /* ---------- Signature pad & QR cleanup ---------- */
  let sigPad = null;
  function cleanupSignPad() {
    try { if (sigPad && sigPad.destroy) sigPad.destroy(); } catch (_) {}
    sigPad = null;
  }
  function safeQRStop() {
    try { if (window.QR && QR.stop) QR.stop(); } catch (_) {}
  }

  /* ---------- Persistent state ---------- */
  const state = {
    voterRtFilter: '',
    voterCoklitFilter: '',
  };

  /* ============================================================
   *  1. DASHBOARD ADMIN
   * ============================================================ */
  async function dashboard() {
    clearAllPolls(); cleanupSignPad(); safeQRStop();
    const el = view(); if (!el) return;
    el.innerHTML = `<div id="adminDash">${UI.skeleton(4)}</div>`;
    await loadDashboard();
    setPoll('adminDash', 8000, loadDashboard); // Realtime 8s
  }

  async function loadDashboard() {
    const area = document.getElementById('adminDash'); if (!area) return;

    let sumRes, votersRes, coklitRes;
    try {
      [sumRes, votersRes, coklitRes] = await Promise.all([
        fetchData('dash.summary', {}, true),
        fetchData('list', { sheet: 'voters' }),
        fetchData('coklit.report', {}, true),
      ]);
    } catch (err) { return; }

    if (!sumRes || !sumRes.success) return;

    const d = sumRes.data || {};
    const voters = (votersRes && votersRes.data) || [];
    const recent = voters
      .filter(v => isTrue(v.voted))
      .sort((a, b) => String(b.checkinAt || '').localeCompare(String(a.checkinAt || '')))
      .slice(0, 5);

    const coklit = d.coklit || {};
    const totalCoklit = (coklit.valid || 0) + (coklit.invalid || 0) + (coklit.pending || 0);
    const pctDone = totalCoklit
      ? Math.round(((coklit.valid || 0) + (coklit.invalid || 0)) / totalCoklit * 100)
      : 0;

    /* Coklit per RT */
    const coklitReport = (coklitRes && coklitRes.success) ? coklitRes.data : null;
    const perRt = coklitReport ? (coklitReport.perRt || {}) : {};
    const rtKeys = Object.keys(perRt).sort();

    area.innerHTML = `
      <div class="grid-3">
        <div class="stat"><small>Total Pemilih</small><h3>${d.totalVoters || 0}</h3></div>
        <div class="stat"><small>Sudah Memilih</small><h3>${d.voted || 0}</h3></div>
        <div class="stat"><small>Partisipasi</small><h3>${UI.formatPercent(d.voted || 0, d.totalVoters || 1)}</h3></div>
      </div>

      <div class="card">
        <div class="row-between">
          <h3>Progress Coklit Total</h3>
          <span class="badge ${pctDone === 100 ? 'ok' : 'info'}">${pctDone}% selesai</span>
        </div>
        <div class="grid-3" style="margin-top:12px">
          <div class="stat"><small style="color:var(--ok-text)">Valid</small><h3 style="color:var(--ok)">${coklit.valid || 0}</h3></div>
          <div class="stat"><small style="color:var(--err-text)">Perbaikan</small><h3 style="color:var(--err)">${coklit.invalid || 0}</h3></div>
          <div class="stat"><small style="color:var(--warn-text)">Belum</small><h3 style="color:var(--warn)">${coklit.pending || 0}</h3></div>
        </div>
      </div>

      ${rtKeys.length > 0 ? `
        <div class="card">
          <div class="row-between">
            <h3>Status Coklit per RT</h3>
            <a href="#/admin/voters" class="btn-ghost btn-sm">Lihat Detail →</a>
          </div>
          <div style="margin-top:12px; display:grid; gap:12px;">
            ${rtKeys.map(rt => {
              const r = perRt[rt] || {};
              const total = r.total || 0;
              const valid = r.valid || 0;
              const invalid = r.invalid || 0;
              const pending = r.pending || 0;
              const progress = total ? Math.round((valid + invalid) / total * 100) : 0;
              const petugasNames = (r.petugas || []).map(p => p.name || p.username).join(', ');

              return `
                <div style="padding:12px; border:1px solid var(--border); border-radius:10px; background:#fafbfc;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
                    <div>
                      <strong style="font-size:1rem;">RT ${esc(rt)}</strong>
                      <span class="hint" style="margin-left:8px;">
                        ${total} pemilih
                        ${petugasNames ? `• 👤 ${esc(petugasNames)}` : ''}
                      </span>
                    </div>
                    <span class="badge ${progress === 100 ? 'ok' : progress > 50 ? 'info' : 'warn'}">
                      ${progress}% selesai
                    </span>
                  </div>
                  <div style="height:12px; background:#e2e8f0; border-radius:999px; overflow:hidden; display:flex;">
                    <div style="width:${total ? (valid / total * 100) : 0}%; background:var(--ok);" title="Valid"></div>
                    <div style="width:${total ? (invalid / total * 100) : 0}%; background:var(--err);" title="Perbaikan"></div>
                  </div>
                  <div style="display:flex; gap:12px; margin-top:6px; font-size:0.78rem; color:var(--muted);">
                    <span style="color:var(--ok)">✓ ${valid} valid</span>
                    <span style="color:var(--err)">✗ ${invalid} perbaikan</span>
                    <span style="color:var(--warn)">⏳ ${pending} pending</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <div class="card">
        <div class="row-between">
          <h3>Pemilih Terbaru</h3>
          <span class="hint">${UI.formatTime(new Date())}</span>
        </div>
        <div style="margin-top:12px">
          ${recent.length === 0
            ? `<p class="hint">Belum ada pemilih yang memilih.</p>`
            : recent.map(v => `
              <div class="booth-row">
                <strong>${esc(v.name)}</strong>
                <span class="hint" style="margin:0">${esc(v.code || '-')} • RT ${esc(v.rt || '-')}</span>
                <span class="badge ok" style="margin-left:auto">✓</span>
              </div>
            `).join('')
          }
        </div>
      </div>
    `;
  }

  /* ============================================================
   *  2. VOTERS — Sinkron dengan Coklit
   * ============================================================ */
  async function voters() {
    clearAllPolls(); cleanupSignPad(); safeQRStop();
    const el = view(); if (!el) return;

    el.innerHTML = `
      <div class="card">
        <div class="row-between">
          <div><h3>Data Pemilih</h3></div>
          <div class="row" style="margin:0">
            <button class="btn-primary btn-sm" id="btnAddVoter">+ Tambah</button>
          </div>
        </div>

        <div class="row" style="margin-top:12px; align-items:center;">
          <input class="input" id="voterSearch" placeholder="Cari nama / kode..." style="flex:2; min-width:180px;">
          <select class="input" id="voterFilterRt" style="flex:1; min-width:130px;">
            <option value="">Semua RT</option>
          </select>
          <select class="input" id="voterFilterCoklit" style="flex:1; min-width:130px;">
            <option value="">Semua Coklit</option>
            <option value="pending">Belum Dicoklit</option>
            <option value="valid">Sesuai</option>
            <option value="invalid">Perbaikan</option>
          </select>
        </div>

        <div id="voterList" style="margin-top:12px">${UI.skeleton(4)}</div>

        <div class="row-between" style="margin-top:12px;">
          <span class="hint" id="voterSyncInfo">Auto-refresh 15 detik</span>
          <button class="btn-ghost btn-sm" id="btnManualRefreshVoters" type="button">🔄 Refresh Manual</button>
        </div>
      </div>
    `;

    /* Restore filter state */
    const filterRt = document.getElementById('voterFilterRt');
    const filterCoklit = document.getElementById('voterFilterCoklit');
    if (filterRt && state.voterRtFilter) filterRt.value = state.voterRtFilter;
    if (filterCoklit && state.voterCoklitFilter) filterCoklit.value = state.voterCoklitFilter;

    /* Bind listeners */
    document.getElementById('btnAddVoter').onclick = () => editVoter(null);

    document.getElementById('voterSearch')
      .addEventListener('input', UI.debounce(() => loadVoters(), 300));

    filterRt.addEventListener('change', () => {
      state.voterRtFilter = filterRt.value;
      loadVoters();
    });

    filterCoklit.addEventListener('change', () => {
      state.voterCoklitFilter = filterCoklit.value;
      loadVoters();
    });

    document.getElementById('btnManualRefreshVoters').onclick = () => {
      if (window.Cache) Cache.clearAll();
      UI.toast('Memuat data terbaru…', 'info', 1200);
      loadVoters(true);
    };

    await loadVoters();
    setPoll('voterList', 15000, () => loadVoters(true));
  }

  async function loadVoters(forceRefresh) {
    const area = document.getElementById('voterList'); if (!area) return;
    const syncInfo = document.getElementById('voterSyncInfo');

    let res = await fetchData('list', { sheet: 'voters' }, forceRefresh === true);
    if (!res || !res.success) {
      area.innerHTML = `<p class="hint">Gagal memuat.</p>`;
      return;
    }

    let list = res.data || [];
    const filterRt = document.getElementById('voterFilterRt');
    const filterCoklit = document.getElementById('voterFilterCoklit');

    /* Populate RT dropdown */
    if (filterRt && filterRt.options.length <= 1) {
      const rts = [...new Set(list.map(v => String(v.rt || '').trim()))]
        .filter(rt => rt !== '')
        .sort();
      rts.forEach(rt => {
        const opt = document.createElement('option');
        opt.value = rt;
        opt.textContent = `RT ${rt}`;
        filterRt.appendChild(opt);
      });
      if (state.voterRtFilter) filterRt.value = state.voterRtFilter;
    }

    const keyword = (document.getElementById('voterSearch').value || '').trim().toLowerCase();
    const selectedRt = filterRt ? filterRt.value : '';
    const selectedCoklit = filterCoklit ? filterCoklit.value : '';

    if (keyword) {
      list = list.filter(v =>
        String(v.name || '').toLowerCase().includes(keyword) ||
        String(v.code || '').toLowerCase().includes(keyword)
      );
    }
    if (selectedRt) {
      list = list.filter(v => String(v.rt || '').trim() === selectedRt);
    }
    if (selectedCoklit) {
      if (selectedCoklit === 'pending') {
        list = list.filter(v => !v.coklitStatus || v.coklitStatus === 'pending');
      } else {
        list = list.filter(v => v.coklitStatus === selectedCoklit);
      }
    }

    if (!list.length) {
      area.innerHTML = `<p class="hint">Tidak ada data pemilih yang sesuai.</p>`;
      if (syncInfo) syncInfo.textContent = `Update: ${UI.formatTime(new Date())} • 0 data`;
      return;
    }

    const totalValid   = list.filter(v => v.coklitStatus === 'valid').length;
    const totalInvalid = list.filter(v => v.coklitStatus === 'invalid').length;
    const totalPending = list.length - totalValid - totalInvalid;

    area.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Kode</th><th>Nama</th><th>RT/RW</th>
              <th>Status</th><th>Coklit</th><th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(v => {
              const coklitStatus = v.coklitStatus || 'pending';
              const coklitBadge  = coklitStatus === 'valid'   ? 'ok'
                                 : coklitStatus === 'invalid' ? 'danger'
                                 : 'info';
              const coklitLabel  = coklitStatus === 'valid'   ? 'Sesuai'
                                 : coklitStatus === 'invalid' ? 'Perbaikan'
                                 : 'Belum';
              return `
                <tr>
                  <td><code>${esc(v.code || '-')}</code></td>
                  <td>${esc(v.name)}</td>
                  <td>${esc(v.rt || '-')}/${esc(v.rw || '-')}</td>
                  <td>
                    ${isTrue(v.voted)
                      ? '<span class="badge ok">Memilih</span>'
                      : v.checkinAt
                        ? '<span class="badge warn">Absen</span>'
                        : '<span class="badge">Belum</span>'}
                  </td>
                  <td><span class="badge ${coklitBadge}">${coklitLabel}</span></td>
                  <td style="white-space:nowrap;">
                    ${isTrue(v.voted) || v.checkinAt
                      ? `<button class="btn-ghost btn-sm" type="button"
                          onclick="ViewsAdmin.resetVoter('${esc(v.id)}')"
                          title="Reset Status">🔄</button>`
                      : ''}
                    <button class="btn-ghost btn-sm" type="button"
                      onclick="ViewsAdmin.editVoter('${esc(v.id)}')">✏️</button>
                    <button class="btn-danger btn-sm" type="button"
                      onclick="ViewsAdmin.deleteVoter('${esc(v.id)}')">🗑️</button>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    if (syncInfo) {
      syncInfo.innerHTML = `
        Update: ${UI.formatTime(new Date())} • 
        <span style="color:var(--ok)">${totalValid} valid</span> • 
        <span style="color:var(--err)">${totalInvalid} perbaikan</span> • 
        <span style="color:var(--warn)">${totalPending} pending</span>
      `;
    }
  }

  async function editVoter(voterId) {
    let v = { id: '', code: '', name: '', rt: '', rw: '' };
    if (voterId) {
      try {
        const r = await fetchData('list', { sheet: 'voters', filter: { id: voterId } }, true);
        if (r.success && r.data && r.data[0]) v = r.data[0];
      } catch (_) {}
    }

    const wrap = UI.el('div');
    wrap.innerHTML = `
      <label class="field"><span>Kode</span>
        <input class="input" id="fCode" value="${esc(v.code || '')}">
      </label>
      <label class="field"><span>Nama *</span>
        <input class="input" id="fName" value="${esc(v.name || '')}">
      </label>
      <div class="grid-2">
        <label class="field"><span>RT</span>
          <input class="input" id="fRt" value="${esc(v.rt || '')}">
        </label>
        <label class="field"><span>RW</span>
          <input class="input" id="fRw" value="${esc(v.rw || '')}">
        </label>
      </div>
      ${voterId && v.coklitStatus && v.coklitStatus !== 'pending' ? `
        <div class="banner warn" style="display:block;margin-top:12px;">
          ⚠️ Mengubah data ini akan <strong>mereset status coklit</strong> ke "Belum" karena data berubah.
        </div>
      ` : ''}
    `;

    UI.modal({
      title: voterId ? 'Edit Pemilih' : 'Tambah Pemilih',
      body: wrap,
      actions: [
        { label: 'Batal', type: 'ghost' },
        { label: 'Simpan', type: 'primary', onClick: async () => {
          const row = {
            id: v.id || '',
            code: wrap.querySelector('#fCode').value.trim(),
            name: wrap.querySelector('#fName').value.trim(),
            rt: wrap.querySelector('#fRt').value.trim(),
            rw: wrap.querySelector('#fRw').value.trim(),
          };
          if (!row.name) { UI.toast('Nama wajib diisi', 'error'); return false; }

          const r = await API.post('save', { sheet: 'voters', row });
          if (!r.success) { UI.toast(r.message || 'Gagal', 'error'); return false; }

          const wasReset = voterId &&
            r.data && r.data.coklitStatus === 'pending' &&
            v.coklitStatus && v.coklitStatus !== 'pending';

          UI.toast(
            wasReset ? 'Tersimpan — status coklit di-reset ke "Belum"' : 'Tersimpan',
            'success'
          );
          if (window.Cache) Cache.clearAll();
          loadVoters(true);
        }}
      ]
    });
  }

  async function deleteVoter(id) {
    const ok = await UI.confirm('Hapus pemilih ini?', { danger: true });
    if (!ok) return;
    const r = await API.post('delete', { sheet: 'voters', id });
    if (r.success) {
      UI.toast('Terhapus', 'success');
      if (window.Cache) Cache.clearAll();
      loadVoters(true);
    } else {
      UI.toast(r.message || 'Gagal hapus', 'error');
    }
  }

  async function resetVoter(id) {
    const ok = await UI.confirm(
      'Reset pemilih ini? Semua suara akan dihapus, status kembali "Belum Memilih", dan status coklit di-reset ke "Belum".',
      { danger: true, okLabel: 'Ya, Reset' }
    );
    if (!ok) return;

    try {
      UI.loading(document.getElementById('view'), true);
      const r = await API.post('voters.reset', { id });
      if (!r.success) { UI.toast(r.message || 'Gagal reset', 'error'); return; }
      UI.toast('Pemilih berhasil di-reset (termasuk coklit)', 'success');
      if (window.Cache) Cache.clearAll();
      loadVoters(true);
    } catch (err) {
      UI.toast(err.message, 'error');
    } finally {
      UI.loading(document.getElementById('view'), false);
    }
  }

  /* ============================================================
   *  3. CANDIDATES (dengan Tombol Flyer)
   * ============================================================ */
  async function candidates() {
    clearAllPolls(); cleanupSignPad(); safeQRStop();
    const el = view(); if (!el) return;

    el.innerHTML = `
      <div class="card">
        <div class="row-between">
          <div><h3>Data Calon</h3></div>
          <button class="btn-primary btn-sm" id="btnAddCand">+ Tambah</button>
        </div>
        <div id="candList" style="margin-top:12px">${UI.skeleton(3)}</div>
      </div>
    `;
    document.getElementById('btnAddCand').onclick = () => editCandidate(null);
    await loadCandidates();
  }

  async function loadCandidates() {
    const area = document.getElementById('candList'); if (!area) return;
    let r = await fetchData('list', { sheet: 'candidates' }, true);
    if (!r || !r.success) { area.innerHTML = `<p class="hint">Gagal memuat.</p>`; return; }

    const list = r.data || [];
    if (!list.length) {
      area.innerHTML = `<p class="hint">Belum ada calon.</p>`;
      return;
    }

    area.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>No</th><th>Foto</th><th>Nama</th><th>Posisi</th><th>Aktif</th><th>Aksi</th></tr></thead>
          <tbody>
            ${list.map(c => `
              <tr>
                <td>${esc(c.noUrut || '-')}</td>
                <td>${c.photoUrl
                  ? `<img src="${esc(c.photoUrl)}" style="width:40px;height:40px;object-fit:cover;border-radius:50%">`
                  : '-'}</td>
                <td>${esc(c.name)}</td>
                <td>${esc(c.position)}</td>
                <td>${isTrue(c.active) ? '<span class="badge ok">Ya</span>' : '<span class="badge">Tidak</span>'}</td>
                <td>
                  <button class="btn-ghost btn-sm" onclick="ViewsAdmin.editCandidate('${esc(c.id)}')">✏️</button>
                  <button class="btn-primary btn-sm" onclick="ViewsAdmin.generateFlyer('${esc(c.id)}')" title="Generate Flyer">🖼️ Flyer</button>
                  <button class="btn-danger btn-sm" onclick="ViewsAdmin.deleteCandidate('${esc(c.id)}')">🗑️</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  async function editCandidate(id) {
    let c = {
      id: '', noUrut: '', name: '', position: 'ketua_rt',
      photoUrl: '', visi: '', misi: '', active: true,
      slogan: '', alamat: ''
    };
    if (id) {
      try {
        const r = await fetchData('list', { sheet: 'candidates', filter: { id } }, true);
        if (r.success && r.data && r.data[0]) c = r.data[0];
      } catch (_) {}
    }

    const wrap = UI.el('div');
    wrap.innerHTML = `
      <div class="grid-2">
        <label class="field"><span>No. Urut</span>
          <input class="input" id="cNo" type="number" value="${esc(c.noUrut || '')}">
        </label>
        <label class="field"><span>Posisi</span>
          <select class="input" id="cPos">
            <option value="ketua_rt"           ${c.position === 'ketua_rt' ? 'selected' : ''}>Ketua RT</option>
            <option value="ketua_pemuda"       ${c.position === 'ketua_pemuda' ? 'selected' : ''}>Ketua Pemuda</option>
            <option value="wakil_pemuda"       ${c.position === 'wakil_pemuda' ? 'selected' : ''}>Wakil Pemuda</option>
            <option value="ketua_wakil_pemuda" ${c.position === 'ketua_wakil_pemuda' ? 'selected' : ''}>Ketua & Wakil (Paket)</option>
          </select>
        </label>
      </div>
      <label class="field"><span>Nama Calon *</span>
        <input class="input" id="cName" value="${esc(c.name || '')}">
      </label>
      
      <!-- ✅ TAMBAHAN BARU: Slogan & Alamat -->
      <div class="grid-2">
        <label class="field"><span>Slogan / Tagline</span>
          <input class="input" id="cSlogan" value="${esc(c.slogan || '')}" placeholder="Contoh: Bersama Kita Bisa!">
        </label>
        <label class="field"><span>Alamat (RT/RW)</span>
          <input class="input" id="cAlamat" value="${esc(c.alamat || '')}" placeholder="Contoh: RT 03 / RW 05">
        </label>
      </div>

      <label class="field">
        <span>Foto Calon</span>
        ${c.photoUrl
          ? `<div style="margin-bottom:8px"><img src="${esc(c.photoUrl)}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid var(--border)"></div>`
          : ''}
        <input type="file" id="cPhotoFile" accept="image/*" class="input" style="padding:8px">
        <small class="hint" style="display:none;color:var(--primary)" id="uploadStatus">Mengunggah...</small>
      </label>
      <label class="field"><span>Visi</span>
        <textarea class="input" id="cVisi" rows="2">${esc(c.visi || '')}</textarea>
      </label>
      <label class="field"><span>Misi (Pisahkan dengan ;)</span>
        <textarea class="input" id="cMisi" rows="3">${esc(c.misi || '')}</textarea>
      </label>
      <label class="remember-row">
        <input type="checkbox" id="cActive" ${isTrue(c.active) ? 'checked' : ''}> Aktif
      </label>
    `;

    UI.modal({
      title: id ? 'Edit Calon' : 'Tambah Calon',
      body: wrap,
      size: 'lg',
      actions: [
        { label: 'Batal', type: 'ghost' },
        { label: 'Simpan', type: 'primary', onClick: async () => {
          const btn = wrap.querySelector('.modal-foot .btn-primary');
          const status = wrap.querySelector('#uploadStatus');

          const row = {
            id: c.id || '',
            noUrut: wrap.querySelector('#cNo').value,
            name: wrap.querySelector('#cName').value.trim(),
            position: wrap.querySelector('#cPos').value,
            visi: wrap.querySelector('#cVisi').value.trim(),
            misi: wrap.querySelector('#cMisi').value.trim(),
            active: wrap.querySelector('#cActive').checked,
            photoUrl: c.photoUrl || '',
            slogan: wrap.querySelector('#cSlogan').value.trim(),
            alamat: wrap.querySelector('#cAlamat').value.trim(),
          };

          if (!row.name) { UI.toast('Nama wajib diisi', 'error'); return false; }

          const fileInput = wrap.querySelector('#cPhotoFile');
          const file = fileInput.files && fileInput.files[0];

          if (file) {
            if (btn) { btn.disabled = true; btn.textContent = 'Mengunggah...'; }
            if (status) { status.style.display = 'block'; status.textContent = 'Mengunggah foto ke Drive...'; }

            try {
              const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
              });

              const uploadRes = await API.post('settings.save', {
                key: 'temp_photo_' + Date.now(),
                value: base64,
                fileData: base64,
              });

              if (uploadRes && uploadRes.success && uploadRes.data && uploadRes.data.value) {
                let url = uploadRes.data.value;
                if (url.indexOf('drive.google.com') !== -1) {
                  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
                  if (match) url = 'https://lh3.googleusercontent.com/d/' + match[1];
                }
                row.photoUrl = url;
                if (status) { status.textContent = 'Upload berhasil!'; status.style.color = 'var(--ok)'; }
              } else {
                throw new Error((uploadRes && uploadRes.message) || 'Gagal upload');
              }
            } catch (err) {
              UI.toast('Gagal upload foto: ' + err.message, 'error');
              if (btn) { btn.disabled = false; btn.textContent = 'Simpan'; }
              return false;
            }
          }

          try {
            const r = await API.post('save', { sheet: 'candidates', row });
            if (!r.success) { UI.toast(r.message || 'Gagal', 'error'); return false; }
            UI.toast('Tersimpan', 'success');
            if (window.Cache) Cache.clearAll();
            loadCandidates();
          } catch (err) {
            UI.toast(err.message, 'error');
            return false;
          }
        }}
      ]
    });
  }

  async function deleteCandidate(id) {
    const ok = await UI.confirm('Hapus calon ini?', { danger: true });
    if (!ok) return;
    const r = await API.post('delete', { sheet: 'candidates', id });
    if (r.success) {
      UI.toast('Terhapus', 'success');
      if (window.Cache) Cache.clearAll();
      loadCandidates();
    }
  }

  /* ============================================================
   *  13. GENERATE DIGITAL FLYER (Premium Modern Design)
   *  ============================================================ */
  async function generateFlyer(id) {
    let c = null;
    try {
      const r = await fetchData('list', { sheet: 'candidates', filter: { id } }, true);
      if (r.success && r.data && r.data[0]) c = r.data[0];
    } catch (_) {}

    if (!c) { UI.toast('Data calon tidak ditemukan', 'error'); return; }

    UI.toast('Membuat flyer premium...', 'info', 1500);

    // Buat Canvas 1080x1350 (Rasio Instagram 4:5)
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');

    // 1. Background Gelap Elegan (Deep Navy)
    const grad = ctx.createLinearGradient(0, 0, 1080, 1350);
    grad.addColorStop(0, '#0B1120'); // Sangat Gelap
    grad.addColorStop(1, '#1E3A8A'); // Biru Tua
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1350);

    // 2. Ornamen Geometris & Floral (Aksen Emas)
    // Ornamen Kiri Atas
    ctx.fillStyle = 'rgba(251, 191, 36, 0.08)'; // Emas transparan
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(400, 0);
    ctx.quadraticCurveTo(200, 200, 0, 400);
    ctx.fill();
    // Ornamen Kanan Bawah
    ctx.beginPath();
    ctx.moveTo(1080, 1350);
    ctx.lineTo(680, 1350);
    ctx.quadraticCurveTo(880, 1150, 1080, 950);
    ctx.fill();

    // 3. Bingkai Emas (Luxury Border)
    ctx.strokeStyle = '#FBBF24';
    ctx.lineWidth = 4;
    ctx.strokeRect(40, 40, 1000, 1270);
    // Garis dalam
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(52, 52, 976, 1246);

    // 4. Header
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FBBF24';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('PEMILIHAN KETUA & WAKIL PEMUDA', 540, 120);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '16px sans-serif';
    ctx.fillText('RUKUN AGAWE SANTOSA (RAS) - NGIJO', 540, 155);

    // 5. Foto Calon (Lingkaran dengan Border Emas & Glow)
    if (c.photoUrl) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = c.photoUrl;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        // Shadow Glow
        ctx.shadowColor = '#FBBF24';
        ctx.shadowBlur = 40;
        ctx.beginPath();
        ctx.arc(540, 450, 200, 0, Math.PI * 2, true);
        ctx.fillStyle = '#1E293B';
        ctx.fill();
        ctx.shadowBlur = 0; // Reset

        // Gambar
        ctx.save();
        ctx.beginPath();
        ctx.arc(540, 450, 200, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, 340, 250, 400, 400);
        ctx.restore();

        // Border Emas
        ctx.beginPath();
        ctx.arc(540, 450, 200, 0, Math.PI * 2, true);
        ctx.strokeStyle = '#FBBF24';
        ctx.lineWidth = 8;
        ctx.stroke();

        // Border Dalam
        ctx.beginPath();
        ctx.arc(540, 450, 188, 0, Math.PI * 2, true);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();
      } catch (err) {
        console.warn('Gagal load foto', err);
      }
    }

    // 6. Nomor Urut Badge (Menjorok)
    ctx.fillStyle = '#EF4444'; // Merah
    ctx.beginPath();
    ctx.arc(700, 600, 65, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.stroke();
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 56px sans-serif';
    ctx.fillText(c.noUrut || '-', 700, 622);

    // 7. Nama & Slogan
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 72px serif'; // Font Serif agar elegan
    ctx.fillText(String(c.name || '').toUpperCase(), 540, 780);

    // Garis Aksen
    ctx.beginPath();
    ctx.moveTo(440, 810);
    ctx.lineTo(640, 810);
    ctx.strokeStyle = '#FBBF24';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#FBBF24';
    ctx.font = 'italic 32px serif';
    ctx.fillText(`"${c.slogan || 'Bersama Membangun Desa'}"`, 540, 870);

    // 8. Box Glassmorphism (Visi Misi)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; // Kaca gelap
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(100, 940, 880, 260, 20);
    } else {
      ctx.rect(100, 940, 880, 260);
    }
    ctx.fill();
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Teks Visi Misi
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FBBF24';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('VISI', 140, 990);
    
    ctx.fillStyle = '#E2E8F0';
    ctx.font = '20px sans-serif';
    const visiText = c.visi || '-';
    const visiLines = wrapText(ctx, visiText, 800);
    visiLines.slice(0, 2).forEach((line, i) => {
      ctx.fillText(line, 140, 1025 + (i * 30));
    });

    ctx.fillStyle = '#FBBF24';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('MISI UTAMA', 140, 1110);

    ctx.fillStyle = '#E2E8F0';
    ctx.font = '20px sans-serif';
    const misiText = c.misi ? c.misi.split(';')[0] + '...' : '-';
    const misiLines = wrapText(ctx, misiText, 800);
    misiLines.slice(0, 2).forEach((line, i) => {
      ctx.fillText(line, 140, 1145 + (i * 30));
    });

    // 9. Footer
    ctx.textAlign = 'center';
    ctx.fillStyle = '#94A3B8';
    ctx.font = '18px sans-serif';
    ctx.fillText(`Alamat: ${c.alamat || 'Sekretariat Panitia'}`, 540, 1260);

    ctx.fillStyle = '#FBBF24';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('SUARA ANDA MENENTUKAN MASA DEPAN', 540, 1290);

    // 10. Download Flyer
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `Flyer_Premium_${String(c.name || 'Calon').replace(/\s+/g, '_')}.jpg`;
    a.click();
    
    UI.toast('Flyer premium berhasil diunduh!', 'success');
  }

  // Helper untuk memotong teks panjang agar rapi di canvas
  function wrapText(ctx, text, maxWidth) {
    const words = String(text || '').split(' ');
    const lines = [];
    let currentLine = '';
    for (let i = 0; i < words.length; i++) {
      const testLine = currentLine + words[i] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && i > 0) {
        lines.push(currentLine.trim());
        currentLine = words[i] + ' ';
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine.trim());
    return lines;
  }

  /* ============================================================
   *  4. BOOTHS — Kontrol Kunci Bilik
   * ============================================================ */
  async function booths() {
    clearAllPolls(); cleanupSignPad(); safeQRStop();
    const el = view(); if (!el) return;

    el.innerHTML = `
      <div class="card">
        <div class="row-between">
          <div><h3>Manajemen Bilik</h3></div>
          <button class="btn-primary btn-sm" id="btnAddBooth">+ Tambah</button>
        </div>
        <div id="boothAdminList" style="margin-top:12px">${UI.skeleton(3)}</div>
      </div>
    `;

    document.getElementById('btnAddBooth').onclick = () => editBooth(null);
    await loadBooths();
    setPoll('boothAdminList', 5000, loadBooths);
  }

  async function loadBooths() {
    const area = document.getElementById('boothAdminList'); if (!area) return;
    let r = await fetchData('booth.status', {}, true);
    if (!r || !r.success) return;

    const list = r.data || [];
    if (!list.length) { area.innerHTML = `<p class="hint">Belum ada bilik.</p>`; return; }

    area.innerHTML = list.map(b => {
      const isOnline = b.lastActive && (Date.now() - b.lastActive < 90000);
      const active = !!b.currentVoterId;
      const authorized = isTrue(b.isAuthorized);
      
      let statusText = isOnline ? (active ? 'Sedang Memilih' : (authorized ? 'Siap Menerima' : 'Terkunci')) : 'Offline';
      let statusClass = isOnline ? (active ? 'warn' : (authorized ? 'ok' : 'danger')) : 'danger';
      let dotClass = isOnline ? 'online' : 'offline';

      return `
        <div class="booth-row ${isOnline ? (active ? 'occupied' : (authorized ? 'ready' : '')) : ''}">
          <span class="dot-indicator ${dotClass}"></span>
          <strong>${esc(b.name)}</strong>
          <span class="badge ${statusClass}">${statusText}</span>
          
          <div class="row" style="margin:0;margin-left:auto;gap:4px">
            ${isOnline && !active
              ? `<button class="btn-ghost btn-sm" type="button"
                    onclick="ViewsAdmin.authorizeBooth('${esc(b.id)}', ${!authorized})">
                    ${authorized ? '🔒 Kunci' : '🔓 Buka'}
                 </button>`
              : ''}
            <button class="btn-ghost btn-sm" onclick="ViewsAdmin.editBooth('${esc(b.id)}')">✏️</button>
            ${active
              ? `<button class="btn-ghost btn-sm" onclick="ViewsAdmin.freeBooth('${esc(b.id)}')">Kosongkan</button>`
              : ''}
            <button class="btn-danger btn-sm" onclick="ViewsAdmin.deleteBooth('${esc(b.id)}')">🗑️</button>
          </div>
        </div>`;
    }).join('');
  }

  async function authorizeBooth(boothId, status) {
    try {
      const r = await API.post('booth.authorize', { boothId, isAuthorized: status });
      if (!r.success) { UI.toast(r.message || 'Gagal', 'error'); return; }
      
      UI.toast(status ? 'Bilik dibuka!' : 'Bilik dikunci!', 'success');
      if (window.Cache) Cache.clearAll();
      loadBooths();
    } catch (err) { UI.toast(err.message, 'error'); }
  }

  async function editBooth(id) {
    let b = { id: '', name: '' };
    if (id) {
      try {
        const r = await fetchData('list', { sheet: 'booths', filter: { id } }, true);
        if (r.success && r.data && r.data[0]) b = r.data[0];
      } catch (_) {}
    }
    const wrap = UI.el('div');
    wrap.innerHTML = `
      <label class="field"><span>Nama Bilik</span>
        <input class="input" id="bName" value="${esc(b.name || '')}">
      </label>
    `;
    UI.modal({
      title: id ? 'Edit Bilik' : 'Tambah Bilik',
      body: wrap,
      actions: [
        { label: 'Batal', type: 'ghost' },
        { label: 'Simpan', type: 'primary', onClick: async () => {
          const row = { id: b.id || '', name: wrap.querySelector('#bName').value.trim() };
          if (!row.name) { UI.toast('Nama wajib', 'error'); return false; }
          const r = await API.post('save', { sheet: 'booths', row });
          if (!r.success) return false;
          UI.toast('Tersimpan', 'success');
          if (window.Cache) Cache.clearAll();
          loadBooths();
        }}
      ]
    });
  }

  async function deleteBooth(id) {
    const ok = await UI.confirm('Hapus bilik ini?', { danger: true });
    if (!ok) return;
    const r = await API.post('delete', { sheet: 'booths', id });
    if (r.success) {
      UI.toast('Terhapus', 'success');
      if (window.Cache) Cache.clearAll();
      loadBooths();
    }
  }

  async function freeBooth(id) {
    const ok = await UI.confirm('Kosongkan bilik ini?', { danger: true });
    if (!ok) return;
    try {
      const r = await API.post('booth.setCurrent', { boothId: id, voterId: '' });
      if (!r.success) { UI.toast(r.message || 'Gagal', 'error'); return; }
      UI.toast('Bilik dikosongkan', 'success');
      if (window.Cache) Cache.clearAll();
      loadBooths();
    } catch (err) { UI.toast(err.message, 'error'); }
  }

  /* ============================================================
   *  5. USERS (dengan role COKLIT)
   * ============================================================ */
  async function users() {
    clearAllPolls(); cleanupSignPad(); safeQRStop();
    const el = view(); if (!el) return;

    el.innerHTML = `
      <div class="card">
        <div class="row-between">
          <div><h3>Pengguna Sistem</h3></div>
          <button class="btn-primary btn-sm" id="btnAddUser">+ Tambah</button>
        </div>
        <div id="userList" style="margin-top:12px">${UI.skeleton(3)}</div>
      </div>
    `;
    document.getElementById('btnAddUser').onclick = () => editUser(null);
    await loadUsers();
  }

  async function loadUsers() {
    const area = document.getElementById('userList'); if (!area) return;
    let r = await fetchData('list', { sheet: 'users' }, true);
    if (!r || !r.success) return;

    const list = r.data || [];
    if (!list.length) {
      area.innerHTML = `<p class="hint">Belum ada pengguna.</p>`;
      return;
    }

    const roleBadge = (role) => {
      const map = { admin: 'danger', petugas: 'info', bilik: 'warn', coklit: 'ok' };
      return map[role] || 'info';
    };

    area.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Username</th><th>Nama</th><th>Role</th><th>RT</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>
            ${list.map(u => `
              <tr>
                <td><code>${esc(u.username)}</code></td>
                <td>${esc(u.name || '-')}</td>
                <td><span class="badge ${roleBadge(u.role)}">${esc(u.role || '-')}</span></td>
                <td>${u.rt ? esc(u.rt) : '-'}</td>
                <td>${isTrue(u.active) ? '<span class="badge ok">Aktif</span>' : '<span class="badge">Nonaktif</span>'}</td>
                <td>
                  <button class="btn-ghost btn-sm" onclick="ViewsAdmin.editUser('${esc(u.id)}')">✏️</button>
                  <button class="btn-danger btn-sm" onclick="ViewsAdmin.deleteUser('${esc(u.id)}')">🗑️</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  async function editUser(id) {
    let u = { id: '', username: '', name: '', role: 'petugas', boothId: '', rt: '', active: true };
    if (id) {
      try {
        const r = await fetchData('list', { sheet: 'users', filter: { id } }, true);
        if (r.success && r.data && r.data[0]) u = r.data[0];
      } catch (_) {}
    }

    const wrap = UI.el('div');
    wrap.innerHTML = `
      <label class="field"><span>Username *</span>
        <input class="input" id="uUser" value="${esc(u.username || '')}" ${id ? 'readonly' : ''}>
      </label>
      <label class="field"><span>Nama Lengkap *</span>
        <input class="input" id="uName" value="${esc(u.name || '')}">
      </label>
      <label class="field"><span>Password ${id ? '(kosongkan jika tidak diubah)' : '*'}</span>
        <input class="input" id="uPass" type="password" placeholder="${id ? '(tidak diubah)' : ''}">
      </label>
      <div class="grid-2">
        <label class="field"><span>Role</span>
          <select class="input" id="uRole">
            <option value="admin"   ${u.role === 'admin'   ? 'selected' : ''}>Admin</option>
            <option value="petugas" ${u.role === 'petugas' ? 'selected' : ''}>Petugas</option>
            <option value="bilik"   ${u.role === 'bilik'   ? 'selected' : ''}>Bilik</option>
            <option value="coklit"  ${u.role === 'coklit'  ? 'selected' : ''}>Coklit</option>
          </select>
        </label>
        <label class="field">
          <span id="rtLabel" style="display:${u.role === 'coklit' ? 'block' : 'none'};">
            RT Penanggung Jawab (khusus coklit)
          </span>
          <input class="input" id="uRt" value="${esc(u.rt || '')}"
                 placeholder="Contoh: 01, 02, 03, 04"
                 style="display:${u.role === 'coklit' ? 'block' : 'none'};">
        </label>
      </div>
      <label class="remember-row">
        <input type="checkbox" id="uActive" ${isTrue(u.active) ? 'checked' : ''}> Aktif
      </label>
    `;

    /* Toggle field RT berdasarkan role */
    const roleSelect = wrap.querySelector('#uRole');
    const rtField = wrap.querySelector('#uRt');
    const rtLabel = wrap.querySelector('#rtLabel');
    roleSelect.addEventListener('change', () => {
      const isCoklit = roleSelect.value === 'coklit';
      rtField.style.display = isCoklit ? 'block' : 'none';
      rtLabel.style.display = isCoklit ? 'block' : 'none';
    });

    UI.modal({
      title: id ? 'Edit Pengguna' : 'Tambah Pengguna',
      body: wrap,
      size: 'lg',
      actions: [
        { label: 'Batal', type: 'ghost' },
        { label: 'Simpan', type: 'primary', onClick: async () => {
          const row = {
            id: u.id || '',
            username: wrap.querySelector('#uUser').value.trim(),
            name: wrap.querySelector('#uName').value.trim(),
            role: wrap.querySelector('#uRole').value,
            active: wrap.querySelector('#uActive').checked,
            rt: wrap.querySelector('#uRt').value.trim(),
          };
          const pass = wrap.querySelector('#uPass').value;
          if (pass) row.password = pass;

          if (!row.username || !row.name) {
            UI.toast('Isi semua data wajib', 'error'); return false;
          }
          if (!id && !pass) {
            UI.toast('Password wajib untuk user baru', 'error'); return false;
          }
          if (row.role === 'coklit' && !row.rt) {
            UI.toast('RT wajib diisi untuk role Coklit', 'error'); return false;
          }

          try {
            const r = await API.post('save', { sheet: 'users', row });
            if (!r.success) { UI.toast(r.message || 'Gagal', 'error'); return false; }
            UI.toast('Tersimpan', 'success');
            if (window.Cache) Cache.clearAll();
            loadUsers();
          } catch (err) {
            UI.toast(err.message, 'error');
            return false;
          }
        }}
      ]
    });
  }

  async function deleteUser(id) {
    const ok = await UI.confirm('Hapus pengguna ini?', { danger: true });
    if (!ok) return;
    const r = await API.post('delete', { sheet: 'users', id });
    if (r.success) {
      UI.toast('Terhapus', 'success');
      if (window.Cache) Cache.clearAll();
      loadUsers();
    } else {
      UI.toast(r.message || 'Gagal hapus', 'error');
    }
  }

  /* ============================================================
   *  6. INVITATIONS
   * ============================================================ */
  let invState = { page: 1, limit: 10, total: 0 };

  async function invitations() {
    clearAllPolls(); cleanupSignPad(); safeQRStop();
    invState = { page: 1, limit: 10, total: 0 };

    const el = view(); if (!el) return;
    el.innerHTML = `
      <div class="card no-print">
        <div class="row-between">
          <div><h3>Undangan Pemilih</h3></div>
          <div class="row" style="margin:0">
            <select class="input" id="invLayout" style="width:auto">
              <option value="layout-1">1 Per Halaman (A4)</option>
              <option value="layout-2" selected>2 Per Halaman (A5)</option>
              <option value="layout-4">4 Per Halaman (A6)</option>
            </select>
            <button class="btn-primary btn-sm" id="btnPrint" type="button">🖨️ Cetak</button>
          </div>
        </div>
        <div class="row" style="margin-top:12px; align-items:center;">
          <input class="input" id="invSearch" placeholder="Cari nama pemilih…" style="flex:1;">
          <div id="invPagination" style="display:flex; gap:8px; align-items:center;"></div>
        </div>
      </div>

      <div style="overflow-x: auto; padding: 20px 0; width: 100%;" id="invPreviewContainer">
        <div id="invPrintArea" class="preview-zoom">${UI.skeleton(3)}</div>
      </div>
    `;

    const btnPrint = document.getElementById('btnPrint');
    const search   = document.getElementById('invSearch');
    const layout   = document.getElementById('invLayout');

    btnPrint.onclick = doPrint;
    search.addEventListener('input', UI.debounce(() => { invState.page = 1; loadInvitations(); }, 300));
    layout.addEventListener('change', () => {
      const l = layout.value;
      if (l === 'layout-1') invState.limit = 5;
      if (l === 'layout-2') invState.limit = 10;
      if (l === 'layout-4') invState.limit = 20;
      invState.page = 1;
      loadInvitations();
    });

    await loadInvitations();
  }

  function doPrint() {
    const btnPrint = document.getElementById('btnPrint');
    if (btnPrint) { btnPrint.disabled = true; btnPrint.textContent = '⏳ Menyiapkan...'; }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    const layoutClass = document.getElementById('invLayout').value;
    let cssLinks = '';
    document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
      cssLinks += `<link rel="stylesheet" href="${link.href}">`;
    });
    const undanganHTML = document.getElementById('invPrintArea').innerHTML;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Undangan</title>
          ${cssLinks}
          <style>
            @page { size: A4 portrait; margin: 0; }
            body, html { background: #fff !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
            .sidebar, .topbar, .card, .hint, .btn-primary, .btn-ghost, .no-print, #invPagination { display: none !important; }

            .invitations-sheet { display: grid !important; gap: 0 !important; padding: 0 !important; margin: 0 auto !important; background: transparent !important; max-width: none !important; width: 210mm !important; }

            .invite-wrapper { box-shadow: none !important; border: 1px dashed #ccc !important; page-break-inside: avoid; break-inside: avoid; overflow: hidden !important; position: relative !important; }
            .invite { position: absolute !important; top: 0 !important; left: 0 !important; transform: none !important; zoom: 1 !important; display: flex !important; }

            .layout-1 { grid-template-columns: 1fr !important; }
            .layout-1 .invite-wrapper { width: 210mm; height: 297mm; }
            .layout-1 .invite { width: 210mm !important; height: 280mm !important; }
            .layout-1 .invite-inner { width: 210mm !important; height: 280mm !important; }

            .layout-2 { grid-template-columns: repeat(2, 105mm) !important; }
            .layout-2 .invite-wrapper { width: 105mm; height: 148.5mm; }
            .layout-2 .invite { width: 105mm !important; height: 140mm !important; }
            .layout-2 .invite-inner { width: 105mm !important; height: 140mm !important; padding: 5mm 8mm !important; }

            .layout-4 { grid-template-columns: repeat(2, 105mm) !important; }
            .layout-4 .invite-wrapper { width: 105mm; height: 148.5mm; }
            .layout-4 .invite { width: 105mm !important; height: 140mm !important; }
            .layout-4 .invite-inner { width: 105mm !important; height: 140mm !important; padding: 5mm 8mm !important; }

            .invite-inner { font-size: 11px !important; line-height: 1.2 !important; display: flex; flex-direction: column; box-sizing: border-box; }
            .kop-surat { margin-bottom: 8px !important; padding-bottom: 5px !important; border-bottom-width: 2px !important; }
            .kop-surat img { width: 40px !important; height: 40px !important; }
            .kop-title { font-size: 12px !important; }
            .kop-sub { font-size: 9px !important; }
            .surat-header { margin-bottom: 8px !important; }
            .nama-pemilih { font-size: 12px !important; }
            .di-tempat { margin-top: 4px !important; }
            .surat-tabel { margin-bottom: 5px !important; font-size: 11px !important; }
            .surat-tabel td { padding: 1px 0 !important; }
            .surat-ttd { padding-top: 5px !important; margin-top: auto !important; }
            .qr-image { width: 60px !important; height: 60px !important; }
            .ttd-jabatan { font-size: 11px !important; margin-bottom: 2px !important; }
            .ttd-space { height: 40px !important; }
            .ttd-space img { max-height: 40px !important; }
            .ttd-nama { font-size: 11px !important; }
          </style>
        </head>
        <body class="print-body">
          <div class="invitations-sheet ${layoutClass}">
            ${undanganHTML}
          </div>
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (_) {}
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch (_) {}
        if (btnPrint) {
          btnPrint.disabled = false;
          btnPrint.textContent = '🖨️ Cetak';
        }
      }, 2000);
    }, 1500);
  }

  async function loadInvitations() {
    const area = document.getElementById('invPrintArea');
    const pag  = document.getElementById('invPagination');
    if (!area) return;

    let vr = await fetchData('list', { sheet: 'voters' });
    let sr = await fetchData('settings.public', {});
    if (!vr || !vr.success) { area.innerHTML = `<p class="hint">Gagal memuat.</p>`; return; }

    const settings = (sr && sr.success && sr.data) || {};
    const signerName = settings.invitation_signer || 'Ketua Panitia';
    const signerSig  = settings.invitation_signature || '';
    const eventName  = settings.event_name || 'Pemilihan';
    const eventLoc   = settings.event_location || '-';

    let formattedDate = '-';
    if (settings.election_date) {
      const d = new Date(settings.election_date);
      const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
      formattedDate = `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
    }

    const kw = (document.getElementById('invSearch').value || '').trim().toLowerCase();
    let list = vr.data || [];
    if (kw) {
      list = list.filter(v => String(v.name || '').toLowerCase().includes(kw));
    }

    invState.total = list.length;
    if (!list.length) {
      area.innerHTML = `<p class="hint" style="color:#000">Tidak ada pemilih.</p>`;
      pag.innerHTML = '';
      return;
    }

    const totalPages = Math.ceil(invState.total / invState.limit) || 1;
    if (invState.page > totalPages) invState.page = totalPages;

    const pageData = list.slice(
      (invState.page - 1) * invState.limit,
      invState.page * invState.limit
    );

    pag.innerHTML = `
      <button class="btn-ghost btn-sm" type="button"
        ${invState.page <= 1 ? 'disabled' : ''}
        onclick="ViewsAdmin.prevInvPage()">Sebelumnya</button>
      <span class="hint" style="margin:0 8px;">Hal ${invState.page} dari ${totalPages}</span>
      <button class="btn-ghost btn-sm" type="button"
        ${invState.page >= totalPages ? 'disabled' : ''}
        onclick="ViewsAdmin.nextInvPage()">Selanjutnya</button>
    `;

    const layoutClass = document.getElementById('invLayout').value;

    const renderInviteHtml = (v) => {
      let finalSig = signerSig;
      if (finalSig && finalSig.indexOf('drive.google.com') !== -1) {
        const match = finalSig.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (match) finalSig = `https://drive.google.com/thumbnail?id=${match[1]}&sz=w400`;
      }
      const signHtml = finalSig
        ? `<img src="${esc(finalSig)}" alt="TTD" crossorigin="anonymous">`
        : '';

      return `
        <div class="invite-wrapper">
          <div class="invite">
            <div class="invite-inner">
              <div class="kop-surat">
                <img src="assets/logo.svg" alt="Logo">
                <div class="kop-text">
                  <div class="kop-title">PERKUMPULAN PEMUDA-PEMUDI</div>
                  <div class="kop-title">RUKUN AGAWE SANTOSA (RAS)</div>
                  <div class="kop-sub">Jl. Parangtritis Km 6,5 Ngijo Bangunharjo</div>
                  <div class="kop-sub">Sewon Bantul</div>
                </div>
              </div>
              <div class="surat-body">
                <div class="surat-header">
                  <div class="hal-undangan">Hal: Undangan</div>
                  <div class="kepada-yth">
                    <div>Kepada Bapak/Ibu/Sdr:</div>
                    <div class="nama-pemilih">${esc(v.name)}</div>
                  </div>
                  <div class="di-tempat">Di Tempat</div>
                </div>
                <div class="surat-isi">
                  <p>Dengan Hormat,</p>
                  <p>Mengharap kehadiran yang akan diselenggarakan pada:</p>
                  <table class="surat-tabel">
                    <tr><td class="label">Hari,tanggal</td><td>:</td><td>${esc(formattedDate)}</td></tr>
                    <tr><td class="label">Pukul</td><td>:</td><td>19.30 – Selesai</td></tr>
                    <tr><td class="label">Tempat</td><td>:</td><td>${esc(eventLoc)}</td></tr>
                    <tr><td class="label">Acara</td><td>:</td><td>${esc(eventName)}</td></tr>
                  </table>
                  <p class="penutup">Demikian atas perhatian dan kehadiran kami mengucapkan terima kasih.</p>
                </div>
                <div class="surat-ttd">
                  <div class="ttd-box" style="width:45%;">
                    <div class="qr-scan-wrapper">
                      <div class="qr-image" id="qr-${esc(v.id)}"></div>
                      <div class="qr-code-text">Kode: ${esc(v.code || '-')}</div>
                    </div>
                    <div class="ttd-nama">Kode Pemilih</div>
                  </div>
                  <div class="ttd-box" style="width:45%;">
                    <div class="ttd-jabatan">Hormat kami,<br>Ketua Panitia</div>
                    <div class="ttd-space">${signHtml}</div>
                    <div class="ttd-nama">( ${esc(signerName)} )</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    };

    area.innerHTML = `
      <div class="invitations-sheet ${layoutClass}">
        ${pageData.map(renderInviteHtml).join('')}
      </div>
    `;

    setTimeout(() => {
      pageData.forEach(v => {
        const container = document.getElementById('qr-' + v.id);
        if (container && window.QRCode) {
          new QRCode(container, {
            text: v.code || v.id,
            width: 150,
            height: 150,
            correctLevel: QRCode.CorrectLevel.H,
          });
        }
      });
    }, 100);
  }

  function prevInvPage() {
    if (invState.page > 1) {
      invState.page--;
      loadInvitations();
      window.scrollTo(0, 0);
    }
  }
  function nextInvPage() {
    const total = Math.ceil(invState.total / invState.limit) || 1;
    if (invState.page < total) {
      invState.page++;
      loadInvitations();
      window.scrollTo(0, 0);
    }
  }

  /* ============================================================
   *  7. RESULTS
   * ============================================================ */
  async function results() {
    clearAllPolls(); cleanupSignPad(); safeQRStop();
    const el = view(); if (!el) return;
    el.innerHTML = `<div id="resultsArea">${UI.skeleton(4)}</div>`;
    await loadResults();
    setPoll('resultsArea', 5000, loadResults);
  }

  async function loadResults() {
    const area = document.getElementById('resultsArea'); if (!area) return;
    let r = await fetchData('results', {}, true);
    if (!r || !r.success) return;

    const groups = r.groups || {};
    const totalVoted  = r.totalVoted || 0;
    const totalVoters = r.totalVoters || 0;
    const LABELS = {
      ketua_rt: 'Ketua RT',
      ketua_pemuda: 'Ketua Pemuda',
      wakil_pemuda: 'Wakil Ketua Pemuda',
      ketua_wakil_pemuda: 'Ketua & Wakil Pemuda',
    };
    const COLORS = ['#2563eb', '#8b5cf6', '#16a34a', '#f59e0b', '#dc2626', '#0ea5e9'];

    area.innerHTML = `
      <div class="grid-3">
        <div class="stat"><small>Total Pemilih</small><h3>${totalVoters}</h3></div>
        <div class="stat"><small>Sudah Memilih</small><h3>${totalVoted}</h3></div>
        <div class="stat"><small>Partisipasi</small><h3>${UI.formatPercent(totalVoted, totalVoters || 1)}</h3></div>
      </div>

      <div class="card">
        <div class="row-between">
          <h3>Grafik Perolehan Suara</h3>
          <span class="hint">${UI.formatTime(new Date())}</span>
        </div>

        ${Object.keys(groups).length === 0
          ? `<p class="hint" style="margin-top:12px">Belum ada data.</p>`
          : Object.keys(groups).map(pos => {
              const items = groups[pos];
              const total = items.reduce((s, c) => s + (c.votes || 0), 0);
              return `
                <div class="res-group">
                  <h4 style="margin-bottom:15px; font-size:1rem; border-bottom:1px solid #eee; padding-bottom:5px;">
                    ${esc(LABELS[pos] || pos)}
                  </h4>
                  ${items.map((c, i) => {
                    const pct = total ? Math.round((c.votes || 0) / total * 100) : 0;
                    const color = COLORS[i % COLORS.length];
                    return `
                      <div style="display:flex; align-items:center; gap:15px; margin-bottom:12px;">
                        <div style="width:50px; height:50px; flex-shrink:0; border-radius:50%; overflow:hidden; border:2px solid #e2e8f0; background:#f1f5f9;">
                          <img src="${esc(c.photoUrl || '')}"
                            style="width:100%; height:100%; object-fit:cover;"
                            onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2250%22 height=%2250%22><circle cx=%2225%22 cy=%2225%22 r=%2225%22 fill=%22%23e2e8f0%22/></svg>'">
                        </div>
                        <div style="flex:1; min-width:0;">
                          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <div style="font-weight:600; font-size:0.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                              No. ${esc(c.noUrut || '-')} • ${esc(c.name)}
                            </div>
                            <div style="font-weight:700; font-size:0.9rem; color:${color};">
                              ${c.votes || 0} Suara (${pct}%)
                            </div>
                          </div>
                          <div style="height:16px; background:#f1f5f9; border-radius:8px; overflow:hidden; position:relative;">
                            <div style="height:100%; width:${pct}%; background:${color}; border-radius:8px; transition:width 1s ease-in-out;"></div>
                          </div>
                        </div>
                      </div>
                    `;
                  }).join('')}
                  <div style="text-align:right; font-size:0.8rem; color:var(--muted); margin-top:5px;">
                    Total Suara Sah: <strong>${total}</strong>
                  </div>
                </div>
              `;
            }).join('')}
      </div>
    `;
  }

  /* ============================================================
   *  8. BERITA ACARA
   * ============================================================ */
  async function beritaAcara() {
    clearAllPolls(); cleanupSignPad(); safeQRStop();
    const el = view(); if (!el) return;

    el.innerHTML = `
      <div class="card">
        <div class="row-between">
          <div><h3>Berita Acara</h3><p class="hint">Catat hasil & kejadian penting.</p></div>
          <button class="btn-primary btn-sm" id="btnNewBa" type="button">+ Buat Berita Acara</button>
        </div>
        <div id="baList" style="margin-top:12px">${UI.skeleton(3)}</div>
      </div>
    `;
    document.getElementById('btnNewBa').onclick = () => createBa();
    await loadBa();
  }

  async function loadBa() {
    const area = document.getElementById('baList'); if (!area) return;
    let r = await fetchData('ba.list', {});
    if (!r || !r.success) return;

    const list = (r.data || []).sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );
    if (!list.length) {
      area.innerHTML = `<p class="hint">Belum ada berita acara.</p>`;
      return;
    }

    area.innerHTML = list.map(ba => {
      let sigsHtml = '';
      try {
        const sigs = JSON.parse(ba.signatures || '[]');
        if (sigs.length > 0) {
          sigsHtml = `<div style="margin-top:15px; display:flex; gap:20px; flex-wrap:wrap;">`;
          sigs.forEach(s => {
            sigsHtml += `
              <div style="text-align:center; font-size:11px;">
                ${s.url
                  ? `<img src="${esc(s.url)}" style="height:60px; border:1px solid #ccc; border-radius:4px; margin-bottom:5px;"><br>`
                  : ''}
                <u>${esc(s.name)}</u>
              </div>`;
          });
          sigsHtml += `</div>`;
        }
      } catch (_) {}

      return `
        <div class="ba-item">
          <div class="row-between">
            <div>
              <strong>${esc(ba.title || 'Berita Acara')}</strong>
              <small>${esc(ba.createdAt ? UI.formatDateTime(ba.createdAt) : '-')} • ${esc(ba.createdBy || '-')}</small>
            </div>
            <button class="btn-ghost btn-sm" onclick="ViewsAdmin.printBa('${esc(ba.id)}')">🖨️ Cetak PDF</button>
          </div>
          <pre style="white-space: pre-wrap; font-family: inherit; margin-top:10px;">${esc(ba.content || '')}</pre>
          ${sigsHtml}
        </div>
      `;
    }).join('');
  }

  async function createBa() {
    let resultsData = null;
    try {
      const r = await fetchData('results', {}, true);
      if (r && r.success) resultsData = r;
    } catch (_) {}

    const wrap = UI.el('div');
    wrap.innerHTML = `
      <label class="field"><span>Judul</span>
        <input class="input" id="baTitle" value="Berita Acara Pemilihan">
      </label>
      <label class="field"><span>Isi / Rangkuman (Otomatis)</span>
        <textarea class="input" id="baContent" rows="8"></textarea>
      </label>

      <hr>
      <div class="row-between" style="margin-bottom:10px;">
        <h4 style="margin:0;">Tanda Tangan Digital</h4>
        <button class="btn-ghost btn-sm" type="button" id="btnAddSigner">+ Tambah TTD</button>
      </div>

      <div id="signersContainer" style="display:flex; flex-direction:column; gap:16px;"></div>
    `;

    if (resultsData) {
      const groups = resultsData.groups || {};
      let txt = `Pada hari ini, telah dilaksanakan pemilihan secara elektronik (E-Vote) dengan rincian sebagai berikut:\n\n`;
      txt += `Total Pemilih: ${resultsData.totalVoters}\n`;
      txt += `Sudah Memilih: ${resultsData.totalVoted}\n`;
      txt += `Partisipasi: ${UI.formatPercent(resultsData.totalVoted, resultsData.totalVoters || 1)}\n\n`;
      txt += `HASIL PEROLEHAN SUARA:\n`;
      Object.keys(groups).forEach(pos => {
        txt += `- Posisi: ${pos.toUpperCase()}\n`;
        groups[pos].forEach(c => {
          txt += `  * ${c.name} (No. ${c.noUrut || '-'}): ${c.votes} suara\n`;
        });
      });
      txt += `\nDemikian berita acara ini dibuat dengan sebenar-benarnya.`;
      wrap.querySelector('#baContent').value = txt;
    }

    const sigPads = [];
    const container = wrap.querySelector('#signersContainer');

    function addSignerRow(label) {
      const row = UI.el('div', {
        style: 'border:1px solid #e2e8f0; padding:12px; border-radius:8px; background:#fafbfc;'
      });
      row.innerHTML = `
        <label class="field"><span>${label || 'Nama Penandatangan'}</span>
          <input class="input signerName" placeholder="Nama">
        </label>
        <div class="signerPad" style="background:#fff; border:1px dashed #cbd5e1; border-radius:8px; margin-bottom:8px;"></div>
        <div class="row" style="margin-top:0; gap:8px;">
          <button class="btn-ghost btn-sm btn-undo-pad" type="button">↩️ Undo</button>
          <button class="btn-ghost btn-sm btn-clear-pad" type="button">🧹 Hapus</button>
        </div>
      `;
      container.appendChild(row);

      const padHost = row.querySelector('.signerPad');
      const btnUndo = row.querySelector('.btn-undo-pad');
      const btnClear = row.querySelector('.btn-clear-pad');

      // ✅ Inisialisasi Pad setelah DOM siap
      setTimeout(() => {
        if (window.Sign) {
          const pad = Sign.mount(padHost);
          
          // ✅ Bind event listener secara eksplisit agar tidak bentrok
          btnUndo.onclick = function(e) {
            e.preventDefault();
            if (pad && pad.undo) pad.undo();
          };
          
          btnClear.onclick = function(e) {
            e.preventDefault();
            if (pad && pad.clear) pad.clear();
          };

          sigPads.push({ nameInput: row.querySelector('.signerName'), pad });
        }
      }, 50);
    }

    addSignerRow('Nama Panitia');
    addSignerRow('Nama Tokoh Masyarakat');

    setTimeout(() => {
      const btnAdd = wrap.querySelector('#btnAddSigner');
      if (btnAdd) btnAdd.onclick = () => addSignerRow('Nama Penandatangan Lainnya');
    }, 100);

    UI.modal({
      title: 'Buat Berita Acara',
      body: wrap,
      size: 'lg',
      actions: [
        { label: 'Batal', type: 'ghost' },
        { label: 'Simpan', type: 'primary', onClick: async () => {
          const title   = wrap.querySelector('#baTitle').value.trim();
          const content = wrap.querySelector('#baContent').value.trim();

          if (!title) { UI.toast('Judul wajib diisi', 'error'); return false; }

          const btn = wrap.querySelector('.modal-foot .btn-primary');
          if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }

          try {
            const signaturesData = [];

            for (const item of sigPads) {
              const name = item.nameInput.value.trim();
              if (item.pad && !item.pad.isEmpty()) {
                const base64 = await item.pad.getBase64();
                const uploadRes = await API.post('settings.save', {
                  key: 'ba_sig_' + Date.now() + Math.random(),
                  value: base64,
                  fileData: base64,
                });

                if (uploadRes && uploadRes.success && uploadRes.data && uploadRes.data.value) {
                  signaturesData.push({ name: name || 'Tanpa Nama', url: uploadRes.data.value });
                } else if (name) {
                  signaturesData.push({ name, url: '' });
                }
              } else if (name) {
                signaturesData.push({ name, url: '' });
              }
            }

            const r = await API.post('ba.save', {
              title,
              content,
              createdBy: (me() || {}).username || '-',
              signatures: JSON.stringify(signaturesData),
            });

            if (!r.success) {
              UI.toast(r.message || 'Gagal', 'error');
              if (btn) { btn.disabled = false; btn.textContent = 'Simpan'; }
              return false;
            }

            UI.toast('Berita Acara Tersimpan', 'success');
            if (window.Cache) Cache.clearAll();
            loadBa();
          } catch (err) {
            UI.toast(err.message, 'error');
            if (btn) { btn.disabled = false; btn.textContent = 'Simpan'; }
            return false;
          }
        }}
      ]
    });
  }

  async function printBa(id) {
    const r = await fetchData('ba.list', {}, true);
    if (!r.success) return;
    const ba = (r.data || []).find(x => String(x.id) === String(id));
    if (!ba) return;

    let sigs = [];
    try { sigs = JSON.parse(ba.signatures || '[]'); } catch (_) {}

    const win = window.open('', '_blank');
    if (!win) { UI.toast('Popup diblokir. Izinkan popup untuk cetak.', 'warn'); return; }

    win.document.write(`
      <html><head><title>Berita Acara</title>
      <style>
        body { font-family: 'Times New Roman', serif; padding: 40px; font-size: 14px; line-height: 1.6; }
        h2 { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; }
        pre { white-space: pre-wrap; font-family: inherit; }
        .ttd-area { display: flex; justify-content: space-around; margin-top: 50px; text-align: center; flex-wrap: wrap; gap: 20px; }
        .ttd-box { width: 30%; min-width: 150px; }
        .ttd-box img { height: 70px; margin: 10px 0; }
        @media print { @page { margin: 20mm; } }
      </style></head><body>
      <h2>${esc(ba.title)}</h2>
      <pre>${esc(ba.content)}</pre>
      <div class="ttd-area">
        ${sigs.map(s => `
          <div class="ttd-box">
            <div>${esc(s.name)}</div>
            ${s.url ? `<img src="${esc(s.url)}">` : `<div style="height:70px"></div>`}
            <div style="border-top:1px solid #000">Tanda Tangan</div>
          </div>
        `).join('')}
      </div>
      <script>setTimeout(()=>window.print(), 500);<\/script>
      </body></html>
    `);
    win.document.close();
  }

  /* ============================================================
   *  9. SETTINGS
   * ============================================================ */
  async function settings() {
    clearAllPolls(); cleanupSignPad(); safeQRStop();
    const el = view(); if (!el) return;
    el.innerHTML = `<div class="card"><h3>Pengaturan Sistem</h3><div id="settingsForm" style="margin-top:12px">${UI.skeleton(3)}</div></div>`;
    await loadSettings();
  }

  async function loadSettings() {
    const area = document.getElementById('settingsForm'); if (!area) return;
    let r = await fetchData('list', { sheet: 'settings' });
    if (!r || !r.success) return;

    const map = {};
    (r.data || []).forEach(s => { map[s.key] = s.value; });
    const electionDate = map.election_date
      ? new Date(map.election_date).toISOString().slice(0, 16)
      : '';

    area.innerHTML = `
      <label class="field"><span>Nama Event</span>
        <input class="input" id="sEventName" value="${esc(map.event_name || '')}">
      </label>
      <label class="field"><span>Lokasi</span>
        <input class="input" id="sEventLoc" value="${esc(map.event_location || '')}">
      </label>
      <label class="field"><span>Tanggal Pemilihan</span>
        <input class="input" id="sElectionDate" type="datetime-local" value="${electionDate}">
      </label>
      <label class="field"><span>Nama Penandatangan Undangan</span>
        <input class="input" id="sSigner" value="${esc(map.invitation_signer || '')}">
      </label>

      <label class="field"><span>Mode Posisi Ketua & Wakil</span>
        <select class="input" id="sVotingMode">
          <option value="single" ${map.voting_mode === 'single' ? 'selected' : ''}>Digabung (Pilih 1 Paslon)</option>
          <option value="dual" ${map.voting_mode === 'dual' ? 'selected' : ''}>Terpisah (Pilih Ketua & Wakil Masing-masing)</option>
        </select>
      </label>

      <label class="field">
        <span>Tanda Tangan Digital</span>
        <div id="sigPadSettings" style="max-width:600px"></div>
      </label>
      <div class="row">
        <button class="btn-ghost btn-sm" id="btnSigClear" type="button">🧹 Hapus TTD</button>
        <button class="btn-ghost btn-sm" id="btnSigUndo" type="button">↩️ Undo</button>
        <button class="btn-ghost btn-sm" id="btnSigUpload" type="button">📎 Upload TTD</button>
        <input type="file" id="sigFileInput" accept="image/*" style="display:none">
      </div>

      <div class="row" style="margin-top:16px">
        <button class="btn-primary" id="btnSaveSettings" type="button">💾 Simpan</button>
      </div>

      <hr style="margin:24px 0;">
      <h3>Backup & Restore</h3>
      <p class="hint">Ekspor semua data ke file .json untuk backup.</p>
      <div class="row">
        <button class="btn-primary" id="btnExportBackup" type="button">📥 Download Backup</button>
        <input type="file" id="importBackupFile" accept=".json" style="display:none">
        <button class="btn-ghost" id="btnImportBackup" type="button">📤 Restore Backup</button>
      </div>
    `;

    const padHost = document.getElementById('sigPadSettings');
    if (padHost && window.Sign) {
      try {
        sigPad = Sign.mount(padHost);
        if (map.invitation_signature) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const canvas = sigPad.getCanvas();
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const rect = canvas.getBoundingClientRect();
            try { ctx.drawImage(img, 0, 0, rect.width, rect.height); } catch (_) {}
          };
          img.src = map.invitation_signature;
        }
      } catch (_) {}
    }

    const btnClear = document.getElementById('btnSigClear');
    if (btnClear) {
      btnClear.onclick = function(e) {
        e.preventDefault();
        if (sigPad) sigPad.clear();
      };
    }
    
    const btnUndo = document.getElementById('btnSigUndo');
    if (btnUndo) {
      btnUndo.onclick = function(e) {
        e.preventDefault();
        if (sigPad) sigPad.undo();
      };
    }

    const btnUpload = document.getElementById('btnSigUpload');
    const fileInput = document.getElementById('sigFileInput');
    if (btnUpload && fileInput) {
      btnUpload.onclick = () => fileInput.click();
      fileInput.onchange = function (e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (ev) {
          const img = new Image();
          img.onload = function () {
            const canvas = sigPad && sigPad.getCanvas();
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const rect = canvas.getBoundingClientRect();
            ctx.clearRect(0, 0, rect.width, rect.height);
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, rect.width, rect.height);
            ctx.drawImage(img, 0, 0, rect.width, rect.height);
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      };
    }

    const btnSave = document.getElementById('btnSaveSettings');
    if (btnSave) btnSave.onclick = saveSettings;

    /* Backup */
    const btnExport = document.getElementById('btnExportBackup');
    if (btnExport) {
      btnExport.onclick = async () => {
        const r = await API.post('backup.export');
        if (!r.success) { UI.toast('Gagal backup', 'error'); return; }
        const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'evote-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
      };
    }

    /* Restore */
    const btnImport = document.getElementById('btnImportBackup');
    const importFile = document.getElementById('importBackupFile');
    if (btnImport && importFile) {
      btnImport.onclick = () => importFile.click();
      importFile.onchange = function (e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async function (ev) {
          try {
            const data = JSON.parse(ev.target.result);
            const ok = await UI.confirm('Restore data? Data saat ini akan ditimpa.', { danger: true });
            if (!ok) return;
            const r = await API.post('backup.import', { data });
            if (r.success) {
              UI.toast('Restore berhasil', 'success');
              if (window.Cache) Cache.clearAll();
              loadSettings();
            } else {
              UI.toast('Gagal restore: ' + (r.message || ''), 'error');
            }
          } catch (err) {
            UI.toast('File JSON tidak valid', 'error');
          }
        };
        reader.readAsText(file);
      };
    }
  }

  async function saveSettings() {
    const btn = document.getElementById('btnSaveSettings');
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…'; }

    try {
      const updates = {
        event_name: (document.getElementById('sEventName') || {}).value || '',
        event_location: (document.getElementById('sEventLoc') || {}).value || '',
        election_date: (document.getElementById('sElectionDate') || {}).value || '',
        invitation_signer: (document.getElementById('sSigner') || {}).value || '',
        voting_mode: (document.getElementById('sVotingMode') || {}).value || 'single',
      };

      for (const key of Object.keys(updates)) {
        try { await API.post('settings.save', { key, value: updates[key] }); } catch (_) {}
      }

      if (sigPad && !sigPad.isEmpty()) {
        const dataUrl = await sigPad.getBase64();
        const r = await API.post('settings.save', {
          key: 'invitation_signature',
          value: dataUrl,
          fileData: dataUrl,
        });
        if (!r || !r.success) {
          UI.toast('TTD gagal disimpan: ' + ((r && r.message) || 'unknown'), 'warn');
        }
      }

      UI.toast('Pengaturan tersimpan', 'success');
      if (window.Cache) Cache.clearAll();
    } catch (err) {
      UI.toast('Error: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan'; }
    }
  }

  /* ============================================================
   *  10. LOGS
   * ============================================================ */
  async function logs() {
    clearAllPolls(); cleanupSignPad(); safeQRStop();
    const el = view(); if (!el) return;
    el.innerHTML = `
      <div class="card">
        <div class="row-between">
          <h3>Audit Trail (Log Aktivitas)</h3>
          <button class="btn-ghost btn-sm" id="btnRefreshLog" type="button">🔄 Refresh</button>
        </div>
        <div id="logList" style="margin-top:12px">${UI.skeleton(4)}</div>
      </div>
    `;
    document.getElementById('btnRefreshLog').onclick = () => loadLogs(true);
    await loadLogs();
  }

  async function loadLogs(forceRefresh) {
    const area = document.getElementById('logList'); if (!area) return;
    let r = await fetchData('logs.list', {}, forceRefresh === true);
    if (!r || !r.success) {
      area.innerHTML = `<p class="hint">Gagal memuat log.</p>`;
      return;
    }

    const list = (r.data || [])
      .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
      .slice(0, 100);

    if (!list.length) {
      area.innerHTML = `<p class="hint">Belum ada log.</p>`;
      return;
    }

    area.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Waktu</th><th>User</th><th>Aksi</th><th>Detail</th></tr></thead>
          <tbody>
            ${list.map(l => {
              const badge = l.action === 'vote'    ? 'warn'
                          : l.action === 'checkin' ? 'ok'
                          : l.action === 'coklit'  ? 'info'
                          : l.action === 'login'   ? 'ok'
                          : l.action === 'booth_auth' ? 'info'
                          : l.action === 'ERROR'   ? 'danger'
                          : 'info';
              return `
                <tr>
                  <td><small>${UI.formatDateTime(l.timestamp)}</small></td>
                  <td><strong>${esc(l.user)}</strong></td>
                  <td><span class="badge ${badge}">${esc(l.action)}</span></td>
                  <td><small>${esc(l.detail)}</small></td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  /* ============================================================
   *  EXPORTS
   * ============================================================ */
  return {
    dashboard, voters, candidates, booths, users,
    invitations, results, beritaAcara, settings, logs,
    editVoter, deleteVoter, resetVoter,
    editCandidate, deleteCandidate, generateFlyer,
    editBooth, freeBooth, deleteBooth, authorizeBooth,
    editUser, deleteUser,
    prevInvPage, nextInvPage,
    printBa,
    _clearAllPolls: function () {
      clearAllPolls();
      cleanupSignPad();
      safeQRStop();
    },
  };
})();