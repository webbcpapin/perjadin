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

URL `/exec` hasil deploy dimasukkan ke field URL Apps Script Web App di aplikasi.

## Cara Rekap

- Baris `Persetujuan` dihitung sebagai komitmen akun.
- Jika sudah ada baris `Pertanggungjawaban` untuk ID/ST yang sama, nilai pertanggungjawaban menggantikan komitmen persetujuan agar tidak dobel.
- Status PJ `Belum Lengkap` dan `Lengkap` dihitung sebagai komitmen.
- Status PJ `Disetujui` dihitung sebagai realisasi.
- Primary key upsert: `Tahap Data + ID Kegiatan + Nomor ST + Nama Pegawai/Nomor Kegiatan`.

## Menjalankan Frontend

```bash
npm install
npm run dev
```
