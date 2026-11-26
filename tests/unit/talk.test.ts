/**
 * Talk mode (D107) and the free first call (D108). The matching, the self-harm check and the
 * payout split exist twice (SQL and src/domain/talk.ts) and must agree: tests/db/talk_cases.sql is
 * generated from MATCH_CASES, HARM_CASES and SPLIT_CASES and run through the SQL by tests/db/talk.sql.
 * Regenerate: UPDATE_CASES=1 npm run test:unit
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { AppError } from '../../src/domain/errors';
import {
  AI_PER_MINUTE, AI_HISTORY, HARM_CASES, HARM_PHRASES, LISTENER_CODE, MATCH_CASES, SPLIT_CASES, aiCharge, aiHistory, callHold, checkAiMessage, checkKyc,
  checkListener, freeReason, mentionsHarm, referralCode, sortListeners, talkMatch, talkSplit,
} from '../../src/domain/talk';
import { en } from '../../src/i18n/en';

const ROOT = join(__dirname, '..', '..');
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const codeOf = (fn: () => unknown): string => {
  try {
    fn();
    return '';
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};
const migration = readFileSync(join(ROOT, 'supabase', 'migrations', '20261126000002_talk.sql'), 'utf8');

test('listeners match as the shared table says', () => {
  for (const [sex, want, lsex, accepts, ok] of MATCH_CASES) assert.equal(talkMatch(sex, want, lsex, accepts), ok, JSON.stringify([sex, want, lsex, accepts]));
});

test('the self-harm check reads as the shared table says', () => {
  for (const [text, harm] of HARM_CASES) assert.equal(mentionsHarm(text), harm, text);
});

test('a call splits as the shared table says', () => {
  for (const [minutes, gross, host, pinkilock, gst, tds, payout] of SPLIT_CASES) {
    assert.deepEqual(talkSplit(minutes), { gross, host, pinkilock, gst, tds, payout }, String(minutes));
    assert.equal(host + pinkilock, gross);
    assert.ok(host * 100 <= gross * 60 && host * 100 > gross * 60 - 100, '60% to the listener');
  }
});

test('the SQL word list is the same as HARM_PHRASES', () => {
  const block = migration.match(/function private\.mentions_harm[\s\S]*?unnest\(array\[([\s\S]*?)\]\)/);
  assert.ok(block, 'private.mentions_harm has its list');
  const sql = [...block[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
  assert.deepEqual(sql, [...HARM_PHRASES]);
});

test('the SQL copy of the shared tables is up to date', () => {
  const file = join(ROOT, 'tests', 'db', 'talk_cases.sql');
  const want = [
    '-- Generated from MATCH_CASES, HARM_CASES and SPLIT_CASES in src/domain/talk.ts. Do not edit: UPDATE_CASES=1 npm run test:unit',
    'create temp table match_cases (caller_sex text, want text, listener_sex text, accepts text, ok boolean);',
    'insert into match_cases (caller_sex, want, listener_sex, accepts, ok) values',
    MATCH_CASES.map(([a, b, c, d, ok]) => `  (${q(a)}, ${q(b)}, ${q(c)}, ${q(d)}, ${ok})`).join(',\n') + ';',
    'create temp table harm_cases (body text, harm boolean);',
    'insert into harm_cases (body, harm) values',
    HARM_CASES.map(([text, harm]) => `  (${q(text)}, ${harm})`).join(',\n') + ';',
    'create temp table split_cases (minutes int, gross int, host int, pinkilock int, gst int, tds int, payout int);',
    'insert into split_cases (minutes, gross, host, pinkilock, gst, tds, payout) values',
    SPLIT_CASES.map((r) => `  (${r.join(', ')})`).join(',\n') + ';',
    '',
  ].join('\n');
  if (process.env.UPDATE_CASES) writeFileSync(file, want);
  assert.ok(existsSync(file), 'tests/db/talk_cases.sql is missing: UPDATE_CASES=1 npm run test:unit');
  assert.equal(readFileSync(file, 'utf8'), want, 'tests/db/talk_cases.sql is stale: UPDATE_CASES=1 npm run test:unit');
});

test('an AI message costs a minute once, and nothing with a pass or after a mention', () => {
  const now = 1_000_000;
  assert.equal(aiCharge({ passUntil: null, harm: false, minutePaid: false }, now), AI_PER_MINUTE);
  assert.equal(aiCharge({ passUntil: null, harm: false, minutePaid: true }, now), 0);
  assert.equal(aiCharge({ passUntil: now + 1, harm: false, minutePaid: false }, now), 0);
  assert.equal(aiCharge({ passUntil: now - 1, harm: false, minutePaid: false }, now), AI_PER_MINUTE);
  assert.equal(aiCharge({ passUntil: null, harm: true, minutePaid: false }, now), 0);
  assert.equal(codeOf(() => checkAiMessage('   ')), 'PL158');
  assert.equal(codeOf(() => checkAiMessage('x'.repeat(801))), 'PL158');
  assert.equal(checkAiMessage('  hi  '), 'hi');
  const long = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? ('ai' as const) : ('me' as const), text: `m${i}` }));
  assert.equal(aiHistory(long).length, AI_HISTORY);
  assert.equal(aiHistory(long)[AI_HISTORY - 1].text, 'm39');
});

test('a call holds bought credits for its length; a free one holds none', () => {
  assert.equal(callHold(10, false), 100);
  assert.equal(callHold(30, false), 300);
  assert.equal(callHold(15, true), 0);
  assert.equal(codeOf(() => callHold(15, false)), 'PL156');
});

test('the free call opens by a verified friend or a finished profile, never anything else', () => {
  const none = { face: false, handle: false, plans: false };
  assert.equal(freeReason(none, 0), null);
  assert.equal(freeReason({ face: true, handle: true, plans: false }, 0), null);
  assert.equal(freeReason({ face: true, handle: true, plans: true }, 0), 'profile');
  assert.equal(freeReason(none, 1), 'referral');
  assert.equal(referralCode(' ab-cd 2345 '), 'ABCD2345');
});

test('a listener applies with a first name, 1 to 4 topics and the whole code', () => {
  const ok = { firstName: ' Asha ', sex: 'woman' as const, accepts: 'anyone' as const, topics: ['lonely' as const], code: true };
  assert.equal(checkListener(ok).firstName, 'Asha');
  assert.equal(codeOf(() => checkListener({ ...ok, firstName: 'Asha Rao' })), 'PL160');
  assert.equal(codeOf(() => checkListener({ ...ok, firstName: '@asha' })), 'PL160');
  assert.equal(codeOf(() => checkListener({ ...ok, topics: [] })), 'PL161');
  assert.equal(codeOf(() => checkListener({ ...ok, topics: ['lonely', 'stress', 'work', 'exams', 'family'] })), 'PL161');
  assert.equal(codeOf(() => checkListener({ ...ok, code: false })), 'PL162');
  assert.deepEqual(checkKyc({ pan: 'abcde1234f', account: '1234 5678 9012', ifsc: 'hdfc0001234', holder: 'Asha Rao' }),
    { pan: 'ABCDE1234F', account: '123456789012', ifsc: 'HDFC0001234', holder: 'Asha Rao' });
  assert.equal(codeOf(() => checkKyc({ pan: 'ABCDE1234', account: '123456789012', ifsc: 'HDFC0001234', holder: 'Asha Rao' })), 'PL164');
  assert.equal(codeOf(() => checkKyc({ pan: 'ABCDE1234F', account: '12', ifsc: 'HDFC0001234', holder: 'Asha Rao' })), 'PL164');
});

test('listeners who cover my topics come first', () => {
  const list = [
    { id: 'a', firstName: 'Asha', sex: 'woman' as const, topics: ['work' as const], calls: 9 },
    { id: 'b', firstName: 'Bina', sex: 'woman' as const, topics: ['lonely' as const, 'breakup' as const], calls: 1 },
  ];
  assert.deepEqual(sortListeners(list, ['breakup']).map((l) => l.id), ['b', 'a']);
  assert.deepEqual(sortListeners(list, []).map((l) => l.id), ['a', 'b']);
});

test('Talk mode never touches Spicy mode', () => {
  const files = [
    join(ROOT, 'src', 'domain', 'talk.ts'),
    ...readdirSync(join(ROOT, 'app', 'talk')).map((f) => join(ROOT, 'app', 'talk', f)),
    ...readdirSync(join(ROOT, 'src', 'components')).filter((f) => f.startsWith('Talk')).map((f) => join(ROOT, 'src', 'components', f)),
  ];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/from ['"][^'"]*(spicy|Spicy|calls)['"]/.test(src), `${f} imports from Spicy mode`);
    assert.ok(!/router\.push\(['"`]\/spicy/.test(src), `${f} links to Spicy mode`);
  }
  // In SQL, no Talk function reads a Spicy table.
  assert.ok(!/private\.spicy/.test(migration), 'the Talk migration reads no Spicy table');
  assert.ok(!/spicy/i.test(JSON.stringify(en.talk)), 'no word about Spicy in Talk mode');
});

test('the AI is always called AI on screen, and the code is spelled out', () => {
  assert.match(en.talk.aiTitle, /\bAI\b/);
  assert.match(en.talk.aiLabel, /\bAI\b/);
  assert.match(en.talk.aiNotPerson, /\bAI\b/);
  for (const rule of LISTENER_CODE) assert.ok(en.talk.code[rule], `the listener code has words for ${rule}`);
});
