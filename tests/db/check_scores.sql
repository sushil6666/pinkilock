-- After analytics/duckdb_pipeline.py has run on the scenario data.
\set ON_ERROR_STOP on
\pset tuples_only on
-- A: 1 kept, 1 late bail (1.25), 1 no-show (1.5): 100 * 5 / 7.75 = 64.5 -> 65
select t.ok((select (score, kept, flaked, late_bails, no_shows) = (65, 1, 2, 1, 1) from public.trust_scores
  where profile_id = '00000000-0000-0000-0000-00000000000a'), 'A scores 65 with 1 kept, 2 flakes');
select t.ok((select (score, kept, flaked) = (100, 1, 0) from public.trust_scores
  where profile_id = '00000000-0000-0000-0000-00000000000b'), 'B scores 100 with 1 kept');
select t.ok((select (score, kept, flaked) = (100, 0, 0) from public.trust_scores
  where profile_id = '00000000-0000-0000-0000-00000000000c'), 'C scores 100 with nothing finished');
select t.ok((select (asks_sent, locks, kept, flaked, expired) = (4, 3, 1, 2, 1) from analytics.metrics_daily), 'funnel: 4 asks, 3 locks, 1 kept, 2 flaked, 1 expired');
select t.ok((select ask_to_lock_rate = 0.75 and lock_to_kept_rate = 0.333 from analytics.metrics_daily), 'funnel rates 0.75 and 0.333');
select t.ok((select count(*) from analytics.retention_weekly) >= 1, 'retention has rows');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.ok((select trust_score from profile_cards where id = '00000000-0000-0000-0000-00000000000a') = 65, 'the app reads A''s score from profile_cards');
