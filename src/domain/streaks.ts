/**
 * My kept-plan streak and where I stand in my city (D122). Pure TypeScript: no React Native, so
 * unit tests load it in plain Node.
 *
 * The streak counts weeks in a row (Monday to Sunday, India's time) with at least one plan I kept,
 * for two or a double. This week counts once it has a kept plan; until then the run up to last week
 * still stands, so a streak never looks broken before the week is out. Only I see it.
 *
 * The city standing comes from the server (`my_city_standing()`): a bucket, never a rank or a name.
 */
import { mondayOf } from './weekly';
import type { Invite } from './types';

/** Weeks in a row for the "Steady" badge. */
export const KEPT_STREAK_BADGE = 3;
/** Top-percent buckets the server can answer with. */
export const STANDING_BUCKETS = [1, 5, 10, 25, 50] as const;
export type StandingBucket = (typeof STANDING_BUCKETS)[number];

export interface CityStanding {
  city: string;
  /** At least 20 people in the city have 3 or more kept or missed promises. */
  ready: boolean;
  /** My bucket, or null below the top half, before 3 promises of my own, or while not ready. */
  top: StandingBucket | null;
  /** Share of plans kept in the city over the last 30 days, once there are 20 of them. */
  cityKeptPercent: number | null;
}

export const emptyStanding = (city: string): CityStanding => ({ city, ready: false, top: null, cityKeptPercent: null });

const WEEK = 7 * 86_400_000;
const weekNo = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / WEEK);

/** The weeks (as Monday dates) with a plan I kept. */
export function keptWeeks(invites: readonly Invite[], me: string): Set<string> {
  const mine = (i: Invite) => i.fromId === me || i.toId === me || i.fromFriendId === me || i.toFriendId === me;
  return new Set(invites.filter((i) => i.status === 'kept' && mine(i)).map((i) => mondayOf(i.startsAt)));
}

export interface KeptStreak {
  /** Weeks in a row. */
  weeks: number;
  /** This week already has a kept plan. */
  thisWeek: boolean;
  /** The longest run ever, for "best". */
  best: number;
}

export function keptStreak(invites: readonly Invite[], me: string, now: number): KeptStreak {
  const nos = [...keptWeeks(invites, me)].map(weekNo).sort((a, b) => a - b);
  const set = new Set(nos);
  const current = weekNo(mondayOf(now));
  const thisWeek = set.has(current);
  let weeks = 0;
  for (let w = thisWeek ? current : current - 1; set.has(w); w--) weeks++;
  let best = 0;
  let run = 0;
  for (let k = 0; k < nos.length; k++) {
    run = k > 0 && nos[k] === nos[k - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return { weeks, thisWeek, best };
}

export const isBucket = (n: unknown): n is StandingBucket => (STANDING_BUCKETS as readonly unknown[]).includes(n);

/** Reads the server's answer; anything unexpected becomes "nothing to show". */
export function standingFrom(raw: unknown, city: string): CityStanding {
  const r = (raw ?? {}) as Record<string, unknown>;
  const pct = typeof r.city_kept_percent === 'number' && r.city_kept_percent >= 0 && r.city_kept_percent <= 100 ? Math.round(r.city_kept_percent) : null;
  return {
    city: typeof r.city === 'string' ? r.city : city,
    ready: r.ready === true,
    top: isBucket(r.top) ? r.top : null,
    cityKeptPercent: pct,
  };
}
