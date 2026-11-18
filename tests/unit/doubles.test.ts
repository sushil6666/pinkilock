/**
 * The double micro-date rules in src/domain/invites.ts (docs/build-plan.md F3). The same rules are
 * SQL in supabase/migrations/20261118000002_double_dates.sql, tested in tests/db/doubles.sql.
 * Plain Node: `npm run test:unit`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppError } from '../../src/domain/errors';
import { CHECK_IN_CLOSES_AFTER, MIN, canReveal, checkIn, friendOn, lockRole, offerPinky, otherId, otherSide, sweep } from '../../src/domain/invites';
import type { Invite } from '../../src/domain/types';

// A asks with B; C is asked with D.
const now = Date.now();
const ask: Invite = {
  id: 'i', fromId: 'a', toId: 'c', fromFriendId: 'b', toFriendId: 'd', pinkies: [], ideaId: 'boba_run', startsAt: now + 60 * MIN,
  minutes: 25, place: 'Juhu', note: '', status: 'sent', createdAt: now, expiresAt: now + 60 * MIN, firstPinkyBy: null, lockedAt: null,
  checkIns: [], flakedBy: null, declinedBy: null, resolvedAt: null,
};
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.code : 'not an AppError';
  }
  return null;
};

test('everyone sees the other side led by the asker or the person asked', () => {
  assert.equal(otherId(ask, 'a'), 'c');
  assert.equal(otherId(ask, 'b'), 'c');
  assert.equal(otherId(ask, 'c'), 'a');
  assert.equal(otherId(ask, 'd'), 'a');
  assert.deepEqual(otherSide(ask, 'b'), ['c', 'd']);
  assert.deepEqual(otherSide(ask, 'd'), ['a', 'b']);
  assert.equal(friendOn(ask, 'a'), 'b');
  assert.equal(friendOn(ask, 'd'), 'c');
});

test('the three others put a pinky out in any order, then the asker seals it', () => {
  assert.equal(lockRole(ask, 'a'), 'waiting');
  assert.equal(code(() => offerPinky(ask, 'a', now)), 'PL094');
  let i = offerPinky(ask, 'd', now);
  assert.equal(i.status, 'half_locked');
  assert.equal(lockRole(i, 'd'), 'waiting');
  assert.equal(lockRole(i, 'b'), 'first');
  i = offerPinky(offerPinky(i, 'b', now), 'c', now);
  assert.equal(offerPinky(i, 'c', now), i, 'a second pinky changes nothing');
  assert.equal(lockRole(i, 'a'), 'seal');
  i = offerPinky(i, 'a', now);
  assert.equal(i.status, 'locked');
  assert.deepEqual(i.pinkies, ['d', 'b', 'c', 'a']);
});

const locked: Invite = { ...ask, status: 'locked', pinkies: ['b', 'c', 'd', 'a'], startsAt: now };

test('kept at once when all four check in', () => {
  let i = locked;
  for (const p of ['a', 'c', 'b']) i = checkIn(i, p, now);
  assert.equal(i.status, 'locked');
  assert.equal(checkIn(i, 'd', now).status, 'kept');
});

test('when the window closes: kept if someone from each side came, otherwise a flake', () => {
  const late = now + CHECK_IN_CLOSES_AFTER + MIN;
  const oneEach = sweep({ ...locked, checkIns: ['b', 'c'] }, late);
  assert.equal(oneEach.status, 'kept');
  const oneSide = sweep({ ...locked, checkIns: ['a', 'b'] }, late);
  assert.deepEqual([oneSide.status, oneSide.flakedBy], ['flaked', null]);
  const allButOne = sweep({ ...locked, checkIns: ['a', 'b', 'c'] }, late);
  assert.equal(allButOne.status, 'kept', 'three of four is kept for the three');
});

test('the reveal opens only across sides, between two people who both came', () => {
  const kept: Invite = { ...locked, status: 'kept', checkIns: ['a', 'c', 'b'] };
  assert.ok(canReveal(kept, 'a', 'c'));
  assert.ok(canReveal(kept, 'b', 'c'));
  assert.ok(!canReveal(kept, 'a', 'b'), 'not my own friend');
  assert.ok(!canReveal(kept, 'a', 'd'), 'not someone who did not come');
  assert.ok(!canReveal(kept, 'd', 'a'), 'and not for them either');
  assert.ok(!canReveal({ ...kept, status: 'locked' }, 'a', 'c'), 'nothing before it is kept');
});
