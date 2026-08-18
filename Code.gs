const SPREADSHEET_ID = '1fkXASbZbnPCZeW2FSxteE-oOnacVuJRCxQ8zWOgPRh8';

const HEADERS_DATA = [
  'ID Kegiatan',
  'Nama Kegiatan',
  'Nomor ST',
  'NKA/Nomor Kegiatan',
  'Tanggal Kegiatan',
  'Tujuan',
  'Nama Pegawai',
  'Lama (Hari)',
  'Uang Harian per Hari',
  'Total Uang Harian',
  'Uang Muka',
  'Total Pengeluaran Riil',
  'Kurang/Lebih Bayar',
  'Status Pertanggungjawaban',
  'Status Geotag',
  'START',
  'CLOCK IN',
  'CLOCK OUT',
  'END',
  'VOLUME',
  'NILAI RIIL',
  'Kode Akun',
  'Detail Geotag',
  'Tanggal Input',
  'Tahap Data',
  'Status Persetujuan',
  'Nomor Kegiatan KPD',
  'Output',
  'Kota Tujuan',
  'Jenis Pembayaran',
  'Total Estimasi Biaya',
  'Total Uang Muka',
  'Keterangan',
  'Jenis Perjadin',
  'Sumber Data',
  'URL Sumber',
  'Waktu Rekam Sumber',
  'Batch Sinkronisasi',
  'Kunci Sumber'
];

const HEADERS_AKUN = ['Kode Akun', 'Nama Akun', 'Pagu', 'Realisasi', 'Komitmen', 'Saldo'];
const HEADERS_SYNC = [
  'Batch ID',
  'Waktu Rekam Sumber',
  'Waktu Impor',
  'Sumber',
  'Bagian',
  'URL Sumber',
  'Total di Pusat',
  'Diterima',
  'Baru',
  'Diperbarui',
  'Dilewati',
  'Cakupan (%)'
];
const DATA_SHEET_NAME = 'DATA_PERJADIN';
const ACCOUNT_SHEET_NAME = 'AKUN_ANGGARAN';
const SYNC_SHEET_NAME = 'SINKRONISASI';

const DEFAULT_ACCOUNTS = [
  ['636722.015.524111.01505CC.4787AEF.A000000001.00000.2.3051.2.000000.000000', '524111 Luar Kota - 4787.AEF - Sosialisasi dan Penyuluhan (Eksternal)', 3300000, 0, 0, 3300000],
  ['636722.015.524113.01505CC.4787AEF.A000000001.00000.2.3051.2.000000.000000', '524113 Dalam Kota - 4787.AEF - Sosialisasi dan Penyuluhan (Eksternal)', 480000, 0, 0, 480000],
  ['636722.015.524111.01505CC.4787BAE.A000000001.00000.2.3051.2.000000.000000', '524111 Luar Kota - 4787.BAE - Klinik Ekspor', 5400000, 0, 0, 5400000],
  ['636722.015.524113.01505CC.4787BAE.A000000001.00000.2.3051.2.000000.000000', '524113 Dalam Kota - 4787.BAE - Klinik Ekspor', 960000, 0, 0, 960000],
  ['636722.015.524111.01505CC.4787BIG.A000000001.00000.2.3051.2.000000.000000', '524111 Luar Kota - 4787.BIG - Pemeriksaan Kepabeanan dan Cukai', 36000000, 0, 0, 36000000],
  ['636722.015.524113.01505CC.4787BIG.A000000001.00000.2.3051.2.000000.000000', '524113 Dalam Kota - 4787.BIG - Pemeriksaan Kepabeanan dan Cukai', 16800000, 0, 0, 16800000],
  ['636722.015.524111.01505CC.4789BIG.A000000001.00000.2.3051.2.000000.000000', '524111 Luar Kota - 4789.BIG - Laporan Hasil Intelijen, Penindakan, dan Penyidikan', 31800000, 0, 0, 31800000],
  ['636722.015.524113.01505CC.4789BIG.A000000001.00000.2.3051.2.000000.000000', '524113 Dalam Kota - 4789.BIG - Laporan Hasil Intelijen, Penindakan, dan Penyidikan', 4800000, 0, 0, 4800000],
  ['636722.015.524111.01505WA.4695EBA.A000000001.00000.2.3051.2.000000.000000', '524111 Luar Kota - 4695.EBA - Kerumahtanggaan', 39419000, 0, 0, 39419000],
  ['636722.015.524113.01505WA.4695EBA.A000000001.00000.2.3051.2.000000.000000', '524113 Dalam Kota - 4695.EBA - Kerumahtanggaan', 3240000, 0, 0, 3240000],
  ['636722.015.524111.01505WA.4698EBD.A000000001.00000.2.3051.2.000000.000000', '524111 Luar Kota - 4698.EBD - Rekomendasi Kepatuhan Internal', 1800000, 0, 0, 1800000],
  ['636722.015.524113.01505WA.4698EBD.A000000001.00000.2.3051.2.000000.000000', '524113 Dalam Kota - 4698.EBD - Rekomendasi Kepatuhan Internal', 720000, 0, 0, 720000]
];

function ss_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function sheet_(name, headers) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    return sh;
  }

  const lastColumn = Math.max(sh.getLastColumn(), 1);
  const existing = sh.getRange(1, 1, 1, lastColumn).getValues()[0].filter(String);
  if (existing.length === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    return sh;
  }

  const missing = headers.filter(function(header) { return existing.indexOf(header) === -1; });
  if (missing.length > 0) {
    sh.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  }

  return sh;
}

function doGet(e) {
  const auth = requireAccess_(e && e.parameter ? { accessCode: e.parameter.accessCode, token: e.parameter.token } : null);
  if (!auth.success) return out_(auth);
  return dashboardResponse_();
}

function dashboardResponse_() {
  ensureAccounts_();
  refreshAkun_();
  const dataSheet = dataSheetForRead_();
  const data = dataSheet ? readExistingSheet_(dataSheet) : [];
  const akun = readSheet_(ACCOUNT_SHEET_NAME, HEADERS_AKUN);
  return out_({
    success: true,
    data: data,
    akun: akun,
    sync: syncSummary_(),
    sourceSheet: dataSheet ? dataSheet.getName() : DATA_SHEET_NAME
  });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const auth = requireAccess_(body);
    if (!auth.success) return out_(auth);
    if (body.action === 'getDashboard') return dashboardResponse_();
    if (body.action === 'upsertPerjadin') return upsertPerjadin_(body.row, body.previousKey || '');
    if (body.action === 'batchUpsertCollector') return batchUpsertCollector_(body.payload || {});
    if (body.action === 'deletePerjadin') return deletePerjadin_(body.row);
    if (body.action === 'saveAccounts') return saveAccounts_(body.accounts || []);
    return out_({ success: false, message: 'Action tidak dikenali' });
  } catch (err) {
    return out_({ success: false, message: err.message });
  }
}

function upsertPerjadin_(r, previousKey) {
  const sh = sheet_(DATA_SHEET_NAME, HEADERS_DATA);
  const headers = headerMap_(sh);
  const key = rowKey_(r);
  const values = sh.getDataRange().getValues();
  let target = -1;

  for (let i = 1; i < values.length; i++) {
    const existingKey = rowKeyFromSheetRow_(values[i], headers);
    if (existingKey === key || (previousKey && existingKey === previousKey)) {
      target = i + 1;
      break;
    }
  }

  const rowObject = rowObject_(r);
  const currentHeaders = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const row = currentHeaders.map(function(header) {
    return rowObject[header] !== undefined ? rowObject[header] : '';
  });

  if (target > 0) sh.getRange(target, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);

  refreshAkun_();
  return out_({ success: true, message: target > 0 ? 'Updated' : 'Inserted' });
}

function deletePerjadin_(r) {
  const sh = sheet_(DATA_SHEET_NAME, HEADERS_DATA);
  const headers = headerMap_(sh);
  const key = rowKey_(r);
  const values = sh.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (rowKeyFromSheetRow_(values[i], headers) === key) {
      sh.deleteRow(i + 1);
      refreshAkun_();
      return out_({ success: true, message: 'Deleted' });
    }
  }

  return out_({ success: false, message: 'Data tidak ditemukan untuk dihapus' });
}

function batchUpsertCollector_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const records = Array.isArray(payload.records) ? payload.records : [];
    if (records.length === 0) return out_({ success: false, message: 'Payload kolektor tidak berisi records.' });
    if (records.length > 5000) return out_({ success: false, message: 'Maksimal 5.000 records per batch.' });

    const sh = sheet_(DATA_SHEET_NAME, HEADERS_DATA);
    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const headerIndexes = headerMap_(sh);
    const existingRows = sh.getLastRow() > 1
      ? sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues()
      : [];
    const keyToIndex = {};
    const sourceKeyColumn = headerIndexes['Kunci Sumber'];

    existingRows.forEach(function(row, index) {
      keyToIndex[rowKeyFromSheetRow_(row, headerIndexes)] = index;
      if (sourceKeyColumn !== undefined && row[sourceKeyColumn]) keyToIndex['source:' + row[sourceKeyColumn]] = index;
    });

    const batchId = Utilities.getUuid();
    const capturedAt = payload.capturedAt || new Date().toISOString();
    const pageUrl = payload.pageUrl || '';
    const source = payload.source || 'satu-kemenkeu';
    const seen = {};
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    records.forEach(function(record) {
      const normalized = collectorRecordToRow_(record || {}, {
        batchId: batchId,
        capturedAt: capturedAt,
        pageUrl: pageUrl,
        source: source,
        section: payload.section || ''
      });

      if (!normalized.idKegiatan || !normalized.namaKegiatan) {
        skipped++;
        return;
      }

      const sourceKey = normalized.sourceRecordKey || rowKey_(normalized);
      if (seen[sourceKey]) {
        skipped++;
        return;
      }
      seen[sourceKey] = true;

      const lookupKey = keyToIndex['source:' + sourceKey] !== undefined
        ? 'source:' + sourceKey
        : rowKey_(normalized);
      const normalizedObject = rowObject_(normalized);
      const rowValues = headers.map(function(header) {
        return normalizedObject[header] !== undefined ? normalizedObject[header] : '';
      });

      if (keyToIndex[lookupKey] !== undefined) {
        const rowIndex = keyToIndex[lookupKey];
        existingRows[rowIndex] = mergeCollectorRow_(existingRows[rowIndex], rowValues, headers);
        keyToIndex['source:' + sourceKey] = rowIndex;
        updated++;
      } else {
        const rowIndex = existingRows.length;
        existingRows.push(rowValues);
        keyToIndex[rowKey_(normalized)] = rowIndex;
        keyToIndex['source:' + sourceKey] = rowIndex;
        inserted++;
      }
    });

    if (existingRows.length > 0) {
      sh.getRange(2, 1, existingRows.length, headers.length).setValues(existingRows);
    }

    appendSyncLog_({
      batchId: batchId,
      capturedAt: capturedAt,
      source: source,
      section: payload.section || inferCollectorSection_(records[0] || {}),
      pageUrl: pageUrl,
      totalSourceRows: Number(payload.totalSourceRows) || records.length,
      received: records.length,
      inserted: inserted,
      updated: updated,
      skipped: skipped
    });
    refreshAkun_();

    return out_({
      success: true,
      batchId: batchId,
      inserted: inserted,
      updated: updated,
      skipped: skipped,
      received: records.length
    });
  } finally {
    lock.releaseLock();
  }
}

function collectorRecordToRow_(record, context) {
  const stage = normalizeCollectorStage_(record.stage || record.sourceSection || context.section);
  const status = String(record.status || record.sourceStatus || '').trim();
  const tanggal = record.tanggalKegiatan || joinDateRange_(record.tanggalMulai, record.tanggalSelesai);
  const sourceRecordKey = record.sourceRecordKey || [
    stage,
    record.idKegiatan || '',
    record.nomorST || '',
    record.namaPegawai || record.nomorReferensi || 'kegiatan'
  ].map(normalizeKeyPart_).join('|');

  return {
    tahap: stage,
    idKegiatan: String(record.idKegiatan || '').trim(),
    namaKegiatan: String(record.namaKegiatan || '').trim(),
    nomorST: String(record.nomorST || '').trim(),
    nomorKegiatan: String(record.nomorKegiatan || record.nomorReferensi || '').trim(),
    nka: String(record.nka || '').trim(),
    tanggalKegiatan: String(tanggal || '').trim(),
    tujuan: String(record.tujuan || '').trim(),
    kotaTujuan: String(record.kotaTujuan || '').trim(),
    output: String(record.output || '').trim(),
    jenisPembayaran: String(record.jenisPembayaran || '').trim(),
    namaPegawai: String(record.namaPegawai || '').trim(),
    lamaHari: Number(record.lamaHari) || 1,
    uangHarianPerHari: Number(record.uangHarianPerHari) || 0,
    totalUangHarian: Number(record.totalUangHarian) || 0,
    uangMuka: Number(record.uangMuka) || 0,
    totalEstimasiBiaya: Number(record.totalEstimasiBiaya) || 0,
    totalPengeluaranRiil: Number(record.totalPengeluaranRiil) || 0,
    kurangLebihBayar: Number(record.kurangLebihBayar) || 0,
    statusPJ: stage === 'Pertanggungjawaban' ? normalizeResponsibilityStatus_(status) : 'Belum Lengkap',
    statusPersetujuan: stage === 'Persetujuan' || stage === 'Kegiatan' ? status : '',
    statusGeotag: String(record.statusGeotag || '').trim(),
    start: String(record.start || '').trim(),
    clockIn: String(record.clockIn || '').trim(),
    clockOut: String(record.clockOut || '').trim(),
    end: String(record.end || '').trim(),
    volume: Number(record.volume) || 1,
    nilaiRiil: Number(record.nilaiRiil || record.totalPengeluaranRiil || record.totalEstimasiBiaya) || 0,
    kodeAkun: String(record.kodeAkun || '').trim(),
    detailGeotag: String(record.detailGeotag || '').trim(),
    tanggalInput: new Date(),
    keterangan: String(record.keterangan || '').trim(),
    jenisPerjadin: String(record.jenisPerjadin || '').trim(),
    sumberData: context.source,
    sourceUrl: record.sourceUrl || context.pageUrl,
    waktuRekamSumber: record.capturedAt || context.capturedAt,
    batchId: context.batchId,
    sourceRecordKey: sourceRecordKey
  };
}

function mergeCollectorRow_(current, incoming, headers) {
  return headers.map(function(header, index) {
    const next = incoming[index];
    if (next === '' || next === null || next === undefined) return current[index];
    if (header === 'Tanggal Input' && current[index]) return current[index];
    return next;
  });
}

function normalizeCollectorStage_(value) {
  const text = String(value || '').toLowerCase();
  if (text.indexOf('pertanggung') >= 0) return 'Pertanggungjawaban';
  if (text.indexOf('persetujuan') >= 0) return 'Persetujuan';
  if (text.indexOf('pelaksanaan') >= 0) return 'Pelaksanaan';
  return 'Kegiatan';
}

function normalizeResponsibilityStatus_(value) {
  const text = String(value || '').toLowerCase();
  if (text.indexOf('belum') >= 0) return 'Belum Lengkap';
  if (text.indexOf('disetujui') >= 0) return 'Disetujui';
  if (text.indexOf('lengkap') >= 0 || text.indexOf('tervalidasi') >= 0) return 'Lengkap';
  return 'Belum Lengkap';
}

function joinDateRange_(start, end) {
  if (!start) return end || '';
  if (!end || start === end) return start;
  return start + ' s/d ' + end;
}

function inferCollectorSection_(record) {
  return normalizeCollectorStage_(record.stage || record.sourceSection || 'Kegiatan');
}

function appendSyncLog_(entry) {
  const sh = sheet_(SYNC_SHEET_NAME, HEADERS_SYNC);
  const total = Number(entry.totalSourceRows) || 0;
  const coverage = total > 0 ? Math.min(100, Math.round((Number(entry.received) || 0) / total * 10000) / 100) : 0;
  sh.appendRow([
    entry.batchId,
    entry.capturedAt,
    new Date(),
    entry.source,
    entry.section,
    entry.pageUrl,
    total,
    entry.received,
    entry.inserted,
    entry.updated,
    entry.skipped,
    coverage
  ]);
}

function syncSummary_() {
  const sh = ss_().getSheetByName(SYNC_SHEET_NAME);
  if (!sh || sh.getLastRow() <= 1) return { lastSync: null, batches: [] };
  const rows = readExistingSheet_(sh);
  return {
    lastSync: rows.length > 0 ? rows[rows.length - 1] : null,
    batches: rows.slice(Math.max(0, rows.length - 20)).reverse()
  };
}

function saveAccounts_(accounts) {
  const sh = sheet_(ACCOUNT_SHEET_NAME, HEADERS_AKUN);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS_AKUN.length).clearContent();

  const rows = accounts.map(function(account) {
    return [
      account.kode || account['Kode Akun'] || '',
      account.nama || account['Nama Akun'] || '',
      Number(account.pagu || account.Pagu) || 0,
      Number(account.realisasi || account.Realisasi) || 0,
      Number(account.komitmen || account.Komitmen) || 0,
      Number(account.saldo || account.Saldo) || 0
    ];
  }).filter(function(row) { return row[0]; });

  if (rows.length > 0) sh.getRange(2, 1, rows.length, HEADERS_AKUN.length).setValues(rows);
  refreshAkun_();
  return out_({ success: true, message: 'Accounts saved', count: rows.length });
}

function rowObject_(r) {
  const nka = r.nka || r.nomorKegiatan || '';
  const kurangLebih = r.kurangLebihBayar || 0;
  const buktiGeotag = r.statusGeotag === 'Lengkap' ? 'Lengkap' : 'Belum Lengkap';

  return {
    'ID Kegiatan': r.idKegiatan || '',
    'Nama Kegiatan': r.namaKegiatan || '',
    'Nomor ST': r.nomorST || '',
    'NKA/Nomor Kegiatan': nka,
    'NKA / Nomor Kegiatan': nka,
    'Tanggal Kegiatan': r.tanggalKegiatan || '',
    'Tujuan': r.tujuan || '',
    'Nama Pegawai': r.namaPegawai || '',
    'Lama (Hari)': r.lamaHari || 1,
    'Uang Harian per Hari': r.uangHarianPerHari || 0,
    'Total Uang Harian': r.totalUangHarian || 0,
    'Uang Muka': r.uangMuka || 0,
    'Total Pengeluaran Riil': r.totalPengeluaranRiil || 0,
    'Kurang/Lebih Bayar': kurangLebih,
    'Kurang / Lebih Bayar': kurangLebih,
    'Status Pertanggungjawaban': r.statusPJ || 'Belum Lengkap',
    'Status PJ': r.statusPJ || 'Belum Lengkap',
    'Status Geotag': r.statusGeotag || '',
    'Detail Geotag': r.detailGeotag || '',
    'Tanggal Input': r.tanggalInput || new Date(),
    'START': r.start || '',
    'CLOCK IN': r.clockIn || '',
    'CLOCK OUT': r.clockOut || '',
    'END': r.end || '',
    'VOLUME': r.volume || 1,
    'NILAI RIIL': r.nilaiRiil || r.totalEstimasiBiaya || r.totalPengeluaranRiil || 0,
    'Kode Akun': r.kodeAkun || '',
    'Tahap Data': r.tahap || 'Pertanggungjawaban',
    'Status Persetujuan': r.statusPersetujuan || '',
    'Nomor Kegiatan KPD': r.nomorKegiatan || '',
    'Output': r.output || '',
    'Kota Tujuan': r.kotaTujuan || '',
    'Jenis Pembayaran': r.jenisPembayaran || '',
    'Total Estimasi Biaya': r.totalEstimasiBiaya || 0,
    'Total Uang Muka': r.totalUangMuka || r.uangMuka || 0,
    'BUKTI DUKUNG\nSURAT PERNYATAAN GEOTAG': buktiGeotag,
    'Keterangan': r.keterangan || '',
    'Jenis Perjadin': r.jenisPerjadin || '',
    'Sumber Data': r.sumberData || '',
    'URL Sumber': r.sourceUrl || '',
    'Waktu Rekam Sumber': r.waktuRekamSumber || '',
    'Batch Sinkronisasi': r.batchId || '',
    'Kunci Sumber': r.sourceRecordKey || ''
  };
}

function ensureAccounts_() {
  const sh = sheet_(ACCOUNT_SHEET_NAME, HEADERS_AKUN);
  if (sh.getLastRow() <= 1) {
    sh.getRange(2, 1, DEFAULT_ACCOUNTS.length, HEADERS_AKUN.length).setValues(DEFAULT_ACCOUNTS);
    return;
  }

  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    const kode = values[i][0];
    const master = DEFAULT_ACCOUNTS.find(function(account) { return account[0] === kode; });
    if (!master) continue;

    sh.getRange(i + 1, 2, 1, 2).setValues([[master[1], master[2]]]);
  }
}

function refreshAkun_() {
  const akunSheet = sheet_(ACCOUNT_SHEET_NAME, HEADERS_AKUN);
  const dataSheet = dataSheetForRead_() || sheet_(DATA_SHEET_NAME, HEADERS_DATA);
  const akunRows = akunSheet.getDataRange().getValues();
  const dataRows = dataSheet.getDataRange().getValues();
  if (akunRows.length <= 1) return;

  const dataHeaders = headerMap_(dataSheet);
  const records = dataRows.slice(1).map(function(row) {
    return {
      idKegiatan: row[dataHeaders['ID Kegiatan']] || '',
      nomorST: row[dataHeaders['Nomor ST']] || '',
      kodeAkun: row[dataHeaders['Kode Akun']] || '',
      tahap: row[dataHeaders['Tahap Data']] || 'Pertanggungjawaban',
      statusPJ: row[dataHeaders['Status Pertanggungjawaban']] || 'Belum Lengkap',
      nilai: Number(row[dataHeaders['NILAI RIIL']] || row[dataHeaders['Total Estimasi Biaya']] || row[dataHeaders['Total Pengeluaran Riil']]) || 0
    };
  }).filter(function(record) { return record.kodeAkun; });

  for (let i = 1; i < akunRows.length; i++) {
    const kode = akunRows[i][0];
    const pagu = Number(akunRows[i][2]) || 0;
    const grouped = {};
    records.filter(function(record) { return record.kodeAkun === kode; }).forEach(function(record) {
      const key = [record.idKegiatan, record.nomorST, record.kodeAkun].join('|');
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(record);
    });

    let realisasi = 0;
    let komitmen = 0;
    Object.keys(grouped).forEach(function(key) {
      const group = grouped[key];
      const pjRows = group.filter(function(record) { return record.tahap === 'Pertanggungjawaban'; });
      if (pjRows.length > 0) {
        realisasi += pjRows.filter(function(record) { return record.statusPJ === 'Disetujui'; }).reduce(function(sum, record) { return sum + record.nilai; }, 0);
        komitmen += pjRows.filter(function(record) { return record.statusPJ !== 'Disetujui'; }).reduce(function(sum, record) { return sum + record.nilai; }, 0);
      } else {
        komitmen += group.filter(function(record) { return record.tahap === 'Persetujuan'; }).reduce(function(sum, record) { return sum + record.nilai; }, 0);
      }
    });

    akunSheet.getRange(i + 1, 4, 1, 3).setValues([[realisasi, komitmen, pagu - realisasi - komitmen]]);
  }
}

function readSheet_(name, headers) {
  const sh = sheet_(name, headers);
  if (!sh || sh.getLastRow() === 0) return [];
  return readExistingSheet_(sh);
}

function readExistingSheet_(sh) {
  if (!sh || sh.getLastRow() === 0) return [];
  const values = sh.getDataRange().getValues();
  const rowHeaders = values.shift();
  return values.filter(function(row) {
    return row.some(function(cell) { return cell !== '' && cell !== null; });
  }).map(function(row) {
    const obj = {};
    rowHeaders.forEach(function(header, index) {
      obj[header] = row[index];
    });
    return obj;
  });
}

function dataSheetForRead_() {
  const ss = ss_();
  const primary = ss.getSheetByName(DATA_SHEET_NAME);
  if (sheetHasRows_(primary)) return primary;

  const preferredNames = [
    'Data Master',
    'DATA MASTER',
    'Data Perjadin',
    'DATA PERJADIN',
    'MASTER',
    'Sheet1'
  ];

  for (let i = 0; i < preferredNames.length; i++) {
    const candidate = ss.getSheetByName(preferredNames[i]);
    if (sheetHasRows_(candidate) && candidate.getName() !== ACCOUNT_SHEET_NAME) return candidate;
  }

  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const sh = sheets[i];
    if (sh.getName() === ACCOUNT_SHEET_NAME) continue;
    if (sheetHasRows_(sh)) return sh;
  }

  return primary || sheet_(DATA_SHEET_NAME, HEADERS_DATA);
}

function sheetHasRows_(sh) {
  return !!sh && sh.getLastRow() > 1 && sh.getLastColumn() > 0;
}

function headerMap_(sh) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach(function(header, index) {
    map[header] = index;
  });
  return map;
}

function requireAccess_(body) {
  const props = PropertiesService.getScriptProperties();
  const expectedPinHash = props.getProperty('E_PERJADIN_PIN_HASH');
  const legacyToken = props.getProperty('E_PERJADIN_TOKEN');
  if (!expectedPinHash && !legacyToken) {
    return {
      success: false,
      message: 'PIN belum disetel. Isi Script Properties E_PERJADIN_PIN_HASH sebelum deploy.'
    };
  }

  const received = body && (body.accessCode || body.token) ? String(body.accessCode || body.token) : '';
  if (expectedPinHash && sha256Hex_(received) === expectedPinHash) {
    return { success: true };
  }

  if (legacyToken && received === legacyToken) {
    return { success: true };
  }

  return { success: false, message: 'PIN akses tidak valid' };
}

function sha256Hex_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8);
  return bytes.map(function(byte) {
    const v = byte < 0 ? byte + 256 : byte;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function generatePinHashForSetup() {
  const pin = 'ganti-dengan-pin-anda';
  Logger.log(sha256Hex_(pin));
}

function normalizeKeyPart_(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w.\/-]+/g, '');
}

function stableHash_(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function rowKey_(r) {
  const pegawaiAtauKegiatan = r.namaPegawai || r.nomorKegiatan || r.nka || 'kegiatan';
  const normalized = [
    r.tahap || 'Pertanggungjawaban',
    r.idKegiatan,
    r.nomorST,
    pegawaiAtauKegiatan
  ].map(normalizeKeyPart_).join('|');
  return normalized + '|' + stableHash_(normalized);
}

function rowKeyFromSheetRow_(row, headers) {
  const pegawaiAtauKegiatan =
    row[headers['Nama Pegawai']] ||
    row[headers['Nomor Kegiatan KPD']] ||
    row[headers['NKA/Nomor Kegiatan']] ||
    row[headers['NKA / Nomor Kegiatan']] ||
    'kegiatan';

  return rowKey_({
    tahap: row[headers['Tahap Data']] || 'Pertanggungjawaban',
    idKegiatan: row[headers['ID Kegiatan']],
    nomorST: row[headers['Nomor ST']],
    namaPegawai: pegawaiAtauKegiatan
  });
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
