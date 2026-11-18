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
import type { Account, BlockedPerson, CodeKind, Invite, MyContact, Profile, Reveal } from '../../domain/types';
import { log, quiet } from '../../lib/log';
import type { Backend, BackendEvent, Changes, Notice, Snapshot } from '../backend';

type Row = Record<string, any>;

const ms = (t: string | null): number | null => (t ? new Date(t).getTime() : null);

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

export function createSupabaseBackend(url: string, anonKey: string, storage: SessionStorage): Backend {
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

  function check<T>(res: { data: T | null; error: { message: string; code?: string } | null }, trace: string = newTrace()): T {
    if (res.error) throw fromServer(res.error, trace);
    return res.data as T;
  }

  /**
   * One call to a database function, with a fresh trace id in the `x-trace-id` header. The server
   * stamps it on every event and push the call causes; a failure carries the same id.
   */
  async function rpc<T = unknown>(fn: string, args?: Row): Promise<T> {
    const trace = newTrace();
    log.info('rpc', { fn, trace });
    const res = await db.rpc(fn, args).setHeader('x-trace-id', trace);
    return check(res as { data: T | null; error: { message: string; code?: string } | null }, trace);
  }

  async function uid(): Promise<string> {
    if (meId) return meId;
    const { data } = await db.auth.getSession();
    if (data.session) return (meId = data.session.user.id);
    const res = await db.auth.signInAnonymously();
    if (res.error || !res.data.user) throw res.error ? codeError(res.error.message, 'email') : new AppError('PA009');
    return (meId = res.data.user.id);
  }

  /** What changed for me, in words, when the other person (or the clock) moves an invite. */
  function noticeFor(prev: Invite | undefined, next: Invite): Notice | undefined {
    if (isDouble(next)) return doubleNotice(prev, next);
    const name = names.get(otherId(next, meId)) ?? 'They';
    const idea = ideaOf(next.ideaId).title;
    if (!prev) {
      return next.status === 'sent' && next.toId === meId
        ? { tone: 'pink', title: `${name} asked you`, body: `${idea}. Lock it or pass.`, inviteId: next.id }
        : undefined;
    }
    if (prev.status === next.status) return undefined;
    if (next.status === 'half_locked' && next.firstPinkyBy !== meId) return { tone: 'pink', title: `${name}'s pinky is out`, body: `${idea}. Slide in to seal it.`, inviteId: next.id };
    if (next.status === 'declined' && next.declinedBy !== meId) return { tone: 'flare', title: `${name} passed`, body: 'No hard feelings. Your ask slot is free again.', inviteId: next.id };
    if (next.status === 'kept') return { tone: 'volt', title: 'Promise kept', body: `You and ${name} both showed. The reveal is open.`, inviteId: next.id };
    if (next.status === 'flaked') {
      // Resolved inside the window means someone bailed; after it, the clock closed it.
      const bailed = (next.resolvedAt ?? 0) <= next.startsAt + CHECK_IN_CLOSES_AFTER;
      if (next.flakedBy === meId) {
        // My own bail needs no banner: I just did it.
        return bailed ? undefined : { tone: 'flare', title: 'Promise missed', body: `Check-in with ${name} closed without you. That is on your record.`, inviteId: next.id };
      }
      if (!next.flakedBy) return { tone: 'flare', title: 'Promise missed', body: `Neither of you checked in for ${idea}.`, inviteId: next.id };
      return { tone: 'flare', title: bailed ? `${name} bailed` : `${name} flaked`, body: 'Their score takes the hit, not yours.', inviteId: next.id };
    }
    return undefined;
  }

  /** The same news for a double, where four people move it. Names only, never what anyone chose. */
  function doubleNotice(prev: Invite | undefined, next: Invite): Notice | undefined {
    const nameOf = (id: string | null | undefined) => (id && names.get(id)) || 'Someone';
    const idea = ideaOf(next.ideaId).title;
    const id = next.id;
    if (!prev) {
      return next.status === 'sent' && next.fromId !== meId
        ? { tone: 'pink', title: `${nameOf(next.fromId)} asked you on a double`, body: `${idea}. Lock it or pass.`, inviteId: id }
        : undefined;
    }
    if (next.fromId === meId && (prev.pinkies?.length ?? 0) < 3 && (next.pinkies?.length ?? 0) >= 3 && next.status === 'half_locked') {
      return { tone: 'pink', title: 'All three pinkies are out', body: `${idea}. Slide in to seal it.`, inviteId: id };
    }
    if (prev.status === next.status) return undefined;
    if (next.status === 'locked' && next.fromId !== meId) return { tone: 'pink', title: 'The double is locked', body: `${idea} is a promise now. Be there.`, inviteId: id };
    if (next.status === 'declined' && next.declinedBy !== meId) return { tone: 'flare', title: `${nameOf(next.declinedBy)} passed`, body: 'The double is off. No hard feelings.', inviteId: id };
    if (next.status === 'kept') return { tone: 'volt', title: 'Promise kept', body: 'The reveal is open between the people who showed.', inviteId: id };
    if (next.status === 'flaked') {
      const bailed = (next.resolvedAt ?? 0) <= next.startsAt + CHECK_IN_CLOSES_AFTER;
      if (bailed) return next.flakedBy === meId ? undefined : { tone: 'flare', title: `${nameOf(next.flakedBy)} bailed`, body: 'Their score takes the hit, not yours.', inviteId: id };
      if (!next.checkIns.includes(meId)) return { tone: 'flare', title: 'Promise missed', body: `Check-in for ${idea} closed without you. That is on your record.`, inviteId: id };
      return { tone: 'flare', title: 'The double fell through', body: 'Not enough people showed. Your score is fine.', inviteId: id };
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
    if (cards.data) announceCards(cards.data.map(toProfile));
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
        if (payload.eventType !== 'DELETE') takeInvite(toInvite(payload.new)).catch(quiet('realtime.invite'));
        // Deletes carry only the id (and reach every subscriber): an account that went away.
        else if ((payload.old as Row)?.id && known.has((payload.old as Row).id)) forget([], [(payload.old as Row).id]);
      })
      // My duo row: a friend joined, or one of us left. Re-read rather than trust the payload.
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
    if (data) announceCards(data.map(toProfile));
  }

  /** The next page of Discover (at most 20, from the server's own order and limits). */
  async function discoverPage(): Promise<Profile[]> {
    const page = (await rpc<Row[]>('discover', { p_limit: 20 })).map(toProfile);
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
      db.from('profile_private').select('contact_kind, contact_handle').eq('profile_id', id).maybeSingle(),
      readDuo(),
    ]);
    const all = check(cards).map(toProfile);
    if (all.some((p) => p.id === id)) {
      const known = new Set(all.map((p) => p.id));
      for (const p of await discoverPage()) if (!known.has(p.id)) all.push(p);
    }
    all.forEach((p) => names.set(p.id, p.name));
    const list = check(invites).map(toInvite);
    list.forEach((i) => known.set(i.id, i));
    const p = check(priv) as Row | null;
    const myContact: MyContact | null = p ? { kind: p.contact_kind, handle: p.contact_handle } : null;
    const me = all.find((x) => x.id === id) ?? null;
    if (me) {
      listen();
      rpc('log_event', { p_type: 'app_open' }).catch(quiet('log_event'));
    }
    return { me, myContact, profiles: all.filter((x) => x.id !== id), invites: list, passedIds: check(passes).map((r: Row) => r.passed_id), duoId };
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

  return {
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
      });
      const changes: Changes = {};
      if (hasContact) changes.myContact = { kind: patch.contactKind!, handle: patch.contactHandle! };
      const card = check(await db.from('profile_cards').select('*').eq('id', id).single());
      return { ...changes, me: toProfile(card as unknown as Row) };
    },

    async pass(profileId) {
      const id = await uid();
      check(await db.from('passes').upsert({ profile_id: id, passed_id: profileId }).select('passed_id'));
      return { passedIds: check(await db.from('passes').select('passed_id')).map((r: Row) => r.passed_id) };
    },

    async restorePasses() {
      const id = await uid();
      check(await db.from('passes').delete().eq('profile_id', id).select('passed_id'));
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
      return { me: toProfile(card as unknown as Row) };
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
      const card = check(await db.from('profile_cards').select('*').eq('id', duoId)).map(toProfile);
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
      return { profileId: them, contactKind: row.contact_kind, contactHandle: row.contact_handle, photos: row.photos ?? [] };
    },

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
      const profiles = check(card).map(toProfile);
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
      if (mode === 'link') {
        await uid();
        // On an anonymous user this sends a code to the new number or address; verifying it turns
        // the same user into a phone or email user, so the id and the whole history stay.
        const { error } = await db.auth.updateUser(kind === 'phone' ? { phone: address } : { email: address });
        if (error) throw codeError(error.message, kind);
        return;
      }
      // Getting back into an existing account. No new accounts are made this way: a new person
      // onboards first and adds a number or address in Me.
      const { error } = await db.auth.signInWithOtp(
        kind === 'phone' ? { phone: address, options: { shouldCreateUser: false } } : { email: address, options: { shouldCreateUser: false } },
      );
      if (error) throw codeError(error.message, kind);
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
  };
}
