-- The few things Supabase provides that plain Postgres does not, so schema.sql can be tested
-- on a throwaway server: the API roles, auth.users and auth.uid(). Test-only; never run on Supabase.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;

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
