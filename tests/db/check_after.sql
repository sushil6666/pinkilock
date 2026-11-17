-- After the DuckDB pipeline runs a second time, over the blocks, reports and the deletion.
\set ON_ERROR_STOP on
\pset tuples_only on
select t.ok((select (score, kept, flaked) = (65, 1, 2) from public.trust_scores
  where profile_id = '00000000-0000-0000-0000-00000000000a'), 'A still scores 65: being blocked and reported changes no score');
select t.ok((select (score, kept, flaked) = (100, 1, 0) from public.trust_scores
  where profile_id = '00000000-0000-0000-0000-00000000000b'), 'B still scores 100: blocking ended a locked plan with no penalty');
select t.ok((select (score, kept, flaked) = (100, 1, 0) from public.trust_scores
  where profile_id = '00000000-0000-0000-0000-000000000009'), 'G keeps the promise kept with F after F deleted their account');
select t.ok(not exists (select 1 from public.trust_scores where profile_id = '00000000-0000-0000-0000-00000000000f'), 'F has no score');
select t.ok((select sum(asks_sent) from analytics.metrics_daily) >= 5, 'the funnel still counts');
