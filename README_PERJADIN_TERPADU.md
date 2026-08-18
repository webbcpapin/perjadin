# Monitoring Pelaksanaan dan Pertanggungjawaban Perjadin

Aplikasi ini dipakai untuk merekap alur perjadin PPK:

1. Persetujuan perjalanan dinas dari menu Persetujuan.
2. Review pertanggungjawaban dari menu Pertanggungjawaban.
3. Monitoring pelaksanaan dari menu Pelaksanaan, termasuk geotagging dan peserta.
4. Rekap akun DIPA untuk komitmen, realisasi, dan saldo.

## Master Akun

Master akun sudah disesuaikan dengan RKK Satker T.A. 2026 yang dipakai:

| RO | 524111 Luar Kota | 524113 Dalam Kota |
| --- | ---: | ---: |
| 4787.AEF | 3.300.000 | 480.000 |
| 4787.BAE | 5.400.000 | 960.000 |
| 4787.BIG | 36.000.000 | 16.800.000 |
| 4789.BIG | 31.800.000 | 4.800.000 |
| 4695.EBA | 39.419.000 | 3.240.000 |
| 4698.EBD | 1.800.000 | 720.000 |

Kode akun `524111` diperlakukan sebagai luar kota. Kode akun `524113` diperlakukan sebagai dalam kota.

## Google Sheets

Spreadsheet tujuan:

https://docs.google.com/spreadsheets/d/1fkXASbZbnPCZeW2FSxteE-oOnacVuJRCxQ8zWOgPRh8/edit

Tab yang dipakai:

- `DATA_PERJADIN`
- `AKUN_ANGGARAN`

Paste isi `Code.gs` ke Apps Script yang terhubung dengan spreadsheet, lalu deploy sebagai Web App:

- Execute as: Me
- Who has access: Anyone

Sebelum deploy, buat PIN bersama untuk pengguna internal. Jangan simpan PIN mentah di source code. Di Apps Script, ubah nilai `pin` pada fungsi `generatePinHashForSetup`, jalankan fungsi itu, lalu copy hasil hash dari **Execution log**.

Buka **Project Settings > Script Properties** lalu tambahkan:

- Property: `E_PERJADIN_PIN_HASH`
- Value: hasil SHA-256 dari PIN akses

URL `/exec` hasil deploy dimasukkan ke field URL Apps Script Web App di aplikasi.
Masukkan PIN yang sama pada field PIN Akses. Endpoint akan menolak `GET` dan `POST` bila PIN tidak cocok.

## Cara Rekap

- Baris `Persetujuan` dihitung sebagai komitmen akun.
- Jika sudah ada baris `Pertanggungjawaban` untuk ID/ST yang sama, nilai pertanggungjawaban menggantikan komitmen persetujuan agar tidak dobel.
- Status PJ `Belum Lengkap` dan `Lengkap` dihitung sebagai komitmen.
- Status PJ `Disetujui` dihitung sebagai realisasi.
- Primary key upsert: `Tahap Data + ID Kegiatan + Nomor ST + Nama Pegawai/Nomor Kegiatan`, dinormalisasi lowercase, trim, spasi ganda dirapikan, dan diberi hash stabil.

## Perbaikan Operasional

- Login frontend tidak lagi memakai password hardcoded. PIN akses divalidasi oleh Apps Script menggunakan hash di Script Properties.
- Simpan data wajib lolos checklist: ID kegiatan, nomor ST, tanggal, pegawai, akun, nilai, dan catatan bila geotag bermasalah.
- Baris monitoring bisa diedit dan dihapus dari UI, lalu disinkronkan ke Google Sheets.
- Belitung dan Belitung Timur dipisahkan dari daftar Pulau Bangka agar tarif perjalanan tidak salah kategori.

## Sinkronisasi Seluruh Data SATU Kemenkeu

Karena aplikasi berjalan di GitHub Pages, aplikasi tidak dapat membaca sesi login `satu.kemenkeu.go.id` secara langsung. Kolektor Chrome di folder `collector-extension` menjadi jembatan read-only di browser pengguna:

1. Kolektor membaca judul kolom dan isi baris tabel yang sedang aktif.
2. Mode **Rekam semua halaman** kembali ke halaman pertama lalu menekan hanya tombol `Next page` sampai halaman terakhir.
3. Setiap rekaman diberi `sourceRecordKey`, URL sumber, waktu pengambilan, bagian/status, dan teks sumber.
4. JSON hasil kolektor ditempel ke panel **Sinkronisasi SATU Kemenkeu** pada aplikasi.
5. Aplikasi mengirim satu batch ke Apps Script melalui aksi `batchUpsertCollector`.
6. Apps Script melakukan upsert dan mencatat hasilnya pada tab `SINKRONISASI`.

Jalankan kolektor pada seluruh bagian yang tersedia:

- Kegiatan Utama dan Kegiatan Diarsipkan.
- Persetujuan Baru Diusulkan dan Disetujui.
- Pelaksanaan per tahun.
- Pertanggungjawaban Belum Lengkap, Sudah Lengkap, dan Sudah Disetujui.

Kolom sumber yang ditambahkan pada `DATA_PERJADIN`:

- `Jenis Perjadin`
- `Sumber Data`
- `URL Sumber`
- `Waktu Rekam Sumber`
- `Batch Sinkronisasi`
- `Kunci Sumber`

Tab `SINKRONISASI` menyimpan total di pusat, jumlah diterima, jumlah baru, jumlah diperbarui, jumlah dilewati, dan persentase cakupan. Sinkronisasi dianggap lengkap jika jumlah diterima sama dengan total pusat untuk setiap bagian/status yang direkam.

Data daftar merupakan indeks kegiatan. Data nilai, peserta, geotag, dan rincian pertanggungjawaban diperkaya melalui input detail pada aplikasi. Baris detail tidak ditimpa oleh data daftar yang kosong karena proses batch mempertahankan nilai lama ketika nilai baru kosong.

## Menjalankan Frontend

```bash
npm install
npm run dev
```
