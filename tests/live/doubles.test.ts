/**
 * A double micro-date over the network (docs/build-plan.md F3): four real people on one real
 * Supabase, driving the app's own src/services/supabase/supabaseBackend.ts. Two duos form from links,
 * one asks the other, the three others put a pinky out and the asker seals it; everyone checks in
 * with a code from the other side, and the reveal opens across the sides only. Nothing uses the
 * service role.
 *
 *   npm run test:live:local     against `supabase start`
 *   npm run test:live           against EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY
 *
 * With E2E_DB_URL (a Postgres URL with rights on auth.users) it deletes its test users afterwards.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { AppError } from '../../src/domain/errors';
import { MIN, checkInWith, inviteIs, one, person, profile } from './helpers';

const a = person('TestAadi');
const b = person('TestBrinda');
const c = person('TestCyra');
const d = person('TestDhruv');
const everyone = [a, b, c, d];

before(async () => {
  for (const p of everyone) {
    await p.backend.boot();
    p.id = (await p.backend.completeOnboarding(profile(p.name, `@e2e_${p.name.toLowerCase()}`))).me!.id;
  }
});

after(async () => {
  const ids = everyone.map((p) => p.id).filter(Boolean);
  if (process.env.E2E_DB_URL && ids.length) {
    const list = ids.map((id) => `'${id}'`).join(', ');
    execFileSync('psql', [process.env.E2E_DB_URL, '-v', 'ON_ERROR_STOP=1', '-qtA', '-c',
      `delete from public.events where actor_id in (${list}) or invite_id in (select id from public.invites where from_id in (${list}) or to_id in (${list}));
       delete from auth.users where id in (${list});`]);
    console.log(`cleaned up ${ids.length} test users`);
  } else if (ids.length) {
    console.log(`left behind test users ${ids.join(', ')} (set E2E_DB_URL to delete them)`);
  }
  setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref();
});

test('two duos, one double: pinkies, the seal, check-in across sides, and the reveal', async () => {
  // Duos from links: B joins A's, D joins C's.
  const linkA = await a.backend.createDuoLink();
  assert.equal(await b.backend.duoLinkName(linkA), a.name, 'the friend sees whose link it is');
  assert.equal((await b.backend.joinDuo(linkA)).duoId, a.id);
  await d.backend.joinDuo(await c.backend.createDuoLink());
  await assert.rejects(c.backend.joinDuo(linkA), (e: unknown) => e instanceof AppError && e.code === 'PL088', 'someone in a duo cannot join another');

  // A asks C as a double; the server seats B and D.
  const sent = one(await a.backend.sendInvite({ toId: c.id, ideaId: 'video_coffee', startsAt: Date.now() + 5 * MIN, place: '', note: '', double: true }));
  assert.deepEqual([sent.fromFriendId, sent.toFriendId], [b.id, d.id], 'both friends are on it');
  await d.hears('the double', inviteIs(sent.id, 'sent'));

  // The three others, then the seal.
  await assert.rejects(a.backend.offerPinky(sent.id), (e: unknown) => e instanceof AppError && e.code === 'PL094', 'the asker seals last');
  for (const p of [c, b, d]) one(await p.backend.offerPinky(sent.id));
  assert.equal(one(await a.backend.offerPinky(sent.id)).status, 'locked');
  await d.hears('the lock', inviteIs(sent.id, 'locked'));

  // Check-in: a code from my own side does nothing; one from the other side checks me in.
  // Nobody on the other side has opened a code yet, so any code is refused for that first (PL038).
  await assert.rejects(checkInWith(a, b, sent.id), (e: unknown) => e instanceof AppError && e.code === 'PL038', 'the other side has no code open yet');
  for (const p of [c, d]) await p.backend.myCheckInCode(sent.id);
  await assert.rejects(checkInWith(a, b, sent.id), (e: unknown) => e instanceof AppError && e.code === 'PL039', "a friend's code is not proof of meeting");
  await checkInWith(a, c, sent.id);
  await checkInWith(c, a, sent.id);
  await checkInWith(b, d, sent.id);
  const kept = one(await d.backend.checkIn(sent.id, await b.backend.myCheckInCode(sent.id)));
  assert.equal(kept.status, 'kept', 'all four in: kept');

  // The reveal, across the sides only.
  assert.equal((await a.backend.getReveal(sent.id, c.id)).contactHandle, '@e2e_testcyra');
  assert.equal((await b.backend.getReveal(sent.id, d.id)).contactHandle, '@e2e_testdhruv');
  await assert.rejects(a.backend.getReveal(sent.id, b.id), (e: unknown) => e instanceof AppError && e.code === 'PC003', 'not my own friend: they never were hidden behind a promise with me');
});
