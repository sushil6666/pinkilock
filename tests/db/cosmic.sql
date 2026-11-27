-- Cosmic match (D129), after experts.sql (uses t.kept_pair from couple.sql). R and S match;
-- U kept a plan with R but did not match; V has no profile.
\set ON_ERROR_STOP on
\pset tuples_only on
\ir guna_cases.sql
\set r '00000000-0000-0000-0000-0000c05a0001'
\set s '00000000-0000-0000-0000-0000c05a0002'
\set u '00000000-0000-0000-0000-0000c05a0003'
\set v '00000000-0000-0000-0000-0000c05a0004'
insert into auth.users (id) values (:'r'), (:'s'), (:'u'), (:'v');
insert into public.profiles (id, name, age, area) values (:'r', 'Riya', 26, 'Bandra'), (:'s', 'Sahil', 28, 'Khar'), (:'u', 'Uma', 27, 'Juhu');
select ((now() at time zone 'Asia/Kolkata')::date - interval '26 years' - interval '10 days')::date as r_date,
       ((now() at time zone 'Asia/Kolkata')::date - interval '28 years' - interval '40 days')::date as s_date,
       ((now() at time zone 'Asia/Kolkata')::date - interval '27 years' - interval '3 days')::date as u_date \gset

-- The SQL and the app score every shared case the same.
select t.ok((select count(*) from guna_cases g
             where (select sum(v::numeric) from jsonb_each_text(private.guna(g.a, g.b)) e(k, v)) <> g.score) = 0,
  'private.guna agrees with src/domain/cosmic.ts on every shared case');
select t.ok((select count(*) from life_path_cases c where private.life_path(c.d) <> c.n) = 0, 'and on the life path numbers');
select t.ok(private.guna(10, 200) = private.guna(200, 10) or
  (select sum(v::numeric) from jsonb_each_text(private.guna(10, 200)) e(k, v)) = (select sum(v::numeric) from jsonb_each_text(private.guna(200, 10)) e(k, v)),
  'the same whichever chart is first');

select t.kept_pair(:'r', :'s', true, true);
select t.kept_pair(:'r', :'u', true, false);

set role authenticated;
select t.as_user(:'v');
select t.ok(t.sqlstate('select my_cosmic()') = 'PL002', 'a profile first (PL002)');
select t.as_user(:'r');
select t.ok((select my_cosmic() -> 'me' ->> 'on') = 'false', 'off until I turn it on');
select t.ok((select jsonb_array_length(my_cosmic() -> 'pairs')) = 1 and (select my_cosmic() -> 'pairs' -> 0 ->> 'profile_id') = :'s',
  'only S, who matched; not U, who did not want round two');
select t.ok((select my_cosmic() -> 'pairs' -> 0 -> 'score') = 'null'::jsonb, 'no score while neither is on');
select t.ok(t.sqlstate($$select cosmic_save('2026-01-01', null, 100)$$) = 'PL246', 'an adult''s birth date (PL246)');
select t.ok(t.sqlstate(format('select cosmic_save(%L, null, 100)', (:'r_date'::date - interval '10 years')::date)) = 'PL247', 'the age on my card (PL247)');
select t.ok(t.sqlstate(format('select cosmic_save(%L, %L, 100)', :'r_date', '8:30')) = 'PL248', 'a time like 08:30 (PL248)');
select t.ok(t.sqlstate(format('select cosmic_save(%L, null, 400)', :'r_date')) = 'PL246', 'a Moon from 0 to 360');
select t.ok((select cosmic_save(:'r_date', '08:30', 237.95) -> 'me' ->> 'birth_time') = '08:30', 'R turns it on');
select t.ok((select my_cosmic() -> 'pairs' -> 0 -> 'score') = 'null'::jsonb, 'still no score while S is off');
select t.ok(t.fails('select * from private.cosmic'), 'no client reads birth details');
select t.as_user(:'s');
select t.ok((select my_cosmic() -> 'pairs' -> 0 -> 'score') = 'null'::jsonb and (select my_cosmic() -> 'pairs' -> 0 -> 'kootas') = 'null'::jsonb,
  'S, still off, sees nothing of R''s');
select cosmic_save(:'s_date', null, 217.25);
select t.ok((select (my_cosmic() -> 'pairs' -> 0 ->> 'score')::numeric) = 30.5, 'both on: S sees the score (30.5 of 36)');
select t.ok(not (my_cosmic() -> 'pairs' -> 0 ? 'birth_date') and not (my_cosmic() -> 'pairs' -> 0 ? 'moon')
  and (select my_cosmic() -> 'pairs' -> 0 ->> 'their_number') is not null, 'and R''s number, never R''s date or Moon');
select t.as_user(:'r');
select t.ok((select (my_cosmic() -> 'pairs' -> 0 ->> 'score')::numeric) = 30.5, 'R sees the same score');
select t.ok((select export_my_data() -> 'cosmic_match' ->> 'birth_time') = '08:30', 'the data download has R''s birth details');
reset role;

-- A block hides it at once.
insert into public.blocks (blocker_id, blocked_id) values (:'s', :'r');
set role authenticated;
select t.as_user(:'r');
select t.ok((select jsonb_array_length(my_cosmic() -> 'pairs')) = 0, 'after a block, no score');
select t.ok((select cosmic_off() -> 'me' ->> 'on') = 'false', 'R turns it off');
reset role;
select t.ok(not exists (select 1 from private.cosmic where user_id = :'r'), 'and R''s birth details are gone');
delete from auth.users where id = :'s';
select t.ok(not exists (select 1 from private.cosmic where user_id = :'s'), 'deleting an account removes them');
set role authenticated;
select t.ok(not has_function_privilege('anon', 'public.my_cosmic()', 'execute'), 'signed out, nothing');
reset role;
