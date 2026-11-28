/** Question of the day and tip of the day (D125). Plain Node: `npm run test:unit`. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { ANSWER_MAX, COUPLE_QUESTIONS, RELATIONSHIP_TIPS, checkAnswer, dailyFrom, tipOf } from '../../src/domain/daily';

const sql = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20261127000024_daily_question.sql'), 'utf8');

test('the questions are the same, in the same order, in the app and the database', () => {
  const body = sql.match(/function private\.couple_question_ids\(\)[\s\S]*?array\[([\s\S]*?)\]::text\[\]/);
  assert.ok(body, 'private.couple_question_ids() is in the migration');
  assert.deepEqual([...body![1].matchAll(/'(\w+)'/g)].map((m) => m[1]), [...COUPLE_QUESTIONS]);
  assert.equal(new Set(COUPLE_QUESTIONS).size, COUPLE_QUESTIONS.length, 'no question twice');
});

test('a new tip each day, the same all day, cycling through the list', () => {
  assert.equal(tipOf('2026-12-01'), tipOf('2026-12-01'));
  assert.notEqual(tipOf('2026-12-01'), tipOf('2026-12-02'));
  const month = new Set(Array.from({ length: RELATIONSHIP_TIPS.length }, (_, i) => tipOf(new Date(Date.UTC(2026, 11, 1 + i)).toISOString().slice(0, 10))));
  assert.equal(month.size, RELATIONSHIP_TIPS.length, 'every tip once before any repeats');
});

test('an answer is 1 to 300 characters once trimmed', () => {
  assert.equal(checkAnswer('  Samosa  '), '');
  assert.equal(checkAnswer('   '), 'PL235');
  assert.equal(checkAnswer('x'.repeat(ANSWER_MAX)), '');
  assert.equal(checkAnswer('x'.repeat(ANSWER_MAX + 1)), 'PL235');
});

test('the server answer is read strictly, and theirs never shows before mine', () => {
  const d = dailyFrom({ today: { day: '2026-12-01', question: 'superpower', mine: null, theirs: 'Fly', they_answered: true }, past: [{ day: 'x' }], streak: 2 });
  assert.deepEqual(d.today, { day: '2026-12-01', question: 'superpower', mine: null, theirs: null, theyAnswered: true });
  assert.deepEqual(d.past, []);
  assert.equal(d.streak, 2);
  assert.deepEqual(dailyFrom({ today: { day: '2026-12-01', question: 'not_a_question' } }).today, null);
});
