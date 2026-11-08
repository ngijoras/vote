Berikut adalah file **`README.md`** yang lengkap, terstruktur, dan siap pakai. Dokumentasi ini mencakup arsitektur sistem, panduan instalasi (setup Google Sheets & Apps Script), fitur lengkap (termasuk fitur baru: Audit Log, Backup, Reset), serta panduan penggunaan untuk setiap peran (Admin, Petugas, Bilik).

### 📄 `README.md` (FULL DOCUMENTATION)

Buat file baru bernama `README.md` di *root folder* proyek Anda, lalu salin kode di bawah ini:

```markdown
# 🗳️ E-Vote: Sistem Pemilihan Elektronik (E-Voting) Terintegrasi

Sistem E-Voting berbasis Web (Frontend) dan Google Apps Script + Google Sheets (Backend). Dirancang untuk pemilihan tingkat RT/RW (Ketua RT, Ketua Pemuda, Wakil Pemuda) dengan standar keamanan, transparansi, dan auditabilitas tinggi.

## 🚀 Fitur Utama

### 1. Multi-Role Access Control (RBAC)
- **Admin**: Akses penuh (kelola pemilih, calon, bilik, pengguna, pengaturan, backup, audit log).
- **Petugas**: Fokus pada absensi pemilih (Scan QR), manajemen antrian, dan pemantauan hasil.
- **Bilik**: Antarmuka khusus untuk bilik suara (input suara, kamera bukti, auto-redirect).

### 2. Keamanan & Integritas Data
- **Token-based Auth**: Sesi login aman (6 jam), auto-logout jika token kedaluwarsa.
- **LockService**: Mencegah *race condition* (tabrakan data) saat pemilih mencoblos bersamaan.
- **Audit Trail**: Mencatat setiap aktivitas (login, check-in, vote, reset, error) ke dalam sheet `Logs`.
- **Backup & Restore**: Ekspor seluruh database ke `.json` dan impor kembali jika terjadi *corruption*.

### 3. Manajemen Pemilihan
- **Upload Foto Calon**: Foto diunggah ke Google Drive, dikonversi menjadi URL `lh3.googleusercontent.com` (ringan & cepat).
- **Tanda Tangan Digital (TTD)**: Canvas signature untuk absensi petugas dan Berita Acara (mendukung Undo/Hapus).
- **Mode Pemilihan**:
  - **Tunggal**: Pemilih mencoblos 1 paket (Ketua & Wakil).
  - **Ganda**: Pemilih mencoblos Ketua dan Wakil secara terpisah (maks. 2 suara).
- **Cetak Undangan Presisi**: Ekspor PDF/Print dengan layout A4/A5/A6 yang presisi (tanpa terpotong).
- **QR Code Scanner**: Scan undangan menggunakan kamera device (via `html5-qrcode`).
- **Text-to-Speech (TTS)**: Suara panggilan otomatis (Bahasa Indonesia) saat pemilih diarahkan ke bilik/kursi tunggu.
- **Reset Pemilih**: Mengembalikan pemilih ke status awal (menghapus suara, melepas bilik) jika terjadi kesalahan.

---

## 🏗️ Arsitektur Sistem

- **Frontend**: HTML5, CSS3 (Custom Properties), Vanilla JavaScript (ES6), Library `qrcode.js`, `html5-qrcode`.
- **Backend**: Google Apps Script (V8 Engine).
- **Database**: Google Sheets (`Users`, `Voters`, `Candidates`, `Votes`, `Booths`, `Attendance`, `Settings`, `BeritaAcara`, `Logs`, `Feedback`).
- **Storage**: Google Drive (Foto Calon, TTD, Lampiran Berita Acara).
- **Hosting**: GitHub Pages / Netlify / Vercel (Statis).

---

## 🛠️ Panduan Instalasi

### 1. Persiapan Google Sheets
1. Buat Google Sheets baru.
2. Buka **Extensions** > **Apps Script**.
3. Hapus kode default, lalu *paste* seluruh isi file `code.gs` ke editor.
4. Simpan (Ctrl+S).
5. Jalankan fungsi `seedDatabase()` sekali untuk membuat sheet dan data *dummy* (admin, petugas, bilik).

### 2. Deploy Web App (Backend)
1. Di Apps Script, klik **Deploy** > **New deployment**.
2. Pilih tipe: **Web app**.
3. Konfigurasi:
   - **Execute as**: `Me (email Anda)`
   - **Who has access**: `Anyone`
4. Klik **Deploy**, lalu *Authorize* akses (Izinkan akses ke Spreadsheet & Drive).
5. Salin **Web App URL** (berakhiran `/exec`).

### 3. Konfigurasi Frontend
1. Buka file `js/api.js`.
2. Cari variabel `BASE_URL`, ganti dengan URL Web App Anda:
   ```javascript
   const BASE_URL = 'https://script.google.com/macros/s/XXXX/exec';
   ```
3. Upload seluruh folder proyek ke hosting (GitHub Pages/Netlify).

### 4. Konfigurasi Domain (Opsional)
Jika menggunakan GitHub Pages, pastikan URL `BASE_URL` sudah benar dan Web App Apps Script di-set ke `Anyone`.

---

## 📖 Panduan Penggunaan

### Login Awal
- **Admin**: `admin` / `admin123`
- **Petugas**: `petugas1` / `petugas123`
- **Bilik**: `bilik-1` / `bilik123`

*(Segera ganti password setelah login pertama kali di menu Pengguna).*

### 1. Alur Admin
1. **Pengaturan**: Atur nama event, tanggal, TTD panitia, dan mode pemilihan (Tunggal/Ganda).
2. **Calon**: Tambah calon (upload foto, isi visi/misi).
3. **Pemilih**: Import data pemilih (format CSV/TXT) atau tambah manual.
4. **Undangan**: Cetak undangan (QR Code) untuk dibagikan ke warga.
5. **Bilik**: Pastikan bilik sudah dibuat dan akun bilik terhubung.
6. **Hasil**: Pantau perolehan suara secara *real-time*.
7. **Berita Acara**: Buat BA otomatis setelah pemilihan selesai, minta TTD digital panitia/tokoh, lalu cetak PDF.
8. **Log Aktivitas**: Pantau semua aktivitas sistem.
9. **Backup**: Download `.json` secara berkala untuk keamanan data.

### 2. Alur Petugas
1. Buka menu **Absensi Pemilih**.
2. Scan QR Code pada undangan pemilih.
3. Minta pemilih untuk tanda tangan di layar (digital).
4. Klik **Konfirmasi Kehadiran**.
5. Sistem akan otomatis mengarahkan ke bilik kosong (suara TTS akan berbunyi).
6. Pantau **Antrian & Bilik** jika ada penumpukan.

### 3. Alur Bilik
1. Login sebagai akun bilik (contoh: `bilik-1`).
2. Tunggu hingga nama pemilih muncul di layar (dikirim oleh petugas).
3. Pemilih memilih calon di layar (klik kartu calon).
4. Ambil foto pemilih (opsional, sebagai bukti).
5. Klik **Kirim Suara**. Sistem akan mengunci suara dan mengosongkan bilik untuk pemilih berikutnya.

---

## ⚠️ Catatan Penting
- **Folder Drive**: Pastikan folder `E-Vote_Assets`, `E-Vote_Photos`, dan `E-Vote_Signatures` di Google Drive disetel ke **"Anyone with the link"** agar gambar dapat diakses publik.
- **Kuota Apps Script**: Batas eksekusi script adalah 6 menit/hari. Untuk pemilihan besar (>1000 pemilih), gunakan akun Google Workspace.
- **Browser Support**: Gunakan Chrome/Edge versi terbaru. Safari/iOS didukung untuk fitur dasar (kamera & TTS memerlukan HTTPS).

---

## 🤝 Kontribusi
Proyek ini bersifat *open-source* untuk kebutuhan lingkungan RT/RW. Silakan *fork* dan modifikasi sesuai kebutuhan.

---

## 📄 Lisensi
MIT License. Bebas digunakan dan dimodifikasi.
```

---

### Ringkasan Perubahan README:
1. **Struktur Jelas**: Menggunakan heading (H1, H2, H3) untuk navigasi cepat.
2. **Fitur Baru Didokumentasikan**: Menyebutkan **Audit Log**, **Backup/Restore**, **Mode Tunggal/Ganda**, dan **Reset Pemilih**.
3. **Panduan Instalasi Langkah-demi-Langkah**: Mulai dari Google Sheets, Apps Script Deploy, hingga konfigurasi `api.js`.
4. **Alur Pengguna (User Flow)**: Dijelaskan per-role (Admin, Petugas, Bilik) agar pengguna baru tidak bingung.
5. **Catatan Kritis**: Peringatan tentang izin folder Drive dan kuota Apps Script.