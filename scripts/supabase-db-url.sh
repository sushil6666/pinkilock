#!/usr/bin/env bash
# Print a Postgres URL for the linked Supabase project that works from IPv4-only machines
# (GitHub runners): the session pooler, with the given role and password filled in.
#
#   scripts/supabase-db-url.sh <role> <password>      after `supabase link`
#
# The password is URL-encoded here; nothing is written to disk.
set -euo pipefail
role="$1" password="$2"
pooler="$(cat "$(dirname "$0")/../supabase/.temp/pooler-url")"
python3 - "$pooler" "$role" "$password" <<'PY'
import sys, urllib.parse as u
pooler, role, password = sys.argv[1:]
p = u.urlsplit(pooler)
ref = p.username.split(".", 1)[1]            # pooler users are <role>.<project ref>
host = p.hostname
print(f"postgresql://{role}.{ref}:{u.quote(password, safe='')}@{host}:5432/postgres?sslmode=require")
PY
