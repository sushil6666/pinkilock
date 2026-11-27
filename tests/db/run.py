#!/usr/bin/env python3
"""Database checks on a throwaway Postgres: every file in supabase/migrations in order (the same
SQL that `supabase db push` sends to the project), RLS, the promise functions, the DuckDB
pipeline end to end, the push outbox, blocking and reporting, data export and account deletion,
the attacker suite, and error codes and tracing.

    pip install pgserver duckdb
    python tests/db/run.py

Nothing here touches Supabase or any existing database: pgserver starts its own server in a
temporary folder and removes it afterwards. `--duckdb-python` names the interpreter that has
duckdb if it is not this one.
"""
import argparse
import os
import pathlib
import subprocess
import sys
import tempfile
import urllib.parse

import pgserver

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = pathlib.Path(__file__).resolve().parent


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--duckdb-python", default=sys.executable)
    args = ap.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        srv = pgserver.get_server(pathlib.Path(tmp) / "pgdata", cleanup_mode="stop")
        try:
            uri = srv.get_uri()
            migrations = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
            # Supabase records a migration by the number before the first underscore, and refuses
            # two files with the same one. Two branches can each pick the next free number.
            versions = [f.name.split("_", 1)[0] for f in migrations]
            clashes = sorted({v for v in versions if versions.count(v) > 1})
            if clashes:
                names = ", ".join(f.name for f in migrations if f.name.split("_", 1)[0] in clashes)
                print(f"Two migrations share a version number; rename the newer one: {names}", file=sys.stderr)
                return 1
            for f in (HERE / "supabase_shim.sql", *migrations, HERE / "scenario.sql"):
                print(f"== {f.relative_to(ROOT)}")
                out = subprocess.run(["psql", uri, "-v", "ON_ERROR_STOP=1", "-q", "-f", str(f)], capture_output=True, text=True)
                print("\n".join(l for l in out.stdout.splitlines() if l.strip().startswith("ok")))
                if out.returncode != 0:
                    print(out.stderr, file=sys.stderr)
                    return 1
            # The pipeline logs in as pinkilock_analytics, set up by the same script the deploy uses,
            # so it has the worker's rights and no more: a view that calls a function the role may not
            # run fails here, not first on the scheduled run (issue #51).
            role_env = {**os.environ, "ANALYTICS_DB_PASSWORD": "analytics-test"}
            out = subprocess.run([str(ROOT / "scripts" / "analytics-role.sh"), uri], capture_output=True, text=True, env=role_env)
            if out.returncode != 0:
                print(out.stderr, file=sys.stderr)
                return 1
            parts = urllib.parse.urlsplit(uri)
            host = parts.netloc.rsplit("@", 1)[-1]
            worker_uri = urllib.parse.urlunsplit(parts._replace(netloc=f"pinkilock_analytics:analytics-test@{host}"))
            # The pipeline runs twice: once on the promise scenario, and again after blocks,
            # reports and an account deletion, which must leave everyone else's score alone.
            # Last, the attacker suite (docs/build-plan.md, WP0): a hostile signed-in client, then a
            # third pipeline run over what it did.
            gaps = 0
            for step in ("pipeline", HERE / "check_scores.sql", HERE / "push.sql", HERE / "safety.sql", HERE / "account.sql",
                         "pipeline", HERE / "check_after.sql", HERE / "attacker.sql", "pipeline", HERE / "attacker_after.sql",
                         HERE / "tracing.sql", HERE / "profile_rules.sql", HERE / "venues.sql", HERE / "limits.sql", HERE / "review.sql", HERE / "ratings.sql", HERE / "privacy.sql", HERE / "doubles.sql", HERE / "photos.sql", HERE / "auth_codes.sql", HERE / "feed.sql", HERE / "faces.sql", HERE / "discover_race.sql", HERE / "self_love.sql", HERE / "spicy.sql", HERE / "wallet.sql", HERE / "calls.sql", HERE / "spicy_quiz.sql", HERE / "talk.sql", HERE / "voice.sql", HERE / "pink_gold.sql", HERE / "paid_pause.sql", HERE / "referrals.sql", HERE / "couple.sql", HERE / "city_events.sql"):
                if step == "pipeline":
                    print("== analytics/duckdb_pipeline.py")
                    run = subprocess.run([args.duckdb_python, str(ROOT / "analytics" / "duckdb_pipeline.py"), "--dsn", worker_uri])
                    if run.returncode != 0:
                        return 1
                    continue
                print(f"== {step.relative_to(ROOT)}")
                out = subprocess.run(["psql", uri, "-v", "ON_ERROR_STOP=1", "-q", "-f", str(step)], capture_output=True, text=True)
                shown = [l for l in out.stdout.splitlines() if l.strip().startswith(("ok", "gap"))]
                gaps += sum(l.strip().startswith("gap") for l in shown)
                print("\n".join(shown))
                if out.returncode != 0:
                    print(out.stderr, file=sys.stderr)
                    return 1
            print("\nALL DATABASE CHECKS PASSED")
            if gaps:
                print(f"{gaps} known gaps are still open (the lines that start with 'gap'; see docs/build-plan.md).")
            return 0
        finally:
            srv.cleanup()


if __name__ == "__main__":
    sys.exit(main())
