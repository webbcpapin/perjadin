export interface GeotagEntryV3 {
  hariTanggal: string;
  waktuTagging: string;
  wilayahTagging: string;
  lokasiTagging: string;
  klasifikasi?: string;
}

export interface RouteV3 {
  nomorRute: number;
  tujuan: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  tanggalKegiatan: string;
  durasiHari: number;
  menginap?: string;
}

export interface CostComponentV4 {
  nomorRute: number;
  nama: string;
  status: string;
  nilaiRiil: number;
  nilaiSBM?: number;
  buktiDukung?: string[];
  keterangan?: string;
}

export interface ParsedPerjadinV3 {
  schemaVersion: 4;
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
  tanggalMulai: string;
  tanggalSelesai: string;
  tanggalKegiatan: string;
  durasiHari: number;
  menginap: string;
  statusUangHarian: string;
  uangMuka: number;
  totalPengeluaranRiil: number;
  nilaiSBMAwal: number;
  totalNilaiSBM: number;
  totalNilaiRiil: number;
  efisiensi: number;
  kodeAkun: string;
  routes: RouteV3[];
  components: CostComponentV4[];
  geotags: GeotagEntryV3[];
}
