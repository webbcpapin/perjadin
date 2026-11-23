# ePerjadin Automation Pilot V2 (read-only)

## Tujuan
Mengurangi kegiatan copy-paste manual dari SATU Kemenkeu tanpa mengubah proses persetujuan, pembayaran, atau data sumber. Ekstensi hanya berjalan pada tab SATU Kemenkeu yang sudah login dan saat diperintahkan oleh pegawai yang berwenang.

## Status
- Pengumpulan massal dari detail SPD berbasis navigasi UI: **pilot, belum terverifikasi pada UI produksi Satu Kemenkeu**.
- Maksimum 20 SPD per proses dan 5 halaman daftar. Uji dulu dengan 5 SPD.
- Bila detail hanya tersedia melalui full-page reload, collector dapat berhenti sementara, menyimpan data yang sempat berhasil dan dapat dijalankan ulang. Tidak ada bypass login maupun pengambilan via endpoint internal tersembunyi.
- Jika ikon detail tidak dikenali oleh selector aman, item dilewati dan dicatat untuk penyesuaian selector, bukan mencoba tombol lain.
- File JSON mengandung nama, NIP, SPD, nominal dan geotag. Simpan secara terbatas dan hapus setelah selesai.

## Instalasi
1. Download/clone repository **webbcpapin/perjadin**; buka Chrome **chrome://extensions**.
2. Aktifkan Developer mode, lalu **Load unpacked** folder `collector-extension-v2`.
3. Login ke SATU Kemenkeu secara normal. Buka **List Pelaksana SPD** dalam modul Perjadin.
4. Klik ikon **Kolektor ePerjadin V2**. Pilih **5 SPD** lalu **Ambil detail otomatis**.
5. Biarkan tab SATU Kemenkeu terbuka. Setelah proses selesai, buka kembali popup untuk melihat jumlah berhasil dan error.
6. Klik **Unduh JSON**; jangan unggah berkas tersebut ke GitHub atau tempat publik.
7. Buka https://webbcpapin.github.io/perjadin/ > **Impor Batch Pilot V2**, unggah JSON dan periksa komponen serta akun untuk setiap SPD.
8. Untuk **pratinjau tanpa menyimpan**, langkah 1–7 sudah cukup. Untuk menyimpan batch, administrator harus lebih dahulu mengaktifkan backend V5 dan login Google (bagian keamanan di bawah).
9. Setelah login V5 berhasil, centang konfirmasi pemeriksaan lalu **Simpan SPD baru ke Master**. SPD yang sudah ada akan dilewati. Tidak ada pembaruan massal terhadap data existing.
10. Verifikasi hasil pada tab EPERJADIN_V4 dan EPERJADIN_KOMPONEN. Hapus data lokal pada popup kolektor sesudah digunakan.

## Validasi wajib
- ID Kegiatan, Nomor SPD dan nama pelaksana terbaca.
- Ada rincian komponen biaya.
- Jumlah nominal komponen dengan status Dikirim, Disetujui, Dibayar, atau Selesai sama dengan Total Pengeluaran Riil.
- Akun anggaran dipilih operator, bukan ditebak dari nominal.
- SPD eksisting tidak boleh ditimpa oleh pilot.
- Presensi yang belum lengkap tetap ditandai untuk tinjauan, bukan dimodifikasi pada sumber.
- Sampel pilot: Dalam Kota, Luar Kota, multi-komponen, multi-rute jika ada, dan variasi presensi.

## Perbaikan backend V4 (belum otomatis ter-deploy)
File `Code_ePerjadin_V4.gs` pada branch berisi:
- Perhitungan status VALID memakai SUMIFS hanya pada status komponen yang diperhitungkan, bukan seluruh baris termasuk Draft atau Ditolak.
- Catatan manual, status pemantauan dan URL dokumen tetap dipertahankan ketika SPD diperbarui.
- Perbaikan tidak merekonsiliasi 182 data berstatus CEK dengan sendirinya. Jangan mengubah data historis tanpa pencocokan dengan sumber.

## Pengamanan Google OAuth V5 (sebelum digunakan untuk data internal pada produksi)
File `Code_ePerjadin_V5_secure.gs` adalah alternatif backend yang **fail-closed**. Pengguna harus login dengan Google dan backend memeriksa identitas melalui tokeninfo Google. Hanya email yang ada di daftar izin yang diperbolehkan.

Langkah administrator:
1. Buat OAuth 2.0 Client ID tipe Web di Google Cloud dan atur Authorized JavaScript Origins ke `https://webbcpapin.github.io`. Sesuaikan ketentuan dan kebijakan instansi.
2. Di Project Apps Script **baru** yang hanya dikelola petugas berwenang, salin isi `Code_ePerjadin_V5_secure.gs`. Jangan menaruh secret atau daftar pengguna berizin di repository publik.
3. Apps Script > Project Settings > Script Properties: `EPERJADIN_OAUTH_CLIENT_ID` = OAuth Client ID; `EPERJADIN_ALLOWED_EMAILS` = daftar email yang diizinkan, dipisahkan koma.
4. Deploy sebagai Web App: Execute as Me, Who has access Anyone, hanya untuk memungkinkan permintaan lintas origin. Verifikasi token dan daftar izin tetap wajib pada setiap operasi baca/tulis.
5. Di aplikasi ePerjadin, masukkan OAuth Client ID pada panel Login Google (ID klien bersifat publik) dan login dengan akun yang diizinkan.
6. Arahkan URL Apps Script ke deployment V5, lalu uji Dashboard, Impor, Edit Monitoring, dan Upload. Sebelum seluruh uji lolos, jangan menonaktifkan backend lama.
7. Setelah beralih ke V5, nonaktifkan deployment Apps Script V4 yang belum memakai autentikasi jika tidak lagi dipakai.

**Perhatian:** panel Login Google tidak mengamankan endpoint V4 lama. Keamanan baru berlaku setelah backend V5 terdeploy, properti diisi, dan endpoint lama dihentikan. Hindari menyimpan token pengguna di localStorage. Pada V5, GET tidak dapat dipakai membaca data; GET hanya untuk ping.

## Indikator uji
- 5 sampel dikumpulkan tanpa melakukan perubahan Satu Kemenkeu.
- Semua jumlah resmi dan komponen cocok, atau tercatat sebagai masalah untuk tinjauan manusia.
- Tidak ada duplikasi di Google Sheets.
- Setiap kesalahan selector/navigasi berhenti aman dan memberikan pesan jelas.
- Pengguna yang tidak ada di allowlist tidak dapat mengambil data atau mengubah status di V5.
