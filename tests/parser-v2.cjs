const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
function load(file) {
  const source = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports, require: (name) => load(path.resolve(__dirname, '../src', name.replace(/^@\//, '') + '.ts')) });
  return module.exports;
}
const { parsePerjadinClipboard } = load(path.resolve(__dirname, '../src/utils/parser.ts'));
const { parseTanggalRange } = load(path.resolve(__dirname, '../src/data/sbmData.ts'));
const sample = `Detail Pertanggungjawaban
Nama Kegiatan
Kegiatan uji
Id Kegiatan
uji-v2
Nomor ST
ST-699/KBC.0503/2026
Nomor Kegiatan
-
Pada Perjalanan Dinas ini terdapat 1 Rute
Rute 1
Kantor Pusat DJBC, KOTA JAKARTA SELATAN DKI JAKARTA
27 s.d. 29 Juli 2026 (3 Hari)
Ringkasan
Pelaksana SPD
Pegawai Uji
NIP 000000000000000000
Nomor SPD
SPD-1/636722-2026
Uang Muka
Rp0,00
Total Pengeluaran Riil
Rp3.067.580,00
Presensi Perjalanan Dinas
GEOTAGGING
27-07-2026\t11:20\tAdministrasi Jakarta Timur
Direktorat Jenderal Bea Cukai, Jakarta Timur
14:17\tAdministrasi Jakarta Timur
Jalan Jenderal Ahmad Yani, Jakarta Timur
28-07-2026\t-\t-
--------------
29-07-2026\t10:29\tAdministrasi Jakarta Timur
Jalan Tol Insinyur Wiyoto Wiyono, Jakarta Timur
21:14\tPangkalpinang
Jalan Yos Sudarso, Pangkalpinang
Ringkasan`;
const result = parsePerjadinClipboard(sample);
assert.equal(result.peserta, 'Pegawai Uji');
assert.equal(result.tanggalKegiatan, '27 Juli 2026 s/d 29 Juli 2026');
assert.equal(parseTanggalRange(result.tanggalKegiatan).lamaHari, 3);
assert.equal(result.totalPengeluaranRiil, 3067580);
assert.equal(result.uangMuka, 0);
assert.equal(result.geotags.length, 4);
assert.equal(result.geotags[1].hariTanggal, '27-07-2026');
assert.equal(result.geotags[3].hariTanggal, '29-07-2026');
assert.equal(result.geotags[3].wilayahTagging, 'Pangkalpinang');
assert.equal(result.geotags[0].lokasiTagging, 'Direktorat Jenderal Bea Cukai, Jakarta Timur');
const old = parsePerjadinClipboard(`Detail Pertanggungjawaban
Peserta Kegiatan
Pegawai Lama
Tanggal Kegiatan
27-07-2026 s/d 29-07-2026
Uang Muka
Rp0
Total Pengeluaran Riil
Rp100.000
Geotagging Perjalan Dinas
Sen, 27 Juli 2026\t11.20\tKantor\tKota Jakarta Timur`);
assert.equal(old.peserta, 'Pegawai Lama');
assert.equal(old.totalPengeluaranRiil, 100000);
assert.equal(old.uangMuka, 0);
assert.equal(old.geotags.length, 1);
console.log('Parser V1/V2 regression checks passed');
