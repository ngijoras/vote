/* ============================================================
   E-VOTE • views-admin.js — FULL FIX
   Semua menu admin berfungsi tanpa error
   ============================================================ */
window.ViewsAdmin = (function () {
  'use strict';

  const view = () => document.getElementById('view');
  const esc  = (s) => UI.escapeHtml(s == null ? '' : String(s));
  const isTrue = (v) => v === true || String(v) === 'TRUE' || String(v) === 'true';
  const fmtDate = (d) => {
    if (!d) return '-';
    try { return new Date(d).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }); }
    catch (_) { return String(d); }
  };
  const toLocalDT = (iso) => {
    if (!iso) return '';
    const d = new Date(iso); if (isNaN(d.getTime())) return '';
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  /* ---------- Polling ---------- */
  const polls = {};
  function setPoll(id, ms, fn) {
    clearPoll(id);
    polls[id] = setInterval(() => {
      if (!document.getElementById(id)) { clearPoll(id); return; }
      try { fn(); } catch (e) { console.error('[poll]', e); }
    }, ms);
  }
  function clearPoll(id) { if (polls[id]) { clearInterval(polls[id]); delete polls[id]; } }
  function clearAllPolls() {
    Object.keys(polls).forEach(clearPoll);
    if (sigPad && sigPad.destroy) { try { sigPad.destroy(); } catch (_) {} }
    sigPad = null;
  }

  /* ---------- State ---------- */
  let votersData = [], candidatesData = [], boothsData = [], usersData = [], baData = [];
  let settingsCache = {};
  let sigPad = null;
  let currentSigData = '';

  /* ============================================================
   *  MODAL HELPER
   * ============================================================ */
  function createModal(id, title, bodyHtml, onConfirm) {
    const existing = document.getElementById('modal-' + id);
    if (existing) existing.remove();

    const bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.id = 'modal-' + id;
    bd.innerHTML = `
      <div class="modal modal-lg">
        <div class="modal-head">
          <h3>${esc(title)}</h3>
          <button class="modal-close" type="button">×</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        <div class="modal-foot">
          <button class="btn-ghost" type="button" data-cancel>Batal</button>
          <button class="btn-primary" type="button" data-confirm>Simpan</button>
        </div>
      </div>`;
    document.body.appendChild(bd);
    requestAnimationFrame(() => bd.classList.add('show'));

    const close = () => { bd.classList.remove('show'); setTimeout(() => bd.remove(), 250); };
    bd.querySelector('.modal-close').onclick = close;
    bd.querySelector('[data-cancel]').onclick = close;
    bd.addEventListener('click', e => { if (e.target === bd) close(); });

    const confirmBtn = bd.querySelector('[data-confirm]');
    confirmBtn.onclick = async () => {
      confirmBtn.disabled = true;
      const prev = confirmBtn.textContent;
      confirmBtn.textContent = 'Menyimpan…';
      try {
        const ok = await onConfirm();
        if (ok) close();
      } catch (err) {
        console.error(err);
        UI.toast(err.message || 'Terjadi kesalahan', 'error');
      }
      confirmBtn.disabled = false;
      confirmBtn.textContent = prev;
    };
    return close;
  }

  /* ============================================================
   *  1. DASHBOARD
   * ============================================================ */
  async function dashboard() {
    clearAllPolls();
    const el = view();
    el.innerHTML = `
      <div class="card">
        <div class="row-between">
          <h3>Ringkasan Sistem</h3>
          <button class="btn-ghost btn-sm" id="btnDashRefresh" type="button">🔄 Refresh</button>
        </div>
        <div id="dashGrid" class="grid-3" style="margin-top:12px">${UI.skeleton(6)}</div>
      </div>
      <div class="grid-2">
        <div class="card">
          <h3>Aksi Cepat</h3>
          <div class="row">
            <a href="#/admin/voters" class="btn-primary">👥 Data Pemilih</a>
            <a href="#/admin/candidates" class="btn-ghost">🏅 Data Calon</a>
            <a href="#/admin/invitations" class="btn-ghost">✉️ Cetak Undangan</a>
            <a href="#/admin/results" class="btn-ghost">📈 Lihat Hasil</a>
          </div>
        </div>
        <div class="card">
          <div class="row-between">
            <h3>Status Bilik</h3>
            <span class="hint" id="dashTime">—</span>
          </div>
          <div id="dashBooths" style="margin-top:12px">${UI.skeleton(2)}</div>
        </div>
      </div>
      <div class="card">
        <div class="row-between">
          <h3>Aktivitas Check-in Terbaru</h3>
          <span class="badge info" id="dashActivityCount">—</span>
        </div>
        <div id="dashActivity" style="margin-top:12px">${UI.skeleton(3)}</div>
      </div>`;
    document.getElementById('btnDashRefresh').onclick = loadDashboard;
    await loadDashboard();
    setPoll('dashGrid', 5000, loadDashboard);
  }

  async function loadDashboard() {
    const tEl = document.getElementById('dashTime');
    if (tEl) tEl.textContent = UI.formatTime(new Date());

    const [sum, bRes, vRes] = await Promise.all([
      API.post('dash.summary'),
      API.post('booth.status'),
      API.post('list', { sheet: 'voters' }),
    ]);
    if (!sum.success) return;
    const d = sum.data || {};

    const grid = document.getElementById('dashGrid');
    if (grid) {
      grid.innerHTML = `
        <div class="stat"><small>Total Pemilih</small><h3>${d.totalVoters || 0}</h3></div>
        <div class="stat"><small>Sudah Memilih</small><h3>${d.voted || 0}</h3></div>
        <div class="stat"><small>Belum Memilih</small><h3>${(d.totalVoters || 0) - (d.voted || 0)}</h3></div>
        <div class="stat"><small>Bilik Siap</small><h3>${d.boothsReady || 0}</h3></div>
        <div class="stat"><small>Bilik Terisi</small><h3>${d.boothsOccupied || 0}</h3></div>
        <div class="stat"><small>Calon Aktif</small><h3>${d.candidates || 0}</h3></div>`;
    }

    const booths = bRes.success ? (bRes.data || []) : [];
    const boothsEl = document.getElementById('dashBooths');
    if (boothsEl) {
      boothsEl.innerHTML = booths.length === 0
        ? `<p class="hint">Belum ada bilik.</p>`
        : booths.map(b => `
            <div class="booth-row ${b.currentVoterId ? 'occupied' : 'ready'}">
              <strong>${esc(b.name)}</strong>
              <span class="badge ${b.currentVoterId ? 'occupied' : 'ready'}">${b.currentVoterId ? 'Terisi' : 'Siap'}</span>
            </div>`).join('');
    }

    const voters = vRes.success ? (vRes.data || []) : [];
    const recent = voters.filter(v => v.checkinAt)
      .sort((a, b) => new Date(b.checkinAt) - new Date(a.checkinAt)).slice(0, 8);
    const actEl = document.getElementById('dashActivity');
    const cntEl = document.getElementById('dashActivityCount');
    if (cntEl) cntEl.textContent = recent.length + ' terbaru';
    if (actEl) {
      actEl.innerHTML = recent.length === 0
        ? `<p class="hint">Belum ada aktivitas check-in.</p>`
        : recent.map(v => `
            <div class="booth-row">
              <strong>${esc(v.name)}</strong>
              <span class="hint">${esc(v.code)}</span>
              <span class="hint" style="margin-left:auto">${fmtDate(v.checkinAt)}</span>
            </div>`).join('');
    }
  }

  /* ============================================================
   *  2. VOTERS
   * ============================================================ */
  async function voters() {
    clearAllPolls();
    const el = view();
    el.innerHTML = `
      <div class="card">
        <div class="row-between">
          <div>
            <h3>Data Pemilih</h3>
            <p class="hint">Kelola daftar pemilih terdaftar.</p>
          </div>
          <div class="row" style="margin:0">
            <button class="btn-ghost btn-sm" id="btnVoterBulk" type="button">📤 Bulk Import</button>
            <button class="btn-primary btn-sm" id="btnVoterAdd" type="button">+ Tambah</button>
          </div>
        </div>
        <div class="row" style="margin-top:12px">
          <input class="input" id="voterSearch" placeholder="🔍 Cari nama / kode / RT…" style="flex:1;min-width:200px">
          <button class="btn-ghost" id="btnVoterRefresh" type="button">🔄 Refresh</button>
        </div>
        <div id="voterTable" class="table-wrap" style="margin-top:12px">${UI.skeleton(5)}</div>
      </div>`;
    document.getElementById('btnVoterAdd').onclick = () => showVoterForm();
    document.getElementById('btnVoterBulk').onclick = showBulkImport;
    document.getElementById('btnVoterRefresh').onclick = loadVoters;
    document.getElementById('voterSearch').addEventListener('input', renderVotersTable);
    await loadVoters();
  }

  async function loadVoters() {
    const r = await API.post('list', { sheet: 'voters' });
    if (!r.success) { UI.toast(r.message || 'Gagal', 'error'); return; }
    votersData = r.data || [];
    renderVotersTable();
  }

  function renderVotersTable() {
    const el = document.getElementById('voterTable');
    if (!el) return;
    const term = (document.getElementById('voterSearch')?.value || '').toLowerCase().trim();
    const filtered = term
      ? votersData.filter(v =>
          String(v.name || '').toLowerCase().includes(term) ||
          String(v.code || '').toLowerCase().includes(term) ||
          String(v.rt || '').includes(term) || String(v.rw || '').includes(term))
      : votersData;

    if (!filtered.length) {
      el.innerHTML = `<p class="hint" style="padding:16px;text-align:center">Tidak ada data pemilih.</p>`;
      return;
    }
    el.innerHTML = `
      <table>
        <thead><tr>
          <th>Kode</th><th>Nama</th><th>RT/RW</th><th>Status</th><th>Check-in</th>
          <th style="text-align:right">Aksi</th>
        </tr></thead>
        <tbody>${filtered.map(v => `
          <tr>
            <td><code>${esc(v.code)}</code></td>
            <td><strong>${esc(v.name)}</strong></td>
            <td>${esc(v.rt || '-')}/${esc(v.rw || '-')}</td>
            <td>${isTrue(v.voted)
              ? '<span class="badge ok">Sudah Memilih</span>'
              : v.checkinAt ? '<span class="badge warn">Sudah Absen</span>'
                            : '<span class="badge">Belum Hadir</span>'}</td>
            <td class="hint">${v.checkinAt ? fmtDate(v.checkinAt) : '-'}</td>
            <td style="text-align:right">
              <button class="btn-ghost btn-sm" onclick="ViewsAdmin.editVoter('${esc(v.id)}')">Edit</button>
              <button class="btn-danger btn-sm" onclick="ViewsAdmin.deleteVoter('${esc(v.id)}')">Hapus</button>
            </td>
          </tr>`).join('')}</tbody>
      </table>`;
  }

  function showVoterForm(voter) {
    voter = voter || {};
    createModal('voter-form', voter.id ? 'Edit Pemilih' : 'Tambah Pemilih', `
      <label class="field"><span>Nama *</span><input class="input" id="vf_name" value="${esc(voter.name || '')}"></label>
      <label class="field"><span>Kode Pemilih (kosongkan untuk otomatis)</span><input class="input" id="vf_code" value="${esc(voter.code || '')}"></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <label class="field"><span>RT</span><input class="input" id="vf_rt" value="${esc(voter.rt || '')}"></label>
        <label class="field"><span>RW</span><input class="input" id="vf_rw" value="${esc(voter.rw || '')}"></label>
      </div>
      <label class="field"><span>Alamat</span><input class="input" id="vf_address" value="${esc(voter.address || '')}"></label>
      <label class="field"><span>Telepon</span><input class="input" id="vf_phone" value="${esc(voter.phone || '')}"></label>`,
      async () => {
        const name = document.getElementById('vf_name').value.trim();
        if (!name) { UI.toast('Nama wajib diisi', 'warn'); return false; }
        const row = Object.assign({}, voter, {
          id: voter.id || '',
          name,
          code: document.getElementById('vf_code').value.trim(),
          rt: document.getElementById('vf_rt').value.trim(),
          rw: document.getElementById('vf_rw').value.trim(),
          address: document.getElementById('vf_address').value.trim(),
          phone: document.getElementById('vf_phone').value.trim(),
        });
        const r = await API.post('save', { sheet: 'voters', row });
        if (r.success) { UI.toast('Pemilih disimpan', 'success'); await loadVoters(); return true; }
        UI.toast(r.message || 'Gagal', 'error'); return false;
      });
  }

  function editVoter(id) {
    const v = votersData.find(x => String(x.id) === String(id));
    if (v) showVoterForm(v);
  }

  async function deleteVoter(id) {
    const v = votersData.find(x => String(x.id) === String(id));
    if (!v) return;
    if (!(await UI.confirm(`Hapus pemilih "${v.name}"?`, { danger: true }))) return;
    const r = await API.post('delete', { sheet: 'voters', id });
    if (r.success) { UI.toast('Pemilih dihapus', 'success'); await loadVoters(); }
    else UI.toast(r.message || 'Gagal', 'error');
  }

  function showBulkImport() {
    createModal('bulk-import', 'Bulk Import Pemilih', `
      <p class="hint">Format: satu pemilih per baris, kolom dipisah koma.<br>
        <code>Nama,Kode,RT,RW,Alamat,Telepon</code><br>
        Kode boleh dikosongkan (otomatis).</p>
      <label class="field">
        <span>Data CSV</span>
        <textarea id="bulkData" rows="8" placeholder="Budi Santoso,,01,02,Jl. Mawar,08123
Siti Aminah,V002,01,02,Jl. Melati,"></textarea>
      </label>`,
      async () => {
        const text = document.getElementById('bulkData').value.trim();
        if (!text) { UI.toast('Data kosong', 'warn'); return false; }
        const rows = text.split('\n').filter(l => l.trim()).map(line => {
          const [name, code, rt, rw, address, phone] = line.split(',').map(s => (s || '').trim());
          return { name, code, rt, rw, address, phone };
        }).filter(r => r.name);
        if (!rows.length) { UI.toast('Tidak ada baris valid', 'warn'); return false; }
        const r = await API.post('voters.bulk', { rows });
        if (r.success) { UI.toast(`${r.added} ditambahkan, ${r.skipped} dilewati`, 'success'); await loadVoters(); return true; }
        UI.toast(r.message || 'Gagal', 'error'); return false;
      });
  }

  /* ============================================================
   *  3. CANDIDATES
   * ============================================================ */
  async function candidates() {
    clearAllPolls();
    const el = view();
    el.innerHTML = `
      <div class="card">
        <div class="row-between">
          <div><h3>Data Calon</h3><p class="hint">Kelola kandidat per posisi.</p></div>
          <button class="btn-primary btn-sm" id="btnCandAdd" type="button">+ Tambah Calon</button>
        </div>
        <div id="candGrouped" style="margin-top:16px">${UI.skeleton(3)}</div>
      </div>`;
    document.getElementById('btnCandAdd').onclick = () => showCandidateForm();
    await loadCandidates();
  }

  async function loadCandidates() {
    const r = await API.post('list', { sheet: 'candidates' });
    if (!r.success) return;
    candidatesData = r.data || [];
    renderCandidates();
  }

  function renderCandidates() {
    const el = document.getElementById('candGrouped');
    if (!el) return;
    const groups = { ketua_rt: [], ketua_pemuda: [], wakil_pemuda: [] };
    candidatesData.forEach(c => {
      const pos = String(c.position || 'lainnya');
      groups[pos] = groups[pos] || [];
      groups[pos].push(c);
    });
    const labels = { ketua_rt: 'Ketua RT', ketua_pemuda: 'Ketua Pemuda', wakil_pemuda: 'Wakil Pemuda' };

    el.innerHTML = ['ketua_rt', 'ketua_pemuda', 'wakil_pemuda'].map(pos => {
      const list = (groups[pos] || []).sort((a, b) => (Number(a.noUrut) || 0) - (Number(b.noUrut) || 0));
      return `<div class="pos-group">
        <h4>${labels[pos] || pos}</h4>
        ${list.length === 0 ? `<p class="hint">Belum ada calon.</p>`
          : `<div class="cand-list">${list.map(c => `
              <div class="cand-item">
                ${c.photoUrl
                  ? `<img src="${esc(c.photoUrl)}" alt="">`
                  : `<div style="width:52px;height:52px;border-radius:50%;background:#e2e8f0;display:grid;place-items:center;flex-shrink:0">👤</div>`}
                <div style="flex:1;min-width:0">
                  <strong>No. ${esc(c.noUrut || '-')} — ${esc(c.name)}</strong>
                  <span class="hint" style="display:block">${isTrue(c.active) ? '✅ Aktif' : '⏸ Nonaktif'}</span>
                </div>
                <div style="display:flex;gap:4px">
                  <button class="btn-ghost btn-sm" onclick="ViewsAdmin.editCandidate('${esc(c.id)}')">✎</button>
                  <button class="btn-danger btn-sm" onclick="ViewsAdmin.deleteCandidate('${esc(c.id)}')">🗑</button>
                </div>
              </div>`).join('')}</div>`}
      </div>`;
    }).join('');
  }

  function showCandidateForm(c) {
    c = c || {};
    createModal('cand-form', c.id ? 'Edit Calon' : 'Tambah Calon', `
      <label class="field"><span>Posisi *</span>
        <select id="cf_pos" class="input">
          <option value="ketua_rt" ${c.position === 'ketua_rt' ? 'selected' : ''}>Ketua RT</option>
          <option value="ketua_pemuda" ${c.position === 'ketua_pemuda' ? 'selected' : ''}>Ketua Pemuda</option>
          <option value="wakil_pemuda" ${c.position === 'wakil_pemuda' ? 'selected' : ''}>Wakil Pemuda</option>
        </select>
      </label>
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:12px">
        <label class="field"><span>No. Urut</span><input class="input" type="number" id="cf_no" value="${esc(c.noUrut || '')}"></label>
        <label class="field"><span>Nama *</span><input class="input" id="cf_name" value="${esc(c.name || '')}"></label>
      </div>
      <label class="field"><span>URL Foto</span><input class="input" id="cf_photo" value="${esc(c.photoUrl || '')}" placeholder="https://..."></label>
      <label class="field"><span>Visi</span><textarea id="cf_visi" rows="3">${esc(c.visi || '')}</textarea></label>
      <label class="field"><span>Misi (pisahkan dengan ;)</span><textarea id="cf_misi" rows="3">${esc(c.misi || '')}</textarea></label>
      <label style="display:flex;gap:8px;align-items:center;margin-top:8px">
        <input type="checkbox" id="cf_active" ${isTrue(c.active) || !c.id ? 'checked' : ''}>
        <span>Aktif</span>
      </label>`,
      async () => {
        const name = document.getElementById('cf_name').value.trim();
        if (!name) { UI.toast('Nama wajib', 'warn'); return false; }
        const row = Object.assign({}, c, {
          id: c.id || '',
          position: document.getElementById('cf_pos').value,
          noUrut: document.getElementById('cf_no').value,
          name,
          photoUrl: document.getElementById('cf_photo').value.trim(),
          visi: document.getElementById('cf_visi').value.trim(),
          misi: document.getElementById('cf_misi').value.trim(),
          active: document.getElementById('cf_active').checked,
        });
        const r = await API.post('save', { sheet: 'candidates', row });
        if (r.success) { UI.toast('Calon disimpan', 'success'); await loadCandidates(); return true; }
        UI.toast(r.message || 'Gagal', 'error'); return false;
      });
  }

  function editCandidate(id) {
    const c = candidatesData.find(x => String(x.id) === String(id));
    if (c) showCandidateForm(c);
  }
  async function deleteCandidate(id) {
    const c = candidatesData.find(x => String(x.id) === String(id));
    if (!c) return;
    if (!(await UI.confirm(`Hapus calon "${c.name}"?`, { danger: true }))) return;
    const r = await API.post('delete', { sheet: 'candidates', id });
    if (r.success) { UI.toast('Calon dihapus', 'success'); await loadCandidates(); }
    else UI.toast(r.message || 'Gagal', 'error');
  }

  /* ============================================================
   *  4. BOOTHS
   * ============================================================ */
  async function booths() {
    clearAllPolls();
    const el = view();
    el.innerHTML = `
      <div class="card">
        <div class="row-between">
          <div><h3>Manajemen Bilik</h3><p class="hint">Kelola bilik voting.</p></div>
          <button class="btn-primary btn-sm" id="btnBoothAdd" type="button">+ Tambah Bilik</button>
        </div>
        <div id="boothTable" style="margin-top:16px">${UI.skeleton(3)}</div>
      </div>`;
    document.getElementById('btnBoothAdd').onclick = () => showBoothForm();
    await loadBooths();
  }

  async function loadBooths() {
    const r = await API.post('booth.status');
    if (!r.success) return;
    boothsData = r.data || [];
    const el = document.getElementById('boothTable');
    if (!el) return;
    if (!boothsData.length) { el.innerHTML = `<p class="hint">Belum ada bilik.</p>`; return; }
    el.innerHTML = boothsData.map(b => `
      <div class="booth-row ${b.currentVoterId ? 'occupied' : 'ready'}">
        <strong>${esc(b.name)}</strong>
        <span class="badge ${b.currentVoterId ? 'occupied' : 'ready'}">${b.currentVoterId ? 'Terisi' : 'Siap'}</span>
        ${b.currentVoterId ? `<span class="hint" style="margin-left:auto">Voter: ${esc(b.currentVoterId.slice(0, 8))}…</span>` : ''}
        <div class="row" style="margin:0;margin-left:auto;gap:4px">
          <button class="btn-ghost btn-sm" onclick="ViewsAdmin.editBooth('${esc(b.id)}')">✎</button>
          <button class="btn-danger btn-sm" onclick="ViewsAdmin.deleteBooth('${esc(b.id)}')">🗑</button>
        </div>
      </div>`).join('');
  }

  function showBoothForm(b) {
    b = b || {};
    createModal('booth-form', b.id ? 'Edit Bilik' : 'Tambah Bilik', `
      <label class="field"><span>Nama Bilik *</span><input class="input" id="bf_name" value="${esc(b.name || '')}"></label>
      <label class="field"><span>Status</span>
        <select id="bf_status" class="input">
          <option value="ready" ${b.status === 'ready' || !b.id ? 'selected' : ''}>Ready</option>
          <option value="occupied" ${b.status === 'occupied' ? 'selected' : ''}>Occupied</option>
        </select>
      </label>`,
      async () => {
        const name = document.getElementById('bf_name').value.trim();
        if (!name) { UI.toast('Nama wajib', 'warn'); return false; }
        const row = Object.assign({}, b, {
          id: b.id || '',
          name,
          status: document.getElementById('bf_status').value,
          currentVoterId: b.currentVoterId || '',
          updatedAt: new Date().toISOString(),
        });
        const r = await API.post('save', { sheet: 'booths', row });
        if (r.success) { UI.toast('Bilik disimpan', 'success'); await loadBooths(); return true; }
        UI.toast(r.message || 'Gagal', 'error'); return false;
      });
  }

  function editBooth(id) {
    const b = boothsData.find(x => String(x.id) === String(id));
    if (b) showBoothForm(b);
  }
  async function deleteBooth(id) {
    const b = boothsData.find(x => String(x.id) === String(id));
    if (!b) return;
    if (!(await UI.confirm(`Hapus bilik "${b.name}"?`, { danger: true }))) return;
    const r = await API.post('delete', { sheet: 'booths', id });
    if (r.success) { UI.toast('Bilik dihapus', 'success'); await loadBooths(); }
    else UI.toast(r.message || 'Gagal', 'error');
  }

  /* ============================================================
   *  5. USERS
   * ============================================================ */
  async function users() {
    clearAllPolls();
    const el = view();
    el.innerHTML = `
      <div class="card">
        <div class="row-between">
          <div><h3>Pengguna Sistem</h3><p class="hint">Kelola akun admin, petugas, bilik.</p></div>
          <button class="btn-primary btn-sm" id="btnUserAdd" type="button">+ Tambah User</button>
        </div>
        <div id="userTable" class="table-wrap" style="margin-top:16px">${UI.skeleton(3)}</div>
      </div>`;
    document.getElementById('btnUserAdd').onclick = () => showUserForm();
    await loadUsers();
  }

  async function loadUsers() {
    const [uRes, bRes] = await Promise.all([
      API.post('list', { sheet: 'users' }),
      API.post('list', { sheet: 'booths' }),
    ]);
    if (!uRes.success) return;
    usersData = uRes.data || [];
    boothsData = bRes.success ? (bRes.data || []) : [];
    const el = document.getElementById('userTable');
    if (!el) return;
    if (!usersData.length) { el.innerHTML = `<p class="hint">Belum ada user.</p>`; return; }
    el.innerHTML = `
      <table>
        <thead><tr><th>Username</th><th>Nama</th><th>Role</th><th>Bilik</th><th>Status</th><th style="text-align:right">Aksi</th></tr></thead>
        <tbody>${usersData.map(u => {
          const booth = boothsData.find(b => String(b.id) === String(u.boothId));
          return `<tr>
            <td><code>${esc(u.username)}</code></td>
            <td><strong>${esc(u.name || '-')}</strong></td>
            <td><span class="badge info">${esc(u.role)}</span></td>
            <td>${booth ? esc(booth.name) : '-'}</td>
            <td>${truthy(u.active) ? '<span class="badge ok">Aktif</span>' : '<span class="badge">Nonaktif</span>'}</td>
            <td style="text-align:right">
              <button class="btn-ghost btn-sm" onclick="ViewsAdmin.editUser('${esc(u.id)}')">Edit</button>
              <button class="btn-danger btn-sm" onclick="ViewsAdmin.deleteUser('${esc(u.id)}')">Hapus</button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  }
  function truthy(v) { return v === true || String(v).toLowerCase() === 'true' || String(v) === '1'; }

  function showUserForm(u) {
    u = u || {};
    const boothOptions = boothsData.map(b =>
      `<option value="${esc(b.id)}" ${String(u.boothId) === String(b.id) ? 'selected' : ''}>${esc(b.name)}</option>`
    ).join('');
    createModal('user-form', u.id ? 'Edit User' : 'Tambah User', `
      <label class="field"><span>Username *</span><input class="input" id="uf_username" value="${esc(u.username || '')}" ${u.id ? 'readonly' : ''}></label>
      <label class="field"><span>Nama Lengkap *</span><input class="input" id="uf_name" value="${esc(u.name || '')}"></label>
      <label class="field"><span>Password ${u.id ? '(kosongkan jika tidak diubah)' : '*'}</span>
        <input class="input" type="password" id="uf_password" placeholder="${u.id ? '••••••' : 'Minimal 6 karakter'}"></label>
      <label class="field"><span>Role *</span>
        <select id="uf_role" class="input">
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
          <option value="petugas" ${u.role === 'petugas' ? 'selected' : ''}>Petugas</option>
          <option value="bilik" ${u.role === 'bilik' ? 'selected' : ''}>Bilik</option>
        </select>
      </label>
      <label class="field"><span>Bilik (untuk role bilik)</span>
        <select id="uf_booth" class="input">
          <option value="">— Tidak terhubung —</option>
          ${boothOptions}
        </select>
      </label>
      <label style="display:flex;gap:8px;align-items:center">
        <input type="checkbox" id="uf_active" ${truthy(u.active) || !u.id ? 'checked' : ''}>
        <span>Aktif</span>
      </label>`,
      async () => {
        const username = document.getElementById('uf_username').value.trim();
        const name = document.getElementById('uf_name').value.trim();
        const password = document.getElementById('uf_password').value;
        if (!username || !name) { UI.toast('Username dan nama wajib', 'warn'); return false; }
        if (!u.id && !password) { UI.toast('Password wajib untuk user baru', 'warn'); return false; }
        if (password && password.length < 6) { UI.toast('Password minimal 6 karakter', 'warn'); return false; }
        const row = Object.assign({}, u, {
          id: u.id || '',
          username,
          name,
          role: document.getElementById('uf_role').value,
          boothId: document.getElementById('uf_booth').value,
          active: document.getElementById('uf_active').checked,
        });
        if (password) row.password = password;
        const r = await API.post('save', { sheet: 'users', row });
        if (r.success) { UI.toast('User disimpan', 'success'); await loadUsers(); return true; }
        UI.toast(r.message || 'Gagal', 'error'); return false;
      });
  }

  function editUser(id) {
    const u = usersData.find(x => String(x.id) === String(id));
    if (u) showUserForm(u);
  }
  async function deleteUser(id) {
    const u = usersData.find(x => String(x.id) === String(id));
    if (!u) return;
    if (!(await UI.confirm(`Hapus user "${u.username}"?`, { danger: true }))) return;
    const r = await API.post('delete', { sheet: 'users', id });
    if (r.success) { UI.toast('User dihapus', 'success'); await loadUsers(); }
    else UI.toast(r.message || 'Gagal', 'error');
  }

  /* ============================================================
   *  6. INVITATIONS
   * ============================================================ */
  async function invitations() {
    clearAllPolls();
    const el = view();
    el.innerHTML = `
      <div class="card no-print">
        <div class="row-between">
          <div><h3>Cetak Undangan</h3><p class="hint">Generate undangan + QR Code per pemilih.</p></div>
          <button class="btn-primary" id="btnPrintInv" type="button">🖨️ Print A4</button>
        </div>
        <div class="row" style="margin-top:12px">
          <select class="input" id="invLayout" style="max-width:200px">
            <option value="layout-4">4 per halaman (A6)</option>
            <option value="layout-2">2 per halaman (A5)</option>
          </select>
          <input class="input" id="invFilter" placeholder="🔍 Filter nama / RT (kosongkan untuk semua)" style="flex:1;min-width:200px">
          <button class="btn-ghost" id="btnInvRefresh" type="button">🔄 Muat Ulang</button>
        </div>
        <p class="hint" style="margin-top:8px" id="invInfo">—</p>
      </div>
      <div id="invPrintArea"></div>`;
    document.getElementById('btnPrintInv').onclick = () => window.print();
    document.getElementById('btnInvRefresh').onclick = loadInvitations;
    document.getElementById('invFilter').addEventListener('input', () => renderInvitations());
    document.getElementById('invLayout').addEventListener('change', () => renderInvitations());
    await loadInvitations();
  }

  async function loadInvitations() {
    const [vRes, sRes] = await Promise.all([
      API.post('list', { sheet: 'voters' }),
      API.post('list', { sheet: 'settings' }),
    ]);
    if (!vRes.success) { UI.toast('Gagal memuat pemilih', 'error'); return; }
    votersData = vRes.data || [];
    settingsCache = {};
    if (sRes.success) (sRes.data || []).forEach(s => { settingsCache[s.key] = s.value; });
    currentSigData = settingsCache.invitation_signature || '';
    renderInvitations();
  }

  function renderInvitations() {
    const area = document.getElementById('invPrintArea');
    const layout = document.getElementById('invLayout').value;
    const term = (document.getElementById('invFilter')?.value || '').toLowerCase().trim();
    if (!area) return;

    const filtered = term
      ? votersData.filter(v =>
          String(v.name || '').toLowerCase().includes(term) ||
          String(v.rt || '').includes(term) || String(v.rw || '').includes(term))
      : votersData;

    const info = document.getElementById('invInfo');
    if (info) info.textContent = `${filtered.length} undangan siap dicetak.`;

    if (!filtered.length) {
      area.innerHTML = `<div class="card"><p class="hint text-center" style="padding:20px">Tidak ada pemilih untuk ditampilkan.</p></div>`;
      return;
    }

    const evName   = settingsCache.event_name || 'Pemilihan Ketua RT / Pemuda';
    const evLoc    = settingsCache.event_location || 'Balai RW';
    const signer   = settingsCache.invitation_signer || 'Ketua Panitia';
    const isoDate  = settingsCache.election_date || '';
    let dateStr = '-', timeStr = '-';
    if (isoDate) {
      const d = new Date(isoDate);
      if (!isNaN(d.getTime())) {
        dateStr = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      }
    }
    const sigHtml = currentSigData
      ? `<img src="${esc(currentSigData)}" alt="TTD" onerror="this.style.display='none'">`
      : '';

    area.innerHTML = `
      <div class="invitations-sheet ${layout}">
        ${filtered.map((v, i) => `
          <div class="invite">
            <div class="invite-inner">
              <div class="kop-surat">
                <img src="assets/logo.svg" alt="Logo" onerror="this.style.display='none'">
                <div class="kop-text">
                  <div class="kop-title">PANITIA ${esc(evName.toUpperCase())}</div>
                  <div class="kop-sub">${esc(evLoc)}</div>
                </div>
              </div>
              <div class="surat-body">
                <div class="surat-header">
                  <div class="surat-tujuan">
                    <div>Kepada Yth.</div>
                    <div class="nama-pemilih">${esc(v.name)}</div>
                    <div>${v.address ? esc(v.address) : `RT ${esc(v.rt || '-')} / RW ${esc(v.rw || '-')}`}</div>
                  </div>
                </div>
                <div class="surat-isi">
                  <p>Dengan hormat, dalam rangka pelaksanaan <strong>${esc(evName)}</strong>, kami mengundang Bapak/Ibu/Saudara untuk hadir pada:</p>
                  <table class="surat-tabel">
                    <tr><td>Hari/Tanggal</td><td>:</td><td>${esc(dateStr)}</td></tr>
                    <tr><td>Waktu</td><td>:</td><td>${esc(timeStr)} WIB</td></tr>
                    <tr><td>Tempat</td><td>:</td><td>${esc(evLoc)}</td></tr>
                    <tr><td>Kode Pemilih</td><td>:</td><td><strong>${esc(v.code)}</strong></td></tr>
                  </table>
                  <p>Demikian undangan ini kami sampaikan. Atas perhatian dan kehadirannya kami ucapkan terima kasih.</p>
                </div>
                <div class="surat-ttd">
                  <div class="ttd-box">
                    <div class="ttd-jabatan">${esc(signer)}</div>
                    <div class="ttd-space">${sigHtml}</div>
                    <div class="ttd-nama">( ${esc(signer)} )</div>
                  </div>
                  <div class="qr-scan-wrapper">
                    <div class="qr-image" data-qr-text="${esc(v.code)}"></div>
                    <div class="qr-code-text">${esc(v.code)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>`).join('')}
      </div>`;

    if (typeof QRCode !== 'undefined') {
      area.querySelectorAll('[data-qr-text]').forEach(el => {
        try {
          el.innerHTML = '';
          new QRCode(el, { text: el.getAttribute('data-qr-text'), width: 85, height: 85, correctLevel: QRCode.CorrectLevel.M });
        } catch (e) { console.warn('[QR]', e); }
      });
    }
  }

  /* ============================================================
   *  7. RESULTS
   * ============================================================ */
  async function results() {
    clearAllPolls();
    const el = view();
    el.innerHTML = `
      <div class="card">
        <div class="row-between">
          <div><h3>Hasil Real-Time</h3><p class="hint" id="resTime">—</p></div>
          <button class="btn-ghost btn-sm" id="btnResRefresh" type="button">🔄 Refresh</button>
        </div>
        <div id="resStats" class="grid-3" style="margin-top:12px">${UI.skeleton(3)}</div>
        <div id="resBars" style="margin-top:20px">${UI.skeleton(4)}</div>
      </div>`;
    document.getElementById('btnResRefresh').onclick = loadResults;
    await loadResults();
    setPoll('resBars', 3000, loadResults);
  }

  async function loadResults() {
    const r = await API.post('results');
    if (!r.success) return;
    const tEl = document.getElementById('resTime');
    if (tEl) tEl.textContent = 'Update: ' + UI.formatTime(new Date());

    const stats = document.getElementById('resStats');
    if (stats) {
      stats.innerHTML = `
        <div class="stat"><small>Total Pemilih</small><h3>${r.totalVoters || 0}</h3></div>
        <div class="stat"><small>Sudah Memilih</small><h3>${r.totalVoted || 0}</h3></div>
        <div class="stat"><small>Partisipasi</small><h3>${r.totalVoters ? Math.round((r.totalVoted / r.totalVoters) * 100) : 0}%</h3></div>`;
    }

    const labels = { ketua_rt: 'Ketua RT', ketua_pemuda: 'Ketua Pemuda', wakil_pemuda: 'Wakil Pemuda' };
    const groups = r.groups || {};
    const bars = document.getElementById('resBars');
    if (bars) {
      const html = Object.keys(groups).map(pos => {
        const list = groups[pos] || [];
        const maxVotes = Math.max(1, ...list.map(c => c.votes || 0));
        return `<div class="res-group">
          <h4>${labels[pos] || pos}</h4>
          ${list.length === 0
            ? `<p class="hint">Belum ada calon.</p>`
            : list.map(c => {
                const pct = Math.round(((c.votes || 0) / maxVotes) * 100);
                return `<div class="res-bar">
                  <span class="res-name" title="${esc(c.name)}">${c.noUrut ? c.noUrut + '. ' : ''}${esc(c.name)}</span>
                  <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
                  <span class="res-count">${c.votes || 0}</span>
                </div>`;
              }).join('')}
        </div>`;
      }).join('');
      bars.innerHTML = html || `<p class="hint">Belum ada data.</p>`;
    }
  }

  /* ============================================================
   *  8. BERITA ACARA
   * ============================================================ */
  async function beritaAcara() {
    clearAllPolls();
    const el = view();
    el.innerHTML = `
      <div class="card">
        <div class="row-between">
          <div><h3>Berita Acara</h3><p class="hint">Catatan resmi hasil pemilihan.</p></div>
          <button class="btn-primary btn-sm" id="btnBAAdd" type="button">+ Buat BA Baru</button>
        </div>
        <div id="baList" style="margin-top:16px">${UI.skeleton(3)}</div>
      </div>`;
    document.getElementById('btnBAAdd').onclick = showBAForm;
    await loadBA();
  }

  async function loadBA() {
    const r = await API.post('ba.list');
    if (!r.success) return;
    baData = r.data || [];
    const el = document.getElementById('baList');
    if (!el) return;
    if (!baData.length) { el.innerHTML = `<p class="hint">Belum ada berita acara.</p>`; return; }
    el.innerHTML = baData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(ba => `
      <div class="ba-item">
        <strong>${esc(ba.title)}</strong>
        <small>${fmtDate(ba.createdAt)} • oleh ${esc(ba.createdBy || '-')}</small>
        <pre>${esc((ba.content || '').slice(0, 400))}${(ba.content || '').length > 400 ? '…' : ''}</pre>
      </div>`).join('');
  }

  function showBAForm() {
    const me = API.user() || {};
    createModal('ba-form', 'Buat Berita Acara', `
      <label class="field"><span>Judul *</span><input class="input" id="ba_title" value="Berita Acara Pemilihan" placeholder="Berita Acara Pemilihan"></label>
      <label class="field"><span>Isi Berita Acara *</span>
        <textarea id="ba_content" rows="10" placeholder="Pada hari ini... telah dilaksanakan pemungutan suara...&#10;&#10;Hasil perolehan suara:&#10;- Calon 1: X suara&#10;- Calon 2: Y suara"></textarea>
      </label>`,
      async () => {
        const title = document.getElementById('ba_title').value.trim();
        const content = document.getElementById('ba_content').value.trim();
        if (!title || !content) { UI.toast('Judul dan isi wajib', 'warn'); return false; }
        const r = await API.post('ba.save', { title, content, createdBy: me.name || me.username || '-' });
        if (r.success) { UI.toast('BA disimpan', 'success'); await loadBA(); return true; }
        UI.toast(r.message || 'Gagal', 'error'); return false;
      });
  }

  /* ============================================================
   *  9. SETTINGS
   * ============================================================ */
  async function settings() {
    clearAllPolls();
    const el = view();
    el.innerHTML = `<div class="card"><div id="settingsContent">${UI.skeleton(4)}</div></div>`;

    const r = await API.post('list', { sheet: 'settings' });
    settingsCache = {};
    if (r.success) (r.data || []).forEach(s => { settingsCache[s.key] = s.value; });
    currentSigData = settingsCache.invitation_signature || '';

    const content = document.getElementById('settingsContent');
    if (!content) return;

    const evName  = settingsCache.event_name || '';
    const evLoc   = settingsCache.event_location || '';
    const signer  = settingsCache.invitation_signer || '';
    const isoDate = settingsCache.election_date || '';

    content.innerHTML = `
      <div class="row-between">
        <div><h3>Pengaturan Sistem</h3><p class="hint">Konfigurasi umum & undangan.</p></div>
      </div>
      <form id="settingsForm" style="margin-top:16px">
        <label class="field"><span>Nama Acara</span>
          <input class="input" name="event_name" value="${esc(evName)}" placeholder="Pemilihan Ketua RT / Pemuda">
        </label>
        <label class="field"><span>Lokasi</span>
          <input class="input" name="event_location" value="${esc(evLoc)}" placeholder="Balai RW 02">
        </label>
        <label class="field"><span>Tanggal & Waktu Pemungutan</span>
          <input class="input" type="datetime-local" name="election_date" value="${toLocalDT(isoDate)}">
        </label>
        <label class="field"><span>Nama Penanda Tangan Undangan</span>
          <input class="input" name="invitation_signer" value="${esc(signer)}" placeholder="Ketua Panitia">
        </label>

        <hr>
        <h4>Tanda Tangan Undangan</h4>
        <p class="hint">Tanda tangan disimpan sebagai file di Google Drive (bebas limit).</p>
        <div id="sigPreviewWrap" style="margin-bottom:12px"></div>
        <div id="sigPadSettings" style="margin-top:8px"></div>
        <div class="row" style="margin-top:8px">
          <button class="btn-ghost btn-sm" type="button" id="btnSigClear">🧹 Hapus Coretan</button>
          <button class="btn-ghost btn-sm" type="button" id="btnSigRedraw">✏️ Gambar Ulang</button>
        </div>

        <hr>
        <div class="row">
          <button class="btn-primary" type="submit" id="btnSaveSettings">💾 Simpan Pengaturan</button>
        </div>
      </form>`;

    renderSigPreview();
    document.getElementById('btnSigRedraw').onclick = mountSigPad;
    document.getElementById('btnSigClear').onclick = () => { if (sigPad) sigPad.clear(); };
    document.getElementById('settingsForm').addEventListener('submit', saveSettings);
  }

  function renderSigPreview() {
    const wrap = document.getElementById('sigPreviewWrap');
    if (!wrap) return;
    wrap.innerHTML = currentSigData
      ? `<div class="hint">TTD tersimpan:</div>
         <img src="${esc(currentSigData)}" alt="TTD" style="max-height:80px;max-width:300px;border:1px solid var(--border);border-radius:6px;background:#fff;padding:4px">`
      : `<div class="hint">Belum ada TTD tersimpan.</div>`;
  }

  function mountSigPad() {
    if (sigPad && sigPad.destroy) { try { sigPad.destroy(); } catch (_) {} }
    sigPad = null;
    const host = document.getElementById('sigPadSettings');
    if (!host) return;
    host.innerHTML = '';
    try { sigPad = Sign.mount(host); }
    catch (e) { console.error('[sig mount]', e); UI.toast('Gagal memuat pad', 'error'); }
  }

  async function saveSettings(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSaveSettings');
    btn.disabled = true; const prev = btn.textContent; btn.textContent = 'Menyimpan…';

    const fd = new FormData(e.target);
    const dateVal = fd.get('election_date');
    let isoDate = '';
    if (dateVal) {
      const d = new Date(dateVal);
      if (!isNaN(d.getTime())) isoDate = d.toISOString();
    }

    try {
      /* 1) Simpan setting teks */
      await API.post('settings.save', { key: 'event_name',         value: fd.get('event_name') || '' });
      await API.post('settings.save', { key: 'event_location',     value: fd.get('event_location') || '' });
      await API.post('settings.save', { key: 'election_date',      value: isoDate });
      await API.post('settings.save', { key: 'invitation_signer',  value: fd.get('invitation_signer') || '' });

      /* 2) Upload TTD jika ada coretan baru */
      if (sigPad && !sigPad.isEmpty()) {
        const dataUrl = await sigPad.getBase64();
        const res = await API.post('settings.save', {
          key: 'invitation_signature',
          fileData: dataUrl,
        });
        if (res && res.success && res.data && res.data.value) {
          currentSigData = res.data.value;
          renderSigPreview();
          if (sigPad && sigPad.clear) sigPad.clear();
          UI.toast('✅ TTD berhasil diunggah ke Drive', 'success');
        } else {
          UI.toast('❌ Gagal upload TTD: ' + (res && res.message || 'unknown'), 'error');
        }
      }

      if (window.Cache) Cache.clearAll();
      UI.toast('Pengaturan disimpan', 'success');
    } catch (err) {
      console.error(err);
      UI.toast('Error: ' + (err.message || 'unknown'), 'error');
    }
    btn.disabled = false; btn.textContent = prev;
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
    deleteBooth,
    editUser,
    deleteUser,
    _clearAllPolls: clearAllPolls,
  };
})();