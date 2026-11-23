import { useEffect, useRef, useState } from 'react';
type GoogleClient = {
  initialize: (options: { client_id: string; callback: (result: { credential?: string }) => void; auto_select: boolean }) => void;
  renderButton: (target: HTMLElement, options: { theme: string; size: string; text: string }) => void;
};
type GoogleWindow = Window & { google?: { accounts?: { id?: GoogleClient } } };
const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';

export default function GoogleLoginV5({ clientId, token, onClientId, onToken }: {
  clientId: string; token: string; onClientId: (value: string) => void; onToken: (value: string) => void;
}) {
  const button = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-eperjadin-google]');
    if ((window as GoogleWindow).google?.accounts?.id) { setReady(true); return; }
    const script = existing || document.createElement('script');
    if (!existing) {
      script.src = GOOGLE_SCRIPT;
      script.async = true;
      script.defer = true;
      script.dataset.eperjadinGoogle = 'true';
      document.head.appendChild(script);
    }
    const loaded = () => setReady(true);
    script.addEventListener('load', loaded);
    return () => script.removeEventListener('load', loaded);
  }, []);
  useEffect(() => {
    if (!ready || !clientId.trim() || !button.current) return;
    const api = (window as GoogleWindow).google?.accounts?.id;
    if (!api) return;
    button.current.replaceChildren();
    api.initialize({ client_id: clientId.trim(), callback: (r) => onToken(r.credential || ''), auto_select: false });
    api.renderButton(button.current, { theme: 'outline', size: 'medium', text: 'signin_with' });
  }, [ready, clientId, onToken]);
  return <section className="rounded-xl border border-slate-200 bg-white p-4">
    <h3 className="text-sm font-semibold">Login Google untuk backend V5 (opsional)</h3>
    <p className="mt-1 text-xs text-slate-500">Aktifkan hanya setelah administrator menyiapkan Google OAuth Client ID dan deployment V5. Token disimpan di memori tab, bukan di GitHub atau penyimpanan browser.</p>
    <label className="mt-3 block text-xs font-semibold">Google OAuth Client ID
      <input value={clientId} onChange={(e) => { onToken(''); onClientId(e.target.value); }} placeholder="xxxxxxxx.apps.googleusercontent.com" className="mt-1 w-full rounded-md border px-3 py-2 text-xs font-normal" />
    </label>
    <div className="mt-3 flex items-center justify-between gap-3">
      <div ref={button} />
      {token && <span className="text-xs font-medium text-emerald-700">Token Google diterima</span>}
    </div>
  </section>;
}
