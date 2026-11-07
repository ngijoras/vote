/* ============================================================
   E-VOTE • views-admin.js (FULL FIX)
   Role: ADMIN
   Menu: Dashboard, Voters, Candidates, Booths, Users,
         Invitations, Results, BeritaAcara, Settings
   ============================================================ */
window.ViewsAdmin = (function () {
  'use strict';

  const view   = () => document.getElementById('view');
  const me     = () => API.user() || {};
  const isTrue = (v) => v === true || String(v) === 'TRUE' || String(v) === 'true';
  const esc    = (s) => UI.escapeHtml(s);

  /* ============================================================
   *  POLLING (anti race, auto-cleanup)
   * ============================================================ */
  const polls = {};
  function setPoll(id, ms, fn) {
    clearPoll(id);
    let busy = false;
    polls[id] = setInterval(async () => {
      if (!document.getElementById(id)) { clearPoll(id); return; }
      if (busy) return;
      busy = true;
      try { await fn(); }
      catch (e) { console.error('[poll:' + id + ']', e); }
      finally { busy = false; }
    }, ms);
  }
  function clearPoll(id) {
    if (polls[id]) { clearInterval(polls[id]); delete polls[id]; }
  }
  function clearAllPolls() {
    Object.keys(polls).forEach(clearPoll);
  }

  /* ============================================================
   *  SHARED STATE
   * ============================================================ */
  let sigPad = null;

  function cleanupSignPad() {
    try { if (sigPad && sigPad.destroy) sigPad.destroy(); } catch (_) {}
    sigPad = null;
  }
  function safeQRStop() {
    try { if (window.QR && QR.stop) QR.stop(); } catch (_) {}
  }

  /* ============================================================
   *  DASHBOARD
   * ============================================================ */
  async function dashboard() {
    clearAllPolls();
    cleanupSignPad();
    safeQRStop();

    const el = view();
    if (!el) return;
    el.innerHTML = `<div id="adminDash">${UI.skeleton(4)}</div>`;

    await loadDashboard();
    setPoll('adminDash', 4000, loadDashboard);
  }

  async function loadDashboard() {
    const area = document.getElementById('adminDash');
    if (!area) return;

    let sumRes, recentRes;
    try {
      [sumRes, recentRes] = await Promise.all([
        API.post('dash.summary'),
        API.post('list', { sheet: 'voters' }),
      ]);
    } catch (err) {
      area.innerHTML = `<div class="card"><p class="hint" style="color:var(--err)">Gagal memuat: ${esc(err.message)}</p></div>`;
      return;
    }

    if (!sumRes || !sumRes.success) {
      area.innerHTML = `<div class="card"><p class="hint" style="color:var(--err)">${esc((sumRes && sumRes.message) || 'Gagal')}</p></div>`;
      return;
    }

    const d = sumRes.data || {};
    const voters = (recentRes && recentRes.data) || [];
    const recent = voters.filter(v => isTrue(v.voted))
      .sort((a, b) => String(b.checkinAt || '').localeCompare(String(a.checkinAt || '')))
      .slice(0, 5);

    area.innerHTML = `
      <div class="grid-3">
        <div class="stat"><small>Total Pemilih</small><h3>${d.totalVoters || 0}</h3></div>
        <div class="stat"><small>Sudah Memilih</small><h3>${d.voted || 0}</h3></div>
        <div class="stat"><small>Partisipasi</small><h3>${UI.formatPercent(d.voted || 0, d.totalVoters || 1)}</h3></div>
        <div class="stat"><small>Bilik Total</small><h3>${d.boothsTotal || 0}</h3></div>
        <div class="stat"><small>Bilik Terisi</small><h3>${d.boothsOccupied || 0}</h3></div>
        <div class="stat"><small>Calon Aktif</small><h3>${d.candidates || 0}</h3></div>
      </div>

      <div class="card">
        <h3>Aksi Cepat</h3>
        <p class="hint">Akses cepat ke menu utama.</p>
        <div class="row">
          <a href="#/admin/voters" class="btn-primary">👥 Data Pemilih</a>
          <a href="#/admin/candidates" class="btn-ghost">🏅 Data Calon</a>
          <a href="#/admin/results" class="btn-ghost">📈 Hasil</a>
        </div>
      </div>

      <div class="card">
        <div class="row-between">
          <h3>Pemilih Terbaru</h3>
          <span class="hint">${UI.formatTime(new Date())}</span>
        </div>
        <div style="margin-top:12px">
          ${recent.length === 0
            ? `<p class="hint">Belum ada pemilih.</p>`
            : recent.map(v => `
                <div class="booth-row">
                  <strong>${esc(v.name)}</strong>
                  <span class="hint">${esc(v.code || '-')}</span>
                  <span class="badge ok" style="margin-left:auto">✓ Memilih</span>
                </div>`).join('')}
        </div>
      </div>
    `;
  }

  /* ============================================================
   *  VOTERS
   * ============================================================ */
  async function voters() {
    clearAllPolls();
    cleanupSignPad();
    safeQRStop();

    const el = view();
    if (!el) return;
    el.innerHTML = `
      <div class="card">
        <div class="row-between">
          <div>
            <h3>Data Pemilih</h3>
            <p class="hint">Kelola daftar pemilih terdaftar.</p>
          </div>
          <div class="row" style="margin:0">
            <button class="btn-ghost btn-sm" id="btnImportVoters" type="button">📥 Import</button>
            <button class="btn-primary btn-sm" id="btnAddVoter" type="button">+ Tambah</button>
          </div>
        </div>
        <div class="row" style="margin-top:12px">
          <input class="input" id="voterSearch" placeholder="Cari nama / kode / RT…" style="flex:1">
        </div>
        <div id="voterList" style="margin-top:12px">${UI.skeleton(4)}</div>
      </div>
    `;

    const btnAdd = document.getElementById('btnAddVoter');
    const btnImport = document.getElementById('btnImportVoters');
    const search = document.getElementById('voterSearch');

    if (btnAdd) btnAdd.onclick = () => editVoter(null);
    if (btnImport) btnImport.onclick = importVoters;
    if (search) search.addEventListener('input', UI.debounce(() => loadVoters(), 300));

    await loadVoters();
  }

  async function loadVoters() {
    const area = document.getElementById('voterList');
    if (!area) return;

    let res;
    try { res = await API.post('list', { sheet: 'voters' }); }
    catch (err) {
      area.innerHTML = `<p class="hint" style="color:var(--err)">Gagal: ${esc(err.message)}</p>`;
      return;
    }
    if (!res || !res.success) {
      area.innerHTML = `<p class="hint" style="color:var(--err)">${esc((res && res.message) || 'Gagal')}</p>`;
      return;
    }

    const q = (document.getElementById('voterSearch') || {}).value || '';
    const keyword = q.trim().toLowerCase();
    let list = res.data || [];
    if (keyword) {
      list = list.filter(v =>
        String(v.name || '').toLowerCase().indexOf(keyword) !== -1 ||
        String(v.code || '').toLowerCase().indexOf(keyword) !== -1 ||
        String(v.rt || '').toLowerCase().indexOf(keyword) !== -1
      );
    }

    if (!list.length) {
      area.innerHTML = `<p class="hint">Tidak ada data pemilih.</p>`;
      return;
    }

    area.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Kode</th><th>Nama</th><th>RT/RW</th>
              <th>Status</th><th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(v => `
              <tr>
                <td><code>${esc(v.code || '-')}</code></td>
                <td>${esc(v.name)}</td>
                <td>${esc(v.rt || '-')}/${esc(v.rw || '-')}</td>
                <td>${isTrue(v.voted)
                  ? '<span class="badge ok">Memilih</span>'
                  : v.checkinAt
                    ? '<span class="badge warn">Absen</span>'
                    : '<span class="badge">Belum</span>'}</td>
                <td>
                  <button class="btn-ghost btn-sm" type="button"
                    onclick="ViewsAdmin.editVoter('${esc(v.id)}')">✏️</button>
                  <button class="btn-danger btn-sm" type="button"
                    onclick="ViewsAdmin.deleteVoter('${esc(v.id)}')">🗑️</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  async function editVoter(voterId) {
    let v = { id: '', code: '', name: '', rt: '', rw: '', address: '', phone: '' };
    if (voterId) {
      try {
        const r = await API.post('list', { sheet: 'voters', filter: { id: voterId } });
        if (r.success && r.data && r.data[0]) v = r.data[0];
      } catch (_) {}
    }

    const wrap = UI.el('div');
    wrap.innerHTML = `
      <label class="field"><span>Kode</span>
        <input class="input" id="fCode" value="${esc(v.code || '')}" placeholder="Otomatis jika kosong"></label>
      <label class="field"><span>Nama *</span>
        <input class="input" id="fName" value="${esc(v.name || '')}" required></label>
      <div class="grid-2">
        <label class="field"><span>RT</span>
          <input class="input" id="fRt" value="${esc(v.rt || '')}"></label>
        <label class="field"><span>RW</span>
          <input class="input" id="fRw" value="${esc(v.rw || '')}"></label>
      </div>
      <label class="field"><span>Alamat</span>
        <input class="input" id="fAddress" value="${esc(v.address || '')}"></label>
      <label class="field"><span>Telepon</span>
        <input class="input" id="fPhone" value="${esc(v.phone || '')}"></label>
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
            address: wrap.querySelector('#fAddress').value.trim(),
            phone: wrap.querySelector('#fPhone').value.trim(),
          };
          if (!row.name) { UI.toast('Nama wajib diisi', 'error'); return false; }
          try {
            const r = await API.post('save', { sheet: 'voters', row });
            if (!r.success) { UI.toast(r.message || 'Gagal', 'error'); return false; }
            UI.toast('Tersimpan', 'success');
            if (window.Cache) Cache.invalidate('list', { sheet: 'voters' });
            loadVoters();
          } catch (err) { UI.toast(err.message, 'error'); return false; }
        }}
      ]
    });
  }

  async function deleteVoter(id) {
    const ok = await UI.confirm('Hapus pemilih ini?', { danger: true });
    if (!ok) return;
    try {
      const r = await API.post('delete', { sheet: 'voters', id });
      if (!r.success) { UI.toast(r.message || 'Gagal', 'error'); return; }
      UI.toast('Terhapus', 'success');
      if (window.Cache) Cache.invalidate('list', { sheet: 'voters' });
      loadVoters();
    } catch (err) { UI.toast(err.message, 'error'); }
  }

  async function importVoters() {
    const wrap = UI.el('div');
    wrap.innerHTML = `
      <p class="hint">Format: <code>nama,rt,rw,alamat,phone</code> per baris.</p>
      <textarea class="input" id="bulkInput" rows="8"
        placeholder="Budi,01,02,Jl. Mawar,081234
Ani,02,02,Jl. Melati,085678"></textarea>
    `;
    UI.modal({
      title: 'Import Pemilih',
      body: wrap,
      actions: [
        { label: 'Batal', type: 'ghost' },
        { label: 'Import', type: 'primary', onClick: async () => {
          const txt = wrap.querySelector('#bulkInput').value.trim();
          if (!txt) { UI.toast('Kosong', 'error'); return false; }
          const rows = txt.split('\n').map(line => {
            const parts = line.split(',').map(s => s.trim());
            return { name: parts[0], rt: parts[1] || '', rw: parts[2] || '', address: parts[3] || '', phone: parts[4] || '' };
          }).filter(r => r.name);
          if (!rows.length) { UI.toast('Tidak ada baris valid', 'error'); return false; }
          try {
            const r = await API.post('voters.bulk', { rows });
            if (!r.success) { UI.toast(r.message || 'Gagal', 'error'); return false; }
            UI.toast(`Berhasil import ${r.added || 0} data`, 'success');
            if (window.Cache) Cache.invalidate('list', { sheet: 'voters' });
            loadVoters();
          } catch (err) { UI.toast(err.message, 'error'); return false; }
        }}
      ]
    });
  }

  /* ============================================================
   *  CANDIDATES
   * ============================================================ */
  async function candidates() {
    clearAllPolls();
    cleanupSignPad();
    safeQRStop();

    const el = view();
    if (!el) return;
    el.innerHTML = `
      <div class="card">
        <div class="row-between">
          <div>
            <h3>Data Calon</h3>
            <p class="hint">Kelola calon per posisi.</p>
          </div>
          <button class="btn-primary btn-sm" id="btnAddCand" type="button">+ Tambah Calon</button>
        </div>
        <div id="candList" style="margin-top:12px">${UI.skeleton(3)}</div>
      </div>
    `;
    const btnAdd = document.getElementById('btnAddCand');
    if (btnAdd) btnAdd.onclick = () => editCandidate(null);
    await loadCandidates();
  }

  async function loadCandidates() {
    const area = document.getElementById('candList');
    if (!area) return;

    let r;
    try { r = await API.post('list', { sheet: 'candidates' }); }
    catch (err) { area.innerHTML = `<p class="hint" style="color:var(--err)">${esc(err.message)}</p>`; return; }
    if (!r.success) { area.innerHTML = `<p class="hint" style="color:var(--err)">${esc(r.message)}</p>`; return; }

    const list = r.data || [];
    if (!list.length) {
      area.innerHTML = `<p class="hint">Belum ada calon.</p>`;
      return;
    }

    const groups = {};
    list.forEach(c => { (groups[c.position] = groups[c.position] || []).push(c); });
    const LABELS = {
      ketua_rt: 'Ketua RT', ketua_pemuda: 'Ketua Pemuda',
      wakil_pemuda: 'Wakil Ketua Pemuda', ketua_wakil_pemuda: 'Ketua & Wakil Pemuda',
    };

    area.innerHTML = Object.keys(groups).map(pos => `
      <div class="pos-group">
        <h4>${esc(LABELS[pos] || pos)}</h4>
        <div class="cand-list">
          ${groups[pos].sort((a, b) => (Number(a.noUrut) || 0) - (Number(b.noUrut) || 0)).map(c => `
            <div class="cand-item" style="cursor:default">
              <img src="${esc(c.photoUrl || '')}" alt=""
                onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2252%22 height=%2252%22><circle cx=%2226%22 cy=%2226%22 r=%2226%22 fill=%22%23e2e8f0%22/></svg>'">
              <div style="flex:1">
                <strong>${esc(c.name)}</strong>
                <div class="hint">No. ${esc(c.noUrut || '-')} • ${isTrue(c.active) ? '✅ Aktif' : '❌ Nonaktif'}</div>
              </div>
              <button class="btn-ghost btn-sm" type="button"
                onclick="ViewsAdmin.editCandidate('${esc(c.id)}')">✏️</button>
              <button class="btn-danger btn-sm" type="button"
                onclick="ViewsAdmin.deleteCandidate('${esc(c.id)}')">🗑️</button>
            </div>`).join('')}
        </div>
      </div>
    `).join('');
  }

  async function editCandidate(id) {
    let c = { id: '', noUrut: '', name: '', position: 'ketua_rt', photoUrl: '', visi: '', misi: '', active: true };
    if (id) {
      try {
        const r = await API.post('list', { sheet: 'candidates', filter: { id } });
        if (r.success && r.data && r.data[0]) c = r.data[0];
      } catch (_) {}
    }

    const wrap = UI.el('div');
    wrap.innerHTML = `
      <div class="grid-2">
        <label class="field"><span>No. Urut</span>
          <input class="input" id="cNo" type="number" value="${esc(c.noUrut || '')}"></label>
        <label class="field"><span>Posisi</span>
          <select class="input" id="cPos">
            <option value="ketua_rt" ${c.position === 'ketua_rt' ? 'selected' : ''}>Ketua RT</option>
            <option value="ketua_pemuda" ${c.position === 'ketua_pemuda' ? 'selected' : ''}>Ketua Pemuda</option>
            <option value="wakil_pemuda" ${c.position === 'wakil_pemuda' ? 'selected' : ''}>Wakil Pemuda</option>
            <option value="ketua_wakil_pemuda" ${c.position === 'ketua_wakil_pemuda' ? 'selected' : ''}>Ketua & Wakil</option>
          </select></label>
      </div>
      <label class="field"><span>Nama *</span>
        <input class="input" id="cName" value="${esc(c.name || '')}"></label>
      <label class="field"><span>URL Foto</span>
        <input class="input" id="cPhoto" value="${esc(c.photoUrl || '')}" placeholder="https://..."></label>
      <label class="field"><span>Visi</span>
        <textarea class="input" id="cVisi" rows="2">${esc(c.visi || '')}</textarea></label>
      <label class="field"><span>Misi (pisah ;)</span>
        <textarea class="input" id="cMisi" rows="3">${esc(c.misi || '')}</textarea></label>
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
          const row = {
            id: c.id || '',
            noUrut: wrap.querySelector('#cNo').value,
            name: wrap.querySelector('#cName').value.trim(),
            position: wrap.querySelector('#cPos').value,
            photoUrl: wrap.querySelector('#cPhoto').value.trim(),
            visi: wrap.querySelector('#cVisi').value.trim(),
            misi: wrap.querySelector('#cMisi').value.trim(),
            active: wrap.querySelector('#cActive').checked,
          };
          if (!row.name) { UI.toast('Nama wajib', 'error'); return false; }
          try {
            const r = await API.post('save', { sheet: 'candidates', row });
            if (!r.success) { UI.toast(r.message || 'Gagal', 'error'); return false; }
            UI.toast('Tersimpan', 'success');
            if (window.Cache) Cache.invalidate('list', { sheet: 'candidates' });
            loadCandidates();
          } catch (err) { UI.toast(err.message, 'error'); return false; }
        }}
      ]
    });
  }

  async function deleteCandidate(id) {
    const ok = await UI.confirm('Hapus calon ini?', { danger: true });
    if (!ok) return;
    try {
      const r = await API.post('delete', { sheet: 'candidates', id });
      if (!r.success) { UI.toast(r.message || 'Gagal', 'error'); return; }
      UI.toast('Terhapus', 'success');
      if (window.Cache) Cache.invalidate('list', { sheet: 'candidates' });
      loadCandidates();
    } catch (err) { UI.toast(err.message, 'error'); }
  }

  /* ============================================================
   *  BOOTHS
   * ============================================================ */
  async function booths() {
    clearAllPolls();
    cleanupSignPad();
    safeQRStop();

    const el = view();
    if (!el) return;
    el.innerHTML = `
      <div class="card">
        <div class="row-between">
          <div>
            <h3>Manajemen Bilik</h3>
            <p class="hint">Kelola bilik voting.</p>
          </div>
          <button class="btn-primary btn-sm" id="btnAddBooth" type="button">+ Tambah Bilik</button>
        </div>
        <div id="boothAdminList" style="margin-top:12px">${UI.skeleton(3)}</div>
      </div>
    `;
    const btnAdd = document.getElementById('btnAddBooth');
    if (btnAdd) btnAdd.onclick = () => editBooth(null);
    await loadBooths();
    setPoll('boothAdminList', 5000, loadBooths);
  }

  async function loadBooths() {
    const area = document.getElementById('boothAdminList');
    if (!area) return;

    let r;
    try { r = await API.post('booth.status'); }
    catch (err) { area.innerHTML = `<p class="hint" style="color:var(--err)">${esc(err.message)}</p>`; return; }
    if (!r.success) { area.innerHTML = `<p class="hint" style="color:var(--err)">${esc(r.message)}</p>`; return; }

    const list = r.data || [];
    if (!list.length) {
      area.innerHTML = `<p class="hint">Belum ada bilik.</p>`;
      return;
    }

    area.innerHTML = list.map(b => {
      const active = !!b.currentVoterId;
      const online = b.lastActive && (Date.now() - b.lastActive < 90000);
      return `
        <div class="booth-row ${active ? 'occupied' : 'ready'}">
          <span class="dot-indicator ${online ? 'online' : 'offline'}" title="${online ? 'Online' : 'Offline'}"></span>
          <strong>${esc(b.name)}</strong>
          <span class="badge ${active ? 'occupied' : 'ready'}">${active ? 'Terisi' : 'Siap'}</span>
          <div class="row" style="margin:0;margin-left:auto;gap:4px">
            <button class="btn-ghost btn-sm" type="button"
              onclick="ViewsAdmin.editBooth('${esc(b.id)}')">✏️</button>
            ${active
              ? `<button class="btn-ghost btn-sm" type="button"
                    onclick="ViewsAdmin.freeBooth('${esc(b.id)}')">Kosongkan</button>`
              : ''}
            <button class="btn-danger btn-sm" type="button"
              onclick="ViewsAdmin.deleteBooth('${esc(b.id)}')">🗑️</button>
          </div>
        </div>`;
    }).join('');
  }

  async function editBooth(id) {
    let b = { id: '', name: '' };
    if (id) {
      try {
        const r = await API.post('list', { sheet: 'booths', filter: { id } });
        if (r.success && r.data && r.data[0]) b = r.data[0];
      } catch (_) {}
    }

    const wrap = UI.el('div');
    wrap.innerHTML = `
      <label class="field"><span>Nama Bilik *</span>
        <input class="input" id="bName" value="${esc(b.name || '')}"></label>
    `;
    UI.modal({
      title: id ? 'Edit Bilik' : 'Tambah Bilik',
      body: wrap,
      actions: [
        { label: 'Batal', type: 'ghost' },
        { label: 'Simpan', type: 'primary', onClick: async () => {
          const name = wrap.querySelector('#bName').value.trim();
          if (!name) { UI.toast('Nama wajib', 'error'); return false; }
          try {
            const r = await API.post('save', { sheet: 'booths', row: { id: b.id || '', name, status: 'ready' } });
            if (!r.success) { UI.toast(r.message || 'Gagal', 'error'); return false; }
            UI.toast('Tersimpan', 'success');
            if (window.Cache) Cache.invalidate('booth.status', {});
            loadBooths();
          } catch (err) { UI.toast(err.message, 'error'); return false; }
        }}
      ]
    });
  }

  async function freeBooth(id) {
    const ok = await UI.confirm('Kosongkan bilik ini?', { danger: true });
    if (!ok) return;
    try {
      const r = await API.post('booth.setCurrent', { boothId: id, voterId: '' });
      if (!r.success) { UI.toast(r.message || 'Gagal', 'error'); return; }
      UI.toast('Bilik dikosongkan', 'success');
      loadBooths();
    } catch (err) { UI.toast(err.message, 'error'); }
  }

  async function deleteBooth(id) {
    const ok = await UI.confirm('Hapus bilik ini?', { danger: true });
    if (!ok) return;
    try {
      const r = await API.post('delete', { sheet: 'booths', id });
      if (!r.success) { UI.toast(r.message || 'Gagal', 'error'); return; }
      UI.toast('Terhapus', 'success');
      if (window.Cache) Cache.invalidate('booth.status', {});
      loadBooths();
    } catch (err) { UI.toast(err.message, 'error'); }
  }

  /* ============================================================
   *  USERS
   * ============================================================ */
  async function users() {
    clearAllPolls();
    cleanupSignPad();
    safeQRStop();

    const el = view();
    if (!el) return;
    el.innerHTML = `
      <div class="card">
        <div class="row-between">
          <div>
            <h3>Pengguna Sistem</h3>
            <p class="hint">Kelola akun admin, petugas, dan bilik.</p>
          </div>
          <button class="btn-primary btn-sm" id="btnAddUser" type="button">+ Tambah</button>
        </div>
        <div id="userList" style="margin-top:12px">${UI.skeleton(3)}</div>
      </div>
    `;
    const btnAdd = document.getElementById('btnAddUser');
    if (btnAdd) btnAdd.onclick = () => editUser(null);
    await loadUsers();
  }

  async function loadUsers() {
    const area = document.getElementById('userList');
    if (!area) return;

    let r;
    try { r = await API.post('list', { sheet: 'users' }); }
    catch (err) { area.innerHTML = `<p class="hint" style="color:var(--err)">${esc(err.message)}</p>`; return; }
    if (!r.success) { area.innerHTML = `<p class="hint" style="color:var(--err)">${esc(r.message)}</p>`; return; }

    const list = r.data || [];
    if (!list.length) {
      area.innerHTML = `<p class="hint">Belum ada pengguna.</p>`;
      return;
    }

    area.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Username</th><th>Nama</th><th>Role</th><th>Status</th><th>Aksi</th></tr>
          </thead>
          <tbody>
            ${list.map(u => `
              <tr>
                <td><code>${esc(u.username)}</code></td>
                <td>${esc(u.name || '-')}</td>
                <td><span class="badge info">${esc(u.role || '-')}</span></td>
                <td>${isTrue(u.active)
                  ? '<span class="badge ok">Aktif</span>'
                  : '<span class="badge danger">Nonaktif</span>'}</td>
                <td>
                  <button class="btn-ghost btn-sm" type="button"
                    onclick="ViewsAdmin.editUser('${esc(u.id)}')">✏️</button>
                  <button class="btn-danger btn-sm" type="button"
                    onclick="ViewsAdmin.deleteUser('${esc(u.id)}')">🗑️</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  async function editUser(id) {
    let u = { id: '', username: '', name: '', role: 'petugas', boothId: '', active: true };
    if (id) {
      try {
        const r = await API.post('list', { sheet: 'users', filter: { id } });
        if (r.success && r.data && r.data[0]) u = r.data[0];
      } catch (_) {}
    }

    let booths = [];
    try {
      const br = await API.post('list', { sheet: 'booths' });
      if (br.success) booths = br.data || [];
    } catch (_) {}

    const wrap = UI.el('div');
    wrap.innerHTML = `
      <label class="field"><span>Username *</span>
        <input class="input" id="uUser" value="${esc(u.username || '')}" ${id ? 'readonly' : ''}></label>
      <label class="field"><span>Nama Lengkap *</span>
        <input class="input" id="uName" value="${esc(u.name || '')}"></label>
      <label class="field"><span>Password ${id ? '(kosongkan jika tidak diubah)' : '*'}</span>
        <input class="input" id="uPass" type="password" placeholder="${id ? '••••••••' : 'Password baru'}"></label>
      <div class="grid-2">
        <label class="field"><span>Role</span>
          <select class="input" id="uRole">
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
            <option value="petugas" ${u.role === 'petugas' ? 'selected' : ''}>Petugas</option>
            <option value="bilik" ${u.role === 'bilik' ? 'selected' : ''}>Bilik</option>
          </select></label>
        <label class="field"><span>Bilik (jika role=bilik)</span>
          <select class="input" id="uBooth">
            <option value="">—</option>
            ${booths.map(b => `<option value="${esc(b.id)}" ${u.boothId === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
          </select></label>
      </div>
      <label class="remember-row">
        <input type="checkbox" id="uActive" ${isTrue(u.active) ? 'checked' : ''}> Aktif
      </label>
    `;

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
            boothId: wrap.querySelector('#uBooth').value,
            active: wrap.querySelector('#uActive').checked,
          };
          const pass = wrap.querySelector('#uPass').value;
          if (pass) row.password = pass;
          if (!row.username) { UI.toast('Username wajib', 'error'); return false; }
          if (!row.name) { UI.toast('Nama wajib', 'error'); return false; }
          if (!id && !pass) { UI.toast('Password wajib untuk user baru', 'error'); return false; }
          try {
            const r = await API.post('save', { sheet: 'users', row });
            if (!r.success) { UI.toast(r.message || 'Gagal', 'error'); return false; }
            UI.toast('Tersimpan', 'success');
            if (window.Cache) Cache.invalidate('list', { sheet: 'users' });
            loadUsers();
          } catch (err) { UI.toast(err.message, 'error'); return false; }
        }}
      ]
    });
  }

  async function deleteUser(id) {
    const ok = await UI.confirm('Hapus pengguna ini?', { danger: true });
    if (!ok) return;
    try {
      const r = await API.post('delete', { sheet: 'users', id });
      if (!r.success) { UI.toast(r.message || 'Gagal', 'error'); return; }
      UI.toast('Terhapus', 'success');
      if (window.Cache) Cache.invalidate('list', { sheet: 'users' });
      loadUsers();
    } catch (err) { UI.toast(err.message, 'error'); }
  }

  /* ============================================================
   *  INVITATIONS (Dengan Fitur Ekspor PDF & Pengaturan Halaman)
   * ============================================================ */
  async function invitations() {
    clearAllPolls();
    cleanupSignPad();
    safeQRStop();

    const el = view();
    if (!el) return;
    el.innerHTML = `
      <div class="card no-print">
        <div class="row-between">
          <div>
            <h3>Undangan Pemilih</h3>
            <p class="hint">Cetak atau ekspor undangan ke PDF.</p>
          </div>
          <div class="row" style="margin:0">
            <select class="input" id="invLayout" style="width:auto">
              <option value="layout-1">1 Per Halaman (A4)</option>
              <option value="layout-2" selected>2 Per Halaman (A5)</option>
              <option value="layout-4">4 Per Halaman (A6)</option>
              <option value="layout-6">6 Per Halaman (Custom)</option>
            </select>
            <button class="btn-ghost btn-sm" id="btnExportPdf" type="button">📄 Ekspor PDF</button>
            <button class="btn-primary btn-sm" id="btnPrint" type="button">🖨️ Cetak</button>
          </div>
        </div>
        <div class="row" style="margin-top:12px">
          <input class="input" id="invSearch" placeholder="Cari nama pemilih…" style="flex:1">
        </div>
      </div>
      
      <div id="invPrintArea" style="margin-top:16px; background:#e2e8f0; padding: 20px; overflow-x: auto;">
        ${UI.skeleton(3)}
      </div>
    `;

    const btnPrint = document.getElementById('btnPrint');
    const btnExportPdf = document.getElementById('btnExportPdf');
    const search = document.getElementById('invSearch');
    const layout = document.getElementById('invLayout');

    const triggerPrint = () => {
      setTimeout(() => window.print(), 100);
    };

    if (btnPrint) btnPrint.onclick = triggerPrint;
    if (btnExportPdf) btnExportPdf.onclick = () => {
      UI.toast('Pilih "Save as PDF" pada dialog cetak.', 'info');
      triggerPrint();
    };
    
    if (search) search.addEventListener('input', UI.debounce(() => loadInvitations(), 300));
    if (layout) layout.addEventListener('change', () => loadInvitations());

    await loadInvitations();
  }

  async function loadInvitations() {
    const area = document.getElementById('invPrintArea');
    if (!area) return;

    let vr, sr;
    try {
      [vr, sr] = await Promise.all([
        API.post('list', { sheet: 'voters' }),
        API.post('settings.public')
      ]);
    } catch (err) {
      area.innerHTML = `<p class="hint" style="color:var(--err)">${esc(err.message)}</p>`;
      return;
    }
    if (!vr.success) { area.innerHTML = `<p class="hint" style="color:var(--err)">${esc(vr.message)}</p>`; return; }

    const settings = (sr && sr.success && sr.data) || {};
    const signerName = settings.invitation_signer || 'Ketua Panitia';
    const signerSig = settings.invitation_signature || '';
    const eventName = settings.event_name || 'Pemilihan';
    const eventLoc = settings.event_location || '-';
    
    let formattedDate = '-';
    if (settings.election_date) {
      const d = new Date(settings.election_date);
      const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      const pad = (n) => String(n).padStart(2, '0');
      formattedDate = `${days[d.getDay()]}, ${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}`;
    }

    const q = (document.getElementById('invSearch') || {}).value || '';
    const kw = q.trim().toLowerCase();
    let list = vr.data || [];
    if (kw) list = list.filter(v => String(v.name || '').toLowerCase().indexOf(kw) !== -1);

    if (!list.length) {
      area.innerHTML = `<p class="hint" style="color:#000">Tidak ada pemilih.</p>`;
      return;
    }

    const layoutEl = document.getElementById('invLayout');
    const layoutClass = (layoutEl && layoutEl.value) || 'layout-2';

    let qrSize = 100;
    if (layoutClass === 'layout-4') qrSize = 80;
    if (layoutClass === 'layout-6') qrSize = 60;

    area.innerHTML = `<div class="invitations-sheet ${layoutClass}">
      ${list.map(v => {
        const signHtml = signerSig ? `<img src="${esc(signerSig)}" alt="TTD">` : '';
        
        return `
        <div class="invite">
          <div class="invite-inner">
            <div class="kop-surat">
              <img src="assets/logo.svg" alt="Logo RAS" onerror="this.style.display='none'">
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
                    <div class="qr-code-text">${esc(v.code || '-')}</div>
                  </div>
                  <div class="ttd-nama">Kode Pemilih</div>
                </div>
                
                <div class="ttd-box" style="width:45%;">
                  <div class="ttd-jabatan">Hormat kami,<br>${esc(signerName)}</div>
                  <div class="ttd-space">${signHtml}</div>
                  <div class="ttd-nama">( ${esc(signerName)} )</div>
                </div>
              </div>

            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;

    setTimeout(() => {
      list.forEach(v => {
        const container = document.getElementById('qr-' + v.id);
        if (container && window.QR) {
          try { QR.generate(container, v.code || v.id, qrSize); } catch (_) {}
        }
      });
    }, 100);
  }

  /* ============================================================
   *  RESULTS
   * ============================================================ */
  async function results() {
    clearAllPolls();
    cleanupSignPad();
    safeQRStop();

    const el = view();
    if (!el) return;
    el.innerHTML = `<div id="resultsArea">${UI.skeleton(4)}</div>`;
    await loadResults();
    setPoll('resultsArea', 5000, loadResults);
  }

  async function loadResults() {
    const area = document.getElementById('resultsArea');
    if (!area) return;

    let r;
    try { r = await API.post('results'); }
    catch (err) { area.innerHTML = `<p class="hint" style="color:var(--err)">${esc(err.message)}</p>`; return; }
    if (!r.success) { area.innerHTML = `<p class="hint" style="color:var(--err)">${esc(r.message)}</p>`; return; }

    const groups = r.groups || {};
    const totalVoted = r.totalVoted || 0;
    const totalVoters = r.totalVoters || 0;

    const LABELS = {
      ketua_rt: 'Ketua RT', ketua_pemuda: 'Ketua Pemuda',
      wakil_pemuda: 'Wakil Ketua Pemuda', ketua_wakil_pemuda: 'Ketua & Wakil Pemuda',
    };

    area.innerHTML = `
      <div class="grid-3">
        <div class="stat"><small>Total Pemilih</small><h3>${totalVoters}</h3></div>
        <div class="stat"><small>Sudah Memilih</small><h3>${totalVoted}</h3></div>
        <div class="stat"><small>Partisipasi</small><h3>${UI.formatPercent(totalVoted, totalVoters || 1)}</h3></div>
      </div>

      <div class="card">
        <div class="row-between">
          <h3>Hasil Perolehan Suara</h3>
          <span class="hint">${UI.formatTime(new Date())}</span>
        </div>
        ${Object.keys(groups).length === 0
          ? `<p class="hint" style="margin-top:12px">Belum ada data.</p>`
          : Object.keys(groups).map(pos => {
              const items = groups[pos];
              const total = items.reduce((s, c) => s + (c.votes || 0), 0);
              return `
                <div class="res-group">
                  <h4>${esc(LABELS[pos] || pos)}</h4>
                  ${items.map(c => {
                    const pct = total ? Math.round((c.votes || 0) / total * 100) : 0;
                    return `
                      <div class="res-bar">
                        <div class="res-name">No. ${esc(c.noUrut || '-')} • ${esc(c.name)}</div>
                        <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
                        <div class="res-count">${c.votes || 0}</div>
                      </div>`;
                  }).join('')}
                </div>`;
            }).join('')}
      </div>
    `;
  }

  /* ============================================================
   *  BERITA ACARA
   * ============================================================ */
  async function beritaAcara() {
    clearAllPolls();
    cleanupSignPad();
    safeQRStop();

    const el = view();
    if (!el) return;
    el.innerHTML = `
      <div class="card">
        <div class="row-between">
          <div>
            <h3>Berita Acara</h3>
            <p class="hint">Catat hasil & kejadian penting.</p>
          </div>
          <button class="btn-primary btn-sm" id="btnNewBa" type="button">+ Buat</button>
        </div>
        <div id="baList" style="margin-top:12px">${UI.skeleton(3)}</div>
      </div>
    `;
    const btnNew = document.getElementById('btnNewBa');
    if (btnNew) btnNew.onclick = () => createBa();
    await loadBa();
  }

  async function loadBa() {
    const area = document.getElementById('baList');
    if (!area) return;

    let r;
    try { r = await API.post('ba.list'); }
    catch (err) { area.innerHTML = `<p class="hint" style="color:var(--err)">${esc(err.message)}</p>`; return; }
    if (!r.success) { area.innerHTML = `<p class="hint" style="color:var(--err)">${esc(r.message)}</p>`; return; }

    const list = (r.data || []).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    if (!list.length) { area.innerHTML = `<p class="hint">Belum ada berita acara.</p>`; return; }

    area.innerHTML = list.map(ba => `
      <div class="ba-item">
        <strong>${esc(ba.title || 'Berita Acara')}</strong>
        <small>${esc(ba.createdAt ? UI.formatDateTime(ba.createdAt) : '-')} • ${esc(ba.createdBy || '-')}</small>
        <pre>${esc(ba.content || '')}</pre>
      </div>
    `).join('');
  }

  async function createBa() {
    const wrap = UI.el('div');
    wrap.innerHTML = `
      <label class="field"><span>Judul</span>
        <input class="input" id="baTitle" value="Berita Acara Pemilihan"></label>
      <label class="field"><span>Isi</span>
        <textarea class="input" id="baContent" rows="8"></textarea></label>
    `;

    try {
      const r = await API.post('results');
      if (r.success) {
        const groups = r.groups || {};
        let txt = `Pada hari ini, telah dilaksanakan pemilihan.\n\n`;
        txt += `Total pemilih: ${r.totalVoters}\n`;
        txt += `Sudah memilih: ${r.totalVoted}\n\n`;
        Object.keys(groups).forEach(pos => {
          txt += `Hasil ${pos}:\n`;
          groups[pos].forEach(c => {
            txt += `- ${c.name} (No. ${c.noUrut}): ${c.votes} suara\n`;
          });
          txt += '\n';
        });
        const ta = wrap.querySelector('#baContent');
        if (ta) ta.value = txt;
      }
    } catch (_) {}

    UI.modal({
      title: 'Buat Berita Acara',
      body: wrap,
      size: 'lg',
      actions: [
        { label: 'Batal', type: 'ghost' },
        { label: 'Simpan', type: 'primary', onClick: async () => {
          const title = wrap.querySelector('#baTitle').value.trim();
          const content = wrap.querySelector('#baContent').value.trim();
          if (!title) { UI.toast('Judul wajib', 'error'); return false; }
          try {
            const r = await API.post('ba.save', {
              title, content,
              createdBy: (me() || {}).username || '-',
            });
            if (!r.success) { UI.toast(r.message || 'Gagal', 'error'); return false; }
            UI.toast('Tersimpan', 'success');
            if (window.Cache) Cache.invalidate('ba.list', {});
            loadBa();
          } catch (err) { UI.toast(err.message, 'error'); return false; }
        }}
      ]
    });
  }

  /* ============================================================
   *  SETTINGS
   * ============================================================ */
  async function settings() {
    clearAllPolls();
    cleanupSignPad();
    safeQRStop();

    const el = view();
    if (!el) return;
    el.innerHTML = `
      <div class="card">
        <h3>Pengaturan Sistem</h3>
        <p class="hint">Konfigurasi umum aplikasi.</p>
        <div id="settingsForm" style="margin-top:12px">${UI.skeleton(3)}</div>
      </div>
    `;
    await loadSettings();
  }

  async function loadSettings() {
    const area = document.getElementById('settingsForm');
    if (!area) return;

    let r;
    try { r = await API.post('list', { sheet: 'settings' }); }
    catch (err) { area.innerHTML = `<p class="hint" style="color:var(--err)">${esc(err.message)}</p>`; return; }
    if (!r.success) { area.innerHTML = `<p class="hint" style="color:var(--err)">${esc(r.message)}</p>`; return; }

    const map = {};
    (r.data || []).forEach(s => { map[s.key] = s.value; });

    const electionDate = map.election_date
      ? new Date(map.election_date).toISOString().slice(0, 16)
      : '';

    area.innerHTML = `
      <label class="field"><span>Nama Event</span>
        <input class="input" id="sEventName" value="${esc(map.event_name || '')}"></label>
      <label class="field"><span>Lokasi</span>
        <input class="input" id="sEventLoc" value="${esc(map.event_location || '')}"></label>
      <label class="field"><span>Tanggal Pemilihan</span>
        <input class="input" id="sElectionDate" type="datetime-local" value="${electionDate}"></label>
      <label class="field"><span>Nama Penandatangan Undangan</span>
        <input class="input" id="sSigner" value="${esc(map.invitation_signer || '')}"></label>
      <label class="field"><span>Tanda Tangan Digital</span>
        <div id="sigPadSettings" style="max-width:600px"></div></label>
      <div class="row">
        <button class="btn-ghost btn-sm" id="btnSigClear" type="button">🧹 Hapus TTD</button>
        <button class="btn-ghost btn-sm" id="btnSigUpload" type="button">📎 Upload TTD</button>
        <input type="file" id="sigFileInput" accept="image/*" style="display:none">
      </div>
      <div class="row" style="margin-top:16px">
        <button class="btn-primary" id="btnSaveSettings" type="button">💾 Simpan</button>
      </div>
    `;

    const padHost = document.getElementById('sigPadSettings');
    if (padHost && window.Sign) {
      try {
        sigPad = Sign.mount(padHost);
        if (map.invitation_signature) {
          const img = new Image();
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
    if (btnClear) btnClear.onclick = () => sigPad && sigPad.clear();

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
      };

      for (const key of Object.keys(updates)) {
        try {
          await API.post('settings.save', { key, value: updates[key] });
        } catch (_) {}
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
      if (window.Cache) Cache.invalidate('list', { sheet: 'settings' });
    } catch (err) {
      UI.toast('Error: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan'; }
    }
  }

  /* ============================================================
   *  EXPORTS
   * ============================================================ */
  return {
    dashboard,
    voters,
    candidates,
    booths,
    users,
    invitations,
    results,
    beritaAcara,
    settings,
    editVoter,
    deleteVoter,
    editCandidate,
    deleteCandidate,
    editBooth,
    freeBooth,
    deleteBooth,
    editUser,
    deleteUser,
    _clearAllPolls: function () {
      clearAllPolls();
      cleanupSignPad();
      safeQRStop();
    },
  };
})();