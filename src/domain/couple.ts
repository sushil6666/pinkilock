/**
 * Couple mode (D120): a shared corner for two people who matched (a kept plan for two, and both
 * said "see them again"). The same rules are in SQL (supabase/migrations/20261127000020_couple_mode.sql:
 * couple_ask, couple_answer, couple_end, couple_add_idea, couple_idea, couple_add_day,
 * couple_remove_day, couple_challenge_done); the mock follows these.
 *
 * Pure TypeScript: no React Native, so unit tests load it in plain Node.
 */
import { fail } from './errors';
import { addDays, daysBetween } from './selfLove';

/** The weekly challenges, in the same order as private.couple_challenge_ids(). Words: src/i18n `couple.challenges`. */
export const COUPLE_CHALLENGES = [
  'cook_together', 'new_place', 'song_dedication', 'compliment_week', 'plan_surprise', 'phone_free_hour', 'teach_words',
  'recreate_first', 'sunrise', 'street_food_hunt', 'question_jar', 'long_walk', 'old_photos', 'board_game', 'thank_you_three',
  'small_budget', 'chai_tasting', 'movie_swap', 'kind_act', 'future_list',
] as const;
export type ChallengeId = (typeof COUPLE_CHALLENGES)[number];
/** Shown beside the challenge's words. */
export const CHALLENGE_EMOJI: Record<ChallengeId, string> = {
  cook_together: '🍳', new_place: '🧭', song_dedication: '🎶', compliment_week: '💌', plan_surprise: '🎁', phone_free_hour: '📵', teach_words: '🗣️',
  recreate_first: '🔁', sunrise: '🌅', street_food_hunt: '🥘', question_jar: '❓', long_walk: '🚶', old_photos: '🖼️', board_game: '🎲',
  thank_you_three: '🙏', small_budget: '🪙', chai_tasting: '🍵', movie_swap: '🎬', kind_act: '🤝', future_list: '✨',
};

/** Kinds of special day either can add. A birthday is the adder's own, one each. */
export const DAY_KINDS = ['birthday', 'first_trip', 'first_festival', 'met_friends', 'special'] as const;
export type DayKind = (typeof DAY_KINDS)[number];
export const DAY_EMOJI: Record<DayKind | 'first_date' | 'together', string> = {
  birthday: '🎂', first_trip: '🧳', first_festival: '🪔', met_friends: '👯', special: '💖', first_date: '☕', together: '💞',
};

export const COUPLE_IDEAS_MAX = 20;
export const SPECIAL_DAYS_MAX = 12;
/** Day counts worth a moment, counted from "together since". After a year, every year. */
export const MILESTONES = [7, 30, 100, 182, 365] as const;
/** Weeks of challenges done in a row for the badge. */
export const COUPLE_STREAK_BADGE = 4;

export type CoupleStatus = 'none' | 'asked_by_me' | 'asked_me' | 'on';

export interface CoupleIdea {
  id: string;
  ideaId: string;
  mine: boolean;
  heartMe: boolean;
  heartThem: boolean;
  done: boolean;
}

export interface SpecialDay {
  id: string;
  kind: DayKind;
  /** `YYYY-MM-DD`. */
  day: string;
  mine: boolean;
}

export interface CoupleWeek {
  /** The Monday it starts, `YYYY-MM-DD`. */
  week: string;
  challenge: ChallengeId;
  me: boolean;
  them: boolean;
}

export interface Couple {
  /** Today where I live, as the server counts it. */
  today: string;
  status: CoupleStatus;
  /** The other person (asked, asking, or on). */
  partnerId: string | null;
  since: number | null;
  /** Our first kept plan, `YYYY-MM-DD`. */
  firstDate: string | null;
  /** The people I matched with, whom I could ask. */
  matches: string[];
  ideas: CoupleIdea[];
  days: SpecialDay[];
  /** The last 12 weeks, oldest first; this week is last. */
  weeks: CoupleWeek[];
}

export const emptyCouple = (today: string): Couple => ({ today, status: 'none', partnerId: null, since: null, firstDate: null, matches: [], ideas: [], days: [], weeks: [] });

export const isChallenge = (id: string): id is ChallengeId => (COUPLE_CHALLENGES as readonly string[]).includes(id);
export const isDayKind = (k: string): k is DayKind => (DAY_KINDS as readonly string[]).includes(k);

/** The Monday of the week a day falls in. */
export function weekStart(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}

/** The challenge for a week, as the mock picks it: never last week's again. */
export function pickChallenge(seed: string, week: string, last: ChallengeId | null): ChallengeId {
  let h = 2166136261;
  for (const ch of `${seed}${week}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  let i = h % COUPLE_CHALLENGES.length;
  if (COUPLE_CHALLENGES[i] === last) i = (i + 1) % COUPLE_CHALLENGES.length;
  return COUPLE_CHALLENGES[i];
}

/**
 * Weeks in a row that both of us did the challenge. This week counts once both did it; until then
 * the run up to last week still stands.
 */
export function coupleStreak(weeks: CoupleWeek[], today: string): number {
  const done = new Set(weeks.filter((w) => w.me && w.them).map((w) => w.week));
  let wk = weekStart(today);
  if (!done.has(wk)) wk = addDays(wk, -7);
  let n = 0;
  while (done.has(wk)) {
    n += 1;
    wk = addDays(wk, -7);
  }
  return n;
}

export const thisWeek = (c: Couple): CoupleWeek | null => c.weeks.find((w) => w.week === weekStart(c.today)) ?? null;

export type Upcoming = { kind: DayKind | 'first_date' | 'together'; day: string; inDays: number; years?: number; count?: number; mine?: boolean };

/** The next time a yearly day comes round, on or after today (29 February falls on 28 February). */
export function nextYearly(day: string, today: string): { day: string; years: number } {
  const [y, m, d] = day.split('-').map(Number);
  const ty = Number(today.slice(0, 4));
  for (let year = ty; year <= ty + 1; year++) {
    const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
    const at = `${year}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
    if (at >= today) return { day: at, years: year - y };
  }
  return { day, years: 0 };
}

/**
 * What is coming up, soonest first, within the next year: birthdays and the days we added (each
 * year), our first date's anniversary, and "together" day counts (7, 30, 100, 182, 365 days, then
 * every year).
 */
export function upcoming(c: Couple): Upcoming[] {
  const out: Upcoming[] = [];
  const add = (u: Omit<Upcoming, 'inDays'>) => {
    const inDays = daysBetween(c.today, u.day);
    if (inDays >= 0 && inDays <= 366) out.push({ ...u, inDays });
  };
  for (const d of c.days) {
    const n = nextYearly(d.day, c.today);
    if (d.day > c.today) add({ kind: d.kind, day: d.day, mine: d.mine });
    else add({ kind: d.kind, day: n.day, years: n.years, mine: d.mine });
  }
  if (c.firstDate) {
    const n = nextYearly(c.firstDate, c.today);
    if (n.years >= 1) add({ kind: 'first_date', day: n.day, years: n.years });
  }
  if (c.since) {
    const start = isoDay(c.since);
    const gone = daysBetween(start, c.today);
    const next = MILESTONES.find((m) => m >= gone);
    if (next !== undefined) add({ kind: 'together', day: addDays(start, next), count: next });
    else {
      const n = nextYearly(start, c.today);
      add({ kind: 'together', day: n.day, years: n.years });
    }
  }
  return out.sort((a, b) => a.inDays - b.inDays || a.kind.localeCompare(b.kind));
}

/** Days together, counting the first as day one. */
export const daysTogether = (c: Couple): number => (c.since ? daysBetween(isoDay(c.since), c.today) + 1 : 0);

/** `YYYY-MM-DD` for a moment, in India's time (the server counts days where the asker lives; every open city is in India). */
export function isoDay(at: number): string {
  return new Date(at + 330 * 60_000).toISOString().slice(0, 10);
}

/** A typed date, `DD/MM/YYYY` (or with dashes or dots), as `YYYY-MM-DD`; null when it is not a real date. */
export function parseDay(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return t.toISOString().slice(0, 10);
}

/** The same checks as couple_add_day, for the mock. */
export function checkDay(c: Couple, kind: string, day: string | null): void {
  if (!isDayKind(kind)) fail('PL229');
  if (!day || day < addDays(c.today, -80 * 365 - 20) || day > addDays(c.today, 365)) fail('PL230');
  if (kind === 'birthday' && c.days.some((d) => d.kind === 'birthday' && d.mine)) fail('PL231');
  if (c.days.length >= SPECIAL_DAYS_MAX) fail('PL232');
}

/** The same checks as couple_add_idea, for the mock (`offered`: the idea is in my city's catalogue). */
export function checkCoupleIdea(c: Couple, ideaId: string, offered: boolean): void {
  if (!offered) fail('PL225');
  if (c.ideas.some((i) => i.ideaId === ideaId)) fail('PL226');
  if (c.ideas.length >= COUPLE_IDEAS_MAX) fail('PL227');
}

/** Ideas both of us hearted, not done yet: the first to plan. */
export const bothWant = (c: Couple): CoupleIdea[] => c.ideas.filter((i) => i.heartMe && i.heartThem && !i.done);
