-- Error codes and tracing (docs/build-plan.md, WP0b), on people of their own: P asks Q.
\set ON_ERROR_STOP on
\pset tuples_only on
\set p '00000000-0000-0000-0000-0000000000f1'
\set q '00000000-0000-0000-0000-0000000000f2'

-- The SQLSTATE a statement fails with, or null if it does not fail. Runs with the caller's rights.
create function t.sqlstate(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return null;
exception when others then
  return sqlstate;
end $$;
create function t.headers(h text) returns void language sql as $$ select set_config('request.headers', h, false) $$;

insert into auth.users (id) values (:'p'), (:'q');
insert into public.profiles (id, name, age, area) values (:'p', 'Pia', 25, 'Bandra'), (:'q', 'Quinn', 24, 'Khar');

-- Every error has a code.
select t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosrc ~* 'raise\s+exception\s+''' ),
  'no function raises an error without a code');

set role authenticated;
select t.as_user(:'p');
select t.ok(t.sqlstate(format($$select send_invite(%L, 'boba_run', now() + interval '1 hour', '', '')$$, :'p')) = 'PL020', 'asking yourself fails with PL020');
select t.ok(t.sqlstate(format($$select send_invite(%L, 'nope', now() + interval '1 hour', '', '')$$, :'q')) = 'PL022', 'an unknown idea fails with PL022');
select t.ok(t.sqlstate(format('select offer_pinky(%L)', gen_random_uuid())) = 'PL030', 'an invite that is not there fails with PL030');
select t.ok(t.sqlstate($$select log_event('kept')$$) = 'PL040', 'logging anything but app_open fails with PL040');
select t.as_user(null);
select t.ok(t.sqlstate($$select log_event('app_open')$$) = 'PL001', 'signed out fails with PL001');

-- A trace id in the header lands on the event and on the push outbox row.
select t.as_user(:'p');
select t.headers('{"x-trace-id": "TRACE0P1"}');
select (send_invite(:'q', 'boba_run', now() + interval '1 hour', '', '')).id as pq \gset
reset role;
select t.ok((select props ->> 'trace' from public.events where invite_id = :'pq' and type = 'ask_sent') = 'TRACE0P1', 'the ask''s event carries the trace id');
select t.ok((select trace from public.notifications where invite_id = :'pq' and kind = 'new_ask') = 'TRACE0P1', 'the push for the ask carries the trace id');

-- Only an 8-character id of 0-9 and A-Z is ever taken from the header.
set role authenticated;
select t.as_user(:'q');
select t.headers('{"x-trace-id": "x'' or 1=1; drop table events; --"}');
select offer_pinky(:'pq');
select t.headers('not json at all');
select log_event('app_open');
select t.headers('');
reset role;
select t.ok((select props ->> 'trace' from public.events where invite_id = :'pq' and type = 'pinky_out') is null, 'a malformed trace header is ignored');
select t.ok((select count(*) from public.events where actor_id = :'q' and type = 'app_open' and props ? 'trace') = 0, 'headers that are not JSON are ignored, and do not fail the call');

-- Errors from phones: written only through the function, read by no one.
set role authenticated;
select t.as_user(:'p');
select log_client_error('PL033', 'TRACE0P1', '/plan/[id]', '1.0.0 abc123', 'android');
select t.ok(t.fails('select count(*) from client_errors'), 'a user cannot read client errors, their own included');
select t.ok(t.fails(format($$insert into client_errors (user_id, code) values (%L, 'PC001')$$, :'p')), 'a user cannot write client errors directly');
select t.ok(t.sqlstate($$select log_client_error('DROP TABLE', null, '', '', null)$$) = 'PL050', 'a code that is not a code is refused');
select t.ok(t.sqlstate($$select log_client_error('PC001', null, repeat('a', 81), '', null)$$) = 'PL050', 'an overlong route is refused');
select t.ok(t.sqlstate($$select log_client_error('PC001', 'lowercase', '', '', null)$$) = 'PL050', 'a malformed trace is refused');
select log_client_error('PC001', null, '/', '1.0.0', 'ios') from generate_series(1, 40);
select t.ok(t.fails($$select private.invite_timeline('00000000-0000-0000-0000-000000000000')$$), 'a user cannot read an invite''s timeline');
reset role;
select t.ok((select count(*) from public.client_errors where user_id = :'p') = 30, 'an account can file at most 30 error reports an hour; the rest are dropped');

set role anon;
select t.ok(t.fails($$select log_client_error('PC001', null, '', '', null)$$), 'signed out, no error report can be filed');
reset role;

-- The operator's view: the ask, its events, its push, and the phone's error, all on one trace.
select t.ok((select count(*) from private.invite_timeline(:'pq') where trace = 'TRACE0P1') = 3,
  'the timeline ties the ask''s event, its push and the phone''s error together by trace id');
select t.ok((select count(*) from private.invite_timeline(:'pq') where source = 'event') = 2, 'the timeline lists every event on the invite');

select t.ok((select schedule from cron.job where jobname = 'pinkilock-client-errors-retention') = '17 3 * * *', 'client errors are cleared after 30 days, daily');
