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

const sample = `Detail Pertanggungjawaban
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
Rute Perjalanan Dinas
Presensi Perjalanan Dinas
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
| 10-09-2026 | 12:44 | Pangkal Pinang | V4XH+VR8, Lontong Pancur, Kecamatan Pangkal Balam, Kota Pangkal Pinang, Kepulauan Bangka Belitung 33172, Indonesia |
| | 14:21 | Bangka Tengah | R4GV+RVC, Beluluk, Kecamatan Pangkalan Baru, Kabupaten Bangka Tengah, Kepulauan Bangka Belitung 33684, Indonesia |
| 11-09-2026 | 11:15 | Bangka Tengah | R4FR+FW6, Beluluk, Kecamatan Pangkalan Baru, Kabupaten Bangka Tengah, Kepulauan Bangka Belitung 33684, Indonesia |
| | 16:45 | Pangkal Pinang | Jl. Bawal No.99, Ampui, Kecamatan Pangkal Balam, Kota Pangkal Pinang, Kepulauan Bangka Belitung 33172, Indonesia |`;

test('parses ePerjadin v3 responsibility detail', () => {
  const result = parseEPerjadinV3(sample);
  assert.ok(result);
  assert.equal(result.idKegiatan, '6aa0c675d1036fcff97c9305');
  assert.equal(result.nomorST, 'ST-872/KBC.0503/2026');
  assert.equal(result.nomorKegiatan, 'KPD-0085/636722-2026');
  assert.equal(result.ppk, 'Agung Hermawan');
  assert.equal(result.dipaInisiator, 'LS');
  assert.equal(result.peserta, 'Rahmat Dihartanto');
  assert.equal(result.nip, '199111232012101001');
  assert.equal(result.nomorSPD, 'SPD-193/636722-2026');
  assert.equal(result.durasiHari, 2);
  assert.equal(result.totalNilaiRiil, 820000);
  assert.equal(result.nilaiSBMAwal, 820000);
  assert.equal(result.totalNilaiSBM, 820000);
  assert.equal(result.totalPengeluaranRiil, 820000);
  assert.equal(result.efisiensi, 100);
  assert.equal(result.statusUangHarian, 'Dikirim');
  assert.equal(result.geotags.length, 4);
  assert.equal(result.geotags[1].hariTanggal, '10-09-2026');
  assert.equal(result.geotags[3].waktuTagging, '16:45');
});
