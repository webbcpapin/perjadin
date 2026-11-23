import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/v3/masterCsv.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { parseMasterCsv, indexMaster, compareWithMaster } = await import('data:text/javascript;base64,' + Buffer.from(output).toString('base64'));

test('Master CSV respects quoted commas, CRLF and Indonesian numeric values', () => {
  const csv = '\uFEFF"Kunci SPD","Total Pengeluaran Riil","Kegiatan","Kode Akun"\r\n'
    + '"id01|spd-1","Rp120.000,00","Rapat, koordinasi","524113"\r\n'
    + '"id02|spd-2","Rp1.060.000,00","Catatan ""perjalanan""\nbaris kedua","524111"\r\n';
  const rows = parseMasterCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]['Kunci SPD'], 'id01|spd-1');
  assert.equal(rows[0]['Kegiatan'], 'Rapat, koordinasi');
  assert.equal(rows[1]['Kegiatan'], 'Catatan "perjalanan"\nbaris kedua');
  assert.equal(rows[1]['Total Pengeluaran Riil'], 'Rp1.060.000,00');
});
test('rejects non-Master or truncated CSV', () => {
  assert.throws(() => parseMasterCsv('Nama,Nilai\nA,100'), /EPERJADIN_V4/);
  assert.throws(() => parseMasterCsv('"Kunci SPD","Total Pengeluaran Riil"\n"abc,100\n'), /tanda petik/);
});

test('matches only comparable fingerprints and does not treat equal totals as identical', () => {
  const current = 'v23:' + 'b'.repeat(64);
  const legacy = 'b'.repeat(64);
  const old = (hash) => [{ 'Total Pengeluaran Riil': 'Rp120.000,00', 'Raw Hash': hash }];
  assert.equal(compareWithMaster([], 120000, current, true).state, 'baru');
  assert.equal(compareWithMaster(old(current), 120000, current, true).state, 'sama');
  assert.equal(compareWithMaster(old(current), 120000, current, false).state, 'perlu-review');
  assert.equal(compareWithMaster(old(legacy), 120000, current, true).state, 'perlu-review');
  assert.equal(compareWithMaster(old(''), 120001, current, true).state, 'berubah');
  assert.equal(compareWithMaster(old('v23:' + 'a'.repeat(64)), 120000, current, true).state, 'berubah');
  assert.equal(compareWithMaster(old(current), null, current, true).state, 'perlu-review');
  const duplicates = indexMaster([{ 'Kunci SPD': 'K|SPD' }, { 'Kunci SPD': 'k|spd' }]);
  assert.equal(compareWithMaster(duplicates.get('k|spd'), 120000, current, true).state, 'perlu-review');
});
