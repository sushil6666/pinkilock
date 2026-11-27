-- Where I stand in my city (D122), after pink_gold.sql. 25 people in Standtown with scores, one
-- newcomer N there, and K in Smallville (too few people).
\set ON_ERROR_STOP on
\pset tuples_only on
\set n '00000000-0000-0000-0000-00000005a0ff'
\set k '00000000-0000-0000-0000-00000005a0fe'
insert into auth.users (id) select ('00000000-0000-0000-0000-00000005a0' || lpad(to_hex(g), 2, '0'))::uuid from generate_series(1, 25) g;
insert into auth.users (id) values (:'n'), (:'k');
insert into public.profiles (id, name, age, area, city)
  select ('00000000-0000-0000-0000-00000005a0' || lpad(to_hex(g), 2, '0'))::uuid, 'Person', 25, 'Area', 'Standtown' from generate_series(1, 25) g;
insert into public.profiles (id, name, age, area, city) values (:'n', 'Neha', 24, 'Area', 'Standtown'), (:'k', 'Kiran', 24, 'Area', 'Smallville');
-- Scores 100 down to 52; person 1 is best.
insert into public.trust_scores (profile_id, score, kept, flaked)
  select ('00000000-0000-0000-0000-00000005a0' || lpad(to_hex(g), 2, '0'))::uuid, 102 - 2 * g, 10, 1 from generate_series(1, 25) g;
insert into public.trust_scores (profile_id, score, kept, flaked) values (:'k', 100, 9, 0);

set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000005a001');
select t.ok((select my_city_standing() ->> 'top')::int = 5 and (select (my_city_standing() ->> 'ready')::boolean), 'the best of 25 is in the top 5 percent');
select t.as_user('00000000-0000-0000-0000-00000005a003');
select t.ok((select my_city_standing() ->> 'top')::int = 25, 'third of 25 (12 percent) is in the top 25');
select t.as_user('00000000-0000-0000-0000-00000005a00c');
select t.ok((select my_city_standing() ->> 'top')::int = 50, '12th of 25 (48 percent) is in the top half');
select t.as_user('00000000-0000-0000-0000-00000005a019');
select t.ok((select my_city_standing() -> 'top') = 'null'::jsonb, 'below the top half there is no badge');
select t.as_user(:'n');
select t.ok((select my_city_standing() -> 'top') = 'null'::jsonb and (select (my_city_standing() ->> 'ready')::boolean), 'a newcomer with no promises gets no badge yet');
select t.as_user(:'k');
select t.ok((select my_city_standing() -> 'top') = 'null'::jsonb and not (select (my_city_standing() ->> 'ready')::boolean),
  'in a city with fewer than 20 people, nobody is ranked, even the best');
select t.ok(not (my_city_standing()::text ~ '[0-9a-f]{8}-[0-9a-f]{4}'), 'the answer never names anyone');

-- The city's month: shown once 20 plans between its people were resolved in the last 30 days.
select t.as_user(:'n');
select t.ok((select my_city_standing() -> 'city_kept_percent') = 'null'::jsonb, 'too few plans: no city figure');
reset role;
insert into public.invites (from_id, to_id, idea_id, starts_at, minutes, status, expires_at)
  select ('00000000-0000-0000-0000-00000005a0' || lpad(to_hex(g), 2, '0'))::uuid, ('00000000-0000-0000-0000-00000005a0' || lpad(to_hex(g + 1), 2, '0'))::uuid,
         'video_coffee', now() - interval '2 days', 10, (case when g <= 20 then 'kept' else 'flaked' end)::invite_status, now() - interval '3 days'
  from generate_series(1, 24) g;
set role authenticated;
select t.as_user(:'n');
select t.ok((select (my_city_standing() ->> 'city_kept_percent')::int) = 83, 'Standtown kept 20 of 24 plans: 83 percent');
select t.as_user(:'k');
select t.ok((select my_city_standing() -> 'city_kept_percent') = 'null'::jsonb, 'Smallville''s figure counts only its own plans');
reset role;
select t.ok(not has_function_privilege('anon', 'public.my_city_standing()', 'execute'), 'signed out, nothing');
