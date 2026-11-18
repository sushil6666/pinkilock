-- The rest of WP1 that needs no account (docs/build-plan.md; decisions O03, D040):
--
--   * The ask line is picked, never typed: send_invite accepts only a line from `ask_lines` (the
--     same list as ASK_LINES in src/domain/ideas.ts) or none (PL069).
--   * Change limits: a name once in 30 days (PL070), the one free line once in 7 (PL071).
--   * Line review: with `line_review` set to 'human' or 'ai' in private.config, a new profile line
--     waits in private.line_reviews and others keep seeing the last approved one. 'ai' means the
--     review-line Edge Function asks a model first; anything it is unsure of, and everything in
--     'human' mode, waits for a moderator (scripts/moderate.sh). 'off' (the default) shows the
--     line at once, after the pattern check, as before.
--   * Reports gain the reason `shared_contact`. Moderation acts through private.moderate():
--     dismiss, hide_line (line removed, no new line for 30 days, one strike), suspend, unsuspend.
--     Two strikes suspend. A suspended account is out of Discover and cannot ask, lock or edit
--     (PL072). Every action is recorded in private.moderation_actions with its reason.

-- ---------------------------------------------------------------------------------------------
-- Settings readers
-- ---------------------------------------------------------------------------------------------

create or replace function private.config_text(p_key text)
returns text language sql stable security definer set search_path = '' as $$
  select value from private.config where key = p_key;
$$;
revoke all on function private.config_text(text) from public, anon, authenticated;
insert into private.config (key, value) values ('line_review', 'off') on conflict (key) do nothing;

-- ---------------------------------------------------------------------------------------------
-- The ask line catalogue
-- ---------------------------------------------------------------------------------------------

create table public.ask_lines (line text primary key check (char_length(line) between 2 and 80));
alter table public.ask_lines enable row level security;
create policy ask_lines_read on public.ask_lines for select to authenticated using (true);
revoke all on public.ask_lines from anon, authenticated;
grant select on public.ask_lines to authenticated;
insert into public.ask_lines (line) values
  ('i will be the one looking lost.'),
  ('loser pays. not nervous at all.'),
  ('camera on, effort optional.'),
  ('ten minutes, then you are free.'),
  ('prepare to lose, respectfully.'),
  ('winner gets bragging rights only.'),
  ('low stakes, high snacks.'),
  ('hard stop, pinky promise.'),
  ('no pressure, just vibes.'),
  ('i will be early. it is a whole thing.'),
  ('saw your card. stopped scrolling.'),
  ('i am asking first. your move.'),
  ('i do not do maybes. you in?'),
  ('you, me, twenty minutes. that is the pitch.'),
  ('say yes. overthink it later.'),
  ('not here for a pen pal. see you there?'),
  ('fair warning: i am better in person.'),
  ('come find out if the rizz is real.'),
  ('i will try not to stare. no promises.'),
  ('you are cute. this is the follow-up.'),
  ('bring that smile. i will handle the rest.'),
  ('my screen time says i like your card.'),
  ('worst case, it is a great story.'),
  ('no plan past minute one. pure chaos.'),
  ('dare you to show up.'),
  ('bad idea? probably. still asking.'),
  ('side quest unlocked. accept?'),
  ('main character behaviour only.'),
  ('i am trouble. the fun kind.'),
  ('behave? on a first date? unlikely.'),
  ('i will be good. mostly.'),
  ('blushing is allowed. encouraged, even.'),
  ('pinky promise to keep it pg. ish.'),
  ('you look like a bad influence. perfect.'),
  ('may i have the pleasure of your company?'),
  ('i will be on time. it is called manners.'),
  ('no games. i would simply like to meet you.'),
  ('the chai is on me. i insist.'),
  ('a proper hello, in person. like the old days.'),
  ('i would have written a letter. this is faster.')
on conflict (line) do nothing;

-- ---------------------------------------------------------------------------------------------
-- Profiles: change dates, moderation state
-- ---------------------------------------------------------------------------------------------

alter table public.profiles
  add column name_changed_at timestamptz,
  add column tagline_changed_at timestamptz,
  add column tagline_locked_until timestamptz,
  add column contact_strikes int not null default 0,
  add column suspended_at timestamptz;

create or replace function private.require_active(p_user uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from public.profiles where id = p_user and suspended_at is not null) then
    raise exception using errcode = 'PL072', message = 'This account is paused while we look at a report.';
  end if;
end $$;
revoke all on function private.require_active(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Line review queue
-- ---------------------------------------------------------------------------------------------

create table private.line_reviews (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  text text not null check (char_length(text) <= 80),
  status text not null default 'pending' check (status in ('pending', 'held', 'approved', 'rejected')),
  reason text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts int not null default 0,
  decided_at timestamptz,
  decided_by text check (decided_by in ('ai', 'human'))
);
create index line_reviews_pending_idx on private.line_reviews (created_at) where status = 'pending';
revoke all on private.line_reviews from public, anon, authenticated;

-- What happened to my own line, for the Me screen. Nobody else's.
create or replace function public.my_line_review()
returns table (text text, status text) language sql stable security definer set search_path = public as $$
  select r.text, r.status from private.line_reviews r where r.profile_id = auth.uid() and r.status in ('pending', 'held', 'rejected');
$$;
revoke all on function public.my_line_review() from public, anon;
grant execute on function public.my_line_review() to authenticated;

-- Decide one line. Approved: it becomes the line on the card, unless the person has changed it
-- since. Held: it waits for a moderator. Rejected: it never shows.
create or replace function private.decide_line(p_profile uuid, p_text text, p_decision text, p_reason text, p_by text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_decision not in ('approved', 'held', 'rejected') or p_by not in ('ai', 'human') then
    raise exception using errcode = 'PL090', message = 'That moderation step is not valid.';
  end if;
  update private.line_reviews set status = p_decision, reason = left(p_reason, 200), decided_at = now(), decided_by = p_by
  where profile_id = p_profile and text = p_text and status in ('pending', 'held');
  if found and p_decision = 'approved' then
    update public.profiles set tagline = p_text, tagline_changed_at = now() where id = p_profile;
  end if;
end $$;
revoke all on function private.decide_line(uuid, text, text, text, text) from public, anon, authenticated;

-- For the review-line Edge Function (service role only), like claim_notifications for push.
create or replace function public.claim_line_reviews(p_limit int default 20)
returns table (profile_id uuid, text text) language sql security definer set search_path = public as $$
  update private.line_reviews r set claimed_at = now(), attempts = attempts + 1
  where r.profile_id in (
    select l.profile_id from private.line_reviews l
    where l.status = 'pending' and l.attempts < 3 and (l.claimed_at is null or l.claimed_at < now() - interval '2 minutes')
    order by l.created_at limit p_limit for update skip locked)
  returning r.profile_id, r.text;
$$;
create or replace function public.finish_line_review(p_profile uuid, p_text text, p_decision text, p_reason text)
returns void language sql security definer set search_path = public as $$
  select private.decide_line(p_profile, p_text, p_decision, p_reason, 'ai');
$$;
revoke all on function public.claim_line_reviews(int), public.finish_line_review(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_line_reviews(int), public.finish_line_review(uuid, text, text, text) to service_role;

-- Wake the review function every minute while lines wait and review is 'ai'. Same shared secret
-- and base URL as push (scripts/push-config.sh); the function lives next to push.
create or replace function private.kick_line_review()
returns void language plpgsql security definer set search_path = public as $$
declare
  url text;
  secret text;
begin
  if private.config_text('line_review') <> 'ai' then return; end if;
  if not exists (select 1 from private.line_reviews where status = 'pending') then return; end if;
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then return; end if;
  execute $q$ select decrypted_secret from vault.decrypted_secrets where name = 'push_function_url' $q$ into url;
  execute $q$ select decrypted_secret from vault.decrypted_secrets where name = 'push_function_secret' $q$ into secret;
  if url is null or secret is null then return; end if;
  execute $q$ select net.http_post(url := $1, headers := $2, body := '{}'::jsonb, timeout_milliseconds := 10000) $q$
    using regexp_replace(url, '/push$', '/review-line'), jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret);
exception when others then
  raise warning 'kick_line_review: %', sqlerrm;
end $$;
revoke all on function private.kick_line_review() from public, anon, authenticated;
select cron.schedule('pinkilock-line-review', '* * * * *', 'select private.kick_line_review()');

-- ---------------------------------------------------------------------------------------------
-- Reports and moderation
-- ---------------------------------------------------------------------------------------------

alter table public.reports drop constraint reports_reason_check;
alter table public.reports add constraint reports_reason_check
  check (reason in ('fake', 'harassment', 'inappropriate', 'underage', 'unsafe', 'shared_contact', 'other'));

create table private.moderation_actions (
  id bigint generated always as identity primary key,
  profile_id uuid references public.profiles (id) on delete set null,
  report_id bigint references public.reports (id) on delete set null,
  action text not null check (action in ('dismiss', 'hide_line', 'suspend', 'unsuspend', 'approve_line', 'reject_line')),
  note text not null check (char_length(note) between 2 and 500),
  at timestamptz not null default now()
);
revoke all on private.moderation_actions from public, anon, authenticated;

-- One moderator decision on a report (or, with no report, on a person). Run with the database role
-- (scripts/moderate.sh); no API role can call it. Every action needs a reason, which is kept.
create or replace function private.moderate(p_report bigint, p_profile uuid, p_action text, p_note text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  who uuid := p_profile;
  strikes int;
begin
  if p_report is not null then
    select reported_id into who from public.reports where id = p_report;
    if not found then raise exception using errcode = 'PL090', message = 'That moderation step is not valid.'; end if;
    update public.reports set reviewed_at = now(), review_note = left(p_action || ': ' || p_note, 500) where id = p_report;
  end if;
  if who is null and p_action <> 'dismiss' then raise exception using errcode = 'PL090', message = 'That moderation step is not valid.'; end if;

  if p_action = 'hide_line' then
    update public.profiles set tagline = '', tagline_locked_until = now() + interval '30 days', contact_strikes = contact_strikes + 1
    where id = who returning contact_strikes into strikes;
    update private.line_reviews set status = 'rejected', reason = left(p_note, 200), decided_at = now(), decided_by = 'human'
    where profile_id = who and status in ('pending', 'held');
    if strikes >= 2 then
      update public.profiles set suspended_at = now() where id = who and suspended_at is null;
    end if;
  elsif p_action = 'suspend' then
    update public.profiles set suspended_at = now() where id = who;
  elsif p_action = 'unsuspend' then
    update public.profiles set suspended_at = null where id = who;
  elsif p_action = 'approve_line' then
    perform private.decide_line(who, (select text from private.line_reviews where profile_id = who), 'approved', p_note, 'human');
  elsif p_action = 'reject_line' then
    perform private.decide_line(who, (select text from private.line_reviews where profile_id = who), 'rejected', p_note, 'human');
  elsif p_action <> 'dismiss' then
    raise exception using errcode = 'PL090', message = 'That moderation step is not valid.';
  end if;

  insert into private.moderation_actions (profile_id, report_id, action, note) values (who, p_report, p_action, p_note);
  return p_action || ' done' || case when strikes >= 2 and p_action = 'hide_line' then ' (second strike: suspended)' else '' end;
end $$;
revoke all on function private.moderate(bigint, uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The functions as earlier migrations left them, with the rules above added.
-- ---------------------------------------------------------------------------------------------

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
  perform private.require_active(me);
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
  -- The line is picked, never typed (O03): it must be one of the catalogue's lines, or none.
  if btrim(coalesce(p_note, '')) <> '' and not exists (select 1 from ask_lines where line = btrim(p_note)) then
    raise exception using errcode = 'PL069', message = 'Pick a line from the list.';
  end if;
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
  perform private.require_active(me);
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

  insert into profiles (id, name, age, area, pronouns, tagline, vibes, idea_ids, palette)
  values (me, v_name, p_age, v_area, v_pronouns, line_shown, v_vibes, v_ideas,
          string_to_array(palettes[1 + abs(hashtext(me::text)) % cardinality(palettes)], ','))
  on conflict (id) do update set name = excluded.name, age = excluded.age, area = excluded.area, pronouns = excluded.pronouns,
    tagline = excluded.tagline, vibes = excluded.vibes, idea_ids = excluded.idea_ids,
    name_changed_at = case when excluded.name <> profiles.name then now() else profiles.name_changed_at end,
    tagline_changed_at = case when line_changed then now() else profiles.tagline_changed_at end;

  if p_contact_kind is not null then
    insert into profile_private (profile_id, contact_kind, contact_handle) values (me, p_contact_kind, v_handle)
    on conflict (profile_id) do update set contact_kind = excluded.contact_kind, contact_handle = excluded.contact_handle;
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.report_user(p_profile uuid, p_reason text, p_detail text DEFAULT ''::text, p_invite uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  inv uuid;
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if p_profile = me then raise exception using errcode = 'PL011', message = 'You cannot report yourself.'; end if;
  if not exists (select 1 from profiles where id = me) then raise exception using errcode = 'PL002', message = 'Finish setting up first.'; end if;
  if not exists (select 1 from profiles where id = p_profile) then raise exception using errcode = 'PL003', message = 'That person is not around any more.'; end if;
  if p_reason not in ('fake', 'harassment', 'inappropriate', 'underage', 'unsafe', 'shared_contact', 'other') then raise exception using errcode = 'PL012', message = 'Pick a reason.'; end if;
  if char_length(coalesce(p_detail, '')) > 500 then raise exception using errcode = 'PL013', message = 'Keep it under 500 characters.'; end if;
  if (select count(*) from reports where reporter_id = me and created_at > now() - interval '24 hours') >= 10 then
    raise exception using errcode = 'PL014', message = 'You have sent a lot of reports today. We are looking at them.';
  end if;
  -- Only an invite the two of you share can be attached; anything else is dropped, not trusted.
  select id into inv from invites
  where id = p_invite and ((from_id = me and to_id = p_profile) or (from_id = p_profile and to_id = me));
  insert into reports (reporter_id, reported_id, invite_id, reason, detail)
  values (me, p_profile, inv, p_reason, btrim(coalesce(p_detail, '')));
  insert into blocks (blocker_id, blocked_id) values (me, p_profile) on conflict do nothing;
  perform private.end_live_invites(me, p_profile, 'block');
end $function$;

CREATE OR REPLACE FUNCTION public.discover(p_limit integer DEFAULT 20)
 RETURNS SETOF profile_cards
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- A fresh order every day, the same all day, and different for every person.
    order by md5(me::text || c.id::text || current_date::text)
  loop
    if exists (select 1 from private.discover_seen s where s.user_id = me and s.card_id = card.id and s.at > now() - interval '1 day') then
      return next card;
    elsif used < 200 then
      insert into private.discover_seen (user_id, card_id) values (me, card.id)
      on conflict (user_id, card_id) do update set at = now();
      used := used + 1;
      return next card;
    else
      continue;
    end if;
    served := served + 1;
    exit when served >= want;
  end loop;
end $function$;
