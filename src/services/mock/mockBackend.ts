/**
 * The mock backend: the same contract as Supabase, served from memory.
 *
 * It keeps a tiny database in AsyncStorage, answers with a little latency, and plays the other
 * person: they put their pinky out, seal a lock, check in or pass. What they will do next is
 * stored as a due time per invite (`db.due`), so a restart never loses a pending reaction.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fail } from '../../domain/errors';
import * as rules from '../../domain/invites';
import { ideaOf } from '../../domain/ideas';
import { REPORT_DETAIL_MAX, REPORT_REASONS, REPORTS_PER_DAY } from '../../domain/safety';
import type { BlockedPerson, CodeKind, Invite, MyContact, NewInvite, OnboardingInput, Profile, ReportReason, Reveal } from '../../domain/types';
import { quiet } from '../../lib/log';
import type { Backend, BackendEvent, Changes, ClientErrorReport, Notice, Snapshot } from '../backend';
import { ALWAYS_PASSES, ME_ID, SEED_ME_RECORD, seedInvites, seedProfiles, seedReveals } from './seed';
import { checkAsk, checkContact, checkProfile } from '../../domain/profile';
import { venueOf, venuePlace } from '../../domain/venues';

const KEY = 'pinkilock.mock.v1';
const LATENCY = 280;
const THEY_ANSWER_AFTER = 7000;
const THEY_SEAL_AFTER = 2400;
const THEY_CHECK_IN_AFTER = 1800;
/** The mock "sends" every sign-in code as this. The phone screen says so in mock mode. */
export const MOCK_CODE = '123456';
/** A signed-out account waits here, under its phone number and its email, until someone signs back in. */
const parked = (kind: CodeKind, address: string) => `${KEY}.${kind}.${address}`;

interface Db {
  me: Profile | null;
  myContact: MyContact | null;
  profiles: Profile[];
  invites: Invite[];
  passedIds: string[];
  due: Record<string, number>;
  /** Kept so the mock honours the same contract; there is no server here to send anything. */
  pushTokens?: string[];
  /** People I blocked. The made-up people never block back. */
  blocked?: { id: string; at: number }[];
  /** Kept only so the contract matches: nothing in the app can read them back. */
  reports?: { profileId: string; reason: ReportReason; detail: string; inviteId: string | null; at: number }[];
  phone?: string | null;
  email?: string | null;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const uid = () => `inv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function createMockBackend(): Backend {
  const clientErrors: ClientErrorReport[] = [];
  let passTimes: number[] = [];
  let db: Db | null = null;
  const reveals = seedReveals();
  const listeners = new Set<(e: BackendEvent) => void>();
  let timer: ReturnType<typeof setInterval> | null = null;

  const fresh = (): Db => ({ me: null, myContact: null, profiles: seedProfiles(), invites: [], passedIds: [], due: {} });

  async function load(): Promise<Db> {
    if (db) return db;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      db = raw ? (JSON.parse(raw) as Db) : fresh();
    } catch {
      db = fresh();
    }
    return db;
  }

  const save = () => {
    if (db) AsyncStorage.setItem(KEY, JSON.stringify(db)).catch(quiet('mock.save'));
  };

  // What RLS would let me see: nobody I blocked, and no invite with them.
  const isBlocked = (d: Db, id: string) => !!d.blocked?.some((b) => b.id === id);
  const visible = (d: Db) => ({
    profiles: d.profiles.filter((p) => !isBlocked(d, p.id)),
    invites: d.invites.filter((i) => !isBlocked(d, rules.otherId(i, ME_ID))),
  });
  const snapshot = (d: Db): Snapshot => ({ me: d.me, myContact: d.myContact, ...visible(d), passedIds: d.passedIds });
  const emit = (changes: Changes, notice?: Notice) => listeners.forEach((l) => l({ changes, notice }));
  const nameOf = (d: Db, id: string) => d.profiles.find((p) => p.id === id)?.name ?? 'They';

  function put(d: Db, next: Invite): Invite {
    d.invites = d.invites.map((i) => (i.id === next.id ? next : i));
    return next;
  }

  function find(d: Db, id: string): Invite {
    const i = visible(d).invites.find((x) => x.id === id);
    if (!i) fail('PL030');
    return i;
  }

  /** Move the kept or flaked count for whoever earned it. Returns the rows that changed. */
  function settle(d: Db, i: Invite): Changes {
    const changes: Changes = { invites: [i] };
    const bump = (id: string, field: 'kept' | 'flaked') => {
      if (id === ME_ID && d.me) {
        d.me = { ...d.me, [field]: d.me[field] + 1 };
        changes.me = d.me;
      } else {
        d.profiles = d.profiles.map((p) => (p.id === id ? { ...p, [field]: p[field] + 1 } : p));
        changes.profiles = d.profiles.filter((p) => p.id === id);
      }
    };
    if (i.status === 'kept') {
      bump(i.fromId, 'kept');
      bump(i.toId, 'kept');
      changes.profiles = d.profiles.filter((p) => p.id === i.fromId || p.id === i.toId);
    } else if (i.status === 'flaked' && i.flakedBy) {
      bump(i.flakedBy, 'flaked');
    }
    return changes;
  }

  /** Once a second: the other person's pending moves, then the clock. */
  function tick() {
    const d = db;
    if (!d || !d.me) return;
    const now = Date.now();
    let dirty = false;

    for (const [id, at] of Object.entries(d.due)) {
      if (at > now) continue;
      delete d.due[id];
      dirty = true;
      const i = d.invites.find((x) => x.id === id);
      if (!i) continue;
      const them = rules.otherId(i, ME_ID);
      const name = nameOf(d, them);
      try {
        if (i.status === 'sent' && i.fromId === ME_ID) {
          if (them === ALWAYS_PASSES) {
            const next = put(d, rules.decline(i, them, now));
            emit({ invites: [next] }, { tone: 'flare', title: `${name} passed`, body: 'No hard feelings. Your ask slot is free again.', inviteId: id });
          } else {
            const next = put(d, rules.offerPinky(i, them, now));
            emit({ invites: [next] }, { tone: 'pink', title: `${name}'s pinky is out`, body: `${ideaOf(i.ideaId).title}. Slide in to seal it.`, inviteId: id });
          }
        } else if (i.status === 'half_locked' && i.firstPinkyBy === ME_ID) {
          const next = put(d, rules.offerPinky(i, them, now));
          emit({ invites: [next] });
        } else if (i.status === 'locked' && i.checkIns.includes(ME_ID) && !i.checkIns.includes(them)) {
          const next = put(d, rules.checkIn(i, them, now));
          emit(settle(d, next), { tone: 'volt', title: 'Promise kept', body: `You and ${name} both showed. The reveal is open.`, inviteId: id });
        }
      } catch {
        // The invite moved on before they acted (expired, bailed). Nothing to do.
      }
    }

    for (const i of d.invites) {
      // The mock person always turns up, so a missed window is mine.
      const waiting =
        i.status === 'locked' && now > i.startsAt + rules.CHECK_IN_CLOSES_AFTER && !i.checkIns.includes(rules.otherId(i, ME_ID))
          ? { ...i, checkIns: [...i.checkIns, rules.otherId(i, ME_ID)] }
          : i;
      const next = rules.sweep(waiting, now);
      if (next.status === i.status) continue;
      put(d, next);
      dirty = true;
      const name = nameOf(d, rules.otherId(i, ME_ID));
      if (next.status === 'flaked') {
        emit(settle(d, next), { tone: 'flare', title: 'Promise missed', body: `Check-in with ${name} closed without you. That is on your record.`, inviteId: i.id });
      } else {
        emit({ invites: [next] });
      }
    }

    if (dirty) save();
  }

  /** Block: they vanish for me and every live invite between us ends, with no flake for anyone. */
  function block(d: Db, profileId: string, now: number): Changes {
    if (!d.me) fail('PL002');
    if (profileId === ME_ID) fail('PL010');
    if (!isBlocked(d, profileId)) d.blocked = [...(d.blocked ?? []), { id: profileId, at: now }];
    const theirs = d.invites.filter((i) => rules.otherId(i, ME_ID) === profileId);
    for (const i of theirs) {
      put(d, rules.endForBlock(i, now));
      delete d.due[i.id];
    }
    return { removed: { profiles: [profileId], invites: theirs.map((i) => i.id) } };
  }

  function start() {
    if (!timer) timer = setInterval(tick, 1000);
  }

  function seedFor(d: Db, input: OnboardingInput): Profile {
    return {
      id: ME_ID, name: input.name, age: input.age, city: 'Mumbai', area: input.area, pronouns: input.pronouns,
      tagline: input.tagline, vibes: input.vibes, ideaIds: input.ideaIds, palette: ['#A9D8F7', '#4169E1'], glyph: '🤙',
      distanceKm: 0, photoCount: 0, ...SEED_ME_RECORD,
    };
  }

  async function mutate(fn: (d: Db, now: number) => Changes): Promise<Changes> {
    const d = await load();
    await wait(LATENCY);
    const changes = fn(d, Date.now());
    save();
    return changes;
  }

  return {
    kind: 'mock',

    async boot() {
      const d = await load();
      await wait(LATENCY);
      start();
      tick();
      return snapshot(d);
    },

    async completeOnboarding(input) {
      checkProfile(input);
      checkContact(input.contactKind, input.contactHandle);
      const d = await load();
      await wait(LATENCY);
      d.me = seedFor(d, input);
      d.myContact = { kind: input.contactKind, handle: input.contactHandle };
      d.invites = seedInvites(Date.now());
      save();
      start();
      return snapshot(d);
    },

    updateMe: (patch) =>
      mutate((d) => {
        if (!d.me) fail('PL002');
        const { contactKind, contactHandle, ...card } = patch;
        const next = { ...d.me, ...card };
        checkProfile(next);
        if (contactKind && contactHandle) checkContact(contactKind, contactHandle);
        d.me = next;
        if (contactKind && contactHandle) d.myContact = { kind: contactKind, handle: contactHandle };
        return { me: d.me, myContact: d.myContact ?? undefined };
      }),

    pass: (profileId) =>
      mutate((d, now) => {
        passTimes = passTimes.filter((t) => t > now - rules.DAY);
        if (passTimes.length >= rules.PASSES_PER_DAY) fail('PL028');
        passTimes.push(now);
        if (!d.passedIds.includes(profileId)) d.passedIds = [...d.passedIds, profileId];
        return { passedIds: d.passedIds };
      }),

    restorePasses: () =>
      mutate((d) => {
        d.passedIds = [];
        return { passedIds: [] };
      }),

    sendInvite: (input: NewInvite) =>
      mutate((d, now) => {
        const open = d.invites.filter((i) => i.fromId === ME_ID && rules.isOpen(i));
        // The link gate: off in the mock unless EXPO_PUBLIC_MOCK_REQUIRE_LINKED=1, as it is off on a server with no code sender.
        if (process.env.EXPO_PUBLIC_MOCK_REQUIRE_LINKED === '1' && !d.phone && !d.email) fail('PL068');
        if (open.length >= rules.MAX_OPEN_ASKS) fail('PL023');
        if (d.invites.filter((i) => i.fromId === ME_ID && i.createdAt > now - rules.DAY).length >= rules.ASKS_PER_DAY) fail('PL025');
        if (d.invites.some((i) => i.fromId === ME_ID && i.toId === input.toId && (i.resolvedAt ?? i.createdAt) > now - rules.REASK_AFTER
          && (i.status === 'expired' || (i.status === 'declined' && i.declinedBy === input.toId)))) fail('PL026');
        if (d.invites.some((i) => rules.isLive(i) && rules.otherId(i, ME_ID) === input.toId)) fail('PL024');
        if (isBlocked(d, input.toId)) fail('PL004');
        if (input.startsAt <= now) fail('PL021');
        // A picked venue: the place comes from the catalogue, as on the server.
        const idea = ideaOf(input.ideaId);
        const venue = input.venueId ? venueOf(input.venueId) : undefined;
        if (input.venueId && (!venue || idea.kind !== 'irl')) fail('PL067');
        const place = venue ? venuePlace(venue) : input.place.trim();
        checkAsk(input.note, venue ? '' : place);
        const invite: Invite = {
          id: uid(), fromId: ME_ID, toId: input.toId, ideaId: input.ideaId, minutes: idea.minutes,
          startsAt: input.startsAt, place, note: input.note.trim().slice(0, rules.NOTE_MAX),
          status: 'sent', createdAt: now, expiresAt: rules.expiryFor(now, input.startsAt),
          firstPinkyBy: null, lockedAt: null, checkIns: [], flakedBy: null, declinedBy: null, resolvedAt: null,
        };
        d.invites = [invite, ...d.invites];
        d.due[invite.id] = now + THEY_ANSWER_AFTER;
        return { invites: [invite] };
      }),

    offerPinky: (inviteId) =>
      mutate((d, now) => {
        const next = put(d, rules.offerPinky(find(d, inviteId), ME_ID, now));
        if (next.status === 'half_locked') d.due[inviteId] = now + THEY_SEAL_AFTER;
        return { invites: [next] };
      }),

    declineInvite: (inviteId) =>
      mutate((d, now) => {
        delete d.due[inviteId];
        return { invites: [put(d, rules.decline(find(d, inviteId), ME_ID, now))] };
      }),

    checkIn: (inviteId) =>
      mutate((d, now) => {
        const next = put(d, rules.checkIn(find(d, inviteId), ME_ID, now));
        if (next.status === 'kept') return settle(d, next);
        d.due[inviteId] = now + THEY_CHECK_IN_AFTER;
        return { invites: [next] };
      }),

    bail: (inviteId) =>
      mutate((d, now) => {
        delete d.due[inviteId];
        return settle(d, put(d, rules.bail(find(d, inviteId), ME_ID, now)));
      }),

    async getReveal(inviteId): Promise<Reveal> {
      const d = await load();
      await wait(LATENCY);
      const i = find(d, inviteId);
      if (i.status !== 'kept') fail('PC003');
      return reveals[rules.otherId(i, ME_ID)];
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    // The other person lives inside this phone and only moves while the app is open, where the
    // in-app banner already announces them. So the mock records the token and sends nothing.
    async registerPushToken(token) {
      const d = await load();
      d.pushTokens = [...new Set([...(d.pushTokens ?? []), token])];
      save();
    },

    async unregisterPushToken(token) {
      const d = await load();
      d.pushTokens = (d.pushTokens ?? []).filter((t) => t !== token);
      save();
    },

    // Kept in memory, last 50, the way the server keeps them: nobody reads them back but a test.
    async logClientError(report) {
      clientErrors.push(report);
      if (clientErrors.length > 50) clientErrors.shift();
    },

    block: (profileId) => mutate((d, now) => block(d, profileId, now)),

    unblock: (profileId) =>
      mutate((d) => {
        d.blocked = (d.blocked ?? []).filter((b) => b.id !== profileId);
        return { profiles: d.profiles.filter((p) => p.id === profileId), invites: d.invites.filter((i) => rules.otherId(i, ME_ID) === profileId) };
      }),

    async blockedPeople(): Promise<BlockedPerson[]> {
      const d = await load();
      await wait(LATENCY);
      return (d.blocked ?? []).map((b) => ({ profileId: b.id, name: nameOf(d, b.id), blockedAt: b.at })).sort((a, b) => b.blockedAt - a.blockedAt);
    },

    report: (input) =>
      mutate((d, now) => {
        if (!d.me) fail('PL002');
        if (!REPORT_REASONS.some((r) => r.id === input.reason)) fail('PL012');
        if (input.detail.length > REPORT_DETAIL_MAX) fail('PL013');
        const today = (d.reports ?? []).filter((r) => r.at > now - rules.DAY);
        if (today.length >= REPORTS_PER_DAY) fail('PL014');
        const shared = d.invites.find((i) => i.id === input.inviteId && rules.otherId(i, ME_ID) === input.profileId);
        d.reports = [...(d.reports ?? []), { profileId: input.profileId, reason: input.reason, detail: input.detail.trim(), inviteId: shared?.id ?? null, at: now }];
        return block(d, input.profileId, now);
      }),

    async exportMyData() {
      const d = await load();
      await wait(LATENCY);
      return JSON.stringify({
        format: 'pinkilock-export-1',
        exported_at: new Date().toISOString(),
        account: { id: ME_ID, phone: d.phone ?? null, email: d.email ?? null, is_anonymous: !d.phone && !d.email, backend: 'mock' },
        profile: d.me,
        contact: d.myContact,
        invites: d.invites.map((i) => ({
          id: i.id, role: i.fromId === ME_ID ? 'asked' : 'was_asked', other_person: rules.otherId(i, ME_ID), idea: i.ideaId,
          starts_at: new Date(i.startsAt).toISOString(), place: i.place, note: i.note, status: i.status,
          my_check_in: i.checkIns.includes(ME_ID), flaked: i.flakedBy === ME_ID,
        })),
        passes: d.passedIds.map((profile) => ({ profile })),
        blocks: (d.blocked ?? []).map((b) => ({ profile: b.id, at: new Date(b.at).toISOString() })),
        reports_made: (d.reports ?? []).map((r) => ({ profile: r.profileId, reason: r.reason, detail: r.detail, at: new Date(r.at).toISOString() })),
        devices: (d.pushTokens ?? []).map(() => ({ platform: 'this phone' })),
      }, null, 2);
    },

    async deleteAccount() {
      await load();
      await wait(LATENCY);
      await AsyncStorage.removeItem(KEY).catch(quiet('mock.clear'));
      db = fresh();
      return snapshot(db);
    },

    async account() {
      const d = await load();
      return { phone: d.phone ?? null, email: d.email ?? null, phoneAvailable: true, emailAvailable: true, mockCode: MOCK_CODE };
    },

    async sendCode(kind, address, mode) {
      const d = await load();
      await wait(LATENCY);
      const what = kind === 'phone' ? 'number' : 'email address';
      if (mode === 'link') {
        if (!d.me) fail('PL002');
        if (await AsyncStorage.getItem(parked(kind, address)).catch(() => null)) {
          fail('PA004', `That ${what} is already on another account. Sign in with it instead.`);
        }
        return;
      }
      if (!(await AsyncStorage.getItem(parked(kind, address)).catch(() => null))) {
        fail('PA005', `No account uses that ${what} yet. Set one up first, then add it in Me.`);
      }
    },

    async verifyCode(kind, address, code, mode) {
      const d = await load();
      await wait(LATENCY);
      if (code !== MOCK_CODE) fail('PA006');
      if (mode === 'link') {
        if (kind === 'phone') d.phone = address;
        else d.email = address;
        save();
        return snapshot(d);
      }
      const raw = await AsyncStorage.getItem(parked(kind, address));
      if (!raw) fail('PA005', `No account uses that ${kind === 'phone' ? 'number' : 'email address'} yet. Set one up first, then add it in Me.`);
      db = JSON.parse(raw) as Db;
      if (db.phone) await AsyncStorage.removeItem(parked('phone', db.phone));
      if (db.email) await AsyncStorage.removeItem(parked('email', db.email));
      save();
      start();
      return snapshot(db);
    },

    async signOut() {
      const d = await load();
      if (!d.phone && !d.email) fail('PA008');
      const json = JSON.stringify(d);
      if (d.phone) await AsyncStorage.setItem(parked('phone', d.phone), json);
      if (d.email) await AsyncStorage.setItem(parked('email', d.email), json);
      db = fresh();
      save();
      return snapshot(db);
    },

    async demoReset() {
      await AsyncStorage.removeItem(KEY).catch(quiet('mock.clear'));
      db = fresh();
      return snapshot(db);
    },

    demoBringForward: (inviteId) =>
      mutate((d, now) => {
        const i = find(d, inviteId);
        if (i.status !== 'locked') fail('PC004', 'Only a locked plan can be brought forward.');
        return { invites: [put(d, { ...i, startsAt: now + 3 * rules.MIN })] };
      }),
  };
}
