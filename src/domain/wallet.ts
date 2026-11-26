/**
 * The credits wallet (D104): a closed loop. Credits are bought with Razorpay (UPI, cards, net
 * banking) or earned, and spent only inside Pinkilock: a Discover boost, an extra open ask, a
 * refundable stake on a plan, or a treat for the other person on a plan (a voucher used at a partner
 * café or cinema). Credits are never cash: they cannot be withdrawn, sent to another person, or
 * turned back into money, so the wallet is a closed-system prepaid instrument (no RBI licence) and
 * nobody can pay anybody to meet. Nothing here touches Spicy mode, and Spicy mode never touches it.
 *
 * Two buckets, so the books stay clean: `paid` (bought, with GST already in the price) and
 * `earned` (rewards, never cash). Spending takes earned credits first. A stake or a treat that comes
 * back goes back to the bucket it came from. A treat is paid from bought credits only.
 *
 * The same rules are in SQL (supabase/migrations/20261125000003_wallet.sql); the mock follows these.
 * STAKE_CASES and PACKS are shared with SQL through tests/db/wallet_cases.sql (generated:
 * UPDATE_CASES=1 npm run test:unit).
 *
 * Pure TypeScript: no React Native, so unit tests load it in plain Node.
 */
import { fail } from './errors';
import type { InviteStatus } from './types';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** What can be bought. Prices are in rupees and include GST; the server charges from its own copy. */
export interface Pack {
  id: string;
  rupees: number;
  credits: number;
}
export const PACKS: readonly Pack[] = [
  { id: 'p49', rupees: 49, credits: 50 },
  { id: 'p99', rupees: 99, credits: 110 },
  { id: 'p199', rupees: 199, credits: 240 },
  { id: 'p499', rupees: 499, credits: 650 },
];
export const packOf = (id: string): Pack | undefined => PACKS.find((p) => p.id === id);
/** No top-up that would take bought credits past this (a small wallet, by design). */
export const MAX_PAID = 2000;

/** What credits buy. */
export const COSTS = { boost: 30, extra_ask: 10, stake: 50 } as const;
export type Spend = keyof typeof COSTS;
/** A boost puts my card first on Discover in my city for a day. One at a time. */
export const BOOST_HOURS = 24;
/** An extra open ask lasts a day; at most two at once (so five open asks, never more). */
export const EXTRA_ASK_HOURS = 24;
export const MAX_EXTRA_ASKS = 2;
/** Bailing more than this long before the start gets a stake back: that is honest, not a flake. */
export const STAKE_EARLY_BAIL_HOURS = 2;

/**
 * Rewards: earned credits for showing up and being real. Never cash, never for anything in Spicy
 * mode, and never for something that would tell one person what another said about them (so a
 * good rating is not rewarded; leaving a rating is).
 */
export const REWARDS = {
  kept_plan: 20,
  verified_handle: 25,
  face_checked: 15,
  rated_date: 5,
  vouched: 10,
  week_streak: 15,
} as const;
export type RewardKind = keyof typeof REWARDS;
export const REWARD_KINDS = Object.keys(REWARDS) as RewardKind[];
/** Caps, so two friends cannot farm credits: kept plans per 7 days, once per pair per 30 days; vouches ever. */
export const KEPT_REWARDS_PER_WEEK = 4;
export const KEPT_PAIR_DAYS = 30;
export const VOUCH_REWARDS_MAX = 3;
export const STREAK_DAYS = 7;
/** Earned credits stop here: they are a thank-you, not a currency. */
export const MAX_EARNED = 500;

/** Treat the plan: things a partner café or cinema hands over for a voucher code. */
export const TREATS = { coffee: 150, dessert: 120, movie: 300 } as const;
export type TreatItem = keyof typeof TREATS;
export const TREAT_ITEMS = Object.keys(TREATS) as TreatItem[];
/** At most this many treats given in 7 days, and one per plan. */
export const TREATS_PER_WEEK = 2;
/** A voucher can be used for this long after the plan is kept. */
export const VOUCHER_HOURS = 24;

export interface TreatPartner {
  id: string;
  name: string;
  city: string;
  items: TreatItem[];
}

/**
 * Spicy mode's unlock (D105, Sushil 2026-11-25): once two people have both said yes, their
 * usernames show only when 600 credits have been paid to Pinkilock for that match, by one of them
 * or 300 each. Bought credits only (a reward never pays for Spicy). Nothing goes to the other
 * person. If either takes their yes back, turns Spicy off or blocks before it is fully paid, what
 * was paid comes back. Once unlocked it stays unlocked and is not refunded.
 */
export const SPICY_UNLOCK = 600;
export type SpicyShare = 'half' | 'full';

/** What I would pay now: half (300, once) or the rest. PL145 when my part is already paid; PL139 when short of bought credits. */
export function spicyShare(w: Pick<Wallet, 'paid'>, share: SpicyShare, mine: number, theirs: number): number {
  const rest = SPICY_UNLOCK - mine - theirs;
  if (rest <= 0 || (share === 'half' && mine >= SPICY_UNLOCK / 2)) fail('PL145');
  const amount = share === 'half' ? Math.min(SPICY_UNLOCK / 2 - mine, rest) : rest;
  if (w.paid < amount) fail('PL139');
  return amount;
}

export type LedgerKind = 'spicy_unlock' | 'spicy_back' | 'topup' | 'topup_refund' | 'boost' | 'extra_ask' | 'stake' | 'stake_back' | 'stake_lost' | 'treat' | 'treat_back' | 'reward';

export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  /** Signed, both buckets together. */
  credits: number;
  at: number;
  /** For a reward, which one. */
  reward?: RewardKind;
}

export interface Wallet {
  paid: number;
  earned: number;
  /** My boost runs until then, or null. */
  boostUntil: number | null;
  /** Extra open asks I have now (each runs out a day after it was bought). */
  extraAsks: number;
  /** Credits I hold on plans, by invite id. */
  stakes: Record<string, number>;
  /** Days in a row I opened Pinkilock (the streak), up to today. */
  streak: number;
  /** One-off rewards already had. */
  had: RewardKind[];
  /** How many vouch rewards I have had, and kept-plan rewards in the last 7 days. */
  vouchRewards: number;
  keptThisWeek: number;
  /** Treats on my plans, given or given to me. */
  treats: Treat[];
  history: LedgerEntry[];
}

export type TreatStatus = 'held' | 'ready' | 'used' | 'back';
export interface Treat {
  inviteId: string;
  item: TreatItem;
  credits: number;
  status: TreatStatus;
  /** I gave it (else it was given to me). */
  mine: boolean;
  partner: string;
  /** The voucher code: only for the person treated, only while it can be used. */
  code: string | null;
  until: number | null;
}

/** Where top-ups stand: off (no keys yet), Razorpay's test mode, or live. */
export interface TopUpStatus {
  open: boolean;
  test: boolean;
}

export const emptyWallet: Wallet = {
  paid: 0, earned: 0, boostUntil: null, extraAsks: 0, stakes: {}, streak: 0, had: [], vouchRewards: 0, keptThisWeek: 0, treats: [], history: [],
};

export const balance = (w: Wallet): number => w.paid + w.earned;

/** Takes `cost` from the earned bucket first, then paid; refuses (PL132) when short. */
export function split(w: Pick<Wallet, 'paid' | 'earned'>, cost: number): { paid: number; earned: number } {
  if (w.paid + w.earned < cost) fail('PL132');
  const earned = Math.min(w.earned, cost);
  return { earned, paid: cost - earned };
}

/** A treat comes out of bought credits only: earned credits are a thank-you, not something to give on. */
export function splitTreat(w: Pick<Wallet, 'paid'>, cost: number): { paid: number; earned: number } {
  if (w.paid < cost) fail('PL139');
  return { paid: cost, earned: 0 };
}

/** The credits to add for a top-up, or a refusal: an unknown pack (PL136) or a wallet that would be too full (PL137). */
export function topUp(w: Pick<Wallet, 'paid'>, packId: string): Pack {
  const pack = packOf(packId);
  if (!pack) fail('PL136');
  if (w.paid + pack.credits > MAX_PAID) fail('PL137');
  return pack;
}

/** Where a stake ends up once its plan is over: still held, back to me, or lost. */
export type StakeEnd = 'held' | 'back' | 'lost';

/**
 * As private.stake_end in SQL. Kept, ended (a block or a deleted account) or the other person's
 * flake: back. My no-show, or a bail inside the last two hours: lost. Both missed: lost for each.
 * Lost credits are simply gone; they never go to the other person.
 */
export function stakeEnd(status: InviteStatus, flakedBy: 'me' | 'them' | 'nobody', hoursBeforeStart: number): StakeEnd {
  if (status === 'locked' || status === 'sent' || status === 'half_locked') return 'held';
  if (status !== 'flaked') return 'back';
  if (flakedBy === 'them') return 'back';
  if (flakedBy === 'me' && hoursBeforeStart > STAKE_EARLY_BAIL_HOURS) return 'back';
  return 'lost';
}

/** The shared table: status, who flaked, hours before the start it ended, and the answer. */
export const STAKE_CASES: readonly [InviteStatus, 'me' | 'them' | 'nobody', number, StakeEnd][] = [
  ['locked', 'nobody', 5, 'held'],
  ['kept', 'nobody', -1, 'back'],
  ['ended', 'nobody', 10, 'back'],
  ['flaked', 'them', 1, 'back'],
  ['flaked', 'them', -1, 'back'],
  ['flaked', 'me', 30, 'back'],
  ['flaked', 'me', 3, 'back'],
  ['flaked', 'me', 2, 'lost'],
  ['flaked', 'me', 0.5, 'lost'],
  ['flaked', 'me', -0.5, 'lost'],
  ['flaked', 'nobody', -0.5, 'lost'],
  ['declined', 'nobody', 4, 'back'],
  ['expired', 'nobody', 4, 'back'],
];

/** Days in a row ending today, from the days (YYYY-MM-DD) I opened the app. */
export function streakOf(days: readonly string[], today: string): number {
  const set = new Set(days);
  let n = 0;
  let d = new Date(`${today}T00:00:00Z`).getTime();
  while (set.has(new Date(d).toISOString().slice(0, 10))) {
    n += 1;
    d -= DAY;
  }
  return n;
}

/** A stake can go on a locked one-to-one plan that has not started, once. */
export function canStake(i: { status: InviteStatus; startsAt: number; fromFriendId?: string | null }, now: number, already: boolean): boolean {
  return i.status === 'locked' && i.startsAt > now && !i.fromFriendId && !already;
}

/** Top-ups only where we can take payment the way the store allows: the website, for now (Play Billing comes later, O15). */
export function topUpsHere(platform: string): boolean {
  return platform === 'web';
}

/** A voucher code to show at the counter: 8 letters and digits, no look-alikes. Mock only; live, the server makes it. */
export function mockVoucher(seed: string): string {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let h = 11;
  let out = '';
  for (let i = 0; i < 8; i++) {
    for (const ch of `${seed}:${i}`) h = (h * 33 + ch.charCodeAt(0)) % 2_147_483_647;
    out += abc[h % abc.length];
  }
  return out;
}

export const BOOST_MS = BOOST_HOURS * HOUR;
export const EXTRA_ASK_MS = EXTRA_ASK_HOURS * HOUR;
export const VOUCHER_MS = VOUCHER_HOURS * HOUR;
