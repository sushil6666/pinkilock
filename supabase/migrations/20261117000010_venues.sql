-- Suggested places to meet (docs/build-plan.md, product features): a catalogue of well-known,
-- public, busy spots. An in-person ask can name a venue instead of typing a place; the server then
-- writes the place itself, so nothing can be smuggled into it. Typing a place still works for
-- somewhere not on the list, and still goes through the contact check.
--
-- The same rows are VENUES in src/domain/venues.ts; a new venue is a row in both (a new migration).

create table public.venues (
  id text primary key,
  city text not null check (char_length(city) between 2 and 40),
  area text not null check (char_length(area) between 2 and 40),
  name text not null check (char_length(name) between 2 and 48),
  kind text not null check (kind in ('promenade', 'park', 'mall', 'market', 'landmark')),
  -- A venue that should no longer be offered is switched off, never deleted: old invites name it.
  active boolean not null default true,
  check (char_length(name) + char_length(area) + 2 <= 60)
);
create index venues_city_idx on public.venues (city) where active;

alter table public.venues enable row level security;
create policy venues_read on public.venues for select to authenticated using (true);
revoke all on public.venues from anon, authenticated;
grant select on public.venues to authenticated;

insert into public.venues (id, city, area, name, kind) values
  ('mum_carter_road', 'Mumbai', 'Bandra West', 'Carter Road Promenade', 'promenade'),
  ('mum_bandstand', 'Mumbai', 'Bandra West', 'Bandstand Promenade', 'promenade'),
  ('mum_linking_road', 'Mumbai', 'Bandra West', 'Linking Road', 'market'),
  ('mum_hill_road', 'Mumbai', 'Bandra West', 'Hill Road', 'market'),
  ('mum_jio_world_drive', 'Mumbai', 'Bandra East', 'Jio World Drive', 'mall'),
  ('mum_juhu_beach', 'Mumbai', 'Juhu', 'Juhu Beach', 'promenade'),
  ('mum_prithvi', 'Mumbai', 'Juhu', 'Prithvi Theatre', 'landmark'),
  ('mum_versova_beach', 'Mumbai', 'Andheri West', 'Versova Beach', 'promenade'),
  ('mum_lokhandwala', 'Mumbai', 'Andheri West', 'Lokhandwala Market', 'market'),
  ('mum_infiniti_andheri', 'Mumbai', 'Andheri West', 'Infiniti Mall', 'mall'),
  ('mum_palladium', 'Mumbai', 'Lower Parel', 'Phoenix Palladium', 'mall'),
  ('mum_worli_sea_face', 'Mumbai', 'Worli', 'Worli Sea Face', 'promenade'),
  ('mum_shivaji_park', 'Mumbai', 'Dadar', 'Shivaji Park', 'park'),
  ('mum_five_gardens', 'Mumbai', 'Matunga', 'Five Gardens', 'park'),
  ('mum_marine_drive', 'Mumbai', 'Marine Lines', 'Marine Drive Promenade', 'promenade'),
  ('mum_kala_ghoda', 'Mumbai', 'Fort', 'Kala Ghoda', 'landmark'),
  ('mum_gateway', 'Mumbai', 'Colaba', 'Gateway of India', 'landmark'),
  ('mum_colaba_causeway', 'Mumbai', 'Colaba', 'Colaba Causeway', 'market'),
  ('mum_powai_lake', 'Mumbai', 'Powai', 'Powai Lake Promenade', 'promenade'),
  ('mum_r_city', 'Mumbai', 'Ghatkopar', 'R City Mall', 'mall'),
  ('mum_diamond_garden', 'Mumbai', 'Chembur', 'Diamond Garden', 'park'),
  ('mum_inorbit_malad', 'Mumbai', 'Malad', 'Inorbit Mall', 'mall'),
  ('mum_oberoi_mall', 'Mumbai', 'Goregaon', 'Oberoi Mall', 'mall'),
  ('mum_national_park', 'Mumbai', 'Borivali', 'Sanjay Gandhi National Park, main gate', 'park')
on conflict (id) do nothing;

-- Which venue an ask named, if it named one. `place` still holds the words shown to both people.
alter table public.invites add column venue_id text references public.venues (id);

-- send_invite gains an optional venue. The old five-argument form is dropped so that there is one
-- function; a call that names only the first five arguments (an app built before this) still works.
drop function public.send_invite(uuid, text, timestamptz, text, text);

CREATE OR REPLACE FUNCTION public.send_invite(p_to uuid, p_idea text, p_starts_at timestamp with time zone, p_place text, p_note text, p_venue text DEFAULT NULL)
 RETURNS invites
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  mins int;
  inv invites;
  v_place text := btrim(coalesce(p_place, ''));
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if p_to = me then raise exception using errcode = 'PL020', message = 'You cannot ask yourself.'; end if;
  if private.blocked_pair(me, p_to) then raise exception using errcode = 'PL004', message = 'That person is not available.'; end if;
  if p_starts_at <= now() then raise exception using errcode = 'PL021', message = 'Pick a time that has not passed.'; end if;
  select minutes into mins from ideas where id = p_idea;
  if not found then raise exception using errcode = 'PL022', message = 'Unknown idea.'; end if;
  -- A picked venue: the server writes the place from the catalogue, and what the app typed is ignored.
  if p_venue is not null then
    select name || ', ' || area into v_place from venues
    where id = p_venue and active and (select kind from ideas where id = p_idea) = 'irl';
    if not found then raise exception using errcode = 'PL067', message = 'Pick a meeting place from the list.'; end if;
  end if;
  if char_length(v_place) > 60 then raise exception using errcode = 'PL064', message = 'That is too long.'; end if;
  if private.looks_like_contact(p_note) or (p_venue is null and private.looks_like_contact(v_place)) then
    raise exception using errcode = 'PL065', message = 'Contacts unlock after a kept promise. Take that out.';
  end if;
  if (select count(*) from invites where from_id = me and status in ('sent', 'half_locked')) >= 3 then
    raise exception using errcode = 'PL023', message = 'You have 3 asks open. Wait for an answer first.';
  end if;
  begin
    insert into invites (from_id, to_id, idea_id, starts_at, minutes, place, venue_id, note, expires_at)
    values (me, p_to, p_idea, p_starts_at, mins, v_place, p_venue, left(btrim(coalesce(p_note, '')), 80),
            least(now() + interval '24 hours', p_starts_at))
    returning * into inv;
  exception when unique_violation then
    raise exception using errcode = 'PL024', message = 'You two already have something open.';
  end;
  insert into events (actor_id, invite_id, type, props) values (me, inv.id, 'ask_sent', jsonb_strip_nulls(jsonb_build_object('idea', p_idea, 'venue', p_venue)));
  return inv;
end $function$;

revoke all on function public.send_invite(uuid, text, timestamptz, text, text, text) from public, anon;
grant execute on function public.send_invite(uuid, text, timestamptz, text, text, text) to authenticated;
