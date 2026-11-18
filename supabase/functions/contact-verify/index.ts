/**
 * contact-verify: proves a contact handle belongs to the person who gave it (D075).
 *
 * The app gives a code (public.start_contact_check) and opens a chat with Pinkilock's WhatsApp
 * number or Instagram account. The person sends the code from the account they gave. Meta calls
 * this function with the message; it checks Meta's signature, works out who sent it (the WhatsApp
 * number, or the Instagram username looked up from the sender id) and asks the database
 * (public.confirm_contact_code, service role only) whether that sender holds that code. The
 * database decides; this function only carries what Meta says.
 *
 * Meta webhook URL: https://<ref>.supabase.co/functions/v1/contact-verify
 *
 * Secrets (supabase secrets set ..., from GitHub by .github/workflows/supabase-deploy.yml):
 *   META_APP_SECRET     the Meta app's secret; Meta signs every call with it. Required. Two apps
 *                       (one for WhatsApp, one for Instagram) can be given comma-separated.
 *   META_VERIFY_TOKEN   any string, also typed into Meta's webhook settings. Required.
 *   WHATSAPP_TOKEN      to answer on WhatsApp ("Verified"). Optional.
 *   INSTAGRAM_TOKEN     to look up who sent an Instagram message, and to answer. Needed for Instagram.
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 *
 * Logs carry the result only, never a number, a username or a message.
 */

const REST = `${Deno.env.get('SUPABASE_URL')}/rest/v1`;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const APP_SECRETS = (Deno.env.get('META_APP_SECRET') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const VERIFY_TOKEN = Deno.env.get('META_VERIFY_TOKEN') ?? '';
const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? '';
const INSTAGRAM_TOKEN = Deno.env.get('INSTAGRAM_TOKEN') ?? '';
const GRAPH = Deno.env.get('META_GRAPH_URL') ?? 'https://graph.facebook.com/v21.0';
const IG_GRAPH = Deno.env.get('INSTAGRAM_GRAPH_URL') ?? 'https://graph.instagram.com/v21.0';

type Kind = 'WhatsApp' | 'Instagram';
type Result = 'verified' | 'mismatch' | 'expired' | 'no_code';
interface Incoming { kind: Kind; sender: string; text: string; reply: (text: string) => Promise<void> }

const REPLIES: Record<Result, string | null> = {
  verified: 'Done. Your handle is verified on Pinkilock.',
  mismatch: 'That code is for a different account. Send it from the one you gave Pinkilock.',
  expired: 'That code has run out. Tap Verify in Pinkilock for a new one.',
  no_code: null,
};

function sameSecret(given: string, want: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(want);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacHex(secret: string, body: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, body));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Meta signs the raw body: X-Hub-Signature-256: sha256=<hex>. */
async function signedByMeta(header: string | null, body: Uint8Array): Promise<boolean> {
  if (!header?.startsWith('sha256=')) return false;
  for (const secret of APP_SECRETS) if (sameSecret(header.slice(7), await hmacHex(secret, body))) return true;
  return false;
}

async function confirm(kind: Kind, sender: string, text: string): Promise<Result> {
  const res = await fetch(`${REST}/rpc/confirm_contact_code`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_kind: kind, p_sender: sender, p_text: text }),
  });
  if (!res.ok) throw new Error(`confirm_contact_code: ${res.status}`);
  return (await res.json()) as Result;
}

async function post(url: string, token: string, body: unknown): Promise<void> {
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) console.warn(JSON.stringify({ at: 'reply', status: res.status }));
}

/** The messages in one call from Meta, from either product. */
// deno-lint-ignore no-explicit-any
async function messagesIn(payload: any): Promise<Incoming[]> {
  const out: Incoming[] = [];
  if (payload?.object === 'whatsapp_business_account') {
    for (const entry of payload.entry ?? []) for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const phoneId = value.metadata?.phone_number_id;
      for (const m of value.messages ?? []) {
        if (m.type !== 'text' || !m.from) continue;
        out.push({
          kind: 'WhatsApp', sender: String(m.from), text: String(m.text?.body ?? ''),
          reply: async (text) => {
            if (WHATSAPP_TOKEN && phoneId) await post(`${GRAPH}/${phoneId}/messages`, WHATSAPP_TOKEN, { messaging_product: 'whatsapp', to: m.from, type: 'text', text: { body: text } });
          },
        });
      }
    }
  } else if (payload?.object === 'instagram') {
    for (const entry of payload.entry ?? []) for (const e of entry.messaging ?? []) {
      if (!e.sender?.id || e.message?.is_echo || typeof e.message?.text !== 'string' || !INSTAGRAM_TOKEN) continue;
      // The webhook names the sender by an id; the username comes from the profile API.
      const res = await fetch(`${IG_GRAPH}/${encodeURIComponent(e.sender.id)}?fields=username&access_token=${encodeURIComponent(INSTAGRAM_TOKEN)}`);
      const username = res.ok ? (await res.json()).username : null;
      if (!username) { console.warn(JSON.stringify({ at: 'instagram_lookup', status: res.status })); continue; }
      out.push({
        kind: 'Instagram', sender: String(username), text: e.message.text,
        reply: (text) => post(`${IG_GRAPH}/me/messages`, INSTAGRAM_TOKEN, { recipient: { id: e.sender.id }, message: { text } }),
      });
    }
  }
  return out;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  // Meta checks the URL once, when the webhook is set up.
  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && !!VERIFY_TOKEN && sameSecret(url.searchParams.get('hub.verify_token') ?? '', VERIFY_TOKEN);
    return ok ? new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 }) : new Response('forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const body = new Uint8Array(await req.arrayBuffer());
  if (!APP_SECRETS.length || !(await signedByMeta(req.headers.get('x-hub-signature-256'), body))) return new Response('forbidden', { status: 403 });

  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder().decode(body)); } catch { return new Response('bad request', { status: 400 }); }

  const counts: Record<string, number> = {};
  try {
    for (const m of await messagesIn(payload)) {
      const result = await confirm(m.kind, m.sender, m.text);
      counts[`${m.kind}:${result}`] = (counts[`${m.kind}:${result}`] ?? 0) + 1;
      const reply = REPLIES[result];
      if (reply) await m.reply(reply);
    }
  } catch (e) {
    // Meta retries a call that fails, which is what we want when the database could not be reached.
    console.error(JSON.stringify({ at: 'contact_verify', error: String((e as Error).message ?? e).slice(0, 200) }));
    return new Response('retry', { status: 500 });
  }
  console.log(JSON.stringify({ at: 'contact_verify', ...counts }));
  return new Response('ok', { status: 200 });
});
