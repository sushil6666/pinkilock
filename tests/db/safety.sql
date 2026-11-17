-- Blocking and reporting, after scenario.sql and push.sql. At this point A and B have a kept
-- promise (so each can read the other's contact) and a locked plan (B asked A, chai walk, check-in
-- open, B checked in). A and C have two flakes between them.
\set ON_ERROR_STOP on
\pset tuples_only on
\set a '00000000-0000-0000-0000-00000000000a'
\set b '00000000-0000-0000-0000-00000000000b'
\set c '00000000-0000-0000-0000-00000000000c'

select id as ba from public.invites where from_id = :'b' and to_id = :'a' and status = 'locked' \gset
select count(*) as events_before from public.events where type in ('bailed', 'no_show', 'declined') \gset

-- Who blocked whom is not something the API can be asked.
select t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'blocked_pair'),
  'the block check lives outside the API schema');

-- Before: A sees B everywhere.
set role authenticated;
select t.as_user(:'a');
select t.ok((select count(*) from profile_cards where id = :'b') = 1, 'before: A sees B''s card');
select t.ok((select count(*) from invites where :'b' in (from_id, to_id)) = 2, 'before: A sees both invites with B');
select t.ok((select contact_handle from profile_private where profile_id = :'b') = '@bela', 'before: A reads B''s contact (kept promise)');
select t.ok(t.fails(format('select block_user(%L)', :'a')), 'nobody can block themselves');
select t.ok(t.fails('select count(*) from blocks'), 'a user cannot read the blocks table');
select t.ok(t.fails(format($$insert into blocks values (%L, %L)$$, :'a', :'c')), 'a user cannot write the blocks table directly');

-- B blocks A.
select t.as_user(:'b');
select block_user(:'a');
select block_user(:'a');
select t.ok((select count(*) from profile_cards where id = :'a') = 0, 'B no longer sees A in Discover');
select t.ok((select count(*) from profiles where id = :'a') = 0, 'B cannot read A''s profile row');
select t.ok((select count(*) from trust_scores where profile_id = :'a') = 0, 'B cannot read A''s score');
select t.ok((select count(*) from invites where :'a' in (from_id, to_id)) = 0, 'B cannot read any invite with A');
select t.ok((select count(*) from profile_private where profile_id = :'a') = 0, 'THE REVEAL closes: B cannot read A''s contact');
select t.ok((select count(*) from profile_cards where id = :'c') = 1, 'B still sees C');
select t.ok((select string_agg(name, ',') from my_blocks()) = 'Asha', 'B''s block list shows A');

-- A, the blocked one, loses the same things, through RLS.
select t.as_user(:'a');
select t.ok((select count(*) from profile_cards where id = :'b') = 0, 'A no longer sees B in Discover');
select t.ok((select count(*) from invites where :'b' in (from_id, to_id)) = 0, 'A loses access to every invite shared with B');
select t.ok((select count(*) from profile_private where profile_id = :'b') = 0, 'THE REVEAL closes for A too');
select t.ok(t.fails(format('select check_in(%L)', :'ba')), 'A cannot act on the plan with B any more');
select t.ok(t.fails(format($$select send_invite(%L, 'boba_run', now() + interval '2 hours', '', '')$$, :'b')), 'A cannot ask B');
select t.ok((select count(*) from my_blocks()) = 0, 'A cannot see that B blocked them');
select unblock_user(:'b');

select t.as_user(:'c');
select t.ok((select count(*) from profile_cards where id in (:'a', :'b')) = 2, 'C still sees both');
reset role;

-- The live plan ended for nobody's fault, and nothing is left to push about it.
select t.ok((select status = 'ended' and resolved_at is not null and flaked_by is null from public.invites where id = :'ba'), 'the live plan ended');
select t.ok((select status from public.invites where from_id = :'a' and to_id = :'b') = 'kept', 'the finished promise stays kept');
select t.ok((select count(*) from public.events where type in ('bailed', 'no_show', 'declined')) = :events_before, 'a block logs no bail, no-show or decline');
select t.ok((select actor_id is null and props ->> 'reason' = 'block' from public.events where type = 'ended' and invite_id = :'ba'), 'the end is logged with no actor');
select t.ok((select count(*) from public.notifications where invite_id = :'ba' and sent_at is null) = 0, 'unsent pushes about the ended plan are dropped');
select t.ok(not exists (select 1 from public.notifications where invite_id = :'ba' and kind not in ('new_ask', 'pinky_out', 'locked', 'checkin_open')),
  'ending a plan by a block announces nothing');
select public.sweep_invites() is not null;
select t.ok((select status from public.invites where id = :'ba') = 'ended', 'the sweep leaves an ended plan alone');
select t.ok(exists (select 1 from public.blocks where blocker_id = :'b' and blocked_id = :'a'), 'A cannot lift a block B made');

-- Reports: written by the function only, readable by no client, and they block.
select id as ac from public.invites where from_id = :'a' and to_id = :'c' limit 1 \gset
set role authenticated;
select t.as_user(:'c');
select t.ok(t.fails(format($$select report_user(%L, 'rude', '')$$, :'a')), 'an unknown reason is refused');
select t.ok(t.fails(format($$select report_user(%L, 'other', repeat('x', 501))$$, :'a')), 'a detail over 500 characters is refused');
select t.ok(t.fails(format($$insert into reports (reporter_id, reported_id, reason) values (%L, %L, 'other')$$, :'c', :'a')), 'a user cannot insert a report directly');
select report_user(:'a', 'harassment', ' kept messaging after I passed ', :'ac');
select t.ok(t.fails('select count(*) from reports'), 'the reporter cannot read reports');
select t.ok((select count(*) from profile_cards where id = :'a') = 0, 'reporting also blocks');
select t.as_user(:'a');
select t.ok(t.fails('select count(*) from reports'), 'the reported person cannot read reports');
select t.ok((select count(*) from invites where :'c' in (from_id, to_id)) = 0, 'A loses the invites with C as well');
set role anon;
select t.ok(t.fails('select count(*) from reports'), 'anon cannot read reports');
select t.ok(t.fails(format($$select report_user(%L, 'other', '')$$, :'a')), 'anon cannot report');
reset role;
set role service_role;
select t.ok(t.fails('select count(*) from reports'), 'not even the service role can read reports');
reset role;
select t.ok((select (reporter_id, reported_id, invite_id, reason, detail) = (:'c'::uuid, :'a'::uuid, :'ac'::uuid, 'harassment', 'kept messaging after I passed')
  from public.reports), 'the report is stored, trimmed, with the shared invite attached');

-- An invite the two do not share is not attached; and there is a daily cap.
insert into public.reports (reporter_id, reported_id, reason) select :'b', :'c', 'other' from generate_series(1, 9);
set role authenticated;
select t.as_user(:'b');
select report_user(:'c', 'fake', '', :'ac');
select t.ok(t.fails(format($$select report_user(%L, 'fake', '')$$, :'c')), 'more than 10 reports a day are refused');
reset role;
select t.ok((select invite_id is null from public.reports where reporter_id = :'b' and reason = 'fake'), 'an invite the two do not share is not attached');

-- B lifts the block on A: they see each other again, the kept promise reopens the reveal, the
-- ended plan stays ended.
set role authenticated;
select t.as_user(:'b');
select unblock_user(:'a');
select t.ok((select count(*) from profile_cards where id = :'a') = 1, 'after unblocking, B sees A again');
select t.ok((select count(*) from profile_private where profile_id = :'a') = 1, 'after unblocking, the kept reveal is back');
select t.ok((select status from invites where id = :'ba') = 'ended', 'after unblocking, the ended plan stays ended');
reset role;
