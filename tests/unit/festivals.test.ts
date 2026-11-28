/** Festive packs (D128). Plain Node: `npm run test:unit`. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FESTIVALS, FESTIVE_IDEAS, festivalOn, festiveIdeas } from '../../src/domain/festivals';
import { IDEAS } from '../../src/domain/ideas';
import { en } from '../../src/i18n/en';
import { CITIES } from '../../src/domain/countries';

/** Noon in India on a day. */
const at = (day: string) => Date.parse(`${day}T06:30:00Z`);

test('a festival shows only on its days, in India\'s time', () => {
  assert.equal(festivalOn(at('2026-12-17')), null);
  assert.equal(festivalOn(at('2026-12-18'))?.id, 'christmas');
  assert.equal(festivalOn(at('2026-12-26'))?.id, 'christmas');
  assert.equal(festivalOn(at('2026-12-31'))?.id, 'new_year');
  assert.equal(festivalOn(at('2027-01-01'))?.id, 'new_year', 'over the new year');
  assert.equal(festivalOn(at('2027-01-02')), null);
  assert.equal(festivalOn(Date.parse('2026-12-17T19:00:00Z'))?.id, 'christmas', 'half past midnight on the 18th in India');
});

test('the days never overlap', () => {
  const days = Array.from({ length: 366 }, (_, k) => at(new Date(Date.UTC(2028, 0, 1 + k)).toISOString().slice(0, 10)));
  for (const d of days) assert.ok(FESTIVALS.filter((f) => festivalOn(d) === f).length <= 1);
});

test('every pack has real ideas, three in every open city, and words', () => {
  for (const f of FESTIVALS) {
    for (const id of f.ideas) assert.ok(IDEAS.some((i) => i.id === id), `${id} is in the catalogue`);
    for (const c of CITIES) assert.equal(festiveIdeas(f, c.country, c.name).length, FESTIVE_IDEAS, `${f.id} in ${c.name}`);
    const w = en.festivals[f.id];
    assert.ok(w.title && w.body && w.coupleLabel && w.challenge.includes('{name}'));
  }
});
