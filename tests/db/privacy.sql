-- Privacy and regulation (WP8), after ratings.sql. People of their own: P2 (sets up), Q2 (never finishes).
\set ON_ERROR_STOP on
\pset tuples_only on
\set p2 '00000000-0000-0000-0000-0000000000e7'
\set q2 '00000000-0000-0000-0000-0000000000e8'
insert into auth.users (id) values (:'p2');
insert into auth.users (id, created_at) values (:'q2', now() - interval '40 days');

set role authenticated;
select t.as_user(:'p2');
select t.ok((select count(*) from countries where active) = 1 and (select count(*) from cities where active) = 20
  and not exists (select 1 from cities where active and country <> 'IN'), 'one country is open, India, with its twenty cities (D080)');
select t.ok(t.fails($$update countries set active = true$$), 'a user cannot open a country');
select t.ok(t.sqlstate($$select give_consents(array['adult', 'whatever'])$$) = 'PL079', 'only the four consents exist (PL079)');
select give_consents(array['adult', 'terms', 'privacy']);
select t.ok(t.sqlstate($$select save_profile('Pari', 25, 'Bandra West', '', '', '{}', array['boba_run','chai_walk','meme_duel'], 'Instagram', '@pari')$$) = 'PL077', 'three consents are not enough: the dating-preferences one is separate (PL077)');
select give_consents(array['sensitive']);
select t.ok((select count(*) from my_consents()) = 4, 'my consents are recorded with their version');

-- Where.
select t.ok(t.sqlstate($$select save_profile('Pari', 25, 'Boring Road', '', '', '{}', array['boba_run','chai_walk','meme_duel'], 'Instagram', '@pari', 'Patna')$$) = 'PL076', 'a city that is not open is refused (PL076)');
select t.headers('{"cf-ipcountry": "US"}');
select t.ok(t.sqlstate($$select save_profile('Pari', 25, 'Bandra West', '', '', '{}', array['boba_run','chai_walk','meme_duel'], 'Instagram', '@pari')$$) = 'PL078', 'a first profile from a country that is not open is refused (PL078)');
select t.headers('{"cf-ipcountry": "IN"}');
select save_profile('Pari', 25, 'Bandra West', '', '', '{}', array['boba_run','chai_walk','meme_duel'], 'Instagram', '@pari');
select t.headers('{"cf-ipcountry": "US"}');
select t.ok(t.sqlstate($$select save_profile('Pari', 25, 'Khar', '', '', '{}', array['boba_run','chai_walk','meme_duel'])$$) is null, 'once set up, travelling does not lock a person out');
select t.headers('');
select t.ok((select (city, country) = ('Mumbai', 'IN') from profiles where id = :'p2'), 'the profile carries its city and country');

-- Moving city (D080): an area from the new city's list, and once in 7 days.
select t.ok(t.sqlstate($$select save_profile('Pari', 25, 'Khar', '', '', '{}', array['boba_run','chai_walk','meme_duel'], null, null, 'Delhi NCR')$$) = 'PL095', 'a move keeps no area from the old city (PL095)');
select t.ok(t.sqlstate($$select save_profile('Pari', 25, 'Saket', '', '', '{}', array['boba_run','chai_walk','meme_duel'], null, null, 'Delhi NCR')$$) is null, 'the first move is free, with an area from the new city');
select t.ok((select (city, area, country) = ('Delhi NCR', 'Saket', 'IN') from profiles where id = :'p2'), 'the profile now says Delhi NCR');
select t.ok(t.sqlstate($$select save_profile('Pari', 25, 'Khar', '', '', '{}', array['boba_run','chai_walk','meme_duel'], null, null, 'Mumbai')$$) = 'PL105', 'a second move in the same week is refused (PL105)');
select t.ok(t.sqlstate($$select save_profile('Pari', 25, 'Hauz Khas', '', '', '{}', array['boba_run','chai_walk','meme_duel'])$$) is null, 'a new area in the same city is not a move');
reset role;
update profiles set city_changed_at = now() - interval '8 days' where id = :'p2';
set role authenticated;
select t.as_user(:'p2');
select t.ok(t.sqlstate($$select save_profile('Pari', 25, 'Khar', '', '', '{}', array['boba_run','chai_walk','meme_duel'], null, null, 'Mumbai')$$) is null, 'a week later, the move back is fine');

-- The live test's one-run token (D063): only the current, long token skips the network check, and
-- never the city check. Only the database owner can set it.
select t.ok(t.fails($$select private.set_config('network_check_token', repeat('a', 64))$$), 'a user cannot set the network-check token');
reset role;
\set p3 '00000000-0000-0000-0000-0000000000e9'
insert into auth.users (id) values (:'p3');
select private.set_config('network_check_token', 'short');
set role authenticated;
select t.as_user(:'p3');
select give_consents(array['adult', 'terms', 'privacy', 'sensitive']);
select t.headers('{"cf-ipcountry": "US", "x-pinkilock-test-token": "short"}');
select t.ok(t.sqlstate($$select save_profile('Tara', 25, 'Bandra West', '', '', '{}', array['boba_run','chai_walk','meme_duel'], 'Instagram', '@tara')$$) = 'PL078', 'a short token is no pass (PL078)');
reset role;
select private.set_config('network_check_token', repeat('b', 64));
set role authenticated;
select t.as_user(:'p3');
select t.headers(json_build_object('cf-ipcountry', 'US', 'x-pinkilock-test-token', repeat('c', 64))::text);
select t.ok(t.sqlstate($$select save_profile('Tara', 25, 'Bandra West', '', '', '{}', array['boba_run','chai_walk','meme_duel'], 'Instagram', '@tara')$$) = 'PL078', 'a wrong token is no pass (PL078)');
select t.headers(json_build_object('cf-ipcountry', 'US', 'x-pinkilock-test-token', repeat('b', 64))::text);
select t.ok(t.sqlstate($$select save_profile('Tara', 25, 'Boring Road', '', '', '{}', array['boba_run','chai_walk','meme_duel'], 'Instagram', '@tara', 'Patna')$$) = 'PL076', 'with the token, a closed city is still refused (PL076)');
select t.ok(t.sqlstate($$select save_profile('Tara', 25, 'Bandra West', '', '', '{}', array['boba_run','chai_walk','meme_duel'], 'Instagram', '@tara')$$) is null, 'with the current token, a first profile from any network is let in');
select t.headers('');
reset role;
select private.set_config('network_check_token', '');
delete from auth.users where id = :'p3';
set role authenticated;

-- Requests and appeals.
reset role;
select private.moderate(null, :'p2', 'suspend', 'test suspension');
select private.moderate(null, :'p2', 'unsuspend', 'test over');
set role authenticated;
select t.as_user(:'p2');
select t.ok((select count(*) from my_moderation()) = 2 and exists (select 1 from my_moderation() where reason = 'test suspension'), 'I can see what was done to my account, and why');
select id as act from my_moderation() where action = 'suspend' \gset
select file_privacy_request('appeal', 'I did nothing wrong', :'act');
select file_privacy_request('score_review', 'My score looks wrong');
select t.ok(t.sqlstate($$select file_privacy_request('appeal', 'x', 999999)$$) = 'PL081', 'an appeal names one of my own decisions (PL081)');
select t.ok(t.sqlstate($$select file_privacy_request('nonsense', 'x')$$) = 'PL080', 'a request has a kind (PL080)');
select t.ok(t.fails('select count(*) from privacy_requests') and t.fails('select count(*) from consents'), 'no one can read requests or consents directly');
select t.ok((select x ? 'consents' and x ? 'privacy_requests' and x ? 'moderation' and x ? 'date_ratings' and x ? 'error_reports'
  and jsonb_array_length(x -> 'privacy_requests') = 2 from (select export_my_data() as x) s), 'the export now has consents, requests, moderation, ratings and error reports');

-- Retention.
reset role;
update public.invites set resolved_at = now() - interval '100 days' where id = (select id from public.invites where status in ('kept', 'flaked', 'declined') and place <> '' limit 1);
select private.retention() as r \gset
select t.ok((:'r'::jsonb ->> 'invites_cleared')::int >= 1, 'a finished invite''s place and line are cleared after 90 days');
select t.ok(not exists (select 1 from auth.users where id = :'q2'), 'an account that never finished setting up is deleted after 30 days');
select t.ok(exists (select 1 from auth.users where id = :'p2'), 'a set-up account is kept');
select t.ok((:'r'::jsonb ->> 'inactive_accounts_deleted')::int = 0, 'deleting inactive accounts is off until a period is set');
select t.ok((select schedule from cron.job where jobname = 'pinkilock-retention') = '41 3 * * *', 'retention runs daily');

-- City time zones (WP9): every city says one, and a made-up zone is refused.
reset role;
select t.ok((select bool_and(time_zone is not null) from cities), 'every city has a time zone');
create function pg_temp.bad_zone_refused() returns boolean language plpgsql as $$
begin
  insert into public.cities (name, country, active, time_zone) values ('Atlantis', 'IN', false, 'Mars/Base');
  return false;
exception when others then
  return true;
end $$;
select t.ok(pg_temp.bad_zone_refused(), 'a city with a zone that does not exist is refused');
