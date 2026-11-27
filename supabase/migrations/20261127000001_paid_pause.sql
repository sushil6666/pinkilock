-- Paid features: payments paused (D117, Sushil 2026-11-27: "all membership money plan not active now
-- till we get a good app user", then "all those paid service we will keep, so that referral people
-- will get something"). The features stay and keep working; only taking money stops. One switch,
-- private.config 'paid', off by default and set by the Supabase deploy from the repository variable
-- PAID_FEATURES. Nothing is dropped: each money path below is wrapped (the function as it was is
-- renamed into private and called when the switch is on), so switching it back on brings back
-- exactly what was there. src/domain/paid.ts has the same rules.
--
-- While off:
--   * wallet_open_order refuses every order (credit packs, Pink Gold plans, Boost packs): PL188.
--     The wallet function asks app_switches first, so no Razorpay order is even made. An order made
--     before the pause and paid after it is still credited (wallet_paid is unchanged).
--   * Pink Gold and Boosts keep working for whoever has them. They can be given as rewards (for
--     a referral programme, later): private.pink_gold_gift adds days, private.boost_gift adds Boosts.
--   * treat_plan (bought credits only) and paid listener calls refuse: PL188. The free first call
--     with a listener (D109, earned by a referral or a finished profile) still works.
--   * talk_ai_session is free: one 15-minute Saathi session per local day (PL189 after it), which
--     keeps what the AI costs small. A chat that mentioned self-harm stays free, as before.
--   * spicy_pay unlocks for free, one new unlock per person per 7 days (PL190, Sushil's pick).
--     Anything already paid towards that match goes back first, so a free unlock costs nobody.

insert into private.config (key, value) values ('paid', 'false') on conflict (key) do nothing;

create or replace function private.paid_on()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.config_on('paid');
$$;
revoke all on function private.paid_on() from public, anon, authenticated;

-- What the app may know about the switches. Signed in only (the app signs in anonymously at once;
-- signed out, no function can be called).
create or replace function public.app_switches()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('paid', private.config_on('paid'));
$$;
revoke all on function public.app_switches() from public, anon;
grant execute on function public.app_switches() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Buying: packs, plans, Boosts.
-- ---------------------------------------------------------------------------------------------
alter function public.wallet_open_order(uuid, text, text) rename to wallet_open_order_before_pause;
alter function public.wallet_open_order_before_pause(uuid, text, text) set schema private;
revoke all on function private.wallet_open_order_before_pause(uuid, text, text) from public, anon, authenticated, service_role;

create or replace function public.wallet_open_order(p_user uuid, p_pack text, p_order text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not private.paid_on() then
    raise exception using errcode = 'PL188', message = 'Paid features are paused for now. Everything else is free to use.';
  end if;
  return private.wallet_open_order_before_pause(p_user, p_pack, p_order);
end $$;
revoke all on function public.wallet_open_order(uuid, text, text) from public, anon, authenticated;
grant execute on function public.wallet_open_order(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Rewards instead of payments: the team (or a referral programme, later) can give Pink Gold days
-- and Boosts. Neither is callable from the app.
-- ---------------------------------------------------------------------------------------------
-- Adds days to the end of my Pink Gold (or starts it now). Granted for good stays for good.
create or replace function private.pink_gold_gift(p_user uuid, p_days int, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_days is null or p_days not between 1 and 366 then raise exception using errcode = 'PL191', message = 'Give 1 to 366 days of Pink Gold, or 1 to 12 Boosts with a reason.'; end if;
  insert into private.pink_gold (user_id, since, until, note) values (p_user, now(), now() + p_days * interval '1 day', p_note)
  on conflict (user_id) do update
    set since = case when private.is_pink_gold(p_user) then private.pink_gold.since else now() end,
        until = case when private.is_pink_gold(p_user) and private.pink_gold.until is null then null
                     else greatest(coalesce(private.pink_gold.until, now()), now()) + p_days * interval '1 day' end,
        note = coalesce(excluded.note, private.pink_gold.note);
end $$;
revoke all on function private.pink_gold_gift(uuid, int, text) from public, anon, authenticated;

-- Boosts given, used within a month like bought ones. `p_ref` names why (once per ref).
alter table private.boosts drop constraint boosts_source_check;
alter table private.boosts add constraint boosts_source_check check (source in ('bought', 'member', 'gift'));
create or replace function private.boost_gift(p_user uuid, p_count int, p_ref text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_count is null or p_count not between 1 and 12 or coalesce(p_ref, '') = '' then raise exception using errcode = 'PL191', message = 'Give 1 to 366 days of Pink Gold, or 1 to 12 Boosts with a reason.'; end if;
  insert into private.boosts (user_id, source, ref, slot, expires_at)
  select p_user, 'gift', 'gift:' || p_ref, s, now() + interval '1 month' from generate_series(1, p_count) s
  on conflict (user_id, ref, slot) do nothing;
end $$;
revoke all on function private.boost_gift(uuid, int, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Treat the plan: bought credits only.
-- ---------------------------------------------------------------------------------------------
alter function public.treat_plan(uuid, text, text) rename to treat_plan_before_pause;
alter function public.treat_plan_before_pause(uuid, text, text) set schema private;
revoke all on function private.treat_plan_before_pause(uuid, text, text) from public, anon, authenticated, service_role;

create or replace function public.treat_plan(p_invite uuid, p_partner text, p_item text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not private.paid_on() then
    raise exception using errcode = 'PL188', message = 'Paid features are paused for now. Everything else is free to use.';
  end if;
  return private.treat_plan_before_pause(p_invite, p_partner, p_item);
end $$;
revoke all on function public.treat_plan(uuid, text, text) from public, anon;
grant execute on function public.treat_plan(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Talk mode: paid listener calls wait. The free first call (D109) still works.
-- ---------------------------------------------------------------------------------------------
alter function public.talk_call(uuid, int, boolean) rename to talk_call_before_pause;
alter function public.talk_call_before_pause(uuid, int, boolean) set schema private;
revoke all on function private.talk_call_before_pause(uuid, int, boolean) from public, anon, authenticated, service_role;

create or replace function public.talk_call(p_listener uuid, p_length int, p_free boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not private.paid_on() and not coalesce(p_free, false) then
    raise exception using errcode = 'PL188', message = 'Paid features are paused for now. Everything else is free to use.';
  end if;
  return private.talk_call_before_pause(p_listener, p_length, p_free);
end $$;
revoke all on function public.talk_call(uuid, int, boolean) from public, anon;
grant execute on function public.talk_call(uuid, int, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Saathi: one free 15-minute session a day while paused.
-- ---------------------------------------------------------------------------------------------
create table private.saathi_free_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  chat_id uuid,
  at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table private.saathi_free_days enable row level security;
revoke all on private.saathi_free_days from public, anon, authenticated;

alter function public.talk_ai_session(uuid) rename to talk_ai_session_before_pause;
alter function public.talk_ai_session_before_pause(uuid) set schema private;
revoke all on function private.talk_ai_session_before_pause(uuid) from public, anon, authenticated, service_role;

create or replace function public.talk_ai_session(p_chat uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid;
  p private.talk_people;
  ch private.talk_ai_chats;
  today date;
begin
  if private.paid_on() then return private.talk_ai_session_before_pause(p_chat); end if;
  me := private.self_love_me();
  p := private.talk_person(me);
  today := private.local_today(me);
  select * into ch from private.talk_ai_chats where id = p_chat and user_id = me and last_at > now() - interval '6 hours' for update;
  if not found then
    insert into private.talk_ai_chats (user_id) values (me) returning * into ch;
  end if;
  -- Free anyway: a chat that mentioned self-harm, or a day pass bought before.
  if ch.harm or coalesce(p.pass_until > now(), false) then
    return jsonb_build_object('chat', ch.id, 'paid_until', ch.paid_until, 'charged', 0, 'free', true);
  end if;
  if ch.paid_until > now() + interval '2 minutes' then
    raise exception using errcode = 'PL182', message = 'You still have time with Saathi. You can continue in the last 2 minutes.';
  end if;
  insert into private.saathi_free_days (user_id, day, chat_id) values (me, today, ch.id) on conflict do nothing;
  if not found then
    raise exception using errcode = 'PL189', message = 'You have had your free time with Saathi today. Come back tomorrow.';
  end if;
  update private.talk_ai_chats
    set paid_until = greatest(coalesce(paid_until, now()), now()) + interval '15 minutes', sessions = sessions + 1, last_at = now()
    where id = ch.id returning * into ch;
  return jsonb_build_object('chat', ch.id, 'paid_until', ch.paid_until, 'charged', 0, 'free', false, 'today', true);
end $$;
revoke all on function public.talk_ai_session(uuid) from public, anon;
grant execute on function public.talk_ai_session(uuid) to authenticated;

-- The Talk page learns whether paid features are on, and whether today's free session is used.
alter function private.talk_state(uuid) rename to talk_state_before_pause;
revoke all on function private.talk_state_before_pause(uuid) from public, anon, authenticated;

create or replace function private.talk_state(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return private.talk_state_before_pause(p_user) || jsonb_build_object(
    'paused', not private.paid_on(),
    'saathi_used_today', exists (select 1 from private.saathi_free_days f where f.user_id = p_user and f.day = private.local_today(p_user)));
end $$;
revoke all on function private.talk_state(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Spicy mode: a free unlock, one per person per 7 days, while paused.
-- ---------------------------------------------------------------------------------------------
alter table private.spicy_unlocks add column free_by uuid references auth.users (id) on delete set null;
create index spicy_unlocks_free_idx on private.spicy_unlocks (free_by, unlocked_at) where free_by is not null;

-- When my next free unlock opens (null: open now).
create or replace function private.spicy_free_next(p_user uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select max(unlocked_at) + interval '7 days' from private.spicy_unlocks
  where free_by = p_user and unlocked_at > now() - interval '7 days';
$$;
revoke all on function private.spicy_free_next(uuid) from public, anon, authenticated;

-- spicy_with_for: as before, and while paused the unlock says it is free and when mine opens next.
alter function private.spicy_with_for(uuid, uuid) rename to spicy_with_before_pause;
revoke all on function private.spicy_with_before_pause(uuid, uuid) from public, anon, authenticated;

create or replace function private.spicy_with_for(p_user uuid, p_other uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  plan jsonb := private.spicy_with_before_pause(p_user, p_other);
begin
  if private.paid_on() or not (plan ? 'unlock') then return plan; end if;
  return jsonb_set(plan, '{unlock}', (plan -> 'unlock') || jsonb_build_object('free', true, 'free_next', private.spicy_free_next(p_user)));
end $$;
revoke all on function private.spicy_with_for(uuid, uuid) from public, anon, authenticated;

alter function public.spicy_pay(uuid, text) rename to spicy_pay_before_pause;
alter function public.spicy_pay_before_pause(uuid, text) set schema private;
revoke all on function private.spicy_pay_before_pause(uuid, text) from public, anon, authenticated, service_role;

create or replace function public.spicy_pay(p_other uuid, p_share text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid;
  plan jsonb;
  u private.spicy_unlocks;
begin
  if private.paid_on() then return private.spicy_pay_before_pause(p_other, p_share); end if;
  me := private.self_love_me();
  plan := private.spicy_with_for(me, p_other);
  if not coalesce((plan ->> 'open')::boolean, false) then
    raise exception using errcode = 'PL130', message = 'Spicy opens only when you both have it on.';
  end if;
  if not coalesce((plan ->> 'mutual')::boolean, false) then
    raise exception using errcode = 'PL146', message = 'You both need to say yes first.';
  end if;
  insert into private.spicy_unlocks (a, b) values (least(me, p_other), greatest(me, p_other)) on conflict do nothing;
  select * into u from private.spicy_unlocks where a = least(me, p_other) and b = greatest(me, p_other) for update;
  if u.unlocked_at is not null then
    raise exception using errcode = 'PL145', message = 'Your part is paid already.';
  end if;
  -- One at a time per person, so two unlocks at once cannot both slip under the weekly limit.
  perform pg_advisory_xact_lock(hashtext('spicy_free:' || me::text));
  if private.spicy_free_next(me) is not null then
    raise exception using errcode = 'PL190', message = 'Your free unlock for this week is used. The next one opens 7 days after it.';
  end if;
  -- Anything paid towards this match before the pause goes back: a free unlock costs nobody.
  if u.paid_a > 0 then perform private.wallet_move(u.a, 'spicy_back', u.paid_a, 0, u.b::text || ':free:' || gen_random_uuid()); end if;
  if u.paid_b > 0 then perform private.wallet_move(u.b, 'spicy_back', u.paid_b, 0, u.a::text || ':free:' || gen_random_uuid()); end if;
  update private.spicy_unlocks set paid_a = 0, paid_b = 0, unlocked_at = now(), free_by = me where a = u.a and b = u.b;
  return private.spicy_with_for(me, p_other);
end $$;
revoke all on function public.spicy_pay(uuid, text) from public, anon;
grant execute on function public.spicy_pay(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- The data download: as before, plus my free Saathi days and my free Spicy unlocks (when only).
-- ---------------------------------------------------------------------------------------------
alter function public.export_my_data() rename to export_before_paid_pause;
alter function public.export_before_paid_pause() set schema private;
revoke all on function private.export_before_paid_pause() from public, anon, authenticated;

create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  return private.export_before_paid_pause() || jsonb_build_object(
    'free_saathi_days', coalesce((select jsonb_agg(f.day order by f.day) from private.saathi_free_days f where f.user_id = me), '[]'),
    'free_spicy_unlocks', coalesce((select jsonb_agg(u.unlocked_at order by u.unlocked_at) from private.spicy_unlocks u where u.free_by = me), '[]'));
end $$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
