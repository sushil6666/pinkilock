-- Ratings, round two, and the card's columns (WP7), after review.sql. People of their own: U and V.
\set ON_ERROR_STOP on
\pset tuples_only on
\set u '00000000-0000-0000-0000-0000000000d4'
\set v '00000000-0000-0000-0000-0000000000d5'
\set w '00000000-0000-0000-0000-0000000000d6'
insert into auth.users (id) values (:'u'), (:'v'), (:'w');
insert into public.profiles (id, name, age, area) values (:'u', 'Uma', 25, 'Bandra'), (:'v', 'Ved', 26, 'Khar'), (:'w', 'Wren', 27, 'Juhu');

set role authenticated;
select t.as_user(:'u');
select (send_invite(:'v', 'video_coffee', now() + interval '5 minutes', '', '')).id as uv \gset
select t.ok(t.sqlstate(format('select rate_date(%L, true, true)', :'uv')) = 'PL074', 'an ask that is not kept cannot be rated (PL074)');
select t.as_user(:'v');
select offer_pinky(:'uv');
select t.as_user(:'u');
select offer_pinky(:'uv');
select t.check_in(:'uv');
select t.as_user(:'v');
select t.check_in(:'uv');

select t.as_user(:'u');
select t.ok((select (rated, round_two) = (false, false) from date_feedback(:'uv')), 'before answering: not rated, no round two');
select rate_date(:'uv', true, true);
select rate_date(:'uv', false, false, true);
select t.ok((select (rated, round_two) = (true, false) from date_feedback(:'uv')), 'U answered once; round two waits for V (and says nothing about V)');
select t.ok(t.fails('select count(*) from date_ratings'), 'no one can read the answers table');
select t.as_user(:'w');
select t.ok(t.sqlstate(format('select rate_date(%L, true, true)', :'uv')) = 'PL074', 'someone not on the plan cannot rate it');
select t.ok((select round_two from date_feedback(:'uv')) is not true, 'or learn about round two');
select t.as_user(:'v');
select rate_date(:'uv', true, true);
select t.ok((select round_two from date_feedback(:'uv')), 'both want to meet again: round two');
reset role;
select t.ok((select (worth, again, unsafe) = (true, true, false) from public.date_ratings where invite_id = :'uv' and user_id = :'u'), 'a second answer changed nothing');

-- The card's columns, and only those, from the table.
set role authenticated;
select t.as_user(:'u');
select t.ok((select count(*) from profile_cards where id = :'v') = 1, 'U still reads V''s card');
select t.ok(t.fails(format('select contact_strikes from profiles where id = %L', :'v')), 'moderation columns are not readable by clients');
select t.ok(t.fails(format('select suspended_at from profiles where id = %L', :'v')), 'nor the suspension');
select t.ok((select name from profiles where id = :'v') = 'Ved', 'the card''s own columns still are');
select t.ok((select count(*) from discover(20)) >= 1, 'discover still works on the rebuilt card');
reset role;
