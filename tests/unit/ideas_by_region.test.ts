/**
 * Ideas by region (docs/build-plan.md, WP9). The region lists exist twice (`countries` in IDEAS and
 * the `ideas.countries` column) and must match; every country has at least 20 ideas to pick from;
 * the app refuses what the server refuses (PL104). Plain Node: `npm run test:unit`.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { COUNTRIES } from '../../src/domain/countries';
import { AppError } from '../../src/domain/errors';
import { IDEAS, ideasFor, offeredIn } from '../../src/domain/ideas';
import { checkProfile } from '../../src/domain/profile';

const dir = join(__dirname, '..', '..', 'supabase', 'migrations');
const sql = readdirSync(dir).sort().map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');

test('region lists in SQL are the countries in IDEAS', () => {
  const bySql = Object.fromEntries([...sql.matchAll(/update public\.ideas set countries = array\[([^\]]*)\] where id = '([^']+)';/g)]
    .map((m) => [m[2], [...m[1].matchAll(/'([A-Z]{2})'/g)].map((c) => c[1])]));
  assert.deepEqual(bySql, Object.fromEntries(IDEAS.filter((i) => i.countries).map((i) => [i.id, i.countries])));
});

test('every country has at least 20 ideas, and local ones show only at home', () => {
  for (const c of COUNTRIES) assert.ok(ideasFor(c.code).length >= 20, `${c.code} has ${ideasFor(c.code).length}`);
  assert.ok(offeredIn('pani_puri_duel', 'IN'));
  assert.ok(!offeredIn('pani_puri_duel', 'GB'));
  assert.ok(offeredIn('boba_run', 'GB'), 'an idea with no list is everywhere');
});

const code = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.code : 'not an AppError';
  }
  return null;
};
const card = { name: 'Riya', age: 24, area: '', pronouns: '', tagline: '', vibes: [], ideaIds: ['boba_run', 'meme_duel', 'pani_puri_duel'] };

test('a local idea is picked only where it is offered; one already saved stays', () => {
  assert.equal(code(() => checkProfile(card, 'Mumbai')), null);
  // A city outside India, as the server would see it (no such city is open yet).
  assert.equal(code(() => checkProfile(card, 'Atlantis')), 'PL104', 'a city we do not know is no country, so only everywhere ideas');
  assert.equal(code(() => checkProfile(card, 'Atlantis', { area: '', pronouns: '', ideaIds: ['pani_puri_duel'] })), null, 'kept from before');
});
