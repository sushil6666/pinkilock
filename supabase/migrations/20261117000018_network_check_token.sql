-- A one-run pass through the network-country check, for the live test (decision D063).
--
-- A first profile is refused when the request comes from a network in a country that is not open
-- (`cf-ipcountry`, PL078). GitHub's runners are in the United States, so every live test on the
-- preview project was refused. Switching the check off there is not an option: the public website
-- talks to the preview project (D062).
--
-- Instead the live-test workflow stores a random token in `private.config` `network_check_token`
-- before the run and clears it after; the test sends it as the `x-pinkilock-test-token` header. A
-- request carrying the current token skips only the network-country check: the city and its
-- country must still be open, and the consents are still needed. An empty or short token matches
-- nothing, so outside a test run the check holds for everyone. No client role can read or set it.

insert into private.config (key, value) values ('network_check_token', '') on conflict (key) do nothing;

create or replace function private.network_check_skipped()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  want text := (select value from private.config where key = 'network_check_token');
  got text;
begin
  if want is null or length(want) < 32 then return false; end if;
  got := nullif(current_setting('request.headers', true), '')::json ->> 'x-pinkilock-test-token';
  return got is not null and got = want;
exception when others then
  return false;
end $$;
revoke all on function private.network_check_skipped() from public, anon, authenticated;

create or replace function private.request_country()
returns text language plpgsql stable set search_path = '' as $$
declare
  c text;
begin
  if private.network_check_skipped() then return null; end if;
  c := upper(nullif(current_setting('request.headers', true), '')::json ->> 'cf-ipcountry');
  if c ~ '^[A-Z]{2}$' then return c; end if;
  return null;
exception when others then
  return null;
end $$;
revoke all on function private.request_country() from public, anon, authenticated;
