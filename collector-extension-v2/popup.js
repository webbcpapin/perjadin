const STORAGE = 'eperjadinV2Pilot';
const $ = (s) => document.querySelector(s);
const title = $('#status-title'), detail = $('#status-detail');
function render(state) {
  const records = state?.records || [], progress = state?.progress || {};
  const errors = state?.errors || [], index = state?.index || [], stats = state?.stats || {};
  title.textContent = progress.state === 'running'
    ? 'Merekam detail SPD...'
    : records.length + ' SPD tersimpan lokal, ' + index.length + ' baris terindeks';
  detail.textContent = [
    progress.error || progress.message || '',
    progress.completed != null ? progress.completed + ' diproses' : '',
    progress.skipped ? progress.skipped + ' dilewati' : '',
    errors.length ? errors.length + ' catatan kendala' : '',
    (stats.new || 0) + ' baru', (stats.changed || 0) + ' berubah', (stats.unchanged || 0) + ' tetap'
  ].filter(Boolean).join(' · ');
  $('#export').disabled = records.length === 0 && index.length === 0;
  $('#copy').disabled = records.length === 0 && index.length === 0;
  $('#csv').disabled = records.length === 0;
}
async function refresh() {
  const d = await chrome.storage.local.get(STORAGE);
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
async function payload() {
  const state = (await chrome.storage.local.get(STORAGE))[STORAGE] || {};
  return {
    schemaVersion: 2, source: 'satu-kemenkeu', collector: 'pilot-v2',
    exportedAt: new Date().toISOString(), records: state.records || [],
    index: state.index || [], stats: state.stats || {}, errors: state.errors || [],
    progress: state.progress || {}
  };
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
$('#export').onclick = async () => {
  const data = await payload();
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    'eperjadin-v21-' + new Date().toISOString().slice(0, 10) + '.json');
};
$('#copy').onclick = async () => {
  await navigator.clipboard.writeText(JSON.stringify(await payload()));
  title.textContent = 'JSON disalin ke clipboard';
};
$('#csv').onclick = async () => {
  const data = await payload();
  const quote = (s) => '"' + String(s ?? '').replace(/"/g, '""') + '"';
  const rows = [['ID Kegiatan', 'Nomor SPD', 'Nama Pegawai', 'Status Perubahan', 'Jumlah Presensi', 'Tgl Ekstraksi'],
    ...data.records.map((r) => [r.idKegiatan, r.nomorSPD, r.namaPegawai, r.changeType, r.presenceRows, r.capturedAt])];
  const csv = '\uFEFF' + rows.map((r) => r.map(quote).join(',')).join('\r\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'eperjadin-ringkasan-v21.csv');
};
$('#clear').onclick = async () => {
  if (!confirm('Hapus seluruh data SPD dan progres kolektor lokal?')) return;
  await chrome.storage.local.remove(STORAGE);
  await refresh();
};
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE]) render(changes[STORAGE].newValue);
});
refresh();
