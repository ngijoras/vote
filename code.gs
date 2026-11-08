/** ============================================================
 *  E-VOTE — Apps Script Backend (FINAL + COKLIT RT)
 *  Fitur: Auth, CRUD, Upload Drive, Voting, Reset, Backup,
 *         Audit Log, Coklit per RT, Auto-Sync Admin.
 *  ============================================================ */
const SS = SpreadsheetApp.getActiveSpreadsheet();

const SHEETS = {
  users: 'Users', voters: 'Voters', candidates: 'Candidates', votes: 'Votes',
  booths: 'Booths', attendance: 'Attendance', settings: 'Settings',
  berita: 'BeritaAcara', logs: 'Logs', feedback: 'Feedback',
};

const TOKEN_TTL = 6 * 60 * 60;   // 6 jam
const CELL_MAX  = 47000;

const HEADERS = {
  Users:       ['id', 'username', 'passwordHash', 'name', 'role', 'boothId', 'active', 'createdAt', 'rt'],
  Voters:      ['id', 'code', 'name', 'rt', 'rw', 'address', 'phone', 'voted', 'checkinAt', 'boothId', 'photoUrl', 'signature', 'coklitStatus'],
  Candidates:  ['id', 'noUrut', 'name', 'position', 'photoUrl', 'visi', 'misi', 'active'],
  Votes:       ['id', 'voterId', 'candidateId', 'position', 'timestamp', 'boothId'],
  Booths:      ['id', 'name', 'status', 'currentVoterId', 'updatedAt', 'lastActive'],
  Attendance:  ['id', 'voterId', 'timestamp', 'signature', 'photoUrl', 'boothId'],
  Settings:    ['key', 'value'],
  BeritaAcara: ['id', 'title', 'content', 'photos', 'signatures', 'createdAt', 'createdBy'],
  Logs:        ['timestamp', 'user', 'action', 'detail'],
  Feedback:    ['id', 'name', 'contact', 'category', 'message', 'timestamp', 'status'],
};

const PUBLIC_SETTINGS = [
  'event_name', 'event_location', 'election_date',
  'invitation_signer', 'invitation_signature', 'voter_positions', 'voting_mode'
];

/* ============================================================
 *  ROUTER
 * ============================================================ */
function doGet(e)  { return route_(e); }
function doPost(e) { return route_(e); }

function route_(e) {
  const p  = (e && e.parameter) || {};
  const ct = (e && e.postData && e.postData.type) || '';
  let body = {};
  let fileBlob = null;

  /* ---------- Parse body ---------- */
  if (ct.indexOf('multipart/form-data') !== -1) {
    body = safeParse_(p.payload || '{}');
    const b64 = p.file_data || '';
    if (b64) {
      try {
        const pure = b64.indexOf(',') > -1 ? b64.split(',')[1] : b64;
        fileBlob = Utilities.newBlob(
          Utilities.base64Decode(pure),
          'image/jpeg',
          'img_' + Date.now() + '.jpg'
        );
      } catch (_) {}
    }
  } else if (e && e.postData && e.postData.contents) {
    body = safeParse_(e.postData.contents);
    if (body.fileData) {
      try {
        const b64 = String(body.fileData);
        const pure = b64.indexOf(',') > -1 ? b64.split(',')[1] : b64;
        fileBlob = Utilities.newBlob(
          Utilities.base64Decode(pure),
          'image/jpeg',
          'img_' + Date.now() + '.jpg'
        );
      } catch (_) {}
    }
  }

  const action = p.action || body.action;
  const token  = p.token  || body.token;
  let out;

  try {
    /* ✅ Auto-migrate schema (murah, cuma cek header) */
    try {
      ['users', 'voters', 'candidates', 'booths', 'votes', 'attendance',
       'settings', 'berita', 'logs', 'feedback'].forEach(ensureHeaders_);
    } catch (err) {
      console.warn('[migrate]', err);
    }

    switch (action) {
      /* ---------- PUBLIC ---------- */
      case 'health':             out = { success: true, data: { ok: true, time: new Date().toISOString() } }; break;
      case 'candidates.public':  out = publicCandidates_(); break;
      case 'settings.public':    out = publicSettings_(); break;
      case 'feedback.save':      out = saveFeedback_(body); break;
      case 'login':              out = login_(body); break;
      case 'logout':             out = logout_(token); break;
      case 'me':                 out = me_(token); break;

      /* ---------- GENERIC CRUD ---------- */
      case 'list':   out = withAuth_(token, null, () => listRows_(body.sheet, body.filter)); break;
      case 'save':   out = withAuth_(token, null, () => saveRow_(body.sheet, body.row)); break;
      case 'delete': out = withAuth_(token, null, () => deleteRow_(body.sheet, body.id)); break;

      /* ---------- SETTINGS ---------- */
      case 'settings.save':  out = withAuth_(token, ['admin'], () => saveSetting_(body, fileBlob)); break;

      /* ---------- VOTERS ---------- */
      case 'voters.bulk':    out = withAuth_(token, ['admin', 'petugas'], () => saveVotersBulk_(body.rows)); break;
      case 'voters.byCode':  out = withAuth_(token, ['admin', 'petugas', 'bilik'], () => voterByCode_(body.code)); break;
      case 'voters.reset':   out = withAuth_(token, ['admin'], () => resetVoter_(body.id)); break;
      case 'voters.coklit':  out = withAuth_(token, ['admin', 'coklit'], (u) => updateCoklitStatus_(body, u)); break;

      /* ---------- COKLIT REPORT (Admin & Petugas) ---------- */
      case 'coklit.report':  out = withAuth_(token, ['admin', 'petugas'], () => coklitReport_()); break;

      /* ---------- ATTENDANCE ---------- */
      case 'attendance.checkin': out = withAuth_(token, ['petugas', 'admin'], (u) => checkin_(u, body)); break;
      case 'attendance.list':    out = withAuth_(token, null, () => listRows_('attendance')); break;

      /* ---------- BOOTHS ---------- */
      case 'booth.claim':      out = withAuth_(token, ['bilik'], (u) => boothClaim_(u, body.boothId)); break;
      case 'booth.ping':       out = withAuth_(token, ['bilik'], (u) => pingBooth_(u)); break;
      case 'booth.status':     out = withAuth_(token, null, () => listBoothsWithPing_()); break;
      case 'booth.setCurrent': out = withAuth_(token, ['petugas', 'admin'], () => setBoothCurrent_(body)); break;

      /* ---------- VOTING ---------- */
      case 'vote.submit': out = withAuth_(token, ['bilik'], (u) => submitVotes_(u, body)); break;
      case 'results':     out = withAuth_(token, null, () => results_()); break;

      /* ---------- BERITA ACARA ---------- */
      case 'ba.save': out = withAuth_(token, ['admin', 'petugas'], () => saveBerita_(body)); break;
      case 'ba.list': out = withAuth_(token, null, () => listRows_('berita')); break;

      /* ---------- BACKUP / LOGS ---------- */
      case 'logs.list':     out = withAuth_(token, ['admin'], () => listRows_('logs')); break;
      case 'backup.export': out = withAuth_(token, ['admin'], () => exportBackup_()); break;
      case 'backup.import': out = withAuth_(token, ['admin'], () => importBackup_(body)); break;

      /* ---------- DASHBOARD ---------- */
      case 'dash.summary': out = withAuth_(token, null, () => dashSummary_()); break;

      default: out = { success: false, message: 'Unknown action: ' + action };
    }
  } catch (err) {
    out = { success: false, message: String(err && err.message ? err.message : err) };
    try { log_('-', action || 'unknown', 'ERROR: ' + err); } catch (_) {}
  }
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeParse_(s) { try { return JSON.parse(s); } catch (_) { return {}; } }

/* ============================================================
 *  SCHEMA MIGRATION (auto-add missing columns)
 * ============================================================ */
function ensureHeaders_(name) {
  const realName = SHEETS[name] || name;
  const headers  = HEADERS[realName];
  if (!headers || !headers.length) return;

  const sh = sheet_(name);
  const lastCol = sh.getLastColumn();
  const current = lastCol > 0
    ? sh.getRange(1, 1, 1, lastCol).getValues()[0]
    : [];

  // Jika header identik (jumlah & urutan sama) → skip
  if (current.length === headers.length &&
      headers.every((h, i) => String(current[i]) === h)) return;

  const missing = headers.filter(h => current.indexOf(h) === -1);

  // Tulis ulang header lengkap (baris data tidak disentuh)
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.setFrozenRows(1);

  if (missing.length) {
    try {
      log_('-', 'migrate', 'Sheet ' + realName + ' → kolom ditambah: ' + missing.join(', '));
    } catch (_) {}
  }
}

/* ============================================================
 *  AUTH
 * ============================================================ */
function requireAuth_(token, roles) {
  if (!token || typeof token !== 'string') throw new Error('Token required');
  const raw = CacheService.getScriptCache().get('tok_' + token);
  if (!raw) throw new Error('Token expired, silakan login ulang');
  const u = JSON.parse(raw);
  if (!u || u.exp < Date.now()) throw new Error('Token expired, silakan login ulang');
  if (roles && roles.length && roles.indexOf(String(u.role).toLowerCase()) === -1) {
    throw new Error('Akses ditolak');
  }
  return u;
}

function withAuth_(token, roles, fn) {
  const u = requireAuth_(token, roles);
  return fn(u);
}

function login_(body) {
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!username || !password) {
    return { success: false, message: 'Username dan password wajib diisi' };
  }

  const users = getRows_('users');
  const user = users.find(u =>
    String(u.username) === username && truthy_(u.active)
  );
  if (!user) return { success: false, message: 'User tidak ditemukan / nonaktif' };
  if (String(user.passwordHash) !== hash_(password)) {
    return { success: false, message: 'Password salah' };
  }

  const token = Utilities.base64Encode(
    uuid_() + ':' + Date.now() + ':' + username
  );
  const payload = {
    id: user.id,
    username: user.username,
    role: String(user.role || '').toLowerCase(),
    name: user.name || user.username,
    boothId: user.boothId || '',
    rt: String(user.rt || '').trim(),       // ✅ RT penanggung jawab (untuk coklit)
    exp: Date.now() + TOKEN_TTL * 1000,
  };
  CacheService.getScriptCache().put('tok_' + token, JSON.stringify(payload), TOKEN_TTL);
  log_(username, 'login', 'OK');
  return {
    success: true,
    token,
    user: {
      id: payload.id, username: payload.username,
      role: payload.role, name: payload.name,
      boothId: payload.boothId, rt: payload.rt,
    },
  };
}

function me_(token) {
  const u = requireAuth_(token);
  return {
    success: true,
    user: {
      id: u.id, username: u.username, role: u.role,
      name: u.name, boothId: u.boothId,
      rt: u.rt || '',                        // ✅
    },
  };
}

function logout_(token) {
  if (token && typeof token === 'string') {
    try { CacheService.getScriptCache().remove('tok_' + token); } catch (_) {}
  }
  return { success: true };
}

/* ============================================================
 *  UTIL
 * ============================================================ */
function safeCell_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean' || typeof v === 'number') return v;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch (_) { return String(v); }
  }
  const s = String(v);
  return s.length > CELL_MAX ? s.substring(0, CELL_MAX) : s;
}

function truthy_(v) {
  if (v === true) return true;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'ya' || s === 'yes';
}

function uuid_() { return Utilities.getUuid(); }

function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s))
    .map(b => ((b < 0 ? b + 256 : b).toString(16)).padStart(2, '0')).join('');
}

/* ✅ NORMALISASI RT (PENTING!) */
function normalizeRt_(rt) {
  let val = String(rt || '').trim();
  if (!val) return '';
  if (val.endsWith('.0')) val = val.slice(0, -2);
  if (val.length === 1) val = '0' + val;
  return val;
}

function sheet_(name) {
  const realName = SHEETS[name] || name;
  let sh = SS.getSheetByName(realName);
  if (!sh) {
    sh = SS.insertSheet(realName);
    const headers = HEADERS[realName] || HEADERS[name] || [];
    if (headers.length) {
      sh.appendRow(headers);
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

function headersOf_(name) {
  return HEADERS[SHEETS[name] || name] || HEADERS[name] || [];
}

function getRows_(name) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const head = values.shift();
  return values.map(r => {
    const o = {};
    head.forEach((h, i) => {
      o[h] = (r[i] === null || r[i] === undefined) ? '' : r[i];
    });
    return o;
  }).filter(o => o.id || o.key || o.username);
}

function findRowIndex_(name, id) {
  const rows = sheet_(name).getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) return i + 1;
  }
  return -1;
}

function listRows_(name, filter) {
  let data = getRows_(name);
  if (filter && typeof filter === 'object') {
    const keys = Object.keys(filter);
    data = data.filter(r => keys.every(k =>
      String(r[k]).trim().toLowerCase() === String(filter[k]).trim().toLowerCase()
    ));
  }
  return { success: true, data };
}

function saveRow_(name, row) {
  if (!row || typeof row !== 'object') {
    return { success: false, message: 'row wajib object' };
  }
  const realName = SHEETS[name] || name;
  const sh = sheet_(name);
  const headers = headersOf_(name);
  if (!headers.length) return { success: false, message: 'Sheet tidak dikenal: ' + name };
  if (!row.id) row.id = uuid_();

  if (realName === 'Users' && row.password) {
    row.passwordHash = hash_(row.password);
    delete row.password;
  }

  const idx = findRowIndex_(name, row.id);
  let existing = {};
  if (idx > 0) {
    const cur = sh.getRange(idx, 1, 1, headers.length).getValues()[0];
    headers.forEach((h, i) => { existing[h] = cur[i]; });
  }

  /* ✅ AUTO-RESET coklit saat Admin edit data krusial pemilih */
  if (realName === 'Voters' && idx > 0) {
    const criticalFields = ['name', 'rt', 'rw', 'address', 'phone'];
    const changed = criticalFields.some(f =>
      String(existing[f] || '').trim() !== String(row[f] || '').trim()
    );

    if (changed &&
        row.coklitStatus === undefined &&
        ['valid', 'invalid'].indexOf(String(existing.coklitStatus || '')) !== -1) {
      row.coklitStatus = 'pending';
      try {
        log_('-', 'coklit_reset', 'Data berubah → reset ke pending: ' + (existing.name || '-'));
      } catch (_) {}
    }
  }

  const merged = Object.assign({}, existing, row);
  const arr = headers.map(h => safeCell_(merged[h]));
  if (idx > 0) sh.getRange(idx, 1, 1, headers.length).setValues([arr]);
  else sh.appendRow(arr);
  return { success: true, data: merged };
}

function deleteRow_(name, id) {
  if (!id) return { success: false, message: 'id wajib' };
  if ((SHEETS[name] || name) === 'Users') {
    const users = getRows_('users');
    const target = users.find(u => String(u.id) === String(id));
    if (target && String(target.role) === 'admin') {
      const adminCount = users.filter(u =>
        String(u.role) === 'admin' && truthy_(u.active)
      ).length;
      if (adminCount <= 1) {
        return { success: false, message: 'Tidak dapat menghapus admin terakhir' };
      }
    }
  }
  const idx = findRowIndex_(name, id);
  if (idx > 0) sheet_(name).deleteRow(idx);
  return { success: true };
}

function log_(user, action, detail) {
  try {
    sheet_('logs').appendRow([
      new Date(), safeCell_(user || '-'), safeCell_(action || '-'), safeCell_(detail || '')
    ]);
  } catch (_) {}
}

/* ============================================================
 *  DRIVE UPLOAD (lh3)
 * ============================================================ */
function uploadToDrive_(blob, folderName) {
  try {
    const it = DriveApp.getFoldersByName(folderName);
    const folder = it.hasNext() ? it.next() : DriveApp.createFolder(folderName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return 'https://lh3.googleusercontent.com/d/' + file.getId();
  } catch (err) {
    console.error('[upload]', err);
    return '';
  }
}

function normalizeImageField_(base64, folderName, ext) {
  if (!base64) return '';
  const s = String(base64);
  if (s.indexOf('data:image') !== 0) return s;

  try {
    const pure = s.indexOf(',') > -1 ? s.split(',')[1] : s;
    const mime = (s.match(/^data:(image\/[a-z]+);/i) || [, 'image/jpeg'])[1];
    const blob = Utilities.newBlob(
      Utilities.base64Decode(pure),
      mime,
      'img_' + Date.now() + '.' + (ext || 'jpg')
    );
    return uploadToDrive_(blob, folderName || 'E-Vote_Images');
  } catch (err) {
    console.error('[normalizeImg]', err);
    return '';
  }
}

/* ============================================================
 *  PUBLIC API
 * ============================================================ */
function publicSettings_() {
  const settings = getRows_('settings');
  const res = {};
  settings.forEach(s => {
    if (PUBLIC_SETTINGS.indexOf(String(s.key)) !== -1) res[s.key] = s.value;
  });
  return { success: true, data: res };
}

function publicCandidates_() {
  const candidates = getRows_('candidates').filter(c => truthy_(c.active));
  const groups = {};
  candidates.forEach(c => {
    const pos = String(c.position || 'lainnya');
    groups[pos] = groups[pos] || [];
    groups[pos].push({
      id: c.id, noUrut: c.noUrut, name: c.name,
      photoUrl: c.photoUrl || '', visi: c.visi || '',
      misi: c.misi || '', position: c.position,
    });
  });
  Object.keys(groups).forEach(pos => {
    groups[pos].sort((a, b) => (Number(a.noUrut) || 0) - (Number(b.noUrut) || 0));
  });
  return { success: true, groups };
}

function saveFeedback_(body) {
  if (!body.message || String(body.message).trim() === '') {
    return { success: false, message: 'Pesan tidak boleh kosong' };
  }
  const row = {
    id: uuid_(),
    name: safeCell_(body.name || 'Anonim'),
    contact: safeCell_(body.contact || '-'),
    category: safeCell_(body.category || 'Umum'),
    message: safeCell_(body.message),
    timestamp: new Date().toISOString(),
    status: 'Baru',
  };
  sheet_('feedback').appendRow(HEADERS.Feedback.map(h => row[h]));
  return { success: true, message: 'Kritik dan saran berhasil dikirim.' };
}

/* ============================================================
 *  SETTINGS
 * ============================================================ */
function saveSetting_(body, fileBlob) {
  const key = String(body.key || '').trim();
  let val = String(body.value || '').trim();
  if (!key) return { success: false, message: 'Key required' };

  if (fileBlob) {
    const url = uploadToDrive_(fileBlob, 'E-Vote_Assets');
    if (!url) return { success: false, message: 'Gagal upload ke Drive' };
    val = url;
  }
  else if (val && val.indexOf('data:image') === 0) {
    const url = normalizeImageField_(val, 'E-Vote_Assets', 'jpg');
    if (!url) return { success: false, message: 'Gagal upload base64 ke Drive' };
    val = url;
  }
  else if (!val && key !== 'invitation_signature' && key !== 'voting_mode') {
    return { success: true, data: { key: key, value: '(unchanged)', skipped: true } };
  }

  const sh = sheet_('settings');
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === key) {
      sh.getRange(i + 1, 2).setValue(val);
      return { success: true, data: { key: key, value: val } };
    }
  }
  sh.appendRow([key, val]);
  return { success: true, data: { key: key, value: val } };
}

/* ============================================================
 *  VOTERS
 * ============================================================ */
function saveVotersBulk_(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return { success: false, message: 'rows harus array tidak kosong' };
  }

  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); }
  catch (_) { return { success: false, message: 'Server sibuk, coba lagi' }; }

  try {
    const sh = sheet_('voters');
    const headers = HEADERS.Voters;
    const existing = getRows_('voters');
    const codes = {};
    existing.forEach(r => { codes[String(r.code)] = true; });

    let added = 0, skipped = 0;
    rows.forEach(r => {
      if (!r || !r.name) { skipped++; return; }
      let code = String(r.code || '').trim().toUpperCase();
      if (!code) code = 'V' + uuid_().slice(0, 8).toUpperCase();
      if (codes[code]) { skipped++; return; }
      const row = {
        id: uuid_(), code,
        name: r.name, rt: r.rt || '', rw: r.rw || '',
        address: r.address || '', phone: r.phone || '',
        voted: false, checkinAt: '', boothId: '',
        photoUrl: '', signature: '',
        coklitStatus: 'pending',
      };
      sh.appendRow(headers.map(h => safeCell_(row[h])));
      codes[code] = true;
      added++;
    });
    return { success: true, added, skipped };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function voterByCode_(code) {
  const c = String(code || '').trim();
  if (!c) return { success: false, message: 'Kode kosong' };
  const v = getRows_('voters').find(r => String(r.code) === c);
  if (!v) return { success: false, message: 'Kode pemilih tidak valid' };
  return { success: true, data: v };
}

function updateCoklitStatus_(body, user) {
  const voterId = String(body.voterId || '').trim();
  const status  = String(body.status || '').trim();
  if (!voterId) return { success: false, message: 'voterId wajib' };
  if (['valid', 'invalid', 'pending'].indexOf(status) === -1) {
    return { success: false, message: 'Status tidak valid' };
  }

  const lock = LockService.getScriptLock();
  try { lock.waitLock(8000); }
  catch (_) { return { success: false, message: 'Server sibuk' }; }

  try {
    const v = getRows_('voters').find(x => String(x.id) === String(voterId));
    if (!v) return { success: false, message: 'Pemilih tidak ditemukan' };

    // ✅ Validasi RT: coklit hanya bisa validasi RT-nya sendiri
    const userRole = String(user.role || '').toLowerCase();
    const userRt   = normalizeRt_(user.rt); // ✅ Normalisasi
    if (userRole === 'coklit' && userRt) {
      const voterRt = normalizeRt_(v.rt);   // ✅ Normalisasi
      if (voterRt !== userRt) {
        return {
          success: false,
          message: 'Anda hanya bisa memvalidasi pemilih RT ' + userRt +
                   ' (pemilih ini RT ' + (voterRt || '-') + ')'
        };
      }
    }

    saveRow_('voters', Object.assign({}, v, { coklitStatus: status }));
    log_(user.username, 'coklit',
      v.name + ' (RT ' + (v.rt || '-') + ') → ' + status);
    return { success: true, message: 'Status coklit diperbarui', data: { voterId, status } };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function resetVoter_(voterId) {
  if (!voterId) return { success: false, message: 'voterId wajib' };

  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); }
  catch (_) { return { success: false, message: 'Server sibuk' }; }

  try {
    const voters = getRows_('voters');
    const v = voters.find(x => String(x.id) === String(voterId));
    if (!v) return { success: false, message: 'Pemilih tidak ditemukan' };

    // Hapus suara
    const shVotes = sheet_('votes');
    const dataVotes = shVotes.getDataRange().getValues();
    for (let i = dataVotes.length - 1; i >= 1; i--) {
      if (String(dataVotes[i][1]) === String(voterId)) {
        shVotes.deleteRow(i + 1);
      }
    }

    // Kosongkan bilik
    getRows_('booths').forEach(b => {
      if (String(b.currentVoterId) === String(voterId)) {
        setBoothCurrent_({ boothId: b.id, voterId: '', name: b.name });
      }
    });

    // ✅ Reset data + coklit
    saveRow_('voters', Object.assign({}, v, {
      voted: false,
      checkinAt: '',
      boothId: '',
      signature: '',
      photoUrl: '',
      coklitStatus: 'pending',
    }));

    log_('-', 'reset', v.name);
    return { success: true, message: 'Pemilih berhasil di-reset (termasuk status coklit)' };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

/* ============================================================
 *  COKLIT REPORT (Rekap per RT untuk Admin)
 * ============================================================ */
function coklitReport_() {
  const voters = getRows_('voters');
  const users  = getRows_('users').filter(u =>
    String(u.role).toLowerCase() === 'coklit' && truthy_(u.active)
  );

  // Rekap per RT
  const perRt = {};
  voters.forEach(v => {
    const rt = normalizeRt_(v.rt) || 'unknown'; // ✅ Normalisasi
    perRt[rt] = perRt[rt] || { total: 0, valid: 0, invalid: 0, pending: 0, petugas: [] };
    perRt[rt].total++;
    const st = String(v.coklitStatus || 'pending').toLowerCase();
    if (st === 'valid')        perRt[rt].valid++;
    else if (st === 'invalid') perRt[rt].invalid++;
    else                        perRt[rt].pending++;
  });

  // Map petugas coklit ke RT
  users.forEach(u => {
    const rt = normalizeRt_(u.rt); // ✅ Normalisasi
    if (rt && perRt[rt]) {
      perRt[rt].petugas.push({
        name: u.name || u.username,
        username: u.username,
      });
    }
  });

  // Summary global
  const total    = voters.length;
  const valid    = voters.filter(v => v.coklitStatus === 'valid').length;
  const invalid  = voters.filter(v => v.coklitStatus === 'invalid').length;
  const pending  = total - valid - invalid;

  return {
    success: true,
    data: {
      summary: {
        total, valid, invalid, pending,
        progress: total ? Math.round((valid + invalid) / total * 100) : 0,
      },
      perRt,
      timestamp: new Date().toISOString(),
    },
  };
}

/* ============================================================
 *  ATTENDANCE
 * ============================================================ */
function checkin_(u, body) {
  const code = String(body.code || '').trim();
  if (!code) return { success: false, message: 'Kode kosong' };

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); }
  catch (_) { return { success: false, message: 'Server sibuk, coba lagi' }; }

  try {
    const v = getRows_('voters').find(r => String(r.code) === code);
    if (!v) return { success: false, message: 'Kode pemilih tidak valid' };
    if (truthy_(v.voted)) return { success: false, message: 'Pemilih sudah memilih' };
    if (v.checkinAt) return { success: false, message: 'Pemilih sudah absen' };

    const now = new Date().toISOString();
    const freeBooth = pickFreeBooth_();

    const signatureUrl = normalizeImageField_(body.signature || '', 'E-Vote_Signatures', 'png');
    const photoUrl     = normalizeImageField_(body.photoUrl  || '', 'E-Vote_Photos',     'jpg');

    saveRow_('voters', Object.assign({}, v, {
      checkinAt: now,
      signature: signatureUrl,
      photoUrl:  photoUrl,
      boothId:   freeBooth ? freeBooth.id : '',
    }));

    sheet_('attendance').appendRow([
      uuid_(), v.id, now,
      safeCell_(signatureUrl), safeCell_(photoUrl),
      freeBooth ? freeBooth.id : '',
    ]);

    if (freeBooth) {
      setBoothCurrent_({
        boothId: freeBooth.id, voterId: v.id,
        voterName: v.name, name: freeBooth.name,
      });
    }

    log_(u.username, 'checkin', v.name);
    return {
      success: true,
      voter: {
        id: v.id, name: v.name, code: v.code,
        booth: freeBooth ? freeBooth.name : null,
        boothId: freeBooth ? freeBooth.id : null,
      },
    };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

/* ============================================================
 *  BOOTHS
 * ============================================================ */
function pingBooth_(u) {
  if (!u.boothId) return { success: false, message: 'Bilik belum terhubung' };
  CacheService.getScriptCache().put('booth_ping_' + u.boothId, String(Date.now()), 120);
  return { success: true, boothId: u.boothId };
}

function listBoothsWithPing_() {
  const res = listRows_('booths');
  if (!res.success) return res;
  const cache = CacheService.getScriptCache();
  res.data.forEach(b => {
    const t = cache.get('booth_ping_' + b.id);
    b.lastActive = t ? Number(t) : 0;
  });
  return res;
}

function pickFreeBooth_() {
  return getRows_('booths').find(b =>
    String(b.status) === 'ready' && !b.currentVoterId
  ) || null;
}

function boothClaim_(u, boothId) {
  const target = String(boothId || u.boothId || '');
  if (!target) return { success: false, message: 'boothId kosong' };
  const booth = getRows_('booths').find(b => String(b.id) === target);
  if (!booth) return { success: false, message: 'Bilik tidak ditemukan' };
  const meRow = getRows_('users').find(x => String(x.id) === String(u.id));
  if (meRow && String(meRow.boothId || '') !== target) {
    saveRow_('users', Object.assign({}, meRow, { boothId: target }));
  }
  return { success: true, booth };
}

function setBoothCurrent_(body) {
  const boothId    = String(body.boothId || '').trim();
  const voterId    = String(body.voterId || '').trim();
  const voterName  = body.voterName || '';
  const overrideName = body.name || '';
  if (!boothId) return { success: false, message: 'boothId wajib' };

  const booth = getRows_('booths').find(b => String(b.id) === boothId);
  if (!booth) return { success: false, message: 'Bilik tidak ditemukan' };

  const prevVoterId = String(booth.currentVoterId || '');
  if (prevVoterId && prevVoterId !== voterId) updateVoterBooth_(prevVoterId, '');
  if (voterId) updateVoterBooth_(voterId, boothId);

  const now = new Date().toISOString();
  saveRow_('booths', Object.assign({}, booth, {
    name: overrideName || booth.name,
    status: voterId ? 'occupied' : 'ready',
    currentVoterId: voterId,
    updatedAt: now,
  }));
  return { success: true, boothId, voterId, voterName };
}

function updateVoterBooth_(voterId, boothId) {
  if (!voterId) return;
  const v = getRows_('voters').find(x => String(x.id) === String(voterId));
  if (!v) return;
  if (String(v.boothId || '') === String(boothId || '')) return;
  saveRow_('voters', Object.assign({}, v, { boothId: boothId || '' }));
}

/* ============================================================
 *  VOTING & RESULTS
 * ============================================================ */
function submitVotes_(u, body) {
  const voterId = String(body.voterId || '').trim();
  if (!voterId) return { success: false, message: 'voterId wajib' };

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); }
  catch (_) { return { success: false, message: 'Server sibuk, coba lagi' }; }

  try {
    const v = getRows_('voters').find(r => String(r.id) === voterId);
    if (!v) return { success: false, message: 'Voter tidak ditemukan' };
    if (truthy_(v.voted)) return { success: false, message: 'Voter sudah memilih' };

    const votes = Array.isArray(body.votes) ? body.votes : [];
    const now = new Date().toISOString();
    const sh = sheet_('votes');
    const boothId = u.boothId || '';

    votes.forEach(vt => {
      if (!vt || !vt.candidateId) return;
      sh.appendRow([
        uuid_(), voterId, vt.candidateId, vt.position || '', now, boothId
      ]);
    });

    const photoUrl = normalizeImageField_(
      body.photoUrl || v.photoUrl || '', 'E-Vote_Photos', 'jpg'
    );

    saveRow_('voters', Object.assign({}, v, {
      voted: true,
      photoUrl: photoUrl || v.photoUrl || '',
      boothId: '',
    }));

    getRows_('booths').forEach(b => {
      if (String(b.currentVoterId) === voterId) {
        setBoothCurrent_({ boothId: b.id, voterId: '', name: b.name });
      }
    });

    log_(u.username, 'vote', v.name);
    return { success: true, votesCount: votes.length };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function results_() {
  const votes      = getRows_('votes');
  const candidates = getRows_('candidates').filter(c => truthy_(c.active));
  const voters     = getRows_('voters');

  const tally = {};
  votes.forEach(v => {
    const cid = String(v.candidateId || '');
    if (cid) tally[cid] = (tally[cid] || 0) + 1;
  });

  const groups = {};
  candidates.forEach(c => {
    const pos = String(c.position || 'lainnya');
    groups[pos] = groups[pos] || [];
    groups[pos].push({
      id: c.id, name: c.name || '', noUrut: c.noUrut || '',
      photoUrl: c.photoUrl || '', votes: tally[String(c.id)] || 0,
    });
  });
  Object.keys(groups).forEach(pos => {
    groups[pos].sort((a, b) => {
      if ((b.votes || 0) !== (a.votes || 0)) return (b.votes || 0) - (a.votes || 0);
      return (Number(a.noUrut) || 0) - (Number(b.noUrut) || 0);
    });
  });

  const totalVoted = voters.filter(v => truthy_(v.voted)).length;
  return {
    success: true, groups,
    totalVoters: voters.length, totalVoted,
    timestamp: new Date().toISOString(),
  };
}

/* ============================================================
 *  BERITA ACARA
 * ============================================================ */
function saveBerita_(body) {
  const row = {
    id: uuid_(),
    title: body.title || 'Berita Acara',
    content: body.content || '',
    photos: JSON.stringify(body.photos || []),
    signatures: body.signatures || '[]',
    createdAt: new Date().toISOString(),
    createdBy: body.createdBy || '-',
  };
  sheet_('berita').appendRow(HEADERS.BeritaAcara.map(h => safeCell_(row[h])));
  return { success: true, data: row };
}

/* ============================================================
 *  DASHBOARD
 * ============================================================ */
function dashSummary_() {
  const voters     = getRows_('voters');
  const booths     = getRows_('booths');
  const candidates = getRows_('candidates');

  const voted = voters.filter(v => truthy_(v.voted)).length;
  const boothsReady    = booths.filter(b =>
    String(b.status) === 'ready' && !b.currentVoterId
  ).length;
  const boothsOccupied = booths.filter(b => !!b.currentVoterId).length;

  // ✅ Statistik coklit global
  const coklitValid   = voters.filter(v => String(v.coklitStatus) === 'valid').length;
  const coklitInvalid = voters.filter(v => String(v.coklitStatus) === 'invalid').length;
  const coklitPending = voters.length - coklitValid - coklitInvalid;

  return {
    success: true,
    data: {
      totalVoters: voters.length, voted,
      boothsReady, boothsOccupied, boothsTotal: booths.length,
      candidates: candidates.filter(c => truthy_(c.active)).length,
      coklit: {
        valid: coklitValid,
        invalid: coklitInvalid,
        pending: coklitPending,
      },
      serverTime: new Date().toISOString(),
    },
  };
}

/* ============================================================
 *  BACKUP & RESTORE
 * ============================================================ */
function exportBackup_() {
  const backup = {};
  ['users', 'voters', 'candidates', 'votes', 'booths', 'attendance',
   'settings', 'berita'].forEach(name => {
    backup[name] = getRows_(name);
  });
  backup._exportedAt = new Date().toISOString();
  return { success: true, data: backup };
}

function importBackup_(body) {
  const data = body.data;
  if (!data) return { success: false, message: 'Data backup kosong' };

  const lock = LockService.getScriptLock();
  try { lock.waitLock(30000); }
  catch (_) { return { success: false, message: 'Sibuk' }; }

  try {
    ['users', 'voters', 'candidates', 'votes', 'booths', 'attendance',
     'settings', 'berita'].forEach(name => {
      if (!data[name]) return;
      const sh = sheet_(name);
      sh.clear();
      sh.appendRow(headersOf_(name));
      data[name].forEach(row => {
        sh.appendRow(headersOf_(name).map(h => safeCell_(row[h])));
      });
    });
    log_('-', 'import', 'Restore backup');
    return { success: true, message: 'Restore berhasil' };
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================
 *  SEED DATABASE (jalankan sekali dari editor Apps Script)
 *  Auto-inject 4 akun coklit untuk 4 RT
 *  ============================================================ */
function seedDatabase() {
  // 1. Buat semua sheet (idempotent)
  ['users', 'voters', 'candidates', 'votes', 'booths',
   'attendance', 'settings', 'berita', 'logs', 'feedback']
    .forEach(name => sheet_(name));

  // 2. Migrasi schema (tambah kolom baru jika belum ada)
  ['users', 'voters', 'candidates', 'booths', 'votes', 'attendance',
   'settings', 'berita', 'logs', 'feedback']
    .forEach(ensureHeaders_);

  // 3. Seed user ADMIN
  let users = getRows_('users');
  if (!users.find(u => String(u.username) === 'admin')) {
    saveRow_('users', {
      username: 'admin',
      password: 'admin123',
      name: 'Administrator',
      role: 'admin',
      active: true,
    });
  }

  // 4. Seed user PETUGAS
  users = getRows_('users');
  if (!users.find(u => String(u.username) === 'petugas1')) {
    saveRow_('users', {
      username: 'petugas1',
      password: 'petugas123',
      name: 'Petugas Absensi 1',
      role: 'petugas',
      active: true,
    });
  }

  // 5. Seed user BILIK
  users = getRows_('users');
  if (!users.find(u => String(u.username) === 'bilik-1')) {
    saveRow_('users', {
      username: 'bilik-1',
      password: 'bilik123',
      name: 'Bilik Suara 1',
      role: 'bilik',
      active: true,
    });
  }

  // 6. ✅ INJECT 4 AKUN COKLIT (1 per RT)
  const coklitAccounts = [
    { username: 'coklit1', rt: '01', name: 'Petugas Coklit RT 01' },
    { username: 'coklit2', rt: '02', name: 'Petugas Coklit RT 02' },
    { username: 'coklit3', rt: '03', name: 'Petugas Coklit RT 03' },
    { username: 'coklit4', rt: '04', name: 'Petugas Coklit RT 04' },
  ];

  users = getRows_('users');
  coklitAccounts.forEach(acc => {
    const existing = users.find(u => String(u.username) === acc.username);
    if (!existing) {
      // Buat baru
      saveRow_('users', {
        username: acc.username,
        password: 'coklit123',
        name: acc.name,
        role: 'coklit',
        rt: acc.rt,
        active: true,
      });
    } else {
      // Update role & RT agar konsisten
      const needsUpdate =
        String(existing.role || '').toLowerCase() !== 'coklit' ||
        String(existing.rt || '').trim() !== acc.rt;
      if (needsUpdate) {
        saveRow_('users', Object.assign({}, existing, {
          role: 'coklit',
          rt: acc.rt,
          name: existing.name || acc.name,
        }));
      }
    }
  });

  // 7. Seed bilik default
  const booths = getRows_('booths');
  if (!booths.length) {
    ['Bilik 1', 'Bilik 2'].forEach(n => {
      saveRow_('booths', {
        id: uuid_(),
        name: n,
        status: 'ready',
        currentVoterId: '',
        updatedAt: new Date().toISOString(),
      });
    });
  }

  // 8. Seed settings default
  const settings = getRows_('settings');
  const sDef = {
    event_name: 'Pemilihan Ketua RT & Pemuda',
    event_location: 'Balai RW',
    election_date: new Date(Date.now() + 7 * 86400000).toISOString(),
    invitation_signer: 'Ketua Panitia',
    voting_mode: 'single',
  };
  Object.keys(sDef).forEach(k => {
    if (!settings.find(s => String(s.key) === k)) {
      sheet_('settings').appendRow([k, sDef[k]]);
    }
  });

  // 9. Log ringkasan
  const finalUsers = getRows_('users');
  const summary = {
    users_total:  finalUsers.length,
    coklit_total: finalUsers.filter(u => String(u.role).toLowerCase() === 'coklit').length,
    admin_total:  finalUsers.filter(u => String(u.role).toLowerCase() === 'admin').length,
    petugas_total:finalUsers.filter(u => String(u.role).toLowerCase() === 'petugas').length,
    bilik_total:  finalUsers.filter(u => String(u.role).toLowerCase() === 'bilik').length,
    booths_total: getRows_('booths').length,
  };

  log_('-', 'seed', JSON.stringify(summary));

  const msg = 'Database siap digunakan. ' + summary.coklit_total + ' akun coklit ter-inject (RT 01–04).';
  try {
    Logger.log(msg);
    Logger.log(JSON.stringify(summary, null, 2));
  } catch (_) {}

  return { success: true, message: msg, summary };
}

/* ============================================================
 *  RE-INJECT COKLIT (jalankan manual kapan saja)
 *  Gunakan jika perlu reset password atau tambah RT baru
 *  ============================================================ */
function reseedCoklit() {
  const coklitAccounts = [
    { username: 'coklit1', rt: '01', name: 'Petugas Coklit RT 01' },
    { username: 'coklit2', rt: '02', name: 'Petugas Coklit RT 02' },
    { username: 'coklit3', rt: '03', name: 'Petugas Coklit RT 03' },
    { username: 'coklit4', rt: '04', name: 'Petugas Coklit RT 04' },
    // Tambah di sini jika RT bertambah (RT 05, 06, dst)
  ];

  const users = getRows_('users');
  let added = 0, updated = 0, skipped = 0;

  coklitAccounts.forEach(acc => {
    const existing = users.find(u => String(u.username) === acc.username);

    if (!existing) {
      saveRow_('users', {
        username: acc.username,
        password: 'coklit123',
        name: acc.name,
        role: 'coklit',
        rt: acc.rt,
        active: true,
      });
      added++;
    } else if (
      String(existing.rt || '').trim() !== acc.rt ||
      String(existing.role || '').toLowerCase() !== 'coklit'
    ) {
      saveRow_('users', Object.assign({}, existing, {
        role: 'coklit',
        rt: acc.rt,
      }));
      updated++;
    } else {
      skipped++;
    }
  });

  const msg = 'Coklit re-seed: ' + added + ' baru, ' + updated + ' diupdate, ' + skipped + ' sudah ada';
  log_('-', 'reseed_coklit', 'added=' + added + ', updated=' + updated + ', skipped=' + skipped);
  try { Logger.log(msg); } catch (_) {}
  return { success: true, message: msg, data: { added, updated, skipped } };
}

/* ============================================================
 *  RESET PASSWORD COKLIT (jalankan manual jika perlu)
 *  Mengembalikan password semua akun coklit ke default 'coklit123'
 *  ============================================================ */
function resetCoklitPassword() {
  const users = getRows_('users').filter(u =>
    String(u.role).toLowerCase() === 'coklit' &&
    /^coklit\d+$/i.test(String(u.username))
  );

  let count = 0;
  users.forEach(u => {
    saveRow_('users', Object.assign({}, u, { password: 'coklit123' }));
    count++;
  });

  const msg = 'Password ' + count + ' akun coklit di-reset ke default (coklit123)';
  log_('-', 'reset_coklit_pwd', 'count=' + count);
  try { Logger.log(msg); } catch (_) {}
  return { success: true, message: msg, count };
}

/* ============================================================
 *  HEALTH CHECK (opsional, untuk debug)
 *  ============================================================ */
function testHealth() {
  return JSON.stringify({
    ok: true,
    sheets: Object.keys(SHEETS),
    users_by_role: {
      admin:   getRows_('users').filter(u => u.role === 'admin').length,
      petugas: getRows_('users').filter(u => u.role === 'petugas').length,
      bilik:   getRows_('users').filter(u => u.role === 'bilik').length,
      coklit:  getRows_('users').filter(u => u.role === 'coklit').length,
    },
    coklit_breakdown: getRows_('users')
      .filter(u => u.role === 'coklit')
      .map(u => ({ username: u.username, rt: u.rt, active: u.active })),
    time: new Date().toISOString(),
  }, null, 2);
}