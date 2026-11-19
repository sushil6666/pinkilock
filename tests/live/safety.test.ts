/**
 * Phase 3 over the network: blocking, reporting, data export, account deletion and phone sign-in,
 * with three real people on one real Supabase. Like two_users.test.ts it drives the app's own
 * src/services/supabase/supabaseBackend.ts, plus a raw client on each person's session for what a
 * modified app could try. Nothing uses the service role.
 *
 *   npm run test:live:local     against `supabase start`, with E2E_PHONE_TEST=1: phone sign-in
 *                               uses the test numbers in supabase/config.toml, so no SMS is sent;
 *                               and E2E_MAILBOX: email codes are read back from the local Mailpit
 *   npm run test:live           against EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY; the phone and email
 *                               parts are skipped there (they would text or mail made-up people)
 *
 * With E2E_DB_URL (a Postgres URL with rights on auth.users) it also checks the rows behind the
 * API and deletes its test users afterwards.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Invite } from '../../src/domain/types';
import { createSupabaseBackend } from '../../src/services/supabase/supabaseBackend';
import { KEY, MIN, URL, checkInWith, inviteIs, memoryStorage, one, person, profile, type Person } from './helpers';

const a = person('TestAvni');
const b = person('TestBhavin');
const c = person('TestChitra');
const everyone = [a, b, c];
const allIds = new Set<string>();

const sql = (q: string): string =>
  execFileSync('psql', [process.env.E2E_DB_URL!, '-v', 'ON_ERROR_STOP=1', '-qtA', '-c', q], { encoding: 'utf8' }).trim();
const withDb = !!process.env.E2E_DB_URL;

/** A raw client on someone's session: what a modified app could try. */
function raw(p: Person): SupabaseClient {
  return createClient(URL!, KEY!, { auth: { storage: p.storage, persistSession: true, autoRefreshToken: false } });
}

async function lockBetween(from: Person, to: Person, startsIn: number): Promise<Invite> {
  const sent = one(await from.backend.sendInvite({ toId: to.id, ideaId: 'video_coffee', startsAt: Date.now() + startsIn, place: '', note: '' }));
  await to.hears('the ask', inviteIs(sent.id, 'sent'));
  one(await to.backend.offerPinky(sent.id));
  return one(await from.backend.offerPinky(sent.id));
}

before(async () => {
  for (const [p, handle] of [[a, '@e2e_avni'], [b, '@e2e_bhavin'], [c, '@e2e_chitra']] as const) {
    await p.backend.boot();
    p.id = (await p.backend.completeOnboarding(profile(p.name, handle))).me!.id;
    allIds.add(p.id);
  }
});

after(async () => {
  const ids = [...allIds];
  if (withDb && ids.length) {
    const list = ids.map((id) => `'${id}'`).join(', ');
    sql(`delete from public.events where actor_id in (${list}) or invite_id in (select id from public.invites where from_id in (${list}) or to_id in (${list}));
         delete from public.reports where reporter_id in (${list}) or reported_id in (${list});
         delete from auth.users where id in (${list});`);
    console.log(`cleaned up ${ids.length} test users`);
  } else if (ids.length) {
    console.log(`left behind test users ${ids.join(', ')} (set E2E_DB_URL to delete them)`);
  }
  setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref();
});

test('block: the blocked person loses the card, every shared invite and the reveal, through RLS', async () => {
  // A kept promise (so the reveal is open) and a live plan, between A and B.
  const keptPlan = await lockBetween(a, b, 5 * MIN);
  await checkInWith(a, b, keptPlan.id);
  await checkInWith(b, a, keptPlan.id);
  assert.equal((await a.backend.getReveal(keptPlan.id)).contactHandle, '@e2e_bhavin', 'before: the reveal is open');
  const livePlan = await lockBetween(b, a, 60 * MIN);
  assert.equal(livePlan.status, 'locked');

  const changes = await b.backend.block(a.id);
  assert.deepEqual(changes.removed?.profiles, [a.id], 'the blocker drops the card at once');
  assert.deepEqual(new Set(changes.removed?.invites), new Set([keptPlan.id, livePlan.id]), 'and every invite with them');

  // The blocked person is not told. A fresh boot shows what RLS now returns.
  for (const [p, other] of [[a, b], [b, a]] as const) {
    const snap = await createSupabaseBackend(URL!, KEY!, p.storage).boot();
    assert.ok(!snap.profiles.some((x) => x.id === other.id), `${p.name} no longer sees ${other.name} in Discover`);
    assert.ok(!snap.invites.some((i) => i.id === keptPlan.id || i.id === livePlan.id), `${p.name} sees no invite with ${other.name}`);
    const client = raw(p);
    assert.equal((await client.from('invites').select('id').in('id', [keptPlan.id, livePlan.id])).data?.length, 0, `${p.name}: a raw select finds nothing`);
    assert.equal((await client.from('profile_private').select('profile_id').eq('profile_id', other.id)).data?.length, 0, `${p.name}: the reveal is closed`);
    assert.equal((await client.from('profile_cards').select('id').eq('id', other.id)).data?.length, 0, `${p.name}: no card`);
    assert.ok((await client.from('blocks').select('*')).error, `${p.name} cannot read the blocks table`);
  }
  await assert.rejects(a.backend.getReveal(keptPlan.id), 'A cannot get the reveal any more');
  await assert.rejects(a.backend.checkIn(livePlan.id, '0000'), 'A cannot act on the plan');
  await assert.rejects(a.backend.sendInvite({ toId: b.id, ideaId: 'boba_run', startsAt: Date.now() + 90 * MIN, place: '', note: '' }), /not available/, 'A cannot ask B');

  const forC = await createSupabaseBackend(URL!, KEY!, c.storage).boot();
  assert.ok(forC.profiles.some((x) => x.id === a.id) && forC.profiles.some((x) => x.id === b.id), 'C still sees both');

  if (withDb) {
    assert.equal(sql(`select status from public.invites where id = '${livePlan.id}'`), 'ended', 'the live plan ended');
    assert.equal(sql(`select status from public.invites where id = '${keptPlan.id}'`), 'kept', 'the kept one stays kept');
    assert.equal(sql(`select count(*) from public.events where invite_id = '${livePlan.id}' and type in ('bailed', 'no_show', 'declined')`), '0', 'no flake for anyone');
  }

  const list = await b.backend.blockedPeople();
  assert.deepEqual(list.map((x) => [x.profileId, x.name]), [[a.id, a.name]], "B's block list shows A");
  assert.deepEqual(await a.backend.blockedPeople(), [], 'A cannot see that B blocked them');

  const back = await b.backend.unblock(a.id);
  assert.ok(back.profiles?.some((x) => x.id === a.id), 'unblocking brings the card back');
  assert.ok(back.invites?.some((i) => i.id === livePlan.id && i.status === 'ended'), 'the ended plan comes back as ended');
});

test('report: stored where no client can read it, and it blocks', async () => {
  await c.backend.report({ profileId: a.id, reason: 'harassment', detail: 'e2e report, please ignore' });
  const snap = await createSupabaseBackend(URL!, KEY!, c.storage).boot();
  assert.ok(!snap.profiles.some((x) => x.id === a.id), 'the reporter no longer sees them');
  for (const p of everyone) assert.ok((await raw(p).from('reports').select('*')).error, `${p.name} cannot read reports`);
  const direct = await raw(c).from('reports').insert({ reporter_id: c.id, reported_id: b.id, reason: 'other' });
  assert.ok(direct.error, 'a report cannot be written directly');
  await assert.rejects(c.backend.report({ profileId: b.id, reason: 'rude' as never, detail: '' }), /reason/);
  if (withDb) assert.equal(sql(`select reason from public.reports where reporter_id = '${c.id}' and reported_id = '${a.id}'`), 'harassment');
});

test('export: my data, and nobody else\'s contact', async () => {
  const doc = JSON.parse(await a.backend.exportMyData());
  assert.equal(doc.account.id, a.id);
  assert.equal(doc.contact.handle, '@e2e_avni');
  assert.ok(doc.invites.length >= 2, 'my invites are in it');
  const text = JSON.stringify(doc);
  assert.ok(!text.includes('@e2e_bhavin') && !text.includes('e2e report'), "no one else's contact, no report about me");
});

/**
 * The newest code Mailpit holds for an address, waiting until one other than `after` arrives.
 * Reads the inbox list rather than Mailpit's search, and on a timeout says what the inbox did
 * hold, so a miss in CI can be told apart from a slow delivery.
 */
async function codeFor(address: string, after: string | null): Promise<{ code: string; id: string }> {
  const box = process.env.E2E_MAILBOX!.replace(/\/$/, '');
  type Item = { ID: string; To?: { Address: string }[]; Created?: string };
  let seen: Item[] = [];
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    seen = ((await (await fetch(`${box}/api/v1/messages?limit=50`)).json()) as { messages?: Item[] }).messages ?? [];
    const mine = seen.find((m) => m.To?.some((x) => x.Address.toLowerCase() === address));
    if (mine && mine.ID !== after) {
      const msg = (await (await fetch(`${box}/api/v1/message/${mine.ID}`)).json()) as { Text?: string; HTML?: string };
      const code = `${msg.Text ?? ''} ${msg.HTML ?? ''}`.match(/\b(\d{6})\b/)?.[1];
      if (code) return { code, id: mine.ID };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  const recent = seen.slice(0, 5).map((m) => `${m.To?.map((x) => x.Address).join(',')} at ${m.Created}`).join('; ');
  throw new Error(`no email code reached ${address} in 30s (inbox holds ${seen.length}; newest: ${recent || 'none'})`);
}

test('email: link keeps the id and history; sign in on a new phone gets them back', async (t) => {
  // Only where the mail goes to a local Mailpit: anywhere else it would mail a made-up address.
  if (!process.env.E2E_MAILBOX) return t.skip('set E2E_MAILBOX to the local Mailpit URL');
  const acct = await b.backend.account();
  assert.ok(acct.emailAvailable, 'email sign-in is on');
  assert.equal(acct.email, null, 'anonymous to start with');
  const email = `e2e-bhavin-${Date.now()}@example.com`;

  await b.backend.sendCode('email', email, 'link');
  const first = await codeFor(email, null);
  const wrong = first.code === '000000' ? '111111' : '000000';
  await assert.rejects(b.backend.verifyCode('email', email, wrong, 'link'), /did not match/, 'a wrong code is refused');
  const linked = await b.backend.verifyCode('email', email, first.code, 'link');
  assert.equal(linked.me?.id, b.id, 'the same person after linking');
  assert.equal((await b.backend.account()).email, email);
  const before = linked.invites.map((i) => i.id).sort();

  // G22 (D091): the answer is the same whether the address is free, taken or unknown; nothing is
  // sent to someone else's address or to one with no account, so no code for it ever matches.
  sql('delete from private.auth_code_requests');
  await c.backend.sendCode('email', email, 'link');
  await assert.rejects(c.backend.verifyCode('email', email, first.code, 'link'), /did not match/, 'someone else cannot take the address');
  const nobody = `e2e-nobody-${Date.now()}@example.com`;
  await c.backend.sendCode('email', nobody, 'sign_in');
  await assert.rejects(c.backend.verifyCode('email', nobody, '123456', 'sign_in'), /did not match/, 'an address with no account gets no code');
  assert.equal(sql(`select count(*) from auth.users where email = '${nobody}'`), '0', 'sign-in never makes a new account');
  await assert.rejects(c.backend.sendCode('email', nobody, 'sign_in'), (e: { code?: string }) => e.code === 'PA007', 'a second code within a minute waits, whoever it is for');
  sql('delete from private.auth_code_requests');

  const fresh = createSupabaseBackend(URL!, KEY!, memoryStorage());
  assert.equal((await fresh.boot()).me, null, 'a new phone starts as nobody');
  await fresh.sendCode('email', email, 'sign_in');
  const second = await codeFor(email, first.id);
  const back = await fresh.verifyCode('email', email, second.code, 'sign_in');
  assert.equal(back.me?.id, b.id, 'signing in on a new phone is the same person');
  assert.deepEqual(back.invites.map((i) => i.id).sort(), before, 'with the same history');
  assert.equal((await fresh.signOut()).me, null, 'an email is enough to be allowed to sign out');
  // G19: signing out is global, so the session on B's first phone is ended on the server too.
  const old = await raw(b).auth.getUser();
  assert.ok(old.error, 'G19 closed: signing out on one phone ends the copy on another');
});

test('phone: link keeps the id and history; sign in on a new phone gets them back', async (t) => {
  // Only where the test numbers in supabase/config.toml exist (the local stack): anywhere else a
  // real SMS would go to a made-up number.
  if (process.env.E2E_PHONE_TEST !== '1') return t.skip('set E2E_PHONE_TEST=1 on a stack with the test numbers');
  const acct = await a.backend.account();
  assert.ok(acct.phoneAvailable, 'phone sign-in is on');
  const phone = '+919000000101';
  assert.equal(acct.phone, null, 'anonymous to start with');

  await a.backend.sendCode('phone', phone, 'link');
  await assert.rejects(a.backend.verifyCode('phone', phone, '000000', 'link'), /did not match/, 'a wrong code is refused');
  const linked = await a.backend.verifyCode('phone', phone, '123456', 'link');
  assert.equal(linked.me?.id, a.id, 'the same person after linking');
  assert.equal((await a.backend.account()).phone, phone);
  const before = linked.invites.map((i) => i.id).sort();

  // Someone else cannot take the number. C, not B: the email test signed B out everywhere (G19).
  // G22 (D091): the same answer for a taken or unknown number, and no code that matches.
  sql('delete from private.auth_code_requests');
  await assert.rejects(c.backend.sendCode('phone', phone, 'link').then(() => c.backend.verifyCode('phone', phone, '123456', 'link')), /did not match/);
  await c.backend.sendCode('phone', '+919000000103', 'sign_in');
  await assert.rejects(c.backend.verifyCode('phone', '+919000000103', '123456', 'sign_in'), /did not match/, 'a number with no account gets no code');
  assert.equal(sql(`select count(*) from auth.users where phone = '919000000103'`), '0', 'sign-in never makes a new account');
  sql('delete from private.auth_code_requests');

  // A new phone: empty storage, sign in with the number.
  const fresh = createSupabaseBackend(URL!, KEY!, memoryStorage());
  assert.equal((await fresh.boot()).me, null, 'a new phone starts as nobody');
  await fresh.sendCode('phone', phone, 'sign_in');
  const back = await fresh.verifyCode('phone', phone, '123456', 'sign_in');
  assert.equal(back.me?.id, a.id, 'signing in on a new phone is the same person');
  assert.deepEqual(back.invites.map((i) => i.id).sort(), before, 'with the same history');
  await assert.rejects(createSupabaseBackend(URL!, KEY!, memoryStorage()).signOut(), /phone number or an email first/, 'an anonymous person cannot sign out');
  assert.equal((await fresh.signOut()).me, null, 'signing out leaves nobody on that phone');
});

test('delete: the account goes, others stop seeing it, and the log keeps no id', async () => {
  const cId = c.id;
  const snap = await c.backend.deleteAccount();
  assert.equal(snap.me, null);
  const forB = await createSupabaseBackend(URL!, KEY!, b.storage).boot();
  assert.ok(!forB.profiles.some((x) => x.id === cId), 'B no longer sees C');
  if (withDb) {
    assert.equal(sql(`select count(*) from auth.users where id = '${cId}'`), '0', 'the auth user is gone');
    assert.equal(sql(`select count(*) from public.profiles where id = '${cId}'`), '0', 'the profile is gone');
    assert.equal(sql(`select count(*) from public.events where actor_id = '${cId}'`), '0', 'no event names C');
    assert.equal(sql(`select count(*) from public.reports where reporter_id is null and detail = 'e2e report, please ignore'`), '1', 'the report stays, without C');
  }
  allIds.delete(cId);
  // The same phone afterwards is a new, anonymous nobody.
  const after = await c.backend.boot();
  assert.equal(after.me, null);
  const { data } = await raw(c).auth.getSession();
  assert.notEqual(data.session?.user.id, cId, 'a new user, not the deleted one');
  if (data.session) allIds.add(data.session.user.id);
});
