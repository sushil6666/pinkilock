-- Spicy call times (D106), after wallet.sql. People of their own: C and D (an unlocked match: the
-- timer, a no-show, the answers), E and F (another unlocked match: the unsafe exit, a late move, a
-- block), G (Spicy on, never matched with C).
\set ON_ERROR_STOP on
\pset tuples_only on
\ir call_cases.sql
\set c '00000000-0000-0000-0000-0000000ca111'
\set d '00000000-0000-0000-0000-0000000ca112'
\set e '00000000-0000-0000-0000-0000000ca113'
\set f '00000000-0000-0000-0000-0000000ca114'
\set g '00000000-0000-0000-0000-0000000ca115'
insert into auth.users (id, email) values (:'c', 'c@example.test'), (:'d', 'd@example.test'), (:'e', 'e@example.test'), (:'f', 'f@example.test'), (:'g', 'g@example.test');
insert into public.profiles (id, name, age, area, city) values (:'c', 'Chandni', 25, 'Bandra West', 'Calltown'), (:'d', 'Dhruv', 27, 'Khar West', 'Calltown'),
  (:'e', 'Esha', 26, 'Juhu', 'Calltown'), (:'f', 'Farhan', 28, 'Andheri West', 'Calltown'), (:'g', 'Gita', 24, 'Versova', 'Calltown');
insert into private.spicy (user_id, discord, adult_at, rules_at)
  select u, 'person.' || right(u::text, 1), now(), now() from unnest(array[:'c', :'d', :'e', :'f', :'g']::uuid[]) u;
insert into private.discover_seen (user_id, card_id) values (:'c', :'d'), (:'d', :'c'), (:'e', :'f'), (:'f', :'e'), (:'c', :'g'), (:'g', :'c');
insert into private.wallets (user_id, paid) values (:'c', 600), (:'d', 600), (:'e', 600), (:'f', 600);
create temp table at_slot as select date_trunc('hour', now()) + interval '3 hours' as s3, date_trunc('hour', now()) + interval '4 hours' as s4,
  date_trunc('hour', now()) + interval '5 hours' as s5;
grant select on at_slot to authenticated;

-- The shared tables: the timer and the answers decide the same in SQL as in src/domain/calls.ts.
select t.ok(bad is null, coalesce('every shared timer line gives the same answer in SQL (' || bad || ')', 'every shared timer line gives the same answer in SQL'))
  from (select string_agg(format('%s/%s/%s/%s/%s/%s: %s', minutes, together, mins_a, mins_b, last_a, last_b, v), '; ') filter (where v is distinct from (outcome, fault)) as bad
        from (select k.*, (select (x.outcome, x.fault) from private.call_verdict(minutes, together, mins_a, mins_b, last_a, last_b) x) as v from call_cases k) q) r;
select t.ok(bad is null, coalesce('every shared answer line gives the same answer in SQL (' || bad || ')', 'every shared answer line gives the same answer in SQL'))
  from (select string_agg(format('%s/%s/%s/%s/%s: %s', a, b, serial_a, serial_b, closed, v), '; ') filter (where v is distinct from (outcome, fault)) as bad
        from (select k.*, (select (x.outcome, x.fault) from private.answer_verdict(a, b, serial_a, serial_b, closed) x) as v from answer_cases k) q) r;

set role authenticated;
-- Calls only on an unlocked match.
select t.as_user(:'c');
select spicy_yes(:'d', true);
select t.as_user(:'d');
select spicy_yes(:'c', true);
select t.ok(t.sqlstate(format($$select spicy_call_pick(%L, array[(select s3 from at_slot)], 15)$$, :'c')) = 'PL149', 'both said yes, but no call until the match is unlocked (PL149)');
select t.ok((select spicy_call(:'c') ->> 'status') = 'none', 'and there is nothing to show');
select spicy_pay(:'c', 'half');
select t.as_user(:'c');
select spicy_pay(:'d', 'half');
select t.ok((select spicy_with(:'d') -> 'unlock' ->> 'done')::boolean and (select spicy_call(:'d') ->> 'status') = 'none'
  and (select (spicy_call(:'d') ->> 'calls_left')::int) = 3, 'unlocked: three calls to set up');
select t.ok(t.sqlstate(format($$select spicy_call_pick(%L, array[(select s3 from at_slot)], 15)$$, :'g')) = 'PL149'
  and (select spicy_call(:'g') ->> 'status') = 'none', 'with someone not matched, nothing (PL149)');
select t.ok(t.fails('select * from private.spicy_calls') and t.fails('select * from private.spicy_call_minutes'), 'no client can read the calls or the timer');
select t.ok(t.fails(format($$insert into private.spicy_call_minutes (call_id, user_id, minute) values (gen_random_uuid(), %L, now())$$, :'c'))
  and t.fails(format($$select private.call_settle(gen_random_uuid(), 'talked', null)$$)) and t.fails('select private.call_sweep()'), 'or write the timer, or settle a call');

-- Picking: a length off the list, and times that break the rules.
select t.ok(t.sqlstate(format($$select spicy_call_pick(%L, array[(select s3 from at_slot)], 20)$$, :'d')) = 'PL147', 'a length off the list (PL147)');
select t.ok(t.sqlstate(format($$select spicy_call_pick(%L, array[(select s3 from at_slot) + interval '10 minutes'], 15)$$, :'d')) = 'PL148'
  and t.sqlstate(format($$select spicy_call_pick(%L, array[date_trunc('hour', now()) + interval '30 minutes'], 15)$$, :'d')) = 'PL148'
  and t.sqlstate(format($$select spicy_call_pick(%L, array[(select s3 from at_slot) + interval '8 days'], 15)$$, :'d')) = 'PL148'
  and t.sqlstate(format($$select spicy_call_pick(%L, '{}'::timestamptz[], 15)$$, :'d')) = 'PL148'
  and t.sqlstate(format($$select spicy_call_pick(%L, array(select (select s3 from at_slot) + n * interval '30 minutes' from generate_series(0, 8) n), 15)$$, :'d')) = 'PL148',
  'times: on the half hour, an hour to a week ahead, one to eight of them (PL148)');

select spicy_call_pick(:'d', array[(select s3 from at_slot), (select s4 from at_slot)], 30);
select t.ok((select spicy_call(:'d') ->> 'status') = 'picking' and not (select spicy_call(:'d') ->> 'no_overlap')::boolean, 'C picked; waiting on D');
select t.as_user(:'d');
select spicy_call_pick(:'c', array[(select s5 from at_slot)], 15);
select t.ok((select spicy_call(:'c') ->> 'status') = 'picking' and (select spicy_call(:'c') ->> 'no_overlap')::boolean
  and jsonb_array_length(spicy_call(:'c') -> 'their_slots') = 2, 'no time matches: both still picking, and D sees C''s times');
select spicy_call_pick(:'c', array[(select s4 from at_slot), (select s5 from at_slot)], 15);
select t.ok((select spicy_call(:'c') ->> 'status') = 'set' and (select (spicy_call(:'c') ->> 'starts_at')::timestamptz) = (select s4 from at_slot)
  and (select (spicy_call(:'c') ->> 'minutes')::int) = 15, 'the first time both picked; the shorter length (15 of 30 and 15) applies');
select t.as_user(:'c');
select t.ok((select (spicy_call(:'d') ->> 'minutes')::int) = 15 and (select spicy_call(:'d') ->> 'can_move_free')::boolean, 'C sees the same minimum before the call');
select t.ok(t.sqlstate(format($$select spicy_call_beat(%L)$$, :'d')) = 'PL153', 'the timer is not open hours ahead (PL153)');

-- The free move: once, an hour or more ahead. Both pick again.
select spicy_call_move(:'d', false);
select t.ok((select spicy_call(:'d') ->> 'status') = 'picking' and jsonb_array_length(spicy_call(:'d') -> 'my_slots') = 0, 'a free move: both pick again');
select spicy_call_pick(:'d', array[(select s4 from at_slot)], 30);
select t.as_user(:'d');
select spicy_call_pick(:'c', array[(select s4 from at_slot)], 15);
select t.as_user(:'c');
select t.ok(not (select spicy_call(:'d') ->> 'can_move_free')::boolean and t.sqlstate(format($$select spicy_call_move(%L, false)$$, :'d')) = 'PL151',
  'the second move is not free (PL151)');

-- The timer: both keep the app open for fifteen minutes together.
reset role;
update private.spicy_calls set starts_at = now() - interval '20 minutes' where a = :'c' and b = :'d' and status = 'set';
insert into private.spicy_call_minutes (call_id, user_id, minute)
  select c.id, u, date_trunc('minute', now()) - n * interval '1 minute' from private.spicy_calls c, unnest(array[:'c', :'d']::uuid[]) u, generate_series(1, 14) n
  where c.a = :'c' and c.b = :'d' and c.status = 'set';
set role authenticated;
select t.as_user(:'c');
select spicy_call_beat(:'d');
select t.ok((select (spicy_call(:'d') ->> 'together')::int) = 14 and (select spicy_call(:'d') ->> 'me_here')::boolean
  and not (select spicy_call(:'d') ->> 'they_here')::boolean, 'a minute counts only when both checked in; D is not here this minute');
select t.as_user(:'d');
select spicy_call_beat(:'c');
select t.ok((select (spicy_call(:'c') ->> 'together')::int) = 15 and (select spicy_call(:'c') ->> 'they_here')::boolean, 'now both are here: 15 minutes together');
select spicy_call_end(:'c', false);
select t.ok((select spicy_call(:'c') ->> 'status') = 'done' and (select spicy_call(:'c') ->> 'outcome') = 'talked' and (select spicy_call(:'c') ->> 'fault') is null,
  'the minimum is reached and D ends it: a kept call');
reset role;
select t.ok(not exists (select 1 from public.events where actor_id in (:'c', :'d') and type = 'call_missed'), 'nothing counts against either');
set role authenticated;

-- A no-show: C is there, D never opens it. The hour runs out and the sweep decides.
select t.as_user(:'c');
select spicy_call_pick(:'d', array[(select s3 from at_slot)], 10);
select t.as_user(:'d');
select spicy_call_pick(:'c', array[(select s3 from at_slot)], 10);
reset role;
update private.spicy_calls set starts_at = now() - interval '61 minutes' where a = :'c' and b = :'d' and status = 'set';
insert into private.spicy_call_minutes (call_id, user_id, minute)
  select c.id, :'c', c.starts_at + n * interval '1 minute' from private.spicy_calls c, generate_series(0, 11) n where c.a = :'c' and c.b = :'d' and c.status = 'set';
select private.call_sweep();
select t.ok((select count(*) from public.events where actor_id = :'d' and type = 'call_missed' and invite_id is null and props = '{}'::jsonb) = 1
  and not exists (select 1 from public.events where actor_id = :'c' and type = 'call_missed'), 'D''s no-show counts against D only, as a bare call_missed event');
set role authenticated;
select t.as_user(:'c');
select t.ok((select spicy_call(:'d') ->> 'outcome') = 'no_show' and (select spicy_call(:'d') ->> 'fault') = 'them'
  and (select (spicy_call(:'d') ->> 'refunded')::int) = 300 and (select (my_wallet() ->> 'paid')::int) = 600,
  'C showed: C''s own 300 of the unlock comes back');
select t.as_user(:'d');
select t.ok((select spicy_call(:'c') ->> 'fault') = 'me' and (select (my_wallet() ->> 'paid')::int) = 300 and (select (spicy_call(:'c') ->> 'calls_left')::int) = 1,
  'D''s part stays paid; one call left');

-- The answers: both came, never at the same time. The timer cannot tell, so both are asked.
select spicy_call_pick(:'c', array[(select s3 from at_slot)], 10);
select t.as_user(:'c');
select spicy_call_pick(:'d', array[(select s3 from at_slot)], 10);
reset role;
update private.spicy_calls set starts_at = now() - interval '61 minutes' where a = :'c' and b = :'d' and status = 'set';
insert into private.spicy_call_minutes (call_id, user_id, minute)
  select c.id, u, c.starts_at + (n + case when u = :'d' then 30 else 0 end) * interval '1 minute'
  from private.spicy_calls c, unnest(array[:'c', :'d']::uuid[]) u, generate_series(0, 4) n where c.a = :'c' and c.b = :'d' and c.status = 'set';
select private.call_sweep();
set role authenticated;
select t.as_user(:'c');
select t.ok((select spicy_call(:'d') ->> 'status') = 'asking' and (select spicy_call(:'d') ->> 'answer_until') is not null, 'never together: both are asked what happened');
select spicy_call_answer(:'d', 'they_missed');
select t.ok(t.sqlstate(format($$select spicy_call_answer(%L, 'talked')$$, :'d')) = 'PL150', 'one answer each (PL150)');
select t.ok((select spicy_call(:'d') ->> 'status') = 'asking', 'C says D missed it; it waits for D');
reset role;
update private.spicy_calls set asked_at = now() - interval '25 hours' where a = :'c' and b = :'d' and status = 'asking';
select private.call_sweep();
select t.ok((select count(*) from public.events where actor_id = :'d' and type = 'call_missed') = 2, 'D never answered: it counts against D');
set role authenticated;
select t.as_user(:'c');
select t.ok((select (spicy_call(:'d') ->> 'refunded')::int) = 0 and (select (my_wallet() ->> 'paid')::int) = 600, 'C''s part comes back once per match, not again');
select t.ok(t.sqlstate(format($$select spicy_call_pick(%L, array[(select s3 from at_slot)], 10)$$, :'d')) = 'PL152', 'three calls with one person is the most (PL152)');

-- E and F: the unsafe exit, a late move, and a block.
select t.as_user(:'f');
select spicy_yes(:'e', true);
select t.as_user(:'e');
select spicy_yes(:'f', true);
select spicy_pay(:'f', 'full');
select t.as_user(:'f');
select t.ok((select spicy_with(:'e') -> 'unlock' ->> 'done')::boolean, 'E paid it all');
select spicy_call_pick(:'e', array[(select s3 from at_slot)], 30);
select t.as_user(:'e');
select spicy_call_pick(:'f', array[(select s3 from at_slot)], 30);
reset role;
update private.spicy_calls set starts_at = now() - interval '2 minutes' where a = :'e' and b = :'f' and status = 'set';
set role authenticated;
select spicy_call_beat(:'f');
select spicy_call_end(:'f', true);
select t.ok((select spicy_call(:'f') ->> 'outcome') = 'unsafe' and (select spicy_call(:'f') ->> 'stopped_by_me')::boolean and (select spicy_call(:'f') ->> 'fault') is null,
  '"I felt unsafe or uncomfortable" ends it at once, after 0 of 30 minutes, and counts against nobody');
select t.as_user(:'f');
select t.ok(not (select spicy_call(:'e') ->> 'stopped_by_me')::boolean and (select spicy_call(:'e') ->> 'fault') is null, 'F is told it stopped, not who felt unsafe');
reset role;
select t.ok(not exists (select 1 from public.events where actor_id in (:'e', :'f') and type = 'call_missed'), 'no event for either');
set role authenticated;

-- Moving inside the last hour counts as a miss: F's. E paid it all, so E gets the 600 back.
select spicy_call_pick(:'e', array[(select s3 from at_slot)], 5);
select t.as_user(:'e');
select spicy_call_pick(:'f', array[(select s3 from at_slot)], 10);
select t.ok((select (spicy_call(:'f') ->> 'minutes')::int) = 5, 'five minutes is the shortest length on offer (Sushil, 2026-11-26)');
reset role;
update private.spicy_calls set starts_at = now() + interval '30 minutes' where a = :'e' and b = :'f' and status = 'set';
set role authenticated;
select t.as_user(:'f');
select t.ok(not (select spicy_call(:'e') ->> 'can_move_free')::boolean and t.sqlstate(format($$select spicy_call_move(%L, false)$$, :'e')) = 'PL151',
  'half an hour ahead, a move is not free (PL151)');
select spicy_call_move(:'e', true);
select t.ok((select spicy_call(:'e') ->> 'outcome') = 'moved_late' and (select spicy_call(:'e') ->> 'fault') = 'me' and (select (my_wallet() ->> 'paid')::int) = 600,
  'F cancels anyway: it counts as F''s miss, and F paid nothing so loses nothing more');
select t.as_user(:'e');
select t.ok((select (spicy_call(:'f') ->> 'refunded')::int) = 600 and (select (my_wallet() ->> 'paid')::int) = 600, 'E gets E''s own 600 back');

-- A block stops an open call, and counts against nobody.
select spicy_call_pick(:'f', array[(select s3 from at_slot)], 10);
select t.as_user(:'f');
select block_user(:'e');
reset role;
select t.ok((select outcome from private.spicy_calls where a = :'e' and b = :'f' order by created_at desc limit 1) = 'stopped'
  and (select count(*) from public.events where actor_id = :'e' and type = 'call_missed') = 0, 'a block stops it, and nobody is blamed');

-- Serial reporters: three disputed "they missed it" in 30 days.
insert into private.spicy_calls (a, b, status, outcome, answer_a, answer_b, settled_at)
  select :'c', :'g', 'done', 'disputed', 'they_missed', 'talked', now() from generate_series(1, 3);
select t.ok(private.call_serial(:'c') and not private.call_serial(:'d'), 'three disputed reports in 30 days make a serial reporter');

-- The worker cannot read the calls; the data download (format 10) has mine.
select t.ok(not has_table_privilege('pinkilock_analytics', 'private.spicy_calls', 'select')
  and not has_table_privilege('pinkilock_analytics', 'private.spicy_call_minutes', 'select'), 'the analytics worker cannot read the calls');
select t.ok((select jobname from cron.job where command like '%call_sweep%') = 'pinkilock-calls', 'the sweep runs on a schedule');
set role authenticated;
select t.as_user(:'d');
select t.ok((select export_my_data() ->> 'format') = 'pinkilock-export-10'
  and (select jsonb_array_length(export_my_data() -> 'spicy' -> 'calls')) = 3
  and (select count(*) from jsonb_array_elements(export_my_data() -> 'spicy' -> 'calls') x where (x ->> 'counted_against_me')::boolean) = 2,
  'the data download (format 10) has my calls and which counted against me');

-- Turning Spicy off stops an open call.
select t.as_user(:'g');
reset role;
delete from private.spicy_calls where a = :'c' and b = :'g';
set role authenticated;
select t.as_user(:'c');
select spicy_yes(:'g', true);
select t.as_user(:'g');
select spicy_yes(:'c', true);
reset role;
insert into private.spicy_unlocks (a, b, paid_a, unlocked_at) values (:'c', :'g', 600, now());
set role authenticated;
select spicy_call_pick(:'c', array[(select s3 from at_slot)], 10);
select spicy_off();
reset role;
select t.ok((select outcome from private.spicy_calls where a = :'c' and b = :'g') = 'stopped', 'turning Spicy off stops an open call, with no blame');

-- Deleting an account deletes its calls.
set role authenticated;
select t.as_user(:'d');
select delete_my_account();
reset role;
select t.ok(not exists (select 1 from private.spicy_calls where :'d' in (a, b)) and not exists (select 1 from private.spicy_call_minutes where user_id = :'d'),
  'deleting the account deletes its calls and its timer');
