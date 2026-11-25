-- The credits wallet (D104): a closed loop. The same rules are in src/domain/wallet.ts (the mock
-- follows it); tests/db/wallet_cases.sql is generated from its shared tables.
--
--   * Credits are bought through Razorpay (the `wallet` Edge Function makes the order and checks
--     Razorpay's signature; only it may call wallet_open_order / wallet_paid / wallet_refunded) or
--     earned as rewards. They are spent only here: a Discover boost, an extra open ask, a stake on a
--     plan, or a treat for the other person on a plan. Never withdrawn, never sent to another
--     person, never turned into money: no payouts of any kind, so no RBI licence and no paying
--     anybody to meet. Nothing here reads or writes Spicy mode.
--   * Two buckets: `paid` (bought) and `earned` (rewards). Spending takes earned first. A stake or a
--     treat that comes back returns to the bucket it came from; a treat takes bought credits only.
--   * Every change is a row in private.wallet_ledger, written only through private.wallet_move, in
--     the same transaction as the balance. A row with a ref happens once (a reward, a stake, an
--     order), so retries and webhooks that arrive twice change nothing.
--   * A stake (50) on a locked plan comes back when the plan is kept, ended (a block, a deleted
--     account), or the other person flaked, or when I bail more than 2 hours before. It is lost on my
--     no-show or a late bail. Lost credits are gone; they never go to the other person.
--   * Treat the plan: on a locked one-to-one plan, I can cover their coffee, dessert or movie at a
--     partner place in our city (public.treat_partners; empty until a partner signs). It is held
--     until the plan is kept; then they get a voucher code to show at the counter, good for a day.
--     If the plan is not kept, they say no thanks, or the voucher is not used, it comes back to me.
--     The other person never gets credits, only the coffee.
--   * Rewards (earned credits, capped at 500): a kept plan (4 a week, once per pair per 30 days), a
--     verified handle, a checked face photo, rating a kept date (leaving a rating, never its answer),
--     a friend's vouch (3 ever), 7 days in a row. Rewards never fire from Spicy mode.
--   * Spicy mode's unlock (D105): once both said yes, the usernames show only when 600 bought credits
--     were paid to Pinkilock for that match: one pays all, or 300 each. Nothing goes to the other
--     person. Taken back (a yes withdrawn, Spicy off, a block, a deleted account) before it is fully
--     paid, what was paid comes back. Rewards never pay for it and never come from it.
--   * No client role and not the analytics worker can read any wallet table. The wallet is in the
--     data download (format 9). Deleting the account deletes the wallet; payment records (orders)
--     stay without the person's id, because tax law keeps them (OPERATIONS.md, "Wallet").

create table private.wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  paid int not null default 0 check (paid >= 0),
  earned int not null default 0 check (earned >= 0),
  boost_until timestamptz
);

create table private.wallet_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('spicy_unlock', 'spicy_back', 'topup', 'topup_refund', 'boost', 'extra_ask', 'stake', 'stake_back', 'stake_lost', 'treat', 'treat_back', 'reward')),
  paid int not null default 0,
  earned int not null default 0,
  ref text,
  reward text check (reward is null or reward in ('kept_plan', 'verified_handle', 'face_checked', 'rated_date', 'vouched', 'week_streak')),
  at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
create index wallet_ledger_user_idx on private.wallet_ledger (user_id, at desc);

-- A payment record. The person's id goes when the account does; the rest stays for the books.
create table private.wallet_orders (
  order_id text primary key check (order_id ~ '^[A-Za-z0-9_]{6,40}$'),
  user_id uuid references auth.users (id) on delete set null,
  provider text not null default 'razorpay' check (provider in ('razorpay', 'play')),
  pack text not null,
  paise int not null check (paise > 0),
  credits int not null check (credits > 0),
  status text not null default 'created' check (status in ('created', 'paid', 'refunded')),
  payment_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz
);

create table private.wallet_extra_asks (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  until timestamptz not null
);

create table private.wallet_stakes (
  invite_id uuid not null references public.invites (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  paid int not null,
  earned int not null,
  at timestamptz not null default now(),
  ended text check (ended is null or ended in ('back', 'lost')),
  primary key (invite_id, user_id)
);

create table private.wallet_visits (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);

create table public.treat_partners (
  id text primary key check (id ~ '^[a-z0-9_]{3,40}$'),
  name text not null check (char_length(name) between 2 and 48),
  city text not null,
  items text[] not null check (cardinality(items) > 0 and items <@ array['coffee', 'dessert', 'movie']),
  -- Switched off, never deleted: old vouchers name it.
  active boolean not null default true
);
alter table public.treat_partners enable row level security;
create policy treat_partners_read on public.treat_partners for select to authenticated using (active);
revoke all on public.treat_partners from public, anon, authenticated;
grant select on public.treat_partners to authenticated;

create table private.wallet_treats (
  invite_id uuid primary key references public.invites (id) on delete cascade,
  giver uuid not null references auth.users (id) on delete cascade,
  receiver uuid not null references auth.users (id) on delete cascade,
  partner text not null references public.treat_partners (id),
  item text not null check (item in ('coffee', 'dessert', 'movie')),
  credits int not null check (credits > 0),
  status text not null default 'held' check (status in ('held', 'ready', 'used', 'back')),
  code text unique check (code is null or code ~ '^[A-Z2-9]{8}$'),
  at timestamptz not null default now(),
  ready_at timestamptz,
  used_at timestamptz,
  check (giver <> receiver)
);

alter table private.wallets enable row level security;
alter table private.wallet_ledger enable row level security;
alter table private.wallet_orders enable row level security;
alter table private.wallet_extra_asks enable row level security;
alter table private.wallet_stakes enable row level security;
alter table private.wallet_visits enable row level security;
alter table private.wallet_treats enable row level security;
revoke all on private.wallets, private.wallet_ledger, private.wallet_orders, private.wallet_extra_asks, private.wallet_stakes,
  private.wallet_visits, private.wallet_treats from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- The prices, as PACKS, COSTS, REWARDS and TREATS in src/domain/wallet.ts.
-- ---------------------------------------------------------------------------------------------
create or replace function private.wallet_pack(p_pack text, out rupees int, out credits int)
language sql immutable set search_path = '' as $$
  select x.rupees, x.credits from (values ('p49', 49, 50), ('p99', 99, 110), ('p199', 199, 240), ('p499', 499, 650)) x (id, rupees, credits)
  where x.id = p_pack;
$$;

create or replace function private.wallet_cost(p_what text)
returns int language sql immutable set search_path = '' as $$
  select case p_what when 'boost' then 30 when 'extra_ask' then 10 when 'stake' then 50
    when 'coffee' then 150 when 'dessert' then 120 when 'movie' then 300 end;
$$;

create or replace function private.wallet_reward_size(p_kind text)
returns int language sql immutable set search_path = '' as $$
  select case p_kind when 'kept_plan' then 20 when 'verified_handle' then 25 when 'face_checked' then 15
    when 'rated_date' then 5 when 'vouched' then 10 when 'week_streak' then 15 end;
$$;

-- Where a stake ends up, as stakeEnd in src/domain/wallet.ts (the shared table runs through both).
create or replace function private.stake_end(p_status text, p_flaked text, p_hours_before numeric)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_status in ('locked', 'sent', 'half_locked') then 'held'
    when p_status <> 'flaked' then 'back'
    when p_flaked = 'them' then 'back'
    when p_flaked = 'me' and p_hours_before > 2 then 'back'
    else 'lost' end;
$$;
revoke all on function private.wallet_pack(text), private.wallet_cost(text), private.wallet_reward_size(text),
  private.stake_end(text, text, numeric) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The one way a balance changes. Returns false when a row with that ref is already there (it
-- happened before) or a reward would add nothing (the earned cap). Short of credits: PL132.
-- ---------------------------------------------------------------------------------------------
create or replace function private.wallet_move(p_user uuid, p_kind text, p_paid int, p_earned int, p_ref text default null, p_reward text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  w private.wallets;
  v_earned int := p_earned;
begin
  insert into private.wallets (user_id) values (p_user) on conflict do nothing;
  select * into w from private.wallets where user_id = p_user for update;
  if p_kind = 'reward' then
    v_earned := least(p_earned, greatest(500 - w.earned, 0));
    if v_earned <= 0 then return false; end if;
  end if;
  if w.paid + p_paid < 0 or w.earned + v_earned < 0 then
    raise exception using errcode = 'PL132', message = 'Not enough credits. Top up or earn some first.';
  end if;
  insert into private.wallet_ledger (user_id, kind, paid, earned, ref, reward) values (p_user, p_kind, p_paid, v_earned, p_ref, p_reward)
  on conflict (user_id, kind, ref) do nothing;
  if not found then return false; end if;
  update private.wallets set paid = paid + p_paid, earned = earned + v_earned where user_id = p_user;
  return true;
end $$;
revoke all on function private.wallet_move(uuid, text, int, int, text, text) from public, anon, authenticated;

-- A spend: earned first, then paid. Returns the split (as split in src/domain/wallet.ts).
create or replace function private.wallet_spend(p_user uuid, p_kind text, p_cost int, p_ref text default null, out paid int, out earned int)
language plpgsql security definer set search_path = public as $$
declare
  w private.wallets;
begin
  insert into private.wallets (user_id) values (p_user) on conflict do nothing;
  select * into w from private.wallets where user_id = p_user for update;
  if w.paid + w.earned < p_cost then
    raise exception using errcode = 'PL132', message = 'Not enough credits. Top up or earn some first.';
  end if;
  earned := least(w.earned, p_cost);
  paid := p_cost - earned;
  perform private.wallet_move(p_user, p_kind, -paid, -earned, p_ref);
end $$;
revoke all on function private.wallet_spend(uuid, text, int, text) from public, anon, authenticated;

create or replace function private.wallet_reward(p_user uuid, p_kind text, p_ref text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then return false; end if;
  return private.wallet_move(p_user, 'reward', 0, private.wallet_reward_size(p_kind), p_kind || ':' || p_ref, p_kind);
end $$;
revoke all on function private.wallet_reward(uuid, text, text) from public, anon, authenticated;

-- Extra open asks I have now.
create or replace function private.extra_asks(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from private.wallet_extra_asks where user_id = p_user and until > now();
$$;
revoke all on function private.extra_asks(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- What the wallet page shows, about one person.
-- ---------------------------------------------------------------------------------------------
create or replace function private.wallet_state(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'paid', coalesce(w.paid, 0),
    'earned', coalesce(w.earned, 0),
    'boost_until', case when w.boost_until > now() then w.boost_until end,
    'extra_asks', private.extra_asks(p_user),
    'stakes', coalesce((select jsonb_object_agg(s.invite_id, s.paid + s.earned) from private.wallet_stakes s where s.user_id = p_user and s.ended is null), '{}'),
    'streak', (with recursive d (day) as (
                 select private.local_today(p_user) where exists (select 1 from private.wallet_visits v where v.user_id = p_user and v.day = private.local_today(p_user))
                 union all
                 select d.day - 1 from d where exists (select 1 from private.wallet_visits v where v.user_id = p_user and v.day = d.day - 1))
               select count(*) from d),
    'had', coalesce((select jsonb_agg(distinct l.reward) from private.wallet_ledger l where l.user_id = p_user and l.reward in ('verified_handle', 'face_checked')), '[]'),
    'vouch_rewards', (select count(*) from private.wallet_ledger l where l.user_id = p_user and l.reward = 'vouched'),
    'kept_this_week', (select count(*) from private.wallet_ledger l where l.user_id = p_user and l.reward = 'kept_plan' and l.at > now() - interval '7 days'),
    'treats', coalesce((select jsonb_agg(jsonb_build_object(
                 'invite', t.invite_id, 'item', t.item, 'credits', t.credits, 'status', t.status,
                 'mine', t.giver = p_user, 'partner', p.name,
                 -- The code is for the person treated, and only while it can be used.
                 'code', case when t.receiver = p_user and t.status = 'ready' then t.code end,
                 'until', case when t.status = 'ready' then t.ready_at + interval '24 hours' end) order by t.at desc)
               from private.wallet_treats t join public.treat_partners p on p.id = t.partner
               where p_user in (t.giver, t.receiver) and not private.blocked_pair(t.giver, t.receiver)), '[]'),
    'history', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'credits', l.paid + l.earned, 'reward', l.reward, 'at', l.at) order by l.at desc, l.id desc)
               from (select * from private.wallet_ledger where user_id = p_user order by at desc, id desc limit 50) l), '[]')
  )
  from (select 1) one left join private.wallets w on w.user_id = p_user;
$$;
revoke all on function private.wallet_state(uuid) from public, anon, authenticated;

-- Vouchers nobody used come back; called by my_wallet and every ten minutes.
create or replace function private.wallet_sweep()
returns int language plpgsql security definer set search_path = public as $$
declare
  t private.wallet_treats;
  n int := 0;
begin
  for t in select * from private.wallet_treats where status = 'ready' and ready_at < now() - interval '24 hours' for update skip locked loop
    update private.wallet_treats set status = 'back' where invite_id = t.invite_id;
    perform private.wallet_move(t.giver, 'treat_back', t.credits, 0, t.invite_id::text);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function private.wallet_sweep() from public, anon, authenticated;
select cron.schedule('pinkilock-wallet', '*/10 * * * *', 'select private.wallet_sweep()');

create or replace function public.my_wallet()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
begin
  perform private.wallet_sweep();
  return private.wallet_state(me);
end $$;

-- Opening the app: today counts for the streak; seven days in a row earns a reward once a week.
create or replace function public.wallet_visit()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  today date := private.local_today(me);
  streak int;
begin
  insert into private.wallet_visits (user_id, day) values (me, today) on conflict do nothing;
  delete from private.wallet_visits where user_id = me and day < today - 30;
  streak := (private.wallet_state(me) ->> 'streak')::int;
  if streak >= 7 and not exists (select 1 from private.wallet_ledger where user_id = me and reward = 'week_streak' and at > now() - interval '6 days') then
    perform private.wallet_reward(me, 'week_streak', today::text);
  end if;
  return private.wallet_state(me);
end $$;

-- My card first on Discover in my city for a day.
create or replace function public.wallet_boost()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
begin
  perform private.require_active(me);
  if exists (select 1 from private.wallets where user_id = me and boost_until > now()) then
    raise exception using errcode = 'PL133', message = 'Your boost is already on.';
  end if;
  perform private.wallet_spend(me, 'boost', private.wallet_cost('boost'));
  update private.wallets set boost_until = now() + interval '24 hours' where user_id = me;
  return private.wallet_state(me);
end $$;

-- One more open ask for a day; two at most. The daily limit and the 7-day rule stay as they are.
create or replace function public.wallet_extra_ask()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
begin
  perform private.require_active(me);
  perform 1 from private.wallets where user_id = me for update;
  if private.extra_asks(me) >= 2 then
    raise exception using errcode = 'PL134', message = 'You have two extra asks already.';
  end if;
  perform private.wallet_spend(me, 'extra_ask', private.wallet_cost('extra_ask'));
  insert into private.wallet_extra_asks (user_id, until) values (me, now() + interval '24 hours');
  delete from private.wallet_extra_asks where user_id = me and until < now() - interval '7 days';
  return private.wallet_state(me);
end $$;

-- A stake on a locked one-to-one plan that has not started.
create or replace function public.wallet_stake(p_invite uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  inv invites;
  s record;
begin
  select * into inv from invites where id = p_invite and me in (from_id, to_id) for update;
  if not found or inv.status <> 'locked' or inv.starts_at <= now() or inv.from_friend is not null then
    raise exception using errcode = 'PL135', message = 'A stake goes on a locked plan before it starts.';
  end if;
  if exists (select 1 from private.wallet_stakes where invite_id = p_invite and user_id = me) then
    raise exception using errcode = 'PL138', message = 'You already staked this plan.';
  end if;
  select * into s from private.wallet_spend(me, 'stake', private.wallet_cost('stake'), p_invite::text);
  insert into private.wallet_stakes (invite_id, user_id, paid, earned) values (p_invite, me, s.paid, s.earned);
  return private.wallet_state(me);
end $$;

-- What I could treat the other person to on this plan: the partners in our city, or nothing.
create or replace function public.treat_options(p_invite uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  inv invites;
  other uuid;
begin
  select * into inv from invites where id = p_invite and me in (from_id, to_id);
  if not found or inv.status <> 'locked' or inv.starts_at <= now() or inv.from_friend is not null
     or exists (select 1 from private.wallet_treats where invite_id = p_invite) then
    return '[]'::jsonb;
  end if;
  other := case when inv.from_id = me then inv.to_id else inv.from_id end;
  if private.blocked_pair(me, other) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('partner', p.id, 'name', p.name, 'items', to_jsonb(p.items)) order by p.name)
    from treat_partners p join profiles a on a.id = me join profiles b on b.id = other
    where p.active and p.city = a.city and p.city = b.city), '[]');
end $$;

-- Cover their coffee, dessert or movie: bought credits, held until the plan is kept.
create or replace function public.treat_plan(p_invite uuid, p_partner text, p_item text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  inv invites;
  other uuid;
  cost int := private.wallet_cost(p_item);
  w private.wallets;
begin
  perform private.require_active(me);
  select * into inv from invites where id = p_invite and me in (from_id, to_id) for update;
  if not found or inv.status <> 'locked' or inv.starts_at <= now() or inv.from_friend is not null or cost is null
     or p_item not in ('coffee', 'dessert', 'movie') then
    raise exception using errcode = 'PL140', message = 'Treats work on a locked plan with a partner place in your city.';
  end if;
  other := case when inv.from_id = me then inv.to_id else inv.from_id end;
  if private.blocked_pair(me, other) or not exists (
       select 1 from treat_partners p join profiles a on a.id = me join profiles b on b.id = other
       where p.id = p_partner and p.active and p_item = any (p.items) and p.city = a.city and p.city = b.city) then
    raise exception using errcode = 'PL140', message = 'Treats work on a locked plan with a partner place in your city.';
  end if;
  if exists (select 1 from private.wallet_treats where invite_id = p_invite) then
    raise exception using errcode = 'PL141', message = 'This plan already has a treat.';
  end if;
  if (select count(*) from private.wallet_treats where giver = me and at > now() - interval '7 days') >= 2 then
    raise exception using errcode = 'PL142', message = 'Two treats a week is plenty.';
  end if;
  insert into private.wallets (user_id) values (me) on conflict do nothing;
  select * into w from private.wallets where user_id = me for update;
  if w.paid < cost then
    raise exception using errcode = 'PL139', message = 'This is paid from bought credits. Top up first.';
  end if;
  perform private.wallet_move(me, 'treat', -cost, 0, p_invite::text);
  insert into private.wallet_treats (invite_id, giver, receiver, partner, item, credits) values (p_invite, me, other, p_partner, p_item, cost);
  return private.wallet_state(me);
end $$;

-- The person treated says no thanks: it goes back to the giver, and nobody is told more than that.
create or replace function public.decline_treat(p_invite uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  t private.wallet_treats;
begin
  select * into t from private.wallet_treats where invite_id = p_invite and receiver = me and status in ('held', 'ready') for update;
  if not found then raise exception using errcode = 'PL143', message = 'That treat is not there any more.'; end if;
  update private.wallet_treats set status = 'back', code = null where invite_id = p_invite;
  perform private.wallet_move(t.giver, 'treat_back', t.credits, 0, p_invite::text);
  return private.wallet_state(me);
end $$;

-- For a partner's till, later (service role only): the code is used once, while it is good.
create or replace function public.redeem_treat(p_partner text, p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  t private.wallet_treats;
begin
  select * into t from private.wallet_treats where code = upper(btrim(p_code)) and partner = p_partner for update;
  if not found then return 'unknown'; end if;
  if t.status = 'used' then return 'used'; end if;
  if t.status <> 'ready' or t.ready_at < now() - interval '24 hours' then return 'expired'; end if;
  update private.wallet_treats set status = 'used', used_at = now() where invite_id = t.invite_id;
  return t.item;
end $$;

revoke all on function public.my_wallet(), public.wallet_visit(), public.wallet_boost(), public.wallet_extra_ask(), public.wallet_stake(uuid),
  public.treat_options(uuid), public.treat_plan(uuid, text, text), public.decline_treat(uuid), public.redeem_treat(text, text) from public, anon;
grant execute on function public.my_wallet(), public.wallet_visit(), public.wallet_boost(), public.wallet_extra_ask(), public.wallet_stake(uuid),
  public.treat_options(uuid), public.treat_plan(uuid, text, text), public.decline_treat(uuid) to authenticated;
revoke all on function public.redeem_treat(text, text) from authenticated;
grant execute on function public.redeem_treat(text, text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Top-ups. Only the `wallet` Edge Function calls these (service role), after it has made the
-- Razorpay order or checked Razorpay's signature. The price always comes from wallet_pack, never
-- from the app.
-- ---------------------------------------------------------------------------------------------
create or replace function public.wallet_open_order(p_user uuid, p_pack text, p_order text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  pk record;
  w private.wallets;
begin
  if not exists (select 1 from profiles where id = p_user) then raise exception using errcode = 'PL002', message = 'Finish setting up first.'; end if;
  select * into pk from private.wallet_pack(p_pack);
  if pk.credits is null then raise exception using errcode = 'PL136', message = 'Pick a pack from the list.'; end if;
  select * into w from private.wallets where user_id = p_user;
  if coalesce(w.paid, 0) + pk.credits > 2000 then
    raise exception using errcode = 'PL137', message = 'Your wallet is full. Spend some credits first.';
  end if;
  insert into private.wallet_orders (order_id, user_id, pack, paise, credits) values (p_order, p_user, p_pack, pk.rupees * 100, pk.credits);
  return jsonb_build_object('order', p_order, 'paise', pk.rupees * 100, 'credits', pk.credits);
end $$;

-- The price of a pack in paise, for the function to make the order with.
create or replace function public.wallet_pack_price(p_pack text)
returns int language sql immutable security definer set search_path = public as $$
  select rupees * 100 from private.wallet_pack(p_pack);
$$;

-- Paid: credits once, however many times Razorpay or the app says so. The amount must match.
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
    perform private.wallet_move(o.user_id, 'topup', o.credits, 0, p_order);
  end if;
  return 'paid';
end $$;

-- A refund (from the Razorpay dashboard, by a person): takes back what is left of those credits.
create or replace function public.wallet_refunded(p_payment text)
returns text language plpgsql security definer set search_path = public as $$
declare
  o private.wallet_orders;
  w private.wallets;
begin
  select * into o from private.wallet_orders where payment_id = p_payment for update;
  if not found then return 'unknown'; end if;
  if o.status = 'refunded' then return 'refunded'; end if;
  update private.wallet_orders set status = 'refunded', refunded_at = now() where order_id = o.order_id;
  if o.user_id is not null then
    select * into w from private.wallets where user_id = o.user_id for update;
    perform private.wallet_move(o.user_id, 'topup_refund', -least(o.credits, coalesce(w.paid, 0)), 0, o.order_id);
  end if;
  return 'refunded';
end $$;

revoke all on function public.wallet_open_order(uuid, text, text), public.wallet_pack_price(text), public.wallet_paid(text, text, int),
  public.wallet_refunded(text) from public, anon, authenticated;
grant execute on function public.wallet_open_order(uuid, text, text), public.wallet_pack_price(text), public.wallet_paid(text, text, int),
  public.wallet_refunded(text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- When a plan ends: stakes come back or are lost, treats become vouchers or come back, and a kept
-- plan earns a reward. Nothing here can stop the plan's own change: it only moves credits.
-- ---------------------------------------------------------------------------------------------
create or replace function private.wallet_plan_ended()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s private.wallet_stakes;
  t private.wallet_treats;
  person uuid;
  outcome text;
  hours numeric := extract(epoch from (new.starts_at - coalesce(new.resolved_at, now()))) / 3600;
  v_code text;
begin
  for s in select * from private.wallet_stakes where invite_id = new.id and ended is null for update loop
    outcome := private.stake_end(new.status::text,
      case when new.flaked_by is null then 'nobody' when new.flaked_by = s.user_id then 'me' else 'them' end, hours);
    if outcome = 'back' then
      perform private.wallet_move(s.user_id, 'stake_back', s.paid, s.earned, new.id::text);
    elsif outcome = 'lost' then
      perform private.wallet_move(s.user_id, 'stake_lost', 0, 0, new.id::text);
    end if;
    if outcome <> 'held' then update private.wallet_stakes set ended = outcome where invite_id = s.invite_id and user_id = s.user_id; end if;
  end loop;

  select * into t from private.wallet_treats where invite_id = new.id and status = 'held' for update;
  if found then
    if new.status = 'kept' then
      loop
        v_code := array_to_string(array(select substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1) from generate_series(1, 8)), '');
        exit when not exists (select 1 from private.wallet_treats where wallet_treats.code = v_code);
      end loop;
      update private.wallet_treats set status = 'ready', code = v_code, ready_at = now() where invite_id = new.id;
    elsif new.status <> 'locked' then
      update private.wallet_treats set status = 'back' where invite_id = new.id;
      perform private.wallet_move(t.giver, 'treat_back', t.credits, 0, new.id::text);
    end if;
  end if;

  if new.status = 'kept' then
    foreach person in array new.check_ins loop
      if (select count(*) from private.wallet_ledger where user_id = person and reward = 'kept_plan' and at > now() - interval '7 days') < 4
         and not exists (select 1 from private.wallet_ledger l join invites i on i.id::text = split_part(l.ref, ':', 2)
                         where l.user_id = person and l.reward = 'kept_plan' and l.at > now() - interval '30 days'
                           and least(i.from_id, i.to_id) = least(new.from_id, new.to_id) and greatest(i.from_id, i.to_id) = greatest(new.from_id, new.to_id)) then
        perform private.wallet_reward(person, 'kept_plan', new.id::text);
      end if;
    end loop;
  end if;
  return null;
end $$;
revoke all on function private.wallet_plan_ended() from public, anon, authenticated;
create trigger wallet_plan_ended after update of status on public.invites
  for each row when (old.status = 'locked' and new.status <> 'locked') execute function private.wallet_plan_ended();

-- One-off rewards: a verified handle, a checked face photo; and for each rating left and each vouch.
create or replace function private.wallet_reward_verified()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform private.wallet_reward(new.profile_id, 'verified_handle', 'once');
  return null;
end $$;
create trigger wallet_reward_verified after update of contact_verified_at on public.profile_private
  for each row when (old.contact_verified_at is null and new.contact_verified_at is not null) execute function private.wallet_reward_verified();

create or replace function private.wallet_reward_face()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform private.wallet_reward(new.profile_id, 'face_checked', 'once');
  return null;
end $$;
create trigger wallet_reward_face after update of status on public.photos
  for each row when (new.kind = 'face' and new.status = 'approved' and old.status <> 'approved') execute function private.wallet_reward_face();

create or replace function private.wallet_reward_rating()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform private.wallet_reward(new.user_id, 'rated_date', new.invite_id::text);
  return null;
end $$;
create trigger wallet_reward_rating after insert on public.date_ratings
  for each row execute function private.wallet_reward_rating();

create or replace function private.wallet_reward_vouch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from private.wallet_ledger where user_id = new.profile_id and reward = 'vouched') < 3 then
    perform private.wallet_reward(new.profile_id, 'vouched', new.voucher_id::text);
  end if;
  return null;
end $$;
create trigger wallet_reward_vouch after insert on public.vouches
  for each row execute function private.wallet_reward_vouch();
revoke all on function private.wallet_reward_verified(), private.wallet_reward_face(), private.wallet_reward_rating(),
  private.wallet_reward_vouch() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- send_invite: as in 20261118000002_double_dates.sql, with room for extra open asks.
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
  -- Three open asks, plus the extra ones bought with credits (two at most, each for a day).
  if (select count(*) from invites where from_id = me and status in ('sent', 'half_locked')) >= 3 + private.extra_asks(me) then
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
-- Discover: as in 20261125000001_self_love.sql, with boosted cards first.
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
    -- A boosted card (D104) comes first; the rest stay in their fresh daily order.
    order by exists (select 1 from private.wallets w where w.user_id = c.id and w.boost_until > now()) desc,
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
-- The data download, format 9: as in 20261125000002_spicy.sql, plus the wallet.
-- ---------------------------------------------------------------------------------------------
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
    'format', 'pinkilock-export-9',
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'phone', u.phone, 'email', nullif(u.email, ''), 'created_at', u.created_at, 'is_anonymous', u.is_anonymous)
                from auth.users u where u.id = me),
    'profile', (select to_jsonb(p) from profiles p where p.id = me),
    'contact', (select jsonb_build_object('kind', c.contact_kind, 'handle', c.contact_handle, 'photos', c.photos, 'verified_at', c.contact_verified_at)
                from profile_private c where c.profile_id = me),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'status', x.status, 'bytes', x.bytes, 'at', x.created_at, 'decided_at', x.decided_at) order by x.created_at)
                from photos x where x.profile_id = me), '[]'),
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
    -- Handles I flagged as not working, by person and plan; their handle is theirs, so it is left out.
    'contact_flags_made', coalesce((select jsonb_agg(jsonb_build_object('profile', f.owner_id, 'invite', f.invite_id, 'at', f.at) order by f.at)
                from contact_reports f where f.reporter_id = me), '[]'),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('platform', d.platform, 'updated_at', d.updated_at) order by d.updated_at)
                from push_tokens d where d.profile_id = me), '[]'),
    'notifications', coalesce((select jsonb_agg(jsonb_build_object('kind', n.kind, 'title', n.title, 'body', n.body, 'at', n.created_at, 'sent_at', n.sent_at) order by n.id)
                from notifications n where n.recipient_id = me), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('type', e.type, 'at', e.at, 'invite', e.invite_id) order by e.id)
                -- A flag on my handle is logged against me, but it names the plan and so the flagger:
                -- like reports about me, it is not part of an export.
                from events e where e.actor_id = me and e.type <> 'bad_contact'), '[]'),
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
    'line_review', (select jsonb_build_object('text', l.text, 'status', l.status, 'reason', l.reason) from private.line_reviews l where l.profile_id = me),
    -- Self love (D101): every mood, note, pause and reset, all of it the person's own.
    'self_love', jsonb_build_object(
      'moods', coalesce((select jsonb_agg(jsonb_build_object('day', m.day, 'mood', m.mood) order by m.day) from private.self_moods m where m.user_id = me), '[]'),
      'notes', coalesce((select jsonb_agg(jsonb_build_object('kind', n.kind, 'body', n.body, 'day', n.day, 'at', n.at) order by n.at) from private.self_notes n where n.user_id = me), '[]'),
      'pause_and_reset', (select jsonb_build_object('paused_until', s.paused_until, 'reset_started', s.reset_started, 'reset_done', s.reset_done) from private.self_love s where s.user_id = me)),
    -- Spicy mode (D103): my own usernames, boundaries and yeses. The other person's are theirs.
    'spicy', (select jsonb_build_object('discord', s.discord, 'telegram', s.telegram, 'signal', s.signal, 'boundaries', to_jsonb(s.boundaries), 'adult_at', s.adult_at, 'rules_at', s.rules_at, 'since', s.updated_at,
                'yes', coalesce((select jsonb_agg(jsonb_build_object('with', y.other_id, 'at', y.at) order by y.at) from private.spicy_yes y where y.user_id = me), '[]'),
                'unlocks', coalesce((select jsonb_agg(jsonb_build_object('with', case when x.a = me then x.b else x.a end, 'paid', case when x.a = me then x.paid_a else x.paid_b end,
                  'unlocked_at', x.unlocked_at)) from private.spicy_unlocks x where me in (x.a, x.b)), '[]'))
              from private.spicy s where s.user_id = me),
    -- The wallet (D104): balances, every ledger row, my orders (payments), stakes and treats.
    -- A treat I was given shows what and when; the voucher code only while it can be used.
    'wallet', jsonb_build_object(
      'paid', coalesce((select w.paid from private.wallets w where w.user_id = me), 0),
      'earned', coalesce((select w.earned from private.wallets w where w.user_id = me), 0),
      'ledger', coalesce((select jsonb_agg(jsonb_build_object('kind', l.kind, 'paid', l.paid, 'earned', l.earned, 'reward', l.reward, 'at', l.at) order by l.id)
                  from private.wallet_ledger l where l.user_id = me), '[]'),
      'orders', coalesce((select jsonb_agg(jsonb_build_object('order', o.order_id, 'provider', o.provider, 'pack', o.pack, 'paise', o.paise, 'credits', o.credits,
                  'status', o.status, 'payment', o.payment_id, 'at', o.created_at, 'paid_at', o.paid_at, 'refunded_at', o.refunded_at) order by o.created_at)
                  from private.wallet_orders o where o.user_id = me), '[]'),
      'stakes', coalesce((select jsonb_agg(jsonb_build_object('invite', s.invite_id, 'credits', s.paid + s.earned, 'at', s.at, 'ended', s.ended) order by s.at)
                  from private.wallet_stakes s where s.user_id = me), '[]'),
      'treats', coalesce((select jsonb_agg(jsonb_build_object('invite', t.invite_id, 'gave', t.giver = me, 'item', t.item, 'credits', t.credits, 'status', t.status, 'at', t.at)
                  order by t.at) from private.wallet_treats t where me in (t.giver, t.receiver)), '[]'))
  );
end $$;

-- ---------------------------------------------------------------------------------------------
-- Spicy mode's unlock (D105). spicy_with_for: as in 20261125000002_spicy.sql, and the usernames
-- show only once the match is unlocked.
-- ---------------------------------------------------------------------------------------------
create table private.spicy_unlocks (
  a uuid not null references auth.users (id) on delete cascade,
  b uuid not null references auth.users (id) on delete cascade,
  paid_a int not null default 0 check (paid_a between 0 and 600),
  paid_b int not null default 0 check (paid_b between 0 and 600),
  unlocked_at timestamptz,
  primary key (a, b),
  check (a < b and paid_a + paid_b <= 600)
);
alter table private.spicy_unlocks enable row level security;
revoke all on private.spicy_unlocks from public, anon, authenticated, service_role;

create or replace function private.spicy_with_for(p_user uuid, p_other uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  theirs private.spicy;
  my_yes boolean;
  their_yes boolean;
  u private.spicy_unlocks;
  mine int := 0;
  their_part int := 0;
  shown boolean;
begin
  if p_other is null or p_other = p_user then return jsonb_build_object('open', false); end if;
  select * into theirs from private.spicy where user_id = p_other;
  if not found or not exists (select 1 from private.spicy where user_id = p_user)
     or private.blocked_pair(p_user, p_other)
     or not (exists (select 1 from private.discover_seen d where d.user_id = p_user and d.card_id = p_other)
             or private.shares_invite(p_user, p_other))
     or exists (select 1 from profiles p where p.id in (p_user, p_other) and p.suspended_at is not null) then
    return jsonb_build_object('open', false);
  end if;
  my_yes := exists (select 1 from private.spicy_yes where user_id = p_user and other_id = p_other);
  their_yes := exists (select 1 from private.spicy_yes where user_id = p_other and other_id = p_user);
  select * into u from private.spicy_unlocks where a = least(p_user, p_other) and b = greatest(p_user, p_other);
  if found then
    mine := case when u.a = p_user then u.paid_a else u.paid_b end;
    their_part := case when u.a = p_user then u.paid_b else u.paid_a end;
  end if;
  shown := my_yes and their_yes and u.unlocked_at is not null;
  return jsonb_build_object('open', true, 'my_yes', my_yes, 'mutual', my_yes and their_yes,
    'their_boundaries', to_jsonb(theirs.boundaries),
    'unlock', jsonb_build_object('mine', mine, 'theirs', their_part, 'done', u.unlocked_at is not null),
    'discord', case when shown then theirs.discord end,
    'telegram', case when shown then theirs.telegram end,
    'signal', case when shown then theirs.signal end);
end $$;

-- Pay my part: 'half' (300, once) or 'full' (whatever is left). Only once we both said yes.
create or replace function public.spicy_pay(p_other uuid, p_share text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  plan jsonb := private.spicy_with_for(me, p_other);
  u private.spicy_unlocks;
  mine int;
  rest int;
  amount int;
  w private.wallets;
begin
  if not coalesce((plan ->> 'open')::boolean, false) then
    raise exception using errcode = 'PL130', message = 'Spicy opens only when you both have it on.';
  end if;
  if not coalesce((plan ->> 'mutual')::boolean, false) then
    raise exception using errcode = 'PL146', message = 'You both need to say yes first.';
  end if;
  insert into private.spicy_unlocks (a, b) values (least(me, p_other), greatest(me, p_other)) on conflict do nothing;
  select * into u from private.spicy_unlocks where a = least(me, p_other) and b = greatest(me, p_other) for update;
  mine := case when u.a = me then u.paid_a else u.paid_b end;
  rest := 600 - u.paid_a - u.paid_b;
  if rest <= 0 or p_share not in ('half', 'full') or (p_share = 'half' and mine >= 300) then
    raise exception using errcode = 'PL145', message = 'Your part is paid already.';
  end if;
  amount := case when p_share = 'half' then least(300 - mine, rest) else rest end;
  insert into private.wallets (user_id) values (me) on conflict do nothing;
  select * into w from private.wallets where user_id = me for update;
  if w.paid < amount then
    raise exception using errcode = 'PL139', message = 'This is paid from bought credits. Top up first.';
  end if;
  -- Each payment is its own row (a pay, a refund and a pay again are three).
  perform private.wallet_move(me, 'spicy_unlock', -amount, 0, p_other::text || ':' || gen_random_uuid());
  update private.spicy_unlocks set
    paid_a = paid_a + case when a = me then amount else 0 end,
    paid_b = paid_b + case when b = me then amount else 0 end
  where a = u.a and b = u.b
  returning * into u;
  if u.paid_a + u.paid_b >= 600 then
    update private.spicy_unlocks set unlocked_at = now() where a = u.a and b = u.b;
  end if;
  return private.spicy_with_for(me, p_other);
end $$;
revoke all on function public.spicy_pay(uuid, text) from public, anon;
grant execute on function public.spicy_pay(uuid, text) to authenticated;

-- Before it is fully paid, a match that closes gives back what each paid. After, nothing comes back.
create or replace function private.spicy_refund(p_one uuid, p_two uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  u private.spicy_unlocks;
begin
  select * into u from private.spicy_unlocks where a = least(p_one, p_two) and b = greatest(p_one, p_two) and unlocked_at is null for update;
  if not found then return; end if;
  if u.paid_a > 0 and exists (select 1 from auth.users where id = u.a) then
    perform private.wallet_move(u.a, 'spicy_back', u.paid_a, 0, u.b::text || ':' || gen_random_uuid());
  end if;
  if u.paid_b > 0 and exists (select 1 from auth.users where id = u.b) then
    perform private.wallet_move(u.b, 'spicy_back', u.paid_b, 0, u.a::text || ':' || gen_random_uuid());
  end if;
  delete from private.spicy_unlocks where a = u.a and b = u.b;
end $$;
revoke all on function private.spicy_refund(uuid, uuid) from public, anon, authenticated;

create or replace function private.spicy_yes_gone()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform private.spicy_refund(old.user_id, old.other_id);
  return null;
end $$;
create trigger spicy_yes_gone after delete on private.spicy_yes
  for each row execute function private.spicy_yes_gone();

create or replace function private.spicy_block_refund()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform private.spicy_refund(new.blocker_id, new.blocked_id);
  return null;
end $$;
create trigger spicy_block_refund after insert on public.blocks
  for each row execute function private.spicy_block_refund();
revoke all on function private.spicy_yes_gone(), private.spicy_block_refund() from public, anon, authenticated;
