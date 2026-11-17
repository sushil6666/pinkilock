-- Walks three people through the promise state machine as real API users (role authenticated,
-- auth.uid() set), checking RLS and the functions at each step. Any failure stops psql.
\set ON_ERROR_STOP on
\pset tuples_only on
\set a '00000000-0000-0000-0000-00000000000a'
\set b '00000000-0000-0000-0000-00000000000b'
\set c '00000000-0000-0000-0000-00000000000c'

insert into auth.users (id) values (:'a'), (:'b'), (:'c');
insert into public.profiles (id, name, age, area, created_at) values
  (:'a', 'Asha', 22, 'Bandra', now() - interval '15 days'),
  (:'b', 'Bela', 23, 'Khar', now() - interval '15 days'),
  (:'c', 'Chirag', 24, 'Juhu', now() - interval '1 day');
insert into public.profile_private (profile_id, contact_kind, contact_handle) values
  (:'a', 'Instagram', '@asha'), (:'b', 'Instagram', '@bela'), (:'c', 'Snapchat', 'chirag');

-- The clock is scheduled by a migration, not by hand.
select t.ok((select (schedule, command) = ('* * * * *', 'select public.sweep_invites()') from cron.job where jobname = 'pinkilock-sweep'),
  'sweep_invites is scheduled every minute');

-- The analytics worker's role: exactly these table rights, nothing that a later migration slipped in.
select t.ok((select string_agg(table_schema || '.' || table_name || ':' || privs, ' ' order by table_schema, table_name) from (
    select table_schema, table_name, string_agg(privilege_type, ',' order by privilege_type) as privs
    from information_schema.role_table_grants where grantee = 'pinkilock_analytics' group by 1, 2) g)
  = 'analytics.metrics_daily:DELETE,INSERT,SELECT,UPDATE analytics.retention_weekly:DELETE,INSERT,SELECT,UPDATE '
    'public.events:SELECT public.invites:SELECT public.profiles:SELECT public.trust_scores:DELETE,INSERT,SELECT,UPDATE',
  'the analytics role reads events, invites, profiles and writes only its own results');
select t.ok(not has_table_privilege('pinkilock_analytics', 'public.profile_private', 'select'), 'the analytics role cannot read contact handles');

-- Signed out (anon) there is nothing: no table, no function.
set role anon;
select t.ok(t.fails('select count(*) from profiles'), 'anon cannot read profiles');
select t.ok(t.fails('select count(*) from ideas'), 'anon cannot read the catalogue');
select t.ok(t.fails($$select log_event('app_open')$$), 'anon cannot call a function');
reset role;

set role authenticated;
select t.ok(t.fails('truncate passes'), 'a signed-in user cannot truncate a table');
select t.ok(t.fails($$delete from ideas where id = 'boba_run' returning 1/0$$), 'a signed-in user cannot delete from the catalogue');
select t.ok((select count(*) from ideas) = 38 and exists (select 1 from ideas where id = 'thrift_dare') and exists (select 1 from ideas where id = 'rizz_off'), 'the catalogue has all 38 ideas, old and new');

-- A: sees every card, only their own private row, cannot write invites or read events directly.
select t.as_user(:'a');
select t.ok((select count(*) from profile_cards) = 3, 'A reads all three cards');
select t.ok((select count(*) from profile_private) = 1, 'A reads only their own private row');
select t.ok(t.fails($$insert into invites (from_id, to_id, idea_id, starts_at, minutes, expires_at)
  values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'boba_run', now() + interval '1 hour', 25, now() + interval '1 hour')$$),
  'A cannot insert an invite directly');
select t.ok(t.fails('select count(*) from events'), 'A cannot read the event log');
select t.ok(t.fails($$update profiles set name = 'Hacked' where id = '00000000-0000-0000-0000-00000000000b' returning 1/0$$) is not null
  and (select name from profiles where id = :'b') = 'Bela', 'A cannot edit B''s profile');
select t.ok(t.fails('select sweep_invites()'), 'A cannot run the sweep');
select log_event('app_open');

-- A asks B. Receiver goes first, sender seals.
select (send_invite(:'b', 'boba_run', now() + interval '1 hour', ' Linking Road ', 'taro or nothing')).id as ab \gset
select t.ok(t.fails(format('select offer_pinky(%L)', :'ab')), 'sender cannot go first');
select t.ok(t.fails(format($$select send_invite(%L, 'chai_walk', now() + interval '2 hours', '', '')$$, :'b')), 'one live invite per pair');

select t.as_user(:'c');
select t.ok((select count(*) from invites) = 0, 'C cannot see an invite between A and B');
select t.ok(t.fails(format('select offer_pinky(%L)', :'ab')), 'C cannot lock someone else''s invite');

select t.as_user(:'b');
select log_event('app_open');
select t.ok((offer_pinky(:'ab')).status = 'half_locked', 'B puts a pinky out: half_locked');
select t.as_user(:'a');
select t.ok((offer_pinky(:'ab')).status = 'locked', 'A seals: locked');
select t.ok((select count(*) from profile_private) = 1, 'locked is not enough: B''s contact still hidden from A');
select t.ok(t.fails(format('select check_in(%L)', :'ab')), 'check-in is closed an hour early');

reset role;
update public.invites set starts_at = now() + interval '5 minutes' where id = :'ab';
set role authenticated;

select t.as_user(:'a');
select t.ok((check_in(:'ab')).status = 'locked', 'A checks in: still locked until B does');
select t.ok((select count(*) from profile_private) = 1, 'one check-in is not enough for the reveal');
select t.as_user(:'b');
select t.ok((check_in(:'ab')).status = 'kept', 'B checks in: kept');
select t.ok((select count(*) from profile_private where profile_id = :'a') = 1, 'THE REVEAL: B can now read A''s contact');
select t.as_user(:'a');
select t.ok((select contact_handle from profile_private where profile_id = :'b') = '@bela', 'THE REVEAL: A can now read B''s contact');
select t.as_user(:'c');
select t.ok((select count(*) from profile_private) = 1, 'C still reads only their own private row');

-- A asks C, both lock, A bails inside two hours: a late bail on A.
select t.as_user(:'a');
select (send_invite(:'c', 'video_coffee', now() + interval '1 hour', '', '')).id as ac \gset
select t.as_user(:'c');
select offer_pinky(:'ac') is not null;
select t.as_user(:'a');
select offer_pinky(:'ac') is not null;
select t.ok((bail(:'ac')).flaked_by = :'a', 'A bails: flaked, on A');
select t.ok((select count(*) from profile_private) = 2, 'a flake reveals nothing new (A still sees only self and B)');

-- C asks A, both lock, only C checks in, the window closes: a no-show on A.
select t.as_user(:'c');
select (send_invite(:'a', 'word_race', now() + interval '1 hour', '', '')).id as ca \gset
select t.as_user(:'a');
select offer_pinky(:'ca') is not null;
select t.as_user(:'c');
select offer_pinky(:'ca') is not null;
reset role;
update public.invites set starts_at = now() + interval '5 minutes' where id = :'ca';
set role authenticated;
select check_in(:'ca') is not null;
-- B asks C and nobody answers.
select t.as_user(:'b');
select (send_invite(:'c', 'meme_duel', now() + interval '3 hours', '', '')).id as bc \gset

reset role;
update public.invites set starts_at = now() - interval '1 hour' where id = :'ca';
update public.invites set expires_at = now() - interval '1 minute' where id = :'bc';
select t.ok(public.sweep_invites() = 2, 'sweep resolves the expired ask and the missed check-in');
select t.ok((select status = 'expired' from public.invites where id = :'bc'), 'unanswered ask expired');
select t.ok((select status = 'flaked' and flaked_by = :'a' from public.invites where id = :'ca'), 'missed window is a flake on A, who did not check in');
select t.ok((select count(*) from public.events where type = 'no_show' and actor_id = :'a') = 1, 'no_show logged for A');
select t.ok((select (props ->> 'late')::boolean from public.events where type = 'bailed'), 'the bail is logged as late');
