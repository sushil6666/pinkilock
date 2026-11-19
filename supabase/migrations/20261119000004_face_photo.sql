-- Your face on your card (ROADMAP Phase 4, build plan WP7b, decision D095).
--
-- One optional photo of your face, taken in the app with the camera, shown on your card in place
-- of the drawn portrait. It travels the same road as the photos behind the lock
-- (20261118000014_photos.sql): the `photo` Edge Function strips it and calls add_photo, it waits
-- as `pending` until a person approves it, and a photo held for carrying a contact is a strike.
--
--   * public.photos.kind: 'locked' (behind the lock, as before) or 'face'.
--   * private.face_visible(owner, viewer): who may see a face. The owner; anyone the card is already
--     shown to (people I share a plan or a duo with, and cards Discover gave me in the last two
--     days); never across a block, and never while the owner's account is paused.
--   * add_photo gains p_kind. A face: one waiting at a time; a new one at most once every 7 days,
--     except straight after one that was held; three tries a week at most. Sending one records the
--     `face` consent (the line shown on the camera screen).
--   * When a new face is approved, the older ones go (and their files to the trash).
--   * The card's photo count counts the photos behind the lock only.
--   * The data download, format 6: each photo says which kind it is.

alter table public.photos add column kind text not null default 'locked' check (kind in ('locked', 'face'));
grant select (kind) on public.photos to authenticated;
create index photos_face_idx on public.photos (profile_id) where kind = 'face';

alter table private.photo_uploads add column kind text not null default 'locked' check (kind in ('locked', 'face'));

-- Who may see a face: whoever the card itself is shown to.
create or replace function private.face_visible(p_owner uuid, p_viewer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_viewer is not null and p_owner is not null and (
    p_viewer = p_owner or (
      not private.blocked_pair(p_viewer, p_owner)
      and not exists (select 1 from public.profiles s where s.id = p_owner and s.suspended_at is not null)
      and (private.shares_invite(p_viewer, p_owner)
           or exists (select 1 from private.discover_seen d
                      where d.user_id = p_viewer and d.card_id = p_owner and d.at > now() - interval '2 days'))));
$$;
revoke all on function private.face_visible(uuid, uuid) from public, anon, authenticated;
-- Policies run with the reader's rights, so the reader must be able to call it (see issue #51).
grant execute on function private.face_visible(uuid, uuid) to authenticated;

-- The photos behind the lock stay behind the lock; a face is read by whoever sees the card.
drop policy photos_revealed on public.photos;
create policy photos_revealed on public.photos for select to authenticated
  using (kind = 'locked' and status = 'approved' and private.revealed_to(profile_id, auth.uid()));
create policy photos_face on public.photos for select to authenticated
  using (kind = 'face' and status = 'approved' and private.face_visible(profile_id, auth.uid()));

-- "3 photos behind the lock" on the card: the face is not one of them.
create or replace function private.count_photos()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  who uuid := coalesce(new.profile_id, old.profile_id);
begin
  update public.profiles set photo_count = (select count(*) from public.photos where profile_id = who and kind = 'locked' and status = 'approved')
  where id = who;
  return null;
end $$;

-- A new face, once approved, replaces the old one and any that were held.
create or replace function private.replace_face()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.photos where profile_id = new.profile_id and kind = 'face' and id <> new.id;
  return null;
end $$;
revoke all on function private.replace_face() from public, anon, authenticated;
create trigger photos_replace_face after update of status on public.photos
  for each row when (new.kind = 'face' and new.status = 'approved' and old.status is distinct from 'approved')
  execute function private.replace_face();

-- The face is a consent of its own: it is shown to people who have not met you.
alter table public.consents drop constraint consents_kind_check;
alter table public.consents add constraint consents_kind_check check (kind in ('adult', 'terms', 'privacy', 'sensitive', 'face'));
-- The four that let a person in are still exactly those four.
create or replace function private.has_consents(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select count(distinct c.kind) from public.consents c
          where c.user_id = p_user and c.version = private.config_text('legal_version')
            and c.kind in ('adult', 'terms', 'privacy', 'sensitive')) = 4;
$$;

-- Called by the `photo` Edge Function only. As before, plus the kind.
drop function public.add_photo(uuid, int, boolean);
create function public.add_photo(p_user uuid, p_bytes int, p_jpeg boolean, p_kind text default 'locked')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_path text;
  v_kind text := coalesce(p_kind, 'locked');
begin
  if p_user is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception using errcode = 'PL002', message = 'Finish setting up first.';
  end if;
  if exists (select 1 from public.profiles where id = p_user and suspended_at is not null) then
    raise exception using errcode = 'PL072', message = 'This account is paused while we look at a report.';
  end if;
  if v_kind not in ('locked', 'face') or not coalesce(p_jpeg, false) or p_bytes is null or p_bytes < 1 or p_bytes > 2097152 then
    raise exception using errcode = 'PL107', message = 'That photo could not be used. Pick another one.';
  end if;
  -- Serialise one person's uploads, so two at once cannot both pass the count.
  perform pg_advisory_xact_lock(hashtext('photos:' || p_user::text));
  if v_kind = 'locked' then
    if (select count(*) from public.photos where profile_id = p_user and kind = 'locked') >= 3 then
      raise exception using errcode = 'PL108', message = 'You have three photos. Remove one first.';
    end if;
    if (select count(*) from private.photo_uploads where user_id = p_user and kind = 'locked' and at > now() - interval '7 days') >= 6 then
      raise exception using errcode = 'PL109', message = 'That is enough new photos for this week. Try again in a few days.';
    end if;
  else
    if exists (select 1 from public.photos where profile_id = p_user and kind = 'face' and status = 'pending') then
      raise exception using errcode = 'PL113', message = 'Your new face photo is still being checked.';
    end if;
    -- Once a week; straight after a held one, again (three tries a week at most).
    if (select count(*) from private.photo_uploads where user_id = p_user and kind = 'face' and at > now() - interval '7 days') >= 3
       or (exists (select 1 from private.photo_uploads where user_id = p_user and kind = 'face' and at > now() - interval '7 days')
           and coalesce((select status from public.photos where profile_id = p_user and kind = 'face' order by created_at desc limit 1), '') <> 'held') then
      raise exception using errcode = 'PL114', message = 'You can change your face photo once a week.';
    end if;
    insert into public.consents (user_id, kind, version) values (p_user, 'face', private.config_text('legal_version'))
    on conflict do nothing;
  end if;
  v_path := p_user::text || '/' || v_id::text || '.jpg';
  insert into public.photos (id, profile_id, path, bytes, kind) values (v_id, p_user, v_path, p_bytes, v_kind);
  insert into private.photo_uploads (user_id, kind) values (p_user, v_kind);
  return jsonb_build_object('id', v_id, 'path', v_path, 'kind', v_kind);
end $$;
revoke all on function public.add_photo(uuid, int, boolean, text) from public, anon, authenticated;
grant execute on function public.add_photo(uuid, int, boolean, text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- The data download, format 6: as in 20261118000014_photos.sql, and each photo says its kind.
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
    'format', 'pinkilock-export-6',
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'phone', u.phone, 'email', nullif(u.email, ''), 'created_at', u.created_at, 'is_anonymous', u.is_anonymous)
                from auth.users u where u.id = me),
    'profile', (select to_jsonb(p) from profiles p where p.id = me),
    'contact', (select jsonb_build_object('kind', c.contact_kind, 'handle', c.contact_handle, 'photos', c.photos, 'verified_at', c.contact_verified_at)
                from profile_private c where c.profile_id = me),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'status', x.status, 'bytes', x.bytes, 'at', x.created_at, 'decided_at', x.decided_at) order by x.created_at)
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
