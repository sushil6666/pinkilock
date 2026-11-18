-- Friend vouches (from the market review). A person makes a link (create_vouch_link: three a day,
-- each good for 7 days and three friends); a friend who opens it, signed in or not, picks one to
-- three phrases from a fixed list (vouch). The card shows how many friends vouched and the phrases
-- they picked most, never who they are. The same phrases are VOUCH_PHRASES in src/domain/vouches.ts.

create table private.vouch_links (
  token text primary key check (token ~ '^[0-9a-f]{16}$'),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  uses int not null default 0
);
revoke all on private.vouch_links from public, anon, authenticated;

create table public.vouches (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  voucher_id uuid not null references auth.users (id) on delete cascade,
  phrases text[] not null check (cardinality(phrases) between 1 and 3 and phrases <@ array['always on time', 'great listener', 'funniest person I know', 'kind to strangers', 'good in a crisis', 'makes everyone comfortable', 'keeps their word', 'gives the best advice']::text[]),
  at timestamptz not null default now(),
  unique (profile_id, voucher_id)
);
alter table public.vouches enable row level security;
revoke all on public.vouches from anon, authenticated, service_role;

create or replace function public.create_vouch_link()
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  t text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if not exists (select 1 from profiles where id = me) then raise exception using errcode = 'PL002', message = 'Finish setting up first.'; end if;
  perform private.require_active(me);
  if (select count(*) from private.vouch_links where profile_id = me and created_at > now() - interval '1 day') >= 3 then
    raise exception using errcode = 'PL084', message = 'You have made a few links today. Share the ones you have.';
  end if;
  insert into private.vouch_links (token, profile_id) values (t, me);
  return t;
end $$;

-- Who the link is for, so the friend knows whom they are vouching for. First name only.
create or replace function public.vouch_link_name(p_token text)
returns text language sql stable security definer set search_path = public as $$
  select p.name from private.vouch_links l join profiles p on p.id = l.profile_id
  where l.token = p_token and l.expires_at > now() and l.uses < 3 and p.suspended_at is null;
$$;

create or replace function public.vouch(p_token text, p_phrases text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  link private.vouch_links;
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  select * into link from private.vouch_links where token = p_token for update;
  if not found or link.expires_at <= now() or link.uses >= 3 then
    raise exception using errcode = 'PL085', message = 'This link has expired. Ask your friend for a new one.';
  end if;
  if link.profile_id = me or private.blocked_pair(me, link.profile_id) then
    raise exception using errcode = 'PL086', message = 'You cannot vouch here.';
  end if;
  if cardinality(coalesce(p_phrases, '{}')) not between 1 and 3 or not p_phrases <@ array['always on time', 'great listener', 'funniest person I know', 'kind to strangers', 'good in a crisis', 'makes everyone comfortable', 'keeps their word', 'gives the best advice']::text[] then
    raise exception using errcode = 'PL087', message = 'Pick one to three from the list.';
  end if;
  insert into vouches (profile_id, voucher_id, phrases) values (link.profile_id, me, (select array_agg(distinct x) from unnest(p_phrases) x))
  on conflict (profile_id, voucher_id) do update set phrases = excluded.phrases, at = now();
  update private.vouch_links set uses = uses + 1 where token = p_token;
end $$;

revoke all on function public.create_vouch_link(), public.vouch_link_name(text), public.vouch(text, text[]) from public, anon;
grant execute on function public.create_vouch_link(), public.vouch_link_name(text), public.vouch(text, text[]) to authenticated;

-- The vouches a card shows: a count and the three phrases picked most. Never who.
create or replace function private.vouch_summary(p_profile uuid)
returns table (n int, top text[]) language sql stable security definer set search_path = '' as $$
  select (select count(*)::int from public.vouches v where v.profile_id = p_profile),
         coalesce((select array_agg(x order by c desc, x) from (
            select x, count(*) as c from public.vouches v, unnest(v.phrases) x where v.profile_id = p_profile group by x order by count(*) desc, x limit 3) s), '{}');
$$;
revoke all on function private.vouch_summary(uuid) from public, anon;
grant execute on function private.vouch_summary(uuid) to authenticated;

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
       vs.top as vouch_phrases
from public.profiles p
left join public.trust_scores t on t.profile_id = p.id
cross join lateral private.vouch_summary(p.id) vs;
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
