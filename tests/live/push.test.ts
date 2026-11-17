/**
 * Push, end to end on the local stack, with a stand-in for Expo.
 *
 *   npm run test:push:local
 *
 * The chain under test is the real one: the app's backend registers a device token, a promise
 * function changes an invite, the trigger queues a notification, pg_net wakes the `push` Edge
 * Function, and the function posts to the Expo push API. Only the last hop is replaced: the
 * function's EXPO_PUSH_URL points at a small server in this file, which records what Expo would
 * have been asked to deliver. That makes this local-only; on a real project the same messages go
 * to the real Expo and on to a phone, which no script can observe.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import { after, before, test } from 'node:test';
import { KEY, MIN, SWEEP_WAIT, URL, one, person, profile } from './helpers';

const PORT = Number(process.env.FAKE_EXPO_PORT ?? 54399);
const DB = process.env.E2E_DB_URL;
if (!DB) throw new Error('Set E2E_DB_URL (or use npm run test:push:local).');
const sql = (q: string) => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', q], { encoding: 'utf8' }).trim();

interface Push { to: string; title: string; body: string; data: { inviteId: string; kind: string } }
const received: Push[] = [];
const waiters = new Set<() => void>();
const expo = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const messages = JSON.parse(raw) as Push[];
    received.push(...messages);
    waiters.forEach((w) => w());
    // A token with "dead" in it plays an uninstalled app.
    const data = messages.map((m) => (m.to.includes('dead') ? { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: 'ticket' }));
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data }));
  });
});

function pushed(what: string, match: (p: Push) => boolean, timeout = 20_000): Promise<Push> {
  const seen = received.find(match);
  if (seen) return Promise.resolve(seen);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(w);
      reject(new Error(`no push for: ${what} (waited ${timeout / 1000}s; got ${received.map((p) => p.data.kind).join(', ') || 'nothing'})`));
    }, timeout);
    const w = () => {
      const hit = received.find(match);
      if (!hit) return;
      clearTimeout(timer);
      waiters.delete(w);
      resolve(hit);
    };
    waiters.add(w);
  });
}

const stamp = Date.now().toString(36);
const a = person('TestAsha');
const b = person('TestBela');
const tokenA = `ExponentPushToken[a-${stamp}]`;
const tokenB = `ExponentPushToken[b-${stamp}]`;
const deadB = `ExponentPushToken[dead-${stamp}]`;
const is = (kind: string, to: string, inviteId: string) => (p: Push) => p.data.kind === kind && p.to === to && p.data.inviteId === inviteId;

before(async () => {
  await new Promise<void>((r) => expo.listen(PORT, '0.0.0.0', r));
  for (const p of [a, b]) await p.backend.boot();
  a.id = (await a.backend.completeOnboarding(profile(a.name, '@secret_asha'))).me!.id;
  b.id = (await b.backend.completeOnboarding(profile(b.name, '@secret_bela'))).me!.id;
});

after(() => {
  expo.close();
  const list = [a.id, b.id].filter(Boolean).map((id) => `'${id}'`).join(', ');
  if (list) sql(`delete from public.events where actor_id in (${list}); delete from auth.users where id in (${list}) and is_anonymous;`);
  setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref();
});

test('the function refuses anyone who is not Postgres', async () => {
  for (const auth of [`Bearer ${KEY}`, 'Bearer guess', '']) {
    const res = await fetch(`${URL}/functions/v1/push`, { method: 'POST', headers: { Authorization: auth, apikey: KEY! }, body: '{}' });
    assert.equal(res.status, 401, `"${auth.slice(0, 12)}" must not be able to trigger a send`);
  }
});

test('devices register through the backend, and a new ask reaches only the person asked', async () => {
  await a.backend.registerPushToken(tokenA, 'android');
  await b.backend.registerPushToken(tokenB, 'ios');
  await b.backend.registerPushToken(deadB, 'android');

  const inv = one(await a.backend.sendInvite({ toId: b.id, ideaId: 'boba_run', startsAt: Date.now() + 5 * MIN, place: 'Linking Road', note: 'a private note' }));
  const ask = await pushed('the new ask', is('new_ask', tokenB, inv.id));
  assert.equal(ask.title, `${a.name} asked you`);
  assert.equal(ask.body, 'Boba run. Lock it or pass.');
  assert.deepEqual(ask.data, { inviteId: inv.id, kind: 'new_ask' });
  assert.ok(!received.some((p) => p.to === tokenA), 'the sender gets no push for their own ask');

  // The dead device was tried once, reported by Expo, and removed.
  await pushed('the try on the dead device', (p) => p.to === deadB);
  await assert.doesNotReject(async () => {
    for (let i = 0; i < 40 && sql(`select count(*) from public.push_tokens where token = '${deadB}'`) !== '0'; i++) await new Promise((r) => setTimeout(r, 250));
    assert.equal(sql(`select count(*) from public.push_tokens where token = '${deadB}'`), '0');
  }, 'a token Expo calls DeviceNotRegistered is deleted');

  assert.equal(one(await b.backend.offerPinky(inv.id)).status, 'half_locked');
  assert.equal((await pushed("B's pinky", is('pinky_out', tokenA, inv.id))).title, `${b.name}'s pinky is out`);

  assert.equal(one(await a.backend.offerPinky(inv.id)).status, 'locked');
  assert.equal((await pushed('the lock', is('locked', tokenB, inv.id))).title, `Locked with ${a.name}`);

  // It starts in five minutes, so the window is open: the next sweep (pg_cron) announces it to both.
  const [openA, openB] = await Promise.all([
    pushed('check-in open, to A', is('checkin_open', tokenA, inv.id), SWEEP_WAIT),
    pushed('check-in open, to B', is('checkin_open', tokenB, inv.id), SWEEP_WAIT),
  ]);
  assert.equal(openA.title, 'Check-in is open');
  assert.equal(openA.body, `Boba run with ${b.name}. Check in when you are there, or it counts as a flake.`);
  assert.equal(openB.body, `Boba run with ${a.name}. Check in when you are there, or it counts as a flake.`);

  one(await a.backend.bail(inv.id));
  assert.equal((await pushed('the bail', is('bailed', tokenB, inv.id))).title, `${a.name} bailed`);
  await new Promise((r) => setTimeout(r, 1500));
  assert.ok(!received.some((p) => p.to === tokenA && p.data.kind === 'bailed'), 'the one who bailed is not told about their own bail');
});

test('nothing private ever left the database', () => {
  const all = JSON.stringify(received);
  for (const secret of ['@secret_asha', '@secret_bela', 'a private note', 'Linking Road']) assert.ok(!all.includes(secret), `"${secret}" must not appear in any push`);
  for (const p of received) assert.deepEqual(Object.keys(p.data).sort(), ['inviteId', 'kind'], 'the payload carries an id and a kind, nothing else');
  // Each kind went out exactly once per device: nothing was announced twice.
  const keys = received.map((p) => `${p.data.kind}>${p.to}>${p.data.inviteId}`);
  assert.equal(new Set(keys).size, keys.length, 'no duplicate pushes');
  assert.equal(sql(`select count(*) from public.notifications where sent_at is null and recipient_id in ('${a.id}', '${b.id}')`), '0', 'the outbox is drained');
});
