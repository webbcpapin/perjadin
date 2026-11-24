// V5 intake protocol 1. No public read, edit, delete, setup or attachment operations.
const INTAKE_SHEETS = {
  EPERJADIN_V4: ['Kunci SPD', 'ID Kegiatan', 'Nama Kegiatan', 'Nomor ST', 'Pelaksana SPD', 'NIP', 'Nomor SPD',
    'Jumlah Rute', 'Tujuan Utama', 'Tanggal Mulai', 'Tanggal Selesai', 'Durasi Hari', 'Menginap', 'Uang Muka',
    'Total Pengeluaran Riil', 'Total Komponen Dikirim', 'Selisih Komponen', 'Status Validasi', 'Kode Akun', 'Status Geotag',
    'Jumlah Presensi', 'Tanggal Input', 'Sumber Data', 'Schema Version', 'Raw Hash'],
  EPERJADIN_KOMPONEN: ['Kunci Komponen', 'Kunci SPD', 'ID Kegiatan', 'Nomor SPD', 'Pelaksana SPD', 'Rute Ke',
    'Komponen Biaya', 'Status Komponen', 'Nilai Riil', 'Urutan Komponen', 'Tanggal Input'],
  EPERJADIN_RUTE: ['Kunci Rute', 'Kunci SPD', 'Nomor SPD', 'Pelaksana SPD', 'Rute Ke', 'Tujuan',
    'Tanggal Mulai', 'Tanggal Selesai', 'Durasi Hari', 'Menginap', 'Tanggal Input'],
  EPERJADIN_PRESENSI: ['Kunci Presensi', 'Kunci SPD', 'Nomor SPD', 'Pelaksana SPD', 'Urutan', 'Tanggal', 'Waktu',
    'Wilayah', 'Lokasi Geo Tagging', 'Klasifikasi', 'Tanggal Input'],
  EPERJADIN_AUDIT: ['Waktu UTC', 'Sub Google', 'Operasi', 'Request ID', 'Baris', 'Hasil', 'Alasan'],
};
const COST_TYPE = /^(?:Uang Harian(?: Dalam Kota)?|(?:Biaya )?Tiket (?:Pesawat|Kereta(?: Api)?|Kapal)(?: Pulang Pergi)?|Uang Penginapan|Uang Taksi (?:Asal|Tujuan)|Biaya (?:Penginapan|Transportasi) Lain(?:nya)?|Biaya (?:Transportasi|Tak[ks]i|Penginapan|Sewa Kendaraan|Representasi|Tol|Parkir|BBM)|Uang Representasi|Transportasi(?: Dalam Kota)?)$/i;
const COST_STATUS = /^(?:Draft|Dikirim|Disetujui(?: PPK)?|Ditolak(?: PPK)?|Dibatalkan|Dibayar|Selesai|Menunggu(?: Persetujuan)?(?: PPK)?|Diajukan(?: ke PPK)?)$/i;
const COUNTED_STATUS = /^(?:Dikirim|Disetujui(?: PPK)?|Dibayar|Selesai)$/i;
const MAX_BYTES = 750000;
const MAX_BATCH = 20;

function doGet() { return reply_({ ok: true }); }

function doPost(e) {
  const requestId = Utilities.getUuid();
  const fail = (code) => reply_({ ok: false, protocol: 1, requestId, code });
  try {
    const post = e && e.postData;
    if (!post || typeof post.contents !== 'string' ||
        !/^(?:text\/plain|application\/json)(?:;|$)/i.test(post.type || '') ||
        (e.queryString || '')) return fail('BAD_REQUEST');
    if (Number(post.length) > MAX_BYTES || post.contents.length > MAX_BYTES ||
        Utilities.newBlob(post.contents).getBytes().length > MAX_BYTES) return fail('SIZE_LIMIT');
    let body;
    try { body = JSON.parse(post.contents); } catch (_) { return fail('BAD_REQUEST'); }
    if (!object_(body)) return fail('BAD_REQUEST');
    const props = PropertiesService.getScriptProperties();
    const identity = identity_(body.authIdToken, props);
    if (!identity) return fail('UNAUTHORIZED');
    if (!identity.allowed) return fail('FORBIDDEN');
    const action = body.action;
    if (!['verifyConnection', 'submitParsedPerjadin', 'submitCollectorJson'].includes(action)) return fail('ACTION_DENIED');
    const spreadsheetId = props.getProperty('EPERJADIN_SPREADSHEET_ID');
    if (!spreadsheetId) return fail('UNAVAILABLE');
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return fail('BUSY');
    try {
      if (!rateAllowed_(identity.sub)) return fail('RATE_LIMIT');
      if (action === 'verifyConnection') {
        if (!keys_(body, ['action', 'authIdToken'])) return fail('BAD_REQUEST');
        return reply_({ ok: true, protocol: 1, requestId });
      }
      const max = action === 'submitParsedPerjadin' ? 1 : MAX_BATCH;
      if (!keys_(body, ['action', 'authIdToken', 'records']) || !list_(body.records, 1, max)) {
        const ss = SpreadsheetApp.openById(spreadsheetId);
        const audit = table_(ss, 'EPERJADIN_AUDIT');
        commit_(spreadsheetId, [[audit, [auditObject_(identity.sub, action, requestId, { row: 0, status: 'rejected', code: 'BAD_REQUEST' }, new Date().toISOString())]]]);
        return fail('BAD_REQUEST');
      }
      return reply_(submit_(spreadsheetId, identity.sub, action, requestId, body.records));
    } finally { lock.releaseLock(); }
  } catch (_) {
    // Internal errors can contain cell values, document IDs, or credentials.
    return fail('UNAVAILABLE');
  }
}

function reply_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function identity_(token, props) {
  if (typeof token !== 'string' || token.length > 9000 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) return null;
  const audience = props.getProperty('EPERJADIN_OAUTH_CLIENT_ID');
  const allow = (props.getProperty('EPERJADIN_ALLOWED_EMAILS') || '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
  if (!audience || !allow.length) return null;
  const now = Math.floor(Date.now() / 1000);
  const cache = CacheService.getScriptCache();
  const cacheKey = 'id:' + hash_(token);
  const cached = cache.get(cacheKey);
  let info;
  if (cached) info = JSON.parse(cached);
  else {
    const [encodedHeader, encodedClaims, signature] = token.split('.');
    const header = decodeJwtObject_(encodedHeader);
    info = decodeJwtObject_(encodedClaims);
    if (!header || !info || header.alg !== 'RS256' || header.crit !== undefined ||
        !matches_(header.kid, /^[a-zA-Z0-9_-]{1,100}$/) ||
        info.aud !== audience || typeof info.exp !== 'number' || info.exp <= now) return null;
    const jwk = googleKeys_(cache).find((key) => key.kid === header.kid && key.kty === 'RSA' &&
      key.alg === 'RS256' && key.use === 'sig' && key.e === 'AQAB');
    if (!jwk || !EperjadinRsa.verify(encodedHeader + '.' + encodedClaims, signature, jwk.n)) return null;
  }
  const exp = Number(info.exp);
  if (info.aud !== audience || !['accounts.google.com', 'https://accounts.google.com'].includes(info.iss) ||
      !Number.isSafeInteger(exp) || exp <= now || !/^[0-9]{1,64}$/.test(info.sub || '') ||
      ![true, 'true'].includes(info.email_verified) || typeof info.email !== 'string') return null;
  const email = info.email.trim().toLowerCase();
  const domain = (props.getProperty('EPERJADIN_WORKSPACE_DOMAIN') || '').trim().toLowerCase();
  const allowed = allow.includes(email) && (domain ? info.hd === domain : (email.endsWith('@gmail.com') || !!info.hd));
  if (allowed && !cached) cache.put(cacheKey, JSON.stringify({
    aud: info.aud, iss: info.iss, exp, sub: info.sub, email, email_verified: true, hd: info.hd,
  }), Math.min(120, exp - now));
  return { sub: String(info.sub), allowed };
}

function decodeJwtObject_(text) {
  try {
    const padded = text.padEnd(Math.ceil(text.length / 4) * 4, '=');
    const value = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString());
    return object_(value) ? value : null;
  } catch (_) { return null; }
}

function googleKeys_(cache) {
  const key = 'google:oidc-jwks:v1';
  const cached = cache.get(key);
  if (cached) return JSON.parse(cached);
  // Fetch public keys only. Tokens never leave Apps Script.
  const response = UrlFetchApp.fetch('https://www.googleapis.com/oauth2/v3/certs', { muteHttpExceptions: true, followRedirects: false });
  if (response.getResponseCode() !== 200) throw new Error('identity keys unavailable');
  const { keys } = JSON.parse(response.getContentText());
  if (!Array.isArray(keys) || !keys.length) throw new Error('identity keys unavailable');
  const headers = response.getHeaders();
  const cacheControl = Object.keys(headers).find((name) => name.toLowerCase() === 'cache-control');
  const ageHeader = Object.keys(headers).find((name) => name.toLowerCase() === 'age');
  const maxAge = Number(/(?:^|[, ])max-age=(\d+)/i.exec(String(headers[cacheControl] || ''))?.[1] || 0);
  const ttl = Math.min(300, maxAge - (Number(headers[ageHeader]) || 0));
  if (ttl > 0 && !/\b(?:no-store|no-cache)\b/i.test(String(headers[cacheControl] || ''))) cache.put(key, JSON.stringify(keys), ttl);
  return keys;
}

function rateAllowed_(sub) {
  const cache = CacheService.getScriptCache();
  const key = 'rate:' + hash_(sub) + ':' + Math.floor(Date.now() / 60000);
  const count = Number(cache.get(key)) || 0;
  if (count >= 10) return false;
  cache.put(key, String(count + 1), 60);
  return true;
}

function hash_(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text)).replace(/=+$/, '');
}

function object_(obj) { return obj !== null && typeof obj === 'object' && !Array.isArray(obj); }
function keys_(obj, keys) {
  return object_(obj) && Object.keys(obj).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(obj, key));
}
function list_(arr, min, max) { return Array.isArray(arr) && arr.length >= min && arr.length <= max; }
function plain_(text, min, max) { return typeof text === 'string' && text === text.trim() &&
  text.length >= min && text.length <= max && !/[\x00-\x1f\x7f]/.test(text); }
function matches_(value, pattern) { return typeof value === 'string' && pattern.test(value); }
function cents_(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100000000000) return null;
  const rounded = Math.round(n * 100);
  return Math.abs(n * 100 - rounded) < 0.002 ? rounded : null;
}
function date_(text) {
  if (!matches_(text, /^20\d{2}-\d{2}-\d{2}$/)) return false;
  const date = new Date(text + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text;
}
function days_(start, end) { return (Date.parse(end) - Date.parse(start)) / 86400000 + 1; }
function key_(id, spd) { return id.toLowerCase() + '|' + spd.toLowerCase(); }

function validate_(r) {
  if (!keys_(r, ['idKegiatan', 'nomorSPD', 'nomorST', 'namaKegiatan', 'peserta', 'nip', 'kodeAkun', 'uangMuka',
    'totalPengeluaranRiil', 'jumlahRute', 'routes', 'components', 'presensiStatus', 'geotags'])) return 'BAD_SCHEMA';
  if (!matches_(r.idKegiatan, /^[a-f0-9]{24}$/i) || !matches_(r.nomorSPD, /^SPD-\d{1,10}\/\d{6}-20\d{2}$/i) ||
      !matches_(r.nomorST, /^ST-\d{1,10}\/[A-Z0-9.]{1,30}\/20\d{2}$/i) ||
      !plain_(r.namaKegiatan, 1, 500) || !plain_(r.peserta, 1, 160) || !matches_(r.nip, /^\d{18}$/) ||
      !plain_(r.kodeAkun, 0, 120) || (r.kodeAkun && !/^[A-Z0-9]+(?:\.[A-Z0-9]+)*$/i.test(r.kodeAkun))) return 'BAD_IDENTITY';
  if (!list_(r.routes, 1, 20) || r.routes.length !== r.jumlahRute || !r.routes.every((route, i) =>
    keys_(route, ['nomorRute', 'tujuan', 'tanggalMulai', 'tanggalSelesai', 'durasiHari', 'menginap']) &&
    route.nomorRute === i + 1 && plain_(route.tujuan, 1, 500) && date_(route.tanggalMulai) && date_(route.tanggalSelesai) &&
    route.durasiHari === days_(route.tanggalMulai, route.tanggalSelesai) && route.durasiHari >= 1 && route.durasiHari <= 366 &&
    (!i || route.tanggalMulai >= r.routes[i - 1].tanggalMulai) && ['Ya', 'Tidak', 'Tidak Terbaca'].includes(route.menginap))) return 'BAD_ROUTE';
  if (cents_(r.uangMuka) === null || cents_(r.totalPengeluaranRiil) === null || !list_(r.components, 1, 100)) return 'BAD_FINANCE';
  const costs = new Set();
  let sum = 0;
  for (const c of r.components) {
    if (!keys_(c, ['nomorRute', 'nama', 'status', 'nilaiRiil']) || !Number.isInteger(c.nomorRute) ||
        c.nomorRute < 1 || c.nomorRute > r.routes.length || !matches_(c.nama, COST_TYPE) ||
        !matches_(c.status, COST_STATUS) || cents_(c.nilaiRiil) === null) return 'BAD_COMPONENT';
    const key = c.nomorRute + '|' + c.nama.toLowerCase();
    if (costs.has(key)) return 'BAD_COMPONENT';
    costs.add(key);
    if (COUNTED_STATUS.test(c.status)) sum += cents_(c.nilaiRiil);
  }
  if (sum !== cents_(r.totalPengeluaranRiil)) return 'TOTAL_MISMATCH';
  if (!['ada', 'kosong', 'belum_terbaca'].includes(r.presensiStatus) ||
      !list_(r.geotags, r.presensiStatus === 'ada' ? 1 : 0, r.presensiStatus === 'ada' ? 120 : 0)) return 'BAD_PRESENCE';
  const tags = new Set();
  for (const g of r.geotags) {
    if (!keys_(g, ['hariTanggal', 'waktuTagging', 'wilayahTagging', 'lokasiTagging']) ||
        !date_(g.hariTanggal) || !matches_(g.waktuTagging, /^(?:[01]\d|2[0-3]):[0-5]\d$/) ||
        !plain_(g.wilayahTagging, 1, 180) || !plain_(g.lokasiTagging, 0, 850)) return 'BAD_PRESENCE';
    const key = [g.hariTanggal, g.waktuTagging, g.wilayahTagging.toLowerCase(), g.lokasiTagging.toLowerCase()].join('|');
    if (tags.has(key)) return 'BAD_PRESENCE';
    tags.add(key);
  }
  return '';
}

function canonical_(value) {
  if (Array.isArray(value)) return value.map(canonical_);
  if (!object_(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical_(value[k])]));
}

function table_(ss, name) {
  const sheet = ss.getSheetByName(name);
  const width = sheet && sheet.getLastColumn();
  if (!width) throw new Error('missing table');
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0];
  if (!INTAKE_SHEETS[name].every((h) => headers.indexOf(h) >= 0 && headers.indexOf(h) === headers.lastIndexOf(h))) {
    throw new Error('table headers do not match');
  }
  return { sheet, headers };
}

function existing_(table, keys) {
  const { sheet, headers } = table;
  const count = sheet.getLastRow() - 1;
  const out = new Map();
  if (count < 1 || !keys.size) return out;
  const column = (name) => sheet.getRange(2, headers.indexOf(name) + 1, count, 1).getValues();
  const ids = column('ID Kegiatan'), spds = column('Nomor SPD'), savedKeys = column('Kunci SPD'), hashes = column('Raw Hash');
  for (let i = 0; i < count; i++) {
    const derived = key_(String(ids[i][0]).trim(), String(spds[i][0]).trim());
    const saved = String(savedKeys[i][0]).trim().toLowerCase();
    for (const candidate of new Set([derived, saved])) {
      if (keys.has(candidate)) out.set(candidate, out.has(candidate) ? '' : hashes[i][0]);
    }
  }
  return out;
}

function auditRow_(sub, action, requestId, result, now) {
  return [now, sub, action, requestId, result.row, result.status, result.code];
}

function commit_(spreadsheetId, tables) {
  const requests = tables.filter(([, rows]) => rows.length).map(([table, rows]) => ({
    appendCells: {
      sheetId: table.sheet.getSheetId(),
      rows: rows.map((values) => ({ values: table.headers.map((header) => {
        const value = values[header];
        if (typeof value === 'string') return { userEnteredValue: { stringValue: value } };
        if (typeof value === 'number') return { userEnteredValue: { numberValue: value } };
        return {};
      }) })),
      fields: 'userEnteredValue',
    },
  }));
  Sheets.Spreadsheets.batchUpdate({ requests }, spreadsheetId);
}

function auditObject_(sub, action, requestId, result, now) {
  const row = auditRow_(sub, action, requestId, result, now);
  return Object.fromEntries(INTAKE_SHEETS.EPERJADIN_AUDIT.map((h, i) => [h, row[i]]));
}

function submit_(spreadsheetId, sub, action, requestId, records) {
  const parsed = records.map((r, i) => {
    const code = validate_(r);
    if (code) return { row: i + 1, code };
    const record = { ...r, idKegiatan: r.idKegiatan.toLowerCase(), nomorSPD: r.nomorSPD.toUpperCase(), nomorST: r.nomorST.toUpperCase() };
    return { row: i + 1, record, key: key_(record.idKegiatan, record.nomorSPD), hash: 'v5:' + hash_(JSON.stringify(canonical_(record))) };
  });
  const byKey = new Map();
  for (const item of parsed.filter((x) => x.record)) {
    if (!byKey.has(item.key)) byKey.set(item.key, new Set());
    byKey.get(item.key).add(item.hash);
  }
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const tables = Object.fromEntries(Object.keys(INTAKE_SHEETS).map((name) => [name, [table_(ss, name), []]]));
  // Normalize the lookup key only; stored SPD retains uppercase formatting.
  const found = existing_(tables.EPERJADIN_V4[0], new Set(byKey.keys()));
  const now = new Date().toISOString();
  const results = parsed.map(({ row, code, record, key, hash }) => {
    if (code) return { row, status: 'rejected', code };
    if (byKey.get(key).size > 1) return { row, status: 'rejected', code: 'CONFLICT' };
    if (found.has(key)) return found.get(key) === hash ? { row, status: 'skipped', code: 'DUPLICATE' }
      : { row, status: 'rejected', code: 'CONFLICT' };
    appendRecord_(tables, record, key, hash, action, now);
    found.set(key, hash);
    return { row, status: 'accepted', code: 'STORED' };
  });
  tables.EPERJADIN_AUDIT[1].push(...results.map((r) => auditObject_(sub, action, requestId, r, now)));
  commit_(spreadsheetId, Object.values(tables));
  const count = (status) => results.filter((r) => r.status === status).length;
  return { ok: true, protocol: 1, requestId, accepted: count('accepted'), skipped: count('skipped'), rejected: count('rejected'), results };
}

function appendRecord_(tables, r, key, hash, action, now) {
  const common = { 'Kunci SPD': key, 'Nomor SPD': r.nomorSPD, 'Pelaksana SPD': r.peserta, 'Tanggal Input': now };
  const route = r.routes[0];
  const end = r.routes.reduce((latest, item) => item.tanggalSelesai > latest ? item.tanggalSelesai : latest, route.tanggalSelesai);
  const geoStatus = r.presensiStatus === 'kosong' ? 'Tidak Ada Presensi'
    : r.presensiStatus === 'belum_terbaca' ? 'Presensi Belum Terbaca' : 'Perlu Verifikasi Lokasi dan Waktu';
  tables.EPERJADIN_V4[1].push({ ...common, 'ID Kegiatan': r.idKegiatan, 'Nama Kegiatan': r.namaKegiatan,
    'Nomor ST': r.nomorST, NIP: r.nip, 'Jumlah Rute': r.routes.length, 'Tujuan Utama': route.tujuan,
    'Tanggal Mulai': route.tanggalMulai, 'Tanggal Selesai': end, 'Durasi Hari': days_(route.tanggalMulai, end),
    Menginap: route.menginap, 'Uang Muka': r.uangMuka, 'Total Pengeluaran Riil': r.totalPengeluaranRiil,
    'Total Komponen Dikirim': r.totalPengeluaranRiil, 'Selisih Komponen': 0, 'Status Validasi': 'Nominal Sesuai',
    'Kode Akun': r.kodeAkun, 'Status Geotag': geoStatus, 'Jumlah Presensi': r.geotags.length,
    'Sumber Data': action === 'submitParsedPerjadin' ? 'Input parsing V5' : 'JSON Collector V5',
    'Schema Version': 5, 'Raw Hash': hash,
  });
  r.routes.forEach((route) => tables.EPERJADIN_RUTE[1].push({ ...common, 'Kunci Rute': key + '|R' + route.nomorRute,
    'Rute Ke': route.nomorRute, Tujuan: route.tujuan, 'Tanggal Mulai': route.tanggalMulai,
    'Tanggal Selesai': route.tanggalSelesai, 'Durasi Hari': route.durasiHari, Menginap: route.menginap,
  }));
  r.components.forEach((c, i) => tables.EPERJADIN_KOMPONEN[1].push({ ...common, 'Kunci Komponen': key + '|K' + (i + 1),
    'ID Kegiatan': r.idKegiatan, 'Rute Ke': c.nomorRute, 'Komponen Biaya': c.nama, 'Status Komponen': c.status,
    'Nilai Riil': c.nilaiRiil, 'Urutan Komponen': i + 1,
  }));
  r.geotags.forEach((g, i) => {
    const inRoute = r.routes.some((route) => g.hariTanggal >= route.tanggalMulai && g.hariTanggal <= route.tanggalSelesai);
    tables.EPERJADIN_PRESENSI[1].push({ ...common, 'Kunci Presensi': key + '|P' + (i + 1), Urutan: i + 1,
      Tanggal: g.hariTanggal, Waktu: g.waktuTagging, Wilayah: g.wilayahTagging, 'Lokasi Geo Tagging': g.lokasiTagging,
      Klasifikasi: !inRoute ? 'Tanggal di Luar Rute' : !g.lokasiTagging ? 'Alamat Tidak Terbaca' : 'Perlu Verifikasi Lokasi dan Waktu',
    });
  });
}
