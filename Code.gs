const SPREADSHEET_ID = 'ISI_ID_SPREADSHEET_ANDA';

const HEADERS_DATA = [
  'ID Kegiatan','Nama Kegiatan','Nomor ST','NKA/Nomor Kegiatan','Tanggal Kegiatan','Tujuan','Nama Pegawai','Lama (Hari)','Uang Harian per Hari','Total Uang Harian','Uang Muka','Total Pengeluaran Riil','Kurang/Lebih Bayar','Status Pertanggungjawaban','Status Geotag','START','CLOCK IN','CLOCK OUT','END','VOLUME','NILAI RIIL','Kode Akun','Detail Geotag','Tanggal Input'
];
const HEADERS_AKUN = ['Kode Akun','Nama Akun','Pagu','Realisasi','Komitmen','Saldo'];

function ss_() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function sheet_(name, headers) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  return sh;
}

function doGet() {
  const data = readSheet_('DATA_PERJADIN');
  const akun = readSheet_('AKUN_ANGGARAN');
  return ContentService.createTextOutput(JSON.stringify({ success: true, data, akun })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'upsertPerjadin') return upsertPerjadin_(body.row);
    if (body.action === 'saveAccounts') return saveAccounts_(body.accounts || []);
    return out_({ success: false, message: 'Action tidak dikenali' });
  } catch (err) {
    return out_({ success: false, message: err.message });
  }
}

function upsertPerjadin_(r) {
  const sh = sheet_('DATA_PERJADIN', HEADERS_DATA);
  const key = [r.idKegiatan, r.nomorST, r.namaPegawai].join('|');
  const values = sh.getDataRange().getValues();
  let target = -1;
  for (let i = 1; i < values.length; i++) {
    const existingKey = [values[i][0], values[i][2], values[i][6]].join('|');
    if (existingKey === key) { target = i + 1; break; }
  }
  const row = [r.idKegiatan,r.namaKegiatan,r.nomorST,r.nka,r.tanggalKegiatan,r.tujuan,r.namaPegawai,r.lamaHari,r.uangHarianPerHari,r.totalUangHarian,r.uangMuka,r.totalPengeluaranRiil,r.kurangLebihBayar,r.statusPJ,r.statusGeotag,r.start,r.clockIn,r.clockOut,r.end,r.volume,r.nilaiRiil,r.kodeAkun,r.detailGeotag,r.tanggalInput || new Date()];
  if (target > 0) sh.getRange(target, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
  refreshAkun_();
  return out_({ success: true, message: target > 0 ? 'Updated' : 'Inserted' });
}

function refreshAkun_() {
  const akun = sheet_('AKUN_ANGGARAN', HEADERS_AKUN);
  const data = sheet_('DATA_PERJADIN', HEADERS_DATA).getDataRange().getValues().slice(1);
  const akunRows = akun.getDataRange().getValues();
  for (let i = 1; i < akunRows.length; i++) {
    const kode = akunRows[i][0];
    const pagu = Number(akunRows[i][2]) || 0;
    const realisasi = data.filter(r => r[21] === kode && r[13] === 'Disetujui').reduce((a, r) => a + (Number(r[20]) || 0), 0);
    const komitmen = data.filter(r => r[21] === kode && r[13] !== 'Disetujui').reduce((a, r) => a + (Number(r[20]) || 0), 0);
    akun.getRange(i + 1, 4, 1, 3).setValues([[realisasi, komitmen, pagu - realisasi - komitmen]]);
  }
}

function readSheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh || sh.getLastRow() === 0) return [];
  const values = sh.getDataRange().getValues();
  const headers = values.shift();
  return values.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
}
function out_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
