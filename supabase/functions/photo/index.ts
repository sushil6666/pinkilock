/**
 * photo: adds one photo behind the lock (ROADMAP Phase 4, build plan WP7b, decision D088), or with
 * `?kind=face` the face on the card (D095).
 *
 * The app POSTs the JPEG it made (resized, re-encoded) with the person's own access token. This
 * function:
 *   1. asks Auth who the token belongs to (an unknown or expired token is PL001);
 *   2. strips every bit of metadata from the file (./jpeg.ts): place, phone, time, comments, and
 *      anything after the image. A file that is not a whole JPEG is refused;
 *   3. asks the database for the rules and a row (public.add_photo, service role only: three
 *      photos, six uploads a week, 2 MB, not paused). Its PL code goes back to the app as is;
 *   4. stores the stripped file in the private `photos` bucket at the path the row names. If that
 *      fails, the row is taken back (public.forget_photo).
 * The photo is `pending`: nobody else sees it until a moderator approves it
 * (scripts/moderate.sh photos). No client can write to the bucket; this is the only way in.
 *
 * Deployed with --no-verify-jwt, like the others: the token is checked here, against Auth.
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 * Logs carry the user id, the result and the trace id only, never the picture.
 */
import { stripJpeg } from './jpeg.ts';

const BASE = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
/** The bucket takes 2 MB; anything much larger is not read at all. */
const READ_LIMIT = 3 * 1024 * 1024;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-trace-id, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ code: 'PC002', message: 'POST a photo.' }, 405);
  const trace = (req.headers.get('x-trace-id') ?? '').replace(/[^0-9A-Z]/g, '').slice(0, 8) || 'none';

  // 1. Who is asking.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const who = token ? await fetch(`${BASE}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` } }) : null;
  const user = who?.ok ? ((await who.json()) as { id?: string }) : null;
  if (!user?.id) {
    console.log(JSON.stringify({ event: 'photo', result: 'signed_out', trace }));
    return json({ code: 'PL001', message: 'Sign in first.' }, 401);
  }

  // 2. The file, with nothing in it but the picture.
  const size = Number(req.headers.get('content-length') ?? '0');
  const raw = size > READ_LIMIT ? null : new Uint8Array(await req.arrayBuffer());
  const clean = raw && raw.length <= READ_LIMIT ? stripJpeg(raw) : null;

  // 3. The rules, and a row. `?kind=face` is the photo for the card (D095); the database refuses any
  // other kind, and its rules differ: one face waiting at a time, a new one once a week.
  const kind = new URL(req.url).searchParams.get('kind') === 'face' ? 'face' : 'locked';
  const added = await rpc<{ id: string; path: string }>('add_photo', {
    p_user: user.id, p_bytes: clean?.length ?? raw?.length ?? size, p_jpeg: !!clean, p_kind: kind,
  }, trace);
  if (added.error || !added.data || !clean) {
    console.log(JSON.stringify({ event: 'photo', user: user.id, result: added.error?.code ?? 'refused', trace }));
    return json({ code: added.error?.code ?? 'PC002', message: added.error?.message ?? '' }, 400);
  }

  // 4. The file, where the row says.
  const { id, path } = added.data;
  const stored = await fetch(`${BASE}/storage/v1/object/photos/${path}`, {
    method: 'POST',
    headers: { ...service, 'Content-Type': 'image/jpeg', 'x-upsert': 'false', 'cache-control': 'no-store' },
    body: clean,
  });
  if (!stored.ok) {
    await rpc('forget_photo', { p_id: id }, trace);
    console.log(JSON.stringify({ event: 'photo', user: user.id, result: 'storage_failed', status: stored.status, trace }));
    return json({ code: 'PC002', message: '' }, 502);
  }
  console.log(JSON.stringify({ event: 'photo', user: user.id, photo: id, kind, result: 'pending', bytes: clean.length, trace }));
  return json({ id, status: 'pending' });
});
