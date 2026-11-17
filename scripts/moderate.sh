#!/usr/bin/env bash
# Moderation from a terminal, with the database role (docs/build-plan.md, WP1 and WP7). No client
# role and no service role key is involved; reports and the line review queue are readable only
# this way. Every action needs a reason, which is kept in private.moderation_actions.
#
#   scripts/moderate.sh <db-url> queue                          open reports and lines waiting for a person
#   scripts/moderate.sh <db-url> report <id> <action> "<reason>" act on a report
#   scripts/moderate.sh <db-url> person <uuid> <action> "<reason>" act on a person directly
#   scripts/moderate.sh <db-url> history <uuid>                 what was done to a person, and why
#   scripts/moderate.sh <db-url> requests                       privacy requests and appeals waiting
#   scripts/moderate.sh <db-url> answer <id> "<what was done>"   mark one answered
#
# Actions: dismiss, hide_line (removes the line, no new line for 30 days, one strike; two strikes
# suspend), suspend, unsuspend, approve_line, reject_line.
set -euo pipefail
db="${1:?usage: moderate.sh <db-url> queue|report|person|history ...}"
cmd="${2:-queue}"
q() { psql "$db" -v ON_ERROR_STOP=1 -X -P pager=off "$@"; }
case "$cmd" in
  queue)
    echo "== Open reports (oldest first)"
    q -c "select r.id, r.created_at::timestamp(0) as at, r.reason, r.reported_id, left(r.detail, 80) as detail,
                 p.name, p.tagline, p.contact_strikes as strikes, p.suspended_at is not null as suspended
          from public.reports r left join public.profiles p on p.id = r.reported_id
          where r.reviewed_at is null order by r.created_at"
    echo "== Lines waiting for a person"
    q -c "select l.profile_id, l.created_at::timestamp(0) as at, l.status, l.text, l.reason
          from private.line_reviews l where l.status = 'held' or (l.status = 'pending' and l.attempts >= 3)
             or (l.status = 'pending' and coalesce(private.config_text('line_review'), 'off') = 'human')
          order by l.created_at"
    ;;
  report)
    id="${3:?report id}"; action="${4:?action}"; reason="${5:?reason}"
    # Through stdin, not -c, so that psql fills in the quoted variables (and the reason needs no escaping).
    echo "select private.moderate(:'id'::bigint, null, :'action', :'reason')" | q -qAt -v id="$id" -v action="$action" -v reason="$reason"
    ;;
  person)
    who="${3:?person uuid}"; action="${4:?action}"; reason="${5:?reason}"
    echo "select private.moderate(null, :'who'::uuid, :'action', :'reason')" | q -qAt -v who="$who" -v action="$action" -v reason="$reason"
    ;;
  requests)
    echo "== Requests and appeals waiting for an answer (oldest first; answer within 30 days)"
    q -c "select r.id, r.at::timestamp(0), r.kind, r.user_id, r.moderation_action_id as appeal_of, r.detail
          from public.privacy_requests r where r.handled_at is null order by r.at"
    ;;
  answer)
    id="${3:?request id}"; outcome="${4:?what was done}"
    echo "update public.privacy_requests set handled_at = now(), outcome = left(:'outcome', 500) where id = :'id'::bigint returning id" | q -qAt -v id="$id" -v outcome="$outcome"
    ;;
  history)
    who="${3:?person uuid}"
    echo "select at::timestamp(0), action, report_id, note from private.moderation_actions where profile_id = :'who'::uuid order by at" | q -v who="$who"
    ;;
  *)
    echo "usage: moderate.sh <db-url> queue | report <id> <action> <reason> | person <uuid> <action> <reason> | history <uuid> | requests | answer <id> <outcome>" >&2
    exit 2
    ;;
esac
