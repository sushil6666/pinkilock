-- Daily relationship check-in (D126): once a day, how today went in my relationship (or my dating
-- life), what was good and what went badly, in my own words; then Saathi, the AI (D108), suggests
-- a few small things to try, grounded in what I wrote. Private to me, like Self love.
--
--   * One check-in a day (my city's day): a mood from a fixed list and two short notes, up to 500
--     characters each. Kept so I can look back over the last 14; deleted with my account; in my
--     data download. Nobody else reads them, the analytics worker neither.
--   * Suggestions come from the `talk` Edge Function (action 'checkin'): it claims today's entry
--     with the service role, asks Claude, and stores the answer. Once a day; free while payments
--     are paused. The model sees the two notes and the mood, never a name or an id. Without the
--     Claude key it is off (PL161) and the app shows the tip of the day instead.
--   * A mention of self-harm (private.mentions_harm, or the AI's own [[HELP]] mark) sets `harm`,
--     and the app puts the help lines first. Saathi's instructions also hand off on abuse (112, 181).
--   * An opt-in reminder at an hour I pick (18:00 to 22:00, my city's time), only on days I have
--     not checked in. It is the person's own daily choice, so it sits outside the gentle reminders'
--     3-a-week cap (D124), and has its own kind, `checkin_daily`.

create table private.rel_checkins (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  mood text not null check (mood in ('great', 'good', 'okay', 'hard', 'rough')),
  good text not null default '' check (char_length(good) <= 500),
  bad text not null default '' check (char_length(bad) <= 500),
  suggestion text check (char_length(suggestion) <= 3000),
  ai boolean not null default false,
  harm boolean not null default false,
  at timestamptz not null default now(),
  primary key (user_id, day)
);
create table private.checkin_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  hour int check (hour between 18 and 22),
  updated_at timestamptz not null default now()
);
alter table private.rel_checkins enable row level security;
alter table private.checkin_prefs enable row level security;
revoke all on private.rel_checkins, private.checkin_prefs from public, anon, authenticated, service_role;

create or replace function private.checkin_state(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'today', private.local_today(p_user),
    'reminder_hour', (select p.hour from private.checkin_prefs p where p.user_id = p_user),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('day', c.day, 'mood', c.mood, 'good', c.good, 'bad', c.bad,
        'suggestion', c.suggestion, 'ai', c.ai, 'harm', c.harm) order by c.day desc)
      from (select * from private.rel_checkins c where c.user_id = p_user order by c.day desc limit 14) c), '[]'));
$$;
revoke all on function private.checkin_state(uuid) from public, anon, authenticated;

create or replace function private.checkin_me()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if not exists (select 1 from profiles where id = me) then raise exception using errcode = 'PL002', message = 'Finish setting up first.'; end if;
  return me;
end $$;
revoke all on function private.checkin_me() from public, anon, authenticated;

create or replace function public.my_checkins()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return private.checkin_state(private.checkin_me());
end $$;

create or replace function public.checkin_save(p_mood text, p_good text, p_bad text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.checkin_me();
  g text := btrim(coalesce(p_good, ''));
  b text := btrim(coalesce(p_bad, ''));
begin
  if p_mood is null or p_mood not in ('great', 'good', 'okay', 'hard', 'rough') then
    raise exception using errcode = 'PL237', message = 'Pick how today felt.';
  end if;
  if char_length(g) > 500 or char_length(b) > 500 then
    raise exception using errcode = 'PL238', message = 'Keep each note to 500 characters.';
  end if;
  insert into private.rel_checkins (user_id, day, mood, good, bad, harm)
  values (me, private.local_today(me), p_mood, g, b, private.mentions_harm(g || ' ' || b))
  on conflict (user_id, day) do nothing;
  if not found then
    raise exception using errcode = 'PL239', message = 'You have checked in today. Come back tomorrow.';
  end if;
  return private.checkin_state(me);
end $$;

create or replace function public.checkin_reminder(p_hour int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := private.checkin_me();
begin
  if p_hour is not null and p_hour not between 18 and 22 then
    raise exception using errcode = 'PL240', message = 'Pick a reminder time between 6 pm and 10 pm, or turn it off.';
  end if;
  insert into private.checkin_prefs (user_id, hour) values (me, p_hour)
  on conflict (user_id) do update set hour = excluded.hour, updated_at = now();
  if p_hour is null then delete from notifications where recipient_id = me and kind = 'checkin_daily' and sent_at is null; end if;
  return private.checkin_state(me);
end $$;

revoke all on function public.my_checkins(), public.checkin_save(text, text, text), public.checkin_reminder(int) from public, anon;
grant execute on function public.my_checkins(), public.checkin_save(text, text, text), public.checkin_reminder(int) to authenticated;

-- For the `talk` Edge Function only (service role): today's entry, once, while it has no suggestion.
create or replace function public.checkin_ai_claim(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c private.rel_checkins;
begin
  select * into c from private.rel_checkins where user_id = p_user and day = private.local_today(p_user);
  if c.user_id is null then raise exception using errcode = 'PL237', message = 'Pick how today felt.'; end if;
  if c.suggestion is not null then raise exception using errcode = 'PL239', message = 'You have checked in today. Come back tomorrow.'; end if;
  return jsonb_build_object('mood', c.mood, 'good', c.good, 'bad', c.bad, 'harm', c.harm);
end $$;

create or replace function public.checkin_ai_done(p_user uuid, p_text text, p_harm boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update private.rel_checkins set suggestion = left(p_text, 3000), ai = true, harm = harm or coalesce(p_harm, false)
  where user_id = p_user and day = private.local_today(p_user) and suggestion is null;
  return private.checkin_state(p_user);
end $$;
revoke all on function public.checkin_ai_claim(uuid), public.checkin_ai_done(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.checkin_ai_claim(uuid), public.checkin_ai_done(uuid, text, boolean) to service_role;

-- The reminder rides the push outbox like every other push.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'new_ask', 'pinky_out', 'locked', 'checkin_open', 'bailed', 'no_show', 'missed',
  'nudge_couple', 'nudge_streak', 'nudge_week', 'nudge_self', 'checkin_daily'));

create or replace function private.queue_checkin_reminders(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into notifications (recipient_id, kind, title, body, created_at)
  select p.user_id, 'checkin_daily', 'How was today?', 'A minute to note what went well and what did not. Saathi has a few ideas after.', p_now
  from private.checkin_prefs p
  join profiles pr on pr.id = p.user_id
  left join cities ct on ct.name = pr.city
  where p.hour is not null
    and extract(hour from p_now at time zone coalesce(ct.time_zone, 'Asia/Kolkata')) = p.hour
    and exists (select 1 from push_tokens t where t.profile_id = p.user_id)
    and not exists (select 1 from private.self_love s where s.user_id = p.user_id and s.paused_until > p_now)
    and not exists (select 1 from private.rel_checkins c where c.user_id = p.user_id and c.day = (p_now at time zone coalesce(ct.time_zone, 'Asia/Kolkata'))::date)
    and not exists (select 1 from notifications x where x.recipient_id = p.user_id and x.kind = 'checkin_daily' and x.created_at > p_now - interval '20 hours');
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function private.queue_checkin_reminders(timestamptz) from public, anon, authenticated;
select cron.schedule('pinkilock-checkin-reminders', '3 * * * *', 'select private.queue_checkin_reminders()');

-- The data download: my check-ins and my reminder time.
do $$ begin
  execute 'alter function public.export_my_data() rename to export_before_checkins';
  execute 'alter function public.export_before_checkins() set schema private';
end $$;
revoke all on function private.export_before_checkins() from public, anon, authenticated;

create or replace function public.export_my_data()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return private.export_before_checkins() || jsonb_build_object(
    'relationship_checkins', coalesce((select jsonb_agg(jsonb_build_object('day', c.day, 'mood', c.mood, 'good', c.good, 'bad', c.bad, 'suggestion', c.suggestion) order by c.day)
      from private.rel_checkins c where c.user_id = auth.uid()), '[]'),
    'checkin_reminder_hour', (select p.hour from private.checkin_prefs p where p.user_id = auth.uid()));
end $$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
