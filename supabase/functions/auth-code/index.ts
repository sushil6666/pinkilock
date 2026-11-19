/**
 * auth-code: sends a sign-in code without saying who has an account (gap G22, decision D091).
 *
 * The app POSTs { kind: 'email' | 'phone', address, mode: 'sign_in' | 'link', captcha_token? } with
 * the person's session (or the anon key when there is none). This function:
 *   1. checks the captcha token with Cloudflare when TURNSTILE_SECRET is set, before anything else,
 *      so a failed check reads the same for every address;
 *   2. refuses a sign-in kind Auth has switched off, and an address that is not shaped like one
 *      (both say nothing about anyone);
 *   3. asks public.auth_code_check (service role only) whether to send, which also counts the
 *      request against the address and the caller;
 *   4. answers { sent: true } at once, whatever the answer was, and only then, in the background,
 *      asks Auth to send the code: to an account's address when signing in, or to a free address
 *      when adding one to my account. Someone else's address, or one with no account, gets
 *      nothing, and a code typed for it never matches (PA006), like a mistyped one.
 *
 * Auth is called as the service role, so a captcha already checked here is not asked for again.
 * Deployed with --no-verify-jwt: a signed-out phone has no session yet, and the token is checked
 * here, against Auth. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 * Logs carry the kind, the mode and the outcome only, never an address.
 */

const BASE = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET') ?? '';
const TURNSTILE_VERIFY = Deno.env.get('TURNSTILE_VERIFY_URL') ?? 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-trace-id, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const service = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@.]{2,}$/;
const PHONE = /^\+[1-9]\d{6,14}$/;

async function sha256(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** In the background where the runtime allows it, so the answer takes the same time either way. */
function later(work: Promise<unknown>) {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(work);
  else work.catch(() => undefined);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ code: 'PA009' }, 405);
  const trace = (req.headers.get('x-trace-id') ?? '').replace(/[^0-9A-Z]/g, '').slice(0, 8) || 'none';
  const body = (await req.json().catch(() => null)) as { kind?: string; address?: string; mode?: string; captcha_token?: string } | null;
  const kind = body?.kind === 'phone' ? 'phone' : body?.kind === 'email' ? 'email' : null;
  const mode = body?.mode === 'link' ? 'link' : body?.mode === 'sign_in' ? 'sign_in' : null;
  const address = (body?.address ?? '').trim();
  const log = (outcome: string) => console.log(JSON.stringify({ event: 'auth_code', kind, mode, outcome, trace }));
  if (!kind || !mode) return json({ code: 'PA009' }, 400);

  // 1. The captcha, first and for everyone.
  if (TURNSTILE_SECRET) {
    const form = new FormData();
    form.append('secret', TURNSTILE_SECRET);
    form.append('response', body?.captcha_token ?? '');
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
    if (ip) form.append('remoteip', ip);
    const ok = await fetch(TURNSTILE_VERIFY, { method: 'POST', body: form })
      .then((r) => r.json() as Promise<{ success?: boolean }>).then((r) => !!r.success).catch(() => false);
    if (!ok) {
      log('captcha_failed');
      return json({ code: 'PA010' }, 400);
    }
  }

  // 2. What can be said about the request itself.
  const settings = await fetch(`${BASE}/auth/v1/settings`, { headers: { apikey: SERVICE_KEY } })
    .then((r) => r.json() as Promise<{ external?: Record<string, boolean> }>).catch(() => null);
  if (settings && !settings.external?.[kind]) return json({ code: kind === 'phone' ? 'PA001' : 'PA002' }, 400);
  if (!(kind === 'phone' ? PHONE : EMAIL).test(address)) return json({ code: 'PA003' }, 400);

  // Who is asking: their account, or a hash of their network address when signed out.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const who = token && token !== SERVICE_KEY
    ? await fetch(`${BASE}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` } })
        .then(async (r) => (r.ok ? ((await r.json()) as { id?: string }).id ?? null : null)).catch(() => null)
    : null;
  if (mode === 'link' && !who) return json({ code: 'PL001' }, 401);
  const caller = who ? `u:${who}` : `ip:${await sha256((req.headers.get('x-forwarded-for') ?? 'none').split(',')[0].trim())}`;

  // 3. Whether to send, and the limits.
  const check = await fetch(`${BASE}/rest/v1/rpc/auth_code_check`, {
    method: 'POST',
    headers: { ...service, 'Content-Type': 'application/json', 'x-trace-id': trace },
    body: JSON.stringify({ p_kind: kind, p_address: address, p_mode: mode, p_caller: caller, p_user: who }),
  });
  const answer = await check.json().catch(() => null);
  if (!check.ok) {
    const code = (answer as { code?: string } | null)?.code ?? 'PA009';
    log(code);
    return json({ code }, code === 'PL112' ? 429 : 400);
  }

  // 4. The same answer either way; the code, if any, after it.
  if (answer === 'send') {
    const send = mode === 'sign_in'
      ? fetch(`${BASE}/auth/v1/otp`, {
          method: 'POST',
          headers: { ...service, 'Content-Type': 'application/json' },
          body: JSON.stringify({ [kind]: address, create_user: false }),
        })
      : fetch(`${BASE}/auth/v1/user`, {
          method: 'PUT',
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ [kind]: address }),
        });
    later(send.then((r) => log(r.ok ? 'sent' : `auth_${r.status}`)).catch(() => log('auth_unreachable')));
  } else {
    log('not_sent');
  }
  return json({ sent: true });
});
