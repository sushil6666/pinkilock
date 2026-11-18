-- Double micro-dates (docs/build-plan.md F3, migration 20261118000002): duos, four people on one
-- plan, check-in across sides, the reveal, blocks. People of their own: A asks with B, C is asked
-- with D, E has no duo. Runs after privacy.sql; t.ok, t.fails and t.sqlstate come from earlier files.
\set ON_ERROR_STOP on
\pset tuples_only on
\set a '00000000-0000-0000-0000-000000000d10'
\set b '00000000-0000-0000-0000-000000000d20'
\set c '00000000-0000-0000-0000-000000000d30'
\set d '00000000-0000-0000-0000-000000000d40'
\set e '00000000-0000-0000-0000-000000000d50'
insert into auth.users (id) values (:'a'), (:'b'), (:'c'), (:'d'), (:'e');
insert into public.profiles (id, name, age, area) values
  (:'a', 'Aarav', 25, 'Bandra'), (:'b', 'Bina', 24, 'Bandra'), (:'c', 'Chitra', 26, 'Juhu'), (:'d', 'Dev', 27, 'Juhu'), (:'e', 'Esha', 25, 'Khar');
insert into public.profile_private (profile_id, contact_kind, contact_handle) values
  (:'a', 'Instagram', '@aarav'), (:'b', 'Instagram', '@bina'), (:'c', 'Instagram', '@chitra'), (:'d', 'Instagram', '@dev'), (:'e', 'Instagram', '@esha');

-- Every code on a plan, set to a known value: A 1111, B 2222, C 3333, D 4444.
create function t.fix_codes(p_invite uuid) returns void language sql security definer as $$
  update private.checkin_codes set code = case user_id
    when '00000000-0000-0000-0000-000000000d10' then '1111' when '00000000-0000-0000-0000-000000000d20' then '2222'
    when '00000000-0000-0000-0000-000000000d30' then '3333' else '4444' end
  where invite_id = p_invite;
$$;
-- The clock: move a plan's start (now, or past the end of its window).
create function t.starts(p_invite uuid, p_at timestamptz) returns void language sql security definer as $$
  update public.invites set starts_at = p_at where id = p_invite;
$$;
grant execute on function t.fix_codes(uuid), t.starts(uuid, timestamptz) to public;

-- ---------------------------------------------------------------------------------------------
-- Duos
-- ---------------------------------------------------------------------------------------------
set role authenticated;
select t.as_user(:'a');
select create_duo_link() as link_a \gset
select t.ok(t.sqlstate(format('select join_duo(%L)', :'link_a')) = 'PL091', 'A cannot join their own duo link (PL091)');
select t.ok(duo_link_name(:'link_a') is null, 'and their own link shows them no name');
select t.as_user(:'e');
select t.ok(duo_link_name(:'link_a') = 'Aarav', 'a friend who opens the link sees a first name');
select t.ok(duo_link_name('0123456789abcdef') is null, 'a made-up link shows nothing');
select t.ok(t.sqlstate($$select join_duo('0123456789abcdef')$$) = 'PL089', 'a made-up link cannot be joined (PL089)');
select t.as_user(:'b');
select t.ok(join_duo(:'link_a') = :'a', 'B joins A''s duo');
select t.as_user(:'e');
select t.ok(t.sqlstate(format('select join_duo(%L)', :'link_a')) = 'PL089', 'a used link cannot be joined again (PL089)');
select t.as_user(:'a');
select t.ok(t.sqlstate('select create_duo_link()') = 'PL088', 'someone in a duo cannot make another link (PL088)');
select t.ok((select partner from duos) = :'b', 'A reads their own duo');
select t.ok((select count(*) from profile_cards where id = :'b') = 1, 'and their partner''s card');
select t.as_user(:'e');
select t.ok((select count(*) from duos) = 0, 'E reads nobody''s duo');
select t.ok(t.fails(format($$insert into duos (person, partner) values (%L, %L)$$, :'e', :'a')), 'nobody can write a duo row directly');
select t.ok(t.fails(format($$delete from duos where person = %L$$, :'a')) or (select count(*) from duos) = 0, 'or delete one');
select t.as_user(:'c');
select create_duo_link() as link_c \gset
select t.as_user(:'d');
select join_duo(:'link_c');
select t.as_user(:'e');
select create_duo_link() as link_e \gset
select t.as_user(:'a');
select t.ok(t.sqlstate(format('select join_duo(%L)', :'link_e')) = 'PL088', 'someone in a duo cannot join another (PL088)');
reset role;
select t.ok((select count(*) from public.duos) = 4, 'two duos, two rows each');
select t.ok((select has_duo from public.profile_cards where id = :'a') and not (select has_duo from public.profile_cards where id = :'e'), 'the card says whether there is a duo');

-- ---------------------------------------------------------------------------------------------
-- Asking as a double
-- ---------------------------------------------------------------------------------------------
set role authenticated;
select t.as_user(:'a');
select t.ok(t.sqlstate(format($$select send_invite(%L, 'boba_run', now() + interval '2 hours', 'Bandra', '', null, true)$$, :'e')) = 'PL093',
  'a double to someone with no duo is refused (PL093)');
select t.as_user(:'e');
select t.ok(t.sqlstate(format($$select send_invite(%L, 'boba_run', now() + interval '2 hours', 'Juhu', '', null, true)$$, :'c')) = 'PL092',
  'a double without a duo of my own is refused (PL092)');
select t.as_user(:'a');
select (send_invite(:'c', 'boba_run', now() + interval '2 hours', 'Juhu beach', '', null, true)).id as d1 \gset
select t.ok((select (from_id, to_id, from_friend, to_friend, status) = (:'a'::uuid, :'c'::uuid, :'b'::uuid, :'d'::uuid, 'sent'::invite_status) from invites where id = :'d1'),
  'the server seats both friends');
select t.as_user(:'d');
select t.ok((select count(*) from invites where id = :'d1') = 1, 'D, the friend of the person asked, sees the plan');
select t.ok((select count(*) from profile_cards where id in (:'a', :'b')) = 2, 'and the cards of both people asking');
select t.as_user(:'e');
select t.ok((select count(*) from invites where id = :'d1') = 0, 'someone not on it sees nothing');
reset role;
select t.ok((select count(*) from public.notifications where invite_id = :'d1' and kind = 'new_ask') = 3, 'B, C and D each hear about the ask');

-- Pinkies: the three others in any order, the asker last.
set role authenticated;
select t.as_user(:'a');
select t.ok(t.sqlstate(format('select offer_pinky(%L)', :'d1')) = 'PL094', 'the asker cannot seal before the other three (PL094)');
select t.as_user(:'c');
select offer_pinky(:'d1');
select t.as_user(:'b');
select offer_pinky(:'d1');
select offer_pinky(:'d1');
select t.ok((select (status, cardinality(pinkies)) = ('half_locked', 2) from invites where id = :'d1'), 'two pinkies out, and a second tap counts once');
select t.as_user(:'a');
select t.ok(t.sqlstate(format('select offer_pinky(%L)', :'d1')) = 'PL094', 'still not the asker''s turn with two out');
select t.as_user(:'d');
select offer_pinky(:'d1');
reset role;
select t.ok((select count(*) from public.notifications where invite_id = :'d1' and kind = 'pinky_out' and recipient_id = :'a') = 1, 'with three out, the asker is told to seal it');
set role authenticated;
select t.as_user(:'a');
select offer_pinky(:'d1');
select t.ok((select status from invites where id = :'d1') = 'locked', 'the asker seals it: locked');
reset role;
select t.ok((select count(*) from public.notifications where invite_id = :'d1' and kind = 'locked') = 3, 'the other three hear it is locked');

-- ---------------------------------------------------------------------------------------------
-- Check-in across sides, and the end of the window
-- ---------------------------------------------------------------------------------------------
select t.starts(:'d1', now());
set role authenticated;
select t.as_user(:'a');
select t.ok(t.sqlstate(format('select check_in(%L, %L)', :'d1', '0000')) = 'PL038', 'nobody on the other side has opened a code yet (PL038)');
select my_checkin_code(:'d1');
select t.as_user(:'b');
select my_checkin_code(:'d1');
select t.as_user(:'c');
select my_checkin_code(:'d1');
reset role;
select t.fix_codes(:'d1');
set role authenticated;
select t.as_user(:'a');
select check_in(:'d1', '2222');
select t.ok(not (select :'a'::uuid = any (check_ins) from invites where id = :'d1'), 'a code from my own side does not check me in');
select check_in(:'d1', '3333');
select t.ok((select :'a'::uuid = any (check_ins) from invites where id = :'d1'), 'a code from the other side does');
select t.as_user(:'c');
select check_in(:'d1', '1111');
select t.ok((select (status, cardinality(check_ins)) = ('locked', 2) from invites where id = :'d1'), 'two of four in: still locked');
select t.as_user(:'a');
select t.ok((select count(*) from profile_private where profile_id = :'c') = 0, 'no reveal before it is kept');

reset role;
select t.starts(:'d1', now() - interval '31 minutes');
select sweep_invites();
select t.ok((select status from public.invites where id = :'d1') = 'kept', 'window closed with one from each side in: kept');
select t.ok((select string_agg(type || ':' || actor_id::text, ' ' order by type, actor_id) from public.events where invite_id = :'d1' and type in ('kept', 'no_show'))
  = format('kept:%s kept:%s no_show:%s no_show:%s', :'a', :'c', :'b', :'d'), 'kept for A and C; a no-show for B and D, never for their friends');
select t.ok((select count(*) from public.notifications where invite_id = :'d1' and kind = 'missed') = 2, 'B and D hear it is on their record');

set role authenticated;
select t.as_user(:'a');
select t.ok((select contact_handle from profile_private where profile_id = :'c') = '@chitra', 'A sees C''s contact: opposite sides, both checked in');
select t.ok((select count(*) from profile_private where profile_id in (:'b', :'d')) = 0, 'not D''s (did not show), not B''s (same side)');
select t.as_user(:'b');
select t.ok((select count(*) from profile_private where profile_id in (:'c', :'d')) = 0, 'B, who did not show, sees no one''s');
select t.as_user(:'d');
select t.ok((select count(*) from profile_private where profile_id in (:'a', :'b')) = 0, 'nor does D');
select t.as_user(:'a');
select rate_date(:'d1', true, true);
select t.ok((select round_two from date_feedback(:'d1')) is not true, 'round two is for plans of two');
select t.as_user(:'b');
select t.ok(t.sqlstate(format('select rate_date(%L, true, true)', :'d1')) = 'PL074', 'someone who did not show cannot rate it (PL074)');

-- A double where only one side came: a flake, with a no-show for each missing person.
select t.as_user(:'a');
select (send_invite(:'c', 'chai_walk', now() + interval '2 hours', 'Juhu', '', null, true)).id as d2 \gset
select t.as_user(:'b');
select offer_pinky(:'d2');
select t.as_user(:'c');
select offer_pinky(:'d2');
select t.as_user(:'d');
select offer_pinky(:'d2');
select t.as_user(:'a');
select offer_pinky(:'d2');
reset role;
select t.starts(:'d2', now() - interval '31 minutes');
select sweep_invites();
select t.ok((select status = 'flaked' and flaked_by is null from public.invites where id = :'d2'), 'nobody in: a flake on no one person');
select t.ok((select count(*) from public.events where invite_id = :'d2' and type = 'no_show') = 4, 'a no-show for each of the four');

-- A bail is on the one who bailed, and everyone else hears.
set role authenticated;
select t.as_user(:'a');
select (send_invite(:'c', 'chai_walk', now() + interval '2 hours', 'Juhu', '', null, true)).id as d3 \gset
select t.as_user(:'b');
select offer_pinky(:'d3');
select t.as_user(:'c');
select offer_pinky(:'d3');
select t.as_user(:'d');
select offer_pinky(:'d3');
select t.as_user(:'a');
select offer_pinky(:'d3');
select t.as_user(:'d');
select bail(:'d3');
reset role;
select t.ok((select (status, flaked_by) = ('flaked', :'d'::uuid) from public.invites where id = :'d3'), 'D bailed: on D');
select t.ok((select count(*) from public.notifications where invite_id = :'d3' and kind = 'bailed') = 3, 'the other three hear');

-- Any one of the four passing ends it for all, with no flake.
set role authenticated;
select t.as_user(:'a');
select (send_invite(:'c', 'chai_walk', now() + interval '2 hours', 'Juhu', '', null, true)).id as d4 \gset
select t.as_user(:'b');
select decline_invite(:'d4');
select t.ok((select (status, declined_by) = ('declined', :'b'::uuid) from invites where id = :'d4'), 'the asker''s own friend can pass, and it ends');

-- ---------------------------------------------------------------------------------------------
-- Blocks, reports and leaving
-- ---------------------------------------------------------------------------------------------
select t.as_user(:'a');
select (send_invite(:'c', 'chai_walk', now() + interval '2 hours', 'Juhu', '', null, true)).id as d5 \gset
select t.as_user(:'d');
select block_user(:'a');
select t.ok((select count(*) from invites where id = :'d5') = 0, 'D blocks A: D no longer sees the plan');
reset role;
select t.ok((select status from public.invites where id = :'d5') = 'ended', 'and the plan the four were on ends');
set role authenticated;
select t.as_user(:'a');
select t.ok((select count(*) from invites where id = :'d5') = 0, 'and A no longer sees it');
select t.ok(t.sqlstate(format($$select send_invite(%L, 'boba_run', now() + interval '2 hours', 'Juhu', '', null, true)$$, :'c')) = 'PL004',
  'a double across a block between any two of the four is refused, naming no one (PL004)');
select t.as_user(:'b');
select t.ok((select status from invites where id = :'d5') = 'ended', 'B, who blocked no one, still sees it ended');
select t.as_user(:'d');
select unblock_user(:'a');

select t.as_user(:'b');
select export_my_data() as ex \gset
select t.ok((:'ex'::jsonb -> 'duo' ->> 'partner') = :'a'
  and (select bool_and(x ->> 'role' = 'asked_with_a_friend' and x ->> 'other_person' = :'c') from jsonb_array_elements(:'ex'::jsonb -> 'invites') x),
  'the export names my duo and my seat on each double');
select leave_duo();
select t.as_user(:'a');
select t.ok((select count(*) from duos) = 0, 'B left: A has no duo either');
select t.ok(t.sqlstate(format($$select send_invite(%L, 'boba_run', now() + interval '2 hours', 'Juhu', '', null, true)$$, :'c')) = 'PL092', 'and cannot ask as a double');
select t.as_user(:'c');
select block_user(:'d');
select t.ok((select count(*) from duos) = 0, 'a block between duo partners ends the duo');
reset role;
