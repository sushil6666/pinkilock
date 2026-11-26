/**
 * Spicy terms and quiz (D107). The answer key and the marking exist twice (SQL and
 * src/domain/spicyQuiz.ts) and must agree: tests/db/spicy_quiz_cases.sql is generated from
 * QUIZ_CASES and run through pass_spicy_quiz by tests/db/spicy_quiz.sql.
 * Regenerate: UPDATE_CASES=1 npm run test:unit
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { QUIZ_CASES, QUIZ_OPTIONS, SPICY_QUIZ, SPICY_TERMS, SPICY_TERMS_VERSION, checkQuiz, quizCaseResult, shuffled, spicyConsentVersion } from '../../src/domain/spicyQuiz';
import { en } from '../../src/i18n/en';
import { hi } from '../../src/i18n/langs/hi';

const ROOT = join(__dirname, '..', '..');
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const arr = (list: readonly string[]) => `array[${list.map(q).join(', ')}]::text[]`;

test('each quiz case is marked, or refused with its code, as the shared table says', () => {
  for (const [version, agree, answers, want] of QUIZ_CASES) assert.equal(quizCaseResult(version, agree, answers), want, JSON.stringify([version, agree, answers]));
  assert.ok(QUIZ_CASES.some(([, , , w]) => w === 'pass'));
  // Every question is missed alone in some case, so each line of the key is checked on both sides.
  for (const x of SPICY_QUIZ) assert.ok(QUIZ_CASES.some(([, , , w]) => w === x.id), x.id);
});

test('the SQL copy of the quiz table is up to date', () => {
  const file = join(ROOT, 'tests', 'db', 'spicy_quiz_cases.sql');
  const want = [
    '-- Generated from SPICY_QUIZ and QUIZ_CASES in src/domain/spicyQuiz.ts. Do not edit: UPDATE_CASES=1 npm run test:unit',
    'create temp table spicy_quiz (version int, ids text[], key text[]);',
    `insert into spicy_quiz values (${SPICY_TERMS_VERSION}, ${arr(SPICY_QUIZ.map((x) => x.id))}, ${arr(SPICY_QUIZ.map((x) => x.right))});`,
    'create temp table spicy_quiz_cases (version int, agree boolean, answers text[], want text);',
    'insert into spicy_quiz_cases (version, agree, answers, want) values',
    QUIZ_CASES.map(([v, a, answers, w]) => `  (${v}, ${a}, ${arr(answers)}, ${q(w)})`).join(',\n') + ';',
    '',
  ].join('\n');
  if (process.env.UPDATE_CASES) writeFileSync(file, want);
  assert.ok(existsSync(file), 'tests/db/spicy_quiz_cases.sql is missing: UPDATE_CASES=1 npm run test:unit');
  assert.equal(readFileSync(file, 'utf8'), want, 'tests/db/spicy_quiz_cases.sql is stale: UPDATE_CASES=1 npm run test:unit');
});

test('the newest migration that sets the terms version agrees with SPICY_TERMS_VERSION', () => {
  const dir = join(ROOT, 'supabase', 'migrations');
  let version: number | null = null;
  let key: string | null = null;
  for (const f of readdirSync(dir).sort()) {
    const sql = readFileSync(join(dir, f), 'utf8');
    const v = sql.match(/function private\.spicy_terms_version\(\)[\s\S]*?\$\$ select (\d+) \$\$/);
    if (v) version = Number(v[1]);
    const k = sql.match(/function private\.spicy_quiz_key\(\)[\s\S]*?\$\$ select array\[([^\]]*)\] \$\$/);
    if (k) key = k[1];
  }
  assert.equal(version, SPICY_TERMS_VERSION);
  assert.equal(key, SPICY_QUIZ.map((x) => `'${x.right}'`).join(', '));
  assert.equal(spicyConsentVersion(), `spicy-${SPICY_TERMS_VERSION}`);
});

test('a pass needs every answer right, and says nothing is wrong', () => {
  assert.deepEqual(checkQuiz(SPICY_TERMS_VERSION, true, SPICY_QUIZ.map((x) => x.right)), { passed: true, wrong: [] });
  assert.equal(SPICY_QUIZ.length, 5);
});

test('each try shows every option once, in an order that changes between tries', () => {
  const orders = new Set<string>();
  for (let seed = 0; seed < 40; seed++) {
    for (let i = 0; i < SPICY_QUIZ.length; i++) {
      const list = shuffled(seed, i);
      assert.deepEqual([...list].sort(), [...QUIZ_OPTIONS]);
      orders.add(list.join(''));
    }
  }
  assert.ok(orders.size >= 4, 'the options are not always in the same order');
});

test('every term section and question has words, in English and Hindi', () => {
  for (const k of SPICY_TERMS) {
    assert.ok(en.spicyQuiz.terms[k].title && en.spicyQuiz.terms[k].body, k);
    assert.ok(hi.spicyQuiz?.terms?.[k]?.title && hi.spicyQuiz?.terms?.[k]?.body, `Hindi ${k}`);
  }
  assert.equal(Object.keys(en.spicyQuiz.terms).length, SPICY_TERMS.length);
  for (const x of SPICY_QUIZ) {
    for (const part of ['ask', 'a', 'b', 'c', 'why'] as const) {
      assert.ok(en.spicyQuiz.q[x.id][part], `${x.id}.${part}`);
      assert.ok(hi.spicyQuiz?.q?.[x.id]?.[part], `Hindi ${x.id}.${part}`);
    }
  }
  assert.equal(Object.keys(en.spicyQuiz.q).length, SPICY_QUIZ.length);
});

test('the terms say what Sushil asked for: phone, face, camera, photos, money, evidence, where to report, consent, no-shows', () => {
  const words = JSON.stringify(en.spicyQuiz.terms);
  for (const w of ['phone number', 'full face', 'camera', 'audio only', 'never recorded', 'intimate photos', 'Do not pay', 'screenshots', '1930', 'cybercrime.gov.in', 'StopNCII.org', 'Stop means stop', 'I felt unsafe', 'missed call']) assert.ok(words.includes(w), w);
});

test('the words never say anything explicit (store listing rules)', () => {
  const words = JSON.stringify([en.spicyQuiz, hi.spicyQuiz]).toLowerCase();
  for (const w of ['naughty', 'nsfw', 'sex', 'nude', 'hookup', 'horny']) assert.ok(!words.includes(w), w);
});
