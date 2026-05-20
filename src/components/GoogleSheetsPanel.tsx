import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Download, CheckCircle, AlertTriangle, RefreshCw, HelpCircle, FileSpreadsheet, Copy, Link2, Globe } from 'lucide-react';
import { convertParsedToRow, MASTER_HEADERS, APPS_SCRIPT_CODE } from '@/utils/googleSheets';
import type { ParsedData, CalculationResult } from '@/types';

interface Props {
  parsedData: ParsedData | null;
  tujuan: string;
  calcResult: CalculationResult | null;
}

export function GoogleSheetsPanel({ parsedData, tujuan, calcResult }: Props) {
  const [webAppUrl, setWebAppUrl] = useState(localStorage.getItem('eperjadin_webapp_url') || '');
  const [sheetName, setSheetName] = useState(localStorage.getItem('eperjadin_sheet_name') || 'Data Master');
  const [pushStatus, setPushStatus] = useState<'idle' | 'pushing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedScript, setCopiedScript] = useState(false);
  const [connected, setConnected] = useState(false);
  const [pulledData, setPulledData] = useState<any>(null);

  const saveConfig = () => {
    localStorage.setItem('eperjadin_webapp_url', webAppUrl);
    localStorage.setItem('eperjadin_sheet_name', sheetName);
  };

  const testConnection = async () => {
    setPushStatus('pushing');
    setErrorMsg('');
    try {
      const res = await fetch(webAppUrl, { method: 'GET' });
      const data = await res.json();
      if (data.success) { setConnected(true); setPulledData(data); saveConfig(); }
      else throw new Error('Invalid response');
    } catch (err: any) { setErrorMsg('Gagal terhubung: ' + err.message); setConnected(false); }
    setPushStatus('idle');
  };

  const handlePush = async () => {
    if (!parsedData || !tujuan || !webAppUrl) return;
    setPushStatus('pushing');
    setErrorMsg('');
    try {
      const row = convertParsedToRow(parsedData, tujuan, calcResult || undefined);
      const payload = { sheetName, headers: MASTER_HEADERS, rows: [row] };
      const res = await fetch(webAppUrl, { method: 'POST', body: JSON.stringify(payload) });
      const result = await res.json();
      if (result.success) { setPushStatus('success'); setConnected(true); }
      else throw new Error(result.error || 'Unknown error');
    } catch (err: any) { setPushStatus('error'); setErrorMsg(err.message); }
  };

  const handlePull = async () => {
    setPushStatus('pushing');
    try {
      const res = await fetch(webAppUrl, { method: 'GET' });
      const data = await res.json();
      setPulledData(data);
    } catch (err: any) { setErrorMsg(err.message); }
    setPushStatus('idle');
  };

  const generateCSV = () => {
    if (!parsedData || !tujuan) return;
    const row = convertParsedToRow(parsedData, tujuan, calcResult || undefined);
    return [MASTER_HEADERS.join('\t'), row.map(c => `"${String(c).replace(/"/g, '""')}"`).join('\t')].join('\n');
  };

  const copyToClipboard = (text: string) => { navigator.clipboard.writeText(text); };
  const [csvExport, setCsvExport] = useState('');

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardHeader className="bg-blue-100/50 border-b border-blue-200">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-blue-600" />
          Google Sheets Integration
          {connected && <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300 ml-2"><CheckCircle className="w-3 h-3 mr-1" /> Terhubung</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {errorMsg && <Alert className="border-red-300 bg-red-50"><AlertTriangle className="w-4 h-4 text-red-600" /><AlertDescription className="text-red-800 text-sm">{errorMsg}</AlertDescription></Alert>}
        {pushStatus === 'success' && <Alert className="border-green-300 bg-green-50"><CheckCircle className="w-4 h-4 text-green-600" /><AlertDescription className="text-green-800 text-sm">Data berhasil dikirim ke Google Sheets!</AlertDescription></Alert>}

        <Tabs defaultValue="appscript" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="appscript">Mode Apps Script</TabsTrigger>
            <TabsTrigger value="manual">Mode Copy-Paste</TabsTrigger>
          </TabsList>

          <TabsContent value="appscript" className="space-y-4">
            {!connected ? (
              <>
                <Alert className="bg-blue-50 border-blue-200"><Globe className="w-4 h-4 text-blue-600" /><AlertDescription className="text-blue-800 text-sm">Setup sekali, gunakan selamanya. Klik "Panduan Setup" untuk instruksi detail.</AlertDescription></Alert>

                <Dialog>
                  <DialogTrigger asChild><Button variant="outline" className="w-full"><HelpCircle className="w-4 h-4 mr-2" /> Panduan Setup Lengkap</Button></DialogTrigger>
                  <DialogContent className="max-w-lg max-h-[85vh]">
                    <DialogHeader><DialogTitle>Panduan Setup Google Apps Script</DialogTitle><DialogDescription>Lakukan sekali, berlaku selamanya</DialogDescription></DialogHeader>
                    <ScrollArea className="h-[500px]">
                      <div className="space-y-5 text-sm">
                        <Step n={1} t="Buka Spreadsheet"><a href="https://sheets.new" target="_blank" className="text-blue-600 underline">sheets.new</a> - beri nama "Master E-Perjadin"</Step>
                        <Step n={2} t="Buka Apps Script">Klik <strong>Extensions &gt; Apps Script</strong></Step>
                        <Step n={3} t="Paste Kode">Hapus kode default, paste kode di bawah:
                          <div className="mt-2 relative"><pre className="bg-slate-900 text-green-400 p-3 rounded text-xs overflow-x-auto max-h-[180px]">{APPS_SCRIPT_CODE}</pre>
                            <Button size="sm" variant="secondary" className="absolute top-2 right-2" onClick={() => { copyToClipboard(APPS_SCRIPT_CODE); setCopiedScript(true); setTimeout(() => setCopiedScript(false), 2000); }}>
                              {copiedScript ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            </Button>
                          </div>
                        </Step>
                        <Step n={4} t="Simpan Project">Klik <strong>Save</strong> (Ctrl+S) - beri nama "EPerjadinAPI"</Step>
                        <Step n={5} t="Deploy Web App">Klik <strong>Deploy &gt; New deployment</strong> &gt; ikon gear &gt; <strong>Web app</strong><br/>Execute as: <strong>Me</strong> | Who has access: <strong>Anyone</strong></Step>
                        <Step n={6} t="Authorize">Klik <strong>Authorize access</strong> &gt; Advanced &gt; Go to EPerjadinAPI &gt; Allow</Step>
                        <Step n={7} t="Copy URL">Copy URL Web App, paste di field di bawah</Step>
                      </div>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>

                <div className="bg-white p-4 rounded-lg border space-y-3">
                  <Label className="font-semibold flex items-center gap-2"><Link2 className="w-4 h-4" /> URL Web App Apps Script</Label>
                  <Input placeholder="https://script.google.com/macros/s/AKfycb.../exec" value={webAppUrl} onChange={(e) => setWebAppUrl(e.target.value)} />
                  <Input placeholder="Nama Sheet (default: Data Master)" value={sheetName} onChange={(e) => setSheetName(e.target.value)} />
                  <Button onClick={testConnection} disabled={!webAppUrl.trim() || pushStatus === 'pushing'} className="w-full bg-blue-600">
                    {pushStatus === 'pushing' ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
                    {pushStatus === 'pushing' ? 'Menghubungkan...' : 'Test Koneksi'}
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 p-3 rounded-lg flex items-center justify-between">
                  <span className="text-sm font-medium text-green-800 flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Terhubung ke: {sheetName}</span>
                  <Button size="sm" variant="ghost" className="text-red-600 h-7" onClick={() => setConnected(false)}>Reset</Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" onClick={handlePull} disabled={pushStatus === 'pushing'}><Download className="w-4 h-4 mr-2" /> Pull Data</Button>
                  <Button variant="outline" onClick={() => setPulledData(null)} disabled={!pulledData}><FileSpreadsheet className="w-4 h-4 mr-2" /> Lihat ({pulledData?.rowCount || 0})</Button>
                </div>
                {pulledData?.rows && (
                  <div className="bg-white border rounded-lg p-3">
                    <p className="text-sm font-medium mb-2">Preview ({pulledData.rowCount - 1} data rows)</p>
                    <ScrollArea className="h-[200px]">
                      <Table><TableHeader><TableRow>{pulledData.headers.map((h: string, i: number) => <TableHead key={i} className="text-xs">{h}</TableHead>)}</TableRow></TableHeader>
                        <TableBody>{pulledData.rows.slice(0, 10).map((row: string[], i: number) => <TableRow key={i}>{row.map((c: string, j: number) => <TableCell key={j} className="text-xs max-w-[100px] truncate">{c}</TableCell>)}</TableRow>)}</TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                )}
                {parsedData && (
                  <div className="bg-white p-4 rounded-lg border space-y-3">
                    <h4 className="font-semibold text-sm flex items-center gap-2"><Upload className="w-4 h-4 text-blue-600" /> Push Data Hasil Parsing</h4>
                    <div className="text-xs text-slate-600 space-y-1">
                      <p>ID: <span className="font-mono">{parsedData.idKegiatan}</span></p>
                      <p>Kegiatan: {parsedData.namaKegiatan}</p>
                      <p>Pegawai: {parsedData.peserta}</p>
                    </div>
                    <Button onClick={handlePush} disabled={pushStatus === 'pushing'} className="w-full bg-green-600 hover:bg-green-700">
                      {pushStatus === 'pushing' ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                      Push ke Google Sheets
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="manual" className="space-y-4">
            <Alert className="bg-amber-50 border-amber-200"><AlertTriangle className="w-4 h-4 text-amber-600" /><AlertDescription className="text-amber-800 text-sm">Generate data tab-delimited untuk copy-paste langsung ke Google Sheets/Excel</AlertDescription></Alert>
            <Button onClick={() => setCsvExport(generateCSV() || '')} disabled={!parsedData || !tujuan} className="w-full bg-blue-600"><Copy className="w-4 h-4 mr-2" /> Generate Data</Button>
            {csvExport && (
              <>
                <div className="relative"><Textarea value={csvExport} readOnly className="min-h-[120px] font-mono text-xs bg-slate-50" />
                  <Button size="sm" variant="secondary" className="absolute top-2 right-2" onClick={() => { copyToClipboard(csvExport); }}><Copy className="w-3 h-3 mr-1" /> Copy</Button>
                </div>
                <Alert className="bg-green-50 border-green-200"><CheckCircle className="w-4 h-4 text-green-600" /><AlertDescription className="text-green-800 text-xs">1. Copy data di atas &rarr; 2. Buka Google Sheets &rarr; 3. Klik cell A1, paste (Ctrl+V)</AlertDescription></Alert>
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Step({ n, t, children }: { n: number; t: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h4 className="font-semibold flex items-center gap-2 text-sm"><span className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0">{n}</span>{t}</h4>
      <div className="text-slate-600 pl-8 text-xs leading-relaxed">{children}</div>
    </div>
  );
}
