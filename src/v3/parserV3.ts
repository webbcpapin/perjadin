import type { CostComponentV4, GeotagEntryV3, ParsedPerjadinV3, RouteV3 } from './types';

const ACCOUNT_RE = /\b\d{6}\.\d{3}\.\d{6}(?:\.[A-Z0-9]+){3,15}\b/i;
const DATE_NUMERIC_RE = /^\d{2}-\d{2}-\d{4}$/;
const TIME_RE = /^\d{1,2}[:.]\d{2}$/;
const COMPONENT_STATUS_RE = /^(Dikirim|Draft|Disetujui(?:\s+PPK)?|Ditolak(?:\s+PPK)?|Dibatalkan|Dibayar|Selesai|Menunggu(?:\s+Persetujuan)?(?:\s+PPK)?|Diajukan(?:\s+ke\s+PPK)?)$/i;

const FIELD_LABELS = [
  'Nama Kegiatan', 'Id Kegiatan', 'Nomor ST', 'Lampiran ST', 'Nomor Kegiatan',
  'Rute Perjalanan Dinas', 'Presensi Perjalanan Dinas', 'DIPA Inisiator', 'PPK',
  'No SPD', 'Nomor SPD', 'No Perjalanan', 'Menginap?', 'Total Nilai Riil',
  'Nilai SBM Awal', 'Efisiensi', 'Durasi Perjalanan', 'Total Nilai SBM', 'Nilai Riil',
  'Bukti Dukung', 'Keterangan', 'Ringkasan', 'Pelaksana SPD', 'Peserta Kegiatan',
  'NIP', 'Uang Muka', 'Total Pengeluaran Riil', 'Log Data Presensi', 'GEOTAGGING',
  'Hari, Tanggal', 'Waktu Tagging', 'Wilayah', 'Lokasi Geo Tagging',
];

function cleanMarkdown(value: string) {
  return value
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/^[-•]\s+/, '')
    .replace(/^svg\s*/i, '')
    .replace(/\\-/g, '-')
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

function isFieldLabel(line: string) {
  const normalized = cleanMarkdown(line).replace(/:$/, '').trim();
  return FIELD_LABELS.some((label) => normalized.toLowerCase() === label.toLowerCase())
    || /^Rute\s+\d+$/i.test(normalized)
    || /^Pada Perjalanan Dinas ini terdapat\s+\d+\s+Rute$/i.test(normalized)
    || /^Komponen Biaya\b/i.test(normalized)
    || /^(Uang Harian(?: Dalam Kota)?|Biaya Tiket Pesawat|Uang Penginapan|Uang Taksi Asal|Uang Taksi Tujuan|Biaya Penginapan Lain|Biaya Transportasi Lain)$/i.test(normalized);
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
      if (isFieldLabel(candidate)) break;
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
  const match = value.match(/\bRp\s*((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)(?![\d.,])/i);
  if (!match) return undefined;
  const amount = Number(match[1].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(amount) ? amount : undefined;
}

function currencyAfterLabel(lines: string[], label: RegExp, maxLookahead = 5) {
  for (let i = 0; i < lines.length; i++) {
    if (!label.test(lines[i])) continue;
    for (let j = i; j < lines.length && j <= i + maxLookahead; j++) {
      const value = parseRupiah(lines[j]);
      if (j > i && isFieldLabel(lines[j]) && !label.test(lines[j])) break;
      if (value !== undefined) return value;
    }
  }
  return undefined;
}

function numberAfterLabel(lines: string[], label: RegExp) {
  const value = valueAfterLabel(lines, label);
  const match = value.match(/-?[\d.,]+/);
  if (!match) return 0;
  return Number(match[0].replace(/\./g, '').replace(',', '.')) || 0;
}

function extractAccountCode(text: string) {
  return text.match(ACCOUNT_RE)?.[0].toUpperCase() || '';
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

  const single = clean.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*\((\d+)\s+Hari\)$/i);
  if (single) {
    const date = `${single[1]} ${single[2]} ${single[3]}`;
    return { start: date, end: date, combined: date, duration: Number(single[4]) || 1 };
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
    for (let j = i + 1; j < lines.length && j <= i + 7; j++) {
      const candidate = lines[j];
      if (/^Rute\s+\d+$/i.test(candidate)) break;
      const parsedRange = parseDateRangeLine(candidate);
      if (!destination && !isFieldLabel(candidate) && !parsedRange) destination = candidate;
      if (parsedRange) {
        range = parsedRange;
        break;
      }
    }
    if (!range) continue;
    const next = lines.findIndex((line, j) => j > i && (/^Rute\s+\d+$/i.test(line) || /^Ringkasan$/i.test(line)));
    routes.push({
      nomorRute: Number(routeMatch[1]) || routes.length + 1,
      tujuan: destination,
      tanggalMulai: range.start,
      tanggalSelesai: range.end,
      tanggalKegiatan: range.combined,
      durasiHari: range.duration,
      menginap: parseMenginap(lines.slice(i, next < 0 ? undefined : next)),
    });
  }
  return routes;
}

function parseMenginap(lines: string[]) {
  for (let i = 0; i < lines.length; i++) {
    if (!/^Menginap\?$/i.test(lines[i])) continue;
    const options = [];
    for (let j = i + 1; j < lines.length && j <= i + 3; j++) {
      const candidate = cleanMarkdown(lines[j]);
      if (/^(Ya|Tidak)$/i.test(candidate)) { options.push(candidate); continue; }
      if (/^Ya\s*Tidak$/i.test(candidate) || /^YaTidak$/i.test(candidate)) return 'Tidak Terbaca';
      break;
    }
    return options.length === 1 ? options[0] : 'Tidak Terbaca';
  }
  return 'Tidak Terbaca';
}

function normalizeComponentStatus(value: string) {
  const status = cleanMarkdown(value);
  if (/^Disetujui(?:\s+PPK)?$/i.test(status)) return 'Disetujui';
  if (/^Ditolak(?:\s+PPK)?$/i.test(status)) return 'Ditolak';
  if (/^Dikirim$/i.test(status)) return 'Dikirim';
  if (/^Draft$/i.test(status)) return 'Draft';
  if (/^Dibatalkan$/i.test(status)) return 'Dibatalkan';
  if (/^Dibayar$/i.test(status)) return 'Dibayar';
  if (/^Selesai$/i.test(status)) return 'Selesai';
  return status;
}

function parseComponents(lines: string[]): CostComponentV4[] {
  const components: CostComponentV4[] = [];
  let nomorRute = 0;
  for (let i = 0; i < lines.length; i++) {
    const route = lines[i].match(/^Rute\s+(\d+)$/i);
    if (route) nomorRute = Number(route[1]);
    if (!COMPONENT_STATUS_RE.test(lines[i])) continue;

    const status = normalizeComponentStatus(lines[i]);
    let name = '';
    for (let j = i - 1; j >= 0 && j >= i - 3; j--) {
      const candidate = cleanMarkdown(lines[j]);
      if (!candidate || COMPONENT_STATUS_RE.test(candidate) || /^Rp\s*/i.test(candidate)) continue;
      if (/^(No SPD|Nomor SPD|No Perjalanan|Menginap\?|Total Nilai Riil|Nilai SBM Awal|Total Nilai SBM|Ringkasan)$/i.test(candidate)) break;
      if (/^(Ya|Tidak|YaTidak)$/i.test(candidate)) continue;
      name = candidate;
      break;
    }
    if (!name) continue;

    let nilaiRiil: number | undefined;
    for (let j = i + 1; j < lines.length && j <= i + 6; j++) {
      if (/^Total Nilai Riil$/i.test(lines[j])) {
        for (let k = j + 1; k < lines.length && k <= j + 3; k++) {
          if (/^Rp\s*/i.test(lines[k])) {
            nilaiRiil = parseRupiah(lines[k]);
            break;
          }
        }
        break;
      }
      if (COMPONENT_STATUS_RE.test(lines[j])) break;
    }

    if (nilaiRiil === undefined || !nomorRute) continue;
    components.push({ nomorRute, nama: name, status, nilaiRiil });
  }
  return components;
}

function parseMarkdownTableGeotags(text: string) {
  const entries: GeotagEntryV3[] = [];
  let currentDate = '';
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.includes('|')) continue;
    const cells = raw.split('|').map(cleanMarkdown).filter((cell) => cell && !/^[-:]+$/.test(cell));
    if (cells.length < 2) continue;
    if (cells.some((cell) => /HARI, TANGGAL|WAKTU TAGGING|LOKASI GEO/i.test(cell))) continue;

    const first = cells[0] || '';
    const dateIndex = DATE_NUMERIC_RE.test(first) ? 0 : -1;
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
  const rawLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let currentDate = '';

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    if (!raw.includes('\t')) continue;
    const parts = raw.split('\t').map(cleanMarkdown);
    if (parts.some((part) => /HARI, TANGGAL|WAKTU TAGGING|LOKASI GEO/i.test(part))) continue;

    if (DATE_NUMERIC_RE.test(parts[0] || '')) currentDate = parts[0];
    const timeIndex = parts.findIndex((part) => TIME_RE.test(part));
    if (timeIndex < 0 || !currentDate) continue;

    const wilayah = parts[timeIndex + 1] || '';
    let lokasi = parts[timeIndex + 2] || '';
    if (!wilayah) continue;

    if (!lokasi) {
      for (let j = i + 1; j < rawLines.length && j <= i + 2; j++) {
        const candidate = cleanMarkdown(rawLines[j]);
        if (!candidate) continue;
        if (rawLines[j].includes('\t') || /^Ringkasan$/i.test(candidate)) break;
        lokasi = candidate;
        break;
      }
    }

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

    // Satu Kemenkeu commonly copies date, time, and region on one line,
    // followed by the geotag address on the next line.
    const combined = line.match(/^(\d{2}-\d{2}-\d{4})\s+(\d{1,2}[:.]\d{2})\s+(.+)$/);
    const day = line.match(/^(\d{2}-\d{2}-\d{4})(?:\s+-.*)?$/);
    if (day) { currentDate = day[1]; continue; }
    if (combined) currentDate = combined[1];
    const inline = combined ? [combined[0], combined[2], combined[3]] : line.match(/^(\d{1,2}[:.]\d{2})\s+(.+)$/);
    if (inline && currentDate) {
      const next = lines[i + 1];
      const address = next && !isFieldLabel(next) && !/^(?:\d{2}-\d{2}-\d{4}|\d{1,2}[:.]\d{2}\b)/.test(next) ? next : '';
      entries.push({
        hariTanggal: currentDate,
        waktuTagging: inline[1].replace('.', ':'),
        wilayahTagging: inline[2],
        lokasiTagging: address,
      });
      if (address) i++;
      continue;
    }

    if (!TIME_RE.test(line) || !currentDate) continue;
    const wilayah = lines[i + 1] && !isFieldLabel(lines[i + 1]) ? lines[i + 1] : '';
    const lokasi = lines[i + 2] && !isFieldLabel(lines[i + 2]) ? lines[i + 2] : '';
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

function parseGeotags(text: string, lines: string[]) {
  const markdown = parseMarkdownTableGeotags(text);
  if (markdown.length > 0) return markdown;

  const tabular = parseTabularGeotags(text);
  if (tabular.length > 0) return tabular;

  return parseSequentialGeotags(lines);
}

function normalizeDipa(value: string) {
  return value.replace(/[()]/g, '').trim();
}

export function parseEPerjadinV3(text: string): ParsedPerjadinV3 | null {
  if (!text.trim()) return null;
  const lower = text.toLowerCase();
  if (!lower.includes('detail pertanggungjawaban') && !lower.includes('pelaksana spd') && !lower.includes('total pengeluaran riil')) return null;

  const lines = textLines(text);
  const routes = parseRoutes(lines);
  const components = parseComponents(lines);
  const geotags = parseGeotags(text, lines);
  const primaryRoute = routes[0];
  const ruteMatch = text.match(/terdapat\s+(\d+)\s+Rute/i);

  const namaKegiatan = valueAfterLabel(lines, /^Nama Kegiatan$/i);
  const idKegiatan = valueAfterLabel(lines, /^Id Kegiatan$/i) || valueByInlinePrefix(lines, /^Id Kegiatan\s*:?\s*(.+)$/i);
  const nomorST = valueAfterLabel(lines, /^Nomor ST$/i) || valueByInlinePrefix(lines, /^(ST-\d+\/[A-Z0-9.]+\/\d+)$/i);
  const nomorKegiatanRaw = valueAfterLabel(lines, /^Nomor Kegiatan$/i);
  const nomorKegiatan = nomorKegiatanRaw === '-' ? '' : nomorKegiatanRaw;
  const peserta = valueAfterLabel(lines, /^Pelaksana SPD$/i) || valueAfterLabel(lines, /^Peserta Kegiatan$/i);
  const nip = valueByInlinePrefix(lines, /^NIP\s*:?\s*(\d{8,})$/i) || valueAfterLabel(lines, /^NIP$/i);
  const nomorSPD = valueAfterLabel(lines, /^(?:No|Nomor) SPD$/i) || valueByInlinePrefix(lines, /^(SPD-\d+\/\d+-\d+)$/i);
  const nomorPerjalananRaw = valueAfterLabel(lines, /^No Perjalanan$/i);
  const nomorPerjalanan = nomorPerjalananRaw === '-' ? '' : nomorPerjalananRaw;
  const dipaInisiator = normalizeDipa(
    valueAfterLabel(lines, /^DIPA Inisiator(?:\s*\([^)]*\))?$/i) ||
      valueByInlinePrefix(lines, /^DIPA Inisiator\s*\(([^)]+)\)$/i),
  );
  const ppk = valueAfterLabel(lines, /^PPK$/i);
  const uangMuka = currencyAfterLabel(lines, /^Uang Muka$/i);
  const totalPengeluaranRiil = currencyAfterLabel(lines, /^Total Pengeluaran Riil$/i);
  const nilaiSBMAwal = currencyAfterLabel(lines, /^Nilai SBM Awal$/i);
  const totalNilaiSBM = currencyAfterLabel(lines, /^Total Nilai SBM$/i);
  const efisiensi = numberAfterLabel(lines, /^Efisiensi$/i);
  const durationFromLabel = numberAfterLabel(lines, /^Durasi Perjalanan$/i);
  const lampiran = valueAfterLabel(lines, /^Lampiran ST$/i);
  const menginap = parseMenginap(lines);
  const uangHarian = components.find((item) => /^Uang Harian\b/i.test(item.nama));

  return {
    schemaVersion: 4,
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
    nomorPerjalanan,
    tujuan: primaryRoute?.tujuan || '',
    tanggalMulai: primaryRoute?.tanggalMulai || '',
    tanggalSelesai: primaryRoute?.tanggalSelesai || '',
    tanggalKegiatan: primaryRoute?.tanggalKegiatan || '',
    durasiHari: durationFromLabel || primaryRoute?.durasiHari || 1,
    menginap,
    statusUangHarian: uangHarian?.status || '',
    uangMuka: uangMuka ?? 0,
    uangMukaTerbaca: uangMuka !== undefined,
    totalResmiTerbaca: totalPengeluaranRiil !== undefined,
    presensiStatus: geotags.length ? 'ada' : /log data presensi|geotagging/i.test(text) && /tidak ada data|belum ada presensi|\d{2}-\d{2}-\d{4}[\t ]+-/i.test(text) ? 'kosong' : 'belum_terbaca',
    totalPengeluaranRiil: totalPengeluaranRiil ?? 0,
    nilaiSBMAwal: nilaiSBMAwal ?? 0,
    totalNilaiSBM: totalNilaiSBM ?? 0,
    totalNilaiRiil: totalPengeluaranRiil ?? 0,
    efisiensi,
    kodeAkun: extractAccountCode(text),
    routes,
    components,
    geotags,
  };
}
