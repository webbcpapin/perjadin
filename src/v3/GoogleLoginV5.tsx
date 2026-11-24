import { useEffect, useRef, useState } from 'react';

type GoogleClient = {
  initialize: (options: { client_id: string; callback: (result: { credential?: string }) => void; auto_select: boolean }) => void;
  renderButton: (target: HTMLElement, options: { theme: string; size: string; text: string }) => void;
};
type GoogleWindow = Window & { google?: { accounts?: { id?: GoogleClient } } };
const google = () => (window as GoogleWindow).google?.accounts?.id;

export default function GoogleLoginV5({ clientId, onToken }: { clientId: string; onToken: (token: string) => void }) {
  const button = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const target = button.current;
    if (!target) return;
    let active = true;
    const render = () => {
      const client = google();
      if (!active || !client) return;
      client.initialize({ client_id: clientId, auto_select: false, callback: ({ credential }) => {
        if (active && credential) onToken(credential);
      } });
      client.renderButton(target, { theme: 'outline', size: 'medium', text: 'signin_with' });
    };
    const error = () => setFailed(true);
    let script = document.querySelector<HTMLScriptElement>('script[data-intake-google]');
    if (google()) render();
    else {
      if (script?.dataset.intakeGoogle === 'failed') { script.remove(); script = null; }
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.dataset.intakeGoogle = 'true';
        script.addEventListener('error', () => { script!.dataset.intakeGoogle = 'failed'; }, { once: true });
        document.head.appendChild(script);
      }
      script.addEventListener('load', render);
      script.addEventListener('error', error);
    }
    return () => {
      active = false;
      script?.removeEventListener('load', render);
      script?.removeEventListener('error', error);
      target.replaceChildren();
    };
  }, [clientId, onToken]);
  return <div><div ref={button} />{failed && <p role="alert" className="text-sm text-rose-700">Login Google tidak dapat dimuat.</p>}</div>;
}
