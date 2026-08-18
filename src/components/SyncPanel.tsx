import { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardPaste, DatabaseZap, Download, RefreshCw, ShieldCheck } from 'lucide-react';

export type CollectorRecord = {
  stage?: string;
  sourceSection?: string;
  sourceStatus?: string;
  idKegiatan?: string;
  namaKegiatan?: string;
  nomorST?: string;
  nomorReferensi?: string;
  tanggalMulai?: string;
  tanggalSelesai?: string;
  tanggalKegiatan?: string;
  jenisPerjadin?: string;
  status?: string;
  namaPegawai?: string;
  rawText?: string;
  sourceUrl?: string;
  capturedAt?: string;
  sourceRecordKey?: string;
};

export type CollectorPayload = {
  schemaVersion: number;
  source: string;
  capturedAt: string;
  pageUrl?: string;
  section?: string;
  totalSourceRows?: number;
  records: CollectorRecord[];
};

type Props = {
  endpoint: string;
  accessCode: string;
  onReload: () => Promise<void>;
  onMessage: (message: string) => void;
};

function parsePayload(raw: string): CollectorPayload {
  const parsed = JSON.parse(raw) as Partial<CollectorPayload>;
  if (!Array.isArray(parsed.records)) throw new Error('JSON kolektor tidak memiliki array records.');

  return {
    schemaVersion: Number(parsed.schemaVersion) || 1,
    source: parsed.source || 'satu-kemenkeu',
    capturedAt: parsed.capturedAt || new Date().toISOString(),
    pageUrl: parsed.pageUrl || '',
    section: parsed.section || '',
    totalSourceRows: Number(parsed.totalSourceRows) || parsed.records.length,
    records: parsed.records,
  };
}

export function SyncPanel({ endpoint, accessCode, onReload, onMessage }: Props) {
  const [rawPayload, setRawPayload] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  const preview = useMemo(() => {
    if (!rawPayload.trim()) return null;
    try {
      const payload = parsePayload(rawPayload);
      const unique = new Set(payload.records.map((record) => record.sourceRecordKey || `${record.stage}|${record.idKegiatan}|${record.nomorST}|${record.namaPegawai}`));
      const complete = payload.records.filter((record) => record.idKegiatan && record.namaKegiatan).length;
      return { payload, unique: unique.size, complete, error: '' };
    } catch (error) {
      return { payload: null, unique: 0, complete: 0, error: error instanceof Error ? error.message : 'JSON tidak valid.' };
    }
  }, [rawPayload]);

  async function pasteCollectorData() {
    try {
      setRawPayload(await navigator.clipboard.readText());
      setResult('Data kolektor ditempel dari clipboard. Periksa ringkasan sebelum sinkronisasi.');
    } catch {
      setResult('Clipboard tidak dapat dibaca. Tempel JSON secara manual pada kotak impor.');
    }
  }

  async function syncBatch() {
    if (!preview?.payload || preview.error) return;
    if (!endpoint.trim() || !accessCode.trim()) {
      setResult('URL Apps Script dan PIN akses wajib terisi.');
      return;
    }

    setBusy(true);
    setResult('');
    try {
      const response = await fetch(endpoint.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'batchUpsertCollector', accessCode, payload: preview.payload }),
      });
      const body = await response.json();
      if (!body.success) throw new Error(body.message || 'Sinkronisasi batch gagal.');

      const message = `Sinkronisasi selesai: ${body.inserted || 0} baru, ${body.updated || 0} diperbarui, ${body.skipped || 0} dilewati.`;
      setResult(message);
      onMessage(message);
      await onReload();
    } catch (error) {
      setResult(error instanceof Error ? error.message : 'Sinkronisasi batch gagal.');
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const template: CollectorPayload = {
      schemaVersion: 1,
      source: 'satu-kemenkeu',
      capturedAt: new Date().toISOString(),
      pageUrl: 'https://satu.kemenkeu.go.id/perjadin/monitoring',
      section: 'Kegiatan',
      totalSourceRows: 1,
      records: [
        {
          stage: 'Kegiatan',
          idKegiatan: 'contoh-id',
          namaKegiatan: 'Contoh kegiatan',
          nomorST: 'ST-000/KBC.0503/2026',
          tanggalKegiatan: '01 Agustus 2026',
          status: 'Kegiatan Disetujui',
        },
      ],
    };
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'template-kolektor-eperjadin.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-lg border border-indigo-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <DatabaseZap className="h-4 w-4 text-indigo-700" />
            Sinkronisasi SATU Kemenkeu
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            Impor JSON dari Kolektor EPERJADIN. Data di-upsert berdasarkan tahap, ID kegiatan, ST, dan peserta sehingga sinkronisasi ulang tidak menggandakan baris.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={pasteCollectorData} className="inline-flex items-center gap-2 rounded-md border border-indigo-300 px-3 py-2 text-sm font-medium text-indigo-800">
            <ClipboardPaste className="h-4 w-4" /> Tempel dari Kolektor
          </button>
          <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700">
            <Download className="h-4 w-4" /> Template JSON
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <textarea
          aria-label="JSON hasil Kolektor EPERJADIN"
          className="h-56 w-full rounded-md border border-zinc-300 p-3 font-mono text-xs outline-none focus:border-indigo-500"
          value={rawPayload}
          onChange={(event) => setRawPayload(event.target.value)}
          placeholder="Tempel JSON hasil Kolektor EPERJADIN di sini."
        />
        <div className="rounded-md border bg-zinc-50 p-4 text-sm">
          <h3 className="flex items-center gap-2 font-medium">
            <ShieldCheck className="h-4 w-4 text-indigo-700" /> Pemeriksaan batch
          </h3>
          {!preview && <p className="mt-3 text-zinc-500">Belum ada payload untuk diperiksa.</p>}
          {preview?.error && <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-red-700">{preview.error}</p>}
          {preview?.payload && (
            <dl className="mt-3 space-y-2">
              <div className="flex justify-between gap-3"><dt className="text-zinc-500">Sumber</dt><dd className="font-medium">{preview.payload.source}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-zinc-500">Bagian</dt><dd className="font-medium">{preview.payload.section || '-'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-zinc-500">Total pusat</dt><dd className="font-medium">{preview.payload.totalSourceRows}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-zinc-500">Terekam</dt><dd className="font-medium">{preview.payload.records.length}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-zinc-500">Unik</dt><dd className="font-medium">{preview.unique}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-zinc-500">ID + nama terbaca</dt><dd className="font-medium">{preview.complete}</dd></div>
            </dl>
          )}
          <button
            type="button"
            onClick={syncBatch}
            disabled={!preview?.payload || !!preview.error || busy}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-indigo-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {busy ? 'Menyinkronkan...' : 'Sinkronkan ke Google Sheet'}
          </button>
        </div>
      </div>
      {result && <p aria-live="polite" className="mt-3 rounded-md border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-950">{result}</p>}
    </section>
  );
}
