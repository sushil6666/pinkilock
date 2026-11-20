/**
 * Photos behind the lock over the network (D088, build plan WP7b): the app's own backend adds a
 * photo through the `photo` Edge Function into real Storage; the file comes back without its
 * metadata; nobody else sees it until a moderator approves it, and then only someone who kept a
 * promise with its owner; removing it closes it at once, and its file is deleted.
 *
 * Needs E2E_DB_URL (to moderate, as a person would with scripts/moderate.sh, and to stand in for a
 * kept promise). Runs with npm run test:live:local.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../src/domain/errors';
import { KEY, URL, person, profile, type Person } from './helpers';

const DB = process.env.E2E_DB_URL;
const sql = (q: string): string => execFileSync('psql', [DB!, '-v', 'ON_ERROR_STOP=1', '-qtA', '-c', q], { encoding: 'utf8' }).trim();
const plain = readFileSync(join(__dirname, '..', 'unit', 'fixtures', 'exif_gps_baseline.jpg'));
// Text in a quantisation table nobody uses: valid JPEG, not metadata, so only drawing the picture
// again (D098) takes it out.
const fixture = Buffer.concat([plain.subarray(0, 2), Buffer.from([0xff, 0xdb, 0x00, 67, 0x03]),
  Buffer.concat([Buffer.from('@in_the_picture', 'latin1'), Buffer.alloc(64)]).subarray(0, 64).map((b) => b || 1), plain.subarray(2)]);
const asUri = (bytes: Buffer, type = 'image/jpeg') => `data:${type};base64,${bytes.toString('base64')}`;
const has = (bytes: Uint8Array, text: string) => Buffer.from(bytes).includes(Buffer.from(text, 'latin1'));

const owner = person('TestPia');
const met = person('TestMeera');
const stranger = person('TestSahil');
let inviteId = '';

const raw = (p: Person): SupabaseClient => createClient(URL!, KEY!, { auth: { storage: p.storage, persistSession: true, autoRefreshToken: false } });

before(async () => {
  for (const [p, handle] of [[owner, '@e2e_pia'], [met, '@e2e_meera'], [stranger, '@e2e_sahil']] as const) {
    await p.backend.boot();
    p.id = (await p.backend.completeOnboarding(profile(p.name, handle))).me!.id;
  }
});

after(() => {
  const list = [owner, met, stranger].map((p) => p.id).filter(Boolean).map((id) => `'${id}'`).join(', ');
  if (DB && list) {
    sql(`delete from public.events where actor_id in (${list}) or invite_id in (select id from public.invites where from_id in (${list}) or to_id in (${list}));
         delete from auth.users where id in (${list});`);
  }
  // The clients keep timers and sockets open, as in the other live tests: leave when done.
  setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref();
});

test('a photo goes in through the function, without its metadata, and waits for a person', { skip: !DB }, async () => {
  const mine = await owner.backend.addPhoto({ uri: asUri(fixture) });
  assert.equal(mine.length, 1);
  assert.equal(mine[0].status, 'pending');
  assert.ok(mine[0].url, 'the owner gets a link to their own file');
  const file = new Uint8Array(await (await fetch(mine[0].url!)).arrayBuffer());
  assert.deepEqual([...file.subarray(0, 4)], [0xff, 0xd8, 0xff, 0xe0], 'a JPEG with a plain JFIF header');
  for (const t of ['Exif', 'PhoneMaker', 'secret comment', '@handle']) assert.ok(!has(file, t), `${t} was stripped on the server`);
  assert.ok(has(fixture, '@in_the_picture') && !has(file, '@in_the_picture'), 'the picture was drawn again on the server');
  assert.ok(Number(sql(`select bytes from public.photos where id = '${mine[0].id}'`)) === file.length, 'the row records the stored size');

  await assert.rejects(owner.backend.addPhoto({ uri: asUri(Buffer.from('@e2e_pia, my handle'), 'text/plain') }),
    (e) => e instanceof AppError && e.code === 'PL107', 'text is not a photo');
});

test('nobody else sees it until it is approved, and then only someone who kept a promise', { skip: !DB }, async () => {
  const [photo] = await owner.backend.myPhotos();
  const path = sql(`select path from public.photos where id = '${photo.id}'`);
  const seen = async (p: Person) => {
    const rows = await raw(p).from('photos').select('id').eq('profile_id', owner.id);
    const link = await raw(p).storage.from('photos').createSignedUrl(path, 60);
    return { rows: rows.data?.length ?? 0, link: !!link.data?.signedUrl };
  };
  // A kept promise between the owner and `met`, as the check-in would leave it.
  inviteId = sql(`insert into public.invites (from_id, to_id, idea_id, minutes, starts_at, expires_at, place, status, check_ins)
    values ('${met.id}', '${owner.id}', 'boba_run', 25, now() - interval '1 hour', now() - interval '1 day', 'Carter Road', 'kept', array['${met.id}', '${owner.id}']::uuid[])
    returning id`).split('\n')[0];

  assert.deepEqual(await seen(met), { rows: 0, link: false }, 'pending: not even after a kept promise');
  sql(`select private.moderate_photo('${photo.id}', 'approve_photo', 'e2e: ordinary')`);
  assert.deepEqual(await seen(met), { rows: 1, link: true }, 'approved: shown to someone who kept a promise');
  assert.deepEqual(await seen(stranger), { rows: 0, link: false }, 'never to someone who did not');

  const reveal = await met.backend.getReveal(inviteId, owner.id);
  assert.equal(reveal.photos.length, 1, 'the reveal carries the approved photo');
  const res = await fetch(reveal.photos[0].url!);
  assert.equal(res.status, 200, 'and its link opens');
});

test('removing it closes it at once, and its file is deleted', { skip: !DB }, async () => {
  const [photo] = await owner.backend.myPhotos();
  const path = sql(`select path from public.photos where id = '${photo.id}'`);
  assert.deepEqual(await owner.backend.removePhoto(photo.id), []);
  assert.equal((await met.backend.getReveal(inviteId, owner.id)).photos.length, 0, 'gone from the reveal');
  await assert.rejects(met.backend.removePhoto(photo.id), (e) => e instanceof AppError && e.code === 'PL110');

  // The push function empties the trash when Postgres wakes it (only where it has its secret,
  // which tests/live/local_push.sh's set-up gives the local stack).
  if (sql(`select count(*) from vault.decrypted_secrets where name = 'push_function_secret'`) === '0') return;
  sql('select public.kick_push()');
  for (let i = 0; i < 30 && sql(`select count(*) from public.photo_trash where path = '${path}'`) !== '0'; i++) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.equal(sql(`select count(*) from public.photo_trash where path = '${path}'`), '0', 'the trash entry is cleared');
  assert.equal(sql(`select count(*) from storage.objects where bucket_id = 'photos' and name = '${path}'`), '0', 'and the file is gone from Storage');
});

test('a face (D095): through the same function, shown once approved to whoever is shown the card', { skip: !DB }, async () => {
  const [mine] = await owner.backend.addFace({ uri: asUri(fixture) });
  assert.equal(mine.status, 'pending');
  assert.equal((await owner.backend.myPhotos()).length, 0, 'the face is not one of the photos behind the lock');
  await assert.rejects(owner.backend.addFace({ uri: asUri(fixture) }), (e) => e instanceof AppError && e.code === 'PL113', 'one waits at a time');
  const faceOf = async (p: Person) => (await p.backend.boot()).profiles.find((c) => c.id === owner.id)?.faceUrl ?? null;
  assert.equal(await faceOf(met), null, 'pending: not on the card yet');

  sql(`select private.moderate_photo('${mine.id}', 'approve_photo', 'e2e: ordinary')`);
  const link = await faceOf(met);
  assert.ok(link, 'approved: on the card for someone who shares a plan with its owner');
  assert.equal((await fetch(link!)).status, 200, 'and its link opens');
  // The stranger booted in the same city, so Discover handed them the owner's card: they may see it.
  const strangerSees = async () => (await raw(stranger).from('photos').select('id').eq('profile_id', owner.id)).data?.length ?? 0;
  assert.equal(sql(`select count(*) from private.discover_seen where user_id = '${stranger.id}' and card_id = '${owner.id}'`), '1', 'Discover showed the stranger the card');
  assert.equal(await strangerSees(), 1, 'so the stranger sees the face on it');
  sql(`delete from private.discover_seen where user_id = '${stranger.id}' and card_id = '${owner.id}'`);
  assert.equal(await strangerSees(), 0, 'never for someone who was not shown the card');
  await assert.rejects(owner.backend.addFace({ uri: asUri(fixture) }), (e) => e instanceof AppError && e.code === 'PL114', 'a new one once a week');

  assert.deepEqual(await owner.backend.removeFace(mine.id), [], 'the owner takes it down');
  assert.equal(await faceOf(met), null, 'and the card is drawn again');
});
