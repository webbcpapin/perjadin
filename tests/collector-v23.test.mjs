import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { parseHTML } from 'linkedom';

const readScript = (name) => readFileSync(new URL('../collector-extension-v2/' + name, import.meta.url), 'utf8');
const coreScript = readScript('collector-core.js');
const collectorScript = readScript('content-script.js');
const coreContext = vm.createContext({ URL });
vm.runInContext(coreScript, coreContext);
const core = coreContext.EPerjadinCollectorCore;
const origin = 'https://satu.kemenkeu.go.id';
const activitiesPath = '/perjadin/pertanggungjawaban';
const rosterPath = activitiesPath + '/ppk-peserta/fixture';
const detailPath = activitiesPath + '/pengeluaran-riil';
const storageKey = 'eperjadinV2Pilot';
const id = 'abcdef01';
const number = 'SPD-55/123456-2026';

function fixture(html) {
  const { document, window } = parseHTML('<html><body>' + html + '</body></html>');
  window.HTMLElement.prototype.getClientRects = function () { return this.closest('[hidden]') ? [] : [{}]; };
  return document;
}

const presenceHeader = '<thead><tr><th>Hari, Tanggal</th><th>Waktu Tagging</th><th>Lokasi Tagging</th><th>Wilayah Tagging</th></tr></thead>';
const presenceTable = (rows) => '<table>' + presenceHeader + '<tbody>' + rows + '</tbody></table>';
const presenceRows = '<tr><td rowspan="2">Sen, 7 Sep 2026</td><td>08:00</td><td>Pelabuhan</td><td>Pangkalpinang</td></tr>'
  + '<tr><td>09.15</td><td>Kantor</td><td>Bangka</td></tr>';

test('presensi reads grouped dates and maps the real source column order', () => {
  const result = core.capturePresence(fixture(presenceTable(presenceRows)).body);
  assert.equal(result.status, 'TERBACA');
  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[1].hariTanggal, 'Sen, 7 Sep 2026');
  assert.equal(result.entries[1].waktuTagging, '09:15');
  assert.equal(result.entries[1].wilayahTagging, 'Bangka');
  assert.equal(result.entries[1].lokasiTagging, 'Kantor');
});

test('presensi distinguishes loading, explicit empty, and malformed or partial rows', () => {
  assert.equal(core.capturePresence(fixture('<mat-progress-spinner></mat-progress-spinner>').body).status, 'MENUNGGU');
  assert.equal(core.capturePresence(fixture(presenceTable('')).body).status, 'MENUNGGU');
  assert.equal(core.capturePresence(fixture(presenceTable('<tr><td colspan="4">Tidak ada data</td></tr>')).body).status, 'TIDAK_ADA_DATA');
  const report = core.capturePresence(fixture(presenceTable(presenceRows + '<tr><td>not a time</td><td>Address</td><td>Area</td></tr>')).body);
  assert.equal(report.status, 'GAGAL_BACA');
  assert.equal(report.entries.length, 2);
});

test('presensi reads semantic grids without td cells', () => {
  const doc = fixture('<div role="table"><div role="row"><span role="columnheader">Hari, Tanggal</span>'
    + '<span role="columnheader">Waktu Tagging</span><span role="columnheader">Wilayah</span><span role="columnheader">Lokasi Geo Tagging</span></div>'
    + '<div role="row"><span role="cell">7-9-2026</span><span role="cell">08:00</span>'
    + '<span role="cell">Bangka</span><span role="cell">Kantor</span></div></div>');
  assert.equal(core.capturePresence(doc.body).entries[0].lokasiTagging, 'Kantor');
});

const activityTable = '<div role="tab" aria-controls="list" aria-selected="true">Sudah Disetujui 1</div>'
  + '<div role="tabpanel" id="list"><table><thead><tr><th>Nama Kegiatan</th><th>Status</th><th>Laporan</th><th>Aksi</th></tr></thead>'
  + '<tbody><tr><td>Uji Kegiatan ID Kegiatan: ' + id + '</td><td>Sudah Disetujui</td><td>Laporan Tersedia</td>'
  + '<td><button id="write" mattooltip="Setujui Seluruh Peserta" type="button"><mat-icon data-mat-icon-name="check"></mat-icon></button>'
  + '<button id="menu" aria-haspopup="true"><mat-icon data-mat-icon-name="more-horizontal"></mat-icon></button></td></tr></tbody></table></div>'
  + '<div role="menu" id="actions" hidden><button id="view" role="menuitem">Lihat Detail</button>'
  + '<button id="send" role="menuitem">Kirim</button></div>';
const rosterTable = '<p>ID Kegiatan: ' + id + ' </p><table><thead><tr><th>Nama Peserta</th><th>Jenis Peserta</th><th>Status</th><th>Aksi</th></tr></thead><tbody>'
  + '<tr><td>Petugas Uji</td><td>Internal Kemenkeu</td><td>Draft</td>'
  + '<td><button id="detail" mattooltip="Lihat Detail Pertanggungjawaban" type="button">Lihat Detail'
  + '<mat-icon data-mat-icon-name="remove_red_eye"></mat-icon></button></td></tr></tbody></table>';
const financial = [
  'Nama Kegiatan', 'Uji Kegiatan', 'ID Kegiatan', id, 'Rute 1', 'Bangka',
  '7 September 2026 (1 Hari)', 'Uang Harian', 'Dikirim', 'Total Nilai Riil', 'Rp200.000,00',
  'Ringkasan', 'Pelaksana SPD', 'Petugas Uji', 'Nomor SPD', number, 'Total Pengeluaran Riil', 'Rp200.000,00',
].join('\n');

test('activity and participant indices contain distinct statuses and controls', () => {
  const doc = fixture(activityTable);
  const [activity] = core.recordsFromList(doc, core.list(doc, activitiesPath));
  assert.equal(activity.item.statusLaporan, 'Laporan Tersedia');
  assert.equal(activity.item.statusKegiatan, 'Sudah Disetujui');
  assert.equal(activity.item.statusSPD, undefined);
  assert.equal(core.detailControl(activity.row, 'kegiatan').element.id, 'menu');
  doc.getElementById('menu').remove();
  assert.equal(core.detailControl(activity.row, 'kegiatan'), null);
  const roster = fixture(rosterTable);
  const [participant] = core.recordsFromList(roster, core.list(roster, rosterPath));
  assert.equal(participant.item.statusSPD, 'Draft');
  assert.equal(participant.item.nomorSPD, '');
});

test('hash ignores trailing chrome and duplicate presensi but changes for financial edits', () => {
  const present = core.capturePresence(fixture(presenceTable(presenceRows)).body);
  const base = core.fingerprintInput(financial, present);
  assert.equal(base, core.fingerprintInput(core.financialScope('09:15\n' + financial + '\nPowered By Kemenkeu\n2026-10-15'),
    { ...present, entries: [...present.entries, present.entries[0]].reverse() }));
  assert.notEqual(base, core.fingerprintInput(financial.replace('200.000', '300.000'), present));
  assert.notEqual(base, core.fingerprintInput(financial, { ...present, entries: present.entries.slice(1) }));
});

function runtime(persisted, initialPath, { reloadAtDetail = false } = {}) {
  const location = { origin, pathname: initialPath };
  const context = vm.createContext({ location, window: {}, URL, crypto: webcrypto, TextEncoder,
    setTimeout: (callback) => setTimeout(callback, 5), Date: class extends Date {
      static now() { return Date.now() * 100; }
    } });
  let handle;
  context.chrome = {
    runtime: { id: 'fixture', onMessage: { addListener(listener) { handle = listener; } } },
    storage: { local: {
      get: async () => ({ [storageKey]: structuredClone(persisted.value) }),
      set: async (data) => { persisted.value = structuredClone(data[storageKey]); },
    } },
  };
  function open(path) {
    location.pathname = path;
    const doc = path === activitiesPath ? fixture(activityTable) : path === rosterPath ? fixture(rosterTable)
      : fixture('<button role="tab" aria-controls="route" aria-selected="true" id="r">Rute Perjalanan Dinas</button>'
        + '<button role="tab" aria-controls="geo" aria-selected="false" id="g">Geotagging Perjalan Dinas</button>'
        + '<section id="route"></section><section id="geo" hidden>' + presenceTable(presenceRows) + '</section>');
    context.document = doc;
    if (path === activitiesPath) {
      doc.getElementById('menu').click = () => doc.getElementById('actions').removeAttribute('hidden');
      doc.getElementById('view').click = () => open(rosterPath);
      for (const id of ['write', 'send']) doc.getElementById(id).click = () => { throw new Error('Write action clicked'); };
    } else if (path === rosterPath) {
      doc.getElementById('detail').click = () => {
        if (reloadAtDetail) throw new Error('Mock document replaced after checkpoint');
        open(detailPath);
      };
    } else {
      Object.defineProperty(doc.body, 'innerText', { value: financial });
      for (const [active, inactive, show, hide] of [['r', 'g', 'route', 'geo'], ['g', 'r', 'geo', 'route']]) {
        doc.getElementById(active).click = () => {
          doc.getElementById(active).setAttribute('aria-selected', 'true');
          doc.getElementById(inactive).setAttribute('aria-selected', 'false');
          doc.getElementById(show).removeAttribute('hidden');
          doc.getElementById(hide).setAttribute('hidden', '');
        };
      }
    }
  }
  context.history = { back: () => open(location.pathname === detailPath ? rosterPath : activitiesPath) };
  open(initialPath);
  vm.runInContext(coreScript, context);
  vm.runInContext(collectorScript, context);
  return (options = {}) => new Promise((resolve) => handle({ type: 'RUN_PILOT_V2', tabId: 7, ...options }, { id: 'fixture' }, resolve));
}

test('two-level pilot resumes from persisted participant on fresh document and skips an existing SPD', async () => {
  const persisted = {};
  const first = runtime(persisted, activitiesPath, { reloadAtDetail: true });
  const interrupted = await first();
  assert.equal(interrupted.ok, false);
  assert.equal(persisted.value.run.participant?.statusSPD, 'Draft', interrupted.reason);
  assert.equal(persisted.value.records.length, 0);
  const afterReload = runtime(persisted, detailPath);
  assert.equal((await afterReload({ resume: true })).ok, true);
  assert.equal(persisted.value.progress.completed, 1);
  assert.equal(persisted.value.records[0].sourceKey, id + '|' + number.toLowerCase());
  assert.equal(persisted.value.records[0].geotags.length, 2);
  assert.equal(persisted.value.index.find((entry) => entry.statusSPD === 'Draft').nomorSPD, number);
  const second = runtime(persisted, activitiesPath);
  assert.equal((await second()).ok, true);
  assert.equal(persisted.value.progress.skipped, 1);
  assert.equal(persisted.value.records.length, 1);
});
