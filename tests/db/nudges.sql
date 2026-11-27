-- Gentle pushes (D124), after city_standing.sql. G has a phone and a Couple mode ask from H; H has
-- a phone too; S has no phone; F turned reminders off. All in Mumbai (India time).
\set ON_ERROR_STOP on
\pset tuples_only on
\set g '00000000-0000-0000-0000-00000000ad01'
\set h '00000000-0000-0000-0000-00000000ad02'
\set s '00000000-0000-0000-0000-00000000ad03'
\set f '00000000-0000-0000-0000-00000000ad04'
insert into auth.users (id) values (:'g'), (:'h'), (:'s'), (:'f');
insert into public.profiles (id, name, age, area, city) values (:'g', 'Gita', 26, 'Bandra', 'Mumbai'), (:'h', 'Hari', 27, 'Khar', 'Mumbai'),
  (:'s', 'Sam', 25, 'Juhu', 'Mumbai'), (:'f', 'Farah', 25, 'Juhu', 'Mumbai');
insert into public.push_tokens (token, profile_id, platform) values ('ExponentPushToken[g]', :'g', 'android'), ('ExponentPushToken[h]', :'h', 'android'), ('ExponentPushToken[f]', :'f', 'android');

create or replace function t.nudges_for(p uuid) returns text language sql as $$
  select coalesce(string_agg(nudge_key, ' ' order by id), '') from public.notifications where recipient_id = p and nudge_key is not null;
$$;

-- Reminders are on by default and can be turned off.
set role authenticated;
select t.as_user(:'f');
select t.ok((select (my_nudges() ->> 'on')::boolean), 'reminders start on');
select t.ok(not (select (set_nudges(false) ->> 'on')::boolean), 'one switch turns them off');
select t.ok(not (select (my_nudges() ->> 'on')::boolean), 'and they stay off');
select t.ok(t.sqlstate('select set_nudges(null)') = 'PL234', 'on or off, nothing else (PL234)');
select t.ok(t.fails('select * from private.nudge_prefs') and t.fails('select private.queue_nudges()'), 'no client reads the switches or sends reminders');
select t.ok(not (export_my_data() -> 'reminders' ->> 'on')::boolean, 'the data download says reminders are off');
reset role;

-- Monday 30 November 2026. Before 10:00 in Mumbai, nothing.
select private.queue_nudges('2026-11-30 08:00+05:30');
select t.ok(t.nudges_for(:'g') = '', 'nothing before ten in the morning');
-- At noon: Monday's ideas for G and H; nothing for S (no phone) or F (off).
select private.queue_nudges('2026-11-30 12:00+05:30');
select t.ok(t.nudges_for(:'g') = 'week:2026-11-30' and t.nudges_for(:'h') = 'week:2026-11-30', 'Monday at noon: the new ideas');
select t.ok(t.nudges_for(:'s') = '' and t.nudges_for(:'f') = '', 'nobody without a phone, and nobody who turned them off');
select t.ok((select invite_id is null and kind = 'nudge_week' and title = 'Three new plan ideas' from public.notifications where recipient_id = :'g'), 'a reminder carries no invite');
-- An hour later, nothing new: once in 20 hours, and each reminder only once.
select private.queue_nudges('2026-11-30 13:00+05:30');
select t.ok(t.nudges_for(:'g') = 'week:2026-11-30', 'not twice in a day');

-- H asks G to start Couple mode (a row written by hand, as if they matched).
insert into private.couples (a, b, status, asked_at) values (:'h', :'g', 'asked', '2026-11-30 14:00+05:30');
select private.queue_nudges('2026-12-01 11:00+05:30');
select t.ok(t.nudges_for(:'g') like '% couple_ask:%', 'the next day G is reminded that Hari asked');
select t.ok((select body like 'Hari wants to start Couple mode%' from public.notifications where recipient_id = :'g' and kind = 'nudge_couple'), 'naming only the person who asked');
select t.ok(t.nudges_for(:'h') = 'week:2026-11-30', 'and the asker gets nothing for it');

-- A block drops a Couple mode reminder not sent yet.
insert into public.notifications (recipient_id, kind, title, body, nudge_key) values (:'h', 'nudge_couple', 't', 'b', 'test:block');
insert into public.blocks (blocker_id, blocked_id) values (:'s', :'h');
select t.ok(not exists (select 1 from public.notifications where nudge_key = 'test:block'), 'a block drops unsent Couple mode reminders');

-- They are on; Thursday, nobody has ticked the challenge.
update private.couples set status = 'on', since = '2026-12-01 12:00+05:30' where b = :'g';
insert into private.couple_weeks (couple_id, week, challenge, done) select id, '2026-11-30', 'cook_together', array[:'h']::uuid[] from private.couples where b = :'g';
select private.queue_nudges('2026-12-03 12:00+05:30');
select t.ok(t.nudges_for(:'g') like '% couple_week:%' and t.nudges_for(:'h') = 'week:2026-11-30', 'Thursday: G, who has not ticked, is reminded; H, who has, is not');
select t.ok((select count(*) from public.notifications where recipient_id = :'g' and nudge_key is not null) = 3, 'three for G this week');
-- Three in 7 days is the most: Saturday brings nothing more for G.
insert into public.invites (from_id, to_id, idea_id, starts_at, minutes, status, expires_at)
  values (:'g', :'h', 'video_coffee', '2026-11-25 18:00+05:30', 10, 'kept', '2026-11-24 18:00+05:30');
select private.queue_nudges('2026-12-05 12:00+05:30');
select t.ok((select count(*) from public.notifications where recipient_id = :'g' and nudge_key is not null) = 3, 'never more than 3 in 7 days');
select t.ok(t.nudges_for(:'h') like '% streak:2026-11-30', 'but H, who kept a plan last week and none this week, hears about the streak');

-- Self love: S uses it, no phone; H used it 5 days ago. Wednesday the 9th.
insert into private.self_moods (user_id, day, mood) values (:'h', '2026-12-04', 'good');
select private.queue_nudges('2026-12-09 12:00+05:30');
select t.ok(t.nudges_for(:'h') like '% self:2026-12-07', 'Wednesday: a gentle Self love check-in for someone who uses it');
-- A pause in Self love keeps everything quiet.
insert into private.self_love (user_id, paused_until) values (:'g', '2026-12-20 00:00+05:30') on conflict (user_id) do update set paused_until = excluded.paused_until;
select private.queue_nudges('2026-12-14 12:00+05:30');
select t.ok(t.nudges_for(:'g') not like '%week:2026-12-14%', 'paused in Self love: no reminders');
select t.ok(t.nudges_for(:'h') like '% week:2026-12-14', 'others still get Monday''s ideas');

-- Turning reminders off drops what is not sent yet; deleting the account takes the switch.
set role authenticated;
select t.as_user(:'h');
select set_nudges(false);
reset role;
select t.ok(not exists (select 1 from public.notifications where recipient_id = :'h' and nudge_key is not null and sent_at is null), 'off drops unsent reminders');
delete from auth.users where id = :'f';
select t.ok(not exists (select 1 from private.nudge_prefs where user_id = :'f'), 'deleting the account removes the switch');
select t.ok(t.fails($$insert into public.notifications (recipient_id, kind, title, body) values ('00000000-0000-0000-0000-00000000ad01', 'nudge_week', 'x', 'y')$$), 'a reminder must have its key');
set role authenticated;
select t.ok(not has_function_privilege('anon', 'public.set_nudges(boolean)', 'execute'), 'signed out, nothing');
reset role;
