-- The attacker suite (docs/build-plan.md, WP0). Runs last, on its own people: X the attacker, Y
-- and Z ordinary users, and a crowd of 220. X is a signed-in user with a modified app: they call
-- tables and functions directly and ignore every rule the screens enforce.
--
-- Two kinds of line:
--   t.ok(...)   a defence that holds today. It failing means a change opened a hole.
--   t.gap(...)  a known hole from the plan's gap table, written as the defence that should hold.
--               It prints "gap Gn open". The day the defence holds, t.gap FAILS the run on
--               purpose: turn that line into t.ok in the same change that closed the gap.
\set ON_ERROR_STOP on
\pset tuples_only on
\set x '00000000-0000-0000-0000-0000000000e1'
\set y '00000000-0000-0000-0000-0000000000e2'
\set z '00000000-0000-0000-0000-0000000000e3'
\set crowd1 '00000000-0000-0000-0001-000000000001'

create function t.gap(holds boolean, gap text, msg text) returns text language plpgsql as $$
begin
  if holds is true then
    raise exception 'GAP CLOSED: % (%). Good: now make this line a t.ok and update docs/build-plan.md.', gap, msg;
  end if;
  return 'gap ' || gap || ' open: ' || msg;
end $$;

insert into auth.users (id) values (:'x'), (:'y'), (:'z');
insert into auth.users (id) select ('00000000-0000-0000-0001-' || lpad(n::text, 12, '0'))::uuid from generate_series(1, 220) n;
insert into public.profiles (id, name, age, area) values (:'x', 'Xavier', 25, 'Bandra'), (:'y', 'Yami', 24, 'Khar'), (:'z', 'Zoya', 26, 'Juhu');
insert into public.profiles (id, name, age, area) select id, 'Crowd', 25, 'Area' from auth.users where id::text like '00000000-0000-0000-0001-%';
insert into public.profile_private (profile_id, contact_kind, contact_handle) values
  (:'x', 'Instagram', '@xavier'), (:'y', 'Instagram', '@yami.secret'), (:'z', 'Snapchat', 'zoya.secret');

-- ---------------------------------------------------------------------------------------------
-- 1. What the API roles hold, pinned. A migration that grants more fails here and must say so.
-- ---------------------------------------------------------------------------------------------

select t.ok((select string_agg(table_schema || '.' || table_name || ':' || privs, ' ' order by table_schema, table_name) from (
    select table_schema, table_name, string_agg(privilege_type, ',' order by privilege_type) as privs
    from information_schema.role_table_grants where grantee = 'authenticated' and table_schema <> 't' group by 1, 2) g)
  = 'public.ideas:SELECT public.invites:SELECT public.passes:DELETE,INSERT,SELECT public.profile_cards:SELECT '
    'public.profile_private:INSERT,SELECT,UPDATE public.profiles:INSERT,SELECT,UPDATE public.trust_scores:SELECT',
  'a signed-in user holds exactly these table rights and no others');
select t.ok(not exists (select 1 from information_schema.role_table_grants where grantee = 'anon'),
  'signed out, there is no right on any table in any schema');
select t.ok((select string_agg(n.nspname || '.' || p.proname, ' ' order by n.nspname, p.proname)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private', 'analytics') and has_function_privilege('authenticated', p.oid, 'execute'))
  = 'private.blocked_pair public.bail public.block_user public.check_in public.decline_invite public.delete_my_account '
    'public.export_my_data public.log_event public.my_blocks public.offer_pinky public.register_push_token public.report_user '
    'public.send_invite public.unblock_user public.unregister_push_token',
  'a signed-in user can call exactly these functions and no others');
select t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private', 'analytics') and has_function_privilege('anon', p.oid, 'execute')),
  'signed out, no function can be called');
select t.ok(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  'every table in public has row-level security on');
-- A definer function without a fixed search_path can be tricked into running someone else's code.
select t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  'every security definer function fixes its search_path');

-- ---------------------------------------------------------------------------------------------
-- 2. X tries the tables directly.
-- ---------------------------------------------------------------------------------------------

set role authenticated;
select t.as_user(:'x');

select t.ok((select count(*) from profile_private) = 1, 'X reads one private row: their own');
select t.ok((select count(*) from profile_private where profile_id = :'y') = 0, 'X cannot read Y''s contact: no kept promise');
select t.ok(t.fails(format($$insert into profiles (id, name, age) values (%L, 'Ghost', 30)$$, gen_random_uuid())), 'X cannot create a profile for another id');
select t.ok(t.fails(format($$insert into profile_private values (%L, 'Instagram', '@planted')$$, :'crowd1')), 'X cannot plant a contact on someone else');
-- These run without error and must change nothing: RLS hides the rows. Checked after reset role.
update profiles set name = 'Owned' where id = :'y';
update profile_private set contact_handle = '@owned' where profile_id = :'y';
delete from passes where profile_id = :'y';

select t.ok(t.fails(format($$insert into invites (from_id, to_id, idea_id, starts_at, minutes, expires_at)
  values (%L, %L, 'boba_run', now() + interval '1 hour', 25, now() + interval '1 hour')$$, :'x', :'y')), 'X cannot insert an invite');
select t.ok(t.fails($$update invites set status = 'kept' returning 1/0$$), 'X cannot update invites');
select t.ok(t.fails('delete from invites'), 'X cannot delete invites');
select t.ok(t.fails('select count(*) from events') and t.fails($$insert into events (type) values ('kept')$$), 'X cannot read or write the event log');
select t.ok(t.fails(format($$insert into trust_scores (profile_id, score) values (%L, 100)$$, :'x'))
  and t.fails('update trust_scores set score = 100'), 'X cannot write a Trust Score');
select t.ok(t.fails('select count(*) from blocks') and t.fails('select count(*) from reports'), 'X cannot read blocks or reports');
select t.ok(t.fails('select count(*) from notifications') and t.fails('select count(*) from push_tokens'), 'X cannot read the push outbox or device tokens');
select t.ok(t.fails($$insert into ideas values ('x_idea', 'X', 'x', 10, 'irl', 'x')$$) and t.fails($$update ideas set title = 'X'$$), 'X cannot change the catalogue');
select t.ok(t.fails('select count(*) from analytics.metrics_daily'), 'X cannot read the analytics tables');
select t.ok(t.fails(format($$insert into passes (profile_id, passed_id) values (%L, %L)$$, :'y', :'z')), 'X cannot write a pass as someone else');
select t.ok(t.fails('create table public.loot (x int)') and t.fails('create function public.loot() returns int language sql as ''select 1'''),
  'X cannot create tables or functions in public');

-- ---------------------------------------------------------------------------------------------
-- 3. X tries the functions that are not for the app.
-- ---------------------------------------------------------------------------------------------

select t.ok(t.fails('select sweep_invites()'), 'X cannot run the clock');
select t.ok(t.fails('select claim_notifications(10)'), 'X cannot claim the push outbox');
select t.ok(t.fails($$select set_push_config('https://evil.example', 'secret')$$), 'X cannot repoint the push function');
select t.ok(t.fails(format($$select queue_notification(%L, null, 'new_ask', 'Free prize', 'Tap here')$$, :'y')), 'X cannot queue a push to someone');
select t.ok(t.fails('select kick_push()'), 'X cannot trigger a push run');
select t.ok(t.fails(format($$select private.end_live_invites(%L, %L, 'x')$$, :'y', :'z')), 'X cannot end other people''s plans');
select t.ok(t.fails($$select log_event('kept')$$), 'X cannot log a kept promise');
select t.ok(t.fails($$select register_push_token('not-a-token', 'ios')$$), 'X cannot register a made-up device token');

-- ---------------------------------------------------------------------------------------------
-- 4. X tries to forge promise state.
-- ---------------------------------------------------------------------------------------------

select t.ok(t.fails(format($$select send_invite(%L, 'boba_run', now() + interval '1 hour', '', '')$$, :'x')), 'X cannot ask themselves');
select t.ok(t.fails(format($$select send_invite(%L, 'boba_run', now() - interval '1 hour', '', '')$$, :'y')), 'X cannot ask for a time that has passed');
select t.ok(t.fails(format($$select send_invite(%L, 'not_an_idea', now() + interval '1 hour', '', '')$$, :'y')), 'X cannot ask for an idea that does not exist');

-- Y and Z have an ask between them. X is not on it.
select t.as_user(:'y');
select (send_invite(:'z', 'boba_run', now() + interval '1 hour', '', '')).id as yz \gset
select t.as_user(:'x');
select t.ok((select count(*) from invites where id = :'yz') = 0, 'X cannot read an invite they are not on');
select t.ok(t.fails(format('select offer_pinky(%L)', :'yz')) and t.fails(format('select decline_invite(%L)', :'yz'))
  and t.fails(format('select check_in(%L)', :'yz')) and t.fails(format('select bail(%L)', :'yz')),
  'X cannot answer, decline, check in to or bail on an invite they are not on');

-- X asks Y. Y passes.
select (send_invite(:'y', 'boba_run', now() + interval '1 hour', '', '')).id as xy1 \gset
select t.ok(t.fails(format('select offer_pinky(%L)', :'xy1')), 'X, the sender, cannot put their pinky out first');
select t.as_user(:'y');
select decline_invite(:'xy1');
select t.as_user(:'x');
select t.ok(t.fails(format('select offer_pinky(%L)', :'xy1')), 'X cannot lock an invite that was declined');

-- G6: nothing stops X asking again at once.
select t.gap(t.fails(format($$select send_invite(%L, 'boba_run', now() + interval '1 hour', '', '')$$, :'y')), 'G6',
  'X can ask Y again the second Y has passed');
select id as xy2 from invites where from_id = :'x' and to_id = :'y' and status = 'sent' \gset

-- It locks. Locked is not kept: no reveal, and no check-in an hour early.
select t.as_user(:'y');
select offer_pinky(:'xy2');
select t.as_user(:'x');
select offer_pinky(:'xy2');
select t.ok((select status from invites where id = :'xy2') = 'locked', 'the plan between X and Y is locked');
select t.ok((select count(*) from profile_private where profile_id = :'y') = 0, 'a locked plan does not open the reveal');
select t.ok(t.fails(format('select check_in(%L)', :'xy2')), 'X cannot check in an hour early');
select bail(:'xy2');
select t.ok((select count(*) from profile_private where profile_id = :'y') = 0, 'a broken promise does not open the reveal');

-- ---------------------------------------------------------------------------------------------
-- 5. Known gaps, written as the defence that should hold (docs/build-plan.md, section 2).
-- ---------------------------------------------------------------------------------------------

-- G1, G18: a contact goes out in free text, plainly or in code.
select t.gap(t.fails(format($$update profiles set tagline = 'dm me on insta @xavier.real' where id = %L$$, :'x')), 'G1',
  'a profile line can carry a handle');
select t.gap(t.fails(format($$update profiles set name = 'xavier.real_99' where id = %L$$, :'x')), 'G1',
  'a name can be a handle');
select t.gap(t.fails(format($$select decline_invite((send_invite(%L, 'boba_run', now() + interval '2 hours', 'wa.me/919876543210', 'call me 98765 43210')).id)$$, :'crowd1')), 'G1',
  'an ask can carry a phone number in its note and a link in its place');
select t.gap(t.fails(format($$update profiles set tagline = 'nine eight seven six five, then four three two one zero' where id = %L$$, :'x')), 'G18',
  'a contact spelled out in words is stored and shown with no review');

-- G2: no limits on what a card can hold.
select t.gap(t.fails(format($$update profiles set vibes = array_fill('any text at all'::text, array[50]) where id = %L$$, :'x')), 'G2',
  'a card can carry 50 tags of any text');
select t.gap(t.fails(format($$update profiles set idea_ids = array['not_an_idea'] where id = %L$$, :'x')), 'G2',
  'a card can list ideas that do not exist');
select t.gap(t.fails(format($$update profiles set area = repeat('a', 5000), pronouns = repeat('b', 5000) where id = %L$$, :'x')), 'G2',
  'area and pronouns take 5000 characters each');

-- G3: columns the server should own.
select t.gap(t.fails(format($$update profiles set photo_count = 99, city = 'Anywhere', created_at = now() - interval '5 years' where id = %L$$, :'x')), 'G3',
  'X can set their own photo count, city and join date');

-- G4: an account that cost nothing can ask people out. (Every test user here is anonymous.)
select t.gap(t.fails(format($$select decline_invite((send_invite(%L, 'boba_run', now() + interval '2 hours', '', '')).id)$$, :'crowd1')), 'G4',
  'an anonymous account can send an ask');

-- G5: the whole user base in one query.
select t.gap((select count(*) from profile_cards) <= 200, 'G5', 'X reads every card there is in one query');

-- G6: no daily limits.
select t.gap((select count(*) filter (where not t.fails(format(
    $$select decline_invite((send_invite(%L, 'boba_run', now() + interval '2 hours', '', '')).id)$$, id))) <= 10
  from (select id from profiles where name = 'Crowd' order by id limit 12) c), 'G6', 'X can send more than 10 asks in a day');
select t.gap(t.fails($$select log_event('app_open', jsonb_build_object('junk', repeat('x', 100000)))$$), 'G6',
  'the event log takes 100 kB from the app in one call');
select t.gap(t.fails(format($$insert into passes (profile_id, passed_id) select %L, id from profiles where name = 'Crowd'$$, :'x')), 'G6',
  'X can pass on 220 people in one go');

-- G21: the private row takes anything.
select t.gap(t.fails(format($$update profile_private set photos = (select jsonb_agg(repeat('x', 1000)) from generate_series(1, 1000)) where profile_id = %L$$, :'x')), 'G21',
  'the photos field takes a megabyte of anything');

-- G7: check-in is a button. X and Y "keep" two promises without proving they met.
select (send_invite(:'y', 'video_coffee', now() + interval '5 minutes', '', '')).id as xy3 \gset
select t.as_user(:'y');
select offer_pinky(:'xy3');
select t.as_user(:'x');
select offer_pinky(:'xy3');
select t.gap(t.fails(format('select check_in(%L)', :'xy3')), 'G7', 'check-in needs nothing from the other person');
select t.as_user(:'y');
select check_in(:'xy3');
select t.ok((select contact_handle from profile_private where profile_id = :'x') = '@xavier', 'after a kept promise Y reads X''s contact: the reveal, as designed');

-- A second kept promise between the same two, for G8 (checked after the pipeline runs).
select t.as_user(:'x');
select (send_invite(:'y', 'video_coffee', now() + interval '6 minutes', '', '')).id as xy4 \gset
select t.as_user(:'y');
select offer_pinky(:'xy4');
select t.as_user(:'x');
select offer_pinky(:'xy4');
select check_in(:'xy4');
select t.as_user(:'y');
select check_in(:'xy4');

-- ---------------------------------------------------------------------------------------------
-- 6. A block still holds against all of the above.
-- ---------------------------------------------------------------------------------------------

select t.as_user(:'z');
select block_user(:'x');
select t.as_user(:'x');
select t.ok((select count(*) from profile_cards where id = :'z') = 0 and (select count(*) from profiles where id = :'z') = 0,
  'after Z blocks X, X cannot read Z by any table');
select t.ok(t.fails(format($$select send_invite(%L, 'boba_run', now() + interval '1 hour', '', '')$$, :'z')), 'X cannot ask someone who blocked them');

reset role;
select t.ok((select name from public.profiles where id = :'y') = 'Yami'
  and (select contact_handle from public.profile_private where profile_id = :'y') = '@yami.secret',
  'nothing X wrote at Y''s rows landed');
select t.ok((select count(*) from public.invites where status = 'kept' and :'x' in (from_id, to_id)) = 2, 'X and Y have two kept promises between them');
