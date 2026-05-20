import { useMemo, useState } from 'react';
import { parseDetailPertanggungjawaban, detectGeotagPoints } from './utils/parser';
import { getUangHarian, parseTanggalRange } from './data/sbmData';

type Account = { kode: string; nama: string; pagu: number; realisasi: number; blokir?: number };
type Row = {
  idKegiatan: string;
  namaKegiatan: string;
  nomorST: string;
  nka: string;
  tanggalKegiatan: string;
  tujuan: string;
  namaPegawai: string;
  lamaHari: number;
  uangHarianPerHari: number;
  totalUangHarian: number;
  uangMuka: number;
  totalPengeluaranRiil: number;
  kurangLebihBayar: number;
  statusPJ: 'Belum Lengkap' | 'Lengkap' | 'Disetujui';
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

const initialAccounts: Account[] = [
  { kode: '636722.015.524111.01505CC.4787AEF.A000000001.00000.2.3051.2.000000.000000', nama: '524111 Perjadin AEF', pagu: 25000000, realisasi: 4200000 },
  { kode: '636722.015.524111.01505CC.4787BAE.A000000001.00000.2.3051.2.000000.000000', nama: '524111 Perjadin BAE', pagu: 35000000, realisasi: 8100000 },
  { kode: '636722.015.524111.01505CC.4787BIG.A000000001.00000.2.3051.2.000000.000000', nama: '524111 Perjadin BIG', pagu: 30000000, realisasi: 6100000 },
  { kode: '636722.015.524111.01505CC.4789BIG.A000000001.00000.2.3051.2.000000.000000', nama: '524111 Perjadin 4789 BIG', pagu: 20000000, realisasi: 2500000 },
  { kode: '636722.015.524111.01505WA.4695EBA.A000000001.00000.2.3051.2.000000.000000', nama: '524111 Perjadin EBA', pagu: 40000000, realisasi: 12000000 },
  { kode: '636722.015.524111.01505WA.4698EBD.A000000001.00000.2.3051.2.000000.000000', nama: '524111 Perjadin EBD', pagu: 25000000, realisasi: 3200000 },
];

const rupiah = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);
const today = () => new Date().toLocaleDateString('id-ID');

function formatPoint(p?: { hariTanggal: string; waktuTagging: string; wilayahTagging: string }) {
  if (!p) return '';
  return `${p.hariTanggal} ${p.waktuTagging} ${p.wilayahTagging}`;
}

function App() {
  const [raw, setRaw] = useState('');
  const [tujuan, setTujuan] = useState('');
  const [kodeAkun, setKodeAkun] = useState(initialAccounts[0].kode);
  const [statusPJ, setStatusPJ] = useState<Row['statusPJ']>('Belum Lengkap');
  const [endpoint, setEndpoint] = useState('');
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState('');

  const summary = useMemo(() => {
    const pagu = accounts.reduce((a, b) => a + b.pagu, 0);
    const realisasi = accounts.reduce((a, b) => a + b.realisasi, 0);
    const komitmen = rows.filter(r => r.statusPJ !== 'Disetujui').reduce((a, b) => a + b.nilaiRiil, 0);
    return { pagu, realisasi, komitmen, saldo: pagu - realisasi - komitmen };
  }, [accounts, rows]);

  function buildRow(): Row | null {
    const parsed = parseDetailPertanggungjawaban(raw);
    if (!parsed) return null;

    const detectedTujuan = tujuan || parsed.geotags.at(-2)?.wilayahTagging || parsed.geotags.at(-1)?.wilayahTagging || '';
    const range = parseTanggalRange(parsed.tanggalKegiatan);
    const uang = getUangHarian(detectedTujuan);
    const points = detectGeotagPoints(parsed.geotags);
    const detailGeotag = parsed.geotags.map(g => `${g.hariTanggal} ${g.waktuTagging} ${g.wilayahTagging}`).join(' | ');
    const totalUangHarian = uang.uangHarian * range.lamaHari;
    const nilaiRiil = parsed.totalPengeluaranRiil || totalUangHarian;
    const statusGeotag = parsed.geotags.length >= 4 ? 'Lengkap' : parsed.geotags.length > 0 ? 'Sebagian' : 'Belum Ada';

    return {
      idKegiatan: parsed.idKegiatan,
      namaKegiatan: parsed.namaKegiatan,
      nomorST: parsed.nomorST,
      nka: parsed.nomorKegiatan,
      tanggalKegiatan: parsed.tanggalKegiatan,
      tujuan: detectedTujuan,
      namaPegawai: parsed.peserta,
      lamaHari: range.lamaHari,
      uangHarianPerHari: uang.uangHarian,
      totalUangHarian,
      uangMuka: parsed.uangMuka,
      totalPengeluaranRiil: parsed.totalPengeluaranRiil,
      kurangLebihBayar: parsed.totalPengeluaranRiil - parsed.uangMuka,
      statusPJ,
      statusGeotag,
      start: formatPoint(points.start),
      clockIn: formatPoint(points.clockIn),
      clockOut: formatPoint(points.clockOut),
      end: formatPoint(points.end),
      volume: parsed.jumlahRute || 1,
      nilaiRiil,
      kodeAkun,
      tanggalInput: today(),
      detailGeotag,
    };
  }

  async function save() {
    const row = buildRow();
    if (!row) {
      setMessage('Data tidak terbaca. Paste ulang detail pertanggungjawaban.');
      return;
    }

    const key = `${row.idKegiatan}|${row.nomorST}|${row.namaPegawai}`;
    setRows(prev => {
      const index = prev.findIndex(r => `${r.idKegiatan}|${r.nomorST}|${r.namaPegawai}` === key);
      if (index >= 0) {
        const copy = [...prev];
        copy[index] = row;
        return copy;
      }
      return [row, ...prev];
    });

    setAccounts(prev => prev.map(a => a.kode === row.kodeAkun ? { ...a, realisasi: a.realisasi + (row.statusPJ === 'Disetujui' ? row.nilaiRiil : 0) } : a));

    if (endpoint.trim()) {
      try {
        const res = await fetch(endpoint.trim(), { method: 'POST', body: JSON.stringify({ action: 'upsertPerjadin', row }), headers: { 'Content-Type': 'text/plain' } });
        const text = await res.text();
        setMessage(`Tersimpan lokal dan terkirim ke Google Sheets: ${text}`);
      } catch (e) {
        setMessage('Tersimpan lokal, tetapi gagal kirim ke Google Sheets. Cek URL Web App dan akses deploy.');
      }
    } else {
      setMessage('Tersimpan di aplikasi. Isi URL Web App jika ingin langsung masuk Google Sheets.');
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <section className="bg-slate-950 text-white px-6 py-5">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold">Monitoring Pelaksanaan dan Pertanggungjawaban Perjadin</h1>
          <p className="text-slate-300 text-sm">Gabungan parser perjadin, monitoring realisasi, dan saldo akun perjalanan dinas.</p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="grid md:grid-cols-4 gap-4">
          <Metric title="Pagu" value={rupiah(summary.pagu)} />
          <Metric title="Realisasi" value={rupiah(summary.realisasi)} />
          <Metric title="Komitmen berjalan" value={rupiah(summary.komitmen)} />
          <Metric title="Saldo realtime" value={rupiah(summary.saldo)} strong />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl shadow p-5 space-y-4">
            <h2 className="font-semibold text-lg">Input Parsing Pertanggungjawaban</h2>
            <textarea className="w-full h-72 border rounded-xl p-3 font-mono text-xs" value={raw} onChange={e => setRaw(e.target.value)} placeholder="Paste detail pertanggungjawaban dari aplikasi di sini" />
            <div className="grid md:grid-cols-3 gap-3">
              <input className="border rounded-lg px-3 py-2" value={tujuan} onChange={e => setTujuan(e.target.value)} placeholder="Tujuan. Kosongkan untuk auto detect" />
              <select className="border rounded-lg px-3 py-2" value={statusPJ} onChange={e => setStatusPJ(e.target.value as Row['statusPJ'])}>
                <option>Belum Lengkap</option><option>Lengkap</option><option>Disetujui</option>
              </select>
              <select className="border rounded-lg px-3 py-2" value={kodeAkun} onChange={e => setKodeAkun(e.target.value)}>
                {accounts.map(a => <option key={a.kode} value={a.kode}>{a.nama}</option>)}
              </select>
            </div>
            <input className="w-full border rounded-lg px-3 py-2 text-xs" value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="URL Apps Script Web App. Opsional" />
            <button onClick={save} className="bg-blue-700 text-white px-5 py-2 rounded-xl font-medium">Parse, Hitung, dan Simpan</button>
            {message && <p className="text-sm bg-blue-50 border border-blue-200 rounded-lg p-3">{message}</p>}
          </div>

          <div className="bg-white rounded-2xl shadow p-5">
            <h2 className="font-semibold text-lg mb-3">Saldo per Akun</h2>
            <div className="space-y-3">
              {accounts.map(a => {
                const komitmen = rows.filter(r => r.kodeAkun === a.kode && r.statusPJ !== 'Disetujui').reduce((x, y) => x + y.nilaiRiil, 0);
                const saldo = a.pagu - a.realisasi - komitmen;
                const pct = Math.min(100, Math.round(((a.realisasi + komitmen) / a.pagu) * 100));
                return <div key={a.kode} className="border rounded-xl p-3">
                  <div className="flex justify-between gap-3"><span className="font-medium text-sm">{a.nama}</span><span className="text-sm font-semibold">{rupiah(saldo)}</span></div>
                  <div className="h-2 bg-slate-200 rounded mt-2"><div className="h-2 bg-blue-600 rounded" style={{ width: `${pct}%` }} /></div>
                  <p className="text-xs text-slate-500 mt-1">Pagu {rupiah(a.pagu)}. Realisasi {rupiah(a.realisasi)}. Komitmen {rupiah(komitmen)}.</p>
                </div>;
              })}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-5 overflow-x-auto">
          <h2 className="font-semibold text-lg mb-3">Data Terpusat Monitoring Perjadin</h2>
          <table className="w-full text-xs border-collapse">
            <thead className="bg-slate-900 text-white"><tr>{['ID','Nama Kegiatan','Nomor ST','NKA','Tanggal','Pegawai','Tujuan','Status PJ','Geotag','Nilai Riil','Akun'].map(h => <th key={h} className="p-2 text-left whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>{rows.length === 0 ? <tr><td colSpan={11} className="p-6 text-center text-slate-500">Belum ada data.</td></tr> : rows.map(r => <tr key={`${r.idKegiatan}${r.nomorST}${r.namaPegawai}`} className="border-b hover:bg-slate-50"><td className="p-2 font-mono">{r.idKegiatan}</td><td className="p-2 min-w-80">{r.namaKegiatan}</td><td className="p-2">{r.nomorST}</td><td className="p-2">{r.nka}</td><td className="p-2">{r.tanggalKegiatan}</td><td className="p-2">{r.namaPegawai}</td><td className="p-2">{r.tujuan}</td><td className="p-2">{r.statusPJ}</td><td className="p-2">{r.statusGeotag}</td><td className="p-2 text-right">{rupiah(r.nilaiRiil)}</td><td className="p-2">{accounts.find(a => a.kode === r.kodeAkun)?.nama}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Metric({ title, value, strong }: { title: string; value: string; strong?: boolean }) {
  return <div className={`rounded-2xl p-5 shadow ${strong ? 'bg-blue-700 text-white' : 'bg-white'}`}><p className="text-sm opacity-75">{title}</p><p className="text-xl font-bold mt-1">{value}</p></div>;
}

export default App;
