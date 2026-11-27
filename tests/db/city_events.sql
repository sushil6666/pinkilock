-- City events (D121), after pink_gold.sql. People of their own: E in Mumbai, F in Pune, G with no profile.
\set ON_ERROR_STOP on
\pset tuples_only on
\set e '00000000-0000-0000-0000-0000000e0001'
\set f '00000000-0000-0000-0000-0000000e0002'
\set g '00000000-0000-0000-0000-0000000e0003'
insert into auth.users (id) values (:'e'), (:'f'), (:'g');
insert into public.profiles (id, name, age, area, city) values (:'e', 'Esha', 26, 'Bandra West', 'Mumbai'), (:'f', 'Farid', 27, 'Baner', 'Pune');

-- The team adds events (here as the table owner, as in the SQL editor).
insert into public.city_events (id, city, title, emoji, place, venue_id, idea_id, starts_at, ends_at, free) values
  ('t_now', 'Mumbai', 'Sunday flea market', '🛍️', null, 'mum_carter_road', 'thrift_dare', now() - interval '1 hour', now() + interval '5 hours', true),
  ('t_soon', 'Mumbai', 'Street food week', '🥘', 'Bandra Fort grounds', null, 'momo_stop', now() + interval '3 days', now() + interval '6 days', false),
  ('t_far', 'Mumbai', 'Next month''s concert', '🎶', 'NSCI Dome', null, null, now() + interval '20 days', now() + interval '20 days 3 hours', false),
  ('t_done', 'Mumbai', 'Yesterday''s fair', '🎡', 'MMRDA grounds', null, null, now() - interval '2 days', now() - interval '1 day', false),
  ('t_off', 'Mumbai', 'Called off', '❌', 'Worli', null, null, now() + interval '1 day', now() + interval '2 days', false),
  ('t_pune', 'Pune', 'Pune lake walk', '🌅', 'Pashan Lake', null, null, now() + interval '1 day', now() + interval '1 day 2 hours', true);
update public.city_events set active = false where id = 't_off';

select t.ok(t.sqlstate($$insert into public.city_events (id, city, title, starts_at, ends_at) values ('t_nowhere', 'Mumbai', 'No place', now(), now() + interval '1 hour')$$) = '23514',
  'an event needs a place or a venue');
select t.ok(t.sqlstate($$insert into public.city_events (id, city, title, place, starts_at, ends_at, url) values ('t_http', 'Mumbai', 'Bad link', 'Somewhere', now(), now() + interval '1 hour', 'http://example.com')$$) = '23514',
  'a link must be https');
select t.ok(t.sqlstate($$insert into public.city_events (id, city, title, place, starts_at, ends_at) values ('t_long', 'Mumbai', 'Too long', 'Somewhere', now(), now() + interval '40 days')$$) = '23514',
  'an event lasts a month at most');

set role authenticated;
select t.as_user(:'g');
select t.ok(t.sqlstate('select * from city_events()') = 'PL002', 'city events need a profile first (PL002)');

select t.as_user(:'e');
select t.ok((select array_agg(id order by starts_at) from city_events()) = array['t_now', 't_soon'],
  'E sees what is on in Mumbai now and in the next two weeks, soonest first: not past, far off, switched off or in Pune');
select t.ok((select place from city_events() where id = 't_now') = 'Carter Road Promenade, Bandra West', 'a venue''s name and area stand in for the place');
select t.ok((select idea_id from city_events() where id = 't_soon') = 'momo_stop', 'and an event carries its idea');

select t.as_user(:'f');
select t.ok((select array_agg(id) from city_events()) = array['t_pune'], 'F sees only Pune''s');

-- No client reads or writes the table itself.
select t.ok(t.fails('select * from public.city_events'), 'no client reads the table');
select t.ok(t.fails($$insert into public.city_events (id, city, title, place, starts_at, ends_at) values ('t_spam', 'Mumbai', 'Spam', 'x y', now(), now() + interval '1 hour')$$), 'or writes it');
reset role;
select t.ok(not has_table_privilege('anon', 'public.city_events', 'select') and not has_function_privilege('anon', 'public.city_events()', 'execute'), 'signed out, nothing');
