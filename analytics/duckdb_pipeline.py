#!/usr/bin/env python3
"""Pinkilock analytics worker: DuckDB over the live Postgres.

Why DuckDB: Trust Scores, the ask-to-kept funnel and retention are scans and aggregates over the
whole event log. Run inside Postgres they compete with the app's small, hot transactions. Here
the worker attaches Postgres with DuckDB's `postgres` extension, copies the three tables it needs
in one consistent read, does every aggregate inside DuckDB, and writes three small result tables
back. The app only ever reads `trust_scores` (one row per person).

    pip install -r analytics/requirements.txt
    export PINKILOCK_PG_DSN="postgresql://pinkilock_analytics:...@db.<ref>.supabase.co:5432/postgres"
    python analytics/duckdb_pipeline.py                 # compute and write back
    python analytics/duckdb_pipeline.py --dry-run       # compute and print only
    python analytics/duckdb_pipeline.py --snapshot analytics/out/pinkilock.duckdb   # keep a file to explore

Run it every few minutes (cron, a GitHub Action, a Supabase scheduled function calling a job).
It is idempotent: each run replaces what it wrote before.

Trust Score (the behavioural version of src/domain/trust.ts):

    score = round(100 * (kept + 4) / (kept + penalty + 4))
    penalty = 1.0 * early bails + 1.25 * late bails (inside 2 hours of the start) + 1.5 * no-shows

The prior of 4 means a new person starts at 100 and one early bail costs 20 points. Not showing
up costs more than cancelling late, which costs more than cancelling with notice.
"""
from __future__ import annotations

import argparse
import os
import sys

import duckdb

PRIOR = 4
W_EARLY, W_LATE, W_NO_SHOW = 1.0, 1.25, 1.5

EXTRACT = """
create or replace table invites as
  select id, from_id, to_id, idea_id, status::varchar as status, starts_at, locked_at, flaked_by,
         resolved_at, created_at
  from pg.public.invites;
create or replace table events as
  select id, "at" as ts, actor_id, invite_id, type, cast(props as varchar) as props from pg.public.events;
create or replace table profiles as
  select id, created_at from pg.public.profiles;
"""

TRUST = f"""
create or replace table trust_scores as
with kept as (
  select person, count(*) as kept
  from (select from_id as person from invites where status = 'kept'
        union all
        select to_id from invites where status = 'kept')
  group by person
),
flakes as (
  select actor_id as person,
         count(*) filter (where type = 'bailed' and coalesce(json_extract_string(props, '$.late'), 'false') <> 'true') as early_bails,
         count(*) filter (where type = 'bailed' and json_extract_string(props, '$.late') = 'true') as late_bails,
         count(*) filter (where type = 'no_show') as no_shows
  from events
  where type in ('bailed', 'no_show') and actor_id is not null
  group by actor_id
),
-- How fast someone answers an ask sent to them: ask_sent -> their first pinky_out or declined.
answers as (
  select i.to_id as person,
         median(date_diff('second', a.ts, r.ts) / 60.0) as median_answer_minutes
  from invites i
  join events a on a.invite_id = i.id and a.type = 'ask_sent'
  join lateral (
    select min(e.ts) as ts from events e
    where e.invite_id = i.id and e.actor_id = i.to_id and e.type in ('pinky_out', 'declined')
  ) r on r.ts is not null
  group by i.to_id
)
select p.id as profile_id,
       cast(round(100.0 * (coalesce(k.kept, 0) + {PRIOR})
            / (coalesce(k.kept, 0)
               + {W_EARLY} * coalesce(f.early_bails, 0)
               + {W_LATE} * coalesce(f.late_bails, 0)
               + {W_NO_SHOW} * coalesce(f.no_shows, 0)
               + {PRIOR})) as integer) as score,
       cast(coalesce(k.kept, 0) as integer) as kept,
       cast(coalesce(f.early_bails, 0) + coalesce(f.late_bails, 0) + coalesce(f.no_shows, 0) as integer) as flaked,
       cast(coalesce(f.late_bails, 0) as integer) as late_bails,
       cast(coalesce(f.no_shows, 0) as integer) as no_shows,
       round(a.median_answer_minutes, 1) as median_answer_minutes
from profiles p
left join kept k on k.person = p.id
left join flakes f on f.person = p.id
left join answers a on a.person = p.id;
"""

# Pre-date conversion: of the asks sent on a day, how many got a first pinky, a lock, a kept promise.
FUNNEL = """
create or replace table metrics_daily as
with firsts as (
  select invite_id, min(ts) as ts from events where type = 'pinky_out' group by invite_id
)
select cast(i.created_at as date) as day,
       cast(count(*) as integer) as asks_sent,
       cast(count(f.invite_id) as integer) as first_pinkies,
       cast(count(i.locked_at) as integer) as locks,
       cast(count(*) filter (where i.status = 'kept') as integer) as kept,
       cast(count(*) filter (where i.status = 'flaked') as integer) as flaked,
       cast(count(*) filter (where i.status = 'declined') as integer) as declined,
       cast(count(*) filter (where i.status = 'expired') as integer) as expired,
       round(count(i.locked_at) / count(*)::double, 3) as ask_to_lock_rate,
       round(count(*) filter (where i.status = 'kept') / nullif(count(*) filter (where i.status in ('kept', 'flaked')), 0)::double, 3) as lock_to_kept_rate,
       round(median(date_diff('second', i.created_at, i.locked_at) / 60.0), 1) as median_minutes_to_lock
from invites i
left join firsts f on f.invite_id = i.id
group by 1
order by 1;
"""

# Weekly retention: cohort = the week someone joined; active in week N = any event of theirs then.
RETENTION = """
create or replace table retention_weekly as
with cohort as (
  select id as person, cast(date_trunc('week', created_at) as date) as cohort_week from profiles
),
activity as (
  select distinct actor_id as person, cast(date_trunc('week', ts) as date) as week
  from events where actor_id is not null
),
sizes as (select cohort_week, count(*) as cohort_size from cohort group by 1)
select c.cohort_week,
       cast(date_diff('week', c.cohort_week, a.week) as integer) as week_n,
       cast(s.cohort_size as integer) as cohort_size,
       cast(count(distinct a.person) as integer) as active,
       round(count(distinct a.person) / s.cohort_size::double, 3) as rate
from cohort c
join activity a on a.person = c.person and a.week >= c.cohort_week
join sizes s on s.cohort_week = c.cohort_week
group by c.cohort_week, a.week, s.cohort_size
order by 1, 2;
"""

# One Postgres transaction, so the app never reads a half-written set of scores.
LOAD = """
begin;
delete from pg.public.trust_scores;
insert into pg.public.trust_scores (profile_id, score, kept, flaked, late_bails, no_shows, median_answer_minutes)
  select profile_id, score, kept, flaked, late_bails, no_shows, median_answer_minutes from trust_scores;
delete from pg.analytics.metrics_daily;
insert into pg.analytics.metrics_daily (day, asks_sent, first_pinkies, locks, kept, flaked, declined, expired,
                                        ask_to_lock_rate, lock_to_kept_rate, median_minutes_to_lock)
  select * from metrics_daily;
delete from pg.analytics.retention_weekly;
insert into pg.analytics.retention_weekly (cohort_week, week_n, cohort_size, active, rate)
  select * from retention_weekly;
commit;
"""


def run(dsn: str, snapshot: str, dry_run: bool) -> None:
    con = duckdb.connect(snapshot)
    con.execute("install postgres; load postgres;")
    # DuckDB takes the DSN as a string literal in ATTACH, so quote it by hand.
    con.execute("attach '" + dsn.replace("'", "''") + "' as pg (type postgres" + (", read_only" if dry_run else "") + ")")

    # One snapshot of the live tables: every later query runs on DuckDB's copy, not on Postgres.
    con.execute("begin")
    con.execute(EXTRACT)
    con.execute("commit")
    for sql in (TRUST, FUNNEL, RETENTION):
        con.execute(sql)

    counts = {t: con.execute(f"select count(*) from {t}").fetchone()[0] for t in ("events", "invites", "profiles")}
    print(f"read   {counts['events']} events, {counts['invites']} invites, {counts['profiles']} profiles")
    print("\ntrust scores (lowest first)")
    con.sql("select * from trust_scores order by score, kept desc limit 15").show()
    print("pre-date conversion by day")
    con.sql("select * from metrics_daily order by day desc limit 14").show()
    print("weekly retention")
    con.sql("select * from retention_weekly order by cohort_week desc, week_n limit 20").show()

    if dry_run:
        print("dry run: nothing written back")
        return
    try:
        con.execute(LOAD)
    except Exception:
        con.execute("rollback")
        raise
    print(f"wrote  {con.execute('select count(*) from trust_scores').fetchone()[0]} trust scores, "
          f"{con.execute('select count(*) from metrics_daily').fetchone()[0]} daily rows, "
          f"{con.execute('select count(*) from retention_weekly').fetchone()[0]} retention rows")


def main() -> int:
    ap = argparse.ArgumentParser(description="Compute Pinkilock Trust Scores and funnel metrics with DuckDB.")
    ap.add_argument("--dsn", default=os.environ.get("PINKILOCK_PG_DSN"), help="Postgres DSN (or set PINKILOCK_PG_DSN)")
    ap.add_argument("--snapshot", default=":memory:", help="DuckDB file to keep the snapshot in (default: in memory)")
    ap.add_argument("--dry-run", action="store_true", help="compute and print, write nothing back")
    args = ap.parse_args()
    if not args.dsn:
        print("Set PINKILOCK_PG_DSN or pass --dsn.", file=sys.stderr)
        return 2
    run(args.dsn, args.snapshot, args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
