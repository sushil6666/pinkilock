/**
 * Couple mode's daily part (D125): a question of the day both answer (each answer shows once both
 * have answered) and a relationship tip of the day. Pure TypeScript: no React Native, so unit tests
 * load it in plain Node.
 *
 * The questions exist twice: COUPLE_QUESTIONS here and `private.couple_question_ids()` in
 * supabase/migrations/20261127000024_daily_question.sql, same ids in the same order
 * (tests/unit/daily.test.ts checks). The server picks the day's question; the words are in src/i18n
 * (`daily.questions`). Tips live only in the app (`daily.tips`), one a day, the same for everyone.
 */

export const COUPLE_QUESTIONS = [
  'never_share_snack', 'childhood_hero', 'perfect_sunday', 'song_on_repeat', 'first_impression', 'proud_of_this_week',
  'travel_dream', 'comfort_food', 'silly_fear', 'best_gift', 'teacher_remember', 'superpower', 'small_joy', 'family_tradition',
  'last_laugh', 'skill_to_learn', 'favourite_festival', 'movie_cry', 'morning_or_night', 'chai_or_coffee', 'dream_job_kid',
  'thing_about_me', 'best_trip', 'monsoon_memory', 'grateful_today', 'rainy_day_plan', 'cook_signature', 'book_or_show',
  'kindest_stranger', 'one_rule', 'date_to_repeat', 'city_secret', 'old_photo', 'hidden_talent', 'calm_place', 'look_forward',
  'little_habit', 'win_this_month', 'make_you_smile', 'next_adventure',
] as const;
export type QuestionId = (typeof COUPLE_QUESTIONS)[number];
export const isQuestion = (id: unknown): id is QuestionId => (COUPLE_QUESTIONS as readonly unknown[]).includes(id);

export const RELATIONSHIP_TIPS = [
  'ask_not_assume', 'listen_fully', 'thank_small', 'phone_down', 'repair_fast', 'kind_tone', 'plan_together', 'own_time',
  'say_what_you_need', 'celebrate_wins', 'curious_questions', 'no_scorekeeping', 'touch_base', 'boundaries_ok', 'apologise_well',
  'laugh_together', 'friends_matter', 'money_talk', 'slow_down', 'notice_effort', 'keep_promises', 'no_silent_treatment',
  'compliment_specific', 'new_together', 'pause_in_fights', 'respect_no', 'share_a_worry', 'remember_details', 'sleep_on_it',
  'check_in_weekly',
] as const;
export type TipId = (typeof RELATIONSHIP_TIPS)[number];

/** Longest answer, in characters. */
export const ANSWER_MAX = 300;

/** The tip for a day (`YYYY-MM-DD`): the list in order, a new one each day. */
export function tipOf(day: string): TipId {
  const n = Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  const i = ((n % RELATIONSHIP_TIPS.length) + RELATIONSHIP_TIPS.length) % RELATIONSHIP_TIPS.length;
  return RELATIONSHIP_TIPS[i];
}

export interface DailyAnswer {
  day: string;
  question: QuestionId;
  /** My answer, once I gave it. */
  mine: string | null;
  /** Theirs: only once I have answered too. */
  theirs: string | null;
  /** They answered (shown even before I do, so I know they are waiting). */
  theyAnswered: boolean;
}

export interface DailyQuestion {
  today: DailyAnswer | null;
  /** Earlier days both answered, newest first, at most 14. */
  past: DailyAnswer[];
  /** Days in a row both answered, today counting once both have. */
  streak: number;
}

export const emptyDaily: DailyQuestion = { today: null, past: [], streak: 0 };

/** '' when the answer is fine; else the error code. */
export function checkAnswer(body: string): '' | 'PL235' {
  const s = body.trim();
  return s.length >= 1 && s.length <= ANSWER_MAX ? '' : 'PL235';
}

const answerFrom = (r: Record<string, unknown>): DailyAnswer | null =>
  typeof r.day === 'string' && isQuestion(r.question)
    ? {
        day: r.day,
        question: r.question,
        mine: typeof r.mine === 'string' ? r.mine : null,
        theirs: typeof r.theirs === 'string' && typeof r.mine === 'string' ? r.theirs : null,
        theyAnswered: r.they_answered === true,
      }
    : null;

/** Reads the server's answer (`couple_question()`); anything unexpected becomes nothing. */
export function dailyFrom(raw: unknown): DailyQuestion {
  const r = (raw ?? {}) as Record<string, unknown>;
  const today = r.today && typeof r.today === 'object' ? answerFrom(r.today as Record<string, unknown>) : null;
  const past = Array.isArray(r.past) ? r.past.map((x) => answerFrom((x ?? {}) as Record<string, unknown>)).filter((x): x is DailyAnswer => !!x) : [];
  return { today, past, streak: typeof r.streak === 'number' && r.streak >= 0 ? Math.floor(r.streak) : 0 };
}
