#!/usr/bin/env bash
# Run the live tests (two users, Phase 3 safety and accounts, and the attacker suite) against the local stack
# (`supabase start`), using its own URL and keys.
set -euo pipefail
cd "$(dirname "$0")/../.."
eval "$(npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|DB_URL)=')"
export E2E_PHONE_TEST=1 E2E_MAILBOX="${E2E_MAILBOX:-http://127.0.0.1:54324}" EXPO_PUBLIC_SUPABASE_URL="$API_URL" EXPO_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" E2E_DB_URL="$DB_URL"
# GoTrue loads the email templates (supabase/templates) from Kong, and again every 10 seconds.
# Right after `supabase start` its first load can run before Kong answers, and until the next
# load it sends GoTrue's default emails, which carry a link and no code. Wait until the last
# failed load is older than one reload.
auth=supabase_auth_pinkilock
for _ in $(seq 1 60); do
  last=$(docker logs --since "$(docker inspect -f '{{.State.StartedAt}}' "$auth")" "$auth" 2>&1 \
    | grep templatemailer_template_body_http_error | tail -1 | grep -o '"time":"[^"]*"' | cut -d'"' -f4 || true)
  [ -z "$last" ] && break
  [ $(( $(date +%s) - $(date -d "$last" +%s) )) -ge 12 ] && break
  sleep 1
done
exec npx tsx --test tests/live/two_users.test.ts tests/live/safety.test.ts tests/live/doubles.test.ts tests/live/attacker.test.ts
