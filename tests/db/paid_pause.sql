-- Payments paused (D117), last. People of their own: M, N and K (Spicy on), O (Saathi), Q (gets
-- Pink Gold days and Boosts as a reward).
\set ON_ERROR_STOP on
\pset tuples_only on
\set m '00000000-0000-0000-0000-000000070101'
\set n '00000000-0000-0000-0000-000000070102'
\set o '00000000-0000-0000-0000-000000070103'
\set q '00000000-0000-0000-0000-000000070104'
\set k '00000000-0000-0000-0000-000000070105'
insert into auth.users (id, email) values (:'m', 'm@example.test'), (:'n', 'n@example.test'), (:'o', 'o@example.test'), (:'q', 'q@example.test'), (:'k', 'k@example.test');
insert into public.profiles (id, name, age, area, city) values (:'m', 'Mira', 25, 'Bandra West', 'Pausetown'),
  (:'n', 'Neel', 26, 'Khar West', 'Pausetown'), (:'o', 'Ojas', 24, 'Juhu', 'Pausetown'), (:'q', 'Qadir', 27, 'Juhu', 'Pausetown'),
  (:'k', 'Kavya', 25, 'Juhu', 'Pausetown');

-- The deploy sets the switch from PAID_FEATURES; unset, it is off.
select private.set_config('paid', 'false');
select t.ok(not private.paid_on(), 'the switch is off');

-- =============================================================================================
-- Nothing can be bought: packs, plans and Boost packs are all refused before any order is filed.
-- =============================================================================================
set role service_role;
select t.ok(t.sqlstate(format($$select wallet_open_order(%L, 'p49', 'order_pause1')$$, :'m')) = 'PL188'
  and t.sqlstate(format($$select wallet_open_order(%L, 'g1', 'order_pause2')$$, :'m')) = 'PL188'
  and t.sqlstate(format($$select wallet_open_order(%L, 'b6', 'order_pause3')$$, :'m')) = 'PL188', 'no pack, plan or Boost pack can be ordered (PL188)');
select t.ok(app_switches() = '{"paid": false}'::jsonb, 'the wallet function reads the switch and makes no Razorpay order');
reset role;
select t.ok(not exists (select 1 from private.wallet_orders where order_id like 'order_pause%'), 'and nothing was filed');

-- =============================================================================================
-- Rewards instead: the team gives Pink Gold days and Boosts. They work as if bought.
-- =============================================================================================
select private.pink_gold_gift(:'q', 7, 'referral');
select t.ok(private.is_pink_gold(:'q') and (select until from private.pink_gold where user_id = :'q') between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute',
  'a gift of 7 days of Pink Gold starts now');
select private.pink_gold_gift(:'q', 7);
select t.ok((select until from private.pink_gold where user_id = :'q') > now() + interval '13 days 23 hours'
  and (select note from private.pink_gold where user_id = :'q') = 'referral', 'a second gift adds to the end and keeps the note');
select private.pink_gold_grant(:'k');
select private.pink_gold_gift(:'k', 30);
select t.ok((select until from private.pink_gold where user_id = :'k') is null, 'Pink Gold granted for good stays for good');
select t.ok(t.sqlstate(format('select private.pink_gold_gift(%L, 0)', :'q')) = 'PL191' and t.sqlstate(format('select private.pink_gold_gift(%L, 400)', :'q')) = 'PL191',
  'a gift is 1 to 366 days (PL191)');
select private.boost_gift(:'q', 2, 'referral:friend1');
select private.boost_gift(:'q', 2, 'referral:friend1');
select t.ok((select count(*) from private.boosts where user_id = :'q' and source = 'gift') = 2, 'Boosts given once per reason, however often it is run');
select t.ok(t.sqlstate(format($$select private.boost_gift(%L, 13, 'x')$$, :'q')) = 'PL191' and t.sqlstate(format($$select private.boost_gift(%L, 1, '')$$, :'q')) = 'PL191',
  'a Boost gift is 1 to 12, with a reason (PL191)');
set role authenticated;
select t.as_user(:'q');
select wallet_boost();
reset role;
select t.ok((select count(*) from private.boosts where user_id = :'q' and used_at is not null) = 1, 'a given Boost is used like a bought one');

-- =============================================================================================
-- Treat the plan and paid listener calls wait; the free first call does not.
-- =============================================================================================
set role authenticated;
select t.as_user(:'m');
select t.ok(t.sqlstate(format($$select treat_plan(%L, 'any', 'coffee')$$, gen_random_uuid())) = 'PL188', 'no treat while paused (PL188)');
select t.ok(t.sqlstate(format('select talk_call(%L, 10, false)', :'n')) = 'PL188', 'no paid listener call while paused (PL188)');
select t.ok(t.sqlstate(format('select talk_call(%L, 15, true)', :'n')) = 'PL158', 'the free first call goes on to its own checks');
select t.ok((talk_state() ->> 'paused')::boolean, 'the Talk page is told payments are paused');

-- =============================================================================================
-- Saathi: one free 15-minute session a day.
-- =============================================================================================
select t.as_user(:'o');
select t.ok(not (talk_state() ->> 'saathi_used_today')::boolean, 'today''s free session is there');
select talk_ai_session(null) ->> 'chat' as ochat \gset
select t.ok((talk_state() ->> 'saathi_used_today')::boolean, 'today''s free session is marked used');
reset role;
select t.ok((select paid_until from private.talk_ai_chats where id = :'ochat') > now() + interval '14 minutes', 'the first session today is free and lasts 15 minutes');
set role authenticated;
select t.as_user(:'o');
select t.ok(t.sqlstate(format('select talk_ai_session(%L)', :'ochat')) = 'PL182', 'no second session while time is left (PL182)');
reset role;
update private.talk_ai_chats set paid_until = now() - interval '1 minute' where id = :'ochat';
set role authenticated;
select t.as_user(:'o');
select t.ok(t.sqlstate(format('select talk_ai_session(%L)', :'ochat')) = 'PL189', 'after it, nothing more today (PL189)');
reset role;
select t.ok(not exists (select 1 from private.wallet_ledger where user_id = :'o'), 'and no credits were taken');
update private.saathi_free_days set day = day - 1 where user_id = :'o';
set role authenticated;
select t.as_user(:'o');
select t.ok((talk_ai_session(:'ochat') ->> 'charged')::int = 0, 'the next day there is a new free session');
select t.ok(jsonb_array_length(export_my_data() -> 'free_saathi_days') = 2, 'the download lists the free Saathi days');
reset role;
-- A chat that mentioned self-harm stays free, whatever the day's count.
update private.talk_ai_chats set harm = true, paid_until = now() - interval '1 minute' where id = :'ochat';
set role authenticated;
select t.as_user(:'o');
select t.ok((talk_ai_session(:'ochat') ->> 'free')::boolean, 'a chat that mentioned self-harm is never cut off');
reset role;

-- =============================================================================================
-- Spicy mode: a free unlock, one per person per 7 days.
-- =============================================================================================
insert into private.spicy (user_id, discord, adult_at, rules_at) values (:'m', 'mira.k', now(), now()), (:'n', 'neel.k', now(), now()), (:'k', 'kavya.k', now(), now());
insert into public.consents (user_id, kind, version) select u, 'spicy', 'spicy-' || private.spicy_terms_version() from unnest(array[:'m', :'n', :'k']::uuid[]) u;
insert into private.discover_seen (user_id, card_id) values (:'m', :'n'), (:'n', :'m'), (:'m', :'k'), (:'k', :'m');
-- N paid 300 towards the match before the pause (payments on then).
select private.set_config('paid', 'true');
insert into private.wallets (user_id, paid) values (:'n', 300) on conflict (user_id) do update set paid = 300;
set role authenticated;
select t.as_user(:'m');
select spicy_yes(:'n', true);
select spicy_yes(:'k', true);
select t.as_user(:'n');
select spicy_yes(:'m', true);
select spicy_pay(:'m', 'half');
reset role;
select t.ok((select paid from private.wallets where user_id = :'n') = 0, 'N paid half of the unlock before the pause');
select private.set_config('paid', 'false');
set role authenticated;
select t.as_user(:'m');
select t.ok((spicy_with(:'n') -> 'unlock' ->> 'free')::boolean and (spicy_with(:'n') -> 'unlock' ->> 'free_next') is null, 'the unlock says it is free, and M''s is open now');
select t.ok((spicy_pay(:'n', 'full') -> 'unlock' ->> 'done')::boolean, 'M unlocks the match with N for free');
reset role;
select t.ok((select paid from private.wallets where user_id = :'n') = 300 and (select paid_a + paid_b from private.spicy_unlocks where :'n'::uuid in (a, b) and :'m'::uuid in (a, b)) = 0,
  'and what N had paid towards it went back');
set role authenticated;
select t.as_user(:'m');
select t.ok((spicy_with(:'n') -> 'unlock' ->> 'free_next') is not null, 'and the next free one opens in 7 days');
select t.as_user(:'k');
select spicy_yes(:'m', true);
select t.as_user(:'m');
select t.ok(t.sqlstate(format($$select spicy_pay(%L, 'full')$$, :'k')) = 'PL190', 'M cannot unlock a second match this week (PL190)');
select t.as_user(:'k');
select t.ok((spicy_pay(:'m', 'full') -> 'unlock' ->> 'done')::boolean, 'but K can, with K''s own free unlock');
select t.ok(t.sqlstate(format($$select spicy_pay(%L, 'full')$$, :'m')) = 'PL145', 'nothing more once unlocked (PL145)');
reset role;
select t.ok((select free_by from private.spicy_unlocks where a = least(:'m'::uuid, :'k'::uuid) and b = greatest(:'m'::uuid, :'k'::uuid)) = :'k', 'the unlock remembers whose free one it was');

-- =============================================================================================
-- Payments back on: everything is as it was, with no code change.
-- =============================================================================================
select private.set_config('paid', 'true');
set role authenticated;
select t.as_user(:'o');
select t.ok(app_switches() = '{"paid": true}'::jsonb and not (talk_state() ->> 'paused')::boolean, 'switched on, the app is told at once');
reset role;
update private.talk_ai_chats set harm = false, paid_until = now() - interval '1 minute' where id = :'ochat';
set role authenticated;
select t.as_user(:'o');
select t.ok(t.sqlstate(format('select talk_ai_session(%L)', :'ochat')) = 'PL132', 'a Saathi session costs credits again (PL132 with none)');
reset role;
set role service_role;
select t.ok((wallet_open_order(:'m', 'g1', 'order_pause9') ->> 'paise')::int = 69900, 'and Pink Gold can be ordered again');
reset role;
select private.set_config('paid', 'false');
