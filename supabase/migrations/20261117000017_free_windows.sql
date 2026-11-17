-- "When I'm free" (from the market review): a person's usual free windows, on their card. An ask
-- may still pick any time; the app marks times inside the other person's windows. The same ids are
-- FREE_WINDOWS in src/domain/freeWindows.ts.

alter table public.profiles add column free_windows text[] not null default '{}'
  check (free_windows <@ array['wkd_morning', 'wkd_lunch', 'wkd_evening', 'wkd_late', 'wke_morning', 'wke_afternoon', 'wke_evening', 'wke_late']::text[]);
grant select (free_windows) on public.profiles to authenticated;

create or replace function public.save_availability(p_windows text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if not coalesce(p_windows, '{}') <@ array['wkd_morning', 'wkd_lunch', 'wkd_evening', 'wkd_late', 'wke_morning', 'wke_afternoon', 'wke_evening', 'wke_late']::text[] then
    raise exception using errcode = 'PL083', message = 'Pick times from the list.';
  end if;
  update profiles set free_windows = (select coalesce(array_agg(distinct w order by w), '{}') from unnest(coalesce(p_windows, '{}')) w)
  where id = me;
  if not found then raise exception using errcode = 'PL002', message = 'Finish setting up first.'; end if;
end $$;
revoke all on function public.save_availability(text[]) from public, anon;
grant execute on function public.save_availability(text[]) to authenticated;

-- The card gains the windows (the view is rebuilt; discover returns it).
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
       p.free_windows
from public.profiles p
left join public.trust_scores t on t.profile_id = p.id;
revoke all on public.profile_cards from anon, authenticated;
grant select on public.profile_cards to authenticated;

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
revoke all on function public.discover(int) from public, anon;
grant execute on function public.discover(int) to authenticated;
