-- Pink Gold (D115), after talk.sql. People of their own: G (made a member), H (sees G's card),
-- B (blocked by G).
\set ON_ERROR_STOP on
\pset tuples_only on
\set g '00000000-0000-0000-0000-000000060101'
\set h '00000000-0000-0000-0000-000000060102'
\set b '00000000-0000-0000-0000-000000060103'
insert into auth.users (id, email) values (:'g', 'g@example.test'), (:'h', 'h@example.test'), (:'b', 'b@example.test');
insert into public.profiles (id, name, age, area, city) values (:'g', 'Gauri', 24, 'Bandra West', 'Goldtown'),
  (:'h', 'Harsh', 25, 'Khar West', 'Goldtown'), (:'b', 'Bunty', 26, 'Juhu', 'Goldtown');

set role authenticated;
select t.as_user(:'h');
select t.ok((select d.pink_gold from discover() d where d.id = :'g') = false, 'a new person is not Pink Gold');
reset role;

-- The team makes G a member (the SQL editor runs as the owner).
select private.pink_gold_grant(:'g', null, 'founding member');
set role authenticated;
select t.as_user(:'h');
select t.ok((select d.pink_gold from discover() d where d.id = :'g') = true, 'on Discover, H sees G''s card say Pink Gold');
select t.ok((select pink_gold from profile_cards where id = :'h') = false, 'and H''s own card does not');
select t.as_user(:'g');
select t.ok((select pink_gold from profile_cards where id = :'g') = true, 'G''s own card (Me) says Pink Gold');
select t.as_user(:'g');
select t.ok((export_my_data() -> 'pink_gold' ->> 'now')::boolean and (export_my_data() -> 'pink_gold' ->> 'until') is null
  and not (export_my_data() -> 'pink_gold') ? 'note', 'G''s download says G is Pink Gold, without the team''s note');
select t.ok((export_my_data() ->> 'format') like 'pinkilock-export-%', 'and keeps the format name of the download before it');
select block_user(:'b');
select t.as_user(:'b');
select t.ok(not exists (select 1 from discover() d where d.id = :'g') and not exists (select 1 from profile_cards where id = :'g'),
  'a blocked person sees no card, so no badge either');
reset role;

-- A membership with an end date stops by itself; running the grant again changes the date.
select private.pink_gold_grant(:'g', now() + interval '1 day');
select t.ok(private.is_pink_gold(:'g') and (select note from private.pink_gold where user_id = :'g') = 'founding member', 'a new end date keeps the note');
update private.pink_gold set since = now() - interval '2 days', until = now() - interval '1 second' where user_id = :'g';
set role authenticated;
select t.as_user(:'h');
select t.ok((select d.pink_gold from discover() d where d.id = :'g') = false, 'after the end date the badge is gone');
reset role;

select private.pink_gold_grant(:'g');
select t.ok(private.is_pink_gold(:'g') and (select since from private.pink_gold where user_id = :'g') > now() - interval '1 minute', 'a member again starts from now');
select private.pink_gold_end(:'g');
select t.ok(not private.is_pink_gold(:'g') and exists (select 1 from private.pink_gold where user_id = :'g'), 'ending it takes the badge off and keeps the row');
set role authenticated;
select t.as_user(:'g');
select t.ok(not (export_my_data() -> 'pink_gold' ->> 'now')::boolean, 'and G''s download says G was a member, not now');
reset role;
