/**
 * push: drains the notifications outbox to the Expo push service.
 *
 * Called by Postgres (pg_net) whenever a notification is queued and by the every-minute sweep
 * for anything left over. It is the only place a push is ever sent from: the app has no code
 * path to the Expo push API and never sees another person's device token.
 *
 * It trusts the outbox for what to say. Title and body were written in SQL from columns the
 * recipient can already read (supabase/migrations/..._push.sql); this function adds only the
 * invite id and the kind, so that a tap can open the right screen.
 *
 * Secrets (supabase secrets set ...):
 *   PUSH_HOOK_SECRET    shared with Postgres (Vault: push_function_secret). Required.
 *   EXPO_ACCESS_TOKEN   only if "enhanced push security" is on for the Expo account.
 *   EXPO_PUSH_URL       override for tests. Defaults to the real Expo endpoint.
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 *
 * No imports on purpose: it talks to the database over PostgREST with fetch, so there is nothing
 * to download at boot and nothing to keep up to date.
 */

const EXPO_PUSH_URL = Deno.env.get('EXPO_PUSH_URL') ?? 'https://exp.host/--/api/v2/push/send';
const HOOK_SECRET = Deno.env.get('PUSH_HOOK_SECRET') ?? '';
const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN');
const REST = `${Deno.env.get('SUPABASE_URL')}/rest/v1`;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
/** Expo accepts at most 100 messages per request. */
const BATCH = 100;

interface Row { id: number; recipient_id: string; invite_id: string; kind: string; title: string; body: string; trace: string | null }
interface Ticket { status: 'ok' | 'error'; message?: string; details?: { error?: string } }
interface Totals { claimed: number; sent: number; no_device: number; failed: number; tokens_removed: number }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** One PostgREST call as the service role. Throws on anything but success. */
async function rest<T>(method: string, path: string, body?: unknown): Promise<T | null> {
  const quiet = method === 'PATCH' || method === 'DELETE';
  const res = await fetch(`${REST}/${path}`, {
    method,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(quiet ? { Prefer: 'return=minimal' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path.split('?')[0]}: ${res.status} ${text}`);
  return text ? (JSON.parse(text) as T) : null;
}

/** A PostgREST `in.(...)` list, quoted so that the brackets in Expo tokens are safe. */
const inList = (values: (string | number)[]) => `in.(${values.map((v) => encodeURIComponent(`"${v}"`)).join(',')})`;

/** Constant-time, so the secret cannot be guessed a character at a time. */
function sameSecret(given: string, want: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(want);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Hand one chunk to Expo. Returns a ticket per message, or throws if Expo could not be reached. */
async function sendToExpo(chunk: { row: Row; token: string }[]): Promise<Ticket[]> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${EXPO_ACCESS_TOKEN}` } : {}) },
    body: JSON.stringify(chunk.map(({ row, token }) => ({
      to: token, title: row.title, body: row.body, sound: 'default', priority: 'high', channelId: 'promises',
      data: { inviteId: row.invite_id, kind: row.kind },
    }))),
  });
  if (!res.ok) throw new Error(`Expo answered ${res.status}`);
  return ((await res.json()).data ?? []) as Ticket[];
}

/** One claimed batch: look up devices, send, and record what happened to each row. */
async function deliver(rows: Row[], totals: Totals): Promise<void> {
  const people = [...new Set(rows.map((r) => r.recipient_id))];
  const tokens = (await rest<{ token: string; profile_id: string }[]>('GET', `push_tokens?select=token,profile_id&profile_id=${inList(people)}`)) ?? [];
  const byPerson = new Map<string, string[]>();
  for (const t of tokens) byPerson.set(t.profile_id, [...(byPerson.get(t.profile_id) ?? []), t.token]);

  // One message per device. A row with no device is finished straight away.
  const sends: { row: Row; token: string }[] = [];
  const done = new Map<number, string | null>();
  for (const row of rows) {
    const devices = byPerson.get(row.recipient_id) ?? [];
    if (!devices.length) {
      done.set(row.id, 'no_device');
      totals.no_device++;
    }
    for (const token of devices) sends.push({ row, token });
  }

  const delivered = new Set<number>();
  const errors = new Map<number, string>();
  const dead: string[] = [];
  for (let i = 0; i < sends.length; i += BATCH) {
    const chunk = sends.slice(i, i + BATCH);
    try {
      const tickets = await sendToExpo(chunk);
      chunk.forEach(({ row, token }, k) => {
        const ticket = tickets[k];
        if (ticket?.status === 'ok') return void delivered.add(row.id);
        const why = ticket?.details?.error ?? ticket?.message ?? 'no ticket';
        // The app was uninstalled or the token rotated: stop sending to it.
        if (why === 'DeviceNotRegistered') dead.push(token);
        errors.set(row.id, why);
      });
    } catch (e) {
      // Expo unreachable: these rows stay unsent and the sweep retries them (5 attempts at most).
      chunk.forEach(({ row }) => errors.set(row.id, e instanceof Error ? e.message : 'send failed'));
    }
  }

  // A row is finished once any of the person's devices took it, or once none ever will.
  for (const id of delivered) done.set(id, null);
  for (const [id, why] of errors) {
    if (delivered.has(id)) continue;
    totals.failed++;
    if (why === 'DeviceNotRegistered') done.set(id, why);
    else await rest('PATCH', `notifications?id=eq.${id}`, { last_error: why });
  }
  totals.sent += delivered.size;

  // One line per notification in the function's log, with the trace id of the action that caused
  // it (OPERATIONS.md, "Trace a bug"). Ids and outcomes only: never the title, the body or a token.
  for (const row of rows) {
    const outcome = delivered.has(row.id) ? 'sent' : done.get(row.id) ?? errors.get(row.id) ?? 'unknown';
    console.log(JSON.stringify({ event: 'push', notification: row.id, invite: row.invite_id, kind: row.kind, trace: row.trace, outcome }));
  }

  const now = new Date().toISOString();
  for (const outcome of new Set(done.values())) {
    const ids = [...done].filter(([, why]) => why === outcome).map(([id]) => id);
    await rest('PATCH', `notifications?id=${inList(ids)}`, { sent_at: now, last_error: outcome });
  }
  if (dead.length) {
    await rest('DELETE', `push_tokens?token=${inList(dead)}`);
    totals.tokens_removed += dead.length;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const given = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  if (!HOOK_SECRET || !sameSecret(given, HOOK_SECRET)) return json({ error: 'Not allowed' }, 401);

  const totals: Totals = { claimed: 0, sent: 0, no_device: 0, failed: 0, tokens_removed: 0 };
  try {
    // Keep going until the outbox is empty, so that one wake-up covers a burst.
    for (let round = 0; round < 10; round++) {
      // Claiming is atomic in Postgres: two overlapping runs can never take the same row.
      const rows = (await rest<Row[]>('POST', 'rpc/claim_notifications', { p_limit: BATCH })) ?? [];
      if (!rows.length) break;
      totals.claimed += rows.length;
      await deliver(rows, totals);
      if (rows.length < BATCH) break;
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'failed', ...totals }, 500);
  }
  return json(totals);
});
