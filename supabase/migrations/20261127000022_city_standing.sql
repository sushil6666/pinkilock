-- Where I stand in my city (D122): a private badge for keeping promises, and how my city is doing.
--
--   * My standing: among people in my city with at least 3 kept or missed promises, where my Trust
--     Score puts me (top 1, 5, 10, 25 or 50 percent; nothing below that). Ties go to more kept plans.
--     Only I see mine. There is no list of names: a public leaderboard would show who is on the app
--     and how they behave, and would invite gaming.
--   * It needs at least 20 such people in the city, so a small city never singles anyone out, and I
--     need 3 promises of my own.
--   * My city's month: the share of plans resolved in the last 30 days between two people of my city
--     that were kept, once there are at least 20 of them. A figure about the city, never a person.
--
-- Trust Scores are written by the analytics worker (trust_scores); this reads them and the invites
-- on the server and returns only the caller's own buckets.

create or replace function public.my_city_standing()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  my_city text;
  peers int;
  mine record;
  better int;
  pct numeric;
  top int;
  resolved int;
  kept int;
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  select p.city into my_city from profiles p where p.id = me;
  if not found then raise exception using errcode = 'PL002', message = 'Finish setting up first.'; end if;

  select count(*) into peers
  from profiles p join trust_scores s on s.profile_id = p.id
  where p.city = my_city and s.kept + s.flaked >= 3;

  select s.score, s.kept, s.flaked into mine from trust_scores s where s.profile_id = me;
  if peers >= 20 and mine.score is not null and mine.kept + mine.flaked >= 3 then
    select count(*) into better
    from profiles p join trust_scores s on s.profile_id = p.id
    where p.city = my_city and s.kept + s.flaked >= 3 and p.id <> me
      and (s.score > mine.score or (s.score = mine.score and s.kept > mine.kept));
    pct := (better + 1)::numeric / peers * 100;
    top := case when pct <= 1 then 1 when pct <= 5 then 5 when pct <= 10 then 10 when pct <= 25 then 25 when pct <= 50 then 50 end;
  end if;

  select count(*), count(*) filter (where i.status = 'kept') into resolved, kept
  from invites i join profiles a on a.id = i.from_id join profiles b on b.id = i.to_id
  where i.status in ('kept', 'flaked') and i.starts_at > now() - interval '30 days' and i.starts_at <= now()
    and a.city = my_city and b.city = my_city;

  return jsonb_build_object(
    'city', my_city,
    'ready', peers >= 20,
    'top', top,
    'city_kept_percent', case when resolved >= 20 then round(kept::numeric * 100 / resolved) end
  );
end $$;
revoke all on function public.my_city_standing() from public, anon;
grant execute on function public.my_city_standing() to authenticated;
