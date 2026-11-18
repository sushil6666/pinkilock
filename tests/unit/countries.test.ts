/** The country and city allow-list exists twice (SQL and src/domain/countries.ts) and must match. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { areasIn } from '../../src/domain/areas';
import { CITIES, COUNTRIES, openCities } from '../../src/domain/countries';
import { VENUES } from '../../src/domain/venues';
import { LEGAL_VERSION } from '../../src/legal/drafts';

const sql = readdirSync(join(__dirname, '..', '..', 'supabase', 'migrations')).sort()
  .map((f) => readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', f), 'utf8')).join('\n');

test('countries in SQL are COUNTRIES', () => {
  const block = sql.match(/insert into public\.countries \(code, name, active, emergency, women_helpline\) values\n([\s\S]*?)\non conflict/)![1];
  const rows = [...block.matchAll(/\('([A-Z]{2})', '([^']+)', (true|false), '([^']+)', (null|'[^']+')\)/g)]
    .map((m) => ({ code: m[1], name: m[2], active: m[3] === 'true', emergency: m[4], womenHelpline: m[5] === 'null' ? null : m[5].slice(1, -1) }));
  assert.deepEqual(rows, COUNTRIES);
});

const CITY_ROWS = /insert into public\.cities \(name, country, active(?:, time_zone)?\) values\n([\s\S]*?)\non conflict|delete from public\.cities c where c\.name = '([^']+)'/g;
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

test('cities in SQL are CITIES', () => {
  // Every migration in order: a later row for a city replaces the earlier one, and a delete removes it.
  const rows = new Map<string, { name: string; country: string; active: boolean }>();
  for (const m of sql.matchAll(CITY_ROWS)) {
    if (m[2]) rows.delete(m[2]);
    else for (const r of m[1].matchAll(/\('((?:[^']|'')+)', '([A-Z]{2})', (true|false)(?:, '[^']+')?\)/g)) rows.set(r[1], { name: r[1], country: r[2], active: r[3] === 'true' });
  }
  assert.deepEqual([...rows.values()].sort(byName), CITIES.map(({ name, country, active }) => ({ name, country, active })).sort(byName));
});

test('city time zones in SQL are the zones in CITIES, and real ones', () => {
  // Set by an update (cities from before the column) or in the row itself (cities added since).
  const zones = new Map<string, string>();
  for (const m of sql.matchAll(new RegExp(`${CITY_ROWS.source}|update public\.cities set time_zone = '([^']+)' where name = '([^']+)';`, 'g'))) {
    if (m[2]) zones.delete(m[2]);
    else if (m[3]) zones.set(m[4], m[3]);
    else for (const r of m[1].matchAll(/\('((?:[^']|'')+)', '[A-Z]{2}', (?:true|false), '([^']+)'\)/g)) zones.set(r[1], r[2]);
  }
  assert.deepEqual(Object.fromEntries([...zones].sort()), Object.fromEntries(CITIES.map((c) => [c.name, c.zone]).sort()));
  for (const c of CITIES) assert.doesNotThrow(() => new Intl.DateTimeFormat('en', { timeZone: c.zone }), c.zone);
});

test('every open city has its areas and places to meet', () => {
  for (const c of openCities()) {
    assert.ok(areasIn(c.name).length >= 12, `${c.name} has too few areas`);
    const places = VENUES.filter((v) => v.city === c.name);
    assert.ok(places.length >= 6, `${c.name} has too few places`);
    for (const v of places) assert.ok(areasIn(c.name).includes(v.area), `${v.id} is in an area ${c.name} does not list`);
  }
});

test('the legal version the app shows is the one the server asks consent for', () => {
  assert.match(sql, new RegExp(`'legal_version', '${LEGAL_VERSION}'`));
});
