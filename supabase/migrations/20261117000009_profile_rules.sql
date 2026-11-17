-- Profile and ask rules on the server (docs/build-plan.md, WP1, first part: gaps G1, G2, G3, G21).
--
--   * Profiles are written only through save_profile(). The insert and update rights on
--     `profiles` and `profile_private` are taken back, so a modified app can no longer set
--     photo_count, palette, glyph, city, created_at or the photos field, or skip a rule.
--   * Tags come from a catalogue (`vibes`, the same list as src/domain/ideas.ts), three at most.
--     Ideas must exist in `ideas`, three to six.
--   * A name is one word of letters, 2 to 16. Area 40, pronouns 20, tagline 80, place 60.
--   * private.looks_like_contact(): a handle, a link, a phone number, an app name or "add me"
--     in a profile line, an area, pronouns, or an ask's note or place is refused. It stops the
--     plain cases; an invented code still gets through until lines are reviewed (WP1, later).
--
-- The same rules and codes are in src/domain/profile.ts; one table of lines is run through both.

-- ---------------------------------------------------------------------------------------------
-- The tag catalogue (same rows as VIBE_GROUPS in src/domain/ideas.ts)
-- ---------------------------------------------------------------------------------------------

create table public.vibes (label text primary key check (char_length(label) between 2 and 32));
alter table public.vibes enable row level security;
create policy vibes_read on public.vibes for select to authenticated using (true);
revoke all on public.vibes from anon, authenticated;
grant select on public.vibes to authenticated;

insert into public.vibes (label) values
  ('night owl'), ('early bird'), ('overthinker'), ('homebody'),
  ('chronically online'), ('main character'), ('golden retriever energy'), ('black cat energy'),
  ('side quest enjoyer'), ('yapper'), ('good listener'), ('always early'),
  ('delulu but punctual'), ('chaotic good'), ('soft life'), ('certified menace'),
  ('unbothered'), ('touch grass advocate'), ('gym rat'), ('foodie'),
  ('film nerd'), ('thrifter'), ('dog person'), ('cat person'),
  ('gamer'), ('bookworm'), ('plant parent'), ('chai over coffee'),
  ('concert goer'), ('meme dealer'), ('anime watcher'), ('k-drama binger'),
  ('sunset chaser'), ('street food hunter'), ('late night drives'), ('karaoke menace'),
  ('wild one'), ('bold moves only'), ('says it first'), ('dare taker'),
  ('spontaneous'), ('no filter'), ('loud laugh'), ('bad influence'),
  ('adrenaline junkie'), ('rule bender'), ('life of the party'), ('zero chill'),
  ('shameless flirt'), ('smooth talker'), ('a little naughty'), ('tease'),
  ('rizz on demand'), ('eye contact enjoyer'), ('slow burn'), ('trouble, the fun kind'),
  ('playful'), ('hard to get'), ('blushes easily'), ('hopeless romantic'),
  ('lover era'), ('will steal your hoodie'), ('old school'), ('old soul'),
  ('gentleman'), ('chivalry is not dead'), ('calls, not texts'), ('handwritten notes'),
  ('flowers on the first date'), ('retro bollywood'), ('ghazals and chai'), ('vinyl and film cameras'),
  ('slow dancer'), ('opens doors')
on conflict (label) do nothing;

-- ---------------------------------------------------------------------------------------------
-- Does this line look like a way to reach someone outside the app?
-- The five patterns are the same as CONTACT_PATTERNS in src/domain/profile.ts.
-- ---------------------------------------------------------------------------------------------

create or replace function private.looks_like_contact(p_text text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
       lower(p_text) ~ '@'
    or lower(p_text) ~ '(https?://|www\.|[a-z0-9-]+\.(com|in|me|io|co|net|org|app|ly|gg|link)([^a-z]|$))'
    or lower(p_text) ~ '[0-9]([ .()-]*[0-9]){4,}'
    or lower(p_text) ~ '(^|[^a-z])(instagram|insta|snapchat|whatsapp|telegram|discord|facebook|tiktok|twitter|wechat|kakao|linkedin|ig|add me|find me on|dm me|text me|call me|ping me|hit me up|my number|my handle|my id|decode)([^a-z]|$)'
    or lower(p_text) ~ '(^|[^a-z])(zero|one|two|three|four|five|six|seven|eight|nine)([^a-z]+(zero|one|two|three|four|five|six|seven|eight|nine)){3,}([^a-z]|$)',
    false)
$$;
revoke all on function private.looks_like_contact(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Existing rows: bring them inside the new limits, then pin the limits on the table.
-- ---------------------------------------------------------------------------------------------

update public.profiles set
  area = left(area, 40),
  pronouns = left(pronouns, 20),
  city = left(city, 40),
  vibes = coalesce((select array_agg(v order by ord) from (
            select v, ord from unnest(vibes) with ordinality u(v, ord)
            where v in (select label from public.vibes) order by ord limit 3) kept), '{}'),
  idea_ids = coalesce((select array_agg(i order by ord) from (
            select i, ord from unnest(idea_ids) with ordinality u(i, ord)
            where i in (select id from public.ideas) order by ord limit 6) kept), '{}');
update public.invites set place = left(place, 60) where char_length(place) > 60;
update public.profile_private set photos = '[]' where pg_column_size(photos) > 8192;

alter table public.profiles
  add constraint profiles_area_len check (char_length(area) <= 40),
  add constraint profiles_pronouns_len check (char_length(pronouns) <= 20),
  add constraint profiles_city_len check (char_length(city) <= 40),
  add constraint profiles_vibes_max check (cardinality(vibes) <= 3),
  add constraint profiles_ideas_max check (cardinality(idea_ids) <= 6);
alter table public.invites add constraint invites_place_len check (char_length(place) <= 60);
alter table public.profile_private add constraint profile_private_photos_size check (pg_column_size(photos) <= 8192);

-- ---------------------------------------------------------------------------------------------
-- The one way to write a profile
-- ---------------------------------------------------------------------------------------------

revoke insert, update on public.profiles, public.profile_private from authenticated;
drop policy profiles_insert_own on public.profiles;
drop policy profiles_update_own on public.profiles;
drop policy private_own on public.profile_private;
create policy private_own on public.profile_private for select to authenticated using (profile_id = auth.uid());

-- Creates my profile, or replaces what is on it. The contact is needed the first time and is
-- left as it is when both contact arguments are null. Everything else on the row (portrait
-- colours, photo count, city, join date) is the server's.
create or replace function public.save_profile(
  p_name text, p_age int, p_area text, p_pronouns text, p_tagline text, p_vibes text[], p_idea_ids text[],
  p_contact_kind text default null, p_contact_handle text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_area text := btrim(coalesce(p_area, ''));
  v_pronouns text := btrim(coalesce(p_pronouns, ''));
  v_tagline text := btrim(coalesce(p_tagline, ''));
  v_vibes text[] := coalesce(p_vibes, '{}');
  v_ideas text[] := coalesce(p_idea_ids, '{}');
  v_handle text := btrim(coalesce(p_contact_handle, ''));
  palettes text[] := array['#FF2E93,#5B0F3A', '#A9D8F7,#4169E1', '#D7FF3E,#2F4A00', '#FF5A36,#5A1400', '#9AA0FF,#151845', '#FFD12E,#3F3000', '#FF2ED1,#3A0A45', '#2EE6C5,#06403A'];
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if char_length(v_name) not between 2 and 16 or v_name ~ '[[:digit:][:space:][:punct:]]' then
    raise exception using errcode = 'PL060', message = 'Use your first name: letters only, 2 to 16.';
  end if;
  if p_age is null or p_age not between 18 and 99 then
    raise exception using errcode = 'PL061', message = 'You need to be 18 or older.';
  end if;
  if cardinality(v_vibes) > 3 or cardinality(v_vibes) <> (select count(distinct v) from unnest(v_vibes) v)
     or exists (select 1 from unnest(v_vibes) v where v not in (select label from vibes)) then
    raise exception using errcode = 'PL062', message = 'Pick up to three tags from the list.';
  end if;
  if cardinality(v_ideas) not between 3 and 6 or cardinality(v_ideas) <> (select count(distinct i) from unnest(v_ideas) i)
     or exists (select 1 from unnest(v_ideas) i where i not in (select id from ideas)) then
    raise exception using errcode = 'PL063', message = 'Pick three to six things you are up for.';
  end if;
  if char_length(v_area) > 40 or char_length(v_pronouns) > 20 or char_length(v_tagline) > 80 then
    raise exception using errcode = 'PL064', message = 'That is too long.';
  end if;
  if private.looks_like_contact(v_tagline) or private.looks_like_contact(v_area) or private.looks_like_contact(v_pronouns) then
    raise exception using errcode = 'PL065', message = 'Contacts unlock after a kept promise. Take that out.';
  end if;
  if p_contact_kind is not null or p_contact_handle is not null then
    if p_contact_kind is null or p_contact_kind not in ('Instagram', 'Snapchat', 'WhatsApp') or char_length(v_handle) not between 2 and 40 then
      raise exception using errcode = 'PL066', message = 'Add how people reach you after a kept promise.';
    end if;
  elsif not exists (select 1 from profile_private where profile_id = me) then
    raise exception using errcode = 'PL066', message = 'Add how people reach you after a kept promise.';
  end if;

  insert into profiles (id, name, age, area, pronouns, tagline, vibes, idea_ids, palette)
  values (me, v_name, p_age, v_area, v_pronouns, v_tagline, v_vibes, v_ideas,
          string_to_array(palettes[1 + abs(hashtext(me::text)) % cardinality(palettes)], ','))
  on conflict (id) do update set name = excluded.name, age = excluded.age, area = excluded.area, pronouns = excluded.pronouns,
    tagline = excluded.tagline, vibes = excluded.vibes, idea_ids = excluded.idea_ids;

  if p_contact_kind is not null then
    insert into profile_private (profile_id, contact_kind, contact_handle) values (me, p_contact_kind, v_handle)
    on conflict (profile_id) do update set contact_kind = excluded.contact_kind, contact_handle = excluded.contact_handle;
  end if;
end $$;
revoke all on function public.save_profile(text, int, text, text, text, text[], text[], text, text) from public, anon;
grant execute on function public.save_profile(text, int, text, text, text, text[], text[], text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- An ask's note and place: no contacts, and a place of 60 characters at most.
-- (send_invite as the earlier migrations left it, with the two checks added.)
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.send_invite(p_to uuid, p_idea text, p_starts_at timestamp with time zone, p_place text, p_note text)
 RETURNS invites
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  mins int;
  inv invites;
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if p_to = me then raise exception using errcode = 'PL020', message = 'You cannot ask yourself.'; end if;
  if private.blocked_pair(me, p_to) then raise exception using errcode = 'PL004', message = 'That person is not available.'; end if;
  if p_starts_at <= now() then raise exception using errcode = 'PL021', message = 'Pick a time that has not passed.'; end if;
  select minutes into mins from ideas where id = p_idea;
  if not found then raise exception using errcode = 'PL022', message = 'Unknown idea.'; end if;
  if char_length(btrim(coalesce(p_place, ''))) > 60 then raise exception using errcode = 'PL064', message = 'That is too long.'; end if;
  if private.looks_like_contact(p_note) or private.looks_like_contact(p_place) then
    raise exception using errcode = 'PL065', message = 'Contacts unlock after a kept promise. Take that out.';
  end if;
  if (select count(*) from invites where from_id = me and status in ('sent', 'half_locked')) >= 3 then
    raise exception using errcode = 'PL023', message = 'You have 3 asks open. Wait for an answer first.';
  end if;
  begin
    insert into invites (from_id, to_id, idea_id, starts_at, minutes, place, note, expires_at)
    values (me, p_to, p_idea, p_starts_at, mins, btrim(coalesce(p_place, '')), left(btrim(coalesce(p_note, '')), 80),
            least(now() + interval '24 hours', p_starts_at))
    returning * into inv;
  exception when unique_violation then
    raise exception using errcode = 'PL024', message = 'You two already have something open.';
  end;
  insert into events (actor_id, invite_id, type, props) values (me, inv.id, 'ask_sent', jsonb_build_object('idea', p_idea));
  return inv;
end $function$;
