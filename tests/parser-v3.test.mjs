import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import vm from 'node:vm';
import { test } from 'node:test';

const root = path.resolve(process.cwd(), 'src');
const cache = new Map();

function resolveModule(fromFile, name) {
  if (name.startsWith('@/')) return path.join(root, name.slice(2)) + '.ts';
  if (name.startsWith('.')) return path.resolve(path.dirname(fromFile), name) + (path.extname(name) ? '' : '.ts');
  return name;
}

function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const source = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  cache.set(file, module);
  const localRequire = (name) => {
    const resolved = resolveModule(file, name);
    if (resolved === name) throw new Error(`Unsupported dependency in parser test: ${name}`);
    return load(resolved);
  };
  vm.runInNewContext(js, { module, exports: module.exports, require: localRequire, console });
  return module.exports;
}

const { parseEPerjadinV3 } = load(path.join(root, 'v3/parserV3.ts'));

const dailyOnlySample = `Detail Pertanggungjawaban
Nama Kegiatan
Pendampingan Kegiatan Operasi Pasar Hasil Tembakau ke Kab. Bangka Tengah
Id Kegiatan
6aa0c675d1036fcff97c9305
Nomor ST
ST-872/KBC.0503/2026
Lampiran ST
Lampiran.docx.docx
Nomor Kegiatan
KPD-0085/636722-2026
Pada Perjalanan Dinas ini terdapat 1 Rute
DIPA Inisiator (LS)
PPK
Agung Hermawan
Rute 1
Kab. Bangka Tengah, KAB. BANGKA TENGAH KEPULAUAN BANGKA BELITUNG
10 s.d. 11 September 2026 (2 Hari)
No SPD
SPD-193/636722-2026
No Perjalanan
-
Uang Harian
Dikirim
Total Nilai Riil
Rp820.000,00
Nilai SBM Awal
Rp820.000,00
Efisiensi
100 %
Durasi Perjalanan
2 Hari
Total Nilai SBM
Rp820.000,00
Ringkasan
Pelaksana SPD
Rahmat Dihartanto
NIP 199111232012101001
Nomor SPD
SPD-193/636722-2026
Uang Muka
Rp0,00
Total Pengeluaran Riil
Rp820.000,00
Log Data Presensi
| HARI, TANGGAL | WAKTU TAGGING | WILAYAH | LOKASI GEO TAGGING |
| 10-09-2026 | 12:44 | Pangkal Pinang | V4XH+VR8, Lontong Pancur |
| | 14:21 | Bangka Tengah | R4GV+RVC, Beluluk |
| 11-09-2026 | 11:15 | Bangka Tengah | R4FR+FW6, Beluluk |
| | 16:45 | Pangkal Pinang | Jl. Bawal No.99 |`;

const multiComponentSample = `Detail Pertanggungjawaban
Nama Kegiatan
Konsultasi Pengajuan Anggaran Biaya Tambahan untuk Pemeliharaan dan Pengadaan Peralatan Mesin untuk Kebutuhan Kantor Bantu Pelayanan Bea dan Cukai Muntok
Id Kegiatan
6a69f4888857f906cadc5d94
Nomor ST
ST-714/KBC.0503/2026
Lampiran ST
Lampiran.docx.docx
Nomor Kegiatan
-
Pada Perjalanan Dinas ini terdapat 1 Rute
DIPA Inisiator (LS)
PPK
Agung Hermawan
Rute 1
Bagian Keuangan Sekretaris Direktorat Jenderal Bea dan Cukai, KOTA JAKARTA TIMUR DKI JAKARTA
30 s.d. 31 Juli 2026 (2 Hari)
No SPD
SPD-3/636722-2026
No Perjalanan
-
Menginap?
YaTidak
Biaya Tiket Pesawat
Dikirim
Total Nilai Riil
Rp955.180,00
Uang Harian
Dikirim
Total Nilai Riil
Rp1.060.000,00
Uang Penginapan
Dikirim
Total Nilai Riil
Rp438.000,00
Uang Taksi Asal
Draft
Total Nilai Riil
Rp0,00
Uang Taksi Tujuan
Draft
Total Nilai Riil
Rp0,00
Biaya Penginapan Lain
Draft
Total Nilai Riil
Rp0,00
Biaya Transportasi Lain
Draft
Total Nilai Riil
Rp0,00
Ringkasan
Pelaksana SPD
Elfirman Yusuf Sebayang
NIP 198206152002121002
Nomor SPD
SPD-3/636722-2026
Uang Muka
Rp0,00
Total Pengeluaran Riil
Rp2.453.180,00
Log Data Presensi
| HARI, TANGGAL | WAKTU TAGGING | WILAYAH | LOKASI GEO TAGGING |
| 30-07-2026 | 06:53 | Jakarta Timur | QVVG+86C, Pisangan Timur |
| 31-07-2026 | 18:57 | Pandeglang | Jl. Elang No.16, Saruni |`;

test('parses single daily allowance trip using transaction value', () => {
  const result = parseEPerjadinV3(dailyOnlySample);
  assert.ok(result);
  assert.equal(result.schemaVersion, 4);
  assert.equal(result.nomorSPD, 'SPD-193/636722-2026');
  assert.equal(result.totalPengeluaranRiil, 820000);
  assert.equal(result.components.length, 1);
  assert.equal(result.components[0].nama, 'Uang Harian');
  assert.equal(result.components[0].nilaiRiil, 820000);
  assert.equal(result.statusUangHarian, 'Dikirim');
  assert.equal(result.geotags.length, 4);
});

test('parses multiple expense components and reconciles to total expenditure', () => {
  const result = parseEPerjadinV3(multiComponentSample);
  assert.ok(result);
  assert.equal(result.idKegiatan, '6a69f4888857f906cadc5d94');
  assert.equal(result.nomorST, 'ST-714/KBC.0503/2026');
  assert.equal(result.nomorKegiatan, '');
  assert.equal(result.ppk, 'Agung Hermawan');
  assert.equal(result.peserta, 'Elfirman Yusuf Sebayang');
  assert.equal(result.nip, '198206152002121002');
  assert.equal(result.nomorSPD, 'SPD-3/636722-2026');
  assert.equal(result.tanggalMulai, '30 Juli 2026');
  assert.equal(result.tanggalSelesai, '31 Juli 2026');
  assert.equal(result.menginap, 'Tidak Terbaca');
  assert.equal(result.totalPengeluaranRiil, 2453180);
  assert.equal(result.components.length, 7);
  assert.equal(result.components[0].nama, 'Biaya Tiket Pesawat');
  assert.equal(result.components[0].nilaiRiil, 955180);
  assert.equal(result.components[1].nama, 'Uang Harian');
  assert.equal(result.components[1].nilaiRiil, 1060000);
  assert.equal(result.components[2].nama, 'Uang Penginapan');
  assert.equal(result.components[2].nilaiRiil, 438000);
  assert.equal(result.components[3].status, 'Draft');
  const totalSent = result.components.filter((item) => item.status === 'Dikirim').reduce((sum, item) => sum + item.nilaiRiil, 0);
  assert.equal(totalSent, 2453180);
  assert.equal(result.geotags.length, 2);
});
