import { useState, useCallback } from 'react';
import type { MasterEntry } from '@/types';

// Embedded master data from the Excel files (key samples)
const MASTER_DATA: MasterEntry[] = [
  { idKegiatan: '83c49c01', namaKegiatan: 'Mengikuti Rapat dan Koordinasi terkait Program Zona KHAS', noST: 'ST-88/KBC.0503/2026', nka: '', tanggal: '', statusKegiatan: '', statusPJ: 'Belum Lengkap', namaPegawai: 'PERSONAL BC PANGKAL PINANG', tujuan: 'JAKARTA', lama: 4, nilaiRiil: 0 },
  { idKegiatan: 'c76c1bba', namaKegiatan: 'Koordinasi Percepatan Implementasi Program Zona KHAS', noST: 'ST-87/KBC.0503/2026', nka: '', tanggal: '', statusKegiatan: '', statusPJ: 'Belum Lengkap', namaPegawai: 'PERSONAL BC PANGKAL PINANG', tujuan: 'JAKARTA', lama: 5, nilaiRiil: 0 },
  { idKegiatan: 'd77c674e', namaKegiatan: 'Monitoring dan Evaluasi Awal Pengelola Kawasan Pabean', noST: 'ST-86/KBC.0503/2026', nka: '', tanggal: '', statusKegiatan: '', statusPJ: 'Belum Lengkap', namaPegawai: 'BC PANGKAL PINANG', tujuan: 'JAKARTA', lama: 5, nilaiRiil: 0 },
  { idKegiatan: '2c446c1b', namaKegiatan: 'Diplomasi dan Nota Kesepahaman BC-BTB/A.B2/7/2026', noST: 'ST-178/KBC.0503/2026', nka: '', tanggal: '', statusKegiatan: '', statusPJ: 'Disetujui', namaPegawai: 'Okwan Wamancha', tujuan: 'Jakarta', lama: 2, nilaiRiil: 1272000 },
  { idKegiatan: '2ab6d513', namaKegiatan: 'Mengikuti Rapat Koordinasi Penertiban Barang Kena Cukai Ilegal', noST: 'ST-179/KBC.0503/2026', nka: '', tanggal: '', statusKegiatan: '', statusPJ: 'Disetujui', namaPegawai: 'Welly Kristianto', tujuan: 'Pangkalpinang', lama: 1, nilaiRiil: 100000 },
  { idKegiatan: '85fe343b', namaKegiatan: 'Koordinasi dan Konsultasi Penerbitan Peraturan Daerah Pelabuhan', noST: 'ST-173/KBC.0503/2026', nka: '', tanggal: '', statusKegiatan: '', statusPJ: 'Lengkap', namaPegawai: 'PERSONAL BC PANGKAL PINANG', tujuan: 'JAKARTA', lama: 5, nilaiRiil: 0 },
  { idKegiatan: 'bca76761', namaKegiatan: 'Mengikuti Sosialisasi Kebijakan Pengawasan Post Clearance Audit', noST: 'ST-84/KBC.0503/2026', nka: '', tanggal: '', statusKegiatan: '', statusPJ: 'Disetujui', namaPegawai: 'BC PANGKAL PINANG', tujuan: 'JAKARTA', lama: 4, nilaiRiil: 0 },
  { idKegiatan: '4ee6b085', namaKegiatan: 'Monitoring dan Evaluasi Kinerja Penerimaan Bea dan Cukai', noST: 'ST-171/KBC.0503/2026', nka: '', tanggal: '', statusKegiatan: '', statusPJ: 'Lengkap', namaPegawai: 'PERSONAL BC PANGKAL PINANG', tujuan: 'JAKARTA', lama: 4, nilaiRiil: 0 },
  { idKegiatan: 'a847813c', namaKegiatan: 'Penugasan Pengawasan dan Pelayanan Returnable Package', noST: '', nka: '', tanggal: '', statusKegiatan: '', statusPJ: 'Tervalidasi Staf PPK', namaPegawai: 'Ismail Martawinata', tujuan: '', lama: 0, nilaiRiil: 100000 },
];

export function useMasterData() {
  const [entries, setEntries] = useState<MasterEntry[]>(MASTER_DATA);

  const findByIdKegiatan = useCallback((idKegiatan: string): MasterEntry | undefined => {
    return entries.find(e => e.idKegiatan.toLowerCase() === idKegiatan.toLowerCase());
  }, [entries]);

  const findByNoST = useCallback((noST: string): MasterEntry | undefined => {
    return entries.find(e => e.noST.toLowerCase() === noST.toLowerCase());
  }, [entries]);

  const checkExisting = useCallback((idKegiatan: string, noST: string): { 
    exists: boolean; 
    entry?: MasterEntry; 
    matchBy: 'id' | 'st' | 'both' | 'none' 
  } => {
    const byId = idKegiatan ? findByIdKegiatan(idKegiatan) : undefined;
    const byST = noST ? findByNoST(noST) : undefined;
    
    if (byId && byST) {
      return { exists: true, entry: byId, matchBy: 'both' };
    } else if (byId) {
      return { exists: true, entry: byId, matchBy: 'id' };
    } else if (byST) {
      return { exists: true, entry: byST, matchBy: 'st' };
    }
    
    return { exists: false, matchBy: 'none' };
  }, [findByIdKegiatan, findByNoST]);

  const addEntry = useCallback((entry: MasterEntry) => {
    setEntries(prev => [...prev, entry]);
  }, []);

  return { entries, findByIdKegiatan, findByNoST, checkExisting, addEntry };
}
