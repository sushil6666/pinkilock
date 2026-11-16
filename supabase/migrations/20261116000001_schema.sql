-- Pinkilock: live database (Supabase / PostgreSQL 15+).
--
-- This folder is the one source of truth for the schema. It reaches a project with
-- `supabase db push`, a local stack with `supabase start`, and the throwaway Postgres in
-- tests/db/run.py, which applies these same files in order. Never edit an applied migration:
-- add a new one.
--
-- Shape of the thing:
--   * Clients read through Row-Level Security and write promises ONLY through the functions at
--     the bottom (security definer). There is no insert/update policy on invites at all.
--   * Every state change appends to `events`. Clients cannot read that table; the DuckDB worker
--     (analytics/duckdb_pipeline.py) scans it and writes `trust_scores` back.
--   * `profile_private` (contact handle, extra photos) is readable by someone else only once the
--     two of you have a KEPT promise. The blur in the app is decoration; this policy is the lock.

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create type public.invite_status as enum ('sent', 'half_locked', 'locked', 'kept', 'flaked', 'declined', 'expired');

create table public.ideas (
  id text primary key,
  title text not null,
  emoji text not null,
  minutes int not null check (minutes between 5 and 45),
  kind text not null check (kind in ('video', 'irl', 'game')),
  blurb text not null
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 24),
  age int not null check (age between 18 and 99),
  city text not null default 'Mumbai',
  area text not null default '',
  pronouns text not null default '',
  tagline text not null default '' check (char_length(tagline) <= 80),
  vibes text[] not null default '{}',
  idea_ids text[] not null default '{}',
  palette text[] not null default '{#F6F6F1,#3A3A44}',
  glyph text not null default '🤙',
  photo_count int not null default 0,
  created_at timestamptz not null default now()
);

create table public.profile_private (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  contact_kind text not null check (contact_kind in ('Instagram', 'Snapchat', 'WhatsApp')),
  contact_handle text not null check (char_length(contact_handle) between 2 and 40),
  -- [{ "caption": "...", "glyph": "...", "palette": ["#..", "#.."] }] until real photo storage lands
  photos jsonb not null default '[]'
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  idea_id text not null references public.ideas (id),
  starts_at timestamptz not null,
  minutes int not null,
  place text not null default '',
  note varchar(80) not null default '',
  status public.invite_status not null default 'sent',
  first_pinky_by uuid references public.profiles (id),
  locked_at timestamptz,
  check_ins uuid[] not null default '{}',
  flaked_by uuid references public.profiles (id),
  declined_by uuid references public.profiles (id),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (from_id <> to_id)
);

create index invites_from_idx on public.invites (from_id, status);
create index invites_to_idx on public.invites (to_id, status);
create index invites_clock_idx on public.invites (status, starts_at) where status in ('sent', 'half_locked', 'locked');
-- One live thing per pair, whoever asked. Also closes the race between two simultaneous asks.
create unique index invites_one_live_per_pair on public.invites (least(from_id, to_id), greatest(from_id, to_id))
  where status in ('sent', 'half_locked', 'locked');

create table public.passes (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  passed_id uuid not null references public.profiles (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (profile_id, passed_id)
);

-- Append-only behaviour log. The OLAP side reads this; the app never does.
create table public.events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  invite_id uuid,
  type text not null check (type in (
    'app_open', 'ask_sent', 'pinky_out', 'locked', 'declined', 'expired', 'checked_in', 'kept', 'bailed', 'no_show')),
  props jsonb not null default '{}'
);
create index events_at_idx on public.events (at);

-- Written by the DuckDB worker, read by everyone. A person with no row yet shows as 100 / new.
create table public.trust_scores (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  score int not null check (score between 0 and 100),
  kept int not null default 0,
  flaked int not null default 0,
  late_bails int not null default 0,
  no_shows int not null default 0,
  median_answer_minutes numeric,
  computed_at timestamptz not null default now()
);

-- What the app selects for a card: the profile plus its score, in one round trip.
create view public.profile_cards with (security_invoker = true) as
select p.*,
       coalesce(t.score, 100) as trust_score,
       coalesce(t.kept, 0) as kept,
       coalesce(t.flaked, 0) as flaked,
       t.computed_at as trust_computed_at
from public.profiles p
left join public.trust_scores t on t.profile_id = p.id;

-- ---------------------------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------------------------

alter table public.ideas enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.invites enable row level security;
alter table public.passes enable row level security;
alter table public.events enable row level security;
alter table public.trust_scores enable row level security;

create policy ideas_read on public.ideas for select to authenticated using (true);

create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_insert_own on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- THE ACCOUNTABLE REVEAL. Mine always; yours only after we both showed up.
create policy private_own on public.profile_private for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy private_after_kept on public.profile_private for select to authenticated using (
  exists (
    select 1 from public.invites i
    where i.status = 'kept'
      and ((i.from_id = auth.uid() and i.to_id = profile_private.profile_id)
        or (i.to_id = auth.uid() and i.from_id = profile_private.profile_id))
  )
);

-- Invites: the two people on it can read it. Nobody can write it directly.
create policy invites_read_party on public.invites for select to authenticated
  using (auth.uid() in (from_id, to_id));

create policy passes_own on public.passes for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy trust_read on public.trust_scores for select to authenticated using (true);

-- events: RLS on, no policy. Only the functions below (definer) and the analytics role touch it.

-- Supabase grants ALL on every new table in public to anon and authenticated by default. Take all
-- of it back and hand out exactly what the app uses, so that RLS is the second lock, not the only one.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.invites, public.trust_scores, public.ideas, public.profile_cards to authenticated;
grant select, insert, update on public.profiles, public.profile_private to authenticated;
grant select, insert, delete on public.passes to authenticated;

-- ---------------------------------------------------------------------------------------------
-- The promise functions. Each one is a transition of the state machine in ARCHITECTURE.md
-- section 4 and mirrors src/domain/invites.ts.
-- ---------------------------------------------------------------------------------------------

create or replace function public.log_event(p_type text, p_props jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_type <> 'app_open' then raise exception 'Only app_open can be logged from the app.'; end if;
  insert into events (actor_id, type, props) values (auth.uid(), p_type, coalesce(p_props, '{}'));
end $$;

create or replace function public.send_invite(p_to uuid, p_idea text, p_starts_at timestamptz, p_place text, p_note text)
returns public.invites language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mins int;
  inv invites;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if p_to = me then raise exception 'You cannot ask yourself.'; end if;
  if p_starts_at <= now() then raise exception 'Pick a time that has not passed.'; end if;
  select minutes into mins from ideas where id = p_idea;
  if not found then raise exception 'Unknown idea.'; end if;
  if (select count(*) from invites where from_id = me and status in ('sent', 'half_locked')) >= 3 then
    raise exception 'You have 3 asks open. Wait for an answer first.';
  end if;
  begin
    insert into invites (from_id, to_id, idea_id, starts_at, minutes, place, note, expires_at)
    values (me, p_to, p_idea, p_starts_at, mins, btrim(coalesce(p_place, '')), left(btrim(coalesce(p_note, '')), 80),
            least(now() + interval '24 hours', p_starts_at))
    returning * into inv;
  exception when unique_violation then
    raise exception 'You two already have something open.';
  end;
  insert into events (actor_id, invite_id, type, props) values (me, inv.id, 'ask_sent', jsonb_build_object('idea', p_idea));
  return inv;
end $$;

create or replace function public.offer_pinky(p_invite uuid)
returns public.invites language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv invites;
begin
  select * into inv from invites where id = p_invite and me in (from_id, to_id) for update;
  if not found then raise exception 'That invite is gone.'; end if;
  if inv.status in ('sent', 'half_locked') and now() >= inv.expires_at then raise exception 'This one expired.'; end if;

  if inv.status = 'sent' then
    if me <> inv.to_id then raise exception 'The person you asked goes first.'; end if;
    update invites set status = 'half_locked', first_pinky_by = me where id = inv.id returning * into inv;
    insert into events (actor_id, invite_id, type) values (me, inv.id, 'pinky_out');
  elsif inv.status = 'half_locked' then
    if inv.first_pinky_by = me then return inv; end if;
    update invites set status = 'locked', locked_at = now() where id = inv.id returning * into inv;
    insert into events (actor_id, invite_id, type) values (me, inv.id, 'pinky_out'), (me, inv.id, 'locked');
  else
    raise exception 'This one is not open any more.';
  end if;
  return inv;
end $$;

create or replace function public.decline_invite(p_invite uuid)
returns public.invites language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv invites;
begin
  update invites set status = 'declined', declined_by = me, resolved_at = now()
  where id = p_invite and me in (from_id, to_id) and status in ('sent', 'half_locked')
  returning * into inv;
  if not found then raise exception 'This one is not open any more.'; end if;
  insert into events (actor_id, invite_id, type) values (me, inv.id, 'declined');
  return inv;
end $$;

create or replace function public.check_in(p_invite uuid)
returns public.invites language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv invites;
begin
  select * into inv from invites where id = p_invite and me in (from_id, to_id) for update;
  if not found or inv.status <> 'locked' then raise exception 'Nothing to check in to.'; end if;
  if now() < inv.starts_at - interval '10 minutes' or now() > inv.starts_at + interval '30 minutes' then
    raise exception 'Check-in is not open.';
  end if;
  if me = any (inv.check_ins) then return inv; end if;

  update invites set check_ins = array_append(check_ins, me) where id = inv.id returning * into inv;
  insert into events (actor_id, invite_id, type) values (me, inv.id, 'checked_in');
  if cardinality(inv.check_ins) >= 2 then
    update invites set status = 'kept', resolved_at = now() where id = inv.id returning * into inv;
    insert into events (actor_id, invite_id, type) values (inv.from_id, inv.id, 'kept'), (inv.to_id, inv.id, 'kept');
  end if;
  return inv;
end $$;

create or replace function public.bail(p_invite uuid)
returns public.invites language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv invites;
begin
  update invites set status = 'flaked', flaked_by = me, resolved_at = now()
  where id = p_invite and me in (from_id, to_id) and status = 'locked'
  returning * into inv;
  if not found then raise exception 'Only a locked plan can be bailed on.'; end if;
  insert into events (actor_id, invite_id, type, props)
  values (me, inv.id, 'bailed', jsonb_build_object('late', now() > inv.starts_at - interval '2 hours'));
  return inv;
end $$;

-- The clock. The next migration schedules it every minute with pg_cron.
create or replace function public.sweep_invites()
returns int language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  inv invites;
  missing uuid[];
begin
  for inv in
    update invites set status = 'expired', resolved_at = now()
    where status in ('sent', 'half_locked') and now() >= expires_at
    returning *
  loop
    insert into events (invite_id, type) values (inv.id, 'expired');
    n := n + 1;
  end loop;

  for inv in
    select * from invites where status = 'locked' and now() > starts_at + interval '30 minutes' for update skip locked
  loop
    missing := array(select u from unnest(array[inv.from_id, inv.to_id]) u where u <> all (inv.check_ins));
    update invites set status = 'flaked', resolved_at = now(),
           flaked_by = case when cardinality(missing) = 1 then missing[1] end
    where id = inv.id;
    insert into events (actor_id, invite_id, type) select u, inv.id, 'no_show' from unnest(missing) u;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.sweep_invites() from public, anon, authenticated;
revoke all on function public.log_event(text, jsonb), public.send_invite(uuid, text, timestamptz, text, text),
  public.offer_pinky(uuid), public.decline_invite(uuid), public.check_in(uuid), public.bail(uuid) from public, anon;
grant execute on function public.log_event(text, jsonb), public.send_invite(uuid, text, timestamptz, text, text),
  public.offer_pinky(uuid), public.decline_invite(uuid), public.check_in(uuid), public.bail(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Realtime: the lock screen and the countdown listen to invite changes (RLS applies to the feed).
-- ---------------------------------------------------------------------------------------------

alter table public.invites replica identity full;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.invites, public.trust_scores;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Analytics: a separate role and schema for the DuckDB worker. It reads the log and the invites,
-- and writes only trust_scores and its own analytics.* tables. Give it a password to use it:
--   alter role pinkilock_analytics login password '...';
-- ---------------------------------------------------------------------------------------------

create schema if not exists analytics;

create table analytics.metrics_daily (
  day date primary key,
  asks_sent int not null,
  first_pinkies int not null,
  locks int not null,
  kept int not null,
  flaked int not null,
  declined int not null,
  expired int not null,
  ask_to_lock_rate numeric,
  lock_to_kept_rate numeric,
  median_minutes_to_lock numeric,
  computed_at timestamptz not null default now()
);

create table analytics.retention_weekly (
  cohort_week date not null,
  week_n int not null,
  cohort_size int not null,
  active int not null,
  rate numeric not null,
  computed_at timestamptz not null default now(),
  primary key (cohort_week, week_n)
);

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'pinkilock_analytics') then
    create role pinkilock_analytics nologin bypassrls;
  end if;
end $$;

grant usage on schema public, analytics to pinkilock_analytics;
grant select on public.events, public.invites, public.profiles to pinkilock_analytics;
grant select, insert, update, delete on public.trust_scores to pinkilock_analytics;
grant select, insert, update, delete on all tables in schema analytics to pinkilock_analytics;

-- ---------------------------------------------------------------------------------------------
-- The catalogue (same rows as src/domain/ideas.ts)
-- ---------------------------------------------------------------------------------------------

insert into public.ideas (id, title, emoji, minutes, kind, blurb) values
  ('video_coffee', '10-min video coffee', '☕', 10, 'video', 'Cameras on, one cup, hard stop at ten.'),
  ('boba_run', 'Boba run', '🧋', 25, 'irl', 'Order, walk one block, done.'),
  ('coop_game', 'Co-op mobile game', '🎮', 20, 'game', 'Two rounds, same team, voice on.'),
  ('chai_walk', 'Chai and a walk', '🍵', 20, 'irl', 'Cutting chai, one lap of the block.'),
  ('playlist_swap', 'Playlist swap', '🎧', 15, 'video', 'Three songs each. Defend your picks.'),
  ('bookstore_lap', 'Bookstore lap', '📚', 30, 'irl', 'Pick a book for each other. No buying required.'),
  ('momo_stop', 'Momo stop', '🥟', 20, 'irl', 'One plate, split it, rate the chutney.'),
  ('sunset_spot', 'Sunset spot', '🌇', 30, 'irl', 'Show up for golden hour, leave when it is dark.'),
  ('meme_duel', 'Meme duel', '😂', 10, 'game', 'Five memes each. Loser plans the real date.'),
  ('bad_portraits', 'Draw each other badly', '✏️', 10, 'video', 'Sixty seconds, wrong hand, reveal together.'),
  ('ice_cream_lap', 'Ice cream lap', '🍦', 20, 'irl', 'One scoop, one lap, swap a bite.'),
  ('word_race', 'Word puzzle race', '🔤', 10, 'game', 'Same puzzle, same time, first to solve wins.');
