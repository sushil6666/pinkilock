/** Expert tips (D127). Plain Node: `npm run test:unit`. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { EXPERT_KINDS, EXPERT_RULES, EXPERT_TOPICS, GENERAL_TIPS, REPORT_REASONS, WATCH_OUT, applicationFrom, checkApply, expertTipsFrom, type ExpertApply } from '../../src/domain/experts';
import { en } from '../../src/i18n/en';

const ok: ExpertApply = { name: 'Asha Rao', kind: 'therapist', credential: 'RCI A12345', city: 'Pune', contact: 'asha@example.com', note: '', agree: true };
const sql = readFileSync(new URL('../../supabase/migrations/20261127000026_experts.sql', import.meta.url), 'utf8');

test('the form asks for the rules first, then every field', () => {
  assert.equal(checkApply(ok), '');
  assert.equal(checkApply({ ...ok, agree: false }), 'PL244');
  assert.equal(checkApply({ ...ok, kind: null }), 'PL245');
  assert.equal(checkApply({ ...ok, credential: ' ' }), 'PL245');
  assert.equal(checkApply({ ...ok, contact: 'abc' }), 'PL245');
  assert.equal(checkApply({ ...ok, note: 'x'.repeat(601) }), 'PL245');
});

test('the server answer is read strictly', () => {
  const tips = expertTipsFrom([
    { id: 1, topic: 'conflict', title: 'T', body: 'B', expert: { id: 'e', name: 'Asha', kind: 'therapist', credential: 'RCI', city: null, languages: ['en', 4], bio: '' } },
    { id: 2, topic: 'astrology', title: 'T', body: 'B', expert: { id: 'e', name: 'Asha', kind: 'therapist', credential: 'RCI' } },
    { id: 3, topic: 'dating', title: 'T', body: 'B', expert: { id: 'e', name: 'Asha', kind: 'guru', credential: 'RCI' } },
    { id: 4, topic: 'dating', title: 'T', body: 'B', expert: { id: 'e', name: 'Asha', kind: 'coach', credential: '' } },
  ]);
  assert.equal(tips.length, 1, 'an unknown topic or kind, or no credential, is never shown');
  assert.deepEqual(tips[0].expert.languages, ['en']);
  assert.equal(applicationFrom(null), null);
  assert.deepEqual(applicationFrom({ kind: 'coach', status: 'odd' }), { kind: 'coach', status: 'new' });
});

test('the app and the SQL list the same topics, kinds and reasons', () => {
  for (const list of [EXPERT_TOPICS, EXPERT_KINDS, REPORT_REASONS])
    assert.ok(sql.includes(`in (${list.map((x) => `'${x}'`).join(', ')})`), `the SQL checks ${list.join(', ')}`);
});

test('every topic, tip, kind, rule and warning has words', () => {
  const e = en.experts;
  for (const k of EXPERT_TOPICS) {
    assert.ok(e.topics[k]);
    for (const g of GENERAL_TIPS[k]) assert.ok(e.tipTitles[g] && e.tips[g], g);
  }
  for (const k of EXPERT_KINDS) assert.ok(e.kinds[k] && e.kindsBody[k]);
  for (const k of REPORT_REASONS) assert.ok(e.reasons[k]);
  for (const k of EXPERT_RULES) assert.ok(e.rules[k]);
  for (const k of WATCH_OUT) assert.ok(e.watch[k]);
});

test('the rules keep the warning signs (D127)', () => {
  const words = JSON.stringify(en.experts.rules) + JSON.stringify(en.experts.watch);
  for (const must of ['guaranteed soulmate', 'manipulation', 'mystical cures', 'Nothing sexual', 'every faith'])
    assert.ok(words.includes(must), `the rules say: ${must}`);
});
