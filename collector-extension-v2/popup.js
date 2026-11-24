const STORAGE = 'eperjadinV2Pilot';
const $ = (s) => document.querySelector(s);
const title = $('#status-title'), detail = $('#status-detail');
const BATCH_BYTES = 750000;
function batchesOf(records) {
  const batches = [];
  let batch = [], bytes = 100;
  const encoder = new TextEncoder();
  for (const row of records) {
    const record = { rawText: row.rawText };
    const size = encoder.encode(JSON.stringify(record)).length + 1;
    if (batch.length && (batch.length === 20 || bytes + size > BATCH_BYTES)) {
      batches.push(batch);
      batch = [];
      bytes = 100;
    }
    batch.push(record);
    bytes += size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
function render(state) {
  const records = state?.records || [], progress = state?.progress || {};
  const errors = state?.errors || [], index = state?.index || [], stats = state?.stats || {};
  title.textContent = progress.state === 'running'
    ? 'Merekam detail SPD...'
    : records.length + ' SPD detail, ' + index.length + ' entri daftar lokal';
  detail.textContent = [
    progress.error || progress.message || '',
    progress.completed != null ? progress.completed + ' diproses' : '',
    progress.skipped ? progress.skipped + ' dilewati' : '',
    errors.length ? errors.length + ' catatan kendala' : '',
    (stats.new || 0) + ' baru', (stats.changed || 0) + ' berubah', (stats.unchanged || 0) + ' tetap'
  ].filter(Boolean).join(' · ');
  const batches = batchesOf(records);
  const select = $('#batch');
  const current = Number(select.value);
  select.replaceChildren(...batches.map((batch, i) => new Option('Batch ' + (i + 1) + ' (' + batch.length + ' SPD)', i)));
  select.value = String(Math.min(current, batches.length - 1));
  select.disabled = !batches.length;
  $('#export').disabled = !batches.length;
  $('#clear').disabled = ['running', 'indexing'].includes(progress.state);
}
async function refresh() {
  const d = await chrome.storage.session.get(STORAGE);
  render(d[STORAGE] || null);
}
async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith('https://satu.kemenkeu.go.id/')) {
    throw new Error('Buka halaman Perjadin di Satu Kemenkeu yang sudah login.');
  }
  return tab;
}
async function runCommand(type, payload = {}) {
  title.textContent = 'Proses dimulai...';
  try {
    const tab = await activeTab();
    const result = await chrome.tabs.sendMessage(tab.id, { type, ...payload });
    await refresh();
    if (result?.ok === false) {
      title.textContent = 'Perlu pemeriksaan';
      detail.textContent = result.reason || 'Ekstraksi dihentikan dengan aman.';
    }
  } catch (error) {
    title.textContent = 'Tidak dapat melanjutkan';
    detail.textContent = error.message || String(error);
  }
}
$('#start').onclick = () => runCommand('RUN_PILOT_V2', {
  limit: Number($('#limit').value), maxPages: 5, refreshExisting: false
});
$('#refresh-existing').onclick = () => runCommand('RUN_PILOT_V2', {
  limit: Number($('#limit').value), maxPages: 5, refreshExisting: true
});
$('#stop').onclick = () => runCommand('STOP_PILOT_V2');
$('#single').onclick = () => runCommand('CAPTURE_DETAIL_V2');
$('#index-page').onclick = () => runCommand('CAPTURE_INDEX_V2');
$('#index-all').onclick = () => runCommand('CAPTURE_INDEX_ALL_V2');
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
$('#export').onclick = async () => {
  const i = Number($('#batch').value);
  const state = (await chrome.storage.session.get(STORAGE))[STORAGE] || {};
  const records = batchesOf(state.records || [])[i];
  if (!records) return;
  const blob = new Blob([JSON.stringify({ schemaVersion: 2, records })], { type: 'application/json' });
  if (blob.size > BATCH_BYTES) {
    title.textContent = 'Batch melebihi 750 KB. Gunakan copy-paste SPD yang diperlukan.';
    return;
  }
  downloadBlob(blob, 'eperjadin-' + new Date().toISOString().slice(0, 10) + '-batch-' + (i + 1) + '.json');
};
$('#clear').onclick = async () => {
  if (!confirm('Hapus seluruh data SPD dan progres kolektor lokal?')) return;
  await chrome.storage.session.remove(STORAGE);
  await refresh();
};
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes[STORAGE]) render(changes[STORAGE].newValue);
});
refresh();
