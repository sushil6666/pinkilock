/**
 * Spicy call times (D106). The timer and answer rules exist twice (SQL and src/domain/calls.ts) and
 * must agree: tests/db/call_cases.sql is generated from CALL_CASES and ANSWER_CASES and run through
 * the SQL by tests/db/calls.sql. Regenerate: UPDATE_CASES=1 npm run test:unit
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  ANSWER_CASES, CALL_CASES, CALL_MINUTES, MAX_CALLS, MAX_SLOTS, agreedMinutes, answerVerdict, callVerdict, canMoveFree, checkPicks, firstOverlap,
  slotsOn, timerOpen, togetherMinutes,
} from '../../src/domain/calls';
import { AppError } from '../../src/domain/errors';
import { en } from '../../src/i18n/en';
import { hi } from '../../src/i18n/langs/hi';

const ROOT = join(__dirname, '..', '..');
const q = (s: string | null) => (s === null ? 'null' : `'${s.replace(/'/g, "''")}'`);
const n = (x: number | null) => (x === null ? 'null' : String(x));
const codeOf = (fn: () => unknown): string => {
  try {
    fn();
    return '';
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};
const MIN = 60_000;
const HOUR = 60 * MIN;
const migration = readFileSync(join(ROOT, 'supabase', 'migrations', '20261126000001_spicy_calls.sql'), 'utf8');

test('the timer decides as the shared table says', () => {
  for (const [minutes, together, minsA, minsB, lastA, lastB, outcome, fault] of CALL_CASES) {
    assert.deepEqual(callVerdict({ minutes, together, minsA, minsB, lastA, lastB }), { outcome, fault }, JSON.stringify([minutes, together, minsA, minsB, lastA, lastB]));
  }
});

test('the answers decide as the shared table says', () => {
  for (const [a, b, sa, sb, closed, outcome, fault] of ANSWER_CASES) {
    assert.deepEqual(answerVerdict(a, b, sa, sb, closed), { outcome, fault }, JSON.stringify([a, b, sa, sb, closed]));
  }
});

test('the SQL copy of the shared tables is up to date', () => {
  const file = join(ROOT, 'tests', 'db', 'call_cases.sql');
  const want = [
    '-- Generated from CALL_CASES and ANSWER_CASES in src/domain/calls.ts. Do not edit: UPDATE_CASES=1 npm run test:unit',
    'create temp table call_cases (minutes int, together int, mins_a int, mins_b int, last_a numeric, last_b numeric, outcome text, fault text);',
    'insert into call_cases (minutes, together, mins_a, mins_b, last_a, last_b, outcome, fault) values',
    CALL_CASES.map(([m, t, a, b, la, lb, o, f]) => `  (${m}, ${t}, ${a}, ${b}, ${n(la)}, ${n(lb)}, ${q(o)}, ${q(f)})`).join(',\n') + ';',
    'create temp table answer_cases (a text, b text, serial_a boolean, serial_b boolean, closed boolean, outcome text, fault text);',
    'insert into answer_cases (a, b, serial_a, serial_b, closed, outcome, fault) values',
    ANSWER_CASES.map(([a, b, sa, sb, c, o, f]) => `  (${q(a)}, ${q(b)}, ${sa}, ${sb}, ${c}, ${q(o)}, ${q(f)})`).join(',\n') + ';',
    '',
  ].join('\n');
  if (process.env.UPDATE_CASES) writeFileSync(file, want);
  assert.ok(existsSync(file), 'tests/db/call_cases.sql is missing: UPDATE_CASES=1 npm run test:unit');
  assert.equal(readFileSync(file, 'utf8'), want, 'tests/db/call_cases.sql is stale: UPDATE_CASES=1 npm run test:unit');
});

test('the shorter pick applies', () => {
  assert.equal(agreedMinutes(30, 10), 10);
  assert.equal(agreedMinutes(15, 15), 15);
});

test('picks are checked', () => {
  const now = Date.UTC(2026, 10, 26, 10, 7);
  const ok = Date.UTC(2026, 10, 26, 12, 30);
  assert.deepEqual(checkPicks([ok, ok, ok - 30 * MIN], 15, now), [ok - 30 * MIN, ok]);
  assert.equal(codeOf(() => checkPicks([ok], 20, now)), 'PL147');
  assert.equal(codeOf(() => checkPicks([], 15, now)), 'PL148');
  assert.equal(codeOf(() => checkPicks([ok + 10 * MIN], 15, now)), 'PL148');
  assert.equal(codeOf(() => checkPicks([Date.UTC(2026, 10, 26, 11, 0)], 15, now)), 'PL148');
  assert.equal(codeOf(() => checkPicks([Date.UTC(2026, 11, 4, 12, 0)], 15, now)), 'PL148');
  assert.equal(codeOf(() => checkPicks(Array.from({ length: MAX_SLOTS + 1 }, (_, i) => ok + i * 30 * MIN), 15, now)), 'PL148');
});

test('the call is the first time both picked', () => {
  const now = 0;
  assert.equal(firstOverlap([3 * HOUR, 5 * HOUR, 2 * HOUR], [5 * HOUR, 2 * HOUR], now), 2 * HOUR);
  assert.equal(firstOverlap([3 * HOUR], [4 * HOUR], now), null);
  assert.equal(firstOverlap([30 * MIN, 2 * HOUR], [30 * MIN, 2 * HOUR], now), 2 * HOUR);
});

test('a day offers half-hour times far enough ahead', () => {
  const now = new Date(2026, 10, 26, 21, 10).getTime();
  const today = slotsOn(new Date(now), now);
  assert.equal(new Date(today[0]).getHours(), 22);
  assert.equal(new Date(today[0]).getMinutes(), 30);
  assert.ok(today.every((s) => s % (30 * MIN) === 0));
});

test('minutes together count once each', () => {
  assert.equal(togetherMinutes([1, 2, 3, 4], [3, 4, 4, 5]), 2);
  assert.equal(togetherMinutes([], [1]), 0);
});

test('one free move, an hour or more ahead', () => {
  assert.equal(canMoveFree(0, 2 * HOUR, 0), true);
  assert.equal(canMoveFree(0, HOUR, 0), true);
  assert.equal(canMoveFree(0, HOUR - 1, 0), false);
  assert.equal(canMoveFree(1, 5 * HOUR, 0), false);
});

test('the timer opens five minutes before and runs an hour', () => {
  assert.equal(timerOpen(HOUR, HOUR - 6 * MIN), false);
  assert.equal(timerOpen(HOUR, HOUR - 5 * MIN), true);
  assert.equal(timerOpen(HOUR, 2 * HOUR - 1), true);
  assert.equal(timerOpen(HOUR, 2 * HOUR), false);
});

test('the numbers are the same in SQL', () => {
  assert.ok(migration.includes(`array[${CALL_MINUTES.join(', ')}]`), 'call lengths');
  assert.ok(migration.includes(`>= ${MAX_CALLS}`), 'calls per match');
  assert.ok(migration.includes(`cardinality(v_slots) > ${MAX_SLOTS}`), 'times per person');
});

test('the call text is in English and Hindi', () => {
  const keys = Object.keys(en.calls);
  assert.ok(keys.length > 20);
  for (const k of keys) assert.ok(k in (hi.calls ?? {}), `hi.calls.${k}`);
});

test('in-app calls are voice only: no camera, screen or recording anywhere in the call code (D111)', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
  for (const p of ['src/lib/voice.ts', 'src/lib/voiceSetup.ts', 'src/lib/voiceSetup.native.ts', 'src/components/SpicyCall.tsx', 'supabase/functions/voice/index.ts']) {
    const code = read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    for (const bad of [/setCameraEnabled/, /setScreenShareEnabled/, /createLocalVideoTrack/, /createLocalTracks/, /expo-camera/, /getDisplayMedia/, /video:\s*true/i, /egress/i, /record/i]) {
      assert.ok(!bad.test(code), `${p} must not use ${bad}`);
    }
  }
  const grant = read('supabase/functions/_shared/livekit.ts');
  assert.match(grant, /canPublishSources: \['microphone'\]/, 'the token may publish the microphone only');
  assert.match(grant, /canPublishData: false/, 'and no data channel');
  assert.ok(!/egress|recorder|roomRecord/i.test(grant.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), 'and nothing starts a recording');
});
