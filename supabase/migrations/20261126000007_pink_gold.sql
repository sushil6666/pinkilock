-- Pink Gold (D115): the name for Pinkilock's paid members, and a badge on their card so others can
-- see who is a member. The app shows the badge from `Profile.pinkGold` (src/components/PinkGold.tsx);
-- the mock seeds two made-up members so the badge shows with no keys.
--
--   * Bought as a plan (below), or granted by a person on the team with private.pink_gold_grant in
--     the SQL editor and ended with private.pink_gold_end (OPERATIONS.md has the lines). No client role, not the analytics worker and not an Edge
--     Function can read the table or call either function.
--   * A card says only whether its person is Pink Gold now (`pink_gold` on public.profile_cards),
--     never since when, until when or why. The badge rides on the card, so it shows exactly where
--     the card already shows: blocks and the rest of the card's RLS apply unchanged.
--   * Bought through Razorpay (D116, below): plans, Boosts, 15 open asks and a place right after
--     boosted cards on Discover. Nothing in Spicy mode reads it, and it never changes trust.
--   * My own membership (since, until) is in my data download; the note is the team's and is not.

create table private.pink_gold (
  user_id uuid primary key references auth.users (id) on delete cascade,
  since timestamptz not null default now(),
  -- Null: a member until someone ends it.
  until timestamptz,
  -- Why (for the team), e.g. 'founding member'. Never shown to anyone in the app.
  note text check (note is null or char_length(note) <= 200),
  check (until is null or until > since)
);
alter table private.pink_gold enable row level security;
revoke all on private.pink_gold from public, anon, authenticated;

-- What a card says: only whether the person is Pink Gold right now.
create or replace function private.is_pink_gold(p_person uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.pink_gold g where g.user_id = p_person and (g.until is null or g.until > now()));
$$;
revoke all on function private.is_pink_gold(uuid) from public, anon;
grant execute on function private.is_pink_gold(uuid) to authenticated;

-- Make someone Pink Gold from now, until p_until (null: until ended). Run again to change the end
-- date; a membership that had ended starts again from now.
create or replace function private.pink_gold_grant(p_user uuid, p_until timestamptz default null, p_note text default null)
returns void language sql security definer set search_path = '' as $$
  insert into private.pink_gold (user_id, since, until, note)
  values (p_user, now(), p_until, p_note)
  on conflict (user_id) do update
    set since = case when private.is_pink_gold(p_user) then private.pink_gold.since else now() end,
        until = excluded.until,
        note = coalesce(excluded.note, private.pink_gold.note);
$$;
revoke all on function private.pink_gold_grant(uuid, timestamptz, text) from public, anon, authenticated;

-- End someone's Pink Gold now. The row stays, so their download still says they were a member.
create or replace function private.pink_gold_end(p_user uuid)
returns void language sql security definer set search_path = '' as $$
  update private.pink_gold set since = least(since, now() - interval '1 second'), until = now()
  where user_id = p_user and (until is null or until > now());
$$;
revoke all on function private.pink_gold_end(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The card: as in 20261118000002_double_dates.sql, plus `pink_gold` at the end. Adding a column at
-- the end keeps every function that returns cards (discover and the rest) working as it is.
-- ---------------------------------------------------------------------------------------------
create or replace view public.profile_cards with (security_invoker = true) as
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
       private.has_duo(p.id) as has_duo,
       private.is_pink_gold(p.id) as pink_gold
from public.profiles p
left join public.trust_scores t on t.profile_id = p.id
cross join lateral private.vouch_summary(p.id) vs;
revoke all on public.profile_cards from anon, authenticated;
grant select on public.profile_cards to authenticated;

-- =============================================================================================
-- Paying for it (D116): Pink Gold plans and Boosts, bought through Razorpay on the website with
-- the wallet's own order path (the `wallet` Edge Function, wallet_open_order, wallet_paid,
-- wallet_refunded). They are bought in rupees, never with credits, and never touch the balance.
-- The same prices are PLANS and BOOST_PACKS in src/domain/pinkGold.ts.
--
--   * Pink Gold: 1 month ₹699, 3 months ₹1,599, 6 months ₹2,400, 12 months ₹3,300. A plan bought
--     while one is on adds its months to the end. Not a subscription: nothing renews by itself.
--     At most 13 months ahead (PL184).
--   * Boosts: 1 for ₹150, 6 for ₹699. Each must be used within a month of buying, or it lapses.
--     Using one puts my card first on Discover in my city for 24 hours (as before). At most 12
--     waiting (PL186). The old 30-credit Boost is retired: Boosts are bought, or come with Pink Gold.
--   * Members get 2 free Boosts each month (Indian time), good for that month, 15 open asks
--     instead of 3 (plus 2 bought), and come right after boosted cards on Discover.
--   * A refund (from the Razorpay dashboard) takes back the plan's months, or the Boosts not used.
-- =============================================================================================
create or replace function private.shop_item(p_id text, out rupees int, out months int, out boosts int)
language sql immutable set search_path = '' as $$
  select x.rupees, x.months, x.boosts
  from (values ('g1', 699, 1, 0), ('g3', 1599, 3, 0), ('g6', 2400, 6, 0), ('g12', 3300, 12, 0), ('b1', 150, 0, 1), ('b6', 699, 0, 6)) x (id, rupees, months, boosts)
  where x.id = p_id;
$$;
revoke all on function private.shop_item(text) from public, anon, authenticated;

-- A plan's order carries no credits.
alter table private.wallet_orders drop constraint wallet_orders_credits_check;
alter table private.wallet_orders add constraint wallet_orders_credits_check check (credits >= 0);

create table private.boosts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('bought', 'member')),
  -- The order it came with, or 'member:2026-11' for a month's free ones.
  ref text not null,
  slot int not null default 1,
  got_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  unique (user_id, ref, slot)
);
create index boosts_user_idx on private.boosts (user_id, expires_at) where used_at is null;
alter table private.boosts enable row level security;
revoke all on private.boosts from public, anon, authenticated;

-- A member's two free Boosts for this month, once.
create or replace function private.member_boosts(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  ist timestamp := now() at time zone 'Asia/Kolkata';
  month_end timestamptz := (date_trunc('month', ist) + interval '1 month') at time zone 'Asia/Kolkata';
begin
  if p_user is null or not private.is_pink_gold(p_user) then return; end if;
  insert into private.boosts (user_id, source, ref, slot, expires_at)
  select p_user, 'member', 'member:' || to_char(ist, 'YYYY-MM'), s, month_end from generate_series(1, 2) s
  on conflict (user_id, ref, slot) do nothing;
end $$;
revoke all on function private.member_boosts(uuid) from public, anon, authenticated;

create or replace function private.boosts_left(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from private.boosts where user_id = p_user and used_at is null and expires_at > now();
$$;
revoke all on function private.boosts_left(uuid) from public, anon, authenticated;

-- What a plan or a Boost pack gives, once its order is paid.
create or replace function private.shop_deliver(p_user uuid, p_item text, p_order text)
returns void language plpgsql security definer set search_path = public as $$
declare
  it record;
begin
  select * into it from private.shop_item(p_item);
  if it.months > 0 then
    insert into private.pink_gold (user_id, since, until) values (p_user, now(), now() + it.months * interval '1 month')
    on conflict (user_id) do update
      set since = case when private.is_pink_gold(p_user) then private.pink_gold.since else now() end,
          -- Granted with no end date by the team: it stays that way.
          until = case when private.is_pink_gold(p_user) and private.pink_gold.until is null then null
                       else greatest(coalesce(private.pink_gold.until, now()), now()) + it.months * interval '1 month' end;
  end if;
  if it.boosts > 0 then
    insert into private.boosts (user_id, source, ref, slot, expires_at)
    select p_user, 'bought', p_order, s, now() + interval '1 month' from generate_series(1, it.boosts) s
    on conflict (user_id, ref, slot) do nothing;
  end if;
end $$;
revoke all on function private.shop_deliver(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The wallet's order path, as in 20261125000003_wallet.sql, now with plans and Boost packs.
-- ---------------------------------------------------------------------------------------------
create or replace function public.wallet_open_order(p_user uuid, p_pack text, p_order text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  pk record;
  it record;
  w private.wallets;
begin
  if not exists (select 1 from profiles where id = p_user) then raise exception using errcode = 'PL002', message = 'Finish setting up first.'; end if;
  select * into it from private.shop_item(p_pack);
  if it.rupees is not null then
    if it.months > 0 and exists (select 1 from private.pink_gold g where g.user_id = p_user and private.is_pink_gold(p_user)
                                 and (g.until is null or g.until + it.months * interval '1 month' > now() + interval '13 months')) then
      raise exception using errcode = 'PL184', message = 'You have Pink Gold for a year already.';
    end if;
    if it.boosts > 0 and (select count(*) from private.boosts b where b.user_id = p_user and b.source = 'bought' and b.used_at is null and b.expires_at > now()) + it.boosts > 12 then
      raise exception using errcode = 'PL186', message = 'You have a lot of Boosts waiting. Use some first.';
    end if;
    insert into private.wallet_orders (order_id, user_id, pack, paise, credits) values (p_order, p_user, p_pack, it.rupees * 100, 0);
    return jsonb_build_object('order', p_order, 'paise', it.rupees * 100, 'credits', 0, 'months', it.months, 'boosts', it.boosts);
  end if;
  select * into pk from private.wallet_pack(p_pack);
  if pk.credits is null then raise exception using errcode = 'PL136', message = 'Pick a pack from the list.'; end if;
  select * into w from private.wallets where user_id = p_user;
  if coalesce(w.paid, 0) + pk.credits > 2000 then
    raise exception using errcode = 'PL137', message = 'Your wallet is full. Spend some credits first.';
  end if;
  insert into private.wallet_orders (order_id, user_id, pack, paise, credits) values (p_order, p_user, p_pack, pk.rupees * 100, pk.credits);
  return jsonb_build_object('order', p_order, 'paise', pk.rupees * 100, 'credits', pk.credits);
end $$;

create or replace function public.wallet_pack_price(p_pack text)
returns int language sql immutable security definer set search_path = public as $$
  select coalesce((select rupees from private.wallet_pack(p_pack)), (select rupees from private.shop_item(p_pack))) * 100;
$$;

create or replace function public.wallet_paid(p_order text, p_payment text, p_paise int)
returns text language plpgsql security definer set search_path = public as $$
declare
  o private.wallet_orders;
begin
  select * into o from private.wallet_orders where order_id = p_order for update;
  if not found then return 'unknown'; end if;
  if o.status <> 'created' then return o.status; end if;
  if p_paise <> o.paise then return 'mismatch'; end if;
  update private.wallet_orders set status = 'paid', payment_id = p_payment, paid_at = now() where order_id = p_order;
  if o.user_id is not null then
    if (select rupees from private.shop_item(o.pack)) is not null then
      perform private.shop_deliver(o.user_id, o.pack, p_order);
    else
      perform private.wallet_move(o.user_id, 'topup', o.credits, 0, p_order);
    end if;
  end if;
  return 'paid';
end $$;

create or replace function public.wallet_refunded(p_payment text)
returns text language plpgsql security definer set search_path = public as $$
declare
  o private.wallet_orders;
  w private.wallets;
  it record;
begin
  select * into o from private.wallet_orders where payment_id = p_payment for update;
  if not found then return 'unknown'; end if;
  if o.status = 'refunded' then return 'refunded'; end if;
  update private.wallet_orders set status = 'refunded', refunded_at = now() where order_id = o.order_id;
  if o.user_id is not null then
    select * into it from private.shop_item(o.pack);
    if it.rupees is not null then
      -- The plan's months come off the end (never before now); Boosts not used yet go.
      if it.months > 0 then
        update private.pink_gold set until = greatest(now(), until - it.months * interval '1 month'),
                                     since = least(since, now() - interval '1 second')
        where user_id = o.user_id and until is not null;
      end if;
      delete from private.boosts where user_id = o.user_id and ref = o.order_id and used_at is null;
    else
      select * into w from private.wallets where user_id = o.user_id for update;
      perform private.wallet_move(o.user_id, 'topup_refund', -least(o.credits, coalesce(w.paid, 0)), 0, o.order_id);
    end if;
  end if;
  return 'refunded';
end $$;

-- ---------------------------------------------------------------------------------------------
-- What the wallet page shows: as before, plus Pink Gold and Boosts.
-- ---------------------------------------------------------------------------------------------
alter function private.wallet_state(uuid) rename to wallet_state_before_pink_gold;
create or replace function private.wallet_state(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select private.wallet_state_before_pink_gold(p_user) || jsonb_build_object(
    'gold', private.is_pink_gold(p_user),
    'gold_until', (select g.until from private.pink_gold g where g.user_id = p_user and private.is_pink_gold(p_user)),
    'boosts', private.boosts_left(p_user),
    'boost_lapses', (select min(b.expires_at) from private.boosts b where b.user_id = p_user and b.used_at is null and b.expires_at > now()));
$$;
revoke all on function private.wallet_state(uuid), private.wallet_state_before_pink_gold(uuid) from public, anon, authenticated;

-- Opening the wallet: as before, and a member's free Boosts for the month arrive.
create or replace function public.my_wallet()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
begin
  perform private.wallet_sweep();
  perform private.member_boosts(me);
  return private.wallet_state(me);
end $$;

-- Use a Boost: my card first on Discover in my city for 24 hours. The one that lapses first goes first.
create or replace function public.wallet_boost()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  b bigint;
begin
  perform private.require_active(me);
  insert into private.wallets (user_id) values (me) on conflict do nothing;
  perform 1 from private.wallets where user_id = me for update;
  if exists (select 1 from private.wallets where user_id = me and boost_until > now()) then
    raise exception using errcode = 'PL133', message = 'Your boost is already on.';
  end if;
  perform private.member_boosts(me);
  select id into b from private.boosts where user_id = me and used_at is null and expires_at > now() order by expires_at, id limit 1 for update;
  if b is null then raise exception using errcode = 'PL185', message = 'You have no Boosts left. Get one first.'; end if;
  update private.boosts set used_at = now() where id = b;
  update private.wallets set boost_until = now() + interval '24 hours' where user_id = me;
  return private.wallet_state(me);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Discover: as in 20261125000003_wallet.sql, with Pink Gold members right after boosted cards.
-- ---------------------------------------------------------------------------------------------
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
      and not exists (select 1 from private.self_love z where z.user_id = c.id and z.paused_until > now())
    -- A fresh order every day, the same all day, and different for every person.
    -- A boosted card (D104) comes first, then Pink Gold members (D115); the rest stay in their fresh daily order.
    order by exists (select 1 from private.wallets w where w.user_id = c.id and w.boost_until > now()) desc,
             -- Then Pink Gold members (D115), each group still in its fresh daily order.
             private.is_pink_gold(c.id) desc,
             md5(me::text || c.id::text || current_date::text)
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


-- ---------------------------------------------------------------------------------------------
-- send_invite: as in 20261125000003_wallet.sql, with 15 open asks for Pink Gold members.
-- ---------------------------------------------------------------------------------------------
create or replace function public.send_invite(p_to uuid, p_idea text, p_starts_at timestamptz, p_place text, p_note text,
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
  -- Pink Gold members (D115): 15 open asks. Everyone else: three, plus the extra ones bought with
  -- credits (two at most, each for a day).
  if private.is_pink_gold(me) then
    if (select count(*) from invites where from_id = me and status in ('sent', 'half_locked')) >= 15 then
      raise exception using errcode = 'PL187', message = 'You have 15 asks open. Wait for an answer first.';
    end if;
  elsif (select count(*) from invites where from_id = me and status in ('sent', 'half_locked')) >= 3 + private.extra_asks(me) then
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


-- ---------------------------------------------------------------------------------------------
-- Early access to new cities (D116): a city marked `early` is open to Pink Gold members (moving there
-- from Me) before it opens to everyone (`active`). None is marked yet; OPERATIONS.md says how.
-- save_profile: as in 20261118000013_areas_by_location.sql, with that one change.
-- ---------------------------------------------------------------------------------------------
alter table public.cities add column early boolean not null default false;

create or replace function public.save_profile(p_name text, p_age integer, p_area text, p_pronouns text, p_tagline text, p_vibes text[], p_idea_ids text[], p_contact_kind text DEFAULT NULL::text, p_contact_handle text DEFAULT NULL::text, p_city text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  me uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_area text := btrim(coalesce(p_area, ''));
  v_pronouns text := btrim(coalesce(p_pronouns, ''));
  v_tagline text := btrim(coalesce(p_tagline, ''));
  v_city text;
  v_country text;
  v_vibes text[] := coalesce(p_vibes, '{}');
  v_ideas text[] := coalesce(p_idea_ids, '{}');
  v_handle text := btrim(coalesce(p_contact_handle, ''));
  cur profiles;
  seen_line text;
  line_changed boolean := false;
  line_shown text;
  palettes text[] := array['#FF2E93,#5B0F3A', '#A9D8F7,#4169E1', '#D7FF3E,#2F4A00', '#FF5A36,#5A1400', '#9AA0FF,#151845', '#FFD12E,#3F3000', '#FF2ED1,#3A0A45', '#2EE6C5,#06403A'];
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if (select count(*) from private.actions where user_id = me and kind = 'save_profile' and at > now() - interval '1 day') >= 20 then
    raise exception using errcode = 'PL027', message = 'You have changed your profile a lot today. Try again tomorrow.';
  end if;
  insert into private.actions (user_id, kind) values (me, 'save_profile');
  -- Where (WP8, WP9): the city must be open, in a country that is open. A first profile also needs
  -- the request to come from an open country (when the network says where it comes from) and the
  -- four consents at the current versions.
  v_city := coalesce(nullif(btrim(p_city), ''), (select city from profiles where id = me), 'Mumbai');
  select c.country into v_country from cities c join countries k on k.code = c.country where c.name = v_city and k.active
    -- Early access (D116): a city about to open takes Pink Gold members who already have a profile.
    and (c.active or (c.early and private.is_pink_gold(me) and exists (select 1 from profiles where id = me)));
  if not found then raise exception using errcode = 'PL076', message = 'Pinkilock is not open in that city yet.'; end if;
  if not exists (select 1 from profiles where id = me) then
    if private.request_country() is not null and not exists (select 1 from countries where code = private.request_country() and active) then
      raise exception using errcode = 'PL078', message = 'Pinkilock is not open in your country yet.';
    end if;
    if not private.has_consents(me) then
      raise exception using errcode = 'PL077', message = 'Agree to the terms, the privacy policy and the use of your dating preferences first.';
    end if;
  end if;
  if char_length(v_name) not between 2 and 16 or v_name ~ '[[:digit:][:space:][:punct:]]' then
    raise exception using errcode = 'PL060', message = 'Use your first name: letters only, 2 to 16.';
  end if;
  if p_age is null or p_age not between 18 and 99 then
    raise exception using errcode = 'PL061', message = 'You need to be 18 or older.';
  end if;
  if cardinality(v_vibes) > 3 or cardinality(v_vibes) <> (select count(distinct v) from unnest(v_vibes) v)
     or exists (select 1 from unnest(v_vibes) v where v not in (select label from vibes)) then
    raise exception using errcode = 'PL062', message = 'Pick up to three tags from the list.';
  end if;
  if cardinality(v_ideas) not between 3 and 6 or cardinality(v_ideas) <> (select count(distinct i) from unnest(v_ideas) i)
     or exists (select 1 from unnest(v_ideas) i where i not in (select id from ideas)) then
    raise exception using errcode = 'PL063', message = 'Pick three to six things you are up for.';
  end if;
  if char_length(v_area) > 40 or char_length(v_pronouns) > 20 or char_length(v_tagline) > 80 then
    raise exception using errcode = 'PL064', message = 'That is too long.';
  end if;
  if private.looks_like_contact(v_tagline) or private.looks_like_contact(v_area) or private.looks_like_contact(v_pronouns) then
    raise exception using errcode = 'PL065', message = 'Contacts unlock after a kept promise. Take that out.';
  end if;
  if p_contact_kind is not null or p_contact_handle is not null then
    -- A kind offered in this person's country (contact_kinds, WP9).
    if p_contact_kind is null or v_handle = ''
       or not exists (select 1 from contact_kinds k where k.kind = p_contact_kind and (k.countries is null or v_country = any (k.countries))) then
      raise exception using errcode = 'PL066', message = 'Add how people reach you after a kept promise.';
    end if;
    v_handle := private.normalize_contact(p_contact_kind, v_handle);
  elsif not exists (select 1 from profile_private where profile_id = me) then
    raise exception using errcode = 'PL066', message = 'Add how people reach you after a kept promise.';
  end if;
  -- The area (WP1, D087): from the city's list, or a plain place name of the person's own. A move
  -- to another city cannot keep the old city's area (PL095). What is already saved stays valid.
  if v_area <> '' and exists (select 1 from areas a where a.city = v_city)
     and not exists (select 1 from areas a where a.city = v_city and a.name = v_area) then
    if v_city is distinct from (select city from profiles where id = me) and v_area = (select area from profiles where id = me) then
      raise exception using errcode = 'PL095', message = 'Pick an area in your new city.';
    end if;
    if v_area is distinct from (select area from profiles where id = me) then
      if not private.custom_area_ok(v_area) then
        raise exception using errcode = 'PL106', message = 'Name your area in letters: 3 to 30, up to 4 words.';
      end if;
      insert into private.area_requests (city, name) values (v_city, v_area)
      on conflict (city, name) do update set people = private.area_requests.people + 1, last_at = now();
    end if;
  end if;
  if v_pronouns <> '' and v_pronouns is distinct from (select pronouns from profiles where id = me)
     and not exists (select 1 from pronoun_options o where o.label = v_pronouns) then
    raise exception using errcode = 'PL096', message = 'Pick your pronouns from the list.';
  end if;
  -- What is on offer where I live (WP9): an idea with countries is only for people in those. One
  -- already saved stays, so a profile is never locked out of editing by a change to the catalogue.
  if exists (select 1 from unnest(v_ideas) i join ideas d on d.id = i
             where d.countries is not null and not (v_country = any (d.countries))
               and not (i = any (coalesce((select idea_ids from profiles where id = me), '{}')))) then
    raise exception using errcode = 'PL104', message = 'Pick things that are on offer where you live.';
  end if;

  -- Change limits (WP1): a name once in 30 days, the line and the city once in 7 (the first ones are free). A
  -- suspended account changes nothing; a line removed by a moderator cannot be replaced for 30 days.
  select * into cur from profiles where id = me;
  seen_line := coalesce((select r.text from private.line_reviews r where r.profile_id = me and r.status in ('pending', 'held')), cur.tagline, '');
  line_changed := cur.id is not null and v_tagline <> seen_line;
  if cur.id is not null then
    if cur.suspended_at is not null then
      raise exception using errcode = 'PL072', message = 'This account is paused while we look at a report.';
    end if;
    if v_name <> cur.name and cur.name_changed_at > now() - interval '30 days' then
      raise exception using errcode = 'PL070', message = 'You changed your name recently. You can change it again 30 days after.';
    end if;
    if line_changed and v_tagline <> '' and cur.tagline_locked_until > now() then
      raise exception using errcode = 'PL073', message = 'Your line was removed after a report. You can add one again later.';
    end if;
    if v_city <> cur.city and cur.city_changed_at > now() - interval '7 days' then
      raise exception using errcode = 'PL105', message = 'You moved city this week. You can move again 7 days after.';
    end if;
    if line_changed and cur.tagline_changed_at > now() - interval '7 days' then
      raise exception using errcode = 'PL071', message = 'You changed your line this week. You can change it again 7 days after.';
    end if;
  end if;

  -- The line others see. With review on, a new line waits in private.line_reviews and the card
  -- keeps the last approved one (none for a new profile). Removing the line needs no review.
  line_shown := coalesce(cur.tagline, '');
  if cur.id is null or line_changed then
    delete from private.line_reviews where profile_id = me and status in ('pending', 'held');
    if v_tagline = '' or coalesce(private.config_text('line_review'), 'off') not in ('human', 'ai') then
      line_shown := v_tagline;
    else
      insert into private.line_reviews (profile_id, text) values (me, v_tagline)
      on conflict (profile_id) do update set text = excluded.text, status = 'pending', reason = null, created_at = now(),
        decided_at = null, decided_by = null, claimed_at = null, attempts = 0;
    end if;
  end if;

  insert into profiles (id, name, age, area, pronouns, tagline, vibes, idea_ids, palette, city, country)
  values (me, v_name, p_age, v_area, v_pronouns, line_shown, v_vibes, v_ideas,
          string_to_array(palettes[1 + abs(hashtext(me::text)) % cardinality(palettes)], ','), v_city, v_country)
  on conflict (id) do update set name = excluded.name, age = excluded.age, area = excluded.area, pronouns = excluded.pronouns,
    city = excluded.city, country = excluded.country,
    tagline = excluded.tagline, vibes = excluded.vibes, idea_ids = excluded.idea_ids,
    name_changed_at = case when excluded.name <> profiles.name then now() else profiles.name_changed_at end,
    city_changed_at = case when excluded.city <> profiles.city then now() else profiles.city_changed_at end,
    tagline_changed_at = case when line_changed then now() else profiles.tagline_changed_at end;

  if p_contact_kind is not null then
    insert into profile_private (profile_id, contact_kind, contact_handle) values (me, p_contact_kind, v_handle)
    on conflict (profile_id) do update set contact_kind = excluded.contact_kind, contact_handle = excluded.contact_handle,
      contact_verified_at = case when (profile_private.contact_kind, profile_private.contact_handle) = (excluded.contact_kind, excluded.contact_handle)
                                 then profile_private.contact_verified_at end;
  end if;
end $$;


-- ---------------------------------------------------------------------------------------------
-- The data download: whatever came before, plus my Pink Gold membership. One key is added and the
-- format name is kept, so this sits on top of any later format without clashing with it.
-- ---------------------------------------------------------------------------------------------
alter function public.export_my_data() rename to export_before_pink_gold;
alter function public.export_before_pink_gold() set schema private;
revoke all on function private.export_before_pink_gold() from public, anon, authenticated;

create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  return private.export_before_pink_gold() || jsonb_build_object(
    'pink_gold', (select jsonb_build_object('since', g.since, 'until', g.until, 'now', private.is_pink_gold(me))
                  from private.pink_gold g where g.user_id = me),
    'boosts', coalesce((select jsonb_agg(jsonb_build_object('source', b.source, 'got_at', b.got_at, 'expires_at', b.expires_at, 'used_at', b.used_at) order by b.got_at)
                        from private.boosts b where b.user_id = me), '[]'));
end $$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
