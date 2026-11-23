/**
 * Reads a locally exported Google Sheets CSV. The file is never uploaded by
 * this function. Supports quoted columns, commas, CRLF and embedded newlines.
 */
export function parseMasterCsv(input: string): Record<string, string>[] {
  const text = String(input || '').replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      row.push(field); field = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((v) => v.trim())) rows.push(row);
      row = []; field = '';
    } else {
      field += ch;
    }
    if (rows.length > 10000) throw new Error('Master CSV terlalu besar untuk perbandingan lokal.');
  }
  if (quoted) throw new Error('Format CSV tidak lengkap: tanda petik tidak ditutup.');
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  if (rows.length < 1) throw new Error('CSV Master belum berisi header.');
  const headers = rows[0].map((h) => h.trim());
  if (!headers.includes('Kunci SPD') || !headers.includes('Total Pengeluaran Riil')) {
    throw new Error('Pilih CSV tab EPERJADIN_V4 yang memiliki kolom Kunci SPD dan Total Pengeluaran Riil.');
  }
  if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length ||
      rows.slice(1).some((row) => !row[headers.indexOf('Kunci SPD')]?.trim())) {
    throw new Error('CSV Master memiliki header ganda atau baris tanpa Kunci SPD.');
  }
  return rows.slice(1).map((items) => Object.fromEntries(headers.map((key, i) => [key, String(items[i] ?? '').trim()])));
}

export type MasterComparison = { state: 'baru' | 'sama' | 'berubah' | 'perlu-review'; oldHash: string; note: string };

export function indexMaster(rows: Record<string, unknown>[]) {
  const items = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = String(row['Kunci SPD'] ?? '').trim().toLowerCase();
    if (!key) continue;
    const matches = items.get(key);
    if (matches) matches.push(row);
    else items.set(key, [row]);
  }
  return items;
}

function parseMasterMoney(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value ?? '').trim().replace(/^Rp\s*/i, '');
  if (!/^-?\d[\d.,]*$/.test(text)) return null;
  const decimal = Math.max(text.lastIndexOf('.'), text.lastIndexOf(','));
  const normalized = decimal >= 0 && text.length - decimal === 3
    ? text.slice(0, decimal).replace(/[.,]/g, '') + '.' + text.slice(decimal + 1)
    : text.replace(/[.,]/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function compareWithMaster(
  matches: Record<string, unknown>[],
  official: number | null,
  incomingHash: string,
  fullyRead: boolean,
): MasterComparison {
  const oldHash = matches.length === 1 ? String(matches[0]['Raw Hash'] ?? '').trim() : '';
  if (official === null) return { state: 'perlu-review', oldHash, note: 'Total resmi sumber belum terbaca.' };
  if (!matches.length) return { state: 'baru', oldHash, note: 'SPD belum ditemukan di snapshot Master.' };
  if (matches.length > 1) return { state: 'perlu-review', oldHash, note: 'Kunci SPD ganda di Master.' };
  const total = parseMasterMoney(matches[0]['Total Pengeluaran Riil']);
  if (total === null) return { state: 'perlu-review', oldHash, note: 'Total Master belum tersedia.' };
  if (Math.round(100 * total) !== Math.round(100 * official)) {
    return { state: 'berubah', oldHash, note: 'Total resmi berbeda.' };
  }
  const versioned = /^v23:[a-f0-9]{64}$/;
  if (fullyRead && versioned.test(oldHash) && versioned.test(incomingHash)) {
    return oldHash === incomingHash
      ? { state: 'sama', oldHash, note: 'Total dan hash V2.3 cocok.' }
      : { state: 'berubah', oldHash, note: 'Rincian sumber berubah berdasarkan hash V2.3.' };
  }
  return { state: 'perlu-review', oldHash, note: 'Total sama. Bukti kesamaan seluruh rincian belum cukup.' };
}
