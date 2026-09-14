import { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardPaste, Database, MapPin, Save, ShieldAlert, WalletCards } from 'lucide-react';
import '../index.css';
import { budgetAccounts, findBudgetAccount } from '../data/perjadinAccounts';
import { inferDestinationFromGeotags, selectRequiredGeotagPoints } from '../utils/geotagRules';
import { parseEPerjadinV3 } from './parserV3';

const DEFAULT_WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbzyyQCjskwpdrqOCWUNg05QTEP8tIROgCnFaVLx6AMTPA04kJQzLUk2ZDm-w4rebnzp/exec';

function rupiah(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value || 0);
}

function today() {
  return new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
}

export default function AppV3() {
  const [raw, setRaw] = useState('');
  const [endpoint, setEndpoint] = useState(() => localStorage.getItem('eperjadin_webapp_url') || DEFAULT_WEBAPP_URL);
  const [accessCode, setAccessCode] = useState(() => sessionStorage.getItem('eperjadin_v3_pin') || '');
  const [kodeAkun, setKodeAkun] = useState('');
  const [statusPJ, setStatusPJ] = useState<'Belum Lengkap' | 'Lengkap' | 'Disetujui'>('Belum Lengkap');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

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
  const sourceTotal = parsed?.totalNilaiRiil || parsed?.totalPengeluaranRiil || 0;
  const ready = Boolean(parsed?.idKegiatan && parsed?.nomorST && parsed?.peserta && parsed?.nomorSPD && sourceTotal > 0 && account);

  async function save() {
    if (!parsed) {
      setMessage('Data belum terbaca. Paste Detail Pertanggungjawaban ePerjadin terlebih dahulu.');
      return;
    }
    if (!account) {
      setMessage('Akun belum teridentifikasi. Pilih akun yang benar sebelum menyimpan.');
      return;
    }
    if (!parsed.nomorSPD) {
      setMessage('Nomor SPD belum terbaca. Data tidak disimpan.');
      return;
    }
    if (!sourceTotal) {
      setMessage('Total Nilai Riil/Total Pengeluaran Riil belum terbaca. Data tidak disimpan.');
      return;
    }

    const points = geotag?.points || {};
    const detailGeotag = parsed.geotags
      .map((item) => `${item.hariTanggal} ${item.waktuTagging} ${item.wilayahTagging} ${item.lokasiTagging}`.trim())
      .join(' | ');

    const row = {
      tahap: 'Pertanggungjawaban',
      idKegiatan: parsed.idKegiatan,
      namaKegiatan: parsed.namaKegiatan,
      nomorST: parsed.nomorST,
      nomorKegiatan: parsed.nomorKegiatan,
      nka: parsed.nomorSPD,
      tanggalKegiatan: parsed.tanggalKegiatan,
      tujuan: detectedDestination,
      kotaTujuan: detectedDestination,
      output: '',
      jenisPembayaran: parsed.dipaInisiator,
      namaPegawai: parsed.peserta,
      lamaHari: parsed.durasiHari,
      // V3: uang harian sepenuhnya mengikuti hasil parsing ePerjadin.
      uangHarianPerHari: parsed.durasiHari > 0 ? Math.round(sourceTotal / parsed.durasiHari) : sourceTotal,
      totalUangHarian: sourceTotal,
      uangMuka: parsed.uangMuka,
      totalEstimasiBiaya: parsed.totalNilaiSBM || parsed.nilaiSBMAwal || sourceTotal,
      totalPengeluaranRiil: parsed.totalPengeluaranRiil || sourceTotal,
      kurangLebihBayar: Math.max(0, sourceTotal - parsed.uangMuka),
      statusPJ,
      statusPersetujuan: parsed.statusUangHarian,
      statusGeotag: geotag?.status || (parsed.geotags.length ? 'Tidak Lengkap' : 'Tidak Lengkap'),
      start: points.start ? `${points.start.hariTanggal} ${points.start.waktuTagging} ${points.start.wilayahTagging}` : '',
      clockIn: points.clockIn ? `${points.clockIn.hariTanggal} ${points.clockIn.waktuTagging} ${points.clockIn.wilayahTagging}` : '',
      clockOut: points.clockOut ? `${points.clockOut.hariTanggal} ${points.clockOut.waktuTagging} ${points.clockOut.wilayahTagging}` : '',
      end: points.end ? `${points.end.hariTanggal} ${points.end.waktuTagging} ${points.end.wilayahTagging}` : '',
      volume: parsed.jumlahRute,
      nilaiRiil: sourceTotal,
      kodeAkun: account.kode,
      tanggalInput: today(),
      detailGeotag,
      keterangan: [
        `Schema ePerjadin: v3`,
        `NIP: ${parsed.nip || '-'}`,
        `Nomor SPD: ${parsed.nomorSPD}`,
        `PPK: ${parsed.ppk || '-'}`,
        `DIPA Inisiator: ${parsed.dipaInisiator || '-'}`,
        `Nilai SBM Awal: ${rupiah(parsed.nilaiSBMAwal)}`,
        `Total Nilai SBM: ${rupiah(parsed.totalNilaiSBM)}`,
        `Total Nilai Riil: ${rupiah(sourceTotal)}`,
        `Efisiensi: ${parsed.efisiensi || 0}%`,
      ].join('\n'),
      jenisPerjadin: 'Perjadin Nasional',
      sumberData: 'Input parsing ePerjadin v3',
      waktuRekamSumber: new Date().toISOString(),
      sourceRecordKey: `${parsed.idKegiatan}|${parsed.nomorSPD}|pertanggungjawaban`.toLowerCase(),
      nomorSPD: parsed.nomorSPD,
      nip: parsed.nip,
      ppk: parsed.ppk,
      dipaInisiator: parsed.dipaInisiator,
      nilaiSBMAwal: parsed.nilaiSBMAwal,
      totalNilaiSBM: parsed.totalNilaiSBM,
      totalNilaiRiil: sourceTotal,
      efisiensi: parsed.efisiensi,
      schemaVersion: 3,
    };

    setSaving(true);
    setMessage('');
    try {
      localStorage.setItem('eperjadin_webapp_url', endpoint.trim());
      sessionStorage.setItem('eperjadin_v3_pin', accessCode.trim());
      const response = await fetch(endpoint.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'upsertPerjadin', row, accessCode: accessCode.trim() }),
      });
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.message || 'Gagal menyimpan data.');
      setMessage(`Tersimpan. ${parsed.nomorSPD} | ${parsed.peserta} | ${rupiah(sourceTotal)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menyimpan ke database.');
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
              <p className="mt-1 text-sm text-slate-500">Parser v3. Nilai uang harian dan nilai riil mengikuti hasil copy dari ePerjadin.</p>
            </div>
            <div className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">Schema v3</div>
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
              placeholder="Paste seluruh teks Detail Pertanggungjawaban di sini..."
            />
          </section>

          <aside className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Database className="h-5 w-5 text-blue-700" />
                <h2 className="font-semibold">Koneksi Database</h2>
              </div>
              <label className="text-xs font-medium text-slate-600">Apps Script Web App</label>
              <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-xs" />
              <label className="mt-3 block text-xs font-medium text-slate-600">PIN Akses</label>
              <input type="password" inputMode="numeric" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
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
              <select value={statusPJ} onChange={(e) => setStatusPJ(e.target.value as typeof statusPJ)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm">
                <option>Belum Lengkap</option><option>Lengkap</option><option>Disetujui</option>
              </select>
            </section>
          </aside>
        </div>

        {parsed && (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <InfoCard title="Kegiatan" icon={<CheckCircle2 className="h-4 w-4" />} lines={[parsed.namaKegiatan, parsed.nomorST, parsed.nomorKegiatan]} />
            <InfoCard title="SPD" icon={<Database className="h-4 w-4" />} lines={[parsed.peserta, parsed.nip ? `NIP ${parsed.nip}` : '', parsed.nomorSPD]} />
            <InfoCard title="Keuangan" icon={<WalletCards className="h-4 w-4" />} lines={[`Riil ${rupiah(sourceTotal)}`, `SBM ${rupiah(parsed.totalNilaiSBM || parsed.nilaiSBMAwal)}`, `Uang Muka ${rupiah(parsed.uangMuka)}`]} />
            <InfoCard title="Presensi" icon={<MapPin className="h-4 w-4" />} lines={[`${parsed.geotags.length} geotag`, geotag?.status || 'Belum dinilai', detectedDestination]} />
          </section>
        )}

        {parsed && (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Data label="PPK" value={parsed.ppk} />
              <Data label="DIPA Inisiator" value={parsed.dipaInisiator} />
              <Data label="Tanggal" value={parsed.tanggalKegiatan} />
              <Data label="Durasi" value={`${parsed.durasiHari} hari`} />
              <Data label="Nilai SBM Awal" value={rupiah(parsed.nilaiSBMAwal)} />
              <Data label="Total Nilai SBM" value={rupiah(parsed.totalNilaiSBM)} />
              <Data label="Total Nilai Riil" value={rupiah(sourceTotal)} />
              <Data label="Efisiensi" value={`${parsed.efisiensi || 0}%`} />
            </div>

            <div className="mt-5 overflow-x-auto rounded-lg border">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Tanggal</th><th className="px-3 py-2">Waktu</th><th className="px-3 py-2">Wilayah</th><th className="px-3 py-2">Lokasi</th></tr></thead>
                <tbody>{parsed.geotags.map((item, index) => <tr key={`${item.hariTanggal}-${item.waktuTagging}-${index}`} className="border-t"><td className="px-3 py-2">{item.hariTanggal}</td><td className="px-3 py-2">{item.waktuTagging}</td><td className="px-3 py-2">{item.wilayahTagging}</td><td className="px-3 py-2 text-slate-600">{item.lokasiTagging}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-2">
              {ready ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-600" />}
              <div><p className="font-medium">{ready ? 'Data siap disimpan' : 'Periksa data sebelum menyimpan'}</p><p className="text-sm text-slate-500">Nomor SPD dan akun wajib tersedia. Nilai transaksi tidak dihitung dari referensi SBM lokal.</p></div>
            </div>
            <button disabled={!ready || saving} onClick={save} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"><Save className="h-4 w-4" />{saving ? 'Menyimpan...' : 'Simpan ke Master E-Perjadin'}</button>
          </div>
          {message && <p className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
        </section>
      </section>
    </main>
  );
}

function InfoCard({ title, icon, lines }: { title: string; icon: React.ReactNode; lines: string[] }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-sm font-semibold text-slate-700">{icon}{title}</div><div className="mt-3 space-y-1">{lines.filter(Boolean).map((line) => <p key={line} className="truncate text-sm text-slate-600">{line}</p>)}</div></div>;
}

function Data({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-medium text-slate-800">{value || '-'}</p></div>;
}
