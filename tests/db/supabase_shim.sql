-- The few things Supabase provides that plain Postgres does not, so the migrations can be tested
-- on a throwaway server: the API roles, their default privileges, auth.users, auth.uid() and a
-- stand-in for pg_cron. Test-only; never run on Supabase.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, phone text, phone_confirmed_at timestamptz, email text, created_at timestamptz not null default now(), is_anonymous boolean not null default false);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- Supabase hands every new object in public to the API roles. Copy that here, so that a table
-- the migrations forget to lock down fails these tests the same way it would leak in production.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- Supabase Storage, as far as the migrations use it: buckets, objects with RLS on, and the API
-- roles' grants (RLS decides). Files themselves are not stored here.
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
  name text not null, owner uuid, created_at timestamptz not null default now(), unique (bucket_id, name));
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

-- pg_cron stand-in: records the job so that the tests can check what was scheduled.
create schema cron;
create table cron.job (jobid bigint generated always as identity primary key, jobname text unique, schedule text not null, command text not null);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid $$;

create schema t;
grant usage on schema t to public;
create function t.ok(cond boolean, msg text) returns text language plpgsql as $$
begin
  if cond is not true then raise exception 'FAILED: %', msg; end if;
  return 'ok  ' || msg;
end $$;
-- True when the statement raises, run with the caller's rights.
create function t.fails(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return true;
end $$;
create function t.as_user(u uuid) returns void language sql as
  $$ select set_config('request.jwt.claim.sub', u::text, false) $$;
-- Supabase's Realtime publication, empty as on a new project, so that the migrations' changes to
-- it run here too (D093: inserts and updates only).
create publication supabase_realtime;
