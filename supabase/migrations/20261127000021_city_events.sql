-- City events (D121): things on in a city this week or next (a food festival, a flea market, a
-- free concert, a festival night), written by the team, shown on Plans beside the week's ideas so a
-- match has a reason to make the next plan. The same idea as the venue list: a team-written
-- catalogue, read by the app, never written by it.
--
--   * A row is added by the team in SQL (OPERATIONS.md, "City events"), never by a client. Nothing is
--     seeded here: an event is only listed once someone has checked it is real.
--   * An event can point at a venue (from the venue list) and at an idea from the catalogue, so
--     "Plan it" opens an ordinary ask with that idea and place picked. Its title and place stay in the
--     table (like venues), in the words of the city.
--   * To take one down, set `active` to false; never delete a row (an old ask may have been planned
--     around it).

create table public.city_events (
  id text primary key check (id ~ '^[a-z0-9_]{3,40}$'),
  city text not null check (char_length(city) between 2 and 40),
  title text not null check (char_length(title) between 3 and 60),
  emoji text not null default '✨' check (char_length(emoji) between 1 and 8),
  -- Where, in a few words, when there is no venue on the list for it.
  place text check (char_length(place) between 2 and 60),
  venue_id text references public.venues (id),
  idea_id text references public.ideas (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- An https link to the organiser's page, if there is one.
  url text check (url ~ '^https://[^\s]{4,200}$'),
  free boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '31 days'),
  check (place is not null or venue_id is not null)
);
create index city_events_city_idx on public.city_events (city, ends_at) where active;

alter table public.city_events enable row level security;
revoke all on public.city_events from anon, authenticated, service_role;

-- What is on in my city from now to 14 days ahead, soonest first: at most 12.
create or replace function public.city_events()
returns table (id text, title text, emoji text, place text, venue_id text, idea_id text, starts_at timestamptz, ends_at timestamptz, url text, free boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  my_city text;
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  select p.city into my_city from profiles p where p.id = me;
  if not found then raise exception using errcode = 'PL002', message = 'Finish setting up first.'; end if;
  return query
    select e.id, e.title, e.emoji, coalesce(e.place, v.name || ', ' || v.area), e.venue_id, e.idea_id, e.starts_at, e.ends_at, e.url, e.free
    from city_events e left join venues v on v.id = e.venue_id and v.active
    where e.active and e.city = my_city and e.ends_at > now() and e.starts_at < now() + interval '14 days'
    order by e.starts_at, e.id
    limit 12;
end $$;
revoke all on function public.city_events() from public, anon;
grant execute on function public.city_events() to authenticated;
