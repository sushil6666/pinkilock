/** The country and city allow-list exists twice (SQL and src/domain/countries.ts) and must match. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CITIES, COUNTRIES } from '../../src/domain/countries';
import { LEGAL_VERSION } from '../../src/legal/drafts';

const sql = readdirSync(join(__dirname, '..', '..', 'supabase', 'migrations')).sort()
  .map((f) => readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', f), 'utf8')).join('\n');

test('countries in SQL are COUNTRIES', () => {
  const block = sql.match(/insert into public\.countries \(code, name, active, emergency, women_helpline\) values\n([\s\S]*?)\non conflict/)![1];
  const rows = [...block.matchAll(/\('([A-Z]{2})', '([^']+)', (true|false), '([^']+)', (null|'[^']+')\)/g)]
    .map((m) => ({ code: m[1], name: m[2], active: m[3] === 'true', emergency: m[4], womenHelpline: m[5] === 'null' ? null : m[5].slice(1, -1) }));
  assert.deepEqual(rows, COUNTRIES);
});

test('cities in SQL are CITIES', () => {
  const block = sql.match(/insert into public\.cities \(name, country, active\) values\n([\s\S]*?)\non conflict/)![1];
  const rows = [...block.matchAll(/\('([^']+)', '([A-Z]{2})', (true|false)\)/g)].map((m) => ({ name: m[1], country: m[2], active: m[3] === 'true' }));
  assert.deepEqual(rows, CITIES);
});

test('the legal version the app shows is the one the server asks consent for', () => {
  assert.match(sql, new RegExp(`'legal_version', '${LEGAL_VERSION}'`));
});
