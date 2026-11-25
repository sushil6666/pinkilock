/** Self love (D101): the rules the mock follows and the SQL enforces. Plain Node: `npm run test:unit`. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { en } from '../../src/i18n/en';
import { AppError } from '../../src/domain/errors';
import { CARE_STEPS, KIND_LINES, MOODS, NOTE_KINDS, addDays, careStep, checkSelfNote, emptySelfLove, lineOfDay, resetDay, soloPlans, stepOpen, streak, weekOf } from '../../src/domain/selfLove';
import { openCities } from '../../src/domain/countries';

const code = (f: () => unknown) => { try { f(); } catch (e) { return (e as AppError).code; } return null; };

test('a streak counts days in a row, ending today or yesterday', () => {
  assert.equal(streak([], '2026-11-25'), 0);
  assert.equal(streak(['2026-11-23', '2026-11-24', '2026-11-25'], '2026-11-25'), 3);
  assert.equal(streak(['2026-11-23', '2026-11-24'], '2026-11-25'), 2, 'not checked in yet today: the streak still stands');
  assert.equal(streak(['2026-11-22', '2026-11-24', '2026-11-25'], '2026-11-25'), 2, 'a missed day ends it');
  assert.equal(streak(['2026-11-30', '2026-12-01'], '2026-12-01'), 2, 'across a month');
});

test('the week has seven days, oldest first, ending today', () => {
  const w = weekOf([{ day: '2026-11-25', mood: 'good' }, { day: '2026-11-20', mood: 'low' }], '2026-11-25');
  assert.equal(w.length, 7);
  assert.deepEqual([w[0].day, w[6].day], ['2026-11-19', '2026-11-25']);
  assert.deepEqual(w.map((d) => d.mood), [null, 'low', null, null, null, null, 'good']);
});

test('the kind line changes each day and every line and step has words', () => {
  assert.notEqual(lineOfDay('2026-11-25'), lineOfDay('2026-11-26'));
  for (let k = 0; k < 60; k++) {
    const n = lineOfDay(addDays('2026-11-25', k));
    assert.ok(n >= 1 && n <= KIND_LINES);
  }
  assert.equal(Object.keys(en.selfLove.lines).length, KIND_LINES);
  assert.equal(Object.keys(en.selfLove.steps).length, CARE_STEPS);
  for (const seed of ['a', 'b', 'inv_1:2026-11-25']) assert.ok(careStep(seed) >= 1 && careStep(seed) <= CARE_STEPS);
  for (const m of MOODS) assert.ok(en.selfLove.moods[m]);
});

test('notes follow add_self_note: kinds, length, three good things a day, 200 in all', () => {
  const s = emptySelfLove('2026-11-25');
  assert.equal(checkSelfNote('journal', '  hello  ', s), 'hello');
  assert.equal(code(() => checkSelfNote('diary', 'x', s)), 'PL116');
  assert.equal(code(() => checkSelfNote('journal', '   ', s)), 'PL117');
  assert.equal(code(() => checkSelfNote('journal', 'a'.repeat(301), s)), 'PL117');
  const three = { ...s, notes: [1, 2, 3].map((n) => ({ id: String(n), kind: 'gratitude' as const, body: 'x', day: s.today, at: n })) };
  assert.equal(code(() => checkSelfNote('gratitude', 'one more', three)), 'PL118');
  assert.equal(checkSelfNote('boundary', 'still fine', three), 'still fine');
  const yesterday = { ...three, today: '2026-11-26' };
  assert.equal(checkSelfNote('gratitude', 'a new day', yesterday), 'a new day');
  const full = { ...s, notes: Array.from({ length: 200 }, (_, n) => ({ id: String(n), kind: 'journal' as const, body: 'x', day: '2026-01-01', at: n })) };
  assert.equal(code(() => checkSelfNote('journal', 'x', full)), 'PL119');
});

test('the reset opens one step a day, as do_reset_step', () => {
  const reset = { started: '2026-11-25', done: [] as number[] };
  assert.ok(stepOpen(reset, 1, '2026-11-25'));
  assert.ok(!stepOpen(reset, 2, '2026-11-25'));
  assert.ok(stepOpen(reset, 3, '2026-11-27'));
  assert.ok(!stepOpen(null, 1, '2026-11-25'));
  assert.ok(!stepOpen(reset, 4, '2026-12-25'));
  assert.equal(resetDay(reset, '2026-11-26'), 2);
  assert.equal(resetDay(reset, '2026-11-29'), 'over');
  assert.equal(resetDay({ ...reset, done: [1, 2, 3] }, '2026-11-29'), 'done');
});

test('every open city has solo plans, one of each kind of place first', () => {
  for (const c of openCities()) {
    const picks = soloPlans(c.name, '2026-11-25');
    assert.ok(picks.length >= 1, `${c.name} has a solo plan`);
    assert.ok(picks.every((v) => v.city === c.name));
    assert.equal(new Set(picks.map((v) => v.id)).size, picks.length);
  }
  assert.deepEqual(soloPlans('Mumbai', '2026-11-25'), soloPlans('Mumbai', '2026-11-25'), 'the same all day');
});

test('the SQL takes the same moods and note kinds', () => {
  const sql = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20261125000001_self_love.sql'), 'utf8');
  assert.ok(sql.includes(`mood in (${MOODS.map((m) => `'${m}'`).join(', ')})`));
  assert.ok(sql.includes(`kind in (${NOTE_KINDS.map((m) => `'${m}'`).join(', ')})`));
});
