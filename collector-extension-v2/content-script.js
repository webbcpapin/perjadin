/* Collects visible data with the user's existing SATU session. */
(() => {
  if (window.__eperjadinCollectorV23) return;
  window.__eperjadinCollectorV23 = true;

  const core = globalThis.EPerjadinCollectorCore;
  const STORAGE = 'eperjadinV2Pilot';
  const routeLabel = /^Rute Perjalanan Dinas$/i;
  const presenceLabel = /^(Presensi Perjalanan Dinas|Geotagging Perjalan(?:an)? Dinas)$/i;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const errors = {
    activity: 'Daftar kegiatan PPK belum dapat dikenali. Buka Pertanggungjawaban Kegiatan lalu lanjutkan.',
    participant: 'Daftar pelaksana yang sesuai belum terbuka. Buka List Pelaksana SPD kegiatan ini lalu lanjutkan.',
    detail: 'Detail SPD yang sesuai belum terbuka. Buka Lihat Detail pada pelaksana yang sedang diproses.',
    control: 'Kontrol baca yang aman tidak dikenali. Buka tujuan berikutnya secara manual lalu lanjutkan.',
    identity: 'Identitas kegiatan atau pelaksana hilang, ganda, atau berbeda dari halaman sebelumnya.',
    financial: 'Rincian rute atau total resmi belum terbaca. Periksa tab Rute lalu lanjutkan.',
    page: 'Halaman berikutnya belum terbaca. Periksa daftar lalu lanjutkan.',
  };
  let running = false;
  let stopRequested = false;

  const listPage = () => core.list(document, location.pathname);
  const listItems = (page) => core.recordsFromList(document, page);
  const currentActivity = () => core.activityId(core.textOf(document.body));
  const isDetail = () => core.detailPath.test(location.pathname) && !!core.findTab(document, routeLabel);
  const fingerprint = (rows) => JSON.stringify(rows.map(({ item }) => item.sourceKey));

  async function waitFor(read, error, timeout = 12000) {
    const until = Date.now() + timeout;
    do {
      if (stopRequested) throw new Error('Pengumpulan dijeda.');
      const result = read();
      if (result) return result;
      await sleep(200);
    } while (Date.now() < until);
    throw new Error(error);
  }

  async function readState() {
    const value = (await chrome.storage.local.get(STORAGE))[STORAGE] || {};
    return { records: [], index: [], errors: [], stats: { new: 0, changed: 0, unchanged: 0 }, ...value };
  }

  function saveState(state) {
    return chrome.storage.local.set({ [STORAGE]: state });
  }

  async function checkpoint(state, run, status, message = '') {
    state.run = run;
    state.progress = {
      state: status, completed: run.completed, skipped: run.skipped, failed: run.failed,
      indexed: state.index.length, message, updatedAt: new Date().toISOString(),
    };
    await saveState(state);
  }

  function upsertIndex(state, items) {
    const index = new Map(state.index.map((item) => [item.sourceKey, item]));
    for (const item of items) {
      const old = index.get(item.sourceKey);
      index.set(item.sourceKey, { ...old, ...item, nomorSPD: item.nomorSPD || old?.nomorSPD || '',
        capturedAt: new Date().toISOString() });
    }
    state.index = [...index.values()];
  }

  function putDetail(state, record) {
    const i = state.records.findIndex((item) => core.spdKey(item.idKegiatan, item.nomorSPD) === record.sourceKey);
    const previous = state.records[i];
    if (record.presensiStatus === 'GAGAL_BACA' && previous?.presensiStatus === 'TERBACA') {
      return false;
    }
    const changeType = !previous ? 'new' : previous.sourceHash === record.sourceHash ? 'unchanged'
      : /^v23:[a-f0-9]{64}$/.test(previous.sourceHash || '') ? 'changed' : 'perlu-review';
    const next = { ...record, changeType };
    if (i < 0) state.records.push(next);
    else state.records[i] = next;
    if (changeType !== 'perlu-review') state.stats[changeType] = (state.stats[changeType] || 0) + 1;
    return true;
  }

  function verifiedRows(page) {
    const items = listItems(page);
    const visibleRows = [...page.table.querySelectorAll('tbody tr')].filter((row) => core.visible(row)
      && [...row.children].some((cell) => core.textOf(cell))
      && ![...row.children].some((cell) => Number(cell.getAttribute('colspan')) > 1));
    if (items.length !== visibleRows.length || new Set(items.map(({ item }) => item.sourceKey)).size !== items.length) {
      throw new Error(errors.identity);
    }
    return items;
  }

  async function readyRows(page) {
    return waitFor(() => {
      const panel = page.table.closest('[role="tabpanel"]') || page.table.parentElement;
      if ([...panel.querySelectorAll('[role="progressbar"],mat-spinner,mat-progress-spinner')].some(core.visible)) return false;
      const rows = verifiedRows(page);
      if (rows.length || /(?:\btidak ada (?:data|peserta)\b|\bno data\b)/i.test(core.textOf(panel))) return rows;
      return false;
    }, errors.page, 5000);
  }

  function nextPage(page, currentRows) {
    const panel = page.table.closest('[role="tabpanel"]') || document;
    const buttons = [...panel.querySelectorAll('mat-paginator button[aria-label="Next page"]')].filter(core.visible);
    if (buttons.length > 1) throw new Error(errors.page);
    const next = buttons[0];
    if (!next || next.disabled || next.getAttribute('aria-disabled') === 'true') return null;
    const before = fingerprint(currentRows);
    next.click();
    return waitFor(() => {
      const updated = listPage();
      if (!updated || updated.type !== page.type) return false;
      const rows = listItems(updated);
      return rows.length > 0 && fingerprint(rows) !== before;
    }, errors.page);
  }

  async function openRow(row, type) {
    const control = core.detailControl(row, type);
    if (!control) throw new Error(errors.control);
    control.element.click();
    if (control.menu) {
      const view = await waitFor(() => core.viewMenuItem(document), errors.control, 3000);
      view.click();
    }
    if (type === 'kegiatan') await waitFor(() => listPage()?.type === 'pelaksana-spd', errors.participant);
    else await waitFor(isDetail, errors.detail);
  }

  async function openTab(label, failure) {
    const tab = core.findTab(document, label);
    if (!tab) throw new Error(failure);
    if (tab.getAttribute('aria-selected') !== 'true') tab.click();
    return waitFor(() => core.tabPanel(document, core.findTab(document, label)), failure);
  }

  async function captureDetail() {
    const previousTab = core.findTab(document, presenceLabel)?.getAttribute('aria-selected') === 'true';
    await openTab(routeLabel, errors.financial);
    const financial = await waitFor(() => {
      const detail = core.financialScope(document.body.innerText);
      return /\bTotal Pengeluaran Riil\b/i.test(detail) && core.spdNo(detail) && detail;
    }, errors.financial);
    const idKegiatan = core.activityId(financial.replace(/\s+/g, ' '));
    const nomorSPD = core.spdNo(financial);
    const namaPegawai = financial.match(/(?:^|\n)\s*(?:Pelaksana SPD|Peserta Kegiatan)\s*(?:[:\t ]+|\n)\s*([^\n]+)/i)?.[1]?.trim() || '';
    const nip = financial.match(/\bNIP\s*:?\s*(\d{8,})/i)?.[1] || '';
    if (!idKegiatan || !nomorSPD || !namaPegawai) throw new Error(errors.identity);
    let presence;
    let warnings = [];
    try {
      await openTab(presenceLabel, 'Tab presensi tidak tersedia.');
      let signature = '';
      let observedAt = 0;
      presence = await waitFor(() => {
        const reading = core.capturePresence(core.tabPanel(document, core.findTab(document, presenceLabel)));
        const next = JSON.stringify(reading);
        if (signature !== next) { signature = next; observedAt = Date.now(); }
        return reading.status !== 'MENUNGGU' && Date.now() - observedAt >= 600 && reading;
      }, 'Presensi belum selesai dimuat atau tabelnya tidak dikenali.', 5000);
      if (presence.status === 'GAGAL_BACA') warnings = ['Sebagian baris presensi tidak dapat dibaca.'];
    } catch (error) {
      if (stopRequested) throw error;
      presence = { status: 'GAGAL_BACA', entries: [] };
      warnings = ['Presensi belum dapat dibaca. Periksa kembali halaman sumber.'];
    }
    if (!previousTab && !stopRequested) core.findTab(document, routeLabel)?.click();
    const markdown = [
      'Log Data Presensi',
      '| HARI, TANGGAL | WAKTU TAGGING | WILAYAH | LOKASI GEO TAGGING |',
      '| --- | --- | --- | --- |',
      ...presence.entries.map((entry) => '| ' + [
        entry.hariTanggal, entry.waktuTagging, entry.wilayahTagging, entry.lokasiTagging,
      ].map((value) => value.replace(/[|\n\r]/g, ' ')).join(' | ') + ' |'),
    ].join('\n');
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(core.fingerprintInput(financial, presence)));
    return {
      sourceKey: core.spdKey(idKegiatan, nomorSPD), idKegiatan, nomorSPD, namaPegawai, nip,
      rawText: financial + '\n\n' + markdown, geotags: presence.entries,
      presensiStatus: presence.status, presenceRows: presence.entries.length,
      sourceHash: 'v23:' + [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, '0')).join(''),
      sourceUrl: location.origin + location.pathname, warnings, capturedAt: new Date().toISOString(),
    };
  }

  function sameParticipant(participant, record) {
    const samePerson = participant.nip && record.nip ? participant.nip === record.nip
      : core.normalize(participant.namaPegawai) === core.normalize(record.namaPegawai);
    return samePerson && (!participant.nomorSPD || core.normalize(participant.nomorSPD) === core.normalize(record.nomorSPD));
  }

  async function backTo(type) {
    // The SATU pages inspected use browser history, with no dedicated Back button.
    history.back();
    await waitFor(() => listPage()?.type === type, type === 'kegiatan' ? errors.activity : errors.participant);
  }

  async function restoreSection(run) {
    if (!run.section) return;
    const tab = core.findTab(document, new RegExp('^' + run.section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?: \\d+)?$', 'i'));
    if (!tab) throw new Error(errors.activity);
    if (tab.getAttribute('aria-selected') !== 'true') tab.click();
    await waitFor(() => core.tabPanel(document, tab) && listPage()?.type === 'kegiatan', errors.activity);
  }

  async function pilot(options) {
    const state = await readState();
    const page = listPage();
    const old = state.run;
    const resume = options.resume === true;
    if (resume && (!old || old.tabId !== options.tabId || state.progress?.state === 'completed')) {
      throw new Error('Tidak ada progres aktif pada tab ini.');
    }
    if (!resume && old && state.progress?.state === 'running') throw new Error('Lanjutkan proses sebelumnya pada tab asal.');
    if (!resume && !page) throw new Error(errors.activity);
    const run = resume ? old : {
      tabId: options.tabId, fromActivities: page.type === 'kegiatan',
      activity: page.type === 'pelaksana-spd' ? { idKegiatan: currentActivity() } : null,
      participant: null, returning: '', done: [], activities: [],
      section: page.type === 'kegiatan' ? core.activitySection(document) : '',
      completed: 0, skipped: 0, failed: 0, refreshExisting: options.refreshExisting === true,
    };
    const limit = Math.max(1, Math.min(20, Number(options.limit) || 5));
    let attempted = 0;
    let pages = 0;
    const maxPages = 20;
    await checkpoint(state, run, 'running');
    try {
      while (!stopRequested) {
        if (run.returning) {
          const target = run.returning;
          if (listPage()?.type !== target) {
            if (target === 'kegiatan' && listPage()?.type !== 'pelaksana-spd') throw new Error(errors.activity);
            if (target === 'pelaksana-spd' && !isDetail()) throw new Error(errors.participant);
            await backTo(target);
          }
          run.participant = null;
          if (target === 'kegiatan') run.activity = null;
          run.returning = '';
          await checkpoint(state, run, 'running');
          continue;
        }
        if (attempted >= limit || pages >= maxPages) break;
        if (isDetail()) {
          if (!run.activity || !run.participant) throw new Error(errors.detail);
          const record = await captureDetail();
          if (core.normalize(record.idKegiatan) !== core.normalize(run.activity.idKegiatan)
            || !sameParticipant(run.participant, record)) throw new Error(errors.identity);
          const captured = putDetail(state, { ...record, statusSPD: run.participant.statusSPD });
          if (!captured || record.presensiStatus === 'GAGAL_BACA') {
            run.failed++;
            state.errors.push({ code: 'PRESENSI_GAGAL_BACA', at: new Date().toISOString() });
          } else run.completed++;
          state.errors = state.errors.slice(-100);
          upsertIndex(state, [{ ...run.participant, nomorSPD: record.nomorSPD }]);
          run.done.push(run.participant.sourceKey);
          run.returning = 'pelaksana-spd';
          attempted++;
          await checkpoint(state, run, 'running');
          continue;
        }

        const pageNow = listPage();
        if (!pageNow) throw new Error(run.participant ? errors.detail : errors.activity);
        if (pageNow.type === 'kegiatan') {
          if (!run.fromActivities || run.participant) throw new Error(errors.participant);
          await restoreSection(run);
          const activePage = listPage();
          const rows = await readyRows(activePage);
          upsertIndex(state, rows.map(({ item }) => item));
          const candidate = run.activity
            ? rows.find(({ item }) => item.sourceKey === run.activity.sourceKey)
            : rows.find(({ item }) => !run.activities.includes(item.sourceKey));
          if (!candidate) {
            const moved = nextPage(activePage, rows);
            if (!moved && run.activity) throw new Error(errors.activity);
            if (!moved) return checkpoint(state, run, 'completed', 'Pengumpulan selesai.');
            pages++;
            await moved;
            continue;
          }
          run.activity = candidate.item;
          await checkpoint(state, run, 'running');
          await openRow(candidate.row, 'kegiatan');
          continue;
        }

        if (!run.activity || core.normalize(currentActivity()) !== core.normalize(run.activity.idKegiatan)) {
          throw new Error(errors.identity);
        }
        const rows = await readyRows(pageNow);
        upsertIndex(state, rows.map(({ item }) => item));
        const candidate = run.participant ? rows.find(({ item }) => item.sourceKey === run.participant.sourceKey)
          : rows.find(({ item }) => !run.done.includes(item.sourceKey));
        if (!candidate) {
          const moved = nextPage(pageNow, rows);
          if (moved) { pages++; await moved; continue; }
          if (run.participant) throw new Error(errors.detail);
          if (!run.fromActivities) return checkpoint(state, run, 'completed', 'Pengumpulan selesai.');
          run.activities.push(run.activity.sourceKey);
          run.returning = 'kegiatan';
          await checkpoint(state, run, 'running');
          continue;
        }
        const indexed = state.index.find((item) => item.sourceKey === candidate.item.sourceKey);
        const key = core.spdKey(candidate.item.idKegiatan, indexed?.nomorSPD);
        const previous = state.records.find((item) => core.spdKey(item.idKegiatan, item.nomorSPD) === key);
        if (!run.refreshExisting && previous && ['TERBACA', 'TIDAK_ADA_DATA'].includes(previous.presensiStatus)
          && (!candidate.item.statusSPD || candidate.item.statusSPD === previous.statusSPD)) {
          run.done.push(candidate.item.sourceKey);
          run.participant = null;
          run.skipped++;
          await checkpoint(state, run, 'running');
          continue;
        }
        run.participant = candidate.item;
        await checkpoint(state, run, 'running');
        await openRow(candidate.row, 'pelaksana-spd');
      }
      await checkpoint(state, run, 'paused', 'Batch dijeda. Klik Lanjutkan untuk meneruskan.');
    } catch (error) {
      const message = Object.values(errors).includes(error.message) ? error.message : 'Halaman belum dapat diproses. Periksa halaman lalu lanjutkan.';
      if (!stopRequested) {
        run.failed++;
        state.errors = [...state.errors, { code: 'NAVIGASI_ATAU_DETAIL', message, at: new Date().toISOString() }].slice(-100);
      }
      await checkpoint(state, run, 'paused', stopRequested ? 'Dijeda oleh pengguna.' : message);
      return { ok: stopRequested, reason: message };
    }
    return { ok: true };
  }

  async function captureIndex(all) {
    const state = await readState();
    if (state.progress?.state === 'running') throw new Error('Jeda proses batch sebelum mengindeks.');
    if (all) {
      const page = listPage();
      if (!page) throw new Error(errors.activity);
      const panel = page.table.closest('[role="tabpanel"]') || document;
      const first = [...panel.querySelectorAll('mat-paginator button[aria-label="First page"]')].filter(core.visible);
      if (first.length > 1) throw new Error(errors.page);
      if (first[0] && !first[0].disabled) {
        const before = fingerprint(verifiedRows(page));
        first[0].click();
        await waitFor(() => {
          const updated = listPage();
          return updated?.type === page.type && fingerprint(listItems(updated)) !== before;
        }, errors.page);
      }
    }
    let indexed = 0;
    for (let i = 0; i < (all ? 100 : 1) && !stopRequested; i++) {
      const page = listPage();
      if (!page) throw new Error(errors.activity);
      const rows = await readyRows(page);
      upsertIndex(state, rows.map(({ item }) => item));
      indexed += rows.length;
      await saveState(state);
      if (!all) break;
      const moved = nextPage(page, rows);
      if (!moved) break;
      if (i === 99) throw new Error(errors.page);
      await moved;
    }
    return { ok: true, indexed };
  }

  async function captureSingle() {
    if (!isDetail()) throw new Error(errors.detail);
    const state = await readState();
    if (state.progress?.state === 'running') throw new Error('Jeda proses batch sebelum merekam detail manual.');
    const record = await captureDetail();
    const ok = putDetail(state, record);
    await saveState(state);
    return { ok, reason: ok ? '' : 'Rekaman presensi yang sudah terbaca tetap disimpan.' };
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    const jobs = ['RUN_PILOT_V2', 'STOP_PILOT_V2', 'CAPTURE_DETAIL_V2', 'CAPTURE_INDEX_V2', 'CAPTURE_INDEX_ALL_V2'];
    if (sender.id !== chrome.runtime.id || location.origin !== 'https://satu.kemenkeu.go.id' || !jobs.includes(message?.type)) return false;
    if (message.type === 'STOP_PILOT_V2') {
      stopRequested = true;
      readState().then(async (state) => {
        if (!running && state.run?.tabId === message.tabId && state.progress?.state === 'running') {
          await checkpoint(state, state.run, 'paused', 'Dijeda oleh pengguna.');
        }
        respond({ ok: true });
      }, () => respond({ ok: false, reason: 'Progres belum dapat dibaca.' }));
      return true;
    }
    if (running) { respond({ ok: false, reason: 'Kolektor masih berjalan.' }); return false; }
    running = true;
    stopRequested = false;
    const job = message.type === 'RUN_PILOT_V2' ? pilot(message)
      : message.type === 'CAPTURE_DETAIL_V2' ? captureSingle()
        : captureIndex(message.type === 'CAPTURE_INDEX_ALL_V2');
    job.then((result) => respond(result || { ok: true })).catch((error) =>
      respond({ ok: false, reason: Object.values(errors).includes(error.message) ? error.message : 'Kolektor berhenti. Periksa halaman dan progres lokal.' }))
      .finally(() => { running = false; });
    return true;
  });
})();
