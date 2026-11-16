-- Push notifications, server side only.
--
--   invites change / sweep  ->  notifications (outbox, same transaction)  ->  pg_net  ->  Edge
--   Function `push` (service role)  ->  Expo push service  ->  the phone
--
-- The app never sends a push and never reads these tables. It only hands over its device token
-- through register_push_token(). What a notification says is written here, in SQL, from columns
-- the recipient may already read under RLS (the invite they are on, the other person's public
-- name, the idea's title). Nothing from profile_private can reach a notification, because no
-- statement in this file reads it.

-- ---------------------------------------------------------------------------------------------
-- Device tokens
-- ---------------------------------------------------------------------------------------------

create table public.push_tokens (
  token text primary key check (token ~ '^Expo(nent)?PushToken\[[^\]]+\]$'),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
create index push_tokens_profile_idx on public.push_tokens (profile_id);

-- The outbox. One row per (invite, person, kind), so that nothing is ever announced twice.
create table public.notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  invite_id uuid not null references public.invites (id) on delete cascade,
  kind text not null check (kind in ('new_ask', 'pinky_out', 'locked', 'checkin_open', 'bailed', 'no_show', 'missed')),
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts int not null default 0,
  sent_at timestamptz,
  last_error text,
  unique (invite_id, recipient_id, kind)
);
create index notifications_pending_idx on public.notifications (created_at) where sent_at is null;

-- RLS on and no policy: no client can read or write either table. The Edge Function uses the
-- service role, which bypasses RLS.
alter table public.push_tokens enable row level security;
alter table public.notifications enable row level security;
revoke all on public.push_tokens, public.notifications from anon, authenticated;

-- A phone hands over its token. A token belongs to whoever registered it last (a phone that
-- changes hands or signs in again must not keep getting the previous person's pushes).
create or replace function public.register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if not exists (select 1 from profiles where id = me) then raise exception 'Finish setting up first.'; end if;
  insert into push_tokens (token, profile_id, platform) values (p_token, me, p_platform)
  on conflict (token) do update set profile_id = excluded.profile_id, platform = excluded.platform, updated_at = now();
end $$;

create or replace function public.unregister_push_token(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from push_tokens where token = p_token and profile_id = auth.uid();
end $$;

-- ---------------------------------------------------------------------------------------------
-- What gets announced. Mirrors the banners in src/services/supabase/supabaseBackend.ts.
-- ---------------------------------------------------------------------------------------------

create or replace function public.queue_notification(p_to uuid, p_invite uuid, p_kind text, p_title text, p_body text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (recipient_id, invite_id, kind, title, body)
  values (p_to, p_invite, p_kind, p_title, p_body)
  on conflict (invite_id, recipient_id, kind) do nothing;
$$;

create or replace function public.invites_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  idea text;
  from_name text;
  to_name text;
  bailer text;
  other uuid;
begin
  if tg_op = 'UPDATE' and new.status = old.status then return null; end if;
  select title into idea from ideas where id = new.idea_id;
  select name into from_name from profiles where id = new.from_id;
  select name into to_name from profiles where id = new.to_id;

  if new.status = 'sent' then
    perform queue_notification(new.to_id, new.id, 'new_ask', from_name || ' asked you', idea || '. Lock it or pass.');

  elsif new.status = 'half_locked' then
    -- The receiver went first; the sender has to seal it.
    perform queue_notification(new.from_id, new.id, 'pinky_out', to_name || '''s pinky is out', idea || '. Slide in to seal it.');

  elsif new.status = 'locked' then
    -- The sender sealed it; tell the person whose pinky was waiting.
    perform queue_notification(new.to_id, new.id, 'locked', 'Locked with ' || from_name, idea || ' is a promise now. Be there.');

  elsif new.status = 'flaked' then
    if now() <= new.starts_at + interval '30 minutes' then
      -- Inside the window, a flake is a bail. Tell the one who was bailed on.
      other := case when new.flaked_by = new.from_id then new.to_id else new.from_id end;
      bailer := case when new.flaked_by = new.from_id then from_name else to_name end;
      perform queue_notification(other, new.id, 'bailed', bailer || ' bailed', idea || ' is off. Their score takes the hit, not yours.');
    elsif new.flaked_by is null then
      perform queue_notification(new.from_id, new.id, 'missed', 'Promise missed', 'Neither of you checked in for ' || idea || '.');
      perform queue_notification(new.to_id, new.id, 'missed', 'Promise missed', 'Neither of you checked in for ' || idea || '.');
    else
      other := case when new.flaked_by = new.from_id then new.to_id else new.from_id end;
      bailer := case when new.flaked_by = new.from_id then from_name else to_name end;
      perform queue_notification(other, new.id, 'no_show', bailer || ' did not show', 'You showed up for ' || idea || '. Their score takes the hit, not yours.');
      perform queue_notification(new.flaked_by, new.id, 'missed', 'Promise missed', 'Check-in for ' || idea || ' closed without you. That is on your record.');
    end if;
  end if;
  return null;
end $$;

create trigger invites_notify after insert or update of status on public.invites
  for each row execute function public.invites_notify();

-- ---------------------------------------------------------------------------------------------
-- Delivery: wake the Edge Function. Where it lives and the shared secret it expects are kept in
-- Supabase Vault (set by scripts/push-config.sh or the deploy workflow, never in a migration).
-- Without that config, or without pg_net, rows simply wait in the outbox.
-- ---------------------------------------------------------------------------------------------

do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
end $$;

create or replace function public.kick_push()
returns void language plpgsql security definer set search_path = public as $$
declare
  url text;
  secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then return; end if;
  execute $q$ select decrypted_secret from vault.decrypted_secrets where name = 'push_function_url' $q$ into url;
  execute $q$ select decrypted_secret from vault.decrypted_secrets where name = 'push_function_secret' $q$ into secret;
  if url is null or secret is null then return; end if;
  execute $q$ select net.http_post(url := $1, headers := $2, body := '{}'::jsonb, timeout_milliseconds := 10000) $q$
    using url, jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret);
exception when others then
  -- A push must never be able to fail a promise. The sweep tries again within a minute.
  raise warning 'kick_push: %', sqlerrm;
end $$;

create or replace function public.notifications_kick()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform kick_push();
  return null;
end $$;

create trigger notifications_kick after insert on public.notifications
  for each statement execute function public.notifications_kick();

-- The Edge Function takes a batch. Claiming is one statement, so two overlapping runs can never
-- send the same row; a claim that was never finished (a crashed run) is released after 2 minutes.
-- Rows older than an hour are not worth a buzz any more and are left alone.
create or replace function public.claim_notifications(p_limit int default 100)
returns setof public.notifications language sql security definer set search_path = public as $$
  update notifications n set claimed_at = now(), attempts = attempts + 1
  where n.id in (
    select id from notifications
    where sent_at is null and attempts < 5 and created_at > now() - interval '1 hour'
      and (claimed_at is null or claimed_at < now() - interval '2 minutes')
    order by id
    limit p_limit
    for update skip locked)
  returning n.*;
$$;

-- Vault config, set from outside (see scripts/push-config.sh). Idempotent.
create or replace function public.set_push_config(p_url text, p_secret text)
returns void language plpgsql security definer set search_path = public as $$
declare
  pair record;
  existing uuid;
begin
  for pair in select * from (values ('push_function_url', p_url), ('push_function_secret', p_secret)) v(name, value) loop
    execute 'select id from vault.secrets where name = $1' into existing using pair.name;
    if existing is null then
      execute 'select vault.create_secret($1, $2)' using pair.value, pair.name;
    else
      execute 'select vault.update_secret($1, $2)' using existing, pair.value;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- The clock learns two things: announce that check-in opened, and retry anything still unsent.
-- The transitions themselves are unchanged from the first migration.
-- ---------------------------------------------------------------------------------------------

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

  -- Check-in window open (ten minutes before the start): tell whoever has not checked in yet.
  insert into notifications (recipient_id, invite_id, kind, title, body)
  select u.id, i.id, 'checkin_open', 'Check-in is open',
         d.title || ' with ' || o.name || '. Check in when you are there, or it counts as a flake.'
  from invites i
  join ideas d on d.id = i.idea_id
  cross join lateral (values (i.from_id, i.to_id), (i.to_id, i.from_id)) u(id, other_id)
  join profiles o on o.id = u.other_id
  where i.status = 'locked'
    and now() >= i.starts_at - interval '10 minutes' and now() <= i.starts_at + interval '30 minutes'
    and u.id <> all (i.check_ins)
  on conflict (invite_id, recipient_id, kind) do nothing;

  -- Anything a failed or missed delivery left behind.
  if exists (select 1 from notifications where sent_at is null and attempts < 5 and created_at > now() - interval '1 hour') then
    perform kick_push();
  end if;
  return n;
end $$;

-- Who may call what. Supabase grants execute on new functions to every API role by default.
revoke all on function public.sweep_invites(), public.queue_notification(uuid, uuid, text, text, text), public.invites_notify(),
  public.kick_push(), public.notifications_kick(), public.claim_notifications(int), public.set_push_config(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.sweep_invites(), public.claim_notifications(int) to service_role;
revoke all on function public.register_push_token(text, text), public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text), public.unregister_push_token(text) to authenticated;
