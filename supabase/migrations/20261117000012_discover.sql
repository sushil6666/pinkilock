-- Discover through a function (docs/build-plan.md, WP3; gap G5).
--
-- Until now any signed-in user could select every profile in one query. Now:
--   * The `profiles` and `trust_scores` read policies return only my own row and the people I
--     share an invite with (any status), never across a block.
--   * Everyone else is reached only through discover(): at most 20 cards a call, in one stable
--     order per person and day, from my city, never someone I passed, blocked or have something live
--     with, and (while the link gate is on) only people with an email or phone linked. At most
--     200 different cards a day reach one account; after that discover() returns only cards it
--     already showed today.
--
-- Realtime keeps working for the rows a person may still read, so a new person in the city no
-- longer arrives live: the app asks discover() again when Discover is opened and every minute
-- while it is open.

-- Do these two people share an invite (any status), and neither has blocked the other?
create or replace function private.shares_invite(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.invites i
    where (i.from_id = p_a and i.to_id = p_b) or (i.from_id = p_b and i.to_id = p_a)
  ) and not private.blocked_pair(p_a, p_b);
$$;
revoke all on function private.shares_invite(uuid, uuid) from public, anon;
grant execute on function private.shares_invite(uuid, uuid) to authenticated;

drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or private.shares_invite(auth.uid(), id));

drop policy trust_read on public.trust_scores;
create policy trust_read on public.trust_scores for select to authenticated
  using (profile_id = auth.uid() or private.shares_invite(auth.uid(), profile_id));

-- Which cards an account has been shown, for the daily ceiling. Kept 2 days.
create table private.discover_seen (
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (user_id, card_id)
);
create index discover_seen_user_at_idx on private.discover_seen (user_id, at);
revoke all on private.discover_seen from public, anon, authenticated;
select cron.schedule('pinkilock-discover-retention', '29 3 * * *', $$delete from private.discover_seen where at < now() - interval '2 days'$$);

create or replace function public.discover(p_limit int default 20)
returns setof public.profile_cards language plpgsql security definer set search_path = public as $$
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
