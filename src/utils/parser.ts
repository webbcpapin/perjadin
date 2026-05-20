import type { ParsedData, GeotagEntry } from '@/types';

export function parseDetailPertanggungjawaban(text: string): ParsedData | null {
  if (!text || text.trim().length === 0) return null;

  // Normalize line endings and split
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const result: ParsedData = {
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

  let i = 0;
  let inGeotagSection = false;
  let lastHariTanggal = '';

  while (i < lines.length) {
    const line = lines[i];
    const lineLower = line.toLowerCase();

    // Nama Kegiatan
    if (line.startsWith('Nama Kegiatan')) {
      const tabParts = line.split('\t');
      if (tabParts.length > 1 && tabParts[1].trim()) {
        result.namaKegiatan = tabParts[1].trim();
      } else {
        // Check next line for value
        if (i + 1 < lines.length && !lines[i+1].includes('\t') && !lines[i+1].includes('Id')) {
          result.namaKegiatan = lines[i+1].trim();
        }
      }
    }

    // ID Kegiatan
    if (line.startsWith('Id Kegiatan')) {
      const match = line.match(/Id Kegiatan\s*\t*\s*([a-f0-9-]+)/i);
      if (match) result.idKegiatan = match[1].trim();
      else {
        const tabParts = line.split('\t');
        if (tabParts.length > 1) result.idKegiatan = tabParts[1].trim();
      }
    }

    // Nomor ST - check for ST- pattern anywhere
    if (line.match(/^ST-\d+/i) && !result.nomorST) {
      result.nomorST = line.trim();
    }
    if (line.startsWith('Nomor ST') || lineLower.startsWith('nomor st')) {
      const tabParts = line.split('\t');
      if (tabParts.length > 1 && tabParts[1].trim().startsWith('ST-')) {
        result.nomorST = tabParts[1].trim();
      }
    }

    // Tanggal Kegiatan
    if (lineLower.startsWith('tanggal kegiatan')) {
      const tabParts = line.split('\t');
      if (tabParts.length > 1) {
        result.tanggalKegiatan = tabParts[1].trim();
      } else {
        const match = line.match(/(\d{2}-\d{2}-\d{4}\s*s\/d\s*\d{2}-\d{2}-\d{4})/);
        if (match) result.tanggalKegiatan = match[1];
      }
    }

    // Nomor Kegiatan (NKA)
    if (lineLower.startsWith('nomor kegiatan')) {
      const tabParts = line.split('\t');
      if (tabParts.length > 1) result.nomorKegiatan = tabParts[1].trim();
    }
    // Also detect KPD-XXX pattern
    if (line.match(/^KPD-\d+\/\d+-\d+$/) && !result.nomorKegiatan) {
      result.nomorKegiatan = line.trim();
    }

    // Jumlah Rute
    const ruteMatch = line.match(/terdapat (\d+) Rute/i);
    if (ruteMatch) result.jumlahRute = parseInt(ruteMatch[1], 10);

    // Peserta
    if (lineLower.startsWith('peserta kegiatan')) {
      const tabParts = line.split('\t');
      if (tabParts.length > 1) {
        result.peserta = tabParts[1].trim();
      } else if (i + 1 < lines.length && !lines[i+1].startsWith('Nomor')) {
        result.peserta = lines[i+1].trim();
      }
    }

    // NKA / Nomor Komitmen Anggaran
    if (line.match(/^NKA-\d+\/\d+-\d+$/) && !result.nomorKegiatan) {
      result.nomorKegiatan = line.trim();
    }
    if (lineLower.includes('komitmen anggaran')) {
      if (i + 2 < lines.length) {
        const nkaLine = lines[i+2];
        if (nkaLine && nkaLine.match(/^NKA-/)) {
          result.nomorKegiatan = nkaLine.trim();
        }
      }
    }

    // Uang Muka
    if (lineLower.startsWith('uang muka') && !lineLower.includes('total')) {
      const match = line.match(/Rp\s*([\d.,]+)/);
      if (match) result.uangMuka = parseInt(match[1].replace(/[.,]/g, ''), 10);
      else if (i + 1 < lines.length) {
        const nextMatch = lines[i+1].match(/Rp\s*([\d.,]+)/);
        if (nextMatch) result.uangMuka = parseInt(nextMatch[1].replace(/[.,]/g, ''), 10);
      }
    }

    // Total Pengeluaran Riil
    if (lineLower.includes('total pengeluaran riil') || lineLower.includes('pengeluaran riil')) {
      const match = line.match(/Rp\s*([\d.,]+)/);
      if (match) {
        result.totalPengeluaranRiil = parseInt(match[1].replace(/[.,]/g, ''), 10);
      } else {
        // Check next line
        if (i + 1 < lines.length) {
          const nextMatch = lines[i+1].match(/Rp\s*([\d.,]+)/);
          if (nextMatch) result.totalPengeluaranRiil = parseInt(nextMatch[1].replace(/[.,]/g, ''), 10);
        }
      }
    }

    // Total Kurang Bayar
    if (lineLower.includes('total kurang bayar') || lineLower.includes('kurang bayar')) {
      const match = line.match(/Rp\s*([\d.,]+)/);
      if (match) {
        result.totalKurangBayar = parseInt(match[1].replace(/[.,]/g, ''), 10);
      } else {
        if (i + 1 < lines.length) {
          const nextMatch = lines[i+1].match(/Rp\s*([\d.,]+)/);
          if (nextMatch) result.totalKurangBayar = parseInt(nextMatch[1].replace(/[.,]/g, ''), 10);
        }
      }
    }

    // === GEOTAG PARSING - IMPROVED ===
    // Detect geotag section header
    if (lineLower.includes('geotagging') || lineLower.includes('geotag')) {
      inGeotagSection = true;
      i++;
      continue;
    }

    // Detect geotag table header
    if (inGeotagSection && (lineLower.includes('hari, tanggal') || lineLower.includes('waktu tagging'))) {
      i++;
      continue;
    }

    // Parse geotag data rows - handle both full rows and partial rows
    if (inGeotagSection) {
      // Stop conditions
      if (lineLower.includes('items per page') ||
          lineLower.includes('ringkasan') ||
          lineLower.includes('peserta kegiatan') ||
          lineLower.match(/^\d+\s*–\s*\d+\s+of\s+\d+$/)) {
        inGeotagSection = false;
        i++;
        continue;
      }

      // Try to parse as geotag row
      const geotag = parseGeotagLine(line, lastHariTanggal);
      if (geotag) {
        if (geotag.hariTanggal) lastHariTanggal = geotag.hariTanggal;
        result.geotags.push(geotag);
        i++;
        continue;
      }
    }

    i++;
  }

  // Fallback: find ST number
  if (!result.nomorST) {
    for (const line of lines) {
      const match = line.match(/(ST-\d+\/[^\s]+\/\d+)/);
      if (match) { result.nomorST = match[1]; break; }
    }
  }

  // Fallback: find NKA
  if (!result.nomorKegiatan) {
    for (const line of lines) {
      const match = line.match(/(NKA-\d+\/\d+-\d+)/);
      if (match) { result.nomorKegiatan = match[1]; break; }
    }
    // Also try KPD pattern
    if (!result.nomorKegiatan) {
      for (const line of lines) {
        const match = line.match(/(KPD-\d+\/\d+-\d+)/);
        if (match) { result.nomorKegiatan = match[1]; break; }
      }
    }
  }

  // Fallback: find peserta
  if (!result.peserta) {
    for (let idx = 0; idx < lines.length; idx++) {
      if (lines[idx].toLowerCase().includes('peserta kegiatan') && idx + 1 < lines.length) {
        result.peserta = lines[idx + 1].trim();
        break;
      }
    }
  }

  return result;
}

/**
 * Parse a single geotag line.
 * Handles two formats:
 * 1. Full row: "Kam, 15 Jan 2026\t08.39\tJl. Yos...\tKab. Bangka"
 * 2. Partial row: "\t10.02\tJl. Yos...\tKab. Bangka" (no date, inherits from previous)
 */
function parseGeotagLine(line: string, lastHariTanggal: string): GeotagEntry | null {
  // Skip empty lines, page indicators, and non-data lines
  if (!line || line.length === 0) return null;
  if (line.match(/^\d+\s*–\s*\d+\s+of\s+\d+$/)) return null;
  if (line.toLowerCase().includes('items per page')) return null;

  const tabParts = line.split('\t');

  // Format 1: Full row with date (4+ columns)
  if (tabParts.length >= 4) {
    const col0 = tabParts[0].trim();
    const col1 = tabParts[1].trim();
    const col2 = tabParts[2].trim();
    const col3 = tabParts[tabParts.length - 1].trim(); // Last col = wilayah

    // Check if col0 looks like a date (contains day name or date pattern)
    const hasDate = col0.match(/^(Sen|Sel|Rab|Kam|Jum|Sab|Min),?\s+\d{1,2}\s+/i);
    const hasTime = col1.match(/^\d{1,2}[:.]\d{2}$/);

    if (hasDate && hasTime) {
      return {
        hariTanggal: col0,
        waktuTagging: col1.replace('.', ':'),
        lokasiTagging: col2,
        wilayahTagging: col3,
      };
    }
  }

  // Format 2: Partial row without date (3+ columns, first is empty or time)
  if (tabParts.length >= 3 && lastHariTanggal) {
    const col0 = tabParts[0].trim();
    const col1 = tabParts[1].trim();
    const col2 = tabParts[2].trim();
    const colLast = tabParts[tabParts.length - 1].trim();

    // col0 is empty (inherited date) or col0 is time
    const col0IsEmpty = col0 === '';
    const col0IsTime = col0.match(/^\d{1,2}[:.]\d{2}$/);
    const col1IsTime = col1.match(/^\d{1,2}[:.]\d{2}$/);

    if (col0IsEmpty && col1IsTime) {
      return {
        hariTanggal: lastHariTanggal,
        waktuTagging: col1.replace('.', ':'),
        lokasiTagging: col2,
        wilayahTagging: colLast,
      };
    }

    if (col0IsTime) {
      return {
        hariTanggal: lastHariTanggal,
        waktuTagging: col0.replace('.', ':'),
        lokasiTagging: col1,
        wilayahTagging: colLast,
      };
    }
  }

  // Try space-separated format: "10.02  9P9M+RVM, Air Jukung...  Kab. Bangka"
  if (!line.includes('\t') && lastHariTanggal) {
    const timeMatch = line.match(/^(\d{1,2}[:.]\d{2})\s+(.+?)\s+([A-Za-z\s\.]+)$/);
    if (timeMatch) {
      return {
        hariTanggal: lastHariTanggal,
        waktuTagging: timeMatch[1].replace('.', ':'),
        lokasiTagging: timeMatch[2].trim(),
        wilayahTagging: timeMatch[3].trim(),
      };
    }
  }

  return null;
}

export function parseGeotagTable(text: string): GeotagEntry[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const entries: GeotagEntry[] = [];
  let lastHariTanggal = '';

  for (const line of lines) {
    const geotag = parseGeotagLine(line, lastHariTanggal);
    if (geotag) {
      if (geotag.hariTanggal) lastHariTanggal = geotag.hariTanggal;
      entries.push(geotag);
    }
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

  // Sort by original order (they should already be in chronological order)
  const sorted = [...geotags]; // Keep original order from input

  if (sorted.length === 1) {
    return { start: sorted[0], clockIn: sorted[0], clockOut: sorted[0], end: sorted[0] };
  }

  if (sorted.length === 2) {
    return { start: sorted[0], clockIn: sorted[1], clockOut: sorted[1], end: sorted[1] };
  }

  if (sorted.length === 3) {
    return { start: sorted[0], clockIn: sorted[1], clockOut: sorted[1], end: sorted[2] };
  }

  // 4+ geotags: first=START, second=CLOCK IN, second-to-last=CLOCK OUT, last=END
  return {
    start: sorted[0],
    clockIn: sorted[1],
    clockOut: sorted[sorted.length - 2],
    end: sorted[sorted.length - 1],
  };
}

export function calculateDurationMinutes(clockIn: string, clockOut: string): number {
  const parseTime = (t: string): number => {
    const cleaned = t.replace(/\./g, ':').trim();
    const parts = cleaned.split(':');
    if (parts.length >= 2) {
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (!isNaN(h) && !isNaN(m)) return h * 60 + m;
    }
    return 0;
  };

  const inMinutes = parseTime(clockIn);
  const outMinutes = parseTime(clockOut);

  if (outMinutes <= inMinutes) {
    return (24 * 60 - inMinutes) + outMinutes;
  }
  return outMinutes - inMinutes;
}

/**
 * Test the parser with sample data
 */
export function testParser(text: string): { success: boolean; data?: ParsedData; errors: string[] } {
  const errors: string[] = [];
  const data = parseDetailPertanggungjawaban(text);

  if (!data) {
    errors.push('Parser returned null');
    return { success: false, errors };
  }

  if (!data.namaKegiatan) errors.push('Nama Kegiatan tidak terdeteksi');
  if (!data.idKegiatan) errors.push('ID Kegiatan tidak terdeteksi');
  if (!data.nomorST) errors.push('Nomor ST tidak terdeteksi');
  if (!data.tanggalKegiatan) errors.push('Tanggal tidak terdeteksi');
  if (!data.peserta) errors.push('Peserta tidak terdeteksi');
  if (data.totalPengeluaranRiil === 0) errors.push('Total Pengeluaran Riil = 0 (mungkin parsing gagal)');
  if (data.geotags.length === 0) errors.push('Tidak ada geotag terdeteksi');
  else if (data.geotags.length < 4) errors.push(`Hanya ${data.geotags.length} geotag terdeteksi (diharapkan >= 4)`);

  return { success: errors.length === 0, data, errors };
}
