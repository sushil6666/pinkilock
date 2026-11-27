/** My kept-plan streak and city standing (D122). Plain Node: `npm run test:unit`. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KEPT_STREAK_BADGE, keptStreak, standingFrom } from '../../src/domain/streaks';
import type { Invite } from '../../src/domain/types';

const at = (iso: string) => Date.parse(iso);
let n = 0;
const plan = (startsAt: string, status: Invite['status'] = 'kept', other: Partial<Invite> = {}): Invite => ({
  id: `i${++n}`, fromId: 'me', toId: 'zoya', ideaId: 'boba_run', startsAt: at(startsAt), minutes: 30, place: '', note: '', status,
  createdAt: 0, expiresAt: 0, firstPinkyBy: null, lockedAt: null, checkIns: [], flakedBy: null, declinedBy: null, resolvedAt: null, ...other,
});
// Friday 27 November 2026; its week started on Monday the 23rd.
const now = at('2026-11-27T12:00:00+05:30');

test('no kept plans, no streak', () => {
  assert.deepEqual(keptStreak([plan('2026-11-24T18:00:00+05:30', 'flaked')], 'me', now), { weeks: 0, thisWeek: false, best: 0 });
});

test('weeks in a row count, this week included once it has a kept plan', () => {
  const p = [plan('2026-11-10T18:00:00+05:30'), plan('2026-11-17T18:00:00+05:30'), plan('2026-11-25T18:00:00+05:30'), plan('2026-11-26T18:00:00+05:30')];
  assert.deepEqual(keptStreak(p, 'me', now), { weeks: 3, thisWeek: true, best: 3 });
  assert.ok(keptStreak(p, 'me', now).weeks >= KEPT_STREAK_BADGE);
});

test('a streak does not look broken before the week is out', () => {
  const p = [plan('2026-11-10T18:00:00+05:30'), plan('2026-11-17T18:00:00+05:30')];
  assert.deepEqual(keptStreak(p, 'me', now), { weeks: 2, thisWeek: false, best: 2 });
});

test('a missed week ends it, and the best run is remembered', () => {
  const p = [plan('2026-10-05T18:00:00+05:30'), plan('2026-10-12T18:00:00+05:30'), plan('2026-10-19T18:00:00+05:30'), plan('2026-11-25T18:00:00+05:30')];
  assert.deepEqual(keptStreak(p, 'me', now), { weeks: 1, thisWeek: true, best: 3 });
});

test('weeks are India weeks: Sunday late evening is still Sunday', () => {
  const p = [plan('2026-11-22T23:30:00+05:30'), plan('2026-11-16T09:00:00+05:30')];
  assert.equal(keptStreak(p, 'me', now).weeks, 1, 'both plans are in the week of the 16th; this week has none yet');
});

test('a double I came along to counts; someone else\'s plan does not', () => {
  const double = plan('2026-11-24T18:00:00+05:30', 'kept', { fromId: 'aanya', toId: 'kabir', fromFriendId: 'me', toFriendId: 'ira' });
  const theirs = plan('2026-11-17T18:00:00+05:30', 'kept', { fromId: 'aanya', toId: 'kabir' });
  assert.deepEqual(keptStreak([double, theirs], 'me', now), { weeks: 1, thisWeek: true, best: 1 });
});

test('the server answer is read strictly', () => {
  assert.deepEqual(standingFrom({ city: 'Pune', ready: true, top: 5, city_kept_percent: 83 }, ''), { city: 'Pune', ready: true, top: 5, cityKeptPercent: 83 });
  assert.deepEqual(standingFrom({ city: 'Pune', ready: true, top: 7, city_kept_percent: 140 }, ''), { city: 'Pune', ready: true, top: null, cityKeptPercent: null });
  assert.deepEqual(standingFrom(null, 'Goa'), { city: 'Goa', ready: false, top: null, cityKeptPercent: null });
});
