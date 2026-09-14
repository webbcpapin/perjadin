export interface GeotagEntryV3 {
  hariTanggal: string;
  waktuTagging: string;
  wilayahTagging: string;
  lokasiTagging: string;
}

export interface RouteV3 {
  nomorRute: number;
  tujuan: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  tanggalKegiatan: string;
  durasiHari: number;
}

export interface ParsedPerjadinV3 {
  schemaVersion: 3;
  sourceType: 'pertanggungjawaban';
  namaKegiatan: string;
  idKegiatan: string;
  nomorST: string;
  lampiranST: string[];
  nomorKegiatan: string;
  jumlahRute: number;
  dipaInisiator: string;
  ppk: string;
  peserta: string;
  nip: string;
  nomorSPD: string;
  nomorPerjalanan: string;
  tujuan: string;
  tanggalKegiatan: string;
  durasiHari: number;
  statusUangHarian: string;
  uangMuka: number;
  totalPengeluaranRiil: number;
  nilaiSBMAwal: number;
  totalNilaiSBM: number;
  totalNilaiRiil: number;
  efisiensi: number;
  kodeAkun: string;
  routes: RouteV3[];
  geotags: GeotagEntryV3[];
}
