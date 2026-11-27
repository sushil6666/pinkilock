/**
 * Bring a friend (D118): the rewards and rules exist twice (src/domain/referrals.ts and
 * supabase/migrations/20261127000002_referrals.sql) and must agree. tests/db/referrals.sql runs
 * the SQL side.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  DEVICE_ID, REFERRAL_BOOSTS, REFERRAL_CAP, REFERRAL_GOLD_DAYS, REFERRAL_MONTH_AT, REFERRAL_MONTH_DAYS, REFERRAL_WINDOW_DAYS,
  emptyReferrals, referralCounts, referralRewards, toMonth,
} from '../../src/domain/referrals';
import { REFERRAL_DAYS } from '../../src/domain/talk';

const ROOT = join(__dirname, '..', '..');
const sql = readFileSync(join(ROOT, 'supabase', 'migrations', '20261127000002_referrals.sql'), 'utf8');

test('the rewards Sushil picked: a week each, a Boost per friend, a month at five', () => {
  assert.equal(REFERRAL_GOLD_DAYS, 7);
  assert.equal(REFERRAL_BOOSTS, 1);
  assert.equal(REFERRAL_MONTH_AT, 5);
  assert.equal(REFERRAL_MONTH_DAYS, 30);
});

test('SQL gives the same rewards, with the same cap', () => {
  assert.ok(sql.includes(`private.pink_gold_gift(r.friend, ${REFERRAL_GOLD_DAYS})`), 'the friend\'s week');
  assert.ok(sql.includes(`private.pink_gold_gift(r.referrer, ${REFERRAL_GOLD_DAYS})`), 'my week');
  assert.ok(sql.includes(`private.boost_gift(r.referrer, ${REFERRAL_BOOSTS}, 'referral:'`), 'my Boost, once per friend');
  assert.ok(sql.includes(`if n = ${REFERRAL_MONTH_AT} then perform private.pink_gold_gift(r.referrer, ${REFERRAL_MONTH_DAYS})`), 'the month, once');
  assert.ok(sql.includes(`at > now() - interval '${REFERRAL_WINDOW_DAYS} days') >= ${REFERRAL_CAP}`), 'the cap');
  assert.ok(sql.includes(`interval '${REFERRAL_DAYS} days'`), 'a Doubles invite has the same week as a link');
  assert.ok(sql.includes("'^[A-Za-z0-9_-]{16,64}$'") && DEVICE_ID.source === '^[A-Za-z0-9_-]{16,64}$', 'the same device id shape');
});

test('what my friends have given me so far', () => {
  assert.deepEqual(referralRewards(0), { goldDays: 0, boosts: 0, month: false });
  assert.deepEqual(referralRewards(4), { goldDays: 28, boosts: 4, month: false });
  assert.deepEqual(referralRewards(5), { goldDays: 65, boosts: 5, month: true });
  assert.deepEqual(referralRewards(6), { goldDays: 72, boosts: 6, month: true });
  assert.deepEqual([0, 4, 5, 9].map(toMonth), [5, 1, 0, 0]);
});

test('a friend counts only with all four done', () => {
  const all = { phone: true, face: true, plans: true, device: true };
  assert.ok(referralCounts(all));
  for (const k of Object.keys(all) as (keyof typeof all)[]) assert.ok(!referralCounts({ ...all, [k]: false }), `not without ${k}`);
  assert.equal(emptyReferrals().mine, null);
});

test('a device id is random letters, never a hardware id or anything else', () => {
  assert.ok(DEVICE_ID.test('3f2a9c0e1b7d4a6f8e5c2b1a0d9e8f7c'));
  for (const bad of ['short', 'x; drop table devices', '', 'a'.repeat(65)]) assert.ok(!DEVICE_ID.test(bad), bad);
});
