-- The credits wallet (D104), after spicy.sql. People of their own: W and X (a plan together),
-- Y (a third person in the same city), Z (in another city) and N (no profile yet).
\set ON_ERROR_STOP on
\pset tuples_only on
\ir wallet_cases.sql
\set w '00000000-0000-0000-0000-0000000a11e1'
\set x '00000000-0000-0000-0000-0000000a11e2'
\set y '00000000-0000-0000-0000-0000000a11e3'
\set z '00000000-0000-0000-0000-0000000a11e4'
\set n '00000000-0000-0000-0000-0000000a11e5'
insert into auth.users (id, email) values (:'w', 'w@example.test'), (:'x', 'x@example.test'), (:'y', 'y@example.test'), (:'z', 'z@example.test'), (:'n', 'n@example.test');
insert into public.profiles (id, name, age, area, city) values (:'w', 'Waheeda', 25, 'Bandra West', 'Wallettown'), (:'x', 'Xavier', 27, 'Khar West', 'Wallettown'),
  (:'y', 'Yash', 26, 'Juhu', 'Wallettown'), (:'z', 'Zoya', 24, 'Indiranagar', 'Elsewhere');

-- The shared tables: the stake rules and the packs agree with src/domain/wallet.ts.
select t.ok(bad is null, coalesce('every shared stake line gives the same answer in SQL (' || bad || ')', 'every shared stake line gives the same answer in SQL'))
  from (select string_agg(format('%s/%s/%s: %s, want %s', status, flaked, hours, private.stake_end(status, flaked, hours), want), '; ')
          filter (where private.stake_end(status, flaked, hours) <> want) as bad from stake_cases) c;
select t.ok(not exists (select 1 from pack_cases p where (select (rupees, credits) from private.wallet_pack(p.id)) is distinct from (p.rupees, p.credits))
  and (select count(*) from pack_cases) = 4 and private.wallet_pack('p1') is null, 'the packs and their prices are the same in SQL');

set role authenticated;
select t.as_user(:'n');
select t.ok(t.sqlstate('select my_wallet()') = 'PL002', 'the wallet needs a profile first (PL002)');

select t.as_user(:'w');
select t.ok((select my_wallet() ->> 'paid')::int = 0 and (select my_wallet() ->> 'earned')::int = 0 and (select my_wallet() -> 'history') = '[]'::jsonb, 'a new person starts with nothing');
select t.ok(t.sqlstate('select wallet_extra_ask()') = 'PL132', 'nothing to spend yet (PL132)');

-- No client can read or write the wallet, or credit itself.
select t.ok(t.fails('select * from private.wallets') and t.fails('select * from private.wallet_ledger') and t.fails('select * from private.wallet_orders')
  and t.fails('select * from private.wallet_stakes') and t.fails('select * from private.wallet_treats'), 'no client can read the wallet tables');
select t.ok(t.fails(format($$insert into private.wallets (user_id, paid) values (%L, 5000)$$, :'w'))
  and t.fails(format($$select private.wallet_move(%L, 'topup', 5000, 0)$$, :'w')), 'or write them, or move credits');
select t.ok(t.fails(format($$select wallet_open_order(%L, 'p49', 'order_planted1')$$, :'w')) and t.fails($$select wallet_paid('order_planted1', 'pay_x', 4900)$$)
  and t.fails($$select wallet_refunded('pay_x')$$) and t.fails($$select redeem_treat('p', 'ABCDEFGH')$$), 'only the Edge Function opens and pays orders');
reset role;

-- A top-up, as the Edge Function makes it (service role): the price comes from the server.
set role service_role;
select t.ok(t.sqlstate(format($$select wallet_open_order(%L, 'p1000', 'order_bad0001')$$, :'w')) = 'PL136', 'an unknown pack is refused (PL136)');
select wallet_open_order(:'w', 'p199', 'order_w000001');
select t.ok(wallet_paid('order_w000001', 'pay_w000001', 100) = 'mismatch', 'a payment for the wrong amount credits nothing');
select t.ok(wallet_paid('order_w000001', 'pay_w000001', 19900) = 'paid', 'the right amount is paid');
select t.ok(wallet_paid('order_w000001', 'pay_w000001', 19900) = 'paid', 'and a second webhook for it changes nothing');
select t.ok(wallet_paid('order_nothere1', 'pay_x', 100) = 'unknown', 'an order nobody opened is unknown');
select wallet_open_order(:'w', 'p499', 'order_w000002');
select wallet_paid('order_w000002', 'pay_w000002', 49900);
select wallet_open_order(:'w', 'p499', 'order_w000003');
select wallet_paid('order_w000003', 'pay_w000003', 49900);
select t.ok(t.sqlstate(format($$select wallet_open_order(%L, 'p499', 'order_w000004')$$, :'w')) = 'PL137', 'no top-up past 2000 bought credits (PL137)');
select t.ok(wallet_refunded('pay_w000003') = 'refunded' and wallet_refunded('pay_w000003') = 'refunded', 'a refund takes the credits back, once');
reset role;
set role authenticated;
select t.as_user(:'w');
select t.ok((select my_wallet() ->> 'paid')::int = 890, 'W has 240 + 650 bought credits (one pack refunded)');
select t.ok(not exists (select 1 from jsonb_array_elements(my_wallet() -> 'history') h where h ->> 'kind' not in ('topup', 'topup_refund')), 'the history shows the top-ups and the refund');

-- Boost: first on Discover in my city for a day, one at a time. Since D116 a Boost is bought in
-- rupees (tests/db/pink_gold.sql) or comes with Pink Gold, never paid with credits; W is given one here.
select t.ok(t.sqlstate('select wallet_boost()') = 'PL185', 'no Boost to use yet (PL185), and credits do not buy one');
reset role;
insert into private.boosts (user_id, source, ref, expires_at) values (:'w', 'bought', 'order_wboost1', now() + interval '1 month');
set role authenticated;
select t.as_user(:'w');
select wallet_boost();
select t.ok((select (my_wallet() ->> 'boost_until')::timestamptz) between now() + interval '23 hours' and now() + interval '25 hours'
  and (select my_wallet() ->> 'paid')::int = 890 and (select my_wallet() ->> 'boosts')::int = 0, 'a Boost runs for a day and costs no credits');
select t.ok(t.sqlstate('select wallet_boost()') = 'PL133', 'one boost at a time (PL133)');
select t.as_user(:'y');
reset role;
-- Y is shown cards in the order Discover picks; W's boost puts W first.
insert into public.profiles (id, name, age, area, city) select gen_random_uuid(), 'Filler', 25, 'Juhu', 'Wallettown' from generate_series(1, 0);
set role authenticated;
select t.as_user(:'y');
select t.ok((select id from discover(20) limit 1) = :'w', 'a boosted card comes first on Discover');
select t.as_user(:'z');
select t.ok(not exists (select 1 from discover(20) where id = :'w'), 'but only in its own city');

-- Extra asks: one more open ask each, two at most.
select t.as_user(:'w');
select wallet_extra_ask();
select wallet_extra_ask();
select t.ok(t.sqlstate('select wallet_extra_ask()') = 'PL134', 'two extra asks at most (PL134)');
select t.ok((select my_wallet() ->> 'extra_asks')::int = 2 and (select my_wallet() ->> 'paid')::int = 870, 'each costs 10');
reset role;
-- W has 3 asks open already; the extras let a fourth and a fifth through, and no sixth.
insert into auth.users (id) select ('00000000-0000-0000-0000-0000000a12' || lpad(g::text, 2, '0'))::uuid from generate_series(1, 6) g;
insert into public.profiles (id, name, age, area, city) select ('00000000-0000-0000-0000-0000000a12' || lpad(g::text, 2, '0'))::uuid, 'Asked', 25, 'Juhu', 'Wallettown' from generate_series(1, 6) g;
insert into public.invites (from_id, to_id, idea_id, minutes, starts_at, expires_at, place, status)
  select :'w', ('00000000-0000-0000-0000-0000000a12' || lpad(g::text, 2, '0'))::uuid, 'boba_run', 25, now() + interval '2 days', now() + interval '1 day', 'Carter Road', 'sent' from generate_series(1, 3) g;
set role authenticated;
select t.as_user(:'w');
select send_invite('00000000-0000-0000-0000-0000000a1204', 'boba_run', now() + interval '2 days', 'Carter Road', null);
select send_invite('00000000-0000-0000-0000-0000000a1205', 'boba_run', now() + interval '2 days', 'Carter Road', null);
select t.ok(t.sqlstate($$select send_invite('00000000-0000-0000-0000-0000000a1206', 'boba_run', now() + interval '2 days', 'Carter Road', null)$$) = 'PL023',
  'two extra asks make five open asks, never six (PL023)');
reset role;
delete from public.invites where from_id = :'w';

-- A plan between W and X, locked and not started.
insert into public.invites (id, from_id, to_id, idea_id, minutes, starts_at, expires_at, place, status)
  values ('00000000-0000-0000-0000-0000000a1301', :'w', :'x', 'boba_run', 25, now() + interval '1 day', now() + interval '1 hour', 'Carter Road', 'locked'),
         ('00000000-0000-0000-0000-0000000a1302', :'w', '00000000-0000-0000-0000-0000000a1201', 'boba_run', 25, now() + interval '3 days', now() + interval '1 hour', 'Carter Road', 'sent');
set role authenticated;
select t.as_user(:'w');
select t.ok(t.sqlstate($$select wallet_stake('00000000-0000-0000-0000-0000000a1302')$$) = 'PL135', 'a stake goes only on a locked plan (PL135)');
select wallet_stake('00000000-0000-0000-0000-0000000a1301');
select t.ok(t.sqlstate($$select wallet_stake('00000000-0000-0000-0000-0000000a1301')$$) = 'PL138', 'once per plan (PL138)');
select t.ok((select (my_wallet() -> 'stakes' ->> '00000000-0000-0000-0000-0000000a1301')::int) = 50 and (select my_wallet() ->> 'paid')::int = 820, 'W holds 50 on the plan');
select t.as_user(:'y');
select t.ok(t.sqlstate($$select wallet_stake('00000000-0000-0000-0000-0000000a1301')$$) = 'PL135', 'nobody else can stake someone''s plan (PL135)');

-- Treat the plan: only with a partner place in our city, from bought credits.
select t.as_user(:'w');
select t.ok(treat_options('00000000-0000-0000-0000-0000000a1301') = '[]'::jsonb, 'no partner in the city, no treats');
select t.ok(t.sqlstate($$select treat_plan('00000000-0000-0000-0000-0000000a1301', 'test_cafe', 'coffee')$$) = 'PL140', 'and treat_plan refuses (PL140)');
select t.ok(t.fails($$insert into public.treat_partners (id, name, city, items) values ('planted', 'Planted', 'Wallettown', '{coffee}')$$), 'no client can add a partner');
reset role;
insert into public.treat_partners (id, name, city, items) values ('test_cafe', 'Test Café', 'Wallettown', '{coffee,dessert}');
set role authenticated;
select t.as_user(:'w');
select t.ok((select treat_options('00000000-0000-0000-0000-0000000a1301') -> 0 ->> 'partner') = 'test_cafe', 'a partner in our city is offered');
select t.ok(t.sqlstate($$select treat_plan('00000000-0000-0000-0000-0000000a1301', 'test_cafe', 'movie')$$) = 'PL140', 'only what that partner hands over (PL140)');
select treat_plan('00000000-0000-0000-0000-0000000a1301', 'test_cafe', 'coffee');
select t.ok(t.sqlstate($$select treat_plan('00000000-0000-0000-0000-0000000a1301', 'test_cafe', 'dessert')$$) = 'PL141', 'one treat a plan (PL141)');
select t.ok((select my_wallet() ->> 'paid')::int = 670 and (select my_wallet() -> 'treats' -> 0 ->> 'code') is null, 'a coffee is 150 bought credits; W never sees a code');
select t.as_user(:'x');
select t.ok((select my_wallet() -> 'treats' -> 0 ->> 'status') = 'held' and (select my_wallet() -> 'treats' -> 0 ->> 'code') is null
  and (select my_wallet() ->> 'paid')::int = 0, 'X sees the treat held, with no code yet, and is given no credits');

-- The plan is kept: W's stake comes back, X gets the voucher code, both earn the kept-plan reward.
reset role;
update public.invites set check_ins = array[:'w', :'x']::uuid[], status = 'kept', resolved_at = now() where id = '00000000-0000-0000-0000-0000000a1301';
set role authenticated;
select t.as_user(:'w');
select t.ok((select my_wallet() ->> 'paid')::int = 720 and (select my_wallet() -> 'stakes') = '{}'::jsonb, 'a kept plan gives the stake back');
select t.ok((select my_wallet() ->> 'earned')::int = 20 and (select my_wallet() ->> 'kept_this_week')::int = 1, 'and earns 20 credits');
select t.as_user(:'x');
select t.ok((select my_wallet() -> 'treats' -> 0 ->> 'code') ~ '^[A-Z2-9]{8}$' and (select my_wallet() -> 'treats' -> 0 ->> 'status') = 'ready', 'X gets a voucher code');
select (my_wallet() -> 'treats' -> 0 ->> 'code') as voucher \gset
reset role;
set role service_role;
select t.ok(redeem_treat('test_cafe', 'WRONG234') = 'unknown' and redeem_treat('other', :'voucher') = 'unknown', 'a wrong code, or another partner, gets nothing');
select t.ok(redeem_treat('test_cafe', lower(:'voucher')) = 'coffee' and redeem_treat('test_cafe', :'voucher') = 'used', 'the code is good once');
reset role;

-- A second kept plan with the same person within 30 days earns nothing more.
insert into public.invites (id, from_id, to_id, idea_id, minutes, starts_at, expires_at, place, status)
  values ('00000000-0000-0000-0000-0000000a1303', :'x', :'w', 'boba_run', 25, now() + interval '1 day', now() + interval '1 hour', 'Carter Road', 'locked');
update public.invites set check_ins = array[:'w', :'x']::uuid[], status = 'kept', resolved_at = now() where id = '00000000-0000-0000-0000-0000000a1303';
set role authenticated;
select t.as_user(:'w');
select t.ok((select my_wallet() ->> 'earned')::int = 20, 'the same two people earn one kept-plan reward per 30 days');

-- Rating a kept date earns 5 (the answer does not matter, and nobody learns it).
select rate_date('00000000-0000-0000-0000-0000000a1301', false, false);
select t.ok((select my_wallet() ->> 'earned')::int = 25, 'rating a kept date earns 5, whatever the answer');
select t.as_user(:'x');
select t.ok((select my_wallet() ->> 'earned')::int = 20, 'and the other person gets nothing for it');

-- Stakes lost and kept: W's no-show loses it; X's flake gives W's back.
reset role;
insert into public.invites (id, from_id, to_id, idea_id, minutes, starts_at, expires_at, place, status)
  values ('00000000-0000-0000-0000-0000000a1304', :'w', :'y', 'boba_run', 25, now() + interval '1 day', now() + interval '1 hour', 'Carter Road', 'locked'),
         ('00000000-0000-0000-0000-0000000a1305', :'w', '00000000-0000-0000-0000-0000000a1202', 'boba_run', 25, now() + interval '2 day', now() + interval '1 hour', 'Carter Road', 'locked');
set role authenticated;
select t.as_user(:'w');
select wallet_stake('00000000-0000-0000-0000-0000000a1304');
select wallet_stake('00000000-0000-0000-0000-0000000a1305');
select t.ok((select my_wallet() ->> 'earned')::int = 0 and (select my_wallet() ->> 'paid')::int = 645, 'a stake takes earned credits first');
reset role;
update public.invites set status = 'flaked', flaked_by = :'w', starts_at = now() - interval '1 hour', resolved_at = now() where id = '00000000-0000-0000-0000-0000000a1304';
update public.invites set status = 'flaked', flaked_by = '00000000-0000-0000-0000-0000000a1202', resolved_at = now() where id = '00000000-0000-0000-0000-0000000a1305';
set role authenticated;
select t.as_user(:'w');
select t.ok((select my_wallet() ->> 'paid')::int = 695 and (select my_wallet() ->> 'earned')::int = 0, 'my no-show loses the stake; their flake gives it back, to the bucket it came from');
select t.ok(exists (select 1 from jsonb_array_elements(my_wallet() -> 'history') h where h ->> 'kind' = 'stake_lost'), 'the history says it was lost');
select t.as_user(:'y');
select t.ok((select my_wallet() ->> 'paid')::int = 0 and (select my_wallet() ->> 'earned')::int = 0, 'a lost stake never goes to the other person');

-- One-off rewards: a verified handle and a checked face, once each.
reset role;
insert into public.profile_private (profile_id, contact_kind, contact_handle) values (:'y', 'Instagram', 'yash.k') on conflict (profile_id) do nothing;
update public.profile_private set contact_verified_at = now() where profile_id = :'y';
update public.profile_private set contact_verified_at = null where profile_id = :'y';
update public.profile_private set contact_verified_at = now() where profile_id = :'y';
set role authenticated;
select t.as_user(:'y');
select t.ok((select my_wallet() ->> 'earned')::int = 25 and (select my_wallet() -> 'had') = '["verified_handle"]'::jsonb, 'a verified handle earns 25, once');

-- Seven days in a row earns 15, once a week.
reset role;
insert into private.wallet_visits (user_id, day) select :'z', private.local_today(:'z') - g from generate_series(1, 6) g;
set role authenticated;
select t.as_user(:'z');
select wallet_visit();
select wallet_visit();
select t.ok((select my_wallet() ->> 'streak')::int = 7 and (select my_wallet() ->> 'earned')::int = 15, 'seven days in a row earn 15, once');

-- Earned credits stop at 500.
reset role;
update private.wallets set earned = 495 where user_id = :'z';
select private.wallet_reward(:'z', 'rated_date', 'cap-test-1');
select private.wallet_reward(:'z', 'rated_date', 'cap-test-2');
select t.ok((select earned from private.wallets where user_id = :'z') = 500, 'earned credits stop at 500');

-- A treat that is not kept comes back; the person treated can say no thanks; a voucher nobody uses comes back after a day.
-- (The coffee on the first plan was last week.)
update private.wallet_treats set at = now() - interval '8 days' where invite_id = '00000000-0000-0000-0000-0000000a1301';
insert into public.treat_partners (id, name, city, items) values ('test_cinema', 'Test Cinema', 'Wallettown', '{movie}');
insert into public.invites (id, from_id, to_id, idea_id, minutes, starts_at, expires_at, place, status)
  values ('00000000-0000-0000-0000-0000000a1306', :'w', :'y', 'boba_run', 25, now() + interval '1 day', now() + interval '1 hour', 'Carter Road', 'locked'),
         ('00000000-0000-0000-0000-0000000a1307', :'w', '00000000-0000-0000-0000-0000000a1203', 'boba_run', 25, now() + interval '1 day', now() + interval '1 hour', 'Carter Road', 'locked'),
         ('00000000-0000-0000-0000-0000000a1308', :'w', :'x', 'boba_run', 25, now() + interval '1 day', now() + interval '1 hour', 'Carter Road', 'locked');
set role authenticated;
select t.as_user(:'w');
select treat_plan('00000000-0000-0000-0000-0000000a1306', 'test_cinema', 'movie');
select treat_plan('00000000-0000-0000-0000-0000000a1307', 'test_cafe', 'dessert');
select t.ok(t.sqlstate($$select treat_plan('00000000-0000-0000-0000-0000000a1308', 'test_cafe', 'coffee')$$) = 'PL142', 'two treats a week at most (PL142)');
select t.ok((select my_wallet() ->> 'paid')::int = 275, 'a movie is 300 and a dessert 120');
select t.as_user(:'x');
select t.ok(t.sqlstate($$select decline_treat('00000000-0000-0000-0000-0000000a1307')$$) = 'PL143', 'only the person treated can say no thanks (PL143)');
select t.as_user('00000000-0000-0000-0000-0000000a1203');
select decline_treat('00000000-0000-0000-0000-0000000a1307');
reset role;
update public.invites set status = 'flaked', flaked_by = :'y', resolved_at = now() where id = '00000000-0000-0000-0000-0000000a1306';
set role authenticated;
select t.as_user(:'w');
select t.ok((select my_wallet() ->> 'paid')::int = 695, 'a treat said no to, or on a plan not kept, comes back');
reset role;
update private.wallet_treats set at = now() - interval '8 days';
set role authenticated;
select t.as_user(:'w');
select treat_plan('00000000-0000-0000-0000-0000000a1308', 'test_cafe', 'coffee');
reset role;
update public.invites set check_ins = array[:'w', :'x']::uuid[], status = 'kept', resolved_at = now() where id = '00000000-0000-0000-0000-0000000a1308';
update private.wallet_treats set ready_at = now() - interval '25 hours' where invite_id = '00000000-0000-0000-0000-0000000a1308';
select private.wallet_sweep();
set role authenticated;
select t.as_user(:'w');
select t.ok((select my_wallet() ->> 'paid')::int = 695, 'a voucher nobody used in a day comes back');

-- A block hides treats between the two, and nobody can be treated across one.
select t.as_user(:'x');
select t.ok((select jsonb_array_length(my_wallet() -> 'treats')) >= 1, 'X sees the coffee W gave');
select block_user(:'w');
select t.ok((select jsonb_array_length(my_wallet() -> 'treats')) = 0, 'after a block, X no longer sees treats with W');

-- The data download carries the wallet, and the worker cannot read it.
select t.as_user(:'w');
select t.ok((select export_my_data() ->> 'format') = 'pinkilock-export-11'
  and (select jsonb_array_length(export_my_data() -> 'wallet' -> 'orders')) = 3
  and (select (export_my_data() -> 'wallet' ->> 'paid')::int) = 695, 'the data download (format 11) has the wallet and its orders');
reset role;
select t.ok(not has_table_privilege('pinkilock_analytics', 'private.wallets', 'select') and not has_table_privilege('pinkilock_analytics', 'private.wallet_ledger', 'select')
  and not has_table_privilege('pinkilock_analytics', 'private.wallet_orders', 'select'), 'the analytics worker cannot read the wallet');

-- Rewards never come from Spicy mode: no reward or plan function reads it.
select t.ok(not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                        where (p.proname like 'wallet_reward%' or p.proname in ('wallet_plan_ended', 'wallet_visit', 'wallet_state')) and p.prosrc ilike '%spicy%'),
  'no reward reads Spicy mode');

-- Spicy mode's unlock (D105): Y and Z... X and Y both on, shown to each other, both yes.
reset role;
update public.profiles set city = 'Wallettown' where id = :'z';
insert into private.spicy (user_id, discord, adult_at, rules_at) values (:'y', 'yash.k', now(), now()), (:'z', 'zoya.r', now(), now());
insert into public.consents (user_id, kind, version) values (:'y', 'spicy', 'spicy-' || private.spicy_terms_version()), (:'z', 'spicy', 'spicy-' || private.spicy_terms_version());
insert into private.discover_seen (user_id, card_id) values (:'y', :'z'), (:'z', :'y');
update private.wallets set paid = 1000 where user_id = :'y';
insert into private.wallets (user_id, paid) values (:'z', 250) on conflict (user_id) do update set paid = 250;
set role authenticated;
select t.as_user(:'y');
select t.ok(t.sqlstate(format($$select spicy_pay(%L, 'half')$$, :'z')) = 'PL146', 'paying needs a yes from both first (PL146)');
select spicy_yes(:'z', true);
select t.as_user(:'z');
select spicy_yes(:'y', true);
select t.ok((select spicy_with(:'y') ->> 'mutual')::boolean and (select spicy_with(:'y') ->> 'discord') is null, 'both said yes, but no username until the match is unlocked');
select t.ok(t.sqlstate(format($$select spicy_pay(%L, 'half')$$, :'y')) = 'PL139', 'bought credits only: Z''s 250 is not enough for half (PL139)');
select t.as_user(:'y');
select spicy_pay(:'z', 'half');
select t.ok(t.sqlstate(format($$select spicy_pay(%L, 'half')$$, :'z')) = 'PL145', 'half is paid once (PL145)');
select t.ok((select spicy_with(:'z') -> 'unlock') = '{"mine": 300, "theirs": 0, "done": false}'::jsonb and (select spicy_with(:'z') ->> 'discord') is null, 'Y paid half; still locked');
-- Z takes the yes back before it is unlocked: Y's 300 comes back.
select t.as_user(:'z');
select spicy_yes(:'y', false);
select t.as_user(:'y');
select t.ok((select my_wallet() ->> 'paid')::int = 1000, 'a yes taken back before the unlock gives back what was paid');
select t.as_user(:'z');
select spicy_yes(:'y', true);
select t.as_user(:'y');
select spicy_pay(:'z', 'half');
select t.ok((select spicy_with(:'z') ->> 'discord') is null, 'half paid again, still waiting on Z');
-- Tired of waiting, Y pays the other 300 too (Sushil, 2026-11-25).
select spicy_pay(:'z', 'full');
select t.ok((select spicy_with(:'z') ->> 'discord') = 'zoya.r' and (select spicy_with(:'z') -> 'unlock' ->> 'done')::boolean
  and (select my_wallet() ->> 'paid')::int = 400, 'the one who paid half can pay the other half; then the usernames show');
select t.as_user(:'z');
select t.ok((select spicy_with(:'y') ->> 'discord') = 'yash.k' and (select my_wallet() ->> 'paid')::int = 250, 'for both, and Z paid nothing and got nothing');
select t.ok(t.sqlstate(format($$select spicy_pay(%L, 'full')$$, :'y')) = 'PL145', 'nothing more to pay once unlocked (PL145)');
select t.ok(t.fails('select * from private.spicy_unlocks'), 'no client can read the unlocks');
select spicy_off();
select t.as_user(:'y');
select t.ok((select my_wallet() ->> 'paid')::int = 400, 'after the unlock, turning off gives nothing back');

-- Deleting the account deletes the wallet, and keeps the payments without the person.
set role authenticated;
select t.as_user(:'w');
select delete_my_account();
reset role;
select t.ok(not exists (select 1 from private.wallets where user_id = :'w') and not exists (select 1 from private.wallet_ledger where user_id = :'w')
  and (select count(*) from private.wallet_orders where order_id like 'order_w%' and user_id is null) = 3, 'deleting the account deletes the wallet and keeps the orders, without the person');
