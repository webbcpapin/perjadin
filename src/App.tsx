import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Database, RefreshCw, Save } from 'lucide-react';
import './App.css';
import { accountKindLabel, budgetAccounts, findBudgetAccount, type BudgetAccount } from './data/perjadinAccounts';
import { getUangHarian, parseTanggalRange } from './data/sbmData';
import { detectGeotagPoints, parsePerjadinClipboard } from './utils/parser';

type Stage = 'Persetujuan' | 'Pertanggungjawaban' | 'Pelaksanaan';
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
};

type AccountUsage = { pagu: number; realisasi: number; komitmen: number; saldo: number };

const SPREADSHEET_ID = '1fkXASbZbnPCZeW2FSxteE-oOnacVuJRCxQ8zWOgPRh8';

const rupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);

const today = () =>
  new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');

function formatPoint(point?: { hariTanggal: string; waktuTagging: string; wilayahTagging: string }) {
  if (!point) return '';
  return `${point.hariTanggal} ${point.waktuTagging} ${point.wilayahTagging}`;
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

function rowKey(row: Row) {
  const pegawaiAtauKegiatan = row.namaPegawai || row.nomorKegiatan || row.nka || 'kegiatan';
  return `${row.tahap}|${row.idKegiatan}|${row.nomorST}|${pegawaiAtauKegiatan}`;
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
  const [endpoint, setEndpoint] = useState(() => localStorage.getItem('eperjadin_webapp_url') || '');
  const [accounts, setAccounts] = useState<BudgetAccount[]>(budgetAccounts);
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState('');

  const parsedPreview = useMemo(() => parsePerjadinClipboard(raw), [raw]);
  const parsedAccountCode = parsedPreview?.kodeAkun && findBudgetAccount(parsedPreview.kodeAkun) ? parsedPreview.kodeAkun : '';
  const usageByAccount = useMemo(() => calculateUsage(accounts, rows), [accounts, rows]);

  useEffect(() => {
    const savedUrl = localStorage.getItem('eperjadin_webapp_url') || '';
    if (!savedUrl) return;

    async function loadInitialRemote() {
      try {
        const res = await fetch(savedUrl, { method: 'GET' });
        const payload = await res.json();
        if (!payload.success) return;

        const nextRows = Array.isArray(payload.data) ? payload.data.map(rowFromSheet).reverse() : [];
        const nextAccounts = Array.isArray(payload.akun)
          ? (payload.akun.map(accountFromSheet).filter(Boolean) as BudgetAccount[])
          : [];

        setRows(nextRows);
        if (nextAccounts.length) setAccounts(nextAccounts);
      } catch {
        setMessage('Gagal memuat database Google Sheets. Cek URL Web App, izin deploy, dan SPREADSHEET_ID Apps Script.');
      }
    }

    void loadInitialRemote();
  }, []);

  useEffect(() => {
    if (parsedAccountCode) setKodeAkun(parsedAccountCode);
  }, [parsedAccountCode]);

  async function loadRemoteDatabase(url = endpoint.trim(), showMessage = true) {
    if (!url) {
      setMessage('Isi URL Apps Script Web App dulu.');
      return;
    }

    try {
      localStorage.setItem('eperjadin_webapp_url', url);
      const res = await fetch(url, { method: 'GET' });
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
    } catch {
      setMessage('Gagal memuat database Google Sheets. Cek URL Web App, izin deploy, dan SPREADSHEET_ID Apps Script.');
    }
  }

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
      persetujuan: rows.filter((row) => row.tahap === 'Persetujuan').length,
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
      parsed.geotags.at(-2)?.wilayahTagging ||
      parsed.geotags.at(-1)?.wilayahTagging ||
      '';
    const range = parseTanggalRange(parsed.tanggalKegiatan);
    const uang = getUangHarian(detectedTujuan);
    const points = detectGeotagPoints(parsed.geotags);
    const detailGeotag = parsed.geotags.map((g) => `${g.hariTanggal} ${g.waktuTagging} ${g.wilayahTagging}`).join(' | ');
    const totalUangHarian = uang.uangHarian * range.lamaHari;
    const nilaiRiil =
      tahap === 'Persetujuan'
        ? parsed.totalEstimasiBiaya || parsed.totalPengeluaranRiil || totalUangHarian
        : parsed.totalPengeluaranRiil || totalUangHarian;
    const statusGeotag = parsed.geotags.length >= 4 ? 'Lengkap' : parsed.geotags.length > 0 ? 'Sebagian' : 'Belum Ada';

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
    };
  }

  async function save() {
    const row = buildRow();
    if (!row) {
      setMessage('Data tidak terbaca. Paste detail perjadin atau detail pertanggungjawaban.');
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

    localStorage.setItem('eperjadin_webapp_url', endpoint.trim());
    try {
      const res = await fetch(endpoint.trim(), {
        method: 'POST',
        body: JSON.stringify({ action: 'upsertPerjadin', row }),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      });
      const payload = await res.json();
      setMessage(payload.message ? `Tersimpan ke Google Sheets: ${payload.message}` : 'Tersimpan ke Google Sheets.');
      await loadRemoteDatabase(endpoint.trim(), false);
    } catch {
      setMessage('Tersimpan lokal, tetapi gagal kirim ke Google Sheets.');
    }
  }

  const previewAccount = parsedPreview?.kodeAkun ? findBudgetAccount(parsedPreview.kodeAkun) : undefined;
  const selectedAccount = previewAccount || accounts.find((item) => item.kode === kodeAkun) || accounts[0];

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-950">
      <section className="border-b bg-white px-5 py-4">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Monitoring Perjadin PPK</h1>
            <p className="text-sm text-zinc-500">Persetujuan, pertanggungjawaban, geotagging, dan saldo akun DIPA.</p>
          </div>
          <a
            className="text-sm font-medium text-blue-700 underline-offset-4 hover:underline"
            href={`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`}
            target="_blank"
            rel="noreferrer"
          >
            Google Sheet
          </a>
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
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto]">
              <input
                className="rounded-md border border-zinc-300 px-3 py-2 text-xs outline-none focus:border-blue-500"
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                placeholder="URL Apps Script Web App"
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
                <MiniStat label="Persetujuan" value={counts.persetujuan} />
                <MiniStat label="Belum Lengkap" value={counts.belumLengkap} />
                <MiniStat label="Lengkap" value={counts.lengkap} />
                <MiniStat label="Disetujui" value={counts.disetujui} />
              </div>
            </section>
          </aside>
        </div>

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

        <section className="rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold">Data Monitoring</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-zinc-900 text-white">
                <tr>
                  {['Tahap', 'ID', 'Nama Kegiatan', 'Nomor ST', 'KPD/NKA', 'Tanggal', 'Pegawai', 'Status', 'Geotag', 'Nilai', 'Akun'].map((head) => (
                    <th key={head} className="whitespace-nowrap p-2 text-left font-medium">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-6 text-center text-zinc-500">
                      Belum ada data.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={rowKey(row)} className="border-b hover:bg-zinc-50">
                      <td className="whitespace-nowrap p-2">{row.tahap}</td>
                      <td className="p-2 font-mono">{row.idKegiatan}</td>
                      <td className="min-w-80 p-2">{row.namaKegiatan}</td>
                      <td className="whitespace-nowrap p-2">{row.nomorST}</td>
                      <td className="whitespace-nowrap p-2">{row.nka || row.nomorKegiatan}</td>
                      <td className="whitespace-nowrap p-2">{row.tanggalKegiatan}</td>
                      <td className="whitespace-nowrap p-2">{row.namaPegawai}</td>
                      <td className="whitespace-nowrap p-2">{row.tahap === 'Persetujuan' ? row.statusPersetujuan || 'Disetujui' : row.statusPJ}</td>
                      <td className="whitespace-nowrap p-2">{row.statusGeotag}</td>
                      <td className="whitespace-nowrap p-2 text-right">{rupiah(row.nilaiRiil)}</td>
                      <td className="min-w-80 p-2">{formatAccountName(accounts.find((account) => account.kode === row.kodeAkun)) || row.kodeAkun}</td>
                    </tr>
                  ))
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
