/* Shared by the browser collector and offline DOM fixture tests. */
(() => {
  const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const textOf = (element) => clean(element?.innerText ?? element?.textContent);
  const visible = (element) => !!element?.getClientRects().length
    && !element.closest('[hidden],[aria-hidden="true"]');
  const normalize = (value) => clean(value).toLowerCase();
  const spdKey = (activity, spd) => activity && spd ? normalize(activity) + '|' + normalize(spd) : '';
  const spdNo = (text) => text.match(/\bSPD-\d+\/[\d]+-\d{4}\b/i)?.[0] || '';
  const activityId = (text) => text.match(/\bID\s*Kegiatan\s*:?\s*([a-z0-9-]{8,})(?=\s|$)/i)?.[1] || '';
  const forbidden = /setujui|tolak|hapus|batal|bayar|kirim|ubah|edit|buat|modifikasi|approve|delete|reject|submit/i;
  const ppkPath = /^\/perjadin\/pertanggungjawaban\/ppk-peserta\/[^/]+\/?$/i;
  const listPath = /^\/perjadin\/pertanggungjawaban\/?$/i;
  const detailPath = /^\/perjadin\/pertanggungjawaban\/pengeluaran-riil\/?$/i;

  function headers(table) {
    const cells = table.querySelectorAll('thead tr:last-child > th, thead tr:last-child > td');
    return Array.from(cells.length ? cells : table.querySelectorAll('[role="columnheader"]'), textOf);
  }

  function activitySection(doc) {
    const selected = [...doc.querySelectorAll('[role="tab"][aria-selected="true"]')].find(visible);
    const label = textOf(selected).replace(/\s+\d+$/, '');
    return /^(Belum Lengkap|Sudah Lengkap|Sudah Disetujui|Sudah Kirim|Proses Pencairan|Selesai Pencairan)$/i.test(label)
      ? label : '';
  }

  function list(doc, pathname) {
    const candidates = [...doc.querySelectorAll('table')].filter(visible).map((table) => {
      const columns = headers(table);
      const type = listPath.test(pathname) && activitySection(doc) && columns.some((h) => /^nama kegiatan$/i.test(h))
        ? 'kegiatan'
        : (ppkPath.test(pathname) || /\/list-pelaksana-spd\//i.test(pathname))
          && columns.some((h) => /^(nama peserta|pelaksana spd|nama pelaksana)$/i.test(h))
          ? 'pelaksana-spd' : '';
      return { table, columns, type };
    }).filter((entry) => entry.type);
    return candidates.length === 1 ? candidates[0] : null;
  }

  function recordsFromList(doc, page) {
    const contextId = page.type === 'pelaksana-spd' ? activityId(textOf(doc.body)) : '';
    const section = page.type === 'kegiatan' ? activitySection(doc) : '';
    const field = (cells, regex) => textOf(cells[page.columns.findIndex((h) => regex.test(h))]);
    return [...page.table.querySelectorAll('tbody tr')].filter(visible).flatMap((row) => {
      const cells = [...row.querySelectorAll(':scope > td, :scope > th')];
      if (cells.length !== page.columns.length) return [];
      const raw = cells.map(textOf).join(' ');
      const idKegiatan = page.type === 'kegiatan' ? activityId(raw) : contextId;
      if (!idKegiatan) return [];
      const nomorST = raw.match(/\bST-\d+\/[A-Z0-9.]+\/\d{4}\b/i)?.[0] || '';
      if (page.type === 'kegiatan') {
        const statusLaporan = raw.match(/\b(Laporan Tersedia|Belum Ada Laporan)\b/i)?.[0] || '';
        const explicitStatus = field(cells, /^status(?: kegiatan)?$/i);
        return [{
          row, item: { jenisIndeks: page.type, sourceKey: 'kegiatan|' + normalize(idKegiatan),
            idKegiatan, nomorST, namaKegiatan: field(cells, /^nama kegiatan$/i).split(/\bID\s*Kegiatan\b/i)[0].trim(),
            statusKegiatan: /^(Laporan Tersedia|Belum Ada Laporan)$/i.test(explicitStatus) ? section : explicitStatus || section,
            statusLaporan }
        }];
      }
      const nameColumn = page.columns.findIndex((h) => /^(nama peserta|pelaksana spd|nama pelaksana)$/i.test(h));
      const nameText = String(cells[nameColumn]?.innerText ?? cells[nameColumn]?.textContent ?? '');
      const namaPegawai = clean(nameText.split(/\n/)[0]);
      const nip = raw.match(/\b(?:NIP\s*:?\s*)?(\d{18})\b/i)?.[1] || '';
      const nomorSPD = spdNo(raw);
      if (!namaPegawai || /^(tidak ada data|no data|memuat)/i.test(namaPegawai)) return [];
      const identity = nomorSPD || nip || namaPegawai;
      return [{
        row, item: { jenisIndeks: page.type, sourceKey: 'pelaksana|' + spdKey(idKegiatan, identity),
          idKegiatan, nomorST, namaPegawai, nip, nomorSPD, statusSPD: field(cells, /^status(?: spd)?$/i) }
      }];
    });
  }

  function labelOf(element) {
    return clean([textOf(element), ...['title', 'aria-label', 'mattooltip'].map((attr) => element.getAttribute(attr)),
      ...String(element.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)
        .map((id) => textOf(element.ownerDocument.getElementById(id)))].filter(Boolean).join(' '));
  }

  function safeControl(element) {
    if (!visible(element) || element.matches('[disabled],[aria-disabled="true"],[type="submit"],[download]')
      || forbidden.test(labelOf(element))) return false;
    const href = element.getAttribute('href');
    if (!href) return true;
    try {
      const url = new URL(href, 'https://satu.kemenkeu.go.id');
      return url.origin === 'https://satu.kemenkeu.go.id' && (ppkPath.test(url.pathname) || detailPath.test(url.pathname));
    } catch { return false; }
  }

  function detailControl(row, type) {
    const actions = [...row.querySelectorAll('button,a,[role="button"]')].filter(safeControl);
    const eyes = actions.filter((element) =>
      element.querySelector('mat-icon[data-mat-icon-name="remove_red_eye"]')
      && (type === 'kegiatan' ? /^Jumlah Peserta:\s*\d+$/i.test(labelOf(element))
        : /^Lihat Detail(?: Lihat Detail Pertanggungjawaban)?$/i.test(labelOf(element))));
    const menus = type === 'kegiatan' ? actions.filter((element) => element.matches('button[aria-haspopup="true"],button[aria-haspopup="menu"]')
      && element.querySelector('mat-icon[data-mat-icon-name="more-horizontal"],mat-icon[data-mat-icon-name="dots-circle-horizontal"]')) : [];
    const known = [...eyes.map((element) => ({ element, menu: false })), ...menus.map((element) => ({ element, menu: true }))];
    return known.length === 1 ? known[0] : null;
  }

  function viewMenuItem(doc) {
    const matches = [...doc.querySelectorAll('[role="menu"] [role="menuitem"]')].filter((element) =>
      safeControl(element) && /^Lihat Detail$/i.test(textOf(element)));
    return matches.length === 1 ? matches[0] : null;
  }

  function findTab(doc, label) {
    const tabs = [...doc.querySelectorAll('[role="tab"]')].filter((tab) => visible(tab)
      && !tab.matches('[aria-disabled="true"],[disabled]') && label.test(textOf(tab)));
    return tabs.length === 1 ? tabs[0] : null;
  }

  function tabPanel(doc, tab) {
    if (!tab || tab.getAttribute('aria-selected') !== 'true') return null;
    const panel = doc.getElementById(tab.getAttribute('aria-controls'));
    return visible(panel) ? panel : null;
  }

  const dateRe = /^(?:(?:[a-z]+,?\s+)?\d{1,2}\s+[a-z]+\s+\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{4})$/i;
  const timeRe = /^(?:[01]?\d|2[0-3])[:.][0-5]\d$/;
  const missing = (value) => !value || /^[-–—\s]+$/.test(value);
  const emptyNotice = /^(?:tidak ada (?:data|presensi)(?: (?:untuk ditampilkan|geotagging))?|belum ada (?:data|presensi)|no data(?: available)?)[.!]?$/i;

  function capturePresence(panel) {
    const outcome = (status, entries = []) => ({ status, entries });
    if (!panel || panel.querySelector('[aria-busy="true"],[role="progressbar"],mat-spinner,mat-progress-spinner')) {
      return outcome('MENUNGGU');
    }
    const table = [...panel.querySelectorAll('table,[role="table"],[role="grid"]')].filter(visible)
      .find((element) => headers(element).some((col) => /^waktu tagging$/i.test(col)));
    if (!table) return emptyNotice.test(textOf(panel)) ? outcome('TIDAK_ADA_DATA') : outcome('MENUNGGU');
    const columns = headers(table);
    const timeCol = columns.findIndex((col) => /^waktu tagging$/i.test(col));
    const areaCol = columns.findIndex((col) => /^wilayah(?: tagging)?$/i.test(col));
    const locationCol = columns.findIndex((col) => /^lokasi(?: geo)?\s*tagging$/i.test(col));
    if (areaCol < 0 || locationCol < 0) return outcome('GAGAL_BACA');
    const entries = [];
    let currentDate = '';
    let invalid = false;
    let explicitEmpty = false;
    const rows = [...table.querySelectorAll('tbody tr,[role="row"]')].filter((row) =>
      visible(row) && !row.querySelector('[role="columnheader"]'));
    for (const row of rows) {
      const cells = [...row.querySelectorAll(':scope > td,:scope > th,:scope > [role="cell"],:scope > [role="gridcell"]')].map(textOf);
      if (emptyNotice.test(textOf(row))) { explicitEmpty = true; continue; }
      if (!cells.length) { if (textOf(row)) invalid = true; continue; }
      const rowDate = cells.find((value) => dateRe.test(value));
      if (rowDate) currentDate = rowDate;
      const values = cells.filter((value) => !dateRe.test(value));
      if (values.every(missing)) { if (rowDate) explicitEmpty = true; continue; }
      const timeIdx = cells.findIndex((value) => timeRe.test(value));
      const area = cells[timeIdx + areaCol - timeCol];
      const address = cells[timeIdx + locationCol - timeCol];
      if (!currentDate || timeIdx < 0 || missing(area) && missing(address)) { invalid = true; continue; }
      entries.push({ hariTanggal: currentDate, waktuTagging: cells[timeIdx].replace('.', ':').padStart(5, '0'),
        wilayahTagging: missing(area) ? '' : area,
        lokasiTagging: missing(address) ? '' : clean(address.replace(/Lihat Di Map/gi, '')) });
    }
    if (invalid) return outcome('GAGAL_BACA', entries);
    if (entries.length) return outcome('TERBACA', entries);
    return outcome(explicitEmpty || emptyNotice.test(textOf(panel)) ? 'TIDAK_ADA_DATA' : 'MENUNGGU');
  }

  function financialScope(raw) {
    const start = raw.search(/(?:^|\n)\s*Nama Kegiatan(?:[\t ]|\n|$)/i);
    if (start < 0) return '';
    return raw.slice(start).split(/\n\s*(?:Powered By Kemenkeu|Digital Signature Supported By|Versi \d+\.)/i)[0].trim();
  }

  function fingerprintInput(financial, presence) {
    const lines = financial.split(/\r?\n/).map(clean).filter((line) => line &&
      !/^(?:\d{1,2}:\d{2}(?::\d{2})?|Items per page:?|\d+\s*[-–]\s*\d+\s+of\s+\d+)$/i.test(line));
    const points = [...new Set(presence.entries.map((entry) =>
      JSON.stringify([entry.hariTanggal, entry.waktuTagging, entry.wilayahTagging, entry.lokasiTagging].map(clean))))].sort();
    return JSON.stringify([lines, presence.status, points]);
  }

  globalThis.EPerjadinCollectorCore = {
    clean, normalize, textOf, visible, spdKey, spdNo, activityId, list, recordsFromList, detailControl,
    viewMenuItem, findTab, tabPanel, capturePresence, financialScope, fingerprintInput,
    detailPath, activitySection,
  };
})();
