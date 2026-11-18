-- After the pipeline has run over what tests/db/attacker.sql did.
\set ON_ERROR_STOP on
\pset tuples_only on
select t.ok((select flaked from public.trust_scores where profile_id = '00000000-0000-0000-0000-0000000000e1') = 3,
  'X''s bail and the two flags on X''s handle are on X''s record');
select t.ok((select flaked from public.trust_scores where profile_id = '00000000-0000-0000-0000-0000000000e2') = 0,
  'X''s bail is not on Y''s record');
-- G8 closed: two promises kept between the same two accounts within 30 days count once.
select t.ok((select kept from public.trust_scores where profile_id = '00000000-0000-0000-0000-0000000000e1') = 1,
  'G8 closed: two kept promises with the same person in a month count as one');
