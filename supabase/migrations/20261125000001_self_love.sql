-- Self love (D101): a private corner of the app for the person alone, with Bounce back for after a
-- no. Nobody else can read any of it: not the other people, not moderators, not the analytics
-- worker, and it is never in a log, a push or an error report. It is in the person's data export
-- and goes with their account. The same rules are in src/domain/selfLove.ts (the mock follows it).
--
--   * Mood check-in: one mood a day (it can be changed that day). The days in a row make the streak.
--   * Notes: three good things a day for the gratitude jar, a private journal for after a hard
--     day, and a list of one's own boundaries. Up to 300 characters each, 200 notes in all.
--   * The 3-day reset: one small step a day, each opening on its day.
--   * Pause: off Discover for 1 to 14 days. Plans and asks already made carry on.
--
-- The tables live in `private`, which no client role can reach: the app reads and writes only
-- through the functions below, each about the caller alone.

create table private.self_moods (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  mood text not null check (mood in ('glowing', 'good', 'okay', 'low', 'rough')),
  at timestamptz not null default now(),
  primary key (user_id, day)
);

create table private.self_notes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('gratitude', 'journal', 'boundary')),
  body text not null check (char_length(body) between 1 and 300),
  day date not null,
  at timestamptz not null default now()
);
create index self_notes_user on private.self_notes (user_id, at);

create table private.self_love (
  user_id uuid primary key references auth.users (id) on delete cascade,
  paused_until timestamptz,
  reset_started date,
  reset_done int[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table private.self_moods enable row level security;
alter table private.self_notes enable row level security;
alter table private.self_love enable row level security;
revoke all on private.self_moods, private.self_notes, private.self_love from public, anon, authenticated, service_role;

-- "Today" where the person lives: their city's time zone (every open city has one).
create or replace function private.local_today(p_user uuid)
returns date language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select c.time_zone from profiles p join cities c on c.name = p.city where p.id = p_user), 'Asia/Kolkata'))::date;
$$;
revoke all on function private.local_today(uuid) from public, anon, authenticated;

-- Everything Self love shows, about one person: the last 60 days of moods, the notes, the pause
-- and the reset.
create or replace function private.self_love_state(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'today', private.local_today(p_user),
    'moods', coalesce((select jsonb_agg(jsonb_build_object('day', m.day, 'mood', m.mood) order by m.day)
               from private.self_moods m where m.user_id = p_user and m.day > private.local_today(p_user) - 60), '[]'),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'body', n.body, 'day', n.day, 'at', n.at) order by n.at desc, n.id desc)
               from private.self_notes n where n.user_id = p_user), '[]'),
    'paused_until', (select s.paused_until from private.self_love s where s.user_id = p_user and s.paused_until > now()),
    'reset', (select jsonb_build_object('started', s.reset_started, 'done', to_jsonb(s.reset_done))
              from private.self_love s where s.user_id = p_user and s.reset_started is not null)
  );
$$;
revoke all on function private.self_love_state(uuid) from public, anon, authenticated;

create or replace function private.self_love_me()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if not exists (select 1 from profiles where id = me) then raise exception using errcode = 'PL002', message = 'Finish setting up first.'; end if;
  return me;
end $$;
revoke all on function private.self_love_me() from public, anon, authenticated;

create or replace function public.my_self_love()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return private.self_love_state(private.self_love_me());
end $$;

create or replace function public.save_mood(p_mood text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
begin
  if p_mood is null or p_mood not in ('glowing', 'good', 'okay', 'low', 'rough') then
    raise exception using errcode = 'PL115', message = 'Pick a mood from the list.';
  end if;
  insert into private.self_moods (user_id, day, mood) values (me, private.local_today(me), p_mood)
  on conflict (user_id, day) do update set mood = excluded.mood, at = now();
  return private.self_love_state(me);
end $$;

create or replace function public.add_self_note(p_kind text, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  body text := btrim(coalesce(p_body, ''));
  today date := private.local_today(me);
begin
  if p_kind is null or p_kind not in ('gratitude', 'journal', 'boundary') then
    raise exception using errcode = 'PL116', message = 'Pick where this note goes.';
  end if;
  if char_length(body) < 1 or char_length(body) > 300 then
    raise exception using errcode = 'PL117', message = 'Write a few words, up to 300 characters.';
  end if;
  if p_kind = 'gratitude' and (select count(*) from private.self_notes where user_id = me and kind = 'gratitude' and day = today) >= 3 then
    raise exception using errcode = 'PL118', message = 'Three good things a day is plenty. Add more tomorrow.';
  end if;
  if (select count(*) from private.self_notes where user_id = me) >= 200 then
    raise exception using errcode = 'PL119', message = 'Your notes are full. Remove one to add another.';
  end if;
  insert into private.self_notes (user_id, kind, body, day) values (me, p_kind, body, today);
  return private.self_love_state(me);
end $$;

create or replace function public.remove_self_note(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
begin
  delete from private.self_notes where id = p_id and user_id = me;
  if not found then raise exception using errcode = 'PL120', message = 'That note is not there any more.'; end if;
  return private.self_love_state(me);
end $$;

-- 0 comes back to Discover now.
create or replace function public.pause_discover(p_days int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
begin
  if p_days is null or p_days < 0 or p_days > 14 then
    raise exception using errcode = 'PL121', message = 'Pause for 1 to 14 days.';
  end if;
  insert into private.self_love (user_id, paused_until) values (me, case when p_days = 0 then null else now() + make_interval(days => p_days) end)
  on conflict (user_id) do update set paused_until = excluded.paused_until, updated_at = now();
  return private.self_love_state(me);
end $$;

-- Starting again starts from day one.
create or replace function public.start_reset()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
begin
  insert into private.self_love (user_id, reset_started, reset_done) values (me, private.local_today(me), '{}')
  on conflict (user_id) do update set reset_started = excluded.reset_started, reset_done = '{}', updated_at = now();
  return private.self_love_state(me);
end $$;

-- A step opens on its own day: day 2 the day after the start, day 3 the day after that.
create or replace function public.do_reset_step(p_day int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  started date;
begin
  select reset_started into started from private.self_love where user_id = me;
  if started is null or p_day is null or p_day < 1 or p_day > 3 or started + (p_day - 1) > private.local_today(me) then
    raise exception using errcode = 'PL122', message = 'That step opens on its own day.';
  end if;
  update private.self_love set reset_done = (select array_agg(distinct d order by d) from unnest(reset_done || p_day) d), updated_at = now()
  where user_id = me;
  return private.self_love_state(me);
end $$;

revoke all on function public.my_self_love(), public.save_mood(text), public.add_self_note(text, text), public.remove_self_note(bigint),
  public.pause_discover(int), public.start_reset(), public.do_reset_step(int) from public, anon;
grant execute on function public.my_self_love(), public.save_mood(text), public.add_self_note(text, text), public.remove_self_note(bigint),
  public.pause_discover(int), public.start_reset(), public.do_reset_step(int) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Discover leaves out whoever is paused. Otherwise as in 20261119000006_discover_skips_deleted.sql.
-- ---------------------------------------------------------------------------------------------
create or replace function public.discover(p_limit integer default 20)
returns setof profile_cards language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  my_city text;
  want int := least(greatest(coalesce(p_limit, 20), 1), 20);
  served int := 0;
  used int;
  card public.profile_cards;
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  select city into my_city from profiles where id = me;
  if not found then raise exception using errcode = 'PL002', message = 'Finish setting up first.'; end if;
  select count(*) into used from private.discover_seen where user_id = me and at > now() - interval '1 day';

  for card in
    select c.* from profile_cards c
    where c.id <> me
      and c.city = my_city
      and not private.blocked_pair(me, c.id)
      and not exists (select 1 from passes p where p.profile_id = me and p.passed_id = c.id)
      and not exists (select 1 from invites i
                      where i.status in ('sent', 'half_locked', 'locked')
                        and ((i.from_id = me and i.to_id = c.id) or (i.from_id = c.id and i.to_id = me)))
      and (not private.config_on('require_linked') or private.is_linked(c.id))
      and not exists (select 1 from profiles s where s.id = c.id and s.suspended_at is not null)
      and not exists (select 1 from private.self_love z where z.user_id = c.id and z.paused_until > now())
    -- A fresh order every day, the same all day, and different for every person.
    order by md5(me::text || c.id::text || current_date::text)
  loop
    if exists (select 1 from private.discover_seen s where s.user_id = me and s.card_id = card.id and s.at > now() - interval '1 day') then
      return next card;
    elsif used < 200 then
      -- The card's account can be deleted between picking it and recording it (another person,
      -- at that moment): skip that card rather than fail the page.
      begin
        insert into private.discover_seen (user_id, card_id) values (me, card.id)
        on conflict (user_id, card_id) do update set at = now();
      exception when foreign_key_violation then
        continue;
      end;
      used := used + 1;
      return next card;
    else
      continue;
    end if;
    served := served + 1;
    exit when served >= want;
  end loop;
end $$;
revoke all on function public.discover(int) from public, anon;
grant execute on function public.discover(int) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- The data download, format 7: as in 20261119000004_face_photo.sql, plus Self love.
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
    'format', 'pinkilock-export-7',
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
      'pause_and_reset', (select jsonb_build_object('paused_until', s.paused_until, 'reset_started', s.reset_started, 'reset_done', s.reset_done) from private.self_love s where s.user_id = me))
  );
end $$;
