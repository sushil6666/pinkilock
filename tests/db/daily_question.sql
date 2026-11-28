-- Question of the day (D125), after nudges.sql. A and B are a couple (rows written by hand, as if
-- they matched); C is in no couple.
\set ON_ERROR_STOP on
\pset tuples_only on
\set a '00000000-0000-0000-0000-00000000ae01'
\set b '00000000-0000-0000-0000-00000000ae02'
\set c '00000000-0000-0000-0000-00000000ae03'
insert into auth.users (id) values (:'a'), (:'b'), (:'c');
insert into public.profiles (id, name, age, area, city) values (:'a', 'Asha', 26, 'Bandra', 'Mumbai'), (:'b', 'Bilal', 27, 'Khar', 'Mumbai'), (:'c', 'Chitra', 25, 'Juhu', 'Mumbai');
insert into private.couples (a, b, status, since) values (:'a', :'b', 'on', now() - interval '10 days');

create or replace function t.question_ids() returns text[] language sql security definer as $$ select private.couple_question_ids() $$;
grant execute on function t.question_ids() to public;

set role authenticated;
select t.as_user(:'c');
select t.ok(t.sqlstate('select couple_question()') = 'PL221' and t.sqlstate($$select couple_question_answer('hi')$$) = 'PL221', 'no couple, no question (PL221)');

select t.as_user(:'a');
select t.ok((select couple_question() -> 'today' ->> 'question') = any (array(select unnest(t.question_ids()))), 'a question from the list');
select t.ok((select couple_question() -> 'today' -> 'mine') = 'null'::jsonb and not (select (couple_question() -> 'today' ->> 'they_answered')::boolean), 'nobody has answered yet');
select t.ok(t.sqlstate($$select couple_question_answer('   ')$$) = 'PL235' and t.sqlstate(format('select couple_question_answer(%L)', repeat('x', 301))) = 'PL235', 'an empty or long answer is refused (PL235)');
select t.ok((select couple_question_answer('  Samosa, never  ') -> 'today' ->> 'mine') = 'Samosa, never', 'A answers, trimmed');
select t.ok(t.sqlstate($$select couple_question_answer('again')$$) = 'PL236', 'once a day (PL236)');
select t.ok((select couple_question() -> 'today' -> 'theirs') = 'null'::jsonb, 'B has not answered: nothing to see');

select t.as_user(:'b');
select t.ok((select (couple_question() -> 'today' ->> 'they_answered')::boolean) and (select couple_question() -> 'today' -> 'theirs') = 'null'::jsonb,
  'B sees that A answered, but not what, before answering');
select t.ok((select couple_question_answer('Jalebi') -> 'today' ->> 'theirs') = 'Samosa, never', 'once B answers, B sees A''s');
select t.as_user(:'a');
select t.ok((select couple_question() -> 'today' ->> 'theirs') = 'Jalebi' and (select (couple_question() ->> 'streak')::int) = 1, 'and A sees B''s; a 1-day streak');
reset role;

-- Two earlier days both answered, then a gap: the streak counts only the run up to today.
insert into private.couple_answers (couple_id, day, user_id, question, body)
  select c.id, private.local_today(:'a') - g, u, 'chai_or_coffee', 'Chai'
  from private.couples c, generate_series(1, 2) g, unnest(array[:'a', :'b']::uuid[]) u where c.a = :'a';
insert into private.couple_answers (couple_id, day, user_id, question, body)
  select c.id, private.local_today(:'a') - 4, :'a', 'superpower', 'Teleport' from private.couples c where c.a = :'a';
set role authenticated;
select t.as_user(:'a');
select t.ok((select (couple_question() ->> 'streak')::int) = 3, 'three days in a row');
select t.ok((select jsonb_array_length(couple_question() -> 'past')) = 2, 'the past shows only days both answered');
select t.ok(t.fails('select * from private.couple_answers') and t.fails($$select private.couple_question_state('00000000-0000-0000-0000-00000000ae02')$$),
  'no client reads the answers table or another person''s state');
select t.ok((select jsonb_array_length(export_my_data() -> 'couple_answers')) = 4, 'the data download has my own answers only');
reset role;

-- The question walks the list: none comes back within the list's length.
select t.ok((select count(distinct private.couple_question_of(c, d::date)) from private.couples c, generate_series(date '2026-12-01', date '2026-12-01' + (array_length(private.couple_question_ids(), 1) - 1), '1 day') d where c.a = :'a')
  = array_length(private.couple_question_ids(), 1), 'no question repeats within the list''s length');

-- A block ends the couple; the question goes with it. Deleting an account removes its answers.
insert into public.blocks (blocker_id, blocked_id) values (:'b', :'a');
set role authenticated;
select t.as_user(:'a');
select t.ok(t.sqlstate('select couple_question()') = 'PL221', 'after a block there is no question');
reset role;
delete from auth.users where id = :'b';
select t.ok(not exists (select 1 from private.couple_answers where user_id = :'b'), 'deleting an account removes its answers');
set role authenticated;
select t.ok(not has_function_privilege('anon', 'public.couple_question_answer(text)', 'execute'), 'signed out, nothing');
reset role;
