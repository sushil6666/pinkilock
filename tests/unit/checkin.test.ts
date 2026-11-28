/** Daily relationship check-in (D126). Plain Node: `npm run test:unit`. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHECKIN_NOTE_MAX, checkCheckin, checkinsFrom, todayOf } from '../../src/domain/checkin';
import { CHECKIN_SYSTEM, checkinMessage } from '../../supabase/functions/talk/checkin';

test('a check-in needs a mood from the list and short notes', () => {
  assert.equal(checkCheckin('good', '', ''), '');
  assert.equal(checkCheckin(null, 'x', ''), 'PL237');
  assert.equal(checkCheckin('meh', '', ''), 'PL237');
  assert.equal(checkCheckin('hard', 'x'.repeat(CHECKIN_NOTE_MAX + 1), ''), 'PL238');
});

test('the server answer is read strictly', () => {
  const c = checkinsFrom({ today: '2026-12-01', reminder_hour: 21, entries: [{ day: '2026-12-01', mood: 'hard', good: 'a', bad: 'b', suggestion: null, harm: true }, { day: 'x', mood: 'nope' }] });
  assert.equal(c.reminderHour, 21);
  assert.equal(c.entries.length, 1);
  assert.deepEqual(todayOf(c), { day: '2026-12-01', mood: 'hard', good: 'a', bad: 'b', suggestion: null, harm: true });
  assert.equal(checkinsFrom({ reminder_hour: 3 }).reminderHour, null, 'an hour outside 6 to 10 pm is no reminder');
});

test('Saathi gets the mood and the notes only, clipped', () => {
  const m = checkinMessage('rough', '  We laughed\n\nat dinner ', 'x'.repeat(900));
  assert.match(m, /^Today felt really rough\./);
  assert.match(m, /What was good: We laughed at dinner/);
  assert.ok(m.length < 700, 'each note is at most 500 characters');
  assert.match(checkinMessage('okay', '', ''), /\(nothing written\)/);
});

test('the instructions keep the hand-offs and the limits', () => {
  for (const must of ['[[HELP]]', '14416', '112', '181', 'You are an AI', 'not a therapist', 'Never anything sexual', 'Never encourage tracking'])
    assert.ok(CHECKIN_SYSTEM.includes(must), `the instructions say: ${must}`);
});
