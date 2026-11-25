-- Spicy mode (D103): an opt-in for adults who both want to take things further, off Pinkilock.
-- The same rules are in src/domain/spicy.ts (the mock follows it).
--
--   * Off by default: no row, no Spicy. Turning it on takes a profile (18 or older), a phone or an
--     email on the account, a yes to "I am 18 or older" and to the safety rules, and a Discord
--     username (first choice), a Telegram username or a Signal username. A phone number is refused
--     in every field.
--   * Boundaries come from a fixed list; nothing typed but the two usernames.
--   * It shows only between two people who both have it on, from day one: no plan or meeting is
--     needed (Sushil, 2026-11-25). The other person must be someone I can already see: a card
--     Discover showed me (private.discover_seen) or someone I share an ask, a plan or a duo with
--     (private.shares_invite), with nobody blocked. There each sees the other's boundaries and may
--     say yes to moving the chat. Only when both said yes does either get the
--     other's usernames. Nobody is told the other said no, or whether the other has it on at all
--     unless they do too.
--   * One tap turns it off and wipes it: the usernames, the boundaries and every yes.
--   * Pinkilock hosts no chat and no explicit content. Nothing here goes into a log, a push, an
--     event or the analytics worker. It is in the data download (format 8) and goes with the account.

create table private.spicy (
  user_id uuid primary key references auth.users (id) on delete cascade,
  discord text check (discord is null or discord ~ '^[a-z0-9_.]{2,32}$'),
  telegram text check (telegram is null or telegram ~ '^[a-z][a-z0-9_]{3,30}[a-z0-9]$'),
  signal text check (signal is null or signal ~ '^[a-z_][a-z0-9_]{2,31}\.[0-9]{2,9}$'),
  boundaries text[] not null default '{}' check (boundaries <@ array['words_only', 'no_photos', 'no_video', 'face_private', 'ask_first', 'slow']),
  adult_at timestamptz not null,
  rules_at timestamptz not null,
  updated_at timestamptz not null default now(),
  check (discord is not null or telegram is not null or signal is not null)
);

create table private.spicy_yes (
  user_id uuid not null references auth.users (id) on delete cascade,
  other_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (user_id, other_id),
  check (user_id <> other_id)
);

alter table private.spicy enable row level security;
alter table private.spicy_yes enable row level security;
revoke all on private.spicy, private.spicy_yes from public, anon, authenticated, service_role;

-- A typed username in its stored form (null when empty), or the refusal. As normalizeUsername in
-- src/domain/spicy.ts; tests/db/spicy.sql runs the shared table through both.
create or replace function private.spicy_username(p_app text, p_typed text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  raw text := btrim(coalesce(p_typed, ''), E' \t\r\n');
  u text;
begin
  if raw = '' then return null; end if;
  if regexp_count(raw, '[0-9०-९]') > 6 then
    raise exception using errcode = 'PL123', message = 'Usernames only. Never put a phone number here.';
  end if;
  u := lower(raw);
  if p_app = 'discord' then
    u := regexp_replace(u, '^@', '');
    if u !~ '^[a-z0-9_.]{2,32}$' or position('..' in u) > 0 then
      raise exception using errcode = 'PL124', message = 'That is not a Discord username: 2 to 32 lowercase letters, numbers, _ or .';
    end if;
    return u;
  end if;
  if p_app = 'signal' then
    u := regexp_replace(u, '^@', '');
    if u !~ '^[a-z_][a-z0-9_]{2,31}\.[0-9]{2,9}$' then
      raise exception using errcode = 'PL131', message = 'That is not a Signal username: 3 to 32 letters, numbers or _, a dot, then 2 to 9 numbers.';
    end if;
    return u;
  end if;
  u := regexp_replace(u, '^(https?://)?(www\.)?(t\.me|telegram\.me)/', '');
  u := regexp_replace(regexp_replace(u, '^@', ''), '/$', '');
  if u !~ '^[a-z][a-z0-9_]{3,30}[a-z0-9]$' then
    raise exception using errcode = 'PL125', message = 'That is not a Telegram username: 5 to 32 letters, numbers or _, starting with a letter.';
  end if;
  return u;
end $$;
revoke all on function private.spicy_username(text, text) from public, anon, authenticated;

create or replace function private.spicy_state(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('on', true, 'discord', s.discord, 'telegram', s.telegram, 'signal', s.signal, 'boundaries', to_jsonb(s.boundaries), 'since', s.updated_at)
                   from private.spicy s where s.user_id = p_user),
                  jsonb_build_object('on', false, 'discord', null, 'telegram', null, 'signal', null, 'boundaries', '[]'::jsonb, 'since', null));
$$;
revoke all on function private.spicy_state(uuid) from public, anon, authenticated;

create or replace function public.my_spicy()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return private.spicy_state(private.self_love_me());
end $$;

-- Turns it on, or saves new usernames or boundaries while it is on.
create or replace function public.save_spicy(p_adult boolean, p_rules boolean, p_discord text, p_telegram text, p_signal text, p_boundaries text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  d text;
  tg text;
  sg text;
begin
  if not coalesce(p_adult, false) or not coalesce(p_rules, false) or (select age from profiles where id = me) < 18 then
    raise exception using errcode = 'PL127', message = 'Confirm you are 18 or older and agree to the safety rules first.';
  end if;
  if not private.is_linked(me) then
    raise exception using errcode = 'PL128', message = 'Spicy mode needs a phone number or an email on your account.';
  end if;
  d := private.spicy_username('discord', p_discord);
  tg := private.spicy_username('telegram', p_telegram);
  sg := private.spicy_username('signal', p_signal);
  if d is null and tg is null and sg is null then
    raise exception using errcode = 'PL126', message = 'Add a Discord, Telegram or Signal username.';
  end if;
  if not (coalesce(p_boundaries, '{}') <@ array['words_only', 'no_photos', 'no_video', 'face_private', 'ask_first', 'slow']) then
    raise exception using errcode = 'PL129', message = 'Pick your boundaries from the list.';
  end if;
  insert into private.spicy (user_id, discord, telegram, signal, boundaries, adult_at, rules_at)
  values (me, d, tg, sg, (select coalesce(array_agg(distinct b order by b), '{}') from unnest(coalesce(p_boundaries, '{}')) b), now(), now())
  on conflict (user_id) do update set discord = excluded.discord, telegram = excluded.telegram, signal = excluded.signal, boundaries = excluded.boundaries,
    adult_at = excluded.adult_at, rules_at = excluded.rules_at, updated_at = now();
  return private.spicy_state(me);
end $$;

-- One tap: off, and nothing kept. Every yes goes too, mine and those given to me, so it closes for both.
create or replace function public.spicy_off()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
begin
  delete from private.spicy_yes where user_id = me or other_id = me;
  delete from private.spicy where user_id = me;
  return private.spicy_state(me);
end $$;

-- Spicy with one person, for the caller. Anything that is not open (myself, someone I was never
-- shown and share nothing with, a block, either of us off or suspended) is the same closed answer,
-- so it says nothing about the other person.
create or replace function private.spicy_with_for(p_user uuid, p_other uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  theirs private.spicy;
  my_yes boolean;
  their_yes boolean;
begin
  if p_other is null or p_other = p_user then return jsonb_build_object('open', false); end if;
  select * into theirs from private.spicy where user_id = p_other;
  if not found or not exists (select 1 from private.spicy where user_id = p_user)
     or private.blocked_pair(p_user, p_other)
     or not (exists (select 1 from private.discover_seen d where d.user_id = p_user and d.card_id = p_other)
             or private.shares_invite(p_user, p_other))
     or exists (select 1 from profiles p where p.id in (p_user, p_other) and p.suspended_at is not null) then
    return jsonb_build_object('open', false);
  end if;
  my_yes := exists (select 1 from private.spicy_yes where user_id = p_user and other_id = p_other);
  their_yes := exists (select 1 from private.spicy_yes where user_id = p_other and other_id = p_user);
  return jsonb_build_object('open', true, 'my_yes', my_yes, 'mutual', my_yes and their_yes,
    'their_boundaries', to_jsonb(theirs.boundaries),
    'discord', case when my_yes and their_yes then theirs.discord end,
    'telegram', case when my_yes and their_yes then theirs.telegram end,
    'signal', case when my_yes and their_yes then theirs.signal end);
end $$;
revoke all on function private.spicy_with_for(uuid, uuid) from public, anon, authenticated;

create or replace function public.spicy_with(p_other uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return private.spicy_with_for(private.self_love_me(), p_other);
end $$;

-- Yes moves the chat once the other says yes too; no (false) takes my yes back.
create or replace function public.spicy_yes(p_other uuid, p_yes boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
begin
  if not coalesce((private.spicy_with_for(me, p_other) ->> 'open')::boolean, false) then
    raise exception using errcode = 'PL130', message = 'Spicy opens only when you both have it on.';
  end if;
  if coalesce(p_yes, false) then
    insert into private.spicy_yes (user_id, other_id) values (me, p_other) on conflict do nothing;
  else
    delete from private.spicy_yes where user_id = me and other_id = p_other;
  end if;
  return private.spicy_with_for(me, p_other);
end $$;

revoke all on function public.my_spicy(), public.save_spicy(boolean, boolean, text, text, text, text[]), public.spicy_off(),
  public.spicy_with(uuid), public.spicy_yes(uuid, boolean) from public, anon;
grant execute on function public.my_spicy(), public.save_spicy(boolean, boolean, text, text, text, text[]), public.spicy_off(),
  public.spicy_with(uuid), public.spicy_yes(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- The data download, format 8: as in 20261125000001_self_love.sql, plus Spicy mode.
-- ---------------------------------------------------------------------------------------------
create or replace function public.export_my_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  return jsonb_build_object(
    'format', 'pinkilock-export-8',
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'phone', u.phone, 'email', nullif(u.email, ''), 'created_at', u.created_at, 'is_anonymous', u.is_anonymous)
                from auth.users u where u.id = me),
    'profile', (select to_jsonb(p) from profiles p where p.id = me),
    'contact', (select jsonb_build_object('kind', c.contact_kind, 'handle', c.contact_handle, 'photos', c.photos, 'verified_at', c.contact_verified_at)
                from profile_private c where c.profile_id = me),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'status', x.status, 'bytes', x.bytes, 'at', x.created_at, 'decided_at', x.decided_at) order by x.created_at)
                from photos x where x.profile_id = me), '[]'),
    'trust_score', (select to_jsonb(t) - 'profile_id' from trust_scores t where t.profile_id = me),
    -- The other people appear by id only: their cards are theirs. On a double, `other_person` is
    -- the asker or the person asked on the other side, and `with` lists the two friends.
    'invites', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', i.id,
                  'role', case me when i.from_id then 'asked' when i.to_id then 'was_asked'
                                  when i.from_friend then 'asked_with_a_friend' else 'was_asked_with_a_friend' end,
                  'other_person', case when me in (i.from_id, i.from_friend) then i.to_id else i.from_id end,
                  'with', case when i.from_friend is not null then jsonb_build_array(i.from_friend, i.to_friend) end,
                  'idea', i.idea_id, 'starts_at', i.starts_at, 'place', i.place, 'note', i.note, 'status', i.status,
                  'my_check_in', me = any (i.check_ins), 'flaked', i.flaked_by = me, 'created_at', i.created_at,
                  'resolved_at', i.resolved_at) order by i.created_at)
                from invites i where me in (i.from_id, i.to_id, i.from_friend, i.to_friend)), '[]'),
    'duo', (select jsonb_build_object('partner', d.partner, 'since', d.created_at) from duos d where d.person = me),
    'passes', coalesce((select jsonb_agg(jsonb_build_object('profile', x.passed_id, 'at', x.at) order by x.at)
                from passes x where x.profile_id = me), '[]'),
    'blocks', coalesce((select jsonb_agg(jsonb_build_object('profile', b.blocked_id, 'at', b.created_at) order by b.created_at)
                from blocks b where b.blocker_id = me), '[]'),
    -- Reports I made. Reports about me are not part of an export.
    'reports_made', coalesce((select jsonb_agg(jsonb_build_object('profile', r.reported_id, 'reason', r.reason, 'detail', r.detail, 'at', r.created_at) order by r.created_at)
                from reports r where r.reporter_id = me), '[]'),
    -- Handles I flagged as not working, by person and plan; their handle is theirs, so it is left out.
    'contact_flags_made', coalesce((select jsonb_agg(jsonb_build_object('profile', f.owner_id, 'invite', f.invite_id, 'at', f.at) order by f.at)
                from contact_reports f where f.reporter_id = me), '[]'),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('platform', d.platform, 'updated_at', d.updated_at) order by d.updated_at)
                from push_tokens d where d.profile_id = me), '[]'),
    'notifications', coalesce((select jsonb_agg(jsonb_build_object('kind', n.kind, 'title', n.title, 'body', n.body, 'at', n.created_at, 'sent_at', n.sent_at) order by n.id)
                from notifications n where n.recipient_id = me), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('type', e.type, 'at', e.at, 'invite', e.invite_id) order by e.id)
                -- A flag on my handle is logged against me, but it names the plan and so the flagger:
                -- like reports about me, it is not part of an export.
                from events e where e.actor_id = me and e.type <> 'bad_contact'), '[]'),
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
    'line_review', (select jsonb_build_object('text', l.text, 'status', l.status, 'reason', l.reason) from private.line_reviews l where l.profile_id = me),
    -- Self love (D101): every mood, note, pause and reset, all of it the person's own.
    'self_love', jsonb_build_object(
      'moods', coalesce((select jsonb_agg(jsonb_build_object('day', m.day, 'mood', m.mood) order by m.day) from private.self_moods m where m.user_id = me), '[]'),
      'notes', coalesce((select jsonb_agg(jsonb_build_object('kind', n.kind, 'body', n.body, 'day', n.day, 'at', n.at) order by n.at) from private.self_notes n where n.user_id = me), '[]'),
      'pause_and_reset', (select jsonb_build_object('paused_until', s.paused_until, 'reset_started', s.reset_started, 'reset_done', s.reset_done) from private.self_love s where s.user_id = me)),
    -- Spicy mode (D103): my own usernames, boundaries and yeses. The other person's are theirs.
    'spicy', (select jsonb_build_object('discord', s.discord, 'telegram', s.telegram, 'signal', s.signal, 'boundaries', to_jsonb(s.boundaries), 'adult_at', s.adult_at, 'rules_at', s.rules_at, 'since', s.updated_at,
                'yes', coalesce((select jsonb_agg(jsonb_build_object('with', y.other_id, 'at', y.at) order by y.at) from private.spicy_yes y where y.user_id = me), '[]'))
              from private.spicy s where s.user_id = me)
  );
end $$;
