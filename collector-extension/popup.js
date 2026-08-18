const STORAGE_KEY = 'eperjadinCollectorPayload';

const statusTitle = document.querySelector('#status-title');
const statusDetail = document.querySelector('#status-detail');
const copyButton = document.querySelector('#copy-json');
const downloadButton = document.querySelector('#download-json');

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith('https://satu.kemenkeu.go.id/perjadin/')) {
    throw new Error('Buka halaman SATU Kemenkeu Perjadin terlebih dahulu.');
  }
  return tab;
}

async function loadStored() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  renderPayload(stored[STORAGE_KEY] || null);
}

function mergeDetailPayload(previous, incoming) {
  if (!previous?.section?.startsWith('Detail ') || !incoming?.section?.startsWith('Detail ')) {
    return incoming;
  }

  const recordsByKey = new Map();
  [...(previous.records || []), ...(incoming.records || [])].forEach((record) => {
    const key = record.sourceRecordKey || `${record.idKegiatan}|${record.nomorST}|${record.namaPegawai}`;
    recordsByKey.set(key, { ...(recordsByKey.get(key) || {}), ...record });
  });
  const records = [...recordsByKey.values()];
  return {
    ...incoming,
    section: 'Detail Perjadin',
    totalSourceRows: records.length,
    records,
  };
}

function renderPayload(payload) {
  const count = payload?.records?.length || 0;
  copyButton.disabled = count === 0;
  downloadButton.disabled = count === 0;
  if (!count) {
    statusTitle.textContent = 'Belum ada data';
    statusDetail.textContent = 'Jalankan kolektor pada halaman daftar.';
    return;
  }

  statusTitle.textContent = `${count} rekaman siap diimpor`;
  statusDetail.textContent = `${payload.section || 'Perjadin'} · total pusat ${payload.totalSourceRows || count} · ${new Date(payload.capturedAt).toLocaleString('id-ID')}`;
}

async function capture(command) {
  statusTitle.textContent = command === 'COLLECT_ALL_PAGES'
    ? 'Merekam semua halaman...'
    : command === 'COLLECT_CURRENT_DETAIL'
      ? 'Merekam detail...'
      : 'Merekam halaman...';
  statusDetail.textContent = 'Jangan pindah halaman sampai proses selesai.';
  try {
    const tab = await activeTab();
    const incoming = await chrome.tabs.sendMessage(tab.id, { type: command });
    if (!incoming?.records) throw new Error(incoming?.error || 'Halaman belum siap dibaca.');
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const payload = command === 'COLLECT_CURRENT_DETAIL'
      ? mergeDetailPayload(stored[STORAGE_KEY], incoming)
      : incoming;
    await chrome.storage.local.set({ [STORAGE_KEY]: payload });
    renderPayload(payload);
  } catch (error) {
    statusTitle.textContent = 'Kolektor gagal';
    statusDetail.textContent = error.message || String(error);
  }
}

document.querySelector('#capture-page').addEventListener('click', () => capture('COLLECT_CURRENT_PAGE'));
document.querySelector('#capture-all').addEventListener('click', () => capture('COLLECT_ALL_PAGES'));
document.querySelector('#capture-detail').addEventListener('click', () => capture('COLLECT_CURRENT_DETAIL'));

copyButton.addEventListener('click', async () => {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  await navigator.clipboard.writeText(JSON.stringify(stored[STORAGE_KEY], null, 2));
  statusTitle.textContent = 'JSON disalin';
  statusDetail.textContent = 'Buka ePerjadin Manager lalu pilih “Tempel dari Kolektor”.';
});

downloadButton.addEventListener('click', async () => {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const payload = stored[STORAGE_KEY];
  if (!payload) return;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `eperjadin-${(payload.section || 'data').toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
});

document.querySelector('#clear-data').addEventListener('click', async () => {
  await chrome.storage.local.remove(STORAGE_KEY);
  renderPayload(null);
});

loadStored();
