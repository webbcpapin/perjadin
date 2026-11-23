import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../Code_ePerjadin_V5_secure.gs', import.meta.url), 'utf8');
const post = (body) => ({ postData: { contents: JSON.stringify(body) } });

function backend(properties = {}, claims = {}) {
  let sheetOpens = 0;
  let tokenVerifications = 0;
  const props = { ...properties };
  const context = vm.createContext({
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: (s) => ({ setMimeType: () => JSON.parse(s) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => props[key] }) },
    UrlFetchApp: { fetch: () => {
      tokenVerifications++;
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(claims) };
    } },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
    Utilities: { DigestAlgorithm: { SHA_256: 'SHA_256' }, computeDigest: () => [], base64EncodeWebSafe: () => 'fixture' },
    SpreadsheetApp: { openById: () => {
      sheetOpens++;
      throw new Error('Production access is forbidden in this fixture');
    } },
  });
  vm.runInContext(source, context);
  return { context, calls: () => [sheetOpens, tokenVerifications] };
}

const properties = { EPERJADIN_OAUTH_CLIENT_ID: 'fixture-client', EPERJADIN_ALLOWED_EMAILS: 'allowed@example.test' };
const claims = { aud: 'fixture-client', iss: 'accounts.google.com', email_verified: true,
  email: 'allowed@example.test', exp: Math.floor(Date.now() / 1000) + 1000 };

test('V5 denies GET data, missing config and token, wrong audience, unlisted and expired identities', () => {
  for (const sample of [
    backend(),
    backend(properties, { ...claims, aud: 'other-client' }),
    backend(properties, { ...claims, email: 'other@example.test' }),
    backend(properties, { ...claims, exp: 'invalid' }),
    backend(properties, { ...claims, exp: 1 }),
    backend(properties, { ...claims, email_verified: false }),
  ]) {
    assert.equal(sample.context.doGet({ parameter: { action: 'getDashboardV4' } }).success, false);
    assert.equal(sample.context.doGet({ parameter: { action: 'ping' } }).version, 5);
    assert.equal(sample.context.doPost(post({ action: 'upsertPilotV5', authIdToken: 'synthetic' })).success, false);
    assert.equal(sample.calls()[0], 0);
  }
  const valid = backend(properties, claims);
  assert.match(valid.context.doPost(post({ action: 'getDashboardV4' })).message, /Login Google/);
  assert.match(valid.context.doPost(post({ action: 'upsertPilotV5', authIdToken: 'synthetic' })).message, /Snapshot/);
  assert.match(valid.context.doPost(post({ action: 'getDashboardV4', authIdToken: 'synthetic' })).message, /spreadsheet V5 belum/);
  assert.equal(valid.calls()[0], 0);
});

test('V5 checks official amounts against submitted components across routes', () => {
  const { context } = backend();
  const row = { jumlahRute: 2, routes: [{ nomorRute: 1 }, { nomorRute: 2 }], kodeAkun: 'fixture',
    components: [{ status: 'Dikirim', nilaiRiil: 100 }, { status: 'Disetujui', nilaiRiil: 100 },
      { status: 'Draft', nilaiRiil: 500 }] };
  assert.doesNotThrow(() => context.validatePilotInputV5_({ totalPengeluaranRiil: 200 }, row));
  assert.throws(() => context.validatePilotInputV5_({ totalPengeluaranRiil: 700 }, row), /Total komponen/);
  assert.throws(() => context.validatePilotInputV5_({}, row), /nominal resmi/);
});
