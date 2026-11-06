/** ============================================================
 *  E-VOTE KETUA RT / PEMUDA — Apps Script Backend
 *  Database: Google Sheets (SS = Spreadsheet aktif)
 *  ============================================================ */

const SS = SpreadsheetApp.getActiveSpreadsheet();

const SHEETS = {
  users:      'Users',
  voters:     'Voters',
  candidates: 'Candidates',
  votes:      'Votes',
  booths:     'Booths',
  attendance: 'Attendance',
  settings:   'Settings',
  berita:     'BeritaAcara',
  logs:       'Logs',
  feedback:   'Feedback',
};

const TOKEN_TTL = 6 * 60 * 60; // 6 jam

const HEADERS = {
  Users:       ['id', 'username', 'passwordHash', 'name', 'role', 'boothId', 'active', 'createdAt'],
  Voters:      ['id', 'code', 'name', 'rt', 'rw', 'address', 'phone', 'voted', 'checkinAt', 'boothId', 'photoUrl', 'signature'],
  Candidates:  ['id', 'noUrut', 'name', 'position', 'photoUrl', 'visi', 'misi', 'active'],
  Votes:       ['id', 'voterId', 'candidateId', 'position', 'timestamp', 'boothId'],
  Booths:      ['id', 'name', 'status', 'currentVoterId', 'updatedAt', 'lastActive'], // <-- lastActive
  Attendance:  ['id', 'voterId', 'timestamp', 'signature', 'photoUrl', 'boothId'],
  Settings:    ['key', 'value'],
  BeritaAcara: ['id', 'title', 'content', 'photos', 'signatures', 'createdAt', 'createdBy'],
  Logs:        ['timestamp', 'user', 'action', 'detail'],
  Feedback:    ['id', 'name', 'contact', 'category', 'message', 'timestamp', 'status'],
};

const CELL_MAX = 48000;

/* ============================================================
 *  ROUTER
 * ============================================================ */
function doGet(e)  { return route_(e); }
function doPost(e) { return route_(e); }

function route_(e) {
  const p    = (e && e.parameter) || {};
  const body = (e && e.postData) ? safeParse_(e.postData.contents) : {};
  const action = p.action || body.action;
  const token  = p.token  || body.token;

  let out;
  try {
    switch (action) {
      /* ---------- Public API ---------- */
      case 'health': out = { success: true, data: { ok: true, time: new Date().toISOString() } }; break;
      case 'candidates.public': out = publicCandidates_(); break;
      case 'settings.public': out = publicSettings_(); break;
      case 'feedback.save': out = saveFeedback_(body); break;

      /* ---------- Auth ---------- */
      case 'login':   out = login_(body); break;
      case 'logout':  out = logout_(token); break;
      case 'me':      out = me_(token); break;

      /* ---------- Generic CRUD ---------- */
      case 'list':    out = withAuth_(token, null, () => listRows_(body.sheet, body.filter)); break;
      case 'save':    out = withAuth_(token, null, () => saveRow_(body.sheet, body.row)); break;
      case 'delete':  out = withAuth_(token, null, () => deleteRow_(body.sheet, body.id)); break;

      /* ---------- Admin Settings ---------- */
      case 'settings.save': out = withAuth_(token, ['admin'], () => saveSetting_(body)); break;

      /* ---------- Voters ---------- */
      case 'voters.bulk':   out = withAuth_(token, ['admin','petugas'], () => saveVotersBulk_(body.rows)); break;
      case 'voters.byCode': out = withAuth_(token, ['admin','petugas','bilik'], () => voterByCode_(body.code)); break;

      /* ---------- Attendance ---------- */
      case 'attendance.checkin': out = withAuth_(token, ['petugas','admin'], () => checkin_(token, body)); break;
      case 'attendance.list':    out = withAuth_(token, null, () => listRows_('attendance')); break;

      /* ---------- Booths ---------- */
      case 'booth.claim':      out = withAuth_(token, ['bilik'], () => boothClaim_(token, body.boothId)); break;
      case 'booth.ping':       out = withAuth_(token, ['bilik'], () => pingBooth_(token)); break; // <-- Ping
      case 'booth.status':     out = withAuth_(token, null, () => listBoothsWithPing_()); break;  // <-- Custom List
      case 'booth.setCurrent': out = withAuth_(token, ['petugas','admin'], () => setBoothCurrent_(body)); break;

      /* ---------- Voting ---------- */
      case 'vote.submit': out = withAuth_(token, ['bilik'], () => submitVotes_(token, body)); break;

      /* ---------- Results ---------- */
      case 'results': out = withAuth_(token, null, () => results_()); break;

      /* ---------- Berita Acara ---------- */
      case 'ba.save': out = withAuth_(token, ['admin','petugas'], () => saveBerita_(body)); break;
      case 'ba.list': out = withAuth_(token, null, () => listRows_('berita')); break;

      /* ---------- Dashboard ---------- */
      case 'dash.summary': out = withAuth_(token, null, () => dashSummary_()); break;

      default: out = { success: false, message: 'Unknown action: ' + action };
    }
  } catch (err) {
    out = {
      success: false,
      message: String(err && err.message ? err.message : err),
      stack: err && err.stack ? String(err.stack).slice(0, 800) : undefined,
    };
    try { log_(token && token.user ? token.user.username : '-', action, 'ERROR: ' + err); } catch (_) {}
  }

  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function safeParse_(s) { try { return JSON.parse(s); } catch (_) { return {}; } }
function withAuth_(token, roles, fn) { requireAuth_(token, roles); return fn(); }

/* ============================================================
 *  UTIL
 * ============================================================ */
function safeCell_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean' || typeof v === 'number') return v;
  if (v instanceof Date) return v;
  if (typeof v === 'object') { try { return JSON.stringify(v); } catch (_) { return String(v); } }
  const s = String(v);
  if (s.length > CELL_MAX) return s.substring(0, CELL_MAX);
  return s;
}
function truthy_(v) { if (v === true) return true; const s = String(v).trim().toLowerCase(); return s === 'true' || s === '1' || s === 'ya' || s === 'yes'; }
function uuid_() { return Utilities.getUuid(); }
function hash_(s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s)).map(function (b) { return ((b < 0 ? b + 256 : b).toString(16)).padStart(2, '0'); }).join(''); }

function sheet_(name) {
  const realName = SHEETS[name] || name;
  let sh = SS.getSheetByName(realName);
  if (!sh) {
    sh = SS.insertSheet(realName);
    const headers = HEADERS[realName] || HEADERS[name] || [];
    if (headers.length) { sh.appendRow(headers); sh.setFrozenRows(1); }
  }
  return sh;
}
function headersOf_(name) { return HEADERS[SHEETS[name] || name] || HEADERS[name] || []; }

function getRows_(name) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const head = values.shift();
  return values.map(function (r) {
    const o = {};
    head.forEach(function (h, i) { o[h] = (r[i] === null || r[i] === undefined) ? '' : r[i]; });
    return o;
  }).filter(function (o) { return o.id || o.key || o.username; });
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
    data = data.filter(function (r) {
      return keys.every(function (k) {
        const a = String(r[k]).trim().toLowerCase();
        const b = String(filter[k]).trim().toLowerCase();
        return a === b;
      });
    });
  }
  return { success: true, data: data };
}

function saveRow_(name, row) {
  if (!row || typeof row !== 'object') return { success: false, message: 'row wajib object' };
  const sh = sheet_(name);
  const headers = headersOf_(name);
  if (!headers.length) return { success: false, message: 'Sheet tidak dikenal: ' + name };
  if (!row.id) row.id = uuid_();
  
  const idx = findRowIndex_(name, row.id);
  let existing = {};
  if (idx > 0) {
    const cur = sh.getRange(idx, 1, 1, headers.length).getValues()[0];
    headers.forEach(function (h, i) { existing[h] = cur[i]; });
  }
  const merged = Object.assign({}, existing, row);
  const arr = headers.map(function (h) { return safeCell_(merged[h]); });

  if (idx > 0) sh.getRange(idx, 1, 1, headers.length).setValues([arr]);
  else sh.appendRow(arr);
  return { success: true, data: merged };
}

function deleteRow_(name, id) {
  if (!id) return { success: false, message: 'id wajib' };
  if ((SHEETS[name] || name) === 'Users') {
    const users = getRows_('users');
    const target = users.find(function (u) { return String(u.id) === String(id); });
    if (target && String(target.role) === 'admin') {
      const adminCount = users.filter(function (u) { return String(u.role) === 'admin' && truthy_(u.active); }).length;
      if (adminCount <= 1) return { success: false, message: 'Tidak dapat menghapus admin terakhir' };
    }
  }
  const idx = findRowIndex_(name, id);
  if (idx > 0) sheet_(name).deleteRow(idx);
  return { success: true };
}

/* ============================================================
 *  PUBLIC API & SETTINGS
 * ============================================================ */
function publicCandidates_() {
  const candidates = getRows_('candidates').filter(function (c) { return truthy_(c.active); });
  const groups = {};
  candidates.forEach(function (c) {
    const pos = String(c.position || 'lainnya');
    groups[pos] = groups[pos] || [];
    groups[pos].push({ id: c.id, noUrut: c.noUrut, name: c.name, photoUrl: c.photoUrl || '', visi: c.visi || '', misi: c.misi || '', position: c.position });
  });
  Object.keys(groups).forEach(function (pos) { groups[pos].sort(function (a, b) { return (Number(a.noUrut) || 0) - (Number(b.noUrut) || 0); }); });
  return { success: true, groups: groups };
}

function publicSettings_() {
  const settings = getRows_('settings');
  const res = {};
  settings.forEach(function(s) { res[s.key] = s.value; });
  return { success: true, data: res };
}

function saveSetting_(body) {
  const key = String(body.key || '').trim();
  const val = String(body.value || '').trim();
  if (!key) return { success: false, message: 'Key required' };
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

function saveFeedback_(body) {
  if (!body.message || String(body.message).trim() === '') return { success: false, message: 'Pesan tidak boleh kosong' };
  const row = { id: uuid_(), name: safeCell_(body.name || 'Anonim'), contact: safeCell_(body.contact || '-'), category: safeCell_(body.category || 'Umum'), message: safeCell_(body.message), timestamp: new Date().toISOString(), status: 'Baru' };
  sheet_('feedback').appendRow(HEADERS.Feedback.map(function(h) { return row[h]; }));
  return { success: true, message: 'Kritik dan saran berhasil dikirim.' };
}

/* ============================================================
 *  AUTH
 * ============================================================ */
function login_(body) {
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!username || !password) return { success: false, message: 'Username dan password wajib diisi' };

  const users = getRows_('users');
  const user = users.find(function (u) { return String(u.username) === username && truthy_(u.active); });
  if (!user) return { success: false, message: 'User tidak ditemukan / nonaktif' };
  if (String(user.passwordHash) !== hash_(password)) return { success: false, message: 'Password salah' };

  const token = Utilities.base64Encode(uuid_() + ':' + Date.now() + ':' + username);
  const payload = { id: user.id, username: user.username, role: String(user.role || '').toLowerCase(), name: user.name || user.username, boothId: user.boothId || '', exp: Date.now() + TOKEN_TTL * 1000 };

  CacheService.getScriptCache().put('tok_' + token, JSON.stringify(payload), TOKEN_TTL);
  log_(username, 'login', 'OK');
  return { success: true, token: token, user: { id: payload.id, username: payload.username, role: payload.role, name: payload.name, boothId: payload.boothId } };
}

function requireAuth_(token, roles) {
  if (!token) throw new Error('Token required');
  const raw = CacheService.getScriptCache().get('tok_' + token);
  if (!raw) throw new Error('Token expired, silakan login ulang');
  const u = JSON.parse(raw);
  if (u.exp < Date.now()) throw new Error('Token expired, silakan login ulang');
  if (roles && roles.length && roles.indexOf(u.role) === -1) throw new Error('Akses ditolak');
  if (token && typeof token === 'object') token.user = u;
  return true;
}

function me_(token) { requireAuth_(token); return { success: true, user: token.user }; }
function logout_(token) { if (token) { try { CacheService.getScriptCache().remove('tok_' + token); } catch (_) {} } return { success: true }; }
function log_(user, action, detail) { try { sheet_('logs').appendRow([new Date(), safeCell_(user || '-'), safeCell_(action || '-'), safeCell_(detail || '')]); } catch (_) {} }

/* ============================================================
 *  VOTERS & ATTENDANCE
 * ============================================================ */
function saveVotersBulk_(rows) {
  if (!Array.isArray(rows) || !rows.length) return { success: false, message: 'rows harus array tidak kosong' };
  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (_) { return { success: false, message: 'Server sibuk, coba lagi' }; }

  try {
    const sh = sheet_('voters');
    const headers = HEADERS.Voters;
    const existing = getRows_('voters');
    const codes = {};
    existing.forEach(function (r) { codes[String(r.code)] = true; });

    let added = 0, skipped = 0;
    rows.forEach(function (r) {
      if (!r || !r.name) { skipped++; return; }
      let code = String(r.code || '').trim().toUpperCase();
      if (!code) code = 'V' + uuid_().slice(0, 8).toUpperCase();
      if (codes[code]) { skipped++; return; }

      const row = { id: uuid_(), code: code, name: r.name, rt: r.rt || '', rw: r.rw || '', address: r.address || '', phone: r.phone || '', voted: false, checkinAt: '', boothId: '', photoUrl: '', signature: '' };
      sh.appendRow(headers.map(function (h) { return safeCell_(row[h]); }));
      codes[code] = true; added++;
    });
    return { success: true, added: added, skipped: skipped };
  } finally { try { lock.releaseLock(); } catch (_) {} }
}

function voterByCode_(code) {
  const c = String(code || '').trim();
  if (!c) return { success: false, message: 'Kode kosong' };
  const v = getRows_('voters').find(function (r) { return String(r.code) === c; });
  if (!v) return { success: false, message: 'Kode pemilih tidak valid' };
  return { success: true, data: v };
}

function checkin_(token, body) {
  const code = String(body.code || '').trim();
  if (!code) return { success: false, message: 'Kode kosong' };

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (_) { return { success: false, message: 'Server sibuk, coba lagi' }; }

  try {
    const v = getRows_('voters').find(function (r) { return String(r.code) === code; });
    if (!v) return { success: false, message: 'Kode pemilih tidak valid' };
    if (truthy_(v.voted)) return { success: false, message: 'Pemilih sudah memilih' };
    if (v.checkinAt) return { success: false, message: 'Pemilih sudah absen' };

    const now = new Date().toISOString();
    const freeBooth = pickFreeBooth_();
    
    saveRow_('voters', Object.assign({}, v, { checkinAt: now, signature: body.signature || '', photoUrl: body.photoUrl || '', boothId: freeBooth ? freeBooth.id : '' }));
    sheet_('attendance').appendRow([uuid_(), v.id, now, safeCell_(body.signature || ''), safeCell_(body.photoUrl || ''), freeBooth ? freeBooth.id : '']);

    if (freeBooth) {
      setBoothCurrent_({ boothId: freeBooth.id, voterId: v.id, voterName: v.name, name: freeBooth.name });
    }
    log_(token && token.user ? token.user.username : 'petugas', 'checkin', v.name);
    return { success: true, voter: { id: v.id, name: v.name, code: v.code, booth: freeBooth ? freeBooth.name : null, boothId: freeBooth ? freeBooth.id : null } };
  } finally { try { lock.releaseLock(); } catch (_) {} }
}

/* ============================================================
 *  BOOTHS (Ping & Status)
 * ============================================================ */
function pingBooth_(token) {
  const u = token.user;
  if (!u.boothId) return { success: false, message: 'Bilik belum terhubung' };
  
  const cache = CacheService.getScriptCache();
  cache.put('booth_ping_' + u.boothId, String(Date.now()), 120); // Expired 2 menit
  
  return { success: true, boothId: u.boothId };
}

function listBoothsWithPing_() {
  const res = listRows_('booths');
  if (!res.success) return res;
  
  const cache = CacheService.getScriptCache();
  res.data.forEach(function(b) {
    const pingTime = cache.get('booth_ping_' + b.id);
    b.lastActive = pingTime ? Number(pingTime) : 0;
  });
  
  return res;
}

function pickFreeBooth_() {
  const booths = getRows_('booths');
  return booths.find(function (b) { return String(b.status) === 'ready' && !b.currentVoterId; }) || null;
}

function boothClaim_(token, boothId) {
  const u = token.user;
  const target = String(boothId || u.boothId || '');
  if (!target) return { success: false, message: 'boothId kosong' };

  const booth = getRows_('booths').find(function (b) { return String(b.id) === target; });
  if (!booth) return { success: false, message: 'Bilik tidak ditemukan' };

  const me = getRows_('users').find(function (x) { return String(x.id) === String(u.id); });
  if (me && String(me.boothId || '') !== target) {
    saveRow_('users', Object.assign({}, me, { boothId: target }));
  }
  return { success: true, booth: booth };
}

function setBoothCurrent_(body) {
  const boothId  = String(body.boothId || '').trim();
  const voterId  = String(body.voterId || '').trim();
  const voterName = body.voterName || '';
  const overrideName = body.name || '';

  if (!boothId) return { success: false, message: 'boothId wajib' };

  const booth = getRows_('booths').find(function (b) { return String(b.id) === boothId; });
  if (!booth) return { success: false, message: 'Bilik tidak ditemukan' };

  const prevVoterId = String(booth.currentVoterId || '');
  if (prevVoterId && prevVoterId !== voterId) updateVoterBooth_(prevVoterId, '');
  if (voterId) updateVoterBooth_(voterId, boothId);

  const now = new Date().toISOString();
  saveRow_('booths', Object.assign({}, booth, { name: overrideName || booth.name, status: voterId ? 'occupied' : 'ready', currentVoterId: voterId, updatedAt: now }));
  return { success: true, boothId: boothId, voterId: voterId, voterName: voterName };
}

function updateVoterBooth_(voterId, boothId) {
  if (!voterId) return;
  const v = getRows_('voters').find(function (x) { return String(x.id) === String(voterId); });
  if (!v) return;
  if (String(v.boothId || '') === String(boothId || '')) return;
  saveRow_('voters', Object.assign({}, v, { boothId: boothId || '' }));
}

/* ============================================================
 *  VOTING & RESULTS
 * ============================================================ */
function submitVotes_(token, body) {
  const voterId = String(body.voterId || '').trim();
  if (!voterId) return { success: false, message: 'voterId wajib' };

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (_) { return { success: false, message: 'Server sibuk, coba lagi' }; }

  try {
    const v = getRows_('voters').find(function (r) { return String(r.id) === voterId; });
    if (!v) return { success: false, message: 'Voter tidak ditemukan' };
    if (truthy_(v.voted)) return { success: false, message: 'Voter sudah memilih' };

    const votes = Array.isArray(body.votes) ? body.votes : [];
    const now   = new Date().toISOString();
    const sh    = sheet_('votes');
    const boothId = token.user.boothId || '';

    votes.forEach(function (vt) {
      if (!vt || !vt.candidateId) return;
      sh.appendRow([uuid_(), voterId, vt.candidateId, vt.position || '', now, boothId]);
    });

    saveRow_('voters', Object.assign({}, v, { voted: true, photoUrl: body.photoUrl || v.photoUrl || '', boothId: '' }));

    const booths = getRows_('booths');
    booths.forEach(function (b) {
      if (String(b.currentVoterId) === voterId) setBoothCurrent_({ boothId: b.id, voterId: '', name: b.name });
    });

    log_(token.user.username, 'vote', v.name);
    return { success: true, votesCount: votes.length };
  } finally { try { lock.releaseLock(); } catch (_) {} }
}

function results_() {
  const votes      = getRows_('votes');
  const candidates = getRows_('candidates').filter(function (c) { return truthy_(c.active); });
  const voters     = getRows_('voters');

  const tally = {};
  votes.forEach(function (v) { const cid = String(v.candidateId || ''); if (cid) tally[cid] = (tally[cid] || 0) + 1; });

  const groups = {};
  candidates.forEach(function (c) {
    const pos = String(c.position || 'lainnya');
    groups[pos] = groups[pos] || [];
    groups[pos].push({ id: c.id, name: c.name || '', noUrut: c.noUrut || '', photoUrl: c.photoUrl || '', votes: tally[String(c.id)] || 0 });
  });

  Object.keys(groups).forEach(function (pos) {
    groups[pos].sort(function (a, b) { if ((b.votes || 0) !== (a.votes || 0)) return (b.votes || 0) - (a.votes || 0); return (Number(a.noUrut) || 0) - (Number(b.noUrut) || 0); });
  });

  const totalVoted = voters.filter(function (v) { return truthy_(v.voted); }).length;
  return { success: true, groups: groups, totalVoters: voters.length, totalVoted: totalVoted, timestamp: new Date().toISOString() };
}

/* ============================================================
 *  BERITA ACARA & DASHBOARD
 * ============================================================ */
function saveBerita_(body) {
  const row = { id: uuid_(), title: body.title || 'Berita Acara', content: body.content || '', photos: JSON.stringify(body.photos || []), signatures: JSON.stringify(body.signatures || []), createdAt: new Date().toISOString(), createdBy: body.createdBy || '-' };
  sheet_('berita').appendRow(HEADERS.BeritaAcara.map(function (h) { return safeCell_(row[h]); }));
  return { success: true, data: row };
}

function dashSummary_() {
  const voters     = getRows_('voters');
  const booths     = getRows_('booths');
  const candidates = getRows_('candidates');

  const voted = voters.filter(function (v) { return truthy_(v.voted); }).length;
  const boothsReady = booths.filter(function (b) { return String(b.status) === 'ready' && !b.currentVoterId; }).length;
  const boothsOccupied = booths.filter(function (b) { return !!b.currentVoterId; }).length;

  return { success: true, data: { totalVoters: voters.length, voted: voted, boothsReady: boothsReady, boothsOccupied: boothsOccupied, boothsTotal: booths.length, candidates: candidates.filter(function (c) { return truthy_(c.active); }).length, serverTime: new Date().toISOString() } };
}

/* ============================================================
 *  SEED
 * ============================================================ */
function seedDatabase() {
  const ss = SS;

  if (!ss.getSheetByName(SHEETS.users)) {
    const sh = ss.insertSheet(SHEETS.users);
    sh.appendRow(HEADERS.Users); sh.setFrozenRows(1);
  }
  const userSheet = ss.getSheetByName(SHEETS.users);
  if (userSheet.getLastRow() <= 1) {
    const seeds = [
      { username: 'admin',    password: 'admin123',   name: 'Administrator',  role: 'admin' },
      { username: 'petugas1', password: 'petugas123', name: 'Petugas Satu',   role: 'petugas' },
      { username: 'bilik-1',  password: 'bilik123',   name: 'Bilik 1',        role: 'bilik' },
      { username: 'bilik-2',  password: 'bilik123',   name: 'Bilik 2',        role: 'bilik' },
      { username: 'bilik-3',  password: 'bilik123',   name: 'Bilik 3',        role: 'bilik' },
    ];
    seeds.forEach(function (s) { userSheet.appendRow([uuid_(), s.username, hash_(s.password), s.name, s.role, '', true, new Date().toISOString()]); });
  }

  if (!ss.getSheetByName(SHEETS.booths)) {
    const sh = ss.insertSheet(SHEETS.booths);
    sh.appendRow(HEADERS.Booths); sh.setFrozenRows(1);
  }
  const boothSheet = ss.getSheetByName(SHEETS.booths);
  if (boothSheet.getLastRow() <= 1) {
    for (let i = 1; i <= 3; i++) {
      boothSheet.appendRow([uuid_(), 'Bilik ' + i, 'ready', '', new Date().toISOString(), '']); // Update lastActive kosong
    }
  }

  const users = getRows_('users');
  const booths = getRows_('booths');
  booths.forEach(function (b, i) {
    const bu = users.find(function (u) { return u.username === 'bilik-' + (i + 1); });
    if (bu && !bu.boothId) saveRow_('users', Object.assign({}, bu, { boothId: b.id }));
  });

  if (!ss.getSheetByName(SHEETS.settings)) {
    const sh = ss.insertSheet(SHEETS.settings);
    sh.appendRow(HEADERS.Settings); sh.setFrozenRows(1);
    sh.appendRow(['invitation_signer', 'Ketua Panitia']);
    sh.appendRow(['voter_positions', JSON.stringify(['ketua_rt', 'ketua_pemuda', 'wakil_pemuda'])]);
    sh.appendRow(['event_name', 'Pemilihan Ketua RT / Ketua & Wakil Pemuda']);
    const nextMonth = new Date(); nextMonth.setDate(nextMonth.getDate() + 30);
    sh.appendRow(['election_date', nextMonth.toISOString()]);
  }

  Object.keys(HEADERS).forEach(function (name) {
    const sh = SS.getSheetByName(name);
    if (!sh) { const ns = SS.insertSheet(name); ns.appendRow(HEADERS[name]); ns.setFrozenRows(1); }
  });

  const order = ['Users', 'Voters', 'Candidates', 'Votes', 'Booths', 'Attendance', 'Settings', 'BeritaAcara', 'Feedback', 'Logs'];
  order.forEach(function (name, i) {
    const sh = SS.getSheetByName(name);
    if (sh) { SS.setActiveSheet(sh); SS.moveActiveSheet(i + 1); }
  });

  SpreadsheetApp.getActive().toast('Seed selesai ✅', 'E-Vote', 5);
}