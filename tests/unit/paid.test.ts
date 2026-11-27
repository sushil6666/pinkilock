/**
 * Payments paused (D117): the switch the app reads, and the Spicy free-unlock week. The server's
 * copy is checked in tests/db/paid_pause.sql. Plain Node: `npm run test:unit`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PAUSED, SPICY_FREE_DAYS, spicyFreeNext, switchesFrom } from '../../src/domain/paid';

const DAY = 24 * 3_600_000;

test('the app treats anything but a plain yes from the server as paused', () => {
  assert.deepEqual(PAUSED, { paid: false });
  assert.deepEqual(switchesFrom({ paid: true }), { paid: true });
  for (const raw of [null, undefined, {}, { paid: 'true' }, { paid: 1 }, 'paid', { paid: false }]) assert.deepEqual(switchesFrom(raw), { paid: false });
});

test('a free Spicy unlock opens again 7 days after the last one', () => {
  const now = Date.UTC(2026, 10, 27, 10);
  assert.equal(SPICY_FREE_DAYS, 7);
  assert.equal(spicyFreeNext([], now), null);
  assert.equal(spicyFreeNext([now - 8 * DAY], now), null);
  assert.equal(spicyFreeNext([now - 2 * DAY], now), now + 5 * DAY);
  assert.equal(spicyFreeNext([now - 6 * DAY, now - DAY], now), now + 6 * DAY);
});
