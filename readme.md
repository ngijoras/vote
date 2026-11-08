# 📄 `README.md` — FULL FIX FINAL (Lengkap & Akurat)

Berikut versi lengkap `README.md` yang sudah:

- ✅ **Dokumentasi semua role**: admin, petugas, bilik, **coklit**
- ✅ **Alur per-role** dengan step-by-step
- ✅ **Struktur file** yang akurat (termasuk `views-coklit.js` & `auth.js`)
- ✅ **Urutan script loading** yang benar (penting untuk debugging)
- ✅ **API Reference** (semua action backend)
- ✅ **Troubleshooting** section (masalah umum + solusi)
- ✅ **QA Checklist** sebelum hari-H
- ✅ **Panduan deploy** langkah demi langkah
- ✅ **Security notes** untuk data sensitif
- ✅ **FAQ** untuk pertanyaan umum
- ✅ **Changelog** versi terbaru

```markdown
# 🗳️ E-Vote: Sistem Pemilihan Elektronik (E-Voting) Terintegrasi

Sistem E-Voting berbasis Web (Frontend) + Google Apps Script + Google Sheets (Backend). Dirancang untuk pemilihan tingkat RT/RW (Ketua RT, Ketua Pemuda, Wakil Pemuda) dengan standar **keamanan**, **transparansi**, dan **auditabilitas** tinggi — sesuai standar operasional KPU.

> **Versi**: 2.0.0 • **Terakhir update**: Desember 2025
> **Kontribusi**: Open source untuk kebutuhan lingkungan RT/RW

---

## 📋 Daftar Isi

1. [Fitur Utama](#-fitur-utama)
2. [Arsitektur Sistem](#-arsitektur-sistem)
3. [Panduan Instalasi](#-panduan-instalasi)
4. [Struktur Proyek](#-struktur-proyek)
5. [Alur Penggunaan per Role](#-alur-penggunaan-per-role)
6. [API Reference](#-api-reference)
7. [QA Checklist](#-qa-checklist-sebelum-hari-h)
8. [Troubleshooting](#-troubleshooting)
9. [FAQ](#-faq)
10. [Changelog](#-changelog)
11. [Lisensi](#-lisensi)

---

## 🚀 Fitur Utama

### 1. Multi-Role Access Control (RBAC)

Aplikasi ini memiliki **4 role pengguna terpisah** dengan hak akses spesifik:

| Role | Fungsi | Menu Utama |
|------|--------|------------|
| **Admin** | Kontrol penuh sistem | 10 menu (dashboard, voters, calon, bilik, users, undangan, hasil, BA, logs, settings) |
| **Petugas** | Absensi & antrian pemilih | 5 menu (dashboard, absensi, antrian, hasil, BA) |
| **Bilik** | Antarmuka bilik suara | 1 menu (voting) |
| **Coklit** | Validasi data pemilih | 2 menu (dashboard, daftar pemilih) |

**Default Login**:
```
Admin    → admin / admin123
Petugas  → petugas1 / petugas123
Bilik    → bilik-1 / bilik123
Coklit   → coklit1 / coklit123
```
⚠️ **Ganti semua password default** sebelum hari-H via menu **Pengguna**.

### 2. Keamanan & Integritas Data

- **Token-based Auth**: Sesi login aman dengan TTL 6 jam, auto-logout saat expired
- **LockService**: Mencegah race-condition saat voting bersamaan (anti double-vote)
- **Audit Trail**: Semua aktivitas (login, check-in, vote, reset, coklit, error) tercatat di sheet `Logs`
- **Backup & Restore**: Ekspor seluruh database ke `.json` dan impor kembali
- **Anti-Double Vote**: Validasi ketat di backend (`voted = true` tidak bisa voting lagi)
- **Cache Invalidation**: Setiap write operation otomatis clear cache untuk konsistensi

### 3. Manajemen Pemilihan

- **Upload Foto Calon**: Foto diunggah ke Google Drive → URL `lh3.googleusercontent.com` (ringan)
- **Tanda Tangan Digital**: Canvas signature untuk absensi & Berita Acara (mendukung undo/clear)
- **Mode Pemilihan**:
  - **Tunggal**: Pemilih mencoblos 1 paket (Ketua + Wakil)
  - **Ganda**: Pemilih mencoblos Ketua & Wakil secara terpisah (maks. 2 suara)
- **Cetak Undangan Presisi**: Layout A4/A5/A6 tanpa terpotong (via iframe terisolasi)
- **QR Code Scanner**: Scan undangan via kamera device (`html5-qrcode`)
- **Text-to-Speech (TTS)**: Suara panggilan otomatis Bahasa Indonesia
- **Reset Pemilih**: Kembalikan status (hapus suara, lepas bilik)
- **Real-time Bilik**: Status online/offline via heartbeat ping (refresh 2.5–5 detik)

### 4. Fitur Coklit (Pencocokan & Penelitian)

Standar operasional KPU untuk **validasi data pemilih sebelum hari-H**:

- **Read-Only Access**: Coklit hanya bisa lihat daftar, tidak bisa edit/hapus
- **Status 3 State**: `pending` (Belum) / `valid` (Sesuai) / `invalid` (Perbaikan)
- **Filter & Search**: Berdasarkan status, RT, nama, kode
- **Batch Validation**: Pilih banyak pemilih → tandai sekaligus
- **Undo**: Kembalikan status dari valid/invalid ke pending
- **Progress Bar**: Visual persentase penyelesaian coklit
- **Auto-Sync**: Status otomatis terlihat di dashboard Admin

---

## 🏗️ Arsitektur Sistem

```
┌─────────────────────────────────────────────────────┐
│                   FRONTEND (Static)                 │
│  HTML5 + CSS3 + Vanilla JS (ES6)                    │
│  Library: qrcode.js, html5-qrcode                   │
│  Hosting: GitHub Pages / Netlify / Vercel           │
└──────────────────┬──────────────────────────────────┘
                   │ HTTPS (JSON over POST)
                   ▼
┌─────────────────────────────────────────────────────┐
│              BACKEND (Apps Script V8)               │
│  Router + Auth + CRUD + Upload + Voting + Coklit    │
│  Execution: 6 menit/hari (kuota gratis)             │
└──────────────────┬──────────────────────────────────┘
                   │
      ┌────────────┼────────────┐
      ▼            ▼            ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│  Sheets  │ │  Drive   │ │  Cache   │
│ (Data)   │ │ (Files)  │ │ (Token)  │
└──────────┘ └──────────┘ └──────────┘
```

**Sheets** (10 sheet):
- `Users` — Akun pengguna (admin/petugas/bilik/coklit)
- `Voters` — Data pemilih (+ `coklitStatus`)
- `Candidates` — Calon (RT/Pemuda/Wakil)
- `Votes` — Suara yang masuk
- `Booths` — Bilik suara & status
- `Attendance` — Log kehadiran
- `Settings` — Konfigurasi event
- `BeritaAcara` — BA + TTD panitia
- `Logs` — Audit trail
- `Feedback` — Kritik & saran dari landing page

---

## 🛠️ Panduan Instalasi

### Prasyarat

- ✅ Akun Google (Gmail)
- ✅ Browser modern (Chrome/Edge/Firefox/Safari terbaru)
- ✅ Akun GitHub (untuk hosting frontend) atau Netlify/Vercel
- ✅ Koneksi internet stabil (min. 1 Mbps)

### Langkah 1 — Persiapan Google Sheets

1. Buka [sheets.new](https://sheets.new) → buat spreadsheet baru
2. Beri nama: **"E-Vote Database"**
3. Buka menu **Extensions → Apps Script**
4. Hapus semua kode default di editor

### Langkah 2 — Deploy Backend

1. Copy seluruh isi `code.gs` → paste ke editor Apps Script
2. **Simpan** (Ctrl+S)
3. Pilih function `seedDatabase` di dropdown → klik **▶ Run**
4. **Authorize** akses (Sheets + Drive) saat diminta
5. Cek **Execution log** → harus muncul: `Database siap digunakan`
6. **Deploy → New deployment**:
   - Type: **Web app**
   - Execute as: **Me (email Anda)**
   - Who has access: **Anyone**
7. Klik **Deploy** → **copy URL** (berakhiran `/exec`)

### Langkah 3 — Konfigurasi Frontend

1. Clone/download semua file proyek
2. Buka `js/api.js` → cari:
   ```javascript
   const BASE_URL = 'https://script.google.com/macros/s/XXXX/exec';
   ```
3. Ganti dengan URL dari Langkah 2
4. **Simpan**

### Langkah 4 — Hosting Frontend

**Opsi A — GitHub Pages** (gratis):
1. Upload semua file ke repo GitHub
2. **Settings → Pages → Source: main branch → Save**
3. Akses via `https://username.github.io/repo-name/`

**Opsi B — Netlify** (drag & drop):
1. Buka [netlify.com/drop](https://app.netlify.com/drop)
2. Drag folder proyek → instant deploy

**Opsi C — Lokal** (testing):
1. Buka terminal di folder proyek
2. Jalankan: `python -m http.server 8000`
3. Akses: `http://localhost:8000`

### Langkah 5 — Folder Drive (PENTING)

Setelah upload pertama, buka Google Drive:
1. Folder `E-Vote_Assets` → klik kanan → **Share** → **Anyone with link → Viewer**
2. Folder `E-Vote_Photos` → sama
3. Folder `E-Vote_Signatures` → sama

⚠️ **Tanpa akses publik, foto & TTD tidak akan tampil di web.**

### Langkah 6 — Verifikasi

1. Buka `login.html` di browser
2. Login `admin / admin123`
3. Jika redirect ke dashboard admin → **sukses** ✅
4. Uji juga login `coklit1 / coklit123` → harus masuk dashboard coklit

---

## 📁 Struktur Proyek

```
e-vote/
├── index.html              # Landing page (countdown, kandidat, feedback)
├── login.html              # Halaman login
├── app.html                # Dashboard utama (SPA)
├── appsscript.json         # Manifest Apps Script
├── code.gs                 # Backend Apps Script (FULL FIX)
├── README.md               # Dokumentasi ini
│
├── css/
│   └── style.css           # Styling global
│
├── js/
│   ├── storage.js          # SafeStorage (fallback memory)
│   ├── api.js              # HTTP wrapper ke Apps Script
│   ├── auth.js             # Auth layer + role helpers
│   ├── cache.js            # Cache layer + smart preload
│   ├── ui.js               # Toast, modal, formatter
│   ├── voice.js            # Text-to-Speech
│   ├── qr.js               # QR generate + scan
│   ├── sign.js             # Signature pad
│   ├── router.js           # SPA hash router + auth guard
│   │
│   ├── views-admin.js      # Views role admin
│   ├── views-petugas.js    # Views role petugas
│   ├── views-bilik.js      # Views role bilik
│   └── views-coklit.js     # Views role coklit ✨
│
└── assets/
    └── logo.svg            # Logo organisasi
```

### ⚠️ Urutan Script Loading (WAJIB)

Di `app.html`, urutan script **HARUS** seperti ini (dari atas ke bawah):

```html
1. js/storage.js       ← SafeStorage
2. js/api.js           ← API wrapper
3. js/auth.js          ← Auth (verify, role helpers)
4. js/cache.js         ← Cache
5. js/ui.js            ← UI helpers
6. js/voice.js         ← TTS
7. js/qr.js            ← QR
8. js/sign.js          ← Sign pad
9. js/views-admin.js
10. js/views-petugas.js
11. js/views-bilik.js
12. js/views-coklit.js ← Role baru
13. js/router.js       ← WAJIB PALING BAWAH
```

**Jika `router.js` bukan paling bawah** → view tidak ter-load (console error).

---

## 📖 Alur Penggunaan per Role

### 1. Alur Admin

| Langkah | Menu | Aksi |
|---------|------|------|
| 1 | **Pengaturan** | Atur nama event, tanggal, TTD panitia, mode pemilihan |
| 2 | **Calon** | Tambah calon (upload foto, isi visi/misi) |
| 3 | **Pemilih** | Import CSV/TXT atau tambah manual |
| 4 | **Pengguna** | Buat akun untuk petugas, bilik, coklit |
| 5 | **Bilik** | Pastikan bilik dibuat & terhubung ke akun bilik |
| 6 | **Undangan** | Cetak QR Code untuk warga (A4/A5/A6) |
| 7 | **Hasil** | Pantau perolehan suara real-time (refresh 5s) |
| 8 | **Berita Acara** | Buat BA + TTD digital panitia → cetak PDF |
| 9 | **Log Aktivitas** | Pantau semua aktivitas sistem |
| 10 | **Backup** | Download `.json` berkala (untuk recovery) |

### 2. Alur Petugas

| Langkah | Aksi |
|---------|------|
| 1 | Login sebagai `petugas` |
| 2 | Buka **Absensi Pemilih** |
| 3 | Scan QR undangan **atau** input kode manual |
| 4 | Minta pemilih tanda tangan digital di layar |
| 5 | Klik **Konfirmasi Kehadiran** |
| 6 | Sistem auto-arahkan ke bilik kosong (TTS berbunyi) |
| 7 | Pantau **Antrian & Bilik** jika ada penumpukan |
| 8 | Klik **Panggil** untuk manual panggil antrian |

### 3. Alur Bilik

| Langkah | Aksi |
|---------|------|
| 1 | Login sebagai `bilik-1` (atau bilik-N) |
| 2 | Tunggu nama pemilih muncul (dikirim petugas) |
| 3 | Pemilih memilih calon di layar (klik kartu) |
| 4 | Ambil foto pemilih (opsional, sebagai bukti) |
| 5 | Klik **Kirim Suara** |
| 6 | Sistem kunci suara & kosongkan bilik otomatis |

### 4. Alur Coklit ✨ (BARU)

| Langkah | Aksi |
|---------|------|
| 1 | Login sebagai `coklit1` |
| 2 | Buka **Dashboard Coklit** → lihat progress |
| 3 | Klik **Mulai Coklit Data** |
| 4 | Filter by RT atau search nama pemilih |
| 5 | Bandingkan data di layar dengan KTP/KK fisik |
| 6 | Klik **✅** jika data cocok → status "Sesuai" |
| 7 | Klik **❌** jika ada salah → status "Perbaikan" |
| 8 | (Opsional) Centang beberapa pemilih → **batch validasi** |
| 9 | Klik **↩️** untuk reset ke "Belum" jika keliru |
| 10 | Progress bar di dashboard auto-update |

**Hak Akses Coklit**:
- ✅ Lihat daftar pemilih
- ✅ Tandai status coklit (valid/invalid/pending)
- ✅ Batch validasi
- ❌ Edit/hapus data pemilih
- ❌ Akses menu lain (auto-redirect)
- ❌ Lihat data suara

---

## 🔌 API Reference

Semua action via `POST` ke `BASE_URL` dengan body JSON:

```javascript
{ "action": "<nama_action>", "token": "<session>", ...params }
```

### Public Actions (tanpa token)

| Action | Params | Fungsi |
|--------|--------|--------|
| `health` | — | Cek server online |
| `login` | `username`, `password` | Login & dapat token |
| `candidates.public` | — | Daftar calon (landing page) |
| `settings.public` | — | Settings publik (event, tanggal) |
| `feedback.save` | `name`, `message`, `category` | Kirim feedback |

### Protected Actions (butuh token)

| Action | Role | Fungsi |
|--------|------|--------|
| `me` | all | Info user dari token |
| `logout` | all | Hapus token |
| `list` | all | Ambil data sheet (`sheet: 'voters'`) |
| `save` | all | Simpan/update row |
| `delete` | all | Hapus row by id |
| `settings.save` | admin | Simpan setting (support upload file) |
| `voters.bulk` | admin, petugas | Import pemilih massal |
| `voters.byCode` | admin, petugas, bilik | Cari pemilih by kode |
| `voters.reset` | admin | Reset pemilih (hapus suara) |
| **`voters.coklit`** | **admin, coklit** | **Update status coklit ✨** |
| `attendance.checkin` | petugas, admin | Check-in pemilih (+ TTD) |
| `booth.claim` | bilik | Klaim bilik |
| `booth.ping` | bilik | Heartbeat bilik |
| `booth.status` | all | Status semua bilik + ping |
| `booth.setCurrent` | petugas, admin | Set pemilih di bilik |
| `vote.submit` | bilik | Submit suara (anti double-vote) |
| `results` | all | Hasil perolehan suara |
| `ba.save` | admin, petugas | Simpan berita acara |
| `ba.list` | all | List berita acara |
| `logs.list` | admin | Audit trail |
| `backup.export` | admin | Export semua data → JSON |
| `backup.import` | admin | Restore dari JSON |
| `dash.summary` | all | Ringkasan dashboard (+ coklit stats) |

---

## ✅ QA Checklist (Sebelum Hari-H)

Lakukan **minimal H-1** sebelum pemilihan:

### Fungsional
- [ ] Login semua role (admin/petugas/bilik/coklit) berhasil
- [ ] Dashboard admin menampilkan statistik benar
- [ ] Tambah/edit/hapus pemilih berfungsi
- [ ] Import CSV pemilih berhasil (cek `skipped` = 0)
- [ ] Upload foto calon → tampil di kartu pemilih
- [ ] Print undangan A4/A5/A6 → tidak terpotong
- [ ] QR code di undangan bisa di-scan
- [ ] Test check-in pemilih + tanda tangan
- [ ] Test voting di bilik (mode tunggal & ganda)
- [ ] Hasil suara akumulasi benar
- [ ] Test reset pemilih (hapus suara)
- [ ] Buat berita acara + TTD + print PDF

### Coklit (BARU)
- [ ] Login coklit → dashboard progress tampil
- [ ] Filter RT berfungsi & persistent
- [ ] Search nama/kode berfungsi
- [ ] Tandai valid → badge berubah hijau
- [ ] Tandai invalid → badge berubah merah
- [ ] Undo (↩️) → kembali pending
- [ ] Batch validation 5 pemilih sekaligus
- [ ] Admin lihat status coklit di tabel Pemilih
- [ ] Log aktivitas coklit muncul di menu Logs

### Keamanan
- [ ] Ganti semua password default
- [ ] Bilik tidak bisa akses menu admin
- [ ] Coklit tidak bisa edit/hapus pemilih
- [ ] Token expired → auto logout
- [ ] Backup `.json` berhasil di-download
- [ ] Restore dari backup berhasil

### Performa
- [ ] Refresh global berfungsi (< 3 detik)
- [ ] Polling bilik tidak boros kuota
- [ ] Mobile view responsif (360px width)
- [ ] Print preview tidak blank

---

## 🔧 Troubleshooting

### ❌ "ViewsCoklit is not defined"

**Penyebab**: `views-coklit.js` tidak dimuat atau urutan script salah.

**Solusi**:
1. Buka `app.html` → cek ada `<script src="js/views-coklit.js"></script>` **sebelum** `router.js`
2. Hard refresh: `Ctrl+Shift+R`
3. Cek DevTools → **Network** → pastikan `views-coklit.js` status `200`

### ❌ "Token expired, silakan login ulang"

**Penyebab**: Sesi habis (6 jam) atau token di-cache server invalid.

**Solusi**:
1. Logout → login ulang
2. Jika terus terjadi → cek `BASE_URL` di `js/api.js` masih mengarah ke Apps Script **lama**?
3. Redeploy Apps Script: **Deploy → New version**

### ❌ Foto calon tidak muncul

**Penyebab**: Folder Drive tidak publik.

**Solusi**:
1. Buka Google Drive → folder `E-Vote_Assets`
2. Klik kanan → **Share** → **Anyone with the link → Viewer**
3. Refresh browser

### ❌ Print undangan blank

**Penyebab**: CSS `@media print` di iframe tidak ter-load.

**Solusi**:
1. Cek `css/style.css` valid (tidak 404)
2. Cek popup blocker → izinkan popup untuk domain
3. Coba browser lain (Chrome lebih stabil)

### ❌ Import CSV gagal / skipped > 0

**Penyebab**: Kode pemilih duplikat atau format salah.

**Solusi**:
1. Pastikan kolom wajib: `code, name, rt, rw`
2. Cek tidak ada kode duplikat
3. Cek log `Logs` sheet untuk detail error

### ❌ Kamera tidak bisa diakses (scan QR)

**Penyebab**: Browser butuh HTTPS.

**Solusi**:
1. Pastikan site diakses via `https://` (bukan `http://`)
2. `localhost` diizinkan untuk testing
3. Cek izin kamera browser (Settings → Camera → Allow)

### ❌ Coklit tidak bisa validasi pemilih

**Penyebab**: Role tidak tepat atau token expired.

**Solusi**:
1. Cek di console: `Auth.user()` → harus `{role: 'coklit', ...}`
2. Cek `code.gs` action `voters.coklit` punya `['admin', 'coklit']`
3. Cek user coklit di sheet `Users` → `active = true`

### ❌ Aplikasi blank setelah login

**Penyebab**: Error di JS sebelum render.

**Solusi**:
1. Buka DevTools → **Console** → cari error merah
2. Kemungkinan: `router.js` error, `ViewsAdmin` undefined, dll
3. Cek urutan script di `app.html`

---

## ❓ FAQ

**Q: Bisa dipakai untuk pemilihan > 1000 pemilih?**
A: Bisa, tapi perhatikan kuota Apps Script gratis (6 menit/hari). Untuk > 1000 pemilih, gunakan akun Google Workspace.

**Q: Apakah data aman?**
A: Data tersimpan di Google Sheets (milik Anda). Token disimpan di `CacheService` (server-side). Password di-hash SHA-256. Akses web app wajib "Anyone" agar frontend bisa akses, tapi action protected butuh token valid.

**Q: Bisa custom logo?**
A: Ya, ganti file `assets/logo.svg` dengan logo Anda.

**Q: Bisa custom nama event?**
A: Ya, via menu **Pengaturan → Nama Event**.

**Q: Apakah bisa dipakai offline?**
A: Tidak. Sistem butuh koneksi ke Apps Script (backend). Cache hanya untuk UX, bukan offline mode.

**Q: Bagaimana jika server down saat hari-H?**
A: Sistem tidak bisa dipakai (butuh backend online). **Sangat disarankan** siapkan backup kertas (formulir manual) sebagai contingency.

**Q: Berapa lama token valid?**
A: 6 jam (default). Bisa diubah di `code.gs` → `TOKEN_TTL`.

**Q: Bisakah 1 pemilih voting 2 kali?**
A: Tidak. Validasi di backend (`voted = true`) + LockService mencegah race condition.

**Q: Apakah support bahasa lain?**
A: Saat ini Bahasa Indonesia. TTS bisa diubah via `voice.js` → `config.lang`.

**Q: Bagaimana cara backup otomatis?**
A: Belum built-in. Bisa dibuat trigger Google Apps Script (time-driven) untuk auto-export harian.

---

## 📝 Changelog

### v2.0.0 (Desember 2025) — Coklit Edition
- ✨ **BARU**: Role Coklit (Pencocokan & Penelitian data pemilih)
- ✨ **BARU**: Menu `#/coklit` & `#/coklit/voters`
- ✨ **BARU**: Kolom `coklitStatus` di sheet Voters (auto-migrate)
- ✨ **BARU**: Batch validation coklit
- ✨ **BARU**: Progress bar coklit di dashboard admin
- ✨ **BARU**: Statistik coklit di `dash.summary`
- ✨ **BARU**: Offline banner + session expired listener
- 🔧 **FIX**: Print undangan pakai iframe terisolasi (anti-blank)
- 🔧 **FIX**: Semua Views `_clearAllPolls()` untuk memory hygiene
- 🔧 **FIX**: `Auth.on('expired')` listener di router
- 🔧 **FIX**: `views-admin.js` role dropdown + coklit option
- 🔧 **FIX**: `saveVotersBulk_` init `coklitStatus = 'pending'`
- 🔧 **FIX**: Backup/restore lebih robust

### v1.5.0 — Audit & Logs
- ✨ Menu Log Aktivitas (audit trail)
- ✨ Menu Logs dengan badge warna per action
- 🔧 `log_()` dipanggil di semua action kritikal

### v1.0.0 — Initial Release
- Auth multi-role (admin, petugas, bilik)
- CRUD pemilih, calon, bilik, user
- Voting + anti double-vote
- TTD digital (absensi & BA)
- QR scan & generate
- TTS panggilan
- Real-time hasil

---

## 🤝 Kontribusi

Proyek ini bersifat **open-source** untuk kebutuhan lingkungan RT/RW.

**Cara kontribusi**:
1. Fork repo
2. Buat branch: `git checkout -b feature/nama-fitur`
3. Commit: `git commit -m "feat: tambah fitur X"`
4. Push: `git push origin feature/nama-fitur`
5. Buka Pull Request

**Panduan**:
- Ikuti gaya kode existing (ES6, `'use strict'`, IIFE)
- Test semua role sebelum PR
- Update README jika ada fitur baru

---

## 📄 Lisensi

**MIT License** — bebas digunakan, dimodifikasi, dan didistribusikan.

**Attribution** (opsional tapi dihargai):
```
E-Vote System — https://github.com/username/e-vote
```

---

## 🙏 Kredit

- **Icons**: Emoji native (tanpa library)
- **QR Library**: [qrcodejs](https://github.com/davidshimjs/qrcodejs) + [html5-qrcode](https://github.com/mebjas/html5-qrcode)
- **Font**: System font stack (tanpa Google Fonts untuk privasi)
- **Backend**: Google Apps Script + Google Sheets + Drive

---

## 📞 Dukungan

**Laporkan bug** atau **request fitur**:
- Buka [GitHub Issues](https://github.com/username/e-vote/issues)
- Sertakan: screenshot, langkah reproduce, browser & versi

**Kontak Panitia**:
- WhatsApp: (isi dengan nomor panitia)
- Email: (isi dengan email panitia)

---

> **⚠️ Disclaimer**: Sistem ini dirancang untuk pemilihan tingkat RT/RW. Untuk pemilihan skala besar (desa/kota), konsultasikan dengan KPU setempat dan gunakan sistem yang tersertifikasi.

**Selamat menggunakan E-Vote! 🗳️**
```

---

## ✅ Ringkasan Update `README.md`

| Section | Isi |
|---------|-----|
| **Fitur Utama** | 4 role (admin/petugas/bilik/**coklit**), keamanan, manajemen, coklit |
| **Arsitektur** | Diagram frontend-backend-sheets |
| **Instalasi** | 6 langkah (Sheets → Apps Script → Deploy → Konfigurasi → Hosting → Verifikasi) |
| **Struktur Proyek** | Tree lengkap + urutan script loading **WAJIB** |
| **Alur per Role** | 4 tabel step-by-step |
| **API Reference** | Semua action (~25) dengan role & fungsi |
| **QA Checklist** | 4 kategori (fungsional, coklit, keamanan, performa) |
| **Troubleshooting** | 8 masalah umum + solusi |
| **FAQ** | 10 pertanyaan umum |
| **Changelog** | v2.0.0, v1.5.0, v1.0.0 |
| **Lisensi & Kredit** | MIT + attribution |

---

## 📦 Status Final Project

| File | Status | Aksi |
|------|--------|------|
| `code.gs` | ✅ Done | Paste & deploy |
| `js/views-admin.js` | ✅ Done | Paste |
| `js/views-coklit.js` | ✅ Done | Buat baru |
| `js/router.js` | ✅ Done | Paste |
| `app.html` | ✅ Done | Paste |
| **`README.md`** | ✅ **Done (file ini)** | **Paste** |
| `login.html` | ⚠️ Perlu update 1 baris (`roleRedirect` coklit) |
| `index.html` | ⚠️ Perlu update 1 baris (`roleToDashPath` coklit) |
| `js/auth.js` | ⚠️ Perlu update 1 baris (`isCoklit()`) |

**6 dari 9 file sudah final.** Sisanya (3 file minor) hanya butuh perubahan 1–3 baris masing-masing. Jika mau saya generate versi final 3 file tersebut sekaligus, tinggal bilang. 🚀