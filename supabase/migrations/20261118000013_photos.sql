-- Photos behind the lock (ROADMAP Phase 4, build plan WP7b, decision D087).
--
-- Up to three extra photos per person, shown to someone else only after a kept promise, exactly
-- like the contact handle, and only once a person has approved them.
--
--   * public.photos: one row per photo, `pending` until a moderator approves or holds it.
--     Clients can read their own rows, and someone else's approved rows when the reveal allows it.
--     No client writes. A photo is added only by the `photo` Edge Function, which checks who is
--     calling, strips the file's metadata and stores it, through public.add_photo (service role
--     only). The owner removes one with public.remove_photo.
--   * Storage bucket `photos` (private). An object is readable only when the reader can read its
--     row in public.photos, so the same RLS decides both. No client can write to the bucket.
--   * private.revealed_to(owner, viewer): the reveal rule, used by profile_private and photos alike.
--   * public.photo_trash: files to delete. Storage files are deleted through the Storage API, not
--     SQL, so a deleted row (removed, or the account deleted) leaves its path here and the push
--     function, which already holds the service key and a schedule, deletes the file.
--   * private.moderate_photo: approve_photo, hold_photo, or hold_photo_contact (a held photo that
--     carried a contact: a strike, as for a line; two strikes suspend).

-- The reveal rule, once. Same rule as the profile_private policy in 20261118000002_double_dates.sql.
create or replace function private.revealed_to(p_owner uuid, p_viewer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_viewer is not null and p_owner is not null and not private.blocked_pair(p_viewer, p_owner) and exists (
    select 1 from public.invites i
    where i.status = 'kept' and (
      (i.from_friend is null and ((i.from_id = p_viewer and i.to_id = p_owner) or (i.to_id = p_viewer and i.from_id = p_owner)))
      or (i.from_friend is not null
          and p_viewer = any (i.check_ins) and p_owner = any (i.check_ins)
          and ((p_viewer in (i.from_id, i.from_friend) and p_owner in (i.to_id, i.to_friend))
               or (p_viewer in (i.to_id, i.to_friend) and p_owner in (i.from_id, i.from_friend))))));
$$;
revoke all on function private.revealed_to(uuid, uuid) from public, anon, authenticated;
-- Policies run with the reader's rights, so the reader must be able to call it (see issue #51).
grant execute on function private.revealed_to(uuid, uuid) to authenticated;

drop policy private_after_kept on public.profile_private;
create policy private_after_kept on public.profile_private for select to authenticated
  using (private.revealed_to(profile_id, auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- Photos
-- ---------------------------------------------------------------------------------------------
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  path text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'held')),
  bytes int not null check (bytes > 0),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index photos_profile_idx on public.photos (profile_id, created_at);
alter table public.photos enable row level security;
revoke all on public.photos from public, anon, authenticated;
grant select (id, profile_id, path, status, created_at) on public.photos to authenticated;
create policy photos_own on public.photos for select to authenticated using (profile_id = auth.uid());
create policy photos_revealed on public.photos for select to authenticated
  using (status = 'approved' and private.revealed_to(profile_id, auth.uid()));

-- What a profile card says ("3 photos behind the lock") counts approved photos only.
create or replace function private.count_photos()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  who uuid := coalesce(new.profile_id, old.profile_id);
begin
  update public.profiles set photo_count = (select count(*) from public.photos where profile_id = who and status = 'approved')
  where id = who;
  return null;
end $$;
revoke all on function private.count_photos() from public, anon, authenticated;
create trigger photos_count after insert or update of status or delete on public.photos
  for each row execute function private.count_photos();

-- Files to delete. Kept by the database, emptied by the push function with the Storage API.
create table public.photo_trash (
  path text primary key,
  at timestamptz not null default now()
);
alter table public.photo_trash enable row level security;
revoke all on public.photo_trash from public, anon, authenticated;

create or replace function private.trash_photo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.photo_trash (path) values (old.path) on conflict (path) do nothing;
  return null;
end $$;
revoke all on function private.trash_photo() from public, anon, authenticated;
create trigger photos_trash after delete on public.photos for each row execute function private.trash_photo();

-- Each upload counts toward the weekly limit, even if the photo is removed again.
create table private.photo_uploads (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index photo_uploads_user_at_idx on private.photo_uploads (user_id, at);
revoke all on private.photo_uploads from public, anon, authenticated;
select cron.schedule('pinkilock-photo-uploads-retention', '41 3 * * *', $$delete from private.photo_uploads where at < now() - interval '8 days'$$);

-- Called by the `photo` Edge Function only, after it has checked the caller's token: the rules
-- for a new photo, and its row. The function stores the file at the path returned.
create or replace function public.add_photo(p_user uuid, p_bytes int, p_jpeg boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_path text;
begin
  if p_user is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception using errcode = 'PL002', message = 'Finish setting up first.';
  end if;
  if exists (select 1 from public.profiles where id = p_user and suspended_at is not null) then
    raise exception using errcode = 'PL072', message = 'This account is paused while we look at a report.';
  end if;
  if not coalesce(p_jpeg, false) or p_bytes is null or p_bytes < 1 or p_bytes > 2097152 then
    raise exception using errcode = 'PL106', message = 'That photo could not be used. Pick another one.';
  end if;
  -- Serialise one person's uploads, so two at once cannot both pass the count.
  perform pg_advisory_xact_lock(hashtext('photos:' || p_user::text));
  if (select count(*) from public.photos where profile_id = p_user) >= 3 then
    raise exception using errcode = 'PL107', message = 'You have three photos. Remove one first.';
  end if;
  if (select count(*) from private.photo_uploads where user_id = p_user and at > now() - interval '7 days') >= 6 then
    raise exception using errcode = 'PL108', message = 'That is enough new photos for this week. Try again in a few days.';
  end if;
  v_path := p_user::text || '/' || v_id::text || '.jpg';
  insert into public.photos (id, profile_id, path, bytes) values (v_id, p_user, v_path, p_bytes);
  insert into private.photo_uploads (user_id) values (p_user);
  return jsonb_build_object('id', v_id, 'path', v_path);
end $$;

revoke all on function public.add_photo(uuid, int, boolean) from public, anon, authenticated;
grant execute on function public.add_photo(uuid, int, boolean) to service_role;

-- When the file could not be stored, the Edge Function takes the row back.
create or replace function public.forget_photo(p_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.photos where id = p_id and status = 'pending';
$$;
revoke all on function public.forget_photo(uuid) from public, anon, authenticated;
grant execute on function public.forget_photo(uuid) to service_role;

create or replace function public.remove_photo(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  delete from public.photos where id = p_id and profile_id = me;
  if not found then raise exception using errcode = 'PL109', message = 'That photo is not there any more.'; end if;
end $$;
revoke all on function public.remove_photo(uuid) from public, anon;
grant execute on function public.remove_photo(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Storage: a private bucket, JPEG only, 2 MB. Readable where the row is; written by no client.
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 2097152, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy photos_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and exists (select 1 from public.photos p where p.path = storage.objects.name));

-- ---------------------------------------------------------------------------------------------
-- Moderation
-- ---------------------------------------------------------------------------------------------
alter table private.moderation_actions drop constraint moderation_actions_action_check;
alter table private.moderation_actions add constraint moderation_actions_action_check
  check (action in ('dismiss', 'hide_line', 'suspend', 'unsuspend', 'approve_line', 'reject_line',
                    'approve_photo', 'hold_photo', 'hold_photo_contact'));

create or replace function private.moderate_photo(p_photo uuid, p_action text, p_note text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  who uuid;
  strikes int;
begin
  select profile_id into who from public.photos where id = p_photo;
  if not found or p_action not in ('approve_photo', 'hold_photo', 'hold_photo_contact') then
    raise exception using errcode = 'PL090', message = 'That moderation step is not valid.';
  end if;
  update public.photos set status = case p_action when 'approve_photo' then 'approved' else 'held' end, decided_at = now()
  where id = p_photo;
  if p_action = 'hold_photo_contact' then
    update public.profiles set contact_strikes = contact_strikes + 1 where id = who returning contact_strikes into strikes;
    if strikes >= 2 then
      update public.profiles set suspended_at = now() where id = who and suspended_at is null;
    end if;
  end if;
  insert into private.moderation_actions (profile_id, action, note) values (who, p_action, p_note);
  return p_action || ' done' || case when strikes >= 2 then ' (second strike: suspended)' else '' end;
end $$;
revoke all on function private.moderate_photo(uuid, text, text) from public, anon, authenticated;

-- The push function empties the trash; this wakes it when there is any, as for receipts.
select cron.schedule('pinkilock-photo-trash', '*/5 * * * *',
  $$select public.kick_push() where exists (select 1 from public.photo_trash)$$);

-- ---------------------------------------------------------------------------------------------
-- The data download, format 5: my photos (which, their state, when). Otherwise as in
-- 20261118000008_export_contact_checks.sql. The files themselves are in the app, on Me.
-- ---------------------------------------------------------------------------------------------
create or replace function public.export_my_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  return jsonb_build_object(
    'format', 'pinkilock-export-5',
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'phone', u.phone, 'email', nullif(u.email, ''), 'created_at', u.created_at, 'is_anonymous', u.is_anonymous)
                from auth.users u where u.id = me),
    'profile', (select to_jsonb(p) from profiles p where p.id = me),
    'contact', (select jsonb_build_object('kind', c.contact_kind, 'handle', c.contact_handle, 'photos', c.photos, 'verified_at', c.contact_verified_at)
                from profile_private c where c.profile_id = me),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'status', x.status, 'bytes', x.bytes, 'at', x.created_at, 'decided_at', x.decided_at) order by x.created_at)
                from photos x where x.profile_id = me), '[]'),
    'trust_score', (select to_jsonb(t) - 'profile_id' from trust_scores t where t.profile_id = me),
    -- The other people appear by id only: their cards are theirs. On a double, `other_person` is
    -- the asker or the person asked on the other side, and `with` lists the two friends.
    'invites', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', i.id,
                  'role', case me when i.from_id then 'asked' when i.to_id then 'was_asked'
                                  when i.from_friend then 'asked_with_a_friend' else 'was_asked_with_a_friend' end,
                  'other_person', case when me in (i.from_id, i.from_friend) then i.to_id else i.from_id end,
                  'with', case when i.from_friend is not null then jsonb_build_array(i.from_friend, i.to_friend) end,
                  'idea', i.idea_id, 'starts_at', i.starts_at, 'place', i.place, 'note', i.note, 'status', i.status,
                  'my_check_in', me = any (i.check_ins), 'flaked', i.flaked_by = me, 'created_at', i.created_at,
                  'resolved_at', i.resolved_at) order by i.created_at)
                from invites i where me in (i.from_id, i.to_id, i.from_friend, i.to_friend)), '[]'),
    'duo', (select jsonb_build_object('partner', d.partner, 'since', d.created_at) from duos d where d.person = me),
    'passes', coalesce((select jsonb_agg(jsonb_build_object('profile', x.passed_id, 'at', x.at) order by x.at)
                from passes x where x.profile_id = me), '[]'),
    'blocks', coalesce((select jsonb_agg(jsonb_build_object('profile', b.blocked_id, 'at', b.created_at) order by b.created_at)
                from blocks b where b.blocker_id = me), '[]'),
    -- Reports I made. Reports about me are not part of an export.
    'reports_made', coalesce((select jsonb_agg(jsonb_build_object('profile', r.reported_id, 'reason', r.reason, 'detail', r.detail, 'at', r.created_at) order by r.created_at)
                from reports r where r.reporter_id = me), '[]'),
    -- Handles I flagged as not working, by person and plan; their handle is theirs, so it is left out.
    'contact_flags_made', coalesce((select jsonb_agg(jsonb_build_object('profile', f.owner_id, 'invite', f.invite_id, 'at', f.at) order by f.at)
                from contact_reports f where f.reporter_id = me), '[]'),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('platform', d.platform, 'updated_at', d.updated_at) order by d.updated_at)
                from push_tokens d where d.profile_id = me), '[]'),
    'notifications', coalesce((select jsonb_agg(jsonb_build_object('kind', n.kind, 'title', n.title, 'body', n.body, 'at', n.created_at, 'sent_at', n.sent_at) order by n.id)
                from notifications n where n.recipient_id = me), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('type', e.type, 'at', e.at, 'invite', e.invite_id) order by e.id)
                -- A flag on my handle is logged against me, but it names the plan and so the flagger:
                -- like reports about me, it is not part of an export.
                from events e where e.actor_id = me and e.type <> 'bad_contact'), '[]'),
    'consents', coalesce((select jsonb_agg(jsonb_build_object('kind', c.kind, 'version', c.version, 'at', c.at) order by c.at)
                from consents c where c.user_id = me), '[]'),
    'date_ratings', coalesce((select jsonb_agg(jsonb_build_object('invite', r.invite_id, 'worth', r.worth, 'again', r.again, 'unsafe', r.unsafe, 'at', r.at) order by r.at)
                from date_ratings r where r.user_id = me), '[]'),
    'privacy_requests', coalesce((select jsonb_agg(jsonb_build_object('kind', q.kind, 'detail', q.detail, 'at', q.at, 'handled_at', q.handled_at, 'outcome', q.outcome) order by q.at)
                from privacy_requests q where q.user_id = me), '[]'),
    'error_reports', coalesce((select jsonb_agg(jsonb_build_object('code', x.code, 'trace', x.trace, 'route', x.route, 'at', x.at) order by x.at)
                from client_errors x where x.user_id = me), '[]'),
    'moderation', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'action', m.action, 'reason', m.note, 'at', m.at) order by m.at)
                from private.moderation_actions m where m.profile_id = me), '[]'),
    'line_review', (select jsonb_build_object('text', l.text, 'status', l.status, 'reason', l.reason) from private.line_reviews l where l.profile_id = me)
  );
end $$;
