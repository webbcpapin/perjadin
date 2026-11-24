import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const path = (file) => new URL('../collector-extension-v2/' + file, import.meta.url);

test('collector keeps captures in session only and limits access to its source tab', async () => {
  const manifest = JSON.parse(readFileSync(path('manifest.json'), 'utf8'));
  assert.deepEqual(manifest.host_permissions, ['https://satu.kemenkeu.go.id/*']);
  assert.ok(!manifest.externally_connectable);
  let install, listener, forgotten;
  const session = {};
  const key = 'eperjadinV2Pilot';
  vm.runInNewContext(readFileSync(path('background.js'), 'utf8'), { chrome: {
    runtime: { id: 'fixture', onInstalled: { addListener: (fn) => { install = fn; } },
      onMessage: { addListener: (fn) => { listener = fn; } } },
    storage: {
      local: { remove: (oldKey) => { forgotten = oldKey; } },
      session: { get: async (key) => ({ [key]: session[key] }), set: async (values) => Object.assign(session, values) },
    },
  } });
  install();
  assert.equal(forgotten, key);
  const state = { records: [{ rawText: 'synthetic capture' }] };
  const message = { type: 'SET_COLLECTOR_STATE', state };
  const sender = { id: 'fixture', tab: { id: 1 }, url: 'https://satu.kemenkeu.go.id/travel' };
  assert.equal(listener(message, { ...sender, url: 'https://example.test' }, assert.fail), false);
  assert.equal(listener(message, { ...sender, id: 'other' }, assert.fail), false);
  const write = await new Promise((resolve) => listener(message, sender, resolve));
  assert.equal(write.ok, true);
  const read = await new Promise((resolve) => listener({ type: 'GET_COLLECTOR_STATE' }, sender, resolve));
  assert.equal(read.data, state);
  assert.equal(session[key], state);
  const popup = readFileSync(path('popup.js'), 'utf8');
  assert.match(popup, /chrome\.storage\.session\.remove/);
  assert.doesNotMatch(popup, /\bfetch\(|\.storage\.local|clipboard\.write/);
});
