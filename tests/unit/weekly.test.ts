/** This week's plan ideas (D121). Plain Node: `npm run test:unit`. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ideaOf, offeredIn } from '../../src/domain/ideas';
import type { Invite } from '../../src/domain/types';
import { WEEKLY_IDEAS, isOn, keptWith, mondayOf, weeklyIdeas } from '../../src/domain/weekly';

const me = { id: 'u1', country: 'IN', city: 'Mumbai', ideaIds: ['boba_run', 'chai_walk', 'momo_stop'] };
const at = (iso: string) => Date.parse(iso);

test('the week starts on Monday in India', () => {
  assert.equal(mondayOf(at('2026-11-27T10:00:00Z')), '2026-11-23');
  assert.equal(mondayOf(at('2026-11-29T20:00:00Z')), '2026-11-30', 'Sunday 20:00 UTC is already Monday in India');
  assert.equal(mondayOf(at('2026-11-23T00:30:00+05:30')), '2026-11-23');
});

test('three ideas, all offered in my city, the same all week', () => {
  const a = weeklyIdeas(me, at('2026-11-24T08:00:00Z'));
  const b = weeklyIdeas(me, at('2026-11-28T08:00:00Z'));
  assert.equal(a.length, WEEKLY_IDEAS);
  assert.deepEqual(a.map((i) => i.id), b.map((i) => i.id));
  for (const i of a) assert.ok(offeredIn(i.id, me.country, me.city), `${i.id} is offered in Mumbai`);
});

test('mixed kinds, and never last week\'s ideas, for many weeks and people', () => {
  let three = 0;
  for (let w = 0; w < 30; w++) {
    for (const id of ['u1', 'u2', 'u3']) {
      const p = { ...me, id };
      const now = at('2026-01-05T08:00:00Z') + w * 7 * 86_400_000;
      const these = weeklyIdeas(p, now).map((i) => i.id);
      const last = weeklyIdeas(p, now - 7 * 86_400_000).map((i) => i.id);
      const kinds = new Set(these.map((i) => ideaOf(i).kind)).size;
      assert.ok(kinds >= 2, 'at least two kinds');
      if (kinds === 3) three += 1;
      assert.ok(these.every((i) => !last.includes(i)), `week ${w}: no idea from last week`);
    }
  }
  assert.ok(three >= 80, `three kinds in most weeks (${three} of 90)`);
});

test('another city\'s ideas never show', () => {
  for (let w = 0; w < 20; w++) {
    const ideas = weeklyIdeas({ ...me, city: 'Pune' }, at('2026-01-05T08:00:00Z') + w * 7 * 86_400_000);
    assert.ok(ideas.every((i) => !i.cities || i.cities.includes('Pune')));
  }
});

test('"Ask" goes to whom I last kept a plan for two with, once each; doubles and flakes do not count', () => {
  const inv = (id: string, other: string, status: Invite['status'], startsAt: number, double = false) =>
    ({ id, fromId: 'u1', toId: other, status, startsAt, checkIns: [], ...(double ? { fromFriendId: 'f1', toFriendId: 'f2' } : {}) }) as unknown as Invite;
  const list = [inv('a', 'zoya', 'kept', 1), inv('b', 'dev', 'kept', 3), inv('c', 'zoya', 'kept', 2), inv('d', 'ira', 'flaked', 9), inv('e', 'kabir', 'kept', 8, true), inv('f', 'rehan', 'locked', 10)];
  assert.deepEqual(keptWith(list, 'u1'), ['dev', 'zoya']);
});

test('an event is on between its start and end', () => {
  const e = { id: 'x', title: 't', emoji: '✨', place: 'p', venueId: null, ideaId: null, startsAt: 10, endsAt: 20, url: null, free: false };
  assert.equal(isOn(e, 9), false);
  assert.equal(isOn(e, 10), true);
  assert.equal(isOn(e, 20), false);
});
