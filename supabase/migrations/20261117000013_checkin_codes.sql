-- Check-in that proves two people met (docs/build-plan.md, WP4; gaps G7 and G8).
--
-- When the check-in window opens, each person can see their own 4-digit code for the plan
-- (my_checkin_code). To check in, a person enters the OTHER person's code: in person they show
-- each other the screen; on a video or game plan they read it out. With no chat and no contact
-- before the reveal, the code can only pass between two people who are actually together.
--
--   * Codes live in private.checkin_codes, readable by no client role, never in a push or a
--     Realtime payload, and are deleted when the plan stops being `locked`.
--   * Five wrong codes lock check-in for that person for five minutes (PL037). A wrong code is
--     answered with the plan unchanged rather than an error, because an error would undo the count
--     of wrong tries; the app turns "not checked in" into PL039.
--   * If the other person has not opened their code yet, the answer is PL038.
--
-- The analytics worker (G8) now counts at most one kept promise per pair per 30-day period, and,
-- while the link gate is on, none where either account has no email or phone. It reads two small
-- views for that: analytics.accounts and analytics.settings.

create table private.checkin_codes (
  invite_id uuid not null references public.invites (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  code text not null check (code ~ '^[0-9]{4}$'),
  fails int not null default 0,
  locked_until timestamptz,
  primary key (invite_id, user_id)
);
revoke all on private.checkin_codes from public, anon, authenticated;

-- My code for a plan whose check-in is open. Made the first time it is asked for.
create or replace function public.my_checkin_code(p_invite uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv invites;
  v_code text;
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  select * into inv from invites where id = p_invite and me in (from_id, to_id) and not private.blocked_pair(from_id, to_id);
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
revoke all on function public.my_checkin_code(uuid) from public, anon;
grant execute on function public.my_checkin_code(uuid) to authenticated;

drop function public.check_in(uuid);

create or replace function public.check_in(p_invite uuid, p_code text)
returns public.invites language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv invites;
  other uuid;
  mine private.checkin_codes;
  theirs text;
begin
  select * into inv from invites where id = p_invite and me in (from_id, to_id) for update;
  if not found or inv.status <> 'locked' then raise exception using errcode = 'PL034', message = 'Nothing to check in to.'; end if;
  if now() < inv.starts_at - interval '10 minutes' or now() > inv.starts_at + interval '30 minutes' then
    raise exception using errcode = 'PL035', message = 'Check-in is not open.';
  end if;
  if me = any (inv.check_ins) then return inv; end if;
  other := case when me = inv.from_id then inv.to_id else inv.from_id end;

  -- My row carries my wrong tries; it is made here if I have not opened my own code yet.
  insert into private.checkin_codes (invite_id, user_id, code)
  values (inv.id, me, lpad(floor(random() * 10000)::int::text, 4, '0'))
  on conflict (invite_id, user_id) do nothing;
  select * into mine from private.checkin_codes where invite_id = inv.id and user_id = me for update;
  if mine.locked_until > now() then
    raise exception using errcode = 'PL037', message = 'Too many wrong codes. Wait five minutes, then try again.';
  end if;

  select code into theirs from private.checkin_codes where invite_id = inv.id and user_id = other;
  if not found then
    raise exception using errcode = 'PL038', message = 'They have not opened their code yet. Ask them to open the plan.';
  end if;

  if btrim(coalesce(p_code, '')) <> theirs then
    update private.checkin_codes
    set fails = case when fails + 1 >= 5 then 0 else fails + 1 end,
        locked_until = case when fails + 1 >= 5 then now() + interval '5 minutes' else locked_until end
    where invite_id = inv.id and user_id = me;
    return inv;
  end if;

  update invites set check_ins = array_append(check_ins, me) where id = inv.id returning * into inv;
  insert into events (actor_id, invite_id, type) values (me, inv.id, 'checked_in');
  if cardinality(inv.check_ins) >= 2 then
    update invites set status = 'kept', resolved_at = now() where id = inv.id returning * into inv;
    insert into events (actor_id, invite_id, type) values (inv.from_id, inv.id, 'kept'), (inv.to_id, inv.id, 'kept');
  end if;
  return inv;
end $$;
revoke all on function public.check_in(uuid, text) from public, anon;
grant execute on function public.check_in(uuid, text) to authenticated;

-- Codes go when the plan stops being locked: kept, flaked or ended.
create or replace function private.drop_checkin_codes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'locked' then delete from private.checkin_codes where invite_id = new.id; end if;
  return new;
end $$;
revoke all on function private.drop_checkin_codes() from public, anon, authenticated;
create trigger invites_drop_checkin_codes after update of status on public.invites
  for each row when (old.status = 'locked' and new.status <> 'locked') execute function private.drop_checkin_codes();

-- For the analytics worker: which accounts are linked, and whether the gate is on.
create view analytics.accounts as
  select u.id, not coalesce(u.is_anonymous, false) as linked from auth.users u;
create view analytics.settings as
  select private.config_on('require_linked') as require_linked;
grant select on analytics.accounts, analytics.settings to pinkilock_analytics;
