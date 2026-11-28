-- Daily relationship check-in (D126), after daily_question.sql. K checks in; L does not; M has no profile.
\set ON_ERROR_STOP on
\pset tuples_only on
\set k '00000000-0000-0000-0000-00000000af01'
\set l '00000000-0000-0000-0000-00000000af02'
\set m '00000000-0000-0000-0000-00000000af03'
insert into auth.users (id) values (:'k'), (:'l'), (:'m');
insert into public.profiles (id, name, age, area, city) values (:'k', 'Kavya', 26, 'Bandra', 'Mumbai'), (:'l', 'Laksh', 27, 'Khar', 'Mumbai');
insert into public.push_tokens (token, profile_id, platform) values ('ExponentPushToken[k]', :'k', 'android'), ('ExponentPushToken[l]', :'l', 'android');

set role authenticated;
select t.as_user(:'m');
select t.ok(t.sqlstate('select my_checkins()') = 'PL002', 'a profile first (PL002)');
select t.as_user(:'k');
select t.ok((select my_checkins() -> 'entries') = '[]'::jsonb and (select my_checkins() -> 'reminder_hour') = 'null'::jsonb, 'nothing yet, no reminder');
select t.ok(t.sqlstate($$select checkin_save('meh', '', '')$$) = 'PL237', 'a mood from the list (PL237)');
select t.ok(t.sqlstate(format('select checkin_save(%L, %L, %L)', 'good', repeat('x', 501), '')) = 'PL238', 'notes up to 500 characters (PL238)');
select t.ok((select checkin_save('hard', '  We laughed at dinner ', 'Argued about the weekend') -> 'entries' -> 0 ->> 'good') = 'We laughed at dinner', 'K checks in, trimmed');
select t.ok(t.sqlstate($$select checkin_save('good', '', '')$$) = 'PL239', 'once a day (PL239)');
select t.ok(not (select (my_checkins() -> 'entries' -> 0 ->> 'harm')::boolean), 'no harm mentioned');
select t.ok(t.fails('select * from private.rel_checkins') and t.fails(format('select checkin_ai_claim(%L)', :'k'))
  and t.fails(format('select checkin_ai_done(%L, %L, false)', :'k', 'x')), 'no client reads check-ins or writes the AI''s part');
select t.ok(t.sqlstate('select checkin_reminder(17)') = 'PL240' and (select (checkin_reminder(21) ->> 'reminder_hour')::int) = 21, 'a reminder between 6 and 10 pm (PL240)');
select t.as_user(:'l');
select t.ok((select my_checkins() -> 'entries') = '[]'::jsonb, 'L sees none of K''s');
select t.ok((select (checkin_save('rough', '', 'I want to die') -> 'entries' -> 0 ->> 'harm')::boolean), 'a mention of self-harm puts the help lines first');
select checkin_reminder(21);
reset role;

-- The Edge Function's part, as the service role: claim once, store, then no second claim.
set role service_role;
select t.ok((select checkin_ai_claim(:'k') ->> 'bad') = 'Argued about the weekend', 'the function reads K''s notes');
select t.ok((select checkin_ai_done(:'k', 'Try asking first.', false) -> 'entries' -> 0 ->> 'suggestion') = 'Try asking first.', 'and stores Saathi''s ideas');
select t.ok(t.sqlstate(format('select checkin_ai_claim(%L)', :'k')) = 'PL239', 'once a day');
select t.ok(t.sqlstate(format('select checkin_ai_claim(%L)', :'m')) = 'PL237', 'nothing to claim without a check-in');
reset role;

-- The reminder: at 21:00 Mumbai time, only to those who have not checked in that day.
select private.queue_checkin_reminders(((now() at time zone 'Asia/Kolkata')::date + 1 + time '21:05') at time zone 'Asia/Kolkata');
select t.ok((select count(*) from public.notifications where kind = 'checkin_daily' and recipient_id = :'k') = 1
  and (select count(*) from public.notifications where kind = 'checkin_daily' and recipient_id = :'l') = 1, 'tomorrow at nine, both are reminded');
select private.queue_checkin_reminders(((now() at time zone 'Asia/Kolkata')::date + 1 + time '21:40') at time zone 'Asia/Kolkata');
select t.ok((select count(*) from public.notifications where kind = 'checkin_daily') = 2, 'once a day');
select private.queue_checkin_reminders(((now() at time zone 'Asia/Kolkata')::date + 2 + time '20:05') at time zone 'Asia/Kolkata');
select t.ok((select count(*) from public.notifications where kind = 'checkin_daily') = 2, 'not at another hour');
select t.ok((select count(*) from public.notifications where kind = 'checkin_daily' and nudge_key is null) = 2, 'outside the gentle reminders'' weekly cap');
set role authenticated;
select t.as_user(:'k');
select checkin_reminder(null);
select t.ok((select jsonb_array_length(export_my_data() -> 'relationship_checkins')) = 1, 'the data download has K''s check-in');
reset role;
select t.ok(not exists (select 1 from public.notifications where kind = 'checkin_daily' and recipient_id = :'k' and sent_at is null), 'turning it off drops an unsent reminder');
delete from auth.users where id = :'l';
select t.ok(not exists (select 1 from private.rel_checkins where user_id = :'l'), 'deleting an account removes its check-ins');
set role authenticated;
select t.ok(not has_function_privilege('anon', 'public.checkin_save(text, text, text)', 'execute'), 'signed out, nothing');
reset role;
