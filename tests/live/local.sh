#!/usr/bin/env bash
# Run the live tests (two users, and Phase 3 safety and accounts) against the local stack
# (`supabase start`), using its own URL and keys.
set -euo pipefail
cd "$(dirname "$0")/../.."
eval "$(npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|DB_URL)=')"
export E2E_PHONE_TEST=1 E2E_MAILBOX="${E2E_MAILBOX:-http://127.0.0.1:54324}" EXPO_PUBLIC_SUPABASE_URL="$API_URL" EXPO_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" E2E_DB_URL="$DB_URL"
exec npx tsx --test tests/live/two_users.test.ts tests/live/safety.test.ts
