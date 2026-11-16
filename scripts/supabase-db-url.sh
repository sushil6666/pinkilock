#!/usr/bin/env bash
# Print a Postgres URL for the linked Supabase project that works from IPv4-only machines
# (GitHub runners): the session pooler, with the given role and password filled in.
#
#   scripts/supabase-db-url.sh <role> <password>      after `supabase link`
#
# The pooler address comes from the CLI's link cache when it has one, otherwise from the
# Management API (needs SUPABASE_ACCESS_TOKEN). The password is URL-encoded here; nothing is
# written to disk.
set -euo pipefail
cd "$(dirname "$0")/.."
role="$1" password="$2"
ref="${SUPABASE_PROJECT_REF:-$(cat supabase/.temp/project-ref 2>/dev/null || true)}"
pooler="$(cat supabase/.temp/pooler-url 2>/dev/null || true)"
api=""
if [ -z "$pooler" ]; then
  : "${SUPABASE_ACCESS_TOKEN:?No pooler URL cached and no SUPABASE_ACCESS_TOKEN to ask for one}"
  api="$(curl -fsS "https://api.supabase.com/v1/projects/$ref/config/database/pooler" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN")"
fi
python3 - "$ref" "$role" "$password" "$pooler" "$api" <<'PY'
import json, sys, urllib.parse as u
ref, role, password, pooler, api = sys.argv[1:]
if pooler:
    host = u.urlsplit(pooler).hostname
else:
    rows = json.loads(api)
    rows = rows if isinstance(rows, list) else [rows]
    host = next((r["db_host"] for r in rows if r.get("database_type", "PRIMARY") == "PRIMARY"), rows[0]["db_host"])
# Session mode (5432): a real session, which DuckDB's postgres scanner and psql both need.
print(f"postgresql://{role}.{ref}:{u.quote(password, safe='')}@{host}:5432/postgres?sslmode=require")
PY
