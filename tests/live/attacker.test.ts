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
import { KEY, LINK_GATE, MIN, URL, memoryStorage, person, profile, type Person } from './helpers';
import { createSupabaseBackend } from '../../src/services/supabase/supabaseBackend';

const x = person('TestXavier');
const y = person('TestYami');
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

test('contact handles: no flag without a kept plan, no reading flags or codes, no self-verifying (D077, D078)', async () => {
  await assert.rejects(x.backend.reportBadContact('00000000-0000-0000-0000-000000000000', y.id), (e: unknown) => e instanceof AppError && e.code === 'PL100', 'a flag needs a kept plan with them');
  assert.ok((await raw.from('contact_reports').select('*')).error, 'the flags cannot be read');
  assert.ok((await raw.rpc('confirm_contact_code', { p_kind: 'Instagram', p_sender: 'e2e_xavier', p_text: 'PINKY-000000' })).error, 'only the server confirms a proof');
  await raw.from('profile_private').update({ contact_verified_at: new Date().toISOString() }).eq('profile_id', x.id);
  assert.equal((await x.backend.myContactStatus())?.verified, false, 'nobody marks their own handle verified');
  await assert.rejects(x.backend.updateMe({ contactKind: 'Instagram', contactHandle: 'not..valid' }), (e: unknown) => e instanceof AppError && e.code === 'PL097', 'an Instagram handle in the wrong format');
});

test('duos: no direct writes, no one else\'s duo, no double without one (F3)', async () => {
  const forged = await raw.from('duos').insert({ person: x.id, partner: y.id });
  assert.ok(forged.error, 'a duo row cannot be written directly');
  const theirs = await raw.from('duos').select('*').eq('person', y.id);
  assert.deepEqual(theirs.data ?? [], [], 'nobody reads another person\'s duo');
  await assert.rejects(x.backend.joinDuo('0123456789abcdef'), (e: unknown) => e instanceof AppError && e.code === 'PL089', 'a made-up duo link cannot be joined');
  await assert.rejects(x.backend.sendInvite({ toId: y.id, ideaId: 'video_coffee', startsAt: Date.now() + 60 * MIN, place: '', note: '', double: true }),
    (e: unknown) => e instanceof AppError && ['PL092', 'PL068'].includes(e.code), 'a double without a duo is refused');
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
  assert.ok((await raw.schema('private' as never).rpc('set_config', { p_key: 'network_check_token', p_value: 'x'.repeat(64) })).error, 'setting the network-check token');
  if (withDb) {
    assert.equal(sql(`select code || ' ' || route from public.client_errors where user_id = '${x.id}' and trace = 'TESTTRAC'`), 'PL020 /invite/new', 'the report landed');
    // The refused ask logged no event; an accepted call does, with the trace the phone sent.
    await raw.rpc('log_event', { p_type: 'app_open' }).setHeader('x-trace-id', 'TESTTRC2');
    assert.equal(sql(`select count(*) from public.events where actor_id = '${x.id}' and props ->> 'trace' = 'TESTTRC2'`), '1', 'the trace header reaches the event log');
    await raw.rpc('log_event', { p_type: 'app_open' }).setHeader('x-trace-id', "x'; drop table events; --");
    assert.equal(sql(`select count(*) from public.events where actor_id = '${x.id}' and props ->> 'trace' like '%drop%'`), '0', 'a malformed trace header is ignored');
  }
});

test('a picked venue: the server writes the place, whatever the app typed', async () => {
  const sent = await raw.rpc('send_invite', { p_to: y.id, p_idea: 'boba_run', p_starts_at: new Date(Date.now() + 60 * MIN).toISOString(), p_place: 'my flat, call 98765 43210', p_note: '', p_venue: 'mum_carter_road' });
  assert.equal(sent.error, null);
  assert.equal(sent.data.place, 'Carter Road Promenade, Bandra West');
  assert.equal(sent.data.venue_id, 'mum_carter_road');
  await x.backend.declineInvite(sent.data.id);
  const fake = await raw.rpc('send_invite', { p_to: y.id, p_idea: 'boba_run', p_starts_at: new Date(Date.now() + 60 * MIN).toISOString(), p_place: '', p_note: '', p_venue: 'my_flat' });
  assert.equal(fake.error?.code, 'PL067', 'a venue that is not in the catalogue');
  assert.ok((await raw.from('venues').insert({ id: 'x', city: 'Mumbai', area: 'Bandra', name: 'My flat', kind: 'landmark' })).error, 'adding a venue');
});

test('G1, G3 closed: profiles are written only through save_profile, which refuses a contact', async () => {
  assert.ok((await raw.from('profiles').update({ tagline: 'dm me on insta @xavier.real' }).eq('id', x.id).select('tagline')).error, 'a direct write to the profile');
  assert.ok((await raw.from('profiles').update({ photo_count: 99 }).eq('id', x.id).select('photo_count')).error, 'a direct write to a server-owned column');
  assert.ok((await raw.from('profile_private').update({ photos: [{ caption: 'x' }] }).eq('profile_id', x.id).select('profile_id')).error, 'a direct write to the photos field');
  const me = profile(x.name, '@e2e_xavier');
  await assert.rejects(x.backend.updateMe({ tagline: 'dm me on insta @xavier.real' }), (e: unknown) => e instanceof AppError && e.code === 'PL065', 'a handle in the profile line');
  await assert.rejects(x.backend.updateMe({ name: 'xavier.real' }), (e: unknown) => e instanceof AppError && e.code === 'PL060', 'a handle as the name');
  await assert.rejects(x.backend.updateMe({ vibes: ['any text at all'] }), (e: unknown) => e instanceof AppError && e.code === 'PL062', 'a tag that is not in the catalogue');
  await assert.rejects(x.backend.sendInvite({ toId: y.id, ideaId: 'boba_run', startsAt: Date.now() + 60 * MIN, place: 'Linking Road', note: 'call me 98765 43210' }),
    (e: unknown) => e instanceof AppError && e.code === 'PL069', 'a number in an ask: asks carry only a picked line (PL069)');
  const after = await x.backend.updateMe({ tagline: 'still here' });
  assert.equal(after.me?.tagline, 'still here', 'an ordinary edit still saves');
  assert.equal(after.me?.name, me.name, 'and nothing refused got through');
});

// G4 is closed wherever the link gate is on (a project with a mail sender or SMS provider); on a
// project without one, such as the local stack, it stays open. Test people are linked when the gate
// is on (helpers.ts), so the check uses a fresh anonymous account of its own.
if (LINK_GATE) {
  test('G4 closed: an anonymous account cannot send an ask (PL068)', async () => {
    const storage = memoryStorage();
    const anon = createSupabaseBackend(URL!, KEY!, storage);
    await anon.boot();
    const anonId = (await anon.completeOnboarding(profile('TestAnon', '@e2e_anon'))).me!.id;
    try {
      const own = createClient(URL!, KEY!, { auth: { storage, persistSession: true, autoRefreshToken: false } });
      const res = await own.rpc('send_invite', { p_to: y.id, p_idea: 'boba_run', p_starts_at: new Date(Date.now() + 60 * MIN).toISOString(), p_place: '', p_note: '' });
      assert.equal((res.error as { code?: string } | null)?.code, 'PL068', `the ask was not refused for want of a link: ${JSON.stringify(res.error)}`);
    } finally {
      sql(`delete from auth.users where id = '${anonId}'`);
    }
  });
} else {
  gap('G4', 'an anonymous account can send an ask', async () => {
    const res = await raw.rpc('send_invite', { p_to: y.id, p_idea: 'boba_run', p_starts_at: new Date(Date.now() + 60 * MIN).toISOString(), p_place: '', p_note: '' });
    assert.ok(res.error, 'the ask was sent');
  });
}

// Needs email sign-in switched on, which the local stack has and a project without a mail sender
// does not; there the answer says nothing either way.
if (process.env.E2E_MAILBOX) {
  test('G22 closed for the app (D091): the code request answers the same for any address', async () => {
    if (withDb) sql('delete from private.auth_code_requests');
    const ask = async (email: string) => {
      const res = await fetch(`${URL}/functions/v1/auth-code`, {
        method: 'POST', headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'email', address: email, mode: 'sign_in' }),
      });
      return `${res.status} ${await res.text()}`;
    };
    const known = withDb ? sql(`select email from auth.users where email like 'e2e-%' and not is_anonymous limit 1`) : '';
    const answers = [await ask(`nobody-${Date.now()}@example.com`), ...(known ? [await ask(known)] : [])];
    assert.ok(answers.every((a) => a === '200 {"sent":true}'), `the answers differ: ${answers.join(' | ')}`);
    // Too many addresses from one caller wait, whoever they belong to.
    const many = [];
    for (let i = 0; i < 12; i++) many.push((await ask(`probe-${i}-${Date.now()}@example.com`)).split(' ')[0]);
    assert.ok(many.includes('429'), 'probing many addresses is slowed down');
    if (withDb) sql('delete from private.auth_code_requests');
  });

  // Still open while Auth's captcha is off (it is off on the local stack and until the Turnstile
  // secret exists): Auth itself, called directly, answers differently. D091; OPERATIONS.md, "Captcha".
  gap('G22', 'Auth, called directly, says whether an email address has an account', async () => {
    const res = await signedOut.auth.signInWithOtp({ email: `nobody-${Date.now()}@example.com`, options: { shouldCreateUser: false } });
    assert.equal(res.error, null, `the answer gives it away: ${res.error?.message}`);
  });
}

test('G24 closed (D093): a listener on every table hears no delete, so no one learns an account went away', async () => {
  const heard: string[] = [];
  const feed = raw.channel('attacker-feed');
  for (const table of ['profiles', 'duos', 'invites', 'trust_scores', 'feed_nudges']) {
    feed.on('postgres_changes', { event: '*', schema: 'public', table }, (p) => heard.push(`${p.eventType} ${table}`));
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('the feed never started')), 15_000);
    feed.on('system', {}, (p: { extension?: string; status?: string }) => {
      if (p.extension === 'postgres_changes' && p.status === 'ok') {
        clearTimeout(timer);
        resolve();
      }
    });
    feed.subscribe();
  });
  // Someone X has never met joins, then deletes their account.
  const z = person('TestZara');
  await z.backend.boot();
  await z.backend.completeOnboarding(profile(z.name, '@e2e_zara'));
  await z.backend.deleteAccount();
  await new Promise((r) => setTimeout(r, 4000));
  await raw.removeChannel(feed);
  assert.deepEqual(heard.filter((h) => h.startsWith('DELETE')), [], 'X heard a delete');
});

// Last, because it moves X out of Y's city (D083).
test('moving city: an area from the new city, once a week, and no direct writes', async () => {
  await assert.rejects(x.backend.updateMe({ city: 'Delhi NCR' }), (e: unknown) => e instanceof AppError && e.code === 'PL095', 'a Mumbai area following X to Delhi NCR');
  const moved = await x.backend.updateMe({ city: 'Delhi NCR', area: 'Saket' });
  assert.equal(moved.me?.city, 'Delhi NCR', 'the first move is free');
  await assert.rejects(x.backend.updateMe({ city: 'Pune', area: 'Koregaon Park' }), (e: unknown) => e instanceof AppError && e.code === 'PL105', 'a second move in the same week');
  assert.ok((await raw.from('profiles').update({ city_changed_at: null }).eq('id', x.id).select('id')).error, 'a direct write to the move clock');
});

test('an area of my own: a place name, never a contact (D087)', async () => {
  await assert.rejects(x.backend.updateMe({ area: 'call 98765 43210' }), (e: unknown) => e instanceof AppError && e.code === 'PL065', 'a number as the area');
  await assert.rejects(x.backend.updateMe({ area: 'Saket!!' }), (e: unknown) => e instanceof AppError && e.code === 'PL106', 'symbols as the area');
  const named = await x.backend.updateMe({ area: 'Saket Extension' });
  assert.equal(named.me?.area, 'Saket Extension', 'a plain name of my own saves');
});

test('photos (D088): no direct upload, no rule-skipping, and no one else\'s file', async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  // Straight into the bucket, under my own folder and under Y's.
  for (const path of [`${x.id}/mine.jpg`, `${y.id}/theirs.jpg`]) {
    const up = await raw.storage.from('photos').upload(path, jpeg, { contentType: 'image/jpeg' });
    assert.ok(up.error, `a direct upload to ${path.split('/')[0] === x.id ? 'my' : 'their'} folder must be refused`);
  }
  // The rules and the row are the photo function's only.
  refused(await raw.rpc('add_photo', { p_user: x.id, p_bytes: 4, p_jpeg: true }), 'calling add_photo myself');
  refused(await raw.rpc('add_photo', { p_user: x.id, p_bytes: 4, p_jpeg: true, p_kind: 'face' }), 'calling add_photo myself for a face (D095)');
  refused(await raw.from('photos').update({ kind: 'face' }).eq('profile_id', x.id).select('id'), 'turning a photo behind the lock into a face');
  refused(await raw.from('photos').insert({ profile_id: x.id, path: `${x.id}/x.jpg`, bytes: 4 }), 'writing a photo row');
  refused(await raw.from('photo_trash').select('*'), 'reading the photo trash');
  // The function wants a real session, and a real JPEG.
  const anon = await fetch(`${URL}/functions/v1/photo`, { method: 'POST', headers: { apikey: KEY!, Authorization: `Bearer ${KEY}` }, body: jpeg });
  assert.equal(anon.status, 401, 'the anon key is not a person');
  const token = (await raw.auth.getSession()).data.session!.access_token;
  const text = await fetch(`${URL}/functions/v1/photo`, { method: 'POST', headers: { apikey: KEY!, Authorization: `Bearer ${token}` }, body: '@e2e_xavier' });
  assert.equal(((await text.json()) as { code?: string }).code, 'PL107', 'text sent as a photo is refused');
  // Signing a link to a file whose row I cannot read gives nothing.
  const link = await raw.storage.from('photos').createSignedUrl(`${y.id}/anything.jpg`, 60);
  assert.ok(link.error || !link.data?.signedUrl, 'no link to a file I may not read');
});

test('Self love (D101): mine alone, over the API too', async () => {
  await y.backend.addSelfNote('journal', 'e2e private journal line');
  await y.backend.saveMood('low');
  // The tables are in `private`, which PostgREST does not serve; the functions answer about the caller only.
  refused(await raw.schema('private' as 'public').from('self_notes').select('*'), 'reading the notes table');
  refused(await raw.schema('private' as 'public').from('self_love').insert({ user_id: y.id, paused_until: new Date(Date.now() + 864e5).toISOString() }), 'pausing Y directly');
  const mine = await raw.rpc('my_self_love');
  assert.ok(!JSON.stringify(mine.data ?? {}).includes('e2e private journal line'), 'X\'s own Self love never carries Y\'s notes');
  const yNotes = await y.backend.selfLove();
  refused(await raw.rpc('remove_self_note', { p_id: Number(yNotes.notes[0].id) }), 'removing Y\'s note');
  assert.equal((await y.backend.selfLove()).notes.length, 1, 'Y\'s note is still there');
  refused(await signedOut.rpc('my_self_love'), 'signed out, there is no Self love to read');
  await assert.rejects(x.backend.pauseDiscover(30), (e: unknown) => e instanceof AppError && e.code === 'PL121', 'a pause is 1 to 14 days');
});

test('Spicy mode (D103): nothing of anyone else\'s, over the API too', async () => {
  // The tables are in `private`, which PostgREST does not serve.
  refused(await raw.schema('private' as 'public').from('spicy').select('*'), 'reading the Spicy table');
  refused(await raw.schema('private' as 'public').from('spicy').insert({ user_id: y.id, discord: 'planted', adult_at: new Date().toISOString(), rules_at: new Date().toISOString() }), 'turning Spicy on for Y');
  refused(await raw.schema('private' as 'public').from('spicy_yes').select('*'), 'reading anyone\'s yes');
  // A phone number never goes in as a username, whoever asks.
  await assert.rejects(x.backend.saveSpicy({ adult: true, rules: true, discord: '+91 98765 43210', telegram: '', signal: '', boundaries: [] }),
    (e: unknown) => e instanceof AppError && ['PL123', 'PL128', 'PL154'].includes(e.code), 'no phone number as a username');
  // Someone I was never shown, and share nothing with, is closed and cannot be said yes to.
  const closed = await raw.rpc('spicy_with', { p_other: '00000000-0000-0000-0000-000000000000' });
  assert.deepEqual(closed.data, { open: false }, 'a stranger says nothing');
  await assert.rejects(x.backend.spicyYes('00000000-0000-0000-0000-000000000000', true), (e: unknown) => e instanceof AppError && e.code === 'PL130', 'and takes no yes');
  refused(await signedOut.rpc('my_spicy'), 'signed out, there is no Spicy to read');
});

test('Spicy terms and quiz (D107): no pass without the right answers, over the API too', async () => {
  const miss = await x.backend.passSpicyQuiz(1, true, ['a', 'a', 'a', 'a', 'a']);
  assert.equal(miss.passed, false, 'wrong answers do not pass');
  assert.equal((await x.backend.spicyTerms()).passed, false, 'and nothing was kept');
  await assert.rejects(x.backend.passSpicyQuiz(0, true, ['b', 'c', 'a', 'b', 'c']), (e: unknown) => e instanceof AppError && e.code === 'PL155', 'not for old terms');
  await assert.rejects(x.backend.passSpicyQuiz(1, false, ['b', 'c', 'a', 'b', 'c']), (e: unknown) => e instanceof AppError && e.code === 'PL156', 'not without the yes');
  // The pass is a consent row, which no client may write, and give_consents does not take it.
  refused(await raw.from('consents').insert({ user_id: x.id, kind: 'spicy', version: 'spicy-1' }), 'writing a pass by hand');
  refused(await raw.rpc('give_consents', { p_kinds: ['spicy'] }), 'giving a pass as a consent');
  refused(await raw.rpc('spicy_quiz_key' as 'spicy_terms'), 'reading the answer key');
});

test('The wallet (D104, D105): no credits from nowhere, nothing of anyone else\'s, over the API too', async () => {
  refused(await raw.schema('private' as 'public').from('wallets').select('*'), 'reading any wallet');
  refused(await raw.schema('private' as 'public').from('wallets').insert({ user_id: x.id, paid: 2000 }), 'crediting myself');
  refused(await raw.schema('private' as 'public').from('wallet_ledger').select('*'), 'reading the ledger');
  refused(await raw.schema('private' as 'public').from('spicy_unlocks').select('*'), 'reading the Spicy unlocks');
  // Only the Edge Function (service role) may open or pay an order, or use a voucher.
  refused(await raw.rpc('wallet_open_order', { p_user: x.id, p_pack: 'p49', p_order: 'order_attack1' }), 'opening an order');
  refused(await raw.rpc('wallet_paid', { p_order: 'order_attack1', p_payment: 'pay_attack1', p_paise: 4900 }), 'saying an order was paid');
  refused(await raw.rpc('wallet_refunded', { p_payment: 'pay_attack1' }), 'refunding');
  refused(await raw.rpc('redeem_treat', { p_partner: 'any', p_code: 'ABCDEFGH' }), 'using a voucher');
  await assert.rejects(x.backend.stakePlan('00000000-0000-0000-0000-000000000000'), (e: unknown) => e instanceof AppError && e.code === 'PL135', 'no stake on a plan that is not mine');
  await assert.rejects(x.backend.spicyPay(y.id, 'full'), (e: unknown) => e instanceof AppError && e.code === 'PL130', 'no paying for usernames Spicy does not open');
  refused(await signedOut.rpc('my_wallet'), 'signed out, there is no wallet to read');
});
