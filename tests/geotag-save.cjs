const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['isProblemGeotag', 'fallbackGeotagIssues', 'withGeotagNote', 'validateRow'];
const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
assert.equal(functions.length, names.length);
const js = ts.transpileModule(functions.map((node) => node.getText(ast)).join('\n'), {}).outputText;
const context = {};
vm.createContext(context);
vm.runInContext(js, context);
const row = { idKegiatan: 'test', nomorST: 'ST-1', tanggalKegiatan: '27-07-2026', namaPegawai: 'Test',
  tahap: 'Pertanggungjawaban', kodeAkun: 'test', nilaiRiil: 100, statusGeotag: 'Tidak Lengkap',
  keterangan: '', geotagIssues: [], start: '', clockIn: '', clockOut: '', end: '', tujuan: 'Jakarta' };
for (const statusGeotag of ['Tidak Lengkap', 'Tidak Sesuai', 'Sebagian']) {
  const prepared = context.withGeotagNote({ ...row, statusGeotag });
  assert.ok(prepared.keterangan.includes('START'));
  assert.equal(prepared.statusGeotag, statusGeotag);
  assert.ok(context.validateRow(prepared, [{ kode: 'test' }]).every((check) => check.ok));
}
assert.equal(context.withGeotagNote({ ...row, keterangan: 'Catatan manual' }).keterangan, 'Catatan manual');
assert.equal(context.withGeotagNote({ ...row, statusGeotag: 'Lengkap' }).keterangan, '');
assert.equal(row.keterangan, '');
console.log('Geotag save checks passed');
