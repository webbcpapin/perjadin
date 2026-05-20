// Google Sheets API via Apps Script Web App

// Convert parsed data to sheet row format (23 columns)
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
  // Extract START, CLOCK IN, CLOCK OUT, END from geotags
  const sorted = [...parsed.geotags]; // Keep original order

  let startEntry = sorted[0] || null;
  let clockInEntry = sorted.length > 1 ? sorted[1] : sorted[0] || null;
  let clockOutEntry = sorted.length > 2 ? sorted[sorted.length - 2] : sorted[sorted.length - 1] || null;
  let endEntry = sorted[sorted.length - 1] || null;

  // For 5 geotags: index 0=START, 1=CLOCK IN, 2=midpoint, 3=CLOCK OUT, 4=END
  if (sorted.length >= 5) {
    startEntry = sorted[0];
    clockInEntry = sorted[1];
    clockOutEntry = sorted[sorted.length - 2]; // second to last
    endEntry = sorted[sorted.length - 1]; // last
  } else if (sorted.length === 4) {
    startEntry = sorted[0];
    clockInEntry = sorted[1];
    clockOutEntry = sorted[2];
    endEntry = sorted[3];
  } else if (sorted.length === 3) {
    startEntry = sorted[0];
    clockInEntry = sorted[1];
    clockOutEntry = sorted[1];
    endEntry = sorted[2];
  }

  // Build detail geotag string: "08:39@Kab. Bangka; 10:02@Kab. Bangka; ..."
  const detailGeotag = parsed.geotags
    .map(g => `${g.waktuTagging.replace('.', ':')}@${g.wilayahTagging}`)
    .join('; ');

  // Determine geotag status
  let geotagStatus = 'Belum Lengkap';
  if (parsed.geotags.length >= 4 && startEntry && clockInEntry && clockOutEntry && endEntry) {
    geotagStatus = 'Lengkap';
  } else if (parsed.geotags.length > 0) {
    geotagStatus = 'Sebagian';
  }

  // Format geotag entries for START/CLOCK IN/CLOCK OUT/END columns
  const formatEntry = (g: typeof startEntry) => g ? `${g.hariTanggal} ${g.waktuTagging.replace('.', ':')}` : '';

  // Format today's date as DD-MM-YYYY
  const today = new Date();
  const tanggalInput = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;

  // Bukti Dukung
  const buktiDukung = parsed.geotags.length >= 4 ? 'Lengkap' : 'Belum Lengkap';

  // Calculate lama from tanggalKegiatan
  let lamaHari = 1;
  if (parsed.tanggalKegiatan) {
    const match = parsed.tanggalKegiatan.match(/(\d{2})-(\d{2})-(\d{4})/g);
    if (match && match.length === 2) {
      const d1 = new Date(match[0].split('-').reverse().join('-'));
      const d2 = new Date(match[1].split('-').reverse().join('-'));
      lamaHari = Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }
  }

  return [
    parsed.idKegiatan || '',                            // A: ID Kegiatan (KEY)
    parsed.namaKegiatan || '',                          // B: Nama Kegiatan
    parsed.nomorST || '',                             // C: Nomor ST
    parsed.nomorKegiatan || '',                       // D: NKA / Nomor Kegiatan
    parsed.tanggalKegiatan || '',                     // E: Tanggal Kegiatan
    tujuan || '',                                     // F: Tujuan
    parsed.peserta || '',                             // G: Nama Pegawai
    lamaHari,                                         // H: Lama (Hari)
    calcResult?.uangHarianPerHari || 0,               // I: Uang Harian per Hari
    calcResult?.totalUangHarian || parsed.totalPengeluaranRiil || 0,  // J: Total Uang Harian
    parsed.uangMuka || 0,                             // K: Uang Muka
    parsed.totalPengeluaranRiil || 0,                 // L: Total Pengeluaran Riil
    parsed.totalKurangBayar || 0,                     // M: Kurang / Lebih Bayar
    geotagStatus,                                     // N: Status Geotag
    detailGeotag,                                     // O: Detail Geotag
    tanggalInput,                                     // P: Tanggal Input
    formatEntry(startEntry),                          // Q: START
    formatEntry(clockInEntry),                        // R: CLOCK IN
    formatEntry(clockOutEntry),                       // S: CLOCK OUT
    formatEntry(endEntry),                            // T: END
    parsed.jumlahRute || 1,                           // U: VOLUME
    parsed.totalPengeluaranRiil || 0,                 // V: NILAI RIIL
    buktiDukung,                                      // W: BUKTI DUKUNG
    '',                                               // X: Keterangan
  ];
}

// Standard headers (23 columns)
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
