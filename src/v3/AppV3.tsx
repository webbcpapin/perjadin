import { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardPaste, Database, MapPin, RefreshCw, Save, ShieldAlert, WalletCards } from 'lucide-react';
import '../index.css';
import { budgetAccounts, findBudgetAccount } from '../data/perjadinAccounts';
import { inferDestinationFromGeotags, selectRequiredGeotagPoints } from '../utils/geotagRules';
import { parseEPerjadinV3 } from './parserV3';

const DEFAULT_WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbzR6tkMeQD2cARpMYqm6GpTszkNsXUsCLOQi_pMUaTMmBWrkSjKupSi3_iY2cIiGzd3/exec';
const WEBAPP_STORAGE_KEY = 'eperjadin_webapp_url_v4';
const STATUS_PERTANGGUNGJAWABAN = [
  'Belum Lengkap',
  'Sudah Kirim',
  'Proses Pencairan',
  'Selesai Pencairan',
  'Kekurangan Dokumen',
] as const;
type StatusPertanggungjawaban = (typeof STATUS_PERTANGGUNGJAWABAN)[number];

function rupiah(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function today() {
  return new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
}

async function parseApiPayload(response: Response) {
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    if (/<!doctype|<html/i.test(trimmed)) {
      throw new Error('Apps Script mengembalikan halaman HTML. Deploy Web App dengan akses Anyone, lalu gunakan URL /exec terbaru.');
    }
    throw new Error(`Respons database bukan JSON. HTTP ${response.status}.`);
  }
  return JSON.parse(trimmed);
}

export default function AppV3() {
  const [raw, setRaw] = useState('');
  const [endpoint, setEndpoint] = useState(() => localStorage.getItem(WEBAPP_STORAGE_KEY) || DEFAULT_WEBAPP_URL);
  const [kodeAkun, setKodeAkun] = useState('');
  const [statusPJ, setStatusPJ] = useState<StatusPertanggungjawaban>('Belum Lengkap');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');

  const parsed = useMemo(() => parseEPerjadinV3(raw), [raw]);
  const detectedDestination = useMemo(() => {
    if (!parsed) return '';
    return parsed.tujuan || inferDestinationFromGeotags(parsed.geotags, parsed.tanggalKegiatan);
  }, [parsed]);

  const geotag = useMemo(() => {
    if (!parsed) return null;
    return selectRequiredGeotagPoints(parsed.geotags, parsed.tanggalKegiatan, detectedDestination);
  }, [parsed, detectedDestination]);

  const effectiveAccount = parsed?.kodeAkun || kodeAkun;
  const account = effectiveAccount ? findBudgetAccount(effectiveAccount) : undefined;
  const totalKomponenDikirim = useMemo(() => {
    if (!parsed) return 0;
    return parsed.components
      .filter((item) => /^(Dikirim|Disetujui|Dibayar|Selesai)$/i.test(item.status))
      .reduce((sum, item) => sum + item.nilaiRiil, 0);
  }, [parsed]);
  const sourceTotal = parsed?.totalPengeluaranRiil || totalKomponenDikirim || 0;
  const componentDelta = sourceTotal - totalKomponenDikirim;
  const uangHarian = parsed?.components.find((item) => /^Uang Harian$/i.test(item.nama))?.nilaiRiil || 0;
  const ready = Boolean(parsed?.idKegiatan && parsed?.nomorST && parsed?.peserta && parsed?.nomorSPD && sourceTotal > 0 && account);

  async function validateConnection() {
    const url = endpoint.trim();
    if (!url) {
      setConnectionStatus('error');
      setConnectionMessage('URL Apps Script belum tersedia.');
      return;
    }
    setConnectionStatus('checking');
    setConnectionMessage('Memeriksa koneksi database...');
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'getDashboardV4' }),
      });
      const payload = await parseApiPayload(response);
      if (!payload.success) throw new Error(payload.message || 'Koneksi database tidak berhasil.');
      localStorage.setItem(WEBAPP_STORAGE_KEY, url);
      setConnectionStatus('ok');
      setConnectionMessage(`Koneksi ePerjadin V${payload.version || 4} aktif.`);
    } catch (error) {
      setConnectionStatus('error');
      setConnectionMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function updateEndpoint(value: string) {
    setEndpoint(value);
    setConnectionStatus('idle');
    setConnectionMessage('');
    setMessage('');
  }

  async function save() {
    if (!parsed) return setMessage('Data belum terbaca. Paste Detail Pertanggungjawaban ePerjadin terlebih dahulu.');
    if (!account) return setMessage('Akun belum teridentifikasi. Pilih akun yang benar sebelum menyimpan.');
    if (!parsed.nomorSPD) return setMessage('Nomor SPD belum terbaca. Data tidak disimpan.');
    if (!sourceTotal) return setMessage('Total Pengeluaran Riil belum terbaca. Data tidak disimpan.');

    const points = geotag?.points || {};
    const detailGeotag = parsed.geotags
      .map((item) => `${item.hariTanggal} ${item.waktuTagging} ${item.wilayahTagging} ${item.lokasiTagging}`.trim())
      .join(' | ');
    const kunciSPD = `${parsed.idKegiatan}|${parsed.nomorSPD}`.toLowerCase();

    const row = {
      kunciSPD,
      idKegiatan: parsed.idKegiatan,
      namaKegiatan: parsed.namaKegiatan,
      nomorST: parsed.nomorST,
      lampiranST: parsed.lampiranST,
      nomorKegiatan: parsed.nomorKegiatan,
      dipaInisiator: parsed.dipaInisiator,
      ppk: parsed.ppk,
      peserta: parsed.peserta,
      nip: parsed.nip,
      nomorSPD: parsed.nomorSPD,
      nomorPerjalanan: parsed.nomorPerjalanan,
      jumlahRute: parsed.jumlahRute,
      tujuan: detectedDestination,
      tanggalMulai: parsed.tanggalMulai,
      tanggalSelesai: parsed.tanggalSelesai,
      tanggalKegiatan: parsed.tanggalKegiatan,
      durasiHari: parsed.durasiHari,
      menginap: parsed.menginap,
      uangMuka: parsed.uangMuka,
      totalPengeluaranRiil: sourceTotal,
      kodeAkun: account.kode,
      namaAkun: account.nama,
      statusPJ,
      statusGeotag: geotag?.status || 'Belum Dinilai',
      start: points.start ? `${points.start.hariTanggal} ${points.start.waktuTagging} ${points.start.wilayahTagging}` : '',
      clockIn: points.clockIn ? `${points.clockIn.hariTanggal} ${points.clockIn.waktuTagging} ${points.clockIn.wilayahTagging}` : '',
      clockOut: points.clockOut ? `${points.clockOut.hariTanggal} ${points.clockOut.waktuTagging} ${points.clockOut.wilayahTagging}` : '',
      end: points.end ? `${points.end.hariTanggal} ${points.end.waktuTagging} ${points.end.wilayahTagging}` : '',
      detailGeotag,
      tanggalInput: today(),
      sumberData: 'Input parsing ePerjadin v4',
      waktuRekamSumber: new Date().toISOString(),
      schemaVersion: 4,
      routes: parsed.routes,
      components: parsed.components,
      geotags: parsed.geotags,

      // Field kompatibilitas. Backend V4 tidak memakai perhitungan SBM lokal.
      tahap: 'Pertanggungjawaban',
      nka: parsed.nomorSPD,
      namaPegawai: parsed.peserta,
      lamaHari: parsed.durasiHari,
      uangHarianPerHari: parsed.durasiHari > 0 ? Math.round(uangHarian / parsed.durasiHari) : uangHarian,
      totalUangHarian: uangHarian,
      nilaiRiil: sourceTotal,
    };

    setSaving(true);
    setMessage('');
    try {
      localStorage.setItem(WEBAPP_STORAGE_KEY, endpoint.trim());
      const response = await fetch(endpoint.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'upsertPerjadinV4', row }),
      });
      const payload = await parseApiPayload(response);
      if (!payload.success) throw new Error(payload.message || 'Gagal menyimpan data.');
      setConnectionStatus('ok');
      setConnectionMessage('Koneksi ePerjadin V4 aktif.');
      setMessage(
        `Tersimpan. ${parsed.nomorSPD} | ${parsed.peserta} | ${rupiah(sourceTotal)} | ${parsed.components.length} komponen`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">ePerjadin Workspace</p>
          <div className="mt-1 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Monitoring Pertanggungjawaban Perjalanan Dinas</h1>
              <p className="mt-1 text-sm text-slate-500">Parser v4. Seluruh komponen biaya mengikuti nilai hasil copy ePerjadin.</p>
            </div>
            <div className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">Schema v4</div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-5 p-5">
        <div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <ClipboardPaste className="h-5 w-5 text-blue-700" />
              <h2 className="font-semibold">Input Copy-Paste ePerjadin</h2>
            </div>
            <textarea
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              className="h-[420px] w-full rounded-lg border border-slate-300 p-4 font-mono text-xs leading-5 outline-none focus:border-blue-500"
              placeholder="Paste seluruh teks Detail Pertanggungjawaban dan Presensi ePerjadin di sini..."
            />
          </section>

          <aside className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Database className="h-5 w-5 text-blue-700" />
                <h2 className="font-semibold">Koneksi Database V4</h2>
              </div>
              <label className="text-xs font-medium text-slate-600">Apps Script Web App</label>
              <div className="mt-1 flex gap-2">
                <input value={endpoint} onChange={(e) => updateEndpoint(e.target.value)} className="min-w-0 flex-1 rounded-md border px-3 py-2 text-xs" />
                <button type="button" onClick={() => void validateConnection()} disabled={connectionStatus === 'checking'} className="inline-flex items-center gap-2 rounded-md border border-blue-700 px-3 py-2 text-xs font-medium text-blue-700 disabled:opacity-50">
                  <RefreshCw className={`h-3.5 w-3.5 ${connectionStatus === 'checking' ? 'animate-spin' : ''}`} />
                  Uji Koneksi
                </button>
              </div>
              {connectionMessage && (
                <p className={`mt-2 rounded-md p-2 text-xs ${connectionStatus === 'ok' ? 'bg-emerald-50 text-emerald-700' : connectionStatus === 'error' ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-600'}`}>
                  {connectionMessage}
                </p>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <WalletCards className="h-5 w-5 text-blue-700" />
                <h2 className="font-semibold">Akun Anggaran</h2>
              </div>
              <select value={effectiveAccount} onChange={(e) => setKodeAkun(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm">
                <option value="">Pilih akun, jangan gunakan akun otomatis</option>
                {budgetAccounts.map((item) => <option key={item.kode} value={item.kode}>{item.nama}</option>)}
              </select>
              {!account && parsed && <p className="mt-2 text-xs text-amber-700">Kode akun tidak ada pada hasil copy. Pilih akun secara manual.</p>}
              <label className="mt-3 block text-xs font-medium text-slate-600">Status Pertanggungjawaban</label>
              <select value={statusPJ} onChange={(e) => setStatusPJ(e.target.value as StatusPertanggungjawaban)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm">
                {STATUS_PERTANGGUNGJAWABAN.map((status) => <option key={status}>{status}</option>)}
              </select>
            </section>
          </aside>
        </div>

        {parsed && (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InfoCard title="Kegiatan" icon={<CheckCircle2 className="h-4 w-4" />} lines={[parsed.namaKegiatan, parsed.nomorST, parsed.nomorKegiatan || 'Nomor kegiatan: -']} />
              <InfoCard title="SPD" icon={<Database className="h-4 w-4" />} lines={[parsed.peserta, parsed.nip ? `NIP ${parsed.nip}` : '', parsed.nomorSPD]} />
              <InfoCard title="Keuangan" icon={<WalletCards className="h-4 w-4" />} lines={[`Total ${rupiah(sourceTotal)}`, `${parsed.components.length} komponen`, `Uang Muka ${rupiah(parsed.uangMuka)}`]} />
              <InfoCard title="Presensi" icon={<MapPin className="h-4 w-4" />} lines={[`${parsed.geotags.length} titik`, geotag?.status || 'Belum dinilai', detectedDestination]} />
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-semibold">Komponen Biaya</h2>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${Math.abs(componentDelta) < 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {Math.abs(componentDelta) < 1 ? 'Total komponen sesuai' : `Selisih ${rupiah(componentDelta)}`}
                </span>
              </div>
              {parsed.components.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[650px] text-left text-sm">
                    <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                      <tr><th className="px-3 py-2">Komponen</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Nilai Riil</th></tr>
                    </thead>
                    <tbody>
                      {parsed.components.map((item, index) => (
                        <tr key={`${item.nama}-${index}`} className="border-b last:border-0">
                          <td className="px-3 py-2">{item.nama}</td>
                          <td className="px-3 py-2">{item.status || '-'}</td>
                          <td className="px-3 py-2 text-right font-medium">{rupiah(item.nilaiRiil)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t bg-slate-50 font-semibold">
                      <tr><td className="px-3 py-2" colSpan={2}>Total komponen dikirim</td><td className="px-3 py-2 text-right">{rupiah(totalKomponenDikirim)}</td></tr>
                      <tr><td className="px-3 py-2" colSpan={2}>Total Pengeluaran Riil</td><td className="px-3 py-2 text-right">{rupiah(sourceTotal)}</td></tr>
                    </tfoot>
                  </table>
                </div>
              ) : <p className="text-sm text-amber-700">Komponen biaya belum terbaca dari hasil copy.</p>}
            </section>

            {parsed.geotags.length > 0 && (
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 font-semibold">Presensi / Geotag</h2>
                <div className="space-y-2">
                  {parsed.geotags.map((item, index) => (
                    <div key={`${item.hariTanggal}-${item.waktuTagging}-${index}`} className="grid gap-1 rounded-lg border border-slate-200 p-3 text-sm md:grid-cols-[130px_80px_160px_1fr]">
                      <span className="font-medium">{item.hariTanggal}</span><span>{item.waktuTagging}</span><span>{item.wilayahTagging}</span><span className="text-slate-600">{item.lokasiTagging}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-2">
              {ready ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-600" />}
              <div>
                <p className="text-sm font-semibold">{ready ? 'Data siap disimpan' : 'Lengkapi data terlebih dahulu'}</p>
                <p className="text-xs text-slate-500">Nomor SPD, total pengeluaran, dan akun wajib tersedia. Seluruh komponen biaya disimpan terpisah.</p>
              </div>
            </div>
            <button onClick={() => void save()} disabled={!ready || saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
              <Save className="h-4 w-4" />{saving ? 'Menyimpan...' : 'Simpan ke Master E-Perjadin V4'}
            </button>
          </div>
          {message && <p className="mt-3 rounded-md bg-blue-50 p-3 text-sm text-blue-800">{message}</p>}
        </section>
      </section>
    </main>
  );
}

function InfoCard({ title, icon, lines }: { title: string; icon: React.ReactNode; lines: string[] }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-blue-700">{icon}<h3 className="text-sm font-semibold">{title}</h3></div>
      <div className="mt-3 space-y-1 text-sm text-slate-700">{lines.filter(Boolean).map((line, index) => <p key={`${line}-${index}`} className="break-words">{line}</p>)}</div>
    </article>
  );
}
