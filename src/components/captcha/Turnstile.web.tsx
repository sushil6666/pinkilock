/**
 * Cloudflare Turnstile in a browser: its script, loaded once from Cloudflare, renders the check
 * into this view's element.
 */
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { AppError } from '../../domain/errors';
import { TURNSTILE_SITE_KEY } from '../../lib/captcha';

type TurnstileApi = { render(el: HTMLElement, opts: Record<string, unknown>): string; remove(id: string): void };
declare global {
  interface Window { turnstile?: TurnstileApi }
}

let loading: Promise<TurnstileApi> | null = null;
function api(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new AppError('PA010')));
    s.onerror = () => {
      loading = null;
      reject(new AppError('PC001'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export function Turnstile({ onToken, onError }: { onToken(token: string): void; onError(e: unknown): void }) {
  const box = useRef<View>(null);
  // The latest callbacks, without drawing the check again each time they change.
  const cb = useRef({ onToken, onError });
  cb.current = { onToken, onError };
  useEffect(() => {
    let id: string | null = null;
    let gone = false;
    api().then((ts) => {
      const el = box.current as unknown as HTMLElement | null;
      if (gone || !el) return;
      id = ts.render(el, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'dark',
        callback: (token: string) => cb.current.onToken(token),
        'error-callback': () => cb.current.onError(new AppError('PA010')),
        'expired-callback': () => cb.current.onError(new AppError('PA010')),
      });
    }, (e) => cb.current.onError(e));
    return () => {
      gone = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, []);
  return <View ref={box} style={{ minHeight: 70, alignItems: 'center' }} />;
}
