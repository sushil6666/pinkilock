-- Account deletion and data export (Phase 3).
--
-- delete_my_account() removes the person, not the statistics:
--   * every live invite they are on ends as `ended` (no flake for anyone);
--   * their rows in the events log stay, with the actor removed and any free-form props
--     cleared, so the funnel and retention keep their counts and nothing points back to them;
--   * the auth user is deleted, and every table that references the profile cascades with it:
--     profile, contact, invites, passes, blocks, device tokens, outbox rows, trust score.
--     Reports keep their row with the person's id set to null.
-- The other person's record does not change: Trust Scores count kept promises and flakes from
-- the events log (analytics/duckdb_pipeline.py), where their own rows keep their actor.
--
-- export_my_data() returns everything the database holds about the caller as one JSON
-- document, and nothing about anyone else that RLS would not already show them.

create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first.'; end if;
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
end $$;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  other uuid;
begin
  if me is null then raise exception 'Sign in first.'; end if;
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
end $$;

revoke all on function public.export_my_data(), public.delete_my_account() from public, anon;
grant execute on function public.export_my_data(), public.delete_my_account() to authenticated;
