#!/usr/bin/env python3
"""Database checks on a throwaway Postgres: every file in supabase/migrations in order (the same
SQL that `supabase db push` sends to the project), RLS, the promise functions, the DuckDB
pipeline end to end, the push outbox, blocking and reporting, data export and account deletion.

    pip install pgserver duckdb
    python tests/db/run.py

Nothing here touches Supabase or any existing database: pgserver starts its own server in a
temporary folder and removes it afterwards. `--duckdb-python` names the interpreter that has
duckdb if it is not this one.
"""
import argparse
import pathlib
import subprocess
import sys
import tempfile

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
            for f in (HERE / "supabase_shim.sql", *migrations, HERE / "scenario.sql"):
                print(f"== {f.relative_to(ROOT)}")
                out = subprocess.run(["psql", uri, "-v", "ON_ERROR_STOP=1", "-q", "-f", str(f)], capture_output=True, text=True)
                print("\n".join(l for l in out.stdout.splitlines() if l.strip().startswith("ok")))
                if out.returncode != 0:
                    print(out.stderr, file=sys.stderr)
                    return 1
            # The pipeline runs twice: once on the promise scenario, and again after blocks,
            # reports and an account deletion, which must leave everyone else's score alone.
            for step in ("pipeline", HERE / "check_scores.sql", HERE / "push.sql", HERE / "safety.sql", HERE / "account.sql",
                         "pipeline", HERE / "check_after.sql"):
                if step == "pipeline":
                    print("== analytics/duckdb_pipeline.py")
                    run = subprocess.run([args.duckdb_python, str(ROOT / "analytics" / "duckdb_pipeline.py"), "--dsn", uri])
                    if run.returncode != 0:
                        return 1
                    continue
                print(f"== {step.relative_to(ROOT)}")
                out = subprocess.run(["psql", uri, "-v", "ON_ERROR_STOP=1", "-q", "-f", str(step)], capture_output=True, text=True)
                print("\n".join(l for l in out.stdout.splitlines() if l.strip().startswith("ok")))
                if out.returncode != 0:
                    print(out.stderr, file=sys.stderr)
                    return 1
            print("\nALL DATABASE CHECKS PASSED")
            return 0
        finally:
            srv.cleanup()


if __name__ == "__main__":
    sys.exit(main())
