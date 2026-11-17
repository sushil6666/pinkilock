-- Error codes (docs/build-plan.md, WP0b). Every error a function raises now carries a stable
-- code of its own (SQLSTATE PLnnn) with the same words as before, so the app maps on the code and
-- never on the text. The same catalogue is src/domain/errors.ts; tests/unit/errors.test.ts checks
-- that the two match, and tests/db/tracing.sql that no function raises without a code.
--
-- Generated: these are the functions exactly as the earlier migrations left them (read back with
-- pg_get_functiondef), with only each `raise exception '...'` rewritten. CREATE OR REPLACE keeps
-- their owners and grants.
--
-- Codes: PL00x who you are, PL01x reports and blocks, PL02x asks, PL03x the promise steps, PL04x
-- the event log, PL05x client error reports. A new error takes the next free code in its group.

CREATE OR REPLACE FUNCTION public.bail(p_invite uuid)
 RETURNS invites
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  inv invites;
begin
  update invites set status = 'flaked', flaked_by = me, resolved_at = now()
  where id = p_invite and me in (from_id, to_id) and status = 'locked'
  returning * into inv;
  if not found then raise exception using errcode = 'PL036', message = 'Only a locked plan can be bailed on.'; end if;
  insert into events (actor_id, invite_id, type, props)
  values (me, inv.id, 'bailed', jsonb_build_object('late', now() > inv.starts_at - interval '2 hours'));
  return inv;
end $function$
;

CREATE OR REPLACE FUNCTION public.block_user(p_profile uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if p_profile = me then raise exception using errcode = 'PL010', message = 'You cannot block yourself.'; end if;
  if not exists (select 1 from profiles where id = me) then raise exception using errcode = 'PL002', message = 'Finish setting up first.'; end if;
  if not exists (select 1 from profiles where id = p_profile) then raise exception using errcode = 'PL003', message = 'That person is not around any more.'; end if;
  insert into blocks (blocker_id, blocked_id) values (me, p_profile) on conflict do nothing;
  perform private.end_live_invites(me, p_profile, 'block');
end $function$
;

CREATE OR REPLACE FUNCTION public.check_in(p_invite uuid)
 RETURNS invites
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  inv invites;
begin
  select * into inv from invites where id = p_invite and me in (from_id, to_id) for update;
  if not found or inv.status <> 'locked' then raise exception using errcode = 'PL034', message = 'Nothing to check in to.'; end if;
  if now() < inv.starts_at - interval '10 minutes' or now() > inv.starts_at + interval '30 minutes' then
    raise exception using errcode = 'PL035', message = 'Check-in is not open.';
  end if;
  if me = any (inv.check_ins) then return inv; end if;

  update invites set check_ins = array_append(check_ins, me) where id = inv.id returning * into inv;
  insert into events (actor_id, invite_id, type) values (me, inv.id, 'checked_in');
  if cardinality(inv.check_ins) >= 2 then
    update invites set status = 'kept', resolved_at = now() where id = inv.id returning * into inv;
    insert into events (actor_id, invite_id, type) values (inv.from_id, inv.id, 'kept'), (inv.to_id, inv.id, 'kept');
  end if;
  return inv;
end $function$
;

CREATE OR REPLACE FUNCTION public.decline_invite(p_invite uuid)
 RETURNS invites
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  inv invites;
begin
  update invites set status = 'declined', declined_by = me, resolved_at = now()
  where id = p_invite and me in (from_id, to_id) and status in ('sent', 'half_locked')
  returning * into inv;
  if not found then raise exception using errcode = 'PL033', message = 'This one is not open any more.'; end if;
  insert into events (actor_id, invite_id, type) values (me, inv.id, 'declined');
  return inv;
end $function$
;

CREATE OR REPLACE FUNCTION public.delete_my_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  other uuid;
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  for other in
    select distinct case when from_id = me then to_id else from_id end
    from invites where me in (from_id, to_id) and status in ('sent', 'half_locked', 'locked')
  loop
    perform private.end_live_invites(me, other, 'account_deleted');
  end loop;
  -- The log keeps the row and loses the person. app_open props come from the phone, so they go.
  update events set actor_id = null, props = case when type = 'app_open' then '{}'::jsonb else props end
  where actor_id = me;
  delete from auth.users where id = me;
  -- An onboarding that never finished has no auth row left to cascade from, but may have a profile.
  delete from profiles where id = me;
end $function$
;

CREATE OR REPLACE FUNCTION public.export_my_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  return jsonb_build_object(
    'format', 'pinkilock-export-1',
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'phone', u.phone, 'email', nullif(u.email, ''), 'created_at', u.created_at, 'is_anonymous', u.is_anonymous)
                from auth.users u where u.id = me),
    'profile', (select to_jsonb(p) from profiles p where p.id = me),
    'contact', (select jsonb_build_object('kind', c.contact_kind, 'handle', c.contact_handle, 'photos', c.photos)
                from profile_private c where c.profile_id = me),
    'trust_score', (select to_jsonb(t) - 'profile_id' from trust_scores t where t.profile_id = me),
    -- The other person appears by id only: their card is theirs.
    'invites', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', i.id, 'role', case when i.from_id = me then 'asked' else 'was_asked' end,
                  'other_person', case when i.from_id = me then i.to_id else i.from_id end,
                  'idea', i.idea_id, 'starts_at', i.starts_at, 'place', i.place, 'note', i.note, 'status', i.status,
                  'my_check_in', me = any (i.check_ins), 'flaked', i.flaked_by = me, 'created_at', i.created_at,
                  'resolved_at', i.resolved_at) order by i.created_at)
                from invites i where me in (i.from_id, i.to_id)), '[]'),
    'passes', coalesce((select jsonb_agg(jsonb_build_object('profile', x.passed_id, 'at', x.at) order by x.at)
                from passes x where x.profile_id = me), '[]'),
    'blocks', coalesce((select jsonb_agg(jsonb_build_object('profile', b.blocked_id, 'at', b.created_at) order by b.created_at)
                from blocks b where b.blocker_id = me), '[]'),
    -- Reports I made. Reports about me are not part of an export.
    'reports_made', coalesce((select jsonb_agg(jsonb_build_object('profile', r.reported_id, 'reason', r.reason, 'detail', r.detail, 'at', r.created_at) order by r.created_at)
                from reports r where r.reporter_id = me), '[]'),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('platform', d.platform, 'updated_at', d.updated_at) order by d.updated_at)
                from push_tokens d where d.profile_id = me), '[]'),
    'notifications', coalesce((select jsonb_agg(jsonb_build_object('kind', n.kind, 'title', n.title, 'body', n.body, 'at', n.created_at, 'sent_at', n.sent_at) order by n.id)
                from notifications n where n.recipient_id = me), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('type', e.type, 'at', e.at, 'invite', e.invite_id) order by e.id)
                from events e where e.actor_id = me), '[]')
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.log_event(p_type text, p_props jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if p_type <> 'app_open' then raise exception using errcode = 'PL040', message = 'Only app_open can be logged from the app.'; end if;
  insert into events (actor_id, type, props) values (auth.uid(), p_type, coalesce(p_props, '{}'));
end $function$
;

CREATE OR REPLACE FUNCTION public.offer_pinky(p_invite uuid)
 RETURNS invites
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  inv invites;
begin
  select * into inv from invites where id = p_invite and me in (from_id, to_id) for update;
  if not found then raise exception using errcode = 'PL030', message = 'That invite is gone.'; end if;
  if inv.status in ('sent', 'half_locked') and now() >= inv.expires_at then raise exception using errcode = 'PL031', message = 'This one expired.'; end if;

  if inv.status = 'sent' then
    if me <> inv.to_id then raise exception using errcode = 'PL032', message = 'The person you asked goes first.'; end if;
    update invites set status = 'half_locked', first_pinky_by = me where id = inv.id returning * into inv;
    insert into events (actor_id, invite_id, type) values (me, inv.id, 'pinky_out');
  elsif inv.status = 'half_locked' then
    if inv.first_pinky_by = me then return inv; end if;
    update invites set status = 'locked', locked_at = now() where id = inv.id returning * into inv;
    insert into events (actor_id, invite_id, type) values (me, inv.id, 'pinky_out'), (me, inv.id, 'locked');
  else
    raise exception using errcode = 'PL033', message = 'This one is not open any more.';
  end if;
  return inv;
end $function$
;

CREATE OR REPLACE FUNCTION public.register_push_token(p_token text, p_platform text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if not exists (select 1 from profiles where id = me) then raise exception using errcode = 'PL002', message = 'Finish setting up first.'; end if;
  insert into push_tokens (token, profile_id, platform) values (p_token, me, p_platform)
  on conflict (token) do update set profile_id = excluded.profile_id, platform = excluded.platform, updated_at = now();
end $function$
;

CREATE OR REPLACE FUNCTION public.report_user(p_profile uuid, p_reason text, p_detail text DEFAULT ''::text, p_invite uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  inv uuid;
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if p_profile = me then raise exception using errcode = 'PL011', message = 'You cannot report yourself.'; end if;
  if not exists (select 1 from profiles where id = me) then raise exception using errcode = 'PL002', message = 'Finish setting up first.'; end if;
  if not exists (select 1 from profiles where id = p_profile) then raise exception using errcode = 'PL003', message = 'That person is not around any more.'; end if;
  if p_reason not in ('fake', 'harassment', 'inappropriate', 'underage', 'unsafe', 'other') then raise exception using errcode = 'PL012', message = 'Pick a reason.'; end if;
  if char_length(coalesce(p_detail, '')) > 500 then raise exception using errcode = 'PL013', message = 'Keep it under 500 characters.'; end if;
  if (select count(*) from reports where reporter_id = me and created_at > now() - interval '24 hours') >= 10 then
    raise exception using errcode = 'PL014', message = 'You have sent a lot of reports today. We are looking at them.';
  end if;
  -- Only an invite the two of you share can be attached; anything else is dropped, not trusted.
  select id into inv from invites
  where id = p_invite and ((from_id = me and to_id = p_profile) or (from_id = p_profile and to_id = me));
  insert into reports (reporter_id, reported_id, invite_id, reason, detail)
  values (me, p_profile, inv, p_reason, btrim(coalesce(p_detail, '')));
  insert into blocks (blocker_id, blocked_id) values (me, p_profile) on conflict do nothing;
  perform private.end_live_invites(me, p_profile, 'block');
end $function$
;

CREATE OR REPLACE FUNCTION public.send_invite(p_to uuid, p_idea text, p_starts_at timestamp with time zone, p_place text, p_note text)
 RETURNS invites
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  mins int;
  inv invites;
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if p_to = me then raise exception using errcode = 'PL020', message = 'You cannot ask yourself.'; end if;
  if private.blocked_pair(me, p_to) then raise exception using errcode = 'PL004', message = 'That person is not available.'; end if;
  if p_starts_at <= now() then raise exception using errcode = 'PL021', message = 'Pick a time that has not passed.'; end if;
  select minutes into mins from ideas where id = p_idea;
  if not found then raise exception using errcode = 'PL022', message = 'Unknown idea.'; end if;
  if (select count(*) from invites where from_id = me and status in ('sent', 'half_locked')) >= 3 then
    raise exception using errcode = 'PL023', message = 'You have 3 asks open. Wait for an answer first.';
  end if;
  begin
    insert into invites (from_id, to_id, idea_id, starts_at, minutes, place, note, expires_at)
    values (me, p_to, p_idea, p_starts_at, mins, btrim(coalesce(p_place, '')), left(btrim(coalesce(p_note, '')), 80),
            least(now() + interval '24 hours', p_starts_at))
    returning * into inv;
  exception when unique_violation then
    raise exception using errcode = 'PL024', message = 'You two already have something open.';
  end;
  insert into events (actor_id, invite_id, type, props) values (me, inv.id, 'ask_sent', jsonb_build_object('idea', p_idea));
  return inv;
end $function$
;

CREATE OR REPLACE FUNCTION public.unblock_user(p_profile uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  delete from blocks where blocker_id = auth.uid() and blocked_id = p_profile;
end $function$
;
