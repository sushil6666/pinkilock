-- The live feed carries no deletes (G24, D093), after auth_codes.sql. P and Q are a duo, R is
-- someone else, S deletes their account with a plan with P on it.
\set ON_ERROR_STOP on
\pset tuples_only on
\set p '00000000-0000-0000-0000-0000000b0001'
\set q '00000000-0000-0000-0000-0000000b0002'
\set r '00000000-0000-0000-0000-0000000b0003'
\set s '00000000-0000-0000-0000-0000000b0004'
insert into auth.users (id) values (:'p'), (:'q'), (:'r'), (:'s');
insert into public.profiles (id, name, age, area) values (:'p', 'Pia', 25, 'Bandra'), (:'q', 'Quinn', 24, 'Bandra'), (:'r', 'Rhea', 26, 'Juhu'), (:'s', 'Sam', 27, 'Khar');
insert into public.duos (person, partner) values (:'p', :'q'), (:'q', :'p');
insert into public.invites (from_id, to_id, idea_id, minutes, starts_at, expires_at, place, status)
  values (:'s', :'p', 'boba_run', 25, now() - interval '2 days', now() - interval '3 days', 'Carter Road', 'kept');

select t.ok((select not pubdelete and pubinsert and pubupdate from pg_publication where pubname = 'supabase_realtime'), 'the feed sends inserts and updates, never a delete');
select t.ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'feed_nudges'), 'nudges are on the feed');
select t.ok((select count(*) from public.feed_nudges where person in (:'p', :'q', :'r', :'s')) = 0, 'nobody here has been nudged yet');

set role authenticated;
select t.as_user(:'p');
select leave_duo();
reset role;
select t.ok((select array_agg(person order by person) from public.feed_nudges where person in (:'p', :'q', :'r', :'s')) = array[:'p'::uuid, :'q'::uuid], 'leaving a duo nudges both people');

set role authenticated;
select t.as_user(:'q');
select t.ok((select array_agg(person) from feed_nudges) = array[:'q'::uuid], 'Q sees only their own nudge');
select t.ok(t.fails($$update feed_nudges set at = now()$$) and t.fails(format($$insert into feed_nudges (person) values (%L)$$, :'r')), 'and can write none');
select t.as_user(:'r');
select t.ok((select count(*) from feed_nudges) = 0, 'R sees nobody''s');
select t.as_user(:'s');
select delete_my_account();
reset role;
select t.ok(exists (select 1 from public.feed_nudges where person = :'p' and at > now() - interval '1 minute') and not exists (select 1 from public.feed_nudges where person = :'s'),
  'an account deleted with a plan on it nudges the other person, and keeps no row of its own');
select t.ok((select count(*) from public.feed_nudges where person = :'r') = 0, 'nobody else is nudged');
