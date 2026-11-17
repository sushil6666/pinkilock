-- Data export and account deletion, after safety.sql. Two new people, F and G: a kept promise,
-- a plan still open, a pass, a device, a report each way. Then F exports and deletes.
\set ON_ERROR_STOP on
\pset tuples_only on
\set c '00000000-0000-0000-0000-00000000000c'
\set f '00000000-0000-0000-0000-00000000000f'
\set g '00000000-0000-0000-0000-000000000009'

insert into auth.users (id, phone, email, is_anonymous) values (:'f', '919000000001', 'farah@example.com', false), (:'g', null, null, true);
insert into public.profiles (id, name, age, area) values (:'f', 'Farah', 25, 'Andheri'), (:'g', 'Gauri', 26, 'Powai');
insert into public.profile_private (profile_id, contact_kind, contact_handle) values (:'f', 'Instagram', '@farah'), (:'g', 'Snapchat', 'gauri.g');

set role authenticated;
select t.as_user(:'f');
select log_event('app_open', '{"device": "f-phone"}');
select (send_invite(:'g', 'momo_stop', now() + interval '1 hour', 'Lokhandwala', 'extra chutney')).id as fg \gset
select t.as_user(:'g');
select offer_pinky(:'fg') is not null;
select t.as_user(:'f');
select offer_pinky(:'fg') is not null;
reset role;
update public.invites set starts_at = now() + interval '5 minutes' where id = :'fg';
set role authenticated;
select t.check_in(:'fg') is not null;
select t.as_user(:'g');
select t.ok((t.check_in(:'fg')).status = 'kept', 'F and G keep a promise');
select (send_invite(:'f', 'sunset_spot', now() + interval '3 hours', '', '')).id as gf \gset
select t.as_user(:'f');
select t.ok((offer_pinky(:'gf')).status = 'half_locked', 'and have another one open');
select register_push_token('ExponentPushToken[f-phone]', 'android');
insert into passes (profile_id, passed_id) values (:'f', :'c');
select t.as_user(:'c');
select report_user(:'f', 'fake', 'c-report-about-f');
select t.as_user(:'f');
select report_user(:'c', 'other', 'f-report-about-c');

-- Export: everything about me, nothing about anyone else that I could not already read.
select export_my_data()::text as fx \gset
select t.ok((select (x -> 'account' ->> 'id', x -> 'account' ->> 'phone', x -> 'account' ->> 'email', x -> 'profile' ->> 'name', x -> 'contact' ->> 'handle')
  = (:'f', '919000000001', 'farah@example.com', 'Farah', '@farah') from (select :'fx'::jsonb as x) s), 'the export has my account (phone and email), profile and contact');
select t.ok((select (jsonb_array_length(x -> 'invites'), jsonb_array_length(x -> 'passes'), jsonb_array_length(x -> 'blocks'),
  jsonb_array_length(x -> 'reports_made'), jsonb_array_length(x -> 'devices'))
  = (2, 1, 1, 1, 1) from (select :'fx'::jsonb as x) s), 'the export has my invites, passes, blocks, reports and devices');
select t.ok((select x -> 'events' @> '[{"type": "app_open"}]' and x -> 'events' @> '[{"type": "kept"}]' from (select :'fx'::jsonb as x) s),
  'the export has my events');
select t.ok(position('gauri.g' in :'fx') = 0, 'the export does not contain the other person''s contact');
select t.ok(position('c-report-about-f' in :'fx') = 0, 'the export does not contain reports about me');
select t.ok(position('f-report-about-c' in :'fx') > 0, 'the export contains the report I made');
select t.as_user(:'g');
select t.ok((export_my_data() -> 'account' ->> 'id') = :'g', 'G''s export is G''s');
set role anon;
select t.ok(t.fails('select export_my_data()'), 'anon cannot export');
select t.ok(t.fails('select delete_my_account()'), 'anon cannot delete');
reset role;

-- Delete.
select count(*) as events_before from public.events \gset
select count(*) as reports_before from public.reports \gset
set role authenticated;
select t.as_user(:'f');
select delete_my_account();
reset role;

select t.ok(not exists (select 1 from auth.users where id = :'f'), 'the auth user is gone');
select t.ok(not exists (select 1 from public.profiles where id = :'f') and not exists (select 1 from public.profile_private where profile_id = :'f'),
  'the profile and contact are gone');
select t.ok(not exists (select 1 from public.invites where :'f' in (from_id, to_id)), 'the invites are gone');
select t.ok(not exists (select 1 from public.passes where :'f' in (profile_id, passed_id))
  and not exists (select 1 from public.blocks where :'f' in (blocker_id, blocked_id)), 'passes and blocks are gone');
select t.ok(not exists (select 1 from public.push_tokens where profile_id = :'f')
  and not exists (select 1 from public.notifications where recipient_id = :'f'), 'devices and the outbox rows are gone');
select t.ok(not exists (select 1 from public.trust_scores where profile_id = :'f'), 'the trust score is gone');
select t.ok((select count(*) from public.events) = :events_before + 1, 'the log keeps every row (plus the end of the open plan)');
select t.ok(not exists (select 1 from public.events where actor_id = :'f'), 'no log row names F any more');
select t.ok(not exists (select 1 from public.events where props ? 'device'), 'what the phone sent with app_open is gone');
select t.ok(exists (select 1 from public.events where type = 'ended' and invite_id = :'gf' and props ->> 'reason' = 'account_deleted'),
  'the open plan ended before it went');
select t.ok(not exists (select 1 from public.events where invite_id = :'gf' and type in ('bailed', 'no_show', 'declined')), 'no flake for anyone');
select t.ok((select count(*) from public.events where type = 'kept' and actor_id = :'g' and invite_id = :'fg') = 1, 'G keeps their own kept row');
select t.ok((select count(*) from public.reports) = :reports_before, 'reports stay');
select t.ok((select reporter_id is null from public.reports where detail = 'f-report-about-c')
  and (select reported_id is null from public.reports where detail = 'c-report-about-f'), 'with F''s id removed from them');
-- Every uuid column of every table, counted: none may still hold F's id.
create function pg_temp.rows_naming(p uuid) returns int language plpgsql as $$
declare
  col record;
  n int := 0;
  k int;
begin
  for col in
    select c.table_schema, c.table_name, c.column_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema in ('public', 'analytics', 'auth', 'private') and c.data_type = 'uuid'
  loop
    execute format('select count(*) from %I.%I where %I = $1', col.table_schema, col.table_name, col.column_name) into k using p;
    n := n + k;
  end loop;
  return n;
end $$;
select t.ok(pg_temp.rows_naming(:'g') > 0, 'the scan does find G, who still exists');
select t.ok(pg_temp.rows_naming(:'f') = 0, 'no uuid column in any table still holds F''s id');
