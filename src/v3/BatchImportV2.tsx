import { useMemo, useState } from 'react';
import { budgetAccounts, findBudgetAccount } from '../data/perjadinAccounts';
import { inferDestinationFromGeotags, selectRequiredGeotagPoints } from '../utils/geotagRules';
import { parseEPerjadinV3 } from './parserV3';
import { readApiResponse } from './apiClient';

type PilotEntry = { rawText: string; sourceKey?: string; idKegiatan?: string; nomorSPD?: string; sourceUrl?: string; warnings?: string[] };
type PilotFile = { schemaVersion: number; source: string; collector: string; records: PilotEntry[] };
type Feedback = Record<string, string>;
const formatMoney = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value || 0);
const accepted = /^(Dikirim|Disetujui|Dibayar|Selesai)$/i;

function today() {
  return new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
}

export default function BatchImportV2({ endpoint, authIdToken = '', onClose }: { endpoint: string; authIdToken?: string; onClose: () => void }) {
  const [entries, setEntries] = useState<PilotEntry[]>([]);
  const [accounts, setAccounts] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Feedback>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [result, setResult] = useState('');

  const records = useMemo(() => entries.map((entry, i) => {
    const parsed = parseEPerjadinV3(entry.rawText);
    const key = parsed?.idKegiatan && parsed?.nomorSPD ? (parsed.idKegiatan + '|' + parsed.nomorSPD).toLowerCase() : 'invalid-' + i;
    const sent = parsed?.components.filter((c) => accepted.test(c.status)).reduce((sum, c) => sum + c.nilaiRiil, 0) || 0;
    const official = parsed?.totalPengeluaranRiil || 0;
    const akun = findBudgetAccount(parsed?.kodeAkun || accounts[key] || '');
    const issues = [];
    if (!parsed?.idKegiatan || !parsed?.nomorSPD || !parsed?.peserta) issues.push('Identitas SPD belum terbaca');
    if (!parsed?.components.length) issues.push('Rincian komponen belum terbaca');
    if (!official || Math.abs(sent - official) >= 1) issues.push('Nilai komponen belum cocok');
    if (!akun) issues.push('Pilih akun anggaran');
    if (entry.warnings?.length) issues.push(...entry.warnings);
    return { key, parsed, sent, official, akun, issues, sourceUrl: entry.sourceUrl };
  }), [entries, accounts]);

  const uniqueRecords = useMemo(() => {
    const seen = new Set<string>();
    return records.filter((r) => {
      if (seen.has(r.key)) return false;
      seen.add(r.key);
      return true;
    });
  }, [records]);

  async function loadFile(file?: File) {
    setEntries([]); setFeedback({}); setError(''); setResult(''); setReviewed(false); setAccounts({});
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) return setError('Berkas maksimal 4 MB. Ambil per batch 5–20 SPD.');
    try {
      const data = JSON.parse(await file.text()) as PilotFile;
      if (data.source !== 'satu-kemenkeu' || data.schemaVersion !== 2 || data.collector !== 'pilot-v2' || !Array.isArray(data.records)) {
        throw new Error('Gunakan file JSON dari Kolektor ePerjadin V2.');
      }
      if (!data.records.length) throw new Error('JSON tidak berisi detail SPD.');
      if (data.records.length > 20) throw new Error('Berkas memuat lebih dari 20 SPD. Ekspor batch pilot maksimal 20 SPD.');
      if (data.records.some((r) => typeof r.rawText !== 'string' || r.rawText.length > 120000)) {
        throw new Error('Format detail tidak valid atau terlalu besar.');
      }
      setEntries(data.records);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function saveBatch() {
    if (!reviewed || saving || !endpoint.trim()) return;
    if (!authIdToken) return setError('Untuk menyimpan batch, aktifkan backend V5 dan login Google terlebih dahulu. Pratinjau JSON tetap bisa digunakan.');
    setSaving(true); setResult('Membaca daftar SPD yang sudah ada di Master...'); setError('');
    const nextFeedback: Feedback = {};
    try {
      const url = endpoint.trim();
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type':'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'getDashboardV4', authIdToken }) });
      const dashboard = await readApiResponse(response);
      if (!dashboard.success || !Array.isArray(dashboard.data) || Number(dashboard.version) !== 5) throw new Error('Batch hanya boleh disimpan melalui backend V5 terautentikasi. Tidak ada data yang dikirim.');
      const existing = new Set(dashboard.data.map((item) => {
        const row = item as Record<string, unknown>;
        return String(row['Kunci SPD'] || '').toLowerCase().trim();
      }));
      let success = 0, skipped = 0, failed = 0;
      for (const item of uniqueRecords) {
        const p = item.parsed;
        if (!p || item.issues.length || !item.akun) {
          nextFeedback[item.key] = 'Dilewati: data perlu diperiksa';
          skipped++; continue;
        }
        if (existing.has(item.key)) {
          nextFeedback[item.key] = 'Dilewati: SPD sudah ada di Master (tidak ditimpa)';
          skipped++; continue;
        }
        const dest = p.tujuan || inferDestinationFromGeotags(p.geotags, p.tanggalKegiatan);
        const geo = selectRequiredGeotagPoints(p.geotags, p.tanggalKegiatan, dest);
        const pts = geo?.points || {};
        const location = (point: {hariTanggal:string;waktuTagging:string;wilayahTagging:string} | undefined) =>
          point ? [point.hariTanggal,point.waktuTagging,point.wilayahTagging].join(' ') : '';
        const row = {
          kunciSPD: item.key, idKegiatan: p.idKegiatan, namaKegiatan: p.namaKegiatan,
          nomorST: p.nomorST, lampiranST: p.lampiranST, nomorKegiatan: p.nomorKegiatan,
          dipaInisiator: p.dipaInisiator, ppk: p.ppk, peserta: p.peserta, nip: p.nip,
          nomorSPD: p.nomorSPD, nomorPerjalanan: p.nomorPerjalanan, jumlahRute: p.jumlahRute,
          tujuan: dest, tanggalMulai: p.tanggalMulai, tanggalSelesai: p.tanggalSelesai,
          tanggalKegiatan: p.tanggalKegiatan, durasiHari: p.durasiHari, menginap: p.menginap,
          uangMuka: p.uangMuka, totalPengeluaranRiil: item.official,
          kodeAkun: item.akun.kode, namaAkun: item.akun.nama,
          statusPJ: 'Belum Lengkap', statusGeotag: geo?.status || 'Belum Dinilai',
          start: location(pts.start), clockIn: location(pts.clockIn),
          clockOut: location(pts.clockOut), end: location(pts.end),
          detailGeotag: p.geotags.map((g) => [g.hariTanggal,g.waktuTagging,g.wilayahTagging,g.lokasiTagging].join(' ')).join(' | '),
          tanggalInput: today(), sumberData: 'Pilot Kolektor V2', waktuRekamSumber: new Date().toISOString(),
          schemaVersion: 4, routes: p.routes, components: p.components, geotags: p.geotags,
          tahap: 'Pertanggungjawaban', nka: p.nomorSPD, namaPegawai: p.peserta,
          lamaHari: p.durasiHari, nilaiRiil: item.official,
        };
        try {
          const res = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action:'upsertPerjadinV4', row, authIdToken })
          });
          const payload = await readApiResponse(res);
          if (!payload.success) throw new Error(String(payload.message || 'Simpan ditolak'));
          existing.add(item.key); success++;
          nextFeedback[item.key] = 'Tersimpan';
        } catch (e) {
          failed++;
          nextFeedback[item.key] = 'Gagal: ' + (e instanceof Error ? e.message : String(e));
        }
        setFeedback({ ...nextFeedback });
        setResult('Tersimpan '+success+' | Dilewati '+skipped+' | Gagal '+failed);
      }
      setFeedback({ ...nextFeedback });
      setResult('Selesai: '+success+' data baru | '+skipped+' dilewati | '+failed+' gagal. Tidak ada SPD lama ditimpa.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }
  const importable = uniqueRecords.filter((r) => !r.issues.length).length;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-lg font-semibold">Impor Batch Kolektor V2</h2>
          <p className="mt-1 text-sm text-slate-500">Pilot 5–20 SPD. Tinjau nilai dan akun sebelum menyimpan. SPD yang sudah ada tidak ditimpa.</p></div>
        <button type="button" onClick={onClose} className="rounded-md border px-3 py-2 text-sm">Tutup impor</button>
      </div>
      <label className="mt-5 block text-sm font-semibold">Pilih JSON dari ekstensi Chrome V2
        <input type="file" accept=".json,application/json" onChange={(e) => void loadFile(e.target.files?.[0])} className="mt-2 block w-full rounded-md border p-2 font-normal" />
      </label>
      {!!entries.length && <>
        <p className="mt-4 text-sm font-semibold">{uniqueRecords.length} SPD unik, {importable} siap disimpan, {uniqueRecords.length-importable} perlu diperiksa</p>
        <div className="mt-3 max-h-[480px] space-y-3 overflow-y-auto">
          {uniqueRecords.map((item) => <article key={item.key} className="rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><strong>{item.parsed?.nomorSPD || 'Nomor SPD tidak terbaca'}</strong><span className="ml-2 text-slate-500">{item.parsed?.peserta || ''}</span></div>
              <span className={item.issues.length ? 'text-amber-700' : 'text-emerald-700'}>{item.issues.length ? 'Perlu tinjau' : 'Siap'}</span>
            </div>
            <p className="mt-1 text-slate-600">{item.parsed?.namaKegiatan || 'Kegiatan belum terbaca'}</p>
            <p className="mt-1">Total resmi: {formatMoney(item.official)}. Komponen dihitung: {formatMoney(item.sent)}. {item.parsed?.components.length || 0} jenis biaya.</p>
            <label className="mt-2 block text-xs font-medium">Akun anggaran
              <select className="mt-1 w-full rounded-md border p-2 font-normal" value={item.parsed?.kodeAkun || accounts[item.key] || ''} onChange={(e) => {setAccounts((s)=>({...s,[item.key]:e.target.value}));setReviewed(false);}}>
                <option value="">Pilih akun sesuai penugasan</option>
                {budgetAccounts.map((a) => <option key={a.kode} value={a.kode}>{a.nama}</option>)}
              </select>
            </label>
            {!!item.issues.length && <p className="mt-2 text-xs text-amber-700">{item.issues.join(' · ')}</p>}
            {feedback[item.key] && <p className="mt-2 text-xs font-semibold text-blue-700">{feedback[item.key]}</p>}
          </article>)}
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} className="mt-1" />
          Saya sudah memeriksa kebenaran akun dan nilai. Hanya SPD baru yang boleh disimpan.
        </label>
        <button type="button" onClick={() => void saveBatch()} disabled={!reviewed || saving || !importable || !authIdToken} className="mt-3 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
          {saving ? 'Menyimpan data baru...' : 'Simpan SPD baru ke Master'}
        </button>
      </>}
      {result && <p className="mt-3 rounded-md bg-blue-50 p-3 text-sm text-blue-700">{result}</p>}
      {error && <p className="mt-3 rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <p className="mt-4 text-xs text-slate-500">Ekstensi tidak mengubah transaksi Satu Kemenkeu. Impor dapat diperiksa tanpa login. Penyimpanan batch hanya aktif pada backend V5 dengan identitas Google terverifikasi.</p>
    </section>
  );
}
