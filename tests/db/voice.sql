-- Spicy calls in Pinkilock, audio only (D111), after calls.sql. People of their own: H and J (an
-- unlocked match with a call due now), K (Spicy on, never matched with H).
\set ON_ERROR_STOP on
\pset tuples_only on
\set h '00000000-0000-0000-0000-0000000f0111'
\set j '00000000-0000-0000-0000-0000000f0112'
\set k '00000000-0000-0000-0000-0000000f0113'
insert into auth.users (id, email) values (:'h', 'h@example.test'), (:'j', 'j@example.test'), (:'k', 'k@example.test');
insert into public.profiles (id, name, age, area, city) values (:'h', 'Hema', 25, 'Bandra West', 'Voicetown'), (:'j', 'Jai', 27, 'Khar West', 'Voicetown'),
  (:'k', 'Kavya', 24, 'Juhu', 'Voicetown');
insert into private.spicy (user_id, discord, adult_at, rules_at)
  select u, 'person.' || right(u::text, 2), now(), now() from unnest(array[:'h', :'j', :'k']::uuid[]) u;
insert into private.discover_seen (user_id, card_id) values (:'h', :'j'), (:'j', :'h'), (:'h', :'k'), (:'k', :'h');
insert into private.spicy_yes (user_id, other_id) values (:'h', :'j'), (:'j', :'h'), (:'h', :'k'), (:'k', :'h');

-- Only the Edge Function (service role) may ask for a room or report what LiveKit saw.
set role authenticated;
select t.as_user(:'h');
select t.ok(t.fails(format('select spicy_voice_room(%L, %L)', :'h', :'j')) and t.fails(format($$select spicy_voice_event('spicy_x', %L, 'participant_joined', now())$$, :'h')),
  'no client can ask for a voice room or report a join');
select t.ok(t.fails('select * from private.spicy_call_voice') and t.fails('select * from private.spicy_shares')
  and t.fails(format($$insert into private.spicy_shares (user_id, other_id) values (%L, %L)$$, :'h', :'j')), 'or read or write the voice sessions and the shares');
reset role;

set role service_role;
select t.ok(t.sqlstate(format('select spicy_voice_room(%L, %L)', :'h', :'j')) = 'PL149', 'no room before the match is unlocked (PL149)');
reset role;
insert into private.spicy_unlocks (a, b, paid_a, unlocked_at) values (least(:'h'::uuid, :'j'::uuid), greatest(:'h'::uuid, :'j'::uuid), 600, now());
set role authenticated;
select t.as_user(:'h');
select spicy_call_pick(:'j', array[date_trunc('hour', now()) + interval '3 hours'], 10);
select t.as_user(:'j');
select spicy_call_pick(:'h', array[date_trunc('hour', now()) + interval '3 hours'], 10);
reset role;
set role service_role;
select t.ok(t.sqlstate(format('select spicy_voice_room(%L, %L)', :'h', :'j')) = 'PL153', 'no room hours before the call (PL153)');
select t.ok(t.sqlstate(format('select spicy_voice_room(%L, %L)', :'k', :'j')) = 'PL130' and t.sqlstate(format('select spicy_voice_room(%L, %L)', :'h', :'k')) = 'PL149',
  'nor for someone Spicy is not open with, or a match that is not unlocked');
reset role;
update private.spicy_calls set starts_at = now() - interval '2 minutes' where a = least(:'h'::uuid, :'j'::uuid) and status = 'set';
set role service_role;
create temp table room as select spicy_voice_room(:'h', :'j') as r;
select t.ok((select r ->> 'room' from room) = 'spicy_' || (select id from private.spicy_calls where a = least(:'h'::uuid, :'j'::uuid) and status = 'set')
  and (select r ->> 'identity' from room) = :'h' and (select (r ->> 'minutes')::int from room) between 57 and 59, 'in the window: the room, who H is in it, and a token to the end of the hour');
select t.ok((select voice from private.spicy_calls where a = least(:'h'::uuid, :'j'::uuid) and status = 'set'), 'the call is now a voice call');

-- What LiveKit saw. Anything else is ignored.
select t.ok(spicy_voice_event('talk_' || gen_random_uuid(), :'h', 'participant_joined', now()) = 'ignored'
  and spicy_voice_event('spicy_' || gen_random_uuid(), :'h', 'participant_joined', now()) = 'ignored'
  and spicy_voice_event((select r ->> 'room' from room), :'k', 'participant_joined', now()) = 'ignored', 'another room, a call that is not set, or a stranger: ignored');
-- H joins (a time from the future is taken as now), J only checks in from the app.
select t.ok(spicy_voice_event((select r ->> 'room' from room), :'h', 'participant_joined', now() + interval '1 hour') = 'joined', 'H joins the room');
select t.ok((select joined_at from private.spicy_call_voice where user_id = :'h') <= now(), 'a time from the future counts as now');
reset role;
insert into private.spicy_call_minutes (call_id, user_id, minute)
  select c.id, u, date_trunc('minute', now()) - n * interval '1 minute' from private.spicy_calls c, unnest(array[:'h', :'j']::uuid[]) u, generate_series(0, 1) n
  where c.a = least(:'h'::uuid, :'j'::uuid) and c.status = 'set';
set role authenticated;
select t.as_user(:'h');
select t.ok((select (spicy_call(:'j') ->> 'together')::int) = 0 and (spicy_call(:'j') ->> 'voice')::boolean and (spicy_call(:'j') ->> 'me_on_call')::boolean
  and not (spicy_call(:'j') ->> 'they_on_call')::boolean and not (spicy_call(:'j') ->> 'they_here')::boolean,
  'once anyone reached the room, the minutes come from the call: J''s check-ins alone count for nothing');
reset role;

-- J joins too. Twelve minutes on the call together (the join times are moved back to stand in for them).
set role service_role;
select t.ok(spicy_voice_event((select r ->> 'room' from room), :'j', 'participant_joined', now()) = 'joined'
  and spicy_voice_event((select r ->> 'room' from room), :'j', 'participant_joined', now()) = 'joined', 'J joins (a repeated webhook adds nothing)');
reset role;
select t.ok((select count(*) from private.spicy_call_voice where user_id = :'j') = 1, 'one open session per person');
update private.spicy_calls set starts_at = now() - interval '14 minutes' where a = least(:'h'::uuid, :'j'::uuid) and status = 'set';
update private.spicy_call_voice set joined_at = now() - interval '11 minutes 30 seconds';
set role authenticated;
select t.as_user(:'j');
select t.ok((select (spicy_call(:'h') ->> 'together')::int) = 12 and (spicy_call(:'h') ->> 'they_here')::boolean, 'both on the call: twelve minutes together, and H is here');
reset role;

-- A stale webhook cannot add minutes: a "joined" an hour old counts from ten minutes ago at most.
set role service_role;
select spicy_voice_event((select r ->> 'room' from room), :'h', 'participant_left', now());
select spicy_voice_event((select r ->> 'room' from room), :'h', 'participant_joined', now() - interval '1 hour');
reset role;
select t.ok((select max(joined_at) from private.spicy_call_voice where user_id = :'h') >= now() - interval '10 minutes', 'an old join counts from ten minutes ago at most');
set role service_role;
select spicy_voice_event((select r ->> 'room' from room), null, 'room_finished', now());
reset role;
select t.ok(not exists (select 1 from private.spicy_call_voice where left_at is null), 'the room closing closes every session');
update private.spicy_call_voice set left_at = joined_at + interval '20 seconds' where left_at is null;

-- J ends it: ten minutes reached, a kept call.
set role authenticated;
select t.as_user(:'j');
select spicy_call_end(:'h', false);
select t.ok((select spicy_call(:'h') ->> 'outcome') = 'talked' and (spicy_with(:'h') ->> 'kept_call')::boolean and (spicy_with(:'h') ->> 'discord') is null,
  'a kept call from the real minutes; usernames still wait for both to choose');
set role service_role;
select t.ok(spicy_voice_event((select r ->> 'room' from room), :'j', 'participant_joined', now()) = 'ignored'
  and t.sqlstate(format('select spicy_voice_room(%L, %L)', :'h', :'j')) = 'PL150', 'after the call: no more minutes and no room (PL150)');
reset role;

-- Sharing, then a block: the shares go.
set role authenticated;
select t.as_user(:'j');
select spicy_share(:'h', true);
select t.as_user(:'h');
select spicy_share(:'j', true);
select t.ok((select spicy_with(:'j') ->> 'discord') = 'person.' || right(:'j', 2), 'both chose: H sees J''s Discord');
select spicy_share(:'j', false);
select t.ok((select spicy_with(:'j') ->> 'discord') is null and not (spicy_with(:'j') ->> 'my_share')::boolean, 'H takes it back: hidden again for both');
select spicy_share(:'j', true);
select t.as_user(:'j');
select block_user(:'h');
reset role;
select t.ok(not exists (select 1 from private.spicy_shares where :'h' in (user_id, other_id) and :'j' in (user_id, other_id)), 'a block removes both shares');
select t.ok(not has_table_privilege('pinkilock_analytics', 'private.spicy_call_voice', 'select')
  and not has_table_privilege('pinkilock_analytics', 'private.spicy_shares', 'select'), 'the analytics worker cannot read the voice sessions or the shares');

-- Deleting an account deletes its voice sessions and shares.
set role authenticated;
select t.as_user(:'h');
select delete_my_account();
reset role;
select t.ok(not exists (select 1 from private.spicy_call_voice where user_id = :'h') and not exists (select 1 from private.spicy_shares where :'h' in (user_id, other_id)),
  'deleting the account deletes its voice sessions and shares');
