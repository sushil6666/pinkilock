/**
 * Daily relationship check-in (D126): how today went, what was good, what went badly, and Saathi's
 * few ideas after. Private to me. Pure TypeScript: no React Native, so unit tests load it in plain
 * Node. The server rules are in supabase/migrations/20261127000025_daily_checkin.sql.
 */

export const CHECKIN_MOODS = ['great', 'good', 'okay', 'hard', 'rough'] as const;
export type CheckinMood = (typeof CHECKIN_MOODS)[number];
export const CHECKIN_FACE: Record<CheckinMood, string> = { great: '🥰', good: '🙂', okay: '😐', hard: '😕', rough: '😣' };
export const isCheckinMood = (m: unknown): m is CheckinMood => (CHECKIN_MOODS as readonly unknown[]).includes(m);

/** Longest note, in characters. */
export const CHECKIN_NOTE_MAX = 500;
/** The hours a reminder can come at, in my city's time. */
export const REMINDER_HOURS = [18, 19, 20, 21, 22] as const;

export interface Checkin {
  day: string;
  mood: CheckinMood;
  good: string;
  bad: string;
  /** Saathi's ideas, once asked. */
  suggestion: string | null;
  /** The help lines go first: a mention of self-harm, or the AI flagged danger. */
  harm: boolean;
}

export interface Checkins {
  today: string;
  reminderHour: number | null;
  /** Newest first, at most 14. */
  entries: Checkin[];
}

export const emptyCheckins = (today: string): Checkins => ({ today, reminderHour: null, entries: [] });
export const todayOf = (c: Checkins): Checkin | null => c.entries.find((e) => e.day === c.today) ?? null;

/** '' when it can be saved; else the error code. */
export function checkCheckin(mood: string | null, good: string, bad: string): '' | 'PL237' | 'PL238' {
  if (!isCheckinMood(mood)) return 'PL237';
  if (good.trim().length > CHECKIN_NOTE_MAX || bad.trim().length > CHECKIN_NOTE_MAX) return 'PL238';
  return '';
}

/** Reads the server's answer (`my_checkins()`); anything unexpected becomes nothing. */
export function checkinsFrom(raw: unknown, today = ''): Checkins {
  const r = (raw ?? {}) as Record<string, unknown>;
  const hour = typeof r.reminder_hour === 'number' && (REMINDER_HOURS as readonly number[]).includes(r.reminder_hour) ? r.reminder_hour : null;
  const entries = (Array.isArray(r.entries) ? r.entries : []).flatMap((x): Checkin[] => {
    const e = (x ?? {}) as Record<string, unknown>;
    if (typeof e.day !== 'string' || !isCheckinMood(e.mood)) return [];
    return [{ day: e.day, mood: e.mood, good: typeof e.good === 'string' ? e.good : '', bad: typeof e.bad === 'string' ? e.bad : '',
      suggestion: typeof e.suggestion === 'string' ? e.suggestion : null, harm: e.harm === true }];
  });
  return { today: typeof r.today === 'string' ? r.today : today, reminderHour: hour, entries };
}
