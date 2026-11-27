-- Bring a friend (D118): rewards for inviting friends who stay, on top of the friend's link from
-- Talk mode (D109: private.talk_referral_codes, private.talk_referrals, talk_claim_referral, /r/CODE).
-- The rewards are given with the payment pause's grant functions (20261127000001_paid_pause.sql:
-- private.pink_gold_gift, private.boost_gift), so they work with paid plans switched off.
--
--   * A friend who joins with my link, or with my Doubles invite (join_duo, below), is "joined".
--     The link is used within 7 days of the friend's account being made, once, never my own, as
--     in D109.
--   * The friend "counts" once all of these are true (private.referral_check):
--       - a verified phone number (auth.users.phone_confirmed_at), or, while `referral_needs_phone` is
--         'false' in private.config, a verified email. It starts 'false' (Sushil, 2026-11-27: until
--         phone sign-in is on, an email counts); set it to 'true' once Twilio is live (OPERATIONS.md);
--       - a finished profile: a face photo the check approved and at least one plan they are up for;
--       - one device per account: their app has told the server about its device (note_device) and
--         no device of theirs has been seen on any other account, mine included;
--       - neither of us is paused, and there is no block between us.
--   * When a friend counts (private.referral_settle, once per friend):
--       - both of us get 7 days of Pink Gold, added to the end of any membership;
--       - I get 1 free Boost (good for a month, like a bought one);
--       - my 5th friend who counts gives me 30 more days of Pink Gold, once.
--     The free first call with a listener (D109) is unchanged: it opens when a friend verifies.
--   * At most 10 of my friends count in any 30 days; the rest count in a later sweep. Nothing is
--     ever given for a rating or a review.
--   * Who my friends are is never shown to me: only how many joined and how many count. A friend
--     sees only their own checklist.
--   * Rewards are settled when either of us opens Bring a friend (my_referrals) and by pg_cron
--     every 10 minutes (private.referral_sweep), for friends who joined in the last 60 days.

insert into private.config (key, value) values ('referral_needs_phone', 'false') on conflict (key) do nothing;

-- How the friend came: the link from Bring a friend or Talk, or a Doubles invite.
alter table private.talk_referrals add column via text not null default 'link' check (via in ('link', 'duo'));

-- The device each app says it runs on: a random id the app made and keeps (src/lib/device.ts),
-- never a hardware id. Used only to see one device on two accounts.
create table private.devices (
  user_id uuid not null references auth.users (id) on delete cascade,
  device text not null check (device ~ '^[A-Za-z0-9_-]{16,64}$'),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (user_id, device)
);
create index devices_device_idx on private.devices (device);
alter table private.devices enable row level security;
revoke all on private.devices from public, anon, authenticated;

-- One row per friend who counted: what it gave, and when.
create table private.referral_rewards (
  friend uuid primary key references auth.users (id) on delete cascade,
  referrer uuid not null references auth.users (id) on delete cascade,
  -- I was the referrer's nth friend to count.
  nth int not null check (nth >= 1),
  month boolean not null default false,
  at timestamptz not null default now()
);
create index referral_rewards_referrer_idx on private.referral_rewards (referrer, at);
alter table private.referral_rewards enable row level security;
revoke all on private.referral_rewards from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The rules. The same rules are referralNeeds / referralCounts in src/domain/referrals.ts.
-- ---------------------------------------------------------------------------------------------
create or replace function private.referral_check(p_friend uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'phone', exists (select 1 from auth.users u where u.id = p_friend and u.phone_confirmed_at is not null)
             or (not coalesce((select value <> 'false' from private.config where key = 'referral_needs_phone'), true) and private.is_linked(p_friend)),
    'face', exists (select 1 from photos where profile_id = p_friend and kind = 'face' and status = 'approved'),
    'plans', exists (select 1 from profiles where id = p_friend and cardinality(idea_ids) > 0),
    'device', exists (select 1 from private.devices d where d.user_id = p_friend)
              and not exists (select 1 from private.devices d join private.devices o on o.device = d.device and o.user_id <> d.user_id where d.user_id = p_friend));
$$;
revoke all on function private.referral_check(uuid) from public, anon, authenticated;

-- Give a friend's rewards, once, if they count now. True when this call gave them.
create or replace function private.referral_settle(p_friend uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  r private.talk_referrals;
  c jsonb;
  n int;
begin
  select * into r from private.talk_referrals where friend = p_friend;
  if not found or exists (select 1 from private.referral_rewards where friend = p_friend) then return false; end if;
  c := private.referral_check(p_friend);
  if not ((c ->> 'phone')::boolean and (c ->> 'face')::boolean and (c ->> 'plans')::boolean and (c ->> 'device')::boolean) then return false; end if;
  if exists (select 1 from profiles where id in (r.friend, r.referrer) and suspended_at is not null)
     or not exists (select 1 from profiles where id = r.referrer)
     or private.blocked_pair(r.friend, r.referrer) then
    return false;
  end if;
  -- One referrer at a time, so two friends counting together get the right numbers.
  perform pg_advisory_xact_lock(hashtext('referral:' || r.referrer::text));
  if exists (select 1 from private.referral_rewards where friend = p_friend) then return false; end if;
  if (select count(*) from private.referral_rewards where referrer = r.referrer and at > now() - interval '30 days') >= 10 then return false; end if;
  n := (select count(*) from private.referral_rewards where referrer = r.referrer) + 1;
  insert into private.referral_rewards (friend, referrer, nth, month) values (r.friend, r.referrer, n, n = 5);
  perform private.pink_gold_gift(r.friend, 7);
  perform private.pink_gold_gift(r.referrer, 7);
  perform private.boost_gift(r.referrer, 1, 'referral:' || r.friend::text);
  if n = 5 then perform private.pink_gold_gift(r.referrer, 30); end if;
  return true;
end $$;
revoke all on function private.referral_settle(uuid) from public, anon, authenticated;

create or replace function private.referral_sweep()
returns int language plpgsql security definer set search_path = public as $$
declare
  f uuid;
  given int := 0;
begin
  for f in select r.friend from private.talk_referrals r
           where r.at > now() - interval '60 days' and not exists (select 1 from private.referral_rewards w where w.friend = r.friend)
           order by r.at limit 500 loop
    if private.referral_settle(f) then given := given + 1; end if;
  end loop;
  return given;
end $$;
revoke all on function private.referral_sweep() from public, anon, authenticated;

select cron.schedule('pinkilock-referrals', '*/10 * * * *', 'select private.referral_sweep()');

-- ---------------------------------------------------------------------------------------------
-- What the app calls
-- ---------------------------------------------------------------------------------------------

-- The app tells the server which device it runs on, at sign-in and when it opens.
create or replace function public.note_device(p_device text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if coalesce(p_device, '') !~ '^[A-Za-z0-9_-]{16,64}$' then
    raise exception using errcode = 'PL192', message = 'This device could not be checked. Restart the app and try again.';
  end if;
  insert into private.devices (user_id, device) values (me, p_device)
  on conflict (user_id, device) do update set last_seen = now();
end $$;

-- Bring a friend: my link, my counts and rewards, and my own checklist if I joined with a link.
create or replace function public.my_referrals()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  f uuid;
  mine private.talk_referrals;
  c jsonb;
  n int;
begin
  perform private.referral_settle(me);
  for f in select r.friend from private.talk_referrals r where r.referrer = me
           and not exists (select 1 from private.referral_rewards w where w.friend = r.friend) order by r.at limit 50 loop
    perform private.referral_settle(f);
  end loop;
  n := (select count(*) from private.referral_rewards where referrer = me);
  select * into mine from private.talk_referrals where friend = me;
  if found then c := private.referral_check(me); end if;
  return jsonb_build_object(
    'code', private.talk_code(me),
    'joined', (select count(*) from private.talk_referrals where referrer = me),
    'counted', n,
    'month', exists (select 1 from private.referral_rewards where referrer = me and month),
    'needs_phone', coalesce((select value <> 'false' from private.config where key = 'referral_needs_phone'), true),
    'mine', case when mine.friend is null then null else c || jsonb_build_object(
      'counted', exists (select 1 from private.referral_rewards where friend = me),
      'via', mine.via) end);
end $$;

revoke all on function public.note_device(text), public.my_referrals() from public, anon;
grant execute on function public.note_device(text), public.my_referrals() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- A Doubles invite counts as my link: as in 20261118000002_double_dates.sql, and a friend who is
-- new (account made in the last 7 days) and joined with nobody's link becomes my friend here.
-- ---------------------------------------------------------------------------------------------
create or replace function public.join_duo(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  link private.duo_links;
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if not exists (select 1 from profiles where id = me) then raise exception using errcode = 'PL002', message = 'Finish setting up first.'; end if;
  perform private.require_active(me);
  if exists (select 1 from duos where person = me) then
    raise exception using errcode = 'PL088', message = 'You are already in a duo. Leave it first.';
  end if;
  select * into link from private.duo_links where token = p_token for update;
  if not found or link.expires_at <= now() or link.used_by is not null then
    raise exception using errcode = 'PL089', message = 'This duo link has expired. Ask your friend for a new one.';
  end if;
  if link.profile_id = me or private.blocked_pair(me, link.profile_id)
     or exists (select 1 from duos where person = link.profile_id)
     or exists (select 1 from profiles where id = link.profile_id and suspended_at is not null) then
    raise exception using errcode = 'PL091', message = 'You cannot join this duo.';
  end if;
  begin
    insert into duos (person, partner) values (me, link.profile_id), (link.profile_id, me);
  exception when unique_violation then
    raise exception using errcode = 'PL091', message = 'You cannot join this duo.';
  end;
  update private.duo_links set used_by = me where token = p_token;
  if (select created_at from auth.users where id = me) >= now() - interval '7 days'
     and not exists (select 1 from private.talk_referrals where friend = me)
     and not exists (select 1 from private.talk_referrals where friend = link.profile_id and referrer = me) then
    insert into private.talk_referrals (friend, referrer, via) values (me, link.profile_id, 'duo');
  end if;
  return link.profile_id;
end $$;

-- ---------------------------------------------------------------------------------------------
-- The data download: whatever came before, plus the app ids of my devices (`app_devices`; `devices`
-- is already my push tokens) and what my friends' sign-ups gave me.
-- ---------------------------------------------------------------------------------------------
alter function public.export_my_data() rename to export_before_referrals;
alter function public.export_before_referrals() set schema private;
revoke all on function private.export_before_referrals() from public, anon, authenticated;

create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  return private.export_before_referrals() || jsonb_build_object(
    'app_devices', coalesce((select jsonb_agg(jsonb_build_object('device', d.device, 'first_seen', d.first_seen, 'last_seen', d.last_seen) order by d.first_seen)
                         from private.devices d where d.user_id = me), '[]'),
    'referral_rewards', jsonb_build_object(
      'friends_counted', (select count(*) from private.referral_rewards where referrer = me),
      'month', exists (select 1 from private.referral_rewards where referrer = me and month),
      'joined_with_link_counted', exists (select 1 from private.referral_rewards where friend = me)));
end $$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
