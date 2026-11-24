/* ePerjadin Collector V2.1: local/read-only capture, no hidden API, no writes to source. */
(() => {
  if (window.__eperjadinCollectorV21) return;
  window.__eperjadinCollectorV21 = true;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clean = (s) => String(s ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const textOf = (el) => clean(el?.innerText || el?.textContent || '');
  const dateRe = /^\d{2}-\d{2}-\d{4}$/;
  const timeRe = /^\d{1,2}[:.]\d{2}$/;
  const forbidden = /(setujui|tolak|hapus|batalkan|bayar|kirim|proses|approve|delete|reject)/i;
  let running = false;
  let stopRequested = false;

  function isPerjadin() {
    return location.hostname === 'satu.kemenkeu.go.id'
      && (/perjadin/i.test(location.pathname) || /perjadin nasional/i.test(document.body.innerText.slice(0, 800)));
  }

  function getListTable() {
    return [...document.querySelectorAll('table')].find((t) => {
      const headers = textOf(t.querySelector('thead')).toLowerCase();
      return t.querySelector('tbody tr') && (/(kegiatan|pelaksana|spd|nomor st)/.test(headers) || /id kegiatan/i.test(t.innerText.slice(0, 600)));
    }) || null;
  }
  function listRows() {
    return [...(getListTable()?.querySelectorAll('tbody tr') || [])].filter((r) => textOf(r));
  }
  function listSignature() {
    return listRows().slice(0, 3).map(textOf).join('|').slice(0, 2400);
  }
  function listKey(row) {
    const raw = textOf(row);
    const id = raw.match(/Id\s*Kegiatan\s*:\s*([a-z0-9-]+)/i)?.[1] || '';
    const spd = raw.match(/SPD-\d+\/\d+-\d+/i)?.[0] || '';
    const st = raw.match(/ST-\d+\/[A-Z0-9.]+\/\d+/i)?.[0] || '';
    return [id, spd, st, raw.slice(0, 250)].join('|').toLowerCase();
  }
  function detailControl(row) {
    const controls = [...row.querySelectorAll('a,button,[role="button"]')];
    return controls.find((el) => {
      const label = clean([textOf(el), el.getAttribute('aria-label'), el.getAttribute('title')].filter(Boolean).join(' '));
      const href = el.getAttribute('href') || '';
      return !forbidden.test(label)
        && (/^(detail|lihat detail|lihat|rincian|detail pertanggungjawaban|detail perjalanan)$/i.test(label)
          || /\/(?:detail|rincian)(?:\/|$|\?)/i.test(href));
    }) || null;
  }
  function selectTab(regex) {
    const candidates = [...document.querySelectorAll('button,a,[role="tab"],[role="button"],span,li,div')];
    const matches = candidates.filter((el) => {
      if (el.getClientRects().length === 0) return false;
      if (!regex.test(textOf(el))) return false;
      return ![...el.children].some((child) => regex.test(textOf(child)));
    });
    return matches.find((e) => e.matches('button,a,[role="tab"]'))
      || matches.find((e) => e.matches('span,li')) || matches[0] || null;
  }
  async function waitUntil(predicate, label, timeout = 12000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (predicate()) return true;
      await sleep(250);
    }
    throw new Error('Halaman tidak selesai dimuat: ' + label + '. Coba lanjutkan dari progres terakhir.');
  }
  function isDetail() {
    const body = document.body.innerText || '';
    return /Detail Pertanggungjawaban/i.test(body) && /(?:Nomor SPD|No SPD)/i.test(body);
  }
  function scopedDetailText() {
    const body = String(document.body.innerText || '').replace(/\r/g, '');
    const start = body.search(/(?:^|\n)\s*Nama Kegiatan\s*(?:\n|$)/i);
    return start >= 0 ? body.slice(start) : body;
  }
  async function switchTab(regex, needed, label) {
    const tab = selectTab(regex);
    if (!tab) return false;
    tab.click();
    await waitUntil(() => needed.test(document.body.innerText || ''), label, 9000);
    await sleep(250);
    return true;
  }

  function captureGeotagTable() {
    const table = [...document.querySelectorAll('table')].find((t) => {
      const header = textOf(t.querySelector('thead') || t).toLowerCase();
      return /waktu tagging/i.test(header) && /(geo tagging|lokasi geo)/i.test(header);
    });
    if (!table) return { markdown: '', entries: [], status: 'GAGAL_BACA',
      warning: 'Tabel presensi tidak ditemukan pada tampilan saat ini.' };
    let currentDate = '';
    const entries = [];
    let rowsWithTimes = 0;
    // On the official site an empty date cell can be rendered as either an
    // empty <td> or an omitted column. Find the time column by its content.
    const rows = [...table.querySelectorAll('tbody tr')];
    for (const row of rows) {
      const cells = [...row.querySelectorAll(':scope > td')].map(textOf);
      if (!cells.length) continue;
      const date = cells.find((cell) => dateRe.test(cell));
      if (date) currentDate = date;
      const timeIndex = cells.findIndex((cell) => timeRe.test(cell));
      if (timeIndex < 0) continue;
      rowsWithTimes++;
      const time = cells[timeIndex].replace('.', ':');
      const wilayah = clean(cells[timeIndex + 1] || '');
      const lokasi = clean(cells.slice(timeIndex + 2).join(' ').replace(/Lihat Di Map/gi, ''));
      if (!currentDate || !wilayah) continue;
      entries.push({ hariTanggal: currentDate, waktuTagging: time,
        wilayahTagging: wilayah, lokasiTagging: lokasi });
    }
    const markdown = [
      'Log Data Presensi',
      '| HARI, TANGGAL | WAKTU TAGGING | WILAYAH | LOKASI GEO TAGGING |',
      '| --- | --- | --- | --- |',
      ...entries.map((e) => '| ' +
        [e.hariTanggal, e.waktuTagging, e.wilayahTagging, e.lokasiTagging]
          .map((v) => String(v).replace(/[|\n\r]/g, ' ')).join(' | ') + ' |'),
    ].join('\n');
    if (entries.length) return { markdown, entries, status: 'TERBACA', warning: '' };
    if (!rowsWithTimes) {
      // Not an extraction error. The source currently displays no geotag rows.
      return { markdown: markdown + '\nTidak ada data presensi', entries, status: 'TIDAK_ADA_DATA', warning: '' };
    }
    return { markdown, entries, status: 'GAGAL_BACA',
      warning: 'Ada waktu tagging tetapi tanggal atau wilayah belum dapat diparsing.' };
  }

  function normalizeFinancial(body) {
    const text = String(body || '').replace(/\r/g, '');
    // Ignore clock/nav outside the detail area to make comparisons stable.
    const start = text.search(/(?:^|\n)\s*Nama Kegiatan\s*(?:\n|$)/i);
    const scoped = start >= 0 ? text.slice(start) : text;
    return scoped.replace(/\n[ \t]*\n{2,}/g, '\n\n').trim();
  }
  async function hashText(raw) {
    const bytes = new TextEncoder().encode(raw.replace(/\s+/g, ' ').trim());
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  async function captureDetail(sourceKey = '') {
    if (!isPerjadin() || !isDetail()) throw new Error('Buka Detail Pertanggungjawaban SPD terlebih dahulu.');
    const initialPresensi = !!selectTab(/^Presensi Perjalanan Dinas$/i)
      && /Log Data Presensi/i.test(document.body.innerText || '');
    const warnings = [];
    // Route screen contains all cost components and route information. Capture it first,
    // even when the user opened the record on the Presensi tab.
    const routeFound = await switchTab(/^Rute Perjalanan Dinas$/i,
      /(Rute\s+1|Uang Harian|Biaya Tiket Pesawat|Uang Penginapan)/i, 'Rute Perjalanan Dinas')
      .catch((error) => { warnings.push(error.message); return false; });
    if (!routeFound) warnings.push('Tab Rute belum bisa dibaca; komponen harus diverifikasi manual.');
    const financial = normalizeFinancial(scopedDetailText());

    let presence = { markdown: '', entries: [], warning: '', status: 'BELUM_DIPERIKSA' };
    const switched = await switchTab(/^Presensi Perjalanan Dinas$/i,
      /(Log Data Presensi|GEOTAGGING|WAKTU TAGGING)/i, 'Presensi Perjalanan Dinas')
      .catch((error) => { warnings.push(error.message); return false; });
    if (switched) {
      presence = captureGeotagTable();
      if (presence.warning) warnings.push(presence.warning);
    } else warnings.push('Tab Presensi belum dapat dibaca.');

    // Keep the user's selected tab if possible.
    if (!initialPresensi) {
      try { await switchTab(/^Rute Perjalanan Dinas$/i, /(Rute\s+1|Uang Harian|Biaya Tiket)/i, 'Rute Perjalanan Dinas'); }
      catch (_) { /* read-only best effort */ }
    }

    const rawText = financial + (presence.markdown ? '\n\n' + presence.markdown : '');
    const idKegiatan = rawText.match(/Id Kegiatan\s*\n\s*([a-z0-9]{12,})/i)?.[1] || '';
    const nomorSPD = rawText.match(/SPD-\d+\/\d+-\d+/i)?.[0] || '';
    const namaPegawai = rawText.match(/Pelaksana SPD\s*\n\s*([^\n]+)/i)?.[1]?.trim() || '';
    if (!idKegiatan || !nomorSPD) {
      warnings.push('ID Kegiatan atau Nomor SPD belum terbaca; hasil belum siap impor.');
    }
    return {
      sourceKey: sourceKey || (idKegiatan + '|' + nomorSPD).toLowerCase(),
      idKegiatan, nomorSPD, namaPegawai,
      rawText, presenceRows: presence.entries.length, presensiStatus: presence.status,
      sourceHash: await hashText(rawText),
      warnings, sourceUrl: location.href,
      capturedAt: new Date().toISOString(),
    };
  }

  function blankState() { return { records: [], index: [], errors: [], progress: {}, stats: { new: 0, changed: 0, unchanged: 0 } }; }
  async function readState() {
    const result = await chrome.runtime.sendMessage({ type: 'GET_COLLECTOR_STATE' });
    if (!result?.ok) throw new Error('Penyimpanan sesi tidak tersedia.');
    return result.data || blankState();
  }
  async function writeState(state) {
    const result = await chrome.runtime.sendMessage({ type: 'SET_COLLECTOR_STATE', state });
    if (!result?.ok) throw new Error('Penyimpanan sesi penuh atau tidak tersedia. Ekspor lalu bersihkan data lokal.');
    return state;
  }
  async function progress(values) {
    const state = await readState();
    state.progress = { ...state.progress, ...values, updatedAt: new Date().toISOString() };
    await writeState(state);
  }
  async function indexCurrentPage() {
    const jenisIndeks = /\/list-pelaksana-spd\//i.test(location.pathname) ? 'pelaksana-spd' : 'kegiatan';
    const items = listRows().map((row) => {
      const raw = textOf(row);
      return {
        sourceKey: listKey(row),
        idKegiatan: raw.match(/Id\s*Kegiatan\s*:\s*([a-z0-9-]+)/i)?.[1] || '',
        nomorST: raw.match(/ST-\d+\/[A-Z0-9.]+\/\d+/i)?.[0] || '',
        nomorSPD: raw.match(/SPD-\d+\/\d+-\d+/i)?.[0] || '',
        jenisIndeks,
        statusSumber: jenisIndeks === 'kegiatan'
          ? (raw.match(/\b(Laporan Tersedia|Belum ada laporan)\b/i)?.[0] || 'Status laporan belum tersedia')
          : (raw.match(/\b(Draft|Disetujui PPK|Disetujui|Dikirim|Ditolak|Selesai)\b/i)?.[0] || 'Status SPD belum tersedia'),
        rawText: raw, sourceUrl: location.href, capturedAt: new Date().toISOString(),
      };
    });
    const state = await readState();
    const stable = (item) => item.idKegiatan
      ? ((item.jenisIndeks || 'kegiatan') + '|' + item.idKegiatan + '|' + (item.nomorSPD || '')).toLowerCase()
      : item.sourceKey;
    const byKey = new Map((state.index || []).map((r) => [stable(r), r]));
    for (const item of items) byKey.set(stable(item), item);
    state.index = [...byKey.values()];
    state.progress = { ...state.progress, indexed: state.index.length, updatedAt: new Date().toISOString() };
    await writeState(state);
    return { ok: true, indexed: items.length, totalIndexed: state.index.length };
  }

  async function indexAllPages(maxPages = 100) {
    if (running) return { ok: false, reason: 'Proses lain masih berjalan.' };
    if (!getListTable()) return { ok: false, reason: 'Buka daftar SPD terlebih dahulu.' };
    running = true; stopRequested = false;
    let pages = 0, lastResult = { totalIndexed: 0 };
    try {
      const first = document.querySelector('button[aria-label="First page"]:not(:disabled)');
      if (first) {
        const prior = listSignature();
        first.click();
        await waitUntil(() => listSignature() && listSignature() !== prior, 'halaman pertama');
      }
      for (; pages < maxPages && !stopRequested; pages++) {
        lastResult = await indexCurrentPage();
        await progress({ state:'indexing', pagesIndexed: pages + 1, indexed: lastResult.totalIndexed });
        const next = document.querySelector('button[aria-label="Next page"]:not(:disabled)')
          || [...document.querySelectorAll('button')].find((el) =>
            /^(Berikutnya|Next page)$/i.test(textOf(el)) && !el.disabled);
        if (!next) break;
        const before = listSignature();
        next.click();
        await waitUntil(() => listSignature() && listSignature() !== before, 'halaman daftar berikutnya');
        await sleep(200);
      }
      await progress({ state: stopRequested ? 'paused' : 'completed',
        pagesIndexed: pages + 1, indexed: lastResult.totalIndexed,
        message: stopRequested ? 'Pengindeksan dihentikan' : 'Pengindeksan selesai' });
      return { ok:true, pagesIndexed: pages + 1, indexed:lastResult.totalIndexed };
    } catch (e) {
      const reason = e.message || String(e);
      await progress({ state:'paused', pagesIndexed: pages + 1, error: reason });
      return { ok:false, pagesIndexed:pages + 1, reason };
    } finally { running = false; }
  }

  async function storeDetail(record, extra = {}) {
    const state = await readState();
    const key = [record.idKegiatan, record.nomorSPD].filter(Boolean).join('|').toLowerCase();
    const i = state.records.findIndex((r) => [r.idKegiatan, r.nomorSPD].join('|').toLowerCase() === key);
    const previous = i >= 0 ? state.records[i] : null;
    const changeType = !previous ? 'new' : previous.sourceHash === record.sourceHash ? 'unchanged' : 'changed';
    const merged = {
      ...(previous || {}), ...record, changeType,
      previousHash: previous?.sourceHash && changeType === 'changed' ? previous.sourceHash : (previous?.previousHash || ''),
    };
    if (i >= 0) state.records[i] = merged;
    else state.records.push(merged);
    state.stats ||= { new: 0, changed: 0, unchanged: 0 };
    state.stats[changeType] = (state.stats[changeType] || 0) + 1;
    state.progress = { ...state.progress, ...extra, updatedAt: new Date().toISOString() };
    await writeState(state);
    return { ok: true, changeType, total: state.records.length, warnings: record.warnings };
  }
  async function errorLog(sourceKey, message) {
    const state = await readState();
    state.errors ||= [];
    state.errors.push({ sourceKey: sourceKey.slice(0, 150), message, at: new Date().toISOString() });
    state.errors = state.errors.slice(-100);
    await writeState(state);
  }
  async function backToList() {
    const buttons = [...document.querySelectorAll('button,a,[role="button"],span')];
    const back = buttons.find((el) => {
      const name = clean([textOf(el), el.getAttribute('aria-label'), el.getAttribute('title')].join(' '));
      return /^(Kembali|Back)$/i.test(name) && el.getClientRects().length;
    });
    if (!back) throw new Error('Kontrol Kembali tidak ditemukan. Buka daftar, lalu pilih Lanjutkan.');
    back.click();
    await waitUntil(() => !isDetail() && listRows().length, 'Daftar Pelaksana SPD');
    await sleep(300);
  }
  async function pilot(options = {}) {
    if (running) return { ok: false, reason: 'Kolektor masih berjalan.' };
    if (!isPerjadin() || !getListTable()) return { ok: false, reason: 'Buka daftar Pelaksana SPD terlebih dahulu.' };
    if (!/\/list-pelaksana-spd\//i.test(location.pathname)) {
      await indexCurrentPage();
      return { ok: false, reason: 'Halaman ini masih daftar KEGIATAN. Kolektor sudah mencatat indeks kegiatan. Buka satu kegiatan hingga muncul List Pelaksana SPD, lalu jalankan Ambil SPD Baru. Halaman kegiatan tidak mempunyai tombol detail SPD langsung.' };
    }
    running = true; stopRequested = false;
    const limit = Math.max(1, Math.min(20, Number(options.limit) || 5));
    const refreshExisting = options.refreshExisting === true;
    const maxPages = Math.max(1, Math.min(10, Number(options.maxPages) || 5));
    let count = 0, skipped = 0, page = 0;
    await progress({ state: 'running', completed: 0, skipped: 0, limit, page: 1, message: '' });
    try {
      for (page = 0; page < maxPages && count < limit; page++) {
        await indexCurrentPage();
        const queue = listRows().map((row) => listKey(row));
        for (const sourceKey of queue) {
          if (stopRequested || count >= limit) break;
          const state = await readState();
          if (!refreshExisting && state.records.some((r) => r.sourceKey === sourceKey)) { skipped++; continue; }
          const row = listRows().find((r) => listKey(r) === sourceKey);
          const button = row && detailControl(row);
          if (!button) {
            skipped++;
            await errorLog(sourceKey, 'Tombol Detail tidak ditemukan; tidak mencoba tombol transaksi lainnya.');
            continue;
          }
          button.click();
          await waitUntil(isDetail, 'Detail Pertanggungjawaban');
          const record = await captureDetail(sourceKey);
          await storeDetail(record, { state: 'running', page: page + 1, completed: count + 1, skipped, lastSourceKey: sourceKey });
          count++;
          await backToList();
        }
        if (stopRequested || count >= limit) break;
        const next = document.querySelector('button[aria-label="Next page"]:not(:disabled)')
          || [...document.querySelectorAll('button')].find((el) =>
            /^(Berikutnya|Next page)$/i.test(textOf(el)) && !el.disabled);
        if (!next) break;
        const before = listSignature();
        next.click();
        await waitUntil(() => listSignature() && listSignature() !== before, 'Halaman daftar berikutnya');
        await sleep(300);
      }
      await progress({ state: stopRequested ? 'paused' : 'completed', completed: count, skipped,
        page: page + 1, message: stopRequested ? 'Dihentikan oleh pengguna' : 'Pengumpulan selesai' });
      return { ok: true, completed: count, skipped };
    } catch (error) {
      const message = error.message || String(error);
      await progress({ state: 'paused', completed: count, skipped, page: page + 1, error: message });
      await errorLog('pilot', message);
      return { ok: false, completed: count, skipped, reason: message };
    } finally {
      running = false;
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (!message || !['RUN_PILOT_V2', 'STOP_PILOT_V2', 'CAPTURE_DETAIL_V2', 'CAPTURE_INDEX_V2', 'CAPTURE_INDEX_ALL_V2'].includes(message.type)) return false;
    if (message.type === 'STOP_PILOT_V2') {
      stopRequested = true;
      respond({ ok: true, message: 'Perintah berhenti diterima.' });
      return false;
    }
    const job = message.type === 'RUN_PILOT_V2' ? pilot(message)
      : message.type === 'CAPTURE_DETAIL_V2'
        ? captureDetail().then(storeDetail)
        : message.type === 'CAPTURE_INDEX_ALL_V2'
          ? indexAllPages()
          : indexCurrentPage();
    Promise.resolve(job).then(respond).catch((error) => respond({ ok: false, reason: error.message || String(error) }));
    return true;
  });
})();
