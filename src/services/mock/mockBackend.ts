/**
 * The mock backend: the same contract as Supabase, served from memory.
 *
 * It keeps a tiny database in AsyncStorage, answers with a little latency, and plays the other
 * person: they put their pinky out, seal a lock, check in or pass. What they will do next is
 * stored as a due time per invite (`db.due`), so a restart never loses a pending reaction.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as rules from '../../domain/invites';
import { ideaOf } from '../../domain/ideas';
import type { Invite, MyContact, NewInvite, OnboardingInput, Profile, Reveal } from '../../domain/types';
import type { Backend, BackendEvent, Changes, Notice, Snapshot } from '../backend';
import { ALWAYS_PASSES, ME_ID, SEED_ME_RECORD, seedInvites, seedProfiles, seedReveals } from './seed';

const KEY = 'pinkilock.mock.v1';
const LATENCY = 280;
const THEY_ANSWER_AFTER = 7000;
const THEY_SEAL_AFTER = 2400;
const THEY_CHECK_IN_AFTER = 1800;

interface Db {
  me: Profile | null;
  myContact: MyContact | null;
  profiles: Profile[];
  invites: Invite[];
  passedIds: string[];
  due: Record<string, number>;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const uid = () => `inv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function createMockBackend(): Backend {
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
    if (db) AsyncStorage.setItem(KEY, JSON.stringify(db)).catch(() => {});
  };

  const snapshot = (d: Db): Snapshot => ({ me: d.me, myContact: d.myContact, profiles: d.profiles, invites: d.invites, passedIds: d.passedIds });
  const emit = (changes: Changes, notice?: Notice) => listeners.forEach((l) => l({ changes, notice }));
  const nameOf = (d: Db, id: string) => d.profiles.find((p) => p.id === id)?.name ?? 'They';

  function put(d: Db, next: Invite): Invite {
    d.invites = d.invites.map((i) => (i.id === next.id ? next : i));
    return next;
  }

  function find(d: Db, id: string): Invite {
    const i = d.invites.find((x) => x.id === id);
    if (!i) throw new Error('That invite is gone.');
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

  function start() {
    if (!timer) timer = setInterval(tick, 1000);
  }

  function seedFor(d: Db, input: OnboardingInput): Profile {
    return {
      id: ME_ID, name: input.name, age: input.age, city: 'Mumbai', area: input.area, pronouns: input.pronouns,
      tagline: input.tagline, vibes: input.vibes, ideaIds: input.ideaIds, palette: ['#F6F6F1', '#3A3A44'], glyph: '🤙',
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
        if (!d.me) throw new Error('Finish setting up first.');
        const { contactKind, contactHandle, ...card } = patch;
        d.me = { ...d.me, ...card };
        if (contactKind && contactHandle) d.myContact = { kind: contactKind, handle: contactHandle };
        return { me: d.me, myContact: d.myContact ?? undefined };
      }),

    pass: (profileId) =>
      mutate((d) => {
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
        if (open.length >= rules.MAX_OPEN_ASKS) throw new Error(`You have ${rules.MAX_OPEN_ASKS} asks open. Wait for an answer first.`);
        if (d.invites.some((i) => rules.isLive(i) && rules.otherId(i, ME_ID) === input.toId)) throw new Error('You two already have something open.');
        if (input.startsAt <= now) throw new Error('Pick a time that has not passed.');
        const invite: Invite = {
          id: uid(), fromId: ME_ID, toId: input.toId, ideaId: input.ideaId, minutes: ideaOf(input.ideaId).minutes,
          startsAt: input.startsAt, place: input.place.trim(), note: input.note.trim().slice(0, rules.NOTE_MAX),
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
      if (i.status !== 'kept') throw new Error('Locked until you both check in.');
      return reveals[rules.otherId(i, ME_ID)];
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async demoReset() {
      await AsyncStorage.removeItem(KEY).catch(() => {});
      db = fresh();
      return snapshot(db);
    },

    demoBringForward: (inviteId) =>
      mutate((d, now) => {
        const i = find(d, inviteId);
        if (i.status !== 'locked') throw new Error('Only a locked plan can be brought forward.');
        return { invites: [put(d, { ...i, startsAt: now + 3 * rules.MIN })] };
      }),
  };
}
