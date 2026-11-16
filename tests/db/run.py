#!/usr/bin/env python3
"""Database checks on a throwaway Postgres: schema.sql, RLS, the promise functions, then the
DuckDB pipeline end to end.

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
            for f in (HERE / "supabase_shim.sql", ROOT / "supabase" / "schema.sql", HERE / "scenario.sql"):
                print(f"== {f.relative_to(ROOT)}")
                out = subprocess.run(["psql", uri, "-v", "ON_ERROR_STOP=1", "-q", "-f", str(f)], capture_output=True, text=True)
                print("\n".join(l for l in out.stdout.splitlines() if l.strip().startswith("ok")))
                if out.returncode != 0:
                    print(out.stderr, file=sys.stderr)
                    return 1
            print("== analytics/duckdb_pipeline.py")
            run = subprocess.run([args.duckdb_python, str(ROOT / "analytics" / "duckdb_pipeline.py"), "--dsn", uri])
            if run.returncode != 0:
                return 1
            print("== tests/db/check_scores.sql")
            out = subprocess.run(["psql", uri, "-v", "ON_ERROR_STOP=1", "-q", "-f", str(HERE / "check_scores.sql")], capture_output=True, text=True)
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
