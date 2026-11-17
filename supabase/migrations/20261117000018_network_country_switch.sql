-- The network-country check, switchable per project (decision D060).
--
-- A first profile is refused when the request comes from a network in a country that is not open
-- (`cf-ipcountry`, PL078). That is right for the public project, but the preview project is tested
-- from GitHub's runners, which sit in the United States, so every live test was refused.
--
-- `private.config` key `allow_any_network_country`: when 'true', the network's country is not
-- checked. The city and its country must still be open, the consents are still needed, and which
-- countries are open is still only the `countries` table. A missing key means the check is on, so
-- a project is strict unless someone switched it off on purpose. The deploy workflow sets it to
-- 'true' on the preview project and 'false' on production; no client role can change it.

insert into private.config (key, value) values ('allow_any_network_country', 'false') on conflict (key) do nothing;

create or replace function private.request_country()
returns text language plpgsql stable set search_path = '' as $$
declare
  c text;
begin
  if private.config_on('allow_any_network_country') then return null; end if;
  c := upper(nullif(current_setting('request.headers', true), '')::json ->> 'cf-ipcountry');
  if c ~ '^[A-Z]{2}$' then return c; end if;
  return null;
exception when others then
  return null;
end $$;
revoke all on function private.request_country() from public, anon, authenticated;
