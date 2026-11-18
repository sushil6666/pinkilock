-- Contact handles (D077): each app has its own format rule, and a handle that did not work can be
-- flagged after the reveal and counts against the owner's trust score.
--
-- 1. private.normalize_contact: the one place a handle is checked and put in its stored form.
--    src/domain/profile.ts (normalizeContact) is the app's copy; HANDLE_CASES is the shared table
--    (tests/db/handle_cases.sql, generated). Change both together.
--      Instagram  1 to 30 of a-z 0-9 . _ ; no dot first or last, no two dots together. Stored "@name".
--      Snapchat   3 to 15 of a-z 0-9 . _ - ; a letter first, a letter or digit last. Stored "name".
--      WhatsApp   a mobile number. With + (or 00) it carries its own country code, 8 to 15 digits; an
--                 Indian one must be 10 digits from 6 to 9. Without, it is read as Indian (with or
--                 without 91 or 0). Stored "+91 XXXXX XXXXX" in India, "+<digits>" elsewhere.
--      The rest   (Telegram, Signal, LINE, KakaoTalk, WeChat) 2 to 40 characters, as typed.
--    A leading @ and a pasted profile link (instagram.com/name, snapchat.com/add/name) are taken off.
-- 2. save_profile (as 20261118000003_picked_fields.sql left it) uses it. Handles saved before this stay as they are until the next change.
-- 3. contact_reports and report_bad_contact: one flag per person per kept plan, only from someone
--    the handle was revealed to (the same rule as the private_after_kept policy), within 7 days.
--    Each flag is a `bad_contact` event with the owner as the actor, which the trust pipeline counts.
-- 4. my_contact_flags: how many flags the handle I have now has, so the app can tell me to fix it.
-- 5. Proving a handle is yours (D078): start_contact_check gives a code such as PINKY-4F2A9C and
--    where to send it (Pinkilock's WhatsApp number or Instagram account, from private.config). The
--    person sends it from the account they gave; the contact-verify Edge Function receives the
--    message from Meta, and confirm_contact_code (service role only) marks the handle verified when
--    the sender is that handle. Changing the handle clears the tick. Other apps give us no way to
--    receive a message, so those handles stay unverified.

create or replace function private.normalize_contact(p_kind text, p_handle text)
returns text language plpgsql stable set search_path = '' as $$
declare
  h text := lower(btrim(coalesce(p_handle, '')));
  d text;
begin
  if p_kind = 'Instagram' then
    h := regexp_replace(h, '^(https?://)?(www\.)?(instagram\.com|instagr\.am)/', '');
    h := regexp_replace(regexp_replace(h, '[/?#].*$', ''), '^@', '');
    if h !~ '^[a-z0-9._]{1,30}$' or h ~ '^\.' or h ~ '\.$' or h ~ '\.\.' then
      raise exception using errcode = 'PL097', message = 'That is not an Instagram username: letters, numbers, dots and underscores, up to 30.';
    end if;
    return '@' || h;
  elsif p_kind = 'Snapchat' then
    h := regexp_replace(h, '^(https?://)?(www\.)?snapchat\.com/(add/)?', '');
    h := regexp_replace(regexp_replace(h, '[/?#].*$', ''), '^@', '');
    if h !~ '^[a-z][a-z0-9._-]{1,13}[a-z0-9]$' then
      raise exception using errcode = 'PL098', message = 'That is not a Snapchat username: 3 to 15, starting with a letter.';
    end if;
    return h;
  elsif p_kind = 'WhatsApp' then
    if h !~ '^[0-9+ ()-]+$' then
      raise exception using errcode = 'PL099', message = 'Use your WhatsApp number with its country code, like +91 98765 43210.';
    end if;
    d := regexp_replace(h, '[^0-9]', '', 'g');
    if h ~ '^[ (]*\+' or d ~ '^00' then
      d := regexp_replace(d, '^00', '');
      if d !~ '^91' then
        if d !~ '^[1-9][0-9]{7,14}$' then
          raise exception using errcode = 'PL099', message = 'Use your WhatsApp number with its country code, like +91 98765 43210.';
        end if;
        return '+' || d;
      end if;
      d := substr(d, 3);
    elsif char_length(d) = 12 and d ~ '^91' then d := substr(d, 3);
    elsif char_length(d) = 11 and d ~ '^0' then d := substr(d, 2);
    end if;
    if d !~ '^[6-9][0-9]{9}$' then
      raise exception using errcode = 'PL099', message = 'Use your WhatsApp number with its country code, like +91 98765 43210.';
    end if;
    return '+91 ' || substr(d, 1, 5) || ' ' || substr(d, 6);
  end if;
  h := btrim(coalesce(p_handle, ''));
  if char_length(h) not between 2 and 40 or not exists (select 1 from public.contact_kinds k where k.kind = p_kind) then
    raise exception using errcode = 'PL066', message = 'Add how people reach you after a kept promise.';
  end if;
  return h;
end $$;
revoke all on function private.normalize_contact(text, text) from public, anon;

-- ---------------------------------------------------------------------------------------------
-- Flags
-- ---------------------------------------------------------------------------------------------

alter table public.events drop constraint events_type_check;
alter table public.events add constraint events_type_check check (type in (
  'app_open', 'ask_sent', 'pinky_out', 'locked', 'declined', 'expired', 'checked_in', 'kept', 'bailed', 'no_show', 'ended',
  'bad_contact'));

-- Readable by no client role, like reports.
create table public.contact_reports (
  invite_id uuid not null,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  handle text not null,
  at timestamptz not null default now(),
  primary key (invite_id, reporter_id, owner_id)
);
alter table public.contact_reports enable row level security;
revoke all on public.contact_reports from anon, authenticated;
create index contact_reports_owner_idx on public.contact_reports (owner_id);

create or replace function public.report_bad_contact(p_invite uuid, p_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_handle text;
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if p_owner is null or p_owner = me or private.blocked_pair(me, p_owner) or not exists (
    select 1 from invites i
    where i.id = p_invite and i.status = 'kept' and i.resolved_at > now() - interval '7 days' and (
      (i.from_friend is null and ((i.from_id = me and i.to_id = p_owner) or (i.to_id = me and i.from_id = p_owner)))
      or (i.from_friend is not null
          and me = any (i.check_ins) and p_owner = any (i.check_ins)
          and ((me in (i.from_id, i.from_friend) and p_owner in (i.to_id, i.to_friend))
               or (me in (i.to_id, i.to_friend) and p_owner in (i.from_id, i.from_friend)))))
  ) then
    raise exception using errcode = 'PL100', message = 'You can flag a handle only from a promise you kept this week.';
  end if;
  select contact_handle into v_handle from profile_private where profile_id = p_owner;
  insert into contact_reports (invite_id, reporter_id, owner_id, handle) values (p_invite, me, p_owner, coalesce(v_handle, ''))
  on conflict do nothing;
  if found then
    insert into events (actor_id, invite_id, type, props) values (p_owner, p_invite, 'bad_contact', '{}');
  end if;
end $$;
revoke all on function public.report_bad_contact(uuid, uuid) from public, anon;
grant execute on function public.report_bad_contact(uuid, uuid) to authenticated;

-- Flags on the handle I have now. Who flagged it is never said.
create or replace function public.my_contact_flags()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from contact_reports r join profile_private p on p.profile_id = r.owner_id
  where r.owner_id = auth.uid() and r.handle = p.contact_handle;
$$;
revoke all on function public.my_contact_flags() from public, anon;
grant execute on function public.my_contact_flags() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Proving a handle is yours
-- ---------------------------------------------------------------------------------------------

alter table public.profile_private add column contact_verified_at timestamptz;

create table private.contact_codes (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  code text not null unique,
  kind text not null,
  handle text not null,
  created_at timestamptz not null default now()
);

-- Off until the deploy sets where codes go: verify_whatsapp (digits, e.g. 919800000000) and
-- verify_instagram (the account's username).
create or replace function public.start_contact_check()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mine profile_private;
  v_to text;
  v_code text;
  cur private.contact_codes;
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  select * into mine from profile_private where profile_id = me;
  if not found then raise exception using errcode = 'PL066', message = 'Add how people reach you after a kept promise.'; end if;
  if mine.contact_kind not in ('Instagram', 'WhatsApp') then
    raise exception using errcode = 'PL101', message = 'Checking works for Instagram and WhatsApp for now.';
  end if;
  v_to := nullif(btrim(coalesce(private.config_text(case mine.contact_kind when 'WhatsApp' then 'verify_whatsapp' else 'verify_instagram' end), '')), '');
  if v_to is null then raise exception using errcode = 'PL102', message = 'Checking handles is not switched on yet.'; end if;
  select * into cur from private.contact_codes where profile_id = me;
  -- The same code for 30 minutes, so tapping again does not break a message already sent.
  if found and cur.handle = mine.contact_handle and cur.created_at > now() - interval '30 minutes' then
    v_code := cur.code;
  else
    v_code := 'PINKY-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    insert into private.contact_codes (profile_id, code, kind, handle) values (me, v_code, mine.contact_kind, mine.contact_handle)
    on conflict (profile_id) do update set code = excluded.code, kind = excluded.kind, handle = excluded.handle, created_at = now();
  end if;
  return jsonb_build_object('code', v_code, 'kind', mine.contact_kind, 'to', v_to, 'verified', mine.contact_verified_at is not null);
end $$;
revoke all on function public.start_contact_check() from public, anon;
grant execute on function public.start_contact_check() to authenticated;

-- Called only by the contact-verify Edge Function with what Meta says: which app, who sent it (the
-- WhatsApp number or the Instagram username) and the text. 'verified', or why not.
create or replace function public.confirm_contact_code(p_kind text, p_sender text, p_text text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(substring(coalesce(p_text, '') from '(?i)PINKY-[0-9A-F]{6}'));
  v_sender text;
  cur private.contact_codes;
  n int;
begin
  if v_code is null then return 'no_code'; end if;
  select * into cur from private.contact_codes where code = v_code;
  if not found or cur.created_at < now() - interval '30 minutes' then return 'expired'; end if;
  begin
    v_sender := private.normalize_contact(p_kind, p_sender);
  exception when others then
    return 'mismatch';
  end;
  if cur.kind <> p_kind or cur.handle <> v_sender then return 'mismatch'; end if;
  update profile_private set contact_verified_at = now()
  where profile_id = cur.profile_id and contact_kind = cur.kind and contact_handle = cur.handle;
  get diagnostics n = row_count;
  delete from private.contact_codes where profile_id = cur.profile_id;
  return case when n > 0 then 'verified' else 'mismatch' end;
end $$;
revoke all on function public.confirm_contact_code(text, text, text) from public, anon, authenticated;
grant execute on function public.confirm_contact_code(text, text, text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- save_profile as 20261118000003_picked_fields.sql left it, with the contact rule above.
-- ---------------------------------------------------------------------------------------------

create or replace function public.save_profile(p_name text, p_age integer, p_area text, p_pronouns text, p_tagline text, p_vibes text[], p_idea_ids text[], p_contact_kind text DEFAULT NULL::text, p_contact_handle text DEFAULT NULL::text, p_city text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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
    -- A kind offered in this person's country (contact_kinds, WP9).
    if p_contact_kind is null or v_handle = ''
       or not exists (select 1 from contact_kinds k where k.kind = p_contact_kind and (k.countries is null or v_country = any (k.countries))) then
      raise exception using errcode = 'PL066', message = 'Add how people reach you after a kept promise.';
    end if;
    v_handle := private.normalize_contact(p_contact_kind, v_handle);
  elsif not exists (select 1 from profile_private where profile_id = me) then
    raise exception using errcode = 'PL066', message = 'Add how people reach you after a kept promise.';
  end if;
  -- Picked, not typed (WP1): the area from the city's list (when it has one), pronouns from theirs.
  -- What is already saved stays valid, so a profile from before the lists can still be edited.
  if v_area <> '' and v_area is distinct from (select area from profiles where id = me)
     and exists (select 1 from areas a where a.city = v_city)
     and not exists (select 1 from areas a where a.city = v_city and a.name = v_area) then
    raise exception using errcode = 'PL095', message = 'Pick your area from the list.';
  end if;
  if v_pronouns <> '' and v_pronouns is distinct from (select pronouns from profiles where id = me)
     and not exists (select 1 from pronoun_options o where o.label = v_pronouns) then
    raise exception using errcode = 'PL096', message = 'Pick your pronouns from the list.';
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
    on conflict (profile_id) do update set contact_kind = excluded.contact_kind, contact_handle = excluded.contact_handle,
      contact_verified_at = case when (profile_private.contact_kind, profile_private.contact_handle) = (excluded.contact_kind, excluded.contact_handle)
                                 then profile_private.contact_verified_at end;
  end if;
end $$;
