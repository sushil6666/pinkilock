/**
 * The live backend: Supabase Auth, Postgres behind RLS, and Realtime.
 *
 * Every promise write is one rpc() to a function in supabase/migrations; every read goes through
 * Row-Level Security, so this file contains no access rules of its own: a block, for instance,
 * simply makes rows stop coming back. Sign-in starts anonymous (a real auth.uid() with zero
 * friction); linking a phone number later keeps the same user id, so no row changes.
 *
 * Nothing here imports React Native: the session store is passed in (src/services/index.ts gives
 * it AsyncStorage), so tests/live can drive this exact file from Node as two separate people.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError, RESYNC_CODES, isErrorCode, newTrace } from '../../domain/errors';
import { ideaOf } from '../../domain/ideas';
import { CHECK_IN_CLOSES_AFTER, isDouble, otherId, peopleOf } from '../../domain/invites';
import type { Account, BlockedPerson, CodeKind, ContactCheck, Invite, MyContact, MyPhoto, PickedPhoto, Profile, Reveal } from '../../domain/types';
import { log, quiet } from '../../lib/log';
import { isMood, type NoteKind, type SelfLove } from '../../domain/selfLove';
import { MAX_CALLS, isCallMinutes, noCall, type CallAnswer, type CallOutcome, type CallStatus, type SpicyCall } from '../../domain/calls';
import { isBoundary, type Spicy, type SpicyPlan } from '../../domain/spicy';
import { SPICY_QUIZ, type QuizQuestion, type QuizResult, type SpicyTerms } from '../../domain/spicyQuiz';
import {
  ACCEPTS, SEXES, TOPICS, WANTS, aiHistory, checkAiMessage, checkKyc, checkListener, emptyTalk, referralCode,
  type Accepts, type ListenerCard, type ListenerStatus, type Sex, type Talk, type TalkCallEnd, type TalkOpen, type Topic, type Want,
} from '../../domain/talk';
import { REWARD_KINDS, TREAT_ITEMS, emptyWallet, topUpsHere, type LedgerKind, type RewardKind, type TreatItem, type TreatPartner, type Wallet } from '../../domain/wallet';
import type { openCheckout } from '../../lib/razorpay';
import type { Backend, BackendEvent, Changes, Notice, Snapshot } from '../backend';
import { t } from '../../i18n';
import { activeTrace, tracedAll } from '../traceScope';

type Row = Record<string, any>;

const ms = (t: string | null): number | null => (t ? new Date(t).getTime() : null);

/** my_self_love() and its siblings, as the app holds it. */
function selfLoveFrom(raw: unknown): SelfLove {
  const r = (raw ?? {}) as { today?: string; moods?: { day: string; mood: string }[]; notes?: { id: number; kind: NoteKind; body: string; day: string; at: string }[]; paused_until?: string | null; reset?: { started: string; done: number[] } | null };
  return {
    today: r.today ?? new Date().toISOString().slice(0, 10),
    moods: (r.moods ?? []).filter((m) => isMood(m.mood)).map((m) => ({ day: m.day, mood: m.mood as SelfLove['moods'][number]['mood'] })),
    notes: (r.notes ?? []).map((n) => ({ id: String(n.id), kind: n.kind, body: n.body, day: n.day, at: ms(n.at) ?? 0 })),
    pausedUntil: ms(r.paused_until ?? null),
    reset: r.reset ? { started: r.reset.started, done: r.reset.done ?? [] } : null,
  };
}

/** my_spicy() and its siblings. */
function spicyFrom(raw: unknown): Spicy {
  const r = (raw ?? {}) as { on?: boolean; discord?: string | null; telegram?: string | null; signal?: string | null; boundaries?: string[]; since?: string | null };
  return { on: !!r.on, discord: r.discord ?? null, telegram: r.telegram ?? null, signal: r.signal ?? null, boundaries: (r.boundaries ?? []).filter(isBoundary), since: ms(r.since ?? null) };
}

/** spicy_terms(). */
function spicyTermsFrom(raw: unknown): SpicyTerms {
  const r = (raw ?? {}) as { version?: number; passed?: boolean; passed_at?: string | null; outdated?: boolean };
  return { version: r.version ?? 0, passed: !!r.passed, passedAt: ms(r.passed_at ?? null), outdated: !!r.outdated };
}

/** pass_spicy_quiz(). */
function quizResultFrom(raw: unknown): QuizResult {
  const r = (raw ?? {}) as { passed?: boolean; wrong?: string[] };
  const ids: readonly string[] = SPICY_QUIZ.map((q) => q.id);
  return { passed: !!r.passed, wrong: (r.wrong ?? []).filter((w): w is QuizQuestion => ids.includes(w)) };
}

/** spicy_with() and spicy_yes(). */
function spicyPlanFrom(raw: unknown): SpicyPlan {
  const r = (raw ?? {}) as { open?: boolean; my_yes?: boolean; mutual?: boolean; their_boundaries?: string[]; unlock?: { mine?: number; theirs?: number; done?: boolean }; kept_call?: boolean; my_share?: boolean; discord?: string | null; telegram?: string | null; signal?: string | null };
  const unlock = { mine: r.unlock?.mine ?? 0, theirs: r.unlock?.theirs ?? 0, done: !!r.unlock?.done };
  return { open: !!r.open, myYes: !!r.my_yes, mutual: !!r.mutual, theirBoundaries: (r.their_boundaries ?? []).filter(isBoundary), unlock, keptCall: !!r.kept_call, myShare: !!r.my_share, discord: r.discord ?? null, telegram: r.telegram ?? null, signal: r.signal ?? null };
}

/** spicy_call() and its siblings (D106). */
function callFrom(raw: unknown): SpicyCall {
  const r = (raw ?? {}) as Record<string, unknown>;
  const list = (x: unknown) => (Array.isArray(x) ? x.map((v) => ms(String(v)) ?? 0).filter(Boolean) : []);
  const mins = (x: unknown) => (isCallMinutes(x) ? x : null);
  const fault = r.fault === 'me' || r.fault === 'them' || r.fault === 'both' ? r.fault : null;
  const answer = r.my_answer === 'talked' || r.my_answer === 'they_missed' || r.my_answer === 'i_missed' ? (r.my_answer as CallAnswer) : null;
  return {
    ...noCall,
    id: typeof r.id === 'string' ? r.id : null,
    status: (['picking', 'set', 'asking', 'done'].includes(String(r.status)) ? r.status : 'none') as CallStatus,
    mySlots: list(r.my_slots), theirSlots: list(r.their_slots), myMinutes: mins(r.my_minutes), theirMinutes: mins(r.their_minutes),
    noOverlap: !!r.no_overlap, startsAt: ms((r.starts_at as string | null) ?? null), minutes: typeof r.minutes === 'number' ? r.minutes : null,
    together: typeof r.together === 'number' ? r.together : 0, myStarted: !!r.my_started, theirStarted: !!r.their_started,
    meHere: !!r.me_here, theyHere: !!r.they_here, myEnded: !!r.my_ended, voice: !!r.voice, meOnCall: !!r.me_on_call, theyOnCall: !!r.they_on_call, canMoveFree: !!r.can_move_free, myAnswer: answer,
    answerUntil: ms((r.answer_until as string | null) ?? null), outcome: (r.outcome as CallOutcome | null) ?? null, fault,
    refunded: typeof r.refunded === 'number' ? r.refunded : 0, stoppedByMe: !!r.stopped_by_me,
    callsLeft: typeof r.calls_left === 'number' ? r.calls_left : MAX_CALLS,
  };
}

/** talk_state() and its siblings (D108). */
function talkFrom(raw: unknown, open: TalkOpen): Talk {
  type RawCall = { id: string; status: string; listening: boolean; name: string; length: number; free: boolean; started_at: string | null; together: number;
    they_here: boolean; end: string | null; charged: number; refunded: number };
  type RawListener = { status: string; first_name: string; sex: string; accepts: string; topics: string[]; available_until: string | null; code_version: number;
    bank_last4: string | null; calls: number; paid_out: number; pending: number };
  const r = (raw ?? {}) as {
    sex?: string | null; want?: string; pass_until?: string | null; ai_today?: number; free_call?: string; free_reason?: string | null;
    profile?: { face?: boolean; handle?: boolean; plans?: boolean }; referral_code?: string; friends_joined?: number; friends_verified?: number;
    paid?: number; balance?: number; listener?: RawListener | null; call?: RawCall | null;
  };
  const sex = (x: unknown): Sex => (SEXES.includes(x as Sex) ? (x as Sex) : 'unsaid');
  const l = r.listener;
  const c = r.call;
  return {
    ...emptyTalk(),
    sex: r.sex ? sex(r.sex) : null,
    want: WANTS.includes(r.want as Want) ? (r.want as Want) : 'anyone',
    passUntil: ms(r.pass_until ?? null), aiToday: r.ai_today ?? 0,
    freeCall: r.free_call === 'ready' || r.free_call === 'used' ? r.free_call : 'locked',
    freeReason: r.free_reason === 'referral' || r.free_reason === 'profile' ? r.free_reason : null,
    profile: { face: !!r.profile?.face, handle: !!r.profile?.handle, plans: !!r.profile?.plans },
    referralCode: r.referral_code ?? '', friendsJoined: r.friends_joined ?? 0, friendsVerified: r.friends_verified ?? 0,
    paid: r.paid ?? 0, balance: r.balance ?? 0,
    listener: l ? {
      status: l.status as ListenerStatus, firstName: l.first_name, sex: sex(l.sex), accepts: ACCEPTS.includes(l.accepts as Accepts) ? (l.accepts as Accepts) : 'anyone',
      topics: (l.topics ?? []).filter((x): x is Topic => (TOPICS as readonly string[]).includes(x)), availableUntil: ms(l.available_until), codeVersion: l.code_version,
      bankLast4: l.bank_last4, calls: l.calls ?? 0, paidOut: l.paid_out ?? 0, pending: l.pending ?? 0,
    } : null,
    call: c ? {
      id: c.id, status: c.status === 'live' || c.status === 'done' ? c.status : 'ringing', listening: !!c.listening, name: c.name ?? '', length: c.length, free: !!c.free,
      startedAt: ms(c.started_at), together: c.together ?? 0, theyHere: !!c.they_here, end: (c.end as TalkCallEnd | null) ?? null, charged: c.charged ?? 0, refunded: c.refunded ?? 0,
    } : null,
    open,
  };
}

/** my_wallet() and its siblings (D104). */
function walletFrom(raw: unknown): Wallet {
  type RawTreat = { invite: string; item: string; credits: number; status: string; mine: boolean; partner: string; code: string | null; until: string | null };
  const r = (raw ?? {}) as {
    paid?: number; earned?: number; boost_until?: string | null; extra_asks?: number; stakes?: Record<string, number>; streak?: number; had?: string[];
    vouch_rewards?: number; kept_this_week?: number; treats?: RawTreat[]; history?: { id: number; kind: string; credits: number; reward: string | null; at: string }[];
    gold?: boolean; gold_until?: string | null; boosts?: number; boost_lapses?: string | null;
  };
  const isReward = (k: unknown): k is RewardKind => (REWARD_KINDS as readonly unknown[]).includes(k);
  return {
    ...emptyWallet,
    paid: r.paid ?? 0, earned: r.earned ?? 0, boostUntil: ms(r.boost_until ?? null), extraAsks: r.extra_asks ?? 0, stakes: r.stakes ?? {},
    streak: r.streak ?? 0, had: (r.had ?? []).filter(isReward), vouchRewards: r.vouch_rewards ?? 0, keptThisWeek: r.kept_this_week ?? 0,
    treats: (r.treats ?? []).filter((x) => (TREAT_ITEMS as readonly string[]).includes(x.item)).map((x) => ({
      inviteId: x.invite, item: x.item as TreatItem, credits: x.credits, status: x.status as Wallet['treats'][number]['status'], mine: !!x.mine,
      partner: x.partner, code: x.code ?? null, until: ms(x.until ?? null),
    })),
    history: (r.history ?? []).map((h) => ({ id: String(h.id), kind: h.kind as LedgerKind, credits: h.credits, at: ms(h.at) ?? 0, reward: isReward(h.reward) ? h.reward : undefined })),
    gold: !!r.gold, goldUntil: ms(r.gold_until ?? null), boosts: r.boosts ?? 0, boostLapses: ms(r.boost_lapses ?? null),
  };
}

function toInvite(r: Row): Invite {
  return {
    id: r.id, fromId: r.from_id, toId: r.to_id, ideaId: r.idea_id, startsAt: ms(r.starts_at)!, minutes: r.minutes,
    place: r.place, note: r.note, status: r.status, createdAt: ms(r.created_at)!, expiresAt: ms(r.expires_at)!,
    firstPinkyBy: r.first_pinky_by, lockedAt: ms(r.locked_at), checkIns: r.check_ins ?? [], flakedBy: r.flaked_by,
    declinedBy: r.declined_by, resolvedAt: ms(r.resolved_at),
    fromFriendId: r.from_friend ?? null, toFriendId: r.to_friend ?? null, pinkies: r.pinkies ?? [],
  };
}

function toProfile(r: Row): Profile {
  return {
    id: r.id, name: r.name, age: r.age, city: r.city, country: r.country ?? undefined, area: r.area, pronouns: r.pronouns, tagline: r.tagline,
    vibes: r.vibes ?? [], ideaIds: r.idea_ids ?? [], palette: [r.palette?.[0] ?? '#F6F6F1', r.palette?.[1] ?? '#3A3A44'],
    glyph: r.glyph, kept: r.kept ?? 0, flaked: r.flaked ?? 0, trustScore: r.trust_score ?? 100, distanceKm: 0,
    photoCount: r.photo_count ?? 0,
    answerMinutes: r.median_answer_minutes == null ? null : Number(r.median_answer_minutes),
    freeWindows: r.free_windows ?? [],
    vouchCount: r.vouch_count ?? 0,
    vouchPhrases: r.vouch_phrases ?? [],
    hasDuo: !!r.has_duo,
    pinkGold: !!r.pink_gold,
  };
}

/** Where the session is kept between launches: AsyncStorage on a phone, memory in tests. */
export interface SessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** GoTrue's words for the sign-in code cases, in the app's voice, with a code each. */
function codeError(message: string, kind: CodeKind): AppError {
  const m = message.toLowerCase();
  const what = kind === 'phone' ? 'number' : 'email address';
  if (kind === 'phone' && (m.includes('provider') || ((m.includes('sms') || m.includes('phone')) && m.includes('disabled'))))
    return new AppError('PA001');
  if (kind === 'email' && (m.includes('email') && (m.includes('disabled') || m.includes('not enabled'))))
    return new AppError('PA002');
  if (m.includes('invalid') && m.includes('format')) return new AppError('PA003', `That does not look like a ${kind === 'phone' ? 'phone number' : 'email address'}.`);
  if (m.includes('already') && (m.includes('registered') || m.includes('exists')))
    return new AppError('PA004', `That ${what} is already on another account. Sign in with it instead.`);
  if (m.includes('signups not allowed') || m.includes('user not found'))
    return new AppError('PA005', `We could not find an account with that ${what}. Create one first, then add it from the Me tab.`);
  if (m.includes('expired') || (m.includes('invalid') && (m.includes('otp') || m.includes('token'))))
    return new AppError('PA006');
  if (m.includes('rate') || m.includes('seconds')) return new AppError('PA007');
  if (m.includes('fetch') || m.includes('network')) return new AppError('PC001');
  // GoTrue said something we have no words for. Its text is not shown or reported.
  return new AppError('PA009');
}

/**
 * A PostgREST error as an AppError. Our functions raise with a PLnnn SQLSTATE and that code is
 * kept. No code at all means the request never reached the server. Anything else is a server
 * error that is not ours: its text can quote row values, so it is neither shown nor reported.
 */
function fromServer(err: { message: string; code?: string }, trace: string): AppError {
  if (isErrorCode(err.code) && err.code.startsWith('PL')) return new AppError(err.code, err.message, trace);
  if (!err.code) return new AppError('PC001', undefined, trace);
  log.warn('server.error', { sqlstate: err.code, trace });
  return new AppError('PC002', undefined, trace);
}

/** An id about to be written into a PostgREST filter string: only the characters ids use (route params come from outside). */
function safeId(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new AppError('PC004', 'That link is not valid.');
  return id;
}

const emptySnapshot = (): Snapshot => ({ me: null, myContact: null, profiles: [], invites: [], passedIds: [] });

export interface SupabaseOptions {
  /** A captcha token for Auth (src/lib/captcha.ts); undefined while captcha is off. */
  captcha?: () => Promise<string | undefined>;
  /**
   * The app's Platform.OS and Razorpay Checkout (src/lib/razorpay.ts), passed in so that this file
   * never imports React Native and still loads in plain Node (tests/live). Left out, top-ups are off.
   */
  platform?: string;
  checkout?: typeof openCheckout;
}

export function createSupabaseBackend(url: string, anonKey: string, storage: SessionStorage, options: SupabaseOptions = {}): Backend {
  const captcha = options.captcha ?? (async () => undefined);
  const platform = options.platform ?? 'node';
  const checkout = options.checkout;
  const db: SupabaseClient = createClient(url, anonKey, {
    auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  });
  const listeners = new Set<(e: BackendEvent) => void>();
  const known = new Map<string, Invite>();
  const names = new Map<string, string>();
  /** People who reached me only through discover(): RLS will not return them, so a re-read must not call them gone. */
  const discovered = new Set<string>();
  let meId = '';
  let live = false;

  function check<T>(res: { data: T | null; error: { message: string; code?: string } | null }, trace: string = activeTrace() ?? newTrace()): T {
    if (res.error) throw fromServer(res.error, trace);
    return res.data as T;
  }

  /**
   * One call to a database function, with the tap's trace id in the `x-trace-id` header (a fresh one
   * outside a tap). The server stamps it on every event and push the call causes; a failure carries
   * the same id.
   */
  async function rpc<T = unknown>(fn: string, args?: Row): Promise<T> {
    const trace = activeTrace() ?? newTrace();
    log.info('rpc', { fn, trace });
    const res = await db.rpc(fn, args).setHeader('x-trace-id', trace);
    return check(res as { data: T | null; error: { message: string; code?: string } | null }, trace);
  }

  /**
   * Photos (D088). Rows come back only where RLS allows (mine; theirs once approved and revealed),
   * and Storage signs a file only where its row is readable. Links last ten minutes and are never
   * kept: each screen asks again.
   */
  async function photosOf(owner: string, kind: 'locked' | 'face' = 'locked'): Promise<MyPhoto[]> {
    const rows = check(await db.from('photos').select('id, path, status, created_at').eq('profile_id', owner).eq('kind', kind).order('created_at')) as Row[];
    if (!rows.length) return [];
    const res = await db.storage.from('photos').createSignedUrls(rows.map((r) => r.path as string), 600);
    if (res.error) throw new AppError('PC002', undefined, activeTrace() ?? newTrace());
    const links = new Map((res.data ?? []).filter((d) => d.path && d.signedUrl).map((d) => [d.path as string, d.signedUrl]));
    return rows.map((r) => ({ id: r.id, status: r.status, url: links.get(r.path) ?? null, at: ms(r.created_at) ?? undefined }));
  }

  /**
   * Faces on cards (D095). The rows are asked for every time, so RLS decides every time who is
   * shown whose face (private.face_visible: the card's own audience, never across a block). Only
   * the signed link is reused, while its row still comes back and it has ten minutes left, so a
   * card does not flicker on every re-read. A face that cannot be fetched leaves the drawn portrait.
   */
  const faceLinks = new Map<string, { url: string; until: number }>();
  const FACE_LINK_S = 3600;
  async function withFaces(cards: Profile[]): Promise<Profile[]> {
    if (!cards.length) return cards;
    try {
      const rows = check(await db.from('photos').select('profile_id, path')
        .eq('kind', 'face').eq('status', 'approved').in('profile_id', cards.map((c) => c.id))) as Row[];
      const now = Date.now();
      const stale = rows.map((r) => r.path as string).filter((p) => (faceLinks.get(p)?.until ?? 0) < now + 600_000);
      if (stale.length) {
        const res = await db.storage.from('photos').createSignedUrls(stale, FACE_LINK_S);
        for (const d of res.data ?? []) if (d.path && d.signedUrl) faceLinks.set(d.path, { url: d.signedUrl, until: now + FACE_LINK_S * 1000 });
      }
      const byOwner = new Map(rows.map((r) => [r.profile_id as string, faceLinks.get(r.path as string)?.url ?? null]));
      return cards.map((c) => ({ ...c, faceUrl: byOwner.get(c.id) ?? null }));
    } catch (e) {
      quiet('cards.faces')(e);
      return cards;
    }
  }
  const cardsFrom = (rows: Row[]) => withFaces(rows.map(toProfile));

  /** One photo to the `photo` Edge Function, which strips it and files it as `pending` (D088, D095). */
  async function upload(photo: PickedPhoto, kind: 'locked' | 'face'): Promise<void> {
    const trace = activeTrace() ?? newTrace();
    const { data } = await db.auth.getSession();
    if (!data.session) throw new AppError('PL001', undefined, trace);
    log.info('photo.add', { kind, trace });
    let res: Response;
    try {
      const file = await (await fetch(photo.uri)).blob();
      res = await fetch(`${url.replace(/\/$/, '')}/functions/v1/photo${kind === 'face' ? '?kind=face' : ''}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: anonKey, 'Content-Type': 'image/jpeg', 'x-trace-id': trace },
        body: file,
      });
    } catch {
      // Not reached: the phone is offline, or the file could not be read.
      throw new AppError('PC001', undefined, trace);
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
      throw fromServer({ code: body.code ?? 'PC002', message: body.message ?? '' }, trace);
    }
  }

  /** One call to the `wallet` Edge Function (D104), which talks to Razorpay; the app never does. */
  async function walletFunction<T = unknown>(body: Row): Promise<T> {
    const trace = activeTrace() ?? newTrace();
    const { data } = await db.auth.getSession();
    log.info('wallet.fn', { action: body.action, trace });
    let res: Response;
    try {
      res = await fetch(`${url.replace(/\/$/, '')}/functions/v1/wallet`, {
        method: 'POST',
        headers: { ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}), apikey: anonKey, 'Content-Type': 'application/json', 'x-trace-id': trace },
        body: JSON.stringify(body),
      });
    } catch {
      throw new AppError('PC001', undefined, trace);
    }
    const out = (await res.json().catch(() => ({}))) as T & { code?: string; message?: string };
    if (!res.ok) throw fromServer({ code: out.code ?? 'PC002', message: out.message ?? '' }, trace);
    return out;
  }

  /** One call to the `talk` Edge Function (D108): the AI, voice rooms and Route; the app holds none of their keys. */
  async function talkFunction<T = unknown>(body: Row, fn: 'talk' | 'voice' = 'talk'): Promise<T> {
    const trace = activeTrace() ?? newTrace();
    const { data } = await db.auth.getSession();
    log.info(`${fn}.fn`, { action: body.action, trace });
    let res: Response;
    try {
      res = await fetch(`${url.replace(/\/$/, '')}/functions/v1/${fn}`, {
        method: 'POST',
        headers: { ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}), apikey: anonKey, 'Content-Type': 'application/json', 'x-trace-id': trace },
        body: JSON.stringify(body),
      });
    } catch {
      throw new AppError('PC001', undefined, trace);
    }
    const out = (await res.json().catch(() => ({}))) as T & { code?: string; message?: string };
    if (!res.ok) throw fromServer({ code: out.code ?? 'PC002', message: out.message ?? '' }, trace);
    return out;
  }
  /** What the function has keys for; asked once, then kept (a deploy changes it, a reload picks it up). */
  let talkOpen: TalkOpen | null = null;
  async function talkStatus(): Promise<TalkOpen> {
    if (talkOpen) return talkOpen;
    try {
      const r = await talkFunction<Partial<TalkOpen>>({ action: 'status' });
      talkOpen = { ai: !!r.ai, voice: !!r.voice, payouts: !!r.payouts };
    } catch (e) {
      quiet('talk.status')(e);
      return { ai: false, voice: false, payouts: false };
    }
    return talkOpen;
  }
  async function talkRpc(fn: string, args?: Row): Promise<Talk> {
    await uid();
    const [raw, open] = await Promise.all([rpc(fn, args), talkStatus()]);
    return talkFrom(raw, open);
  }

  async function uid(): Promise<string> {
    if (meId) return meId;
    const { data } = await db.auth.getSession();
    if (data.session) return (meId = data.session.user.id);
    const captchaToken = await captcha();
    const res = await db.auth.signInAnonymously(captchaToken ? { options: { captchaToken } } : undefined);
    if (res.error || !res.data.user) throw res.error ? codeError(res.error.message, 'email') : new AppError('PA009');
    return (meId = res.data.user.id);
  }

  /** What changed for me, in words, when the other person (or the clock) moves an invite. */
  function noticeFor(prev: Invite | undefined, next: Invite): Notice | undefined {
    if (isDouble(next)) return doubleNotice(prev, next);
    const name = names.get(otherId(next, meId)) ?? t('ask.they');
    const idea = ideaOf(next.ideaId).title;
    if (!prev) {
      return next.status === 'sent' && next.toId === meId
        ? { tone: 'pink', title: t('notices.askedYou', { name }), body: t('notices.lockOrPass', { idea }), inviteId: next.id }
        : undefined;
    }
    if (prev.status === next.status) return undefined;
    if (next.status === 'half_locked' && next.firstPinkyBy !== meId) return { tone: 'pink', title: t('status.theirPinkyOut', { name }), body: t('notices.slideToSeal', { idea }), inviteId: next.id };
    if (next.status === 'declined' && next.declinedBy !== meId) return { tone: 'flare', title: t('notices.passed', { name }), body: t('notices.passedBody'), inviteId: next.id };
    if (next.status === 'kept') return { tone: 'volt', title: t('status.kept'), body: t('notices.keptBody', { name }), inviteId: next.id };
    if (next.status === 'flaked') {
      // Resolved inside the window means someone bailed; after it, the clock closed it.
      const bailed = (next.resolvedAt ?? 0) <= next.startsAt + CHECK_IN_CLOSES_AFTER;
      if (next.flakedBy === meId) {
        // My own bail needs no banner: I just did it.
        return bailed ? undefined : { tone: 'flare', title: t('notices.missed'), body: t('notices.missedBody', { name }), inviteId: next.id };
      }
      if (!next.flakedBy) return { tone: 'flare', title: t('notices.missed'), body: t('notices.neitherBody', { idea }), inviteId: next.id };
      return { tone: 'flare', title: t(bailed ? 'notices.bailed' : 'status.theyFlaked', { name }), body: t('notices.theirHit'), inviteId: next.id };
    }
    return undefined;
  }

  /** The same news for a double, where four people move it. Names only, never what anyone chose. */
  function doubleNotice(prev: Invite | undefined, next: Invite): Notice | undefined {
    const nameOf = (id: string | null | undefined) => (id && names.get(id)) || t('common.someone');
    const idea = ideaOf(next.ideaId).title;
    const id = next.id;
    if (!prev) {
      return next.status === 'sent' && next.fromId !== meId
        ? { tone: 'pink', title: t('notices.askedDouble', { name: nameOf(next.fromId) }), body: t('notices.lockOrPass', { idea }), inviteId: id }
        : undefined;
    }
    if (next.fromId === meId && (prev.pinkies?.length ?? 0) < 3 && (next.pinkies?.length ?? 0) >= 3 && next.status === 'half_locked') {
      return { tone: 'pink', title: t('lock.allThree'), body: t('notices.slideToSeal', { idea }), inviteId: id };
    }
    if (prev.status === next.status) return undefined;
    if (next.status === 'locked' && next.fromId !== meId) return { tone: 'pink', title: t('notices.doubleLocked'), body: t('notices.doubleLockedBody', { idea }), inviteId: id };
    if (next.status === 'declined' && next.declinedBy !== meId) return { tone: 'flare', title: t('notices.passed', { name: nameOf(next.declinedBy) }), body: t('notices.doubleOffBody'), inviteId: id };
    if (next.status === 'kept') return { tone: 'volt', title: t('status.kept'), body: t('notices.keptDoubleBody'), inviteId: id };
    if (next.status === 'flaked') {
      const bailed = (next.resolvedAt ?? 0) <= next.startsAt + CHECK_IN_CLOSES_AFTER;
      if (bailed) return next.flakedBy === meId ? undefined : { tone: 'flare', title: t('notices.bailed', { name: nameOf(next.flakedBy) }), body: t('notices.theirHit'), inviteId: id };
      if (!next.checkIns.includes(meId)) return { tone: 'flare', title: t('notices.missed'), body: t('notices.missedDoubleBody', { idea }), inviteId: id };
      return { tone: 'flare', title: t('notices.fellThrough'), body: t('notices.fellThroughBody'), inviteId: id };
    }
    return undefined;
  }

  /** One invite row arrived (Realtime or a re-read). Tell the store, with a banner if it is news. */
  async function takeInvite(next: Invite) {
    const prev = known.get(next.id);
    if (prev && JSON.stringify(prev) === JSON.stringify(next)) return;
    // Mark it known before any await, so the same row arriving twice is only announced once.
    known.set(next.id, next);
    // Someone who joined after I booted: fetch their card before the invite needs their name.
    const unknown = peopleOf(next).filter((id) => id !== meId && !names.has(id));
    if (unknown.length) await refreshCards(unknown);
    const notice = noticeFor(prev, next);
    listeners.forEach((l) => l({ changes: { invites: [next] }, notice }));
    if (next.status === 'kept' || next.status === 'flaked') refreshCards(peopleOf(next));
  }

  /** Re-read what I can see: catches whatever happened while the socket was down or the app asleep. */
  async function resync() {
    const [cards, invites] = await Promise.all([
      db.from('profile_cards').select('*'),
      db.from('invites').select('*').order('created_at', { ascending: false }),
      readDuo().then((duoId) => listeners.forEach((l) => l({ changes: { duoId } }))),
    ]);
    if (cards.data) announceCards(await cardsFrom(cards.data));
    for (const row of invites.data ?? []) await takeInvite(toInvite(row));
    // What RLS no longer returns is gone for me: a block either way, or a deleted account.
    if (invites.data) {
      const seen = new Set(invites.data.map((r: Row) => r.id as string));
      const goneInvites = [...known.keys()].filter((id) => !seen.has(id));
      let goneProfiles: string[] = [];
      if (cards.data) {
        const listed = new Set(cards.data.map((r: Row) => r.id as string));
        const missing = [...names.keys()].filter((id) => id !== meId && !listed.has(id) && !discovered.has(id));
        // The card list is capped, so ask about the missing ones before calling them gone.
        if (missing.length) {
          const still = await db.from('profile_cards').select('id').in('id', missing);
          if (still.data) {
            const there = new Set(still.data.map((r: Row) => r.id as string));
            goneProfiles = missing.filter((id) => !there.has(id));
          }
        }
      }
      if (goneInvites.length || goneProfiles.length) forget(goneProfiles, goneInvites);
    }
  }

  /** My duo partner, from my own row (RLS returns no one else's). */
  async function readDuo(): Promise<string | null> {
    const res = await db.from('duos').select('partner').maybeSingle();
    return (check(res) as Row | null)?.partner ?? null;
  }

  /** Drop people and invites I can no longer see, and tell the store. */
  function forget(profiles: string[], invites: string[]): Changes {
    const dropInvites = new Set(invites);
    for (const [id, inv] of known) if (peopleOf(inv).some((p) => p !== meId && profiles.includes(p))) dropInvites.add(id);
    dropInvites.forEach((id) => known.delete(id));
    profiles.forEach((id) => names.delete(id));
    const changes: Changes = { removed: { profiles, invites: [...dropInvites] } };
    listeners.forEach((l) => l({ changes }));
    return changes;
  }

  /** Back to a device with nobody signed in (after deleting the account or signing out). */
  async function reset() {
    await db.removeAllChannels();
    live = false;
    known.clear();
    names.clear();
    discovered.clear();
    meId = '';
  }

  // What GoTrue can send, from its public settings. Asked once per launch.
  let available: { phone: boolean; email: boolean } | null = null;
  async function codesAvailable(): Promise<{ phone: boolean; email: boolean }> {
    if (available) return available;
    try {
      const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/settings`, { headers: { apikey: anonKey } });
      const body = (await res.json()) as { external?: { phone?: boolean; email?: boolean } };
      available = { phone: !!body.external?.phone, email: !!body.external?.email };
    } catch {
      return { phone: false, email: false };
    }
    return available;
  }

  function listen() {
    if (live) return;
    live = true;
    // RLS filters the feed: only invites I am on ever arrive here.
    db.channel('pinkilock')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invites' }, (payload) => {
        takeInvite(toInvite(payload.new)).catch(quiet('realtime.invite'));
      })
      // The feed carries no deletes (G24, D093). When something of mine went away (a duo left, an
      // invite whose other person deleted their account), my own nudge row changes: look again,
      // and the re-read drops what RLS no longer returns.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_nudges' }, () => {
        resync().catch(quiet('realtime.nudge'));
      })
      // My duo row: a friend joined. Re-read rather than trust the payload.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duos' }, () => {
        readDuo()
          .then(async (duoId) => {
            if (duoId && !names.has(duoId)) await refreshCards([duoId]);
            listeners.forEach((l) => l({ changes: { duoId } }));
          })
          .catch(quiet('realtime.duo'));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trust_scores' }, (payload) => {
        const id = (payload.new as Row)?.profile_id;
        if (id) refreshCards([id]);
      })
      // No `profiles` feed: clients may read only the card's columns of that table, and new people
      // are fetched through discover() rather than pushed. Cards are re-read on every resync.
      // Joining the channel and the database feed starting are two moments: Realtime says
      // SUBSCRIBED first and only later reports that postgres_changes is flowing. A change
      // committed in between is never delivered, so re-read at both.
      .on('system', {}, (payload: Row) => {
        if (payload.extension === 'postgres_changes' && payload.status === 'ok') resync().catch(quiet('realtime.resync'));
      })
      .subscribe((status) => {
        // Every (re)connect: close the gap between the last thing I read and the live feed.
        if (status === 'SUBSCRIBED') resync().catch(quiet('realtime.resync'));
      });
  }

  function announceCards(cards: Profile[]) {
    if (!cards.length) return;
    cards.forEach((c) => names.set(c.id, c.name));
    const mine = cards.find((c) => c.id === meId);
    const changes: Changes = { profiles: cards.filter((c) => c.id !== meId) };
    if (mine) changes.me = mine;
    listeners.forEach((l) => l({ changes }));
  }

  /** Scores come from the analytics worker, so re-read the cards it may have touched. */
  async function refreshCards(ids: string[]) {
    const { data } = await db.from('profile_cards').select('*').in('id', ids);
    if (data) announceCards(await cardsFrom(data));
  }

  /** The next page of Discover (at most 20, from the server's own order and limits). */
  async function discoverPage(): Promise<Profile[]> {
    const page = await cardsFrom(await rpc<Row[]>('discover', { p_limit: 20 }));
    page.forEach((p) => {
      discovered.add(p.id);
      names.set(p.id, p.name);
    });
    return page;
  }

  async function snapshot(): Promise<Snapshot> {
    const id = await uid();
    // My own card and everyone I share an invite with (all RLS returns), plus the first page of Discover.
    const [cards, invites, passes, priv, duoId] = await Promise.all([
      db.from('profile_cards').select('*'),
      db.from('invites').select('*').order('created_at', { ascending: false }),
      db.from('passes').select('passed_id'),
      db.from('profile_private').select('contact_kind, contact_handle, contact_verified_at').eq('profile_id', id).maybeSingle(),
      readDuo(),
    ]);
    const all = await cardsFrom(check(cards));
    if (all.some((p) => p.id === id)) {
      const known = new Set(all.map((p) => p.id));
      for (const p of await discoverPage()) if (!known.has(p.id)) all.push(p);
    }
    all.forEach((p) => names.set(p.id, p.name));
    const list = check(invites).map(toInvite);
    list.forEach((i) => known.set(i.id, i));
    const p = check(priv) as Row | null;
    const myContact: MyContact | null = p ? { kind: p.contact_kind, handle: p.contact_handle, verified: !!p.contact_verified_at } : null;
    const me = all.find((x) => x.id === id) ?? null;
    if (me) {
      listen();
      rpc('log_event', { p_type: 'app_open' }).catch(quiet('log_event'));
    }
    return { me, myContact, profiles: all.filter((x) => x.id !== id), invites: list, passedIds: check(passes).map((r: Row) => r.passed_id), duoId };
  }

  async function contactStatus(): Promise<MyContact | null> {
    const id = await uid();
    const p = check(await db.from('profile_private').select('contact_kind, contact_handle, contact_verified_at').eq('profile_id', id).maybeSingle()) as Row | null;
    return p ? { kind: p.contact_kind, handle: p.contact_handle, verified: !!p.contact_verified_at } : null;
  }

  async function rpcInvite(fn: string, args: Row): Promise<Changes> {
    await uid();
    try {
      const invite = toInvite(await rpc<Row>(fn, args));
      known.set(invite.id, invite);
      return { invites: [invite] };
    } catch (e) {
      // Gone or unavailable usually means a block happened that this phone has not heard about
      // (a block is never announced). Re-read, so the stale card and invite drop away.
      if (e instanceof AppError && RESYNC_CODES.includes(e.code)) {
        // Someone from Discover who is no longer there (a block, a deletion): RLS cannot tell me, so drop them here.
        if (fn === 'send_invite' && (e.code === 'PL003' || e.code === 'PL004') && discovered.has(args.p_to)) forget([args.p_to], []);
        resync().catch(quiet('resync.after_refusal'));
      }
      throw e;
    }
  }

  // Each method is one tap: every server call inside it shares one trace id.
  return tracedAll({
    kind: 'supabase',

    boot: snapshot,

    // Profiles are written only through save_profile: the tables take no direct writes, and the
    // server checks every field (src/domain/profile.ts has the same rules for the app's side).
    async completeOnboarding(input) {
      await uid();
      // Consent first (WP8): the server refuses a first profile without all four.
      await rpc('give_consents', { p_kinds: input.consents ?? [] });
      await rpc('save_profile', {
        p_name: input.name, p_age: input.age, p_area: input.area, p_pronouns: input.pronouns, p_tagline: input.tagline,
        p_vibes: input.vibes, p_idea_ids: input.ideaIds, p_contact_kind: input.contactKind, p_contact_handle: input.contactHandle,
        p_city: input.city ?? null,
      });
      return snapshot();
    },

    async updateMe(patch) {
      const id = await uid();
      // save_profile takes the whole card, so start from what is there now.
      const now = toProfile(check(await db.from('profile_cards').select('*').eq('id', id).single()) as unknown as Row);
      const hasContact = !!(patch.contactKind && patch.contactHandle);
      await rpc('save_profile', {
        p_name: patch.name ?? now.name, p_age: patch.age ?? now.age, p_area: patch.area ?? now.area,
        p_pronouns: patch.pronouns ?? now.pronouns, p_tagline: patch.tagline ?? now.tagline,
        p_vibes: patch.vibes ?? now.vibes, p_idea_ids: patch.ideaIds ?? now.ideaIds,
        p_contact_kind: hasContact ? patch.contactKind : null, p_contact_handle: hasContact ? patch.contactHandle : null,
        p_city: patch.city ?? null,
      });
      const changes: Changes = {};
      // The server stores the handle in its own form and clears the tick on a new one: read it back.
      if (hasContact) changes.myContact = (await contactStatus()) ?? undefined;
      const card = check(await db.from('profile_cards').select('*').eq('id', id).single());
      return { ...changes, me: (await cardsFrom([card as unknown as Row]))[0] };
    },

    async pass(profileId) {
      await uid();
      await rpc('pass_profile', { p_profile: profileId });
      return { passedIds: check(await db.from('passes').select('passed_id')).map((r: Row) => r.passed_id) };
    },

    async restorePasses() {
      await uid();
      await rpc('restore_passes');
      return { passedIds: [] };
    },

    async rateDate(inviteId, answer) {
      await uid();
      await rpc('rate_date', { p_invite: inviteId, p_worth: answer.worth, p_again: answer.again, p_unsafe: answer.unsafe });
    },

    async dateFeedback(inviteId) {
      await uid();
      const rows = await rpc<{ rated: boolean; round_two: boolean | null }[]>('date_feedback', { p_invite: inviteId });
      return { rated: !!rows?.[0]?.rated, roundTwo: !!rows?.[0]?.round_two };
    },

    async fileRequest(kind, detail, actionId) {
      await uid();
      await rpc('file_privacy_request', { p_kind: kind, p_detail: detail, p_action: actionId ?? null });
    },

    async myModeration() {
      await uid();
      const rows = await rpc<{ id: number; action: string; reason: string; at: string }[]>('my_moderation');
      return (rows ?? []).map((r) => ({ id: r.id, action: r.action, reason: r.reason, at: ms(r.at)! }));
    },

    async createVouchLink() {
      await uid();
      return rpc<string>('create_vouch_link');
    },

    async vouchFor(token) {
      await uid();
      return (await rpc<string | null>('vouch_link_name', { p_token: token })) ?? null;
    },

    async vouch(token, phrases) {
      await uid();
      await rpc('vouch', { p_token: token, p_phrases: phrases });
    },

    async saveAvailability(windows) {
      const id = await uid();
      await rpc('save_availability', { p_windows: windows });
      const card = check(await db.from('profile_cards').select('*').eq('id', id).single());
      return { me: (await cardsFrom([card as unknown as Row]))[0] };
    },

    async myLineReview() {
      await uid();
      const rows = await rpc<{ text: string; status: 'pending' | 'held' | 'rejected' }[]>('my_line_review');
      return rows?.[0] ?? null;
    },

    async moreProfiles() {
      await uid();
      const page = await discoverPage();
      return page.length ? { profiles: page } : {};
    },

    async createDuoLink() {
      await uid();
      return rpc<string>('create_duo_link');
    },

    async duoLinkName(token) {
      await uid();
      return (await rpc<string | null>('duo_link_name', { p_token: token })) ?? null;
    },

    async joinDuo(token) {
      await uid();
      const duoId = await rpc<string>('join_duo', { p_token: token });
      const card = await cardsFrom(check(await db.from('profile_cards').select('*').eq('id', duoId)));
      card.forEach((p) => names.set(p.id, p.name));
      return { duoId, profiles: card };
    },

    async leaveDuo() {
      await uid();
      await rpc('leave_duo');
      return { duoId: null };
    },

    sendInvite: (input) =>
      rpcInvite('send_invite', { p_to: input.toId, p_idea: input.ideaId, p_starts_at: new Date(input.startsAt).toISOString(), p_place: input.venueId ? '' : input.place, p_note: input.note, p_venue: input.venueId ?? null, p_double: !!input.double }),
    offerPinky: (inviteId) => rpcInvite('offer_pinky', { p_invite: inviteId }),
    declineInvite: (inviteId) => rpcInvite('decline_invite', { p_invite: inviteId }),
    async myCheckInCode(inviteId) {
      await uid();
      return rpc<string>('my_checkin_code', { p_invite: inviteId });
    },
    async checkIn(inviteId, theirCode) {
      const changes = await rpcInvite('check_in', { p_invite: inviteId, p_code: theirCode });
      // A wrong code comes back as the plan unchanged (an error would undo the server's count of
      // wrong tries), so "still not checked in" is the refusal.
      if (!changes.invites?.[0]?.checkIns.includes(meId)) throw new AppError('PL039');
      return changes;
    },
    bail: (inviteId) => rpcInvite('bail', { p_invite: inviteId }),

    async getReveal(inviteId, profileId): Promise<Reveal> {
      const id = await uid();
      const invite = known.get(inviteId) ?? toInvite(check(await db.from('invites').select('*').eq('id', inviteId).single()) as Row);
      const them = profileId ?? otherId(invite, id);
      // No status check here on purpose: the private_after_kept policy returns no row until it is kept.
      const row = check(await db.from('profile_private').select('*').eq('profile_id', them).maybeSingle()) as Row | null;
      if (!row) throw new AppError('PC003');
      // Photos are extra: if they cannot be fetched now, the handle still shows.
      const photos = (await photosOf(them).catch((e) => { quiet('reveal.photos')(e); return []; }))
        .filter((p) => p.status === 'approved' && p.url).map((p) => ({ url: p.url as string }));
      return { profileId: them, contactKind: row.contact_kind, contactHandle: row.contact_handle, contactVerified: !!row.contact_verified_at, photos };
    },

    myPhotos: async () => photosOf(await uid()),

    addPhoto: async (photo) => {
      await upload(photo, 'locked');
      return photosOf(await uid());
    },

    myFace: async () => photosOf(await uid(), 'face'),

    addFace: async (photo) => {
      await upload(photo, 'face');
      return photosOf(await uid(), 'face');
    },

    async removeFace(id) {
      await rpc('remove_photo', { p_id: id });
      return photosOf(await uid(), 'face');
    },

    async removePhoto(id) {
      await rpc('remove_photo', { p_id: id });
      return photosOf(await uid());
    },

    async reportBadContact(inviteId, ownerId) {
      await rpc('report_bad_contact', { p_invite: inviteId, p_owner: ownerId });
    },

    async myContactFlags() {
      return Number(await rpc<number>('my_contact_flags')) || 0;
    },

    async startContactCheck(): Promise<ContactCheck> {
      return await rpc<ContactCheck>('start_contact_check');
    },

    myContactStatus: contactStatus,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async registerPushToken(token, platform) {
      await uid();
      await rpc('register_push_token', { p_token: token, p_platform: platform });
    },

    async unregisterPushToken(token) {
      await uid();
      await rpc('unregister_push_token', { p_token: token });
    },

    async logClientError(report) {
      // Only an account can file one; a phone that never signed in has nothing to trace yet.
      const { data } = await db.auth.getSession();
      if (!data.session) return;
      check(await db.rpc('log_client_error', {
        p_code: report.code, p_trace: report.trace, p_route: report.route.slice(0, 80),
        p_app_version: report.appVersion.slice(0, 40), p_platform: report.platform,
      }));
    },

    async block(profileId) {
      await uid();
      await rpc('block_user', { p_profile: profileId });
      // A block between duo partners ends the duo on the server; read whether mine is still there.
      return { ...forget([profileId], []), duoId: await readDuo() };
    },

    async unblock(profileId) {
      await uid();
      await rpc('unblock_user', { p_profile: profileId });
      // Unless they blocked me too, they come back, with whatever we had before.
      const [card, invites] = await Promise.all([
        db.from('profile_cards').select('*').eq('id', profileId),
        db.from('invites').select('*').or(['from_id', 'to_id', 'from_friend', 'to_friend'].map((c) => `${c}.eq.${safeId(profileId)}`).join(',')),
      ]);
      const profiles = await cardsFrom(check(card));
      profiles.forEach((p) => names.set(p.id, p.name));
      const list = check(invites).map(toInvite);
      list.forEach((i) => known.set(i.id, i));
      return { profiles, invites: list };
    },

    async blockedPeople(): Promise<BlockedPerson[]> {
      await uid();
      const rows = await rpc<Row[]>('my_blocks');
      return rows.map((r) => ({ profileId: r.profile_id, name: r.name, blockedAt: ms(r.blocked_at)! }));
    },

    async report(input) {
      await uid();
      await rpc('report_user', { p_profile: input.profileId, p_reason: input.reason, p_detail: input.detail, p_invite: input.inviteId ?? null });
      return { ...forget([input.profileId], []), duoId: await readDuo() };
    },

    async selfLove() {
      await uid();
      return selfLoveFrom(await rpc('my_self_love'));
    },
    async saveMood(mood) {
      await uid();
      return selfLoveFrom(await rpc('save_mood', { p_mood: mood }));
    },
    async addSelfNote(kind, body) {
      await uid();
      return selfLoveFrom(await rpc('add_self_note', { p_kind: kind, p_body: body }));
    },
    async removeSelfNote(id) {
      await uid();
      return selfLoveFrom(await rpc('remove_self_note', { p_id: Number(id) }));
    },
    async pauseDiscover(days) {
      await uid();
      return selfLoveFrom(await rpc('pause_discover', { p_days: days }));
    },
    async startReset() {
      await uid();
      return selfLoveFrom(await rpc('start_reset'));
    },
    async doResetStep(day) {
      await uid();
      return selfLoveFrom(await rpc('do_reset_step', { p_day: day }));
    },

    async spicy() {
      await uid();
      return spicyFrom(await rpc('my_spicy'));
    },
    async saveSpicy(input) {
      await uid();
      return spicyFrom(await rpc('save_spicy', { p_adult: input.adult, p_rules: input.rules, p_discord: input.discord, p_telegram: input.telegram, p_signal: input.signal, p_boundaries: input.boundaries }));
    },
    async spicyOff() {
      await uid();
      return spicyFrom(await rpc('spicy_off'));
    },
    async spicyWith(profileId) {
      await uid();
      return spicyPlanFrom(await rpc('spicy_with', { p_other: profileId }));
    },
    async spicyYes(profileId, yes) {
      await uid();
      return spicyPlanFrom(await rpc('spicy_yes', { p_other: profileId, p_yes: yes }));
    },

    async spicyTerms() {
      await uid();
      return spicyTermsFrom(await rpc('spicy_terms'));
    },
    async passSpicyQuiz(version, agree, answers) {
      await uid();
      return quizResultFrom(await rpc('pass_spicy_quiz', { p_version: version, p_agree: agree, p_answers: answers }));
    },

    async spicyPay(profileId, share) {
      await uid();
      return spicyPlanFrom(await rpc('spicy_pay', { p_other: profileId, p_share: share }));
    },

    async spicyCall(profileId) {
      await uid();
      return callFrom(await rpc('spicy_call', { p_other: profileId }));
    },
    async spicyCallPick(profileId, slots, minutes) {
      await uid();
      return callFrom(await rpc('spicy_call_pick', { p_other: profileId, p_slots: slots.map((x) => new Date(x).toISOString()), p_minutes: minutes }));
    },
    async spicyCallBeat(profileId) {
      await uid();
      return callFrom(await rpc('spicy_call_beat', { p_other: profileId }));
    },
    async spicyCallEnd(profileId, unsafe) {
      await uid();
      return callFrom(await rpc('spicy_call_end', { p_other: profileId, p_unsafe: unsafe }));
    },
    async spicyCallMove(profileId, anyway) {
      await uid();
      return callFrom(await rpc('spicy_call_move', { p_other: profileId, p_anyway: anyway }));
    },
    async spicyCallAnswer(profileId, answer) {
      await uid();
      return callFrom(await rpc('spicy_call_answer', { p_other: profileId, p_answer: answer }));
    },
    async spicyVoice(profileId) {
      await uid();
      const room = await talkFunction<{ url?: string; token?: string }>({ action: 'spicy', other: profileId }, 'voice');
      if (!room.url || !room.token) throw new AppError('PL179');
      return { url: room.url, token: room.token };
    },
    async spicyShare(profileId, share) {
      await uid();
      return spicyPlanFrom(await rpc('spicy_share', { p_other: profileId, p_share: share }));
    },

    talk: () => talkRpc('talk_state'),
    talkStatus,
    talkSettings: (sex, want) => talkRpc('talk_settings', { p_sex: sex, p_want: want }),
    async talkAi(chat, history, text, tone) {
      await uid();
      const body = checkAiMessage(text);
      const r = await talkFunction<{ chat: string; reply: string; harm: boolean; charged: number; paid_until: string | null }>({ action: 'ai', chat, history: aiHistory(history), text: body, tone });
      return { chat: r.chat, reply: r.reply, harm: r.harm, charged: r.charged, paidUntil: r.paid_until ? Date.parse(r.paid_until) : null };
    },
    async talkAiSession(chat) {
      await uid();
      const r = await rpc<{ chat: string; paid_until: string | null; charged: number; free: boolean }>('talk_ai_session', { p_chat: chat });
      return { chat: r.chat, paidUntil: r.paid_until ? Date.parse(r.paid_until) : null, charged: r.charged, free: r.free };
    },
    talkAiPass: () => talkRpc('talk_ai_pass'),
    async talkListeners() {
      await uid();
      const rows = (await rpc<{ id: string; first_name: string; sex: string; topics: string[]; calls: number }[]>('talk_listeners')) ?? [];
      return rows.map((r): ListenerCard => ({
        id: r.id, firstName: r.first_name, sex: SEXES.includes(r.sex as Sex) ? (r.sex as Sex) : 'unsaid',
        topics: (r.topics ?? []).filter((x): x is Topic => (TOPICS as readonly string[]).includes(x)), calls: r.calls ?? 0,
      }));
    },
    talkCall: (listenerId, length, free) => talkRpc('talk_call', { p_listener: listenerId, p_length: length, p_free: free }),
    talkAnswer: (callId, yes) => talkRpc('talk_answer', { p_call: callId, p_yes: yes }),
    talkBeat: (callId) => talkRpc('talk_beat', { p_call: callId }),
    talkEnd: (callId) => talkRpc('talk_end', { p_call: callId }),
    talkReport: (callId, reason) => talkRpc('talk_report', { p_call: callId, p_reason: reason }),
    talkBlock: (callId) => talkRpc('talk_block', { p_call: callId }),
    async talkVoice(callId) {
      await uid();
      if (!(await talkStatus()).voice) return null;
      return talkFunction<{ url: string; token: string }>({ action: 'voice', call: callId });
    },
    talkListenerApply: (input) => {
      const ok = checkListener(input);
      return talkRpc('talk_listener_apply', { p_first_name: ok.firstName, p_sex: ok.sex, p_accepts: ok.accepts, p_topics: ok.topics, p_code_version: 1 });
    },
    async talkListenerKyc(kyc) {
      await uid();
      if (!(await talkStatus()).payouts) throw new AppError('PL173');
      await talkFunction({ action: 'kyc', ...checkKyc(kyc) });
      return talkRpc('talk_state');
    },
    talkListenerAvailable: (on) => talkRpc('talk_listener_available', { p_on: on }),
    claimReferral: (code) => talkRpc('talk_claim_referral', { p_code: referralCode(code) }),

    async wallet() {
      await uid();
      return walletFrom(await rpc('my_wallet'));
    },
    async walletVisit() {
      await uid();
      return walletFrom(await rpc('wallet_visit'));
    },
    async topUpStatus() {
      if (!topUpsHere(platform) || !checkout) return { open: false, test: false };
      try {
        const r = await walletFunction<{ open?: boolean; test?: boolean }>({ action: 'status' });
        return { open: !!r.open, test: !!r.test };
      } catch {
        return { open: false, test: false };
      }
    },
    async topUp(packId) {
      await uid();
      // Phone apps wait for Play Billing (O15): digital credits must be bought through the store there.
      if (!topUpsHere(platform) || !checkout) throw new AppError('PL144');
      // The same order path buys credit packs, Pink Gold plans and Boosts (D116); the server prices each.
      const order = await walletFunction<{ order: string; key: string; paise: number; credits: number; months?: number; boosts?: number }>({ action: 'order', pack: packId });
      const about = order.months ? t('gold.checkoutPlan', { count: order.months }) : order.boosts ? t('gold.checkoutBoosts', { count: order.boosts }) : t('wallet.checkoutAbout', { n: order.credits });
      const paid = await checkout({ key: order.key, order: order.order, paise: order.paise, title: t('wallet.checkoutTitle'), about });
      // Closed without paying: nothing was taken, and the wallet is as it was.
      if (paid) await walletFunction({ action: 'verify', order: paid.order, payment: paid.payment, signature: paid.signature });
      return walletFrom(await rpc('my_wallet'));
    },
    async boost() {
      await uid();
      return walletFrom(await rpc('wallet_boost'));
    },
    async buyExtraAsk() {
      await uid();
      return walletFrom(await rpc('wallet_extra_ask'));
    },
    async stakePlan(inviteId) {
      await uid();
      return walletFrom(await rpc('wallet_stake', { p_invite: inviteId }));
    },
    async treatOptions(inviteId) {
      await uid();
      const rows = await rpc<{ partner: string; name: string; items: string[] }[]>('treat_options', { p_invite: inviteId });
      const city = '';
      return (rows ?? []).map((p): TreatPartner => ({ id: p.partner, name: p.name, city, items: p.items.filter((i): i is TreatItem => (TREAT_ITEMS as readonly string[]).includes(i)) }));
    },
    async treatPlan(inviteId, partnerId, item) {
      await uid();
      return walletFrom(await rpc('treat_plan', { p_invite: inviteId, p_partner: partnerId, p_item: item }));
    },
    async declineTreat(inviteId) {
      await uid();
      return walletFrom(await rpc('decline_treat', { p_invite: inviteId }));
    },

    async exportMyData() {
      await uid();
      return JSON.stringify(await rpc('export_my_data'), null, 2);
    },

    async deleteAccount() {
      await uid();
      await rpc('delete_my_account');
      // The user no longer exists, so only this phone's copy of the session is left to drop.
      await db.auth.signOut({ scope: 'local' }).catch(quiet('delete.sign_out'));
      await reset();
      return emptySnapshot();
    },

    async account(): Promise<Account> {
      const [{ data }, can] = await Promise.all([db.auth.getSession(), codesAvailable()]);
      const user = data.session?.user;
      return {
        phone: user?.phone ? `+${user.phone.replace(/^\+/, '')}` : null,
        email: user?.email || null,
        phoneAvailable: can.phone,
        emailAvailable: can.email,
      };
    },

    async sendCode(kind, address, mode) {
      // Through the auth-code function (D091, G22): it answers the same whether or not the address
      // can be used, and sends a code only to an account's own address (signing in) or a free one
      // (adding it to mine). A code that was never sent fails like a mistyped one (PA006).
      if (mode === 'link') await uid();
      const trace = activeTrace() ?? newTrace();
      const captchaToken = await captcha();
      const { data } = await db.auth.getSession();
      let res: Response;
      try {
        res = await fetch(`${url.replace(/\/$/, '')}/functions/v1/auth-code`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${data.session?.access_token ?? anonKey}`, apikey: anonKey, 'Content-Type': 'application/json', 'x-trace-id': trace },
          body: JSON.stringify({ kind, address, mode, captcha_token: captchaToken }),
        });
      } catch {
        // Not reached: the phone is offline.
        throw new AppError('PC001', undefined, trace);
      }
      if (res.ok) return;
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      const code = body.code === 'PL112' ? 'PA007' : body.code;
      throw isErrorCode(code) ? new AppError(code, undefined, trace) : new AppError('PA009', undefined, trace);
    },

    async verifyCode(kind, address, code, mode) {
      if (mode === 'link') {
        await uid();
        // A project with confirmations off links at once, with no code to check.
        const { data: now } = await db.auth.getUser();
        const has = kind === 'phone' ? (now.user?.phone ? `+${now.user.phone.replace(/^\+/, '')}` : null) : now.user?.email || null;
        if (has === address) return snapshot();
        const { error } = kind === 'phone'
          ? await db.auth.verifyOtp({ phone: address, token: code, type: 'phone_change' })
          : await db.auth.verifyOtp({ email: address, token: code, type: 'email_change' });
        if (error) throw codeError(error.message, kind);
        return snapshot();
      }
      // Whoever was on this phone before (an anonymous user who never finished onboarding) is
      // simply left; the account that owns the number or address takes over.
      const { data, error } = kind === 'phone'
        ? await db.auth.verifyOtp({ phone: address, token: code, type: 'sms' })
        : await db.auth.verifyOtp({ email: address, token: code, type: 'email' });
      if (error || !data.user) throw error ? codeError(error.message, kind) : new AppError('PA006');
      await reset();
      meId = data.user.id;
      return snapshot();
    },

    async signOut() {
      const { data } = await db.auth.getSession();
      if (!data.session?.user.phone && !data.session?.user.email) throw new AppError('PA008');
      // Global: the refresh token is revoked on the server, so a copied session stops working too (G19).
      await db.auth.signOut({ scope: 'global' });
      await reset();
      return emptySnapshot();
    },

    async demoReset() {
      throw new AppError('PC004', 'Prototype tools only work on mock data.');
    },
    async demoBringForward() {
      throw new AppError('PC004', 'Prototype tools only work on mock data.');
    },
  });
}
