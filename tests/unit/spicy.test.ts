/**
 * Spicy mode (D103). The username rules exist twice (SQL and src/domain/spicy.ts) and must agree:
 * tests/db/spicy_cases.sql is generated from SPICY_HANDLE_CASES and run through the SQL by
 * tests/db/spicy.sql. Regenerate: UPDATE_CASES=1 npm run test:unit
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { AppError } from '../../src/domain/errors';
import { BOUNDARIES, HANDOFF_RULES, SAFETY_RULES, SPICY_HANDLE_CASES, checkSpicy, hasPhoneNumber, normalizeUsername, telegramLink } from '../../src/domain/spicy';
import { en } from '../../src/i18n/en';
import { hi } from '../../src/i18n/langs/hi';

const ROOT = join(__dirname, '..', '..');
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const codeOf = (fn: () => unknown): string => {
  try {
    return String(fn() ?? '');
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};

test('each username is stored, or refused with its code, as the shared table says', () => {
  assert.ok(SPICY_HANDLE_CASES.length >= 30);
  for (const [app, typed, want] of SPICY_HANDLE_CASES) assert.equal(codeOf(() => normalizeUsername(app, typed)), want, `${app} "${typed}"`);
  // The stored form goes through again unchanged.
  for (const [app, , want] of SPICY_HANDLE_CASES) if (want && !/^PL\d{3}$/.test(want)) assert.equal(normalizeUsername(app, want), want);
});

test('the SQL copy of the username table is up to date', () => {
  const file = join(ROOT, 'tests', 'db', 'spicy_cases.sql');
  const want = [
    '-- Generated from SPICY_HANDLE_CASES in src/domain/spicy.ts. Do not edit: UPDATE_CASES=1 npm run test:unit',
    'create temp table spicy_cases (app text, typed text, want text);',
    'insert into spicy_cases (app, typed, want) values',
    SPICY_HANDLE_CASES.map(([app, typed, w]) => `  (${q(app)}, ${q(typed)}, ${q(w)})`).join(',\n') + ';',
    '',
  ].join('\n');
  if (process.env.UPDATE_CASES) writeFileSync(file, want);
  assert.ok(existsSync(file), 'tests/db/spicy_cases.sql is missing: UPDATE_CASES=1 npm run test:unit');
  assert.equal(readFileSync(file, 'utf8'), want, 'tests/db/spicy_cases.sql is stale: UPDATE_CASES=1 npm run test:unit');
});

test('a phone number never gets through, however it is written', () => {
  for (const n of ['9876543210', '+91 98765 43210', '98765-43210', '(987) 654-3210', '९८७६५४३२१०']) assert.ok(hasPhoneNumber(n), n);
  for (const n of ['riya2001', 'k.123456']) assert.ok(!hasPhoneNumber(n), n);
});

test('turning on checks the yeses, the account, the usernames and the boundaries, in the server\'s order', () => {
  const ok = { adult: true, rules: true, discord: 'Riya.K', telegram: '', signal: '', boundaries: ['slow', 'ask_first'] as const };
  assert.deepEqual(checkSpicy({ ...ok, boundaries: [...ok.boundaries] }, true), { discord: 'riya.k', telegram: null, signal: null, boundaries: ['ask_first', 'slow'] });
  assert.equal(codeOf(() => checkSpicy({ ...ok, adult: false, boundaries: [] }, true)), 'PL127');
  assert.equal(codeOf(() => checkSpicy({ ...ok, rules: false, boundaries: [] }, true)), 'PL127');
  assert.equal(codeOf(() => checkSpicy({ ...ok, boundaries: [] }, false)), 'PL128');
  assert.equal(codeOf(() => checkSpicy({ ...ok, discord: '', boundaries: [] }, true)), 'PL126');
  assert.equal(codeOf(() => checkSpicy({ ...ok, boundaries: ['anything' as never] }, true)), 'PL129');
  assert.deepEqual(checkSpicy({ ...ok, discord: '', signal: 'Riya.01', boundaries: [] }, true), { discord: null, telegram: null, signal: 'riya.01', boundaries: [] });
  assert.equal(telegramLink('riya_k'), 'https://t.me/riya_k');
});

test('every safety rule and boundary has words, in English and Hindi', () => {
  for (let i = 1; i <= SAFETY_RULES; i++) {
    assert.ok((en.spicy.rules as Record<string, string>)[`r${i}`], `rule ${i}`);
    assert.ok((hi.spicy?.rules as Record<string, string> | undefined)?.[`r${i}`], `Hindi rule ${i}`);
  }
  assert.equal(Object.keys(en.spicy.rules).length, SAFETY_RULES);
  for (const r of HANDOFF_RULES) assert.ok(r >= 1 && r <= SAFETY_RULES);
  for (const b of BOUNDARIES) assert.ok(en.spicy.boundaries[b] && hi.spicy?.boundaries?.[b], b);
});

test('the words on screen never say "naughty" or anything explicit (store listing rules)', () => {
  const words = JSON.stringify([en.spicy, hi.spicy]).toLowerCase();
  for (const w of ['naughty', 'nsfw', 'sex', 'nude', 'hookup', 'horny']) assert.ok(!words.includes(w), w);
});
