-- Double micro-dates (docs/build-plan.md, F3; decision D069). Two friends ask two friends: four
-- people, one plan.
--
-- Duos. A person makes a duo link (create_duo_link: three a day, good for one day, one use); a
-- friend who already has a profile opens it in the app and joins (join_duo). Each person is in at
-- most one duo; either can leave (leave_duo), and a block between the two ends it. A person reads
-- only their own duo row; everyone else learns only whether a card has a duo (`has_duo`).
--
-- A double ask is send_invite(..., p_double => true): the server adds my duo partner to my side
-- and the asked person's duo partner to theirs (from_friend, to_friend). Then:
--   * The three others put their pinky out, in any order (`pinkies`); the asker seals it last, as
--     in a plan for two. Any one of the four declining ends it for all, with no flake.
--   * Check-in: each person enters the code of anyone on the other side (WP4's codes). When all
--     four are in, it is kept. When the window closes with at least one person in from each side,
--     it is kept for those who checked in and a no-show for each one who did not; otherwise it is
--     a flake, with a no-show for each missing person. A flake is never on a friend who showed.
--   * The reveal opens only between two people on opposite sides who both checked in.
--   * A block between any two of the four refuses the ask (PL004, which names no one) or ends
--     the plan, and hides it from the two people concerned.

-- ---------------------------------------------------------------------------------------------
-- Duos
-- ---------------------------------------------------------------------------------------------

-- Two rows per duo, one for each person: the primary key keeps everyone in one duo at most.
create table public.duos (
  person uuid primary key references public.profiles (id) on delete cascade,
  partner uuid not null unique references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (person <> partner)
);
alter table public.duos enable row level security;
revoke all on public.duos from anon, authenticated, service_role;
grant select on public.duos to authenticated;
create policy duos_own on public.duos for select to authenticated
  using (person = auth.uid() and not private.blocked_pair(person, partner));

-- Joining and leaving reach the other person's phone without a restart. RLS filters the feed.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.duos;
  end if;
end $$;

create table private.duo_links (
  token text primary key check (token ~ '^[0-9a-f]{16}$'),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 day',
  used_by uuid references public.profiles (id) on delete cascade
);
revoke all on private.duo_links from public, anon, authenticated;

create or replace function private.duo_of(p_person uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select partner from public.duos where person = p_person;
$$;
revoke all on function private.duo_of(uuid) from public, anon, authenticated;

-- What a card says about duos: only whether there is one.
create or replace function private.has_duo(p_person uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.duos where person = p_person);
$$;
revoke all on function private.has_duo(uuid) from public, anon;
grant execute on function private.has_duo(uuid) to authenticated;

create or replace function public.create_duo_link()
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  t text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if not exists (select 1 from profiles where id = me) then raise exception using errcode = 'PL002', message = 'Finish setting up first.'; end if;
  perform private.require_active(me);
  if exists (select 1 from duos where person = me) then
    raise exception using errcode = 'PL088', message = 'You are already in a duo. Leave it first.';
  end if;
  if (select count(*) from private.duo_links where profile_id = me and created_at > now() - interval '1 day') >= 3 then
    raise exception using errcode = 'PL084', message = 'You have made a few links today. Share the ones you have.';
  end if;
  insert into private.duo_links (token, profile_id) values (t, me);
  return t;
end $$;

-- Whose duo link this is (first name), for the friend who opened it. Null when it cannot be joined.
create or replace function public.duo_link_name(p_token text)
returns text language sql stable security definer set search_path = public as $$
  select p.name from private.duo_links l join profiles p on p.id = l.profile_id
  where l.token = p_token and l.expires_at > now() and l.used_by is null and p.suspended_at is null
    and l.profile_id <> auth.uid() and not private.blocked_pair(auth.uid(), l.profile_id)
    and not exists (select 1 from duos d where d.person = l.profile_id);
$$;

create or replace function public.join_duo(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  link private.duo_links;
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if not exists (select 1 from profiles where id = me) then raise exception using errcode = 'PL002', message = 'Finish setting up first.'; end if;
  perform private.require_active(me);
  if exists (select 1 from duos where person = me) then
    raise exception using errcode = 'PL088', message = 'You are already in a duo. Leave it first.';
  end if;
  select * into link from private.duo_links where token = p_token for update;
  if not found or link.expires_at <= now() or link.used_by is not null then
    raise exception using errcode = 'PL089', message = 'This duo link has expired. Ask your friend for a new one.';
  end if;
  if link.profile_id = me or private.blocked_pair(me, link.profile_id)
     or exists (select 1 from duos where person = link.profile_id)
     or exists (select 1 from profiles where id = link.profile_id and suspended_at is not null) then
    raise exception using errcode = 'PL091', message = 'You cannot join this duo.';
  end if;
  begin
    insert into duos (person, partner) values (me, link.profile_id), (link.profile_id, me);
  exception when unique_violation then
    raise exception using errcode = 'PL091', message = 'You cannot join this duo.';
  end;
  update private.duo_links set used_by = me where token = p_token;
  return link.profile_id;
end $$;

-- Leaving ends the duo for both. Plans already made keep their four people.
create or replace function public.leave_duo()
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  delete from duos where person = me or partner = me;
end $$;

revoke all on function public.create_duo_link(), public.duo_link_name(text), public.join_duo(text), public.leave_duo() from public, anon;
grant execute on function public.create_duo_link(), public.duo_link_name(text), public.join_duo(text), public.leave_duo() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Four people on an invite
-- ---------------------------------------------------------------------------------------------

alter table public.invites
  add column from_friend uuid references public.profiles (id) on delete cascade,
  add column to_friend uuid references public.profiles (id) on delete cascade,
  add column pinkies uuid[] not null default '{}',
  add constraint invites_double_check check (
    (from_friend is null and to_friend is null)
    or (from_friend is not null and to_friend is not null
        and from_friend not in (from_id, to_id) and to_friend not in (from_id, to_id, from_friend)));
create index invites_from_friend_idx on public.invites (from_friend) where from_friend is not null;
create index invites_to_friend_idx on public.invites (to_friend) where to_friend is not null;

-- May this person see this invite: they are on it, and have no block with anyone else on it.
create or replace function private.on_invite(p_me uuid, p_from uuid, p_to uuid, p_from_friend uuid, p_to_friend uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_me in (p_from, p_to, p_from_friend, p_to_friend)
     and not exists (select 1 from unnest(array[p_from, p_to, p_from_friend, p_to_friend]) x
                     where x is not null and x <> p_me and private.blocked_pair(p_me, x));
$$;
revoke all on function private.on_invite(uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function private.on_invite(uuid, uuid, uuid, uuid, uuid) to authenticated;

drop policy invites_read_party on public.invites;
create policy invites_read_party on public.invites for select to authenticated
  using (private.on_invite(auth.uid(), from_id, to_id, from_friend, to_friend));

-- Cards: people I share an invite with (any of the four), and my duo partner.
create or replace function private.shares_invite(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (exists (
    select 1 from public.invites i
    where p_a in (i.from_id, i.to_id, i.from_friend, i.to_friend)
      and p_b in (i.from_id, i.to_id, i.from_friend, i.to_friend)
  ) or exists (select 1 from public.duos d where d.person = p_a and d.partner = p_b))
  and not private.blocked_pair(p_a, p_b);
$$;

-- The reveal: a plan for two as before; a double only between opposite sides who both checked in.
drop policy private_after_kept on public.profile_private;
create policy private_after_kept on public.profile_private for select to authenticated
  using (not private.blocked_pair(auth.uid(), profile_id) and exists (
    select 1 from public.invites i
    where i.status = 'kept' and (
      (i.from_friend is null and ((i.from_id = auth.uid() and i.to_id = profile_private.profile_id)
                                  or (i.to_id = auth.uid() and i.from_id = profile_private.profile_id)))
      or (i.from_friend is not null
          and auth.uid() = any (i.check_ins) and profile_private.profile_id = any (i.check_ins)
          and ((auth.uid() in (i.from_id, i.from_friend) and profile_private.profile_id in (i.to_id, i.to_friend))
               or (auth.uid() in (i.to_id, i.to_friend) and profile_private.profile_id in (i.from_id, i.from_friend)))))));

-- A block or a deletion ends every live plan both people are on, whichever seats they hold.
create or replace function private.end_live_invites(p_a uuid, p_b uuid, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  inv invites;
begin
  for inv in
    update invites set status = 'ended', resolved_at = now()
    where p_a in (from_id, to_id, from_friend, to_friend) and p_b in (from_id, to_id, from_friend, to_friend)
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

-- ---------------------------------------------------------------------------------------------
-- The promise functions
-- ---------------------------------------------------------------------------------------------

drop function public.send_invite(uuid, text, timestamptz, text, text, text);
create function public.send_invite(p_to uuid, p_idea text, p_starts_at timestamptz, p_place text, p_note text,
                                   p_venue text default null, p_double boolean default false)
returns invites language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mins int;
  inv invites;
  v_place text := btrim(coalesce(p_place, ''));
  my_friend uuid;
  their_friend uuid;
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  perform private.require_linked(me);
  perform private.require_active(me);
  if p_to = me then raise exception using errcode = 'PL020', message = 'You cannot ask yourself.'; end if;
  if private.blocked_pair(me, p_to) then raise exception using errcode = 'PL004', message = 'That person is not available.'; end if;
  if coalesce(p_double, false) then
    my_friend := private.duo_of(me);
    if my_friend is null then raise exception using errcode = 'PL092', message = 'Make a duo with a friend first.'; end if;
    their_friend := private.duo_of(p_to);
    if their_friend is null then raise exception using errcode = 'PL093', message = 'They do not have a duo right now.'; end if;
    -- Four different people, no block between any two of them, nobody suspended. The refusal names no one.
    if my_friend in (p_to, their_friend) or their_friend = me
       or exists (select 1 from unnest(array[me, my_friend, p_to, their_friend]) a, unnest(array[me, my_friend, p_to, their_friend]) b
                  where a < b and private.blocked_pair(a, b))
       or exists (select 1 from profiles where id in (my_friend, p_to, their_friend) and suspended_at is not null) then
      raise exception using errcode = 'PL004', message = 'That person is not available.';
    end if;
  end if;
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
    insert into invites (from_id, to_id, from_friend, to_friend, idea_id, starts_at, minutes, place, venue_id, note, expires_at)
    values (me, p_to, my_friend, their_friend, p_idea, p_starts_at, mins, v_place, p_venue, left(btrim(coalesce(p_note, '')), 80),
            least(now() + interval '24 hours', p_starts_at))
    returning * into inv;
  exception when unique_violation then
    raise exception using errcode = 'PL024', message = 'You two already have something open.';
  end;
  insert into events (actor_id, invite_id, type, props)
  values (me, inv.id, 'ask_sent', jsonb_strip_nulls(jsonb_build_object('idea', p_idea, 'venue', p_venue, 'double', case when my_friend is not null then true end)));
  return inv;
end $$;
revoke all on function public.send_invite(uuid, text, timestamptz, text, text, text, boolean) from public, anon;
grant execute on function public.send_invite(uuid, text, timestamptz, text, text, text, boolean) to authenticated;

create or replace function public.offer_pinky(p_invite uuid)
returns invites language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv invites;
  idea text;
begin
  perform private.require_linked(me);
  perform private.require_active(me);
  select * into inv from invites where id = p_invite and me in (from_id, to_id, from_friend, to_friend) for update;
  if not found then raise exception using errcode = 'PL030', message = 'That invite is gone.'; end if;
  if inv.status in ('sent', 'half_locked') and now() >= inv.expires_at then raise exception using errcode = 'PL031', message = 'This one expired.'; end if;

  if inv.from_friend is not null then
    -- A double: the three others in any order, then the asker seals it.
    if inv.status not in ('sent', 'half_locked') then raise exception using errcode = 'PL033', message = 'This one is not open any more.'; end if;
    if me = any (inv.pinkies) then return inv; end if;
    if me = inv.from_id then
      if cardinality(inv.pinkies) < 3 then raise exception using errcode = 'PL094', message = 'Wait for the other three, then seal it.'; end if;
      update invites set status = 'locked', locked_at = now(), pinkies = array_append(pinkies, me) where id = inv.id returning * into inv;
      insert into events (actor_id, invite_id, type) values (me, inv.id, 'pinky_out'), (me, inv.id, 'locked');
    else
      update invites set status = 'half_locked', first_pinky_by = coalesce(first_pinky_by, me), pinkies = array_append(pinkies, me)
      where id = inv.id returning * into inv;
      insert into events (actor_id, invite_id, type) values (me, inv.id, 'pinky_out');
      if cardinality(inv.pinkies) = 3 then
        select title into idea from ideas where id = inv.idea_id;
        perform queue_notification(inv.from_id, inv.id, 'pinky_out', 'All three pinkies are out', idea || '. Slide in to seal it.');
      end if;
    end if;
    return inv;
  end if;

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
end $$;

create or replace function public.decline_invite(p_invite uuid)
returns invites language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv invites;
begin
  update invites set status = 'declined', declined_by = me, resolved_at = now()
  where id = p_invite and me in (from_id, to_id, from_friend, to_friend) and status in ('sent', 'half_locked')
  returning * into inv;
  if not found then raise exception using errcode = 'PL033', message = 'This one is not open any more.'; end if;
  insert into events (actor_id, invite_id, type) values (me, inv.id, 'declined');
  return inv;
end $$;

create or replace function public.bail(p_invite uuid)
returns invites language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv invites;
begin
  update invites set status = 'flaked', flaked_by = me, resolved_at = now()
  where id = p_invite and me in (from_id, to_id, from_friend, to_friend) and status = 'locked'
  returning * into inv;
  if not found then raise exception using errcode = 'PL036', message = 'Only a locked plan can be bailed on.'; end if;
  insert into events (actor_id, invite_id, type, props)
  values (me, inv.id, 'bailed', jsonb_build_object('late', now() > inv.starts_at - interval '2 hours'));
  return inv;
end $$;

create or replace function public.my_checkin_code(p_invite uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv invites;
  v_code text;
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  select * into inv from invites i where i.id = p_invite and private.on_invite(me, i.from_id, i.to_id, i.from_friend, i.to_friend);
  if not found or inv.status <> 'locked' then raise exception using errcode = 'PL034', message = 'Nothing to check in to.'; end if;
  if now() < inv.starts_at - interval '10 minutes' or now() > inv.starts_at + interval '30 minutes' then
    raise exception using errcode = 'PL035', message = 'Check-in is not open.';
  end if;
  insert into private.checkin_codes (invite_id, user_id, code)
  values (inv.id, me, lpad(floor(random() * 10000)::int::text, 4, '0'))
  on conflict (invite_id, user_id) do nothing;
  select code into v_code from private.checkin_codes where invite_id = inv.id and user_id = me;
  return v_code;
end $$;

create or replace function public.check_in(p_invite uuid, p_code text)
returns invites language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv invites;
  other_side uuid[];
  mine private.checkin_codes;
  everyone int;
begin
  select * into inv from invites where id = p_invite and me in (from_id, to_id, from_friend, to_friend) for update;
  if not found or inv.status <> 'locked' then raise exception using errcode = 'PL034', message = 'Nothing to check in to.'; end if;
  if now() < inv.starts_at - interval '10 minutes' or now() > inv.starts_at + interval '30 minutes' then
    raise exception using errcode = 'PL035', message = 'Check-in is not open.';
  end if;
  if me = any (inv.check_ins) then return inv; end if;
  -- The people whose code proves I met them: the other person, or anyone on the other side.
  other_side := case
    when inv.from_friend is null then array[case when me = inv.from_id then inv.to_id else inv.from_id end]
    when me in (inv.from_id, inv.from_friend) then array[inv.to_id, inv.to_friend]
    else array[inv.from_id, inv.from_friend] end;
  everyone := case when inv.from_friend is null then 2 else 4 end;

  -- My row carries my wrong tries; it is made here if I have not opened my own code yet.
  insert into private.checkin_codes (invite_id, user_id, code)
  values (inv.id, me, lpad(floor(random() * 10000)::int::text, 4, '0'))
  on conflict (invite_id, user_id) do nothing;
  select * into mine from private.checkin_codes where invite_id = inv.id and user_id = me for update;
  if mine.locked_until > now() then
    raise exception using errcode = 'PL037', message = 'Too many wrong codes. Wait five minutes, then try again.';
  end if;

  if not exists (select 1 from private.checkin_codes where invite_id = inv.id and user_id = any (other_side)) then
    raise exception using errcode = 'PL038', message = 'They have not opened their code yet. Ask them to open the plan.';
  end if;

  if not exists (select 1 from private.checkin_codes where invite_id = inv.id and user_id = any (other_side) and code = btrim(coalesce(p_code, ''))) then
    update private.checkin_codes
    set fails = case when fails + 1 >= 5 then 0 else fails + 1 end,
        locked_until = case when fails + 1 >= 5 then now() + interval '5 minutes' else locked_until end
    where invite_id = inv.id and user_id = me;
    return inv;
  end if;

  update invites set check_ins = array_append(check_ins, me) where id = inv.id returning * into inv;
  insert into events (actor_id, invite_id, type) values (me, inv.id, 'checked_in');
  if cardinality(inv.check_ins) >= everyone then
    update invites set status = 'kept', resolved_at = now() where id = inv.id returning * into inv;
    insert into events (actor_id, invite_id, type) select u, inv.id, 'kept' from unnest(inv.check_ins) u;
  end if;
  return inv;
end $$;

create or replace function public.sweep_invites()
returns integer language plpgsql security definer set search_path = public as $$
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
    missing := array(select u from unnest(array[inv.from_id, inv.to_id, inv.from_friend, inv.to_friend]) u
                     where u is not null and u <> all (inv.check_ins));
    if inv.from_friend is not null
       and (inv.from_id = any (inv.check_ins) or inv.from_friend = any (inv.check_ins))
       and (inv.to_id = any (inv.check_ins) or inv.to_friend = any (inv.check_ins)) then
      -- A double where both sides turned up: kept for those who came, a no-show for each who did not.
      update invites set status = 'kept', resolved_at = now() where id = inv.id;
      insert into events (actor_id, invite_id, type) select u, inv.id, 'kept' from unnest(inv.check_ins) u;
    else
      update invites set status = 'flaked', resolved_at = now(),
             flaked_by = case when cardinality(missing) = 1 then missing[1] end
      where id = inv.id;
    end if;
    insert into events (actor_id, invite_id, type) select u, inv.id, 'no_show' from unnest(missing) u;
    n := n + 1;
  end loop;

  -- Check-in window open (ten minutes before the start): tell whoever has not checked in yet.
  insert into notifications (recipient_id, invite_id, kind, title, body)
  select u.id, i.id, 'checkin_open', 'Check-in is open',
         d.title || ' with ' || o.name || case when i.from_friend is not null then ' and their friend' else '' end
         || '. Check in when you are there, or it counts as a flake.'
  from invites i
  join ideas d on d.id = i.idea_id
  cross join lateral (values (i.from_id, i.to_id), (i.to_id, i.from_id), (i.from_friend, i.to_id), (i.to_friend, i.from_id)) u(id, other_id)
  join profiles o on o.id = u.other_id
  where i.status = 'locked' and u.id is not null
    and now() >= i.starts_at - interval '10 minutes' and now() <= i.starts_at + interval '30 minutes'
    and u.id <> all (i.check_ins)
  on conflict (invite_id, recipient_id, kind) do nothing;

  -- Anything a failed or missed delivery left behind.
  if exists (select 1 from notifications where sent_at is null and attempts < 5 and created_at > now() - interval '1 hour') then
    perform kick_push();
  end if;
  return n;
end $$;

create or replace function public.invites_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  idea text;
  from_name text;
  to_name text;
  ff_name text;
  tf_name text;
  bailer text;
  other uuid;
  person uuid;
begin
  if tg_op = 'UPDATE' and new.status = old.status then return null; end if;
  select title into idea from ideas where id = new.idea_id;
  select name into from_name from profiles where id = new.from_id;
  select name into to_name from profiles where id = new.to_id;

  if new.from_friend is not null then
    select name into ff_name from profiles where id = new.from_friend;
    select name into tf_name from profiles where id = new.to_friend;
    if new.status = 'sent' then
      perform queue_notification(new.to_id, new.id, 'new_ask', from_name || ' and ' || ff_name || ' asked you and ' || tf_name, idea || '. A double: lock it or pass.');
      perform queue_notification(new.to_friend, new.id, 'new_ask', from_name || ' and ' || ff_name || ' asked you and ' || to_name, idea || '. A double: lock it or pass.');
      perform queue_notification(new.from_friend, new.id, 'new_ask', from_name || ' asked ' || to_name || ' and ' || tf_name || ' for you two', idea || '. Put your pinky out.');
    elsif new.status = 'locked' then
      foreach person in array array[new.from_friend, new.to_id, new.to_friend] loop
        perform queue_notification(person, new.id, 'locked', 'The double is locked', idea || ' is a promise now. Be there.');
      end loop;
    elsif new.status = 'flaked' and now() <= new.starts_at + interval '30 minutes' then
      select name into bailer from profiles where id = new.flaked_by;
      foreach person in array array[new.from_id, new.to_id, new.from_friend, new.to_friend] loop
        if person <> new.flaked_by then
          perform queue_notification(person, new.id, 'bailed', bailer || ' bailed', idea || ' is off. Their score takes the hit, not yours.');
        end if;
      end loop;
    elsif new.status in ('flaked', 'kept') then
      -- The window closed. Each missing person hears it is on their record; a flake tells the rest.
      foreach person in array array[new.from_id, new.to_id, new.from_friend, new.to_friend] loop
        if person <> all (new.check_ins) then
          perform queue_notification(person, new.id, 'missed', 'Promise missed', 'Check-in for ' || idea || ' closed without you. That is on your record.');
        elsif new.status = 'flaked' then
          perform queue_notification(person, new.id, 'no_show', 'The double fell through', 'Not enough people showed for ' || idea || '. Your score is fine.');
        end if;
      end loop;
    end if;
    return null;
  end if;

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

-- Ratings: on a double, only those who checked in; round two is a two-person thing.
create or replace function public.rate_date(p_invite uuid, p_worth boolean, p_again boolean, p_unsafe boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if not exists (select 1 from invites where id = p_invite and status = 'kept'
                 and ((from_friend is null and me in (from_id, to_id)) or (from_friend is not null and me = any (check_ins)))) then
    raise exception using errcode = 'PL074', message = 'Only a kept promise can be rated.';
  end if;
  if p_worth is null or p_again is null then
    raise exception using errcode = 'PL075', message = 'Answer both questions.';
  end if;
  -- Once only: a second answer changes nothing.
  insert into date_ratings (invite_id, user_id, worth, again, unsafe) values (p_invite, me, p_worth, p_again, coalesce(p_unsafe, false))
  on conflict (invite_id, user_id) do nothing;
end $$;

create or replace function public.date_feedback(p_invite uuid)
returns table (rated boolean, round_two boolean) language sql stable security definer set search_path = public as $$
  select exists (select 1 from date_ratings where invite_id = p_invite and user_id = auth.uid()),
         (select count(*) = 2 and bool_and(again) from date_ratings r
          where r.invite_id = p_invite
            and exists (select 1 from invites i where i.id = p_invite and i.from_friend is null
                        and auth.uid() in (i.from_id, i.to_id) and not private.blocked_pair(i.from_id, i.to_id)));
$$;

-- Safety and account: a block also ends a duo; a report may attach any plan both are on.
create or replace function public.block_user(p_profile uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if p_profile = me then raise exception using errcode = 'PL010', message = 'You cannot block yourself.'; end if;
  if not exists (select 1 from profiles where id = me) then raise exception using errcode = 'PL002', message = 'Finish setting up first.'; end if;
  if not exists (select 1 from profiles where id = p_profile) then raise exception using errcode = 'PL003', message = 'That person is not around any more.'; end if;
  insert into blocks (blocker_id, blocked_id) values (me, p_profile) on conflict do nothing;
  delete from duos where (person = me and partner = p_profile) or (person = p_profile and partner = me);
  perform private.end_live_invites(me, p_profile, 'block');
end $$;

create or replace function public.report_user(p_profile uuid, p_reason text, p_detail text default '', p_invite uuid default null)
returns void language plpgsql security definer set search_path = public as $$
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
  where id = p_invite and me in (from_id, to_id, from_friend, to_friend) and p_profile in (from_id, to_id, from_friend, to_friend);
  insert into reports (reporter_id, reported_id, invite_id, reason, detail)
  values (me, p_profile, inv, p_reason, btrim(coalesce(p_detail, '')));
  insert into blocks (blocker_id, blocked_id) values (me, p_profile) on conflict do nothing;
  delete from duos where (person = me and partner = p_profile) or (person = p_profile and partner = me);
  perform private.end_live_invites(me, p_profile, 'block');
end $$;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  other uuid;
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  for other in
    select distinct x from invites i, unnest(array[i.from_id, i.to_id, i.from_friend, i.to_friend]) x
    where me in (i.from_id, i.to_id, i.from_friend, i.to_friend) and i.status in ('sent', 'half_locked', 'locked')
      and x is not null and x <> me
  loop
    perform private.end_live_invites(me, other, 'account_deleted');
  end loop;
  -- The log keeps the row and loses the person. app_open props come from the phone, so they go.
  update events set actor_id = null, props = case when type = 'app_open' then '{}'::jsonb else props end
  where actor_id = me;
  delete from auth.users where id = me;
  -- An onboarding that never finished has no auth row left to cascade from, but may have a profile.
  delete from profiles where id = me;
end $$;

-- The card says whether this person has a duo (so a double can be offered), never with whom.
drop function public.discover(int);
drop view public.profile_cards;
create view public.profile_cards with (security_invoker = true) as
select p.id, p.name, p.age, p.city, p.area, p.pronouns, p.tagline, p.vibes, p.idea_ids, p.palette, p.glyph, p.photo_count, p.created_at,
       coalesce(t.score, 100) as trust_score,
       coalesce(t.kept, 0) as kept,
       coalesce(t.flaked, 0) as flaked,
       t.computed_at as trust_computed_at,
       t.median_answer_minutes,
       p.country,
       p.free_windows,
       vs.n as vouch_count,
       vs.top as vouch_phrases,
       private.has_duo(p.id) as has_duo
from public.profiles p
left join public.trust_scores t on t.profile_id = p.id
cross join lateral private.vouch_summary(p.id) vs;
revoke all on public.profile_cards from anon, authenticated;
grant select on public.profile_cards to authenticated;

create function public.discover(p_limit integer default 20)
returns setof profile_cards language plpgsql security definer set search_path = public as $$
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
end $$;
revoke all on function public.discover(int) from public, anon;
grant execute on function public.discover(int) to authenticated;

-- The export lists every plan I am on, in any seat, and my duo.
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
    'format', 'pinkilock-export-3',
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'phone', u.phone, 'email', nullif(u.email, ''), 'created_at', u.created_at, 'is_anonymous', u.is_anonymous)
                from auth.users u where u.id = me),
    'profile', (select to_jsonb(p) from profiles p where p.id = me),
    'contact', (select jsonb_build_object('kind', c.contact_kind, 'handle', c.contact_handle, 'photos', c.photos)
                from profile_private c where c.profile_id = me),
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
end $$;
