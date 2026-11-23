import { useMemo, useState } from 'react';
import { budgetAccounts, findBudgetAccount } from '../data/perjadinAccounts';
import { inferDestinationFromGeotags, selectRequiredGeotagPoints } from '../utils/geotagRules';
import { parseEPerjadinV3 } from './parserV3';
import { readApiResponse } from './apiClient';
import { parseMasterCsv } from './masterCsv';

type PilotEntry = { rawText: string; sourceKey?: string; idKegiatan?: string; nomorSPD?: string; sourceUrl?: string; sourceHash?: string; changeType?: string; presenceRows?: number; presensiStatus?: string; warnings?: string[] };
type Comparison = { state: 'baru' | 'sama' | 'berubah' | 'perlu-review'; oldHash: string; note: string };
type PilotIndex = { sourceKey: string; idKegiatan?: string; nomorST?: string; nomorSPD?: string; jenisIndeks?: string; statusSumber?: string; rawText?: string };
type PilotFile = { schemaVersion: number; source: string; collector: string; records: PilotEntry[]; index?: PilotIndex[] };
type Feedback = Record<string, string>;
const formatMoney = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value || 0);
const accepted = /^(Dikirim|Disetujui(?: PPK)?|Dibayar|Selesai)$/i;

function today() {
  return new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
}

export default function BatchImportV2({ endpoint, authIdToken = '', onClose }: { endpoint: string; authIdToken?: string; onClose: () => void }) {
  const [entries, setEntries] = useState<PilotEntry[]>([]);
  const [indexEntries, setIndexEntries] = useState<PilotIndex[]>([]);
  const [accounts, setAccounts] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Feedback>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [result, setResult] = useState('');
  const [comparison, setComparison] = useState<Record<string, Comparison>>({});
  const [comparisonReady, setComparisonReady] = useState(false);
  const [selectedUpdates, setSelectedUpdates] = useState<Record<string, boolean>>({});
  const [checking, setChecking] = useState(false);
  const [localMaster, setLocalMaster] = useState<Record<string, unknown>[]>([]);
  const [localMasterName, setLocalMasterName] = useState('');
  const [comparisonMode, setComparisonMode] = useState<'live' | 'file' | ''>('');

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
    const presensiNotes = (entry.warnings || []).filter((w) => /presensi|tagging|geotag/i.test(w));
    const otherWarnings = (entry.warnings || []).filter((w) => !/presensi|tagging|geotag/i.test(w));
    issues.push(...otherWarnings);
    const presensiNote = entry.presensiStatus === 'TIDAK_ADA_DATA'
      ? 'Sumber belum menampilkan titik presensi.'
      : entry.presensiStatus === 'GAGAL_BACA' || presensiNotes.length
        ? 'Presensi perlu diperiksa atau diambil ulang.' : '';
    return { key, parsed, sent, official, akun, issues, presensiNote, sourceUrl: entry.sourceUrl };
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
    setEntries([]); setIndexEntries([]); setFeedback({}); setError(''); setResult(''); setReviewed(false); setAccounts({}); setComparison({}); setComparisonReady(false); setSelectedUpdates({}); setComparisonMode('');
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) return setError('Berkas maksimal 25 MB. Simpan hasil kolektor dalam beberapa file jika lebih besar.');
    try {
      const data = JSON.parse(await file.text()) as PilotFile;
      if (data.source !== 'satu-kemenkeu' || data.schemaVersion !== 2 || data.collector !== 'pilot-v2' || !Array.isArray(data.records)) {
        throw new Error('Gunakan file JSON dari Kolektor ePerjadin V2.');
      }
      if (!data.records.length && !data.index?.length) throw new Error('JSON tidak berisi detail atau indeks SPD.');
      if (data.records.length > 1000) throw new Error('Berkas berisi lebih dari 1.000 SPD, pecah menjadi beberapa batch.');
      if (data.records.some((r) => typeof r.rawText !== 'string' || r.rawText.length > 120000)) {
        throw new Error('Format detail tidak valid atau terlalu besar.');
      }
      setEntries(data.records);
      setIndexEntries((data.index || []).slice(0, 5000));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }


  async function loadLocalMaster(file?: File) {
    setLocalMaster([]); setLocalMasterName(''); setComparison({}); setComparisonReady(false); setReviewed(false);
    setComparisonMode(''); setError('');
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return setError('CSV Master maksimal 8 MB.');
    try {
      if (!/\.csv$/i.test(file.name)) throw new Error('Ekspor tab EPERJADIN_V4 ke format .csv terlebih dahulu.');
      const rows = parseMasterCsv(await file.text());
      setLocalMaster(rows); setLocalMasterName(file.name);
      setResult(rows.length + ' baris Master tersedia untuk perbandingan lokal. Tidak ada data yang diunggah.');
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }
  function parseMoney(value: unknown): number {
    if (typeof value === 'number') return value;
    const str = String(value ?? '').replace(/[^\d.,-]/g,'');
    if (!str) return 0;
    const decimal = Math.max(str.lastIndexOf('.'), str.lastIndexOf(','));
    if (decimal >= 0 && str.length - decimal - 1 === 2) {
      return Number(str.slice(0,decimal).replace(/[.,]/g,'')+'.'+str.slice(decimal+1)) || 0;
    }
    return Number(str.replace(/[.,]/g,'')) || 0;
  }
  async function masterSnapshot() {
    if (!authIdToken) throw new Error('Perbandingan memerlukan backend V5 dan login Google.');
    const response = await fetch(endpoint.trim(), {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action:'getDashboardV4', authIdToken })
    });
    const payload = await readApiResponse(response);
    if (!payload.success || Number(payload.version) !== 5 ||
        !Array.isArray(payload.data) || !Array.isArray(payload.components)) {
      throw new Error('Backend V5 terautentikasi belum tersedia. Tidak ada data yang dikirim.');
    }
    return payload;
  }
  async function compareMaster() {
    setChecking(true); setError(''); setComparisonReady(false); setComparison({}); setSelectedUpdates({});
    try {
      const live = Boolean(authIdToken);
      if (!live && !localMaster.length) throw new Error('Pilih file CSV Master terlebih dahulu atau masuk ke backend V5.');
      const payload = live ? await masterSnapshot() : null;
      const sourceRows = live ? payload!.data as Record<string, unknown>[] : localMaster;
      const master = new Map<string, Record<string, unknown>>(
        sourceRows.map((r) => [String(r['Kunci SPD'] || '').toLowerCase().trim(), r])
      );
      const counts = new Map<string, number>();
      if (live) (payload!.components as Record<string, unknown>[]).forEach((r) => {
        const key = String(r['Kunci SPD'] || '').toLowerCase().trim();
        counts.set(key, (counts.get(key) || 0) + 1);
      });
      const savedAccounts: Record<string,string> = {}, found: Record<string,Comparison> = {};
      uniqueRecords.forEach((item) => {
        const old = master.get(item.key);
        if (!old) { found[item.key] = { state:'baru', oldHash:'', note:'SPD belum tersimpan' }; return; }
        const account = String(old['Kode Akun'] || '');
        if (findBudgetAccount(account)) savedAccounts[item.key] = account;
        const oldHash = String(old['Raw Hash'] || '').trim();
        const entry = entries.find((e) => (e.idKegiatan + '|' + e.nomorSPD).toLowerCase() === item.key);
        if (oldHash && entry?.sourceHash) {
          found[item.key] = { state: oldHash === entry.sourceHash ? 'sama' : 'berubah',
            oldHash, note: oldHash === entry.sourceHash ? 'Hash tidak berubah' : 'Hash sumber berubah' };
        } else if (Math.abs(parseMoney(old['Total Pengeluaran Riil']) - item.official) >= 1) {
          found[item.key] = { state:'berubah', oldHash, note:'Nilai total berbeda. Periksa sebelum memperbarui.' };
        } else if (live && (counts.get(item.key) || 0) !== (item.parsed?.components.length || 0)) {
          found[item.key] = { state:'berubah', oldHash, note:'Jumlah komponen berbeda. Periksa rincian.' };
        } else {
          found[item.key] = { state:'perlu-review', oldHash, note:'Nilai sama, tetapi rincian belum dapat dipastikan karena tidak ada hash pembanding.' };
        }
      });
      setComparison(found); setAccounts((current) => ({ ...savedAccounts, ...current }));
      setReviewed(false); setComparisonReady(true); setComparisonMode(live ? 'live' : 'file');
      const sizes = { baru:0, berubah:0, sama:0, 'perlu-review':0 };
      Object.values(found).forEach((c) => sizes[c.state]++);
      setResult('Hasil: '+sizes.baru+' baru, '+sizes.berubah+' berubah, '+sizes.sama+
        ' sama, '+sizes['perlu-review']+' belum pasti.');
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally { setChecking(false); }
  }

  async function saveBatch() {
    if (!reviewed || saving || !endpoint.trim() || !comparisonReady || comparisonMode !== 'live') return;
    if (!authIdToken) return setError('Penyimpanan membutuhkan backend V5 dengan login Google. Perbandingan file lokal hanya untuk pemeriksaan.');
    setSaving(true); setResult('Membaca daftar SPD yang sudah ada di Master...'); setError('');
    const nextFeedback: Feedback = {};
    try {
      const url = endpoint.trim();
      const dashboard = await masterSnapshot();
      const master = new Map<string, Record<string, unknown>>(
        (dashboard.data as Record<string, unknown>[]).map((r) => [
          String(r['Kunci SPD'] || '').toLowerCase().trim(), r
        ])
      );
      let success = 0, skipped = 0, failed = 0;
      for (const item of uniqueRecords) {
        const p = item.parsed;
        const state = comparison[item.key];
        if (!p || item.issues.length || !item.akun || !state) {
          nextFeedback[item.key] = 'Dilewati: data tidak lengkap'; skipped++; continue;
        }
        const current = master.get(item.key);
        if (state.state === 'sama' || state.state === 'perlu-review') {
          nextFeedback[item.key] = 'Dilewati: tidak ada perubahan terkonfirmasi'; skipped++; continue;
        }
        if (state.state === 'baru' && current) {
          nextFeedback[item.key] = 'Dilewati: SPD sudah ditambahkan pihak lain'; skipped++; continue;
        }
        if (state.state === 'berubah') {
          if (!selectedUpdates[item.key] || !current || !state.oldHash ||
              String(current['Raw Hash'] || '').trim() !== state.oldHash) {
            nextFeedback[item.key] = 'Dilewati: pembaruan tidak disetujui atau snapshot berubah';
            skipped++; continue;
          }
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
          statusPJ: current ? String(current['Status Pertanggungjawaban'] || '') : 'Belum Lengkap', statusGeotag: geo?.status || 'Belum Dinilai',
          start: location(pts.start), clockIn: location(pts.clockIn),
          clockOut: location(pts.clockOut), end: location(pts.end),
          detailGeotag: p.geotags.map((g) => [g.hariTanggal,g.waktuTagging,g.wilayahTagging,g.lokasiTagging].join(' ')).join(' | '),
          tanggalInput: today(), sumberData: 'Pilot Kolektor V2', waktuRekamSumber: new Date().toISOString(),
          rawHash: entries.find((e) => e.idKegiatan === p.idKegiatan && e.nomorSPD === p.nomorSPD)?.sourceHash || '',
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
          success++;
          nextFeedback[item.key] = current ? 'SPD diperbarui' : 'SPD baru tersimpan';
        } catch (e) {
          failed++;
          nextFeedback[item.key] = 'Gagal: ' + (e instanceof Error ? e.message : String(e));
        }
        setFeedback({ ...nextFeedback });
        setResult('Tersimpan '+success+' | Dilewati '+skipped+' | Gagal '+failed);
      }
      setFeedback({ ...nextFeedback });
      setResult('Selesai: '+success+' tersimpan atau diperbarui | '+skipped+' dilewati | '+failed+' gagal.');
      setComparisonReady(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }
  const importable = uniqueRecords.filter((r) => !r.issues.length).length;
  const activityEntries = indexEntries.filter((e) => (e.jenisIndeks || 'kegiatan') === 'kegiatan');
  const participantEntries = indexEntries.filter((e) => e.jenisIndeks === 'pelaksana-spd');
  const statusOf = (e: PilotIndex) => e.statusSumber || e.rawText?.match(/Laporan Tersedia|Belum ada laporan/i)?.[0] || 'Status belum tersedia';
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-lg font-semibold">Impor Batch Kolektor V2</h2>
          <p className="mt-1 text-sm text-slate-500">Koleksi 5–20 SPD per proses, lalu impor file gabungan. Tinjau komponen, akun dan perubahan sebelum menyimpan.</p></div>
        <button type="button" onClick={onClose} className="rounded-md border px-3 py-2 text-sm">Tutup impor</button>
      </div>
      <label className="mt-5 block text-sm font-semibold">Pilih JSON dari ekstensi Chrome V2
        <input type="file" accept=".json,application/json" onChange={(e) => void loadFile(e.target.files?.[0])} className="mt-2 block w-full rounded-md border p-2 font-normal" />
      </label>
      {!!indexEntries.length && <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <p className="font-semibold">Indeks: {activityEntries.length} kegiatan dan {participantEntries.length} pelaksana SPD.</p>
        <p className="mt-1 text-xs text-slate-600">Status laporan dari daftar kegiatan: {activityEntries.filter((e) => /laporan tersedia/i.test(statusOf(e))).length} tersedia, {activityEntries.filter((e) => /belum ada laporan/i.test(statusOf(e))).length} belum ada laporan. Status Draft SPD hanya muncul pada daftar pelaksana.</p>
        <p className="mt-1 text-xs text-slate-500">Indeks tidak dihitung sebagai transaksi keuangan. Klik impor detail hanya untuk SPD yang benar-benar mempunyai rincian.</p>
        <div className="mt-2 max-h-40 overflow-y-auto text-xs">
          {indexEntries.slice(0, 30).map((e, i) => <div key={e.sourceKey || i} className="border-b py-1">
            {e.nomorSPD || e.nomorST || e.idKegiatan || 'Tanpa identitas'} · {statusOf(e)}
          </div>)}
        </div>
      </div>}
      {!!entries.length && <>
        <p className="mt-4 text-sm font-semibold">{uniqueRecords.length} SPD unik, {importable} siap secara keuangan, {uniqueRecords.length-importable} memerlukan perbaikan nilai atau identitas</p>
        <label className="mt-3 block text-xs font-semibold">Bandingkan secara lokal menggunakan ekspor CSV tab EPERJADIN_V4
          <input type="file" accept=".csv,text/csv" onChange={(e) => void loadLocalMaster(e.target.files?.[0])} className="mt-1 block w-full rounded-md border p-2 font-normal" />
        </label>
        {!!localMasterName && <p className="mt-1 text-xs text-slate-500">File lokal: {localMasterName} ({localMaster.length} baris). Tidak dikirim ke server.</p>}
        <button type="button" onClick={() => void compareMaster()} disabled={checking || (!authIdToken && !localMaster.length)} className="mt-3 rounded-md border border-blue-700 px-3 py-2 text-sm text-blue-700 disabled:opacity-50">{checking ? 'Memeriksa Master...' : 'Bandingkan dengan Master'}</button>
        <div className="mt-3 max-h-[480px] space-y-3 overflow-y-auto">
          {uniqueRecords.map((item) => <article key={item.key} className="rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><strong>{item.parsed?.nomorSPD || 'Nomor SPD tidak terbaca'}</strong><span className="ml-2 text-slate-500">{item.parsed?.peserta || ''}</span></div>
              <span className={item.issues.length ? 'text-amber-700' : 'text-emerald-700'}>{item.issues.length ? 'Keuangan perlu tinjau' : 'Keuangan cocok'}</span>
            </div>
            <p className="mt-1 text-slate-600">{item.parsed?.namaKegiatan || 'Kegiatan belum terbaca'}</p>
            {comparison[item.key] && <p className="mt-1 text-xs font-semibold text-blue-700">Master: {comparison[item.key].state.toUpperCase()} · {comparison[item.key].note}</p>}
            {comparison[item.key]?.state === 'berubah' && <label className="mt-2 flex items-start gap-2 text-xs"><input type="checkbox" checked={Boolean(selectedUpdates[item.key])} onChange={(e) => {setSelectedUpdates((prev)=>({...prev,[item.key]:e.target.checked}));setReviewed(false);}} />Saya menyetujui pembaruan SPD ini setelah meneliti perubahannya.</label>}
            <p className="mt-1">Total resmi: {formatMoney(item.official)}. Komponen dihitung: {formatMoney(item.sent)}. {item.parsed?.components.length || 0} jenis biaya.</p>
            <label className="mt-2 block text-xs font-medium">Akun anggaran
              <select className="mt-1 w-full rounded-md border p-2 font-normal" value={item.parsed?.kodeAkun || accounts[item.key] || ''} onChange={(e) => {setAccounts((s)=>({...s,[item.key]:e.target.value}));setReviewed(false);}}>
                <option value="">Pilih akun sesuai penugasan</option>
                {budgetAccounts.map((a) => <option key={a.kode} value={a.kode}>{a.nama}</option>)}
              </select>
            </label>
            {!!item.issues.length && <p className="mt-2 text-xs text-amber-700">{item.issues.join(' · ')}</p>}
            {!!item.presensiNote && <p className="mt-2 text-xs text-amber-700">Presensi: {item.presensiNote} Nilai keuangan tetap dapat diperiksa terpisah.</p>}
            {feedback[item.key] && <p className="mt-2 text-xs font-semibold text-blue-700">{feedback[item.key]}</p>}
          </article>)}
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} className="mt-1" />
          Saya sudah memeriksa nilai, akun, dan perbandingan. SPD lama diperbarui hanya jika saya memilihnya.
        </label>
        <button type="button" onClick={() => void saveBatch()} disabled={!reviewed || saving || !importable || !authIdToken || !comparisonReady || comparisonMode !== 'live'} className="mt-3 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
          {saving ? 'Menyimpan...' : 'Simpan SPD Baru / Berubah Terpilih'}
        </button>
      </>}
      {result && <p className="mt-3 rounded-md bg-blue-50 p-3 text-sm text-blue-700">{result}</p>}
      {error && <p className="mt-3 rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <p className="mt-4 text-xs text-slate-500">Perbandingan CSV dilakukan sepenuhnya di browser tanpa login. Tombol Simpan hanya aktif untuk perbandingan langsung melalui backend V5 terautentikasi. Data Master lama tidak ditimpa melalui file CSV.</p>
    </section>
  );
}
