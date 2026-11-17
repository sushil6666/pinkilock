/** The venue catalogue exists twice (SQL and src/domain/venues.ts) and must match. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLACE_MAX, looksLikeContact } from '../../src/domain/profile';
import { VENUES, venuePlace, venuesFor } from '../../src/domain/venues';

const ROOT = join(__dirname, '..', '..');

test('the venues in SQL are the list in src/domain/venues.ts', () => {
  const dir = join(ROOT, 'supabase', 'migrations');
  const inSql: string[] = [];
  for (const f of readdirSync(dir).sort()) {
    const sql = readFileSync(join(dir, f), 'utf8');
    for (const block of sql.match(/insert into public\.venues \(id, city, area, name, kind\) values\n([\s\S]*?)\non conflict/g) ?? []) {
      for (const m of block.matchAll(/\('((?:[^']|'')*)', '((?:[^']|'')*)', '((?:[^']|'')*)', '((?:[^']|'')*)', '((?:[^']|'')*)'\)/g)) inSql.push(m.slice(1, 6).map((x) => x.replace(/''/g, "'")).join('|'));
    }
  }
  assert.deepEqual(inSql.sort(), VENUES.map((v) => [v.id, v.city, v.area, v.name, v.kind].join('|')).sort());
});

test('every venue fits the place field and passes the contact check', () => {
  assert.equal(new Set(VENUES.map((v) => v.id)).size, VENUES.length, 'ids are unique');
  for (const v of VENUES) {
    assert.ok(venuePlace(v).length <= PLACE_MAX, `${v.id} is too long`);
    assert.equal(looksLikeContact(venuePlace(v)), false, `${v.id} reads like a contact`);
  }
});

test('venues are offered nearest first: their area, then mine, then the rest', () => {
  const list = venuesFor('Mumbai', 'Juhu', 'Bandra East');
  assert.deepEqual(list.slice(0, 2).map((v) => v.area), ['Juhu', 'Juhu']);
  assert.equal(list[2].area, 'Bandra East');
  assert.equal(list[3].area, 'Bandra West', 'Bandra West counts as near Bandra East');
  assert.equal(list.length, VENUES.length);
  assert.deepEqual(venuesFor('Pune', 'Juhu', 'Juhu'), [], 'another city gets none until it has a list');
});
