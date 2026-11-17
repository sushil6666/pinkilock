-- Reporting and blocking (Phase 3).
--
-- A block is enforced here, by RLS, and not by the app:
--   * the two people disappear from each other's Discover (profiles, profile_cards, trust_scores);
--   * neither can read any invite between them, and the reveal (profile_private) is closed;
--   * every live invite between them ends as `ended`, which is nobody's flake, and anything the
--     push outbox still had to say about those invites is dropped;
--   * neither can send the other a new ask.
-- Both directions count: if either person blocked the other, the pair is blocked. Only the
-- blocker can lift it. Who blocked whom is never readable by a client: the policies call
-- private.blocked_pair(), which lives in a schema the API does not expose.
--
-- A report goes to public.reports, which no client role can read or write (RLS on, no policy,
-- no grants). It is written only by report_user(), which also blocks. Moderators read it with the
-- database role in the SQL editor; nothing in the app, repo or workflows reads it.
--
-- The rules mirror src/domain/invites.ts (endForBlock) and src/domain/safety.ts.

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

create table public.reports (
  id bigint generated always as identity primary key,
  -- Kept when either account is deleted, with the id gone (see ARCHITECTURE.md section 5).
  reporter_id uuid references public.profiles (id) on delete set null,
  reported_id uuid references public.profiles (id) on delete set null,
  invite_id uuid references public.invites (id) on delete set null,
  reason text not null check (reason in ('fake', 'harassment', 'inappropriate', 'underage', 'unsafe', 'other')),
  detail text not null default '' check (char_length(detail) <= 500),
  created_at timestamptz not null default now(),
  -- For the moderator: open until someone looks at it.
  reviewed_at timestamptz,
  review_note text
);
create index reports_reported_idx on public.reports (reported_id, created_at);
create index reports_reporter_idx on public.reports (reporter_id, created_at);

alter table public.blocks enable row level security;
alter table public.reports enable row level security;
-- The service role (the push Edge Function) has no use for either, so it gets nothing too.
revoke all on public.blocks, public.reports from anon, authenticated, service_role;

-- An `ended` invite is a lifecycle event, not anyone's action, so it is logged without an actor.
alter table public.events drop constraint events_type_check;
alter table public.events add constraint events_type_check check (type in (
  'app_open', 'ask_sent', 'pinky_out', 'locked', 'declined', 'expired', 'checked_in', 'kept', 'bailed', 'no_show', 'ended'));

-- ---------------------------------------------------------------------------------------------
-- The check the policies use. Not reachable through the API (PostgREST exposes only `public`),
-- so nobody can ask it about a pair they are not in.
-- ---------------------------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.blocked_pair(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a)
  );
$$;
revoke all on function private.blocked_pair(uuid, uuid) from public, anon;
grant execute on function private.blocked_pair(uuid, uuid) to authenticated;

-- Ends every live invite between two people: no flake for anyone, no push about it.
create or replace function private.end_live_invites(p_a uuid, p_b uuid, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  inv invites;
begin
  for inv in
    update invites set status = 'ended', resolved_at = now()
    where least(from_id, to_id) = least(p_a, p_b) and greatest(from_id, to_id) = greatest(p_a, p_b)
      and status in ('sent', 'half_locked', 'locked')
    returning *
  loop
    insert into events (invite_id, type, props) values (inv.id, 'ended', jsonb_build_object('reason', p_reason));
    -- Anything still waiting to be pushed about it (a check-in reminder) would only confuse.
    delete from notifications where invite_id = inv.id and sent_at is null;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function private.end_live_invites(uuid, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- RLS: the same policies as before, each with the block added.
-- ---------------------------------------------------------------------------------------------

drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or not private.blocked_pair(auth.uid(), id));

drop policy trust_read on public.trust_scores;
create policy trust_read on public.trust_scores for select to authenticated
  using (profile_id = auth.uid() or not private.blocked_pair(auth.uid(), profile_id));

drop policy invites_read_party on public.invites;
create policy invites_read_party on public.invites for select to authenticated
  using (auth.uid() in (from_id, to_id) and not private.blocked_pair(from_id, to_id));

drop policy private_after_kept on public.profile_private;
create policy private_after_kept on public.profile_private for select to authenticated using (
  not private.blocked_pair(auth.uid(), profile_private.profile_id)
  and exists (
    select 1 from public.invites i
    where i.status = 'kept'
      and ((i.from_id = auth.uid() and i.to_id = profile_private.profile_id)
        or (i.to_id = auth.uid() and i.from_id = profile_private.profile_id))
  )
);

-- ---------------------------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------------------------

create or replace function public.block_user(p_profile uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if p_profile = me then raise exception 'You cannot block yourself.'; end if;
  if not exists (select 1 from profiles where id = me) then raise exception 'Finish setting up first.'; end if;
  if not exists (select 1 from profiles where id = p_profile) then raise exception 'That person is not around any more.'; end if;
  insert into blocks (blocker_id, blocked_id) values (me, p_profile) on conflict do nothing;
  perform private.end_live_invites(me, p_profile, 'block');
end $$;

-- Lifts my block. A block the other person made stays, and ended invites stay ended.
create or replace function public.unblock_user(p_profile uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  delete from blocks where blocker_id = auth.uid() and blocked_id = p_profile;
end $$;

-- The people I blocked, for the unblock list. Only my own blocks, never who blocked me.
create or replace function public.my_blocks()
returns table (profile_id uuid, name text, blocked_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.blocked_id, p.name, b.created_at
  from blocks b join profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

-- Report someone. Always blocks them too: after a report, neither of you sees the other again.
create or replace function public.report_user(p_profile uuid, p_reason text, p_detail text default '', p_invite uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv uuid;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if p_profile = me then raise exception 'You cannot report yourself.'; end if;
  if not exists (select 1 from profiles where id = me) then raise exception 'Finish setting up first.'; end if;
  if not exists (select 1 from profiles where id = p_profile) then raise exception 'That person is not around any more.'; end if;
  if p_reason not in ('fake', 'harassment', 'inappropriate', 'underage', 'unsafe', 'other') then raise exception 'Pick a reason.'; end if;
  if char_length(coalesce(p_detail, '')) > 500 then raise exception 'Keep it under 500 characters.'; end if;
  if (select count(*) from reports where reporter_id = me and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'You have sent a lot of reports today. We are looking at them.';
  end if;
  -- Only an invite the two of you share can be attached; anything else is dropped, not trusted.
  select id into inv from invites
  where id = p_invite and ((from_id = me and to_id = p_profile) or (from_id = p_profile and to_id = me));
  insert into reports (reporter_id, reported_id, invite_id, reason, detail)
  values (me, p_profile, inv, p_reason, btrim(coalesce(p_detail, '')));
  insert into blocks (blocker_id, blocked_id) values (me, p_profile) on conflict do nothing;
  perform private.end_live_invites(me, p_profile, 'block');
end $$;

-- send_invite from the first migration, plus: no asks across a block. The message does not say
-- who blocked whom.
create or replace function public.send_invite(p_to uuid, p_idea text, p_starts_at timestamptz, p_place text, p_note text)
returns public.invites language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mins int;
  inv invites;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if p_to = me then raise exception 'You cannot ask yourself.'; end if;
  if private.blocked_pair(me, p_to) then raise exception 'That person is not available.'; end if;
  if p_starts_at <= now() then raise exception 'Pick a time that has not passed.'; end if;
  select minutes into mins from ideas where id = p_idea;
  if not found then raise exception 'Unknown idea.'; end if;
  if (select count(*) from invites where from_id = me and status in ('sent', 'half_locked')) >= 3 then
    raise exception 'You have 3 asks open. Wait for an answer first.';
  end if;
  begin
    insert into invites (from_id, to_id, idea_id, starts_at, minutes, place, note, expires_at)
    values (me, p_to, p_idea, p_starts_at, mins, btrim(coalesce(p_place, '')), left(btrim(coalesce(p_note, '')), 80),
            least(now() + interval '24 hours', p_starts_at))
    returning * into inv;
  exception when unique_violation then
    raise exception 'You two already have something open.';
  end;
  insert into events (actor_id, invite_id, type, props) values (me, inv.id, 'ask_sent', jsonb_build_object('idea', p_idea));
  return inv;
end $$;

revoke all on function public.block_user(uuid), public.unblock_user(uuid), public.my_blocks(),
  public.report_user(uuid, text, text, uuid), public.send_invite(uuid, text, timestamptz, text, text) from public, anon;
grant execute on function public.block_user(uuid), public.unblock_user(uuid), public.my_blocks(),
  public.report_user(uuid, text, text, uuid), public.send_invite(uuid, text, timestamptz, text, text) to authenticated;
