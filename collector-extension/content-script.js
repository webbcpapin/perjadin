(() => {
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const textOf = (element) => clean(element?.textContent);

  function detectSection() {
    const path = location.pathname.toLowerCase();
    const selectedTab = textOf(document.querySelector('[role="tab"][aria-selected="true"]'));
    if (path.includes('pertanggungjawaban')) return { stage: 'Pertanggungjawaban', section: selectedTab || 'Pertanggungjawaban' };
    if (path.includes('persetujuan')) return { stage: 'Persetujuan', section: selectedTab || 'Persetujuan' };
    if (path.includes('pelaksanaan')) return { stage: 'Pelaksanaan', section: selectedTab || 'Pelaksanaan' };
    if (path.includes('monitoring')) return { stage: 'Kegiatan', section: selectedTab || 'Kegiatan' };
    return { stage: 'Kegiatan', section: selectedTab || 'Perjadin' };
  }

  function parsePagerTotal() {
    const candidates = [...document.querySelectorAll('body *')]
      .map(textOf)
      .filter((value) => /^\d+\s*[–-]\s*\d+\s+of\s+\d+$/i.test(value) || /^\d+\s+of\s+\d+$/i.test(value));
    const match = candidates.at(-1)?.match(/of\s+(\d+)/i);
    return Number(match?.[1]) || 0;
  }

  function getTable() {
    const tables = [...document.querySelectorAll('table')];
    return tables.find((table) => table.querySelector('tbody tr')) || null;
  }

  function parseActivityCell(cell) {
    const value = textOf(cell);
    const id = value.match(/Id\s*Kegiatan\s*:\s*([a-z0-9-]+)/i)?.[1] || '';
    const name = clean(value.replace(/Id\s*Kegiatan\s*:\s*[a-z0-9-]+/i, ''));
    return { idKegiatan: id, namaKegiatan: name };
  }

  function parseDates(value) {
    const cleanValue = clean(value);
    const start = cleanValue.match(/MULAI\s*(.+?)(?=SELESAI|$)/i)?.[1] || '';
    const end = cleanValue.match(/SELESAI\s*(.+)$/i)?.[1] || '';
    if (start || end) return { tanggalMulai: clean(start), tanggalSelesai: clean(end), tanggalKegiatan: start === end ? clean(start) : `${clean(start)} s/d ${clean(end)}` };
    return { tanggalMulai: cleanValue, tanggalSelesai: cleanValue, tanggalKegiatan: cleanValue };
  }

  function parseReference(value) {
    const cleanValue = clean(value);
    const nomorST = cleanValue.match(/ST-\d+\/[A-Z0-9.]+\/\d+/i)?.[0] || '';
    const nomorReferensi = cleanValue.match(/(?:Ndid|NKA|KPD)\s*:\s*([^\s]+)/i)?.[1] || '';
    return { nomorST, nomorReferensi };
  }

  function buildKey(record) {
    return [record.stage, record.idKegiatan, record.nomorST, record.namaPegawai || record.nomorReferensi || 'kegiatan']
      .map((value) => clean(value).toLowerCase())
      .join('|');
  }

  function recordFromRow(row, headers, context, capturedAt) {
    const cells = [...row.querySelectorAll('td')];
    if (!cells.length) return null;
    const byHeader = Object.fromEntries(headers.map((header, index) => [header, textOf(cells[index])]));
    const activity = parseActivityCell(cells[0]);
    const dates = parseDates(byHeader['TANGGAL KEGIATAN'] || cells[1]);
    const reference = parseReference(byHeader['NO ST'] || cells[2]);
    const status = byHeader['STATUS'] || byHeader['STATUS KEGIATAN'] || textOf(cells.at(-2));
    const record = {
      stage: context.stage,
      sourceSection: context.section,
      sourceStatus: status,
      ...activity,
      ...dates,
      ...reference,
      jenisPerjadin: byHeader['JENIS PERJADIN'] || '',
      status,
      rawText: textOf(row),
      sourceUrl: location.href,
      capturedAt,
    };
    record.sourceRecordKey = buildKey(record);
    return record;
  }

  function collectCurrentPage() {
    const table = getTable();
    if (!table) throw new Error('Tabel perjadin tidak ditemukan. Buka salah satu halaman daftar.');
    const capturedAt = new Date().toISOString();
    const context = detectSection();
    const headers = [...table.querySelectorAll('thead th')].map((cell) => textOf(cell).toUpperCase());
    const records = [...table.querySelectorAll('tbody tr')]
      .map((row) => recordFromRow(row, headers, context, capturedAt))
      .filter((record) => record?.idKegiatan && record?.namaKegiatan);

    return {
      schemaVersion: 1,
      source: 'satu-kemenkeu',
      capturedAt,
      pageUrl: location.href,
      section: context.section,
      totalSourceRows: parsePagerTotal() || records.length,
      records,
    };
  }

  function valueAfterLabel(lines, label) {
    const pattern = new RegExp(`^${label}\\s*:?(.*)$`, 'i');
    for (let index = 0; index < lines.length; index++) {
      const match = lines[index].match(pattern);
      if (!match) continue;
      if (clean(match[1])) return clean(match[1]);
      return clean(lines[index + 1]);
    }
    return '';
  }

  function rupiahAfterLabel(lines, label) {
    const start = lines.findIndex((line) => new RegExp(`^${label}`, 'i').test(line));
    if (start < 0) return 0;
    for (let index = start; index <= Math.min(lines.length - 1, start + 4); index++) {
      const match = lines[index].match(/Rp\s*([\d.,]+)/i);
      if (match) return Number(match[1].replace(/[.,]/g, '')) || 0;
    }
    return 0;
  }

  function collectCurrentDetail() {
    const rawText = clean(document.body.innerText);
    if (!/detail\s+(?:perjalanan dinas|pertanggungjawaban|pelaksanaan)|ringkasan dipa/i.test(rawText)) {
      throw new Error('Detail perjadin belum terbuka. Buka detail transaksi lalu jalankan lagi.');
    }

    const lines = document.body.innerText.split(/\r?\n/).map(clean).filter(Boolean);
    const lower = rawText.toLowerCase();
    const stage = lower.includes('detail pertanggungjawaban') || lower.includes('total pengeluaran riil')
      ? 'Pertanggungjawaban'
      : lower.includes('ringkasan dipa')
        ? 'Persetujuan'
        : 'Pelaksanaan';
    const capturedAt = new Date().toISOString();
    const idKegiatan = valueAfterLabel(lines, 'Id Kegiatan') || rawText.match(/Id\s*Kegiatan\s*:\s*([a-z0-9-]+)/i)?.[1] || '';
    const namaKegiatan = valueAfterLabel(lines, 'Nama Kegiatan');
    const nomorST = valueAfterLabel(lines, 'Nomor ST') || rawText.match(/ST-\d+\/[A-Z0-9.]+\/\d+/i)?.[0] || '';
    const namaPegawai = valueAfterLabel(lines, 'Peserta Kegiatan');
    const record = {
      stage,
      sourceSection: `Detail ${stage}`,
      idKegiatan,
      namaKegiatan,
      nomorST,
      nomorKegiatan: valueAfterLabel(lines, 'Nomor Kegiatan'),
      nka: rawText.match(/NKA-\d+\/\d+-\d+/i)?.[0] || '',
      tanggalKegiatan: valueAfterLabel(lines, 'Tanggal Kegiatan'),
      tujuan: valueAfterLabel(lines, 'Tujuan Kegiatan'),
      kotaTujuan: valueAfterLabel(lines, 'Kota Tujuan'),
      output: valueAfterLabel(lines, 'Output'),
      jenisPembayaran: valueAfterLabel(lines, 'Jenis Pembayaran'),
      namaPegawai,
      uangMuka: rupiahAfterLabel(lines, 'Uang Muka'),
      totalUangMuka: rupiahAfterLabel(lines, 'Total Uang Muka'),
      totalEstimasiBiaya: rupiahAfterLabel(lines, 'Total Estimasi Biaya'),
      totalPengeluaranRiil: rupiahAfterLabel(lines, 'Total Pengeluaran Riil'),
      kurangLebihBayar: rupiahAfterLabel(lines, 'Total Kurang Bayar'),
      kodeAkun: rawText.match(/636722\.015\.52411[13]\.01505(?:CC|WA)\.\d{4}[A-Z]{3}\.A000000001\.00000\.2\.3051\.2\.000000\.000000/i)?.[0] || '',
      status: valueAfterLabel(lines, 'Status'),
      rawText,
      sourceUrl: location.href,
      capturedAt,
      recordType: 'detail',
    };
    record.sourceRecordKey = buildKey(record);
    return {
      schemaVersion: 1,
      source: 'satu-kemenkeu',
      capturedAt,
      pageUrl: location.href,
      section: `Detail ${stage}`,
      totalSourceRows: 1,
      records: [record],
    };
  }

  const signature = () => [...(getTable()?.querySelectorAll('tbody tr') || [])].slice(0, 2).map(textOf).join('|');

  async function waitForPageChange(previousSignature) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (signature() && signature() !== previousSignature) return;
    }
    throw new Error('Halaman berikutnya tidak selesai dimuat.');
  }

  async function collectAllPages() {
    const firstPageButton = document.querySelector('button[aria-label="First page"]');
    if (firstPageButton && !firstPageButton.disabled) {
      const before = signature();
      firstPageButton.click();
      await waitForPageChange(before);
    }

    const byKey = new Map();
    let basePayload = null;
    for (let page = 0; page < 1000; page++) {
      const payload = collectCurrentPage();
      basePayload ||= payload;
      payload.records.forEach((record) => byKey.set(record.sourceRecordKey, record));

      const nextButton = document.querySelector('button[aria-label="Next page"]');
      if (!nextButton || nextButton.disabled) break;
      const before = signature();
      nextButton.click();
      await waitForPageChange(before);
    }

    return { ...basePayload, capturedAt: new Date().toISOString(), records: [...byKey.values()] };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!['COLLECT_CURRENT_PAGE', 'COLLECT_ALL_PAGES', 'COLLECT_CURRENT_DETAIL'].includes(message?.type)) return false;
    const task = message.type === 'COLLECT_ALL_PAGES'
      ? collectAllPages()
      : message.type === 'COLLECT_CURRENT_DETAIL'
        ? collectCurrentDetail()
        : collectCurrentPage();
    Promise.resolve(task)
      .then(sendResponse)
      .catch((error) => sendResponse({ error: error.message || String(error) }));
    return true;
  });
})();
