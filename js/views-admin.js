/* ============================================================
   E-VOTE • views-admin.js (FULL FIX)
   Role: ADMIN
   ============================================================ */
window.ViewsAdmin = (function () {
  'use strict';

  const view   = () => document.getElementById('view');
  const me     = () => API.user() || {};
  const isTrue = (v) => v === true || String(v) === 'TRUE' || String(v) === 'true';
  const esc    = (s) => UI.escapeHtml(s);

  async function fetchData(action, params, force) {
    if (window.Cache) return Cache.fetchApi(action, params, force);
    return API.post(action, params);
  }

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

  let sigPad = null;
  function cleanupSignPad() { try { if (sigPad && sigPad.destroy) sigPad.destroy(); } catch (_) {} sigPad = null; }
  function safeQRStop() { try { if (window.QR && QR.stop) QR.stop(); } catch (_) {} }

  /* DASHBOARD */
  async function dashboard() {
    clearAllPolls(); cleanupSignPad(); safeQRStop();
    const el = view(); if (!el) return;
    el.innerHTML = `<div id="adminDash">${UI.skeleton(4)}</div>`;
    await loadDashboard();
    setPoll('adminDash', 4000, loadDashboard);
  }

  async function loadDashboard() {
    const area = document.getElementById('adminDash'); if (!area) return;
    let sumRes, recentRes;
    try {
      [sumRes, recentRes] = await Promise.all([fetchData('dash.summary', {}), fetchData('list', { sheet: 'voters' })]);
    } catch (err) { return; }
    if (!sumRes || !sumRes.success) { return; }
    
    const d = sumRes.data || {};
    const voters = (recentRes && recentRes.data) || [];
    const recent = voters.filter(v => isTrue(v.voted)).sort((a, b) => String(b.checkinAt || '').localeCompare(String(a.checkinAt || ''))).slice(0, 5);

    area.innerHTML = `
      <div class="grid-3">
        <div class="stat"><small>Total Pemilih</small><h3>${d.totalVoters || 0}</h3></div>
        <div class="stat"><small>Sudah Memilih</small><h3>${d.voted || 0}</h3></div>
        <div class="stat"><small>Partisipasi</small><h3>${UI.formatPercent(d.voted || 0, d.totalVoters || 1)}</h3></div>
      </div>
      <div class="card">
        <div class="row-between"><h3>Pemilih Terbaru</h3><span class="hint">${UI.formatTime(new Date())}</span></div>
        <div style="margin-top:12px">
          ${recent.length === 0 ? `<p class="hint">Belum ada pemilih.</p>` : recent.map(v => `
            <div class="booth-row"><strong>${esc(v.name)}</strong><span class="badge ok" style="margin-left:auto">✓</span></div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /* VOTERS */
  async function voters() {
    clearAllPolls(); cleanupSignPad(); safeQRStop();
    const el = view(); if (!el) return;
    
    el.innerHTML = `
      <div class="card">
        <div class="row-between">
          <div><h3>Data Pemilih</h3></div>
          <div class="row" style="margin:0"><button class="btn-primary btn-sm" id="btnAddVoter">+ Tambah</button></div>
        </div>
        
        <div class="row" style="margin-top:12px; align-items:center;">
          <input class="input" id="voterSearch" placeholder="Cari nama / kode..." style="flex:2; min-width:200px;">
          <select class="input" id="voterFilterRt" style="flex:1; min-width:150px;">
            <option value="">Semua RT</option>
          </select>
        </div>
        
        <div id="voterList" style="margin-top:12px">${UI.skeleton(4)}</div>
      </div>
    `;
    
    document.getElementById('btnAddVoter').onclick = () => editVoter(null);
    document.getElementById('voterSearch').addEventListener('input', UI.debounce(() => loadVoters(), 300));
    document.getElementById('voterFilterRt').addEventListener('change', () => loadVoters());
    
    await loadVoters();
  }

  async function loadVoters() {
    const area = document.getElementById('voterList'); if (!area) return;
    let res = await fetchData('list', { sheet: 'voters' });
    if (!res || !res.success) return;
    
    let list = res.data || [];
    
    const filterRt = document.getElementById('voterFilterRt');
    if (filterRt && filterRt.options.length <= 1) {
      const rts = [...new Set(list.map(v => String(v.rt || '').trim()))].filter(rt => rt !== '').sort();
      rts.forEach(rt => {
        const opt = document.createElement('option');
        opt.value = rt;
        opt.textContent = `RT ${rt}`;
        filterRt.appendChild(opt);
      });
    }

    const keyword = (document.getElementById('voterSearch').value || '').trim().toLowerCase();
    const selectedRt = filterRt ? filterRt.value : '';

    if (keyword) {
      list = list.filter(v => 
        String(v.name || '').toLowerCase().includes(keyword) || 
        String(v.code || '').toLowerCase().includes(keyword)
      );
    }
    
    if (selectedRt) {
      list = list.filter(v => String(v.rt || '').trim() === selectedRt);
    }

    if (!list.length) { area.innerHTML = `<p class="hint">Tidak ada data pemilih yang sesuai.</p>`; return; }

    area.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Kode</th><th>Nama</th><th>RT/RW</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>
            ${list.map(v => `
              <tr>
                <td><code>${esc(v.code || '-')}</code></td>
                <td>${esc(v.name)}</td>
                <td>${esc(v.rt || '-')}/${esc(v.rw || '-')}</td>
                <td>${isTrue(v.voted) ? '<span class="badge ok">Memilih</span>' : v.checkinAt ? '<span class="badge warn">Absen</span>' : '<span class="badge">Belum</span>'}</td>
                <td style="white-space:nowrap;">
                  <button class="btn-ghost btn-sm" type="button" onclick="ViewsAdmin.editVoter('${esc(v.id)}')">✏️ Edit</button>
                  <button class="btn-danger btn-sm" type="button" onclick="ViewsAdmin.deleteVoter('${esc(v.id)}')">🗑️</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  async function editVoter(voterId) {
    let v = { id: '', code: '', name: '', rt: '', rw: '' };
    if (voterId) { try { const r = await fetchData('list', { sheet: 'voters', filter: { id: voterId } }); if (r.success && r.data) v = r.data[0]; } catch (_) {} }
    const wrap = UI.el('div');
    wrap.innerHTML = `
      <label class="field"><span>Kode</span><input class="input" id="fCode" value="${esc(v.code || '')}"></label>
      <label class="field"><span>Nama *</span><input class="input" id="fName" value="${esc(v.name || '')}"></label>
      <div class="grid-2"><label class="field"><span>RT</span><input class="input" id="fRt" value="${esc(v.rt || '')}"></label><label class="field"><span>RW</span><input class="input" id="fRw" value="${esc(v.rw || '')}"></label></div>
    `;
    UI.modal({
      title: voterId ? 'Edit Pemilih' : 'Tambah Pemilih', body: wrap,
      actions: [
        { label: 'Batal', type: 'ghost' },
        { label: 'Simpan', type: 'primary', onClick: async () => {
          const row = { id: v.id || '', code: wrap.querySelector('#fCode').value.trim(), name: wrap.querySelector('#fName').value.trim(), rt: wrap.querySelector('#fRt').value.trim(), rw: wrap.querySelector('#fRw').value.trim() };
          if (!row.name) return false;
          const r = await API.post('save', { sheet: 'voters', row });
          if (!r.success) return false;
          UI.toast('Tersimpan', 'success'); if (window.Cache) Cache.clearAll(); loadVoters();
        }}
      ]
    });
  }

  async function deleteVoter(id) {
    const ok = await UI.confirm('Hapus pemilih ini?', { danger: true }); if (!ok) return;
    const r = await API.post('delete', { sheet: 'voters', id });
    if (r.success) { UI.toast('Terhapus', 'success'); if (window.Cache) Cache.clearAll(); loadVoters(); }
  }

  /* CANDIDATES */
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
    let r = await fetchData('list', { sheet: 'candidates' });
    if (!r || !r.success) return;
    
    let list = r.data || [];
    if (!list.length) { area.innerHTML = `<p class="hint">Belum ada calon.</p>`; return; }
    
    area.innerHTML = `<div class="table-wrap"><table><thead><tr><th>No</th><th>Foto</th><th>Nama</th><th>Posisi</th><th>Aksi</th></tr></thead><tbody>
      ${list.map(c => `
        <tr>
          <td>${esc(c.noUrut||'-')}</td>
          <td>${c.photoUrl ? `<img src="${c.photoUrl}" style="width:40px;height:40px;object-fit:cover;border-radius:50%">` : '-'}</td>
          <td>${esc(c.name)}</td>
          <td>${esc(c.position)}</td>
          <td><button class="btn-danger btn-sm" onclick="ViewsAdmin.deleteCandidate('${esc(c.id)}')">🗑️</button></td>
        </tr>`).join('')}
    </tbody></table></div>`;
  }
  
  async function editCandidate(id) {
    let c = { id: '', noUrut: '', name: '', position: 'ketua_rt', photoUrl: '', visi: '', misi: '', active: true };
    if (id) { try { const r = await fetchData('list', { sheet: 'candidates', filter: { id } }); if (r.success && r.data && r.data[0]) c = r.data[0]; } catch (_) {} }
    
    const wrap = UI.el('div');
    wrap.innerHTML = `
      <div class="grid-2">
        <label class="field"><span>No. Urut</span>
          <input class="input" id="cNo" type="number" value="${esc(c.noUrut || '')}">
        </label>
        <label class="field"><span>Posisi</span>
          <select class="input" id="cPos">
            <option value="ketua_rt" ${c.position === 'ketua_rt' ? 'selected' : ''}>Ketua RT</option>
            <option value="ketua_pemuda" ${c.position === 'ketua_pemuda' ? 'selected' : ''}>Ketua Pemuda</option>
            <option value="wakil_pemuda" ${c.position === 'wakil_pemuda' ? 'selected' : ''}>Wakil Pemuda</option>
            <option value="ketua_wakil_pemuda" ${c.position === 'ketua_wakil_pemuda' ? 'selected' : ''}>Ketua & Wakil (Paket)</option>
          </select>
        </label>
      </div>
      <label class="field"><span>Nama Calon *</span>
        <input class="input" id="cName" value="${esc(c.name || '')}">
      </label>
      
      <label class="field">
        <span>Foto Calon (Upload dari Device)</span>
        <input type="file" id="cPhotoFile" accept="image/*" class="input" style="padding: 8px;">
        <small class="hint" style="color:var(--primary); display:none" id="uploadStatus">Mengunggah...</small>
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
      title: id ? 'Edit Calon' : 'Tambah Calon', body: wrap, size: 'lg',
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
            photoUrl: c.photoUrl || ''
          };
          
          if (!row.name) { UI.toast('Nama wajib diisi', 'error'); return false; }

          const fileInput = wrap.querySelector('#cPhotoFile');
          const file = fileInput.files && fileInput.files[0];
          
          if (file) {
            if (btn) { btn.disabled = true; btn.textContent = 'Mengunggah...'; }
            if (status) { status.style.display = 'block'; status.textContent = 'Sedang mengunggah foto ke Drive...'; }
            
            try {
              const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.onerror = e => reject(e);
                reader.readAsDataURL(file);
              });
              
              const uploadRes = await API.post('settings.save', {
                key: 'temp_photo_' + Date.now(),
                value: base64,
                fileData: base64
              });
              
              if (uploadRes && uploadRes.success && uploadRes.data) {
                let url = uploadRes.data.value;
                if (url.includes('drive.google.com')) {
                  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
                  if (match) url = `https://lh3.googleusercontent.com/d/${match[1]}`;
                }
                row.photoUrl = url; 
                if (status) { status.textContent = 'Upload berhasil!'; status.style.color = 'var(--ok)'; }
              } else {
                throw new Error(uploadRes.message || 'Gagal upload');
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
          } catch (err) { UI.toast(err.message, 'error'); return false; }
        }}
      ]
    });
  }

  async function deleteCandidate(id) {
    const ok = await UI.confirm('Hapus calon ini?', { danger: true }); if (!ok) return;
    const r = await API.post('delete', { sheet: 'candidates', id });
    if (r.success) { UI.toast('Terhapus', 'success'); if (window.Cache) Cache.clearAll(); loadCandidates(); }
  }

  /* BOOTHS */
  async function booths() {
    clearAllPolls(); cleanupSignPad(); safeQRStop();
    const el = view(); if (!el) return;
    el.innerHTML = `
      <div class="card">
        <div class="row-between"><div><h3>Manajemen Bilik</h3></div><button class="btn-primary btn-sm" id="btnAddBooth">+ Tambah</button></div>
        <div id="boothAdminList" style="margin-top:12px">${UI.skeleton(3)}</div>
      </div>
    `;
    document.getElementById('btnAddBooth').onclick = () => editBooth(null);
    await loadBooths();
    setPoll('boothAdminList', 5000, loadBooths);
  }

  async function loadBooths() {
    const area = document.getElementById('boothAdminList'); if (!area) return;
    let r = await fetchData('booth.status', {});
    if (!r || !r.success) return;

    const list = r.data || [];
    area.innerHTML = list.map(b => {
      const isOnline = b.lastActive && (Date.now() - b.lastActive < 90000);
      const active = !!b.currentVoterId;
      
      let statusText = isOnline ? (active ? 'Sedang Memilih' : 'Siap Menerima') : 'Offline';
      let statusClass = isOnline ? (active ? 'warn' : 'ok') : 'danger';
      let dotClass = isOnline ? 'online' : 'offline';

      return `
        <div class="booth-row ${isOnline ? 'ready' : ''}">
          <span class="dot-indicator ${dotClass}"></span>
          <strong>${esc(b.name)}</strong>
          <span class="badge ${statusClass}">${statusText}</span>
          <div class="row" style="margin:0;margin-left:auto;gap:4px">
            <button class="btn-ghost btn-sm" onclick="ViewsAdmin.editBooth('${esc(b.id)}')">✏️</button>
            ${active ? `<button class="btn-ghost btn-sm" onclick="ViewsAdmin.freeBooth('${esc(b.id)}')">Kosongkan</button>` : ''}
            <button class="btn-danger btn-sm" onclick="ViewsAdmin.deleteBooth('${esc(b.id)}')">🗑️</button>
          </div>
        </div>`;
    }).join('');
  }
  
  async function editBooth(id) {
    let b = { id: '', name: '' };
    if (id) { try { const r = await fetchData('list', { sheet: 'booths', filter: { id } }); if (r.success && r.data) b = r.data[0]; } catch (_) {} }
    const wrap = UI.el('div');
    wrap.innerHTML = `<label class="field"><span>Nama Bilik</span><input class="input" id="bName" value="${esc(b.name||'')}"></label>`;
    UI.modal({
      title: 'Simpan Bilik', body: wrap,
      actions: [
        { label: 'Batal', type: 'ghost' },
        { label: 'Simpan', type: 'primary', onClick: async () => {
          const row = { id: b.id || '', name: wrap.querySelector('#bName').value.trim() };
          if (!row.name) return false;
          const r = await API.post('save', { sheet: 'booths', row });
          if (!r.success) return false;
          UI.toast('Tersimpan', 'success'); if (window.Cache) Cache.clearAll(); loadBooths();
        }}
      ]
    });
  }
  
  async function deleteBooth(id) {
    const ok = await UI.confirm('Hapus bilik?', { danger: true }); if (!ok) return;
    const r = await API.post('delete', { sheet: 'booths', id });
    if (r.success) { UI.toast('Terhapus', 'success'); if (window.Cache) Cache.clearAll(); loadBooths(); }
  }

  async function freeBooth(id) {
    const ok = await UI.confirm('Kosongkan bilik ini?', { danger: true }); if (!ok) return;
    try {
      const r = await API.post('booth.setCurrent', { boothId: id, voterId: '' });
      if (!r.success) { UI.toast(r.message || 'Gagal', 'error'); return; }
      UI.toast('Bilik dikosongkan', 'success'); 
      if (window.Cache) Cache.clearAll(); 
      loadBooths();
    } catch (err) { UI.toast(err.message, 'error'); }
  }

  /* USERS */
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
    let r = await fetchData('list', { sheet: 'users' });
    if (!r || !r.success) return;

    const list = r.data || [];
    if (!list.length) { area.innerHTML = `<p class="hint">Belum ada pengguna.</p>`; return; }

    area.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Username</th><th>Nama</th><th>Role</th><th>Aksi</th></tr></thead>
          <tbody>
            ${list.map(u => `
              <tr>
                <td><code>${esc(u.username)}</code></td><td>${esc(u.name || '-')}</td><td><span class="badge info">${esc(u.role || '-')}</span></td>
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
    let u = { id: '', username: '', name: '', role: 'petugas', boothId: '', active: true };
    if (id) { try { const r = await fetchData('list', { sheet: 'users', filter: { id } }); if (r.success && r.data) u = r.data[0]; } catch (_) {} }
    
    const wrap = UI.el('div');
    wrap.innerHTML = `
      <label class="field"><span>Username *</span><input class="input" id="uUser" value="${esc(u.username || '')}" ${id ? 'readonly' : ''}></label>
      <label class="field"><span>Nama Lengkap *</span><input class="input" id="uName" value="${esc(u.name || '')}"></label>
      <label class="field"><span>Password ${id ? '(kosongkan jika tidak diubah)' : '*'}</span><input class="input" id="uPass" type="password"></label>
      <div class="grid-2">
        <label class="field"><span>Role</span>
          <select class="input" id="uRole">
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
            <option value="petugas" ${u.role === 'petugas' ? 'selected' : ''}>Petugas</option>
            <option value="bilik" ${u.role === 'bilik' ? 'selected' : ''}>Bilik</option>
          </select>
        </label>
      </div>
      <label class="remember-row"><input type="checkbox" id="uActive" ${isTrue(u.active) ? 'checked' : ''}> Aktif</label>
    `;
    UI.modal({
      title: id ? 'Edit Pengguna' : 'Tambah Pengguna', body: wrap, size: 'lg',
      actions: [
        { label: 'Batal', type: 'ghost' },
        { label: 'Simpan', type: 'primary', onClick: async () => {
          const row = { id: u.id || '', username: wrap.querySelector('#uUser').value.trim(), name: wrap.querySelector('#uName').value.trim(), role: wrap.querySelector('#uRole').value, active: wrap.querySelector('#uActive').checked };
          const pass = wrap.querySelector('#uPass').value; if (pass) row.password = pass;
          if (!row.username || !row.name) { UI.toast('Isi semua data wajib', 'error'); return false; }
          if (!id && !pass) { UI.toast('Password wajib', 'error'); return false; }
          try {
            const r = await API.post('save', { sheet: 'users', row });
            if (!r.success) { UI.toast(r.message || 'Gagal', 'error'); return false; }
            UI.toast('Tersimpan', 'success'); if (window.Cache) Cache.clearAll(); loadUsers();
          } catch (err) { UI.toast(err.message, 'error'); return false; }
        }}
      ]
    });
  }

  async function deleteUser(id) {
    const ok = await UI.confirm('Hapus pengguna ini?', { danger: true }); if (!ok) return;
    const r = await API.post('delete', { sheet: 'users', id });
    if (r.success) { UI.toast('Terhapus', 'success'); if (window.Cache) Cache.clearAll(); loadUsers(); }
  }

  /* INVITATIONS */
  let invState = { page: 1, limit: 10, total: 0, allData: [] };

  async function invitations() {
    clearAllPolls(); cleanupSignPad(); safeQRStop();
    invState = { page: 1, limit: 10, total: 0, allData: [] };

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
    const search = document.getElementById('invSearch');
    const layout = document.getElementById('invLayout');

    const doPrint = () => {
      if (btnPrint) { btnPrint.disabled = true; btnPrint.textContent = '⏳ Menyiapkan...'; }
      
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed'; iframe.style.right = '0'; iframe.style.bottom = '0';
      iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = '0';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow.document;
      const layoutClass = document.getElementById('invLayout').value;
      let cssLinks = '';
      document.querySelectorAll('link[rel="stylesheet"]').forEach(link => { cssLinks += `<link rel="stylesheet" href="${link.href}">`; });
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
              body, html { background: #fff !important; margin: 0 !important; padding: 0 !important; width: 100% !important; overflow: hidden !important; }
              .sidebar, .topbar, .card, .hint, .btn-primary, .btn-ghost, .no-print, #invPagination { display: none !important; }

              .invitations-sheet { display: grid !important; gap: 0 !important; padding: 0 !important; margin: 0 !important; background: transparent !important; max-width: none !important; width: 210mm !important; }

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
        iframe.contentWindow.focus(); iframe.contentWindow.print();
        setTimeout(() => { document.body.removeChild(iframe); if (btnPrint) { btnPrint.disabled = false; btnPrint.textContent = '🖨️ Cetak'; } }, 2000);
      }, 2000);
    };

    btnPrint.onclick = doPrint;
    
    search.addEventListener('input', UI.debounce(() => { invState.page = 1; loadInvitations(); }, 300));
    layout.addEventListener('change', () => {
      const l = layout.value;
      if (l === 'layout-1') invState.limit = 5;
      if (l === 'layout-2') invState.limit = 10;
      if (l === 'layout-4') invState.limit = 20;
      invState.page = 1; loadInvitations();
    });

    await loadInvitations();
  }

  async function loadInvitations() {
    const area = document.getElementById('invPrintArea');
    const pag = document.getElementById('invPagination');
    if (!area) return;

    let vr = await fetchData('list', { sheet: 'voters' });
    let sr = await fetchData('settings.public', {});
    if (!vr.success) return;

    const settings = (sr && sr.success && sr.data) || {};
    const signerName = settings.invitation_signer || 'Ketua Panitia';
    const signerSig = settings.invitation_signature || '';
    const eventName = settings.event_name || 'Pemilihan';
    const eventLoc = settings.event_location || '-';
    
    let formattedDate = '-';
    if (settings.election_date) {
      const d = new Date(settings.election_date);
      const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      formattedDate = `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
    }

    const kw = (document.getElementById('invSearch').value || '').trim().toLowerCase();
    let list = vr.data || [];
    if (kw) list = list.filter(v => String(v.name || '').toLowerCase().includes(kw));

    invState.total = list.length;
    if (!list.length) { area.innerHTML = `<p class="hint" style="color:#000">Tidak ada pemilih.</p>`; pag.innerHTML = ''; return; }

    const totalPages = Math.ceil(invState.total / invState.limit) || 1;
    if (invState.page > totalPages) invState.page = totalPages;

    const pageData = list.slice((invState.page - 1) * invState.limit, invState.page * invState.limit);

    pag.innerHTML = `
      <button class="btn-ghost btn-sm" type="button" ${invState.page <= 1 ? 'disabled' : ''} onclick="ViewsAdmin.prevInvPage()">Sebelumnya</button>
      <span class="hint" style="margin:0 8px;">Hal ${invState.page} dari ${totalPages}</span>
      <button class="btn-ghost btn-sm" type="button" ${invState.page >= totalPages ? 'disabled' : ''} onclick="ViewsAdmin.nextInvPage()">Selanjutnya</button>
    `;

    const layoutClass = document.getElementById('invLayout').value;

    const renderInviteHtml = (v) => {
      let finalSig = signerSig;
      if (finalSig.includes('drive.google.com')) {
        const match = finalSig.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (match) finalSig = `https://drive.google.com/thumbnail?id=${match[1]}&sz=w400`;
      }
      const signHtml = finalSig ? `<img src="${esc(finalSig)}" alt="TTD" crossorigin="anonymous">` : '';
      
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(v.code || v.id)}`;
      
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

    area.innerHTML = `<div class="invitations-sheet ${layoutClass}">${pageData.map(renderInviteHtml).join('')}</div>`;
    
    setTimeout(() => {
      pageData.forEach(v => {
        const container = document.getElementById('qr-' + v.id);
        if (container && window.QRCode) {
          new QRCode(container, { text: v.code || v.id, width: 150, height: 150, correctLevel: QRCode.CorrectLevel.H });
        }
      });
    }, 100);
  }

  function prevInvPage() { if (invState.page > 1) { invState.page--; loadInvitations(); window.scrollTo(0, 0); } }
  function nextInvPage() { const total = Math.ceil(invState.total / invState.limit) || 1; if (invState.page < total) { invState.page++; loadInvitations(); window.scrollTo(0, 0); } }

  /* RESULTS */
  async function results() {
    clearAllPolls(); cleanupSignPad(); safeQRStop();
    const el = view(); if (!el) return;
    el.innerHTML = `<div id="resultsArea">${UI.skeleton(4)}</div>`;
    await loadResults();
    setPoll('resultsArea', 5000, loadResults);
  }

  async function loadResults() {
    const area = document.getElementById('resultsArea'); if (!area) return;
    let r = await fetchData('results', {});
    if (!r || !r.success) return;

    const groups = r.groups || {};
    const totalVoted = r.totalVoted || 0;
    const totalVoters = r.totalVoters || 0;
    const LABELS = { ketua_rt: 'Ketua RT', ketua_pemuda: 'Ketua Pemuda', wakil_pemuda: 'Wakil Ketua Pemuda', ketua_wakil_pemuda: 'Ketua & Wakil Pemuda' };

    area.innerHTML = `
      <div class="grid-3">
        <div class="stat"><small>Total Pemilih</small><h3>${totalVoters}</h3></div>
        <div class="stat"><small>Sudah Memilih</small><h3>${totalVoted}</h3></div>
        <div class="stat"><small>Partisipasi</small><h3>${UI.formatPercent(totalVoted, totalVoters || 1)}</h3></div>
      </div>
      <div class="card">
        <div class="row-between"><h3>Hasil Perolehan Suara</h3><span class="hint">${UI.formatTime(new Date())}</span></div>
        ${Object.keys(groups).length === 0 ? `<p class="hint" style="margin-top:12px">Belum ada data.</p>` : Object.keys(groups).map(pos => {
          const items = groups[pos]; const total = items.reduce((s, c) => s + (c.votes || 0), 0);
          return `
            <div class="res-group">
              <h4>${esc(LABELS[pos] || pos)}</h4>
              ${items.map(c => {
                const pct = total ? Math.round((c.votes || 0) / total * 100) : 0;
                return `<div class="res-bar"><div class="res-name">No. ${esc(c.noUrut || '-')} • ${esc(c.name)}</div><div class="bar"><div class="fill" style="width:${pct}%"></div></div><div class="res-count">${c.votes || 0}</div></div>`;
              }).join('')}
            </div>`;
        }).join('')}
      </div>
    `;
  }

  /* BERITA ACARA */
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
    const list = (r.data || []).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    if (!list.length) { area.innerHTML = `<p class="hint">Belum ada berita acara.</p>`; return; }
    
    area.innerHTML = list.map(ba => {
      let sigsHtml = '';
      try {
        const sigs = JSON.parse(ba.signatures || '[]');
        if (sigs.length > 0) {
          sigsHtml = `<div style="margin-top:15px; display:flex; gap:20px; flex-wrap:wrap;">`;
          sigs.forEach(s => {
            sigsHtml += `
              <div style="text-align:center; font-size:11px;">
                ${s.url ? `<img src="${s.url}" style="height:60px; border:1px solid #ccc; border-radius:4px; margin-bottom:5px;"><br>` : ''}
                <u>${esc(s.name)}</u>
              </div>`;
          });
          sigsHtml += `</div>`;
        }
      } catch (_) {}

      return `
        <div class="ba-item">
          <strong>${esc(ba.title || 'Berita Acara')}</strong>
          <small>${esc(ba.createdAt ? UI.formatDateTime(ba.createdAt) : '-')} • ${esc(ba.createdBy || '-')}</small>
          <pre style="white-space: pre-wrap; font-family: inherit; margin-top:10px;">${esc(ba.content || '')}</pre>
          ${sigsHtml}
        </div>
      `;
    }).join('');
  }

  async function createBa() {
    let resultsData = null;
    try {
      const r = await fetchData('results', {});
      if (r && r.success) resultsData = r;
    } catch (_) {}

    const wrap = UI.el('div');
    wrap.innerHTML = `
      <label class="field"><span>Judul</span><input class="input" id="baTitle" value="Berita Acara Pemilihan"></label>
      <label class="field"><span>Isi / Rangkuman (Otomatis)</span><textarea class="input" id="baContent" rows="8"></textarea></label>
      
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

    let sigPads = [];
    const container = wrap.querySelector('#signersContainer');

    function addSignerRow(label) {
      const row = UI.el('div', { style: 'border:1px solid #e2e8f0; padding:12px; border-radius:8px; background:#fafbfc;' });
      row.innerHTML = `
        <label class="field"><span>${label || 'Nama Penandatangan'}</span><input class="input signerName" placeholder="Nama"></label>
        <div class="signerPad" style="background:#fff; border:1px dashed #cbd5e1; border-radius:8px; margin-bottom:8px;"></div>
        <div class="row" style="margin-top:0; gap:8px;">
          <button class="btn-ghost btn-sm btn-undo-pad" type="button">↩️ Undo</button>
          <button class="btn-ghost btn-sm btn-clear-pad" type="button">🧹 Hapus</button>
        </div>
      `;
      container.appendChild(row);

      const padHost = row.querySelector('.signerPad');
      setTimeout(() => {
        if (window.Sign) {
          const pad = Sign.mount(padHost);
          
          row.querySelector('.btn-undo-pad').onclick = () => pad.undo && pad.undo();
          row.querySelector('.btn-clear-pad').onclick = () => pad.clear && pad.clear();

          sigPads.push({ nameInput: row.querySelector('.signerName'), pad: pad });
        }
      }, 50);
    }

    addSignerRow('Nama Panitia');
    addSignerRow('Nama Tokoh Masyarakat');

    setTimeout(() => {
      wrap.querySelector('#btnAddSigner').onclick = () => addSignerRow('Nama Penandatangan Lainnya');
    }, 100);

    UI.modal({
      title: 'Buat Berita Acara', body: wrap, size: 'lg',
      actions: [
        { label: 'Batal', type: 'ghost' },
        { label: 'Simpan', type: 'primary', onClick: async () => {
          const title = wrap.querySelector('#baTitle').value.trim();
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
                  fileData: base64 
                });
                
                if (uploadRes && uploadRes.success) {
                  signaturesData.push({ name: name || 'Tanpa Nama', url: uploadRes.data.value });
                }
              } else if (name) {
                signaturesData.push({ name: name, url: '' });
              }
            }

            const r = await API.post('ba.save', { 
              title, 
              content, 
              createdBy: (me() || {}).username || '-',
              signatures: JSON.stringify(signaturesData)
            });
            
            if (!r.success) { UI.toast(r.message || 'Gagal', 'error'); return false; }
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

  /* SETTINGS */
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
    const electionDate = map.election_date ? new Date(map.election_date).toISOString().slice(0, 16) : '';

    area.innerHTML = `
      <label class="field"><span>Nama Event</span><input class="input" id="sEventName" value="${esc(map.event_name || '')}"></label>
      <label class="field"><span>Lokasi</span><input class="input" id="sEventLoc" value="${esc(map.event_location || '')}"></label>
      <label class="field"><span>Tanggal Pemilihan</span><input class="input" id="sElectionDate" type="datetime-local" value="${electionDate}"></label>
      <label class="field"><span>Nama Penandatangan Undangan</span><input class="input" id="sSigner" value="${esc(map.invitation_signer || '')}"></label>
      
      <label class="field"><span>Mode Posisi Ketua & Wakil</span>
        <select class="input" id="sVotingMode">
          <option value="single" ${map.voting_mode === 'single' ? 'selected' : ''}>Digabung (Pilih 1 Paslon)</option>
          <option value="dual" ${map.voting_mode === 'dual' ? 'selected' : ''}>Terpisah (Pilih Ketua & Wakil Masing-masing)</option>
        </select>
      </label>
      
      <label class="field"><span>Tanda Tangan Digital</span><div id="sigPadSettings" style="max-width:600px"></div></label>
      <div class="row">
        <button class="btn-ghost btn-sm" id="btnSigClear" type="button">🧹 Hapus TTD</button>
        <button class="btn-ghost btn-sm" id="btnSigUndo" type="button">↩️ Undo</button>
        <button class="btn-ghost btn-sm" id="btnSigUpload" type="button">📎 Upload TTD</button>
        <input type="file" id="sigFileInput" accept="image/*" style="display:none">
      </div>
      <div class="row" style="margin-top:16px"><button class="btn-primary" id="btnSaveSettings" type="button">💾 Simpan</button></div>
    `;

    const padHost = document.getElementById('sigPadSettings');
    if (padHost && window.Sign) {
      try {
        sigPad = Sign.mount(padHost);
        if (map.invitation_signature) {
          const img = new Image();
          img.onload = () => { const canvas = sigPad.getCanvas(); if (!canvas) return; const ctx = canvas.getContext('2d'); const rect = canvas.getBoundingClientRect(); try { ctx.drawImage(img, 0, 0, rect.width, rect.height); } catch (_) {} };
          img.src = map.invitation_signature;
        }
      } catch (_) {}
    }

    const btnClear = document.getElementById('btnSigClear'); if (btnClear) btnClear.onclick = () => sigPad && sigPad.clear();
    const btnUndo = document.getElementById('btnSigUndo'); if (btnUndo) btnUndo.onclick = () => sigPad && sigPad.undo && sigPad.undo();
    
    const btnUpload = document.getElementById('btnSigUpload'); const fileInput = document.getElementById('sigFileInput');
    if (btnUpload && fileInput) {
      btnUpload.onclick = () => fileInput.click();
      fileInput.onchange = function (e) {
        const file = e.target.files && e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = function (ev) {
          const img = new Image();
          img.onload = function () { const canvas = sigPad && sigPad.getCanvas(); if (!canvas) return; const ctx = canvas.getContext('2d'); const rect = canvas.getBoundingClientRect(); ctx.clearRect(0, 0, rect.width, rect.height); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, rect.width, rect.height); ctx.drawImage(img, 0, 0, rect.width, rect.height); };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      };
    }
    const btnSave = document.getElementById('btnSaveSettings'); if (btnSave) btnSave.onclick = saveSettings;
  }

  async function saveSettings() {
    const btn = document.getElementById('btnSaveSettings'); if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…'; }
    try {
      const updates = { 
        event_name: (document.getElementById('sEventName') || {}).value || '', 
        event_location: (document.getElementById('sEventLoc') || {}).value || '', 
        election_date: (document.getElementById('sElectionDate') || {}).value || '', 
        invitation_signer: (document.getElementById('sSigner') || {}).value || '',
        voting_mode: (document.getElementById('sVotingMode') || {}).value || 'single'
      };
      for (const key of Object.keys(updates)) { try { await API.post('settings.save', { key, value: updates[key] }); } catch (_) {} }
      
      if (sigPad && !sigPad.isEmpty()) {
        const dataUrl = await sigPad.getBase64();
        const r = await API.post('settings.save', { key: 'invitation_signature', value: dataUrl, fileData: dataUrl });
        if (!r || !r.success) { UI.toast('TTD gagal disimpan: ' + ((r && r.message) || 'unknown'), 'warn'); }
      }
      UI.toast('Pengaturan tersimpan', 'success'); if (window.Cache) Cache.clearAll();
    } catch (err) { UI.toast('Error: ' + err.message, 'error'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan'; } }
  }

  /* EXPORTS */
  return {
    dashboard, voters, candidates, booths, users, invitations, results, beritaAcara, settings,
    editVoter, deleteVoter, editCandidate, deleteCandidate, editBooth, freeBooth, deleteBooth, editUser, deleteUser, prevInvPage, nextInvPage,
    _clearAllPolls: function () { clearAllPolls(); cleanupSignPad(); safeQRStop(); },
  };
})();