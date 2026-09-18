import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, Search, UserRound, WalletCards } from 'lucide-react';
import { readApiResponse } from './apiClient';

type DashboardRow = Record<string, unknown>;

type Props = { endpoint: string };

const DEFAULT_V4_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzR6tkMeQD2cARpMYqm6GpTszkNsXUsCLOQi_pMUaTMmBWrkSjKupSi3_iY2cIiGzd3/exec';

const statuses = ['Belum Lengkap', 'Sudah Kirim', 'Proses Pencairan', 'Selesai Pencairan', 'Kekurangan Dokumen'];

function text(row: DashboardRow, key: string) {
  return String(row[key] ?? '').trim();
}

function number(row: DashboardRow, key: string) {
  const value = String(row[key] ?? '').replace(/[^\d-]/g, '');
  return Number(value) || 0;
}

function rupiah(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
}

function statusClass(status: string) {
  if (status === 'Selesai Pencairan') return 'bg-emerald-100 text-emerald-800';
  if (status === 'Proses Pencairan') return 'bg-blue-100 text-blue-800';
  if (status === 'Sudah Kirim') return 'bg-amber-100 text-amber-800';
  if (status === 'Kekurangan Dokumen') return 'bg-rose-100 text-rose-800';
  return 'bg-slate-100 text-slate-700';
}

function displayStatus(row: DashboardRow) {
  const status = text(row, 'Status Pertanggungjawaban');
  if (status === 'Lengkap') return 'Sudah Kirim';
  if (status === 'Disetujui') return 'Proses Pencairan';
  if (status === 'Belum Ditentukan' || !status) return 'Belum Lengkap';
  return status;
}

export default function DashboardV4({ endpoint }: Props) {
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('Semua');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const request = async (url: string) => {
        const separator = url.includes('?') ? '&' : '?';
        const response = await fetch(`${url}${separator}action=getDashboardV4`, { method: 'GET' });
        return readApiResponse(response);
      };
      let payload;
      try {
        payload = await request(endpoint.trim() || DEFAULT_V4_ENDPOINT);
      } catch (firstError) {
        const current = endpoint.trim();
        if (current === DEFAULT_V4_ENDPOINT || !/HTML|JSON|login|deployment/i.test(firstError instanceof Error ? firstError.message : String(firstError))) throw firstError;
        payload = await request(DEFAULT_V4_ENDPOINT);
      }
      if (!payload.success || !Array.isArray(payload.data)) throw new Error(String(payload.message || 'Database belum mengembalikan data dashboard.'));
      localStorage.setItem('eperjadin_webapp_url_v4', DEFAULT_V4_ENDPOINT);
      setRows(Array.isArray(payload.data) ? payload.data as DashboardRow[] : []);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    const count = (status: string) => rows.filter((row) => displayStatus(row) === status).length;
    const incomplete = rows.filter((row) => {
      const status = displayStatus(row);
      const geotag = text(row, 'Status Geotag');
      return ['Belum Lengkap', 'Kekurangan Dokumen'].includes(status) || geotag !== 'Lengkap' || number(row, 'Jumlah Presensi') < 4;
    });
    return { count, incomplete, total: rows.length, totalValue: rows.reduce((sum, row) => sum + number(row, 'Total Pengeluaran Riil'), 0) };
  }, [rows]);

  const visibleRows = useMemo(() => rows.filter((row) => {
    const status = displayStatus(row);
    const haystack = [text(row, 'Pelaksana SPD'), text(row, 'NIP'), text(row, 'Nomor SPD'), text(row, 'Nomor ST'), text(row, 'Nama Kegiatan')].join(' ').toLowerCase();
    return (filter === 'Semua' || status === filter) && haystack.includes(query.toLowerCase());
  }), [rows, query, filter]);

  const employeeRows = useMemo(() => {
    const grouped = new Map<string, { name: string; nip: string; total: number; followUp: number; statuses: string[]; issues: string[]; spds: string[] }>();
    rows.forEach((row) => {
      const name = text(row, 'Pelaksana SPD') || 'Nama belum terbaca';
      const nip = text(row, 'NIP');
      const key = nip || name;
      const current = grouped.get(key) || { name, nip, total: 0, followUp: 0, statuses: [], issues: [], spds: [] };
      const status = displayStatus(row);
      const geotag = text(row, 'Status Geotag');
      const presensi = number(row, 'Jumlah Presensi');
      current.total += 1;
      current.statuses.push(status);
      current.spds.push(text(row, 'Nomor SPD'));
      if (['Belum Lengkap', 'Kekurangan Dokumen'].includes(status) || geotag !== 'Lengkap' || presensi < 4) {
        current.followUp += 1;
        if (['Belum Lengkap', 'Kekurangan Dokumen'].includes(status)) current.issues.push(`${text(row, 'Nomor SPD')}: pertanggungjawaban ${status.toLowerCase()}`);
        if (presensi < 4) current.issues.push(`${text(row, 'Nomor SPD')}: presensi baru ${presensi} titik`);
        if (geotag && geotag !== 'Lengkap') current.issues.push(`${text(row, 'Nomor SPD')}: geotag ${geotag.toLowerCase()}`);
      }
      grouped.set(key, current);
    });
    return [...grouped.values()].sort((a, b) => b.followUp - a.followUp || a.name.localeCompare(b.name));
  }, [rows]);

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Dashboard Monitoring SPD</h2>
          <p className="mt-1 text-sm text-slate-500">Pantau pengajuan, kelengkapan dokumen, presensi, dan pencairan per pegawai.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Memuat...' : 'Muat data terbaru'}
        </button>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      {!rows.length && !loading && !error && <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Klik “Muat data terbaru” untuk mengambil data dari Master E-Perjadin.</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total SPD" value={stats.total} icon={<WalletCards className="h-5 w-5" />} />
        <Metric label="Perlu ditindaklanjuti" value={stats.incomplete.length} icon={<AlertTriangle className="h-5 w-5" />} tone="amber" />
        <Metric label="Presensi lengkap" value={rows.filter((row) => number(row, 'Jumlah Presensi') >= 4 && text(row, 'Status Geotag') === 'Lengkap').length} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" />
        <Metric label="Total pengeluaran" value={rupiah(stats.totalValue)} icon={<Clock3 className="h-5 w-5" />} />
      </div>

      {rows.length > 0 && <>
        <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold">Tahap pertanggungjawaban</h3>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {statuses.map((status) => <button key={status} type="button" onClick={() => setFilter(status)} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-3 text-left hover:border-blue-400"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(status)}`}>{status}</span><strong>{stats.count(status)}</strong></button>)}
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold">Pegawai yang perlu diingatkan</h3>
            <div className="mt-3 space-y-2">
              {employeeRows.filter((row) => row.followUp > 0).slice(0, 6).map((row) => <div key={row.nip || row.name} className="flex items-start justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2 text-sm"><span><strong>{row.name}</strong><br /><span className="text-xs text-slate-600">{row.nip || 'NIP belum tersedia'} · {row.followUp} SPD perlu ditindaklanjuti</span></span><span className="whitespace-nowrap text-xs text-amber-800">{row.total} SPD</span></div>)}
              {!stats.incomplete.length && <p className="text-sm text-emerald-700">Tidak ada data yang perlu ditindaklanjuti.</p>}
            </div>
          </section>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between"><div><h3 className="font-semibold">Monitoring per pegawai</h3><p className="mt-1 text-sm text-slate-500">Ringkasan ini dapat digunakan sebagai bahan pemberitahuan kepada masing-masing pegawai.</p></div><span className="text-xs text-slate-500">{employeeRows.length} pegawai terdata</span></div>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Pegawai</th><th className="px-3 py-3">SPD</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Bahan pemberitahuan</th></tr></thead><tbody>{employeeRows.map((employee) => <tr key={employee.nip || employee.name} className="border-b align-top last:border-0"><td className="px-3 py-3"><div className="font-medium">{employee.name}</div><div className="text-xs text-slate-500">{employee.nip || 'NIP belum tersedia'}</div></td><td className="px-3 py-3"><div>{employee.total} SPD</div><div className="max-w-[220px] truncate text-xs text-slate-500">{employee.spds.join(', ')}</div></td><td className="px-3 py-3"><div className={employee.followUp ? 'font-semibold text-amber-700' : 'font-semibold text-emerald-700'}>{employee.followUp ? `${employee.followUp} perlu ditindaklanjuti` : 'Tidak ada temuan'}</div><div className="text-xs text-slate-500">{[...new Set(employee.statuses)].join(', ')}</div></td><td className="px-3 py-3 text-xs text-slate-600">{employee.issues.length ? employee.issues.slice(0, 4).join(' · ') : 'Dokumen dan presensi terpantau lengkap.'}</td></tr>)}</tbody></table></div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h3 className="font-semibold">Daftar monitoring pegawai</h3>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari pegawai, SPD, ST..." className="rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" /></label>
              <select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option>Semua</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Pegawai</th><th className="px-3 py-3">Kegiatan / ST</th><th className="px-3 py-3">SPD</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Dokumen & presensi</th><th className="px-3 py-3 text-right">Nilai riil</th></tr></thead><tbody>{visibleRows.map((row) => { const status = displayStatus(row); const missing = text(row, 'Status Geotag') !== 'Lengkap' || number(row, 'Jumlah Presensi') < 4; return <tr key={text(row, 'Kunci SPD')} className="border-b last:border-0"><td className="px-3 py-3"><span className="inline-flex items-center gap-2 font-medium"><UserRound className="h-4 w-4 text-slate-400" />{text(row, 'Pelaksana SPD') || '-'}</span><div className="pl-6 text-xs text-slate-500">{text(row, 'NIP')}</div></td><td className="max-w-[280px] px-3 py-3"><div className="truncate">{text(row, 'Nama Kegiatan') || '-'}</div><div className="text-xs text-slate-500">{text(row, 'Nomor ST')}</div></td><td className="px-3 py-3 font-medium">{text(row, 'Nomor SPD')}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(status)}`}>{status}</span></td><td className="px-3 py-3 text-xs"><span className={missing ? 'text-amber-700' : 'text-emerald-700'}>{missing ? 'Perlu dilengkapi' : 'Lengkap'}</span><div className="text-slate-500">{number(row, 'Jumlah Presensi')} titik · geotag {text(row, 'Status Geotag') || '-'}</div></td><td className="px-3 py-3 text-right font-medium">{rupiah(number(row, 'Total Pengeluaran Riil'))}</td></tr>; })}</tbody></table></div>
          <p className="mt-3 text-xs text-slate-500">Menampilkan {visibleRows.length} dari {rows.length} SPD.</p>
        </section>
      </>}
    </section>
  );
}

function Metric({ label, value, icon, tone = 'blue' }: { label: string; value: string | number; icon: React.ReactNode; tone?: 'blue' | 'amber' | 'green' }) {
  const color = tone === 'green' ? 'text-emerald-700 bg-emerald-50' : tone === 'amber' ? 'text-amber-700 bg-amber-50' : 'text-blue-700 bg-blue-50';
  return <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`mb-3 inline-flex rounded-lg p-2 ${color}`}>{icon}</div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></article>;
}
