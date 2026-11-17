#!/usr/bin/env bash
# Switch the link gate on or off (docs/build-plan.md, WP2): when on, sending an ask and putting a
# pinky out need an account with an email or phone linked.
#
#   scripts/gate-config.sh <admin-db-url> on|off
#
# The deploy workflow runs this after the migrations: on when email or phone sign-in can send a
# code, off when neither can (nobody could link, so nobody could ask). Safe to run again.
set -euo pipefail
db="${1:?usage: gate-config.sh <admin-db-url> on|off}"
case "${2:-}" in
  on) value=true ;;
  off) value=false ;;
  *) echo "usage: gate-config.sh <admin-db-url> on|off" >&2; exit 2 ;;
esac
psql "$db" -v ON_ERROR_STOP=1 -qAt -v v="$value" <<'SQL'
select private.set_config('require_linked', :'v');
SQL
echo "link gate: $2"
