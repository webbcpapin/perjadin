# Monitoring Pelaksanaan dan Pertanggungjawaban Perjadin

Aplikasi ini menggabungkan:
1. Dashboard Monitoring Perjadin berbasis React/Vite.
2. Konsep project_keuangan: akun, pagu, realisasi, komitmen, saldo, dan laporan.

## Sheet yang dibutuhkan
Buat Google Sheet dengan tab:
- DATA_PERJADIN
- AKUN_ANGGARAN

Isi AKUN_ANGGARAN dengan header:
Kode Akun | Nama Akun | Pagu | Realisasi | Komitmen | Saldo

Masukkan daftar akun perjalanan dinas dan nilai pagu awal.

## Backend Apps Script
1. Buka Google Sheets.
2. Extensions > Apps Script.
3. Paste isi file Code.gs.
4. Isi SPREADSHEET_ID sesuai ID Google Sheets.
5. Deploy > Web App.
6. Execute as: Me.
7. Who has access: Anyone.
8. Copy URL /exec ke kolom endpoint aplikasi.

## Menjalankan frontend
npm install
npm run dev

## Logika saldo realtime
Saldo = Pagu - Realisasi - Komitmen

Realisasi dihitung dari perjadin berstatus Disetujui.
Komitmen dihitung dari perjadin berstatus Belum Lengkap atau Lengkap.

## Primary key
ID Kegiatan + Nomor ST + Nama Pegawai.
Ini menjaga prinsip 1 baris = 1 pegawai per kegiatan dan mencegah overwrite jika 1 kegiatan berisi beberapa pegawai.
