/**
 * Two real people, one real Supabase: the live backend end to end.
 *
 * This drives src/services/supabase/supabaseBackend.ts (the exact file the app uses) as two
 * separately signed-in users, through GoTrue, PostgREST, RLS and Realtime. Nothing is mocked and
 * nothing uses the service role: every step is something a phone could do.
 *
 *   npm run test:live:local     against `supabase start`
 *   npm run test:live           against EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
 *
 * It covers: onboard, ask, both pinkies, lock, check in, reveal, bail and expiry, that each
 * person hears the other's actions over Realtime, and that the reveal returns nothing before a
 * kept invite. Expiry waits for the real pg_cron sweep, so the run takes about two minutes.
 *
 * Each run creates two anonymous users named "Test...". If E2E_DB_URL is set (a Postgres URL with
 * rights on auth.users) they are deleted afterwards; without it they are left behind.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import type { Invite } from '../../src/domain/types';
import { createSupabaseBackend } from '../../src/services/supabase/supabaseBackend';
import { KEY, MIN, SWEEP_WAIT, URL, inviteIs, one, person, profile, type Person } from './helpers';


const a = person('TestAsha');
const b = person('TestBela');

async function locked(p: Person, inviteId: string, when: string) {
  await assert.rejects(p.backend.getReveal(inviteId), /Locked until you both check in/, `${p.name} must not get the reveal ${when}`);
}

/** A sends, B puts a pinky out, A seals. Returns the locked invite. */
async function lock(startsIn: number, ideaId = 'boba_run'): Promise<Invite> {
  a.quiet();
  b.quiet();
  const sent = one(await a.backend.sendInvite({ toId: b.id, ideaId, startsAt: Date.now() + startsIn, place: ' Linking Road ', note: 'taro or nothing' }));
  assert.equal(sent.status, 'sent');
  assert.equal(sent.place, 'Linking Road', 'the server trims the place');
  const heard = await b.hears('the new ask', inviteIs(sent.id, 'sent'));
  assert.equal(heard.notice?.title, `${a.name} asked you`);

  await assert.rejects(a.backend.offerPinky(sent.id), /goes first/, 'the sender cannot go first');
  assert.equal(one(await b.backend.offerPinky(sent.id)).status, 'half_locked');
  const out = await a.hears("B's pinky", inviteIs(sent.id, 'half_locked'));
  assert.equal(out.notice?.title, `${b.name}'s pinky is out`);

  const sealed = one(await a.backend.offerPinky(sent.id));
  assert.equal(sealed.status, 'locked');
  await b.hears('the lock', inviteIs(sent.id, 'locked'));
  return sealed;
}

before(async () => {
  // Two separate sign-ins, two separate sessions.
  for (const p of [a, b]) {
    const snap = await p.backend.boot();
    assert.equal(snap.me, null, 'a new person has no profile yet');
  }
});

after(async () => {
  const ids = [a.id, b.id].filter(Boolean);
  if (process.env.E2E_DB_URL && ids.length) {
    const list = ids.map((id) => `'${id}'`).join(', ');
    execFileSync('psql', [process.env.E2E_DB_URL, '-v', 'ON_ERROR_STOP=1', '-q', '-c',
      `delete from public.events where actor_id in (${list}) or invite_id in (select id from public.invites where from_id in (${list}) or to_id in (${list})); delete from auth.users where id in (${list}) and is_anonymous;`]);
    console.log(`cleaned up ${ids.length} test users`);
  } else if (ids.length) {
    console.log(`left behind test users ${ids.join(', ')} (set E2E_DB_URL to delete them)`);
  }
  // Realtime sockets and token refresh timers would keep Node alive.
  setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref();
});

test('onboard: two people sign in anonymously and see each other', async () => {
  const snapA = await a.backend.completeOnboarding(profile(a.name, '@e2e_asha'));
  a.id = snapA.me!.id;
  assert.equal(snapA.me!.name, a.name);
  assert.deepEqual(snapA.myContact, { kind: 'Instagram', handle: '@e2e_asha' });
  assert.equal(snapA.me!.trustScore, 100, 'a new person starts at 100');

  // B onboards while A is already in the app: A must hear about B without a restart.
  const snapB = await b.backend.completeOnboarding(profile(b.name, '@e2e_bela'));
  b.id = snapB.me!.id;
  assert.notEqual(a.id, b.id);
  assert.ok(snapB.profiles.some((p) => p.id === a.id), 'B sees A in Discover');
  await a.hears('B joining', (e) => !!e.changes.profiles?.some((p) => p.id === b.id));

  // The session survives a restart: a fresh backend on the same storage is the same person.
  const again = createSupabaseBackend(URL!, KEY!, a.storage);
  assert.equal((await again.boot()).me?.id, a.id);
});

test('RLS: no direct writes, no early contact, nothing for a stranger', async () => {
  // A raw client on A's session: what a modified app could try.
  const raw = createClient(URL!, KEY!, { auth: { storage: a.storage, persistSession: true, autoRefreshToken: false } });
  const { data: session } = await raw.auth.getSession();
  assert.equal(session.session?.user.id, a.id);

  const insert = await raw.from('invites').insert({ from_id: a.id, to_id: b.id, idea_id: 'boba_run', starts_at: new Date(Date.now() + MIN).toISOString(), minutes: 25, expires_at: new Date(Date.now() + MIN).toISOString() });
  assert.ok(insert.error, 'a direct insert into invites is refused');
  const priv = await raw.from('profile_private').select('*');
  assert.deepEqual(priv.data?.map((r) => r.profile_id), [a.id], 'A reads only their own private row');
  const events = await raw.from('events').select('*');
  assert.ok(events.error || events.data?.length === 0, 'the event log is closed');
  const sweep = await raw.rpc('sweep_invites');
  assert.ok(sweep.error, 'a user cannot run the sweep');
  const edit = await raw.from('profiles').update({ name: 'Hacked' }).eq('id', b.id).select('id');
  assert.equal(edit.data?.length ?? 0, 0, "A cannot edit B's profile");

  const anon = createClient(URL!, KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedOut = await anon.from('profiles').select('id');
  assert.ok(signedOut.error || signedOut.data?.length === 0, 'signed out, there is nothing to read');
});

test('bail: lock, then one person bails; the other hears it and nothing is revealed', async () => {
  const inv = await lock(60 * MIN);
  await locked(a, inv.id, 'at locked');
  await assert.rejects(a.backend.checkIn(inv.id), /Check-in is not open/, 'check-in is closed an hour early');
  await assert.rejects(a.backend.sendInvite({ toId: b.id, ideaId: 'video_coffee', startsAt: Date.now() + 90 * MIN, place: '', note: '' }), /already have something open/);

  b.quiet();
  const bailed = one(await a.backend.bail(inv.id));
  assert.equal(bailed.status, 'flaked');
  assert.equal(bailed.flakedBy, a.id);
  const heard = await b.hears('the bail', inviteIs(inv.id, 'flaked'));
  assert.equal(heard.notice?.title, `${a.name} bailed`);
  await locked(b, inv.id, 'after a bail');
  await locked(a, inv.id, 'after a bail');
});

test('expiry: an unanswered ask is expired by the scheduled sweep', async () => {
  a.quiet();
  b.quiet();
  // Expires at its start time. 20 seconds out leaves room for clock skew between here and the server.
  const sent = one(await a.backend.sendInvite({ toId: b.id, ideaId: 'video_coffee', startsAt: Date.now() + 20_000, place: '', note: '' }));
  await b.hears('the ask', inviteIs(sent.id, 'sent'));
  // Nobody calls the sweep here: pg_cron does, and Realtime carries the result to both phones.
  await Promise.all([
    a.hears('the expiry', inviteIs(sent.id, 'expired'), SWEEP_WAIT),
    b.hears('the expiry', inviteIs(sent.id, 'expired'), SWEEP_WAIT),
  ]);
  await assert.rejects(b.backend.offerPinky(sent.id), /not open any more/);
  await locked(b, sent.id, 'after an expiry');
});

test('kept: lock, both check in, and only then does the reveal open', async () => {
  // Starts in five minutes, so the check-in window (ten minutes before) is already open.
  const inv = await lock(5 * MIN);
  await locked(a, inv.id, 'at locked');
  await locked(b, inv.id, 'at locked');

  a.quiet();
  b.quiet();
  const first = one(await a.backend.checkIn(inv.id));
  assert.equal(first.status, 'locked');
  assert.deepEqual(first.checkIns, [a.id]);
  await b.hears("A's check-in", (e) => !!e.changes.invites?.some((i) => i.id === inv.id && i.checkIns.includes(a.id)));
  await locked(a, inv.id, 'after one check-in');
  await locked(b, inv.id, 'after one check-in');

  const kept = (await b.backend.checkIn(inv.id)).invites!.find((i) => i.id === inv.id)!;
  assert.equal(kept.status, 'kept');
  const heard = await a.hears('kept', inviteIs(inv.id, 'kept'));
  assert.equal(heard.notice?.title, 'Promise kept');

  const forA = await a.backend.getReveal(inv.id);
  assert.deepEqual([forA.profileId, forA.contactKind, forA.contactHandle], [b.id, 'Instagram', '@e2e_bela']);
  const forB = await b.backend.getReveal(inv.id);
  assert.deepEqual([forB.profileId, forB.contactHandle], [a.id, '@e2e_asha']);
});

test('a restart shows the same history', async () => {
  const again = createSupabaseBackend(URL!, KEY!, b.storage);
  const snap = await again.boot();
  const statuses = snap.invites.map((i) => i.status).sort();
  assert.deepEqual(statuses, ['expired', 'flaked', 'kept']);
});
