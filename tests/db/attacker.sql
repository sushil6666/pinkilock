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

create or replace function t.sqlstate(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return null;
exception when others then
  return sqlstate;
end $$;

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
  = 'public.ask_lines:SELECT public.cities:SELECT public.countries:SELECT public.ideas:SELECT public.invites:SELECT public.passes:DELETE,INSERT,SELECT public.profile_cards:SELECT '
    'public.profile_private:SELECT public.trust_scores:SELECT public.venues:SELECT public.vibes:SELECT',
  'a signed-in user holds exactly these table rights and no others');
select t.ok(not exists (select 1 from information_schema.role_table_grants where grantee = 'anon'),
  'signed out, there is no right on any table in any schema');
select t.ok((select string_agg(n.nspname || '.' || p.proname, ' ' order by n.nspname, p.proname)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private', 'analytics') and has_function_privilege('authenticated', p.oid, 'execute'))
  = 'private.blocked_pair private.shares_invite private.vouch_summary public.bail public.block_user public.check_in public.create_vouch_link public.date_feedback public.decline_invite '
    'public.delete_my_account public.discover public.export_my_data public.file_privacy_request public.give_consents public.log_client_error public.log_event public.my_blocks public.my_checkin_code public.my_consents public.my_line_review public.my_moderation public.offer_pinky public.rate_date public.register_push_token public.report_user '
    'public.save_availability public.save_profile public.send_invite public.unblock_user public.unregister_push_token public.vouch public.vouch_link_name',
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
-- Checked again after reset role: nothing of Y's changed.
select t.ok(t.fails(format($$update profiles set name = 'Owned' where id = %L$$, :'y'))
  and t.fails(format($$update profile_private set contact_handle = '@owned' where profile_id = %L$$, :'y')), 'X cannot write Y''s profile or contact');
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
select t.ok(t.fails($$select private.set_config('network_check_token', repeat('x', 64))$$), 'X cannot set the network-check token');
select t.ok(t.fails('select private.network_check_skipped()'), 'X cannot probe the network-check token');
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
  and t.fails(format('select t.check_in(%L)', :'yz')) and t.fails(format('select bail(%L)', :'yz')),
  'X cannot answer, decline, check in to or bail on an invite they are not on');

-- X asks Y. Y passes.
select (send_invite(:'y', 'boba_run', now() + interval '1 hour', '', '')).id as xy1 \gset
select t.ok(t.fails(format('select offer_pinky(%L)', :'xy1')), 'X, the sender, cannot put their pinky out first');
select t.as_user(:'y');
select decline_invite(:'xy1');
select t.as_user(:'x');
select t.ok(t.fails(format('select offer_pinky(%L)', :'xy1')), 'X cannot lock an invite that was declined');

-- G6 closed: X cannot ask Y again for 7 days after Y passed.
select t.ok(t.sqlstate(format($$select send_invite(%L, 'boba_run', now() + interval '1 hour', '', '')$$, :'y')) = 'PL026',
  'G6 closed: X cannot ask Y again the second Y has passed');

-- Y asks X instead. It locks. Locked is not kept: no reveal, and no check-in an hour early.
select t.as_user(:'y');
select (send_invite(:'x', 'boba_run', now() + interval '1 hour', '', '')).id as xy2 \gset
select t.as_user(:'x');
select offer_pinky(:'xy2');
select t.as_user(:'y');
select offer_pinky(:'xy2');
select t.as_user(:'x');
select t.ok((select status from invites where id = :'xy2') = 'locked', 'the plan between X and Y is locked');
select t.ok((select count(*) from profile_private where profile_id = :'y') = 0, 'a locked plan does not open the reveal');
select t.ok(t.fails(format('select t.check_in(%L)', :'xy2')), 'X cannot check in an hour early');
select bail(:'xy2');
select t.ok((select count(*) from profile_private where profile_id = :'y') = 0, 'a broken promise does not open the reveal');

-- ---------------------------------------------------------------------------------------------
-- 5. Known gaps, written as the defence that should hold (docs/build-plan.md, section 2).
-- ---------------------------------------------------------------------------------------------

-- G1, G2, G3, G21 are closed (supabase/migrations/20261117000009_profile_rules.sql): profiles are
-- written only through save_profile, which checks every field. tests/db/profile_rules.sql has
-- each rule; these are the attacker's versions.
select t.ok(t.fails(format($$update profiles set tagline = 'dm me on insta @xavier.real' where id = %L$$, :'x'))
  and t.fails($$select save_profile('Xavier', 25, 'Bandra', '', 'dm me on insta @xavier.real', '{}', array['boba_run','chai_walk','meme_duel'])$$),
  'G1 closed: a profile line cannot carry a handle, by the table or by the function');
select t.ok(t.fails($$select save_profile('xavier.real_99', 25, 'Bandra', '', '', '{}', array['boba_run','chai_walk','meme_duel'])$$),
  'G1 closed: a name cannot be a handle');
select t.ok(t.fails(format($$select send_invite(%L, 'boba_run', now() + interval '2 hours', 'wa.me/919876543210', '')$$, :'crowd1'))
  and t.fails(format($$select send_invite(%L, 'boba_run', now() + interval '2 hours', '', 'call me 98765 43210')$$, :'crowd1')),
  'G1 closed: an ask cannot carry a phone number in its note or a link in its place');
select t.ok(t.fails($$select save_profile('Xavier', 25, 'Bandra', '', '', array_fill('any text at all'::text, array[50]), array['boba_run','chai_walk','meme_duel'])$$)
  and t.fails($$select save_profile('Xavier', 25, 'Bandra', '', '', '{}', array['not_an_idea','boba_run','chai_walk'])$$)
  and t.fails($$select save_profile('Xavier', 25, repeat('a', 5000), repeat('b', 5000), '', '{}', array['boba_run','chai_walk','meme_duel'])$$),
  'G2 closed: tags and ideas come from the catalogues, and every field has a length limit');
select t.ok(t.fails(format($$update profiles set photo_count = 99, city = 'Anywhere', created_at = now() - interval '5 years' where id = %L$$, :'x')),
  'G3 closed: X cannot set their own photo count, city or join date');
select t.ok(t.fails(format($$update profile_private set photos = (select jsonb_agg(repeat('x', 1000)) from generate_series(1, 1000)) where profile_id = %L$$, :'x')),
  'G21 closed: the photos field cannot be written by a client');

-- G18: a pattern cannot see an invented code. With line review on ('human' or 'ai'), no line
-- reaches anyone before it is reviewed: tests/db/review.sql checks that. With review off (the
-- default until a reviewer exists), this one is stored and shown, so the gap stays marked.
select t.gap(t.fails($$select save_profile('Xavier', 25, 'Bandra', '', 'shift each letter back by one: jotub tbn', '{}', array['boba_run','chai_walk','meme_duel'])$$), 'G18',
  'with line review off, a contact written in a made-up code is shown with no review');

-- G4 closed: with the link gate on, an account with no email or phone cannot ask or lock.
reset role;
update auth.users set is_anonymous = true where id = :'crowd1';
select private.set_config('require_linked', 'true');
set role authenticated;
select t.as_user(:'crowd1');
select t.ok(t.sqlstate(format($$select send_invite(%L, 'boba_run', now() + interval '2 hours', '', '')$$, :'y')) = 'PL068',
  'G4 closed: an anonymous account cannot send an ask while the gate is on');
reset role;
select private.set_config('require_linked', 'false');
update auth.users set is_anonymous = false where id = :'crowd1';
set role authenticated;
select t.as_user(:'x');

-- G5 closed: no account reads the whole user base. The tables return only people X shares an
-- invite with; discover() gives 20 a call and 200 different cards a day. X tries to page through
-- the 220-person crowd by passing on every card it is shown.
select t.ok((select count(*) from profiles) <= 3 and (select count(*) from trust_scores) <= 3,
  'G5 closed: X reads only people X shares an invite with, by any table');
create temp table x_seen (id uuid primary key);
grant all on x_seen to authenticated;
do $$
declare
  n int;
begin
  for round in 1..15 loop
    insert into x_seen select id from discover(50) on conflict do nothing;
    get diagnostics n = row_count;
    begin
      insert into passes (profile_id, passed_id) select auth.uid(), id from x_seen on conflict do nothing;
    exception when others then null; -- the pass limit stops this first; that is fine too
    end;
  end loop;
end $$;
select t.ok((select count(*) from x_seen) between 20 and 200, 'G5 closed: paging through discover() reaches at most 200 people a day (got ' || (select count(*) from x_seen) || ')');
select t.ok((select count(*) from discover(50)) <= 20, 'discover() returns at most 20 cards a call');

-- G6 closed: daily limits. A crowd member sends the asks, so that X's own count is left alone.
select t.as_user('00000000-0000-0000-0001-000000000002');
select t.ok((select count(*) filter (where not t.fails(format(
    $$select decline_invite((send_invite(%L, 'boba_run', now() + interval '2 hours', '', '')).id)$$, id))) = 10
  from (select ('00000000-0000-0000-0001-' || lpad(n::text, 12, '0'))::uuid as id from generate_series(3, 14) n) c),
  'G6 closed: no one can send more than 10 asks in a day');
select t.as_user(:'x');
select t.ok(t.sqlstate($$select log_event('app_open', jsonb_build_object('junk', repeat('x', 100000)))$$) = 'PL041',
  'G6 closed: the event log takes at most 1 kB from the app in one call');
select t.ok(t.sqlstate(format($$insert into passes (profile_id, passed_id) select %L, ('00000000-0000-0000-0001-' || lpad(n::text, 12, '0'))::uuid from generate_series(1, 220) n on conflict do nothing$$, :'x')) = 'PL028',
  'G6 closed: no one can pass on more than 200 people in a day');

-- G7 closed: checking in needs the other person's code, which only passes between two people who
-- are together. X tries without it.
select t.as_user(:'y');
select (send_invite(:'x', 'video_coffee', now() + interval '5 minutes', '', '')).id as xy3 \gset
select t.as_user(:'x');
select offer_pinky(:'xy3');
select t.as_user(:'y');
select offer_pinky(:'xy3');
select t.as_user(:'x');
select t.ok(t.sqlstate(format($$select check_in(%L, '0000')$$, :'xy3')) = 'PL038', 'G7 closed: X cannot check in before Y has even opened a code (PL038)');
select t.ok(t.fails(format('select check_in(%L)', :'xy3')), 'G7 closed: the old one-argument check-in is gone');
select t.as_user(:'y');
select t.ok(my_checkin_code(:'xy3') ~ '^[0-9]{4}$', 'Y opens their code');
select t.ok(t.fails('select count(*) from private.checkin_codes'), 'no one can read the codes table');
select t.as_user(:'x');
-- Guessing: five wrong codes lock X out, and a wrong code changes nothing.
reset role;
select code as y_code from private.checkin_codes where invite_id = :'xy3' and user_id = :'y' \gset
set role authenticated;
select t.as_user(:'x');
select t.ok(not (:'x' = any ((check_in(:'xy3', lpad(((:'y_code'::int + k) % 10000)::text, 4, '0'))).check_ins)), 'a wrong code does not check X in (try ' || k || ')')
  from generate_series(1, 5) k;
select t.ok(t.sqlstate(format($$select check_in(%L, %L)$$, :'xy3', :'y_code')) = 'PL037', 'G7 closed: after five wrong codes, even the right one waits five minutes (PL037)');
reset role;
update private.checkin_codes set locked_until = null where invite_id = :'xy3' and user_id = :'x';
set role authenticated;
select t.as_user(:'x');
select t.ok(:'x' = any ((check_in(:'xy3', :'y_code')).check_ins), 'with Y''s code, X checks in');
select t.as_user(:'y');
select t.check_in(:'xy3');
reset role;
select t.ok(not exists (select 1 from private.checkin_codes where invite_id = :'xy3'), 'the codes are deleted once the promise is kept');
set role authenticated;
select t.as_user(:'y');
select t.ok((select contact_handle from profile_private where profile_id = :'x') = '@xavier', 'after a kept promise Y reads X''s contact: the reveal, as designed');

-- A second kept promise between the same two, for G8 (checked after the pipeline runs).
select t.as_user(:'y');
select (send_invite(:'x', 'video_coffee', now() + interval '6 minutes', '', '')).id as xy4 \gset
select t.as_user(:'x');
select offer_pinky(:'xy4');
select t.as_user(:'y');
select offer_pinky(:'xy4');
select t.as_user(:'x');
select t.check_in(:'xy4');
select t.as_user(:'y');
select t.check_in(:'xy4');

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
