-- Photos behind the lock (WP7b, D088), after doubles.sql. People of their own: F (owner), G (kept a
-- promise with F), H (never met F), and G again once blocked.
\set ON_ERROR_STOP on
\pset tuples_only on
\set f '00000000-0000-0000-0000-0000000f0001'
\set g '00000000-0000-0000-0000-0000000f0002'
\set h '00000000-0000-0000-0000-0000000f0003'
insert into auth.users (id) values (:'f'), (:'g'), (:'h');
insert into public.profiles (id, name, age, area) values (:'f', 'Farah', 25, 'Bandra'), (:'g', 'Gauri', 24, 'Bandra'), (:'h', 'Harsh', 26, 'Juhu');
insert into public.profile_private (profile_id, contact_kind, contact_handle) values
  (:'f', 'Instagram', '@farah'), (:'g', 'Instagram', '@gauri'), (:'h', 'Instagram', '@harsh');
insert into public.invites (from_id, to_id, idea_id, minutes, starts_at, expires_at, place, status)
  values (:'g', :'f', 'boba_run', 25, now() - interval '2 days', now() - interval '3 days', 'Carter Road', 'kept');

-- The bucket is private, JPEG only, 2 MB.
select t.ok((select not public and file_size_limit = 2097152 and allowed_mime_types = array['image/jpeg'] from storage.buckets where id = 'photos'),
  'the photos bucket is private, JPEG only, 2 MB');

-- Adding goes through the Edge Function's service-role call only.
set role authenticated;
select t.as_user(:'f');
select t.ok(t.sqlstate($$select add_photo('00000000-0000-0000-0000-0000000f0001', 1000, true)$$) = '42501', 'a signed-in person cannot call add_photo (only the photo function can)');
select t.ok(t.fails($$insert into photos (profile_id, path, bytes) values ('00000000-0000-0000-0000-0000000f0001', 'x.jpg', 10)$$), 'a person cannot write a photo row');
select t.ok(t.fails($$insert into storage.objects (bucket_id, name) values ('photos', '00000000-0000-0000-0000-0000000f0001/x.jpg')$$), 'a person cannot upload to the bucket directly');
reset role;
set role service_role;
select t.ok(t.sqlstate($$select add_photo('00000000-0000-0000-0000-0000000f0001', 1000, false)$$) = 'PL107', 'a file that is not a JPEG is refused (PL107)');
select t.ok(t.sqlstate($$select add_photo('00000000-0000-0000-0000-0000000f0001', 3000000, true)$$) = 'PL107', 'a file over 2 MB is refused (PL107)');
select t.ok(t.sqlstate($$select add_photo('00000000-0000-0000-0000-0000000f0009', 1000, true)$$) = 'PL002', 'no profile, no photo (PL002)');
select (add_photo(:'f', 1000, true))->>'id' as p1 \gset
select (add_photo(:'f', 1000, true))->>'id' as p2 \gset
select (add_photo(:'f', 1000, true))->>'id' as p3 \gset
select t.ok(t.sqlstate($$select add_photo('00000000-0000-0000-0000-0000000f0001', 1000, true)$$) = 'PL108', 'a fourth photo is refused (PL108)');
reset role;
-- The file the function stores, at the path it was given.
insert into storage.objects (bucket_id, name) select 'photos', path from photos where profile_id = :'f';
select t.ok((select bool_and(path = profile_id::text || '/' || id::text || '.jpg' and status = 'pending') from photos where profile_id = :'f'),
  'a new photo waits for a person, filed under its owner');
select t.ok((select photo_count = 0 from profiles where id = :'f'), 'a waiting photo is not counted on the card');

-- Before approval: the owner sees their own; G, who kept a promise with F, sees nothing yet.
set role authenticated;
select t.as_user(:'f');
select t.ok((select count(*) = 3 from photos) and (select count(*) = 3 from storage.objects where bucket_id = 'photos'), 'the owner sees their three photos and files');
select t.as_user(:'g');
select t.ok((select count(*) = 0 from photos where profile_id = :'f') and (select count(*) = 0 from storage.objects where bucket_id = 'photos'),
  'a photo nobody has checked is shown to no one else, even after a kept promise');
reset role;

-- A person checks them: two approved, one held for a contact (a strike).
select t.ok(private.moderate_photo(:'p1', 'approve_photo', 'ordinary') = 'approve_photo done', 'a moderator approves one');
select private.moderate_photo(:'p2', 'approve_photo', 'ordinary');
select t.ok(private.moderate_photo(:'p3', 'hold_photo_contact', 'handle written on a card') = 'hold_photo_contact done', 'and holds one that carries a contact');
select t.ok((select contact_strikes = 1 and photo_count = 2 from profiles where id = :'f'), 'the held one is a strike; the card counts the two approved');
select t.ok(t.sqlstate($$select private.moderate_photo('00000000-0000-0000-0000-0000000f0001', 'approve_photo', 'x')$$) = 'PL090', 'an unknown photo is not a moderation step (PL090)');
select t.ok((select count(*) = 3 from private.moderation_actions where profile_id = :'f' and action like '%photo%'), 'each decision is recorded with its reason');

set role authenticated;
select t.as_user(:'g');
select t.ok((select count(*) = 2 from photos where profile_id = :'f') and (select count(*) = 2 from storage.objects where bucket_id = 'photos'),
  'after a kept promise, G sees the two approved photos and their files, not the held one');
select t.ok(not exists (select 1 from photos where profile_id = :'f' and status <> 'approved'), 'never a held one');
select t.ok((select photo_count = 2 from profiles where id = :'f'), 'and the card says two');
select t.as_user(:'h');
select t.ok((select count(*) = 0 from photos where profile_id = :'f') and (select count(*) = 0 from storage.objects where bucket_id = 'photos'),
  'H, who never kept a promise with F, sees no photo and no file');
select t.ok(t.fails($$update photos set status = 'approved'$$) and t.fails($$delete from photos$$), 'nobody approves or deletes a row directly');
select t.ok(t.sqlstate(format('select remove_photo(%L)', :'p1')) = 'PL110', 'H cannot remove F''s photo (PL110)');
select t.ok(t.fails($$select * from photo_trash$$), 'the trash list is no client''s');

-- A block closes the photos again, as it closes the handle.
select t.as_user(:'f');
select block_user(:'g');
select t.as_user(:'g');
select t.ok((select count(*) = 0 from photos where profile_id = :'f') and (select count(*) = 0 from profile_private where profile_id = :'f'),
  'once F blocks G, G sees neither F''s photos nor F''s handle');
select t.as_user(:'f');
select unblock_user(:'g');

-- Removing one: gone for everyone at once, and its file goes to the trash.
select remove_photo(:'p1');
select t.ok((select count(*) = 2 from photos), 'the owner removes one');
select t.ok((select status from photos where id = :'p2') = 'approved', 'the others stay as they were');
select t.ok((select (export_my_data())->>'format') = 'pinkilock-export-6'
  and jsonb_array_length((export_my_data())->'photos') = 2, 'the data download lists my photos (format 6)');
reset role;
select t.ok((select photo_count = 1 from profiles where id = :'f'), 'the card counts one approved photo now');
select t.ok(exists (select 1 from photo_trash where path = :'f' || '/' || :'p1' || '.jpg'), 'its file is queued for deletion');
select t.ok(exists (select 1 from cron.job where jobname = 'pinkilock-photo-trash' and command like '%kick_push%photo_trash%'), 'a job wakes the push function to delete trashed files');

-- The weekly limit counts uploads, not photos: removing does not make room for more than six.
set role service_role;
select add_photo(:'f', 1000, true);
reset role;
insert into private.photo_uploads (user_id) select :'f' from generate_series(1, 2);
set role service_role;
select t.ok(t.sqlstate($$select add_photo('00000000-0000-0000-0000-0000000f0001', 1000, true)$$) in ('PL108', 'PL109'), 'the limits still hold');
reset role;
delete from photos where profile_id = :'f' and status = 'held';
set role service_role;
select t.ok(t.sqlstate($$select add_photo('00000000-0000-0000-0000-0000000f0001', 1000, true)$$) = 'PL109', 'six uploads a week, even with room for another (PL109)');
reset role;

-- A suspended account adds nothing.
update profiles set suspended_at = now() where id = :'h';
set role service_role;
select t.ok(t.sqlstate($$select add_photo('00000000-0000-0000-0000-0000000f0003', 1000, true)$$) = 'PL072', 'a paused account cannot add photos (PL072)');
reset role;

-- Deleting the account takes every photo row and queues every file.
set role authenticated;
select t.as_user(:'f');
select delete_my_account();
reset role;
select t.ok(not exists (select 1 from photos where profile_id = :'f'), 'a deleted account leaves no photo row');
select t.ok((select count(*) from photo_trash where path like :'f' || '/%') = 4, 'and every one of its files is queued for deletion');
