/**
 * Plans across time zones (docs/build-plan.md, WP9): the other clock is named only when it reads
 * differently from mine, and the zone comes from a city, never from where a phone seems to be.
 * Plain Node: `npm run test:unit`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CITIES, zoneOfCity } from '../../src/domain/countries';
import { zoneNote, zonesDiffer } from '../../src/domain/time';
import { setLocale } from '../../src/i18n';

// 18 Nov 2026, 13:30 UTC: 7:00 PM in Mumbai, 1:30 PM in London.
const at = Date.UTC(2026, 10, 18, 13, 30);

test('the same clock, or a second name for the same zone, names nothing', () => {
  setLocale('en', 'en-GB');
  assert.equal(zoneNote(at, 'Asia/Kolkata', { name: 'Ira' }, 'Asia/Kolkata'), null);
  assert.equal(zoneNote(at, 'Asia/Calcutta', { name: 'Ira' }, 'Asia/Kolkata'), null, 'an old alias is the same clock');
  assert.equal(zoneNote(at, undefined, { name: 'Ira' }, 'Europe/London'), null, 'a city we do not know names nothing');
});

test('a call across zones gives their time; a date in person gives the place time', () => {
  setLocale('en', 'en-GB');
  const forIra = zoneNote(at, 'Asia/Kolkata', { name: 'Ira' }, 'Europe/London');
  assert.match(forIra ?? '', /^19:00 .+ for Ira$/);
  const inMumbai = zoneNote(at, zoneOfCity('Mumbai'), { city: 'Mumbai' }, 'Europe/London');
  assert.match(inMumbai ?? '', /^19:00 .+ in Mumbai$/);
  assert.ok(zonesDiffer(at, 'Europe/London', 'Asia/Kolkata'));
  setLocale('en');
});

test('every city has a real zone', () => {
  for (const c of CITIES) assert.doesNotThrow(() => new Intl.DateTimeFormat('en', { timeZone: c.zone }), c.name);
  assert.equal(zoneOfCity('Atlantis'), undefined);
});
