import { normalizeAccountCode } from '@/data/perjadinAccounts';
import type { GeotagEntry, ParsedData } from '@/types';

const LABEL_RE = /^(Nama Kegiatan|Id Kegiatan|Nomor Kegiatan|Tujuan Kegiatan|Output|Tanggal Kegiatan|Kota Tujuan|Nomor ST|Lampiran ST|Kode Akun|Jenis Pembayaran|Total Estimasi Biaya|Total Uang Muka|Status|Peserta Kegiatan|Nomor Komitmen Anggaran|Uang Muka|Total Pengeluaran Riil|Total Kurang Bayar|Ringkasan|Rute Perjalanan Dinas|Geotagging Perjalan Dinas|Items per page)/i;
const ACCOUNT_RE = /636722\.015\.52411[13]\.01505(?:CC|WA)\.\d{4}[A-Z]{3}\.A000000001\.00000\.2\.3051\.2\.000000\.000000/;
const DATE_RE = /^(Sen|Sel|Rab|Kam|Jum|Sab|Min),?\s+\d{1,2}\s+\w+\s+\d{4}/i;
const TIME_RE = /^\d{1,2}[:.]\d{2}$/;

function blankParsedData(sourceType: ParsedData['sourceType']): ParsedData {
  return {
    sourceType,
    namaKegiatan: '',
    idKegiatan: '',
    nomorST: '',
    lampiranST: [],
    tanggalKegiatan: '',
    nomorKegiatan: '',
    jumlahRute: 1,
    geotags: [],
    peserta: '',
    nomorKomitmenAnggaran: '',
    uangMuka: 0,
    totalPengeluaranRiil: 0,
    totalKurangBayar: 0,
  };
}

function linesFromText(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function isLabel(line: string) {
  return LABEL_RE.test(line);
}

function valueAfterLabel(lines: string[], label: RegExp, options: { multiline?: boolean; maxLines?: number } = {}) {
  const maxLines = options.maxLines ?? 4;

  for (let i = 0; i < lines.length; i++) {
    if (!label.test(lines[i])) continue;

    const inline = lines[i]
      .replace(label, '')
      .replace(/^[:\t\s-]+/, '')
      .trim();

    if (inline && !isLabel(inline)) return inline;

    const values: string[] = [];
    for (let j = i + 1; j < lines.length && j <= i + maxLines; j++) {
      if (isLabel(lines[j])) break;
      if (lines[j] === '-') break;
      values.push(lines[j]);
      if (!options.multiline) break;
    }

    return values.join(options.multiline ? ' ' : '').trim();
  }

  return '';
}

function findFirstMatch(lines: string[], pattern: RegExp) {
  for (const line of lines) {
    const match = line.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function currencyAfterLabel(lines: string[], label: RegExp) {
  for (let i = 0; i < lines.length; i++) {
    if (!label.test(lines[i])) continue;
    for (let j = i; j < lines.length && j <= i + 4; j++) {
      const amount = parseRupiah(lines[j]);
      if (amount > 0) return amount;
    }
  }
  return 0;
}

function parseRupiah(value: string) {
  const match = value.match(/Rp\s*([\d.,]+)/i);
  if (!match) return 0;
  return Number(match[1].replace(/[.,]/g, '')) || 0;
}

function extractAccountCode(text: string) {
  const compact = text.replace(/\s+/g, '');
  const match = compact.match(ACCOUNT_RE);
  return match ? normalizeAccountCode(match[0]) : '';
}

function findWindowMatch(lines: string[], startPattern: RegExp, valuePattern: RegExp, maxLines = 8) {
  for (let i = 0; i < lines.length; i++) {
    if (!startPattern.test(lines[i])) continue;
    for (let j = i; j < lines.length && j <= i + maxLines; j++) {
      const match = lines[j].match(valuePattern);
      if (match?.[1]) return match[1].trim();
    }
  }
  return '';
}

export function parseDetailPerjalananDinas(text: string): ParsedData | null {
  if (!text.trim()) return null;

  const lower = text.toLowerCase();
  const looksLikeDetail =
    lower.includes('detail perjalanan dinas') ||
    lower.includes('data perjadin') ||
    lower.includes('ringkasan dipa') ||
    lower.includes('kode akun');

  if (!looksLikeDetail) return null;

  const lines = linesFromText(text);
  const result = blankParsedData(
    lower.includes('ringkasan dipa') || lower.includes('kode akun') ? 'persetujuan' : 'pelaksanaan',
  );

  result.namaKegiatan = valueAfterLabel(lines, /^Nama Kegiatan/i);
  result.idKegiatan = valueAfterLabel(lines, /^Id Kegiatan/i);
  result.nomorKegiatan = valueAfterLabel(lines, /^Nomor Kegiatan/i) || findFirstMatch(lines, /(KPD-\d+\/\d+-\d+)/i);
  result.nomorST = valueAfterLabel(lines, /^Nomor ST/i) || findFirstMatch(lines, /(ST-\d+\/[A-Z.0-9]+\/\d+)/i);
  result.lampiranST = [valueAfterLabel(lines, /^Lampiran ST/i)].filter(Boolean);
  result.tanggalKegiatan = valueAfterLabel(lines, /^Tanggal Kegiatan/i);
  result.kotaTujuan = valueAfterLabel(lines, /^Kota Tujuan/i);
  result.output = valueAfterLabel(lines, /^Output/i);
  result.kodeAkun = extractAccountCode(text) || valueAfterLabel(lines, /^Kode Akun/i, { multiline: true, maxLines: 5 });
  result.jenisPembayaran = valueAfterLabel(lines, /^Jenis Pembayaran/i);
  result.totalEstimasiBiaya = currencyAfterLabel(lines, /^Total Estimasi Biaya/i);
  result.totalUangMuka = currencyAfterLabel(lines, /^Total Uang Muka/i);
  result.uangMuka = result.totalUangMuka || 0;
  result.status = valueAfterLabel(lines, /^Status/i);

  return result;
}

export function parseDetailPertanggungjawaban(text: string): ParsedData | null {
  if (!text.trim()) return null;

  const lower = text.toLowerCase();
  const looksLikePertanggungjawaban =
    lower.includes('detail pertanggungjawaban') ||
    lower.includes('total pengeluaran riil') ||
    lower.includes('total kurang bayar') ||
    lower.includes('nomor komitmen anggaran');

  if (!looksLikePertanggungjawaban) return null;

  const lines = linesFromText(text);
  const result = blankParsedData('pertanggungjawaban');
  let inGeotagSection = false;
  let lastHariTanggal = '';

  result.namaKegiatan = valueAfterLabel(lines, /^Nama Kegiatan/i);
  result.idKegiatan = valueAfterLabel(lines, /^Id Kegiatan/i);
  result.nomorST = valueAfterLabel(lines, /^Nomor ST/i) || findFirstMatch(lines, /(ST-\d+\/[A-Z.0-9]+\/\d+)/i);
  result.lampiranST = [valueAfterLabel(lines, /^Lampiran ST/i)].filter(Boolean);
  result.tanggalKegiatan = valueAfterLabel(lines, /^Tanggal Kegiatan/i);
  result.nomorKegiatan = valueAfterLabel(lines, /^Nomor Kegiatan/i) || findFirstMatch(lines, /(KPD-\d+\/\d+-\d+)/i);
  result.nomorKomitmenAnggaran =
    findWindowMatch(lines, /^Nomor Komitmen Anggaran/i, /(NKA-\d+\/\d+-\d+)/i) ||
    findFirstMatch(lines, /(NKA-\d+\/\d+-\d+)/i);
  result.peserta = valueAfterLabel(lines, /^Peserta Kegiatan/i);
  result.uangMuka = currencyAfterLabel(lines, /^Uang Muka/i);
  result.totalPengeluaranRiil = currencyAfterLabel(lines, /^Total Pengeluaran Riil/i);
  result.totalKurangBayar = currencyAfterLabel(lines, /^Total Kurang Bayar/i);
  result.kodeAkun = extractAccountCode(text);

  const ruteMatch = text.match(/terdapat\s+(\d+)\s+Rute/i);
  if (ruteMatch) result.jumlahRute = Number(ruteMatch[1]) || 1;

  for (const line of lines) {
    const lineLower = line.toLowerCase();

    if (lineLower.includes('geotagging') || lineLower.includes('geotag')) {
      inGeotagSection = true;
      continue;
    }

    if (!inGeotagSection) continue;

    if (
      lineLower.includes('items per page') ||
      lineLower.includes('ringkasan') ||
      lineLower.includes('peserta kegiatan') ||
      /^\d+\s*[–-]\s*\d+\s+of\s+\d+$/i.test(line)
    ) {
      inGeotagSection = false;
      continue;
    }

    if (lineLower.includes('hari, tanggal') || lineLower.includes('waktu tagging') || lineLower.includes('lokasi tagging')) {
      continue;
    }

    const geotag = parseGeotagLine(line, lastHariTanggal);
    if (!geotag) continue;

    if (geotag.hariTanggal) lastHariTanggal = geotag.hariTanggal;
    result.geotags.push(geotag);
  }

  return result;
}

export function parsePerjadinClipboard(text: string): ParsedData | null {
  return parseDetailPertanggungjawaban(text) || parseDetailPerjalananDinas(text);
}

function parseGeotagLine(line: string, lastHariTanggal: string): GeotagEntry | null {
  if (!line || line.includes('-\t-') || /^\s*-+\s*$/.test(line)) return null;
  if (/items per page/i.test(line)) return null;

  const tabParts = line.split('\t').map((part) => part.trim()).filter(Boolean);
  if (tabParts.length >= 4 && DATE_RE.test(tabParts[0]) && TIME_RE.test(tabParts[1])) {
    return {
      hariTanggal: tabParts[0],
      waktuTagging: normalizeTime(tabParts[1]),
      lokasiTagging: tabParts.slice(2, -1).join(' '),
      wilayahTagging: tabParts.at(-1) || '',
    };
  }

  if (tabParts.length >= 3 && lastHariTanggal && TIME_RE.test(tabParts[0])) {
    return {
      hariTanggal: lastHariTanggal,
      waktuTagging: normalizeTime(tabParts[0]),
      lokasiTagging: tabParts.slice(1, -1).join(' '),
      wilayahTagging: tabParts.at(-1) || '',
    };
  }

  const fullSpaceRow = line.match(
    /^((?:Sen|Sel|Rab|Kam|Jum|Sab|Min),?\s+\d{1,2}\s+\w+\s+\d{4})\s+(\d{1,2}[:.]\d{2})\s+(.+?)\s+((?:Kota|Kab\.?|Kabupaten)\s+.+)$/i,
  );
  if (fullSpaceRow) {
    return {
      hariTanggal: fullSpaceRow[1],
      waktuTagging: normalizeTime(fullSpaceRow[2]),
      lokasiTagging: fullSpaceRow[3].trim(),
      wilayahTagging: fullSpaceRow[4].trim(),
    };
  }

  const inheritedSpaceRow = line.match(/^(\d{1,2}[:.]\d{2})\s+(.+?)\s+((?:Kota|Kab\.?|Kabupaten)\s+.+)$/i);
  if (inheritedSpaceRow && lastHariTanggal) {
    return {
      hariTanggal: lastHariTanggal,
      waktuTagging: normalizeTime(inheritedSpaceRow[1]),
      lokasiTagging: inheritedSpaceRow[2].trim(),
      wilayahTagging: inheritedSpaceRow[3].trim(),
    };
  }

  const dateOnly = line.match(DATE_RE);
  if (dateOnly && line.includes('-')) return null;

  return null;
}

function normalizeTime(time: string) {
  return time.replace('.', ':');
}

export function parseGeotagTable(text: string): GeotagEntry[] {
  const entries: GeotagEntry[] = [];
  let lastHariTanggal = '';

  for (const line of linesFromText(text)) {
    const geotag = parseGeotagLine(line, lastHariTanggal);
    if (!geotag) continue;

    if (geotag.hariTanggal) lastHariTanggal = geotag.hariTanggal;
    entries.push(geotag);
  }

  return entries;
}

export function detectGeotagPoints(geotags: GeotagEntry[]): {
  start?: GeotagEntry;
  clockIn?: GeotagEntry;
  clockOut?: GeotagEntry;
  end?: GeotagEntry;
} {
  if (geotags.length === 0) return {};

  const sorted = [...geotags];
  if (sorted.length === 1) return { start: sorted[0], clockIn: sorted[0], clockOut: sorted[0], end: sorted[0] };
  if (sorted.length === 2) return { start: sorted[0], clockIn: sorted[1], clockOut: sorted[1], end: sorted[1] };
  if (sorted.length === 3) return { start: sorted[0], clockIn: sorted[1], clockOut: sorted[1], end: sorted[2] };

  return {
    start: sorted[0],
    clockIn: sorted[1],
    clockOut: sorted[sorted.length - 2],
    end: sorted[sorted.length - 1],
  };
}

export function calculateDurationMinutes(clockIn: string, clockOut: string): number {
  const parseTime = (time: string): number => {
    const parts = time.replace(/\./g, ':').trim().split(':');
    if (parts.length < 2) return 0;

    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : 0;
  };

  const inMinutes = parseTime(clockIn);
  const outMinutes = parseTime(clockOut);
  return outMinutes <= inMinutes ? 24 * 60 - inMinutes + outMinutes : outMinutes - inMinutes;
}

export function testParser(text: string): { success: boolean; data?: ParsedData; errors: string[] } {
  const errors: string[] = [];
  const data = parsePerjadinClipboard(text);

  if (!data) {
    errors.push('Parser returned null');
    return { success: false, errors };
  }

  if (!data.namaKegiatan) errors.push('Nama Kegiatan tidak terdeteksi');
  if (!data.idKegiatan) errors.push('ID Kegiatan tidak terdeteksi');
  if (!data.nomorST) errors.push('Nomor ST tidak terdeteksi');
  if (!data.tanggalKegiatan) errors.push('Tanggal tidak terdeteksi');
  if (data.sourceType === 'pertanggungjawaban' && !data.peserta) errors.push('Peserta tidak terdeteksi');
  if (data.sourceType === 'pertanggungjawaban' && data.totalPengeluaranRiil === 0) errors.push('Total Pengeluaran Riil = 0');
  if (data.sourceType === 'pertanggungjawaban' && data.geotags.length === 0) errors.push('Tidak ada geotag terdeteksi');
  if (data.sourceType === 'persetujuan' && !data.kodeAkun) errors.push('Kode akun tidak terdeteksi');

  return { success: errors.length === 0, data, errors };
}
