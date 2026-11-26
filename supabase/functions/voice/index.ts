/**
 * voice: in-app voice calls for Spicy mode (D111), and the one LiveKit webhook for the project.
 *
 *   POST {action: 'spicy', other}       signed in: a LiveKit token for my call with `other`, if
 *                                       spicy_voice_room says I may join it now (Spicy open, both
 *                                       yes, unlocked, a set call whose timer is open). Microphone
 *                                       only, never recorded. {url, token}. PL179 when voice is not
 *                                       set up here.
 *   POST from LiveKit (application/webhook+json, signed)
 *                                       participant_joined, participant_left and room_finished.
 *                                       Rooms named spicy_<call id> go to spicy_voice_event, which
 *                                       turns them into the call's minutes. talk_<call id> rooms go to
 *                                       talk_voice_event once Talk mode has one; until then they are
 *                                       acknowledged and dropped. Anything else is ignored.
 *
 * LiveKit webhook URL (LiveKit Cloud > Settings > Webhooks): https://<ref>.supabase.co/functions/v1/voice
 * signed with the same API key as the tokens.
 *
 * Secrets: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET (set by .github/workflows/supabase-deploy.yml).
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 *
 * Logs carry ids, events, results and traces. Nothing of a call is heard, kept or logged.
 */
import { LK_URL, VOICE_ON, livekitToken, verifyWebhook } from '../_shared/livekit.ts';

const BASE = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-trace-id, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const service = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface DbError { code?: string; message?: string }
async function rpc<T>(fn: string, args: unknown, trace: string): Promise<{ data?: T; error?: DbError; status: number }> {
  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...service, 'Content-Type': 'application/json', 'x-trace-id': trace },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => null);
  return res.ok ? { data: body as T, status: res.status } : { error: (body ?? {}) as DbError, status: res.status };
}

async function webhook(req: Request, trace: string): Promise<Response> {
  const raw = new Uint8Array(await req.arrayBuffer());
  const e = await verifyWebhook(raw, req.headers.get('Authorization') ?? '');
  if (!e) {
    console.log(JSON.stringify({ event: 'voice.webhook', result: 'bad_signature', trace }));
    return json({ ok: false }, 401);
  }
  if (!['participant_joined', 'participant_left', 'room_finished'].includes(e.event)) return json({ ok: true });
  const user = e.identity && UUID.test(e.identity) ? e.identity : null;
  let result = 'ignored';
  if (e.room.startsWith('spicy_')) {
    const done = await rpc<string>('spicy_voice_event', { p_room: e.room, p_user: user, p_event: e.event, p_at: e.at.toISOString() }, trace);
    if (done.error) {
      console.log(JSON.stringify({ event: 'voice.webhook', kind: e.event, result: done.error.code ?? 'error', trace }));
      return json({ ok: false }, 500);
    }
    result = done.data ?? 'ignored';
  } else if (e.room.startsWith('talk_')) {
    // Talk mode counts minutes from the app's check-ins for now. Once it adds talk_voice_event,
    // its rooms go there; until then (404 from PostgREST) the event is acknowledged and dropped.
    const done = await rpc<string>('talk_voice_event', { p_room: e.room, p_user: user, p_event: e.event, p_at: e.at.toISOString() }, trace);
    result = done.data ?? (done.status === 404 ? 'talk_not_counted' : done.error?.code ?? 'error');
  }
  console.log(JSON.stringify({ event: 'voice.webhook', kind: e.event, room: e.room, user, result, trace }));
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ code: 'PC002', message: '' }, 405);
  const trace = (req.headers.get('x-trace-id') ?? '').replace(/[^0-9A-Z]/g, '').slice(0, 8) || 'none';
  if ((req.headers.get('Content-Type') ?? '').startsWith('application/webhook+json')) return webhook(req, trace);

  const body = (await req.json().catch(() => ({}))) as { action?: string; other?: string };
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const who = bearer ? await fetch(`${BASE}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${bearer}` } }) : null;
  const user = who?.ok ? ((await who.json()) as { id?: string }) : null;
  if (!user?.id) return json({ code: 'PL001', message: 'Sign in first.' }, 401);

  if (body.action === 'spicy') {
    if (!VOICE_ON) return json({ code: 'PL179', message: 'In-app calls are not switched on yet.' }, 400);
    if (!body.other || !UUID.test(body.other)) return json({ code: 'PL150', message: 'There is no call to do that on right now.' }, 400);
    const room = await rpc<{ room: string; identity: string; minutes: number }>('spicy_voice_room', { p_user: user.id, p_other: body.other }, trace);
    if (room.error || !room.data) return json({ code: room.error?.code ?? 'PC002', message: room.error?.message ?? '' }, 400);
    const token = await livekitToken(room.data.room, room.data.identity, '', room.data.minutes);
    console.log(JSON.stringify({ event: 'voice.spicy', user: user.id, room: room.data.room, trace }));
    return json({ url: LK_URL, token });
  }
  return json({ code: 'PC002', message: '' }, 400);
});
