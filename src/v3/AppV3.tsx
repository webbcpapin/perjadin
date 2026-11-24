import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ClipboardPaste, FileJson, FileSearch, LockKeyhole, Send, Trash2 } from 'lucide-react';
import GoogleLoginV5 from './GoogleLoginV5';
import { endpoint, issues, MAX_BATCH, MAX_BYTES, MAX_TEXT, post, readCollector, review, validClientId } from './intake';
import type { DraftRow, Receipt } from './intake';

const inputStyle = 'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700';
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-45';
const primary = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-45';
const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
type Mode = 'paste' | 'json';

export default function AppV3() {
  const [mode, setMode] = useState<Mode>('paste');
  const [raw, setRaw] = useState('');
  const [draft, setDraft] = useState<DraftRow[]>([]);
  const [url, setUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [login, setLogin] = useState(false);
  const [token, setToken] = useState('');
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Receipt>();
  const operation = useRef(0);
  const chosenFile = useRef<HTMLInputElement>(null);
  const setGoogleToken = useCallback((credential: string) => {
    setToken(credential);
    setVerified(false);
    setError('');
  }, []);
  const resetInput = useCallback(() => {
    setRaw('');
    setDraft([]);
    if (chosenFile.current) chosenFile.current.value = '';
  }, []);
  const signOut = useCallback(() => {
    setToken('');
    setVerified(false);
    setLogin(false);
  }, []);
  useEffect(() => {
    // Do not leave sensitive form data in a browser back/forward snapshot.
    const leave = () => {
      operation.current++;
      resetInput();
      signOut();
      setBusy(false);
      setReceipt(undefined);
      setError('');
    };
    window.addEventListener('pagehide', leave);
    const restore = (event: PageTransitionEvent) => { if (event.persisted) leave(); };
    window.addEventListener('pageshow', restore);
    return () => { window.removeEventListener('pagehide', leave); window.removeEventListener('pageshow', restore); };
  }, [resetInput, signOut]);

  function switchMode(next: Mode) {
    if (next === mode || busy) return;
    resetInput();
    setError('');
    setReceipt(undefined);
    setMode(next);
  }
  async function openFile(file?: File) {
    setDraft([]);
    setReceipt(undefined);
    setError('');
    if (!file) return;
    if (!/\.json$/i.test(file.name) || (file.type && file.type !== 'application/json') || file.size > MAX_BYTES || !file.size) {
      setError('Pilih file JSON Collector hingga 750 KB.');
      return;
    }
    const op = ++operation.current;
    setBusy(true);
    try {
      const data = readCollector(await file.text());
      if (op === operation.current) setDraft(data);
    } catch {
      if (op === operation.current) setError(`File tidak sesuai format Collector atau melebihi ${MAX_BATCH} SPD.`);
    } finally {
      if (op === operation.current) setBusy(false);
    }
  }
  async function request(send: boolean) {
    if (busy || !token || !endpoint(url) || (send && !verified)) return;
    const records = send ? draft.flatMap((x) => x.record && !x.issue ? [x.record] : []) : [];
    if (send && (!draft.length || records.length !== draft.length)) return;
    setBusy(true);
    setError('');
    setReceipt(undefined);
    const op = ++operation.current;
    try {
      const action = !send ? 'verifyConnection' : mode === 'paste' ? 'submitParsedPerjadin' : 'submitCollectorJson';
      const result = await post(action, endpoint(url), token, records);
      if (op !== operation.current) return;
      if (!send) setVerified(true);
      else if (result) {
        if (!result.rejected) resetInput();
        else if (mode === 'json') {
          if (chosenFile.current) chosenFile.current.value = '';
          setDraft(result.results.filter((x) => x.status === 'rejected').map((x) => draft[x.row - 1]));
        }
        setReceipt(result);
      }
    } catch (e) {
      if (op !== operation.current) return;
      const code = e instanceof Error ? e.message : 'UNAVAILABLE';
      if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') signOut();
      setError(issues[code] || issues.UNAVAILABLE);
    } finally {
      if (op === operation.current) setBusy(false);
    }
  }
  const invalid = draft.filter((row) => row.issue).length;
  const single = mode === 'paste' ? draft[0]?.record : null;
  return <div className="min-h-screen bg-slate-50 text-slate-950">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-6">
        <h1 className="flex items-center gap-2 text-lg font-semibold"><LockKeyhole size={19} className="text-teal-800" /> ePerjadin <span className="font-normal text-slate-500">/ Pengiriman SPD</span></h1>
        <span className={verified ? 'text-sm font-medium text-teal-800' : 'text-sm text-slate-600'}>{verified ? 'Akses terverifikasi' : 'Belum masuk'}</span>
      </div>
    </header>
    <main className="mx-auto grid max-w-5xl gap-7 px-4 py-6 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
      <section className="min-w-0" aria-labelledby="input-title">
        <h2 id="input-title" className="mb-3 text-base font-semibold">Input SPD</h2>
        <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200" aria-label="Jenis input">
          {(['paste', 'json'] as const).map((item) => {
            const Icon = item === 'paste' ? ClipboardPaste : FileJson;
            return <button key={item} type="button" disabled={busy} aria-pressed={item === mode} onClick={() => switchMode(item)}
              className={`inline-flex min-h-10 items-center gap-2 border-b-2 px-3 text-sm font-medium ${item === mode ? 'border-teal-800 text-teal-900' : 'border-transparent text-slate-600 hover:text-slate-950'}`}>
              <Icon size={16} />{item === 'paste' ? 'Copy-paste' : 'JSON Collector'}
            </button>;
          })}
        </div>
        {mode === 'paste' ? <>
          <label className="block text-sm font-medium" htmlFor="source-text">Teks pertanggungjawaban SPD</label>
          <textarea id="source-text" className={`${inputStyle} min-h-48 resize-y`} autoComplete="off" spellCheck={false} maxLength={MAX_TEXT}
            value={raw} disabled={busy} onChange={(e) => { setRaw(e.target.value); setDraft([]); setReceipt(undefined); setError(''); }} />
          <button type="button" className={`${button} mt-3`} disabled={busy || !raw.trim()} onClick={() => { setDraft([review(raw)]); setReceipt(undefined); setError(''); }}>
            <FileSearch size={16} /> Parsing
          </button>
        </> : <label className="block text-sm font-medium">File JSON Collector
          <input type="file" className={inputStyle} accept=".json,application/json" ref={chosenFile} disabled={busy}
            onChange={(e) => { void openFile(e.target.files?.[0]); }} />
        </label>}

        {draft.length > 0 && <section className="mt-5 border-t border-slate-200 pt-4" aria-label="Pratinjau sementara">
          <h3 className="text-sm font-semibold">Pratinjau sementara</h3>
          {single && <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 break-words text-sm">
            <dt className="text-slate-600">SPD</dt><dd>{single.nomorSPD || '-'}</dd>
            <dt className="text-slate-600">Pelaksana</dt><dd>{single.peserta || '-'}</dd>
            <dt className="text-slate-600">Total riil</dt><dd>{rupiah.format(single.totalPengeluaranRiil)}</dd>
            <dt className="text-slate-600">Presensi</dt><dd>{single.presensiStatus === 'ada' ? `${single.geotags.length} titik, perlu verifikasi` :
              single.presensiStatus === 'kosong' ? 'Tidak ada presensi' : 'Belum terbaca'}</dd>
          </dl>}
          {single && <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-medium text-teal-800">Rincian input SPD</summary>
            <div className="mt-2 space-y-3 break-words border-l border-slate-200 pl-3">
              <ul className="space-y-2">{single.routes.map((route, i) => <li key={i}>
                <span className="font-medium">Rute {route.nomorRute}: {route.tujuan}</span>
                <p className="text-slate-600">{route.tanggalMulai} s.d. {route.tanggalSelesai}</p>
                <ul>{single.components.filter((c) => c.nomorRute === route.nomorRute).map((component, j) =>
                  <li key={j}>{component.nama}: {rupiah.format(component.nilaiRiil)} ({component.status})</li>)}</ul>
              </li>)}</ul>
              {!!single.geotags.length && <ul className="space-y-2">{single.geotags.map((geo, i) =>
                <li key={i}><p className="font-medium">{geo.hariTanggal} / {geo.waktuTagging}</p>
                  <p>{geo.wilayahTagging}{geo.lokasiTagging && ` — ${geo.lokasiTagging}`}</p></li>)}</ul>}
            </div>
          </details>}
          {mode === 'json' && <p className="mt-2 text-sm">{draft.length} SPD, {draft.length - invalid} lolos pemeriksaan awal, {invalid} perlu tinjau</p>}
          {invalid > 0 && <ul className="mt-2 space-y-1 text-sm text-rose-800">{draft.flatMap((row, i) =>
            row.issue ? [<li key={i}>Baris {i + 1}: {row.issue}</li>] : [])}</ul>}
        </section>}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className={primary} onClick={() => { void request(true); }}
            disabled={!verified || busy || !draft.length || !!invalid}><Send size={16} />
            {busy ? 'Memproses...' : mode === 'paste' ? 'Kirim ke Backend' : 'Kirim Batch ke Backend'}</button>
          {(raw || draft.length > 0) && <button type="button" className={button} disabled={busy}
            onClick={() => { resetInput(); setReceipt(undefined); setError(''); }}><Trash2 size={16} /> Bersihkan input</button>}
        </div>
        {error && <p role="alert" className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</p>}
        {receipt && <section role="status" className="mt-4 rounded-md border border-teal-200 bg-teal-50 px-3 py-3 text-sm">
          <h3 className="flex items-center gap-2 font-semibold"><Check size={16} /> Konfirmasi backend</h3>
          <p className="mt-1">{receipt.accepted} diterima, {receipt.skipped} duplikat dilewati, {receipt.rejected} ditolak</p>
          <p className="mt-1 break-all text-xs text-slate-600">ID permintaan: {receipt.requestId}</p>
          <ul className="mt-1 space-y-1">{receipt.results.filter((item) => item.status === 'rejected').map((item) =>
            <li key={item.row}>Baris {item.row}: {issues[item.code]}</li>)}</ul>
        </section>}
      </section>

      <section className="min-w-0 border-t border-slate-200 pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0" aria-labelledby="access-title">
        <h2 id="access-title" className="mb-3 text-base font-semibold">Akses petugas</h2>
        <label className="block text-sm font-medium">URL Apps Script
          <input className={inputStyle} type="url" value={url} autoComplete="off" spellCheck={false} disabled={busy}
            onChange={(e) => { signOut(); setUrl(e.target.value); }} />
        </label>
        <label className="mt-3 block text-sm font-medium">Google OAuth Client ID
          <input className={inputStyle} value={clientId} autoComplete="off" spellCheck={false} disabled={busy}
            onChange={(e) => { signOut(); setClientId(e.target.value); }} />
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          {!login && <button type="button" className={button} disabled={busy || !endpoint(url) || !validClientId(clientId)} onClick={() => setLogin(true)}>
            <LockKeyhole size={16} /> Masuk dengan Google
          </button>}
          {login && !token && <GoogleLoginV5 clientId={clientId.trim()} onToken={setGoogleToken} />}
          {token && !verified && <button type="button" className={button} disabled={busy} onClick={() => { void request(false); }}>Verifikasi akses</button>}
          {login && <button type="button" className={button} disabled={busy} onClick={() => { signOut(); resetInput(); setReceipt(undefined); setError(''); }}>
            {token ? 'Keluar' : 'Batal'}
          </button>}
        </div>
      </section>
    </main>
  </div>;
}
