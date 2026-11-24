import { parseEPerjadinV3 } from './parserV3';

export const MAX_BYTES = 750_000;
export const MAX_BATCH = 20;
export const MAX_TEXT = 200_000;
export const validClientId = (value: string) => /^[a-z0-9-]{6,120}\.apps\.googleusercontent\.com$/i.test(value.trim());
export type Action = 'verifyConnection' | 'submitParsedPerjadin' | 'submitCollectorJson';

const months = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];
export function toISO(value: string) {
  const numeric = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  const written = /^(\d{1,2}) ([a-z]+) (\d{4})$/i.exec(value);
  const month = written ? months.indexOf(written[2].toLowerCase()) + 1 : 0;
  const date = numeric ? `${numeric[3]}-${numeric[2]}-${numeric[1]}` :
    written && month ? `${written[3]}-${String(month).padStart(2, '0')}-${written[1].padStart(2, '0')}` : '';
  const parsed = new Date(date + 'T00:00:00Z');
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date ? date : '';
}

export function parseSubmission(raw: string) {
  const unique = (pattern: RegExp) => new Set(Array.from(raw.matchAll(pattern), (match) => match[1].toUpperCase())).size <= 1;
  if (!unique(/\bid kegiatan\s*:?\s*([a-f0-9]{24})\b/gi) || !unique(/\b(SPD-\d+\/\d{6}-20\d{2})\b/gi)) return null;
  const r = parseEPerjadinV3(raw);
  if (!r || !r.totalResmiTerbaca || !r.uangMukaTerbaca) return null;
  const routes = r.routes.map((route) => ({
    nomorRute: route.nomorRute, tujuan: route.tujuan,
    tanggalMulai: toISO(route.tanggalMulai), tanggalSelesai: toISO(route.tanggalSelesai),
    durasiHari: route.durasiHari, menginap: route.menginap || 'Tidak Terbaca',
  }));
  const geotags = r.geotags.map((g) => ({
    hariTanggal: toISO(g.hariTanggal), waktuTagging: g.waktuTagging.padStart(5, '0'),
    wilayahTagging: g.wilayahTagging, lokasiTagging: g.lokasiTagging,
  }));
  const record = {
    idKegiatan: r.idKegiatan, nomorSPD: r.nomorSPD, nomorST: r.nomorST, namaKegiatan: r.namaKegiatan,
    peserta: r.peserta, nip: r.nip, kodeAkun: r.kodeAkun, uangMuka: r.uangMuka,
    totalPengeluaranRiil: r.totalPengeluaranRiil, jumlahRute: r.jumlahRute, routes,
    components: r.components.map((c) => ({ nomorRute: c.nomorRute, nama: c.nama, status: c.status, nilaiRiil: c.nilaiRiil })),
    presensiStatus: r.presensiStatus, geotags,
  };
  return record;
}

export type Submission = NonNullable<ReturnType<typeof parseSubmission>>;
export type DraftRow = { record: Submission | null; issue: string };

export function review(raw: string): DraftRow {
  const record = raw.length <= MAX_TEXT ? parseSubmission(raw) : null;
  let issue = '';
  if (!record) issue = 'Ringkasan SPD atau nominal resmi tidak terbaca.';
  else if (!/^[a-f0-9]{24}$/i.test(record.idKegiatan) || !/^SPD-\d+\/\d{6}-20\d{2}$/i.test(record.nomorSPD) ||
      !record.peserta || !/^\d{18}$/.test(record.nip) || !record.nomorST || !record.namaKegiatan) issue = 'Identitas SPD belum lengkap.';
  else if (!record.routes.length || record.routes.length !== record.jumlahRute ||
      record.routes.some((r) => !r.tujuan || !r.tanggalMulai || !r.tanggalSelesai)) issue = 'Rute atau tanggal belum lengkap.';
  else if (!record.components.length) issue = 'Komponen biaya tidak terbaca.';
  else if (record.components.filter((c) => /^(Dikirim|Disetujui(?: PPK)?|Dibayar|Selesai)$/i.test(c.status))
    .reduce((total, c) => total + Math.round(c.nilaiRiil * 100), 0) !== Math.round(record.totalPengeluaranRiil * 100)) {
    issue = 'Total komponen terkirim tidak cocok dengan total riil resmi.';
  }
  return { record, issue };
}

export function readCollector(contents: string): DraftRow[] {
  const doc: unknown = JSON.parse(contents);
  if (!doc || typeof doc !== 'object' || !('records' in doc) || !Array.isArray(doc.records) ||
      doc.records.length < 1 || doc.records.length > MAX_BATCH) throw new Error('BAD_FILE');
  return doc.records.map((row: unknown) => review(row && typeof row === 'object' && 'rawText' in row &&
    typeof row.rawText === 'string' ? row.rawText : ''));
}

export function endpoint(value: string) {
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{5,160}\/exec$/.test(value.trim()) ? value.trim() : '';
}

export const issues: Record<string, string> = {
  BAD_REQUEST: 'Format permintaan tidak diterima.',
  UNAUTHORIZED: 'Sesi Google tidak valid. Masuk kembali.',
  FORBIDDEN: 'Akun Google ini tidak terdaftar sebagai petugas input.',
  ACTION_DENIED: 'Deployment tidak mendukung operasi ini.',
  SIZE_LIMIT: 'Kiriman terlalu besar. Bagi menjadi beberapa batch.',
  BAD_SCHEMA: 'Struktur data tidak sesuai.',
  BAD_IDENTITY: 'Identitas SPD tidak valid.',
  BAD_ROUTE: 'Rute atau rentang tanggal tidak valid.',
  BAD_FINANCE: 'Ringkasan nominal tidak valid.',
  BAD_COMPONENT: 'Periksa jenis, status, rute, atau duplikasi komponen biaya.',
  TOTAL_MISMATCH: 'Total komponen terkirim tidak cocok dengan total riil resmi.',
  BAD_PRESENCE: 'Periksa tanggal, waktu, wilayah, atau baris presensi ganda.',
  CONFLICT: 'SPD bertentangan dengan data yang sudah ada atau baris lain. Minta admin meninjau; data lama tidak diubah.',
  RATE_LIMIT: 'Terlalu banyak percobaan. Coba lagi dalam satu menit.',
  BUSY: 'Backend sedang sibuk. Coba lagi.',
  UNAVAILABLE: 'Konfirmasi backend belum diterima. Coba lagi atau hubungi admin.',
};

const reasonCodes = new Set(Object.keys(issues));
const resultCodes = {
  accepted: ['STORED'],
  skipped: ['DUPLICATE'],
  rejected: ['BAD_SCHEMA', 'BAD_IDENTITY', 'BAD_ROUTE', 'BAD_FINANCE', 'BAD_COMPONENT', 'TOTAL_MISMATCH', 'BAD_PRESENCE', 'CONFLICT'],
} as const;
type Status = keyof typeof resultCodes;
type RowResult = { row: number; status: Status; code: string };
export type Receipt = { requestId: string; accepted: number; skipped: number; rejected: number; results: RowResult[] };

export async function post(action: Action, url: string, token: string, records: Submission[] = []) {
  if (!endpoint(url) || !token) throw new Error('UNAUTHORIZED');
  const body = JSON.stringify({ action, authIdToken: token, ...(action === 'verifyConnection' ? {} : { records }) });
  if (new TextEncoder().encode(body).length > MAX_BYTES) throw new Error('SIZE_LIMIT');
  let value;
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(45_000), body });
    if (!response.ok) throw new Error();
    value = await response.json();
  } catch { throw new Error('UNAVAILABLE'); }
  if (value?.protocol !== 1 || typeof value.requestId !== 'string' ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.requestId)) throw new Error('UNAVAILABLE');
  if (value.ok !== true) throw new Error(reasonCodes.has(value.code) ? value.code : 'UNAVAILABLE');
  if (action === 'verifyConnection') {
    if (Object.keys(value).length !== 3) throw new Error('UNAVAILABLE');
    return;
  }
  if (Object.keys(value).length !== 7 || !Array.isArray(value.results) || value.results.length !== records.length) throw new Error('UNAVAILABLE');
  const counts = { accepted: 0, skipped: 0, rejected: 0 };
  const results: RowResult[] = [];
  for (const [i, item] of value.results.entries()) {
    const status = item?.status as Status;
    if (item?.row !== i + 1 || Object.keys(item).length !== 3 || !Object.hasOwn(resultCodes, status) ||
      !(resultCodes[status] as readonly string[]).includes(item.code)) throw new Error('UNAVAILABLE');
    counts[status]++;
    results.push({ row: i + 1, status, code: item.code });
  }
  if (Object.entries(counts).some(([key, count]) => value[key] !== count)) throw new Error('UNAVAILABLE');
  return { requestId: value.requestId as string, ...counts, results };
}
