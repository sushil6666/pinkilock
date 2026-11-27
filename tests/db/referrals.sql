-- Bring a friend (D118), after pink_gold.sql. People of their own: Rani (invites friends), Farah,
-- Gopal, Hema, Ishaan, Jaya and Kunal (her friends), Sameer (a second account on Rani's phone),
-- Bela (blocks Rani), Dev (joins Rani's duo) and Neel (whose account is too old for a link).
\set ON_ERROR_STOP on
\pset tuples_only on
\set r '00000000-0000-0000-0000-0000000fe001'
\set f '00000000-0000-0000-0000-0000000fe002'
\set g '00000000-0000-0000-0000-0000000fe003'
\set h '00000000-0000-0000-0000-0000000fe004'
\set i '00000000-0000-0000-0000-0000000fe005'
\set j '00000000-0000-0000-0000-0000000fe006'
\set k '00000000-0000-0000-0000-0000000fe007'
\set s '00000000-0000-0000-0000-0000000fe008'
\set b '00000000-0000-0000-0000-0000000fe009'
\set d '00000000-0000-0000-0000-0000000fe00a'
\set n '00000000-0000-0000-0000-0000000fe00b'
insert into auth.users (id, email, phone, phone_confirmed_at) values (:'r', 'rani@example.test', '+919800000001', now()),
  (:'f', null, null, null), (:'g', null, null, null), (:'h', null, null, null), (:'i', null, null, null), (:'j', null, null, null), (:'k', null, null, null),
  (:'s', null, null, null), (:'b', null, null, null), (:'d', null, null, null), (:'n', null, null, null);
update auth.users set created_at = now() - interval '30 days' where id = :'n';
insert into public.profiles (id, name, age, area, city) values (:'r', 'Rani', 25, 'Juhu', 'Friendtown'), (:'f', 'Farah', 24, 'Juhu', 'Friendtown'),
  (:'g', 'Gopal', 26, 'Juhu', 'Friendtown'), (:'h', 'Hema', 23, 'Juhu', 'Friendtown'), (:'i', 'Ishaan', 27, 'Juhu', 'Friendtown'),
  (:'j', 'Jaya', 24, 'Juhu', 'Friendtown'), (:'k', 'Kunal', 28, 'Juhu', 'Friendtown'), (:'s', 'Sameer', 25, 'Juhu', 'Friendtown'),
  (:'b', 'Bela', 22, 'Juhu', 'Friendtown'), (:'d', 'Dev', 26, 'Juhu', 'Friendtown'), (:'n', 'Neel', 29, 'Juhu', 'Friendtown');

-- A friend who has done everything: a verified phone, an approved face photo, a plan, a device.
create function t.finish(p_user uuid, p_device text) returns void language plpgsql security definer as $$
begin
  update auth.users set phone = '+9198' || lpad((abs(hashtext(p_user::text)) % 100000000)::text, 8, '0'), phone_confirmed_at = now() where id = p_user;
  insert into public.photos (profile_id, path, bytes, kind, status) values (p_user, p_user || '/face.jpg', 10, 'face', 'approved') on conflict do nothing;
  update public.profiles set idea_ids = array[(select id from public.ideas order by id limit 1)] where id = p_user;
  insert into private.devices (user_id, device) values (p_user, p_device) on conflict do nothing;
end $$;
create function t.gold_days(p_user uuid) returns int language sql security definer as $$
  select coalesce((select round(extract(epoch from (until - now())) / 86400)::int from private.pink_gold where user_id = p_user and private.is_pink_gold(p_user)), 0);
$$;
create function t.gift_boosts(p_user uuid) returns int language sql security definer as $$
  select count(*)::int from private.boosts where user_id = p_user and source = 'gift' and ref like 'gift:referral:%';
$$;
grant execute on function t.gold_days(uuid), t.gift_boosts(uuid) to authenticated;

set role authenticated;
select t.as_user(:'r');
select t.ok((my_referrals() ->> 'code') ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$' and (my_referrals() ->> 'joined')::int = 0
  and (my_referrals() ->> 'counted')::int = 0 and my_referrals() -> 'mine' = 'null'::jsonb and (my_referrals() ->> 'needs_phone')::boolean,
  'Rani has a link, no friends yet, and joined with nobody''s link; a phone is needed by default');
select t.ok(t.sqlstate($$select note_device('short')$$) = 'PL192' and t.sqlstate($$select note_device(null)$$) = 'PL192', 'a device id that is not one (PL192)');
select note_device('rani-phone-0000000001');
select note_device('rani-phone-0000000001');
reset role;
select t.ok((select count(*) from private.devices where user_id = :'r') = 1, 'the same device, noted twice, is one row');
create temp table rcode as select code from private.talk_referral_codes where user_id = :'r';
grant select on rcode to authenticated;

-- Farah joins with Rani's link, and sees what is still to do.
set role authenticated;
select t.as_user(:'f');
select talk_claim_referral((select code from rcode));
select t.ok((my_referrals() -> 'mine') = '{"phone": false, "face": false, "plans": false, "device": false, "counted": false, "via": "link"}'::jsonb,
  'Farah joined with a link: her checklist shows all four still to do');
select t.as_user(:'r');
select t.ok((my_referrals() ->> 'joined')::int = 1 and (my_referrals() ->> 'counted')::int = 0 and t.gold_days(:'r') = 0,
  'Rani: one friend joined, none counts yet, nothing given');
select t.ok(not (my_referrals()::text ~ 'Farah|fe002'), 'and Rani is not told who joined');
reset role;
update auth.users set email = 'farah@example.test', is_anonymous = false where id = :'f';
select t.finish(:'f', 'farah-phone-000000001');
update auth.users set phone_confirmed_at = null where id = :'f';
set role authenticated;
select t.as_user(:'r');
select t.ok((my_referrals() ->> 'counted')::int = 0, 'a verified email is not a verified phone: Farah does not count yet');
reset role;
update auth.users set phone_confirmed_at = now() where id = :'f';
set role authenticated;
select t.ok((my_referrals() ->> 'counted')::int = 1 and t.gold_days(:'r') = 7 and t.gift_boosts(:'r') = 1,
  'Farah has done everything: Rani gets 7 days of Pink Gold and a free Boost');
select t.as_user(:'f');
select t.ok(t.gold_days(:'f') = 7 and (my_referrals() -> 'mine' ->> 'counted')::boolean and t.gift_boosts(:'f') = 0, 'and Farah gets 7 days of Pink Gold too');
select t.as_user(:'r');
select my_referrals();
reset role;
select private.referral_sweep();
select t.ok(t.gold_days(:'r') = 7 and t.gift_boosts(:'r') = 1 and (select count(*) from private.referral_rewards where friend = :'f') = 1,
  'given once, however often it is looked at or swept');

-- One device per account: Sameer is a second account on Rani's phone.
set role authenticated;
select t.as_user(:'s');
select talk_claim_referral((select code from rcode));
reset role;
select t.finish(:'s', 'rani-phone-0000000001');
select private.referral_sweep();
set role authenticated;
select t.as_user(:'s');
select t.ok(not (my_referrals() -> 'mine' ->> 'device')::boolean and not (my_referrals() -> 'mine' ->> 'counted')::boolean,
  'a second account on Rani''s own phone never counts');
select t.as_user(:'r');
select t.ok((my_referrals() ->> 'counted')::int = 1 and t.gold_days(:'r') = 7, 'and gives Rani nothing');
select t.ok(t.sqlstate(format('select talk_claim_referral(%L)', (select code from rcode))) = 'PL172', 'Rani cannot use her own link (PL172)');

-- A block between them: Bela never counts.
select t.as_user(:'b');
select talk_claim_referral((select code from rcode));
select block_user(:'r');
reset role;
select t.finish(:'b', 'bela-phone-0000000001');
select private.referral_sweep();
select t.ok(not exists (select 1 from private.referral_rewards where friend = :'b'), 'a friend with a block between them never counts');

-- An old account cannot use a link (D109's week).
set role authenticated;
select t.as_user(:'n');
select t.ok(t.sqlstate(format('select talk_claim_referral(%L)', (select code from rcode))) = 'PL172', 'an account older than a week cannot use a link (PL172)');

-- Dev joins Rani's duo with her Doubles invite: that is her link too.
select t.as_user(:'r');
create temp table duo_token as select create_duo_link() as token;
select t.as_user(:'d');
select join_duo((select token from duo_token));
reset role;
select t.ok((select referrer from private.talk_referrals where friend = :'d') = :'r' and (select via from private.talk_referrals where friend = :'d') = 'duo',
  'a new friend who joins Rani''s duo has joined with her link');
set role authenticated;
select t.as_user(:'d');
select t.ok((my_referrals() -> 'mine' ->> 'via') = 'duo', 'and Dev''s checklist says so');
select t.as_user(:'r');
select leave_duo();
reset role;

-- The phone rule can be switched off (OPERATIONS.md): then a verified email is enough.
select t.finish(:'d', 'dev-phone-00000000001');
update auth.users set phone_confirmed_at = null, email = 'dev@example.test', is_anonymous = false where id = :'d';
select private.referral_sweep();
select t.ok(not exists (select 1 from private.referral_rewards where friend = :'d'), 'with the phone rule on, Dev''s email is not enough');
select private.set_config('referral_needs_phone', 'false');
select private.referral_sweep();
select t.ok(exists (select 1 from private.referral_rewards where friend = :'d'), 'with it off, Dev counts');
select private.set_config('referral_needs_phone', 'true');

-- Five friends who count: Rani's free month, once.
set role authenticated;
select t.as_user(:'g');
select talk_claim_referral((select code from rcode));
select t.as_user(:'h');
select talk_claim_referral((select code from rcode));
select t.as_user(:'i');
select talk_claim_referral((select code from rcode));
select t.as_user(:'j');
select talk_claim_referral((select code from rcode));
reset role;
select t.finish(:'g', 'gopal-phone-000000001');
select t.finish(:'h', 'hema-phone-0000000001');
select private.referral_sweep();
set role authenticated;
select t.as_user(:'r');
select t.ok((my_referrals() ->> 'counted')::int = 4 and not (my_referrals() ->> 'month')::boolean and t.gold_days(:'r') = 28 and t.gift_boosts(:'r') = 4,
  'four friends count: 28 days and 4 Boosts, no month yet');
reset role;
select t.finish(:'i', 'ishaan-phone-00000001');
select t.finish(:'j', 'jaya-phone-0000000001');
set role authenticated;
select t.ok((my_referrals() ->> 'counted')::int = 6 and (my_referrals() ->> 'month')::boolean and t.gold_days(:'r') = 6 * 7 + 30 and t.gift_boosts(:'r') = 6,
  'the fifth friend gives a free month, once; the sixth gives a week and a Boost as before');
reset role;
select t.ok((select count(*) from private.referral_rewards where referrer = :'r' and month) = 1, 'one month row only');

-- At most 10 friends count in 30 days.
update private.referral_rewards set at = now() where referrer = :'r';
insert into auth.users (id) select ('00000000-0000-0000-0000-0000000fe1' || lpad(x::text, 2, '0'))::uuid from generate_series(1, 4) x;
insert into private.referral_rewards (friend, referrer, nth, at)
select ('00000000-0000-0000-0000-0000000fe1' || lpad(x::text, 2, '0'))::uuid, :'r', 100 + x, now() from generate_series(1, 4) x;
set role authenticated;
select t.as_user(:'k');
select talk_claim_referral((select code from rcode));
reset role;
select t.finish(:'k', 'kunal-phone-000000001');
select private.referral_sweep();
select t.ok(not exists (select 1 from private.referral_rewards where friend = :'k'), 'the 11th friend in 30 days waits');
update private.referral_rewards set at = now() - interval '31 days' where referrer = :'r' and friend <> :'k';
select private.referral_sweep();
select t.ok(exists (select 1 from private.referral_rewards where friend = :'k'), 'and counts once the window moves on');

-- My data download says what it gave me, and which devices I used.
set role authenticated;
select t.as_user(:'r');
select t.ok((export_my_data() -> 'referral_rewards' ->> 'friends_counted')::int >= 6 and (export_my_data() -> 'referral_rewards' ->> 'month')::boolean
  and jsonb_array_length(export_my_data() -> 'app_devices') = 1 and (export_my_data() ->> 'format') like 'pinkilock-export-%',
  'Rani''s download lists her rewards and her one device, and keeps the format name');

-- Nobody can read the tables, give rewards, or sweep.
select t.ok(t.fails('select * from private.devices') and t.fails('select * from private.referral_rewards')
  and t.fails(format('select private.referral_settle(%L)', :'k')) and t.fails('select private.referral_sweep()')
  and t.fails(format('select private.referral_check(%L)', :'k')), 'no client can read devices or rewards, or give or check one');
reset role;
