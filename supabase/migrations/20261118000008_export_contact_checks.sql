-- The data download catches up with contact checks (supabase/migrations/20261118000004): when my
-- handle was verified, and the handles I flagged (by person and plan, never their handle). Format 4.
-- It also leaves out the `bad_contact` events logged against me: each names the plan the flag came
-- from, and so the person who flagged (found by tests/db/attacker.sql). Otherwise the same function
-- as in 20261118000002_double_dates.sql.
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
    'format', 'pinkilock-export-4',
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'phone', u.phone, 'email', nullif(u.email, ''), 'created_at', u.created_at, 'is_anonymous', u.is_anonymous)
                from auth.users u where u.id = me),
    'profile', (select to_jsonb(p) from profiles p where p.id = me),
    'contact', (select jsonb_build_object('kind', c.contact_kind, 'handle', c.contact_handle, 'photos', c.photos, 'verified_at', c.contact_verified_at)
                from profile_private c where c.profile_id = me),
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
