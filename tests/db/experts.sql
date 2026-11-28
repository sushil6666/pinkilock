-- Expert tips (D127), after checkin.sql. The team lists one expert as the database owner; N reads,
-- reports and applies; O applies too.
\set ON_ERROR_STOP on
\pset tuples_only on
\set n '00000000-0000-0000-0000-0000e8a00001'
\set o '00000000-0000-0000-0000-0000e8a00002'
\set e '00000000-0000-0000-0000-0000e8a000e1'
insert into auth.users (id) values (:'n'), (:'o');
insert into public.profiles (id, name, age, area, city) values (:'n', 'Neha', 28, 'Baner', 'Pune');

set role authenticated;
select t.as_user(:'n');
select t.ok(expert_tips_list() = '[]'::jsonb, 'no expert is listed until the team adds one');
reset role;

-- Only the team adds experts, after checking the credential (OPERATIONS.md, "Experts").
insert into public.experts (id, name, kind, credential, city, languages) values (:'e', 'Test Expert', 'therapist', 'Test registration', 'Pune', '{en,hi}');
insert into public.expert_tips (expert_id, topic, title, body, lang) values
  (:'e', 'conflict', 'Pause first', 'Take twenty minutes.', 'en'),
  (:'e', 'conflict', 'पहले रुकें', 'बीस मिनट लें।', 'hi'),
  (:'e', 'dating', 'Go slow', 'No rush.', 'en');
insert into public.expert_tips (expert_id, topic, title, body, active) values (:'e', 'breakup', 'Old tip', 'Taken down.', false);

set role authenticated;
select t.as_user(:'n');
select t.ok(jsonb_array_length(expert_tips_list()) = 3, 'every active tip, none taken down');
select t.ok((select expert_tips_list('conflict', 'hi') -> 0 ->> 'title') = 'पहले रुकें', 'my language first');
select t.ok((select expert_tips_list('dating') -> 0 -> 'expert' ->> 'credential') = 'Test registration', 'each tip names the expert and credential');
select t.ok(t.sqlstate($$select expert_tips_list('astrology')$$) = 'PL241', 'a topic from the list (PL241)');
select t.ok(t.fails('select * from public.experts') and t.fails('select * from public.expert_tips')
  and t.fails($$insert into public.experts (name, kind, credential) values ('Fake Guru', 'spiritual', 'none')$$), 'no client reads or writes the tables');

select t.ok(t.sqlstate(format('select report_expert(%L, %L)', gen_random_uuid(), 'other')) = 'PL242', 'only a listed expert (PL242)');
select t.ok(t.sqlstate(format('select report_expert(%L, %L)', :'e', 'rude')) = 'PL243', 'a reason from the list (PL243)');
select report_expert(:'e', 'guaranteed', 'Promised a soulmate by Friday');
select report_expert(:'e', 'money_cures', 'Asked for 50,000 for a ritual');
reset role;
select t.ok((select count(*) from private.expert_reports where expert_id = :'e') = 1
  and (select reason from private.expert_reports where expert_id = :'e') = 'money_cures', 'one report each, the last reason kept');

set role authenticated;
select t.as_user(:'n');
select t.ok(t.fails('select * from private.expert_reports'), 'no client reads reports');
select t.ok(my_expert_application() is null, 'no application yet');
select t.ok(t.sqlstate($$select expert_apply('Neha', 'coach', 'ICF ACC', 'Pune', 'neha@example.com', '', false)$$) = 'PL244', 'the rules first (PL244)');
select t.ok(t.sqlstate($$select expert_apply('Neha', 'guru', 'ICF ACC', 'Pune', 'neha@example.com', '', true)$$) = 'PL245', 'a kind from the list (PL245)');
select t.ok(t.sqlstate($$select expert_apply('Neha', 'coach', '', 'Pune', 'neha@example.com', '', true)$$) = 'PL245', 'a credential (PL245)');
select t.ok((select expert_apply(' Neha ', 'coach', 'ICF ACC', 'Pune', 'neha@example.com', '', true) ->> 'status') = 'new', 'N applies');
select t.ok((select expert_apply('Neha', 'therapist', 'RCI', 'Pune', 'neha@example.com', 'Hindi too', true) ->> 'kind') = 'therapist', 'and can change it while new');
select t.ok(t.fails('select * from private.expert_applications'), 'no client reads applications');
select t.as_user(:'o');
select t.ok(t.sqlstate($$select expert_apply('Om', 'spiritual', 'Teacher', 'Pune', 'om@example.com', '', true)$$) is null, 'O can apply without a profile');
select t.ok((select my_expert_application() ->> 'kind') = 'spiritual', 'and sees only their own');
reset role;
select t.ok((select name from private.expert_applications where user_id = :'n') = 'Neha', 'trimmed');

-- Once the team answers, the application is fixed.
update private.expert_applications set status = 'talking' where user_id = :'n';
set role authenticated;
select t.as_user(:'n');
select t.ok((select expert_apply('Neha', 'coach', 'ICF', 'Pune', 'neha@example.com', '', true) ->> 'kind') = 'therapist', 'no change after the team answers');
select t.ok((select export_my_data() -> 'expert_application' ->> 'credential') = 'RCI'
  and jsonb_array_length(export_my_data() -> 'expert_reports') = 1, 'the data download has my application and my report');
reset role;
delete from auth.users where id = :'n';
select t.ok(not exists (select 1 from private.expert_applications where user_id = :'n') and not exists (select 1 from private.expert_reports where reporter = :'n'),
  'deleting an account removes its application and reports');
set role authenticated;
select t.ok(not has_function_privilege('anon', 'public.expert_tips_list(text, text)', 'execute')
  and not has_function_privilege('anon', 'public.expert_apply(text, text, text, text, text, text, boolean)', 'execute'), 'signed out, nothing');
reset role;
