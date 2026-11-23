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
  if (rows.length < 2) throw new Error('CSV Master belum berisi header dan data.');
  const headers = rows[0].map((h) => h.trim());
  if (!headers.includes('Kunci SPD') || !headers.includes('Total Pengeluaran Riil')) {
    throw new Error('Pilih CSV tab EPERJADIN_V4 yang memiliki kolom Kunci SPD dan Total Pengeluaran Riil.');
  }
  return rows.slice(1).map((items) => Object.fromEntries(headers.map((key, i) => [key, String(items[i] ?? '').trim()])));
}
