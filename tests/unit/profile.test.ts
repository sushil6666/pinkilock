/**
 * The profile rules exist twice (SQL and src/domain/profile.ts) and must agree. The shared table
 * of lines lives in src/domain/profile.ts; tests/db/contact_cases.sql is generated from it and
 * run through the SQL by tests/db/profile_rules.sql. Regenerate: UPDATE_CASES=1 npm run test:unit
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { AppError } from '../../src/domain/errors';
import { IDEAS, VIBES, noteStarters, openerOf, NOTE_TONES, TAGLINE_PROMPTS } from '../../src/domain/ideas';
import { CONTACT_CASES, checkAsk, checkProfile, looksLikeContact, nameOk } from '../../src/domain/profile';

const ROOT = join(__dirname, '..', '..');
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

test('the contact check gives the expected answer for every shared line', () => {
  assert.ok(CONTACT_CASES.length >= 40);
  for (const [line, refused] of CONTACT_CASES) assert.equal(looksLikeContact(line), refused, `"${line}" should ${refused ? '' : 'not '}be refused`);
});

test('the SQL copy of the shared lines is up to date', () => {
  const file = join(ROOT, 'tests', 'db', 'contact_cases.sql');
  const want = [
    '-- Generated from CONTACT_CASES in src/domain/profile.ts. Do not edit: UPDATE_CASES=1 npm run test:unit',
    'create temp table contact_cases (line text, refused boolean);',
    'insert into contact_cases (line, refused) values',
    CONTACT_CASES.map(([line, refused]) => `  (${q(line)}, ${refused})`).join(',\n') + ';',
    '',
  ].join('\n');
  if (process.env.UPDATE_CASES) writeFileSync(file, want);
  assert.ok(existsSync(file), 'tests/db/contact_cases.sql is missing: UPDATE_CASES=1 npm run test:unit');
  assert.equal(readFileSync(file, 'utf8'), want, 'tests/db/contact_cases.sql is stale: UPDATE_CASES=1 npm run test:unit');
});

test('nothing the app itself offers is refused as a contact', () => {
  const lines = [
    ...NOTE_TONES.flatMap((t) => (['irl', 'video', 'game'] as const).flatMap((k) => noteStarters(k, t.id))),
    ...IDEAS.flatMap((i) => [i.title, i.blurb, openerOf(i.id)]),
    ...VIBES,
    ...TAGLINE_PROMPTS.map((p) => `${p}being early`),
    'Pinkilock video room', 'Voice chat in the app',
  ];
  for (const line of lines) assert.equal(looksLikeContact(line), false, `the app's own line is refused: "${line}"`);
});

test('the tag catalogue in SQL is the list in src/domain/ideas.ts', () => {
  const dir = join(ROOT, 'supabase', 'migrations');
  const inSql = new Set<string>();
  for (const f of readdirSync(dir).sort()) {
    const sql = readFileSync(join(dir, f), 'utf8');
    const block = sql.match(/insert into public\.vibes \(label\) values\n([\s\S]*?)\non conflict/g) ?? [];
    for (const b of block) for (const m of b.matchAll(/\('((?:[^']|'')*)'\)/g)) inSql.add(m[1].replace(/''/g, "'"));
  }
  assert.deepEqual([...inSql].sort(), [...VIBES].sort());
});

test('names: one word of letters, 2 to 16', () => {
  for (const ok of ['Riya', 'Al', 'Zoë', 'आरव', 'Abcdefghijklmnop']) assert.ok(nameOk(ok), ok);
  for (const bad of ['R', 'Abcdefghijklmnopq', 'Riya99', 'riya.frames', 'riya_k', 'Riya K', '@riya', 'Anne-Marie']) assert.ok(!nameOk(bad), bad);
});

test('a profile is refused with the code the server would use', () => {
  const ok = { name: 'Riya', age: 24, area: 'Bandra', pronouns: '', tagline: '', vibes: ['foodie'], ideaIds: ['boba_run', 'chai_walk', 'meme_duel'] };
  const code = (p: Partial<typeof ok>) => {
    try { checkProfile({ ...ok, ...p }); return null; } catch (e) { return (e as AppError).code; }
  };
  assert.equal(code({}), null);
  assert.equal(code({ name: 'riya.frames' }), 'PL060');
  assert.equal(code({ age: 17 }), 'PL061');
  assert.equal(code({ vibes: ['any text'] }), 'PL062');
  assert.equal(code({ vibes: ['foodie', 'gamer', 'yapper', 'tease'] }), 'PL062');
  assert.equal(code({ ideaIds: ['boba_run', 'chai_walk'] }), 'PL063');
  assert.equal(code({ ideaIds: ['boba_run', 'chai_walk', 'nope'] }), 'PL063');
  assert.equal(code({ area: 'a'.repeat(41) }), 'PL064');
  assert.equal(code({ tagline: 'dm me @riya' }), 'PL065');
  assert.throws(() => checkAsk('call me 98765 43210', ''), (e) => (e as AppError).code === 'PL065');
  assert.throws(() => checkAsk('', 'p'.repeat(61)), (e) => (e as AppError).code === 'PL064');
  checkAsk('low stakes, high snacks.', 'Boba counter, Linking Road');
});
