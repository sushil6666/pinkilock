-- The live feed carries no deletes (gap G24, decision D093).
--
-- Realtime checks RLS by reading the row, and a deleted row cannot be read, so a delete went to
-- every subscriber of the table with the row's id: anyone could listen on `profiles` and learn that
-- an account went away, or on `duos` and learn that two people stopped being a duo.
--
-- Now the publication sends inserts and updates only. Where a phone needs to hear that something
-- of its own went away (a duo left, or an invite whose other person deleted their account), a
-- trigger touches that person's own row in `feed_nudges`. It is an update RLS lets only them see,
-- it says nothing but "look again", and the phone re-reads what RLS now returns.

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime set (publish = 'insert, update');
  end if;
end $$;

create table public.feed_nudges (
  person uuid primary key references public.profiles (id) on delete cascade,
  at timestamptz not null default now()
);
alter table public.feed_nudges enable row level security;
revoke all on public.feed_nudges from anon, authenticated, service_role;
grant select on public.feed_nudges to authenticated;
create policy feed_nudges_own on public.feed_nudges for select to authenticated using (person = auth.uid());

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.feed_nudges;
  end if;
end $$;

-- Only people who still have a profile: an account being deleted gets no row back.
create function private.nudge(p_people uuid[])
returns void language sql security definer set search_path = '' as $$
  insert into public.feed_nudges (person)
  select distinct x from unnest(p_people) x
  where x is not null and exists (select 1 from public.profiles p where p.id = x)
  on conflict (person) do update set at = now();
$$;
revoke all on function private.nudge(uuid[]) from public, anon, authenticated;

create function private.nudge_gone_duos()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.nudge(array(select person from gone union select partner from gone));
  return null;
end $$;
revoke all on function private.nudge_gone_duos() from public, anon, authenticated;
create trigger duos_nudge after delete on public.duos
  referencing old table as gone for each statement execute function private.nudge_gone_duos();

create function private.nudge_gone_invites()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.nudge(array(select unnest(array[from_id, to_id, from_friend, to_friend]) from gone));
  return null;
end $$;
revoke all on function private.nudge_gone_invites() from public, anon, authenticated;
create trigger invites_nudge after delete on public.invites
  referencing old table as gone for each statement execute function private.nudge_gone_invites();
