/**
 * LiveKit, shared by the voice-call functions (Talk mode in `talk`, Spicy calls in `voice`).
 *
 * No LiveKit SDK: an access token is an HS256 JWT signed with the API secret, and LiveKit signs
 * each webhook the same way, with a `sha256` claim that is the hash of the body.
 *
 * Voice only, always: a token may publish the microphone and nothing else (no camera, no screen,
 * no data channel), and nothing here or in LiveKit's settings starts a recording or an egress.
 *
 * Secrets: LIVEKIT_URL (wss://<project>.livekit.cloud), LIVEKIT_API_KEY, LIVEKIT_API_SECRET.
 */

export const LK_URL = Deno.env.get('LIVEKIT_URL') ?? '';
const LK_KEY = Deno.env.get('LIVEKIT_API_KEY') ?? '';
const LK_SECRET = Deno.env.get('LIVEKIT_API_SECRET') ?? '';
/** All three secrets are set. */
export const VOICE_ON = !!(LK_URL && LK_KEY && LK_SECRET);

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

async function hmac(data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(LK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
}

function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** A token for one room, for `minutes` (plus a little), that can only speak and listen. */
export async function livekitToken(room: string, identity: string, name: string, minutes: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = enc({ alg: 'HS256', typ: 'JWT' });
  const body = enc({
    iss: LK_KEY, sub: identity, name, nbf: now - 10, exp: now + (minutes + 10) * 60,
    video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false, canPublishSources: ['microphone'] },
  });
  return `${head}.${body}.${b64url(await hmac(`${head}.${body}`))}`;
}

export interface VoiceEvent {
  event: 'participant_joined' | 'participant_left' | 'room_finished' | string;
  room: string;
  /** The participant's identity: the user id the token was made for. */
  identity: string | null;
  /** When LiveKit saw it. */
  at: Date;
}

/**
 * A webhook from LiveKit, checked: the Authorization header is a JWT from our API key, signed with
 * our secret, not expired, whose `sha256` is the body's hash. Null for anything else.
 */
export async function verifyWebhook(raw: Uint8Array, authorization: string): Promise<VoiceEvent | null> {
  if (!VOICE_ON) return null;
  const parts = authorization.replace(/^Bearer /, '').split('.');
  if (parts.length !== 3) return null;
  if (!same(unb64url(parts[2]), await hmac(`${parts[0]}.${parts[1]}`))) return null;
  let claims: { iss?: string; exp?: number; nbf?: number; sha256?: string };
  try {
    claims = JSON.parse(new TextDecoder().decode(unb64url(parts[1])));
  } catch {
    return null;
  }
  const now = Date.now() / 1000;
  if (claims.iss !== LK_KEY || (claims.exp && claims.exp < now) || (claims.nbf && claims.nbf > now + 60)) return null;
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', raw));
  const want = btoa(String.fromCharCode(...hash));
  if (!claims.sha256 || !same(new TextEncoder().encode(claims.sha256), new TextEncoder().encode(want))) return null;
  let body: { event?: string; room?: { name?: string }; participant?: { identity?: string }; createdAt?: number | string };
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return null;
  }
  const seconds = Number(body.createdAt);
  return {
    event: body.event ?? '',
    room: body.room?.name ?? '',
    identity: body.participant?.identity ?? null,
    at: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date(),
  };
}
