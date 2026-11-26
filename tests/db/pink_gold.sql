-- Pink Gold (D115), after talk.sql. People of their own: G (made a member), H (sees G's card),
-- B (blocked by G).
\set ON_ERROR_STOP on
\pset tuples_only on
\set g '00000000-0000-0000-0000-000000060101'
\set h '00000000-0000-0000-0000-000000060102'
\set b '00000000-0000-0000-0000-000000060103'
insert into auth.users (id, email) values (:'g', 'g@example.test'), (:'h', 'h@example.test'), (:'b', 'b@example.test');
insert into public.profiles (id, name, age, area, city) values (:'g', 'Gauri', 24, 'Bandra West', 'Goldtown'),
  (:'h', 'Harsh', 25, 'Khar West', 'Goldtown'), (:'b', 'Bunty', 26, 'Juhu', 'Goldtown');

set role authenticated;
select t.as_user(:'h');
select t.ok((select d.pink_gold from discover() d where d.id = :'g') = false, 'a new person is not Pink Gold');
reset role;

-- The team makes G a member (the SQL editor runs as the owner).
select private.pink_gold_grant(:'g', null, 'founding member');
set role authenticated;
select t.as_user(:'h');
select t.ok((select d.pink_gold from discover() d where d.id = :'g') = true, 'on Discover, H sees G''s card say Pink Gold');
select t.ok((select pink_gold from profile_cards where id = :'h') = false, 'and H''s own card does not');
select t.as_user(:'g');
select t.ok((select pink_gold from profile_cards where id = :'g') = true, 'G''s own card (Me) says Pink Gold');
select t.as_user(:'g');
select t.ok((export_my_data() -> 'pink_gold' ->> 'now')::boolean and (export_my_data() -> 'pink_gold' ->> 'until') is null
  and not (export_my_data() -> 'pink_gold') ? 'note', 'G''s download says G is Pink Gold, without the team''s note');
select t.ok((export_my_data() ->> 'format') like 'pinkilock-export-%', 'and keeps the format name of the download before it');
select block_user(:'b');
select t.as_user(:'b');
select t.ok(not exists (select 1 from discover() d where d.id = :'g') and not exists (select 1 from profile_cards where id = :'g'),
  'a blocked person sees no card, so no badge either');
reset role;

-- A membership with an end date stops by itself; running the grant again changes the date.
select private.pink_gold_grant(:'g', now() + interval '1 day');
select t.ok(private.is_pink_gold(:'g') and (select note from private.pink_gold where user_id = :'g') = 'founding member', 'a new end date keeps the note');
update private.pink_gold set since = now() - interval '2 days', until = now() - interval '1 second' where user_id = :'g';
set role authenticated;
select t.as_user(:'h');
select t.ok((select d.pink_gold from discover() d where d.id = :'g') = false, 'after the end date the badge is gone');
reset role;

select private.pink_gold_grant(:'g');
select t.ok(private.is_pink_gold(:'g') and (select since from private.pink_gold where user_id = :'g') > now() - interval '1 minute', 'a member again starts from now');
select private.pink_gold_end(:'g');
select t.ok(not private.is_pink_gold(:'g') and exists (select 1 from private.pink_gold where user_id = :'g'), 'ending it takes the badge off and keeps the row');
set role authenticated;
select t.as_user(:'g');
select t.ok(not (export_my_data() -> 'pink_gold' ->> 'now')::boolean, 'and G''s download says G was a member, not now');
reset role;

-- =============================================================================================
-- Paying for it (D116). P buys plans and Boosts through the wallet's order path, as the `wallet`
-- Edge Function does (service role). R is a member who is not boosted; S is neither.
-- =============================================================================================
\set p '00000000-0000-0000-0000-000000060201'
\set r '00000000-0000-0000-0000-000000060202'
\set s '00000000-0000-0000-0000-000000060203'
insert into auth.users (id, email) values (:'p', 'p@example.test'), (:'r', 'r@example.test'), (:'s', 's@example.test');
insert into public.profiles (id, name, age, area, city) values (:'p', 'Pallavi', 24, 'Juhu', 'Goldtown'), (:'r', 'Ritu', 23, 'Khar', 'Goldtown'), (:'s', 'Sahil', 27, 'Juhu', 'Goldtown');

set role service_role;
select t.ok((select wallet_pack_price('g1')) = 69900 and (select wallet_pack_price('g3')) = 159900 and (select wallet_pack_price('g6')) = 240000
  and (select wallet_pack_price('g12')) = 330000 and (select wallet_pack_price('b1')) = 15000 and (select wallet_pack_price('b6')) = 69900
  and (select wallet_pack_price('b3')) is null, 'the prices Sushil set: Pink Gold 699 / 1,599 / 2,400 / 3,300, Boosts 150 / 699, nothing else');
select t.ok((wallet_open_order(:'p', 'g3', 'order_pg00001') ->> 'credits')::int = 0, 'a plan''s order carries no credits');
select t.ok(wallet_paid('order_pg00001', 'pay_pg00001', 69900) = 'mismatch', 'the wrong amount buys nothing');
select t.ok(wallet_paid('order_pg00001', 'pay_pg00001', 159900) = 'paid' and wallet_paid('order_pg00001', 'pay_pg00001', 159900) = 'paid', 'paid, once');
reset role;
select t.ok(private.is_pink_gold(:'p') and (select until from private.pink_gold where user_id = :'p') between now() + interval '3 months' - interval '1 minute' and now() + interval '3 months',
  'three months of Pink Gold from now');
select t.ok(coalesce((select paid + earned from private.wallets where user_id = :'p'), 0) = 0, 'and no credits');
set role service_role;
select wallet_open_order(:'p', 'g1', 'order_pg00002');
select wallet_paid('order_pg00002', 'pay_pg00002', 69900);
reset role;
select t.ok((select until from private.pink_gold where user_id = :'p') between now() + interval '4 months' - interval '1 minute' and now() + interval '4 months',
  'a plan bought while one is on adds to its end');
set role service_role;
select t.ok(t.sqlstate(format($$select wallet_open_order(%L, 'g12', 'order_pg00003')$$, :'p')) = 'PL184', 'never more than 13 months ahead (PL184)');
select t.ok(wallet_refunded('pay_pg00002') = 'refunded', 'a refund of the one month');
reset role;
select t.ok((select until from private.pink_gold where user_id = :'p') between now() + interval '3 months' - interval '1 minute' and now() + interval '3 months',
  'takes that month off the end');

-- Boosts: 6 + 6 bought, then no more waiting; each lapses a month after buying.
set role service_role;
select wallet_open_order(:'p', 'b6', 'order_pb00001');
select wallet_paid('order_pb00001', 'pay_pb00001', 69900);
select wallet_open_order(:'p', 'b6', 'order_pb00002');
select wallet_paid('order_pb00002', 'pay_pb00002', 69900);
select t.ok(t.sqlstate(format($$select wallet_open_order(%L, 'b1', 'order_pb00003')$$, :'p')) = 'PL186', 'twelve bought Boosts waiting at most (PL186)');
reset role;
select t.ok((select count(*) from private.boosts where user_id = :'p' and source = 'bought' and expires_at between now() + interval '1 month' - interval '1 minute' and now() + interval '1 month') = 12,
  'each bought Boost lapses a month after buying');

set role authenticated;
select t.as_user(:'p');
select t.ok((my_wallet() ->> 'gold')::boolean and (my_wallet() ->> 'boosts')::int = 14, 'P''s wallet: Pink Gold on, 12 bought Boosts and 2 free for the month');
select t.ok((my_wallet() ->> 'boosts')::int = 14, 'the month''s free Boosts come once');
select wallet_boost();
select t.ok((my_wallet() ->> 'boosts')::int = 13 and (my_wallet() ->> 'boost_until')::timestamptz > now() + interval '23 hours', 'using one: 24 hours first on Discover');
reset role;
select t.ok((select source from private.boosts where user_id = :'p' and used_at is not null) = 'member', 'the one that lapses first goes first');
set role service_role;
select wallet_refunded('pay_pb00002');
reset role;
select t.ok(private.boosts_left(:'p') = 7, 'a refunded pack takes back its Boosts not used');
update private.boosts set expires_at = now() - interval '1 second' where user_id = :'p' and ref = 'order_pb00001' and slot = 1;
select t.ok(private.boosts_left(:'p') = 6, 'a lapsed Boost cannot be used');

-- Discover: boosted cards first, then members, then the rest.
select private.pink_gold_grant(:'r');
set role authenticated;
select t.as_user(:'s');
select t.ok((select array_agg(id::text) from (select id from discover(20) limit 2) d) = array[:'p', :'r'], 'S sees P (boosted) first, then R (Pink Gold)');
reset role;

-- Open asks: members get 15; everyone else stays at 3 (plus 2 bought with credits).
insert into auth.users (id) select ('00000000-0000-0000-0000-0000000603' || lpad(g::text, 2, '0'))::uuid from generate_series(1, 16) g;
insert into public.profiles (id, name, age, area, city) select ('00000000-0000-0000-0000-0000000603' || lpad(g::text, 2, '0'))::uuid, 'Asked', 25, 'Juhu', 'Goldtown' from generate_series(1, 16) g;
insert into public.invites (from_id, to_id, idea_id, minutes, starts_at, expires_at, place, status, created_at)
  select :'p', ('00000000-0000-0000-0000-0000000603' || lpad(g::text, 2, '0'))::uuid, 'boba_run', 25, now() + interval '2 days', now() + interval '1 day', 'Carter Road', 'sent', now() - interval '2 days'
  from generate_series(1, 14) g;
insert into public.invites (from_id, to_id, idea_id, minutes, starts_at, expires_at, place, status, created_at)
  select :'s', ('00000000-0000-0000-0000-0000000603' || lpad(g::text, 2, '0'))::uuid, 'boba_run', 25, now() + interval '2 days', now() + interval '1 day', 'Carter Road', 'sent', now() - interval '2 days'
  from generate_series(1, 3) g;
set role authenticated;
select t.as_user(:'p');
select send_invite('00000000-0000-0000-0000-000000060315', 'boba_run', now() + interval '2 days', 'Carter Road', null);
select t.ok(t.sqlstate($$select send_invite('00000000-0000-0000-0000-000000060316', 'boba_run', now() + interval '2 days', 'Carter Road', null)$$) = 'PL187',
  'a member can have 15 asks open, never 16 (PL187)');
select t.as_user(:'s');
select t.ok(t.sqlstate($$select send_invite('00000000-0000-0000-0000-000000060316', 'boba_run', now() + interval '2 days', 'Carter Road', null)$$) = 'PL023',
  'everyone else stays at 3 (PL023)');
select t.as_user(:'p');
select t.ok(jsonb_array_length(export_my_data() -> 'boosts') = 8 and (export_my_data() -> 'pink_gold' ->> 'now')::boolean, 'P''s download has the membership and every Boost (the refunded pack''s are gone)');
reset role;

-- No client can buy, deliver or read any of it.
set role authenticated;
select t.as_user(:'s');
select t.ok(t.fails('select * from private.boosts') and t.fails(format($$select private.shop_deliver(%L, 'g12', 'order_x00001')$$, :'s'))
  and t.fails(format($$select private.member_boosts(%L)$$, :'s')) and t.fails(format($$select wallet_open_order(%L, 'g1', 'order_x00002')$$, :'s'))
  and t.fails($$select wallet_paid('order_pg00001', 'pay_x', 159900)$$), 'S cannot read Boosts, give themselves a plan, or open or pay an order');
select t.ok(not (my_wallet() ->> 'gold')::boolean and (my_wallet() ->> 'boosts')::int = 0, 'S has no Pink Gold and no Boosts');
reset role;
