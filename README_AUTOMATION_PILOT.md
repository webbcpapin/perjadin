# Kolektor ePerjadin V2.3

## Pilot baca di SATU Kemenkeu

1. Muat folder `collector-extension-v2` melalui **Load unpacked** di Chrome sesuai kebijakan instansi.
2. Login melalui SSO. Pilih peran PPK yang sudah tersedia dan buka **Pertanggungjawaban**. Pilih satu tab kegiatan. Pilot juga bisa dimulai dari **List Pelaksana SPD** satu kegiatan.
3. Pilih batas 5 SPD dan klik **Ambil Detail SPD**. Kolektor mencatat indeks kegiatan dan pelaksana, membuka detail, lalu membaca tampilan Rute dan Presensi. Gunakan **Lanjutkan** pada tab asal setelah mencapai batas, memuat ulang halaman, atau memperbaiki navigasi. Jika kontrol baca tidak dikenali, buka halaman yang diminta secara manual sebelum melanjutkan.
4. Tinjau jumlah berhasil, dilewati, dan gagal di popup. Untuk membaca ulang detail yang sudah tersimpan, jalankan **Periksa ulang SPD lama** setelah batch selesai. Jika status SPD pada daftar berubah, pengambilan biasa akan memeriksa ulang detailnya.
5. Unduh JSON gabungan dan buka **Impor Batch Pilot V2** di ePerjadin Workspace. Data indeks bisa ditinjau terpisah dari detail transaksi. Simpan berkas secara terbatas dan hapus data lokal kolektor setelah selesai.

Navigasi yang diperiksa pada UI PPK menggunakan menu ikon **more-horizontal** lalu **Lihat Detail**, atau ikon mata dengan keterangan **Jumlah Peserta**. Halaman pelaksana memakai rute `ppk-peserta` dan tombol **Lihat Detail** dengan tooltip **Lihat Detail Pertanggungjawaban**. Halaman detail menampilkan tab **Rute Perjalanan Dinas** serta **Geotagging Perjalan Dinas**. Pengujian UI tersebut dilakukan secara manual. Otomasi lengkap dengan beberapa kegiatan, peserta Draft tanpa detail, pagination, dan variasi struktur yang berbeda tetap perlu dipilotkan pada sesi PPK.

Kolektor hanya membaca DOM yang terlihat dan menavigasi kontrol baca. Jika tabel, identitas, atau kontrol ambigu, batch dijeda. JSON dan checkpoint tetap lokal. Ekspor bisa memuat data pegawai, nominal, dan alamat geotag. Gunakan data sintetis untuk bug report, fixture, tangkapan layar, dan PR publik.

## Pemeriksaan hasil

- Status kegiatan berasal dari daftar kegiatan, dan status laporan dari kolom laporan yang terlihat. Status persetujuan SPD, termasuk Draft, berasal dari daftar pelaksana.
- Identitas detail adalah pasangan **ID Kegiatan + Nomor SPD**. Jika daftar pelaksana belum menampilkan nomor SPD, kolektor memverifikasi pelaksana lalu mengaitkan nomor setelah detail dibaca.
- **TERBACA** menandai baris presensi yang dapat diekstrak. **TIDAK_ADA_DATA** membutuhkan tanda kosong yang ditampilkan sumber. **GAGAL_BACA** menandai struktur tak terbaca, data belum termuat, atau pembacaan parsial. Ambil ulang kasus gagal baca sebelum memperbarui presensi lama.
- Periksa tempat, tanggal, dan urutan titik geotag terhadap rute. Titik yang sama tidak memenuhi dua tahapan. SPD multirute ditandai **Perlu Verifikasi** hingga aturan presensi tiap rute diketahui. Pemeriksaan keuangan tetap terpisah.
- Cocokkan total resmi dengan jumlah komponen berstatus Dikirim, Disetujui, Disetujui PPK, Dibayar, atau Selesai dari seluruh rute. Draft dan komponen ditolak dikecualikan. Jika rute, nominal komponen, atau total resmi belum terbaca, impor ditahan. Akun harus ditinjau operator.

## Perbandingan Master

Ekspor tab `EPERJADIN_V4` sebagai CSV, pilih file di panel impor, lalu klik **Bandingkan dengan Master**. CSV diproses di browser dan tersedia tanpa login. Kosongkan pilihan CSV untuk membandingkan dengan backend V5 setelah login.

| Hasil | Bukti |
| --- | --- |
| Baru | Kunci SPD belum ditemukan dalam snapshot Master yang dipilih. |
| Berubah | Total resmi berbeda atau hash versi V2.3 yang setara berbeda. |
| Sama | Total resmi dan hash V2.3 cocok dari rekaman lengkap. |
| Perlu review | Detail tidak lengkap, hash lama tidak setara, kunci ganda, atau total saja yang cocok. |

Penyimpanan batch memerlukan perbandingan langsung V5. Centang konfirmasi pada setiap SPD lama yang akan diperbarui. Backend memeriksa ulang apakah kunci sudah ada dan apakah hash lama masih sama di dalam kunci tulis. SPD lama tanpa hash pembanding ditahan untuk pemeriksaan.

## Aktivasi administrator V5

1. Buat spreadsheet uji terpisah dan folder dokumen terbatas yang dikelola instansi. Buat proyek Apps Script khusus pilot dengan isi `Code_ePerjadin_V5_secure.gs`.
2. Buat Google OAuth Client ID tipe Web untuk origin aplikasi yang disetujui, misalnya `https://webbcpapin.github.io`. Di **Script Properties**, atur `EPERJADIN_OAUTH_CLIENT_ID`, `EPERJADIN_ALLOWED_EMAILS` (daftar email dipisah dengan koma), dan `EPERJADIN_SPREADSHEET_ID` (ID spreadsheet uji). Tambahkan `EPERJADIN_DRIVE_FOLDER_ID` hanya untuk uji unggah. Simpan konfigurasi di Apps Script.
3. Pada spreadsheet uji, jalankan `setupEperjadinV4` secara manual dari editor untuk membuat tab. Sebelum menggunakan salinan data lama, cocokkan urutan header dengan skema V5. Jangan jalankan setup terhadap Master produksi selama pilot.
4. Deploy sebagai Web App **Execute as Me**. Jika kebijakan instansi mengizinkan akses deployment **Anyone** untuk akses lintas origin, identitas operasi tetap divalidasi oleh backend melalui Google ID token dan allowlist. Endpoint GET hanya menyediakan ping.
5. Masukkan URL deployment V5 dan Client ID pada Workspace. Uji bahwa akun tanpa izin ditolak. Dari akun yang diizinkan, uji baca, perbandingan, simpan SPD sintetis, konflik pembaruan, dan unggah berkas sintetis di lingkungan uji.
6. Penempatan ke produksi dan penghentian deployment V4 lama memerlukan peninjauan administrator tersendiri. Backend V5 melindungi deployment V5. Endpoint V4 lama yang masih aktif perlu ditangani pada saat migrasi.

## Verifikasi lokal

`npm test` menjalankan fixture DOM sintetis dan mock Apps Script. `npm run build` memverifikasi Workspace. PR menjalankan tes dan build tanpa deployment GitHub Pages. Sebelum pilot lebih luas, verifikasi batas 5 SPD pada beberapa kegiatan, tangani kasus tab kosong dan reload, lalu cocokkan nominal dan presensi hasil ekstraksi dengan tampilan SATU.
