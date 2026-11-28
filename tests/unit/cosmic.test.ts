/**
 * Cosmic match (D129). The eight kootas exist twice (SQL private.guna and src/domain/cosmic.ts) and
 * must agree: tests/db/guna_cases.sql is generated from GUNA_CASES here and run through the SQL by
 * tests/db/cosmic.sql. Regenerate: UPDATE_CASES=1 npm run test:unit
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  GUNA_MAX, KOOTAS, KOOTA_MAX, NAKSHATRAS, RASHIS, ageOn, checkBirth, cosmicFrom, gunaScore, kootas, lifePath, moonAtBirth, moonTropical,
  nakshatraOf, rashiOf, scoreBand,
} from '../../src/domain/cosmic';
import { en } from '../../src/i18n/en';

const ROOT = join(__dirname, '..', '..');
/** Every pair of nakshatra middles, and the halves of Dhanu and Makara (Vashya changes there). */
const MOONS = [...NAKSHATRAS.map((_, i) => Math.round((i + 0.5) * (360 / 27) * 100) / 100), 245, 262.5, 275, 292.5];
const GUNA_CASES: [number, number, number][] = MOONS.flatMap((a) => MOONS.map((b): [number, number, number] => [a, b, gunaScore(kootas(a, b))]));

test('the Moon is where the almanac puts it', () => {
  // Meeus, Astronomical Algorithms, example 47.a: 1992 April 12, 0h TD: 133.162655 degrees.
  assert.ok(Math.abs(moonTropical(Date.UTC(1992, 3, 12) - 59_000) - 133.162655) < 0.05);
  const m = moonAtBirth('2000-01-01', '17:30');
  assert.ok(m >= 0 && m < 360);
  assert.equal(nakshatraOf(0), 0);
  assert.equal(nakshatraOf(359.99), 26);
  assert.equal(rashiOf(359.99), 11);
});

test('the score is out of 36, the same whichever chart is first', () => {
  assert.equal(KOOTAS.reduce((s, k) => s + KOOTA_MAX[k], 0), GUNA_MAX);
  for (const [a, b, s] of GUNA_CASES) {
    const k = kootas(a, b);
    for (const x of KOOTAS) assert.ok(k[x] >= 0 && k[x] <= KOOTA_MAX[x], `${x} in range for ${a}, ${b}`);
    assert.equal(s, gunaScore(kootas(b, a)), `${a} and ${b}`);
  }
  // Same nakshatra: same Nadi (0) and same sign (Bhakoot 7).
  assert.equal(kootas(10, 11).nadi, 0);
  assert.equal(kootas(10, 11).bhakoot, 7);
  assert.equal(scoreBand(30), 'great');
  assert.equal(scoreBand(10), 'growing');
});

test('the life path number', () => {
  assert.equal(lifePath('1998-05-14'), 1);
  assert.equal(lifePath('1999-12-31'), 8);
  for (let d = 1; d <= 28; d++) assert.ok(lifePath(`2001-02-${String(d).padStart(2, '0')}`) >= 1);
});

test('the birth details are checked as on the server', () => {
  assert.equal(checkBirth('1998-05-14', null, 28, '2026-11-27'), '');
  assert.equal(checkBirth('1998-05-14', '08:30', 27, '2026-11-27'), '');
  assert.equal(checkBirth('1998-02-30', null, 28, '2026-11-27'), 'PL246');
  assert.equal(checkBirth('2010-01-01', null, 18, '2026-11-27'), 'PL246', 'under 18');
  assert.equal(checkBirth('1990-05-14', null, 28, '2026-11-27'), 'PL247', 'not the age on the card');
  assert.equal(checkBirth('1998-05-14', '8:30', 28, '2026-11-27'), 'PL248');
  assert.equal(ageOn('1998-11-28', '2026-11-27'), 27);
});

test('the server answer is read strictly', () => {
  const c = cosmicFrom({ me: { on: true, birth_date: '1998-05-14', birth_time: null, moon: 237.95 },
    pairs: [{ profile_id: 'p1', score: 30.5, kootas: Object.fromEntries(KOOTAS.map((k) => [k, 1])), my_number: 1, their_number: 7 }, { profile_id: 'p2', score: null, kootas: null }, { score: 3 }] });
  assert.equal(c.pairs.length, 2);
  assert.equal(c.pairs[1].score, null, 'no score until both are on');
  assert.equal(cosmicFrom({ me: { on: false, birth_date: '1998-05-14' } }).me.birthDate, null);
});

test('every star, sign, koota, number and band has words, and none is a caste', () => {
  const w = en.cosmic;
  for (const k of NAKSHATRAS) assert.ok(w.stars[k]);
  for (const k of RASHIS) assert.ok(w.signs[k]);
  for (const k of KOOTAS) assert.ok(w.kootas[k]);
  for (let n = 1; n <= 9; n++) assert.ok(w.numbers[`n${n}` as keyof typeof w.numbers]);
  const values = (o: unknown): string[] => (typeof o === 'string' ? [o] : Object.values(o as object).flatMap(values));
  const all = values(w).join(' ').toLowerCase();
  for (const no of ['brahmin', 'kshatriya', 'vaishya', 'shudra', 'varna', 'dosha', 'manglik', 'rakshasa'])
    assert.ok(!all.includes(no), `the words never say "${no}"`);
});

test('the SQL copy of the shared cases is up to date', () => {
  const file = join(ROOT, 'tests', 'db', 'guna_cases.sql');
  const want = [
    '-- Generated from GUNA_CASES in tests/unit/cosmic.test.ts. Do not edit: UPDATE_CASES=1 npm run test:unit',
    'create temp table guna_cases (a numeric, b numeric, score numeric);',
    'insert into guna_cases (a, b, score) values',
    GUNA_CASES.map(([a, b, s]) => `  (${a}, ${b}, ${s})`).join(',\n') + ';',
    'create temp table life_path_cases (d date, n int);',
    'insert into life_path_cases (d, n) values',
    ['1998-05-14', '1999-12-31', '2000-01-01', '1987-09-29', '2005-11-11'].map((d) => `  ('${d}', ${lifePath(d)})`).join(',\n') + ';',
    '',
  ].join('\n');
  if (process.env.UPDATE_CASES) writeFileSync(file, want);
  assert.ok(existsSync(file), 'tests/db/guna_cases.sql is missing: UPDATE_CASES=1 npm run test:unit');
  assert.equal(readFileSync(file, 'utf8'), want, 'tests/db/guna_cases.sql is stale: UPDATE_CASES=1 npm run test:unit');
});
