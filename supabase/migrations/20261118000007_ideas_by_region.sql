-- Ideas by region (docs/build-plan.md, WP9): a local idea shows only where it makes sense. An idea
-- with `countries` is offered to people in those countries; null means everywhere. save_profile
-- refuses a newly picked idea from elsewhere (PL104); ideas already saved stay. The same lists are
-- `countries` in IDEAS (src/domain/ideas.ts), checked by tests/unit/ideas_by_region.test.ts, which
-- also holds every open country to at least 20 ideas.
alter table public.ideas add column countries text[];

update public.ideas set countries = array['IN'] where id = 'chai_walk';
update public.ideas set countries = array['IN'] where id = 'momo_stop';
update public.ideas set countries = array['IN'] where id = 'pani_puri_duel';
update public.ideas set countries = array['IN'] where id = 'kulfi_gossip';

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
  -- What is on offer where I live (WP9): an idea with countries is only for people in those. One
  -- already saved stays, so a profile is never locked out of editing by a change to the catalogue.
  if exists (select 1 from unnest(v_ideas) i join ideas d on d.id = i
             where d.countries is not null and not (v_country = any (d.countries))
               and not (i = any (coalesce((select idea_ids from profiles where id = me), '{}')))) then
    raise exception using errcode = 'PL104', message = 'Pick things that are on offer where you live.';
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
