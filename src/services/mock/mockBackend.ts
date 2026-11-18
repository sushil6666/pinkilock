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
import { ASK_LINES, ideaOf } from '../../domain/ideas';
import { REPORT_DETAIL_MAX, REPORT_REASONS, REPORTS_PER_DAY } from '../../domain/safety';
import type { BlockedPerson, CodeKind, Invite, MyContact, NewInvite, OnboardingInput, Profile, ReportReason, Reveal } from '../../domain/types';
import { quiet } from '../../lib/log';
import type { Backend, BackendEvent, Changes, ClientErrorReport, Notice, Snapshot } from '../backend';
import { ALWAYS_PASSES, ME_ID, SEED_DUOS, SEED_ME_RECORD, seedFriend, seedInvites, seedProfiles, seedReveals } from './seed';
import { PROVABLE_KINDS, checkAsk, checkContact, checkProfile } from '../../domain/profile';
import { venueOf, venuePlace } from '../../domain/venues';
import { ALL_CONSENTS, CITIES, openCities } from '../../domain/countries';

const cityCountry = (city: string) => CITIES.find((c) => c.name === city)?.country ?? 'IN';
import { FREE_WINDOWS } from '../../domain/freeWindows';
import { VOUCH_MAX_PICKS, VOUCH_PHRASES } from '../../domain/vouches';
import { t } from '../../i18n';

const KEY = 'pinkilock.mock.v1';
const LATENCY = 280;
const THEY_ANSWER_AFTER = 7000;
const THEY_SEAL_AFTER = 2400;
const THEY_CHECK_IN_AFTER = 1800;
/** How long the made-up friend takes to join my duo after I make a link. */
const FRIEND_JOINS_AFTER = 3000;
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
  /** My duo partner (docs/build-plan.md F3). */
  duoId?: string | null;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const uid = () => `inv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function createMockBackend(): Backend {
  const clientErrors: ClientErrorReport[] = [];
  let passTimes: number[] = [];
  const codeTries = new Map<string, { fails: number; until: number }>();
  /** When the name and the line last changed (the first ones after joining are free). */
  const changed: { name?: number; tagline?: number } = {};
  const ratings = new Map<string, boolean>();
  const vouchLinks = new Map<string, number>();
  const duoLinks: { token: string; at: number }[] = [];
  let db: Db | null = null;
  const reveals = seedReveals();
  /** Flags I raised, by invite and person. The made-up people never flag my handle. */
  const flagged = new Set<string>();
  let proofTimer: ReturnType<typeof setTimeout> | null = null;
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
    invites: d.invites.filter((i) => !rules.peopleOf(i).some((id) => isBlocked(d, id))),
  });
  const snapshot = (d: Db): Snapshot => ({ me: d.me, myContact: d.myContact, ...visible(d), passedIds: d.passedIds, duoId: d.duoId ?? null });
  const emit = (changes: Changes, notice?: Notice) => listeners.forEach((l) => l({ changes, notice }));
  const nameOf = (d: Db, id: string) => d.profiles.find((p) => p.id === id)?.name ?? t('ask.they');

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
    // On a double, everyone who did not check in when the window closed is a no-show of their own.
    const missing = rules.isDouble(i) && !(i.status === 'flaked' && i.flakedBy) ? rules.peopleOf(i).filter((id) => !i.checkIns.includes(id)) : [];
    if (i.status === 'kept') {
      i.checkIns.forEach((id) => bump(id, 'kept'));
      missing.forEach((id) => bump(id, 'flaked'));
      changes.profiles = d.profiles.filter((p) => rules.peopleOf(i).includes(p.id));
    } else if (i.status === 'flaked' && i.flakedBy) {
      bump(i.flakedBy, 'flaked');
    } else if (i.status === 'flaked') {
      missing.forEach((id) => bump(id, 'flaked'));
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
      if (id.startsWith('duo:')) {
        // The made-up friend opens my duo link.
        if (d.duoId) continue;
        const friend = seedFriend();
        d.duoId = friend.id;
        d.profiles = [...d.profiles.filter((p) => p.id !== friend.id), friend];
        emit({ duoId: friend.id, profiles: [friend] }, { tone: 'volt', title: t('notices.duoJoined', { name: friend.name }), body: t('notices.duoJoinedBody') });
        continue;
      }
      const i = d.invites.find((x) => x.id === id);
      if (!i) continue;
      if (rules.isDouble(i)) {
        try {
          if (rules.isOpen(i) && i.fromId === ME_ID) {
            // The other three put their pinky out together; then it is mine to seal.
            let next = i;
            for (const who of rules.peopleOf(i).filter((p) => p !== ME_ID)) next = rules.offerPinky(next, who, now);
            put(d, next);
            emit({ invites: [next] }, { tone: 'pink', title: t('lock.allThree'), body: t('notices.slideToSeal', { idea: ideaOf(i.ideaId).title }), inviteId: id });
          } else if (i.status === 'locked' && i.checkIns.includes(ME_ID)) {
            let next = i;
            for (const who of rules.peopleOf(i).filter((p) => !next.checkIns.includes(p))) next = rules.checkIn(next, who, now);
            put(d, next);
            emit(settle(d, next), { tone: 'volt', title: t('status.kept'), body: t('notices.allFourBody'), inviteId: id });
          }
        } catch {
          // The plan moved on before they acted.
        }
        continue;
      }
      const them = rules.otherId(i, ME_ID);
      const name = nameOf(d, them);
      try {
        if (i.status === 'sent' && i.fromId === ME_ID) {
          if (them === ALWAYS_PASSES) {
            const next = put(d, rules.decline(i, them, now));
            emit({ invites: [next] }, { tone: 'flare', title: t('notices.passed', { name }), body: t('notices.passedBody'), inviteId: id });
          } else {
            const next = put(d, rules.offerPinky(i, them, now));
            emit({ invites: [next] }, { tone: 'pink', title: t('status.theirPinkyOut', { name }), body: t('notices.slideToSeal', { idea: ideaOf(i.ideaId).title }), inviteId: id });
          }
        } else if (i.status === 'half_locked' && i.firstPinkyBy === ME_ID) {
          const next = put(d, rules.offerPinky(i, them, now));
          emit({ invites: [next] });
        } else if (i.status === 'locked' && i.checkIns.includes(ME_ID) && !i.checkIns.includes(them)) {
          const next = put(d, rules.checkIn(i, them, now));
          emit(settle(d, next), { tone: 'volt', title: t('status.kept'), body: t('notices.keptBody', { name }), inviteId: id });
        }
      } catch {
        // The invite moved on before they acted (expired, bailed). Nothing to do.
      }
    }

    for (const i of d.invites) {
      // The mock person always turns up, so a missed window is mine.
      const others = rules.peopleOf(i).filter((p) => p !== ME_ID && !i.checkIns.includes(p));
      const waiting =
        i.status === 'locked' && now > i.startsAt + rules.CHECK_IN_CLOSES_AFTER && others.length
          ? { ...i, checkIns: [...i.checkIns, ...others] }
          : i;
      const next = rules.sweep(waiting, now);
      if (next.status === i.status) continue;
      put(d, next);
      dirty = true;
      const name = nameOf(d, rules.otherId(i, ME_ID));
      if (next.status === 'flaked') {
        emit(settle(d, next), { tone: 'flare', title: t('notices.missed'), body: t('notices.missedBody', { name }), inviteId: i.id });
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
    const theirs = d.invites.filter((i) => rules.peopleOf(i).includes(profileId));
    for (const i of theirs) {
      put(d, rules.endForBlock(i, now));
      delete d.due[i.id];
    }
    const changes: Changes = { removed: { profiles: [profileId], invites: theirs.map((i) => i.id) } };
    // A block between duo partners ends the duo.
    if (d.duoId === profileId) {
      d.duoId = null;
      changes.duoId = null;
    }
    return changes;
  }

  function start() {
    if (!timer) timer = setInterval(tick, 1000);
  }

  function seedFor(d: Db, input: OnboardingInput): Profile {
    return {
      id: ME_ID, name: input.name, age: input.age, city: input.city ?? 'Mumbai', country: cityCountry(input.city ?? 'Mumbai'), area: input.area, pronouns: input.pronouns,
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
      if (!ALL_CONSENTS.every((k) => input.consents?.includes(k))) fail('PL077');
      // The same order of checks as save_profile: where, then the card, then the contact.
      const city = input.city ?? 'Mumbai';
      if (!openCities().some((c) => c.name === city)) fail('PL076');
      checkProfile(input, city);
      const handle = checkContact(input.contactKind, input.contactHandle, cityCountry(city));
      const d = await load();
      await wait(LATENCY);
      d.me = seedFor(d, input);
      d.myContact = { kind: input.contactKind, handle, verified: false };
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
        checkProfile(next, d.me.city, { area: d.me.area, pronouns: d.me.pronouns, ideaIds: d.me.ideaIds });
        const now = Date.now();
        if (next.name !== d.me.name && (changed.name ?? 0) > now - 30 * rules.DAY) fail('PL070');
        if (next.tagline !== d.me.tagline && (changed.tagline ?? 0) > now - 7 * rules.DAY) fail('PL071');
        if (next.name !== d.me.name) changed.name = now;
        if (next.tagline !== d.me.tagline) changed.tagline = now;
        const handle = contactKind && contactHandle ? checkContact(contactKind, contactHandle, d.me.country ?? 'IN') : null;
        d.me = next;
        if (contactKind && handle) {
          const same = d.myContact?.kind === contactKind && d.myContact.handle === handle;
          d.myContact = { kind: contactKind, handle, verified: same ? !!d.myContact?.verified : false };
        }
        return { me: d.me, myContact: d.myContact ?? undefined };
      }),

    // Links work inside this phone only: there is no one else to open them.
    async createVouchLink() {
      const token = Math.random().toString(16).slice(2, 10).padEnd(16, '0');
      vouchLinks.set(token, 0);
      return token;
    },
    async vouchFor(token) {
      const d = await load();
      return vouchLinks.has(token) ? d.me?.name ?? null : null;
    },
    async vouch(token, phrases) {
      if (!vouchLinks.has(token)) fail('PL085');
      if (phrases.length < 1 || phrases.length > VOUCH_MAX_PICKS || phrases.some((p) => !(VOUCH_PHRASES as readonly string[]).includes(p))) fail('PL087');
      fail('PL086');
    },

    // Duo links work inside this phone only: a made-up friend "opens" mine a few seconds later.
    createDuoLink: async () => {
      const d = await load();
      if (!d.me) fail('PL002');
      if (d.duoId) fail('PL088');
      const now = Date.now();
      if (duoLinks.filter((l) => l.at > now - rules.DAY).length >= 3) fail('PL084');
      const token = Math.random().toString(16).slice(2, 10).padEnd(16, '0');
      duoLinks.push({ token, at: now });
      d.due[`duo:${token}`] = now + FRIEND_JOINS_AFTER;
      save();
      return token;
    },
    // The only links here are my own, and my own link shows me no name, as on the server.
    async duoLinkName() {
      return null;
    },
    joinDuo: (token) =>
      mutate((d) => {
        if (d.duoId) fail('PL088');
        if (duoLinks.some((l) => l.token === token)) fail('PL091');
        fail('PL089');
      }),
    leaveDuo: () =>
      mutate((d) => {
        d.duoId = null;
        return { duoId: null };
      }),

    saveAvailability: (windows) =>
      mutate((d) => {
        if (!d.me) fail('PL002');
        if (windows.some((w) => !FREE_WINDOWS.some((x) => x.id === w))) fail('PL083');
        d.me = { ...d.me, freeWindows: FREE_WINDOWS.map((x) => x.id).filter((id) => windows.includes(id)) };
        return { me: d.me };
      }),

    // Requests go nowhere in the mock; there is no moderator.
    async fileRequest(_kind, detail) {
      if (!detail.trim() || detail.length > 500) fail('PL013');
    },
    async myModeration() {
      return [];
    },

    // The made-up other person always wants round two, so the whole flow can be seen.
    async rateDate(inviteId, answer) {
      const d = await load();
      if (find(d, inviteId).status !== 'kept') fail('PL074');
      if (!ratings.has(inviteId)) ratings.set(inviteId, answer.again);
    },

    async dateFeedback(inviteId) {
      const mine = ratings.get(inviteId);
      return { rated: mine !== undefined, roundTwo: mine === true };
    },

    // The mock has no review step: what I write is what the card shows.
    async myLineReview() {
      return null;
    },

    // Every made-up person is already in the snapshot.
    async moreProfiles() {
      return {};
    },

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
        if (input.note.trim() && !ASK_LINES.includes(input.note.trim())) fail('PL069');
        checkAsk(input.note, venue ? '' : place);
        // A double: my duo partner comes, and so does theirs.
        const toFriend = input.double ? SEED_DUOS[input.toId] : undefined;
        if (input.double && !d.duoId) fail('PL092');
        if (input.double && !toFriend) fail('PL093');
        const invite: Invite = {
          id: uid(), fromId: ME_ID, toId: input.toId, ideaId: input.ideaId, minutes: idea.minutes,
          startsAt: input.startsAt, place, note: input.note.trim().slice(0, rules.NOTE_MAX),
          status: 'sent', createdAt: now, expiresAt: rules.expiryFor(now, input.startsAt),
          firstPinkyBy: null, lockedAt: null, checkIns: [], flakedBy: null, declinedBy: null, resolvedAt: null,
          ...(toFriend ? { fromFriendId: d.duoId, toFriendId: toFriend, pinkies: [] } : {}),
        };
        d.invites = [invite, ...d.invites];
        d.due[invite.id] = now + THEY_ANSWER_AFTER;
        return { invites: [invite] };
      }),

    offerPinky: (inviteId) =>
      mutate((d, now) => {
        const next = put(d, rules.offerPinky(find(d, inviteId), ME_ID, now));
        if (next.status === 'half_locked' && !rules.isDouble(next)) d.due[inviteId] = now + THEY_SEAL_AFTER;
        return { invites: [next] };
      }),

    declineInvite: (inviteId) =>
      mutate((d, now) => {
        delete d.due[inviteId];
        return { invites: [put(d, rules.decline(find(d, inviteId), ME_ID, now))] };
      }),

    async myCheckInCode(inviteId) {
      const d = await load();
      const i = find(d, inviteId);
      if (i.status !== 'locked') fail('PL034');
      if (rules.checkInPhase(i, Date.now()) !== 'open') fail('PL035');
      return rules.mockCheckInCode(inviteId, ME_ID);
    },

    demoTheirCode: (inviteId) => rules.mockCheckInCode(inviteId, 'them'),

    checkIn: (inviteId, theirCode) =>
      mutate((d, now) => {
        const i = find(d, inviteId);
        if (i.status !== 'locked') fail('PL034');
        if (rules.checkInPhase(i, now) !== 'open') fail('PL035');
        const tries = codeTries.get(inviteId) ?? { fails: 0, until: 0 };
        if (tries.until > now) fail('PL037');
        if (theirCode.trim() !== rules.mockCheckInCode(inviteId, 'them')) {
          tries.fails += 1;
          if (tries.fails >= rules.CODE_TRIES) Object.assign(tries, { fails: 0, until: now + rules.CODE_LOCK });
          codeTries.set(inviteId, tries);
          fail('PL039');
        }
        const next = put(d, rules.checkIn(i, ME_ID, now));
        if (next.status === 'kept') return settle(d, next);
        d.due[inviteId] = now + THEY_CHECK_IN_AFTER;
        return { invites: [next] };
      }),

    bail: (inviteId) =>
      mutate((d, now) => {
        delete d.due[inviteId];
        return settle(d, put(d, rules.bail(find(d, inviteId), ME_ID, now)));
      }),

    async getReveal(inviteId, profileId): Promise<Reveal> {
      const d = await load();
      await wait(LATENCY);
      const i = find(d, inviteId);
      const them = profileId ?? rules.otherId(i, ME_ID);
      if (!rules.canReveal(i, ME_ID, them) || !reveals[them]) fail('PC003');
      return reveals[them];
    },

    async reportBadContact(inviteId, ownerId) {
      const d = await load();
      await wait(LATENCY);
      const i = d.invites.find((x) => x.id === inviteId);
      if (!i || ownerId === ME_ID || !rules.canReveal(i, ME_ID, ownerId) || (i.resolvedAt ?? 0) < Date.now() - 7 * rules.DAY) fail('PL100');
      flagged.add(`${inviteId}/${ownerId}`);
    },

    async myContactFlags() {
      return 0;
    },

    // There is no WhatsApp here: the mock plays the person sending the code a few seconds later.
    async startContactCheck() {
      const d = await load();
      await wait(LATENCY);
      const mine = d.myContact;
      if (!mine) fail('PL066');
      if (!PROVABLE_KINDS.includes(mine.kind)) fail('PL101');
      const check = { code: 'PINKY-4F2A9C', kind: mine.kind, to: mine.kind === 'WhatsApp' ? '919800000000' : 'pinkilock', verified: !!mine.verified };
      if (!mine.verified) {
        if (proofTimer) clearTimeout(proofTimer);
        proofTimer = setTimeout(() => {
          if (!d.myContact || d.myContact.handle !== mine.handle) return;
          d.myContact = { ...d.myContact, verified: true };
          save();
          emit({ myContact: d.myContact }, { tone: 'volt', title: t('contact.verifiedTitle'), body: t('contact.verifiedBody', { kind: mine.kind }) });
        }, 6000);
      }
      return check;
    },

    async myContactStatus() {
      return (await load()).myContact;
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
        return { profiles: d.profiles.filter((p) => p.id === profileId), invites: d.invites.filter((i) => rules.peopleOf(i).includes(profileId)) };
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
        duo: d.duoId ? { partner: d.duoId } : null,
        invites: d.invites.map((i) => ({
          id: i.id, role: i.fromId === ME_ID ? 'asked' : 'was_asked', other_person: rules.otherId(i, ME_ID), idea: i.ideaId,
          with: rules.isDouble(i) ? [i.fromFriendId, i.toFriendId] : undefined,
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
        fail('PA005', `We could not find an account with that ${what}. Create one first, then add it from the Me tab.`);
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
      if (!raw) fail('PA005', `We could not find an account with that ${kind === 'phone' ? 'number' : 'email address'}. Create one first, then add it from the Me tab.`);
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
