/**
 * Pink Gold (D115, D116): Pinkilock's paid membership, and Boosts. Prices are in rupees with GST
 * included, bought through Razorpay on the website (the phone apps wait for Play Billing, O15).
 * They are never paid with credits and never add credits. The same prices and rules are in SQL
 * (private.shop_item and the rest of supabase/migrations/20261126000007_pink_gold.sql); the
 * server charges from its own copy. The mock follows these.
 *
 * Pure TypeScript: no React Native, so unit tests load it in plain Node.
 */
import { fail } from './errors';

const DAY = 24 * 3_600_000;

export type ShopId = 'g1' | 'g3' | 'g6' | 'g12' | 'b1' | 'b6';

export interface Plan {
  id: ShopId;
  rupees: number;
  months: number;
}
/** Pink Gold plans (Sushil, 2026-11-26). Nothing renews by itself; a plan bought while one is on adds to its end. */
export const PLANS: readonly Plan[] = [
  { id: 'g1', rupees: 699, months: 1 },
  { id: 'g3', rupees: 1599, months: 3 },
  { id: 'g6', rupees: 2400, months: 6 },
  { id: 'g12', rupees: 3300, months: 12 },
];

export interface BoostPack {
  id: ShopId;
  rupees: number;
  boosts: number;
}
/** Boosts (Sushil, 2026-11-26): 1 or a pack of 6. */
export const BOOST_PACKS: readonly BoostPack[] = [
  { id: 'b1', rupees: 150, boosts: 1 },
  { id: 'b6', rupees: 699, boosts: 6 },
];

export const isShopId = (id: string): id is ShopId => PLANS.some((p) => p.id === id) || BOOST_PACKS.some((b) => b.id === id);
export const planOf = (id: string): Plan | undefined => PLANS.find((p) => p.id === id);
export const boostPackOf = (id: string): BoostPack | undefined => BOOST_PACKS.find((b) => b.id === id);

/** A bought Boost must be used within a month (Sushil: "boost validity till 1 month"). */
export const BOOST_VALID_MONTHS = 1;
/** Once used, a Boost puts my card first on Discover in my city for this long. */
export const BOOST_RUN_HOURS = 24;
/** Bought Boosts waiting, at most (PL186). */
export const MAX_BOOSTS_WAITING = 12;
/** Pink Gold at most this many months ahead (PL184). */
export const MAX_GOLD_MONTHS_AHEAD = 13;

/** What members get. */
export const MEMBER_OPEN_ASKS = 15;
export const MEMBER_FREE_BOOSTS = 2;
/** Everyone else: 3 open asks, plus up to 2 bought with credits for a day each. */
export const OPEN_ASKS = 3;

/** Monthly price of a plan, rounded down, for "₹533 a month". */
export const perMonth = (p: Plan): number => Math.floor(p.rupees / p.months);
/** How much a plan saves against paying monthly, in rupees. */
export const saves = (p: Plan): number => PLANS[0].rupees * p.months - p.rupees;

/** Calendar months added in UTC, as Postgres adds `n * interval '1 month'` (the end of a short month clamps). */
export function addMonths(at: number, n: number): number {
  const d = new Date(at);
  const day = d.getUTCDate();
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out.getTime();
}

/** Where a membership ends after buying a plan now: added to the end of one that is on. Null stays null (granted for good). */
export function goldUntilAfter(until: number | null, on: boolean, months: number, now: number): number | null {
  if (on && until === null) return null;
  return addMonths(Math.max(on && until ? until : now, now), months);
}

/** The checks before an order is made, as wallet_open_order. */
export function canBuy(id: string, s: { goldOn: boolean; goldUntil: number | null; boughtBoosts: number }, now: number): void {
  const plan = planOf(id);
  const pack = boostPackOf(id);
  if (!plan && !pack) fail('PL136');
  if (plan && s.goldOn && (s.goldUntil === null || addMonths(s.goldUntil, plan.months) > addMonths(now, MAX_GOLD_MONTHS_AHEAD))) fail('PL184');
  if (pack && s.boughtBoosts + pack.boosts > MAX_BOOSTS_WAITING) fail('PL186');
}

/** The open-ask cap for a person. */
export const openAskCap = (gold: boolean, extraAsks: number): number => (gold ? MEMBER_OPEN_ASKS : OPEN_ASKS + extraAsks);

/** The key of this month in Indian time, for a member's free Boosts ('2026-11'). */
export function istMonth(now: number): string {
  const d = new Date(now + 5.5 * 3_600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
/** When this month ends in Indian time: a member's free Boosts lapse then. */
export function istMonthEnd(now: number): number {
  const d = new Date(now + 5.5 * 3_600_000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 5.5 * 3_600_000;
}

export const daysLeft = (until: number, now: number): number => Math.max(0, Math.ceil((until - now) / DAY));
