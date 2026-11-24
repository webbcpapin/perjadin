import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { synthetic } from '../tests/fixtures/synthetic.mjs';

const base = process.env.TEST_APP_URL || 'http://127.0.0.1:4177/perjadin/';
const script = 'https://accounts.google.com/gsi/client';
const backend = 'https://script.google.com/macros/s/synthetic/exec';
const receipt = '00000000-0000-4000-8000-000000000017';
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, serviceWorkers: 'block' });
const requests = [];
const unsafe = [];
let mode = 'forbidden', pending = null;
await context.route('**/*', async (route) => {
  const request = route.request();
  const url = request.url();
  if (new URL(url).origin === new URL(base).origin) return route.continue();
  requests.push(request);
  if (url === script) return route.fulfill({ contentType: 'application/javascript', body: `
    window.google = { accounts: { id: {
      initialize(config) { this.callback = config.callback; },
      renderButton(target) {
        const button = document.createElement('button');
        button.textContent = 'Login Google (simulasi)';
        button.onclick = () => this.callback({credential: 'synthetic.token.fixture'});
        target.appendChild(button);
      }
    } } };` });
  if (url === backend && request.method() === 'POST') {
    const body = request.postDataJSON();
    const result = { ok: true, protocol: 1, requestId: receipt };
    if (body.action === 'verifyConnection' && mode === 'forbidden') Object.assign(result, { ok: false, code: 'FORBIDDEN' });
    else if (body.action !== 'verifyConnection') {
      assert.ok(!request.postData().includes('rawText'));
      assert.ok(!request.postData().includes('sourceUrl'));
      assert.equal(body.records[0].peserta, 'Pegawai Sintetis');
      if (mode === 'wait') await new Promise((resolve) => { pending = resolve; });
      if (mode === 'partial') Object.assign(result, {
        accepted: 1, skipped: 0, rejected: 1,
        results: [{ row: 1, status: 'accepted', code: 'STORED' }, { row: 2, status: 'rejected', code: 'CONFLICT' }],
      });
      else Object.assign(result, {
        accepted: 1, skipped: 0, rejected: 0, results: [{ row: 1, status: 'accepted', code: 'STORED' }],
      });
    }
    return route.fulfill({ json: result, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
  unsafe.push(url);
  return route.abort();
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) errors.push(m.text()); });

async function verifyNoStorage() {
  const snapshot = await page.evaluate(async () => ({
    local: localStorage.length, session: sessionStorage.length, db: (await indexedDB.databases()).length,
    cache: (await caches.keys()).length, cookies: document.cookie,
  }));
  assert.deepEqual(snapshot, { local: 0, session: 0, db: 0, cache: 0, cookies: '' });
}

try {
  await page.goto(base);
  await page.getByRole('heading', { name: 'Input SPD' }).waitFor();
  assert.equal(requests.length, 0);
  assert.equal(await page.getByText(/Pegawai Sintetis|Dashboard|Master/).count(), 0);
  await verifyNoStorage();

  const raw = page.getByLabel('Teks pertanggungjawaban SPD');
  await raw.fill(synthetic);
  await page.getByRole('button', { name: 'Parsing' }).click();
  await page.getByText('Pegawai Sintetis', { exact: true }).waitFor();
  await page.getByText('Rp 1.000.000,50', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Kirim ke Backend' }).isDisabled(), true);
  const snapshot = process.env.SCREENSHOT_DIR;
  if (snapshot) {
    await mkdir(snapshot, { recursive: true });
    await page.screenshot({ path: snapshot + '/pratinjau-sintetis.png' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.setViewportSize({ width: 1280, height: 850 });

  await page.getByLabel('URL Apps Script').fill(backend);
  await page.getByLabel('Google OAuth Client ID').fill('synthetic-client.apps.googleusercontent.com');
  async function connect() {
    await page.getByRole('button', { name: 'Masuk dengan Google' }).click();
    await page.getByRole('button', { name: 'Login Google (simulasi)' }).click();
    await page.getByRole('button', { name: 'Verifikasi akses' }).click();
  }
  await connect();
  await page.getByRole('alert').filter({ hasText: 'tidak terdaftar' }).waitFor();
  assert.equal(await raw.inputValue(), synthetic);
  mode = 'wait';
  await connect();
  await page.getByText('Akses terverifikasi').waitFor();
  await page.getByRole('button', { name: 'Kirim ke Backend' }).click();
  await page.getByRole('button', { name: 'Memproses...' }).waitFor();
  assert.equal(await raw.inputValue(), synthetic);
  assert.equal(await page.getByText('Konfirmasi backend').count(), 0);
  for (let i = 0; i < 50 && !pending; i++) await new Promise((resolve) => setTimeout(resolve, 25));
  assert.ok(pending);
  pending();
  await page.getByText('Konfirmasi backend').waitFor();
  assert.equal(await raw.inputValue(), '');
  assert.equal(await page.getByText('Pegawai Sintetis', { exact: true }).count(), 0);
  if (snapshot) await page.screenshot({ path: snapshot + '/konfirmasi-sintetis.png' });
  await verifyNoStorage();

  mode = 'partial';
  await page.getByRole('button', { name: 'JSON Collector' }).click();
  const file = page.getByLabel('File JSON Collector');
  await file.setInputFiles({
    name: 'sintetis.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
      schemaVersion: 2, records: [{ rawText: synthetic }, { rawText: synthetic.replaceAll('SPD-17/', 'SPD-18/') }],
    })),
  });
  await page.getByText('2 SPD, 2 lolos pemeriksaan awal, 0 perlu tinjau').waitFor();
  await page.getByRole('button', { name: 'Kirim Batch ke Backend' }).click();
  await page.getByText('1 diterima, 0 duplikat dilewati, 1 ditolak').waitFor();
  assert.equal(await file.inputValue(), '');
  await page.getByText('1 SPD, 1 lolos pemeriksaan awal, 0 perlu tinjau').waitFor();
  await verifyNoStorage();
  assert.deepEqual(unsafe, []);
  assert.deepEqual(errors, []);
  console.log('Browser passed: anonymous load, denied access, waiting for ack, input reset, partial batch, no storage, desktop/mobile.');
} finally {
  await context.close();
  await browser.close();
}
