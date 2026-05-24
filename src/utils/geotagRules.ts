import type { GeotagEntry } from '@/types';

export type GeotagPointKey = 'start' | 'clockIn' | 'clockOut' | 'end';
export type GeotagStatus = 'Lengkap' | 'Tidak Lengkap' | 'Tidak Sesuai';

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
  status: GeotagStatus;
  issues: GeotagRuleIssue[];
  startDate: string;
  endDate: string;
  tujuanResolved: string;
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

const pangkalpinangKeywords = [
  'pangkalpinang',
  'pangkal pinang',
  'pangkal balam',
  'lontong pancur',
  'pasir garam',
  'jalan yos sudarso',
  'jl yos sudarso',
  'yos sudarso no177',
  'yos sudarso nomor 177',
];

const destinationAliases: Array<{ canonical: string; aliases: string[] }> = [
  {
    canonical: 'Kota Pangkalpinang',
    aliases: ['kota pangkalpinang', 'kota pangkal pinang', 'pangkalpinang', 'pangkal pinang', 'pangkal balam', 'lontong pancur'],
  },
  {
    canonical: 'Kab. Bangka Barat',
    aliases: ['kab bangka barat', 'kabupaten bangka barat', 'bangka barat', 'muntok', 'mentok', 'tempilang', 'jebus', 'parittiga', 'parit tiga', 'kelapa', 'simpang teritip'],
  },
  {
    canonical: 'Kab. Bangka Tengah',
    aliases: ['kab bangka tengah', 'kabupaten bangka tengah', 'bangka tengah', 'koba', 'pangkalan baru', 'simpang katis', 'sungai selan', 'lubuk besar', 'namang'],
  },
  {
    canonical: 'Kab. Bangka Selatan',
    aliases: ['kab bangka selatan', 'kabupaten bangka selatan', 'bangka selatan', 'toboali', 'payung', 'simpang rimba', 'air gegas', 'lepar pongok', 'pulau besar', 'tukak sadai'],
  },
  {
    canonical: 'Kab. Bangka',
    aliases: ['kab bangka', 'kabupaten bangka', 'sungailiat', 'belinyu', 'air jukung', 'pemali', 'merawang', 'mendo barat', 'bakam', 'riau silip', 'puding besar'],
  },
  {
    canonical: 'Jakarta',
    aliases: ['jakarta', 'dki jakarta', 'jakarta pusat', 'jakarta utara', 'jakarta barat', 'jakarta selatan', 'jakarta timur'],
  },
  {
    canonical: 'Palembang',
    aliases: ['palembang', 'kota palembang'],
  },
];

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

function normalizeText(raw: string) {
  return raw
    .toLowerCase()
    .replace(/pangkal\s*pinang/g, 'pangkalpinang')
    .replace(/kabupaten/g, 'kab')
    .replace(/kab\./g, 'kab')
    .replace(/kota/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function searchableText(geotag: GeotagEntry) {
  return normalizeText(`${geotag.wilayahTagging || ''} ${geotag.lokasiTagging || ''}`);
}

function containsAlias(normalizedText: string, alias: string) {
  return (` ${normalizedText} `).includes(` ${normalizeText(alias)} `);
}

function canonicalFromText(raw: string) {
  const text = normalizeText(raw);
  if (!text) return '';

  // Urutan penting: Bangka Barat/Tengah/Selatan harus diperiksa sebelum Kab. Bangka.
  for (const item of destinationAliases) {
    if (item.aliases.some((alias) => containsAlias(text, alias))) return item.canonical;
  }

  return raw.trim();
}

function isPangkalpinang(geotag: GeotagEntry) {
  const text = searchableText(geotag);
  return pangkalpinangKeywords.some((keyword) => containsAlias(text, keyword));
}

function isDestination(geotag: GeotagEntry, tujuan: string) {
  const canonicalTujuan = canonicalFromText(tujuan);
  const geotagText = searchableText(geotag);
  const canonicalGeotag = canonicalFromText(geotagText);
  if (!canonicalTujuan) return false;

  if (canonicalTujuan === 'Kota Pangkalpinang') return isPangkalpinang(geotag);

  // Tujuan luar kota tidak boleh tertukar dengan alamat Pangkalpinang.
  if (isPangkalpinang(geotag)) return false;

  const destination = destinationAliases.find((item) => item.canonical === canonicalTujuan);
  if (destination) return canonicalGeotag === destination.canonical;

  return containsAlias(geotagText, canonicalTujuan);
}

function timeToMinutes(raw: string) {
  const [hours, minutes] = raw.replace('.', ':').split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
}

function geotagDate(geotag: GeotagEntry) {
  return normalizeDateValue(geotag.hariTanggal);
}

function sortByTime(geotags: GeotagEntry[]) {
  return [...geotags].sort((a, b) => timeToMinutes(a.waktuTagging) - timeToMinutes(b.waktuTagging));
}

function selectByRule(
  geotags: GeotagEntry[],
  date: string,
  matcher: (geotag: GeotagEntry) => boolean,
  mode: 'earliest' | 'latest',
) {
  const candidates = sortByTime(geotags.filter((geotag) => geotagDate(geotag) === date && matcher(geotag)));
  return mode === 'earliest' ? candidates[0] : candidates.at(-1);
}

function issue(key: GeotagPointKey, expectedDate: string, expectedLocation: string, kind: 'missing' | 'mismatch'): GeotagRuleIssue {
  const message =
    kind === 'mismatch'
      ? `${labels[key]} ada pada tanggal yang dipersyaratkan, tetapi lokasi tidak sesuai.`
      : `${labels[key]} tidak ditemukan pada tanggal/lokasi yang dipersyaratkan.`;

  return {
    key,
    label: labels[key],
    expectedDate,
    expectedLocation,
    message,
  };
}

function issueKindForDate(geotags: GeotagEntry[], date: string) {
  return geotags.some((geotag) => geotagDate(geotag) === date) ? 'mismatch' : 'missing';
}

export function inferDestinationFromGeotags(geotags: GeotagEntry[], tanggalKegiatan: string) {
  const { startDate, endDate } = parseActivityDateRange(tanggalKegiatan);
  const inRange = geotags.filter((geotag) => {
    const date = geotagDate(geotag);
    return date && date >= startDate && date <= endDate;
  });

  const nonPangkalpinang = inRange.find((geotag) => !isPangkalpinang(geotag));
  if (!nonPangkalpinang) return 'Kota Pangkalpinang';

  return canonicalFromText(`${nonPangkalpinang.wilayahTagging} ${nonPangkalpinang.lokasiTagging}`) || nonPangkalpinang.wilayahTagging;
}

export function selectRequiredGeotagPoints(
  geotags: GeotagEntry[],
  tanggalKegiatan: string,
  tujuan: string,
): GeotagRuleResult {
  const { startDate, endDate } = parseActivityDateRange(tanggalKegiatan);
  const tujuanResolved = canonicalFromText(tujuan) || inferDestinationFromGeotags(geotags, tanggalKegiatan);
  const points: SelectedGeotagPoints = {
    start: selectByRule(geotags, startDate, isPangkalpinang, 'earliest'),
    clockIn: selectByRule(geotags, startDate, (geotag) => isDestination(geotag, tujuanResolved), 'earliest'),
    clockOut: selectByRule(geotags, endDate, (geotag) => isDestination(geotag, tujuanResolved), 'latest'),
    end: selectByRule(geotags, endDate, isPangkalpinang, 'latest'),
  };

  const issues: GeotagRuleIssue[] = [];
  if (!points.start) issues.push(issue('start', startDate, 'Pangkalpinang', issueKindForDate(geotags, startDate)));
  if (!points.clockIn) issues.push(issue('clockIn', startDate, tujuanResolved, issueKindForDate(geotags, startDate)));
  if (!points.clockOut) issues.push(issue('clockOut', endDate, tujuanResolved, issueKindForDate(geotags, endDate)));
  if (!points.end) issues.push(issue('end', endDate, 'Pangkalpinang', issueKindForDate(geotags, endDate)));

  const hasMismatch = issues.some((item) => item.message.includes('lokasi tidak sesuai'));

  return {
    points,
    status: issues.length === 0 ? 'Lengkap' : hasMismatch ? 'Tidak Sesuai' : 'Tidak Lengkap',
    issues,
    startDate,
    endDate,
    tujuanResolved,
  };
}

export function geotagPointLabel(geotag?: GeotagEntry) {
  if (!geotag) return 'Tidak ditemukan';
  return `${geotag.hariTanggal} ${geotag.waktuTagging} ${geotag.wilayahTagging}`;
}

export function formatRequiredGeotagPoint(geotag?: GeotagEntry) {
  return geotag ? geotagPointLabel(geotag) : '';
}
