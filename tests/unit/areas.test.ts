/**
 * Areas, pronouns and contact kinds exist twice (SQL and src/domain) and must match; and the app's
 * own checks refuse what the server refuses. Plain Node: `npm run test:unit`.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { AREAS, closeAreas, matchAreas } from '../../src/domain/areas';
import { AREA_CENTRES } from '../../src/domain/areaCentres';
import { km, nearestAreas, nearestCity } from '../../src/domain/nearby';
import { CONTACT_KINDS, contactKindsFor } from '../../src/domain/contacts';
import { AppError } from '../../src/domain/errors';
import { AREA_CASES, PRONOUN_OPTIONS, checkContact, checkProfile, customAreaOk, looksLikeContact } from '../../src/domain/profile';

const dir = join(__dirname, '..', '..', 'supabase', 'migrations');
const sql = readdirSync(dir).sort().map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
const block = (head: string) => sql.match(new RegExp(`insert into public\\.${head} values\\n([\\s\\S]*?)\\non conflict`))![1];

test('areas in SQL are AREAS', () => {
  // Every migration's rows, in order.
  const rows = [...sql.matchAll(/insert into public\.areas \(city, name\) values\n([\s\S]*?)\non conflict/g)].flatMap((b) => [...b[1].matchAll(/\('([^']+)', '([^']+)'\)/g)]);
  const bySql: Record<string, string[]> = {};
  for (const [, city, name] of rows) (bySql[city] ??= []).push(name);
  const sorted = (r: Record<string, string[]>) => Object.fromEntries(Object.entries(r).map(([c, l]) => [c, [...l].sort()]));
  assert.deepEqual(sorted(bySql), sorted(AREAS));
  for (const [c, list] of Object.entries(AREAS)) assert.equal(new Set(list).size, list.length, `${c} lists an area twice`);
});

test('every area has a rough centre near its city, for "Use my location"', () => {
  for (const [c, list] of Object.entries(AREAS)) {
    assert.deepEqual(Object.keys(AREA_CENTRES[c] ?? {}).sort(), [...list].sort(), `${c}: AREAS and AREA_CENTRES differ`);
    const pts = Object.values(AREA_CENTRES[c]);
    const mid = { lat: pts.reduce((s, p) => s + p[0], 0) / pts.length, lng: pts.reduce((s, p) => s + p[1], 0) / pts.length };
    for (const [a, [lat, lng]] of Object.entries(AREA_CENTRES[c])) assert.ok(km(mid, { lat, lng }) < (c === 'Goa' ? 90 : 50), `${a} is too far from the middle of ${c}`);
  }
});

test('my location picks the nearest city and areas, and nothing far away', () => {
  assert.equal(nearestCity({ lat: 20.283, lng: 85.806 }), 'Bhubaneswar');
  assert.equal(nearestAreas('Bhubaneswar', { lat: 20.283, lng: 85.806 })[0], 'Baramunda');
  assert.equal(nearestCity({ lat: 19.061, lng: 72.829 }), 'Mumbai');
  assert.equal(nearestAreas('Mumbai', { lat: 19.061, lng: 72.829 })[0], 'Bandra West');
  assert.equal(nearestCity({ lat: 34.152, lng: 77.577 }), null, 'Leh is not open');
  assert.equal(nearestCity({ lat: 51.5, lng: -0.12 }), null, 'London is not open');
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
  assert.equal(code(() => checkProfile({ ...card, area: 'Bandra' })), null, 'a place name of my own (D087)');
  assert.equal(code(() => checkProfile({ ...card, area: 'Bandra!!' })), 'PL106');
  assert.equal(code(() => checkProfile({ ...card, pronouns: 'xe/xem' })), 'PL096');
  assert.equal(code(() => checkProfile({ ...card, area: 'Bandra', pronouns: 'xe/xem' }, 'Mumbai', { area: 'Bandra', pronouns: 'xe/xem' })), null);
  assert.equal(code(() => checkProfile({ ...card, area: 'Anywhere' }, 'Leh', { area: '', pronouns: '', ideaIds: card.ideaIds })), null, 'a city with no list yet takes a typed area');
  assert.equal(code(() => checkProfile({ ...card, area: 'Bandra West' }, 'Delhi NCR', { area: 'Bandra West', pronouns: 'she/her', city: 'Mumbai' })), 'PL095', 'a move keeps no area from the old city');
  assert.equal(code(() => checkProfile({ ...card, area: 'Saket' }, 'Delhi NCR', { area: 'Bandra West', pronouns: 'she/her', city: 'Mumbai' })), null);
  assert.deepEqual(matchAreas('Mumbai', 'band'), ['Bandra East', 'Bandra West', 'Bhandup'], 'exact matches first, then loose ones');
});

test('a typed area finds its spelling cousins, never a random name', () => {
  assert.deepEqual(matchAreas('Bhubaneswar', 'baramunda'), ['Baramunda']);
  assert.deepEqual(matchAreas('Bhubaneswar', 'baramundaa'), ['Baramunda'], 'a doubled letter');
  assert.deepEqual(closeAreas('Bhubaneswar', 'barmunda'), ['Baramunda']);
  assert.ok(closeAreas('Bengaluru', 'koramangla').includes('Koramangala'));
  assert.ok(matchAreas('Mumbai', 'vileparle').includes('Vile Parle'));
  assert.deepEqual(closeAreas('Bhubaneswar', 'xyzzyq'), [], 'nothing close, nothing offered');
});

test('an area of my own reads as a place (AREA_CASES, the same table as tests/db/profile_rules.sql)', () => {
  for (const [a, ok] of AREA_CASES) assert.equal(customAreaOk(a), ok, `"${a}" should ${ok ? '' : 'not '}pass`);
  const db = readFileSync(join(__dirname, '..', 'db', 'profile_rules.sql'), 'utf8');
  for (const [a, ok] of AREA_CASES) assert.ok(db.includes(`(${"'" + a.replace(/'/g, "''") + "'"}, ${ok})`), `profile_rules.sql lacks the case ${a}`);
  for (const list of Object.values(AREAS)) for (const a of list) assert.ok(!looksLikeContact(a), `${a} reads like a contact`);
});

test('contact kinds follow the country', () => {
  assert.ok(contactKindsFor('IN').some((k) => k.kind === 'Telegram'));
  assert.ok(!contactKindsFor('IN').some((k) => k.kind === 'KakaoTalk'));
  assert.equal(code(() => checkContact('KakaoTalk', 'riya', 'IN')), 'PL066');
  assert.equal(code(() => checkContact('KakaoTalk', 'riya', 'KR')), null);
});
