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
Penugasan Melakukan Pengawasan Muat Barang Ekspor di Luar Kawasan Pabean PT SHLB 01 September 2026
Id Kegiatan
6a94e2272b0a25c0a844fe15
Nomor ST
ST-835/KBC.0503/2026
Nomor Kegiatan
KPD-0062/636722-2026
Pada Perjalanan Dinas ini terdapat 1 Rute
Rute 1
Dermaga TPI, KOTA PANGKALPINANG KEPULAUAN BANGKA BELITUNG
1 September 2026 (1 Hari)
No SPD
SPD-162/636722-2026
No Perjalanan
-
Uang Harian Dalam Kota
Disetujui PPK
Total Nilai Riil
Rp120.000,00
Nilai SBM Awal
Rp160.000,00
Efisiensi
100 %
Durasi Perjalanan
1 Hari
Total Nilai SBM
Rp160.000,00
Ringkasan
Pelaksana SPD
Welly Kristianto
NIP 199312282013101002
Nomor SPD
SPD-162/636722-2026
Uang Muka
Rp0,00
Total Pengeluaran Riil
Rp120.000,00
Log Data Presensi
HARI, TANGGAL\tWAKTU TAGGING\tWILAYAH\tLOKASI GEO TAGGING
GEOTAGGING
01-09-2026\t07:14\tPangkal Pinang\t
Jl. Yos Sudarso No.177, Lontong Pancur, Kecamatan Pangkal Balam, Kota Pangkal Pinang, Kepulauan Bangka Belitung 33115, Indonesia
07:14\tPangkal Pinang\t
Jl. Yos Sudarso No.177, Lontong Pancur, Kecamatan Pangkal Balam, Kota Pangkal Pinang, Kepulauan Bangka Belitung 33115, Indonesia
10:32\tPangkal Pinang\t
W573+8J9, Air Itam, Kecamatan Bukitintan, Kota Pangkal Pinang, Kepulauan Bangka Belitung 33172, Indonesia
17:25\tPangkal Pinang\t
Jl. Yos Sudarso No.133, Lontong Pancur, Kecamatan Pangkal Balam, Kota Pangkal Pinang, Kepulauan Bangka Belitung 33172, Indonesia`;

test('parses Uang Harian Dalam Kota with Disetujui PPK', () => {
  const result = parseEPerjadinV3(sample);
  assert.ok(result);
  assert.equal(result.routes.length, 1);
  assert.equal(result.tanggalKegiatan, '1 September 2026');
  assert.equal(result.components.length, 1);
  assert.equal(result.components[0].nama, 'Uang Harian Dalam Kota');
  assert.equal(result.components[0].status, 'Disetujui');
  assert.equal(result.components[0].nilaiRiil, 120000);
  assert.equal(result.totalPengeluaranRiil, 120000);
  assert.equal(result.statusUangHarian, 'Disetujui');
  assert.equal(result.geotags.length, 4);
  assert.equal(result.geotags[0].waktuTagging, '07:14');
  assert.equal(result.geotags[1].waktuTagging, '07:14');
});
