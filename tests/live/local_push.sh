#!/usr/bin/env bash
# Run the push test against the local stack. The `push` function must be pointed at the fake
# Expo first (once per `supabase start`):
#   EXPO_PUSH_URL=http://host.docker.internal:54399 scripts/push-config.sh local
#   npx supabase stop && npx supabase start
set -euo pipefail
cd "$(dirname "$0")/../.."
if ! grep -q '^EXPO_PUSH_URL=http://host.docker.internal' supabase/functions/.env 2>/dev/null; then
  echo "The push function is not pointed at the fake Expo. See the top of tests/live/local_push.sh." >&2
  exit 2
fi
eval "$(npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|DB_URL)=')"
export EXPO_PUBLIC_SUPABASE_URL="$API_URL" EXPO_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" E2E_DB_URL="$DB_URL"
exec npx tsx --test tests/live/push.test.ts
