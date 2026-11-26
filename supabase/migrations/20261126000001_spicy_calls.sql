-- Spicy call times (D106). Once a Spicy match is unlocked (D105), the two people set up one call in
-- Discord, Telegram or Signal, and Pinkilock checks that it happened with the in-app call timer
-- (Sushil, 2026-11-26). The same rules are in src/domain/calls.ts (the mock follows it);
-- tests/db/call_cases.sql runs the shared tables through both.
--
--   * Each picks 1 to 8 times (on the hour or half hour, an hour to a week ahead) and a minimum
--     length of 10, 15 or 30 minutes. The first time both picked is the call; the shorter length
--     is the minimum.
--   * The timer: while the call runs, the open app checks in (spicy_call_beat) every 20 seconds.
--     One row per person per minute. A minute counts when both have a row for it. We never hear,
--     record or store anything of the call itself.
--   * When the hour after the start is over, or both tapped End, private.call_verdict decides:
--     talked, a no-show, a drop, both missed, or unclear. Unclear asks both (spicy_call_answer);
--     private.answer_verdict decides, with serial reporters not taken on their word alone.
--   * "I felt unsafe or uncomfortable" (spicy_call_end with p_unsafe) ends it at any time and counts
--     against nobody. So does turning Spicy off, taking a yes back, or a block.
--   * A miss: a `call_missed` event for the person who missed (no invite, no props, nothing about
--     the match), which the Trust Score worker counts like a flake, and their part of the unlock
--     stays paid. The one who showed gets their own part back, once per match. Nothing ever goes
--     from one person to the other, and nothing here is a reward.
--   * One free move each, an hour or more ahead. Later, or again, cancelling counts as a miss.
--   * The calls are in the data download (format 10) and go with the account.

create table private.spicy_calls (
  id uuid primary key default gen_random_uuid(),
  a uuid not null references auth.users (id) on delete cascade,
  b uuid not null references auth.users (id) on delete cascade,
  status text not null default 'picking' check (status in ('picking', 'set', 'asking', 'done')),
  slots_a timestamptz[] not null default '{}',
  slots_b timestamptz[] not null default '{}',
  minutes_a int check (minutes_a in (10, 15, 30)),
  minutes_b int check (minutes_b in (10, 15, 30)),
  starts_at timestamptz,
  minutes int check (minutes in (10, 15, 30)),
  moves_a int not null default 0,
  moves_b int not null default 0,
  started_a timestamptz,
  started_b timestamptz,
  beat_a timestamptz,
  beat_b timestamptz,
  ended_a timestamptz,
  ended_b timestamptz,
  asked_at timestamptz,
  answer_a text check (answer_a in ('talked', 'they_missed', 'i_missed')),
  answer_b text check (answer_b in ('talked', 'they_missed', 'i_missed')),
  outcome text check (outcome in ('talked', 'no_show', 'dropped', 'both_missed', 'unsafe', 'moved_late', 'disputed', 'unsettled', 'stopped')),
  fault text check (fault in ('a', 'b', 'both')),
  stopped_by uuid,
  refund_a int not null default 0,
  refund_b int not null default 0,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  check (a < b),
  check ((status = 'done') = (outcome is not null)),
  check (status <> 'set' or (starts_at is not null and minutes is not null))
);
-- One open call per match.
create unique index spicy_calls_open_idx on private.spicy_calls (a, b) where status <> 'done';
create index spicy_calls_due_idx on private.spicy_calls (starts_at) where status = 'set';

create table private.spicy_call_minutes (
  call_id uuid not null references private.spicy_calls (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  minute timestamptz not null,
  primary key (call_id, user_id, minute)
);

alter table private.spicy_calls enable row level security;
alter table private.spicy_call_minutes enable row level security;
revoke all on private.spicy_calls, private.spicy_call_minutes from public, anon, authenticated, service_role;

-- A miss counts on the Trust Score like a flake (analytics/duckdb_pipeline.py, W_CALL).
alter table public.events drop constraint events_type_check;
alter table public.events add constraint events_type_check check (type in (
  'app_open', 'ask_sent', 'pinky_out', 'locked', 'declined', 'expired', 'checked_in', 'kept', 'bailed', 'no_show', 'ended',
  'bad_contact', 'call_missed'));

-- What the timer says. As callVerdict in src/domain/calls.ts.
create or replace function private.call_verdict(p_minutes int, p_together int, p_mins_a int, p_mins_b int, p_last_a numeric, p_last_b numeric,
  out outcome text, out fault text)
language plpgsql immutable set search_path = '' as $$
begin
  if p_together >= p_minutes then outcome := 'talked'; return; end if;
  if p_mins_a = 0 and p_mins_b = 0 then outcome := 'both_missed'; fault := 'both'; return; end if;
  if p_mins_a = 0 then outcome := 'no_show'; fault := 'a'; return; end if;
  if p_mins_b = 0 then outcome := 'no_show'; fault := 'b'; return; end if;
  if p_together > 0 and p_last_a is not null and p_last_b is not null then
    if p_last_a <= p_last_b - 3 then outcome := 'dropped'; fault := 'a'; return; end if;
    if p_last_b <= p_last_a - 3 then outcome := 'dropped'; fault := 'b'; return; end if;
  end if;
  outcome := 'unclear';
end $$;
revoke all on function private.call_verdict(int, int, int, int, numeric, numeric) from public, anon, authenticated;

-- The confirm fallback. As answerVerdict in src/domain/calls.ts.
create or replace function private.answer_verdict(p_a text, p_b text, p_serial_a boolean, p_serial_b boolean, p_closed boolean,
  out outcome text, out fault text)
language plpgsql immutable set search_path = '' as $$
begin
  if p_a = 'i_missed' and p_b = 'i_missed' then outcome := 'no_show'; fault := 'both'; return; end if;
  if p_a = 'i_missed' then outcome := 'no_show'; fault := 'a'; return; end if;
  if p_b = 'i_missed' then outcome := 'no_show'; fault := 'b'; return; end if;
  if p_a = 'talked' and p_b = 'talked' then outcome := 'talked'; return; end if;
  if (p_a = 'they_missed' and p_b is not null) or (p_b = 'they_missed' and p_a is not null) then outcome := 'disputed'; return; end if;
  if not p_closed then outcome := 'wait'; return; end if;
  if p_a = 'they_missed' then
    if p_serial_a then outcome := 'unsettled'; else outcome := 'no_show'; fault := 'b'; end if;
    return;
  end if;
  if p_b = 'they_missed' then
    if p_serial_b then outcome := 'unsettled'; else outcome := 'no_show'; fault := 'a'; end if;
    return;
  end if;
  if p_a = 'talked' or p_b = 'talked' then outcome := 'talked'; return; end if;
  outcome := 'unsettled';
end $$;
revoke all on function private.answer_verdict(text, text, boolean, boolean, boolean) from public, anon, authenticated;

-- Three or more "they missed it" in 30 days that the other person disputed.
create or replace function private.call_serial(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select count(*) >= 3 from private.spicy_calls c
  where c.outcome = 'disputed' and c.settled_at > now() - interval '30 days'
    and ((c.a = p_user and c.answer_a = 'they_missed') or (c.b = p_user and c.answer_b = 'they_missed'));
$$;
revoke all on function private.call_serial(uuid) from public, anon, authenticated;

-- Closes a call. A miss: the event for whoever missed, and the one who showed gets their own part of
-- the unlock back (once per match: the ledger ref is the pair).
create or replace function private.call_settle(p_call uuid, p_outcome text, p_fault text, p_stopped_by uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  c private.spicy_calls;
  u private.spicy_unlocks;
  back_a int := 0;
  back_b int := 0;
begin
  select * into c from private.spicy_calls where id = p_call for update;
  if not found or c.status = 'done' then return; end if;
  if p_fault in ('a', 'both') then insert into events (actor_id, type) values (c.a, 'call_missed'); end if;
  if p_fault in ('b', 'both') then insert into events (actor_id, type) values (c.b, 'call_missed'); end if;
  if p_fault in ('a', 'b') then
    select * into u from private.spicy_unlocks where a = c.a and b = c.b;
    if found then
      if p_fault = 'b' and u.paid_a > 0 and private.wallet_move(c.a, 'spicy_back', u.paid_a, 0, 'call:' || c.a || ':' || c.b) then back_a := u.paid_a; end if;
      if p_fault = 'a' and u.paid_b > 0 and private.wallet_move(c.b, 'spicy_back', u.paid_b, 0, 'call:' || c.a || ':' || c.b) then back_b := u.paid_b; end if;
    end if;
  end if;
  update private.spicy_calls set status = 'done', outcome = p_outcome, fault = p_fault, stopped_by = p_stopped_by,
    refund_a = back_a, refund_b = back_b, settled_at = now()
  where id = p_call;
end $$;
revoke all on function private.call_settle(uuid, text, text, uuid) from public, anon, authenticated;

-- Minutes together so far.
create or replace function private.call_together(p_call uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from private.spicy_call_minutes x
  join private.spicy_calls c on c.id = x.call_id and x.user_id = c.a
  where x.call_id = p_call
    and exists (select 1 from private.spicy_call_minutes y where y.call_id = p_call and y.user_id = c.b and y.minute = x.minute);
$$;
revoke all on function private.call_together(uuid) from public, anon, authenticated;

-- The timer decides, or it goes to the answers.
create or replace function private.call_timer_settle(p_call uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c private.spicy_calls;
  v record;
begin
  select * into c from private.spicy_calls where id = p_call for update;
  if not found or c.status <> 'set' then return; end if;
  select * into v from private.call_verdict(c.minutes, private.call_together(c.id),
    (select count(*)::int from private.spicy_call_minutes where call_id = c.id and user_id = c.a),
    (select count(*)::int from private.spicy_call_minutes where call_id = c.id and user_id = c.b),
    (select extract(epoch from max(minute) - c.starts_at) / 60 from private.spicy_call_minutes where call_id = c.id and user_id = c.a),
    (select extract(epoch from max(minute) - c.starts_at) / 60 from private.spicy_call_minutes where call_id = c.id and user_id = c.b));
  if v.outcome = 'unclear' then
    update private.spicy_calls set status = 'asking', asked_at = now() where id = c.id;
  else
    perform private.call_settle(c.id, v.outcome, v.fault);
  end if;
end $$;
revoke all on function private.call_timer_settle(uuid) from public, anon, authenticated;

create or replace function private.call_answer_settle(p_call uuid, p_closed boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  c private.spicy_calls;
  v record;
begin
  select * into c from private.spicy_calls where id = p_call for update;
  if not found or c.status <> 'asking' then return; end if;
  select * into v from private.answer_verdict(c.answer_a, c.answer_b, private.call_serial(c.a), private.call_serial(c.b), p_closed);
  if v.outcome <> 'wait' then perform private.call_settle(c.id, v.outcome, v.fault); end if;
end $$;
revoke all on function private.call_answer_settle(uuid, boolean) from public, anon, authenticated;

-- The call with one person, for the caller: the open one, else the last one.
create or replace function private.call_state(p_user uuid, p_other uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c private.spicy_calls;
  i_am_a boolean := p_user < p_other;
  n int;
  together int := 0;
begin
  select count(*) into n from private.spicy_calls where a = least(p_user, p_other) and b = greatest(p_user, p_other);
  select * into c from private.spicy_calls where a = least(p_user, p_other) and b = greatest(p_user, p_other)
  order by (status <> 'done') desc, created_at desc limit 1;
  if not found then
    return jsonb_build_object('id', null, 'status', 'none', 'calls_left', 3);
  end if;
  together := private.call_together(c.id);
  return jsonb_build_object(
    'id', c.id,
    'status', c.status,
    'my_slots', to_jsonb(case when i_am_a then c.slots_a else c.slots_b end),
    'their_slots', to_jsonb(case when i_am_a then c.slots_b else c.slots_a end),
    'my_minutes', case when i_am_a then c.minutes_a else c.minutes_b end,
    'their_minutes', case when i_am_a then c.minutes_b else c.minutes_a end,
    'no_overlap', c.status = 'picking' and cardinality(c.slots_a) > 0 and cardinality(c.slots_b) > 0,
    'starts_at', c.starts_at,
    'minutes', c.minutes,
    'together', together,
    'my_started', (case when i_am_a then c.started_a else c.started_b end) is not null,
    'their_started', (case when i_am_a then c.started_b else c.started_a end) is not null,
    'me_here', coalesce((case when i_am_a then c.beat_a else c.beat_b end) > now() - interval '45 seconds', false),
    'they_here', coalesce((case when i_am_a then c.beat_b else c.beat_a end) > now() - interval '45 seconds', false),
    'my_ended', (case when i_am_a then c.ended_a else c.ended_b end) is not null,
    'can_move_free', c.status = 'set' and (case when i_am_a then c.moves_a else c.moves_b end) < 1 and c.starts_at - now() >= interval '1 hour',
    'my_answer', case when i_am_a then c.answer_a else c.answer_b end,
    'answer_until', c.asked_at + interval '24 hours',
    'outcome', c.outcome,
    'fault', case when c.fault is null then null when c.fault = 'both' then 'both' when c.fault = (case when i_am_a then 'a' else 'b' end) then 'me' else 'them' end,
    'refunded', case when i_am_a then c.refund_a else c.refund_b end,
    'stopped_by_me', c.stopped_by = p_user,
    'calls_left', greatest(3 - n, 0));
end $$;
revoke all on function private.call_state(uuid, uuid) from public, anon, authenticated;

-- Calls only on an unlocked match that is still open: PL130 (not open, says nothing more) or PL149.
create or replace function private.call_me(p_other uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  plan jsonb := private.spicy_with_for(me, p_other);
begin
  if not coalesce((plan ->> 'open')::boolean, false) then
    raise exception using errcode = 'PL130', message = 'Spicy opens only when you both have it on.';
  end if;
  if not coalesce((plan ->> 'mutual')::boolean, false) or not coalesce((plan -> 'unlock' ->> 'done')::boolean, false) then
    raise exception using errcode = 'PL149', message = 'Calls are set up once your match is unlocked.';
  end if;
  return me;
end $$;
revoke all on function private.call_me(uuid) from public, anon, authenticated;

create or replace function public.spicy_call(p_other uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  plan jsonb := private.spicy_with_for(me, p_other);
begin
  if not coalesce((plan ->> 'open')::boolean, false) or not coalesce((plan ->> 'mutual')::boolean, false)
     or not coalesce((plan -> 'unlock' ->> 'done')::boolean, false) then
    return jsonb_build_object('id', null, 'status', 'none', 'calls_left', 0);
  end if;
  return private.call_state(me, p_other);
end $$;

-- My times and length. A new call when none is open (three per match at most).
create or replace function public.spicy_call_pick(p_other uuid, p_slots timestamptz[], p_minutes int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.call_me(p_other);
  x uuid := least(me, p_other);
  y uuid := greatest(me, p_other);
  c private.spicy_calls;
  v_slots timestamptz[];
  s timestamptz;
  first timestamptz;
begin
  select * into c from private.spicy_calls where a = x and b = y and status <> 'done' for update;
  if not found then
    if (select count(*) from private.spicy_calls where a = x and b = y) >= 3 then
      raise exception using errcode = 'PL152', message = 'Three calls with one person is the most.';
    end if;
    insert into private.spicy_calls (a, b) values (x, y) returning * into c;
  end if;
  if c.status <> 'picking' then
    raise exception using errcode = 'PL150', message = 'There is no call to do that on right now.';
  end if;
  if p_minutes is null or not (p_minutes = any (array[10, 15, 30])) then
    raise exception using errcode = 'PL147', message = 'Pick a call length: 10, 15 or 30 minutes.';
  end if;
  v_slots := array(select distinct t from unnest(coalesce(p_slots, '{}')) t order by t);
  if cardinality(v_slots) = 0 or cardinality(v_slots) > 8 then
    raise exception using errcode = 'PL148', message = 'Pick 1 to 8 times, on the hour or half hour, from an hour to a week ahead.';
  end if;
  foreach s in array v_slots loop
    if extract(epoch from s)::bigint % 1800 <> 0 or s < now() + interval '1 hour' or s > now() + interval '7 days' then
      raise exception using errcode = 'PL148', message = 'Pick 1 to 8 times, on the hour or half hour, from an hour to a week ahead.';
    end if;
  end loop;
  if me = x then
    update private.spicy_calls set slots_a = v_slots, minutes_a = p_minutes where id = c.id returning * into c;
  else
    update private.spicy_calls set slots_b = v_slots, minutes_b = p_minutes where id = c.id returning * into c;
  end if;
  if c.minutes_a is not null and c.minutes_b is not null then
    select min(t) into first from unnest(c.slots_a) t where t = any (c.slots_b) and t >= now() + interval '1 hour';
    if first is not null then
      update private.spicy_calls set status = 'set', starts_at = first, minutes = least(c.minutes_a, c.minutes_b) where id = c.id;
    end if;
  end if;
  return private.call_state(me, p_other);
end $$;

-- The open app checks in. One row a minute; only while the timer is open and I have not ended.
create or replace function public.spicy_call_beat(p_other uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.call_me(p_other);
  c private.spicy_calls;
begin
  select * into c from private.spicy_calls where a = least(me, p_other) and b = greatest(me, p_other) and status <> 'done' for update;
  if not found or c.status <> 'set' or (case when me = c.a then c.ended_a else c.ended_b end) is not null then
    raise exception using errcode = 'PL150', message = 'There is no call to do that on right now.';
  end if;
  if now() < c.starts_at - interval '5 minutes' or now() >= c.starts_at + interval '60 minutes' then
    raise exception using errcode = 'PL153', message = 'The call timer opens five minutes before the start.';
  end if;
  insert into private.spicy_call_minutes (call_id, user_id, minute) values (c.id, me, date_trunc('minute', now())) on conflict do nothing;
  if me = c.a then
    update private.spicy_calls set started_a = coalesce(started_a, now()), beat_a = now() where id = c.id;
  else
    update private.spicy_calls set started_b = coalesce(started_b, now()), beat_b = now() where id = c.id;
  end if;
  return private.call_state(me, p_other);
end $$;

-- End. With p_unsafe ("I felt unsafe or uncomfortable"): over for both at once, nobody's fault.
-- Without: I am done; once the minimum is reached, or we both ended, the timer decides.
create or replace function public.spicy_call_end(p_other uuid, p_unsafe boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.call_me(p_other);
  c private.spicy_calls;
begin
  select * into c from private.spicy_calls where a = least(me, p_other) and b = greatest(me, p_other) and status <> 'done' for update;
  if not found then
    raise exception using errcode = 'PL150', message = 'There is no call to do that on right now.';
  end if;
  if coalesce(p_unsafe, false) then
    perform private.call_settle(c.id, 'unsafe', null, me);
    return private.call_state(me, p_other);
  end if;
  if c.status <> 'set' or now() < c.starts_at - interval '5 minutes' then
    raise exception using errcode = 'PL150', message = 'There is no call to do that on right now.';
  end if;
  if me = c.a then
    update private.spicy_calls set ended_a = coalesce(ended_a, now()) where id = c.id returning * into c;
  else
    update private.spicy_calls set ended_b = coalesce(ended_b, now()) where id = c.id returning * into c;
  end if;
  if private.call_together(c.id) >= c.minutes or (c.ended_a is not null and c.ended_b is not null) then
    perform private.call_timer_settle(c.id);
  end if;
  return private.call_state(me, p_other);
end $$;

-- Move a set call: free once, an hour or more ahead (both pick again). Otherwise PL151, or with
-- p_anyway it is cancelled and counts as my miss.
create or replace function public.spicy_call_move(p_other uuid, p_anyway boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.call_me(p_other);
  c private.spicy_calls;
  moves int;
begin
  select * into c from private.spicy_calls where a = least(me, p_other) and b = greatest(me, p_other) and status <> 'done' for update;
  if not found or c.status <> 'set' then
    raise exception using errcode = 'PL150', message = 'There is no call to do that on right now.';
  end if;
  moves := case when me = c.a then c.moves_a else c.moves_b end;
  if moves < 1 and c.starts_at - now() >= interval '1 hour' then
    update private.spicy_calls set status = 'picking', slots_a = '{}', slots_b = '{}', starts_at = null, minutes = null,
      moves_a = moves_a + case when me = a then 1 else 0 end, moves_b = moves_b + case when me = b then 1 else 0 end
    where id = c.id;
  elsif coalesce(p_anyway, false) then
    perform private.call_settle(c.id, 'moved_late', case when me = c.a then 'a' else 'b' end);
  else
    raise exception using errcode = 'PL151', message = 'Moving the call now counts as missing it.';
  end if;
  return private.call_state(me, p_other);
end $$;

-- The confirm fallback: what happened, once each.
create or replace function public.spicy_call_answer(p_other uuid, p_answer text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.call_me(p_other);
  c private.spicy_calls;
begin
  select * into c from private.spicy_calls where a = least(me, p_other) and b = greatest(me, p_other) and status <> 'done' for update;
  if not found or c.status <> 'asking' or p_answer not in ('talked', 'they_missed', 'i_missed')
     or (case when me = c.a then c.answer_a else c.answer_b end) is not null then
    raise exception using errcode = 'PL150', message = 'There is no call to do that on right now.';
  end if;
  if me = c.a then
    update private.spicy_calls set answer_a = p_answer where id = c.id;
  else
    update private.spicy_calls set answer_b = p_answer where id = c.id;
  end if;
  perform private.call_answer_settle(c.id, false);
  return private.call_state(me, p_other);
end $$;

revoke all on function public.spicy_call(uuid), public.spicy_call_pick(uuid, timestamptz[], int), public.spicy_call_beat(uuid),
  public.spicy_call_end(uuid, boolean), public.spicy_call_move(uuid, boolean), public.spicy_call_answer(uuid, text) from public, anon;
grant execute on function public.spicy_call(uuid), public.spicy_call_pick(uuid, timestamptz[], int), public.spicy_call_beat(uuid),
  public.spicy_call_end(uuid, boolean), public.spicy_call_move(uuid, boolean), public.spicy_call_answer(uuid, text) to authenticated;

-- Every minute: calls whose hour is over go to the timer; answers that have closed are decided.
create or replace function private.call_sweep()
returns int language plpgsql security definer set search_path = public as $$
declare
  c record;
  n int := 0;
begin
  for c in select id from private.spicy_calls where status = 'set' and now() >= starts_at + interval '60 minutes' loop
    perform private.call_timer_settle(c.id);
    n := n + 1;
  end loop;
  for c in select id from private.spicy_calls where status = 'asking' and now() >= asked_at + interval '24 hours' loop
    perform private.call_answer_settle(c.id, true);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function private.call_sweep() from public, anon, authenticated;
select cron.schedule('pinkilock-calls', '* * * * *', 'select private.call_sweep()');

-- Leaving Spicy, taking a yes back, or a block: an open call stops, and counts against nobody.
create or replace function private.call_stop_pair(p_one uuid, p_two uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c record;
begin
  for c in select id from private.spicy_calls where a = least(p_one, p_two) and b = greatest(p_one, p_two) and status <> 'done' loop
    perform private.call_settle(c.id, 'stopped', null);
  end loop;
end $$;
revoke all on function private.call_stop_pair(uuid, uuid) from public, anon, authenticated;

create or replace function private.call_yes_gone()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform private.call_stop_pair(old.user_id, old.other_id);
  return null;
end $$;
create trigger call_yes_gone after delete on private.spicy_yes
  for each row execute function private.call_yes_gone();

create or replace function private.call_block_stop()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform private.call_stop_pair(new.blocker_id, new.blocked_id);
  return null;
end $$;
create trigger call_block_stop after insert on public.blocks
  for each row execute function private.call_block_stop();
revoke all on function private.call_yes_gone(), private.call_block_stop() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The data download, format 10: as in 20261125000003_wallet.sql, plus the call times.
-- ---------------------------------------------------------------------------------------------
create or replace function public.export_my_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  return jsonb_build_object(
    'format', 'pinkilock-export-10',
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'phone', u.phone, 'email', nullif(u.email, ''), 'created_at', u.created_at, 'is_anonymous', u.is_anonymous)
                from auth.users u where u.id = me),
    'profile', (select to_jsonb(p) from profiles p where p.id = me),
    'contact', (select jsonb_build_object('kind', c.contact_kind, 'handle', c.contact_handle, 'photos', c.photos, 'verified_at', c.contact_verified_at)
                from profile_private c where c.profile_id = me),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'status', x.status, 'bytes', x.bytes, 'at', x.created_at, 'decided_at', x.decided_at) order by x.created_at)
                from photos x where x.profile_id = me), '[]'),
    'trust_score', (select to_jsonb(t) - 'profile_id' from trust_scores t where t.profile_id = me),
    -- The other people appear by id only: their cards are theirs. On a double, `other_person` is
    -- the asker or the person asked on the other side, and `with` lists the two friends.
    'invites', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', i.id,
                  'role', case me when i.from_id then 'asked' when i.to_id then 'was_asked'
                                  when i.from_friend then 'asked_with_a_friend' else 'was_asked_with_a_friend' end,
                  'other_person', case when me in (i.from_id, i.from_friend) then i.to_id else i.from_id end,
                  'with', case when i.from_friend is not null then jsonb_build_array(i.from_friend, i.to_friend) end,
                  'idea', i.idea_id, 'starts_at', i.starts_at, 'place', i.place, 'note', i.note, 'status', i.status,
                  'my_check_in', me = any (i.check_ins), 'flaked', i.flaked_by = me, 'created_at', i.created_at,
                  'resolved_at', i.resolved_at) order by i.created_at)
                from invites i where me in (i.from_id, i.to_id, i.from_friend, i.to_friend)), '[]'),
    'duo', (select jsonb_build_object('partner', d.partner, 'since', d.created_at) from duos d where d.person = me),
    'passes', coalesce((select jsonb_agg(jsonb_build_object('profile', x.passed_id, 'at', x.at) order by x.at)
                from passes x where x.profile_id = me), '[]'),
    'blocks', coalesce((select jsonb_agg(jsonb_build_object('profile', b.blocked_id, 'at', b.created_at) order by b.created_at)
                from blocks b where b.blocker_id = me), '[]'),
    -- Reports I made. Reports about me are not part of an export.
    'reports_made', coalesce((select jsonb_agg(jsonb_build_object('profile', r.reported_id, 'reason', r.reason, 'detail', r.detail, 'at', r.created_at) order by r.created_at)
                from reports r where r.reporter_id = me), '[]'),
    -- Handles I flagged as not working, by person and plan; their handle is theirs, so it is left out.
    'contact_flags_made', coalesce((select jsonb_agg(jsonb_build_object('profile', f.owner_id, 'invite', f.invite_id, 'at', f.at) order by f.at)
                from contact_reports f where f.reporter_id = me), '[]'),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('platform', d.platform, 'updated_at', d.updated_at) order by d.updated_at)
                from push_tokens d where d.profile_id = me), '[]'),
    'notifications', coalesce((select jsonb_agg(jsonb_build_object('kind', n.kind, 'title', n.title, 'body', n.body, 'at', n.created_at, 'sent_at', n.sent_at) order by n.id)
                from notifications n where n.recipient_id = me), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('type', e.type, 'at', e.at, 'invite', e.invite_id) order by e.id)
                -- A flag on my handle is logged against me, but it names the plan and so the flagger:
                -- like reports about me, it is not part of an export.
                from events e where e.actor_id = me and e.type <> 'bad_contact'), '[]'),
    'consents', coalesce((select jsonb_agg(jsonb_build_object('kind', c.kind, 'version', c.version, 'at', c.at) order by c.at)
                from consents c where c.user_id = me), '[]'),
    'date_ratings', coalesce((select jsonb_agg(jsonb_build_object('invite', r.invite_id, 'worth', r.worth, 'again', r.again, 'unsafe', r.unsafe, 'at', r.at) order by r.at)
                from date_ratings r where r.user_id = me), '[]'),
    'privacy_requests', coalesce((select jsonb_agg(jsonb_build_object('kind', q.kind, 'detail', q.detail, 'at', q.at, 'handled_at', q.handled_at, 'outcome', q.outcome) order by q.at)
                from privacy_requests q where q.user_id = me), '[]'),
    'error_reports', coalesce((select jsonb_agg(jsonb_build_object('code', x.code, 'trace', x.trace, 'route', x.route, 'at', x.at) order by x.at)
                from client_errors x where x.user_id = me), '[]'),
    'moderation', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'action', m.action, 'reason', m.note, 'at', m.at) order by m.at)
                from private.moderation_actions m where m.profile_id = me), '[]'),
    'line_review', (select jsonb_build_object('text', l.text, 'status', l.status, 'reason', l.reason) from private.line_reviews l where l.profile_id = me),
    -- Self love (D101): every mood, note, pause and reset, all of it the person's own.
    'self_love', jsonb_build_object(
      'moods', coalesce((select jsonb_agg(jsonb_build_object('day', m.day, 'mood', m.mood) order by m.day) from private.self_moods m where m.user_id = me), '[]'),
      'notes', coalesce((select jsonb_agg(jsonb_build_object('kind', n.kind, 'body', n.body, 'day', n.day, 'at', n.at) order by n.at) from private.self_notes n where n.user_id = me), '[]'),
      'pause_and_reset', (select jsonb_build_object('paused_until', s.paused_until, 'reset_started', s.reset_started, 'reset_done', s.reset_done) from private.self_love s where s.user_id = me)),
    -- Spicy mode (D103): my own usernames, boundaries and yeses. The other person's are theirs.
    'spicy', (select jsonb_build_object('discord', s.discord, 'telegram', s.telegram, 'signal', s.signal, 'boundaries', to_jsonb(s.boundaries), 'adult_at', s.adult_at, 'rules_at', s.rules_at, 'since', s.updated_at,
                'yes', coalesce((select jsonb_agg(jsonb_build_object('with', y.other_id, 'at', y.at) order by y.at) from private.spicy_yes y where y.user_id = me), '[]'),
                'unlocks', coalesce((select jsonb_agg(jsonb_build_object('with', case when x.a = me then x.b else x.a end, 'paid', case when x.a = me then x.paid_a else x.paid_b end,
                  'unlocked_at', x.unlocked_at)) from private.spicy_unlocks x where me in (x.a, x.b)), '[]'),
                -- Call times (D106): my picks, my minutes on the timer, my answer and how it ended.
                'calls', coalesce((select jsonb_agg(jsonb_build_object('with', case when c.a = me then c.b else c.a end,
                  'my_times', to_jsonb(case when c.a = me then c.slots_a else c.slots_b end), 'my_minimum', case when c.a = me then c.minutes_a else c.minutes_b end,
                  'starts_at', c.starts_at, 'minimum', c.minutes,
                  'my_minutes_on_timer', (select count(*) from private.spicy_call_minutes m where m.call_id = c.id and m.user_id = me),
                  'my_answer', case when c.a = me then c.answer_a else c.answer_b end, 'outcome', c.outcome,
                  'counted_against_me', c.fault = 'both' or c.fault = case when c.a = me then 'a' else 'b' end,
                  'credits_back', case when c.a = me then c.refund_a else c.refund_b end, 'at', c.created_at) order by c.created_at)
                  from private.spicy_calls c where me in (c.a, c.b)), '[]'))
              from private.spicy s where s.user_id = me),
    -- The wallet (D104): balances, every ledger row, my orders (payments), stakes and treats.
    -- A treat I was given shows what and when; the voucher code only while it can be used.
    'wallet', jsonb_build_object(
      'paid', coalesce((select w.paid from private.wallets w where w.user_id = me), 0),
      'earned', coalesce((select w.earned from private.wallets w where w.user_id = me), 0),
      'ledger', coalesce((select jsonb_agg(jsonb_build_object('kind', l.kind, 'paid', l.paid, 'earned', l.earned, 'reward', l.reward, 'at', l.at) order by l.id)
                  from private.wallet_ledger l where l.user_id = me), '[]'),
      'orders', coalesce((select jsonb_agg(jsonb_build_object('order', o.order_id, 'provider', o.provider, 'pack', o.pack, 'paise', o.paise, 'credits', o.credits,
                  'status', o.status, 'payment', o.payment_id, 'at', o.created_at, 'paid_at', o.paid_at, 'refunded_at', o.refunded_at) order by o.created_at)
                  from private.wallet_orders o where o.user_id = me), '[]'),
      'stakes', coalesce((select jsonb_agg(jsonb_build_object('invite', s.invite_id, 'credits', s.paid + s.earned, 'at', s.at, 'ended', s.ended) order by s.at)
                  from private.wallet_stakes s where s.user_id = me), '[]'),
      'treats', coalesce((select jsonb_agg(jsonb_build_object('invite', t.invite_id, 'gave', t.giver = me, 'item', t.item, 'credits', t.credits, 'status', t.status, 'at', t.at)
                  order by t.at) from private.wallet_treats t where me in (t.giver, t.receiver)), '[]'))
  );
end $$;
