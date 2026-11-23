/* Kolektor V2: hanya interaksi navigasi baca. Tidak mengirim data ke luar browser. */
(() => {
  if (window.__eperjadinCollectorV2) return;
  window.__eperjadinCollectorV2 = true;
  const STORAGE = 'eperjadinV2Pilot';
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const text = (el) => clean(el?.textContent);
  let running = false;
  let stopRequested = false;
  const isPerjadin = () => /perjadin/i.test(location.pathname + document.title + document.body.innerText.slice(0, 600));

  function table() {
    return [...document.querySelectorAll('table')].find((t) => t.querySelector('tbody tr')) || null;
  }
  function signature() {
    const t = table();
    return t ? [...t.querySelectorAll('tbody tr')].slice(0, 2).map(text).join('|').slice(0, 1500) : '';
  }
  function rows() {
    return [...(table()?.querySelectorAll('tbody tr') || [])].filter((r) => text(r));
  }
  function listKey(row) {
    const id = text(row).match(/Id\s*Kegiatan\s*:\s*([a-z0-9-]+)/i)?.[1] || '';
    const st = text(row).match(/ST-\d+\/[A-Z0-9.]+\/\d+/i)?.[0] || '';
    return (id + '|' + st + '|' + text(row)).toLowerCase().slice(0, 2000);
  }
  function detailControl(row) {
    const elements = [...row.querySelectorAll('a,button,[role="button"]')];
    return elements.find((el) => {
      const name = clean([text(el), el.getAttribute('aria-label'), el.getAttribute('title')].join(' '));
      const href = el.getAttribute('href') || '';
      const label = /^(detail|lihat detail|lihat|rincian|detail pertanggungjawaban|detail perjalanan)$/i.test(name)
        || /(?:detail|rincian|lihat)/i.test(name);
      const approvedUrl = el.tagName === 'A' && /\/((?:detail|rincian)[^/]*)(?:\/|$|\?)/i.test(href);
      const prohibited = /(setujui|tolak|hapus|batalkan|bayar|kirim|proses|approve|delete|reject)/i.test(name);
      return !prohibited && (approvedUrl || label);
    }) || null;
  }
  function byVisibleLabel(label) {
    const elements = [...document.querySelectorAll('button,a,[role="tab"],[role="button"]')];
    return elements.find((el) => {
      const labelText = clean([text(el), el.getAttribute('aria-label'), el.getAttribute('title')].join(' '));
      return label.test(labelText) && !el.disabled;
    }) || null;
  }
  async function until(predicate, label, timeoutMs = 12000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const result = predicate();
      if (result) return result;
      await sleep(280);
    }
    throw new Error('Batas waktu: ' + label + '. Jika halaman reload penuh, jalankan kembali untuk melanjutkan.');
  }
  function isDetail() {
    return /detail\s+(pertanggungjawaban|perjalanan dinas|pelaksanaan)/i.test(document.body.innerText || '')
      && /(Nomor SPD|No SPD|Nama Kegiatan)/i.test(document.body.innerText || '');
  }
  function normalizeText(raw) {
    return String(raw || '').replace(/\u00a0/g, ' ').replace(/\r/g, '');
  }
  function getDetail() {
    if (!isDetail()) throw new Error('Halaman Detail Pertanggungjawaban belum terbuka.');
    const financial = normalizeText(document.body.innerText);
    const meta = {
      idKegiatan: financial.match(/Id Kegiatan\s*\n\s*([a-z0-9]{12,})/i)?.[1] || '',
      nomorSPD: financial.match(/SPD-\d+\/\d+-\d+/i)?.[0] || '',
      namaPegawai: financial.match(/Pelaksana SPD\s*\n\s*([^\n]+)/i)?.[1]?.trim() || '',
    };
    return { financial, meta };
  }
  async function readPresences(financial) {
    const tab = byVisibleLabel(/^presensi perjalanan dinas$/i);
    if (!tab) return { text: '', warning: 'Tab Presensi tidak tersedia pada detail.' };
    tab.click();
    try {
      await until(() => /Log Data Presensi|GEOTAGGING|LOKASI GEO TAGGING/i.test(document.body.innerText), 'tab Presensi', 9000);
      await sleep(320);
      const presence = normalizeText(document.body.innerText);
      return { text: presence, warning: '' };
    } catch (_) {
      return { text: '', warning: 'Presensi belum selesai dimuat.' };
    }
  }
  async function readDetailRecord(sourceKey = '') {
    const { financial, meta } = getDetail();
    const presence = await readPresences(financial);
    return {
      sourceKey: sourceKey || (meta.idKegiatan + '|' + meta.nomorSPD).toLowerCase(),
      idKegiatan: meta.idKegiatan, nomorSPD: meta.nomorSPD,
      namaPegawai: meta.namaPegawai,
      rawText: financial + (presence.text ? '\n\n' + presence.text : ''),
      warnings: presence.warning ? [presence.warning] : [],
      sourceUrl: location.href, capturedAt: new Date().toISOString(),
    };
  }
  async function backToList() {
    const button = byVisibleLabel(/^(kembali|kembali ke daftar|back)$/i);
    if (button) button.click();
    else if (history.length > 1) history.back();
    else throw new Error('Tombol Kembali tidak ditemukan.');
    await until(() => rows().length > 0 && !isDetail(), 'kembali ke daftar');
    await sleep(350);
  }
  async function storeRecord(record, options = {}) {
    const data = (await chrome.storage.local.get(STORAGE))[STORAGE] || { records: [], errors: [], progress: {} };
    const key = [record.idKegiatan, record.nomorSPD].filter(Boolean).join('|').toLowerCase() || record.sourceKey;
    const existing = data.records.findIndex((r) => (r.idKegiatan + '|' + r.nomorSPD).toLowerCase() === key);
    if (existing >= 0) data.records[existing] = { ...data.records[existing], ...record };
    else data.records.push(record);
    data.progress = { ...data.progress, ...options, updatedAt: new Date().toISOString() };
    await chrome.storage.local.set({ [STORAGE]: data });
    return data;
  }
  async function storeProgress(next) {
    const data = (await chrome.storage.local.get(STORAGE))[STORAGE] || { records: [], errors: [], progress: {} };
    data.progress = { ...data.progress, ...next, updatedAt: new Date().toISOString() };
    await chrome.storage.local.set({ [STORAGE]: data });
    return data;
  }
  async function pilot({ limit = 20, maxPages = 5 } = {}) {
    if (running) throw new Error('Pilot sedang berjalan.');
    if (!isPerjadin() || !table()) throw new Error('Buka daftar SPD di SATU Kemenkeu terlebih dahulu.');
    running = true; stopRequested = false;
    limit = Math.max(1, Math.min(20, Number(limit) || 20));
    maxPages = Math.max(1, Math.min(10, Number(maxPages) || 5));
    let completed = 0, skipped = 0, page = 0, stoppedReason = '';
    await storeProgress({ state: 'running', limit, completed: 0, skipped: 0, page: 1, error: '' });
    try {
      for (page = 0; page < maxPages && completed < limit; page++) {
        const queue = rows().map((r) => listKey(r));
        for (const key of queue) {
          if (stopRequested || completed >= limit) break;
          const saved = (await chrome.storage.local.get(STORAGE))[STORAGE] || { records: [], errors: [] };
          if ((saved.records || []).some((r) => r.sourceKey === key)) { skipped++; continue; }
          const row = rows().find((r) => listKey(r) === key);
          if (!row) { skipped++; continue; }
          const ctrl = detailControl(row);
          if (!ctrl) {
            saved.errors ||= [];
            saved.errors.push({ sourceKey: key.slice(0, 140), message: 'Kontrol detail tidak teridentifikasi. Butuh selector resmi.', at: new Date().toISOString() });
            await chrome.storage.local.set({ [STORAGE]: saved });
            skipped++;
            continue;
          }
          const targetName = text(row).slice(0, 160);
          ctrl.click();
          await until(isDetail, 'detail SPD ' + targetName);
          await sleep(360);
          const record = await readDetailRecord(key);
          if (!record.nomorSPD || !record.idKegiatan) {
            throw new Error('ID Kegiatan atau Nomor SPD tidak terbaca. Pilot berhenti tanpa menyimpan record tidak lengkap.');
          }
          await storeRecord(record, { state: 'running', page: page + 1, completed: completed + 1, skipped });
          completed++;
          await backToList();
        }
        if (stopRequested || completed >= limit) break;
        const next = document.querySelector('button[aria-label="Next page"]:not(:disabled)')
          || byVisibleLabel(/^(next page|halaman berikutnya|berikutnya)$/i);
        if (!next || next.disabled) break;
        const before = signature();
        next.click();
        await until(() => signature() && signature() !== before, 'halaman daftar berikutnya');
        await sleep(250);
      }
      stoppedReason = stopRequested ? 'Dihentikan pengguna' : 'Selesai';
      await storeProgress({ state: stopRequested ? 'paused' : 'completed', completed, skipped, page: page + 1, message: stoppedReason });
      return { ok: true, completed, skipped, reason: stoppedReason };
    } catch (error) {
      stoppedReason = error.message || String(error);
      await storeProgress({ state: 'paused', completed, skipped, page: page + 1, error: stoppedReason });
      return { ok: false, completed, skipped, reason: stoppedReason };
    } finally {
      running = false;
    }
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !['RUN_PILOT_V2','STOP_PILOT_V2','CAPTURE_DETAIL_V2'].includes(message.type)) return false;
    if (message.type === 'STOP_PILOT_V2') {
      stopRequested = true;
      sendResponse({ ok: true, message: 'Permintaan berhenti diterima.' });
      return false;
    }
    if (message.type === 'CAPTURE_DETAIL_V2') {
      readDetailRecord().then((record) => storeRecord(record)).then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, reason: e.message || String(e) }));
      return true;
    }
    pilot({ limit: message.limit, maxPages: message.maxPages }).then(sendResponse)
      .catch((e) => sendResponse({ ok: false, reason: e.message || String(e) }));
    return true;
  });
})();
