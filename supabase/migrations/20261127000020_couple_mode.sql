-- Couple mode (D120): a shared corner for two people who matched, so they keep coming back after
-- the first kept plan. The same rules are in src/domain/couple.ts (the mock follows it).
--
--   * A match is a kept plan for two (not a double) where both said "see them again" (round two,
--     20261117000015_ratings.sql). Either of them may ask to start Couple mode; it is on once the
--     other says yes. Everyone is in at most one couple (asked or on) at a time.
--   * Either can end it at any time, for both, with no reason given. A block ends it at once, and
--     deleting an account takes the couple with it.
--   * Inside: a shared date list (ideas from the catalogue, never typed text; each can heart one,
--     mark it done, and plan it as an ordinary pinky promise), special days (the first date and
--     "together since" on their own, plus days either adds from a fixed list), and one couple
--     challenge a week that both tick.
--
-- The tables live in `private`, which no client role can reach: the app reads and writes only
-- through the functions below, and each answers with the caller's couple alone.

create table private.couples (
  id uuid primary key default gen_random_uuid(),
  a uuid not null references auth.users (id) on delete cascade,
  b uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('asked', 'on', 'ended')),
  -- `a` asked; `b` says yes.
  asked_at timestamptz not null default now(),
  since timestamptz,
  ended_at timestamptz,
  check (a <> b)
);
create index couples_a on private.couples (a) where status <> 'ended';
create index couples_b on private.couples (b) where status <> 'ended';

create table private.couple_ideas (
  id bigint generated always as identity primary key,
  couple_id uuid not null references private.couples (id) on delete cascade,
  idea_id text not null references public.ideas (id),
  added_by uuid not null references auth.users (id) on delete cascade,
  hearts uuid[] not null default '{}',
  done_at timestamptz,
  at timestamptz not null default now(),
  unique (couple_id, idea_id)
);

create table private.couple_days (
  id bigint generated always as identity primary key,
  couple_id uuid not null references private.couples (id) on delete cascade,
  kind text not null check (kind in ('birthday', 'first_trip', 'first_festival', 'met_friends', 'special')),
  day date not null,
  added_by uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);

-- One row per couple and week (the Monday it starts, where the asker lives): the challenge and who ticked it.
create table private.couple_weeks (
  couple_id uuid not null references private.couples (id) on delete cascade,
  week date not null,
  challenge text not null,
  done uuid[] not null default '{}',
  primary key (couple_id, week)
);

alter table private.couples enable row level security;
alter table private.couple_ideas enable row level security;
alter table private.couple_days enable row level security;
alter table private.couple_weeks enable row level security;
revoke all on private.couples, private.couple_ideas, private.couple_days, private.couple_weeks from public, anon, authenticated, service_role;

-- The weekly challenges: the same ids, in the same order, as COUPLE_CHALLENGES in src/domain/couple.ts
-- (tests/unit/couple.test.ts checks). The words are in src/i18n (`couple.challenges`).
create or replace function private.couple_challenge_ids()
returns text[] language sql immutable as $$
  select array['cook_together', 'new_place', 'song_dedication', 'compliment_week', 'plan_surprise', 'phone_free_hour', 'teach_words',
    'recreate_first', 'sunrise', 'street_food_hunt', 'question_jar', 'long_walk', 'old_photos', 'board_game', 'thank_you_three',
    'small_budget', 'chai_tasting', 'movie_swap', 'kind_act', 'future_list']::text[];
$$;
revoke all on function private.couple_challenge_ids() from public, anon, authenticated;

-- Matched: a kept plan for two between them, and both said "see them again". Never with a block.
create or replace function private.matched(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not private.blocked_pair(p_a, p_b) and exists (
    select 1 from invites i
    where i.status = 'kept' and i.from_friend is null and i.to_friend is null
      and ((i.from_id = p_a and i.to_id = p_b) or (i.from_id = p_b and i.to_id = p_a))
      and (select count(*) = 2 and bool_and(r.again) from date_ratings r where r.invite_id = i.id)
  );
$$;
revoke all on function private.matched(uuid, uuid) from public, anon, authenticated;

-- My couple, asked or on; ended ones and ones across a block are gone.
create or replace function private.couple_of(p_user uuid)
returns private.couples language sql stable security definer set search_path = public as $$
  select c.* from private.couples c
  where p_user in (c.a, c.b) and c.status in ('asked', 'on') and not private.blocked_pair(c.a, c.b)
  order by c.asked_at desc limit 1;
$$;
revoke all on function private.couple_of(uuid) from public, anon, authenticated;

create or replace function private.couple_me()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if not exists (select 1 from profiles where id = me) then raise exception using errcode = 'PL002', message = 'Finish setting up first.'; end if;
  return me;
end $$;
revoke all on function private.couple_me() from public, anon, authenticated;

-- My couple while it is on, or PL221.
create or replace function private.couple_on(p_user uuid)
returns private.couples language plpgsql stable security definer set search_path = public as $$
declare
  c private.couples := private.couple_of(p_user);
begin
  if c.id is null or c.status <> 'on' then
    raise exception using errcode = 'PL221', message = 'Couple mode is not on any more.';
  end if;
  return c;
end $$;
revoke all on function private.couple_on(uuid) from public, anon, authenticated;

-- This week's row, made on first use. The challenge is a fixed pick from the couple and the week,
-- never last week's again.
create or replace function private.couple_week(c private.couples)
returns private.couple_weeks language plpgsql security definer set search_path = public as $$
declare
  ids text[] := private.couple_challenge_ids();
  wk date := date_trunc('week', private.local_today(c.a))::date;
  last text;
  pick text;
  row private.couple_weeks;
begin
  select * into row from private.couple_weeks where couple_id = c.id and week = wk;
  if found then return row; end if;
  select challenge into last from private.couple_weeks where couple_id = c.id and week = wk - 7;
  pick := ids[1 + abs(hashtext(c.id::text || wk::text)) % array_length(ids, 1)];
  if pick = last then pick := ids[1 + (array_position(ids, pick) % array_length(ids, 1))]; end if;
  insert into private.couple_weeks (couple_id, week, challenge) values (c.id, wk, pick)
  on conflict (couple_id, week) do nothing;
  select * into row from private.couple_weeks where couple_id = c.id and week = wk;
  return row;
end $$;
revoke all on function private.couple_week(private.couples) from public, anon, authenticated;

-- Everything Couple mode shows one person. `matches` are the people I could ask (first names come
-- from the cards I can already see). On: the other person, since when, our first date, the date
-- list, special days, and the last 12 weeks of challenges (oldest first, this week last).
create or replace function private.couple_state(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c private.couples := private.couple_of(p_user);
  other uuid;
  first_date date;
begin
  if c.id is not null and c.status = 'on' then perform private.couple_week(c); end if;
  other := case when c.id is null then null when c.a = p_user then c.b else c.a end;
  if other is not null then
    select min((i.starts_at at time zone coalesce((select ct.time_zone from profiles p join cities ct on ct.name = p.city where p.id = c.a), 'Asia/Kolkata'))::date)
      into first_date from invites i
     where i.status = 'kept' and i.from_friend is null and i.to_friend is null
       and ((i.from_id = c.a and i.to_id = c.b) or (i.from_id = c.b and i.to_id = c.a));
  end if;
  return jsonb_build_object(
    'today', private.local_today(p_user),
    'status', case when c.id is null then 'none' when c.status = 'on' then 'on' when c.a = p_user then 'asked_by_me' else 'asked_me' end,
    'partner', other,
    'since', c.since,
    'first_date', first_date,
    'matches', coalesce((select jsonb_agg(distinct x.other) from (
        select case when i.from_id = p_user then i.to_id else i.from_id end as other
        from invites i
        where i.status = 'kept' and i.from_friend is null and i.to_friend is null and p_user in (i.from_id, i.to_id)) x
      where private.matched(p_user, x.other)), '[]'),
    'ideas', case when c.status = 'on' then coalesce((select jsonb_agg(jsonb_build_object('id', ci.id, 'idea', ci.idea_id, 'mine', ci.added_by = p_user,
        'heart_me', p_user = any (ci.hearts), 'heart_them', other = any (ci.hearts), 'done', ci.done_at is not null) order by ci.done_at nulls first, ci.at desc)
      from private.couple_ideas ci where ci.couple_id = c.id), '[]') else '[]' end,
    'days', case when c.status = 'on' then coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'day', d.day, 'mine', d.added_by = p_user) order by d.day)
      from private.couple_days d where d.couple_id = c.id), '[]') else '[]' end,
    'weeks', case when c.status = 'on' then coalesce((select jsonb_agg(jsonb_build_object('week', w.week, 'challenge', w.challenge,
        'me', p_user = any (w.done), 'them', other = any (w.done)) order by w.week)
      from (select * from private.couple_weeks w where w.couple_id = c.id order by w.week desc limit 12) w), '[]') else '[]' end
  );
end $$;
revoke all on function private.couple_state(uuid) from public, anon, authenticated;

create or replace function public.my_couple()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return private.couple_state(private.couple_me());
end $$;

-- Ask them, or say yes when they already asked me.
create or replace function public.couple_ask(p_to uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.couple_me();
  mine private.couples;
  theirs private.couples;
begin
  if p_to is null or p_to = me or not private.matched(me, p_to) then
    raise exception using errcode = 'PL220', message = 'Couple mode opens once you both want to meet again.';
  end if;
  -- Two asks at once must not make two couples.
  perform pg_advisory_xact_lock(hashtext('couple:' || least(me, p_to)::text || greatest(me, p_to)::text));
  mine := private.couple_of(me);
  if mine.id is not null then
    if mine.status = 'asked' and mine.a = p_to then
      update private.couples set status = 'on', since = now() where id = mine.id;
      return private.couple_state(me);
    end if;
    raise exception using errcode = 'PL222', message = 'You already have Couple mode open. End it first.';
  end if;
  theirs := private.couple_of(p_to);
  if theirs.id is not null then
    raise exception using errcode = 'PL223', message = 'Couple mode cannot start with them right now.';
  end if;
  insert into private.couples (a, b, status) values (me, p_to, 'asked');
  return private.couple_state(me);
end $$;

-- The person asked says yes or no. A no ends the ask quietly.
create or replace function public.couple_answer(p_yes boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.couple_me();
  c private.couples := private.couple_of(me);
begin
  if c.id is null or c.status <> 'asked' or c.b <> me then
    raise exception using errcode = 'PL224', message = 'There is no ask for Couple mode to answer.';
  end if;
  if coalesce(p_yes, false) and private.matched(c.a, c.b) then
    update private.couples set status = 'on', since = now() where id = c.id;
  else
    update private.couples set status = 'ended', ended_at = now() where id = c.id;
  end if;
  return private.couple_state(me);
end $$;

-- Ends it for both, or takes my ask back. Nothing says why.
create or replace function public.couple_end()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.couple_me();
begin
  update private.couples set status = 'ended', ended_at = now()
  where me in (a, b) and status in ('asked', 'on');
  return private.couple_state(me);
end $$;

create or replace function public.couple_add_idea(p_idea text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.couple_me();
  c private.couples := private.couple_on(me);
begin
  if not exists (select 1 from ideas i join profiles p on p.id = me
                 where i.id = p_idea and (i.countries is null or p.country = any (i.countries)) and (i.cities is null or p.city = any (i.cities))) then
    raise exception using errcode = 'PL225', message = 'Pick an idea from the list.';
  end if;
  if exists (select 1 from private.couple_ideas where couple_id = c.id and idea_id = p_idea) then
    raise exception using errcode = 'PL226', message = 'That one is on your list already.';
  end if;
  if (select count(*) from private.couple_ideas where couple_id = c.id) >= 20 then
    raise exception using errcode = 'PL227', message = 'Your date list is full. Remove one to add another.';
  end if;
  insert into private.couple_ideas (couple_id, idea_id, added_by, hearts) values (c.id, p_idea, me, array[me]);
  return private.couple_state(me);
end $$;

-- 'heart' toggles my heart, 'done' marks it done (or not done again), 'remove' takes it off.
create or replace function public.couple_idea(p_id bigint, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.couple_me();
  c private.couples := private.couple_on(me);
begin
  if not exists (select 1 from private.couple_ideas where id = p_id and couple_id = c.id) then
    raise exception using errcode = 'PL228', message = 'That idea is not on your list any more.';
  end if;
  if p_action = 'heart' then
    update private.couple_ideas set hearts = case when me = any (hearts) then array_remove(hearts, me) else hearts || me end where id = p_id;
  elsif p_action = 'done' then
    update private.couple_ideas set done_at = case when done_at is null then now() end where id = p_id;
  elsif p_action = 'remove' then
    delete from private.couple_ideas where id = p_id;
  else
    raise exception using errcode = 'PL228', message = 'That idea is not on your list any more.';
  end if;
  return private.couple_state(me);
end $$;

-- A special day from the list. Up to 12; within the last 80 years and the next one.
create or replace function public.couple_add_day(p_kind text, p_day date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.couple_me();
  c private.couples := private.couple_on(me);
  today date := private.local_today(me);
begin
  if p_kind is null or p_kind not in ('birthday', 'first_trip', 'first_festival', 'met_friends', 'special') then
    raise exception using errcode = 'PL229', message = 'Pick what kind of day it is.';
  end if;
  if p_day is null or p_day < today - interval '80 years' or p_day > today + interval '1 year' then
    raise exception using errcode = 'PL230', message = 'Pick a real date.';
  end if;
  if p_kind = 'birthday' and exists (select 1 from private.couple_days where couple_id = c.id and kind = 'birthday' and added_by = me) then
    raise exception using errcode = 'PL231', message = 'Your birthday is on the list already.';
  end if;
  if (select count(*) from private.couple_days where couple_id = c.id) >= 12 then
    raise exception using errcode = 'PL232', message = 'Twelve special days is the most. Remove one to add another.';
  end if;
  insert into private.couple_days (couple_id, kind, day, added_by) values (c.id, p_kind, p_day, me);
  return private.couple_state(me);
end $$;

-- Only the one who added a day can take it off.
create or replace function public.couple_remove_day(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.couple_me();
  c private.couples := private.couple_on(me);
begin
  delete from private.couple_days where id = p_id and couple_id = c.id and added_by = me;
  if not found then raise exception using errcode = 'PL233', message = 'That day is not yours to remove.'; end if;
  return private.couple_state(me);
end $$;

-- I did this week's challenge (or take my tick back).
create or replace function public.couple_challenge_done(p_done boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.couple_me();
  c private.couples := private.couple_on(me);
  w private.couple_weeks := private.couple_week(c);
begin
  update private.couple_weeks set done = case when coalesce(p_done, true) then (select array_agg(distinct x) from unnest(done || me) x) else array_remove(done, me) end
  where couple_id = c.id and week = w.week;
  return private.couple_state(me);
end $$;

revoke all on function public.my_couple(), public.couple_ask(uuid), public.couple_answer(boolean), public.couple_end(), public.couple_add_idea(text),
  public.couple_idea(bigint, text), public.couple_add_day(text, date), public.couple_remove_day(bigint), public.couple_challenge_done(boolean) from public, anon;
grant execute on function public.my_couple(), public.couple_ask(uuid), public.couple_answer(boolean), public.couple_end(), public.couple_add_idea(text),
  public.couple_idea(bigint, text), public.couple_add_day(text, date), public.couple_remove_day(bigint), public.couple_challenge_done(boolean) to authenticated;

-- A block ends a couple at once (couple_of already hides it; this makes it final).
create or replace function private.couple_blocked()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update private.couples set status = 'ended', ended_at = now()
  where status in ('asked', 'on') and ((a = new.blocker_id and b = new.blocked_id) or (a = new.blocked_id and b = new.blocker_id));
  return null;
end $$;
revoke all on function private.couple_blocked() from public, anon, authenticated;
create trigger blocks_end_couple after insert on public.blocks for each row execute function private.couple_blocked();

-- ---------------------------------------------------------------------------------------------
-- The data download: whatever came before, plus my couples. One key is added and the format name
-- is kept, so this sits on top of any later format without clashing with it.
-- ---------------------------------------------------------------------------------------------
do $$ begin
  execute 'alter function public.export_my_data() rename to export_before_couple';
  execute 'alter function public.export_before_couple() set schema private';
end $$;
revoke all on function private.export_before_couple() from public, anon, authenticated;

create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  return private.export_before_couple() || jsonb_build_object(
    'couples', coalesce((select jsonb_agg(jsonb_build_object('status', c.status, 'asked_by_me', c.a = me, 'asked_at', c.asked_at, 'since', c.since, 'ended_at', c.ended_at,
        'date_list', coalesce((select jsonb_agg(jsonb_build_object('idea', ci.idea_id, 'added_by_me', ci.added_by = me, 'my_heart', me = any (ci.hearts), 'done_at', ci.done_at) order by ci.at)
                               from private.couple_ideas ci where ci.couple_id = c.id), '[]'),
        'special_days', coalesce((select jsonb_agg(jsonb_build_object('kind', d.kind, 'day', d.day, 'added_by_me', d.added_by = me) order by d.day)
                                  from private.couple_days d where d.couple_id = c.id), '[]'),
        'challenges', coalesce((select jsonb_agg(jsonb_build_object('week', w.week, 'challenge', w.challenge, 'i_did_it', me = any (w.done)) order by w.week)
                                from private.couple_weeks w where w.couple_id = c.id), '[]')) order by c.asked_at)
      from private.couples c where me in (c.a, c.b)), '[]'));
end $$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
