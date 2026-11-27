/**
 * Couple mode (D120) in the mock, as in supabase/migrations/20261127000020_couple_mode.sql. The
 * made-up partner says yes a moment after they are asked, hearts what I add to the date list, and
 * does the week's challenge a moment after I do, so the whole of it can be tried alone.
 */
import {
  checkCoupleIdea, checkDay, emptyCouple, isoDay, pickChallenge, weekStart,
  type ChallengeId, type Couple, type CoupleWeek, type DayKind, type SpecialDay,
} from '../../domain/couple';
import { fail } from '../../domain/errors';
import type { Backend } from '../backend';

const SAYS_YES_AFTER = 2500;
const HEARTS_AFTER = 4000;
const TICKS_AFTER = 5000;

export interface MockCoupleDb {
  partnerId: string;
  status: 'asked' | 'on';
  askedAt: number;
  since: number | null;
  ideas: { id: string; ideaId: string; mine: boolean; heartMe: boolean; heartThem: boolean; done: boolean; at: number }[];
  days: SpecialDay[];
  weeks: (CoupleWeek & { myAt?: number })[];
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
  'couple' | 'coupleAsk' | 'coupleAnswer' | 'coupleEnd' | 'coupleAddIdea' | 'coupleIdea' | 'coupleAddDay' | 'coupleRemoveDay' | 'coupleChallenge'> {
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

    coupleChallenge: (done) => onChange((c, now) => {
      const w = c.weeks.find((x) => x.week === weekStart(isoDay(now)));
      if (!w) fail('PL221');
      w.me = done;
      w.myAt = done ? now : undefined;
    }),
  };
}
