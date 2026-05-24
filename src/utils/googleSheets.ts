// Google Sheets API via Apps Script Web App

import { selectRequiredGeotagPoints } from './geotagRules';

// Convert parsed data to sheet row format (24 columns)
export function convertParsedToRow(
  parsed: {
    namaKegiatan: string;
    idKegiatan: string;
    nomorST: string;
    tanggalKegiatan: string;
    nomorKegiatan: string;
    peserta: string;
    totalPengeluaranRiil: number;
    uangMuka: number;
    totalKurangBayar: number;
    geotags: { hariTanggal: string; waktuTagging: string; lokasiTagging: string; wilayahTagging: string }[];
    jumlahRute: number;
  },
  tujuan: string,
  calcResult?: { uangHarianPerHari: number; jumlahHari: number; totalUangHarian: number }
): (string | number)[] {
  const geotagRule = selectRequiredGeotagPoints(parsed.geotags, parsed.tanggalKegiatan, tujuan);
  const points = geotagRule.points;

  const detailGeotag = parsed.geotags
    .map((g) => `${g.hariTanggal} ${g.waktuTagging.replace('.', ':')} ${g.wilayahTagging}`)
    .join(' | ');

  const formatEntry = (g?: { hariTanggal: string; waktuTagging: string; wilayahTagging: string }) =>
    g ? `${g.hariTanggal} ${g.waktuTagging.replace('.', ':')} ${g.wilayahTagging}` : '';

  const today = new Date();
  const tanggalInput = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;

  let lamaHari = calcResult?.jumlahHari || 1;
  if (!calcResult?.jumlahHari && parsed.tanggalKegiatan) {
    const match = parsed.tanggalKegiatan.match(/(\d{2})-(\d{2})-(\d{4})/g);
    if (match && match.length === 2) {
      const d1 = new Date(match[0].split('-').reverse().join('-'));
      const d2 = new Date(match[1].split('-').reverse().join('-'));
      lamaHari = Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }
  }

  return [
    parsed.idKegiatan || '',
    parsed.namaKegiatan || '',
    parsed.nomorST || '',
    parsed.nomorKegiatan || '',
    parsed.tanggalKegiatan || '',
    tujuan || geotagRule.tujuanResolved || '',
    parsed.peserta || '',
    lamaHari,
    calcResult?.uangHarianPerHari || 0,
    calcResult?.totalUangHarian || parsed.totalPengeluaranRiil || 0,
    parsed.uangMuka || 0,
    parsed.totalPengeluaranRiil || 0,
    parsed.totalKurangBayar || 0,
    geotagRule.status,
    detailGeotag,
    tanggalInput,
    formatEntry(points.start),
    formatEntry(points.clockIn),
    formatEntry(points.clockOut),
    formatEntry(points.end),
    parsed.jumlahRute || 1,
    parsed.totalPengeluaranRiil || 0,
    geotagRule.status === 'Lengkap' ? 'Tidak Wajib' : 'Wajib Surat Pernyataan Geotag',
    geotagRule.issues.map((item) => item.message).join(' | '),
  ];
}

// Standard headers (24 columns)
export const MASTER_HEADERS = [
  'ID Kegiatan',
  'Nama Kegiatan',
  'Nomor ST',
  'NKA / Nomor Kegiatan',
  'Tanggal Kegiatan',
  'Tujuan',
  'Nama Pegawai',
  'Lama (Hari)',
  'Uang Harian per Hari',
  'Total Uang Harian',
  'Uang Muka',
  'Total Pengeluaran Riil',
  'Kurang / Lebih Bayar',
  'Status Geotag',
  'Detail Geotag',
  'Tanggal Input',
  'START',
  'CLOCK IN',
  'CLOCK OUT',
  'END',
  'VOLUME',
  'NILAI RIIL',
  'BUKTI DUKUNG\nSURAT PERNYATAAN GEOTAG',
  'Keterangan',
];

// Apps Script code (displayed in UI)
export const APPS_SCRIPT_CODE = `function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(data.sheetName) || ss.getSheets()[0];
    
    // Ensure headers exist
    const headers = sheet.getRange(1, 1, 1, data.headers.length).getValues()[0];
    if (headers[0] === '' || headers[0] === '#REF!' || headers[0] === '#N/A') {
      sheet.getRange(1, 1, 1, data.headers.length).setValues([data.headers]);
      sheet.getRange(1, 1, 1, data.headers.length)
        .setFontWeight('bold')
        .setBackground('#1F4E79')
        .setFontColor('#FFFFFF');
    }
    
    // Append data rows
    const lastRow = sheet.getLastRow();
    const numRows = data.rows.length;
    const numCols = data.rows[0].length;
    sheet.getRange(lastRow + 1, 1, numRows, numCols).setValues(data.rows);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      rowsInserted: numRows,
      totalRows: lastRow + numRows
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  const data = sheet.getDataRange().getValues();
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    rowCount: data.length,
    headers: data[0] || [],
    rows: data.slice(1)
  })).setMimeType(ContentService.MimeType.JSON);
}`;
