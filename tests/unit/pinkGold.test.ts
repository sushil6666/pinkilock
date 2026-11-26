/**
 * Pink Gold (D115, D116): the plans, Boost packs and rules exist twice (src/domain/pinkGold.ts and
 * private.shop_item in SQL) and must agree. tests/db/pink_gold.sql runs the SQL side.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { AppError } from '../../src/domain/errors';
import { BOOST_PACKS, PLANS, addMonths, asksInView, canBuy, goldUntilAfter, istMonth, istMonthEnd, openAskCap, perMonth, saves } from '../../src/domain/pinkGold';
import { en } from '../../src/i18n/en';
import { hi } from '../../src/i18n/langs/hi';

const ROOT = join(__dirname, '..', '..');
const migration = readFileSync(join(ROOT, 'supabase', 'migrations', '20261126000007_pink_gold.sql'), 'utf8');
const codeOf = (fn: () => unknown): string => {
  try {
    fn();
    return '';
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};

test('the prices are the ones Sushil set', () => {
  assert.deepEqual(PLANS.map((p) => [p.id, p.rupees, p.months]), [['g1', 699, 1], ['g3', 1599, 3], ['g6', 2400, 6], ['g12', 3300, 12]]);
  assert.deepEqual(BOOST_PACKS.map((b) => [b.id, b.rupees, b.boosts]), [['b1', 150, 1], ['b6', 699, 6]]);
  assert.equal(perMonth(PLANS[1]), 533);
  assert.equal(saves(PLANS[1]), 498);
  assert.equal(saves(PLANS[0]), 0);
});

test('SQL sells the same things at the same prices', () => {
  const row = (id: string, ...n: number[]) => `('${id}', ${n.join(', ')})`;
  for (const p of PLANS) assert.ok(migration.includes(row(p.id, p.rupees, p.months, 0)), `plan ${p.id} in shop_item`);
  for (const b of BOOST_PACKS) assert.ok(migration.includes(row(b.id, b.rupees, 0, b.boosts)), `boosts ${b.id} in shop_item`);
});

test('months add as Postgres adds them, and a plan bought while on adds to the end', () => {
  const jan31 = Date.UTC(2027, 0, 31, 10);
  assert.equal(addMonths(jan31, 1), Date.UTC(2027, 1, 28, 10));
  assert.equal(addMonths(jan31, 12), Date.UTC(2028, 0, 31, 10));
  const now = Date.UTC(2026, 10, 26);
  assert.equal(goldUntilAfter(null, false, 3, now), Date.UTC(2027, 1, 26));
  assert.equal(goldUntilAfter(Date.UTC(2026, 11, 10), true, 1, now), Date.UTC(2027, 0, 10));
  assert.equal(goldUntilAfter(Date.UTC(2026, 9, 1), false, 1, now), Date.UTC(2026, 11, 26), 'an old end starts again from now');
  assert.equal(goldUntilAfter(null, true, 6, now), null, 'granted for good stays for good');
});

test('no more than 13 months ahead, 12 bought Boosts waiting, and only things on the list', () => {
  const now = Date.UTC(2026, 10, 26);
  assert.equal(codeOf(() => canBuy('g12', { goldOn: false, goldUntil: null, boughtBoosts: 0 }, now)), '');
  assert.equal(codeOf(() => canBuy('g12', { goldOn: true, goldUntil: addMonths(now, 1), boughtBoosts: 0 }, now)), '');
  assert.equal(codeOf(() => canBuy('g3', { goldOn: true, goldUntil: addMonths(now, 12), boughtBoosts: 0 }, now)), 'PL184');
  assert.equal(codeOf(() => canBuy('g1', { goldOn: true, goldUntil: null, boughtBoosts: 0 }, now)), 'PL184');
  assert.equal(codeOf(() => canBuy('b6', { goldOn: false, goldUntil: null, boughtBoosts: 6 }, now)), '');
  assert.equal(codeOf(() => canBuy('b1', { goldOn: false, goldUntil: null, boughtBoosts: 12 }, now)), 'PL186');
  assert.equal(codeOf(() => canBuy('p49x', { goldOn: false, goldUntil: null, boughtBoosts: 0 }, now)), 'PL136');
});

test('members get 15 open asks; everyone else 3 plus what they bought', () => {
  assert.equal(openAskCap(true, 0), 15);
  assert.equal(openAskCap(true, 2), 15);
  assert.equal(openAskCap(false, 2), 5);
  assert.ok(migration.includes(">= 15 then") && migration.includes("errcode = 'PL187'"), 'SQL caps members at 15');
});

test("a member's free Boosts belong to the Indian month", () => {
  const lateUtc = Date.UTC(2026, 10, 30, 20); // 1 Dec, 01:30 in India
  assert.equal(istMonth(lateUtc), '2026-12');
  assert.equal(istMonthEnd(Date.UTC(2026, 10, 26)), Date.UTC(2026, 11, 1) - 5.5 * 3_600_000);
});

test('the name stays Pink Gold in English and Hindi', () => {
  assert.equal(en.pinkGold.name, 'Pink Gold');
  assert.equal(hi.pinkGold?.name, 'Pink Gold');
  assert.ok(String(hi.gold?.perks?.asks).includes('15'));
});

test('see who asked you: members see all, everyone else the next one and a count', () => {
  assert.deepEqual(asksInView(['a', 'b', 'c'], true), { shown: ['a', 'b', 'c'], more: 0 });
  assert.deepEqual(asksInView(['a', 'b', 'c'], false), { shown: ['a'], more: 2 });
  assert.deepEqual(asksInView([], false), { shown: [], more: 0 });
});

test('a city with early access takes members only, in SQL too', () => {
  assert.ok(migration.includes('add column early boolean') && migration.includes('c.early and private.is_pink_gold(me)'));
});
