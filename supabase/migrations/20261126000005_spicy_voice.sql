-- Spicy calls in Pinkilock, audio only (D111, Sushil 2026-11-26). The call set up by the call times
-- (D106, 20261126000001_spicy_calls.sql) now happens inside the app as a voice call, instead of in
-- Discord, Telegram or Signal. Never video: no camera, no screen, no data channel, nothing recorded.
--
--   * The voice layer is the one Talk mode uses (LiveKit). The Edge Function `voice` asks
--     spicy_voice_room whether this person may join this call right now, and only then mints a
--     microphone-only token for the room 'spicy_<call id>'. Only the service role can ask.
--   * LiveKit tells the same function when each person joins and leaves the room (a signed
--     webhook), and it calls spicy_voice_event. Those sessions are the call's minutes: a minute
--     counts when both were connected during it. The app's check-ins (spicy_call_beat) still run,
--     but count only when nobody ever reached the room (voice not set up yet, or LiveKit down).
--     So the minutes come from the real call, not from what an app says.
--   * Usernames (Discord, Telegram, Signal) no longer show on the unlock. They show only after a
--     call that counted as kept, and only when both chose to share them (spicy_share; Sushil,
--     2026-11-26). Nobody is told whether the other chose to.
--   * private.spicy_with_for is renamed to private.spicy_with_base and wrapped, so every caller
--     (spicy_with, spicy_yes, spicy_pay, the call functions) gets the share rule, and a later
--     change to the base (the safety quiz, PR #94) keeps working under it.

-- ---------------------------------------------------------------------------------------------
-- The voice sessions, from LiveKit's webhook.
-- ---------------------------------------------------------------------------------------------
alter table private.spicy_calls add column voice boolean not null default false;

create table private.spicy_call_voice (
  id bigint generated always as identity primary key,
  call_id uuid not null references private.spicy_calls (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null,
  left_at timestamptz,
  check (left_at is null or left_at >= joined_at)
);
-- One open session per person per call.
create unique index spicy_call_voice_open_idx on private.spicy_call_voice (call_id, user_id) where left_at is null;
alter table private.spicy_call_voice enable row level security;
revoke all on private.spicy_call_voice from public, anon, authenticated, service_role;

-- The minutes each person was there: from the voice sessions when anyone reached the room, else
-- from the check-ins. Only inside the timer's window (five minutes before to an hour after).
create or replace function private.call_minute_rows(p_call uuid)
returns table (user_id uuid, minute timestamptz) language plpgsql stable security definer set search_path = public as $$
declare
  c private.spicy_calls;
begin
  select * into c from private.spicy_calls where id = p_call;
  if not found or c.starts_at is null then return; end if;
  if exists (select 1 from private.spicy_call_voice v where v.call_id = p_call) then
    return query
      select distinct v.user_id, m
      from private.spicy_call_voice v,
        generate_series(date_trunc('minute', greatest(v.joined_at, c.starts_at - interval '5 minutes')),
                        date_trunc('minute', least(coalesce(v.left_at, now()), c.starts_at + interval '60 minutes' - interval '1 second')),
                        interval '1 minute') m
      where v.call_id = p_call and v.user_id in (c.a, c.b);
  else
    return query select x.user_id, x.minute from private.spicy_call_minutes x where x.call_id = p_call;
  end if;
end $$;
revoke all on function private.call_minute_rows(uuid) from public, anon, authenticated;

-- Minutes together so far: as in 20261126000001_spicy_calls.sql, from call_minute_rows.
create or replace function private.call_together(p_call uuid)
returns int language sql stable security definer set search_path = public as $$
  with r as (select * from private.call_minute_rows(p_call)), c as (select a, b from private.spicy_calls where id = p_call)
  select count(*)::int from r x, c where x.user_id = c.a
    and exists (select 1 from r y where y.user_id = c.b and y.minute = x.minute);
$$;
revoke all on function private.call_together(uuid) from public, anon, authenticated;

-- The timer decides: as in 20261126000001_spicy_calls.sql, from call_minute_rows.
create or replace function private.call_timer_settle(p_call uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c private.spicy_calls;
  v record;
begin
  select * into c from private.spicy_calls where id = p_call for update;
  if not found or c.status <> 'set' then return; end if;
  select * into v from private.call_verdict(c.minutes, private.call_together(c.id),
    (select count(*)::int from private.call_minute_rows(c.id) r where r.user_id = c.a),
    (select count(*)::int from private.call_minute_rows(c.id) r where r.user_id = c.b),
    (select extract(epoch from max(r.minute) - c.starts_at) / 60 from private.call_minute_rows(c.id) r where r.user_id = c.a),
    (select extract(epoch from max(r.minute) - c.starts_at) / 60 from private.call_minute_rows(c.id) r where r.user_id = c.b));
  if v.outcome = 'unclear' then
    update private.spicy_calls set status = 'asking', asked_at = now() where id = c.id;
  else
    perform private.call_settle(c.id, v.outcome, v.fault);
  end if;
end $$;
revoke all on function private.call_timer_settle(uuid) from public, anon, authenticated;

-- The call with one person: as in 20261126000001_spicy_calls.sql, plus whether it is a voice call
-- and who is on it right now. "Here" is on the call when anyone reached the room, else a check-in
-- in the last 45 seconds.
create or replace function private.call_state(p_user uuid, p_other uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c private.spicy_calls;
  i_am_a boolean := p_user < p_other;
  n int;
  together int := 0;
  in_room boolean;
  me_on boolean;
  they_on boolean;
begin
  select count(*) into n from private.spicy_calls where a = least(p_user, p_other) and b = greatest(p_user, p_other);
  select * into c from private.spicy_calls where a = least(p_user, p_other) and b = greatest(p_user, p_other)
  order by (status <> 'done') desc, created_at desc limit 1;
  if not found then
    return jsonb_build_object('id', null, 'status', 'none', 'calls_left', 3);
  end if;
  together := private.call_together(c.id);
  in_room := exists (select 1 from private.spicy_call_voice v where v.call_id = c.id);
  me_on := exists (select 1 from private.spicy_call_voice v where v.call_id = c.id and v.user_id = p_user and v.left_at is null);
  they_on := exists (select 1 from private.spicy_call_voice v where v.call_id = c.id and v.user_id = p_other and v.left_at is null);
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
    'me_here', case when in_room then me_on else coalesce((case when i_am_a then c.beat_a else c.beat_b end) > now() - interval '45 seconds', false) end,
    'they_here', case when in_room then they_on else coalesce((case when i_am_a then c.beat_b else c.beat_a end) > now() - interval '45 seconds', false) end,
    'voice', c.voice,
    'me_on_call', me_on,
    'they_on_call', they_on,
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

-- May this person join the voice room for their call with p_other now? Only the Edge Function
-- `voice` asks (service role), with the user id it read from the person's own sign-in. The same
-- gates as the call functions: Spicy open for both, both said yes, unlocked (PL130, PL149); a set
-- call (PL150) whose timer is open (PL153), that I have not ended. Answers the room, who I am in
-- it, and how many minutes the token may last (to the end of the timer's hour).
create or replace function public.spicy_voice_room(p_user uuid, p_other uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  plan jsonb;
  c private.spicy_calls;
begin
  if p_user is null or p_other is null then
    raise exception using errcode = 'PL001', message = 'Sign in first.';
  end if;
  plan := private.spicy_with_for(p_user, p_other);
  if not coalesce((plan ->> 'open')::boolean, false) then
    raise exception using errcode = 'PL130', message = 'Spicy opens only when you both have it on.';
  end if;
  if not coalesce((plan ->> 'mutual')::boolean, false) or not coalesce((plan -> 'unlock' ->> 'done')::boolean, false) then
    raise exception using errcode = 'PL149', message = 'Calls are set up once your match is unlocked.';
  end if;
  select * into c from private.spicy_calls where a = least(p_user, p_other) and b = greatest(p_user, p_other) and status <> 'done' for update;
  if not found or c.status <> 'set' or (case when p_user = c.a then c.ended_a else c.ended_b end) is not null then
    raise exception using errcode = 'PL150', message = 'There is no call to do that on right now.';
  end if;
  if now() < c.starts_at - interval '5 minutes' or now() >= c.starts_at + interval '60 minutes' then
    raise exception using errcode = 'PL153', message = 'The call timer opens five minutes before the start.';
  end if;
  update private.spicy_calls set voice = true where id = c.id;
  return jsonb_build_object('room', 'spicy_' || c.id, 'identity', p_user::text,
    'minutes', greatest(ceil(extract(epoch from c.starts_at + interval '60 minutes' - now()) / 60)::int, 1));
end $$;

-- LiveKit says someone joined or left a room, or the room closed. Only the Edge Function `voice`
-- calls it, after checking LiveKit's signature. Anything that is not a Spicy room, not a set call,
-- or not one of its two people is ignored. Times are LiveKit's, but never in the future and never
-- more than ten minutes old (a late or replayed webhook cannot add minutes).
create or replace function public.spicy_voice_event(p_room text, p_user uuid, p_event text, p_at timestamptz)
returns text language plpgsql security definer set search_path = public as $$
declare
  c private.spicy_calls;
  v_at timestamptz := least(greatest(coalesce(p_at, now()), now() - interval '10 minutes'), now());
begin
  if p_room is null or p_room !~ '^spicy_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return 'ignored'; end if;
  select * into c from private.spicy_calls where id = substr(p_room, 7)::uuid for update;
  if not found or c.status <> 'set' then return 'ignored'; end if;
  if p_event = 'room_finished' then
    update private.spicy_call_voice set left_at = greatest(v_at, joined_at) where call_id = c.id and left_at is null;
    return 'closed';
  end if;
  if p_user is null or p_user not in (c.a, c.b) then return 'ignored'; end if;
  if p_event = 'participant_joined' then
    if now() < c.starts_at - interval '5 minutes' or now() >= c.starts_at + interval '60 minutes' then return 'ignored'; end if;
    insert into private.spicy_call_voice (call_id, user_id, joined_at) values (c.id, p_user, v_at) on conflict do nothing;
    if p_user = c.a then
      update private.spicy_calls set started_a = coalesce(started_a, v_at) where id = c.id;
    else
      update private.spicy_calls set started_b = coalesce(started_b, v_at) where id = c.id;
    end if;
    return 'joined';
  elsif p_event = 'participant_left' then
    update private.spicy_call_voice set left_at = greatest(v_at, joined_at) where call_id = c.id and user_id = p_user and left_at is null;
    return 'left';
  end if;
  return 'ignored';
end $$;

revoke all on function public.spicy_voice_room(uuid, uuid), public.spicy_voice_event(text, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.spicy_voice_room(uuid, uuid), public.spicy_voice_event(text, uuid, text, timestamptz) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Usernames only after a kept call, when both chose to share.
-- ---------------------------------------------------------------------------------------------
create table private.spicy_shares (
  user_id uuid not null references auth.users (id) on delete cascade,
  other_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (user_id, other_id),
  check (user_id <> other_id)
);
alter table private.spicy_shares enable row level security;
revoke all on private.spicy_shares from public, anon, authenticated, service_role;

-- A call between the two that counted as kept.
create or replace function private.spicy_kept_call(p_one uuid, p_two uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from private.spicy_calls c where c.a = least(p_one, p_two) and c.b = greatest(p_one, p_two) and c.outcome = 'talked');
$$;
revoke all on function private.spicy_kept_call(uuid, uuid) from public, anon, authenticated;

alter function private.spicy_with_for(uuid, uuid) rename to spicy_with_base;
revoke all on function private.spicy_with_base(uuid, uuid) from public, anon, authenticated;

-- Spicy with one person: the base answer, with the usernames only once we had a kept call and
-- both chose to share. Says whether we had one and whether I chose to; never whether they did.
create or replace function private.spicy_with_for(p_user uuid, p_other uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  base jsonb := private.spicy_with_base(p_user, p_other);
  kept boolean;
  mine boolean;
  shown boolean;
begin
  if not coalesce((base ->> 'open')::boolean, false) then return base; end if;
  kept := coalesce((base -> 'unlock' ->> 'done')::boolean, false) and coalesce((base ->> 'mutual')::boolean, false)
    and private.spicy_kept_call(p_user, p_other);
  mine := exists (select 1 from private.spicy_shares where user_id = p_user and other_id = p_other);
  shown := kept and mine and exists (select 1 from private.spicy_shares where user_id = p_other and other_id = p_user);
  return base || jsonb_build_object('kept_call', kept, 'my_share', mine,
    'discord', case when shown then base -> 'discord' else 'null'::jsonb end,
    'telegram', case when shown then base -> 'telegram' else 'null'::jsonb end,
    'signal', case when shown then base -> 'signal' else 'null'::jsonb end);
end $$;
revoke all on function private.spicy_with_for(uuid, uuid) from public, anon, authenticated;

-- Share my usernames with them (true), or take that back (false). Only after a kept call (PL178).
create or replace function public.spicy_share(p_other uuid, p_share boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  plan jsonb := private.spicy_with_for(me, p_other);
begin
  if not coalesce((plan ->> 'open')::boolean, false) then
    raise exception using errcode = 'PL130', message = 'Spicy opens only when you both have it on.';
  end if;
  if coalesce(p_share, false) then
    if not coalesce((plan ->> 'kept_call')::boolean, false) then
      raise exception using errcode = 'PL178', message = 'Usernames can be shared after a call that counted.';
    end if;
    insert into private.spicy_shares (user_id, other_id) values (me, p_other) on conflict do nothing;
  else
    delete from private.spicy_shares where user_id = me and other_id = p_other;
  end if;
  return private.spicy_with_for(me, p_other);
end $$;
revoke all on function public.spicy_share(uuid, boolean) from public, anon;
grant execute on function public.spicy_share(uuid, boolean) to authenticated;

-- A share goes when either turns Spicy off, takes the yes back, or blocks.
create or replace function private.spicy_share_gone()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'spicy' then
    delete from private.spicy_shares where user_id = old.user_id or other_id = old.user_id;
  elsif tg_table_name = 'spicy_yes' then
    delete from private.spicy_shares where (user_id = old.user_id and other_id = old.other_id) or (user_id = old.other_id and other_id = old.user_id);
  else
    delete from private.spicy_shares where (user_id = new.blocker_id and other_id = new.blocked_id) or (user_id = new.blocked_id and other_id = new.blocker_id);
  end if;
  return null;
end $$;
create trigger spicy_share_off after delete on private.spicy for each row execute function private.spicy_share_gone();
create trigger spicy_share_yes after delete on private.spicy_yes for each row execute function private.spicy_share_gone();
create trigger spicy_share_block after insert on public.blocks for each row execute function private.spicy_share_gone();
revoke all on function private.spicy_share_gone() from public, anon, authenticated;
