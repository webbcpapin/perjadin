import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ClipboardCheck, Database, FileText, LockKeyhole, LogOut, Pencil, RefreshCw, Save, Trash2, X } from 'lucide-react';
import './App.css';
import { accountKindLabel, budgetAccounts, findBudgetAccount, type BudgetAccount } from './data/perjadinAccounts';
import { getUangHarian, parseTanggalRange } from './data/sbmData';
import { parsePerjadinClipboard } from './utils/parser';
import { createGeotagStatementDocx, downloadBlob } from './utils/docxGenerator';
import { geotagPointLabel, inferDestinationFromGeotags, selectRequiredGeotagPoints } from './utils/geotagRules';
import type { GeotagIssue } from './types';
import { SyncPanel } from './components/SyncPanel';

type Stage = 'Kegiatan' | 'Persetujuan' | 'Pertanggungjawaban' | 'Pelaksanaan';
type StatusPJ = 'Belum Lengkap' | 'Lengkap' | 'Disetujui';

type Row = {
  tahap: Stage;
  idKegiatan: string;
  namaKegiatan: string;
  nomorST: string;
  nomorKegiatan: string;
  nka: string;
  tanggalKegiatan: string;
  tujuan: string;
  kotaTujuan: string;
  output: string;
  jenisPembayaran: string;
  namaPegawai: string;
  lamaHari: number;
  uangHarianPerHari: number;
  totalUangHarian: number;
  uangMuka: number;
  totalEstimasiBiaya: number;
  totalPengeluaranRiil: number;
  kurangLebihBayar: number;
  statusPJ: StatusPJ;
  statusPersetujuan: string;
  statusGeotag: string;
  start: string;
  clockIn: string;
  clockOut: string;
  end: string;
  volume: number;
  nilaiRiil: number;
  kodeAkun: string;
  tanggalInput: string;
  detailGeotag: string;
  geotagIssues: GeotagIssue[];
  keterangan: string;
  jenisPerjadin: string;
  sumberData: string;
  waktuRekamSumber: string;
  sourceRecordKey: string;
};

type AccountUsage = { pagu: number; realisasi: number; komitmen: number; saldo: number };
type ValidationItem = { label: string; ok: boolean; message: string };

const SPREADSHEET_ID = '1fkXASbZbnPCZeW2FSxteE-oOnacVuJRCxQ8zWOgPRh8';
const DEFAULT_WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbzyyQCjskwpdrqOCWUNg05QTEP8tIROgCnFaVLx6AMTPA04kJQzLUk2ZDm-w4rebnzp/exec';
const ENDPOINT_STORAGE_KEY = 'eperjadin_webapp_url';
const AUTH_STORAGE_KEY = 'eperjadin_manager_auth';
const ACCESS_CODE_STORAGE_KEY = 'eperjadin_access_code';

const rupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);

const today = () =>
  new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');

function formatPoint(point?: { hariTanggal: string; waktuTagging: string; wilayahTagging: string }) {
  if (!point) return '';
  return `${point.hariTanggal} ${point.waktuTagging} ${point.wilayahTagging}`;
}

function isProblemGeotag(status: string) {
  return ['Tidak Lengkap', 'Tidak Sesuai', 'Perlu Surat Pernyataan', 'Belum Lengkap', 'Sebagian'].includes(status);
}

function fallbackGeotagIssues(row: Row): GeotagIssue[] {
  if (row.geotagIssues.length > 0) return row.geotagIssues;
  if (!isProblemGeotag(row.statusGeotag)) return [];

  const expected = {
    start: { label: 'START', expectedLocation: 'Pangkalpinang', value: row.start },
    clockIn: { label: 'CLOCK IN', expectedLocation: row.tujuan || 'Tujuan perjalanan dinas', value: row.clockIn },
    clockOut: { label: 'CLOCK OUT', expectedLocation: row.tujuan || 'Tujuan perjalanan dinas', value: row.clockOut },
    end: { label: 'END', expectedLocation: 'Pangkalpinang', value: row.end },
  };

  const missingIssues = Object.values(expected)
    .filter((item) => !item.value)
    .map((item) => ({
      label: item.label,
      expectedDate: row.tanggalKegiatan,
      expectedLocation: item.expectedLocation,
      message: `${item.label} tidak ditemukan pada data geotag yang tersimpan.`,
    }));

  if (missingIssues.length > 0) return missingIssues;

  return [
    {
      label: 'GEOTAG',
      expectedDate: row.tanggalKegiatan,
      expectedLocation: row.tujuan || 'Lokasi perjalanan dinas',
      message: `Status geotag ${row.statusGeotag}. Perlu surat pernyataan geotag.`,
    },
  ];
}

function readCell(source: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = source[name];
    if (value !== undefined && value !== null && value !== '') return String(value);
  }
  return '';
}

function readNumber(source: Record<string, unknown>, names: string[]) {
  const raw = readCell(source, names).replace(/[^\d.-]/g, '');
  return Number(raw) || 0;
}

function rowFromSheet(item: Record<string, unknown>): Row {
  const tahap = (readCell(item, ['Tahap Data']) || 'Pertanggungjawaban') as Stage;
  const totalEstimasiBiaya = readNumber(item, ['Total Estimasi Biaya']);
  const totalPengeluaranRiil = readNumber(item, ['Total Pengeluaran Riil']);
  const nilaiRiil = readNumber(item, ['NILAI RIIL', 'Nilai Riil']) || totalPengeluaranRiil || totalEstimasiBiaya;

  return {
    tahap,
    idKegiatan: readCell(item, ['ID Kegiatan']),
    namaKegiatan: readCell(item, ['Nama Kegiatan']),
    nomorST: readCell(item, ['Nomor ST']),
    nomorKegiatan: readCell(item, ['Nomor Kegiatan KPD', 'Nomor Kegiatan']),
    nka: readCell(item, ['NKA/Nomor Kegiatan', 'NKA / Nomor Kegiatan', 'NKA']),
    tanggalKegiatan: readCell(item, ['Tanggal Kegiatan', 'Tanggal']),
    tujuan: readCell(item, ['Tujuan']),
    kotaTujuan: readCell(item, ['Kota Tujuan']),
    output: readCell(item, ['Output']),
    jenisPembayaran: readCell(item, ['Jenis Pembayaran']),
    namaPegawai: readCell(item, ['Nama Pegawai', 'Pegawai']) || (tahap === 'Persetujuan' ? 'Menunggu PJ' : ''),
    lamaHari: readNumber(item, ['Lama (Hari)', 'Lama']) || 1,
    uangHarianPerHari: readNumber(item, ['Uang Harian per Hari']),
    totalUangHarian: readNumber(item, ['Total Uang Harian']),
    uangMuka: readNumber(item, ['Uang Muka']),
    totalEstimasiBiaya,
    totalPengeluaranRiil,
    kurangLebihBayar: readNumber(item, ['Kurang/Lebih Bayar', 'Kurang / Lebih Bayar']),
    statusPJ: (readCell(item, ['Status Pertanggungjawaban', 'Status PJ']) || 'Belum Lengkap') as StatusPJ,
    statusPersetujuan: readCell(item, ['Status Persetujuan']),
    statusGeotag: readCell(item, ['Status Geotag', 'Geotag']),
    start: readCell(item, ['START']),
    clockIn: readCell(item, ['CLOCK IN']),
    clockOut: readCell(item, ['CLOCK OUT']),
    end: readCell(item, ['END']),
    volume: readNumber(item, ['VOLUME']) || 1,
    nilaiRiil,
    kodeAkun: readCell(item, ['Kode Akun', 'Akun']),
    tanggalInput: readCell(item, ['Tanggal Input']),
    detailGeotag: readCell(item, ['Detail Geotag']),
    geotagIssues: [],
    keterangan: readCell(item, ['Keterangan', 'Catatan']),
    jenisPerjadin: readCell(item, ['Jenis Perjadin']),
    sumberData: readCell(item, ['Sumber Data']),
    waktuRekamSumber: readCell(item, ['Waktu Rekam Sumber']),
    sourceRecordKey: readCell(item, ['Kunci Sumber']),
  };
}

function accountFromSheet(item: Record<string, unknown>): BudgetAccount | null {
  const kode = readCell(item, ['Kode Akun']);
  if (!kode) return null;

  const master = findBudgetAccount(kode);
  const akunBelanja = kode.includes('.524111.') ? '524111' : '524113';
  const ro = kode.match(/\.([0-9]{4}[A-Z]{3})\./)?.[1] || '';
  const roLabel = ro ? `${ro.slice(0, 4)}.${ro.slice(4)}` : '';

  return {
    kode,
    nama: readCell(item, ['Nama Akun']) || master?.nama || kode,
    pagu: readNumber(item, ['Pagu']) || master?.pagu || 0,
    realisasi: readNumber(item, ['Realisasi']),
    komitmen: readNumber(item, ['Komitmen']),
    jenis: master?.jenis || (akunBelanja === '524111' ? 'luar_kota' : 'dalam_kota'),
    akunBelanja,
    ro,
    roLabel,
    uraian: master?.uraian || readCell(item, ['Uraian']) || roLabel,
  };
}

function normalizeKeyPart(value?: string | number) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w./-]+/g, '');
}

function stableHash(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function rowKey(row: Row) {
  const pegawaiAtauKegiatan = row.namaPegawai || row.nomorKegiatan || row.nka || 'kegiatan';
  const parts = [row.tahap, row.idKegiatan, row.nomorST, pegawaiAtauKegiatan].map(normalizeKeyPart);
  const normalized = parts.join('|');
  return `${normalized}|${stableHash(normalized)}`;
}

function activityKey(row: Row) {
  return `${row.idKegiatan}|${row.nomorST}|${row.kodeAkun}`;
}

function stageFromSource(sourceType?: string): Stage {
  if (sourceType === 'persetujuan') return 'Persetujuan';
  if (sourceType === 'pelaksanaan') return 'Pelaksanaan';
  return 'Pertanggungjawaban';
}

function formatAccountOption(account: BudgetAccount) {
  return `${account.akunBelanja} | ${accountKindLabel(account.jenis)} | ${account.roLabel} | ${account.uraian} | Pagu ${rupiah(account.pagu)}`;
}

function formatAccountName(account?: BudgetAccount) {
  if (!account) return '';
  return `${account.akunBelanja} ${accountKindLabel(account.jenis)} - ${account.roLabel} - ${account.uraian}`;
}

function validateRow(row: Row, accounts: BudgetAccount[]): ValidationItem[] {
  const accountValid = !!row.kodeAkun && accounts.some((account) => account.kode === row.kodeAkun);
  const hasValue = row.nilaiRiil > 0 || row.totalPengeluaranRiil > 0 || row.totalEstimasiBiaya > 0;
  const geotagOk = !isProblemGeotag(row.statusGeotag) || row.keterangan.trim().length > 0;

  return [
    { label: 'ID Kegiatan', ok: !!row.idKegiatan.trim(), message: 'ID kegiatan wajib terbaca.' },
    { label: 'Nomor ST', ok: !!row.nomorST.trim(), message: 'Nomor ST wajib terbaca.' },
    { label: 'Tanggal', ok: !!row.tanggalKegiatan.trim(), message: 'Tanggal kegiatan wajib terbaca.' },
    {
      label: 'Pegawai',
      ok: row.tahap === 'Persetujuan' || !!row.namaPegawai.trim(),
      message: 'Nama pegawai wajib terbaca untuk pertanggungjawaban/pelaksanaan.',
    },
    { label: 'Akun', ok: accountValid, message: 'Kode akun harus ada di master akun.' },
    { label: 'Nilai', ok: hasValue, message: 'Nilai estimasi atau riil tidak boleh nol.' },
    {
      label: 'Geotag',
      ok: geotagOk,
      message: 'Geotag bermasalah wajib diberi alasan/catatan sebelum simpan.',
    },
  ];
}

function calculateUsage(accounts: BudgetAccount[], rows: Row[]) {
  const usage: Record<string, AccountUsage> = Object.fromEntries(
    accounts.map((account) => [account.kode, { pagu: account.pagu, realisasi: 0, komitmen: 0, saldo: account.pagu }]),
  );

  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    if (!row.kodeAkun || !usage[row.kodeAkun]) continue;
    const key = activityKey(row);
    grouped.set(key, [...(grouped.get(key) || []), row]);
  }

  for (const groupRows of grouped.values()) {
    const accountUsage = usage[groupRows[0].kodeAkun];
    const responsibilityRows = groupRows.filter((row) => row.tahap === 'Pertanggungjawaban');

    if (responsibilityRows.length > 0) {
      accountUsage.realisasi += responsibilityRows
        .filter((row) => row.statusPJ === 'Disetujui')
        .reduce((sum, row) => sum + row.nilaiRiil, 0);
      accountUsage.komitmen += responsibilityRows
        .filter((row) => row.statusPJ !== 'Disetujui')
        .reduce((sum, row) => sum + row.nilaiRiil, 0);
      continue;
    }

    accountUsage.komitmen += groupRows
      .filter((row) => row.tahap === 'Persetujuan')
      .reduce((sum, row) => sum + (row.totalEstimasiBiaya || row.nilaiRiil), 0);
  }

  for (const account of accounts) {
    const accountUsage = usage[account.kode];
    accountUsage.realisasi = Math.max(accountUsage.realisasi, account.realisasi || 0);
    accountUsage.komitmen = Math.max(accountUsage.komitmen, account.komitmen || 0);
    accountUsage.saldo = accountUsage.pagu - accountUsage.realisasi - accountUsage.komitmen;
  }

  return usage;
}

function App() {
  const [raw, setRaw] = useState('');
  const [tujuan, setTujuan] = useState('');
  const [kodeAkun, setKodeAkun] = useState(budgetAccounts[0].kode);
  const [statusPJ, setStatusPJ] = useState<StatusPJ>('Belum Lengkap');
  const [endpoint, setEndpoint] = useState(DEFAULT_WEBAPP_URL);
  const [accounts, setAccounts] = useState<BudgetAccount[]>(budgetAccounts);
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(() => sessionStorage.getItem(AUTH_STORAGE_KEY) === 'true');
  const [accessCode, setAccessCode] = useState(
    () => localStorage.getItem(ACCESS_CODE_STORAGE_KEY) || localStorage.getItem('eperjadin_webapp_token') || '',
  );
  const [loginMessage, setLoginMessage] = useState('');
  const [geotagReason, setGeotagReason] = useState('');
  const [validationItems, setValidationItems] = useState<ValidationItem[]>([]);
  const [editingRow, setEditingRow] = useState<Row | null>(null);
  const [editingRowKey, setEditingRowKey] = useState('');

  const parsedPreview = useMemo(() => parsePerjadinClipboard(raw), [raw]);
  const parsedAccountCode = parsedPreview?.kodeAkun && findBudgetAccount(parsedPreview.kodeAkun) ? parsedPreview.kodeAkun : '';
  const usageByAccount = useMemo(() => calculateUsage(accounts, rows), [accounts, rows]);

  useEffect(() => {
    if (parsedAccountCode) setKodeAkun(parsedAccountCode);
  }, [parsedAccountCode]);

  const loadRemoteDatabase = useCallback(async (url = endpoint.trim(), showMessage = true) => {
    if (!url) {
      setMessage('Isi URL Apps Script Web App dulu.');
      return;
    }

    try {
      localStorage.setItem(ENDPOINT_STORAGE_KEY, url);
      setEndpoint(url);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'getDashboard', accessCode }),
      });
      const payload = await res.json();
      if (!payload.success) throw new Error(payload.message || 'Response Google Sheets tidak valid.');

      const nextRows = Array.isArray(payload.data) ? payload.data.map(rowFromSheet).reverse() : [];
      const nextAccounts = Array.isArray(payload.akun)
        ? (payload.akun.map(accountFromSheet).filter(Boolean) as BudgetAccount[])
        : [];

      setRows(nextRows);
      if (nextAccounts.length) setAccounts(nextAccounts);
      if (showMessage) {
        const sourceSheet = payload.sourceSheet ? ` dari tab ${payload.sourceSheet}` : '';
        setMessage(`Database Google Sheets dimuat${sourceSheet}: ${nextRows.length} baris.`);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      setMessage(detail || 'Gagal memuat database Google Sheets. Cek URL Web App, izin deploy, dan SPREADSHEET_ID Apps Script.');
    }
  }, [accessCode, endpoint]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadRemoteDatabase(endpoint.trim() || DEFAULT_WEBAPP_URL, false);
  }, [endpoint, isAuthenticated, loadRemoteDatabase]);

  const summary = useMemo(() => {
    const values = Object.values(usageByAccount);
    return {
      pagu: values.reduce((sum, item) => sum + item.pagu, 0),
      realisasi: values.reduce((sum, item) => sum + item.realisasi, 0),
      komitmen: values.reduce((sum, item) => sum + item.komitmen, 0),
      saldo: values.reduce((sum, item) => sum + item.saldo, 0),
    };
  }, [usageByAccount]);

  const counts = useMemo(
    () => ({
      kegiatan: rows.filter((row) => row.tahap === 'Kegiatan').length,
      persetujuan: rows.filter((row) => row.tahap === 'Persetujuan').length,
      pelaksanaan: rows.filter((row) => row.tahap === 'Pelaksanaan').length,
      belumLengkap: rows.filter((row) => row.tahap === 'Pertanggungjawaban' && row.statusPJ === 'Belum Lengkap').length,
      lengkap: rows.filter((row) => row.tahap === 'Pertanggungjawaban' && row.statusPJ === 'Lengkap').length,
      disetujui: rows.filter((row) => row.tahap === 'Pertanggungjawaban' && row.statusPJ === 'Disetujui').length,
    }),
    [rows],
  );

  function buildRow(): Row | null {
    const parsed = parsedPreview || parsePerjadinClipboard(raw);
    if (!parsed) return null;

    const tahap = stageFromSource(parsed.sourceType);
    const existing = rows.find(
      (row) => row.idKegiatan === parsed.idKegiatan || (parsed.nomorST && row.nomorST === parsed.nomorST),
    );
    const parsedAccount = parsed.kodeAkun && findBudgetAccount(parsed.kodeAkun) ? parsed.kodeAkun : '';
    const resolvedKodeAkun = parsedAccount || existing?.kodeAkun || kodeAkun;
    const account = accounts.find((item) => item.kode === resolvedKodeAkun) || accounts[0];
    const detectedTujuan =
      tujuan ||
      parsed.kotaTujuan ||
      inferDestinationFromGeotags(parsed.geotags, parsed.tanggalKegiatan) ||
      '';
    const range = parseTanggalRange(parsed.tanggalKegiatan);
    const uang = getUangHarian(detectedTujuan);
    const geotagRule = selectRequiredGeotagPoints(parsed.geotags, parsed.tanggalKegiatan, detectedTujuan);
    const points = geotagRule.points;
    const detailGeotag = parsed.geotags.map((g) => `${g.hariTanggal} ${g.waktuTagging} ${g.wilayahTagging}`).join(' | ');
    const totalUangHarian = uang.uangHarian * range.lamaHari;
    const nilaiRiil =
      tahap === 'Persetujuan'
        ? parsed.totalEstimasiBiaya || parsed.totalPengeluaranRiil || totalUangHarian
        : parsed.totalPengeluaranRiil || totalUangHarian;
    const statusGeotag =
      tahap === 'Pertanggungjawaban'
        ? geotagRule.status
        : parsed.geotags.length > 0
          ? geotagRule.status
          : 'Tidak Lengkap';

    return {
      tahap,
      idKegiatan: parsed.idKegiatan,
      namaKegiatan: parsed.namaKegiatan,
      nomorST: parsed.nomorST,
      nomorKegiatan: parsed.nomorKegiatan,
      nka: parsed.nomorKomitmenAnggaran || parsed.nomorKegiatan,
      tanggalKegiatan: parsed.tanggalKegiatan,
      tujuan: detectedTujuan,
      kotaTujuan: parsed.kotaTujuan || detectedTujuan,
      output: parsed.output || '',
      jenisPembayaran: parsed.jenisPembayaran || '',
      namaPegawai: parsed.peserta || (tahap === 'Persetujuan' ? 'Menunggu PJ' : ''),
      lamaHari: range.lamaHari,
      uangHarianPerHari: account.jenis === 'dalam_kota' && detectedTujuan ? uang.uangHarian : uang.uangHarian,
      totalUangHarian,
      uangMuka: parsed.uangMuka || parsed.totalUangMuka || 0,
      totalEstimasiBiaya: parsed.totalEstimasiBiaya || 0,
      totalPengeluaranRiil: parsed.totalPengeluaranRiil || 0,
      kurangLebihBayar: Math.max(0, (parsed.totalPengeluaranRiil || 0) - (parsed.uangMuka || 0)),
      statusPJ: tahap === 'Pertanggungjawaban' ? statusPJ : 'Belum Lengkap',
      statusPersetujuan: parsed.status || '',
      statusGeotag,
      start: formatPoint(points.start),
      clockIn: formatPoint(points.clockIn),
      clockOut: formatPoint(points.clockOut),
      end: formatPoint(points.end),
      volume: parsed.jumlahRute || 1,
      nilaiRiil,
      kodeAkun: resolvedKodeAkun,
      tanggalInput: today(),
      detailGeotag,
      geotagIssues: geotagRule.issues,
      keterangan: geotagReason.trim() || geotagRule.issues
        .map((issue) => `${issue.label} (${issue.expectedDate}, ${issue.expectedLocation}): ${issue.message}`)
        .join('\n'),
      jenisPerjadin: '',
      sumberData: 'Input manual ePerjadin Manager',
      waktuRekamSumber: new Date().toISOString(),
      sourceRecordKey: '',
    };
  }

  function generateGeotagStatement(rowSource?: Row) {
    const row = rowSource || buildRow();
    if (!row) {
      setMessage('Data tidak terbaca. Paste detail pertanggungjawaban dulu sebelum membuat surat geotag.');
      return;
    }

    const issues = fallbackGeotagIssues(row);
    if (issues.length === 0) {
      setMessage('Geotag sudah lengkap sesuai kaidah. Surat pernyataan tidak wajib dibuat.');
      return;
    }

    const blob = createGeotagStatementDocx({
      namaPegawai: row.namaPegawai,
      nomorST: row.nomorST,
      nomorSPD: '',
      tanggalKegiatan: row.tanggalKegiatan,
      namaKegiatan: row.namaKegiatan,
      tujuan: row.tujuan,
      start: row.start || geotagPointLabel(),
      clockIn: row.clockIn || geotagPointLabel(),
      clockOut: row.clockOut || geotagPointLabel(),
      end: row.end || geotagPointLabel(),
      issues,
    });

    const safeName = (row.namaPegawai || row.idKegiatan || 'perjadin').replace(/[^a-z0-9-]+/gi, '-');
    downloadBlob(blob, `Surat-Pernyataan-Geotag-${safeName}.docx`);
    setMessage('Surat pernyataan geotag berhasil dibuat dari hasil parsing.');
  }

  async function save() {
    const row = buildRow();
    if (!row) {
      setMessage('Data tidak terbaca. Paste detail perjadin atau detail pertanggungjawaban.');
      return;
    }

    const nextValidation = validateRow(row, accounts);
    setValidationItems(nextValidation);
    const failed = nextValidation.filter((item) => !item.ok);
    if (failed.length > 0) {
      setMessage(`Data belum disimpan. Perbaiki validasi: ${failed.map((item) => item.label).join(', ')}.`);
      return;
    }

    setRows((prev) => {
      const key = rowKey(row);
      const index = prev.findIndex((item) => rowKey(item) === key);
      if (index >= 0) {
        const copy = [...prev];
        copy[index] = row;
        return copy;
      }
      return [row, ...prev];
    });

    if (!endpoint.trim()) {
      setMessage(`${row.tahap} tersimpan lokal. Isi URL Web App jika ingin sinkron ke Google Sheets.`);
      return;
    }

    localStorage.setItem(ENDPOINT_STORAGE_KEY, endpoint.trim());
    try {
      const res = await fetch(endpoint.trim(), {
        method: 'POST',
        body: JSON.stringify({ action: 'upsertPerjadin', row, accessCode }),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      });
      const payload = await res.json();
      if (!payload.success) throw new Error(payload.message || 'Gagal menyimpan ke Google Sheets.');
      setMessage(payload.message ? `Tersimpan ke Google Sheets: ${payload.message}` : 'Tersimpan ke Google Sheets.');
      await loadRemoteDatabase(endpoint.trim(), false);
    } catch {
      setMessage('Tersimpan lokal, tetapi gagal kirim ke Google Sheets.');
    }
  }

  function updateEditingRow<K extends keyof Row>(key: K, value: Row[K]) {
    setEditingRow((current) => (current ? { ...current, [key]: value } : current));
  }

  async function saveEditedRow() {
    if (!editingRow) return;

    const nextValidation = validateRow(editingRow, accounts);
    setValidationItems(nextValidation);
    const failed = nextValidation.filter((item) => !item.ok);
    if (failed.length > 0) {
      setMessage(`Edit belum disimpan. Perbaiki validasi: ${failed.map((item) => item.label).join(', ')}.`);
      return;
    }

    setRows((prev) => prev.map((row) => (rowKey(row) === editingRowKey ? editingRow : row)));
    setEditingRow(null);
    setEditingRowKey('');

    if (!endpoint.trim()) {
      setMessage('Perubahan tersimpan lokal. Isi URL Web App jika ingin sinkron ke Google Sheets.');
      return;
    }

    try {
      const res = await fetch(endpoint.trim(), {
        method: 'POST',
        body: JSON.stringify({ action: 'upsertPerjadin', row: editingRow, previousKey: editingRowKey, accessCode }),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      });
      const payload = await res.json();
      if (!payload.success) throw new Error(payload.message || 'Gagal menyimpan edit.');
      setMessage(payload.message ? `Edit tersimpan ke Google Sheets: ${payload.message}` : 'Edit tersimpan ke Google Sheets.');
      await loadRemoteDatabase(endpoint.trim(), false);
    } catch {
      setMessage('Edit tersimpan lokal, tetapi gagal kirim ke Google Sheets.');
    }
  }

  async function deleteRow(row: Row) {
    const confirmed = window.confirm(`Hapus data ${row.namaKegiatan || row.idKegiatan} - ${row.namaPegawai || row.nomorKegiatan}?`);
    if (!confirmed) return;

    setRows((prev) => prev.filter((item) => rowKey(item) !== rowKey(row)));
    setEditingRow((current) => {
      if (!current || rowKey(current) !== rowKey(row)) return current;
      setEditingRowKey('');
      return null;
    });

    if (!endpoint.trim()) {
      setMessage('Data dihapus lokal. Isi URL Web App jika ingin sinkron ke Google Sheets.');
      return;
    }

    try {
      const res = await fetch(endpoint.trim(), {
        method: 'POST',
        body: JSON.stringify({ action: 'deletePerjadin', row, accessCode }),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      });
      const payload = await res.json();
      if (!payload.success) throw new Error(payload.message || 'Gagal menghapus data.');
      setMessage(payload.message ? `Data dihapus dari Google Sheets: ${payload.message}` : 'Data dihapus dari Google Sheets.');
      await loadRemoteDatabase(endpoint.trim(), false);
    } catch {
      setMessage('Data dihapus lokal, tetapi gagal menghapus dari Google Sheets.');
    }
  }

  const previewAccount = parsedPreview?.kodeAkun ? findBudgetAccount(parsedPreview.kodeAkun) : undefined;
  const selectedAccount = previewAccount || accounts.find((item) => item.kode === kodeAkun) || accounts[0];

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessCode.trim()) {
      setLoginMessage('Masukkan PIN akses.');
      return;
    }

    const normalizedAccessCode = accessCode.trim();
    setLoginMessage('Memeriksa PIN...');
    try {
      const res = await fetch(endpoint.trim() || DEFAULT_WEBAPP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'getDashboard', accessCode: normalizedAccessCode }),
      });
      const payload = await res.json();
      if (!payload.success) throw new Error(payload.message || 'PIN tidak dapat divalidasi.');

      localStorage.setItem(ACCESS_CODE_STORAGE_KEY, normalizedAccessCode);
      sessionStorage.setItem(AUTH_STORAGE_KEY, 'true');
      setIsAuthenticated(true);
      setLoginMessage('');
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      setLoginMessage(detail || 'Gagal menghubungi Apps Script. Periksa koneksi dan URL Web App.');
    }
  }

  function logout() {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(ACCESS_CODE_STORAGE_KEY);
    localStorage.removeItem('eperjadin_webapp_token');
    setAccessCode('');
    setLoginMessage('');
    setIsAuthenticated(false);
  }

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-5 py-10 text-zinc-950">
        <section className="w-full max-w-sm rounded-lg border bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-700 text-white">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">ePerjadin Manager</h1>
              <p className="text-sm text-zinc-500">Login admin untuk memuat dashboard.</p>
            </div>
          </div>
          <form onSubmit={login} className="space-y-3">
            <label className="block text-sm font-medium text-zinc-700" htmlFor="access-code">
              PIN Akses
            </label>
            <input
              id="access-code"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              type="password"
              inputMode="numeric"
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              autoFocus
            />
            {loginMessage && <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{loginMessage}</p>}
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white"
            >
              Masuk
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-950">
      <section className="border-b bg-white px-5 py-4">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Monitoring Perjadin PPK</h1>
            <p className="text-sm text-zinc-500">Persetujuan, pertanggungjawaban, geotagging, dan saldo akun DIPA.</p>
          </div>
          <div className="flex items-center gap-3">
            <a
              className="text-sm font-medium text-blue-700 underline-offset-4 hover:underline"
              href={`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`}
              target="_blank"
              rel="noreferrer"
            >
              Google Sheet
            </a>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700"
            >
              <LogOut className="h-4 w-4" />
              Keluar
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-5 p-5">
        <div className="grid gap-3 md:grid-cols-4">
          <Metric title="Pagu DIPA" value={rupiah(summary.pagu)} />
          <Metric title="Komitmen" value={rupiah(summary.komitmen)} tone="amber" />
          <Metric title="Realisasi" value={rupiah(summary.realisasi)} tone="green" />
          <Metric title="Saldo" value={rupiah(summary.saldo)} tone={summary.saldo < 0 ? 'red' : 'blue'} />
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <section className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-semibold">Input Parsing</h2>
              {parsedPreview && <Badge>{stageFromSource(parsedPreview.sourceType)}</Badge>}
            </div>
            <textarea
              className="h-72 w-full rounded-md border border-zinc-300 p-3 font-mono text-xs outline-none focus:border-blue-500"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              placeholder="Paste hasil copy dari Detail Perjalanan Dinas, Detail Pertanggungjawaban, atau Detail Pelaksanaan."
            />
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <input
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                value={tujuan}
                onChange={(event) => setTujuan(event.target.value)}
                placeholder="Tujuan manual"
              />
              <select
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                value={statusPJ}
                onChange={(event) => setStatusPJ(event.target.value as StatusPJ)}
              >
                <option>Belum Lengkap</option>
                <option>Lengkap</option>
                <option>Disetujui</option>
              </select>
              <select
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                value={parsedAccountCode || kodeAkun}
                onChange={(event) => setKodeAkun(event.target.value)}
              >
                {accounts.map((account) => (
                  <option key={account.kode} value={account.kode}>
                    {formatAccountOption(account)}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              className="mt-3 h-20 w-full rounded-md border border-zinc-300 p-3 text-sm outline-none focus:border-blue-500"
              value={geotagReason || buildRow()?.keterangan || ''}
              onChange={(event) => setGeotagReason(event.target.value)}
              placeholder="Catatan/alasan bila geotag tidak lengkap atau tidak sesuai."
            />
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px_auto_auto]">
              <input
                className="rounded-md border border-zinc-300 px-3 py-2 text-xs outline-none focus:border-blue-500"
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                placeholder="URL Apps Script Web App"
              />
              <input
                className="rounded-md border border-zinc-300 px-3 py-2 text-xs outline-none focus:border-blue-500"
                value={accessCode}
                onChange={(event) => setAccessCode(event.target.value)}
                onBlur={() => localStorage.setItem(ACCESS_CODE_STORAGE_KEY, accessCode.trim())}
                placeholder="PIN akses"
                type="password"
                inputMode="numeric"
              />
              <button
                type="button"
                onClick={() => loadRemoteDatabase()}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-blue-700 px-4 py-2 text-sm font-medium text-blue-700"
              >
                <RefreshCw className="h-4 w-4" />
                Muat
              </button>
              <button
                type="button"
                onClick={save}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white"
              >
                <Save className="h-4 w-4" />
                Simpan
              </button>
            </div>
            {validationItems.length > 0 && (
              <div className="mt-3 grid gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm md:grid-cols-2">
                {validationItems.map((item) => (
                  <div key={item.label} className={item.ok ? 'text-emerald-700' : 'text-red-700'}>
                    <span className="font-medium">{item.ok ? 'OK' : 'Periksa'} {item.label}</span>
                    <span className="text-zinc-500"> - {item.message}</span>
                  </div>
                ))}
              </div>
            )}
            {message && <p className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
          </section>

          <aside className="space-y-5">
            <section className="rounded-lg border bg-white p-4 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 font-semibold">
                <ClipboardCheck className="h-4 w-4 text-blue-700" />
                Hasil Deteksi
              </h2>
              {parsedPreview ? (
                <dl className="space-y-2 text-sm">
                  <Info label="Kegiatan" value={parsedPreview.namaKegiatan} />
                  <Info label="ID" value={parsedPreview.idKegiatan} mono />
                  <Info label="ST" value={parsedPreview.nomorST} />
                  <Info label="KPD/NKA" value={parsedPreview.nomorKomitmenAnggaran || parsedPreview.nomorKegiatan} />
                  <Info label="Akun" value={previewAccount?.nama || selectedAccount.nama} />
                  <Info label="Nilai" value={rupiah(parsedPreview.totalEstimasiBiaya || parsedPreview.totalPengeluaranRiil)} />
                </dl>
              ) : (
                <p className="text-sm text-zinc-500">Belum ada data terbaca.</p>
              )}
            </section>

            <section className="rounded-lg border bg-white p-4 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 font-semibold">
                <Database className="h-4 w-4 text-blue-700" />
                Status Rekap
              </h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <MiniStat label="Kegiatan" value={counts.kegiatan} />
                <MiniStat label="Persetujuan" value={counts.persetujuan} />
                <MiniStat label="Pelaksanaan" value={counts.pelaksanaan} />
                <MiniStat label="Belum Lengkap" value={counts.belumLengkap} />
                <MiniStat label="Lengkap" value={counts.lengkap} />
                <MiniStat label="Disetujui" value={counts.disetujui} />
              </div>
            </section>
          </aside>
        </div>

        <SyncPanel
          endpoint={endpoint}
          accessCode={accessCode}
          onReload={() => loadRemoteDatabase(endpoint.trim(), false)}
          onMessage={setMessage}
        />

        <section className="rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold">Saldo per Akun</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {accounts.map((account) => {
              const usage = usageByAccount[account.kode];
              const used = usage.realisasi + usage.komitmen;
              const pct = usage.pagu > 0 ? Math.min(100, Math.round((used / usage.pagu) * 100)) : 0;

              return (
                <div key={account.kode} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{account.roLabel} - {accountKindLabel(account.jenis)}</p>
                      <p className="text-xs text-zinc-500">{account.uraian}</p>
                    </div>
                    <span className="whitespace-nowrap text-sm font-semibold">{rupiah(usage.saldo)}</span>
                  </div>
                  <p className="mt-2 break-all rounded bg-zinc-50 p-2 font-mono text-[11px] text-zinc-600">{account.kode}</p>
                  <div className="mt-2 h-2 rounded bg-zinc-200">
                    <div className="h-2 rounded bg-blue-600" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    Pagu {rupiah(usage.pagu)}. Komitmen {rupiah(usage.komitmen)}. Realisasi {rupiah(usage.realisasi)}.
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {editingRow && (
          <section className="rounded-lg border border-blue-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-semibold">Edit Data Monitoring</h2>
              <button
                type="button"
                onClick={() => {
                  setEditingRow(null);
                  setEditingRowKey('');
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 text-zinc-700"
                title="Tutup editor"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <input
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                value={editingRow.namaKegiatan}
                onChange={(event) => updateEditingRow('namaKegiatan', event.target.value)}
                placeholder="Nama kegiatan"
              />
              <input
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                value={editingRow.nomorST}
                onChange={(event) => updateEditingRow('nomorST', event.target.value)}
                placeholder="Nomor ST"
              />
              <input
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                value={editingRow.tanggalKegiatan}
                onChange={(event) => updateEditingRow('tanggalKegiatan', event.target.value)}
                placeholder="Tanggal kegiatan"
              />
              <input
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                value={editingRow.namaPegawai}
                onChange={(event) => updateEditingRow('namaPegawai', event.target.value)}
                placeholder="Nama pegawai"
              />
              <input
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                value={editingRow.tujuan}
                onChange={(event) => updateEditingRow('tujuan', event.target.value)}
                placeholder="Tujuan"
              />
              <select
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                value={editingRow.statusPJ}
                onChange={(event) => updateEditingRow('statusPJ', event.target.value as StatusPJ)}
              >
                <option>Belum Lengkap</option>
                <option>Lengkap</option>
                <option>Disetujui</option>
              </select>
              <select
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                value={editingRow.kodeAkun}
                onChange={(event) => updateEditingRow('kodeAkun', event.target.value)}
              >
                {accounts.map((account) => (
                  <option key={account.kode} value={account.kode}>
                    {formatAccountOption(account)}
                  </option>
                ))}
              </select>
              <input
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                value={editingRow.nilaiRiil}
                onChange={(event) => updateEditingRow('nilaiRiil', Number(event.target.value) || 0)}
                placeholder="Nilai riil"
                type="number"
                min="0"
              />
              <input
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                value={editingRow.statusGeotag}
                onChange={(event) => updateEditingRow('statusGeotag', event.target.value)}
                placeholder="Status geotag"
              />
            </div>
            <textarea
              className="mt-3 h-20 w-full rounded-md border border-zinc-300 p-3 text-sm"
              value={editingRow.keterangan}
              onChange={(event) => updateEditingRow('keterangan', event.target.value)}
              placeholder="Catatan/keterangan"
            />
            <button
              type="button"
              onClick={saveEditedRow}
              className="mt-3 inline-flex items-center justify-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white"
            >
              <Save className="h-4 w-4" />
              Simpan Edit
            </button>
          </section>
        )}

        <section className="rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold">Data Monitoring</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-zinc-900 text-white">
                <tr>
                  {['Tahap', 'ID', 'Nama Kegiatan', 'Nomor ST', 'KPD/NKA', 'Tanggal', 'Pegawai', 'Status', 'Geotag', 'Nilai', 'Akun', 'Aksi'].map((head) => (
                    <th key={head} className="whitespace-nowrap p-2 text-left font-medium">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="p-6 text-center text-zinc-500">
                      Belum ada data.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const canGenerateStatement = isProblemGeotag(row.statusGeotag);

                    return (
                      <tr key={rowKey(row)} className="border-b hover:bg-zinc-50">
                        <td className="whitespace-nowrap p-2">{row.tahap}</td>
                        <td className="p-2 font-mono">{row.idKegiatan}</td>
                        <td className="min-w-80 p-2">{row.namaKegiatan}</td>
                        <td className="whitespace-nowrap p-2">{row.nomorST}</td>
                        <td className="whitespace-nowrap p-2">{row.nka || row.nomorKegiatan}</td>
                        <td className="whitespace-nowrap p-2">{row.tanggalKegiatan}</td>
                        <td className="whitespace-nowrap p-2">{row.namaPegawai}</td>
                        <td className="whitespace-nowrap p-2">{row.tahap === 'Persetujuan' ? row.statusPersetujuan || 'Disetujui' : row.statusPJ}</td>
                        <td className="whitespace-nowrap p-2">
                          {canGenerateStatement ? (
                            <button
                              type="button"
                              onClick={() => generateGeotagStatement(row)}
                              className="inline-flex items-center justify-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                              title="Buat surat pernyataan geotag"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              {row.statusGeotag}
                            </button>
                          ) : (
                            row.statusGeotag
                          )}
                        </td>
                        <td className="whitespace-nowrap p-2 text-right">{rupiah(row.nilaiRiil)}</td>
                        <td className="min-w-80 p-2">{formatAccountName(accounts.find((account) => account.kode === row.kodeAkun)) || row.kodeAkun}</td>
                        <td className="whitespace-nowrap p-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRow(row);
                                setEditingRowKey(rowKey(row));
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-100"
                              title="Edit baris"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteRow(row)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-700 hover:bg-red-50"
                              title="Hapus baris"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ title, value, tone }: { title: string; value: string; tone?: 'blue' | 'green' | 'amber' | 'red' }) {
  const colors = {
    blue: 'border-blue-200 bg-blue-50 text-blue-950',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    amber: 'border-amber-200 bg-amber-50 text-amber-950',
    red: 'border-red-200 bg-red-50 text-red-950',
  };

  return (
    <div className={`rounded-lg border p-4 shadow-sm ${colors[tone || 'blue']}`}>
      <p className="text-sm opacity-70">{title}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">{children}</span>;
}

function Info({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd className={mono ? 'font-mono' : ''}>{value || '-'}</dd>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-zinc-50 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

export default App;
