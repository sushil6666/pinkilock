/**
 * talk: the parts of Talk mode (D108) that need a key the app must never hold.
 *
 *   POST {action: 'status'}                       what is open here: {ai, voice, payouts}
 *   POST {action: 'ai', chat, history, text}      signed in: one message to the AI companion.
 *                                                 talk_ai_turn checks and charges first (and runs the
 *                                                 self-harm check); then Claude answers. Nothing of
 *                                                 the chat is stored or logged. {chat, reply, harm, charged}
 *   POST {action: 'voice', call}                  signed in, on a live call: a LiveKit token for the
 *                                                 call's room, microphone only, never recorded. {url, token}
 *   POST {action: 'kyc', pan, account, ifsc, holder, street, city, state, pin}
 *                                                 signed in, an applied listener: makes their Razorpay
 *                                                 Route linked account (identity, PAN, bank). Only the
 *                                                 account id and the last four digits come back here.
 *   POST {action: 'payouts'} with the hook secret Postgres, every hour: sends the payouts that are due
 *                                                 as Route transfers.
 *
 * Secrets (supabase secrets set ..., from GitHub by .github/workflows/supabase-deploy.yml):
 *   ANTHROPIC_API_KEY     the Claude key (already used by review-line). Without it the AI is off (PL161).
 *   TALK_MODEL            optional; picks another model (the default is in MODEL below).
 *   LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
 *                         in-app voice. Without them calls with a listener are off (PL173).
 *   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (the wallet's) and TALK_ROUTE=on
 *                         Route onboarding and payouts. Without all three, listeners cannot finish
 *                         sign-up and payouts wait (PL173).
 *   PUSH_HOOK_SECRET      shared with Postgres, as for push and review-line.
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 *
 * Logs carry ids, actions, results and traces: never a message, a reply, a PAN or a bank detail.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@1.9.0';
import { HARM_NOTE, SYSTEM, toMessages, type Turn } from './companion.ts';

const BASE = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const HOOK_SECRET = Deno.env.get('PUSH_HOOK_SECRET') ?? '';
const AI_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const MODEL = Deno.env.get('TALK_MODEL') ?? 'claude-opus-5-5';
const LK_URL = Deno.env.get('LIVEKIT_URL') ?? '';
const LK_KEY = Deno.env.get('LIVEKIT_API_KEY') ?? '';
const LK_SECRET = Deno.env.get('LIVEKIT_API_SECRET') ?? '';
const RZP_ID = Deno.env.get('RAZORPAY_KEY_ID') ?? '';
const RZP_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';
const ROUTE = (Deno.env.get('TALK_ROUTE') ?? '') === 'on' && !!RZP_ID && !!RZP_SECRET;
const RAZORPAY = Deno.env.get('RAZORPAY_API_URL') ?? 'https://api.razorpay.com';
const ROUTE_CATEGORY = Deno.env.get('TALK_ROUTE_CATEGORY') ?? 'services';
const ROUTE_SUBCATEGORY = Deno.env.get('TALK_ROUTE_SUBCATEGORY') ?? 'consulting';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-trace-id, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const refuse = (code: string, status = 400) => json({ code, message: '' }, status);
const service = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

interface DbError { code?: string; message?: string }
async function rpc<T>(fn: string, args: unknown, trace: string): Promise<{ data?: T; error?: DbError }> {
  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...service, 'Content-Type': 'application/json', 'x-trace-id': trace },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => null);
  return res.ok ? { data: body as T } : { error: (body ?? {}) as DbError };
}
const fromDb = (e: DbError) => json({ code: e.code ?? 'PC002', message: e.message ?? '' }, 400);

function sameSecret(given: string, want: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(want);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// --- The AI companion -------------------------------------------------------------------------
const claude = AI_KEY ? new Anthropic({ apiKey: AI_KEY, timeout: 45_000, maxRetries: 1 }) : null;
const HELP = '[[HELP]]';
/** When the whole fallback chain declines, or the model fails: a kind reply that points somewhere real. */
const SAFE_REPLY = "I'm an AI, and I couldn't answer that one well. If things feel heavy, Tele-MANAS (14416) is free and open all day and night, and a real listener is one tap away.";

async function companion(history: Turn[], text: string, harm: boolean): Promise<{ reply: string; flagged: boolean }> {
  const response = await claude!.beta.messages.create({
    model: MODEL,
    max_tokens: 2048,
    // Short, warm chat replies: low effort keeps them quick and cheap.
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }, ...(harm ? [{ type: 'text' as const, text: HARM_NOTE }] : [])],
    messages: toMessages(history, text),
  });
  if (response.stop_reason === 'refusal') return { reply: SAFE_REPLY, flagged: false };
  const out = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('').trim();
  if (!out) return { reply: SAFE_REPLY, flagged: false };
  const flagged = out.includes(HELP);
  return { reply: out.replaceAll(HELP, '').trim() || SAFE_REPLY, flagged };
}

// --- LiveKit: an access token is a JWT signed with the API secret ------------------------------
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
async function livekitToken(room: string, identity: string, name: string, minutes: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = enc({ alg: 'HS256', typ: 'JWT' });
  const body = enc({
    iss: LK_KEY, sub: identity, name, nbf: now - 10, exp: now + (minutes + 10) * 60,
    // Voice only: the microphone, nothing else, and no data channel. Nothing starts a recording.
    video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false, canPublishSources: ['microphone'] },
  });
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(LK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

// --- Razorpay Route ----------------------------------------------------------------------------
const rzpAuth = () => `Basic ${btoa(`${RZP_ID}:${RZP_SECRET}`)}`;
async function rzp<T>(method: string, path: string, body?: unknown): Promise<T | null> {
  const res = await fetch(`${RAZORPAY}${path}`, {
    method,
    headers: { Authorization: rzpAuth(), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.ok ? ((await res.json()) as T) : null;
}

const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
interface Kyc { pan?: string; account?: string; ifsc?: string; holder?: string; street?: string; city?: string; state?: string; pin?: string }

async function kyc(user: string, k: Kyc, trace: string): Promise<Response> {
  if (!ROUTE) return refuse('PL173');
  const pan = (k.pan ?? '').toUpperCase().trim();
  const ifsc = (k.ifsc ?? '').toUpperCase().trim();
  const account = (k.account ?? '').replace(/\s/g, '');
  const holder = (k.holder ?? '').trim();
  const pin = (k.pin ?? '').trim();
  if (!PAN.test(pan) || !IFSC.test(ifsc) || !/^\d{9,18}$/.test(account) || holder.length < 3 || holder.length > 60
    || !/^\d{6}$/.test(pin) || !(k.street ?? '').trim() || !(k.city ?? '').trim() || !(k.state ?? '').trim()) return refuse('PL168');
  const who = await rpc<{ first_name: string; email: string | null; phone: string | null; account: string | null }>('talk_kyc_start', { p_user: user }, trace);
  if (who.error || !who.data) return fromDb(who.error ?? {});
  let id = who.data.account;
  if (!id) {
    const made = await rzp<{ id?: string }>('POST', '/v2/accounts', {
      email: who.data.email ?? `listener+${user.slice(0, 8)}@mail.pinkilock.com`,
      phone: (who.data.phone ?? '').replace(/^\+91/, '') || undefined,
      type: 'route',
      reference_id: user.replace(/-/g, '').slice(0, 20),
      legal_business_name: holder,
      business_type: 'individual',
      contact_name: holder,
      profile: { category: ROUTE_CATEGORY, subcategory: ROUTE_SUBCATEGORY,
        addresses: { registered: { street1: k.street!.trim().slice(0, 100), street2: k.city!.trim().slice(0, 100), city: k.city!.trim(), state: k.state!.trim(), postal_code: pin, country: 'IN' } } },
      legal_info: { pan },
    });
    if (!made?.id) {
      console.log(JSON.stringify({ event: 'talk.kyc', user, result: 'account_refused', trace }));
      return refuse('PL168');
    }
    id = made.id;
    await rzp('POST', `/v2/accounts/${id}/stakeholders`, { name: holder, email: who.data.email ?? undefined, kyc: { pan } });
  }
  const product = await rzp<{ id?: string }>('POST', `/v2/accounts/${id}/products`, { product_name: 'route', tnc_accepted: true });
  const bank = product?.id
    ? await rzp<{ id?: string }>('PATCH', `/v2/accounts/${id}/products/${product.id}`, { settlements: { account_number: account, ifsc_code: ifsc, beneficiary_name: holder }, tnc_accepted: true })
    : null;
  if (!bank) {
    console.log(JSON.stringify({ event: 'talk.kyc', user, account: id, result: 'bank_refused', trace }));
    return refuse('PL168');
  }
  const done = await rpc('talk_kyc_done', { p_user: user, p_account: id, p_last4: account.slice(-4) }, trace);
  if (done.error) return fromDb(done.error);
  console.log(JSON.stringify({ event: 'talk.kyc', user, account: id, result: 'checking', trace }));
  return json({ ok: true });
}

async function payouts(trace: string): Promise<Response> {
  if (!ROUTE) return json({ sent: 0, note: 'Route is off; payouts wait' });
  const due = await rpc<{ call_id: string; route_account: string; payout: number }[]>('talk_payouts_claim', { p_limit: 20 }, trace);
  let sent = 0;
  for (const p of due.data ?? []) {
    const t = await rzp<{ id?: string }>('POST', '/v1/transfers', { account: p.route_account, amount: p.payout, currency: 'INR', notes: { call: p.call_id } });
    await rpc('talk_payout_done', { p_call: p.call_id, p_transfer: t?.id ?? null }, trace);
    if (t?.id) sent++;
    console.log(JSON.stringify({ event: 'talk.payout', call: p.call_id, result: t?.id ? 'sent' : 'failed', trace }));
  }
  return json({ sent });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return refuse('PC002', 405);
  const trace = (req.headers.get('x-trace-id') ?? '').replace(/[^0-9A-Z]/g, '').slice(0, 8) || 'none';
  const body = (await req.json().catch(() => ({}))) as { action?: string; chat?: string | null; history?: Turn[]; text?: string; call?: string } & Kyc;
  if (body.action === 'status') return json({ ai: !!claude, voice: !!(LK_URL && LK_KEY && LK_SECRET), payouts: ROUTE });

  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  if (body.action === 'payouts') {
    if (!HOOK_SECRET || !sameSecret(bearer, HOOK_SECRET)) return json({ error: 'Not allowed' }, 401);
    return payouts(trace);
  }

  const who = bearer ? await fetch(`${BASE}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${bearer}` } }) : null;
  const user = who?.ok ? ((await who.json()) as { id?: string }) : null;
  if (!user?.id) return json({ code: 'PL001', message: 'Sign in first.' }, 401);

  if (body.action === 'ai') {
    if (!claude) return refuse('PL161');
    const text = typeof body.text === 'string' ? body.text : '';
    const chat = typeof body.chat === 'string' && /^[0-9a-f-]{36}$/.test(body.chat) ? body.chat : null;
    const turn = await rpc<{ chat: string; harm: boolean; charged: number }>('talk_ai_turn', { p_user: user.id, p_chat: chat, p_text: text }, trace);
    if (turn.error || !turn.data) return fromDb(turn.error ?? {});
    const history = Array.isArray(body.history) ? body.history.slice(-16) : [];
    let reply = SAFE_REPLY;
    let harm = turn.data.harm;
    try {
      const out = await companion(history, text, harm);
      reply = out.reply;
      if (out.flagged && !harm) {
        harm = true;
        await rpc('talk_ai_flag', { p_user: user.id, p_chat: turn.data.chat }, trace);
      }
    } catch (e) {
      console.log(JSON.stringify({ event: 'talk.ai', user: user.id, result: 'model_failed', error: e instanceof Error ? e.name : 'error', trace }));
    }
    console.log(JSON.stringify({ event: 'talk.ai', user: user.id, chat: turn.data.chat, harm, charged: turn.data.charged, trace }));
    return json({ chat: turn.data.chat, reply, harm, charged: turn.data.charged });
  }

  if (body.action === 'voice') {
    if (!(LK_URL && LK_KEY && LK_SECRET)) return refuse('PL173');
    const room = await rpc<{ room: string; identity: string; name: string; minutes: number }>('talk_voice_room', { p_user: user.id, p_call: body.call ?? null }, trace);
    if (room.error || !room.data) return fromDb(room.error ?? {});
    const token = await livekitToken(room.data.room, room.data.identity, room.data.name, room.data.minutes);
    console.log(JSON.stringify({ event: 'talk.voice', user: user.id, call: body.call, trace }));
    return json({ url: LK_URL, token });
  }

  if (body.action === 'kyc') return kyc(user.id, body, trace);
  return refuse('PC002');
});
