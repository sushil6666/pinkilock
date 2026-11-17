-- Tracing (docs/build-plan.md, WP0b): one id that links a tap on a phone to the database change it
-- caused, the push it sent, and any error the phone saw.
--
--   * The app sends an `x-trace-id` header (8 characters, 0-9 and A-Z) with each action. PostgREST
--     hands request headers to Postgres; private.request_trace() reads that one header and accepts
--     it only in that exact shape, so nothing else can be written into the log through it.
--   * Triggers stamp it on every `events` row (props.trace) and every `notifications` row (trace),
--     whichever function wrote them. The push function logs it.
--   * `client_errors`: what went wrong on a phone (an error code, the trace id, the screen, the app
--     version). Written only through log_client_error, readable by no client role, kept 30 days.
--   * private.invite_timeline(invite): everything that happened to one invite, in order. For
--     operators with the database role; the API cannot call it (OPERATIONS.md, "Trace a bug").
--
-- Nothing here stores content: ids, codes, routes and times only.

-- ---------------------------------------------------------------------------------------------
-- The trace id of the current request
-- ---------------------------------------------------------------------------------------------

create or replace function private.request_trace()
returns text language plpgsql stable set search_path = '' as $$
declare
  t text;
begin
  t := nullif(current_setting('request.headers', true), '')::json ->> 'x-trace-id';
  if t ~ '^[0-9A-Z]{8}$' then return t; end if;
  return null;
exception when others then
  -- A request with no headers, or headers that are not JSON: no trace, never an error.
  return null;
end $$;
revoke all on function private.request_trace() from public, anon, authenticated;

create or replace function private.stamp_event_trace()
returns trigger language plpgsql set search_path = '' as $$
declare
  t text := private.request_trace();
begin
  if t is not null then new.props := coalesce(new.props, '{}'::jsonb) || jsonb_build_object('trace', t); end if;
  return new;
end $$;
revoke all on function private.stamp_event_trace() from public, anon, authenticated;

create trigger events_trace before insert on public.events
  for each row execute function private.stamp_event_trace();

alter table public.notifications add column trace text check (trace ~ '^[0-9A-Z]{8}$');

create or replace function private.stamp_notification_trace()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.trace := coalesce(new.trace, private.request_trace());
  return new;
end $$;
revoke all on function private.stamp_notification_trace() from public, anon, authenticated;

create trigger notifications_trace before insert on public.notifications
  for each row execute function private.stamp_notification_trace();

-- ---------------------------------------------------------------------------------------------
-- What went wrong on a phone
-- ---------------------------------------------------------------------------------------------

create table public.client_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  -- The account that saw it. Goes with the account when it is deleted.
  user_id uuid references auth.users (id) on delete cascade,
  -- PL: a database function refused. PA: sign-in. PC: the app itself (network, crash, unknown).
  code text not null check (code ~ '^P[LAC][0-9]{3}$'),
  trace text check (trace ~ '^[0-9A-Z]{8}$'),
  -- The screen, as a route pattern or path. Ids only, never content.
  route text not null default '' check (char_length(route) <= 80),
  app_version text not null default '' check (char_length(app_version) <= 40),
  platform text check (platform in ('ios', 'android', 'web'))
);
create index client_errors_at_idx on public.client_errors (at);
create index client_errors_trace_idx on public.client_errors (trace) where trace is not null;
create index client_errors_user_idx on public.client_errors (user_id, at);

-- Readable by no client role, nor the service role: operators read it with the database role.
alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated, service_role;

-- Never raises for a well-formed report, and drops (rather than refuses) reports over the limit,
-- so that a phone in an error loop cannot turn its own reporting into more errors.
create or replace function public.log_client_error(p_code text, p_trace text, p_route text, p_app_version text, p_platform text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if p_code !~ '^P[LAC][0-9]{3}$' or (p_trace is not null and p_trace !~ '^[0-9A-Z]{8}$')
     or char_length(coalesce(p_route, '')) > 80 or char_length(coalesce(p_app_version, '')) > 40
     or (p_platform is not null and p_platform not in ('ios', 'android', 'web')) then
    raise exception using errcode = 'PL050', message = 'That error report was not valid.';
  end if;
  -- 30 an hour per account is plenty to see a pattern, and caps the table.
  if (select count(*) from client_errors where user_id = me and at > now() - interval '1 hour') >= 30 then return; end if;
  insert into client_errors (user_id, code, trace, route, app_version, platform)
  values (me, p_code, p_trace, coalesce(p_route, ''), coalesce(p_app_version, ''), p_platform);
end $$;
revoke all on function public.log_client_error(text, text, text, text, text) from public, anon;
grant execute on function public.log_client_error(text, text, text, text, text) to authenticated;

-- Kept 30 days, then gone.
select cron.schedule('pinkilock-client-errors-retention', '17 3 * * *',
  $$delete from public.client_errors where at < now() - interval '30 days'$$);

-- ---------------------------------------------------------------------------------------------
-- One invite's story, for whoever is tracing a bug
-- ---------------------------------------------------------------------------------------------

create or replace function private.invite_timeline(p_invite uuid)
returns table (at timestamptz, source text, what text, actor uuid, trace text, detail text)
language sql stable security definer set search_path = '' as $$
  select i.created_at, 'invite', 'created, now ' || i.status::text, i.from_id, null::text,
         'starts ' || to_char(i.starts_at, 'YYYY-MM-DD HH24:MI TZ')
  from public.invites i where i.id = p_invite
  union all
  select e.at, 'event', e.type, e.actor_id, e.props ->> 'trace', nullif((e.props - 'trace')::text, '{}')
  from public.events e where e.invite_id = p_invite
  union all
  select n.created_at, 'push', n.kind || case when n.sent_at is not null then ' sent' else ' unsent' end, n.recipient_id, n.trace,
         'attempts ' || n.attempts || coalesce(', ' || n.last_error, '')
  from public.notifications n where n.invite_id = p_invite
  union all
  select c.at, 'phone', c.code, c.user_id, c.trace, c.route || ' ' || c.app_version || ' ' || coalesce(c.platform, '')
  from public.client_errors c
  where c.trace in (select e.props ->> 'trace' from public.events e where e.invite_id = p_invite
                    union select n.trace from public.notifications n where n.invite_id = p_invite)
  order by 1, 2;
$$;
revoke all on function private.invite_timeline(uuid) from public, anon, authenticated;
