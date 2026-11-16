/**
 * The live backend: Supabase Auth, Postgres behind RLS, and Realtime.
 *
 * Every promise write is one rpc() to a function in supabase/schema.sql; every read goes through
 * Row-Level Security, so this file contains no access rules of its own. Sign-in is anonymous for
 * the MVP (enable "Anonymous sign-ins" in Supabase Auth): a real auth.uid() with zero friction,
 * which can later be linked to a phone number without changing a row.
 *
 * Nothing here imports React Native: the session store is passed in (src/services/index.ts gives
 * it AsyncStorage), so tests/live can drive this exact file from Node as two separate people.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ideaOf } from '../../domain/ideas';
import { CHECK_IN_CLOSES_AFTER, otherId } from '../../domain/invites';
import type { Invite, MyContact, Profile, Reveal } from '../../domain/types';
import type { Backend, BackendEvent, Changes, Notice, Snapshot } from '../backend';

type Row = Record<string, any>;

const ms = (t: string | null): number | null => (t ? new Date(t).getTime() : null);

function toInvite(r: Row): Invite {
  return {
    id: r.id, fromId: r.from_id, toId: r.to_id, ideaId: r.idea_id, startsAt: ms(r.starts_at)!, minutes: r.minutes,
    place: r.place, note: r.note, status: r.status, createdAt: ms(r.created_at)!, expiresAt: ms(r.expires_at)!,
    firstPinkyBy: r.first_pinky_by, lockedAt: ms(r.locked_at), checkIns: r.check_ins ?? [], flakedBy: r.flaked_by,
    declinedBy: r.declined_by, resolvedAt: ms(r.resolved_at),
  };
}

function toProfile(r: Row): Profile {
  return {
    id: r.id, name: r.name, age: r.age, city: r.city, area: r.area, pronouns: r.pronouns, tagline: r.tagline,
    vibes: r.vibes ?? [], ideaIds: r.idea_ids ?? [], palette: [r.palette?.[0] ?? '#F6F6F1', r.palette?.[1] ?? '#3A3A44'],
    glyph: r.glyph, kept: r.kept ?? 0, flaked: r.flaked ?? 0, trustScore: r.trust_score ?? 100, distanceKm: 0,
    photoCount: r.photo_count ?? 0,
  };
}

/** Where the session is kept between launches: AsyncStorage on a phone, memory in tests. */
export interface SessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function createSupabaseBackend(url: string, anonKey: string, storage: SessionStorage): Backend {
  const db: SupabaseClient = createClient(url, anonKey, {
    auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  });
  const listeners = new Set<(e: BackendEvent) => void>();
  const known = new Map<string, Invite>();
  const names = new Map<string, string>();
  let meId = '';
  let live = false;

  function check<T>(res: { data: T | null; error: { message: string } | null }): T {
    if (res.error) throw new Error(res.error.message);
    return res.data as T;
  }

  async function uid(): Promise<string> {
    if (meId) return meId;
    const { data } = await db.auth.getSession();
    if (data.session) return (meId = data.session.user.id);
    const res = await db.auth.signInAnonymously();
    if (res.error || !res.data.user) throw new Error(res.error?.message ?? 'Could not sign in.');
    return (meId = res.data.user.id);
  }

  /** What changed for me, in words, when the other person (or the clock) moves an invite. */
  function noticeFor(prev: Invite | undefined, next: Invite): Notice | undefined {
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

  /** One invite row arrived (Realtime or a re-read). Tell the store, with a banner if it is news. */
  async function takeInvite(next: Invite) {
    const prev = known.get(next.id);
    if (prev && JSON.stringify(prev) === JSON.stringify(next)) return;
    // Mark it known before any await, so the same row arriving twice is only announced once.
    known.set(next.id, next);
    // Someone who joined after I booted: fetch their card before the invite needs their name.
    const them = otherId(next, meId);
    if (!names.has(them)) await refreshCards([them]);
    const notice = noticeFor(prev, next);
    listeners.forEach((l) => l({ changes: { invites: [next] }, notice }));
    if (next.status === 'kept' || next.status === 'flaked') refreshCards([next.fromId, next.toId]);
  }

  /** Re-read what I can see: catches whatever happened while the socket was down or the app asleep. */
  async function resync() {
    const [cards, invites] = await Promise.all([
      db.from('profile_cards').select('*').limit(200),
      db.from('invites').select('*').order('created_at', { ascending: false }),
    ]);
    if (cards.data) announceCards(cards.data.map(toProfile));
    for (const row of invites.data ?? []) await takeInvite(toInvite(row));
  }

  function listen() {
    if (live) return;
    live = true;
    // RLS filters the feed: only invites I am on ever arrive here.
    db.channel('pinkilock')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invites' }, (payload) => {
        if (payload.eventType !== 'DELETE') takeInvite(toInvite(payload.new)).catch(() => {});
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trust_scores' }, (payload) => {
        const id = (payload.new as Row)?.profile_id;
        if (id) refreshCards([id]);
      })
      // People joining (or editing their card) while I am looking at Discover.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (payload) => {
        const id = (payload.new as Row)?.id;
        if (id) refreshCards([id]);
      })
      .subscribe((status) => {
        // Every (re)connect: close the gap between the last thing I read and the live feed.
        if (status === 'SUBSCRIBED') resync().catch(() => {});
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

  async function snapshot(): Promise<Snapshot> {
    const id = await uid();
    const [cards, invites, passes, priv] = await Promise.all([
      db.from('profile_cards').select('*').limit(200),
      db.from('invites').select('*').order('created_at', { ascending: false }),
      db.from('passes').select('passed_id'),
      db.from('profile_private').select('contact_kind, contact_handle').eq('profile_id', id).maybeSingle(),
    ]);
    const all = check(cards).map(toProfile);
    all.forEach((p) => names.set(p.id, p.name));
    const list = check(invites).map(toInvite);
    list.forEach((i) => known.set(i.id, i));
    const p = check(priv) as Row | null;
    const myContact: MyContact | null = p ? { kind: p.contact_kind, handle: p.contact_handle } : null;
    const me = all.find((x) => x.id === id) ?? null;
    if (me) {
      listen();
      db.rpc('log_event', { p_type: 'app_open' }).then(() => {}, () => {});
    }
    return { me, myContact, profiles: all.filter((x) => x.id !== id), invites: list, passedIds: check(passes).map((r: Row) => r.passed_id) };
  }

  async function rpcInvite(fn: string, args: Row): Promise<Changes> {
    await uid();
    const invite = toInvite(check(await db.rpc(fn, args)) as Row);
    known.set(invite.id, invite);
    return { invites: [invite] };
  }

  return {
    kind: 'supabase',

    boot: snapshot,

    async completeOnboarding(input) {
      const id = await uid();
      check(await db.from('profiles').upsert({
        id, name: input.name, age: input.age, area: input.area, pronouns: input.pronouns, tagline: input.tagline,
        vibes: input.vibes, idea_ids: input.ideaIds,
      }).select('id'));
      check(await db.from('profile_private').upsert({ profile_id: id, contact_kind: input.contactKind, contact_handle: input.contactHandle }).select('profile_id'));
      return snapshot();
    },

    async updateMe(patch) {
      const id = await uid();
      const row: Row = {};
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.age !== undefined) row.age = patch.age;
      if (patch.area !== undefined) row.area = patch.area;
      if (patch.pronouns !== undefined) row.pronouns = patch.pronouns;
      if (patch.tagline !== undefined) row.tagline = patch.tagline;
      if (patch.vibes !== undefined) row.vibes = patch.vibes;
      if (patch.ideaIds !== undefined) row.idea_ids = patch.ideaIds;
      if (Object.keys(row).length) check(await db.from('profiles').update(row).eq('id', id).select('id'));
      const changes: Changes = {};
      if (patch.contactKind && patch.contactHandle) {
        check(await db.from('profile_private').upsert({ profile_id: id, contact_kind: patch.contactKind, contact_handle: patch.contactHandle }).select('profile_id'));
        changes.myContact = { kind: patch.contactKind, handle: patch.contactHandle };
      }
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

    sendInvite: (input) =>
      rpcInvite('send_invite', { p_to: input.toId, p_idea: input.ideaId, p_starts_at: new Date(input.startsAt).toISOString(), p_place: input.place, p_note: input.note }),
    offerPinky: (inviteId) => rpcInvite('offer_pinky', { p_invite: inviteId }),
    declineInvite: (inviteId) => rpcInvite('decline_invite', { p_invite: inviteId }),
    checkIn: (inviteId) => rpcInvite('check_in', { p_invite: inviteId }),
    bail: (inviteId) => rpcInvite('bail', { p_invite: inviteId }),

    async getReveal(inviteId): Promise<Reveal> {
      const id = await uid();
      const invite = known.get(inviteId) ?? toInvite(check(await db.from('invites').select('*').eq('id', inviteId).single()) as Row);
      const them = otherId(invite, id);
      // No status check here on purpose: the private_after_kept policy returns no row until it is kept.
      const row = check(await db.from('profile_private').select('*').eq('profile_id', them).maybeSingle()) as Row | null;
      if (!row) throw new Error('Locked until you both check in.');
      return { profileId: them, contactKind: row.contact_kind, contactHandle: row.contact_handle, photos: row.photos ?? [] };
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async registerPushToken(token, platform) {
      await uid();
      check(await db.rpc('register_push_token', { p_token: token, p_platform: platform }));
    },

    async unregisterPushToken(token) {
      await uid();
      check(await db.rpc('unregister_push_token', { p_token: token }));
    },

    async demoReset() {
      throw new Error('Prototype tools only work on mock data.');
    },
    async demoBringForward() {
      throw new Error('Prototype tools only work on mock data.');
    },
  };
}
