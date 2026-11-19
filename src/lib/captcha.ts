/**
 * A Turnstile token for Supabase Auth's captcha (decision D090, gap G22). Off, and a no-op, until
 * the build has EXPO_PUBLIC_TURNSTILE_SITE_KEY; the deploy turns Auth's captcha on only once the
 * matching secret exists (OPERATIONS.md, "Captcha"). The backend asks for a token before an
 * anonymous sign-in and before a sign-in code; <CaptchaHost /> in app/_layout.tsx shows the check.
 */
import { AppError } from '../domain/errors';

export const TURNSTILE_SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? '';
/** The page the check runs on: a hostname allowed for the site key in Cloudflare. */
export const TURNSTILE_PAGE = process.env.EXPO_PUBLIC_TURNSTILE_PAGE ?? 'https://pinkilock.com/';

export interface CaptchaAsk { resolve(token: string): void; reject(e: unknown): void }
let host: ((ask: CaptchaAsk) => void) | null = null;

/** The one <CaptchaHost /> registers here; it returns a function that unregisters it. */
export function registerCaptchaHost(show: (ask: CaptchaAsk) => void): () => void {
  host = show;
  return () => {
    if (host === show) host = null;
  };
}

/** A fresh token, or undefined when captcha is off in this build. */
export async function captchaToken(): Promise<string | undefined> {
  if (!TURNSTILE_SITE_KEY) return undefined;
  const show = host;
  if (!show) throw new AppError('PA010');
  return new Promise<string>((resolve, reject) => show({ resolve, reject }));
}
