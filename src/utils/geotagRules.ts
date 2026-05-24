import type { GeotagEntry } from '@/types';

export type GeotagPointKey = 'start' | 'clockIn' | 'clockOut' | 'end';

export interface SelectedGeotagPoints {
  start?: GeotagEntry;
  clockIn?: GeotagEntry;
  clockOut?: GeotagEntry;
  end?: GeotagEntry;
}

export interface GeotagRuleIssue {
  key: GeotagPointKey;
  label: string;
  expectedDate: string;
  expectedLocation: string;
  message: string;
}

export interface GeotagRuleResult {
  points: SelectedGeotagPoints;
  status: 'Lengkap' | 'Perlu Surat Pernyataan';
  issues: GeotagRuleIssue[];
  startDate: string;
  endDate: string;
}

const monthMap: Record<string, number> = {
  jan: 1,
  januari: 1,
  feb: 2,
  februari: 2,
  mar: 3,
  maret: 3,
  apr: 4,
  april: 4,
  mei: 5,
  jun: 6,
  juni: 6,
  jul: 7,
  juli: 7,
  agu: 8,
  agustus: 8,
  sep: 9,
  september: 9,
  okt: 10,
  oktober: 10,
  nov: 11,
  november: 11,
  des: 12,
  desember: 12,
};

const labels: Record<GeotagPointKey, string> = {
  start: 'START',
  clockIn: 'CLOCK IN',
  clockOut: 'CLOCK OUT',
  end: 'END',
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function normalizeDateValue(raw: string) {
  const clean = raw.replace(/\s+/g, ' ').replace(/,/g, '').trim();
  const numeric = clean.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (numeric) return `${numeric[3]}-${pad(Number(numeric[2]))}-${pad(Number(numeric[1]))}`;

  const textDate = clean.match(/(?:Sen|Sel|Rab|Kam|Jum|Sab|Min)?\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
  if (!textDate) return '';

  const month = monthMap[textDate[2].toLowerCase()];
  if (!month) return '';
  return `${textDate[3]}-${pad(month)}-${pad(Number(textDate[1]))}`;
}

export function parseActivityDateRange(tanggalKegiatan: string) {
  const dates = tanggalKegiatan.match(/\d{1,2}-\d{1,2}-\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4}/g) || [];
  const startDate = normalizeDateValue(dates[0] || tanggalKegiatan);
  const endDate = normalizeDateValue(dates[1] || dates[0] || tanggalKegiatan);
  return { startDate, endDate };
}

function normalizeLocation(raw: string) {
  return raw
    .toLowerCase()
    .replace(/pangkal\s*pinang/g, 'pangkalpinang')
    .replace(/\bkabupaten\b/g, 'kab')
    .replace(/\bkab\./g, 'kab')
    .replace(/\bkota\b/g, '')
    .replace(/\bkab\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPangkalpinang(geotag: GeotagEntry) {
  return normalizeLocation(geotag.wilayahTagging || geotag.lokasiTagging).includes('pangkalpinang');
}

function isDestination(geotag: GeotagEntry, tujuan: string) {
  const normalizedDestination = normalizeLocation(tujuan);
  const normalizedRegion = normalizeLocation(geotag.wilayahTagging);
  const normalizedAddress = normalizeLocation(geotag.lokasiTagging);
  if (!normalizedDestination) return false;

  // Tujuan luar kota tidak boleh tertukar dengan alamat Pangkalpinang yang
  // sering memuat nama provinsi "Bangka Belitung" di lokasi tagging lengkap.
  if (!normalizedDestination.includes('pangkalpinang') && normalizedRegion.includes('pangkalpinang')) return false;

  if (normalizedRegion) {
    return normalizedRegion === normalizedDestination || normalizedRegion.includes(normalizedDestination);
  }

  return normalizedAddress.includes(normalizedDestination);
}

function timeToMinutes(raw: string) {
  const [hours, minutes] = raw.replace('.', ':').split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
}

function geotagDate(geotag: GeotagEntry) {
  return normalizeDateValue(geotag.hariTanggal);
}

function selectByRule(
  geotags: GeotagEntry[],
  date: string,
  matcher: (geotag: GeotagEntry) => boolean,
  mode: 'earliest' | 'latest',
) {
  const candidates = geotags
    .filter((geotag) => geotagDate(geotag) === date && matcher(geotag))
    .sort((a, b) => timeToMinutes(a.waktuTagging) - timeToMinutes(b.waktuTagging));

  return mode === 'earliest' ? candidates[0] : candidates.at(-1);
}

function issue(key: GeotagPointKey, expectedDate: string, expectedLocation: string): GeotagRuleIssue {
  return {
    key,
    label: labels[key],
    expectedDate,
    expectedLocation,
    message: `${labels[key]} tidak ditemukan sesuai tanggal/lokasi yang dipersyaratkan.`,
  };
}

export function selectRequiredGeotagPoints(
  geotags: GeotagEntry[],
  tanggalKegiatan: string,
  tujuan: string,
): GeotagRuleResult {
  const { startDate, endDate } = parseActivityDateRange(tanggalKegiatan);
  const points: SelectedGeotagPoints = {
    start: selectByRule(geotags, startDate, isPangkalpinang, 'earliest'),
    clockIn: selectByRule(geotags, startDate, (geotag) => isDestination(geotag, tujuan), 'earliest'),
    clockOut: selectByRule(geotags, endDate, (geotag) => isDestination(geotag, tujuan), 'latest'),
    end: selectByRule(geotags, endDate, isPangkalpinang, 'latest'),
  };

  const issues: GeotagRuleIssue[] = [];
  if (!points.start) issues.push(issue('start', startDate, 'Pangkalpinang'));
  if (!points.clockIn) issues.push(issue('clockIn', startDate, tujuan));
  if (!points.clockOut) issues.push(issue('clockOut', endDate, tujuan));
  if (!points.end) issues.push(issue('end', endDate, 'Pangkalpinang'));

  return {
    points,
    status: issues.length === 0 ? 'Lengkap' : 'Perlu Surat Pernyataan',
    issues,
    startDate,
    endDate,
  };
}

export function geotagPointLabel(geotag?: GeotagEntry) {
  if (!geotag) return 'Tidak ditemukan';
  return `${geotag.hariTanggal} ${geotag.waktuTagging} ${geotag.wilayahTagging}`;
}
