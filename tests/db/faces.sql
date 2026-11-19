-- Your face on your card (WP7b, D095), after photos.sql. People of their own: J (owner), K (shares a
-- plan with J), L (Discover showed L J's card), M (has never seen J's card).
\set ON_ERROR_STOP on
\pset tuples_only on
\set j '00000000-0000-0000-0000-0000000fa001'
\set k '00000000-0000-0000-0000-0000000fa002'
\set l '00000000-0000-0000-0000-0000000fa003'
\set m '00000000-0000-0000-0000-0000000fa004'
insert into auth.users (id) values (:'j'), (:'k'), (:'l'), (:'m');
insert into public.profiles (id, name, age, area) values
  (:'j', 'Jaya', 25, 'Bandra'), (:'k', 'Kabir', 24, 'Bandra'), (:'l', 'Leela', 26, 'Juhu'), (:'m', 'Manav', 27, 'Juhu');
insert into public.invites (from_id, to_id, idea_id, minutes, starts_at, expires_at, place, status)
  values (:'k', :'j', 'boba_run', 25, now() + interval '2 days', now() + interval '1 day', 'Carter Road', 'sent');
-- What discover() records when it hands L the card (tested in discover's own file).
insert into private.discover_seen (user_id, card_id) values (:'l', :'j');

-- A face goes in only through the photo function, as the other photos do.
set role authenticated;
select t.as_user(:'j');
select t.ok(t.sqlstate($$select add_photo('00000000-0000-0000-0000-0000000fa001', 1000, true, 'face')$$) = '42501', 'a signed-in person cannot call add_photo for a face either');
reset role;
set role service_role;
select t.ok(t.sqlstate($$select add_photo('00000000-0000-0000-0000-0000000fa001', 1000, true, 'avatar')$$) = 'PL107', 'only the two kinds exist (PL107)');
select (add_photo(:'j', 1000, true, 'face'))->>'id' as f1 \gset
select t.ok(t.sqlstate($$select add_photo('00000000-0000-0000-0000-0000000fa001', 1000, true, 'face')$$) = 'PL113', 'one face waits at a time (PL113)');
-- The face is not one of the three behind the lock.
select add_photo(:'j', 1000, true), add_photo(:'j', 1000, true), add_photo(:'j', 1000, true);
reset role;
insert into storage.objects (bucket_id, name) select 'photos', path from photos where profile_id = :'j';
select t.ok((select kind = 'face' and status = 'pending' from photos where id = :'f1'), 'a new face waits for a person');
select t.ok(exists (select 1 from consents where user_id = :'j' and kind = 'face'), 'sending a face records the face consent');
select t.ok(not private.has_consents(:'j'), 'the face consent does not stand in for the four that let a person in');

-- Waiting: the owner sees it, nobody else does.
set role authenticated;
select t.as_user(:'j');
select t.ok(exists (select 1 from photos where id = :'f1'), 'the owner sees their waiting face');
select t.as_user(:'k');
select t.ok(not exists (select 1 from photos where profile_id = :'j'), 'a face nobody has checked is shown to no one else');
reset role;

-- Approved: whoever sees the card sees the face, and only the face.
select private.moderate_photo(:'f1', 'approve_photo', 'ordinary');
select t.ok((select photo_count = 0 from profiles where id = :'j'), 'the card''s photo count leaves the face out');
set role authenticated;
select t.as_user(:'k');
select t.ok((select count(*) = 1 from photos where profile_id = :'j' and kind = 'face')
  and (select count(*) = 1 from storage.objects where bucket_id = 'photos' and name like :'j' || '/%'),
  'K, who shares a plan with J, sees J''s face and its file');
select t.ok(not exists (select 1 from photos where profile_id = :'j' and kind = 'locked'), 'and none of the photos behind the lock');
select t.as_user(:'l');
select t.ok((select count(*) = 1 from photos where profile_id = :'j'), 'L, who was shown J''s card, sees J''s face');
select t.as_user(:'m');
select t.ok(not exists (select 1 from photos where profile_id = :'j') and not exists (select 1 from storage.objects where bucket_id = 'photos' and name like :'j' || '/%'),
  'M, who was never shown J''s card, sees no face and no file');
reset role;

-- An old Discover card is not a key for ever.
update private.discover_seen set at = now() - interval '3 days' where user_id = :'l' and card_id = :'j';
set role authenticated;
select t.as_user(:'l');
select t.ok(not exists (select 1 from photos where profile_id = :'j'), 'a card shown three days ago no longer shows the face');
reset role;
update private.discover_seen set at = now() where user_id = :'l' and card_id = :'j';

-- A block hides it both ways; a paused account shows it to nobody.
set role authenticated;
select t.as_user(:'j');
select block_user(:'l');
select t.as_user(:'l');
select t.ok(not exists (select 1 from photos where profile_id = :'j'), 'once J blocks L, L no longer sees J''s face');
select t.as_user(:'j');
select unblock_user(:'l');
reset role;
update profiles set suspended_at = now() where id = :'j';
set role authenticated;
select t.as_user(:'k');
select t.ok(not exists (select 1 from photos where profile_id = :'j'), 'a paused account''s face is shown to nobody');
reset role;
update profiles set suspended_at = null where id = :'j';

-- Once a week. A held face can be taken again at once; three tries a week at most.
set role service_role;
select t.ok(t.sqlstate($$select add_photo('00000000-0000-0000-0000-0000000fa001', 1000, true, 'face')$$) = 'PL114', 'a new face the same week is refused (PL114)');
reset role;
update private.photo_uploads set at = now() - interval '8 days' where user_id = :'j' and kind = 'face';
set role service_role;
select (add_photo(:'j', 1000, true, 'face'))->>'id' as f2 \gset
reset role;
set role authenticated;
select t.as_user(:'k');
select t.ok((select array_agg(id::text) from photos where profile_id = :'j') = array[:'f1'], 'while the new one waits, the old face stays up');
reset role;
select private.moderate_photo(:'f2', 'hold_photo_contact', 'handle on a sign');
select t.ok((select contact_strikes = 1 from profiles where id = :'j'), 'a face held for carrying a contact is a strike');
set role service_role;
select (add_photo(:'j', 1000, true, 'face'))->>'id' as f3 \gset
reset role;
select t.ok(:'f3' <> '', 'straight after a held face, another can be taken');
select private.moderate_photo(:'f3', 'approve_photo', 'ordinary');
select t.ok((select array_agg(id::text) from photos where profile_id = :'j' and kind = 'face') = array[:'f3'],
  'the new face, once approved, replaces the old one and the held one');
select t.ok(exists (select 1 from photo_trash where path = :'j' || '/' || :'f1' || '.jpg')
  and exists (select 1 from photo_trash where path = :'j' || '/' || :'f2' || '.jpg'), 'and their files are queued for deletion');
select t.ok((select photo_count = 0 from profiles where id = :'j'), 'still none behind the lock counted: they wait for a person');
-- Three tries this week, the last one held: held would allow another, the count does not.
update private.photo_uploads set at = now() where user_id = :'j' and kind = 'face';
update photos set status = 'held' where id = :'f3';
set role service_role;
select t.ok(t.sqlstate($$select add_photo('00000000-0000-0000-0000-0000000fa001', 1000, true, 'face')$$) = 'PL114', 'three tries a week at most (PL114)');
reset role;

-- The owner can take it down, and the download says which photo is which.
set role authenticated;
select t.as_user(:'j');
select t.ok((select (export_my_data())->>'format') = 'pinkilock-export-6'
  and (select count(*) = 3 from jsonb_array_elements((export_my_data())->'photos') e where e->>'kind' = 'locked'),
  'the data download says each photo''s kind (format 6)');
select t.ok(exists (select 1 from jsonb_array_elements((export_my_data())->'consents') c where c->>'kind' = 'face'), 'and lists the face consent');
select delete_my_account();
reset role;
select t.ok(not exists (select 1 from photos where profile_id = :'j') and not exists (select 1 from consents where user_id = :'j'),
  'a deleted account leaves no face and no consent');
