-- After the pipeline has run over what tests/db/attacker.sql did.
\set ON_ERROR_STOP on
\pset tuples_only on
select t.ok((select flaked from public.trust_scores where profile_id = '00000000-0000-0000-0000-0000000000e1') = 1,
  'X''s bail is on X''s record');
select t.ok((select flaked from public.trust_scores where profile_id = '00000000-0000-0000-0000-0000000000e2') = 0,
  'X''s bail is not on Y''s record');
-- G8: two accounts keeping promises with each other raise both scores without limit.
select t.gap((select kept from public.trust_scores where profile_id = '00000000-0000-0000-0000-0000000000e1') <= 1, 'G8',
  'every kept promise between the same two accounts counts toward a Trust Score');
