/**
 * Ideas by region (docs/build-plan.md, WP9). The region lists exist twice (`countries` in IDEAS and
 * the `ideas.countries` column) and must match; every country has at least 20 ideas to pick from;
 * the app refuses what the server refuses (PL104). Plain Node: `npm run test:unit`.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CITIES, COUNTRIES } from '../../src/domain/countries';
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

test('city ideas in SQL are the cities in IDEAS; each open city has its own, shown only there', () => {
  const bySql = Object.fromEntries([...sql.matchAll(/update public\.ideas set cities = array\[([^\]]*)\] where id = '([^']+)';/g)]
    .map((m) => [m[2], [...m[1].matchAll(/'([^']+)'/g)].map((c) => c[1])]));
  assert.deepEqual(bySql, Object.fromEntries(IDEAS.filter((i) => i.cities).map((i) => [i.id, i.cities])));
  for (const c of CITIES.filter((x) => x.active)) {
    assert.ok(IDEAS.some((i) => i.cities?.includes(c.name)), `${c.name} has no local idea`);
    assert.ok(ideasFor(c.country, c.name).length >= 20, `${c.name} has ${ideasFor(c.country, c.name).length}`);
  }
  for (const i of IDEAS.filter((x) => x.cities)) {
    assert.equal(i.kind, 'irl', `${i.id} is in person`);
    assert.ok(i.cities!.every((name) => CITIES.find((c) => c.name === name)?.country === 'IN') && i.countries?.join() === 'IN', `${i.id} is in an Indian city`);
  }
  assert.ok(offeredIn('mumbai_sea_wall', 'IN', 'Mumbai'));
  assert.ok(!offeredIn('mumbai_sea_wall', 'IN', 'Pune'));
  assert.ok(!offeredIn('mumbai_sea_wall', 'IN'), 'no city, no city ideas');
  assert.ok(offeredIn('pani_puri_duel', 'IN', 'Pune'), 'country ideas are in every city of the country');
});

test('a city idea is picked only by people who live there; one already saved stays after a move', () => {
  const local = { ...card, ideaIds: ['boba_run', 'meme_duel', 'mumbai_sea_wall'] };
  assert.equal(code(() => checkProfile(local, 'Mumbai')), null);
  assert.equal(code(() => checkProfile(local, 'Pune')), 'PL104');
  assert.equal(code(() => checkProfile(local, 'Pune', { area: '', pronouns: '', ideaIds: ['mumbai_sea_wall'] })), null, 'kept from before');
});
