const SPREADSHEET_ID = '1fkXASbZbnPCZeW2FSxteE-oOnacVuJRCxQ8zWOgPRh8';

const V4_SUMMARY_SHEET = 'EPERJADIN_V4';
const V4_COMPONENT_SHEET = 'EPERJADIN_KOMPONEN';
const V4_ROUTE_SHEET = 'EPERJADIN_RUTE';
const V4_PRESENCE_SHEET = 'EPERJADIN_PRESENSI';
const ACCOUNT_SHEET = 'AKUN_ANGGARAN';
const DRIVE_FOLDER_ID_V4 = '1i0Ik4ZQ3AnyDBagJ-N0imljCusrBDVm0';

const V4_SUMMARY_HEADERS = [
  'Kunci SPD','ID Kegiatan','Nama Kegiatan','Nomor ST','Lampiran ST','Nomor Kegiatan',
  'DIPA Inisiator','PPK','Pelaksana SPD','NIP','Nomor SPD','Nomor Perjalanan',
  'Jumlah Rute','Tujuan Utama','Tanggal Mulai','Tanggal Selesai','Durasi Hari','Menginap',
  'Uang Muka','Total Pengeluaran Riil','Total Komponen Dikirim','Selisih Komponen',
  'Status Validasi','Kode Akun','Nama Akun','Status Pertanggungjawaban','Status Geotag','Kekurangan Dokumen','Dokumen Pendukung',
  'Jumlah Presensi','START','CLOCK IN','CLOCK OUT','END','Detail Geotag','Tanggal Input',
  'Sumber Data','Waktu Rekam Sumber','Schema Version','Raw Hash'
];

const V4_COMPONENT_HEADERS = [
  'Kunci Komponen','Kunci SPD','ID Kegiatan','Nomor SPD','Pelaksana SPD','Rute Ke',
  'Komponen Biaya','Status Komponen','Nilai Riil','Nilai SBM','Bukti Dukung','Keterangan',
  'Urutan Komponen','Tanggal Input','Waktu Rekam Sumber'
];

const V4_ROUTE_HEADERS = [
  'Kunci Rute','Kunci SPD','Nomor SPD','Pelaksana SPD','Rute Ke','Tujuan',
  'Tanggal Mulai','Tanggal Selesai','Durasi Hari','Menginap','Tanggal Input'
];

const V4_PRESENCE_HEADERS = [
  'Kunci Presensi','Kunci SPD','Nomor SPD','Pelaksana SPD','Urutan','Tanggal',
  'Waktu','Wilayah','Lokasi Geo Tagging','Klasifikasi','Tanggal Input'
];

function ssV4_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function doGet(e) {
  try {
    setupEperjadinV4();
    var action = e && e.parameter ? String(e.parameter.action || '').trim() : '';
    if (action === 'ping') return jsonV4_({ success: true, message: 'OK', version: 4 });
    // GET dipakai dashboard agar aman melewati redirect Web App Apps Script.
    return dashboardV4_();
  } catch (err) {
    return jsonV4_({ success: false, message: errorMessageV4_(err) });
  }
}

function doPost(e) {
  try {
    setupEperjadinV4();
    const body = parseBodyV4_(e);
    const action = String(body.action || '').trim();

    if (action === 'ping') {
      return jsonV4_({ success: true, message: 'OK', version: 4 });
    }
    if (action === 'getDashboard' || action === 'getDashboardV4') {
      return dashboardV4_();
    }
    if (action === 'upsertPerjadin' || action === 'upsertPerjadinV4') {
      return upsertPerjadinV4_(body.row || body.payload || {});
    }
    if (action === 'deletePerjadinV4') {
      return deletePerjadinV4_(body.kunciSPD || (body.row && body.row.kunciSPD) || '');
    }
    if (action === 'updateStatusV4') return updateStatusV4_(body);
    if (action === 'uploadDocumentV4') return uploadDocumentV4_(body);

    return jsonV4_({ success: false, message: 'Action tidak dikenali: ' + action });
  } catch (err) {
    return jsonV4_({ success: false, message: errorMessageV4_(err) });
  }
}

function setupEperjadinV4() {
  const ss = ssV4_();
  ensureSheetV4_(ss, V4_SUMMARY_SHEET, V4_SUMMARY_HEADERS);
  ensureSheetV4_(ss, V4_COMPONENT_SHEET, V4_COMPONENT_HEADERS);
  ensureSheetV4_(ss, V4_ROUTE_SHEET, V4_ROUTE_HEADERS);
  ensureSheetV4_(ss, V4_PRESENCE_SHEET, V4_PRESENCE_HEADERS);
  return true;
}

function ensureSheetV4_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  const currentCols = Math.max(sh.getLastColumn(), headers.length, 1);
  const existing = sh.getLastRow() > 0
    ? sh.getRange(1, 1, 1, currentCols).getValues()[0]
    : [];

  let needsHeader = sh.getLastRow() === 0;
  if (!needsHeader) {
    const existingNames = existing.map(function(v) { return String(v || '').trim(); });
    needsHeader = headers.some(function(h) { return existingNames.indexOf(h) === -1; });
  }

  if (needsHeader) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  const header = sh.getRange(1, 1, 1, headers.length);
  header.setFontWeight('bold').setBackground('#0B5CAB').setFontColor('#FFFFFF').setWrap(true);
  sh.setFrozenRows(1);
  return sh;
}

function dashboardV4_() {
  const ss = ssV4_();
  return jsonV4_({
    success: true,
    version: 4,
    data: readSheetObjectsV4_(ss.getSheetByName(V4_SUMMARY_SHEET)),
    components: readSheetObjectsV4_(ss.getSheetByName(V4_COMPONENT_SHEET)),
    routes: readSheetObjectsV4_(ss.getSheetByName(V4_ROUTE_SHEET)),
    presences: readSheetObjectsV4_(ss.getSheetByName(V4_PRESENCE_SHEET)),
    akun: ss.getSheetByName(ACCOUNT_SHEET) ? readSheetObjectsV4_(ss.getSheetByName(ACCOUNT_SHEET)) : []
  });
}

function upsertPerjadinV4_(input) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    if (!input || typeof input !== 'object') {
      return jsonV4_({ success: false, message: 'Payload row tidak valid.' });
    }

    const normalized = normalizePayloadV4_(input);
    if (!normalized.idKegiatan) return jsonV4_({ success: false, message: 'ID Kegiatan wajib ada.' });
    if (!normalized.nomorSPD) return jsonV4_({ success: false, message: 'Nomor SPD wajib ada.' });
    if (!normalized.pelaksanaSPD) return jsonV4_({ success: false, message: 'Pelaksana SPD wajib ada.' });

    const ss = ssV4_();
    const summarySheet = ss.getSheetByName(V4_SUMMARY_SHEET);
    const componentSheet = ss.getSheetByName(V4_COMPONENT_SHEET);
    const routeSheet = ss.getSheetByName(V4_ROUTE_SHEET);
    const presenceSheet = ss.getSheetByName(V4_PRESENCE_SHEET);

    const summaryRow = buildSummaryObjectV4_(normalized);
    const targetRow = upsertObjectByKeyV4_(summarySheet, V4_SUMMARY_HEADERS, 'Kunci SPD', normalized.kunciSPD, summaryRow);

    replaceChildrenV4_(componentSheet, V4_COMPONENT_HEADERS, 'Kunci SPD', normalized.kunciSPD,
      normalized.components.map(function(item, index) {
        return buildComponentObjectV4_(normalized, item, index + 1);
      })
    );

    replaceChildrenV4_(routeSheet, V4_ROUTE_HEADERS, 'Kunci SPD', normalized.kunciSPD,
      normalized.routes.map(function(item, index) {
        return buildRouteObjectV4_(normalized, item, index + 1);
      })
    );

    replaceChildrenV4_(presenceSheet, V4_PRESENCE_HEADERS, 'Kunci SPD', normalized.kunciSPD,
      normalized.geotags.map(function(item, index) {
        return buildPresenceObjectV4_(normalized, item, index + 1);
      })
    );

    applySummaryFormulasV4_(summarySheet, targetRow);
    SpreadsheetApp.flush();

    const sentTotal = normalized.components.reduce(function(sum, item) {
      return sum + (isSentStatusV4_(item.status) ? numberV4_(item.nilaiRiil) : 0);
    }, 0);

    return jsonV4_({
      success: true,
      message: 'Tersimpan ke ePerjadin V4',
      kunciSPD: normalized.kunciSPD,
      summaryRow: targetRow,
      components: normalized.components.length,
      routes: normalized.routes.length,
      presences: normalized.geotags.length,
      totalPengeluaranRiil: normalized.totalPengeluaranRiil,
      totalKomponenDikirim: sentTotal,
      selisih: normalized.totalPengeluaranRiil - sentTotal
    });
  } finally {
    lock.releaseLock();
  }
}

function normalizePayloadV4_(r) {
  const idKegiatan = textV4_(r.idKegiatan);
  const nomorSPD = textV4_(r.nomorSPD || r.nka);
  const kunciSPD = textV4_(r.kunciSPD) || (normalizeKeyV4_(idKegiatan) + '|' + normalizeKeyV4_(nomorSPD));
  const routes = Array.isArray(r.routes) ? r.routes : [];
  const geotags = Array.isArray(r.geotags) ? r.geotags : [];
  const components = Array.isArray(r.components) ? r.components : [];
  const firstRoute = routes.length ? routes[0] : {};
  const tanggalInput = textV4_(r.tanggalInput) || Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'dd-MM-yyyy');
  const waktuRekam = textV4_(r.waktuRekamSumber) || new Date().toISOString();

  return {
    kunciSPD: kunciSPD,
    idKegiatan: idKegiatan,
    namaKegiatan: textV4_(r.namaKegiatan),
    nomorST: textV4_(r.nomorST),
    lampiranST: Array.isArray(r.lampiranST) ? r.lampiranST.join(' | ') : textV4_(r.lampiranST),
    nomorKegiatan: dashToBlankV4_(r.nomorKegiatan),
    dipaInisiator: textV4_(r.dipaInisiator || r.jenisPembayaran),
    ppk: textV4_(r.ppk),
    pelaksanaSPD: textV4_(r.peserta || r.pelaksanaSPD || r.namaPegawai),
    nip: textV4_(r.nip),
    nomorSPD: nomorSPD,
    nomorPerjalanan: dashToBlankV4_(r.nomorPerjalanan),
    jumlahRute: numberV4_(r.jumlahRute) || routes.length || 1,
    tujuanUtama: textV4_(r.tujuan || r.tujuanUtama || firstRoute.tujuan),
    tanggalMulai: textV4_(r.tanggalMulai || firstRoute.tanggalMulai),
    tanggalSelesai: textV4_(r.tanggalSelesai || firstRoute.tanggalSelesai),
    durasiHari: numberV4_(r.durasiHari || r.lamaHari || firstRoute.durasiHari) || 1,
    menginap: textV4_(r.menginap) || 'Tidak Terbaca',
    uangMuka: numberV4_(r.uangMuka),
    totalPengeluaranRiil: numberV4_(r.totalPengeluaranRiil || r.totalNilaiRiil || r.nilaiRiil),
    kodeAkun: textV4_(r.kodeAkun),
    namaAkun: textV4_(r.namaAkun) || lookupAccountNameV4_(r.kodeAkun),
    statusPJ: textV4_(r.statusPJ || r.statusPertanggungjawaban) || 'Belum Ditentukan',
    statusGeotag: textV4_(r.statusGeotag) || 'Belum Dinilai',
    start: textV4_(r.start),
    clockIn: textV4_(r.clockIn),
    clockOut: textV4_(r.clockOut),
    end: textV4_(r.end),
    detailGeotag: textV4_(r.detailGeotag),
    tanggalInput: tanggalInput,
    sumberData: textV4_(r.sumberData) || 'Input parsing ePerjadin v4',
    waktuRekamSumber: waktuRekam,
    schemaVersion: numberV4_(r.schemaVersion) || 4,
    rawHash: textV4_(r.rawHash),
    routes: routes,
    geotags: geotags,
    components: components
  };
}

function buildSummaryObjectV4_(r) {
  return {
    'Kunci SPD': r.kunciSPD,
    'ID Kegiatan': r.idKegiatan,
    'Nama Kegiatan': r.namaKegiatan,
    'Nomor ST': r.nomorST,
    'Lampiran ST': r.lampiranST,
    'Nomor Kegiatan': r.nomorKegiatan,
    'DIPA Inisiator': r.dipaInisiator,
    'PPK': r.ppk,
    'Pelaksana SPD': r.pelaksanaSPD,
    'NIP': r.nip,
    'Nomor SPD': r.nomorSPD,
    'Nomor Perjalanan': r.nomorPerjalanan,
    'Jumlah Rute': r.jumlahRute,
    'Tujuan Utama': r.tujuanUtama,
    'Tanggal Mulai': r.tanggalMulai,
    'Tanggal Selesai': r.tanggalSelesai,
    'Durasi Hari': r.durasiHari,
    'Menginap': r.menginap,
    'Uang Muka': r.uangMuka,
    'Total Pengeluaran Riil': r.totalPengeluaranRiil,
    'Total Komponen Dikirim': '',
    'Selisih Komponen': '',
    'Status Validasi': '',
    'Kode Akun': r.kodeAkun,
    'Nama Akun': r.namaAkun,
    'Status Pertanggungjawaban': r.statusPJ,
    'Status Geotag': r.statusGeotag,
    'Kekurangan Dokumen': r.kekuranganDokumen,
    'Dokumen Pendukung': r.dokumenPendukung,
    'Jumlah Presensi': r.geotags.length,
    'START': r.start,
    'CLOCK IN': r.clockIn,
    'CLOCK OUT': r.clockOut,
    'END': r.end,
    'Detail Geotag': r.detailGeotag,
    'Tanggal Input': r.tanggalInput,
    'Sumber Data': r.sumberData,
    'Waktu Rekam Sumber': r.waktuRekamSumber,
    'Schema Version': r.schemaVersion,
    'Raw Hash': r.rawHash
  };
}

function updateStatusV4_(input) {
  const key = textV4_(input.kunciSPD);
  if (!key) return jsonV4_({ success: false, message: 'Kunci SPD wajib ada.' });
  const ss = ssV4_();
  const sh = ensureSheetV4_(ss, V4_SUMMARY_SHEET, V4_SUMMARY_HEADERS);
  const map = headerMapV4_(sh);
  const row = findRowByValueV4_(sh, 'Kunci SPD', key);
  if (!row) return jsonV4_({ success: false, message: 'SPD tidak ditemukan.' });
  if (input.status !== undefined && map['Status Pertanggungjawaban'] !== undefined) sh.getRange(row, map['Status Pertanggungjawaban'] + 1).setValue(textV4_(input.status));
  if (input.kekuranganDokumen !== undefined && map['Kekurangan Dokumen'] !== undefined) sh.getRange(row, map['Kekurangan Dokumen'] + 1).setValue(textV4_(input.kekuranganDokumen));
  return jsonV4_({ success: true, message: 'Monitoring SPD diperbarui.', kunciSPD: key });
}

function uploadDocumentV4_(input) {
  const key = textV4_(input.kunciSPD);
  const fileName = textV4_(input.fileName);
  const mimeType = textV4_(input.mimeType) || 'application/octet-stream';
  const base64 = textV4_(input.base64);
  if (!key || !fileName || !base64) return jsonV4_({ success: false, message: 'SPD, nama file, dan isi file wajib ada.' });
  const folder = getDriveFolderV4_();
  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, mimeType, key.replace(/[^a-zA-Z0-9_-]/g, '_') + '_' + fileName);
  const file = folder.createFile(blob);
  file.setDescription('Dokumen pendukung E-Perjadin - ' + key);
  const sh = ensureSheetV4_(ssV4_(), V4_SUMMARY_SHEET, V4_SUMMARY_HEADERS);
  const row = findRowByValueV4_(sh, 'Kunci SPD', key);
  if (row) {
    const map = headerMapV4_(sh);
    const cell = sh.getRange(row, map['Dokumen Pendukung'] + 1);
    const previous = textV4_(cell.getValue());
    cell.setValue(previous ? previous + ' | ' + file.getUrl() : file.getUrl());
  }
  return jsonV4_({ success: true, message: 'Dokumen berhasil diunggah ke Google Drive.', url: file.getUrl(), name: file.getName() });
}

function getDriveFolderV4_() {
  return DriveApp.getFolderById(DRIVE_FOLDER_ID_V4);
}

function findRowByValueV4_(sh, headerName, value) {
  if (!sh || sh.getLastRow() <= 1) return 0;
  const map = headerMapV4_(sh);
  const index = map[headerName];
  if (index === undefined) return 0;
  const values = sh.getRange(2, index + 1, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) if (textV4_(values[i][0]) === value) return i + 2;
  return 0;
}

function buildComponentObjectV4_(parent, item, index) {
  const name = textV4_(item.nama || item.komponen || item.komponenBiaya || item.name) || ('Komponen ' + index);
  const routeNo = numberV4_(item.nomorRute || item.ruteKe || item.routeNo) || 1;
  const key = parent.kunciSPD + '|' + routeNo + '|' + index + '|' + normalizeKeyV4_(name);
  return {
    'Kunci Komponen': key,
    'Kunci SPD': parent.kunciSPD,
    'ID Kegiatan': parent.idKegiatan,
    'Nomor SPD': parent.nomorSPD,
    'Pelaksana SPD': parent.pelaksanaSPD,
    'Rute Ke': routeNo,
    'Komponen Biaya': name,
    'Status Komponen': textV4_(item.status || item.statusKomponen),
    'Nilai Riil': numberV4_(item.nilaiRiil || item.totalNilaiRiil || item.value),
    'Nilai SBM': numberV4_(item.nilaiSBM),
    'Bukti Dukung': Array.isArray(item.buktiDukung) ? item.buktiDukung.join(' | ') : textV4_(item.buktiDukung),
    'Keterangan': textV4_(item.keterangan),
    'Urutan Komponen': index,
    'Tanggal Input': parent.tanggalInput,
    'Waktu Rekam Sumber': parent.waktuRekamSumber
  };
}

function buildRouteObjectV4_(parent, item, index) {
  const routeNo = numberV4_(item.nomorRute || item.ruteKe) || index;
  return {
    'Kunci Rute': parent.kunciSPD + '|' + routeNo,
    'Kunci SPD': parent.kunciSPD,
    'Nomor SPD': parent.nomorSPD,
    'Pelaksana SPD': parent.pelaksanaSPD,
    'Rute Ke': routeNo,
    'Tujuan': textV4_(item.tujuan),
    'Tanggal Mulai': textV4_(item.tanggalMulai),
    'Tanggal Selesai': textV4_(item.tanggalSelesai),
    'Durasi Hari': numberV4_(item.durasiHari),
    'Menginap': textV4_(item.menginap || parent.menginap) || 'Tidak Terbaca',
    'Tanggal Input': parent.tanggalInput
  };
}

function buildPresenceObjectV4_(parent, item, index) {
  const tanggal = textV4_(item.hariTanggal || item.tanggal);
  const waktu = textV4_(item.waktuTagging || item.waktu);
  const wilayah = textV4_(item.wilayahTagging || item.wilayah);
  return {
    'Kunci Presensi': parent.kunciSPD + '|' + normalizeKeyV4_(tanggal) + '|' + normalizeKeyV4_(waktu) + '|' + index,
    'Kunci SPD': parent.kunciSPD,
    'Nomor SPD': parent.nomorSPD,
    'Pelaksana SPD': parent.pelaksanaSPD,
    'Urutan': index,
    'Tanggal': tanggal,
    'Waktu': waktu,
    'Wilayah': wilayah,
    'Lokasi Geo Tagging': textV4_(item.lokasiTagging || item.lokasi),
    'Klasifikasi': textV4_(item.klasifikasi),
    'Tanggal Input': parent.tanggalInput
  };
}

function upsertObjectByKeyV4_(sh, headers, keyHeader, keyValue, obj) {
  const headerMap = headerMapV4_(sh);
  const keyIndex = headerMap[keyHeader];
  if (keyIndex === undefined) throw new Error('Header kunci tidak ditemukan: ' + keyHeader);

  const lastRow = sh.getLastRow();
  let targetRow = lastRow + 1;
  if (lastRow > 1) {
    const keys = sh.getRange(2, keyIndex + 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < keys.length; i++) {
      if (String(keys[i][0] || '').trim() === keyValue) {
        targetRow = i + 2;
        break;
      }
    }
  }

  const row = headers.map(function(h) { return obj[h] !== undefined ? obj[h] : ''; });
  sh.getRange(targetRow, 1, 1, headers.length).setValues([row]);
  return targetRow;
}

function replaceChildrenV4_(sh, headers, parentKeyHeader, parentKey, objects) {
  const headerMap = headerMapV4_(sh);
  const parentIndex = headerMap[parentKeyHeader];
  if (parentIndex === undefined) throw new Error('Header parent tidak ditemukan: ' + parentKeyHeader);

  const lastRow = sh.getLastRow();
  if (lastRow > 1) {
    const values = sh.getRange(2, 1, lastRow - 1, headers.length).getValues();
    const keep = values.filter(function(row) {
      return String(row[parentIndex] || '').trim() !== parentKey;
    });
    sh.getRange(2, 1, lastRow - 1, headers.length).clearContent();
    if (keep.length) sh.getRange(2, 1, keep.length, headers.length).setValues(keep);
  }

  if (objects.length) {
    const start = sh.getLastRow() + 1;
    const rows = objects.map(function(obj) {
      return headers.map(function(h) { return obj[h] !== undefined ? obj[h] : ''; });
    });
    sh.getRange(start, 1, rows.length, headers.length).setValues(rows);
  }
}

function applySummaryFormulasV4_(sh, row) {
  sh.getRange(row, 21).setFormula('=IF($A' + row + '="","",SUMIF(' + V4_COMPONENT_SHEET + '!$B:$B,$A' + row + ',' + V4_COMPONENT_SHEET + '!$I:$I))');
  sh.getRange(row, 22).setFormula('=IF($A' + row + '="","",$T' + row + '-$U' + row + ')');
  sh.getRange(row, 23).setFormula('=IF($A' + row + '="","",IF(ABS($V' + row + ')<1,"VALID","CEK"))');
}

function deletePerjadinV4_(key) {
  const kunci = textV4_(key);
  if (!kunci) return jsonV4_({ success: false, message: 'Kunci SPD wajib ada.' });
  const ss = ssV4_();
  deleteRowsByValueV4_(ss.getSheetByName(V4_COMPONENT_SHEET), 'Kunci SPD', kunci);
  deleteRowsByValueV4_(ss.getSheetByName(V4_ROUTE_SHEET), 'Kunci SPD', kunci);
  deleteRowsByValueV4_(ss.getSheetByName(V4_PRESENCE_SHEET), 'Kunci SPD', kunci);
  const deleted = deleteRowsByValueV4_(ss.getSheetByName(V4_SUMMARY_SHEET), 'Kunci SPD', kunci);
  return jsonV4_({ success: deleted > 0, message: deleted > 0 ? 'Data dihapus.' : 'Data tidak ditemukan.', deleted: deleted });
}

function deleteRowsByValueV4_(sh, headerName, value) {
  if (!sh || sh.getLastRow() <= 1) return 0;
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const idx = headers.indexOf(headerName);
  if (idx < 0) return 0;
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  const keep = [];
  let deleted = 0;
  data.forEach(function(row) {
    if (String(row[idx] || '').trim() === value) deleted++;
    else keep.push(row);
  });
  sh.getRange(2, 1, data.length, sh.getLastColumn()).clearContent();
  if (keep.length) sh.getRange(2, 1, keep.length, sh.getLastColumn()).setValues(keep);
  return deleted;
}

function lookupAccountNameV4_(code) {
  const normalized = textV4_(code);
  if (!normalized) return '';
  const sh = ssV4_().getSheetByName(ACCOUNT_SHEET);
  if (!sh || sh.getLastRow() <= 1) return '';
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, Math.min(sh.getLastColumn(), 2)).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === normalized) return String(data[i][1] || '').trim();
  }
  return '';
}

function readSheetObjectsV4_(sh) {
  if (!sh || sh.getLastRow() <= 1) return [];
  const values = sh.getDataRange().getDisplayValues();
  const headers = values[0];
  return values.slice(1).filter(function(row) {
    return row.some(function(v) { return String(v || '').trim() !== ''; });
  }).map(function(row) {
    const obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function headerMapV4_(sh) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach(function(h, i) { map[String(h || '').trim()] = i; });
  return map;
}

function isSentStatusV4_(status) {
  const s = textV4_(status).toLowerCase();
  return s === 'dikirim' || s === 'disetujui' || s === 'dibayar' || s === 'selesai';
}

function parseBodyV4_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  const raw = e.postData.contents;
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error('Body request bukan JSON yang valid.');
  }
}

function jsonV4_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function textV4_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function numberV4_(value) {
  if (typeof value === 'number' && isFinite(value)) return value;
  const text = textV4_(value);
  if (!text) return 0;
  const normalized = text
    .replace(/Rp/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = Number(normalized);
  return isFinite(n) ? n : 0;
}

function dashToBlankV4_(value) {
  const t = textV4_(value);
  return t === '-' || t === '\\-' ? '' : t;
}

function normalizeKeyV4_(value) {
  return textV4_(value).toLowerCase().replace(/\s+/g, ' ');
}

function errorMessageV4_(err) {
  return err && err.message ? err.message : String(err || 'Terjadi kesalahan.');
}
