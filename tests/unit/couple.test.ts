/** Couple mode (D120): the shared rules, and the catalogue that exists twice. Plain Node: `npm run test:unit`. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  COUPLE_CHALLENGES, CHALLENGE_EMOJI, DAY_KINDS, checkDay, coupleStreak, daysTogether, emptyCouple, nextYearly, parseDay, pickChallenge, upcoming, weekStart,
  type Couple, type CoupleWeek,
} from '../../src/domain/couple';
import { AppError } from '../../src/domain/errors';
import { en } from '../../src/i18n/en';

const sql = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20261127000020_couple_mode.sql'), 'utf8');

test('the challenges are the same, in the same order, in SQL and in the app, and each has words and an emoji', () => {
  const body = sql.match(/function private\.couple_challenge_ids\(\)[\s\S]*?array\[([\s\S]*?)\]::text\[\]/);
  assert.ok(body, 'private.couple_challenge_ids() is in the migration');
  const ids = [...body[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(ids, [...COUPLE_CHALLENGES]);
  const words = (en as unknown as { couple: { challenges: Record<string, string> } }).couple.challenges;
  for (const id of COUPLE_CHALLENGES) {
    assert.ok(words[id], `${id} has words in src/i18n/en.ts`);
    assert.ok(CHALLENGE_EMOJI[id], `${id} has an emoji`);
  }
});

test('the kinds of special day match the table', () => {
  const check = sql.match(/kind text not null check \(kind in \(([^)]*)\)\)/);
  assert.ok(check);
  assert.deepEqual([...check[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]), [...DAY_KINDS]);
});

test('a week starts on Monday', () => {
  assert.equal(weekStart('2026-11-27'), '2026-11-23'); // a Friday
  assert.equal(weekStart('2026-11-23'), '2026-11-23');
  assert.equal(weekStart('2026-11-29'), '2026-11-23'); // Sunday
  assert.equal(weekStart('2026-03-01'), '2026-02-23');
});

test("the mock never picks last week's challenge again", () => {
  for (let i = 0; i < 50; i++) {
    const week = `2026-0${1 + (i % 9)}-0${1 + (i % 7)}`;
    const first = pickChallenge(`c${i}`, week, null);
    assert.notEqual(pickChallenge(`c${i}`, week, first), first);
  }
});

const wk = (week: string, me: boolean, them: boolean): CoupleWeek => ({ week, challenge: 'sunrise', me, them });

test('the couple streak counts weeks both did, and this week only once both did it', () => {
  const weeks = [wk('2026-11-02', true, true), wk('2026-11-09', true, true), wk('2026-11-16', true, true), wk('2026-11-23', true, false)];
  assert.equal(coupleStreak(weeks, '2026-11-27'), 3, 'this week is not done yet, so the run to last week stands');
  assert.equal(coupleStreak([...weeks.slice(0, 3), wk('2026-11-23', true, true)], '2026-11-27'), 4);
  assert.equal(coupleStreak([wk('2026-11-02', true, true), wk('2026-11-16', true, true)], '2026-11-27'), 1, 'a missed week breaks it');
  assert.equal(coupleStreak([], '2026-11-27'), 0);
});

test('a typed date is read as day, month, year, and only a real one', () => {
  assert.equal(parseDay('14/03/1999'), '1999-03-14');
  assert.equal(parseDay(' 1-2-2026 '), '2026-02-01');
  assert.equal(parseDay('29/02/2024'), '2024-02-29');
  assert.equal(parseDay('29/02/2026'), null);
  assert.equal(parseDay('31/04/2026'), null);
  assert.equal(parseDay('2026-04-01'), null);
  assert.equal(parseDay('soon'), null);
});

test('a yearly day comes round on or after today; 29 February falls on the 28th', () => {
  assert.deepEqual(nextYearly('1999-03-14', '2026-11-27'), { day: '2027-03-14', years: 28 });
  assert.deepEqual(nextYearly('1999-11-27', '2026-11-27'), { day: '2026-11-27', years: 27 });
  assert.deepEqual(nextYearly('2024-02-29', '2027-01-10'), { day: '2027-02-28', years: 3 });
});

const couple = (over: Partial<Couple>): Couple => ({ ...emptyCouple('2026-11-27'), status: 'on', partnerId: 'p', ...over });
const at = (day: string) => Date.parse(`${day}T06:30:00Z`);

test("coming up: day counts from together, birthdays each year, the first date's anniversary, soonest first", () => {
  const c = couple({
    since: at('2026-11-20'),
    firstDate: '2025-12-01',
    days: [{ id: '1', kind: 'birthday', day: '1998-12-05', mine: false }, { id: '2', kind: 'first_trip', day: '2027-01-15', mine: true }],
  });
  assert.equal(daysTogether(c), 8);
  const u = upcoming(c);
  assert.deepEqual(u.map((x) => [x.kind, x.day]), [['together', '2026-11-27'], ['first_date', '2026-12-01'], ['birthday', '2026-12-05'], ['first_trip', '2027-01-15']]);
  assert.equal(u[0].count, 7);
  assert.equal(u[1].years, 1);
  assert.equal(u[2].years, 28);
  assert.equal(u[3].years, undefined, 'a day still to come is shown as itself');
});

test('a first date this year comes round next year; after a year together, every year', () => {
  assert.deepEqual(upcoming(couple({ firstDate: '2026-11-01' })).map((x) => [x.kind, x.day, x.years]), [['first_date', '2027-11-01', 1]]);
  const u = upcoming(couple({ since: at('2024-12-10') }));
  assert.deepEqual(u.map((x) => [x.kind, x.day, x.years]), [['together', '2026-12-10', 2]]);
});

test('the mock refuses special days as the server does', () => {
  const code = (fn: () => void) => { try { fn(); return null; } catch (e) { return e instanceof AppError ? e.code : 'other'; } };
  const c = couple({ days: [{ id: '1', kind: 'birthday', day: '1998-12-05', mine: true }] });
  assert.equal(code(() => checkDay(c, 'wedding', '2026-01-01')), 'PL229');
  assert.equal(code(() => checkDay(c, 'special', null)), 'PL230');
  assert.equal(code(() => checkDay(c, 'special', '2029-01-01')), 'PL230');
  assert.equal(code(() => checkDay(c, 'birthday', '1998-12-06')), 'PL231');
  assert.equal(code(() => checkDay(couple({ days: Array.from({ length: 12 }, (_, i) => ({ id: `${i}`, kind: 'special' as const, day: '2026-01-01', mine: true })) }), 'special', '2026-02-01')), 'PL232');
  assert.equal(code(() => checkDay(c, 'special', '2026-02-01')), null);
});
