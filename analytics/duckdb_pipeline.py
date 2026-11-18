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
              + 1.0 * handles flagged as not working (`bad_contact`, one per person per kept plan, D077;
                written only when a flag still stands after 7 days, D079)

The prior of 4 means a new person starts at 100 and one early bail costs 20 points. Not showing
up costs more than cancelling late, which costs more than cancelling with notice.
"""
from __future__ import annotations

import argparse
import os
import sys

import duckdb

PRIOR = 4
W_EARLY, W_LATE, W_NO_SHOW, W_BAD_CONTACT = 1.0, 1.25, 1.5, 1.0

EXTRACT = """
create or replace table invites as
  select id, from_id, to_id, idea_id, status::varchar as status, starts_at, locked_at, flaked_by,
         resolved_at, created_at
  from pg.public.invites;
create or replace table events as
  select id, "at" as ts, actor_id, invite_id, type, cast(props as varchar) as props from pg.public.events;
create or replace table profiles as
  select id, created_at from pg.public.profiles;
create or replace table accounts as
  select id, linked from pg.analytics.accounts;
create or replace table settings as
  select require_linked from pg.analytics.settings;
create or replace table date_ratings as
  select invite_id, user_id, worth, again, unsafe, "at" as ts from pg.public.date_ratings;
"""

TRUST = f"""
create or replace table trust_scores as
-- Kept promises come from the log, like flakes: when the other person deletes their account the
-- invite goes, but your own `kept` row stays (supabase/migrations/20261117000003_account.sql).
-- Farming (docs/build-plan.md, G8): promises kept with the same person count once per 30-day
-- period, and while the link gate is on, a promise with an account that has no email or phone
-- counts for nothing. An invite that is gone (the other person deleted their account) still counts.
with kept as (
  select e.actor_id as person,
         count(distinct case when i.id is null then cast(e.invite_id as varchar)
                             else cast(least(i.from_id, i.to_id) as varchar) || cast(greatest(i.from_id, i.to_id) as varchar)
                                  || '/' || cast(floor(epoch(e.ts) / (30 * 86400)) as varchar) end) as kept
  from events e
  left join invites i on i.id = e.invite_id
  left join accounts a1 on a1.id = i.from_id
  left join accounts a2 on a2.id = i.to_id
  where e.type = 'kept' and e.actor_id is not null
    and (i.id is null or not (select coalesce(bool_or(require_linked), false) from settings)
         or (coalesce(a1.linked, true) and coalesce(a2.linked, true)))
  group by e.actor_id
),
flakes as (
  select actor_id as person,
         count(*) filter (where type = 'bailed' and coalesce(json_extract_string(props, '$.late'), 'false') <> 'true') as early_bails,
         count(*) filter (where type = 'bailed' and json_extract_string(props, '$.late') = 'true') as late_bails,
         count(*) filter (where type = 'no_show') as no_shows,
         count(*) filter (where type = 'bad_contact') as bad_contacts
  from events
  where type in ('bailed', 'no_show', 'bad_contact') and actor_id is not null
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
               + {W_BAD_CONTACT} * coalesce(f.bad_contacts, 0)
               + {PRIOR})) as integer) as score,
       cast(coalesce(k.kept, 0) as integer) as kept,
       cast(coalesce(f.early_bails, 0) + coalesce(f.late_bails, 0) + coalesce(f.no_shows, 0) + coalesce(f.bad_contacts, 0) as integer) as flaked,
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

# Satisfaction (build plan, target B): of the "Worth showing up?" answers in the last 28 days, the
# share of yes. No rate under 50 answers: too few to be a percentage.
SATISFACTION = """
create or replace table satisfaction_daily as
select current_date as day,
       cast(count(*) as integer) as answers_28d,
       cast(count(*) filter (where worth) as integer) as yes_28d,
       case when count(*) >= 50 then round(count(*) filter (where worth) / count(*)::double, 3) end as rate_28d,
       cast(count(*) filter (where unsafe) as integer) as unsafe_28d
from date_ratings
where ts > now() - interval 28 day;
"""

# One Postgres transaction, so the app never reads a half-written set of scores.
# computed_at is set here, not left to the column default: DuckDB 2 sends NULL for a column it was not given.
LOAD = """
begin;
delete from pg.public.trust_scores;
insert into pg.public.trust_scores (profile_id, score, kept, flaked, late_bails, no_shows, median_answer_minutes, computed_at)
  select profile_id, score, kept, flaked, late_bails, no_shows, median_answer_minutes, now() from trust_scores;
delete from pg.analytics.metrics_daily;
insert into pg.analytics.metrics_daily (day, asks_sent, first_pinkies, locks, kept, flaked, declined, expired,
                                        ask_to_lock_rate, lock_to_kept_rate, median_minutes_to_lock, computed_at)
  select *, now() from metrics_daily;
delete from pg.analytics.satisfaction_daily where day = current_date;
insert into pg.analytics.satisfaction_daily (day, answers_28d, yes_28d, rate_28d, unsafe_28d, computed_at)
  select *, now() from satisfaction_daily;
delete from pg.analytics.retention_weekly;
insert into pg.analytics.retention_weekly (cohort_week, week_n, cohort_size, active, rate, computed_at)
  select *, now() from retention_weekly;
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
    for sql in (TRUST, FUNNEL, RETENTION, SATISFACTION):
        con.execute(sql)

    counts = {t: con.execute(f"select count(*) from {t}").fetchall()[0][0] for t in ("events", "invites", "profiles")}
    print(f"read   {counts['events']} events, {counts['invites']} invites, {counts['profiles']} profiles")
    print("\ntrust scores (lowest first)")
    con.sql("select * from trust_scores order by score, kept desc limit 15").show()
    print("pre-date conversion by day")
    con.sql("select * from metrics_daily order by day desc limit 14").show()
    print("satisfaction, last 28 days")
    con.sql("select * from satisfaction_daily").show()
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
    print(f"wrote  {con.execute('select count(*) from trust_scores').fetchall()[0][0]} trust scores, "
          f"{con.execute('select count(*) from metrics_daily').fetchall()[0][0]} daily rows, "
          f"{con.execute('select count(*) from retention_weekly').fetchall()[0][0]} retention rows")


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
