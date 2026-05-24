export interface GeotagEntry {
  hariTanggal: string;
  waktuTagging: string;
  lokasiTagging: string;
  wilayahTagging: string;
}

export interface GeotagIssue {
  label: string;
  expectedDate: string;
  expectedLocation: string;
  message: string;
}

export interface ParsedData {
  sourceType?: 'persetujuan' | 'pertanggungjawaban' | 'pelaksanaan';
  namaKegiatan: string;
  idKegiatan: string;
  nomorST: string;
  lampiranST: string[];
  tanggalKegiatan: string;
  nomorKegiatan: string;
  kodeAkun?: string;
  kotaTujuan?: string;
  output?: string;
  jenisPembayaran?: string;
  totalEstimasiBiaya?: number;
  totalUangMuka?: number;
  status?: string;
  jumlahRute: number;
  geotags: GeotagEntry[];
  peserta: string;
  nomorKomitmenAnggaran: string;
  uangMuka: number;
  totalPengeluaranRiil: number;
  totalKurangBayar: number;
}

export interface MasterEntry {
  idKegiatan: string;
  namaKegiatan: string;
  noST: string;
  nka: string;
  tanggal: string;
  statusKegiatan: string;
  statusPJ: string;
  namaPegawai: string;
  tujuan: string;
  lama: number;
  nilaiRiil: number;
}

export interface CalculationResult {
  kategori: 'dalam_kota' | 'pulau_bangka' | 'luar_pulau_bangka';
  uangHarianPerHari: number;
  jumlahHari: number;
  totalUangHarian: number;
  uangHarianSBM: number;
  uangHarian60Persen: number;
  provinsiSBM: string;
  keterangan: string;
}

export interface GeotagValidation {
  start: { valid: boolean; message: string };
  clockIn: { valid: boolean; message: string };
  clockOut: { valid: boolean; message: string };
  end: { valid: boolean; message: string };
  duration: { valid: boolean; message: string; hours: number };
}
