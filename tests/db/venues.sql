-- Suggested venues, after profile_rules.sql (which left Riya and Sana, and one open ask from Sana to Riya).
\set ON_ERROR_STOP on
\pset tuples_only on
\set r '00000000-0000-0000-0000-0000000000a1'
\set s '00000000-0000-0000-0000-0000000000a2'
\set v '00000000-0000-0000-0000-0000000000a3'

insert into auth.users (id) values (:'v');
insert into public.profiles (id, name, age, area) values (:'v', 'Veer', 27, 'Juhu');
insert into public.venues (id, city, area, name, kind, active) values ('test_closed', 'Mumbai', 'Nowhere', 'A place that closed', 'park', false);

select t.ok((select count(*) from public.venues where active) = 237 and (select count(distinct city) from public.venues where active) = 20
  and exists (select 1 from public.venues where id = 'mum_carter_road'), 'the venue catalogue has 237 places in 20 cities');
select t.ok(not exists (select 1 from public.venues where char_length(name || ', ' || area) > 60), 'every venue fits in the place field');

set role authenticated;
select t.as_user(:'v');
select t.ok((select count(*) from venues) = 238, 'a signed-in user reads the catalogue');
select t.ok(t.fails($$insert into venues values ('x', 'Mumbai', 'Bandra', 'My flat', 'landmark')$$) and t.fails($$update venues set name = 'My flat'$$) and t.fails('delete from venues'),
  'a user cannot change the catalogue');

-- A picked venue: the server writes the place, whatever the app sent as the typed place.
select (send_invite(:'r', 'boba_run', now() + interval '1 hour', 'my flat, call 98765 43210', '', 'mum_carter_road')).id as vr \gset
select t.ok((select (place, venue_id) = ('Carter Road Promenade, Bandra West', 'mum_carter_road') from invites where id = :'vr'),
  'an ask with a venue gets its place from the catalogue, not from what was typed');
select decline_invite(:'vr');

select t.ok(t.sqlstate(format($$select send_invite(%L, 'boba_run', now() + interval '1 hour', '', '', 'not_a_venue')$$, :'r')) = 'PL067', 'a venue that does not exist is refused (PL067)');
select t.ok(t.sqlstate(format($$select send_invite(%L, 'boba_run', now() + interval '1 hour', '', '', 'test_closed')$$, :'r')) = 'PL067', 'a venue that is switched off is refused (PL067)');
select t.ok(t.sqlstate(format($$select send_invite(%L, 'video_coffee', now() + interval '1 hour', '', '', 'mum_carter_road')$$, :'r')) = 'PL067', 'a venue on a video plan is refused (PL067)');

-- No venue: a typed place still works, and still goes through the contact check.
select (send_invite(:'r', 'boba_run', now() + interval '1 hour', ' Corner cafe, Khar ', '')).id as vr2 \gset
select t.ok((select (place, venue_id is null) = ('Corner cafe, Khar', true) from invites where id = :'vr2'), 'an ask with a typed place still works, with no venue');
select decline_invite(:'vr2');
select t.ok(t.sqlstate(format($$select send_invite(%L, 'boba_run', now() + interval '1 hour', 'wa.me/919876543210', '')$$, :'r')) = 'PL065', 'a typed place is still checked for contacts (PL065)');

-- The other person reads the venue on the invite; a stranger does not see the invite at all.
select (send_invite(:'r', 'chai_walk', now() + interval '2 hours', '', 'low stakes, high snacks.', 'mum_juhu_beach')).id as vr3 \gset
select t.as_user(:'r');
select t.ok((select place from invites where id = :'vr3') = 'Juhu Beach, Juhu', 'the person asked sees where');
reset role;
select t.ok((select props ->> 'venue' from public.events where invite_id = :'vr3' and type = 'ask_sent') = 'mum_juhu_beach', 'the event log records which venue was picked');
select t.ok((select props ? 'venue' from public.events where invite_id = :'vr2' and type = 'ask_sent') is false, 'and records none for a typed place');
select t.ok((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'send_invite') = 1, 'there is one send_invite');

set role anon;
select t.ok(t.fails('select count(*) from venues'), 'signed out, the catalogue cannot be read');
reset role;
