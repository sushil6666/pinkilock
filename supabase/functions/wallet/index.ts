/**
 * wallet: top-ups for the credits wallet (D104), through Razorpay (UPI, cards, net banking).
 *
 * The app never sets a price and never says it was paid; this function and the database decide.
 *
 *   POST {action: 'status'}                         is Razorpay set up here? {open, key} (the key id is public)
 *   POST {action: 'order', pack}                    signed in: makes a Razorpay order for the pack's
 *                                                   price (wallet_pack_price) and files it for the
 *                                                   person (wallet_open_order). {order, key, paise, credits}
 *   POST {action: 'verify', order, payment, signature}
 *                                                   signed in: checks Razorpay's checkout signature
 *                                                   (HMAC-SHA256 of "order|payment" with the key
 *                                                   secret), reads the payment from Razorpay, and
 *                                                   credits it once (wallet_paid).
 *   POST from Razorpay (X-Razorpay-Signature)       the webhook: payment.captured and order.paid credit
 *                                                   (wallet_paid, the same once-only path);
 *                                                   refund.processed takes the credits back (wallet_refunded).
 *
 * Razorpay webhook URL: https://<ref>.supabase.co/functions/v1/wallet
 *   events: payment.captured, order.paid, refund.processed
 *
 * Secrets (supabase secrets set ..., from GitHub by .github/workflows/supabase-deploy.yml):
 *   RAZORPAY_KEY_ID          rzp_test_... while testing, rzp_live_... once the account is live.
 *   RAZORPAY_KEY_SECRET      the key's secret. Without both, top-ups are off (PL144) and the app
 *                            says so; rewards and spending still work.
 *   RAZORPAY_WEBHOOK_SECRET  typed into Razorpay's webhook settings. Without it, the webhook is
 *                            refused and only the app's verify step credits.
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 *
 * Logs carry the user id, the order id, the result and the trace, never a card, a UPI id or a name.
 */

const BASE = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') ?? '';
const KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';
const WEBHOOK_SECRET = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') ?? '';
const RAZORPAY = Deno.env.get('RAZORPAY_API_URL') ?? 'https://api.razorpay.com/v1';
const OPEN = !!KEY_ID && !!KEY_SECRET;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-trace-id, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const service = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
const razorpayAuth = () => `Basic ${btoa(`${KEY_ID}:${KEY_SECRET}`)}`;

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

const ID = /^[A-Za-z0-9_]{6,40}$/;

/** Razorpay's own word on a payment: its order, amount (paise) and whether it is captured. */
async function paymentOf(id: string): Promise<{ order_id?: string; amount?: number; status?: string } | null> {
  const res = await fetch(`${RAZORPAY}/payments/${id}`, { headers: { Authorization: razorpayAuth() } });
  return res.ok ? await res.json() : null;
}

async function webhook(req: Request, trace: string): Promise<Response> {
  const raw = new Uint8Array(await req.arrayBuffer());
  const sig = req.headers.get('X-Razorpay-Signature') ?? '';
  if (!WEBHOOK_SECRET || !sameSecret(sig, await hmacHex(WEBHOOK_SECRET, raw))) {
    console.log(JSON.stringify({ event: 'wallet.webhook', result: 'bad_signature', trace }));
    return json({ ok: false }, 401);
  }
  const body = JSON.parse(new TextDecoder().decode(raw)) as {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number } }; refund?: { entity?: { payment_id?: string } } };
  };
  const pay = body.payload?.payment?.entity;
  let result = 'ignored';
  if ((body.event === 'payment.captured' || body.event === 'order.paid') && pay?.id && pay.order_id && typeof pay.amount === 'number') {
    const done = await rpc<string>('wallet_paid', { p_order: pay.order_id, p_payment: pay.id, p_paise: pay.amount }, trace);
    result = done.data ?? done.error?.code ?? 'error';
    if (done.error) return json({ ok: false }, 500);
  } else if (body.event === 'refund.processed') {
    const payment = body.payload?.refund?.entity?.payment_id;
    if (payment) {
      const done = await rpc<string>('wallet_refunded', { p_payment: payment }, trace);
      result = done.data ?? done.error?.code ?? 'error';
      if (done.error) return json({ ok: false }, 500);
    }
  }
  console.log(JSON.stringify({ event: 'wallet.webhook', kind: body.event, order: pay?.order_id, result, trace }));
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ code: 'PC002', message: '' }, 405);
  const trace = (req.headers.get('x-trace-id') ?? '').replace(/[^0-9A-Z]/g, '').slice(0, 8) || 'none';
  if (req.headers.has('X-Razorpay-Signature')) return webhook(req, trace);

  const body = (await req.json().catch(() => ({}))) as { action?: string; pack?: string; order?: string; payment?: string; signature?: string };
  if (body.action === 'status') return json({ open: OPEN, key: OPEN ? KEY_ID : null, test: KEY_ID.startsWith('rzp_test_') });

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const who = token ? await fetch(`${BASE}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` } }) : null;
  const user = who?.ok ? ((await who.json()) as { id?: string }) : null;
  if (!user?.id) return json({ code: 'PL001', message: 'Sign in first.' }, 401);
  if (!OPEN) return json({ code: 'PL144', message: 'Top-ups are not open yet. You can still earn credits.' }, 400);

  if (body.action === 'order') {
    const price = await rpc<number | null>('wallet_pack_price', { p_pack: body.pack ?? '' }, trace);
    if (price.error || !price.data) return json({ code: 'PL136', message: 'Pick a pack from the list.' }, 400);
    const made = await fetch(`${RAZORPAY}/orders`, {
      method: 'POST',
      headers: { Authorization: razorpayAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: price.data, currency: 'INR', receipt: `w_${trace}_${Date.now()}`, notes: { pack: body.pack } }),
    });
    const order = made.ok ? ((await made.json()) as { id?: string }) : null;
    if (!order?.id || !ID.test(order.id)) {
      console.log(JSON.stringify({ event: 'wallet.order', user: user.id, result: 'razorpay_failed', status: made.status, trace }));
      return json({ code: 'PC002', message: '' }, 502);
    }
    const filed = await rpc<{ order: string; paise: number; credits: number }>('wallet_open_order', { p_user: user.id, p_pack: body.pack, p_order: order.id }, trace);
    if (filed.error || !filed.data) return json({ code: filed.error?.code ?? 'PC002', message: filed.error?.message ?? '' }, 400);
    console.log(JSON.stringify({ event: 'wallet.order', user: user.id, order: order.id, pack: body.pack, result: 'created', trace }));
    return json({ ...filed.data, key: KEY_ID });
  }

  if (body.action === 'verify') {
    const { order, payment, signature } = body;
    if (!order || !payment || !signature || !ID.test(order) || !ID.test(payment)) return json({ code: 'PC002', message: '' }, 400);
    const want = await hmacHex(KEY_SECRET, new TextEncoder().encode(`${order}|${payment}`));
    if (!sameSecret(signature, want)) {
      console.log(JSON.stringify({ event: 'wallet.verify', user: user.id, order, result: 'bad_signature', trace }));
      return json({ code: 'PC002', message: '' }, 400);
    }
    const p = await paymentOf(payment);
    if (!p || p.order_id !== order || typeof p.amount !== 'number' || p.status !== 'captured') {
      console.log(JSON.stringify({ event: 'wallet.verify', user: user.id, order, result: 'not_paid', trace }));
      return json({ code: 'PC002', message: '' }, 400);
    }
    const done = await rpc<string>('wallet_paid', { p_order: order, p_payment: payment, p_paise: p.amount }, trace);
    console.log(JSON.stringify({ event: 'wallet.verify', user: user.id, order, result: done.data ?? done.error?.code, trace }));
    if (done.error || (done.data !== 'paid')) return json({ code: 'PC002', message: '' }, 400);
    return json({ ok: true });
  }

  return json({ code: 'PC002', message: '' }, 400);
});
