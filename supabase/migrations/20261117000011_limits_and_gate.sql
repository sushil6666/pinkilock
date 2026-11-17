-- Limits and the link gate (docs/build-plan.md, WP2; gaps G4 and G6).
--
--   * private.config: switches the server reads. `require_linked` is the link gate: when it is
--     'true', sending an ask and putting a pinky out need an account with an email or phone linked.
--     It is off until sign-in codes can be sent (no mail sender or SMS provider means nobody could
--     link); the deploy workflow switches it on when one exists (scripts/gate-config.sh).
--   * Limits: 10 asks a day; one ask to the same person per 7 days after a pass or an expiry;
--     200 passes a day; 20 profile saves a day; 1 kB of props on an app_open event.
--   * private.actions: a short-lived log of counted actions (passes, profile saves), kept 2 days.
--
-- The limits are mirrored in src/domain/invites.ts (ASK_LIMITS) and the mock.

create table private.config (key text primary key, value text not null);
revoke all on private.config from public, anon, authenticated;
insert into private.config (key, value) values ('require_linked', 'false') on conflict (key) do nothing;

create or replace function private.set_config(p_key text, p_value text)
returns void language sql security definer set search_path = '' as $$
  insert into private.config (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;
$$;
revoke all on function private.set_config(text, text) from public, anon, authenticated;

create or replace function private.config_on(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select value = 'true' from private.config where key = p_key), false);
$$;
revoke all on function private.config_on(text) from public, anon, authenticated;

-- Linked: the account has an email or a phone, so it can be got back and costs something to make.
create or replace function private.is_linked(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u where u.id = p_user and not coalesce(u.is_anonymous, false));
$$;
revoke all on function private.is_linked(uuid) from public, anon, authenticated;

create or replace function private.require_linked(p_user uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if private.config_on('require_linked') and not private.is_linked(p_user) then
    raise exception using errcode = 'PL068', message = 'Add your email or phone number first. It keeps your record yours.';
  end if;
end $$;
revoke all on function private.require_linked(uuid) from public, anon, authenticated;

create table private.actions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('pass', 'save_profile')),
  at timestamptz not null default now()
);
create index actions_user_kind_at_idx on private.actions (user_id, kind, at);
revoke all on private.actions from public, anon, authenticated;

select cron.schedule('pinkilock-actions-retention', '23 3 * * *', $$delete from private.actions where at < now() - interval '2 days'$$);

-- Passes are written by the app directly (RLS: only my own); the count is kept by a trigger.
create or replace function private.count_pass()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from private.actions where user_id = new.profile_id and kind = 'pass' and at > now() - interval '1 day') >= 200 then
    raise exception using errcode = 'PL028', message = 'You have passed on a lot of people today. Try again tomorrow.';
  end if;
  insert into private.actions (user_id, kind) values (new.profile_id, 'pass');
  return new;
end $$;
revoke all on function private.count_pass() from public, anon, authenticated;
create trigger passes_count before insert on public.passes for each row execute function private.count_pass();

-- The functions as earlier migrations left them, with the gate and the limits added.

CREATE OR REPLACE FUNCTION public.send_invite(p_to uuid, p_idea text, p_starts_at timestamp with time zone, p_place text, p_note text, p_venue text DEFAULT NULL::text)
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
  perform private.require_linked(me);
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
  -- Daily limits (docs/build-plan.md, WP2): 10 asks a day, and one ask to the same person per
  -- 7 days after they passed or let it expire (taking back my own ask does not count).
  if (select count(*) from invites where from_id = me and created_at > now() - interval '1 day') >= 10 then
    raise exception using errcode = 'PL025', message = 'You have sent a lot of asks today. Try again tomorrow.';
  end if;
  if exists (select 1 from invites where from_id = me and to_id = p_to
             and (status = 'expired' or (status = 'declined' and declined_by = p_to))
             and coalesce(resolved_at, created_at) > now() - interval '7 days') then
    raise exception using errcode = 'PL026', message = 'You asked them recently. Give it a few days.';
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

CREATE OR REPLACE FUNCTION public.offer_pinky(p_invite uuid)
 RETURNS invites
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  inv invites;
begin
  perform private.require_linked(me);
  select * into inv from invites where id = p_invite and me in (from_id, to_id) for update;
  if not found then raise exception using errcode = 'PL030', message = 'That invite is gone.'; end if;
  if inv.status in ('sent', 'half_locked') and now() >= inv.expires_at then raise exception using errcode = 'PL031', message = 'This one expired.'; end if;

  if inv.status = 'sent' then
    if me <> inv.to_id then raise exception using errcode = 'PL032', message = 'The person you asked goes first.'; end if;
    update invites set status = 'half_locked', first_pinky_by = me where id = inv.id returning * into inv;
    insert into events (actor_id, invite_id, type) values (me, inv.id, 'pinky_out');
  elsif inv.status = 'half_locked' then
    if inv.first_pinky_by = me then return inv; end if;
    update invites set status = 'locked', locked_at = now() where id = inv.id returning * into inv;
    insert into events (actor_id, invite_id, type) values (me, inv.id, 'pinky_out'), (me, inv.id, 'locked');
  else
    raise exception using errcode = 'PL033', message = 'This one is not open any more.';
  end if;
  return inv;
end $function$;

CREATE OR REPLACE FUNCTION public.log_event(p_type text, p_props jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if p_type <> 'app_open' then raise exception using errcode = 'PL040', message = 'Only app_open can be logged from the app.'; end if;
  if octet_length(coalesce(p_props, '{}')::text) > 1024 then
    raise exception using errcode = 'PL041', message = 'That event is too big.';
  end if;
  insert into events (actor_id, type, props) values (auth.uid(), p_type, coalesce(p_props, '{}'));
end $function$;

CREATE OR REPLACE FUNCTION public.save_profile(p_name text, p_age integer, p_area text, p_pronouns text, p_tagline text, p_vibes text[], p_idea_ids text[], p_contact_kind text DEFAULT NULL::text, p_contact_handle text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if (select count(*) from private.actions where user_id = me and kind = 'save_profile' and at > now() - interval '1 day') >= 20 then
    raise exception using errcode = 'PL027', message = 'You have changed your profile a lot today. Try again tomorrow.';
  end if;
  insert into private.actions (user_id, kind) values (me, 'save_profile');
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
end $function$;
