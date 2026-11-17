#!/usr/bin/env bash
# Build the web app against the local stack (`supabase start`) and drive it as two people.
set -euo pipefail
cd "$(dirname "$0")/../.."
eval "$(npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|DB_URL)=')"
export WEB_DIR="$PWD/dist/e2e-web" E2E_DB_URL="$DB_URL"
EXPO_PUBLIC_BACKEND= EXPO_PUBLIC_SUPABASE_URL="$API_URL" EXPO_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
  npx expo export -p web --clear --output-dir "$WEB_DIR" >/dev/null
exec node tests/live/app_two_phones.mjs
