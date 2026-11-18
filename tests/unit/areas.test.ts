/**
 * Areas, pronouns and contact kinds exist twice (SQL and src/domain) and must match; and the app's
 * own checks refuse what the server refuses. Plain Node: `npm run test:unit`.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { AREAS, matchAreas } from '../../src/domain/areas';
import { CONTACT_KINDS, contactKindsFor } from '../../src/domain/contacts';
import { AppError } from '../../src/domain/errors';
import { PRONOUN_OPTIONS, checkContact, checkProfile } from '../../src/domain/profile';

const dir = join(__dirname, '..', '..', 'supabase', 'migrations');
const sql = readdirSync(dir).sort().map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
const block = (head: string) => sql.match(new RegExp(`insert into public\\.${head} values\\n([\\s\\S]*?)\\non conflict`))![1];

test('areas in SQL are AREAS', () => {
  // Every migration's rows, in order.
  const rows = [...sql.matchAll(/insert into public\.areas \(city, name\) values\n([\s\S]*?)\non conflict/g)].flatMap((b) => [...b[1].matchAll(/\('([^']+)', '([^']+)'\)/g)]);
  const bySql: Record<string, string[]> = {};
  for (const [, city, name] of rows) (bySql[city] ??= []).push(name);
  assert.deepEqual(bySql, AREAS);
});

test('pronouns in SQL are PRONOUN_OPTIONS', () => {
  assert.deepEqual([...block('pronoun_options \\(label\\)').matchAll(/\('([^']+)'\)/g)].map((m) => m[1]), PRONOUN_OPTIONS);
});

test('contact kinds in SQL are CONTACT_KINDS', () => {
  const rows = [...block('contact_kinds \\(kind, phone, countries\\)').matchAll(/\('([^']+)', (true|false), (null|array\[[^\]]*\])\)/g)].map((m) => ({
    kind: m[1], phone: m[2] === 'true', countries: m[3] === 'null' ? null : [...m[3].matchAll(/'([A-Z]{2})'/g)].map((c) => c[1]),
  }));
  assert.deepEqual(rows, CONTACT_KINDS);
});

const code = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.code : 'not an AppError';
  }
  return null;
};
const card = { name: 'Riya', age: 24, area: 'Bandra West', pronouns: 'she/her', tagline: '', vibes: [], ideaIds: ['boba_run', 'chai_walk', 'meme_duel'] };

test('the area and pronouns are picked; what was saved before the lists still passes', () => {
  assert.equal(code(() => checkProfile(card)), null);
  assert.equal(code(() => checkProfile({ ...card, area: 'Bandra' })), 'PL095');
  assert.equal(code(() => checkProfile({ ...card, pronouns: 'xe/xem' })), 'PL096');
  assert.equal(code(() => checkProfile({ ...card, area: 'Bandra', pronouns: 'xe/xem' }, 'Mumbai', { area: 'Bandra', pronouns: 'xe/xem' })), null);
  assert.equal(code(() => checkProfile({ ...card, area: 'Anywhere' }, 'Patna', { area: '', pronouns: '', ideaIds: card.ideaIds })), null, 'a city with no list yet takes a typed area');
  assert.equal(code(() => checkProfile({ ...card, area: 'Bandra West' }, 'Delhi NCR')), 'PL095', 'an area from another city');
  assert.deepEqual(matchAreas('Mumbai', 'band'), ['Bandra East', 'Bandra West']);
});

test('contact kinds follow the country', () => {
  assert.ok(contactKindsFor('IN').some((k) => k.kind === 'Telegram'));
  assert.ok(!contactKindsFor('IN').some((k) => k.kind === 'KakaoTalk'));
  assert.equal(code(() => checkContact('KakaoTalk', 'riya', 'IN')), 'PL066');
  assert.equal(code(() => checkContact('KakaoTalk', 'riya', 'KR')), null);
});
