import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { buildSync } from 'esbuild';
import { synthetic } from './fixtures/synthetic.mjs';

const api = readFileSync(new URL('../Code_ePerjadin_V5_secure.gs', import.meta.url), 'utf8');
const rsa = readFileSync(new URL('../apps-script-build/EperjadinRsa.gs', import.meta.url), 'utf8');
const parser = buildSync({ entryPoints: ['src/v3/intake.ts'], bundle: true, write: false, format: 'cjs', platform: 'node' }).outputFiles[0].text;
const imports = { exports: {} };
vm.runInNewContext(parser, { module: imports, AbortSignal, TextEncoder, fetch: (...args) => globalThis.fetch(...args) });
const { parseSubmission, readCollector, review, post, toISO } = imports.exports;
const clean = (value) => JSON.parse(JSON.stringify(value));
const model = () => clean(parseSubmission(synthetic));
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid: 'fixture', alg: 'RS256', use: 'sig' };
const now = 1_800_000_000;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const audience = 'synthetic-client.apps.googleusercontent.com';
const staff = 'synthetic.staff@gmail.com';
function token(claims = {}, header = {}) {
  const value = b64({ alg: 'RS256', kid: 'fixture', ...header }) + '.' + b64({
    iss: 'https://accounts.google.com', aud: audience, exp: now + 600, sub: '1234567890',
    email_verified: true, email: staff, ...claims,
  });
  return value + '.' + sign('RSA-SHA256', Buffer.from(value), privateKey).toString('base64url');
}

function app() {
  const props = { EPERJADIN_OAUTH_CLIENT_ID: audience, EPERJADIN_ALLOWED_EMAILS: staff, EPERJADIN_SPREADSHEET_ID: 'mock-id' };
  const tables = [], writes = [], fetches = [], cache = new Map();
  let reads = 0, fail = false, locked = false;
  const sandbox = vm.createContext({
    Date: class extends Date { static now() { return now * 1000; } },
    Utilities: {
      getUuid: randomUUID,
      newBlob: (input) => ({ getBytes: () => Buffer.from(input), getDataAsString: () => Buffer.from(input).toString('utf8') }),
      base64DecodeWebSafe: (value) => Buffer.from(value, 'base64url'),
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (alg, input) => createHash(alg).update(input).digest(),
      base64EncodeWebSafe: (bytes) => Buffer.from(bytes).toString('base64url'),
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (v) => ({ setMimeType: () => JSON.parse(v) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => props[key] }) },
    CacheService: { getScriptCache: () => ({ get: (key) => cache.get(key), put: (key, value) => cache.set(key, value) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => { assert.equal(locked, false); locked = true; return true; },
      releaseLock: () => { assert.equal(locked, true); locked = false; } }) },
    UrlFetchApp: { fetch: (url) => {
      fetches.push(url);
      return { getResponseCode: () => 200, getHeaders: () => ({ 'Cache-Control': 'public, max-age=500' }),
        getContentText: () => JSON.stringify({ keys: [publicJwk] }) };
    } },
    SpreadsheetApp: { openById: (id) => {
      assert.equal(id, 'mock-id');
      reads++;
      return { getSheetByName(name) { return tables.find((t) => t.name === name); } };
    } },
    Sheets: { Spreadsheets: { batchUpdate: ({ requests }, id) => {
      assert.equal(id, 'mock-id');
      assert.equal(locked, true);
      if (fail) throw new Error('synthetic private detail should not echo');
      writes.push(clean(requests));
      for (const { appendCells: { sheetId, rows } } of requests) {
        const table = tables[sheetId];
        table.data.push(...rows.map((r) => r.values.map(({ userEnteredValue: v }) => {
          assert.ok(!v?.formulaValue);
          return v?.stringValue ?? v?.numberValue ?? '';
        })));
      }
    } } },
  });
  vm.runInContext(rsa, sandbox, { displayErrors: false });
  vm.runInContext(api, sandbox);
  for (const [name, headers] of Object.entries(clean(vm.runInContext('INTAKE_SHEETS', sandbox)))) {
    const id = tables.length;
    const data = [headers];
    tables.push({ name, data, headers, getSheetId: () => id, getLastColumn: () => headers.length, getLastRow: () => data.length,
      getRange: (row, col, count, width) => ({ getValues: () => data.slice(row - 1, row - 1 + count)
        .map((values) => Array.from({ length: width }, (_, i) => values[col - 1 + i] || '')) }),
      cell: (row, column) => data[row][headers.indexOf(column)],
    });
  }
  return {
    props, tables, writes, fetches, get reads() { return reads; }, breakWrites() { fail = true; },
    get: (action) => clean(sandbox.doGet({ parameter: { action } })),
    post: (action, authIdToken, records) => sandbox.doPost({ postData: {
      type: 'text/plain;charset=UTF-8', contents: JSON.stringify({ action, authIdToken, records }),
    } }),
    rawPost: (e) => sandbox.doPost(e),
  };
}

test('parse input resmi, multirute, beberapa jam per hari, status dan alamat', () => {
  const r = model();
  assert.equal(review(synthetic).issue, '');
  assert.equal(r.totalPengeluaranRiil, 1000000.5);
  assert.deepEqual(r.components.map((x) => x.nomorRute), [1, 1, 1, 2]);
  assert.deepEqual(r.geotags.map((g) => g.hariTanggal), ['2026-07-27', '2026-07-27', '2026-07-29']);
  assert.equal(r.geotags[1].lokasiTagging, 'Alamat Sintetis B');
  assert.equal(r.routes[0].menginap, 'Tidak Terbaca');
  assert.equal(toISO('31 Februari 2026'), '');
  assert.equal(parseSubmission(synthetic.replace('Total Pengeluaran Riil', 'Tidak terbaca')), null);
  assert.equal(parseSubmission(synthetic + '\nSPD-18/000000-2026'), null);
  assert.ok(review(synthetic.replace('Rp1.000.000,50', 'Rp1.000.005,50')).issue);
  assert.equal(model().presensiStatus, 'ada');
  const blank = synthetic.split('Log Data Presensi')[0];
  assert.equal(parseSubmission(blank).presensiStatus, 'belum_terbaca');
  assert.equal(parseSubmission(blank + '\nLog Data Presensi\nTidak ada data presensi').presensiStatus, 'kosong');
  const [draft] = readCollector(JSON.stringify({ records: [{ rawText: synthetic, sourceUrl: 'never sent' }], index: [{ employee: 'never sent' }] }));
  assert.deepEqual(clean(draft.record), r);
});

test('anonymous read, missing/forged/expired/wrong-audience token and forbidden user cannot access Sheets', () => {
  const a = app();
  assert.deepEqual(a.get('getDashboardV4'), { ok: true });
  assert.equal(a.post('submitCollectorJson', '', [model()]).code, 'UNAUTHORIZED');
  const jwt = token();
  const forged = jwt.split('.');
  forged[2] = (forged[2][0] === 'A' ? 'B' : 'A') + forged[2].slice(1);
  for (const invalid of [forged.join('.'), token({ aud: 'different' }), token({ exp: now }), token({}, { alg: 'none' }),
    token({}, { kid: 'unknown' }), token({ iss: 'https://elsewhere.example' }), token({ email_verified: false })]) {
    assert.equal(a.post('verifyConnection', invalid).code, 'UNAUTHORIZED');
  }
  assert.equal(a.post('submitParsedPerjadin', token({ email: 'other@gmail.com' }), [model()]).code, 'FORBIDDEN');
  a.props.EPERJADIN_WORKSPACE_DOMAIN = 'example.test';
  assert.equal(a.post('verifyConnection', token()).code, 'FORBIDDEN');
  delete a.props.EPERJADIN_WORKSPACE_DOMAIN;
  assert.equal(a.post('verifyConnection', token()).ok, true);
  a.props.EPERJADIN_ALLOWED_EMAILS = 'other@gmail.com';
  assert.equal(a.post('verifyConnection', token()).code, 'FORBIDDEN');
  a.props.EPERJADIN_ALLOWED_EMAILS = staff;
  for (const action of ['getDashboardV4', 'listAllSPD', 'getAllComponents', 'uploadDocumentV4', 'deletePerjadinV4', 'updateStatusV4']) {
    assert.equal(a.post(action, token()).code, 'ACTION_DENIED');
  }
  assert.equal(a.reads, 0);
  assert.deepEqual(a.fetches, ['https://www.googleapis.com/oauth2/v3/certs']);
});

test('size, type, query and rate limits; malformed authorized envelope has safe audit', () => {
  const a = app();
  assert.equal(a.rawPost({ postData: { type: 'text/plain', contents: '{}', length: 750001 } }).code, 'SIZE_LIMIT');
  assert.equal(a.rawPost({ postData: { type: 'text/plain', contents: 'é'.repeat(375001) } }).code, 'SIZE_LIMIT');
  assert.equal(a.rawPost({ postData: { type: 'multipart/form-data', contents: '{}' } }).code, 'BAD_REQUEST');
  assert.equal(a.rawPost({ queryString: 'action=verifyConnection', postData: { type: 'text/plain', contents: '{}' } }).code, 'BAD_REQUEST');
  assert.equal(a.post('submitCollectorJson', token(), Array(21).fill('ignore')).code, 'BAD_REQUEST');
  assert.equal(a.tables[4].cell(1, 'Alasan'), 'BAD_REQUEST');
  assert.equal(a.tables[4].cell(1, 'Sub Google'), '1234567890');
  for (let i = 0; i < 9; i++) assert.equal(a.post('verifyConnection', token()).ok, true);
  assert.equal(a.post('verifyConnection', token()).code, 'RATE_LIMIT');
});

test('validates amounts, route and geotag separately, then appends all tables atomically', () => {
  const a = app();
  const r = model();
  r.peserta = '=SYNTHETIC_TEST';
  const mismatch = { ...r, totalPengeluaranRiil: 10 };
  const badPresence = { ...r, geotags: [{ ...r.geotags[0], waktuTagging: '25:00' }] };
  const badRoute = { ...r, jumlahRute: 3 };
  const questionable = { ...r, geotags: [{ ...r.geotags[0], hariTanggal: '2026-07-26' }, { ...r.geotags[1], lokasiTagging: '' }] };
  const value = a.post('submitCollectorJson', token(), [questionable, mismatch, badPresence, badRoute, { ...r, rawText: synthetic }]);
  assert.deepEqual(value.results.map((x) => x.code), ['STORED', 'TOTAL_MISMATCH', 'BAD_PRESENCE', 'BAD_ROUTE', 'BAD_SCHEMA']);
  assert.deepEqual([value.accepted, value.skipped, value.rejected], [1, 0, 4]);
  assert.equal(a.writes.length, 1);
  assert.equal(a.writes[0].length, 5);
  const [summary, components, routes, presence, audit] = a.tables;
  assert.equal(summary.cell(1, 'Pelaksana SPD'), r.peserta);
  assert.equal(summary.cell(1, 'NIP'), r.nip);
  assert.equal(summary.cell(1, 'Total Komponen Dikirim'), 1000000.5);
  assert.equal(summary.cell(1, 'Status Geotag'), 'Perlu Verifikasi Lokasi dan Waktu');
  assert.equal(presence.cell(1, 'Klasifikasi'), 'Tanggal di Luar Rute');
  assert.equal(presence.cell(2, 'Klasifikasi'), 'Alamat Tidak Terbaca');
  assert.equal(components.data.length, 5);
  assert.equal(routes.data.length, 3);
  const minimized = JSON.stringify([value, audit.data]);
  for (const secret of [r.nip, r.nomorSPD, r.peserta, synthetic, 'Alamat Sintetis', '1000000.5', staff, token(), 'mock-id']) {
    assert.ok(!minimized.includes(secret));
  }
});

test('canonical retry and batch duplicates do not duplicate or overwrite historical records', () => {
  const a = app();
  const r = model();
  const clash = { ...r, peserta: 'Sintetis Konflik' };
  assert.deepEqual(a.post('submitCollectorJson', token(), [r, clash]).results.map((x) => x.code), ['CONFLICT', 'CONFLICT']);
  assert.equal(a.tables[0].data.length, 1);
  const reordered = Object.fromEntries(Object.entries(r).reverse());
  assert.deepEqual(a.post('submitCollectorJson', token(), [r, reordered]).results.map((x) => x.code), ['STORED', 'DUPLICATE']);
  assert.equal(a.post('submitParsedPerjadin', token(), [reordered]).results[0].code, 'DUPLICATE');
  assert.equal(a.post('submitParsedPerjadin', token(), [clash]).results[0].code, 'CONFLICT');
  a.tables[0].data[1][a.tables[0].headers.indexOf('Raw Hash')] = 'legacy-raw-hash';
  assert.equal(a.post('submitParsedPerjadin', token(), [r]).results[0].code, 'CONFLICT');
  assert.equal(a.tables[0].cell(1, 'Raw Hash'), 'legacy-raw-hash');
  assert.equal(a.tables[0].data.length, 2);
});

test('sheet failure emits no success or internal details and preserves tables', () => {
  const a = app();
  a.breakWrites();
  const value = a.post('submitParsedPerjadin', token(), [model()]);
  assert.equal(value.ok, false);
  assert.equal(value.code, 'UNAVAILABLE');
  assert.ok(!JSON.stringify(value).includes('private detail'));
  assert.ok(a.tables.every((t) => t.data.length === 1));
});

test('frontend rejects unrecognized endpoints and malformed or legacy acknowledgements', async (t) => {
  const fixtureUrl = 'https://script.google.com/macros/s/synthetic/exec';
  const r = model();
  const requestId = randomUUID();
  const stub = t.mock.method(globalThis, 'fetch', async () => Response.json({ success: true }));
  await assert.rejects(post('submitParsedPerjadin', fixtureUrl + '?foo=bar', 'token', [r]), /UNAUTHORIZED/);
  assert.equal(stub.mock.callCount(), 0);
  await assert.rejects(post('submitParsedPerjadin', fixtureUrl, 'token', [r]), /UNAVAILABLE/);
  stub.mock.mockImplementation(async () => Response.json({
    ok: true, protocol: 1, requestId, accepted: 1, skipped: 0, rejected: 0, results: [{ row: 1, status: 'accepted', code: 'STORED' }],
  }));
  const receipt = await post('submitParsedPerjadin', fixtureUrl, 'token', [r]);
  assert.equal(receipt.requestId, requestId);
  assert.equal(receipt.accepted, 1);
  assert.equal(stub.mock.calls[1].arguments[1].credentials, 'omit');
  assert.equal(stub.mock.calls[1].arguments[1].cache, 'no-store');
});
