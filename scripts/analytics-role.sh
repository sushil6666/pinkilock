#!/usr/bin/env bash
# Let the analytics worker log in: give the pinkilock_analytics role a password.
#
#   ANALYTICS_DB_PASSWORD=... scripts/analytics-role.sh <admin-db-url>
#
# The role and its grants come from the migrations (read events, invites, profiles; write
# trust_scores and analytics.*). This only adds the login, which cannot live in a migration
# because it is a secret. Safe to run again: it sets the same password.
set -euo pipefail
db="${1:?usage: analytics-role.sh <admin-db-url>}"
: "${ANALYTICS_DB_PASSWORD:?Set ANALYTICS_DB_PASSWORD}"
# A psql variable keeps the password out of the process list and the logs.
psql "$db" -v ON_ERROR_STOP=1 -q -v pw="$ANALYTICS_DB_PASSWORD" <<'SQL'
alter role pinkilock_analytics with login password :'pw';
SQL
echo "pinkilock_analytics can log in"
