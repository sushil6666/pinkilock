-- Gentle pushes (D124): a few reminders a week that bring people back, never more.
--
--   * At most 3 in any 7 days, at most 1 in any 20 hours, only between 10:00 and 20:00 in the
--     person's city, and only to people with a phone that takes pushes.
--   * Off with one switch on Me (`set_nudges(false)`); also quiet while Self love's pause is on.
--   * What they say, first match wins:
--       1. someone asked me to start Couple mode (D120) over 2 hours ago and I have not answered;
--       2. Thursday or later, and our couple challenge this week is not ticked by me;
--       3. Saturday or Sunday, I kept a plan last week and have none kept or locked this week (D122);
--       4. Monday: three new plan ideas are on Plans (D121), unless I already have a plan going;
--       5. Wednesday, I used Self love's mood check-in in the last 30 days but not in the last 3.
--     Each is sent once (`nudge_key`), so the same reminder never comes twice.
--   * The words are about me only: no other person is named except my own Couple mode partner.
--
-- They ride the existing outbox (public.notifications) and Edge Function, so they get the same
-- retries, receipts and tracing as promise pushes. A nudge has no invite.

alter table public.notifications alter column invite_id drop not null;
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'new_ask', 'pinky_out', 'locked', 'checkin_open', 'bailed', 'no_show', 'missed',
  'nudge_couple', 'nudge_streak', 'nudge_week', 'nudge_self'));
alter table public.notifications add column nudge_key text;
alter table public.notifications add constraint notifications_nudge_shape
  check ((kind like 'nudge\_%') = (nudge_key is not null) and (nudge_key is null or invite_id is null));
create unique index notifications_nudge_once on public.notifications (recipient_id, nudge_key) where nudge_key is not null;

create table private.nudge_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  off boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table private.nudge_prefs enable row level security;
revoke all on private.nudge_prefs from public, anon, authenticated;

create or replace function public.my_nudges()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  return jsonb_build_object('on', not coalesce((select n.off from private.nudge_prefs n where n.user_id = me), false));
end $$;

create or replace function public.set_nudges(p_on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if p_on is null then raise exception using errcode = 'PL234', message = 'Turn reminders on or off.'; end if;
  insert into private.nudge_prefs (user_id, off) values (me, not p_on)
  on conflict (user_id) do update set off = excluded.off, updated_at = now();
  -- Turning them off also drops any reminder not yet sent.
  if not p_on then delete from notifications where recipient_id = me and nudge_key is not null and sent_at is null; end if;
  return public.my_nudges();
end $$;
revoke all on function public.my_nudges(), public.set_nudges(boolean) from public, anon;
grant execute on function public.my_nudges(), public.set_nudges(boolean) to authenticated;

create or replace function private.queue_nudges(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = public as $$
declare
  p record;
  loc timestamp;
  today date;
  wk date;
  dow int;
  n int := 0;
  cand record;
begin
  for p in
    select pr.id, coalesce(c.time_zone, 'Asia/Kolkata') tz
    from profiles pr left join cities c on c.name = pr.city
    where exists (select 1 from push_tokens t where t.profile_id = pr.id)
      and not coalesce((select np.off from private.nudge_prefs np where np.user_id = pr.id), false)
      and not exists (select 1 from private.self_love s where s.user_id = pr.id and s.paused_until > p_now)
      and (select count(*) from notifications x where x.recipient_id = pr.id and x.nudge_key is not null and x.created_at > p_now - interval '7 days') < 3
      and not exists (select 1 from notifications x where x.recipient_id = pr.id and x.nudge_key is not null and x.created_at > p_now - interval '20 hours')
  loop
    loc := p_now at time zone p.tz;
    if extract(hour from loc) < 10 or extract(hour from loc) >= 20 then continue; end if;
    today := loc::date;
    wk := date_trunc('week', loc)::date;
    dow := extract(isodow from loc);

    for cand in
      -- 1. A Couple mode ask waiting on me.
      select 1 o, 'nudge_couple' kind, 'couple_ask:' || c.id key, 'Couple mode' title,
             a.name || ' wants to start Couple mode with you. Say yes or not now, whenever you like.' body
      from private.couples c join profiles a on a.id = c.a
      where c.b = p.id and c.status = 'asked' and c.asked_at < p_now - interval '2 hours'
        and not private.blocked_pair(c.a, c.b)
      union all
      -- 2. Our challenge this week, not ticked by me yet.
      select 2, 'nudge_couple', 'couple_week:' || c.id || ':' || wk, 'This week''s couple challenge',
             'Still open with ' || o.name || '. Do it together and both tick it before Sunday.'
      from private.couples c join profiles o on o.id = case when c.a = p.id then c.b else c.a end
      where dow >= 4 and c.status = 'on' and p.id in (c.a, c.b)
        and not exists (select 1 from private.couple_weeks w where w.couple_id = c.id and w.week = wk and p.id = any (w.done))
      union all
      -- 3. The kept-plan streak, at the weekend.
      select 3, 'nudge_streak', 'streak:' || wk, 'Keep your streak going',
             'You kept a plan last week. One this week keeps your streak alive.'
      where dow >= 6
        and exists (select 1 from invites i where i.status = 'kept' and p.id in (i.from_id, i.to_id, i.from_friend, i.to_friend)
                    and date_trunc('week', i.starts_at at time zone p.tz)::date = wk - 7)
        and not exists (select 1 from invites i where i.status in ('kept', 'locked') and p.id in (i.from_id, i.to_id, i.from_friend, i.to_friend)
                    and date_trunc('week', i.starts_at at time zone p.tz)::date = wk)
      union all
      -- 4. Monday's new ideas, unless a plan is already going.
      select 4, 'nudge_week', 'week:' || wk, 'Three new plan ideas',
             'This week''s ideas are on Plans. Pick one and ask someone.'
      where dow = 1
        and not exists (select 1 from invites i where i.status in ('sent', 'half_locked', 'locked') and p.id in (i.from_id, i.to_id, i.from_friend, i.to_friend))
      union all
      -- 5. A gentle Self love check-in for people who use it.
      select 5, 'nudge_self', 'self:' || wk, 'A minute for you',
             'How are you this week? Your Self love page is there when you want it.'
      where dow = 3
        and exists (select 1 from private.self_moods m where m.user_id = p.id and m.day > today - 30)
        and not exists (select 1 from private.self_moods m where m.user_id = p.id and m.day > today - 3)
      order by 1
    loop
      insert into notifications (recipient_id, kind, title, body, nudge_key, created_at)
      values (p.id, cand.kind, cand.title, cand.body, cand.key, p_now)
      on conflict (recipient_id, nudge_key) where nudge_key is not null do nothing;
      if found then n := n + 1; exit; end if;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function private.queue_nudges(timestamptz) from public, anon, authenticated;

-- A block drops any Couple mode reminder not sent yet, to either of the two (they name the other).
create or replace function private.blocks_drop_nudges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from notifications where kind = 'nudge_couple' and sent_at is null and recipient_id in (new.blocker_id, new.blocked_id);
  return null;
end $$;
revoke all on function private.blocks_drop_nudges() from public, anon, authenticated;
create trigger blocks_drop_nudges after insert on public.blocks for each row execute function private.blocks_drop_nudges();

-- Hourly, a few minutes past, so the 10:00 to 20:00 window is checked in every city.
select cron.schedule('pinkilock-nudges', '7 * * * *', 'select private.queue_nudges()');

-- The data download says whether reminders are on.
do $$ begin
  execute 'alter function public.export_my_data() rename to export_before_nudges';
  execute 'alter function public.export_before_nudges() set schema private';
end $$;
revoke all on function private.export_before_nudges() from public, anon, authenticated;

create or replace function public.export_my_data()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return private.export_before_nudges() || jsonb_build_object(
    'reminders', jsonb_build_object('on', not coalesce((select n.off from private.nudge_prefs n where n.user_id = auth.uid()), false)));
end $$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
