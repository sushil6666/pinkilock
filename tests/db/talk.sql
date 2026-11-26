-- Talk mode (D107) and the free first call (D108), after calls.sql. People of their own: Asha (a
-- caller, a woman), Lata (a listener, a woman, takes calls from anyone), Manu (a listener, a man,
-- takes calls from men only), Ravi (a caller, a man), Fiza (joins with Asha's link) and Kiran
-- (anonymous, cannot listen).
\set ON_ERROR_STOP on
\pset tuples_only on
\ir talk_cases.sql
\set a '00000000-0000-0000-0000-00000007a1c1'
\set l '00000000-0000-0000-0000-00000007a1c2'
\set m '00000000-0000-0000-0000-00000007a1c3'
\set r '00000000-0000-0000-0000-00000007a1c4'
\set f '00000000-0000-0000-0000-00000007a1c5'
\set k '00000000-0000-0000-0000-00000007a1c6'
insert into auth.users (id, email, is_anonymous) values (:'a', 'asha@example.test', false), (:'l', 'lata@example.test', false), (:'m', 'manu@example.test', false),
  (:'r', 'ravi@example.test', false), (:'f', null, true), (:'k', null, true);
insert into public.profiles (id, name, age, area, city) values (:'a', 'Asha Rao', 25, 'Bandra West', 'Talktown'), (:'l', 'Lata', 31, 'Khar West', 'Talktown'),
  (:'m', 'Manu', 29, 'Juhu', 'Talktown'), (:'r', 'Ravi', 27, 'Versova', 'Talktown'), (:'f', 'Fiza', 24, 'Juhu', 'Talktown'), (:'k', 'Kiran', 22, 'Juhu', 'Talktown');
insert into private.wallets (user_id, paid, earned) values (:'a', 400, 20), (:'r', 50, 200);

-- The shared tables: SQL decides as src/domain/talk.ts does.
select t.ok(bad is null, coalesce('every shared match line gives the same answer in SQL (' || bad || ')', 'every shared match line gives the same answer in SQL'))
  from (select string_agg(format('%s/%s/%s/%s', caller_sex, want, listener_sex, accepts), '; ')
          filter (where private.talk_match(caller_sex, want, listener_sex, accepts) is distinct from ok) as bad from match_cases) q;
select t.ok(bad is null, coalesce('every shared self-harm line gives the same answer in SQL (' || bad || ')', 'every shared self-harm line gives the same answer in SQL'))
  from (select string_agg(body, '; ') filter (where private.mentions_harm(body) is distinct from harm) as bad from harm_cases) q;
select t.ok(bad is null, coalesce('every shared split line gives the same answer in SQL (' || bad || ')', 'every shared split line gives the same answer in SQL'))
  from (select string_agg(k.minutes::text, '; ') filter (where (s.gross, s.host, s.pinkilock, s.gst, s.tds, s.payout) is distinct from (k.gross, k.host, k.pinkilock, k.gst, k.tds, k.payout)) as bad
        from split_cases k, lateral private.talk_split(k.minutes) s) q;

set role authenticated;
select t.ok(t.fails('select * from private.talk_people') and t.fails('select * from private.talk_calls') and t.fails('select * from private.talk_reports')
  and t.fails('select * from private.talk_payouts') and t.fails('select * from private.talk_listeners') and t.fails('select * from private.talk_ai_chats'),
  'no client can read any Talk table');

-- Settings: who I am and whom I would like to talk to.
select t.as_user(:'a');
select t.ok((select talk_state() ->> 'sex') is null and (select talk_state() ->> 'free_call') = 'locked'
  and (select talk_state() ->> 'referral_code') ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$', 'a new caller: no settings, the free call locked, a referral code');
select t.ok(t.sqlstate('select talk_listeners()') = 'PL154', 'no listeners before I say who I am (PL154)');
select t.ok(t.sqlstate($$select talk_settings('unsaid', 'opposite')$$) = 'PL154' and t.sqlstate($$select talk_settings('other', 'anyone')$$) = 'PL154',
  '"opposite" and "same" need woman or man (PL154)');
select talk_settings('woman', 'anyone');

-- Listeners: an adult with a phone or an email, a first name, topics, the code.
select t.as_user(:'k');
select t.ok(t.sqlstate($$select talk_listener_apply('Kiran', 'man', 'anyone', array['lonely'], 1)$$) = 'PL163', 'an anonymous account cannot listen (PL163)');
select t.as_user(:'l');
select t.ok(t.sqlstate($$select talk_listener_apply('Lata Rao', 'woman', 'anyone', array['lonely'], 1)$$) = 'PL160'
  and t.sqlstate($$select talk_listener_apply('L@ta', 'woman', 'anyone', array['lonely'], 1)$$) = 'PL160', 'a first name only, with no symbols (PL160)');
select t.ok(t.sqlstate($$select talk_listener_apply('Lata', 'woman', 'anyone', array['dating'], 1)$$) = 'PL161'
  and t.sqlstate($$select talk_listener_apply('Lata', 'woman', 'anyone', '{}'::text[], 1)$$) = 'PL161', 'topics from the list, one to four (PL161)');
select t.ok(t.sqlstate($$select talk_listener_apply('Lata', 'woman', 'anyone', array['lonely'], 0)$$) = 'PL162', 'the code must be agreed (PL162)');
select t.ok((talk_listener_apply('Lata', 'woman', 'anyone', array['lonely', 'breakup'], 1) -> 'listener' ->> 'status') = 'applied', 'Lata applied');
select t.ok(t.sqlstate('select talk_listener_available(true)') = 'PL165', 'not verified: cannot take calls yet (PL165)');
select t.ok(t.fails($$select talk_kyc_done(auth.uid(), 'acc_FAKE123456', '1234')$$) and t.fails($$select talk_listener_decide(auth.uid(), 'verified')$$),
  'and cannot mark herself checked or verified');
select t.as_user(:'m');
select talk_listener_apply('Manu', 'man', 'men', array['work'], 1);
reset role;
-- The Edge Function after Razorpay Route's KYC, then a person at Pinkilock.
select t.ok(t.sqlstate($$select talk_listener_decide('00000000-0000-0000-0000-00000007a1c2', 'verified')$$) = 'PL165', 'no verifying before the bank is checked');
select talk_kyc_done(:'l', 'acc_LATA123456', '4321');
select talk_kyc_done(:'m', 'acc_MANU123456', '9876');
select talk_listener_decide(:'l', 'verified');
select talk_listener_decide(:'m', 'verified');
set role authenticated;
select t.as_user(:'l');
select t.ok((talk_listener_available(true) -> 'listener' ->> 'available_until') is not null, 'Lata, verified, takes calls for two hours');
select t.as_user(:'m');
select talk_listener_available(true);

-- Matching: Asha (a woman) sees Lata, not Manu (men only); with "same", Lata; with "opposite", nobody.
select t.as_user(:'a');
select t.ok((select string_agg(x ->> 'first_name', ',') from jsonb_array_elements(talk_listeners()) x) = 'Lata', 'Asha sees Lata, not Manu who takes calls from men');
select talk_settings('woman', 'opposite');
select t.ok(jsonb_array_length(talk_listeners()) = 0, 'with "opposite", Manu still does not take calls from her');
select talk_settings('woman', 'same');
select t.ok(jsonb_array_length(talk_listeners()) = 1, 'with "same", Lata');
select t.ok(t.sqlstate(format('select talk_call(%L, 10, false)', :'m')) = 'PL155', 'calling Manu anyway is refused (PL155)');
select t.as_user(:'r');
select talk_settings('man', 'anyone');
select t.ok(jsonb_array_length(talk_listeners()) = 2, 'Ravi sees both');
select t.ok(t.sqlstate(format('select talk_call(%L, 20, false)', :'m')) = 'PL139', 'a call is paid from bought credits: Ravi has 50 (PL139)');
select t.ok(t.sqlstate(format('select talk_call(%L, 25, false)', :'m')) = 'PL156', 'a length off the list (PL156)');
select t.ok(t.sqlstate(format('select talk_call(%L, 10, true)', :'m')) = 'PL167', 'no free call before it is unlocked (PL167)');

-- A call: 300 held for 30 minutes; the timer; only minutes together are charged.
select t.as_user(:'a');
select t.ok((talk_call(:'l', 30, false) -> 'call' ->> 'status') = 'ringing' and (my_wallet() ->> 'paid')::int = 100, 'Asha rings Lata: 300 bought credits held');
select t.ok(t.sqlstate(format('select talk_call(%L, 10, false)', :'l')) = 'PL170', 'one call at a time (PL170)');
select t.ok(jsonb_array_length(talk_listeners()) = 0, 'a listener on a call is not listed');
reset role;
create temp table c1 as select id from private.talk_calls where caller = :'a' and status = 'ringing';
grant select on c1 to authenticated;
set role authenticated;
select t.as_user(:'r');
select t.ok(t.sqlstate(format('select talk_answer(%L, true)', (select id from c1))) = 'PL166' and t.sqlstate(format('select talk_beat(%L)', (select id from c1))) = 'PL166',
  'Ravi cannot answer or check in on a call that is not his (PL166)');
select t.as_user(:'l');
select t.ok((talk_state() -> 'call' ->> 'name') = 'Asha' and (talk_state() -> 'call' ->> 'listening')::boolean, 'Lata sees it ringing, from "Asha" (first name only)');
select t.ok((talk_answer((select id from c1), true) -> 'call' ->> 'status') = 'live', 'Lata picks up');
reset role;
-- Seven minutes together, then Lata stays on two more alone.
insert into private.talk_minutes (call_id, user_id, minute)
  select (select id from c1), u, date_trunc('minute', now()) - make_interval(mins => n) from unnest(array[:'a', :'l']::uuid[]) u, generate_series(2, 8) n;
insert into private.talk_minutes (call_id, user_id, minute) select (select id from c1), :'l', date_trunc('minute', now()) - make_interval(mins => n) from generate_series(9, 10) n;
set role authenticated;
select t.as_user(:'a');
select t.ok((talk_state() -> 'call' ->> 'together')::int = 7 and (talk_state() -> 'call' ->> 'name') = 'Lata', 'Asha sees seven minutes together with Lata');
select t.ok((talk_end((select id from c1)) -> 'call' ->> 'end') = 'talked', 'Asha hangs up: talked');
select t.ok((my_wallet() ->> 'paid')::int = 330 and (talk_state() -> 'call' ->> 'charged')::int = 70 and (talk_state() -> 'call' ->> 'refunded')::int = 230,
  '70 charged for 7 minutes, 230 back');
select t.ok(t.sqlstate(format('select talk_beat(%L)', (select id from c1))) = 'PL166', 'an ended call takes no more check-ins (PL166)');
reset role;
select t.ok((select (status, minutes, gross, host, tds, payout, free) = ('waiting', 7, 5320, 3192, 6, 3186, false) from private.talk_payouts where call_id = (select id from c1)),
  'the payout waits 7 days: 60% of 7 minutes, less TDS');
select t.ok((select route_account = 'acc_LATA123456' from private.talk_payouts where call_id = (select id from c1)), 'to Lata''s Route account');
-- A report after the call holds it for a person.
set role authenticated;
select t.as_user(:'a');
select t.ok(t.sqlstate(format($$select talk_report(%L, 'flirty')$$, (select id from c1))) = 'PL173', 'a report needs a reason from the list (PL173)');
select talk_report((select id from c1), 'contact');
reset role;
select t.ok((select status from private.talk_payouts where call_id = (select id from c1)) = 'held' and (select count(*) from private.talk_reports where reporter = :'a') = 1,
  'a caller''s report holds the payout and files the report');
set role authenticated;
select t.as_user(:'a');
select talk_settings('woman', 'anyone');
select t.ok(jsonb_array_length(talk_listeners()) = 0, 'and Asha never sees Lata again in Talk mode');

-- Ringing nobody answers: everything comes back.
select t.as_user(:'r');
reset role;
update private.wallets set paid = 200 where user_id = :'r';
set role authenticated;
select talk_call(:'m', 20, false);
reset role;
update private.talk_calls set rang_at = now() - interval '2 minutes' where caller = :'r' and status = 'ringing';
set role authenticated;
select t.ok((talk_state() -> 'call' ->> 'end') = 'missed' and (my_wallet() ->> 'paid')::int = 200, 'not answered in a minute: missed, all 200 back');
-- A listener declines.
select talk_call(:'m', 10, false);
select t.as_user(:'m');
select talk_answer((select (talk_state() -> 'call' ->> 'id')::uuid), false);
select t.as_user(:'r');
select t.ok((talk_state() -> 'call' ->> 'end') = 'declined' and (my_wallet() ->> 'paid')::int = 200, 'Manu says not now: all back');

-- A Pinkilock block ends a Talk call too.
select talk_call(:'m', 10, false);
select t.as_user(:'m');
select talk_answer((select (talk_state() -> 'call' ->> 'id')::uuid), true);
select block_user(:'r');
select t.as_user(:'r');
select t.ok((talk_state() -> 'call' ->> 'end') = 'blocked' and (my_wallet() ->> 'paid')::int = 200, 'a block anywhere ends the call; nothing was talked, so nothing is charged');

-- The free first call: a friend joins with my link and verifies.
select t.as_user(:'f');
select t.ok(t.sqlstate($$select talk_claim_referral('ZZZZZZZZ')$$) = 'PL168', 'an unknown code (PL168)');
reset role;
create temp table codes as select user_id, code from private.talk_referral_codes;
grant select on codes to authenticated;
set role authenticated;
select t.as_user(:'a');
select t.ok(t.sqlstate(format('select talk_claim_referral(%L)', (select code from codes where user_id = :'a'))) = 'PL168', 'never my own link (PL168)');
select t.as_user(:'f');
select t.ok((talk_claim_referral(lower((select code from codes where user_id = :'a'))) ->> 'free_call') = 'locked', 'Fiza joins with Asha''s link');
select t.ok(t.sqlstate(format('select talk_claim_referral(%L)', (select code from codes where user_id = :'a'))) = 'PL168', 'only once (PL168)');
select t.as_user(:'a');
select t.ok((talk_state() ->> 'friends_joined')::int = 1 and (talk_state() ->> 'friends_verified')::int = 0 and (talk_state() ->> 'free_call') = 'locked',
  'Fiza has not verified: Asha''s free call stays locked');
reset role;
update auth.users set is_anonymous = false, email = 'fiza@example.test' where id = :'f';
set role authenticated;
select t.ok((talk_state() ->> 'free_call') = 'ready' and (talk_state() ->> 'free_reason') = 'referral', 'Fiza verified: Asha''s free call is ready');
select t.as_user(:'r');
reset role;
update auth.users set created_at = now() - interval '8 days' where id = :'r';
set role authenticated;
select t.ok(t.sqlstate(format('select talk_claim_referral(%L)', (select code from codes where user_id = :'m'))) = 'PL168', 'a week after joining, a link is too late (PL168)');

-- The free call: 15 minutes, no credits held, Pinkilock pays the listener; used once it connects.
reset role;
update private.talk_listeners set available_until = now() + interval '1 hour' where user_id = :'m';
delete from private.talk_blocks where user_id = :'a';
set role authenticated;
select t.as_user(:'a');
select t.ok((talk_call(:'l', 10, true) -> 'call' ->> 'length')::int = 15 and (my_wallet() ->> 'paid')::int = 330, 'Asha''s free call: 15 minutes, nothing held');
select t.as_user(:'l');
select talk_answer((select (talk_state() -> 'call' ->> 'id')::uuid), true);
select talk_beat((select (talk_state() -> 'call' ->> 'id')::uuid));
select t.as_user(:'a');
select talk_beat((select (talk_state() -> 'call' ->> 'id')::uuid));
select talk_end((select (talk_state() -> 'call' ->> 'id')::uuid));
select t.ok((talk_state() ->> 'free_call') = 'used' and (talk_state() -> 'call' ->> 'charged')::int = 0 and (my_wallet() ->> 'paid')::int = 330,
  'a minute together: the free call is used, nothing charged');
reset role;
select t.ok((select free and minutes = 1 and payout = 455 from private.talk_payouts where listener = :'l' order by at desc limit 1), 'and Lata is paid for it');
set role authenticated;

-- The AI companion: only the Edge Function may charge, and a mention stops charging.
select t.as_user(:'a');
select t.ok(t.fails(format($$select talk_ai_turn(%L, null, 'hi')$$, :'a')) and t.fails(format('select talk_ai_flag(%L, null)', :'a')), 'a client cannot charge or flag an AI chat');
reset role;
create temp table chat as select (talk_ai_turn(:'a', null, 'I feel lonely in this new city') ->> 'chat')::uuid as id;
select t.ok((select (credits) from private.talk_ai_minutes where chat_id = (select id from chat)) = 3
  and (select earned from private.wallets where user_id = :'a') = 17, 'the first message costs a minute (3), earned credits first');
select t.ok(t.sqlstate(format($$select talk_ai_turn(%L, %L, 'and work is hard')$$, :'a', (select id from chat))) = 'PL159', 'one message at a time (PL159)');
update private.talk_people set last_ai_at = now() - interval '5 seconds' where user_id = :'a';
select t.ok((talk_ai_turn(:'a', (select id from chat), 'and work is hard') ->> 'charged')::int = 0, 'the same minute is not charged twice');
update private.talk_ai_minutes set minute = minute - interval '1 minute' where chat_id = (select id from chat);
update private.talk_people set last_ai_at = now() - interval '5 seconds' where user_id = :'a';
select t.ok((talk_ai_turn(:'a', (select id from chat), 'sometimes I want to die') ->> 'harm')::boolean, 'a mention of self-harm flags the chat');
update private.talk_ai_minutes set minute = minute - interval '1 minute' where chat_id = (select id from chat);
update private.talk_people set last_ai_at = now() - interval '5 seconds' where user_id = :'a';
select t.ok((talk_ai_turn(:'a', (select id from chat), 'ok') ->> 'charged')::int = 0 and (select earned from private.wallets where user_id = :'a') = 17,
  'and charges nothing for the rest of it');
select t.ok(not exists (select 1 from information_schema.columns where table_schema = 'private' and table_name like 'talk_ai%' and column_name in ('body', 'text', 'message', 'content')),
  'the words are never stored');
update private.talk_ai_days set messages = 250 where user_id = :'a';
update private.talk_people set last_ai_at = now() - interval '5 seconds' where user_id = :'a';
select t.ok(t.sqlstate(format($$select talk_ai_turn(%L, null, 'hi')$$, :'a')) = 'PL171', 'a day''s fair use (PL171)');

-- The day pass.
set role authenticated;
select t.as_user(:'a');
select t.ok((talk_ai_pass() ->> 'pass_until') is not null and t.sqlstate('select talk_ai_pass()') = 'PL172', 'a day pass (49), once at a time (PL172)');

-- Voice: only the two on a live call get a room.
reset role;
select t.ok(t.sqlstate(format('select talk_voice_room(%L, %L)', :'r', (select id from c1))) = 'PL166', 'no room for a call that is over, or not mine');

-- The data download, and deleting an account.
set role authenticated;
select t.as_user(:'a');
select t.ok((export_my_data() ->> 'format') = 'pinkilock-export-11' and jsonb_array_length(export_my_data() -> 'talk' -> 'calls') >= 2
  and jsonb_array_length(export_my_data() -> 'talk' -> 'ai_chats') = 1 and jsonb_array_length(export_my_data() -> 'talk' -> 'reports_made') = 1
  and (export_my_data() -> 'wallet' ->> 'paid') is not null, 'the download (format 11) has Talk mode, and everything before it');
select t.as_user(:'l');
select t.ok((export_my_data() -> 'talk' -> 'listener' ->> 'first_name') = 'Lata' and jsonb_array_length(export_my_data() -> 'talk' -> 'listener' -> 'payouts') = 2,
  'a listener''s download has her payouts');
select delete_my_account();
reset role;
select t.ok((select count(*) from private.talk_payouts where listener is null) = 2 and not exists (select 1 from private.talk_listeners where user_id = :'l'),
  'deleting the account deletes the listener; the payout records stay for the books, without her id');
select t.ok((select count(*) from cron.job where jobname in ('pinkilock-talk', 'pinkilock-talk-payouts')) = 2, 'the sweep and the payouts are scheduled');
