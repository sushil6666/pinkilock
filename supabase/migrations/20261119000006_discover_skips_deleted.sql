-- Discover while someone deletes their account (decision D097). Found by CI on PR #80: a live
-- test's Discover failed with a foreign key error while another test deleted its users. discover()
-- picks the cards, then records each as shown in private.discover_seen (card_id references
-- auth.users), so an account deleted in between broke the whole page. That card is now skipped.
-- Otherwise as in 20261118000002_double_dates.sql. Test: tests/db/discover_race.sql.

create or replace function public.discover(p_limit integer default 20)
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
      -- The card's account can be deleted between picking it and recording it (another person,
      -- at that moment): skip that card rather than fail the page.
      begin
        insert into private.discover_seen (user_id, card_id) values (me, card.id)
        on conflict (user_id, card_id) do update set at = now();
      exception when foreign_key_violation then
        continue;
      end;
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
