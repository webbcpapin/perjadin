export type AccountKind = 'luar_kota' | 'dalam_kota';

export interface BudgetAccount {
  kode: string;
  nama: string;
  pagu: number;
  realisasi: number;
  komitmen: number;
  jenis: AccountKind;
  akunBelanja: '524111' | '524113';
  ro: string;
  roLabel: string;
  uraian: string;
}

const suffix = '.A000000001.00000.2.3051.2.000000.000000';

function account(
  akunBelanja: '524111' | '524113',
  bidang: '01505CC' | '01505WA',
  ro: string,
  uraian: string,
  pagu: number,
): BudgetAccount {
  const roLabel = `${ro.slice(0, 4)}.${ro.slice(4)}`;
  const jenis = akunBelanja === '524111' ? 'luar_kota' : 'dalam_kota';

  return {
    kode: `636722.015.${akunBelanja}.${bidang}.${ro}${suffix}`,
    nama: `${akunBelanja} ${jenis === 'luar_kota' ? 'Luar Kota' : 'Dalam Kota'} - ${roLabel}`,
    pagu,
    realisasi: 0,
    komitmen: 0,
    jenis,
    akunBelanja,
    ro,
    roLabel,
    uraian,
  };
}

export const budgetAccounts: BudgetAccount[] = [
  account('524111', '01505CC', '4787AEF', 'Sosialisasi dan Penyuluhan (Eksternal)', 3_300_000),
  account('524113', '01505CC', '4787AEF', 'Sosialisasi dan Penyuluhan (Eksternal)', 480_000),
  account('524111', '01505CC', '4787BAE', 'Klinik Ekspor', 5_400_000),
  account('524113', '01505CC', '4787BAE', 'Klinik Ekspor', 960_000),
  account('524111', '01505CC', '4787BIG', 'Pemeriksaan Kepabeanan dan Cukai', 36_000_000),
  account('524113', '01505CC', '4787BIG', 'Pemeriksaan Kepabeanan dan Cukai', 16_800_000),
  account('524111', '01505CC', '4789BIG', 'Laporan Hasil Intelijen, Penindakan, dan Penyidikan', 31_800_000),
  account('524113', '01505CC', '4789BIG', 'Laporan Hasil Intelijen, Penindakan, dan Penyidikan', 4_800_000),
  account('524111', '01505WA', '4695EBA', 'Kerumahtanggaan', 39_419_000),
  account('524113', '01505WA', '4695EBA', 'Kerumahtanggaan', 3_240_000),
  account('524111', '01505WA', '4698EBD', 'Rekomendasi Kepatuhan Internal', 1_800_000),
  account('524113', '01505WA', '4698EBD', 'Rekomendasi Kepatuhan Internal', 720_000),
];

export function normalizeAccountCode(kode: string) {
  return kode.replace(/\s+/g, '').trim();
}

export function findBudgetAccount(kode: string) {
  const normalized = normalizeAccountCode(kode);
  return budgetAccounts.find((accountItem) => accountItem.kode === normalized);
}

export function accountKindLabel(jenis: AccountKind) {
  return jenis === 'luar_kota' ? 'Luar Kota' : 'Dalam Kota';
}
