/**
 * The mock backend: the same contract as Supabase, served from memory.
 *
 * It keeps a tiny database in AsyncStorage, answers with a little latency, and plays the other
 * person: they put their pinky out, seal a lock, check in or pass. What they will do next is
 * stored as a due time per invite (`db.due`), so a restart never loses a pending reaction.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { fail } from '../../domain/errors';
import * as rules from '../../domain/invites';
import { ASK_LINES, ideaOf } from '../../domain/ideas';
import { REPORT_DETAIL_MAX, REPORT_REASONS, REPORTS_PER_DAY } from '../../domain/safety';
import { FACE_WEEK_MS, faceRefusal } from '../../domain/face';
import type { BlockedPerson, CodeKind, Invite, MyContact, MyPhoto, NewInvite, OnboardingInput, Profile, ReportReason, Reveal } from '../../domain/types';
import { quiet } from '../../lib/log';
import type { Backend, BackendEvent, Changes, ClientErrorReport, Notice, Snapshot } from '../backend';
import { ALWAYS_PASSES, ME_ID, SEED_DUOS, SEED_ME_RECORD, inCity, seedFriend, seedInvites, seedProfiles, seedReveals } from './seed';
import { PROVABLE_KINDS, checkAsk, checkContact, checkProfile } from '../../domain/profile';
import { venueOf, venuePlace } from '../../domain/venues';
import { ALL_CONSENTS, CITIES, openCities, movableCities } from '../../domain/countries';

const cityCountry = (city: string) => CITIES.find((c) => c.name === city)?.country ?? 'IN';
import { FREE_WINDOWS } from '../../domain/freeWindows';
import { DAY } from '../../domain/invites';
import { MOCK_VOICE_URL,
  ANSWER_HOURS, CALL_WINDOW_MINUTES, MAX_CALLS, answerVerdict, callVerdict, canMoveFree, checkPicks, firstOverlap, noCall, timerOpen, togetherMinutes,
  type CallAnswer, type CallMinutes, type CallOutcome, type SpicyCall,
} from '../../domain/calls';
import { checkSpicy, spicyClosed, spicyOff, type Boundary, type Spicy } from '../../domain/spicy';
import { SPICY_TERMS_VERSION, checkQuiz } from '../../domain/spicyQuiz';
import { PAUSE_MAX_DAYS, RESET_DAYS, checkSelfNote, dayOf, emptySelfLove, isMood, stepOpen, type SelfLove } from '../../domain/selfLove';
import { VOUCH_MAX_PICKS, VOUCH_PHRASES } from '../../domain/vouches';
import {
  BOOST_MS, COSTS, EXTRA_ASK_MS, KEPT_PAIR_DAYS, KEPT_REWARDS_PER_WEEK, MAX_EARNED, MAX_EXTRA_ASKS, REWARDS, SPICY_UNLOCK, STREAK_DAYS, TREATS,
  TREATS_PER_WEEK, VOUCHER_MS, canStake, topUpsHere, emptyWallet, mockVoucher, spicyShare, split, splitTreat, stakeEnd, streakOf, topUp,
  type LedgerEntry, type LedgerKind, type RewardKind, type Treat, type TreatPartner, type Wallet,
} from '../../domain/wallet';
import { BOOST_VALID_MONTHS, MEMBER_FREE_BOOSTS, addMonths, boostPackOf, canBuy, goldUntilAfter, isShopId, istMonth, istMonthEnd, openAskCap, planOf } from '../../domain/pinkGold';
import { t } from '../../i18n';
import { createMockTalk, emptyMockTalk, type MockTalkDb } from './mockTalk';
import { spicyFreeNext } from '../../domain/paid';

/** D117: payments are paused in the mock too, unless the build sets EXPO_PUBLIC_MOCK_PAID=1. */
const paidOn = () => process.env.EXPO_PUBLIC_MOCK_PAID === '1';

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
  /** Self love (D101), mine alone. `today` is worked out on each read. */
  selfLove?: Omit<SelfLove, 'today'>;
  /** Spicy mode (D103), mine; absent is off. And the people I said yes to. */
  spicy?: Spicy;
  spicyYes?: string[];
  /** Spicy terms (D107): when I passed the quiz, by terms version. */
  spicyPassed?: Record<number, number>;
  /** D111: whom I chose to share my usernames with, after a kept call. The made-up people always share back. */
  spicyShares?: string[];
  /** The wallet (D104), as the server's tables hold it. */
  wallet?: MockWallet;
  /** Spicy call times (D106), by the other person, oldest first. */
  spicyCalls?: Record<string, MockCall[]>;
  /** Talk mode (D108), mine. */
  talk?: MockTalkDb;
}

/** A call as private.spicy_calls holds it, from my side. The made-up person is always on time. */
interface MockCall {
  id: string;
  status: 'picking' | 'set' | 'asking' | 'done';
  mySlots: number[];
  theirSlots: number[];
  myMinutes: CallMinutes | null;
  theirMinutes: CallMinutes | null;
  startsAt: number | null;
  minutes: number | null;
  moves: number;
  /** Minute starts on the timer. */
  myMins: number[];
  theirMins: number[];
  myBeat: number | null;
  theirBeat: number | null;
  ended: boolean;
  askedAt: number | null;
  myAnswer: CallAnswer | null;
  theirAnswer: CallAnswer | null;
  outcome: CallOutcome | null;
  fault: 'me' | 'them' | 'both' | null;
  refunded: number;
  stoppedByMe: boolean;
  at: number;
  /** D111: a voice room was opened, and who is on it (the made-up person joins when I do). */
  voice?: boolean;
  myOn?: boolean;
}

interface MockWallet {
  paid: number;
  earned: number;
  boostUntil: number | null;
  extraAsks: number[];
  stakes: Record<string, { paid: number; earned: number; ended?: 'back' | 'lost' }>;
  treats: Record<string, Omit<Treat, 'inviteId'> & { at: number; readyAt?: number }>;
  visits: string[];
  /** Ledger rows, newest first; `ref` makes one happen once, as on the server. */
  ledger: (LedgerEntry & { paid: number; earned: number; ref?: string; other?: string })[];
  /** Spicy unlock (D105): what I paid towards each match. The made-up people never pay. */
  spicyPaid: Record<string, number>;
  spicyDone: string[];
  /** D117: when I used a free unlock (payments paused), newest last. */
  spicyFree?: number[];
  /** Pink Gold (D115, D116): when mine ends; absent when I never had it. */
  goldUntil?: number;
  /** Boosts (D116): bought ones and a member's free ones, until used or lapsed. */
  boosts?: { source: 'bought' | 'member'; ref: string; expires: number; used?: number }[];
  /** Months (Indian time) in which my free Saathi session as a member was used. */
  saathiMonths?: string[];
}

/**
 * The mock runs as if there were a partner place in my city, so Treat the plan can be tried.
 * Live, public.treat_partners is empty until a real café or cinema signs. i18n: data
 */
const mockPartner = (city: string): TreatPartner => ({ id: 'demo_partner', name: 'Demo café & cinema', city, items: ['coffee', 'dessert', 'movie'] });

/**
 * The made-up people who have Spicy mode on, with what the server would hold for them. They say
 * yes when I do (the mock has nobody to wait for); the rest have it off, so their cards show
 * nothing, as live.
 */
const SPICY_PEOPLE: Record<string, { discord: string | null; telegram: string | null; signal: string | null; boundaries: Boundary[] }> = {
  aanya: { discord: 'aanya.after.dark', telegram: null, signal: 'aanya.27', boundaries: ['ask_first', 'face_private'] },
  kabir: { discord: 'kabir_k', telegram: 'kabir_talks', signal: null, boundaries: ['words_only'] },
  ira: { discord: null, telegram: 'ira_paints', signal: null, boundaries: ['slow', 'no_video'] },
  zoya: { discord: 'zoya.z', telegram: null, signal: null, boundaries: [] },
  rhea: { discord: 'rhea.waves', telegram: 'rhea_waves', signal: 'rhea.11', boundaries: ['ask_first', 'no_photos'] },
};

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const uid = () => `inv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function createMockBackend(options: { captcha?: () => Promise<string | undefined> } = {}): Backend {
  /** As the live backend: a captcha token before a sign-in code, while captcha is on (D091). */
  const captcha = options.captcha ?? (async () => undefined);
  const clientErrors: ClientErrorReport[] = [];
  let passTimes: number[] = [];
  const codeTries = new Map<string, { fails: number; until: number }>();
  /** When the name and the line last changed (the first ones after joining are free). */
  const changed: { name?: number; tagline?: number; city?: number } = {};
  const ratings = new Map<string, boolean>();
  const vouchLinks = new Map<string, number>();
  const duoLinks: { token: string; at: number }[] = [];
  let db: Db | null = null;
  const reveals = seedReveals();
  /** Flags I raised, by invite and person. The made-up people never flag my handle. */
  const flagged = new Set<string>();
  /**
   * My photos (D088), in memory only. The same rules as the server: three at most, six uploads a
   * week. A person checks each one on the server; here, a stand-in "moderator" approves a photo
   * three seconds after it was added, so the whole flow can be tried alone.
   */
  let myPhotoList: { id: string; uri: string; at: number }[] = [];
  let photoUploads: number[] = [];
  const PHOTO_CHECK_MS = 3000;
  const listPhotos = (): MyPhoto[] =>
    myPhotoList.map((p) => ({ id: p.id, url: p.uri, status: Date.now() - p.at >= PHOTO_CHECK_MS ? 'approved' : 'pending' }));
  /**
   * My face (D095), in memory: the same rules as the server (src/domain/face.ts), and the same
   * stand-in moderator. Once approved, a new face replaces the old one. The made-up people keep
   * their drawn portraits: the prototype ships no photographs of real people.
   */
  let myFaceList: { id: string; uri: string; at: number; status: MyPhoto['status'] }[] = [];
  let faceTries: number[] = [];
  const listFace = (): MyPhoto[] => {
    const done = myFaceList.find((f) => f.status === 'pending' && Date.now() - f.at >= PHOTO_CHECK_MS);
    if (done) myFaceList = [{ ...done, status: 'approved' }];
    return myFaceList.map((f) => ({ id: f.id, url: f.uri, status: f.status, at: f.at }));
  };
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
        const friend = inCity(seedFriend(), d.me?.city ?? 'Mumbai', 3);
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
    callStop(d, profileId);
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

  /** Self love as the server would answer: today where I am, the last 60 days of moods, a pause only while it lasts. */
  function selfOf(d: Db): SelfLove {
    const now = Date.now();
    const today = dayOf(now);
    const s = d.selfLove ?? emptySelfLove(today);
    const since = dayOf(now - 60 * DAY);
    return {
      today,
      moods: s.moods.filter((m) => m.day > since),
      notes: s.notes,
      pausedUntil: s.pausedUntil && s.pausedUntil > now ? s.pausedUntil : null,
      reset: s.reset,
    };
  }
  async function selfChange(fn: (s: SelfLove, now: number) => SelfLove): Promise<SelfLove> {
    const d = await load();
    await wait(LATENCY);
    if (!d.me) fail('PL002');
    const { today: _today, ...next } = fn(selfOf(d), Date.now());
    d.selfLove = next;
    save();
    return selfOf(d);
  }

  /** As private.spicy_passed: a pass for the terms in force. The made-up people have all passed. */
  const spicyPassed = (d: Db) => !!d.spicyPassed?.[SPICY_TERMS_VERSION];

  /** As spicy_with_for in SQL: closed unless both on (and past the quiz), a card I can see, nobody blocked. Every made-up card is one I can see. */
  function mockSpicyPlan(d: Db, them: string) {
    const theirs = SPICY_PEOPLE[them];
    if (!d.me || !d.spicy?.on || !spicyPassed(d) || !theirs || isBlocked(d, them) || !d.profiles.some((p) => p.id === them)) return spicyClosed;
    const myYes = !!d.spicyYes?.includes(them);
    const w = walletOf(d);
    const done = myYes && w.spicyDone.includes(them);
    const unlock = {
      mine: w.spicyPaid[them] ?? 0, theirs: 0, done: w.spicyDone.includes(them),
      ...(paidOn() ? {} : { free: true, freeNext: spicyFreeNext(w.spicyFree ?? [], Date.now()) }),
    };
    // D111: the usernames wait for a kept call and for both to share (the made-up person always does).
    const keptCall = done && (d.spicyCalls?.[them] ?? []).some((c) => c.outcome === 'talked');
    const myShare = !!d.spicyShares?.includes(them);
    const shown = keptCall && myShare;
    return { open: true, myYes, mutual: myYes, theirBoundaries: theirs.boundaries, unlock, keptCall, myShare, discord: shown ? theirs.discord : null, telegram: shown ? theirs.telegram : null, signal: shown ? theirs.signal : null };
  }


  // --- The wallet (D104), as in supabase/migrations/20261125000003_wallet.sql. ---------------
  function walletOf(d: Db): MockWallet {
    d.wallet ??= { paid: 0, earned: 0, boostUntil: null, extraAsks: [], stakes: {}, treats: {}, visits: [], ledger: [], spicyPaid: {}, spicyDone: [] };
    d.wallet.spicyPaid ??= {};
    d.wallet.spicyDone ??= [];
    return d.wallet;
  }
  function move(w: MockWallet, kind: LedgerKind, paid: number, earned: number, ref?: string, reward?: RewardKind): boolean {
    if (ref && w.ledger.some((l) => l.kind === kind && l.ref === ref)) return false;
    if (kind === 'reward') earned = Math.min(earned, Math.max(MAX_EARNED - w.earned, 0));
    if (kind === 'reward' && earned <= 0) return false;
    if (w.paid + paid < 0 || w.earned + earned < 0) fail('PL132');
    w.paid += paid;
    w.earned += earned;
    w.ledger.unshift({ id: `l${Date.now().toString(36)}${w.ledger.length}`, kind, credits: paid + earned, paid, earned, at: Date.now(), ref, reward });
    return true;
  }
  const reward = (w: MockWallet, kind: RewardKind, ref: string) => move(w, 'reward', 0, REWARDS[kind], `${kind}:${ref}`, kind);
  function spend(w: MockWallet, kind: LedgerKind, cost: number, ref?: string) {
    const part = split(w, cost);
    move(w, kind, -part.paid, -part.earned, ref);
    return part;
  }
  /** What the triggers do on the server: settle stakes and treats, and reward kept plans. */
  function settleWallet(d: Db, now: number) {
    const w = walletOf(d);
    for (const [id, st] of Object.entries(w.stakes)) {
      if (st.ended) continue;
      const inv = d.invites.find((i) => i.id === id);
      const end = inv ? stakeEnd(inv.status, !inv.flakedBy ? 'nobody' : inv.flakedBy === ME_ID ? 'me' : 'them', (inv.startsAt - (inv.resolvedAt ?? now)) / 3_600_000) : 'back';
      if (end === 'back') move(w, 'stake_back', st.paid, st.earned, id);
      if (end === 'lost') move(w, 'stake_lost', 0, 0, id);
      if (end !== 'held') st.ended = end;
    }
    for (const [id, tr] of Object.entries(w.treats)) {
      const inv = d.invites.find((i) => i.id === id);
      if (tr.status === 'held' && inv?.status === 'kept') Object.assign(tr, { status: 'ready', readyAt: now, until: now + VOUCHER_MS, code: tr.mine ? null : mockVoucher(id) });
      else if (tr.status === 'held' && (!inv || inv.status !== 'locked')) tr.status = 'back';
      else if (tr.status === 'ready' && (tr.readyAt ?? now) + VOUCHER_MS < now) tr.status = 'back';
      if (tr.status === 'back' && tr.mine) move(w, 'treat_back', tr.credits, 0, id);
    }
    for (const inv of d.invites) {
      if (inv.status !== 'kept' || !inv.checkIns.includes(ME_ID)) continue;
      const other = rules.otherId(inv, ME_ID);
      const week = w.ledger.filter((l) => l.reward === 'kept_plan' && l.at > now - 7 * DAY).length;
      const pair = w.ledger.some((l) => l.reward === 'kept_plan' && l.other === other && l.at > now - KEPT_PAIR_DAYS * DAY);
      if (week < KEPT_REWARDS_PER_WEEK && !pair && reward(w, 'kept_plan', inv.id)) w.ledger[0].other = other;
    }
    if (d.myContact?.verified) reward(w, 'verified_handle', 'once');
  }
  const goldOn = (w: MockWallet, now: number) => !!w.goldUntil && w.goldUntil > now;
  /** A member's two free Boosts for this month (Indian time), once. */
  function memberBoosts(w: MockWallet, now: number) {
    if (!goldOn(w, now)) return;
    const ref = `member:${istMonth(now)}`;
    w.boosts ??= [];
    if (w.boosts.some((b) => b.ref === ref)) return;
    for (let i = 0; i < MEMBER_FREE_BOOSTS; i++) w.boosts.push({ source: 'member', ref, expires: istMonthEnd(now) });
  }
  const boostsLeft = (w: MockWallet, now: number) => (w.boosts ?? []).filter((b) => !b.used && b.expires > now);
  function walletView(d: Db, now = Date.now()): Wallet {
    settleWallet(d, now);
    const w = walletOf(d);
    const today = dayOf(now);
    memberBoosts(w, now);
    const left = boostsLeft(w, now);
    return {
      gold: goldOn(w, now),
      goldUntil: goldOn(w, now) ? w.goldUntil! : null,
      boosts: left.length,
      boostLapses: left.length ? Math.min(...left.map((b) => b.expires)) : null,
      saathiFree: goldOn(w, now) && !(w.saathiMonths ?? []).includes(istMonth(now)),
      ...emptyWallet,
      paid: w.paid,
      earned: w.earned,
      boostUntil: w.boostUntil && w.boostUntil > now ? w.boostUntil : null,
      extraAsks: w.extraAsks.filter((u) => u > now).length,
      stakes: Object.fromEntries(Object.entries(w.stakes).filter(([, st]) => !st.ended).map(([id, st]) => [id, st.paid + st.earned])),
      streak: streakOf(w.visits, today),
      had: (['verified_handle', 'face_checked'] as const).filter((k) => w.ledger.some((l) => l.reward === k)),
      vouchRewards: w.ledger.filter((l) => l.reward === 'vouched').length,
      keptThisWeek: w.ledger.filter((l) => l.reward === 'kept_plan' && l.at > now - 7 * DAY).length,
      treats: Object.entries(w.treats).filter(([id]) => d.invites.some((i) => i.id === id && !isBlocked(d, rules.otherId(i, ME_ID))))
        .map(([inviteId, tr]) => ({ inviteId, item: tr.item, credits: tr.credits, status: tr.status, mine: tr.mine, partner: tr.partner, code: tr.status === 'ready' ? tr.code : null, until: tr.status === 'ready' ? tr.until : null })),
      history: w.ledger.slice(0, 50).map(({ id, kind, credits, at, reward: r }) => ({ id, kind, credits, at, reward: r })),
    };
  }
  async function walletChange(work: (d: Db, w: MockWallet, now: number) => void): Promise<Wallet> {
    const d = await load();
    await wait(LATENCY);
    if (!d.me) fail('PL002');
    const now = Date.now();
    settleWallet(d, now);
    work(d, walletOf(d), now);
    // My own card carries the badge while Pink Gold is on, as profile_cards does.
    const gold = goldOn(walletOf(d), now);
    const badge = d.me && !!d.me.pinkGold !== gold;
    if (badge) d.me = { ...d.me!, pinkGold: gold };
    save();
    if (badge) emit({ me: d.me! });
    return walletView(d, now);
  }
  /** Spicy unlock refunds: a match that closes before it is fully paid gives back what I paid. */
  function spicyRefund(d: Db, them: string) {
    const w = walletOf(d);
    const paid = w.spicyPaid[them] ?? 0;
    if (!paid || w.spicyDone.includes(them)) return;
    move(w, 'spicy_back', paid, 0, `${them}:${Date.now()}:${Math.random()}`);
    delete w.spicyPaid[them];
  }

  // --- Spicy call times (D106), as in supabase/migrations/20261126000001_spicy_calls.sql. ----
  const MINUTE_MS = 60_000;
  const callsWith = (d: Db, them: string): MockCall[] => ((d.spicyCalls ??= {})[them] ??= []);
  const openCall = (d: Db, them: string) => callsWith(d, them).find((c) => c.status !== 'done');
  /** As private.call_settle: the miss counts against whoever missed; the one who showed gets their own part back, once per match. */
  function callSettle(d: Db, them: string, c: MockCall, outcome: CallOutcome, fault: MockCall['fault'], stoppedByMe = false) {
    const w = walletOf(d);
    if ((fault === 'me' || fault === 'both') && d.me) d.me = { ...d.me, flaked: d.me.flaked + 1 };
    if (fault === 'them') {
      const part = w.spicyPaid[them] ?? 0;
      if (part > 0 && move(w, 'spicy_back', part, 0, `call:${them}`)) c.refunded = part;
    }
    Object.assign(c, { status: 'done', outcome, fault, stoppedByMe });
  }
  /** What the sweep does: the hour is over, or the answers have closed. */
  function callSweep(d: Db, now: number) {
    for (const [them, list] of Object.entries(d.spicyCalls ?? {})) {
      for (const c of list) {
        if (c.status === 'set' && c.startsAt !== null && now >= c.startsAt + CALL_WINDOW_MINUTES * MINUTE_MS) callTimer(d, them, c, now);
        if (c.status === 'asking' && c.askedAt !== null && now >= c.askedAt + ANSWER_HOURS * 3_600_000) callAnswers(d, them, c, true);
      }
    }
  }
  function callTimer(d: Db, them: string, c: MockCall, now: number) {
    const last = (mins: number[]) => (mins.length ? (Math.max(...mins) - c.startsAt!) / MINUTE_MS : null);
    const v = callVerdict({ minutes: c.minutes!, together: togetherMinutes(c.myMins, c.theirMins), minsA: c.myMins.length, minsB: c.theirMins.length, lastA: last(c.myMins), lastB: last(c.theirMins) });
    if (v.outcome === 'unclear') Object.assign(c, { status: 'asking', askedAt: now });
    else callSettle(d, them, c, v.outcome, v.fault === 'a' ? 'me' : v.fault === 'b' ? 'them' : v.fault);
  }
  function callAnswers(d: Db, them: string, c: MockCall, closed: boolean) {
    const v = answerVerdict(c.myAnswer, c.theirAnswer, false, false, closed);
    if (v.outcome !== 'wait') callSettle(d, them, c, v.outcome, v.fault === 'a' ? 'me' : v.fault === 'b' ? 'them' : v.fault);
  }
  function callView(d: Db, them: string, now = Date.now()): SpicyCall {
    const plan = mockSpicyPlan(d, them);
    if (!plan.open || !plan.mutual || !plan.unlock.done) return { ...noCall, callsLeft: 0 };
    callSweep(d, now);
    const list = callsWith(d, them);
    const c = openCall(d, them) ?? list[list.length - 1];
    if (!c) return noCall;
    const here = (t: number | null) => t !== null && t > now - 45_000;
    return {
      id: c.id, status: c.status, mySlots: c.mySlots, theirSlots: c.theirSlots, myMinutes: c.myMinutes, theirMinutes: c.theirMinutes,
      noOverlap: c.status === 'picking' && c.mySlots.length > 0 && c.theirSlots.length > 0, startsAt: c.startsAt, minutes: c.minutes,
      together: togetherMinutes(c.myMins, c.theirMins), myStarted: c.myMins.length > 0, theirStarted: c.theirMins.length > 0,
      meHere: c.voice ? !!c.myOn : here(c.myBeat), theyHere: c.voice ? !!c.myOn : here(c.theirBeat), myEnded: c.ended,
      voice: !!c.voice, meOnCall: !!c.myOn, theyOnCall: !!c.myOn,
      canMoveFree: c.status === 'set' && c.startsAt !== null && canMoveFree(c.moves, c.startsAt, now), myAnswer: c.myAnswer,
      answerUntil: c.askedAt !== null ? c.askedAt + ANSWER_HOURS * 3_600_000 : null, outcome: c.outcome, fault: c.fault, refunded: c.refunded,
      stoppedByMe: c.stoppedByMe, callsLeft: Math.max(MAX_CALLS - list.length, 0),
    };
  }
  async function callChange(them: string, work: (d: Db, c: MockCall | undefined, now: number) => void): Promise<SpicyCall> {
    const d = await load();
    await wait(LATENCY);
    const plan = mockSpicyPlan(d, them);
    if (!plan.open) fail('PL130');
    if (!plan.mutual || !plan.unlock.done) fail('PL149');
    const now = Date.now();
    callSweep(d, now);
    work(d, openCall(d, them), now);
    save();
    return callView(d, them, now);
  }
  /** Leaving Spicy, a yes taken back, or a block: an open call stops, and counts against nobody. */
  function callStop(d: Db, them: string) {
    const c = openCall(d, them);
    if (c) callSettle(d, them, c, 'stopped', null);
    if (d.spicyShares) d.spicyShares = d.spicyShares.filter((id) => id !== them);
  }
  // --- Talk mode (D108), as in supabase/migrations/20261126000003_talk.sql: see mockTalk.ts. ---
  let talkDb: Db | null = null;
  const talkPart = createMockTalk({
    async open() {
      const d = await load();
      await wait(LATENCY);
      if (!d.me) fail('PL002');
      d.talk ??= emptyMockTalk();
      talkDb = d;
      return { talk: d.talk, now: Date.now() };
    },
    save,
    move: (kind, paid, earned, ref) => {
      move(walletOf(talkDb!), kind, paid, earned, ref);
    },
    spend: (kind, cost, ref) => {
      spend(walletOf(talkDb!), kind, cost, ref);
    },
    balance: () => ({ paid: walletOf(talkDb!).paid, earned: walletOf(talkDb!).earned }),
    goldSaathi: () => {
      const w = walletOf(talkDb!);
      const now = Date.now();
      if (!goldOn(w, now) || (w.saathiMonths ?? []).includes(istMonth(now))) return false;
      w.saathiMonths = [...(w.saathiMonths ?? []), istMonth(now)];
      return true;
    },
    profileDone: () => ({
      face: myFaceList.some((f) => f.status === 'approved' || Date.now() - f.at >= PHOTO_CHECK_MS),
      handle: !!talkDb?.myContact?.verified,
      plans: (talkDb?.me?.ideaIds.length ?? 0) > 0,
    }),
    linked: () => !!(talkDb?.phone || talkDb?.email),
    age: () => talkDb?.me?.age ?? 0,
    blocked: () => false,
    paid: paidOn,
  });

  return {
    kind: 'mock',
    ...talkPart,

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
      d.profiles = d.profiles.map((p, i) => inCity(p, city, i));
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
        // Moving city (D083): an open city, an area from its list, once a week.
        const moving = next.city !== d.me.city;
        if (moving && !movableCities(goldOn(walletOf(d), Date.now())).some((c) => c.name === next.city)) fail('PL076');
        checkProfile(next, next.city, { area: d.me.area, city: d.me.city, pronouns: d.me.pronouns, ideaIds: d.me.ideaIds });
        const now = Date.now();
        if (moving && (changed.city ?? 0) > now - 7 * rules.DAY) fail('PL105');
        if (moving) {
          changed.city = now;
          next.country = cityCountry(next.city);
        }
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

    async selfLove() {
      const d = await load();
      await wait(LATENCY);
      if (!d.me) fail('PL002');
      return selfOf(d);
    },
    saveMood: (mood) =>
      selfChange((s) => {
        if (!isMood(mood)) fail('PL115');
        return { ...s, moods: [...s.moods.filter((m) => m.day !== s.today), { day: s.today, mood }] };
      }),
    addSelfNote: (kind, body) =>
      selfChange((s, now) => {
        const text = checkSelfNote(kind, body, s);
        return { ...s, notes: [{ id: uid(), kind, body: text, day: s.today, at: now }, ...s.notes] };
      }),
    removeSelfNote: (id) =>
      selfChange((s) => {
        if (!s.notes.some((n) => n.id === id)) fail('PL120');
        return { ...s, notes: s.notes.filter((n) => n.id !== id) };
      }),
    pauseDiscover: (days) =>
      selfChange((s, now) => {
        if (!Number.isInteger(days) || days < 0 || days > PAUSE_MAX_DAYS) fail('PL121');
        return { ...s, pausedUntil: days === 0 ? null : now + days * DAY };
      }),
    startReset: () => selfChange((s) => ({ ...s, reset: { started: s.today, done: [] } })),
    doResetStep: (day) =>
      selfChange((s) => {
        if (!stepOpen(s.reset, day, s.today)) fail('PL122');
        const done = [...new Set([...(s.reset!.done), day])].filter((x) => x >= 1 && x <= RESET_DAYS).sort();
        return { ...s, reset: { started: s.reset!.started, done } };
      }),

    async spicy() {
      const d = await load();
      await wait(LATENCY);
      if (!d.me) fail('PL002');
      return d.spicy ?? spicyOff;
    },
    async saveSpicy(input) {
      const d = await load();
      await wait(LATENCY);
      if (!d.me) fail('PL002');
      if (d.me.age < 18) fail('PL127');
      if (!input.adult || !input.rules) fail('PL127');
      if (!(d.phone || d.email)) fail('PL128');
      if (!spicyPassed(d)) fail('PL154');
      d.spicy = { on: true, ...checkSpicy(input, true), since: Date.now() };
      save();
      return d.spicy;
    },
    async spicyOff() {
      const d = await load();
      await wait(LATENCY);
      if (!d.me) fail('PL002');
      for (const them of d.spicyYes ?? []) {
        spicyRefund(d, them);
        callStop(d, them);
      }
      delete d.spicy;
      delete d.spicyYes;
      save();
      return spicyOff;
    },
    async spicyWith(profileId) {
      const d = await load();
      await wait(LATENCY);
      return mockSpicyPlan(d, profileId);
    },
    async spicyYes(profileId, yes) {
      const d = await load();
      await wait(LATENCY);
      if (!mockSpicyPlan(d, profileId).open) fail('PL130');
      const mine = (d.spicyYes ?? []).filter((id) => id !== profileId);
      d.spicyYes = yes ? [...mine, profileId] : mine;
      if (!yes) {
        spicyRefund(d, profileId);
        callStop(d, profileId);
      }
      save();
      return mockSpicyPlan(d, profileId);
    },

    async spicyTerms() {
      const d = await load();
      await wait(LATENCY);
      if (!d.me) fail('PL002');
      const at = d.spicyPassed?.[SPICY_TERMS_VERSION] ?? null;
      return { version: SPICY_TERMS_VERSION, passed: at !== null, passedAt: at, outdated: at === null && Object.keys(d.spicyPassed ?? {}).length > 0 };
    },
    async passSpicyQuiz(version, agree, answers) {
      const d = await load();
      await wait(LATENCY);
      if (!d.me) fail('PL002');
      const result = checkQuiz(version, agree, answers);
      if (result.passed) {
        d.spicyPassed = { ...d.spicyPassed, [SPICY_TERMS_VERSION]: d.spicyPassed?.[SPICY_TERMS_VERSION] ?? Date.now() };
        save();
      }
      return result;
    },

    async spicyPay(profileId, share) {
      const d = await load();
      await wait(LATENCY);
      const plan = mockSpicyPlan(d, profileId);
      if (!plan.open) fail('PL130');
      if (!plan.mutual) fail('PL146');
      const w = walletOf(d);
      if (!paidOn()) {
        // D117: free while payments are paused, one per 7 days; what I paid towards it comes back.
        if (w.spicyDone.includes(profileId)) fail('PL145');
        if (spicyFreeNext(w.spicyFree ?? [], Date.now()) !== null) fail('PL190');
        spicyRefund(d, profileId);
        w.spicyDone.push(profileId);
        w.spicyFree = [...(w.spicyFree ?? []), Date.now()];
        save();
        return mockSpicyPlan(d, profileId);
      }
      const mine = w.spicyPaid[profileId] ?? 0;
      const amount = spicyShare(w, share, mine, 0);
      move(w, 'spicy_unlock', -amount, 0, `${profileId}:${Date.now()}:${Math.random()}`);
      w.spicyPaid[profileId] = mine + amount;
      if (mine + amount >= SPICY_UNLOCK) w.spicyDone.push(profileId);
      save();
      return mockSpicyPlan(d, profileId);
    },

    async spicyCall(profileId) {
      const d = await load();
      await wait(LATENCY);
      const view = callView(d, profileId);
      save();
      return view;
    },
    spicyCallPick: (profileId, slots, minutes) =>
      callChange(profileId, (d, open, now) => {
        const list = callsWith(d, profileId);
        if (!open && list.length >= MAX_CALLS) fail('PL152');
        if (open && open.status !== 'picking') fail('PL150');
        const picks = checkPicks(slots, minutes, now);
        const c: MockCall = open ?? {
          id: `call_${now.toString(36)}`, status: 'picking', mySlots: [], theirSlots: [], myMinutes: null, theirMinutes: null, startsAt: null, minutes: null,
          moves: 0, myMins: [], theirMins: [], myBeat: null, theirBeat: null, ended: false, askedAt: null, myAnswer: null, theirAnswer: null, outcome: null,
          fault: null, refunded: 0, stoppedByMe: false, at: now,
        };
        if (!open) list.push(c);
        Object.assign(c, { mySlots: picks, myMinutes: minutes });
        // The made-up person picks my first time and 15 minutes (there is nobody to wait for).
        if (!c.theirSlots.length) Object.assign(c, { theirSlots: [picks[0]], theirMinutes: 15 });
        const first = firstOverlap(c.mySlots, c.theirSlots, now);
        if (first !== null && c.theirMinutes) Object.assign(c, { status: 'set', startsAt: first, minutes: Math.min(minutes, c.theirMinutes) });
      }),
    spicyCallBeat: (profileId) =>
      callChange(profileId, (_d, c, now) => {
        if (!c || c.status !== 'set' || c.ended) fail('PL150');
        if (!timerOpen(c.startsAt!, now)) fail('PL153');
        const minute = Math.floor(now / MINUTE_MS) * MINUTE_MS;
        // The made-up person keeps their app open for the whole call.
        if (!c.myMins.includes(minute)) c.myMins.push(minute);
        if (!c.theirMins.includes(minute)) c.theirMins.push(minute);
        c.myBeat = now;
        c.theirBeat = now;
      }),
    spicyCallEnd: (profileId, unsafe) =>
      callChange(profileId, (d, c, now) => {
        if (!c) fail('PL150');
        c.myOn = false;
        if (unsafe) return callSettle(d, profileId, c, 'unsafe', null, true);
        if (c.status !== 'set' || now < c.startsAt! - 5 * MINUTE_MS) fail('PL150');
        c.ended = true;
        // The made-up person ends when I do.
        callTimer(d, profileId, c, now);
      }),
    spicyCallMove: (profileId, anyway) =>
      callChange(profileId, (d, c, now) => {
        if (!c || c.status !== 'set') fail('PL150');
        if (canMoveFree(c.moves, c.startsAt!, now)) Object.assign(c, { status: 'picking', mySlots: [], theirSlots: [], startsAt: null, minutes: null, moves: c.moves + 1 });
        else if (anyway) callSettle(d, profileId, c, 'moved_late', 'me');
        else fail('PL151');
      }),
    async spicyVoice(profileId) {
      // As spicy_voice_room: a set call whose timer is open, that I have not ended. The stand-in
      // room plays nothing (src/lib/voice.ts); the made-up person is on it as soon as I am.
      await callChange(profileId, (_d, c, now) => {
        if (!c || c.status !== 'set' || c.ended) fail('PL150');
        if (!timerOpen(c.startsAt!, now)) fail('PL153');
        c.voice = true;
        c.myOn = true;
      });
      return { url: MOCK_VOICE_URL, token: 'mock' };
    },
    async spicyShare(profileId, share) {
      const d = await load();
      await wait(LATENCY);
      const plan = mockSpicyPlan(d, profileId);
      if (!plan.open) fail('PL130');
      if (share && !plan.keptCall) fail('PL178');
      const rest = (d.spicyShares ?? []).filter((id) => id !== profileId);
      d.spicyShares = share ? [...rest, profileId] : rest;
      save();
      return mockSpicyPlan(d, profileId);
    },
    spicyCallAnswer: (profileId, answer) =>
      callChange(profileId, (d, c) => {
        if (!c || c.status !== 'asking' || c.myAnswer) fail('PL150');
        c.myAnswer = answer;
        callAnswers(d, profileId, c, false);
      }),

    async wallet() {
      const d = await load();
      await wait(LATENCY);
      if (!d.me) fail('PL002');
      const view = walletView(d);
      save();
      return view;
    },
    walletVisit: () =>
      walletChange((d, w, now) => {
        const today = dayOf(now);
        if (!w.visits.includes(today)) w.visits = [...w.visits, today].slice(-31);
        if (streakOf(w.visits, today) >= STREAK_DAYS && !w.ledger.some((l) => l.reward === 'week_streak' && l.at > now - 6 * DAY)) reward(w, 'week_streak', today);
      }),
    // The mock is Razorpay's test mode: a top-up is paid at once and no money moves.
    async switches() {
      return { paid: paidOn() };
    },
    async topUpStatus() {
      return { open: topUpsHere(Platform.OS) && paidOn(), test: true };
    },
    topUp: (packId) =>
      walletChange((_d, w, now) => {
        if (!paidOn()) fail('PL188');
        if (!topUpsHere(Platform.OS)) fail('PL144');
        if (isShopId(packId)) {
          // A Pink Gold plan or a Boost pack (D116): paid in rupees, never credits.
          canBuy(packId, { goldOn: goldOn(w, now), goldUntil: w.goldUntil ?? null, boughtBoosts: boostsLeft(w, now).filter((b) => b.source === 'bought').length }, now);
          const plan = planOf(packId);
          const pack = boostPackOf(packId);
          const ref = `order_${now}`;
          if (plan) w.goldUntil = goldUntilAfter(w.goldUntil ?? null, goldOn(w, now), plan.months, now) ?? undefined;
          if (pack) for (let i = 0; i < pack.boosts; i++) (w.boosts ??= []).push({ source: 'bought', ref, expires: addMonths(now, BOOST_VALID_MONTHS) });
          return;
        }
        const pack = topUp(w, packId);
        move(w, 'topup', pack.credits, 0, `order_${Date.now()}`);
      }),
    boost: () =>
      walletChange((_d, w, now) => {
        if (w.boostUntil && w.boostUntil > now) fail('PL133');
        memberBoosts(w, now);
        const next = boostsLeft(w, now).sort((a, b) => a.expires - b.expires)[0];
        if (!next) fail('PL185');
        next.used = now;
        w.boostUntil = now + BOOST_MS;
      }),
    buyExtraAsk: () =>
      walletChange((_d, w, now) => {
        if (w.extraAsks.filter((u) => u > now).length >= MAX_EXTRA_ASKS) fail('PL134');
        spend(w, 'extra_ask', COSTS.extra_ask);
        w.extraAsks = [...w.extraAsks.filter((u) => u > now), now + EXTRA_ASK_MS];
      }),
    stakePlan: (inviteId) =>
      walletChange((d, w, now) => {
        const inv = d.invites.find((i) => i.id === inviteId);
        if (w.stakes[inviteId]) fail('PL138');
        if (!inv || !canStake(inv, now, false)) fail('PL135');
        w.stakes[inviteId] = spend(w, 'stake', COSTS.stake, inviteId);
      }),
    async treatOptions(inviteId) {
      const d = await load();
      const inv = d.invites.find((i) => i.id === inviteId);
      if (!d.me || !inv || inv.status !== 'locked' || inv.startsAt <= Date.now() || rules.isDouble(inv) || ideaOf(inv.ideaId).kind !== 'irl' || walletOf(d).treats[inviteId]) return [];
      return [mockPartner(d.me.city)];
    },
    treatPlan: (inviteId, partnerId, item) =>
      walletChange((d, w, now) => {
        if (!paidOn()) fail('PL188');
        const inv = d.invites.find((i) => i.id === inviteId);
        if (!inv || inv.status !== 'locked' || inv.startsAt <= now || rules.isDouble(inv) || ideaOf(inv.ideaId).kind !== 'irl' || partnerId !== 'demo_partner' || !(item in TREATS)) fail('PL140');
        if (w.treats[inviteId]) fail('PL141');
        if (Object.values(w.treats).filter((tr) => tr.mine && tr.at > now - 7 * DAY).length >= TREATS_PER_WEEK) fail('PL142');
        splitTreat(w, TREATS[item]);
        move(w, 'treat', -TREATS[item], 0, inviteId);
        w.treats[inviteId] = { item, credits: TREATS[item], status: 'held', mine: true, partner: mockPartner(d.me!.city).name, code: null, until: null, at: now };
      }),
    // Nobody treats me in the mock (the made-up people have no wallets), so there is nothing to say no to.
    declineTreat: () => walletChange(() => fail('PL143')),

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
      if (reward(walletOf(d), 'rated_date', inviteId)) save();
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
        const gold = goldOn(walletOf(d), now);
        if (open.length >= openAskCap(gold, walletOf(d).extraAsks.filter((u) => u > now).length)) fail(gold ? 'PL187' : 'PL023');
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

    async myPhotos() {
      await wait(LATENCY);
      return listPhotos();
    },

    async addPhoto(photo) {
      const d = await load();
      await wait(LATENCY);
      if (!d.me) fail('PL002');
      if (myPhotoList.length >= 3) fail('PL108');
      const now = Date.now();
      photoUploads = photoUploads.filter((at) => at > now - 7 * rules.DAY);
      if (photoUploads.length >= 6) fail('PL109');
      photoUploads.push(now);
      myPhotoList = [...myPhotoList, { id: `photo-${now}`, uri: photo.uri, at: now }];
      return listPhotos();
    },

    async removePhoto(id) {
      await wait(LATENCY);
      if (!myPhotoList.some((p) => p.id === id)) fail('PL110');
      myPhotoList = myPhotoList.filter((p) => p.id !== id);
      return listPhotos();
    },

    async myFace() {
      await wait(LATENCY);
      return listFace();
    },

    async addFace(photo) {
      const d = await load();
      await wait(LATENCY);
      if (!d.me) fail('PL002');
      listFace();
      const now = Date.now();
      const refused = faceRefusal(faceTries, myFaceList, now);
      if (refused) fail(refused);
      faceTries = [...faceTries.filter((at) => at > now - FACE_WEEK_MS), now];
      myFaceList = [...myFaceList, { id: `face-${now}`, uri: photo.uri, at: now, status: 'pending' }];
      return listFace();
    },

    async removeFace(id) {
      await wait(LATENCY);
      if (!myFaceList.some((f) => f.id === id)) fail('PL110');
      myFaceList = myFaceList.filter((f) => f.id !== id);
      return listFace();
    },

    async reportBadContact(inviteId, ownerId) {
      const d = await load();
      await wait(LATENCY);
      const i = d.invites.find((x) => x.id === inviteId);
      if (!i || ownerId === ME_ID || !rules.canReveal(i, ME_ID, ownerId) || (i.resolvedAt ?? 0) < Date.now() - 7 * rules.DAY) fail('PL100');
      if (reveals[ownerId]?.contactVerified) fail('PL103');
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
        wallet: d.wallet ? { paid: d.wallet.paid, earned: d.wallet.earned, ledger: d.wallet.ledger, stakes: d.wallet.stakes, treats: d.wallet.treats } : null,
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
        spicy: d.spicy ? { discord: d.spicy.discord, telegram: d.spicy.telegram, signal: d.spicy.signal, boundaries: d.spicy.boundaries, since: d.spicy.since ? new Date(d.spicy.since).toISOString() : null, yes: (d.spicyYes ?? []).map((who) => ({ with: who })),
          calls: Object.entries(d.spicyCalls ?? {}).flatMap(([who, list]) => list.map((c) => ({ with: who, my_times: c.mySlots.map((x) => new Date(x).toISOString()), my_minimum: c.myMinutes, starts_at: c.startsAt ? new Date(c.startsAt).toISOString() : null, minimum: c.minutes, my_minutes_on_timer: c.myMins.length, my_answer: c.myAnswer, outcome: c.outcome, counted_against_me: c.fault === 'me' || c.fault === 'both', credits_back: c.refunded }))) } : null,
        self_love: d.selfLove ? { moods: d.selfLove.moods, notes: d.selfLove.notes.map(({ kind, body, day, at }) => ({ kind, body, day, at: new Date(at).toISOString() })), paused_until: d.selfLove.pausedUntil, reset: d.selfLove.reset } : null,
      }, null, 2);
    },

    async deleteAccount() {
      await load();
      await wait(LATENCY);
      await AsyncStorage.removeItem(KEY).catch(quiet('mock.clear'));
      myPhotoList = [];
      photoUploads = [];
      myFaceList = [];
      faceTries = [];
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
      // As the auth-code function (D091): the same answer whether or not the address can be used.
      // Only an account's own address (signing in) or a free one (adding it) "gets" a code.
      if (mode === 'link' && !d.me) fail('PL002');
      await captcha();
    },

    async verifyCode(kind, address, code, mode) {
      const d = await load();
      await wait(LATENCY);
      if (code !== MOCK_CODE) fail('PA006');
      const taken = !!(await AsyncStorage.getItem(parked(kind, address)).catch(() => null));
      // No code was sent to someone else's address, or to one with no account: nothing matches.
      if (mode === 'link' ? taken : !taken) fail('PA006');
      if (mode === 'link') {
        if (kind === 'phone') d.phone = address;
        else d.email = address;
        save();
        return snapshot(d);
      }
      const raw = await AsyncStorage.getItem(parked(kind, address));
      if (!raw) fail('PA006');
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
      myPhotoList = [];
      photoUploads = [];
      myFaceList = [];
      faceTries = [];
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
