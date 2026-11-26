-- Spicy terms and quiz (D107), after wallet.sql. People of their own: K (marks the shared table),
-- and P and Q (shown to each other on Discover, both 18+ with an email).
\set ON_ERROR_STOP on
\pset tuples_only on
\ir spicy_quiz_cases.sql
grant select on spicy_quiz, spicy_quiz_cases to authenticated;
\set k '00000000-0000-0000-0000-00000007a1c1'
\set p '00000000-0000-0000-0000-00000007a1c2'
\set q '00000000-0000-0000-0000-00000007a1c3'
insert into auth.users (id, email) values (:'k', 'k@example.test'), (:'p', 'p@example.test'), (:'q', 'q@example.test');
insert into public.profiles (id, name, age, area) values (:'k', 'Kavya', 25, 'Bandra'), (:'p', 'Pooja', 24, 'Khar'), (:'q', 'Qasim', 27, 'Juhu');
insert into private.discover_seen (user_id, card_id) values (:'p', :'q'), (:'q', :'p');

-- The key and the version: SQL and src/domain/spicyQuiz.ts agree.
select t.ok((select version from spicy_quiz) = private.spicy_terms_version(), 'the terms version is the same in SQL and the app');
select t.ok((select key from spicy_quiz) = private.spicy_quiz_key() and (select ids from spicy_quiz) = private.spicy_quiz_ids(), 'the answer key is the same in SQL and the app');

-- The marking: every line of the shared table gives the same answer in SQL.
create function pg_temp.quiz_result(p_version int, p_agree boolean, p_answers text[]) returns text language plpgsql as $$
declare
  r jsonb;
begin
  r := public.pass_spicy_quiz(p_version, p_agree, p_answers);
  return case when (r ->> 'passed')::boolean then 'pass'
              else (select string_agg(w, ',' order by n) from jsonb_array_elements_text(r -> 'wrong') with ordinality x(w, n)) end;
exception when others then
  return sqlstate;
end $$;
set role authenticated;
select t.as_user(:'k');
select t.ok(bad is null, coalesce('every shared quiz line gives the same answer in SQL (' || bad || ')', 'every shared quiz line gives the same answer in SQL'))
  from (select string_agg(format('%s %s %s: %s, want %s', version, agree, answers, pg_temp.quiz_result(version, agree, answers), want), '; ')
          filter (where pg_temp.quiz_result(version, agree, answers) <> want) as bad from spicy_quiz_cases) c;
reset role;
delete from public.consents where user_id = :'k';

set role authenticated;
-- Before the quiz: no Spicy.
select t.as_user(:'p');
select t.ok((select spicy_terms()) @> '{"version": 1, "passed": false, "passed_at": null, "outdated": false}'::jsonb, 'a new person has not passed');
select t.ok(t.sqlstate($$select save_spicy(true, true, 'pooja.p', '', '', '{}')$$) = 'PL154', 'Spicy cannot turn on before the quiz (PL154)');
-- A miss keeps nothing and names the questions.
select t.ok((select pass_spicy_quiz(1, true, array['b', 'a', 'a', 'b', 'a'])) = '{"passed": false, "wrong": ["camera", "stop"]}'::jsonb, 'a miss says which questions were wrong');
select t.ok(not (select spicy_terms() ->> 'passed')::boolean and t.sqlstate($$select save_spicy(true, true, 'pooja.p', '', '', '{}')$$) = 'PL154', 'and passes nothing');
-- All right: kept, by version, and Spicy can turn on.
select t.ok((select pass_spicy_quiz(1, true, array['b', 'c', 'a', 'b', 'c'])) = '{"passed": true, "wrong": []}'::jsonb, 'all five right is a pass');
select t.ok((select spicy_terms()) @> '{"version": 1, "passed": true, "outdated": false}'::jsonb and (select spicy_terms() ->> 'passed_at') is not null, 'the pass is kept');
select t.ok((select pass_spicy_quiz(1, true, array['b', 'c', 'a', 'b', 'c'])) ->> 'passed' = 'true', 'passing again is fine');
select save_spicy(true, true, 'pooja.p', '', '', '{slow}');
select t.ok((select my_spicy() ->> 'on')::boolean, 'after the pass, Spicy turns on');
select t.ok((select export_my_data() -> 'consents') @> '[{"kind": "spicy", "version": "spicy-1"}]'::jsonb, 'the pass is in the data download');
select t.ok(t.sqlstate($$select give_consents(array['spicy'])$$) = 'PL079', 'the pass cannot be given as a plain consent');

-- Q turns it on too: open between them.
select t.as_user(:'q');
select pass_spicy_quiz(1, true, array['b', 'c', 'a', 'b', 'c']);
select save_spicy(true, true, 'qasim.q', '', '', '{}');
select spicy_yes(:'p', true);
select t.ok((select spicy_with(:'p') ->> 'open')::boolean, 'both passed and on: open');
reset role;

-- The terms change (a new migration would do this): Spicy pauses for both until each passes again.
create or replace function private.spicy_terms_version() returns int language sql immutable set search_path = '' as $$ select 2 $$;
set role authenticated;
select t.as_user(:'p');
select t.ok((select spicy_terms()) @> '{"version": 2, "passed": false, "passed_at": null, "outdated": true}'::jsonb, 'after a change, the old pass is out of date');
select t.ok((select spicy_with(:'q')) = '{"open": false}'::jsonb, 'and Spicy is closed on Q''s card');
select t.ok(t.sqlstate(format('select spicy_yes(%L, true)', :'q')) = 'PL130', 'no yes while paused (PL130)');
select t.ok(t.sqlstate($$select save_spicy(true, true, 'pooja.p', '', '', '{}')$$) = 'PL154', 'no saving while paused (PL154)');
select t.ok(t.sqlstate($$select pass_spicy_quiz(1, true, array['b', 'c', 'a', 'b', 'c'])$$) = 'PL155', 'answers for the old terms are refused (PL155)');
select t.ok((select pass_spicy_quiz(2, true, array['b', 'c', 'a', 'b', 'c'])) ->> 'passed' = 'true', 'P passes the new version');
select t.ok((select spicy_with(:'q')) = '{"open": false}'::jsonb, 'still closed: Q has not passed the new terms');
select t.as_user(:'q');
select t.ok((select spicy_with(:'p')) = '{"open": false}'::jsonb, 'closed for Q too, and Q is told nothing about P');
select pass_spicy_quiz(2, true, array['b', 'c', 'a', 'b', 'c']);
select t.ok((select spicy_with(:'p')) @> '{"open": true, "my_yes": true}'::jsonb, 'both passed again: open, and Q''s yes was kept');
reset role;
create or replace function private.spicy_terms_version() returns int language sql immutable set search_path = '' as $$ select 1 $$;
revoke all on function private.spicy_terms_version() from public, anon, authenticated;

-- Account deletion takes the pass with it.
delete from auth.users where id = :'k';
select t.ok(not exists (select 1 from public.consents where user_id = :'k'), 'a deleted account keeps no pass');
