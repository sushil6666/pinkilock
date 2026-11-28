/**
 * Couple mode (D120) in the mock, as in supabase/migrations/20261127000020_couple_mode.sql. The
 * made-up partner says yes a moment after they are asked, hearts what I add to the date list, and
 * does the week's challenge a moment after I do, so the whole of it can be tried alone.
 */
import {
  checkCoupleIdea, checkDay, emptyCouple, isoDay, pickChallenge, weekStart,
  type ChallengeId, type Couple, type CoupleWeek, type DayKind, type SpecialDay,
} from '../../domain/couple';
import { COUPLE_QUESTIONS, checkAnswer, type DailyAnswer, type DailyQuestion, type QuestionId } from '../../domain/daily';
import { fail } from '../../domain/errors';
import type { Backend } from '../backend';

const SAYS_YES_AFTER = 2500;
const HEARTS_AFTER = 4000;
const TICKS_AFTER = 5000;
const ANSWERS_AFTER = 3000;
/** The made-up partner's answers, one picked by the day. i18n: data */
const THEIR_ANSWERS = ['Honestly? You, on a slow Sunday.', 'Chai at the corner stall, every time.', 'That one song from the car ride. You know which.', 'Still thinking about it. Ask me tonight.'];

export interface MockCoupleDb {
  partnerId: string;
  status: 'asked' | 'on';
  askedAt: number;
  since: number | null;
  ideas: { id: string; ideaId: string; mine: boolean; heartMe: boolean; heartThem: boolean; done: boolean; at: number }[];
  days: SpecialDay[];
  weeks: (CoupleWeek & { myAt?: number })[];
  /** Question of the day (D125). */
  answers?: { day: string; question: QuestionId; mine: string | null; theirs: string | null; myAt?: number }[];
}

export interface MockCoupleContext {
  /** Signed in with a profile, or PL002; and the stored couple, if any. */
  open(): Promise<{ couple: MockCoupleDb | null; now: number }>;
  put(c: MockCoupleDb | null): void;
  /** People I matched with: a kept plan for two, and both wanted round two (the made-up people always do). */
  matches(): string[];
  /** Our first kept plan's start. */
  firstDate(partnerId: string): number | null;
  /** The idea is in my city's catalogue. */
  offered(ideaId: string): boolean;
  blocked(id: string): boolean;
}

let seq = 0;
const newId = () => `cp_${Date.now().toString(36)}${(seq++).toString(36)}`;

export function createMockCouple(ctx: MockCoupleContext): Pick<Backend,
  'couple' | 'coupleAsk' | 'coupleAnswer' | 'coupleEnd' | 'coupleAddIdea' | 'coupleIdea' | 'coupleAddDay' | 'coupleRemoveDay' | 'coupleChallenge' | 'coupleQuestion' | 'coupleQuestionAnswer'> {
  /** What the made-up partner and the clock did since the last read. */
  function tick(c: MockCoupleDb, now: number): void {
    if (c.status === 'asked' && now - c.askedAt >= SAYS_YES_AFTER) Object.assign(c, { status: 'on', since: c.askedAt + SAYS_YES_AFTER });
    if (c.status !== 'on') return;
    for (const i of c.ideas) if (!i.heartThem && now - i.at >= HEARTS_AFTER) i.heartThem = true;
    const today = isoDay(now);
    const wk = weekStart(today);
    if (!c.weeks.some((w) => w.week === wk)) {
      const last = c.weeks[c.weeks.length - 1];
      c.weeks = [...c.weeks, { week: wk, challenge: pickChallenge(c.partnerId, wk, (last?.challenge as ChallengeId) ?? null), me: false, them: false }].slice(-12);
    }
    for (const w of c.weeks) if (w.me && !w.them && w.myAt && now - w.myAt >= TICKS_AFTER) w.them = true;
    const answers = (c.answers ??= []);
    if (!answers.some((a) => a.day === today)) {
      const n = Math.round(Date.parse(`${today}T00:00:00Z`) / 86_400_000);
      let h = 0;
      for (const ch of c.partnerId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      answers.push({ day: today, question: COUPLE_QUESTIONS[(h + n) % COUPLE_QUESTIONS.length], mine: null, theirs: null });
    }
    for (const a of answers) if (a.mine && !a.theirs && a.myAt && now - a.myAt >= ANSWERS_AFTER) a.theirs = THEIR_ANSWERS[a.day.charCodeAt(9) % THEIR_ANSWERS.length];
    c.answers = answers.slice(-30);
  }

  function dailyView(c: MockCoupleDb, now: number): DailyQuestion {
    const today = isoDay(now);
    const both = (c.answers ?? []).filter((a) => a.mine && a.theirs);
    const days = new Set(both.map((a) => a.day));
    let streak = 0;
    const d = new Date(`${today}T00:00:00Z`);
    if (!days.has(today)) d.setUTCDate(d.getUTCDate() - 1);
    while (days.has(d.toISOString().slice(0, 10))) { streak++; d.setUTCDate(d.getUTCDate() - 1); }
    const shown = (a: NonNullable<MockCoupleDb['answers']>[number]): DailyAnswer =>
      ({ day: a.day, question: a.question, mine: a.mine, theirs: a.mine ? a.theirs : null, theyAnswered: !!a.theirs });
    const t = (c.answers ?? []).find((a) => a.day === today);
    return { today: t ? shown(t) : null, past: both.filter((a) => a.day < today).reverse().slice(0, 14).map(shown), streak };
  }

  function view(c: MockCoupleDb | null, now: number): Couple {
    const today = isoDay(now);
    const base = { ...emptyCouple(today), matches: ctx.matches() };
    if (!c || ctx.blocked(c.partnerId)) return base;
    const first = ctx.firstDate(c.partnerId);
    return {
      ...base,
      status: c.status === 'on' ? 'on' : 'asked_by_me',
      partnerId: c.partnerId,
      since: c.since,
      firstDate: first ? isoDay(first) : null,
      ideas: c.status === 'on' ? [...c.ideas].sort((a, b) => Number(a.done) - Number(b.done) || b.at - a.at).map(({ at: _at, ...i }) => i) : [],
      days: c.status === 'on' ? [...c.days].sort((a, b) => a.day.localeCompare(b.day)) : [],
      weeks: c.status === 'on' ? c.weeks.map(({ myAt: _m, ...w }) => w) : [],
    };
  }

  async function read(): Promise<{ c: MockCoupleDb | null; now: number }> {
    const { couple, now } = await ctx.open();
    if (couple && ctx.blocked(couple.partnerId)) {
      ctx.put(null);
      return { c: null, now };
    }
    if (couple) tick(couple, now);
    return { c: couple, now };
  }

  /** My couple while it is on, or PL221; `fn` changes it, and the answer is the whole of it. */
  async function onChange(fn: (c: MockCoupleDb, now: number) => void): Promise<Couple> {
    const { c, now } = await read();
    if (!c || c.status !== 'on') fail('PL221');
    fn(c, now);
    ctx.put(c);
    return view(c, now);
  }

  return {
    async couple() {
      const { c, now } = await read();
      if (c) ctx.put(c);
      return view(c, now);
    },

    async coupleAsk(profileId) {
      const { c, now } = await read();
      if (!ctx.matches().includes(profileId)) fail('PL220');
      if (c) fail('PL222');
      const next: MockCoupleDb = { partnerId: profileId, status: 'asked', askedAt: now, since: null, ideas: [], days: [], weeks: [] };
      ctx.put(next);
      return view(next, now);
    },

    // The made-up partner never asks first, so there is never an ask of theirs to answer.
    async coupleAnswer() {
      await read();
      fail('PL224');
    },

    async coupleEnd() {
      const { now } = await read();
      ctx.put(null);
      return view(null, now);
    },

    coupleAddIdea: (ideaId) => onChange((c, now) => {
      checkCoupleIdea(view(c, now), ideaId, ctx.offered(ideaId));
      c.ideas.push({ id: newId(), ideaId, mine: true, heartMe: true, heartThem: false, done: false, at: now });
    }),

    coupleIdea: (id, action) => onChange((c) => {
      const i = c.ideas.find((x) => x.id === id);
      if (!i) fail('PL228');
      if (action === 'heart') i.heartMe = !i.heartMe;
      else if (action === 'done') i.done = !i.done;
      else if (action === 'remove') c.ideas = c.ideas.filter((x) => x.id !== id);
      else fail('PL228');
    }),

    coupleAddDay: (kind: DayKind, day: string) => onChange((c, now) => {
      checkDay(view(c, now), kind, day);
      c.days.push({ id: newId(), kind, day, mine: true });
    }),

    coupleRemoveDay: (id) => onChange((c) => {
      if (!c.days.some((d) => d.id === id && d.mine)) fail('PL233');
      c.days = c.days.filter((d) => d.id !== id);
    }),

    async coupleQuestion() {
      const { c, now } = await read();
      if (!c || c.status !== 'on') fail('PL221');
      ctx.put(c);
      return dailyView(c, now);
    },

    async coupleQuestionAnswer(body) {
      const { c, now } = await read();
      if (!c || c.status !== 'on') fail('PL221');
      const code = checkAnswer(body);
      if (code) fail(code);
      const a = c.answers!.find((x) => x.day === isoDay(now))!;
      if (a.mine) fail('PL236');
      a.mine = body.trim();
      a.myAt = now;
      ctx.put(c);
      return dailyView(c, now);
    },

    coupleChallenge: (done) => onChange((c, now) => {
      const w = c.weeks.find((x) => x.week === weekStart(isoDay(now)));
      if (!w) fail('PL221');
      w.me = done;
      w.myAt = done ? now : undefined;
    }),
  };
}
