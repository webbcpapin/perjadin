# ePerjadin Manager

Dashboard internal untuk merekam, memvalidasi, dan memonitor data perjalanan dinas KPPBC TMP C Pangkalpinang yang bersumber dari SATU Kemenkeu.

## Komponen

- Aplikasi React/Vite: dashboard monitoring, input detail manual, validasi geotag, perhitungan SBM, dan rekap akun.
- `Code.gs`: API Google Apps Script untuk autentikasi PIN, upsert tunggal/batch, data monitoring, audit sinkronisasi, dan rekap anggaran.
- `collector-extension`: ekstensi Chrome read-only untuk merekam seluruh halaman tabel SATU Kemenkeu menjadi JSON.
- Google Sheet: `DATA_PERJADIN`, `AKUN_ANGGARAN`, dan `SINKRONISASI`.

## Alur sinkronisasi data utuh

1. Login ke SATU Kemenkeu dan buka halaman daftar Perjadin.
2. Jalankan Kolektor EPERJADIN pada setiap bagian/status, lalu pilih **Rekam semua halaman**.
3. Salin JSON hasil kolektor.
4. Pada ePerjadin Manager, buka panel **Sinkronisasi SATU Kemenkeu**, tempel JSON, dan periksa jumlah pusat serta jumlah yang terekam.
5. Klik **Sinkronkan ke Google Sheet**. Apps Script melakukan upsert sehingga pengambilan ulang memperbarui data tanpa membuat duplikasi.
6. Periksa tab `SINKRONISASI` untuk cakupan dan hasil setiap batch.

Pengambilan data SATU Kemenkeu bersifat read-only. Kolektor hanya membaca tabel dan mengoperasikan tombol pagination. Aksi persetujuan, pembatalan, penghapusan, dan perubahan transaksi tidak digunakan.

## Menjalankan aplikasi

```bash
npm ci
npm run dev
```

Verifikasi produksi:

```bash
npm run build
npx eslint src/App.tsx src/components/SyncPanel.tsx
node --check collector-extension/content-script.js
node --check collector-extension/popup.js
```

Push ke `main` akan menjalankan workflow GitHub Pages di `.github/workflows/pages.yml`.

## Konfigurasi Apps Script

1. Buka spreadsheet tujuan dan pilih **Extensions > Apps Script**.
2. Ganti isi project dengan `Code.gs`.
3. Atur Script Property `E_PERJADIN_PIN_HASH` sesuai petunjuk di `README_PERJADIN_TERPADU.md`.
4. Deploy sebagai Web App dengan **Execute as: Me** dan akses sesuai kebijakan internal.
5. Masukkan URL `/exec` dan PIN pada ePerjadin Manager.

Dokumentasi operasional lebih lengkap tersedia di `README_PERJADIN_TERPADU.md` dan `collector-extension/README.md`.
