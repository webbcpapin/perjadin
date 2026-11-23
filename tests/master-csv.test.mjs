import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/v3/masterCsv.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { parseMasterCsv } = await import('data:text/javascript;base64,' + Buffer.from(output).toString('base64'));

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
