-- Ratings, round two, the satisfaction figure, and the answer-time badge (docs/build-plan.md,
-- WP7 and the market review).
--
--   * After a kept promise each person answers, once: "Worth showing up?" (yes/no), "See them
--     again?" (yes/not this time), and whether they felt unsafe. Stored in `date_ratings`, which no
--     client role can read. The other person never sees the answers and they never touch a Trust
--     Score. round_two_ready() is true only when both said they want to meet again; it never says no.
--   * The analytics worker writes the 28-day satisfaction figure to analytics.satisfaction_daily,
--     and leaves the rate empty under 50 answers.
--   * profile_cards gains median_answer_minutes for the "usually answers in" badge. The view is
--     rebuilt with an explicit column list, and the profiles table now grants only those columns:
--     the moderation columns (strikes, suspension, change dates) are no longer readable by clients.

create table public.date_ratings (
  invite_id uuid not null references public.invites (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  worth boolean not null,
  again boolean not null,
  unsafe boolean not null default false,
  at timestamptz not null default now(),
  primary key (invite_id, user_id)
);
alter table public.date_ratings enable row level security;
revoke all on public.date_ratings from anon, authenticated, service_role;
grant select on public.date_ratings to pinkilock_analytics;

create or replace function public.rate_date(p_invite uuid, p_worth boolean, p_again boolean, p_unsafe boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if not exists (select 1 from invites where id = p_invite and status = 'kept' and me in (from_id, to_id)) then
    raise exception using errcode = 'PL074', message = 'Only a kept promise can be rated.';
  end if;
  if p_worth is null or p_again is null then
    raise exception using errcode = 'PL075', message = 'Answer both questions.';
  end if;
  -- Once only: a second answer changes nothing.
  insert into date_ratings (invite_id, user_id, worth, again, unsafe) values (p_invite, me, p_worth, p_again, coalesce(p_unsafe, false))
  on conflict (invite_id, user_id) do nothing;
end $$;

-- What I answered (so the screen does not ask twice), and whether both of us want round two.
create or replace function public.date_feedback(p_invite uuid)
returns table (rated boolean, round_two boolean) language sql stable security definer set search_path = public as $$
  select exists (select 1 from date_ratings where invite_id = p_invite and user_id = auth.uid()),
         (select count(*) = 2 and bool_and(again) from date_ratings r
          where r.invite_id = p_invite
            and exists (select 1 from invites i where i.id = p_invite and auth.uid() in (i.from_id, i.to_id) and not private.blocked_pair(i.from_id, i.to_id)));
$$;
revoke all on function public.rate_date(uuid, boolean, boolean, boolean), public.date_feedback(uuid) from public, anon;
grant execute on function public.rate_date(uuid, boolean, boolean, boolean), public.date_feedback(uuid) to authenticated;

create table analytics.satisfaction_daily (
  day date primary key,
  answers_28d int not null,
  yes_28d int not null,
  -- Empty below 50 answers: too few to call it a percentage (build plan, target B).
  rate_28d numeric,
  unsafe_28d int not null,
  computed_at timestamptz not null default now()
);
grant select, insert, update, delete on analytics.satisfaction_daily to pinkilock_analytics;

-- The card, rebuilt with its columns named, plus the answer time.
drop function public.discover(int);
drop view public.profile_cards;
create view public.profile_cards with (security_invoker = true) as
select p.id, p.name, p.age, p.city, p.area, p.pronouns, p.tagline, p.vibes, p.idea_ids, p.palette, p.glyph, p.photo_count, p.created_at,
       coalesce(t.score, 100) as trust_score,
       coalesce(t.kept, 0) as kept,
       coalesce(t.flaked, 0) as flaked,
       t.computed_at as trust_computed_at,
       t.median_answer_minutes
from public.profiles p
left join public.trust_scores t on t.profile_id = p.id;
revoke all on public.profile_cards from anon, authenticated;
grant select on public.profile_cards to authenticated;

-- Clients read only the card's columns from the table itself.
revoke select on public.profiles from authenticated;
grant select (id, name, age, city, area, pronouns, tagline, vibes, idea_ids, palette, glyph, photo_count, created_at) on public.profiles to authenticated;

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
