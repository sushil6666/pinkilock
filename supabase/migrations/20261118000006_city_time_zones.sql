-- Each city's time zone (docs/build-plan.md, WP9): a plan between two cities in different zones
-- names both times. The zone is a fact about the city, never about the person: nothing new is
-- collected, and a VPN or a phone set to another zone changes nothing here. The same values are
-- `zone` in CITIES (src/domain/countries.ts), checked by tests/unit/countries.test.ts.
alter table public.cities add column time_zone text;

update public.cities set time_zone = 'Asia/Kolkata' where name = 'Mumbai';
update public.cities set time_zone = 'Asia/Kolkata' where name = 'Pune';
update public.cities set time_zone = 'Asia/Kolkata' where name = 'Bengaluru';
update public.cities set time_zone = 'Asia/Kolkata' where name = 'Delhi';
update public.cities set time_zone = 'Asia/Kolkata' where name = 'Hyderabad';

-- A city that opens later must say its zone; Postgres checks the name is a real one.
alter table public.cities alter column time_zone set not null;
alter table public.cities add constraint cities_time_zone_known check (now() at time zone time_zone is not null);
