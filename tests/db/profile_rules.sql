-- Profile and ask rules (docs/build-plan.md, WP1 first part), on people of their own: R and S.
-- Runs after tracing.sql, which defines t.sqlstate.
\set ON_ERROR_STOP on
\pset tuples_only on
\set r '00000000-0000-0000-0000-0000000000a1'
\set s '00000000-0000-0000-0000-0000000000a2'
\ir contact_cases.sql

insert into auth.users (id) values (:'r'), (:'s');

-- The contact check agrees with the app's copy on every line of the shared table.
select t.ok(bad is null and n >= 40, 'the contact check gives the expected answer for all ' || n || ' shared lines' || coalesce('; WRONG: ' || bad, ''))
from (select count(*) as n, string_agg(line, ' | ') filter (where private.looks_like_contact(line) <> refused) as bad from contact_cases) c;
select t.ok(private.looks_like_contact(null) is false and private.looks_like_contact('') is false, 'an empty line is not a contact');

-- The tag catalogue is the app's list, and read-only.
select t.ok((select count(*) from public.vibes) = 74 and exists (select 1 from public.vibes where label = 'slow burn'), 'the tag catalogue has all 74 tags');

set role authenticated;
select t.as_user(:'r');
select t.ok(t.fails($$insert into vibes values ('custom tag')$$) and t.fails($$delete from vibes$$), 'a user cannot change the tag catalogue');

-- Creating a profile: consent first (WP8), then the contact is needed the first time.
select t.ok(t.sqlstate($$select save_profile('Riya', 24, 'Bandra', '', '', '{}', array['boba_run','chai_walk','meme_duel'], 'Instagram', '@riya')$$) = 'PL077',
  'a first profile without the four consents is refused (PL077)');
select give_consents(array['adult', 'terms', 'privacy', 'sensitive']);
select t.ok(t.sqlstate($$select save_profile('Riya', 24, 'Bandra', 'she/her', 'Will judge your chai order.', array['foodie'], array['boba_run','chai_walk','meme_duel'])$$) = 'PL066',
  'a first profile with no contact is refused (PL066)');
select save_profile('Riya', 24, ' Bandra West ', 'she/her', 'Will judge your chai order.', array['foodie', 'slow burn'], array['boba_run','chai_walk','meme_duel'], 'Instagram', ' @riya ');
select t.ok((select (name, age, area, vibes, idea_ids) = ('Riya', 24, 'Bandra West', array['foodie','slow burn'], array['boba_run','chai_walk','meme_duel']) from profiles where id = :'r'),
  'save_profile creates the profile, trimmed');
select t.ok((select (contact_kind, contact_handle) = ('Instagram', '@riya') from profile_private where profile_id = :'r'), 'and the contact');
select t.ok((select palette <> '{#F6F6F1,#3A3A44}' and cardinality(palette) = 2 and photo_count = 0 from profiles where id = :'r'), 'the server picks the portrait colours');

-- Saving again without a contact keeps it; with one, changes it.
select save_profile('Riya', 25, 'Khar', '', '', '{}', array['boba_run','chai_walk','meme_duel','hot_takes']);
select t.ok((select (age, area, cardinality(vibes)) = (25, 'Khar', 0) from profiles where id = :'r')
  and (select contact_handle from profile_private where profile_id = :'r') = '@riya', 'a save without a contact keeps the contact');
select save_profile('Riya', 25, 'Khar', '', '', '{}', array['boba_run','chai_walk','meme_duel'], 'WhatsApp', '+91 00000 00001');
select t.ok((select contact_kind from profile_private where profile_id = :'r') = 'WhatsApp', 'a save with a contact changes it');

-- Each rule, with its code. `ok` is a profile that passes; each line breaks one thing.
create temp table bad_profiles (code text, why text, stmt text);
insert into bad_profiles values
  ('PL060', 'a one-letter name', $$select save_profile('R', 25, 'Khar', '', '', '{}', array['boba_run','chai_walk','meme_duel'])$$),
  ('PL060', 'a name of 17 letters', $$select save_profile('Abcdefghijklmnopq', 25, 'Khar', '', '', '{}', array['boba_run','chai_walk','meme_duel'])$$),
  ('PL060', 'a name with digits', $$select save_profile('Riya99', 25, 'Khar', '', '', '{}', array['boba_run','chai_walk','meme_duel'])$$),
  ('PL060', 'a name that is a handle', $$select save_profile('riya.frames', 25, 'Khar', '', '', '{}', array['boba_run','chai_walk','meme_duel'])$$),
  ('PL060', 'a name with an underscore', $$select save_profile('riya_k', 25, 'Khar', '', '', '{}', array['boba_run','chai_walk','meme_duel'])$$),
  ('PL060', 'two words', $$select save_profile('Riya K', 25, 'Khar', '', '', '{}', array['boba_run','chai_walk','meme_duel'])$$),
  ('PL061', 'age 17', $$select save_profile('Riya', 17, 'Khar', '', '', '{}', array['boba_run','chai_walk','meme_duel'])$$),
  ('PL061', 'no age', $$select save_profile('Riya', null, 'Khar', '', '', '{}', array['boba_run','chai_walk','meme_duel'])$$),
  ('PL062', 'four tags', $$select save_profile('Riya', 25, 'Khar', '', '', array['foodie','gamer','yapper','tease'], array['boba_run','chai_walk','meme_duel'])$$),
  ('PL062', 'a tag that is not in the catalogue', $$select save_profile('Riya', 25, 'Khar', '', '', array['any text at all'], array['boba_run','chai_walk','meme_duel'])$$),
  ('PL062', 'the same tag twice', $$select save_profile('Riya', 25, 'Khar', '', '', array['foodie','foodie'], array['boba_run','chai_walk','meme_duel'])$$),
  ('PL063', 'two ideas', $$select save_profile('Riya', 25, 'Khar', '', '', '{}', array['boba_run','chai_walk'])$$),
  ('PL063', 'seven ideas', $$select save_profile('Riya', 25, 'Khar', '', '', '{}', array['boba_run','chai_walk','meme_duel','hot_takes','rizz_off','two_truths','pet_cam'])$$),
  ('PL063', 'an idea that does not exist', $$select save_profile('Riya', 25, 'Khar', '', '', '{}', array['boba_run','chai_walk','not_an_idea'])$$),
  ('PL063', 'the same idea three times', $$select save_profile('Riya', 25, 'Khar', '', '', '{}', array['boba_run','boba_run','boba_run'])$$),
  ('PL064', 'an area of 41 characters', $$select save_profile('Riya', 25, repeat('a', 41), '', '', '{}', array['boba_run','chai_walk','meme_duel'])$$),
  ('PL064', 'pronouns of 21 characters', $$select save_profile('Riya', 25, 'Khar', repeat('b', 21), '', '{}', array['boba_run','chai_walk','meme_duel'])$$),
  ('PL064', 'a line of 81 characters', $$select save_profile('Riya', 25, 'Khar', '', repeat('c', 81), '{}', array['boba_run','chai_walk','meme_duel'])$$),
  ('PL065', 'a handle in the line', $$select save_profile('Riya', 25, 'Khar', '', 'dm me on insta @riya.real', '{}', array['boba_run','chai_walk','meme_duel'])$$),
  ('PL065', 'a number in the area', $$select save_profile('Riya', 25, '98765 43210', '', '', '{}', array['boba_run','chai_walk','meme_duel'])$$),
  ('PL065', 'a handle in the pronouns', $$select save_profile('Riya', 25, 'Khar', '@riya', '', '{}', array['boba_run','chai_walk','meme_duel'])$$),
  ('PL066', 'a contact kind that does not exist', $$select save_profile('Riya', 25, 'Khar', '', '', '{}', array['boba_run','chai_walk','meme_duel'], 'Email', 'riya')$$),
  ('PL066', 'a one-character handle', $$select save_profile('Riya', 25, 'Khar', '', '', '{}', array['boba_run','chai_walk','meme_duel'], 'Instagram', 'r')$$);
select t.ok(t.sqlstate(stmt) = code, 'refused: ' || why || ' (' || code || ')') from bad_profiles order by code, why;
select t.ok((select (name, age, area) = ('Riya', 25, 'Khar') from profiles where id = :'r'), 'none of the refused saves changed the profile');

-- The tables themselves take no direct writes any more.
select t.ok(t.fails(format($$update profiles set photo_count = 99 where id = %L$$, :'r')), 'a user cannot update their profile row directly');
select t.ok(t.fails(format($$insert into profiles (id, name, age) values (%L, 'Ghost', 30)$$, :'s')), 'a user cannot insert a profile row directly');
select t.ok(t.fails(format($$update profile_private set photos = '[1]' where profile_id = %L$$, :'r')), 'a user cannot write the photos field');
select t.ok((select count(*) from profile_private) = 1, 'a user still reads their own private row');

-- Asks: no contact in the note or the place, and a place of 60 characters at most.
select t.as_user(:'s');
select give_consents(array['adult', 'terms', 'privacy', 'sensitive']);
select save_profile('Sana', 26, 'Juhu', '', '', '{}', array['boba_run','chai_walk','meme_duel'], 'Snapchat', 'sana');
select t.ok(t.sqlstate(format($$select send_invite(%L, 'boba_run', now() + interval '1 hour', 'Linking Road', 'call me 98765 43210')$$, :'r')) = 'PL069', 'an ask with a typed note is refused before anything else: notes are picked (PL069)');
select t.ok(t.sqlstate(format($$select send_invite(%L, 'boba_run', now() + interval '1 hour', 'wa.me/919876543210', '')$$, :'r')) = 'PL065', 'an ask with a link as its place is refused (PL065)');
select t.ok(t.sqlstate(format($$select send_invite(%L, 'boba_run', now() + interval '1 hour', repeat('p', 61), '')$$, :'r')) = 'PL064', 'a place of 61 characters is refused (PL064)');
select t.ok((send_invite(:'r', 'boba_run', now() + interval '1 hour', 'Boba counter, Linking Road', 'low stakes, high snacks.')).status = 'sent', 'an ordinary ask still goes through');

set role anon;
select t.ok(t.fails($$select save_profile('Anon', 25, '', '', '', '{}', array['boba_run','chai_walk','meme_duel'], 'Instagram', '@anon')$$), 'signed out, no profile can be saved');
reset role;
