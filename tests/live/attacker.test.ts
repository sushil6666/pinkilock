/**
 * The attacker suite over the network (docs/build-plan.md, WP0). tests/db/attacker.sql checks the
 * rules inside Postgres; this checks what the public API adds or exposes on top: PostgREST, the
 * schemas it serves, GoTrue and the push function. The attacker has the anon key (it is in every
 * copy of the app) and a real session of their own, and uses neither the app nor its backend file.
 *
 *   test(...)  a defence that holds today.
 *   gap(...)   a known hole from the plan's gap table, written as the defence that should hold.
 *              It passes while the hole is open and FAILS the day the defence holds: turn it
 *              into a plain test in the change that closed the gap.
 *
 * Runs with the other live tests (npm run test:live:local, and test:live against a project).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../src/domain/errors';
import { KEY, MIN, URL, person, profile, type Person } from './helpers';

const x = person('E2E Xavier');
const y = person('E2E Yami');
let raw: SupabaseClient;
/** The anon key and nothing else: a script with no session. */
const signedOut = createClient(URL!, KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

const withDb = !!process.env.E2E_DB_URL;
const sql = (q: string): string =>
  execFileSync('psql', [process.env.E2E_DB_URL!, '-v', 'ON_ERROR_STOP=1', '-qtA', '-c', q], { encoding: 'utf8' }).trim();

function gap(id: string, what: string, defence: () => Promise<void>) {
  test(`gap ${id} open: ${what}`, async () => {
    let holds = true;
    try {
      await defence();
    } catch {
      holds = false;
    }
    assert.equal(holds, false, `${id} is closed now (${what}). Good: make this a plain test and update docs/build-plan.md.`);
  });
}

/** The request was refused outright, or came back with nothing. */
const refused = (res: { data: unknown; error: unknown }, what: string) =>
  assert.ok(res.error || (Array.isArray(res.data) && res.data.length === 0) || res.data === null, `${what}: expected a refusal, got ${JSON.stringify(res.data)}`);

before(async () => {
  for (const [p, handle] of [[x, '@e2e_xavier'], [y, '@e2e_yami_secret']] as const) {
    await p.backend.boot();
    p.id = (await p.backend.completeOnboarding(profile(p.name, handle))).me!.id;
  }
  raw = createClient(URL!, KEY!, { auth: { storage: x.storage, persistSession: true, autoRefreshToken: false } });
});

after(async () => {
  const ids = [x, y].map((p: Person) => p.id).filter(Boolean);
  if (withDb && ids.length) {
    const list = ids.map((id) => `'${id}'`).join(', ');
    sql(`delete from public.events where actor_id in (${list}) or invite_id in (select id from public.invites where from_id in (${list}) or to_id in (${list}));
         delete from auth.users where id in (${list});`);
  }
  setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref();
});

test('signed out: the anon key alone reads nothing and calls nothing', async () => {
  for (const table of ['profiles', 'profile_cards', 'profile_private', 'invites', 'ideas', 'trust_scores', 'events', 'reports']) {
    refused(await signedOut.from(table).select('*').limit(1), `anon select ${table}`);
  }
  assert.ok((await signedOut.rpc('log_event', { p_type: 'app_open' })).error, 'anon cannot call a function');
});

test('signed in: no direct write to promises, scores, the log, or the push tables', async () => {
  const invite = { from_id: x.id, to_id: y.id, idea_id: 'boba_run', starts_at: new Date(Date.now() + MIN).toISOString(), minutes: 25, expires_at: new Date(Date.now() + MIN).toISOString() };
  assert.ok((await raw.from('invites').insert(invite)).error, 'insert an invite');
  assert.ok((await raw.from('invites').update({ status: 'kept' }).neq('status', 'kept')).error, 'update invites');
  assert.ok((await raw.from('trust_scores').upsert({ profile_id: x.id, score: 100 })).error, 'write a Trust Score');
  for (const table of ['events', 'blocks', 'reports', 'notifications', 'push_tokens']) {
    assert.ok((await raw.from(table).select('*').limit(1)).error, `read ${table}`);
  }
  assert.ok((await raw.from('ideas').update({ title: 'X' }).eq('id', 'boba_run')).error, 'change the catalogue');
});

test('signed in: the server-only functions cannot be called', async () => {
  assert.ok((await raw.rpc('sweep_invites')).error, 'sweep_invites');
  assert.ok((await raw.rpc('claim_notifications', { p_limit: 10 })).error, 'claim_notifications');
  assert.ok((await raw.rpc('set_push_config', { p_url: 'https://evil.example', p_secret: 's' })).error, 'set_push_config');
  assert.ok((await raw.rpc('queue_notification', { p_to: y.id, p_invite: null, p_kind: 'new_ask', p_title: 'Free prize', p_body: 'Tap' })).error, 'queue_notification');
  assert.ok((await raw.rpc('log_event', { p_type: 'kept' })).error, 'log a kept promise');
});

test('the API serves only the public schema: private and analytics cannot be reached', async () => {
  assert.ok((await raw.schema('private' as never).rpc('blocked_pair', { p_a: x.id, p_b: y.id })).error, 'private.blocked_pair');
  assert.ok((await raw.schema('analytics' as never).from('metrics_daily').select('*').limit(1)).error, 'analytics.metrics_daily');
  assert.ok((await raw.schema('auth' as never).from('users').select('*').limit(1)).error, 'auth.users');
});

test('someone else: no contact, no edits', async () => {
  const contact = await raw.from('profile_private').select('*').eq('profile_id', y.id);
  assert.deepEqual(contact.data ?? [], [], 'no contact without a kept promise');
  await raw.from('profiles').update({ name: 'Owned' }).eq('id', y.id);
  await raw.from('profile_private').update({ contact_handle: '@owned' }).eq('profile_id', y.id);
  const snap = await y.backend.boot();
  assert.equal(snap.me?.name, y.name, 'the name did not change');
  assert.equal(snap.myContact?.handle, '@e2e_yami_secret', 'the contact did not change');
});

test('the push function answers only Postgres', async () => {
  for (const auth of [undefined, `Bearer ${KEY}`, 'Bearer guess']) {
    const res = await fetch(`${URL!.replace(/\/$/, '')}/functions/v1/push`, { method: 'POST', headers: { apikey: KEY!, ...(auth ? { Authorization: auth } : {}) }, body: '{}' });
    assert.notEqual(res.status, 200, `push accepted a caller with ${auth ?? 'no'} authorization`);
  }
});

test('errors carry a code and a trace id, and the phone error log cannot be read or forged', async () => {
  const self = x.backend.sendInvite({ toId: x.id, ideaId: 'boba_run', startsAt: Date.now() + 60 * MIN, place: '', note: '' });
  await assert.rejects(self, (e: unknown) => e instanceof AppError && e.code === 'PL020' && /^[0-9A-Z]{8}$/.test(e.trace), 'a refusal is an AppError with the server code');
  await x.backend.logClientError({ code: 'PL020', trace: 'TESTTRAC', route: '/invite/new', appVersion: 'e2e', platform: null });
  assert.ok((await raw.from('client_errors').select('*').limit(1)).error, 'read client errors');
  assert.ok((await raw.from('client_errors').insert({ code: 'PC001' })).error, 'write client errors directly');
  assert.ok((await raw.rpc('log_client_error', { p_code: 'not a code', p_trace: null, p_route: '', p_app_version: '', p_platform: null })).error, 'a made-up code');
  assert.ok((await raw.schema('private' as never).rpc('invite_timeline', { p_invite: x.id })).error, 'the operator timeline');
  if (withDb) {
    assert.equal(sql(`select code || ' ' || route from public.client_errors where user_id = '${x.id}' and trace = 'TESTTRAC'`), 'PL020 /invite/new', 'the report landed');
    // The refused ask logged no event; an accepted call does, with the trace the phone sent.
    await raw.rpc('log_event', { p_type: 'app_open' }).setHeader('x-trace-id', 'TESTTRC2');
    assert.equal(sql(`select count(*) from public.events where actor_id = '${x.id}' and props ->> 'trace' = 'TESTTRC2'`), '1', 'the trace header reaches the event log');
    await raw.rpc('log_event', { p_type: 'app_open' }).setHeader('x-trace-id', "x'; drop table events; --");
    assert.equal(sql(`select count(*) from public.events where actor_id = '${x.id}' and props ->> 'trace' like '%drop%'`), '0', 'a malformed trace header is ignored');
  }
});

gap('G1', 'a handle goes out on a profile line, written straight to the table', async () => {
  const res = await raw.from('profiles').update({ tagline: 'dm me on insta @xavier.real' }).eq('id', x.id).select('tagline');
  assert.ok(res.error || res.data?.length === 0, 'the write went through');
});

gap('G3', 'server-owned columns are client-writable', async () => {
  const res = await raw.from('profiles').update({ photo_count: 99 }).eq('id', x.id).select('photo_count');
  assert.ok(res.error || res.data?.length === 0, 'the write went through');
});

gap('G4', 'an anonymous account can send an ask', async () => {
  const res = await raw.rpc('send_invite', { p_to: y.id, p_idea: 'boba_run', p_starts_at: new Date(Date.now() + 60 * MIN).toISOString(), p_place: '', p_note: '' });
  assert.ok(res.error, 'the ask was sent');
});

// Needs email sign-in switched on, which the local stack has and a project without a mail sender
// does not; there the answer says nothing either way.
if (process.env.E2E_MAILBOX) {
  gap('G22', 'sign-in says whether an email address has an account', async () => {
    const res = await signedOut.auth.signInWithOtp({ email: `nobody-${Date.now()}@example.com`, options: { shouldCreateUser: false } });
    assert.equal(res.error, null, `the answer gives it away: ${res.error?.message}`);
  });
}
