#!/usr/bin/env bash
# Connect Postgres to the `push` Edge Function: one shared secret, stored in both places.
#
#   scripts/push-config.sh local                 for `supabase start`
#   scripts/push-config.sh remote <db-url>       for the linked project (the deploy workflow runs this)
#
# local  writes supabase/functions/.env (git-ignored) and points Postgres at the function inside
#        the Docker network. Run `supabase stop && supabase start` afterwards so the function
#        picks the file up. EXPO_PUSH_URL in the environment is copied in (tests use a fake Expo).
# remote sets the function secret with the CLI and the Vault entries over <db-url>. The secret is
#        freshly generated each time and never printed.
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:-}"
secret="$(openssl rand -hex 32)"

case "$mode" in
  local)
    eval "$(npx supabase status -o env 2>/dev/null | grep -E '^DB_URL=')"
    {
      echo "PUSH_HOOK_SECRET=$secret"
      if [ -n "${EXPO_PUSH_URL:-}" ]; then echo "EXPO_PUSH_URL=$EXPO_PUSH_URL"; fi
    } > supabase/functions/.env
    url="http://kong:8000/functions/v1/push"
    db="$DB_URL"
    ;;
  remote)
    db="${2:?usage: push-config.sh remote <db-url>}"
    ref="$(cat supabase/.temp/project-ref)"
    npx supabase secrets set "PUSH_HOOK_SECRET=$secret" --project-ref "$ref" >/dev/null
    url="https://$ref.supabase.co/functions/v1/push"
    ;;
  *)
    echo "usage: push-config.sh local | remote <db-url>" >&2
    exit 2
    ;;
esac

# psql variables keep the secret out of the process list and the logs.
psql "$db" -v ON_ERROR_STOP=1 -q -v url="$url" -v secret="$secret" <<'SQL' >/dev/null
select public.set_push_config(:'url', :'secret');
SQL
echo "push config set: Postgres will call $url"
