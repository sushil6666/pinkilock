-- Privacy and regulation, built once for every region (docs/build-plan.md, WP8; gaps G16, G17), with
-- the country and city parts of WP9 they need.
--
--   * countries and cities: an allow-list. A profile's city must be open, in an open country;
--     only India and Mumbai are open now (decision O06). The network's country, when the request
--     carries one (`cf-ipcountry` on the hosted project), must be open for a first profile.
--   * consents: 18+, terms, privacy policy, and explicit consent to process dating preferences
--     (which can reveal sexual orientation), each with a version and a time. A first profile needs
--     all four at the current versions (private.config legal_version).
--   * privacy_requests: questions about my data, my Trust Score, a correction, or an appeal
--     against a moderation action. Five a day. my_moderation() shows what was done to me and why.
--   * Retention, daily: a finished invite's place and line are cleared after 90 days, pushes are
--     deleted after 30, an account that never finished setting up after 30. Deleting long-inactive
--     accounts is off until private.config retention_inactive_months is set.
--   * export_my_data now includes consents, ratings, requests, error reports and moderation.

create table public.countries (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name text not null,
  active boolean not null default false,
  emergency text not null,
  women_helpline text
);
create table public.cities (
  name text primary key,
  country text not null references public.countries (code),
  active boolean not null default false
);
alter table public.countries enable row level security;
alter table public.cities enable row level security;
create policy countries_read on public.countries for select to authenticated using (true);
create policy cities_read on public.cities for select to authenticated using (true);
revoke all on public.countries, public.cities from anon, authenticated;
grant select on public.countries, public.cities to authenticated;

insert into public.countries (code, name, active, emergency, women_helpline) values
  ('IN', 'India', true, '112', '181'),
  ('GB', 'United Kingdom', false, '999', null),
  ('US', 'United States', false, '911', null),
  ('IE', 'Ireland', false, '112', null),
  ('DE', 'Germany', false, '112', null),
  ('AU', 'Australia', false, '000', null),
  ('CA', 'Canada', false, '911', null),
  ('BR', 'Brazil', false, '190', '180')
on conflict (code) do nothing;
insert into public.cities (name, country, active) values
  ('Mumbai', 'IN', true), ('Pune', 'IN', false), ('Bengaluru', 'IN', false), ('Delhi', 'IN', false), ('Hyderabad', 'IN', false)
on conflict (name) do nothing;

alter table public.profiles add column country text not null default 'IN' references public.countries (code);
grant select (country) on public.profiles to authenticated;

create or replace function private.request_country()
returns text language plpgsql stable set search_path = '' as $$
declare
  c text;
begin
  c := upper(nullif(current_setting('request.headers', true), '')::json ->> 'cf-ipcountry');
  if c ~ '^[A-Z]{2}$' then return c; end if;
  return null;
exception when others then
  return null;
end $$;
revoke all on function private.request_country() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Consent
-- ---------------------------------------------------------------------------------------------

insert into private.config (key, value) values ('legal_version', '2026-11-17') on conflict (key) do nothing;

create table public.consents (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('adult', 'terms', 'privacy', 'sensitive')),
  version text not null,
  at timestamptz not null default now(),
  primary key (user_id, kind, version)
);
alter table public.consents enable row level security;
revoke all on public.consents from anon, authenticated, service_role;

create or replace function public.give_consents(p_kinds text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if p_kinds is null or exists (select 1 from unnest(p_kinds) k where k not in ('adult', 'terms', 'privacy', 'sensitive')) then
    raise exception using errcode = 'PL079', message = 'That is not something to agree to.';
  end if;
  insert into consents (user_id, kind, version)
  select me, k, private.config_text('legal_version') from unnest(p_kinds) k
  on conflict do nothing;
end $$;

create or replace function private.has_consents(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select count(distinct c.kind) from public.consents c
          where c.user_id = p_user and c.version = private.config_text('legal_version')) = 4;
$$;
revoke all on function private.has_consents(uuid) from public, anon, authenticated;

-- Which consents I have given at the current version (the app asks again when the terms change).
create or replace function public.my_consents()
returns table (kind text, version text, at timestamptz) language sql stable security definer set search_path = public as $$
  select c.kind, c.version, c.at from consents c where c.user_id = auth.uid() and c.version = private.config_text('legal_version');
$$;

-- ---------------------------------------------------------------------------------------------
-- Requests and appeals
-- ---------------------------------------------------------------------------------------------

create table public.privacy_requests (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('score_review', 'data_question', 'correction', 'appeal', 'other')),
  detail text not null check (char_length(detail) between 1 and 500),
  moderation_action_id bigint,
  at timestamptz not null default now(),
  handled_at timestamptz,
  outcome text check (char_length(outcome) <= 500)
);
alter table public.privacy_requests enable row level security;
revoke all on public.privacy_requests from anon, authenticated, service_role;

create or replace function public.file_privacy_request(p_kind text, p_detail text, p_action bigint default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if p_kind not in ('score_review', 'data_question', 'correction', 'appeal', 'other') then
    raise exception using errcode = 'PL080', message = 'Pick what the request is about.';
  end if;
  if char_length(btrim(coalesce(p_detail, ''))) not between 1 and 500 then
    raise exception using errcode = 'PL013', message = 'Keep it under 500 characters.';
  end if;
  if p_action is not null and not exists (select 1 from private.moderation_actions m where m.id = p_action and m.profile_id = me) then
    raise exception using errcode = 'PL081', message = 'That decision is not about you.';
  end if;
  if (select count(*) from privacy_requests where user_id = me and at > now() - interval '1 day') >= 5 then
    raise exception using errcode = 'PL082', message = 'You have sent a lot of requests today. We will answer the ones we have.';
  end if;
  insert into privacy_requests (user_id, kind, detail, moderation_action_id) values (me, p_kind, btrim(p_detail), p_action);
end $$;

-- What moderators did about my account, and why: the basis for an appeal.
create or replace function public.my_moderation()
returns table (id bigint, action text, reason text, at timestamptz) language sql stable security definer set search_path = public as $$
  select m.id, m.action, m.note, m.at from private.moderation_actions m where m.profile_id = auth.uid() order by m.at desc;
$$;

revoke all on function public.give_consents(text[]), public.my_consents(), public.file_privacy_request(text, text, bigint), public.my_moderation() from public, anon;
grant execute on function public.give_consents(text[]), public.my_consents(), public.file_privacy_request(text, text, bigint), public.my_moderation() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------------------------------

create or replace function private.retention()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  cleared int;
  pushes int;
  unfinished int;
  inactive int := 0;
  months int := nullif(private.config_text('retention_inactive_months'), '')::int;
begin
  update public.invites set place = '', note = ''
  where status not in ('sent', 'half_locked', 'locked') and resolved_at < now() - interval '90 days' and (place <> '' or note <> '');
  get diagnostics cleared = row_count;
  delete from public.notifications where created_at < now() - interval '30 days';
  get diagnostics pushes = row_count;
  -- Accounts that never finished setting up: nothing of theirs is anyone else's.
  delete from auth.users u where u.created_at < now() - interval '30 days' and not exists (select 1 from public.profiles p where p.id = u.id);
  get diagnostics unfinished = row_count;
  if months is not null then
    delete from auth.users u where u.created_at < now() - make_interval(months => months)
      and not exists (select 1 from public.events e where e.actor_id = u.id and e.at > now() - make_interval(months => months));
    get diagnostics inactive = row_count;
  end if;
  return jsonb_build_object('invites_cleared', cleared, 'pushes_deleted', pushes, 'unfinished_accounts_deleted', unfinished, 'inactive_accounts_deleted', inactive);
end $$;
revoke all on function private.retention() from public, anon, authenticated;
select cron.schedule('pinkilock-retention', '41 3 * * *', 'select private.retention()');

-- ---------------------------------------------------------------------------------------------
-- The functions as earlier migrations left them, with the above added.
-- ---------------------------------------------------------------------------------------------

drop function public.save_profile(text, int, text, text, text, text[], text[], text, text);

CREATE OR REPLACE FUNCTION public.save_profile(p_name text, p_age integer, p_area text, p_pronouns text, p_tagline text, p_vibes text[], p_idea_ids text[], p_contact_kind text DEFAULT NULL::text, p_contact_handle text DEFAULT NULL::text, p_city text DEFAULT NULL::text)
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
  v_city text;
  v_country text;
  v_vibes text[] := coalesce(p_vibes, '{}');
  v_ideas text[] := coalesce(p_idea_ids, '{}');
  v_handle text := btrim(coalesce(p_contact_handle, ''));
  cur profiles;
  seen_line text;
  line_changed boolean := false;
  line_shown text;
  palettes text[] := array['#FF2E93,#5B0F3A', '#A9D8F7,#4169E1', '#D7FF3E,#2F4A00', '#FF5A36,#5A1400', '#9AA0FF,#151845', '#FFD12E,#3F3000', '#FF2ED1,#3A0A45', '#2EE6C5,#06403A'];
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if (select count(*) from private.actions where user_id = me and kind = 'save_profile' and at > now() - interval '1 day') >= 20 then
    raise exception using errcode = 'PL027', message = 'You have changed your profile a lot today. Try again tomorrow.';
  end if;
  insert into private.actions (user_id, kind) values (me, 'save_profile');
  -- Where (WP8, WP9): the city must be open, in a country that is open. A first profile also needs
  -- the request to come from an open country (when the network says where it comes from) and the
  -- four consents at the current versions.
  v_city := coalesce(nullif(btrim(p_city), ''), (select city from profiles where id = me), 'Mumbai');
  select c.country into v_country from cities c join countries k on k.code = c.country where c.name = v_city and c.active and k.active;
  if not found then raise exception using errcode = 'PL076', message = 'Pinkilock is not open in that city yet.'; end if;
  if not exists (select 1 from profiles where id = me) then
    if private.request_country() is not null and not exists (select 1 from countries where code = private.request_country() and active) then
      raise exception using errcode = 'PL078', message = 'Pinkilock is not open in your country yet.';
    end if;
    if not private.has_consents(me) then
      raise exception using errcode = 'PL077', message = 'Agree to the terms, the privacy policy and the use of your dating preferences first.';
    end if;
  end if;
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

  -- Change limits (WP1): a name once in 30 days, the line once in 7 (the first ones are free). A
  -- suspended account changes nothing; a line removed by a moderator cannot be replaced for 30 days.
  select * into cur from profiles where id = me;
  seen_line := coalesce((select r.text from private.line_reviews r where r.profile_id = me and r.status in ('pending', 'held')), cur.tagline, '');
  line_changed := cur.id is not null and v_tagline <> seen_line;
  if cur.id is not null then
    if cur.suspended_at is not null then
      raise exception using errcode = 'PL072', message = 'This account is paused while we look at a report.';
    end if;
    if v_name <> cur.name and cur.name_changed_at > now() - interval '30 days' then
      raise exception using errcode = 'PL070', message = 'You changed your name recently. You can change it again 30 days after.';
    end if;
    if line_changed and v_tagline <> '' and cur.tagline_locked_until > now() then
      raise exception using errcode = 'PL073', message = 'Your line was removed after a report. You can add one again later.';
    end if;
    if line_changed and cur.tagline_changed_at > now() - interval '7 days' then
      raise exception using errcode = 'PL071', message = 'You changed your line this week. You can change it again 7 days after.';
    end if;
  end if;

  -- The line others see. With review on, a new line waits in private.line_reviews and the card
  -- keeps the last approved one (none for a new profile). Removing the line needs no review.
  line_shown := coalesce(cur.tagline, '');
  if cur.id is null or line_changed then
    delete from private.line_reviews where profile_id = me and status in ('pending', 'held');
    if v_tagline = '' or coalesce(private.config_text('line_review'), 'off') not in ('human', 'ai') then
      line_shown := v_tagline;
    else
      insert into private.line_reviews (profile_id, text) values (me, v_tagline)
      on conflict (profile_id) do update set text = excluded.text, status = 'pending', reason = null, created_at = now(),
        decided_at = null, decided_by = null, claimed_at = null, attempts = 0;
    end if;
  end if;

  insert into profiles (id, name, age, area, pronouns, tagline, vibes, idea_ids, palette, city, country)
  values (me, v_name, p_age, v_area, v_pronouns, line_shown, v_vibes, v_ideas,
          string_to_array(palettes[1 + abs(hashtext(me::text)) % cardinality(palettes)], ','), v_city, v_country)
  on conflict (id) do update set name = excluded.name, age = excluded.age, area = excluded.area, pronouns = excluded.pronouns,
    city = excluded.city, country = excluded.country,
    tagline = excluded.tagline, vibes = excluded.vibes, idea_ids = excluded.idea_ids,
    name_changed_at = case when excluded.name <> profiles.name then now() else profiles.name_changed_at end,
    tagline_changed_at = case when line_changed then now() else profiles.tagline_changed_at end;

  if p_contact_kind is not null then
    insert into profile_private (profile_id, contact_kind, contact_handle) values (me, p_contact_kind, v_handle)
    on conflict (profile_id) do update set contact_kind = excluded.contact_kind, contact_handle = excluded.contact_handle;
  end if;
end $function$;

revoke all on function public.save_profile(text, int, text, text, text, text[], text[], text, text, text) from public, anon;
grant execute on function public.save_profile(text, int, text, text, text, text[], text[], text, text, text) to authenticated;

CREATE OR REPLACE FUNCTION public.export_my_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  return jsonb_build_object(
    'format', 'pinkilock-export-2',
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'phone', u.phone, 'email', nullif(u.email, ''), 'created_at', u.created_at, 'is_anonymous', u.is_anonymous)
                from auth.users u where u.id = me),
    'profile', (select to_jsonb(p) from profiles p where p.id = me),
    'contact', (select jsonb_build_object('kind', c.contact_kind, 'handle', c.contact_handle, 'photos', c.photos)
                from profile_private c where c.profile_id = me),
    'trust_score', (select to_jsonb(t) - 'profile_id' from trust_scores t where t.profile_id = me),
    -- The other person appears by id only: their card is theirs.
    'invites', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', i.id, 'role', case when i.from_id = me then 'asked' else 'was_asked' end,
                  'other_person', case when i.from_id = me then i.to_id else i.from_id end,
                  'idea', i.idea_id, 'starts_at', i.starts_at, 'place', i.place, 'note', i.note, 'status', i.status,
                  'my_check_in', me = any (i.check_ins), 'flaked', i.flaked_by = me, 'created_at', i.created_at,
                  'resolved_at', i.resolved_at) order by i.created_at)
                from invites i where me in (i.from_id, i.to_id)), '[]'),
    'passes', coalesce((select jsonb_agg(jsonb_build_object('profile', x.passed_id, 'at', x.at) order by x.at)
                from passes x where x.profile_id = me), '[]'),
    'blocks', coalesce((select jsonb_agg(jsonb_build_object('profile', b.blocked_id, 'at', b.created_at) order by b.created_at)
                from blocks b where b.blocker_id = me), '[]'),
    -- Reports I made. Reports about me are not part of an export.
    'reports_made', coalesce((select jsonb_agg(jsonb_build_object('profile', r.reported_id, 'reason', r.reason, 'detail', r.detail, 'at', r.created_at) order by r.created_at)
                from reports r where r.reporter_id = me), '[]'),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('platform', d.platform, 'updated_at', d.updated_at) order by d.updated_at)
                from push_tokens d where d.profile_id = me), '[]'),
    'notifications', coalesce((select jsonb_agg(jsonb_build_object('kind', n.kind, 'title', n.title, 'body', n.body, 'at', n.created_at, 'sent_at', n.sent_at) order by n.id)
                from notifications n where n.recipient_id = me), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('type', e.type, 'at', e.at, 'invite', e.invite_id) order by e.id)
                from events e where e.actor_id = me), '[]'),
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
    'line_review', (select jsonb_build_object('text', l.text, 'status', l.status, 'reason', l.reason) from private.line_reviews l where l.profile_id = me)
  );
end $function$;
