/* ============================================================
   E-VOTE • views-admin.js
   ============================================================ */
window.ViewsAdmin = (function () {
  'use strict';

  const view = () => document.getElementById('view');
  const me   = () => API.user() || {};

  const POSITION_LABELS = {
    ketua_rt:           'Ketua RT',
    ketua_pemuda:       'Ketua Pemuda',
    wakil_pemuda:       'Wakil Ketua Pemuda',
    ketua_wakil_pemuda: 'Ketua & Wakil Pemuda',
  };
  const labelPos = (p) => POSITION_LABELS[p] || p;

  function isTrue(v) { return v === true || String(v) === 'TRUE' || String(v) === 'true'; }
  function esc(s)    { return UI.escapeHtml(s); }
  function genCode(prefix) {
    return (prefix || 'V') + Date.now().toString(36).toUpperCase().slice(-6) + Math.random().toString(36).slice(2, 4).toUpperCase();
  }

  /* ---------- Polling ---------- */
  const polls = {};
  function setPoll(id, ms, fn) {
    clearPoll(id);
    polls[id] = setInterval(() => {
      if (!document.getElementById(id)) { clearPoll(id); return; }
      try { fn(); } catch (e) { console.error(e); }
    }, ms);
  }
  function clearPoll(id) { if (polls[id]) { clearInterval(polls[id]); delete polls[id]; } }
  function clearAllPolls() { Object.keys(polls).forEach(clearPoll); }

  /* ---------- Image resize ---------- */
  function resizeImageFile(file, maxSize = 300, quality = 0.75) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let w = img.width, h = img.height;
          if (w > maxSize || h > maxSize) {
            const s = maxSize / Math.max(w, h);
            w = Math.round(w * s); h = Math.round(h * s);
          }
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* ============================================================
   *  DASHBOARD
   * ============================================================ */
  async function dashboard() {
    clearAllPolls();
    const el = view();
    el.innerHTML = `<div id="dashArea">${UI.skeleton(4)}</div>`;
    await loadDash();

    async function loadDash() {
      const r = await Cache.fetchApi('dash.summary', {});
      const area = document.getElementById('dashArea');
      if (!area) return;
      if (!r.success) {
        area.innerHTML = `<div class="card"><p class="hint" style="color:var(--err)">${esc(r.message || 'Gagal memuat')}</p></div>`;
        return;
      }
      const d = r.data;
      area.innerHTML = `
        <div class="grid-3">
          <div class="stat"><small>Total Pemilih</small><h3>${d.totalVoters || 0}</h3></div>
          <div class="stat"><small>Sudah Memilih</small><h3>${d.voted || 0}</h3></div>
          <div class="stat"><small>Belum Memilih</small><h3>${(d.totalVoters || 0) - (d.voted || 0)}</h3></div>
          <div class="stat"><small>Bilik Siap / Total</small><h3>${d.boothsReady || 0} / ${d.boothsTotal || 0}</h3></div>
          <div class="stat"><small>Bilik Terisi</small><h3>${d.boothsOccupied || 0}</h3></div>
          <div class="stat"><small>Calon</small><h3>${d.candidates || 0}</h3></div>
        </div>
        <div class="card">
          <div class="row-between">
            <h3>Ringkasan Sistem</h3>
            <span class="hint">${UI.formatDateTime(d.serverTime)}</span>
          </div>
          <div class="row">
            <a href="#/admin/voters" class="btn-primary">👥 Kelola Pemilih</a>
            <a href="#/admin/candidates" class="btn-ghost">🏅 Kelola Calon</a>
            <a href="#/admin/invitations" class="btn-ghost">✉️ Cetak Undangan</a>
            <a href="#/admin/results" class="btn-ghost">📈 Hasil Real-Time</a>
            <a href="#/admin/settings" class="btn-ghost">⚙️ Pengaturan</a>
          </div>
        </div>
      `;
    }
  }

  /* ============================================================
   *  SETTINGS (Dengan TTD Digital)
   * ============================================================ */
  async function settings() {
    clearAllPolls();
    const el = view();
    el.innerHTML = `<div class="card"><div id="settingsArea">${UI.skeleton(3)}</div></div>`;
    
    const r = await Cache.fetchApi('list', { sheet: 'settings' });
    if (!r.success) return;
    
    const settingsMap = {};
    r.data.forEach(s => settingsMap[s.key] = s.value);
    
    let electionDate = settingsMap.election_date || '';
    if (electionDate) {
      try {
        const d = new Date(electionDate);
        const tzoffset = d.getTimezoneOffset() * 60000;
        electionDate = (new Date(d - tzoffset)).toISOString().slice(0, 16);
      } catch (_) {}
    }

    const area = document.getElementById('settingsArea');
    area.innerHTML = `
      <div class="row-between mb-3">
        <div>
          <h3>Pengaturan Sistem</h3>
          <p class="hint">Atur jadwal pemilihan, TTD digital, dan konfigurasi E-Vote.</p>
        </div>
      </div>
      
      <form id="settingsForm" style="max-width: 500px;">
        <label class="field">
          <span>Tanggal & Waktu Pemungutan Suara</span>
          <input type="datetime-local" class="input" name="election_date" value="${electionDate}" required>
          <small class="hint" style="margin-top:4px; display:block;">Countdown timer di halaman depan akan berhenti pada waktu ini.</small>
        </label>
        
        <label class="field">
          <span>Nama Acara Pemilihan</span>
          <input type="text" class="input" name="event_name" value="${esc(settingsMap.event_name || 'Pemilihan Ketua RT & Pemuda')}">
        </label>

        <label class="field">
          <span>Nama Penandatangan Undangan</span>
          <input type="text" class="input" name="invitation_signer" value="${esc(settingsMap.invitation_signer || 'Ketua Panitia')}">
        </label>

        <!-- TAMBAHAN: TTD DIGITAL -->
        <label class="field">
          <span>Tanda Tangan Ketua Panitia (Untuk Undangan)</span>
          <div id="sigPadSettings"></div>
          <div class="row" style="margin-top:8px">
            <button type="button" class="btn-ghost btn-sm" id="btnClearSig">Hapus TTD</button>
          </div>
        </label>

        <button type="submit" class="btn-primary mt-3" id="btnSaveSettings">💾 Simpan Pengaturan</button>
      </form>
    `;

    // Setup TTD Pad
    const sigHost = document.getElementById('sigPadSettings');
    const sigPad = Sign.mount(sigHost);
    
    // Load TTD lama jika ada
    if (settingsMap.invitation_signature && settingsMap.invitation_signature.length > 100) {
      const img = new Image();
      img.onload = () => {
        const canvas = sigPad.getCanvas();
        const ctx = canvas.getContext('2d');
        
        // Tambahkan background putih sebelum menggambar TTD lama
        ctx.fillStyle = '#ffffff'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = settingsMap.invitation_signature;
    }

    document.getElementById('btnClearSig').onclick = () => sigPad.clear();

    document.getElementById('settingsForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btnSaveSettings');
      btn.disabled = true; btn.textContent = 'Menyimpan...';

      const fd = new FormData(e.target);
      const dateVal = fd.get('election_date');
      let isoDate = '';
      if (dateVal) isoDate = new Date(dateVal).toISOString();

      let sigData = settingsMap.invitation_signature || '';
      if (!sigPad.isEmpty()) {
        sigData = sigPad.toDataURL('image/png');
      }

      await API.post('settings.save', { key: 'election_date', value: isoDate });
      await API.post('settings.save', { key: 'event_name', value: fd.get('event_name') });
      await API.post('settings.save', { key: 'invitation_signer', value: fd.get('invitation_signer') });
      await API.post('settings.save', { key: 'invitation_signature', value: sigData });

      Cache.clearAll();
      UI.toast('Pengaturan berhasil disimpan', 'success');
      btn.disabled = false; btn.textContent = '💾 Simpan Pengaturan';
    });
  }

  /* ============================================================
   *  VOTERS (Filter RT, Search, Sorting)
   * ============================================================ */
  let allVoters = [];
  let voterSearchQ = '';
  let voterSortBy = 'name_asc';
  let voterFilterRt = '';

  async function voters() {
    clearAllPolls();
    const el = view();
    el.innerHTML = `<div class="card"><div id="votersArea">${UI.skeleton(5)}</div></div>`;
    await loadVoters();
  }

  async function loadVoters() {
    const area = document.getElementById('votersArea');
    if (!area) return;
    const r = await Cache.fetchApi('list', { sheet: 'voters' });
    if (!r.success) {
      area.innerHTML = `<p class="hint" style="color:var(--err)">${esc(r.message || 'Gagal memuat')}</p>`;
      return;
    }
    allVoters = r.data || [];
    renderVoters();
  }

  function renderVoters() {
    const area = document.getElementById('votersArea');
    if (!area) return;
    
    const q = voterSearchQ.toLowerCase();
    
    const uniqueRts = [...new Set(allVoters.map(v => v.rt).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
    
    let filtered = allVoters.filter(v => {
      const matchSearch = q ? (v.name || '').toLowerCase().includes(q) || (v.code || '').toLowerCase().includes(q) : true;
      const matchRt = voterFilterRt ? String(v.rt) === String(voterFilterRt) : true;
      return matchSearch && matchRt;
    });

    filtered.sort((a, b) => {
      if (voterSortBy === 'rt_asc') {
        const rtA = parseInt(a.rt) || 0;
        const rtB = parseInt(b.rt) || 0;
        if (rtA !== rtB) return rtA - rtB;
        return (a.name || '').localeCompare(b.name || '');
      } 
      else if (voterSortBy === 'rt_desc') {
        const rtA = parseInt(a.rt) || 0;
        const rtB = parseInt(b.rt) || 0;
        if (rtA !== rtB) return rtB - rtA;
        return (a.name || '').localeCompare(b.name || '');
      }
      else if (voterSortBy === 'name_desc') {
        return (b.name || '').localeCompare(a.name || '');
      }
      else if (voterSortBy === 'status') {
        const votedA = isTrue(a.voted) ? 1 : 0;
        const votedB = isTrue(b.voted) ? 1 : 0;
        if (votedA !== votedB) return votedA - votedB;
        return (a.name || '').localeCompare(b.name || '');
      }
      else {
        return (a.name || '').localeCompare(b.name || '');
      }
    });

    const voted = allVoters.filter(v => isTrue(v.voted)).length;

    area.innerHTML = `
      <div class="row-between">
        <div>
          <h3>Daftar Pemilih (${allVoters.length})</h3>
          <p class="hint">${voted} sudah memilih • ${allVoters.length - voted} belum</p>
        </div>
        <div class="row" style="margin:0">
          <button class="btn-ghost" onclick="ViewsAdmin.bulkImport()">📥 Import</button>
          <button class="btn-primary" onclick="ViewsAdmin.addVoter()">+ Tambah</button>
        </div>
      </div>
      
      <div class="row" style="margin-top:16px; align-items:center; background:#f8fafc; padding:12px; border-radius:12px; border:1px solid var(--border);">
        
        <input class="input" placeholder="Cari nama atau kode pemilih…" value="${esc(voterSearchQ)}" oninput="ViewsAdmin.searchVoters(this.value)" style="flex:1; min-width:200px;">
        
        <select class="input" style="max-width:150px" onchange="ViewsAdmin.setVoterFilterRt(this.value)">
          <option value="">Semua RT</option>
          ${uniqueRts.map(rt => `<option value="${esc(rt)}" ${String(voterFilterRt) === String(rt) ? 'selected' : ''}>RT ${esc(rt)}</option>`).join('')}
        </select>

        <select class="input" style="max-width:180px" onchange="ViewsAdmin.setVoterSort(this.value)">
          <option value="name_asc" ${voterSortBy === 'name_asc' ? 'selected' : ''}>Urut Nama (A-Z)</option>
          <option value="name_desc" ${voterSortBy === 'name_desc' ? 'selected' : ''}>Urut Nama (Z-A)</option>
          <option value="rt_asc" ${voterSortBy === 'rt_asc' ? 'selected' : ''}>Urut RT Terkecil</option>
          <option value="rt_desc" ${voterSortBy === 'rt_desc' ? 'selected' : ''}>Urut RT Terbesar</option>
          <option value="status" ${voterSortBy === 'status' ? 'selected' : ''}>Belum Memilih</option>
        </select>

      </div>

      <div class="table-wrap" style="margin-top:12px">
        <table>
          <thead><tr><th>Kode</th><th>Nama</th><th>RT/RW</th><th>Telp</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>
            ${filtered.length === 0 ? `<tr><td colspan="6" class="hint" style="text-align:center;padding:24px">Tidak ada data yang cocok dengan filter.</td></tr>` : filtered.map(v => `
                <tr>
                  <td><code>${esc(v.code)}</code></td>
                  <td>${esc(v.name)}</td>
                  <td><span class="badge info">RT ${esc(v.rt || '-')}</span> / ${esc(v.rw || '-')}</td>
                  <td>${esc(v.phone || '-')}</td>
                  <td>${isTrue(v.voted) ? '<span class="badge ok">Memilih</span>' : '<span class="badge">Belum</span>'}</td>
                  <td>
                    <div class="row" style="margin:0;gap:4px">
                      <button class="btn-ghost btn-sm" onclick="ViewsAdmin.editVoter('${esc(v.id)}')">Edit</button>
                      <button class="btn-danger btn-sm" onclick="ViewsAdmin.deleteVoter('${esc(v.id)}')">Hapus</button>
                    </div>
                  </td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function searchVoters(q) {
    voterSearchQ = q || '';
    renderVoters();
    const el = view().querySelector('input[placeholder^="Cari"]');
    if (el) { el.focus(); el.setSelectionRange(q.length, q.length); }
  }

  function setVoterSort(val) {
    voterSortBy = val;
    renderVoters();
  }

  function setVoterFilterRt(val) {
    voterFilterRt = val;
    renderVoters();
  }

  function buildVoterForm(v) {
    const wrap = UI.el('div');
    const d = v || {};
    wrap.innerHTML = `
      <label class="field"><span>Nama Pemilih *</span><input class="input" name="name" value="${esc(d.name || '')}" required></label>
      <label class="field"><span>Kode Pemilih <small class="hint">(auto jika kosong)</small></span><input class="input" name="code" value="${esc(d.code || '')}"></label>
      <div class="grid-2">
        <label class="field"><span>RT</span><input class="input" name="rt" value="${esc(d.rt || '')}"></label>
        <label class="field"><span>RW</span><input class="input" name="rw" value="${esc(d.rw || '')}"></label>
      </div>
      <label class="field"><span>Alamat</span><input class="input" name="address" value="${esc(d.address || '')}"></label>
      <label class="field"><span>No. Telepon</span><input class="input" name="phone" value="${esc(d.phone || '')}"></label>
    `;
    return wrap;
  }

  function addVoter() {
    const wrap = buildVoterForm(null);
    UI.modal({
      title: 'Tambah Pemilih',
      body: wrap,
      actions: [
        { label: 'Batal', type: 'ghost' },
        { label: 'Simpan', type: 'primary', onClick: async () => {
            const val = n => wrap.querySelector(`[name="${n}"]`).value.trim();
            const name = val('name');
            if (!name) { UI.toast('Nama wajib diisi', 'error'); return false; }
            const row = { name, code: val('code') || genCode('V'), rt: val('rt'), rw: val('rw'), address: val('address'), phone: val('phone'), voted: false };
            const res = await API.post('save', { sheet: 'voters', row });
            if (!res.success) { UI.toast(res.message || 'Gagal', 'error'); return false; }
            UI.toast('Pemilih ditambahkan', 'success');
            Cache.clearAll();
            await loadVoters();
            return true;
          }},
      ],
    });
  }

  function editVoter(id) {
    const v = allVoters.find(x => String(x.id) === String(id));
    if (!v) return;
    const wrap = buildVoterForm(v);
    UI.modal({
      title: 'Edit Pemilih',
      body: wrap,
      actions: [
        { label: 'Batal', type: 'ghost' },
        { label: 'Simpan', type: 'primary', onClick: async () => {
            const val = n => wrap.querySelector(`[name="${n}"]`).value.trim();
            const name = val('name');
            if (!name) { UI.toast('Nama wajib diisi', 'error'); return false; }
            const row = { ...v, name, code: val('code') || v.code, rt: val('rt'), rw: val('rw'), address: val('address'), phone: val('phone') };
            const res = await API.post('save', { sheet: 'voters', row });
            if (!res.success) { UI.toast(res.message || 'Gagal', 'error'); return false; }
            UI.toast('Perubahan disimpan', 'success');
            Cache.clearAll();
            await loadVoters();
            return true;
          }},
      ],
    });
  }

  async function deleteVoter(id) {
    const v = allVoters.find(x => String(x.id) === String(id));
    if (!v) return;
    if (!await UI.confirm(`Hapus pemilih "${v.name}"?`, { danger: true })) return;
    const res = await API.post('delete', { sheet: 'voters', id });
    if (!res.success) { UI.toast(res.message || 'Gagal', 'error'); return; }
    UI.toast('Pemilih dihapus', 'success');
    Cache.clearAll();
    await loadVoters();
  }

  function bulkImport() {
    const wrap = UI.el('div');
    wrap.innerHTML = `
      <p class="hint">Format per baris: <code>nama,rt,rw,telepon</code>. Kode dibuat otomatis.</p>
      <label class="field"><span>Pilih file CSV</span><input type="file" accept=".csv,text/csv" id="csvFile"></label>
      <label class="field"><span>Atau tempel data di sini</span><textarea class="input" id="csvText" rows="6" placeholder="Budi,001,002,08123...&#10;Siti,001,002,08124..."></textarea></label>
    `;
    UI.modal({
      title: 'Import Pemilih',
      body: wrap,
      actions: [
        { label: 'Batal', type: 'ghost' },
        { label: 'Import', type: 'primary', onClick: async () => {
            const ta = wrap.querySelector('#csvText');
            let text = ta.value.trim();
            const file = wrap.querySelector('#csvFile').files[0];
            if (file) text = await file.text();
            if (!text) { UI.toast('Tidak ada data', 'error'); return false; }
            const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            const rows = [];
            for (const line of lines) {
              const [name, rt, rw, phone] = line.split(',').map(s => (s || '').trim());
              if (!name || /^(nama|name)$/i.test(name)) continue;
              rows.push({ name, rt: rt || '', rw: rw || '', phone: phone || '', code: genCode('V'), voted: false });
            }
            if (!rows.length) { UI.toast('Tidak ada baris valid', 'error'); return false; }
            const res = await API.post('voters.bulk', { rows });
            if (!res.success) { UI.toast(res.message || 'Gagal import', 'error'); return false; }
            UI.toast(`Berhasil import ${res.added || rows.length} pemilih`, 'success');
            Cache.clearAll();
            await loadVoters();
            return true;
          }},
      ],
    });
  }

  /* ============================================================
   *  CANDIDATES
   * ============================================================ */
  let allCandidates = [];

  async function candidates() {
    clearAllPolls();
    const el = view();
    el.innerHTML = `<div class="card"><div id="candArea">${UI.skeleton(4)}</div></div>`;
    await loadCandidates();
  }

  async function loadCandidates() {
    const area = document.getElementById('candArea');
    if (!area) return;
    const r = await Cache.fetchApi('list', { sheet: 'candidates' });
    if (!r.success) { area.innerHTML = `<p class="hint" style="color:var(--err)">${esc(r.message || 'Gagal')}</p>`; return; }
    allCandidates = r.data || [];
    renderCandidates();
  }

  function renderCandidates() {
    const area = document.getElementById('candArea');
    if (!area) return;
    const byPos = {};
    allCandidates.forEach(c => { (byPos[c.position] = byPos[c.position] || []).push(c); });

    const groupsHtml = Object.keys(byPos).length
      ? Object.keys(byPos).map(pos => `
          <div class="pos-group">
            <h4>${esc(labelPos(pos))} (${byPos[pos].length})</h4>
            <div class="cand-list">
              ${byPos[pos].map(c => `
                <div class="cand-item" style="cursor:default">
                  <img src="${esc(c.photoUrl || '')}" alt="" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2252%22 height=%2252%22><circle cx=%2226%22 cy=%2226%22 r=%2226%22 fill=%22%23e2e8f0%22/></svg>'">
                  <div style="flex:1;min-width:0"><strong>${esc(c.name)}</strong><div class="hint">No. ${esc(c.noUrut || '-')}</div></div>
                  <div class="row" style="margin:0;gap:4px;flex-direction:column">
                    <button class="btn-ghost btn-sm" onclick="ViewsAdmin.editCandidate('${esc(c.id)}')">Edit</button>
                    <button class="btn-danger btn-sm" onclick="ViewsAdmin.deleteCandidate('${esc(c.id)}')">Hapus</button>
                  </div>
                </div>`).join('')}
            </div>
          </div>`).join('')
      : `<p class="hint">Belum ada calon.</p>`;

    area.innerHTML = `
      <div class="row-between">
        <div><h3>Data Calon (${allCandidates.length})</h3><p class="hint">Atur nomor urut, foto, visi & misi per posisi.</p></div>
        <button class="btn-primary" onclick="ViewsAdmin.addCandidate()">+ Tambah Calon</button>
      </div>
      ${groupsHtml}
    `;
  }

  function candidateForm(c) {
    const d = c || {};
    const wrap = UI.el('div');
    wrap.innerHTML = `
      <div class="grid-2">
        <label class="field"><span>No. Urut</span><input class="input" name="noUrut" value="${esc(d.noUrut || '')}"></label>
        <label class="field"><span>Posisi *</span>
          <select class="input" name="position">
            ${Object.keys(POSITION_LABELS).map(p => `<option value="${p}" ${d.position === p ? 'selected' : ''}>${esc(labelPos(p))}</option>`).join('')}
          </select></label>
      </div>
      <label class="field"><span>Nama Calon *</span><input class="input" name="name" value="${esc(d.name || '')}" required></label>
      <label class="field"><span>Foto (URL atau upload)</span>
        <div class="row" style="margin:0;gap:6px">
          <input class="input" name="photoUrl" value="${esc(d.photoUrl || '')}" placeholder="https://..." style="flex:1">
          <input type="file" accept="image/*" id="photoFile" style="max-width:170px">
        </div></label>
      <div id="photoPreview" class="mt-2"></div>
      <label class="field"><span>Visi</span><textarea class="input" name="visi" rows="2">${esc(d.visi || '')}</textarea></label>
      <label class="field"><span>Misi (pisahkan dengan titik koma ;)</span><textarea class="input" name="misi" rows="2">${esc(d.misi || '')}</textarea></label>
      <label class="field"><span>Status</span>
        <select class="input" name="active">
          <option value="true" ${isTrue(d.active) || d.active === undefined ? 'selected' : ''}>Aktif</option>
          <option value="false" ${!isTrue(d.active) && d.active !== undefined ? 'selected' : ''}>Nonaktif</option>
        </select></label>
    `;
    return wrap;
  }

  function attachPhotoHandler(wrap) {
    const file = wrap.querySelector('#photoFile');
    const urlInput = wrap.querySelector('[name="photoUrl"]');
    const preview = wrap.querySelector('#photoPreview');
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      try {
        const data = await resizeImageFile(f, 300, 0.75);
        urlInput.value = data;
        preview.innerHTML = `<img src="${data}" style="max-width:120px;border-radius:12px">`;
      } catch (e) { UI.toast('Gagal memuat gambar', 'error'); }
    });
    if (urlInput.value) preview.innerHTML = `<img src="${esc(urlInput.value)}" style="max-width:120px;border-radius:12px">`;
  }

  function addCandidate() {
    const wrap = candidateForm(null);
    attachPhotoHandler(wrap);
    UI.modal({
      title: 'Tambah Calon',
      body: wrap,
      size: 'lg',
      actions: [
        { label: 'Batal', type: 'ghost' },
        { label: 'Simpan', type: 'primary', onClick: async () => {
            const val = n => wrap.querySelector(`[name="${n}"]`).value.trim();
            const name = val('name');
            if (!name) { UI.toast('Nama wajib diisi', 'error'); return false; }
            const row = { noUrut: val('noUrut'), name, position: val('position') || 'ketua_rt', photoUrl: val('photoUrl'), visi: val('visi'), misi: val('misi'), active: val('active') === 'true' };
            const res = await API.post('save', { sheet: 'candidates', row });
            if (!res.success) { UI.toast(res.message || 'Gagal', 'error'); return false; }
            UI.toast('Calon ditambahkan', 'success');
            Cache.clearAll();
            await loadCandidates();
            return true;
          }},
      ],
    });
  }

  function editCandidate(id) {
    const c = allCandidates.find(x => String(x.id) === String(id));
    if (!c) return;
    const wrap = candidateForm(c);
    attachPhotoHandler(wrap);
    UI.modal({
      title: 'Edit Calon',
      body: wrap,
      size: 'lg',
      actions: [
        { label: 'Batal', type: 'ghost' },
        { label: 'Simpan', type: 'primary', onClick: async () => {
            const val = n => wrap.querySelector(`[name="${n}"]`).value.trim();
            const name = val('name');
            if (!name) { UI.toast('Nama wajib diisi', 'error'); return false; }
            const row = { ...c, noUrut: val('noUrut'), name, position: val('position') || c.position, photoUrl: val('photoUrl'), visi: val('visi'), misi: val('misi'), active: val('active') === 'true' };
            const res = await API.post('save', { sheet: 'candidates', row });
            if (!res.success) { UI.toast(res.message || 'Gagal', 'error'); return false; }
            UI.toast('Perubahan disimpan', 'success');
            Cache.clearAll();
            await loadCandidates();
            return true;
          }},
      ],
    });
  }

  async function deleteCandidate(id) {
    const c = allCandidates.find(x => String(x.id) === String(id));
    if (!c) return;
    if (!await UI.confirm(`Hapus calon "${c.name}"?`, { danger: true })) return;
    const res = await API.post('delete', { sheet: 'candidates', id });
    if (!res.success) { UI.toast(res.message || 'Gagal', 'error'); return; }
    UI.toast('Calon dihapus', 'success');
    Cache.clearAll();
    await loadCandidates();
  }

  /* ============================================================
   *  BOOTHS (Dengan Indikator Online/Offline)
   * ============================================================ */
  let allBooths = [];

  async function booths() {
    clearAllPolls();
    const el = view();
    el.innerHTML = `<div class="card"><div id="boothArea">${UI.skeleton(3)}</div></div>`;
    await loadBooths();
    setPoll('boothArea', 5000, loadBooths);
  }

  async function loadBooths() {
    const area = document.getElementById('boothArea');
    if (!area) return;
    
    const r = await Cache.fetchApi('booth.status', {});
    if (!r.success) return;
    
    allBooths = r.data || [];
    renderBooths();
  }

  function renderBooths() {
    const area = document.getElementById('boothArea');
    if (!area) return;
    const now = Date.now();
    
    area.innerHTML = `
      <div class="row-between">
        <div>
          <h3>Manajemen Bilik (${allBooths.length})</h3>
          <p class="hint">🟢 Online = Perangkat siap di lokasi. 🔴 Offline = Belum login / terputus.</p>
        </div>
        <button class="btn-primary" onclick="ViewsAdmin.addBooth()">+ Tambah Bilik</button>
      </div>
      <div style="margin-top:12px">
        ${allBooths.length === 0 ? `<p class="hint">Belum ada bilik.</p>` : allBooths.map(b => {
          
          const isOnline = b.lastActive && (now - Number(b.lastActive) < 120000);
          const statusIndicator = isOnline 
            ? `<span class="dot-indicator online" title="Perangkat Aktif"></span> Online`
            : `<span class="dot-indicator offline" title="Belum Login / Disconnect"></span> Offline`;

          return `
              <div class="booth-row ${b.status === 'occupied' ? 'occupied' : 'ready'}">
                <strong>${esc(b.name)}</strong>
                <span class="badge ${b.status === 'occupied' ? 'occupied' : 'ready'}">${esc(b.status || 'ready')}</span>
                <span class="hint" style="margin-left: 12px;">${statusIndicator}</span>
                <span class="hint" style="margin-left: auto;">${b.currentVoterId ? 'Sedang dipakai' : 'Siap'}</span>
                <div class="row" style="margin:0;margin-left:16px;gap:4px">
                  ${b.currentVoterId ? `<button class="btn-ghost btn-sm" onclick="ViewsAdmin.resetBooth('${esc(b.id)}')">Reset</button>` : ''}
                  <button class="btn-ghost btn-sm" onclick="ViewsAdmin.renameBooth('${esc(b.id)}')">Rename</button>
                  <button class="btn-danger btn-sm" onclick="ViewsAdmin.deleteBooth('${esc(b.id)}')">Hapus</button>
                </div>
              </div>`;
        }).join('')}
      </div>
    `;
  }

  async function addBooth() {
    const name = await UI.prompt('Nama bilik:', 'Bilik ' + (allBooths.length + 1));
    if (!name) return;
    const res = await API.post('save', { sheet: 'booths', row: { name, status: 'ready' } });
    if (!res.success) { UI.toast(res.message || 'Gagal', 'error'); return; }
    UI.toast('Bilik ditambahkan', 'success');
    Cache.clearAll();
    await loadBooths();
  }

  async function renameBooth(id) {
    const b = allBooths.find(x => String(x.id) === String(id));
    if (!b) return;
    const name = await UI.prompt('Nama baru:', b.name);
    if (!name || name === b.name) return;
    const res = await API.post('save', { sheet: 'booths', row: { ...b, name } });
    if (!res.success) { UI.toast(res.message || 'Gagal', 'error'); return; }
    UI.toast('Bilik diperbarui', 'success');
    Cache.clearAll();
    await loadBooths();
  }

  async function resetBooth(id) {
    if (!await UI.confirm('Kosongkan bilik ini?', { danger: true })) return;
    const res = await API.post('booth.setCurrent', { boothId: id, voterId: '' });
    if (!res.success) { UI.toast(res.message || 'Gagal', 'error'); return; }
    UI.toast('Bilik dikosongkan', 'success');
    Cache.clearAll();
    await loadBooths();
  }

  async function deleteBooth(id) {
    const b = allBooths.find(x => String(x.id) === String(id));
    if (!b) return;
    if (!await UI.confirm(`Hapus bilik "${b.name}"?`, { danger: true })) return;
    const res = await API.post('delete', { sheet: 'booths', id });
    if (!res.success) { UI.toast(res.message || 'Gagal', 'error'); return; }
    UI.toast('Bilik dihapus', 'success');
    Cache.clearAll();
    await loadBooths();
  }

  /* ============================================================
   *  USERS
   * ============================================================ */
  let allUsers = [];

  async function users() {
    clearAllPolls();
    const el = view();
    el.innerHTML = `<div class="card"><div id="userArea">${UI.skeleton(4)}</div></div>`;
    await loadUsers();
  }

  async function loadUsers() {
    const area = document.getElementById('userArea');
    if (!area) return;
    const r = await Cache.fetchApi('list', { sheet: 'users' });
    if (!r.success) { area.innerHTML = `<p class="hint" style="color:var(--err)">${esc(r.message || 'Gagal')}</p>`; return; }
    allUsers = r.data || [];
    const bRes = await Cache.fetchApi('list', { sheet: 'booths' });
    const boothName = {};
    (bRes.data || []).forEach(b => boothName[b.id] = b.name);
    renderUsers(boothName);
  }

  function renderUsers(boothName) {
    const area = document.getElementById('userArea');
    if (!area) return;
    area.innerHTML = `
      <div class="row-between">
        <div><h3>Pengguna (${allUsers.length})</h3><p class="hint">Admin / Petugas / Bilik.</p></div>
        <button class="btn-primary" onclick="ViewsAdmin.addUser()">+ Tambah Pengguna</button>
      </div>
      <div class="table-wrap" style="margin-top:12px">
        <table>
          <thead><tr><th>Username</th><th>Nama</th><th>Role</th><th>Bilik</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>
            ${allUsers.length === 0 ? `<tr><td colspan="6" class="hint" style="text-align:center;padding:24px">Belum ada pengguna</td></tr>` : allUsers.map(u => `
                <tr>
                  <td><code>${esc(u.username)}</code></td>
                  <td>${esc(u.name)}</td>
                  <td><span class="badge info">${esc(u.role)}</span></td>
                  <td>${esc(boothName[u.boothId] || '-')}</td>
                  <td>${isTrue(u.active) ? '<span class="badge ok">Aktif</span>' : '<span class="badge">Nonaktif</span>'}</td>
                  <td>
                    <div class="row" style="margin:0;gap:4px">
                      <button class="btn-ghost btn-sm" onclick="ViewsAdmin.editUser('${esc(u.id)}')">Edit</button>
                      ${String(u.id) !== String(me().id) ? `<button class="btn-danger btn-sm" onclick="ViewsAdmin.deleteUser('${esc(u.id)}')">Hapus</button>` : ''}
                    </div>
                  </td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async function userForm(u) {
    const d = u || {};
    const bRes = await Cache.fetchApi('list', { sheet: 'booths' });
    const booths = bRes.data || [];
    const wrap = UI.el('div');
    wrap.innerHTML = `
      <div class="grid-2">
        <label class="field"><span>Username *</span><input class="input" name="username" value="${esc(d.username || '')}" ${d.id ? 'readonly' : ''}></label>
        <label class="field"><span>Nama Lengkap *</span><input class="input" name="name" value="${esc(d.name || '')}"></label>
      </div>
      <label class="field"><span>Password ${d.id ? '(biarkan kosong jika tidak diubah)' : '*'}</span><input class="input" name="password" type="password" placeholder="••••••••"></label>
      <div class="grid-2">
        <label class="field"><span>Role *</span>
          <select class="input" name="role">
            ${['admin', 'petugas', 'bilik'].map(r => `<option value="${r}" ${d.role === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select></label>
        <label class="field"><span>Bilik (untuk role bilik)</span>
          <select class="input" name="boothId">
            <option value="">— tidak terhubung —</option>
            ${booths.map(b => `<option value="${esc(b.id)}" ${d.boothId === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
          </select></label>
      </div>
      <label class="field"><span>Status</span>
        <select class="input" name="active">
          <option value="true" ${d.active === undefined || isTrue(d.active) ? 'selected' : ''}>Aktif</option>
          <option value="false" ${!isTrue(d.active) && d.active !== undefined ? 'selected' : ''}>Nonaktif</option>
        </select></label>
    `;
    return wrap;
  }

  async function addUser() {
    const wrap = await userForm(null);
    UI.modal({
      title: 'Tambah Pengguna',
      body: wrap,
      size: 'lg',
      actions: [
        { label: 'Batal', type: 'ghost' },
        { label: 'Simpan', type: 'primary', onClick: async () => {
            const val = n => wrap.querySelector(`[name="${n}"]`).value.trim();
            const username = val('username');
            const password = wrap.querySelector('[name="password"]').value;
            const name = val('name');
            if (!username || !password || !name) { UI.toast('Username, password & nama wajib', 'error'); return false; }
            const row = { username, name, role: val('role') || 'petugas', boothId: val('boothId'), active: val('active') === 'true', passwordHash: password };
            const res = await API.post('save', { sheet: 'users', row });
            if (!res.success) { UI.toast(res.message || 'Gagal', 'error'); return false; }
            UI.toast('Pengguna ditambahkan', 'success');
            Cache.clearAll();
            await loadUsers();
            return true;
          }},
      ],
    });
  }

  async function editUser(id) {
    const u = allUsers.find(x => String(x.id) === String(id));
    if (!u) return;
    const wrap = await userForm(u);
    UI.modal({
      title: 'Edit Pengguna',
      body: wrap,
      size: 'lg',
      actions: [
        { label: 'Batal', type: 'ghost' },
        { label: 'Simpan', type: 'primary', onClick: async () => {
            const val = n => wrap.querySelector(`[name="${n}"]`).value.trim();
            const name = val('name');
            if (!name) { UI.toast('Nama wajib diisi', 'error'); return false; }
            const newPwd = wrap.querySelector('[name="password"]').value;
            const row = { ...u, name, role: val('role') || u.role, boothId: val('boothId'), active: val('active') === 'true' };
            if (newPwd) row.passwordHash = newPwd;
            const res = await API.post('save', { sheet: 'users', row });
            if (!res.success) { UI.toast(res.message || 'Gagal', 'error'); return false; }
            UI.toast('Pengguna diperbarui', 'success');
            Cache.clearAll();
            await loadUsers();
            return true;
          }},
      ],
    });
  }

  async function deleteUser(id) {
    const u = allUsers.find(x => String(x.id) === String(id));
    if (!u) return;
    if (u.role === 'admin' && allUsers.filter(x => x.role === 'admin').length <= 1) {
      UI.toast('Tidak dapat menghapus admin terakhir', 'error'); return;
    }
    if (!await UI.confirm(`Hapus pengguna "${u.username}"?`, { danger: true })) return;
    const res = await API.post('delete', { sheet: 'users', id });
    if (!res.success) { UI.toast(res.message || 'Gagal', 'error'); return; }
    UI.toast('Pengguna dihapus', 'success');
    Cache.clearAll();
    await loadUsers();
  }

  /* ============================================================
   *  INVITATIONS (Format Surat Formal + TTD Digital & PDF)
   * ============================================================ */
  let invLayoutMode = '4';

  async function invitations() {
    clearAllPolls();
    const el = view();
    el.innerHTML = `<div class="card"><div id="invArea">${UI.skeleton(4)}</div></div>`;

    const [r, st] = await Promise.all([
      Cache.fetchApi('list', { sheet: 'voters' }),
      Cache.fetchApi('list', { sheet: 'settings' })
    ]);
    
    if (!r.success) {
      document.getElementById('invArea').innerHTML = `<p class="hint" style="color:var(--err)">${esc(r.message || 'Gagal')}</p>`;
      return;
    }
    
    const voters = r.data || [];
    let signerName = me().name || 'Ketua Panitia';
    let signerSignature = ''; 
    
    if (st.success && st.data) {
      const map = {};
      st.data.forEach(s => map[s.key] = s.value);
      signerName = map.invitation_signer || signerName;
      signerSignature = map.invitation_signature || '';
    }

    const area = document.getElementById('invArea');
    if (!voters.length) {
      area.innerHTML = `<div class="text-center" style="padding:32px"><p class="hint">Belum ada pemilih.</p><a href="#/admin/voters" class="btn-primary">Ke Data Pemilih</a></div>`;
      return;
    }

    area.innerHTML = `
      <div class="row-between no-print">
        <div><h3>Undangan Pemilih (${voters.length})</h3></div>
        <div class="row" style="margin:0; align-items:center;">
          <select class="input" id="layoutSelect" style="width: 140px; height: 38px; padding: 0 10px;" onchange="ViewsAdmin.changeInvLayout(this.value)">
            <option value="4" ${invLayoutMode === '4' ? 'selected' : ''}>A4 dibagi 4</option>
            <option value="2" ${invLayoutMode === '2' ? 'selected' : ''}>A4 dibagi 2</option>
          </select>
          <button class="btn-ghost" onclick="ViewsAdmin.exportInvCSV()">⬇️ CSV</button>
          <button class="btn-ghost" id="btnExportPDF" onclick="ViewsAdmin.exportInvPDF()">📄 PDF</button>
          <button class="btn-primary" onclick="window.print()">🖨️ Cetak</button>
        </div>
      </div>
      
      <!-- WRAPPER UNTUK HTML2PDF (Hanya ambil area ini) -->
      <div id="invPrintArea" style="margin-top:12px; background:var(--bg); padding: 10px;">
        <div class="invitations-sheet ${invLayoutMode === '2' ? 'layout-2' : 'layout-4'}" id="invSheet"></div>
      </div>
    `;

    const sheet = document.getElementById('invSheet');
    const today = new Date();
    const dateStr = today.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

    voters.forEach(v => {
      const cell = document.createElement('div');
      cell.className = 'invite';
      
      cell.innerHTML = `
        <div class="invite-inner">
          <div class="kop-surat">
            <img src="assets/logo.svg" alt="" onerror="this.style.visibility='hidden'">
            <div class="kop-text">
              <div class="kop-title">PERKUMPULAN PEMUDA-PEMUDI</div>
              <div class="kop-title">RUKUN AGAWE SANTOSA (RAS)</div>
              <div class="kop-sub">Jl. Parangtritis Km 6,5 Ngijo Bangunharjo Sewon Bantul</div>
            </div>
          </div>
          
          <div class="surat-body">
            <div class="surat-header">
              <span>Hal: Undangan Pemilihan</span>
              <div class="surat-tujuan">
                Kepada Bapak/Ibu/Sdr:<br>
                <strong class="nama-pemilih">${esc(v.name)}</strong><br>
                <span style="font-size: 10px; color: #444;">RT ${esc(v.rt || '-')} / RW ${esc(v.rw || '-')}</span>
              </div>
            </div>
            
            <div class="surat-isi">
              <p>Dengan Hormat,</p>
              <p>Mengharap kehadiran Bapak/Ibu/Sdr pada acara <strong>Pemungutan Suara</strong> yang akan diselenggarakan pada:</p>
              
              <table class="surat-tabel">
                <tr><td>Hari, tanggal</td><td>:</td><td><strong>_______________________</strong></td></tr>
                <tr><td>Pukul</td><td>:</td><td>08.00 WIB - Selesai</td></tr>
                <tr><td>Tempat</td><td>:</td><td>Balai RW / Gedung TPA</td></tr>
                <tr><td>Acara</td><td>:</td><td>Pemilihan Ketua RT & Ketua Pemuda</td></tr>
              </table>
              
              <p>Demikian atas perhatian dan kehadiran Bapak/Ibu/Sdr, kami mengucapkan terima kasih.</p>
            </div>
            
            <div class="surat-ttd">
              <div class="ttd-box">
                <div class="ttd-jabatan" style="font-weight:bold; margin-bottom: 6px;">Scan Pemilih</div>
                <div class="qr-scan-wrapper">
                  <div class="qr-image" id="qr-${esc(v.id)}"></div>
                  <div class="qr-code-text">${esc(v.code)}</div>
                </div>
              </div>
              
              <div class="ttd-box">
                <div class="ttd-jabatan">Hormat kami,<br>Ketua Panitia</div>
                <div class="ttd-space">
                  ${signerSignature ? `<img src="${signerSignature}" alt="TTD">` : ''}
                </div>
                <div class="ttd-nama">${esc(signerName)}</div>
              </div>
            </div>
          </div>
        </div>`;
      sheet.appendChild(cell);
    });

    await new Promise(r => setTimeout(r, 100));
    voters.forEach(v => {
      const qrEl = document.getElementById('qr-' + v.id);
      if (qrEl) try { 
        QR.generate(qrEl, v.code, 85); 
      } catch (e) { console.error('QR Error', e); }
    });
  }

  function changeInvLayout(mode) {
    invLayoutMode = mode;
    const sheet = document.getElementById('invSheet');
    if (sheet) {
      if (mode === '2') {
        sheet.classList.remove('layout-4');
        sheet.classList.add('layout-2');
      } else {
        sheet.classList.remove('layout-2');
        sheet.classList.add('layout-4');
      }
    }
  }

  async function exportInvPDF() {
    const btn = document.getElementById('btnExportPDF');
    const originalText = btn.innerHTML;
    
    if (typeof html2pdf === 'undefined') {
      btn.innerHTML = 'Memuat...';
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    btn.innerHTML = 'Memproses...';
    btn.disabled = true;

    const element = document.getElementById('invPrintArea');
    
    const opt = {
      margin:       0,
      filename:     'undangan-pemilih.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
      await html2pdf().set(opt).from(element).save();
      UI.toast('PDF berhasil diunduh', 'success');
    } catch (err) {
      console.error('PDF Error:', err);
      UI.toast('Gagal membuat PDF', 'error');
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }

  async function exportInvCSV() {
    const r = await Cache.fetchApi('list', { sheet: 'voters' });
    if (!r.success) { UI.toast('Gagal', 'error'); return; }
    const rows = [['kode', 'nama', 'rt', 'rw', 'telepon']];
    (r.data || []).forEach(v => rows.push([v.code || '', v.name || '', v.rt || '', v.rw || '', v.phone || '']));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'daftar-pemilih.csv'; a.click();
  }

  /* ============================================================
   *  RESULTS
   * ============================================================ */
  let lastResultsData = null;

  async function results() {
    clearAllPolls();
    const el = view();
    el.innerHTML = `
      <div class="card">
        <div class="row-between">
          <div><h3>Hasil Real-Time</h3><p class="hint" id="resSub">Memuat…</p></div>
          <div class="row" style="margin:0">
            <button class="btn-ghost" onclick="ViewsAdmin.exportResultsCSV()">⬇️ CSV</button>
            <button class="btn-ghost" onclick="window.print()">🖨️ Cetak</button>
          </div>
        </div>
        <div id="resultsBox" style="margin-top:16px">${UI.skeleton(4)}</div>
      </div>`;
    refreshResults();
    setPoll('resultsBox', 3000, refreshResults);
  }

  async function refreshResults() {
    const box = document.getElementById('resultsBox');
    if (!box) return;
    const r = await API.post('results');
    if (!r.success) { box.innerHTML = `<p class="hint" style="color:var(--err)">${esc(r.message || 'Gagal')}</p>`; return; }
    
    lastResultsData = r;
    const groups = r.groups || {};
    const posKeys = Object.keys(groups);

    if (!posKeys.length) { box.innerHTML = `<p class="hint">Belum ada suara masuk.</p>`; return; }

    const sub = document.getElementById('resSub');
    if (sub) sub.textContent = `${r.totalVoted} / ${r.totalVoters} pemilih • ${UI.formatTime(r.timestamp)}`;

    box.innerHTML = posKeys.map(pos => {
      const items = groups[pos];
      const total = items.reduce((s, c) => s + (c.votes || 0), 0) || 1;
      const maxVotes = Math.max(...items.map(c => c.votes || 0), 0);
      return `
        <div class="res-group">
          <h4>${esc(labelPos(pos))}</h4>
          ${items.map(c => {
            const pct = Math.round((c.votes || 0) / total * 100);
            const isTop = maxVotes > 0 && (c.votes || 0) === maxVotes;
            return `
              <div class="res-bar">
                <div class="res-name" title="${esc(c.name)}">${isTop ? '👑 ' : ''}${esc(c.name)}</div>
                <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
                <div class="res-count">${c.votes || 0}</div>
              </div>`;
          }).join('')}
        </div>`;
    }).join('');
  }

  function exportResultsCSV() {
    if (!lastResultsData || !lastResultsData.groups) { UI.toast('Belum ada data', 'error'); return; }
    const rows = [['posisi', 'no_urut', 'nama', 'suara']];
    Object.keys(lastResultsData.groups).forEach(pos => {
      lastResultsData.groups[pos].forEach(c => {
        rows.push([labelPos(pos), c.noUrut || '', c.name, c.votes || 0]);
      });
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'hasil-pemilihan.csv'; a.click();
  }

  /* ============================================================
   *  BERITA ACARA
   * ============================================================ */
  async function beritaAcara() {
    clearAllPolls();
    const el = view();
    el.innerHTML = `<div class="card"><div id="baArea">${UI.skeleton(4)}</div></div>`;
    await loadBeritaAcara();
  }

  async function loadBeritaAcara() {
    const area = document.getElementById('baArea');
    if (!area) return;
    const r = await Cache.fetchApi('ba.list', {});
    if (!r.success) { area.innerHTML = `<p class="hint" style="color:var(--err)">${esc(r.message || 'Gagal')}</p>`; return; }
    
    const items = (r.data || []).slice().reverse();
    area.innerHTML = `
      <div class="row-between">
        <div><h3>Berita Acara (${items.length})</h3><p class="hint">Dokumentasi hasil pemungutan suara.</p></div>
        <button class="btn-primary" onclick="ViewsAdmin.newBeritaAcara()">+ Buat Berita Acara</button>
      </div>
      <div id="baList" style="margin-top:12px">
        ${items.length === 0 ? `<p class="hint">Belum ada berita acara.</p>` : items.map(b => `
              <div class="ba-item">
                <strong>${esc(b.title || 'Berita Acara')}</strong>
                <small>${UI.formatDateTime(b.createdAt)} — ${esc(b.createdBy || '-')}</small>
                <pre>${esc(b.content || '')}</pre>
                <div class="row" style="margin-top:8px">
                  <button class="btn-ghost btn-sm" onclick="ViewsAdmin.printBeritaAcara('${esc(b.id)}')">🖨️ Cetak</button>
                </div>
              </div>`).join('')}
      </div>
    `;
  }

  async function newBeritaAcara() {
    const wrap = UI.el('div');
    const today = new Date();
    const defaultContent = `Pada hari ini, ${today.toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}, telah dilaksanakan pemungutan suara untuk Pemilihan Ketua RT / Ketua & Wakil Pemuda.\n\nJumlah pemilih terdaftar: ____\nJumlah pemilih hadir: ____\nJumlah suara sah: ____\nJumlah suara tidak sah: ____\n\nPemungutan suara berjalan aman, tertib, dan lancar.\n\nDemikian berita acara ini dibuat untuk dipergunakan sebagaimana mestinya.`;
    const signatures = [];

    wrap.innerHTML = `
      <label class="field"><span>Judul</span><input class="input" name="title" value="Berita Acara Pemungutan Suara ${today.getFullYear()}"></label>
      <label class="field"><span>Isi Berita Acara</span><textarea class="input" name="content" rows="8">${esc(defaultContent)}</textarea></label>
      <label class="field"><span>Foto Dokumentasi</span><input type="file" accept="image/*" multiple id="baPhotos"></label>
      <div id="baPhotoPreview" class="row"></div>
      <hr>
      <div class="row-between"><h4 style="margin:0">Penandatangan</h4><button type="button" class="btn-ghost btn-sm" id="btnAddSigner">+ Tambah Penandatangan</button></div>
      <div id="signerList" style="margin-top:10px"></div>
    `;

    const photoData = [];

    UI.modal({
      title: 'Buat Berita Acara',
      body: wrap,
      size: 'lg',
      actions: [
        { label: 'Batal', type: 'ghost' },
        { label: 'Simpan', type: 'primary', onClick: async () => {
            const title = wrap.querySelector('[name="title"]').value.trim();
            const content = wrap.querySelector('[name="content"]').value.trim();
            if (!title) { UI.toast('Judul wajib', 'error'); return false; }
            const res = await API.post('ba.save', { title, content, photos: photoData, signatures, createdBy: me().name || me().username || '-' });
            if (!res.success) { UI.toast(res.message || 'Gagal', 'error'); return false; }
            UI.toast('Berita Acara tersimpan', 'success');
            Cache.clearAll();
            await loadBeritaAcara();
            return true;
          }},
      ],
    });

    const photoInput = wrap.querySelector('#baPhotos');
    const photoPrev = wrap.querySelector('#baPhotoPreview');
    photoInput.addEventListener('change', async () => {
      for (const f of Array.from(photoInput.files)) {
        try {
          const data = await resizeImageFile(f, 500, 0.7);
          photoData.push(data);
          const img = document.createElement('img');
          img.src = data; img.style.cssText = 'width:80px;height:80px;object-fit:cover;border-radius:10px';
          photoPrev.appendChild(img);
        } catch (_) {}
      }
    });

    const signerList = wrap.querySelector('#signerList');
    wrap.querySelector('#btnAddSigner').onclick = () => {
      const idx = signatures.length;
      const item = document.createElement('div');
      item.className = 'card'; item.style.padding = '12px';
      item.innerHTML = `
        <div class="row-between">
          <div class="grid-2" style="flex:1;gap:8px">
            <input class="input" placeholder="Nama penandatangan" data-sig-name="${idx}">
            <input class="input" placeholder="Jabatan / Peran" data-sig-role="${idx}">
          </div>
          <button class="btn-danger btn-sm" type="button">Hapus</button>
        </div>
        <div style="margin-top:8px" data-sig-pad="${idx}"></div>
      `;
      signerList.appendChild(item);
      const sigMount = Sign.mount(item.querySelector(`[data-sig-pad="${idx}"]`));
      signatures.push({ name: '', role: '', dataUrl: '', _pad: sigMount, _el: item });
      item.querySelector('.btn-danger').onclick = () => {
        signatures.splice(idx, 1);
        item.remove();
      };
    };

    wrap.querySelector('#btnAddSigner').click();
  }

  async function printBeritaAcara(id) {
    const r = await Cache.fetchApi('ba.list', {});
    if (!r.success) return;
    const b = (r.data || []).find(x => String(x.id) === String(id));
    if (!b) return;
    
    let photos = [], signatures = [];
    try { photos = JSON.parse(b.photos || '[]'); } catch (_) {}
    try { signatures = JSON.parse(b.signatures || '[]'); } catch (_) {}

    const w = window.open('', '_blank');
    if (!w) { UI.toast('Pop-up diblokir browser', 'error'); return; }
    w.document.write(`
      <!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(b.title)}</title>
      <style>
        body { font-family: 'Times New Roman', serif; padding: 30px; max-width: 800px; margin: auto; color: #111; }
        h1 { text-align: center; font-size: 20px; margin-bottom: 4px; }
        h2 { text-align: center; font-size: 14px; font-weight: normal; margin-top: 0; }
        .meta { text-align: center; font-size: 12px; color: #666; margin-bottom: 24px; }
        .content { white-space: pre-wrap; line-height: 1.7; font-size: 14px; text-align: justify; }
        .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 24px; }
        .photos img { width: 100%; border: 1px solid #ccc; border-radius: 6px; }
        .sigs { display: flex; justify-content: space-around; margin-top: 40px; gap: 12px; flex-wrap: wrap; }
        .sig { text-align: center; min-width: 180px; }
        .sig img { height: 70px; display: block; margin: 6px auto; }
        .sig-line { border-top: 1px solid #111; margin-top: 10px; padding-top: 4px; font-size: 12px; }
        @media print { body { padding: 0; } }
      </style></head><body>
        <h1>BERITA ACARA</h1>
        <h2>${esc(b.title)}</h2>
        <div class="meta">${UI.formatDateTime(b.createdAt)} • ${esc(b.createdBy || '-')}</div>
        <div class="content">${esc(b.content)}</div>
        ${photos.length ? `<div class="photos">${photos.map(p => `<img src="${p}">`).join('')}</div>` : ''}
        ${signatures.length ? `<div class="sigs">${signatures.map(s => `
          <div class="sig">${s.dataUrl ? `<img src="${s.dataUrl}">` : '<div style="height:70px"></div>'}
            <div class="sig-line">${esc(s.name || '-')}<br><small>${esc(s.role || '')}</small></div>
          </div>`).join('')}</div>` : ''}
        <script>setTimeout(()=>window.print(), 600);</script>
      </body></html>
    `);
    w.document.close();
  }

  /* ============================================================
   *  EXPORTS
   * ============================================================ */
  return {
    dashboard,
    voters, addVoter, editVoter, deleteVoter, searchVoters, setVoterSort, setVoterFilterRt, bulkImport,
    candidates, addCandidate, editCandidate, deleteCandidate,
    booths, addBooth, renameBooth, resetBooth, deleteBooth,
    users, addUser, editUser, deleteUser,
    invitations, exportInvCSV, changeInvLayout, exportInvPDF,
    results, exportResultsCSV,
    beritaAcara, newBeritaAcara, printBeritaAcara,
    settings,
    _clearAllPolls: clearAllPolls,
  };
})();