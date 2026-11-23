const V4_SUMMARY_SHEET = 'EPERJADIN_V4';
const V4_COMPONENT_SHEET = 'EPERJADIN_KOMPONEN';
const V4_ROUTE_SHEET = 'EPERJADIN_RUTE';
const V4_PRESENCE_SHEET = 'EPERJADIN_PRESENSI';
const ACCOUNT_SHEET = 'AKUN_ANGGARAN';

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
  const id = PropertiesService.getScriptProperties().getProperty('EPERJADIN_SPREADSHEET_ID');
  if (!id) throw new Error('Target spreadsheet V5 belum dikonfigurasi.');
  return SpreadsheetApp.openById(id);
}

/**
 * ePerjadin V5 aman. Perlu OAuth Client ID + daftar email di Script Properties.
 * Token identitas Google harus dikirim dalam body POST dengan nama authIdToken.
 * GET tidak pernah mengembalikan data pegawai.
 */
function verifyGoogleIdentityV5_(idToken) {
  const props = PropertiesService.getScriptProperties();
  const expectedAudience = String(props.getProperty('EPERJADIN_OAUTH_CLIENT_ID') || '').trim();
  const allow = String(props.getProperty('EPERJADIN_ALLOWED_EMAILS') || '')
    .split(',').map(function(x) { return x.toLowerCase().trim(); }).filter(Boolean);
  if (!expectedAudience || !allow.length) throw new Error('Akses V5 belum dikonfigurasi administrator.');
  const token = String(idToken || '').trim();
  if (!token) throw new Error('Login Google diperlukan untuk mengakses database ePerjadin.');
  if (token.length > 9000) throw new Error('Token identitas tidak valid.');
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token);
  const key = 'googleid_' + Utilities.base64EncodeWebSafe(digest).slice(0, 60);
  const cache = CacheService.getScriptCache();
  let info;
  const cached = cache.get(key);
  if (cached) info = JSON.parse(cached);
  else {
    let response;
    try {
      response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), {
        method: 'get', muteHttpExceptions: true, followRedirects: false
      });
    } catch (_) {
      throw new Error('Verifikasi sesi Google tidak tersedia. Coba kembali.');
    }
    if (response.getResponseCode() !== 200) throw new Error('Sesi Google tidak berlaku. Silakan masuk kembali.');
    info = JSON.parse(response.getContentText() || '{}');
  }
  if (info.aud !== expectedAudience || (info.iss !== 'accounts.google.com' && info.iss !== 'https://accounts.google.com')) {
    throw new Error('Token Google bukan untuk aplikasi ini.');
  }
  if (!(info.email_verified === true || info.email_verified === 'true')) {
    throw new Error('Email Google belum terverifikasi.');
  }
  const email = String(info.email || '').toLowerCase().trim();
  if (!email || allow.indexOf(email) < 0) throw new Error('Akun Google tidak terdaftar sebagai petugas ePerjadin.');
  if (!Number.isFinite(Number(info.exp)) || Number(info.exp) <= Math.floor(Date.now() / 1000)) {
    throw new Error('Sesi Google berakhir. Masuk kembali.');
  }
  if (!cached) cache.put(key, JSON.stringify(info), Math.max(1, Math.min(240, Number(info.exp) - Math.floor(Date.now() / 1000))));
  return email;
}

function doGet(e) {
  const action = e && e.parameter ? String(e.parameter.action || '').trim() : '';
  if (action === 'ping') return jsonV4_({ success: true, version: 5, authRequired: true, message: 'Login Google diperlukan.' });
  return jsonV4_({ success: false, version: 5, authRequired: true, message: 'Gunakan POST dengan Google ID token untuk mengakses data.' });
}

function doPost(e) {
  try {
    const body = parseBodyV4_(e);
    const action = String(body.action || '').trim();
    if (action === 'ping') return jsonV4_({ success: true, version: 5, authRequired: true });
    verifyGoogleIdentityV5_(body.authIdToken);
    if (action === 'getDashboard' || action === 'getDashboardV4') return dashboardV4_();
    if (action === 'upsertPilotV5') {
      if (body.expectedPreviousHash !== null &&
          (typeof body.expectedPreviousHash !== 'string' || !body.expectedPreviousHash.trim())) {
        return jsonV4_({ success: false, version: 5, message: 'Snapshot dan konfirmasi SPD wajib tersedia.' });
      }
      return upsertPerjadinV4_(body.row, body.expectedPreviousHash);
    }
    if (action === 'upsertPerjadin' || action === 'upsertPerjadinV4') return upsertPerjadinV4_(body.row || body.payload || {});
    if (action === 'deletePerjadinV4') return jsonV4_({ success: false, message: 'Hapus SPD dari web dibatasi pada V5. Gunakan peninjauan administrator.' });
    if (action === 'updateStatusV4') return updateStatusV4_(body);
    if (action === 'uploadDocumentV4') return uploadDocumentV4_(body);
    return jsonV4_({ success: false, message: 'Action tidak dikenali.' });
  } catch (err) {
    return jsonV4_({ success: false, version: 5, message: errorMessageV4_(err) });
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
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const existing = sh.getRange(1, 1, 1, currentCols).getValues()[0];
    if (headers.some(function(header, i) { return textV4_(existing[i]) !== header; })) {
      throw new Error('Header tab ' + name + ' berbeda dari skema V5. Tinjau salinan migrasi.');
    }
  }

  const header = sh.getRange(1, 1, 1, headers.length);
  header.setFontWeight('bold').setBackground('#0B5CAB').setFontColor('#FFFFFF').setWrap(true);
  sh.setFrozenRows(1);
  return sh;
}

function dashboardV4_() {
  const ss = ssV4_();
  const summary = ss.getSheetByName(V4_SUMMARY_SHEET);
  if (!summary || headerMapV4_(summary)['Kunci SPD'] === undefined) {
    throw new Error('Tab Master belum disiapkan administrator.');
  }
  return jsonV4_({
    success: true,
    version: 5,
    data: readSheetObjectsV4_(summary),
    components: readSheetObjectsV4_(ss.getSheetByName(V4_COMPONENT_SHEET)),
    routes: readSheetObjectsV4_(ss.getSheetByName(V4_ROUTE_SHEET)),
    presences: readSheetObjectsV4_(ss.getSheetByName(V4_PRESENCE_SHEET)),
    akun: ss.getSheetByName(ACCOUNT_SHEET) ? readSheetObjectsV4_(ss.getSheetByName(ACCOUNT_SHEET)) : []
  });
}

function upsertPerjadinV4_(input, expectedPreviousHash) {
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
    if (!summarySheet || !componentSheet || !routeSheet || !presenceSheet) {
      throw new Error('Tab Master belum disiapkan administrator.');
    }
    [[summarySheet, V4_SUMMARY_HEADERS], [componentSheet, V4_COMPONENT_HEADERS],
      [routeSheet, V4_ROUTE_HEADERS], [presenceSheet, V4_PRESENCE_HEADERS]].forEach(function(pair) {
      const map = headerMapV4_(pair[0]);
      if (pair[1].some(function(header, i) { return map[header] !== i; })) {
        throw new Error('Urutan header Master berbeda dari skema V5.');
      }
    });

    // Catatan monitoring yang dimasukkan manusia tetap dipertahankan saat sumber disinkron ulang.
    const priorRows = findRowsByKeyV5_(summarySheet, normalized.kunciSPD);
    if (priorRows.length > 1) throw new Error('Kunci SPD ganda. Periksa Master sebelum melanjutkan.');
    const priorRow = priorRows[0] || 0;
    if (expectedPreviousHash === null && priorRow || typeof expectedPreviousHash === 'string' && !priorRow) {
      throw new Error('Master berubah setelah diperiksa. Bandingkan kembali.');
    }
    if (expectedPreviousHash !== undefined) validatePilotInputV5_(input, normalized);
    if (priorRow) {
      const map = headerMapV4_(summarySheet);
      const old = summarySheet.getRange(priorRow, 1, 1, summarySheet.getLastColumn()).getValues()[0];
      const getOld = function(name) { return map[name] === undefined ? '' : textV4_(old[map[name]]); };
      if (typeof expectedPreviousHash === 'string' && getOld('Raw Hash') !== expectedPreviousHash) {
        throw new Error('Master berubah setelah diperiksa. Bandingkan kembali.');
      }
      normalized.statusPJ = getOld('Status Pertanggungjawaban') || normalized.statusPJ;
      normalized.kekuranganDokumen = getOld('Kekurangan Dokumen') || normalized.kekuranganDokumen;
      normalized.dokumenPendukung = getOld('Dokumen Pendukung') || normalized.dokumenPendukung;
    }

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

    const summaryRow = buildSummaryObjectV4_(normalized);
    const targetRow = upsertObjectByKeyV4_(summarySheet, V4_SUMMARY_HEADERS, 'Kunci SPD', normalized.kunciSPD, summaryRow, priorRow);
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
  const kunciSPD = normalizeKeyV4_(idKegiatan) + '|' + normalizeKeyV4_(nomorSPD);
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
    kekuranganDokumen: textV4_(r.kekuranganDokumen),
    dokumenPendukung: textV4_(r.dokumenPendukung),
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
  const id = PropertiesService.getScriptProperties().getProperty('EPERJADIN_DRIVE_FOLDER_ID');
  if (!id) throw new Error('Folder dokumen V5 belum dikonfigurasi.');
  return DriveApp.getFolderById(id);
}

function validatePilotInputV5_(input, row) {
  if (!row.components.length || !row.routes.length || row.routes.length !== row.jumlahRute || !row.kodeAkun ||
      typeof input.totalPengeluaranRiil !== 'number' || !Number.isFinite(input.totalPengeluaranRiil) ||
      input.totalPengeluaranRiil < 0 || row.components.some(function(item) {
        return typeof item.nilaiRiil !== 'number' || !Number.isFinite(item.nilaiRiil) || item.nilaiRiilTerbaca === false;
      })) throw new Error('Komponen, rute, nominal resmi, dan akun wajib dibaca sebelum impor.');
  const sent = row.components.reduce(function(sum, item) {
    return sum + (isSentStatusV4_(item.status) ? item.nilaiRiil : 0);
  }, 0);
  if (Math.round(sent * 100) !== Math.round(input.totalPengeluaranRiil * 100)) {
    throw new Error('Total komponen belum cocok dengan nominal resmi.');
  }
}

function findRowsByKeyV5_(sheet, key) {
  const count = sheet.getLastRow();
  if (count <= 1) return [];
  const index = headerMapV4_(sheet)['Kunci SPD'];
  if (index === undefined) throw new Error('Kolom Kunci SPD belum tersedia di Master.');
  return sheet.getRange(2, index + 1, count - 1, 1).getValues().flatMap(function(row, i) {
    return normalizeKeyV4_(row[0]) === key ? [i + 2] : [];
  });
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

function upsertObjectByKeyV4_(sh, headers, keyHeader, keyValue, obj, existingRow) {
  const headerMap = headerMapV4_(sh);
  const keyIndex = headerMap[keyHeader];
  if (keyIndex === undefined) throw new Error('Header kunci tidak ditemukan: ' + keyHeader);

  const lastRow = sh.getLastRow();
  let targetRow = existingRow || lastRow + 1;
  if (!existingRow && lastRow > 1) {
    const keys = sh.getRange(2, keyIndex + 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < keys.length; i++) {
      if (String(keys[i][0] || '').trim() === keyValue) {
        targetRow = i + 2;
        break;
      }
    }
  }

  const row = headers.map(function(h) { return literalValueV5_(obj[h]); });
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
      return normalizeKeyV4_(row[parentIndex]) !== parentKey;
    });
    sh.getRange(2, 1, lastRow - 1, headers.length).clearContent();
    if (keep.length) sh.getRange(2, 1, keep.length, headers.length).setValues(keep);
  }

  if (objects.length) {
    const start = sh.getLastRow() + 1;
    const rows = objects.map(function(obj) { return headers.map(function(h) { return literalValueV5_(obj[h]); }); });
    sh.getRange(start, 1, rows.length, headers.length).setValues(rows);
  }
}

function literalValueV5_(value) {
  if (value === undefined) return '';
  return typeof value === 'string' && /^=/.test(value.trimStart()) ? "'" + value : value;
}

function applySummaryFormulasV4_(sh, row) {
  // Hanya komponen yang telah disampaikan/disetujui dihitung. Draft/ditolak dikecualikan.
  const statuses = ['Dikirim','Disetujui','Disetujui PPK','Dibayar','Selesai'];
  const sums = statuses.map(function(status) {
    return 'SUMIFS(' + V4_COMPONENT_SHEET + '!$I:$I,' +
      V4_COMPONENT_SHEET + '!$B:$B,$A' + row + ',' +
      V4_COMPONENT_SHEET + '!$H:$H,"' + status + '")';
  });
  sh.getRange(row, 21).setFormula('=IF($A' + row + '="","",' + sums.join('+') + ')');
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
  return s === 'dikirim' || s === 'disetujui' || s === 'disetujui ppk' || s === 'dibayar' || s === 'selesai';
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
