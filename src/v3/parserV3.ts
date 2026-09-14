import { normalizeAccountCode } from '../data/perjadinAccounts';
import type { GeotagEntryV3, ParsedPerjadinV3, RouteV3 } from './types';

const ACCOUNT_RE = /636722\.015\.52411[13]\.01505(?:CC|WA)\.\d{4}[A-Z]{3}\.A000000001\.00000\.2\.3051\.2\.000000\.000000/i;
const DATE_NUMERIC_RE = /^\d{2}-\d{2}-\d{4}$/;
const TIME_RE = /^\d{1,2}[:.]\d{2}$/;

const LABELS = [
  'Nama Kegiatan',
  'Id Kegiatan',
  'Nomor ST',
  'Lampiran ST',
  'Nomor Kegiatan',
  'Rute Perjalanan Dinas',
  'Presensi Perjalanan Dinas',
  'DIPA Inisiator',
  'PPK',
  'No SPD',
  'Nomor SPD',
  'No Perjalanan',
  'Uang Harian',
  'Total Nilai Riil',
  'Nilai SBM Awal',
  'Efisiensi',
  'Durasi Perjalanan',
  'Total Nilai SBM',
  'Komponen Biaya Uang Harian',
  'Nilai Riil',
  'Bukti Dukung',
  'Keterangan',
  'Ringkasan',
  'Pelaksana SPD',
  'Peserta Kegiatan',
  'NIP',
  'Uang Muka',
  'Total Pengeluaran Riil',
  'Log Data Presensi',
  'GEOTAGGING',
  'Hari, Tanggal',
  'Waktu Tagging',
  'Wilayah',
  'Lokasi Geo Tagging',
];

function cleanMarkdown(value: string) {
  return value
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/^[-•]\s+/, '')
    .replace(/^svg\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function textLines(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(cleanMarkdown)
    .filter(Boolean)
    .filter((line) => !/^[-:| ]+$/.test(line));
}

function isLabel(line: string) {
  const normalized = cleanMarkdown(line).replace(/:$/, '').trim();
  return LABELS.some((label) => normalized.toLowerCase() === label.toLowerCase()) || /^Rute\s+\d+$/i.test(normalized);
}

function valueAfterLabel(lines: string[], label: RegExp, maxLookahead = 5) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!label.test(line)) continue;

    const inline = cleanMarkdown(line.replace(label, '').replace(/^[:\s-]+/, ''));
    if (inline && !/^svg$/i.test(inline)) return inline;

    for (let j = i + 1; j < lines.length && j <= i + maxLookahead; j++) {
      const candidate = cleanMarkdown(lines[j]);
      if (!candidate || /^svg$/i.test(candidate)) continue;
      if (isLabel(candidate)) break;
      return candidate;
    }
  }
  return '';
}

function valueByInlinePrefix(lines: string[], prefix: RegExp) {
  for (const line of lines) {
    const match = line.match(prefix);
    if (match?.[1]) return cleanMarkdown(match[1]);
  }
  return '';
}

function parseRupiah(value: string) {
  const match = value.match(/Rp\s*([\d.,]+)/i);
  if (!match) return 0;
  const compact = match[1].replace(/\./g, '').replace(',', '.');
  return Number(compact) || 0;
}

function currencyAfterLabel(lines: string[], label: RegExp, maxLookahead = 5) {
  for (let i = 0; i < lines.length; i++) {
    if (!label.test(lines[i])) continue;
    for (let j = i; j < lines.length && j <= i + maxLookahead; j++) {
      if (j > i && isLabel(lines[j])) break;
      const value = parseRupiah(lines[j]);
      if (value || /Rp\s*0(?:[.,]0+)?/i.test(lines[j])) return value;
    }
  }
  return 0;
}

function numberAfterLabel(lines: string[], label: RegExp) {
  const value = valueAfterLabel(lines, label);
  const match = value.match(/-?[\d.,]+/);
  if (!match) return 0;
  return Number(match[0].replace(/\./g, '').replace(',', '.')) || 0;
}

function extractAccountCode(text: string) {
  const match = text.replace(/\s+/g, '').match(ACCOUNT_RE);
  return match ? normalizeAccountCode(match[0]) : '';
}

function parseDateRangeLine(line: string) {
  const clean = cleanMarkdown(line);
  const long = clean.match(
    /^(\d{1,2})(?:\s+([A-Za-z]+)\s+(\d{4}))?\s+s\.d\.\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*\((\d+)\s+Hari\)$/i,
  );
  if (long) {
    const startMonth = long[2] || long[5];
    const startYear = long[3] || long[6];
    const start = `${long[1]} ${startMonth} ${startYear}`;
    const end = `${long[4]} ${long[5]} ${long[6]}`;
    return { start, end, combined: `${start} s/d ${end}`, duration: Number(long[7]) || 1 };
  }

  const numeric = clean.match(/^(\d{2}-\d{2}-\d{4})\s+s\/?d\.?\s+(\d{2}-\d{2}-\d{4})(?:\s*\((\d+)\s+Hari\))?$/i);
  if (numeric) {
    return {
      start: numeric[1],
      end: numeric[2],
      combined: `${numeric[1]} s/d ${numeric[2]}`,
      duration: Number(numeric[3]) || 1,
    };
  }

  return null;
}

function parseRoutes(lines: string[]): RouteV3[] {
  const routes: RouteV3[] = [];
  for (let i = 0; i < lines.length; i++) {
    const routeMatch = lines[i].match(/^Rute\s+(\d+)$/i);
    if (!routeMatch) continue;

    let destination = '';
    let range: ReturnType<typeof parseDateRangeLine> = null;
    for (let j = i + 1; j < lines.length && j <= i + 6; j++) {
      const candidate = lines[j];
      if (!destination && !isLabel(candidate) && !parseDateRangeLine(candidate)) destination = candidate;
      const parsedRange = parseDateRangeLine(candidate);
      if (parsedRange) {
        range = parsedRange;
        break;
      }
    }

    if (!range) continue;
    routes.push({
      nomorRute: Number(routeMatch[1]) || routes.length + 1,
      tujuan: destination,
      tanggalMulai: range.start,
      tanggalSelesai: range.end,
      tanggalKegiatan: range.combined,
      durasiHari: range.duration,
    });
  }
  return routes;
}

function parseMarkdownTableGeotags(text: string) {
  const entries: GeotagEntryV3[] = [];
  let currentDate = '';

  for (const raw of text.split(/\r?\n/)) {
    if (!raw.includes('|')) continue;
    const cells = raw
      .split('|')
      .map(cleanMarkdown)
      .filter((cell) => cell && !/^[-:]+$/.test(cell));
    if (cells.length < 2) continue;
    if (cells.some((cell) => /HARI, TANGGAL|WAKTU TAGGING|LOKASI GEO/i.test(cell))) continue;

    const first = cells[0] || '';
    let dateIndex = DATE_NUMERIC_RE.test(first) ? 0 : -1;
    if (dateIndex === 0) currentDate = first;

    const timeIndex = cells.findIndex((cell, index) => index > dateIndex && TIME_RE.test(cell));
    if (timeIndex < 0 || !currentDate) continue;

    const wilayah = cells[timeIndex + 1] || '';
    const lokasi = cells[timeIndex + 2] || '';
    if (!wilayah || /lihat di map|svg/i.test(wilayah)) continue;

    entries.push({
      hariTanggal: currentDate,
      waktuTagging: cells[timeIndex].replace('.', ':'),
      wilayahTagging: wilayah,
      lokasiTagging: /lihat di map|svg/i.test(lokasi) ? '' : lokasi,
    });
  }

  return entries;
}

function parseTabularGeotags(text: string) {
  const entries: GeotagEntryV3[] = [];
  let currentDate = '';
  for (const raw of text.split(/\r?\n/)) {
    const parts = raw.split('\t').map(cleanMarkdown).filter(Boolean);
    if (parts.length < 2) continue;
    if (DATE_NUMERIC_RE.test(parts[0])) currentDate = parts[0];
    const timeIndex = parts.findIndex((part) => TIME_RE.test(part));
    if (timeIndex < 0 || !currentDate) continue;
    const wilayah = parts[timeIndex + 1] || '';
    const lokasi = parts[timeIndex + 2] || '';
    if (!wilayah) continue;
    entries.push({
      hariTanggal: currentDate,
      waktuTagging: parts[timeIndex].replace('.', ':'),
      wilayahTagging: wilayah,
      lokasiTagging: lokasi,
    });
  }
  return entries;
}

function parseSequentialGeotags(lines: string[]) {
  const entries: GeotagEntryV3[] = [];
  let currentDate = '';
  let active = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();
    if (lower.includes('geotagging') || lower.includes('log data presensi')) {
      active = true;
      continue;
    }
    if (!active) continue;
    if (lower === 'ringkasan' && entries.length > 0) break;
    if (/hari, tanggal|waktu tagging|lokasi geo tagging|lihat di map/i.test(line)) continue;
    if (DATE_NUMERIC_RE.test(line)) {
      currentDate = line;
      continue;
    }

    const inline = line.match(/^(?:(\d{2}-\d{2}-\d{4})\s+)?(\d{1,2}:\d{2})\s+([^|]+?)(?:\s{2,}|\t)(.+)$/);
    if (inline) {
      if (inline[1]) currentDate = inline[1];
      if (currentDate) {
        entries.push({
          hariTanggal: currentDate,
          waktuTagging: inline[2],
          wilayahTagging: cleanMarkdown(inline[3]),
          lokasiTagging: cleanMarkdown(inline[4]),
        });
      }
      continue;
    }

    if (!TIME_RE.test(line) || !currentDate) continue;
    const wilayah = lines[i + 1] && !isLabel(lines[i + 1]) ? lines[i + 1] : '';
    const lokasi = lines[i + 2] && !isLabel(lines[i + 2]) ? lines[i + 2] : '';
    if (!wilayah) continue;
    entries.push({
      hariTanggal: currentDate,
      waktuTagging: line.replace('.', ':'),
      wilayahTagging: wilayah,
      lokasiTagging: lokasi,
    });
    i += lokasi ? 2 : 1;
  }

  return entries;
}

function dedupeGeotags(entries: GeotagEntryV3[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.hariTanggal}|${entry.waktuTagging}|${entry.wilayahTagging}|${entry.lokasiTagging}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseGeotags(text: string, lines: string[]) {
  const markdown = parseMarkdownTableGeotags(text);
  const tabular = parseTabularGeotags(text);
  const sequential = parseSequentialGeotags(lines);
  return dedupeGeotags([...markdown, ...tabular, ...sequential]);
}

function normalizeDipa(value: string) {
  return value.replace(/[()]/g, '').trim();
}

function inferStatusUangHarian(lines: string[]) {
  for (let i = 0; i < lines.length; i++) {
    if (!/^Uang Harian$/i.test(lines[i])) continue;
    for (let j = i + 1; j < lines.length && j <= i + 4; j++) {
      const value = cleanMarkdown(lines[j]);
      if (!value || /^svg$/i.test(value)) continue;
      if (/^Rp\s*/i.test(value)) break;
      if (isLabel(value)) break;
      return value;
    }
  }
  return '';
}

export function parseEPerjadinV3(text: string): ParsedPerjadinV3 | null {
  if (!text.trim()) return null;
  const lower = text.toLowerCase();
  if (!lower.includes('detail pertanggungjawaban') && !lower.includes('pelaksana spd') && !lower.includes('total nilai riil')) {
    return null;
  }

  const lines = textLines(text);
  const routes = parseRoutes(lines);
  const primaryRoute = routes[0];
  const ruteMatch = text.match(/terdapat\s+(\d+)\s+Rute/i);

  const namaKegiatan = valueAfterLabel(lines, /^Nama Kegiatan$/i);
  const idKegiatan = valueAfterLabel(lines, /^Id Kegiatan$/i) || valueByInlinePrefix(lines, /^Id Kegiatan\s*:?\s*(.+)$/i);
  const nomorST = valueAfterLabel(lines, /^Nomor ST$/i) || valueByInlinePrefix(lines, /^(ST-\d+\/[A-Z0-9.]+\/\d+)$/i);
  const nomorKegiatan = valueAfterLabel(lines, /^Nomor Kegiatan$/i) || valueByInlinePrefix(lines, /^(KPD-\d+\/\d+-\d+)$/i);
  const peserta = valueAfterLabel(lines, /^Pelaksana SPD$/i) || valueAfterLabel(lines, /^Peserta Kegiatan$/i);
  const nip = valueByInlinePrefix(lines, /^NIP\s*:?[\s]*(\d{8,})$/i) || valueAfterLabel(lines, /^NIP$/i);
  const nomorSPD = valueAfterLabel(lines, /^(?:No|Nomor) SPD$/i) || valueByInlinePrefix(lines, /^(SPD-\d+\/\d+-\d+)$/i);
  const nomorPerjalanan = valueAfterLabel(lines, /^No Perjalanan$/i);
  const dipaInisiator = normalizeDipa(valueAfterLabel(lines, /^DIPA Inisiator(?:\s*\([^)]*\))?$/i) || valueByInlinePrefix(lines, /^DIPA Inisiator\s*\(([^)]+)\)$/i));
  const ppk = valueAfterLabel(lines, /^PPK$/i);
  const totalPengeluaranRiil = currencyAfterLabel(lines, /^Total Pengeluaran Riil$/i);
  const uangMuka = currencyAfterLabel(lines, /^Uang Muka$/i);
  const nilaiSBMAwal = currencyAfterLabel(lines, /^Nilai SBM Awal$/i);
  const totalNilaiSBM = currencyAfterLabel(lines, /^Total Nilai SBM$/i);
  const totalNilaiRiil = currencyAfterLabel(lines, /^Total Nilai Riil$/i) || totalPengeluaranRiil;
  const efisiensi = numberAfterLabel(lines, /^Efisiensi$/i);
  const durationFromLabel = numberAfterLabel(lines, /^Durasi Perjalanan$/i);
  const geotags = parseGeotags(text, lines);
  const lampiran = valueAfterLabel(lines, /^Lampiran ST$/i);

  return {
    schemaVersion: 3,
    sourceType: 'pertanggungjawaban',
    namaKegiatan,
    idKegiatan,
    nomorST,
    lampiranST: lampiran ? [lampiran] : [],
    nomorKegiatan,
    jumlahRute: Number(ruteMatch?.[1]) || routes.length || 1,
    dipaInisiator,
    ppk,
    peserta,
    nip,
    nomorSPD,
    nomorPerjalanan: nomorPerjalanan === '-' ? '' : nomorPerjalanan,
    tujuan: primaryRoute?.tujuan || '',
    tanggalKegiatan: primaryRoute?.tanggalKegiatan || '',
    durasiHari: durationFromLabel || primaryRoute?.durasiHari || 1,
    statusUangHarian: inferStatusUangHarian(lines),
    uangMuka,
    totalPengeluaranRiil,
    nilaiSBMAwal,
    totalNilaiSBM,
    totalNilaiRiil,
    efisiensi,
    kodeAkun: extractAccountCode(text),
    routes,
    geotags,
  };
}
