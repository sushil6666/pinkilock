/**
 * Self love (D101): a private corner for the person alone, with Bounce back for after a no. The
 * same rules are in SQL (supabase/migrations/20261125000001_self_love.sql: save_mood, add_self_note,
 * pause_discover, start_reset, do_reset_step); the mock follows these. Nothing here is ever shown
 * to anyone else, logged, pushed or put in an error report.
 *
 * Pure TypeScript: no React Native, so unit tests load it in plain Node.
 */
import { fail } from './errors';
import { VENUES, type Venue, type VenueKind } from './venues';

export const MOODS = ['glowing', 'good', 'okay', 'low', 'rough'] as const;
export type Mood = (typeof MOODS)[number];
/** Shown on the mood buttons, beside the words from src/i18n (`selfLove.moods`). */
export const MOOD_FACE: Record<Mood, string> = { glowing: '🤩', good: '🙂', okay: '😐', low: '😔', rough: '😣' };

export const NOTE_KINDS = ['gratitude', 'journal', 'boundary'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];
export const SELF_NOTE_MAX = 300;
export const SELF_NOTES_MAX = 200;
export const GRATITUDE_PER_DAY = 3;
/** Pause choices on screen; the server takes any whole number of days from 1 to 14 (0 ends it). */
export const PAUSE_DAYS = [1, 3, 7, 14] as const;
export const PAUSE_MAX_DAYS = 14;
export const RESET_DAYS = 3;
/** Check-ins in a row for the gold badge. */
export const STREAK_BADGE = 7;
/** How many kind lines src/i18n holds (`selfLove.lines.l1` to `lN`). */
export const KIND_LINES = 30;
/** How many small self-care steps src/i18n holds (`selfLove.steps.s1` to `sN`). */
export const CARE_STEPS = 12;
/** How long after a no or an ask that ran out the Asks tab offers Bounce back. */
export const BOUNCE_DAYS = 3;

export interface SelfNote {
  id: string;
  kind: NoteKind;
  body: string;
  /** The day it was written, `YYYY-MM-DD` where the person lives. */
  day: string;
  at: number;
}

export interface SelfLove {
  /** Today where the person lives, as the server counts it: `YYYY-MM-DD`. */
  today: string;
  /** The last 60 days, oldest first; at most one a day. */
  moods: { day: string; mood: Mood }[];
  /** Newest first. */
  notes: SelfNote[];
  /** Off Discover until then; null when not paused. */
  pausedUntil: number | null;
  /** The 3-day reset, if one was started: its first day and the steps done (1 to 3). */
  reset: { started: string; done: number[] } | null;
}

export const emptySelfLove = (today: string): SelfLove => ({ today, moods: [], notes: [], pausedUntil: null, reset: null });

/** `YYYY-MM-DD` for a moment, in the phone's own time zone (the mock's "where I live"). */
export function dayOf(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A day moved by whole days, on the calendar (no clocks or time zones involved). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Whole days from `a` to `b`. */
export function daysBetween(a: string, b: string): number {
  const ms = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((ms(b) - ms(a)) / 86_400_000);
}

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** Today's kind line, 1 to KIND_LINES: the same all day, the next one tomorrow. */
export function lineOfDay(day: string): number {
  return (daysBetween('2026-01-01', day) % KIND_LINES + KIND_LINES) % KIND_LINES + 1;
}

/** One small self-care step for a moment (a no, an ask that ran out), 1 to CARE_STEPS. */
export const careStep = (seed: string): number => (hash(seed) % CARE_STEPS) + 1;

/**
 * Days in a row with a check-in, ending today, or yesterday when today has none yet (so the
 * streak does not look broken before today's check-in).
 */
export function streak(days: readonly string[], today: string): number {
  const set = new Set(days);
  let at = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(at)) {
    n++;
    at = addDays(at, -1);
  }
  return n;
}

/** The last seven days, oldest first, with the mood of each (null where none). */
export function weekOf(moods: SelfLove['moods'], today: string): { day: string; mood: Mood | null }[] {
  const by = new Map(moods.map((m) => [m.day, m.mood]));
  return Array.from({ length: 7 }, (_, k) => {
    const day = addDays(today, k - 6);
    return { day, mood: by.get(day) ?? null };
  });
}

/**
 * Which day of the reset it is (1 to 3), or 'done' when all three steps are done, or 'over' once its
 * days are past with steps left. Null when no reset was started.
 */
export function resetDay(reset: SelfLove['reset'], today: string): number | 'done' | 'over' | null {
  if (!reset) return null;
  if (reset.done.length >= RESET_DAYS) return 'done';
  const n = daysBetween(reset.started, today) + 1;
  return n > RESET_DAYS ? 'over' : Math.max(n, 1);
}

/** As do_reset_step: a step opens on its own day. */
export function stepOpen(reset: SelfLove['reset'], day: number, today: string): boolean {
  return !!reset && day >= 1 && day <= RESET_DAYS && daysBetween(reset.started, today) >= day - 1;
}

export const gratitudeToday = (s: SelfLove) => s.notes.filter((n) => n.kind === 'gratitude' && n.day === s.today).length;

/** As add_self_note. Returns the note as it will be kept (trimmed). */
export function checkSelfNote(kind: string, body: string, s: SelfLove): string {
  if (!(NOTE_KINDS as readonly string[]).includes(kind)) fail('PL116');
  const text = body.trim();
  if (text.length < 1 || text.length > SELF_NOTE_MAX) fail('PL117');
  if (kind === 'gratitude' && gratitudeToday(s) >= GRATITUDE_PER_DAY) fail('PL118');
  if (s.notes.length >= SELF_NOTES_MAX) fail('PL119');
  return text;
}

export const isMood = (m: string): m is Mood => (MOODS as readonly string[]).includes(m);

/** A solo idea for each kind of place (`selfLove.solo` in src/i18n). */
export const SOLO_KINDS: readonly VenueKind[] = ['promenade', 'park', 'mall', 'market', 'landmark'];

/**
 * Places in my city to enjoy alone, from the venue list: a different few each day, one of each
 * kind first. The words for what to do there come from src/i18n by the venue's kind.
 */
export function soloPlans(city: string, day: string, n = 4): Venue[] {
  const here = VENUES.filter((v) => v.city === city);
  const order = [...here].sort((a, b) => hash(`${day}:${a.id}`) - hash(`${day}:${b.id}`));
  const picked: Venue[] = [];
  for (const kind of SOLO_KINDS) {
    const v = order.find((x) => x.kind === kind);
    if (v) picked.push(v);
  }
  for (const v of order) if (!picked.includes(v)) picked.push(v);
  return picked.slice(0, n).sort((a, b) => hash(`${day}:${a.id}`) - hash(`${day}:${b.id}`));
}

/** Support lines for heavier days, by country, beside the emergency number. India: Tele-MANAS. */
export const SUPPORT_LINES: Record<string, { key: 'teleManas'; number: string }[]> = {
  IN: [{ key: 'teleManas', number: '14416' }],
};
