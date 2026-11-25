-- Self love and Bounce back (D101), after discover_race.sql. People of their own: S (who uses it),
-- R (who looks for S), and N (no profile yet).
\set ON_ERROR_STOP on
\pset tuples_only on
\set s '00000000-0000-0000-0000-0000000005e1'
\set r '00000000-0000-0000-0000-0000000005e2'
\set n '00000000-0000-0000-0000-0000000005e3'
insert into auth.users (id) values (:'s'), (:'r'), (:'n');
insert into public.profiles (id, name, age, area, city) values (:'s', 'Sana', 26, 'Bandra West', 'Selftown'), (:'r', 'Rohan', 27, 'Khar West', 'Selftown');

set role authenticated;
select t.as_user(:'n');
select t.ok(t.sqlstate('select my_self_love()') = 'PL002', 'Self love needs a profile first (PL002)');

select t.as_user(:'s');
select t.ok((select my_self_love() -> 'moods') = '[]'::jsonb and (select my_self_love() -> 'paused_until') = 'null'::jsonb, 'a new person starts with nothing');

-- Mood check-in: one a day, which can be changed.
select save_mood('low');
select save_mood('good');
select t.ok((select jsonb_array_length(my_self_love() -> 'moods')) = 1 and (select my_self_love() -> 'moods' -> 0 ->> 'mood') = 'good', 'one mood a day; a second one replaces it');
select t.ok(t.sqlstate($$select save_mood('ecstatic')$$) = 'PL115', 'only moods from the list (PL115)');

-- Notes: the gratitude jar, the journal, boundaries.
select add_self_note('gratitude', '  chai with my sister  ');
select add_self_note('gratitude', 'a long walk');
select add_self_note('gratitude', 'finished the book');
select t.ok(t.sqlstate($$select add_self_note('gratitude', 'one more')$$) = 'PL118', 'three good things a day (PL118)');
select add_self_note('journal', 'that one stung, but I am fine');
select add_self_note('boundary', 'no plans after 10 pm on a first meet');
select t.ok((select count(*) from jsonb_array_elements(my_self_love() -> 'notes')) = 5, 'all five notes come back');
select t.ok(exists (select 1 from jsonb_array_elements(my_self_love() -> 'notes') x where x ->> 'body' = 'chai with my sister'), 'a note is trimmed');
select t.ok(t.sqlstate($$select add_self_note('diary', 'x')$$) = 'PL116', 'only the three kinds of note (PL116)');
select t.ok(t.sqlstate($$select add_self_note('journal', '   ')$$) = 'PL117' and t.sqlstate(format('select add_self_note(%L, %L)', 'journal', repeat('a', 301))) = 'PL117',
  'a note has a few words and at most 300 characters (PL117)');
select (my_self_love() -> 'notes' -> 0 ->> 'id')::bigint as note_id \gset
select remove_self_note(:note_id);
select t.ok((select count(*) from jsonb_array_elements(my_self_love() -> 'notes')) = 4, 'a note can be removed');
select t.ok(t.sqlstate(format('select remove_self_note(%s)', :note_id)) = 'PL120', 'and is then gone (PL120)');

-- Nobody else reads any of it.
select t.as_user(:'r');
select t.ok((select my_self_love() -> 'notes') = '[]'::jsonb and (select my_self_love() -> 'moods') = '[]'::jsonb, 'R sees only R''s own (empty) Self love');
select t.ok(t.fails('select * from private.self_notes') and t.fails('select * from private.self_moods') and t.fails('select * from private.self_love'),
  'no client can read the Self love tables');
select t.ok(t.fails(format($$insert into private.self_notes (user_id, kind, body, day) values (%L, 'journal', 'planted', current_date)$$, :'s')),
  'or write them');
select t.ok(t.sqlstate(format('select remove_self_note(%s)', :note_id + 1)) = 'PL120', 'R cannot remove S''s note (PL120)');

-- Pause: S leaves Discover, R stops seeing S, and S comes back.
select t.ok(exists (select 1 from discover(20) where id = :'s'), 'R sees S on Discover');
select t.as_user(:'s');
select t.ok(t.sqlstate('select pause_discover(15)') = 'PL121' and t.sqlstate('select pause_discover(-1)') = 'PL121', 'a pause is 1 to 14 days (PL121)');
select pause_discover(3);
select t.ok((select (my_self_love() ->> 'paused_until')::timestamptz) between now() + interval '71 hours' and now() + interval '73 hours', 'S is paused for three days');
select t.as_user(:'r');
reset role;
delete from private.discover_seen where user_id = :'r';
set role authenticated;
select t.as_user(:'r');
select t.ok(not exists (select 1 from discover(20) where id = :'s'), 'R no longer sees S on Discover');
select t.as_user(:'s');
select t.ok((select count(*) from discover(20) where id = :'r') = 1, 'S still sees Discover while paused');
select pause_discover(0);
select t.ok((select my_self_love() -> 'paused_until') = 'null'::jsonb, 'S comes back');
select t.as_user(:'r');
select t.ok(exists (select 1 from discover(20) where id = :'s'), 'and R sees S again');

-- The 3-day reset: a step opens on its own day.
select t.as_user(:'s');
select t.ok(t.sqlstate('select do_reset_step(1)') = 'PL122', 'no step before the reset starts (PL122)');
select start_reset();
select do_reset_step(1);
select t.ok(t.sqlstate('select do_reset_step(2)') = 'PL122', 'day two opens tomorrow (PL122)');
select t.ok((select my_self_love() -> 'reset' -> 'done') = '[1]'::jsonb, 'day one is done');
reset role;
update private.self_love set reset_started = reset_started - 2 where user_id = :'s';
set role authenticated;
select t.as_user(:'s');
select do_reset_step(3);
select do_reset_step(3);
select t.ok((select my_self_love() -> 'reset' -> 'done') = '[1, 3]'::jsonb, 'two days later day three is open, and counts once');
select start_reset();
select t.ok((select my_self_love() -> 'reset' -> 'done') = '[]'::jsonb, 'starting again starts from day one');

-- The export carries all of it; deleting the account takes all of it.
select export_my_data() -> 'self_love' as sl, export_my_data() ->> 'format' as fmt \gset
select t.ok((:'sl'::jsonb -> 'notes') @> '[{"kind": "journal"}]'::jsonb, 'S''s export holds S''s notes');
select t.ok(jsonb_array_length(:'sl'::jsonb -> 'moods') = 1, 'and moods');
select t.ok(:'fmt' = 'pinkilock-export-7', 'in format 7');
select delete_my_account();
reset role;
select t.ok(not exists (select 1 from private.self_notes where user_id = :'s') and not exists (select 1 from private.self_moods where user_id = :'s')
  and not exists (select 1 from private.self_love where user_id = :'s'), 'deleting the account removes every Self love row');
-- Never for the analytics worker.
select t.ok(not has_table_privilege('pinkilock_analytics', 'private.self_notes', 'select') and not has_table_privilege('pinkilock_analytics', 'private.self_moods', 'select'),
  'the analytics worker cannot read moods or notes');
