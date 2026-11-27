-- Couple mode (D120), after pink_gold.sql. People of their own: M and N match; O also matched M;
-- P is a stranger; Q has no profile.
\set ON_ERROR_STOP on
\pset tuples_only on
\set m '00000000-0000-0000-0000-0000000c0001'
\set n '00000000-0000-0000-0000-0000000c0002'
\set o '00000000-0000-0000-0000-0000000c0003'
\set p '00000000-0000-0000-0000-0000000c0004'
\set q '00000000-0000-0000-0000-0000000c0005'
insert into auth.users (id) values (:'m'), (:'n'), (:'o'), (:'p'), (:'q');
insert into public.profiles (id, name, age, area) values (:'m', 'Mira', 26, 'Bandra'), (:'n', 'Neel', 27, 'Khar'), (:'o', 'Omar', 28, 'Juhu'), (:'p', 'Pia', 25, 'Andheri');

-- A kept plan for two between X and Y, rated by both.
create or replace function t.kept_pair(p_x uuid, p_y uuid, p_x_again boolean, p_y_again boolean) returns uuid language plpgsql as $$
declare
  inv uuid;
begin
  perform t.as_user(p_x);
  select (send_invite(p_y, 'video_coffee', now() + interval '5 minutes', '', '')).id into inv;
  perform t.as_user(p_y);
  perform offer_pinky(inv);
  perform t.as_user(p_x);
  perform offer_pinky(inv);
  perform t.check_in(inv);
  perform t.as_user(p_y);
  perform t.check_in(inv);
  perform rate_date(inv, true, p_y_again);
  perform t.as_user(p_x);
  perform rate_date(inv, true, p_x_again);
  return inv;
end $$;
grant execute on function t.kept_pair(uuid, uuid, boolean, boolean) to public;

set role authenticated;
select t.as_user(:'q');
select t.ok(t.sqlstate('select my_couple()') = 'PL002', 'Couple mode needs a profile first (PL002)');

-- Before a match there is nothing to start.
select t.as_user(:'m');
select t.ok((select my_couple() ->> 'status') = 'none' and (select my_couple() -> 'matches') = '[]'::jsonb, 'M starts with no couple and no matches');
select t.ok(t.sqlstate(format('select couple_ask(%L)', :'p')) = 'PL220', 'no Couple mode with someone M never matched (PL220)');
select t.ok(t.sqlstate(format('select couple_ask(%L)', :'m')) = 'PL220', 'or with M''s own self');

-- A kept plan where only one wants round two is not a match.
select t.kept_pair(:'m', :'o', true, false);
select t.as_user(:'m');
select t.ok(t.sqlstate(format('select couple_ask(%L)', :'o')) = 'PL220', 'one "see them again" is not a match (PL220)');

select t.kept_pair(:'m', :'n', true, true);
select t.as_user(:'m');
select t.ok((select my_couple() -> 'matches') = jsonb_build_array(:'n'::text), 'after round two, N is M''s match (and O is not)');
select couple_ask(:'n');
select t.ok((select my_couple() ->> 'status') = 'asked_by_me', 'M asked N');
select t.ok(t.sqlstate('select couple_add_idea(''boba_run'')') = 'PL221', 'nothing to plan before N says yes (PL221)');
select t.ok(t.sqlstate(format('select couple_ask(%L)', :'n')) = 'PL222', 'asking twice is refused (PL222)');
select t.ok(t.sqlstate('select couple_answer(true)') = 'PL224', 'the asker cannot answer their own ask (PL224)');

select t.as_user(:'p');
select t.ok((select my_couple() ->> 'status') = 'none' and (select my_couple() -> 'partner') = 'null'::jsonb, 'a stranger sees nothing of it');

select t.as_user(:'n');
select t.ok((select my_couple() ->> 'status') = 'asked_me' and (select my_couple() ->> 'partner') = :'m', 'N sees M''s ask');
select couple_answer(true);
select t.ok((select my_couple() ->> 'status') = 'on' and (select my_couple() ->> 'since') is not null, 'N said yes: Couple mode is on');
select t.ok((select my_couple() ->> 'first_date') is not null, 'and the first date is there');
select my_couple() -> 'weeks' -> 0 ->> 'challenge' as challenge, jsonb_array_length(my_couple() -> 'weeks') as weeks \gset
reset role;
select t.ok(:weeks = 1 and :'challenge' = any (private.couple_challenge_ids()), 'this week''s challenge is one from the list');
set role authenticated;

-- Only one couple at a time.
select t.as_user(:'o');
reset role;
insert into public.date_ratings (invite_id, user_id, worth, again) select i.id, :'o', true, true from invites i where i.to_id = :'o' and i.status = 'kept'
on conflict (invite_id, user_id) do update set again = true;
set role authenticated;
select t.as_user(:'o');
select t.ok(t.sqlstate(format('select couple_ask(%L)', :'m')) = 'PL223', 'O cannot start Couple mode with M while M has one (PL223)');

-- The date list.
select t.as_user(:'m');
select couple_add_idea('boba_run');
select t.ok(t.sqlstate('select couple_add_idea(''boba_run'')') = 'PL226', 'an idea goes on the list once (PL226)');
select t.ok(t.sqlstate('select couple_add_idea(''not_an_idea'')') = 'PL225', 'only ideas from the catalogue (PL225)');
select t.ok(t.sqlstate('select couple_add_idea(''goa_shack_sunset'')') = 'PL225', 'and not another city''s idea');
select (my_couple() -> 'ideas' -> 0 ->> 'id')::bigint as idea_id \gset
select t.ok((select my_couple() -> 'ideas' -> 0) @> '{"heart_me": true, "heart_them": false, "mine": true, "done": false}'::jsonb, 'the one who adds it hearts it');
select t.as_user(:'n');
select couple_idea(:idea_id, 'heart');
select t.ok((select my_couple() -> 'ideas' -> 0) @> '{"heart_me": true, "heart_them": true, "mine": false}'::jsonb, 'N hearts it too');
select couple_idea(:idea_id, 'done');
select t.as_user(:'m');
select t.ok((select my_couple() -> 'ideas' -> 0 ->> 'done')::boolean, 'N marked it done, and M sees that');
select t.ok(t.sqlstate(format('select couple_idea(%s, %L)', :idea_id, 'explode')) = 'PL228', 'only heart, done or remove (PL228)');
select t.as_user(:'p');
select t.ok(t.sqlstate(format('select couple_idea(%s, %L)', :idea_id, 'remove')) = 'PL221', 'a stranger cannot touch the list');
select t.as_user(:'m');
select couple_idea(:idea_id, 'remove');
select t.ok((select my_couple() -> 'ideas') = '[]'::jsonb, 'M removed it');
reset role;
insert into private.couple_ideas (couple_id, idea_id, added_by) select c.id, i.id, :'m' from private.couples c, (select id from ideas where countries is null and cities is null limit 20) i where c.a = :'m' and c.status = 'on';
set role authenticated;
select t.as_user(:'m');
select t.ok(t.sqlstate('select couple_add_idea(''momo_stop'')') = 'PL227', 'twenty ideas at most (PL227)');

-- Special days.
select couple_add_day('birthday', '1999-03-14');
select t.ok(t.sqlstate('select couple_add_day(''birthday'', ''1999-03-15'')') = 'PL231', 'one birthday each (PL231)');
select t.ok(t.sqlstate('select couple_add_day(''wedding'', ''2026-01-01'')') = 'PL229', 'only kinds from the list (PL229)');
select t.ok(t.sqlstate('select couple_add_day(''special'', ''1900-01-01'')') = 'PL230' and t.sqlstate(format('select couple_add_day(%L, %L)', 'special', (current_date + 800)::text)) = 'PL230',
  'a date within the last 80 years and the next one (PL230)');
select (my_couple() -> 'days' -> 0 ->> 'id')::bigint as day_id \gset
select t.as_user(:'n');
select couple_add_day('birthday', '1998-07-02');
select t.ok((select jsonb_array_length(my_couple() -> 'days')) = 2, 'N adds a birthday too; both show');
select t.ok(t.sqlstate(format('select couple_remove_day(%s)', :day_id)) = 'PL233', 'N cannot remove M''s day (PL233)');
select t.as_user(:'m');
select couple_remove_day(:day_id);
select t.ok((select jsonb_array_length(my_couple() -> 'days')) = 1, 'M removes M''s own');

-- This week's challenge: both tick it.
select couple_challenge_done(true);
select couple_challenge_done(true);
select t.ok((select my_couple() -> 'weeks' -> -1) @> '{"me": true, "them": false}'::jsonb, 'M ticked this week''s challenge, once');
select t.as_user(:'n');
select couple_challenge_done(true);
select t.ok((select my_couple() -> 'weeks' -> -1) @> '{"me": true, "them": true}'::jsonb, 'and N did too');
select couple_challenge_done(false);
select t.ok((select my_couple() -> 'weeks' -> -1) @> '{"me": false, "them": true}'::jsonb, 'a tick can be taken back');
reset role;
update private.couple_weeks set week = week - 7 where couple_id = (select id from private.couples where a = :'m' and status = 'on');
set role authenticated;
select t.as_user(:'n');
select t.ok((select jsonb_array_length(my_couple() -> 'weeks')) = 2 and (select my_couple() -> 'weeks' -> 1 ->> 'challenge') <> (select my_couple() -> 'weeks' -> 0 ->> 'challenge'),
  'a new week brings a new challenge, never last week''s');

-- Nobody else reads or writes any of it.
select t.ok(t.fails('select * from private.couples') and t.fails('select * from private.couple_ideas') and t.fails('select * from private.couple_days')
  and t.fails('select * from private.couple_weeks'), 'no client can read the couple tables');
select t.ok(t.fails(format($$insert into private.couples (a, b, status) values (%L, %L, 'on')$$, :'p', :'n')), 'or write them');
select t.ok(t.fails(format('select private.matched(%L, %L)', :'m', :'n')), 'or call the private helpers');

-- The export carries it.
select t.as_user(:'m');
select t.ok((select export_my_data() -> 'couples' -> 0 ->> 'status') = 'on' and (select jsonb_array_length(export_my_data() -> 'couples' -> 0 -> 'challenges')) = 2,
  'M''s export holds the couple and its challenges');

-- A block ends it for good.
select t.as_user(:'n');
select block_user(:'m');
select t.ok((select my_couple() ->> 'status') = 'none' and (select my_couple() -> 'matches') = '[]'::jsonb, 'after a block, N has no couple and no match');
select unblock_user(:'m');
select t.ok((select my_couple() ->> 'status') = 'none', 'and unblocking does not bring the couple back');
select t.as_user(:'m');
select t.ok((select my_couple() ->> 'status') = 'none', 'M''s side is gone too');

-- Ending: a no ends an ask, and either can end Couple mode.
select couple_ask(:'n');
select t.as_user(:'n');
select couple_answer(false);
select t.ok((select my_couple() ->> 'status') = 'none', 'a no ends the ask quietly');
select couple_ask(:'m');
select t.as_user(:'m');
select couple_ask(:'n');
select t.ok((select my_couple() ->> 'status') = 'on', 'asking back someone who asked you says yes');
select t.ok((select my_couple() -> 'ideas') = '[]'::jsonb and (select my_couple() -> 'days') = '[]'::jsonb, 'a new couple starts with an empty list');
select couple_end();
select t.ok((select my_couple() ->> 'status') = 'none', 'M ends it');
select t.as_user(:'n');
select t.ok((select my_couple() ->> 'status') = 'none', 'for both');

-- Deleting an account takes the couple rows with it.
select couple_ask(:'m');
select t.as_user(:'m');
select couple_answer(true);
select delete_my_account();
reset role;
select t.ok(not exists (select 1 from private.couples where :'m' in (a, b)), 'deleting the account removes every couple row');
select t.ok(not has_table_privilege('pinkilock_analytics', 'private.couples', 'select'), 'the analytics worker cannot read couples');
